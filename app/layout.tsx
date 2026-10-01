import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import Header from '@/components/Header';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.siteUrl),
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s — ${BRAND.name}` },
  description: BRAND.description,
  authors: [{ name: BRAND.author }],
  creator: BRAND.author,
  openGraph: { title: BRAND.name, description: BRAND.description, siteName: BRAND.name, type: 'website' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// Sets the theme before first paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('jobvexa.theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {process.env.NODE_ENV === 'production' && (
          // Static hosting can't send security headers, so the key ones are set here.
          <meta httpEquiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests" />
        )}
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="mx-auto max-w-7xl px-4 pb-16">
          <Header />
          {children}
          <footer className="mt-12 space-y-2 border-t border-line pt-6 text-center text-xs text-muted">
            <p>
              {BRAND.name} links to publicly available job postings from official APIs, licensed job-search providers and employer career pages. Every job links back to its original source.
              Indeed, LinkedIn, Glassdoor and other platform names are trademarks of their owners; {BRAND.name} is not affiliated with or endorsed by them. Search links to those sites are provided for convenience only.
            </p>
            <p>
              <Link href="/sources" className="hover:text-accent hover:underline">Sources &amp; how it works</Link> ·{' '}
              <Link href="/coverage" className="hover:text-accent hover:underline">Coverage report</Link> ·{' '}
              <Link href="/terms" className="hover:text-accent hover:underline">Terms</Link> ·{' '}
              <Link href="/privacy" className="hover:text-accent hover:underline">Privacy</Link> ·{' '}
              <Link href="/attribution" className="hover:text-accent hover:underline">Data attribution</Link>
            </p>
            <p>© {BRAND.year} {BRAND.name}. Created by <span className="font-medium text-fg">{BRAND.author}</span>.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
