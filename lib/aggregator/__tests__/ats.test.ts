import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeResume, jdKeywords, requiredYears, resumeYears } from '../ats';
import { fetchJson, fetchText, HttpError } from '../normalize';

const JD = `SOC Analyst
We are hiring a SOC Analyst to join our security operations centre in Toronto.
Requirements:
- 2+ years of experience in a security operations or incident response role
- Hands-on experience with Splunk and Microsoft Sentinel (SIEM)
- Knowledge of incident response, threat hunting and vulnerability management
- CompTIA Security+ certification
- Bachelor's degree in computer science or related field
You will perform incident response, threat hunting, alert triage and vulnerability management daily.`;

const GOOD = `Karthic Example
karthic@example.com | 519-555-0123 | Toronto, ON
SOC Analyst with 3 years of experience in security operations, incident response and threat hunting.

Experience
SOC Analyst — Acme Bank, 2022 – present
- Triaged 40+ alerts per day in Splunk and Microsoft Sentinel (SIEM)
- Led incident response for 12 phishing cases, cutting response time 30%
- Ran weekly threat hunting and vulnerability management scans across 500 hosts
- Wrote alert triage runbooks used by the team

Education
Bachelor's degree in Computer Science, University of Waterloo, 2016 – 2020

Skills
Splunk, Microsoft Sentinel, incident response, threat hunting, vulnerability management, Python
Certifications: CompTIA Security+
`.repeat(1) + ' detail'.repeat(220);

const WEAK = `Jamie
Retail associate. Cash handling and customer service.`;

test('requiredYears picks the smallest "N+ years ... experience" figure', () => {
  assert.equal(requiredYears(JD), 2);
  assert.equal(requiredYears('5+ years of experience with Java; 3 years experience in AWS'), 3);
  assert.equal(requiredYears('3-5 years of hands-on experience'), 3);
  assert.equal(requiredYears('Great benefits and a friendly team'), undefined);
  assert.equal(requiredYears('Founded 150 years ago'), undefined, 'ignores numbers that are not experience');
});

test('resumeYears prefers an explicit claim and skips school dates', () => {
  const now = new Date('2026-09-30');
  assert.equal(resumeYears('Analyst with 2 years of experience\nBSc, University of Toronto 2016 – 2020\nAnalyst, Acme 2019 – present', now), 2);
  assert.equal(resumeYears('Analyst, Acme 2019 – 2021\nUniversity of Toronto, Bachelor 2015 – 2019', now), 2, 'education line is not counted');
  assert.equal(resumeYears('Dev, A 2018 – 2021\nDev, B 2020 – 2022', now), 4, 'overlapping roles are merged');
  assert.equal(resumeYears('Support, A 2023 – present', now), 3);
  assert.equal(resumeYears('No dates here', now), undefined);
});

test('jdKeywords returns repeated terms, prefers phrases and skips excluded ones', () => {
  const kws = jdKeywords(JD, ['Splunk']).map((k) => k.term);
  assert.ok(kws.includes('incident response'));
  assert.ok(kws.includes('threat hunting'));
  assert.ok(!kws.includes('incident'), 'single word inside a chosen phrase is skipped');
  assert.ok(!kws.includes('response threat'), 'phrases do not cross commas');
  assert.ok(!kws.some((k) => k.includes('splunk')), 'excluded terms are not repeated');
  assert.ok(!kws.includes('experience') && !kws.includes('the'), 'stop words are dropped');
  assert.ok(jdKeywords(JD, [], 3).length <= 3);
});

test('analyzeResume scores a matching resume well and a weak one low', () => {
  const job = { title: 'SOC Analyst', description: JD };
  const good = analyzeResume(GOOD, job);
  const weak = analyzeResume(WEAK, job);
  assert.ok(good.score >= 80, `good resume scored ${good.score}`);
  assert.ok(weak.score <= 35, `weak resume scored ${weak.score}`);
  assert.ok(good.keywordMatch > weak.keywordMatch);
  assert.ok(good.keywordMatch >= 80, `good match ${good.keywordMatch}`);
  // Breakdown adds up and stays within its maxima.
  assert.equal(good.breakdown.reduce((a, b) => a + b.max, 0), 100);
  for (const b of [...good.breakdown, ...weak.breakdown]) assert.ok(b.points >= 0 && b.points <= b.max);
  // Hard skills found in the posting.
  const hs = good.hardSkills.map((h) => h.term.toLowerCase()).join(' | ');
  assert.match(hs, /splunk/);
  assert.match(hs, /security\+/);
  assert.ok(good.hardSkills.every((h) => h.inResume), JSON.stringify(good.hardSkills.filter((h) => !h.inResume)));
  // Title, experience, education.
  assert.equal(good.title.ok, true);
  assert.deepEqual([good.experience.requiredYears, good.experience.resumeYears, good.experience.ok], [2, 3, true]);
  assert.equal(good.education.ok, true);
  assert.equal(weak.experience.ok, false);
  assert.equal(weak.education.ok, false);
  // Formatting and tips.
  assert.ok(good.formatting.every((f) => f.ok), JSON.stringify(good.formatting.filter((f) => !f.ok)));
  assert.ok(weak.formatting.find((f) => f.id === 'email' && !f.ok));
  assert.ok(weak.tips.some((t) => /Splunk/.test(t)), 'tips name missing skills');
  assert.ok(weak.tips.some((t) => /SOC Analyst/.test(t)), 'tips mention the job title');
});

test('soft skills are matched loosely and not counted as hard skills', () => {
  const r = analyzeResume('Strong communicator who led a team of 5 in customer support.', { title: 'Store Manager', description: 'Excellent communication skills and leadership required. Customer service focus.' });
  assert.ok(!r.hardSkills.some((h) => ['Communication', 'Leadership', 'Customer Service'].includes(h.term)));
  const soft = Object.fromEntries(r.keywords.filter((k) => ['Communication', 'Leadership', 'Customer Service'].includes(k.term)).map((k) => [k.term, k.inResume]));
  assert.deepEqual(soft, { Communication: true, Leadership: true, 'Customer Service': true });
  assert.ok(!r.keywords.some((k) => /^communication|^leadership$/.test(k.term)), 'no duplicate raw keyword for a soft skill');
});

test('analyzeResume gives full credit where the posting states no requirement', () => {
  const r = analyzeResume('Barista\nMade coffee', { title: 'Barista', description: 'Make coffee and serve customers. Coffee drinks, customers first.' });
  assert.equal(r.experience.ok, null);
  assert.equal(r.education.ok, null);
  assert.equal(r.breakdown.find((b) => b.label === 'Years of experience')!.points, 10);
  assert.equal(r.breakdown.find((b) => b.label === 'Education')!.points, 5);
  assert.equal(r.title.ok, true);
});

test('analyzeResume is stable across repeated calls (no regex state leaks)', () => {
  const job = { title: 'SOC Analyst', description: JD };
  const a = analyzeResume(GOOD, job), b = analyzeResume(GOOD, job);
  assert.deepEqual(a, b);
});

test('fetch helpers retry once on 503 and report status with a body snippet', async () => {
  const real = globalThis.fetch;
  const prev = process.env.COLLECT_GAP_SCALE;
  process.env.COLLECT_GAP_SCALE = '0';
  try {
    let calls = 0;
    globalThis.fetch = (async () => (++calls === 1 ? new Response('busy', { status: 503, statusText: 'Service Unavailable' }) : Response.json({ ok: 1 }))) as typeof fetch;
    assert.deepEqual(await fetchJson('https://x.test/a'), { ok: 1 });
    assert.equal(calls, 2);

    calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response('<html>Not Acceptable</html>', { status: 406, statusText: 'Not Acceptable' }); }) as typeof fetch;
    await assert.rejects(fetchText('https://x.test/b'), (e: unknown) => e instanceof HttpError && e.status === 406 && /Not Acceptable/.test(e.message));
    assert.equal(calls, 1, '406 is not retried');
  } finally {
    globalThis.fetch = real;
    if (prev === undefined) delete process.env.COLLECT_GAP_SCALE; else process.env.COLLECT_GAP_SCALE = prev;
  }
});
