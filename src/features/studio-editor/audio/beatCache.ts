// Beat analysis of library tracks, done once per track per session.

import type { MusicBeat, MusicTrackInfo } from "../model/audio";
import { bestStart, detectBeats, type BeatInfo } from "./beats";
import { loadTrackBuffer } from "./library";

const cache = new Map<string, Promise<BeatInfo>>();

/** Below this the track has no clear beat (e.g. ambient) and we don't sync. */
export const MIN_CONFIDENCE = 0.3;

export function analyzeTrack(track: MusicTrackInfo): Promise<BeatInfo> {
  let p = cache.get(track.id);
  if (!p) {
    p = loadTrackBuffer(track, new OfflineAudioContext(1, 1, 44100)).then((buf) => {
      // Mix to mono for analysis.
      const mono = new Float32Array(buf.length);
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) mono[i] += d[i] / buf.numberOfChannels;
      }
      return detectBeats(mono, buf.sampleRate);
    });
    p.catch(() => cache.delete(track.id));
    cache.set(track.id, p);
  }
  return p;
}

/**
 * Everything the "beatSync" action needs, or null when the track has no
 * clear beat. Starts the video at the liveliest part of the track.
 */
export async function beatSyncFor(track: MusicTrackInfo, videoLength: number): Promise<{ beat: MusicBeat; offset: number; bpm: number } | null> {
  const info = await analyzeTrack(track);
  if (info.confidence < MIN_CONFIDENCE || info.beats.length < 4) return null;
  const beat: MusicBeat = { bpm: Math.round(info.bpm * 10) / 10, beats: info.beats.map((b) => Math.round(b * 1000) / 1000), downbeat: info.downbeat };
  return { beat, offset: bestStart(info, videoLength, track.duration), bpm: beat.bpm };
}
