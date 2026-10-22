// Audio settings for the edit: original sound, background music, voice-overs.
// Times are TIMELINE seconds. Volumes are 0..1.

import { newId } from "./timeline";

export interface MusicTrackInfo {
  id: string;
  title: string;
  mood: string;
  goodFor: string;
  url: string;
  duration: number;
  license: string;
}

export interface MusicSettings {
  track: MusicTrackInfo;
  volume: number;
  /** Fade the music out over the last FADE_OUT seconds of the video. */
  fadeOut: boolean;
  /** Where in the track the video starts (seconds). Missing = 0. */
  offset?: number;
  /** Beat grid of the track, set by "Beat sync" (track seconds). */
  beat?: MusicBeat;
}

export interface MusicBeat {
  bpm: number;
  beats: number[];
  /** Index of the first bar start in `beats` (bars = every 4 beats). */
  downbeat: number;
}

/** Track position for timeline time t (music loops). */
export function musicPosition(m: MusicSettings, t: number, trackDuration: number): number {
  const p = (m.offset ?? 0) + t;
  return trackDuration > 0 ? p % trackDuration : p;
}

export interface VoiceOver {
  id: string;
  /** Decoded audio, used for preview and export. */
  buffer: AudioBuffer;
  start: number;
  volume: number;
}

export interface AudioSettings {
  originalVolume: number;
  originalMuted: boolean;
  music: MusicSettings | null;
  voiceOvers: VoiceOver[];
  /** Lower the music while a voice-over is speaking. */
  duckMusic: boolean;
}

export const initialAudio: AudioSettings = {
  originalVolume: 1,
  originalMuted: false,
  music: null,
  voiceOvers: [],
  duckMusic: true,
};

export const FADE_OUT = 2;
/** Music level while a voice-over plays, as a fraction of its normal level. */
export const DUCK_LEVEL = 0.3;
/** Ramp time for ducking so it never "clicks". */
const DUCK_RAMP = 0.25;

export function newVoiceOver(buffer: AudioBuffer, start: number): VoiceOver {
  return { id: newId("vo"), buffer, start, volume: 1 };
}

export function voiceOverEnd(v: VoiceOver): number {
  return v.start + v.buffer.duration;
}

export function originalGain(a: AudioSettings): number {
  return a.originalMuted ? 0 : a.originalVolume;
}

/**
 * Music volume over time as a list of points (timeline time, gain), joined by
 * straight lines. Shared by preview and export so both sound the same.
 */
export function musicEnvelope(a: AudioSettings, total: number): { t: number; g: number }[] {
  if (!a.music) return [];
  const base = a.music.volume;
  const pts: { t: number; g: number }[] = [{ t: 0, g: base }];

  if (a.duckMusic) {
    // Merge overlapping voice-overs into speaking ranges.
    const ranges = a.voiceOvers
      .map((v) => [Math.max(0, v.start), Math.min(total, voiceOverEnd(v))] as [number, number])
      .filter(([s, e]) => e > s)
      .sort((x, y) => x[0] - y[0]);
    const merged: [number, number][] = [];
    for (const r of ranges) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + DUCK_RAMP * 2) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    }
    for (const [s, e] of merged) {
      const down = Math.max(0, s - DUCK_RAMP);
      pts.push({ t: down, g: base }, { t: s, g: base * DUCK_LEVEL }, { t: e, g: base * DUCK_LEVEL }, { t: e + DUCK_RAMP, g: base });
    }
  }

  if (a.music.fadeOut && total > FADE_OUT) {
    const fadeStart = total - FADE_OUT;
    const before = gainAt(pts, fadeStart);
    const kept = pts.filter((p) => p.t < fadeStart);
    kept.push({ t: fadeStart, g: before }, { t: total, g: 0 });
    return kept;
  }
  return pts.sort((x, y) => x.t - y.t);
}

/** Gain at time t from an envelope (linear between points). */
export function gainAt(pts: { t: number; g: number }[], t: number): number {
  if (!pts.length) return 0;
  const sorted = [...pts].sort((x, y) => x.t - y.t);
  if (t <= sorted[0].t) return sorted[0].g;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1], b = sorted[i];
    if (t <= b.t) {
      const span = b.t - a.t;
      return span <= 0 ? b.g : a.g + ((t - a.t) / span) * (b.g - a.g);
    }
  }
  return sorted[sorted.length - 1].g;
}

/**
 * Apply an envelope to a GainNode. `offset` = timeline time that matches
 * context time `when` (so the same envelope works for any window).
 */
export function applyEnvelope(param: AudioParam, pts: { t: number; g: number }[], when: number, offset: number, until: number) {
  param.cancelScheduledValues(0);
  param.setValueAtTime(gainAt(pts, offset), when);
  for (const p of [...pts].sort((x, y) => x.t - y.t)) {
    if (p.t <= offset || p.t > until) continue;
    param.linearRampToValueAtTime(p.g, when + (p.t - offset));
  }
  // Land exactly on the right value at the end of the window.
  if (until > offset) param.linearRampToValueAtTime(gainAt(pts, until), when + (until - offset));
}
