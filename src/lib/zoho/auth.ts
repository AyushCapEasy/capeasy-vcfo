// src/lib/zoho/auth.ts — Zoho OAuth token handling (Self Client flow). The refresh token is the
// durable secret and lives ONLY in gitignored .env.local; access tokens are short-lived and held in
// memory. Nothing here is ever logged or persisted to a tracked file.
import { accountsBase, type ZohoConfig } from './config';

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
};

async function tokenRequest(cfg: ZohoConfig, params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    ...params,
  });
  const res = await fetch(`${accountsBase(cfg.dc)}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return (await res.json()) as TokenResponse;
}

/** Exchange a Self-Client grant code (short-lived) for a durable refresh token + an access token. */
export async function exchangeGrantCode(cfg: ZohoConfig, code: string): Promise<{ refreshToken: string; accessToken: string }> {
  const j = await tokenRequest(cfg, { grant_type: 'authorization_code', code });
  if (!j.refresh_token || !j.access_token) {
    throw new Error(`Zoho grant-code exchange failed (${j.error ?? 'no refresh_token'}). Code may be expired/used or the DC may be wrong.`);
  }
  return { refreshToken: j.refresh_token, accessToken: j.access_token };
}

/** Mint a fresh access token from the stored refresh token. */
export async function getAccessToken(cfg: ZohoConfig): Promise<string> {
  if (!cfg.refreshToken) {
    throw new Error('BLOCKED — no ZOHO_REFRESH_TOKEN. Run `npx tsx scripts/zoho-auth.mts <grant_code>` first.');
  }
  const j = await tokenRequest(cfg, { grant_type: 'refresh_token', refresh_token: cfg.refreshToken });
  if (!j.access_token) {
    throw new Error(`Zoho token refresh failed (${j.error ?? 'no access_token'}).`);
  }
  return j.access_token;
}
