import React, {
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useEffect,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward,
  Loader2, Volume1, Rewind, FastForward, Heart, Settings,
  ThumbsDown, HelpCircle, X,
} from "lucide-react";
import Hls from "hls.js";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../utils/constants";
import { getAuth } from "firebase/auth";
// getChannelWatermark was removed — watermark_url now comes directly from
// the backend via the channel_customizations JOIN (upload.js v3.2).
// Do NOT import localStorage-based helpers for channel data.

/* ─────────────────────────────────────────────────────────────────────────
 * CONSTANTS
 * ───────────────────────────────────────────────────────────────────────── */

const STORAGE_KEYS = {
  VOLUME: "player_volume",
  PLAYBACK_RATE: "player_playback_rate",
  THEATER_MODE: "player_theater_mode",
};
const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const DEFAULT_VOLUME = 0.5;
const DEFAULT_PLAYBACK_RATE = 1;
const CONTROL_HIDE_DELAY = 2500;
const SEEK_INTERVAL = 10;

// Use the centralized API_URL from constants (falls back to empty string for relative URLs)
const API_BASE = API_URL;

/* ─────────────────────────────────────────────────────────────────────────
 * UTILITIES
 * ───────────────────────────────────────────────────────────────────────── */

const formatTime = (s: number): string => {
  s = Math.floor(Number(s) || 0);
  if (s < 0) return "00:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
};
const clamp = (v: number, mn: number, mx: number) => Math.max(mn, Math.min(mx, v));

const getStoredValue = (key: string, def: number): number => {
  try { const s = localStorage.getItem(key); return s !== null ? parseFloat(s) : def; } catch { return def; }
};
const setStoredValue = (key: string, val: number) => {
  try { localStorage.setItem(key, String(val)); } catch { }
};
const getWatchProgress = (id: any) => {
  try { const s = localStorage.getItem(`watch_progress_${id}`); return s ? JSON.parse(s) : null; } catch { return null; }
};
const setWatchProgress = (id: any, t: number, dur: number) => {
  try { localStorage.setItem(`watch_progress_${id}`, JSON.stringify({ time: t, duration: dur, timestamp: Date.now() })); } catch { }
};
const throttle = (fn: (...a: any[]) => void, ms: number) => {
  let last = 0;
  return (...args: any[]) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...args); } };
};

/* ─────────────────────────────────────────────────────────────────────────
 * AMBIENT MODE
 * ───────────────────────────────────────────────────────────────────────── */

const useAmbientColor = (videoRef: React.RefObject<HTMLVideoElement | null>, isPlaying: boolean) => {
  const [color, setColor] = useState("rgb(6,182,212)");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef("rgb(6,182,212)");

  useEffect(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = canvasRef.current.height = 8;
    }
  }, []);

  useEffect(() => {
    const vid = videoRef.current, cvs = canvasRef.current;
    if (!vid || !cvs) return;
    let alive = true;
    const sample = () => {
      if (!alive || vid.paused || vid.readyState < 2) return;
      try {
        const ctx = cvs.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(vid, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0; const px = d.length / 4;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        const av = (r / px + g / px + b / px) / 3, boost = 1.8;
        const nr = clamp(Math.round(av + (r / px - av) * boost), 0, 255);
        const ng = clamp(Math.round(av + (g / px - av) * boost), 0, 255);
        const nb = clamp(Math.round(av + (b / px - av) * boost), 0, 255);
        const next = `rgb(${nr},${ng},${nb})`;
        if (next !== last.current) { last.current = next; setColor(next); }
      } catch { }
      if (alive) timer.current = setTimeout(sample, 2000);
    };
    if (isPlaying) timer.current = setTimeout(sample, 500);
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); };
  }, [isPlaying, videoRef]);

  return color;
};

const AmbientGlow: React.FC<{ color: string; isPlaying: boolean; isTheaterMode: boolean }> = ({ color, isPlaying, isTheaterMode }) => (
  <div aria-hidden style={{
    position: "absolute", inset: isTheaterMode ? "-60px" : "-40px", zIndex: 0,
    pointerEvents: "none", borderRadius: "inherit",
    transition: "background 1.2s ease, opacity 0.8s ease",
    opacity: isPlaying ? 1 : 0.4,
    background: `radial-gradient(ellipse at 50% 100%, ${color} 0%, transparent 70%)`,
    filter: "blur(32px)",
  }} />
);

/* ─────────────────────────────────────────────────────────────────────────
 * SPRITE THUMBNAIL
 *
 * Worker generates: /hls/{base}/sprite.jpg
 *   Grid  : 5 cols × 4 rows = 20 frames
 *   Frame : 160 × 90 px → full sheet 800 × 360 px
 *
 * THE ROOT CAUSE OF THE BLACK SCREEN:
 *   CSS `background-image` loads silently — if the sprite 404s or hasn't
 *   arrived yet, the div just shows its background-color (black).
 *   There is no way to detect failure from CSS alone.
 *
 * THE FIX — useSpriteReady:
 *   Preload via `new Image()` BEFORE setting the CSS background.
 *   Only show the sprite frame once img.onload fires.
 *   Show a shimmer placeholder while loading, nothing if 404.
 * ───────────────────────────────────────────────────────────────────────── */

const SPRITE_COLS = 5;
const SPRITE_ROWS = 4;
const SPRITE_FRAMES = SPRITE_COLS * SPRITE_ROWS;   // 20
const FRAME_W = 240;
const FRAME_H = 135;
const SHEET_W = SPRITE_COLS * FRAME_W;       // 800
const SHEET_H = SPRITE_ROWS * FRAME_H;       // 360

function deriveSpriteUrl(videoUrl?: string | null): string | null {
  if (!videoUrl) return null;
  const clean = videoUrl.split("?")[0];
  if (!clean.endsWith("/master.m3u8")) return null;
  return clean.replace("/master.m3u8", "/sprite.jpg");
}

/** Preloads the sprite via Image() and reports status. */
function useSpriteReady(url: string | null): "idle" | "loading" | "ready" | "error" {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    if (!url) { setStatus("idle"); return; }
    if (url === prevUrl.current && status === "ready") return;   // already good
    prevUrl.current = url;
    setStatus("loading");

    const img = new Image();
    img.onload = () => setStatus("ready");
    img.onerror = () => {
      console.warn("[Sprite] 404 or load error →", url);
      setStatus("error");
    };
    img.src = url;
    return () => { img.onload = null; img.onerror = null; };
  }, [url]);                   // intentionally omitting `status` from deps

  return status;
}

const SpritePreview: React.FC<{
  hoverTime: number;
  duration: number;
  hoverX: number;
  barWidth: number;
  spriteUrl: string | null;
  spriteStatus: "idle" | "loading" | "ready" | "error";
}> = ({ hoverTime, duration, hoverX, barWidth, spriteUrl, spriteStatus }) => {

  const frameIdx = Math.min(
    Math.floor((hoverTime / Math.max(duration, 1)) * SPRITE_FRAMES),
    SPRITE_FRAMES - 1,
  );
  const col = frameIdx % SPRITE_COLS;
  const row = Math.floor(frameIdx / SPRITE_COLS);
  const HALF = FRAME_W / 2;
  const left = Math.max(HALF, Math.min(hoverX, barWidth - HALF));
  const ready = spriteStatus === "ready" && !!spriteUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.1 }}
      style={{
        position: "absolute", bottom: "calc(100% + 20px)",
        left, transform: "translateX(-50%)",
        width: FRAME_W, pointerEvents: "none", zIndex: 60,
      }}
    >
      {/* Frame box */}
      <div style={{
        width: FRAME_W, height: FRAME_H, borderRadius: 5, marginBottom: 5,
        border: "2px solid rgba(255,255,255,0.2)",
        boxShadow: "0 6px 28px rgba(0,0,0,0.8)",
        background: "#111",
        overflow: "hidden",
        // Only apply sprite background once confirmed loaded
        ...(ready ? {
          backgroundImage: `url(${spriteUrl})`,
          backgroundPosition: `-${col * FRAME_W}px -${row * FRAME_H}px`,
          backgroundSize: `${SHEET_W}px ${SHEET_H}px`,
          backgroundRepeat: "no-repeat",
        } : {}),
      }}>
        {/* Shimmer while loading */}
        {spriteStatus === "loading" && (
          <div style={{
            width: "100%", height: "100%",
            background: "linear-gradient(90deg,#1c1c1c 25%,#2a2a2a 50%,#1c1c1c 75%)",
            backgroundSize: "200% 100%",
            animation: "spriteShimmer 1.2s infinite linear",
          }} />
        )}
      </div>

      {/* Timestamp */}
      <div style={{
        textAlign: "center", fontSize: 12, fontWeight: 700,
        color: "#fff", background: "rgba(0,0,0,0.88)",
        borderRadius: 4, padding: "2px 0", letterSpacing: "0.03em", userSelect: "none",
      }}>
        {formatTime(hoverTime)}
      </div>

      {/* Caret */}
      <div style={{
        position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)",
        width: 0, height: 0,
        borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
        borderTop: "5px solid rgba(0,0,0,0.88)",
      }} />

      {/* Shimmer keyframe injected once */}
      <style>{`
        @keyframes spriteShimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </motion.div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────
 * usePlayer
 * ───────────────────────────────────────────────────────────────────────── */

const usePlayer = ({ video }: any) => {
  const vRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [state, setState] = useState({
    isPlaying: false, isBuffering: false,
    currentTime: 0, duration: 0,
    volume: getStoredValue(STORAGE_KEYS.VOLUME, DEFAULT_VOLUME),
    isMuted: false,
    playbackRate: getStoredValue(STORAGE_KEYS.PLAYBACK_RATE, DEFAULT_PLAYBACK_RATE),
    buffered: 0, levels: [] as any[], currentLevel: -1, error: null as string | null,
  });

  useEffect(() => {
    const el = vRef.current; if (!el) return;
    el.volume = state.volume; el.playbackRate = state.playbackRate;
  }, [state.volume, state.playbackRate]);

  const lastSaved = useRef(0);
  useEffect(() => {
    const el = vRef.current; if (!el) return;
    const onTime = throttle(() => {
      const t = el.currentTime;
      setState(s => ({ ...s, currentTime: t }));
      if (video?.id && el.duration >= 10) {
        const b = Math.floor(t / 5) * 5;
        if (b >= 5 && b !== lastSaved.current) { lastSaved.current = b; setWatchProgress(video.id, t, el.duration); }
      }
    }, 250);
    const onProg = throttle(() => {
      try {
        if (!el.buffered || el.buffered.length === 0) {
          setState(s => ({ ...s, buffered: 0 }));
          return;
        }
        const idx = Math.max(0, el.buffered.length - 1);
        const bufferedEnd = el.buffered.end(idx);
        if (!isNaN(bufferedEnd) && isFinite(bufferedEnd) && bufferedEnd >= 0) {
          setState(s => ({ ...s, buffered: bufferedEnd }));
        }
      } catch (e) {
        setState(s => ({ ...s, buffered: 0 }));
      }
    }, 500);
    const map: Record<string, EventListener> = {
      timeupdate: onTime as EventListener,
      durationchange: () => setState(s => ({ ...s, duration: el.duration })),
      playing: () => setState(s => ({ ...s, isPlaying: true, isBuffering: false })),
      pause: () => setState(s => ({ ...s, isPlaying: false })),
      waiting: () => setState(s => ({ ...s, isBuffering: true })),
      canplay: () => setState(s => ({ ...s, isBuffering: false })),
      progress: onProg as EventListener,
      error: () => setState(s => ({ ...s, error: "Failed to load video", isBuffering: false })),
      volumechange: () => setState(s => ({ ...s, volume: el.volume, isMuted: el.muted })),
    };
    Object.entries(map).forEach(([ev, fn]) => el.addEventListener(ev, fn));
    return () => Object.entries(map).forEach(([ev, fn]) => el.removeEventListener(ev, fn));
  }, [video?.id]);

  const actions = useMemo(() => ({
    playPause: () => {
      const el = vRef.current; if (!el) return;
      el.paused ? el.play().catch(() => setState(s => ({ ...s, error: "Failed to play" }))) : el.pause();
    },
    seekBy: (s: number) => { const el = vRef.current; if (el?.duration) el.currentTime = clamp(el.currentTime + s, 0, el.duration); },
    seekAbs: (s: number) => { const el = vRef.current; if (el?.duration) el.currentTime = clamp(s, 0, el.duration); },
    setVolume: (v: number) => {
      const el = vRef.current; if (!el) return;
      const nv = clamp(v, 0, 1); el.volume = nv; el.muted = nv === 0;
      setStoredValue(STORAGE_KEYS.VOLUME, nv);
      setState(s => ({ ...s, volume: nv, isMuted: nv === 0 }));
    },
    toggleMute: () => { const el = vRef.current; if (!el) return; el.muted = !el.muted; setState(s => ({ ...s, isMuted: el.muted })); },
    setPlaybackRate: (r: number) => {
      const el = vRef.current; if (!el) return;
      el.playbackRate = r; setStoredValue(STORAGE_KEYS.PLAYBACK_RATE, r);
      setState(s => ({ ...s, playbackRate: r }));
    },
    togglePiP: async () => {
      const el = vRef.current;
      if (!el || !document.pictureInPictureEnabled) return;
      try { document.pictureInPictureElement ? await document.exitPictureInPicture() : await el.requestPictureInPicture(); } catch { }
    },
    setLevels: (levels: any[]) => setState(s => ({ ...s, levels })),
    setLevel: (idx: number) => { const h = hlsRef.current; if (h) { h.currentLevel = idx; setState(s => ({ ...s, currentLevel: idx })); } },
    clearError: () => setState(s => ({ ...s, error: null })),
  }), []);

  return { vRef, hlsRef, state, actions };
};

/* ─────────────────────────────────────────────────────────────────────────
 * useVideoAPI
 * ───────────────────────────────────────────────────────────────────────── */

const useVideoAPI = (videoId: any) => {
  const auth = getAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!auth.currentUser);
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [dislikes, setDislikes] = useState(0);
  const [disliked, setDisliked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(async (force = false) => {
    try { const u = auth.currentUser; return u ? await u.getIdToken(force) : null; } catch { return null; }
  }, [auth]);

  const req = useCallback(async (url: string, opts: RequestInit = {}) => {
    const mk = async (tok: string | null) => {
      const h: Record<string, string> = { "Content-Type": "application/json", ...(opts.headers as any) };
      if (tok) h.Authorization = `Bearer ${tok}`;
      return fetch(url, { ...opts, headers: h });
    };
    const tok = await getToken();
    let res = await mk(tok);
    if (res.status === 401 && tok) { const t2 = await getToken(true); if (t2) res = await mk(t2); }
    return res;
  }, [getToken]);

  useEffect(() => {
    return auth.onAuthStateChanged(u => {
      setIsAuthenticated(!!u);
      if (!u) { setLiked(false); setLikes(0); setDisliked(false); setDislikes(0); }
    });
  }, [auth]);

  useEffect(() => {
    if (!videoId) return;
    fetch(`${API_BASE}/videos/${videoId}/view`, { method: "POST", headers: { "Content-Type": "application/json" } }).catch(() => { });
  }, [videoId]);

  useEffect(() => {
    if (!videoId || !isAuthenticated) return;
    (async () => {
      try { const r = await req(`${API_BASE}/videos/${videoId}/like-status`); if (r.ok) { const d = await r.json(); setLiked(d.liked || false); setLikes(d.likes || 0); } } catch { }
      try { const r = await req(`${API_BASE}/videos/${videoId}/dislike-status`); if (r.ok) { const d = await r.json(); setDisliked(d.disliked || false); setDislikes(d.dislikes || 0); } } catch { }
    })();
  }, [videoId, isAuthenticated, req]);

  const toggleLike = useCallback(async () => {
    if (!isAuthenticated) { setError("Please log in to like videos"); return false; }
    setLoading(true); setError(null);
    try {
      const r = await req(`${API_BASE}/videos/${videoId}/like`, { method: "POST" });
      if (!r.ok) { setError("Failed to update like"); return false; }
      const d = await r.json(); setLiked(d.liked); setLikes(p => d.liked ? p + 1 : Math.max(p - 1, 0)); return true;
    } catch { setError("Network error"); return false; } finally { setLoading(false); }
  }, [videoId, isAuthenticated, req]);

  const toggleDislike = useCallback(async () => {
    if (!isAuthenticated) { setError("Please log in"); return false; }
    try {
      const r = await req(`${API_BASE}/videos/${videoId}/dislike`, { method: "POST" });
      if (r.ok) { const d = await r.json(); setDisliked(d.disliked); setDislikes(p => d.disliked ? p + 1 : Math.max(p - 1, 0)); return true; }
    } catch { setError("Failed to update dislike"); }
    return false;
  }, [videoId, isAuthenticated, req]);

  return { likes, liked, toggleLike, dislikes, disliked, toggleDislike, loading, error, isAuthenticated, clearError: () => setError(null) };
};

/* ─────────────────────────────────────────────────────────────────────────
 * SUB-COMPONENTS
 * ───────────────────────────────────────────────────────────────────────── */

const KeyboardShortcuts: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
    <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
      className="bg-[#0a0000] rounded-2xl p-6 max-w-md w-full mx-4 border border-white/10 shadow-2xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-2"><HelpCircle size={24} className="text-red-400" /> Keyboard Shortcuts</h3>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg"><X size={20} className="text-gray-400" /></button>
      </div>
      <div className="space-y-3 text-sm">
        {[
          ["Space / K", "Play/Pause"], ["F", "Fullscreen"], ["T", "Theater Mode"], ["M", "Mute"],
          ["J", `Rewind ${SEEK_INTERVAL}s`], ["L", `Forward ${SEEK_INTERVAL}s`],
          ["←", "Rewind 5s"], ["→", "Forward 5s"], ["↑", "Vol Up"], ["↓", "Vol Down"],
          ["0-9", "Jump to %"], ["?", "Shortcuts"],
        ].map(([key, act], i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-white/5">
            <span className="text-gray-400">{act}</span>
            <kbd className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">{key}</kbd>
          </div>
        ))}
      </div>
    </motion.div>
  </motion.div>
);

const ResumePrompt: React.FC<{ progress: any; onResume: () => void; onStart: () => void; secondsLeft: number }> = ({ progress, onResume, onStart, secondsLeft }) => (
  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
    className="absolute top-3 right-3 z-50 bg-black/85 backdrop-blur-md border border-white/10 rounded-lg px-3 py-2 shadow-xl flex items-center gap-2">
    <span className="text-white text-xs whitespace-nowrap">
      Resume <span className="font-bold text-red-400">{formatTime(progress.time)}</span>?
      <span className="text-gray-500 ml-1">({secondsLeft}s)</span>
    </span>
    <button onClick={onResume} className="px-2.5 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-md transition active:scale-95">Resume</button>
    <button onClick={onStart} className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white text-xs rounded-md transition active:scale-95">Start over</button>
  </motion.div>
);

/* ─────────────────────────────────────────────────────────────────────────
 * CONTROLS
 * ───────────────────────────────────────────────────────────────────────── */

const Controls: React.FC<any> = ({
  isPlaying, isMuted, volume, duration, currentTime, buffered, playbackRate,
  onPlayPause, onSeekBy, onSeekTo, onVolume, onToggleMute, onTogglePiP, onSetRate,
  isFullscreen, onToggleFullscreen, likes, liked, onToggleLike, disliked,
  onToggleDislike, isPiPSupported, isAuthenticated, levels, currentLevel, onSetLevel,
  isTheaterMode, onToggleTheater, onShowHelp, spriteUrl,
}) => {
  const [showQuality, setShowQuality] = useState(false);
  const [settingsView, setSettingsView] = useState<"main" | "quality" | "speed">("main");
  const [stableVolume, setStableVolume] = useState(false);
  const [voiceBoost, setVoiceBoost] = useState(false);
  const [ambientMode, setAmbientMode] = useState(() => {
    try { return localStorage.getItem("player_ambient") !== "0"; } catch { return true; }
  });
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);
  const [barWidth, setBarWidth] = useState(0);

  // ── THE KEY FIX: preload sprite before using it ──────────────────────
  const spriteStatus = useSpriteReady(spriteUrl);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    setBarWidth(r.width); setHoverX(x);
    setHoverTime(clamp(x / r.width, 0, 1) * duration);
  }, [duration]);

  const onLeave = useCallback(() => setHoverTime(null), []);

  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    onSeekTo(clamp((e.clientX - r.left) / r.width, 0, 1) * duration);
  }, [duration, onSeekTo]);

  const prog = (currentTime / (duration || 1)) * 100;
  const buf = (buffered / (duration || 1)) * 100;
  const hPct = hoverTime !== null ? (hoverTime / (duration || 1)) * 100 : null;
  const hover = hoverTime !== null;

  return (
    <div className="flex flex-col w-full px-3 pt-1 pb-3 sm:p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent text-white select-none"
      style={{ position: "relative", overflow: "visible" }}>
      {/* ── SEEKBAR ── */}
      <div className="relative w-full cursor-pointer mb-4" style={{ height: 20, overflow: "visible" }}
        onMouseMove={onMove} onMouseLeave={onLeave} onClick={onClick}
        role="slider" aria-label="Seek" aria-valuenow={Math.floor(currentTime)} aria-valuemin={0} aria-valuemax={Math.floor(duration)}>

        {/* Track */}
        <div style={{
          position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)",
          height: hover ? 5 : 3, borderRadius: 99, background: "rgba(255,255,255,0.15)",
          overflow: "hidden", transition: "height 0.15s ease"
        }}>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${buf}%`, background: "rgba(255,255,255,0.25)", transition: "width 0.3s linear" }} />
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: `${prog}%`, background: "linear-gradient(90deg,#f87171,#ef4444)",
            boxShadow: hover ? "0 0 10px rgba(239,68,68,0.9)" : "none", transition: "width 0.1s linear, box-shadow 0.15s ease"
          }} />
          {hPct !== null && hPct > prog && (
            <div style={{ position: "absolute", left: `${prog}%`, top: 0, bottom: 0, width: `${hPct - prog}%`, background: "rgba(255,255,255,0.18)" }} />
          )}
        </div>

        {/* Scrubber dot */}
        <div style={{
          position: "absolute", left: `${prog}%`, top: "50%", transform: "translate(-50%,-50%)",
          width: hover ? 14 : 0, height: hover ? 14 : 0, borderRadius: "50%",
          background: "#ef4444", border: "2px solid #fff", boxShadow: "0 0 8px rgba(239,68,68,0.9)",
          transition: "width 0.15s ease, height 0.15s ease", zIndex: 10, pointerEvents: "none"
        }} />

        {/* Sprite preview */}
        <AnimatePresence>
          {hoverTime !== null && (
            <SpritePreview
              hoverTime={hoverTime} duration={duration}
              hoverX={hoverX} barWidth={barWidth}
              spriteUrl={spriteUrl} spriteStatus={spriteStatus}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── BUTTON ROW ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <button onClick={onPlayPause} className="hover:text-red-400 transition-all active:scale-90 hover:scale-110 flex-shrink-0">
            {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
          </button>
          <button onClick={() => onSeekBy(-SEEK_INTERVAL)} className="hover:text-red-400 active:scale-90 transition-all hover:scale-110 flex-shrink-0">
            <SkipBack size={18} fill="currentColor" />
          </button>
          <button onClick={() => onSeekBy(SEEK_INTERVAL)} className="hover:text-red-400 active:scale-90 transition-all hover:scale-110 flex-shrink-0">
            <SkipForward size={18} fill="currentColor" />
          </button>
          <div className="flex items-center gap-2 group ml-1">
            <button onClick={onToggleMute} className="hover:text-red-400 transition-all hover:scale-110 min-w-[36px] flex items-center justify-center">
              {isMuted || volume === 0 ? <VolumeX size={20} /> : volume < 0.5 ? <Volume1 size={20} /> : <Volume2 size={20} />}
            </button>
            <input type="range" min="0" max="1" step="0.01" value={isMuted ? 0 : volume}
              onChange={e => onVolume(parseFloat(e.target.value))}
              className="hidden sm:block w-0 group-hover:w-20 opacity-0 group-hover:opacity-100 transition-all duration-300 accent-red-400 cursor-pointer h-1" />
          </div>
          <div className="text-xs sm:text-sm font-medium tabular-nums ml-1 opacity-90 whitespace-nowrap flex-shrink-0">
            {formatTime(currentTime)} <span className="text-white/40">/</span> {formatTime(duration)}
          </div>
        </div>

        {/* ── RIGHT: Like/Dislike pill + Speed + Settings + Fullscreen ── */}
        <div className="flex items-center gap-1.5">

          {/* Like + Dislike combined pill */}
          <div className="flex items-center rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
            <button
              onClick={onToggleLike} disabled={!isAuthenticated}
              title="Like"
              className={`flex items-center gap-1 pl-3 pr-2 py-1.5 text-xs font-semibold transition-all border-r border-white/10
                ${isAuthenticated ? "hover:bg-white/10 active:scale-95" : "opacity-40 cursor-not-allowed"}
                ${liked ? "text-red-400" : "text-white"}`}
            >
              <Heart size={14} fill={liked ? "currentColor" : "none"} />
              {likes > 0 && <span className="ml-1">{likes}</span>}
            </button>
            <button
              onClick={onToggleDislike} disabled={!isAuthenticated}
              title="Dislike"
              className={`flex items-center gap-1 pl-2 pr-3 py-1.5 text-xs font-semibold transition-all
                ${isAuthenticated ? "hover:bg-white/10 active:scale-95" : "opacity-40 cursor-not-allowed"}
                ${disliked ? "text-red-400" : "text-white"}`}
            >
              <ThumbsDown size={14} fill={disliked ? "currentColor" : "none"} />
            </button>
          </div>

          {/* ⚙ YouTube-style Settings Panel — Speed, Quality, Theater, PiP all inside */}
          <div className="relative">
            <button
              onClick={() => { setShowQuality(q => !q); setSettingsView("main"); }}
              title="Settings"
              className={`p-1.5 rounded-full transition-all hover:scale-110
                ${showQuality ? "text-red-400" : "hover:text-red-400 opacity-75 hover:opacity-100"}`}
            >
              <Settings size={17} />
            </button>
            <AnimatePresence>
              {showQuality && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute bottom-full right-0 mb-2 shadow-2xl z-[9999]"
                  style={{
                    width: 240,
                    maxHeight: "min(50vh, 300px)",
                    background: "rgba(28,28,28,0.98)",
                    backdropFilter: "blur(20px)",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.1)",
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  {/* ── MAIN VIEW ── */}
                  {settingsView === "main" && (
                    <div>
                      {[
                        { icon: "📊", label: "Stable volume", value: stableVolume, toggle: () => setStableVolume(v => !v) },
                        { icon: "🎙️", label: "Voice boost", value: voiceBoost, toggle: () => setVoiceBoost(v => !v) },
                        {
                          icon: "🖥️", label: "Ambient mode", value: ambientMode,
                          toggle: () => setAmbientMode(v => { const n = !v; try { localStorage.setItem("player_ambient", n ? "1" : "0"); } catch { } return n; }),
                        },
                        { icon: "🖥", label: "Theater mode", value: isTheaterMode, toggle: () => onToggleTheater() },
                      ].map(row => (
                        <button key={row.label} onClick={row.toggle}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors text-left">
                          <span className="text-sm w-4 flex-shrink-0 text-center">{row.icon}</span>
                          <span className="flex-1 text-xs text-white/85 font-medium">{row.label}</span>
                          <div className="relative flex-shrink-0 transition-all duration-300"
                            style={{ width: 36, height: 20, borderRadius: 999, background: row.value ? "#ef4444" : "rgba(255,255,255,0.2)" }}>
                            <div className="absolute top-0.5 transition-all duration-300"
                              style={{
                                width: 14, height: 14, borderRadius: "50%", background: "#fff",
                                boxShadow: "0 1px 4px rgba(0,0,0,0.3)", left: row.value ? 19 : 3
                              }} />
                          </div>
                        </button>
                      ))}

                      <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />

                      {/* Speed → sub-panel */}
                      <button onClick={() => setSettingsView("speed")}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors">
                        <span className="text-sm w-4 flex-shrink-0 text-center">⚡</span>
                        <span className="flex-1 text-xs text-white/85 font-medium">Playback speed</span>
                        <span className="text-xs text-white/40 mr-1">{playbackRate === 1 ? "Normal" : `${playbackRate}×`}</span>
                        <span className="text-white/40 text-xs">›</span>
                      </button>

                      {/* Quality → sub-panel */}
                      {levels.length > 0 && (
                        <button onClick={() => setSettingsView("quality")}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors">
                          <span className="text-sm w-4 flex-shrink-0 text-center">🎬</span>
                          <span className="flex-1 text-xs text-white/85 font-medium">Quality</span>
                          <span className="text-xs text-white/40 mr-1">
                            {currentLevel === -1 ? "Auto" : `${levels[currentLevel]?.height}p`}
                          </span>
                          <span className="text-white/40 text-xs">›</span>
                        </button>
                      )}

                      {isPiPSupported && (
                        <button onClick={() => { onTogglePiP(); setShowQuality(false); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors">
                          <span className="text-sm w-4 flex-shrink-0 text-center">⧉</span>
                          <span className="flex-1 text-xs text-white/85 font-medium">Picture in picture</span>
                        </button>
                      )}

                      <button onClick={() => { onShowHelp(); setShowQuality(false); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 pb-3 hover:bg-white/5 transition-colors">
                        <span className="text-sm w-4 flex-shrink-0 text-center">⌨️</span>
                        <span className="flex-1 text-xs text-white/85 font-medium">Keyboard shortcuts</span>
                      </button>
                    </div>
                  )}

                  {/* ── SPEED SUB-PANEL ── */}
                  {settingsView === "speed" && (
                    <div>
                      <button onClick={() => setSettingsView("main")}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        <span className="text-white/50 text-xs">‹</span>
                        <span className="text-xs text-white/85 font-semibold">Playback speed</span>
                      </button>
                      {PLAYBACK_SPEEDS.map(sp => (
                        <button key={sp} onClick={() => { onSetRate(sp); setSettingsView("main"); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors">
                          <span className="w-4 flex-shrink-0 flex items-center justify-center text-red-400"
                            style={{ visibility: playbackRate === sp ? "visible" : "hidden" }}>✓</span>
                          <span className={`text-xs font-medium ${playbackRate === sp ? "text-red-400" : "text-white/85"}`}>
                            {sp === 1 ? "Normal" : `${sp}×`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ── QUALITY SUB-PANEL ── */}
                  {settingsView === "quality" && (
                    <div>
                      <button onClick={() => setSettingsView("main")}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                        <span className="text-white/50 text-xs">‹</span>
                        <span className="text-xs text-white/85 font-semibold">Quality</span>
                      </button>
                      <button onClick={() => { onSetLevel(-1); setSettingsView("main"); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors">
                        <span className="w-4 flex-shrink-0 flex items-center justify-center text-red-400"
                          style={{ visibility: currentLevel === -1 ? "visible" : "hidden" }}>✓</span>
                        <span className={`text-xs font-medium ${currentLevel === -1 ? "text-red-400" : "text-white/85"}`}>Auto</span>
                      </button>
                      {levels.map((l: any, i: number) => (
                        <button key={i} onClick={() => { onSetLevel(i); setSettingsView("main"); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 transition-colors">
                          <span className="w-4 flex-shrink-0 flex items-center justify-center text-red-400"
                            style={{ visibility: currentLevel === i ? "visible" : "hidden" }}>✓</span>
                          <span className={`text-xs font-medium ${currentLevel === i ? "text-red-400" : "text-white/85"}`}>
                            {l.height}p
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Fullscreen */}
          <button onClick={onToggleFullscreen} title="Fullscreen (F)"
            className="hover:text-red-400 transition-all active:scale-90 hover:scale-110">
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────
 * ERROR DISPLAY
 * ───────────────────────────────────────────────────────────────────────── */

const ErrorDisplay: React.FC<{ message: string; onRetry: () => void }> = ({ message, onRetry }) => (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
    <div className="text-center p-8 max-w-md">
      <div className="text-red-500 mb-4">
        <svg className="w-16 h-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-white mb-2">Playback Error</h3>
      <p className="text-zinc-400 mb-6">{message}</p>
      {onRetry && <button onClick={onRetry} className="px-6 py-2 bg-red-500 hover:bg-red-600 text-black font-bold rounded-lg">Try Again</button>}
    </div>
  </div>
);

/* ─────────────────────────────────────────────────────────────────────────
 * VIDEO END SCREEN
 *
 * Renders as an absolute overlay inside the player when the video finishes.
 * Shows:
 *   • A featured "Up Next" card with a SVG countdown ring
 *   • A 2-3 column grid of suggestion thumbnails
 *   • Replay button + dismiss (X)
 *
 * The VideoEndScreen owns autoplay state internally so it works
 * independently of Watch.tsx — Watch just passes suggestions[] and
 * autoplayNext (bool, defaults true).
 * ───────────────────────────────────────────────────────────────────────── */

const fmtDur = (s?: number): string | null => {
  if (!s || s <= 0) return null;
  const t = Math.floor(s), h = Math.floor(t / 3600),
    m = Math.floor((t % 3600) / 60), sec = t % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
};

/**
 * fmtName — get display name from a SuggestionVideo.
 * Priority: channel_name (from DB JOIN) → formatted email → "Unknown"
 * Never returns "Creator" as a hardcoded fallback.
 */
const fmtName = (video?: SuggestionVideo | null): string => {
  if (!video) return "Unknown";
  // 1. DB channel_name (most accurate — from channel_customizations JOIN)
  if (video.channel_name?.trim() && !video.channel_name.includes("@")) {
    return video.channel_name.trim();
  }
  // 2. Format from email
  const email = video.uploader_email || video.uploader || "";
  if (!email) return "Unknown";
  const local = email.includes("@") ? email.split("@")[0] : email;
  return local.split(/[._-]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
};

interface SuggestionVideo {
  id: string | number;
  public_id?: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  views?: number;
  uploader?: string;
  uploader_email?: string;
  // Fields from channel_customizations JOIN (upload.js v3.2+)
  channel_name?: string;
  avatar_url?: string;
  handle?: string;
  created_at?: string;
}

/** Animated SVG arc that shrinks from full circle → empty over `total` seconds */
function CountdownRing({ seconds, total }: { seconds: number; total: number }) {
  const R = 26, C = 2 * Math.PI * R;
  const dash = C * (seconds / total);
  return (
    <svg width="64" height="64" className="absolute inset-0 m-auto -rotate-90" style={{ willChange: "transform" }}>
      <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3" />
      <circle cx="32" cy="32" r={R} fill="none" stroke="#ef4444" strokeWidth="3"
        strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
        style={{ 
          transition: "stroke-dasharray 0.3s ease-out",
          filter: "drop-shadow(0 0 0 rgba(239,68,68,0.3))",
        }}
      />
    </svg>
  );
}

const VideoEndScreen: React.FC<{
  suggestions: SuggestionVideo[];
  autoplay: boolean;
  onReplay: () => void;
  onDismiss: () => void;
}> = ({ suggestions, autoplay, onReplay, onDismiss }) => {
  const navigate = useNavigate();
  const TOTAL = 7;
  const nextVideo = suggestions[0] ?? null;
  const sideList = suggestions.slice(1, 4);           // 3 smaller cards on right
  const [count, setCount] = useState<number | null>(autoplay && nextVideo ? TOTAL : null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-navigate when countdown reaches 0
  useEffect(() => {
    if (count === 0) {
      if (nextVideo && autoplay) {
        const nextId = nextVideo.public_id || nextVideo.id;
        if (nextId) {
          onDismiss(); // Close the end screen FIRST
          setTimeout(() => {
            navigate(`/watch?v=${nextId}`);
          }, 50); // Small delay to let dismiss complete
        }
      }
    }
  }, [count, nextVideo, autoplay, navigate, onDismiss]);

  // Countdown timer
  useEffect(() => {
    if (!autoplay || !nextVideo || count === null || count <= 0) return;

    timerRef.current = setInterval(() => {
      setCount(c => (c === null || c <= 1 ? 0 : c - 1));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoplay, nextVideo, count]);

  // Initialize countdown
  useEffect(() => {
    if (autoplay && nextVideo) {
      setCount(TOTAL);
    } else {
      setCount(null);
    }
  }, [autoplay, nextVideo]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      exit={{ opacity: 0 }} transition={{ duration: 0.35 }}
      style={{
        position: "absolute", inset: 0, zIndex: 40,
        background: "linear-gradient(135deg, rgba(0,0,0,0.93) 0%, rgba(6,12,20,0.96) 100%)",
        display: "flex", flexDirection: "column",
        willChange: "opacity",
        transform: "translateZ(0)",
      }}
    >
      {/* ── Dismiss ── */}
      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}>
        <button onClick={onDismiss}
          style={{
            width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)", color: "#9ca3af", display: "flex",
            alignItems: "center", justifyContent: "center", cursor: "pointer",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.14)"; (e.currentTarget as HTMLElement).style.color = "#fff"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.06)"; (e.currentTarget as HTMLElement).style.color = "#9ca3af"; }}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Two-panel body ── */}
      <div style={{ flex: 1, display: "flex", alignItems: "stretch", padding: "16px 16px 0 16px", gap: 14, minHeight: 0 }}>

        {/* ════ LEFT PANEL — Featured next video ════ */}
        <div style={{ flex: "0 0 58%", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Thumbnail — fills most of left panel */}
          {nextVideo ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              onClick={() => navigate(`/watch?v=${nextVideo.public_id || nextVideo.id}`)}
              style={{
                flex: 1, position: "relative", borderRadius: 10, overflow: "hidden",
                cursor: "pointer", background: "#0a0a0a",
                boxShadow: "0 0 0 1px rgba(239,68,68,0.2), 0 8px 32px rgba(0,0,0,0.6)",
              }}
              className="group"
            >
              {nextVideo.thumbnail && (
                <img src={nextVideo.thumbnail} alt={nextVideo.title}
                  style={{
                    width: "100%", height: "100%", objectFit: "cover", display: "block",
                    transition: "transform 0.4s ease", filter: "brightness(0.82)"
                  }}
                  className="group-hover:scale-105"
                />
              )}

              {/* Gradient scrim at bottom */}
              <div style={{
                position: "absolute", inset: 0,
                background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 55%)",
              }} />

              {/* red accent line at top */}
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: "linear-gradient(90deg, #ef4444, #f87171, transparent)",
              }} />

              {/* Big centered play button */}
              <div style={{
                position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
              }}>
                <div style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: "rgba(239,68,68,0.92)", display: "flex",
                  alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 24px rgba(239,68,68,0.5)",
                  transition: "transform 0.2s, box-shadow 0.2s",
                }} className="group-hover:scale-110">
                  <Play size={22} fill="white" style={{ color: "white", marginLeft: 3 }} />
                </div>
              </div>

              {/* Countdown ring overlaid on play button */}
              {count !== null && (
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center", pointerEvents: "none",
                  willChange: "transform",
                  transform: "translateZ(0)",
                }}>
                  <div style={{ position: "relative", width: 72, height: 72 }}>
                    <CountdownRing seconds={count} total={TOTAL} />
                    <span style={{
                      position: "absolute", inset: 0, display: "flex",
                      alignItems: "center", justifyContent: "center",
                      fontSize: 15, fontWeight: 700, color: "#fff", zIndex: 2,
                      fontFamily: "monospace",
                      willChange: "contents",
                      backfaceVisibility: "hidden",
                      WebkitFontSmoothing: "antialiased",
                      transform: "translateZ(0)",
                      width: "20px",
                      textAlign: "center",
                    }}>{count}</span>
                  </div>
                </div>
              )}

              {/* Duration badge */}
              {nextVideo.duration && (
                <div style={{
                  position: "absolute", bottom: 40, right: 10,
                  background: "rgba(0,0,0,0.8)", borderRadius: 4, padding: "2px 6px",
                  fontSize: 11, fontFamily: "monospace", color: "#fff", fontWeight: 600,
                }}>
                  {fmtDur(nextVideo.duration)}
                </div>
              )}

              {/* Title + channel at bottom of thumbnail */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 12px" }}>
                <p style={{ 
                  fontSize: 11, color: "#ef4444", fontWeight: 600, marginBottom: 3, letterSpacing: "0.04em",
                  fontFamily: "monospace",
                  minHeight: "16px",
                  willChange: "contents",
                  backfaceVisibility: "hidden",
                  WebkitFontSmoothing: "antialiased",
                }}>
                  {count !== null ? `▶  Playing in ${count}s` : "▶  Up next"}
                </p>
                <p style={{
                  fontSize: 13, color: "#fff", fontWeight: 700,
                  overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical", lineHeight: 1.35,
                }}>
                  {nextVideo.title}
                </p>
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                  {nextVideo.avatar_url ? (
                    <img src={nextVideo.avatar_url} alt="" style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : null}
                  {fmtName(nextVideo)}
                </p>
              </div>
            </motion.div>
          ) : (
            <div style={{ flex: 1 }} />
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, paddingBottom: 14 }}>
            <button onClick={onReplay}
              style={{
                flex: 1, padding: "9px 0", borderRadius: 8,
                background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
                color: "#e5e7eb", fontSize: 12, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "all 0.2s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.13)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.07)"; }}
            >
              <svg width="13" height="13" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
              </svg>
              Replay
            </button>
            {count !== null && (
              <button onClick={() => setCount(null)}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 8,
                  background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)",
                  color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.22)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.12)"; }}
              >
                Cancel autoplay
              </button>
            )}
          </div>
        </div>

        {/* ════ RIGHT PANEL — 3 compact suggestion cards ════ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, paddingBottom: 14 }}>
          <p style={{
            fontSize: 10, color: "#6b7280", fontWeight: 700,
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2,
          }}>
            More to watch
          </p>

          {sideList.map((v, i) => (
            <motion.div
              key={v.id}
              initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12 + i * 0.08, duration: 0.28 }}
              onClick={() => navigate(`/watch?v=${v.public_id || v.id}`)}
              style={{
                display: "flex", gap: 9, cursor: "pointer", borderRadius: 8, padding: "6px 6px",
                border: "1px solid transparent", transition: "all 0.2s",
              }}
              className="group"
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(239,68,68,0.2)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.borderColor = "transparent";
              }}
            >
              {/* Thumbnail */}
              <div style={{
                flexShrink: 0, width: 88, aspectRatio: "16/9", borderRadius: 6,
                overflow: "hidden", background: "#111", position: "relative",
              }}>
                {v.thumbnail && (
                  <img src={v.thumbnail} alt={v.title}
                    style={{
                      width: "100%", height: "100%", objectFit: "cover", display: "block",
                      transition: "transform 0.3s", filter: "brightness(0.85)"
                    }}
                    className="group-hover:scale-105"
                  />
                )}
                {/* Play dot on hover */}
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  opacity: 0, transition: "opacity 0.2s",
                }} className="group-hover:opacity-100">
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%",
                    background: "rgba(239,68,68,0.9)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Play size={10} fill="white" style={{ color: "white", marginLeft: 2 }} />
                  </div>
                </div>
                {v.duration && (
                  <span style={{
                    position: "absolute", bottom: 3, right: 4,
                    fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                    color: "#fff", background: "rgba(0,0,0,0.8)", borderRadius: 3, padding: "1px 4px",
                  }}>
                    {fmtDur(v.duration)}
                  </span>
                )}
              </div>

              {/* Title */}
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <p style={{
                  fontSize: 12, color: "#e5e7eb", fontWeight: 600,
                  overflow: "hidden", display: "-webkit-box",
                  WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  lineHeight: 1.35, transition: "color 0.2s",
                }} className="group-hover:text-red-300">
                  {v.title}
                </p>
                <p style={{ fontSize: 10, color: "#6b7280", marginTop: 3, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", display: "flex", alignItems: "center", gap: 4 }}>
                  {v.avatar_url ? (
                    <img src={v.avatar_url} alt="" style={{ width: 14, height: 14, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : null}
                  {fmtName(v)}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ── Countdown progress bar — very bottom of screen ── */}
      {count !== null && (
        <div style={{ height: 2, background: "rgba(255,255,255,0.06)", flexShrink: 0, overflow: "hidden", transformOrigin: "left" }}>
          <motion.div
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: TOTAL, ease: "linear" }}
            style={{ 
              height: "100%", 
              background: "linear-gradient(90deg, #ef4444, #f87171)",
              willChange: "transform",
              transformOrigin: "left",
            }}
          />
        </div>
      )}
    </motion.div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────
 * MAIN VideoPlayer
 * ───────────────────────────────────────────────────────────────────────── */

const VideoPlayer = forwardRef<any, any>(
  ({ video, autoPlay = true, startTime = 0, className = "", onVideoEnd, onTheaterModeChange, suggestions = [], autoplayNext = true }, ref) => {
    const safeVideo = video?.url ? video : { id: null, url: null };
    const { vRef, hlsRef, state, actions } = usePlayer({ video: safeVideo });
    const { likes, liked, toggleLike, dislikes, disliked, toggleDislike, error: apiError, isAuthenticated } = useVideoAPI(video?.id ?? null);

    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [showCursor, setShowCursor] = useState(true);
    const [ripple, setRipple] = useState<any>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [showResume, setShowResume] = useState(false);
    const [resumeProgress, setResumeProgress] = useState<any>(null);
    const [isTheaterMode, setIsTheaterMode] = useState(() => getStoredValue(STORAGE_KEYS.THEATER_MODE, 0) === 1);
    const [showEndScreen, setShowEndScreen] = useState(false);

    // Floating "Subscribe" overlay — previously always rendered with no
    // timer at all ({true && (...)}), so it sat on screen for the entire
    // video. Now it shows once, briefly, after playback actually starts,
    // then fades out and stays gone for the rest of this viewing.
    const [showSubscribeOverlay, setShowSubscribeOverlay] = useState(false);
    const hasShownSubscribeOverlay = useRef(false);

    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const playIconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [showPlayPauseOverlay, setShowPlayPauseOverlay] = useState(false);

    const ambientColor = useAmbientColor(vRef, state.isPlaying);
    const isPiPSupported = typeof document !== "undefined" && document.pictureInPictureEnabled;

    // FIX: watermark_url is now returned by GET /videos/:id via the channel_customizations
    // LEFT JOIN (upload.js v3.2). Never read from localStorage.
    const channelWatermark: string =
      video?.watermark_url ||      // from /videos/:id JOIN (primary)
      video?.watermarkUrl ||      // camelCase variant
      "";

    // Derive + memoize sprite URL — only changes when video.url changes
    const spriteUrl = useMemo(() => deriveSpriteUrl(video?.url), [video?.url]);

    useEffect(() => {
      if (!video?.id) return;
      const p = getWatchProgress(video.id);
      if (p && p.time > 10 && p.time < p.duration - 30) { setResumeProgress(p); setShowResume(true); }
    }, [video?.id]);

    useEffect(() => {
      if (state.isPlaying && !hasShownSubscribeOverlay.current) {
        hasShownSubscribeOverlay.current = true;
        setShowSubscribeOverlay(true);
        const t = setTimeout(() => setShowSubscribeOverlay(false), 6000);
        return () => clearTimeout(t);
      }
    }, [state.isPlaying]);

    const handleResume = useCallback(() => { if (resumeProgress) actions.seekAbs(resumeProgress.time); setShowResume(false); }, [resumeProgress, actions]);
    const handleStartOver = useCallback(() => setShowResume(false), []);

    // Auto-dismiss the resume prompt if the person never taps either
    // button — it was previously staying on screen over the video
    // indefinitely. Defaults to Resume (not Start Over) since that's the
    // safer choice: it preserves progress rather than silently discarding it.
    const [resumeSecondsLeft, setResumeSecondsLeft] = useState(8);
    useEffect(() => {
      if (!showResume) return;
      setResumeSecondsLeft(8);
      const t = setTimeout(() => { handleResume(); }, 8000);
      const tick = setInterval(() => setResumeSecondsLeft((s) => Math.max(0, s - 1)), 1000);
      return () => { clearTimeout(t); clearInterval(tick); };
    }, [showResume, handleResume]);

    const toggleTheaterMode = useCallback(() => {
      const m = !isTheaterMode; setIsTheaterMode(m);
      setStoredValue(STORAGE_KEYS.THEATER_MODE, m ? 1 : 0); onTheaterModeChange?.(m);
    }, [isTheaterMode, onTheaterModeChange]);

    useEffect(() => {
      const el = vRef.current; if (!el) return;
      const fn = () => {
        if (suggestions.length > 0) setShowEndScreen(true);
        onVideoEnd?.();
      };
      el.addEventListener("ended", fn); return () => el.removeEventListener("ended", fn);
    }, [onVideoEnd, suggestions.length]);

    useEffect(() => {
      const el = vRef.current; if (!el || !video?.url) return;
      try {
        const o = new URL(video.url).origin;
        const a = document.createElement("link"); a.rel = "preconnect"; a.href = o; a.crossOrigin = ""; document.head.appendChild(a);
        const b = document.createElement("link"); b.rel = "dns-prefetch"; b.href = o; document.head.appendChild(b);
      } catch { }
      el.setAttribute("playsinline", "true"); el.preload = "auto";

      const safePlay = () => { if (!autoPlay) return; el.play().catch(() => { el.muted = true; el.play().catch(() => { }); }); };

      if (video.url.endsWith(".m3u8")) {
        const live = /\/hls\/live\/|\/live\//.test(video.url);
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true, lowLatencyMode: live, startFragPrefetch: !live, capLevelToPlayerSize: true,
            startLevel: live ? -1 : 0, abrEwmaDefaultEstimate: live ? 1_200_000 : 900_000,
            abrBandWidthFactor: 0.95, abrBandWidthUpFactor: 0.7,
            maxBufferLength: live ? 6 : 20, maxMaxBufferLength: live ? 12 : 60, maxBufferSize: live ? 20e6 : 30e6,
            maxBufferHole: 0.3, backBufferLength: live ? 15 : 30,
            liveSyncDuration: live ? 3 : undefined, liveMaxLatencyDuration: live ? 10 : undefined,
            capLevelOnFPSDrop: true, fragLoadingTimeOut: 20000, fragLoadingMaxRetry: 6, fragLoadingRetryDelay: 1000,
            manifestLoadingTimeOut: 10000, manifestLoadingMaxRetry: 3,
            startPosition: startTime > 0 ? startTime : -1,
          });
          hlsRef.current = hls;
          hls.loadSource(video.url); hls.attachMedia(el);
          hls.on(Hls.Events.MANIFEST_PARSED, () => { actions.setLevels(hls.levels); if (startTime > 0) el.currentTime = startTime; safePlay(); });
          hls.on(Hls.Events.ERROR, (_, d) => {
            if (d.fatal) {
              if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
              else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
              else hls.destroy();
            }
          });
        } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
          el.src = video.url;
          el.addEventListener("loadedmetadata", () => { if (startTime > 0) el.currentTime = startTime; safePlay(); }, { once: true });
        }
      } else {
        el.src = video.url;
        el.addEventListener("loadedmetadata", () => { if (startTime > 0) el.currentTime = startTime; safePlay(); }, { once: true });
      }

      return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } el.src = ""; el.load(); };
    }, [video?.url, autoPlay, startTime, actions]);

    useEffect(() => { if (!ripple) return; const t = setTimeout(() => setRipple(null), 600); return () => clearTimeout(t); }, [ripple]);

    const resetHide = useCallback(() => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setShowControls(true); setShowCursor(true);
      hideTimer.current = setTimeout(() => { if (state.isPlaying) { setShowControls(false); setShowCursor(false); } }, CONTROL_HIDE_DELAY);
    }, [state.isPlaying]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
      const r = e.currentTarget.getBoundingClientRect();
      const side = e.clientX - r.left < r.width / 2 ? "left" : "right";
      actions.seekBy(side === "left" ? -SEEK_INTERVAL : SEEK_INTERVAL);
      setRipple({ side, key: Date.now() });
    }, [actions]);

    const handleTogglePlay = useCallback(() => {
      actions.playPause();
      // Flash the play/pause overlay for 800ms then hide — YouTube style
      setShowPlayPauseOverlay(true);
      if (playIconTimerRef.current) clearTimeout(playIconTimerRef.current);
      playIconTimerRef.current = setTimeout(() => setShowPlayPauseOverlay(false), 800);
    }, [actions]);

    const toggleFullscreen = useCallback(() => {
      const c = containerRef.current; if (!c) return;
      if (!document.fullscreenElement) { c.requestFullscreen?.().catch(() => { }); setIsFullscreen(true); }
      else { document.exitFullscreen?.(); setIsFullscreen(false); }
    }, []);

    useEffect(() => {
      const fn = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", fn);
      return () => document.removeEventListener("fullscreenchange", fn);
    }, []);

    useEffect(() => {
      const fn = (e: KeyboardEvent) => {
        if (["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName)) return;
        const k = e.key.toLowerCase();
        switch (k) {
		 case " ": case "k": e.preventDefault(); handleTogglePlay(); break;
          case "f": e.preventDefault(); toggleFullscreen(); break;
          case "t": e.preventDefault(); toggleTheaterMode(); break;
          case "m": e.preventDefault(); actions.toggleMute(); break;
          case "j": e.preventDefault(); actions.seekBy(-SEEK_INTERVAL); break;
          case "l": e.preventDefault(); actions.seekBy(SEEK_INTERVAL); break;
          case "arrowleft": e.preventDefault(); actions.seekBy(-5); break;
          case "arrowright": e.preventDefault(); actions.seekBy(5); break;
          case "arrowup": e.preventDefault(); actions.setVolume(state.volume + 0.1); break;
          case "arrowdown": e.preventDefault(); actions.setVolume(state.volume - 0.1); break;
          case "?": e.preventDefault(); setShowHelp(true); break;
          case "0": case "home": e.preventDefault(); actions.seekAbs(0); break;
          case "end": e.preventDefault(); actions.seekAbs(state.duration); break;
          default: if (k >= "1" && k <= "9") { e.preventDefault(); actions.seekAbs(state.duration * parseInt(k) / 10); }
        }
      };
      document.addEventListener("keydown", fn);
      return () => document.removeEventListener("keydown", fn);
   }, [actions, toggleFullscreen, toggleTheaterMode, state.volume, state.duration, handleTogglePlay]);

useImperativeHandle(ref, () => ({
  play: () => vRef.current?.play(),
  pause: () => vRef.current?.pause(),
  seek: (t: number) => actions.seekAbs(t),
  getState: () => state,
  getElement: () => vRef.current,
  isTheaterMode: () => isTheaterMode,
  // Direct property-style access for consumers like Watch.tsx that read
  // playerRef.current.currentTime / .duration without calling a method.
  get currentTime() { return vRef.current?.currentTime ?? 0; },
  get duration() { return vRef.current?.duration ?? state.duration ?? 0; },
}), [actions, state, isTheaterMode]);

    if (!video?.url) return (
      <div className={`w-full aspect-video bg-gradient-to-br from-zinc-900 to-black rounded-2xl flex items-center justify-center text-zinc-500 ${className}`}>
        <div className="text-center"><Play size={48} className="mx-auto mb-3 opacity-20" /><p className="text-sm font-medium">No video source provided</p></div>
      </div>
    );

    return (
      <div className={className}>
        <div style={{ position: "relative" }}>
          <AmbientGlow color={ambientColor} isPlaying={state.isPlaying} isTheaterMode={isTheaterMode} />

          <div ref={containerRef}
            className={`group relative w-full bg-black overflow-hidden shadow-2xl
              ${isTheaterMode
                ? "rounded-none sm:rounded-xl"
                : "rounded-none sm:rounded-2xl aspect-video"}`}
            style={{
              cursor: showCursor ? "default" : "none",
              zIndex: 1,
              /* Theater: fill most of the visual viewport; clamp so it's not too
                 tall on small phones but still immersive on big screens */
              ...(isTheaterMode ? { height: "clamp(42vw, 56svh, 80vh)" } : {}),
            }}
            onMouseMove={resetHide} onMouseEnter={resetHide} onTouchStart={resetHide} onDoubleClick={handleDoubleClick}>


            <AnimatePresence>
              {apiError && (
                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
                  className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-500/90 backdrop-blur-xl text-white text-sm font-medium rounded-lg shadow-lg">
                  {apiError}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showResume && resumeProgress && <ResumePrompt progress={resumeProgress} onResume={handleResume} onStart={handleStartOver} secondsLeft={resumeSecondsLeft} />}
            </AnimatePresence>

            <AnimatePresence>
              {ripple && (
                <motion.div key={ripple.key}
                  initial={{ opacity: 0, x: ripple.side === "left" ? -40 : 40, scale: 0.8 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: 1.2 }}
                  className={`absolute top-1/2 -translate-y-1/2 z-30 p-12 rounded-full bg-red-500/20 backdrop-blur-md border border-red-500/30 text-white pointer-events-none ${ripple.side === "left" ? "left-10" : "right-10"}`}>
                  <div className="flex flex-col items-center gap-2">
                    {ripple.side === "left" ? <Rewind size={36} fill="currentColor" /> : <FastForward size={36} fill="currentColor" />}
                    <span className="text-xs font-black">{SEEK_INTERVAL}s</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <video 
              ref={vRef} 
              className="block z-10 w-full h-full object-contain cursor-pointer"
              poster={video.poster} 
              playsInline 
              onClick={handleTogglePlay}
              style={{
                display: 'block',
                backfaceVisibility: 'hidden',
                WebkitFontSmoothing: 'antialiased',
                transform: 'translateZ(0)',
                willChange: 'auto',
              }}
            />

            {/* Floating Subscribe Overlay — appears once for 6s after playback
             * starts, then fades out for the rest of this viewing session. */}
            <AnimatePresence>
              {showSubscribeOverlay && (
              <motion.button
                initial={{ opacity: 0, scale: 0.85, y: 20 }}
                animate={{
                  opacity: 1,
                  y: [0, -6, 0],
                  scale: [1, 1.04, 1],
                }}
                exit={{ opacity: 0, scale: 0.85, y: 20, transition: { duration: 0.3 } }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                whileHover={{
                  scale: 1.08,
                }}
                whileTap={{
                  scale: 0.96,
                }}
                className="
      absolute
      top-12
      right-8
      z-50

	  hidden
	  md:flex
      flex
      items-center
      gap-0.5

      px-3.5
      py-2

      rounded-full

      bg-gradient-to-br
      from-red-500
      via-red-600
      to-red-700

      text-white
      font-semibold
      text-XS

      border
      border-white/10

      backdrop-blur-xl

      shadow-[0_8px_30px_rgba(239,68,68,0.45)]

      hover:shadow-[0_10px_40px_rgba(239,68,68,0.65)]

      transition-all
      duration-300
    "
              >
                {/* Glow */}
                <div className="absolute inset-0 rounded-full bg-red-500/20 blur-2xl -z-10" />

                {/* Pulse Dot */}
                <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />

                {/* Text */}
                <span className="tracking-wide">
                  Subscribe
                </span>
              </motion.button>
              )}
            </AnimatePresence>

            {channelWatermark && (
              <img
                src={channelWatermark}
                alt="Channel watermark"
                className="absolute right-3 z-20 h-9 w-9 rounded-sm object-contain opacity-80 shadow-lg transition-opacity hover:opacity-100 sm:h-11 sm:w-11"
                style={{ bottom: showControls ? 72 : 16 }}
              />
            )}

            {state.isBuffering && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/10 backdrop-blur-[2px]">
                <Loader2 className="w-14 h-14 text-red-400 animate-spin" />
              </div>
            )}

            {state.error && <ErrorDisplay message={state.error} onRetry={() => { actions.clearError(); window.location.reload(); }} />}

            <AnimatePresence>
              {showPlayPauseOverlay && !state.isBuffering && !state.error && (
                <motion.div
                  key={state.isPlaying ? "play-flash" : "pause-flash"}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.15 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="relative absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
                >
                  {/* YouTube-style: dark circle, smaller icon, no border */}
                  <div className="p-3.5 rounded-full bg-black/50 backdrop-blur-sm shadow-lg">
                    {state.isPlaying
                      ? <Pause size={28} fill="white" className="text-white" />
                      : <Play size={28} fill="white" className="text-white ml-0.5" />
                    }
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {showControls && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  style={{
                    position: "absolute", bottom: 0, left: 0, right: 0,
                    zIndex: 30, pointerEvents: "none",
                  }}>
                  <div style={{ pointerEvents: "auto" }}>
                    <Controls
                      {...state}
                      onPlayPause={handleTogglePlay}
                      onSeekBy={actions.seekBy} onSeekTo={actions.seekAbs}
                      onVolume={actions.setVolume} onToggleMute={actions.toggleMute}
                      onTogglePiP={actions.togglePiP} onSetRate={actions.setPlaybackRate}
                      isFullscreen={isFullscreen} onToggleFullscreen={toggleFullscreen}
                      likes={likes} liked={liked} onToggleLike={toggleLike}
                      dislikes={dislikes} disliked={disliked} onToggleDislike={toggleDislike}
                      isPiPSupported={isPiPSupported} isAuthenticated={isAuthenticated}
                      levels={state.levels} currentLevel={state.currentLevel} onSetLevel={actions.setLevel}
                      isTheaterMode={isTheaterMode} onToggleTheater={toggleTheaterMode}
                      onShowHelp={() => setShowHelp(true)}
                      spriteUrl={spriteUrl}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Video End Screen ── */}
            <AnimatePresence>
              {showEndScreen && suggestions.length > 0 && (
                <VideoEndScreen
                  suggestions={suggestions}
                  autoplay={autoplayNext}
                  onReplay={() => {
                    setShowEndScreen(false);
                    actions.seekAbs(0);
                    vRef.current?.play();
                  }}
                  onDismiss={() => setShowEndScreen(false)}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {showHelp && <KeyboardShortcuts onClose={() => setShowHelp(false)} />}
        </AnimatePresence>
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;