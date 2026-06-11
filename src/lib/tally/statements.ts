// src/lib/tally/statements.ts — reconstruct P&L + Balance Sheet from classified Tally ledgers. PURE.
// Aggregates ledger closing balances by canonical category. Credit-natural groups (income, liabilities,
// equity) are presented as credit balances; debit-natural (assets, expenses) as debit balances. Includes
// internal consistency checks (TB debits=credits; Assets−(Liab+Equity) should ≈ current-year net profit).
import { CATEGORY_BY_CODE, CANONICAL_CATEGORIES } from '../decision';
import type { LedgerDecision } from './classify';

const CREDIT_NATURAL = new Set(['income', 'current_liabilities', 'non_current_liabilities', 'equity']);
const isCreditNatural = (group: string) => CREDIT_NATURAL.has(group);

export type StmtLine = { category: string; label: string; group: string; statement: 'pl' | 'bs'; valuePaise: number };
export type Statements = {
  pl: { lines: StmtLine[]; revenuePaise: number; expensesPaise: number; pbtPaise: number; taxPaise: number; netProfitPaise: number };
  bs: { lines: StmtLine[]; assetsPaise: number; liabilitiesPaise: number; equityPaise: number };
  checks: { tbDebitPaise: number; tbCreditPaise: number; tbBalanced: boolean; assetsMinusLEPaise: number; netProfitPaise: number; plTiesToBs: boolean };
  conflicts: LedgerDecision[];
  unclassified: LedgerDecision[];
};

export function buildStatements(decisions: LedgerDecision[]): Statements {
  // sum signed debit-minus-credit per category
  const netDr = new Map<string, number>();
  let tbDr = 0, tbCr = 0;
  for (const d of decisions) {
    tbDr += d.closingDrPaise; tbCr += d.closingCrPaise;
    if (!d.category) continue;
    netDr.set(d.category, (netDr.get(d.category) ?? 0) + d.closingDrPaise - d.closingCrPaise);
  }
  const valueOf = (cat: string): number => {
    const meta = CATEGORY_BY_CODE[cat]; if (!meta) return 0;
    const nd = netDr.get(cat) ?? 0;
    return isCreditNatural(meta.group) ? -nd : nd; // present in the category's natural direction
  };
  const lineFor = (cat: string): StmtLine | null => {
    if (!netDr.has(cat)) return null;
    const meta = CATEGORY_BY_CODE[cat];
    return { category: cat, label: meta.name, group: meta.group, statement: meta.statement, valuePaise: valueOf(cat) };
  };
  const cats = (pred: (g: string, s: string) => boolean) => CANONICAL_CATEGORIES.filter((c) => pred(c.group, c.statement)).map((c) => c.code);
  const linesFor = (codes: string[]) => codes.map(lineFor).filter((x): x is StmtLine => x !== null);
  const sum = (codes: string[]) => codes.reduce((s, c) => s + valueOf(c), 0);

  // P&L
  const incomeCats = cats((g, s) => s === 'pl' && g === 'income');
  const expenseCats = cats((g, s) => s === 'pl' && g !== 'income');
  const revenuePaise = sum(incomeCats);
  const expensesPaise = sum(expenseCats);
  const taxPaise = valueOf('tax_expense');
  const pbtPaise = revenuePaise - (expensesPaise - taxPaise);
  const netProfitPaise = revenuePaise - expensesPaise;

  // BS
  const assetCats = cats((g) => g === 'current_assets' || g === 'non_current_assets');
  const liabCats = cats((g) => g === 'current_liabilities' || g === 'non_current_liabilities');
  const equityCats = cats((g) => g === 'equity');
  const assetsPaise = sum(assetCats);
  const liabilitiesPaise = sum(liabCats);
  const equityPaise = sum(equityCats);

  const assetsMinusLEPaise = assetsPaise - (liabilitiesPaise + equityPaise);
  return {
    pl: { lines: linesFor([...incomeCats, ...expenseCats]), revenuePaise, expensesPaise, pbtPaise, taxPaise, netProfitPaise },
    bs: { lines: linesFor([...assetCats, ...liabCats, ...equityCats]), assetsPaise, liabilitiesPaise, equityPaise },
    checks: {
      tbDebitPaise: tbDr, tbCreditPaise: tbCr, tbBalanced: Math.abs(tbDr - tbCr) < 100,
      assetsMinusLEPaise, netProfitPaise,
      // If equity does NOT already carry current-year P&L, Assets−(Liab+Equity) ties to net profit.
      plTiesToBs: Math.abs(assetsMinusLEPaise - netProfitPaise) < 100,
    },
    conflicts: decisions.filter((d) => d.conflict),
    unclassified: decisions.filter((d) => !d.category),
  };
}
