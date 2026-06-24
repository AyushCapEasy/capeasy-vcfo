'use client';
// src/app/clients/[orgId]/connect-data.tsx — the new-user hero: "Connect your financial data".
// Two paths — Upload Tally (working) and Connect Zoho (full support in progress). A Tally upload is
// parsed in-memory and we show back what we found ("look right?"); on confirm we build the month and
// land on the financials. The build moment is a calm, stepped progress (Mac-setup style), not a spinner.
import { useActionState, useEffect, useState } from 'react';
import { connectTally, type ConnectState } from './connect-actions';

const initial: ConnectState = { phase: 'idle' };

function thisMonth(): string {
  // Avoid Date.now in the render path being odd across SSR — compute on the client only.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const BUILD_STEPS = ['Reading your ledgers', 'Building your Profit & Loss', 'Building your Balance Sheet', 'Almost there'];

function Building({ label }: { label: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, BUILD_STEPS.length - 1)), 950);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center">
      <div className="relative flex h-14 w-14 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-primary/15" />
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="relative text-primary"><path d="M4 19V5M4 19l5-5 4 3 7-8M20 6v4M20 6h-4" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <p className="font-serif text-lg font-semibold text-ink">{label}</p>
      <ul className="flex flex-col gap-2 text-left">
        {BUILD_STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2.5 text-sm transition-colors ${i < step ? 'text-muted' : i === step ? 'font-medium text-ink' : 'text-faint'}`}>
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${i < step ? 'bg-positive text-white' : i === step ? 'bg-primary/15' : 'bg-hair'}`}>
              {i < step ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg> : i === step ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> : null}
            </span>
            {s}{i === step ? '…' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ConnectData({ orgId }: { orgId: string }) {
  const [state, action, pending] = useActionState(connectTally.bind(null, orgId), initial);
  const [fileName, setFileName] = useState('');
  const detected = state.phase === 'detected';
  const meta = state.meta;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-7 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[13px] shadow-[0_6px_18px_rgba(4,120,87,0.35)]" style={{ background: 'linear-gradient(135deg,#10B981 0%,#047857 60%,#065F46 100%)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink">Connect your financial data</h1>
        <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted">Bring in your books and we&apos;ll build your financial statements automatically — no manual data entry.</p>
      </div>

      <form action={action} className="card overflow-hidden p-0">
        {/* The file input stays mounted across phases so the chosen file re-submits on confirm. */}
        <input
          type="file" name="file" accept=".xml" required={!detected}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
          className={`${detected || pending ? 'hidden' : ''} sr-only`} id="tally-file"
        />

        {pending ? (
          <Building label={detected ? 'Building your financials' : 'Reading your file…'} />
        ) : detected && meta ? (
          <div className="p-6 sm:p-7">
            <div className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-positive">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-positive text-white"><svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
              Here&apos;s what we found{fileName ? ` in ${fileName}` : ''} — look right?
            </div>
            <dl className="grid gap-px overflow-hidden rounded-xl bg-line sm:grid-cols-2">
              <Found label="Company" value={meta.companyName ?? '—'} />
              <Found label="Reporting month" value={meta.periodLabel ?? (meta.dateDetected ? '—' : 'not in the file — pick it below')} />
              <Found label="Ledgers found" value={`${meta.ledgerCount}`} />
              <Found label="Accounts classified" value={`${meta.plCount} P&L · ${meta.bsCount} Balance Sheet`} />
            </dl>
            {meta.unclassified > 0 ? (
              <p className="mt-3 text-[12px] text-muted">{meta.unclassified} ledger{meta.unclassified === 1 ? '' : 's'} we couldn&apos;t auto-classify will sit under “unmapped” — you can fix those later; everything else is ready.</p>
            ) : null}

            {!meta.dateDetected ? (
              <label className="mt-4 flex flex-col gap-1.5">
                <span className="label">Which month are these books for?</span>
                <input type="month" name="month" required defaultValue={thisMonth()} className="input w-auto" />
              </label>
            ) : null}

            {state.error ? <p role="alert" className="mt-3 text-sm font-medium text-negative">{state.error}</p> : null}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <input type="hidden" name="confirm" value="1" />
              <button type="submit" className="btn btn-primary">Build my financials →</button>
              <a href={`/clients/${orgId}`} className="btn btn-ghost text-muted">Choose a different file</a>
            </div>
          </div>
        ) : (
          <div className="grid gap-px bg-line sm:grid-cols-2">
            {/* Tally — working path */}
            <div className="flex flex-col bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white" style={{ background: '#1A3A6B' }}>Ty</div>
                <div>
                  <p className="text-[15px] font-semibold text-ink">Upload Tally export</p>
                  <p className="text-[12px] text-muted">Trial Balance XML from Tally</p>
                </div>
              </div>
              <p className="mt-3 flex-1 text-[12.5px] leading-relaxed text-body">Export your Trial Balance from Tally and drop the file here. We read it in memory and build your statements — your file is never stored.</p>
              <label htmlFor="tally-file" className="mt-4 cursor-pointer rounded-[var(--radius-ctl)] border border-dashed border-line-strong bg-canvas px-4 py-3 text-center text-[13px] font-medium text-body hover:border-primary hover:text-primary">
                {fileName ? `✓ ${fileName}` : 'Choose Tally XML file…'}
              </label>
              {state.error ? <p role="alert" className="mt-2 text-[12.5px] font-medium text-negative">{state.error}</p> : null}
              <button type="submit" className="btn btn-primary mt-3">Continue</button>
            </div>

            {/* Zoho — honest coming-soon (not clickable) */}
            <div className="flex flex-col bg-white p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white" style={{ background: '#C8202F' }}>Zo</div>
                <div>
                  <p className="text-[15px] font-semibold text-ink">Connect Zoho Books</p>
                  <p className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted"><span className="h-[7px] w-[7px] rounded-full bg-faint ring-[3px] ring-line" />Coming soon</p>
                </div>
              </div>
              <p className="mt-3 flex-1 text-[12.5px] leading-relaxed text-body">Direct sync from Zoho Books — your complete books, no export needed. We&apos;re finishing full Zoho support; for now, use the Tally upload.</p>
              <button type="button" disabled className="btn btn-secondary mt-4 cursor-not-allowed opacity-55">Connect Zoho (soon)</button>
            </div>
          </div>
        )}
      </form>

      <p className="mt-4 text-center text-[12px] text-muted">Processed in memory only — your data is never stored as a file.</p>
    </div>
  );
}

function Found({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="num mt-0.5 text-[14px] font-semibold text-ink">{value}</dd>
    </div>
  );
}
