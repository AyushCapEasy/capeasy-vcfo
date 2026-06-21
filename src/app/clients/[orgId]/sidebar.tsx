// src/app/clients/[orgId]/sidebar.tsx — the persistent client-workspace sidebar (redesign shell).
// Client component only for active-link state (usePathname); carries no data logic. Branding is CapEasy.
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const I = {
  overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" /></>,
  mis: <><path d="M6 3.5h8l4 4V20.5H6z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M14 3.5v4h4M9 13h6M9 16.5h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></>,
  insights: <><path d="M12 3.5a6 6 0 00-3.5 10.9c.6.45.9 1 .9 1.7v.4h5.2v-.4c0-.7.3-1.25.9-1.7A6 6 0 0012 3.5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /><path d="M9.6 20.5h4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></>,
  data: <path d="M9 15l6-6M8 13l-2 2a3.5 3.5 0 005 5l2-2M16 11l2-2a3.5 3.5 0 00-5-5l-2 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />,
};
const NavIcon = ({ d }: { d: React.ReactNode }) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="shrink-0">{d}</svg>;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'CL';

export function Sidebar({ orgId, orgName, entityType }: { orgId: string; orgName: string; entityType?: string | null }) {
  const pathname = usePathname();
  const base = `/clients/${orgId}`;
  const onMis = pathname.startsWith(`${base}/mis`) || pathname.startsWith(`${base}/periods`);
  const live = (active: boolean) =>
    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${active ? 'bg-primary-50 font-semibold text-primary' : 'font-medium text-body hover:bg-hair'}`;
  const soon = 'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-faint cursor-default';

  return (
    <aside className="sticky top-0 z-30 flex h-screen w-64 shrink-0 flex-col self-start border-r border-line bg-white">
      {/* Brand */}
      <div className="border-b border-line px-5 py-[18px]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px] bg-primary">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M4 19V9M9.5 19V5M15 19v-7M20.5 19v-10" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" /></svg>
          </div>
          <div>
            <div className="text-[15px] font-bold tracking-[0.02em] text-ink">CapEasy</div>
            <div className="mt-px text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">Virtual CFO</div>
          </div>
        </div>
      </div>

      {/* Client switcher (→ client list to switch) */}
      <div className="px-3.5 py-3.5">
        <Link href="/" className="flex w-full items-center gap-2.5 rounded-[9px] border border-line bg-canvas px-2.5 py-2 hover:bg-hair">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-white">{initials(orgName)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12.5px] font-semibold text-ink">{orgName}</div>
            <div className="text-[10.5px] text-muted">{entityType || 'Switch client'}</div>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="shrink-0"><path d="M8 9l4 4 4-4M8 15l4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-muted" /></svg>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-[3px] px-3.5 py-1.5">
        <Link href={base} className={live(pathname === base)}><NavIcon d={I.overview} /><span>Overview</span></Link>
        <Link href={`${base}/mis`} className={live(onMis)}><NavIcon d={I.mis} /><span>MIS Pack</span></Link>
        <Link href={`${base}/insights`} className={live(pathname.startsWith(`${base}/insights`))}><NavIcon d={I.insights} /><span>Insights</span></Link>
        <span className={soon} title="Coming next"><NavIcon d={I.data} /><span>Data Sources</span><span className="ml-auto text-[9px] font-semibold uppercase tracking-wide">soon</span></span>
      </nav>

      {/* Footer — honest unverified status (reinforces the watermark) */}
      <div className="mt-auto p-3.5">
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-2 ring-1 ring-inset ring-amber-600/15">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-amber-500" />
          <div className="text-[11.5px] leading-tight">
            <div className="font-semibold text-amber-700">Sample — unverified</div>
            <div className="text-muted">Pending CA sign-off</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
