import React, {
  useEffect, useState, useRef, useCallback,
  createContext, useContext, useMemo,
} from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, MessageSquare, Share2, Volume2, VolumeX,
  Pause, Play, ChevronUp, ChevronDown, ChevronLeft,
  Music2, Eye, Bookmark, BookmarkCheck,
  X, Send, Check, ExternalLink, MoreVertical, Flag,
  AlignLeft, ListPlus, Monitor, ThumbsDown, MessageCircleOff,
} from "lucide-react";
import Hls from "hls.js";
import { getAuth } from "firebase/auth";
import { API_URL } from "../utils/constants";
import { getChannelWatermark } from "../utils/channelUrl";
import Header from "../components/Header";
import { SubscriptionButton } from "../components/SubscriptionButton";
/* ─────────────────────────────────────────────
 * CONSTANTS
 * ───────────────────────────────────────────── */
const MAX_SHORT_DURATION = 60;
const HOOK_DURATION_MS = 3000;
const SWIPE_THRESHOLD = 50;   // px — minimum swipe distance to navigate

/* ─────────────────────────────────────────────
 * TYPES
 * ───────────────────────────────────────────── */
interface Short {
  id: number;
  title: string;
  thumbnail: string;
  video_url: string;
  url: string;
  duration: number;
  views: number;
  likes: number;
  uploader_email: string;
  public_id?: string;
  handle?: string;
  avatar_url?: string;
  channel_name?: string;
  watermark_url?: string;
  created_at: string;
}

/* ─────────────────────────────────────────────
 * MUTE CONTEXT — shared across all players
 * ───────────────────────────────────────────── */
const MuteContext = createContext<{ muted: boolean; setMuted: (v: boolean) => void }>({
  muted: false,
  setMuted: () => { },
});

/* ─────────────────────────────────────────────
 * HELPERS
 * ───────────────────────────────────────────── */
function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function cleanTitle(t: string): string {
  if (!t) return "";
  return t
    .replace(/\.(mp4|mkv|avi|mov|webm|flv|wmv)$/i, "")
    .replace(/[_\s]+(4K|2K|1080p|720p|480p|360p|HDR|SDR|HEVC|x264|x265|BluRay|WEBRip|WEB-DL|BRRip|DVDRip)[\w.-]*/gi, "")
    .replace(/_/g, " ").replace(/\s{2,}/g, " ").trim();
}

function getDisplayName(short: Short): string {
  if (short.channel_name?.trim()) return short.channel_name.trim();
  if (short.handle?.trim()) return short.handle.trim();
  const email = short.uploader_email;
  if (!email) return "Creator";
  const local = email.split("@")[0];
  const parts = local.split(/[._\-0-9]+/).filter(Boolean);
  if (!parts.length) return local;
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

function getAvatarColor(email: string): string {
  const colors = [
    "from-red-600 to-red-700", "from-red-500 to-red-700",
    "from-red-400 to-red-600", "from-emerald-400 to-teal-600",
    "from-amber-400 to-orange-600", "from-red-600 to-red-700",
  ];
  return colors[email.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length];
}

function getHookText(id: number): string {
  const hooks = [
    "🔥 This moment gave me goosebumps",
    "💡 Wait until the end…",
    "😂 I can't stop watching this",
    "🎯 This one hit different",
    "⚡ You need to see this",
    "✨ Pure gold from start to finish",
  ];
  return hooks[id % hooks.length];
}

/* ─────────────────────────────────────────────
 * HOOKS
 * ───────────────────────────────────────────── */
function useVideoPreloader(nextUrl: string | undefined) {
  useEffect(() => {
    if (!nextUrl) return;
    const link = document.createElement("link");
    link.rel = "prefetch"; link.href = nextUrl;
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch { } };
  }, [nextUrl]);
}

function useAmbientColor(videoRef: React.RefObject<HTMLVideoElement | null>, active: boolean) {
  const [color, setColor] = useState("rgba(239,68,68,0.4)");
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvas.current) {
      canvas.current = document.createElement("canvas");
      canvas.current.width = canvas.current.height = 8;
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current, cvs = canvas.current;
    if (!video || !cvs || !active) return;
    let alive = true;
    const sample = () => {
      if (!alive || video.paused || video.readyState < 2) return;
      try {
        const ctx = cvs.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(video, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data;
        let r = 0, g = 0, b = 0; const px = d.length / 4;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        setColor(`rgba(${Math.round(r / px)},${Math.round(g / px)},${Math.round(b / px)},0.6)`);
      } catch { }
      if (alive) setTimeout(sample, 2000);
    };
    const id = setTimeout(sample, 600);
    return () => { alive = false; clearTimeout(id); };
  }, [active, videoRef]);

  return color;
}

/* ─────────────────────────────────────────────
 * SHARE MODAL
 * ───────────────────────────────────────────── */
function ShareModal({ short, onClose }: { short: Short; onClose: () => void }) {
  const url = `${window.location.origin}/shorts/${short.public_id || short.id}`;
  const text = `Check out this Short: ${cleanTitle(short.title)}`;
  const [copied, setCopied] = useState(false);

  const options = [
    { name: "WhatsApp", bg: "#25D366", icon: "💬", action: () => window.open(`https://wa.me/?text=${encodeURIComponent(text + "\n" + url)}`) },
    { name: "Telegram", bg: "#2AABEE", icon: "✈️", action: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`) },
    { name: "Twitter/X", bg: "#111", icon: "𝕏", action: () => window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`) },
    { name: "Facebook", bg: "#1877F2", icon: "f", action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`) },
    { name: "Copy link", bg: "#444", icon: "🔗", action: () => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="w-full max-w-sm rounded-t-3xl p-5 pb-8"
        style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-8 h-1 bg-white/20 rounded-full mx-auto mb-5" />
        <div className="flex items-center justify-between mb-4">
          <p className="text-white font-semibold text-sm">Share</p>
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center">
            <X className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-3 mb-4">
          {options.map(opt => (
            <button key={opt.name} onClick={opt.action} className="flex flex-col items-center gap-1.5 group">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg group-hover:scale-105 group-active:scale-95 transition-transform" style={{ background: opt.bg }}>
                {opt.icon}
              </div>
              <span className="text-white/40 text-[10px] text-center">{opt.name}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <ExternalLink className="w-3 h-3 text-white/30 flex-shrink-0" />
          <span className="text-white/35 text-xs flex-1 truncate">{url}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 flex-shrink-0"
            style={{ background: copied ? "rgba(52,211,153,0.2)" : "rgba(239,68,68,0.8)", color: "white" }}
          >
            {copied ? <><Check className="w-3 h-3" /> Copied</> : "Copy"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
 * COMMENT PANEL
 * ───────────────────────────────────────────── */
function CommentPanel({ short, onClose }: { short: Short; onClose: () => void }) {
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingC, setLoadingC] = useState(true);
  const auth = getAuth();

  useEffect(() => {
    fetch(`${API_URL}/videos/${short.id}/comments`)
      .then(r => r.json()).then(d => setComments(d.comments || []))
      .catch(() => { }).finally(() => setLoadingC(false));
  }, [short.id]);

  const submitComment = async () => {
    if (!text.trim() || !auth.currentUser || submitting) return;
    setSubmitting(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await fetch(`${API_URL}/videos/${short.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ comment_text: text }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments(prev => [data.comment || { id: Date.now(), user_email: auth.currentUser!.email, comment_text: text, created_at: new Date().toISOString() }, ...prev]);
        setText("");
      }
    } finally { setSubmitting(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38 }}
        className="w-full max-w-lg flex flex-col"
        style={{ height: "70vh", background: "#111", borderRadius: "24px 24px 0 0", border: "1px solid rgba(255,255,255,0.07)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
            <p className="text-white font-semibold text-sm">Comments</p>
            {!loadingC && (
              <span className="text-[11px] px-2 py-0.5 rounded-full text-white/40" style={{ background: "rgba(255,255,255,0.08)" }}>
                {comments.length}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)" }}>
            <X className="w-3.5 h-3.5 text-white/50" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ scrollbarWidth: "none" }}>
          {loadingC ? (
            <div className="flex justify-center py-10"><div className="w-7 h-7 rounded-full border-t-2 border-white/30 animate-spin" /></div>
          ) : comments.length === 0 ? (
            <p className="text-center py-12 text-white/25 text-sm">No comments yet</p>
          ) : comments.map((c: any) => (
            <div key={c.id} className="flex gap-3">
              <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getAvatarColor(c.user_email || "")} flex items-center justify-center text-xs font-bold flex-shrink-0 text-white`}>
                {(c.user_email || "?")[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-0.5">
                  <span className="text-white/80 text-xs font-semibold">@{(c.user_email || "").split("@")[0]}</span>
                  <span className="text-white/25 text-[10px]">{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-white/65 text-sm leading-relaxed">{c.comment_text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2.5 px-4 py-3 flex-shrink-0 border-t border-white/5">
          <input
            value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submitComment()}
            placeholder={auth.currentUser ? "Add a comment…" : "Sign in to comment"}
            disabled={!auth.currentUser}
            className="flex-1 text-white text-sm placeholder-white/20 outline-none rounded-2xl px-4 py-2.5"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <motion.button
            onClick={submitComment} whileTap={{ scale: 0.9 }}
            disabled={!text.trim() || !auth.currentUser || submitting}
            className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 disabled:opacity-30"
          >
            <Send className="w-3.5 h-3.5 text-white" />
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
 * MORE MENU
 * ───────────────────────────────────────────── */
function MoreMenuSheet({ short, onClose, ambientMode, onAmbientToggle }: {
  short: Short; onClose: () => void; ambientMode: boolean; onAmbientToggle: () => void;
}) {
  const navigate = useNavigate();
  const items = [
    { icon: <AlignLeft className="w-4 h-4" />, label: "View description", onClick: () => { navigate(`/watch?v=${short.public_id || short.id}`); onClose(); } },
    { icon: <ListPlus className="w-4 h-4" />, label: "Save to playlist", onClick: onClose },
    {
      icon: <Monitor className="w-4 h-4" />, label: "Ambient mode", onClick: onAmbientToggle,
      rightEl: (
        <div onClick={e => { e.stopPropagation(); onAmbientToggle(); }}
          className="relative cursor-pointer flex-shrink-0 rounded-full"
          style={{ width: 36, height: 20, background: ambientMode ? "#ef4444" : "rgba(255,255,255,0.2)" }}>
          <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: ambientMode ? 16 : 2 }} />
        </div>
      ),
    },
    { icon: <ThumbsDown className="w-4 h-4" />, label: "Not interested", onClick: onClose },
    { icon: <MessageCircleOff className="w-4 h-4" />, label: "Don't recommend channel", onClick: onClose },
    { icon: <Flag className="w-4 h-4" />, label: "Report", onClick: onClose, danger: true },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 400, damping: 40 }}
        className="w-full max-w-sm rounded-t-3xl overflow-hidden pb-2"
        style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-8 h-1 rounded-full bg-white/15" /></div>
        <div className="flex items-center gap-2.5 px-4 py-2.5 mb-1 border-b border-white/6">
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-black flex-shrink-0">
            {short.thumbnail && <img src={short.thumbnail} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-medium line-clamp-1">{cleanTitle(short.title)}</p>
            <p className="text-white/35 text-[11px]">{getDisplayName(short)}</p>
          </div>
        </div>
        <div className="px-2 py-1">
          {items.map((item, i) => (
            <button key={i} onClick={item.onClick}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
              style={{ color: (item as any).danger ? "rgba(248,113,113,0.9)" : "rgba(255,255,255,0.8)" }}
            >
              <span style={{ opacity: 0.6 }}>{item.icon}</span>
              <span className="flex-1 text-[13px]">{item.label}</span>
              {(item as any).rightEl}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ─────────────────────────────────────────────
 * SIDE ACTIONS — TikTok style vertical stack
 * ───────────────────────────────────────────── */
interface SideActionsProps {
  short: Short;
  liked: boolean;
  likesCount: number;
  onLike: (id: number) => void;
  commentsCount: number | null;
  saved: boolean;
  onToggleSave: (id: number) => void;
  ambientMode: boolean;
  onAmbientToggle: () => void;
  isMobile?: boolean;
}

function SideActions({
  short,
  liked,
  likesCount,
  onLike,
  commentsCount,
  saved,
  onToggleSave,
  ambientMode,
  onAmbientToggle,
  isMobile = false,
}: SideActionsProps) {
  const [showShare, setShowShare] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const iconSize = isMobile ? "w-7 h-7" : "w-6 h-6";
  const btnSize = isMobile ? "w-12 h-12" : "w-11 h-11";

  const ActionBtn = ({
    icon, label, onClick, active = false, accentColor,
  }: {
    icon: React.ReactNode; label: string | null;
    onClick: () => void; active?: boolean; accentColor?: string;
  }) => (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.78 }}
      aria-label={label ?? undefined}
      className="flex flex-col items-center gap-0.5"
    >
      <div
        className={`${btnSize} rounded-full flex items-center justify-center`}
        style={{
          background: active && accentColor ? `${accentColor}22` : "rgba(0,0,0,0.45)",
          border: `1px solid ${active && accentColor ? `${accentColor}55` : "rgba(255,255,255,0.12)"}`,
        }}
      >
        {icon}
      </div>
      {label && (
        <span className="text-white text-[11px] font-semibold leading-none drop-shadow-sm">{label}</span>
      )}
    </motion.button>
  );

  return (
    <>
      {/* TikTok-style right column: avatar+sub → like → comment → save → share → more */}
      <div className="flex flex-col items-center gap-4">

        {/* Avatar — links to channel. Subscribe is handled by the compact
            pill below, scaled down to fit the TikTok side-rail width.    */}
        <div className="flex flex-col items-center gap-1.5 mb-1">
          <Link
            to={`/@${short.handle || short.uploader_email?.split("@")[0] || "creator"}`}
            onClick={e => e.stopPropagation()}
          >
            <div
              className={`w-11 h-11 rounded-full bg-gradient-to-br ${getAvatarColor(short.uploader_email)} flex items-center justify-center text-sm font-bold text-white`}
              style={{ border: "2px solid rgba(255,255,255,0.7)" }}
            >
              {getDisplayName(short)[0]}
            </div>
          </Link>

          {/* Compact SubscriptionButton — using CSS `zoom` instead of
              `transform: scale()`. transform only scales the paint, not the
              layout box, so a declared height like 28px will clip the real
              (larger) button underneath it. `zoom` actually shrinks the
              layout box itself, so it sizes correctly and can never get
              clipped by an ancestor's overflow, no matter how tall the
              real button + subscriber-count badge turns out to be. */}
          <div
            style={{ zoom: 0.62 }}
            onClick={e => e.stopPropagation()}
          >
            <SubscriptionButton
              channelId={short.uploader_email}
              channelName={getDisplayName(short)}
            />
          </div>
        </div>

        {/* Like */}
        <motion.button
          onClick={() => onLike(short.id)}
          whileTap={{ scale: 0.75 }}
          aria-label="Like"
          className="flex flex-col items-center gap-0.5"
        >
          <motion.div
            animate={liked ? { scale: [1, 1.35, 1] } : {}}
            transition={{ duration: 0.3 }}
            className={`${btnSize} rounded-full flex items-center justify-center`}
            style={{
              background: liked ? "rgba(254,44,85,0.25)" : "rgba(0,0,0,0.45)",
              border: `1px solid ${liked ? "rgba(254,44,85,0.55)" : "rgba(255,255,255,0.12)"}`,
            }}
          >
            <Heart className={`${iconSize} ${liked ? "fill-[#fe2c55] text-[#fe2c55]" : "text-white"}`} />
          </motion.div>
          <span className="text-white text-[11px] font-semibold leading-none drop-shadow-sm">
            {likesCount > 0 ? fmtCount(likesCount) : "Like"}
          </span>
        </motion.button>

        {/* Comments */}
        <motion.button
          onClick={() => setShowComments(true)}
          whileTap={{ scale: 0.75 }}
          aria-label="Comments"
          className="flex flex-col items-center gap-0.5"
        >
          <div className={`${btnSize} rounded-full flex items-center justify-center`}
            style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.12)" }}>
            <MessageSquare className={`${iconSize} text-white`} />
          </div>
          <span className="text-white text-[11px] font-semibold leading-none drop-shadow-sm">
            {commentsCount === null ? "…" : commentsCount > 0 ? fmtCount(commentsCount) : "Comment"}
          </span>
        </motion.button>

        {/* Save / Bookmark */}
        <motion.button
          onClick={() => onToggleSave(short.id)}
          whileTap={{ scale: 0.75 }}
          aria-label="Save"
          className="flex flex-col items-center gap-0.5"
        >
          <div className={`${btnSize} rounded-full flex items-center justify-center`}
            style={{
              background: saved ? "rgba(234,179,8,0.2)" : "rgba(0,0,0,0.45)",
              border: `1px solid ${saved ? "rgba(234,179,8,0.5)" : "rgba(255,255,255,0.12)"}`,
            }}>
            {saved
              ? <BookmarkCheck className={`${iconSize} text-yellow-400`} />
              : <Bookmark className={`${iconSize} text-white`} />}
          </div>
          <span className="text-white text-[11px] font-semibold leading-none drop-shadow-sm">
            {saved ? "Saved" : "Save"}
          </span>
        </motion.button>

        {/* Share */}
        <ActionBtn
          icon={<Share2 className={`${iconSize} text-white`} />}
          label="Share"
          onClick={() => setShowShare(true)}
        />

        {/* Views */}
        <div className="flex flex-col items-center gap-0.5">
          <div className={`${btnSize} rounded-full flex items-center justify-center`}
            style={{ background: "rgba(0,0,0,0.45)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <Eye className={`${iconSize} text-white/40`} />
          </div>
          <span className="text-white/50 text-[11px] font-semibold leading-none drop-shadow-sm">
            {short.views > 0 ? fmtCount(short.views) : "Views"}
          </span>
        </div>

        {/* More */}
        <ActionBtn
          icon={<MoreVertical className="w-4 h-4 text-white" />}
          label={null}
          onClick={() => setShowMore(true)}
        />
      </div>

      <AnimatePresence>
        {showComments && <CommentPanel short={short} onClose={() => setShowComments(false)} />}
        {showShare && <ShareModal short={short} onClose={() => setShowShare(false)} />}
        {showMore && (
          <MoreMenuSheet
            short={short} onClose={() => setShowMore(false)}
            ambientMode={ambientMode} onAmbientToggle={onAmbientToggle}
          />
        )}
      </AnimatePresence>
    </>
  );
}

/* ─────────────────────────────────────────────
 * SHORT PLAYER
 * Full-screen TikTok-style with swipe, double-tap, side actions
 * ───────────────────────────────────────────── */
interface ShortPlayerProps {
  short: Short;
  isActive: boolean;
  onLike: (id: number) => void;
  liked: boolean;
  likesCount: number;
  onVideoEnd: () => void;
  ambientMode: boolean;
  commentsCount: number | null;
  saved: boolean;
  onToggleSave: (id: number) => void;
  onAmbientToggle: () => void;
  isMobile?: boolean;
}

function ShortPlayer({
  short, isActive, onLike, liked, likesCount,
  onVideoEnd, ambientMode,
  commentsCount, saved, onToggleSave, onAmbientToggle,
  isMobile = false,
}: ShortPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { muted, setMuted } = useContext(MuteContext);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [showHook, setShowHook] = useState(true);
  const [showFlash, setShowFlash] = useState<"play" | "pause" | null>(null);
  const [showDesc, setShowDesc] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const heartIdRef = useRef(0);

  const videoUrl = short.url || short.video_url;
  const ambientColor = useAmbientColor(videoRef, ambientMode && playing);
  const channelWatermark = getChannelWatermark({
    email: short.uploader_email,
    channel_name: short.channel_name || "",
    handle: short.handle || "",
    watermark_url: short.watermark_url,
  });

  /* ── Load / destroy HLS ──
     NOTE: crossOrigin="anonymous" is only needed for the ambient-glow canvas
     sampling feature. Setting it unconditionally forces the browser to CORS-
     validate every video request — if the CDN doesn't send
     Access-Control-Allow-Origin for video assets, playback fails outright
     (the browser's native "broken media" icon). So we only opt in to it when
     ambient mode is actually enabled, and we fail soft either way. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    setLoading(true); setProgress(0); setBuffered(0); setVideoError(false);

    if (ambientMode) video.crossOrigin = "anonymous";
    else video.removeAttribute("crossorigin");

    if (Hls.isSupported() && (videoUrl.includes(".m3u8") || videoUrl.includes("hls"))) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 20, startLevel: 0 });
      hlsRef.current = hls;
      hls.loadSource(videoUrl); hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => setLoading(false));
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        setLoading(false);
        if (data?.fatal) setVideoError(true);
      });
    } else {
      video.src = videoUrl;
      video.onloadeddata = () => setLoading(false);
      video.onerror = () => { setLoading(false); setVideoError(true); };
    }
    video.loop = false;
    return () => { hlsRef.current?.destroy(); hlsRef.current = null; video.removeAttribute("src"); };
  }, [videoUrl, ambientMode]);

  /* ── Manual retry after a failed load ── */
  const retryVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    setVideoError(false); setLoading(true);
    video.src = videoUrl;
    video.load();
    video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [videoUrl]);

  /* ── Autoplay when active ── */
  useEffect(() => {
    const video = videoRef.current; if (!video) return;
    if (isActive) {
      const t = setTimeout(() => {
        video.muted = muted; video.volume = 1;
        video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      }, 80);
      return () => clearTimeout(t);
    } else { video.pause(); setPlaying(false); }
  }, [isActive]);  

  /* ── Sync mute ── */
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);

  /* ── Hook text ── */
  useEffect(() => {
    if (!isActive) return;
    setShowHook(true);
    const t = setTimeout(() => setShowHook(false), HOOK_DURATION_MS);
    return () => clearTimeout(t);
  }, [isActive, short.id]);

  /* ── Cleanup ── */
  useEffect(() => () => {
    hlsRef.current?.destroy(); hlsRef.current = null;
    const v = videoRef.current;
    if (v) { v.pause(); v.muted = true; v.removeAttribute("src"); v.load(); }
  }, []);

  /* ── Single vs double tap ── */
  const handleTap = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (tapTimer.current) {
      // Double tap → like + heart burst
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      onLike(short.id);
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const id = ++heartIdRef.current;
      setHearts(prev => [...prev, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
      setTimeout(() => setHearts(prev => prev.filter(h => h.id !== id)), 900);
    } else {
      // Single tap — wait to confirm not double
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        const v = videoRef.current; if (!v) return;
        if (v.paused) { v.play(); setPlaying(true); setShowFlash("play"); }
        else { v.pause(); setPlaying(false); setShowFlash("pause"); }
        setTimeout(() => setShowFlash(null), 700);
      }, 200);
    }
  }, [short.id, onLike]);

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const v = videoRef.current; if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - rect.left) / rect.width) * v.duration;
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current; if (!v?.duration) return;
    setProgress((v.currentTime / v.duration) * 100);
    if (v.buffered.length > 0)
      setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black" style={{ borderRadius: "inherit" }}>

      {/* Ambient glow - scales with container */}
      {ambientMode && (
        <div className="absolute inset-0 pointer-events-none"
          style={{
            zIndex: 0,
            background: ambientColor,
            filter: "blur(80px)",
            opacity: 0.4,
            transition: "background 1.5s ease",
            margin: "-50%"
          }}
        />
      )}

      {/* Video — always crop-fill the 9:16 frame (TikTok/Shorts style).
          Using object-contain here made any clip whose native aspect ratio
          isn't exactly 9:16 shrink down with black bars once the real frame
          painted (looked "full screen" while black, then "small" once
          loaded). object-cover keeps it filling the frame at all times. */}
<video
  ref={videoRef}
  className="w-full h-full relative z-10 object-cover"
  style={{
    display: "block",
    backgroundColor: "#000",
    backfaceVisibility: "hidden",
  }}
        playsInline
        muted={muted}
        poster={short.thumbnail}
        onTimeUpdate={handleTimeUpdate}
        onWaiting={() => setLoading(true)}
        onPlaying={() => { setLoading(false); setVideoError(false); }}
        onEnded={onVideoEnd}
        onClick={handleTap}
        onError={() => { setLoading(false); setVideoError(true); }}
        preload="metadata"
      />

      {/* Tap area — transparent layer over video (below UI) for tap/double-tap */}
      <div className="absolute inset-0" style={{ zIndex: 2 }} onClick={handleTap} />

      {/* Gradient overlay - adaptive for all aspect ratios */}
      <div className="absolute inset-0 pointer-events-none" style={{
        zIndex: 3,
        background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.08) 30%, transparent 50%, rgba(0,0,0,0.25) 70%, rgba(0,0,0,0.88) 100%)",
      }} />

      {channelWatermark && (
        <img
          src={channelWatermark}
          alt="Channel watermark"
          className="absolute h-9 w-9 rounded-sm object-contain opacity-80 shadow-lg pointer-events-none"
          style={{ zIndex: 19, right: 12, bottom: isMobile ? 148 : 72 }}
        />
      )}

      {/* Video failed to load — clear retry state instead of a frozen/broken frame */}
      <AnimatePresence>
        {videoError && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ zIndex: 12, background: "rgba(0,0,0,0.65)" }}
          >
            <p className="text-white/70 text-sm">Video couldn't be loaded</p>
            <button
              onClick={e => { e.stopPropagation(); retryVideo(); }}
              className="text-xs font-semibold text-white px-4 py-2 rounded-full"
              style={{ background: "rgba(239,68,68,0.85)" }}
            >
              Retry
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spinner */}
      <AnimatePresence>
        {loading && !videoError && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 10 }}>
            <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-white animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hook text */}
      <AnimatePresence>
        {showHook && isActive && !loading && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}
            className="absolute left-0 right-0 flex justify-center pointer-events-none"
            style={{ zIndex: 20, top: isMobile ? 48 : 12 }}
          >
            <div className="text-white text-xs font-semibold px-3.5 py-1.5 rounded-full text-center"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)", maxWidth: "80%" }}>
              {getHookText(short.id)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Play/pause flash */}
      <AnimatePresence>
        {showFlash && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.4 }} transition={{ duration: 0.18 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 15 }}
          >
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)" }}>
              {showFlash === "pause"
                ? <Pause className="w-7 h-7 text-white" />
                : <Play className="w-7 h-7 text-white ml-1" />
              }
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Heart burst on double-tap */}
      <AnimatePresence>
        {hearts.map(({ id, x, y }) => (
          <motion.div key={id}
            initial={{ opacity: 1, scale: 0.3, x: x - 28, y: y - 28 }}
            animate={{ opacity: 0, scale: 2.2, y: y - 100 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.85, ease: "easeOut" }}
            className="absolute pointer-events-none" style={{ zIndex: 30, left: 0, top: 0 }}
          >
            <Heart className="w-14 h-14 fill-[#fe2c55] text-[#fe2c55]" />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Top-right controls: mute */}
      <div className="absolute flex items-center gap-2 pointer-events-auto" style={{ top: 12, right: 12, zIndex: 20 }}>
        <button
          onClick={e => { e.stopPropagation(); setMuted(!muted); }}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.14)" }}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted
            ? <VolumeX className="w-4 h-4 text-white" />
            : <Volume2 className="w-4 h-4 text-white" />}
        </button>
      </div>

      {/* ── Mobile: Side actions overlaid on video (TikTok style) ── */}
      {isMobile && (
        <div
          className="absolute pointer-events-auto"
          style={{ zIndex: 20, right: 10, bottom: 80 }}
          onClick={e => e.stopPropagation()}
        >
          <SideActions
            short={short}
            liked={liked}
            likesCount={likesCount}
            onLike={onLike}
            commentsCount={commentsCount}
            saved={saved}
            onToggleSave={onToggleSave}
            ambientMode={ambientMode}
            onAmbientToggle={onAmbientToggle}
            isMobile
          />
        </div>
      )}

      {/* Bottom info */}
      <div
        className="absolute left-3 z-10 pointer-events-none"
        style={{ bottom: isMobile ? 20 : 32, right: isMobile ? 80 : 16 }}
      >
        {/* Creator info — desktop only (subscribe lives in the right-side SideActions rail) */}
        {!isMobile && (
          <Link
            to={`/@${short.handle || short.uploader_email?.split("@")[0] || "creator"}`}
            className="flex items-center gap-2 mb-2 pointer-events-auto w-fit"
            onClick={e => e.stopPropagation()}
          >
            <div
              className={`w-7 h-7 rounded-full bg-gradient-to-br ${getAvatarColor(short.uploader_email)} flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0`}
              style={{ border: "1.5px solid rgba(255,255,255,0.5)" }}
            >
              {getDisplayName(short)[0]}
            </div>
            <span className="text-white text-xs font-semibold">
              {getDisplayName(short)}
            </span>
          </Link>
        )}

        {/* Creator name on mobile */}
        {isMobile && (
          <Link to={`/@${short.handle || short.uploader_email?.split("@")[0] || "creator"}`}
            className="flex items-center gap-1.5 mb-1.5 pointer-events-auto"
            onClick={e => e.stopPropagation()}>
            <span className="text-white text-sm font-bold drop-shadow-md">
              {getDisplayName(short)}
            </span>
          </Link>
        )}

        {/* Title — expandable */}
        <button
          className="text-left pointer-events-auto w-full"
          onClick={e => { e.stopPropagation(); setShowDesc(d => !d); }}
        >
          <p className={`text-white text-sm font-medium leading-snug mb-2 drop-shadow ${showDesc ? "" : "line-clamp-2"}`}>
            {cleanTitle(short.title)}
          </p>
        </button>

        {/* Audio row */}
        <div className="flex items-center gap-1.5 pointer-events-auto w-fit"
          style={{ background: "rgba(0,0,0,0.35)", borderRadius: 20, padding: "3px 10px 3px 7px", backdropFilter: "blur(6px)", maxWidth: "90%" }}>
          <Music2 className="w-2.5 h-2.5 text-white/60 flex-shrink-0" />
          <div className="overflow-hidden" style={{ maxWidth: 110 }}>
            <motion.span
              animate={{ x: ["0%", "-100%"] }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
              className="text-[10px] text-white/55 whitespace-nowrap inline-block"
            >
              Original audio · AirStreamX &nbsp;&nbsp;
            </motion.span>
          </div>
          <button onClick={e => e.stopPropagation()}
            className="ml-1 text-[10px] font-semibold text-white/75 px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)" }}>
            Use sound
          </button>
        </div>
      </div>

      {/* Progress bar — thicker track, opaque dark backing strip (not just a
          fade), and an outlined thumb so it stays readable over bright or
          busy frames (e.g. lyrics videos) instead of blending in. */}
      <div
        className="absolute bottom-0 left-0 right-0 cursor-pointer"
        style={{ zIndex: 35, paddingTop: 20, paddingBottom: 10 }}
        onClick={e => { e.stopPropagation(); seekTo(e); }}
        role="slider"
        aria-valuenow={Math.floor(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Seek"
      >
        {/* Opaque-at-the-bottom backing strip so the track always has contrast,
            regardless of what's playing behind it */}
        <div className="absolute inset-x-0 bottom-0 pointer-events-none"
          style={{ height: 56, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 45%, transparent 100%)" }} />
        <div className="relative w-full mx-3" style={{ width: "calc(100% - 24px)", height: 6, margin: "0 auto" }}>
          <div className="absolute inset-0 bg-white/35 rounded-full" style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.4)" }} />
          <div className="absolute top-0 left-0 h-full rounded-full bg-white/60"
            style={{ width: `${buffered}%`, transition: "width 0.3s linear" }} />
          <div className="absolute top-0 left-0 h-full rounded-full"
            style={{ width: `${progress}%`, background: "linear-gradient(to right,#fe2c55,#a855f7)", boxShadow: "0 0 8px rgba(254,44,85,0.8)", transition: "width 0.1s linear" }} />
          <div className="absolute top-1/2 w-4 h-4 rounded-full bg-white"
            style={{ left: `${progress}%`, transform: "translate(-50%,-50%)", boxShadow: "0 0 0 2.5px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.6)" }} />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * SKELETON
 * ───────────────────────────────────────────── */
function Skeleton() {
  return (
    <div className="flex items-center justify-center w-full h-full gap-0">
      <div style={{ width: 52 }} />
      <div className="bg-white/5 animate-pulse rounded-2xl flex-shrink-0"
        style={{ aspectRatio: "9/16", height: "min(calc(100vh - 80px), 700px)", width: "auto" }} />
      <div className="flex flex-col items-center gap-5" style={{ width: 80, paddingLeft: 16 }}>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="w-11 h-11 rounded-full bg-white/5 animate-pulse" style={{ animationDelay: `${i * 0.08}s` }} />
            <div className="w-7 h-2 rounded bg-white/5 animate-pulse" style={{ animationDelay: `${i * 0.08}s` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * MAIN PAGE
 * ───────────────────────────────────────────── */
interface ShortsPageProps {
  theme: "dark" | "neon";
  setTheme: (t: "dark" | "neon") => void;
  q?: string;
  setQ?: (v: string) => void;
  themeCls: { page: string; panel: string };
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleUploadClick: () => void;
  uploading: boolean;
}

export default function ShortsPage({
  theme, setTheme, q: qProp, setQ: setQProp, themeCls, fileInputRef, handleUploadClick, uploading,
}: ShortsPageProps) {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  const [localQ, setLocalQ] = useState("");
  const q = qProp ?? localQ;
  const setQ = setQProp ?? setLocalQ;

  const [shorts, setShorts] = useState<Short[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [likedIds, setLikedIds] = useState<Set<number>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<number, number>>({});
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [commentCounts, setCommentCounts] = useState<Record<number, number | null>>({});
  const [ambientMode, setAmbientMode] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  /* Swipe drag state */
  const dragStartY = useRef(0);
  const dragStartTime = useRef(0);
  const isDragging = useRef(false);
  const [dragDelta, setDragDelta] = useState(0);

  const muteCtx = useMemo(() => ({ muted, setMuted }), [muted]);
  const isScrolling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewedIds = useRef<Set<number>>(new Set());

  const nextUrl = useMemo(
    () => shorts[activeIndex + 1]?.url || shorts[activeIndex + 1]?.video_url,
    [shorts, activeIndex],
  );
  useVideoPreloader(nextUrl);

  /* Fetch shorts */
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/videos?limit=50`);
        const data = await res.json();
        const all = data.videos || [];
        const filtered: Short[] = all.filter((v: Short) => v.duration > 0 && v.duration <= MAX_SHORT_DURATION);
        setShorts(filtered);
        const counts: Record<number, number> = {};
        const cc: Record<number, number | null> = {};
        filtered.forEach((v: Short) => { counts[v.id] = v.likes || 0; cc[v.id] = null; });
        setLikeCounts(counts);
        setCommentCounts(cc);
      } catch { }
      finally { setLoading(false); }
    })();
  }, []);

  /* Update URL when active short changes */
  useEffect(() => {
    const short = shorts[activeIndex];
    if (!short) return;
    const pid = short.public_id || short.id;
    window.history.replaceState(null, "", `/shorts/${pid}`);
  }, [activeIndex, shorts]);

  /* Lazy-load comment count for active video */
  useEffect(() => {
    const short = shorts[activeIndex];
    if (!short) return;
    if (commentCounts[short.id] !== null && commentCounts[short.id] !== undefined) return;
    fetch(`${API_URL}/videos/${short.id}/comments`)
      .then(r => r.json())
      .then(d => setCommentCounts(prev => ({ ...prev, [short.id]: Array.isArray(d.comments) ? d.comments.length : 0 })))
      .catch(() => setCommentCounts(prev => ({ ...prev, [short.id]: 0 })));
  }, [activeIndex, shorts]);  

  /* URL sync — support both /shorts/26 (numeric) and /shorts/Cb42DJaiw6c (public_id) */
  useEffect(() => {
    if (id && shorts.length > 0) {
      // Try public_id first, then numeric id
      let idx = shorts.findIndex(s => s.public_id === id);
      if (idx < 0) idx = shorts.findIndex(s => String(s.id) === String(id));
      if (idx >= 0) setActiveIndex(idx);
    }
  }, [id, shorts]);

  /* View tracking */
  useEffect(() => {
    if (!shorts[activeIndex]) return;
    const sid = shorts[activeIndex].id;
    if (viewedIds.current.has(sid)) return;
    viewedIds.current.add(sid);
    const t = setTimeout(() => { fetch(`${API_URL}/videos/${sid}/view`, { method: "POST" }).catch(() => { }); }, 2000);
    return () => clearTimeout(t);
  }, [activeIndex, shorts]);

  /* Like with optimistic rollback */
  const handleLike = useCallback(async (videoId: number) => {
    const auth = getAuth();
    if (!auth.currentUser) { navigate("/"); return; }
    const wasLiked = likedIds.has(videoId);
    setLikedIds(prev => { const n = new Set(prev); wasLiked ? n.delete(videoId) : n.add(videoId); return n; });
    setLikeCounts(prev => ({ ...prev, [videoId]: Math.max(0, (prev[videoId] || 0) + (wasLiked ? -1 : 1)) }));
    try {
      const token = await auth.currentUser!.getIdToken();
      await fetch(`${API_URL}/videos/${videoId}/like`, {
        method: wasLiked ? "DELETE" : "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      setLikedIds(prev => { const n = new Set(prev); wasLiked ? n.add(videoId) : n.delete(videoId); return n; });
      setLikeCounts(prev => ({ ...prev, [videoId]: Math.max(0, (prev[videoId] || 0) + (wasLiked ? 1 : -1)) }));
    }
  }, [likedIds, navigate]);

  const handleToggleSave = useCallback((videoId: number) => {
    setSavedIds(prev => { const n = new Set(prev); n.has(videoId) ? n.delete(videoId) : n.add(videoId); return n; });
  }, []);

  const goNext = useCallback(() => {
    if (activeIndex < shorts.length - 1) { setActiveIndex(i => i + 1); setDragDelta(0); }
  }, [activeIndex, shorts.length]);

  const goPrev = useCallback(() => {
    if (activeIndex > 0) { setActiveIndex(i => i - 1); setDragDelta(0); }
  }, [activeIndex]);

  const handleVideoEnd = useCallback(() => {
    if (activeIndex < shorts.length - 1) setActiveIndex(i => i + 1);
  }, [activeIndex, shorts.length]);

  /* Desktop wheel */
  useEffect(() => {
    const el = containerRef.current; if (!el || isMobile) return;
    const fn = (e: WheelEvent) => {
      e.preventDefault();
      if (isScrolling.current) return;
      isScrolling.current = true;
      setTimeout(() => { isScrolling.current = false; }, 700);
      if (e.deltaY > 0) goNext(); else goPrev();
    };
    el.addEventListener("wheel", fn, { passive: false });
    return () => el.removeEventListener("wheel", fn);
  }, [goNext, goPrev, isMobile]);

  /* Mobile: smooth drag-to-navigate (TikTok style) */
  useEffect(() => {
    const el = containerRef.current; if (!el || !isMobile) return;

    const onTouchStart = (e: TouchEvent) => {
      dragStartY.current = e.touches[0].clientY;
      dragStartTime.current = Date.now();
      isDragging.current = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      const dy = dragStartY.current - e.touches[0].clientY;
      isDragging.current = Math.abs(dy) > 8;
      if (isDragging.current) {
        e.preventDefault();
        setDragDelta(dy);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!isDragging.current) return;
      const dy = dragStartY.current - e.changedTouches[0].clientY;
      const elapsed = Date.now() - dragStartTime.current;
      const velocity = Math.abs(dy) / elapsed; // px/ms
      const snap = Math.abs(dy) > SWIPE_THRESHOLD || velocity > 0.4;

      if (snap) {
        if (dy > 0) goNext(); else goPrev();
      } else {
        setDragDelta(0);
      }
      isDragging.current = false;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [goNext, goPrev, isMobile]);

  /* Keyboard */
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((document.activeElement as HTMLElement)?.tagName ?? "")) return;
      if (e.key === "ArrowDown" || e.key === "j") goNext();
      else if (e.key === "ArrowUp" || e.key === "k") goPrev();
      else if (e.key === "m" || e.key === "M") setMuted(v => !v);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [goNext, goPrev]);

  /* Resize */
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);

  /* ── Loading state ── */
  if (loading) return (
    <>
      <Header theme={theme} setTheme={setTheme} q={q} setQ={setQ} themeCls={themeCls}
        fileInputRef={fileInputRef} handleUploadClick={handleUploadClick} uploading={uploading} />
      <div style={{ height: "calc(100vh - 64px)", background: "#0a0a0a" }}><Skeleton /></div>
    </>
  );

  /* ── Empty state ── */
  if (shorts.length === 0) return (
    <>
      <Header theme={theme} setTheme={setTheme} q={q} setQ={setQ} themeCls={themeCls}
        fileInputRef={fileInputRef} handleUploadClick={handleUploadClick} uploading={uploading} />
      <div className="flex flex-col items-center justify-center gap-3 text-center"
        style={{ height: "calc(100vh - 64px)", background: "#0a0a0a" }}>
        <div className="text-5xl opacity-40">📱</div>
        <p className="text-white text-lg font-semibold">No Shorts yet</p>
        <p className="text-white/30 text-sm">Upload videos under 60 seconds to create Shorts</p>
      </div>
    </>
  );

  const current = shorts[activeIndex];

  /* ── Render ── */
  return (
    <MuteContext.Provider value={muteCtx}>
      {/* Header — hidden on mobile for pure full-screen TikTok feel */}
      {!isMobile && (
        <Header
          theme={theme} setTheme={setTheme} q={q} setQ={setQ}
          themeCls={themeCls} fileInputRef={fileInputRef}
          handleUploadClick={handleUploadClick} uploading={uploading}
        />
      )}

      <div
        ref={containerRef}
        className="relative overflow-hidden"
        style={{
          height: isMobile ? "100dvh" : "calc(100vh - 64px)",
          background: "#0a0a0a",
          touchAction: "none",
        }}
      >

        {/* ══════════════════════════════════════════
            DESKTOP LAYOUT
        ══════════════════════════════════════════ */}
        {!isMobile && (
          <div className="flex h-full">

            {/* Slim sidebar: Home + Shorts */}
            <nav className="hidden md:flex flex-col flex-shrink-0 pt-6 gap-1"
              style={{ width: "clamp(72px, 14vw, 200px)", background: "#0a0a0a", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
              {[
                { icon: "🏠", label: "Home", path: "/", active: false },
                { icon: "⚡", label: "Shorts", path: "/shorts", active: true },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className="flex items-center gap-3 mx-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: item.active ? "rgba(254,44,85,0.13)" : "transparent",
                    color: item.active ? "#fe2c55" : "rgba(255,255,255,0.55)",
                    borderLeft: item.active ? "3px solid #fe2c55" : "3px solid transparent",
                  }}
                  onMouseEnter={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
                  onMouseLeave={e => { if (!item.active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span className="text-lg">{item.icon}</span>
                  <span className="hidden lg:inline">{item.label}</span>
                </button>
              ))}
            </nav>

            {/* Center content */}
            <div className="flex-1 flex items-center justify-center min-w-0 relative">
              <div className="flex items-center" style={{ gap: "clamp(8px, 2vw, 16px)" }}>

                {/* PREV button */}
                <div className="flex flex-col items-center gap-2">
                  <motion.button
                    onClick={goPrev}
                    disabled={activeIndex === 0}
                    whileHover={{ scale: activeIndex === 0 ? 1 : 1.1 }}
                    whileTap={{ scale: 0.88 }}
                    className="w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-20 disabled:cursor-not-allowed"
                    style={{ background: "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.18)", backdropFilter: "blur(12px)" }}
                    aria-label="Previous short"
                  >
                    <ChevronUp className="w-5 h-5 text-white" />
                  </motion.button>
                  <span className="text-[10px] font-medium text-white/35 select-none tracking-widest">PREV</span>
                </div>

                {/* Player - YouTube style responsive sizing */}
                <div
                  className="relative flex-shrink-0"
                  style={{
                    aspectRatio: "9/16",
                    height: "min(calc(100vh - 80px), 700px)",
                    width: "auto",
                    maxWidth: "clamp(300px, 60vw, 450px)",
                    borderRadius: 20,
                    overflow: "hidden",
                    background: "#000",
                    boxShadow: "0 28px 80px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05)",
                  }}
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeIndex}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.97 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="absolute inset-0"
                    >
                      <ShortPlayer
                        short={current}
                        isActive={true}
                        onLike={handleLike}
                        liked={likedIds.has(current.id)}
                        likesCount={likeCounts[current.id] ?? current.likes}
                        onVideoEnd={handleVideoEnd}
                        ambientMode={ambientMode}
                        commentsCount={commentCounts[current.id] ?? null}
                        saved={savedIds.has(current.id)}
                        onToggleSave={handleToggleSave}
                        onAmbientToggle={() => setAmbientMode(a => !a)}
                        isMobile={false}
                      />
                    </motion.div>
                  </AnimatePresence>

                  {/* Counter */}
                  <div
                    className="absolute top-3 left-1/2 -translate-x-1/2 z-20 text-white/35 text-[11px] pointer-events-none"
                    style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", borderRadius: 20, padding: "3px 10px" }}
                  >
                    {activeIndex + 1} / {shorts.length}
                  </div>
                </div>

                {/* Side actions + NEXT — height-capped and internally scrollable so it
                    can NEVER overflow above the player into the header, no matter how
                    short the viewport is. This is what fixes the Subscribe pill
                    colliding with the header on smaller/shorter windows. */}
                <div
                  className="flex flex-col items-center justify-between"
                  style={{
                    height: "min(calc(100vh - 80px), 700px)",
                    paddingTop: 4,
                    paddingBottom: 4,
                  }}
                >
                  <div
                    className="flex flex-col items-center gap-3 overflow-y-auto"
                    style={{ scrollbarWidth: "none", maxHeight: "100%" }}
                  >
                    <SideActions
                      short={current} liked={likedIds.has(current.id)}
                      likesCount={likeCounts[current.id] ?? current.likes}
                      onLike={handleLike}
                      commentsCount={commentCounts[current.id] ?? null}
                      saved={savedIds.has(current.id)}
                      onToggleSave={handleToggleSave}
                      ambientMode={ambientMode}
                      onAmbientToggle={() => setAmbientMode(a => !a)}
                      isMobile={false}
                    />
                  </div>

                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <div style={{ width: 32, height: 1, background: "rgba(255,255,255,0.08)" }} />
                    <motion.button
                      onClick={goNext}
                      disabled={activeIndex === shorts.length - 1}
                      whileHover={{ scale: activeIndex === shorts.length - 1 ? 1 : 1.1 }}
                      whileTap={{ scale: 0.88 }}
                      className="flex flex-col items-center gap-2 disabled:opacity-20 disabled:cursor-not-allowed"
                      aria-label="Next short"
                    >
                      <div className="w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.18)", backdropFilter: "blur(12px)" }}>
                        <ChevronDown className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-[10px] font-medium text-white/35 select-none tracking-widest">NEXT</span>
                    </motion.button>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════
            MOBILE LAYOUT — pure TikTok full-screen
        ══════════════════════════════════════════ */}
        {isMobile && (
          <div className="absolute inset-0 overflow-hidden w-screen h-screen">

            {/* Full-screen player with drag transform */}
            <motion.div
              className="absolute inset-0 w-full h-full"
              style={{
                y: -Math.max(-100, Math.min(100, dragDelta * 0.35)),
                transition: isDragging.current ? "none" : "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
              }}
            >
              <ShortPlayer
                short={current}
                isActive={true}
                onLike={handleLike}
                liked={likedIds.has(current.id)}
                likesCount={likeCounts[current.id] ?? current.likes}
                onVideoEnd={handleVideoEnd}
                ambientMode={ambientMode}
                commentsCount={commentCounts[current.id] ?? null}
                saved={savedIds.has(current.id)}
                onToggleSave={handleToggleSave}
                onAmbientToggle={() => setAmbientMode(a => !a)}
                isMobile={isMobile}
              />
            </motion.div>

            {/* Top bar: back + counter */}
            <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 pt-12 pb-2 pointer-events-none"
              style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)" }}>
              <button
                className="pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.12)" }}
                onClick={() => navigate(-1)}
                aria-label="Back"
              >
                <ChevronLeft className="w-5 h-5 text-white" />
              </button>
              <span className="text-white/55 text-xs font-medium"
                style={{ background: "rgba(0,0,0,0.35)", borderRadius: 20, padding: "3px 10px", backdropFilter: "blur(6px)" }}>
                {activeIndex + 1} / {shorts.length}
              </span>
              <div style={{ width: 36 }} /> {/* spacer */}
            </div>

            {/* Swipe progress dots */}
            <div className="absolute top-12 left-0 right-0 z-30 flex justify-center pointer-events-none" style={{ paddingTop: 0 }}>
              <div className="flex gap-1 px-3">
                {shorts.slice(Math.max(0, activeIndex - 4), activeIndex + 5).map((_, i) => {
                  const absIdx = Math.max(0, activeIndex - 4) + i;
                  const isActive = absIdx === activeIndex;
                  return (
                    <motion.div key={absIdx}
                      animate={{ width: isActive ? 20 : 6, opacity: isActive ? 1 : 0.3 }}
                      className="h-1 rounded-full bg-white"
                    />
                  );
                })}
              </div>
            </div>

          </div>
        )}
      </div>
    </MuteContext.Provider>
  );
}