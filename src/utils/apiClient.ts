/**
 * Resilient API client with retry, timeout, and error handling
 * Provides consistent error responses and automatic recovery
 */

import { logger } from "./logger";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  status: number;
}

interface FetchOptions {
  method?: string;
  retries?: number;
  timeout?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  body?: BodyInit;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 3;
const RETRY_DELAY = 1000; // Start at 1s, exponential backoff

/**
 * Resilient fetch with retry, timeout, and error handling
 */
export async function apiCall<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  const {
    method = "GET",
    retries = DEFAULT_RETRIES,
    timeout = DEFAULT_TIMEOUT,
    signal,
    headers = {},
    body,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const mergedSignal = signal || controller.signal;

      const startTime = performance.now();
      const response = await fetch(url, {
        method,
        body,
        signal: mergedSignal,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      });

      clearTimeout(timeoutId);
      const duration = performance.now() - startTime;

      // Log API call
      logger.api(method, url, response.status, duration);

      // Handle non-OK responses
      if (!response.ok) {
        const text = await response.text();
        const isRetryable = response.status >= 500;

        if (isRetryable && attempt < retries - 1) {
          logger.warn(
            "API",
            `Server error (${response.status}), retrying (${attempt + 1}/${retries})`,
            text
          );
          // Exponential backoff: 1s, 2s, 4s
          await sleep(RETRY_DELAY * Math.pow(2, attempt));
          continue;
        }

        lastError = new Error(`HTTP ${response.status}: ${text}`);
        logger.apiError(method, url, lastError.message);

        return {
          success: false,
          error: lastError.message,
          status: response.status,
        };
      }

      // Parse JSON
      const data = (await response.json()) as T;

      return {
        success: true,
        data,
        status: 200,
      };

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastError = error;

      const isAbort = error.name === "AbortError";
      const isRetryable = !isAbort; // Don't retry aborts

      if (isRetryable && attempt < retries - 1) {
        const message = isAbort ? "Timeout" : error.message;
        logger.warn(
          "API",
          `${message}, retrying (${attempt + 1}/${retries})`,
          error.message
        );
        // Exponential backoff
        await sleep(RETRY_DELAY * Math.pow(2, attempt));
        continue;
      }

      const finalMessage = isAbort
        ? "Request timed out (30s)"
        : error.message;

      logger.error("API", `Request failed: ${url}`, error);

      return {
        success: false,
        error: finalMessage,
        status: 0,
      };
    }
  }

  // Exhausted all retries
  return {
    success: false,
    error: lastError?.message || "Unknown error",
    status: 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}