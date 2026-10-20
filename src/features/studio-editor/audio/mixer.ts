// Mixes the timeline's audio in short windows with OfflineAudioContext:
// original clip sound + background music + voice-overs.
// Used by the export (48 kHz stereo, with music) and by captions
// (16 kHz mono, without music, so speech recognition hears only voices).

import { AudioBufferSink, BlobSource, Input } from "mediabunny";
import { VIDEO_FORMATS } from "../media/formats";
import { applyEnvelope, musicEnvelope, originalGain, voiceOverEnd, type AudioSettings } from "../model/audio";
import type { Clip, MediaAsset } from "../model/types";
import { FPS, frameCount, outputTimeline } from "../export/timing";
import { loadTrackBuffer } from "./library";

export interface MixOptions {
  clips: Clip[];
  assets: Record<string, MediaAsset>;
  audio: AudioSettings;
  sampleRate: number;
  channels: number;
  includeMusic: boolean;
  /** Seconds per window; smaller = less RAM. */
  windowSeconds?: number;
  /** Optional shared inputs (the export already has them open). */
  inputFor?: (asset: MediaAsset) => Input;
  signal?: AbortSignal;
  /** Called with each mixed window, in order. Await-able for backpressure. */
  onWindow: (buffer: AudioBuffer, startTime: number) => Promise<void> | void;
}

export class MixCancelled extends Error {}

export async function mixTimeline(o: MixOptions): Promise<void> {
  const { clips, assets, audio, sampleRate, channels } = o;
  const { starts, total } = outputTimeline(clips);
  const windowSamples = Math.round((o.windowSeconds ?? 10) * sampleRate);
  const totalSamples = Math.round(total * sampleRate);

  // Own inputs if the caller did not pass shared ones.
  const ownInputs = new Map<string, Input>();
  const inputFor = o.inputFor ?? ((asset: MediaAsset) => {
    let input = ownInputs.get(asset.id);
    if (!input) {
      input = new Input({ source: new BlobSource(asset.file), formats: VIDEO_FORMATS });
      ownInputs.set(asset.id, input);
    }
    return input;
  });

  const sinks = new Map<string, AudioBufferSink | null>();
  const sinkFor = async (asset: MediaAsset) => {
    if (!sinks.has(asset.id)) {
      const track = asset.hasAudio ? await inputFor(asset).getPrimaryAudioTrack() : null;
      sinks.set(asset.id, track ? new AudioBufferSink(track) : null);
    }
    return sinks.get(asset.id) ?? null;
  };

  const musicBuffer = o.includeMusic && audio.music
    ? await loadTrackBuffer(audio.music.track, new OfflineAudioContext(channels, 1, sampleRate))
    : null;
  const envelope = musicEnvelope(audio, total);
  const origGain = originalGain(audio);

  try {
    for (let s0 = 0; s0 < totalSamples; s0 += windowSamples) {
      if (o.signal?.aborted) throw new MixCancelled("Cancelled");
      const length = Math.min(windowSamples, totalSamples - s0);
      const T0 = s0 / sampleRate;
      const T1 = T0 + length / sampleRate;
      const ctx = new OfflineAudioContext(channels, length, sampleRate);

      // 1) Original sound of each clip that overlaps this window.
      if (origGain > 0) {
        const gain = ctx.createGain();
        gain.gain.value = origGain;
        gain.connect(ctx.destination);
        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i];
          const cs = starts[i];
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
            const node = ctx.createBufferSource();
            node.buffer = wrapped.buffer;
            node.connect(gain);
            node.start(cs + (from - clip.inPoint) - T0, from - wrapped.timestamp, to - from);
          }
        }
      }

      // 2) Background music, looped, with fade-out and ducking.
      if (musicBuffer) {
        const gain = ctx.createGain();
        applyEnvelope(gain.gain, envelope, 0, T0, T1);
        gain.connect(ctx.destination);
        const node = ctx.createBufferSource();
        node.buffer = musicBuffer;
        node.loop = true;
        node.connect(gain);
        node.start(0, T0 % musicBuffer.duration);
      }

      // 3) Voice-overs.
      for (const v of audio.voiceOvers) {
        const a = Math.max(T0, v.start);
        const b = Math.min(T1, voiceOverEnd(v), total);
        if (b <= a) continue;
        const gain = ctx.createGain();
        gain.gain.value = v.volume;
        gain.connect(ctx.destination);
        const node = ctx.createBufferSource();
        node.buffer = v.buffer;
        node.connect(gain);
        node.start(a - T0, a - v.start, b - a);
      }

      await o.onWindow(await ctx.startRendering(), T0);
    }
  } finally {
    ownInputs.forEach((i) => i.dispose());
  }
}
