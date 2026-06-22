// src/lib/overlay/upload.test.ts — the REAL-USER reconcile path end to end: raw upload bytes → rowsFromUpload
// → parseBankRows → buildOverlay. Proves (a) a clean bank CSV surfaces the right gap, and (b) the messy-file
// honesty holds on the path a real user actually hits — a garbled or unreadable upload yields a PARSE FLAG,
// never a fabricated reconciliation gap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsFromUpload } from './upload';
import { parseBankRows, buildOverlay, type Books } from './overlay';

const R = 100; // ₹1 = 100 paise
const books: Books = { bookedRevenuePaise: 10_00_000 * R, bookedPurchasesPaise: 6_00_000 * R };

test('real-user path: a clean bank CSV upload → rows → overlay surfaces the uninvoiced-receipt gap', () => {
  const csv = [
    'Date,Narration,Credit,Debit',
    '01-04-2026,NEFT FROM ACME,"1,00,000",',
    '03-04-2026,CASH DEPOSIT,"30,000",', // ← not in the books
  ].join('\n');
  const bank = parseBankRows(rowsFromUpload(Buffer.from(csv, 'utf8'), 'bank.csv'));
  assert.equal(bank.ok, true);
  const o = buildOverlay({ ...books, receipts: [{ amountPaise: 1_00_000 * R }] }, bank, null);
  const flag = o.insights.find((f) => f.kind === 'uninvoiced_receipt');
  assert.ok(flag, 'the ₹30,000 uninvoiced receipt surfaces from a real CSV upload');
  assert.equal(flag!.amountPaise, 30_000 * R);
});

test('real-user path: a readable-but-garbled bank CSV → parse flag, NEVER a fabricated gap', () => {
  const csv = [
    'Date,Credit',
    '01-04,"1,00,000"', '02-04,"50,000"',
    '03-04,###', '04-04,NA', '05-04,err', '06-04,-', // 4/6 unreadable → totals untrustworthy
  ].join('\n');
  const bank = parseBankRows(rowsFromUpload(Buffer.from(csv, 'utf8'), 'bank.csv'));
  assert.ok(bank.unreadRows >= 4);
  const o = buildOverlay({ ...books, receipts: [{ amountPaise: 1_00_000 * R }] }, bank, null);
  assert.equal(o.insights.filter((f) => f.kind === 'uninvoiced_receipt').length, 0, 'no gap from an unreliable parse');
  assert.ok(o.parseWarnings.some((f) => f.kind === 'parse_incomplete'), 'flagged as parse-incomplete instead');
});

test('real-user path: an unreadable upload yields no usable rows → flagged, never a fabricated gap', () => {
  let rows: string[][] = [];
  try { rows = rowsFromUpload(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]), 'statement.xlsx'); } catch { /* the action turns a throw into a parse flag */ }
  const bank = parseBankRows(rows);
  assert.equal(bank.ok, false);
  const o = buildOverlay(books, bank, null);
  assert.equal(o.insights.filter((f) => f.kind === 'uninvoiced_receipt').length, 0, 'never a fabricated gap from an unreadable file');
});
