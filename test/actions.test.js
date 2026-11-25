// Task 3b — payments pipeline, accounts, arrangements, reconciliation, imports. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSeedState, HEROES } from '../src/data/seed.js';
import { createStore } from '../src/core/store.js';
import * as A from '../src/core/actions/index.js';
import { kpis, arrangementProgress, currentArrangement, currentOpenRequest, installmentsOf } from '../src/core/selectors.js';
import { DEMO_NOW } from '../src/core/clock.js';

const SEED = createSeedState();
const seed = () => structuredClone(SEED);
const hero = (k) => HEROES.find((h) => h.key === k);
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const mk = (storage = null) => createStore({ storage, seed });
const setRole = (st, role) => A.setRole(st, role);
const vals = (m) => Object.values(m);
function verify(st, key) {
  assert.equal(A.openByToken(st, hero(key).token).ok, true);
  const s = A.sendOtp(st);
  assert.equal(A.verifyOtp(st, s.code).ok, true);
}
function pay(st, key, outcome = 'success', method = 'GCash') {
  verify(st, key);
  assert.equal(A.borrowerScreen(st.get()).screen, 'B3');
  assert.equal(A.beginCheckout(st).ok, true);
  assert.equal(A.borrowerScreen(st.get()).screen, 'B4');
  const r = A.startCheckout(st, { method, outcome });
  assert.equal(r.ok, true, JSON.stringify(r));
  return r.attemptId;
}

test('test_happy_path_juan', () => {
  const st = mk();
  const before = kpis(st.get()).collectedThisMonth;
  const arr = currentArrangement(st.get(), hero('juan').accountId);
  const inst3 = installmentsOf(st.get(), arr.id)[2];
  const nPays = vals(st.get().payments).length;
  const id = pay(st, 'juan');
  // payment truth: nothing is paid until the webhook pipeline runs
  assert.equal(st.get().attempts[id].status, 'pending');
  assert.equal(st.get().installments[inst3.id].status, 'due');
  assert.equal(vals(st.get().payments).length, nPays);
  assert.equal(A.borrowerScreen(st.get()).screen, 'B5');
  const w = A.deliverWebhook(st, id, 'paid');
  assert.equal(w.ok, true);
  const s = st.get();
  assert.equal(s.installments[inst3.id].status, 'paid');
  const p = arrangementProgress(s, arr.id);
  assert.equal(p.paid, 750000);
  assert.equal(p.paidCount, 3);
  assert.equal(p.next.dueDate, '2027-01-05');
  const scr = A.borrowerScreen(s);
  assert.equal(scr.screen, 'B8');
  assert.equal(scr.data.attempt.attemptId, id);
  assert.equal(scr.data.attempt.amount, 250000);
  assert.equal(scr.data.remaining, 750000);
  assert.equal(kpis(s).collectedThisMonth, before + 250000);
  const pm = vals(s.payments).find((x) => x.attemptId === id);
  assert.deepEqual({ gross: pm.gross, fee: pm.fee, net: pm.net, method: pm.method, reconciled: pm.reconciled }, { gross: 250000, fee: 6250, net: 243750, method: 'GCash', reconciled: false });
  assert.match(s.attempts[id].provider.checkoutSessionId, /^cs_test_\d+$/);
  assert.match(s.attempts[id].provider.paymentId, /^pay_test_\d+$/);
  assert.equal(id, 'MBA-TXN-004217');
  const ev = vals(s.webhookEvents).find((e) => e.attemptId === id);
  assert.deepEqual(ev.steps.map((x) => x.name), ['received', 'signature_valid', 'not_duplicate', 'verified_api', 'posted']);
  assert.ok(ev.steps.every((x) => x.ok));
  assert.equal(s.notifications[0].text, 'Payment verified: Juan D. ₱2,500.00');
  assert.equal(s.arrangements[arr.id].status, 'partially_paid');
  // the next installment's request is created automatically (V3 §8.1)
  const next = currentOpenRequest(s, arr.id);
  assert.equal(s.installments[next.installmentId].seq, 4);
  // back to the arrangement: next installment due Jan 5
  A.clearScreenOverride(st);
  const b3 = A.borrowerScreen(st.get());
  assert.equal(b3.screen, 'B3');
  assert.equal(b3.data.dueDate, '2027-01-05');
  assert.equal(b3.data.amountDue, 250000);
});

test('test_one_active_attempt', () => {
  const st = mk();
  const id = pay(st, 'maria', 'pending');
  const again = A.startCheckout(st, { method: 'Maya', outcome: 'success' });
  assert.equal(again.ok, false);
  assert.equal(again.error, 'pending_exists');
  const pend = vals(st.get().attempts).filter((a) => a.accountId === hero('maria').accountId && a.status === 'pending');
  assert.equal(pend.length, 1);
  assert.equal(pend[0].id, id);
  A.clearScreenOverride(st);
  assert.equal(A.borrowerScreen(st.get()).screen, 'B6');
  assert.equal(A.beginCheckout(st).error, 'pending_exists');
  // bad inputs are refused without side effects
  const st2 = mk();
  verify(st2, 'juan');
  A.beginCheckout(st2);
  assert.equal(A.startCheckout(st2, { method: 'Bitcoin', outcome: 'success' }).error, 'bad_method');
  assert.equal(A.startCheckout(st2, { method: 'GCash', outcome: 'maybe' }).error, 'bad_outcome');
});

test('test_replay_no_repost', () => {
  const st = mk();
  const id = pay(st, 'juan');
  A.deliverWebhook(st, id, 'paid');
  const s1 = st.get();
  const nPays = vals(s1.payments).length;
  const k1 = kpis(s1);
  const ev = vals(s1.webhookEvents).find((e) => e.attemptId === id);
  const r = A.replayWebhook(st, ev.id);
  assert.deepEqual({ ok: r.ok, duplicate: r.duplicate }, { ok: true, duplicate: true });
  const s2 = st.get();
  assert.equal(vals(s2.payments).length, nPays);
  assert.deepEqual(kpis(s2), k1);
  const dup = s2.webhookEvents[r.eventId];
  assert.equal(dup.duplicateOf, ev.id);
  assert.ok(dup.steps.some((x) => x.name === 'duplicate_ignored'));
  // a second delivery for an already-final attempt is refused, nothing changes
  const json = JSON.stringify(st.get().payments);
  assert.equal(A.deliverWebhook(st, id, 'paid').error, 'not_pending');
  assert.equal(JSON.stringify(st.get().payments), json);
  assert.equal(A.replayWebhook(st, 'evt_nope').error, 'not_found');
});

test('test_ana_settles', () => {
  const st = mk();
  const id = pay(st, 'ana');
  A.deliverWebhook(st, id, 'paid');
  const s = st.get();
  const arr = currentArrangement(s, hero('ana').accountId);
  assert.equal(arr.status, 'completed');
  assert.equal(s.accounts[hero('ana').accountId].status, 'settled');
  assert.equal(A.borrowerScreen(s).screen, 'B9');
  assert.ok(s.audit.some((a) => a.action === 'automation.settled' && a.accountId === hero('ana').accountId));
  // reopening the link later still shows Settled (read-only window)
  A.clearScreenOverride(st);
  assert.equal(A.borrowerScreen(st.get()).screen, 'B9');
  assert.equal(A.resolveToken(st.get(), hero('ana').token).status, 'active');
});

test('test_send_link_refused_when_nothing_to_collect', () => {
  // Completed (Ana after her final payment, a seeded Settled account) and defaulted (Ben):
  // sendPaymentLink refuses with the standard failure shape and changes nothing.
  const st = mk();
  const id = pay(st, 'ana');
  A.deliverWebhook(st, id, 'paid');
  const settled = vals(st.get().accounts).find((a) => a.status === 'settled' && a.id !== hero('ana').accountId);
  assert.ok(settled, 'seed has a settled account');
  assert.equal(currentArrangement(st.get(), settled.id).status, 'completed');
  assert.equal(currentArrangement(st.get(), hero('ben').accountId).status, 'defaulted');
  for (const accountId of [hero('ana').accountId, settled.id, hero('ben').accountId]) {
    for (const channel of ['sms', 'email']) {
      const before = JSON.stringify(st.get());
      const r = A.sendPaymentLink(st, accountId, channel);
      assert.equal(r.ok, false, `${accountId} ${channel}: ${JSON.stringify(r)}`);
      assert.equal(typeof r.error, 'string');
      assert.equal(typeof r.message, 'string');
      assert.equal(JSON.stringify(st.get()), before, `${accountId} ${channel}: state must not change`);
    }
  }
  // Accounts that need a link still get one: an active plan (Juan) and a partially paid one (Maria).
  assert.equal(A.sendPaymentLink(st, hero('juan').accountId, 'sms').ok, true);
  assert.equal(A.sendPaymentLink(st, hero('maria').accountId, 'sms').ok, true);
});

test('test_refund_reopens', () => {
  const st = mk();
  const id = pay(st, 'ana');
  A.deliverWebhook(st, id, 'paid');
  const payment = vals(st.get().payments).find((p) => p.attemptId === id);
  const k0 = kpis(st.get()).collectedThisMonth;
  assert.equal(A.refundPayment(st, payment.id).error, 'forbidden'); // admin
  setRole(st, 'finance');
  const r = A.refundPayment(st, payment.id);
  assert.equal(r.ok, true);
  const s = st.get();
  const arr = currentArrangement(s, hero('ana').accountId);
  assert.equal(arr.status, 'partially_paid');
  assert.notEqual(s.accounts[hero('ana').accountId].status, 'settled');
  assert.equal(s.accounts[hero('ana').accountId].status, 'arrangement_active');
  assert.equal(s.payments[payment.id].refunded, true);
  assert.equal(s.attempts[id].status, 'refunded');
  const last = installmentsOf(s, arr.id).at(-1);
  assert.ok(['due', 'overdue'].includes(last.status));
  assert.equal(currentOpenRequest(s, arr.id).installmentId, last.id);
  assert.equal(kpis(s).collectedThisMonth, k0 - 500000);
  assert.equal(A.refundPayment(st, payment.id).error, 'already_refunded');
  // the borrower can pay again
  A.exitBorrower(st);
  verify(st, 'ana');
  assert.equal(A.borrowerScreen(st.get()).screen, 'B3');
});

test('test_forbidden_action_no_mutation', () => {
  const st = mk();
  setRole(st, 'agent');
  const pendingArr = vals(st.get().arrangements).find((a) => a.status === 'pending_approval');
  const before = JSON.stringify(st.get());
  const r = A.approveArrangement(st, pendingArr.id);
  assert.deepEqual({ ok: r.ok, error: r.error }, { ok: false, error: 'forbidden' });
  assert.equal(r.message, 'Requires Supervisor');
  assert.equal(JSON.stringify(st.get()), before);
  // more role checks, none of which may change state
  const juanArr = currentArrangement(st.get(), hero('juan').accountId);
  const pay0 = vals(st.get().payments)[0];
  const exc0 = vals(st.get().exceptions).find((e) => e.status === 'open');
  const checks = [
    () => A.rejectArrangement(st, pendingArr.id, 'no'),
    () => A.reviseArrangement(st, juanArr.id, { total: 1500000, count: 4, firstDue: '2026-12-15' }),
    () => A.cancelArrangement(st, juanArr.id),
    () => A.refundPayment(st, pay0.id),
    () => A.resolveException(st, exc0.id, 'note'),
    () => A.addCreditor(st, { name: 'X', commissionPct: 10 }),
    () => A.importSample(st, 'pf_tdb', 'clean'),
    () => A.assignAccount(st, 'ac_ben', 'ag_1'),
    () => A.holdAccount(st, 'ac_ben', '2026-12-10'),
    () => A.cancelRequest(st, currentOpenRequest(st.get(), juanArr.id).id),
  ];
  for (const f of checks) assert.equal(f().error, 'forbidden');
  setRole(st, 'finance');
  const b2 = JSON.stringify(st.get());
  assert.equal(A.logContactAttempt(st, 'ac_mark', { channel: 'call', outcome: 'contacted', note: 'x' }).error, 'forbidden');
  assert.equal(A.createArrangement(st, 'ac_mark', { total: 400000, count: 4, firstDue: '2026-12-10' }).error, 'forbidden');
  assert.equal(JSON.stringify(st.get()), b2);
});

test('test_revise_keeps_token', () => {
  const st = mk();
  // a pending attempt on the old version gets cancelled by the revision
  const pend = pay(st, 'juan', 'pending');
  setRole(st, 'supervisor');
  const old = currentArrangement(st.get(), hero('juan').accountId);
  const oldReq = currentOpenRequest(st.get(), old.id);
  const r = A.reviseArrangement(st, old.id, { total: 1500000, count: 5, firstDue: '2026-12-15' });
  assert.equal(r.ok, true, JSON.stringify(r));
  const s = st.get();
  assert.equal(s.arrangements[old.id].status, 'superseded');
  const nu = s.arrangements[r.arrangementId];
  assert.ok(['active', 'partially_paid'].includes(nu.status));
  assert.equal(nu.lineageId, old.lineageId);
  assert.equal(nu.version, 2);
  assert.equal(s.requests[oldReq.id].status, 'cancelled');
  assert.equal(s.attempts[pend].status, 'cancelled');
  const p = arrangementProgress(s, nu.id);
  assert.equal(p.paid, 500000);
  assert.equal(p.total, 1500000);
  assert.equal(p.count, 7);
  assert.equal(p.next.amount, 200000);
  assert.equal(p.next.dueDate, '2026-12-15');
  // same token, now resolving to the new version
  const res = A.resolveToken(s, hero('juan').token);
  assert.equal(res.status, 'active');
  assert.equal(res.arrangementId, nu.id);
  assert.equal(vals(s.tokens).filter((t) => t.lineageId === old.lineageId).length, 1);
  // the borrower sees the new amount
  A.exitBorrower(st);
  verify(st, 'juan');
  const b3 = A.borrowerScreen(st.get());
  assert.equal(b3.screen, 'B3');
  assert.equal(b3.data.amountDue, 200000);
  assert.equal(b3.data.arrangementId, nu.id);
  // revising a superseded version is refused; a total below paid-to-date too
  assert.equal(A.reviseArrangement(st, old.id, { total: 1500000, count: 5, firstDue: '2026-12-15' }).error, 'not_revisable');
  assert.equal(A.reviseArrangement(st, nu.id, { total: 400000, count: 2, firstDue: '2026-12-15' }).error, 'bad_total');
});

test('test_import_errors', () => {
  const st = mk();
  const n0 = vals(st.get().accounts).length;
  const r = A.importSample(st, 'pf_tdb', 'errors');
  assert.equal(r.ok, true);
  const batch = st.get().importBatches[r.batchId];
  assert.equal(batch.status, 'partial');
  assert.equal(batch.rows, 12);
  assert.equal(batch.accepted, 9);
  assert.equal(batch.errors.length, 3);
  assert.deepEqual(batch.errors.map((e) => e.field).sort(), ['full_name', 'mobile', 'placed_balance']);
  assert.ok(batch.errors.every((e) => e.values && typeof e.row === 'number'));
  const fresh = vals(st.get().accounts).filter((a) => a.importBatchId === r.batchId);
  assert.equal(fresh.length, 9);
  assert.equal(vals(st.get().accounts).length, n0 + 9);
  assert.ok(fresh.every((a) => a.status === 'new' && a.assigneeId === null && a.portfolioId === 'pf_tdb' && /^MBA-REF-2026-\d{6}$/.test(a.ref)));
  assert.ok(fresh.every((a) => a.borrower.email === null || a.borrower.email.endsWith('@example.com')));
  const clean = A.importSample(st, 'pf_tdb', 'clean');
  assert.equal(st.get().importBatches[clean.batchId].status, 'accepted');
  assert.equal(st.get().importBatches[clean.batchId].accepted, 12);
  // the same file again: every row is a duplicate → rejected, nothing added
  const n1 = vals(st.get().accounts).length;
  const again = A.importSample(st, 'pf_tdb', 'clean');
  assert.equal(st.get().importBatches[again.batchId].status, 'rejected');
  assert.equal(vals(st.get().accounts).length, n1);
  assert.equal(A.TEMPLATE_HEADERS.join(','), 'creditor_account_no,full_name,mobile,placed_balance,currency,chargeoff_date,email');
  assert.equal(A.sampleRows('errors').length, 12);
  assert.equal(A.importSample(st, 'pf_nope', 'clean').error, 'not_found');
});

test('test_resolve_requires_note', () => {
  const st = mk();
  setRole(st, 'finance');
  const e = vals(st.get().exceptions).find((x) => x.status === 'open');
  const before = JSON.stringify(st.get());
  for (const note of ['', '   ', undefined]) {
    const r = A.resolveException(st, e.id, note);
    assert.equal(r.ok, false);
    assert.equal(r.error, 'note_required');
  }
  assert.equal(JSON.stringify(st.get()), before);
  const r = A.resolveException(st, e.id, 'Matched against the provider report.');
  assert.equal(r.ok, true);
  const x = st.get().exceptions[e.id];
  assert.equal(x.status, 'resolved');
  assert.equal(x.resolvedBy, 'finance');
  assert.equal(x.note, 'Matched against the provider report.');
  assert.ok(st.get().audit.some((a) => a.action === 'recon.resolve' && a.target === e.id));
  assert.equal(A.resolveException(st, e.id, 'again').error, 'already_resolved');
});

test('test_failed_then_retry_carlo', () => {
  const st = mk();
  const id = pay(st, 'carlo', 'failed', 'Card');
  A.deliverWebhook(st, id, 'failed');
  assert.equal(st.get().attempts[id].status, 'failed');
  assert.equal(A.borrowerScreen(st.get()).screen, 'B7');
  assert.equal(A.borrowerScreen(st.get()).data.attempt.failureReason, 'Declined by issuer (simulated)');
  assert.equal(vals(st.get().payments).filter((p) => p.attemptId === id).length, 0);
  // retry with another method from B7
  assert.equal(A.beginCheckout(st).ok, true);
  const id2 = A.startCheckout(st, { method: 'GCash', outcome: 'success' }).attemptId;
  A.deliverWebhook(st, id2, 'paid');
  assert.equal(A.borrowerScreen(st.get()).screen, 'B8');
  const req = st.get().attempts[id2].requestId;
  assert.equal(vals(st.get().attempts).filter((a) => a.requestId === req && a.status === 'failed').length, 2);
});

test('test_pending_then_mba_resolves', () => {
  const storage = memStorage();
  const st = mk(storage);
  const id = pay(st, 'maria', 'pending');
  // reload mid-flow → B6; the pending payment stays resolvable from the MBA view
  const st2 = mk(storage);
  assert.equal(A.borrowerScreen(st2.get()).screen, 'B6');
  assert.equal(A.deliverWebhook(st2, id, 'paid').ok, true);
  assert.equal(A.borrowerScreen(st2.get()).screen, 'B8');
  // a webhook for someone else's attempt never changes this borrower's screen
  const st3 = mk();
  verify(st3, 'juan');
  const stale = vals(st3.get().attempts).find((a) => a.status === 'pending' && a.accountId !== hero('juan').accountId);
  A.deliverWebhook(st3, stale.id, 'paid');
  assert.equal(A.borrowerScreen(st3.get()).screen, 'B3');
});

test('test_late_payment_after_expiry', () => {
  const st = mk();
  const id = pay(st, 'juan', 'pending');
  const reqId = st.get().attempts[id].requestId;
  A.expireRequestNow(st, reqId);
  const repl = st.get().requests[reqId].replacedById;
  A.deliverWebhook(st, id, 'paid');
  const s = st.get();
  assert.equal(s.attempts[id].status, 'paid', 'a verified payment is always posted');
  assert.equal(s.requests[repl].status, 'cancelled', 'the replacement closes once the installment is paid');
  assert.ok(vals(s.exceptions).some((e) => e.type === 'late_payment' && e.refs.attemptId === id && e.status === 'open'));
});

test('test_accounts_actions', () => {
  const st = mk();
  const newAcc = vals(st.get().accounts).find((a) => a.status === 'new');
  setRole(st, 'supervisor');
  assert.equal(A.assignAccount(st, newAcc.id, 'ag_nope').error, 'not_found');
  assert.equal(A.assignAccount(st, newAcc.id, 'ag_3').ok, true);
  assert.equal(st.get().accounts[newAcc.id].status, 'assigned');
  assert.equal(st.get().accounts[newAcc.id].assigneeId, 'ag_3');
  setRole(st, 'agent');
  assert.equal(A.logContactAttempt(st, newAcc.id, { channel: 'call', outcome: 'no_contact', note: 'No answer', nextAt: '2026-11-28' }).ok, true);
  assert.equal(st.get().accounts[newAcc.id].status, 'contact_attempted');
  A.logContactAttempt(st, newAcc.id, { channel: 'call', outcome: 'contacted', note: 'Spoke briefly' });
  assert.equal(st.get().accounts[newAcc.id].status, 'contacted');
  A.logContactAttempt(st, newAcc.id, { channel: 'call', outcome: 'agreement', note: 'Agreed' });
  assert.equal(st.get().accounts[newAcc.id].status, 'negotiating');
  assert.equal(A.logContactAttempt(st, newAcc.id, { channel: 'fax', outcome: 'agreement', note: '' }).error, 'bad_channel');
  A.logContactAttempt(st, 'ac_mark', { channel: 'call', outcome: 'dispute', note: 'Disputes the amount' });
  assert.equal(st.get().accounts.ac_mark.status, 'disputed');
  assert.equal(A.escalateAccount(st, 'ac_ben').ok, true);
  assert.equal(st.get().accounts.ac_ben.status, 'escalated');
  assert.equal(A.markDisputed(st, 'ac_carlo', 'Borrower disputes').ok, true);
  assert.equal(st.get().accounts.ac_carlo.status, 'disputed');
  setRole(st, 'supervisor');
  assert.equal(A.holdAccount(st, 'ac_ben', '').error, 'date_required');
  assert.equal(A.holdAccount(st, 'ac_ben', '2026-11-01').error, 'date_in_past');
  assert.equal(A.holdAccount(st, 'ac_ben', '2026-12-10').ok, true);
  assert.equal(st.get().accounts.ac_ben.status, 'on_hold');
  assert.equal(st.get().accounts.ac_ben.holdUntil, '2026-12-10');
  setRole(st, 'admin');
  const c = A.addCreditor(st, { name: 'New Bank (demo)', commissionPct: 12.5 });
  assert.equal(c.ok, true);
  assert.equal(st.get().creditors[c.creditorId].name, 'New Bank (demo)');
  assert.equal(A.addCreditor(st, { name: '  ', commissionPct: 10 }).error, 'name_required');
  assert.equal(A.addCreditor(st, { name: 'New Bank (demo)', commissionPct: 10 }).error, 'exists');
  assert.equal(A.addCreditor(st, { name: 'Other (demo)', commissionPct: 120 }).error, 'bad_commission');
  // every mutation above wrote an audit row
  for (const act of ['account.assign', 'contact.log', 'account.escalate', 'account.dispute', 'account.hold', 'creditor.manage']) {
    assert.ok(st.get().audit.some((a) => a.action === act && a.at > DEMO_NOW), act);
  }
});

test('test_arrangement_lifecycle', () => {
  const st = mk();
  setRole(st, 'agent');
  // Mark owes ₱8,800.00: a total above that is refused (the borrower's remaining and the account's
  // current balance must never disagree); the arrangement below is a ₱600 settlement discount.
  assert.equal(A.createArrangement(st, 'ac_mark', { total: 880001, count: 3, firstDue: '2026-12-10' }).error, 'over_balance');
  const r = A.createArrangement(st, 'ac_mark', { total: 820000, count: 3, firstDue: '2026-12-10' });
  assert.equal(r.ok, true, JSON.stringify(r));
  let arr = st.get().arrangements[r.arrangementId];
  assert.equal(arr.status, 'pending_approval');
  assert.deepEqual(installmentsOf(st.get(), arr.id).map((i) => i.amount), [273333, 273333, 273334]);
  assert.equal(vals(st.get().tokens).filter((t) => t.accountId === 'ac_mark').length, 0, 'no link before approval');
  assert.equal(A.createArrangement(st, 'ac_mark', { total: 820000, count: 3, firstDue: '2026-12-10' }).error, 'exists');
  assert.equal(A.createArrangement(st, 'ac_juan', { total: 0, count: 3, firstDue: '2026-12-10' }).error, 'bad_total');
  setRole(st, 'supervisor');
  assert.equal(A.rejectArrangement(st, arr.id, ' ').error, 'reason_required');
  assert.equal(A.approveArrangement(st, arr.id).ok, true);
  arr = st.get().arrangements[arr.id];
  assert.equal(arr.status, 'active');
  assert.equal(arr.approvedBy, 'supervisor');
  assert.equal(st.get().accounts.ac_mark.status, 'arrangement_active');
  const tok = vals(st.get().tokens).find((t) => t.accountId === 'ac_mark');
  assert.equal(tok.status, 'active');
  const req = currentOpenRequest(st.get(), arr.id);
  assert.equal(req.amount, 273333);
  assert.equal(A.approveArrangement(st, arr.id).error, 'not_pending');
  // Mark can now pay via the new link
  A.openByToken(st, tok.token);
  const code = A.sendOtp(st).code;
  A.verifyOtp(st, code);
  assert.equal(A.borrowerScreen(st.get()).screen, 'B3');
  // attachments keep versions
  const a1 = A.addAttachment(st, arr.id, { filename: 'Signed agreement.pdf', size: 120000 });
  const a2 = A.addAttachment(st, arr.id, { filename: 'Signed agreement.pdf', size: 130000 });
  assert.equal(a1.version, 1);
  assert.equal(a2.version, 2);
  assert.equal(A.addAttachment(st, arr.id, { filename: '', size: 1 }).error, 'filename_required');
  // reject path (another account)
  setRole(st, 'agent');
  const neg = vals(st.get().accounts).find((a) => a.status === 'negotiating' && !currentArrangement(st.get(), a.id));
  const r2 = A.createArrangement(st, neg.id, { total: 600000, count: 6, firstDue: '2026-12-20' });
  setRole(st, 'supervisor');
  assert.equal(A.rejectArrangement(st, r2.arrangementId, 'Too long a schedule').ok, true);
  assert.equal(st.get().arrangements[r2.arrangementId].status, 'draft');
  setRole(st, 'agent');
  assert.equal(A.submitArrangement(st, r2.arrangementId).ok, true);
  assert.equal(st.get().arrangements[r2.arrangementId].status, 'pending_approval');
  // admin/supervisor create directly as active
  setRole(st, 'admin');
  const neg2 = vals(st.get().accounts).find((a) => a.status === 'contacted' && !currentArrangement(st.get(), a.id));
  const r3 = A.createArrangement(st, neg2.id, { total: 900000, count: 3, firstDue: '2026-12-01' });
  assert.equal(st.get().arrangements[r3.arrangementId].status, 'active');
  // cancel revokes the link → B10
  setRole(st, 'supervisor');
  assert.equal(A.cancelArrangement(st, arr.id).ok, true);
  assert.equal(st.get().arrangements[arr.id].status, 'cancelled');
  assert.equal(st.get().tokens[tok.token].status, 'revoked');
  assert.equal(A.borrowerScreen(st.get()).screen, 'B10');
  assert.equal(A.cancelArrangement(st, arr.id).error, 'not_cancellable');
});

test('test_revise_defaulted_ben', () => {
  const st = mk();
  setRole(st, 'supervisor');
  const old = currentArrangement(st.get(), 'ac_ben');
  assert.equal(old.status, 'defaulted');
  const r = A.reviseArrangement(st, old.id, { total: 900000, count: 6, firstDue: '2026-12-10' });
  assert.equal(r.ok, true);
  assert.equal(st.get().accounts.ac_ben.status, 'arrangement_active');
  const p = arrangementProgress(st.get(), r.arrangementId);
  assert.equal(p.paid, 150000);
  assert.equal(p.next.amount, 125000);
  assert.equal(A.resolveToken(st.get(), hero('ben').token).arrangementId, r.arrangementId);
});

test('test_reconciliation_run', () => {
  const st = mk();
  const id = pay(st, 'juan');
  A.deliverWebhook(st, id, 'paid');
  const pm = vals(st.get().payments).find((p) => p.attemptId === id);
  const flagged = new Set(vals(st.get().exceptions).filter((e) => e.status !== 'resolved' && e.refs.paymentId).map((e) => e.refs.paymentId));
  const r = A.runReconciliation(st);
  assert.equal(r.ok, true);
  assert.ok(r.matched >= 1);
  const s = st.get();
  assert.equal(s.payments[pm.id].reconciled, true);
  for (const pid of flagged) assert.equal(s.payments[pid].reconciled, false, `${pid} stays unreconciled while its exception is open`);
  assert.equal(r.exceptions, vals(s.exceptions).filter((e) => e.status !== 'resolved').length);
  assert.equal(A.runReconciliation(st).matched, 0, 'idempotent');
});

test('test_session_helpers', () => {
  const st = mk();
  assert.equal(A.setRole(st, 'finance').ok, true);
  assert.equal(st.get().role, 'finance');
  assert.equal(A.setRole(st, 'ceo').error, 'bad_role');
  A.setView(st, 'borrower');
  assert.equal(st.get().view, 'borrower');
  A.setLastRoute(st, 'mba', '#/m/accounts/ac_juan');
  assert.equal(st.get().lastRoute.mba, '#/m/accounts/ac_juan');
  A.setPendingDelay(st, 'manual');
  assert.equal(st.get().demo.pendingDelay, 'manual');
  assert.equal(A.setPendingDelay(st, 'soon').error, 'bad_value');
  A.markNotificationsRead(st);
  assert.ok(st.get().notifications.every((n) => n.read));
});
