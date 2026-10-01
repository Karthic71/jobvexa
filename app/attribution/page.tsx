import LegalPage from '@/components/LegalPage';
import { BRAND } from '@/lib/brand';

export const metadata = { title: 'Data attribution' };

export default function Attribution() {
  return (
    <LegalPage title="Data attribution">
      <p>{BRAND.name} displays information supplied by the sources below. Each posting on the site shows the source it came from and links to the original listing. Names and marks belong to their owners.</p>

      <h2>Government of Canada — Job Bank</h2>
      <p>Contains information licensed under the <a href="https://open.canada.ca/en/open-government-licence-canada" target="_blank" rel="noopener noreferrer">Open Government Licence – Canada</a>. Source: <a href="https://www.jobbank.gc.ca/" target="_blank" rel="noopener noreferrer">Job Bank, Employment and Social Development Canada</a>. This is not an official Government of Canada service, and the Government of Canada does not endorse {BRAND.name}.</p>

      <h2>USAJobs</h2>
      <p>US federal listings from the <a href="https://developer.usajobs.gov/" target="_blank" rel="noopener noreferrer">USAJobs API</a>, a service of the U.S. Office of Personnel Management. {BRAND.name} is not affiliated with or endorsed by the U.S. government.</p>

      <h2>Adzuna</h2>
      <p>Jobs by <a href="https://www.adzuna.ca/" target="_blank" rel="noopener noreferrer">Adzuna</a>. Postings supplied through the Adzuna API link to the original advertiser.</p>

      <h2>Remotive</h2>
      <p>Remote jobs via <a href="https://remotive.com/" target="_blank" rel="noopener noreferrer">Remotive</a>. Each Remotive job links to its original page on Remotive.</p>

      <h2>Himalayas</h2>
      <p>Remote jobs via <a href="https://himalayas.app/" target="_blank" rel="noopener noreferrer">Himalayas</a>. Each Himalayas job links to its original page on Himalayas.</p>

      <h2>Jooble and JSearch</h2>
      <p>Some postings are supplied by <a href="https://jooble.org/" target="_blank" rel="noopener noreferrer">Jooble</a> and by JSearch (OpenWeb Ninja), and link to the original advertiser.</p>

      <h2>Employer career pages (ATS)</h2>
      <p>Where an employer publishes a public job board through Greenhouse, Lever, Ashby, Workable, Recruitee or a similar system, {BRAND.name} reads that public board and links to the employer’s own posting. Those companies’ names and logos belong to them and are used only to identify the employer of a posting.</p>

      <h2>Removal requests</h2>
      <p>Employers or source owners who want a listing or company page removed can email <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>.</p>
    </LegalPage>
  );
}
