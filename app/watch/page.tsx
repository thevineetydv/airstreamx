import { Metadata } from 'next';

interface PageProps {
  searchParams: Promise<{
    v?: string;
  }>;
}

async function getVideoData(videoId: string) {
  try {
    const res = await fetch(
      `https://backend.airstreamx.com/videos/${videoId}`
    );
    const data = await res.json();
    if (data.success && data.video) return data.video;
  } catch (error) {
    console.log('Error:', error);
  }
  return null;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;  // 👈 ADD AWAIT
  const videoId = params.v;

  if (!videoId) {
    return {
      title: 'AirstreamX - Watch Videos',
    };
  }

  const video = await getVideoData(videoId);

  if (!video) {
    return {
      title: 'AirstreamX - Watch Videos',
    };
  }

  const thumbnail = video.thumbnail || 'https://airstreamx.com/og-image.png';

  return {
    title: `${video.title} - AirstreamX`,
    description: video.description || 'Watch on AirstreamX',
    openGraph: {
      title: video.title,
      description: video.description || 'Watch on AirstreamX',
      images: [thumbnail],
      url: `https://www.airstreamx.com/watch?v=${videoId}`,
      type: 'video.other',
      siteName: 'AirstreamX',
    },
    twitter: {
      card: 'summary_large_image',
      title: video.title,
      description: video.description || 'Watch on AirstreamX',
      images: [thumbnail],
    },
  };
}

export default async function WatchPage({ searchParams }: PageProps) {
  const params = await searchParams;  // 👈 ADD AWAIT
  const videoId = params.v;
  
  return (
    <div style={{ padding: '20px', textAlign: 'center', color: 'white' }}>
      <h1>Video Player</h1>
      <p>Video ID: {videoId}</p>
      <p>Meta tags ready for social media! ✅</p>
    </div>
  );
}