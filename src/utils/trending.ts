// utils/trending.ts
//
// Trending helpers:
//   • fetchTrending()   — GET /videos/trending (ranked by recent views,
//                         likes and shares, with time decay)
//   • getTrendingRank() — "🔥 #3 on Trending" for the Watch page
//   • trackShare()      — counts a share so shared videos rise on Trending

import { API_URL } from "./constants";

export interface TrendingVideo {
  id: number | string;
  public_id: string | number;
  title: string;
  category?: string | null;
  created_at?: string;
  uploader: string;
  channel_name?: string;
  avatar_url?: string;
  handle?: string;
  thumbnail: string;
  views: number;
  likes?: number;
  duration?: number | null;
  is_short: boolean;
  views_24h: number;
  shares_24h: number;
  trending_rank: number;
  /** false = no recent activity, only shown to fill the list */
  is_trending: boolean;
}

export interface TrendingResponse {
  videos: TrendingVideo[];
  categories: string[];
}

export interface TrendingCreator {
  handle: string;
  name: string;
  avatar: string;
  subscribers: number;
  video_count?: number;
  is_trending?: boolean;
}

export type TrendingType = "" | "long" | "short";

export async function fetchTrending(
  opts: { type?: TrendingType; category?: string; limit?: number; signal?: AbortSignal } = {}
): Promise<TrendingResponse> {
  const q = new URLSearchParams({ limit: String(opts.limit ?? 24) });
  if (opts.type) q.set("type", opts.type);
  if (opts.category && opts.category !== "All") q.set("category", opts.category);
  const res = await fetch(`${API_URL}/videos/trending?${q}`, { signal: opts.signal });
  if (!res.ok) throw new Error(`Trending failed (${res.status})`);
  const data = await res.json();
  return {
    videos: Array.isArray(data?.videos) ? data.videos : [],
    categories: Array.isArray(data?.categories) ? data.categories : [],
  };
}

export async function fetchTrendingCreators(limit = 12, signal?: AbortSignal): Promise<TrendingCreator[]> {
  const res = await fetch(`${API_URL}/creators/trending?limit=${limit}`, { signal });
  if (!res.ok) throw new Error(`Trending creators failed (${res.status})`);
  const data = await res.json();
  // Older backend versions returned a bare array
  return Array.isArray(data) ? data : Array.isArray(data?.creators) ? data.creators : [];
}

/* ── Rank lookup for the Watch page (one request per 5 minutes) ── */

const RANK_TTL_MS = 5 * 60 * 1000;
const RANK_LIMIT = 20;
let rankCache: { at: number; promise: Promise<TrendingVideo[]> } | null = null;

function topTrending(): Promise<TrendingVideo[]> {
  if (!rankCache || Date.now() - rankCache.at > RANK_TTL_MS) {
    const promise = fetchTrending({ limit: RANK_LIMIT })
      .then((r) => r.videos)
      .catch(() => {
        rankCache = null; // retry on the next call
        return [] as TrendingVideo[];
      });
    rankCache = { at: Date.now(), promise };
  }
  return rankCache.promise;
}

/** Trending position (1–20) of a video, or null if it is not trending. */
export async function getTrendingRank(id: string | number | undefined, publicId?: string | number): Promise<number | null> {
  if (id == null && publicId == null) return null;
  const want = new Set([id, publicId].filter((x) => x != null).map(String));
  const list = await topTrending();
  const hit = list.find((v) => v.is_trending && (want.has(String(v.id)) || want.has(String(v.public_id))));
  return hit ? hit.trending_rank : null;
}

/* ── Share counting ── */

export type ShareKind = "whatsapp" | "facebook" | "x" | "telegram" | "copy" | "native" | "story";

/** Fire-and-forget; the server counts one share per visitor per video per 10 min. */
export function trackShare(videoId: string | number, target: ShareKind): void {
  try {
    fetch(`${API_URL}/videos/${encodeURIComponent(String(videoId))}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target }),
      keepalive: true, // still sent if the page navigates to the share app
    }).catch(() => {});
  } catch {
    // never break sharing because of analytics
  }
}

/** Compact number: 1234 → 1.2K */
export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}
