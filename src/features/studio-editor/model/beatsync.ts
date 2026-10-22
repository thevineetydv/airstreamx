// "Beat sync": line the edit up with the music.
//   - every cut between clips lands on a beat
//   - the video ends on a beat (on a bar start if one is close)
//   - text / stickers / banners appear on a beat
// Pure function: same input → same result, one undo step in the reducer.

import { clipDuration } from "./timeline";
import { MIN_CLIP_DURATION, type Clip, type MediaAsset } from "./types";
import type { Overlay } from "./overlays";

export interface Beat {
  t: number;
  bar: boolean;
}

/** Longest a clip may be shortened or lengthened for one cut (seconds). */
const MAX_SHIFT = 0.6;
/** Overlays move to a beat only if one is this close. */
const OVERLAY_SNAP = 0.35;

export function syncToBeats(
  clips: Clip[],
  overlays: Overlay[],
  assets: Record<string, MediaAsset>,
  beats: Beat[],
): { clips: Clip[]; overlays: Overlay[] } {
  if (beats.length < 2 || !clips.length) return { clips, overlays };
  const oldTotal = clips.reduce((s, c) => s + clipDuration(c), 0);

  // Change a clip's timeline length by `delta` seconds (moves its out point).
  const resize = (c: Clip, delta: number): Clip | null => {
    const out = c.outPoint + delta * c.speed;
    const max = assets[c.assetId]?.duration ?? c.outPoint;
    if (out > max + 1e-6 || out - c.inPoint < MIN_CLIP_DURATION) return null;
    return { ...c, outPoint: out };
  };

  const next: Clip[] = [];
  let t = 0;
  clips.forEach((c, i) => {
    const end = t + clipDuration(c);
    const last = i === clips.length - 1;
    let target: number | null = null;
    if (!last) {
      // Nearest beat; prefer one that shortens (no extra footage needed).
      const near = beats.filter((b) => Math.abs(b.t - end) <= MAX_SHIFT && b.t - t >= MIN_CLIP_DURATION);
      near.sort((a, b) => Math.abs(a.t - end) - Math.abs(b.t - end));
      target = near.find((b) => resize(c, b.t - end))?.t ?? null;
    } else {
      // Ending: a bar start if one is less than a beat away, else the last
      // beat. Never cuts more than one beat (~0.5 s) off the video.
      const before = beats.filter((b) => b.t <= end + 1e-6 && b.t - t >= MIN_CLIP_DURATION && b.t > 0);
      const beatLen = beats[1].t - beats[0].t;
      const bar = [...before].reverse().find((b) => b.bar && end - b.t <= Math.min(MAX_SHIFT, beatLen) + 1e-6);
      const beat = before[before.length - 1];
      const pick = bar ?? (beat && end - beat.t <= MAX_SHIFT ? beat : undefined);
      target = pick && resize(c, pick.t - end) ? pick.t : null;
    }
    const resized = target !== null ? resize(c, target - end) : null;
    const clip = resized ?? c;
    next.push(clip);
    t += clipDuration(clip);
  });
  const total = t;

  // Overlays: start on the nearest beat (keep their length), stay inside the video.
  const snapped = overlays.map((o) => {
    const len = o.end - o.start;
    const toEnd = Math.abs(o.end - oldTotal) < 0.05; // ran to the end before → still does
    let start = o.start;
    if (start > 0.05) {
      const b = beats.reduce((best, x) => (Math.abs(x.t - start) < Math.abs(best.t - start) ? x : best), beats[0]);
      if (Math.abs(b.t - start) <= OVERLAY_SNAP) start = b.t;
    }
    start = Math.min(start, Math.max(0, total - 0.6));
    const end = toEnd ? total : Math.min(total, start + len);
    const e = Math.min(total, Math.max(end, start + 0.3));
    return start === o.start && e === o.end ? o : { ...o, start, end: e };
  });

  return { clips: next, overlays: snapped };
}
