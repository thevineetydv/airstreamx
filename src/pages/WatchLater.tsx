import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { safeLocalStorage } from "../utils/storage";
import { API_URL } from "../utils/constants";
import { BookmarkCheck, ShieldAlert, Trash2, X } from "lucide-react";

// WatchLater is stored in localStorage as a JSON array of video IDs
// key: "watch_later_ids"  value: number[]
const LS_KEY = "watch_later_ids";

type VideoItem = {
  id: number;
  title: string;
  thumbnail: string | null;
  uploader?: string;
  duration?: number;
  views?: number;
};

export default function WatchLaterPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, login } = useAuth();
  const navigate = useNavigate();

  // Load saved IDs → fetch video info
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const raw = safeLocalStorage.getItem(LS_KEY);
        const ids: number[] = raw ? JSON.parse(raw) : [];
        if (!ids.length) { setVideos([]); return; }

        const results = await Promise.all(
          ids.map(async id => {
            try {
              const res = await fetch(`${API_URL}/videos/${id}`);
              if (!res.ok) return null;
              const data = await res.json();
              const v = data.video || data;
              return {
                id: v.id,
                title: v.title,
                thumbnail: v.thumbnail || null,
                uploader: v.uploader,
                duration: v.duration ?? 0,
                views: v.views ?? 0,
              } as VideoItem;
            } catch {
              return null;
            }
          })
        );
        setVideos(results.filter(Boolean) as VideoItem[]);
      } catch {
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const removeOne = (id: number) => {
    const raw = safeLocalStorage.getItem(LS_KEY);
    const ids: number[] = raw ? JSON.parse(raw) : [];
    const updated = ids.filter(i => i !== id);
    safeLocalStorage.setItem(LS_KEY, JSON.stringify(updated));
    setVideos(prev => prev.filter(v => v.id !== id));
  };

  const clearAll = () => {
    safeLocalStorage.removeItem(LS_KEY);
    setVideos([]);
  };

  const fmtDuration = (secs: number) => {
    if (!secs) return "";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const empty = useMemo(() => videos.length === 0, [videos.length]);

  // WatchLater works without auth (stored locally)
  // but show a soft prompt to sign in for cross-device sync hint
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Watch Later</h1>
            {!loading && !empty && (
              <p className="text-sm text-gray-400 mt-1">
                {videos.length} video{videos.length !== 1 ? "s" : ""} saved
              </p>
            )}
          </div>
          {!empty && !loading && (
            <button
              onClick={clearAll}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All</span>
            </button>
          )}
        </div>

        {/* Soft sign-in nudge for non-authed users */}
        {!user && !empty && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#181818] border border-white/10 text-sm text-gray-400">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>
              Sign in to sync Watch Later across devices.{" "}
              <button onClick={login} className="text-red-400 hover:text-red-300 underline transition-colors">
                Sign in
              </button>
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mr-3" />
            Loading…
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <BookmarkCheck className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-lg font-medium">No videos saved yet</p>
            <p className="text-gray-400 mt-1">
              Save videos to watch them later — they'll appear here.
            </p>
            <button
              onClick={() => navigate("/")}
              className="mt-6 px-5 py-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 text-white hover:opacity-90 transition-opacity"
            >
              Browse Videos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map(v => (
              <div
                key={v.id}
                className="group rounded-xl overflow-hidden border border-white/10 bg-[#181818] hover:border-red-500/40 transition-colors relative"
              >
                {/* Remove button */}
                <button
                  onClick={e => { e.preventDefault(); removeOne(v.id); }}
                  className="absolute top-2 right-2 z-10 p-1 rounded-full bg-black/70 hover:bg-red-500/80 text-white opacity-0 group-hover:opacity-100 transition-all"
                  aria-label="Remove from Watch Later"
                >
                  <X className="w-3.5 h-3.5" />
                </button>

                <Link to={`/watch?id=${v.id}`}>
                  <div className="aspect-video bg-black relative">
                    {v.thumbnail ? (
                      <img
                        src={v.thumbnail}
                        alt={v.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-gray-400">
                        No thumbnail
                      </div>
                    )}
                    {!!v.duration && (
                      <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
                        {fmtDuration(v.duration)}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="font-semibold line-clamp-2 group-hover:text-red-400 transition-colors">
                      {v.title}
                    </p>
                    {v.uploader && (
                      <p className="text-xs text-gray-400 mt-1">{v.uploader}</p>
                    )}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
