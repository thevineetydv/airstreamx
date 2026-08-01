import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Share2, Flag, MoreVertical,
  MessageSquare, Eye, Calendar,
  ChevronDown, ChevronUp, Copy, Check,
} from "lucide-react";
import VideoPlayer from "../components/VideoPlayer";
import { getAuth } from "firebase/auth";
import CreatorCard from "../components/CreatorCard";
import { API_URL, LS } from "../utils/constants";
import { cachedFetch } from "../utils/metadataCache";
import { recordWatch, recordWatchProgress, recordSkip, getRecommendations } from "../utils/RecommendationEngine";
/* ─────────────────────────────────────────────────────────────
 * HELPERS
 * ───────────────────────────────────────────────────────────── */

const COLOR_SAMPLE_SIZE = 24;

function getAverageColor(imgSrc: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imgSrc;
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = COLOR_SAMPLE_SIZE;
        canvas.height = COLOR_SAMPLE_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve("rgba(0,0,0,0.6)");
        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE);
        // getImageData throws a SecurityError on a CORS-tainted canvas
        // (e.g. thumbnail host doesn't send Access-Control-Allow-Origin).
        // Without this try/catch that throw happens inside a Promise
        // executor with no catch path — the promise just never resolves,
        // and ambient background silently stops updating for that video.
        const data = ctx.getImageData(0, 0, COLOR_SAMPLE_SIZE, COLOR_SAMPLE_SIZE).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
        }
        resolve(`rgba(${Math.floor(r / count)}, ${Math.floor(g / count)}, ${Math.floor(b / count)}, 0.55)`);
      } catch {
        resolve("rgba(0,0,0,0.6)");
      }
    };
    img.onerror = () => resolve("rgba(0,0,0,0.6)");
  });
}

function getAvatarColor(email: string): string {
  const colors = [
    "from-red-500 to-red-600",
    "from-green-500 to-emerald-600",
    "from-orange-500 to-red-600",
    "from-violet-500 to-fuchsia-600",
    "from-yellow-500 to-orange-600",
    "from-teal-500 to-cyan-600",
    "from-rose-500 to-pink-600",
  ];
  const hash = email.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}

function formatEmailToName(email: string | undefined | null): string {
  if (!email) return "Anonymous";
  const local = email.includes("@") ? email.split("@")[0] : email;
  const parts = local.split(/[._\-0-9]+/).filter(Boolean);
  if (!parts.length) return local;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function getDisplayName(v: any): string {
  if (!v) return "Creator";
  if (typeof v === "string") return formatEmailToName(v);
  if (v.channel_name?.trim() && !v.channel_name.includes("@")) return v.channel_name.trim();
  return formatEmailToName(v.uploader_email || v.uploader);
}

function formatVideoTitle(title: string): string {
  if (!title) return "Untitled";
  return title
    .replace(/\.(mp4|mkv|avi|mov|webm|flv|wmv)$/i, "")
    .replace(/[_\s]+(4K|2K|1080p|720p|480p|360p|HDR|SDR|HEVC|x264|x265|BluRay|WEBRip|WEB-DL|BRRip|DVDRip)[\w.-]*/gi, "")
    .replace(/_/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const formatViews = (num: number): string => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
};

const formatTimeAgo = (date: string | null | undefined): string => {
  if (!date) return "Recently";
  try {
    const past = new Date(date);
    if (isNaN(past.getTime())) return "Recently";
    const diff = Math.floor((Date.now() - past.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
    return `${Math.floor(diff / 31536000)} years ago`;
  } catch {
    return "Recently";
  }
};

const formatDuration = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

function isShortVideo(v: { title?: string; duration?: number }) {
  const byDuration = typeof v.duration === "number" && v.duration > 0 && v.duration <= 60;
  const t = (v.title || "").toLowerCase();
  return byDuration || t.includes("#shorts") || t.includes("shorts");
}

/**
 * cloudinaryResize — same helper as HomeFeed. Serves a width-appropriate
 * thumbnail instead of the same asset at every sidebar card size
 * (w-28 mobile through w-40 desktop). Safe no-op for non-Cloudinary URLs.
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
 * TYPES
 * ───────────────────────────────────────────────────────────── */

interface Video {
  id: string | number;
  title: string;
  description?: string;
  url: string;
  thumbnail: string;
  public_id?: string;
  duration?: number;
  views?: number;
  uploader: string;
  uploader_email?: string;
  channelId?: number;
  channel_id?: number;
  subscribers?: number;
  created_at?: string;
  createdAt?: string;
  uploadedAt?: string;
  channel_name?: string;
  avatar_url?: string;
  handle?: string;
  watermark_url?: string;
  banner_url?: string;
}

interface Comment {
  id: string | number;
  comment: string;
  user_email: string;
  created_at: string;
}

/* ─────────────────────────────────────────────────────────────
 * ENRICH VIDEO WITH CHANNEL DATA
 * ───────────────────────────────────────────────────────────── */

async function enrichVideoWithChannelData(video: Video): Promise<Video> {
  const email = video.uploader_email || video.uploader;
  if (!email || video.watermark_url) return video;
  try {
    const res = await fetch(`${API_URL}/api/channel-customization/${encodeURIComponent(email)}`);
    if (!res.ok) return video;
    const data = await res.json();
    const c = data.customization ?? data;
    if (!c) return video;
    return {
      ...video,
      channel_name: video.channel_name || c.channel_name || c.channelName || video.channel_name,
      avatar_url: video.avatar_url || c.avatar_url || c.avatarDataUrl || video.avatar_url,
      handle: video.handle || c.handle || video.handle,
      watermark_url: video.watermark_url || c.watermark_url || c.watermarkDataUrl || "",
      banner_url: video.banner_url || c.banner_url || c.bannerDataUrl || video.banner_url,
    };
  } catch {
    return video;
  }
}

/* ─────────────────────────────────────────────────────────────
 * TIP BUTTON
 * ✅ FIX: Defined ABOVE Watch so JSX can reference it.
 *    Previously placed BELOW Watch's closing brace which caused
 *    the parser to error at `import.meta.env` (line 869).
 * ───────────────────────────────────────────────────────────── */

function TipButton() {
  const [open, setOpen] = useState(false);
  const [desktopCopied, setDesktopCopied] = useState(false);
  const upiId = (import.meta.env.VITE_UPI_ID as string | undefined) || "demomerchant@upi";
  const qrData = `upi://pay?pa=${upiId}&pn=Creator&cu=INR&tn=Thanks!`;

  // upi:// links only do anything on a phone with a UPI app registered
  // to handle that scheme — on desktop, clicking a quick-amount button
  // previously just did nothing with zero feedback. This check lets us
  // fall back to something that actually works on desktop.
  const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const pay = (amount: number) => {
    if (!isMobile) {
      navigator.clipboard?.writeText(upiId);
      setDesktopCopied(true);
      setTimeout(() => setDesktopCopied(false), 2000);
      return;
    }
    window.location.href =
      `upi://pay?pa=${encodeURIComponent(upiId)}` +
      `&pn=${encodeURIComponent("Creator")}` +
      `&am=${amount}&cu=INR` +
      `&tn=${encodeURIComponent("Thanks!")}`;
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-red-500 to-red-600 rounded-full hover:opacity-90 transition text-xs sm:text-sm font-medium"
      >
        <span className="hidden sm:inline">💝 Tip</span>
        <span className="sm:hidden">💝</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4 sm:p-0"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-[#181818] border border-white/10 rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base sm:text-lg font-semibold">Support Creator</h3>
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
              </div>
              <div className="flex justify-center mb-5">
                <img
                  alt="UPI QR"
                  className="w-36 sm:w-44 h-36 sm:h-44 rounded-lg bg-white p-2"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrData)}`}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[49, 99, 199].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => pay(amt)}
                    className="px-2 sm:px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition text-xs sm:text-sm font-medium"
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
              {!isMobile && (
                <p className="text-xs text-gray-400 -mt-2 mb-4">
                  {desktopCopied
                    ? "UPI ID copied — paste it in your UPI app 📋"
                    : "On desktop? Scan the QR with your phone, or tap an amount to copy the UPI ID."}
                </p>
              )}
              <p className="text-xs text-gray-400">
                UPI ID: <span className="text-gray-200 break-all">{upiId}</span>
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
 * WATCH PAGE
 * ───────────────────────────────────────────────────────────── */

export default function Watch() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("v");
  const navigate = useNavigate();

  const [videos, setVideos] = useState<Video[]>([]);
  const [current, setCurrent] = useState<Video | null>(null);
  const [ambient, setAmbient] = useState("rgba(0,0,0,0)");
  const [ambientEnabled, setAmbientEnabled] = useState<boolean>(() => {
    try { return (localStorage.getItem(LS.AMBIENT) ?? "1") === "1"; } catch { return true; }
  });
  const [isTheater, setIsTheater] = useState<boolean>(() => {
    try { return localStorage.getItem("player_theater_mode") === "1"; } catch { return false; }
  });
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    try { return localStorage.getItem(LS.FOCUS_MODE) === "1"; } catch { return false; }
  });
  const [blurPx, setBlurPx] = useState<number>(() => {
    try {
      const v = localStorage.getItem(LS.CINEMATIC_BLUR);
      return v ? Math.min(60, Math.max(0, parseInt(v, 10))) : 36;
    } catch { return 36; }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [userLetter, setUserLetter] = useState("U");
  const [userAvatarColor, setUserAvatarColor] = useState("from-red-500 to-red-600");

  const [views, setViews] = useState(0);
  const [showDescription, setShowDescription] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [showComments, setShowComments] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  const shareMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  /* ── Auth ── */
  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (user?.email) {
      setUserLetter(user.email[0].toUpperCase());
      setUserAvatarColor(getAvatarColor(user.email));
    }
  }, []);

  /* ── Load video ──────────────────────────────────────────────────────
   * CACHING STRATEGY:
   *  - Video metadata (title, url, thumbnail, channel info) is cached
   *    per video-id. Reopening the SAME video (e.g. via back button,
   *    or clicking it again from history/homepage) shows it INSTANTLY
   *    from cache instead of re-fetching + re-waiting.
   *  - The "Up next" suggestions list is cached too — it's the same
   *    expensive `/videos?limit=50` call your homepage might also use.
   *  - Comments and the view-count POST are NEVER cached — those must
   *    always be fresh / always fire as a real action.
   * ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const load = async () => {
      if (!id) { setError("No video ID provided"); setLoading(false); return; }
      try {
        setError(null);

        // ── 1. Video metadata + channel enrichment (cached per video id) ──
        const videoCacheKey = `watch:video:${id}`;
        const { data: selected, isInitialLoading } = await cachedFetch(
          videoCacheKey,
          async () => {
            const videoRes = await fetch(`${API_URL}/videos/${id}`);
            if (!videoRes.ok) throw new Error("Video not found");
            const videoData = await videoRes.json();
            if (!videoData.success || !videoData.video) throw new Error("Video not found");

            const raw = videoData.video;
            let resolvedUrl: string | undefined = raw?.url || raw?.video_url;
            const filename: string | undefined = raw?.filename;
            if (!resolvedUrl && filename) {
              const base = String(filename).replace(/\.[^/.]+$/, "");
              resolvedUrl = `${API_URL}/hls/${base}/master.m3u8`;
            }
            if (resolvedUrl && /\/hls\/[^/]+$/.test(resolvedUrl)) resolvedUrl = `${resolvedUrl}/master.m3u8`;
            if (resolvedUrl && resolvedUrl.startsWith("/")) resolvedUrl = `${API_URL}${resolvedUrl}`;

            let built: Video = { ...raw, url: resolvedUrl };
            built = await enrichVideoWithChannelData(built);
            return built;
          },
          {
            ttl: 5 * 60 * 1000, // 5 minutes
            onUpdate: (fresh) => {
              // Background refresh finished — swap in fresh data silently.
              setCurrent(fresh);
              setViews(fresh.views || 0);
              if (fresh?.thumbnail) getAverageColor(fresh.thumbnail).then(setAmbient);
            },
          }
        );

        // Only show the full-page loading spinner on a true first-ever
        // visit to this video (nothing cached). Returning to a video
        // you already opened before skips straight to showing it.
        setLoading(isInitialLoading);

        if (!selected) throw new Error("Video not found");

        setCurrent(selected);
        setViews(selected.views || 0);
        if (selected?.thumbnail) getAverageColor(selected.thumbnail).then(setAmbient);

        const currentUser = getAuth().currentUser;
        const suggestionsCacheKey = `watch:suggestions:${id}:${currentUser?.uid || "guest"}`;

        const { data: recommended } = await cachedFetch(
          suggestionsCacheKey,
          async () => {
            const recs = await getRecommendations({
              excludeIds: [id],
              user: currentUser,
              limit: 40,
            });
            return recs.filter((v) => !isShortVideo(v as any)) as unknown as Video[];
          },
          {
            ttl: 5 * 60 * 1000,
            onUpdate: (fresh) => {
              setVideos(fresh);
            },
          }
        );

        setVideos(recommended || []);
      } catch (err: any) {
        setError(err.message || "Failed to load video");
        setLoading(false);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  useEffect(() => {
    const fn = () => {
      try { setAmbientEnabled((localStorage.getItem(LS.AMBIENT) ?? "1") === "1"); } catch { }
    };
    fn();
    window.addEventListener("storage", fn);
    return () => window.removeEventListener("storage", fn);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(LS.FOCUS_MODE, focusMode ? "1" : "0"); } catch { }
  }, [focusMode]);

  useEffect(() => {
    try { localStorage.setItem(LS.CINEMATIC_BLUR, String(blurPx)); } catch { }
  }, [blurPx]);

  /* ── Load comments ── */
  useEffect(() => {
    if (!current?.id) return;
    const load = async () => {
      setLoadingComments(true);
      try {
        const res = await fetch(`${API_URL}/videos/${current.id}/comments`);
        if (res.ok) { const data = await res.json(); setComments(data.comments || []); }
      } catch (err) { console.error("Failed to load comments:", err); }
      finally { setLoadingComments(false); }
    };
    load();
  }, [current?.id]);

  /* ── Track view ── */
useEffect(() => {
  if (!current?.id) return;

  fetch(`${API_URL}/videos/${current.id}/view`, {
    method: "POST"
  }).catch(console.error);

  const user = getAuth().currentUser;

  if (user) {
    recordWatch(current, user);
  }

}, [current?.id]);

useEffect(() => {
  return () => {
    if (!current || !playerRef.current) return;

    const user = getAuth().currentUser;
    if (!user) return;

  const playerState = playerRef.current.getState?.() || {};
    const currentTime = playerState.currentTime || 0;
    const duration = playerState.duration || current.duration || 0;

    if (duration <= 0) return;

    const percentage = Math.round((currentTime / duration) * 100);

    // Watched less than 15% before leaving = treat as a skip (negative signal).
    // Otherwise record it as a normal watch-progress event.
    const SKIP_THRESHOLD = 15;
    if (percentage < SKIP_THRESHOLD) {
      recordSkip(current, percentage, user);
    } else {
      recordWatchProgress(current.id, percentage, current, user);
    }
  };
}, [current]);
/* ── VideoObject Schema (SEO) ── */
useEffect(() => {
  if (!current) return;

  const script = document.createElement("script");
  script.type = "application/ld+json";

  script.text = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": formatVideoTitle(current.title),
    "description":
      current.description || `Watch ${formatVideoTitle(current.title)} on AirStreamX`,
    "thumbnailUrl": current.thumbnail,
    "uploadDate":
      current.created_at ||
      current.createdAt ||
      current.uploadedAt,
    "duration": current.duration
      ? `PT${Math.floor(current.duration / 60)}M${current.duration % 60}S`
      : undefined,
    "contentUrl": current.url,
    "embedUrl": `https://airstreamx.com/watch?v=${current.public_id || current.id}`,
    "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": {
        "@type": "WatchAction"
      },
      "userInteractionCount": current.views || views || 0
    },
    "publisher": {
      "@type": "Organization",
      "name": "AirStreamX",
      "logo": {
        "@type": "ImageObject",
        "url": "https://airstreamx.com/logo.png"
      }
    }
  });

  document.head.appendChild(script);

  return () => {
    if (document.head.contains(script)) {
      document.head.removeChild(script);
    }
  };
}, [current, views]);

  /* ── Page title ── */
  useEffect(() => {
    const base = "AirStreamX";
    const title = current?.title?.trim();
    document.title = title ? `${title} – ${base}` : base;
    return () => { document.title = base; };
  }, [current?.title]);

  /* ── Post comment ── */
  const postComment = useCallback(async () => {
    if (postingComment || !commentText.trim() || !current?.id) return;
    try {
      setPostingComment(true);
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) { alert("Please sign in to comment"); return; }

      let res = await fetch(`${API_URL}/videos/${current.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment: commentText }),
      });
      if (!res.ok) {
        res = await fetch(`${API_URL}/videos/${current.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: commentText, comment: commentText, user_email: auth.currentUser?.email }),
        });
      }
      if (res.ok) {
        const data = await res.json();
        setComments(prev => [data.comment, ...prev]);
        setCommentText("");
        try {
          await fetch(`${API_URL}/analytics/track`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ videoId: current.id, event: "comment" }),
          });
        } catch { }
      } else {
        alert("Failed to post comment. Please try again later.");
      }
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setPostingComment(false);
    }
  }, [commentText, current?.id, postingComment]);

  /* ── Share ── */
  const handleShare = useCallback((platform: string) => {
    const url = window.location.href;
    const text = `Check out: ${current?.title}`;
    const map: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(text + " " + url)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    };
    if (platform === "copy") {
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else if (map[platform]) {
      window.open(map[platform], "_blank");
    }
    setShowShareMenu(false);
  }, [current?.title]);

  /* ── Click outside ── */
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (shareMenuRef.current && !shareMenuRef.current.contains(e.target as Node)) setShowShareMenu(false);
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setShowMoreMenu(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-red-500 mx-auto mb-4" />
          <p className="text-gray-400">Loading video...</p>
        </div>
      </div>
    );
  }

  if (error || !current) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="text-center max-w-md p-8">
          <div className="text-6xl mb-4">😵</div>
          <h2 className="text-2xl font-bold text-white mb-2">Video Not Found</h2>
          <p className="text-gray-400 mb-6">{error || "This video doesn't exist or has been removed."}</p>
          <button onClick={() => navigate("/")} className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 rounded-lg hover:opacity-90 transition text-white">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  /* ─────────────────────────────────────────────────────────────
   * ✅ FIX: Removed the stray <> fragment that wrapped the return.
   * The original file had:
   *   return (
   *     <>          ← opening fragment
   *       <div ...> ← actual page
   *     );          ← closes ( but NEVER closes <>
   *   }             ← closes Watch function with mismatched tree
   *
   * This caused the parser to get confused about what was inside
   * Watch vs. at module level, leading to the line 869 error.
   * Now the return is a single <div> root with no fragment.
   * ───────────────────────────────────────────────────────────── */
  return (
    <div
      className="min-h-screen bg-[#0a0a0a] text-white overflow-x-hidden"
      style={{ overflowY: "auto", scrollbarGutter: "stable" }}
    >
      {ambientEnabled && (
        <div
          className="fixed inset-0 pointer-events-none select-none"
          aria-hidden
          style={{
            background: `radial-gradient(ellipse 80% 40% at 50% 0%, ${ambient}, transparent 70%)`,
            opacity: ambient === "rgba(0,0,0,0)" ? 0 : 0.18,
            willChange: "opacity",
            transition: "opacity 400ms ease, background 800ms ease",
            zIndex: 0,
          }}
        />
      )}

      <div
        className="relative w-full max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-6 pt-4 pb-8"
        style={{ zIndex: 1 }}
      >
        <div className="flex flex-col lg:flex-row gap-4 md:gap-6 lg:gap-8">

          {/* ══ MAIN VIDEO COLUMN ══ */}
          <div className="flex-1 min-w-0">

            <div className="relative mb-4">
              {ambientEnabled && (
                <div
                  className="absolute pointer-events-none select-none"
                  aria-hidden
                  style={{
                    inset: "-20px",
                    borderRadius: 24,
                    background: ambient,
                    opacity: 0.45,
                    filter: "blur(40px)",
                    transition: "background 800ms ease, opacity 400ms ease",
                    zIndex: 0,
                    overflow: "clip",
                  }}
                />
              )}

              <div
                className={`relative w-full bg-black shadow-2xl overflow-hidden ${isTheater ? "rounded-none sm:rounded-3xl" : "rounded-xl sm:rounded-2xl"
                  }`}
                style={{ zIndex: 20, isolation: "isolate" }}
              >
                <VideoPlayer
                  ref={playerRef}
                  video={{ ...current, poster: current.thumbnail, watermark_url: current.watermark_url || "" }}
                  onTheaterModeChange={(v: boolean) => setIsTheater(v)}
                  suggestions={videos.slice(0, 8)}
                  autoplayNext={autoplay}
                />
              </div>

              {isTheater && (
                <div className="absolute top-2 right-2 sm:top-3 sm:right-3 z-20 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-2 py-1.5 sm:px-3 sm:py-2 flex items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-[10px] sm:text-xs text-gray-300 whitespace-nowrap">Blur</span>
                    <input type="range" min={0} max={60} step={2} value={blurPx}
                      onChange={(e) => setBlurPx(parseInt(e.target.value, 10))}
                      className="accent-red-500 w-16 sm:w-28" />
                  </div>
                  <label className="flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-gray-300 cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={focusMode} onChange={(e) => setFocusMode(e.target.checked)} className="accent-red-500" />
                    <span>Focus</span>
                  </label>
                </div>
              )}
            </div>

            <div className="space-y-5">
              {/* Title */}
              <div>
                <h1 className="font-bold mb-3 break-words" style={{ fontSize: "clamp(1rem, 4.5vw, 1.875rem)", lineHeight: 1.3 }}>
                  {formatVideoTitle(current.title)}
                </h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-gray-400">
                  <span className="flex items-center gap-1.5"><Eye size={14} />{formatViews(views)} views</span>
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    {formatTimeAgo(current.created_at || current.createdAt || current.uploadedAt)}
                  </span>
                  {current.duration && <span>⏱ {formatDuration(current.duration)}</span>}
                </div>
              </div>

              {/* Actions */}
              {!focusMode && (
                <div className="flex flex-row flex-wrap items-center gap-2">
                  <div className="relative" ref={shareMenuRef}>
                    <button
                      onClick={() => setShowShareMenu(v => !v)}
                      className="flex items-center gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 bg-white/10 hover:bg-white/20 rounded-full transition text-xs sm:text-sm"
                    >
                      <Share2 size={16} />
                      <span className="hidden sm:inline">Share</span>
                    </button>
                    <AnimatePresence>
                      {showShareMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.92, y: -8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.92, y: -8 }}
                          transition={{ duration: 0.15 }}
                          className="absolute top-full left-0 mt-2 bg-[#181818] border border-white/10 rounded-xl p-2 shadow-2xl z-50 min-w-[180px]"
                        >
                          {[
                            { icon: "𝕏", label: "Twitter", key: "twitter" },
                            { icon: "📘", label: "Facebook", key: "facebook" },
                            { icon: "💬", label: "WhatsApp", key: "whatsapp" },
                            { icon: "✈️", label: "Telegram", key: "telegram" },
                            { icon: copied ? <Check size={14} /> : <Copy size={14} />, label: copied ? "Copied!" : "Copy link", key: "copy" },
                          ].map((item) => (
                            <button key={item.key} onClick={() => handleShare(item.key)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-lg transition text-left text-sm min-h-[44px]">
                              <span className="text-base">{item.icon}</span>
                              <span>{item.label}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <TipButton />

                  <div className="relative ml-auto" ref={moreMenuRef}>
                    <button
                      onClick={() => setShowMoreMenu(v => !v)}
                      className="p-2.5 hover:bg-white/10 rounded-full transition min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                      <MoreVertical size={20} />
                    </button>
                    <AnimatePresence>
                      {showMoreMenu && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.92, y: -8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.92, y: -8 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-full mt-2 bg-[#181818] border border-white/10 rounded-xl p-2 shadow-2xl z-50 min-w-[160px]"
                        >
                          <button className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/10 rounded-lg transition text-left text-sm min-h-[44px]">
                            <Flag size={16} /><span>Report</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Creator card */}
              <CreatorCard
                email={current.uploader_email || current.uploader}
                channelName={current.channel_name}
                avatarUrl={current.avatar_url}
                handle={current.handle || (current.uploader_email || current.uploader || "").split("@")[0]}
                channelId={current.uploader_email || current.uploader}
                compact
                showSubscribe
              />

              {/* Description */}
              {current.description
                && current.description.trim().toLowerCase() !== "uploaded on airstreamx"
                && !focusMode && (
                  <div>
                    <div
                      className="bg-[#181818] rounded-xl overflow-hidden"
                      style={{
                        display: "grid",
                        gridTemplateRows: showDescription ? "1fr" : "5rem",
                        transition: "grid-template-rows 280ms ease",
                      }}
                    >
                      <div className="overflow-hidden p-3 sm:p-4">
                        <p className="text-gray-300 whitespace-pre-wrap text-xs sm:text-sm">{current.description}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowDescription(v => !v)}
                      className="flex items-center gap-1 text-xs sm:text-sm text-gray-400 hover:text-white transition mt-2"
                    >
                      {showDescription ? "Show less" : "Show more"}
                      {showDescription ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                )}

              {/* Comments */}
              <div className="mt-4 sm:mt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                  <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                    <MessageSquare size={20} />{comments.length} Comments
                  </h3>
                  <button onClick={() => setShowComments(v => !v)} className="text-xs sm:text-sm text-gray-400 hover:text-white transition w-fit">
                    {showComments ? "Hide" : "Show"}
                  </button>
                </div>

                <AnimatePresence>
                  {showComments && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                    >
                      <div className="flex gap-2 mb-4 sm:mb-6">
                        <div className={`w-8 sm:w-10 h-8 sm:h-10 rounded-full bg-gradient-to-br ${userAvatarColor} flex items-center justify-center font-bold flex-shrink-0 text-xs sm:text-sm`}>
                          {userLetter}
                        </div>
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            placeholder="Add a comment..."
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && postComment()}
                            className="w-full bg-transparent border-b border-gray-700 focus:border-red-500 outline-none py-2 text-xs sm:text-sm"
                          />
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={postComment}
                              disabled={!commentText.trim() || postingComment}
                              className="px-3 sm:px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-[#1a0000] disabled:cursor-not-allowed rounded-full text-xs sm:text-sm transition min-h-[36px]"
                            >
                              {postingComment ? "Posting…" : "Comment"}
                            </button>
                            <button onClick={() => setCommentText("")} className="px-3 sm:px-4 py-1.5 hover:bg-white/10 rounded-full text-xs sm:text-sm transition min-h-[36px]">
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>

                      {loadingComments ? (
                        <div className="text-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto" />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {comments.map((c) => (
                            <div key={c.id} className="flex gap-2 sm:gap-3">
                              <div className={`w-8 sm:w-10 h-8 sm:h-10 rounded-full bg-gradient-to-br ${getAvatarColor(c.user_email || "U")} flex items-center justify-center font-bold flex-shrink-0 text-xs sm:text-sm`}>
                                {(c.user_email || "U").charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
                                  <span className="font-medium text-xs sm:text-sm text-white">{formatEmailToName(c.user_email)}</span>
                                  <span className="text-xs text-gray-400">{formatTimeAgo(c.created_at)}</span>
                                </div>
                                <p className="text-xs sm:text-sm text-gray-300">{c.comment}</p>
                                <button className="text-xs text-gray-400 hover:text-white transition mt-2">Reply</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>


          {/* ══ UP NEXT SIDEBAR ══ */}
          {!focusMode && (
            <div className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0">
              <div className="bg-[#181818] rounded-xl p-3 sm:p-4 lg:sticky lg:top-4">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="text-base sm:text-lg text-white font-semibold">Up next</h3>
                  <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
                    <input type="checkbox" checked={autoplay} onChange={(e) => setAutoplay(e.target.checked)} className="accent-red-500" />
                    <span>Autoplay</span>
                  </label>
                </div>

                <div className="flex flex-col gap-2 sm:gap-3 max-h-[50vh] lg:max-h-[calc(100vh-220px)] overflow-y-auto">
                  {videos.length === 0 ? (
                    <p className="text-center py-8 text-xs sm:text-sm text-gray-400">No more videos available</p>
                  ) : (
                    videos.map((v) => (
                      <Link to={`/watch?v=${v.public_id || v.id}`} key={v.id} className="flex gap-2 sm:gap-3 p-2 rounded-lg hover:bg-white/5 transition group">
                        <div className="relative w-28 sm:w-36 lg:w-40 flex-shrink-0 rounded-lg overflow-hidden bg-[#2a2a2a]" style={{ aspectRatio: "16/9" }}>
                          <img
                            src={cloudinaryResize(v.thumbnail, 280)}
                            srcSet={`${cloudinaryResize(v.thumbnail, 160)} 160w, ${cloudinaryResize(v.thumbnail, 280)} 280w`}
                            sizes="(max-width: 1024px) 112px, 160px"
                            alt={v.title}
                            width={160}
                            height={90}
                            className="absolute inset-0 w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                          {v.duration && (
                            <div className="absolute bottom-1 right-1 bg-black/80 px-1 py-0.5 rounded text-[10px] font-mono text-white">
                              {formatDuration(v.duration)}
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-medium text-white line-clamp-2 group-hover:text-red-400 transition-colors leading-snug">
                            {formatVideoTitle(v.title)}
                          </p>
                          {/* ✅ FIX: was literally rendering JS source as text */}
                          <span className="text-xs text-gray-400 mt-1 block truncate">{getDisplayName(v)}</span>
                          <div className="flex flex-wrap items-center gap-1 text-[10px] sm:text-xs text-gray-400 mt-1">
                            {v.views !== undefined && <span>{formatViews(v.views)} views</span>}
                            {(v.created_at || v.createdAt) && <span>· {formatTimeAgo(v.created_at || v.createdAt)}</span>}
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
} // ← Watch ends here. TipButton is defined above, not below.