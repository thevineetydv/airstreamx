/**
 * ─────────────────────────────────────────────────────────────
 * metadataCache.ts
 * ─────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE DOES (in plain English):
 *
 * Every time you visit the homepage, your app calls the API to get
 * the video list + channel info. That's slow — especially on a
 * return visit, where you already HAD this data 10 seconds ago.
 *
 * This file gives you a "memory" for API responses:
 *   1. First visit  -> fetch from API -> save a copy (in RAM + localStorage)
 *   2. Return visit  -> show the SAVED copy INSTANTLY (no waiting)
 *                       -> then quietly re-fetch in the background
 *                       -> if anything changed, update silently
 *
 * This pattern is called "stale-while-revalidate" (SWR) — you see
 * the old ("stale") data immediately, while fresh data loads behind
 * the scenes. It's what YouTube, Twitter, Instagram all do.
 *
 * WHY localStorage too (not just RAM)?
 *   RAM (a JS variable) is wiped the moment you refresh the page or
 *   close the tab. localStorage survives refreshes, so even your
 *   very first paint after a hard refresh can show cached data.
 *
 * ───────────────────────────────────────────────────────────── */

// How long cached data is considered "fresh enough to trust without
// re-fetching in the background". After this, we still SHOW the
// cached data instantly, but we ALWAYS kick off a background refetch.
const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Prefix so we don't collide with other localStorage keys in your app
const STORAGE_PREFIX = "ax_cache_";

interface CacheEntry<T> {
  data: T;
  savedAt: number; // timestamp (ms) when this was cached
}

// In-memory cache — fastest possible read, but lost on page refresh.
// localStorage backs it up so refreshes aren't a cold start either.
const memoryCache = new Map<string, CacheEntry<any>>();

/* ─────────────────────────────────────────────────────────────
 * Low-level helpers
 * ───────────────────────────────────────────────────────────── */

function readFromStorage<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry<T>;
  } catch {
    // Corrupted JSON, storage disabled, or quota issue — treat as empty
    return null;
  }
}

function writeToStorage<T>(key: string, entry: CacheEntry<T>) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage can throw if full (quota exceeded) or in private
    // browsing mode on some browsers. Safe to ignore — memory cache
    // still works for this session.
  }
}

/**
 * Get whatever cached value exists right now (memory first, then
 * localStorage), regardless of how old it is. Returns null if we've
 * genuinely never cached this key before.
 */
function getCached<T>(key: string): CacheEntry<T> | null {
  const inMemory = memoryCache.get(key);
  if (inMemory) return inMemory;

  const inStorage = readFromStorage<T>(key);
  if (inStorage) {
    // Promote to memory cache so the NEXT read is instant (no JSON.parse)
    memoryCache.set(key, inStorage);
    return inStorage;
  }

  return null;
}

function setCached<T>(key: string, data: T) {
  const entry: CacheEntry<T> = { data, savedAt: Date.now() };
  memoryCache.set(key, entry);
  writeToStorage(key, entry);
}

/* ─────────────────────────────────────────────────────────────
 * Public API
 * ───────────────────────────────────────────────────────────── */

export interface CachedFetchResult<T> {
  /** The data to render right now — cached if we have it, else null */
  data: T | null;
  /** True only on a genuine first-ever load with nothing cached yet */
  isInitialLoading: boolean;
  /** True while a background refresh is happening (cached data is on screen) */
  isRevalidating: boolean;
}

/**
 * cachedFetch — fetch JSON from a URL, but cache the result so the
 * NEXT call to the same URL can return instantly from cache while
 * still refreshing in the background.
 *
 * @param key       Unique cache key (usually just the URL is fine)
 * @param fetcher   An async function that returns the data, e.g.
 *                  () => fetch(url).then(r => r.json())
 * @param options.ttl  How long before we treat cached data as "stale"
 *                      (still shown instantly, just triggers a refetch)
 * @param options.onUpdate  Called with fresh data once the background
 *                           refetch completes (use this to setState)
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: {
    ttl?: number;
    onUpdate?: (data: T) => void;
  } = {}
): Promise<CachedFetchResult<T>> {
  const ttl = options.ttl ?? DEFAULT_TTL_MS;
  const cached = getCached<T>(key);
  const now = Date.now();

  // ── Case 1: Nothing cached yet — this is a true first load ──────────
  if (!cached) {
    const fresh = await fetcher();
    setCached(key, fresh);
    return { data: fresh, isInitialLoading: false, isRevalidating: false };
  }

  // ── Case 2: We have cached data — return it immediately ─────────────
  const age = now - cached.savedAt;
  const isStale = age > ttl;

  if (isStale) {
    // Kick off a background refresh, but DON'T await it — the caller
    // already has the cached data to show right now. When the fresh
    // data arrives, we call onUpdate so the UI can swap it in.
    fetcher()
      .then((fresh) => {
        setCached(key, fresh);
        options.onUpdate?.(fresh);
      })
      .catch(() => {
        // Background refresh failed silently — the user is still
        // looking at valid (if slightly old) cached data, so we
        // don't need to show an error for this.
      });
  }

  return {
    data: cached.data,
    isInitialLoading: false,
    isRevalidating: isStale,
  };
}

/**
 * invalidateCache — call this after an action that makes cached data
 * wrong, e.g. right after the user uploads a new video, so the next
 * homepage visit doesn't show stale results.
 */
export function invalidateCache(key: string) {
  memoryCache.delete(key);
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // ignore
  }
}

/** Clear every cached entry (rarely needed — e.g. on logout) */
export function clearAllCache() {
  memoryCache.clear();
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
