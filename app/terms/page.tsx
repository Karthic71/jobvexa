import Link from 'next/link';
import LegalPage from '@/components/LegalPage';
import { BRAND } from '@/lib/brand';

export const metadata = { title: 'Terms of use' };

export default function Terms() {
  return (
    <LegalPage title="Terms of use">
      <p>These terms apply to your use of {BRAND.name} (the “Service”), created and operated by {BRAND.author}. By using the Service you agree to them. If you do not agree, please do not use it.</p>

      <h2>1. What the Service is</h2>
      <p>{BRAND.name} is a free search tool that gathers publicly available job postings from official APIs, licensed job-search providers and employers’ own career pages, and links each posting back to its original source. {BRAND.name} is not an employer, recruiter or employment agency, does not take part in hiring decisions, and does not accept applications. When you apply, you do so on the original site (the employer’s site or the job portal where the job is posted); {BRAND.name} only shows you where the job is posted and links you there.</p>

      <h2>2. No guarantee of accuracy or availability</h2>
      <p>Postings come from third parties and may be out of date, filled, removed or wrong. Details such as salary, skills, certifications and seniority are extracted automatically and can be inaccurate. Always confirm details on the original posting. The Service is provided “as is” and “as available”, without warranties of any kind, and may be interrupted or changed at any time.</p>

      <h2>3. Third-party sites and trademarks</h2>
      <p>Links to third-party sites (including job platforms and employer career pages) are provided for convenience. {BRAND.name} does not control and is not responsible for their content, practices or terms. Names and logos of other companies and platforms, including Indeed, LinkedIn and Glassdoor, are trademarks of their respective owners. {BRAND.name} is not affiliated with, sponsored or endorsed by them. Beware of job scams: never pay to apply and be cautious sharing personal information.</p>

      <h2>4. Acceptable use</h2>
      <ul>
        <li>Do not overload the Service with automated requests.</li>
        <li>Do not attempt to disrupt, probe or gain unauthorized access to the Service or its data sources.</li>
        <li>Do not use the Service to send unsolicited messages, or in any unlawful way.</li>
        <li>Job data belongs to its sources and is subject to their terms; do not republish it in bulk.</li>
      </ul>

      <h2>5. Your data</h2>
      <p>The Service has no accounts. Features such as saved jobs, your Applied list and recent searches are stored only in your own browser. See the <Link href="/privacy">Privacy policy</Link>.</p>

      <h2>6. Intellectual property</h2>
      <p>The {BRAND.name} name, design and original code are © {BRAND.year} {BRAND.author}. Source code is released under the licence stated in the project’s LICENSE file. Job listings and their descriptions remain the property of their respective owners and sources; see <Link href="/attribution">Data attribution</Link>.</p>

      <h2>7. Limitation of liability</h2>
      <p>To the fullest extent permitted by law, {BRAND.author} is not liable for any indirect, incidental, special or consequential loss, or for loss of employment opportunities, income or data, arising from your use of, or inability to use, the Service or from reliance on any posting. Nothing in these terms limits liability that cannot be limited by law, including any consumer rights that cannot be waived.</p>

      <h2>8. Changes and governing law</h2>
      <p>These terms may be updated from time to time; the date above shows the latest version and continued use means acceptance. These terms are governed by the laws of {BRAND.jurisdiction}, and the courts of that jurisdiction have non-exclusive jurisdiction, subject to any mandatory local consumer protections.</p>

      <h2>9. Contact and takedown requests</h2>
      <p>Questions, corrections, or requests to remove a posting or company page: <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>. We will respond as soon as reasonably possible.</p>
    </LegalPage>
  );
}
