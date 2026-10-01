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
import { BOARD_ADAPTERS, FEED_ADAPTERS, SEARCH_ADAPTERS, atsDiscovery, dedupe, listSources, runAdapter } from '@/lib/aggregator';
import { discoverCompany, fetchBoard, type BoardRef } from '@/lib/aggregator/sources/discovery';
import { jobBankRobots } from '@/lib/aggregator/sources/jobbank';
import { EMPTY_KEYWORDS, parseKeywordsFile, tagJob, type KeywordConfig } from '@/lib/aggregator/keywords';
import { generateJobFingerprint } from '@/lib/aggregator/fingerprint';
import { DEFAULT_SETS } from '@/lib/aggregator/presets';
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
  'Canada Job Bank': num('DAILY_CALLS_JOBBANK', 240), // public RSS feed; robots.txt crawl-delay honoured
  Himalayas: num('DAILY_CALLS_HIMALAYAS', 48),
  Adzuna: num('DAILY_CALLS_ADZUNA', 240), // free tier ≈ 250/day
  JSearch: num('DAILY_CALLS_JSEARCH', 6), // free tier is monthly and small — raise on a paid plan
  Jooble: num('DAILY_CALLS_JOOBLE', 100),
  USAJobs: num('DAILY_CALLS_USAJOBS', 200),
});
const GAP_MS: Record<string, number> = { Adzuna: 2600, JSearch: 1200, Jooble: 1200, USAJobs: 800, 'Canada Job Bank': 5000, Himalayas: 3000 };

/** How many calls this run may make, given today's usage. */
export function allowance(daily: number, usedToday: number, now: number, runsPerDay: number): number {
  const slot = Math.floor((now % 864e5) / (864e5 / runsPerDay)); // UTC slot of the day
  // Spend evenly: by the end of slot s we may have used (s+1)/runs of the day's budget.
  // Small budgets (e.g. 6/day) get one call every few hours; missed runs are caught up later.
  const target = Math.floor(((slot + 1) * daily) / runsPerDay);
  return Math.max(0, Math.min(daily, target) - usedToday);
}

/** Hours until a source with a small daily budget gets its next call. */
export function hoursUntilNextCall(daily: number, usedToday: number, now: number, runsPerDay: number): number {
  const slotH = 24 / runsPerDay;
  const slot = Math.floor((now % 864e5) / (864e5 / runsPerDay));
  for (let s = slot + 1; s < runsPerDay; s++) if (Math.floor(((s + 1) * daily) / runsPerDay) > usedToday) return Math.round((s - slot) * slotH);
  return Math.round((runsPerDay - slot) * slotH);
}

const BASE: SearchParams = {
  q: '', country: 'CA', region: '', city: '', industry: 'all', workType: 'all', employmentType: 'all', company: '',
  level: 'all', skills: [], certs: [], tools: [], sort: 'newest', page: 1, pageSize: 50,
};

// Canada first: provinces get most of the broad searches, biggest job markets get more pages.
const CA_REGIONS = ['ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'YT', 'NU'];
const CA_PAGES: Record<string, number> = { ON: 8, QC: 5, BC: 5, AB: 5, MB: 3, SK: 3, NS: 3, NB: 2, NL: 2 };
const US_REGIONS = ['CA', 'TX', 'NY', 'FL', 'IL', 'WA', 'MA', 'GA', 'NC', 'PA', 'OH', 'VA', 'NJ', 'MI', 'AZ', 'CO', 'MN', 'TN', 'OR', 'MD'];
/** Major Canadian job markets used for priority keyword searches. */
export const CA_CITIES: [string, string][] = [['Toronto', 'ON'], ['Ottawa', 'ON'], ['Waterloo', 'ON'], ['Mississauga', 'ON'], ['Vancouver', 'BC'], ['Calgary', 'AB'], ['Edmonton', 'AB'], ['Montreal', 'QC'], ['Halifax', 'NS'], ['Winnipeg', 'MB']];

/** Broad plan (no keyword): every province, then Canada remote, then US states and US remote. */
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

/**
 * Keyword plans.
 *  core: priority keywords across Canada (pages 1–3) and Canada-remote — searched most often.
 *  more: priority keywords in 10 major Canadian cities, then general keywords in Canada,
 *        then priority keywords in the USA (+ remote), then general keywords in the USA.
 */
export function buildKeywordPlans(kw: Pick<KeywordConfig, 'priority' | 'general'>): { core: SearchParams[]; more: SearchParams[] } {
  const core: SearchParams[] = [];
  for (let page = 1; page <= 3; page++) for (const q of kw.priority) core.push({ ...BASE, country: 'CA', q, page });
  for (const q of kw.priority) core.push({ ...BASE, country: 'CA', q: `${q} remote`, workType: 'remote' });
  const more: SearchParams[] = [];
  for (const [city, region] of CA_CITIES) for (const q of kw.priority) more.push({ ...BASE, country: 'CA', q, city, region });
  for (const q of kw.general) more.push({ ...BASE, country: 'CA', q });
  for (const q of kw.priority) more.push({ ...BASE, country: 'US', q }, { ...BASE, country: 'US', q: `${q} remote`, workType: 'remote' });
  for (const q of kw.general) more.push({ ...BASE, country: 'US', q });
  return { core, more };
}

/** Split a run's calls between lanes by share (largest remainder), skipping empty lanes. */
export function splitCalls(total: number, lanes: { key: string; size: number; share: number }[]): Record<string, number> {
  const live = lanes.filter((l) => l.size > 0 && l.share > 0);
  const sum = live.reduce((a, l) => a + l.share, 0) || 1;
  const raw = live.map((l) => ({ key: l.key, size: l.size, exact: (total * l.share) / sum }));
  const out: Record<string, number> = Object.fromEntries(raw.map((r) => [r.key, Math.min(r.size, Math.floor(r.exact))]));
  let left = total - Object.values(out).reduce((a, b) => a + b, 0);
  const order = [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1));
  while (left > 0 && order.some((r) => out[r.key] < r.size)) {
    for (const r of order) { if (left > 0 && out[r.key] < r.size) { out[r.key]++; left--; } }
  }
  return out;
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
  /** source → last run with at least one successful call */
  lastSuccess?: Record<string, string>;
  /** feed source → last time it was called */
  lastRun?: Record<string, string>;
}
const emptyState = (): CollectorState => ({ version: 1, jobs: [], boards: {}, cursor: {}, usage: {} });

function readState(file: string): CollectorState {
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as CollectorState;
    return s?.version === 1 ? { ...emptyState(), ...s } : emptyState();
  } catch { return emptyState(); }
}

export interface KeywordStat { calls: number; fetched: number }

/** Keyword a plan item is for ('' = broad search). */
export const keywordOf = (p: SearchParams) => p.q.replace(/\s+remote$/, '').trim();

async function runSearchAdapter(a: SourceAdapter, lanes: Record<string, SearchParams[]>, state: CollectorState, now: number, kwStats: Map<string, KeywordStat>): Promise<{ jobs: JobListing[]; status: SourceStatus }> {
  const t0 = Date.now();
  const skipped = a.skipReason();
  if (skipped) return { jobs: [], status: { source: a.name, ok: false, count: 0, skipped, ms: 0 } };
  // Which searches this source can serve.
  const fit = (p: SearchParams) =>
    a.name === 'USAJobs' ? p.country === 'US' : a.name === 'Canada Job Bank' ? p.country === 'CA' : true;
  const lists: Record<string, SearchParams[]> = Object.fromEntries(Object.entries(lanes).map(([k, v]) => [k, v.filter(fit)]));
  if (a.name === 'JSearch') { lists.more = []; lists.broad = []; } // tiny quota: spend it on priority keywords
  if (a.name === 'Himalayas') { lists.more = lists.more.filter((p) => !p.city); lists.broad = lists.broad.filter((p) => !p.region); } // remote-only board: no city/province searches

  const today = new Date(now).toISOString().slice(0, 10);
  const u = state.usage[a.name]?.day === today ? state.usage[a.name] : { day: today, used: 0 };
  const runs = num('RUNS_PER_DAY', 1);
  const totalSize = Object.values(lists).reduce((n, l) => n + l.length, 0);
  const allowed = Math.min(totalSize, allowance(dailyBudget()[a.name] ?? 24, u.used, now, runs));
  const split = splitCalls(allowed, [
    { key: 'core', size: lists.core?.length ?? 0, share: num('SHARE_CORE', 0.35) },
    { key: 'more', size: lists.more?.length ?? 0, share: num('SHARE_MORE', 0.25) },
    { key: 'broad', size: lists.broad?.length ?? 0, share: num('SHARE_BROAD', 0.4) },
  ]);
  const steps: SearchParams[] = [];
  for (const [lane, n] of Object.entries(split)) {
    const list = lists[lane];
    const ck = `${a.name}:${lane}`;
    const start = (state.cursor[ck] ?? 0) % list.length;
    for (let i = 0; i < n; i++) steps.push(list[(start + i) % list.length]);
    state.cursor[ck] = (start + n) % list.length;
  }

  const jobs: JobListing[] = [];
  let errors = 0, made = 0, lastError = '';
  for (const p of steps) {
    const r = await runAdapter(a, p);
    made++;
    jobs.push(...r.jobs);
    const k = keywordOf(p);
    if (k) { const s = kwStats.get(k) ?? { calls: 0, fetched: 0 }; s.calls++; s.fetched += r.jobs.length; kwStats.set(k, s); }
    if (r.status.error) { errors++; lastError = r.status.error; if (/\b(401|403|429)\b/.test(lastError)) break; } // bad key or quota: stop
    await sleep(Math.max(GAP_MS[a.name] ?? 1000, a.name === 'Canada Job Bank' ? ((await jobBankRobots().catch(() => null))?.crawlDelaySec ?? 0) * 1000 : 0) * num('COLLECT_GAP_SCALE', 1));
  }
  state.usage[a.name] = { day: today, used: u.used + made };
  if (made > errors) (state.lastSuccess ??= {})[a.name] = new Date(now).toISOString();
  const ok = !steps.length || jobs.length > 0 || errors < steps.length;
  return {
    jobs,
    status: {
      source: a.name, ok, count: jobs.length, ms: Date.now() - t0,
      calls: made, budgetToday: dailyBudget()[a.name] ?? 24, usedToday: u.used + made,
      ...(steps.length ? {} : { skipped: u.used + made >= (dailyBudget()[a.name] ?? 24) ? 'daily budget used — resumes tomorrow (UTC)' : `small daily quota is spread over the day — next call in about ${hoursUntilNextCall(dailyBudget()[a.name] ?? 24, u.used, now, runs)} h` }),
      ...(errors ? { error: `${errors}/${made} calls failed: ${lastError}` } : {}),
    },
  };
}

export function loadKeywords(dir = join(process.cwd(), 'config')): KeywordConfig {
  const cfg: KeywordConfig = { ...EMPTY_KEYWORDS, aliases: {} };
  try { Object.assign(cfg, parseKeywordsFile(readFileSync(join(dir, 'keywords.txt'), 'utf8'))); } catch { /* optional */ }
  try { cfg.aliases = JSON.parse(readFileSync(join(dir, 'aliases.json'), 'utf8')); } catch { /* optional */ }
  return cfg;
}

/** Whole-feed sources: called at most once every `everyHours` (respects rules like Remotive's 4/day). */
async function runFeedAdapter(a: SourceAdapter, everyHours: number, state: CollectorState, now: number): Promise<{ jobs: JobListing[]; status: SourceStatus }> {
  const last = state.lastRun?.[a.name];
  if (last && now - new Date(last).getTime() < everyHours * 3_600_000 - 5 * 60_000) {
    return { jobs: [], status: { source: a.name, ok: true, count: 0, calls: 0, skipped: `checked ${Math.round((now - new Date(last).getTime()) / 3_600_000)} h ago; next check after ${everyHours} h (jobs kept from last time)`, ms: 0 } };
  }
  const r = await runAdapter(a, { ...BASE, country: 'ALL' });
  if (!r.status.skipped) (state.lastRun ??= {})[a.name] = new Date(now).toISOString();
  return { jobs: r.jobs, status: { ...r.status, calls: r.status.skipped ? 0 : 1 } };
}

function readCompanies(f = join(process.cwd(), 'config', 'companies.txt')): string[] {
  if (!existsSync(f)) return [];
  const seen = new Set<string>();
  return readFileSync(f, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()));
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
        } else if (stale && lookups < num('MAX_LOOKUPS_PER_RUN', 40)) {
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

export interface CoverageReport {
  updatedAt: string;
  runSeconds: number;
  totals: { jobs: number; canada: number; fetchedThisRun: number };
  sources: { source: string; ok: boolean; jobsThisRun: number; calls?: number; budgetToday?: number; usedToday?: number; lastSuccess?: string; error?: string; note?: string }[];
  keywords: { keyword: string; tier: 'priority' | 'general'; jobsNow: number; canada: number; callsThisRun: number; fetchedThisRun: number; thin: boolean }[];
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function rssFeed(title: string, link: string, items: JobListing[], site: string): string {
  const it = items.map((j) => {
    const url = `${site}/job/?id=${j.id}`;
    const where = [j.location.city, j.location.stateProvince, j.location.country].filter(Boolean).join(', ');
    return `<item><title>${xml(`${j.title} — ${j.company} (${where})`)}</title><link>${xml(url)}</link><guid isPermaLink="false">${j.id}</guid><pubDate>${new Date(j.postedAt).toUTCString()}</pubDate><description>${xml(j.descriptionSnippet)}</description></item>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(title)}</title><link>${xml(link)}</link><description>${xml(title)} — new jobs, Canada first. Refreshed hourly.</description><lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${it}</channel></rss>`;
}

const BOARD_SOURCES = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee']);

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
  // Re-key older jobs so improvements to the fingerprint never leave duplicates behind.
  const rekeyed = prev.map((p) => ({ ...p, job: { ...p.job, id: generateJobFingerprint({ title: p.job.title, company: p.job.company, city: p.job.location.city, stateProvince: p.job.location.stateProvince }) } }));
  const kept = rekeyed.filter((p) => now - new Date(p.seenAt).getTime() <= (BOARD_SOURCES.has(p.job.source) ? keepBoardMs : keepSearchMs));
  for (const p of rekeyed) if (!seen.has(p.job.id) || seen.get(p.job.id)! < p.seenAt) seen.set(p.job.id, p.seenAt);
  const merged = dedupe([...fresh, ...kept.map((k) => k.job)]);
  const freshIds = new Set(fresh.map((j) => j.id));
  return merged.map((job) => ({ job, seenAt: freshIds.has(job.id) ? nowIso : seen.get(job.id) ?? nowIso }));
}

export async function main(OUT = DEFAULT_OUT, companiesFile?: string, now = Date.now(), configDir = join(process.cwd(), 'config')) {
  const started = Date.now();
  const plan = buildPlan();
  const kw = loadKeywords(configDir);
  const { core, more } = buildKeywordPlans(kw);
  const lanes = { core, more, broad: plan };
  const kwStats = new Map<string, KeywordStat>();
  const MAX_AGE_DAYS = num('MAX_AGE_DAYS', 60);
  const MAX_JOBS = num('MAX_JOBS', 15000); // keeps the download small enough for phones (Canada kept first)
  const usedMock = env('USE_MOCK_DATA') === '1' || process.argv.includes('--demo');
  const stateFile = env('STATE_FILE');
  const state = stateFile && !usedMock ? readState(stateFile) : emptyState();
  console.log(`Plans: ${core.length} priority-keyword + ${more.length} more keyword + ${plan.length} broad searches (Canada first), ${num('RUNS_PER_DAY', 1)} run(s)/day. Daily budgets:`, dailyBudget(), `Carried over: ${state.jobs.length} jobs.`);

  const results = await Promise.all([
    ...SEARCH_ADAPTERS.map((a) => runSearchAdapter(a, lanes, state, now, kwStats)),
    ...BOARD_ADAPTERS.map((a) => runAdapter(a, { ...BASE, country: 'ALL' })),
    runCompanyBoards(readCompanies(companiesFile ?? join(configDir, 'companies.txt')), state, now),
    ...FEED_ADAPTERS.map((f) => runFeedAdapter(f.adapter, f.everyHours, state, now)),
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
  const jobs = stored.map((s) => {
    const tags = tagJob(s.job.title, `${s.job.descriptionSnippet} ${s.job.description ?? ''}`, kw);
    return { ...s.job, seenAt: s.seenAt, ...(tags.length ? { tags } : { tags: undefined }) };
  });
  for (const st of statuses) {
    if (st.ok && st.count > 0) (state.lastSuccess ??= {})[st.source] = new Date(now).toISOString();
    const ls = state.lastSuccess?.[st.source]; if (ls) st.lastSuccess = ls;
  }

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

  // Keywords + synonyms for the website's search box and saved sets.
  writeFileSync(join(OUT, 'keywords.json'), JSON.stringify(kw));

  // Coverage report: calls vs budget per source, results per keyword, thin keywords.
  const THIN = num('THIN_KEYWORD_THRESHOLD', 10);
  const coverage: CoverageReport = {
    updatedAt,
    runSeconds: Math.round((Date.now() - started) / 1000),
    totals: { jobs: jobs.length, canada: jobs.filter((j) => j.location.country === 'CA').length, fetchedThisRun: new Set(fresh.map((j) => j.id)).size },
    sources: statuses.map((st) => ({ source: st.source, ok: st.ok, jobsThisRun: st.count, calls: st.calls, budgetToday: st.budgetToday, usedToday: st.usedToday, lastSuccess: st.lastSuccess, error: st.error, note: st.skipped })),
    keywords: [...kw.priority.map((k) => ({ k, tier: 'priority' as const })), ...kw.general.map((k) => ({ k, tier: 'general' as const }))].map(({ k, tier }) => {
      const matching = jobs.filter((j) => j.tags?.includes(k));
      const st = kwStats.get(k);
      return { keyword: k, tier, jobsNow: matching.length, canada: matching.filter((j) => j.location.country === 'CA').length, callsThisRun: st?.calls ?? 0, fetchedThisRun: st?.fetched ?? 0, thin: matching.length < THIN };
    }),
  };
  writeFileSync(join(OUT, 'coverage.json'), JSON.stringify(coverage));

  // RSS alert feeds, one per keyword set (subscribe in any RSS reader or email-by-RSS service).
  mkdirSync(join(OUT, 'feeds'), { recursive: true });
  const site = (env('SITE_URL') || env('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000').replace(/\/$/, '');
  for (const set of DEFAULT_SETS) {
    const items = jobs.filter((j) => j.tags?.some((t) => set.keywords.includes(t))).slice(0, 60);
    writeFileSync(join(OUT, 'feeds', `${set.id}.xml`), rssFeed(`Jobvexa — ${set.name}`, `${site}/?set=${set.id}`, items, site));
  }


  const ca = jobs.filter((j) => j.location.country === 'CA').length;
  const newThisRun = new Set(fresh.map((j) => j.id)).size;
  const lines = [
    `## Jobvexa data refresh`,
    `**${jobs.length}** jobs live (${ca} Canada, ${jobs.length - ca} USA). ${newThisRun} fetched this run; ${state.jobs.length ? 'the rest carried over from recent runs' : 'no earlier data'}. Took ${Math.round((Date.now() - started) / 1000)}s.`,
    '', '| Source | Jobs this run | Status |', '|---|---|---|',
    ...statuses.map((s) => `| ${s.source} | ${s.count}${s.calls !== undefined ? ` (${s.calls} calls, ${s.usedToday}/${s.budgetToday} today)` : ''} | ${s.ok ? 'ok' : ''}${s.skipped ? ` ${s.skipped}` : ''}${s.error ? ` ⚠️ ${s.error}` : ''} |`),
    '', '| Keyword | Jobs on site | Canada | Searches this run | Status |', '|---|---|---|---|---|',
    ...coverage.keywords.map((k) => `| ${k.keyword} | ${k.jobsNow} | ${k.canada} | ${k.callsThisRun} | ${k.thin ? '⚠️ thin' : 'ok'} |`),
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
