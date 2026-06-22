// src/lib/email/mock.ts — MockProvider: records every send in-memory and NEVER touches the network. This
// is the TEST DEFAULT (EMAIL_PROVIDER unset or =mock resolves here, per config.ts) so a test can assert the
// exact from-address, Saral framing, subject and template that WOULD have been sent — with zero live sends.
import type { EmailProvider, EmailMessage, SendResult } from './types';

export class MockProvider implements EmailProvider {
  readonly name = 'mock';
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<SendResult> {
    this.sent.push(message);
    return { ok: true, provider: this.name, id: `mock-${this.sent.length}` };
  }

  /** Most recent message (test convenience). */
  last(): EmailMessage | undefined {
    return this.sent[this.sent.length - 1];
  }

  reset(): void {
    this.sent.length = 0;
  }
}
