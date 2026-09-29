'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JobListing, JobsSnapshot, SearchResponse } from '@/types/job';
import { friendlyError, loadJobs } from '@/lib/data';
import { querySnapshot } from '@/lib/aggregator/query';
import { INDUSTRIES, parseSearchParams } from '@/lib/aggregator/params';
import { CA_PROVINCES, US_STATES } from '@/lib/aggregator/regions';
import JobCard, { companyHref, freshness } from './JobCard';
import { resolveCareerSite } from '@/lib/aggregator/companies';
import { useSaved } from './useSaved';

const DEFAULTS = {
  q: '', country: 'ALL', region: '', city: '', industry: 'all', workType: 'all', employmentType: 'all', company: '',
  minSalary: '', maxSalary: '', days: '', from: '', to: '', level: 'all', skills: '', certs: '', tools: '',
  sort: 'relevance', pageSize: '25', inf: '',
};
type Filters = typeof DEFAULTS;

const PRESETS: [string, string][] = [
  ['🛡️ Cybersecurity', 'security'], ['☁️ Cloud', 'cloud'], ['🩺 Nursing', 'nurse'], ['🔧 Trades', 'electrician'],
  ['📊 Finance', 'analyst'], ['🎧 Customer service', 'customer service'], ['🍽️ Hospitality', 'cook'], ['🚚 Logistics', 'warehouse'],
];

const csv = (s: string) => s.split(',').filter(Boolean);
const RECENT_KEY = 'jobvexa.recent.v1';
const SUGGEST = ['SOC analyst', 'nurse', 'electrician', 'software developer', 'accountant', 'customer service', 'warehouse', 'cook', 'teacher', 'security guard', 'truck driver', 'remote'];

export default function JobSearch() {
  const [f, setF] = useState<Filters>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [page, setPage] = useState(1);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [meta, setMeta] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
  const { saved, toggle } = useSaved();
  const [draft, setDraft] = useState({ q: '', city: '' });
  const [focus, setFocus] = useState(false);
  const [recent, setRecent] = useState<{ q: string; city: string; hits?: number }[]>([]);
  const sentinel = useRef<HTMLDivElement>(null);

  // Restore filters from the URL (shareable searches).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setF((p) => ({ ...p, ...Object.fromEntries([...sp.entries()].filter(([k]) => k in DEFAULTS)) }));
    setDraft({ q: sp.get('q') ?? '', city: sp.get('city') ?? '' });
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')); } catch { /* ignore */ }
    setReady(true);
  }, []);

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v && v !== DEFAULTS[k as keyof Filters]) sp.set(k, v);
    return sp;
  }, [f]);

  // Load the published snapshot once, then search it instantly in the browser.
  const [snap, setSnap] = useState<JobsSnapshot | null>(null);
  useEffect(() => {
    loadJobs().then(setSnap).catch((e) => { setError(friendlyError(e)); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!ready || !snap) return;
    const sp = new URLSearchParams(query); sp.delete('inf'); sp.set('page', String(page));
    const json = querySnapshot(snap, parseSearchParams(sp));
    setMeta(json); setError(''); setLoading(false);
    setJobs((prev) => (f.inf && page > 1 ? [...prev, ...json.jobs.filter((j) => !prev.some((p) => p.id === j.id))] : json.jobs));
    if (page === 1 && f.q) {
      setRecent((r) => {
        const next = r.map((x) => (x.q.toLowerCase() === f.q.toLowerCase() && x.city === f.city ? { ...x, hits: json.total } : x));
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, page, ready, snap]);

  useEffect(() => {
    if (ready) window.history.replaceState(null, '', query.toString() ? `?${query}` : window.location.pathname);
  }, [query, ready]);

  const pages = meta ? Math.max(1, Math.ceil(meta.total / meta.pageSize)) : 1;

  // Infinite scroll
  useEffect(() => {
    if (!f.inf || !sentinel.current) return;
    const el = sentinel.current;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting && !loading && page < pages) setPage((p) => p + 1); }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [f.inf, loading, page, pages]);

  const set = useCallback((k: keyof Filters, v: string) => {
    setF((p) => ({ ...p, [k]: v, ...(k === 'country' ? { region: '' } : {}), ...(k === 'days' ? { from: '', to: '' } : {}), ...(k === 'from' || k === 'to' ? { days: '' } : {}) }));
    setPage(1);
  }, []);
  const toggleTag = (k: 'skills' | 'certs' | 'tools', v: string) => {
    const cur = csv(f[k]); set(k, (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(','));
  };
  const clear = () => { setF(DEFAULTS); setDraft({ q: '', city: '' }); setPage(1); };
  const run = (q: string, city: string) => {
    const query = q.trim(), c = city.trim();
    setDraft({ q: query, city: c });
    setF((p) => ({ ...p, q: query, city: c, company: '' }));
    setPage(1); setFocus(false);
    if (query) {
      setRecent((r) => {
        const next = [{ q: query, city: c }, ...r.filter((x) => !(x.q.toLowerCase() === query.toLowerCase() && x.city === c))].slice(0, 6);
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    }
  };
  const clearRecent = () => { setRecent([]); try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ } };

  // Canada first: provinces/territories, then US states.
  const regionOpt = (m: Record<string, string>) => Object.entries(m).sort((a, b) => a[1].localeCompare(b[1]))
    .map(([c, n]) => [c, n + (meta?.facets.region[c] ? ` (${meta.facets.region[c]})` : '')] as [string, string]);
  const regionOptions: [string, string, boolean?][] = f.country === 'CA' ? regionOpt(CA_PROVINCES) : f.country === 'US' ? regionOpt(US_STATES)
    : [['__ca', '— Canada —', true], ...regionOpt(CA_PROVINCES), ['__us', '— United States —', true], ...regionOpt(US_STATES)];
  const activeCount = Object.entries(f).filter(([k, v]) => v && v !== 'all' && !['sort', 'pageSize', 'inf'].includes(k) && !(k === 'country' && v === 'ALL')).length;

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); run(draft.q, draft.city); (document.activeElement as HTMLElement | null)?.blur?.(); }} className="mb-3 flex flex-col gap-2 sm:flex-row" role="search">
        <div className="relative flex-1">
          <input className="field pr-9" placeholder="Job title, skill or company (try “Shopify” or “TP Canada”)" aria-label="Keywords" autoComplete="off"
            value={draft.q} onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} />
          {draft.q && <button type="button" aria-label="Clear search" onClick={() => run('', draft.city)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-fg">✕</button>}
          {focus && (
            <div className="card absolute left-0 right-0 top-full z-20 mt-1 max-h-96 overflow-auto p-3 text-sm shadow-lg" role="listbox">
              {recent.length > 0 && (
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-muted"><span>Recent searches</span><button type="button" onMouseDown={(e) => e.preventDefault()} onClick={clearRecent} className="normal-case text-accent">Clear</button></div>
                  {recent.map((r) => (
                    <button type="button" key={r.q + r.city} onMouseDown={(e) => e.preventDefault()} onClick={() => run(r.q, r.city)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-accent/10">
                      <span>↺ {r.q}{r.city ? ` · ${r.city}` : ''}</span>{r.hits !== undefined && <span className="text-xs text-muted">{r.hits} hits</span>}
                    </button>
                  ))}
                </div>
              )}
              <div className="mb-1 text-xs uppercase tracking-wide text-muted">Try</div>
              <div className="flex flex-wrap gap-1.5">
                {SUGGEST.map((t) => <button type="button" key={t} onMouseDown={(e) => e.preventDefault()} onClick={() => run(t, draft.city)} className="rounded-full border border-line px-3 py-1 text-xs text-muted hover:border-accent hover:text-accent">{t}</button>)}
              </div>
            </div>
          )}
        </div>
        <input className="field sm:max-w-[14rem]" placeholder="City" aria-label="City" value={draft.city} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} />
        <button type="submit" className="btn px-6 py-2">Search</button>
      </form>
      <div className="mb-4 flex flex-wrap gap-2 text-xs" aria-label="Quick searches">
        {PRESETS.map(([label, q]) => (
          <button key={q} type="button" onClick={() => run(q, draft.city)} className={`rounded-full border px-3 py-1 ${f.q === q ? 'border-accent text-accent' : 'border-line text-muted hover:text-fg'}`}>{label}</button>
        ))}
      </div>

      {f.company && (
        <div className="card mb-4 flex items-center justify-between gap-2 border-accent/50 p-3 text-sm">
          <span>Showing all jobs at <b>{f.company}</b></span>
          <button className="btn-ghost" onClick={() => set('company', '')}>Clear company</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="card h-fit space-y-3 p-4 text-sm" aria-label="Filters">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Filters {activeCount > 0 && <span className="chip bg-accent/15 text-accent">{activeCount}</span>}</h2>
            <button onClick={clear} className="text-xs text-accent">Clear all</button>
          </div>
          <Select label="Country" value={f.country} onChange={(v) => set('country', v)} options={[['ALL', 'Canada first, then USA'], ['CA', 'Canada only'], ['US', 'USA only']]} />
          <Select label={f.country === 'US' ? 'State' : f.country === 'CA' ? 'Province / territory' : 'Province / state'} value={f.region} onChange={(v) => set('region', v)}
            options={[['', 'Anywhere'], ...regionOptions]} />
          <Select label="Industry" value={f.industry} onChange={(v) => set('industry', v)}
            options={[['all', 'All industries'], ...INDUSTRIES.map((i) => [i.value, i.label + (meta?.facets.industry[i.value] ? ` (${meta.facets.industry[i.value]})` : '')] as [string, string])]} />
          <Select label="Work type" value={f.workType} onChange={(v) => set('workType', v)} options={[['all', 'Any'], ['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']]} />
          <Select label="Employment" value={f.employmentType} onChange={(v) => set('employmentType', v)} options={[['all', 'Any'], ['full-time', 'Full-time'], ['part-time', 'Part-time'], ['contract', 'Contract'], ['internship', 'Internship'], ['temporary', 'Temporary']]} />
          <div>
            <span className="mb-1 block text-xs text-muted">Date posted</span>
            <div className="flex flex-wrap gap-1.5">
              {([['', 'Any time'], ['1', 'Today'], ['3', '3 days'], ['7', '7 days'], ['14', '14 days'], ['30', '30 days']] as const).map(([v, l]) => (
                <button key={l} type="button" aria-pressed={!f.from && !f.to && f.days === v} onClick={() => set('days', v)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${!f.from && !f.to && f.days === v ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg'}`}>{l}</button>
              ))}
              <button type="button" aria-pressed={!!(f.from || f.to)} onClick={() => set('from', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10))}
                className={`rounded-full border px-2.5 py-1 text-xs ${f.from || f.to ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg'}`}>Custom</button>
            </div>
          </div>
          {(f.from || f.to) && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted">From<input type="date" className="field mt-1" value={f.from} onChange={(e) => set('from', e.target.value)} /></label>
              <label className="block text-xs text-muted">To<input type="date" className="field mt-1" value={f.to} onChange={(e) => set('to', e.target.value)} /></label>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-muted">Min salary<input type="number" min={0} step={5000} className="field mt-1" placeholder="60000" value={f.minSalary} onChange={(e) => set('minSalary', e.target.value)} /></label>
            <label className="block text-xs text-muted">Max salary<input type="number" min={0} step={5000} className="field mt-1" placeholder="150000" value={f.maxSalary} onChange={(e) => set('maxSalary', e.target.value)} /></label>
          </div>
          <p className="-mt-1 text-[11px] text-muted">Yearly equivalent (hourly × 2,080).</p>

          <button onClick={() => setShowMore((s) => !s)} aria-expanded={showMore} className="btn-ghost w-full">{showMore ? '− Fewer options' : '+ More options'}</button>
          {showMore && (
            <div className="space-y-3">
              <Select label="Experience level" value={f.level} onChange={(v) => set('level', v)}
                options={[['all', 'Any'], ...['entry', 'mid', 'senior', 'lead', 'manager', 'executive'].map((l) => [l, l[0].toUpperCase() + l.slice(1) + (meta?.facets.level[l] ? ` (${meta.facets.level[l]})` : '')] as [string, string])]} />
              <TagPicker label="Certifications" selected={csv(f.certs)} options={meta?.facets.certs ?? {}} onToggle={(v) => toggleTag('certs', v)} />
              <TagPicker label="Tools" selected={csv(f.tools)} options={meta?.facets.tools ?? {}} onToggle={(v) => toggleTag('tools', v)} />
              <TagPicker label="Skills" selected={csv(f.skills)} options={meta?.facets.skills ?? {}} onToggle={(v) => toggleTag('skills', v)} />
            </div>
          )}
        </aside>

        <main>
          {meta && meta.companies.length > 0 && (
            <section aria-label="Matching companies" className="mb-4">
              <h2 className="mb-2 text-sm font-semibold">Companies matching “{f.q}”</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {meta.companies.map((c) => (
                  <div key={c.slug} className="card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted">{c.count} open {c.count === 1 ? 'job' : 'jobs'}</p></div>
                      <Link href={companyHref(c.name)} className="btn">All jobs</Link>
                    </div>
                    <a href={c.careerUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-block text-xs text-accent hover:underline">
                      {c.careerVerified ? 'Career site ↗' : 'Find career site ↗'}
                    </a>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted" aria-live="polite">
            <span>
              {loading && !jobs.length ? 'Searching all sources…' : `${meta?.total ?? 0} jobs`}
              {meta && !meta.usedMock && <span className="ml-2 text-xs" title={new Date(meta.updatedAt).toLocaleString()}>· <span className="text-good">●</span> updated {freshness(meta.updatedAt)} · refreshes every hour</span>}
              {meta?.usedMock && <span className="chip ml-2 bg-warn/15 text-warn">Demo data — see README to add real sources</span>}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={!!f.inf} onChange={(e) => { set('inf', e.target.checked ? '1' : ''); }} /> Infinite scroll</label>
              <select aria-label="Sort" className="field !w-auto" value={f.sort} onChange={(e) => set('sort', e.target.value)}>
                <option value="relevance">Best match</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option>
                <option value="salary">Highest salary</option><option value="company">Company A–Z</option>
              </select>
              <select aria-label="Results per page" className="field !w-auto" value={f.pageSize} onChange={(e) => set('pageSize', e.target.value)}>
                {['10', '25', '50', '100'].map((n) => <option key={n} value={n}>{n} / page</option>)}
              </select>
            </span>
          </div>

          {error && <div role="alert" className="card mb-3 border-bad/40 p-3 text-sm text-bad">{error}</div>}

          <div className={`grid gap-3 ${loading && jobs.length ? 'opacity-60' : ''}`}>
            {jobs.map((j) => <JobCard key={j.id} job={j} saved={!!saved[j.id]} onToggleSave={toggle} />)}
            {!loading && !jobs.length && meta && (
              <section className="card p-5" aria-label="No results">
                <h2 className="font-semibold">{f.q || f.company ? `No listings for “${f.q || f.company}” in our connected sources yet` : 'No jobs match these filters'}</h2>
                <p className="mt-1 text-sm text-muted">
                  {meta.usedMock ? 'This copy is showing demo data only. ' : `We searched ${snap?.jobs.length.toLocaleString() ?? 0} jobs, refreshed every hour. `}
                  Big job sites like Indeed and LinkedIn don’t share their listings with other sites, so we open them for you with the same search:
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {meta.deepLinks.map((l) => <a key={l.platform + l.note} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost !text-accent">{l.platform} ↗</a>)}
                </div>
                {(f.q || f.company) && (() => { const name = f.company || f.q; const c = resolveCareerSite(name.replace(/\b\w/g, (x) => x.toUpperCase())); return (
                  <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="btn mt-4">{c.verified ? `${name} career site ↗` : `Find ${name} careers ↗`}</a>
                ); })()}
                <p className="mt-4 text-xs text-muted">Tip: try fewer words or loosen the filters. New jobs are added on every refresh.</p>
              </section>
            )}
          </div>

          {f.inf ? (
            <div ref={sentinel} className="py-6 text-center text-sm text-muted">{loading && jobs.length ? 'Loading more…' : page >= pages && jobs.length ? 'You’ve reached the end.' : ''}</div>
          ) : (
            meta && pages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-3 text-sm">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost disabled:opacity-40">← Prev</button>
                <span className="text-muted">Page {page} of {pages}</span>
                <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="btn-ghost disabled:opacity-40">Next →</button>
              </div>
            )
          )}

          {meta?.sources.some((x) => x.source === 'Adzuna' && x.ok) && (
            <p className="mt-4 text-center text-xs text-muted">Jobs by <a href="https://www.adzuna.ca/" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Adzuna</a></p>
          )}

          {meta && (
            <section className="card mt-6 p-4" aria-label="Search on other job platforms">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold">Also search on {meta.deepLinks.length} job platforms{f.country === 'ALL' ? ' (Canada first, then USA)' : ''}</h2>
                  <p className="text-xs text-muted">Each opens with your keyword, location and filters pre-filled. <Link href="/platforms" className="text-accent hover:underline">About these platforms</Link></p>
                </div>
                <button className="btn-ghost" onClick={() => setShowLinks((s) => !s)} aria-expanded={showLinks}>{showLinks ? 'Hide' : 'Show all'}</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(showLinks ? meta.deepLinks : meta.deepLinks.slice(0, 6)).map((l) => (
                  <a key={l.platform + l.note} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="btn-ghost !text-accent">{l.platform} ↗</a>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string, boolean?][] }) {
  return (
    <label className="block"><span className="mb-1 block text-xs text-muted">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l, disabled]) => <option key={v} value={v} disabled={disabled}>{l}</option>)}</select></label>
  );
}

function TagPicker({ label, selected, options, onToggle }: { label: string; selected: string[]; options: Record<string, number>; onToggle: (v: string) => void }) {
  const names = [...new Set([...selected, ...Object.entries(options).sort((a, b) => b[1] - a[1]).map(([k]) => k)])].slice(0, 14);
  if (!names.length) return null;
  return (
    <fieldset>
      <legend className="mb-1 text-xs text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {names.map((n) => (
          <button key={n} type="button" aria-pressed={selected.includes(n)} onClick={() => onToggle(n)}
            className={`rounded-full border px-2 py-0.5 text-xs ${selected.includes(n) ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg'}`}>
            {n}{options[n] ? ` · ${options[n]}` : ''}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
