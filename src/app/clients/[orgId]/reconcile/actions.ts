'use server';
// src/app/clients/[orgId]/reconcile/actions.ts — run the bank/GST reconciliation overlay against the
// client's books. Files are parsed IN-MEMORY only (D-014, nothing persisted) and the books come from the
// RLS-scoped engine results — the books are the source of truth, the uploads are the cross-check.
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase/server';
import { getMisChain } from '@/lib/engine/mis-data';
import { parseBankRows, parseGstRows, buildOverlay, type Books, type OverlayResult } from '@/lib/overlay/overlay';

export type ReconState = {
  ran: boolean;
  overlay: OverlayResult | null;
  periodLabel: string | null;
  provided: { bank: boolean; gst: boolean };
  error: string | null;
};

/** Extract a messy CSV/XLSX upload into string rows. Defensive: returns [] on an unreadable file. */
async function fileToRows(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
    return rows.map((r) => r.map((c) => String(c ?? '')));
  }
  const parsed = Papa.parse<string[]>(buf.toString('utf8'), { skipEmptyLines: true });
  return parsed.data.map((r) => r.map((c) => String(c ?? '')));
}

export async function runReconcile(orgId: string, _prev: ReconState, formData: FormData): Promise<ReconState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ran: false, overlay: null, periodLabel: null, provided: { bank: false, gst: false }, error: 'Not authenticated.' };

  const chain = await getMisChain(orgId);
  if (!chain || !chain.results.length) {
    return { ran: false, overlay: null, periodLabel: null, provided: { bank: false, gst: false }, error: 'No books to reconcile against — add a period and upload a trial balance first.' };
  }
  const latest = chain.results[chain.results.length - 1];
  const books: Books = { bookedRevenuePaise: latest.pnl.operatingRevenuePaise, bookedPurchasesPaise: latest.pnl.cogsPaise };

  const bankFile = formData.get('bankFile') as File | null;
  const gstFile = formData.get('gstFile') as File | null;
  const hasBank = !!(bankFile && bankFile.size > 0);
  const hasGst = !!(gstFile && gstFile.size > 0);
  if (!hasBank && !hasGst) {
    return { ran: false, overlay: null, periodLabel: latest.label, provided: { bank: false, gst: false }, error: 'Upload a bank statement and/or a GST return (CSV or XLSX) to reconcile.' };
  }

  let bank = null, gst = null;
  if (hasBank) {
    try { bank = parseBankRows(await fileToRows(bankFile!)); }
    catch { bank = { ok: false, lines: [], totalRows: 0, unreadRows: 0, parseFlags: ['Could not open the bank file (unsupported format?) — re-export as CSV/XLSX.'] }; }
  }
  if (hasGst) {
    try { gst = parseGstRows(await fileToRows(gstFile!)); }
    catch { gst = { ok: false, kind: 'unknown' as const, filedValuePaise: null, totalRows: 0, unreadRows: 0, parseFlags: ['Could not open the GST file (unsupported format?) — re-export as CSV/XLSX.'] }; }
  }

  const overlay = buildOverlay(books, bank, gst);
  return { ran: true, overlay, periodLabel: latest.label, provided: { bank: hasBank, gst: hasGst }, error: null };
}
