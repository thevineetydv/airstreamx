// Reads an imported file: duration, size, audio presence and a few
// thumbnail frames for the timeline. Runs fully in the browser.

import { BlobSource, CanvasSink, Input } from "mediabunny";
import { VIDEO_FORMATS } from "./formats";
import { newId } from "../model/timeline";
import type { MediaAsset, Thumb } from "../model/types";

const THUMB_COUNT = 10;
const THUMB_HEIGHT = 56;

export class ProbeError extends Error {}

async function canvasToUrl(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<string> {
  if ("toDataURL" in canvas) return canvas.toDataURL("image/jpeg", 0.6);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.6 });
  return URL.createObjectURL(blob);
}

/** `id` is passed when re-opening a draft, so clips keep pointing at the same asset. */
export async function probeFile(file: File, id?: string): Promise<MediaAsset> {
  const input = new Input({ source: new BlobSource(file), formats: VIDEO_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new ProbeError(`"${file.name}" has no video track or the format is not supported.`);
    if (!(await video.canDecode())) {
      throw new ProbeError(
        `This browser cannot decode "${file.name}" (codec: ${video.codec ?? "unknown"}). Try Chrome on Android/desktop.`,
      );
    }

    const audio = await input.getPrimaryAudioTrack().catch(() => null);
    const hasAudio = !!audio && (await audio.canDecode());
    const duration = await input.computeDuration();
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new ProbeError(`Could not read the length of "${file.name}".`);
    }

    // Thumbnails spread evenly across the file.
    const thumbs: Thumb[] = [];
    try {
      const sink = new CanvasSink(video, { height: THUMB_HEIGHT, fit: "contain" });
      const times = Array.from({ length: THUMB_COUNT }, (_, i) => (duration * (i + 0.5)) / THUMB_COUNT);
      let i = 0;
      for await (const wrapped of sink.canvasesAtTimestamps(times)) {
        const t = times[i++];
        if (wrapped) thumbs.push({ t, url: await canvasToUrl(wrapped.canvas) });
      }
    } catch {
      // Thumbnails are nice-to-have; the clip still works without them.
    }

    return {
      id: id ?? newId("asset"),
      file,
      url: URL.createObjectURL(file),
      name: file.name,
      duration,
      width: video.displayWidth,
      height: video.displayHeight,
      hasAudio,
      thumbs,
    };
  } finally {
    input.dispose();
  }
}
