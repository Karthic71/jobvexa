/**
 * Resume ↔ job description check with an ATS-style score (runs only in the browser).
 *
 * Applicant Tracking Systems mostly look for: the job's hard skills and keywords, the job title,
 * years of experience, education, and a resume they can parse (contact details, standard
 * section headings, plain text). This scores those the same way popular ATS checkers do.
 * It is an estimate — every real ATS (Workday, Taleo, Greenhouse, iCIMS…) ranks differently.
 */
import { CERTIFICATIONS, SKILLS, TOOLS } from './enrich';
import { hasPhrase, tagJob, variantsOf, type KeywordConfig } from './keywords';
import { normalizeTitle, normalizeToken } from './text';

export interface TermHit { term: string; inResume: boolean; jdCount: number }
export interface AtsCheck { id: string; label: string; ok: boolean; tip?: string }
export interface AtsReport {
  score: number;
  keywordMatch: number;
  hardSkills: TermHit[];
  keywords: TermHit[];
  title: { jobTitle: string; ok: boolean; partial: boolean };
  experience: { requiredYears?: number; resumeYears?: number; ok: boolean | null };
  education: { required?: string; resume?: string; ok: boolean | null };
  formatting: AtsCheck[];
  breakdown: { label: string; points: number; max: number }[];
  tips: string[];
}

export interface JobForAts { title: string; description?: string; descriptionSnippet?: string; skills?: string[]; tools?: string[]; certifications?: string[] }

const STOP = new Set(`a about above across after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each either etc few for from further had has have having he her here hers him his how i if in into is it its itself just let may me might more most must my no nor not now of off on once only or other our ours out over own per same shall she should so some such than that the their theirs them then there these they this those through to too under until up upon us very via was we were what when where which while who whom why will with within without would you your yours
ability able across additional all also always apply applicants applicant application based benefits best build candidate candidates career company competitive contribute culture daily day days description desired duties eg employer employees employment environment equal etc excellent experience experienced familiarity familiar full good great growth help highly hiring ideal including job join key knowledge least level like looking make making minimum must new offer offers one opportunity opportunities other part people plus position preferred proven provide qualifications related required requirements responsibilities responsible role salary skills strong success successful support team teams time title today understanding using well work working world year years`.split(/\s+/));

const LEVELS: [string, RegExp, number][] = [
  ['PhD', /\b(ph\.?\s?d|doctorate)\b/i, 4],
  ["Master's degree", /\b(master'?s?|m\.?\s?sc|mba|m\.?\s?eng)\b/i, 3],
  ["Bachelor's degree", /\b(bachelor'?s?|b\.?\s?sc|b\.?\s?eng|b\.?\s?tech|b\.?\s?a\.?|undergraduate degree|university degree|degree in)\b/i, 2],
  ['College diploma', /\b(diploma|college|associate'?s? degree|post-?graduate certificate|certificate program)\b/i, 1],
];
/** Soft skills: listed separately from hard skills and matched loosely ("strong communicator" counts). */
const SOFT: Record<string, RegExp> = {
  Communication: /\bcommunicat\w*/i,
  Leadership: /\b(leadership|led|lead(ing)?|mentor\w*|supervis\w*)\b/i,
  'Customer Service': /\b(customer|client)s?\s+(service|support|care|experience)\b/i,
  'Bilingual (EN/FR)': /\b(bilingual|french)\b/i,
};
const eduLevel = (t: string) => LEVELS.find(([, re]) => re.test(t));

const countMatches = (re: RegExp, text: string) => (text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length;

/** Years of experience the posting asks for (smallest "N+ years" mentioned next to experience). */
export function requiredYears(jd: string): number | undefined {
  const found: number[] = [];
  const re = /(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(\d{1,2})?\s*\+?\s*(?:years?|yrs?)\b[^.\n]{0,40}?(experience|exp\b|in |of |working|hands)/gi;
  for (let m = re.exec(jd); m; m = re.exec(jd)) { const n = Number(m[1]); if (n > 0 && n <= 20) found.push(n); }
  return found.length ? Math.min(...found) : undefined;
}

/** Years of experience on a resume: an explicit "N years" claim, or the span of dated roles. */
export function resumeYears(resume: string, now = new Date()): number | undefined {
  const claims = [...resume.matchAll(/(\d{1,2})\s*\+?\s*years?(?:\s+of)?\s+(?:professional\s+|hands-on\s+|work\s+|industry\s+)?experience/gi)].map((m) => Number(m[1])).filter((n) => n > 0 && n <= 45);
  const cur = now.getFullYear();
  const spans: number[][] = [];
  const re = /((?:19|20)\d{2})\s*(?:-|–|—|to)\s*((?:19|20)\d{2}|present|current|now|today)/gi;
  for (let m = re.exec(resume); m; m = re.exec(resume)) {
    // Skip dates that belong to schooling (same line mentions a college/degree).
    const ls = resume.lastIndexOf('\n', m.index) + 1;
    const le = resume.indexOf('\n', m.index);
    const line = resume.slice(ls, le === -1 ? undefined : le);
    if (/\b(college|university|school|bachelor|master|diploma|degree|b\.?\s?eng|b\.?\s?sc|certificate program|student)\b/i.test(line)) continue;
    const a = Number(m[1]); const b = /\d/.test(m[2]) ? Number(m[2]) : cur;
    if (a <= b && b <= cur + 1) spans.push([a, b]);
  }
  let fromDates: number | undefined;
  if (spans.length) {
    // Merge overlapping ranges so parallel roles aren't double-counted.
    spans.sort((x, y) => x[0] - y[0]);
    let total = 0, [s, e] = spans[0];
    for (const [a, b] of spans.slice(1)) { if (a <= e) e = Math.max(e, b); else { total += e - s; [s, e] = [a, b]; } }
    total += e - s;
    fromDates = Math.min(45, total);
  }
  // A stated claim ("2 years of experience") wins over dates, which can include gaps.
  const best = claims.length ? Math.max(...claims) : fromDates ?? 0;
  return best > 0 ? best : undefined;
}

/** Important words and two-word phrases in a job description, most frequent first. */
export function jdKeywords(jd: string, exclude: string[] = [], limit = 15): TermHit[] {
  const freq = new Map<string, number>();
  const ok = (w: string) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w);
  // Phrases never cross punctuation ("incident response, threat hunting" ≠ "response threat").
  for (const part of jd.split(/[,.;:!?()\[\]\n\r•|/]+|\s[-–—]\s/)) {
    const toks = normalizeToken(part).split(' ').filter(Boolean);
    for (let i = 0; i < toks.length; i++) {
      const w = toks[i];
      if (!ok(w)) continue;
      freq.set(w, (freq.get(w) ?? 0) + 1);
      const n = toks[i + 1];
      if (n && ok(n)) freq.set(`${w} ${n}`, (freq.get(`${w} ${n}`) ?? 0) + 1);
    }
  }
  const ex = exclude.map((e) => normalizeToken(e));
  const covered = (t: string) => ex.some((e) => e === t || e.includes(t) || t.includes(e));
  const ranked = [...freq.entries()]
    .filter(([t, c]) => c >= 2 && !covered(t))
    .sort((a, b) => b[1] * (b[0].includes(' ') ? 1.6 : 1) - a[1] * (a[0].includes(' ') ? 1.6 : 1));
  const out: TermHit[] = [];
  for (const [t, c] of ranked) {
    // Skip a single word already inside a chosen phrase (and vice versa).
    if (out.some((o) => o.term.includes(t) || t.includes(o.term))) continue;
    out.push({ term: t, inResume: false, jdCount: c });
    if (out.length >= limit) break;
  }
  return out;
}

const inResume = (normResume: string, term: string, aliases: Record<string, string[]>) => {
  const vars = variantsOf(term, aliases);
  return vars.some((v) => {
    const n = normalizeToken(v);
    return hasPhrase(normResume, n) || (n.endsWith('s') && hasPhrase(normResume, n.slice(0, -1))) || hasPhrase(normResume, `${n}s`);
  });
};

export function analyzeResume(resume: string, job: JobForAts, kw?: KeywordConfig): AtsReport {
  const jd = `${job.title}\n${job.description || job.descriptionSnippet || ''}`;
  const normResume = normalizeToken(resume);
  const aliases = kw?.aliases ?? {};

  // 1. Hard skills: skills/tools/certifications named in the posting + target-role keywords.
  const lists = [...SKILLS, ...TOOLS, ...CERTIFICATIONS];
  const hard = new Map<string, TermHit>();
  const soft: TermHit[] = [];
  for (const { label, re } of lists) {
    const n = countMatches(re, jd);
    if (n || job.skills?.includes(label) || job.tools?.includes(label) || job.certifications?.includes(label)) {
      // Soft skills are matched loosely on the resume and scored with the other keywords.
      if (SOFT[label]) soft.push({ term: label, jdCount: Math.max(1, n), inResume: SOFT[label].test(resume) || re.test(resume) });
      else hard.set(label, { term: label, jdCount: Math.max(1, n), inResume: re.test(resume) });
    }
  }
  if (kw) for (const role of tagJob(job.title, job.description ?? job.descriptionSnippet ?? '', kw)) {
    if (!hard.has(role)) hard.set(role, { term: role, jdCount: 1, inResume: inResume(normResume, role, aliases) });
  }
  const hardSkills = [...hard.values()].sort((a, b) => Number(a.inResume) - Number(b.inResume) || b.jdCount - a.jdCount);

  // 2. Other frequent keywords from the description.
  const keywords = [...soft, ...jdKeywords(jd, [...hard.keys(), ...soft.map((x) => x.term), job.title, 'communication', 'leadership', 'customer service', 'bilingual'], 15 - soft.length)
    .map((k) => ({ ...k, inResume: inResume(normResume, k.term, aliases) }))];

  // 3. Job title.
  const tWords = normalizeTitle(job.title).split(' ').filter((w) => w.length > 1 && !['senior', 'junior', 'lead', 'principal', 'staff', 'intern', '1', '2', '3', '4'].includes(w) && !STOP.has(w));
  const titlePhrase = tWords.join(' ');
  const titleExact = !!titlePhrase && (hasPhrase(normResume, titlePhrase) || variantsOf(titlePhrase, aliases).some((v) => hasPhrase(normResume, normalizeToken(v))));
  const titleShare = tWords.length ? tWords.filter((w) => hasPhrase(normResume, w)).length / tWords.length : 0;
  const title = { jobTitle: job.title, ok: titleExact, partial: !titleExact && titleShare >= 0.6 };

  // 4. Experience and 5. education.
  const req = requiredYears(jd);
  const have = resumeYears(resume);
  const experience = { requiredYears: req, resumeYears: have, ok: req === undefined ? null : have === undefined ? false : have >= req };
  const jdEdu = eduLevel(jd);
  const cvEdu = eduLevel(resume);
  const education = { required: jdEdu?.[0], resume: cvEdu?.[0], ok: jdEdu ? !!cvEdu && cvEdu[2] >= jdEdu[2] : null };

  // 6. Can an ATS read it?
  const lines = resume.split(/\r?\n/).map((l) => l.trim());
  const heading = (re: RegExp) => lines.some((l) => l.length < 40 && re.test(l));
  const words = resume.split(/\s+/).filter(Boolean).length;
  const formatting: AtsCheck[] = [
    { id: 'email', label: 'Email address', ok: /[\w.+-]+@[\w-]+\.[\w.]+/.test(resume), tip: 'Put your email at the top — ATS parsers look for it first.' },
    { id: 'phone', label: 'Phone number', ok: /(\+?\d[\d\s().-]{8,}\d)/.test(resume), tip: 'Add a phone number in plain text (e.g. 519-555-0123).' },
    { id: 'experience', label: '“Experience” section heading', ok: heading(/^(work |professional |relevant )?(experience|employment|work history)\b/i), tip: 'Use a standard heading such as “Experience” or “Work Experience”.' },
    { id: 'education', label: '“Education” section heading', ok: heading(/^(education|academic|qualifications)\b/i), tip: 'Add an “Education” heading.' },
    { id: 'skills', label: '“Skills” section heading', ok: heading(/^(technical |core |key )?(skills|competencies|technologies|tools)\b/i), tip: 'Add a “Skills” section listing the tools from the posting that you know.' },
    { id: 'length', label: 'Length 300–1,200 words', ok: words >= 300 && words <= 1200, tip: words < 300 ? `Only ${words} words — add detail to your roles and projects.` : `${words} words — trim to the most relevant 1–2 pages.` },
    { id: 'bullets', label: 'Bullet points for achievements', ok: lines.filter((l) => /^[-•*▪◦●]\s?/.test(l)).length >= 3, tip: 'Describe each role with short bullet points.' },
    { id: 'numbers', label: 'Measurable results (numbers, %)', ok: (resume.match(/\d+\s?%|\$\s?\d|\b\d{2,}\b/g) ?? []).length >= 3, tip: 'Add numbers: tickets closed, uptime %, servers managed, cost saved.' },
  ];

  // Score.
  const frac = (xs: TermHit[]) => (xs.length ? xs.filter((x) => x.inResume).length / xs.length : 1);
  const hardF = hardSkills.length ? frac(hardSkills) : frac(keywords);
  const pts = (f: number, max: number) => Math.round(f * max * 10) / 10;
  const breakdown = [
    { label: 'Hard skills & tools', points: pts(hardF, 40), max: 40 },
    { label: 'Job description keywords', points: pts(frac(keywords), 15), max: 15 },
    { label: 'Job title', points: pts(title.ok ? 1 : title.partial ? 0.6 : 0, 10), max: 10 },
    { label: 'Years of experience', points: pts(experience.ok === null ? 1 : experience.ok ? 1 : have && req ? Math.min(0.8, have / req) : 0.2, 10), max: 10 },
    { label: 'Education', points: pts(education.ok === null ? 1 : education.ok ? 1 : 0.3, 5), max: 5 },
    { label: 'ATS-friendly formatting', points: pts(formatting.filter((f) => f.ok).length / formatting.length, 20), max: 20 },
  ];
  const score = Math.round(breakdown.reduce((a, b) => a + b.points, 0));
  const all = [...hardSkills, ...keywords];
  const keywordMatch = all.length ? Math.round((all.filter((x) => x.inResume).length / all.length) * 100) : 0;

  const tips: string[] = [];
  const missingHard = hardSkills.filter((h) => !h.inResume).slice(0, 8).map((h) => h.term);
  if (missingHard.length) tips.push(`Add these skills/tools — only if you really have them: ${missingHard.join(', ')}.`);
  const missingKw = keywords.filter((k) => !k.inResume).slice(0, 6).map((k) => k.term);
  if (missingKw.length) tips.push(`Use the posting’s own wording where it is true for you: ${missingKw.join(', ')}.`);
  if (!title.ok) tips.push(`Put the job title “${job.title}” (or its closest true version) in your headline or summary.`);
  if (experience.ok === false) tips.push(experience.resumeYears ? `The posting asks for ${req}+ years; your resume shows about ${experience.resumeYears}. Highlight related projects, co-ops and labs.` : `The posting asks for ${req}+ years — show dates (e.g. “2021 – 2023”) for every role so an ATS can count them.`);
  if (education.ok === false) tips.push(`The posting mentions a ${education.required}; list your highest education clearly under “Education”.`);
  for (const f of formatting) if (!f.ok && f.tip) tips.push(f.tip);

  return { score, keywordMatch, hardSkills, keywords, title, experience, education, formatting, breakdown, tips };
}
