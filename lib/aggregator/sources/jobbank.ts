import type { JobListing } from '@/types/job';
import { classifyIndustry, htmlToText, fetchText, finalize, inferEmploymentType, inferWorkType, safeIso, snippet, stripHtml } from '../normalize';
import { parseLocationString } from '../regions';
import { env, type SourceAdapter } from './types';

/**
 * Canada Job Bank does not publish a single stable public search API, so this adapter
 * consumes a feed you configure via JOBBANK_FEED_URL. It accepts either:
 *   - RSS/Atom XML (<item> / <entry> with title, link, pubDate, description, optional <location>/<category>)
 *   - a JSON array of { title, employer, location, url, date, description, salary }
 * Query params {q} and {where} in the URL are substituted if present.
 */
function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? stripHtml(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')) : '';
}

export const jobBank: SourceAdapter = {
  name: 'Canada Job Bank',
  source: 'canada_job_bank',
  skipReason: () => (env('JOBBANK_FEED_URL') ? null : 'JOBBANK_FEED_URL not set'),
  async fetch(p) {
    if (p.country === 'US') return [];
    const url = env('JOBBANK_FEED_URL')
      .replace('{q}', encodeURIComponent(p.q))
      .replace('{where}', encodeURIComponent([p.city, p.region].filter(Boolean).join(' ')));
    const body = await fetchText(url, { headers: { Accept: 'application/json, application/rss+xml, application/xml' } });
    const out: JobListing[] = [];

    const push = (o: { title: string; employer?: string; location?: string; url: string; date?: string; desc?: string; cat?: string; sal?: string }) => {
      if (!o.title || !o.url) return;
      const l = parseLocationString(o.location ?? '', 'CA');
      const text = `${o.title} ${o.desc ?? ''}`;
      const nums = (o.sal ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
      out.push(finalize({
        title: o.title,
        company: o.employer ?? '',
        location: { city: l.city, stateProvince: l.stateProvince, country: 'CA', isRemote: /remote/i.test(text) },
        workType: inferWorkType(text),
        employmentType: inferEmploymentType(text),
        industry: classifyIndustry(o.title, o.cat),
        salary: nums.length ? { min: nums[0], max: nums[1] ?? nums[0], currency: 'CAD', period: Math.max(...nums) < 500 ? 'hourly' : 'yearly' } : undefined,
        descriptionSnippet: snippet(o.desc),
        description: htmlToText(o.desc),
        applyUrl: o.url,
        source: 'canada_job_bank',
        postedAt: safeIso(o.date),
      }));
    };

    if (body.trim().startsWith('[') || body.trim().startsWith('{')) {
      const j = JSON.parse(body);
      const arr: Record<string, string>[] = Array.isArray(j) ? j : j.jobs ?? j.results ?? [];
      for (const r of arr) push({ title: r.title, employer: r.employer ?? r.company, location: r.location, url: r.url ?? r.link, date: r.date ?? r.postedAt, desc: r.description, sal: r.salary });
    } else {
      const blocks = body.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) ?? [];
      for (const b of blocks) {
        const link = tag(b, 'link') || (b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '');
        push({ title: tag(b, 'title'), employer: tag(b, 'employer') || tag(b, 'author'), location: tag(b, 'location'), url: link, date: tag(b, 'pubDate') || tag(b, 'updated'), desc: tag(b, 'description') || tag(b, 'summary'), cat: tag(b, 'category') });
      }
    }
    return out;
  },
};
