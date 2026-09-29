import type { EmploymentType, IndustryCategory, JobListing, WorkType } from '@/types/job';
import { generateJobFingerprint } from './fingerprint';
import { CERTIFICATIONS, SKILLS, TOOLS, extract, inferSeniority } from './enrich';
import { mergeApplyOptions, portalForSource, portalForUrl } from './portals';

export function stripHtml(html: string | undefined | null): string {
  return (html ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** HTML -> readable plain text, keeping paragraph and bullet structure. */
export function htmlToText(html: string | undefined | null): string {
  let h = html ?? '';
  // Some feeds (Greenhouse) return entity-encoded HTML.
  if (!/<\w+/.test(h) && /&lt;\w+/.test(h)) h = h.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return h
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|tr)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const snippet = (s: string | undefined | null, n = 260) => {
  const t = stripHtml(s);
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

const INDUSTRY_RULES: [IndustryCategory, RegExp][] = [
  ['healthcare', /\b(nurse|nursing|rn|physician|doctor|medical|clinical|pharmac|dental|dentist|therapist|caregiver|health ?care|hospital|paramedic|psw|patient)\b/i],
  ['legal', /\b(lawyer|attorney|paralegal|legal|counsel|litigation|compliance officer)\b/i],
  ['education', /\b(teacher|professor|instructor|tutor|lecturer|education|school|early childhood|principal|faculty)\b/i],
  ['trades_construction', /\b(electrician|plumber|welder|carpenter|hvac|millwright|construction|mechanic|technician|apprentice|roofer|foreman|journeyman|heavy equipment)\b/i],
  ['manufacturing_logistics', /\b(warehouse|forklift|driver|trucker|logistics|supply chain|manufactur|machine operator|assembly|shipping|receiving|dispatcher|production)\b/i],
  ['hospitality_tourism', /\b(chef|cook|server|bartender|barista|hotel|restaurant|hospitality|front desk|housekeep|tourism|kitchen|catering)\b/i],
  ['customer_service', /\b(customer service|customer support|call cent(er|re)|help ?desk|client service|care representative|support agent)\b/i],
  ['finance_accounting', /\b(accountant|accounting|bookkeep|auditor|finance|financial|analyst|banking|teller|actuar|payroll|tax)\b/i],
  ['sales_marketing', /\b(sales|marketing|account executive|business development|seo|brand|copywriter|social media|retail associate|merchandis)\b/i],
  ['technology', /\b(software|developer|engineer|devops|cloud|data scientist|data engineer|machine learning|frontend|backend|full[- ]?stack|sre|cyber|security analyst|it support|qa|programmer|product manager|ux|ui designer|sysadmin|network)\b/i],
];

export function classifyIndustry(title: string, hint = ''): IndustryCategory {
  const text = `${title} ${hint}`;
  // Title-first so "Sales Engineer" style overlaps resolve consistently.
  for (const [cat, re] of INDUSTRY_RULES) if (re.test(title)) return cat;
  for (const [cat, re] of INDUSTRY_RULES) if (re.test(text)) return cat;
  return 'other';
}

export function inferWorkType(text: string, isRemoteFlag?: boolean): WorkType {
  if (/\bhybrid\b/i.test(text)) return 'hybrid';
  if (isRemoteFlag || /\b(remote|work from home|wfh|telecommute|distributed)\b/i.test(text)) return 'remote';
  return 'onsite';
}

export function inferEmploymentType(text: string): EmploymentType {
  if (/\b(intern|internship|co-?op|practicum)\b/i.test(text)) return 'internship';
  if (/\b(part[- ]?time)\b/i.test(text)) return 'part-time';
  if (/\b(contract|contractor|freelance|fixed[- ]term|consultant)\b/i.test(text)) return 'contract';
  if (/\b(temp|temporary|seasonal|casual)\b/i.test(text)) return 'temporary';
  return 'full-time';
}

export function safeIso(d: string | number | Date | undefined | null): string {
  const dt = d ? new Date(d) : new Date();
  return Number.isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

/** Attach the fingerprint id and enforce field hygiene. */
export function finalize(j: Omit<JobListing, 'id'>): JobListing {
  const title = j.title.replace(/\s+/g, ' ').trim();
  const company = (j.company || 'Confidential employer').trim();
  const body = `${title}\n${j.description ?? j.descriptionSnippet ?? ''}`;
  const fromUrl = portalForUrl(j.applyUrl, j.source === 'adzuna' || j.source === 'jooble' ? portalForSource(j.source) : undefined);
  const applyOptions = mergeApplyOptions(j.applyOptions, [{ portal: fromUrl.portal, url: j.applyUrl, direct: fromUrl.direct }]);
  return {
    ...j,
    applyOptions,
    applyUrl: applyOptions[0]?.url ?? j.applyUrl,
    description: j.description ? j.description.slice(0, 20000) : undefined,
    seniority: j.seniority ?? inferSeniority(title, body),
    skills: j.skills ?? extract(SKILLS, body),
    certifications: j.certifications ?? extract(CERTIFICATIONS, body),
    tools: j.tools ?? extract(TOOLS, body),
    title,
    company,
    id: generateJobFingerprint({
      title,
      company,
      city: j.location.city,
      stateProvince: j.location.stateProvince,
    }),
  };
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      next: { revalidate: 600 },
    } as RequestInit);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, next: { revalidate: 600 } } as RequestInit);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Parse free-text salaries such as "$65,000 - $80,000 a year" or "CA$28/hr". */
export function parseSalaryText(
  s: string | undefined,
  country: 'CA' | 'US',
): JobListing['salary'] | undefined {
  if (!s) return undefined;
  const nums = (s.replace(/,/g, '').match(/\d+(?:\.\d+)?k?/gi) ?? []).map((n) =>
    /k$/i.test(n) ? parseFloat(n) * 1000 : parseFloat(n),
  );
  if (!nums.length) return undefined;
  const hourly = /hour|hr|\/h\b/i.test(s) || Math.max(...nums) < 500;
  return {
    min: nums[0],
    max: nums[1] ?? nums[0],
    currency: country === 'CA' ? 'CAD' : 'USD',
    period: hourly ? 'hourly' : 'yearly',
  };
}
