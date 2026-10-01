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
  { id: 'jobbank', name: 'Canada Job Bank', home: 'https://www.jobbank.gc.ca/', env: ['DISABLE_JOBBANK'],
    what: 'Government of Canada Job Bank — thousands of Canadian postings in every industry, read from its public job-search RSS feed. On by default, no key needed.',
    legal: 'Content published under the Open Government Licence – Canada (attribution on the Data attribution page). The connector reads robots.txt before every run, skips anything it disallows, and waits at least 5 seconds (or the requested crawl delay) between requests.' },
  { id: 'usajobs', name: 'USAJobs', home: 'https://developer.usajobs.gov/', env: ['USAJOBS_API_KEY', 'USAJOBS_USER_AGENT'],
    what: 'Official API for US federal government jobs.',
    legal: 'Official API; free key and a contact email are required by USAJobs. Follow the USAJobs API terms.' },
  { id: 'adzuna', name: 'Adzuna', home: 'https://developer.adzuna.com/', env: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
    what: 'Licensed job-search API (Canada and US endpoints).',
    legal: 'Adzuna’s terms require visible attribution (“Jobs by Adzuna”) with a link. That is included on the Data attribution page and in job cards via the “via Adzuna” label. Keep within your plan’s rate limits.' },
  { id: 'jsearch', name: 'JSearch', home: 'https://www.openwebninja.com/api/jsearch', env: ['OPENWEBNINJA_API_KEY', 'RAPIDAPI_KEY'],
    what: 'Google for Jobs data: widest coverage, and lists every portal a job is posted on (employer site, Indeed, LinkedIn, Glassdoor…). Use an OpenWeb Ninja key (free tier ≈200 requests/month); RapidAPI stopped taking new JSearch subscriptions in Sept 2026.',
    legal: 'Commercial API used under your own account and plan. Read its terms about caching and public display before launch; the free tier is small.' },
  { id: 'jooble', name: 'Jooble', home: 'https://jooble.org/api/about', env: ['JOOBLE_API_KEY'],
    what: 'Jooble partner API: broad coverage of small and mid-size employers.',
    legal: 'Partner API used under your own key. Read Jooble’s API terms about display and attribution before launch.' },
  { id: 'greenhouse', name: 'Greenhouse', home: 'https://developers.greenhouse.io/job-board.html', env: ['GREENHOUSE_BOARDS'],
    what: 'Public Job Board API that employers publish for embedding their careers page.', legal: 'Public, documented, unauthenticated endpoint. Jobs link back to the employer’s own posting.' },
  { id: 'lever', name: 'Lever', home: 'https://github.com/lever/postings-api', env: ['LEVER_COMPANIES'],
    what: 'Public Postings API for employers using Lever.', legal: 'Public, documented, unauthenticated endpoint. Jobs link back to the employer’s own posting.' },
  { id: 'ashby', name: 'Ashby', home: 'https://developers.ashbyhq.com/docs/public-job-posting-api', env: ['ASHBY_BOARDS'],
    what: 'Public job posting API for employers using Ashby.', legal: 'Public, documented, unauthenticated endpoint. Jobs link back to the employer’s own posting.' },
  { id: 'remotive', name: 'Remotive', home: 'https://remotive.com/', env: ['DISABLE_REMOTIVE'],
    what: 'Remote jobs open to Canada or the USA from the Remotive public API. On by default, no key needed.',
    legal: 'Remotive asks for at most 4 requests a day and a visible link back naming Remotive as the source — the collector checks it every 6 hours, and every job links to its Remotive page with “via Remotive”. We never collect emails or sign-ups.' },
  { id: 'himalayas', name: 'Himalayas', home: 'https://himalayas.app/', env: ['DISABLE_HIMALAYAS'],
    what: 'Remote jobs open to Canada (then the USA) from the Himalayas public search API, searched for the priority keywords. On by default, no key needed.',
    legal: 'Himalayas asks for a link back to their job page naming Himalayas as the source, and that their jobs are not submitted to other aggregators (Jobvexa publishes no job-feed markup). Requests are spaced 3 seconds apart.' },
  { id: 'smartrecruiters', name: 'SmartRecruiters', home: 'https://developers.smartrecruiters.com/', env: ['ENABLE_SMARTRECRUITERS', 'SMARTRECRUITERS_COMPANIES'],
    what: 'Posting API for employers using SmartRecruiters.', legal: 'Opt-in only. Enable it only if you have confirmed you may use it (permission or terms).' },
  { id: 'discovery', name: 'ATS auto-discovery', home: '', env: ['DISABLE_ATS_DISCOVERY'],
    what: 'For every employer in config/companies.txt, finds its public Greenhouse, Lever, Ashby, Workable or Recruitee careers board (checked hourly; unknown employers looked up at most 40 per run). Enabled by default; set DISABLE_ATS_DISCOVERY=true to turn off.',
    legal: 'Uses only the same public endpoints as above, with short timeouts and cached misses so no employer is hit repeatedly.' },
];
