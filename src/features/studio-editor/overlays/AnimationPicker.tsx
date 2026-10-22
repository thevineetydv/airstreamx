// One-tap animations: In (how it appears), Out (how it leaves), Loop (while shown).

import { useState } from "react";
import {
  IN_LABELS, LOOP_LABELS, MAX_ANIM, MIN_ANIM, NO_ANIMATIONS, OUT_LABELS,
  type Animations, type InAnim, type LoopAnim, type OutAnim,
} from "../model/presets";

type Tab = "in" | "out" | "loop";

interface Props {
  anim: Animations | undefined;
  /** Typewriter is only offered for text. */
  isText: boolean;
  onChange: (anim: Animations) => void;
  /** Play the part of the item where this animation shows. */
  onPreview: (tab: Tab) => void;
}

export default function AnimationPicker({ anim, isText, onChange, onPreview }: Props) {
  const a = anim ?? NO_ANIMATIONS;
  const [tab, setTab] = useState<Tab>("in");
  const set = (patch: Partial<Animations>, preview: Tab) => {
    onChange({ ...a, ...patch });
    onPreview(preview);
  };

  const ins = (Object.keys(IN_LABELS) as InAnim[]).filter((k) => isText || k !== "typewriter");
  const outs = Object.keys(OUT_LABELS) as OutAnim[];
  const loops = Object.keys(LOOP_LABELS) as LoopAnim[];
  const active = (t: Tab) => (t === "in" ? a.in : t === "out" ? a.out : a.loop) !== "none";

  return (
    <div className="space-y-2" data-testid="animation-picker">
      <div className="flex items-center gap-1 text-xs">
        <span className="mr-1 text-gray-400">Animation</span>
        {(["in", "out", "loop"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 ${tab === t ? "bg-white text-black" : "bg-white/10 text-gray-300"}`}
            data-testid={`anim-tab-${t}`}
          >
            {t === "in" ? "In" : t === "out" ? "Out" : "Loop"}{active(t) ? " •" : ""}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {tab === "in" && ins.map((k) => (
          <Chip key={k} on={a.in === k} onClick={() => set({ in: k }, "in")} testId={`anim-in-${k}`}>{IN_LABELS[k]}</Chip>
        ))}
        {tab === "out" && outs.map((k) => (
          <Chip key={k} on={a.out === k} onClick={() => set({ out: k }, "out")} testId={`anim-out-${k}`}>{OUT_LABELS[k]}</Chip>
        ))}
        {tab === "loop" && loops.map((k) => (
          <Chip key={k} on={a.loop === k} onClick={() => set({ loop: k }, "loop")} testId={`anim-loop-${k}`}>{LOOP_LABELS[k]}</Chip>
        ))}
      </div>
      {tab !== "loop" && (tab === "in" ? a.in : a.out) !== "none" && (
        <label className="flex items-center gap-3 text-xs text-gray-400">
          <span className="w-12">Speed</span>
          <input
            type="range" min={MIN_ANIM} max={MAX_ANIM} step={0.1}
            value={tab === "in" ? a.inDuration : a.outDuration}
            onChange={(e) => onChange({ ...a, [tab === "in" ? "inDuration" : "outDuration"]: Number(e.target.value) })}
            onPointerUp={() => onPreview(tab)}
            className="flex-1 accent-red-500"
            data-testid={`anim-${tab}-duration`}
          />
          <span className="w-9 text-right tabular-nums">{(tab === "in" ? a.inDuration : a.outDuration).toFixed(1)}s</span>
        </label>
      )}
    </div>
  );
}

function Chip(props: { on: boolean; onClick: () => void; children: React.ReactNode; testId: string }) {
  return (
    <button
      onClick={props.onClick}
      data-testid={props.testId}
      data-on={props.on}
      className={`rounded-full px-3 py-1.5 ${props.on ? "bg-red-600 text-white" : "bg-white/10 text-gray-300"}`}
    >
      {props.children}
    </button>
  );
}
