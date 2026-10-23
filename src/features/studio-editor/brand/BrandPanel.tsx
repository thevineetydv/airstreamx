// Brand kit: logo + brand colours, saved on this phone. One tap adds the logo
// to the video; brand colours show first in the text colour pickers.

import { useRef, useState } from "react";
import { ImagePlus, Plus, Trash2, X } from "lucide-react";
import { logoFromFile, MAX_BRAND_COLORS, saveBrand, type Brand } from "../model/brand";

interface Props {
  brand: Brand;
  onChange: (b: Brand) => void;
  onAddLogo: () => void;
  hasLogoLayer: boolean;
  onClose: () => void;
}

export default function BrandPanel({ brand, onChange, onAddLogo, hasLogoLayer, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pick, setPick] = useState("#e11d48");
  const [msg, setMsg] = useState<string | null>(null);

  const update = (b: Brand) => {
    onChange(b);
    setMsg(saveBrand(b) ? null : "Could not save on this phone (private mode?). It works until you close the editor.");
  };

  return (
    <div className="max-h-[46vh] space-y-4 overflow-y-auto px-3 py-3 text-sm" data-testid="brand-panel">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-white">🏷️ Brand kit</h3>
        <button onClick={onClose} className="rounded-full bg-white/10 px-4 py-1.5 font-semibold" data-testid="brand-done">Done</button>
      </div>
      <p className="text-xs text-gray-400">Saved on this phone. Your logo and colours are ready in every new video.</p>

      <section className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Logo</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-white/15 bg-[repeating-conic-gradient(#222_0%_25%,#2a2a2a_0%_50%)] [background-size:12px_12px]"
            data-testid="brand-logo-pick"
            aria-label="Choose logo"
          >
            {brand.logo ? <img src={brand.logo} alt="Logo" className="max-h-full max-w-full object-contain" data-testid="brand-logo-preview" /> : <ImagePlus size={26} className="text-gray-400" />}
          </button>
          <div className="flex flex-col gap-2">
            {brand.logo && (
              <button
                onClick={onAddLogo}
                disabled={hasLogoLayer}
                className="rounded-full bg-red-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                data-testid="brand-add-logo"
              >
                {hasLogoLayer ? "✓ Logo is on this video" : "Add logo to this video"}
              </button>
            )}
            {brand.logo && (
              <button onClick={() => update({ ...brand, logo: undefined, logoWidth: undefined, logoHeight: undefined })} className="flex items-center gap-1 text-xs text-red-400" data-testid="brand-logo-remove">
                <Trash2 size={14} /> Remove logo
              </button>
            )}
            {!brand.logo && <span className="text-xs text-gray-500">PNG with a clear background looks best.</span>}
          </div>
        </div>
        {brand.logo && (
          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={brand.logoOnTemplates}
              onChange={(e) => update({ ...brand, logoOnTemplates: e.target.checked })}
              className="accent-red-500"
              data-testid="brand-logo-templates"
            />
            Add my logo to templates automatically
          </label>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          data-testid="brand-logo-input"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              update({ ...brand, ...(await logoFromFile(f)) });
            } catch {
              setMsg("Could not read this picture.");
            }
          }}
        />
      </section>

      <section className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Brand colours</span>
        <div className="flex flex-wrap items-center gap-2">
          {brand.colors.map((c) => (
            <span key={c} className="relative">
              <span className="block h-9 w-9 rounded-full border-2 border-white/20" style={{ background: c }} data-testid="brand-color" data-color={c} />
              <button
                onClick={() => update({ ...brand, colors: brand.colors.filter((x) => x !== c) })}
                className="absolute -right-1 -top-1 rounded-full bg-black p-0.5 text-gray-300"
                aria-label={`Remove colour ${c}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {brand.colors.length < MAX_BRAND_COLORS && (
            <span className="flex items-center gap-1.5 rounded-full bg-white/5 py-1 pl-1 pr-2">
              <input type="color" value={pick} onChange={(e) => setPick(e.target.value)} className="h-7 w-7 cursor-pointer rounded-full border-0 bg-transparent p-0" data-testid="brand-color-input" aria-label="Pick a colour" />
              <button
                onClick={() => !brand.colors.includes(pick.toLowerCase()) && update({ ...brand, colors: [...brand.colors, pick.toLowerCase()] })}
                className="flex items-center gap-1 text-xs font-semibold"
                data-testid="brand-color-add"
              >
                <Plus size={14} /> Add
              </button>
            </span>
          )}
        </div>
      </section>
      {msg && <p className="text-xs text-yellow-400">{msg}</p>}
    </div>
  );
}
