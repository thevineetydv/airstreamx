// utils/share.ts
//
// Everything needed to share a video: clean public links, platform share
// URLs, start-at-time links, and a 1080×1920 "story card" image that can be
// posted to Instagram / WhatsApp / Facebook Stories.

const PUBLIC_SITE = "https://www.airstreamx.com";

/** Links always point at the public site (not localhost / preview URLs). */
export function siteOrigin(): string {
  try {
    const o = window.location.origin;
    return /airstreamx\.com$/i.test(new URL(o).hostname) ? o : PUBLIC_SITE;
  } catch {
    return PUBLIC_SITE;
  }
}

export function videoShareUrl(id: string | number, opts: { short?: boolean; startAt?: number } = {}): string {
  const base = siteOrigin();
  if (opts.short) return `${base}/shorts/${encodeURIComponent(String(id))}`;
  const t = opts.startAt && opts.startAt > 0 ? `&t=${Math.floor(opts.startAt)}` : "";
  return `${base}/watch?v=${encodeURIComponent(String(id))}${t}`;
}

/** Parse ?t= values like "95", "95s", "1m35s", "1h2m3s". Returns seconds or 0. */
export function parseStartTime(raw: string | null | undefined): number {
  if (!raw) return 0;
  const s = raw.trim().toLowerCase();
  if (/^\d+(\.\d+)?s?$/.test(s)) return Math.max(0, Math.floor(parseFloat(s)));
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(s);
  if (!m || !s) return 0;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}

export function fmtClock(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}

export type ShareTarget = "whatsapp" | "facebook" | "x" | "telegram";

export function shareTargetUrl(target: ShareTarget, url: string, text: string): string {
  const u = encodeURIComponent(url);
  switch (target) {
    case "whatsapp": return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
    case "facebook": return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "x":        return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${u}`;
    case "telegram": return `https://t.me/share/url?url=${u}&text=${encodeURIComponent(text)}`;
  }
}

/** Copy text; falls back to a hidden textarea where the Clipboard API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** True on devices with a native share sheet (most phones). */
export const canNativeShare = (): boolean => typeof navigator !== "undefined" && typeof navigator.share === "function";

/* ─────────────────────────────────────────────────────────────
 * Story card (1080 × 1920 PNG)
 * ───────────────────────────────────────────────────────────── */

export interface StoryCardInput {
  title: string;
  channel?: string;
  thumbnail?: string;
  short?: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // required so the canvas can be exported
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    // Separate cache entry: a thumbnail already cached by an <img> without
    // CORS headers would otherwise be reused and taint the canvas.
    img.src = /^https?:/i.test(src) ? `${src}${src.includes("?") ? "&" : "?"}story=1` : src;
    setTimeout(() => resolve(null), 6000);
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let last = lines[maxLines - 1];
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

/**
 * Draw a branded 9:16 story image for a video. Works without the thumbnail
 * (e.g. if the image host blocks cross-origin use) — it falls back to a
 * gradient background.
 */
export async function createStoryCard(input: StoryCardInput): Promise<Blob> {
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const font = `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif`;

  const img = input.thumbnail ? await loadImage(input.thumbnail) : null;

  // Background: blurred thumbnail or brand gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#3a0a0a");
  bg.addColorStop(1, "#0b0b0b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  if (img) {
    ctx.save();
    ctx.filter = "blur(40px) brightness(0.45)";
    drawCover(ctx, img, -60, -60, W + 120, H + 120);
    ctx.restore();
  }
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0.25)");
  shade.addColorStop(1, "rgba(0,0,0,0.75)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  // Brand header
  ctx.fillStyle = "#e11d48";
  roundRect(ctx, 90, 140, 84, 84, 20);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(118, 160); ctx.lineTo(118, 204); ctx.lineTo(152, 182); ctx.closePath();
  ctx.fill();
  ctx.font = `800 64px ${font}`;
  ctx.textBaseline = "middle";
  ctx.fillText("AirStreamX", 196, 184);

  // Thumbnail card (16:9 for videos, 9:16 for Shorts)
  const cardW = input.short ? 560 : 900;
  const cardH = input.short ? 996 : Math.round(900 * 9 / 16);
  const cardX = (W - cardW) / 2;
  const cardY = input.short ? 330 : 520;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 60;
  roundRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.fillStyle = "#111";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, 36);
  ctx.clip();
  if (img) drawCover(ctx, img, cardX, cardY, cardW, cardH);
  ctx.restore();

  // Play button
  const cx = W / 2, cy = cardY + cardH / 2;
  ctx.fillStyle = "rgba(225,29,72,0.92)";
  ctx.beginPath(); ctx.arc(cx, cy, 70, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.moveTo(cx - 22, cy - 36); ctx.lineTo(cx - 22, cy + 36); ctx.lineTo(cx + 38, cy); ctx.closePath(); ctx.fill();

  // Title + channel
  let y = cardY + cardH + 90;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff";
  ctx.font = `700 60px ${font}`;
  for (const l of wrapLines(ctx, input.title || "Watch on AirStreamX", W - 180, input.short ? 2 : 3)) {
    ctx.fillText(l, 90, y);
    y += 76;
  }
  if (input.channel) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `500 42px ${font}`;
    ctx.fillText(input.channel, 90, y + 10);
  }

  // Call to action (leave room above it for an Instagram link sticker)
  ctx.fillStyle = "#e11d48";
  roundRect(ctx, 90, H - 250, W - 180, 120, 60);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = `700 46px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(input.short ? "▶  Watch on airstreamx.com" : "▶  Watch full video on airstreamx.com", W / 2, H - 190);
  ctx.textAlign = "start";

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create image"))), "image/png");
    } catch (e) {
      reject(e); // tainted canvas (thumbnail without CORS)
    }
  });
}

/** Re-draw without the thumbnail if the first attempt fails (cross-origin). */
export async function createStoryCardSafe(input: StoryCardInput): Promise<Blob> {
  try {
    return await createStoryCard(input);
  } catch {
    return createStoryCard({ ...input, thumbnail: undefined });
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
