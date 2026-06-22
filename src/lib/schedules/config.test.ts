// src/lib/schedules/config.test.ts — the pure row-builder: money → exact paise, booleans, optional text →
// null, validated selects, and the "has content" guard that ignores empty submissions (no fabricated rows).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEDULE_BY_TABLE, buildScheduleInsert, scheduleRowHasContent } from './config';

const from = (m: Record<string, string>) => (n: string) => m[n] ?? '';

test('revenue detail: money→paise, recurring bool, optional text → null', () => {
  const def = SCHEDULE_BY_TABLE.get('schedule_revenue_detail')!;
  const row = buildScheduleInsert(def, from({ segment: 'Subscriptions', customer_name: '', amount: '1,00,000.50', is_recurring: 'on' }));
  assert.equal(row.amount, 10000050); // ₹1,00,000.50 → paise, exact
  assert.equal(row.is_recurring, true);
  assert.equal(row.segment, 'Subscriptions');
  assert.equal(row.customer_name, null);
  assert.equal(scheduleRowHasContent(def, row), true);
});

test('debt: select validated, rate kept as number, principal→paise', () => {
  const def = SCHEDULE_BY_TABLE.get('schedule_debt')!;
  const row = buildScheduleInsert(def, from({ lender: 'HDFC', kind: 'long_term', principal_outstanding: '500000', interest_rate: '11.5' }));
  assert.equal(row.kind, 'long_term');
  assert.equal(row.principal_outstanding, 50000000);
  assert.equal(row.interest_rate, 11.5);
});

test('invalid select option → null (never a bogus enum)', () => {
  const def = SCHEDULE_BY_TABLE.get('schedule_debt')!;
  assert.equal(buildScheduleInsert(def, from({ kind: 'bogus' })).kind, null);
});

test('empty submission has no content (ignored, not fabricated)', () => {
  const def = SCHEDULE_BY_TABLE.get('schedule_ar_aging')!;
  assert.equal(scheduleRowHasContent(def, buildScheduleInsert(def, from({}))), false);
});

test('a positive amount alone counts as content (no identifier needed)', () => {
  const def = SCHEDULE_BY_TABLE.get('schedule_cash_balances')!;
  const row = buildScheduleInsert(def, from({ balance: '5000' }));
  assert.equal(row.balance, 500000);
  assert.equal(scheduleRowHasContent(def, row), true);
});
