/**
 * Resume keyword match — runs only in the browser. The resume text never leaves the device.
 * We pull skills, tools, certifications and target-role keywords out of the resume, then score
 * each job by how many of the job's own requirements the resume covers.
 */
import type { JobListing } from '@/types/job';
import { CERTIFICATIONS, SKILLS, TOOLS, extract } from './enrich';
import { tagJob, type KeywordConfig } from './keywords';

export interface ResumeProfile { skills: string[]; tools: string[]; certs: string[]; roles: string[]; savedAt: string }

export function profileFromResume(text: string, kw?: KeywordConfig): ResumeProfile {
  return {
    skills: extract(SKILLS, text, 50),
    tools: extract(TOOLS, text, 60),
    certs: extract(CERTIFICATIONS, text, 30),
    roles: kw ? tagJob('', text, kw) : [],
    savedAt: new Date().toISOString(),
  };
}

/** 0–100: share of the job's listed requirements found in the resume (+ a bonus for a target-role match). */
export function matchScore(job: JobListing, p: ResumeProfile): { score: number; matched: string[]; missing: string[] } {
  const want = [...(job.skills ?? []), ...(job.tools ?? []), ...(job.certifications ?? [])];
  const have = new Set([...p.skills, ...p.tools, ...p.certs]);
  const matched = want.filter((w) => have.has(w));
  const missing = want.filter((w) => !have.has(w));
  const roleHit = (job.tags ?? []).some((t) => p.roles.includes(t));
  const base = want.length ? matched.length / want.length : 0.5;
  const score = Math.round(Math.min(1, base * 0.8 + (roleHit ? 0.2 : 0) + (want.length ? 0 : roleHit ? 0.2 : 0)) * 100);
  return { score, matched, missing };
}
