import type { EmploymentType, IndustryCategory, SearchParams, Seniority, WorkAuth, WorkType } from '@/types/job';

export const INDUSTRIES: { value: IndustryCategory; label: string }[] = [
  { value: 'technology', label: 'Technology' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'trades_construction', label: 'Trades & Construction' },
  { value: 'finance_accounting', label: 'Finance & Accounting' },
  { value: 'sales_marketing', label: 'Sales & Marketing' },
  { value: 'education', label: 'Education' },
  { value: 'hospitality_tourism', label: 'Hospitality & Tourism' },
  { value: 'customer_service', label: 'Customer Service' },
  { value: 'legal', label: 'Legal' },
  { value: 'manufacturing_logistics', label: 'Manufacturing & Logistics' },
  { value: 'other', label: 'Other' },
];
export const industryLabel = (v: string) => INDUSTRIES.find((i) => i.value === v)?.label ?? v.replace(/_/g, ' ');
const IND = new Set<string>(INDUSTRIES.map((i) => i.value));
const WT = new Set<string>(['remote', 'hybrid', 'onsite']);
const ET = new Set<string>(['full-time', 'part-time', 'contract', 'internship', 'temporary']);
const SORT = new Set<string>(['relevance', 'newest', 'oldest', 'salary', 'company', 'resume']);
const AUTH = new Set<string>(['citizenship', 'pr-or-citizen', 'clearance', 'no-sponsorship', 'must-be-eligible']);
const LEVEL = new Set<string>(['entry', 'mid', 'senior', 'lead', 'manager', 'executive']);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const list = (v: string | null) => (v ?? '').split(',').map((x) => x.trim().slice(0, 40)).filter(Boolean).slice(0, 10);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: string | null) => { const n = Number(v); return v && Number.isFinite(n) && n > 0 ? n : undefined; };

/** Validate and coerce untrusted query params into a SearchParams. */
export function parseSearchParams(sp: URLSearchParams): SearchParams {
  const country = sp.get('country');
  const industry = sp.get('industry') ?? '';
  const wt = sp.get('workType') ?? '';
  const et = sp.get('employmentType') ?? '';
  const sort = sp.get('sort') ?? '';
  return {
    q: (sp.get('q') ?? '').slice(0, 120).trim(),
    country: country === 'CA' || country === 'US' ? country : 'ALL',
    region: (sp.get('region') ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2),
    city: (sp.get('city') ?? '').slice(0, 80).trim(),
    industry: IND.has(industry) ? (industry as IndustryCategory) : 'all',
    workType: WT.has(wt) ? (wt as WorkType) : 'all',
    employmentType: ET.has(et) ? (et as EmploymentType) : 'all',
    company: (sp.get('company') ?? '').slice(0, 120).trim(),
    level: LEVEL.has(sp.get('level') ?? '') ? (sp.get('level') as Seniority) : 'all',
    skills: list(sp.get('skills')),
    certs: list(sp.get('certs')),
    tools: list(sp.get('tools')),
    dateFrom: DATE.test(sp.get('from') ?? '') ? (sp.get('from') as string) : undefined,
    dateTo: DATE.test(sp.get('to') ?? '') ? (sp.get('to') as string) : undefined,
    maxSalary: num(sp.get('maxSalary')),
    minSalary: num(sp.get('minSalary')),
    postedWithinDays: num(sp.get('days')),
    sort: SORT.has(sort) ? (sort as SearchParams['sort']) : 'relevance',
    boost: list(sp.get('boost')).filter((l) => LEVEL.has(l)) as Seniority[],
    hideAuth: list(sp.get('hide')).filter((a) => AUTH.has(a)) as WorkAuth[],
    sponsorOnly: sp.get('sponsor') === '1',
    hasSalary: sp.get('hasSalary') === '1',
    page: clamp(Math.floor(Number(sp.get('page')) || 1), 1, 1000),
    pageSize: clamp(Math.floor(Number(sp.get('pageSize')) || 25), 5, 100),
  };
}
