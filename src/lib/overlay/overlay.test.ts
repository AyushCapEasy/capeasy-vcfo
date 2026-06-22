// src/lib/overlay/overlay.test.ts — the overlay must (a) FLAG a known uninvoiced bank receipt, (b)
// surface the exact known booked-vs-GST-filed gap, (c) FLAG an unreadable file rather than fabricate a
// compliance gap from it, (d) degrade honestly with no data, and (e) suppress a gap when parsing is too
// incomplete to trust. Parse-quality flags stay in a SEPARATE channel from real reconciliation gaps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBankRows, parseGstRows, buildOverlay, type Books } from './overlay';

const R = 100; // ₹1 = 100 paise; fixtures quote rupees, asserts use paise
const books: Books = { bookedRevenuePaise: 10_00_000 * R, bookedPurchasesPaise: 6_00_000 * R };

test('BANK: a known uninvoiced receipt is FLAGGED (bank money with no matching invoice)', () => {
  const bank = parseBankRows([
    ['Date', 'Narration', 'Credit', 'Debit'],
    ['01-04-2026', 'NEFT FROM ACME', '1,00,000', ''],
    ['02-04-2026', 'UPI COLLECTION', '50,000', ''],
    ['03-04-2026', 'CASH DEPOSIT', '30,000', ''], // ← no matching invoice
    ['04-04-2026', 'RENT PAID', '', '20,000'],
  ]);
  assert.equal(bank.ok, true);
  assert.equal(bank.unreadRows, 0);
  // books recorded only the first two receipts (₹1,00,000 + ₹50,000)
  const b: Books = { ...books, receipts: [{ amountPaise: 1_00_000 * R }, { amountPaise: 50_000 * R }] };
  const o = buildOverlay(b, bank, null);
  const flag = o.insights.find((f) => f.kind === 'uninvoiced_receipt');
  assert.ok(flag, 'the ₹30,000 uninvoiced receipt is flagged');
  assert.equal(flag!.amountPaise, 30_000 * R); // exactly the unmatched bank credit
  assert.equal(o.bank!.matchedCount, 2);
  assert.equal(o.bank!.reliable, true);
});

test('GST: a known booked-vs-filed gap surfaces the right number (under-reporting risk)', () => {
  const gst = parseGstRows([
    ['Invoice No', 'Taxable Value', 'Tax'],
    ['INV-001', '5,00,000', '90,000'],
    ['INV-002', '4,00,000', '72,000'], // filed sales = ₹9,00,000
  ], 'GSTR1');
  assert.equal(gst.ok, true);
  assert.equal(gst.filedValuePaise, 9_00_000 * R);
  const o = buildOverlay(books, null, gst); // booked revenue ₹10,00,000 vs filed ₹9,00,000
  const flag = o.insights.find((f) => f.kind === 'booked_over_filed');
  assert.ok(flag, 'the booked-over-filed gap is flagged');
  assert.equal(flag!.amountPaise, 1_00_000 * R); // ₹10,00,000 − ₹9,00,000
  assert.equal(o.gst!.salesGapPaise, 1_00_000 * R);
});

test('MESSY FILE: an unreadable GST file is FLAGGED, never turned into a fabricated gap', () => {
  const gst = parseGstRows([
    ['CapEasy GST export — summary'],
    ['random', 'columns', 'here'],
    ['12', 'ab', 'xy'],
  ]);
  assert.equal(gst.ok, false);
  assert.equal(gst.filedValuePaise, null);
  const o = buildOverlay(books, null, gst);
  // CRITICAL: no compliance gap invented from a misread file
  assert.equal(o.insights.filter((f) => f.kind === 'booked_over_filed' || f.kind === 'filed_over_booked').length, 0);
  assert.equal(o.gst!.available, false);
  assert.ok(o.parseWarnings.some((f) => f.kind === 'parse_failed'), 'a parse flag is raised instead');
  assert.match(o.parseWarnings[0].headline, /could not read|recognisable/i);
});

test('HONEST DEGRADATION: no bank/GST data → not available, nothing fabricated', () => {
  const o = buildOverlay(books);
  assert.equal(o.hasData, false);
  assert.equal(o.bank, null);
  assert.equal(o.gst, null);
  assert.equal(o.insights.length, 0);
  assert.equal(o.parseWarnings.length, 0);
});

test('PARSE INCOMPLETE: too many unread rows → the gap is SUPPRESSED, not asserted', () => {
  // 6 data rows, 4 with garbled credit amounts → 67% unread → totals untrustworthy
  const bank = parseBankRows([
    ['Date', 'Credit'],
    ['01-04', '1,00,000'], ['02-04', '50,000'],
    ['03-04', '###'], ['04-04', 'NA'], ['05-04', 'err'], ['06-04', '-'],
  ]);
  assert.ok(bank.unreadRows >= 4);
  const o = buildOverlay({ ...books, receipts: [] }, bank, null);
  assert.equal(o.bank!.reliable, false);
  assert.equal(o.insights.filter((f) => f.kind === 'uninvoiced_receipt').length, 0, 'no gap asserted from an unreliable parse');
  assert.ok(o.parseWarnings.some((f) => f.kind === 'parse_incomplete'), 'flagged as parse-incomplete instead');
});
