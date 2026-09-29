'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { JobListing } from '@/types/job';
import JobCard from '@/components/JobCard';
import { useSaved } from '@/components/useSaved';
import { companyMatches, resolveCareerSite } from '@/lib/aggregator/companies';
import { platformLinks } from '@/lib/aggregator/platforms';
import { sortJobs } from '@/lib/aggregator/query';
import { friendlyError, loadJobs } from '@/lib/data';

const ext = { target: '_blank', rel: 'noopener noreferrer nofollow' } as const;

function Body() {
  const sp = useSearchParams();
  const name = (sp.get('name') ?? '').trim();
  const [jobs, setJobs] = useState<JobListing[] | null>(null);
  const [err, setErr] = useState('');
  const { saved, toggle } = useSaved();

  useEffect(() => {
    let live = true;
    setJobs(null); setErr('');
    loadJobs().then((snap) => {
      const list = snap.jobs.filter((j) => companyMatches(j, name));
      if (live) setJobs(sortJobs(list, { q: '', country: 'ALL', region: '', city: '', industry: 'all', workType: 'all', employmentType: 'all', company: '', level: 'all', skills: [], certs: [], tools: [], sort: 'newest', page: 1, pageSize: 100 }));
    }).catch((e) => live && setErr(friendlyError(e)));
    return () => { live = false; };
  }, [name]);

  if (!name) return <div className="card p-6">No company selected. <Link href="/" className="text-accent hover:underline">Search jobs</Link></div>;
  if (err) return <div className="card p-6 text-bad" role="alert">{err}</div>;
  if (!jobs) return <p className="text-muted">Finding every job at {name}…</p>;
  const display = jobs[0]?.company ?? name;
  const career = resolveCareerSite(display, jobs);
  const links = platformLinks({ q: '', country: 'ALL', region: '', city: '', workType: 'all' }, display);

  return (
    <div>
      <Link href="/" className="text-sm text-accent hover:underline">← Back to search</Link>
      <section className="card mt-3 flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h1 className="text-2xl font-bold">{display}</h1>
          <p className="text-sm text-muted">{jobs.length} open {jobs.length === 1 ? 'job' : 'jobs'} in our latest refresh (Canada first)</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={career.url} {...ext} className="btn">{career.verified ? 'Visit career site ↗' : 'Find career site ↗'}</a>
          <Link href={`/?company=${encodeURIComponent(display)}`} className="btn-ghost">Filter & sort these jobs</Link>
        </div>
      </section>
      <div className="mt-4 grid gap-3">
        {jobs.map((j) => <JobCard key={j.id} job={j} saved={!!saved[j.id]} onToggleSave={toggle} />)}
        {!jobs.length && <p className="card p-6 text-center text-muted">No listings for this company in our latest refresh. Use the career site button above or the platform searches below — Indeed, LinkedIn and others often list roles we can’t index.</p>}
      </div>
      <section className="card mt-6 p-4">
        <h2 className="mb-1 text-sm font-semibold">Search {display} on job platforms (Canada first, then USA)</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {links.map((l) => <a key={l.platform + l.note} href={l.url} {...ext} className="btn-ghost !text-accent">{l.platform} ↗</a>)}
        </div>
      </section>
    </div>
  );
}

export default function CompanyPage() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Body /></Suspense>;
}
