// Overlays drawn on top of the video: text, stickers, area tag, Local Deal banner.
// Times are TIMELINE seconds (not tied to a clip). Position is the overlay
// centre as a fraction of the frame (0..1), so it works for any output size.

import { newId } from "./timeline";
import type { Keyframe } from "./keyframes";

interface OverlayBase {
  id: string;
  start: number;
  end: number;
  /** Centre position, 0..1 of frame width / height. */
  x: number;
  y: number;
  /** Size multiplier, 1 = default. */
  scale: number;
  /** 0..1, default 1 (older drafts have none). */
  opacity?: number;
  /** Animation over time (Phase 6b). */
  keyframes?: Keyframe[];
}

export type TextStyle = "outline" | "box";

export interface TextOverlay extends OverlayBase {
  kind: "text";
  text: string;
  color: string;
  style: TextStyle;
}

export interface StickerOverlay extends OverlayBase {
  kind: "sticker";
  emoji: string;
}

export interface AreaOverlay extends OverlayBase {
  kind: "area";
  area: string;
}

export interface DealOverlay extends OverlayBase {
  kind: "deal";
  business: string;
  offer: string;
  area: string;
  phone: string;
}

export type Overlay = TextOverlay | StickerOverlay | AreaOverlay | DealOverlay;
export type OverlayKind = Overlay["kind"];

/** Fields the panel may edit (everything except id and kind). */
export type OverlayPatch = Partial<Omit<TextOverlay, "id" | "kind">> &
  Partial<Omit<StickerOverlay, "id" | "kind">> &
  Partial<Omit<AreaOverlay, "id" | "kind">> &
  Partial<Omit<DealOverlay, "id" | "kind">>;

export const MIN_OVERLAY_DURATION = 0.3;
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 2.5;

export const TEXT_COLORS = ["#ffffff", "#facc15", "#ef4444", "#22c55e", "#38bdf8", "#000000"];
export const STICKERS = ["🔥", "😍", "😂", "👍", "❤️", "⭐", "🎉", "😋", "🍕", "☕", "🛍️", "💯", "👇", "✅", "🆕", "📢"];

// ── Remembered values (per device) so a shop owner does not retype them every video ──
const MEMO_KEY = "studio-editor:overlay-memo";
interface Memo { area?: string; business?: string; phone?: string }

function readMemo(): Memo {
  try { return JSON.parse(localStorage.getItem(MEMO_KEY) || "{}") as Memo; } catch { return {}; }
}
export function rememberOverlay(o: Overlay) {
  try {
    const memo = readMemo();
    if (o.kind === "area" && o.area.trim()) memo.area = o.area.trim();
    if (o.kind === "deal") {
      if (o.area.trim()) memo.area = o.area.trim();
      if (o.business.trim()) memo.business = o.business.trim();
      if (o.phone.trim()) memo.phone = o.phone.trim();
    }
    localStorage.setItem(MEMO_KEY, JSON.stringify(memo));
  } catch { /* storage blocked: ignore */ }
}

/** A new overlay that starts at the playhead, with sensible defaults per kind. */
export function createOverlay(kind: OverlayKind, playhead: number, total: number): Overlay {
  const memo = readMemo();
  const length = kind === "deal" ? 5 : 3;
  // Area tag covers the whole video by default; others start at the playhead.
  let start = kind === "area" ? 0 : playhead;
  let end = kind === "area" ? total : Math.min(start + length, total);
  if (end - start < MIN_OVERLAY_DURATION) {
    start = Math.max(0, total - length);
    end = total;
  }
  const base = { id: newId("ov"), start, end, scale: 1 };
  switch (kind) {
    case "text":
      return { ...base, kind, x: 0.5, y: 0.5, text: "Your text", color: "#ffffff", style: "outline" };
    case "sticker":
      return { ...base, kind, x: 0.75, y: 0.3, emoji: "🔥" };
    case "area":
      return { ...base, kind, x: 0.5, y: 0.08, area: memo.area ?? "Lucknow" };
    case "deal":
      return {
        ...base, kind, x: 0.5, y: 0.8,
        business: memo.business ?? "Your Shop Name",
        offer: "20% OFF",
        area: memo.area ?? "Lucknow",
        phone: memo.phone ?? "",
      };
  }
}

export function isActive(o: Overlay, t: number): boolean {
  return t >= o.start && t < o.end;
}

/** Keep times inside the video and the minimum length. */
export function clampOverlayTimes(start: number, end: number, total: number): { start: number; end: number } {
  const s = Math.min(Math.max(0, start), Math.max(0, total - MIN_OVERLAY_DURATION));
  const e = Math.min(Math.max(end, s + MIN_OVERLAY_DURATION), total);
  return { start: s, end: e };
}

export function overlayLabel(o: Overlay): string {
  switch (o.kind) {
    case "text": return o.text || "Text";
    case "sticker": return o.emoji;
    case "area": return `📍 ${o.area}`;
    case "deal": return `🏷️ ${o.offer}`;
  }
}
