'use client';
import type { JobsSnapshot, SourcesSnapshot, StatsSnapshot } from '@/types/job';
import type { KeywordConfig } from '@/lib/aggregator/keywords';

/** GitHub Pages serves the site under /<repo>; the workflow sets this at build time. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
export const dataUrl = (p: string) => `${BASE_PATH}/data/${p}`;

const cache = new Map<string, Promise<unknown>>();

function load<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(dataUrl(path), { cache: 'no-cache' }).then((r) => {
      if (r.status === 404) throw new Error('NO_DATA');
      if (!r.ok) throw new Error(`Could not load data (${r.status})`);
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

export const loadJobs = () => load<JobsSnapshot>('jobs.json');
export const loadStats = () => load<StatsSnapshot>('stats.json');
export const loadSources = () => load<SourcesSnapshot>('sources.json');
export const loadKeywords = () => load<KeywordConfig>('keywords.json').catch(() => ({ priority: [], general: [], aliases: {} }) as KeywordConfig);
export interface Coverage {
  updatedAt: string; runSeconds: number;
  totals: { jobs: number; canada: number; fetchedThisRun: number };
  sources: { source: string; ok: boolean; jobsThisRun: number; calls?: number; budgetToday?: number; usedToday?: number; lastSuccess?: string; error?: string; note?: string }[];
  keywords: { keyword: string; tier: 'priority' | 'general'; jobsNow: number; canada: number; callsThisRun: number; fetchedThisRun: number; thin: boolean }[];
}
export const loadCoverage = () => load<Coverage>('coverage.json');

/** Full description for one job (descriptions are sharded by the first 2 characters of the id). */
export async function loadDescription(id: string): Promise<string | undefined> {
  try { return (await load<Record<string, string>>(`desc/${id.slice(0, 2)}.json`))[id]; } catch { return undefined; }
}

export const friendlyError = (e: unknown) =>
  e instanceof Error && e.message === 'NO_DATA'
    ? 'Job data hasn’t been published yet. On GitHub, open the Actions tab and run “Collect jobs & deploy”, or locally run `npm run collect`.'
    : e instanceof Error ? e.message : 'Something went wrong';
