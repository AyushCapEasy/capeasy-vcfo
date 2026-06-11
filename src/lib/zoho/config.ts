// src/lib/zoho/config.ts — Zoho data-center-aware endpoints + config read from env. NO secrets in
// this file; all values come from process.env (populated from gitignored .env.local — D-009/D-014).
// Sales-side connector for the firm's OWN Zoho Books org (D-014): invoices/quotes/payments/customers,
// NOT purchases. Output is the revenue/receivables picture only — never a complete P&L/BS.

export type ZohoDc = 'com' | 'in' | 'eu' | 'com.au' | 'jp' | 'ca' | 'sa';

export type ZohoConfig = {
  dc: ZohoDc;
  clientId: string;
  clientSecret: string;
  refreshToken: string | null; // durable secret; filled by scripts/zoho-auth.mts
  orgId: string | null;        // Zoho Books organization_id
};

/** Zoho Accounts (OAuth token) host for a data center. */
export function accountsBase(dc: ZohoDc): string {
  return `https://accounts.zoho.${dc}`;
}

/** Zoho Books API v3 base for a data center. */
export function booksBase(dc: ZohoDc): string {
  return `https://www.zohoapis.${dc}/books/v3`;
}

const PLACEHOLDER = /REPLACE_/;

/** Read Zoho config from an env map (defaults to process.env). Throws if client creds are missing. */
export function readZohoConfig(env: Record<string, string | undefined> = process.env): ZohoConfig {
  const dc = (env.ZOHO_DC || 'in') as ZohoDc;
  const clientId = env.ZOHO_CLIENT_ID || '';
  const clientSecret = env.ZOHO_CLIENT_SECRET || '';
  if (!clientId || !clientSecret || PLACEHOLDER.test(clientId) || PLACEHOLDER.test(clientSecret)) {
    throw new Error('BLOCKED — ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET missing or placeholder in .env.local (register the Self Client first).');
  }
  const refreshToken = env.ZOHO_REFRESH_TOKEN && !PLACEHOLDER.test(env.ZOHO_REFRESH_TOKEN) ? env.ZOHO_REFRESH_TOKEN : null;
  const orgId = env.ZOHO_ORG_ID && !PLACEHOLDER.test(env.ZOHO_ORG_ID) ? env.ZOHO_ORG_ID : null;
  return { dc, clientId, clientSecret, refreshToken, orgId };
}

/** Least-privilege READ scopes for the sales-side pull (chart of accounts, invoices, quotes,
 *  customers/receivables, payments). Used when generating the Self Client grant code. */
export const ZOHO_SCOPES = [
  'ZohoBooks.settings.READ',         // chart of accounts, organization
  'ZohoBooks.invoices.READ',
  'ZohoBooks.estimates.READ',        // quotes
  'ZohoBooks.contacts.READ',         // customers / receivables
  'ZohoBooks.customerpayments.READ',
].join(',');
