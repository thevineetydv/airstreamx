// pages/TrendingPage.tsx
//
// 🔥 Trending — videos and Shorts ranked by what people are watching,
// liking and sharing right now (last 72 h, newer activity counts more),
// plus the creators with the most activity this week.
//
// Before: this page called /videos/trending and /creators/trending, which
// did not exist on the backend, so it always said "No trending videos".
// The category pills did nothing and "Subscribe" was a fake button.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMetaTags } from "../hooks/useMetaTags";
import { BreadcrumbSchema, getBreadcrumbs } from "../components/BreadcrumbSchema";
import { TrendingUp, Flame, Share2, RefreshCw } from "lucide-react";
import { fmtDuration, timeAgo, formatVideoTitle } from "../utils/format";
import {
  fetchTrending, fetchTrendingCreators, compactCount,
  type TrendingVideo, type TrendingCreator, type TrendingType,
} from "../utils/trending";

const TABS: { key: TrendingType; label: string }[] = [
  { key: "", label: "All" },
  { key: "long", label: "Videos" },
  { key: "short", label: "Shorts" },
];

// ─── Skeletons ────────────────────────────────────────────────

function VideoCardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="aspect-video bg-[#272727] rounded-xl mb-3" />
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-full bg-[#272727] flex-shrink-0" />
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="h-3.5 bg-[#272727] rounded w-full" />
          <div className="h-3 bg-[#272727] rounded w-2/3" />
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

// ─── Cards ────────────────────────────────────────────────────

const rankStyle = (rank: number) =>
  rank === 1 ? "bg-yellow-400 text-black" : rank === 2 ? "bg-gray-300 text-black" : "bg-orange-400 text-black";

function Avatar({ src, name }: { src?: string; name: string }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return <img src={src} alt="" onError={() => setBroken(true)} className="w-9 h-9 rounded-full object-cover flex-shrink-0 bg-[#3a3a3a]" loading="lazy" />;
  }
  return (
    <div className="w-9 h-9 rounded-full bg-[#3a3a3a] flex-shrink-0 flex items-center justify-center text-xs font-bold text-white uppercase" aria-hidden="true">
      {name?.[0] ?? "?"}
    </div>
  );
}

function VideoCard({ video, rank }: { video: TrendingVideo; rank: number }) {
  const id = video.public_id || video.id;
  const href = video.is_short ? `/shorts/${id}` : `/watch?v=${id}`;
  const channel = video.channel_name || video.uploader?.split("@")[0] || "Creator";
  const title = formatVideoTitle(video.title);

  return (
    <Link to={href} state={video.is_short ? undefined : { preview: video }} className="group block">
      <div className="relative aspect-video bg-[#212121] rounded-xl overflow-hidden mb-3">
        <img
          src={video.thumbnail}
          alt=""
          className={`w-full h-full ${video.is_short ? "object-contain" : "object-cover"} group-hover:scale-105 transition-transform duration-200`}
          loading="lazy"
        />
        {video.duration ? (
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[11px] font-medium px-1.5 py-0.5 rounded">
            {video.is_short ? "Short" : fmtDuration(video.duration)}
          </span>
        ) : null}
        {video.is_trending && rank <= 3 && (
          <span className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shadow-lg ${rankStyle(rank)}`}>
            #{rank}
          </span>
        )}
        {video.is_trending && rank > 3 && (
          <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[11px] font-semibold text-white">#{rank}</span>
        )}
      </div>

      <div className="flex gap-3">
        <Avatar src={video.avatar_url} name={channel} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug line-clamp-2 text-[#f1f1f1] group-hover:text-white">{title}</p>
          <p className="text-xs text-[#aaa] mt-1 truncate">{channel}</p>
          <p className="text-xs text-[#aaa]">
            {compactCount(video.views || 0)} views
            {video.created_at ? ` · ${timeAgo(video.created_at)}` : ""}
          </p>
          {video.is_trending && (video.views_24h > 0 || video.shares_24h > 0) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-medium text-orange-300">
              <span className="inline-flex items-center gap-1">
                <Flame size={11} aria-hidden="true" />
                {compactCount(video.views_24h)} views today
              </span>
              {video.shares_24h > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Share2 size={11} aria-hidden="true" />
                  {compactCount(video.shares_24h)} shares
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}

function CreatorCard({ creator, rank }: { creator: TrendingCreator; rank: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <Link
      to={`/@${creator.handle}`}
      className="group bg-[#212121] hover:bg-[#2a2a2a] rounded-xl p-5 flex flex-col items-center text-center transition-colors"
    >
      <div className="relative mb-3">
        {creator.avatar && !broken ? (
          <img
            src={creator.avatar}
            alt=""
            onError={() => setBroken(true)}
            loading="lazy"
            className="w-20 h-20 rounded-full object-cover ring-2 ring-transparent group-hover:ring-red-500 transition-all"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-[#3a3a3a] flex items-center justify-center text-2xl font-bold uppercase ring-2 ring-transparent group-hover:ring-red-500 transition-all" aria-hidden="true">
            {creator.name?.[0] ?? "?"}
          </div>
        )}
        {creator.is_trending !== false && rank <= 3 && (
          <span className={`absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow ${rankStyle(rank)}`}>
            #{rank}
          </span>
        )}
      </div>
      <p className="font-semibold text-sm text-[#f1f1f1] truncate w-full">{creator.name}</p>
      <p className="text-xs text-[#aaa] mt-0.5 truncate w-full">@{creator.handle}</p>
      <p className="text-xs text-red-400 font-medium mt-2">{compactCount(creator.subscribers || 0)} subscribers</p>
      <span className="mt-3 px-4 py-1.5 rounded-full bg-white/10 group-hover:bg-white group-hover:text-black text-xs font-semibold transition-colors">
        View channel
      </span>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────

export default function TrendingPage() {
  const [tab, setTab] = useState<TrendingType>("");
  const [category, setCategory] = useState("All");
  const [categories, setCategories] = useState<string[]>([]);
  const [videos, setVideos] = useState<TrendingVideo[]>([]);
  const [creators, setCreators] = useState<TrendingCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatorsLoading, setCreatorsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useMetaTags({
    title: "Trending Videos - AirStreamX",
    description: "The videos and Shorts people are watching and sharing right now on AirStreamX, plus this week's top creators.",
    keywords: ["trending", "viral", "popular videos", "trending shorts", "top creators"],
    url: "https://airstreamx.com/trending",
    canonicalUrl: "https://airstreamx.com/trending",
    type: "website",
  });

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(false);
    fetchTrending({ type: tab, category, limit: 24, signal: ctrl.signal })
      .then((r) => {
        setVideos(r.videos);
        // Keep the pill list from the unfiltered view so it doesn't shrink
        if (category === "All") setCategories(r.categories);
      })
      .catch((e) => {
        if ((e as Error)?.name === "AbortError") return;
        setVideos([]);
        setError(true);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [tab, category, reloadKey]);

  useEffect(() => {
    const ctrl = new AbortController();
    setCreatorsLoading(true);
    fetchTrendingCreators(12, ctrl.signal)
      .then(setCreators)
      .catch(() => setCreators([]))
      .finally(() => {
        if (!ctrl.signal.aborted) setCreatorsLoading(false);
      });
    return () => ctrl.abort();
  }, [reloadKey]);

  const pills = ["All", ...categories];

  return (
    <>
      <BreadcrumbSchema items={getBreadcrumbs("/trending")} />

      <div className="min-h-screen bg-[#0f0f0f] text-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-center gap-3 mb-1">
            <Flame className="w-7 h-7 text-red-500" aria-hidden="true" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Trending</h1>
          </div>
          <p className="text-[#aaa] text-sm mb-5">What people are watching and sharing right now</p>

          {/* Videos / Shorts */}
          <div role="tablist" aria-label="Type" className="inline-flex p-1 bg-[#212121] rounded-xl mb-4">
            {TABS.map((t) => (
              <button
                key={t.key || "all"}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? "bg-white text-black" : "text-gray-300 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Categories (from what is actually on the platform) */}
          {pills.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
              {pills.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  aria-pressed={category === cat}
                  onClick={() => setCategory(cat)}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    category === cat ? "bg-white text-black" : "bg-[#272727] text-white hover:bg-[#3a3a3a]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          <section className="mb-12" aria-labelledby="trending-videos">
            <div className="flex items-center gap-2 mb-5">
              <TrendingUp className="w-5 h-5 text-red-500" aria-hidden="true" />
              <h2 id="trending-videos" className="text-xl font-semibold">
                {tab === "short" ? "Trending Shorts" : tab === "long" ? "Trending Videos" : "Trending now"}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <VideoCardSkeleton key={i} />)
              ) : error ? (
                <div className="col-span-full text-center py-12">
                  <p className="text-[#aaa] mb-3">Could not load trending videos.</p>
                  <button
                    type="button"
                    onClick={() => setReloadKey((k) => k + 1)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 text-sm"
                  >
                    <RefreshCw size={14} aria-hidden="true" /> Try again
                  </button>
                </div>
              ) : videos.length > 0 ? (
                videos.map((v) => <VideoCard key={v.id} video={v} rank={v.trending_rank} />)
              ) : (
                <p className="col-span-full text-center text-[#aaa] py-12">
                  Nothing here yet{category !== "All" ? ` in ${category}` : ""}. Check back soon.
                </p>
              )}
            </div>
          </section>

          <div className="border-t border-white/10 mb-10" />

          <section aria-labelledby="trending-creators">
            <div className="flex items-center gap-2 mb-5">
              <Flame className="w-5 h-5 text-orange-400" aria-hidden="true" />
              <h2 id="trending-creators" className="text-xl font-semibold">Creators of the week</h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {creatorsLoading ? (
                Array.from({ length: 6 }).map((_, i) => <CreatorCardSkeleton key={i} />)
              ) : creators.length > 0 ? (
                creators.map((c, i) => <CreatorCard key={c.handle} creator={c} rank={i + 1} />)
              ) : (
                <p className="col-span-full text-center text-[#aaa] py-12">No creators to show yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
