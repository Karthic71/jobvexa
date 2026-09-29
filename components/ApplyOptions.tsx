'use client';
import Link from 'next/link';
import type { ApplyOption, JobListing } from '@/types/job';
import { useApplied } from './useSaved';

export const optionsFor = (j: JobListing): ApplyOption[] =>
  j.applyOptions?.length ? j.applyOptions : [{ portal: 'Original posting', url: j.applyUrl, direct: false }];

export const applyLabel = (o: ApplyOption) => (o.direct ? 'Apply on company site' : `Apply on ${o.portal}`);

const linkProps = { target: '_blank', rel: 'noopener noreferrer nofollow' } as const;

/** Compact version for job cards: main Apply button + "also posted on" links. */
export function ApplyInline({ job }: { job: JobListing }) {
  const { applied, mark } = useApplied();
  const opts = optionsFor(job);
  const [main, ...rest] = opts;
  return (
    <div className="flex flex-col items-end gap-1">
      <a href={main.url} {...linkProps} onClick={() => mark(job, main.portal)} className="btn" title={main.portal}>
        {applied[job.id] ? '✓ Applied · open again ↗' : `${applyLabel(main)} ↗`}
      </a>
      {rest.length > 0 && (
        <span className="text-[11px] text-muted">
          Also on{' '}
          {rest.slice(0, 3).map((o, i) => (
            <span key={o.portal}>{i > 0 && ', '}<a href={o.url} {...linkProps} onClick={() => mark(job, o.portal)} className="text-accent hover:underline">{o.portal.replace(/^Company site.*$/, 'company site')}</a></span>
          ))}
          {rest.length > 3 && ` +${rest.length - 3} more`}
        </span>
      )}
    </div>
  );
}

/** Full panel for the job page: every portal the job is posted on. */
export function ApplyPanel({ job }: { job: JobListing }) {
  const { applied, mark, unmark } = useApplied();
  const opts = optionsFor(job);
  const entry = applied[job.id];
  return (
    <section className="card p-4 text-sm" aria-labelledby="apply-h">
      <h2 id="apply-h" className="font-semibold">Where this job is posted</h2>
      <p className="mb-3 text-xs text-muted">Found on {opts.length} {opts.length === 1 ? 'site' : 'sites'}. Applying on the employer’s own site is usually best. Links open the original posting in a new tab.</p>
      <ul className="space-y-2">
        {opts.map((o, i) => (
          <li key={o.portal}>
            <a href={o.url} {...linkProps} onClick={() => mark(job, o.portal)}
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${i === 0 ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-accent hover:text-accent'}`}>
              <span className="font-medium">{o.portal}</span>
              <span className="shrink-0 text-xs">{o.direct ? 'Recommended · ' : ''}Apply ↗</span>
            </a>
          </li>
        ))}
      </ul>
      {entry ? (
        <p className="mt-3 text-xs text-good">✓ Marked as applied via {entry.portal} on {new Date(entry.at).toLocaleDateString()}. <button className="text-muted underline" onClick={() => unmark(job.id)}>Undo</button></p>
      ) : (
        <p className="mt-3 text-xs text-muted">Clicking an Apply link adds this job to your <Link href="/saved/?tab=applied" className="text-accent hover:underline">Applied</Link> list (stored only in this browser).</p>
      )}
    </section>
  );
}
