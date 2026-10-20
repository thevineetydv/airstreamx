// Captions: generate with Whisper (in the browser), edit, style, choose output.

import { useEffect, useRef, useState } from "react";
import { Captions, Loader2, Plus, Trash2, X } from "lucide-react";
import type { Caption, CaptionLanguage, CaptionLook, CaptionPosition, CaptionSettings } from "../model/captions";
import { formatTime } from "../model/timeline";
import { ASR_MODELS, type AsrModelId, type CaptionJob } from "./useCaptionGenerator";

interface Props {
  captions: CaptionSettings;
  job: CaptionJob;
  time: number;
  activeId: string | null;
  onGenerate: (model: AsrModelId, language: CaptionLanguage) => void;
  onCancel: () => void;
  onChange: (patch: Partial<CaptionSettings>) => void;
  onEdit: (id: string, patch: Partial<Caption>) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onSeek: (t: number) => void;
  onDone: () => void;
}

const MODEL_KEY = "studio-editor:asr-model";
const readModel = (): AsrModelId => {
  try {
    const v = localStorage.getItem(MODEL_KEY);
    return (ASR_MODELS.find((m) => m.id === v)?.id ?? "Xenova/whisper-base") as AsrModelId;
  } catch { return "Xenova/whisper-base"; }
};

const mb = (b: number) => `${(b / 1048576).toFixed(0)} MB`;

export default function CaptionsPanel(props: Props) {
  const { captions, job, time, activeId, onGenerate, onCancel, onChange, onEdit, onDelete, onAdd, onSeek, onDone } = props;
  const [model, setModel] = useState<AsrModelId>(readModel);
  const busy = job.stage === "mixing" || job.stage === "download" || job.stage === "listening";
  const has = captions.items.length > 0;
  const [showSetup, setShowSetup] = useState(!has);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => { if (has && !busy) setShowSetup(false); }, [has, busy]);

  // Keep the caption under the playhead in view (scrolls the list only, not the page).
  useEffect(() => {
    const list = listRef.current;
    const el = activeId ? itemRefs.current[activeId] : null;
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop || el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, el.offsetTop - 8);
    }
  }, [activeId]);

  const pickModel = (id: AsrModelId) => {
    setModel(id);
    try { localStorage.setItem(MODEL_KEY, id); } catch { /* ignore */ }
  };

  return (
    <div className="flex max-h-[48vh] flex-col text-sm" data-testid="captions-panel">
      <div className="flex shrink-0 items-center justify-between px-3 py-2">
        <h3 className="font-bold text-white">Captions</h3>
        <button onClick={onDone} disabled={busy} className="rounded-full bg-white/10 px-4 py-1.5 font-semibold disabled:opacity-40" data-testid="captions-done">
          Done
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3">
        {/* ── Generate ── */}
        {busy ? (
          <div className="space-y-2 rounded-2xl bg-white/5 p-3" data-testid="captions-progress">
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-red-400" />
              <span className="flex-1">
                {job.stage === "mixing" && "Preparing audio…"}
                {job.stage === "download" && `Downloading speech model… ${job.total ? `${mb(job.loaded)} / ${mb(job.total)}` : ""}`}
                {job.stage === "listening" && "Listening and writing captions…"}
              </span>
              <button onClick={onCancel} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Cancel">
                <X size={16} />
              </button>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-red-500 transition-[width]" style={{ width: `${Math.round(job.progress * 100)}%` }} />
            </div>
            {job.stage === "download" && <p className="text-[11px] text-gray-500">One-time download. Next time it starts instantly.</p>}
            {job.stage === "listening" && <p className="text-[11px] text-gray-500">Keep this screen open. On phones this takes about 1–3× the video length.</p>}
          </div>
        ) : showSetup ? (
          <div className="space-y-2 rounded-2xl bg-white/5 p-3" data-testid="captions-setup">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Spoken language</div>
            <div className="grid grid-cols-2 gap-2">
              {([["hindi", "हिंदी (Hindi)"], ["english", "English / Hinglish"]] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => onChange({ language: id })}
                  className={`rounded-xl border px-2 py-2 ${captions.language === id ? "border-red-500 bg-red-500/10" : "border-white/10"}`}
                  data-testid={`captions-lang-${id}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">
              Hindi gives Devanagari text. English / Hinglish gives Roman letters.
            </p>
            <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Quality</div>
            <div className="grid grid-cols-3 gap-2">
              {ASR_MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => pickModel(m.id)}
                  className={`rounded-xl border px-2 py-2 text-left ${model === m.id ? "border-red-500 bg-red-500/10" : "border-white/10"}`}
                  data-testid={`captions-model-${m.label.toLowerCase()}`}
                >
                  <div className="font-semibold">{m.label}</div>
                  <div className="text-[10px] text-gray-400">{m.size}</div>
                  <div className="text-[10px] leading-tight text-gray-500">{m.note}</div>
                </button>
              ))}
            </div>
            {job.stage === "error" && <p className="text-xs text-red-400" data-testid="captions-error">{job.message}</p>}
            <button
              onClick={() => onGenerate(model, captions.language)}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-red-600 py-3 font-bold"
              data-testid="captions-generate"
            >
              <Captions size={18} /> {has ? "Generate again (replaces current)" : "Generate captions"}
            </button>
            {has && (
              <button onClick={() => setShowSetup(false)} className="w-full text-xs text-gray-400 underline">Cancel</button>
            )}
            <p className="text-[11px] text-gray-500">Runs on your device. Your audio is not uploaded anywhere.</p>
          </div>
        ) : null}

        {has && !busy && (
          <>
            {/* ── Style ── */}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(["bottom", "middle", "top"] as CaptionPosition[]).map((p) => (
                  <Chip key={p} on={captions.position === p} onClick={() => onChange({ position: p })}>{p[0].toUpperCase() + p.slice(1)}</Chip>
                ))}
                <span className="w-2" />
                {([["box", "Box"], ["outline", "Outline"], ["yellow", "Yellow"]] as [CaptionLook, string][]).map(([l, label]) => (
                  <Chip key={l} on={captions.look === l} onClick={() => onChange({ look: l })}>{label}</Chip>
                ))}
              </div>
              <label className="flex items-center gap-3 text-xs text-gray-400">
                Size
                <input
                  type="range" min={0.6} max={1.8} step={0.05} value={captions.scale}
                  onChange={(e) => onChange({ scale: Number(e.target.value) })}
                  className="flex-1 accent-red-500"
                />
              </label>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Chip on={captions.burnIn} onClick={() => onChange({ burnIn: !captions.burnIn })} testId="captions-burn">Burn into video</Chip>
                <Chip on={captions.subtitleTrack} onClick={() => onChange({ subtitleTrack: !captions.subtitleTrack })} testId="captions-track">Subtitle track + .srt</Chip>
              </div>
              {!captions.burnIn && !captions.subtitleTrack && (
                <p className="text-[11px] text-yellow-400">Captions will not be in the export. Turn on at least one option.</p>
              )}
            </div>

            {/* ── List ── */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{captions.items.length} lines</span>
              <div className="flex gap-2 text-xs">
                <button onClick={onAdd} className="flex items-center gap-1 rounded-full border border-white/15 px-3 py-1" data-testid="captions-add">
                  <Plus size={12} /> Add at {formatTime(time)}
                </button>
                <button onClick={() => setShowSetup(true)} className="rounded-full border border-white/15 px-3 py-1" data-testid="captions-regenerate">
                  Regenerate
                </button>
              </div>
            </div>
            <div ref={listRef} className="relative max-h-56 space-y-1.5 overflow-y-auto" data-testid="captions-list">
              {[...captions.items].sort((a, b) => a.start - b.start).map((c) => (
                <div
                  key={c.id}
                  ref={(el) => { itemRefs.current[c.id] = el; }}
                  className={`flex items-start gap-2 rounded-xl p-2 ${c.id === activeId ? "bg-yellow-500/15 ring-1 ring-yellow-400/60" : "bg-white/5"}`}
                  data-testid="caption-item"
                >
                  <button onClick={() => onSeek(c.start + 0.01)} className="mt-1 shrink-0 text-[10px] tabular-nums text-gray-400 underline-offset-2 hover:underline">
                    {formatTime(c.start)}
                  </button>
                  <textarea
                    value={c.text}
                    rows={2}
                    onChange={(e) => onEdit(c.id, { text: e.target.value.slice(0, 120) })}
                    onFocus={() => onSeek(c.start + 0.01)}
                    placeholder="Type caption…"
                    // field-sizing: grow with the text (Chrome 123+); older browsers keep 2 rows.
                    className="min-h-[32px] flex-1 resize-none rounded-lg bg-transparent px-1 py-1 text-sm text-white [field-sizing:content] focus:bg-white/5 focus:outline-none"
                    data-testid="caption-text"
                  />
                  <button onClick={() => onDelete(c.id)} className="mt-0.5 shrink-0 rounded-full p-1.5 text-red-400" aria-label="Delete caption">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Chip(props: { on: boolean; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      onClick={props.onClick}
      data-testid={props.testId}
      data-on={props.on}
      className={`rounded-full px-3 py-1 ${props.on ? "bg-red-600 text-white" : "bg-white/10 text-gray-300"}`}
    >
      {props.on && props.testId ? "✓ " : ""}{props.children}
    </button>
  );
}
