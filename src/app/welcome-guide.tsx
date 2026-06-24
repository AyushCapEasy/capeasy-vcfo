'use client';
// src/app/welcome-guide.tsx — Mac-setup-style first-run welcome. Calm, spacious, navy+emerald, four
// plain steps with a graphic each. Shown by the home page on odd logins until setup is complete; the
// user can dismiss it for this session (X / Get started) or forever ("Don't show this again").
import { useState } from 'react';
import { dismissWelcome } from './actions';

const STEPS = [
  { line: 'Connect your books', sub: 'Upload your Tally export (Zoho coming soon).',
    icon: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" /> },
  { line: 'We build your financials', sub: 'Your Profit & Loss and Balance Sheet, automatically.',
    icon: <path d="M4 19V5M4 19l5-5 4 3 7-8M20 6v4M20 6h-4" /> },
  { line: 'Add bank & GST to cross-check', sub: 'Spot gaps between your books and reality.',
    icon: <><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></> },
  { line: 'Get forecasts & guidance', sub: 'See where you’re heading and what to consider next.',
    icon: <path d="M3 17l5-5 4 4 7-8M16 8h5v5" /> },
];

export function WelcomeGuide({ firstName }: { firstName?: string | null }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Welcome to Saral">
      <button aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 cursor-default" style={{ background: 'rgba(11,31,77,0.55)', backdropFilter: 'blur(2px)' }} />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Navy header band with emerald glow */}
        <div className="relative overflow-hidden px-8 pb-7 pt-9 text-center text-white" style={{ background: 'linear-gradient(135deg,#0B1F4D 0%,#0F2A5E 60%,#08183A 100%)' }}>
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-48 w-48" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.30), transparent 70%)' }} />
          <div className="relative">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[13px] shadow-[0_6px_18px_rgba(4,120,87,0.45)]" style={{ background: 'linear-gradient(135deg,#10B981 0%,#047857 60%,#065F46 100%)' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19l5-5 4 3 7-8M20 6v4M20 6h-4" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h2 className="font-serif text-2xl font-semibold tracking-tight">Welcome to Saral{firstName ? `, ${firstName}` : ''}</h2>
            <p className="mt-1.5 text-[13.5px] text-mint">Your books in, clear financials out. Here&apos;s how it works.</p>
          </div>
        </div>

        <div className="px-8 py-7">
          <ol className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li key={i} className="flex items-start gap-3.5">
                <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
                  <span className="absolute -left-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-ink text-[9px] font-bold text-white">{i + 1}</span>
                </span>
                <div>
                  <p className="text-[14px] font-semibold text-ink">{s.line}</p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{s.sub}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-7 flex items-center justify-between gap-3">
            <form action={dismissWelcome}>
              <button type="submit" onClick={() => setOpen(false)} className="text-[12.5px] font-medium text-muted hover:text-body hover:underline">Don&apos;t show this again</button>
            </form>
            <button onClick={() => setOpen(false)} className="btn btn-primary">Get started →</button>
          </div>
        </div>
      </div>
    </div>
  );
}
