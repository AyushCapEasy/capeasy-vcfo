// src/app/clients/[orgId]/periods/[periodId]/page.tsx — period intake: upload TB, map accounts
// (fuzzy-assisted, persisted), see the §3.3 validation gate, and finalise only when it passes.
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getPeriodIntake, getStagingPreview } from '@/lib/intake/server-data';
import { paiseToInr } from '@/lib/intake/money';
import { monthLabel, taxYearLabel } from '@/lib/intake/period';
import type { ValidationRule } from '@/lib/intake/types';
import { UploadForm } from './upload-form';
import { ConfirmPanel } from './confirm-panel';
import { saveMapping, finalizePeriod } from './actions';

const GROUP_LABEL: Record<string, string> = {
  income: 'Income',
  direct_costs: 'Direct costs',
  operating_expenses: 'Operating expenses',
  below_the_line: 'Below the line',
  current_assets: 'Current assets',
  non_current_assets: 'Non-current assets',
  current_liabilities: 'Current liabilities',
  non_current_liabilities: 'Non-current liabilities',
  equity: 'Equity',
};

function RuleBadge({ status }: { status: ValidationRule['status'] }) {
  const map = { pass: 'badge-positive', fail: 'badge-negative', skipped: 'badge-neutral' } as const;
  const txt = { pass: 'PASS', fail: 'FAIL', skipped: 'N/A' };
  return <span className={`badge ${map[status]}`}>{txt[status]}</span>;
}

// Guided numbered step heading (intake is operated by non-experts — clarity first).
function StepHead({ n, title, note }: { n: number; title: string; note?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">{n}</span>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {note ? <span className="text-xs font-normal text-muted">{note}</span> : null}
    </div>
  );
}

export default async function PeriodIntakePage({ params }: { params: Promise<{ orgId: string; periodId: string }> }) {
  const { orgId, periodId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const intake = await getPeriodIntake(periodId);
  if (!intake || intake.period.orgId !== orgId) notFound();

  const staging = await getStagingPreview(periodId);

  const { data: org } = await supabase.from('orgs').select('legal_name').eq('id', orgId).single();
  const { period, categoryOptions, accounts, hasTb, report } = intake;

  const codeToId = new Map(categoryOptions.map((c) => [c.code, c.id]));
  const codeToName = new Map(categoryOptions.map((c) => [c.code, c.name]));
  const groups = [...new Set(categoryOptions.map((c) => c.group))];
  const mappedCount = accounts.filter((a) => a.mappedCategoryCode).length;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <header className="border-b border-line bg-white px-6 py-3.5">
        <div className="mx-auto flex max-w-5xl items-center gap-2 text-sm">
          <Link href="/" className="text-muted hover:text-body hover:underline">CapEasy vCFO</Link>
          <span className="text-faint">/</span>
          <Link href={`/clients/${orgId}`} className="text-muted hover:text-body hover:underline">{org?.legal_name ?? 'Client'}</Link>
          <span className="text-faint">/</span>
          <span className="font-semibold text-ink">{period.label ?? monthLabel(period.month)}</span>
          <span className="badge badge-neutral ml-1.5">{period.status}</span>
          <span className="ml-auto text-xs text-muted">{taxYearLabel(period.month)}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-sm">
          <span className="text-muted">Supporting schedules (AR/AP aging, headcount, recurring revenue, cash, capex, debt) — optional, each unlocks an extra dimension.</span>
          <Link href={`/clients/${orgId}/periods/${periodId}/schedules`} className="shrink-0 font-medium text-primary hover:underline">Schedules →</Link>
        </div>

        {staging ? (
          <ConfirmPanel orgId={orgId} periodId={periodId} filename={staging.filename} preview={staging.preview} />
        ) : (
        <>
        {/* 1) Upload */}
        <section>
          <StepHead n={1} title="Upload trial balance" />
          <div className="card p-5">
            <p className="mb-3 text-xs text-muted">
              Expected columns: <code className="rounded bg-hair px-1 py-0.5 text-[11px] text-body">account_code, account_name, debit, credit</code> (CSV or XLSX). Header synonyms tolerated; amounts in ₹.
            </p>
            <UploadForm orgId={orgId} periodId={periodId} />
          </div>
        </section>

        {hasTb ? (
          <>
            {/* 2) Validation gate */}
            <section>
              <StepHead n={2} title="Validation gate" note="§3.3" />
              <div className={`card overflow-hidden border-l-4 ${report?.ok ? 'border-l-emerald-500' : 'border-l-red-500'}`}>
                <p className={`px-5 py-3 text-sm font-semibold ${report?.ok ? 'bg-emerald-50/60 text-emerald-800' : 'bg-red-50/60 text-red-800'}`}>
                  {report?.ok ? '✓ Gate passed — ready to finalise.' : '✗ Gate blocked — resolve the failures below before compute.'}
                </p>
                <ul className="divide-y divide-line">
                  {report?.rules.map((r) => (
                    <li key={r.id} className="px-5 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <RuleBadge status={r.status} />
                        <span className="font-medium text-ink">{r.label}</span>
                      </div>
                      <p className="mt-1 text-muted">{r.summary}</p>
                      {r.offenders?.length ? (
                        <ul className="mt-1.5 ml-1 list-disc pl-4 text-xs text-red-600 marker:text-red-300">
                          {r.offenders.map((o, i) => (
                            <li key={i}><span className="font-medium">{o.label}</span> — {o.detail}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            {/* 3) Mapping */}
            <section>
              <StepHead n={3} title="Map accounts" note={`${mappedCount}/${accounts.length} mapped — saved mappings auto-apply next period`} />
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="border-b border-line bg-canvas text-left">
                    <tr className="text-[11px] font-semibold tracking-wide text-muted uppercase">
                      <th className="px-4 py-2.5">Source account</th>
                      <th className="px-4 py-2.5 text-right">Debit</th>
                      <th className="px-4 py-2.5 text-right">Credit</th>
                      <th className="px-4 py-2.5">Canonical category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {accounts.map((a) => {
                      const defaultId = a.mappedCategoryCode ? codeToId.get(a.mappedCategoryCode) : a.suggestions[0] ? codeToId.get(a.suggestions[0].code) : '';
                      const state = a.mappedCategoryCode ? 'mapped' : a.suggestions[0] ? 'suggested' : 'unmapped';
                      return (
                        <tr key={a.code} className={state === 'mapped' ? '' : 'bg-amber-50/50'}>
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-ink">{a.name}</div>
                            <div className="mt-0.5 text-xs">
                              <span className="text-muted">{a.code}</span>
                              {state === 'mapped' ? (
                                <span className="ml-1.5 font-medium text-emerald-600">✓ mapped → {codeToName.get(a.mappedCategoryCode!)}</span>
                              ) : state === 'suggested' ? (
                                <span className="ml-1.5 text-amber-600">· suggested: {a.suggestions[0].name} — confirm to save</span>
                              ) : (
                                <span className="ml-1.5 font-medium text-amber-600">· needs mapping</span>
                              )}
                            </div>
                          </td>
                          <td className="num px-4 py-2.5 text-body">{a.debitPaise ? paiseToInr(a.debitPaise) : ''}</td>
                          <td className="num px-4 py-2.5 text-body">{a.creditPaise ? paiseToInr(a.creditPaise) : ''}</td>
                          <td className="px-4 py-2.5">
                            <form action={saveMapping.bind(null, orgId, periodId)} className="flex items-center gap-2">
                              <input type="hidden" name="code" value={a.code} />
                              <input type="hidden" name="name" value={a.name} />
                              <select name="categoryId" defaultValue={defaultId ?? ''} className="min-w-0 flex-1 rounded-[var(--radius-ctl)] border border-line-strong bg-white px-2 py-1.5 text-xs text-ink shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25">
                                <option value="">— unmapped —</option>
                                {groups.map((g) => (
                                  <optgroup key={g} label={GROUP_LABEL[g] ?? g}>
                                    {categoryOptions.filter((c) => c.group === g).map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                              <button type="submit" className="shrink-0 rounded-[var(--radius-ctl)] border border-line-strong px-2.5 py-1.5 text-xs font-medium text-body shadow-sm hover:bg-canvas">Save</button>
                            </form>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* 4) Finalise */}
            <section>
              <StepHead n={4} title="Finalise" />
              <div className="card p-5">
                {report?.ok ? (
                  <div className="flex items-center gap-3">
                    <form action={finalizePeriod.bind(null, orgId, periodId)}>
                      <input type="hidden" name="status" value="reviewed" />
                      <button className="btn border border-blue-300 bg-white text-blue-700 shadow-sm hover:bg-blue-50">Mark reviewed</button>
                    </form>
                    <form action={finalizePeriod.bind(null, orgId, periodId)}>
                      <input type="hidden" name="status" value="locked" />
                      <button className="btn border border-emerald-300 bg-white text-emerald-700 shadow-sm hover:bg-emerald-50">Lock period</button>
                    </form>
                  </div>
                ) : (
                  <p className="text-sm text-muted">The validation gate must pass before this period can be marked reviewed or locked.</p>
                )}
              </div>
            </section>
          </>
        ) : (
          <div className="card p-6 text-center text-sm text-muted">Upload a trial balance to begin mapping and validation.</div>
        )}
        </>
        )}
      </main>
    </div>
  );
}
