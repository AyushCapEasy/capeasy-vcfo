// src/lib/tally/index.ts — Route C (Tally TB → MIS) public surface. PURE. parse → classify → build
// statements; plus reconcile() against a client's audited statements that DISTINGUISHES engine gaps
// (we computed something wrong) from audit-adjustment gaps (year-end auditor entries not in the books).
import { parseTallyTB, type TallyParse } from './parse';
import { classifyLedgers, type LedgerDecision } from './classify';
import { buildStatements, type Statements } from './statements';

export * from './parse';
export * from './classify';
export * from './statements';
export { tallyGroupPlacement, macroOf } from './groups';

export type TallyReconstruction = { parse: TallyParse; decisions: LedgerDecision[]; statements: Statements };

/** Full Route-C reconstruction from a Tally Trial Balance XML export. */
export function reconstructFromTallyXml(xml: string): TallyReconstruction {
  const parse = parseTallyTB(xml);
  const decisions = classifyLedgers(parse.ledgers);
  return { parse, decisions, statements: buildStatements(decisions) };
}

// ----- Reconciliation against the audited statements (the real proof) -----
/** Audited figures keyed by canonical category code, value in paise (presentation direction:
 *  revenue/liability/equity positive as credit, asset/expense positive as debit). Supplied by the
 *  caller (parsed from the client's audited xlsx). */
export type AuditedStatements = { pl: Record<string, number>; bs: Record<string, number> };

export type ReconLineStatus = 'match' | 'engine_gap' | 'audit_adjustment';
export type ReconLine = { category: string; statement: 'pl' | 'bs'; reconstructedPaise: number; auditedPaise: number; diffPaise: number; status: ReconLineStatus; note: string };
export type ReconResult = { lines: ReconLine[]; matched: number; engineGaps: number; auditAdjustments: number; totalAbsDiffPaise: number };

// Categories whose differences are TYPICALLY year-end auditor entries, not books — never auto-called an engine bug.
const AUDIT_ADJUSTMENT_CATEGORIES = new Set([
  'depreciation_amortisation', // dep finalised at audit
  'tax_expense',               // current + deferred tax provision
  'provisions',                // provisioning entries
  'other_non_current_liabilities', // deferred tax liability etc.
  'reserves_surplus',          // P&L appropriation / prior-period adjustments land here
]);

export function reconcile(statements: Statements, audited: AuditedStatements, tolPaise = 100): ReconResult {
  const reconMap = new Map<string, { v: number; s: 'pl' | 'bs' }>();
  for (const l of [...statements.pl.lines, ...statements.bs.lines]) reconMap.set(l.category, { v: l.valuePaise, s: l.statement });
  const auditedMap = new Map<string, { v: number; s: 'pl' | 'bs' }>();
  for (const [c, v] of Object.entries(audited.pl)) auditedMap.set(c, { v, s: 'pl' });
  for (const [c, v] of Object.entries(audited.bs)) auditedMap.set(c, { v, s: 'bs' });

  const cats = new Set([...reconMap.keys(), ...auditedMap.keys()]);
  const lines: ReconLine[] = [];
  for (const cat of cats) {
    const r = reconMap.get(cat); const a = auditedMap.get(cat);
    const reconstructedPaise = r?.v ?? 0;
    const auditedPaise = a?.v ?? 0;
    const statement = (r?.s ?? a?.s ?? 'pl');
    const diffPaise = reconstructedPaise - auditedPaise;
    let status: ReconLineStatus; let note: string;
    if (Math.abs(diffPaise) <= tolPaise) { status = 'match'; note = 'ties'; }
    else if (AUDIT_ADJUSTMENT_CATEGORIES.has(cat)) { status = 'audit_adjustment'; note = 'known year-end auditor-entry category — books vs audited difference, not an engine bug'; }
    else if (Math.abs(reconstructedPaise) <= tolPaise && Math.abs(auditedPaise) > tolPaise) { status = 'audit_adjustment'; note = 'present in audited, absent in Tally books — booked only at audit'; }
    else { status = 'engine_gap'; note = 'both sides have a material figure that differs — investigate mapping/sum'; }
    lines.push({ category: cat, statement, reconstructedPaise, auditedPaise, diffPaise, status, note });
  }
  lines.sort((x, y) => Math.abs(y.diffPaise) - Math.abs(x.diffPaise));
  return {
    lines,
    matched: lines.filter((l) => l.status === 'match').length,
    engineGaps: lines.filter((l) => l.status === 'engine_gap').length,
    auditAdjustments: lines.filter((l) => l.status === 'audit_adjustment').length,
    totalAbsDiffPaise: lines.reduce((s, l) => s + Math.abs(l.diffPaise), 0),
  };
}
