'use client';
import { useCallback, useEffect, useState } from 'react';
import type { JobListing } from '@/types/job';

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

export interface AppliedEntry { job: JobListing; portal: string; at: string }

/** Jobs the user opened an application for (tracked when they click an Apply link). */
export function useApplied() {
  const applied = useStore<AppliedEntry>(APPLIED, APPLIED_EVT);
  const mark = useCallback((j: JobListing, portal: string) => {
    const cur = read<AppliedEntry>(APPLIED);
    if (!cur[j.id]) { cur[j.id] = { job: slim(j), portal, at: new Date().toISOString() }; write(APPLIED, APPLIED_EVT, cur); }
  }, []);
  const unmark = useCallback((id: string) => {
    const cur = read<AppliedEntry>(APPLIED);
    delete cur[id]; write(APPLIED, APPLIED_EVT, cur);
  }, []);
  return { applied, mark, unmark, count: Object.keys(applied).length };
}
