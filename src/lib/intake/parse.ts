// src/lib/intake/parse.ts — parse an uploaded TB (CSV via Papaparse, XLSX via SheetJS) into
// normalized paise rows. Runs server-side only (file buffer). Column format is the [ADD DETAIL]
// default: account_code, account_name, debit, credit (header synonyms tolerated). A file whose
// columns can't be identified fails here with an analyst-facing message — that IS the gate's
// structural arm (Bible §3.3 / §3.4).
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { rupeesCellToPaise } from './money';
import type { ParseResult, ParseError, ParsedTbRow, DetectedColumns } from './types';

type Role = keyof DetectedColumns;
const ROLES: Role[] = ['code', 'name', 'debit', 'credit'];

// Exact (normalized) header matches per role — keeps 'debit' from being grabbed as a name, etc.
const HEADER_SYNONYMS: Record<Role, string[]> = {
  code: ['account code', 'accountcode', 'code', 'gl code', 'glcode', 'ledger code', 'account no', 'account number', 'a c code', 'acct code', 'ac code'],
  name: ['account name', 'accountname', 'name', 'particulars', 'ledger', 'ledger name', 'account', 'description', 'narration', 'head'],
  debit: ['debit', 'debit amount', 'dr', 'debit inr', 'debit amt', 'dr amount'],
  credit: ['credit', 'credit amount', 'cr', 'credit inr', 'credit amt', 'cr amount'],
};

const norm = (v: unknown): string =>
  String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function detectHeader(grid: unknown[][]) {
  const limit = Math.min(grid.length, 15);
  for (let r = 0; r < limit; r++) {
    const cells = (grid[r] ?? []).map(norm);
    const cols: Partial<Record<Role, number>> = {};
    const headerStrings: Partial<DetectedColumns> = {};
    for (const role of ROLES) {
      for (let c = 0; c < cells.length; c++) {
        if (Object.values(cols).includes(c)) continue; // column already claimed
        if (HEADER_SYNONYMS[role].includes(cells[c])) {
          cols[role] = c;
          headerStrings[role] = String((grid[r] ?? [])[c]);
          break;
        }
      }
    }
    if (ROLES.every((role) => cols[role] !== undefined)) {
      return { rowIdx: r, cols: cols as Record<Role, number>, headerStrings: headerStrings as DetectedColumns };
    }
  }
  return null;
}

function parseGrid(grid: unknown[][]): ParseResult {
  if (!grid.length) return { ok: false, errors: [{ kind: 'empty_file', message: 'The file appears to be empty.' }] };

  const header = detectHeader(grid);
  if (!header) {
    const firstNonEmpty = grid.find((row) => (row ?? []).some((c) => String(c ?? '').trim() !== '')) ?? [];
    const seen = firstNonEmpty.map((c) => String(c ?? '').trim()).filter(Boolean).slice(0, 12).join(' | ') || '(no readable header row)';
    return {
      ok: false,
      errors: [{
        kind: 'missing_columns',
        message: 'Could not find the required columns. Expected a header row containing: account_code, account_name, debit, credit.',
        detail: `Columns seen: ${seen}`,
      }],
    };
  }

  const { rowIdx, cols, headerStrings } = header;
  const rows: ParsedTbRow[] = [];
  const errors: ParseError[] = [];
  const warnings: string[] = [];

  for (let r = rowIdx + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const code = String(row[cols.code] ?? '').trim();
    const name = String(row[cols.name] ?? '').trim();
    const drRaw = row[cols.debit];
    const crRaw = row[cols.credit];

    const amtBlank = (v: unknown) => v === '' || v === null || v === undefined;
    if (!code && !name && amtBlank(drRaw) && amtBlank(crRaw)) continue; // empty row
    if (!code && /^(grand\s+)?totals?$/i.test(name)) {
      warnings.push(`Row ${r + 1}: skipped a "${name}" total row.`);
      continue;
    }

    const dr = rupeesCellToPaise(drRaw);
    const cr = rupeesCellToPaise(crRaw);
    if (dr === null || cr === null) {
      errors.push({
        kind: 'bad_amount',
        rowNumber: r + 1,
        message: `Row ${r + 1}: non-numeric amount in a debit/credit column.`,
        detail: `debit="${String(drRaw ?? '')}", credit="${String(crRaw ?? '')}"`,
      });
      continue;
    }
    if (!code && !name) continue;

    const net = dr - cr; // net-normalize to a single side
    rows.push({
      rowNumber: r + 1,
      accountCode: code || name,
      accountName: name || code,
      debitPaise: Math.max(net, 0),
      creditPaise: Math.max(-net, 0),
    });
  }

  if (errors.length) return { ok: false, errors };
  if (!rows.length) return { ok: false, errors: [{ kind: 'no_data_rows', message: 'No data rows were found below the header.' }] };
  return { ok: true, rows, columns: headerStrings, warnings };
}

export function parseTb(input: { buffer: Buffer; filename: string }): ParseResult {
  const ext = (input.filename.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'csv' || ext === 'txt') {
      const text = input.buffer.toString('utf8');
      const res = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy' });
      return parseGrid(res.data as unknown[][]);
    }
    const wb = XLSX.read(input.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { ok: false, errors: [{ kind: 'empty_file', message: 'The workbook has no sheets.' }] };
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: true, defval: '' }) as unknown[][];
    return parseGrid(grid);
  } catch (e) {
    return {
      ok: false,
      errors: [{ kind: 'unreadable', message: 'The file could not be read as CSV or XLSX.', detail: e instanceof Error ? e.message : String(e) }],
    };
  }
}
