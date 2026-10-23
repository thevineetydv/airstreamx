// Green screen controls for a layer: remove a background colour.

import { BLUE_KEY, GREEN_KEY, guessKeyColor, type ChromaKey } from "../render/chroma";

interface Props {
  layerId: string;
  chroma: ChromaKey | undefined;
  onChange: (chroma: ChromaKey | undefined) => void;
}

/** Read the screen colour from the layer's picture in the preview (edges of the frame). */
function autoColor(layerId: string): string | null {
  const el = document.querySelector<HTMLVideoElement | HTMLImageElement>(`[data-layer-id="${layerId}"]`);
  if (!el) return null;
  const w = 96, h = 96;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(el, 0, 0, w, h);
    return guessKeyColor(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch {
    return null;
  }
}

export default function GreenScreen({ layerId, chroma, onChange }: Props) {
  const is = (k: ChromaKey) => chroma?.color === k.color;
  const chip = (on: boolean) => `rounded-full px-3 py-2 ${on ? "bg-red-600 text-white" : "bg-white/10 text-gray-300"}`;
  const custom = chroma && !is(GREEN_KEY) && !is(BLUE_KEY);
  return (
    <div className="space-y-2 rounded-2xl bg-white/5 p-3" data-testid="green-screen">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-semibold text-gray-300">Remove background</span>
        <button onClick={() => onChange(undefined)} className={chip(!chroma)} data-testid="chroma-off">Off</button>
        <button onClick={() => onChange({ ...GREEN_KEY, strength: chroma?.strength ?? GREEN_KEY.strength })} className={chip(is(GREEN_KEY))} data-testid="chroma-green">
          🟩 Green
        </button>
        <button onClick={() => onChange({ ...BLUE_KEY, strength: chroma?.strength ?? BLUE_KEY.strength })} className={chip(is(BLUE_KEY))} data-testid="chroma-blue">
          🟦 Blue
        </button>
        <button
          onClick={() => {
            const color = autoColor(layerId);
            if (color) onChange({ color, strength: chroma?.strength ?? 0.4 });
          }}
          className={chip(!!custom)}
          data-testid="chroma-auto"
        >
          {custom ? <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: chroma!.color }} /> : null}
          Auto pick
        </button>
      </div>
      {chroma && (
        <label className="flex items-center gap-3 text-xs text-gray-400">
          Strength
          <input
            type="range" min={0} max={1} step={0.05}
            value={chroma.strength}
            onChange={(e) => onChange({ ...chroma, strength: Number(e.target.value) })}
            className="flex-1 accent-red-500"
            data-testid="chroma-strength"
          />
          <span className="w-9 text-right tabular-nums">{Math.round(chroma.strength * 100)}%</span>
        </label>
      )}
      {chroma && <p className="text-[11px] text-gray-500">Works best with an evenly lit green or blue cloth. Raise Strength if green is left, lower it if your subject gets holes.</p>}
    </div>
  );
}
