// src/lib/email/resend.ts — ResendProvider: send-only, native fetch (no SDK — mirrors the Zoho client's
// fetch pattern, keeps the module dependency-free and lift-and-shift clean). Uses the shared CapEasy
// Resend key (RESEND_API_TOKEN); the verified sending domain is capeasy.in. POST https://api.resend.com/emails.
import type { EmailProvider, EmailMessage, SendResult } from './types';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export class ResendProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(private readonly token: string) {
    if (!token) throw new Error('BLOCKED — RESEND_API_TOKEN missing; cannot construct ResendProvider.');
  }

  async send(message: EmailMessage): Promise<SendResult> {
    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: message.from,
          to: Array.isArray(message.to) ? message.to : [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          // Resend tag names/values must match /^[A-Za-z0-9_-]+$/ — our product/template tags satisfy this.
          ...(message.tags ? { tags: Object.entries(message.tags).map(([name, value]) => ({ name, value })) } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (!res.ok) {
        return { ok: false, provider: this.name, error: body.message || body.name || `Resend HTTP ${res.status}` };
      }
      return { ok: true, provider: this.name, id: body.id ?? '' };
    } catch (e) {
      return { ok: false, provider: this.name, error: (e as Error).message };
    }
  }
}
