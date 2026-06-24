// src/lib/tally/parse.ts — tolerant parser for a Tally Trial Balance XML export (ENVELOPE). PURE.
// Tally's report XML is display-oriented and often NOT strict-XML-clean (raw &, odd encodings), so we
// scan for the known record shapes rather than using a strict XML parser. Two shapes are handled:
//   (A) DATA / collection format — <LEDGER NAME="…"> … <PARENT>Group</PARENT> … <CLOSINGBALANCE>amt</CLOSINGBALANCE>
//       (what the Route-A gateway / a Ledger collection returns; carries the parent group cleanly).
//   (B) DISPLAY TB format — <DSPACCNAME><DSPDISPNAME>Name</DSPDISPNAME></DSPACCNAME> followed by
//       <DSPACCINFO>…<DSPCLDRAMTA>dr</DSPCLDRAMTA>…<DSPCLCRAMTA>cr</DSPCLCRAMTA>…</DSPACCINFO>.
//       The detailed TB nests ledgers under group headers; we track the most recent group-header row as
//       the parent (a row with a name but no closing amount). Group capture in display format is
//       best-effort — VALIDATE against the real export.

export type TallyLedger = {
  name: string;
  parentGroup: string;       // '' if the export did not carry it (display format may not)
  closingDrPaise: number;    // >= 0
  closingCrPaise: number;    // >= 0
};
export type TallyParse = {
  format: 'data' | 'display' | 'masters_daybook' | 'unknown';
  ledgers: TallyLedger[];
  withGroup: number;         // how many ledgers carried a parent group (diagnostic)
  warnings: string[];
};

const tag = (block: string, name: string): string | null => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].trim() : null;
};
const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#4;/g, '').replace(/\s+/g, ' ').trim();

/** Tally money string → paise. Handles commas, ₹/Rs, parentheses & leading-minus (negative), Dr/Cr suffix. */
export function tallyAmountToPaise(raw: string | null | undefined): number {
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/(^|\s)cr\.?$/i.test(s)) neg = true; // explicit Cr suffix → treat as negative magnitude
  s = s.replace(/dr\.?$/i, '').replace(/cr\.?$/i, '');
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round((neg ? -Math.abs(n) : n) * 100);
}

function splitDrCr(signedPaise: number): { dr: number; cr: number } {
  return signedPaise >= 0 ? { dr: signedPaise, cr: 0 } : { dr: 0, cr: -signedPaise };
}

export type TallyMeta = { companyName: string | null; fromDate: string | null; toDate: string | null };

/** Best-effort extraction of the company name + report date range from a Tally export envelope, for the
 *  onboarding auto-detect ("We found [company], [period]…"). Tally stamps these in the report header /
 *  static variables; tags vary by export, so we try several. Dates are 'YYYYMMDD' → returned 'YYYY-MM-DD'.
 *  Returns nulls where a field isn't present — the caller degrades (e.g. asks the month). PURE. */
export function detectTallyMeta(xml: string): TallyMeta {
  const first = (...names: string[]): string | null => {
    for (const n of names) {
      const v = tag(xml, n);
      if (v) return decode(v);
    }
    return null;
  };
  // Company name: static-variable / report-header tags, then a <COMPANY NAME="…"> attribute.
  const companyName =
    first('SVCURRENTCOMPANY', 'CURRENTCOMPANY', 'COMPANYNAME', 'BSNAME', 'REPORTTITLE') ??
    (xml.match(/<COMPANY\b[^>]*\bNAME\s*=\s*"([^"]+)"/i)?.[1] ? decode(xml.match(/<COMPANY\b[^>]*\bNAME\s*=\s*"([^"]+)"/i)![1]) : null);

  const toIso = (raw: string | null): string | null => {
    if (!raw) return null;
    const s = raw.replace(/[^0-9]/g, '');
    if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; // YYYYMMDD
    return null;
  };
  const fromDate = toIso(first('SVFROMDATE', 'FROMDATE'));
  const toDate = toIso(first('SVTODATE', 'TODATE', 'ASONDATE', 'LASTVOUCHERDATE'));
  return { companyName, fromDate, toDate };
}

export function parseTallyTB(xml: string): TallyParse {
  const warnings: string[] = [];

  // ---- (A) DATA format: <LEDGER …>…</LEDGER> with <PARENT> + <CLOSINGBALANCE> ----
  const ledgerBlocks = xml.match(/<LEDGER\b[\s\S]*?<\/LEDGER>/gi) ?? [];
  if (ledgerBlocks.length) {
    const ledgers: TallyLedger[] = [];
    let withGroup = 0;
    for (const b of ledgerBlocks) {
      const nameAttr = b.match(/<LEDGER\b[^>]*\bNAME\s*=\s*"([^"]*)"/i)?.[1];
      const name = decode(nameAttr ?? tag(b, 'NAME') ?? tag(b, 'LEDGERNAME') ?? '');
      if (!name) continue;
      const parent = decode(tag(b, 'PARENT') ?? '');
      if (parent) withGroup++;
      // closing balance: prefer explicit dr/cr tags, else signed CLOSINGBALANCE
      const drTag = tag(b, 'CLOSINGDEBIT') ?? tag(b, 'DSPCLDRAMTA');
      const crTag = tag(b, 'CLOSINGCREDIT') ?? tag(b, 'DSPCLCRAMTA');
      let dr = 0, cr = 0;
      if (drTag != null || crTag != null) {
        dr = Math.abs(tallyAmountToPaise(drTag)); cr = Math.abs(tallyAmountToPaise(crTag));
      } else {
        ({ dr, cr } = splitDrCr(tallyAmountToPaise(tag(b, 'CLOSINGBALANCE'))));
      }
      ledgers.push({ name, parentGroup: parent, closingDrPaise: dr, closingCrPaise: cr });
    }
    if (ledgers.length) {
      if (withGroup === 0) warnings.push('DATA format but no <PARENT> groups found — group-authoritative mapping will fall back to name.');
      return { format: 'data', ledgers, withGroup, warnings };
    }
  }

  // ---- (B) DISPLAY TB format: DSPACCNAME / DSPACCINFO sequence, group context tracked ----
  const names = [...xml.matchAll(/<DSPDISPNAME>([\s\S]*?)<\/DSPDISPNAME>/gi)].map((m) => m[1]);
  if (names.length) {
    // Re-walk the document in order, pairing each DSPACCNAME with the next DSPACCINFO; a name with no
    // amount block before the next name is treated as a GROUP HEADER (parent context).
    const ledgers: TallyLedger[] = [];
    let withGroup = 0;
    let currentGroup = '';
    const recRe = /<DSPACCNAME>[\s\S]*?<DSPDISPNAME>([\s\S]*?)<\/DSPDISPNAME>[\s\S]*?<\/DSPACCNAME>([\s\S]*?)(?=<DSPACCNAME>|$)/gi;
    for (const m of xml.matchAll(recRe)) {
      const nm = decode(m[1]);
      const after = m[2] ?? '';
      const drTag = tag(after, 'DSPCLDRAMTA');
      const crTag = tag(after, 'DSPCLCRAMTA');
      const hasAmt = (drTag != null && tallyAmountToPaise(drTag) !== 0) || (crTag != null && tallyAmountToPaise(crTag) !== 0);
      if (!hasAmt) { currentGroup = nm; continue; } // group header / zero-balance subtotal → context
      if (currentGroup) withGroup++;
      ledgers.push({
        name: nm, parentGroup: currentGroup,
        closingDrPaise: Math.abs(tallyAmountToPaise(drTag)),
        closingCrPaise: Math.abs(tallyAmountToPaise(crTag)),
      });
    }
    warnings.push('DISPLAY-format TB: parent groups inferred from header rows (best-effort) — VALIDATE against the real export.');
    return { format: 'display', ledgers, withGroup, warnings };
  }

  warnings.push('Unrecognised Tally XML shape — neither <LEDGER> data blocks nor DSPACCNAME display rows found.');
  return { format: 'unknown', ledgers: [], withGroup: 0, warnings };
}

// ===================================================================================================
// GAP-3 — real-world "All Masters" + "Day Book" two-file export.
// Tally's larger exports are UTF-16 and split the chart from the transactions: the LEDGER masters carry
// <PARENT> group + a balance field (the period CLOSING balance, stored DEBIT-NEGATIVE), and a separate
// Day Book carries the <VOUCHER> postings. Closing balance = master field where present, else Σ day-book
// postings (proven: no ledger carries both). decodeTallyXml() is the byte→string boundary callers use
// before parsing; everything below is PURE (string in).

/** BOM-aware decode for a Tally XML export (UTF-16 LE/BE are common in real exports; UTF-8 fallback). */
export function decodeTallyXml(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return Buffer.from(bytes).toString('utf16le').replace(/^﻿/, '');
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = Buffer.alloc(bytes.length);
    for (let i = 0; i + 1 < bytes.length; i += 2) { swapped[i] = bytes[i + 1]; swapped[i + 1] = bytes[i]; }
    return swapped.toString('utf16le').replace(/^﻿/, '');
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return Buffer.from(bytes.subarray(3)).toString('utf8');
  return Buffer.from(bytes).toString('utf8');
}

export type MasterLedger = { name: string; parentGroup: string; closingDrPaise: number };
export type TallyMastersParse = { ledgers: MasterLedger[]; withGroup: number; withBalance: number };

/** Parse an "All Masters" export: each <LEDGER> → name + <PARENT> group + closing balance. The balance
 *  is carried in <OPENINGBALANCE> as the period CLOSING figure, debit-negative, so dr-positive = −value. */
export function parseTallyMasters(xml: string): TallyMastersParse {
  const ledgers: MasterLedger[] = [];
  let withGroup = 0, withBalance = 0;
  for (const b of xml.match(/<LEDGER\b[\s\S]*?<\/LEDGER>/gi) ?? []) {
    const nameAttr = b.match(/<LEDGER\b[^>]*\bNAME\s*=\s*"([^"]*)"/i)?.[1];
    const name = decode(nameAttr ?? tag(b, 'NAME') ?? tag(b, 'LEDGERNAME') ?? '');
    if (!name) continue;
    const parentGroup = decode(tag(b, 'PARENT') ?? '');
    if (parentGroup) withGroup++;
    const closingDrPaise = -tallyAmountToPaise(tag(b, 'OPENINGBALANCE')); // debit-negative field → dr-positive
    if (closingDrPaise !== 0) withBalance++;
    ledgers.push({ name, parentGroup, closingDrPaise });
  }
  return { ledgers, withGroup, withBalance };
}

export type TallyDayBookParse = { postingsDrPaise: Map<string, number>; voucherCount: number; postingCount: number; postingSumPaise: number };

const VOUCHER_RE = /<VOUCHER\b[\s\S]*?<\/VOUCHER>/gi;
// Both <ALLLEDGERENTRIES.LIST> and <LEDGERENTRIES.LIST> top-level shapes occur; they are disjoint (the
// "ALL" prefix means a plain <LEDGERENTRIES.LIST> can't be a substring of an ALL block, and vice-versa).
const ENTRY_RE = /<(?:ALL)?LEDGERENTRIES\.LIST>[\s\S]*?<\/(?:ALL)?LEDGERENTRIES\.LIST>/gi;
const isYes = (block: string, t: string) => new RegExp(`<${t}>\\s*Yes\\s*</${t}>`, 'i').test(block);

/** Parse a Day Book / voucher export: Σ over each LIVE voucher's ledger entries of (−AMOUNT) per ledger
 *  (dr-positive; Tally AMOUNT is debit-negative). The FIRST <AMOUNT> in an entry block is the ledger
 *  posting — nested bill/bank allocations repeat it and are ignored. Cancelled/deleted/optional skipped. */
export function parseTallyDayBook(xml: string): TallyDayBookParse {
  const postingsDrPaise = new Map<string, number>();
  let voucherCount = 0, postingCount = 0, postingSumPaise = 0;
  for (const v of xml.match(VOUCHER_RE) ?? []) {
    if (isYes(v, 'ISCANCELLED') || isYes(v, 'ISDELETED') || isYes(v, 'ISOPTIONAL')) continue;
    voucherCount++;
    for (const e of v.match(ENTRY_RE) ?? []) {
      const name = decode(tag(e, 'LEDGERNAME') ?? '');
      if (!name) continue;
      const dr = -tallyAmountToPaise(tag(e, 'AMOUNT'));
      postingsDrPaise.set(name, (postingsDrPaise.get(name) ?? 0) + dr);
      postingSumPaise += dr; postingCount++;
    }
  }
  return { postingsDrPaise, voucherCount, postingCount, postingSumPaise };
}

export type TallyOpeningStock = { openingStockPaise: number; stockItems: number; itemsWithOpening: number };

/** Opening-stock VALUE (period start) summed from `<STOCKITEM>` master `<OPENINGVALUE>` tags — present
 *  only when the business maintains item-wise inventory. Returns 0 (itemsWithOpening 0) when stock is
 *  held only as a Stock-in-Hand LEDGER balance (then opening stock must be operator-supplied for a
 *  continuing business — the current-period export carries only the CLOSING balance). This is the
 *  derivation source for opening stock in `closing-stock-adjusted` COGS = opening + purchases − closing. */
export function parseTallyOpeningStock(mastersXml: string): TallyOpeningStock {
  let openingStockPaise = 0, stockItems = 0, itemsWithOpening = 0;
  for (const it of mastersXml.match(/<STOCKITEM\b[\s\S]*?<\/STOCKITEM>/gi) ?? []) {
    stockItems++;
    const v = Math.abs(tallyAmountToPaise(tag(it, 'OPENINGVALUE'))); // opening stock value (positive asset)
    if (v !== 0) { openingStockPaise += v; itemsWithOpening++; }
  }
  return { openingStockPaise, stockItems, itemsWithOpening };
}
