// src/app/clients/[orgId]/layout.tsx — shared client-workspace shell (redesign): persistent sidebar +
// the SAMPLE watermark + status ribbon on every client screen. Auth-gated; fetches the org for the
// sidebar's client name only — page-level data/logic is unchanged and still lives in each page.
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Watermark, StatusRibbon } from './mis/watermark';
import { Sidebar } from './sidebar';

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: org } = await supabase.from('orgs').select('legal_name, entity_type, status').eq('id', orgId).single();
  if (!org) notFound(); // not found OR RLS-denied (cross-tenant)
  // Approval gate (app layer; RLS is the deeper guarantee): a pending org reaches NO data — it lands on
  // the pending screen instead of the workspace shell. Existing orgs were grandfathered active in 0011.
  if (org.status !== 'active') redirect('/pending');

  return (
    <div className="flex flex-1">
      <Watermark />
      <Sidebar orgId={orgId} orgName={org.legal_name} entityType={org.entity_type} />
      <div className="flex min-w-0 flex-1 flex-col">
        <StatusRibbon />
        {children}
      </div>
    </div>
  );
}
