/**
 * ─────────────────────────────────────────────────────────────
 * useCachedData.ts
 * ─────────────────────────────────────────────────────────────
 *
 * A React hook wrapper around metadataCache.ts.
 *
 * WHAT YOU GET:
 *   const { data, loading, refresh } = useCachedData(key, fetcher);
 *
 *   - data:    starts as cached value (instant) or null on true first load
 *   - loading: true ONLY on a genuine first-ever load (no cache exists yet)
 *   - refresh: call this manually to force a fresh fetch + cache update
 *              (e.g. after the user uploads a new video)
 *
 * HOW IT BEHAVES ON RETURN VISITS:
 *   1. Component mounts → cached data is shown INSTANTLY (loading=false)
 *   2. If that cached data is older than `ttl`, a background refetch
 *      starts automatically. When it resolves, `data` updates — the
 *      user sees fresh content swap in smoothly, no spinner needed.
 * ───────────────────────────────────────────────────────────── */

import { useState, useEffect, useCallback, useRef } from "react";
import { cachedFetch, invalidateCache } from "./metadataCache";

interface UseCachedDataOptions {
  ttl?: number;
  /** Skip fetching entirely (e.g. while a dependency isn't ready yet) */
  enabled?: boolean;
}

interface UseCachedDataResult<T> {
  data: T | null;
  /** True only when there is NO cached data at all yet (true cold start) */
  loading: boolean;
  /** True while a background revalidation is happening behind cached data */
  revalidating: boolean;
  /** Force a fresh fetch, bypassing cache, and update the cache + state */
  refresh: () => Promise<void>;
  error: Error | null;
}

export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: UseCachedDataOptions = {}
): UseCachedDataResult<T> {
  const { ttl, enabled = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Keep the latest fetcher in a ref so the effect below doesn't need
  // `fetcher` in its dependency array (avoids re-fetch loops caused by
  // inline arrow functions being a "new" function on every render).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setError(null);

    cachedFetch<T>(key, () => fetcherRef.current(), {
      ttl,
      onUpdate: (fresh) => {
        if (!cancelled) {
          setData(fresh);
          setRevalidating(false);
        }
      },
    })
      .then((result) => {
        if (cancelled) return;
        setData(result.data);
        setLoading(result.isInitialLoading && result.data === null);
        setRevalidating(result.isRevalidating);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, ttl]);

  const refresh = useCallback(async () => {
    invalidateCache(key);
    setRevalidating(true);
    try {
      const fresh = await fetcherRef.current();
      setData(fresh);
      // cachedFetch's internal setCached only runs inside cachedFetch,
      // so we re-run it here through cachedFetch to keep the cache in sync.
      await cachedFetch<T>(key, () => Promise.resolve(fresh), { ttl });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setRevalidating(false);
    }
  }, [key, ttl]);

  return { data, loading, revalidating, refresh, error };
}
