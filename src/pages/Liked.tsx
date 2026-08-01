import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getAuth } from "firebase/auth";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../utils/constants";
import { Heart, ShieldAlert } from "lucide-react";

type VideoItem = {
  id: number;
  title: string;
  thumbnail: string | null;
};

export default function LikedPage() {
  const [liked, setLiked] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
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
          title: v.title,
          thumbnail: v.thumbnail || null,
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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Liked Videos</h1>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">Loading…</div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Heart className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-lg font-medium">You haven't liked any videos yet</p>
            <p className="text-gray-400 mt-1">Like videos to see them here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {liked.map(v => (
              <Link key={v.id} to={`/watch/${v.id}`} className="group rounded-xl overflow-hidden border border-white/10 bg-[#181818] hover:border-red-500/40 transition-colors">
                <div className="aspect-video bg-black">
                  {v.thumbnail ? (
                    <img src={v.thumbnail} alt={v.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-gray-400">No thumbnail</div>
                  )}
                </div>
                <div className="p-4">
                  <p className="font-semibold line-clamp-2 group-hover:text-red-400 transition-colors">{v.title}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

