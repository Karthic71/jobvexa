import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">The page you’re looking for doesn’t exist or has moved.</p>
      <Link href="/" className="btn mt-4">Search jobs</Link>
    </div>
  );
}
