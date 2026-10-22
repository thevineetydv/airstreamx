// Drawing a clip's frame (export) and mixing two clips during a transition.
// The preview does the same thing with CSS on two <video> elements
// (transitionCss below), using the same maths so both look alike.

import type { CSSProperties } from "react";
import type { VideoSample } from "mediabunny";
import { ease, filterCss, type TransitionType } from "../model/look";
import type { Clip } from "../model/types";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let small: OffscreenCanvas | HTMLCanvasElement | null = null;
/** One reused small canvas for the blur background. */
function smallCanvas(w: number, h: number) {
  small ??= typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : document.createElement("canvas");
  if (small.width !== w || small.height !== h) { small.width = w; small.height = h; }
  return small;
}

/** Source rectangle that fills a W×H frame, positioned by pan (0..1). */
export function coverCrop(sw: number, sh: number, W: number, H: number, panX: number, panY: number) {
  const target = W / H;
  if (sw / sh > target) {
    const width = sh * target;
    return { left: (sw - width) * panX, top: 0, width, height: sh };
  }
  const height = sw / target;
  return { left: 0, top: (sh - height) * panY, width: sw, height };
}

/** Draw one clip frame onto a black W×H canvas: fit / fill / blur + colour filter. */
export function drawClipFrame(ctx: Ctx, sample: VideoSample | null, clip: Clip, W: number, H: number) {
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (sample) {
    const filter = filterCss(clip.look);
    if (clip.fit === "blur") {
      // Background only when the shapes differ (else the video covers it all).
      if (Math.abs(sample.displayWidth / sample.displayHeight / (W / H) - 1) > 0.02) {
        // Blur a 1/10-size copy, then stretch it: ~100× less work than blurring
        // the full frame, which matters on cheap phones. Looks the same (soft).
        const small = smallCanvas(Math.max(8, Math.round(W / 10)), Math.max(8, Math.round(H / 10)));
        const sctx = small.getContext("2d") as Ctx | null;
        if (sctx) {
          sctx.filter = `blur(${Math.max(1, Math.round(Math.min(small.width, small.height) * 0.035))}px)`;
          sample.drawWithFit(sctx, { fit: "cover" });
          ctx.filter = `brightness(0.6) ${filter}`.trim();
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(small, 0, 0, W, H);
        }
      }
      ctx.filter = filter || "none";
      sample.drawWithFit(ctx, { fit: "contain" });
    } else if (clip.fit === "fill") {
      ctx.filter = filter || "none";
      sample.drawWithFit(ctx, {
        fit: "fill",
        crop: coverCrop(sample.displayWidth, sample.displayHeight, W, H, clip.panX, clip.panY),
      });
    } else {
      ctx.filter = filter || "none";
      sample.drawWithFit(ctx, { fit: "contain" });
    }
  }
  ctx.restore();
}

/** Mix two full frames (A = outgoing, B = incoming) for transition progress p (0..1). */
export function compositeTransition(
  ctx: Ctx,
  type: TransitionType,
  p: number,
  a: CanvasImageSource,
  b: CanvasImageSource,
  W: number,
  H: number,
) {
  const e = ease(p);
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  switch (type) {
    case "fade":
      ctx.drawImage(a, 0, 0);
      ctx.globalAlpha = e;
      ctx.drawImage(b, 0, 0);
      break;
    case "dip":
      ctx.globalAlpha = e < 0.5 ? 1 - e * 2 : e * 2 - 1;
      ctx.drawImage(e < 0.5 ? a : b, 0, 0);
      break;
    case "slide":
      ctx.drawImage(a, -e * W, 0);
      ctx.drawImage(b, (1 - e) * W, 0);
      break;
    case "zoom": {
      ctx.drawImage(b, 0, 0);
      const s = 1 + 0.25 * e;
      ctx.globalAlpha = 1 - e;
      ctx.drawImage(a, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
      break;
    }
    case "wipe":
      ctx.drawImage(a, 0, 0);
      ctx.beginPath();
      ctx.rect(0, 0, e * W, H);
      ctx.clip();
      ctx.drawImage(b, 0, 0);
      break;
    default:
      ctx.drawImage(e < 0.5 ? a : b, 0, 0);
  }
  ctx.restore();
}

/** The same transitions as CSS for the two preview <video> elements. */
export function transitionCss(type: TransitionType, p: number): { a: CSSProperties; b: CSSProperties } {
  const e = ease(p);
  switch (type) {
    case "fade":
      return { a: { zIndex: 1 }, b: { zIndex: 2, opacity: e } };
    case "dip":
      return { a: { zIndex: 1, opacity: e < 0.5 ? 1 - e * 2 : 0 }, b: { zIndex: 2, opacity: e < 0.5 ? 0 : e * 2 - 1 } };
    case "slide":
      return { a: { zIndex: 1, transform: `translateX(${-e * 100}%)` }, b: { zIndex: 2, transform: `translateX(${(1 - e) * 100}%)` } };
    case "zoom":
      return { a: { zIndex: 2, opacity: 1 - e, transform: `scale(${1 + 0.25 * e})` }, b: { zIndex: 1 } };
    case "wipe":
      return { a: { zIndex: 1 }, b: { zIndex: 2, clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` } };
    default:
      return { a: { zIndex: 1, opacity: e < 0.5 ? 1 : 0 }, b: { zIndex: 2, opacity: e < 0.5 ? 0 : 1 } };
  }
}

/** CSS that makes a <video> look like drawClipFrame (fit / fill + pan + filter). */
export function clipVideoCss(clip: Clip): CSSProperties {
  return {
    objectFit: clip.fit === "fill" ? "cover" : "contain",
    objectPosition: clip.fit === "fill" ? `${clip.panX * 100}% ${clip.panY * 100}%` : "50% 50%",
    filter: filterCss(clip.look) || undefined,
  };
}

let filterOk: boolean | null = null;
/** Whether canvas ctx.filter works here (Chrome/Edge/Firefox yes, older Safari no). */
export function canvasFilterSupported(): boolean {
  if (filterOk === null) {
    try {
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) return (filterOk = false);
      ctx.filter = "grayscale(1)";
      filterOk = ctx.filter === "grayscale(1)";
    } catch {
      filterOk = false;
    }
  }
  return filterOk;
}
