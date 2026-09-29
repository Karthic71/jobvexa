// Author: Karthic
// Server/collector side (Node only). The browser uses ./query.ts instead.
import type { JobListing, SearchParams, SourceInfo, SourceStatus } from '@/types/job';
import { mergeApplyOptions } from './portals';
import { PRIORITY } from './query';
import { adzuna } from './sources/adzuna';
import { ashby, greenhouse, lever, smartrecruiters } from './sources/ats';
import { atsDiscovery } from './sources/discovery';
import { jobBank } from './sources/jobbank';
import { jooble, jsearch } from './sources/jooble';
import { SOURCE_META } from './sources/registry';
import type { SourceAdapter } from './sources/types';
import { usajobs } from './sources/usajobs';

export { generateJobFingerprint } from './fingerprint';
export { buildDeepLinks } from './deeplinks';
export { applyFilters, sortJobs, yearlyMax, querySnapshot } from './query';

/** Adapters that are queried per country/region. */
export const SEARCH_ADAPTERS: SourceAdapter[] = [jobBank, adzuna, jsearch, jooble, usajobs];
/** Adapters that return an employer's full board in one call. */
export const BOARD_ADAPTERS: SourceAdapter[] = [greenhouse, lever, ashby, smartrecruiters];
export const ADAPTERS: SourceAdapter[] = [...SEARCH_ADAPTERS, ...BOARD_ADAPTERS, atsDiscovery];
export { atsDiscovery };

/** Merge duplicates: keep the best source's data, combine every portal link, fill gaps from the others. */
export function dedupe(jobs: JobListing[]): JobListing[] {
  const map = new Map<string, JobListing>();
  for (const j of jobs) {
    const prev = map.get(j.id);
    if (!prev) { map.set(j.id, j); continue; }
    const [best, other] = PRIORITY[j.source] > PRIORITY[prev.source] ? [j, prev] : [prev, j];
    const applyOptions = mergeApplyOptions(best.applyOptions, other.applyOptions);
    map.set(j.id, {
      ...best,
      applyOptions,
      applyUrl: applyOptions[0]?.url ?? best.applyUrl,
      salary: best.salary ?? other.salary,
      companyLogo: best.companyLogo ?? other.companyLogo,
      description: (best.description?.length ?? 0) >= (other.description?.length ?? 0) ? best.description : other.description,
      descriptionSnippet: best.descriptionSnippet.length >= other.descriptionSnippet.length ? best.descriptionSnippet : other.descriptionSnippet,
      postedAt: best.postedAt < other.postedAt ? best.postedAt : other.postedAt,
    });
  }
  return [...map.values()];
}

/** Run one adapter safely and report its status. */
export async function runAdapter(a: SourceAdapter, p: SearchParams): Promise<{ jobs: JobListing[]; status: SourceStatus }> {
  const t0 = Date.now();
  const skipped = a.skipReason();
  if (skipped) return { jobs: [], status: { source: a.name, ok: false, count: 0, skipped, ms: 0 } };
  try {
    const jobs = await a.fetch(p);
    return { jobs, status: { source: a.name, ok: true, count: jobs.length, ms: Date.now() - t0 } };
  } catch (e) {
    return { jobs: [], status: { source: a.name, ok: false, count: 0, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 } };
  }
}

/** Connector list with enabled/not-configured state (only env var NAMES are exposed, never values). */
export function listSources(): SourceInfo[] {
  return SOURCE_META.map((m) => {
    const a = ADAPTERS.find((x) => x.name === m.name);
    const reason = a ? a.skipReason() : 'Unknown';
    return { ...m, enabled: !reason, reason };
  });
}
