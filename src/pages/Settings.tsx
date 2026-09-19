import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LS } from "../utils/constants";

export default function Settings() {
  const [ambient, setAmbient] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LS.AMBIENT);
      return saved ? saved === "1" : true;
    } catch {
      return true;
    }
  });
  const [autoplayNext, setAutoplayNext] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LS.AUTOPLAY_NEXT);
      return saved ? saved === "1" : true;
    } catch {
      return true;
    }
  });
  const [theaterDefault, setTheaterDefault] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("player_theater_mode");
      return saved ? saved === "1" : false;
    } catch {
      return false;
    }
  });
  const [reduceMotion, setReduceMotion] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LS.REDUCE_MOTION);
      return saved ? saved === "1" : false;
    } catch {
      return false;
    }
  });
  const [cinematicBlur, setCinematicBlur] = useState<number>(() => {
    try {
      const v = localStorage.getItem(LS.CINEMATIC_BLUR);
      return v ? Math.min(60, Math.max(0, parseInt(v, 10))) : 36;
    } catch {
      return 36;
    }
  });
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LS.FOCUS_MODE);
      return saved ? saved === "1" : false;
    } catch {
      return false;
    }
  });
  // Data Saver — caps default video quality and (optionally) skips
  // autoplay when on mobile data, since mobile data plans in India are
  // often limited/metered. Uses a plain string key (not LS.*) since
  // this setting didn't exist in the constants file yet.
  const [dataSaver, setDataSaver] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("data_saver_mode");
      return saved ? saved === "1" : false;
    } catch {
      return false;
    }
  });

  // ── Defaults, named once so the reset button and initial state
  // definitions can't silently drift apart from each other over time ──
  const DEFAULTS = {
    ambient: true,
    autoplayNext: true,
    theaterDefault: false,
    reduceMotion: false,
    cinematicBlur: 36,
    focusMode: false,
    dataSaver: false,
  };

  const resetToDefaults = () => {
    setAmbient(DEFAULTS.ambient);
    setAutoplayNext(DEFAULTS.autoplayNext);
    setTheaterDefault(DEFAULTS.theaterDefault);
    setReduceMotion(DEFAULTS.reduceMotion);
    setCinematicBlur(DEFAULTS.cinematicBlur);
    setFocusMode(DEFAULTS.focusMode);
    setDataSaver(DEFAULTS.dataSaver);
  };

  // ✅ Batch all localStorage persistence into a single debounced effect
  // Instead of 6 separate useEffects, use one with all dependencies
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem(LS.AMBIENT, ambient ? "1" : "0");
        localStorage.setItem(LS.AUTOPLAY_NEXT, autoplayNext ? "1" : "0");
        localStorage.setItem("player_theater_mode", theaterDefault ? "1" : "0");
        localStorage.setItem(LS.REDUCE_MOTION, reduceMotion ? "1" : "0");
        localStorage.setItem(LS.CINEMATIC_BLUR, String(cinematicBlur));
        localStorage.setItem(LS.FOCUS_MODE, focusMode ? "1" : "0");
        localStorage.setItem("data_saver_mode", dataSaver ? "1" : "0");
      } catch (error) {
        console.warn("Failed to save settings to localStorage:", error);
      }
    }, 300); // Debounce to batch rapid changes

    return () => clearTimeout(timeoutId);
  }, [ambient, autoplayNext, theaterDefault, reduceMotion, cinematicBlur, focusMode, dataSaver]);

  // ✅ Separate effect for DOM mutations (reduce-motion class)
  useEffect(() => {
    const root = document.documentElement;
    if (reduceMotion) {
      root.classList.add("reduce-motion");
    } else {
      root.classList.remove("reduce-motion");
    }
  }, [reduceMotion]);

  return (
    <div className="p-6 text-white max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <button
          onClick={resetToDefaults}
          className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors"
        >
          Reset to Default
        </button>
      </div>

      <div className="space-y-6">
        <div className="bg-[#212121] border border-white/10 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-3">Playback</h2>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">Ambient mode</div>
              <div className="text-sm text-gray-400">Dim background glow behind the player</div>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={ambient}
                onChange={(e) => setAmbient(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-red-500 relative transition-colors">
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${ambient ? "translate-x-5" : ""}`} />
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">Autoplay next</div>
              <div className="text-sm text-gray-400">Automatically play the next video</div>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={autoplayNext}
                onChange={(e) => setAutoplayNext(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-red-500 relative transition-colors">
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${autoplayNext ? "translate-x-5" : ""}`} />
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">Default theater mode</div>
              <div className="text-sm text-gray-400">Start videos in theater mode</div>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={theaterDefault}
                onChange={(e) => setTheaterDefault(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-red-500 relative transition-colors">
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${theaterDefault ? "translate-x-5" : ""}`} />
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">Reduce motion</div>
              <div className="text-sm text-gray-400">Limit animations for accessibility</div>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={reduceMotion}
                onChange={(e) => setReduceMotion(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-red-500 relative transition-colors">
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${reduceMotion ? "translate-x-5" : ""}`} />
              </div>
            </label>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">Cinematic blur strength</div>
              <div className="text-sm text-gray-400">Adjust glow blur in theater mode</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-8 text-right">{cinematicBlur}px</span>
              <input
                type="range"
                min={0}
                max={60}
                step={2}
                value={cinematicBlur}
                onChange={(e) => setCinematicBlur(parseInt(e.target.value, 10))}
                className="w-40 accent-red-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">Focus mode</div>
              <div className="text-sm text-gray-400">Hide side content while watching</div>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={focusMode}
                onChange={(e) => setFocusMode(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-red-500 relative transition-colors">
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${focusMode ? "translate-x-5" : ""}`} />
              </div>
            </label>
          </div>
        </div>

        <div className="bg-[#212121] border border-white/10 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-3">Data & Network</h2>
          <div className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">Data Saver</div>
              <div className="text-sm text-gray-400">Caps video quality at 480p to use less mobile data</div>
            </div>
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={dataSaver}
                onChange={(e) => setDataSaver(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:bg-red-500 relative transition-colors">
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${dataSaver ? "translate-x-5" : ""}`} />
              </div>
            </label>
          </div>
        </div>

        <div className="bg-[#212121] border border-white/10 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-3">Legal</h2>
          <div className="flex flex-col gap-1">
            <Link to="/privacy" className="py-2 text-gray-300 hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="py-2 text-gray-300 hover:text-white transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}