import type { JobListing, SearchParams } from '@/types/job';
import { classifyIndustry, fetchText, finalize, htmlToText, inferEmploymentType, inferWorkType, parseSalaryText, safeIso, snippet, stripHtml } from '../normalize';
import { CA_PROVINCES, parseLocationString, toRegionCode } from '../regions';
import { parseRobots } from '../robots';
import { env, type SourceAdapter } from './types';

/**
 * Government of Canada Job Bank, read from its public job-search RSS feed.
 * Job Bank content is published under the Open Government Licence – Canada (attribution on /attribution).
 * Before any request, robots.txt is fetched and obeyed (paths and Crawl-delay). If robots.txt
 * can't be read or disallows the feed, the connector does nothing.
 *
 * JOBBANK_FEED_URL can override the feed; placeholders {q}, {where}, {page} are filled in.
 */
export const JOBBANK_ORIGIN = 'https://www.jobbank.gc.ca';
const DEFAULT_FEED = `${JOBBANK_ORIGIN}/jobsearch/feed/jobSearchRSSfeed?searchstring={q}&locationstring={where}&sort=D&page={page}`;
// Standard crawler format (like Googlebot): honest name + contact page.
export const BOT_UA = 'Mozilla/5.0 (compatible; JobvexaBot/1.0; +https://github.com/Karthic71/jobvexa)';

let robots: Promise<ReturnType<typeof parseRobots>> | null = null;
/** robots.txt for the feed's site, fetched once per run. */
export function jobBankRobots() {
  robots ??= fetchText(`${new URL(feedTemplate()).origin}/robots.txt`, { headers: { 'User-Agent': BOT_UA } }, 10000).then((t) => parseRobots(t, 'JobvexaBot'));
  robots.catch(() => { robots = null; });
  return robots;
}
export const resetJobBankRobots = () => { robots = null; };

const feedTemplate = () => env('JOBBANK_FEED_URL') || DEFAULT_FEED;

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : '';
}
const label = (text: string, ...names: string[]) => {
  for (const n of names) {
    const m = text.match(new RegExp(`(?:^|\\n|\\s)${n}\\s*[:\\-]\\s*([^\\n|]+)`, 'i'));
    if (m) return m[1].trim();
  }
  return '';
};

/** Pull employer / location / salary out of a Job Bank RSS item, whatever layout it uses. */
export function parseJobBankItem(block: string): { title: string; employer: string; location: string; salary: string; url: string; date: string; desc: string } | null {
  let title = stripHtml(tag(block, 'title'));
  const url = (stripHtml(tag(block, 'link')) || (block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '') || stripHtml(tag(block, 'guid'))).replace(/;jsessionid=[^?#]*/i, '');
  if (!title || !/^https?:\/\//.test(url)) return null;
  const descHtml = tag(block, 'description') || tag(block, 'summary');
  const desc = htmlToText(descHtml);
  let employer = stripHtml(tag(block, 'employer')) || label(desc, 'Employer', 'Company', 'Business');
  let location = stripHtml(tag(block, 'location')) || label(desc, 'Location', 'Work location', 'Job location');
  // Titles often look like "Cybersecurity analyst - Creyos - Toronto (ON)"
  const parts = title.split(/\s+[-–|]\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (!location && /\(([A-Z]{2})\)\s*$|,\s*[A-Z]{2}\s*$/.test(last)) { location = last; parts.pop(); }
    if (!employer && parts.length >= 2) employer = parts.pop()!;
    title = parts.join(' - ');
  }
  location = location.replace(/\s*\(([A-Z]{2})\)/, ', $1').trim();
  const salary = label(desc, 'Salary', 'Wage', 'Pay');
  return { title, employer, location, salary, url, date: stripHtml(tag(block, 'pubDate') || tag(block, 'updated') || tag(block, 'dc:date')), desc };
}

export function jobBankFeedUrl(p: SearchParams): string {
  const region = p.region && CA_PROVINCES[p.region] ? CA_PROVINCES[p.region] : '';
  const where = [p.city, region].filter(Boolean).join(', ');
  return feedTemplate()
    .replace('{q}', encodeURIComponent(p.q || p.company || ''))
    .replace('{where}', encodeURIComponent(where))
    .replace('{page}', String(Math.max(1, p.page || 1)));
}

export const jobBank: SourceAdapter = {
  name: 'Canada Job Bank',
  source: 'canada_job_bank',
  skipReason: () => (env('DISABLE_JOBBANK') === 'true' ? 'Disabled (DISABLE_JOBBANK=true)' : null),
  async fetch(p) {
    if (p.country === 'US') return [];
    const url = jobBankFeedUrl(p);
    const rules = await jobBankRobots();
    const u = new URL(url);
    if (!rules.allowed(u.pathname + u.search)) throw new Error('robots.txt does not allow this feed — skipped');
    // Job Bank answered HTTP 406 to a narrow Accept header, so accept anything and check the body instead.
    const body = await fetchText(url, { headers: { 'User-Agent': BOT_UA, Accept: '*/*', 'Accept-Language': 'en-CA,en;q=0.9' } }, 15000);
    if (!/<(rss|feed|channel)[\s>]/i.test(body)) throw new Error(`Job Bank did not return an RSS feed (starts: ${body.replace(/\s+/g, ' ').slice(0, 120)})`);

    const out: JobListing[] = [];
    for (const b of body.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) ?? []) {
      const it = parseJobBankItem(b);
      if (!it) continue;
      const loc = parseLocationString(it.location, 'CA');
      const region = loc.stateProvince || toRegionCode(p.region, 'CA');
      const text = `${it.title} ${it.desc}`;
      out.push(finalize({
        title: it.title,
        company: it.employer,
        location: { city: loc.city, stateProvince: region, country: 'CA', isRemote: /\bremote\b|work from home/i.test(text) },
        workType: inferWorkType(text),
        employmentType: inferEmploymentType(text),
        industry: classifyIndustry(it.title, it.desc),
        salary: parseSalaryText(it.salary, 'CA'),
        descriptionSnippet: snippet(it.desc),
        description: it.desc || undefined,
        applyUrl: it.url,
        applyOptions: [{ portal: 'Job Bank (Canada)', url: it.url, direct: false }],
        source: 'canada_job_bank',
        postedAt: safeIso(it.date),
      }));
    }
    return out;
  },
};
