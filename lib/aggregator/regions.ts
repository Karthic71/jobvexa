import type { Country } from '@/types/job';

export const CA_PROVINCES: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
};

export const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

const nameToCode = (m: Record<string, string>) =>
  Object.fromEntries(Object.entries(m).map(([c, n]) => [n.toLowerCase(), c]));
const CA_NAME = nameToCode(CA_PROVINCES);
const US_NAME = nameToCode(US_STATES);

export function regionsFor(country: Country | 'ALL') {
  if (country === 'CA') return CA_PROVINCES;
  if (country === 'US') return US_STATES;
  return { ...CA_PROVINCES, ...US_STATES };
}

/** Best-effort conversion of a region name/code to its 2-letter code. */
export function toRegionCode(raw: string | undefined, country: Country): string {
  if (!raw) return '';
  const v = raw.trim();
  const table = country === 'CA' ? CA_PROVINCES : US_STATES;
  const up = v.toUpperCase();
  if (table[up]) return up;
  const lookup = country === 'CA' ? CA_NAME : US_NAME;
  return lookup[v.toLowerCase()] ?? '';
}

/** Parse "Toronto, ON" / "Austin, Texas, US" style strings. */
export function parseLocationString(
  s: string,
  hint?: Country,
): { city: string; stateProvince: string; country: Country } {
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  let country: Country = hint ?? 'US';
  let explicit = false;
  parts.forEach((p, i) => {
    // "CA" is Canada only as a trailing country code ("Toronto, ON, CA"); "San Jose, CA" is California.
    if (/^canada$/i.test(p) || (/^ca$/i.test(p) && i === parts.length - 1 && parts.length >= 3)) { country = 'CA'; explicit = true; }
    if (/^(united states|united states of america|usa|us|u\.s\.)$/i.test(p)) { country = 'US'; explicit = true; }
  });
  if (!explicit) {
    for (const p of parts.slice(1)) {
      const isProvince = !!CA_PROVINCES[p.toUpperCase()] || !!toRegionCode(p, 'CA');
      const isState = !!US_STATES[p.toUpperCase()] || !!toRegionCode(p, 'US');
      if (isProvince && !isState) { country = 'CA'; break; }
      if (isState && !isProvince) { country = 'US'; break; }
    }
  }
  let region = '';
  for (const p of parts.slice(1)) {
    if (explicit && parts.length >= 3 && p === parts[parts.length - 1]) continue; // skip the country code
    const r = toRegionCode(p, country);
    if (r) { region = r; break; }
  }
  return { city: parts[0] ?? '', stateProvince: region, country };
}
