import { createHash } from 'node:crypto';
import { normalizeCompany, normalizeToken } from './text';

export { normalizeCompany, normalizeToken };

/**
 * Deterministic fingerprint: normalized title + company + city + province/state.
 * Same job from Adzuna/Jooble/ATS => same id.
 */
export function generateJobFingerprint(input: {
  title: string;
  company: string;
  city: string;
  stateProvince: string;
}): string {
  const key = [
    normalizeToken(input.title),
    normalizeCompany(input.company),
    normalizeToken(input.city),
    normalizeToken(input.stateProvince),
  ].join('|');
  return createHash('sha256').update(key).digest('hex').slice(0, 20);
}
