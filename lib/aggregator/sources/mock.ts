import type { JobListing } from '@/types/job';
import { finalize } from '../normalize';

const d = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
type M = Parameters<typeof mk>[0];
function mk(o: { t: string; c: string; city: string; r: string; k: 'CA' | 'US'; i: JobListing['industry']; w?: JobListing['workType']; e?: JobListing['employmentType']; min?: number; max?: number; p?: 'yearly' | 'hourly'; days: number; desc: string }): JobListing {
  return finalize({
    title: o.t, company: o.c,
    location: { city: o.city, stateProvince: o.r, country: o.k, isRemote: o.w === 'remote' },
    workType: o.w ?? 'onsite', employmentType: o.e ?? 'full-time', industry: o.i,
    salary: o.min ? { min: o.min, max: o.max, currency: o.k === 'CA' ? 'CAD' : 'USD', period: o.p ?? 'yearly' } : undefined,
    descriptionSnippet: o.desc,
    description: `${o.desc}\n\nAbout the role\nYou will join a collaborative team and work closely with stakeholders. This is a sample listing shown because no live API keys are configured.\n\nResponsibilities\n• Deliver high-quality work in a fast-moving environment\n• Collaborate with colleagues across the organization\n• Communicate clearly, both written and verbal\n\nRequirements\n• Relevant experience or training for the role\n• Strong communication skills\n• Eligibility to work in ${o.k === 'CA' ? 'Canada' : 'the United States'}\n\nWhat we offer\n• Competitive compensation and benefits\n• Growth and learning opportunities`,
    applyUrl: `https://example.com/demo/${encodeURIComponent(o.c)}`,
    applyOptions: [
      { portal: 'Company site', url: `https://example.com/demo/${encodeURIComponent(o.c)}`, direct: true },
      ...(o.k === 'CA' ? [{ portal: 'Job Bank (Canada)', url: 'https://example.com/demo/jobbank', direct: false }] : []),
      { portal: 'Indeed', url: 'https://example.com/demo/indeed', direct: false },
      { portal: 'LinkedIn', url: 'https://example.com/demo/linkedin', direct: false },
    ].slice(0, 2 + (o.t.length % 3)),
    source: 'deep_link', postedAt: d(o.days),
  });
}

const rows: M[] = [
  { t: 'SOC Analyst (Tier 2)', c: 'Northwind Systems', city: 'Toronto', r: 'ON', k: 'CA', i: 'technology', w: 'hybrid', min: 88000, max: 112000, days: 1, desc: 'Monitor and triage alerts in Splunk, lead incident response, and tune SIEM detections. CISSP or Security+ an asset.' },
  { t: 'Cloud Security Engineer', c: 'Northwind Systems', city: 'Ottawa', r: 'ON', k: 'CA', i: 'technology', w: 'remote', min: 120000, max: 150000, days: 2, desc: 'Secure AWS and Azure workloads, automate guardrails with Terraform, and support SOC 2 and ISO 27001 audits.' },
  { t: 'Penetration Tester', c: 'Redline Security', city: 'Calgary', r: 'AB', k: 'CA', i: 'technology', w: 'remote', min: 105000, max: 135000, days: 3, desc: 'Web, network and cloud penetration testing. OSCP or CEH preferred; Python scripting required.' },
  { t: 'Junior Security Analyst', c: 'Redline Security', city: 'Vancouver', r: 'BC', k: 'CA', i: 'technology', min: 62000, max: 74000, days: 4, desc: 'Entry-level role: vulnerability scanning with Nessus, ticket triage, and reporting. Security+ an asset.' },
  { t: 'Bilingual Client Care Specialist', c: 'Northwind Systems', city: 'Montréal', r: 'QC', k: 'CA', i: 'customer_service', min: 24, max: 28, p: 'hourly', days: 6, desc: 'Support enterprise clients in French and English via phone and chat.' },
  { t: 'Senior Cloud Engineer', c: 'Northwind Systems', city: 'Waterloo', r: 'ON', k: 'CA', i: 'technology', w: 'hybrid', min: 115000, max: 145000, days: 1, desc: 'Design and operate AWS/Azure infrastructure, IaC, and observability for a growing SaaS platform.' },
  { t: 'Registered Nurse – Medical/Surgical', c: 'Halifax Health Network', city: 'Halifax', r: 'NS', k: 'CA', i: 'healthcare', min: 38, max: 54, p: 'hourly', days: 2, desc: 'Deliver patient-centred care on a busy med-surg unit. Shift premiums and relocation support available.' },
  { t: 'Journeyman Electrician', c: 'Peak Electrical Ltd.', city: 'Calgary', r: 'AB', k: 'CA', i: 'trades_construction', min: 42, max: 55, p: 'hourly', days: 3, desc: 'Commercial and industrial installs. Red Seal required. Company truck and benefits.' },
  { t: 'Bilingual Customer Support Agent', c: 'Maple Telecom', city: 'Montréal', r: 'QC', k: 'CA', i: 'customer_service', w: 'remote', min: 22, max: 27, p: 'hourly', days: 1, desc: 'Support customers in French and English via chat and phone. Fully remote within Quebec.' },
  { t: 'Line Cook', c: 'Harbourfront Grill', city: 'Vancouver', r: 'BC', k: 'CA', i: 'hospitality_tourism', e: 'part-time', min: 21, max: 25, p: 'hourly', days: 4, desc: 'Prep and line work in a high-volume seafood kitchen. Tips shared.' },
  { t: 'Financial Analyst', c: 'Lakeshore Capital', city: 'Toronto', r: 'ON', k: 'CA', i: 'finance_accounting', w: 'hybrid', min: 75000, max: 95000, days: 5, desc: 'Support forecasting, variance analysis and monthly reporting for portfolio companies.' },
  { t: 'Warehouse Associate', c: 'Prairie Logistics', city: 'Winnipeg', r: 'MB', k: 'CA', i: 'manufacturing_logistics', min: 20, max: 24, p: 'hourly', days: 2, desc: 'Pick, pack and load. Forklift ticket an asset.' },
  { t: 'Elementary School Teacher', c: 'Riverbend School District', city: 'Abbotsford', r: 'BC', k: 'CA', i: 'education', min: 68000, max: 108000, days: 8, desc: 'Grades 3–5 classroom teacher; BCTC certification required.' },
  { t: 'Software Engineer II', c: 'Cascade Labs', city: 'Seattle', r: 'WA', k: 'US', i: 'technology', w: 'hybrid', min: 150000, max: 190000, days: 1, desc: 'Build distributed backend services in Go and TypeScript.' },
  { t: 'ICU Registered Nurse', c: 'Lone Star Medical Center', city: 'Houston', r: 'TX', k: 'US', i: 'healthcare', min: 42, max: 62, p: 'hourly', days: 1, desc: 'Night shift ICU role, $10k sign-on bonus.' },
  { t: 'Paralegal', c: 'Hudson & Gray LLP', city: 'New York', r: 'NY', k: 'US', i: 'legal', min: 70000, max: 90000, days: 6, desc: 'Support corporate litigation team with discovery and filings.' },
  { t: 'Account Executive, Mid-Market', c: 'Brightpath', city: 'Austin', r: 'TX', k: 'US', i: 'sales_marketing', w: 'remote', min: 90000, max: 140000, days: 3, desc: 'Own full-cycle sales for mid-market accounts. OTE $180k+.' },
  { t: 'HVAC Technician', c: 'Sunbelt Mechanical', city: 'Phoenix', r: 'AZ', k: 'US', i: 'trades_construction', min: 28, max: 40, p: 'hourly', days: 2, desc: 'Residential service calls. EPA 608 certification required.' },
  { t: 'Hotel Front Desk Agent', c: 'Bayview Hotel', city: 'San Diego', r: 'CA', k: 'US', i: 'hospitality_tourism', e: 'part-time', min: 19, max: 23, p: 'hourly', days: 5, desc: 'Greet and check in guests; weekend availability needed.' },
  { t: 'Data Analyst (Federal)', c: 'Federal Statistics Bureau', city: 'Washington', r: 'DC', k: 'US', i: 'technology', min: 96000, max: 125000, days: 9, desc: 'Analyze economic datasets and prepare public reports. US citizenship required.' },
  { t: 'Cybersecurity Analyst', c: 'Halifax Digital Defence', city: 'Halifax', r: 'NS', k: 'CA', i: 'technology', w: 'hybrid', min: 85000, max: 110000, days: 2, desc: 'SOC monitoring, incident response, and vulnerability management.' },
  { t: 'Marketing Coordinator', c: 'Rocky Mountain Outdoors', city: 'Edmonton', r: 'AB', k: 'CA', i: 'sales_marketing', e: 'contract', min: 55000, max: 65000, days: 12, desc: '12-month contract covering campaign scheduling and social content.' },
  { t: 'Delivery Driver (Class 5)', c: 'Atlantic Courier', city: 'Moncton', r: 'NB', k: 'CA', i: 'manufacturing_logistics', e: 'temporary', min: 19, max: 23, p: 'hourly', days: 3, desc: 'Seasonal parcel delivery. Clean licence required.' },
];

export const mockJobs = (): JobListing[] => rows.map(mk);
