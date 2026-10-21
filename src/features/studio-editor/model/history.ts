// Undo / redo around the editor reducer.
// Every edit pushes the previous state onto `past`. A drag or slider sends
// many small updates; those are merged into ONE undo step when they touch
// the same thing within a short time, so Undo jumps back to before the drag.

import { editorReducer, initialEditorState, type EditorAction } from "./reducer";
import type { EditorState } from "./types";

export const HISTORY_LIMIT = 100;
/** Updates to the same thing closer together than this are one undo step. */
const MERGE_MS = 1200;

export interface History {
  past: EditorState[];
  present: EditorState;
  future: EditorState[];
  /** Merge key + time of the last recorded edit. */
  lastKey: string | null;
  lastAt: number;
}

export type HistoryAction =
  | EditorAction
  | { type: "undo" }
  | { type: "redo" }
  /** Several edits as one undo step (e.g. "apply to all clips"). */
  | { type: "batch"; actions: EditorAction[] }
  /** Replace everything (open a draft). Clears history. */
  | { type: "load"; state: EditorState };

/** Selection changes are not edits: they never create an undo step. */
const NOT_UNDOABLE = new Set<EditorAction["type"]>(["select", "selectOverlay", "selectLayer"]);

const keysOf = (o: object) => Object.keys(o).sort().join(",");

/** Edits with the same key in quick succession are merged into one step. */
function mergeKey(a: EditorAction): string | null {
  switch (a.type) {
    case "trim": return `trim:${a.id}:${a.edge}`;
    case "updateOverlay": return `ov:${a.id}:${keysOf(a.patch)}`;
    case "updateVoiceOver": return `vo:${a.id}:${keysOf(a.patch)}`;
    case "updateClip": return `clip:${a.id}:${keysOf(a.patch)}`;
    case "setAudio": return `audio:${keysOf(a.patch)}`;
    case "updateLayer": return `layer:${a.id}:${keysOf(a.patch)}`;
    default: return null;
  }
}

export function initHistory(state: EditorState = initialEditorState): History {
  return { past: [], present: state, future: [], lastKey: null, lastAt: 0 };
}

/** After undo/redo, drop selections that point at things that no longer exist. */
function keepValidSelection(next: EditorState, current: EditorState): EditorState {
  const clipOk = current.selectedClipId && next.clips.some((c) => c.id === current.selectedClipId);
  const ovOk = current.selectedOverlayId && next.overlays.some((o) => o.id === current.selectedOverlayId);
  const layerOk = current.selectedLayerId && next.layers.some((l) => l.id === current.selectedLayerId);
  return {
    ...next,
    selectedClipId: clipOk ? current.selectedClipId : null,
    selectedOverlayId: ovOk ? current.selectedOverlayId : null,
    selectedLayerId: layerOk ? current.selectedLayerId : null,
  };
}

export function historyReducer(h: History, action: HistoryAction): History {
  switch (action.type) {
    case "undo": {
      if (!h.past.length) return h;
      const prev = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: keepValidSelection(prev, h.present),
        future: [h.present, ...h.future],
        lastKey: null,
        lastAt: 0,
      };
    }
    case "redo": {
      if (!h.future.length) return h;
      const [next, ...rest] = h.future;
      return {
        past: [...h.past, h.present].slice(-HISTORY_LIMIT),
        present: keepValidSelection(next, h.present),
        future: rest,
        lastKey: null,
        lastAt: 0,
      };
    }
    case "load":
      return initHistory(action.state);
    case "batch": {
      const next = action.actions.reduce(editorReducer, h.present);
      if (next === h.present) return h;
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [], lastKey: null, lastAt: 0 };
    }
    default: {
      const next = editorReducer(h.present, action);
      if (next === h.present) return h;
      if (NOT_UNDOABLE.has(action.type)) return { ...h, present: next, lastKey: null };
      const key = mergeKey(action);
      const now = Date.now();
      if (key && key === h.lastKey && now - h.lastAt < MERGE_MS) {
        // Same drag / slider still moving: update this step instead of adding one.
        return { ...h, present: next, lastAt: now };
      }
      return {
        past: [...h.past, h.present].slice(-HISTORY_LIMIT),
        present: next,
        future: [],
        lastKey: key,
        lastAt: now,
      };
    }
  }
}
