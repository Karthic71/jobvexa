export interface SourceMeta {
  id: string;
  /** Must equal the adapter's `name`. */
  name: string;
  home: string;
  what: string;
  env: string[];
  /** How this source may lawfully be used. Shown on the Sources page. */
  legal: string;
}

export const SOURCE_META: SourceMeta[] = [
  { id: 'jobbank', name: 'Canada Job Bank', home: 'https://www.jobbank.gc.ca/', env: ['JOBBANK_FEED_URL'],
    what: 'Federal job board of the Government of Canada, via the feed you configure.',
    legal: 'Government of Canada content is published under the Open Government Licence – Canada. Attribution is shown on the Data attribution page. Confirm the terms of the specific feed you use.' },
  { id: 'usajobs', name: 'USAJobs', home: 'https://developer.usajobs.gov/', env: ['USAJOBS_API_KEY', 'USAJOBS_USER_AGENT'],
    what: 'Official API for US federal government jobs.',
    legal: 'Official API; free key and a contact email are required by USAJobs. Follow the USAJobs API terms.' },
  { id: 'adzuna', name: 'Adzuna', home: 'https://developer.adzuna.com/', env: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
    what: 'Licensed job-search API (Canada and US endpoints).',
    legal: 'Adzuna’s terms require visible attribution (“Jobs by Adzuna”) with a link. That is included on the Data attribution page and in job cards via the “via Adzuna” label. Keep within your plan’s rate limits.' },
  { id: 'jsearch', name: 'JSearch', home: 'https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch', env: ['RAPIDAPI_KEY'],
    what: 'Google for Jobs data via RapidAPI: widest coverage, and lists every portal a job is posted on (employer site, Indeed, LinkedIn, Glassdoor…).',
    legal: 'Commercial API used under your own RapidAPI account and plan. Read its terms about caching and public display before launch; the free tier has a small monthly quota.' },
  { id: 'jooble', name: 'Jooble', home: 'https://jooble.org/api/about', env: ['JOOBLE_API_KEY'],
    what: 'Jooble partner API: broad coverage of small and mid-size employers.',
    legal: 'Partner API used under your own key. Read Jooble’s API terms about display and attribution before launch.' },
  { id: 'greenhouse', name: 'Greenhouse', home: 'https://developers.greenhouse.io/job-board.html', env: ['GREENHOUSE_BOARDS'],
    what: 'Public Job Board API that employers publish for embedding their careers page.', legal: 'Public, documented, unauthenticated endpoint. Jobs link back to the employer’s own posting.' },
  { id: 'lever', name: 'Lever', home: 'https://github.com/lever/postings-api', env: ['LEVER_COMPANIES'],
    what: 'Public Postings API for employers using Lever.', legal: 'Public, documented, unauthenticated endpoint. Jobs link back to the employer’s own posting.' },
  { id: 'ashby', name: 'Ashby', home: 'https://developers.ashbyhq.com/docs/public-job-posting-api', env: ['ASHBY_BOARDS'],
    what: 'Public job posting API for employers using Ashby.', legal: 'Public, documented, unauthenticated endpoint. Jobs link back to the employer’s own posting.' },
  { id: 'smartrecruiters', name: 'SmartRecruiters', home: 'https://developers.smartrecruiters.com/', env: ['ENABLE_SMARTRECRUITERS', 'SMARTRECRUITERS_COMPANIES'],
    what: 'Posting API for employers using SmartRecruiters.', legal: 'Opt-in only. Enable it only if you have confirmed you may use it (permission or terms).' },
  { id: 'discovery', name: 'ATS auto-discovery', home: '', env: ['DISABLE_ATS_DISCOVERY'],
    what: 'When a company name is searched, tries that company’s public Greenhouse, Lever and Ashby boards. Enabled by default; set DISABLE_ATS_DISCOVERY=true to turn off.',
    legal: 'Uses only the same public endpoints as above, with short timeouts and cached misses so no employer is hit repeatedly.' },
];
