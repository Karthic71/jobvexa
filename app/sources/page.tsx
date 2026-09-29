'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { SourcesSnapshot } from '@/types/job';
import { CANADA_PLATFORMS, US_PLATFORMS, type PlatformKind } from '@/lib/aggregator/platforms';
import { SOURCE_META } from '@/lib/aggregator/sources/registry';
import { BRAND } from '@/lib/brand';
import { loadSources } from '@/lib/data';

const KIND: Record<PlatformKind, string> = {
  official: 'Official', general: 'General job boards', aggregator: 'Aggregators / meta-search', regional: 'Regional (province-focused)',
  'public-sector': 'Public sector', nonprofit: 'Non-profit',
};
const ext = { target: '_blank', rel: 'noopener noreferrer nofollow' } as const;

export default function Sources() {
  const [snap, setSnap] = useState<SourcesSnapshot | null>(null);
  useEffect(() => { loadSources().then(setSnap).catch(() => setSnap(null)); }, []);
  const sources = SOURCE_META.map((m) => {
    const live = snap?.sources.find((s) => s.id === m.id);
    return { ...m, enabled: live?.enabled ?? false, count: live?.count, error: live?.error, known: !!live };
  });
  const groups = (Object.keys(KIND) as PlatformKind[]).map((k) => [k, CANADA_PLATFORMS.filter((p) => p.kind === k)] as const).filter(([, l]) => l.length);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="card p-6">
        <h1 className="text-xl font-semibold">How {BRAND.name} works</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Every hour an automated job on GitHub asks the connected sources below for new postings — Canada first, then the USA — converts them into one
          common format, removes duplicates, keeps jobs that are still being seen, drops ones that have disappeared, and republishes this website. Searching and filtering then happen instantly in your browser. Every job
          links back to the original listing, and to every other portal where the same job was found.
        </p>
        {snap && <p className="mt-2 text-xs text-muted">Last refresh: {new Date(snap.updatedAt).toLocaleString()} · next one within the hour</p>}
        <dl className="mt-4 space-y-2 text-sm">
          <div><dt className="inline font-semibold">Geography: </dt><dd className="inline text-muted">every province and territory first, then US states; remote roles open to Canada or the US are included.</dd></div>
          <div><dt className="inline font-semibold">De-duplication: </dt><dd className="inline text-muted">postings are fingerprinted on normalised title + employer + city + province/state, so one job from three sources appears once, with all three apply links.</dd></div>
          <div><dt className="inline font-semibold">Freshness: </dt><dd className="inline text-muted">employer job boards are re-read every hour, so removed jobs disappear quickly; search-API jobs are dropped when not seen for 3 days, and anything older than 60 days is removed. A listing may still be filled before we notice.</dd></div>
          <div><dt className="inline font-semibold">Accuracy: </dt><dd className="inline text-muted">skills, certifications, seniority and salary are extracted automatically and can be wrong. Treat the original listing as the source of truth.</dd></div>
        </dl>
      </section>

      <section className="card p-6" aria-labelledby="src">
        <h2 id="src" className="text-lg font-semibold">Sources indexed</h2>
        <p className="mt-1 text-sm text-muted">Each connector uses a public API, a licensed API the site owner holds a key for, or a job board an employer publishes for exactly this purpose.</p>
        <ul className="mt-4 divide-y divide-line">
          {sources.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                {s.home ? <a href={s.home} {...ext} className="font-medium text-accent hover:underline">{s.name}</a> : <span className="font-medium">{s.name}</span>}
                <span className={`chip ${s.enabled ? 'bg-good/15 text-good' : 'bg-muted/15 text-muted'}`}>{s.enabled ? 'Enabled' : s.known ? 'Not configured' : 'Unknown'}</span>
                {s.enabled && s.count !== undefined && <span className="text-xs text-muted">{s.count.toLocaleString()} jobs last refresh</span>}
                {s.error && <span className="text-xs text-warn" title={s.error}>some requests failed</span>}
              </div>
              <p className="mt-1 text-sm text-muted">{s.what}</p>
              <p className="mt-1 text-xs text-muted"><span className="font-medium text-fg">Terms: </span>{s.legal}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-6" aria-labelledby="closed">
        <h2 id="closed" className="text-lg font-semibold">Not indexed (and why)</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div><dt className="font-semibold">LinkedIn</dt><dd className="text-muted">No public job-search API for third parties, and its terms prohibit automated collection.</dd></div>
          <div><dt className="font-semibold">Indeed</dt><dd className="text-muted">Its terms prohibit scraping of search results.</dd></div>
          <div><dt className="font-semibold">Glassdoor and similar sites</dt><dd className="text-muted">No open job-search API for third parties, and scraping is prohibited by their terms.</dd></div>
        </dl>
        <p className="mt-3 text-sm text-muted">Instead, when a licensed source tells us a job is also posted on one of these sites, we link to it directly, and every search offers pre-filled links to them. <Link href="/" className="text-accent hover:underline">Try a search</Link>.</p>
      </section>

      <section aria-labelledby="plat">
        <h2 id="plat" className="mb-3 text-lg font-semibold">Job platforms used in Canada</h2>
        <div className="space-y-5">
          {groups.map(([k, list]) => (
            <div key={k}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{KIND[k]}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((p) => (
                  <a key={p.name} href={p.home} {...ext} className="card block p-4 transition hover:border-accent/60">
                    <p className="font-semibold">{p.name} <span className="text-accent">↗</span></p>
                    <p className="mt-1 text-sm text-muted">{p.blurb}</p>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <h2 className="mb-3 mt-8 text-lg font-semibold">Job platforms used in the USA</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {US_PLATFORMS.map((p) => (
            <a key={p.name} href={p.home} {...ext} className="card block p-4 transition hover:border-accent/60">
              <p className="font-semibold">{p.name} <span className="text-accent">↗</span></p>
              <p className="mt-1 text-sm text-muted">{p.blurb}</p>
            </a>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">Platform names belong to their owners. Search-link formats are maintained on a best-effort basis and may change.</p>
      </section>
    </div>
  );
}
