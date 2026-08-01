/**
 * AirStreamX — Global Recommendation Engine (Frontend)
 * ──────────────────────────────────────────────────────
 * Logged-in users  → events go to /api/events (stored in PostgreSQL)
 *                  → recommendations fetched from /api/recommendations
 * Guest users      → localStorage fallback (same as before)
 *
 * Usage:
 *   import { recordWatch, recordSearch, getRecommendations } from "./recommendationEngine";
 *
 *   // On video start:
 *   recordWatch(video, firebaseUser);
 *
 *   // On search:
 *   recordSearch("bhajan song", firebaseUser);
 *
 *   // On video end / page leave (send watch%):
 *   recordWatchProgress(video.id, 78, firebaseUser);  // 78% watched
 *
 *   // Fetch recommendations (replaces /videos?limit=50):
 *   const videos = await getRecommendations({ searchQuery, user: firebaseUser });
 */

import { getAuth } from "firebase/auth";
import { API_URL } from "./constants";

/* ─── Types ─────────────────────────────────────────────────── */

export interface VideoMeta {
  id: string | number;
  public_id?: string;
  title: string;
  description?: string;
  thumbnail: string;
  url: string;
  uploader: string;
  uploader_email?: string;
  channel_name?: string;
  avatar_url?: string;
  handle?: string;
  views?: number;
  likes?: number;
  duration?: number;
  created_at?: string;
  createdAt?: string;
  category?: string;
  _score?: number;
}

interface FirebaseUser {
  uid: string;
  email: string | null;
  getIdToken: () => Promise<string>;
}

/* ─── Internal helpers ──────────────────────────────────────── */

function getCurrentUser(): FirebaseUser | null {
  try {
    return getAuth().currentUser as FirebaseUser | null;
  } catch {
    return null;
  }
}

const LS_KEY = "asx:profile";

interface GuestProfile {
  watchHistory: { id: string; title: string; uploader: string; category?: string }[];
  categoryMap: Record<string, number>;
  uploaderMap: Record<string, number>;
  searchTerms: string[];
  seenIds: Record<string, number>;
}

function loadGuestProfile(): GuestProfile {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { }
  return { watchHistory: [], categoryMap: {}, uploaderMap: {}, searchTerms: [], seenIds: {} };
}

function saveGuestProfile(p: GuestProfile): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { }
}

async function postEvent(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${API_URL}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("[rec] event post failed:", e);
  }
}

/* ─── PUBLIC: recordWatch ───────────────────────────────────── */

export function recordWatch(video: VideoMeta, user?: FirebaseUser | null): void {
  const u = user ?? getCurrentUser();
  const id = String(video.public_id || video.id);
  const uploader = video.uploader_email || video.uploader;

  if (u?.uid) {
    postEvent({
      uid:        u.uid,
      email:      u.email,
      video_id:   parseInt(String(video.id)),
      event_type: "watch",
      watch_pct:  0,
      category:   video.category,
      uploader,
    });
  }

  const p = loadGuestProfile();
  p.seenIds[id] = Date.now();
  p.watchHistory = [
    { id, title: video.title, uploader, category: video.category },
    ...p.watchHistory.filter((e) => e.id !== id),
  ].slice(0, 50);
  if (video.category) {
    p.categoryMap[video.category] = (p.categoryMap[video.category] || 0) + 1;
  }
  p.uploaderMap[uploader] = (p.uploaderMap[uploader] || 0) + 1;
  saveGuestProfile(p);
}

/* ─── PUBLIC: recordWatchProgress ──────────────────────────── */

export function recordWatchProgress(
  videoId: string | number,
  watchPct: number,
  video?: Partial<VideoMeta>,
  user?: FirebaseUser | null
): void {
  const u = user ?? getCurrentUser();
  if (!u?.uid) return;

  postEvent({
    uid:        u.uid,
    email:      u.email,
    video_id:   parseInt(String(videoId)),
    event_type: "watch",
    watch_pct:  Math.round(watchPct),
    category:   video?.category,
    uploader:   video?.uploader_email || video?.uploader,
  });
}

/* ─── PUBLIC: recordSkip ─────────────────────────────────────── */

export function recordSkip(
  video: Partial<VideoMeta> & { id: string | number },
  watchPct: number,
  user?: FirebaseUser | null
): void {
  const u = user ?? getCurrentUser();
  if (!u?.uid) return;

  postEvent({
    uid:        u.uid,
    email:      u.email,
    video_id:   parseInt(String(video.id)),
    event_type: "skip",
    watch_pct:  Math.round(watchPct),
    category:   video.category,
    uploader:   video.uploader_email || video.uploader,
  });
}

/* ─── PUBLIC: recordSearch ──────────────────────────────────── */

export function recordSearch(query: string, user?: FirebaseUser | null): void {
  if (!query.trim()) return;
  const u = user ?? getCurrentUser();
  const q = query.trim().toLowerCase();

  if (u?.uid) {
    postEvent({
      uid:         u.uid,
      email:       u.email,
      video_id:    null,
      event_type:  "search",
      search_term: q,
    });
  }

  const p = loadGuestProfile();
  p.searchTerms = [q, ...p.searchTerms.filter((s) => s !== q)].slice(0, 10);
  saveGuestProfile(p);
}

/* ─── PUBLIC: recordLike ────────────────────────────────────── */

export function recordLike(video: VideoMeta, user?: FirebaseUser | null): void {
  const u = user ?? getCurrentUser();
  if (!u?.uid) return;

  postEvent({
    uid:        u.uid,
    email:      u.email,
    video_id:   parseInt(String(video.id)),
    event_type: "like",
    category:   video.category,
    uploader:   video.uploader_email || video.uploader,
  });
}

/* ─── PUBLIC: getRecommendations ────────────────────────────── */

export interface RecommendOptions {
  searchQuery?: string;
  excludeIds?: (string | number)[];
  limit?: number;
  user?: FirebaseUser | null;
}

export async function getRecommendations(opts: RecommendOptions = {}): Promise<VideoMeta[]> {
  const { searchQuery = "", excludeIds = [], limit = 40, user } = opts;
  const u = user ?? getCurrentUser();

  try {
    const params = new URLSearchParams();
    if (u?.uid) params.set("uid", u.uid);
    if (searchQuery) params.set("search", searchQuery);
    if (limit !== 40) params.set("limit", String(limit));
    if (excludeIds.length > 0) params.set("exclude", excludeIds.join(","));

    const res = await fetch(`${API_URL}/api/recommendations?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error("API error");
    return (data.videos || []) as VideoMeta[];
  } catch (err) {
    console.warn("[rec] API failed, using local fallback:", err);
    return localFallbackScore(searchQuery, excludeIds, limit);
  }
}

/* ─── LOCAL FALLBACK ────────────────────────────────────────── */

async function localFallbackScore(
  search: string,
  excludeIds: (string | number)[],
  limit: number
): Promise<VideoMeta[]> {
  try {
    const res = await fetch(`${API_URL}/videos?limit=60`);
    if (!res.ok) return [];
    const data = await res.json();
    const all: VideoMeta[] = data.videos || [];
    const p = loadGuestProfile();
    const excludeSet = new Set(excludeIds.map(String));
    const searchLower = search.toLowerCase();

    return all
      .filter((v) => !excludeSet.has(String(v.public_id || v.id)))
      .map((v) => {
        const titleLower = (v.title + " " + (v.description || "")).toLowerCase();
        const searchHit = search ? (titleLower.includes(searchLower) ? 1 : 0) : 0;
        const tasteHit  = v.category
          ? (p.categoryMap[v.category] || 0) / Math.max(...Object.values(p.categoryMap), 1)
          : 0;
        const ageMs   = Date.now() - new Date(v.created_at || 0).getTime();
        const recency = Math.max(0, 1 - ageMs / (60 * 86_400_000));
        const score   = searchHit * 0.5 + tasteHit * 0.3 + ((v.views || 0) / 10000) * 0.1 + recency * 0.1;
        return { ...v, _score: score };
      })
      .sort((a, b) => (b._score || 0) - (a._score || 0))
      .slice(0, limit);
  } catch {
    return [];
  }
}

/* ─── PUBLIC: clearProfile ──────────────────────────────────── */

export function clearProfile(): void {
  try { localStorage.removeItem(LS_KEY); } catch { }
}
