// src/lib/tally/index.ts — Route C (Tally TB → MIS) public surface. PURE. parse → classify → build
// statements; plus reconcile() against a client's audited statements that DISTINGUISHES engine gaps
// (we computed something wrong) from audit-adjustment gaps (year-end auditor entries not in the books).
import { parseTallyTB, parseTallyMasters, parseTallyDayBook, type TallyParse, type TallyLedger } from './parse';
import { classifyLedgers, type LedgerDecision } from './classify';
import { buildStatements, type Statements } from './statements';
import { CATEGORY_BY_CODE } from '../decision';

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

/**
 * GAP-3 — full Route-C reconstruction from the real-world two-file export: an "All Masters" XML (chart +
 * group + closing-balance field) and an optional "Day Book" XML (vouchers). Closing balance = master
 * field where present, else Σ day-book postings (no ledger has both). Pass strings already decoded via
 * `decodeTallyXml` (BOM-aware). Works for any Tally export — tested against Orafor, hardcodes nothing.
 */
export function reconstructFromTallyExports(mastersXml: string, dayBookXml = ''): TallyReconstruction {
  const m = parseTallyMasters(mastersXml);
  const db = dayBookXml
    ? parseTallyDayBook(dayBookXml)
    : { postingsDrPaise: new Map<string, number>(), voucherCount: 0, postingCount: 0, postingSumPaise: 0 };

  const merged = new Map<string, { parentGroup: string; closing: number }>();
  for (const l of m.ledgers) merged.set(l.name, { parentGroup: l.parentGroup, closing: l.closingDrPaise });
  let postedOnly = 0;
  for (const [name, posted] of db.postingsDrPaise) {
    const ex = merged.get(name);
    if (!ex) { merged.set(name, { parentGroup: '', closing: posted }); postedOnly++; }
    else if (ex.closing === 0) ex.closing = posted; // master field (if non-zero) is the closing; else day-book flow
  }
  const ledgers: TallyLedger[] = [...merged].map(([name, x]) => ({
    name,
    parentGroup: x.parentGroup,
    closingDrPaise: x.closing > 0 ? x.closing : 0,
    closingCrPaise: x.closing < 0 ? -x.closing : 0,
  }));

  const warnings: string[] = [];
  if (!dayBookXml) warnings.push('No Day Book provided — P&L ledgers without a master balance will be empty.');
  if (postedOnly) warnings.push(`${postedOnly} ledger(s) posted in the Day Book are absent from Masters — classified by name only.`);
  if (Math.abs(db.postingsDrPaise.size ? db.postingSumPaise : 0) > 100) warnings.push(`Day-book postings do not net to zero (Σ ${db.postingSumPaise} paise) — vouchers may be unbalanced.`);

  const parse: TallyParse = { format: 'masters_daybook', ledgers, withGroup: m.withGroup, warnings };
  const decisions = classifyLedgers(ledgers);
  return { parse, decisions, statements: buildStatements(decisions) };
}

// ----- Reconciliation against the audited statements (the real proof) -----
/** Audited figures keyed by canonical category code, value in paise (presentation direction:
 *  revenue/liability/equity positive as credit, asset/expense positive as debit). Supplied by the
 *  caller (parsed from the client's audited xlsx). */
export type AuditedStatements = { pl: Record<string, number>; bs: Record<string, number> };

export type ReconLineStatus = 'match' | 'immaterial' | 'engine_gap' | 'audit_adjustment';
export type ReconLine = { category: string; statement: 'pl' | 'bs'; reconstructedPaise: number; auditedPaise: number; diffPaise: number; status: ReconLineStatus; note: string };
export type ReconResult = { lines: ReconLine[]; matched: number; immaterial: number; engineGaps: number; auditAdjustments: number; totalAbsDiffPaise: number };

// GAP-5: options that let the caller's domain knowledge keep the (c) engine-gap bucket trustworthy.
// Without them, reconcile behaves exactly as the original (a plain tolerance diff).
export type ReconcileOptions = {
  tolerancePaise?: number;            // |diff| ≤ this → exact match (default 100 = ₹1)
  materialityPaise?: number;          // (iii) |diff| < this (but > tol) → 'immaterial', not a flag
  reclassTolerancePaise?: number;     // net-neutral / opening-diff residual tolerance (defaults to materiality)
  openingDifferencePaise?: number;    // (i) the known opening-balance difference (debit-positive)
  openingDifferenceCategories?: string[]; // BS categories that may absorb the opening difference
  reclassGroups?: string[][];         // (ii) sets of sibling categories an auditor may reclassify among
};

// Categories whose differences are TYPICALLY year-end auditor entries, not books — never auto-called an engine bug.
const AUDIT_ADJUSTMENT_CATEGORIES = new Set([
  'depreciation_amortisation', // dep finalised at audit
  'tax_expense',               // current + deferred tax provision
  'provisions',                // provisioning entries
  'other_non_current_liabilities', // deferred tax liability etc.
  'reserves_surplus',          // P&L appropriation / prior-period adjustments land here
]);

/** Diff expressed debit-positive (asset/expense as-is; income/liability/equity flipped), so a
 *  cross-category reclassification or a balance-sheet opening difference nets the way the BS does. */
const dpDiff = (cat: string, diff: number) => (CATEGORY_BY_CODE[cat]?.normal_balance === 'credit' ? -diff : diff);

export function reconcile(statements: Statements, audited: AuditedStatements, opts: ReconcileOptions | number = {}): ReconResult {
  const o: ReconcileOptions = typeof opts === 'number' ? { tolerancePaise: opts } : opts;
  const tol = o.tolerancePaise ?? 100;
  const materiality = o.materialityPaise ?? 0;
  const reclassTol = o.reclassTolerancePaise ?? materiality;
  const openingDiff = o.openingDifferencePaise ?? 0;
  const openingCats = new Set(o.openingDifferenceCategories ?? []);
  const reclassGroups = o.reclassGroups ?? [];

  const reconMap = new Map<string, { v: number; s: 'pl' | 'bs' }>();
  for (const l of [...statements.pl.lines, ...statements.bs.lines]) reconMap.set(l.category, { v: l.valuePaise, s: l.statement });
  const auditedMap = new Map<string, { v: number; s: 'pl' | 'bs' }>();
  for (const [c, v] of Object.entries(audited.pl)) auditedMap.set(c, { v, s: 'pl' });
  for (const [c, v] of Object.entries(audited.bs)) auditedMap.set(c, { v, s: 'bs' });

  type WL = { category: string; statement: 'pl' | 'bs'; recon: number; audited: number; diff: number; status?: ReconLineStatus; note?: string };
  const work = new Map<string, WL>();
  for (const cat of new Set([...reconMap.keys(), ...auditedMap.keys()])) {
    const r = reconMap.get(cat); const a = auditedMap.get(cat);
    const recon = r?.v ?? 0; const aud = a?.v ?? 0;
    work.set(cat, { category: cat, statement: r?.s ?? a?.s ?? 'pl', recon, audited: aud, diff: recon - aud });
  }
  const get = (c: string) => work.get(c);

  // 0 — exact match.
  for (const l of work.values()) if (Math.abs(l.diff) <= tol) { l.status = 'match'; l.note = 'ties'; }

  // (ii) — net-neutral sibling reclassification: a set of siblings whose debit-positive gaps cancel
  // (director salary across employee↔other-expenses; GST input credit as contra-liability vs current
  // asset; current↔non-current borrowings) is presentation, not an engine error.
  for (const g of reclassGroups) {
    const net = g.reduce((s, c) => s + dpDiff(c, get(c)?.diff ?? 0), 0);
    if (Math.abs(net) <= reclassTol) {
      for (const c of g) { const l = get(c); if (l && !l.status && Math.abs(l.diff) > tol) { l.status = 'audit_adjustment'; l.note = `presentation reclassification — net-neutral across {${g.join(', ')}}`; } }
    }
  }

  // (i) — opening-balance difference: if the still-unexplained BS lines' debit-positive gaps sum to the
  // known opening difference (stale brought-forward party/asset balances the auditor wrote down), they
  // are an audit adjustment, not an engine bug.
  if (openingCats.size && Math.abs(openingDiff) > tol) {
    // Only lines material on BOTH sides can be opening-diff components — a line present in one set
    // only (e.g. a partial/unsupplied audited figure) is handled by the books-vs-audited rules below,
    // and must not pollute the opening-difference sum.
    const undec = [...work.values()].filter((l) => !l.status && openingCats.has(l.category)
      && Math.abs(l.diff) > tol && Math.abs(l.recon) > tol && Math.abs(l.audited) > tol);
    const net = undec.reduce((s, l) => s + dpDiff(l.category, l.diff), 0);
    if (Math.abs(net - openingDiff) <= reclassTol) {
      for (const l of undec) { l.status = 'audit_adjustment'; l.note = `opening-balance difference (stale brought-forward balance reconciled at audit, not an engine error)`; }
    }
  }

  // remaining — (iii) materiality floor, then the original audit-adjustment / engine-gap rules.
  for (const l of work.values()) {
    if (l.status) continue;
    if (Math.abs(l.diff) < materiality) { l.status = 'immaterial'; l.note = `below materiality floor (₹${Math.round(materiality / 100)})`; }
    else if (AUDIT_ADJUSTMENT_CATEGORIES.has(l.category)) { l.status = 'audit_adjustment'; l.note = 'known year-end auditor-entry category — books vs audited difference, not an engine bug'; }
    else if (Math.abs(l.recon) <= tol && Math.abs(l.audited) > tol) { l.status = 'audit_adjustment'; l.note = 'present in audited, absent in Tally books — booked only at audit'; }
    else { l.status = 'engine_gap'; l.note = 'both sides have a material figure that differs — investigate mapping/sum'; }
  }

  const lines: ReconLine[] = [...work.values()]
    .map((l) => ({ category: l.category, statement: l.statement, reconstructedPaise: l.recon, auditedPaise: l.audited, diffPaise: l.diff, status: l.status!, note: l.note! }))
    .sort((x, y) => Math.abs(y.diffPaise) - Math.abs(x.diffPaise));
  return {
    lines,
    matched: lines.filter((l) => l.status === 'match').length,
    immaterial: lines.filter((l) => l.status === 'immaterial').length,
    engineGaps: lines.filter((l) => l.status === 'engine_gap').length,
    auditAdjustments: lines.filter((l) => l.status === 'audit_adjustment').length,
    totalAbsDiffPaise: lines.reduce((s, l) => s + Math.abs(l.diffPaise), 0),
  };
}
