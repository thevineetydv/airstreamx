// Draws the caption visible at time t. Same function for preview and export.

import { captionAt, type CaptionSettings } from "../model/captions";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const FONT = `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif`;

function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

const Y: Record<CaptionSettings["position"], number> = { bottom: 0.86, middle: 0.5, top: 0.14 };

export function drawCaptionAt(ctx: Ctx, cap: CaptionSettings, t: number, W: number, H: number) {
  const c = captionAt(cap.items, t);
  if (!c || !c.text.trim()) return;
  const u = (Math.min(W, H) / 100) * cap.scale;
  const fs = 5 * u;
  ctx.save();
  ctx.font = `700 ${Math.round(fs)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";

  const lines = wrap(ctx, c.text.trim(), W * 0.86).slice(0, 3);
  const lh = fs * 1.3;
  const blockH = lines.length * lh;
  // Keep the whole block inside the frame.
  const cy = Math.min(Math.max(Y[cap.position] * H, blockH / 2 + 2 * u), H - blockH / 2 - 2 * u);
  const top = cy - blockH / 2;

  lines.forEach((line, i) => {
    const y = top + lh * (i + 0.5);
    const w = ctx.measureText(line).width;
    if (cap.look === "box") {
      const padX = fs * 0.4;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(W / 2 - w / 2 - padX, y - lh / 2, w + padX * 2, lh);
      ctx.fillStyle = "#ffffff";
    } else {
      ctx.lineWidth = fs * 0.16;
      ctx.strokeStyle = "rgba(0,0,0,0.9)";
      ctx.strokeText(line, W / 2, y);
      ctx.fillStyle = cap.look === "yellow" ? "#facc15" : "#ffffff";
    }
    ctx.fillText(line, W / 2, y);
  });
  ctx.restore();
}
