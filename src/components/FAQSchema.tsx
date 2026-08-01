import React from 'react';

/**
 * FAQPage Schema - For FAQ pages
 * Enables FAQ rich snippets in Google Search results
 *
 * @see https://schema.org/FAQPage
 */

interface FAQItem {
  /** Question text (required) */
  question: string;
  /** Answer text (required) */
  answer: string;
}

interface FAQSchemaProps {
  /** Array of FAQ items */
  items: FAQItem[];
}

export const FAQSchema: React.FC<FAQSchemaProps> = ({ items }) => {
  if (!items?.length) {
    console.warn('[FAQSchema] No items provided');
    return null;
  }

  const validItems = items.filter(item => item.question && item.answer);
  if (validItems.length < 2) {
    console.warn('[FAQSchema] At least 2 items required');
    return null;
  }

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: validItems.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
};
