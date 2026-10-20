// Pure timeline helpers. No React, no DOM — easy to test and reuse
// later for undo/redo (each operation returns a new array).

import { MIN_CLIP_DURATION, type Clip, type MediaAsset } from "./types";

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export function clipDuration(clip: Clip): number {
  return clip.outPoint - clip.inPoint;
}

export function totalDuration(clips: Clip[]): number {
  return clips.reduce((sum, c) => sum + clipDuration(c), 0);
}

/** Timeline start time of each clip (same order as `clips`). */
export function clipStarts(clips: Clip[]): number[] {
  const starts: number[] = [];
  let t = 0;
  for (const c of clips) {
    starts.push(t);
    t += clipDuration(c);
  }
  return starts;
}

export interface Located {
  index: number;
  clip: Clip;
  /** Timeline time where this clip starts. */
  clipStart: number;
  /** Matching time inside the source asset. */
  sourceTime: number;
}

/**
 * Find which clip is under timeline time `t`.
 * A time exactly on a boundary belongs to the next clip.
 * Times past the end resolve to the very end of the last clip.
 */
export function locate(clips: Clip[], t: number): Located | null {
  if (clips.length === 0) return null;
  let start = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const d = clipDuration(c);
    if (t < start + d || i === clips.length - 1) {
      const offset = Math.min(Math.max(t - start, 0), d);
      return { index: i, clip: c, clipStart: start, sourceTime: c.inPoint + offset };
    }
    start += d;
  }
  return null;
}

export function clipFromAsset(asset: MediaAsset): Clip {
  return { id: newId("clip"), assetId: asset.id, inPoint: 0, outPoint: asset.duration };
}

/**
 * Split the clip under timeline time `t` into two.
 * Returns the same array if the cut would make a piece too short.
 */
export function splitAt(clips: Clip[], t: number): { clips: Clip[]; rightId: string | null } {
  const hit = locate(clips, t);
  if (!hit) return { clips, rightId: null };
  const { clip, index, sourceTime } = hit;
  if (sourceTime - clip.inPoint < MIN_CLIP_DURATION || clip.outPoint - sourceTime < MIN_CLIP_DURATION) {
    return { clips, rightId: null };
  }
  const left: Clip = { ...clip, outPoint: sourceTime };
  const right: Clip = { ...clip, id: newId("clip"), inPoint: sourceTime };
  const next = clips.slice();
  next.splice(index, 1, left, right);
  return { clips: next, rightId: right.id };
}

export function removeClip(clips: Clip[], id: string): Clip[] {
  return clips.filter((c) => c.id !== id);
}

/** Move a clip one step left (-1) or right (+1). */
export function moveClip(clips: Clip[], id: string, dir: -1 | 1): Clip[] {
  const i = clips.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= clips.length) return clips;
  const next = clips.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/**
 * Set new in/out points for a clip, clamped to the asset length
 * and to the minimum clip duration.
 */
export function trimClip(
  clips: Clip[],
  id: string,
  edge: "in" | "out",
  value: number,
  assetDuration: number,
): Clip[] {
  return clips.map((c) => {
    if (c.id !== id) return c;
    if (edge === "in") {
      const inPoint = Math.min(Math.max(value, 0), c.outPoint - MIN_CLIP_DURATION);
      return { ...c, inPoint };
    }
    const outPoint = Math.max(Math.min(value, assetDuration), c.inPoint + MIN_CLIP_DURATION);
    return { ...c, outPoint };
  });
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const tenth = Math.floor((s * 10) % 10);
  return `${m}:${sec.toString().padStart(2, "0")}.${tenth}`;
}
