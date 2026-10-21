// Settings for the selected layer (picture-in-picture video or picture).

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import KeyframeControls from "../overlays/KeyframeControls";
import type { AnimProps } from "../model/keyframes";
import { layerEnd, MAX_LAYER_SCALE, MIN_LAYER_SCALE, type Layer, type LayerPatch } from "../model/layers";
import { formatTime } from "../model/timeline";

interface Props {
  layer: Layer;
  name: string;
  index: number;
  count: number;
  onChange: (patch: LayerPatch) => void;
  onOrder: (dir: -1 | 1) => void;
  onDelete: () => void;
  onDone: () => void;
  anim: {
    values: AnimProps;
    onChange: (change: Partial<AnimProps>) => void;
    keyCount: number;
    keyHere: boolean;
    onToggleKey: () => void;
    onPrev: (() => void) | null;
    onNext: (() => void) | null;
  };
}

export default function LayerPanel({ layer: l, name, index, count, onChange, onOrder, onDelete, onDone, anim }: Props) {
  return (
    <div className="max-h-[44vh] space-y-3 overflow-y-auto px-3 py-3 text-sm" data-testid="layer-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate font-bold text-white">{l.kind === "video" ? "🎬" : "🖼"} {name}</h3>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onDelete} className="rounded-full p-2 text-red-400 hover:bg-white/10" aria-label="Delete layer" data-testid="layer-delete">
            <Trash2 size={18} />
          </button>
          <button onClick={onDone} className="rounded-full bg-white/10 px-4 py-1.5 font-semibold" data-testid="layer-done">Done</button>
        </div>
      </div>

      <KeyframeControls {...anim} scaleMin={MIN_LAYER_SCALE} scaleMax={MAX_LAYER_SCALE} />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => onChange({ rounded: !l.rounded })}
          className={`rounded-full px-3 py-1 ${l.rounded ? "bg-red-600 text-white" : "bg-white/10 text-gray-300"}`}
          data-testid="layer-rounded"
        >
          {l.rounded ? "✓ " : ""}Rounded corners
        </button>
        {count > 1 && (
          <>
            <button onClick={() => onOrder(1)} disabled={index >= count - 1} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 disabled:opacity-30" data-testid="layer-forward">
              <ArrowUp size={12} /> Front
            </button>
            <button onClick={() => onOrder(-1)} disabled={index <= 0} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 disabled:opacity-30" data-testid="layer-back">
              <ArrowDown size={12} /> Back
            </button>
          </>
        )}
      </div>

      {l.kind === "video" && (
        <label className="flex items-center gap-3 text-xs text-gray-400">
          <span className="w-12">Sound</span>
          <input
            type="range" min={0} max={1} step={0.05}
            value={l.volume}
            onChange={(e) => onChange({ volume: Number(e.target.value) })}
            className="flex-1 accent-indigo-400"
            data-testid="layer-volume"
          />
          <span className="w-9 text-right tabular-nums">{Math.round(l.volume * 100)}%</span>
        </label>
      )}

      <p className="text-xs tabular-nums text-gray-400">
        {formatTime(l.start)} → {formatTime(layerEnd(l))}
        <span className="text-gray-500"> · drag on the video to move, drag the bar to change timing</span>
      </p>
    </div>
  );
}
