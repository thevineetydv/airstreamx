// Browser-side export: decodes each clip with WebCodecs, draws frames to a
// canvas at the target size, re-encodes and writes an MP4.
// Nothing is sent to the server until the user chooses to upload.

import {
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type VideoCodec,
} from "mediabunny";
import { VIDEO_FORMATS } from "../media/formats";
import { outputSize, type ExportResolution } from "./size";
import { drawOverlaysAt } from "../render/drawOverlays";
import type { Overlay } from "../model/overlays";
import { clipDuration } from "../model/timeline";
import type { Clip, MediaAsset } from "../model/types";

export type { ExportResolution } from "./size";
export { outputSize } from "./size";

export const FPS = 30;
const SAMPLE_RATE = 48000;
const AUDIO_CHANNELS = 2;
/** Audio is rendered in windows of this size so RAM use stays small on phones. */
const AUDIO_WINDOW_SECONDS = 10;
const AUDIO_BITRATE = 128_000;

/** Target video bitrates. Fixed numbers so we can estimate file size up front. */
const VIDEO_BITRATE: Record<ExportResolution, number> = {
  "720p": 4_000_000,
  "1080p": 8_000_000,
};

export interface ExportPlan {
  width: number;
  height: number;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec | null;
}

export interface ExportResult {
  file: File;
  plan: ExportPlan;
  seconds: number;
}

export class ExportCancelled extends Error {}

/** Number of output frames for a clip. Audio uses the same length so A/V never drifts. */
function frameCount(clip: Clip): number {
  return Math.max(1, Math.round(clipDuration(clip) * FPS));
}

export function estimateBytes(clips: Clip[], res: ExportResolution): number {
  const seconds = clips.reduce((s, c) => s + frameCount(c) / FPS, 0);
  return Math.round(((VIDEO_BITRATE[res] + AUDIO_BITRATE) * seconds) / 8 * 1.03);
}

/** Pick the best codecs this browser can encode. H.264/AAC first (widest playback support). */
export async function planExport(res: ExportResolution, first?: MediaAsset): Promise<ExportPlan> {
  const { width, height } = outputSize(res, first);
  const videoCodec = await getFirstEncodableVideoCodec(["avc", "vp9", "av1"], {
    width,
    height,
    bitrate: VIDEO_BITRATE[res],
  });
  if (!videoCodec) {
    throw new Error(`This browser cannot encode ${res} video. Try 720p or use Chrome.`);
  }
  const audioCodec = await getFirstEncodableAudioCodec(["aac", "opus"], {
    numberOfChannels: AUDIO_CHANNELS,
    sampleRate: SAMPLE_RATE,
    bitrate: AUDIO_BITRATE,
  });
  return { width, height, videoCodec, audioCodec };
}

interface RunOptions {
  clips: Clip[];
  overlays: Overlay[];
  assets: Record<string, MediaAsset>;
  resolution: ExportResolution;
  /** 0..1 */
  onProgress: (p: number) => void;
  signal: AbortSignal;
}

function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new ExportCancelled("Export cancelled");
}

export async function runExport({ clips, overlays, assets, resolution, onProgress, signal }: RunOptions): Promise<ExportResult> {
  if (clips.length === 0) throw new Error("Timeline is empty.");
  const started = performance.now();
  const plan = await planExport(resolution, assets[clips[0].assetId]);
  const { width, height } = plan;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas is not available.");

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, {
    codec: plan.videoCodec,
    bitrate: VIDEO_BITRATE[resolution],
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });

  const audioSource = plan.audioCodec
    ? new AudioBufferSource({ codec: plan.audioCodec, bitrate: AUDIO_BITRATE })
    : null;
  if (audioSource) output.addAudioTrack(audioSource);

  // One Input per asset, shared by the video and audio passes.
  const inputs = new Map<string, Input>();
  const inputFor = (asset: MediaAsset) => {
    let input = inputs.get(asset.id);
    if (!input) {
      input = new Input({ source: new BlobSource(asset.file), formats: VIDEO_FORMATS });
      inputs.set(asset.id, input);
    }
    return input;
  };

  const totalFrames = clips.reduce((s, c) => s + frameCount(c), 0);
  let framesDone = 0;

  const videoPass = async () => {
    let outFrame = 0;
    for (const clip of clips) {
      const asset = assets[clip.assetId];
      const track = await inputFor(asset).getPrimaryVideoTrack();
      if (!track) throw new Error(`No video track in ${asset.name}`);
      const sink = new VideoSampleSink(track);
      const n = frameCount(clip);
      // One source timestamp per output frame -> constant 30 fps output,
      // even for variable frame rate phone recordings.
      const times = Array.from({ length: n }, (_, k) => clip.inPoint + k / FPS);
      for await (const sample of sink.samplesAtTimestamps(times)) {
        checkAbort(signal);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
        if (sample) {
          sample.drawWithFit(ctx, { fit: "contain" });
          sample.close();
        }
        // Text, stickers, area tag and deal banner on top of the frame.
        drawOverlaysAt(ctx, overlays, outFrame / FPS, width, height);
        await videoSource.add(outFrame / FPS, 1 / FPS);
        outFrame++;
        framesDone++;
        onProgress(framesDone / totalFrames);
      }
    }
    videoSource.close();
  };

  const audioPass = async () => {
    if (!audioSource) return;
    for (const clip of clips) {
      const asset = assets[clip.assetId];
      const clipFrames = Math.round((frameCount(clip) / FPS) * SAMPLE_RATE);
      const track = asset.hasAudio ? await inputFor(asset).getPrimaryAudioTrack() : null;
      const sink = track ? new AudioBufferSink(track) : null;

      // Render the clip's audio window by window. OfflineAudioContext does the
      // resampling (e.g. 44.1k -> 48k) and mono -> stereo mixing for us.
      for (let startFrame = 0; startFrame < clipFrames; startFrame += AUDIO_WINDOW_SECONDS * SAMPLE_RATE) {
        checkAbort(signal);
        const length = Math.min(AUDIO_WINDOW_SECONDS * SAMPLE_RATE, clipFrames - startFrame);
        const winStart = clip.inPoint + startFrame / SAMPLE_RATE;
        const winEnd = winStart + length / SAMPLE_RATE;
        const offline = new OfflineAudioContext(AUDIO_CHANNELS, length, SAMPLE_RATE);
        if (sink) {
          // Start a little early so a buffer that overlaps the window edge is included.
          for await (const wrapped of sink.buffers(Math.max(0, winStart - 0.5), winEnd)) {
            const node = offline.createBufferSource();
            node.buffer = wrapped.buffer;
            node.connect(offline.destination);
            const at = wrapped.timestamp - winStart;
            if (at >= 0) node.start(at);
            else if (-at < wrapped.duration) node.start(0, -at);
          }
        }
        // Without a sink this renders silence, keeping the audio track the same length as video.
        const rendered = await offline.startRendering();
        await audioSource.add(rendered);
      }
    }
    audioSource.close();
  };

  try {
    await output.start();
    // Run both passes together so the muxer can interleave audio and video.
    await Promise.all([videoPass(), audioPass()]);
    checkAbort(signal);
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => undefined);
    throw err;
  } finally {
    inputs.forEach((i) => i.dispose());
  }

  const buffer = output.target.buffer;
  if (!buffer) throw new Error("Export produced no data.");
  // Friendly name: the upload modal turns it into the default title ("Studio edit 19 Oct 2026").
  const day = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const file = new File([buffer], `Studio edit - ${day}.mp4`, { type: "video/mp4" });
  onProgress(1);
  return { file, plan, seconds: (performance.now() - started) / 1000 };
}
