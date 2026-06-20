// src/lib/tally/classify.ts — map each Tally ledger to a canonical category with the
// SOURCE-TYPE-DOMINATES-NAME rule (the fix from the Zoho pull). PURE.
//   • The Tally parent GROUP is authoritative for the macro bucket (income/expense/asset/liability/equity).
//   • The ledger NAME (existing decision engine) only refines the fine category WITHIN that bucket.
//   • If the name's macro bucket disagrees with the group's → CONFLICT (the over-confidence-miss catch);
//     the group wins and the row is flagged for review.
//   • If the Tally group is unknown/missing → fall back to the name classifier (and flag).
import { classify as classifyNames, CATEGORY_BY_CODE } from '../decision';
import { tallyGroupPlacement, macroOf, type MacroBucket } from './groups';
import type { TallyLedger } from './parse';

export type LedgerDecision = {
  name: string;
  parentGroup: string;
  closingDrPaise: number;
  closingCrPaise: number;
  category: string | null;       // final canonical category
  categoryName: string | null;
  statement: 'pl' | 'bs' | null;
  macro: MacroBucket | null;
  decidedBy: 'group_authoritative' | 'name_refined' | 'group_default' | 'name_fallback' | 'unclassified';
  conflict: boolean;             // name macro ≠ group macro (over-confidence-miss catch)
  conflictDetail: string | null;
};

export function classifyLedgers(ledgers: TallyLedger[]): LedgerDecision[] {
  // batch the names through the decision engine once
  const nameRes = classifyNames(ledgers.map((l, i) => ({ rowNumber: i + 1, accountCode: '', accountName: l.name, debitPaise: 0, creditPaise: 0 })));
  return ledgers.map((l, i) => {
    const placement = tallyGroupPlacement(l.parentGroup);
    const nr = nameRes.rows[i];
    const nameCat = nr?.proposedCategory ?? null;
    const nameGroup = nameCat ? CATEGORY_BY_CODE[nameCat]?.group ?? null : null;
    const nameMacro = nameGroup ? macroOf(nameGroup) : null;

    const meta = (code: string | null) => (code ? CATEGORY_BY_CODE[code] ?? null : null);
    const base = {
      name: l.name, parentGroup: l.parentGroup,
      closingDrPaise: l.closingDrPaise, closingCrPaise: l.closingCrPaise,
    };

    if (!placement) {
      // Tally group unknown → rely on the name classifier (and flag the fallback)
      const m = meta(nameCat);
      return {
        ...base, category: nameCat, categoryName: m?.name ?? null, statement: m?.statement ?? null,
        macro: nameMacro, decidedBy: nameCat ? 'name_fallback' : 'unclassified', conflict: false,
        conflictDetail: l.parentGroup ? `Tally group "${l.parentGroup}" not in map — used name` : 'no Tally group — used name',
      };
    }

    if (nameCat && nameMacro === placement.macro) {
      // name agrees on the macro bucket → use its finer category (refinement)
      const m = meta(nameCat)!;
      return { ...base, category: nameCat, categoryName: m.name, statement: m.statement, macro: placement.macro, decidedBy: 'name_refined', conflict: false, conflictDetail: null };
    }
    if (nameCat && nameMacro && nameMacro !== placement.macro) {
      // CONFLICT: the name would have put this in a different macro bucket → group wins, flag it
      const m = meta(placement.category)!;
      return {
        ...base, category: placement.category, categoryName: m.name, statement: placement.statement, macro: placement.macro,
        decidedBy: 'group_authoritative', conflict: true,
        conflictDetail: `name "${l.name}" → ${nameCat} (${nameMacro}) but Tally group "${l.parentGroup}" → ${placement.macro}; group wins`,
      };
    }
    // name gave nothing usable → Tally group default category
    const m = meta(placement.category)!;
    return { ...base, category: placement.category, categoryName: m.name, statement: placement.statement, macro: placement.macro, decidedBy: 'group_default', conflict: false, conflictDetail: null };
  });
}
