// utils/abr.ts
//
// Start videos at a sensible quality instead of always at the lowest one.
//
// Before: every video (and every Short) started at the lowest rendition
// (startLevel: 0) with a fixed ~0.9 Mbps guess, so short clips ended before
// adaptive bitrate had time to switch up — Shorts looked blurry even on
// fast Wi-Fi. Now the measured bandwidth from the previous video is
// remembered and the first video uses the browser's network hint.

import type Hls from "hls.js/light";

const KEY = "ax_bw_estimate";
const MAX_AGE_MS = 30 * 60 * 1000; // a measurement older than 30 min is stale (network may have changed)

export function isDataSaver(): boolean {
  try {
    if (localStorage.getItem("data_saver_mode") === "1") return true;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return !!conn?.saveData;
  } catch {
    return false;
  }
}

/** Last measured bandwidth (bits/s), if recent. */
export function getStoredBandwidth(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { bps, at } = JSON.parse(raw) as { bps: number; at: number };
    if (!bps || Date.now() - at > MAX_AGE_MS) return null;
    return bps;
  } catch {
    return null;
  }
}

/** Save the player's measured bandwidth so the next video starts at a matching quality. */
export function rememberBandwidth(hls: Hls | null | undefined) {
  try {
    const bps = hls?.bandwidthEstimate;
    if (bps && Number.isFinite(bps) && bps > 50_000) {
      localStorage.setItem(KEY, JSON.stringify({ bps: Math.round(bps), at: Date.now() }));
    }
  } catch {
    // storage unavailable — fine
  }
}

/** Network hint from the browser (Chrome/Android): downlink in Mbps, capped at 10. */
function connectionHint(): number | null {
  const conn = (navigator as Navigator & { connection?: { downlink?: number; effectiveType?: string } }).connection;
  if (!conn) return null;
  if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") return 250_000;
  if (conn.effectiveType === "3g") return 700_000;
  if (typeof conn.downlink === "number" && conn.downlink > 0) return conn.downlink * 1_000_000 * 0.8;
  return null;
}

/** hls.js start settings: { startLevel, abrEwmaDefaultEstimate } */
export function abrStartConfig(): { startLevel: number; abrEwmaDefaultEstimate: number } {
  if (isDataSaver()) return { startLevel: 0, abrEwmaDefaultEstimate: 400_000 };
  const known = getStoredBandwidth() ?? connectionHint();
  // -1 = let hls.js pick the start level from the estimate
  if (known) return { startLevel: -1, abrEwmaDefaultEstimate: known };
  return { startLevel: 0, abrEwmaDefaultEstimate: 900_000 };
}
