'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { JobListing } from '@/types/job';
import type { KeywordConfig } from '@/lib/aggregator/keywords';
import { matchScore, profileFromResume } from '@/lib/aggregator/resume';
import JobCard from '@/components/JobCard';
import { useResume, useSaved } from '@/components/useSaved';
import { friendlyError, loadJobs, loadKeywords } from '@/lib/data';

export default function MatchPage() {
  const { profile, save } = useResume();
  const { saved, toggle } = useSaved();
  const [text, setText] = useState('');
  const [kw, setKw] = useState<KeywordConfig>();
  const [jobs, setJobs] = useState<JobListing[] | null>(null);
  const [err, setErr] = useState('');
  const [canadaOnly, setCanadaOnly] = useState(true);

  useEffect(() => { loadKeywords().then(setKw); loadJobs().then((s) => setJobs(s.jobs)).catch((e) => setErr(friendlyError(e))); }, []);
  useEffect(() => { if (profile?.text && !text) setText(profile.text); }, [profile, text]);

  const top = useMemo(() => {
    if (!profile || !jobs) return [];
    return jobs.filter((j) => !canadaOnly || j.location.country === 'CA')
      .map((j) => ({ j, m: matchScore(j, profile) }))
      .filter((x) => x.m.score > 0)
      .sort((a, b) => b.m.score - a.m.score || +new Date(b.j.postedAt) - +new Date(a.j.postedAt))
      .slice(0, 40);
  }, [profile, jobs, canadaOnly]);

  const analyze = () => save({ ...profileFromResume(text, kw), text: text.slice(0, 30000) });

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h1 className="text-lg font-semibold">Resume match</h1>
        <p className="mt-1 text-sm text-muted">Paste your resume text. It stays <b>only in this browser</b> — nothing is uploaded. Jobvexa picks out your skills, tools, certifications and target roles, then shows a match % on every job and which requirements you could add.</p>
        <textarea aria-label="Resume text" className="field mt-3 font-mono text-xs" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your resume here…" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" onClick={analyze} disabled={!text.trim()}>Analyze my resume</button>
          {profile && <button className="btn-ghost" onClick={() => { save(null); setText(''); }}>Delete from this browser</button>}
          {profile && <Link href="/?sort=resume" className="btn-ghost">Search jobs sorted by match →</Link>}
        </div>
      </section>

      {profile && (
        <section className="card p-5 text-sm" aria-label="Your keywords">
          <h2 className="font-semibold">What we found</h2>
          {([['Target roles', profile.roles], ['Skills', profile.skills], ['Tools', profile.tools], ['Certifications', profile.certs]] as const).map(([t, list]) => (
            <div key={t} className="mt-2"><span className="text-xs text-muted">{t}: </span>{list.length ? list.map((x) => <span key={x} className="chip mr-1 bg-accent/10 text-accent">{x}</span>) : <span className="text-xs text-muted">none found</span>}</div>
          ))}
        </section>
      )}

      {err && <div className="card p-4 text-bad" role="alert">{err}</div>}
      {profile && jobs && (
        <section aria-label="Best matching jobs">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Best matches ({top.length})</h2>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={canadaOnly} onChange={(e) => setCanadaOnly(e.target.checked)} /> Canada only</label>
          </div>
          <div className="grid gap-3">{top.map(({ j, m }) => <JobCard key={j.id} job={j} saved={!!saved[j.id]} onToggleSave={toggle} match={m.score} />)}</div>
        </section>
      )}
    </div>
  );
}
