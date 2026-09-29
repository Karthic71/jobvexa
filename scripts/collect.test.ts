import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowance, buildPlan, main, mergeWithPrevious } from './collect';
import { mockJobs } from '../lib/aggregator/sources/mock';

test('plan covers every province before any US state', () => {
  const plan = buildPlan();
  const firstUS = plan.findIndex((p) => p.country === 'US');
  const caRegions = new Set(plan.slice(0, firstUS).map((p) => p.region).filter(Boolean));
  assert.equal(caRegions.size, 13);
  assert.ok(plan.slice(firstUS).every((p) => p.country === 'US'));
  assert.deepEqual(plan.slice(0, 13).map((p) => p.page), Array(13).fill(1), 'page 1 of all provinces comes first');
});

test('collector end to end with mocked sources writes the site data', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jobvexa-'));
  const companies = join(dir, 'companies.txt');
  writeFileSync(companies, '# test\nAcme Corp\nNobody Inc\n');
  const saved = { ...process.env };
  Object.assign(process.env, { ADZUNA_APP_ID: 'x', ADZUNA_APP_KEY: 'y', DAILY_CALLS_ADZUNA: '2', RUNS_PER_DAY: '1', COLLECT_GAP_SCALE: '0', USE_MOCK_DATA: '0' });
  for (const k of ['RAPIDAPI_KEY', 'JOOBLE_API_KEY', 'USAJOBS_API_KEY', 'JOBBANK_FEED_URL', 'GREENHOUSE_BOARDS', 'LEVER_COMPANIES', 'ASHBY_BOARDS']) delete process.env[k];
  const real = globalThis.fetch;
  const calls: string[] = [];
  const now = new Date().toISOString();
  globalThis.fetch = (async (input: string | URL) => {
    const u = String(input); calls.push(u);
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.includes('api.adzuna.com')) return ok({ results: [
      { title: 'Registered Nurse', description: '<p>Patient care in Toronto</p>', redirect_url: 'https://www.adzuna.ca/land/ad/1', created: now, salary_min: 40, salary_max: 50, company: { display_name: 'Toronto General' }, location: { display_name: 'Toronto, Ontario', area: ['Canada', 'Ontario', 'Toronto'] } },
      { title: 'Old Job', description: 'x', redirect_url: 'https://www.adzuna.ca/land/ad/2', created: '2020-01-01T00:00:00Z', company: { display_name: 'Old Co' }, location: { area: ['Canada', 'Ontario', 'Ottawa'] } },
    ] });
    if (u.endsWith('/v1/boards/acmecorp')) return ok({ name: 'Acme Corp' });
    if (u.includes('/v1/boards/acmecorp/jobs')) return ok({ jobs: [
      { title: 'Registered Nurse', location: { name: 'Toronto, ON' }, absolute_url: 'https://boards.greenhouse.io/acmecorp/jobs/9', updated_at: now, content: '&lt;p&gt;Full description here&lt;/p&gt;' },
      { title: 'Warehouse Lead', location: { name: 'Calgary, Alberta' }, absolute_url: 'https://boards.greenhouse.io/acmecorp/jobs/10', updated_at: now },
    ] });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  try {
    const r = await main(join(dir, 'data'), companies);
    const snap = JSON.parse(readFileSync(join(dir, 'data', 'jobs.json'), 'utf8'));
    assert.equal(r.jobs, 3, 'two different nurse jobs + warehouse; the 2020 job is dropped as too old');
    assert.ok(snap.jobs.every((j: { description?: string }) => j.description === undefined), 'descriptions are not in the list file');
    assert.ok(snap.jobs.every((j: { location: { country: string } }) => j.location.country === 'CA'));
    assert.equal(calls.filter((c) => c.includes('adzuna')).length, 2, 'budget respected');
    const shards = readdirSync(join(dir, 'data', 'desc'));
    assert.ok(shards.length >= 1);
    const acme = snap.jobs.find((j: { company: string; title: string }) => j.company === 'Acme Corp' && j.title === 'Registered Nurse');
    const shard = JSON.parse(readFileSync(join(dir, 'data', 'desc', `${acme.id.slice(0, 2)}.json`), 'utf8'));
    assert.match(shard[acme.id], /Full description/);
    const stats = JSON.parse(readFileSync(join(dir, 'data', 'stats.json'), 'utf8'));
    assert.equal(stats.CA.total, 3); assert.equal(stats.US.total, 0);
    const sources = JSON.parse(readFileSync(join(dir, 'data', 'sources.json'), 'utf8'));
    assert.ok(sources.sources.find((s: { id: string; enabled: boolean }) => s.id === 'adzuna').enabled);
    assert.ok(!JSON.stringify(sources).includes('"y"'), 'no secret values written');
  } finally {
    globalThis.fetch = real;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

test('daily budgets are spread across hourly runs and never exceeded', () => {
  const day = Date.UTC(2026, 8, 29);
  let used = 0;
  for (let h = 0; h < 24; h++) used += allowance(240, used, day + h * 3_600_000 + 60_000, 24);
  assert.equal(used, 240);
  used = 0;
  for (let h = 0; h < 24; h++) used += allowance(6, used, day + h * 3_600_000 + 60_000, 24);
  assert.equal(used, 6, 'small quotas are used up by the end of the day, not exceeded');
  assert.equal(allowance(240, 240, day + 5 * 3_600_000, 24), 0);
});

test('jobs carry over between runs and expire when no longer seen', () => {
  const now = Date.now();
  const [a, b] = mockJobs();
  const board = { ...b, id: 'b'.repeat(20), source: 'greenhouse' as const };
  const prev = [
    { job: { ...a, source: 'adzuna' as const }, seenAt: new Date(now - 2 * 864e5).toISOString() }, // search source, 2 days → kept
    { job: { ...a, id: 'c'.repeat(20), source: 'adzuna' as const }, seenAt: new Date(now - 5 * 864e5).toISOString() }, // 5 days → dropped
    { job: board, seenAt: new Date(now - 12 * 3_600_000).toISOString() }, // board job gone for 12h → dropped
  ];
  const out = mergeWithPrevious([], prev, now);
  assert.deepEqual(out.map((o) => o.job.id), [a.id]);
  const again = mergeWithPrevious([{ ...a, source: 'adzuna' }], prev, now);
  assert.equal(again.find((o) => o.job.id === a.id)!.seenAt, new Date(now).toISOString(), 'seen again → timestamp refreshed');
});

test('hourly runs rotate through the plan and remember state', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jobvexa-state-'));
  const companies = join(dir, 'companies.txt');
  writeFileSync(companies, 'Acme Corp\n');
  const saved = { ...process.env };
  Object.assign(process.env, { ADZUNA_APP_ID: 'x', ADZUNA_APP_KEY: 'y', DAILY_CALLS_ADZUNA: '48', RUNS_PER_DAY: '24', COLLECT_GAP_SCALE: '0', STATE_FILE: join(dir, 'state.json'), USE_MOCK_DATA: '0' });
  const real = globalThis.fetch;
  const adzunaUrls: string[] = []; let boardMeta = 0, boardJobs = 0;
  globalThis.fetch = (async (input: string | URL) => {
    const u = String(input);
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.includes('api.adzuna.com')) {
      adzunaUrls.push(u);
      const n = adzunaUrls.length;
      return ok({ results: [{ title: `Job ${n}`, description: 'x', redirect_url: `https://www.adzuna.ca/land/ad/${n}`, created: new Date().toISOString(), company: { display_name: `Co ${n}` }, location: { area: ['Canada', 'Ontario', 'Toronto'] } }] });
    }
    if (u.endsWith('/v1/boards/acmecorp')) { boardMeta++; return ok({ name: 'Acme Corp' }); }
    if (u.includes('/v1/boards/acmecorp/jobs')) { boardJobs++; return ok({ jobs: [{ title: 'Board Job', location: { name: 'Toronto, ON' }, absolute_url: 'https://boards.greenhouse.io/acmecorp/jobs/1', updated_at: new Date().toISOString() }] }); }
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    const r1 = await main(join(dir, 'd1'), companies);
    const r2 = await main(join(dir, 'd2'), companies);
    assert.ok(adzunaUrls.length >= 2 && adzunaUrls.length <= 48);
    const key = (u: string) => { const x = new URL(u); return `${x.pathname}|${x.searchParams.get('where')}|${x.searchParams.get('what')}`; };
    assert.equal(new Set(adzunaUrls.map(key)).size, adzunaUrls.length, 'no search repeated while rotating');
    assert.ok(r2.jobs > r1.jobs, `run 2 keeps run 1 jobs (${r1.jobs} → ${r2.jobs})`);
    assert.equal(boardMeta, 1, 'company board looked up once, then remembered');
    assert.equal(boardJobs, 2, 'known board fetched every run');
  } finally {
    globalThis.fetch = real;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
