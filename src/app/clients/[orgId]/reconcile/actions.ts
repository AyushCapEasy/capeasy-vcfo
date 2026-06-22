'use server';
// src/app/clients/[orgId]/reconcile/actions.ts — run the bank/GST reconciliation overlay against the
// client's books. Files are parsed IN-MEMORY only (D-014, nothing persisted) and the books come from the
// RLS-scoped engine results — the books are the source of truth, the uploads are the cross-check.
import { createClient } from '@/lib/supabase/server';
import { getMisChain } from '@/lib/engine/mis-data';
import { parseBankRows, parseGstRows, buildOverlay, type Books, type OverlayResult } from '@/lib/overlay/overlay';
import { rowsFromUpload } from '@/lib/overlay/upload';

export type ReconState = {
  ran: boolean;
  overlay: OverlayResult | null;
  periodLabel: string | null;
  provided: { bank: boolean; gst: boolean };
  error: string | null;
};

const fileRows = async (file: File): Promise<string[][]> => rowsFromUpload(Buffer.from(await file.arrayBuffer()), file.name);

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
    try { bank = parseBankRows(await fileRows(bankFile!)); }
    catch { bank = { ok: false, lines: [], totalRows: 0, unreadRows: 0, parseFlags: ['Could not open the bank file (unsupported format?) — re-export as CSV/XLSX.'] }; }
  }
  if (hasGst) {
    try { gst = parseGstRows(await fileRows(gstFile!)); }
    catch { gst = { ok: false, kind: 'unknown' as const, filedValuePaise: null, totalRows: 0, unreadRows: 0, parseFlags: ['Could not open the GST file (unsupported format?) — re-export as CSV/XLSX.'] }; }
  }

  const overlay = buildOverlay(books, bank, gst);
  return { ran: true, overlay, periodLabel: latest.label, provided: { bank: hasBank, gst: hasGst }, error: null };
}
