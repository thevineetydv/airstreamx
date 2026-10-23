// Shared animation controls for text / stickers / layers:
//   ◀  jump to previous keyframe   ◆  add / remove keyframe here   ▶  next keyframe
// plus Size and Opacity sliders that show (and edit) the value at the playhead.

import { ChevronLeft, ChevronRight, Diamond } from "lucide-react";
import type { AnimProps } from "../model/keyframes";
import { usePrefs } from "../model/prefs";

export interface KeyframeProps {
  values: AnimProps;
  onChange: (change: Partial<AnimProps>) => void;
  keyCount: number;
  keyHere: boolean;
  onToggleKey: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClear: () => void;
  /** Auto keyframe: changing a value between keyframes adds a new one there. */
  autoKey: boolean;
  onAutoKey: (on: boolean) => void;
  /** Size slider range (overlays use a multiplier, layers a width fraction). */
  scaleMin: number;
  scaleMax: number;
}

export default function KeyframeControls(p: KeyframeProps) {
  // Keyframe tools only in Pro mode — or when this item already has keyframes,
  // so they can still be seen and cleared.
  const { pro } = usePrefs();
  return (
    <div className="space-y-2" data-testid="keyframe-controls">
      <label className="flex items-center gap-3 text-xs text-gray-400">
        <span className="w-12">Size</span>
        <input
          type="range" min={p.scaleMin} max={p.scaleMax} step={0.01}
          value={p.values.scale}
          onChange={(e) => p.onChange({ scale: Number(e.target.value) })}
          className="flex-1 accent-red-500"
          data-testid="anim-scale"
        />
      </label>
      <label className="flex items-center gap-3 text-xs text-gray-400">
        <span className="w-12">Opacity</span>
        <input
          type="range" min={0} max={1} step={0.05}
          value={p.values.opacity}
          onChange={(e) => p.onChange({ opacity: Number(e.target.value) })}
          className="flex-1 accent-red-500"
          data-testid="anim-opacity"
        />
        <span className="w-9 text-right tabular-nums">{Math.round(p.values.opacity * 100)}%</span>
      </label>
      {(pro || p.keyCount > 0) && (
      <>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-400">Animate</span>
        <button onClick={p.onPrev ?? undefined} disabled={!p.onPrev} className="rounded-full p-1.5 hover:bg-white/10 disabled:opacity-30" aria-label="Previous keyframe" data-testid="key-prev">
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={p.onToggleKey}
          className={`flex items-center gap-1 rounded-full px-3 py-1.5 ${p.keyHere ? "bg-yellow-400 text-black" : "border border-white/15"}`}
          data-testid="key-toggle"
          data-here={p.keyHere}
        >
          <Diamond size={13} className={p.keyHere ? "fill-black" : ""} />
          {p.keyHere ? "Remove keyframe" : "Add keyframe"}
        </button>
        <button onClick={p.onNext ?? undefined} disabled={!p.onNext} className="rounded-full p-1.5 hover:bg-white/10 disabled:opacity-30" aria-label="Next keyframe" data-testid="key-next">
          <ChevronRight size={16} />
        </button>
        <span className="ml-auto text-gray-500" data-testid="key-count">{p.keyCount} ◆</span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <button
          onClick={() => p.onAutoKey(!p.autoKey)}
          className={`rounded-full px-3 py-1 ${p.autoKey ? "bg-yellow-400 text-black" : "bg-white/10 text-gray-300"}`}
          data-testid="key-auto"
          data-on={p.autoKey}
        >
          Auto keyframe: {p.autoKey ? "ON" : "OFF"}
        </button>
        {p.keyCount > 0 && (
          <button onClick={p.onClear} className="rounded-full px-3 py-1 text-red-300 hover:bg-white/10" data-testid="key-clear">
            Clear all ◆
          </button>
        )}
      </div>
      <p className="text-[11px] text-gray-500">
        {!p.keyCount
          ? "To animate: Add keyframe, move the playhead, Add keyframe again, then move / resize it."
          : p.autoKey
            ? "Auto ON: moving or resizing anywhere adds a keyframe there."
            : "Auto OFF: on a ◆ you edit that keyframe; elsewhere the whole animation moves together."}
      </p>
      </>
      )}
    </div>
  );
}
