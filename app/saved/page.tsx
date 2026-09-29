'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import JobCard, { jobHref } from '@/components/JobCard';
import { useApplied, useSaved } from '@/components/useSaved';

function Body() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<'saved' | 'applied'>('saved');
  useEffect(() => { if (sp.get('tab') === 'applied') setTab('applied'); }, [sp]);
  const { saved, toggle } = useSaved();
  const { applied, unmark } = useApplied();
  const list = Object.values(saved).sort((a, b) => +new Date(b.postedAt) - +new Date(a.postedAt));
  const done = Object.values(applied).sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return (
    <div>
      <div className="mb-4 flex gap-1 text-sm" role="tablist">
        {([['saved', `Saved (${list.length})`], ['applied', `Applied (${done.length})`]] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 ${tab === k ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'}`}>{l}</button>
        ))}
      </div>
      {tab === 'saved' ? (
        <div className="grid gap-3">
          {list.map((j) => <JobCard key={j.id} job={j} saved onToggleSave={toggle} />)}
          {!list.length && <p className="card p-6 text-center text-muted">No saved jobs yet. Use ☆ Save on any listing. <Link href="/" className="text-accent hover:underline">Start searching</Link></p>}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          {done.length ? (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="p-3">Job</th><th className="p-3">Company</th><th className="p-3">Applied via</th><th className="p-3">Date</th><th className="p-3" /></tr></thead>
              <tbody>
                {done.map((e) => (
                  <tr key={e.job.id} className="border-t border-line">
                    <td className="p-3"><Link href={jobHref(e.job)} className="font-medium hover:text-accent hover:underline">{e.job.title}</Link></td>
                    <td className="p-3 text-muted">{e.job.company}</td>
                    <td className="p-3 text-muted">{e.portal}</td>
                    <td className="p-3 text-muted">{new Date(e.at).toLocaleDateString()}</td>
                    <td className="p-3 text-right"><button className="text-xs text-muted underline" onClick={() => unmark(e.job.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="p-6 text-center text-muted">Jobs you open an application for appear here automatically.</p>}
        </div>
      )}
      <p className="mt-4 text-xs text-muted">Saved and applied lists are stored only in this browser.</p>
    </div>
  );
}

export default function SavedPage() {
  return <Suspense fallback={<p className="text-muted">Loading…</p>}><Body /></Suspense>;
}
