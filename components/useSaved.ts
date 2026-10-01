'use client';
import { useCallback, useEffect, useState } from 'react';
import type { JobListing } from '@/types/job';
import type { ResumeProfile } from '@/lib/aggregator/resume';

type Store<T> = Record<string, T>;

function read<T>(key: string): Store<T> {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { return {}; }
}
function write<T>(key: string, evt: string, v: Store<T>) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(evt));
}
/** Keep stored copies small: no full description. */
const slim = (j: JobListing): JobListing => { const { description: _d, ...rest } = j; return rest; };

function useStore<T>(key: string, evt: string) {
  const [data, setData] = useState<Store<T>>({});
  useEffect(() => {
    const sync = () => setData(read<T>(key));
    sync();
    window.addEventListener(evt, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(evt, sync); window.removeEventListener('storage', sync); };
  }, [key, evt]);
  return data;
}

const SAVED = 'jobvexa.saved.v1', SAVED_EVT = 'jobvexa:saved';
const APPLIED = 'jobvexa.applied.v1', APPLIED_EVT = 'jobvexa:applied';

/** Saved jobs in this browser, synced across components and tabs. */
export function useSaved() {
  const saved = useStore<JobListing>(SAVED, SAVED_EVT);
  const toggle = useCallback((j: JobListing) => {
    const cur = read<JobListing>(SAVED);
    if (cur[j.id]) delete cur[j.id]; else cur[j.id] = { ...slim(j), isSaved: true };
    write(SAVED, SAVED_EVT, cur);
  }, []);
  return { saved, toggle, count: Object.keys(saved).length };
}

export const STATUSES = ['applied', 'interview', 'offer', 'rejected', 'withdrawn', 'saved'] as const;
export type AppStatus = (typeof STATUSES)[number];
export interface AppliedEntry { job: JobListing; portal: string; at: string; status?: AppStatus; notes?: string; updatedAt?: string }

/**
 * Application tracker (stored only in this browser). Clicking an Apply link adds the job as "applied";
 * the My jobs page lets you change the status, add notes and export everything as CSV.
 */
export function useApplied() {
  const applied = useStore<AppliedEntry>(APPLIED, APPLIED_EVT);
  const mark = useCallback((j: JobListing, portal: string) => {
    const cur = read<AppliedEntry>(APPLIED);
    if (!cur[j.id]) { cur[j.id] = { job: slim(j), portal, at: new Date().toISOString(), status: 'applied' }; write(APPLIED, APPLIED_EVT, cur); }
  }, []);
  const unmark = useCallback((id: string) => {
    const cur = read<AppliedEntry>(APPLIED);
    delete cur[id]; write(APPLIED, APPLIED_EVT, cur);
  }, []);
  const update = useCallback((id: string, patch: Partial<Pick<AppliedEntry, 'status' | 'notes' | 'portal' | 'at'>>) => {
    const cur = read<AppliedEntry>(APPLIED);
    if (!cur[id]) return;
    cur[id] = { ...cur[id], ...patch, updatedAt: new Date().toISOString() };
    write(APPLIED, APPLIED_EVT, cur);
  }, []);
  return { applied, mark, unmark, update, count: Object.keys(applied).length };
}

/** CSV export of the tracker (opens in Excel / Google Sheets). */
export function trackerCsv(entries: AppliedEntry[]): string {
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Job title', 'Company', 'City', 'Province/State', 'Country', 'Status', 'Applied via', 'Applied on', 'Last update', 'Notes', 'Link']];
  for (const e of entries) rows.push([e.job.title, e.job.company, e.job.location.city, e.job.location.stateProvince, e.job.location.country, e.status ?? 'applied', e.portal, e.at.slice(0, 10), (e.updatedAt ?? e.at).slice(0, 10), e.notes ?? '', e.job.applyUrl]);
  return rows.map((r) => r.map(q).join(',')).join('\r\n');
}

// ---------- resume profile (for match %), stored only in this browser ----------
const RESUME = 'jobvexa.resume.v1', RESUME_EVT = 'jobvexa:resume';
export function useResume() {
  const [profile, setProfile] = useState<(ResumeProfile & { text?: string }) | null>(null);
  useEffect(() => {
    const sync = () => { try { setProfile(JSON.parse(localStorage.getItem(RESUME) ?? 'null')); } catch { setProfile(null); } };
    sync();
    window.addEventListener(RESUME_EVT, sync);
    return () => window.removeEventListener(RESUME_EVT, sync);
  }, []);
  const save = useCallback((p: (ResumeProfile & { text?: string }) | null) => {
    try { if (p) localStorage.setItem(RESUME, JSON.stringify(p)); else localStorage.removeItem(RESUME); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(RESUME_EVT));
  }, []);
  return { profile, save };
}

// ---------- saved keyword sets ----------
export interface SavedSet { id: string; name: string; query: string; lastSeen: string }
const SETS = 'jobvexa.sets.v1', SETS_EVT = 'jobvexa:sets';
export function useSavedSets() {
  const sets = useStore<SavedSet>(SETS, SETS_EVT);
  const add = useCallback((name: string, query: string) => {
    const cur = read<SavedSet>(SETS);
    const id = `u${Date.now().toString(36)}`;
    cur[id] = { id, name: name.slice(0, 40), query, lastSeen: new Date().toISOString() };
    write(SETS, SETS_EVT, cur);
    return id;
  }, []);
  const remove = useCallback((id: string) => { const cur = read<SavedSet>(SETS); delete cur[id]; write(SETS, SETS_EVT, cur); }, []);
  const seen = useCallback((id: string) => { const cur = read<SavedSet>(SETS); if (cur[id]) { cur[id].lastSeen = new Date().toISOString(); write(SETS, SETS_EVT, cur); } }, []);
  return { sets, add, remove, seen };
}

/** When the user last opened each keyword set (for "N new" badges). */
const SEEN = 'jobvexa.seen.v1';
export function readSeen(): Record<string, string> { try { return JSON.parse(localStorage.getItem(SEEN) ?? '{}'); } catch { return {}; } }
export function markSeen(id: string) { const m = readSeen(); m[id] = new Date().toISOString(); try { localStorage.setItem(SEEN, JSON.stringify(m)); } catch { /* ignore */ } }
