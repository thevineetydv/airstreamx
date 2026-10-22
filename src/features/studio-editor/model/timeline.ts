// Pure timeline helpers. No React, no DOM — easy to test and reuse
// later for undo/redo (each operation returns a new array).

import { MIN_CLIP_DURATION, type Clip, type MediaAsset } from "./types";
import { DEFAULT_LOOK, MIN_TRANSITION, type TransitionType } from "./look";

let idCounter = 0;
export function newId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

/** Length of the clip ON THE TIMELINE (speed applied). */
export function clipDuration(clip: Clip): number {
  return (clip.outPoint - clip.inPoint) / clip.speed;
}

/** Source time inside the asset for an offset (timeline seconds) from the clip start. */
export function sourceAt(clip: Clip, offset: number): number {
  return clip.inPoint + offset * clip.speed;
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
      return { index: i, clip: c, clipStart: start, sourceTime: sourceAt(c, offset) };
    }
    start += d;
  }
  return null;
}

export function clipFromAsset(asset: MediaAsset): Clip {
  return {
    id: newId("clip"),
    assetId: asset.id,
    inPoint: 0,
    outPoint: asset.duration,
    speed: 1,
    look: DEFAULT_LOOK,
    // Blurred copy of the video fills the empty bars (landscape video on a
    // 9:16 canvas). Same-shape video fills the frame, so nothing changes there.
    fit: "blur",
    panX: 0.5,
    panY: 0.5,
    transitionOut: null,
  };
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
  // The left half keeps no transition (it now ends at a plain cut); the right half keeps the old one.
  const left: Clip = { ...clip, outPoint: sourceTime, transitionOut: null };
  const right: Clip = { ...clip, id: newId("clip"), inPoint: sourceTime };
  const next = clips.slice();
  next.splice(index, 1, left, right);
  return { clips: next, rightId: right.id };
}

export function removeClip(clips: Clip[], id: string): Clip[] {
  return clips.filter((c) => c.id !== id);
}

/** Move a clip one step left (-1) or right (+1). */
/** Move a clip to a new position (drag to reorder). */
export function moveClipTo(clips: Clip[], id: string, to: number): Clip[] {
  const from = clips.findIndex((c) => c.id === id);
  if (from < 0) return clips;
  const target = Math.max(0, Math.min(clips.length - 1, to));
  if (target === from) return clips;
  const next = clips.slice();
  const [c] = next.splice(from, 1);
  next.splice(target, 0, c);
  return next;
}

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

/**
 * Effective transition length after clip i (0 if none). Never longer than
 * either neighbouring clip, so two transitions on one clip can't overlap.
 */
export function transitionAfter(clips: Clip[], i: number): number {
  const t = clips[i]?.transitionOut;
  const next = clips[i + 1];
  if (!t || t.type === "none" || !next) return 0;
  const d = Math.min(t.duration, clipDuration(clips[i]), clipDuration(next));
  return d >= MIN_TRANSITION ? d : 0;
}

export interface FrameLayers {
  /** Clip shown (underneath during a transition). */
  a: { index: number; source: number };
  /** Incoming clip during a transition. */
  b: { index: number; source: number } | null;
  /** Transition progress 0..1 (only with b). */
  p: number;
  type: TransitionType;
}

/**
 * What to draw at timeline time t: one clip, or two clips mixing during a
 * transition (centred on the cut). `starts`/`ends` let the export use its
 * frame-aligned times; the preview uses plain clip times.
 */
export function clipEnds(clips: Clip[], starts: number[]): number[] {
  return clips.map((c, i) => starts[i] + clipDuration(c));
}

export function frameLayers(clips: Clip[], t: number, starts: number[], ends: number[]): FrameLayers | null {
  if (!clips.length) return null;
  let i = ends.findIndex((end) => t < end);
  if (i < 0) i = clips.length - 1;
  const src = (k: number) => Math.max(0, sourceAt(clips[k], t - starts[k]));

  // Into the next clip?
  const dOut = transitionAfter(clips, i);
  if (dOut && t >= ends[i] - dOut / 2) {
    return { a: { index: i, source: src(i) }, b: { index: i + 1, source: src(i + 1) }, p: (t - (ends[i] - dOut / 2)) / dOut, type: clips[i].transitionOut!.type };
  }
  // Still coming in from the previous clip?
  const dIn = i > 0 ? transitionAfter(clips, i - 1) : 0;
  if (dIn && t < starts[i] + dIn / 2) {
    return { a: { index: i - 1, source: src(i - 1) }, b: { index: i, source: src(i) }, p: (t - (starts[i] - dIn / 2)) / dIn, type: clips[i - 1].transitionOut!.type };
  }
  return { a: { index: i, source: src(i) }, b: null, p: 0, type: "none" };
}
