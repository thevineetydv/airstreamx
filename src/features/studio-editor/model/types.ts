// Core data types for the Studio Editor.
// All times are in seconds.

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
}

export interface EditorState {
  assets: Record<string, MediaAsset>;
  clips: Clip[];
  selectedClipId: string | null;
}

/** Shortest clip we allow after a trim or split. */
export const MIN_CLIP_DURATION = 0.2;
