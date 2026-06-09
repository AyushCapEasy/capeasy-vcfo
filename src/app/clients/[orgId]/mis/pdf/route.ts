// GET /clients/[orgId]/mis/pdf?p=<periodId> — render the MIS pack to an A4 PDF (with the SAMPLE
// watermark) and stream it as a download. Authenticated + RLS-scoped via the server client.
import type { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMisChain } from '@/lib/engine/mis-data';
import { buildMisPrintHtml } from '@/lib/mis/print-html';
import { htmlToPdf } from '@/lib/pdf/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// @sparticuz/chromium is heavy: cold-start decompress + browser launch + render can take tens of
// seconds and needs headroom memory. maxDuration is set here; memory is raised in vercel.json
// (route-segment config can't set memory). Cold starts are flaky on serverless — see vercel.json.
export const maxDuration = 60;

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

  const html = buildMisPrintHtml(chain, idx);
  let pdf: Uint8Array;
  try {
    pdf = await htmlToPdf(html);
  } catch (e) {
    return new Response('PDF export failed: ' + (e instanceof Error ? e.message : String(e)), { status: 500 });
  }

  const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  const filename = `MIS-${safe(chain.org.legalName)}-${safe(chain.periods[idx].label)}.pdf`;
  return new Response(pdf as BodyInit, {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` },
  });
}
