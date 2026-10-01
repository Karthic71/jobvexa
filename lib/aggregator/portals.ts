import type { ApplyOption, JobSource } from '@/types/job';

/** Host → portal name. `direct` means the employer's own careers system. */
const HOSTS: [RegExp, string, boolean][] = [
  [/(^|\.)indeed\./i, 'Indeed', false],
  [/(^|\.)linkedin\.com$/i, 'LinkedIn', false],
  [/(^|\.)glassdoor\./i, 'Glassdoor', false],
  [/(^|\.)ziprecruiter\./i, 'ZipRecruiter', false],
  [/(^|\.)monster\./i, 'Monster', false],
  [/(^|\.)jobbank\.gc\.ca$/i, 'Job Bank (Canada)', false],
  [/(^|\.)talent\.com$/i, 'Talent.com', false],
  [/(^|\.)jooble\.org$/i, 'Jooble', false],
  [/(^|\.)adzuna\./i, 'Adzuna', false],
  [/(^|\.)simplyhired\./i, 'SimplyHired', false],
  [/(^|\.)eluta\.ca$/i, 'Eluta', false],
  [/(^|\.)jobillico\.com$/i, 'Jobillico', false],
  [/(^|\.)workbc\.ca$/i, 'WorkBC', false],
  [/(^|\.)usajobs\.gov$/i, 'USAJOBS', false],
  [/(^|\.)dice\.com$/i, 'Dice', false],
  [/(^|\.)careerbuilder\.com$/i, 'CareerBuilder', false],
  [/(^|\.)wellfound\.com$/i, 'Wellfound', false],
  [/(^|\.)remotive\.com$/i, 'Remotive', false],
  [/(^|\.)himalayas\.app$/i, 'Himalayas', false],
  [/(^|\.)greenhouse\.io$/i, 'Company site (Greenhouse)', true],
  [/(^|\.)lever\.co$/i, 'Company site (Lever)', true],
  [/(^|\.)ashbyhq\.com$/i, 'Company site (Ashby)', true],
  [/(^|\.)smartrecruiters\.com$/i, 'Company site (SmartRecruiters)', true],
  [/(^|\.)myworkdayjobs\.com$/i, 'Company site (Workday)', true],
  [/(^|\.)icims\.com$/i, 'Company site (iCIMS)', true],
  [/(^|\.)taleo\.net$/i, 'Company site (Taleo)', true],
  [/(^|\.)successfactors\.(com|eu)$/i, 'Company site (SuccessFactors)', true],
  [/(^|\.)bamboohr\.com$/i, 'Company site (BambooHR)', true],
  [/(^|\.)workable\.com$/i, 'Company site (Workable)', true],
  [/(^|\.)jobvite\.com$/i, 'Company site (Jobvite)', true],
  [/(^|\.)recruitee\.com$/i, 'Company site (Recruitee)', true],
];

const SOURCE_PORTAL: Record<JobSource, string> = {
  canada_job_bank: 'Job Bank (Canada)', usajobs: 'USAJOBS', adzuna: 'Adzuna', jooble: 'Jooble', jsearch: 'Original posting',
  greenhouse: 'Company site (Greenhouse)', lever: 'Company site (Lever)', ashby: 'Company site (Ashby)',
  smartrecruiters: 'Company site (SmartRecruiters)', workable: 'Company site (Workable)', recruitee: 'Company site (Recruitee)',
  remotive: 'Remotive', himalayas: 'Himalayas', deep_link: 'Original posting',
};

export function portalForUrl(url: string, fallback?: string): { portal: string; direct: boolean } {
  let host = '';
  try { host = new URL(url).hostname; } catch { /* invalid URL */ }
  for (const [re, portal, direct] of HOSTS) if (host && re.test(host)) return { portal, direct };
  if (fallback) return { portal: fallback, direct: false };
  // Unknown host that isn't a job board is most likely the employer's own careers page.
  return { portal: host ? `Company site (${host.replace(/^www\./, '')})` : 'Original posting', direct: !!host };
}

export const portalForSource = (s: JobSource) => SOURCE_PORTAL[s];

/** Merge option lists: one entry per portal, employer's own site first, then by the order given. */
export function mergeApplyOptions(...lists: (ApplyOption[] | undefined)[]): ApplyOption[] {
  const seen = new Map<string, ApplyOption>();
  const urls = new Set<string>();
  for (const list of lists) for (const o of list ?? []) {
    if (!o.url || !/^https?:\/\//i.test(o.url)) continue;
    const u = o.url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
    if (urls.has(u)) continue; // same link under a different label
    urls.add(u);
    const k = o.portal.toLowerCase();
    const prev = seen.get(k);
    if (!prev) seen.set(k, o);
    else if (o.direct && !prev.direct) seen.set(k, o);
  }
  const all = [...seen.values()];
  return [...all.filter((o) => o.direct), ...all.filter((o) => !o.direct)].slice(0, 12);
}
