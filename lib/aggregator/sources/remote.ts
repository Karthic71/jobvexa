import type { Country, JobListing, SearchParams } from '@/types/job';
import { classifyIndustry, fetchJson, finalize, htmlToText, inferEmploymentType, inferWorkType, parseSalaryText, safeIso, snippet } from '../normalize';
import { env, type SourceAdapter } from './types';

/**
 * Remote-job boards with public APIs. Both require a visible link back to their posting and
 * naming them as the source — every job links to its Remotive/Himalayas page and shows "via …".
 */

/** Which country a remote job is open to (Canada preferred), or null when neither. */
export function remoteCountry(restrictions: string[] | string | undefined): Country | null {
  const list = (Array.isArray(restrictions) ? restrictions : String(restrictions ?? '').split(/[,;/|]+/)).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return 'CA'; // worldwide
  if (list.some((s) => /worldwide|anywhere|global|north america|americas|canada/.test(s))) return 'CA';
  if (list.some((s) => /^(usa|us|u\.s\.|united states|us only|usa only)$|united states/.test(s))) return 'US';
  return null;
}

const toMs = (v: unknown) => (typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : v);

interface RemotiveJob { url: string; title: string; company_name: string; category?: string; job_type?: string; publication_date?: string; candidate_required_location?: string; salary?: string; description?: string }

/** Remotive: ≤4 requests a day (their rule), so the collector calls it at most every 6 hours. */
export const remotive: SourceAdapter = {
  name: 'Remotive',
  source: 'remotive',
  skipReason: () => (env('DISABLE_REMOTIVE') === 'true' ? 'Disabled (DISABLE_REMOTIVE=true)' : null),
  async fetch() {
    const d = await fetchJson<{ jobs?: RemotiveJob[] }>('https://remotive.com/api/remote-jobs', { headers: { 'User-Agent': 'JobvexaBot/1.0 (+https://github.com/Karthic71/jobvexa)' } }, 30000);
    const out: JobListing[] = [];
    for (const j of d.jobs ?? []) {
      const country = remoteCountry(j.candidate_required_location);
      if (!country || !j.url || !j.title) continue;
      out.push(finalize({
        title: j.title, company: j.company_name,
        location: { city: '', stateProvince: '', country, isRemote: true },
        workType: 'remote', employmentType: inferEmploymentType(`${j.job_type ?? ''} ${j.title}`.replace('full_time', 'full-time').replace('part_time', 'part-time')),
        industry: classifyIndustry(j.title, j.category), salary: parseSalaryText(j.salary, country),
        descriptionSnippet: snippet(j.description), description: htmlToText(j.description),
        applyUrl: j.url, applyOptions: [{ portal: 'Remotive', url: j.url, direct: false }],
        source: 'remotive', postedAt: safeIso(j.publication_date),
      }));
    }
    return out;
  },
};

interface HimalayasJob { title: string; companyName?: string; employmentType?: string; locationRestrictions?: string[]; minSalary?: number; maxSalary?: number; currency?: string; salaryPeriod?: string; description?: string; excerpt?: string; pubDate?: number | string; applicationLink?: string; guid?: string; categories?: string[]; seniority?: string[] }

/** Himalayas search API: remote jobs open to Canada (then the USA). */
export const himalayas: SourceAdapter = {
  name: 'Himalayas',
  source: 'himalayas',
  skipReason: () => (env('DISABLE_HIMALAYAS') === 'true' ? 'Disabled (DISABLE_HIMALAYAS=true)' : null),
  async fetch(p: SearchParams) {
    const qs = new URLSearchParams({ country: p.country === 'US' ? 'United States' : 'Canada', page: String(Math.max(1, p.page || 1)), sort: 'recent' });
    const q = p.q.replace(/\s+remote$/, '').trim();
    if (q) qs.set('q', q);
    const d = await fetchJson<{ jobs?: HimalayasJob[] }>(`https://himalayas.app/jobs/api/search?${qs}`, { headers: { 'User-Agent': 'JobvexaBot/1.0 (+https://github.com/Karthic71/jobvexa)' } }, 20000);
    const out: JobListing[] = [];
    for (const j of d.jobs ?? []) {
      const url = j.applicationLink || j.guid;
      const country = remoteCountry(j.locationRestrictions);
      if (!url || !j.title || !country) continue;
      const hourly = /hour/i.test(j.salaryPeriod ?? '');
      out.push(finalize({
        title: j.title, company: j.companyName ?? '',
        location: { city: '', stateProvince: '', country, isRemote: true },
        workType: inferWorkType('remote', true), employmentType: inferEmploymentType(`${j.employmentType ?? ''} ${j.title}`.replace(/full.?time/i, 'full-time').replace(/part.?time/i, 'part-time')),
        industry: classifyIndustry(j.title, j.categories?.join(' ')),
        salary: j.minSalary || j.maxSalary ? { min: j.minSalary || undefined, max: j.maxSalary || undefined, currency: (j.currency ?? '').toUpperCase() === 'CAD' ? 'CAD' : 'USD', period: hourly ? 'hourly' : 'yearly' } : undefined,
        descriptionSnippet: snippet(j.excerpt || j.description), description: htmlToText(j.description),
        applyUrl: url, applyOptions: [{ portal: 'Himalayas', url, direct: false }],
        source: 'himalayas', postedAt: safeIso(toMs(j.pubDate) as string | number | undefined),
      }));
    }
    return out;
  },
};
