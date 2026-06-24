// src/app/clients/[orgId]/sidebar.tsx — the persistent client-workspace sidebar (redesign V2 — Meridian
// navy+emerald). Dark navy-gradient rail with an emerald glow; active nav carries an emerald wash + mint
// left-rule. Client component only for active-link state (usePathname); carries no data logic.
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const I = {
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /></>,
  mis: <><path d="M6 3.5h8l4 4V20.5H6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M14 3.5v4h4M9 13h6M9 16.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></>,
  insights: <><path d="M12 3.5a6 6 0 00-3.5 10.9c.6.45.9 1 .9 1.7v.4h5.2v-.4c0-.7.3-1.25.9-1.7A6 6 0 0012 3.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M9.6 20.5h4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></>,
  forecast: <><path d="M3.5 20.5V3.5M3.5 20.5h17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /><path d="M7 15l3.5-4 3 2.5L20 6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M16.5 6.5H20v3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></>,
  strategy: <><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.7" /><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></>,
  data: <path d="M9 15l6-6M8 13l-2 2a3.5 3.5 0 005 5l2-2M16 11l2-2a3.5 3.5 0 00-5-5l-2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
  reconcile: <><path d="M4 7h11M4 7l3-3M4 7l3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M20 17H9M20 17l-3-3M20 17l-3 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></>,
};
const NavIcon = ({ d }: { d: React.ReactNode }) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="shrink-0">{d}</svg>;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'CL';

export function Sidebar({ orgId, orgName, entityType }: { orgId: string; orgName: string; entityType?: string | null }) {
  const pathname = usePathname();
  const base = `/clients/${orgId}`;
  const onMis = pathname.startsWith(`${base}/mis`) || pathname.startsWith(`${base}/periods`);
  // Active: emerald wash + mint left-rule + white label. Idle: muted light-on-navy, brightening on hover.
  const live = (active: boolean) =>
    `flex items-center gap-2.5 rounded-[10px] border-l-2 px-3 py-2 text-sm transition-colors ${
      active
        ? 'border-mint bg-[rgba(16,185,129,0.13)] font-semibold text-white'
        : 'border-transparent font-medium text-[rgba(214,224,236,0.6)] hover:bg-white/[0.06] hover:text-white'
    }`;

  return (
    <aside
      className="sticky top-0 z-30 flex h-screen w-64 shrink-0 flex-col self-start overflow-hidden text-white"
      style={{ background: 'linear-gradient(160deg,#0B1F4D 0%,#0F2A5E 60%,#08183A 100%)' }}
    >
      {/* Emerald glow — quiet brand presence behind the rail. */}
      <div aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-60 w-60" style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.16), transparent 70%)' }} />

      {/* Brand */}
      <div className="relative px-5 py-[18px]">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] shadow-[0_4px_14px_rgba(4,120,87,0.4)]"
            style={{ background: 'linear-gradient(135deg,#10B981 0%,#047857 60%,#065F46 100%)' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 19V5M4 19l5-5 4 3 7-8M20 6v4M20 6h-4" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-[0.02em] text-white">CapEasy</div>
            <div className="mt-px text-[10.5px] font-semibold uppercase tracking-[0.14em] text-mint">Virtual CFO</div>
          </div>
        </div>
      </div>

      <div className="mx-5 h-px bg-white/10" />

      {/* Client switcher (→ client list to switch) */}
      <div className="relative px-3.5 py-3.5">
        <Link href="/" className="flex w-full items-center gap-2.5 rounded-[10px] border border-white/10 bg-white/[0.04] px-2.5 py-2 transition-colors hover:bg-white/[0.08]">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-mint ring-1 ring-[#6EE7B7]/30" style={{ background: 'linear-gradient(135deg,#0F2A5E,#047857)' }}>{initials(orgName)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-white">{orgName}</div>
            <div className="text-[10.5px] text-[#94A3B8]">{entityType || 'Switch client'}</div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#94A3B8]"><path d="M8 9l4 4 4-4M8 15l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
      </div>

      {/* Section label */}
      <div className="px-5 pb-2 pt-1 text-[10.5px] font-semibold uppercase tracking-[0.13em] text-[rgba(148,163,184,0.65)]">Workspace</div>

      {/* Nav */}
      <nav className="relative flex flex-1 flex-col gap-[3px] px-3">
        <Link href={base} className={live(pathname === base)}><NavIcon d={I.overview} /><span>Overview</span></Link>
        <Link href={`${base}/mis`} className={live(onMis)}><NavIcon d={I.mis} /><span>MIS Pack</span></Link>
        <Link href={`${base}/forecast`} className={live(pathname.startsWith(`${base}/forecast`))}><NavIcon d={I.forecast} /><span>Forecast</span></Link>
        <Link href={`${base}/strategy`} className={live(pathname.startsWith(`${base}/strategy`))}><NavIcon d={I.strategy} /><span>Strategy</span></Link>
        <Link href={`${base}/insights`} className={live(pathname.startsWith(`${base}/insights`))}><NavIcon d={I.insights} /><span>Insights</span></Link>
        <Link href={`${base}/data-sources`} className={live(pathname.startsWith(`${base}/data-sources`))}><NavIcon d={I.data} /><span>Data Sources</span></Link>
        <Link href={`${base}/reconcile`} className={live(pathname.startsWith(`${base}/reconcile`))}><NavIcon d={I.reconcile} /><span>Reconcile</span></Link>
      </nav>

      {/* Footer — honest unverified status (reinforces the watermark), tuned for the dark rail. */}
      <div className="relative p-3.5">
        <div className="flex items-center gap-2 rounded-lg border border-amber-300/20 bg-amber-400/10 px-2.5 py-2">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-amber-400" />
          <div className="text-[11.5px] leading-tight">
            <div className="font-semibold text-amber-200">Sample — unverified</div>
            <div className="text-[#94A3B8]">Pending CA sign-off</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
