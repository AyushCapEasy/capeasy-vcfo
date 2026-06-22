// src/lib/intake/tally-grid.ts — bridge: a Tally TB XML export → the canonical TB grid the intake stages.
// The reconstruction is IN-MEMORY (D-014); only the resulting grid (and, on confirm, the trial_balance_lines)
// persist — exactly as if the client had uploaded a CSV trial balance. By emitting the SAME grid a CSV/XLSX
// upload produces, the whole existing stage → confirm → commit flow is reused unchanged, so the analyst
// still reviews and approves the reconstructed rows before anything is committed (no silent transform).
import { decodeTallyXml, parseTallyTB } from '@/lib/tally';

/** Format integer paise as an exact rupee string (no float drift), e.g. 1234567 → "12345.67". */
function paiseToRupeeCell(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export type TallyGridResult =
  | { ok: true; grid: string[][]; ledgerCount: number; warnings: string[] }
  | { ok: false; error: string; detail?: string };

/** Decode (BOM-aware) + reconstruct ledgers from a Tally TB XML export, then lay them out as the canonical
 *  intake grid: header + one row per ledger (the ledger name doubles as the source account code). */
export function tallyXmlToGrid(bytes: Uint8Array): TallyGridResult {
  let parse;
  try {
    parse = parseTallyTB(decodeTallyXml(bytes));
  } catch (e) {
    return { ok: false, error: 'Could not read the Tally XML export.', detail: e instanceof Error ? e.message : String(e) };
  }

  const ledgers = parse.ledgers.filter((l) => l.closingDrPaise > 0 || l.closingCrPaise > 0);
  if (!ledgers.length) {
    return { ok: false, error: 'No ledger balances found in the Tally XML. Export the Trial Balance (Ledgers with closing balances) from Tally and upload that.' };
  }

  const grid: string[][] = [['account_code', 'account_name', 'debit', 'credit']];
  for (const l of ledgers) {
    grid.push([
      l.name, // Tally ledgers have no separate code — the name is the stable source-account key
      l.name,
      l.closingDrPaise > 0 ? paiseToRupeeCell(l.closingDrPaise) : '',
      l.closingCrPaise > 0 ? paiseToRupeeCell(l.closingCrPaise) : '',
    ]);
  }
  return { ok: true, grid, ledgerCount: ledgers.length, warnings: parse.warnings };
}
