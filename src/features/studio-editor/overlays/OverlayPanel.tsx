// Settings for the selected overlay. Replaces the tool row while an overlay is selected.

import { Trash2 } from "lucide-react";
import KeyframeControls, { type KeyframeProps } from "./KeyframeControls";
import AnimationPicker from "./AnimationPicker";
import MoreOptions from "./MoreOptions";
import type { Animations } from "../model/presets";
import {
  MAX_SCALE, MIN_SCALE, STICKERS, TEXT_COLORS, TEXT_STYLE_LABELS,
  type Overlay, type OverlayPatch, type TextStyle,
} from "../model/overlays";
import { formatTime } from "../model/timeline";
import { cssFamily, FONT_LABELS, FONT_SAMPLE, type TextFont } from "../render/fonts";
import { DEFAULT_TEXT } from "../model/overlays";
import { TITLE_STYLES, type TitleStyle } from "../model/titles";
import type { CSSProperties } from "react";

const FONTS: TextFont[] = ["default", "hindi", "impact", "hand"];
const STYLES: TextStyle[] = ["outline", "box", "shadow", "neon", "plain"];
const ACCENTS = ["#000000", "#ffffff", "#dc2626", "#facc15", "#ec4899", "#2563eb"];

/** Rough CSS look of a quick style, for its button. */
function titlePreviewCss(t: TitleStyle): CSSProperties {
  const p = t.patch;
  const css: CSSProperties = { fontFamily: cssFamily(p.font ?? "default"), fontWeight: p.font === "default" || !p.font ? 800 : undefined, color: p.color };
  if (p.style === "box") css.background = p.accent ?? "rgba(0,0,0,0.62)";
  if (p.style === "outline") css.WebkitTextStroke = `1px ${p.accent ?? "#000"}`;
  if (p.style === "shadow") css.textShadow = "1px 2px 3px rgba(0,0,0,0.9)";
  if (p.style === "neon") css.textShadow = `0 0 6px ${p.accent}, 0 0 12px ${p.accent}`;
  return css;
}

interface Props {
  overlay: Overlay;
  onChange: (patch: OverlayPatch) => void;
  onSetStart: () => void;
  onSetEnd: () => void;
  onDelete: () => void;
  onDone: () => void;
  /** Animation (Phase 6b): values at the playhead + keyframe actions. */
  anim: Omit<KeyframeProps, "scaleMin" | "scaleMax">;
  /** Ready-made animations (Phase 7). */
  presets: { anim: Animations | undefined; onChange: (a: Animations) => void; onPreview: (tab: "in" | "out" | "loop") => void };
  /** Brand kit colours (shown first in the colour pickers). */
  brandColors: string[];
}

const input =
  "w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-red-500 focus:outline-none";

const TITLES: Record<Overlay["kind"], string> = {
  text: "Text",
  sticker: "Sticker",
  area: "📍 Area tag",
  deal: "Local Deal banner",
};

export default function OverlayPanel({ overlay: o, onChange, onSetStart, onSetEnd, onDelete, onDone, anim, presets, brandColors }: Props) {
  const palette = [...new Set([...brandColors, ...TEXT_COLORS])];
  const accents = [...new Set([...brandColors, ...ACCENTS])];
  return (
    <div className="space-y-3 px-3 py-3" data-testid="overlay-panel">
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
          {/* Quick styles: font + colours + animation in one tap. */}
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]" data-testid="title-styles">
            {TITLE_STYLES.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  const { anim: a, ...rest } = t.patch;
                  onChange({ ...rest, accent: rest.accent });
                  if (a) presets.onChange(a);
                }}
                className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-sm"
                style={titlePreviewCss(t)}
                data-testid={`title-${t.id}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={o.text}
            // New text: focus it and select "Your text", so typing replaces it.
            autoFocus={o.text === DEFAULT_TEXT}
            onFocus={(e) => { if (o.text === DEFAULT_TEXT) e.currentTarget.select(); }}
            onChange={(e) => onChange({ text: e.target.value.slice(0, 120) })}
            rows={2}
            placeholder="Type here… (Hindi bhi chalega)"
            className={input}
            data-testid="overlay-text"
          />
          {/* Colour of the letters: brand colours first. */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]" data-testid="text-colors">
            {palette.map((c) => (
              <button
                key={c}
                onClick={() => onChange({ color: c })}
                aria-label={`Colour ${c}`}
                className={`relative h-9 w-9 shrink-0 rounded-full border-2 ${o.color === c ? "border-red-500" : "border-white/20"}`}
                style={{ background: c }}
                data-testid={`text-color-${c.slice(1)}`}
              >
                {brandColors.includes(c) && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-black bg-white" title="Brand colour" />}
              </button>
            ))}
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

      <MoreOptions label={o.kind === "text" ? "style, font, animation, timing" : "animation, timing"}>
        {o.kind === "text" && (
          <>
            {/* Style + its colour */}
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="radiogroup" aria-label="Text style">
              {STYLES.map((st) => (
                <button
                  key={st}
                  onClick={() => onChange({ style: st })}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-xs ${o.style === st ? "bg-red-600 text-white" : "bg-white/10 text-gray-300"}`}
                  aria-pressed={o.style === st}
                  data-testid={`text-style-${st}`}
                >
                  {TEXT_STYLE_LABELS[st]}
                </button>
              ))}
            </div>
            {o.style !== "plain" && (
              <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none]">
                <span className="shrink-0 text-[11px] text-gray-400">{TEXT_STYLE_LABELS[o.style]} colour</span>
                <button
                  onClick={() => onChange({ accent: undefined })}
                  className={`h-8 shrink-0 rounded-full border-2 px-2.5 text-[11px] ${!o.accent ? "border-red-500" : "border-white/20"}`}
                  data-testid="accent-auto"
                >
                  Auto
                </button>
                {accents.map((c) => (
                  <button
                    key={c}
                    onClick={() => onChange({ accent: c })}
                    aria-label={`${TEXT_STYLE_LABELS[o.style]} colour ${c}`}
                    className={`h-8 w-8 shrink-0 rounded-full border-2 ${o.accent === c ? "border-red-500" : "border-white/20"}`}
                    style={{ background: c }}
                    data-testid={`accent-${c.slice(1)}`}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-1.5" role="radiogroup" aria-label="Font">
              {FONTS.map((f) => {
                const on = (o.font ?? "default") === f;
                return (
                  <button
                    key={f}
                    onClick={() => onChange({ font: f })}
                    className={`flex-1 rounded-xl border px-1 py-1.5 text-center ${on ? "border-red-500 bg-red-500/10" : "border-white/10 bg-white/5"}`}
                    aria-pressed={on}
                    data-testid={`font-${f}`}
                  >
                    <div className="text-base leading-tight text-white" style={{ fontFamily: cssFamily(f), fontWeight: f === "default" ? 800 : undefined }}>{FONT_SAMPLE[f]}</div>
                    <div className="text-[10px] text-gray-400">{FONT_LABELS[f]}</div>
                  </button>
                );
              })}
            </div>
          </>
        )}
        <AnimationPicker anim={presets.anim} isText={o.kind === "text"} onChange={presets.onChange} onPreview={presets.onPreview} />
        <div className="flex items-center gap-2 text-xs">
          <span className="tabular-nums text-gray-400">
            {formatTime(o.start)} → {formatTime(o.end)}
          </span>
          <button onClick={onSetStart} className="ml-auto rounded-full border border-white/15 px-3 py-2" data-testid="overlay-set-start">
            Start here
          </button>
          <button onClick={onSetEnd} className="rounded-full border border-white/15 px-3 py-2" data-testid="overlay-set-end">
            End here
          </button>
        </div>
      </MoreOptions>
      <p className="text-[11px] text-gray-500">Drag on the video to move. Drag the bar on the timeline to change timing.</p>
    </div>
  );
}
