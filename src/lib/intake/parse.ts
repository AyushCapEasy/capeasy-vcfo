// src/lib/intake/parse.ts — parse an uploaded TB (CSV via Papaparse, XLSX via SheetJS) into a
// fully-transparent preview. Tolerances (header synonyms, sign/(x) normalization, net-to-one-side,
// Total-row skipping) are APPLIED but never hidden: the column mapping, every per-row adjustment,
// and every skipped row are returned so the analyst can approve the read before it becomes intake
// data (Bible §8.5 — no silent black-box transforms). Server-side only.
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { rupeesCellToPaise } from './money';
import type { ParseResult, ParseError, ParsedTbRow, Adjustment, SkippedRow, ColumnMapping, ColumnOverride } from './types';
import { COLUMN_ROLES, type ColumnRole } from './types';

const HEADER_SYNONYMS: Record<ColumnRole, string[]> = {
  code: ['account code', 'accountcode', 'code', 'gl code', 'glcode', 'ledger code', 'account no', 'account number', 'a c code', 'acct code', 'ac code'],
  name: ['account name', 'accountname', 'name', 'particulars', 'ledger', 'ledger name', 'account', 'description', 'narration', 'head'],
  debit: ['debit', 'debit amount', 'dr', 'debit inr', 'debit amt', 'dr amount'],
  credit: ['credit', 'credit amount', 'cr', 'credit inr', 'credit amt', 'cr amount'],
};

const norm = (v: unknown): string => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cell = (v: unknown): string => String(v ?? '').trim();

// --- File → 2D grid of string cells ---------------------------------------
export function readFileToGrid(input: { buffer: Buffer; filename: string }):
  | { ok: true; grid: string[][] }
  | { ok: false; errors: ParseError[] } {
  const ext = (input.filename.split('.').pop() || '').toLowerCase();
  try {
    let raw: unknown[][];
    if (ext === 'csv' || ext === 'txt') {
      const res = Papa.parse<string[]>(input.buffer.toString('utf8'), { skipEmptyLines: 'greedy' });
      raw = res.data as unknown[][];
    } else {
      const wb = XLSX.read(input.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) return { ok: false, errors: [{ kind: 'empty_file', message: 'The workbook has no sheets.' }] };
      raw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: true, defval: '' }) as unknown[][];
    }
    const grid = raw.map((row) => (row ?? []).map((c) => (c === null || c === undefined ? '' : String(c))));
    return { ok: true, grid };
  } catch (e) {
    return { ok: false, errors: [{ kind: 'unreadable', message: 'The file could not be read as CSV or XLSX.', detail: e instanceof Error ? e.message : String(e) }] };
  }
}

function detectHeader(grid: string[][]) {
  const limit = Math.min(grid.length, 15);
  for (let r = 0; r < limit; r++) {
    const cells = (grid[r] ?? []).map(norm);
    const cols: Partial<Record<ColumnRole, number>> = {};
    for (const role of COLUMN_ROLES) {
      for (let c = 0; c < cells.length; c++) {
        if (Object.values(cols).includes(c)) continue;
        if (HEADER_SYNONYMS[role].includes(cells[c])) {
          cols[role] = c;
          break;
        }
      }
    }
    if (COLUMN_ROLES.every((role) => cols[role] !== undefined)) {
      return { rowIdx: r, cols: cols as Record<ColumnRole, number> };
    }
  }
  return null;
}

// --- Grid (+ optional column override) → transparent preview ---------------
export function parseGrid(grid: string[][], override?: ColumnOverride): ParseResult {
  if (!grid.length) return { ok: false, errors: [{ kind: 'empty_file', message: 'The file appears to be empty.' }] };

  const header = detectHeader(grid);
  if (!header) {
    const firstNonEmpty = grid.find((row) => row.some((c) => c.trim() !== '')) ?? [];
    const seen = firstNonEmpty.map((c) => c.trim()).filter(Boolean).slice(0, 12).join(' | ') || '(no readable header row)';
    return {
      ok: false,
      errors: [{ kind: 'missing_columns', message: 'Could not find the required columns. Expected a header row containing: account_code, account_name, debit, credit.', detail: `Columns seen: ${seen}` }],
    };
  }

  const headerCells = (grid[header.rowIdx] ?? []).map(cell);
  const cols = { ...header.cols };
  const warnings: string[] = [];
  if (override) {
    for (const role of COLUMN_ROLES) {
      const idx = override[role];
      if (typeof idx === 'number' && idx >= 0 && idx < headerCells.length) cols[role] = idx;
    }
    const used = COLUMN_ROLES.map((r) => cols[r]);
    if (new Set(used).size !== used.length) warnings.push('Two roles are assigned to the same source column — check the mapping.');
  }

  const columns: ColumnMapping = {
    code: { header: headerCells[cols.code] ?? '', index: cols.code },
    name: { header: headerCells[cols.name] ?? '', index: cols.name },
    debit: { header: headerCells[cols.debit] ?? '', index: cols.debit },
    credit: { header: headerCells[cols.credit] ?? '', index: cols.credit },
  };

  const rows: ParsedTbRow[] = [];
  const errors: ParseError[] = [];
  const adjustments: Adjustment[] = [];
  const skipped: SkippedRow[] = [];

  for (let r = header.rowIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const code = cell(row[cols.code]);
    const name = cell(row[cols.name]);
    const drS = cell(row[cols.debit]);
    const crS = cell(row[cols.credit]);

    if (!code && !name && !drS && !crS) continue; // truly empty
    const totalRe = /^(grand\s+)?totals?$/i; // exact "Total"/"Totals"/"Grand Total" in code or name
    if (totalRe.test(code) || totalRe.test(name)) {
      skipped.push({ rowNumber: r + 1, reason: 'Total / sub-total row', text: row.map(cell).filter(Boolean).join(' | ') });
      continue;
    }

    const dr = rupeesCellToPaise(drS);
    const cr = rupeesCellToPaise(crS);
    if (dr === null || cr === null) {
      errors.push({ kind: 'bad_amount', rowNumber: r + 1, message: `Row ${r + 1}: non-numeric amount in a debit/credit column.`, detail: `debit="${drS}", credit="${crS}"` });
      continue;
    }
    if (!code && !name) continue;

    const net = dr - cr;
    const resultDebit = Math.max(net, 0);
    const resultCredit = Math.max(-net, 0);

    const reasons: string[] = [];
    const paren = /^\(.*\)$/.test(drS) || /^\(.*\)$/.test(crS);
    const minus = drS.startsWith('-') || crS.startsWith('-');
    if (paren) reasons.push('parentheses read as a negative');
    else if (minus) reasons.push('leading minus read as a negative');
    if (dr > 0 && cr > 0) reasons.push('debit and credit both present — netted to one side');
    if (Math.abs(dr) > 0 && resultDebit === 0 && resultCredit > 0) reasons.push('moved from debit → credit');
    if (Math.abs(cr) > 0 && resultCredit === 0 && resultDebit > 0) reasons.push('moved from credit → debit');
    if (reasons.length) {
      adjustments.push({ rowNumber: r + 1, account: name || code, originalDebit: drS || '0', originalCredit: crS || '0', resultDebitPaise: resultDebit, resultCreditPaise: resultCredit, reasons });
    }

    rows.push({ rowNumber: r + 1, accountCode: code || name, accountName: name || code, debitPaise: resultDebit, creditPaise: resultCredit });
  }

  if (errors.length) return { ok: false, errors };
  if (!rows.length) return { ok: false, errors: [{ kind: 'no_data_rows', message: 'No data rows were found below the header.' }] };

  const debit = rows.reduce((s, r) => s + r.debitPaise, 0);
  const credit = rows.reduce((s, r) => s + r.creditPaise, 0);
  return {
    ok: true,
    columns,
    headerRow: { index: header.rowIdx, cells: headerCells },
    rows,
    adjustments,
    skipped,
    warnings,
    totals: { debitPaise: debit, creditPaise: credit, differencePaise: debit - credit },
  };
}

/** Convenience: file → preview in one call (used by tests and the evidence harness). */
export function parseTb(input: { buffer: Buffer; filename: string; override?: ColumnOverride }): ParseResult {
  const grid = readFileToGrid(input);
  if (!grid.ok) return grid;
  return parseGrid(grid.grid, input.override);
}
