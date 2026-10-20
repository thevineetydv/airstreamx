// Generates captions: mixes the timeline's speech audio (no music) at 16 kHz,
// cuts it into ≤30 s windows at quiet moments, and sends each window to the
// Whisper worker. Reports progress for the download and the listening part.

import { useCallback, useEffect, useRef, useState } from "react";
import { mixTimeline, MixCancelled } from "../audio/mixer";
import type { AudioSettings } from "../model/audio";
import type { CaptionLanguage, SpeechChunk } from "../model/captions";
import type { Clip, MediaAsset } from "../model/types";
import { outputTimeline } from "../export/timing";
import type { WorkerIn, WorkerOut } from "./asr.worker";

export const ASR_MODELS = [
  { id: "Xenova/whisper-tiny", label: "Fast", size: "~40 MB", note: "Quick, weaker Hindi" },
  { id: "Xenova/whisper-base", label: "Balanced", size: "~80 MB", note: "Good default" },
  { id: "Xenova/whisper-small", label: "Accurate", size: "~250 MB", note: "Best Hindi, slow on phones" },
] as const;
export type AsrModelId = (typeof ASR_MODELS)[number]["id"];

const SR = 16000;
const MAX_WINDOW = 30; // Whisper listens to 30 s at a time

export type CaptionJob =
  | { stage: "idle" }
  | { stage: "mixing"; progress: number }
  | { stage: "download"; progress: number; loaded: number; total: number }
  | { stage: "listening"; progress: number }
  | { stage: "error"; message: string };

/** Cut points (sample indexes) near every ~28 s, placed at the quietest 100 ms. */
export function quietCuts(samples: Float32Array, sr = SR): number[] {
  const cuts = [0];
  const frame = Math.round(sr * 0.1);
  while (samples.length - cuts[cuts.length - 1] > MAX_WINDOW * sr) {
    const base = cuts[cuts.length - 1];
    let best = base + 28 * sr;
    let bestRms = Infinity;
    for (let s = base + 20 * sr; s + frame <= base + MAX_WINDOW * sr; s += frame) {
      let sum = 0;
      for (let i = s; i < s + frame; i++) sum += samples[i] * samples[i];
      if (sum < bestRms) { bestRms = sum; best = s + Math.round(frame / 2); }
    }
    cuts.push(best);
  }
  cuts.push(samples.length);
  return cuts;
}

export function useCaptionGenerator() {
  const [job, setJob] = useState<CaptionJob>({ stage: "idle" });
  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const jobIdRef = useRef(0);

  const getWorker = () => {
    workerRef.current ??= new Worker(new URL("./asr.worker.ts", import.meta.url), { type: "module" });
    return workerRef.current;
  };

  // The worker keeps the model in memory between runs; stop it when the editor closes.
  useEffect(() => () => {
    abortRef.current?.abort();
    workerRef.current?.terminate();
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    // Whisper cannot be interrupted mid-window; restarting the worker is the only clean stop.
    workerRef.current?.terminate();
    workerRef.current = null;
    setJob({ stage: "idle" });
  }, []);

  const generate = useCallback(async (opts: {
    clips: Clip[];
    assets: Record<string, MediaAsset>;
    audio: AudioSettings;
    model: AsrModelId;
    language: CaptionLanguage;
  }): Promise<SpeechChunk[] | null> => {
    const controller = new AbortController();
    abortRef.current = controller;
    const { total } = outputTimeline(opts.clips);

    try {
      // 1) Mix speech audio (original + voice-overs, no music) at 16 kHz mono.
      setJob({ stage: "mixing", progress: 0 });
      const samples = new Float32Array(Math.round(total * SR));
      let filled = 0;
      await mixTimeline({
        clips: opts.clips,
        assets: opts.assets,
        audio: opts.audio,
        sampleRate: SR,
        channels: 1,
        includeMusic: false,
        windowSeconds: 30,
        signal: controller.signal,
        onWindow: (buf) => {
          samples.set(buf.getChannelData(0).subarray(0, samples.length - filled), filled);
          filled += buf.length;
          setJob({ stage: "mixing", progress: Math.min(1, filled / samples.length) });
        },
      });

      // Nothing audible -> nothing to transcribe.
      let peak = 0;
      for (let i = 0; i < samples.length; i += 64) peak = Math.max(peak, Math.abs(samples[i]));
      if (peak < 0.003) {
        setJob({ stage: "error", message: "No speech found. Is the original sound muted?" });
        return null;
      }

      // 2) Transcribe window by window.
      const cuts = quietCuts(samples);
      const worker = getWorker();
      const chunks: SpeechChunk[] = [];
      for (let w = 0; w < cuts.length - 1; w++) {
        if (controller.signal.aborted) return null;
        const offset = cuts[w] / SR;
        const piece = samples.slice(cuts[w], cuts[w + 1]);
        const jobId = ++jobIdRef.current;
        const result = await new Promise<WorkerOut & { type: "chunks" }>((resolve, reject) => {
          const onMsg = (e: MessageEvent<WorkerOut>) => {
            const m = e.data;
            if (m.type === "download") setJob({ stage: "download", progress: m.progress / 100, loaded: m.loaded, total: m.total });
            else if (m.type === "ready") setJob({ stage: "listening", progress: w / (cuts.length - 1) });
            else if (m.type === "chunks" && m.jobId === jobId) { cleanup(); resolve(m); }
            else if (m.type === "error" && m.jobId === jobId) { cleanup(); reject(new Error(m.message)); }
          };
          const onErr = (e: ErrorEvent) => { cleanup(); reject(new Error(e.message || "Speech recognition failed to start")); };
          const onAbort = () => { cleanup(); reject(new MixCancelled("Cancelled")); };
          const cleanup = () => {
            worker.removeEventListener("message", onMsg);
            worker.removeEventListener("error", onErr);
            controller.signal.removeEventListener("abort", onAbort);
          };
          worker.addEventListener("message", onMsg);
          worker.addEventListener("error", onErr);
          controller.signal.addEventListener("abort", onAbort);
          const msg: WorkerIn = { type: "transcribe", jobId, model: opts.model, language: opts.language, audio: piece };
          worker.postMessage(msg, [piece.buffer]);
        });
        for (const c of result.chunks) {
          chunks.push({ start: offset + c.start, end: c.end == null ? cuts[w + 1] / SR : offset + c.end, text: c.text });
        }
        setJob({ stage: "listening", progress: (w + 1) / (cuts.length - 1) });
      }
      setJob({ stage: "idle" });
      return chunks;
    } catch (err) {
      if (err instanceof MixCancelled || controller.signal.aborted) {
        setJob({ stage: "idle" });
        return null;
      }
      const message = err instanceof Error ? err.message : String(err);
      setJob({
        stage: "error",
        message: /fetch|network|load/i.test(message)
          ? "Could not download the speech model. Check your internet and try again."
          : message,
      });
      return null;
    }
  }, []);

  return { job, generate, cancel };
}
