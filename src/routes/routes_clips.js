import "dotenv/config";
/**
 * routes/clipRoutes.js
 * DEPLOY TO: ~/streamlite-backend/routes/clipRoutes.js
 */

import express          from "express";
import cors             from "cors";
import multer           from "multer";
import { v4 as uuid }   from "uuid";
import http             from "http";
import fs               from "fs";
import os               from "os";
import path             from "path";
import { pool }         from "../db.js";
import { Client as MinioClient } from "minio";
import { verifyFirebaseToken }   from "../middleware/verifyFirebaseToken.js";
import { transcriptionQueue }    from "../clipQueues.js";

// -- Router declared FIRST — then router.use() ---------------------------------
const router = express.Router();

// -- CORS — allow all frontend origins ----------------------------------------
router.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'https://www.airstreamx.com',
    'https://airstreamx.com',
    'https://backend.airstreamx.com',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// -- MinIO client --------------------------------------------------------------
const agent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const minio = new MinioClient({
 endPoint:        process.env.MINIO_ENDPOINT || "127.0.0.1",
  port:           parseInt(process.env.MINIO_PORT) || 9000,
  useSSL:         process.env.MINIO_USE_SSL === "true",
  accessKey:      process.env.MINIO_ACCESS_KEY,
  secretKey:      process.env.MINIO_SECRET_KEY,
  pathStyle:      true,
  transportAgent: agent,
});

const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || "https://backend.airstreamx.com";
const CLIP_BUCKET = "clip-generator";

// -- Ensure clip-generator bucket exists on startup ---------------------------
(async () => {
  try {
    const exists = await minio.bucketExists(CLIP_BUCKET);
    if (!exists) {
      await minio.makeBucket(CLIP_BUCKET);
      const policy = {
        Version: "2012-10-17",
        Statement: [{ Effect: "Allow", Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${CLIP_BUCKET}/*`] }]
      };
      await minio.setBucketPolicy(CLIP_BUCKET, JSON.stringify(policy));
      console.log("? clip-generator MinIO bucket created");
    }
  } catch (err) {
    console.error("??  clip-generator bucket init error:", err.message);
  }
})();

// -- Multer: stream uploads to a temp file on DISK, max 500MB -----------------
// It used to keep the whole file in RAM (memoryStorage). On the 1 GB EC2
// box one large upload — or two at once — could exhaust memory and take the
// whole API down. Files now go to disk and are streamed to MinIO.
const CLIP_TMP_DIR = path.join(os.tmpdir(), "airstreamx-clip-uploads");
fs.mkdirSync(CLIP_TMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: CLIP_TMP_DIR,
    filename: (_req, _file, cb) => cb(null, `${uuid()}.upload`),
  }),
  limits:  { fileSize: 500 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Only video files are allowed"));
  },
});

// Clip jobs are private to the creator who uploaded them. Ids are
// sequential, so without this anyone could read every creator's clips.
const sameEmail = (a, b) => String(a || "").toLowerCase() === String(b || "").toLowerCase();
const toId = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

// -----------------------------------------------------------------------------
// POST /clips/upload
// -----------------------------------------------------------------------------
router.post("/upload", verifyFirebaseToken, upload.single("file"), async (req, res) => {
  const file = req.file;
  let clipVideoId = null;
  try {
    if (!file) return res.status(400).json({ error: "No video file provided" });

    const userEmail  = req.user.email;
    const title      = String(req.body.title || file.originalname).substring(0, 255);
    const objectName = `inputs/${uuid()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100)}`;

    // 1. Stream the temp file to MinIO (never loaded into memory)
    await minio.fPutObject(CLIP_BUCKET, objectName, file.path, {
      "Content-Type": file.mimetype,
    });

    const videoUrl = `${PUBLIC_BASE}/clip-file/${objectName}`;

    // 2. Create DB record
    const result = await pool.query(
      `INSERT INTO clip_videos (user_email, title, minio_key, video_url, status)
       VALUES ($1, $2, $3, $4, 'transcribing') RETURNING id`,
      [userEmail, title, objectName, videoUrl]
    );
    clipVideoId = result.rows[0].id;

    // 3. Queue transcription job
    await transcriptionQueue.add(
      "transcribe",
      { clipVideoId, minioKey: objectName, videoUrl },
      { priority: 1, jobId: `clip-${clipVideoId}` }
    );

    res.status(202).json({
      success: true,
      message: "Video uploaded! AI processing has started.",
      clipVideoId,
    });

  } catch (err) {
    console.error("[clips/upload]", err);
    // Queueing failed after the row was created: don't leave it "transcribing" forever
    if (clipVideoId) {
      pool.query(
        `UPDATE clip_videos SET status = 'error',
           error_msg = 'Could not start processing. Please try again.'
         WHERE id = $1`,
        [clipVideoId]
      ).catch(() => {});
    }
    res.status(500).json({ error: "Upload failed. Please try again." });
  } finally {
    // Always remove the temp file
    if (file?.path) fs.promises.unlink(file.path).catch(() => {});
  }
});

// -----------------------------------------------------------------------------
// GET /clips/status/:id   (owner only)
// -----------------------------------------------------------------------------
router.get("/status/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const id = toId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const result = await pool.query(
      `SELECT id, status, error_msg, created_at, processed_at, user_email
       FROM clip_videos WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (!row || !sameEmail(row.user_email, req.user.email)) {
      return res.status(404).json({ error: "Not found" });
    }
    delete row.user_email;
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, ...row });
  } catch (err) {
    console.error("[clips/status]", err);
    res.status(500).json({ error: "Status check failed" });
  }
});

// -----------------------------------------------------------------------------
// GET /clips/video/:videoId   (owner only)
// -----------------------------------------------------------------------------
router.get("/video/:videoId", verifyFirebaseToken, async (req, res) => {
  try {
    const id = toId(req.params.videoId);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const result = await pool.query(
      `SELECT s.id, s.title, s.start_time, s.end_time, s.duration,
              s.clip_url, s.thumbnail_url, s.viral_score, s.hook_text, s.status
       FROM clip_segments s
       JOIN clip_videos v ON v.id = s.clip_video_id
       WHERE s.clip_video_id = $1 AND LOWER(v.user_email) = LOWER($2)
       ORDER BY s.viral_score DESC NULLS LAST`,
      [id, req.user.email]
    );
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, clips: result.rows });
  } catch (err) {
    console.error("[clips/video]", err);
    res.status(500).json({ error: "Failed to fetch clips" });
  }
});

// Pipe a MinIO stream to the response. A read error mid-stream used to be
// an unhandled "error" event, which crashes the whole Node process.
function pipeObject(stream, res) {
  stream.on("error", (err) => {
    console.error("[clips] stream error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: "Failed to read clip" });
    else res.destroy(err);
  });
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

// -----------------------------------------------------------------------------
// GET /clips/download/:clipId   (owner only)
// -----------------------------------------------------------------------------
router.get("/download/:clipId", verifyFirebaseToken, async (req, res) => {
  try {
    const id = toId(req.params.clipId);
    if (!id) return res.status(400).json({ error: "Invalid id" });
    const result = await pool.query(
      `SELECT s.minio_key, s.title
       FROM clip_segments s
       JOIN clip_videos v ON v.id = s.clip_video_id
       WHERE s.id = $1 AND LOWER(v.user_email) = LOWER($2)`,
      [id, req.user.email]
    );
    if (!result.rows.length) return res.status(404).json({ error: "Clip not found" });

    const { minio_key, title } = result.rows[0];
    // Quotes / newlines in a title made an invalid header (500 error)
    const safeName = String(title || "clip").replace(/[^\w .-]+/g, "").trim().slice(0, 80) || "clip";

    const stream = await minio.getObject(CLIP_BUCKET, minio_key);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.mp4"`);
    pipeObject(stream, res);

  } catch (err) {
    console.error("[clips/download]", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to download clip" });
  }
});

// Video player ke liye stream route (public: used directly as <video src>;
// keys contain a random uuid)
router.get("/stream/*", async (req, res) => {
  try {
    const minioKey = req.params[0];
    if (!minioKey || minioKey.includes("..")) return res.status(404).json({ error: "Clip not found" });
    const stream = await minio.getObject(CLIP_BUCKET, minioKey);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "public, max-age=3600");
    pipeObject(stream, res);
  } catch (err) {
    if (!res.headersSent) res.status(404).json({ error: "Clip not found" });
  }
});

export default router;