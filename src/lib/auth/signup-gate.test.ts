// src/lib/auth/signup-gate.test.ts — public signup MUST be closed by default; only an explicit
// SIGNUP_OPEN=true opens it. This guards the C3 fence against a regression that silently opens registration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSignupOpen } from './signup-gate';

test('signup is CLOSED by default and opens only on SIGNUP_OPEN=true', () => {
  assert.equal(isSignupOpen({}), false);                       // unset → closed
  assert.equal(isSignupOpen({ SIGNUP_OPEN: '' }), false);
  assert.equal(isSignupOpen({ SIGNUP_OPEN: 'false' }), false);
  assert.equal(isSignupOpen({ SIGNUP_OPEN: '1' }), false);     // only the literal "true" opens it
  assert.equal(isSignupOpen({ SIGNUP_OPEN: 'true' }), true);
  assert.equal(isSignupOpen({ SIGNUP_OPEN: ' TRUE ' }), true); // trimmed + case-insensitive
});
