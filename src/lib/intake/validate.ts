// src/lib/intake/validate.ts — the §3.3 validation gate. Pure function: given parsed rows, the
// per-account mapping, the canonical category metadata, and (optionally) period context, it returns
// an analyst-facing report. `ok` is true ONLY if every non-skipped rule passes — compute is blocked
// otherwise (Bible §3.3, §10.5: any violation is surfaced, never a silent pass).
import { paiseToInr } from './money';
import type { ParsedTbRow, ValidationReport, ValidationRule, CategoryMeta } from './types';

export type ContinuityInput = {
  isFirstPeriod: boolean;
  priorExists: boolean;
  priorMonth?: string | null; // 'YYYY-MM-DD' (first of month)
  thisMonth: string; // 'YYYY-MM-DD'
};

function addOneMonth(firstOfMonth: string): string {
  const [y, m] = firstOfMonth.split('-').map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}

export function validateTb(input: {
  rows: ParsedTbRow[];
  mappingByCode: Map<string, string | null | undefined>;
  categoryMeta: Map<string, CategoryMeta>;
  continuity?: ContinuityInput;
}): ValidationReport {
  const { rows, mappingByCode, categoryMeta, continuity } = input;
  const rules: ValidationRule[] = [];

  // --- 1) TB must balance: Σ debits = Σ credits ---
  const debit = rows.reduce((s, r) => s + r.debitPaise, 0);
  const credit = rows.reduce((s, r) => s + r.creditPaise, 0);
  const diff = debit - credit;
  rules.push({
    id: 'tb_balances',
    label: 'Trial balance is balanced',
    status: diff === 0 ? 'pass' : 'fail',
    summary:
      diff === 0
        ? `Σ debits = Σ credits = ${paiseToInr(debit)}.`
        : `Σ debits ${paiseToInr(debit)} ≠ Σ credits ${paiseToInr(credit)} — out of balance by ${paiseToInr(Math.abs(diff))}.`,
  });

  // --- 2) No unmapped accounts ---
  const distinct = new Map<string, string>();
  for (const r of rows) if (!distinct.has(r.accountCode)) distinct.set(r.accountCode, r.accountName);
  const unmapped = [...distinct].filter(([code]) => !mappingByCode.get(code));
  rules.push({
    id: 'no_unmapped',
    label: 'Every account is mapped',
    status: unmapped.length === 0 ? 'pass' : 'fail',
    summary:
      unmapped.length === 0
        ? `All ${distinct.size} source accounts map to a canonical category.`
        : `${unmapped.length} of ${distinct.size} source account(s) are not mapped — map them to finalise.`,
    offenders: unmapped.map(([code, name]) => ({ label: `${code} — ${name}`, detail: 'No canonical category assigned.' })),
  });

  // --- 3) Sign sanity: each mapped category's net balance is on its normal side ---
  const netByCat = new Map<string, number>();
  for (const r of rows) {
    const cat = mappingByCode.get(r.accountCode);
    if (!cat) continue;
    netByCat.set(cat, (netByCat.get(cat) ?? 0) + (r.debitPaise - r.creditPaise));
  }
  const inversions: { label: string; detail: string }[] = [];
  for (const [cat, net] of netByCat) {
    const meta = categoryMeta.get(cat);
    if (!meta || net === 0) continue;
    const side = net > 0 ? 'debit' : 'credit';
    if (side !== meta.normal_balance) {
      inversions.push({
        label: meta.name,
        detail: `${meta.name} is ${meta.normal_balance}-normal but shows a ${side} balance of ${paiseToInr(Math.abs(net))}.`,
      });
    }
  }
  rules.push({
    id: 'sign_sanity',
    label: 'Account signs look sane',
    status: inversions.length === 0 ? 'pass' : 'fail',
    summary: inversions.length === 0 ? 'No sign inversions detected.' : `${inversions.length} category(ies) carry an inverted balance — review the mapping.`,
    offenders: inversions,
  });

  // --- 4) Period continuity ---
  if (continuity) {
    let status: ValidationRule['status'] = 'pass';
    let summary: string;
    if (continuity.isFirstPeriod) {
      summary = 'First period for this client — no prior period required.';
    } else if (!continuity.priorExists || !continuity.priorMonth) {
      status = 'fail';
      summary = 'Not the first period, but no valid prior period is linked (the chain is broken).';
    } else {
      const expected = addOneMonth(continuity.priorMonth);
      if (continuity.thisMonth === expected) {
        summary = `Follows ${continuity.priorMonth} with no gap.`;
      } else {
        status = 'fail';
        summary = `Expected the month after ${continuity.priorMonth} (${expected}), but this period is ${continuity.thisMonth}.`;
      }
    }
    rules.push({ id: 'period_continuity', label: 'Period chain is continuous', status, summary });
  } else {
    rules.push({ id: 'period_continuity', label: 'Period chain is continuous', status: 'skipped', summary: 'Not checked (no period context supplied).' });
  }

  const ok = rules.every((r) => r.status !== 'fail');
  return { ok, rules, totals: { debitPaise: debit, creditPaise: credit, differencePaise: diff } };
}
