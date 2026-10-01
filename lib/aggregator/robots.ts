/**
 * Minimal robots.txt support (RFC 9309): user-agent groups, Allow/Disallow with
 * `*` and `$`, longest-match wins, and Crawl-delay. Used so connectors that read
 * public web feeds only fetch what the site owner permits, at the pace they ask for.
 */
export interface RobotsRules { allowed(path: string): boolean; crawlDelaySec: number | null }

interface Rule { allow: boolean; pattern: string }

function toRegex(pattern: string): RegExp {
  const esc = pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + (esc.endsWith('$') ? esc : esc + '.*').replace(/\\\$\.\*$|\$\.\*$/, '$'));
}

export function parseRobots(text: string, userAgent: string): RobotsRules {
  const ua = userAgent.toLowerCase();
  const groups: { agents: string[]; rules: Rule[]; delay: number | null }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === 'allow' || key === 'disallow') { if (val) cur.rules.push({ allow: key === 'allow', pattern: val }); }
    else if (key === 'crawl-delay') { const n = Number(val); if (Number.isFinite(n)) cur.delay = n; }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  const rules = chosen.flatMap((g) => g.rules);
  const delay = chosen.map((g) => g.delay).find((d) => d !== null) ?? null;
  return {
    crawlDelaySec: delay,
    allowed(path: string) {
      let best: Rule | null = null;
      for (const r of rules) {
        if (!toRegex(r.pattern).test(path)) continue;
        if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
      }
      return !best || best.allow;
    },
  };
}
