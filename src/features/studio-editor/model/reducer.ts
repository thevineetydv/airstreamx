// Editor state reducer. Every action is a plain object so Phase 6
// (undo/redo) can simply keep a history of states.

import { clipFromAsset, moveClip, removeClip, splitAt, trimClip } from "./timeline";
import type { EditorState, MediaAsset } from "./types";

export type EditorAction =
  | { type: "addAssets"; assets: MediaAsset[] }
  | { type: "select"; id: string | null }
  | { type: "split"; at: number }
  | { type: "delete"; id: string }
  | { type: "move"; id: string; dir: -1 | 1 }
  | { type: "trim"; id: string; edge: "in" | "out"; value: number };

export const initialEditorState: EditorState = {
  assets: {},
  clips: [],
  selectedClipId: null,
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
        assets,
        clips: [...state.clips, ...newClips],
        selectedClipId: newClips[0]?.id ?? state.selectedClipId,
      };
    }
    case "select":
      return { ...state, selectedClipId: action.id };
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
    default:
      return state;
  }
}
