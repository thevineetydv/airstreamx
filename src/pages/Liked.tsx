import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../utils/constants";
import { Heart, ShieldAlert } from "lucide-react";

type VideoItem = {
  id: number;
  public_id: string | null;
  title: string;
  thumbnail: string | null;
  mood_tags: string[];
};

// Fixed mood-tag list — matches the set agreed on for this feature.
// "All" is always first and isn't a real tag, just the unfiltered view.
const MOOD_TAGS = [
  "Romantic", "Energetic", "Sad", "Happy",
  "Chill", "Motivational", "Comedy", "Devotional", "Party",
];

export default function LikedPage() {
  const [liked, setLiked] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState<string | null>(null); // null = "All"
  const { user, login } = useAuth();

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        if (!user) { setLiked([]); return; }
        const res = await fetch(`${API_URL}/videos?limit=200`);
        const data = await res.json();
        const all: VideoItem[] = (data.videos || []).map((v: any) => ({
          id: v.id,
          public_id: v.public_id || null,
          title: v.title,
          thumbnail: v.thumbnail || null,
          mood_tags: Array.isArray(v.mood_tags) ? v.mood_tags : [],
        }));
        const auth = getAuth();
        const token = await auth.currentUser!.getIdToken();
        const checks = await Promise.all(
          all.slice(0, 200).map(async v => {
            try {
              const r = await fetch(`${API_URL}/videos/${v.id}/like-status`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!r.ok) return null;
              const j = await r.json();
              return j.liked ? v : null;
            } catch {
              return null;
            }
          })
        );
        setLiked(checks.filter(Boolean) as VideoItem[]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [user]);

  // Only show tag-pills that at least one liked video actually has —
  // no point showing "Devotional" as a filter option if none of your
  // liked videos are tagged that way.
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    liked.forEach(v => v.mood_tags.forEach(t => set.add(t)));
    return MOOD_TAGS.filter(t => set.has(t));
  }, [liked]);

  const visibleVideos = useMemo(() => {
    if (!activeTag) return liked;
    return liked.filter(v => v.mood_tags.includes(activeTag));
  }, [liked, activeTag]);

  const empty = useMemo(() => liked.length === 0, [liked.length]);

  if (!user) {
    return (
      <div className="min-h-screen">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ShieldAlert className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-lg font-medium">Sign in to view your liked videos</p>
            <button
              onClick={login}
              className="mt-6 px-5 py-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 text-white hover:opacity-90"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Liked Videos</h1>
        </div>

        {/* Mood-tag filter pills — only rendered once liked videos are
            loaded and at least one has a mood tag. */}
        {!loading && availableTags.length > 0 && (
          <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
            <button
              onClick={() => setActiveTag(null)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTag === null
                  ? "bg-white text-black"
                  : "bg-white/10 text-gray-300 hover:bg-white/20"
              }`}
            >
              All
            </button>
            {availableTags.map(tag => (
              <button
                key={tag}
                onClick={() => setActiveTag(tag)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeTag === tag
                    ? "bg-red-500 text-white"
                    : "bg-white/10 text-gray-300 hover:bg-white/20"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Heart className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-lg font-medium">You haven't liked any videos yet</p>
            <p className="text-gray-400 mt-1">Like videos to see them here.</p>
          </div>
        ) : visibleVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Heart className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-lg font-medium">No liked videos tagged "{activeTag}" yet</p>
            <button
              onClick={() => setActiveTag(null)}
              className="text-red-400 hover:text-red-300 text-sm mt-2 font-medium"
            >
              Show all liked videos
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleVideos.map(v => (
              <Link key={v.id} to={`/watch?v=${v.public_id || v.id}`} className="group rounded-xl overflow-hidden border border-white/10 bg-[#212121] hover:border-red-500/40 transition-colors">
                <div className="aspect-video bg-black">
                  {v.thumbnail ? (
                    <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-gray-400">No thumbnail</div>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-semibold line-clamp-2 group-hover:text-red-400 transition-colors">{v.title}</p>
                  {v.mood_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {v.mood_tags.map(tag => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-400">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}