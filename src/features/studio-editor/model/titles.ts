// Ready-made text looks ("quick styles"): font + colour + style + animation in one tap.

import type { TextOverlay } from "./overlays";
import { NO_ANIMATIONS, type Animations } from "./presets";

export interface TitleStyle {
  id: string;
  label: string;
  patch: Pick<TextOverlay, "color" | "style"> & Partial<Pick<TextOverlay, "accent" | "font" | "scale">> & { anim?: Animations };
}

const anim = (a: Partial<Animations>): Animations => ({ ...NO_ANIMATIONS, ...a });

export const TITLE_STYLES: TitleStyle[] = [
  { id: "breaking", label: "BREAKING", patch: { font: "impact", color: "#ffffff", style: "box", accent: "#dc2626", anim: anim({ in: "slideLeft" }) } },
  { id: "sale", label: "SALE", patch: { font: "impact", color: "#facc15", style: "outline", accent: "#000000", scale: 1.3, anim: anim({ in: "pop", loop: "pulse" }) } },
  { id: "hindi", label: "हिंदी", patch: { font: "hindi", color: "#ffffff", style: "shadow", anim: anim({ in: "slideUp" }) } },
  { id: "neon", label: "Neon", patch: { font: "default", color: "#ffffff", style: "neon", accent: "#ec4899", anim: anim({ in: "fade", loop: "pulse" }) } },
  { id: "soft", label: "Soft", patch: { font: "hand", color: "#ffffff", style: "shadow", anim: anim({ in: "typewriter" }) } },
  { id: "caption", label: "Caption", patch: { font: "default", color: "#ffffff", style: "box", scale: 0.8, anim: anim({ in: "fade" }) } },
];
