import type { DeepLink, SearchParams } from '@/types/job';
import { regionsFor } from './regions';

export type PlatformKind = 'official' | 'general' | 'aggregator' | 'regional' | 'nonprofit' | 'public-sector';

export interface JobPlatform {
  name: string;
  kind: PlatformKind;
  home: string;
  blurb: string;
  /** Builds a pre-filtered search URL. Omit if the site has no reliable search URL. */
  search?: (a: { kw: string; where: string; days?: number; remote?: boolean }) => string;
}

const e = encodeURIComponent;

/** Job platforms used in Canada. Search URL patterns are best-effort; sites can change them. */
export const CANADA_PLATFORMS: JobPlatform[] = [
  { name: 'Job Bank (Canada)', kind: 'official', home: 'https://www.jobbank.gc.ca/', blurb: 'Government of Canada national job board.',
    search: ({ kw, where }) => `https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=${e(kw)}&locationstring=${e(where)}` },
  { name: 'Indeed Canada', kind: 'general', home: 'https://ca.indeed.com/', blurb: 'Largest general job search engine in Canada.',
    search: ({ kw, where, days, remote }) => `https://ca.indeed.com/jobs?q=${e(remote ? `${kw} remote`.trim() : kw)}&l=${e(where)}${days ? `&fromage=${days}` : ''}` },
  { name: 'LinkedIn Jobs', kind: 'general', home: 'https://www.linkedin.com/jobs/', blurb: 'Professional network; strong for white-collar roles.',
    search: ({ kw, where, days, remote }) => `https://www.linkedin.com/jobs/search/?keywords=${e(kw)}&location=${e(where)}${days ? `&f_TPR=r${days * 86400}` : ''}${remote ? '&f_WT=2' : ''}` },
  { name: 'Glassdoor Canada', kind: 'general', home: 'https://www.glassdoor.ca/Job/', blurb: 'Jobs plus company reviews and salaries.',
    search: ({ kw, where }) => `https://www.glassdoor.ca/Job/jobs.htm?sc.keyword=${e(kw)}&locKeyword=${e(where)}` },
  { name: 'ZipRecruiter Canada', kind: 'general', home: 'https://www.ziprecruiter.ca/', blurb: 'One-click apply to many employers.',
    search: ({ kw, where, days }) => `https://www.ziprecruiter.ca/jobs-search?search=${e(kw)}&location=${e(where)}${days ? `&days=${days}` : ''}` },
  { name: 'Monster Canada', kind: 'general', home: 'https://www.monster.ca/', blurb: 'Long-running general job board.',
    search: ({ kw, where }) => `https://www.monster.ca/jobs/search?q=${e(kw)}&where=${e(where)}` },
  { name: 'Talent.com', kind: 'aggregator', home: 'https://ca.talent.com/', blurb: 'Aggregator (formerly Neuvoo) with salary data.',
    search: ({ kw, where }) => `https://ca.talent.com/jobs?k=${e(kw)}&l=${e(where)}` },
  { name: 'Jooble Canada', kind: 'aggregator', home: 'https://ca.jooble.org/', blurb: 'Meta-search across many boards.',
    search: ({ kw, where }) => `https://ca.jooble.org/SearchResult?ukw=${e(kw)}&rgns=${e(where)}` },
  { name: 'Adzuna Canada', kind: 'aggregator', home: 'https://www.adzuna.ca/', blurb: 'Aggregator with salary insights.',
    search: ({ kw, where }) => `https://www.adzuna.ca/search?q=${e(kw)}&w=${e(where)}` },
  { name: 'SimplyHired Canada', kind: 'aggregator', home: 'https://www.simplyhired.ca/', blurb: 'Aggregator and salary estimator.',
    search: ({ kw, where }) => `https://www.simplyhired.ca/search?q=${e(kw)}&l=${e(where)}` },
  { name: 'Jobrapido Canada', kind: 'aggregator', home: 'https://ca.jobrapido.com/', blurb: 'Aggregator with email alerts.',
    search: ({ kw, where }) => `https://ca.jobrapido.com/?w=${e(kw)}&l=${e(where)}` },
  { name: 'Eluta.ca', kind: 'aggregator', home: 'https://www.eluta.ca/', blurb: 'Canadian search of employer career pages.',
    search: ({ kw, where }) => `https://www.eluta.ca/search?q=${e(kw)}&l=${e(where)}` },
  { name: 'Jobillico', kind: 'regional', home: 'https://www.jobillico.com/', blurb: 'Popular in Quebec (French/English).',
    search: ({ kw, where }) => `https://www.jobillico.com/search-jobs?skwd=${e(kw)}&sloc=${e(where)}` },
  { name: 'Jobboom', kind: 'regional', home: 'https://www.jobboom.com/', blurb: 'Quebec-focused job board.' },
  { name: 'Emplois Québec (Placement en ligne)', kind: 'regional', home: 'https://www.emploiquebec.gouv.qc.ca/', blurb: 'Quebec government employment services.' },
  { name: 'WorkBC', kind: 'regional', home: 'https://www.workbc.ca/jobs-careers/find-jobs', blurb: 'British Columbia job board.' },
  { name: 'Alberta Jobs (alis)', kind: 'regional', home: 'https://alis.alberta.ca/', blurb: 'Alberta career and job resources.' },
  { name: 'Work in Nova Scotia', kind: 'regional', home: 'https://careers.novascotia.ca/', blurb: 'Nova Scotia government and regional careers.' },
  { name: 'GC Jobs (Public Service)', kind: 'public-sector', home: 'https://emploisfp-psjobs.cfp-psc.gc.ca/', blurb: 'Federal public service postings.' },
  { name: 'CharityVillage', kind: 'nonprofit', home: 'https://charityvillage.com/jobs/', blurb: 'Non-profit and charity sector jobs.' },
  { name: 'Kijiji Jobs', kind: 'general', home: 'https://www.kijiji.ca/b-jobs/canada/c45l0', blurb: 'Local, trades and casual work.' },
  { name: 'Wellfound', kind: 'general', home: 'https://wellfound.com/jobs', blurb: 'Startup roles (tech-heavy).' },
];

/** Main US job platforms (second priority after Canada). */
export const US_PLATFORMS: JobPlatform[] = [
  { name: 'USAJOBS', kind: 'official', home: 'https://www.usajobs.gov/', blurb: 'Official US federal government job site.',
    search: ({ kw, where }) => `https://www.usajobs.gov/search/results/?k=${e(kw)}&l=${e(where)}` },
  { name: 'Indeed USA', kind: 'general', home: 'https://www.indeed.com/', blurb: 'Largest general job search engine in the US.',
    search: ({ kw, where, days, remote }) => `https://www.indeed.com/jobs?q=${e(remote ? `${kw} remote`.trim() : kw)}&l=${e(where)}${days ? `&fromage=${days}` : ''}` },
  { name: 'LinkedIn Jobs (USA)', kind: 'general', home: 'https://www.linkedin.com/jobs/', blurb: 'Professional network job search.',
    search: ({ kw, where, days, remote }) => `https://www.linkedin.com/jobs/search/?keywords=${e(kw)}&location=${e(where)}${days ? `&f_TPR=r${days * 86400}` : ''}${remote ? '&f_WT=2' : ''}` },
  { name: 'Glassdoor USA', kind: 'general', home: 'https://www.glassdoor.com/Job/', blurb: 'Jobs plus company reviews and salaries.',
    search: ({ kw, where }) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${e(kw)}&locKeyword=${e(where)}` },
  { name: 'ZipRecruiter USA', kind: 'general', home: 'https://www.ziprecruiter.com/', blurb: 'One-click apply to many employers.',
    search: ({ kw, where, days }) => `https://www.ziprecruiter.com/jobs-search?search=${e(kw)}&location=${e(where)}${days ? `&days=${days}` : ''}` },
  { name: 'Monster USA', kind: 'general', home: 'https://www.monster.com/', blurb: 'Long-running general job board.',
    search: ({ kw, where }) => `https://www.monster.com/jobs/search?q=${e(kw)}&where=${e(where)}` },
  { name: 'SimplyHired USA', kind: 'aggregator', home: 'https://www.simplyhired.com/', blurb: 'Aggregator and salary estimator.',
    search: ({ kw, where }) => `https://www.simplyhired.com/search?q=${e(kw)}&l=${e(where)}` },
  { name: 'CareerBuilder', kind: 'general', home: 'https://www.careerbuilder.com/', blurb: 'General US job board.',
    search: ({ kw, where }) => `https://www.careerbuilder.com/jobs?keywords=${e(kw)}&location=${e(where)}` },
  { name: 'Dice', kind: 'general', home: 'https://www.dice.com/', blurb: 'Tech-focused US job board.',
    search: ({ kw, where }) => `https://www.dice.com/jobs?q=${e(kw)}&location=${e(where)}` },
  { name: 'Idealist', kind: 'nonprofit', home: 'https://www.idealist.org/', blurb: 'Non-profit and social-impact jobs.' },
];

/**
 * Pre-filled search links. Canada is first priority: Canadian platforms come first;
 * US platforms follow when the search covers the USA.
 */
export function platformLinks(p: Pick<SearchParams, 'q' | 'country' | 'region' | 'city' | 'workType' | 'postedWithinDays'>, extraKw = ''): DeepLink[] {
  const kw = [p.q, extraKw].filter(Boolean).join(' ').trim();
  const build = (country: 'CA' | 'US', list: JobPlatform[]) => {
    const table = regionsFor(country);
    const regionName = p.region && table[p.region] ? table[p.region] : '';
    const regionMatches = !p.region || !!regionName;
    const where = (regionMatches ? [p.city, regionName].filter(Boolean).join(', ') : '') || (country === 'US' ? 'United States' : 'Canada');
    const args = { kw, where, days: p.postedWithinDays, remote: p.workType === 'remote' };
    return list.filter((x) => x.search).map((x) => ({ platform: x.name, url: x.search!(args), note: country }));
  };
  if (p.country === 'US') return build('US', US_PLATFORMS);
  if (p.country === 'CA') return build('CA', CANADA_PLATFORMS);
  return [...build('CA', CANADA_PLATFORMS), ...build('US', US_PLATFORMS)];
}
