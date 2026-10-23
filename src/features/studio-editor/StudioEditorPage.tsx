// AirStreamX Studio Editor.
// Phase 1: import clips, trim / split / delete / reorder, preview, export MP4
// in the browser and hand it to the normal upload flow.
// Phase 2: text, stickers, 📍 area tag and Local Deal banner overlays.
// Phase 3: original sound volume/mute, built-in music library, voice-over.
// Phase 5: transitions, filters / colour, speed 0.5×–2×, crop / fit and canvas shape.
// Phase 6a: undo / redo, drafts saved on the device (auto-save, open, delete).
// Phase 6b: layers (picture-in-picture video / picture) and keyframe animation.
// Phase 7: ready-made animations (in / out / loop), auto-keyframe switch, clear keyframes.
// Phase 8: templates (Food review, Shop offer, Cafe intro, Festival sale, Gym promo, City vlog).
// Loaded lazily on /studio/editor so the rest of the site stays light.

import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, BadgeCheck, Check, CloudOff, Layers as LayersIcon, Loader2, Redo2, Sparkles, Undo2, ChevronLeft, ChevronRight, Crop, Film, Gauge, MapPin, Music, Palette, Pause, Play, Plus, RectangleHorizontal, Scissors, Smile, Tag, Trash2, Type, ZoomIn, ZoomOut,
} from "lucide-react";
import { historyReducer, initHistory } from "./model/history";
import { DraftsList, RelinkPanel } from "./draft/DraftsPanel";
import { draftToState, openDraft, type OpenedDraft } from "./draft/drafts";
import { useDraftAutosave, type SaveStatus } from "./draft/useDraftAutosave";
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
import { usePreviewAudio } from "./audio/usePreviewAudio";
import { useVoiceRecorder } from "./audio/useVoiceRecorder";
import { newVoiceOver, type AudioSettings } from "./model/audio";
import { clampOverlayTimes, createOverlay, rememberOverlay, type Overlay, type OverlayKind, type OverlayPatch } from "./model/overlays";
import { isWebCodecsSupported } from "./media/support";
import LayerPanel from "./layers/LayerPanel";
import { animatedEdit, clearKeyframes, keyframeAt, neighbourKey, propsAt, toggleKeyframe, type Animatable, type AnimProps } from "./model/keyframes";
import type { Animations } from "./model/presets";
import TemplatePanel from "./templates/TemplatePanel";
import type { Template } from "./model/templates";
import { rememberValues } from "./model/overlays";
import { loadLibrary } from "./audio/library";
import BrandPanel from "./brand/BrandPanel";
import { logoFile, readBrand, type Brand } from "./model/brand";
import { beatSyncFor } from "./audio/beatCache";
import { timelineBeats } from "./audio/beats";
import { layerEnd, loadImage, MAX_VIDEO_LAYERS, newImageLayer, newVideoLayer, type Layer, type LayerPatch } from "./model/layers";

const ExportPanel = lazy(() => import("./export/ExportPanel"));

const MIN_PPS = 4;
const MAX_PPS = 200;

export default function StudioEditorPage() {
  const navigate = useNavigate();
  // Editor state lives inside an undo/redo history (model/history.ts).
  const [history, dispatch] = useReducer(historyReducer, undefined, () => initHistory());
  const state = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const { assets, clips, selectedClipId, overlays, selectedOverlayId, audio, aspect, layers, selectedLayerId, images } = state;
  // Two preview <video> elements: clip k plays on element k % 2 (see usePreviewEngine).
  const videoRef0 = useRef<HTMLVideoElement>(null);
  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRefs = useRef([videoRef0, videoRef1] as const).current;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const layerInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pxPerSec, setPxPerSec] = useState(40);
  const [showExport, setShowExport] = useState(false);
  const supported = isWebCodecsSupported();

  // ── Drafts + undo/redo (Phase 6a) ──
  const draft = useDraftAutosave(state);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [relink, setRelink] = useState<OpenedDraft | null>(null);

  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo (not while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

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

  // Warn before closing the tab only while a save is still running or has failed.
  const unsafe = clips.length > 0 && (draft.status === "pending" || draft.status === "saving" || draft.status === "error");
  useEffect(() => {
    if (!unsafe) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsafe]);

  // Open a saved draft. Videos that were not stored are asked for first.
  const finishOpen = async (o: OpenedDraft, picked: Map<string, File>) => {
    const assetsNow = { ...o.assets };
    for (const [id, file] of picked) {
      try { assetsNow[id] = await probeFile(file, id); } catch { /* leave it out */ }
    }
    const stored = [
      ...Object.keys(o.assets).map((id) => `${o.doc.id}:${id}`),
      ...o.voiceOvers.map((v) => `${o.doc.id}:vo:${v.id}`),
      ...Object.keys(o.images).map((id) => `${o.doc.id}:img:${id}`),
    ];
    dispatch({ type: "load", state: draftToState({ ...o, assets: assetsNow }) });
    draft.adopt({ id: o.doc.id, name: o.doc.name, createdAt: o.doc.createdAt }, stored, picked.size > 0 || o.missing.length > 0);
    setRelink(null);
  };

  const openSavedDraft = async (id: string) => {
    setError(null);
    setOpeningId(id);
    try {
      const o = await openDraft(id);
      if (o.missing.length) setRelink(o);
      else await finishOpen(o, new Map());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the draft.");
    } finally {
      setOpeningId(null);
    }
  };

  // ── Brand kit (Phase 11) ──
  const [brand, setBrand] = useState<Brand>(readBrand);
  const [brandOpen, setBrandOpen] = useState(false);
  /** Saved logo as a picture layer, top-right, for the whole video. */
  const addBrandLogo = async (b: Brand, total = duration, select = true) => {
    const file = await logoFile(b).catch(() => null);
    if (!file || layersRef.current.some((l) => l.brand)) return;
    const image = await loadImage(file);
    const layer = { ...newImageLayer(image.id, 0, total), start: 0, end: total, x: 0.86, y: 0.08, scale: 0.2, opacity: 0.92, brand: true };
    dispatch({ type: "addLayer", layer, image });
    if (!select) dispatch({ type: "selectLayer", id: null });
  };

  // Selecting something on the timeline closes the brand panel.
  useEffect(() => {
    if (selectedOverlayId || selectedClipId || selectedLayerId) setBrandOpen(false);
  }, [selectedOverlayId, selectedClipId, selectedLayerId]);

  // ── Templates (Phase 8) ──
  const [templateOpen, setTemplateOpen] = useState<"start" | "editor" | null>(null);
  /** Chosen on the start screen; applied right after the videos are imported. */
  const pendingTemplate = useRef<{ t: Template; values: Record<string, string> } | null>(null);

  const applyTemplate = async (t: Template, values: Record<string, string>, total: number) => {
    rememberValues({ area: values.area, business: values.business ?? values.place ?? values.name, phone: values.phone });
    const result = t.build(values, total);
    // Music is optional: if the library can't load (offline), the rest still applies.
    const music = result.musicId
      ? await loadLibrary().then((list) => list.find((m) => m.id === result.musicId) ?? null).catch(() => null)
      : null;
    // Beat sync: cuts, ending and text on the beat; music starts at its liveliest part.
    const sync = music ? await beatSyncFor(music, total).catch(() => null) : null;
    dispatch({ type: "applyTemplate", result, music, sync });
    setTemplateOpen(null);
    if (brand.logo && brand.logoOnTemplates) await addBrandLogo(brand, total, false);
    seek(0);
  };

  // ── Beat sync (Phase 10) ──
  const musicBeats = useMemo(() => {
    const m = audio.music;
    return m?.beat ? timelineBeats(m.beat, m.offset ?? 0, m.track.duration, duration) : [];
  }, [audio.music, duration]);
  /** Returns the BPM, or null when the track has no clear beat. */
  const runBeatSync = async (): Promise<number | null> => {
    const m = audio.music;
    if (!m) return null;
    pause();
    const s = await beatSyncFor(m.track, duration);
    if (!s) return null;
    dispatch({ type: "beatSync", beat: s.beat, offset: s.offset });
    seek(0);
    return s.bpm;
  };

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
    // Template picked on the start screen: apply it now that the videos are in.
    // (Separate undo step, so Undo removes the template but keeps the videos.)
    const pending = pendingTemplate.current;
    if (pending && added.length) {
      pendingTemplate.current = null;
      const total = duration + added.reduce((s, a) => s + a.duration, 0);
      await applyTemplate(pending.t, pending.values, total);
    }
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
    setEdit(null);
    setAudioOpen(true);
  }, []);

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

  // ── Layers + keyframes (Phase 6b) ──
  const selectedLayer = layers.find((l) => l.id === selectedLayerId) ?? null;

  const addLayerFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (layerInputRef.current) layerInputRef.current.value = "";
    if (!file) return;
    pause();
    setError(null);
    setAudioOpen(false);
    setEdit(null);
    try {
      if (file.type.startsWith("image/")) {
        const image = await loadImage(file);
        dispatch({ type: "addLayer", layer: newImageLayer(image.id, time, duration), image });
      } else {
        if (layers.filter((l) => l.kind === "video").length >= MAX_VIDEO_LAYERS) {
          setError(`At most ${MAX_VIDEO_LAYERS} video layers (each one is extra work for the phone). Pictures are unlimited.`);
          return;
        }
        setImporting("Reading layer…");
        const asset = await probeFile(file);
        dispatch({ type: "addLayer", layer: newVideoLayer(asset.id, asset.duration, time, duration), asset });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this file.");
    } finally {
      setImporting(null);
    }
  };

  const layersRef = useRef(layers);
  layersRef.current = layers;
  const selectLayer = useCallback((id: string | null) => {
    dispatch({ type: "selectLayer", id });
  }, []);
  const selectLayerFromTimeline = useCallback((id: string) => {
    pause();
    setAudioOpen(false);
    setEdit(null);
    dispatch({ type: "selectLayer", id });
    const l = layersRef.current.find((x) => x.id === id);
    if (l && (timeRef.current < l.start || timeRef.current >= layerEnd(l))) seek(l.start + 0.01);
  }, [pause, seek]);
  const patchLayer = useCallback((id: string, patch: LayerPatch) => dispatch({ type: "updateLayer", id, patch }), []);


  // Auto keyframe (off by default): when ON, moving / resizing between keyframes adds one there.
  // Remembered on this device.
  const [autoKey, setAutoKeyState] = useState(() => {
    try { return localStorage.getItem("studio-editor:auto-key") === "1"; } catch { return false; }
  });
  const autoKeyRef = useRef(autoKey);
  autoKeyRef.current = autoKey;
  const setAutoKey = (on: boolean) => {
    setAutoKeyState(on);
    try { localStorage.setItem("studio-editor:auto-key", on ? "1" : "0"); } catch { /* ignore */ }
  };

  /** Changing position / size / opacity: base values, or keyframes if animated. */
  const moveOverlay = useCallback((id: string, change: Partial<AnimProps>) => {
    const o = overlaysRef.current.find((x) => x.id === id);
    if (!o) return;
    const rel = Math.min(Math.max(0, timeRef.current - o.start), o.end - o.start);
    dispatch({ type: "updateOverlay", id, patch: animatedEdit(o, rel, change, autoKeyRef.current) });
  }, []);
  const moveLayer = useCallback((id: string, change: Partial<AnimProps>) => {
    const l = layersRef.current.find((x) => x.id === id);
    if (!l) return;
    const rel = Math.min(Math.max(0, timeRef.current - l.start), layerEnd(l) - l.start);
    dispatch({ type: "updateLayer", id, patch: animatedEdit(l, rel, change, autoKeyRef.current) });
  }, []);

  /** Props for KeyframeControls for an overlay or layer. */
  const animControls = (item: Overlay | Layer, isLayer: boolean) => {
    const len = (isLayer ? layerEnd(item as Layer) : (item as Overlay).end) - item.start;
    // Keyframe time = playhead position inside the item.
    const rel = Math.min(Math.max(0, time - item.start), len);
    const prev = neighbourKey(item, rel, -1);
    const next = neighbourKey(item, rel, 1);
    const send = (patch: Partial<AnimProps> & { keyframes?: Animatable["keyframes"] }) =>
      isLayer ? dispatch({ type: "updateLayer", id: item.id, patch }) : dispatch({ type: "updateOverlay", id: item.id, patch });
    return {
      values: propsAt(item, rel),
      onChange: (change: Partial<AnimProps>) => (isLayer ? moveLayer(item.id, change) : moveOverlay(item.id, change)),
      keyCount: item.keyframes?.length ?? 0,
      keyHere: !!keyframeAt(item, rel),
      onToggleKey: () => { pause(); send(toggleKeyframe(item, rel)); },
      onPrev: prev ? () => { pause(); seek(item.start + prev.t + 0.001); } : null,
      onNext: next ? () => { pause(); seek(item.start + next.t + 0.001); } : null,
      onClear: () => { pause(); send(clearKeyframes(item, rel)); },
      autoKey,
      onAutoKey: setAutoKey,
    };
  };

  // Ready-made animations: set them and play the part where they show.
  const previewTimer = useRef<number | null>(null);
  const presetControls = (item: Overlay | Layer, isLayer: boolean) => {
    const end = isLayer ? layerEnd(item as Layer) : (item as Overlay).end;
    return {
      anim: item.anim,
      onChange: (a: Animations) =>
        isLayer ? dispatch({ type: "updateLayer", id: item.id, patch: { anim: a } }) : dispatch({ type: "updateOverlay", id: item.id, patch: { anim: a } }),
      onPreview: (tab: "in" | "out" | "loop") => {
        const a = item.anim;
        const outLen = Math.min(a?.outDuration ?? 0.5, (end - item.start) / 2);
        const from = tab === "out" ? Math.max(item.start, end - outLen - 0.4) : item.start + 0.001;
        const length = tab === "loop" ? 2.5 : (tab === "in" ? (a?.inDuration ?? 0.5) : outLen) + 0.6;
        pause();
        seek(from);
        void play();
        if (previewTimer.current) clearTimeout(previewTimer.current);
        previewTimer.current = window.setTimeout(() => pause(), length * 1000);
      },
    };
  };

  const goBack = async () => {
    if (draft.status === "error" && !window.confirm("The last changes could not be saved. Leave anyway?")) return;
    await draft.flush(); // save anything still waiting
    navigate(-1);
  };

  const hasClips = clips.length > 0;
  // Preview uses the export frame shape, so overlay positions match the final video.
  const stage = outputSize("720p", aspect, assets[clips[0]?.assetId]);

  const openEdit = (panel: Exclude<EditPanel, null>) => {
    pause();
    setAudioOpen(false);
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
        <button onClick={() => void goBack()} className="rounded-full p-2 hover:bg-white/10" aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        {hasClips || canUndo || canRedo ? (
          <div className="flex flex-1 items-center gap-0.5">
            <button onClick={undo} disabled={!canUndo} className="rounded-full p-2 hover:bg-white/10 disabled:opacity-30" aria-label="Undo" data-testid="undo">
              <Undo2 size={18} />
            </button>
            <button onClick={redo} disabled={!canRedo} className="rounded-full p-2 hover:bg-white/10 disabled:opacity-30" aria-label="Redo" data-testid="redo">
              <Redo2 size={18} />
            </button>
            <SaveBadge status={draft.status} />
          </div>
        ) : (
          <h1 className="flex-1 truncate text-base font-bold">Studio Editor</h1>
        )}
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
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={selectOverlay}
            onMoveOverlay={moveOverlay}
            layers={layers}
            assets={assets}
            images={images}
            selectedLayerId={selectedLayerId}
            onSelectLayer={selectLayer}
            onMoveLayer={moveLayer}
            playing={playing}
            muted={recorder.recording}
            onTapEmpty={toggle}
            onDragStart={pause}
          />
        ) : relink ? (
          <RelinkPanel
            missing={relink.missing}
            onFiles={(found) => void finishOpen(relink, found)}
            onSkip={() => void finishOpen(relink, new Map())}
            onCancel={() => setRelink(null)}
          />
        ) : templateOpen === "start" ? (
          <div className="max-h-full w-full max-w-md overflow-y-auto">
            <TemplatePanel
              mode="start"
              busy={!!importing}
              onApply={(t, values) => {
                pendingTemplate.current = { t, values };
                fileInputRef.current?.click();
              }}
              onClose={() => { pendingTemplate.current = null; setTemplateOpen(null); }}
            />
            {importing && <p className="pb-3 text-center text-xs text-gray-400">{importing}</p>}
          </div>
        ) : (
          <div className="flex max-h-full w-full flex-col items-center gap-4 overflow-y-auto px-4 py-6">
            {/* Templates first: the fastest way for a new creator to get a good video. */}
            {supported && (
              <button
                onClick={() => setTemplateOpen("start")}
                disabled={!!importing || !!openingId}
                className="w-full max-w-sm rounded-3xl bg-gradient-to-br from-red-600 via-red-500 to-orange-500 p-5 text-left text-white shadow-lg shadow-red-900/30 active:scale-[0.99] disabled:opacity-50"
                data-testid="start-template"
              >
                <div className="text-2xl leading-none tracking-widest" aria-hidden>🍜🛍️☕🎉💪</div>
                <div className="mt-3 flex items-center gap-2 text-lg font-extrabold">
                  <Sparkles size={20} /> Start with a template
                </div>
                <div className="mt-1 text-sm text-white/85">Ready in 1 minute: text, music and look are done for you.</div>
              </button>
            )}
            <button
              disabled={!supported || !!importing || !!openingId}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full max-w-sm items-center gap-4 rounded-3xl border-2 border-dashed border-white/15 px-5 py-5 text-left text-gray-300 disabled:opacity-50"
              data-testid="import-empty"
            >
              <Film size={32} className="shrink-0 text-red-500" />
              <span>
                <span className="block font-bold">{importing ?? (openingId ? "Opening draft…" : "Import video")}</span>
                <span className="block text-xs text-gray-500">Start from scratch with clips from your phone</span>
              </span>
            </button>
            {supported && <DraftsList onOpen={(id) => void openSavedDraft(id)} busyId={openingId} />}
          </div>
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
      <input
        ref={layerInputRef}
        type="file"
        accept="video/*,image/*"
        hidden
        onChange={(e) => void addLayerFiles(e.target.files)}
        data-testid="layer-input"
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
            onReorder={(id, index) => { pause(); dispatch({ type: "moveTo", id, index }); }}
            overlays={overlays}
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={selectOverlayFromTimeline}
            onOverlayTime={setOverlayTime}
            musicTitle={audio.music?.track.title ?? null}
            musicBeats={musicBeats}
            musicOffset={audio.music?.offset ?? 0}
            voiceOvers={audio.voiceOvers.map((v) => ({ id: v.id, start: v.start, duration: v.buffer.duration }))}
            selectedVoiceId={audioOpen ? selectedVoiceId : null}
            onSelectAudio={onSelectAudio}
            onMoveVoice={onMoveVoice}
            onSelectTransition={selectTransition}
            selectedTransition={transitionIndex}
            layers={layers}
            images={images}
            selectedLayerId={selectedLayerId}
            onSelectLayer={selectLayerFromTimeline}
            onLayerPatch={patchLayer}
          />

          {/* Panels: full width on phones, a centred column on desktop */}
          <div className="mx-auto w-full max-w-2xl" data-testid="panel-column">
          {brandOpen ? (
            <BrandPanel
              brand={brand}
              onChange={setBrand}
              onAddLogo={() => void addBrandLogo(brand)}
              hasLogoLayer={layers.some((l) => l.brand)}
              onClose={() => setBrandOpen(false)}
            />
          ) : templateOpen === "editor" ? (
            <div className="max-h-[46vh] overflow-y-auto">
              <TemplatePanel mode="editor" onApply={(t, values) => void applyTemplate(t, values, duration)} onClose={() => setTemplateOpen(null)} />
            </div>
          ) : edit?.kind === "aspect" ? (
            <AspectPanel aspect={aspect} onChange={(a) => dispatch({ type: "setAspect", aspect: a })} onDone={() => setEdit(null)} />
          ) : transitionIndex !== null ? (
            <TransitionPanel
              transition={clips[transitionIndex].transitionOut}
              maxDuration={Math.min(clipDuration(clips[transitionIndex]), clipDuration(clips[transitionIndex + 1]))}
              onChange={(t) => dispatch({ type: "updateClip", id: clips[transitionIndex].id, patch: { transitionOut: t } })}
              onApplyToAll={() => {
                const t = clips[transitionIndex].transitionOut;
                dispatch({ type: "batch", actions: clips.slice(0, -1).map((c) => ({ type: "updateClip", id: c.id, patch: { transitionOut: t } }) as const) });
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
              onApplyLookToAll={() => dispatch({ type: "batch", actions: clips.map((c) => ({ type: "updateClip", id: c.id, patch: { look: editClip.look } }) as const) })}
              onDone={() => setEdit(null)}
            />
                    ) : audioOpen ? (
            <AudioPanel
              audio={audio}
              time={time}
              recording={recorder.recording}
              selectedVoiceId={selectedVoiceId}
              onChange={setAudio}
              onBeatSync={runBeatSync}
              onVoiceChange={(id, patch) => dispatch({ type: "updateVoiceOver", id, patch })}
              onVoiceDelete={(id) => dispatch({ type: "removeVoiceOver", id })}
              onRecord={() => void startRecording()}
              onStopRecord={() => void stopRecording()}
              onDone={() => setAudioOpen(false)}
            />
          ) : selectedLayer ? (
            <LayerPanel
              layer={selectedLayer}
              name={(selectedLayer.kind === "video" ? assets[selectedLayer.assetId]?.name : images[selectedLayer.imageId]?.name) ?? "Layer"}
              index={layers.indexOf(selectedLayer)}
              count={layers.length}
              onChange={(patch) => patchLayer(selectedLayer.id, patch)}
              onOrder={(dir) => dispatch({ type: "orderLayer", id: selectedLayer.id, dir })}
              onDelete={() => dispatch({ type: "removeLayer", id: selectedLayer.id })}
              onDone={() => selectLayer(null)}
              anim={animControls(selectedLayer, true)}
              presets={presetControls(selectedLayer, true)}
            />
          ) : selectedOverlay ? (
            <OverlayPanel
              anim={animControls(selectedOverlay, false)}
              presets={presetControls(selectedOverlay, false)}
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
              brandColors={brand.colors}
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
              // Scrolls sideways on small phones (8 tools).
              <div className="flex gap-1 overflow-x-auto px-2 pt-2 text-[10px] font-semibold [scrollbar-width:none] [&>button]:min-w-[3.4rem] [&>button]:flex-1" data-testid="add-tools">
                <AddChip icon={<Sparkles size={16} />} label="Template" onClick={() => { pause(); setAudioOpen(false); setEdit(null); dispatch({ type: "selectOverlay", id: null }); setTemplateOpen("editor"); }} testId="tool-template" />
                <AddChip icon={<Type size={16} />} label="Text" onClick={() => addOverlay("text")} testId="tool-text" />
                <AddChip icon={<Smile size={16} />} label="Sticker" onClick={() => addOverlay("sticker")} testId="tool-sticker" />
                <AddChip icon={<MapPin size={16} />} label="Area" onClick={() => addOverlay("area")} testId="tool-area" />
                <AddChip icon={<Tag size={16} />} label="Deal" onClick={() => addOverlay("deal")} testId="tool-deal" />
                <AddChip icon={<Music size={16} />} label="Audio" onClick={() => { pause(); openAudio(); }} testId="tool-audio" />
                <AddChip icon={<LayersIcon size={16} />} label="Layer" onClick={() => layerInputRef.current?.click()} testId="tool-layer" />
                <AddChip icon={<BadgeCheck size={16} />} label="Brand" onClick={() => { pause(); setAudioOpen(false); setEdit(null); dispatch({ type: "selectOverlay", id: null }); setBrandOpen(true); }} testId="tool-brand" />
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
        </div>
      )}

      {showExport && (
        <Suspense fallback={null}>
          <ExportPanel clips={clips} overlays={overlays} layers={layers} images={images} audio={audio} assets={assets} aspect={aspect} onClose={() => setShowExport(false)} />
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

/** Small "Saved" / "Saving…" label in the header. */
function SaveBadge({ status }: { status: SaveStatus }) {
  const map: Record<SaveStatus, { text: string; cls: string } | null> = {
    idle: null,
    pending: { text: "Editing…", cls: "text-gray-500" },
    saving: { text: "Saving…", cls: "text-gray-400" },
    saved: { text: "Saved", cls: "text-gray-400" },
    "no-media": { text: "Saved (no videos)", cls: "text-yellow-400" },
    error: { text: "Not saved", cls: "text-red-400" },
  };
  const m = map[status];
  if (!m) return null;
  return (
    <span className={`ml-1 flex items-center gap-1 truncate text-[11px] ${m.cls}`} data-testid="save-status" data-status={status}>
      {status === "saving" && <Loader2 size={11} className="animate-spin" />}
      {(status === "error" || status === "no-media") && <CloudOff size={11} />}
      {m.text}
    </span>
  );
}
