// Output frame size. Kept separate from the export engine so the preview
// can match the export frame without loading encoder code.
import type { AspectRatio } from "../model/look";
import type { MediaAsset } from "../model/types";

export type ExportResolution = "720p" | "1080p";

/**
 * Output size for a resolution and canvas shape.
 * "auto" follows the first clip (portrait phone videos stay portrait).
 */
export function outputSize(res: ExportResolution, aspect: AspectRatio, first?: MediaAsset): { width: number; height: number } {
  const long = res === "1080p" ? 1920 : 1280;
  const short = res === "1080p" ? 1080 : 720;
  const shape = aspect === "auto" ? (first && first.height > first.width ? "9:16" : "16:9") : aspect;
  if (shape === "1:1") return { width: short, height: short };
  return shape === "9:16" ? { width: short, height: long } : { width: long, height: short };
}
