// Editor state reducer. Every action is a plain object so Phase 6
// (undo/redo) can simply keep a history of states.

import { clipFromAsset, moveClip, removeClip, splitAt, trimClip } from "./timeline";
import type { EditorState, MediaAsset } from "./types";
import type { Overlay, OverlayPatch } from "./overlays";
import { initialAudio, type AudioSettings, type VoiceOver } from "./audio";
import { initialCaptions, type Caption, type CaptionSettings } from "./captions";
import type { AspectRatio } from "./look";
import type { Clip } from "./types";

export type EditorAction =
  | { type: "addAssets"; assets: MediaAsset[] }
  | { type: "select"; id: string | null }
  | { type: "split"; at: number }
  | { type: "delete"; id: string }
  | { type: "move"; id: string; dir: -1 | 1 }
  | { type: "trim"; id: string; edge: "in" | "out"; value: number }
  | { type: "addOverlay"; overlay: Overlay }
  | { type: "updateOverlay"; id: string; patch: OverlayPatch }
  | { type: "removeOverlay"; id: string }
  | { type: "selectOverlay"; id: string | null }
  | { type: "setAudio"; patch: Partial<AudioSettings> }
  | { type: "addVoiceOver"; voiceOver: VoiceOver }
  | { type: "updateVoiceOver"; id: string; patch: Partial<Pick<VoiceOver, "start" | "volume">> }
  | { type: "removeVoiceOver"; id: string }
  | { type: "setCaptions"; patch: Partial<CaptionSettings> }
  | { type: "editCaption"; id: string; patch: Partial<Caption> }
  | { type: "removeCaption"; id: string }
  | { type: "addCaption"; caption: Caption }
  | { type: "updateClip"; id: string; patch: Partial<Pick<Clip, "speed" | "look" | "fit" | "panX" | "panY" | "transitionOut">> }
  | { type: "setAspect"; aspect: AspectRatio };

export const initialEditorState: EditorState = {
  assets: {},
  clips: [],
  selectedClipId: null,
  overlays: [],
  selectedOverlayId: null,
  audio: initialAudio,
  captions: initialCaptions,
  aspect: "auto",
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
      return { ...state, selectedClipId: action.id, selectedOverlayId: action.id ? null : state.selectedOverlayId };
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
      return { ...state, overlays: [...state.overlays, action.overlay], selectedOverlayId: action.overlay.id, selectedClipId: null };
    case "updateOverlay":
      return {
        ...state,
        overlays: state.overlays.map((o) => (o.id === action.id ? ({ ...o, ...action.patch } as Overlay) : o)),
      };
    case "removeOverlay":
      return {
        ...state,
        overlays: state.overlays.filter((o) => o.id !== action.id),
        selectedOverlayId: state.selectedOverlayId === action.id ? null : state.selectedOverlayId,
      };
    case "selectOverlay":
      return { ...state, selectedOverlayId: action.id, selectedClipId: action.id ? null : state.selectedClipId };
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
    case "setCaptions":
      return { ...state, captions: { ...state.captions, ...action.patch } };
    case "editCaption":
      return {
        ...state,
        captions: { ...state.captions, items: state.captions.items.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) },
      };
    case "removeCaption":
      return { ...state, captions: { ...state.captions, items: state.captions.items.filter((c) => c.id !== action.id) } };
    case "addCaption":
      return { ...state, captions: { ...state.captions, items: [...state.captions.items, action.caption] } };
    case "updateClip":
      return { ...state, clips: state.clips.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)) };
    case "setAspect":
      return { ...state, aspect: action.aspect };
    default:
      return state;
  }
}
