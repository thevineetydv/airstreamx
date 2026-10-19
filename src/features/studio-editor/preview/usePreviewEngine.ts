// Plays the timeline using one <video> element.
// It jumps between clips by swapping the source and seeking.
// Trade-off: a short pause (~50-150 ms) can show at a cut in preview.
// The exported file has no such pause.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { clipStarts, locate, totalDuration } from "../model/timeline";
import type { Clip, MediaAsset } from "../model/types";

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const ok = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(new Error("Video failed to load")); };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", ok);
      video.removeEventListener("error", fail);
    };
    video.addEventListener("loadedmetadata", ok);
    video.addEventListener("error", fail);
  });
}

export function usePreviewEngine(
  videoRef: RefObject<HTMLVideoElement | null>,
  clips: Clip[],
  assets: Record<string, MediaAsset>,
) {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Refs so the animation loop always sees the latest values.
  const clipsRef = useRef(clips);
  const assetsRef = useRef(assets);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const indexRef = useRef(-1);
  const seekToken = useRef(0);
  clipsRef.current = clips;
  assetsRef.current = assets;

  const duration = totalDuration(clips);

  const updateTime = useCallback((t: number) => {
    timeRef.current = t;
    setTime(t);
  }, []);

  /** Load the right source and seek so the frame at timeline time `t` shows. */
  const showFrame = useCallback(async (t: number) => {
    const video = videoRef.current;
    const hit = locate(clipsRef.current, t);
    if (!video || !hit) return false;
    const token = ++seekToken.current;
    const asset = assetsRef.current[hit.clip.assetId];
    if (!asset) return false;
    if (video.dataset.assetId !== asset.id) {
      video.dataset.assetId = asset.id;
      video.src = asset.url;
      try { await waitForMetadata(video); } catch { return false; }
      if (token !== seekToken.current) return false;
    }
    indexRef.current = hit.index;
    // Seeking to exactly outPoint can show a frame past the cut, so stay just inside.
    video.currentTime = Math.min(hit.sourceTime, hit.clip.outPoint - 0.01);
    return true;
  }, [videoRef]);

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    videoRef.current?.pause();
  }, [videoRef]);

  const seek = useCallback((t: number) => {
    const clamped = Math.min(Math.max(t, 0), totalDuration(clipsRef.current));
    updateTime(clamped);
    if (!playingRef.current) void showFrame(clamped);
  }, [showFrame, updateTime]);

  const play = useCallback(async () => {
    const video = videoRef.current;
    const total = totalDuration(clipsRef.current);
    if (!video || total <= 0) return;
    let start = timeRef.current;
    if (start >= total - 0.05) start = 0; // restart from the beginning at the end
    updateTime(start);
    playingRef.current = true;
    setPlaying(true);
    if (!(await showFrame(start))) { pause(); return; }
    try { await video.play(); } catch { pause(); }
  }, [videoRef, showFrame, updateTime, pause]);

  // Animation loop while playing: follow the video and hop to the next clip at each cut.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let switching = false;
    const tick = async () => {
      const video = videoRef.current;
      const list = clipsRef.current;
      const i = indexRef.current;
      if (!video || !playingRef.current || i < 0 || i >= list.length) return;
      const clip = list[i];
      const start = clipStarts(list)[i];
      if (!switching) {
        if (video.currentTime >= clip.outPoint - 0.02 || video.ended) {
          if (i + 1 >= list.length) {
            pause();
            updateTime(totalDuration(list));
            return;
          }
          switching = true;
          const nextStart = start + (clip.outPoint - clip.inPoint);
          updateTime(nextStart);
          const sameAsset = list[i + 1].assetId === clip.assetId;
          await showFrame(nextStart + 0.001);
          if (!sameAsset) {
            try { await video.play(); } catch { pause(); }
          }
          switching = false;
        } else {
          updateTime(start + Math.max(0, video.currentTime - clip.inPoint));
        }
      }
      raf = requestAnimationFrame(() => void tick());
    };
    raf = requestAnimationFrame(() => void tick());
    return () => cancelAnimationFrame(raf);
  }, [playing, videoRef, showFrame, pause, updateTime]);

  // When the timeline changes (trim, split, delete), keep the playhead valid and refresh the frame.
  useEffect(() => {
    const total = totalDuration(clips);
    if (playingRef.current) pause();
    const t = Math.min(timeRef.current, total);
    updateTime(t);
    if (clips.length > 0) void showFrame(t);
  }, [clips, pause, showFrame, updateTime]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else void play();
  }, [pause, play]);

  return { time, duration, playing, play, pause, toggle, seek };
}
