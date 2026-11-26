// 2026-11-26: QR Ph and MariBank joined the payment methods. They appear as borrower tiles with
// logos, in reports and in the transaction filters. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSeedState, HEROES } from '../src/data/seed.js';
import { createStore } from '../src/core/store.js';
import * as A from '../src/core/actions/index.js';
import { POLICIES } from '../src/core/config.js';
import { methodMix } from '../src/core/reports.js';

const SEED = createSeedState();
const mk = () => createStore({ storage: null, seed: () => structuredClone(SEED) });
const hero = (k) => HEROES.find((h) => h.key === k);

function toCheckout(st, key) {
  assert.equal(A.openByToken(st, hero(key).token).ok, true);
  const s = A.sendOtp(st);
  assert.equal(A.verifyOtp(st, s.code).ok, true);
  assert.equal(A.beginCheckout(st).ok, true);
}

test('test_method_list_order', () => {
  // The order of the B4 tiles and of the report colour slots.
  assert.deepEqual([...POLICIES.methods], ['GCash', 'Maya', 'QR Ph', 'Online banking', 'Card', 'MariBank']);
});

test('test_new_methods_pay_and_report', () => {
  for (const method of ['QR Ph', 'MariBank']) {
    const st = mk();
    const before = methodMix(st.get()).find((r) => r.method === method);
    toCheckout(st, 'juan');
    const r = A.startCheckout(st, { method, outcome: 'success' });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(st.get().attempts[r.attemptId].method, method);
    assert.equal(A.deliverWebhook(st, r.attemptId, 'paid').ok, true);
    const row = methodMix(st.get()).find((x) => x.method === method);
    assert.equal(row.count, before.count + 1, `${method} payment counted once`);
    assert.ok(row.amount > before.amount);
  }
});

test('test_unknown_method_refused', () => {
  const st = mk();
  toCheckout(st, 'juan');
  assert.equal(A.startCheckout(st, { method: 'PayPal', outcome: 'success' }).error, 'bad_method');
});
