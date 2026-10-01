'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { JobListing } from '@/types/job';
import { EMPTY_KEYWORDS, type KeywordConfig } from '@/lib/aggregator/keywords';
import { analyzeResume, type AtsReport, type TermHit } from '@/lib/aggregator/ats';
import { profileFromResume } from '@/lib/aggregator/resume';
import { loadKeywords } from '@/lib/data';
import { useAtsScores, useResume } from './useSaved';
import { applyLabel, optionsFor } from './ApplyOptions';
import { useApplied } from './useSaved';

const tone = (n: number) => (n >= 75 ? 'text-good' : n >= 50 ? 'text-warn' : 'text-bad');
const bar = (n: number) => (n >= 75 ? 'bg-good' : n >= 50 ? 'bg-warn' : 'bg-bad');

function Chips({ items }: { items: TermHit[] }) {
  if (!items.length) return <p className="text-xs text-muted">None found in the posting.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((h) => (
        <span key={h.term} className={`chip ${h.inResume ? 'bg-good/15 text-good' : 'bg-bad/10 text-bad'}`} title={`Mentioned ${h.jdCount}× in the posting`}>
          {h.inResume ? '✓' : '✗'} {h.term}{h.jdCount > 1 ? ` ×${h.jdCount}` : ''}
        </span>
      ))}
    </div>
  );
}

/** "Check my resume for this job": job-description match + ATS-style score, all in the browser. */
export default function AtsPanel({ job }: { job: JobListing }) {
  const { profile, save } = useResume();
  const { record } = useAtsScores();
  const { mark } = useApplied();
  const [kw, setKw] = useState<KeywordConfig>();
  const [text, setText] = useState('');
  const [remember, setRemember] = useState(true);
  const [editing, setEditing] = useState(false);
  const [jdOverride, setJdOverride] = useState('');
  const [report, setReport] = useState<AtsReport | null>(null);
  const [fileErr, setFileErr] = useState('');
  // If keyword data can't load, still check (just without role keywords/synonyms).
  useEffect(() => { loadKeywords().then(setKw, () => setKw(EMPTY_KEYWORDS)); }, []);

  const saved = profile?.text ?? '';
  const shortJd = (job.description ?? job.descriptionSnippet ?? '').length < 600;
  const jobForAts = useMemo(() => ({ ...job, description: jdOverride.trim() || job.description || job.descriptionSnippet }), [job, jdOverride]);

  const run = (resume: string) => {
    if (!resume.trim()) return;
    const r = analyzeResume(resume, jobForAts, kw);
    setReport(r);
    record(job.id, r.score, r.keywordMatch);
    if (remember && resume !== saved) save({ ...profileFromResume(resume, kw), text: resume.slice(0, 30000) });
    setEditing(false);
  };

  // Saved resume → check automatically when the page opens.
  useEffect(() => { if (saved && !report && kw) run(saved); }, [saved, kw]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFile = (f: File | undefined) => {
    setFileErr('');
    if (!f) return;
    if (!/\.(txt|md)$/i.test(f.name) && f.type && !f.type.startsWith('text/')) { setFileErr('That file type can’t be read here. Open your PDF/Word resume, select all, copy, and paste it above — or save it as a .txt file.'); return; }
    f.text().then((t) => setText(t.slice(0, 30000)), () => setFileErr('Could not read that file.'));
  };
  const main = optionsFor(job)[0];
  const missing = report ? [...report.hardSkills, ...report.keywords].filter((h) => !h.inResume).map((h) => h.term) : [];

  return (
    <section id="ats" className="card mt-6 scroll-mt-4 p-5" aria-labelledby="ats-h">
      <h2 id="ats-h" className="text-lg font-semibold">Check your resume for this job</h2>
      <p className="mt-1 text-sm text-muted">See how well your resume matches this job description and get an ATS-style score with fixes — before you apply. Your resume is checked <b>in this browser only</b> and never uploaded.</p>

      {(!saved || editing) && (
        <div className="mt-3">
          <textarea aria-label="Your resume text" className="field font-mono text-xs" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste your resume text here (from Word/PDF: select all → copy → paste)…" />
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <button className="btn" disabled={!text.trim()} onClick={() => run(text)}>Check my resume</button>
            <label className="cursor-pointer text-accent hover:underline">or choose a .txt file<input type="file" accept=".txt,.md,text/plain" className="hidden" onChange={(e) => loadFile(e.target.files?.[0])} /></label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember my resume in this browser</label>
            {saved && <button className="text-muted underline" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
          {fileErr && <p role="alert" className="mt-2 text-xs text-bad">{fileErr}</p>}
        </div>
      )}
      {saved && !editing && (
        <p className="mt-3 text-xs text-muted">Using your saved resume{profile?.savedAt ? ` (updated ${new Date(profile.savedAt).toLocaleDateString()})` : ''}. <button className="text-accent underline" onClick={() => { setText(saved); setEditing(true); }}>Use a different / updated resume</button> · <Link href="/match/" className="text-accent hover:underline">Manage</Link></p>
      )}

      {shortJd && (
        <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 p-3 text-xs">
          <p className="text-warn">Only a short summary of this job is available. For an accurate check, paste the full job description (open the posting with “Apply”, copy the description).</p>
          <textarea aria-label="Full job description" className="field mt-2 text-xs" rows={4} value={jdOverride} onChange={(e) => setJdOverride(e.target.value)} placeholder="Paste the full job description here (optional)…" />
          {jdOverride.trim() && (saved || text.trim()) && <button className="btn mt-2 text-xs" onClick={() => run(editing || !saved ? text : saved)}>Re-check with this description</button>}
        </div>
      )}

      {report && (
        <div className="mt-4 space-y-4" aria-live="polite">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-line p-4">
              <p className="text-xs uppercase tracking-wide text-muted">ATS score (estimate)</p>
              <p className={`text-4xl font-bold tabular-nums ${tone(report.score)}`}>{report.score}<span className="text-base text-muted">/100</span></p>
              <div className="mt-2 h-2 rounded bg-line"><div className={`h-2 rounded ${bar(report.score)}`} style={{ width: `${report.score}%` }} /></div>
              <p className="mt-1 text-xs text-muted">{report.score >= 75 ? 'Strong — likely to pass keyword screening.' : report.score >= 50 ? 'Fair — add the missing keywords that are true for you.' : 'Low — tailor your resume to this posting before applying.'}</p>
            </div>
            <div className="rounded-lg border border-line p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Job description match</p>
              <p className={`text-4xl font-bold tabular-nums ${tone(report.keywordMatch)}`}>{report.keywordMatch}<span className="text-base text-muted">%</span></p>
              <p className="mt-1 text-xs text-muted">{[...report.hardSkills, ...report.keywords].filter((h) => h.inResume).length} of {report.hardSkills.length + report.keywords.length} skills and keywords from the posting appear in your resume.</p>
            </div>
          </div>

          <div>
            <h3 className="mb-1.5 text-sm font-semibold">Score breakdown</h3>
            <ul className="space-y-1.5 text-sm">
              {report.breakdown.map((b) => (
                <li key={b.label}>
                  <div className="flex justify-between"><span>{b.label}</span><span className="tabular-nums text-muted">{b.points} / {b.max}</span></div>
                  <div className="h-1.5 rounded bg-line"><div className={`h-1.5 rounded ${bar((b.points / b.max) * 100)}`} style={{ width: `${(b.points / b.max) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          </div>

          <div><h3 className="mb-1.5 text-sm font-semibold">Hard skills & tools in the posting</h3><Chips items={report.hardSkills} /></div>
          <div><h3 className="mb-1.5 text-sm font-semibold">Other keywords the posting repeats</h3><Chips items={report.keywords} /></div>

          <ul className="space-y-1 text-sm">
            <li>{report.title.ok ? '✅' : report.title.partial ? '🟡' : '❌'} Job title “{report.title.jobTitle}” {report.title.ok ? 'appears in your resume' : report.title.partial ? 'partly appears in your resume' : 'is not in your resume'}</li>
            <li>{report.experience.ok === null ? '➖' : report.experience.ok ? '✅' : '❌'} Experience: {report.experience.requiredYears ? `posting asks for ${report.experience.requiredYears}+ years` : 'no years stated in the posting'}{report.experience.resumeYears !== undefined ? `; your resume shows about ${report.experience.resumeYears}` : '; no dated experience found in your resume'}</li>
            <li>{report.education.ok === null ? '➖' : report.education.ok ? '✅' : '❌'} Education: {report.education.required ? `posting mentions ${report.education.required}` : 'no requirement stated'}{report.education.resume ? `; you list ${report.education.resume}` : ''}</li>
          </ul>

          <div>
            <h3 className="mb-1.5 text-sm font-semibold">Can an ATS read your resume?</h3>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">{report.formatting.map((f) => <li key={f.id}>{f.ok ? '✅' : '❌'} {f.label}</li>)}</ul>
          </div>

          {report.tips.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-semibold">How to improve</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{report.tips.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {missing.length > 0 && <button className="btn-ghost" onClick={() => navigator.clipboard?.writeText(missing.join(', '))}>Copy missing keywords</button>}
            <a href={main.url} target="_blank" rel="noopener noreferrer nofollow" onClick={() => mark(job, main.portal)} className="btn">{applyLabel(main)} ↗</a>
          </div>
          <p className="text-[11px] text-muted">An estimate based on common ATS checks (keywords, title, experience, education, readable format). Real systems such as Workday, Taleo, iCIMS or Greenhouse score differently. Only add skills you genuinely have.</p>
        </div>
      )}
    </section>
  );
}
