'use client';
import Link from 'next/link';
import type { JobListing } from '@/types/job';
import { industryLabel } from '@/lib/aggregator/params';
import { ApplyInline } from './ApplyOptions';

const SOURCE_LABEL: Record<JobListing['source'], string> = {
  canada_job_bank: 'Job Bank', usajobs: 'USAJobs', adzuna: 'Adzuna', jooble: 'Jooble', jsearch: 'JSearch',
  greenhouse: 'Greenhouse', lever: 'Lever', ashby: 'Ashby', smartrecruiters: 'SmartRecruiters', deep_link: 'Demo',
};
export const sourceLabel = (s: JobListing['source']) => SOURCE_LABEL[s];

export function formatSalary(s: JobListing['salary']): string | null {
  if (!s || (!s.min && !s.max)) return null;
  const f = (n: number) => (s.period === 'hourly' ? `$${n.toFixed(n % 1 ? 2 : 0)}` : `$${Math.round(n / 1000)}k`);
  const range = s.min && s.max && s.min !== s.max ? `${f(s.min)}–${f(s.max)}` : f((s.max ?? s.min) as number);
  return `${range} ${s.currency}${s.period === 'hourly' ? '/hr' : '/yr'}`;
}

/** "just now", "12 min ago", "3 h ago" — for data freshness. */
export function freshness(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 2) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export const jobHref = (j: Pick<JobListing, 'id' | 'title' | 'company'>) =>
  `/job/?id=${j.id}&t=${encodeURIComponent(j.title)}&c=${encodeURIComponent(j.company)}`;
export const companyHref = (name: string) => `/company/?name=${encodeURIComponent(name)}`;

export default function JobCard({ job, saved, onToggleSave }: { job: JobListing; saved: boolean; onToggleSave: (j: JobListing) => void }) {
  const salary = formatSalary(job.salary);
  const where = [job.location.city, job.location.stateProvince].filter(Boolean).join(', ') || job.location.country;
  return (
    <article className="card p-4 transition hover:border-accent/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            <Link href={jobHref(job)} className="hover:text-accent hover:underline">{job.title}</Link>
          </h3>
          <p className="text-sm text-muted">
            <Link href={companyHref(job.company)} className="hover:text-accent hover:underline">{job.company}</Link>
            {' · '}{where} {job.location.country === 'CA' ? '🇨🇦' : '🇺🇸'}
          </p>
        </div>
        <button onClick={() => onToggleSave(job)} aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save job'}
          className={`shrink-0 rounded-md border px-2 py-1 text-xs ${saved ? 'border-accent text-accent' : 'border-line text-muted hover:text-fg'}`}>
          {saved ? '★ Saved' : '☆ Save'}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="chip bg-accent/10 text-accent">{job.workType}</span>
        <span className="chip bg-muted/10 text-muted">{job.employmentType}</span>
        {job.seniority && <span className="chip bg-muted/10 text-muted">{job.seniority}</span>}
        <span className="chip bg-muted/10 text-muted">{industryLabel(job.industry)}</span>
        {salary && <span className="chip bg-good/10 text-good">{salary}</span>}
        {job.certifications?.slice(0, 3).map((c) => <span key={c} className="chip bg-warn/10 text-warn">{c}</span>)}
      </div>
      {job.descriptionSnippet && <p className="mt-2 line-clamp-2 text-sm text-muted">{job.descriptionSnippet}</p>}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-2 text-xs text-muted">
        <span>{timeAgo(job.postedAt)} · via {SOURCE_LABEL[job.source]}</span>
        <span className="flex items-start gap-2">
          <Link href={jobHref(job)} className="btn-ghost">Details</Link>
          <ApplyInline job={job} />
        </span>
      </div>
    </article>
  );
}
