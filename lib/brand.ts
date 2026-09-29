/**
 * Single source of truth for the site's name and legal identity.
 * Change values here (and in LICENSE) — nothing else hard-codes them.
 */
export const BRAND = {
  name: 'Jobvexa',
  tagline: 'Every job in Canada first, then the USA — and every place to apply',
  description: 'Jobvexa is a free job search tool that brings together job postings across all industries in Canada and the United States, and shows every portal where you can apply.',
  author: 'Karthic',
  year: 2026,
  // Public contact shown on the legal pages. Consider a dedicated address before publishing.
  contactEmail: 'karthicjr17@gmail.com',
  // Set automatically by the GitHub workflow (https://<user>.github.io/<repo>).
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  jurisdiction: 'Ontario, Canada',
  lastUpdated: '2026-09-28',
} as const;
