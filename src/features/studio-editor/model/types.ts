// Core data types for the Studio Editor.
// All times are in seconds.

import type { Overlay } from "./overlays";
import type { AudioSettings } from "./audio";
import type { AspectRatio, ClipLook, FitMode, Transition } from "./look";

/** A small preview frame taken from the source file at a given source time. */
export interface Thumb {
  t: number;
  url: string;
}

/** An imported source file. Never changed after import. */
export interface MediaAsset {
  id: string;
  file: File;
  /** Object URL used by the preview <video>. Revoked when the editor closes. */
  url: string;
  name: string;
  duration: number;
  /** Display size (rotation already applied). */
  width: number;
  height: number;
  hasAudio: boolean;
  thumbs: Thumb[];
}

/**
 * A piece of an asset placed on the timeline.
 * inPoint/outPoint are SOURCE times inside the asset.
 * Clips sit back-to-back, so the timeline position is derived from the order.
 */
export interface Clip {
  id: string;
  assetId: string;
  inPoint: number;
  outPoint: number;
  /** Playback speed, 0.5–2. Timeline length = (outPoint - inPoint) / speed. */
  speed: number;
  look: ClipLook;
  fit: FitMode;
  /** Crop position for "fill", 0..1 (0.5 = centre). */
  panX: number;
  panY: number;
  /** Transition from this clip into the next one. */
  transitionOut: Transition | null;
}

export interface EditorState {
  assets: Record<string, MediaAsset>;
  clips: Clip[];
  selectedClipId: string | null;
  /** Text, stickers, area tag, deal banner. Drawn in array order (last = on top). */
  overlays: Overlay[];
  selectedOverlayId: string | null;
  /** Original sound, background music, voice-overs. */
  audio: AudioSettings;
  /** Shape of the exported video. "auto" follows the first clip. */
  aspect: AspectRatio;
}

/** Shortest clip we allow after a trim or split. */
export const MIN_CLIP_DURATION = 0.2;
