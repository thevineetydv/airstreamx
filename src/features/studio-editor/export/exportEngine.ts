// Browser-side export: decodes each clip with WebCodecs, draws frames to a
// canvas at the target size, re-encodes and writes an MP4.
// Nothing is sent to the server until the user chooses to upload.

import {
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  TextSubtitleSource,
  VideoSampleSink,
  type VideoSample,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type VideoCodec,
} from "mediabunny";
import { VIDEO_FORMATS } from "../media/formats";
import { outputSize, type ExportResolution } from "./size";
import { drawOverlaysAt } from "../render/drawOverlays";
import type { Overlay } from "../model/overlays";
import type { AudioSettings } from "../model/audio";
import { LANGUAGE_CODE, toSrt, toVtt, type CaptionSettings } from "../model/captions";
import { drawCaptionAt } from "../render/drawCaptions";
import { MixCancelled, mixTimeline } from "../audio/mixer";
import type { Clip, MediaAsset } from "../model/types";
import { FPS, frameCount, outputTimeline } from "./timing";
import { frameLayers, type FrameLayers } from "../model/timeline";
import type { AspectRatio } from "../model/look";
import { compositeTransition, drawClipFrame } from "../render/drawClip";

export type { ExportResolution } from "./size";
export { outputSize } from "./size";

export { FPS } from "./timing";
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
  /** Captions as a SubRip file, when "Subtitle track" is on. */
  srt: File | null;
  plan: ExportPlan;
  seconds: number;
}

export class ExportCancelled extends Error {}

export function estimateBytes(clips: Clip[], res: ExportResolution, aspect: AspectRatio = "auto"): number {
  const seconds = clips.reduce((s, c) => s + frameCount(c) / FPS, 0);
  // Square video has fewer pixels, so it gets a proportionally lower bitrate.
  const bitrate = aspect === "1:1" ? VIDEO_BITRATE[res] * 0.6 : VIDEO_BITRATE[res];
  return Math.round(((bitrate + AUDIO_BITRATE) * seconds) / 8 * 1.03);
}

/** Pick the best codecs this browser can encode. H.264/AAC first (widest playback support). */
export async function planExport(res: ExportResolution, aspect: AspectRatio, first?: MediaAsset): Promise<ExportPlan> {
  const { width, height } = outputSize(res, aspect, first);
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
  audio: AudioSettings;
  captions: CaptionSettings;
  assets: Record<string, MediaAsset>;
  resolution: ExportResolution;
  aspect: AspectRatio;
  /** 0..1 */
  onProgress: (p: number) => void;
  signal: AbortSignal;
}

function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new ExportCancelled("Export cancelled");
}

export async function runExport({ clips, overlays, audio, captions, assets, resolution, aspect, onProgress, signal }: RunOptions): Promise<ExportResult> {
  if (clips.length === 0) throw new Error("Timeline is empty.");
  const started = performance.now();
  const plan = await planExport(resolution, aspect, assets[clips[0].assetId]);
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
    bitrate: aspect === "1:1" ? VIDEO_BITRATE[resolution] * 0.6 : VIDEO_BITRATE[resolution],
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });

  const audioSource = plan.audioCodec
    ? new AudioBufferSource({ codec: plan.audioCodec, bitrate: AUDIO_BITRATE })
    : null;
  if (audioSource) output.addAudioTrack(audioSource);

  // Captions: burned into pixels and/or a soft subtitle track (WebVTT) in the MP4.
  const hasCaptions = captions.items.some((c) => c.text.trim());
  const burnCaptions = hasCaptions && captions.burnIn;
  const subtitleSource = hasCaptions && captions.subtitleTrack ? new TextSubtitleSource("webvtt") : null;
  if (subtitleSource) {
    output.addSubtitleTrack(subtitleSource, {
      languageCode: LANGUAGE_CODE[captions.language],
      name: captions.language === "hindi" ? "Hindi" : "English",
    });
  }

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

  // 1) Plan: for every output frame, which clip(s) and which source time.
  //    During a transition two clips are drawn and mixed.
  const { starts } = outputTimeline(clips);
  const ends = clips.map((c, i) => starts[i] + frameCount(c) / FPS);
  const plans: FrameLayers[] = [];
  const wanted: number[][] = clips.map(() => []);
  const clampSrc = (k: number, src: number) =>
    // Past the end of the file -> hold the last frame; before the start -> hold the first.
    Math.min(Math.max(0, src), Math.max(0, assets[clips[k].assetId].duration - 0.5 / FPS));
  for (let f = 0; f < totalFrames; f++) {
    const L = frameLayers(clips, f / FPS, starts, ends)!;
    L.a.source = clampSrc(L.a.index, L.a.source);
    wanted[L.a.index].push(L.a.source);
    if (L.b) {
      L.b.source = clampSrc(L.b.index, L.b.source);
      wanted[L.b.index].push(L.b.source);
    }
    plans.push(L);
  }

  // 2) One frame stream per clip, opened when first needed and closed when done,
  //    so at most two decoders run at once (only during a transition).
  const streams = new Map<number, AsyncGenerator<VideoSample | null, void, unknown>>();
  const left = wanted.map((w) => w.length);
  const nextFrame = async (k: number): Promise<VideoSample | null> => {
    let it = streams.get(k);
    if (!it) {
      const asset = assets[clips[k].assetId];
      const track = await inputFor(asset).getPrimaryVideoTrack();
      if (!track) throw new Error(`No video track in ${asset.name}`);
      // One source timestamp per output frame -> constant 30 fps, even for variable frame rate phone videos.
      it = new VideoSampleSink(track).samplesAtTimestamps(wanted[k]);
      streams.set(k, it);
    }
    const r = await it.next();
    if (--left[k] === 0) {
      await it.return(undefined);
      streams.delete(k);
    }
    return r.done ? null : r.value;
  };

  // Scratch canvases for the two sides of a transition.
  const makeLayer = () => {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    return { canvas: c, ctx: c.getContext("2d", { alpha: false })! };
  };
  let layerA: ReturnType<typeof makeLayer> | null = null;
  let layerB: ReturnType<typeof makeLayer> | null = null;

  const videoPass = async () => {
    try {
      for (let f = 0; f < totalFrames; f++) {
        checkAbort(signal);
        const L = plans[f];
        if (!L.b) {
          const s = await nextFrame(L.a.index);
          drawClipFrame(ctx, s, clips[L.a.index], width, height);
          s?.close();
        } else {
          layerA ??= makeLayer();
          layerB ??= makeLayer();
          const sa = await nextFrame(L.a.index);
          const sb = await nextFrame(L.b.index);
          drawClipFrame(layerA.ctx, sa, clips[L.a.index], width, height);
          drawClipFrame(layerB.ctx, sb, clips[L.b.index], width, height);
          sa?.close();
          sb?.close();
          compositeTransition(ctx, L.type, L.p, layerA.canvas, layerB.canvas, width, height);
        }
        // Text, stickers, area tag and deal banner on top of the frame.
        drawOverlaysAt(ctx, overlays, f / FPS, width, height);
        if (burnCaptions) drawCaptionAt(ctx, captions, f / FPS, width, height);
        await videoSource.add(f / FPS, 1 / FPS);
        framesDone++;
        onProgress(framesDone / totalFrames);
      }
    } finally {
      for (const it of streams.values()) await it.return(undefined).catch(() => undefined);
    }
    videoSource.close();
  };

  // Original sound + music + voice-overs, mixed in 10 s windows (see audio/mixer.ts).
  const audioPass = async () => {
    if (!audioSource) return;
    try {
      await mixTimeline({
        clips, assets, audio,
        sampleRate: SAMPLE_RATE,
        channels: AUDIO_CHANNELS,
        includeMusic: true,
        windowSeconds: AUDIO_WINDOW_SECONDS,
        inputFor,
        signal,
        onWindow: (buffer) => audioSource.add(buffer),
      });
    } catch (err) {
      if (err instanceof MixCancelled) throw new ExportCancelled("Export cancelled");
      throw err;
    }
    checkAbort(signal);
    audioSource.close();
  };

  try {
    await output.start();
    // Run both passes together so the muxer can interleave audio and video.
    if (subtitleSource) {
      await subtitleSource.add(toVtt(captions.items));
      subtitleSource.close();
    }
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
  const srt = subtitleSource
    ? new File([toSrt(captions.items)], file.name.replace(/\.mp4$/, ".srt"), { type: "application/x-subrip" })
    : null;
  onProgress(1);
  return { file, srt, plan, seconds: (performance.now() - started) / 1000 };
}
