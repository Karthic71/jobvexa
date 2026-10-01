// Author: Karthic
export type Country = 'CA' | 'US';
export type WorkType = 'remote' | 'hybrid' | 'onsite';
export type EmploymentType = 'full-time' | 'part-time' | 'contract' | 'internship' | 'temporary';

/** Work-authorization signals found in the posting text. */
export type WorkAuth = 'citizenship' | 'pr-or-citizen' | 'clearance' | 'no-sponsorship' | 'sponsorship' | 'must-be-eligible';

export type Seniority = 'entry' | 'mid' | 'senior' | 'lead' | 'manager' | 'executive';

export type IndustryCategory =
  | 'technology'
  | 'healthcare'
  | 'trades_construction'
  | 'finance_accounting'
  | 'sales_marketing'
  | 'education'
  | 'hospitality_tourism'
  | 'customer_service'
  | 'legal'
  | 'manufacturing_logistics'
  | 'other';

export type JobSource =
  | 'canada_job_bank'
  | 'usajobs'
  | 'adzuna'
  | 'jooble'
  | 'jsearch'
  | 'remotive'
  | 'himalayas'
  | 'workable'
  | 'recruitee'
  | 'greenhouse'
  | 'lever'
  | 'ashby'
  | 'smartrecruiters'
  | 'deep_link';

export interface ApplyOption {
  /** Where the posting lives, e.g. 'Indeed', 'LinkedIn', 'Company site (Workday)'. */
  portal: string;
  url: string;
  /** True when this is the employer's own careers system (best place to apply). */
  direct: boolean;
}

export interface JobListing {
  id: string; // Unique hashed ID
  title: string;
  company: string;
  companyLogo?: string;
  location: {
    city: string;
    stateProvince: string; // e.g., 'ON', 'BC', 'NY', 'CA'
    country: Country;
    isRemote: boolean;
  };
  workType: WorkType;
  employmentType: EmploymentType;
  industry: IndustryCategory;
  salary?: {
    min?: number;
    max?: number;
    currency: 'CAD' | 'USD';
    period: 'yearly' | 'hourly';
  };
  descriptionSnippet: string;
  /** Full plain-text description (detail endpoint only; omitted from list responses). */
  description?: string;
  seniority?: Seniority;
  skills?: string[];
  certifications?: string[];
  tools?: string[];
  applyUrl: string;
  /** Every portal where this job was found, employer site first. */
  applyOptions?: ApplyOption[];
  source: JobSource;
  postedAt: string; // ISO String
  /** When the collector last saw this job at its source (ISO). */
  seenAt?: string;
  /** Search keywords (from config/keywords.txt) this job matches, by title or description. */
  tags?: string[];
  /** Work-authorization requirements detected in the text. */
  auth?: WorkAuth[];
  /** Yearly-equivalent salary in CAD (USD converted at an approximate rate), for sorting. */
  salaryYearlyCad?: number;
  isSaved?: boolean;
}

export interface SearchParams {
  q: string;
  country: Country | 'ALL';
  region: string; // province/state code or ''
  city: string;
  industry: IndustryCategory | 'all';
  workType: WorkType | 'all';
  employmentType: EmploymentType | 'all';
  company: string; // exact-ish company filter (normalized match)
  minSalary?: number;
  maxSalary?: number;
  postedWithinDays?: number;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string;
  level: Seniority | 'all';
  skills: string[];
  certs: string[];
  tools: string[];
  sort: 'relevance' | 'newest' | 'oldest' | 'salary' | 'company' | 'resume';
  /** Rank these experience levels higher (e.g. entry and mid first). */
  boost?: Seniority[];
  /** Hide jobs that mention these work-authorization requirements. */
  hideAuth?: WorkAuth[];
  /** Only jobs that mention visa/LMIA sponsorship. */
  sponsorOnly?: boolean;
  /** Only jobs that show a salary. */
  hasSalary?: boolean;
  page: number;
  pageSize: number;
}

export interface DeepLink {
  platform: string;
  url: string;
  note?: string;
}

export interface CompanySummary {
  name: string;
  slug: string;
  count: number;
  careerUrl: string;
  careerVerified: boolean;
}

export interface CompanyResponse {
  company: CompanySummary;
  jobs: JobListing[];
  platformLinks: DeepLink[];
}

export interface DashboardStats {
  total: number;
  newToday: number;
  new7d: number;
  companies: number;
  remoteShare: number; // 0..1
  medianYearlySalary: number | null;
  byIndustry: { key: string; count: number }[];
  byRegion: { key: string; count: number }[];
  byWorkType: { key: string; count: number }[];
  byLevel: { key: string; count: number }[];
  bySource: { key: string; count: number }[];
  topCompanies: { name: string; slug: string; count: number }[];
  topSkills: { key: string; count: number }[];
  topCerts: { key: string; count: number }[];
  perDay: { date: string; count: number }[]; // last 30 days
  usedMock: boolean;
  updatedAt: string;
  byCity: { key: string; count: number }[];
  topTools: { key: string; count: number }[];
  hybrid: number;
  remote: number;
  entryLevel: number;
  withSalary: number;
  sources: SourceStatus[];
}

export interface SourceStatus {
  source: string;
  ok: boolean;
  count: number;
  skipped?: string;
  error?: string;
  ms: number;
  calls?: number;
  budgetToday?: number;
  usedToday?: number;
  lastSuccess?: string;
  lastError?: { at: string; message: string };
}

export interface SourceInfo {
  id: string; name: string; home: string; what: string; legal: string; env: string[];
  enabled: boolean; reason: string | null;
}

/** Published by the collector at /data/jobs.json (descriptions are sharded separately). */
export interface JobsSnapshot {
  updatedAt: string;
  usedMock: boolean;
  sources: SourceStatus[];
  jobs: JobListing[];
}

/** /data/sources.json */
export interface SourcesSnapshot { updatedAt: string; sources: (SourceInfo & { count?: number; error?: string })[] }

/** /data/stats.json */
export type StatsSnapshot = Record<'CA' | 'US' | 'ALL', DashboardStats>;

export interface SearchResponse {
  jobs: JobListing[];
  total: number;
  page: number;
  pageSize: number;
  deepLinks: DeepLink[];
  sources: SourceStatus[];
  usedMock: boolean;
  updatedAt: string; // when upstream data was last fetched
  companies: CompanySummary[]; // companies matching the query text
  facets: {
    industry: Record<string, number>;
    region: Record<string, number>;
    level: Record<string, number>;
    skills: Record<string, number>;
    certs: Record<string, number>;
    tools: Record<string, number>;
  };
}
