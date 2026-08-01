// src/components/VideoPlayer/Controls.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  Play, Pause, Volume2, VolumeX, SkipBack, SkipForward,
  Maximize2, Minimize2, Settings, Captions, ListVideo,
  Repeat, Share2, PictureInPicture
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

// Type definitions
interface Chapter {
  time: number;
  title: string;
}

interface QualityLevel {
  height: number;
  bitrate?: number;
  [key: string]: unknown;
}

interface Subtitle {
  language: string;
  url: string;
  label?: string;
  [key: string]: unknown;
}

interface ControlsProps {
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  duration: number;
  currentTime: number;
  buffered: number;
  levels: QualityLevel[];
  currentLevel: number;
  subtitles: Subtitle[];
  currentSubtitle: number | null;
  thumbnailsBase?: string;
  chapters?: Chapter[];
  onPlayPause: () => void;
  onSeekBy: (time: number) => void;
  onSeekTo: (time: number) => void;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
  onChangeQuality: (level: number) => void;
  onChangeSubtitle: (index: number | null) => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onPictureInPicture?: () => void;
  videoTitle?: string;
  playbackRate?: number;
  onChangePlaybackRate?: (rate: number) => void;
  loop?: boolean;
  onToggleLoop?: () => void;
}

export default function Controls({
  isPlaying, isMuted, volume, duration, currentTime, buffered,
  levels, currentLevel, subtitles, currentSubtitle,
  thumbnailsBase, chapters = [],
  onPlayPause, onSeekBy, onSeekTo, onVolume, onToggleMute,
  onChangeQuality, onChangeSubtitle,
  isFullscreen, onToggleFullscreen,
  onPictureInPicture,
  videoTitle = "Video",
  playbackRate = 1,
  onChangePlaybackRate,
  loop = false,
  onToggleLoop
}: ControlsProps) {
  const [showQuality, setShowQuality] = useState(false);
  const [showSubs, setShowSubs] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const progressPct = duration ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  const playbackSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

  // Close settings menus when video starts playing
  useEffect(() => {
    if (isPlaying) {
      setShowQuality(false);
      setShowSubs(false);
      setShowChapters(false);
      setShowSpeed(false);
    }
  }, [isPlaying]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          onPlayPause();
          break;
        case 'arrowleft':
          e.preventDefault();
          onSeekBy(e.shiftKey ? -5 : -10);
          break;
        case 'arrowright':
          e.preventDefault();
          onSeekBy(e.shiftKey ? 5 : 10);
          break;
        case 'arrowup':
          e.preventDefault();
          onVolume(Math.min(1, volume + 0.1));
          break;
        case 'arrowdown':
          e.preventDefault();
          onVolume(Math.max(0, volume - 0.1));
          break;
        case 'm':
          e.preventDefault();
          onToggleMute();
          break;
        case 'f':
          e.preventDefault();
          onToggleFullscreen();
          break;
        case 'j':
          e.preventDefault();
          onSeekBy(-10);
          break;
        case 'l':
          e.preventDefault();
          onSeekBy(10);
          break;
        case '0':
        case 'home':
          e.preventDefault();
          onSeekTo(0);
          break;
        case 'end':
          e.preventDefault();
          onSeekTo(duration);
          break;
      }

      // Number keys for seeking to percentage
      if (!isNaN(Number(e.key)) && Number(e.key) >= 1 && Number(e.key) <= 9) {
        e.preventDefault();
        onSeekTo((duration * Number(e.key)) / 10);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPlaying, volume, duration, onPlayPause, onSeekBy, onSeekTo, onVolume, onToggleMute, onToggleFullscreen]);

  // Handle dragging on progress bar
  const handleProgressMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleProgressSeek(e);
  };

  const handleProgressSeek = (e: React.MouseEvent | MouseEvent) => {
    if (!progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeekTo(pct * duration);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        handleProgressSeek(e);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, duration, onSeekTo]);

  // Get current chapter
  const currentChapter = chapters.find((ch, i) => {
    const nextCh = chapters[i + 1];
    return currentTime >= ch.time && (!nextCh || currentTime < nextCh.time);
  });

  // Share functionality
  const handleShare = async () => {
    const shareData = {
      title: videoTitle,
      text: `Watch ${videoTitle}`,
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // User cancelled or share failed
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/60 to-transparent backdrop-blur-md text-white px-4 py-3 rounded-b-3xl select-none">
      {/* Chapter Indicator */}
      {currentChapter && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 text-xs text-gray-300"
        >
          📖 {currentChapter.title}
        </motion.div>
      )}

      {/* Progress Bar */}
      <div
        ref={progressBarRef}
        className="relative w-full h-3 cursor-pointer group mb-3"
        onMouseDown={handleProgressMouseDown}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          setHoverPct(pct);
          setHoverTime(pct * (duration || 0));
        }}
        onMouseLeave={() => {
          setHoverPct(null);
          setHoverTime(null);
        }}
      >
        {/* Background */}
        <div className="absolute inset-0 bg-white/20 rounded-full" />

        {/* Buffered */}
        <div
          className="absolute inset-0 bg-white/30 rounded-full transition-all"
          style={{ width: `${bufferedPct}%` }}
        />

        {/* Progress */}
        <div
          className="absolute inset-0 bg-gradient-to-r from-red-500 via-fuchsia-500 to-red-500 rounded-full transition-all"
          style={{ width: `${progressPct}%` }}
        />

        {/* Progress Handle */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `${progressPct}%`, transform: 'translate(-50%, -50%)' }}
        />

        {/* Chapter Markers */}
        {chapters.map((ch, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-0.5 bg-yellow-400/60 hover:bg-yellow-400 transition-colors"
            style={{ left: `${(ch.time / duration) * 100}%` }}
            title={ch.title}
          />
        ))}

        {/* Thumbnail Hover Preview */}
        <AnimatePresence>
          {hoverPct !== null && hoverTime !== null && thumbnailsBase && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-6 pointer-events-none"
              style={{
                left: `${hoverPct * 100}%`,
                transform: 'translateX(-50%)',
              }}
            >
              <div className="flex flex-col items-center">
                <img
                  src={`${thumbnailsBase}/thumb_${String(
                    Math.floor(hoverTime / 5) + 1
                  ).padStart(4, "0")}.jpg`}
                  className="w-40 h-24 object-cover rounded-lg shadow-2xl border-2 border-white/20"
                  alt="thumbnail preview"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <span className="mt-1 text-xs font-mono bg-black/90 px-2 py-1 rounded-md shadow-lg">
                  {fmt(hoverTime)}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Controls */}
      <div className="flex justify-between items-center text-sm">
        {/* Left Controls */}
        <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
          <button
            onClick={() => onSeekBy(-10)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Rewind 10s (J)"
          >
            <SkipBack size={20} />
          </button>

          <button
            onClick={onPlayPause}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title={isPlaying ? "Pause (Space/K)" : "Play (Space/K)"}
          >
            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
          </button>

          <button
            onClick={() => onSeekBy(10)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Forward 10s (L)"
          >
            <SkipForward size={20} />
          </button>

          {/* Volume Control */}
          <div
            className="flex items-center gap-2 relative"
            onMouseEnter={() => setShowVolumeSlider(true)}
            onMouseLeave={() => setShowVolumeSlider(false)}
          >
            <button
              onClick={onToggleMute}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              title={isMuted ? "Unmute (M)" : "Mute (M)"}
            >
              {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            <AnimatePresence>
              {showVolumeSlider && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 80 }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => onVolume(Number(e.target.value))}
                    className="w-20 accent-red-500 cursor-pointer"
                    title={`Volume: ${Math.round((isMuted ? 0 : volume) * 100)}%`}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <span className="text-xs font-mono text-gray-300 ml-2">
            {fmt(currentTime)} / {fmt(duration)}
          </span>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
          {/* Playback Speed */}
          {onChangePlaybackRate && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowSpeed(!showSpeed);
                  setShowQuality(false);
                  setShowSubs(false);
                  setShowChapters(false);
                }}
                className="px-2 py-1 hover:bg-white/10 rounded transition-colors text-xs font-mono"
                title="Playback Speed"
              >
                {playbackRate}x
              </button>

              <AnimatePresence>
                {showSpeed && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute bottom-10 right-0 bg-black/95 backdrop-blur-sm rounded-lg border border-white/20 p-2 w-24 text-xs shadow-2xl"
                  >
                    {playbackSpeeds.map((speed) => (
                      <button
                        key={speed}
                        onClick={() => {
                          onChangePlaybackRate(speed);
                          setShowSpeed(false);
                        }}
                        className={`block w-full text-center px-2 py-1.5 rounded hover:bg-white/10 transition-colors ${playbackRate === speed ? "text-red-500 bg-white/5" : ""
                          }`}
                      >
                        {speed === 1 ? "Normal" : `${speed}x`}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Loop */}
          {onToggleLoop && (
            <button
              onClick={onToggleLoop}
              className={`p-2 hover:bg-white/10 rounded-full transition-colors ${loop ? "text-red-500" : ""
                }`}
              title={loop ? "Disable Loop" : "Enable Loop"}
            >
              <Repeat size={18} />
            </button>
          )}

          {/* Chapters */}
          {chapters.length > 0 && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowChapters(!showChapters);
                  setShowQuality(false);
                  setShowSubs(false);
                  setShowSpeed(false);
                }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors"
                title="Chapters"
              >
                <ListVideo size={18} />
              </button>

              <AnimatePresence>
                {showChapters && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute bottom-10 right-0 bg-black/95 backdrop-blur-sm rounded-lg border border-white/20 p-2 w-64 max-h-64 overflow-y-auto text-xs shadow-2xl"
                  >
                    {chapters.map((ch, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          onSeekTo(ch.time);
                          setShowChapters(false);
                        }}
                        className={`block w-full text-left px-3 py-2 rounded hover:bg-white/10 transition-colors ${currentChapter === ch ? "text-red-500 bg-white/5" : ""
                          }`}
                      >
                        <div className="font-medium">{ch.title}</div>
                        <div className="text-gray-400 text-xs">{fmt(ch.time)}</div>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Subtitles */}
          {subtitles && subtitles.length > 0 && (
            <div className="relative">
              <button
                onClick={() => {
                  setShowSubs(!showSubs);
                  setShowQuality(false);
                  setShowSpeed(false);
                  setShowChapters(false);
                }}
                className={`p-2 hover:bg-white/10 rounded-full transition-colors ${currentSubtitle !== null ? "text-red-500" : ""
                  }`}
                title="Subtitles"
              >
                <Captions size={18} />
              </button>

              <AnimatePresence>
                {showSubs && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.2 }}
                    className="absolute bottom-10 right-0 bg-black/95 backdrop-blur-sm rounded-lg border border-white/20 p-2 w-40 text-xs shadow-2xl"
                  >
                    <button
                      onClick={() => {
                        onChangeSubtitle(null);
                        setShowSubs(false);
                      }}
                      className={`block w-full text-left px-2 py-1.5 rounded hover:bg-white/10 transition-colors ${currentSubtitle === null ? "text-red-500 bg-white/5" : ""
                        }`}
                    >
                      Off
                    </button>
                    {subtitles.map((sub, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          onChangeSubtitle(i);
                          setShowSubs(false);
                        }}
                        className={`block w-full text-left px-2 py-1.5 rounded hover:bg-white/10 transition-colors ${currentSubtitle === i ? "text-red-500 bg-white/5" : ""
                          }`}
                      >
                        {sub.label || sub.language}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Quality Settings */}
          <div className="relative">
            <button
              onClick={() => {
                setShowQuality(!showQuality);
                setShowSubs(false);
                setShowSpeed(false);
                setShowChapters(false);
              }}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              title="Quality"
            >
              <Settings size={18} />
            </button>

            <AnimatePresence>
              {showQuality && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="absolute bottom-10 right-0 bg-black/95 backdrop-blur-sm rounded-lg border border-white/20 p-2 w-36 text-xs shadow-2xl"
                >
                  <button
                    onClick={() => {
                      onChangeQuality(-1);
                      setShowQuality(false);
                    }}
                    className={`block w-full text-left px-2 py-1.5 rounded hover:bg-white/10 transition-colors ${currentLevel === -1 ? "text-red-500 bg-white/5" : ""
                      }`}
                  >
                    Auto {currentLevel === -1 && levels[0] ? `(${levels[0].height}p)` : ""}
                  </button>
                  {levels.map((lvl, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        onChangeQuality(i);
                        setShowQuality(false);
                      }}
                      className={`block w-full text-left px-2 py-1.5 rounded hover:bg-white/10 transition-colors ${currentLevel === i ? "text-red-500 bg-white/5" : ""
                        }`}
                    >
                      {lvl.height}p {lvl.bitrate ? `(${Math.round(lvl.bitrate / 1000)}kbps)` : ""}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Picture in Picture */}
          {onPictureInPicture && (
            <button
              onClick={onPictureInPicture}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              title="Picture in Picture"
            >
              <PictureInPicture size={18} />
            </button>
          )}

          {/* Share */}
          <button
            onClick={handleShare}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title="Share"
          >
            <Share2 size={18} />
          </button>

          {/* Fullscreen */}
          <button
            onClick={onToggleFullscreen}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
            title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}