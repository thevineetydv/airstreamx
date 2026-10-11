/**
 * hlsWarmup — make the NEXT video start instantly.
 *
 * Downloads only what a player needs for its very first frame (master
 * playlist, the lowest-quality playlist, and its first 1–2 segments)
 * into the browser's HTTP cache, which also warms the Cloudflare edge.
 * When the real player then asks for the same URLs they come from cache.
 *
 * Why plain fetch() instead of a hidden <video> + hls.js instance:
 * hls.js treats `maxBufferLength` as a MINIMUM — with its default
 * maxBufferSize (60 MB) / maxMaxBufferLength (600 s) a hidden preloader
 * kept buffering for minutes and downloaded almost the whole next video
 * (~25 MB), stealing bandwidth from the video actually playing. This
 * helper has a hard, small upper bound and can never "keep going".
 */

const warmed = new Set<string>();          // master URLs already warmed
let inFlight: AbortController | null = null; // only one warm-up at a time

function absolute(url: string, base: string): string {
  try { return new URL(url, base).toString(); } catch { return url; }
}

function isDataSaver(): boolean {
  try {
    if (localStorage.getItem("data_saver_mode") === "1") return true;
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return !!conn?.saveData;
  } catch {
    return false;
  }
}

/** Pick the lowest-bandwidth variant — the one the players start on (startLevel: 0). */
function lowestVariant(master: string, masterUrl: string): string | null {
  const lines = master.split(/\r?\n/);
  let best: { bw: number; uri: string } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("#EXT-X-STREAM-INF")) continue;
    const bw = Number(/BANDWIDTH=(\d+)/.exec(line)?.[1] ?? Infinity);
    const uri = lines.slice(i + 1).find(l => l.trim() && !l.startsWith("#"))?.trim();
    if (uri && (!best || bw < best.bw)) best = { bw, uri };
  }
  return best ? absolute(best.uri, masterUrl) : null;
}

function firstSegments(playlist: string, playlistUrl: string, count: number): string[] {
  const out: string[] = [];
  const init = /#EXT-X-MAP:URI="([^"]+)"/.exec(playlist)?.[1];
  if (init) out.push(absolute(init, playlistUrl)); // fMP4 init segment, if any
  for (const raw of playlist.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l || l.startsWith("#")) continue;
    out.push(absolute(l, playlistUrl));
    if (out.length >= count + (init ? 1 : 0)) break;
  }
  return out;
}

/**
 * Warm the cache for one video. Safe to call many times (deduplicated);
 * a new call cancels a previous unfinished one.
 */
export async function warmHls(masterUrl: string | undefined | null, opts: { segments?: number } = {}) {
  if (!masterUrl || !masterUrl.includes(".m3u8")) return;
  if (warmed.has(masterUrl) || isDataSaver()) return;

  inFlight?.abort();
  const ctrl = new AbortController();
  inFlight = ctrl;
  const signal = ctrl.signal;

  try {
    const masterText = await (await fetch(masterUrl, { signal })).text();

    // A media playlist (no variants) can be used directly
    const playlistUrl = masterText.includes("#EXT-X-STREAM-INF")
      ? lowestVariant(masterText, masterUrl)
      : masterUrl;
    if (!playlistUrl) return;

    const playlistText = playlistUrl === masterUrl
      ? masterText
      : await (await fetch(playlistUrl, { signal })).text();

    for (const seg of firstSegments(playlistText, playlistUrl, opts.segments ?? 1)) {
      // Read the body fully so the response is actually stored in cache
      await (await fetch(seg, { signal })).arrayBuffer();
    }
    warmed.add(masterUrl);
  } catch {
    // Aborted or network error — the real player will just load normally
  } finally {
    if (inFlight === ctrl) inFlight = null;
  }
}
