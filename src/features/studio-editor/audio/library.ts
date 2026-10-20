// Built-in royalty-free music library (files in /public/studio-music).
// Only tracks listed in manifest.json can be used — no custom music uploads,
// so every exported video is safe to publish.

import type { MusicTrackInfo } from "../model/audio";

let manifest: Promise<MusicTrackInfo[]> | null = null;
const decoded = new Map<string, Promise<AudioBuffer>>();

export function loadLibrary(): Promise<MusicTrackInfo[]> {
  manifest ??= fetch("/studio-music/manifest.json")
    .then((r) => {
      if (!r.ok) throw new Error(`Music library failed to load (${r.status})`);
      return r.json() as Promise<{ tracks: MusicTrackInfo[] }>;
    })
    .then((m) => m.tracks)
    .catch((err) => {
      manifest = null; // allow retry
      throw err;
    });
  return manifest;
}

/** Download + decode a track once; later calls reuse the result. */
export function loadTrackBuffer(track: MusicTrackInfo, ctx: BaseAudioContext): Promise<AudioBuffer> {
  let p = decoded.get(track.id);
  if (!p) {
    p = fetch(track.url)
      .then((r) => {
        if (!r.ok) throw new Error(`Could not download "${track.title}"`);
        return r.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data))
      .catch((err) => {
        decoded.delete(track.id);
        throw err;
      });
    decoded.set(track.id, p);
  }
  return p;
}

/** The decoded buffer if it is already loaded (export needs it synchronously ready). */
export function getLoadedTrack(track: MusicTrackInfo): Promise<AudioBuffer> | undefined {
  return decoded.get(track.id);
}
