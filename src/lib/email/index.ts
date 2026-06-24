// src/lib/email/index.ts — the module's public surface. Config-driven provider selection + the two Saral
// auth send paths (verification, password reset) the upcoming signup flow will call. Everything goes
// through the EmailProvider interface, so this whole folder lifts into the future shared CapEasy
// notification service unchanged.
//
// READY for signup, NOT wired to it in this pass: public registration stays closed until the RLS
// GAP-1/GAP-2 fixes land (separate Phase-1 work). No /signup route, no middleware whitelist change here.
import type { EmailProvider, SendResult, EmailMessage } from './types';
import { readEmailConfig, type EmailConfig } from './config';
import { ResendProvider } from './resend';
import { MockProvider } from './mock';
import { renderAuthEmail, renderApprovalEmail, type AuthTemplateKind } from './templates';

export type { EmailProvider, SendResult, EmailMessage, EmailAddress } from './types';
export type { EmailConfig, EmailProviderKind } from './config';
export type { AuthTemplateKind, RenderedTemplate } from './templates';
export { MockProvider } from './mock';
export { ResendProvider } from './resend';
export { renderAuthEmail, renderApprovalEmail } from './templates';
export { readEmailConfig, formatSender, SARAL_SENDER_NAME } from './config';

/** Build the configured provider. EMAIL_PROVIDER=resend → ResendProvider (requires RESEND_API_TOKEN);
 *  anything else → MockProvider (the safe default — no live sends). */
export function getEmailProvider(config: EmailConfig = readEmailConfig()): EmailProvider {
  if (config.provider === 'resend') {
    if (!config.resendToken) {
      throw new Error('BLOCKED — EMAIL_PROVIDER=resend but RESEND_API_TOKEN is missing in .env.local.');
    }
    return new ResendProvider(config.resendToken);
  }
  return new MockProvider();
}

/** Injectable dependencies so callers (and tests) can supply a provider/config; both default to env. */
export type SendDeps = { provider?: EmailProvider; config?: EmailConfig };

async function sendAuthEmail(kind: AuthTemplateKind, to: string, actionUrl: string, deps: SendDeps = {}): Promise<SendResult> {
  const config = deps.config ?? readEmailConfig();
  const provider = deps.provider ?? getEmailProvider(config);
  const tpl = renderAuthEmail(kind, actionUrl);
  const message: EmailMessage = {
    to,
    from: config.fromFormatted, // shared address + Saral display-name framing
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: { product: 'saral', template: kind },
  };
  return provider.send(message);
}

/** Saral-branded email-confirmation/verification send. `confirmationUrl` is the auth action link. */
export function sendVerificationEmail(to: string, confirmationUrl: string, deps: SendDeps = {}): Promise<SendResult> {
  return sendAuthEmail('verification', to, confirmationUrl, deps);
}

/** Saral-branded password-reset send. `resetUrl` is the auth recovery link. */
export function sendPasswordResetEmail(to: string, resetUrl: string, deps: SendDeps = {}): Promise<SendResult> {
  return sendAuthEmail('password_reset', to, resetUrl, deps);
}

/** Workspace-approval send — emails the org owner when an admin flips their org from pending to active. */
export function sendApprovalEmail(to: string, workspaceName: string, loginUrl: string, deps: SendDeps = {}): Promise<SendResult> {
  const config = deps.config ?? readEmailConfig();
  const provider = deps.provider ?? getEmailProvider(config);
  const tpl = renderApprovalEmail(workspaceName, loginUrl);
  const message: EmailMessage = {
    to,
    from: config.fromFormatted,
    subject: tpl.subject,
    html: tpl.html,
    text: tpl.text,
    tags: { product: 'saral', template: 'approval' },
  };
  return provider.send(message);
}
