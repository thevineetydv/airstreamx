// Plays the timeline with TWO <video> elements.
// Clip k always plays on element k % 2, so the next clip is already loaded and
// waiting while the current one plays: cuts are smooth, and during a transition
// both clips play at once (mixed with CSS by PreviewStage).
//
// Each element runs at its clip's speed. Time is read from the element of the
// clip under the playhead. Trade-off: during a transition the two elements can
// drift a few frames apart; the exported file is frame-exact.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { clipEnds, clipStarts, frameLayers, sourceAt, totalDuration, transitionAfter } from "../model/timeline";
import type { Clip, MediaAsset } from "../model/types";

type VideoRefs = readonly [RefObject<HTMLVideoElement | null>, RefObject<HTMLVideoElement | null>];

interface Options {
  videoRefs: VideoRefs;
  clips: Clip[];
  assets: Record<string, MediaAsset>;
  /** Original sound level 0..1 (0 = muted). */
  originalGain: number;
}

const END_GUARD = 0.04;

export function usePreviewEngine({ videoRefs, clips, assets, originalGain }: Options) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Latest values for the animation loop.
  const clipsRef = useRef(clips);
  const assetsRef = useRef(assets);
  const gainRef = useRef(originalGain);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  clipsRef.current = clips;
  assetsRef.current = assets;
  gainRef.current = originalGain;

  const duration = totalDuration(clips);

  const updateTime = useCallback((t: number) => {
    timeRef.current = t;
    setTime(t);
  }, []);

  const els = () => [videoRefs[0].current, videoRefs[1].current] as const;

  /** Point an element at clip k, source time `src`, playing or paused. */
  const place = useCallback((el: HTMLVideoElement, k: number, src: number, play: boolean) => {
    const clip = clipsRef.current[k];
    const asset = assetsRef.current[clip.assetId];
    if (!asset) return;
    if (el.dataset.assetId !== asset.id) {
      el.dataset.assetId = asset.id;
      el.src = asset.url;
    }
    el.dataset.clip = String(k);
    if (el.playbackRate !== clip.speed) el.playbackRate = clip.speed;
    // Match the export, where speed also changes pitch.
    (el as HTMLVideoElement & { preservesPitch?: boolean }).preservesPitch = false;

    const last = Math.max(0, asset.duration - END_GUARD);
    const target = Math.min(Math.max(0, src), last);
    // Before the file starts or after it ends: hold the first / last frame.
    const hold = src < 0 || src >= last;
    if (play && !hold) {
      if (el.paused) {
        if (Math.abs(el.currentTime - target) > 0.1) el.currentTime = target;
        void el.play().catch(() => undefined);
      } else if (Math.abs(el.currentTime - target) > 0.35) {
        el.currentTime = target; // large drift: resync
      }
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - target) > 0.01) el.currentTime = target;
    }
  }, []);

  const setVolume = (el: HTMLVideoElement, weight: number) => {
    const g = Math.min(1, Math.max(0, gainRef.current * weight));
    el.muted = g <= 0;
    el.volume = g;
  };

  /** Make both elements show / play what belongs at time t. */
  const sync = useCallback((t: number, play: boolean) => {
    const list = clipsRef.current;
    const [e0, e1] = els();
    if (!e0 || !e1 || !list.length) return;
    const starts = clipStarts(list);
    const ends = clipEnds(list, starts);
    const L = frameLayers(list, t, starts, ends);
    if (!L) return;
    const used = new Set<number>();
    const show = (k: number, weight: number) => {
      const el = k % 2 === 0 ? e0 : e1;
      used.add(k % 2);
      place(el, k, sourceAt(list[k], t - starts[k]), play);
      setVolume(el, weight);
    };
    // Sound cross-fades linearly over the transition, like the export.
    show(L.a.index, L.b ? 1 - L.p : 1);
    if (L.b) show(L.b.index, L.p);

    // The free element waits on the next clip, paused at the frame where it first appears.
    const current = L.b ? L.b.index : L.a.index;
    const next = current + 1;
    if (next < list.length && !used.has(next % 2)) {
      const el = next % 2 === 0 ? e0 : e1;
      const firstVisible = ends[current] - transitionAfter(list, current) / 2;
      place(el, next, sourceAt(list[next], firstVisible - starts[next]), false);
      el.muted = true;
    } else {
      for (const slot of [0, 1]) if (!used.has(slot)) { const el = slot === 0 ? e0 : e1; el.pause(); el.muted = true; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    for (const el of els()) el?.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seek = useCallback((t: number) => {
    const clamped = Math.min(Math.max(t, 0), totalDuration(clipsRef.current));
    updateTime(clamped);
    sync(clamped, playingRef.current);
  }, [sync, updateTime]);

  /** Start playback. Resolves once the video is actually playing (used to line up voice-over). */
  const play = useCallback(async () => {
    const list = clipsRef.current;
    const total = totalDuration(list);
    if (!list.length || total <= 0) return;
    let start = timeRef.current;
    if (start >= total - 0.05) start = 0; // restart from the beginning at the end
    updateTime(start);
    playingRef.current = true;
    setPlaying(true);
    sync(start, true);
    const starts = clipStarts(list);
    const ends = clipEnds(list, starts);
    const owner = Math.max(0, ends.findIndex((e) => start < e));
    const el = els()[owner % 2];
    try { await el?.play(); } catch { /* autoplay blocked: user taps play again */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync, updateTime]);

  // Animation loop while playing: read time from the clip under the playhead, keep both elements in step.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      if (!playingRef.current) return;
      const list = clipsRef.current;
      const starts = clipStarts(list);
      const ends = clipEnds(list, starts);
      const total = ends[ends.length - 1] ?? 0;
      const now = timeRef.current;
      const owner = Math.max(0, ends.findIndex((e) => now < e));
      const clip = list[owner];
      const el = els()[owner % 2];
      let t = now;
      if (el && clip && el.dataset.clip === String(owner) && el.readyState >= 2 && !el.seeking && !el.paused) {
        const fromVideo = starts[owner] + (el.currentTime - clip.inPoint) / clip.speed;
        // Ignore small backwards jumps right after a seek or handover.
        if (fromVideo >= now - 0.05) t = fromVideo;
      } else if (el && el.paused && clip) {
        const asset = assetsRef.current[clip.assetId];
        if (el.ended || (asset && el.currentTime >= asset.duration - 0.1)) {
          // The file ran out right at the clip's end: move on to the next clip.
          t = Math.max(now, ends[owner]);
        } else {
          // The next clip's element was waiting paused: sync() below starts it.
          t = Math.max(now, starts[owner]);
        }
      }
      if (t >= total - 0.02) {
        pause();
        updateTime(total);
        sync(total, false);
        return;
      }
      if (t !== now) updateTime(t);
      sync(t, true);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, pause, sync, updateTime]);

  // Timeline changed (trim, split, speed, transition…): stop, keep the playhead valid, show the frame.
  useEffect(() => {
    const total = totalDuration(clips);
    if (playingRef.current) pause();
    const t = Math.min(timeRef.current, total);
    updateTime(t);
    if (clips.length > 0) sync(t, false);
  }, [clips, pause, sync, updateTime]);

  // Volume change: apply at once.
  useEffect(() => {
    sync(timeRef.current, playingRef.current);
  }, [originalGain, sync]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else void play();
  }, [pause, play]);

  return { time, duration, playing, play, pause, toggle, seek };
}
