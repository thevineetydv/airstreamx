// Ready-made animations (one tap, no keyframes needed): how an item comes in,
// goes out, or keeps moving. They are applied ON TOP of keyframes, so both can
// be used together. Same function for preview and export.

import { propsAt, type AnimProps, type Animatable } from "./keyframes";

export type InAnim = "none" | "fade" | "pop" | "slideUp" | "slideLeft" | "typewriter";
export type OutAnim = "none" | "fade" | "shrink" | "slideDown";
export type LoopAnim = "none" | "pulse" | "shake" | "float";

export interface Animations {
  in: InAnim;
  inDuration: number;
  out: OutAnim;
  outDuration: number;
  loop: LoopAnim;
}

export const NO_ANIMATIONS: Animations = { in: "none", inDuration: 0.5, out: "none", outDuration: 0.5, loop: "none" };
export const MIN_ANIM = 0.2;
export const MAX_ANIM = 1.5;

export const IN_LABELS: Record<InAnim, string> = {
  none: "None", fade: "Fade", pop: "Pop", slideUp: "Slide up", slideLeft: "Slide in", typewriter: "Typewriter",
};
export const OUT_LABELS: Record<OutAnim, string> = { none: "None", fade: "Fade", shrink: "Shrink", slideDown: "Slide down" };
export const LOOP_LABELS: Record<LoopAnim, string> = { none: "None", pulse: "Pulse", shake: "Shake", float: "Float" };

/** What the animations do to the item at one moment. */
export interface AnimFrame extends AnimProps {
  /** Share of the text shown (typewriter), 0..1. */
  reveal: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (p: number) => 1 - (1 - p) ** 3;
/** Overshoots a little, then settles (for "pop"). */
const backOut = (p: number) => 1 + 2.2 * (p - 1) ** 3 + 1.2 * (p - 1) ** 2;

/**
 * Keyframes + ready-made animations at timeline time t.
 * `end` is when the item disappears; `isText` allows the typewriter effect.
 */
export function animatedAt(item: Animatable & { anim?: Animations }, t: number, end: number, isText = false): AnimFrame {
  const base = propsAt(item, t - item.start);
  const a = item.anim;
  const out: AnimFrame = { ...base, reveal: 1 };
  if (!a) return out;
  const length = Math.max(0.01, end - item.start);

  // ── In ──
  if (a.in !== "none") {
    const d = Math.min(a.inDuration, length / 2);
    const p = clamp01((t - item.start) / d);
    const e = easeOut(p);
    switch (a.in) {
      case "fade": out.opacity *= e; break;
      case "pop": out.scale *= 0.3 + 0.7 * backOut(p); out.opacity *= clamp01(p * 3); break;
      case "slideUp": out.y += (1 - e) * 0.15; out.opacity *= e; break;
      case "slideLeft": out.x += (1 - e) * 0.3; out.opacity *= e; break;
      case "typewriter": if (isText) out.reveal = p; else out.opacity *= e; break;
    }
  }

  // ── Out ──
  if (a.out !== "none") {
    const d = Math.min(a.outDuration, length / 2);
    const q = clamp01((end - t) / d); // 1 → 0 as it leaves
    switch (a.out) {
      case "fade": out.opacity *= q; break;
      case "shrink": out.scale *= 0.3 + 0.7 * easeOut(q); out.opacity *= q; break;
      case "slideDown": out.y += (1 - easeOut(q)) * 0.15; out.opacity *= q; break;
    }
  }

  // ── Loop (keeps going while visible) ──
  if (a.loop !== "none") {
    const phase = (t - item.start) * 2 * Math.PI;
    switch (a.loop) {
      case "pulse": out.scale *= 1 + 0.07 * Math.sin(phase * 1.2); break;
      case "shake": out.x += 0.006 * Math.sin(phase * 7); break;
      case "float": out.y += 0.02 * Math.sin(phase * 0.8); break;
    }
  }
  return out;
}
