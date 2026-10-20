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
import { applyEnvelope, musicEnvelope, originalGain, voiceOverEnd, type AudioSettings } from "../model/audio";
import { loadTrackBuffer } from "../audio/library";
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
  audio: AudioSettings;
  assets: Record<string, MediaAsset>;
  resolution: ExportResolution;
  /** 0..1 */
  onProgress: (p: number) => void;
  signal: AbortSignal;
}

function checkAbort(signal: AbortSignal) {
  if (signal.aborted) throw new ExportCancelled("Export cancelled");
}

export async function runExport({ clips, overlays, audio, assets, resolution, onProgress, signal }: RunOptions): Promise<ExportResult> {
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

  // Timeline start of each clip in the OUTPUT (whole frames), so audio lines up with video exactly.
  const outStarts: number[] = [];
  {
    let f = 0;
    for (const c of clips) { outStarts.push(f / FPS); f += frameCount(c); }
  }
  const totalSeconds = totalFrames / FPS;

  // Background music must be decoded before mixing starts.
  const musicBuffer = audio.music && audioSource
    ? await loadTrackBuffer(audio.music.track, new OfflineAudioContext(AUDIO_CHANNELS, 1, SAMPLE_RATE))
    : null;
  const envelope = musicEnvelope(audio, totalSeconds);
  const origGain = originalGain(audio);

  // One audio sink per asset, created on first use.
  const sinks = new Map<string, AudioBufferSink | null>();
  const sinkFor = async (asset: MediaAsset) => {
    if (!sinks.has(asset.id)) {
      const track = asset.hasAudio ? await inputFor(asset).getPrimaryAudioTrack() : null;
      sinks.set(asset.id, track ? new AudioBufferSink(track) : null);
    }
    return sinks.get(asset.id) ?? null;
  };

  // Mix the whole timeline in 10 s windows: original clip sound + music + voice-overs.
  // OfflineAudioContext also resamples (44.1k -> 48k) and up-mixes mono to stereo.
  const audioPass = async () => {
    if (!audioSource) return;
    const totalSamples = Math.round(totalSeconds * SAMPLE_RATE);
    const windowSamples = AUDIO_WINDOW_SECONDS * SAMPLE_RATE;

    for (let s0 = 0; s0 < totalSamples; s0 += windowSamples) {
      checkAbort(signal);
      const length = Math.min(windowSamples, totalSamples - s0);
      const T0 = s0 / SAMPLE_RATE;
      const T1 = T0 + length / SAMPLE_RATE;
      const offline = new OfflineAudioContext(AUDIO_CHANNELS, length, SAMPLE_RATE);

      // 1) Original sound of each clip that overlaps this window.
      if (origGain > 0) {
        const gain = offline.createGain();
        gain.gain.value = origGain;
        gain.connect(offline.destination);
        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i];
          const cs = outStarts[i];
          const ce = cs + frameCount(clip) / FPS;
          const a = Math.max(T0, cs);
          const b = Math.min(T1, ce);
          if (b <= a) continue;
          const sink = await sinkFor(assets[clip.assetId]);
          if (!sink) continue;
          const srcA = clip.inPoint + (a - cs);
          const srcB = srcA + (b - a);
          // Start a little early so a buffer that overlaps the edge is included.
          for await (const wrapped of sink.buffers(Math.max(0, srcA - 0.5), srcB)) {
            // Play only the part inside this clip and window, so no sound leaks across a cut.
            const from = Math.max(wrapped.timestamp, srcA);
            const to = Math.min(wrapped.timestamp + wrapped.duration, srcB);
            if (to <= from) continue;
            const node = offline.createBufferSource();
            node.buffer = wrapped.buffer;
            node.connect(gain);
            node.start(cs + (from - clip.inPoint) - T0, from - wrapped.timestamp, to - from);
          }
        }
      }

      // 2) Background music, looped, with fade-out and ducking.
      if (musicBuffer) {
        const gain = offline.createGain();
        applyEnvelope(gain.gain, envelope, 0, T0, T1);
        gain.connect(offline.destination);
        const node = offline.createBufferSource();
        node.buffer = musicBuffer;
        node.loop = true;
        node.connect(gain);
        node.start(0, T0 % musicBuffer.duration);
      }

      // 3) Voice-overs.
      for (const v of audio.voiceOvers) {
        const a = Math.max(T0, v.start);
        const b = Math.min(T1, voiceOverEnd(v), totalSeconds);
        if (b <= a) continue;
        const gain = offline.createGain();
        gain.gain.value = v.volume;
        gain.connect(offline.destination);
        const node = offline.createBufferSource();
        node.buffer = v.buffer;
        node.connect(gain);
        node.start(a - T0, a - v.start, b - a);
      }

      const rendered = await offline.startRendering();
      await audioSource.add(rendered);
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
