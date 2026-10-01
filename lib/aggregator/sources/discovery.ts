import type { JobListing } from '@/types/job';
import { normalizeCompany, normalizeToken } from '../text';
import { fetchJson } from '../normalize';
import { buildFromAts } from './ats';
import { env, type SourceAdapter } from './types';

/**
 * ATS auto-discovery: when someone searches a company name (e.g. "Concentrix"),
 * try the public job-board endpoints of Greenhouse, Lever, Ashby, Workable and Recruitee
 * using slugs derived from that name. No configuration needed. (SmartRecruiters is opt-in only and excluded here.) Only public,
 * documented JSON endpoints are used. Misses are remembered for an hour. The collector remembers found boards between runs.
 */
export function slugCandidates(q: string): string[] {
  const set = new Set<string>();
  // Try the name as typed ("acme corp") and without legal suffixes ("acme").
  for (const n of [normalizeToken(q), normalizeCompany(q)]) {
    const words = n.split(' ').filter(Boolean);
    if (!words.length || words.length > 4 || n.length < 3) continue;
    set.add(words.join(''));
    set.add(words.join('-'));
    if (words.length > 1 && words[0].length >= 4) set.add(words[0]);
  }
  return [...set].filter((s) => s.length >= 3);
}

const misses = new Map<string, number>(); // `${ats}:${slug}` -> timestamp
const MISS_TTL = 3_600_000;
const missed = (k: string) => (misses.get(k) ?? 0) > Date.now() - MISS_TTL;
const miss = (k: string) => { misses.set(k, Date.now()); if (misses.size > 2000) misses.delete(misses.keys().next().value as string); };

const T = 6000;
const nameOk = (found: string | undefined, q: string) => {
  const a = normalizeCompany(found ?? '').split(' ').filter(Boolean);
  const b = normalizeCompany(q).split(' ').filter(Boolean);
  if (!a.length || !b.length) return false;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.every((t) => l.includes(t)); // whole-word match, so "acme" ≠ "acmecorp holdings"
};

export type Ats = 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'recruitee';
export const ALL_ATS: Ats[] = ['greenhouse', 'lever', 'ashby', 'workable', 'recruitee'];
/** A company's public job board: which system, its board slug, and the display name to use. */
export interface BoardRef { ats: Ats; slug: string; name: string }

type GhJob = { title: string; location?: { name: string }; absolute_url: string; updated_at: string; content?: string; departments?: { name: string }[] };
type LvJob = { text: string; categories?: { location?: string; commitment?: string; team?: string }; hostedUrl: string; createdAt: number; descriptionPlain?: string; workplaceType?: string };
type WkJob = { title: string; shortcode?: string; employment_type?: string; telecommuting?: boolean; department?: string; url?: string; shortlink?: string; application_url?: string; published_on?: string; created_at?: string; country?: string; city?: string; state?: string; description?: string; locations?: { country?: string; countryCode?: string; city?: string; region?: string }[] };
type RcJob = { title: string; description?: string; requirements?: string; location?: string; city?: string; country?: string; country_code?: string; state_code?: string; state_name?: string; remote?: boolean; careers_url?: string; careers_apply_url?: string; published_at?: string; created_at?: string; employment_type_code?: string; department?: string; company_name?: string };
type AbJob = { title: string; location?: string; isRemote?: boolean; employmentType?: string; department?: string; publishedAt?: string; jobUrl: string; applyUrl?: string; descriptionPlain?: string };

const keep = (xs: (JobListing | null)[]) => xs.filter((x): x is JobListing => !!x);

/**
 * Fetch one board. Returns null when the board does not exist (or, with `verifyName`,
 * when a Greenhouse board belongs to a differently named company). Returns [] when it
 * exists but has no Canada/US postings.
 */
export async function fetchBoard(ref: BoardRef, verifyName?: string): Promise<{ jobs: JobListing[]; name: string } | null> {
  const slug = encodeURIComponent(ref.slug);
  if (ref.ats === 'greenhouse') {
    let name = ref.name;
    if (verifyName) {
      const b = await fetchJson<{ name?: string }>(`https://boards-api.greenhouse.io/v1/boards/${slug}`, {}, T);
      if (!nameOk(b.name, verifyName)) return null;
      name = b.name ?? name;
    }
    const d = await fetchJson<{ jobs: GhJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {}, 12000);
    return { name, jobs: keep(d.jobs.map((j) => buildFromAts('greenhouse', name, { title: j.title, location: j.location?.name ?? '', dept: j.departments?.[0]?.name, desc: j.content, url: j.absolute_url, posted: j.updated_at }))) };
  }
  if (ref.ats === 'lever') {
    const d = await fetchJson<LvJob[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`, {}, T);
    if (!Array.isArray(d) || !d.length) return null;
    return { name: ref.name, jobs: keep(d.map((j) => buildFromAts('lever', ref.name, { title: j.text, location: j.categories?.location ?? '', remote: j.workplaceType === 'remote', type: j.categories?.commitment, dept: j.categories?.team, desc: j.descriptionPlain, url: j.hostedUrl, posted: j.createdAt }))) };
  }
  if (ref.ats === 'workable') {
    // Public careers-page widget API that Workable customers embed on their own sites.
    const d = await fetchJson<{ name?: string; jobs?: WkJob[] }>(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`, {}, T);
    if (!d.jobs) return null;
    if (verifyName && !nameOk(d.name, verifyName)) return null;
    const name = verifyName ? d.name ?? ref.name : ref.name;
    return { name, jobs: keep(d.jobs.map((j) => {
      const l = j.locations?.[0];
      const location = [l?.city ?? j.city, l?.region ?? j.state, l?.countryCode ?? l?.country ?? j.country].filter(Boolean).join(', ');
      return buildFromAts('workable', name, { title: j.title, location, remote: !!j.telecommuting, type: j.employment_type, dept: j.department, desc: j.description, url: j.application_url || j.url || j.shortlink || `https://apply.workable.com/${slug}/j/${j.shortcode}/`, posted: j.published_on || j.created_at });
    })) };
  }
  if (ref.ats === 'recruitee') {
    // Public careers-site API of Recruitee customers.
    const d = await fetchJson<{ offers?: RcJob[] }>(`https://${slug}.recruitee.com/api/offers/`, {}, T);
    if (!d.offers) return null;
    const found = d.offers[0]?.company_name;
    if (verifyName && d.offers.length && !nameOk(found, verifyName)) return null;
    if (!d.offers.length) return verifyName ? null : { name: ref.name, jobs: [] };
    const name = verifyName ? found ?? ref.name : ref.name;
    return { name, jobs: keep(d.offers.map((j) => buildFromAts('recruitee', name, {
      title: j.title, location: [j.city, j.state_code || j.state_name, j.country_code || j.country].filter(Boolean).join(', ') || j.location || '',
      remote: !!j.remote, type: j.employment_type_code, dept: j.department, desc: `${j.description ?? ''}${j.requirements ?? ''}`,
      url: j.careers_apply_url || j.careers_url || `https://${slug}.recruitee.com/`, posted: j.published_at || j.created_at,
    }))) };
  }
  const d = await fetchJson<{ jobs?: AbJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {}, T);
  if (!d.jobs?.length) return null;
  return { name: ref.name, jobs: keep(d.jobs.map((j) => buildFromAts('ashby', ref.name, { title: j.title, location: j.location ?? '', remote: j.isRemote, type: j.employmentType, dept: j.department, desc: j.descriptionPlain, url: j.applyUrl || j.jobUrl, posted: j.publishedAt }))) };
}

/** Try every slug guess on each ATS; returns the boards found (at most one per ATS) and their jobs. */
export async function discoverCompany(q: string): Promise<{ jobs: JobListing[]; boards: BoardRef[] }> {
  const slugs = slugCandidates(q);
  const found: { ref: BoardRef; jobs: JobListing[] }[] = [];
  await Promise.all(ALL_ATS.map(async (ats) => {
    for (const slug of slugs) {
      const k = `${ats}:${slug}`;
      if (missed(k)) continue;
      try {
        const r = await fetchBoard({ ats, slug, name: q.trim() }, ats === 'greenhouse' || ats === 'workable' || ats === 'recruitee' ? q : undefined);
        if (!r) { miss(k); continue; }
        found.push({ ref: { ats, slug, name: r.name }, jobs: r.jobs });
        return; // one board per ATS is enough
      } catch { miss(k); }
    }
  }));
  return { jobs: found.flatMap((f) => f.jobs), boards: found.map((f) => f.ref) };
}

export const atsDiscovery: SourceAdapter = {
  name: 'ATS auto-discovery',
  source: 'greenhouse',
  skipReason: () => (env('DISABLE_ATS_DISCOVERY') === 'true' ? 'Disabled (DISABLE_ATS_DISCOVERY=true)' : null),
  async fetch(p) {
    const q = p.company || p.q;
    if (!slugCandidates(q).length) return [];
    return (await discoverCompany(q)).jobs;
  },
};
