// src/lib/email/templates.ts — Saral-branded auth email templates: the CANONICAL source of the Saral
// framing. Shared address, per-product framing: every subject + body identifies "Saral by CapEasy" even
// though the from-address is the shared noreply@capeasy.in. These two templates cover the upcoming signup
// flow — email confirmation/verification + password reset.
//
// NOTE (Supabase-fork): whether these are rendered by our ResendProvider OR pasted into Supabase's
// email-template editor (the recommended route for auth mail — see README.md), THIS file stays the single
// source of the Saral copy/branding. The action URL is caller-supplied (a Supabase action link or an app
// link). Plain string interpolation only — no template engine, so it lifts cleanly.

export type AuthTemplateKind = 'verification' | 'password_reset';

export type RenderedTemplate = { subject: string; html: string; text: string };

const BRAND = 'Saral by CapEasy';

function shell(headline: string, bodyHtml: string, cta: { url: string; label: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2421">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e7e4dd;border-radius:12px;overflow:hidden">
        <tr><td style="padding:22px 28px;border-bottom:1px solid #efece5">
          <span style="font-size:15px;font-weight:700;color:#0f3d2e">${BRAND}</span>
        </td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 12px;font-size:19px;font-weight:600;color:#1f2421">${headline}</h1>
          ${bodyHtml}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px">
            <tr><td style="border-radius:8px;background:#0f3d2e">
              <a href="${cta.url}" style="display:inline-block;padding:11px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${cta.label}</a>
            </td></tr>
          </table>
          <p style="margin:14px 0 0;font-size:12px;color:#6b6f6a">If the button doesn't work, paste this link into your browser:<br><span style="color:#0f3d2e;word-break:break-all">${cta.url}</span></p>
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #efece5;font-size:11.5px;color:#8a8f88">
          ${BRAND} — turning your books into a structured MIS pack. You received this because an account action was requested for this address. If it wasn't you, you can safely ignore this email.
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export function renderAuthEmail(kind: AuthTemplateKind, actionUrl: string): RenderedTemplate {
  if (kind === 'verification') {
    return {
      subject: `Confirm your email · ${BRAND}`,
      html: shell(
        'Confirm your email',
        `<p style="margin:0;font-size:14px;line-height:1.6;color:#3a3f3a">Welcome to ${BRAND}. Confirm this email address to activate your workspace and start turning your books into a structured MIS pack.</p>`,
        { url: actionUrl, label: 'Confirm email' }
      ),
      text: `Confirm your email — ${BRAND}\n\nWelcome to ${BRAND}. Confirm this email address to activate your workspace:\n${actionUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
    };
  }
  // password_reset
  return {
    subject: `Reset your ${BRAND} password`,
    html: shell(
      'Reset your password',
      `<p style="margin:0;font-size:14px;line-height:1.6;color:#3a3f3a">We received a request to reset the password for your ${BRAND} account. Choose a new password using the button below. This link will expire shortly.</p>`,
      { url: actionUrl, label: 'Reset password' }
    ),
    text: `Reset your ${BRAND} password\n\nWe received a request to reset your ${BRAND} password. Use this link to choose a new one (it expires shortly):\n${actionUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
  };
}
