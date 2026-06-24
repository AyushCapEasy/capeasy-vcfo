// src/lib/tally/onboarding.ts — PURE analysis of a Tally export for the connect-your-data on-ramp.
// One pass: decode (BOM-aware) → parse ledgers → classify by group (auto-map, no manual mapping) →
// detect company + period dates. Returns everything the connect flow shows back ("We found …") and
// everything the build step commits (TB rows + source→category auto-mappings). Bytes in; nothing here
// touches the DB or persists anything (D-014 in-memory).
import { decodeTallyXml, parseTallyTB, detectTallyMeta } from './parse';
import { classifyLedgers } from './classify';

export type OnboardingLedger = { name: string; debitPaise: number; creditPaise: number; categoryCode: string | null };

export type TallyOnboardingAnalysis =
  | { ok: false; error: string; detail?: string }
  | {
      ok: true;
      companyName: string | null;
      fromDate: string | null; // 'YYYY-MM-DD' or null
      toDate: string | null;   // 'YYYY-MM-DD' or null (period close)
      ledgers: OnboardingLedger[];
      counts: { ledgers: number; pl: number; bs: number; classified: number; unclassified: number };
      warnings: string[];
    };

export function analyzeTallyForOnboarding(bytes: Uint8Array): TallyOnboardingAnalysis {
  let xml: string;
  try {
    xml = decodeTallyXml(bytes);
  } catch (e) {
    return { ok: false, error: 'Could not read the file.', detail: e instanceof Error ? e.message : String(e) };
  }
  let parse;
  try {
    parse = parseTallyTB(xml);
  } catch (e) {
    return { ok: false, error: 'Could not read the Tally export.', detail: e instanceof Error ? e.message : String(e) };
  }

  const withBal = parse.ledgers.filter((l) => l.closingDrPaise > 0 || l.closingCrPaise > 0);
  if (!withBal.length) {
    return { ok: false, error: 'No ledger balances found. In Tally, export the Trial Balance (ledgers with closing balances) and upload that file.' };
  }

  const decisions = classifyLedgers(withBal);
  const ledgers: OnboardingLedger[] = decisions.map((d) => ({
    name: d.name,
    debitPaise: d.closingDrPaise,
    creditPaise: d.closingCrPaise,
    categoryCode: d.category,
  }));
  const meta = detectTallyMeta(xml);
  const classified = decisions.filter((d) => d.category).length;

  return {
    ok: true,
    companyName: meta.companyName,
    fromDate: meta.fromDate,
    toDate: meta.toDate,
    ledgers,
    counts: {
      ledgers: withBal.length,
      pl: decisions.filter((d) => d.statement === 'pl').length,
      bs: decisions.filter((d) => d.statement === 'bs').length,
      classified,
      unclassified: withBal.length - classified,
    },
    warnings: parse.warnings,
  };
}
