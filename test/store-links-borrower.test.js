// Task 3a — store, persistence, audit/notifications, link model, borrower session. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSeedState, HEROES } from '../src/data/seed.js';
import { createStore, safeLocalStorage, nowOf, STORAGE_KEY } from '../src/core/store.js';
import { sendPaymentLink, revokeLink, expireRequestNow, cancelRequest, resolveToken } from '../src/core/actions/links.js';
import { openByToken, openByRef, sendOtp, verifyOtp, exitBorrower, borrowerScreen, expireOtpNow } from '../src/core/actions/borrower.js';
import { currentArrangement, currentOpenRequest } from '../src/core/selectors.js';
import { DEMO_NOW, addDays } from '../src/core/clock.js';

const SEED = createSeedState();
const seed = () => structuredClone(SEED);
const hero = (k) => HEROES.find((h) => h.key === k);
function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const throwing = () => ({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } });
const mk = (storage = memStorage()) => createStore({ storage, seed });
const setRole = (store, role) => store.set((d) => { d.role = role; });
/** Open a hero's link and pass OTP. */
function verifyHero(store, key) {
  assert.equal(openByToken(store, hero(key).token).ok, true);
  const sent = sendOtp(store);
  assert.equal(sent.ok, true, JSON.stringify(sent));
  const v = verifyOtp(store, sent.code);
  assert.equal(v.ok, true, JSON.stringify(v));
  return sent;
}

test('test_storage_unavailable', () => {
  const s1 = createStore({ storage: throwing(), seed });
  assert.equal(s1.persistent, false);
  s1.set((d) => { d.role = 'agent'; });
  assert.equal(s1.get().role, 'agent');
  const s2 = createStore({ storage: null, seed });
  assert.equal(s2.persistent, false);
  s2.set((d) => { d.view = 'borrower'; }, { action: 'test.noop', target: 'x' });
  assert.equal(s2.get().view, 'borrower');
  assert.equal(s2.get().audit.at(-1).action, 'test.noop');
  // storage that works on probe but fails on the big write (quota) → falls back to memory, no throw
  const quota = memStorage();
  const realSet = quota.setItem;
  quota.setItem = (k, v) => { if (String(v).length > 1000) throw new Error('QuotaExceededError'); return realSet(k, v); };
  const s3 = createStore({ storage: quota, seed });
  s3.set((d) => { d.role = 'finance'; });
  assert.equal(s3.get().role, 'finance');
  assert.equal(s3.persistent, false);
  // safeLocalStorage never throws (Node has no usable localStorage here)
  assert.doesNotThrow(() => safeLocalStorage());
  // corrupt stored JSON → fresh seed, no crash
  const bad = memStorage();
  bad.setItem(STORAGE_KEY, '{not json');
  assert.equal(createStore({ storage: bad, seed }).get().version, 1);
});

test('test_store_basics', () => {
  const st = mk();
  assert.equal(st.persistent, true);
  let calls = 0;
  const un = st.subscribe(() => { calls += 1; });
  st.set((d) => { d.role = 'supervisor'; }, { action: 'a.one', target: 't1' });
  st.set((d) => { d.role = 'agent'; }, { action: 'a.two', target: 't2' });
  un();
  st.set((d) => { d.role = 'admin'; });
  assert.equal(calls, 2);
  const [a1, a2] = st.get().audit.slice(-2);
  assert.ok(a1.at > DEMO_NOW && a2.at > a1.at, 'audit times are DEMO_NOW-based and increase');
  assert.equal(a1.role, 'supervisor');
  assert.equal(a2.role, 'agent');
  assert.ok(a1.id !== a2.id);
  // a mutator that throws leaves state unchanged
  const before = JSON.stringify(st.get());
  assert.throws(() => st.set((d) => { d.role = 'finance'; throw new Error('boom'); }));
  assert.equal(JSON.stringify(st.get()), before);
  // notify
  const n0 = st.get().notifications.length;
  st.notify('Hello', '#/m/dashboard');
  assert.equal(st.get().notifications.length, n0 + 1);
  assert.equal(st.get().notifications[0].text, 'Hello');
  assert.equal(st.get().notifications[0].read, false);
  // reset restores the seed
  st.reset();
  assert.deepEqual(st.get(), SEED);
});

test('test_persist_roundtrip_pending', () => {
  const storage = memStorage();
  const s1 = mk(storage);
  verifyHero(s1, 'maria');
  assert.equal(borrowerScreen(s1.get()).screen, 'B3');
  // Simulate "Pay now → pending" at the data level (the checkout actions are Task 3b and are
  // round-tripped again in test/actions.test.js): a pending attempt + the B5 "checking" screen.
  const arr = currentArrangement(s1.get(), hero('maria').accountId);
  const req = currentOpenRequest(s1.get(), arr.id);
  const attemptId = 'MBA-TXN-999999';
  s1.set((d) => {
    d.attempts[attemptId] = { id: attemptId, requestId: req.id, accountId: req.accountId, amount: req.amount, method: 'GCash', outcome: 'pending', status: 'pending', provider: { checkoutSessionId: 'cs_test_999999' }, history: [{ status: 'initiated', at: DEMO_NOW }, { status: 'pending', at: DEMO_NOW }], createdAt: DEMO_NOW };
    d.borrower.screenOverride = 'B5';
    d.borrower.attemptId = attemptId;
  });
  assert.equal(borrowerScreen(s1.get()).screen, 'B5');
  // reload mid-flow: B5 "checking" has no timer after a reload → the pending state shows (B6)
  const s2 = mk(storage);
  assert.equal(s2.get().attempts[attemptId].status, 'pending');
  assert.equal(s2.get().borrower.verified, true);
  assert.equal(borrowerScreen(s2.get()).screen, 'B6');
  assert.equal(borrowerScreen(s2.get()).data.attemptId, attemptId);
  // a fresh session on the same link also lands on Pending after verify
  exitBorrower(s2);
  verifyHero(s2, 'maria');
  assert.equal(borrowerScreen(s2.get()).screen, 'B6');
});

test('test_send_cooldown', () => {
  const st = mk();
  const juan = hero('juan');
  const r1 = sendPaymentLink(st, juan.accountId, 'email');
  assert.equal(r1.ok, true, JSON.stringify(r1));
  assert.equal(r1.token, juan.token);
  assert.equal(r1.url, `https://pay.example/t/${juan.token}`);
  const req = st.get().requests[r1.requestId];
  assert.equal(req.status, 'sent');
  assert.equal(req.deliveries.at(-1).channel, 'email');
  assert.equal(req.deliveries.at(-1).to, 'j•••@example.com');
  const before = JSON.stringify(st.get());
  const r2 = sendPaymentLink(st, juan.accountId, 'email');
  assert.equal(r2.ok, false);
  assert.equal(r2.error, 'cooldown');
  assert.equal(JSON.stringify(st.get()), before, 'a blocked send changes nothing');
  // double-click on Send creates exactly one delivery and no extra request
  assert.equal(st.get().requests[r1.requestId].deliveries.filter((d) => d.channel === 'email').length, 1);
  // the cooldown is per channel
  assert.equal(sendPaymentLink(st, juan.accountId, 'sms').ok, true);
  // audit row written
  assert.ok(st.get().audit.some((a) => a.action === 'request.send' && a.target === r1.requestId));
  // permissions and paused accounts
  setRole(st, 'finance');
  assert.equal(sendPaymentLink(st, hero('maria').accountId, 'sms').error, 'forbidden');
  setRole(st, 'agent');
  assert.equal(sendPaymentLink(st, hero('rosa').accountId, 'sms').error, 'paused');
  assert.equal(sendPaymentLink(st, hero('mark').accountId, 'sms').error, 'no_arrangement');
  assert.equal(sendPaymentLink(st, hero('nina').accountId, 'email').error, 'no_email');
  // Nina's link was revoked: sending again issues a NEW active token
  const rn = sendPaymentLink(st, hero('nina').accountId, 'sms');
  assert.equal(rn.ok, true);
  assert.notEqual(rn.token, hero('nina').token);
  assert.equal(st.get().tokens[rn.token].status, 'active');
});

test('test_expire_now', () => {
  const st = mk();
  const arr = currentArrangement(st.get(), hero('juan').accountId);
  const req = currentOpenRequest(st.get(), arr.id);
  const r = expireRequestNow(st, req.id);
  assert.equal(r.ok, true);
  const s = st.get();
  assert.equal(s.requests[req.id].status, 'expired');
  assert.equal(s.installments[req.installmentId].status, 'overdue');
  const repl = s.requests[r.replacementId];
  assert.ok(repl);
  assert.equal(repl.replacesId, req.id);
  assert.equal(s.requests[req.id].replacedById, repl.id);
  assert.equal(repl.amount, 250000);
  assert.equal(repl.expiresAt, addDays(DEMO_NOW, 5));
  assert.equal(currentOpenRequest(s, arr.id).id, repl.id);
  // expiring an already-expired request is refused
  assert.equal(expireRequestNow(st, req.id).error, 'not_open');
  // the same link still works and shows the overdue amount (never B10)
  verifyHero(st, 'juan');
  const scr = borrowerScreen(st.get());
  assert.equal(scr.screen, 'B3');
  assert.equal(scr.data.amountDue, 250000);
  assert.equal(scr.data.overdue, true);
  assert.equal(scr.data.requestId, repl.id);
  assert.equal(scr.data.dueDate, '2026-12-05');
});

test('test_privacy_pre_otp', () => {
  const st = mk();
  const banned = ['Sample Bank', '2,500', '250000', 'MBA-REF', 'Juan', '15,000'];
  const check = (scr, want) => {
    assert.equal(scr.screen, want);
    const json = JSON.stringify(scr.data);
    for (const b of banned) assert.ok(!json.includes(b), `${want} leaks ${b}: ${json}`);
    assert.deepEqual(Object.keys(scr.data).sort(), ['error', 'maskedMobile', 'otp']);
  };
  openByToken(st, hero('juan').token);
  check(borrowerScreen(st.get()), 'B1');
  assert.equal(borrowerScreen(st.get()).data.maskedMobile, '••••7310');
  const sent = sendOtp(st);
  assert.equal(sent.maskedMobile, '••••7310');
  assert.match(sent.code, /^\d{6}$/);
  check(borrowerScreen(st.get()), 'B2');
  assert.ok(!JSON.stringify(borrowerScreen(st.get())).includes(sent.code), 'screen data never carries the code');
  verifyOtp(st, '000000' === sent.code ? '111111' : '000000');
  const b2 = borrowerScreen(st.get());
  check(b2, 'B2');
  assert.equal(b2.data.error, 'wrong');
  // B0 has nothing at all
  exitBorrower(st);
  assert.equal(borrowerScreen(st.get()).screen, 'B0');
});

test('test_otp_paths', () => {
  const st = mk();
  openByToken(st, hero('juan').token);
  const { code } = sendOtp(st);
  const wrong = code === '123456' ? '654321' : '123456';
  // resend before the cooldown is blocked, and changes nothing
  const before = JSON.stringify(st.get());
  const rs = sendOtp(st);
  assert.equal(rs.ok, false);
  assert.equal(rs.error, 'cooldown');
  assert.equal(JSON.stringify(st.get()), before);
  // wrong code → 'wrong' (4 times), the 5th → 'locked' → B12
  for (let i = 1; i <= 4; i++) {
    const v = verifyOtp(st, wrong);
    assert.equal(v.error, 'wrong');
    assert.equal(v.attemptsLeft, 5 - i);
  }
  assert.equal(verifyOtp(st, wrong).error, 'locked');
  assert.equal(borrowerScreen(st.get()).screen, 'B12');
  assert.ok(borrowerScreen(st.get()).data.lockedUntil > DEMO_NOW);
  // even the right code is refused while locked
  assert.equal(verifyOtp(st, code).error, 'locked');
  assert.equal(sendOtp(st).error, 'locked');

  // expired code is rejected; after expiry a resend is allowed and the new code works once
  const st2 = mk();
  openByToken(st2, hero('juan').token);
  const first = sendOtp(st2);
  assert.equal(expireOtpNow(st2).ok, true);
  assert.equal(verifyOtp(st2, first.code).error, 'expired');
  assert.equal(borrowerScreen(st2.get()).data.error, 'expired');
  const second = sendOtp(st2);
  assert.equal(second.ok, true);
  assert.equal(verifyOtp(st2, second.code).ok, true);
  assert.equal(borrowerScreen(st2.get()).screen, 'B3');
  assert.equal(st2.get().borrower.otp.code, null, 'codes are single-use');
  // verify with no code requested
  const st3 = mk();
  openByToken(st3, hero('juan').token);
  assert.equal(verifyOtp(st3, '123456').error, 'no_code');
});

test('test_enumeration', () => {
  const st = mk();
  const r = openByRef(st, 'MBA-REF-2026-999999');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r), ['ok']);
  const scr = borrowerScreen(st.get());
  assert.equal(scr.screen, 'B1');
  assert.equal(scr.data.maskedMobile, '••••');
  const sent = sendOtp(st);
  assert.deepEqual({ ok: sent.ok, code: sent.code }, { ok: true, code: null });
  assert.equal(borrowerScreen(st.get()).screen, 'B2');
  assert.equal(verifyOtp(st, '123456').error, 'wrong');
  // a real reference behaves the same up to the SMS (and binds the active link)
  exitBorrower(st);
  assert.deepEqual(openByRef(st, '  mba-ref-2026-004821 '), { ok: true });
  assert.equal(st.get().borrower.token, hero('juan').token);
  assert.equal(borrowerScreen(st.get()).data.maskedMobile, '••••7310');
  const s2 = sendOtp(st);
  assert.match(s2.code, /^\d{6}$/);
  assert.equal(verifyOtp(st, s2.code).ok, true);
  assert.equal(borrowerScreen(st.get()).screen, 'B3');
});

test('test_revoked_and_disputed', () => {
  const st = mk();
  openByToken(st, hero('nina').token);
  assert.equal(borrowerScreen(st.get()).screen, 'B10');
  exitBorrower(st);
  verifyHero(st, 'rosa');
  const b11 = borrowerScreen(st.get());
  assert.equal(b11.screen, 'B11');
  assert.equal(b11.data.reason, 'disputed');
  // Mark (reference entry, no arrangement) → B11 'none'
  exitBorrower(st);
  openByRef(st, hero('mark').ref);
  const mc = sendOtp(st);
  assert.equal(mc.maskedMobile, '••••6604');
  verifyOtp(st, mc.code);
  assert.equal(borrowerScreen(st.get()).screen, 'B11');
  assert.equal(borrowerScreen(st.get()).data.reason, 'none');
  // Ben (defaulted) → B11
  exitBorrower(st);
  verifyHero(st, 'ben');
  assert.equal(borrowerScreen(st.get()).screen, 'B11');
  // unknown token → B10
  exitBorrower(st);
  openByToken(st, 'not-a-real-token');
  assert.equal(borrowerScreen(st.get()).screen, 'B10');
  assert.equal(resolveToken(st.get(), 'not-a-real-token').status, 'unknown');
  // revoking Juan's link from MBA view → B10 for the borrower on that link
  exitBorrower(st);
  verifyHero(st, 'juan');
  assert.equal(revokeLink(st, hero('juan').accountId).ok, true);
  assert.equal(borrowerScreen(st.get()).screen, 'B10');
  assert.equal(revokeLink(st, hero('juan').accountId).error, 'no_token');
});

test('test_open_by_token_marks_opened', () => {
  const st = mk();
  const arr = currentArrangement(st.get(), hero('maria').accountId);
  const req = currentOpenRequest(st.get(), arr.id);
  assert.equal(req.status, 'sent');
  openByToken(st, hero('maria').token);
  assert.equal(st.get().requests[req.id].status, 'opened');
  assert.ok(st.get().audit.some((a) => a.action === 'link.opened' && a.accountId === hero('maria').accountId && a.role === 'borrower'));
  // re-opening the same link keeps a verified session (reload mid-flow)
  const s = sendOtp(st);
  verifyOtp(st, s.code);
  openByToken(st, hero('maria').token);
  assert.equal(st.get().borrower.verified, true);
  // opening a different link starts a fresh session
  openByToken(st, hero('juan').token);
  assert.equal(st.get().borrower.verified, false);
});

test('test_cancel_request_and_clock', () => {
  const st = mk();
  const arr = currentArrangement(st.get(), hero('juan').accountId);
  const req = currentOpenRequest(st.get(), arr.id);
  setRole(st, 'agent');
  assert.equal(cancelRequest(st, req.id).error, 'forbidden');
  setRole(st, 'supervisor');
  assert.equal(cancelRequest(st, req.id).ok, true);
  assert.equal(st.get().requests[req.id].status, 'cancelled');
  assert.equal(cancelRequest(st, req.id).error, 'not_open');
  // nowOf advances with each stamped mutation, starting at DEMO_NOW
  assert.ok(nowOf(st.get()) > DEMO_NOW);
  assert.equal(nowOf(SEED), DEMO_NOW);
});
