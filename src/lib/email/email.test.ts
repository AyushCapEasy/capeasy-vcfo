// src/lib/email/email.test.ts — proves the send PATH end-to-end through the MockProvider: the safe-default
// provider selection, the shared from-address with Saral display-name framing, the right Saral-branded
// template per auth kind, and ZERO live network sends. EMAIL_PROVIDER is forced to mock here — these tests
// never touch Resend (requirement #3: no live sends in tests, ever).
process.env.EMAIL_PROVIDER = 'mock';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MockProvider,
  ResendProvider,
  sendVerificationEmail,
  sendPasswordResetEmail,
  getEmailProvider,
  readEmailConfig,
  renderAuthEmail,
  formatSender,
} from './index';

const FROM = 'Saral by CapEasy <noreply@capeasy.in>';

test('config: provider defaults to mock unless EMAIL_PROVIDER=resend (no accidental live send)', () => {
  assert.equal(readEmailConfig({}).provider, 'mock');
  assert.equal(readEmailConfig({ EMAIL_PROVIDER: 'mock' }).provider, 'mock');
  assert.equal(readEmailConfig({ EMAIL_PROVIDER: 'anything-else' }).provider, 'mock');
  assert.equal(readEmailConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_TOKEN: 'tok' }).provider, 'resend');
  assert.equal(getEmailProvider(readEmailConfig({})).name, 'mock');
});

test('config: shared from-address, per-product Saral framing', () => {
  const c = readEmailConfig({ EMAIL_FROM: 'noreply@capeasy.in' });
  assert.equal(c.fromAddress, 'noreply@capeasy.in'); // the shared CapEasy address
  assert.equal(c.fromFormatted, FROM); // Saral display name layered on the shared address
  assert.equal(formatSender('Saral by CapEasy', 'noreply@capeasy.in'), FROM);
});

test('selecting resend with a real token yields the ResendProvider (construction only — no send)', () => {
  const p = getEmailProvider(readEmailConfig({ EMAIL_PROVIDER: 'resend', RESEND_API_TOKEN: 'tok' }));
  assert.ok(p instanceof ResendProvider);
  assert.equal(p.name, 'resend');
});

test('resend selected WITHOUT a token is BLOCKED (fails loud — never silently downgrades)', () => {
  assert.throws(() => getEmailProvider(readEmailConfig({ EMAIL_PROVIDER: 'resend' })), /RESEND_API_TOKEN/);
});

test('verification email: Saral framing, right template, correct from — via mock, no live send', async () => {
  const mock = new MockProvider();
  const url = 'https://app.example/auth/confirm?token=abc123';
  const res = await sendVerificationEmail('user@client.com', url, {
    provider: mock,
    config: readEmailConfig({ EMAIL_FROM: 'noreply@capeasy.in' }),
  });

  assert.equal(res.ok, true);
  assert.equal(mock.sent.length, 1); // exactly one captured send, nothing on the wire
  const m = mock.last()!;
  assert.equal(m.from, FROM); // shared address + Saral framing
  assert.equal(m.to, 'user@client.com');
  assert.match(m.subject, /Saral by CapEasy/); // self-identifies the product
  assert.match(m.subject, /confirm/i); // the verification template, not reset
  assert.match(m.html, /Saral by CapEasy/);
  assert.ok(m.html.includes(url), 'confirmation URL embedded in HTML');
  assert.ok(m.text.includes(url), 'plain-text fallback carries the URL');
  assert.equal(m.tags?.product, 'saral');
  assert.equal(m.tags?.template, 'verification');
});

test('password reset email: Saral framing, right template, correct from — via mock, no live send', async () => {
  const mock = new MockProvider();
  const url = 'https://app.example/auth/reset?token=xyz789';
  const res = await sendPasswordResetEmail('user@client.com', url, { provider: mock });

  assert.equal(res.ok, true);
  assert.equal(mock.sent.length, 1);
  const m = mock.last()!;
  assert.equal(m.from, FROM);
  assert.match(m.subject, /reset/i);
  assert.match(m.subject, /Saral by CapEasy/);
  assert.equal(m.tags?.template, 'password_reset');
  assert.ok(m.html.includes(url) && m.text.includes(url));
});

test('templates: the two auth kinds are distinct and each self-identifies as Saral', () => {
  const v = renderAuthEmail('verification', 'https://x/y');
  const p = renderAuthEmail('password_reset', 'https://x/y');
  assert.notEqual(v.subject, p.subject);
  for (const t of [v, p]) {
    assert.match(t.subject, /Saral by CapEasy/);
    assert.match(t.html, /Saral by CapEasy/);
    assert.ok(t.text.length > 0);
  }
});
