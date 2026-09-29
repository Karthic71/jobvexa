import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateJobFingerprint } from '../fingerprint';
import { dedupe } from '../index';
import { classifyIndustry, parseSalaryText } from '../normalize';
import { parseLocationString } from '../regions';
import { buildDeepLinks } from '../deeplinks';
import { parseSearchParams } from '../params';
import { mockJobs } from '../sources/mock';

test('fingerprint ignores case, punctuation, and company suffixes', () => {
  const a = generateJobFingerprint({ title: 'Senior Software Engineer', company: 'Acme Inc.', city: 'Toronto', stateProvince: 'ON' });
  const b = generateJobFingerprint({ title: 'senior  software engineer!', company: 'ACME', city: 'toronto', stateProvince: 'on' });
  const c = generateJobFingerprint({ title: 'Senior Software Engineer', company: 'Acme', city: 'Ottawa', stateProvince: 'ON' });
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('dedupe prefers direct ATS over aggregator and fills salary', () => {
  const [base] = mockJobs();
  const ats = { ...base, source: 'greenhouse' as const, salary: undefined, applyUrl: 'https://ats', applyOptions: [{ portal: 'Company site (Greenhouse)', url: 'https://ats', direct: true }] };
  const agg = { ...base, source: 'adzuna' as const, applyUrl: 'https://agg', applyOptions: [{ portal: 'Adzuna', url: 'https://agg', direct: false }] };
  const out = dedupe([agg, ats]);
  assert.equal(out.length, 1);
  assert.equal(out[0].applyUrl, 'https://ats');
  assert.equal(out[0].applyOptions!.length, 2);
  assert.ok(out[0].salary);
});

test('location and salary parsing', () => {
  assert.deepEqual(parseLocationString('Halifax, Nova Scotia'), { city: 'Halifax', stateProvince: 'NS', country: 'CA' });
  assert.equal(parseLocationString('Austin, TX, US').stateProvince, 'TX');
  assert.deepEqual(parseSalaryText('$65,000 - $80,000 a year', 'CA'), { min: 65000, max: 80000, currency: 'CAD', period: 'yearly' });
  assert.equal(parseSalaryText('$28/hr', 'US')?.period, 'hourly');
});

test('industry classification', () => {
  assert.equal(classifyIndustry('Registered Nurse'), 'healthcare');
  assert.equal(classifyIndustry('Journeyman Electrician'), 'trades_construction');
  assert.equal(classifyIndustry('Astronaut'), 'other');
});

test('deep links carry keyword, location and filters', () => {
  const links = buildDeepLinks({ q: 'nurse', country: 'CA', region: 'NS', city: 'Halifax', industry: 'all', workType: 'remote', postedWithinDays: 7 });
  assert.ok(links.length >= 12, 'all Canadian platforms with search URLs');
  const li = links.find((l) => l.platform === 'LinkedIn Jobs')!.url;
  assert.ok(li.includes('keywords=nurse') && li.includes('f_WT=2') && li.includes('Halifax'));
  assert.ok(links.find((l) => l.platform === 'Indeed Canada')!.url.startsWith('https://ca.indeed.com'));
  assert.ok(links.find((l) => l.platform.startsWith('Job Bank'))!.url.includes('jobbank.gc.ca'));
  const us = buildDeepLinks({ q: 'nurse', country: 'US', region: 'TX', city: '', industry: 'all', workType: 'all' });
  assert.equal(us[0].platform, 'USAJOBS');
  assert.ok(us.every((l) => l.note === 'US') && us[1].url.includes('Texas'));
  const both = buildDeepLinks({ q: 'nurse', country: 'ALL', region: '', city: '', industry: 'all', workType: 'all' });
  assert.equal(both[0].note, 'CA');
  assert.equal(both.at(-1)!.note, 'US');
});

test('query params are sanitised', () => {
  const p = parseSearchParams(new URLSearchParams('country=XX&industry=bogus&pageSize=9999&page=-3&region=on1'));
  assert.equal(p.country, 'ALL'); assert.equal(p.industry, 'all'); assert.equal(p.pageSize, 100); assert.equal(p.page, 1); assert.equal(p.region, 'ON');
});

import { extract, inferSeniority, SKILLS, CERTIFICATIONS, TOOLS } from '../enrich';
import { htmlToText } from '../normalize';
import { applyFilters, sortJobs } from '../index';
import { companyMatches, matchingCompanies, resolveCareerSite, slugify } from '../companies';
import { computeStats } from '../stats';
import type { SearchParams } from '@/types/job';

const base: SearchParams = { q: '', country: 'ALL', region: '', city: '', industry: 'all', workType: 'all', employmentType: 'all', company: '', level: 'all', skills: [], certs: [], tools: [], sort: 'newest', page: 1, pageSize: 25 };

test('enrichment finds certs, tools, skills and seniority', () => {
  const t = 'Lead SOC analyst. CISSP or Security+ required. Splunk, AWS, Terraform. Python and incident response. C++ a plus.';
  assert.ok(extract(CERTIFICATIONS, t).includes('CISSP'));
  assert.ok(extract(CERTIFICATIONS, t).includes('CompTIA Security+'));
  assert.deepEqual(extract(TOOLS, t).slice(0, 2), ['Splunk', 'AWS']);
  assert.ok(extract(SKILLS, t).includes('Python') && extract(SKILLS, t).includes('C++'));
  assert.equal(inferSeniority('Senior Security Engineer'), 'senior');
  assert.equal(inferSeniority('Junior Analyst'), 'entry');
  assert.equal(inferSeniority('Analyst', '5+ years of experience'), 'senior');
});

test('htmlToText keeps structure and decodes entity-encoded HTML', () => {
  const out = htmlToText('&lt;p&gt;Hello&lt;/p&gt;&lt;ul&gt;&lt;li&gt;One&lt;/li&gt;&lt;li&gt;Two&lt;/li&gt;&lt;/ul&gt;');
  assert.ok(out.includes('Hello') && out.includes('• One') && out.includes('• Two'));
});

test('company search returns all of a company\'s jobs and a career site', () => {
  const jobs = mockJobs();
  const nw = jobs.filter((j) => companyMatches(j, 'northwind'));
  assert.ok(nw.length >= 3);
  const cards = matchingCompanies(jobs, 'northwind');
  assert.equal(cards[0].name, 'Northwind Systems');
  assert.equal(cards[0].count, nw.length);
  assert.equal(applyFilters(jobs, { ...base, company: 'Northwind Systems' }).length, nw.length);
  assert.equal(resolveCareerSite('Shopify').verified, true);
  assert.equal(resolveCareerSite('Unknown Widgets Ltd').verified, false);
  assert.equal(resolveCareerSite('Acme', [{ ...jobs[0], company: 'Acme', applyUrl: 'https://boards.greenhouse.io/acme/jobs/1' }]).url, 'https://boards.greenhouse.io/acme');
  assert.equal(slugify('Northwind Systems Inc.'), 'northwind-systems');
});

test('new filters and sorts', () => {
  const jobs = mockJobs();
  const soc = applyFilters(jobs, { ...base, skills: ['Incident Response'] });
  assert.ok(soc.length >= 1 && soc.every((j) => j.skills?.includes('Incident Response')));
  assert.ok(applyFilters(jobs, { ...base, level: 'entry' }).every((j) => j.seniority === 'entry'));
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(applyFilters(jobs, { ...base, dateFrom: today }).length < jobs.length);
  const oldest = sortJobs(jobs, { ...base, sort: 'oldest' });
  assert.ok(+new Date(oldest[0].postedAt) <= +new Date(oldest.at(-1)!.postedAt));
  assert.ok(applyFilters(jobs, { ...base, minSalary: 120000 }).every((j) => (j.salary?.period === 'hourly' ? (j.salary.max ?? 0) * 2080 : j.salary?.max ?? 0) >= 120000));
});

test('dashboard stats add up', () => {
  const jobs = mockJobs();
  const s = computeStats(jobs, [], true);
  assert.equal(s.total, jobs.length);
  assert.equal(s.byIndustry.reduce((a, b) => a + b.count, 0), jobs.length);
  assert.equal(s.perDay.length, 30);
  assert.ok(s.byCity.length && s.topTools.length);
  assert.ok(s.medianYearlySalary && s.medianYearlySalary > 20000);
  assert.ok(s.topCompanies[0].count >= 3);
});

import { atsDiscovery, slugCandidates } from '../sources/discovery';

test('ATS auto-discovery finds a company board from a plain name (mocked network)', async () => {
  assert.deepEqual(slugCandidates('Concentrix'), ['concentrix']);
  assert.ok(slugCandidates('Royal Bank of Canada').includes('royal-bank-of'));
  assert.deepEqual(slugCandidates('a'), []);
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = String(url);
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.endsWith('/v1/boards/acmecorp')) return ok({ name: 'Acme Corp' });
    if (u.includes('/v1/boards/acmecorp/jobs')) return ok({ jobs: [
      { title: 'Support Agent', location: { name: 'Toronto, ON' }, absolute_url: 'https://boards.greenhouse.io/acmecorp/jobs/1', updated_at: new Date().toISOString(), content: '&lt;p&gt;Help customers&lt;/p&gt;' },
      { title: 'Engineer', location: { name: 'London, UK' }, absolute_url: 'https://boards.greenhouse.io/acmecorp/jobs/2', updated_at: new Date().toISOString() },
    ] });
    return new Response('nope', { status: 404 });
  }) as typeof fetch;
  try {
    const jobs = await atsDiscovery.fetch({ ...base, q: 'Acme Corp' });
    assert.equal(jobs.length, 1, 'non CA/US postings are dropped');
    assert.equal(jobs[0].company, 'Acme Corp');
    assert.equal(jobs[0].location.stateProvince, 'ON');
    assert.ok(jobs[0].description?.includes('Help customers'));
    // a board whose name doesn't match the query must be ignored
    const other = await atsDiscovery.fetch({ ...base, q: 'Acmecorp Holdings Group' });
    assert.equal(other.length, 0);
  } finally { globalThis.fetch = real; }
});

import { listSources } from '../index';
test('sources list reports enabled state and opt-in connectors', () => {
  const list = listSources();
  assert.ok(list.length >= 9);
  const sr = list.find((x) => x.id === 'smartrecruiters')!;
  assert.equal(sr.enabled, false);
  assert.match(sr.reason ?? '', /Opt-in/);
  assert.equal(list.find((x) => x.id === 'discovery')!.enabled, true);
  assert.ok(list.every((x) => x.legal.length > 20));
});

import { mergeApplyOptions, portalForUrl } from '../portals';
import { jsearch } from '../sources/jooble';

test('portal detection and apply-option merging (employer site first)', () => {
  assert.equal(portalForUrl('https://ca.indeed.com/viewjob?jk=1').portal, 'Indeed');
  assert.equal(portalForUrl('https://www.linkedin.com/jobs/view/1').portal, 'LinkedIn');
  assert.deepEqual(portalForUrl('https://acme.wd3.myworkdayjobs.com/x'), { portal: 'Company site (Workday)', direct: true });
  assert.deepEqual(portalForUrl('https://careers.acme.ca/job/1'), { portal: 'Company site (careers.acme.ca)', direct: true });
  const m = mergeApplyOptions(
    [{ portal: 'Indeed', url: 'https://ca.indeed.com/a', direct: false }],
    [{ portal: 'LinkedIn', url: 'https://linkedin.com/b', direct: false }, { portal: 'indeed', url: 'https://ca.indeed.com/dup', direct: false }],
    [{ portal: 'Company site', url: 'https://acme.com/c', direct: true }, { portal: 'Bad', url: 'javascript:alert(1)', direct: false }],
  );
  assert.deepEqual(m.map((o) => o.portal), ['Company site', 'Indeed', 'LinkedIn']);
  assert.equal(mergeApplyOptions([{ portal: 'A', url: 'https://x.com/1', direct: true }], [{ portal: 'B', url: 'https://x.com/1/', direct: true }]).length, 1);
  assert.ok(mockJobs().every((j) => new Set(j.applyOptions!.map((o) => o.url)).size === j.applyOptions!.length));
});

test('duplicates from several sources keep every portal', () => {
  const [a] = mockJobs();
  const x = { ...a, source: 'adzuna' as const, applyOptions: [{ portal: 'Adzuna', url: 'https://adzuna.ca/1', direct: false }] };
  const y = { ...a, source: 'jooble' as const, applyOptions: [{ portal: 'Indeed', url: 'https://ca.indeed.com/1', direct: false }, { portal: 'Company site', url: 'https://acme.com/1', direct: true }] };
  const [out] = dedupe([x, y]);
  assert.deepEqual(out.applyOptions!.map((o) => o.portal), ['Company site', 'Adzuna', 'Indeed']);
  assert.equal(out.applyUrl, 'https://acme.com/1');
});

test('JSearch apply_options become portals (mocked network)', async () => {
  const real = globalThis.fetch; const prev = process.env.RAPIDAPI_KEY; const prevJ = process.env.JOOBLE_API_KEY;
  process.env.RAPIDAPI_KEY = 'test'; delete process.env.JOOBLE_API_KEY;
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{
    job_title: 'Customer Service Advisor', employer_name: 'Concentrix', job_city: 'Halifax', job_state: 'NS', job_country: 'CA',
    job_apply_link: 'https://www.linkedin.com/jobs/view/1', job_publisher: 'LinkedIn', job_apply_is_direct: false,
    apply_options: [
      { publisher: 'Indeed', apply_link: 'https://ca.indeed.com/viewjob?jk=1', is_direct: false },
      { publisher: 'Concentrix Careers', apply_link: 'https://jobs.concentrix.com/job/1', is_direct: true },
    ],
  }] }), { status: 200 })) as typeof fetch;
  try {
    const jobs = await jsearch.fetch({ ...base, q: 'Concentrix', country: 'CA' });
    assert.equal(jobs.length, 1);
    assert.deepEqual(jobs[0].applyOptions!.map((o) => o.portal), ['Company site (Concentrix Careers)', 'LinkedIn', 'Indeed']);
    assert.equal(jobs[0].applyUrl, 'https://jobs.concentrix.com/job/1');
    assert.equal(jobs[0].location.stateProvince, 'NS');
  } finally {
    globalThis.fetch = real;
    if (prev === undefined) delete process.env.RAPIDAPI_KEY; else process.env.RAPIDAPI_KEY = prev;
    if (prevJ !== undefined) process.env.JOOBLE_API_KEY = prevJ;
  }
});

test('Canada first: CA jobs rank before US for every sort', () => {
  const jobs = mockJobs();
  for (const sort of ['relevance', 'newest', 'oldest', 'salary', 'company'] as const) {
    const out = sortJobs(jobs, { ...base, sort });
    const firstUS = out.findIndex((j) => j.location.country === 'US');
    assert.ok(firstUS > 0 && out.slice(firstUS).every((j) => j.location.country === 'US'), sort);
  }
});
