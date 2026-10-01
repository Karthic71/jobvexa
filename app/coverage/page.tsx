'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { friendlyError, loadCoverage, type Coverage } from '@/lib/data';
import { freshness } from '@/components/JobCard';

export default function CoveragePage() {
  const [c, setC] = useState<Coverage | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { loadCoverage().then(setC).catch((e) => setErr(friendlyError(e))); }, []);
  if (err) return <div className="card p-6 text-bad" role="alert">{err}</div>;
  if (!c) return <p className="text-muted">Loading coverage report…</p>;
  const thin = c.keywords.filter((k) => k.thin);

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h1 className="text-lg font-semibold">Coverage report</h1>
        <p className="mt-1 text-sm text-muted">What the last hourly refresh did: {c.totals.jobs.toLocaleString()} jobs live ({c.totals.canada.toLocaleString()} in Canada), {c.totals.fetchedThisRun.toLocaleString()} fetched this run in {c.runSeconds}s · updated {freshness(c.updatedAt)}. <Link href="/sources" className="text-accent hover:underline">How sources work</Link></p>
        {thin.length > 0 && <p className="mt-2 text-sm text-warn">Thin keywords (fewer than 10 jobs): {thin.map((k) => k.keyword).join(', ')}. These fill in as the hourly searches rotate; add synonyms in <code>config/aliases.json</code> to widen them.</p>}
      </section>

      <section className="card overflow-x-auto" aria-label="Sources">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="p-3">Source</th><th className="p-3">Jobs on site</th><th className="p-3">Jobs this run</th><th className="p-3">Calls this run</th><th className="p-3">Used today / daily budget</th><th className="p-3">Last success</th><th className="p-3">Status</th></tr></thead>
          <tbody>
            {c.sources.map((s) => (
              <tr key={s.source} className="border-t border-line">
                <td className="p-3 font-medium">{s.source}</td>
                <td className="p-3 tabular-nums">{s.jobsOnSite !== undefined ? s.jobsOnSite.toLocaleString() : '—'}</td>
                <td className="p-3 tabular-nums">{s.jobsThisRun.toLocaleString()}</td>
                <td className="p-3 tabular-nums">{s.calls ?? '—'}</td>
                <td className="p-3 tabular-nums">{s.budgetToday ? `${s.usedToday ?? 0} / ${s.budgetToday}` : '—'}</td>
                <td className="p-3 text-muted">{s.lastSuccess ? freshness(s.lastSuccess) : '—'}</td>
                <td className={`p-3 text-xs ${s.error ? 'text-bad' : s.ok ? 'text-good' : 'text-muted'}`}>
                  {s.error ?? s.note ?? (s.ok ? 'ok' : '')}
                  {!s.error && s.lastError && <span className="mt-1 block text-bad">Last error ({freshness(s.lastError.at)}): {s.lastError.message}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto" aria-label="Keywords">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="p-3">Keyword</th><th className="p-3">Tier</th><th className="p-3">Jobs on site</th><th className="p-3">In Canada</th><th className="p-3">Searches this run</th><th className="p-3">Fetched this run</th><th className="p-3" /></tr></thead>
          <tbody>
            {c.keywords.map((k) => (
              <tr key={k.keyword} className="border-t border-line">
                <td className="p-3"><Link href={`/?q=${encodeURIComponent(`"${k.keyword}"`)}`} className="font-medium hover:text-accent hover:underline">{k.keyword}</Link></td>
                <td className="p-3 text-xs text-muted">{k.tier}</td>
                <td className="p-3 tabular-nums">{k.jobsNow.toLocaleString()}</td>
                <td className="p-3 tabular-nums">{k.canada.toLocaleString()}</td>
                <td className="p-3 tabular-nums">{k.callsThisRun}</td>
                <td className="p-3 tabular-nums">{k.fetchedThisRun}</td>
                <td className="p-3 text-xs">{k.thin ? <span className="text-warn">thin</span> : <span className="text-good">ok</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
