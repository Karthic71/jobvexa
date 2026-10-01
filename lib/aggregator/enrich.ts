import type { Seniority, WorkAuth } from '@/types/job';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Build a matcher that tolerates punctuation around short/odd tokens (C++, .NET, Security+). */
const rx = (label: string, pattern?: string) => ({
  label,
  re: new RegExp(`(^|[^a-z0-9+#])(${pattern ?? esc(label)})(?![a-z0-9]|\\+\\+|#)`, 'i'),
});

export const CERTIFICATIONS = [
  rx('CISSP'), rx('CISM'), rx('CISA'), rx('CEH'), rx('OSCP'), rx('GIAC', 'GIAC|GSEC|GCIH|GPEN|GCIA'),
  rx('CompTIA Security+', 'Security\\+|CompTIA Security'), rx('CCSP'), rx('CRISC'), rx('CCNA'), rx('CCNP'),
  rx('AWS Certified', 'AWS Certified|AWS Solutions Architect'), rx('Azure Certified', 'AZ-\\d{3}|Azure Certified|AZ-500|SC-200'),
  rx('PMP'), rx('ITIL'), rx('CPA'), rx('CFA'), rx('CMA'), rx('RN license', 'RN|Registered Nurse'), rx('Red Seal', 'Red Seal'),
  rx('First Aid / CPR', 'First Aid|CPR'), rx('Class 1 / Class 5 Licence', 'Class [1-5] (licen[cs]e)?'), rx('Forklift', 'forklift (ticket|certif\\w+|licen[cs]e)'),
  rx('WHMIS'), rx('SmartServe / Food Handler', 'SmartServe|Food ?Handler'), rx('Teaching Certificate', 'OCT|BCTC|teaching (certificate|licen[cs]e)'),
  rx('Six Sigma', 'Six Sigma|Lean Six Sigma'), rx('CHRP / CPHR', 'CHRP|CPHR'), rx('LSAT / Bar admission', 'Bar admission|called to the bar'),
];

export const TOOLS = [
  rx('Splunk'), rx('Wireshark'), rx('Nessus'), rx('CrowdStrike'), rx('Palo Alto', 'Palo Alto'), rx('Okta'), rx('SentinelOne'), rx('Microsoft Sentinel', 'Sentinel'),
  rx('AWS'), rx('Azure'), rx('GCP', 'GCP|Google Cloud'), rx('Kubernetes', 'Kubernetes|k8s'), rx('Docker'), rx('Terraform'), rx('Ansible'), rx('Jenkins'), rx('Git', 'Git|GitHub|GitLab'),
  rx('Linux'), rx('Windows Server', 'Windows Server'), rx('Active Directory', 'Active Directory'), rx('ServiceNow'), rx('Salesforce'), rx('SAP'), rx('Workday'), rx('Oracle'),
  rx('Excel', 'Excel|Microsoft Excel'), rx('Power BI', 'Power ?BI'), rx('Tableau'), rx('QuickBooks'), rx('Epic', 'Epic (EMR|EHR|systems)?'), rx('AutoCAD'), rx('Jira'), rx('Figma'), rx('Photoshop'),
  rx('Microsoft 365', 'Microsoft 365|Office 365|M365'), rx('Zendesk'), rx('HubSpot'), rx('Shopify'), rx('Kafka'), rx('PostgreSQL', 'PostgreSQL|Postgres'), rx('MySQL'), rx('MongoDB'),
];

export const SKILLS = [
  rx('Python'), rx('JavaScript', 'JavaScript|JS'), rx('TypeScript'), rx('Java'), rx('C#', 'C#'), rx('C++', 'C\\+\\+'), rx('Go', 'Golang'), rx('SQL'), rx('React'), rx('Node.js', 'Node(\\.js)?'), rx('.NET', '\\.NET'),
  rx('Incident Response', 'incident response'), rx('Threat Hunting', 'threat hunting'), rx('Penetration Testing', 'penetration test\\w*|pentest\\w*'), rx('SIEM'), rx('Vulnerability Management', 'vulnerability management'),
  rx('Risk Assessment', 'risk assessment'), rx('Compliance', 'compliance|SOC ?2|ISO ?27001|NIST|PCI'), rx('Cloud Security', 'cloud security'), rx('Network Security', 'network security|firewall'),
  rx('Machine Learning', 'machine learning|ML'), rx('Data Analysis', 'data analysis|analytics'), rx('Project Management', 'project management'), rx('Customer Service', 'customer service'),
  rx('Communication', 'communication skills|written and verbal'), rx('Leadership', 'leadership|team lead'), rx('Bilingual (EN/FR)', 'bilingual|French and English|English and French'),
  rx('Patient Care', 'patient care'), rx('Budgeting & Forecasting', 'budget\\w*|forecast\\w*'), rx('Sales', 'B2B sales|sales experience|business development'),
  rx('Welding', 'welding'), rx('Electrical Installation', 'electrical install\\w*|wiring'), rx('Inventory / Warehouse', 'inventory|warehouse'), rx('Food Safety', 'food safety'), rx('Curriculum Design', 'curriculum'),
];

export function extract(list: { label: string; re: RegExp }[], text: string, max = 8): string[] {
  const out: string[] = [];
  for (const { label, re } of list) {
    if (re.test(text)) { out.push(label); if (out.length >= max) break; }
  }
  return out;
}

export function inferSeniority(title: string, body = ''): Seniority | undefined {
  const t = title.toLowerCase();
  if (/\b(chief|cxo|ciso|cto|cfo|ceo|vp|vice president|president|head of|director)\b/.test(t)) return 'executive';
  if (/\b(manager|supervisor|superintendent)\b/.test(t)) return 'manager';
  if (/\b(lead|principal|staff|architect|foreman)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?|iii|journeyman)\b/.test(t)) return 'senior';
  if (/\b(intern|junior|jr\.?|entry|graduate|new grad|apprentice|trainee|associate|co-?op|i\b)/.test(t)) return 'entry';
  if (/\b(ii|intermediate|mid)\b/.test(t)) return 'mid';
  const m = body.match(/(\d{1,2})\+?\s*(?:-\s*\d{1,2}\s*)?years?/i);
  if (m) { const y = +m[1]; return y <= 1 ? 'entry' : y <= 4 ? 'mid' : y <= 8 ? 'senior' : 'lead'; }
  return undefined;
}

const AUTH_RULES: [WorkAuth, RegExp][] = [
  ['citizenship', /\b(canadian|u\.?s\.?|us|american) citizen(ship)?\b[^.]{0,40}\b(required|only|must)|\bmust be an? (canadian|u\.?s\.?|us) citizen|\bcitizens? only\b/i],
  ['pr-or-citizen', /\b(citizen|citizenship) or (a )?permanent resident|\bpermanent residen(t|cy)[^.]{0,30}\b(required|only|must)|\bmust be a permanent resident/i],
  ['clearance', /\b(security|secret|top secret|ts\/sci|government) clearance\b|\breliability status\b|\benhanced reliability\b|\bpublic trust\b|\bnato secret\b/i],
  ['no-sponsorship', /\b(no|not|unable to|cannot|can ?not|will not|won't|does not|do not)\b[^.]{0,25}\bsponsor|\bsponsorship (is )?not (available|provided|offered)|\bwithout (the need for )?(visa )?sponsorship|\bno lmia\b/i],
  ['sponsorship', /\b(visa|work permit|lmia|h-?1b) sponsorship (is )?(available|provided|offered)|\bwill (provide |offer )?sponsor|\blmia (available|approved|supported)\b/i],
  ['must-be-eligible', /\b(legally )?(eligible|entitled|authori[sz]ed) to work in (canada|the (united states|us|u\.s\.))\b/i],
];

/** Work-authorization requirements mentioned in a posting (best effort, English). */
export function detectWorkAuth(text: string): WorkAuth[] {
  const out: WorkAuth[] = [];
  for (const [k, re] of AUTH_RULES) if (re.test(text)) out.push(k);
  if (out.includes('sponsorship') && out.includes('no-sponsorship')) out.splice(out.indexOf('sponsorship'), 1);
  return out;
}
