// src/lib/intake/period.ts — pure period helpers. Indian Tax Year runs 01-Apr → 31-Mar; from
// 01-Apr-2026 the Income Tax Act 2025 labels it "Tax Year (TY)" (Bible §6.1).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-01' → 'Apr 2026'. */
export function monthLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** 'YYYY-MM-01' → 'TY2026-27' (Apr-anchored). */
export function taxYearLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  const end = (start + 1) % 100;
  return `TY${start}-${String(end).padStart(2, '0')}`;
}

/** 'YYYY-MM-01' → next month 'YYYY-MM-01'. */
export function nextMonth(periodMonth: string): string {
  const [y, m] = periodMonth.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}
