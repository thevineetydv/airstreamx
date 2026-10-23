// Editor view preferences, kept on this device:
//   more — "More options" sections open (style, font, animation…)
//   pro  — Pro mode: show keyframe tools
// Shared by all panels through a tiny store (useSyncExternalStore).

import { useSyncExternalStore } from "react";

export interface EditorPrefs {
  more: boolean;
  pro: boolean;
}

const KEY = "studio-editor-prefs";
const listeners = new Set<() => void>();

function load(): EditorPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<EditorPrefs>;
    return { more: p.more === true, pro: p.pro === true };
  } catch {
    return { more: false, pro: false };
  }
}

let current = load();

export function setPrefs(patch: Partial<EditorPrefs>) {
  current = { ...current, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* private mode: keep in memory */ }
  listeners.forEach((l) => l());
}

export function usePrefs(): EditorPrefs {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => current,
  );
}
