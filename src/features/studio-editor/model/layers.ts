// Layers: extra videos or pictures on top of the main video (picture-in-picture,
// a logo, a product photo). Each layer has its own timing, position, size,
// opacity and (for videos) volume, and can be animated with keyframes.
// Draw order: main clips → layers (in list order) → text / stickers.

import type { Keyframe } from "./keyframes";
import type { Animations } from "./presets";
import { newId } from "./timeline";
import type { ChromaKey } from "../render/chroma";

export interface ImageAsset {
  id: string;
  file: File;
  /** Object URL for the preview <img>. */
  url: string;
  name: string;
  width: number;
  height: number;
}

interface LayerBase {
  id: string;
  /** Timeline time where the layer appears. */
  start: number;
  /** Centre position, 0..1 of the frame. */
  x: number;
  y: number;
  /** Layer width as a fraction of the frame width. */
  scale: number;
  opacity: number;
  /** Rounded corners (nice for picture-in-picture). */
  rounded: boolean;
  keyframes?: Keyframe[];
  /** Ready-made in / out / loop animations (Phase 7). */
  anim?: Animations;
  /** Green screen: remove this colour (Phase 11). */
  chroma?: ChromaKey;
  /** Brand logo layer (added from the brand kit). */
  brand?: boolean;
}

export interface VideoLayer extends LayerBase {
  kind: "video";
  assetId: string;
  /** Part of the source video that is used (seconds in the file). */
  inPoint: number;
  outPoint: number;
  volume: number;
}

export interface ImageLayer extends LayerBase {
  kind: "image";
  imageId: string;
  /** Timeline time where the layer disappears. */
  end: number;
}

export type Layer = VideoLayer | ImageLayer;

export type LayerPatch = Partial<Omit<VideoLayer, "id" | "kind" | "assetId">> & Partial<Omit<ImageLayer, "id" | "kind" | "imageId">>;

/** At most this many video layers: each one is an extra decoder on the phone. */
export const MAX_VIDEO_LAYERS = 2;
export const MIN_LAYER = 0.3;
export const MIN_LAYER_SCALE = 0.1;
export const MAX_LAYER_SCALE = 1;

export function layerEnd(l: Layer): number {
  return l.kind === "video" ? l.start + (l.outPoint - l.inPoint) : l.end;
}

export function layerActive(l: Layer, t: number): boolean {
  return t >= l.start && t < layerEnd(l);
}

/** Size of the layer's media (display pixels). */
export interface MediaSize { width: number; height: number }

/** Where the layer is drawn on a W×H frame (top-left + size), for given animated values. */
export function layerRect(size: MediaSize, x: number, y: number, scale: number, W: number, H: number) {
  const w = scale * W;
  const h = w * (size.height / Math.max(1, size.width));
  return { x: x * W - w / 2, y: y * H - h / 2, w, h };
}

const base = (start: number) => ({ id: newId("layer"), start, x: 0.72, y: 0.3, scale: 0.4, opacity: 1, rounded: true });

export function newVideoLayer(assetId: string, assetDuration: number, playhead: number, total: number): VideoLayer {
  const start = Math.min(playhead, Math.max(0, total - MIN_LAYER));
  const length = Math.max(MIN_LAYER, Math.min(assetDuration, total - start));
  return { ...base(start), kind: "video", assetId, inPoint: 0, outPoint: length, volume: 1 };
}

export function newImageLayer(imageId: string, playhead: number, total: number): ImageLayer {
  const start = Math.min(playhead, Math.max(0, total - MIN_LAYER));
  return { ...base(start), kind: "image", imageId, end: Math.min(total, start + 5) };
}

/** Read a picture file: size + object URL. */
export async function loadImage(file: File, id = newId("img")): Promise<ImageAsset> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { id, file, url, name: file.name, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(`"${file.name}" is not a picture this browser can open.`);
  }
}
