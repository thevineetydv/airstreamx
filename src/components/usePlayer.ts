// ============================================================
// usePlayer.ts — HLS video player hook
// ============================================================

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import Hls, { type Level } from "hls.js";

// ─────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────

const DEFAULT_VOLUME = 0.5;

const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));

const getSavedVolume = (): number => {
  const v = parseFloat(localStorage.getItem("player_volume") ?? "");
  return isNaN(v) ? DEFAULT_VOLUME : clamp(v);
};

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface VideoSource {
  url:     string;
  id?:     string;
  poster?: string;
}

interface PlayerState {
  isPlaying:    boolean;
  isBuffering:  boolean;
  duration:     number;
  currentTime:  number;
  buffered:     number;
  volume:       number;
  isMuted:      boolean;
  levels:       Level[];
  currentLevel: number | "auto";
}

interface PlayerActions {
  play:         () => void;
  pause:        () => void;
  playPause:    () => void;
  seekBy:       (delta: number) => void;
  seekAbs:      (t: number) => void;
  setVolume:    (v: number) => void;
  toggleMute:   () => void;
  changeQuality:(lvl: number | "auto") => void;
}

interface UsePlayerReturn {
  vRef:    React.RefObject<HTMLVideoElement | null>;
  state:   PlayerState;
  actions: PlayerActions;
}

interface UsePlayerOptions {
  video:      VideoSource | null | undefined;
  autoPlay?:  boolean;
  startTime?: number;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export default function usePlayer({
  video,
  autoPlay  = true,
  startTime = 0,
}: UsePlayerOptions): UsePlayerReturn {
  const vRef   = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying,    setIsPlaying]    = useState(false);
  const [isBuffering,  setIsBuffering]  = useState(true);
  const [duration,     setDuration]     = useState(0);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [buffered,     setBuffered]     = useState(0);
  const [volume,       setVolumeState]  = useState(getSavedVolume);
  const [isMuted,      setIsMuted]      = useState(false);
  const [levels,       setLevels]       = useState<Level[]>([]);
  const [currentLevel, setCurrentLevel] = useState<number | "auto">("auto");

  // ── Controls ──────────────────────────────

  const play = useCallback(() => { vRef.current?.play().catch(() => {}); }, []);
  const pause = useCallback(() => vRef.current?.pause(), []);

  const playPause = useCallback(() => {
    const el = vRef.current;
    if (!el) return;
    el.paused ? el.play().catch(() => {}) : el.pause();
  }, []);

  const seekBy = useCallback((delta: number) => {
    const el = vRef.current;
    if (!el) return;
    el.currentTime = clamp(el.currentTime + delta, 0, el.duration);
  }, []);

  const seekAbs = useCallback((t: number) => {
    const el = vRef.current;
    if (el) el.currentTime = clamp(t, 0, el.duration);
  }, []);

  const setVolume = useCallback((v: number) => {
    const el = vRef.current;
    if (!el) return;
    const vol = clamp(v);
    el.volume = vol;
    el.muted  = vol === 0;
    localStorage.setItem("player_volume", vol.toString());
    setVolumeState(vol);
    setIsMuted(vol === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const el = vRef.current;
    if (!el) return;
    const next = !el.muted;
    el.muted = next;
    setIsMuted(next);
  }, []);

  const changeQuality = useCallback((lvl: number | "auto") => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = lvl === "auto" ? -1 : lvl;
    setCurrentLevel(lvl);
  }, []);

  // ── Volume restore on mount ───────────────

  useEffect(() => {
    const el = vRef.current;
    if (!el) return;
    const vol = getSavedVolume();
    el.volume = vol;
    el.muted  = false;
    setVolumeState(vol);
    setIsMuted(false);
  }, []);

  // ── HLS / video source loading ────────────

  useEffect(() => {
    const el = vRef.current;
    if (!el || !video?.url) return;

    // Tear down any existing HLS instance
    if (hlsRef.current) {
      try { hlsRef.current.destroy(); } catch {}
      hlsRef.current = null;
    }

    el.pause();
    el.removeAttribute("src");
    el.load();

    setIsBuffering(true);
    setLevels([]);
    setCurrentLevel("auto");

    const startPlay = () => {
      if (startTime > 0) el.currentTime = startTime;
      if (!autoPlay) return;
      el.play().catch(() => {
        el.muted = true;
        setIsMuted(true);
        el.play().catch(() => {});
      });
    };

    // Native HLS support (Safari / iOS)
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = video.url;
      el.addEventListener("loadedmetadata", startPlay, { once: true });
      return;
    }

    // HLS.js
    if (video.url.endsWith(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.attachMedia(el);
      hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(video.url));
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLevels(hls.levels);
        startPlay();
      });
      return () => {
        try { hls.destroy(); } catch {}
      };
    }

    // Fallback: plain src
    el.src = video.url;
    startPlay();
  }, [video?.url, autoPlay, startTime]);

  // ── Media event listeners ─────────────────

  useEffect(() => {
    const el = vRef.current;
    if (!el) return;

    const update = () => {
      setCurrentTime(el.currentTime);
      setDuration(el.duration || 0);
      try {
        const i = el.buffered.length - 1;
        setBuffered(i >= 0 ? el.buffered.end(i) : 0);
      } catch {}
    };

    const onPlay    = () => setIsPlaying(true);
    const onPause   = () => setIsPlaying(false);
    const onWaiting = () => setIsBuffering(true);
    const onPlaying = () => setIsBuffering(false);

    el.addEventListener("timeupdate", update);
    el.addEventListener("play",       onPlay);
    el.addEventListener("pause",      onPause);
    el.addEventListener("waiting",    onWaiting);
    el.addEventListener("playing",    onPlaying);

    return () => {
      el.removeEventListener("timeupdate", update);
      el.removeEventListener("play",       onPlay);
      el.removeEventListener("pause",      onPause);
      el.removeEventListener("waiting",    onWaiting);
      el.removeEventListener("playing",    onPlaying);
    };
  }, []);

  // ── Memoised state & actions ──────────────

  const state = useMemo<PlayerState>(() => ({
    isPlaying, isBuffering, duration, currentTime, buffered,
    volume, isMuted, levels, currentLevel,
  }), [isPlaying, isBuffering, duration, currentTime, buffered, volume, isMuted, levels, currentLevel]);

  const actions = useMemo<PlayerActions>(() => ({
    play, pause, playPause, seekBy, seekAbs, setVolume, toggleMute, changeQuality,
  }), [play, pause, playPause, seekBy, seekAbs, setVolume, toggleMute, changeQuality]);

  return { vRef, state, actions };
}

