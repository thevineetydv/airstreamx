import { useEffect } from 'react';
import { generateMetaTags, MetaTagsConfig } from '../utils/metaTagGenerator';

/**
 * React hook to set meta tags on component mount/update
 * Recommended usage in every page component
 *
 * @example
 * const WatchPage = () => {
 *   useMetaTags({
 *     title: `${video.title} - Watch on AirStreamX`,
 *     description: video.description,
 *     image: video.thumbnail,
 *     url: `https://airstreamx.com/watch?id=${videoId}`,
 *   });
 * };
 */
export function useMetaTags(config: MetaTagsConfig): void {
  useEffect(() => {
    generateMetaTags(config);

    // Cleanup on unmount
    return () => {
      // Optional: reset to home meta tags
      // generateMetaTags(DEFAULT_HOME_META);
    };
  }, [
    config.title,
    config.description,
    config.image,
    config.url,
    config.type,
  ]);
}
