// Output frame grid shared by video export and audio mixing,
// so everything lines up to the same 30 fps timeline.
import { clipDuration } from "../model/timeline";
import type { Clip } from "../model/types";

export const FPS = 30;

/** Number of output frames for a clip. Audio uses the same length so A/V never drifts. */
export function frameCount(clip: Clip): number {
  return Math.max(1, Math.round(clipDuration(clip) * FPS));
}

/** Output start time of each clip (whole frames) and the total output length. */
export function outputTimeline(clips: Clip[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let f = 0;
  for (const c of clips) {
    starts.push(f / FPS);
    f += frameCount(c);
  }
  return { starts, total: f / FPS };
}
