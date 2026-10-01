/**
 * Search keywords + synonyms (client-safe). The collector searches sources for these keywords,
 * tags each job with the keywords it matches (title or full description), and the website uses the
 * same synonyms to expand searches — so "SRE" also finds "Site Reliability Engineer".
 */
import { normalizeToken } from './text';

export interface KeywordConfig {
  priority: string[];
  general: string[];
  aliases: Record<string, string[]>;
}

export const EMPTY_KEYWORDS: KeywordConfig = { priority: [], general: [], aliases: {} };

/** Parse config/keywords.txt: `[priority]` / `[general]` sections, `#` comments. */
export function parseKeywordsFile(text: string): Pick<KeywordConfig, 'priority' | 'general'> {
  const out = { priority: [] as string[], general: [] as string[] };
  let section: 'priority' | 'general' = 'priority';
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const sec = line.match(/^\[(priority|general)\]$/i);
    if (sec) { section = sec[1].toLowerCase() as 'priority' | 'general'; continue; }
    const k = line.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(k)) continue;
    seen.add(k);
    out[section].push(k);
  }
  return out;
}

/** Whole-word/phrase match on normalised text. */
export function hasPhrase(normText: string, phrase: string): boolean {
  const p = normalizeToken(phrase);
  if (!p) return false;
  return (' ' + normText + ' ').includes(' ' + p + ' ');
}

/** Every variant of a keyword: itself plus its synonyms (and reverse lookups). */
export function variantsOf(term: string, aliases: Record<string, string[]>): string[] {
  const t = term.toLowerCase().trim();
  const out = new Set<string>([t]);
  for (const [canon, syns] of Object.entries(aliases)) {
    const all = [canon, ...syns].map((s) => s.toLowerCase());
    if (all.includes(t)) all.forEach((s) => out.add(s));
  }
  return [...out];
}

/** All 1–6 word sequences in a normalised text (fast phrase lookup for long descriptions). */
export function ngramSet(normText: string, maxN = 6, maxTokens = 1200): Set<string> {
  const toks = normText.split(' ').filter(Boolean).slice(0, maxTokens);
  const out = new Set<string>();
  for (let i = 0; i < toks.length; i++) {
    let g = '';
    for (let n = 0; n < maxN && i + n < toks.length; n++) { g = n ? `${g} ${toks[i + n]}` : toks[i]; out.add(g); }
  }
  return out;
}

const compiled = new WeakMap<KeywordConfig, { k: string; vars: string[] }[]>();
function compile(cfg: KeywordConfig) {
  let c = compiled.get(cfg);
  if (!c) {
    c = [...cfg.priority, ...cfg.general].map((k) => ({ k, vars: variantsOf(k, cfg.aliases).map((v) => normalizeToken(v)).filter(Boolean) }));
    compiled.set(cfg, c);
  }
  return c;
}

/** Canonical keywords (from the config) that a job matches, by title or description. */
export function tagJob(title: string, text: string, cfg: KeywordConfig): string[] {
  const hay = ' ' + normalizeToken(`${title} ${text.slice(0, 6000)}`) + ' ';
  return compile(cfg).filter(({ vars }) => vars.some((v) => hay.includes(' ' + v + ' '))).map(({ k }) => k);
}
