'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import JobCard, { jobHref } from '@/components/JobCard';
import { STATUSES, trackerCsv, useApplied, useSaved, type AppStatus } from '@/components/useSaved';

const STATUS_STYLE: Record<AppStatus, string> = {
  saved: 'bg-muted/10 text-muted', applied: 'bg-accent/15 text-accent', interview: 'bg-warn/15 text-warn',
  offer: 'bg-good/15 text-good', rejected: 'bg-bad/10 text-bad', withdrawn: 'bg-muted/10 text-muted',
};
const label = (s: string) => s[0].toUpperCase() + s.slice(1);

function Body() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<'saved' | 'applied'>('saved');
  const [filter, setFilter] = useState<AppStatus | 'all'>('all');
  useEffect(() => { if (sp.get('tab') === 'applied') setTab('applied'); }, [sp]);
  const { saved, toggle } = useSaved();
  const { applied, unmark, update, mark } = useApplied();
  const list = Object.values(saved).sort((a, b) => +new Date(b.postedAt) - +new Date(a.postedAt));
  const all = Object.values(applied).sort((a, b) => +new Date(b.updatedAt ?? b.at) - +new Date(a.updatedAt ?? a.at));
  const done = all.filter((e) => filter === 'all' || (e.status ?? 'applied') === filter);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((e) => (e.status ?? 'applied') === s).length]));

  const exportCsv = () => {
    const blob = new Blob(['﻿' + trackerCsv(all)], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `jobvexa-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 text-sm" role="tablist">
          {([['saved', `Saved (${list.length})`], ['applied', `Application tracker (${all.length})`]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 ${tab === k ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'}`}>{l}</button>
          ))}
        </div>
        {tab === 'applied' && all.length > 0 && <button className="btn-ghost" onClick={exportCsv}>⬇ Export CSV</button>}
      </div>

      {tab === 'saved' ? (
        <div className="grid gap-3">
          {list.map((j) => (
            <div key={j.id} className="space-y-1">
              <JobCard job={j} saved onToggleSave={toggle} />
              {!applied[j.id] && <button className="text-xs text-accent hover:underline" onClick={() => { mark(j, 'Tracked manually'); update(j.id, { status: 'saved' }); }}>+ Add to application tracker</button>}
            </div>
          ))}
          {!list.length && <p className="card p-6 text-center text-muted">No saved jobs yet. Use ☆ Save on any listing. <Link href="/" className="text-accent hover:underline">Start searching</Link></p>}
        </div>
      ) : (
        <div>
          <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
            {(['all', ...STATUSES] as const).map((s) => (
              <button key={s} onClick={() => setFilter(s)} className={`rounded-full border px-3 py-1 ${filter === s ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg'}`}>
                {s === 'all' ? `All (${all.length})` : `${label(s)} (${counts[s]})`}
              </button>
            ))}
          </div>
          <div className="card overflow-x-auto">
            {done.length ? (
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="p-3">Job</th><th className="p-3">Status</th><th className="p-3">Applied via</th><th className="p-3">Date</th><th className="p-3">Notes</th><th className="p-3" /></tr></thead>
                <tbody>
                  {done.map((e) => (
                    <tr key={e.job.id} className="border-t border-line align-top">
                      <td className="p-3"><Link href={jobHref(e.job)} className="font-medium hover:text-accent hover:underline">{e.job.title}</Link><div className="text-xs text-muted">{e.job.company} · {[e.job.location.city, e.job.location.stateProvince].filter(Boolean).join(', ')}</div></td>
                      <td className="p-3">
                        <select aria-label={`Status for ${e.job.title}`} className={`field !w-auto !py-1 text-xs ${STATUS_STYLE[e.status ?? 'applied']}`} value={e.status ?? 'applied'} onChange={(ev) => update(e.job.id, { status: ev.target.value as AppStatus })}>
                          {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
                        </select>
                      </td>
                      <td className="p-3 text-muted">{e.portal}</td>
                      <td className="p-3 text-muted">{new Date(e.at).toLocaleDateString()}</td>
                      <td className="p-3"><textarea aria-label={`Notes for ${e.job.title}`} className="field min-w-[12rem] !py-1 text-xs" rows={2} placeholder="Recruiter, interview date, follow-up…" defaultValue={e.notes ?? ''} onBlur={(ev) => { if (ev.target.value !== (e.notes ?? '')) update(e.job.id, { notes: ev.target.value.slice(0, 2000) }); }} /></td>
                      <td className="p-3 text-right"><button className="text-xs text-muted underline" onClick={() => unmark(e.job.id)}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="p-6 text-center text-muted">{all.length ? 'No applications with this status.' : 'Jobs you open an application for appear here automatically. Track each one from Applied to Interview to Offer.'}</p>}
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Saved jobs and your tracker are stored only in this browser. Export to CSV to keep a copy.</p>
    </div>
  );
}

export default function SavedPage() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Body /></Suspense>;
}
