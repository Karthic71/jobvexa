/**
 * Search-box syntax (client-safe):
 *   cloud engineer            → both words (any order)
 *   "cloud engineer"          → exact phrase
 *   soc OR "security analyst" → either
 *   devops -senior -"team lead" → exclude words/phrases
 * Known keywords expand to their synonyms (config/aliases.json), and jobs whose full
 * description matched a keyword (collector tags) are found too.
 */
import type { JobListing } from '@/types/job';
import { hasPhrase, variantsOf, type KeywordConfig } from './keywords';
import { normalizeToken } from './text';

export interface ParsedQuery { clauses: string[][]; exclude: string[] }

export function parseQuery(q: string): ParsedQuery {
  const tokens: { text: string; neg: boolean; phrase: boolean }[] = [];
  const re = /(-?)"([^"]*)"|(\S+)/g;
  for (let m = re.exec(q); m; m = re.exec(q)) {
    if (m[2] !== undefined) { if (m[2].trim()) tokens.push({ text: m[2].trim(), neg: m[1] === '-', phrase: true }); continue; }
    const w = m[3];
    if (w === 'OR' || w === '|') { tokens.push({ text: 'OR', neg: false, phrase: false }); continue; }
    if (w.startsWith('-') && w.length > 1) tokens.push({ text: w.slice(1), neg: true, phrase: false });
    else tokens.push({ text: w, neg: false, phrase: false });
  }
  const clauses: string[][] = [[]];
  const exclude: string[] = [];
  for (const t of tokens) {
    if (t.text === 'OR' && !t.phrase) { if (clauses[clauses.length - 1].length) clauses.push([]); continue; }
    if (t.neg) exclude.push(t.text.toLowerCase());
    else clauses[clauses.length - 1].push(t.phrase ? `"${t.text.toLowerCase()}"` : t.text.toLowerCase());
  }
  return { clauses: clauses.filter((c) => c.length), exclude };
}

const unquote = (t: string) => t.replace(/^"|"$/g, '');

/** Canonical config keyword for a phrase, if it is one of the keywords or synonyms. */
export function canonicalKeyword(phrase: string, kw?: KeywordConfig): string | undefined {
  if (!kw) return undefined;
  const p = normalizeToken(phrase);
  for (const k of [...kw.priority, ...kw.general]) if (variantsOf(k, kw.aliases).some((v) => normalizeToken(v) === p)) return k;
  for (const [canon, syns] of Object.entries(kw.aliases)) if ([canon, ...syns].some((v) => normalizeToken(v) === p)) return canon;
  return undefined;
}

export interface Matcher { test(j: JobListing): boolean; titleHits(j: JobListing): number; empty: boolean }

export function buildMatcher(q: string, kw?: KeywordConfig): Matcher {
  const { clauses, exclude } = parseQuery(q);
  const hay = (j: JobListing) => normalizeToken(`${j.title} ${j.company} ${j.descriptionSnippet} ${j.location.city} ${(j.skills ?? []).join(' ')} ${(j.tools ?? []).join(' ')} ${(j.certifications ?? []).join(' ')} ${(j.tags ?? []).join(' ')}`);
  const aliases = kw?.aliases ?? {};
  // Each clause becomes a list of "term matchers"; a term matches if any of its variants appears.
  const compiled = clauses.map((terms) => {
    const joined = terms.map(unquote).join(' ');
    const canon = canonicalKeyword(joined, kw);
    if (canon || (terms.length > 1 && Object.keys(aliases).length && variantsOf(joined, aliases).length > 1)) {
      const vars = variantsOf(canon ?? joined, aliases);
      return [{ vars, tag: canon, phrase: true }];
    }
    return terms.map((t) => {
      const phrase = t.startsWith('"');
      const text = unquote(t);
      const vars = variantsOf(text, aliases);
      return { vars, tag: canonicalKeyword(text, kw), phrase: phrase || vars.length > 1 };
    });
  });
  const ex = exclude.map((e) => normalizeToken(unquote(e))).filter(Boolean);
  const termHit = (h: string, j: JobListing, t: { vars: string[]; tag?: string; phrase: boolean }) =>
    (t.tag && j.tags?.includes(t.tag)) ||
    t.vars.some((v) => (t.phrase || v.includes(' ') ? hasPhrase(h, v) : h.includes(normalizeToken(v))));
  return {
    empty: !compiled.length && !ex.length,
    test(j) {
      const h = hay(j);
      if (ex.some((e) => hasPhrase(h, e))) return false;
      if (!compiled.length) return true;
      return compiled.some((terms) => terms.every((t) => termHit(h, j, t)));
    },
    titleHits(j) {
      const t = normalizeToken(j.title);
      let n = 0;
      for (const terms of compiled) for (const term of terms) if (term.vars.some((v) => hasPhrase(t, v) || t.includes(normalizeToken(v)))) n++;
      return n;
    },
  };
}
