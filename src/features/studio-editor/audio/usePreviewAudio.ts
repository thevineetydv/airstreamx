// Plays music + voice-overs in sync with the preview.
// (The clips' own sound is played by the preview's <video> elements.)
// Uses the same envelope (fade-out, ducking) as the export.
// Trade-off: music can drift by ~0.1 s from the picture in preview (separate clocks).
// The exported file is mixed sample-accurately and has no drift.

import { useEffect, useRef } from "react";
import { applyEnvelope, musicEnvelope, voiceOverEnd, type AudioSettings } from "../model/audio";
import { getAudioContext } from "./context";
import { loadTrackBuffer } from "./library";

interface Options {
  playing: boolean;
  time: number;
  total: number;
  audio: AudioSettings;
  /** While recording a voice-over everything is silent, so the mic does not pick up the preview. */
  recording: boolean;
}

export function usePreviewAudio({ playing, time, total, audio, recording }: Options) {
  const timeRef = useRef(time);
  timeRef.current = time;

  // Music + voice-overs: (re)start whenever playback starts or the settings change.
  useEffect(() => {
    if (!playing || recording) return;
    if (!audio.music && audio.voiceOvers.length === 0) return;
    const ctx = getAudioContext();
    void ctx.resume();
    const from = timeRef.current;
    const when = ctx.currentTime + 0.05;
    const nodes: AudioScheduledSourceNode[] = [];
    let cancelled = false;

    const out = ctx.createGain();
    out.connect(ctx.destination);

    if (audio.music) {
      const music = audio.music;
      loadTrackBuffer(music.track, ctx).then((buffer) => {
        if (cancelled) return;
        const gain = ctx.createGain();
        // If decoding took a moment, start from where the picture is now.
        const now = ctx.currentTime;
        const offsetT = from + Math.max(0, now - when);
        const startAt = Math.max(now, when);
        applyEnvelope(gain.gain, musicEnvelope(audio, total), startAt, offsetT, total);
        gain.connect(out);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(gain);
        src.start(startAt, ((music.offset ?? 0) + offsetT) % buffer.duration);
        // Stop at the end of the video.
        src.stop(startAt + Math.max(0, total - offsetT));
        nodes.push(src);
      }).catch(() => { /* the panel shows load errors */ });
    }

    for (const v of audio.voiceOvers) {
      if (voiceOverEnd(v) <= from || v.start >= total) continue;
      const gain = ctx.createGain();
      gain.gain.value = v.volume;
      gain.connect(out);
      const src = ctx.createBufferSource();
      src.buffer = v.buffer;
      src.connect(gain);
      const offset = Math.max(0, from - v.start);
      const dur = Math.min(v.buffer.duration, total - v.start) - offset;
      if (dur <= 0) continue;
      src.start(when + Math.max(0, v.start - from), offset, dur);
      nodes.push(src);
    }

    return () => {
      cancelled = true;
      for (const n of nodes) { try { n.stop(); } catch { /* already stopped */ } }
      out.disconnect();
    };
  }, [playing, recording, audio, total]);
}
