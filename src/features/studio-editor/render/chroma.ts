// Green screen (chroma key): makes pixels close to the key colour transparent.
// Works in YCbCr colour space, where "how green" is separate from "how bright",
// so shadows on the green cloth are removed too. Same function for preview and
// export (WYSIWYG). Pure pixel maths, so it can be tested outside the browser.

export interface ChromaKey {
  /** Colour to remove, "#rrggbb". */
  color: string;
  /** 0..1: how different a colour may be and still be removed. */
  strength: number;
}

export const GREEN_KEY: ChromaKey = { color: "#00c800", strength: 0.4 };
export const BLUE_KEY: ChromaKey = { color: "#0047bb", strength: 0.4 };

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const cb = (r: number, g: number, b: number) => -0.168736 * r - 0.331264 * g + 0.5 * b;
const cr = (r: number, g: number, b: number) => 0.5 * r - 0.418688 * g - 0.081312 * b;

/** Key out the colour in place (RGBA pixels, e.g. ImageData.data). */
export function applyChromaKey(px: Uint8ClampedArray, key: ChromaKey): void {
  const [kr, kg, kb] = hexRgb(key.color);
  const kCb = cb(kr, kg, kb), kCr = cr(kr, kg, kb);
  // Distance in the colour plane. Below `inner` → fully transparent, above
  // `outer` → fully kept, smooth edge between. Both are a share of how
  // colourful the key is, so white / grey / black (distance = kLen) are
  // never removed, even at full strength.
  const kLen = Math.hypot(kCb, kCr) || 1;
  const inner = kLen * (0.25 + 0.5 * key.strength);
  const outer = inner + kLen * 0.2;
  const greenish = kg >= kr && kg >= kb;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const d = Math.hypot(cb(r, g, b) - kCb, cr(r, g, b) - kCr);
    if (d >= outer) continue;
    const a = d <= inner ? 0 : (d - inner) / (outer - inner);
    px[i + 3] = Math.round(px[i + 3] * a);
    // Spill: remove the green/blue glow left on edges (hair, shoulders).
    if (a > 0) {
      if (greenish) px[i + 1] = Math.min(g, Math.max(r, b) + (g - Math.max(r, b)) * a * 0.5);
      else px[i + 2] = Math.min(b, Math.max(r, g) + (b - Math.max(r, g)) * a * 0.5);
    }
  }
}

/** Most common strongly coloured pixel near the edges: a good guess for the screen colour. */
export function guessKeyColor(px: Uint8ClampedArray, w: number, h: number): string | null {
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat < 60) return;
    const k = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++; e.r += r; e.g += g; e.b += b;
    bins.set(k, e);
  };
  const m = Math.max(1, Math.round(Math.min(w, h) * 0.08));
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (x < m || y < m || x >= w - m || y >= h - m) add(x, y);
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const e of bins.values()) if (!best || e.n > best.n) best = e;
  if (!best || best.n < 10) return null;
  const hex = (v: number) => Math.round(v / best!.n).toString(16).padStart(2, "0");
  return `#${hex(best.r)}${hex(best.g)}${hex(best.b)}`;
}

let scratch: OffscreenCanvas | HTMLCanvasElement | null = null;

/**
 * Draw `draw` into a w×h scratch canvas, key it, and return the canvas
 * (to be drawn onto the frame). Size is capped to keep phones fast.
 */
export function keyedImage(w: number, h: number, key: ChromaKey, draw: (c: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number) => void) {
  const cap = 1280 / Math.max(w, h);
  const cw = Math.max(1, Math.round(w * Math.min(1, cap))), ch = Math.max(1, Math.round(h * Math.min(1, cap)));
  scratch ??= typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(cw, ch) : document.createElement("canvas");
  if (scratch.width !== cw || scratch.height !== ch) { scratch.width = cw; scratch.height = ch; }
  const c = scratch.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!c) return null;
  c.clearRect(0, 0, cw, ch);
  draw(c, cw, ch);
  const img = c.getImageData(0, 0, cw, ch);
  applyChromaKey(img.data, key);
  c.putImageData(img, 0, 0);
  return scratch;
}
