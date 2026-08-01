/**
 * Hook that safely fetches data with race condition prevention
 * Handles AbortController, request cancellation, and caching
 */

import { useEffect, useRef, useState } from "react";
import { apiCall } from "../utils/apiClient";
import { logger } from "../utils/logger";

interface UseFetchOptions {
  skip?: boolean;
  cache?: boolean;
  dependencies?: any[];
}

/**
 * Hook that safely fetches data with race condition prevention
 */
export function useFetchData<T>(
  url: string | null,
  options: UseFetchOptions = {}
): {
  data: T | null;
  loading: boolean;
  error: string | null;
} {
  const { skip = false, cache = true } = options;

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track active request to avoid stale updates
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, T>>(new Map());

  useEffect(() => {
    if (!url || skip) {
      return;
    }

    // Check cache first
    if (cache && cacheRef.current.has(url)) {
      logger.debug("useFetchData", "Using cached data", { url });
      setData(cacheRef.current.get(url)!);
      setError(null);
      setLoading(false);
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    const currentRequestId = ++requestIdRef.current;

    setLoading(true);
    setError(null);

    (async () => {
      const result = await apiCall<T>(url, {
        signal: abortControllerRef.current?.signal,
      });

      // Ignore if newer request came in
      if (requestIdRef.current !== currentRequestId) {
        logger.debug("useFetchData", "Ignoring stale request", { url });
        return;
      }

      if (result.success && result.data) {
        // Cache the result
        if (cache) {
          cacheRef.current.set(url, result.data);
        }
        setData(result.data);
        setError(null);
      } else {
        setError(result.error || "Failed to load data");
        setData(null);
      }

      setLoading(false);
    })();

    // Cleanup on unmount or URL change
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [url, skip, cache]);

  return { data, loading, error };
}
