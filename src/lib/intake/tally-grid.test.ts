// src/lib/intake/tally-grid.test.ts — a Tally TB XML export must convert to the canonical intake grid and
// round-trip cleanly through parseGrid: ledger names become rows, closing Dr/Cr land in the right columns,
// paise are preserved exactly, and the result balances. An empty/garbage export is FLAGGED, not fabricated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tallyXmlToGrid } from './tally-grid';
import { parseGrid } from './parse';

// DATA-format Tally TB (CLOSINGBALANCE: Dr positive, Cr negative). Balanced: Dr 3,50,000 = Cr 3,50,000.
const XML = `<ENVELOPE>
<LEDGER NAME="HDFC Bank"><PARENT>Bank Accounts</PARENT><CLOSINGBALANCE>350000.00</CLOSINGBALANCE></LEDGER>
<LEDGER NAME="Trade Receivables"><PARENT>Sundry Debtors</PARENT><CLOSINGBALANCE>150000.50</CLOSINGBALANCE></LEDGER>
<LEDGER NAME="Share Capital"><PARENT>Capital Account</PARENT><CLOSINGBALANCE>-500000.50</CLOSINGBALANCE></LEDGER>
</ENVELOPE>`;

test('Tally XML → canonical grid round-trips through parseGrid with exact paise + balance', () => {
  const res = tallyXmlToGrid(Buffer.from(XML, 'utf8'));
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.ledgerCount, 3);
  assert.deepEqual(res.grid[0], ['account_code', 'account_name', 'debit', 'credit']); // recognised header

  const preview = parseGrid(res.grid);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;
  assert.equal(preview.rows.length, 3);

  const bank = preview.rows.find((r) => r.accountName === 'HDFC Bank')!;
  assert.equal(bank.debitPaise, 35000000); // ₹3,50,000 → paise, exact
  assert.equal(bank.creditPaise, 0);
  const cap = preview.rows.find((r) => r.accountName === 'Share Capital')!;
  assert.equal(cap.creditPaise, 50000050); // negative closing → credit, paise preserved (₹5,00,000.50)
  assert.equal(cap.debitPaise, 0);

  // TB balances: Σ debit = Σ credit (3,50,000 + 1,50,000.50 = 5,00,000.50).
  assert.equal(preview.totals.debitPaise, preview.totals.creditPaise);
  assert.equal(preview.totals.differencePaise, 0);
});

test('empty / non-ledger Tally XML is FLAGGED, never fabricated into a grid', () => {
  const res = tallyXmlToGrid(Buffer.from('<ENVELOPE></ENVELOPE>', 'utf8'));
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.error, /No ledger balances/);
});
