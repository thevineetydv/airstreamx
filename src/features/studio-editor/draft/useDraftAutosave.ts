// Saves the edit to a draft a moment after every change.

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorState } from "../model/types";
import { newDraftMeta, saveDraft } from "./drafts";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "no-media" | "error";

const DELAY_MS = 1200;

export function useDraftAutosave(state: EditorState) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const meta = useRef<{ id: string; name: string; createdAt: number } | null>(null);
  const saved = useRef(new Set<string>());
  const mediaOk = useRef(true);
  const timer = useRef<number | null>(null);
  const latest = useRef(state);
  latest.current = state;
  const running = useRef<Promise<void> | null>(null);

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const s = latest.current;
    if (!s.clips.length) return;
    // One save at a time; a change during a save is picked up right after.
    if (running.current) await running.current;
    meta.current ??= newDraftMeta();
    setStatus("saving");
    running.current = saveDraft(meta.current, s, saved.current, mediaOk.current)
      .then((ok) => {
        mediaOk.current = ok;
        setStatus(ok ? "saved" : "no-media");
      })
      .catch(() => setStatus("error"))
      .finally(() => { running.current = null; });
    await running.current;
  }, []);

  // Only real content changes start a save (not selection or playback).
  const { clips, overlays, audio, aspect } = state;
  const skipNext = useRef(false);
  useEffect(() => {
    if (!clips.length) return;
    if (skipNext.current) { skipNext.current = false; return; }
    setStatus("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), DELAY_MS);
  }, [clips, overlays, audio, aspect, flush]);

  // Leaving the editor: save right away instead of waiting.
  useEffect(() => () => { if (timer.current) void flush(); }, [flush]);

  /**
   * Continue an opened draft. `storedKeys` are files already in storage.
   * `needsSave` when files were picked again (they still have to be stored).
   */
  const adopt = useCallback((m: { id: string; name: string; createdAt: number }, storedKeys: string[], needsSave: boolean) => {
    meta.current = m;
    saved.current = new Set(storedKeys);
    mediaOk.current = true; // try again, there may be room now
    skipNext.current = !needsSave; // just opening is not an edit
    setStatus(needsSave ? "pending" : "saved");
  }, []);

  return { status, flush, adopt, draftId: meta.current?.id ?? null };
}
