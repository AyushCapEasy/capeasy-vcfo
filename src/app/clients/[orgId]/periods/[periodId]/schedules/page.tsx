// src/app/clients/[orgId]/periods/[periodId]/schedules/page.tsx — capture the OPTIONAL supporting schedules
// for a period. The trial balance alone produces a coherent MIS; each schedule here UNLOCKS the named extra
// dimension. When a schedule is empty we say what it would unlock ("add X to see Y") — we never fabricate it.
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { paiseToInr } from '@/lib/intake/money';
import { monthLabel } from '@/lib/intake/period';
import { SCHEDULES, type ScheduleDef, type ScheduleField } from '@/lib/schedules/config';
import { addScheduleRow, deleteScheduleRow } from './actions';

function renderCell(field: ScheduleField, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.kind === 'money') return paiseToInr(Number(value));
  if (field.kind === 'rate') return `${value}%`;
  if (field.kind === 'bool') return value ? 'Recurring' : 'One-time';
  return String(value);
}

function AddField({ field }: { field: ScheduleField }) {
  const cls = 'rounded-[var(--radius-ctl)] border border-line-strong bg-white px-2 py-1.5 text-xs text-ink shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25';
  if (field.kind === 'bool') {
    return <label className="flex items-center gap-1.5 text-xs text-body"><input type="checkbox" name={field.name} /> {field.label}</label>;
  }
  if (field.kind === 'select') {
    return (
      <select name={field.name} defaultValue={field.options?.[0] ?? ''} className={cls} aria-label={field.label}>
        {(field.options ?? []).map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
      </select>
    );
  }
  const numeric = field.kind === 'money' || field.kind === 'int' || field.kind === 'rate';
  return <input type={numeric ? 'number' : 'text'} step={field.kind === 'rate' ? '0.001' : numeric ? '0.01' : undefined} name={field.name} placeholder={field.label} className={`${cls} w-28`} aria-label={field.label} />;
}

function ScheduleCard({ orgId, periodId, def, rows }: { orgId: string; periodId: string; def: ScheduleDef; rows: Record<string, unknown>[] }) {
  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{def.label}</h2>
        <span className="text-[11.5px] text-muted">Unlocks: <span className="font-medium text-body">{def.unlocks}</span></span>
      </div>

      {rows.length ? (
        <table className="mt-3 w-full text-sm">
          <thead className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>{def.fields.map((f) => <th key={f.name} className="py-1.5 pr-3">{f.label}</th>)}<th className="py-1.5" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={String(r.id)}>
                {def.fields.map((f) => <td key={f.name} className="py-1.5 pr-3 text-body">{renderCell(f, r[f.name])}</td>)}
                <td className="py-1.5 text-right">
                  <form action={deleteScheduleRow.bind(null, orgId, periodId, def.table)}>
                    <input type="hidden" name="id" value={String(r.id)} />
                    <button className="text-xs font-medium text-red-600 hover:underline">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-2 text-[12.5px] text-muted">Not added yet — add {def.label.toLowerCase()} to unlock <span className="font-medium text-body">{def.unlocks}</span>. (Optional — your MIS works without it.)</p>
      )}

      <form action={addScheduleRow.bind(null, orgId, periodId, def.table)} className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {def.fields.map((f) => <AddField key={f.name} field={f} />)}
        <button type="submit" className="btn btn-secondary px-3 py-1.5 text-xs">Add</button>
      </form>
    </section>
  );
}

export default async function SchedulesPage({ params }: { params: Promise<{ orgId: string; periodId: string }> }) {
  const { orgId, periodId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: period } = await supabase.from('periods').select('org_id, label, period_month').eq('id', periodId).single();
  if (!period || period.org_id !== orgId) notFound();
  const { data: org } = await supabase.from('orgs').select('legal_name').eq('id', orgId).single();

  const rowsByTable: Record<string, Record<string, unknown>[]> = {};
  for (const def of SCHEDULES) {
    const { data } = await supabase.from(def.table).select('*').eq('period_id', periodId);
    rowsByTable[def.table] = (data ?? []) as unknown as Record<string, unknown>[];
  }

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <header className="border-b border-line bg-white px-6 py-3.5">
        <div className="mx-auto flex max-w-4xl items-center gap-2 text-sm">
          <Link href="/" className="text-muted hover:text-body hover:underline">CapEasy vCFO</Link>
          <span className="text-faint">/</span>
          <Link href={`/clients/${orgId}`} className="text-muted hover:text-body hover:underline">{org?.legal_name ?? 'Client'}</Link>
          <span className="text-faint">/</span>
          <Link href={`/clients/${orgId}/periods/${periodId}`} className="text-muted hover:text-body hover:underline">{period.label ?? monthLabel(period.period_month)}</Link>
          <span className="text-faint">/</span>
          <span className="font-semibold text-ink">Schedules</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 p-6">
        <div className="rounded-lg border border-line bg-primary-50/40 p-4">
          <h1 className="text-base font-semibold text-ink">Supporting schedules <span className="text-[12.5px] font-normal text-muted">— all optional</span></h1>
          <p className="mt-1 text-[13px] leading-relaxed text-body">
            Your trial balance already produces the full MIS. These schedules add extra dimensions — each says what it <strong className="text-ink">unlocks</strong>. Skip any you don&apos;t have: the dependent view will prompt to add it rather than estimate or fabricate it.
          </p>
        </div>

        {SCHEDULES.map((def) => (
          <ScheduleCard key={def.table} orgId={orgId} periodId={periodId} def={def} rows={rowsByTable[def.table]} />
        ))}
      </main>
    </div>
  );
}
