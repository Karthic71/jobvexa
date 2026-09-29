'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeToggle from './ThemeToggle';
import { BRAND } from '@/lib/brand';
import { useSaved } from './useSaved';

const NAV = [
  { href: '/', label: 'Search' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/saved', label: 'My jobs' },
  { href: '/sources', label: 'Sources' },
];

export default function Header() {
  const path = usePathname();
  const { count } = useSaved();
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 py-5">
      <Link href="/" className="block">
        <span className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="rgb(var(--accent))" /><path d="M18 8v10.5a4.5 4.5 0 0 1-9 0" fill="none" stroke="rgb(var(--accent-fg))" strokeWidth="3.2" strokeLinecap="round" /><path d="M21 8l4 4-4 4" fill="none" stroke="rgb(var(--accent-fg))" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity=".8" /></svg>
          <span>Job<span className="text-accent">vexa</span></span>
        </span>
        <span className="block text-xs text-muted">{BRAND.tagline}</span>
      </Link>
      <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Main">
        {NAV.map((n) => {
          const active = n.href === '/' ? path === '/' : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 ${active ? 'bg-accent/15 text-accent' : 'text-muted hover:text-fg'}`}>
              {n.label}{n.href === '/saved' ? ` (${count})` : ''}
            </Link>
          );
        })}
        <ThemeToggle />
      </nav>
    </header>
  );
}
