// Draws overlays onto a 2D canvas. The SAME code runs for the live preview
// and for the export, so what the creator sees is what gets exported.
// All sizes use a unit `u` = 1% of the frame's shorter side, so the look is
// the same at 720p, 1080p, portrait or landscape.

import { isActive, type Overlay } from "../model/overlays";
import { animatedAt } from "../model/presets";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Rect { x: number; y: number; w: number; h: number }

// System fonts: Roboto / Noto on Android include Devanagari, so Hindi text works.
const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif`;
const font = (weight: number, px: number) => `${weight} ${Math.round(px)}px ${FONT}`;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Break text into lines that fit maxWidth. Keeps user line breaks. */
function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = words[0];
    for (const word of words.slice(1)) {
      const test = `${line} ${word}`;
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

/** Keep a box of size w×h centred near (cx, cy) fully inside the frame. */
function placeBox(cx: number, cy: number, w: number, h: number, W: number, H: number): Rect {
  const x = Math.min(Math.max(cx - w / 2, 0), Math.max(0, W - w));
  const y = Math.min(Math.max(cy - h / 2, 0), Math.max(0, H - h));
  return { x, y, w, h };
}

interface Layout { rect: Rect; draw: () => void }

function layout(ctx: Ctx, o: Overlay & { reveal?: number }, W: number, H: number): Layout {
  const u = (Math.min(W, H) / 100) * o.scale;
  const cx = o.x * W;
  const cy = o.y * H;

  switch (o.kind) {
    case "text": {
      const fs = 6.5 * u;
      ctx.font = font(800, fs);
      const lines = wrap(ctx, o.text || " ", W * 0.86);
      const lh = fs * 1.22;
      const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const pad = o.style === "box" ? fs * 0.45 : fs * 0.1;
      const rect = placeBox(cx, cy, textW + pad * 2, lines.length * lh + pad * 2, W, H);
      return {
        rect,
        draw: () => {
          if (o.style === "box") {
            ctx.fillStyle = "rgba(0,0,0,0.62)";
            roundRect(ctx, rect.x, rect.y, rect.w, rect.h, fs * 0.35);
            ctx.fill();
          }
          ctx.font = font(800, fs);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.lineJoin = "round";
          // Typewriter: show only the first part of the text. Each line keeps its
          // final place, so letters appear without the text jumping around.
          const total = lines.reduce((n, l) => n + l.length, 0);
          let left = o.reveal === undefined || o.reveal >= 1 ? total : Math.floor(total * o.reveal);
          lines.forEach((line, i) => {
            if (left <= 0) return;
            const shown = line.slice(0, left);
            left -= line.length;
            const ly = rect.y + pad + lh * (i + 0.5);
            const lx = rect.x + rect.w / 2;
            const partial = shown.length < line.length;
            const sx = partial ? lx - ctx.measureText(line).width / 2 : lx;
            ctx.textAlign = partial ? "left" : "center";
            if (o.style === "outline") {
              ctx.lineWidth = fs * 0.14;
              ctx.strokeStyle = o.color === "#000000" ? "#ffffff" : "rgba(0,0,0,0.85)";
              ctx.strokeText(shown, sx, ly);
            }
            ctx.fillStyle = o.color;
            ctx.fillText(shown, sx, ly);
          });
        },
      };
    }

    case "sticker": {
      const fs = 16 * u;
      ctx.font = font(400, fs);
      const w = Math.max(fs, ctx.measureText(o.emoji).width);
      const rect = placeBox(cx, cy, w, fs * 1.15, W, H);
      return {
        rect,
        draw: () => {
          ctx.font = font(400, fs);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#000";
          ctx.fillText(o.emoji, rect.x + rect.w / 2, rect.y + rect.h / 2);
        },
      };
    }

    case "area": {
      const fs = 4.2 * u;
      const label = `📍 ${o.area || "Your area"}`;
      ctx.font = font(700, fs);
      const tw = Math.min(ctx.measureText(label).width, W * 0.9 - fs * 1.6);
      const rect = placeBox(cx, cy, tw + fs * 1.6, fs * 2, W, H);
      return {
        rect,
        draw: () => {
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          roundRect(ctx, rect.x, rect.y, rect.w, rect.h, rect.h / 2);
          ctx.fill();
          ctx.font = font(700, fs);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#111111";
          ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w - fs);
        },
      };
    }

    case "deal": {
      const pad = 4 * u;
      const cardW = Math.min(W * 0.9, 80 * u);
      const inner = cardW - pad * 2;
      const chipFs = 2.8 * u;
      const offerFs = 9 * u;
      const bizFs = 4.6 * u;
      const footFs = 3.4 * u;

      ctx.font = font(900, offerFs);
      const offerLines = wrap(ctx, o.offer || "Offer", inner).slice(0, 2);
      ctx.font = font(700, bizFs);
      const bizLines = wrap(ctx, o.business || "", inner).slice(0, 2).filter(Boolean);
      const footer = [o.area && `📍 ${o.area}`, o.phone && `📞 ${o.phone}`].filter(Boolean).join("   ");

      const chipH = chipFs * 2;
      let h = pad + chipH + 1.5 * u + offerLines.length * offerFs * 1.1;
      if (bizLines.length) h += 1 * u + bizLines.length * bizFs * 1.25;
      if (footer) h += 1.5 * u + footFs * 1.4;
      h += pad;
      const rect = placeBox(cx, cy, cardW, h, W, H);

      return {
        rect,
        draw: () => {
          // Card with red gradient (AirStreamX brand colour).
          const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
          g.addColorStop(0, "#ef4444");
          g.addColorStop(1, "#991b1b");
          ctx.fillStyle = g;
          roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 3 * u);
          ctx.fill();

          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          let y = rect.y + pad;
          const x = rect.x + pad;

          // "LOCAL DEAL" chip
          ctx.font = font(800, chipFs);
          const chip = "LOCAL DEAL";
          const chipW = ctx.measureText(chip).width + chipFs * 1.6;
          ctx.fillStyle = "#facc15";
          roundRect(ctx, x, y, chipW, chipH, chipH / 2);
          ctx.fill();
          ctx.fillStyle = "#111111";
          ctx.textBaseline = "middle";
          ctx.fillText(chip, x + chipFs * 0.8, y + chipH / 2);
          ctx.textBaseline = "top";
          y += chipH + 1.5 * u;

          ctx.fillStyle = "#ffffff";
          ctx.font = font(900, offerFs);
          for (const line of offerLines) { ctx.fillText(line, x, y, inner); y += offerFs * 1.1; }

          if (bizLines.length) {
            y += 1 * u;
            ctx.font = font(700, bizFs);
            for (const line of bizLines) { ctx.fillText(line, x, y, inner); y += bizFs * 1.25; }
          }
          if (footer) {
            y += 1.5 * u;
            ctx.font = font(600, footFs);
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            ctx.fillText(footer, x, y, inner);
          }
        },
      };
    }
  }
}

/** The overlay as it looks at time t (keyframes applied). */
export function overlayAt(o: Overlay, t: number): Overlay & { opacity: number; reveal: number } {
  return { ...o, ...animatedAt(o, t, o.end, o.kind === "text") };
}

/** Draw every overlay visible at timeline time `t`, in order (later = on top). */
export function drawOverlaysAt(ctx: Ctx, overlays: Overlay[], t: number, W: number, H: number) {
  for (const o of overlays) {
    if (!isActive(o, t)) continue;
    const a = overlayAt(o, t);
    if (a.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a.opacity);
    layout(ctx, a, W, H).draw();
    ctx.restore();
  }
}

/** Bounding box of an overlay at time t, for tap / drag hit-testing in the preview. */
export function overlayRect(ctx: Ctx, o: Overlay, W: number, H: number, t: number): Rect {
  ctx.save();
  const r = layout(ctx, overlayAt(o, t), W, H).rect;
  ctx.restore();
  return r;
}
