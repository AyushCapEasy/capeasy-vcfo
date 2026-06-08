// src/lib/intake/types.ts — shared intake types. Money is ALWAYS integer paise (Build Plan §5).
// Every parser tolerance is surfaced (column mapping, sign/side adjustments, skipped rows) so the
// analyst can APPROVE how the file was read before it becomes intake data (Bible §8.5 traceability).

/** One normalized trial-balance line. debit/credit are non-negative paise after net-normalization. */
export type ParsedTbRow = {
  rowNumber: number; // 1-based source row, for analyst-facing messages
  accountCode: string;
  accountName: string;
  debitPaise: number; // >= 0
  creditPaise: number; // >= 0
};

export type ParseErrorKind = 'empty_file' | 'missing_columns' | 'no_data_rows' | 'bad_amount' | 'unreadable';

export type ParseError = {
  kind: ParseErrorKind;
  message: string; // analyst-facing
  rowNumber?: number;
  detail?: string;
};

export type ColumnRole = 'code' | 'name' | 'debit' | 'credit';
export const COLUMN_ROLES: ColumnRole[] = ['code', 'name', 'debit', 'credit'];

/** Which source column was used for each role, with the header text the analyst sees. */
export type ColumnMapping = Record<ColumnRole, { header: string; index: number }>;
/** Analyst override: role → source column index (re-assign when the auto-detect is wrong). */
export type ColumnOverride = Partial<Record<ColumnRole, number>>;

/** A row whose sign/side was changed by a tolerance — listed for explicit approval. */
export type Adjustment = {
  rowNumber: number;
  account: string;
  originalDebit: string;
  originalCredit: string;
  resultDebitPaise: number;
  resultCreditPaise: number;
  reasons: string[];
};

/** A row dropped during parsing (e.g. a "Total" line), with its original text. */
export type SkippedRow = { rowNumber: number; reason: string; text: string };

/** Everything the confirmation screen needs to render — the full read of the file. */
export type ParsePreview = {
  columns: ColumnMapping;
  headerRow: { index: number; cells: string[] }; // all header cells, for re-assignment dropdowns
  rows: ParsedTbRow[];
  adjustments: Adjustment[];
  skipped: SkippedRow[];
  warnings: string[];
  totals: { debitPaise: number; creditPaise: number; differencePaise: number };
};

export type ParseResult = ({ ok: true } & ParsePreview) | { ok: false; errors: ParseError[] };

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
