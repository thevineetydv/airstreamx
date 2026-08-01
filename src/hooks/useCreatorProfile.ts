/**
 * useCreatorProfile.ts  —  v2 (PostgreSQL only, no localStorage)
 *
 * Fetches channel customization from the DB for a given email.
 * Used by WatchPage (channel info row) and ChannelPage.
 *
 * BUG FIXED: old version returned { displayName: "Creator", avatarUrl: "" }
 * as the default — "Creator" was hardcoded as the fallback display name and
 * never overwritten because the hook either:
 *   (a) read from localStorage which was empty after the migration, OR
 *   (b) fetched a non-existent endpoint that 404'd silently
 *
 * This version fetches GET /api/channel-customization/:email (real endpoint)
 * and falls back to a formatted version of the email local part — never "Creator".
 */

import { useState, useEffect, useRef } from "react"; // useRef already imported — no change needed
import { API_URL } from "../utils/constants";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreatorProfile {
  displayName: string;    // channel_name from DB, or formatted email
  handle:      string;    // @handle from DB, or email local part
  email:       string;    // original email (for identification)
  avatarUrl:   string;    // Cloudinary avatar URL, or ""
  bannerUrl:   string;    // Cloudinary banner URL, or ""
  watermarkUrl: string;   // Cloudinary watermark URL, or ""
  description: string;
  links:       { id: string; label: string; url: string }[];
  subscriberCount: number; // placeholder — fetched separately if needed
  avatarGradient: string;  // deterministic gradient from email
  channelPath: string;     // /channel/{email} for routing
  loading:     boolean;
  error:       boolean;
}

const DEFAULT_PROFILE: CreatorProfile = {
  displayName:  "",
  handle:       "",
  email:        "",
  avatarUrl:    "",
  bannerUrl:    "",
  watermarkUrl: "",
  description:  "",
  links:        [],
  subscriberCount: 0,
  avatarGradient: "from-gray-500 to-gray-700",
  channelPath:  "",
  loading:      true,
  error:        false,
};

// ── In-memory cache (survives re-renders, not page refreshes — intentional) ──
// Key: email, Value: fetched CreatorProfile
const profileCache = new Map<string, CreatorProfile>();

// ── Helper ───────────────────────────────────────────────────────────────────

export function formatDisplayName(email: string): string {
  if (!email) return "";
  // "vineetsitm09@gmail.com" → "Vineetsitm"  (only alpha parts, capitalised)
  const local = email.split("@")[0];
  const parts = local
    .split(/[._\-0-9]+/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
  return parts.join(" ") || local;
}

export function getAvatarGradient(email: string): string {
  // Deterministic gradient from email hash
  const hash = Array.from(email).reduce((a, c) => a + c.charCodeAt(0), 0);
  const gradients = [
    "from-red-500 to-red-700",
    "from-red-600 to-red-700",
    "from-blue-500 to-cyan-500",
    "from-green-500 to-teal-600",
    "from-orange-500 to-red-500",
    "from-red-500 to-red-700",
  ];
  return gradients[hash % gradients.length];
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCreatorProfile(email: string | null | undefined): CreatorProfile {
  const [profile, setProfile] = useState<CreatorProfile>(() => {
    // Serve from cache immediately if available (prevents "Creator" flash)
    if (email && profileCache.has(email)) {
      return { ...profileCache.get(email)!, loading: false };
    }
    return { ...DEFAULT_PROFILE };
  });

  // Track previous email so we can detect a channel change
  const prevEmailRef = useRef<string | null | undefined>(email);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!email) {
      setProfile({ ...DEFAULT_PROFILE, loading: false });
      prevEmailRef.current = email;
      return;
    }

    // ── BUG FIX: Wrong avatar on channel change ─────────────────────────────
    // When email changes (navigating A → B) we MUST wipe the current profile
    // immediately — before the fetch resolves — otherwise the previous channel's
    // avatarUrl/displayName bleeds into the next channel's render cycle.
    // Cached hits are instant so the reset is invisible; uncached hits show a
    // brief loading state which is correct behaviour.
    if (prevEmailRef.current !== email) {
      prevEmailRef.current = email;
      setProfile({ ...DEFAULT_PROFILE, loading: true, email });
    }

    // Already cached — no fetch needed
    if (profileCache.has(email)) {
      setProfile({ ...profileCache.get(email)!, loading: false });
      return;
    }

    // Cancel any previous in-flight request
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setProfile(prev => ({ ...prev, loading: true, error: false }));

    (async () => {
      try {
        const res = await fetch(
          `${API_URL}/api/channel-customization/${encodeURIComponent(email)}`,
          { signal: abortRef.current!.signal }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const c = json.customization;
        let subscriberCount = 0;
try {
  const countRes = await fetch(
    `${API_URL}/api/channels/by-email/${encodeURIComponent(email)}`
  );
  if (countRes.ok) {
    const countData = await countRes.json();
    subscriberCount =
      countData?.channel?.subscriber_count ??
      countData?.subscriber_count ??
      0;
  }
} catch {
  // silent — stays 0
}


        // c is null when the channel has never been customized
        const built: CreatorProfile = {
          // Priority: DB channel_name → formatted email   (NEVER "Creator")
          displayName:  c?.channelName?.trim() || formatDisplayName(email),
          handle:       c?.handle?.trim()      || email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, ""),
          email:        email,
          avatarUrl:    c?.avatarDataUrl        || "",
          bannerUrl:    c?.bannerDataUrl        || "",
          watermarkUrl: c?.watermarkDataUrl     || "",
          description:  c?.description         || "",
          links:        c?.links               || [],
          subscriberCount: subscriberCount,
          avatarGradient: getAvatarGradient(email),
          channelPath:  `/channel/${encodeURIComponent(email)}`,
          loading:      false,
          error:        false,
        };

        profileCache.set(email, built);
        setProfile(built);

      } catch (err: any) {
        if (err.name === "AbortError") return;  // component unmounted — ignore

        console.warn("[useCreatorProfile] fetch failed for", email, err.message);

        // Fallback: format the email — still never "Creator"
        const fallback: CreatorProfile = {
          displayName:  formatDisplayName(email),
          handle:       email.split("@")[0].toLowerCase().replace(/[^a-z0-9_.]/g, ""),
          email:        email,
          avatarUrl:    "",
          bannerUrl:    "",
          watermarkUrl: "",
          description:  "",
          links:        [],
          subscriberCount: 0,
          avatarGradient: getAvatarGradient(email),
          channelPath:  `/channel/${encodeURIComponent(email)}`,
          loading:      false,
          error:        true,
        };
        setProfile(fallback);
      }
    })();

    return () => { abortRef.current?.abort(); };
  }, [email]);

  return profile;
}

/**
 * invalidateCreatorCache(email)
 * Call after saving channel customization so the next render
 * re-fetches from the DB instead of serving stale cache.
 */
export function invalidateCreatorCache(email?: string | null): void {
  if (email) profileCache.delete(email);
  else profileCache.clear();
}