// Template gallery + the short form for the chosen template.
// The gallery previews are drawn with the real overlay renderer, so each card
// shows what the template will actually put on the video.

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Sparkles, Star } from "lucide-react";
import { drawOverlaysAt } from "../render/drawOverlays";
import { readMemo } from "../model/overlays";
import { sampleValues, TEMPLATES, type Template } from "../model/templates";

interface Props {
  /** "start": before any video (button picks videos). "editor": applies to the current edit. */
  mode: "start" | "editor";
  busy?: boolean;
  onApply: (t: Template, values: Record<string, string>) => void;
  onClose: () => void;
}

const input =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-red-500 focus:outline-none";

export default function TemplatePanel({ mode, busy, onApply, onClose }: Props) {
  const [chosen, setChosen] = useState<Template | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const choose = (t: Template) => {
    // Pre-fill: things typed before on this device, else empty (samples are only placeholders).
    const memo = readMemo();
    setValues(Object.fromEntries(t.fields.map((f) => [f.key, (f.remember && memo[f.remember]) || (f.kind === "rating" ? f.sample : "")])));
    setChosen(t);
  };

  const missing = chosen?.fields.filter((f) => !f.optional && !values[f.key]?.trim()) ?? [];

  return (
    <div className="w-full space-y-3 px-3 py-3" data-testid="template-panel">
      <div className="flex items-center gap-2">
        {chosen && (
          <button onClick={() => setChosen(null)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Back to templates">
            <ArrowLeft size={18} />
          </button>
        )}
        <h3 className="flex-1 text-sm font-bold text-white">
          {chosen ? `${chosen.emoji} ${chosen.name}` : "Templates"}
        </h3>
        <button onClick={onClose} className="rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold" data-testid="template-close">
          {mode === "start" ? "Cancel" : "Done"}
        </button>
      </div>

      {!chosen ? (
        <>
          <p className="text-xs text-gray-400">
            {mode === "start" ? "Pick a look, fill in a few words, then choose your videos." : "Applies text, music, colour and shape to your edit. You can change everything after."}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.map((t) => (
              <button key={t.id} onClick={() => choose(t)} className="overflow-hidden rounded-2xl bg-white/5 text-left active:scale-[0.98]" data-testid={`template-${t.id}`}>
                <TemplateThumb t={t} />
                <div className="px-2 py-1.5">
                  <div className="truncate text-xs font-bold text-white">{t.emoji} {t.name}</div>
                  <div className="line-clamp-2 text-[10px] leading-tight text-gray-400">{t.tagline}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <form
          className="space-y-2.5"
          onSubmit={(e) => { e.preventDefault(); if (!missing.length && !busy) onApply(chosen, values); }}
          data-testid="template-form"
        >
          {chosen.fields.map((f) => (
            <label key={f.key} className="block space-y-1">
              <span className="text-xs text-gray-400">{f.label}{f.optional ? " (optional)" : ""}</span>
              {f.kind === "rating" ? (
                <div className="flex gap-1" role="radiogroup" aria-label={f.label}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setValues((v) => ({ ...v, [f.key]: String(n) }))}
                      className="p-1"
                      aria-label={`${n} star${n > 1 ? "s" : ""}`}
                      data-testid={`template-rating-${n}`}
                    >
                      <Star size={26} className={n <= Number(values[f.key] || 0) ? "fill-yellow-400 text-yellow-400" : "text-gray-600"} />
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  value={values[f.key] ?? ""}
                  onChange={(e) => {
                    const raw = f.kind === "tel" ? e.target.value.replace(/[^\d+ -]/g, "") : e.target.value;
                    setValues((v) => ({ ...v, [f.key]: raw.slice(0, f.max ?? 40) }));
                  }}
                  placeholder={f.placeholder}
                  inputMode={f.kind === "tel" ? "tel" : undefined}
                  className={input}
                  data-testid={`template-field-${f.key}`}
                />
              )}
            </label>
          ))}
          <button
            type="submit"
            disabled={missing.length > 0 || busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-red-600 py-3 font-bold disabled:opacity-40"
            data-testid="template-apply"
          >
            <Sparkles size={18} /> {mode === "start" ? "Choose videos" : "Apply template"}
          </button>
          {missing.length > 0 && <p className="text-center text-[11px] text-gray-500">Fill in: {missing.map((f) => f.label).join(", ")}</p>}
        </form>
      )}
    </div>
  );
}

/** Small 9:16 preview: template colours + its real text / banners with sample words. */
function TemplateThumb({ t }: { t: Template }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const W = c.width, H = c.height;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.colors[0]);
    g.addColorStop(1, t.colors[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Show each item as it looks once it has appeared (items that come later
    // are drawn at their own time); skip the closing call-to-action.
    const total = 10;
    const r = t.build(sampleValues(t), total);
    for (const o of r.overlays) {
      if (o.start >= total - 3) continue;
      const at = o.start <= 2.6 && o.end > 2.6 ? 2.6 : o.start + 1.5;
      drawOverlaysAt(ctx, [o], at, W, H);
    }
  }, [t]);
  return <canvas ref={ref} width={180} height={320} className="aspect-[9/16] w-full" data-testid="template-thumb" />;
}
