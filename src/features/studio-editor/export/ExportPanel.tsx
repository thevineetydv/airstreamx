// Bottom sheet for export: pick quality, watch progress, then upload or download.

import { useEffect, useRef, useState } from "react";
import { useUpload } from "../../../context/UploadContext";
import type { Clip, MediaAsset } from "../model/types";
import type { Overlay } from "../model/overlays";
import type { AudioSettings } from "../model/audio";
import type { CaptionSettings } from "../model/captions";
import type { AspectRatio } from "../model/look";
import { canvasFilterSupported } from "../render/drawClip";
import {
  ExportCancelled,
  estimateBytes,
  outputSize,
  runExport,
  type ExportResolution,
  type ExportResult,
} from "./exportEngine";

const UPLOAD_LIMIT = 500 * 1024 * 1024; // same limit as UploadModal

interface Props {
  aspect: AspectRatio;
  clips: Clip[];
  overlays: Overlay[];
  audio: AudioSettings;
  captions: CaptionSettings;
  assets: Record<string, MediaAsset>;
  onClose: () => void;
}

type Phase = { kind: "setup" } | { kind: "running"; progress: number } | { kind: "done"; result: ExportResult } | { kind: "error"; message: string };

function mb(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

const CODEC_LABEL: Record<string, string> = { avc: "H.264", vp9: "VP9", av1: "AV1", aac: "AAC", opus: "Opus" };

export default function ExportPanel({ clips, overlays, audio, captions, assets, aspect, onClose }: Props) {
  const [resolution, setResolution] = useState<ExportResolution>("720p");
  const [phase, setPhase] = useState<Phase>({ kind: "setup" });
  const abortRef = useRef<AbortController | null>(null);
  const { openModalWithFile, uploading } = useUpload();

  const first = assets[clips[0]?.assetId];
  const estimate = estimateBytes(clips, resolution, aspect);
  const size = outputSize(resolution, aspect, first);
  // Older Safari can't apply filters on a canvas: the export would come out without them.
  const filtersLost = !canvasFilterSupported() && clips.some((c) => c.fit === "blur" || c.look.preset !== "none" || c.look.brightness || c.look.contrast || c.look.saturation);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase({ kind: "running", progress: 0 });

    // Keep the phone screen on: background tabs are throttled and export slows down a lot.
    let wakeLock: WakeLockSentinel | null = null;
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* not supported */ }

    let last = 0;
    try {
      const result = await runExport({
        clips,
        overlays,
        audio,
        captions,
        assets,
        resolution,
        aspect,
        signal: controller.signal,
        onProgress: (p) => {
          // Limit re-renders to ~1% steps.
          if (p - last >= 0.01 || p === 1) {
            last = p;
            setPhase({ kind: "running", progress: p });
          }
        },
      });
      setPhase({ kind: "done", result });
    } catch (err) {
      if (err instanceof ExportCancelled) setPhase({ kind: "setup" });
      else setPhase({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    } finally {
      void wakeLock?.release().catch(() => undefined);
    }
  };

  const cancel = () => abortRef.current?.abort();

  const download = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    // Give the browser time to start the download before freeing the memory.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const busy = phase.kind === "running";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 sm:items-center" onClick={busy ? undefined : onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#121212] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="export-panel"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Export video</h2>
          {!busy && (
            <button onClick={onClose} className="rounded-full px-3 py-1 text-sm text-gray-400 hover:bg-white/10">Close</button>
          )}
        </div>

        {phase.kind === "setup" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {(["720p", "1080p"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setResolution(r)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    resolution === r ? "border-red-500 bg-red-500/10" : "border-white/10 bg-white/5"
                  }`}
                  data-testid={`res-${r}`}
                >
                  <div className="font-bold text-white">{r}</div>
                  <div className="text-xs text-gray-400">{r === "720p" ? "Faster, smaller" : "Sharper, 2× size"}</div>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-400">
              {size.width}×{size.height} · 30 fps · about {mb(estimate)}
            </p>
            {estimate > UPLOAD_LIMIT && (
              <p className="mt-2 text-xs text-yellow-400">
                This is above the 500 MB upload limit. Pick 720p or shorten the video.
              </p>
            )}
            {filtersLost && (
              <p className="mt-2 text-xs text-yellow-400">This browser can't apply filters / blur in the export. Use Chrome for those.</p>
            )}
            <p className="mt-2 text-xs text-gray-500">Keep this screen open while exporting.</p>
            <button
              onClick={start}
              className="mt-4 w-full rounded-full bg-red-600 py-3 font-bold text-white active:scale-[0.98]"
              data-testid="start-export"
            >
              Export
            </button>
          </>
        )}

        {phase.kind === "running" && (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-red-500 transition-[width]" style={{ width: `${Math.round(phase.progress * 100)}%` }} />
            </div>
            <p className="mt-2 text-sm tabular-nums text-gray-300" data-testid="export-progress">
              Exporting… {Math.round(phase.progress * 100)}%
            </p>
            <button onClick={cancel} className="mt-4 w-full rounded-full border border-white/15 py-3 font-semibold text-white">
              Cancel
            </button>
          </>
        )}

        {phase.kind === "done" && (
          <div data-testid="export-done">
            <p className="text-sm text-gray-300">
              Ready: {mb(phase.result.file.size)} · {CODEC_LABEL[phase.result.plan.videoCodec] ?? phase.result.plan.videoCodec}
              {phase.result.plan.audioCodec ? ` + ${CODEC_LABEL[phase.result.plan.audioCodec] ?? phase.result.plan.audioCodec}` : " · no audio (not supported in this browser)"}
              {` · ${phase.result.seconds.toFixed(1)}s`}
            </p>
            {uploading && (
              <p className="mt-2 text-xs text-yellow-400">Another upload is running. Download now, or wait for it to finish.</p>
            )}
            <button
              disabled={uploading || phase.result.file.size > UPLOAD_LIMIT}
              onClick={() => { openModalWithFile(phase.result.file); onClose(); }}
              className="mt-4 w-full rounded-full bg-red-600 py-3 font-bold text-white disabled:opacity-40"
              data-testid="upload-export"
            >
              Upload to AirStreamX
            </button>
            <button
              onClick={() => download(phase.result.file)}
              className="mt-2 w-full rounded-full border border-white/15 py-3 font-semibold text-white"
              data-testid="download-export"
            >
              Download MP4
            </button>
            {phase.result.srt && (
              <button
                onClick={() => phase.result.srt && download(phase.result.srt)}
                className="mt-2 w-full rounded-full border border-white/15 py-3 font-semibold text-white"
                data-testid="download-srt"
              >
                Download captions (.srt)
              </button>
            )}
          </div>
        )}

        {phase.kind === "error" && (
          <>
            <p className="text-sm text-red-400" data-testid="export-error">{phase.message}</p>
            <button onClick={() => setPhase({ kind: "setup" })} className="mt-4 w-full rounded-full border border-white/15 py-3 font-semibold text-white">
              Try again
            </button>
          </>
        )}
      </div>
    </div>
  );
}
