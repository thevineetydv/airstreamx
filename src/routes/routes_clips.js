/**
 * routes/clips.js
 * AI Clip Generator API routes
 * Add to your Express app: app.use('/api/clips', clipsRouter)
 *
 * Endpoints:
 *   POST /api/clips/upload          — receive video, add to transcription queue
 *   GET  /api/clips/status/:id      — poll processing status        (owner only)
 *   GET  /api/clips/video/:videoId  — get all clips for a video     (owner only)
 *   GET  /api/clips/download/:clipId — get download URL for a clip  (owner only)
 */

import express from "express";
import multer from "multer";
import fs from "fs";
import os from "os";
import path from "path";
import { v4 as uuid } from "uuid";
import pkg from "pg";
const { Pool } = pkg;

// ── Import your existing MinIO client and auth middleware ─────────────────────
// Adjust these paths to match your project structure
import { minioClient, MINIO_BUCKET } from "../config/minio.js";
import { verifyFirebaseToken } from "../middleware/auth.js";
import { transcriptionQueue } from "../queues/clipQueues.js";

const router = express.Router();

// PostgreSQL — reuse your existing pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Multer: stream the upload to a temp file on DISK (max 500MB).
// It used to keep the whole file in RAM (memoryStorage) — on the 1 GB EC2
// box a single large upload, or two at once, could exhaust memory and take
// the whole API down.
const CLIP_TMP_DIR = path.join(os.tmpdir(), "airstreamx-clip-uploads");
fs.mkdirSync(CLIP_TMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: CLIP_TMP_DIR,
    filename: (_req, _file, cb) => cb(null, `${uuid()}.upload`),
  }),
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only video files are allowed"));
  },
});

// Keep only safe characters from the user's file name for the storage key
function safeFileName(name) {
  const base = path.basename(String(name || "video")).replace(/[^a-zA-Z0-9._-]+/g, "_");
  return base.slice(-80) || "video";
}

const sameEmail = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/clips/upload
// Receives the video, uploads to MinIO, creates DB record, queues job
// ─────────────────────────────────────────────────────────────────────────────
router.post("/upload", verifyFirebaseToken, upload.single("video"), async (req, res) => {
  const file = req.file;
  let clipVideoId = null;
  try {
    if (!file) return res.status(400).json({ error: "No video file provided" });

    const title = String(req.body.title || "").trim().slice(0, 200);
    const userEmail = req.user.email;                    // from Firebase token
    const objectName = `clip-inputs/${uuid()}-${safeFileName(file.originalname)}`;

    // ── 1. Stream the temp file to MinIO (never loaded into memory) ──────
    await minioClient.fPutObject(MINIO_BUCKET, objectName, file.path, {
      "Content-Type": file.mimetype,
    });

    const videoUrl = `${process.env.MINIO_PUBLIC_URL}/${MINIO_BUCKET}/${objectName}`;

    // ── 2. Create record in clip_videos table ─────────────────────────────
    const result = await pool.query(
      `INSERT INTO clip_videos
         (user_email, title, minio_key, video_url, status)
       VALUES ($1, $2, $3, $4, 'transcribing')
       RETURNING id`,
      [userEmail, title || safeFileName(file.originalname), objectName, videoUrl]
    );
    clipVideoId = result.rows[0].id;

    // ── 3. Add job to BullMQ transcription queue ──────────────────────────
    await transcriptionQueue.add(
      "transcribe",
      { clipVideoId, minioKey: objectName, videoUrl },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
    );

    // ── 4. Respond immediately — processing happens async ─────────────────
    res.status(202).json({
      message: "Video uploaded! AI processing has started.",
      clipVideoId,
    });

  } catch (err) {
    console.error("[clips/upload] Error:", err);
    // Queueing failed after the row was created: don't leave it "transcribing" forever
    if (clipVideoId) {
      pool.query(
        `UPDATE clip_videos SET status = 'error', error_msg = 'Could not start processing. Please try again.'
         WHERE id = $1`,
        [clipVideoId]
      ).catch(() => {});
    }
    res.status(500).json({ error: "Upload failed. Please try again." });
  } finally {
    // Always delete the temp file
    if (file?.path) fs.promises.unlink(file.path).catch(() => {});
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clips/status/:id
// Frontend polls this every 3s to know which stage we are in
// ─────────────────────────────────────────────────────────────────────────────
// Only the uploader may see their job (ids are sequential, so anyone could
// otherwise read every creator's clips by counting up).
router.get("/status/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });
    const result = await pool.query(
      `SELECT id, status, error_msg, created_at, processed_at, user_email
       FROM clip_videos WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (!row || !sameEmail(row.user_email, req.user.email)) return res.status(404).json({ error: "Not found" });
    delete row.user_email;
    res.set("Cache-Control", "private, no-store");
    res.json(row);
  } catch (err) {
    console.error("[clips/status] Error:", err);
    res.status(500).json({ error: "Failed to fetch status" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clips/video/:videoId
// Returns all generated clips for a video, sorted by viral score
// ─────────────────────────────────────────────────────────────────────────────
router.get("/video/:videoId", verifyFirebaseToken, async (req, res) => {
  try {
    const videoId = parseInt(req.params.videoId);
    if (!Number.isInteger(videoId)) return res.status(400).json({ error: "Invalid id" });
    const result = await pool.query(
      `SELECT s.id, s.title, s.start_time, s.end_time, s.duration,
              s.clip_url, s.thumbnail_url, s.viral_score, s.hook_text, s.status
       FROM clip_segments s
       JOIN clip_videos v ON v.id = s.clip_video_id
       WHERE s.clip_video_id = $1 AND LOWER(v.user_email) = LOWER($2)
       ORDER BY s.viral_score DESC`,
      [videoId, req.user.email]
    );
    res.set("Cache-Control", "private, no-store");
    res.json({ clips: result.rows });
  } catch (err) {
    console.error("[clips/video] Error:", err);
    res.status(500).json({ error: "Failed to fetch clips" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clips/download/:clipId
// Returns a short-lived presigned download URL from MinIO
// ─────────────────────────────────────────────────────────────────────────────
router.get("/download/:clipId", verifyFirebaseToken, async (req, res) => {
  try {
    const clipId = parseInt(req.params.clipId);
    if (!Number.isInteger(clipId)) return res.status(400).json({ error: "Invalid id" });
    // Only the uploader can download their clips
    const result = await pool.query(
      `SELECT s.minio_key, s.title
       FROM clip_segments s
       JOIN clip_videos v ON v.id = s.clip_video_id
       WHERE s.id = $1 AND LOWER(v.user_email) = LOWER($2)`,
      [clipId, req.user.email]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Clip not found" });

    const { minio_key, title } = result.rows[0];

    // Presigned URL valid for 1 hour
    const url = await minioClient.presignedGetObject(MINIO_BUCKET, minio_key, 3600);
    res.json({ url, filename: `${title || "clip"}.mp4` });
  } catch (err) {
    console.error("[clips/download] Error:", err);
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

export default router;
