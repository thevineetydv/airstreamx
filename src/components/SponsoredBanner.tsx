// components/SponsoredBanner.tsx
//
// Fetches the currently-active sponsored banner and renders it. Renders
// nothing if there's no active banner — safe to always include in the
// homepage, it just won't show anything on days with no sponsor.

import { useEffect, useState } from "react";
import { Store, ExternalLink } from "lucide-react";
import { API_URL } from "../utils/constants";

interface Banner {
  id: number;
  business_name: string;
  tagline: string;
  link_url: string;
}

export default function SponsoredBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/api/sponsored/current`)
      .then((r) => r.json())
      .then((data) => setBanner(data.banner))
      .catch(() => setBanner(null))
      .finally(() => setLoading(false));
  }, []);

  // Nothing to show — either still loading or genuinely no active
  // banner right now. Render nothing rather than a placeholder/skeleton,
  // since this is optional content, not core to the page.
  if (loading || !banner) return null;

  return (
    <a
      href={banner.link_url}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="flex items-center gap-3 bg-[#212121] border border-red-500/20 rounded-xl px-3.5 py-3 mb-4 hover:border-red-500/40 transition-colors group"
    >
      <div className="w-11 h-11 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
        <Store size={20} className="text-red-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-white text-sm font-medium truncate">{banner.business_name}</span>
          <span className="text-[10px] text-red-300 bg-red-500/10 px-1.5 py-0.5 rounded flex-shrink-0">
            Sponsored
          </span>
        </div>
        <p className="text-gray-400 text-xs truncate">{banner.tagline}</p>
      </div>
      <ExternalLink size={16} className="text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" />
    </a>
  );
}
