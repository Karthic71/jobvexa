import type { Country, JobListing, SearchParams } from '@/types/job';
import { classifyIndustry, htmlToText, fetchJson, finalize, inferEmploymentType, inferWorkType, safeIso, snippet } from '../normalize';
import { regionsFor, toRegionCode } from '../regions';
import { env, type SourceAdapter } from './types';

interface AdzunaResult {
  title: string;
  description: string;
  redirect_url: string;
  created: string;
  salary_min?: number;
  salary_max?: number;
  contract_time?: string;
  contract_type?: string;
  company?: { display_name?: string };
  category?: { label?: string };
  location?: { display_name?: string; area?: string[] };
}

const CATEGORY_TAG: Record<string, string> = {
  technology: 'it-jobs',
  healthcare: 'healthcare-nursing-jobs',
  trades_construction: 'trade-construction-jobs',
  finance_accounting: 'accounting-finance-jobs',
  sales_marketing: 'sales-jobs',
  education: 'teaching-jobs',
  hospitality_tourism: 'hospitality-catering-jobs',
  customer_service: 'customer-services-jobs',
  legal: 'legal-jobs',
  manufacturing_logistics: 'logistics-warehouse-jobs',
};

async function run(country: Lowercase<Country>, p: SearchParams): Promise<JobListing[]> {
  const C = country.toUpperCase() as Country;
  const qs = new URLSearchParams({
    app_id: env('ADZUNA_APP_ID'),
    app_key: env('ADZUNA_APP_KEY'),
    results_per_page: '50',
    'content-type': 'application/json',
  });
  if (p.q) qs.set('what', p.q);
  const where = [p.city, p.region && regionsFor(C)[p.region]].filter(Boolean).join(', ');
  if (where) qs.set('where', where);
  if (p.industry !== 'all' && CATEGORY_TAG[p.industry]) qs.set('category', CATEGORY_TAG[p.industry]);
  if (p.minSalary) qs.set('salary_min', String(p.minSalary));
  if (p.postedWithinDays) qs.set('max_days_old', String(p.postedWithinDays));
  if (p.employmentType === 'full-time') qs.set('full_time', '1');
  if (p.employmentType === 'part-time') qs.set('part_time', '1');
  if (p.employmentType === 'contract') qs.set('contract', '1');
  if (p.sort === 'newest') qs.set('sort_by', 'date');
  if (p.sort === 'salary') qs.set('sort_by', 'salary');

  const data = await fetchJson<{ results?: AdzunaResult[] }>(
    `https://api.adzuna.com/v1/api/jobs/${country}/search/${Math.max(1, p.page || 1)}?${qs}`,
  );
  return (data.results ?? []).map((r) => {
    const area = r.location?.area ?? [];
    // area = [country, state/province, county..., city]
    const region = toRegionCode(area[1], C);
    const city = area.length > 2 ? area[area.length - 1] : (r.location?.display_name ?? '').split(',')[0] ?? '';
    const text = `${r.title} ${r.description}`;
    const yearly = (r.salary_min ?? 0) > 1000 || (r.salary_max ?? 0) > 1000;
    return finalize({
      title: r.title,
      company: r.company?.display_name ?? '',
      location: { city, stateProvince: region, country: C, isRemote: /\bremote\b/i.test(text) },
      workType: inferWorkType(text),
      employmentType: inferEmploymentType(`${r.contract_time ?? ''} ${r.contract_type ?? ''} ${r.title}`.replace('full_time', 'full-time').replace('part_time', 'part-time')),
      industry: classifyIndustry(r.title, r.category?.label),
      salary: r.salary_min || r.salary_max
        ? { min: r.salary_min, max: r.salary_max, currency: C === 'CA' ? 'CAD' : 'USD', period: yearly ? 'yearly' : 'hourly' }
        : undefined,
      descriptionSnippet: snippet(r.description),
      description: htmlToText(r.description),
      applyUrl: r.redirect_url,
      source: 'adzuna',
      postedAt: safeIso(r.created),
    });
  });
}

export const adzuna: SourceAdapter = {
  name: 'Adzuna',
  source: 'adzuna',
  skipReason: () => (env('ADZUNA_APP_ID') && env('ADZUNA_APP_KEY') ? null : 'ADZUNA_APP_ID / ADZUNA_APP_KEY not set'),
  async fetch(p) {
    const countries: Lowercase<Country>[] = p.country === 'CA' ? ['ca'] : p.country === 'US' ? ['us'] : ['ca', 'us'];
    const settled = await Promise.allSettled(countries.map((c) => run(c, p)));
    const ok = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
    if (!ok.length && settled.every((s) => s.status === 'rejected')) throw (settled[0] as PromiseRejectedResult).reason;
    return ok;
  },
};
