import type { Country, JobListing } from '@/types/job';
import { classifyIndustry, htmlToText, fetchJson, finalize, inferEmploymentType, inferWorkType, parseSalaryText, safeIso, snippet } from '../normalize';
import { parseLocationString, regionsFor } from '../regions';
import { env, type SourceAdapter } from './types';
import { portalForUrl } from '../portals';

/** Normalise a publisher label: known boards keep their canonical name, the employer's own site is labelled as such. */
function publisherName(publisher: string | undefined, url: string, direct?: boolean): string {
  const byUrl = portalForUrl(url, publisher);
  if (direct && !byUrl.direct) return `Company site${publisher ? ` (${publisher})` : ''}`;
  return byUrl.portal;
}

interface JoobleJob { title: string; location: string; snippet: string; salary?: string; type?: string; link: string; company?: string; updated?: string; source?: string }

interface JSearchJob {
  job_title: string; employer_name?: string; employer_logo?: string | null;
  job_city?: string; job_state?: string; job_country?: string; job_is_remote?: boolean;
  job_description?: string; job_apply_link: string; job_posted_at_datetime_utc?: string;
  job_min_salary?: number | null; job_max_salary?: number | null; job_salary_currency?: string | null; job_salary_period?: string | null;
  job_employment_type?: string;
  /** Site the main apply link points to, e.g. 'LinkedIn', 'Indeed', 'Acme Careers'. */
  job_publisher?: string;
  job_apply_is_direct?: boolean;
  /** Other places the same job is posted. */
  apply_options?: { publisher?: string; apply_link?: string; is_direct?: boolean }[];
}

export const jooble: SourceAdapter = {
  name: 'Jooble',
  source: 'jooble',
  skipReason: () => (env('JOOBLE_API_KEY') ? null : 'JOOBLE_API_KEY not set'),
  async fetch(p) {
    const jobs: JobListing[] = [];
    const errors: unknown[] = [];
    const countries: Country[] = p.country === 'ALL' ? ['CA', 'US'] : [p.country];
    if (env('JOOBLE_API_KEY')) {
      await Promise.all(countries.map(async (c) => {
        try {
          const where = [p.city, p.region && regionsFor(c)[p.region]].filter(Boolean).join(', ') || (c === 'CA' ? 'Canada' : 'United States');
          const data = await fetchJson<{ jobs?: JoobleJob[] }>(`https://jooble.org/api/${env('JOOBLE_API_KEY')}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keywords: p.q || '', location: where, page: Math.max(1, p.page || 1), ...(p.postedWithinDays ? { datecreatedfrom: new Date(Date.now() - p.postedWithinDays * 864e5).toISOString().slice(0, 10) } : {}) }),
          });
          for (const j of data.jobs ?? []) {
            const loc = parseLocationString(j.location || where, c);
            const sal = parseSalaryText(j.salary, c);
            jobs.push(finalize({
              title: j.title.replace(/<[^>]+>/g, ''),
              company: j.company ?? '',
              location: { ...loc, country: c, isRemote: /remote/i.test(`${j.location} ${j.title}`) },
              workType: inferWorkType(`${j.title} ${j.location} ${j.snippet}`),
              employmentType: inferEmploymentType(`${j.type ?? ''} ${j.title}`),
              industry: classifyIndustry(j.title),
              salary: sal,
              descriptionSnippet: snippet(j.snippet),
              description: htmlToText(j.snippet),
              applyUrl: j.link,
              applyOptions: [{ portal: j.source ? portalForUrl(`https://${j.source}`, j.source).portal : 'Jooble', url: j.link, direct: false }],
              source: 'jooble',
              postedAt: safeIso(j.updated),
            }));
          }
        } catch (e) { errors.push(e); }
      }));
    }
    if (!jobs.length && errors.length) throw errors[0];
    return jobs;
  },
};

/**
 * JSearch (Google for Jobs data): lists every portal a job is posted on.
 * Works with an OpenWeb Ninja key (OPENWEBNINJA_API_KEY, direct API) or a RapidAPI key (RAPIDAPI_KEY).
 * RapidAPI stopped taking new JSearch subscriptions in Sept 2026 and the old /search path can 404,
 * so each host's newer `search-v2` path is tried first and the working one is remembered.
 */
type JsHost = { name: string; urls: string[]; headers: () => Record<string, string> };
const JS_HOSTS: JsHost[] = [
  { name: 'OpenWeb Ninja', urls: ['https://api.openwebninja.com/jsearch/search-v2', 'https://api.openwebninja.com/jsearch/search'], headers: () => ({ 'x-api-key': env('OPENWEBNINJA_API_KEY') }) },
  { name: 'RapidAPI', urls: ['https://jsearch.p.rapidapi.com/search-v2', 'https://jsearch.p.rapidapi.com/search'], headers: () => ({ 'X-RapidAPI-Key': env('RAPIDAPI_KEY'), 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com' }) },
];
let jsWorking: { host: JsHost; url: string } | null = null;
export const resetJSearch = () => { jsWorking = null; };
const jsHosts = () => JS_HOSTS.filter((h) => (h.name === 'OpenWeb Ninja' ? env('OPENWEBNINJA_API_KEY') : env('RAPIDAPI_KEY')));

/** Accepts `{data:[...]}`, `{data:{jobs:[...]}}` or `{jobs:[...]}`. */
export function jsearchList(d: unknown): JSearchJob[] {
  const o = (d ?? {}) as { data?: unknown; jobs?: unknown };
  if (Array.isArray(o.data)) return o.data as JSearchJob[];
  const inner = o.data as { jobs?: unknown; data?: unknown } | undefined;
  if (inner && Array.isArray(inner.jobs)) return inner.jobs as JSearchJob[];
  if (inner && Array.isArray(inner.data)) return inner.data as JSearchJob[];
  if (Array.isArray(o.jobs)) return o.jobs as JSearchJob[];
  return [];
}

async function jsearchCall(qs: URLSearchParams): Promise<JSearchJob[]> {
  const tries = jsWorking ? [jsWorking] : jsHosts().flatMap((host) => host.urls.map((url) => ({ host, url })));
  let lastErr: unknown = new Error('No JSearch key set');
  for (const t of tries) {
    const params = new URLSearchParams(qs);
    if (t.url.endsWith('search-v2')) { params.delete('page'); params.delete('num_pages'); }
    try {
      const d = await fetchJson<unknown>(`${t.url}?${params}`, { headers: t.host.headers() });
      jsWorking = t;
      return jsearchList(d);
    } catch (e) {
      lastErr = new Error(`${t.host.name} ${t.url.split('/').pop()}: ${e instanceof Error ? e.message : e}`);
      if (jsWorking) { jsWorking = null; }
    }
  }
  throw lastErr;
}

export const jsearch: SourceAdapter = {
  name: 'JSearch',
  source: 'jsearch',
  skipReason: () => (env('RAPIDAPI_KEY') || env('OPENWEBNINJA_API_KEY') ? null : 'Needs a free key: add secret OPENWEBNINJA_API_KEY (openwebninja.com)'),
  async fetch(p) {
    const jobs: JobListing[] = [];
    const errors: unknown[] = [];
    const countries: Country[] = p.country === 'ALL' ? ['CA', 'US'] : [p.country];
    await Promise.all(countries.map(async (c) => {
      try {
        const where = [p.city, p.region && regionsFor(c)[p.region]].filter(Boolean).join(', ');
        const query = [p.company || p.q || (p.industry !== 'all' ? p.industry.replace(/_/g, ' ') : 'jobs'), where && `in ${where}`].filter(Boolean).join(' ');
        const qs = new URLSearchParams({ query, page: String(Math.max(1, p.page || 1)), num_pages: '1', country: c.toLowerCase() });
        if (p.workType === 'remote') qs.set('work_from_home', 'true');
        if (p.postedWithinDays) qs.set('date_posted', p.postedWithinDays <= 1 ? 'today' : p.postedWithinDays <= 3 ? '3days' : p.postedWithinDays <= 7 ? 'week' : 'month');
        const list = await jsearchCall(qs);
        for (const j of list) {
            const country: Country = (j.job_country ?? c).toUpperCase() === 'CA' ? 'CA' : 'US';
            const cur = (j.job_salary_currency ?? '').toUpperCase() === 'CAD' || country === 'CA' ? 'CAD' : 'USD';
            jobs.push(finalize({
              title: j.job_title,
              company: j.employer_name ?? '',
              companyLogo: j.employer_logo ?? undefined,
              location: { city: j.job_city ?? '', stateProvince: (j.job_state ?? '').length === 2 ? (j.job_state ?? '').toUpperCase() : parseLocationString(`x, ${j.job_state ?? ''}`, country).stateProvince, country, isRemote: !!j.job_is_remote },
              workType: inferWorkType(`${j.job_title}`, j.job_is_remote),
              employmentType: inferEmploymentType(`${(j.job_employment_type ?? '').replace('FULLTIME', 'full-time').replace('PARTTIME', 'part-time').replace('INTERN', 'internship').replace('CONTRACTOR', 'contract')} ${j.job_title}`),
              industry: classifyIndustry(j.job_title),
              salary: j.job_min_salary || j.job_max_salary
                ? { min: j.job_min_salary ?? undefined, max: j.job_max_salary ?? undefined, currency: cur, period: /hour/i.test(j.job_salary_period ?? '') ? 'hourly' : 'yearly' }
                : undefined,
              descriptionSnippet: snippet(j.job_description),
              description: htmlToText(j.job_description),
              applyUrl: j.job_apply_link,
              applyOptions: [
                { portal: publisherName(j.job_publisher, j.job_apply_link, j.job_apply_is_direct), url: j.job_apply_link, direct: !!j.job_apply_is_direct },
                ...(j.apply_options ?? []).filter((o) => o.apply_link).map((o) => ({ portal: publisherName(o.publisher, o.apply_link!, o.is_direct), url: o.apply_link!, direct: !!o.is_direct })),
              ],
              source: 'jsearch',
              postedAt: safeIso(j.job_posted_at_datetime_utc),
            }));
          }
      } catch (e) { errors.push(e); }
    }));
    if (!jobs.length && errors.length) throw errors[0];
    return jobs;
  },
};
