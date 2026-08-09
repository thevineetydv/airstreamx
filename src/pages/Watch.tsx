import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Share2, Flag, MoreVertical,
  MessageSquare, Eye, Calendar,
  ChevronDown, ChevronUp, Copy, Check,
  Pencil, Trash2, X as XIcon,
  ThumbsUp, ThumbsDown, Pin, AlertTriangle,
} from "lucide-react";
import VideoPlayer from "../components/VideoPlayer";
import { getAuth } from "firebase/auth";
import { useAuth } from "../context/AuthContext";
import { LoginRequiredModal } from "../components/LoginRequiredModal";
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

/**
 * CommentAvatar — shows the real profile photo when we have one cached
 * for that email, falling back to the colored letter circle otherwise.
 * onError falls back too, in case a stored avatar URL 404s.
 */
function CommentAvatar({
  email, avatarUrl, sizeClass, textClass,
}: { email: string | undefined; avatarUrl?: string; sizeClass: string; textClass: string }) {
  const [broken, setBroken] = useState(false);
  const letter = (email || "U").charAt(0).toUpperCase();
  if (avatarUrl && !broken) {
    return (
      <img
        src={avatarUrl}
        alt={email || "User"}
        onError={() => setBroken(true)}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br ${getAvatarColor(email || "U")} flex items-center justify-center font-bold flex-shrink-0 ${textClass}`}>
      {letter}
    </div>
  );
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

function cloudinaryResize(url: string | undefined, width: number): string {
  if (!url) return "";
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  const before = url.slice(0, idx + marker.length);
  const after = url.slice(idx + marker.length);
  return `${before}w_${width},q_auto,f_auto,c_fill/${after}`;
}

function linkifyText(text: string): React.ReactNode[] {
  if (!text) return [text];
  const urlRegex = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (!part) return null;
    if (/^(https?:\/\/|www\.)/i.test(part)) {
      const trailingMatch = part.match(/([.,!?;:)\]]+)$/);
      const trailing = trailingMatch ? trailingMatch[1] : "";
      const clean = trailing ? part.slice(0, -trailing.length) : part;
      const href = clean.startsWith("http") ? clean : `https://${clean}`;
      return (
        <span key={i}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-400 hover:text-blue-300 hover:underline break-all"
          >
            {clean}
          </a>
          {trailing}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function renderCommentBody(text: string): React.ReactNode {
  if (!text) return null;
  const mentionMatch = text.match(/^(@[^\s]+)(\s+)([\s\S]*)$/);
  if (!mentionMatch) return linkifyText(text);
  const [, mention, space, rest] = mentionMatch;
  return (
    <>
      <span className="text-blue-400 font-medium">{mention}</span>
      {space}
      {linkifyText(rest)}
    </>
  );
}

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
  upi_id?: string;
}

interface Comment {
  id: string | number;
  comment: string;
  user_email: string;
  created_at: string;
  likes?: number;
  dislikes?: number;
  parent_comment_id?: string | number | null;
  reply_to_id?: string | number | null;
  reply_count?: number;
  is_pinned?: boolean;
  _pending?: boolean;   // optimistic — shown before server confirms
  _failed?: boolean;    // optimistic — server rejected, shown as error state briefly before removal
}

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

function TipButton({ creatorUpiId, creatorName }: { creatorUpiId?: string; creatorName?: string }) {
  const [open, setOpen] = useState(false);
  const [desktopCopied, setDesktopCopied] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const { user, login } = useAuth();
  const isLoggedIn = Boolean(user);

  const hasUpi = Boolean(creatorUpiId?.trim());
  const upiId = creatorUpiId?.trim() || "";
  const payeeName = creatorName || "Creator";
  const qrData = hasUpi
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&cu=INR&tn=Thanks!`
    : "";

  const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  const pay = (amount: number) => {
    if (!hasUpi || !isLoggedIn) return;
    if (!isMobile) {
      navigator.clipboard?.writeText(upiId);
      setDesktopCopied(true);
      setTimeout(() => setDesktopCopied(false), 2000);
      return;
    }
    window.location.href =
      `upi://pay?pa=${encodeURIComponent(upiId)}` +
      `&pn=${encodeURIComponent(payeeName)}` +
      `&am=${amount}&cu=INR` +
      `&tn=${encodeURIComponent("Thanks!")}`;
  };

  return (
    <>
      <button
        onClick={() => {
          if (!isLoggedIn) { setShowLoginModal(true); return; }
          setOpen(true);
        }}
        className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-gradient-to-r from-red-500 to-red-600 rounded-full hover:opacity-90 transition text-xs sm:text-sm font-medium"
      >
        <span className="hidden sm:inline">💝 Tip</span>
        <span className="sm:hidden">💝</span>
      </button>

      {showLoginModal && (
        <LoginRequiredModal
          message="Please sign in to tip creators — it keeps things accountable for both you and them."
          onClose={() => setShowLoginModal(false)}
          onLogin={() => { setShowLoginModal(false); login(); }}
        />
      )}

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

              {!hasUpi ? (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-300 mb-1">
                    {payeeName} hasn't set up tips yet.
                  </p>
                  <p className="text-xs text-gray-500">
                    Once they add a UPI ID in their channel settings, you'll be able to support them here.
                  </p>
                </div>
              ) : (
                <>
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
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

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
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  const [views, setViews] = useState(0);
  const [showDescription, setShowDescription] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [autoplay, setAutoplay] = useState(true);
  const [showComments, setShowComments] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsOffset, setCommentsOffset] = useState(0);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const COMMENTS_PAGE_SIZE = 20;
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment] = useState(false);

  const [editingCommentId, setEditingCommentId] = useState<string | number | null>(null);
  const [editText, setEditText] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | number | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  const [commentReactions, setCommentReactions] = useState<Record<string, "like" | "dislike">>({});
  const [reactingCommentId, setReactingCommentId] = useState<string | number | null>(null);

  // ── Commenter avatars ──────────────────────────────────────────
  // Comments only ever stored user_email — no photo. This maps
  // email -> avatar URL (fetched in batch from channel_customizations)
  // so real profile pictures render instead of a plain letter circle.
  const [commenterAvatars, setCommenterAvatars] = useState<Record<string, string>>({});
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);

  // ── Comment sort ──
  const [commentSort, setCommentSort] = useState<"newest" | "top">("newest");

  // ── Pin comment (video owner only) ──
  const [pinningCommentId, setPinningCommentId] = useState<string | number | null>(null);

  // ── Report comment ──
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [reportingCommentId, setReportingCommentId] = useState<string | number | null>(null);

  // ── @mention autocomplete ──
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = closed
  const [mentionTargetIsReply, setMentionTargetIsReply] = useState(false); // which box triggered it

  const [replyingToId, setReplyingToId] = useState<string | number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [postingReply, setPostingReply] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [repliesByParent, setRepliesByParent] = useState<Record<string, Comment[]>>({});
  const [loadingReplies, setLoadingReplies] = useState<Record<string, boolean>>({});
  const replyInputRef = useRef<HTMLInputElement>(null);

  const shareMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user?.email) {
        setUserLetter(user.email[0].toUpperCase());
        setUserAvatarColor(getAvatarColor(user.email));
        setCurrentUserEmail(user.email);
        setUserAvatarUrl(user.photoURL || null);
        // Channel-customization avatar (same one CreatorCard shows) takes
        // priority over the raw Firebase photo if the person has set one.
        fetch(`${API_URL}/api/channel-customization/${encodeURIComponent(user.email)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            const url = data?.customization?.avatarDataUrl;
            if (url) setUserAvatarUrl(url);
          })
          .catch(() => {});
      } else {
        setCurrentUserEmail(null);
        setUserAvatarUrl(null);
      }
    });
    return () => unsubscribe();
  }, []);

  /* ── Batch-fetch commenter avatars ────────────────────────────
   * Comments only store user_email — no photo. Whenever a fresh set
   * of comments/replies arrives, fetch avatar URLs for any emails we
   * haven't already cached, using the existing batch endpoint, and
   * merge them in. Real profile photos then replace the plain letter
   * circle wherever we have one. */
  const ensureAvatarsLoaded = useCallback((emails: (string | undefined)[]) => {
    const unique = Array.from(new Set(emails.filter((e): e is string => Boolean(e))));
    setCommenterAvatars((prev) => {
      const missing = unique.filter((e) => !(e in prev));
      if (missing.length === 0) return prev;
      fetch(`${API_URL}/api/channel-customization/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: missing }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data?.customizations) return;
          setCommenterAvatars((current) => {
            const next = { ...current };
            for (const email of missing) {
              next[email] = data.customizations[email]?.avatarDataUrl || "";
            }
            return next;
          });
        })
        .catch(() => {});
      // Mark as "checked" immediately (empty string) so we don't re-fetch
      // the same missing emails on every subsequent render/comment batch.
      const optimistic = { ...prev };
      missing.forEach((e) => { optimistic[e] = optimistic[e] ?? ""; });
      return optimistic;
    });
  }, []);

  useEffect(() => {
    if (comments.length > 0) ensureAvatarsLoaded(comments.map((c) => c.user_email));
  }, [comments, ensureAvatarsLoaded]);

  useEffect(() => {
    const allReplyEmails = Object.values(repliesByParent).flat().map((r) => r.user_email);
    if (allReplyEmails.length > 0) ensureAvatarsLoaded(allReplyEmails);
  }, [repliesByParent, ensureAvatarsLoaded]);


  useEffect(() => {
    const load = async () => {
      if (!id) { setError("No video ID provided"); setLoading(false); return; }
      try {
        setError(null);

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
            ttl: 5 * 60 * 1000,
            onUpdate: (fresh) => {
              setCurrent(fresh);
              setViews(fresh.views || 0);
              if (fresh?.thumbnail) getAverageColor(fresh.thumbnail).then(setAmbient);
            },
          }
        );

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

  useEffect(() => {
    if (!current?.id) return;
    const load = async () => {
      setLoadingComments(true);
      try {
        const res = await fetch(`${API_URL}/videos/${current.id}/comments?limit=${COMMENTS_PAGE_SIZE}&offset=0&sort=${commentSort}`);
        if (res.ok) {
          const data = await res.json();
          const first = data.comments || [];
          setComments(first);
          setCommentsTotal(data.total || 0);
          setCommentsOffset(first.length);
        }
      } catch (err) { console.error("Failed to load comments:", err); }
      finally { setLoadingComments(false); }
    };
    load();
  }, [current?.id, commentSort]);

  const loadMoreComments = useCallback(async () => {
    if (!current?.id || loadingMoreComments) return;
    try {
      setLoadingMoreComments(true);
      const res = await fetch(`${API_URL}/videos/${current.id}/comments?limit=${COMMENTS_PAGE_SIZE}&offset=${commentsOffset}&sort=${commentSort}`);
      if (res.ok) {
        const data = await res.json();
        const next = data.comments || [];
        setComments(prev => [...prev, ...next]);
        setCommentsOffset(prev => prev + next.length);
      }
    } catch (err) {
      console.error("Failed to load more comments:", err);
    } finally {
      setLoadingMoreComments(false);
    }
  }, [current?.id, commentsOffset, loadingMoreComments, commentSort]);

  useEffect(() => {
    if (!current?.id || !currentUserEmail) { setCommentReactions({}); return; }
    const loadReactions = async () => {
      try {
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/videos/${current.id}/comments/my-reactions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCommentReactions(data.reactions || {});
        }
      } catch (err) {
        console.error("Failed to load comment reactions:", err);
      }
    };
    loadReactions();
  }, [current?.id, currentUserEmail]);

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

    const SKIP_THRESHOLD = 15;
    if (percentage < SKIP_THRESHOLD) {
      recordSkip(current, percentage, user);
    } else {
      recordWatchProgress(current.id, percentage, current, user);
    }
  };
}, [current]);

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

  useEffect(() => {
    const base = "AirStreamX";
    const title = current?.title?.trim();
    document.title = title ? `${title} – ${base}` : base;
    return () => { document.title = base; };
  }, [current?.title]);

  /* ── Draft auto-save: main comment box ────────────────────────
   * Restore any saved draft the moment we know which video this is,
   * then debounce-save on every keystroke. Cleared on successful post. */
  useEffect(() => {
    if (!current?.id) return;
    try {
      const saved = localStorage.getItem(`draft:comment:${current.id}`);
      if (saved) setCommentText(saved);
    } catch { }
  }, [current?.id]);

  useEffect(() => {
    if (!current?.id) return;
    const t = setTimeout(() => {
      try {
        if (commentText.trim()) localStorage.setItem(`draft:comment:${current.id}`, commentText);
        else localStorage.removeItem(`draft:comment:${current.id}`);
      } catch { }
    }, 400);
    return () => clearTimeout(t);
  }, [commentText, current?.id]);

  /* ── @mention autocomplete ─────────────────────────────────────
   * Candidates come from names already visible in this thread (top-level
   * comments + loaded replies) — no separate user-search endpoint needed.
   * Mention detection assumes the "@partial" is at the END of the typed
   * text, which covers the normal case of typing a mention as you go. */
  const mentionCandidates = useMemo(() => {
    const names = new Set<string>();
    comments.forEach((c) => { if (c.user_email) names.add(formatEmailToName(c.user_email)); });
    Object.values(repliesByParent).flat().forEach((r) => { if (r.user_email) names.add(formatEmailToName(r.user_email)); });
    return Array.from(names);
  }, [comments, repliesByParent]);

  const filteredMentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionCandidates.filter((n) => n.toLowerCase().startsWith(q)).slice(0, 5);
  }, [mentionCandidates, mentionQuery]);

  const detectMention = (value: string): string | null => {
    const m = value.match(/@([a-zA-Z0-9._-]*)$/);
    return m ? m[1] : null;
  };

  const handleCommentTextChange = useCallback((value: string) => {
    setCommentText(value);
    const q = detectMention(value);
    if (q !== null) { setMentionQuery(q); setMentionTargetIsReply(false); }
    else if (!mentionTargetIsReply) setMentionQuery(null);
  }, [mentionTargetIsReply]);

  const handleReplyTextChange = useCallback((value: string) => {
    setReplyText(value);
    const q = detectMention(value);
    if (q !== null) { setMentionQuery(q); setMentionTargetIsReply(true); }
    else if (mentionTargetIsReply) setMentionQuery(null);
  }, [mentionTargetIsReply]);

  const selectMention = useCallback((name: string) => {
    if (mentionTargetIsReply) {
      setReplyText((prev) => prev.replace(/@[a-zA-Z0-9._-]*$/, `@${name} `));
      replyInputRef.current?.focus();
    } else {
      setCommentText((prev) => prev.replace(/@[a-zA-Z0-9._-]*$/, `@${name} `));
    }
    setMentionQuery(null);
  }, [mentionTargetIsReply]);

  const postComment = useCallback(async () => {
    if (postingComment || !commentText.trim() || !current?.id) return;
    const textToPost = commentText;
    const tempId = `temp-${Date.now()}`;

    // Optimistic insert — shows instantly instead of waiting on the network.
    const optimisticComment: Comment = {
      id: tempId,
      comment: textToPost,
      user_email: currentUserEmail || "",
      created_at: new Date().toISOString(),
      likes: 0,
      dislikes: 0,
      reply_count: 0,
      _pending: true,
    };
    setComments(prev => [optimisticComment, ...prev]);
    setCommentsTotal(prev => prev + 1);
    setCommentText("");
    try { if (current?.id) localStorage.removeItem(`draft:comment:${current.id}`); } catch { }

    try {
      setPostingComment(true);
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        alert("Please sign in to comment");
        setComments(prev => prev.filter(c => c.id !== tempId));
        setCommentsTotal(prev => Math.max(0, prev - 1));
        setCommentText(textToPost);
        return;
      }

      let res = await fetch(`${API_URL}/videos/${current.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment: textToPost }),
      });
      if (!res.ok) {
        res = await fetch(`${API_URL}/videos/${current.id}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: textToPost, comment: textToPost, user_email: auth.currentUser?.email }),
        });
      }
      if (res.ok) {
        const data = await res.json();
        // Swap the temp optimistic row for the real server row (real id, etc).
        setComments(prev => prev.map(c => (c.id === tempId ? data.comment : c)));
        try {
          await fetch(`${API_URL}/analytics/track`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ videoId: current.id, event: "comment" }),
          });
        } catch { }
      } else {
        const errData = await res.json().catch(() => ({}));
        // Roll back — remove the optimistic row, restore the typed text
        // into the box so nothing the person wrote gets lost.
        setComments(prev => prev.filter(c => c.id !== tempId));
        setCommentsTotal(prev => Math.max(0, prev - 1));
        setCommentText(textToPost);
        alert(errData.error || "Failed to post comment. Please try again later.");
      }
    } catch (err) {
      console.error("Failed to post comment:", err);
      setComments(prev => prev.filter(c => c.id !== tempId));
      setCommentsTotal(prev => Math.max(0, prev - 1));
      setCommentText(textToPost);
    } finally {
      setPostingComment(false);
    }
  }, [commentText, current?.id, postingComment, currentUserEmail]);

  const startReply = useCallback((target: Comment, mentionName?: string) => {
    setReplyingToId(prev => {
      const willOpen = prev !== target.id;
      if (willOpen) {
        let text = mentionName ? `@${mentionName} ` : "";
        try {
          const saved = current?.id ? localStorage.getItem(`draft:reply:${current.id}:${target.id}`) : null;
          if (saved) text = saved;
        } catch { }
        setReplyText(text);
      }
      return willOpen ? target.id : null;
    });
    setTimeout(() => replyInputRef.current?.focus(), 0);
  }, [current?.id]);

  const cancelReply = useCallback(() => {
    if (current?.id && replyingToId != null) {
      try { localStorage.removeItem(`draft:reply:${current.id}:${replyingToId}`); } catch { }
    }
    setReplyingToId(null);
    setReplyText("");
  }, [current?.id, replyingToId]);

  useEffect(() => {
    if (!current?.id || replyingToId == null) return;
    const t = setTimeout(() => {
      try {
        const key = `draft:reply:${current.id}:${replyingToId}`;
        if (replyText.trim()) localStorage.setItem(key, replyText);
        else localStorage.removeItem(key);
      } catch { }
    }, 400);
    return () => clearTimeout(t);
  }, [replyText, current?.id, replyingToId]);

  const loadReplies = useCallback(async (commentId: string | number) => {
    if (!current?.id || repliesByParent[commentId]) return;
    try {
      setLoadingReplies(prev => ({ ...prev, [commentId]: true }));
      const res = await fetch(`${API_URL}/videos/${current.id}/comments/${commentId}/replies`);
      if (res.ok) {
        const data = await res.json();
        setRepliesByParent(prev => ({ ...prev, [commentId]: data.replies || [] }));
      }
    } catch (err) {
      console.error("Failed to load replies:", err);
    } finally {
      setLoadingReplies(prev => ({ ...prev, [commentId]: false }));
    }
  }, [current?.id, repliesByParent]);

  const toggleReplies = useCallback((commentId: string | number) => {
    const willExpand = !expandedReplies[commentId];
    setExpandedReplies(prev => ({ ...prev, [commentId]: willExpand }));
    if (willExpand) loadReplies(commentId);
  }, [expandedReplies, loadReplies]);

  const postReply = useCallback(async () => {
    if (postingReply || !replyText.trim() || !current?.id || replyingToId == null) return;

    // Work out which top-level thread this belongs to, client-side, so the
    // optimistic row lands in the right bucket immediately (mirrors the
    // same resolution logic the backend does when it flattens replies).
    let resolvedParent: string | null = null;
    if (comments.some(c => String(c.id) === String(replyingToId))) {
      resolvedParent = String(replyingToId);
    } else {
      for (const [parentId, list] of Object.entries(repliesByParent)) {
        if (list.some(r => String(r.id) === String(replyingToId))) { resolvedParent = parentId; break; }
      }
    }
    if (resolvedParent == null) return;

    const textToPost = replyText;
    const replyTargetId = replyingToId;
    const tempId = `temp-${Date.now()}`;

    const optimisticReply: Comment = {
      id: tempId,
      comment: textToPost,
      user_email: currentUserEmail || "",
      created_at: new Date().toISOString(),
      likes: 0,
      dislikes: 0,
      reply_to_id: replyTargetId,
      _pending: true,
    };
    setRepliesByParent(prev => ({
      ...prev,
      [resolvedParent as string]: [...(prev[resolvedParent as string] || []), optimisticReply],
    }));
    setComments(prev => prev.map(c =>
      String(c.id) === resolvedParent ? { ...c, reply_count: Number(c.reply_count || 0) + 1 } : c
    ));
    setExpandedReplies(prev => ({ ...prev, [resolvedParent as string]: true }));
    setReplyingToId(null);
    setReplyText("");
    try { localStorage.removeItem(`draft:reply:${current.id}:${replyTargetId}`); } catch { }

    const rollback = () => {
      setRepliesByParent(prev => ({
        ...prev,
        [resolvedParent as string]: (prev[resolvedParent as string] || []).filter(r => r.id !== tempId),
      }));
      setComments(prev => prev.map(c =>
        String(c.id) === resolvedParent ? { ...c, reply_count: Math.max(0, Number(c.reply_count || 0) - 1) } : c
      ));
      setReplyingToId(replyTargetId);
      setReplyText(textToPost);
    };

    try {
      setPostingReply(true);
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) { alert("Please sign in to reply"); rollback(); return; }

      const res = await fetch(`${API_URL}/videos/${current.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment: textToPost, parent_comment_id: replyTargetId }),
      });

      if (res.ok) {
        const data = await res.json();
        const targetParent = data.comment.parent_comment_id;
        setRepliesByParent(prev => ({
          ...prev,
          [targetParent]: (prev[targetParent] || []).map(r => (r.id === tempId ? data.comment : r)),
        }));
      } else {
        const errData = await res.json().catch(() => ({}));
        rollback();
        alert(errData.error || "Failed to post reply. Please try again later.");
      }
    } catch (err) {
      console.error("Failed to post reply:", err);
      rollback();
    } finally {
      setPostingReply(false);
    }
  }, [replyText, current?.id, postingReply, replyingToId, comments, repliesByParent, currentUserEmail]);

  const startEditComment = useCallback((c: Comment) => {
    setEditingCommentId(c.id);
    setEditText(c.comment);
    setTimeout(() => {
      const el = editInputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 0);
  }, []);

  const cancelEditComment = useCallback(() => {
    setEditingCommentId(null);
    setEditText("");
  }, []);

  const saveEditComment = useCallback(async (commentId: string | number) => {
    if (!editText.trim() || savingEdit || !current?.id) return;
    try {
      setSavingEdit(true);
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) { alert("Please sign in to edit your comment"); return; }

      const res = await fetch(`${API_URL}/videos/${current.id}/comments/${commentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment: editText.trim() }),
      });

      if (res.ok) {
        const data = await res.json();
        setComments(prev => prev.map(c => (c.id === commentId ? { ...c, ...data.comment } : c)));
        setRepliesByParent(prev => {
          const next: typeof prev = { ...prev };
          for (const parentId of Object.keys(next)) {
            const idx = next[parentId].findIndex(r => r.id === commentId);
            if (idx !== -1) {
              const updated = [...next[parentId]];
              updated[idx] = { ...updated[idx], ...data.comment };
              next[parentId] = updated;
              break;
            }
          }
          return next;
        });
        setEditingCommentId(null);
        setEditText("");
      } else {
        alert("Failed to update comment. Please try again.");
      }
    } catch (err) {
      console.error("Failed to update comment:", err);
    } finally {
      setSavingEdit(false);
    }
  }, [editText, current?.id, savingEdit]);

  const deleteComment = useCallback(async (commentId: string | number) => {
    if (!current?.id) return;
    const hasChildren = Object.values(repliesByParent).some(list =>
      list.some(r => String(r.reply_to_id) === String(commentId))
    );
    const confirmMsg = hasChildren
      ? "This reply has replies of its own — deleting it will delete those too. This can't be undone."
      : "Delete this comment? This can't be undone.";
    if (!window.confirm(confirmMsg)) return;
    try {
      setDeletingCommentId(commentId);
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) { alert("Please sign in to delete your comment"); return; }

      const res = await fetch(`${API_URL}/videos/${current.id}/comments/${commentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const isTopLevel = comments.some(c => c.id === commentId);

        if (isTopLevel) {
          setComments(prev => prev.filter(c => c.id !== commentId));
          setCommentsTotal(prev => Math.max(0, prev - 1));
          setRepliesByParent(prev => {
            if (!(commentId in prev)) return prev;
            const next = { ...prev };
            delete next[commentId as any];
            return next;
          });
        } else {
          let parentOfReply: string | null = null;
          for (const [parentId, list] of Object.entries(repliesByParent)) {
            if (list.some(r => r.id === commentId)) { parentOfReply = parentId; break; }
          }
          if (parentOfReply != null) {
            // The backend cascades DELETE to any nested replies-of-this-reply
            // too (ON DELETE CASCADE), but the client only knew to remove the
            // one row that was clicked. Walk reply_to_id to find every
            // descendant and drop them all locally too, or "View N replies"
            // and reply_count silently drift out of sync with the DB.
            const list = repliesByParent[parentOfReply];
            const toRemove = new Set<string>([String(commentId)]);
            let changed = true;
            while (changed) {
              changed = false;
              for (const r of list) {
                if (r.reply_to_id != null && toRemove.has(String(r.reply_to_id)) && !toRemove.has(String(r.id))) {
                  toRemove.add(String(r.id));
                  changed = true;
                }
              }
            }
            const removedCount = toRemove.size;

            setRepliesByParent(prev => ({
              ...prev,
              [parentOfReply as string]: prev[parentOfReply as string].filter(r => !toRemove.has(String(r.id))),
            }));
            setComments(prev => prev.map(c =>
              String(c.id) === parentOfReply
                ? { ...c, reply_count: Math.max(0, Number(c.reply_count || 0) - removedCount) }
                : c
            ));
          }
        }
      } else {
        alert("Failed to delete comment. Please try again.");
      }
    } catch (err) {
      console.error("Failed to delete comment:", err);
    } finally {
      setDeletingCommentId(null);
    }
  }, [current?.id, comments, repliesByParent]);

  const reactToComment = useCallback(async (commentId: string | number, type: "like" | "dislike") => {
    if (!current?.id || reactingCommentId === commentId) return;
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();
    if (!token) { alert(`Please sign in to ${type} comments`); return; }

    try {
      setReactingCommentId(commentId);
      const res = await fetch(`${API_URL}/videos/${current.id}/comments/${commentId}/${type}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { alert(`Failed to ${type} comment.`); return; }
      const data = await res.json();

      setComments(prev => prev.map(c =>
        c.id === commentId ? { ...c, likes: data.likes, dislikes: data.dislikes } : c
      ));
      setRepliesByParent(prev => {
        const next: typeof prev = { ...prev };
        for (const parentId of Object.keys(next)) {
          const list = next[parentId];
          const idx = list.findIndex(r => r.id === commentId);
          if (idx !== -1) {
            const updatedList = [...list];
            updatedList[idx] = { ...updatedList[idx], likes: data.likes, dislikes: data.dislikes };
            next[parentId] = updatedList;
          }
        }
        return next;
      });

      setCommentReactions(prev => {
        const next = { ...prev };
        const isNowActive = type === "like" ? data.liked : data.disliked;
        if (isNowActive) next[commentId] = type;
        else delete next[commentId];
        return next;
      });
    } catch (err) {
      console.error(`Failed to ${type} comment:`, err);
    } finally {
      setReactingCommentId(null);
    }
  }, [current?.id, reactingCommentId]);

  /* ── Pin / unpin (video owner only) ── */
  const pinComment = useCallback(async (commentId: string | number) => {
    if (!current?.id || pinningCommentId != null) return;
    try {
      setPinningCommentId(commentId);
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) { alert("Please sign in"); return; }

      const res = await fetch(`${API_URL}/videos/${current.id}/comments/${commentId}/pin`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        alert(errData.error || "Failed to pin comment.");
        return;
      }
      const data = await res.json();
      // Only one pin per video — clear any other pinned flag, set this one,
      // and float it to the top of the list for immediate feedback.
      setComments(prev => {
        const updated = prev.map(c => ({ ...c, is_pinned: data.pinned && c.id === commentId }));
        return [...updated].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
      });
    } catch (err) {
      console.error("Pin comment failed:", err);
    } finally {
      setPinningCommentId(null);
    }
  }, [current?.id, pinningCommentId]);

  /* ── Report ── */
  const reportComment = useCallback(async (commentId: string | number) => {
    if (!current?.id || reportedIds.has(String(commentId)) || reportingCommentId != null) return;
    if (!window.confirm("Report this comment for review?")) return;
    try {
      setReportingCommentId(commentId);
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      if (!token) { alert("Please sign in to report a comment"); return; }

      const res = await fetch(`${API_URL}/videos/${current.id}/comments/${commentId}/report`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setReportedIds(prev => new Set(prev).add(String(commentId)));
      } else {
        alert("Failed to report comment. Please try again.");
      }
    } catch (err) {
      console.error("Report comment failed:", err);
    } finally {
      setReportingCommentId(null);
    }
  }, [current?.id, reportedIds, reportingCommentId]);

  /* ── Reply thread renderer ─────────────────────────────────────
   * FIXED vs the version you pasted: that one called startEditComment()
   * and startReply() but never checked editingCommentId/replyingToId
   * when rendering a reply, so Edit and Reply silently did nothing.
   * This version adds both branches, matching the top-level comment's
   * behavior exactly.
   * ─────────────────────────────────────────────────────────── */
  const renderReplyThread = useCallback((
    parentComment: Comment,
    replies: Comment[]
  ): React.ReactNode => {
    if (!replies.length) return null;

    // Group replies by who they were actually a reply TO (reply_to_id).
    // Anything with no reply_to_id, or whose reply_to_id doesn't match
    // any reply in this list, is a direct child of the top comment.
    const childrenOf: Record<string, Comment[]> = {};
    replies.forEach((r) => {
      const key = r.reply_to_id != null ? String(r.reply_to_id) : String(parentComment.id);
      if (!childrenOf[key]) childrenOf[key] = [];
      childrenOf[key].push(r);
    });

    const renderRow = (reply: Comment): React.ReactNode => {
      const isOwner =
        Boolean(currentUserEmail) &&
        reply.user_email?.toLowerCase() === currentUserEmail!.toLowerCase();
      const isEditing = editingCommentId === reply.id;
      const isDeleting = deletingCommentId === reply.id;
      const kids = childrenOf[String(reply.id)] || [];

      return (
        <div key={reply.id}>
          <motion.div
            layout
            initial={false}
            animate={{ opacity: isDeleting ? 0.5 : 1 }}
            className="flex gap-2"
          >
            <CommentAvatar
              email={reply.user_email}
              avatarUrl={commenterAvatars[reply.user_email]}
              sizeClass="w-7 h-7"
              textClass="text-[11px]"
            />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-white">
                  {formatEmailToName(reply.user_email)}
                </span>

                <span className="text-[10px] text-gray-500">
                  {formatTimeAgo(reply.created_at)}
                </span>

                {isOwner && !isEditing && (
                  <span className="text-[10px] text-gray-500 border border-white/10 rounded-full px-1.5 py-0.5">
                    You
                  </span>
                )}
              </div>

              {isEditing ? (
                <div className="mt-1">
                  <textarea
                    ref={editInputRef}
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        saveEditComment(reply.id);
                      } else if (e.key === "Escape") {
                        cancelEditComment();
                      }
                    }}
                    rows={2}
                    maxLength={5000}
                    className="w-full bg-transparent border-b border-red-500 outline-none py-1 text-xs resize-none"
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEditComment(reply.id)}
                        disabled={!editText.trim() || savingEdit}
                        className="flex items-center gap-1 px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:bg-[#1a0000] disabled:cursor-not-allowed rounded-full text-[11px] transition min-h-[28px]"
                      >
                        <Check size={11} />
                        {savingEdit ? "Saving…" : "Save"}
                      </button>
                      <button
                        onClick={cancelEditComment}
                        className="flex items-center gap-1 px-2.5 py-1 hover:bg-white/10 rounded-full text-[11px] transition min-h-[28px]"
                      >
                        <XIcon size={11} />
                        Cancel
                      </button>
                    </div>
                    <span className="text-[9px] text-gray-500">{editText.length}/5000</span>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs sm:text-sm text-gray-300 whitespace-pre-wrap break-words mt-1">
                    {renderCommentBody(reply.comment)}
                  </p>

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <button
                      onClick={() => reactToComment(reply.id, "like")}
                      disabled={reactingCommentId === reply.id}
                      className={`flex items-center gap-1 text-xs transition disabled:opacity-50 ${
                        commentReactions[reply.id] === "like" ? "text-red-500" : "text-gray-400 hover:text-white"
                      }`}
                    >
                      <ThumbsUp size={13} fill={commentReactions[reply.id] === "like" ? "currentColor" : "none"} />
                      {reply.likes || ""}
                    </button>

                    <button
                      onClick={() => reactToComment(reply.id, "dislike")}
                      disabled={reactingCommentId === reply.id}
                      className={`flex items-center gap-1 text-xs transition disabled:opacity-50 ${
                        commentReactions[reply.id] === "dislike" ? "text-red-500" : "text-gray-400 hover:text-white"
                      }`}
                    >
                      <ThumbsDown size={13} fill={commentReactions[reply.id] === "dislike" ? "currentColor" : "none"} />
                      {reply.dislikes || ""}
                    </button>

                    <button
                      onClick={() => startReply(reply, formatEmailToName(reply.user_email))}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Reply
                    </button>

                    {isOwner && (
                      <>
                        <button
                          onClick={() => startEditComment(reply)}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
                        >
                          <Pencil size={11} />
                          Edit
                        </button>

                        <button
                          onClick={() => deleteComment(reply.id)}
                          disabled={isDeleting}
                          className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 disabled:opacity-50"
                        >
                          <Trash2 size={11} />
                          {isDeleting ? "Deleting…" : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}

              {replyingToId === reply.id && (
                <div className="flex gap-2 mt-2.5">
                  <CommentAvatar
                    email={currentUserEmail || undefined}
                    avatarUrl={userAvatarUrl || undefined}
                    sizeClass="w-6 h-6"
                    textClass="text-[10px]"
                  />
                  <div className="flex-1 min-w-0 relative">
                    <input
                      ref={replyInputRef}
                      type="text"
                      value={replyText}
                      maxLength={5000}
                      onChange={(e) => handleReplyTextChange(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && postReply()}
                      className="w-full bg-transparent border-b border-gray-700 focus:border-red-500 outline-none py-1 text-xs"
                    />
                    {mentionQuery !== null && mentionTargetIsReply && filteredMentionCandidates.length > 0 && (
                      <div className="absolute left-0 top-full mt-1 bg-[#181818] border border-white/10 rounded-lg shadow-2xl z-30 min-w-[140px] overflow-hidden">
                        {filteredMentionCandidates.map((name) => (
                          <button
                            key={name}
                            onClick={() => selectMention(name)}
                            className="w-full text-left px-2.5 py-1.5 text-xs text-gray-200 hover:bg-white/10 transition"
                          >
                            @{name}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 mt-1.5">
                      <button
                        onClick={() => postReply()}
                        disabled={!replyText.trim() || postingReply}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:bg-[#1a0000] disabled:cursor-not-allowed rounded-full text-[11px] transition min-h-[28px]"
                      >
                        {postingReply ? "Posting…" : "Reply"}
                      </button>
                      <button onClick={cancelReply} className="px-2.5 py-1 hover:bg-white/10 rounded-full text-[11px] transition min-h-[28px]">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>

          {/* Nested children — genuinely indented with their own connector
           * line, so it's visually obvious which reply this is answering. */}
          {kids.length > 0 && (
            <div className="ml-4 mt-3 space-y-3 border-l border-white/10 pl-4">
              {kids.map((k) => renderRow(k))}
            </div>
          )}
        </div>
      );
    };

    const topLevelReplies = childrenOf[String(parentComment.id)] || [];

    return (
      <div className="ml-6 mt-3 space-y-3 border-l border-white/10 pl-4">
        {topLevelReplies.map((r) => renderRow(r))}
      </div>
    );
  }, [
    currentUserEmail, editingCommentId, deletingCommentId, editText, savingEdit,
    reactingCommentId, commentReactions, replyingToId, replyText, postingReply,
    userAvatarColor, userLetter,
    reactToComment, startReply, startEditComment, saveEditComment, cancelEditComment, deleteComment, postReply, cancelReply,
    commenterAvatars, userAvatarUrl,
    mentionQuery, mentionTargetIsReply, filteredMentionCandidates, handleReplyTextChange, selectMention,
  ]);

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

            <div className="space-y-3">
              <div>
                <h1 className="font-bold mb-2 break-words" style={{ fontSize: "clamp(1rem, 4.5vw, 1.75rem)", lineHeight: 1.3 }}>
                  {formatVideoTitle(current.title)}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-gray-400">
                  <span className="flex items-center gap-1.5"><Eye size={14} />{formatViews(views)} views</span>
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} />
                    {formatTimeAgo(current.created_at || current.createdAt || current.uploadedAt)}
                  </span>
                </div>
              </div>

              {!focusMode && (
                <div className="flex flex-row flex-wrap items-center gap-1.5">
                  <div className="relative" ref={shareMenuRef}>
                    <button
                      onClick={() => setShowShareMenu(v => !v)}
                      className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full transition text-xs sm:text-sm"
                    >
                      <Share2 size={15} />
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

                  <TipButton creatorUpiId={current.upi_id} creatorName={current.channel_name} />

                  <div className="relative ml-auto" ref={moreMenuRef}>
                    <button
                      onClick={() => setShowMoreMenu(v => !v)}
                      className="p-2 hover:bg-white/10 rounded-full transition min-h-[40px] min-w-[40px] flex items-center justify-center"
                    >
                      <MoreVertical size={18} />
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

              <CreatorCard
                email={current.uploader_email || current.uploader}
                channelName={current.channel_name}
                avatarUrl={current.avatar_url}
                handle={current.handle || (current.uploader_email || current.uploader || "").split("@")[0]}
                channelId={current.uploader_email || current.uploader}
                compact
                showSubscribe
              />

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

              <div className="mt-4 sm:mt-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                  <h3 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                    <MessageSquare size={20} />{commentsTotal} Comments
                  </h3>
                  <div className="flex items-center gap-3">
                    <select
                      value={commentSort}
                      onChange={(e) => setCommentSort(e.target.value as "newest" | "top")}
                      className="bg-transparent border border-white/10 rounded-full px-2.5 py-1 text-xs sm:text-sm text-gray-300 hover:text-white transition outline-none cursor-pointer"
                    >
                      <option className="bg-[#181818]" value="newest">Newest first</option>
                      <option className="bg-[#181818]" value="top">Top comments</option>
                    </select>
                    <button onClick={() => setShowComments(v => !v)} className="text-xs sm:text-sm text-gray-400 hover:text-white transition w-fit">
                      {showComments ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {showComments && (
                    <motion.div
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                    >
                      <div className="flex gap-2 mb-4 sm:mb-6">
                        <CommentAvatar
                          email={currentUserEmail || undefined}
                          avatarUrl={userAvatarUrl || undefined}
                          sizeClass="w-8 sm:w-10 h-8 sm:h-10"
                          textClass="text-xs sm:text-sm"
                        />
                        <div className="flex-1 min-w-0 relative">
                          <input
                            type="text"
                            placeholder="Add a comment..."
                            value={commentText}
                            maxLength={5000}
                            onChange={(e) => handleCommentTextChange(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && postComment()}
                            className="w-full bg-transparent border-b border-gray-700 focus:border-red-500 outline-none py-2 text-xs sm:text-sm"
                          />
                          {mentionQuery !== null && !mentionTargetIsReply && filteredMentionCandidates.length > 0 && (
                            <div className="absolute left-0 top-full mt-1 bg-[#181818] border border-white/10 rounded-lg shadow-2xl z-30 min-w-[160px] overflow-hidden">
                              {filteredMentionCandidates.map((name) => (
                                <button
                                  key={name}
                                  onClick={() => selectMention(name)}
                                  className="w-full text-left px-3 py-2 text-xs sm:text-sm text-gray-200 hover:bg-white/10 transition"
                                >
                                  @{name}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex gap-2">
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
                            {commentText.length > 0 && (
                              <span className="text-[10px] text-gray-500 flex-shrink-0">{commentText.length}/5000</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {loadingComments ? (
                        <div className="text-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mx-auto" />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {comments.map((c) => {
                            const isOwner = Boolean(currentUserEmail) && c.user_email === currentUserEmail;
                            const isEditing = editingCommentId === c.id;
                            const isDeleting = deletingCommentId === c.id;
                            const isPending = Boolean(c._pending);

                            return (
                              <motion.div
                                key={c.id}
                                layout
                                initial={false}
                                animate={{ opacity: isDeleting ? 0.5 : isPending ? 0.65 : 1 }}
                                className="flex gap-2 sm:gap-3"
                              >
                                <CommentAvatar
                                  email={c.user_email}
                                  avatarUrl={commenterAvatars[c.user_email]}
                                  sizeClass="w-8 sm:w-10 h-8 sm:h-10"
                                  textClass="text-xs sm:text-sm"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1">
                                    <span className="font-medium text-xs sm:text-sm text-white">{formatEmailToName(c.user_email)}</span>
                                    {isPending ? (
                                      <span className="text-xs text-gray-500 italic">Sending…</span>
                                    ) : (
                                      <span className="text-xs text-gray-400">{formatTimeAgo(c.created_at)}</span>
                                    )}
                                    {c.is_pinned && (
                                      <span className="flex items-center gap-1 text-[10px] text-blue-400 border border-blue-400/30 rounded-full px-1.5 py-0.5">
                                        <Pin size={10} /> Pinned by Creator
                                      </span>
                                    )}
                                    {isOwner && !isEditing && !isPending && (
                                      <span className="text-[10px] text-gray-500 border border-white/10 rounded-full px-1.5 py-0.5">You</span>
                                    )}
                                  </div>

                                  {isEditing ? (
                                    <div className="mt-1">
                                      <textarea
                                        ref={editInputRef}
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            saveEditComment(c.id);
                                          } else if (e.key === "Escape") {
                                            cancelEditComment();
                                          }
                                        }}
                                        rows={2}
                                        maxLength={5000}
                                        className="w-full bg-transparent border-b border-red-500 outline-none py-1.5 text-xs sm:text-sm resize-none"
                                      />
                                      <div className="flex items-center justify-between mt-2">
                                        <div className="flex gap-2">
                                          <button
                                            onClick={() => saveEditComment(c.id)}
                                            disabled={!editText.trim() || savingEdit}
                                            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-[#1a0000] disabled:cursor-not-allowed rounded-full text-xs transition min-h-[32px]"
                                          >
                                            <Check size={13} />
                                            {savingEdit ? "Saving…" : "Save"}
                                          </button>
                                          <button
                                            onClick={cancelEditComment}
                                            className="flex items-center gap-1 px-3 py-1.5 hover:bg-white/10 rounded-full text-xs transition min-h-[32px]"
                                          >
                                            <XIcon size={13} />
                                            Cancel
                                          </button>
                                        </div>
                                        <span className="text-[10px] text-gray-500">{editText.length}/5000</span>
                                      </div>
                                    </div>
                                  ) : isPending ? (
                                    <p className="text-xs sm:text-sm text-gray-300 whitespace-pre-wrap break-words">
                                      {linkifyText(c.comment)}
                                    </p>
                                  ) : (
                                    <>
                                      <p className="text-xs sm:text-sm text-gray-300 whitespace-pre-wrap break-words">
                                        {linkifyText(c.comment)}
                                      </p>
                                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                                        <button
                                          onClick={() => reactToComment(c.id, "like")}
                                          disabled={reactingCommentId === c.id}
                                          className={`flex items-center gap-1 text-xs transition disabled:opacity-50 ${
                                            commentReactions[c.id] === "like" ? "text-red-500" : "text-gray-400 hover:text-white"
                                          }`}
                                        >
                                          <ThumbsUp size={13} fill={commentReactions[c.id] === "like" ? "currentColor" : "none"} />
                                          {c.likes ? c.likes : ""}
                                        </button>
                                        <button
                                          onClick={() => reactToComment(c.id, "dislike")}
                                          disabled={reactingCommentId === c.id}
                                          className={`flex items-center gap-1 text-xs transition disabled:opacity-50 ${
                                            commentReactions[c.id] === "dislike" ? "text-red-500" : "text-gray-400 hover:text-white"
                                          }`}
                                        >
                                          <ThumbsDown size={13} fill={commentReactions[c.id] === "dislike" ? "currentColor" : "none"} />
                                          {c.dislikes ? c.dislikes : ""}
                                        </button>
                                        <button
                                          onClick={() => startReply(c)}
                                          className="text-xs text-gray-400 hover:text-white transition"
                                        >
                                          Reply
                                        </button>
                                        {isOwner && (
                                          <>
                                            <button
                                              onClick={() => startEditComment(c)}
                                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition"
                                            >
                                              <Pencil size={12} />
                                              Edit
                                            </button>
                                            <button
                                              onClick={() => deleteComment(c.id)}
                                              disabled={isDeleting}
                                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition disabled:opacity-50"
                                            >
                                              <Trash2 size={12} />
                                              {isDeleting ? "Deleting…" : "Delete"}
                                            </button>
                                          </>
                                        )}
                                        {current?.uploader_email && current.uploader_email === currentUserEmail && (
                                          <button
                                            onClick={() => pinComment(c.id)}
                                            disabled={pinningCommentId === c.id}
                                            className={`flex items-center gap-1 text-xs transition disabled:opacity-50 ${
                                              c.is_pinned ? "text-blue-400" : "text-gray-400 hover:text-white"
                                            }`}
                                          >
                                            <Pin size={12} fill={c.is_pinned ? "currentColor" : "none"} />
                                            {c.is_pinned ? "Unpin" : "Pin"}
                                          </button>
                                        )}
                                        {!isOwner && (
                                          reportedIds.has(String(c.id)) ? (
                                            <span className="text-xs text-gray-500">Reported</span>
                                          ) : (
                                            <button
                                              onClick={() => reportComment(c.id)}
                                              disabled={reportingCommentId === c.id}
                                              className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition disabled:opacity-50"
                                            >
                                              <AlertTriangle size={12} />
                                              Report
                                            </button>
                                          )
                                        )}
                                      </div>

                                      {replyingToId === c.id && (
                                        <div className="flex gap-2 mt-3">
                                          <CommentAvatar
                                            email={currentUserEmail || undefined}
                                            avatarUrl={userAvatarUrl || undefined}
                                            sizeClass="w-7 h-7"
                                            textClass="text-[11px]"
                                          />
                                          <div className="flex-1 min-w-0 relative">
                                            <input
                                              ref={replyInputRef}
                                              type="text"
                                              placeholder="Add a reply..."
                                              value={replyText}
                                              maxLength={5000}
                                              onChange={(e) => handleReplyTextChange(e.target.value)}
                                              onKeyDown={(e) => e.key === "Enter" && postReply()}
                                              className="w-full bg-transparent border-b border-gray-700 focus:border-red-500 outline-none py-1.5 text-xs sm:text-sm"
                                            />
                                            {mentionQuery !== null && mentionTargetIsReply && filteredMentionCandidates.length > 0 && (
                                              <div className="absolute left-0 top-full mt-1 bg-[#181818] border border-white/10 rounded-lg shadow-2xl z-30 min-w-[160px] overflow-hidden">
                                                {filteredMentionCandidates.map((name) => (
                                                  <button
                                                    key={name}
                                                    onClick={() => selectMention(name)}
                                                    className="w-full text-left px-3 py-2 text-xs sm:text-sm text-gray-200 hover:bg-white/10 transition"
                                                  >
                                                    @{name}
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                            <div className="flex gap-2 mt-2">
                                              <button
                                                onClick={() => postReply()}
                                                disabled={!replyText.trim() || postingReply}
                                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:bg-[#1a0000] disabled:cursor-not-allowed rounded-full text-xs transition min-h-[32px]"
                                              >
                                                {postingReply ? "Posting…" : "Reply"}
                                              </button>
                                              <button onClick={cancelReply} className="px-3 py-1.5 hover:bg-white/10 rounded-full text-xs transition min-h-[32px]">
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {(c.reply_count || 0) > 0 && (
                                        <button
                                          onClick={() => toggleReplies(c.id)}
                                          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-medium mt-3"
                                        >
                                          {expandedReplies[c.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                          {expandedReplies[c.id] ? "Hide" : "View"} {c.reply_count} {Number(c.reply_count) === 1 ? "reply" : "replies"}
                                        </button>
                                      )}

                                      {expandedReplies[c.id] && (
                                        <div className="mt-3">
                                          {loadingReplies[c.id] ? (
                                            <div className="py-2 pl-4">
                                              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-500" />
                                            </div>
                                          ) : (
                                            renderReplyThread(c, repliesByParent[c.id] || [])
                                          )}
                                        </div>
                                      )}
                                    </>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>
                      )}

                      {!loadingComments && comments.length < commentsTotal && (
                        <div className="text-center mt-4">
                          <button
                            onClick={loadMoreComments}
                            disabled={loadingMoreComments}
                            className="px-4 py-2 bg-white/10 hover:bg-white/20 disabled:opacity-50 rounded-full text-xs sm:text-sm transition"
                          >
                            {loadingMoreComments ? "Loading…" : `Load more comments (${commentsTotal - comments.length} left)`}
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>


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
}