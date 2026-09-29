import { BRAND } from '@/lib/brand';

export default function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="card mx-auto max-w-3xl space-y-4 p-6 text-sm leading-relaxed [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_a]:text-accent [&_a:hover]:underline [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_p]:text-muted [&_li]:text-muted">
      <h1 className="text-xl font-semibold text-fg">{title}</h1>
      <p>Last updated: {BRAND.lastUpdated}</p>
      {children}
    </article>
  );
}
