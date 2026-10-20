// One shared AudioContext for preview playback and decoding.
// Created lazily (browsers only allow audio after a user tap).

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  ctx ??= new AudioContext({ latencyHint: "interactive" });
  return ctx;
}
