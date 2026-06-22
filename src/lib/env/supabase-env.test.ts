// src/lib/env/supabase-env.test.ts — the D-014 env invariant must FAIL the build on the two dangerous
// misconfigurations (prod pointed at demo; preview/dev pointed at a non-demo project) and PASS the safe
// ones. These are the regression guards that keep prod/demo data from ever crossing via a fat-fingered env.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSupabaseRef, resolveEnvKind, assertSupabaseEnv, DEMO_REF } from './supabase-env';

const PROD = 'abcprod1234567890xy';
const demoUrl = `https://${DEMO_REF}.supabase.co`;
const prodUrl = `https://${PROD}.supabase.co`;

test('parseSupabaseRef extracts the ref, tolerates trailing slash, rejects junk', () => {
  assert.equal(parseSupabaseRef(demoUrl), DEMO_REF);
  assert.equal(parseSupabaseRef(prodUrl + '/'), PROD);
  assert.equal(parseSupabaseRef('not-a-url'), null);
  assert.equal(parseSupabaseRef(undefined), null);
});

test('resolveEnvKind maps VERCEL_ENV; unset → development', () => {
  assert.equal(resolveEnvKind({ VERCEL_ENV: 'production' }), 'production');
  assert.equal(resolveEnvKind({ VERCEL_ENV: 'preview' }), 'preview');
  assert.equal(resolveEnvKind({}), 'development');
});

test('SAFE: production on a non-demo project passes', () => {
  assert.doesNotThrow(() => assertSupabaseEnv({ kind: 'production', supabaseUrl: prodUrl }));
});

test('DANGER: production pointed at the DEMO project is refused', () => {
  assert.throws(() => assertSupabaseEnv({ kind: 'production', supabaseUrl: demoUrl }), /PRODUCTION is pointed at the DEMO project/);
});

test('SAFE: preview + development on the demo project pass', () => {
  assert.doesNotThrow(() => assertSupabaseEnv({ kind: 'preview', supabaseUrl: demoUrl }));
  assert.doesNotThrow(() => assertSupabaseEnv({ kind: 'development', supabaseUrl: demoUrl }));
});

test('DANGER: preview pointed at a non-demo (prod!) project is refused', () => {
  assert.throws(() => assertSupabaseEnv({ kind: 'preview', supabaseUrl: prodUrl }), /Previews\/dev must use demo/);
});

test('missing/malformed URL is refused in every environment', () => {
  for (const kind of ['production', 'preview', 'development'] as const) {
    assert.throws(() => assertSupabaseEnv({ kind, supabaseUrl: undefined }), /missing or not a https/);
  }
});

test('optional exact prod-ref pin: matching passes, mismatch refused', () => {
  assert.doesNotThrow(() => assertSupabaseEnv({ kind: 'production', supabaseUrl: prodUrl, expectedProdRef: PROD }));
  assert.throws(() => assertSupabaseEnv({ kind: 'production', supabaseUrl: prodUrl, expectedProdRef: 'someOtherRef' }), /!= expected prod ref/);
});
