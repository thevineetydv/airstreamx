// Draws picture / video layers onto the export canvas. The preview shows the
// same layers as positioned <img>/<video> elements, using the same rectangle maths.

import type { VideoSample } from "mediabunny";
import { animatedAt } from "../model/presets";
import { layerEnd, layerRect, type Layer, type MediaSize } from "../model/layers";
import { keyedImage } from "./chroma";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Corner radius used for "rounded" layers, as a fraction of the shorter side. */
export const LAYER_RADIUS = 0.06;

export function drawLayer(
  ctx: Ctx,
  layer: Layer,
  size: MediaSize,
  source: CanvasImageSource | VideoSample | null,
  t: number,
  W: number,
  H: number,
) {
  if (!source) return;
  const a = animatedAt(layer, t, layerEnd(layer));
  if (a.opacity <= 0) return;
  const r = layerRect(size, a.x, a.y, a.scale, W, H);
  ctx.save();
  ctx.globalAlpha = Math.min(1, a.opacity);
  if (layer.rounded) {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * LAYER_RADIUS);
    ctx.clip();
  }
  if (layer.chroma) {
    // Green screen: key a copy of the layer, then draw it.
    const keyed = keyedImage(r.w, r.h, layer.chroma, (c, w, h) => {
      if ("drawWithFit" in source) source.drawWithFit(c, { fit: "fill" });
      else c.drawImage(source, 0, 0, w, h);
    });
    if (keyed) ctx.drawImage(keyed, r.x, r.y, r.w, r.h);
  } else if ("drawWithFit" in source) {
    // A video frame: let mediabunny apply the file's rotation, scaled into the layer box.
    ctx.translate(r.x, r.y);
    ctx.scale(r.w / W, r.h / H);
    source.drawWithFit(ctx, { fit: "fill" });
  } else {
    ctx.drawImage(source, r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}
