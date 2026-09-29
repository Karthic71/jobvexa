export const dynamic = 'force-static';
import type { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/dashboard/', '/sources/', '/terms/', '/privacy/', '/attribution/'].map((p) => ({ url: `${BRAND.siteUrl}${p}`, changeFrequency: 'daily' as const }));
}
