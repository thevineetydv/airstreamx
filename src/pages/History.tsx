import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_URL } from "../utils/constants";
import { safeLocalStorage } from "../utils/storage";
import { Clock, Trash2 } from "lucide-react";
import { cachedFetch } from "../utils/metadataCache";

type ProgressEntry = {
  id: number;
  time: number;
  duration: number;
  timestamp: number;
};

type VideoInfo = {
  id: number;
  public_id?: string;
  title: string;
  thumbnail: string | null;
};

type HistoryEntry = ProgressEntry & { info?: VideoInfo };

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);

      // ── 1. Read all progress entries from localStorage ──────────────────
      let list: ProgressEntry[] = [];
      try {
        const keys = Object.keys(localStorage).filter(k =>
          k.startsWith("watch_progress_")
        );
        for (const k of keys) {
          try {
            const id = Number(k.replace("watch_progress_", ""));
            if (isNaN(id)) continue;
            const raw = safeLocalStorage.getItem(k);
            if (!raw) continue;
            const data = JSON.parse(raw) as {
              time: number;
              duration: number;
              timestamp: number;
            };
            if (
              typeof data.time === "number" &&
              typeof data.duration === "number" &&
              typeof data.timestamp === "number"
            ) {
              list.push({
                id,
                time: data.time,
                duration: data.duration,
                timestamp: data.timestamp,
              });
            }
          } catch (err) {
            console.error(`Failed to parse history entry ${k}:`, err);
          }
        }
        list.sort((a, b) => b.timestamp - a.timestamp);
      } catch (err) {
        console.error("Failed to load watch history:", err);
        list = [];
      }

      if (!list.length) {
        setEntries([]);
        setLoading(false);
        return;
      }

      // ── 2. Fetch video metadata for every entry ──────────────────────────
      //
      // ✅ CACHED — and using the SAME cache key format as Watch.tsx
      // (`watch:video:${id}`). This means:
      //   - If you already opened this video on the Watch page, History
      //     shows its thumbnail/title INSTANTLY (no network call at all).
      //   - If you open it from History first, then click into Watch,
      //     Watch page also loads instantly — the cache is shared.
      //
      // Each entry still resolves independently and in parallel, so one
      // slow/failed video doesn't block the others from showing.
      try {
        const results = await Promise.all(
          list.map(async (e): Promise<HistoryEntry> => {
            try {
              const { data } = await cachedFetch(
                `watch:video:${e.id}`,
                async () => {
                  const res = await fetch(`${API_URL}/videos/${e.id}`);
                  if (!res.ok) throw new Error("Video fetch failed");
                  const json = await res.json();
                  return json.video ?? json;
                },
                {
                  ttl: 5 * 60 * 1000, // 5 minutes — same as Watch.tsx
                  onUpdate: (fresh: any) => {
                    // Background refresh resolved with newer data —
                    // patch just this one entry's info in place.
                    setEntries(prev =>
                      prev.map(entry =>
                        entry.id === e.id
                          ? {
                              ...entry,
                              info: {
                                id: fresh.id,
                                public_id: fresh.public_id,
                                title: fresh.title ?? `Video #${e.id}`,
                                thumbnail: fresh.thumbnail ?? null,
                              },
                            }
                          : entry
                      )
                    );
                  },
                }
              );

              if (!data) return { ...e };
              const v: any = data;
              return {
                ...e,
                info: {
                  id: v.id,
                  public_id: v.public_id,
                  title: v.title ?? `Video #${e.id}`,
                  thumbnail: v.thumbnail ?? null,
                } satisfies VideoInfo,
              };
            } catch {
              return { ...e };
            }
          })
        );
        setEntries(results);
      } catch (err) {
        console.error("Failed to fetch video infos:", err);
        setEntries(list);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, []); // runs once on mount — correct, no stale-closure issue

  // ── Helpers ──────────────────────────────────────────────────────────────

  const clearHistory = () => {
    try {
      entries.forEach(e =>
        safeLocalStorage.removeItem(`watch_progress_${e.id}`)
      );
      setEntries([]);
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  const fmtTime = (secs: number): string => {
    const s = Math.max(0, Math.floor(secs));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    const mm = String(m).padStart(2, "0");
    const ss = String(r).padStart(2, "0");
    return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  };

  const progressPct = (time: number, duration: number) =>
    duration > 0 ? Math.min(100, Math.max(0, (time / duration) * 100)) : 0;

  const empty = useMemo(() => entries.length === 0, [entries.length]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Watch History</h1>
          {!empty && !loading && (
            <button
              onClick={clearHistory}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All</span>
            </button>
          )}
        </div>

        {/* Loading skeleton */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden border border-white/10 bg-[#181818] animate-pulse"
              >
                <div className="aspect-video bg-[#2a2a2a]" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-[#2a2a2a] rounded w-3/4" />
                  <div className="h-3 bg-[#2a2a2a] rounded w-1/2" />
                  <div className="h-2 bg-[#2a2a2a] rounded-full mt-3" />
                </div>
              </div>
            ))}
          </div>

        /* Empty state */
        ) : empty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Clock className="w-16 h-16 text-gray-500 mb-4" />
            <p className="text-xl font-semibold text-white">
              No watch history yet
            </p>
            <p className="text-gray-400 mt-2 max-w-sm">
              Videos you watch will show up here. Start watching to keep track
              of where you left off.
            </p>
            <button
              onClick={() => navigate("/")}
              className="mt-6 px-6 py-2.5 rounded-full bg-gradient-to-r from-red-500 to-red-600 text-white font-medium hover:opacity-90 transition-opacity"
            >
              Browse videos
            </button>
          </div>

        /* History grid */
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {entries.map(e => (
              <Link
                key={e.id}
                // ✅ FIX: Watch.tsx reads the video id from a QUERY param
                // (`/watch?v=123`), not a path param (`/watch/123`).
                // The old `/watch/${e.id}` link pointed to a route that
                // doesn't exist in this app, which is why clicking any
                // history card gave a 404.
                //
                // ✅ FIX 2: Prefer `public_id` (e.g. "YtDRzPJW4no") over
                // the plain database `id` (e.g. "19") — this matches the
                // URL format HomeFeed already uses (`video.public_id ||
                // video.id`), so the same video always gets the SAME url
                // no matter which page you opened it from. It also keeps
                // the Watch.tsx cache key consistent instead of creating
                // two separate cache entries for one video.
                to={`/watch?v=${e.info?.public_id || e.id}`}
                className="group rounded-xl overflow-hidden border border-white/10 bg-[#181818] hover:border-red-500/40 transition-colors"
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-black">
                  {e.info?.thumbnail ? (
                    <img
                      src={e.info.thumbnail}
                      alt={e.info.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-gray-500 text-sm">
                      No thumbnail
                    </div>
                  )}

                  {/* Resume badge */}
                  <span className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                    {fmtTime(e.time)} / {fmtTime(e.duration)}
                  </span>
                </div>

                {/* Info */}
                <div className="p-4">
                  <p className="font-semibold line-clamp-2 group-hover:text-red-400 transition-colors text-sm leading-snug">
                    {e.info?.title ?? `Video #${e.id}`}
                  </p>

                  {/* Progress bar */}
                  <div className="mt-3 w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all"
                      style={{ width: `${progressPct(e.time, e.duration)}%` }}
                    />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}