// src/lib/overlay/overlay.ts — Saral by CapEasy: bank + GST RECONCILIATION OVERLAYS (PURE module).
//
// FRAMING (non-negotiable): the accounting books are the SOURCE OF TRUTH. Bank statements and GST
// returns are CROSS-CHECKS. This does NOT reconstruct financials from bank/GST and does NOT classify
// bank narrations into accounts (proven 0%-auto dead-end on the ABPAUL test). It RECONCILES the books
// against bank/GST and surfaces the GAPS as founder-framed insights — the gap is the product.
//
// HONESTY MECHANIC: a gap that is really a PARSE error is worse than no overlay. Parsing is defensive;
// rows that can't be read are COUNTED and FLAGGED, never dropped silently. Parse-quality flags are kept
// in a SEPARATE channel from real reconciliation gaps; when a file is unread or substantially incomplete
// we DO NOT assert a compliance gap from it. Honest degradation: no bank/GST → "not available, upload".
import { inr } from '@/lib/mis/present';

// ---- inputs -------------------------------------------------------------------------------------
/** The books = accounting source of truth (sourced from the engine / accounting system). */
export type Books = {
  bookedRevenuePaise: number; // operating revenue booked for the period
  bookedPurchasesPaise?: number; // booked purchases (for GST ITC cross-check)
  receipts?: BookItem[]; // itemised recorded receipts/invoices (enables line-level bank matching)
  payments?: BookItem[]; // itemised recorded payments
  bookedCollectionsPaise?: number; // total recorded receipts, if not itemised
};
export type BookItem = { amountPaise: number; date?: string; ref?: string };

export type BankLine = { date?: string; amountPaise: number; direction: 'credit' | 'debit'; narration?: string };
export type BankStatement = {
  ok: boolean; // false → file could not be read at all (no overlay from it)
  lines: BankLine[];
  totalRows: number;
  unreadRows: number;
  parseFlags: string[];
};
export type GstReturn = {
  ok: boolean;
  kind: 'GSTR1' | 'GSTR2B' | 'unknown';
  filedValuePaise: number | null; // total taxable/invoice value read (null = couldn't parse)
  totalRows: number;
  unreadRows: number;
  parseFlags: string[];
};

// ---- outputs ------------------------------------------------------------------------------------
export type FlagKind =
  | 'uninvoiced_receipt' | 'unrecorded_payment' | 'booked_not_banked'
  | 'booked_over_filed' | 'filed_over_booked' | 'purchase_itc_gap'
  | 'parse_incomplete' | 'parse_failed';
export type ReconFlag = {
  kind: FlagKind;
  // 'parse' severity = a DATA-QUALITY flag, never a compliance gap; the screen renders these apart.
  severity: 'info' | 'watch' | 'risk' | 'parse';
  amountPaise: number | null;
  headline: string; // founder-framed plain meaning
  detail: string;
  traces: { label: string; value: string }[];
};

export type BankRecon = {
  available: boolean;
  reliable: boolean; // false when parsing was incomplete → gaps suppressed/caveated
  matchedCount: number;
  matchedPaise: number;
  bankCreditsPaise: number;
  bankDebitsPaise: number;
  read: { rows: number; unread: number };
  flags: ReconFlag[];
  note: string;
};
export type GstRecon = {
  available: boolean;
  reliable: boolean;
  bookedRevenuePaise: number;
  filedSalesPaise: number | null;
  salesGapPaise: number | null; // booked − filed (signed)
  read: { rows: number; unread: number };
  flags: ReconFlag[];
  note: string;
};
export type OverlayResult = {
  hasData: boolean; // false → honest "upload bank/GST to enable"; nothing fabricated
  bank: BankRecon | null;
  gst: GstRecon | null;
  insights: ReconFlag[]; // REAL reconciliation gaps (parse-quality flags excluded)
  parseWarnings: ReconFlag[]; // data-quality flags, kept SEPARATE from gaps
  sourceOfTruth: string;
  status: 'UNVERIFIED_OVERLAY';
};

// ---- defensive parsing helpers ------------------------------------------------------------------
/** Parse a messy cell to signed paise; returns null when it can't be read (never a silent 0). */
export function parseAmountToPaise(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); } // (500) → −500
  // dr/cr text markers are stripped below; transaction DIRECTION is decided by the caller (column-based).
  s = s.replace(/[₹$,\s]/g, '').replace(/cr|dr/gi, '');
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const rupees = parseFloat(s);
  if (!isFinite(rupees)) return null;
  return Math.round(rupees * 100) * (neg ? -1 : 1);
}

const cell = (row: string[], i: number | undefined) => (i === undefined ? '' : String(row[i] ?? '').trim());
const dataRowsAfter = (rows: string[][], idx: number) => rows.slice(idx + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== ''));

const BANK_HEADERS: Record<string, RegExp> = {
  date: /\b(date|txn\s*date|value\s*date|posting\s*date|transaction\s*date)\b/i,
  narration: /\b(narration|description|particular|particulars|remark|remarks|details)\b/i,
  debit: /\b(debit|withdrawal|withdrawl|paid|outflow|dr\s*amount)\b/i,
  credit: /\b(credit|deposit|received|inflow|cr\s*amount)\b/i,
  amount: /\b(amount|amt|value|transaction\s*amount)\b/i,
  drcr: /\b(dr\s*\/?\s*cr|type|txn\s*type|indicator)\b/i,
};

/** Parse pre-extracted rows (CSV/XLSX → string[][]) of a bank statement. Defensive: flags, never guesses. */
export function parseBankRows(rows: string[][]): BankStatement {
  // find a header row with a date column AND an amount-ish column
  let head: { idx: number; map: Record<string, number> } | null = null;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const map: Record<string, number> = {};
    rows[i].forEach((c, j) => {
      const t = String(c ?? '');
      for (const [k, re] of Object.entries(BANK_HEADERS)) if (map[k] === undefined && re.test(t)) map[k] = j;
    });
    if (map.date !== undefined && (map.amount !== undefined || map.credit !== undefined || map.debit !== undefined)) { head = { idx: i, map }; break; }
  }
  if (!head) {
    const dataCount = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== '')).length;
    return { ok: false, lines: [], totalRows: dataCount, unreadRows: dataCount, parseFlags: ['Could not identify a date + amount column — file format not recognised as a bank statement.'] };
  }
  const { map } = head;
  const data = dataRowsAfter(rows, head.idx);
  const lines: BankLine[] = [];
  let unread = 0;
  for (const r of data) {
    let amountPaise: number | null = null;
    let direction: 'credit' | 'debit' | null = null;
    if (map.credit !== undefined || map.debit !== undefined) {
      const cr = parseAmountToPaise(cell(r, map.credit));
      const dr = parseAmountToPaise(cell(r, map.debit));
      if (cr && Math.abs(cr) > 0) { amountPaise = Math.abs(cr); direction = 'credit'; }
      else if (dr && Math.abs(dr) > 0) { amountPaise = Math.abs(dr); direction = 'debit'; }
    }
    if (amountPaise === null && map.amount !== undefined) {
      const a = parseAmountToPaise(cell(r, map.amount));
      const typ = cell(r, map.drcr).toLowerCase();
      if (a !== null) {
        amountPaise = Math.abs(a);
        direction = /cr|credit|c$/.test(typ) ? 'credit' : /dr|debit|d$/.test(typ) ? 'debit' : a < 0 ? 'debit' : 'credit';
      }
    }
    if (amountPaise === null || direction === null) { unread++; continue; }
    lines.push({ date: cell(r, map.date) || undefined, amountPaise, direction, narration: cell(r, map.narration) || undefined });
  }
  const parseFlags: string[] = [];
  if (unread > 0) parseFlags.push(`${unread} of ${data.length} bank rows could not be read (blank/garbled amount) — excluded, not guessed.`);
  return { ok: lines.length > 0, lines, totalRows: data.length, unreadRows: unread, parseFlags };
}

const GST_VALUE_RE = /\b(taxable\s*value|invoice\s*value|total\s*taxable\s*value|taxable\s*amount|total\s*invoice\s*value|total\s*value)\b/i;
/** Parse pre-extracted rows of a GST return (GSTR-1 sales / GSTR-2B purchases). Sums the value column. */
export function parseGstRows(rows: string[][], hintKind: GstReturn['kind'] = 'unknown'): GstReturn {
  let head: { idx: number; valueCol: number } | null = null;
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const j = rows[i].findIndex((c) => GST_VALUE_RE.test(String(c ?? '')));
    if (j >= 0) { head = { idx: i, valueCol: j }; break; }
  }
  if (!head) {
    const dataCount = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== '')).length;
    return { ok: false, kind: hintKind, filedValuePaise: null, totalRows: dataCount, unreadRows: dataCount, parseFlags: ['No recognisable taxable/invoice-value column — could not read this GST file reliably. Re-export and retry; NO gap is inferred from an unreadable file.'] };
  }
  const data = dataRowsAfter(rows, head.idx);
  let sum = 0; let read = 0; let unread = 0;
  for (const r of data) {
    const v = parseAmountToPaise(cell(r, head.valueCol));
    if (v === null) { unread++; continue; }
    sum += Math.abs(v); read++;
  }
  const parseFlags: string[] = [];
  if (unread > 0) parseFlags.push(`${unread} of ${data.length} GST rows had an unreadable value — excluded from the total, not guessed.`);
  return { ok: read > 0, kind: hintKind, filedValuePaise: read > 0 ? sum : null, totalRows: data.length, unreadRows: unread, parseFlags };
}

// ---- reconciliation -----------------------------------------------------------------------------
const MATERIAL_PAISE = 100_00; // ₹100 — below this a gap is rounding noise, not an insight
const tol = (paise: number) => Math.max(100, Math.round(paise * 0.005)); // ±0.5% (min ₹1) match tolerance
const significantlyIncomplete = (unread: number, total: number) => total > 0 && unread / total >= 0.1;

function parseFlagsToRecon(kind: FlagKind, flags: string[]): ReconFlag[] {
  return flags.map((f) => ({ kind, severity: 'parse' as const, amountPaise: null, headline: f, detail: 'Data-quality flag — NOT a reconciliation gap.', traces: [] }));
}

export function reconcileBank(books: Books, bank: BankStatement): BankRecon {
  const credits = bank.lines.filter((l) => l.direction === 'credit');
  const debits = bank.lines.filter((l) => l.direction === 'debit');
  const bankCreditsPaise = credits.reduce((s, l) => s + l.amountPaise, 0);
  const bankDebitsPaise = debits.reduce((s, l) => s + l.amountPaise, 0);
  const read = { rows: bank.totalRows, unread: bank.unreadRows };
  const flags: ReconFlag[] = [];

  if (!bank.ok) {
    flags.push(...parseFlagsToRecon('parse_failed', bank.parseFlags.length ? bank.parseFlags : ['Bank file could not be read.']));
    return { available: false, reliable: false, matchedCount: 0, matchedPaise: 0, bankCreditsPaise, bankDebitsPaise, read, flags, note: 'Bank statement could not be read — no reconciliation produced.' };
  }
  const reliable = !significantlyIncomplete(bank.unreadRows, bank.totalRows);
  flags.push(...parseFlagsToRecon(reliable ? 'parse_incomplete' : 'parse_incomplete', bank.parseFlags));

  // Line-level matching needs itemised book receipts OR a collections total. Comparing bank CASH
  // against booked ACCRUAL revenue alone is apples-to-oranges (timing/AR) → we do NOT assert a gap
  // from it; we show the bank summary and say what richer data would unlock.
  const canMatch = !!((books.receipts && books.receipts.length) || books.bookedCollectionsPaise !== undefined);
  let matchedCount = 0, matchedPaise = 0, uninvoicedPaise = 0;
  if (books.receipts && books.receipts.length) {
    const used = new Array(credits.length).fill(false);
    for (const rcpt of books.receipts) {
      const t = tol(rcpt.amountPaise);
      const j = credits.findIndex((c, k) => !used[k] && Math.abs(c.amountPaise - rcpt.amountPaise) <= t);
      if (j >= 0) { used[j] = true; matchedCount++; matchedPaise += credits[j].amountPaise; }
    }
    uninvoicedPaise = bankCreditsPaise - matchedPaise;
  } else if (books.bookedCollectionsPaise !== undefined) {
    matchedPaise = Math.min(bankCreditsPaise, books.bookedCollectionsPaise);
    uninvoicedPaise = bankCreditsPaise - books.bookedCollectionsPaise; // bank in excess of booked collections
  }

  if (canMatch && reliable && uninvoicedPaise > MATERIAL_PAISE) {
    flags.push({
      kind: 'uninvoiced_receipt', severity: 'risk', amountPaise: uninvoicedPaise,
      headline: `${inr(uninvoicedPaise)} of bank receipts have no matching invoice/booking — possible unrecorded revenue or a timing gap.`,
      detail: 'Bank money received that the books do not account for. Check for missed invoices or deposits booked in a later period.',
      traces: [{ label: 'Bank credits', value: inr(bankCreditsPaise) }, { label: 'Matched to books', value: inr(matchedPaise) }, { label: 'Unmatched', value: inr(uninvoicedPaise) }],
    });
  } else if (canMatch && reliable && uninvoicedPaise < -MATERIAL_PAISE) {
    flags.push({
      kind: 'booked_not_banked', severity: 'watch', amountPaise: -uninvoicedPaise,
      headline: `${inr(-uninvoicedPaise)} of booked receipts haven't hit the bank — a timing gap to confirm (or receipts recorded that didn't arrive).`,
      detail: 'The books show more collected than the bank received in this window — usually timing; confirm nothing is double-counted.',
      traces: [{ label: 'Booked', value: inr(books.bookedCollectionsPaise ?? books.bookedRevenuePaise) }, { label: 'Bank credits', value: inr(bankCreditsPaise) }],
    });
  }
  if (!reliable) flags.push({ kind: 'parse_incomplete', severity: 'parse', amountPaise: null, headline: `Bank file is ${Math.round((bank.unreadRows / Math.max(1, bank.totalRows)) * 100)}% unread — reconciliation gaps suppressed to avoid a false flag.`, detail: 'Too many rows failed to parse to trust the totals. Fix/re-export the file.', traces: [] });

  const note = !canMatch
    ? 'Bank summary shown; line-level invoice matching needs invoice-level data (connect Tally/Zoho). Books remain the source of truth.'
    : reliable ? 'Books are the source of truth; the bank statement is the cross-check.'
      : 'Parse incomplete — totals unreliable; fix the file before trusting any gap.';
  return { available: true, reliable, matchedCount, matchedPaise, bankCreditsPaise, bankDebitsPaise, read, flags, note };
}

export function reconcileGst(books: Books, gst: GstReturn): GstRecon {
  const read = { rows: gst.totalRows, unread: gst.unreadRows };
  const flags: ReconFlag[] = [];
  const bookedRevenuePaise = books.bookedRevenuePaise;

  if (!gst.ok || gst.filedValuePaise === null) {
    flags.push(...parseFlagsToRecon('parse_failed', gst.parseFlags.length ? gst.parseFlags : ['GST file could not be read.']));
    return { available: false, reliable: false, bookedRevenuePaise, filedSalesPaise: null, salesGapPaise: null, read, flags, note: 'GST return could not be read — no reconciliation produced (no gap inferred from an unreadable file).' };
  }
  const reliable = !significantlyIncomplete(gst.unreadRows, gst.totalRows);
  flags.push(...parseFlagsToRecon('parse_incomplete', gst.parseFlags));

  const filedSalesPaise = gst.filedValuePaise;
  const salesGapPaise = bookedRevenuePaise - filedSalesPaise; // booked − filed

  if (!reliable) {
    flags.push({ kind: 'parse_incomplete', severity: 'parse', amountPaise: null, headline: `GST file is ${Math.round((gst.unreadRows / Math.max(1, gst.totalRows)) * 100)}% unread — the booked-vs-filed gap is suppressed to avoid a false compliance flag.`, detail: 'Too many rows failed to parse to trust the filed total.', traces: [] });
  } else if (salesGapPaise > MATERIAL_PAISE) {
    flags.push({
      kind: 'booked_over_filed', severity: 'risk', amountPaise: salesGapPaise,
      headline: `${inr(salesGapPaise)} of booked sales aren't in the GST filing (GSTR-1) — possible under-reporting / a compliance risk to check.`,
      detail: 'The books show more sales than were filed in GST. Confirm the filing is complete for the period.',
      traces: [{ label: 'Booked revenue', value: inr(bookedRevenuePaise) }, { label: 'GST filed (GSTR-1)', value: inr(filedSalesPaise) }, { label: 'Gap', value: inr(salesGapPaise) }],
    });
  } else if (salesGapPaise < -MATERIAL_PAISE) {
    flags.push({
      kind: 'filed_over_booked', severity: 'watch', amountPaise: -salesGapPaise,
      headline: `${inr(-salesGapPaise)} more sales filed in GST than booked — possible unrecorded revenue in the books.`,
      detail: 'GST shows more sales than the books. Check for invoices filed but not recorded.',
      traces: [{ label: 'GST filed (GSTR-1)', value: inr(filedSalesPaise) }, { label: 'Booked revenue', value: inr(bookedRevenuePaise) }, { label: 'Gap', value: inr(-salesGapPaise) }],
    });
  }
  const note = reliable ? 'Books are the source of truth; the GST filing is the cross-check.' : 'Parse incomplete — filed total unreliable; gap suppressed.';
  return { available: true, reliable, bookedRevenuePaise, filedSalesPaise, salesGapPaise, read, flags, note };
}

/** Combine the overlays. hasData=false → honest "not available, upload to enable" (fabricates nothing). */
export function buildOverlay(books: Books, bank?: BankStatement | null, gst?: GstReturn | null): OverlayResult {
  const bankRecon = bank ? reconcileBank(books, bank) : null;
  const gstRecon = gst ? reconcileGst(books, gst) : null;
  const all = [...(bankRecon?.flags ?? []), ...(gstRecon?.flags ?? [])];
  const insights = all.filter((f) => f.severity !== 'parse');
  const parseWarnings = all.filter((f) => f.severity === 'parse');
  return {
    hasData: !!(bank || gst),
    bank: bankRecon,
    gst: gstRecon,
    insights,
    parseWarnings,
    sourceOfTruth: 'The accounting books are the source of truth. Bank and GST are cross-checks; the GAP is the insight — not a re-statement of the accounts.',
    status: 'UNVERIFIED_OVERLAY',
  };
}
