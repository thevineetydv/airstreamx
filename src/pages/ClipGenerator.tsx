import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Scissors, Upload, Loader2, CheckCircle, AlertCircle,
  Download, Play, Sparkles, Clock,
  ChevronRight, Film, Zap, RefreshCw, X, Volume2, VolumeX,
  Share2, ExternalLink,
} from "lucide-react";
import { getAuth } from "firebase/auth";
import { API_URL } from "../utils/constants";

// Direct upload URL — bypasses Cloudflare for speed
const DIRECT_UPLOAD_URL = import.meta.env.VITE_DIRECT_UPLOAD_URL || API_URL;

// Matches the "up to 500MB" text in the dropzone — previously the
// dropzone advertised this limit but nothing actually enforced it,
// so an oversized file would silently get accepted and only fail
// later, mid-upload, with a confusing error.
const MAX_SOURCE_VIDEO_BYTES = 500 * 1024 * 1024;

// ─── Types ────────────────────────────────────────────────────────────────────
interface Clip {
  id: number;
  title: string;
  start_time: number;
  end_time: number;
  duration: number;
  clip_url: string;
  thumbnail_url: string;
  viral_score: number;
  hook_text: string;
  status: string;
}

type Stage =
  | "idle"
  | "uploading"
  | "transcribing"
  | "detecting"
  | "generating"
  | "done"
  | "error";

type UploadState = "idle" | "uploading" | "done" | "error";

const STAGE_INFO: Record<Stage, { label: string; icon: string }> = {
  idle: { label: "Ready", icon: "✂️" },
  uploading: { label: "Uploading video…", icon: "⬆️" },
  transcribing: { label: "Transcribing audio (Whisper)…", icon: "🎙️" },
  detecting: { label: "Finding viral moments (GPT-4o)…", icon: "🧠" },
  generating: { label: "Cutting & formatting clips (FFmpeg)…", icon: "🎬" },
  done: { label: "Clips ready!", icon: "🎉" },
  error: { label: "Something went wrong", icon: "❌" },
};

const ORDERED_STAGES: Stage[] = [
  "uploading", "transcribing", "detecting", "generating", "done"
];

function scoreStyle(score: number) {
  if (score >= 80) return { bg: "rgba(16,185,129,0.12)", color: "#10b981", badge: "🔥 Hot" };
  if (score >= 60) return { bg: "rgba(245,158,11,0.12)", color: "#f59e0b", badge: "⚡ Good" };
  return { bg: "rgba(100,116,139,0.12)", color: "#94a3b8", badge: "💡 Decent" };
}

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Upload to AirStreamX Shorts ─────────────────────────────────────────────
async function uploadClipToShorts(
  clip: Clip,
  onProgress: (p: number) => void,
  xhrRef?: React.MutableRefObject<XMLHttpRequest | null>,
): Promise<{ success: boolean; videoId?: string | number; error?: string; cancelled?: boolean }> {
  try {
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { success: false, error: "Not logged in" };

    // Step 1 — fetch the clip file from clip_url
    onProgress(10);
    const clipRes = await fetch(clip.clip_url);
    if (!clipRes.ok) return { success: false, error: "Could not fetch clip file" };
    const blob = await clipRes.blob();
    const file = new File([blob], `${clip.title || `clip-${clip.id}`}.mp4`, { type: "video/mp4" });

    onProgress(30);

    // Step 2 — upload to /upload endpoint (same as normal video upload)
    const formData = new FormData();
    formData.append("file", file);
    // Build a better title from hook_text or time range
    const clipTitle = (() => {
      if (clip.title && clip.title !== `Clip ${clip.id}` && !clip.title.match(/^Clip \d+$/)) {
        return clip.title; // AI gave a real title
      }
      if (clip.hook_text && clip.hook_text.length > 5) {
        // Use hook text as title, truncated to 80 chars
        return clip.hook_text.replace(/^["']|["']$/g, "").substring(0, 80).trim();
      }
      // Fallback: time range based title
      return `Short Clip ${fmtTime(clip.start_time)}-${fmtTime(clip.end_time)}`;
    })();

    formData.append("title", clipTitle);
    formData.append("description", clip.hook_text ? `"${clip.hook_text}"

AI-generated short clip` : "AI-generated short clip");
    formData.append("category", "Shorts");

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const p = 30 + Math.round((e.loaded / e.total) * 60);
          onProgress(p);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const data = JSON.parse(xhr.responseText);
          onProgress(100);
          resolve({ success: true, videoId: data.videoId || data.video?.id });
        } else {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve({ success: false, error: data.error || "Upload failed" });
          } catch {
            resolve({ success: false, error: "Upload failed" });
          }
        }
      };

      xhr.onerror = () => resolve({ success: false, error: "Network error" });
      xhr.onabort = () => resolve({ success: false, cancelled: true });

      if (xhrRef) xhrRef.current = xhr;
      xhr.open("POST", `${DIRECT_UPLOAD_URL}/upload`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.send(formData);
    });
  } catch (err: any) {
    return { success: false, error: err.message || "Unknown error" };
  }
}

// ─── Individual Clip Card ─────────────────────────────────────────────────────
function ClipCard({ clip, index }: { clip: Clip; index: number }) {
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedId, setUploadedId] = useState<string | number | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [errorReason, setErrorReason] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const sc = scoreStyle(clip.viral_score);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); }
    else { v.pause(); setPlaying(false); }
  };

  const handleDownload = async () => {
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`${API_URL}/clips/download/${clip.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const a = document.createElement("a");
      a.href = data.url;
      a.download = `${clip.title || `clip-${clip.id}`}.mp4`;
      a.click();
    } catch {
      window.open(clip.clip_url, "_blank");
    }
  };

  const handleUploadToShorts = async () => {
    if (uploadState === "uploading") return;
    setUploadState("uploading");
    setUploadProgress(0);

    const result = await uploadClipToShorts(clip, setUploadProgress, xhrRef);

    if (result.cancelled) {
      setUploadState("idle");
      setUploadProgress(0);
      return;
    }
    if (result.success) {
      setUploadState("done");
      setUploadedId(result.videoId || null);
    } else {
      setUploadState("error");
      setErrorReason(result.error || "Unknown error");
      console.error("Upload to Shorts failed:", result.error);
    }
  };

  const clipPageUrl = uploadedId
    ? `${window.location.origin}/shorts/${uploadedId}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07 }}
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {/* 9:16 video preview */}
      <div className="relative bg-black" style={{ paddingBottom: "177.78%" }}>
        {clip.clip_url ? (
          <>
            <video
              ref={videoRef}
              src={clip.clip_url}
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: "cover" }}
              loop
              muted={muted}
              poster={clip.thumbnail_url || undefined}
              onEnded={() => setPlaying(false)}
            />
            <div
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={togglePlay}
            >
              <AnimatePresence>
                {!playing && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{
                      background: "rgba(0,0,0,0.6)",
                      backdropFilter: "blur(8px)",
                      border: "1.5px solid rgba(255,255,255,0.3)",
                    }}
                  >
                    <Play className="w-6 h-6 text-white ml-1" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mute toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                const next = !muted;
                setMuted(next);
                if (videoRef.current) videoRef.current.muted = next;
              }}
              className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)" }}
            >
              {muted
                ? <VolumeX className="w-3.5 h-3.5 text-white" />
                : <Volume2 className="w-3.5 h-3.5 text-white" />}
            </button>

            {/* Duration badge */}
            <div
              className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md text-white text-[11px] font-semibold"
              style={{ background: "rgba(0,0,0,0.6)" }}
            >
              {fmtTime(clip.duration)}
            </div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-white/20 animate-spin" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4 space-y-2.5 flex flex-col flex-1">
        <div className="flex items-center justify-between">
          <span
            className="text-[11px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: sc.bg, color: sc.color }}
          >
            {sc.badge} {clip.viral_score}/100
          </span>
          <span className="text-white/30 text-[11px]">
            {fmtTime(clip.start_time)}–{fmtTime(clip.end_time)}
          </span>
        </div>

        <p className="text-white text-sm font-semibold line-clamp-2 leading-snug flex-1">
          {clip.title || `Clip ${clip.id}`}
        </p>

        {clip.hook_text && (
          <p className="text-white/40 text-xs italic line-clamp-2">
            "{clip.hook_text}"
          </p>
        )}

        {/* ── Upload to AirStreamX Shorts ── */}
        {uploadState === "idle" && (
          <button
            onClick={handleUploadToShorts}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-white text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
            style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}
          >
            <Upload className="w-4 h-4" />
            Upload to Shorts
          </button>
        )}

        {uploadState === "uploading" && (
          <div className="w-full space-y-1.5">
            <div className="flex justify-between text-xs text-white/40">
              <span className="flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Uploading to Shorts…
              </span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-1.5 rounded-full transition-all duration-300"
                style={{
                  background: "linear-gradient(to right, #dc2626, #b91c1c)",
                  width: `${uploadProgress}%`,
                }}
              />
            </div>
            {/* Cancel button */}
            <button
              onClick={() => {
                xhrRef.current?.abort();
                setUploadState("idle");
                setUploadProgress(0);
              }}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-white/40 text-xs hover:text-red-400 hover:bg-red-500/10 transition"
            >
              <X className="w-3 h-3" /> Cancel upload
            </button>
          </div>
        )}

        {uploadState === "done" && (
          <div className="space-y-2">
            {/* Success message */}
            <div
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}
            >
              <CheckCircle className="w-4 h-4" />
              Uploaded to Shorts! ✅
            </div>

            {/* View on AirStreamX */}
            {clipPageUrl && (
              <button
                onClick={() => navigate(`/shorts/${uploadedId}`)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-white text-xs font-medium transition hover:opacity-80"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View on AirStreamX
              </button>
            )}

            {/* Share link */}
            <button
              onClick={() => setShowShare(!showShare)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-white/50 text-xs font-medium transition hover:text-white hover:bg-white/5"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share link
            </button>

            {/* Share options */}
            <AnimatePresence>
              {showShare && clipPageUrl && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    {[
                      {
                        label: "WhatsApp",
                        color: "#25D366",
                        href: `https://wa.me/?text=${encodeURIComponent(`Check this out: ${clipPageUrl}`)}`,
                      },
                      {
                        label: "Twitter/X",
                        color: "#1DA1F2",
                        href: `https://twitter.com/intent/tweet?url=${encodeURIComponent(clipPageUrl)}&text=${encodeURIComponent(clip.title || "Check this clip!")}`,
                      },
                      {
                        label: "Telegram",
                        color: "#229ED9",
                        href: `https://t.me/share/url?url=${encodeURIComponent(clipPageUrl)}&text=${encodeURIComponent(clip.title || "")}`,
                      },
                      {
                        label: "Copy link",
                        color: "#6366f1",
                        href: null,
                        onClick: () => {
                          navigator.clipboard.writeText(clipPageUrl);
                        },
                      },
                    ].map((item) => (
                      item.href ? (
                        <a
                          key={item.label}
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center py-1.5 rounded-lg text-white text-[11px] font-medium transition hover:opacity-80"
                          style={{ background: `${item.color}22`, border: `1px solid ${item.color}44`, color: item.color }}
                        >
                          {item.label}
                        </a>
                      ) : (
                        <button
                          key={item.label}
                          onClick={item.onClick}
                          className="flex items-center justify-center py-1.5 rounded-lg text-[11px] font-medium transition hover:opacity-80"
                          style={{ background: `${item.color}22`, border: `1px solid ${item.color}44`, color: item.color }}
                        >
                          {item.label}
                        </button>
                      )
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {uploadState === "error" && (
          <div className="space-y-2">
            <div
              className="w-full flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-sm"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <div className="flex items-center gap-2" style={{ minHeight: "40px", color: "#f87171" }}>
                <AlertCircle className="w-4 h-4" />
                Upload failed
              </div>
              {errorReason && (
                <p className="text-[10px] text-red-400/60 px-2 text-center line-clamp-2">
                  {errorReason}
                </p>
              )}
            </div>
            <button
              onClick={() => { setUploadState("idle"); setErrorReason(""); }}
              className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-white text-xs font-medium transition hover:opacity-80"
              style={{ background: "rgba(220,38,38,0.15)", border: "1px solid rgba(220,38,38,0.3)" }}
            >
              <RefreshCw className="w-3 h-3" /> Try again
            </button>
          </div>
        )}

        {/* Download button — always visible */}
        <button
          onClick={handleDownload}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-white/50 text-xs font-medium transition hover:text-white hover:bg-white/5"
        >
          <Download className="w-3.5 h-3.5" />
          Download MP4
        </button>
      </div>
    </motion.div>
  );
}

// ─── Progress Steps ───────────────────────────────────────────────────────────
function StageProgress({ stage }: { stage: Stage }) {
  const currentIdx = ORDERED_STAGES.indexOf(stage);
  return (
    <div className="space-y-4 w-full">
      {ORDERED_STAGES.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const info = STAGE_INFO[s];
        return (
          <div key={s} className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm transition-all duration-300"
              style={{
                background: done ? "#10b981" : active ? "#dc2626" : "rgba(255,255,255,0.06)",
                border: `1.5px solid ${done ? "#10b981" : active ? "#dc2626" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              {done
                ? "✓"
                : active
                  ? <Loader2 className="w-4 h-4 text-white animate-spin" />
                  : <span className="text-white/20 text-xs">{i + 1}</span>}
            </div>
            <span
              className="text-sm transition-all duration-300"
              style={{
                color: done ? "#10b981" : active ? "white" : "rgba(255,255,255,0.2)",
              }}
            >
              {info.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ClipGenerator() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [fileError, setFileError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const validateAndSetFile = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      setFileError("Only video files are allowed");
      return;
    }
    if (f.size > MAX_SOURCE_VIDEO_BYTES) {
      setFileError(`Maximum file size is 500MB (this file is ${(f.size / 1024 / 1024).toFixed(0)}MB)`);
      return;
    }
    setFileError("");
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    validateAndSetFile(e.dataTransfer.files[0]);
  }, []);

  const startPolling = (id: number) => {
    let done = false;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/clips/status/${id}`);
        const data = await res.json();
        const s = data.status as Stage;
        setStage(s);
        if (s === "done") {
          done = true;
          clearInterval(pollRef.current!);
          fetchClips(id);
        }
        if (s === "error") {
          done = true;
          clearInterval(pollRef.current!);
          setErrorMsg(data.error_msg || "Processing failed.");
        }
      } catch { }
    }, 3000);

    // Safety net — without this, a stuck job (e.g. Whisper/GPT-4o hang)
    // polls forever with the user staring at a stage spinner indefinitely.
    // 20 minutes gives real headroom past the advertised "2-5 min for a
    // 1-hour video" for longer uploads, while still eventually surfacing
    // a clear error instead of silence.
    setTimeout(() => {
      if (done) return;
      clearInterval(pollRef.current!);
      setStage("error");
      setErrorMsg("Processing is taking much longer than expected. Please try again with a shorter video, or check back later.");
    }, 20 * 60 * 1000);
  };

  const fetchClips = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/clips/video/${id}`);
      const data = await res.json();
      setClips(data.clips || []);
    } catch (err) {
      console.error("fetchClips failed:", err);
    }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleUpload = async () => {
    if (!file) return;
    const auth = getAuth();
    if (!auth.currentUser) { navigate("/"); return; }

    setStage("uploading");
    setUploadProgress(0);
    setErrorMsg("");

    const token = await auth.currentUser.getIdToken();
    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", file.name.replace(/\.[^/.]+$/, ""));

    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 202) {
        const data = JSON.parse(xhr.responseText);
        setStage("transcribing");
        startPolling(data.clipVideoId);
      } else {
        setStage("error");
        try {
          const data = JSON.parse(xhr.responseText);
          setErrorMsg(data.error || "Upload failed.");
        } catch {
          setErrorMsg("Upload failed. Check the console for details.");
        }
      }
    };

    xhr.onerror = () => {
      setStage("error");
      setErrorMsg("Network error during upload.");
    };

    xhr.open("POST", `${API_URL}/clips/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  };

  const reset = () => {
    setFile(null);
    setStage("idle");
    setClips([]);
    setErrorMsg("");
    setUploadProgress(0);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const isProcessing = ["uploading", "transcribing", "detecting", "generating"].includes(stage);

  return (
    <div className="min-h-screen pb-20 md:pb-8" style={{ background: "#0a0a0a" }}>
      <div className="max-w-6xl mx-auto px-4 pt-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}
            >
              <Scissors className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">AI Clip Generator</h1>
              <p className="text-white/40 text-sm">Turn long videos into viral short clips automatically</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {[
              { icon: <Zap className="w-3 h-3" />, text: "Auto-transcription" },
              { icon: <Sparkles className="w-3 h-3" />, text: "GPT-4o viral detection" },
              { icon: <Film className="w-3 h-3" />, text: "9:16 vertical format" },
              { icon: <Clock className="w-3 h-3" />, text: "Burned subtitles" },
              { icon: <Upload className="w-3 h-3" />, text: "Upload to AirStreamX" },
            ].map(f => (
              <span
                key={f.text}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs text-white/50"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {f.icon}{f.text}
              </span>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">

          {/* IDLE */}
          {stage === "idle" && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <div
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => fileRef.current?.click()}
                className="w-full rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all"
                style={{
                  border: `2px dashed ${dragOver ? "#dc2626" : file ? "#b91c1c" : "rgba(255,255,255,0.1)"}`,
                  background: dragOver ? "rgba(220,38,38,0.05)" : file ? "rgba(185,28,28,0.05)" : "rgba(255,255,255,0.02)",
                  minHeight: 260,
                  padding: "48px 24px",
                }}
              >
                {file ? (
                  <>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: "rgba(220,38,38,0.15)" }}>
                      <Film className="w-7 h-7 text-red-400" />
                    </div>
                    <p className="text-white font-semibold text-lg mb-1">{file.name}</p>
                    <p className="text-white/40 text-sm">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setFile(null); }}
                      className="mt-3 text-white/30 hover:text-white/60 text-xs flex items-center gap-1 transition"
                    >
                      <X className="w-3 h-3" /> Remove
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3"
                      style={{ background: "rgba(255,255,255,0.05)" }}>
                      <Upload className="w-7 h-7 text-white/30" />
                    </div>
                    <p className="text-white font-semibold text-lg mb-1">
                      {dragOver ? "Drop it here!" : "Drop your video or click to browse"}
                    </p>
                    <p className="text-white/30 text-sm">MP4, MOV, MKV — up to 500MB</p>
                    <p className="text-white/20 text-xs mt-1">Podcasts · Interviews · Tutorials · Lectures</p>
                  </>
                )}
                <input ref={fileRef} type="file" accept="video/*" className="hidden"
                  onChange={(e) => validateAndSetFile(e.target.files?.[0])} />
              </div>

              {fileError && (
                <p className="mt-3 text-center text-sm text-red-400">{fileError}</p>
              )}

              {file && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={handleUpload}
                  className="mt-5 w-full py-4 rounded-2xl text-white font-bold text-lg flex items-center justify-center gap-3 hover:opacity-90 active:scale-95 transition-all"
                  style={{ background: "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)" }}
                >
                  <Scissors className="w-5 h-5" />
                  Generate AI Clips
                  <ChevronRight className="w-5 h-5" />
                </motion.button>
              )}
            </motion.div>
          )}

          {/* PROCESSING */}
          {isProcessing && (
            <motion.div
              key="processing"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-3xl p-8 max-w-md mx-auto"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
            >
              <div className="text-center mb-8">
                <div className="text-4xl mb-3">{STAGE_INFO[stage].icon}</div>
                <h2 className="text-white text-xl font-bold">{STAGE_INFO[stage].label}</h2>
                <p className="text-white/30 text-sm mt-1">Takes 2–5 minutes for a 1-hour video</p>
              </div>

              {stage === "uploading" && (
                <div className="mb-6">
                  <div className="flex justify-between text-xs text-white/30 mb-2">
                    <span>Uploading</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }}>
                    <div
                      className="h-1.5 rounded-full transition-all duration-300"
                      style={{ background: "linear-gradient(to right, #dc2626, #b91c1c)", width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <StageProgress stage={stage} />
            </motion.div>
          )}

          {/* ERROR */}
          {stage === "error" && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-3xl p-8 max-w-md mx-auto text-center"
              style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)" }}
            >
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-white text-xl font-bold mb-2">Processing Failed</h2>
              <p className="text-white/40 text-sm mb-6">{errorMsg}</p>
              <button
                onClick={reset}
                className="px-6 py-3 rounded-xl text-white font-semibold flex items-center gap-2 mx-auto hover:opacity-80 transition"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <RefreshCw className="w-4 h-4" /> Try Again
              </button>
            </motion.div>
          )}

          {/* DONE */}
          {stage === "done" && (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-white text-xl font-bold flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                    {clips.length} Clip{clips.length !== 1 ? "s" : ""} Generated
                  </h2>
                  <p className="text-white/30 text-sm mt-0.5">
                    Sorted by viral potential · Upload to Shorts or Download
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-white/50 text-sm transition hover:text-white"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <Scissors className="w-4 h-4" /> New Video
                </button>
              </div>

              {clips.length === 0 ? (
                <div className="text-center py-20 text-white/20">
                  <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No viral clips detected. Try a video with more spoken content.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {clips.map((clip, i) => (
                    <ClipCard key={clip.id} clip={clip} index={i} />
                  ))}
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}