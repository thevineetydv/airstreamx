import React from 'react';

/**
 * Breadcrumb Schema - Used on all pages to show navigation hierarchy
 * Helps search engines understand site structure
 * May display as breadcrumbs in search results
 *
 * @see https://schema.org/BreadcrumbList
 */

interface BreadcrumbItem {
  /** Display name (required) */
  name: string;
  /** URL (required) */
  url: string;
}

interface BreadcrumbSchemaProps {
  /** Array of breadcrumb items in order */
  items: BreadcrumbItem[];
}

export const BreadcrumbSchema: React.FC<BreadcrumbSchemaProps> = ({ items }) => {
  if (!items?.length) {
    console.warn('[BreadcrumbSchema] No items provided');
    return null;
  }

  // Validate items
  const validItems = items.filter(item => item.name && item.url);
  if (validItems.length < 2) {
    console.warn('[BreadcrumbSchema] At least 2 items required');
    return null;
  }

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: validItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
};

/**
 * Helper to generate breadcrumbs for common routes
 */
export function getBreadcrumbs(pathname: string): BreadcrumbItem[] {
  // Home is always first
  const breadcrumbs: BreadcrumbItem[] = [
    { name: 'Home', url: 'https://airstreamx.com' },
  ];

  if (pathname === '/') {
    return breadcrumbs;
  }

  const parts = pathname.split('/').filter(Boolean);

  parts.forEach((part, index) => {
    const path = '/' + parts.slice(0, index + 1).join('/');
    const name = decodeURIComponent(part)
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    breadcrumbs.push({
      name: name,
      url: `https://airstreamx.com${path}`,
    });
  });

  return breadcrumbs;
}
