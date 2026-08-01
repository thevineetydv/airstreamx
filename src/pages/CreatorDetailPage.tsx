import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMetaTags } from "../hooks/useMetaTags";
import { CreatorSchema } from "../components/CreatorSchema";
import { VideoSchema, getVideoSchemaProps } from "../components/VideoSchema";
import { BreadcrumbSchema, getBreadcrumbs } from "../components/BreadcrumbSchema";
import { API_URL } from "../utils/constants";

interface CreatorData {
  id: number;
  handle: string;
  name: string;
  email: string;
  bio: string;
  avatar: string;
  banner: string;
  subscribers: number;
  videoCount: number;
  totalViews: number;
  joinDate: string;
}

interface VideoData {
  id: string | number;
  title: string;
  thumbnail: string;
  views: number;
  duration: number;
  created_at: string;
  url: string;
  description?: string;
}

export default function CreatorDetailPage() {
  const { handle } = useParams<{ handle: string }>();
  const [creator, setCreator] = useState<CreatorData | null>(null);
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) return;

    setLoading(true);
    setError(null);

    // Fetch creator details
    Promise.all([
      fetch(`${API_URL}/creators?handle=${handle}`).then(r => r.json()).catch(() => null),
      fetch(`${API_URL}/creators/${handle}/videos?limit=12`).then(r => r.json()).catch(() => []),
    ])
      .then(([creatorData, videosData]) => {
        if (creatorData) {
          setCreator(creatorData);
        } else {
          setError("Creator not found");
        }
        setVideos(Array.isArray(videosData) ? videosData : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch creator:", err);
        setError("Creator not found");
        setLoading(false);
      });
  }, [handle]);

  // ── useMetaTags MUST run before any conditional return — hooks can
  // never be called conditionally. Values fall back safely for the
  // loading/error states, when `creator` isn't available yet. ──
  const creatorTitle = creator ? `${creator.name} - AirStreamX Creator` : "Creator - AirStreamX";
  const creatorDescription = creator
    ? (creator.bio || `Watch videos from ${creator.name} on AirStreamX. ${creator.videoCount} videos, ${creator.subscribers} subscribers.`)
    : "";
  const canonicalUrl = `https://airstreamx.com/creators/${handle || ''}`;

  useMetaTags({
    title: creatorTitle,
    description: creatorDescription,
    image: creator?.avatar || "",
    keywords: [creator?.name || "", "creator", "videos", handle || ""],
    url: canonicalUrl,
    canonicalUrl: canonicalUrl,
    type: "website",
  });

  if (loading) {
    return <div className="flex justify-center items-center py-20">Loading...</div>;
  }

  if (error || !creator) {
    return (
      <div className="container mx-auto px-4 py-12 text-center">
        <h1 className="text-3xl font-bold mb-4">Creator Not Found</h1>
        <p className="text-gray-400">Sorry, we couldn't find this creator.</p>
      </div>
    );
  }

  return (
    <>
      <CreatorSchema
        name={creator.name}
        email={creator.email}
        avatar={creator.avatar}
        description={creator.bio}
        subscribers={creator.subscribers}
        profileUrl={canonicalUrl}
        videoCount={creator.videoCount}
      />

      {videos.map((video, idx) => (
        <VideoSchema
          key={idx}
          {...getVideoSchemaProps(video)}
          author={creator.name}
        />
      ))}

      <BreadcrumbSchema
        items={getBreadcrumbs(`/creators/${handle}`)}
      />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-12">
          {creator.banner && (
            <div className="w-full h-40 md:h-64 rounded-lg overflow-hidden mb-6">
              <img
                src={creator.banner}
                alt={`${creator.name} banner`}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-8 items-start">
            <img
              src={creator.avatar}
              alt={creator.name}
              className="w-32 h-32 rounded-full object-cover"
              width={128}
              height={128}
            />

            <div className="flex-1">
              <h1 className="text-4xl md:text-5xl font-bold mb-2">{creator.name}</h1>
              <p className="text-lg text-red-500 font-semibold mb-4">
                {creator.subscribers.toLocaleString()} subscribers
              </p>
              <p className="text-gray-300 mb-6">{creator.bio}</p>

              <div className="flex gap-8 text-center">
                <div>
                  <div className="text-2xl font-bold">{creator.videoCount}</div>
                  <div className="text-sm text-gray-400">Videos</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">
                    {(creator.totalViews / 1000000).toFixed(1)}M
                  </div>
                  <div className="text-sm text-gray-400">Total Views</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-12">
          <h2 className="text-3xl font-bold mb-6">Latest Videos</h2>
          {videos.length === 0 ? (
            <p className="text-gray-400">No videos yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {videos.map(video => (
                <Link
                  key={video.id}
                  to={`/watch?id=${video.id}`}
                  className="group"
                >
                  <div className="relative aspect-video bg-gray-900 rounded-lg overflow-hidden mb-2">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                      loading="lazy"
                    />
                  </div>
                  <h3 className="font-semibold line-clamp-2 group-hover:text-red-500 transition">
                    {video.title}
                  </h3>
                  <p className="text-sm text-gray-400">
                    {formatViews(video.views)} views
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="text-center">
          <Link
            to={`/channel/${handle}`}
            className="inline-block bg-red-600 hover:bg-red-700 px-8 py-3 rounded-lg font-semibold transition"
          >
            View All Videos
          </Link>
        </div>
      </div>
    </>
  );
}

function formatViews(views: number): string {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
  return views.toString();
}