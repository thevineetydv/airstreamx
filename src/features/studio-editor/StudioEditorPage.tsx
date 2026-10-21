// AirStreamX Studio Editor.
// Phase 1: import clips, trim / split / delete / reorder, preview, export MP4
// in the browser and hand it to the normal upload flow.
// Phase 2: text, stickers, 📍 area tag and Local Deal banner overlays.
// Phase 3: original sound volume/mute, built-in music library, voice-over.
// Phase 4: auto captions (Whisper in the browser), editable, burn-in or subtitle track.
// Phase 5: transitions, filters / colour, speed 0.5×–2×, crop / fit and canvas shape.
// Loaded lazily on /studio/editor so the rest of the site stays light.

import { lazy, Suspense, useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Captions, Check, ChevronLeft, ChevronRight, Crop, Film, Gauge, MapPin, Music, Palette, Pause, Play, Plus, RectangleHorizontal, Scissors, Smile, Tag, Trash2, Type, ZoomIn, ZoomOut,
} from "lucide-react";
import { editorReducer, initialEditorState } from "./model/reducer";
import { AspectPanel, ClipPanel, TransitionPanel, type ClipTab } from "./clip/ClipPanels";
import { clipDuration } from "./model/timeline";
import { originalGain as originalGainOf } from "./model/audio";
import { clipStarts, formatTime, trimClip } from "./model/timeline";
import { probeFile } from "./media/probe";
import { usePreviewEngine } from "./preview/usePreviewEngine";
import Timeline from "./timeline/Timeline";
import PreviewStage from "./preview/PreviewStage";
import OverlayPanel from "./overlays/OverlayPanel";
import { outputSize } from "./export/size";
import AudioPanel from "./audio/AudioPanel";
import CaptionsPanel from "./captions/CaptionsPanel";
import { useCaptionGenerator, type AsrModelId } from "./captions/useCaptionGenerator";
import { captionAt, chunksToCaptions, manualCaption, type Caption, type CaptionLanguage, type CaptionSettings } from "./model/captions";
import { usePreviewAudio } from "./audio/usePreviewAudio";
import { useVoiceRecorder } from "./audio/useVoiceRecorder";
import { newVoiceOver, type AudioSettings } from "./model/audio";
import { clampOverlayTimes, createOverlay, rememberOverlay, type OverlayKind, type OverlayPatch } from "./model/overlays";
import { isWebCodecsSupported } from "./media/support";

const ExportPanel = lazy(() => import("./export/ExportPanel"));

const MIN_PPS = 4;
const MAX_PPS = 200;

export default function StudioEditorPage() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const { assets, clips, selectedClipId, overlays, selectedOverlayId, audio, captions, aspect } = state;
  // Two preview <video> elements: clip k plays on element k % 2 (see usePreviewEngine).
  const videoRef0 = useRef<HTMLVideoElement>(null);
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRefs = useRef([videoRef0, videoRef1] as const).current;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pxPerSec, setPxPerSec] = useState(40);
  const [showExport, setShowExport] = useState(false);
  const supported = isWebCodecsSupported();

  // ── Audio (Phase 3) ──
  const recorder = useVoiceRecorder();
  const { time, duration, playing, toggle, play, pause, seek } = usePreviewEngine({
    videoRefs,
    clips,
    assets,
    // Silent while recording a voice-over, so the mic doesn't pick up the preview.
    originalGain: recorder.recording ? 0 : originalGainOf(audio),
  });
  const [audioOpen, setAudioOpen] = useState(false);
  const [captionsOpen, setCaptionsOpen] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  usePreviewAudio({ playing, time, total: duration, audio, recording: recorder.recording });

  // ── Clip look, speed, crop, transitions, canvas (Phase 5) ──
  type EditPanel = { kind: "clip"; id: string; tab: ClipTab } | { kind: "transition"; index: number } | { kind: "aspect" } | null;
  const [edit, setEdit] = useState<EditPanel>(null);

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
    seek(edge === "in" ? start : start + clipDuration(c) - 0.02);
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
    setAudioOpen(false);
    setCaptionsOpen(false);
    setEdit(null);
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
    setAudioOpen(false);
    setCaptionsOpen(false);
    setEdit(null);
    dispatch({ type: "selectOverlay", id });
    const o = overlaysRef.current.find((x) => x.id === id);
    if (o && (timeRef.current < o.start || timeRef.current >= o.end)) seek(o.start + 0.01);
  }, [pause, seek]);

  const setOverlayTime = useCallback((id: string, start: number, end: number) => {
    dispatch({ type: "updateOverlay", id, patch: { start, end } });
  }, []);

  // Voice-over: record the mic while the preview plays from the playhead.
  const recordFrom = useRef(0);
  const recStartedAt = useRef(0);
  const playStartedAt = useRef(0);
  const armed = useRef(false);

  const startRecording = async () => {
    pause();
    setError(null);
    const from = time >= duration - 0.1 ? 0 : time;
    if (from !== time) seek(from);
    recordFrom.current = from;
    armed.current = false;
    try {
      await recorder.start();
    } catch {
      setError("Microphone not available. Allow mic access in the browser and try again.");
      return;
    }
    recStartedAt.current = performance.now();
    await play();
    playStartedAt.current = performance.now();
  };

  const stopRecording = useCallback(async () => {
    armed.current = false;
    pause();
    try {
      const raw = await recorder.stop();
      if (!raw) return;
      // The mic started a moment before the video; cut that bit so the voice lines up with the picture.
      const lead = Math.min(1, Math.max(0, (playStartedAt.current - recStartedAt.current) / 1000));
      const buffer = trimStart(raw, lead);
      if (buffer.duration < 0.3) return;
      const vo = newVoiceOver(buffer, recordFrom.current);
      dispatch({ type: "addVoiceOver", voiceOver: vo });
      setSelectedVoiceId(vo.id);
    } catch {
      setError("Could not save the recording.");
    }
  }, [pause, recorder]);

  // Stop recording automatically when the video reaches the end.
  useEffect(() => {
    if (!recorder.recording) return;
    if (playing) armed.current = true;
    else if (armed.current) void stopRecording();
  }, [playing, recorder.recording, stopRecording]);

  const openAudio = useCallback((voiceId: string | null = null) => {
    dispatch({ type: "selectOverlay", id: null });
    setSelectedVoiceId(voiceId);
    setCaptionsOpen(false);
    setEdit(null);
    setAudioOpen(true);
  }, []);

  // ── Captions (Phase 4) ──
  const captionGen = useCaptionGenerator();
  const activeCaption = captionAt(captions.items, time) ?? null;

  const openCaptions = useCallback(() => {
    pause();
    dispatch({ type: "selectOverlay", id: null });
    setAudioOpen(false);
    setEdit(null);
    setCaptionsOpen(true);
  }, [pause]);

  const generateCaptions = async (model: AsrModelId, language: CaptionLanguage) => {
    pause();
    dispatch({ type: "setCaptions", patch: { language } });
    const chunks = await captionGen.generate({ clips, assets, audio, model, language });
    if (!chunks) return;
    const items = chunksToCaptions(chunks, duration, language);
    dispatch({ type: "setCaptions", patch: { items } });
    if (!items.length) setError("No speech was recognised. Try a different language or the Accurate model.");
  };

  const setCaptions = useCallback((patch: Partial<CaptionSettings>) => dispatch({ type: "setCaptions", patch }), []);
  const editCaption = useCallback((id: string, patch: Partial<Caption>) => dispatch({ type: "editCaption", id, patch }), []);

  const onSelectCaption = useCallback((id: string) => {
    const c = state.captions.items.find((x) => x.id === id);
    openCaptions();
    if (c) seek(c.start + 0.01);
  }, [state.captions.items, openCaptions, seek]);

  const onSelectAudio = useCallback((id: string) => {
    pause();
    openAudio(id === "music" ? null : id);
  }, [openAudio, pause]);

  const onMoveVoice = useCallback((id: string, start: number) => {
    dispatch({ type: "updateVoiceOver", id, patch: { start } });
  }, []);

  const setAudio = useCallback((patch: Partial<AudioSettings>) => {
    dispatch({ type: "setAudio", patch });
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
  const stage = outputSize("720p", aspect, assets[clips[0]?.assetId]);

  const openEdit = (panel: Exclude<EditPanel, null>) => {
    pause();
    setAudioOpen(false);
    setCaptionsOpen(false);
    if (panel.kind !== "clip") dispatch({ type: "selectOverlay", id: null });
    setEdit(panel);
  };
  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? null;
  const editClip = edit?.kind === "clip" ? clips.find((c) => c.id === edit.id) ?? null : null;
  const transitionIndex = edit?.kind === "transition" && edit.index < clips.length - 1 ? edit.index : null;

  const selectTransition = (i: number) => {
    openEdit({ kind: "transition", index: i });
    // Park the playhead on the cut, so the preview shows the transition.
    const starts = clipStarts(clips);
    seek(starts[i + 1]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-black text-white" data-testid="studio-editor">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-2 pt-[env(safe-area-inset-top)]">
        <button onClick={goBack} className="rounded-full p-2 hover:bg-white/10" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="flex-1 truncate text-base font-bold">Studio Editor</h1>
        {hasClips && (
          <button
            onClick={() => openEdit({ kind: "aspect" })}
            className="flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold"
            data-testid="open-aspect"
          >
            <RectangleHorizontal size={14} /> {aspect === "auto" ? `Auto (${stage.width > stage.height ? "16:9" : "9:16"})` : aspect}
          </button>
        )}
        <button
          disabled={!hasClips || !supported || recorder.recording}
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
            videoRefs={videoRefs}
            clips={clips}
            aspect={stage.width / stage.height}
            time={time}
            overlays={overlays}
            captions={captions}
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
        {recorder.recording && (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-bold" data-testid="rec-badge">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC
          </span>
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
            musicTitle={audio.music?.track.title ?? null}
            voiceOvers={audio.voiceOvers.map((v) => ({ id: v.id, start: v.start, duration: v.buffer.duration }))}
            selectedVoiceId={audioOpen ? selectedVoiceId : null}
            onSelectAudio={onSelectAudio}
            onMoveVoice={onMoveVoice}
            captionItems={captions.items}
            activeCaptionId={captionsOpen ? activeCaption?.id ?? null : null}
            onSelectCaption={onSelectCaption}
            onSelectTransition={selectTransition}
            selectedTransition={transitionIndex}
          />

          {edit?.kind === "aspect" ? (
            <AspectPanel aspect={aspect} onChange={(a) => dispatch({ type: "setAspect", aspect: a })} onDone={() => setEdit(null)} />
          ) : transitionIndex !== null ? (
            <TransitionPanel
              transition={clips[transitionIndex].transitionOut}
              maxDuration={Math.min(clipDuration(clips[transitionIndex]), clipDuration(clips[transitionIndex + 1]))}
              onChange={(t) => dispatch({ type: "updateClip", id: clips[transitionIndex].id, patch: { transitionOut: t } })}
              onApplyToAll={() => {
                const t = clips[transitionIndex].transitionOut;
                clips.slice(0, -1).forEach((c) => dispatch({ type: "updateClip", id: c.id, patch: { transitionOut: t } }));
              }}
              onDone={() => setEdit(null)}
            />
          ) : editClip && edit?.kind === "clip" ? (
            <ClipPanel
              clip={editClip}
              asset={assets[editClip.assetId]}
              tab={edit.tab}
              onTab={(tab) => setEdit({ kind: "clip", id: editClip.id, tab })}
              onChange={(patch) => dispatch({ type: "updateClip", id: editClip.id, patch })}
              onApplyLookToAll={() => clips.forEach((c) => dispatch({ type: "updateClip", id: c.id, patch: { look: editClip.look } }))}
              onDone={() => setEdit(null)}
            />
          ) : captionsOpen ? (
            <CaptionsPanel
              captions={captions}
              job={captionGen.job}
              time={time}
              activeId={activeCaption?.id ?? null}
              onGenerate={(model, language) => void generateCaptions(model, language)}
              onCancel={captionGen.cancel}
              onChange={setCaptions}
              onEdit={editCaption}
              onDelete={(id) => dispatch({ type: "removeCaption", id })}
              onAdd={() => {
                pause();
                const c = manualCaption(time, duration, captions.items);
                dispatch({ type: "addCaption", caption: c });
              }}
              onSeek={(t) => { pause(); seek(t); }}
              onDone={() => setCaptionsOpen(false)}
            />
          ) : audioOpen ? (
            <AudioPanel
              audio={audio}
              time={time}
              recording={recorder.recording}
              selectedVoiceId={selectedVoiceId}
              onChange={setAudio}
              onVoiceChange={(id, patch) => dispatch({ type: "updateVoiceOver", id, patch })}
              onVoiceDelete={(id) => dispatch({ type: "removeVoiceOver", id })}
              onRecord={() => void startRecording()}
              onStopRecord={() => void stopRecording()}
              onDone={() => setAudioOpen(false)}
            />
          ) : selectedOverlay ? (
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
              {/* With a clip selected: edit that clip. Otherwise: add things on top. */}
              {selectedClip ? (
                <div className="grid grid-cols-5 gap-1 px-2 pt-2 text-[10px] font-semibold" data-testid="selected-clip-tools">
                  <AddChip icon={<Gauge size={16} />} label={selectedClip.speed === 1 ? "Speed" : `${selectedClip.speed}×`} onClick={() => openEdit({ kind: "clip", id: selectedClip.id, tab: "speed" })} testId="tool-speed" />
                  <AddChip icon={<Palette size={16} />} label="Filters" onClick={() => openEdit({ kind: "clip", id: selectedClip.id, tab: "filters" })} testId="tool-filters" />
                  <AddChip icon={<Crop size={16} />} label="Crop / Fit" onClick={() => openEdit({ kind: "clip", id: selectedClip.id, tab: "crop" })} testId="tool-crop" />
                  <AddChip icon={<RectangleHorizontal size={16} />} label="Canvas" onClick={() => openEdit({ kind: "aspect" })} testId="tool-aspect" />
                  <AddChip icon={<Check size={16} />} label="Done" onClick={() => dispatch({ type: "select", id: null })} testId="tool-deselect" />
                </div>
              ) : (
              <div className="grid grid-cols-6 gap-1 px-2 pt-2 text-[10px] font-semibold">
                <AddChip icon={<Type size={16} />} label="Text" onClick={() => addOverlay("text")} testId="tool-text" />
                <AddChip icon={<Smile size={16} />} label="Sticker" onClick={() => addOverlay("sticker")} testId="tool-sticker" />
                <AddChip icon={<MapPin size={16} />} label="Area" onClick={() => addOverlay("area")} testId="tool-area" />
                <AddChip icon={<Tag size={16} />} label="Deal" onClick={() => addOverlay("deal")} testId="tool-deal" />
                <AddChip icon={<Music size={16} />} label="Audio" onClick={() => { pause(); openAudio(); }} testId="tool-audio" />
                <AddChip icon={<Captions size={16} />} label="Captions" onClick={openCaptions} testId="tool-captions" />
              </div>
              )}
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
          <ExportPanel clips={clips} overlays={overlays} audio={audio} captions={captions} assets={assets} aspect={aspect} onClose={() => setShowExport(false)} />
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
      className="flex flex-col items-center justify-center gap-0.5 rounded-xl bg-white/10 py-1.5 text-white active:bg-white/20"
    >
      {props.icon}
      {props.label}
    </button>
  );
}

/** Copy of an AudioBuffer without its first `seconds`. */
function trimStart(buffer: AudioBuffer, seconds: number): AudioBuffer {
  const skip = Math.min(buffer.length - 1, Math.round(seconds * buffer.sampleRate));
  if (skip <= 0) return buffer;
  const out = new AudioBuffer({
    length: buffer.length - skip,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    out.copyToChannel(buffer.getChannelData(ch).subarray(skip), ch);
  }
  return out;
}
