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

