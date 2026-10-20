// Captions (subtitles). Times are TIMELINE seconds, like overlays.

import { newId } from "./timeline";

export type CaptionLanguage = "hindi" | "english";
export type CaptionPosition = "bottom" | "middle" | "top";
export type CaptionLook = "box" | "outline" | "yellow";

export interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
}

export interface CaptionSettings {
  items: Caption[];
  language: CaptionLanguage;
  position: CaptionPosition;
  look: CaptionLook;
  /** Size multiplier, 1 = default. */
  scale: number;
  /** Draw captions into the video pixels (works on every player). */
  burnIn: boolean;
  /** Also add a subtitle track to the MP4 and offer an .srt download. */
  subtitleTrack: boolean;
}

export const initialCaptions: CaptionSettings = {
  items: [],
  language: "hindi",
  position: "bottom",
  look: "box",
  scale: 1,
  burnIn: true,
  subtitleTrack: false,
};

/** Longest line we show before splitting a caption into two. */
const MAX_CHARS = 42;
export const MIN_CAPTION = 0.4;

/** A piece of speech-recognition output, in timeline seconds. */
export interface SpeechChunk {
  start: number;
  end: number | null;
  text: string;
}

// Whisper sometimes "hears" these in silence or music.
const NOISE = /^\s*([[(（].*[\])）]|♪+|\.+|-+)\s*$/;

/**
 * Turn recognition chunks into short, readable captions.
 * Long chunks are split by words; time is shared out by text length.
 */
export function chunksToCaptions(chunks: SpeechChunk[], total: number): Caption[] {
  const out: Caption[] = [];
  let lastText = "";
  chunks.forEach((c, i) => {
    const text = c.text.replace(/\s+/g, " ").trim();
    if (!text || NOISE.test(text)) return;
    if (text === lastText) return; // repeated line = typical hallucination
    lastText = text;
    const start = Math.max(0, c.start);
    const next = chunks[i + 1];
    const end = Math.min(total, c.end ?? next?.start ?? Math.min(total, start + 3));
    if (end - start < 0.1) return;

    const words = text.split(" ");
    const parts: string[] = [];
    let line = "";
    for (const w of words) {
      if (line && (line + " " + w).length > MAX_CHARS) { parts.push(line); line = w; }
      else line = line ? `${line} ${w}` : w;
    }
    if (line) parts.push(line);

    const totalChars = parts.reduce((n, p) => n + p.length, 0);
    let t = start;
    for (const p of parts) {
      const len = ((end - start) * p.length) / totalChars;
      out.push({ id: newId("cap"), start: t, end: Math.min(end, t + len), text: p });
      t += len;
    }
  });
  return out;
}

export function captionAt(items: Caption[], t: number): Caption | undefined {
  return items.find((c) => t >= c.start && t < c.end);
}

/** New empty caption at the playhead (for words the recogniser missed). */
export function manualCaption(t: number, total: number, items: Caption[]): Caption {
  const nextStart = items.filter((c) => c.start > t).reduce((m, c) => Math.min(m, c.start), total);
  const end = Math.min(total, nextStart, t + 2);
  return { id: newId("cap"), start: t, end: Math.max(end, Math.min(total, t + MIN_CAPTION)), text: "" };
}

function stamp(t: number, sep: "," | "."): string {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(r, 3)}`;
}

const usable = (items: Caption[]) =>
  [...items].filter((c) => c.text.trim() && c.end > c.start).sort((a, b) => a.start - b.start);

/** SubRip (.srt) — works in VLC, MX Player, YouTube, most editors. */
export function toSrt(items: Caption[]): string {
  return usable(items)
    .map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text.trim()}\n`)
    .join("\n");
}

/** WebVTT — used for the subtitle track inside the MP4. */
export function toVtt(items: Caption[]): string {
  const cues = usable(items).map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text.trim()}\n`);
  return `WEBVTT\n\n${cues.join("\n")}`;
}

export const LANGUAGE_CODE: Record<CaptionLanguage, string> = { hindi: "hin", english: "eng" };
