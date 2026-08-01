/**
 * routes/clips.js
 * AI Clip Generator API routes
 * Add to your Express app: app.use('/api/clips', clipsRouter)
 *
 * Endpoints:
 *   POST /api/clips/upload          — receive video, add to transcription queue
 *   GET  /api/clips/status/:id      — poll processing status
 *   GET  /api/clips/video/:videoId  — get all clips for a video
 *   GET  /api/clips/download/:clipId — get download URL for a clip
 */

import express from "express";
import multer from "multer";
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

// Multer: store in memory, max 500MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only video files are allowed"));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/clips/upload
// Receives the video, uploads to MinIO, creates DB record, queues job
// ─────────────────────────────────────────────────────────────────────────────
router.post("/upload", verifyFirebaseToken, upload.single("video"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No video file provided" });

    const { title } = req.body;
    const userEmail = req.user.email;                    // from Firebase token
    const objectName = `clip-inputs/${uuid()}-${file.originalname}`;

    // ── 1. Upload original video to MinIO ─────────────────────────────────
    await minioClient.putObject(
      MINIO_BUCKET,
      objectName,
      file.buffer,
      file.size,
      { "Content-Type": file.mimetype }
    );

    const videoUrl = `${process.env.MINIO_PUBLIC_URL}/${MINIO_BUCKET}/${objectName}`;

    // ── 2. Create record in clip_videos table ─────────────────────────────
    const result = await pool.query(
      `INSERT INTO clip_videos
         (user_email, title, minio_key, video_url, status)
       VALUES ($1, $2, $3, $4, 'transcribing')
       RETURNING id`,
      [userEmail, title || file.originalname, objectName, videoUrl]
    );
    const clipVideoId = result.rows[0].id;

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
    res.status(500).json({ error: "Upload failed", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clips/status/:id
// Frontend polls this every 3s to know which stage we are in
// ─────────────────────────────────────────────────────────────────────────────
router.get("/status/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT id, status, error_msg, created_at, processed_at
       FROM clip_videos WHERE id = $1`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("[clips/status] Error:", err);
    res.status(500).json({ error: "Failed to fetch status", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clips/video/:videoId
// Returns all generated clips for a video, sorted by viral score
// ─────────────────────────────────────────────────────────────────────────────
router.get("/video/:videoId", async (req, res) => {
  try {
    const { videoId } = req.params;
    const result = await pool.query(
      `SELECT id, title, start_time, end_time, duration,
              clip_url, thumbnail_url, viral_score, hook_text, status
       FROM clip_segments
       WHERE clip_video_id = $1
       ORDER BY viral_score DESC`,
      [videoId]
    );
    res.json({ clips: result.rows });
  } catch (err) {
    console.error("[clips/video] Error:", err);
    res.status(500).json({ error: "Failed to fetch clips", detail: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clips/download/:clipId
// Returns a short-lived presigned download URL from MinIO
// ─────────────────────────────────────────────────────────────────────────────
router.get("/download/:clipId", verifyFirebaseToken, async (req, res) => {
  try {
    const { clipId } = req.params;
    const result = await pool.query(
      `SELECT minio_key, title FROM clip_segments WHERE id = $1`,
      [clipId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Clip not found" });

    const { minio_key, title } = result.rows[0];

    // Presigned URL valid for 1 hour
    const url = await minioClient.presignedGetObject(MINIO_BUCKET, minio_key, 3600);
    res.json({ url, filename: `${title || "clip"}.mp4` });
  } catch (err) {
    console.error("[clips/download] Error:", err);
    res.status(500).json({ error: "Failed to generate download URL", detail: err.message });
  }
});

export default router;
