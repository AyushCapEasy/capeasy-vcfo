// src/lib/intake/money.ts — parse a messy rupees cell. Magnitude (formatting) is separated from
// sign (an ACCOUNTING signal): commas/₹/Rs/INR stripping is pure formatting and applied silently,
// but a parenthesis/minus is only RECORDED — never acted on here — because moving a value between
// debit and credit changes its accounting meaning and is the analyst's decision (Bible §8.5).

/** Magnitude in paise + whether the cell carried a negative marker. null = non-numeric. */
export function parseAmountCell(raw: unknown): { magnitudePaise: number; negative: boolean } | null {
  if (raw === null || raw === undefined) return { magnitudePaise: 0, negative: false };

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return { magnitudePaise: Math.round(Math.abs(raw) * 100), negative: raw < 0 };
  }

  let s = String(raw).trim();
  if (s === '' || s === '-' || s === '—') return { magnitudePaise: 0, negative: false };

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  }

  s = s.replace(/₹|rs\.?|inr/gi, '').replace(/[,\s]/g, '').trim(); // formatting only
  if (s === '') return { magnitudePaise: 0, negative: false };

  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const val = Number(s);
  if (!Number.isFinite(val)) return null;
  return { magnitudePaise: Math.round(val * 100), negative };
}

/** Signed paise (magnitude with sign applied). Used where a single signed number is wanted. */
export function rupeesCellToPaise(raw: unknown): number | null {
  const r = parseAmountCell(raw);
  if (r === null) return null;
  return r.negative ? -r.magnitudePaise : r.magnitudePaise;
}

/** Format paise as ₹ for analyst-facing messages (e.g. -12345 → "-₹123.45"). */
export function paiseToInr(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = String(abs % 100).padStart(2, '0');
  return `${sign}₹${rupees.toLocaleString('en-IN')}.${p}`;
}
