// Speech-to-text worker. Runs Whisper (transformers.js + ONNX Runtime Web)
// fully in the browser, off the main thread so the editor stays smooth.
//
// transformers.js is loaded from the jsDelivr CDN at a pinned version instead
// of npm: its npm package pulls Node-only native deps (onnxruntime-node, sharp)
// that the browser never uses. The model files come from huggingface.co and are
// cached by the browser (Cache Storage) after the first download.

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js";

interface AsrChunk { timestamp: [number, number | null]; text: string }
interface AsrOutput { text: string; chunks?: AsrChunk[] }
type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<AsrOutput>;
interface ProgressInfo { status: string; progress?: number; loaded?: number; total?: number }
interface TransformersLib {
  env: { allowLocalModels: boolean };
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<Transcriber>;
}

export type WorkerIn = {
  type: "transcribe";
  jobId: number;
  model: string;
  language: string;
  /** 16 kHz mono samples. */
  audio: Float32Array;
};

export type WorkerOut =
  | { type: "download"; progress: number; loaded: number; total: number }
  | { type: "ready" }
  | { type: "chunks"; jobId: number; chunks: { start: number; end: number | null; text: string }[] }
  | { type: "error"; jobId: number; message: string };

// Typed loosely on purpose: the app's tsconfig uses DOM types, not WebWorker types.
const scope = self as unknown as { postMessage(m: WorkerOut): void; onmessage: ((e: MessageEvent<WorkerIn>) => void) | null };
const post = (m: WorkerOut) => scope.postMessage(m);

let lib: Promise<TransformersLib> | null = null;
let current: { model: string; pipe: Promise<Transcriber> } | null = null;

function loadPipe(model: string): Promise<Transcriber> {
  if (current?.model === model) return current.pipe;
  lib ??= import(/* @vite-ignore */ TRANSFORMERS_URL) as Promise<TransformersLib>;
  const pipe = lib.then((t) => {
    t.env.allowLocalModels = false;
    return t.pipeline("automatic-speech-recognition", model, {
      dtype: "q8", // quantised: ~4x smaller download, small accuracy cost
      device: "wasm",
      progress_callback: (p: ProgressInfo) => {
        if (p.status === "progress_total") {
          post({ type: "download", progress: p.progress ?? 0, loaded: p.loaded ?? 0, total: p.total ?? 0 });
        }
      },
    });
  });
  current = { model, pipe };
  pipe.catch(() => { if (current?.pipe === pipe) current = null; });
  return pipe;
}

scope.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  if (msg.type !== "transcribe") return;
  try {
    const pipe = await loadPipe(msg.model);
    post({ type: "ready" });
    const out = await pipe(msg.audio, {
      language: msg.language,
      task: "transcribe",
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const chunks = (out.chunks ?? [{ timestamp: [0, null], text: out.text }]).map((c) => ({
      start: c.timestamp[0] ?? 0,
      end: c.timestamp[1],
      text: c.text,
    }));
    post({ type: "chunks", jobId: msg.jobId, chunks });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({ type: "error", jobId: msg.jobId, message });
  }
};
