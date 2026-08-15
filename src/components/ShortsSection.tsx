import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Play, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { API_URL } from "../utils/constants";
const MAX_SHORT_DURATION = 60; // 3 minutes

interface Short {
  id: number;
  title: string;
  thumbnail: string;
  duration: number;
  views: number;
  uploader_email: string;
}

function fmtViews(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function fmtDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export default function ShortsSection() {
  const [shorts, setShorts] = useState<Short[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/videos?limit=30`);
        const data = await res.json();
        const all: Short[] = data.videos || [];
        setShorts(all.filter(v => v.duration > 0 && v.duration <= MAX_SHORT_DURATION).slice(0, 12));
      } catch {
        setShorts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -320 : 320, behavior: "smooth" });
  };

  if (loading) {
    return (
      <div className="mb-8">
        {/* Header skeleton — CLS FIX: same wrapper divs + minHeight:40px
            as the real header below, instead of a single short bar.
            The real header is two flex groups each pinned to 40px min
            height; the old skeleton was just one ~20px title bar, so
            swapping to real content added ~20px here alone. */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
            <div className="w-7 h-7 rounded-lg bg-[#110000] animate-pulse" />
            <div className="w-20 h-5 bg-[#110000] rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-2" style={{ minHeight: "40px" }} />
        </div>

        {/* Carousel skeleton — CLS FIX: matches the real row's
            minHeight (296px) and contain:strict exactly, instead of a
            plain overflow-hidden div with no explicit height. */}
        <div
          className="flex gap-3 overflow-hidden pb-2"
          style={{ minHeight: "296px", contain: "strict" }}
        >
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-36">
              <div className="aspect-[9/16] bg-[#110000] rounded-xl mb-2 animate-pulse" />
              <div className="h-3 bg-[#1a0000] rounded w-3/4 mb-1 animate-pulse" />
              <div className="h-3 bg-[#110000] rounded w-1/2 animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (shorts.length === 0) return null;

  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
            <Zap className="w-4 h-4 text-white fill-white" />
          </div>
          <h2 className="text-white font-bold text-lg">Shorts</h2>
          <span className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-full px-2 py-0.5">
            {shorts.length} videos
          </span>
        </div>

        <div className="flex items-center gap-2" style={{ minHeight: "40px" }}>
          <Link
            to="/shorts"
            className="text-sm text-red-400 hover:text-red-300 transition font-medium"
          >
            See all →
          </Link>
          <button
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition hidden sm:flex"
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </button>
          <button
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition hidden sm:flex"
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      {/* Horizontal scroll row */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide pb-2"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none", minHeight: "296px", contain: "strict" }}
      >
        {shorts.map((short, i) => (
          <motion.div
            key={short.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.04 }}
            className="flex-shrink-0 w-36 cursor-pointer group"
            onClick={() => navigate(`/shorts/${short.id}`)}
          >
            {/* Thumbnail — 9:16 portrait */}
            <div
              className="relative aspect-[9/16] rounded-xl overflow-hidden bg-[#0a0000] mb-2"
              style={{ containIntrinsicSize: "auto 9rem" }}
            >
              <img
                src={short.thumbnail}
                alt={short.title}
                className="short-thumbnail group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
                width={144}
                height={256}
                decoding="async"
              />
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition" />
              {/* Play button */}
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                  <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                </div>
              </div>
              {/* Duration */}
              <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                {fmtDuration(short.duration)}
              </div>
              {/* Shorts badge */}
              <div className="absolute top-2 left-2 bg-gradient-to-r from-red-500 to-red-500 text-white text-[10px] px-1.5 py-0.5 rounded font-bold shadow">
                SHORT
              </div>
            </div>

            {/* Info */}
            <p className="text-white text-xs font-medium line-clamp-2 leading-snug mb-1 group-hover:text-red-500 transition-colors" title={short.title}>
              {short.title}
            </p>
            <p className="text-gray-400 text-xs">{fmtViews(short.views)} views</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}