// src/lib/intake/types.ts — shared intake types. Money is ALWAYS integer paise (Build Plan §5).
// The analyst-facing validation gate (Bible §3.3) runs before any compute.

/** One normalized trial-balance line. debit/credit are non-negative paise after net-normalization. */
export type ParsedTbRow = {
  rowNumber: number; // 1-based source row, for analyst-facing error messages
  accountCode: string;
  accountName: string;
  debitPaise: number; // >= 0
  creditPaise: number; // >= 0
};

export type ParseErrorKind =
  | 'empty_file'
  | 'missing_columns'
  | 'no_data_rows'
  | 'bad_amount'
  | 'unreadable';

export type ParseError = {
  kind: ParseErrorKind;
  message: string; // analyst-facing
  rowNumber?: number;
  detail?: string;
};

/** Which source header strings were matched to each required role. */
export type DetectedColumns = { code: string; name: string; debit: string; credit: string };

export type ParseResult =
  | { ok: true; rows: ParsedTbRow[]; columns: DetectedColumns; warnings: string[] }
  | { ok: false; errors: ParseError[] };

export type RuleId = 'tb_balances' | 'no_unmapped' | 'sign_sanity' | 'period_continuity';
export type RuleStatus = 'pass' | 'fail' | 'skipped';

export type ValidationRule = {
  id: RuleId;
  label: string;
  status: RuleStatus;
  summary: string; // analyst-facing one-liner
  offenders?: { label: string; detail: string }[];
};

export type ValidationReport = {
  ok: boolean; // true only if every non-skipped hard rule passes
  rules: ValidationRule[];
  totals: { debitPaise: number; creditPaise: number; differencePaise: number };
};

/** Canonical category metadata (mirrors public.account_categories rows). */
export type CategoryMeta = {
  code: string;
  name: string;
  group: string;
  statement: 'pl' | 'bs';
  normal_balance: 'debit' | 'credit';
};
