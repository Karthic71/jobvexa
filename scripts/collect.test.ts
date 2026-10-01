import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowance, buildKeywordPlans, buildPlan, loadKeywords, main, mergeWithPrevious, rssFeed, splitCalls } from './collect';
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
  Object.assign(process.env, { ADZUNA_APP_ID: 'x', ADZUNA_APP_KEY: 'y', DAILY_CALLS_ADZUNA: '2', RUNS_PER_DAY: '1', COLLECT_GAP_SCALE: '0', USE_MOCK_DATA: '0', DISABLE_JOBBANK: 'true' });
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
  Object.assign(process.env, { ADZUNA_APP_ID: 'x', ADZUNA_APP_KEY: 'y', DAILY_CALLS_ADZUNA: '48', RUNS_PER_DAY: '24', COLLECT_GAP_SCALE: '0', STATE_FILE: join(dir, 'state.json'), USE_MOCK_DATA: '0', DISABLE_JOBBANK: 'true' });
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
    const t0 = Date.UTC(2026, 8, 29, 0, 30); // fixed time of day keeps the hourly allowance predictable
    const r1 = await main(join(dir, 'd1'), companies, t0);
    const r2 = await main(join(dir, 'd2'), companies, t0 + 3_600_000);
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

test('keyword plans: priority keywords across Canada first, then cities, general, USA', () => {
  const plans = buildKeywordPlans({ priority: ['soc analyst', 'devops engineer'], general: ['nurse'] });
  assert.equal(plans.core.length, 2 * 3 + 2, '3 Canada-wide pages + remote per priority keyword');
  assert.ok(plans.core.every((p) => p.country === 'CA'));
  assert.equal(plans.core.at(-1)!.q, 'devops engineer remote');
  const firstUS = plans.more.findIndex((p) => p.country === 'US');
  assert.ok(plans.more.slice(0, firstUS).every((p) => p.country === 'CA'));
  assert.ok(plans.more.some((p) => p.city === 'Toronto' && p.q === 'soc analyst'));
  const cfg = loadKeywords(join(process.cwd(), 'config'));
  assert.ok(cfg.priority.includes('soc analyst') && cfg.general.length > 5 && cfg.aliases['site reliability engineer'].includes('sre'));
});

test('calls are split between lanes by share and never exceed a lane', () => {
  assert.deepEqual(splitCalls(10, [{ key: 'core', size: 50, share: 0.35 }, { key: 'more', size: 50, share: 0.25 }, { key: 'broad', size: 50, share: 0.4 }]), { core: 4, more: 2, broad: 4 });
  assert.deepEqual(splitCalls(10, [{ key: 'core', size: 2, share: 0.35 }, { key: 'more', size: 0, share: 0.25 }, { key: 'broad', size: 50, share: 0.4 }]), { core: 2, broad: 8 });
  assert.deepEqual(splitCalls(0, [{ key: 'core', size: 2, share: 1 }]), { core: 0 });
});

test('RSS feed is valid-looking XML with escaped text', () => {
  const [j] = mockJobs();
  const x = rssFeed('Jobvexa <SOC>', 'https://x/?set=soc', [{ ...j, title: 'A & B' }], 'https://x');
  assert.match(x, /^<\?xml/);
  assert.ok(x.includes('A &amp; B') && x.includes('Jobvexa &lt;SOC&gt;') && x.includes(`https://x/job/?id=${j.id}`));
});

test('collector writes coverage, keywords and alert feeds; jobs get keyword tags', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jobvexa-kw-'));
  const cfgDir = join(dir, 'config');
  const { mkdirSync } = await import('node:fs');
  mkdirSync(cfgDir);
  writeFileSync(join(cfgDir, 'keywords.txt'), '[priority]\nsoc analyst\n[general]\nnurse\n');
  writeFileSync(join(cfgDir, 'aliases.json'), JSON.stringify({ 'soc analyst': ['security operations analyst'] }));
  writeFileSync(join(cfgDir, 'companies.txt'), '');
  const saved = { ...process.env };
  Object.assign(process.env, { ADZUNA_APP_ID: 'x', ADZUNA_APP_KEY: 'y', DAILY_CALLS_ADZUNA: '10', RUNS_PER_DAY: '1', COLLECT_GAP_SCALE: '0', DISABLE_JOBBANK: 'true', USE_MOCK_DATA: '0', SITE_URL: 'https://karthic71.github.io/jobvexa' });
  for (const k of ['RAPIDAPI_KEY', 'OPENWEBNINJA_API_KEY', 'JOOBLE_API_KEY', 'USAJOBS_API_KEY', 'STATE_FILE']) delete process.env[k];
  const real = globalThis.fetch;
  const whats: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const u = new URL(String(input));
    if (u.hostname === 'api.adzuna.com') {
      whats.push(u.searchParams.get('what') ?? '');
      const n = whats.length;
      return new Response(JSON.stringify({ results: [{ title: n % 2 ? 'Security Operations Analyst' : 'Registered Nurse', description: 'Monitor SIEM alerts. Must be a Canadian citizen.', redirect_url: `https://www.adzuna.ca/land/ad/${n}`, created: new Date().toISOString(), salary_max: 80000, company: { display_name: `Co ${n}` }, location: { area: ['Canada', 'Ontario', 'Toronto'] } }] }), { status: 200 });
    }
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    await main(join(dir, 'out'), undefined, Date.UTC(2026, 8, 29, 0, 30), cfgDir);
    assert.ok(whats.includes('soc analyst'), 'priority keyword searched');
    const cov = JSON.parse(readFileSync(join(dir, 'out', 'coverage.json'), 'utf8'));
    const soc = cov.keywords.find((k: { keyword: string }) => k.keyword === 'soc analyst');
    assert.ok(soc.callsThisRun >= 1 && soc.jobsNow >= 1, 'alias "security operations analyst" counted for soc analyst');
    assert.ok(cov.sources.find((s: { source: string }) => s.source === 'Adzuna').calls >= 1);
    const snap = JSON.parse(readFileSync(join(dir, 'out', 'jobs.json'), 'utf8'));
    const tagged = snap.jobs.find((j: { title: string }) => j.title === 'Security Operations Analyst');
    assert.deepEqual(tagged.tags, ['soc analyst']);
    assert.deepEqual(tagged.auth, ['citizenship']);
    assert.equal(tagged.salaryYearlyCad, 80000);
    const feed = readFileSync(join(dir, 'out', 'feeds', 'soc.xml'), 'utf8');
    assert.ok(feed.includes('Security Operations Analyst') && feed.includes('https://karthic71.github.io/jobvexa/job/?id='));
    assert.ok(JSON.parse(readFileSync(join(dir, 'out', 'keywords.json'), 'utf8')).priority.includes('soc analyst'));
  } finally {
    globalThis.fetch = real;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
