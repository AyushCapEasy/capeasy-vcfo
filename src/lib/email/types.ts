// src/lib/email/types.ts — the provider-agnostic email contract. This interface is the seam: Saral
// talks ONLY to EmailProvider, never to Resend directly, so the whole module lifts cleanly into a future
// shared CapEasy notification service (one service, four products) without touching any call site.

export type EmailAddress = string; // RFC 5322; may be a bare addr or "Display Name <addr@host>"

export type EmailMessage = {
  to: EmailAddress | EmailAddress[];
  from: EmailAddress; // formatted sender, e.g. "Saral by CapEasy <noreply@capeasy.in>"
  subject: string;
  html: string;
  text: string; // plain-text fallback (deliverability + accessibility)
  replyTo?: EmailAddress;
  tags?: Record<string, string>; // product/template tags — analytics + the future shared service router
};

export type SendResult =
  | { ok: true; id: string; provider: string }
  | { ok: false; error: string; provider: string };

/** The one abstraction every caller depends on. Implementations: ResendProvider (live), MockProvider (tests). */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<SendResult>;
}
