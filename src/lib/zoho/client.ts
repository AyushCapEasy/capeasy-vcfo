// src/lib/zoho/client.ts — Zoho Books API v3 client (read-only, sales-side). Pulls chart of accounts,
// invoices, quotes, customers/receivables, and customer payments for the firm's OWN org (D-014).
// Paginates Zoho's page/per_page + page_context.has_more_page. No writes; no DB persistence here.
import { booksBase, type ZohoConfig } from './config';
import { getAccessToken } from './auth';

export type ZohoAccount = { account_id: string; account_name: string; account_type?: string };
export type ZohoInvoice = {
  invoice_id: string; invoice_number?: string; date?: string; due_date?: string;
  total?: number; balance?: number; status?: string; customer_name?: string;
};
export type ZohoEstimate = { estimate_id: string; estimate_number?: string; date?: string; total?: number; status?: string; customer_name?: string };
export type ZohoCustomer = { contact_id: string; contact_name: string; outstanding_receivable_amount?: number };
export type ZohoPayment = { payment_id: string; date?: string; amount?: number; customer_name?: string };
export type ZohoOrg = { organization_id: string; name: string; currency_code?: string };

export type SalesSidePull = {
  org: ZohoOrg | null;
  accounts: ZohoAccount[];
  invoices: ZohoInvoice[];
  estimates: ZohoEstimate[];
  customers: ZohoCustomer[];
  payments: ZohoPayment[];
  errors: Record<string, string>; // endpoint label → error (a scope/permission failure on one endpoint
                                  // does NOT abort the others; the pull surfaces what it can + why)
};

async function zget(cfg: ZohoConfig, token: string, path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const url = new URL(`${booksBase(cfg.dc)}${path}`);
  if (cfg.orgId) url.searchParams.set('organization_id', cfg.orgId);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  const j = (await res.json()) as Record<string, unknown>;
  const apiCode = typeof j.code === 'number' ? j.code : 0;
  if (!res.ok || apiCode !== 0) {
    const msg = typeof j.message === 'string' ? j.message : 'unknown';
    throw new Error(`Zoho GET ${path} failed (HTTP ${res.status}, code ${apiCode}): ${msg}`);
  }
  return j;
}

/** Page through a list endpoint until has_more_page is false (per_page capped at 200). */
async function zpaged<T>(cfg: ZohoConfig, token: string, path: string, listKey: string, params: Record<string, string> = {}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 50; page++) {
    const j = await zget(cfg, token, path, { ...params, page: String(page), per_page: '200' });
    const rows = (j[listKey] as T[] | undefined) ?? [];
    out.push(...rows);
    const ctx = j.page_context as { has_more_page?: boolean } | undefined;
    if (!ctx?.has_more_page) break;
  }
  return out;
}

/** List the Zoho Books organizations the token can see (used to discover organization_id). */
export async function listOrganizations(cfg: ZohoConfig, token?: string): Promise<ZohoOrg[]> {
  const t = token ?? (await getAccessToken(cfg));
  const j = await zget({ ...cfg, orgId: null }, t, '/organizations');
  return ((j.organizations as ZohoOrg[] | undefined) ?? []);
}

/** Fallback account-name source when /chartofaccounts is scope-blocked: the DISTINCT income/sales
 *  account names referenced by invoice LINE ITEMS (covered by ZohoBooks.invoices.READ). These are the
 *  real sales-side account names the firm actually uses — the relevant set for a sales-side classifier
 *  test. Samples up to `limit` invoices (sequential, gentle on rate limits). */
export async function fetchInvoiceAccountNames(cfg: ZohoConfig, invoiceIds: string[], limit = 60): Promise<ZohoAccount[]> {
  const token = await getAccessToken(cfg);
  const seen = new Map<string, ZohoAccount>();
  for (const id of invoiceIds.filter(Boolean).slice(0, limit)) {
    try {
      const j = await zget(cfg, token, `/invoices/${id}`);
      const inv = j.invoice as { line_items?: { account_id?: string; account_name?: string }[] } | undefined;
      for (const li of inv?.line_items ?? []) {
        const name = (li.account_name ?? '').trim();
        if (name && !seen.has(name)) seen.set(name, { account_id: li.account_id ?? '', account_name: name });
      }
    } catch { /* skip an unreadable invoice; keep going */ }
  }
  return [...seen.values()];
}

/** Pull the full sales-side picture for the configured org. Requires cfg.orgId. Resilient: each
 *  endpoint is attempted independently; a failure is recorded in `errors` and the rest still pull. */
export async function pullSalesSide(cfg: ZohoConfig): Promise<SalesSidePull> {
  if (!cfg.orgId) throw new Error('BLOCKED — no ZOHO_ORG_ID. Re-run scripts/zoho-auth.mts, or set it in .env.local.');
  const token = await getAccessToken(cfg);
  const errors: Record<string, string> = {};
  const tryPull = async <T>(label: string, fn: () => Promise<T[]>): Promise<T[]> => {
    try { return await fn(); } catch (e) { errors[label] = (e as Error).message; return []; }
  };
  const [accounts, invoices, estimates, customers, payments] = await Promise.all([
    tryPull<ZohoAccount>('chartofaccounts', () => zpaged(cfg, token, '/chartofaccounts', 'chartofaccounts')),
    tryPull<ZohoInvoice>('invoices', () => zpaged(cfg, token, '/invoices', 'invoices')),
    tryPull<ZohoEstimate>('estimates', () => zpaged(cfg, token, '/estimates', 'estimates')),
    tryPull<ZohoCustomer>('customers', () => zpaged(cfg, token, '/contacts', 'contacts', { contact_type: 'customer' })),
    tryPull<ZohoPayment>('payments', () => zpaged(cfg, token, '/customerpayments', 'customerpayments')),
  ]);
  const orgs = await listOrganizations(cfg, token).catch(() => []);
  const org = orgs.find((o) => o.organization_id === cfg.orgId) ?? orgs[0] ?? null;
  return { org, accounts, invoices, estimates, customers, payments, errors };
}
