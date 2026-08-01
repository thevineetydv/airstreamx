/**
 * clearStaleChannelCache.ts
 *
 * Run this ONCE on app startup (e.g., inside main.tsx or App.tsx useEffect).
 * It purges all localStorage keys that were written by the old
 * localStorage-based channel architecture so they can never override
 * the PostgreSQL data.
 *
 * Safe to call multiple times — it's idempotent.
 *
 * Usage (App.tsx or main.tsx):
 *   import { clearStaleChannelCache } from "./utils/clearStaleChannelCache";
 *   clearStaleChannelCache();
 */
export function clearStaleChannelCache(): void {
  try {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (
        key.startsWith("channel_customization_") ||
        key.startsWith("channel_avatar_") ||
        key.startsWith("channel_banner_") ||
        key.startsWith("channel_watermark_") ||
        key.startsWith("channel_handle_") ||
        key.startsWith("channelProfile_") ||
        key.startsWith("userProfile_") ||
        key.startsWith("channelSettings_")
      ) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(k => localStorage.removeItem(k));
    if (keysToDelete.length > 0) {
      console.info(`[clearStaleChannelCache] Removed ${keysToDelete.length} stale localStorage key(s):`, keysToDelete);
    }
  } catch {
    // localStorage may not be available (SSR / privacy mode)
  }
}
