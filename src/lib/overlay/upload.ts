// src/lib/overlay/upload.ts — read a messy CSV/XLSX bank/GST upload into string rows, IN-MEMORY (D-014,
// nothing persisted). Kept free of DB/Next deps so the real-user reconcile path (file bytes → rows → parse
// → overlay) is unit-testable end to end. A throw here is the caller's signal to raise a PARSE FLAG —
// never to fabricate a reconciliation gap.
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export function rowsFromUpload(bytes: Uint8Array, filename: string): string[][] {
  const name = filename.toLowerCase();
  const buf = Buffer.from(bytes);
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
    return rows.map((r) => r.map((c) => String(c ?? '')));
  }
  const parsed = Papa.parse<string[]>(buf.toString('utf8'), { skipEmptyLines: true });
  return parsed.data.map((r) => r.map((c) => String(c ?? '')));
}
