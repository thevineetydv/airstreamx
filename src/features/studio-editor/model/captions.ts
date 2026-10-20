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
const HAS_LETTER = /\p{L}/u;
const WRONG_SCRIPT: Record<CaptionLanguage, RegExp> = {
  hindi: /[\u0600-\u06FF\u0400-\u04FF]/g, // Urdu / Cyrillic in Hindi mode
  // Plain Unicode ranges; the lint rule is about combined emoji, not ranges like this.
  // eslint-disable-next-line no-misleading-character-class
  english: /[\u0600-\u06FF\u0400-\u04FF\u0900-\u097F]/g,
};

/**
 * True for typical Whisper junk on music / singing:
 * "ai ai ai ai…", "NANANANA…", "पार तुड पार तुड…", numbers only, wrong script.
 */
export function isJunkLine(text: string, language: CaptionLanguage): boolean {
  if (!HAS_LETTER.test(text)) return true; // "1.000", "..."
  if (/(.{1,8}?)\1{5,}/u.test(text.replace(/\s+/g, ""))) return true; // same few letters over and over
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length >= 6 && new Set(words).size / words.length < 0.4) return true; // few words, repeated
  if (hasLoop(words)) return true; // "पार तुड पार तुड पार तुड"
  const letters = text.match(/\p{L}/gu)?.length ?? 1;
  const wrong = text.match(WRONG_SCRIPT[language])?.length ?? 0;
  return wrong / letters > 0.3;
}

/** A run of 1–3 words repeated back-to-back (4+ times for one word, 3+ times for 2–3 words). */
function hasLoop(words: string[]): boolean {
  for (let n = 1; n <= 3; n++) {
    const need = n === 1 ? 4 : 3;
    for (let i = 0; i + n * need <= words.length; i++) {
      const gram = words.slice(i, i + n).join(" ");
      let k = 1;
      while (words.slice(i + k * n, i + (k + 1) * n).join(" ") === gram) k++;
      if (k >= need) return true;
    }
  }
  return false;
}

/** How long a line needs on screen to be read (≈ 14 characters per second). */
function readingTime(text: string): number {
  return Math.max(1.2, 0.6 + text.length / 14);
}

/**
 * Turn recognition chunks into short, readable captions.
 * Long chunks are split by words; time is shared out by text length.
 */
export function chunksToCaptions(chunks: SpeechChunk[], total: number, language: CaptionLanguage = "hindi"): Caption[] {
  const out: Caption[] = [];
  let lastText = "";
  chunks.forEach((c, i) => {
    const text = c.text.replace(/\s+/g, " ").trim();
    if (!text || NOISE.test(text) || isJunkLine(text, language)) return;
    if (text === lastText) return; // repeated line = typical hallucination
    lastText = text;
    const start = Math.max(0, c.start);
    const next = chunks[i + 1];
    let end = Math.min(total, c.end ?? next?.start ?? Math.min(total, start + 3));
    // On songs Whisper often stretches one short line over a long music gap.
    // Show it only as long as it takes to read, so it doesn't hang on screen.
    end = Math.min(end, start + readingTime(text));
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
