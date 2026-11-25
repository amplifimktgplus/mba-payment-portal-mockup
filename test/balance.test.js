// Review fix (blocking): the MBA view's account balance must agree with what the borrower sees and
// with the account's status (D§3 anti-goal "Numbers disagree across screens"). Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSeedState, HEROES } from '../src/data/seed.js';
import { createStore } from '../src/core/store.js';
import * as A from '../src/core/actions/index.js';
import { accountBalance, arrangementProgress, currentArrangement, IN_FORCE_ARRANGEMENT } from '../src/core/selectors.js';

const SEED = createSeedState();
const hero = (k) => HEROES.find((h) => h.key === k);
const mk = () => createStore({ storage: null, seed: () => structuredClone(SEED) });
const vals = (m) => Object.values(m);

function payNext(st, key) {
  assert.equal(A.openByToken(st, hero(key).token).ok, true);
  assert.equal(A.verifyOtp(st, A.sendOtp(st).code).ok, true);
  const b3 = A.borrowerScreen(st.get());
  assert.equal(b3.screen, 'B3');
  assert.equal(A.beginCheckout(st).ok, true);
  const r = A.startCheckout(st, { method: 'GCash', outcome: 'success' });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(A.deliverWebhook(st, r.attemptId, 'paid').ok, true);
  return { b3, after: A.borrowerScreen(st.get()) };
}

test('test_balance_invariants_every_seeded_account', () => {
  let settled = 0;
  for (const acc of vals(SEED.accounts)) {
    const b = accountBalance(SEED, acc.id);
    assert.equal(b.placed - b.paid - b.discount + b.credit, b.current, `identity ${acc.id}`);
    assert.ok(b.discount >= 0 && b.credit >= 0 && b.current >= 0, `non-negative ${acc.id} ${JSON.stringify(b)}`);
    const arr = currentArrangement(SEED, acc.id);
    if (arr && IN_FORCE_ARRANGEMENT.includes(arr.status)) {
      assert.equal(b.current, arrangementProgress(SEED, arr.id).remaining, `current = arrangement remaining ${acc.id}`);
    } else {
      assert.equal(b.discount, 0, `no discount without an arrangement in force ${acc.id}`);
    }
    if (acc.status === 'settled') { settled++; assert.equal(b.current, 0, `settled ${acc.id} must read ₱0.00`); }
  }
  assert.ok(settled >= 20, `expected the seeded settled accounts, got ${settled}`);
  // the open duplicate payment (E2) is shown as unapplied credit, not as a negative balance
  assert.ok(vals(SEED.accounts).some((a) => accountBalance(SEED, a.id).credit > 0));
});

test('test_balance_matches_borrower_juan', () => {
  const st = mk();
  const id = hero('juan').accountId;
  const { b3, after } = payNext(st, 'juan');
  assert.equal(b3.data.remaining, 1000000);
  assert.equal(after.screen, 'B8');
  const bal = accountBalance(st.get(), id);
  assert.equal(after.data.remaining, 750000);
  assert.equal(bal.current, after.data.remaining, 'MBA current balance = borrower B8 remaining');
  assert.equal(bal.discount, 350000);
  assert.equal(bal.placed - bal.paid - bal.discount, bal.current);
});

test('test_settled_ana_reads_zero', () => {
  const st = mk();
  const id = hero('ana').accountId;
  assert.equal(accountBalance(st.get(), id).current, 500000);
  const { after } = payNext(st, 'ana');
  assert.equal(after.screen, 'B9');
  const s = st.get();
  assert.equal(s.accounts[id].status, 'settled');
  assert.equal(currentArrangement(s, id).status, 'completed');
  const bal = accountBalance(s, id);
  assert.deepEqual({ placed: bal.placed, paid: bal.paid, discount: bal.discount, current: bal.current, agreed: bal.agreed },
    { placed: 2600000, paid: 2000000, discount: 600000, current: 0, agreed: 2000000 });
});

test('test_over_balance_refused', () => {
  const st = mk();
  A.setRole(st, 'supervisor');
  const before = JSON.stringify(st.get());
  // Mark owes ₱8,800.00 with nothing paid
  const c = A.createArrangement(st, 'ac_mark', { total: 900000, count: 3, firstDue: '2026-12-10' });
  assert.equal(c.error, 'over_balance');
  // Juan: ₱5,000 paid on the lineage + ₱13,500 still owed = ₱18,500 max
  const juanArr = currentArrangement(st.get(), hero('juan').accountId);
  assert.equal(A.reviseArrangement(st, juanArr.id, { total: 1850001, count: 4, firstDue: '2026-12-15' }).error, 'over_balance');
  assert.equal(JSON.stringify(st.get()), before, 'refusals do not change state');
  assert.equal(A.reviseArrangement(st, juanArr.id, { total: 1850000, count: 4, firstDue: '2026-12-15' }).ok, true);
  const bal = accountBalance(st.get(), hero('juan').accountId);
  assert.equal(bal.discount, 0);
  assert.equal(bal.current, 1350000);
});
