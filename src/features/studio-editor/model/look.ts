// Per-clip look: colour filter, fit/crop, and the transition into the next clip.
// The filter is a CSS filter string, used as-is by the preview (<video> CSS)
// and by the export (canvas ctx.filter), so both look the same.

export type FilterPreset = "none" | "vivid" | "warm" | "cool" | "bw" | "vintage" | "dramatic";

export interface ClipLook {
  preset: FilterPreset;
  /** Adjustments, -1..1 (0 = unchanged). */
  brightness: number;
  contrast: number;
  saturation: number;
}

/** fit = whole video visible (bars) · fill = crop to fill the frame · blur = fit on a blurred copy. */
export type FitMode = "fit" | "fill" | "blur";

export type TransitionType = "none" | "fade" | "dip" | "slide" | "zoom" | "wipe";

export interface Transition {
  type: TransitionType;
  /** Seconds. Centred on the cut, so the video length never changes. */
  duration: number;
}

export type AspectRatio = "auto" | "9:16" | "16:9" | "1:1";

export const DEFAULT_LOOK: ClipLook = { preset: "none", brightness: 0, contrast: 0, saturation: 0 };

export const FILTER_PRESETS: { id: FilterPreset; label: string; css: string }[] = [
  { id: "none", label: "Original", css: "" },
  { id: "vivid", label: "Vivid", css: "saturate(1.35) contrast(1.08)" },
  { id: "warm", label: "Warm", css: "sepia(0.22) saturate(1.15) hue-rotate(-8deg) brightness(1.03)" },
  { id: "cool", label: "Cool", css: "saturate(0.95) hue-rotate(10deg) brightness(1.03) contrast(1.04)" },
  { id: "bw", label: "B&W", css: "grayscale(1) contrast(1.1)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.45) contrast(0.92) saturate(0.85) brightness(1.05)" },
  { id: "dramatic", label: "Dramatic", css: "contrast(1.3) saturate(0.85) brightness(0.95)" },
];

export const TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: "none", label: "None" },
  { id: "fade", label: "Fade" },
  { id: "dip", label: "Dip to black" },
  { id: "slide", label: "Slide" },
  { id: "zoom", label: "Zoom" },
  { id: "wipe", label: "Wipe" },
];

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const MIN_TRANSITION = 0.2;
export const MAX_TRANSITION = 1.5;

/** CSS / canvas filter string for a clip ("" = no filter). */
export function filterCss(look: ClipLook): string {
  const parts: string[] = [];
  const preset = FILTER_PRESETS.find((p) => p.id === look.preset)?.css;
  if (preset) parts.push(preset);
  if (look.brightness) parts.push(`brightness(${(1 + look.brightness * 0.5).toFixed(3)})`);
  if (look.contrast) parts.push(`contrast(${(1 + look.contrast * 0.6).toFixed(3)})`);
  if (look.saturation) parts.push(`saturate(${(1 + look.saturation).toFixed(3)})`);
  return parts.join(" ");
}

/** Smooth start and end for transitions. */
export function ease(p: number): number {
  const x = Math.min(1, Math.max(0, p));
  return x * x * (3 - 2 * x);
}
