// Ready-made templates: a full look for a type of video in one tap —
// text, area tag, rating, deal banner, animations, music, colour, transitions
// and shape. The creator fills a short form (dish name, area, offer…), the
// template places everything to fit the video's length. Everything stays
// editable afterwards, and applying is one undo step.

import type { Overlay, TextOverlay } from "./overlays";
import { newId } from "./timeline";
import { DEFAULT_LOOK, type AspectRatio, type FilterPreset, type FitMode, type Transition } from "./look";
import { NO_ANIMATIONS, type Animations } from "./presets";

export interface TemplateField {
  key: string;
  label: string;
  placeholder: string;
  /** "rating" = 1–5 stars. */
  kind?: "text" | "tel" | "rating";
  /** Pre-filled value (and value used for the gallery preview). */
  sample: string;
  optional?: boolean;
  max?: number;
  /** Pre-fill from what the creator typed before (stored on the device). */
  remember?: "area" | "business" | "phone";
}

export interface TemplateResult {
  overlays: Overlay[];
  musicId: string | null;
  musicVolume: number;
  aspect: AspectRatio;
  filter: FilterPreset;
  fit: FitMode;
  /** Put on every cut between clips. */
  transition: Transition | null;
}

export interface Template {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  /** Gallery card background (top → bottom). */
  colors: [string, string];
  fields: TemplateField[];
  build: (v: Record<string, string>, total: number) => TemplateResult;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const anim = (a: Partial<Animations>): Animations => ({ ...NO_ANIMATIONS, ...a });

/** A time window that always fits inside the video (short videos get shorter windows). */
function win(total: number, start: number, end: number): { start: number; end: number } {
  const s = Math.min(Math.max(0, start), Math.max(0, total - 0.6));
  return { start: s, end: Math.max(Math.min(end, total), Math.min(total, s + 0.6)) };
}

function text(
  tpl: string,
  w: { start: number; end: number },
  value: string,
  o: Partial<Pick<TextOverlay, "x" | "y" | "scale" | "color" | "style">> & { anim?: Partial<Animations> },
): TextOverlay {
  return {
    id: newId("ov"), kind: "text", template: tpl, ...w,
    x: o.x ?? 0.5, y: o.y ?? 0.5, scale: o.scale ?? 1,
    text: value, color: o.color ?? "#ffffff", style: o.style ?? "outline",
    anim: o.anim ? anim(o.anim) : undefined,
  };
}

const stars = (n: string) => "⭐".repeat(Math.min(5, Math.max(1, Number(n) || 4)));
const val = (v: Record<string, string>, k: string, fallback = "") => (v[k] ?? "").trim() || fallback;

// ── templates ─────────────────────────────────────────────────────────────────

export const TEMPLATES: Template[] = [
  {
    id: "food-review",
    name: "Food review",
    emoji: "🍜",
    tagline: "Dish name, rating, area — for food vloggers",
    colors: ["#7c2d12", "#f97316"],
    fields: [
      { key: "dish", label: "Dish name", placeholder: "e.g. Galouti Kabab", sample: "Galouti Kabab", max: 32 },
      { key: "place", label: "Restaurant / stall", placeholder: "e.g. Tunday Kababi", sample: "Tunday Kababi", max: 32, remember: "business" },
      { key: "area", label: "Area", placeholder: "e.g. Aminabad, Lucknow", sample: "Aminabad, Lucknow", max: 32, remember: "area" },
      { key: "rating", label: "Your rating", placeholder: "", kind: "rating", sample: "4" },
      { key: "price", label: "Price", placeholder: "e.g. ₹120", sample: "₹120", optional: true, max: 12 },
    ],
    build: (v, T) => {
      const id = "food-review";
      const place = val(v, "place");
      const price = val(v, "price");
      const sub = [place, price].filter(Boolean).join(" · ");
      const ratingAt = Math.max(0.5, T * 0.4);
      return {
        aspect: "9:16", filter: "vivid", fit: "blur",
        transition: { type: "fade", duration: 0.4 },
        musicId: "chai-break", musicVolume: 0.45,
        overlays: [
          text(id, win(T, 0, 4), val(v, "dish", "Dish name"), { y: 0.12, scale: 1.15, color: "#facc15", anim: { in: "pop", out: "fade" } }),
          ...(sub ? [text(id, win(T, 0.3, 4), sub, { y: 0.2, scale: 0.7, style: "box", anim: { in: "slideUp", out: "fade" } })] : []),
          { id: newId("ov"), kind: "area", template: id, ...win(T, 0, T), x: 0.5, y: 0.92, scale: 1, area: val(v, "area", "Lucknow"), anim: anim({ in: "fade" }) },
          text(id, win(T, ratingAt, ratingAt + 3.5), stars(v.rating), { y: 0.78, scale: 1.1, anim: { in: "pop", loop: "pulse", out: "fade" } }),
          text(id, win(T, T - 2.5, T), "Follow for more 🍴", { y: 0.5, scale: 0.9, style: "box", anim: { in: "typewriter", inDuration: 1 } }),
        ],
      };
    },
  },
  {
    id: "shop-offer",
    name: "Shop offer",
    emoji: "🛍️",
    tagline: "Big offer banner with phone — for local shops",
    colors: ["#7f1d1d", "#ef4444"],
    fields: [
      { key: "headline", label: "Headline", placeholder: "e.g. Aaj ka special offer!", sample: "Aaj ka special offer!", max: 30 },
      { key: "offer", label: "Offer", placeholder: "e.g. 20% OFF", sample: "20% OFF", max: 24 },
      { key: "business", label: "Shop name", placeholder: "e.g. Sharma Electronics", sample: "Sharma Electronics", max: 36, remember: "business" },
      { key: "area", label: "Area", placeholder: "e.g. Hazratganj, Lucknow", sample: "Hazratganj", max: 28, remember: "area" },
      { key: "phone", label: "Phone", placeholder: "e.g. 98765 43210", sample: "98765 43210", kind: "tel", optional: true, max: 16, remember: "phone" },
    ],
    build: (v, T) => {
      const id = "shop-offer";
      return {
        aspect: "9:16", filter: "vivid", fit: "blur",
        transition: { type: "slide", duration: 0.4 },
        musicId: "bazaar-bounce", musicVolume: 0.5,
        overlays: [
          text(id, win(T, 0, 3.5), val(v, "headline", "Special offer!"), { y: 0.12, scale: 1, style: "box", anim: { in: "slideLeft", out: "fade" } }),
          { id: newId("ov"), kind: "sticker", template: id, ...win(T, 0.8, T), x: 0.84, y: 0.6, scale: 0.9, emoji: "🔥", anim: anim({ in: "pop", loop: "pulse" }) },
          {
            id: newId("ov"), kind: "deal", template: id, ...win(T, Math.min(1, T * 0.15), T), x: 0.5, y: 0.79, scale: 1.1,
            offer: val(v, "offer", "20% OFF"), business: val(v, "business", "Your Shop"), area: val(v, "area"), phone: val(v, "phone"),
            anim: anim({ in: "pop", loop: "pulse" }),
          },
        ],
      };
    },
  },
  {
    id: "cafe-intro",
    name: "Cafe intro",
    emoji: "☕",
    tagline: "Name, tagline, timings — for cafes & restaurants",
    colors: ["#422006", "#a16207"],
    fields: [
      { key: "name", label: "Cafe / restaurant name", placeholder: "e.g. Chai Sutta Corner", sample: "Chai Sutta Corner", max: 30, remember: "business" },
      { key: "tagline", label: "Tagline", placeholder: "e.g. Best cold coffee in town", sample: "Best cold coffee in town", max: 40 },
      { key: "area", label: "Area", placeholder: "e.g. Gomti Nagar", sample: "Gomti Nagar", max: 28, remember: "area" },
      { key: "timing", label: "Timings", placeholder: "e.g. Open 10 AM – 11 PM", sample: "Open 10 AM – 11 PM", optional: true, max: 30 },
    ],
    build: (v, T) => {
      const id = "cafe-intro";
      const timing = val(v, "timing");
      return {
        aspect: "9:16", filter: "warm", fit: "blur",
        transition: { type: "fade", duration: 0.6 },
        musicId: "chai-break", musicVolume: 0.5,
        overlays: [
          { id: newId("ov"), kind: "area", template: id, ...win(T, 0, T), x: 0.5, y: 0.07, scale: 1, area: val(v, "area", "Lucknow"), anim: anim({ in: "fade" }) },
          text(id, win(T, 0, 3.5), val(v, "name", "Our Cafe"), { y: 0.42, scale: 1.3, anim: { in: "slideUp", out: "fade" } }),
          text(id, win(T, 0.6, 3.5), val(v, "tagline"), { y: 0.52, scale: 0.75, anim: { in: "fade", out: "fade" } }),
          { id: newId("ov"), kind: "sticker", template: id, ...win(T, 0, 3.5), x: 0.5, y: 0.3, scale: 0.9, emoji: "☕", anim: anim({ in: "pop", loop: "float" }) },
          ...(timing ? [text(id, win(T, T * 0.5, T), timing, { y: 0.86, scale: 0.8, style: "box", anim: { in: "slideUp" } })] : []),
        ],
      };
    },
  },
  {
    id: "festival-sale",
    name: "Festival sale",
    emoji: "🎉",
    tagline: "Diwali / Eid / Holi sale with dhol music",
    colors: ["#701a75", "#f59e0b"],
    fields: [
      { key: "festival", label: "Festival", placeholder: "e.g. Diwali", sample: "Diwali", max: 16 },
      { key: "offer", label: "Offer", placeholder: "e.g. Flat 30% OFF", sample: "Flat 30% OFF", max: 24 },
      { key: "business", label: "Shop name", placeholder: "e.g. Gupta Sweets", sample: "Gupta Sweets", max: 36, remember: "business" },
      { key: "area", label: "Area", placeholder: "e.g. Chowk, Lucknow", sample: "Chowk", max: 28, remember: "area" },
      { key: "phone", label: "Phone", placeholder: "e.g. 98765 43210", sample: "", kind: "tel", optional: true, max: 16, remember: "phone" },
    ],
    build: (v, T) => {
      const id = "festival-sale";
      return {
        aspect: "9:16", filter: "vivid", fit: "blur",
        transition: { type: "zoom", duration: 0.4 },
        musicId: "festive-dhol", musicVolume: 0.55,
        overlays: [
          text(id, win(T, 0, Math.max(4, T * 0.5)), `${val(v, "festival", "Festival").toUpperCase()} SALE`, { y: 0.13, scale: 1.35, color: "#facc15", anim: { in: "pop", loop: "pulse", out: "fade" } }),
          { id: newId("ov"), kind: "sticker", template: id, ...win(T, 0.3, T), x: 0.15, y: 0.28, scale: 0.9, emoji: "🎉", anim: anim({ in: "pop", loop: "shake" }) },
          { id: newId("ov"), kind: "sticker", template: id, ...win(T, 0.6, T), x: 0.86, y: 0.28, scale: 0.9, emoji: "🪔", anim: anim({ in: "pop", loop: "float" }) },
          {
            id: newId("ov"), kind: "deal", template: id, ...win(T, Math.min(1, T * 0.15), T), x: 0.5, y: 0.79, scale: 1.1,
            offer: val(v, "offer", "Big discounts"), business: val(v, "business", "Your Shop"), area: val(v, "area"), phone: val(v, "phone"),
            anim: anim({ in: "slideUp", loop: "pulse" }),
          },
        ],
      };
    },
  },
  {
    id: "gym-promo",
    name: "Gym promo",
    emoji: "💪",
    tagline: "Bold text, offer and energy — for gyms & classes",
    colors: ["#111827", "#dc2626"],
    fields: [
      { key: "hook", label: "Big line", placeholder: "e.g. NO EXCUSES", sample: "NO EXCUSES", max: 20 },
      { key: "business", label: "Gym / studio name", placeholder: "e.g. Iron Temple Gym", sample: "Iron Temple Gym", max: 32, remember: "business" },
      { key: "offer", label: "Offer", placeholder: "e.g. First week FREE", sample: "First week FREE", max: 24 },
      { key: "area", label: "Area", placeholder: "e.g. Indira Nagar", sample: "Indira Nagar", max: 28, remember: "area" },
      { key: "phone", label: "Phone", placeholder: "e.g. 98765 43210", sample: "", kind: "tel", optional: true, max: 16, remember: "phone" },
    ],
    build: (v, T) => {
      const id = "gym-promo";
      const offerAt = Math.max(1, T * 0.4);
      return {
        aspect: "9:16", filter: "dramatic", fit: "blur",
        transition: { type: "dip", duration: 0.3 },
        musicId: "bazaar-bounce", musicVolume: 0.6,
        overlays: [
          text(id, win(T, 0, 3), val(v, "hook", "NO EXCUSES").toUpperCase(), { y: 0.14, scale: 1.4, anim: { in: "pop", loop: "shake", out: "fade" } }),
          text(id, win(T, 0.8, offerAt), val(v, "business"), { y: 0.5, scale: 1, color: "#facc15", anim: { in: "slideUp", out: "fade" } }),
          { id: newId("ov"), kind: "sticker", template: id, ...win(T, 0.5, T), x: 0.85, y: 0.62, scale: 0.9, emoji: "💯", anim: anim({ in: "pop", loop: "pulse" }) },
          {
            id: newId("ov"), kind: "deal", template: id, ...win(T, offerAt, T), x: 0.5, y: 0.79, scale: 1.1,
            offer: val(v, "offer", "Join today"), business: val(v, "business", "Your Gym"), area: val(v, "area"), phone: val(v, "phone"),
            anim: anim({ in: "pop", loop: "pulse" }),
          },
        ],
      };
    },
  },
  {
    id: "city-vlog",
    name: "City vlog",
    emoji: "🗺️",
    tagline: "Calm title and place tag — keeps your video's shape",
    colors: ["#0c4a6e", "#0ea5e9"],
    fields: [
      { key: "title", label: "Title", placeholder: "e.g. Lucknow ki ek shaam", sample: "Lucknow ki ek shaam", max: 36 },
      { key: "area", label: "Place", placeholder: "e.g. Hazratganj", sample: "Hazratganj", max: 28, remember: "area" },
      { key: "handle", label: "Your channel", placeholder: "e.g. @lucknowvibes", sample: "@lucknowvibes", optional: true, max: 24 },
    ],
    build: (v, T) => {
      const id = "city-vlog";
      const handle = val(v, "handle");
      return {
        aspect: "auto", filter: "warm", fit: "fit",
        transition: { type: "fade", duration: 0.8 },
        musicId: "sunrise-ghat", musicVolume: 0.4,
        overlays: [
          text(id, win(T, 0, 4), val(v, "title", "My city"), { y: 0.45, scale: 1.15, anim: { in: "typewriter", inDuration: 1.2, out: "fade" } }),
          { id: newId("ov"), kind: "area", template: id, ...win(T, 0.5, T), x: 0.5, y: 0.9, scale: 1, area: val(v, "area", "Lucknow"), anim: anim({ in: "fade" }) },
          ...(handle ? [text(id, win(T, T - 3, T), `Subscribe ${handle}`, { y: 0.5, scale: 0.85, style: "box", anim: { in: "pop" } })] : []),
        ],
      };
    },
  },
];

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function sampleValues(t: Template): Record<string, string> {
  return Object.fromEntries(t.fields.map((f) => [f.key, f.sample]));
}

/** Clip look for a template (filter preset, other adjustments reset). */
export const lookFor = (preset: FilterPreset) => ({ ...DEFAULT_LOOK, preset });
