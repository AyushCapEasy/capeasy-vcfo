// src/lib/engine/identity-battery.test.ts — M-verify (a): the IDENTITY BATTERY (Vision §5).
// Accounting identities are true by definition and must hold for ANY correct dataset. We build a
// BROAD, ADVERSARIAL set of synthetic articulating books (each constructed so a CORRECT engine yields
// passing identities — cash is the balancing plug, opening RE rolls), then assert all four §4.5
// identities PASS, plus the perturbation (corrupt a non-cash line by X → cash tie breaks by exactly X)
// to prove the checks are LIVE. This is the real pass/fail gate — not AI agreement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChain } from './engine';
import { checkInvariants, perturbNatural } from './invariants';
// The 16 adversarial charts live in a shared module (single source of truth) so the identity
// battery (here) and the M9 decision-engine coverage report classify exactly the same charts.
import { CASES, buildInput as build, computeChainNp } from './battery-charts';

for (const c of CASES) {
  test(`identity battery · ${c.name}`, () => {
    const p1 = build('p1', 'P1', '2026-04-01', c.openingRE, c.p1);
    const closingRE1 = c.openingRE + computeChainNp(p1); // p2 opening RE = p1 closing RE
    const p2 = build('p2', 'P2', '2026-05-01', closingRE1, c.p2);
    const [r1, r2] = computeChain([p1, p2]);
    const inv = checkInvariants(p2, r2, { input: p1, result: r1 });
    // ALL four identities must hold (true by definition for a correct engine on articulating data)
    for (const x of inv) assert.notEqual(x.status, 'fail', `${c.name}: ${x.id} must not fail — ${x.detail}`);
    assert.equal(inv.find((x) => x.id === 'bs_identity')!.status, 'pass', `${c.name}: BS identity`);
    assert.equal(inv.find((x) => x.id === 'tb_integrity')!.status, 'pass', `${c.name}: TB integrity`);
    assert.equal(inv.find((x) => x.id === 'cash_tie_out')!.status, 'pass', `${c.name}: cash tie-out`);
    assert.equal(inv.find((x) => x.id === 'pl_to_equity')!.status, 'pass', `${c.name}: RE roll`);
    // PERTURBATION: corrupt a non-cash line by X → cash tie breaks by EXACTLY X (proves the check is live)
    const X = 1234500; // ₹12,345
    const corrupted = perturbNatural(p2, 'trade_receivables', X, 'debit');
    const rc = computeChain([p1, corrupted])[1];
    const invc = checkInvariants(corrupted, rc, { input: p1, result: r1 });
    const tie = invc.find((x) => x.id === 'cash_tie_out')!;
    assert.equal(tie.status, 'fail', `${c.name}: perturbation must break cash tie`);
    assert.equal(Math.abs(tie.deltaPaise!), X, `${c.name}: cash tie breaks by EXACTLY the corruption`);
  });
}
