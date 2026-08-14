import React, { useState, useEffect, useCallback, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import type Hls from "hls.js";
import ShortsSection from "../components/ShortsSection";
import { API_URL } from "../utils/constants";
import { channelUrl } from "../utils/channelUrl";
import { useCachedData } from "../utils/useCachedData";
import { invalidateCache } from "../utils/metadataCache";

/* ─────────────────────────────────────────────────────────────
 * CATEGORIES
 * ───────────────────────────────────────────────────────────── */

const CATEGORIES = [
  "All", "Music", "Gaming", "News", "Sports", "Movies",
  "Tech", "Podcasts", "Education", "Comedy", "Lifestyle", "Travel",
];

// First paint fetches this many; infinite scroll appends this many per page.
const PAGE_SIZE = 24;

/* ─────────────────────────────────────────────────────────────
 * INDEPENDENCE DAY — FLOATING KITES
 * A subtle, once-per-session celebratory touch around 15 August.
 * Kites (patang) rather than generic confetti/flag clipart — a more
 * distinctive, culturally specific nod that fits the platform's
 * India-first positioning without looking like a stock holiday banner.
 * ───────────────────────────────────────────────────────────── */

function isIndependenceDayWindow(): boolean {
  const now = new Date();
  return now.getMonth() === 7 && now.getDate() >= 13 && now.getDate() <= 16; // August 13–16
}

function Kite({ delay, left, size, tint }: { delay: number; left: string; size: number; tint: string }) {
  return (
    <motion.div
      aria-hidden
      className="absolute top-0 pointer-events-none"
      style={{ left }}
      initial={{ y: -80, x: 0, opacity: 0, rotate: -8 }}
      animate={{
        y: "70vh",
        x: [0, 24, -16, 12, 0],
        opacity: [0, 1, 1, 1, 0],
        rotate: [-8, 6, -6, 4, 0],
      }}
      transition={{ duration: 6, delay, ease: "easeInOut" }}
    >
      <svg width={size} height={size} viewBox="0 0 40 50" fill="none">
        <path d="M20 2 L36 20 L20 38 L4 20 Z" fill={tint} opacity="0.9" />
        <path d="M20 2 L20 38 M4 20 L36 20" stroke="#fff" strokeWidth="0.5" opacity="0.5" />
        <path
          d="M20 38 Q22 42 19 45 Q23 47 20 50"
          stroke={tint}
          strokeWidth="1.2"
          fill="none"
          opacity="0.7"
        />
      </svg>
    </motion.div>
  );
}

function FloatingKites() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isIndependenceDayWindow()) return;
    // Once per browser session — a returning visitor navigating between
    // pages shouldn't see this replay every single time they land back
    // on the homepage.
    try {
      if (sessionStorage.getItem("independence_kites_shown") === "1") return;
      sessionStorage.setItem("independence_kites_shown", "1");
    } catch { }
    setShow(true);
    const t = setTimeout(() => setShow(false), 7000);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-40 overflow-hidden pointer-events-none" aria-hidden>
      <Kite delay={0} left="12%" size={38} tint="#FF9933" />
      <Kite delay={0.6} left="55%" size={30} tint="#FFFFFF" />
      <Kite delay={1.1} left="80%" size={34} tint="#138808" />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * SHIMMER
 * ───────────────────────────────────────────────────────────── */

function ShimmerCard() {
  return (
    <div className="animate-pulse">
      {/* ✅ CLS Prevention: Skeleton aspect-ratio matches actual thumbnail (16:9) */}
      <div
        className="rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 aspect-video mb-4 relative overflow-hidden"
        style={{ containIntrinsicSize: "auto 11rem" }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-red-500/10 to-transparent shimmer" />
      </div>
      <div className="flex gap-3">
        {/* Avatar skeleton — 1:1 aspect ratio */}
        <div
          className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-800 rounded-full flex-shrink-0"
          style={{ aspectRatio: "1" }}
        />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-gradient-to-r from-gray-700 to-gray-800 rounded w-3/4" />
          <div className="h-3 bg-gradient-to-r from-gray-700 to-gray-800 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * HELPERS
 * ───────────────────────────────────────────────────────────── */

function timeAgo(dateStr: string) {
  if (!dateStr) return "";
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
  return `${Math.floor(diff / 31536000)} years ago`;
}

function fmtViews(num?: number) {
  if (num === undefined || num === null) return "0 views";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M views`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K views`;
  return `${num} views`;
}

/**
 * formatEmailAsName — ONLY used as a last resort fallback.
 * In practice getDisplayName() will pick up the saved channel name first.
 */
function formatEmailAsName(raw: string): string {
  const local = raw.includes("@") ? raw.split("@")[0] : raw;
  return (
    local
      .split(/[._\-0-9]+/)
      .filter(Boolean)
      .map((p: string) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || raw
  );
}

function formatChannelName(raw: string): string {
  const cleaned = raw.trim().replace(/^@/, "");
  if (!cleaned) return "";

  const spaced = cleaned
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .replace(/\bncr\b/gi, "NCR")
    .replace(/([a-z])ncr$/i, "$1 NCR")
    .replace(/\byadav\s*vineet\b/i, "Yadav Vineet")
    .replace(/\s{2,}/g, " ")
    .trim();

  return spaced
    .split(" ")
    .filter(Boolean)
    .map(part => part.toUpperCase() === part ? part : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/** Clean up raw filename-style titles */
function formatVideoTitle(title: string): string {
  if (!title) return "Untitled";
  return title
    .replace(/\.(mp4|mkv|avi|mov|webm|flv|wmv)$/i, "")
    .replace(
      /[_\s]+(8K|4K|2K|2160p|1440p|1080p|720p|480p|360p|240p|144p|HDR|SDR|HEVC|x264|x265|BluRay|WEBRip|WEB-DL|BRRip|DVDRip)[\w.-]*/gi,
      ""
    )
    .replace(/_/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * getDisplayName — uses only server-provided fields.
 * PostgreSQL is the single source of truth; we never read localStorage here.
 *
 * Priority:
 *  1. server-provided channel_name (stored in DB)
 *  2. server-provided uploader_name
 *  3. Format the email local part as a human name (last resort)
 */
function getDisplayName(video: any): string {
  // 1️⃣ Server-provided channel_name from DB (channel_customizations.channel_name)
  const channelName = video.channel_name || "";
  if (channelName && !channelName.includes("@")) {
    return formatChannelName(channelName);
  }

  // 2️⃣ Server-provided uploader_name
  const serverName = video.uploader_name || "";
  if (serverName && !serverName.includes("@")) {
    return formatChannelName(serverName);
  }

  // 3️⃣ Format the email local part
  const email = video.uploader_email || video.uploader || "";
  if (email && email.includes("@")) return formatEmailAsName(email);
  if (email) return formatChannelName(email);

  // 4️⃣ Hard fallback
  return "AirStream Creator";
}

function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * SUPPORTS_HOVER_PREVIEW — computed once at module load.
 * true only for devices with a real mouse (hover: hover, pointer: fine).
 * Touch phones/tablets never fire a meaningful hover, so we use this to
 * skip mounting <video> elements, skip loading hls.js, and skip the
 * manifest-prefetch fetch entirely on mobile — real memory/bandwidth wins.
 */
const SUPPORTS_HOVER_PREVIEW =
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/**
 * cloudinaryResize — appends a width/quality/format transform to a
 * Cloudinary delivery URL so we serve mobile-grid-sized thumbnails to
 * mobile, not the same asset we serve to a 3-column desktop grid.
 * Falls back to the original URL untouched for non-Cloudinary sources
 * (e.g. MinIO-hosted assets), so it's always safe to call.
 */
function cloudinaryResize(url: string | undefined, width: number): string {
  if (!url) return "";
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const before = url.slice(0, idx + marker.length);
  const after = url.slice(idx + marker.length);
  return `${before}w_${width},q_auto,f_auto,c_fill/${after}`;
}

/* ─────────────────────────────────────────────────────────────
 * PREFETCH
 * ───────────────────────────────────────────────────────────── */

const PREFETCHED = new Set<string | number>();

function preconnectTo(url: string) {
  try {
    const origin = new URL(url).origin;
    const a = document.createElement("link");
    a.rel = "preconnect";
    a.href = origin;
    a.crossOrigin = "";
    document.head.appendChild(a);
    const b = document.createElement("link");
    b.rel = "dns-prefetch";
    b.href = origin;
    document.head.appendChild(b);
  } catch { }
}

function prefetchVideo(video: any) {
  if (!video?.url || PREFETCHED.has(video.id)) return;
  PREFETCHED.add(video.id);
  preconnectTo(video.url);
  try {
    if (video.url.endsWith(".m3u8"))
      fetch(video.url, { method: "GET", mode: "no-cors", cache: "force-cache" }).catch(
        () => { }
      );
  } catch { }
}

/* ─────────────────────────────────────────────────────────────
 * VIDEO PREVIEW HOOK
 * ───────────────────────────────────────────────────────────── */

function useVideoPreview(videoUrl: string | undefined) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(false);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const el = videoRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    setActive(false);
  }, []);

  const startPreview = useCallback(() => {
    // No hover capability (phones/tablets) -> never attempt a preview.
    // This is what lets us skip loading hls.js and mounting <video> at all.
    if (!videoUrl || !SUPPORTS_HOVER_PREVIEW) return;
    timerRef.current = setTimeout(async () => {
      const el = videoRef.current;
      if (!el) return;

      if (videoUrl.endsWith(".m3u8")) {
        // Loaded on-demand — only desktop hover users ever pay this cost.
        const { default: HlsCtor } = await import("hls.js");

        if (HlsCtor.isSupported()) {
          const hls = new HlsCtor({
            enableWorker: true,
            startLevel: 0,
            maxBufferLength: 8,
            maxMaxBufferLength: 12,
            manifestLoadingTimeOut: 8000,
            fragLoadingTimeOut: 8000,
          });
          hlsRef.current = hls;
          hls.loadSource(videoUrl);
          hls.attachMedia(el);
          hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
            el.play().catch(() => { });
            setActive(true);
          });
          hls.on(HlsCtor.Events.ERROR, (_, data) => {
            if (data.fatal) cleanup();
          });
        } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
          el.src = videoUrl;
          el.play().then(() => setActive(true)).catch(() => cleanup());
        }
      } else {
        el.src = videoUrl;
        el.play().then(() => setActive(true)).catch(() => cleanup());
      }
    }, 600);
  }, [videoUrl, cleanup]);

  const stopPreview = useCallback(() => cleanup(), [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { videoRef, active, startPreview, stopPreview };
}

/* ─────────────────────────────────────────────────────────────
 * THUMBNAIL WITH PREVIEW
 * ───────────────────────────────────────────────────────────── */

interface ThumbnailProps {
  video: any;
  className?: string;
}

const ThumbnailWithPreview = React.memo(function ThumbnailWithPreview({
  video,
  className = "",
}: ThumbnailProps) {
  const duration = formatDuration(video.duration);
  const { videoRef, active, startPreview, stopPreview } = useVideoPreview(video.url);

  return (
    <div
      className={`relative overflow-hidden bg-black rounded-xl ${className}`}
      style={{
        aspectRatio: "16 / 9",
        containIntrinsicSize: "auto 11rem", // ✅ CLS Prevention: Reserve space
      }}
      onMouseEnter={() => {
        // Skip preconnect/manifest-prefetch on touch devices — mouseenter
        // rarely fires meaningfully there and it just burns mobile data.
        if (SUPPORTS_HOVER_PREVIEW) {
          prefetchVideo(video);
          startPreview();
        }
      }}
      onMouseLeave={stopPreview}
    >
      {/* Static thumbnail — ✅ CLS Prevention: Always occupy full space.
          srcSet serves a mobile-grid-sized asset instead of the same
          image used in a 3-column desktop grid — biggest LCP win on
          data-constrained connections. */}
      <img
        decoding="async"
        src={cloudinaryResize(video.thumbnail, 480)}
        srcSet={`${cloudinaryResize(video.thumbnail, 320)} 320w, ${cloudinaryResize(video.thumbnail, 480)} 480w, ${cloudinaryResize(video.thumbnail, 640)} 640w`}
        sizes="(max-width: 768px) 45vw, (max-width: 1024px) 30vw, 360px"
        alt={video.title}
        loading="lazy"
        className="video-thumbnail absolute inset-0 transition-all duration-500"
        width={320}
        height={180}
        style={{
          opacity: active ? 0 : 1,
          transform: active ? "scale(1.05)" : "scale(1)",
        }}
      />

      {/* Preview video — only mounted for devices that can trigger it.
          On phones this saves ~50 idle <video> elements from ever
          existing in the DOM. */}
      {SUPPORTS_HOVER_PREVIEW && (
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
          style={{ opacity: active ? 1 : 0 }}
          muted
          loop
          playsInline
          disablePictureInPicture
          preload="none"
        />
      )}

      {/* Hover play button */}
      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity duration-300"
        style={{ opacity: active ? 0 : undefined }}
      >
        <div
          className="w-14 h-14 bg-red-500/90 rounded-full flex items-center justify-center
                      transform scale-0 group-hover:scale-100 transition-transform duration-300
                      shadow-xl shadow-red-500/50 opacity-0 group-hover:opacity-100"
        >
          <svg
            className="w-6 h-6 text-white ml-1"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
          </svg>
        </div>
      </div>

      {/* Gradient overlay */}
      <div
        className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent
                   transition-opacity duration-300 opacity-0 group-hover:opacity-100"
      />

      {/* PREVIEW pill */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -4 }}
            transition={{ duration: 0.2 }}
            className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/80 backdrop-blur-sm
                       border border-red-500/50 rounded-full px-2.5 py-1 z-10"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-[10px] font-bold text-red-400 tracking-widest uppercase">
              Preview
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duration badge */}
      {duration && (
        <div
          className="absolute bottom-2 right-2 bg-black/90 text-white text-xs font-bold px-1.5 py-0.5 rounded z-10 transition-opacity duration-300"
          style={{ opacity: active ? 0.6 : 1 }}
        >
          {duration}
        </div>
      )}

      {/* Muted indicator */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/70 backdrop-blur-sm
                       rounded-full px-2 py-1 z-10"
          >
            <svg
              className="w-3 h-3 text-gray-300"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[10px] text-gray-300 font-medium">Muted</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/* ─────────────────────────────────────────────────────────────
 * HERO VIDEO
 * ───────────────────────────────────────────────────────────── */

/**
 * HeroSkeleton — shown only while we're still waiting to find out
 * whether an admin-featured video exists. Matches HeroVideo's exact
 * height classes so nothing below it (the Shorts row) shifts upward
 * during that brief window and then jumps back down once the real
 * hero mounts — that jump was being misread as "a short flashing in
 * the featured section."
 */
function HeroSkeleton() {
  return (
    <div className="relative w-full h-[42vh] sm:h-[48vh] md:h-[58vh] min-h-[32vh] max-h-[70vh] rounded-3xl overflow-hidden mb-10 bg-[#141414] animate-pulse" />
  );
}

function HeroVideo({ video }: { video: any }) {
  const displayName = getDisplayName(video);
  return (
    <Link
      to={`/watch?v=${video.public_id || video.id}`}
      onMouseEnter={() => prefetchVideo(video)}
      onFocus={() => prefetchVideo(video)}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative w-full h-[42vh] sm:h-[48vh] md:h-[58vh] min-h-[32vh] max-h-[70vh] rounded-3xl overflow-hidden mb-10 group shadow-2xl shadow-red-500/10 hover:shadow-red-500/20 transition-shadow"
      >
        <img
          loading="eager"
          fetchPriority="high"
          decoding="sync"
          src={cloudinaryResize(video.thumbnail, 960)}
          srcSet={`${cloudinaryResize(video.thumbnail, 640)} 640w, ${cloudinaryResize(video.thumbnail, 960)} 960w, ${cloudinaryResize(video.thumbnail, 1440)} 1440w`}
          sizes="100vw"
          alt={video.title}
          className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        {/* Extra scrim anchored right behind the text block — the gradient
            above alone wasn't always enough on bright thumbnails (light
            skies, white backgrounds), leaving title/CTA text hard to read. */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/95 via-black/40 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 via-transparent to-red-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {video.duration && (
          <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm text-white text-[10px] sm:text-xs font-bold px-2 py-1 rounded-md">
            {formatDuration(video.duration)}
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span className="inline-block px-2.5 py-0.5 bg-white/10 backdrop-blur-sm border border-white/25 text-gray-200 rounded-full text-[10px] md:text-xs font-semibold mb-2">
              Featured
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="text-base sm:text-xl md:text-4xl font-bold text-white leading-tight mb-2 line-clamp-2"
          >
            {formatVideoTitle(video.title)}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            className="text-gray-200 text-xs md:text-base flex items-center gap-2 overflow-hidden"
          >
            <span className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center text-[10px] md:text-xs font-bold flex-shrink-0">
              {displayName[0].toUpperCase()}
            </span>
            <span className="truncate">{displayName}</span>
            <span className="text-gray-400 flex-shrink-0">
              • {timeAgo(video.created_at)}
            </span>
          </motion.p>

          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-3 md:mt-5 inline-flex items-center gap-1.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-4 py-2 md:px-6 md:py-3 rounded-full text-xs md:text-sm font-semibold shadow-lg transition-all duration-300"
          >
            <svg
              className="w-3 h-3 md:w-4 md:h-4"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            Watch Now
          </motion.button>
        </div>
      </motion.div>
    </Link>
  );
}

/* ─────────────────────────────────────────────────────────────
 * MAIN COMPONENT
 * ───────────────────────────────────────────────────────────── */

interface HomeFeedProps {
  searchQuery?: string;
}

export default function HomeFeed({ searchQuery = "" }: HomeFeedProps) {
  const [category, setCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Channel customization cache (email -> {channelName, avatarUrl}).
  // This stays in a ref so it survives re-renders within ONE mount,
  // but the real cross-visit caching now comes from useCachedData below.
  const channelCacheRef = useRef<Record<string, { channelName: string; avatarUrl: string }>>({});
// ── Admin-set featured video (from featured_videos table) ──
  const [adminFeatured, setAdminFeatured] = useState<any>(null);
  // Distinguishes "haven't checked yet" from "checked, nothing pinned" —
  // without this, the hero briefly rendered whatever the algorithmic
  // fallback picked (e.g. a totally different video) for the split
  // second before this fetch resolved, then flashed to the real pinned
  // video. Now we simply don't compute a fallback until we actually
  // know one way or the other.
  const [adminFeaturedLoading, setAdminFeaturedLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/featured/current`)
      .then((r) => r.json())
      .then((data) => setAdminFeatured(data.featured || null))
      .catch(() => setAdminFeatured(null))
      .finally(() => setAdminFeaturedLoading(false));
  }, []);
  // ── Debounce search input so we don't fire a request on every keystroke ──
  // (category changes are NOT debounced — switching tabs should feel instant)
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  useEffect(() => {
    if (!searchQuery) {
      setDebouncedSearch("");
      return;
    }
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /**
   * ── THE CACHE LAYER ──────────────────────────────────────────────
   * Cache key encodes search + category, so each unique combination
   * (e.g. "All" videos vs "Gaming" videos) is cached separately.
   *
   * First visit to a given key  -> real network fetch, then cached.
   * Return visit to the SAME key (e.g. coming back to the homepage
   * with "All" selected, which is the common case) -> the video grid
   * appears INSTANTLY from cache, then quietly refreshes in the
   * background if the cached copy is older than 5 minutes.
   * ────────────────────────────────────────────────────────────── */
  const cacheKey = `videos:${debouncedSearch || "none"}:${category}`;

  /**
   * fetchVideoPage — the shared fetch+enrich logic, now offset-aware.
   * Used both by the cached first page (via fetchVideos below) and by
   * infinite scroll's loadMore. `type=long` moves short-filtering to the
   * server instead of fetching shorts data over the wire just to discard it.
   */
  const fetchVideoPage = useCallback(
    async (offset: number) => {
      const params = new URLSearchParams();
      if (debouncedSearch?.trim()) params.append("search", debouncedSearch.trim());
      if (category && category !== "All") params.append("category", category);
      params.append("type", "long");
      params.append("limit", String(PAGE_SIZE));
      params.append("offset", String(offset));

      const res = await fetch(`${API_URL}/videos?${params.toString()}`);
      const data = await res.json();
      // Client-side filter kept as a safety net in case the backend hasn't
      // shipped `type=long` support yet — remove once confirmed server-side.
      const all: any[] = (data.videos || []).filter(
        (v: any) => !v.duration || v.duration > 60
      );

      // ── Enrich videos with channel_name + avatar_url from DB ──────────
      const uncachedEmails = [
        ...new Set(
          all
            .map((v: any) => v.uploader_email || v.uploader || "")
            .filter((e: string) => e && e.includes("@") && !channelCacheRef.current[e])
        ),
      ] as string[];

      if (uncachedEmails.length > 0) {
        const batchRes = await fetch(`${API_URL}/api/channel-customization/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emails: uncachedEmails }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);

        uncachedEmails.forEach((email) => {
          const c = batchRes?.customizations?.[email];
          channelCacheRef.current[email] = {
            channelName: c?.channelName?.trim() || "",
            avatarUrl: c?.avatarDataUrl || "",
          };
        });
      }

      const enriched = all.map((v: any) => {
        const email = v.uploader_email || v.uploader || "";
        const cached = channelCacheRef.current[email];
        return {
          ...v,
          channel_name: cached?.channelName || v.channel_name || "",
          avatar_url: cached?.avatarUrl || v.avatar_url || "",
        };
      });

      return { videos: enriched, total: data.total || enriched.length || 0 };
    },
    [debouncedSearch, category]
  );

  // First page only — this is what stays behind the 5-minute cache so
  // returning to the homepage still renders instantly.
  const fetchVideos = useCallback(() => fetchVideoPage(0), [fetchVideoPage]);

  const {
    data: videoData,
    loading,
    revalidating: isSearching,
  } = useCachedData(cacheKey, fetchVideos, {
    ttl: 5 * 60 * 1000, // 5 minutes — tweak freely
  });

  const baseVideos = videoData?.videos ?? [];
  const totalResults = videoData?.total ?? 0;

  /* ── Infinite scroll: pages beyond the first, appended locally ──────
     Deliberately NOT routed through useCachedData — only the first page
     needs instant-on-return caching; deeper pages are cheap to refetch
     and caching them would bloat the cache for little benefit. */
  const [moreVideos, setMoreVideos] = useState<any[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(PAGE_SIZE);

  // New search/category -> reset pagination back to page one.
  useEffect(() => {
    setMoreVideos([]);
    offsetRef.current = PAGE_SIZE;
    setHasMore(true);
  }, [cacheKey]);

  // Dedupe by ID before rendering — guards against the same video showing
  // up twice if a later page's fetch overlaps with an earlier one (e.g.
  // new uploads landing between page fetches shift offset-based
  // pagination, or two videos share an identical sort-key timestamp).
  // Keeps the FIRST occurrence's position so ordering stays stable.
  const videos = (() => {
    const seen = new Set<string>();
    const combined: any[] = [];
    for (const v of [...baseVideos, ...moreVideos]) {
      const id = String(v.id ?? v.public_id ?? "");
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      combined.push(v);
    }
    return combined;
  })();

  useEffect(() => {
    if (!loading && videos.length >= totalResults) setHasMore(false);
  }, [loading, videos.length, totalResults]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    try {
      const { videos: nextVideos } = await fetchVideoPage(offsetRef.current);
      if (nextVideos.length === 0) {
        setHasMore(false);
      } else {
        setMoreVideos((prev) => [...prev, ...nextVideos]);
        offsetRef.current += PAGE_SIZE;
        if (nextVideos.length < PAGE_SIZE) setHasMore(false);
      }
    } catch {
      // Silent fail — sentinel stays put, a re-scroll retries naturally.
    } finally {
      setLoadingMore(false);
    }
  }, [fetchVideoPage, loadingMore, hasMore, loading]);

  // Sentinel div at the bottom of the grid triggers loadMore ~2 screens
  // before the user actually hits the bottom, so the next page is ready
  // before they get there.
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || loading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "800px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, loading]);

  useEffect(() => {
    if (videos.length > 0 && videos[0]?.thumbnail) {
      const existing = document.querySelector(
        `link[rel="preload"][href="${videos[0].thumbnail}"]`
      );

      if (!existing) {
        const link = document.createElement("link");
        link.rel = "preload";
        link.as = "image";
        link.href = videos[0].thumbnail;
        link.fetchPriority = "high";
        document.head.appendChild(link);
      }
    }
  }, [videos]);

  // Admin-set featured video takes priority (editorial pick — see
  // /api/featured/current in server.js). If nothing is currently pinned,
  // we used to fall back to `videos[0]` — literally "whatever was most
  // recently uploaded," with zero quality check. That's how a raw
  // filename and an internal test account ended up as the homepage hero.
  //
  // Instead: pick the highest-engagement (views) video among ones that
  // actually have a real branded channel name set. A video whose
  // channel_name is empty, is a raw email, or is still the generic
  // "Creator" placeholder means that uploader never customized their
  // channel — not something we want to spotlight as the site's first
  // impression. If nothing qualifies, the hero section simply doesn't
  // render (see the `featuredVideo &&` guard below) rather than showing
  // something low-quality.
  const scoredFallback = [...videos]
    .filter((v) => {
      const name = (v.channel_name || "").trim();
      if (!name) return false;
      if (name.includes("@")) return false;
      if (name.toLowerCase() === "creator") return false;
      // Extra-strict short-video guard, specifically for the hero pick.
      // The general feed filter treats "duration unknown" as "assume
      // it's fine" (lenient, reasonable for a grid). For the hero,
      // being wrong is much more visible, so we require a CONFIRMED
      // duration over 60s — an unknown/missing duration (e.g. a short
      // still mid-processing) is excluded rather than assumed safe.
      if (!v.duration || v.duration <= 60) return false;
      const title = (v.title || "").toLowerCase();
      if (title.includes("#shorts") || title.includes("shorts")) return false;
      return true;
    })
    .sort((a, b) => (b.views || 0) - (a.views || 0))[0];

  const featuredVideo = adminFeatured || (adminFeaturedLoading ? null : scoredFallback) || null;

  const displayedVideos =
    !searchQuery && featuredVideo
      ? videos.filter((v) => String(v.id) !== String(featuredVideo.id))
      : videos;

  const handleCategoryChange = useCallback((c: string) => {
    setCategory(c);
    // No need to manually set loading=true here anymore — useCachedData
    // shows cached data instantly if we have it for this category, or
    // a real loading state only if this category was never visited.
  }, []);

  /* ── Loading state ── */
  if (loading) {
    return (
      <div className="p-3 md:p-6 lg:p-8 pb-24 md:pb-8">
        <div
          className="mb-4 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 animate-pulse"
          style={{ height: "clamp(200px, 48vw, 65vh)" }}
        />
        <CategoryTabs category={category} setCategory={handleCategoryChange} />
        <div className="grid gap-3 md:gap-6 mt-4 grid-cols-2 lg:grid-cols-3">
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <ShimmerCard key={i} />
            ))}
        </div>
      </div>
    );
  }

  /* ── Empty state ── */
  if (!videos.length && !searchQuery && category === "All") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <div className="w-20 h-20 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-red-500/50">
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          No videos available
        </h3>
        <p className="text-gray-400 text-sm text-center">
          Check back later for new content!
        </p>
      </div>
    );
  }

  /* ── Main feed ── */
  return (
    <div className="p-3 md:p-6 lg:p-8 pb-24 md:pb-8">

      <FloatingKites />

      {/* Hero */}
      {!searchQuery && adminFeaturedLoading && <HeroSkeleton />}
      {!searchQuery && !adminFeaturedLoading && featuredVideo && <HeroVideo video={featuredVideo} />}

      {/* Shorts */}
      <ShortsSection />

      {/* Search banner */}
      {searchQuery && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl"
        >
          <p className="text-xs md:text-sm text-red-400">
            Results for:{" "}
            <span className="font-bold">"{searchQuery}"</span>
            <span className="text-gray-400 ml-2">
              ({isSearching ? "Searching..." : `${totalResults} found`})
            </span>
          </p>
        </motion.div>
      )}

      {/* Category + view toggle */}
      <div className="flex items-center gap-2 mb-3 md:mb-6">
        <div className="flex-1 overflow-x-auto scrollbar-hide">
          <CategoryTabs category={category} setCategory={handleCategoryChange} />
        </div>
        <div className="flex items-center flex-shrink-0">
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>
      </div>

      {/* Searching shimmer — only when we have NOTHING cached to show yet.
          If we already have cached videos on screen, a background
          revalidation should NOT hide them — that would defeat the
          whole point of caching (instant display on return visits). */}
      {isSearching && videos.length === 0 && (
        <div className="grid gap-3 md:gap-6 grid-cols-2 lg:grid-cols-3">
          {Array(6)
            .fill(0)
            .map((_, i) => (
              <ShimmerCard key={i} />
            ))}
        </div>
      )}

      {/* No results */}
      {!isSearching && videos.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16 px-4"
        >
          <div className="w-16 h-16 bg-[#110000] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-gray-300 mb-2">
            No videos found
          </h3>
          <p className="text-gray-400 text-sm">
            {searchQuery
              ? `No results for "${searchQuery}"`
              : `No videos in ${category}`}
          </p>
        </motion.div>
      )}

      {/* Video grid / list */}
      {displayedVideos.length > 0 && (
        <motion.div
          layout
          className={
            viewMode === "grid"
              ? "grid gap-x-3 gap-y-5 md:gap-x-6 md:gap-y-10 grid-cols-2 lg:grid-cols-3"
              : "space-y-2 md:space-y-4"
          }
        >
          <AnimatePresence mode="popLayout">
            {displayedVideos.map((v) =>
              viewMode === "grid" ? (
                <VideoCard key={v.id} video={v} />
              ) : (
                <VideoCardList key={v.id} video={v} />
              )
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Infinite scroll sentinel — invisible, just triggers loadMore
          when it enters the viewport (with 800px of lead time). */}
      {hasMore && displayedVideos.length > 0 && (
        <div ref={sentinelRef} className="h-1" aria-hidden="true" />
      )}

      {loadingMore && (
        <div className="grid gap-3 md:gap-6 mt-4 md:mt-6 grid-cols-2 lg:grid-cols-3">
          {Array(3)
            .fill(0)
            .map((_, i) => (
              <ShimmerCard key={`more-${i}`} />
            ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * CATEGORY TABS
 * ───────────────────────────────────────────────────────────── */

function CategoryTabs({ category, setCategory }: any) {
  return (
    <div className="flex overflow-x-auto space-x-2 md:space-x-3 pb-1 scrollbar-hide">
      {CATEGORIES.map((c) => (
        <motion.button
          key={c}
          onClick={() => setCategory(c)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={`px-3 md:px-5 py-1.5 md:py-3 text-xs md:text-sm rounded-full transition-all whitespace-nowrap font-medium min-h-[32px] md:min-h-[44px] flex items-center justify-center flex-shrink-0
            ${category === c
              ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30"
              : "bg-[#1a1a1a] text-gray-300 hover:bg-red-500/10 hover:text-red-400 border border-gray-800"
            }`}
        >
          {c}
        </motion.button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * VIEW TOGGLE
 * ───────────────────────────────────────────────────────────── */

function ViewToggle({ viewMode, setViewMode }: any) {
  return (
    <div className="flex gap-2 bg-[#1a1a1a] p-1 rounded-xl border border-gray-800 flex-shrink-0">
      <button
        onClick={() => setViewMode("grid")}
        className={`px-3 py-2 rounded-lg transition-all ${viewMode === "grid"
          ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30"
          : "text-gray-400 hover:text-red-400 hover:bg-red-500/10"
          }`}
        title="Grid View"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      </button>
      <button
        onClick={() => setViewMode("list")}
        className={`px-3 py-2 rounded-lg transition-all ${viewMode === "list"
          ? "bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg shadow-red-500/30"
          : "text-gray-400 hover:text-red-400 hover:bg-red-500/10"
          }`}
        title="List View"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * VIDEO CARD — GRID
 * ───────────────────────────────────────────────────────────── */

const VideoCard = React.memo(function VideoCard({ video }: { video: any }) {
  const displayName = getDisplayName(video);
  const navigate = useNavigate();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25 }}
    >
      <Link to={`/watch?v=${video.public_id || video.id}`} className="group block">
        <ThumbnailWithPreview
          video={video}
          className="aspect-video rounded-xl shadow-lg hover:shadow-red-500/20 transition-shadow"
        />

        <div className="flex mt-2 md:mt-3 gap-2 md:gap-3">
          {/* Channel avatar */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              navigate(channelUrl(video.uploader_email || video.uploader || ""));
            }}
            className="flex-shrink-0 cursor-pointer"
          >
            {video.avatar_url ? (
              <img
                src={video.avatar_url}
                alt={displayName}
                className="w-8 h-8 md:w-10 md:h-10 rounded-full object-cover shadow-lg"
                onError={(e) => {
                  // If Cloudinary image fails, fall back to gradient initial
                  (e.target as HTMLImageElement).style.display = "none";
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                }}
              />
            ) : null}
            <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white flex items-center justify-center text-xs font-bold shadow-lg shadow-red-500/30 ${video.avatar_url ? "hidden" : ""}`}>
              {displayName[0]?.toUpperCase() || "?"}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-xs md:text-sm font-semibold text-white line-clamp-2 group-hover:text-red-400 transition-colors leading-snug">
              {formatVideoTitle(video.title)}
            </h3>

            {/* Channel name — now shows saved channel name, not email */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                navigate(channelUrl(video.uploader_email || video.uploader || ""));
              }}
              className="text-[11px] md:text-xs text-gray-400 mt-0.5 truncate hover:text-red-400 transition-colors cursor-pointer"
            >
              {displayName}
            </div>

            <p className="text-[11px] md:text-xs text-gray-400 flex items-center gap-1 mt-0.5">
              <span>{fmtViews(video.views)}</span>
              <span>•</span>
              <span>{timeAgo(video.createdAt || video.created_at)}</span>
            </p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
});

/* ─────────────────────────────────────────────────────────────
 * VIDEO CARD — LIST
 * ───────────────────────────────────────────────────────────── */

const VideoCardList = React.memo(function VideoCardList({
  video,
}: {
  video: any;
}) {
  const displayName = getDisplayName(video);
  const navigate = useNavigate();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
    >
      <Link
        to={`/watch?v=${video.public_id || video.id}`}
        className="group flex gap-3 md:gap-4 p-2 md:p-4 rounded-xl hover:bg-red-500/5 transition-colors"
      >
        <ThumbnailWithPreview
          video={video}
          className="w-36 md:w-64 aspect-video rounded-xl flex-shrink-0 shadow-lg"
        />

        <div className="flex-1 min-w-0 py-0.5">
          <h3 className="text-sm md:text-base font-semibold text-white line-clamp-2 group-hover:text-red-400 transition-colors mb-1 leading-snug">
            {formatVideoTitle(video.title)}
          </h3>

          {/* Channel name + avatar */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              navigate(channelUrl(video.uploader_email || video.uploader || ""));
            }}
            className="flex items-center gap-1.5 mb-1 cursor-pointer"
          >
            {video.avatar_url ? (
              <img
                src={video.avatar_url}
                alt={displayName}
                className="w-5 h-5 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                  (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                }}
              />
            ) : null}
            <div className={`w-5 h-5 rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white flex items-center justify-center text-[10px] font-bold ${video.avatar_url ? "hidden" : ""}`}>
              {displayName[0]?.toUpperCase() || "?"}
            </div>
            <p className="text-xs text-gray-400 hover:text-red-400 transition-colors truncate">
              {displayName}
            </p>
          </div>

          <p className="text-xs text-gray-400 flex items-center gap-1">
            <span>{fmtViews(video.views)}</span>
            <span>•</span>
            <span>{timeAgo(video.createdAt || video.created_at)}</span>
          </p>

          {video.description && (
            <p className="text-xs text-gray-600 mt-1 line-clamp-2 hidden sm:block">
              {video.description}
            </p>
          )}
        </div>
      </Link>
    </motion.div>
  );
});