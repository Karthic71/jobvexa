/**
 * Jobvexa data collector — runs in GitHub Actions every hour (and locally with `npm run collect`).
 *
 * Pulls jobs from every configured source (Canada first, then USA), removes duplicates,
 * and writes static JSON that the website reads:
 *   public/data/jobs.json      list of jobs (no full descriptions)
 *   public/data/desc/xx.json   full descriptions, sharded by the first 2 chars of the job id
 *   public/data/stats.json     dashboard numbers for CA / US / ALL
 *   public/data/sources.json   per-source status
 *
 * API keys come from environment variables (GitHub repository secrets). Nothing secret is written out.
 */
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { JobListing, JobsSnapshot, SearchParams, SourceStatus, SourcesSnapshot, StatsSnapshot } from '@/types/job';
import { BOARD_ADAPTERS, SEARCH_ADAPTERS, atsDiscovery, dedupe, listSources, runAdapter } from '@/lib/aggregator';
import { discoverCompany, fetchBoard, type BoardRef } from '@/lib/aggregator/sources/discovery';
import { computeStats } from '@/lib/aggregator/stats';
import { mockJobs } from '@/lib/aggregator/sources/mock';
import type { SourceAdapter } from '@/lib/aggregator/sources/types';

const DEFAULT_OUT = join(process.cwd(), 'public', 'data');

/** Load a local .env (for running on your own computer). Existing environment values win. */
function loadDotEnv(file = join(process.cwd(), '.env')) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$/);
    if (m && process.env[m[1]] === undefined && m[2] !== '') process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const env = (k: string, d = '') => (process.env[k] ?? d).trim();
const num = (k: string, d: number) => { const n = Number(env(k)); return Number.isFinite(n) && n >= 0 && env(k) !== '' ? n : d; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Daily call budgets per source, spread evenly over the day's runs (RUNS_PER_DAY, 24 = hourly).
 * Defaults stay inside the free tiers. Usage is remembered in the state file between runs.
 */
const dailyBudget = (): Record<string, number> => ({
  'Canada Job Bank': num('DAILY_CALLS_JOBBANK', 24),
  Adzuna: num('DAILY_CALLS_ADZUNA', 240), // free tier ≈ 250/day
  JSearch: num('DAILY_CALLS_JSEARCH', 6), // free tier is monthly and small — raise on a paid plan
  Jooble: num('DAILY_CALLS_JOOBLE', 100),
  USAJobs: num('DAILY_CALLS_USAJOBS', 200),
});
const GAP_MS: Record<string, number> = { Adzuna: 2600, JSearch: 1200, Jooble: 1200, USAJobs: 800, 'Canada Job Bank': 0 };

/** How many calls this run may make, given today's usage. */
export function allowance(daily: number, usedToday: number, now: number, runsPerDay: number): number {
  const slot = Math.floor((now % 864e5) / (864e5 / runsPerDay)); // UTC slot of the day
  const runsLeft = Math.max(1, runsPerDay - slot);
  return Math.max(0, Math.floor(Math.max(0, daily - usedToday) / runsLeft));
}

const BASE: SearchParams = {
  q: '', country: 'CA', region: '', city: '', industry: 'all', workType: 'all', employmentType: 'all', company: '',
  level: 'all', skills: [], certs: [], tools: [], sort: 'newest', page: 1, pageSize: 50,
};

// Canada first: provinces get most of the searches, biggest job markets get more pages.
const CA_REGIONS = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'YT', 'NU'];
const CA_PAGES: Record<string, number> = { ON: 8, QC: 5, BC: 5, AB: 5, MB: 3, SK: 3, NS: 3, NB: 2, NL: 2 };
const US_REGIONS = ['CA', 'TX', 'NY', 'FL', 'IL', 'WA', 'MA', 'GA', 'NC', 'PA', 'OH', 'VA', 'NJ', 'MI', 'AZ', 'CO', 'MN', 'TN', 'OR', 'MD'];

/** Ordered list of searches. Each source walks through it in rotation, run after run. */
export function buildPlan(): SearchParams[] {
  const plan: SearchParams[] = [];
  const maxPages = Math.max(...Object.values(CA_PAGES));
  // Page 1 for every province first, then deeper pages for the big ones.
  for (let page = 1; page <= maxPages; page++)
    for (const r of CA_REGIONS) if (page <= (CA_PAGES[r] ?? 1)) plan.push({ ...BASE, country: 'CA', region: r, page });
  plan.push({ ...BASE, country: 'CA', q: 'remote' }, { ...BASE, country: 'CA', q: 'remote', page: 2 });
  for (const r of US_REGIONS) plan.push({ ...BASE, country: 'US', region: r });
  plan.push({ ...BASE, country: 'US', q: 'remote' });
  return plan;
}

// ---------- state kept between runs (restored by actions/cache in the workflow) ----------
interface StoredJob { job: JobListing; seenAt: string }
export interface CollectorState {
  version: 1;
  jobs: StoredJob[];
  /** company name → its public boards (empty = none found, re-checked daily) */
  boards: Record<string, { refs: BoardRef[]; checkedAt: string }>;
  /** source → next plan index */
  cursor: Record<string, number>;
  /** source → calls made on `day` (UTC date) */
  usage: Record<string, { day: string; used: number }>;
}
const emptyState = (): CollectorState => ({ version: 1, jobs: [], boards: {}, cursor: {}, usage: {} });

function readState(file: string): CollectorState {
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as CollectorState;
    return s?.version === 1 ? { ...emptyState(), ...s } : emptyState();
  } catch { return emptyState(); }
}

async function runSearchAdapter(a: SourceAdapter, plan: SearchParams[], state: CollectorState, now: number): Promise<{ jobs: JobListing[]; status: SourceStatus }> {
  const t0 = Date.now();
  const skipped = a.skipReason();
  if (skipped) return { jobs: [], status: { source: a.name, ok: false, count: 0, skipped, ms: 0 } };
  let list = plan;
  if (a.name === 'USAJobs') list = plan.filter((p) => p.country === 'US');
  if (a.name === 'Canada Job Bank') list = [{ ...BASE, country: 'CA' }];

  const today = new Date(now).toISOString().slice(0, 10);
  const u = state.usage[a.name]?.day === today ? state.usage[a.name] : { day: today, used: 0 };
  const runs = num('RUNS_PER_DAY', 1);
  const calls = Math.min(list.length, allowance(dailyBudget()[a.name] ?? 24, u.used, now, runs));
  const start = (state.cursor[a.name] ?? 0) % list.length;
  const steps = Array.from({ length: calls }, (_, i) => list[(start + i) % list.length]);

  const jobs: JobListing[] = [];
  let errors = 0, made = 0, lastError = '';
  for (const p of steps) {
    const r = await runAdapter(a, p);
    made++;
    jobs.push(...r.jobs);
    if (r.status.error) { errors++; lastError = r.status.error; if (/\b(401|403|429)\b/.test(lastError)) break; } // bad key or quota: stop
    await sleep((GAP_MS[a.name] ?? 1000) * num('COLLECT_GAP_SCALE', 1));
  }
  state.usage[a.name] = { day: today, used: u.used + made };
  state.cursor[a.name] = (start + made) % list.length;
  const ok = !steps.length || jobs.length > 0 || errors < steps.length;
  return {
    jobs,
    status: {
      source: a.name, ok, count: jobs.length, ms: Date.now() - t0,
      ...(steps.length ? {} : { skipped: 'daily budget used — resumes next run' }),
      ...(errors ? { error: `${errors}/${made} calls failed: ${lastError}` } : {}),
    },
  };
}

function readCompanies(f = join(process.cwd(), 'config', 'companies.txt')): string[] {
  if (!existsSync(f)) return [];
  return readFileSync(f, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/** Employer boards: known boards are fetched directly (1 request); unknown companies are looked up at most once a day. */
async function runCompanyBoards(names: string[], state: CollectorState, now: number): Promise<{ jobs: JobListing[]; status: SourceStatus }> {
  const t0 = Date.now();
  const skipped = atsDiscovery.skipReason();
  if (skipped || !names.length) return { jobs: [], status: { source: atsDiscovery.name, ok: false, count: 0, skipped: skipped ?? 'config/companies.txt is empty', ms: 0 } };
  const jobs: JobListing[] = [];
  let withBoards = 0, lookups = 0;
  const queue = [...names];
  const worker = async () => {
    for (let n = queue.shift(); n; n = queue.shift()) {
      const known = state.boards[n];
      const stale = !known || (!known.refs.length && now - new Date(known.checkedAt).getTime() > 864e5);
      try {
        if (known?.refs.length) {
          let gone = false;
          for (const ref of known.refs) {
            const r = await fetchBoard(ref).catch(() => ({ jobs: [] as JobListing[], name: ref.name })); // network blip: keep the board
            if (r) jobs.push(...r.jobs); else gone = true;
          }
          withBoards++;
          if (gone) state.boards[n] = { refs: [], checkedAt: new Date(0).toISOString() }; // re-discover next run
        } else if (stale) {
          lookups++;
          const r = await discoverCompany(n);
          jobs.push(...r.jobs);
          if (r.boards.length) withBoards++;
          state.boards[n] = { refs: r.boards, checkedAt: new Date(now).toISOString() };
        }
      } catch { /* one company failing never stops the run */ }
      await sleep(200 * num('COLLECT_GAP_SCALE', 1));
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return { jobs, status: { source: atsDiscovery.name, ok: true, count: jobs.length, ms: Date.now() - t0, skipped: `${withBoards} of ${names.length} companies have public boards (${lookups} looked up this run)` } };
}

async function previousSnapshot(): Promise<JobsSnapshot | null> {
  const url = env('PREVIOUS_DATA_URL');
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return r.ok ? ((await r.json()) as JobsSnapshot) : null;
  } catch { return null; }
}

const BOARD_SOURCES = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters']);

/**
 * Merge this run's jobs with jobs seen in earlier runs.
 * Search sources rotate through regions, so their jobs are kept for a few days after last being seen.
 * Employer boards are re-read in full every run, so their jobs drop out within hours of being removed.
 */
export function mergeWithPrevious(fresh: JobListing[], prev: StoredJob[], now: number): StoredJob[] {
  const keepSearchMs = num('KEEP_UNSEEN_DAYS', 3) * 864e5;
  const keepBoardMs = 6 * 3_600_000;
  const seen = new Map<string, string>();
  for (const p of prev) seen.set(p.job.id, p.seenAt);
  const nowIso = new Date(now).toISOString();
  const kept = prev.filter((p) => now - new Date(p.seenAt).getTime() <= (BOARD_SOURCES.has(p.job.source) ? keepBoardMs : keepSearchMs));
  const merged = dedupe([...fresh, ...kept.map((k) => k.job)]);
  const freshIds = new Set(fresh.map((j) => j.id));
  return merged.map((job) => ({ job, seenAt: freshIds.has(job.id) ? nowIso : seen.get(job.id) ?? nowIso }));
}

export async function main(OUT = DEFAULT_OUT, companiesFile?: string) {
  const started = Date.now();
  const now = Date.now();
  const plan = buildPlan();
  const MAX_AGE_DAYS = num('MAX_AGE_DAYS', 60);
  const MAX_JOBS = num('MAX_JOBS', 12000); // keeps the download small enough for phones
  const usedMock = env('USE_MOCK_DATA') === '1' || process.argv.includes('--demo');
  const stateFile = env('STATE_FILE');
  const state = stateFile && !usedMock ? readState(stateFile) : emptyState();
  console.log(`Plan: ${plan.length} searches (Canada first), ${num('RUNS_PER_DAY', 1)} run(s)/day. Daily budgets:`, dailyBudget(), `Carried over: ${state.jobs.length} jobs.`);

  const results = await Promise.all([
    ...SEARCH_ADAPTERS.map((a) => runSearchAdapter(a, plan, state, now)),
    ...BOARD_ADAPTERS.map((a) => runAdapter(a, { ...BASE, country: 'ALL' })),
    runCompanyBoards(readCompanies(companiesFile), state, now),
  ]);
  const fresh = results.flatMap((r) => r.jobs);
  const statuses = results.map((r) => r.status);
  if (usedMock) fresh.push(...mockJobs());

  const cutoff = now - MAX_AGE_DAYS * 864e5;
  const inScope = (j: JobListing) => (j.location.country === 'CA' || j.location.country === 'US') && new Date(j.postedAt).getTime() >= cutoff;
  let stored = mergeWithPrevious(dedupe(fresh).filter(inScope), state.jobs, now).filter((s) => inScope(s.job));

  // Safety net: nothing at all (e.g. first run with every source failing) → keep what's live now.
  if (!stored.length && !usedMock) {
    const prev = await previousSnapshot();
    if (prev?.jobs?.length) {
      console.warn(`No jobs collected this run — keeping ${prev.jobs.length} jobs from the previous publish.`);
      stored = prev.jobs.filter(inScope).map((job) => ({ job, seenAt: job.seenAt ?? prev.updatedAt }));
    }
  }

  // Canada first, newest first; trim to the size cap.
  stored.sort((a, b) => (a.job.location.country === 'CA' ? 0 : 1) - (b.job.location.country === 'CA' ? 0 : 1) || +new Date(b.job.postedAt) - +new Date(a.job.postedAt));
  stored = stored.slice(0, MAX_JOBS);
  const jobs = stored.map((s) => ({ ...s.job, seenAt: s.seenAt }));

  if (stateFile && !usedMock) {
    state.jobs = stored;
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify(state));
  }

  const updatedAt = new Date().toISOString();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'desc'), { recursive: true });

  const shards: Record<string, Record<string, string>> = {};
  const list = jobs.map((j) => {
    const { description, ...rest } = j;
    if (description) (shards[j.id.slice(0, 2)] ??= {})[j.id] = description;
    return rest;
  });
  for (const [k, v] of Object.entries(shards)) writeFileSync(join(OUT, 'desc', `${k}.json`), JSON.stringify(v));

  const snapshot: JobsSnapshot = { updatedAt, usedMock, sources: statuses, jobs: list };
  writeFileSync(join(OUT, 'jobs.json'), JSON.stringify(snapshot));

  const stats: StatsSnapshot = {
    CA: computeStats(jobs.filter((j) => j.location.country === 'CA'), statuses, usedMock, updatedAt),
    US: computeStats(jobs.filter((j) => j.location.country === 'US'), statuses, usedMock, updatedAt),
    ALL: computeStats(jobs, statuses, usedMock, updatedAt),
  };
  writeFileSync(join(OUT, 'stats.json'), JSON.stringify(stats));

  const sources: SourcesSnapshot = {
    updatedAt,
    sources: listSources().map((s) => {
      const st = statuses.find((x) => x.source === s.name);
      return { ...s, count: st?.count, error: st?.error };
    }),
  };
  writeFileSync(join(OUT, 'sources.json'), JSON.stringify(sources));

  const ca = jobs.filter((j) => j.location.country === 'CA').length;
  const newThisRun = new Set(fresh.map((j) => j.id)).size;
  const lines = [
    `## Jobvexa data refresh`,
    `**${jobs.length}** jobs live (${ca} Canada, ${jobs.length - ca} USA). ${newThisRun} fetched this run; ${state.jobs.length ? 'the rest carried over from recent runs' : 'no earlier data'}. Took ${Math.round((Date.now() - started) / 1000)}s.`,
    '', '| Source | Jobs this run | Status |', '|---|---|---|',
    ...statuses.map((s) => `| ${s.source} | ${s.count} | ${s.ok ? 'ok' : ''}${s.skipped ? ` ${s.skipped}` : ''}${s.error ? ` ⚠️ ${s.error}` : ''} |`),
  ];
  console.log(lines.join('\n'));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n');
  if (!jobs.length) console.warn('WARNING: 0 jobs. Add API keys as repository secrets (see README), or check config/companies.txt.');
  return { jobs: jobs.length, canada: ca, statuses };
}

// Only run when executed directly (not when imported by tests).
if (process.argv[1] && /collect\.ts$/.test(process.argv[1])) {
  loadDotEnv();
  main().catch((e) => { console.error(e); process.exit(1); });
}
