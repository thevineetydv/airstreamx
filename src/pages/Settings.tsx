import { useEffect, useState } from "react";
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
      } catch (error) {
        console.warn("Failed to save settings to localStorage:", error);
      }
    }, 300); // Debounce to batch rapid changes

    return () => clearTimeout(timeoutId);
  }, [ambient, autoplayNext, theaterDefault, reduceMotion, cinematicBlur, focusMode]);

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
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        <div className="bg-[#181818] border border-white/10 rounded-xl p-5">
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
      </div>
    </div>
  );
}

