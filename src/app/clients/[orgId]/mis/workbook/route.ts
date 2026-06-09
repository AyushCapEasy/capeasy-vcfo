// GET /clients/[orgId]/mis/workbook?p=<periodId> — download the source workbook: the period's mapped
// trial balance plus the engine-computed statements (P&L / BS / Cash Flow / ratios). Numbers come
// from the same engine results as the view; the workbook is stamped UNVERIFIED.
import type { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';
import { getMisChain, getPeriodDrilldown } from '@/lib/engine/mis-data';
import { pnlRows, bsAssetRows, bsLiabEquityRows, cfRows, ratioCards, type StmtRow } from '@/lib/mis/present';
import { WATERMARK_TEXT } from '@/lib/watermark';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rupees = (paise: number | null) => (paise === null ? 'n/a' : paise / 100);
const stmtAoA = (rows: StmtRow[]) => [['Line', 'Amount (₹)'], ...rows.map((r) => [r.label + (r.note ? ` (${r.note})` : ''), rupees(r.paise)])];

export async function GET(req: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const chain = await getMisChain(orgId);
  if (!chain || !chain.periods.length) return new Response('Not found', { status: 404 });
  const p = req.nextUrl.searchParams.get('p');
  const found = p ? chain.periods.findIndex((pp) => pp.id === p) : -1;
  const idx = found >= 0 ? found : chain.periods.length - 1;
  const periodMeta = chain.periods[idx];
  const result = chain.results[idx];
  const drilldown = await getPeriodDrilldown(periodMeta.id);

  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    [WATERMARK_TEXT],
    [],
    ['Client', chain.org.legalName],
    ['Period', periodMeta.label],
    ['Status', periodMeta.status],
    ['Note', 'All figures are computed by the engine and UNVERIFIED until CA sign-off. ₹ = INR.'],
  ]), 'Pack (UNVERIFIED)');

  const tbAoA: (string | number)[][] = [[WATERMARK_TEXT], [], ['Category', 'Account code', 'Account name', 'Debit (₹)', 'Credit (₹)']];
  for (const [cat, lines] of Object.entries(drilldown)) {
    for (const l of lines) tbAoA.push([cat, l.code, l.name, l.debitPaise / 100, l.creditPaise / 100]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tbAoA), 'Trial Balance');

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stmtAoA(pnlRows(result))), 'P&L');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...stmtAoA(bsAssetRows(result)), [], ...stmtAoA(bsLiabEquityRows(result)).slice(1)]), 'Balance Sheet');
  const cf = cfRows(result);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cf ? stmtAoA(cf) : [['Cash Flow'], ['n/a — needs a prior period']]), 'Cash Flow');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Ratio', 'Value'], ...ratioCards(result).map((c) => [c.label, c.value])]), 'Ratios');

  const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return new Response(buf as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="MIS-${safe(chain.org.legalName)}-${safe(periodMeta.label)}.xlsx"`,
    },
  });
}
