// src/lib/env/supabase-env.test.ts — the single-project env invariant must PASS for the expected project
// and FAIL for a missing/malformed URL or a wrong project ref. This keeps a fat-fingered Supabase URL from
// shipping a broken or wrong-project deploy (D-014 revised: one project, isolation via RLS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSupabaseRef, assertSupabaseEnv, EXPECTED_SUPABASE_REF } from './supabase-env';

const goodUrl = `https://${EXPECTED_SUPABASE_REF}.supabase.co`;
const otherUrl = 'https://someotherproject123.supabase.co';

test('parseSupabaseRef extracts the ref, tolerates a trailing slash, rejects junk', () => {
  assert.equal(parseSupabaseRef(goodUrl), EXPECTED_SUPABASE_REF);
  assert.equal(parseSupabaseRef(otherUrl + '/'), 'someotherproject123');
  assert.equal(parseSupabaseRef('not-a-url'), null);
  assert.equal(parseSupabaseRef(undefined), null);
  assert.equal(parseSupabaseRef(''), null);
});

test('SAFE: the expected project URL passes', () => {
  assert.doesNotThrow(() => assertSupabaseEnv({ supabaseUrl: goodUrl }));
});

test('DANGER: a different project ref is refused', () => {
  assert.throws(() => assertSupabaseEnv({ supabaseUrl: otherUrl }), /points at project "someotherproject123"/);
});

test('missing or malformed URL is refused', () => {
  assert.throws(() => assertSupabaseEnv({ supabaseUrl: undefined }), /missing or not a https/);
  assert.throws(() => assertSupabaseEnv({ supabaseUrl: 'http://evil.example' }), /missing or not a https/);
});

test('expectedRef is overridable (for re-pointing/testing)', () => {
  assert.doesNotThrow(() => assertSupabaseEnv({ supabaseUrl: otherUrl, expectedRef: 'someotherproject123' }));
});
