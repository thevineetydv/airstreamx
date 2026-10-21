// Shared animation controls for text / stickers / layers:
//   ◀  jump to previous keyframe   ◆  add / remove keyframe here   ▶  next keyframe
// plus Size and Opacity sliders that show (and edit) the value at the playhead.

import { ChevronLeft, ChevronRight, Diamond } from "lucide-react";
import type { AnimProps } from "../model/keyframes";

interface Props {
  values: AnimProps;
  onChange: (change: Partial<AnimProps>) => void;
  keyCount: number;
  keyHere: boolean;
  onToggleKey: () => void;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  /** Size slider range (overlays use a multiplier, layers a width fraction). */
  scaleMin: number;
  scaleMax: number;
}

export default function KeyframeControls(p: Props) {
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
      <p className="text-[11px] text-gray-500">
        {p.keyCount
          ? "Move the playhead, then drag / resize: a keyframe is added there and it animates between them."
          : "Add a keyframe, move the playhead, then move or resize it to animate."}
      </p>
    </div>
  );
}
