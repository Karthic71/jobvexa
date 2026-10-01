'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { JobListing } from '@/types/job';
import { AUTH_LABEL, companyHref, formatSalary, freshness, sourceLabel, timeAgo } from '@/components/JobCard';
import { matchScore } from '@/lib/aggregator/resume';
import { STATUSES, useResume } from '@/components/useSaved';
import { ApplyPanel, applyLabel, optionsFor } from '@/components/ApplyOptions';
import AtsPanel from '@/components/AtsPanel';
import { useApplied, useSaved } from '@/components/useSaved';
import { buildDeepLinks } from '@/lib/aggregator/deeplinks';
import { resolveCareerSite } from '@/lib/aggregator/companies';
import { industryLabel } from '@/lib/aggregator/params';
import { friendlyError, loadDescription, loadJobs } from '@/lib/data';

const ext = { target: '_blank', rel: 'noopener noreferrer nofollow' } as const;

function Body() {
  const sp = useSearchParams();
  const id = sp.get('id') ?? '';
  const hintTitle = sp.get('t') ?? '';
  const hintCompany = sp.get('c') ?? '';
  const [job, setJob] = useState<JobListing | null | undefined>(undefined);
  const [err, setErr] = useState('');
  const { saved, toggle } = useSaved();
  const { mark, applied, update } = useApplied();
  const { profile } = useResume();

  useEffect(() => {
    let live = true;
    setJob(undefined); setErr('');
    loadJobs().then(async (snap) => {
      const j = snap.jobs.find((x) => x.id === id) ?? saved[id] ?? null;
      if (!j) { if (live) setJob(null); return; }
      const description = await loadDescription(id);
      if (live) setJob({ ...j, description });
    }).catch((e) => live && setErr(friendlyError(e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (err) return <div className="card p-6 text-bad" role="alert">{err}</div>;
  if (job === undefined) return <p className="text-muted">Loading job…</p>;
  if (job === null) {
    const links = buildDeepLinks({ q: [hintTitle, hintCompany].filter(Boolean).join(' '), country: 'ALL', region: '', city: '', industry: 'all', workType: 'all' });
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold">This job is no longer listed</h1>
        <p className="mt-1 text-sm text-muted">It may have been filled or removed since our last refresh.{hintTitle && ` You can still look for “${hintTitle}${hintCompany ? ` at ${hintCompany}` : ''}” on these sites:`}</p>
        <div className="mt-3 flex flex-wrap gap-2">{links.slice(0, 8).map((l) => <a key={l.platform + l.note} href={l.url} {...ext} className="btn-ghost !text-accent">{l.platform} ↗</a>)}</div>
        <Link href="/" className="btn mt-4">← Back to search</Link>
      </div>
    );
  }

  const salary = formatSalary(job.salary);
  const where = [job.location.city, job.location.stateProvince, job.location.country].filter(Boolean).join(', ');
  const text = job.description || job.descriptionSnippet;
  const career = resolveCareerSite(job.company, [job]);
  const platformLinks = buildDeepLinks({ q: `${job.title} ${job.company}`, country: job.location.country, region: job.location.stateProvince, city: job.location.city, industry: 'all', workType: 'all' });
  const main = optionsFor(job)[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <article className="card p-5 sm:p-6">
        <Link href="/" className="text-sm text-accent hover:underline" onClick={(e) => { if (window.history.length > 1) { e.preventDefault(); window.history.back(); } }}>← Back to results</Link>
        <h1 className="mt-3 text-2xl font-bold">{job.title}</h1>
        <p className="mt-1 text-muted">
          <Link href={companyHref(job.company)} className="font-medium text-fg hover:text-accent hover:underline">{job.company}</Link> · {where} {job.location.country === 'CA' ? '🇨🇦' : '🇺🇸'}
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip bg-accent/10 text-accent">{job.workType}</span>
          <span className="chip bg-muted/10 text-muted">{job.employmentType}</span>
          {job.seniority && <span className="chip bg-muted/10 text-muted">{job.seniority} level</span>}
          <span className="chip bg-muted/10 text-muted">{industryLabel(job.industry)}</span>
          {salary && <span className="chip bg-good/10 text-good">{salary}</span>}
          {job.auth?.map((a) => <span key={a} className={`chip ${a === 'sponsorship' ? 'bg-good/10 text-good' : a === 'must-be-eligible' ? 'bg-muted/10 text-muted' : 'bg-bad/10 text-bad'}`}>{AUTH_LABEL[a]}</span>)}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={main.url} {...ext} onClick={() => mark(job, main.portal)} className="btn">{applyLabel(main)} ↗</a>
          <a href="#ats" className="btn-ghost">📄 Check my resume (ATS score)</a>
          <button className="btn-ghost" onClick={() => toggle(job)} aria-pressed={!!saved[job.id]}>{saved[job.id] ? '★ Saved' : '☆ Save job'}</button>
          <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(window.location.href)}>Copy link</button>
        </div>
        <p className="mt-3 text-xs text-muted">Posted {timeAgo(job.postedAt)} · via {sourceLabel(job.source)}{job.seenAt && <> · <span className="text-good">●</span> last confirmed at the source {freshness(job.seenAt)}</>}</p>

        {applied[job.id] && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2">Application status
              <select className="field !w-auto" value={applied[job.id].status ?? 'applied'} onChange={(e) => update(job.id, { status: e.target.value as (typeof STATUSES)[number] })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
              </select>
            </label>
            <Link href="/saved/?tab=applied" className="text-xs text-accent hover:underline">Open tracker</Link>
          </div>
        )}

        {profile && (() => { const m = matchScore(job, profile); return (
          <section className="mt-5 rounded-lg border border-line p-3 text-sm" aria-label="Resume match">
            <p className="font-semibold">Resume match: <span className={m.score >= 60 ? 'text-good' : 'text-warn'}>{m.score}%</span></p>
            {m.matched.length > 0 && <p className="mt-1 text-xs text-muted">You have: {m.matched.join(', ')}</p>}
            {m.missing.length > 0 && <p className="mt-1 text-xs text-muted">Not on your resume (add if you have them): <span className="text-fg">{m.missing.join(', ')}</span></p>}
            <Link href="/match/" className="mt-1 inline-block text-xs text-accent hover:underline">Update resume keywords</Link>
          </section>
        ); })()}

        <h2 className="mt-6 text-lg font-semibold">Job description</h2>
        <div className="mt-2 whitespace-pre-line text-sm leading-relaxed">{text}</div>
        {!job.description && <p className="mt-3 text-xs text-muted">The source only provided a short summary. Open the posting from “Where this job is posted” to read it in full.</p>}

        {(job.certifications?.length || job.tools?.length || job.skills?.length) ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {([['Certifications', job.certifications, 'certs'], ['Tools', job.tools, 'tools'], ['Skills', job.skills, 'skills']] as const).map(([title, items, key]) => items?.length ? (
              <div key={title}>
                <h3 className="mb-1.5 text-sm font-semibold">{title}</h3>
                <div className="flex flex-wrap gap-1.5">{items.map((i) => <Link key={i} href={`/?${key}=${encodeURIComponent(i)}`} className="chip bg-muted/10 text-muted hover:text-accent">{i}</Link>)}</div>
              </div>
            ) : null)}
          </div>
        ) : null}
        <p className="mt-6 text-xs text-muted">Details such as skills, level and salary are extracted automatically and may be inaccurate. Always check the original posting.</p>
        <AtsPanel job={job} />
      </article>

      <aside className="space-y-4">
        <ApplyPanel job={job} />
        <section className="card p-4 text-sm">
          <h2 className="font-semibold">{job.company}</h2>
          <div className="mt-3 flex flex-col gap-2">
            <Link href={companyHref(job.company)} className="btn">All jobs at this company</Link>
            <a href={career.url} {...ext} className="btn-ghost">{career.verified ? 'Company career site ↗' : 'Find career site ↗'}</a>
          </div>
        </section>
        <section className="card p-4 text-sm">
          <h2 className="mb-1 font-semibold">Search for it on more portals</h2>
          <p className="mb-2 text-xs text-muted">Canada first, then USA.</p>
          <div className="flex flex-wrap gap-1.5">
            {platformLinks.map((l) => <a key={l.platform + l.note} href={l.url} {...ext} className="chip border border-line text-accent hover:bg-accent/10">{l.platform} ↗</a>)}
          </div>
        </section>
      </aside>
    </div>
  );
}

export default function JobPage() {
  return <Suspense fallback={<p className="text-muted">Loading job…</p>}><Body /></Suspense>;
}
