import type { CompanySummary, JobListing } from '@/types/job';
import { normalizeCompany } from './text';

/**
 * Curated career sites for large Canadian / North American employers.
 * Keys are normalizeCompany() forms. Verify periodically: career URLs change.
 */
const CURATED: Record<string, string> = {
  shopify: 'https://www.shopify.com/careers',
  'royal bank of': 'https://jobs.rbc.com/ca/en',
  rbc: 'https://jobs.rbc.com/ca/en',
  'toronto dominion bank': 'https://jobs.td.com/en/',
  td: 'https://jobs.td.com/en/',
  bmo: 'https://jobs.bmo.com/ca/en',
  'bank of montreal': 'https://jobs.bmo.com/ca/en',
  scotiabank: 'https://jobs.scotiabank.com/',
  cibc: 'https://cibc.wd3.myworkdayjobs.com/search',
  telus: 'https://www.telus.com/en/about/careers',
  rogers: 'https://jobs.rogers.com/',
  'rogers communications': 'https://jobs.rogers.com/',
  bell: 'https://jobs.bell.ca/',
  'bell media': 'https://jobs.bell.ca/',
  teleperformance: 'https://jobs.teleperformance.com/',
  tp: 'https://jobs.teleperformance.com/',
  amazon: 'https://www.amazon.jobs/en/locations/canada',
  google: 'https://www.google.com/about/careers/applications/',
  microsoft: 'https://careers.microsoft.com/',
  ibm: 'https://www.ibm.com/careers',
  cgi: 'https://www.cgi.com/en/careers',
  deloitte: 'https://www.deloitte.com/ca/en/careers.html',
  kpmg: 'https://www.kpmg.com/ca/en/home/careers.html',
  pwc: 'https://www.pwc.com/ca/en/careers.html',
  'ernst and young': 'https://www.ey.com/en_ca/careers',
  accenture: 'https://www.accenture.com/ca-en/careers',
  cisco: 'https://jobs.cisco.com/',
  'palo alto networks': 'https://jobs.paloaltonetworks.com/',
  crowdstrike: 'https://www.crowdstrike.com/careers/',
  'communications security establishment': 'https://www.cse-cst.gc.ca/en/careers',
  cse: 'https://www.cse-cst.gc.ca/en/careers',
  'government of canada': 'https://emploisfp-psjobs.cfp-psc.gc.ca/psrs-srfp/applicant/page1800',
  'canada revenue agency': 'https://www.canada.ca/en/revenue-agency/corporate/careers-cra.html',
  'university of toronto': 'https://uoft.wd3.myworkdayjobs.com/UofT_Careers',
  'university of waterloo': 'https://uwaterloo.ca/human-resources/careers',
  'conestoga college': 'https://www.conestogac.on.ca/careers',
  'university health network': 'https://www.uhn.ca/corporate/Careers',
  'nova scotia health': 'https://careers.nshealth.ca/',
  'air canada': 'https://www.aircanada.com/ca/en/aco/home/about/careers.html',
  'canadian tire': 'https://jobs.canadiantire.ca/',
  loblaw: 'https://careers.loblaw.ca/',
  walmart: 'https://careers.walmart.ca/',
  costco: 'https://www.costco.ca/jobs.html',
  'tim hortons': 'https://www.timhortons.ca/careers',
  starbucks: 'https://www.starbucks.ca/careers',
  mcdonalds: 'https://www.mcdonalds.com/ca/en-ca/careers.html',
  fedex: 'https://careers.fedex.com/',
  ups: 'https://www.jobs-ups.ca/',
  'canada post': 'https://www.canadapost-postescanada.ca/cpc/en/our-company/careers.page',
  'manulife': 'https://www.manulife.com/en/about/careers.html',
  'sun life': 'https://www.sunlife.ca/en/careers/',
  'great west lifeco': 'https://www.canadalife.com/about-us/careers.html',
  ericsson: 'https://www.ericsson.com/en/careers',
  blackberry: 'https://www.blackberry.com/us/en/company/careers',
  opentext: 'https://careers.opentext.com/',
  'open text': 'https://careers.opentext.com/',
};

export function slugify(name: string): string {
  return normalizeCompany(name).replace(/\s+/g, '-') || 'company';
}

const ATS_BOARD: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^https?:\/\/(?:job-)?boards\.greenhouse\.io\/([^/?#]+)/i, (m) => `https://boards.greenhouse.io/${m[1]}`],
  [/^https?:\/\/jobs\.lever\.co\/([^/?#]+)/i, (m) => `https://jobs.lever.co/${m[1]}`],
  [/^https?:\/\/jobs\.ashbyhq\.com\/([^/?#]+)/i, (m) => `https://jobs.ashbyhq.com/${m[1]}`],
  [/^https?:\/\/jobs\.smartrecruiters\.com\/([^/?#]+)/i, (m) => `https://jobs.smartrecruiters.com/${m[1]}`],
];

/** Resolve a company's career page: curated list → ATS board seen in listings → search fallback. */
export function resolveCareerSite(name: string, jobs: JobListing[] = []): { url: string; verified: boolean } {
  const key = normalizeCompany(name);
  if (CURATED[key]) return { url: CURATED[key], verified: true };
  for (const [k, url] of Object.entries(CURATED)) {
    if (k.length >= 5 && (key.startsWith(k + ' ') || key === k)) return { url, verified: true };
  }
  for (const j of jobs) {
    if (normalizeCompany(j.company) !== key) continue;
    for (const [re, fn] of ATS_BOARD) {
      const m = j.applyUrl.match(re);
      if (m) return { url: fn(m), verified: true };
    }
  }
  return { url: `https://www.google.com/search?q=${encodeURIComponent(`${name} careers`)}`, verified: false };
}

export function companyMatches(job: JobListing, wanted: string): boolean {
  const a = normalizeCompany(job.company);
  const b = normalizeCompany(wanted);
  return !!b && (a === b || a.startsWith(b + ' ') || b.startsWith(a + ' '));
}

/** Companies whose name contains every query term (used to show company cards for text searches). */
export function matchingCompanies(jobs: JobListing[], q: string, limit = 4): CompanySummary[] {
  const terms = normalizeCompany(q).split(' ').filter((t) => t.length > 1);
  if (!terms.length) return [];
  const by = new Map<string, { name: string; jobs: JobListing[] }>();
  for (const j of jobs) {
    const key = normalizeCompany(j.company);
    if (!key || !terms.every((t) => key.includes(t))) continue;
    const e = by.get(key) ?? { name: j.company, jobs: [] };
    e.jobs.push(j);
    by.set(key, e);
  }
  return [...by.values()]
    .sort((a, b) => b.jobs.length - a.jobs.length)
    .slice(0, limit)
    .map(({ name, jobs: js }) => {
      const c = resolveCareerSite(name, js);
      return { name, slug: slugify(name), count: js.length, careerUrl: c.url, careerVerified: c.verified };
    });
}
