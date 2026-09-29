/**
 * Client-safe search over a jobs snapshot (no Node APIs here).
 * Used by the browser on the published site and by the tests.
 */
import type { JobListing, JobSource, JobsSnapshot, SearchParams, SearchResponse } from '@/types/job';
import { buildDeepLinks } from './deeplinks';
import { companyMatches, matchingCompanies } from './companies';
import { normalizeToken } from './text';

/** Higher wins when duplicates collide: official/direct employer feeds beat aggregators. */
export const PRIORITY: Record<JobSource, number> = {
  greenhouse: 7, lever: 7, ashby: 7, smartrecruiters: 7,
  canada_job_bank: 6, usajobs: 6, adzuna: 4, jsearch: 4, jooble: 3, deep_link: 0,
};

/** Yearly-equivalent salary for comparisons (2080 hours/year). */
export const yearlyMax = (j: JobListing) => {
  const v = j.salary?.max ?? j.salary?.min ?? 0;
  return j.salary?.period === 'hourly' ? v * 2080 : v;
};

export function applyFilters(jobs: JobListing[], p: SearchParams): JobListing[] {
  const terms = normalizeToken(p.q).split(' ').filter(Boolean);
  const cutoff = p.postedWithinDays ? Date.now() - p.postedWithinDays * 864e5 : 0;
  const city = normalizeToken(p.city);
  const fromMs = p.dateFrom ? new Date(p.dateFrom + 'T00:00:00').getTime() : 0;
  const toMs = p.dateTo ? new Date(p.dateTo + 'T23:59:59').getTime() : 0;
  return jobs.filter((j) => {
    if (p.country !== 'ALL' && j.location.country !== p.country) return false;
    if (p.region && j.location.stateProvince !== p.region && !(j.workType === 'remote' && !j.location.stateProvince)) return false;
    if (city && !normalizeToken(j.location.city).includes(city)) return false;
    if (p.industry !== 'all' && j.industry !== p.industry) return false;
    if (p.workType !== 'all' && j.workType !== p.workType) return false;
    if (p.employmentType !== 'all' && j.employmentType !== p.employmentType) return false;
    if (p.company && !companyMatches(j, p.company)) return false;
    if (p.level !== 'all' && j.seniority !== p.level) return false;
    if (p.skills.length && !p.skills.every((s) => j.skills?.includes(s))) return false;
    if (p.certs.length && !p.certs.every((s) => j.certifications?.includes(s))) return false;
    if (p.tools.length && !p.tools.every((s) => j.tools?.includes(s))) return false;
    if (p.minSalary && yearlyMax(j) < p.minSalary) return false;
    if (p.maxSalary && j.salary && (j.salary.min ? (j.salary.period === 'hourly' ? j.salary.min * 2080 : j.salary.min) : yearlyMax(j)) > p.maxSalary) return false;
    if (cutoff && new Date(j.postedAt).getTime() < cutoff) return false;
    if (fromMs && new Date(j.postedAt).getTime() < fromMs) return false;
    if (toMs && new Date(j.postedAt).getTime() > toMs) return false;
    if (terms.length) {
      const hay = normalizeToken(`${j.title} ${j.company} ${j.descriptionSnippet} ${j.location.city}`);
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

function score(j: JobListing, terms: string[]): number {
  const title = normalizeToken(j.title);
  const company = normalizeToken(j.company);
  const ageDays = (Date.now() - new Date(j.postedAt).getTime()) / 864e5;
  let s = Math.max(0, 30 - ageDays);
  for (const t of terms) { if (title.includes(t)) s += 20; if (company.includes(t)) s += 10; }
  if (j.salary) s += 5;
  return s + PRIORITY[j.source];
}

export function sortJobs(jobs: JobListing[], p: SearchParams): JobListing[] {
  const terms = normalizeToken(p.q).split(' ').filter(Boolean);
  let cmp: (x: JobListing, y: JobListing) => number;
  switch (p.sort) {
    case 'oldest': cmp = (x, y) => +new Date(x.postedAt) - +new Date(y.postedAt); break;
    case 'newest': cmp = (x, y) => +new Date(y.postedAt) - +new Date(x.postedAt); break;
    case 'salary': cmp = (x, y) => yearlyMax(y) - yearlyMax(x); break;
    case 'company': cmp = (x, y) => x.company.localeCompare(y.company); break;
    default: cmp = (x, y) => score(y, terms) - score(x, terms);
  }
  // Canada is first priority: when both countries are shown, Canadian jobs come first.
  const rank = (j: JobListing) => (j.location.country === 'CA' ? 0 : 1);
  return [...jobs].sort((x, y) => rank(x) - rank(y) || cmp(x, y));
}

export function count(arr: string[]) {
  const o: Record<string, number> = {};
  for (const k of arr) if (k) o[k] = (o[k] ?? 0) + 1;
  return o;
}

/** Everything the search page needs, computed from the published snapshot. */
export function querySnapshot(snap: JobsSnapshot, p: SearchParams): SearchResponse {
  const filtered = sortJobs(applyFilters(snap.jobs, p), p);
  const start = (p.page - 1) * p.pageSize;
  return {
    jobs: filtered.slice(start, start + p.pageSize),
    total: filtered.length,
    page: p.page,
    pageSize: p.pageSize,
    deepLinks: buildDeepLinks(p),
    sources: snap.sources,
    usedMock: snap.usedMock,
    updatedAt: snap.updatedAt,
    companies: p.q ? matchingCompanies(snap.jobs, p.q) : [],
    facets: {
      industry: count(filtered.map((j) => j.industry)),
      region: count(filtered.map((j) => j.location.stateProvince)),
      level: count(filtered.map((j) => j.seniority ?? '')),
      skills: count(filtered.flatMap((j) => j.skills ?? [])),
      certs: count(filtered.flatMap((j) => j.certifications ?? [])),
      tools: count(filtered.flatMap((j) => j.tools ?? [])),
    },
  };
}
