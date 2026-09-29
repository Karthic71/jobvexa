import type { DeepLink, SearchParams } from '@/types/job';
import { regionsFor } from './regions';
import { platformLinks } from './platforms';

const INDUSTRY_KEYWORDS: Record<string, string> = {
  technology: 'software OR developer OR IT',
  healthcare: 'nurse OR healthcare',
  trades_construction: 'electrician OR construction OR trades',
  finance_accounting: 'accountant OR finance',
  sales_marketing: 'sales OR marketing',
  education: 'teacher OR education',
  hospitality_tourism: 'hospitality OR restaurant',
  customer_service: 'customer service',
  legal: 'legal OR paralegal',
  manufacturing_logistics: 'warehouse OR logistics OR manufacturing',
};

/** Builds pre-filtered search URLs for closed ecosystems. No scraping. */
export function buildDeepLinks(p: Pick<SearchParams, 'q' | 'country' | 'region' | 'city' | 'industry' | 'workType' | 'postedWithinDays'>): DeepLink[] {
  const table = regionsFor(p.country);
  const regionName = p.region ? table[p.region] ?? p.region : '';
  const country = p.country === 'US' ? 'United States' : 'Canada';
  const where = [p.city, regionName].filter(Boolean).join(', ') || country;
  const kw = [p.q, p.industry !== 'all' && !p.q ? INDUSTRY_KEYWORDS[p.industry] : ''].filter(Boolean).join(' ').trim();
  const days = p.postedWithinDays;
  const enc = encodeURIComponent;

  // LinkedIn: f_TPR = seconds; f_WT = 1 onsite, 2 remote, 3 hybrid
  const li = new URLSearchParams({ keywords: kw, location: where });
  if (days) li.set('f_TPR', `r${days * 86400}`);
  if (p.workType !== 'all') li.set('f_WT', { onsite: '1', remote: '2', hybrid: '3' }[p.workType]);

  const indeedHost = p.country === 'US' ? 'www.indeed.com' : 'ca.indeed.com';
  const ind = new URLSearchParams({ q: p.workType === 'remote' ? `${kw} remote`.trim() : kw, l: where });
  if (days) ind.set('fromage', String(days));

  const zr = new URLSearchParams({ search: kw, location: where });
  if (days) zr.set('days', String(days));

  // Canada first, then the USA (see platforms.ts).
  return platformLinks(p as SearchParams, p.q ? '' : kw);
}
