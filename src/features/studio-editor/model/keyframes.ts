// Keyframes: animate position, size and opacity of a text / sticker / layer over time.
// A keyframe stores all four values at a moment (seconds from the item's start).
// Between two keyframes the values move smoothly (ease in-out).
//
// Editing:
//  - no keyframes: changing a value changes the item everywhere (as before)
//  - on a keyframe: changing a value updates that keyframe
//  - between keyframes, "Auto keyframe" ON: a new keyframe is added there (CapCut style)
//  - between keyframes, "Auto keyframe" OFF (default): the whole animation is
//    shifted / resized together, so moving text never creates keyframes by accident

export interface AnimProps {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export interface Keyframe extends AnimProps {
  /** Seconds from the item's start. */
  t: number;
}

export interface Animatable extends Partial<Pick<AnimProps, "opacity">> {
  x: number;
  y: number;
  scale: number;
  start: number;
  keyframes?: Keyframe[];
}

/** Two keyframes closer than this are "the same moment" (one frame at 30 fps). */
export const KEY_SNAP = 1 / 30 + 1e-6;

const smooth = (p: number) => p * p * (3 - 2 * p);

export function baseProps(item: Animatable): AnimProps {
  return { x: item.x, y: item.y, scale: item.scale, opacity: item.opacity ?? 1 };
}

/** Values at `rel` seconds from the item's start. */
export function propsAt(item: Animatable, rel: number): AnimProps {
  const ks = item.keyframes;
  if (!ks?.length) return baseProps(item);
  if (rel <= ks[0].t) return pick(ks[0]);
  const last = ks[ks.length - 1];
  if (rel >= last.t) return pick(last);
  let i = 1;
  while (ks[i].t < rel) i++;
  const a = ks[i - 1], b = ks[i];
  const p = smooth((rel - a.t) / (b.t - a.t));
  const mix = (u: number, v: number) => u + (v - u) * p;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), scale: mix(a.scale, b.scale), opacity: mix(a.opacity, b.opacity) };
}

const pick = (k: Keyframe): AnimProps => ({ x: k.x, y: k.y, scale: k.scale, opacity: k.opacity });

export function keyframeAt(item: Animatable, rel: number): Keyframe | undefined {
  return item.keyframes?.find((k) => Math.abs(k.t - rel) < KEY_SNAP);
}

const sorted = (ks: Keyframe[]) => [...ks].sort((a, b) => a.t - b.t);

/**
 * The patch to send when the user changes animated values at `rel`.
 * Returns base values when there are no keyframes, else updated keyframes.
 */
export function animatedEdit(
  item: Animatable,
  rel: number,
  change: Partial<AnimProps>,
  autoKey = false,
): Partial<AnimProps> & { keyframes?: Keyframe[] } {
  const ks = item.keyframes ?? [];
  if (!ks.length) return change;
  const hit = keyframeAt(item, rel);
  if (hit) return { keyframes: ks.map((k) => (k === hit ? { ...k, ...change } : k)) };
  if (autoKey) return { keyframes: sorted([...ks, { t: rel, ...propsAt(item, rel), ...change }]) };
  return { keyframes: shiftAll(ks, propsAt(item, rel), change) };
}

/** Move / resize / fade every keyframe by the same amount (the path keeps its shape). */
function shiftAll(ks: Keyframe[], now: AnimProps, change: Partial<AnimProps>): Keyframe[] {
  const dx = change.x !== undefined ? change.x - now.x : 0;
  const dy = change.y !== undefined ? change.y - now.y : 0;
  const ratio = change.scale !== undefined && now.scale > 0 ? change.scale / now.scale : 1;
  const dOp = change.opacity !== undefined ? change.opacity - now.opacity : 0;
  const c01 = (v: number) => Math.min(1, Math.max(0, v));
  return ks.map((k) => ({ ...k, x: c01(k.x + dx), y: c01(k.y + dy), scale: k.scale * ratio, opacity: c01(k.opacity + dOp) }));
}

/** Remove all keyframes; the item stays as it looks at the playhead. */
export function clearKeyframes(item: Animatable, rel: number): { keyframes: Keyframe[] } & AnimProps {
  return { keyframes: [], ...propsAt(item, rel) };
}

/** Add a keyframe at `rel` with the current values, or remove the one that is there. */
export function toggleKeyframe(item: Animatable, rel: number): { keyframes: Keyframe[] } & Partial<AnimProps> {
  const ks = item.keyframes ?? [];
  const hit = keyframeAt(item, rel);
  if (hit) {
    const rest = ks.filter((k) => k !== hit);
    // Removing the last keyframe: keep the item where it was shown.
    return rest.length ? { keyframes: rest } : { keyframes: [], ...pick(hit) };
  }
  return { keyframes: sorted([...ks, { t: Math.max(0, rel), ...propsAt(item, rel) }]) };
}

/** Keep keyframes inside the item when its length changes. */
export function clampKeyframes(ks: Keyframe[] | undefined, length: number): Keyframe[] | undefined {
  if (!ks?.length) return ks;
  return ks.filter((k) => k.t <= length + KEY_SNAP);
}

export function neighbourKey(item: Animatable, rel: number, dir: -1 | 1): Keyframe | undefined {
  const ks = item.keyframes ?? [];
  return dir < 0 ? [...ks].reverse().find((k) => k.t < rel - KEY_SNAP) : ks.find((k) => k.t > rel + KEY_SNAP);
}
