// src/lib/intake/money.ts — parse a messy rupees cell to integer paise (Build Plan §5: never float).
// Handles: plain numbers, comma grouping (Indian/Western), ₹/Rs/INR symbols, parentheses-negatives,
// leading-minus, blanks. Returns null for genuinely non-numeric content (→ analyst-facing bad_amount).

export function rupeesCellToPaise(raw: unknown): number | null {
  if (raw === null || raw === undefined) return 0;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return Math.round(raw * 100);
  }

  let s = String(raw).trim();
  if (s === '' || s === '-' || s === '—') return 0;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  }

  // Strip currency markers and digit-group separators / spaces.
  s = s.replace(/₹|rs\.?|inr/gi, '').replace(/[,\s]/g, '').trim();
  if (s === '') return 0;

  if (!/^\d+(\.\d+)?$/.test(s)) return null; // letters / stray symbols → non-numeric
  const val = Number(s);
  if (!Number.isFinite(val)) return null;

  const paise = Math.round(val * 100);
  return negative ? -paise : paise;
}

/** Format paise as ₹ for analyst-facing messages (e.g. -12345 → "-₹123.45"). */
export function paiseToInr(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = String(abs % 100).padStart(2, '0');
  return `${sign}₹${rupees.toLocaleString('en-IN')}.${p}`;
}
