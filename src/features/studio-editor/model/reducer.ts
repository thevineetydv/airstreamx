// Editor state reducer. Every action is a plain object so Phase 6
// (undo/redo) can simply keep a history of states.

import { clipFromAsset, moveClip, moveClipTo, removeClip, splitAt, trimClip } from "./timeline";
import type { EditorState, MediaAsset } from "./types";
import type { Overlay, OverlayPatch } from "./overlays";
import { initialAudio, type AudioSettings, type VoiceOver } from "./audio";
import type { AspectRatio } from "./look";
import type { Clip } from "./types";
import { clampKeyframes } from "./keyframes";
import { layerEnd, type ImageAsset, type Layer, type LayerPatch } from "./layers";
import { lookFor, type TemplateResult } from "./templates";
import type { MusicTrackInfo } from "./audio";

export type EditorAction =
  | { type: "addAssets"; assets: MediaAsset[] }
  | { type: "select"; id: string | null }
  | { type: "split"; at: number }
  | { type: "delete"; id: string }
  | { type: "move"; id: string; dir: -1 | 1 }
  | { type: "moveTo"; id: string; index: number }
  | { type: "trim"; id: string; edge: "in" | "out"; value: number }
  | { type: "addOverlay"; overlay: Overlay }
  | { type: "updateOverlay"; id: string; patch: OverlayPatch }
  | { type: "removeOverlay"; id: string }
  | { type: "selectOverlay"; id: string | null }
  | { type: "setAudio"; patch: Partial<AudioSettings> }
  | { type: "addVoiceOver"; voiceOver: VoiceOver }
  | { type: "updateVoiceOver"; id: string; patch: Partial<Pick<VoiceOver, "start" | "volume">> }
  | { type: "removeVoiceOver"; id: string }
  | { type: "updateClip"; id: string; patch: Partial<Pick<Clip, "speed" | "look" | "fit" | "panX" | "panY" | "transitionOut">> }
  | { type: "setAspect"; aspect: AspectRatio }
  | { type: "addLayer"; layer: Layer; asset?: MediaAsset; image?: ImageAsset }
  | { type: "updateLayer"; id: string; patch: LayerPatch }
  | { type: "removeLayer"; id: string }
  | { type: "selectLayer"; id: string | null }
  | { type: "orderLayer"; id: string; dir: -1 | 1 }
  /** Apply a template (Phase 8). Replaces items from an earlier template. */
  | { type: "applyTemplate"; result: TemplateResult; music: MusicTrackInfo | null };

export const initialEditorState: EditorState = {
  assets: {},
  clips: [],
  selectedClipId: null,
  overlays: [],
  selectedOverlayId: null,
  audio: initialAudio,
  // Most creators post Shorts / Reels, so new projects start vertical.
  // "Auto" (follow the first video) is still one tap away in Canvas.
  aspect: "9:16",
  layers: [],
  selectedLayerId: null,
  images: {},
};

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "addAssets": {
      const assets = { ...state.assets };
      const newClips = action.assets.map((a) => {
        assets[a.id] = a;
        return clipFromAsset(a);
      });
      return {
        ...state,
        assets,
        clips: [...state.clips, ...newClips],
        // Nothing selected after import, so the "add text / sticker / audio…" row is visible.
        // Tapping a clip shows that clip's tools.
        selectedClipId: null,
        selectedOverlayId: null,
      };
    }
    // Only one thing is selected at a time: a clip OR an overlay.
    case "select":
      return {
        ...state,
        selectedClipId: action.id,
        selectedOverlayId: action.id ? null : state.selectedOverlayId,
        selectedLayerId: action.id ? null : state.selectedLayerId,
      };
    case "split": {
      const { clips, rightId } = splitAt(state.clips, action.at);
      if (!rightId) return state;
      return { ...state, clips, selectedClipId: rightId };
    }
    case "delete": {
      const clips = removeClip(state.clips, action.id);
      return {
        ...state,
        clips,
        selectedClipId: state.selectedClipId === action.id ? null : state.selectedClipId,
      };
    }
    case "move":
      return { ...state, clips: moveClip(state.clips, action.id, action.dir) };
    case "moveTo": {
      const clips = moveClipTo(state.clips, action.id, action.index);
      return clips === state.clips ? state : { ...state, clips, selectedClipId: action.id };
    }
    case "trim": {
      const clip = state.clips.find((c) => c.id === action.id);
      const asset = clip ? state.assets[clip.assetId] : undefined;
      if (!clip || !asset) return state;
      return {
        ...state,
        clips: trimClip(state.clips, action.id, action.edge, action.value, asset.duration),
      };
    }
    case "addOverlay":
      return { ...state, overlays: [...state.overlays, action.overlay], selectedOverlayId: action.overlay.id, selectedClipId: null, selectedLayerId: null };
    case "updateOverlay":
      return {
        ...state,
        overlays: state.overlays.map((o) => {
          if (o.id !== action.id) return o;
          const next = { ...o, ...action.patch } as Overlay;
          return { ...next, keyframes: clampKeyframes(next.keyframes, next.end - next.start) };
        }),
      };
    case "removeOverlay":
      return {
        ...state,
        overlays: state.overlays.filter((o) => o.id !== action.id),
        selectedOverlayId: state.selectedOverlayId === action.id ? null : state.selectedOverlayId,
      };
    case "selectOverlay":
      return {
        ...state,
        selectedOverlayId: action.id,
        selectedClipId: action.id ? null : state.selectedClipId,
        selectedLayerId: action.id ? null : state.selectedLayerId,
      };
    case "setAudio":
      return { ...state, audio: { ...state.audio, ...action.patch } };
    case "addVoiceOver":
      return { ...state, audio: { ...state.audio, voiceOvers: [...state.audio.voiceOvers, action.voiceOver] } };
    case "updateVoiceOver":
      return {
        ...state,
        audio: {
          ...state.audio,
          voiceOvers: state.audio.voiceOvers.map((v) => (v.id === action.id ? { ...v, ...action.patch } : v)),
        },
      };
    case "removeVoiceOver":
      return {
        ...state,
        audio: { ...state.audio, voiceOvers: state.audio.voiceOvers.filter((v) => v.id !== action.id) },
      };
    case "updateClip":
      return { ...state, clips: state.clips.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) };
    case "setAspect":
      return { ...state, aspect: action.aspect };
    case "addLayer":
      return {
        ...state,
        assets: action.asset ? { ...state.assets, [action.asset.id]: action.asset } : state.assets,
        images: action.image ? { ...state.images, [action.image.id]: action.image } : state.images,
        layers: [...state.layers, action.layer],
        selectedLayerId: action.layer.id,
        selectedClipId: null,
        selectedOverlayId: null,
      };
    case "updateLayer":
      return {
        ...state,
        layers: state.layers.map((l) => {
          if (l.id !== action.id) return l;
          const next = { ...l, ...action.patch } as Layer;
          // Keyframes past a shortened layer are dropped.
          return { ...next, keyframes: clampKeyframes(next.keyframes, layerEnd(next) - next.start) };
        }),
      };
    case "removeLayer":
      return {
        ...state,
        layers: state.layers.filter((l) => l.id !== action.id),
        selectedLayerId: state.selectedLayerId === action.id ? null : state.selectedLayerId,
      };
    case "selectLayer":
      return {
        ...state,
        selectedLayerId: action.id,
        selectedClipId: action.id ? null : state.selectedClipId,
        selectedOverlayId: action.id ? null : state.selectedOverlayId,
      };
    case "orderLayer": {
      const i = state.layers.findIndex((l) => l.id === action.id);
      const j = i + action.dir;
      if (i < 0 || j < 0 || j >= state.layers.length) return state;
      const layers = state.layers.slice();
      [layers[i], layers[j]] = [layers[j], layers[i]];
      return { ...state, layers };
    }
    case "applyTemplate": {
      const r = action.result;
      const last = state.clips.length - 1;
      return {
        ...state,
        // Items from an earlier template go; things the creator added by hand stay.
        overlays: [...state.overlays.filter((o) => !o.template), ...r.overlays],
        aspect: r.aspect,
        clips: state.clips.map((c, i) => ({
          ...c,
          look: lookFor(r.filter),
          fit: r.fit,
          transitionOut: i < last ? r.transition : c.transitionOut,
        })),
        audio: action.music
          ? { ...state.audio, music: { track: action.music, volume: r.musicVolume, fadeOut: true }, duckMusic: true }
          : state.audio,
        selectedClipId: null,
        selectedOverlayId: null,
        selectedLayerId: null,
      };
    }
    default:
      return state;
  }
}
