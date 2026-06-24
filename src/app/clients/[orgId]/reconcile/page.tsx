// src/app/clients/[orgId]/reconcile/page.tsx — Reconcile screen (Saral overlay, warm design). Bank +
// GST are reconciled AGAINST the books (source of truth); the gap is the insight. Files are processed
// in-memory only. Honest degradation: no books → add a period first; no upload → the panel prompts for one.
// The SAMPLE watermark + status ribbon come from the shared client layout.
import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getMisChain } from '@/lib/engine/mis-data';
import { ReconcilePanel } from './reconcile-panel';

export default async function ReconcilePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const chain = await getMisChain(orgId);
  if (!chain) notFound();
  const hasBooks = chain.results.length > 0;
  const latest = hasBooks ? chain.periods[chain.periods.length - 1] : null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-white/85 px-8 py-4 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">Bank &amp; GST Check</h1>
            <p className="mt-0.5 text-[12.5px] text-muted">{chain.org.legalName}{latest ? ` · books: ${latest.label}` : ''} · we compare your bank &amp; GST to your books — <span className="font-semibold text-amber-700">the gap is the insight</span></p>
          </div>
          <span className="rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700 ring-1 ring-inset ring-amber-600/20">Cross-check</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-8 py-7">
        {/* Framing — what this is, and what it deliberately is NOT */}
        <div className="rounded-lg border border-line bg-primary-50/40 p-4">
          <p className="text-[13px] leading-relaxed text-body">
            The <strong className="text-ink">accounting books are the source of truth</strong>. Bank statements and GST returns are <strong className="text-ink">cross-checks</strong> — this reconciles them against the books and surfaces the <strong className="text-ink">gaps</strong>. It does <em>not</em> rebuild your accounts from bank/GST or classify bank narrations (a proven dead-end). What it checks: bank receipts with no matching booking (possible unrecorded revenue / timing), and booked sales vs GST-filed sales (under-reporting or unrecorded revenue).
          </p>
        </div>

        {!hasBooks ? (
          <div className="card p-8 text-center">
            <p className="text-sm font-semibold text-ink">No books to reconcile against yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-muted">Reconciliation checks bank/GST <em>against</em> the books — add a period and upload a trial balance first, then come back to cross-check.</p>
            <Link href={`/clients/${orgId}`} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">← Add a period</Link>
          </div>
        ) : (
          <ReconcilePanel orgId={orgId} />
        )}

        <p className="pb-2 text-center text-[11.5px] text-muted">Reconciliation is a cross-check, not an audit — it sees only the files you upload. Parse-quality issues are shown apart from real gaps so a misread never reads as a compliance problem.</p>
      </main>
    </div>
  );
}
