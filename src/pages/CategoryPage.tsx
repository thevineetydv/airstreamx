import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMetaTags } from "../hooks/useMetaTags";
import { BreadcrumbSchema, getBreadcrumbs } from "../components/BreadcrumbSchema";
import { API_URL } from "../utils/constants";

// Category metadata
const CATEGORIES = {
  music: {
    title: "Music Videos",
    description: "Discover amazing music videos from your favorite artists and creators on AirStreamX. Stream music videos, covers, and live performances.",
    keywords: ["music videos", "songs", "artists", "covers", "live performances"],
    emoji: "🎵",
  },
  gaming: {
    title: "Gaming Videos",
    description: "Watch gaming streams, gameplay videos, and esports highlights on AirStreamX. From indie games to AAA titles.",
    keywords: ["gaming", "gameplay", "streaming", "esports", "game reviews"],
    emoji: "🎮",
  },
  news: {
    title: "News Videos",
    description: "Stay updated with the latest news videos from creators around the world. Breaking news, analysis, and reporting.",
    keywords: ["news", "current events", "analysis", "updates", "breaking news"],
    emoji: "📰",
  },
  sports: {
    title: "Sports Videos",
    description: "Watch live sports, highlights, and sports analysis on AirStreamX. Coverage of football, basketball, and more.",
    keywords: ["sports", "football", "basketball", "highlights", "live sports"],
    emoji: "⚽",
  },
  movies: {
    title: "Movies & Films",
    description: "Stream movies, short films, and cinematic content on AirStreamX. Indie films to major productions.",
    keywords: ["movies", "films", "cinema", "shorts", "filmmaking"],
    emoji: "🎬",
  },
  tech: {
    title: "Tech Videos",
    description: "Learn about technology with tutorials, reviews, and tech talk videos. Stay updated on latest gadgets and software.",
    keywords: ["technology", "tech reviews", "tutorials", "gadgets", "software"],
    emoji: "💻",
  },
  podcasts: {
    title: "Podcasts",
    description: "Listen to podcasts and audio content on AirStreamX. Discussion, interviews, and storytelling.",
    keywords: ["podcasts", "audio", "interviews", "discussion", "storytelling"],
    emoji: "🎙️",
  },
  education: {
    title: "Educational Content",
    description: "Learn new skills with educational videos. Courses, tutorials, and learning resources for all levels.",
    keywords: ["education", "learning", "tutorials", "courses", "skills"],
    emoji: "📚",
  },
  comedy: {
    title: "Comedy Videos",
    description: "Watch funny videos, comedy sketches, and stand-up comedy on AirStreamX. Laugh with creators worldwide.",
    keywords: ["comedy", "humor", "funny", "sketches", "stand-up"],
    emoji: "😂",
  },
  lifestyle: {
    title: "Lifestyle Videos",
    description: "Explore lifestyle content, vlogs, and personal development videos. Fashion, wellness, and daily life.",
    keywords: ["lifestyle", "vlog", "fashion", "wellness", "daily life"],
    emoji: "✨",
  },
  travel: {
    title: "Travel Videos",
    description: "Discover travel content and adventure videos. Explore destinations and travel tips from creators worldwide.",
    keywords: ["travel", "adventure", "destinations", "vlog", "exploration"],
    emoji: "✈️",
  },
  shorts: {
    title: "Short Videos",
    description: "Watch short-form video content on AirStreamX. Quick, entertaining clips under 60 seconds.",
    keywords: ["shorts", "short videos", "quick clips", "trending", "viral"],
    emoji: "⏱️",
  },
};

interface Video {
  id: string | number;
  title: string;
  thumbnail: string;
  views: number;
  duration: number;
  uploader: string;
  channel_name?: string;
  created_at?: string;
  url: string;
}

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const category = CATEGORIES[slug as keyof typeof CATEGORIES];

  if (!category) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold mb-4">Category Not Found</h1>
        <p className="text-gray-400">Sorry, this category doesn't exist.</p>
      </div>
    );
  }

  const categoryTitle = `${category.title} | AirStreamX`;
  const canonicalUrl = `https://airstreamx.com/category/${slug}`;

  // Set meta tags
  useMetaTags({
    title: categoryTitle,
    description: category.description,
    keywords: category.keywords,
    image: "https://airstreamx.com/og-image.jpg",
    url: canonicalUrl,
    canonicalUrl: canonicalUrl,
    type: "website",
  });

  // Fetch videos in category
  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/videos?category=${slug}&limit=24`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setVideos(Array.isArray(data) ? data : data.videos || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch category videos:", err);
        setError("Failed to load videos");
        setLoading(false);
      });
  }, [slug]);

  return (
    <>
      <BreadcrumbSchema items={getBreadcrumbs(`/category/${slug}`)} />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-5xl">{category.emoji}</span>
            <div>
              <h1 className="text-4xl md:text-5xl font-bold">{category.title}</h1>
              <p className="text-gray-400 mt-2">{category.description}</p>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="text-gray-400">Loading videos...</div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 text-red-400">
            {error}
          </div>
        )}

        {!loading && !error && videos.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No videos in this category yet.</p>
          </div>
        )}

        {!loading && videos.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {videos.map(video => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        )}

        <div className="mt-16">
          <h2 className="text-2xl font-bold mb-6">Other Categories</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(CATEGORIES).map(([key, cat]) => {
              if (key === slug) return null;
              return (
                <Link
                  key={key}
                  to={`/category/${key}`}
                  className="bg-gray-900 hover:bg-gray-800 rounded-lg p-4 text-center transition"
                >
                  <div className="text-3xl mb-2">{cat.emoji}</div>
                  <div className="font-semibold text-sm">{cat.title}</div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

function VideoCard({ video }: { video: Video }) {
  return (
    <Link to={`/watch?id=${video.id}`} className="group cursor-pointer">
      <div className="relative overflow-hidden rounded-lg bg-gray-900 aspect-video mb-3">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
          loading="lazy"
          width={320}
          height={180}
        />
        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-bold">
            {formatDuration(video.duration)}
          </div>
        )}
      </div>
      <h3 className="font-semibold line-clamp-2 group-hover:text-red-500 transition mb-1">
        {video.title}
      </h3>
      <p className="text-sm text-gray-400">{video.uploader || video.channel_name}</p>
      <p className="text-xs text-gray-400">{formatViews(video.views)} views</p>
    </Link>
  );
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function formatViews(views: number): string {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
  return views.toString();
}
