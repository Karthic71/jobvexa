import type { JobListing, JobSource, SearchParams } from '@/types/job';

export interface SourceAdapter {
  name: string;
  source: JobSource;
  /** Return a reason string if the adapter cannot run (e.g. missing key). */
  skipReason(): string | null;
  fetch(p: SearchParams): Promise<JobListing[]>;
}

export const env = (k: string) => (process.env[k] ?? '').trim();
export const envList = (k: string) => env(k).split(',').map((s) => s.trim()).filter(Boolean);
