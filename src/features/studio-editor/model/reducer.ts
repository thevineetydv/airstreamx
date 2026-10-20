// Editor state reducer. Every action is a plain object so Phase 6
// (undo/redo) can simply keep a history of states.

import { clipFromAsset, moveClip, removeClip, splitAt, trimClip } from "./timeline";
import type { EditorState, MediaAsset } from "./types";
import type { Overlay, OverlayPatch } from "./overlays";

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
  | { type: "selectOverlay"; id: string | null };

export const initialEditorState: EditorState = {
  assets: {},
  clips: [],
  selectedClipId: null,
  overlays: [],
  selectedOverlayId: null,
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
        selectedClipId: newClips[0]?.id ?? state.selectedClipId,
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
    default:
      return state;
  }
}
