'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DashboardStats } from '@/types/job';
import { companyHref } from '@/components/JobCard';
import { industryLabel } from '@/lib/aggregator/params';
import { friendlyError, loadStats } from '@/lib/data';

const label = (s: string) => industryLabel(s).replace(/^\w/, (c) => c.toUpperCase());
const money = (n: number | null) => (n ? `$${n.toLocaleString('en-CA')}` : '—');

function Bars({ title, rows, href, fmt = label }: { title: string; rows: { key: string; count: number }[]; href?: (k: string) => string | null; fmt?: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="card p-4" aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {!rows.length && <p className="text-sm text-muted">No data yet.</p>}
      <ul className="space-y-2">
        {rows.map((r) => {
          const h = href?.(r.key);
          return (
            <li key={r.key} className="text-sm">
              <div className="mb-0.5 flex justify-between gap-2">
                {h ? <Link href={h} className="truncate hover:text-accent hover:underline">{fmt(r.key)}</Link> : <span className="truncate">{fmt(r.key)}</span>}
                <span className="tabular-nums text-muted">{r.count}</span>
              </div>
              <div className="h-2 rounded bg-line" role="presentation"><div className="h-2 rounded bg-accent" style={{ width: `${(r.count / max) * 100}%` }} /></div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stat({ label: l, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{l}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Trend({ data }: { data: { date: string; count: number }[] }) {
  const W = 720, H = 140, P = 6;
  const max = Math.max(1, ...data.map((d) => d.count));
  const pts = data.map((d, i) => [P + (i / (data.length - 1)) * (W - 2 * P), H - P - (d.count / max) * (H - 2 * P)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts.at(-1)![0].toFixed(1)},${H - P} L${pts[0][0].toFixed(1)},${H - P} Z`;
  const total = data.reduce((a, d) => a + d.count, 0);
  const peak = data.reduce((a, d) => (d.count > a.count ? d : a), data[0]);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Postings per day, last 30 days. ${total} total, peak ${peak.count} on ${peak.date}.`}>
        <path d={area} fill="rgb(var(--accent))" opacity=".15" />
        <path d={line} fill="none" stroke="rgb(var(--accent))" strokeWidth="2" strokeLinejoin="round" />
        {pts.map(([x, y], i) => <circle key={data[i].date} cx={x} cy={y} r="2.5" fill="rgb(var(--accent))"><title>{`${data[i].date}: ${data[i].count}`}</title></circle>)}
      </svg>
      <div className="flex justify-between text-xs text-muted"><span>{data[0].date}</span><span>peak {peak.count}/day · {total} total</span><span>{data.at(-1)!.date}</span></div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-accent">View as table</summary>
        <table className="mt-2 w-full text-left text-xs">
          <thead><tr className="text-muted"><th className="py-1">Date</th><th>Postings</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.date} className="border-t border-line"><td className="py-1">{d.date}</td><td className="tabular-nums">{d.count}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

export default function Dashboard() {
  const [country, setCountry] = useState<'ALL' | 'CA' | 'US'>('CA');
  const [s, setS] = useState<DashboardStats | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    setS(null); setErr('');
    loadStats().then((d) => live && setS(d[country])).catch((e) => live && setErr(friendlyError(e)));
    return () => { live = false; };
  }, [country]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Market dashboard</h1>
          <p className="text-xs text-muted">{s ? `Aggregate view of every posting currently indexed · updated ${new Date(s.updatedAt).toLocaleString()} · refreshes every hour` : 'Aggregate view of every posting currently indexed'}</p>
        </div>
        <div className="flex gap-1 text-sm" role="tablist" aria-label="Country">
          {(['CA', 'US', 'ALL'] as const).map((c) => (
            <button key={c} role="tab" aria-selected={country === c} onClick={() => setCountry(c)} className={`rounded-lg px-3 py-1.5 ${country === c ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'}`}>{c === 'ALL' ? 'Canada + USA' : c === 'CA' ? 'Canada' : 'USA'}</button>
          ))}
        </div>
      </div>
      {err && <div role="alert" className="card border-bad/40 p-3 text-sm text-bad">{err}</div>}
      {!s && !err && <p className="text-muted">Collecting data from all sources…</p>}
      {s && (
        <div className="space-y-4">
          {s.usedMock && <p className="chip bg-warn/15 text-warn">Demo data — see the README to connect real sources</p>}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Open postings" value={String(s.total)} />
            <Stat label="Posted today" value={String(s.newToday)} sub={`${s.new7d} in the last 7 days`} />
            <Stat label="Employers" value={String(s.companies)} />
            <Stat label="Median salary" value={money(s.medianYearlySalary)} sub={`${s.withSalary} postings disclose pay`} />
            <Stat label="Remote" value={String(s.remote)} sub={`${Math.round(s.remoteShare * 100)}% of postings`} />
            <Stat label="Hybrid" value={String(s.hybrid)} />
            <Stat label="Entry / co-op friendly" value={String(s.entryLevel)} />
            <Stat label="Connected sources" value={String(s.sources.filter((x) => x.ok).length)} sub={`${s.sources.length} available`} />
          </div>
          <section className="card p-4"><h2 className="mb-2 text-sm font-semibold">Postings per day (last 30 days)</h2><Trend data={s.perDay} /></section>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Bars title="By industry" rows={s.byIndustry} href={(k) => `/?industry=${k}`} />
            <Bars title="By province / state" rows={s.byRegion} href={(k) => (/^[A-Z]{2}$/.test(k) ? `/?region=${k}` : null)} fmt={(k) => k} />
            <Bars title="Top cities" rows={s.byCity} href={(k) => (k === 'Remote' ? '/?workType=remote' : `/?city=${encodeURIComponent(k)}`)} fmt={(k) => k} />
            <Bars title="Work type" rows={s.byWorkType} href={(k) => `/?workType=${k}`} />
            <Bars title="Experience level" rows={s.byLevel} href={(k) => `/?level=${k}`} />
            <Bars title="Top employers" rows={s.topCompanies.map((c) => ({ key: c.name, count: c.count }))} href={(k) => companyHref(k)} fmt={(k) => k} />
            <Bars title="Most-requested tools & technologies" rows={s.topTools} href={(k) => `/?tools=${encodeURIComponent(k)}`} fmt={(k) => k} />
            <Bars title="Most-requested certifications" rows={s.topCerts} href={(k) => `/?certs=${encodeURIComponent(k)}`} fmt={(k) => k} />
            <Bars title="Most-requested skills" rows={s.topSkills} href={(k) => `/?skills=${encodeURIComponent(k)}`} fmt={(k) => k} />
            <Bars title="Postings by source" rows={s.bySource} />
            <section className="card p-4" aria-label="Source status">
              <h2 className="mb-3 text-sm font-semibold">Source status</h2>
              <ul className="space-y-1.5 text-sm">
                {s.sources.map((x) => (
                  <li key={x.source} className="flex justify-between gap-2">
                    <span>{x.source}</span>
                    <span className={x.ok ? 'text-good' : x.error ? 'text-bad' : 'text-muted'} title={x.error ?? x.skipped}>{x.ok ? `${x.count} jobs` : x.error ? 'error' : 'not configured'}</span>
                  </li>
                ))}
              </ul>
              <Link href="/sources" className="mt-3 inline-block text-xs text-accent hover:underline">How to enable more sources →</Link>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
