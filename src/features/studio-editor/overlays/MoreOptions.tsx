// "More options" fold: keeps panels short for most creators; everything
// advanced (style, font, animation, keyframes) is one tap away.

import { ChevronDown } from "lucide-react";
import { setPrefs, usePrefs } from "../model/prefs";

export default function MoreOptions({ label, children }: { label: string; children: React.ReactNode }) {
  const { more, pro } = usePrefs();
  return (
    <div className="rounded-2xl border border-white/10" data-testid="more-options-box">
      <button
        onClick={() => setPrefs({ more: !more })}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-xs font-semibold text-gray-300"
        aria-expanded={more}
        data-testid="more-options"
      >
        <span>More options <span className="font-normal text-gray-500">· {label}</span></span>
        <ChevronDown size={16} className={`transition-transform ${more ? "rotate-180" : ""}`} />
      </button>
      {more && (
        <div className="space-y-3 border-t border-white/10 px-3 pb-3 pt-3">
          {children}
          <label className="flex items-center gap-2 border-t border-white/10 pt-2.5 text-xs text-gray-400">
            <input type="checkbox" checked={pro} onChange={(e) => setPrefs({ pro: e.target.checked })} className="h-4 w-4 accent-red-500" data-testid="pro-mode" />
            <span><span className="font-semibold text-gray-200">Pro mode</span> · show keyframe tools (move / resize over time)</span>
          </label>
        </div>
      )}
    </div>
  );
}
