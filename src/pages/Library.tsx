import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { getAuth } from "firebase/auth";
import { useAuth } from "../context/AuthContext";
import { API_URL } from "../utils/constants";
import { Library as LibraryIcon, ShieldAlert } from "lucide-react";

type VideoItem = {
  id: number;
  title: string;
  thumbnail: string | null;
  uploader?: string;
  views?: number;
  duration?: number;
};

export default function LibraryPage() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        if (!user) { setVideos([]); return; }
        const auth = getAuth();
        const token = await auth.currentUser!.getIdToken();
        // Fetch videos uploaded by this user (their personal library)
        const res = await fetch(`${API_URL}/videos?uploader=${encodeURIComponent(user.email ?? "")}&limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { setVideos([]); return; }
        const data = await res.json();
        const list: VideoItem[] = (data.videos || []).map((v: any) => ({
          id: v.id,
          title: v.title,
          thumbnail: v.thumbnail || null,
          uploader: v.uploader,
          views: v.views ?? 0,
          duration: v.duration ?? 0,
        }));
        setVideos(list);
      } catch {
        setVideos([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [user]);

  const empty = useMemo(() => videos.length === 0, [videos.length]);

  const fmtDuration = (secs: number) => {
    if (!secs) return "";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const fmtViews = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K views`;
    return `${n} views`;
  };

  if (!user) {
    return (
      <div className="min-h-screen">
        <div className="max-w-4xl mx-auto p-6">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ShieldAlert className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-lg font-medium">Sign in to view your library</p>
            <p className="text-gray-400 mt-1">Your uploaded videos will appear here.</p>
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
      <Helmet>
        {/* Canonical Tag - Tells search engines this is the primary version */}
        <link rel="canonical" href="https://www.airstreamx.com/library" />
        
        {/* Page Title */}
        <title>My Library - AirStreamX | Watch Your Uploaded Videos</title>
        <meta name="description" content="View and manage all your uploaded videos in your personal library on AirStreamX. Organize, edit, and share your content." />
        
        {/* Open Graph Tags for Social Sharing */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.airstreamx.com/library" />
        <meta property="og:title" content="My Library - AirStreamX" />
        <meta property="og:description" content="View and manage all your uploaded videos on AirStreamX" />
        <meta property="og:image" content="https://www.airstreamx.com/og-image.jpg" />
        <meta property="og:site_name" content="AirStreamX" />
        
        {/* Twitter Card Tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:url" content="https://www.airstreamx.com/library" />
        <meta name="twitter:title" content="My Library - AirStreamX" />
        <meta name="twitter:description" content="View and manage all your uploaded videos on AirStreamX" />
        <meta name="twitter:image" content="https://www.airstreamx.com/og-image.jpg" />
        
        {/* Additional SEO Tags */}
        <meta name="robots" content="index, follow" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta charSet="UTF-8" />
      </Helmet>
      
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Your Library</h1>
            {!loading && !empty && (
              <p className="text-sm text-gray-400 mt-1">{videos.length} video{videos.length !== 1 ? "s" : ""}</p>
            )}
          </div>
          {!empty && !loading && (
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm transition-colors"
            >
              <LibraryIcon className="w-4 h-4" />
              <span>Manage</span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500 mr-3" />
            Loading…
          </div>
        ) : empty ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <LibraryIcon className="w-10 h-10 text-gray-400 mb-3" />
            <p className="text-lg font-medium">Your library is empty</p>
            <p className="text-gray-400 mt-1">Videos you upload will appear here.</p>
            <button
              onClick={() => navigate("/")}
              className="mt-6 px-5 py-2 rounded-lg bg-gradient-to-r from-red-500 to-red-600 text-white hover:opacity-90 transition-opacity"
            >
              Go Home
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map(v => (
              <Link
                key={v.id}
                to={`/watch?v=${v.id}`}
                className="group rounded-xl overflow-hidden border border-white/10 bg-[#181818] hover:border-red-500/40 transition-colors"
              >
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
                  {!!v.views && (
                    <p className="text-xs text-gray-400 mt-1">{fmtViews(v.views)}</p>
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