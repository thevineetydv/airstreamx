// Panels for the selected clip (speed, filters, crop), the transition between
// two clips, and the canvas shape. Shown in place of the tool rows.

import { FILTER_PRESETS, MAX_TRANSITION, MIN_TRANSITION, SPEEDS, TRANSITIONS, filterCss, type AspectRatio, type ClipLook, type FitMode, type Transition } from "../model/look";
import { clipDuration, formatTime } from "../model/timeline";
import type { Clip, MediaAsset } from "../model/types";

export type ClipTab = "speed" | "filters" | "crop";

const Header = ({ title, onDone, testId }: { title: string; onDone: () => void; testId: string }) => (
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-bold text-white">{title}</h3>
    <button onClick={onDone} className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold" data-testid={testId}>Done</button>
  </div>
);

function Chip(props: { on: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      onClick={props.onClick}
      data-testid={props.testId}
      data-on={props.on}
      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${props.on ? "bg-red-600 text-white" : "bg-white/10 text-gray-300"}`}
    >
      {props.children}
    </button>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; testId?: string; show?: string }) {
  return (
    <label className="flex items-center gap-3 text-xs text-gray-400">
      <span className="w-20 shrink-0">{props.label}</span>
      <input
        type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="flex-1 accent-red-500"
        data-testid={props.testId}
        aria-label={props.label}
      />
      <span className="w-10 text-right tabular-nums">{props.show ?? props.value.toFixed(2)}</span>
    </label>
  );
}

interface ClipPanelProps {
  clip: Clip;
  asset: MediaAsset | undefined;
  tab: ClipTab;
  onTab: (t: ClipTab) => void;
  onChange: (patch: Partial<Pick<Clip, "speed" | "look" | "fit" | "panX" | "panY">>) => void;
  onApplyLookToAll: () => void;
  onDone: () => void;
}

export function ClipPanel({ clip, asset, tab, onTab, onChange, onApplyLookToAll, onDone }: ClipPanelProps) {
  const setLook = (patch: Partial<ClipLook>) => onChange({ look: { ...clip.look, ...patch } });
  const thumb = asset?.thumbs[Math.floor(asset.thumbs.length / 2)]?.url;
  const sourceLen = clip.outPoint - clip.inPoint;

  return (
    <div className="max-h-[46vh] space-y-3 overflow-y-auto px-3 py-3" data-testid="clip-panel">
      <Header title="Edit clip" onDone={onDone} testId="clip-done" />
      <div className="flex gap-1.5">
        <Chip on={tab === "speed"} onClick={() => onTab("speed")} testId="clip-tab-speed">Speed</Chip>
        <Chip on={tab === "filters"} onClick={() => onTab("filters")} testId="clip-tab-filters">Filters</Chip>
        <Chip on={tab === "crop"} onClick={() => onTab("crop")} testId="clip-tab-crop">Crop / Fit</Chip>
      </div>

      {tab === "speed" && (
        <div className="space-y-2">
          <div className="grid grid-cols-6 gap-1">
            {SPEEDS.map((s) => (
              <Chip key={s} on={clip.speed === s} onClick={() => onChange({ speed: s })} testId={`speed-${s}`}>{s}×</Chip>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">
            {formatTime(sourceLen)} of video → {formatTime(clipDuration(clip))} on the timeline.
            {clip.speed !== 1 && " Sound speeds up / slows down with the picture (pitch changes too)."}
          </p>
        </div>
      )}

      {tab === "filters" && (
        <div className="space-y-3">
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {FILTER_PRESETS.map((f) => (
              <button
                key={f.id}
                onClick={() => setLook({ preset: f.id })}
                className={`shrink-0 overflow-hidden rounded-xl border-2 ${clip.look.preset === f.id ? "border-red-500" : "border-transparent"}`}
                data-testid={`filter-${f.id}`}
              >
                <div className="h-12 w-16 bg-zinc-800">
                  {thumb && <img src={thumb} alt="" className="h-full w-full object-cover" style={{ filter: f.css || undefined }} />}
                </div>
                <div className="bg-black/60 px-1 py-0.5 text-[10px]">{f.label}</div>
              </button>
            ))}
          </div>
          <Slider label="Brightness" value={clip.look.brightness} min={-1} max={1} step={0.05} onChange={(v) => setLook({ brightness: v })} show={`${Math.round(clip.look.brightness * 100)}`} testId="look-brightness" />
          <Slider label="Contrast" value={clip.look.contrast} min={-1} max={1} step={0.05} onChange={(v) => setLook({ contrast: v })} show={`${Math.round(clip.look.contrast * 100)}`} testId="look-contrast" />
          <Slider label="Saturation" value={clip.look.saturation} min={-1} max={1} step={0.05} onChange={(v) => setLook({ saturation: v })} show={`${Math.round(clip.look.saturation * 100)}`} testId="look-saturation" />
          <div className="flex gap-2 text-xs">
            <button onClick={() => setLook({ preset: "none", brightness: 0, contrast: 0, saturation: 0 })} className="rounded-full border border-white/15 px-3 py-1">Reset</button>
            <button onClick={onApplyLookToAll} className="rounded-full border border-white/15 px-3 py-1" data-testid="look-apply-all">Apply to all clips</button>
          </div>
          {filterCss(clip.look) === "" && <p className="text-[11px] text-gray-500">No filter on this clip.</p>}
        </div>
      )}

      {tab === "crop" && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {([["fit", "Fit (bars)"], ["fill", "Fill (crop)"], ["blur", "Blur bars"]] as [FitMode, string][]).map(([m, label]) => (
              <Chip key={m} on={clip.fit === m} onClick={() => onChange({ fit: m })} testId={`fit-${m}`}>{label}</Chip>
            ))}
          </div>
          {clip.fit === "fill" && (
            <>
              <Slider label="Left ↔ Right" value={clip.panX} min={0} max={1} step={0.01} onChange={(v) => onChange({ panX: v })} show={`${Math.round(clip.panX * 100)}%`} testId="pan-x" />
              <Slider label="Top ↕ Bottom" value={clip.panY} min={0} max={1} step={0.01} onChange={(v) => onChange({ panY: v })} show={`${Math.round(clip.panY * 100)}%`} testId="pan-y" />
            </>
          )}
          <p className="text-[11px] text-gray-500">
            Fit shows the whole video. Fill crops to fill the frame (move it with the sliders). Blur bars fills the empty space with a blurred copy.
          </p>
        </div>
      )}
    </div>
  );
}

interface TransitionPanelProps {
  transition: Transition | null;
  maxDuration: number;
  onChange: (t: Transition | null) => void;
  onApplyToAll: () => void;
  onDone: () => void;
}

export function TransitionPanel({ transition, maxDuration, onChange, onApplyToAll, onDone }: TransitionPanelProps) {
  const type = transition?.type ?? "none";
  const dur = transition?.duration ?? 0.5;
  const max = Math.max(MIN_TRANSITION, Math.min(MAX_TRANSITION, maxDuration));
  return (
    <div className="space-y-3 px-3 py-3" data-testid="transition-panel">
      <Header title="Transition" onDone={onDone} testId="transition-done" />
      <div className="grid grid-cols-3 gap-1.5">
        {TRANSITIONS.map((t) => (
          <Chip
            key={t.id}
            on={type === t.id}
            onClick={() => onChange(t.id === "none" ? null : { type: t.id, duration: Math.min(dur, max) })}
            testId={`transition-${t.id}`}
          >
            {t.label}
          </Chip>
        ))}
      </div>
      {type !== "none" && (
        <Slider label="Length" value={Math.min(dur, max)} min={MIN_TRANSITION} max={max} step={0.05} onChange={(v) => onChange({ type, duration: v })} show={`${Math.min(dur, max).toFixed(1)}s`} testId="transition-length" />
      )}
      <div className="flex items-center justify-between text-xs">
        <button onClick={onApplyToAll} className="rounded-full border border-white/15 px-3 py-1" data-testid="transition-apply-all">Apply to all cuts</button>
        <span className="text-[11px] text-gray-500">The video length doesn't change.</span>
      </div>
    </div>
  );
}

export function AspectPanel({ aspect, onChange, onDone }: { aspect: AspectRatio; onChange: (a: AspectRatio) => void; onDone: () => void }) {
  const options: [AspectRatio, string, string][] = [
    ["auto", "Auto", "Like 1st clip"],
    ["9:16", "9:16", "Shorts / Reels"],
    ["16:9", "16:9", "YouTube / TV"],
    ["1:1", "1:1", "Square post"],
  ];
  return (
    <div className="space-y-3 px-3 py-3" data-testid="aspect-panel">
      <Header title="Canvas shape" onDone={onDone} testId="aspect-done" />
      <div className="grid grid-cols-4 gap-2">
        {options.map(([id, label, hint]) => (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={`rounded-xl border px-1 py-2 ${aspect === id ? "border-red-500 bg-red-500/10" : "border-white/10"}`}
            data-testid={`aspect-${id}`}
          >
            <div className="text-sm font-bold">{label}</div>
            <div className="text-[10px] text-gray-400">{hint}</div>
          </button>
        ))}
      </div>
      <p className="text-[11px] text-gray-500">Clips that don't match get bars. Use Edit clip → Crop / Fit to fill or blur them.</p>
    </div>
  );
}
