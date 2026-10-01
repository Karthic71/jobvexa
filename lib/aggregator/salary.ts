import type { JobListing } from '@/types/job';

/** Approximate USD→CAD rate for sorting only (override with NEXT_PUBLIC_USD_CAD / USD_CAD). */
export const USD_CAD = Number(process.env.NEXT_PUBLIC_USD_CAD || process.env.USD_CAD) || 1.37;
const HOURS_PER_YEAR = 2080;

/** Yearly-equivalent salary in CAD, using the top of the range (or the only number given). */
export function yearlyCad(s: JobListing['salary']): number | undefined {
  if (!s) return undefined;
  let v = s.max ?? s.min;
  if (!v || !Number.isFinite(v)) return undefined;
  if (s.period === 'hourly') v *= HOURS_PER_YEAR;
  if (v < 5000 || v > 2_000_000) return undefined; // clearly not a real yearly salary
  return Math.round(s.currency === 'USD' ? v * USD_CAD : v);
}
