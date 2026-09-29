import type { DashboardStats, JobListing, SourceStatus } from '@/types/job';
import { slugify } from './companies';
import { normalizeCompany } from './text';

const top = (m: Map<string, number>, n = 10) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));
const inc = (m: Map<string, number>, k: string | undefined) => { if (k) m.set(k, (m.get(k) ?? 0) + 1); };

export function computeStats(jobs: JobListing[], sources: SourceStatus[], usedMock: boolean, updatedAt = new Date().toISOString()): DashboardStats {
  const ind = new Map<string, number>(), reg = new Map<string, number>(), wt = new Map<string, number>(),
    lvl = new Map<string, number>(), cty = new Map<string, number>(), tls = new Map<string, number>(), src = new Map<string, number>(), skl = new Map<string, number>(), crt = new Map<string, number>();
  const co = new Map<string, { name: string; n: number }>();
  const day = new Map<string, number>();
  const salaries: number[] = [];
  const now = Date.now();
  let today = 0, week = 0, remote = 0, hybrid = 0, entry = 0, withSalary = 0;

  for (const j of jobs) {
    inc(ind, j.industry); inc(reg, j.location.stateProvince || (j.workType === 'remote' ? 'Remote' : '')); inc(wt, j.workType);
    inc(lvl, j.seniority); inc(src, j.source);
    j.skills?.forEach((s) => inc(skl, s)); j.certifications?.forEach((c) => inc(crt, c));
    const k = normalizeCompany(j.company);
    if (k) co.set(k, { name: j.company, n: (co.get(k)?.n ?? 0) + 1 });
    const age = (now - new Date(j.postedAt).getTime()) / 864e5;
    if (age < 1) today++;
    if (age < 7) week++;
    if (j.workType === 'remote') remote++;
    if (j.workType === 'hybrid') hybrid++;
    if (j.seniority === 'entry' || j.employmentType === 'internship') entry++;
    if (j.salary) withSalary++;
    inc(cty, j.workType === 'remote' && !j.location.city ? 'Remote' : j.location.city);
    j.tools?.forEach((t) => inc(tls, t));
    if (age < 30) inc(day, j.postedAt.slice(0, 10));
    const v = j.salary ? (j.salary.max ?? j.salary.min ?? 0) : 0;
    if (v) salaries.push(j.salary!.period === 'hourly' ? v * 2080 : v);
  }
  salaries.sort((a, b) => a - b);
  const perDay = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now - (29 - i) * 864e5).toISOString().slice(0, 10);
    return { date: d, count: day.get(d) ?? 0 };
  });
  return {
    total: jobs.length, newToday: today, new7d: week, companies: co.size,
    remoteShare: jobs.length ? remote / jobs.length : 0,
    medianYearlySalary: salaries.length ? Math.round(salaries[Math.floor(salaries.length / 2)]) : null,
    byIndustry: top(ind, 12), byRegion: top(reg, 12), byWorkType: top(wt), byLevel: top(lvl), bySource: top(src),
    topCompanies: [...co.values()].sort((a, b) => b.n - a.n).slice(0, 8).map((c) => ({ name: c.name, slug: slugify(c.name), count: c.n })),
    topSkills: top(skl, 8), topCerts: top(crt, 8), perDay, usedMock, updatedAt, byCity: top(cty, 10), topTools: top(tls, 10), hybrid, remote, entryLevel: entry, withSalary, sources,
  };
}
