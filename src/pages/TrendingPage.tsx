import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMetaTags } from "../hooks/useMetaTags";
import { BreadcrumbSchema, getBreadcrumbs } from "../components/BreadcrumbSchema";
import { API_URL } from "../utils/constants";
import { TrendingUp, Flame } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Video {
  id: string | number;
  title: string;
  thumbnail: string;
  views: number;
  uploader: string;
  duration: number;
  created_at?: string;
}

interface Creator {
  handle: string;
  name: string;
  avatar: string;
  subscribers: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}K`;
  return views.toString();
}

function formatSubs(subs: number): string {
  if (subs >= 1_000_000) return `${(subs / 1_000_000).toFixed(1)}M`;
  if (subs >= 1_000) return `${(subs / 1_000).toFixed(1)}K`;
  return subs.toString();
}

function formatDuration(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} months ago`;
}

// ─── Category pills (static, YouTube-style) ───────────────────────────────────

const CATEGORIES = ["All", "Music", "Gaming", "News", "Sports", "Tech", "Cooking", "Comedy"];

// ─── Skeleton components ──────────────────────────────────────────────────────

function VideoCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-video bg-[#272727] rounded-xl mb-3" />
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-full bg-[#272727] flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="h-3.5 bg-[#272727] rounded w-full" />
          <div className="h-3 bg-[#272727] rounded w-2/3" />
          <div className="h-3 bg-[#272727] rounded w-1/3" />
        </div>
      </div>
    </div>
  );
}

function CreatorCardSkeleton() {
  return (
    <div className="animate-pulse bg-[#212121] rounded-xl p-5 flex flex-col items-center">
      <div className="w-20 h-20 rounded-full bg-[#272727] mb-3" />
      <div className="h-3.5 bg-[#272727] rounded w-24 mb-2" />
      <div className="h-3 bg-[#272727] rounded w-16" />
    </div>
  );
}

// ─── Video Card ───────────────────────────────────────────────────────────────

function VideoCard({ video, rank }: { video: Video; rank: number }) {
  return (
    <Link to={`/watch?id=${video.id}`} className="group block">
      {/* Thumbnail */}
      <div className="relative aspect-video bg-[#181818] rounded-xl overflow-hidden mb-3">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
        />
        {/* Duration badge */}
        <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
          {formatDuration(video.duration)}
        </span>
        {/* Rank badge — top 3 get gold/silver/bronze */}
        {rank <= 3 && (
          <span
            className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-lg
              ${rank === 1 ? "bg-yellow-400 text-black" : rank === 2 ? "bg-gray-300 text-black" : "bg-orange-400 text-black"}`}
          >
            #{rank}
          </span>
        )}
      </div>

      {/* Meta */}
      <div className="flex gap-3">
        {/* Avatar placeholder */}
        <div className="w-9 h-9 rounded-full bg-[#3a3a3a] flex-shrink-0 flex items-center justify-center text-xs font-bold text-white uppercase">
          {video.uploader?.[0] ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug line-clamp-2 group-hover:text-white text-[#f1f1f1]">
            {video.title}
          </p>
          <p className="text-xs text-[#aaa] mt-1">{video.uploader}</p>
          <p className="text-xs text-[#aaa]">
            {formatViews(video.views)} views
            {video.created_at ? ` · ${timeAgo(video.created_at)}` : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}

// ─── Creator Card ─────────────────────────────────────────────────────────────

function CreatorCard({ creator, rank }: { creator: Creator; rank: number }) {
  return (
    <Link
      to={`/creators/${creator.handle}`}
      className="group bg-[#212121] hover:bg-[#2a2a2a] rounded-xl p-5 flex flex-col items-center text-center transition-colors"
    >
      <div className="relative mb-3">
        <img
          src={creator.avatar}
          alt={creator.name}
          className="w-20 h-20 rounded-full object-cover ring-2 ring-transparent group-hover:ring-red-500 transition-all"
        />
        {rank <= 3 && (
          <span
            className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow
              ${rank === 1 ? "bg-yellow-400 text-black" : rank === 2 ? "bg-gray-300 text-black" : "bg-orange-400 text-black"}`}
          >
            #{rank}
          </span>
        )}
      </div>
      <p className="font-semibold text-sm text-[#f1f1f1] truncate w-full">{creator.name}</p>
      <p className="text-xs text-[#aaa] mt-0.5">@{creator.handle}</p>
      <p className="text-xs text-red-500 font-medium mt-2">
        {formatSubs(creator.subscribers)} subscribers
      </p>
      <button className="mt-3 px-4 py-1.5 rounded-full bg-white text-black text-xs font-semibold hover:bg-gray-200 transition-colors">
        Subscribe
      </button>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TrendingPage() {
  const [trendingVideos, setTrendingVideos] = useState<Video[]>([]);
  const [trendingCreators, setTrendingCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("All");

  useMetaTags({
    title: "Trending Videos - AirStreamX",
    description: "Watch the latest trending videos and discover trending creators on AirStreamX.",
    keywords: ["trending", "viral", "popular videos", "top creators"],
    url: "https://airstreamx.com/trending",
    canonicalUrl: "https://airstreamx.com/trending",
    type: "website",
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_URL}/videos/trending?limit=24`).then(r => r.json()).catch(() => []),
      fetch(`${API_URL}/creators/trending?limit=12`).then(r => r.json()).catch(() => []),
    ])
      .then(([videos, creators]) => {
        setTrendingVideos(Array.isArray(videos) ? videos : []);
        setTrendingCreators(Array.isArray(creators) ? creators : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <BreadcrumbSchema items={getBreadcrumbs("/trending")} />

      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">

          {/* ── Page header ── */}
          <div className="flex items-center gap-3 mb-2">
            <Flame className="w-7 h-7 text-red-500" />
            <h1 className="text-3xl font-bold tracking-tight">Trending</h1>
          </div>
          <p className="text-[#aaa] text-sm mb-6">
            What the world is watching right now
          </p>

          {/* ── Category pills ── */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-8 scrollbar-hide">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${activeCategory === cat
                    ? "bg-white text-black"
                    : "bg-[#272727] text-white hover:bg-[#3a3a3a]"
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* ── Trending Videos ── */}
          <section className="mb-12">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-5 h-5 text-red-500" />
              <h2 className="text-xl font-semibold">Trending Videos</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
              {loading
                ? Array.from({ length: 8 }).map((_, i) => <VideoCardSkeleton key={i} />)
                : trendingVideos.length > 0
                  ? trendingVideos.map((v, i) => (
                      <VideoCard key={v.id} video={v} rank={i + 1} />
                    ))
                  : (
                    <p className="col-span-full text-center text-[#aaa] py-12">
                      No trending videos right now. Check back soon.
                    </p>
                  )
              }
            </div>
          </section>

          {/* ── Divider ── */}
          <div className="border-t border-white/10 mb-10" />

          {/* ── Trending Creators ── */}
          <section>
            <div className="flex items-center gap-2 mb-5">
              <Flame className="w-5 h-5 text-orange-400" />
              <h2 className="text-xl font-semibold">Trending Creators</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => <CreatorCardSkeleton key={i} />)
                : trendingCreators.length > 0
                  ? trendingCreators.map((c, i) => (
                      <CreatorCard key={c.handle} creator={c} rank={i + 1} />
                    ))
                  : (
                    <p className="col-span-full text-center text-[#aaa] py-12">
                      No trending creators right now.
                    </p>
                  )
              }
            </div>
          </section>

        </div>
      </div>
    </>
  );
}