// Text fonts for overlays. Font files come from @fontsource (bundled, free
// licences: Mukta / Kalam / Anton are OFL). They are only loaded in the editor
// chunk, so the rest of the site does not grow.
//
// Canvas text only uses a web font after it is downloaded, so preview and
// export call ensureFonts() first; otherwise the first frames would use the
// fallback font.

import "@fontsource/mukta/800.css";
import "@fontsource/kalam/700.css";
import "@fontsource/anton/400.css";

export type TextFont = "default" | "hindi" | "impact" | "hand";

export const BASE_FONT = `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif`;

type WebFont = Exclude<TextFont, "default">;

const FACES: Record<WebFont, { family: string; weight: number }> = {
  hindi: { family: "Mukta", weight: 800 },
  hand: { family: "Kalam", weight: 700 },
  impact: { family: "Anton", weight: 400 },
};

export const FONT_LABELS: Record<TextFont, string> = {
  default: "Classic",
  hindi: "हिंदी Bold",
  impact: "IMPACT",
  hand: "Hand",
};

/** Sample shown on the font buttons, in that font. */
export const FONT_SAMPLE: Record<TextFont, string> = { default: "Aa", hindi: "अआ", impact: "AA", hand: "Aa" };

/** CSS font for canvas text. `weight` is used only for the default font. */
export function textFont(f: TextFont | undefined, weight: number, px: number): string {
  const face = f && f !== "default" ? FACES[f] : null;
  return face ? `${face.weight} ${Math.round(px)}px "${face.family}", ${BASE_FONT}` : `${weight} ${Math.round(px)}px ${BASE_FONT}`;
}

/** CSS family for a font button. */
export function cssFamily(f: TextFont): string {
  return f === "default" ? BASE_FONT : `"${FACES[f].family}", ${BASE_FONT}`;
}

/** Web fonts used by these overlays (sorted, no duplicates). */
export function usedFonts(overlays: { kind: string; font?: TextFont }[]): WebFont[] {
  const set = new Set<WebFont>();
  for (const o of overlays) if (o.kind === "text" && o.font && o.font !== "default") set.add(o.font);
  return [...set].sort();
}

/** Download these fonts (Latin + Devanagari parts). Never throws. */
export async function ensureFonts(fonts: WebFont[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(fonts.map((f) => document.fonts.load(`${FACES[f].weight} 40px "${FACES[f].family}"`, "Aअ").catch(() => undefined)));
}
