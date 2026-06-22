// src/lib/email/config.ts — Saral email identity + env-driven config. NO secrets in this file; all values
// come from process.env (populated from gitignored .env.local — D-009/D-014). The from-ADDRESS is the
// shared CapEasy noreply@capeasy.in (one Resend-verified domain across all four products); the DISPLAY
// NAME carries the per-product framing ("Saral by CapEasy") so a recipient always knows which product
// mailed them. Shared address, per-product framing.

export const SARAL_SENDER_NAME = 'Saral by CapEasy';
const DEFAULT_FROM_ADDRESS = 'noreply@capeasy.in';

export type EmailProviderKind = 'resend' | 'mock';

export type EmailConfig = {
  provider: EmailProviderKind;
  fromAddress: string; // bare address, e.g. noreply@capeasy.in (shared)
  fromFormatted: string; // "Saral by CapEasy <noreply@capeasy.in>" (per-product framing on the shared address)
  resendToken: string | null;
};

const PLACEHOLDER = /REPLACE_/;

function clean(v: string | undefined): string {
  const s = (v ?? '').trim();
  return s && !PLACEHOLDER.test(s) ? s : '';
}

/** Format a sender as "Display Name <addr>". Only the address is shared across products; the name is per-product. */
export function formatSender(name: string, address: string): string {
  return `${name} <${address}>`;
}

/** Read email config from an env map (defaults to process.env).
 *  SAFE DEFAULT: anything other than an explicit EMAIL_PROVIDER=resend resolves to 'mock', so no
 *  environment can accidentally perform a live send — tests and unconfigured envs never hit the wire. */
export function readEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig {
  const provider: EmailProviderKind = clean(env.EMAIL_PROVIDER) === 'resend' ? 'resend' : 'mock';
  const fromAddress = clean(env.EMAIL_FROM) || DEFAULT_FROM_ADDRESS;
  // The shared CapEasy Resend token lives in RESEND_API_KEY (canonical, per .env.local). RESEND_API_TOKEN
  // is accepted as a back-compat fallback so either name works.
  const resendToken = clean(env.RESEND_API_KEY) || clean(env.RESEND_API_TOKEN) || null;
  return {
    provider,
    fromAddress,
    fromFormatted: formatSender(SARAL_SENDER_NAME, fromAddress),
    resendToken,
  };
}
