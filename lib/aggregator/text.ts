// Pure string helpers (safe for client bundles: no node imports).
const COMPANY_SUFFIX = /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|lp|llp|plc|gmbh|canada|usa|us)\b\.?/g;

export function normalizeToken(s: string | undefined | null): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeCompany(s: string): string {
  return normalizeToken(s).replace(COMPANY_SUFFIX, '').replace(/\s+/g, ' ').trim();
}


const TITLE_WORDS: Record<string, string> = {
  sr: 'senior', snr: 'senior', jr: 'junior', jnr: 'junior', mgr: 'manager', assoc: 'associate', asst: 'assistant',
  admin: 'administrator', engr: 'engineer', eng: 'engineer', dev: 'developer', tech: 'technician', spec: 'specialist',
  coord: 'coordinator', rep: 'representative', ii: '2', iii: '3', iv: '4', l1: '1', l2: '2', l3: '3',
};
const TITLE_DROP = new Set(['remote', 'hybrid', 'onsite', 'on-site', 'wfh', 'fulltime', 'parttime', 'permanent', 'contract', 'temporary', 'urgent', 'hiring', 'new', 'job', 'position', 'the']);

/** Title key for de-duplication: "Sr. Cloud Eng II (Remote)" ≡ "Senior Cloud Engineer 2". */
export function normalizeTitle(s: string | undefined | null): string {
  const words = normalizeToken((s ?? '').replace(/\b(full|part)[\s-]time\b/gi, (m) => m.replace(/[\s-]/, '')).replace(/\bon[\s-]site\b/gi, 'onsite'))
    .split(' ')
    .filter(Boolean)
    .map((w) => TITLE_WORDS[w] ?? w)
    .filter((w) => !TITLE_DROP.has(w));
  return words.join(' ');
}
