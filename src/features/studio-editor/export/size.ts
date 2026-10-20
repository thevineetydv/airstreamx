// Output frame size. Kept separate from the export engine so the preview
// can match the export frame without loading encoder code.
import type { MediaAsset } from "../model/types";

export type ExportResolution = "720p" | "1080p";

/** Orientation follows the first clip (portrait phone videos stay portrait). */
export function outputSize(res: ExportResolution, first?: MediaAsset): { width: number; height: number } {
  const long = res === "1080p" ? 1920 : 1280;
  const short = res === "1080p" ? 1080 : 720;
  const portrait = !!first && first.height > first.width;
  return portrait ? { width: short, height: long } : { width: long, height: short };
}
