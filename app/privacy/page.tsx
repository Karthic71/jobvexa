import LegalPage from '@/components/LegalPage';
import { BRAND } from '@/lib/brand';

export const metadata = { title: 'Privacy policy' };

export default function Privacy() {
  return (
    <LegalPage title="Privacy policy">
      <p>{BRAND.name} is designed to work without collecting personal information. This page explains exactly what is and isn’t stored. The Service is operated by {BRAND.author} in {BRAND.jurisdiction} and aims to follow Canada’s <em>Personal Information Protection and Electronic Documents Act</em> (PIPEDA) and comparable privacy laws.</p>

      <h2>What we do not do</h2>
      <ul>
        <li>No accounts, sign-ups or passwords.</li>
        <li>No advertising, no ad trackers, and no selling or sharing of personal information.</li>
        <li>No analytics or tracking cookies at the time of writing. If that changes, this policy and a consent notice will be updated first.</li>
      </ul>

      <h2>What is stored in your browser</h2>
      <p>To make the site work, the following is saved in your browser’s local storage on your own device. It is never sent to our servers, and you can delete it any time by clearing site data:</p>
      <ul>
        <li>Your light/dark theme choice.</li>
        <li>Jobs you save, your application tracker (status and notes), and your saved searches.</li>
        <li>If you use Resume match: the resume text you paste and the keywords found in it. It is analysed in your browser and never uploaded; use “Delete from this browser” to remove it.</li>
        <li>If you use “Check your resume for this job”: the resume text (only if you tick “Remember my resume”) and the score for each job you checked, so the tracker can show it. The check runs in your browser; nothing is uploaded.</li>
        <li>Your recent searches.</li>
      </ul>

      <h2>What is sent over the network</h2>
      <p>{BRAND.name} is a static website. Job data is downloaded to your browser and <strong>your searches and filters are processed on your own device</strong> — they are not sent to us or to any job-data provider. The site is hosted on GitHub Pages; like any web host, GitHub may keep standard technical logs (such as IP address and pages requested) under <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement" target="_blank" rel="noopener noreferrer">GitHub’s privacy statement</a>. We do not receive or use those logs to identify you.</p>

      <h2>Third-party sites</h2>
      <p>When you click a job, company or platform link, you leave {BRAND.name} and the destination site’s own privacy policy applies. Search links to other platforms include the keywords and location you searched for.</p>

      <h2>Children</h2>
      <p>The Service is a general job-search tool and is not directed at children under 13, and we do not knowingly collect information from them.</p>

      <h2>Your rights and contact</h2>
      <p>Because we do not keep personal information about you, there is normally nothing to access or delete beyond what is in your browser. If you believe we hold information about you, or have a privacy question or complaint, contact <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>. In Canada you may also contact the Office of the Privacy Commissioner of Canada.</p>

      <h2>Changes</h2>
      <p>We will update this policy and its date above if our practices change.</p>
    </LegalPage>
  );
}
