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
  assert.ok(applyFilters(jobs, { ...base, minSalary: 120000 }).every((j) => (j.salaryYearlyCad ?? 0) >= 120000));
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
import { jsearch, jsearchList, resetJSearch } from '../sources/jooble';

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
  process.env.RAPIDAPI_KEY = 'test'; delete process.env.JOOBLE_API_KEY; resetJSearch();
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

import { parseRobots } from '../robots';
import { jobBank, jobBankFeedUrl, parseJobBankItem, resetJobBankRobots } from '../sources/jobbank';

test('robots.txt rules: groups, longest match, wildcards, crawl-delay', () => {
  const r = parseRobots(`User-agent: *\nDisallow: /jobsearch/jobposting/print\nDisallow: /*?*sessionid\nAllow: /jobsearch/\nCrawl-delay: 5\n\nUser-agent: BadBot\nDisallow: /`, 'JobvexaBot');
  assert.equal(r.crawlDelaySec, 5);
  assert.ok(r.allowed('/jobsearch/feed/jobSearchRSSfeed?searchstring=x'));
  assert.ok(!r.allowed('/jobsearch/jobposting/print/123'));
  assert.ok(!r.allowed('/a?b=1&sessionid=2'));
  const bad = parseRobots('User-agent: jobvexabot\nDisallow: /\n', 'JobvexaBot');
  assert.ok(!bad.allowed('/anything'));
  assert.ok(parseRobots('', 'x').allowed('/'));
});

test('Job Bank RSS items parse in several layouts', () => {
  const a = parseJobBankItem(`<item><title>Cybersecurity analyst - Creyos - Toronto (ON)</title><link>https://www.jobbank.gc.ca/jobsearch/jobposting/50380964;jsessionid=ABC.jobsearch77</link><description><![CDATA[<p>Salary: $90,000 to $100,000 annually</p>]]></description><pubDate>Mon, 28 Sep 2026 10:00:00 EDT</pubDate></item>`)!;
  assert.equal(a.title, 'Cybersecurity analyst');
  assert.equal(a.employer, 'Creyos');
  assert.equal(a.location, 'Toronto, ON');
  assert.equal(a.url, 'https://www.jobbank.gc.ca/jobsearch/jobposting/50380964');
  const b = parseJobBankItem(`<item><title>Cook</title><link>https://www.jobbank.gc.ca/jobsearch/jobposting/1</link><description>Employer: Harbour Grill&lt;br&gt;Location: Halifax (NS)&lt;br&gt;Salary: $18.00 hourly</description></item>`)!;
  assert.equal(b.employer, 'Harbour Grill');
  assert.equal(b.location, 'Halifax, NS');
  assert.equal(parseJobBankItem('<item><title>x</title></item>'), null);
  assert.ok(jobBankFeedUrl({ ...base, region: 'ON', page: 2 }).includes('locationstring=Ontario') && jobBankFeedUrl({ ...base, region: 'ON', page: 2 }).includes('page=2'));
});

test('Job Bank connector obeys robots.txt and reads the feed (mocked network)', async () => {
  const real = globalThis.fetch;
  const rss = `<?xml version="1.0"?><rss><channel><title>Job Bank</title><item><title>Cybersecurity analyst - Creyos - Toronto (ON)</title><link>https://www.jobbank.gc.ca/jobsearch/jobposting/50380964</link><description>Salary: $90,000 to $100,000 annually</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
  let robotsTxt = 'User-agent: *\nAllow: /\nCrawl-delay: 5';
  let feedCalls = 0;
  globalThis.fetch = (async (input: string | URL) => {
    const u = String(input);
    if (u.endsWith('/robots.txt')) return new Response(robotsTxt, { status: 200 });
    if (u.includes('jobSearchRSSfeed')) { feedCalls++; return new Response(rss, { status: 200 }); }
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    resetJobBankRobots();
    const jobs = await jobBank.fetch({ ...base, country: 'CA', region: 'ON' });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].company, 'Creyos');
    assert.equal(jobs[0].location.stateProvince, 'ON');
    assert.equal(jobs[0].salary?.min, 90000);
    assert.equal(jobs[0].applyOptions?.[0].portal, 'Job Bank (Canada)');
    resetJobBankRobots();
    robotsTxt = 'User-agent: *\nDisallow: /jobsearch/feed/';
    await assert.rejects(jobBank.fetch({ ...base, country: 'CA', region: 'ON' }), /robots\.txt/);
    assert.equal(feedCalls, 1, 'no feed request when robots.txt disallows it');
  } finally { globalThis.fetch = real; resetJobBankRobots(); }
});

test('JSearch falls back from a 404 path to the next endpoint and remembers it', async () => {
  const real = globalThis.fetch; const saved = { ...process.env };
  process.env.OPENWEBNINJA_API_KEY = 'k'; delete process.env.RAPIDAPI_KEY; resetJSearch();
  const urls: string[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const u = String(input); urls.push(u);
    if (u.includes('/search-v2')) return new Response('nf', { status: 404 });
    assert.equal((init?.headers as Record<string, string>)['x-api-key'], 'k');
    return new Response(JSON.stringify({ data: { jobs: [{ job_title: 'Cloud Engineer', employer_name: 'Acme', job_city: 'Toronto', job_state: 'ON', job_country: 'CA', job_apply_link: 'https://acme.com/1' }] } }), { status: 200 });
  }) as typeof fetch;
  try {
    const a = await jsearch.fetch({ ...base, q: 'cloud', country: 'CA' });
    const b = await jsearch.fetch({ ...base, q: 'devops', country: 'CA' });
    assert.equal(a.length, 1); assert.equal(b.length, 1);
    assert.equal(urls.filter((u) => u.includes('search-v2')).length, 1, 'v2 tried once, then the working path is reused');
    assert.deepEqual(jsearchList({ data: [{ job_title: 'x' }] }).length, 1);
    assert.deepEqual(jsearchList({ jobs: [] }), []);
  } finally {
    globalThis.fetch = real; resetJSearch();
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

import { hasPhrase, parseKeywordsFile, tagJob, variantsOf } from '../keywords';
import { detectWorkAuth } from '../enrich';
import { normalizeTitle } from '../text';
import { yearlyCad } from '../salary';

test('keywords: parsing, synonyms and tagging', () => {
  const k = parseKeywordsFile('# c\n[priority]\nSOC Analyst\nsoc analyst\n[general]\nnurse\n');
  assert.deepEqual(k, { priority: ['soc analyst'], general: ['nurse'] });
  const aliases = { 'site reliability engineer': ['sre'], 'registered nurse': ['rn'] };
  assert.deepEqual(variantsOf('SRE', aliases).sort(), ['site reliability engineer', 'sre']);
  assert.ok(hasPhrase('senior sre ii', 'sre') && !hasPhrase('presre', 'sre'));
  assert.deepEqual(tagJob('SRE II', 'on-call', { priority: ['site reliability engineer'], general: ['registered nurse'], aliases }), ['site reliability engineer']);
  assert.deepEqual(tagJob('Barn manager', 'no nursing here', { priority: [], general: ['registered nurse'], aliases }), []);
});

test('work authorization detection', () => {
  assert.deepEqual(detectWorkAuth('Applicants must be a Canadian citizen.'), ['citizenship']);
  assert.deepEqual(detectWorkAuth('Must be able to obtain Secret clearance; we are unable to sponsor visas.'), ['clearance', 'no-sponsorship']);
  assert.deepEqual(detectWorkAuth('Must be legally eligible to work in Canada'), ['must-be-eligible']);
  assert.deepEqual(detectWorkAuth('Visa sponsorship is available for this role.'), ['sponsorship']);
  assert.deepEqual(detectWorkAuth('Great team, great pay.'), []);
});

test('better dedupe: title variants share one fingerprint', () => {
  assert.equal(normalizeTitle('Sr. Cloud Eng II (Remote)'), normalizeTitle('Senior Cloud Engineer 2'));
  assert.equal(normalizeTitle('SOC Analyst - Hybrid'), normalizeTitle('SOC Analyst'));
  assert.equal(normalizeTitle('Full-time Help Desk Tech'), normalizeTitle('Help Desk Technician'));
  const a = generateJobFingerprint({ title: 'Sr. DevOps Engineer - Remote', company: 'Acme Ltd.', city: 'Toronto', stateProvince: 'ON' });
  const b = generateJobFingerprint({ title: 'Senior DevOps Engineer', company: 'ACME', city: 'toronto', stateProvince: 'on' });
  assert.equal(a, b);
});

test('salary normalised to yearly CAD', () => {
  assert.equal(yearlyCad({ min: 20, max: 25, currency: 'CAD', period: 'hourly' }), 52000);
  assert.equal(yearlyCad({ max: 100000, currency: 'USD', period: 'yearly' }), 137000);
  assert.equal(yearlyCad({ max: 3, currency: 'CAD', period: 'yearly' }), undefined);
  assert.equal(yearlyCad(undefined), undefined);
});

import { himalayas, remotive, remoteCountry } from '../sources/remote';
import { fetchBoard } from '../sources/discovery';

test('location parsing: California is not Canada', () => {
  assert.deepEqual(parseLocationString('San Jose, CA'), { city: 'San Jose', stateProvince: 'CA', country: 'US' });
  assert.deepEqual(parseLocationString('Toronto, ON, CA'), { city: 'Toronto', stateProvince: 'ON', country: 'CA' });
  assert.equal(parseLocationString('Vancouver, BC').country, 'CA');
});

test('remote boards: who can apply', () => {
  assert.equal(remoteCountry('Canada'), 'CA');
  assert.equal(remoteCountry('Worldwide'), 'CA');
  assert.equal(remoteCountry(['USA']), 'US');
  assert.equal(remoteCountry('Europe, UK'), null);
  assert.equal(remoteCountry([]), 'CA');
});

test('Remotive, Himalayas, Workable and Recruitee parsing (mocked network)', async () => {
  const real = globalThis.fetch;
  const now = new Date().toISOString();
  globalThis.fetch = (async (input: string | URL) => {
    const u = String(input);
    const ok = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    if (u.startsWith('https://remotive.com/api/remote-jobs')) return ok({ jobs: [
      { url: 'https://remotive.com/remote-jobs/devops/1', title: 'DevOps Engineer', company_name: 'Acme', job_type: 'full_time', publication_date: now, candidate_required_location: 'Canada', salary: '$90k - $110k', description: '<p>Terraform</p>' },
      { url: 'https://remotive.com/remote-jobs/x/2', title: 'EU only', company_name: 'B', publication_date: now, candidate_required_location: 'Europe' },
    ] });
    if (u.startsWith('https://himalayas.app/jobs/api/search')) return ok({ jobs: [{ title: 'Cloud Engineer', companyName: 'Hi', locationRestrictions: ['Canada', 'United States'], minSalary: 100000, maxSalary: 130000, currency: 'USD', pubDate: Math.floor(Date.now() / 1000), applicationLink: 'https://himalayas.app/companies/hi/jobs/cloud-engineer', description: 'AWS' }] });
    if (u.startsWith('https://apply.workable.com/api/v1/widget/accounts/acme')) return ok({ name: 'Acme Inc', jobs: [{ title: 'IT Support Specialist', shortcode: 'ABC', telecommuting: false, application_url: 'https://apply.workable.com/acme/j/ABC/apply', published_on: '2026-09-28', locations: [{ city: 'Toronto', region: 'Ontario', countryCode: 'CA' }] }] });
    if (u.startsWith('https://acme.recruitee.com/api/offers/')) return ok({ offers: [{ title: 'Help Desk Analyst', city: 'Calgary', state_code: 'AB', country_code: 'CA', careers_url: 'https://acme.recruitee.com/o/help-desk', published_at: now, company_name: 'Acme Inc', description: '<p>Tickets</p>' }] });
    return new Response('nf', { status: 404 });
  }) as typeof fetch;
  try {
    const r = await remotive.fetch({ ...base });
    assert.equal(r.length, 1);
    assert.equal(r[0].location.country, 'CA'); assert.equal(r[0].workType, 'remote'); assert.equal(r[0].applyOptions?.[0].portal, 'Remotive');
    const h = await himalayas.fetch({ ...base, q: 'cloud engineer remote', country: 'CA' });
    assert.equal(h.length, 1); assert.equal(h[0].salary?.currency, 'USD'); assert.ok(Date.now() - +new Date(h[0].postedAt) < 864e5, 'unix seconds understood');
    const w = await fetchBoard({ ats: 'workable', slug: 'acme', name: 'Acme' }, 'Acme');
    assert.equal(w?.jobs.length, 1); assert.equal(w?.jobs[0].location.stateProvince, 'ON'); assert.equal(w?.jobs[0].source, 'workable');
    assert.equal(await fetchBoard({ ats: 'workable', slug: 'acme', name: 'Other' }, 'Totally Different Co'), null, 'name must match');
    const rc = await fetchBoard({ ats: 'recruitee', slug: 'acme', name: 'Acme' }, 'Acme');
    assert.equal(rc?.jobs[0].location.city, 'Calgary'); assert.equal(rc?.jobs[0].location.country, 'CA');
  } finally { globalThis.fetch = real; }
});

import { buildMatcher, parseQuery } from '../search';
import { querySnapshot, salaryCad } from '../query';

test('search syntax: phrases, OR, exclusions and synonyms', () => {
  assert.deepEqual(parseQuery('soc OR "security analyst" -senior -"team lead"'), { clauses: [['soc'], ['"security analyst"']], exclude: ['senior', 'team lead'] });
  const kw = { priority: ['site reliability engineer', 'soc analyst'], general: [], aliases: { 'site reliability engineer': ['sre'], 'soc analyst': ['security operations analyst'] } };
  const [j] = mockJobs();
  const job = (title: string, extra: Partial<typeof j> = {}) => ({ ...j, title, descriptionSnippet: '', skills: [], tools: [], certifications: [], tags: [], ...extra });
  assert.ok(buildMatcher('sre', kw).test(job('Site Reliability Engineer')));
  assert.ok(buildMatcher('site reliability engineer', kw).test(job('Senior SRE')));
  assert.ok(buildMatcher('"soc analyst"', kw).test(job('Security Operations Analyst')));
  assert.ok(buildMatcher('soc analyst', kw).test(job('Analyst', { tags: ['soc analyst'] })), 'description match via collector tag');
  assert.ok(!buildMatcher('devops -senior', kw).test(job('Senior DevOps Engineer')));
  assert.ok(buildMatcher('devops -senior', kw).test(job('DevOps Engineer')));
  assert.ok(buildMatcher('nurse OR welder', kw).test(job('Welder')));
  assert.ok(!buildMatcher('"cloud engineer"', kw).test(job('Engineer, Cloud')));
  assert.ok(buildMatcher('cloud engineer', kw).test(job('Engineer, Cloud')), 'plain words match in any order');
});

test('work-auth filters, salary sort and entry/mid boost', () => {
  const [a, b, c] = mockJobs();
  const jobs = [{ ...a, auth: ['citizenship' as const] }, { ...b, auth: ['sponsorship' as const] }, { ...c, auth: undefined }];
  assert.equal(applyFilters(jobs, { ...base, hideAuth: ['citizenship'] }).length, 2);
  assert.deepEqual(applyFilters(jobs, { ...base, sponsorOnly: true }).map((j) => j.id), [b.id]);
  const sorted = sortJobs(mockJobs(), { ...base, country: 'CA', sort: 'salary' });
  for (let i = 1; i < sorted.length; i++) if (sorted[i].location.country === sorted[i - 1].location.country) assert.ok(salaryCad(sorted[i - 1]) >= salaryCad(sorted[i]));
  const boosted = sortJobs(mockJobs(), { ...base, sort: 'relevance', boost: ['entry', 'mid'] });
  const firstLead = boosted.findIndex((j) => j.seniority === 'lead' || j.seniority === 'manager');
  const lastEntry = boosted.map((j) => j.seniority).lastIndexOf('entry');
  assert.ok(firstLead === -1 || boosted.slice(0, 3).every((j) => j.seniority !== 'lead'), 'leads are not at the top');
  assert.ok(lastEntry >= 0);
  const snap = { updatedAt: '', usedMock: true, sources: [], jobs: mockJobs() };
  assert.ok(querySnapshot(snap, { ...base, q: 'sre' }, { priority: [], general: [], aliases: { 'site reliability engineer': ['sre'] } }).total >= 0);
});
