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
type Transcriber = ((audio: Float32Array, options: Record<string, unknown>) => Promise<AsrOutput>) & {
  tokenizer: { decode(ids: number[], opts?: { skip_special_tokens?: boolean }): string };
  model: { config: { vocab_size: number }; generation_config: { suppress_tokens?: number[] | null } };
};
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

// Scripts we never want in the output. Whisper treats the language as a hint,
// not a rule: with Hindi songs it often writes Urdu (same spoken language) or
// stray Cyrillic. Blocking those tokens keeps Hindi in Devanagari and English in Roman.
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
const DEVANAGARI = /[\u0900-\u097F]/;
const OTHER_SCRIPTS = /[\u0400-\u04FF\u0590-\u05FF\u0980-\u0DFF\u0E00-\u0FFF\u1100-\u11FF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/;

const suppressCache = new Map<string, number[]>();

/** Token ids whose text is in a script we don't want for this language. */
function blockedTokens(pipe: Transcriber, model: string, language: string): number[] {
  const key = `${model}|${language}`;
  const hit = suppressCache.get(key);
  if (hit) return hit;
  const ids: number[] = [];
  try {
    const n = pipe.model?.config?.vocab_size ?? 0;
    for (let id = 0; id < n; id++) {
      const t = pipe.tokenizer.decode([id], { skip_special_tokens: true });
      if (!t) continue;
      if (ARABIC.test(t) || OTHER_SCRIPTS.test(t) || (language === "english" && DEVANAGARI.test(t))) ids.push(id);
    }
  } catch {
    // If this library version exposes the tokenizer differently, just skip the
    // script lock — the caption clean-up step still removes wrong-script lines.
    return [];
  }
  suppressCache.set(key, ids);
  return ids;
}

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
    const defaults = pipe.model?.generation_config?.suppress_tokens ?? [];
    const out = await pipe(msg.audio, {
      language: msg.language,
      task: "transcribe",
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      // Keep Whisper's own list (music notes, symbols) and add the wrong scripts.
      suppress_tokens: [...defaults, ...blockedTokens(pipe, msg.model, msg.language)],
      // Stop "ai ai ai ai…" loops: the same 5-token run may not repeat in a window.
      no_repeat_ngram_size: 5,
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
