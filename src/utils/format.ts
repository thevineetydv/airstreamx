// ============================================================
// format.ts — Consolidated utility functions for AIrStreamX
// ============================================================

// ─── Bytes & Size ─────────────────────────────────────────────

export const fmtBytes = (bytes?: number): string => {
  if (!bytes && bytes !== 0) return "-";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${sizes[i]}`;
};

// ─── Duration ─────────────────────────────────────────────────

export const fmtDuration = (sec?: number): string => {
  if (!sec && sec !== 0) return "-";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
    : `${m}:${s.toString().padStart(2, "0")}`;
};

/** Alias for fmtDuration */
export const formatDuration = fmtDuration;

// ─── Views & Counts ───────────────────────────────────────────

export const fmtViews = (num?: number): string => {
  if (num === undefined || num === null) return "0 views";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M views`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K views`;
  return `${num} views`;
};

export const fmtCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

export const fmtSubs = (n: number = 0): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M subscribers`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K subscribers`;
  if (n === 1) return "1 subscriber";
  return `${n} subscribers`;
};

// ─── Time Ago ─────────────────────────────────────────────────

export const timeAgo = (dateStr: string | null | undefined): string => {
  if (!dateStr) return "Recently";
  try {
    const past = new Date(dateStr);
    if (isNaN(past.getTime())) return "Recently";
    const diff = Math.floor((Date.now() - past.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} mins ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 2592000) return `${Math.floor(diff / 604800)} weeks ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)} months ago`;
    return `${Math.floor(diff / 31536000)} years ago`;
  } catch {
    return "Recently";
  }
};

/** Alias for timeAgo */
export const formatTimeAgo = timeAgo;

// ─── Display Names ────────────────────────────────────────────

/**
 * Converts an email local-part into a human-readable display name.
 * "john.doe42@gmail.com" → "John Doe"
 * "vineetsitm09"        → "Vineetsitm"
 */
export const formatDisplayName = (raw: string | null | undefined): string => {
  if (!raw) return "Anonymous";
  const local = raw.includes("@") ? raw.split("@")[0] : raw;
  const parts = local.split(/[._\-0-9]+/).filter(Boolean);
  if (!parts.length) return local;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
};

/** Alias for formatDisplayName (used in some components) */
export const formatEmailAsName = formatDisplayName;

export const getDisplayName = (
  video: { uploader_name?: string; channel_name?: string; uploader?: string; uploader_email?: string }
): string => {
  const candidate = video.uploader_name || video.channel_name || video.uploader || video.uploader_email || "";
  if (!candidate) return "AirStream Creator";
  if (candidate.includes("@")) return formatDisplayName(candidate);
  return candidate;
};

// ─── Video Title Cleanup ──────────────────────────────────────

/**
 * Clean up raw filename-style video titles
 * "Pablo_Escobar_-_1080p.mp4" → "Pablo Escobar"
 */
export const formatVideoTitle = (title: string): string => {
  if (!title) return "Untitled";
  return title
    .replace(/\.(mp4|mkv|avi|mov|webm|flv|wmv)$/i, "")
    .replace(/[_\s]+(4K|2K|1080p|720p|480p|360p|HDR|SDR|HEVC|x264|x265|BluRay|WEBRip|WEB-DL|BRRip|DVDRip)[\w.-]*/gi, "")
    .replace(/_/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
};

// ─── Math Utilities ───────────────────────────────────────────

export const clamp = (n: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, n));

// ─── Avatar Colors ────────────────────────────────────────────

const AVATAR_GRADIENTS = [
  "from-red-500 to-red-600",
  "from-red-500 to-red-700",
  "from-green-500 to-emerald-600",
  "from-orange-500 to-red-600",
  "from-yellow-500 to-orange-600",
  "from-teal-500 to-cyan-600",
  "from-red-600 to-red-700",
  "from-indigo-500 to-red-700",
];

export const getAvatarColor = (email: string): string => {
  const hash = email.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
};

/** Alias */
export const getAvatarGradient = getAvatarColor;

