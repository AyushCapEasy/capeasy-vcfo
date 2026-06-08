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
  const map = {
    pass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    fail: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    skipped: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
  };
  const txt = { pass: 'PASS', fail: 'FAIL', skipped: 'N/A' };
  return <span className={`rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide ${map[status]}`}>{txt[status]}</span>;
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
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-neutral-200 px-6 py-3 text-sm dark:border-neutral-800">
        <Link href="/" className="text-neutral-500 hover:underline">CapEasy vCFO</Link>
        <span className="text-neutral-400">/</span>
        <Link href={`/clients/${orgId}`} className="text-neutral-500 hover:underline">{org?.legal_name ?? 'Client'}</Link>
        <span className="text-neutral-400">/</span>
        <span className="font-medium">{period.label ?? monthLabel(period.month)}</span>
        <span className="ml-2 rounded bg-neutral-100 px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase dark:bg-neutral-800">{period.status}</span>
        <span className="ml-auto text-xs text-neutral-500">{taxYearLabel(period.month)}</span>
      </header>

      <main className="flex-1 space-y-8 p-6">
        {staging ? (
          <ConfirmPanel orgId={orgId} periodId={periodId} filename={staging.filename} preview={staging.preview} />
        ) : (
        <>
        {/* 1) Upload */}
        <section>
          <h2 className="mb-2 text-sm font-semibold">1 · Upload trial balance</h2>
          <p className="mb-3 text-xs text-neutral-500">
            Expected columns: <code>account_code, account_name, debit, credit</code> (CSV or XLSX). Header synonyms tolerated; amounts in ₹.
          </p>
          <UploadForm orgId={orgId} periodId={periodId} />
        </section>

        {hasTb ? (
          <>
            {/* 2) Validation gate */}
            <section>
              <h2 className="mb-2 text-sm font-semibold">2 · Validation gate (§3.3)</h2>
              <div className={`rounded-lg border p-4 ${report?.ok ? 'border-emerald-300 dark:border-emerald-900' : 'border-red-300 dark:border-red-900'}`}>
                <p className="mb-3 text-sm font-medium">
                  {report?.ok ? '✓ Gate passed — ready to finalise.' : '✗ Gate blocked — resolve the failures below before compute.'}
                </p>
                <ul className="space-y-2">
                  {report?.rules.map((r) => (
                    <li key={r.id} className="text-sm">
                      <div className="flex items-center gap-2">
                        <RuleBadge status={r.status} />
                        <span className="font-medium">{r.label}</span>
                      </div>
                      <p className="ml-1 text-neutral-600 dark:text-neutral-400">{r.summary}</p>
                      {r.offenders?.length ? (
                        <ul className="mt-1 ml-4 list-disc text-xs text-red-600 dark:text-red-400">
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
              <h2 className="mb-2 text-sm font-semibold">3 · Map accounts <span className="font-normal text-neutral-500">({mappedCount}/{accounts.length} mapped — saved mappings auto-apply next period)</span></h2>
              <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-xs text-neutral-500 dark:bg-neutral-900">
                    <tr>
                      <th className="px-3 py-2 font-medium">Source account</th>
                      <th className="px-3 py-2 text-right font-medium">Debit</th>
                      <th className="px-3 py-2 text-right font-medium">Credit</th>
                      <th className="px-3 py-2 font-medium">Canonical category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {accounts.map((a) => {
                      const defaultId = a.mappedCategoryCode ? codeToId.get(a.mappedCategoryCode) : a.suggestions[0] ? codeToId.get(a.suggestions[0].code) : '';
                      return (
                        <tr key={a.code} className={a.mappedCategoryCode ? '' : 'bg-amber-50/50 dark:bg-amber-950/20'}>
                          <td className="px-3 py-2">
                            <div className="font-medium">{a.name}</div>
                            <div className="text-xs text-neutral-500">{a.code}{a.mappedCategoryCode ? ` · mapped → ${codeToName.get(a.mappedCategoryCode)}` : a.suggestions[0] ? ` · suggested: ${a.suggestions[0].name}` : ''}</div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.debitPaise ? paiseToInr(a.debitPaise) : ''}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{a.creditPaise ? paiseToInr(a.creditPaise) : ''}</td>
                          <td className="px-3 py-2">
                            <form action={saveMapping.bind(null, orgId, periodId)} className="flex items-center gap-2">
                              <input type="hidden" name="code" value={a.code} />
                              <input type="hidden" name="name" value={a.name} />
                              <select name="categoryId" defaultValue={defaultId ?? ''} className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900">
                                <option value="">— unmapped —</option>
                                {groups.map((g) => (
                                  <optgroup key={g} label={GROUP_LABEL[g] ?? g}>
                                    {categoryOptions.filter((c) => c.group === g).map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </optgroup>
                                ))}
                              </select>
                              <button type="submit" className="rounded-md border border-neutral-300 px-2 py-1 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-900">Save</button>
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
              <h2 className="mb-2 text-sm font-semibold">4 · Finalise</h2>
              {report?.ok ? (
                <div className="flex items-center gap-3">
                  <form action={finalizePeriod.bind(null, orgId, periodId)}>
                    <input type="hidden" name="status" value="reviewed" />
                    <button className="rounded-md border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/40">Mark reviewed</button>
                  </form>
                  <form action={finalizePeriod.bind(null, orgId, periodId)}>
                    <input type="hidden" name="status" value="locked" />
                    <button className="rounded-md border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40">Lock period</button>
                  </form>
                </div>
              ) : (
                <p className="text-sm text-neutral-500">The validation gate must pass before this period can be marked reviewed or locked.</p>
              )}
            </section>
          </>
        ) : (
          <p className="text-sm text-neutral-500">Upload a trial balance to begin mapping and validation.</p>
        )}
        </>
        )}
      </main>
    </div>
  );
}
