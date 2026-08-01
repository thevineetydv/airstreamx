/**
 * Generates and injects dynamic meta tags into document head
 * Supports: title, description, OG tags, Twitter cards, canonical, robots
 */

export interface MetaTagsConfig {
  title: string;
  description: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'video.other';
  keywords?: string[];
  author?: string;
  publishedDate?: string;
  modifiedDate?: string;
  imageWidth?: number;
  imageHeight?: number;
  robots?: 'index, follow' | 'noindex, follow' | 'noindex, nofollow';
  twitterHandle?: string;
  canonicalUrl?: string;
}

/**
 * Generate all meta tags at once
 */
export function generateMetaTags(config: MetaTagsConfig): void {
  // Validate config
  if (!config.title || !config.description) {
    console.warn('[SEO] Missing required fields: title and description');
    return;
  }

  // Page title (max 60 chars)
  document.title = truncate(config.title, 60);

  // Primary meta tags
  setMetaTag('name', 'description', truncate(config.description, 155));

  if (config.keywords?.length) {
    setMetaTag('name', 'keywords', config.keywords.join(', '));
  }

  if (config.author) {
    setMetaTag('name', 'author', config.author);
  }

  if (config.robots) {
    setMetaTag('name', 'robots', config.robots);
  }

  // Canonical URL (prevent duplicate content)
  if (config.canonicalUrl) {
    setCanonicalTag(config.canonicalUrl);
  }

  // Open Graph tags
  setMetaTag('property', 'og:title', truncate(config.title, 60));
  setMetaTag('property', 'og:description', truncate(config.description, 155));
  setMetaTag('property', 'og:type', config.type || 'website');
  setMetaTag('property', 'og:locale', 'en_US');

  if (config.url) {
    setMetaTag('property', 'og:url', config.url);
  }

  // Image (OG + Twitter)
  if (config.image) {
    setMetaTag('property', 'og:image', config.image);
    setMetaTag('property', 'og:image:type', 'image/jpeg');
    setMetaTag('property', 'og:image:width', String(config.imageWidth || 1200));
    setMetaTag('property', 'og:image:height', String(config.imageHeight || 630));
    setMetaTag('name', 'twitter:image', config.image);
  }

  // Twitter Card
  setMetaTag('name', 'twitter:card', config.type === 'video.other' ? 'player' : 'summary_large_image');

  if (config.twitterHandle) {
    setMetaTag('name', 'twitter:creator', config.twitterHandle);
  }

  // Publishing dates
  if (config.publishedDate) {
    setMetaTag('property', 'article:published_time', config.publishedDate);
  }

  if (config.modifiedDate) {
    setMetaTag('property', 'article:modified_time', config.modifiedDate);
  }

  // Log for debugging
  console.log('[SEO] Meta tags updated:', {
    title: config.title,
    description: config.description,
    image: config.image ? '✓' : '✗',
    canonical: config.canonicalUrl ? '✓' : '✗',
  });
}

/**
 * Set or update a meta tag
 */
function setMetaTag(attr: string, name: string, content: string): void {
  if (!content) return;

  let el = document.querySelector(
    `meta[${attr}="${name}"]`
  ) as HTMLMetaElement | null;

  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }

  el.setAttribute('content', content);
}

/**
 * Set canonical URL (prevent duplicate content issues)
 */
function setCanonicalTag(url: string): void {
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }

  link.href = url;
}

/**
 * Utility: Truncate string to max length
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Utility: Format date to ISO string
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}
