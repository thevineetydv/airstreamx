import React from 'react';

/**
 * SearchAction Schema - Enables search box in Google Search results
 * Shows search functionality directly in SERP (sitelinks search box)
 *
 * @see https://schema.org/SearchAction
 */

interface SearchActionSchemaProps {
  /** URL template for search results (required) */
  searchUrl?: string;
}

export const SearchActionSchema: React.FC<SearchActionSchemaProps> = ({
  searchUrl = 'https://airstreamx.com/search?q={search_term_string}',
}) => {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'AirStreamX',
    url: 'https://airstreamx.com',
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: searchUrl,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
};
