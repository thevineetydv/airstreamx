import React from 'react';

/**
 * VideoObject Schema - Used on video watch pages
 * Tells search engines about video content
 * Increases chances of rich snippets and video results
 *
 * @see https://schema.org/VideoObject
 */

interface VideoSchemaProps {
  /** Video title (required) */
  title: string;
  /** Video description (required) */
  description: string;
  /** Video thumbnail image URL (required) */
  thumbnail: string;
  /** Duration in seconds (required) */
  duration: number;
  /** ISO 8601 date published (required) */
  uploadDate: string;
  /** Creator name (required) */
  author: string;
  /** Video URL or HLS stream URL */
  videoUrl?: string;
  /** View count (optional) */
  views?: number;
  /** Category/tags (optional) */
  keywords?: string[];
  /** Channel ID (optional, for aggregation) */
  channelId?: string;
  /** Interaction count (optional) */
  interactionCount?: number;
  /** Modified date (optional) */
  modifiedDate?: string;
}

export const VideoSchema: React.FC<VideoSchemaProps> = ({
  title,
  description,
  thumbnail,
  duration,
  uploadDate,
  author,
  videoUrl,
  views,
  keywords,
  channelId,
  interactionCount,
  modifiedDate,
}) => {
  // Validate required fields
  if (!title || !description || !thumbnail || !uploadDate || !author) {
    console.warn('[VideoSchema] Missing required fields');
    return null;
  }

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: title,
    description: description,
    thumbnailUrl: thumbnail,
    uploadDate: uploadDate,
    modifiedDate: modifiedDate || uploadDate,
    duration: formatDuration(duration),
    author: {
      '@type': 'Person',
      name: author,
    },
    // Include video URL if available (helps Google crawl video)
    ...(videoUrl && { contentUrl: videoUrl }),
    // Interaction metrics
    ...(views || interactionCount) && {
      interactionCount: (interactionCount || views || 0).toString(),
    },
    // Keywords for better categorization
    ...(keywords?.length && { keywords: keywords.join(', ') }),
    // Publisher reference — links this video to its channel entity,
    // which schema.org's VideoObject spec recommends when available.
    ...(channelId && {
      publisher: {
        '@type': 'Organization',
        identifier: channelId,
      },
    }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
};

/**
 * Convert seconds to ISO 8601 duration format
 * @example 90 seconds → PT1M30S
 */
function formatDuration(seconds: number): string {
  if (!Number.isInteger(seconds) || seconds <= 0) {
    return 'PT0S';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  let result = 'PT';
  if (hours > 0) result += `${hours}H`;
  if (minutes > 0) result += `${minutes}M`;
  if (secs > 0) result += `${secs}S`;

  return result || 'PT0S';
}

/**
 * Helper to generate VideoSchema props from video object
 */
export function getVideoSchemaProps(video: any): VideoSchemaProps {
  return {
    title: video.title,
    description: video.description || video.title,
    thumbnail: video.thumbnail,
    duration: video.duration || 0,
    uploadDate: video.created_at || video.uploadedAt || new Date().toISOString(),
    author: video.channel_name || video.uploader_name || video.uploader || 'Creator',
    videoUrl: video.url || video.video_url,
    views: video.views || video.view_count || 0,
    keywords: video.tags || [],
    channelId: video.channel_id?.toString(),
    modifiedDate: video.updated_at,
  };
}