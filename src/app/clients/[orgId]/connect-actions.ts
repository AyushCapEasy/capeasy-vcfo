'use server';
// src/app/clients/[orgId]/connect-actions.ts — the "Connect your financial data" on-ramp (Tally).
// One action, two phases driven by a `confirm` flag from the form:
//   • DETECT  — parse the upload in-memory, return what we found (company, month, ledger + P&L/BS counts)
//               so the user can eyeball it ("look right?"). Nothing is created.
//   • BUILD   — on confirm: create the period FROM THE DETECTED MONTH, commit the trial balance, and
//               AUTO-MAP every ledger to its category via Tally's group classification (no manual
//               mapping step), mark the user's setup complete, then land them on their Financials.
// Tally exports carry the parent group, so classification is automatic — that is what makes the "aha"
// (real P&L + Balance Sheet on first upload) possible. In-memory parse only (D-014); the period's
// trial_balance_lines + account_mappings are the only persisted artifacts, same as any TB upload.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { analyzeTallyForOnboarding } from '@/lib/tally/onboarding';
import { monthLabel, taxYearLabel } from '@/lib/intake/period';

export type DetectedMeta = {
  companyName: string | null;
  monthIso: string | null;       // 'YYYY-MM-01' (period close month) or null if not detected
  periodLabel: string | null;    // 'Mar 2026'
  dateDetected: boolean;
  ledgerCount: number;
  plCount: number;
  bsCount: number;
  unclassified: number;
};
export type ConnectState = { phase: 'idle' | 'detected'; error?: string; meta?: DetectedMeta };

const monthIsoFrom = (toDate: string | null, picked: string): string | null => {
  if (toDate && /^\d{4}-\d{2}-\d{2}$/.test(toDate)) return `${toDate.slice(0, 7)}-01`;
  if (/^\d{4}-\d{2}$/.test(picked)) return `${picked}-01`;
  return null;
};

export async function connectTally(orgId: string, _prev: ConnectState, formData: FormData): Promise<ConnectState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { phase: 'idle', error: 'Choose your Tally export (XML) to continue.' };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const analysis = analyzeTallyForOnboarding(bytes);
  if (!analysis.ok) return { phase: 'idle', error: analysis.error };

  const picked = String(formData.get('month') ?? '');
  const monthIso = monthIsoFrom(analysis.toDate, picked);
  const confirm = formData.get('confirm') === '1';

  const meta: DetectedMeta = {
    companyName: analysis.companyName,
    monthIso,
    periodLabel: monthIso ? monthLabel(monthIso) : null,
    dateDetected: !!analysis.toDate,
    ledgerCount: analysis.counts.ledgers,
    plCount: analysis.counts.pl,
    bsCount: analysis.counts.bs,
    unclassified: analysis.counts.unclassified,
  };

  // DETECT phase — show what we found; create nothing.
  if (!confirm) return { phase: 'detected', meta };

  // BUILD phase — need a month (detected, or picked on the fallback).
  if (!monthIso) return { phase: 'detected', meta, error: 'Pick the month these books are for, then continue.' };

  // 1) Create-or-reuse the period for the detected month (chained to the latest earlier period).
  const { data: existing } = await supabase.from('periods').select('id').eq('org_id', orgId).eq('period_month', monthIso).maybeSingle();
  let periodId = existing?.id as string | undefined;
  if (!periodId) {
    const { data: prior } = await supabase
      .from('periods').select('id').eq('org_id', orgId).lt('period_month', monthIso)
      .order('period_month', { ascending: false }).limit(1).maybeSingle();
    const { data: created, error } = await supabase
      .from('periods')
      .insert({ org_id: orgId, period_month: monthIso, tax_year: taxYearLabel(monthIso), label: monthLabel(monthIso), prior_period_id: prior?.id ?? null, status: 'draft' })
      .select('id').single();
    if (error || !created) return { phase: 'detected', meta, error: 'Could not create the month. Please try again.' };
    periodId = created.id;
  }

  // 2) Commit the trial balance (replace any prior rows for this period).
  await supabase.from('trial_balance_lines').delete().eq('period_id', periodId);
  const { error: tbErr } = await supabase.from('trial_balance_lines').insert(
    analysis.ledgers.map((l) => ({
      period_id: periodId!, org_id: orgId,
      source_account_code: l.name, source_account_name: l.name,
      debit_amount: l.debitPaise, credit_amount: l.creditPaise,
    }))
  );
  if (tbErr) return { phase: 'detected', meta, error: 'Could not save your accounts. Please try again.' };

  // 3) Auto-map every classified ledger to its canonical category (Tally group classification → category).
  const { data: cats } = await supabase.from('account_categories').select('id, code');
  const codeToId = new Map((cats ?? []).map((c) => [c.code, c.id]));
  const mappings = analysis.ledgers
    .filter((l) => l.categoryCode && codeToId.has(l.categoryCode))
    .map((l) => ({ org_id: orgId, source_account_code: l.name, source_account_name: l.name, category_id: codeToId.get(l.categoryCode!)! }));
  if (mappings.length) await supabase.from('account_mappings').upsert(mappings, { onConflict: 'org_id,source_account_code' });

  // 4) Mark this user's setup complete (stops the welcome guide) + audit.
  await supabase.from('profiles').update({ setup_complete: true }).eq('id', user.id);
  try {
    await supabase.from('audit_log').insert({ org_id: orgId, action: 'connect.tally', target_table: 'periods', target_id: periodId, detail: { ledgers: analysis.ledgers.length, mapped: mappings.length, month: monthIso } });
  } catch { /* non-critical */ }

  // 5) Land on the financials — the aha.
  redirect(`/clients/${orgId}/mis?p=${periodId}`);
}
