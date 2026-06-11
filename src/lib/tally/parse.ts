// src/lib/tally/parse.ts — tolerant parser for a Tally Trial Balance XML export (ENVELOPE). PURE.
// Tally's report XML is display-oriented and often NOT strict-XML-clean (raw &, odd encodings), so we
// scan for the known record shapes rather than using a strict XML parser. Two shapes are handled:
//   (A) DATA / collection format — <LEDGER NAME="…"> … <PARENT>Group</PARENT> … <CLOSINGBALANCE>amt</CLOSINGBALANCE>
//       (what the Route-A gateway / a Ledger collection returns; carries the parent group cleanly).
//   (B) DISPLAY TB format — <DSPACCNAME><DSPDISPNAME>Name</DSPDISPNAME></DSPACCNAME> followed by
//       <DSPACCINFO>…<DSPCLDRAMTA>dr</DSPCLDRAMTA>…<DSPCLCRAMTA>cr</DSPCLCRAMTA>…</DSPACCINFO>.
//       The detailed TB nests ledgers under group headers; we track the most recent group-header row as
//       the parent (a row with a name but no closing amount). Group capture in display format is
//       best-effort — VALIDATE against the real export.

export type TallyLedger = {
  name: string;
  parentGroup: string;       // '' if the export did not carry it (display format may not)
  closingDrPaise: number;    // >= 0
  closingCrPaise: number;    // >= 0
};
export type TallyParse = {
  format: 'data' | 'display' | 'unknown';
  ledgers: TallyLedger[];
  withGroup: number;         // how many ledgers carried a parent group (diagnostic)
  warnings: string[];
};

const tag = (block: string, name: string): string | null => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].trim() : null;
};
const decode = (s: string) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#4;/g, '').trim();

/** Tally money string → paise. Handles commas, ₹/Rs, parentheses & leading-minus (negative), Dr/Cr suffix. */
export function tallyAmountToPaise(raw: string | null | undefined): number {
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/(^|\s)cr\.?$/i.test(s)) neg = true; // explicit Cr suffix → treat as negative magnitude
  s = s.replace(/dr\.?$/i, '').replace(/cr\.?$/i, '');
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  if (!isFinite(n)) return 0;
  return Math.round((neg ? -Math.abs(n) : n) * 100);
}

function splitDrCr(signedPaise: number): { dr: number; cr: number } {
  return signedPaise >= 0 ? { dr: signedPaise, cr: 0 } : { dr: 0, cr: -signedPaise };
}

export function parseTallyTB(xml: string): TallyParse {
  const warnings: string[] = [];

  // ---- (A) DATA format: <LEDGER …>…</LEDGER> with <PARENT> + <CLOSINGBALANCE> ----
  const ledgerBlocks = xml.match(/<LEDGER\b[\s\S]*?<\/LEDGER>/gi) ?? [];
  if (ledgerBlocks.length) {
    const ledgers: TallyLedger[] = [];
    let withGroup = 0;
    for (const b of ledgerBlocks) {
      const nameAttr = b.match(/<LEDGER\b[^>]*\bNAME\s*=\s*"([^"]*)"/i)?.[1];
      const name = decode(nameAttr ?? tag(b, 'NAME') ?? tag(b, 'LEDGERNAME') ?? '');
      if (!name) continue;
      const parent = decode(tag(b, 'PARENT') ?? '');
      if (parent) withGroup++;
      // closing balance: prefer explicit dr/cr tags, else signed CLOSINGBALANCE
      const drTag = tag(b, 'CLOSINGDEBIT') ?? tag(b, 'DSPCLDRAMTA');
      const crTag = tag(b, 'CLOSINGCREDIT') ?? tag(b, 'DSPCLCRAMTA');
      let dr = 0, cr = 0;
      if (drTag != null || crTag != null) {
        dr = Math.abs(tallyAmountToPaise(drTag)); cr = Math.abs(tallyAmountToPaise(crTag));
      } else {
        ({ dr, cr } = splitDrCr(tallyAmountToPaise(tag(b, 'CLOSINGBALANCE'))));
      }
      ledgers.push({ name, parentGroup: parent, closingDrPaise: dr, closingCrPaise: cr });
    }
    if (ledgers.length) {
      if (withGroup === 0) warnings.push('DATA format but no <PARENT> groups found — group-authoritative mapping will fall back to name.');
      return { format: 'data', ledgers, withGroup, warnings };
    }
  }

  // ---- (B) DISPLAY TB format: DSPACCNAME / DSPACCINFO sequence, group context tracked ----
  const names = [...xml.matchAll(/<DSPDISPNAME>([\s\S]*?)<\/DSPDISPNAME>/gi)].map((m) => m[1]);
  if (names.length) {
    // Re-walk the document in order, pairing each DSPACCNAME with the next DSPACCINFO; a name with no
    // amount block before the next name is treated as a GROUP HEADER (parent context).
    const ledgers: TallyLedger[] = [];
    let withGroup = 0;
    let currentGroup = '';
    const recRe = /<DSPACCNAME>[\s\S]*?<DSPDISPNAME>([\s\S]*?)<\/DSPDISPNAME>[\s\S]*?<\/DSPACCNAME>([\s\S]*?)(?=<DSPACCNAME>|$)/gi;
    for (const m of xml.matchAll(recRe)) {
      const nm = decode(m[1]);
      const after = m[2] ?? '';
      const drTag = tag(after, 'DSPCLDRAMTA');
      const crTag = tag(after, 'DSPCLCRAMTA');
      const hasAmt = (drTag != null && tallyAmountToPaise(drTag) !== 0) || (crTag != null && tallyAmountToPaise(crTag) !== 0);
      if (!hasAmt) { currentGroup = nm; continue; } // group header / zero-balance subtotal → context
      if (currentGroup) withGroup++;
      ledgers.push({
        name: nm, parentGroup: currentGroup,
        closingDrPaise: Math.abs(tallyAmountToPaise(drTag)),
        closingCrPaise: Math.abs(tallyAmountToPaise(crTag)),
      });
    }
    warnings.push('DISPLAY-format TB: parent groups inferred from header rows (best-effort) — VALIDATE against the real export.');
    return { format: 'display', ledgers, withGroup, warnings };
  }

  warnings.push('Unrecognised Tally XML shape — neither <LEDGER> data blocks nor DSPACCNAME display rows found.');
  return { format: 'unknown', ledgers: [], withGroup: 0, warnings };
}
