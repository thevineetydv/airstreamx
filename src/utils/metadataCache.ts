/**
 * ─────────────────────────────────────────────────────────────
 * metadataCache.ts — stale-while-revalidate cache for API data
 * ─────────────────────────────────────────────────────────────
 *
 *   1. First visit  -> fetch from API -> save a copy (RAM + localStorage)
 *   2. Return visit -> show the saved copy INSTANTLY, then re-fetch in the
 *                      background if it is older than `ttl`, and swap in
 *                      the fresh data when it arrives.
 *
 * Rules that keep it safe:
 *   • Bounded: at most MAX_ENTRIES entries; the oldest are pruned. The old
 *     version never deleted anything, so every opened video (and its 40
 *     suggestions) piled up in localStorage until the ~5 MB quota was full —
 *     after which other saves (drafts, settings) silently failed too.
 *   • Hard max age: data older than `maxAge` (default 24 h) is never shown;
 *     it is fetched fresh like a first visit.
 *   • Background errors are reported via `onError` (e.g. a video that was
 *     deleted or made private), instead of being swallowed while the stale
 *     copy stayed on screen.
 *   • Concurrent requests for the same key share one network request.
 *   • `persist: false` keeps sensitive data in memory only (never written
 *     to localStorage), and clearAllCache() is called on logout.
 * ───────────────────────────────────────────────────────────── */

const DEFAULT_TTL_MS = 5 * 60 * 1000;           // refresh in background after 5 min
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // never show data older than 24 h
const MAX_ENTRIES = 60;                         // per browser, across all keys

// Prefix so we don't collide with other localStorage keys in the app
const STORAGE_PREFIX = "ax_cache_";

interface CacheEntry<T> {
  data: T;
  savedAt: number; // timestamp (ms) when this was cached
}

// In-memory copy — fastest read; localStorage backs it up across reloads.
const memoryCache = new Map<string, CacheEntry<unknown>>();
// Requests currently in flight, so two callers share one fetch
const inFlight = new Map<string, Promise<unknown>>();
// Bumped by clearAllCache(): a request that started before logout must not
// write the previous user's data back into the cache when it finishes.
let generation = 0;

/* ─────────────────────────────────────────────────────────────
 * Storage helpers
 * ───────────────────────────────────────────────────────────── */

function storageKeys(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith(STORAGE_PREFIX));
  } catch {
    return [];
  }
}

function readFromStorage<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    return parsed && typeof parsed.savedAt === "number" ? parsed : null;
  } catch {
    return null; // corrupted JSON or storage disabled — treat as empty
  }
}

/** Remove expired entries and keep only the newest `keep` entries. */
function prune(keep = MAX_ENTRIES, maxAge = DEFAULT_MAX_AGE_MS) {
  const now = Date.now();
  const entries: { key: string; savedAt: number }[] = [];
  for (const k of storageKeys()) {
    let savedAt = 0;
    try { savedAt = JSON.parse(localStorage.getItem(k) || "null")?.savedAt ?? 0; } catch { /* corrupt */ }
    if (!savedAt || now - savedAt > maxAge) {
      try { localStorage.removeItem(k); } catch { /* ignore */ }
    } else {
      entries.push({ key: k, savedAt });
    }
  }
  entries.sort((a, b) => b.savedAt - a.savedAt);
  for (const e of entries.slice(keep)) {
    try { localStorage.removeItem(e.key); } catch { /* ignore */ }
  }
  // Keep the memory copy bounded the same way
  if (memoryCache.size > keep) {
    const oldest = [...memoryCache.entries()].sort((a, b) => a[1].savedAt - b[1].savedAt);
    for (const [k] of oldest.slice(0, memoryCache.size - keep)) memoryCache.delete(k);
  }
}

let writesSincePrune = 0;

function writeToStorage<T>(key: string, entry: CacheEntry<T>) {
  const value = JSON.stringify(entry);
  try {
    localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {
    // Quota exceeded: free space (keep half) and try once more
    prune(Math.floor(MAX_ENTRIES / 2));
    try { localStorage.setItem(STORAGE_PREFIX + key, value); } catch { /* memory cache still works */ }
  }
  // Prune occasionally rather than on every write (it scans localStorage)
  if (++writesSincePrune >= 10) {
    writesSincePrune = 0;
    prune();
  }
}

function getCached<T>(key: string, maxAge: number): CacheEntry<T> | null {
  const entry = (memoryCache.get(key) as CacheEntry<T> | undefined) ?? readFromStorage<T>(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > maxAge) {
    invalidateCache(key); // too old to show — behave like a first visit
    return null;
  }
  memoryCache.set(key, entry);
  return entry;
}

function setCached<T>(key: string, data: T, persist: boolean) {
  const entry: CacheEntry<T> = { data, savedAt: Date.now() };
  memoryCache.delete(key); // re-insert so Map order = newest last
  memoryCache.set(key, entry);
  if (memoryCache.size > MAX_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (oldestKey !== undefined) memoryCache.delete(oldestKey);
  }
  if (persist) writeToStorage(key, entry);
  else { try { localStorage.removeItem(STORAGE_PREFIX + key); } catch { /* ignore */ } }
}

/** Run the fetcher once per key at a time and store the result. */
function fetchAndStore<T>(
  key: string,
  fetcher: () => Promise<T>,
  persist: boolean | ((data: T) => boolean)
): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const startedIn = generation;
  const p = fetcher()
    .then((fresh) => {
      if (startedIn !== generation) return fresh; // user logged out meanwhile
      const keep = typeof persist === "function" ? persist(fresh) : persist;
      setCached(key, fresh, keep);
      return fresh;
    })
    .finally(() => { if (inFlight.get(key) === p) inFlight.delete(key); });
  inFlight.set(key, p);
  return p;
}

/* ─────────────────────────────────────────────────────────────
 * Public API
 * ───────────────────────────────────────────────────────────── */

export interface CachedFetchResult<T> {
  /** The data to render right now — cached if we have it, else fresh */
  data: T | null;
  /** True only on a genuine first-ever load with nothing cached yet */
  isInitialLoading: boolean;
  /** True while a background refresh is happening (cached data is on screen) */
  isRevalidating: boolean;
}

export interface CachedFetchOptions<T> {
  /** After this age the cached copy is still shown, but refreshed in the background */
  ttl?: number;
  /** Older than this, the cached copy is ignored completely (default 24 h) */
  maxAge?: number;
  /** Called with fresh data once a background refresh completes */
  onUpdate?: (data: T) => void;
  /** Called if a background refresh fails (e.g. the item no longer exists) */
  onError?: (error: unknown) => void;
  /** false (or a function returning false) = keep in memory only, never in localStorage */
  persist?: boolean | ((data: T) => boolean);
}

/**
 * cachedFetch — return cached data instantly when available, refreshing it
 * in the background once it is older than `ttl`.
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CachedFetchOptions<T> = {}
): Promise<CachedFetchResult<T>> {
  const ttl = options.ttl ?? DEFAULT_TTL_MS;
  const maxAge = options.maxAge ?? DEFAULT_MAX_AGE_MS;
  const persist = options.persist ?? true;
  const cached = getCached<T>(key, maxAge);

  // ── Nothing usable cached — a true first load ──
  if (!cached) {
    const fresh = await fetchAndStore(key, fetcher, persist);
    return { data: fresh, isInitialLoading: false, isRevalidating: false };
  }

  // ── Cached copy available — return it now, refresh if stale ──
  const isStale = Date.now() - cached.savedAt > ttl;
  if (isStale) {
    fetchAndStore(key, fetcher, persist)
      .then((fresh) => options.onUpdate?.(fresh))
      .catch((err) => {
        // Don't keep serving something the server says is gone/forbidden
        // (4xx). A network error keeps the cached copy for offline use.
        const status = (err as { status?: number })?.status;
        if (typeof status === "number" && status >= 400 && status < 500) invalidateCache(key);
        options.onError?.(err);
      });
  }

  return { data: cached.data, isInitialLoading: false, isRevalidating: isStale };
}

/** Store fresh data directly (e.g. after a manual refresh). */
export function setCache<T>(key: string, data: T, persist = true) {
  setCached(key, data, persist);
}

/** Remove one cached entry (e.g. after an upload or edit made it wrong). */
export function invalidateCache(key: string) {
  memoryCache.delete(key);
  try {
    localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // ignore
  }
}

/** Remove every cached entry — call on logout so the next person using
 *  this browser never sees the previous user's data. */
export function clearAllCache() {
  generation++;
  memoryCache.clear();
  inFlight.clear();
  for (const k of storageKeys()) {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  }
}

// Clean up leftovers from older app versions once per page load
try { prune(); } catch { /* ignore */ }
