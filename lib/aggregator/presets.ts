/** Ready-made keyword sets for the roles Jobvexa focuses on first (client-safe). */
export interface KeywordSet { id: string; name: string; keywords: string[]; boost?: ('entry' | 'mid')[] }

export const DEFAULT_SETS: KeywordSet[] = [
  { id: 'soc', name: 'SOC / Cybersecurity', keywords: ['soc analyst', 'cybersecurity analyst'], boost: ['entry', 'mid'] },
  { id: 'devops', name: 'DevOps / SRE / Platform', keywords: ['devops engineer', 'site reliability engineer', 'platform engineer'], boost: ['entry', 'mid'] },
  { id: 'cloud', name: 'Cloud (AWS / Azure / GCP)', keywords: ['cloud engineer', 'aws engineer', 'azure administrator', 'cloud support', 'virtualization engineer'], boost: ['entry', 'mid'] },
  { id: 'itsupport', name: 'IT support / Systems / Network', keywords: ['it support', 'help desk', 'systems administrator', 'linux administrator', 'network administrator', 'noc technician'], boost: ['entry', 'mid'] },
];

/** A keyword set as a search query string ("a" OR "b" …). */
export const setQuery = (s: KeywordSet) => s.keywords.map((k) => `"${k}"`).join(' OR ');
