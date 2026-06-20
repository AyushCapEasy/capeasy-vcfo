// src/app/not-found.tsx — styled 404 (replaces Next's default). Presentational only; rendered when a
// route is missing or notFound() fires (e.g. an RLS-denied client — deliberately indistinguishable).
import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="card max-w-md p-10 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-1.5 text-xl font-bold text-slate-900">Not found</h1>
        <p className="mt-1.5 text-sm text-slate-500">This page doesn’t exist, or you don’t have access to it.</p>
        <Link href="/" className="btn btn-primary mt-5 inline-flex">← Back to workspaces</Link>
      </div>
    </main>
  );
}
