// AirStreamX Studio Editor.
// Phase 1: import clips, trim / split / delete / reorder, preview, export MP4
// in the browser and hand it to the normal upload flow.
// Phase 2: text, stickers, 📍 area tag and Local Deal banner overlays.
// Loaded lazily on /studio/editor so the rest of the site stays light.

import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Film, MapPin, Pause, Play, Plus, Scissors, Smile, Tag, Trash2, Type, ZoomIn, ZoomOut,
} from "lucide-react";
import { editorReducer, initialEditorState } from "./model/reducer";
import { clipStarts, formatTime, trimClip } from "./model/timeline";
import { probeFile } from "./media/probe";
import { usePreviewEngine } from "./preview/usePreviewEngine";
import Timeline from "./timeline/Timeline";
import PreviewStage from "./preview/PreviewStage";
import OverlayPanel from "./overlays/OverlayPanel";
import { outputSize } from "./export/size";
import { clampOverlayTimes, createOverlay, rememberOverlay, type OverlayKind, type OverlayPatch } from "./model/overlays";
import { isWebCodecsSupported } from "./media/support";

const ExportPanel = lazy(() => import("./export/ExportPanel"));

const MIN_PPS = 4;
const MAX_PPS = 200;

export default function StudioEditorPage() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const { assets, clips, selectedClipId, overlays, selectedOverlayId } = state;
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pxPerSec, setPxPerSec] = useState(40);
  const [showExport, setShowExport] = useState(false);
  const supported = isWebCodecsSupported();

  const { time, duration, playing, toggle, pause, seek } = usePreviewEngine(videoRef, clips, assets);

  // Free object URLs when the editor closes.
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  useEffect(() => () => {
    Object.values(assetsRef.current).forEach((a) => {
      URL.revokeObjectURL(a.url);
      a.thumbs.forEach((t) => t.url.startsWith("blob:") && URL.revokeObjectURL(t.url));
    });
  }, []);

  // Warn before closing the tab with unsaved edits (no drafts until Phase 6).
  useEffect(() => {
    if (clips.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [clips.length]);

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    pause();
    const list = Array.from(files);
    const added = [];
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      setImporting(`Reading ${i + 1}/${list.length}…`);
      try {
        added.push(await probeFile(list[i]));
      } catch (err) {
        failed.push(err instanceof Error ? err.message : `Could not open ${list[i].name}`);
      }
    }
    setImporting(null);
    if (added.length) dispatch({ type: "addAssets", assets: added });
    if (failed.length) setError(failed.join(" "));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectedIndex = clips.findIndex((c) => c.id === selectedClipId);

  // Trim a clip and park the playhead on the dragged edge so the preview shows that frame.
  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const handleTrim = useCallback((id: string, edge: "in" | "out", value: number) => {
    const current = clipsRef.current;
    const index = current.findIndex((c) => c.id === id);
    const asset = index >= 0 ? assetsRef.current[current[index].assetId] : undefined;
    if (!asset) return;
    const next = trimClip(current, id, edge, value, asset.duration);
    dispatch({ type: "trim", id, edge, value });
    const start = clipStarts(next)[index];
    const c = next[index];
    seek(edge === "in" ? start : start + (c.outPoint - c.inPoint) - 0.02);
  }, [seek]);

  const onSelect = useCallback((id: string | null) => dispatch({ type: "select", id }), []);

  const splitHere = () => { pause(); dispatch({ type: "split", at: time }); };
  const deleteSelected = () => {
    if (!selectedClipId) return;
    pause();
    dispatch({ type: "delete", id: selectedClipId });
  };
  const move = (dir: -1 | 1) => {
    if (!selectedClipId) return;
    pause();
    dispatch({ type: "move", id: selectedClipId, dir });
    // Keep the playhead on the moved clip.
    const nextIndex = selectedIndex + dir;
    if (nextIndex >= 0 && nextIndex < clips.length) {
      const moved = clips.slice();
      [moved[selectedIndex], moved[nextIndex]] = [moved[nextIndex], moved[selectedIndex]];
      seek(clipStarts(moved)[nextIndex] + 0.001);
    }
  };

  // ── Overlays ──
  const selectedOverlay = overlays.find((o) => o.id === selectedOverlayId) ?? null;

  const addOverlay = (kind: OverlayKind) => {
    pause();
    const o = createOverlay(kind, time, duration);
    dispatch({ type: "addOverlay", overlay: o });
    // Make sure the new overlay is visible in the preview.
    if (time < o.start || time >= o.end) seek(o.start);
  };

  const updateOverlay = useCallback((id: string, patch: OverlayPatch) => {
    dispatch({ type: "updateOverlay", id, patch });
  }, []);

  const selectOverlay = useCallback((id: string | null) => {
    dispatch({ type: "selectOverlay", id });
  }, []);

  // Selecting a bar on the timeline jumps the playhead into it, so it shows in the preview.
  const timeRef = useRef(time);
  timeRef.current = time;
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const selectOverlayFromTimeline = useCallback((id: string) => {
    pause();
    dispatch({ type: "selectOverlay", id });
    const o = overlaysRef.current.find((x) => x.id === id);
    if (o && (timeRef.current < o.start || timeRef.current >= o.end)) seek(o.start + 0.01);
  }, [pause, seek]);

  const setOverlayTime = useCallback((id: string, start: number, end: number) => {
    dispatch({ type: "updateOverlay", id, patch: { start, end } });
  }, []);

  const closeOverlayPanel = () => {
    if (selectedOverlay) rememberOverlay(selectedOverlay);
    selectOverlay(null);
  };

  const goBack = () => {
    if (clips.length && !window.confirm("Leave the editor? Your edits will be lost.")) return;
    navigate(-1);
  };

  const hasClips = clips.length > 0;
  // Preview uses the export frame shape, so overlay positions match the final video.
  const stage = outputSize("720p", assets[clips[0]?.assetId]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-black text-white" data-testid="studio-editor">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-2 pt-[env(safe-area-inset-top)]">
        <button onClick={goBack} className="rounded-full p-2 hover:bg-white/10" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="flex-1 truncate text-base font-bold">Studio Editor</h1>
        <button
          disabled={!hasClips || !supported}
          onClick={() => { pause(); setShowExport(true); }}
          className="rounded-full bg-red-600 px-5 py-2 text-sm font-bold disabled:opacity-40"
          data-testid="open-export"
        >
          Export
        </button>
      </header>

      {!supported && (
        <p className="bg-yellow-500/15 px-4 py-2 text-xs text-yellow-300">
          This browser does not support in-browser video editing (WebCodecs). Please use Chrome on Android or desktop.
        </p>
      )}
      {error && (
        <p className="bg-red-500/15 px-4 py-2 text-xs text-red-300" data-testid="editor-error">{error}</p>
      )}

      {/* Preview */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-zinc-950">
        {hasClips ? (
          <PreviewStage
            videoRef={videoRef}
            aspect={stage.width / stage.height}
            time={time}
            overlays={overlays}
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={selectOverlay}
            onMoveOverlay={updateOverlay}
            onTapEmpty={toggle}
            onDragStart={pause}
          />
        ) : (
          <button
            disabled={!supported || !!importing}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-white/15 px-10 py-12 text-gray-300 disabled:opacity-50"
            data-testid="import-empty"
          >
            <Film size={40} className="text-red-500" />
            <span className="font-bold">{importing ?? "Import video"}</span>
            <span className="text-xs text-gray-500">Pick one or more clips from your phone</span>
          </button>
        )}
        {hasClips && importing && (
          <span className="absolute top-2 rounded-full bg-black/70 px-3 py-1 text-xs">{importing}</span>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => void importFiles(e.target.files)}
        data-testid="file-input"
      />

      {hasClips && (
        <div className="shrink-0 border-t border-white/10 bg-[#0b0b0b] pb-[env(safe-area-inset-bottom)]">
          {/* Play row */}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="w-24 text-xs tabular-nums text-gray-300" data-testid="time-label">
              {formatTime(time)} / {formatTime(duration)}
            </span>
            <button onClick={toggle} className="rounded-full bg-white/10 p-2.5" aria-label={playing ? "Pause" : "Play"} data-testid="play-toggle">
              {playing ? <Pause size={20} /> : <Play size={20} />}
            </button>
            <div className="flex w-24 justify-end gap-1">
              <button onClick={() => setPxPerSec((p) => Math.max(MIN_PPS, p / 1.5))} className="rounded-full p-2 hover:bg-white/10" aria-label="Zoom out">
                <ZoomOut size={18} />
              </button>
              <button onClick={() => setPxPerSec((p) => Math.min(MAX_PPS, p * 1.5))} className="rounded-full p-2 hover:bg-white/10" aria-label="Zoom in">
                <ZoomIn size={18} />
              </button>
            </div>
          </div>

          <Timeline
            clips={clips}
            assets={assets}
            selectedId={selectedClipId}
            time={time}
            duration={duration}
            pxPerSec={pxPerSec}
            onSeek={seek}
            onScrubStart={pause}
            onSelect={onSelect}
            onTrim={handleTrim}
            overlays={overlays}
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={selectOverlayFromTimeline}
            onOverlayTime={setOverlayTime}
          />

          {selectedOverlay ? (
            <OverlayPanel
              overlay={selectedOverlay}
              onChange={(patch) => updateOverlay(selectedOverlay.id, patch)}
              onSetStart={() => {
                const c = clampOverlayTimes(time, Math.max(selectedOverlay.end, time + 0.3), duration);
                setOverlayTime(selectedOverlay.id, c.start, c.end);
              }}
              onSetEnd={() => {
                const c = clampOverlayTimes(Math.min(selectedOverlay.start, time - 0.3), time, duration);
                setOverlayTime(selectedOverlay.id, c.start, c.end);
              }}
              onDelete={() => dispatch({ type: "removeOverlay", id: selectedOverlay.id })}
              onDone={closeOverlayPanel}
            />
          ) : (
            <>
              {/* Add overlays: compact chips so all four fit on a phone */}
              <div className="grid grid-cols-4 gap-1.5 px-2 pt-2 text-[11px] font-semibold">
                <AddChip icon={<Type size={14} />} label="Text" onClick={() => addOverlay("text")} testId="tool-text" />
                <AddChip icon={<Smile size={14} />} label="Sticker" onClick={() => addOverlay("sticker")} testId="tool-sticker" />
                <AddChip icon={<MapPin size={14} />} label="Area" onClick={() => addOverlay("area")} testId="tool-area" />
                <AddChip icon={<Tag size={14} />} label="Deal" onClick={() => addOverlay("deal")} testId="tool-deal" />
              </div>
              {/* Clip tools */}
              <div className="grid grid-cols-5 gap-1 px-2 py-1.5 text-[11px] text-gray-300">
                <ToolButton icon={<Scissors size={20} />} label="Split" onClick={splitHere} testId="tool-split" />
                <ToolButton icon={<Trash2 size={20} />} label="Delete" onClick={deleteSelected} disabled={!selectedClipId} testId="tool-delete" />
                <ToolButton icon={<ChevronLeft size={20} />} label="Move left" onClick={() => move(-1)} disabled={selectedIndex <= 0} testId="tool-left" />
                <ToolButton icon={<ChevronRight size={20} />} label="Move right" onClick={() => move(1)} disabled={selectedIndex < 0 || selectedIndex >= clips.length - 1} testId="tool-right" />
                <ToolButton icon={<Plus size={20} />} label="Add clip" onClick={() => fileInputRef.current?.click()} disabled={!!importing} testId="tool-add" />
              </div>
            </>
          )}
        </div>
      )}

      {showExport && (
        <Suspense fallback={null}>
          <ExportPanel clips={clips} overlays={overlays} assets={assets} onClose={() => setShowExport(false)} />
        </Suspense>
      )}
    </div>
  );
}

function ToolButton(props: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; testId: string }) {
  return (
    <button
      onClick={props.onClick}
      disabled={props.disabled}
      data-testid={props.testId}
      className="flex flex-col items-center gap-1 rounded-xl py-1.5 active:bg-white/10 disabled:opacity-30"
    >
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function AddChip(props: { icon: React.ReactNode; label: string; onClick: () => void; testId: string }) {
  return (
    <button
      onClick={props.onClick}
      data-testid={props.testId}
      className="flex items-center justify-center gap-1 rounded-full bg-white/10 py-2 text-white active:bg-white/20"
    >
      {props.icon}
      {props.label}
    </button>
  );
}
