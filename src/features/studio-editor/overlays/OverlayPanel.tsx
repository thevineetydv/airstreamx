// Settings for the selected overlay. Replaces the tool row while an overlay is selected.

import { Trash2 } from "lucide-react";
import KeyframeControls from "./KeyframeControls";
import type { AnimProps } from "../model/keyframes";
import {
  MAX_SCALE, MIN_SCALE, STICKERS, TEXT_COLORS,
  type Overlay, type OverlayPatch,
} from "../model/overlays";
import { formatTime } from "../model/timeline";

interface Props {
  overlay: Overlay;
  onChange: (patch: OverlayPatch) => void;
  onSetStart: () => void;
  onSetEnd: () => void;
  onDelete: () => void;
  onDone: () => void;
  /** Animation (Phase 6b): values at the playhead + keyframe actions. */
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

const input =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-red-500 focus:outline-none";

const TITLES: Record<Overlay["kind"], string> = {
  text: "Text",
  sticker: "Sticker",
  area: "📍 Area tag",
  deal: "Local Deal banner",
};

export default function OverlayPanel({ overlay: o, onChange, onSetStart, onSetEnd, onDelete, onDone, anim }: Props) {
  return (
    <div className="max-h-[42vh] space-y-3 overflow-y-auto px-3 py-3" data-testid="overlay-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">{TITLES[o.kind]}</h3>
        <div className="flex items-center gap-1">
          <button onClick={onDelete} className="rounded-full p-2 text-red-400 hover:bg-white/10" aria-label="Delete overlay" data-testid="overlay-delete">
            <Trash2 size={18} />
          </button>
          <button onClick={onDone} className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold" data-testid="overlay-done">
            Done
          </button>
        </div>
      </div>

      {o.kind === "text" && (
        <>
          <textarea
            value={o.text}
            onChange={(e) => onChange({ text: e.target.value.slice(0, 120) })}
            rows={2}
            placeholder="Type here… (Hindi bhi chalega)"
            className={input}
            data-testid="overlay-text"
          />
          <div className="flex items-center gap-2">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onChange({ color: c })}
                aria-label={`Colour ${c}`}
                className={`h-7 w-7 rounded-full border-2 ${o.color === c ? "border-red-500" : "border-white/20"}`}
                style={{ background: c }}
              />
            ))}
            <button
              onClick={() => onChange({ style: o.style === "box" ? "outline" : "box" })}
              className="ml-auto rounded-full border border-white/15 px-3 py-1 text-xs"
              data-testid="overlay-style"
            >
              {o.style === "box" ? "Box ✓" : "Box"}
            </button>
          </div>
        </>
      )}

      {o.kind === "sticker" && (
        <div className="grid grid-cols-8 gap-1">
          {STICKERS.map((s) => (
            <button
              key={s}
              onClick={() => onChange({ emoji: s })}
              className={`rounded-lg py-1.5 text-2xl ${o.emoji === s ? "bg-red-500/30" : "hover:bg-white/10"}`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {o.kind === "area" && (
        <input
          value={o.area}
          onChange={(e) => onChange({ area: e.target.value.slice(0, 40) })}
          placeholder="e.g. Hazratganj, Lucknow"
          className={input}
          data-testid="overlay-area"
        />
      )}

      {o.kind === "deal" && (
        <div className="grid grid-cols-2 gap-2">
          <input value={o.offer} onChange={(e) => onChange({ offer: e.target.value.slice(0, 30) })} placeholder="Offer (e.g. 20% OFF)" className={`${input} col-span-2`} data-testid="deal-offer" />
          <input value={o.business} onChange={(e) => onChange({ business: e.target.value.slice(0, 40) })} placeholder="Business name" className={`${input} col-span-2`} data-testid="deal-business" />
          <input value={o.area} onChange={(e) => onChange({ area: e.target.value.slice(0, 30) })} placeholder="Area" className={input} data-testid="deal-area" />
          <input value={o.phone} onChange={(e) => onChange({ phone: e.target.value.replace(/[^\d+ -]/g, "").slice(0, 16) })} placeholder="Phone (optional)" inputMode="tel" className={input} data-testid="deal-phone" />
        </div>
      )}

      <KeyframeControls {...anim} scaleMin={MIN_SCALE} scaleMax={MAX_SCALE} />

      <div className="flex items-center gap-2 text-xs">
        <span className="tabular-nums text-gray-400">
          {formatTime(o.start)} → {formatTime(o.end)}
        </span>
        <button onClick={onSetStart} className="ml-auto rounded-full border border-white/15 px-3 py-1.5" data-testid="overlay-set-start">
          Start here
        </button>
        <button onClick={onSetEnd} className="rounded-full border border-white/15 px-3 py-1.5" data-testid="overlay-set-end">
          End here
        </button>
      </div>
      <p className="text-[11px] text-gray-500">Drag on the video to move. Drag the bar on the timeline to change timing.</p>
    </div>
  );
}
