import type { Country, JobListing, JobSource } from '@/types/job';
import { classifyIndustry, htmlToText, fetchJson, finalize, inferEmploymentType, inferWorkType, safeIso, snippet } from '../normalize';
import { parseLocationString } from '../regions';
import { env, envList, type SourceAdapter } from './types';

/** Returns a CA/US location, or null when the posting is outside our markets. */
function loc(raw: string, remote: boolean) {
  const l = parseLocationString(raw || '');
  const known = /,|canada|united states|usa|remote/i.test(raw || '') && (l.stateProvince || /canada|united states|usa|remote/i.test(raw));
  if (!known && !remote) return null;
  return { city: /^remote/i.test(l.city) ? '' : l.city, stateProvince: l.stateProvince, country: l.country as Country, isRemote: remote };
}

export function buildFromAts(source: JobSource, company: string, o: {
  title: string; location: string; remote?: boolean; type?: string; dept?: string;
  desc?: string; url: string; posted?: string | number;
}): JobListing | null {
  const remote = !!o.remote || /remote/i.test(o.location);
  const l = loc(o.location, remote);
  if (!l) return null;
  return finalize({
    title: o.title,
    company,
    location: l,
    workType: inferWorkType(`${o.title} ${o.location}`, remote),
    employmentType: inferEmploymentType(`${o.type ?? ''} ${o.title}`),
    industry: classifyIndustry(o.title, o.dept),
    descriptionSnippet: snippet(o.desc),
    description: htmlToText(o.desc),
    applyUrl: o.url,
    source,
    postedAt: safeIso(o.posted),
  });
}

const pretty = (s: string) => s.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

async function many<T>(ids: string[], fn: (id: string) => Promise<T[]>): Promise<T[]> {
  const res = await Promise.allSettled(ids.map(fn));
  const ok = res.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  if (!ok.length && res.length && res.every((r) => r.status === 'rejected')) throw (res[0] as PromiseRejectedResult).reason;
  return ok;
}

export const greenhouse: SourceAdapter = {
  name: 'Greenhouse',
  source: 'greenhouse',
  skipReason: () => (envList('GREENHOUSE_BOARDS').length ? null : 'Covered by ATS auto-discovery (optional extra list: GREENHOUSE_BOARDS)'),
  fetch: () => many(envList('GREENHOUSE_BOARDS'), async (b) => {
    const d = await fetchJson<{ jobs: { title: string; location?: { name: string }; absolute_url: string; updated_at: string; content?: string; departments?: { name: string }[] }[] }>(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(b)}/jobs?content=true`);
    return d.jobs.map((j) => buildFromAts('greenhouse', pretty(b), { title: j.title, location: j.location?.name ?? '', dept: j.departments?.[0]?.name, desc: j.content, url: j.absolute_url, posted: j.updated_at })).filter((x): x is JobListing => !!x);
  }),
};

export const lever: SourceAdapter = {
  name: 'Lever',
  source: 'lever',
  skipReason: () => (envList('LEVER_COMPANIES').length ? null : 'Covered by ATS auto-discovery (optional extra list: LEVER_COMPANIES)'),
  fetch: () => many(envList('LEVER_COMPANIES'), async (c) => {
    const d = await fetchJson<{ text: string; categories?: { location?: string; commitment?: string; team?: string }; hostedUrl: string; createdAt: number; descriptionPlain?: string; workplaceType?: string }[]>(
      `https://api.lever.co/v0/postings/${encodeURIComponent(c)}?mode=json`);
    return d.map((j) => buildFromAts('lever', pretty(c), { title: j.text, location: j.categories?.location ?? '', remote: j.workplaceType === 'remote', type: j.categories?.commitment, dept: j.categories?.team, desc: j.descriptionPlain, url: j.hostedUrl, posted: j.createdAt })).filter((x): x is JobListing => !!x);
  }),
};

export const ashby: SourceAdapter = {
  name: 'Ashby',
  source: 'ashby',
  skipReason: () => (envList('ASHBY_BOARDS').length ? null : 'Covered by ATS auto-discovery (optional extra list: ASHBY_BOARDS)'),
  fetch: () => many(envList('ASHBY_BOARDS'), async (b) => {
    const d = await fetchJson<{ jobs: { title: string; location?: string; isRemote?: boolean; employmentType?: string; department?: string; publishedAt?: string; jobUrl: string; applyUrl?: string; descriptionPlain?: string }[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(b)}`);
    return d.jobs.map((j) => buildFromAts('ashby', pretty(b), { title: j.title, location: j.location ?? '', remote: j.isRemote, type: (j.employmentType ?? '').replace('FullTime', 'full-time').replace('PartTime', 'part-time'), dept: j.department, desc: j.descriptionPlain, url: j.applyUrl || j.jobUrl, posted: j.publishedAt })).filter((x): x is JobListing => !!x);
  }),
};

export const smartrecruiters: SourceAdapter = {
  name: 'SmartRecruiters',
  source: 'smartrecruiters',
  skipReason: () => (env('ENABLE_SMARTRECRUITERS') !== 'true' ? 'Opt-in: set ENABLE_SMARTRECRUITERS=true after confirming permission' : envList('SMARTRECRUITERS_COMPANIES').length ? null : 'SMARTRECRUITERS_COMPANIES not set'),
  fetch: () => many(envList('SMARTRECRUITERS_COMPANIES'), async (c) => {
    const d = await fetchJson<{ content: { id: string; name: string; releasedDate?: string; location?: { city?: string; region?: string; country?: string; remote?: boolean }; department?: { label?: string }; typeOfEmployment?: { label?: string }; company?: { name?: string } }[] }>(
      `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(c)}/postings?limit=100`);
    return d.content.map((j) => {
      const cc = (j.location?.country ?? '').toUpperCase();
      if (cc && cc !== 'CA' && cc !== 'US') return null;
      const location = [j.location?.city, j.location?.region, cc].filter(Boolean).join(', ');
      return buildFromAts('smartrecruiters', j.company?.name ?? pretty(c), { title: j.name, location, remote: j.location?.remote, type: j.typeOfEmployment?.label, dept: j.department?.label, url: `https://jobs.smartrecruiters.com/${encodeURIComponent(c)}/${j.id}`, posted: j.releasedDate });
    }).filter((x): x is JobListing => !!x);
  }),
};
