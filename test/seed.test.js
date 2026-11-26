// Task 2 — data model, seed generator, heroes, selectors. Run: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSeedState, HEROES } from '../src/data/seed.js';
import {
  kpis, portfolioRecovery, arrangementProgress, accountTimeline, paymentHistory,
  currentOpenRequest, currentArrangement, accountBalance,
} from '../src/core/selectors.js';
import { DEMO_NOW, phtDate, phtMonth } from '../src/core/clock.js';

const S = createSeedState();
const vals = (m) => Object.values(m);
const hero = (key) => HEROES.find((h) => h.key === key);
const arrOf = (key) => currentArrangement(S, hero(key).accountId);
const instOf = (arrId) => vals(S.installments).filter((i) => i.arrangementId === arrId).sort((a, b) => a.seq - b.seq);

test('test_deterministic', () => {
  assert.deepEqual(createSeedState(), createSeedState());
  assert.deepEqual(createSeedState(20261126), S);
  assert.notDeepEqual(JSON.stringify(createSeedState(7)), JSON.stringify(S));
});

test('test_shape', () => {
  for (const k of ['creditors', 'portfolios', 'accounts', 'arrangements', 'installments', 'tokens', 'requests',
    'attempts', 'payments', 'webhookEvents', 'contactAttempts', 'attachments', 'importBatches', 'exceptions', 'agents']) {
    assert.equal(typeof S[k], 'object', k);
    assert.ok(!Array.isArray(S[k]), `${k} is a map`);
  }
  assert.equal(S.version, 1);
  assert.equal(S.role, 'admin');
  assert.equal(S.view, 'mba');
  assert.deepEqual(S.lastRoute, { borrower: '#/b', mba: '#/m/dashboard' });
  assert.deepEqual(S.borrower, { token: null, ref: null, verified: false, verifiedAt: null, otp: null, screenOverride: null, error: null, attemptId: null });
  assert.ok(Array.isArray(S.notifications) && Array.isArray(S.audit));
  assert.ok(S.seq.req >= 812 && S.seq.txn >= 4217 && S.seq.ref >= 5000 && S.seq.evt >= 9000);
  // every map is keyed by its record id (tokens by token)
  for (const [k, m] of Object.entries({ accounts: S.accounts, requests: S.requests, attempts: S.attempts, payments: S.payments })) {
    for (const [id, r] of Object.entries(m)) assert.equal(r.id, id, k);
  }
  for (const [t, r] of Object.entries(S.tokens)) assert.equal(r.token, t);
  // seeded IDs never collide with the next IDs the demo will create
  const num = (id) => Number(id.slice(-6));
  assert.ok(vals(S.requests).every((r) => /^MBA-REQ-\d{6}$/.test(r.id) && num(r.id) < S.seq.req));
  assert.ok(vals(S.attempts).every((a) => /^MBA-TXN-\d{6}$/.test(a.id) && num(a.id) < S.seq.txn));
  assert.ok(vals(S.accounts).every((a) => /^MBA-REF-2026-\d{6}$/.test(a.ref) && num(a.ref) < S.seq.ref));
});

test('test_volume_and_coverage', () => {
  const accounts = vals(S.accounts);
  assert.ok(accounts.length >= 400 && accounts.length <= 450, `accounts ${accounts.length}`);
  assert.equal(vals(S.creditors).length, 3);
  assert.deepEqual(vals(S.creditors).map((c) => c.name).sort(), ['Demo Lender (demo)', 'Sample Bank (demo)', 'Telco Demo (demo)']);
  assert.deepEqual(vals(S.portfolios).map((p) => p.name).sort(), ['Demo Lender A', 'Sample Bank Q3', 'Telco Demo B']);
  assert.equal(vals(S.agents).length, 4);
  const cover = (items, field, expected) => {
    const seen = new Set(items.map((x) => x[field]));
    for (const s of expected) assert.ok(seen.has(s), `${field}=${s} missing`);
  };
  cover(accounts, 'status', ['new', 'assigned', 'contact_attempted', 'contacted', 'negotiating', 'arrangement_active', 'settled', 'on_hold', 'disputed', 'escalated', 'uncollectable', 'returned']);
  cover(vals(S.arrangements), 'status', ['draft', 'pending_approval', 'active', 'partially_paid', 'completed', 'defaulted', 'cancelled', 'superseded']);
  cover(vals(S.installments), 'status', ['scheduled', 'due', 'paid', 'overdue', 'missed', 'cancelled']);
  cover(vals(S.tokens), 'status', ['active', 'revoked', 'expired']);
  cover(vals(S.requests), 'status', ['created', 'sent', 'opened', 'paid', 'expired', 'cancelled']);
  cover(vals(S.attempts), 'status', ['initiated', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded']);
  cover(vals(S.contactAttempts), 'outcome', ['no_contact', 'contacted', 'dispute', 'agreement']);
  cover(vals(S.importBatches), 'status', ['accepted', 'partial']);
  // On Hold always has a review date (V3 §6)
  assert.ok(accounts.filter((a) => a.status === 'on_hold').every((a) => a.holdUntil));
  // the original 4 methods appear in history, and every seeded method is a configured one
  // (2026-11-26: QR Ph and MariBank were added; a few seeded attempts now use them)
  const seenMethods = new Set(vals(S.payments).map((p) => p.method));
  for (const m of ['Card', 'GCash', 'Maya', 'Online banking']) assert.ok(seenMethods.has(m), `method ${m} missing from history`);
  for (const m of seenMethods) assert.ok(['GCash', 'Maya', 'QR Ph', 'Online banking', 'Card', 'MariBank'].includes(m), `unknown method ${m}`);
});

test('test_payment_history_window', () => {
  const pays = vals(S.payments);
  assert.ok(pays.length >= 200, `payments ${pays.length}`);
  const months = new Set(pays.map((p) => phtMonth(p.paidAt)));
  assert.deepEqual([...months].sort(), ['2026-09', '2026-10', '2026-11']);
  assert.ok(pays.every((p) => p.paidAt <= DEMO_NOW));
  for (const p of pays) {
    assert.ok(Number.isInteger(p.gross) && Number.isInteger(p.fee) && Number.isInteger(p.net));
    assert.equal(p.net, p.gross - p.fee);
    assert.equal(p.fee, Math.round((p.gross * 2.5) / 100));
    const at = S.attempts[p.attemptId];
    assert.ok(at, `attempt for ${p.id}`);
    assert.ok(at.status === 'paid' || at.status === 'refunded');
  }
});

test('test_referential_integrity', () => {
  for (const i of vals(S.installments)) {
    assert.ok(S.arrangements[i.arrangementId], `inst ${i.id}`);
    if (i.status === 'paid') assert.ok(S.payments[i.paymentId], `paid inst ${i.id} has payment`);
  }
  for (const r of vals(S.requests)) {
    assert.ok(S.installments[r.installmentId] && S.arrangements[r.arrangementId] && S.accounts[r.accountId], r.id);
    if (r.replacedById) assert.equal(S.requests[r.replacedById].replacesId, r.id);
  }
  for (const a of vals(S.attempts)) assert.ok(S.requests[a.requestId] && S.accounts[a.accountId], a.id);
  for (const e of vals(S.webhookEvents)) assert.ok(S.attempts[e.attemptId], e.id);
  for (const t of vals(S.tokens)) assert.ok(S.accounts[t.accountId], t.token);
  for (const ar of vals(S.arrangements)) {
    const parts = instOf(ar.id);
    assert.equal(parts.length, ar.count, `count ${ar.id}`);
    assert.equal(parts.reduce((s, i) => s + i.amount, 0), ar.total, `sum ${ar.id}`);
  }
  // at most one open request per arrangement, and at most one pending attempt per request
  const open = vals(S.requests).filter((r) => ['created', 'sent', 'opened'].includes(r.status));
  const perArr = {};
  for (const r of open) perArr[r.arrangementId] = (perArr[r.arrangementId] || 0) + 1;
  assert.ok(Object.values(perArr).every((n) => n === 1));
  const pendPerReq = {};
  for (const a of vals(S.attempts).filter((x) => x.status === 'pending')) pendPerReq[a.requestId] = (pendPerReq[a.requestId] || 0) + 1;
  assert.ok(Object.values(pendPerReq).every((n) => n === 1));
});

test('test_heroes', () => {
  assert.deepEqual(HEROES.map((h) => h.key), ['juan', 'maria', 'carlo', 'ana', 'luis', 'nina', 'rosa', 'mark', 'ben']);
  for (const h of HEROES) {
    const acc = S.accounts[h.accountId];
    assert.ok(acc, h.key);
    assert.equal(acc.ref, h.ref);
    assert.ok(h.label);
    if (h.token) assert.equal(S.tokens[h.token].accountId, h.accountId);
  }
  const juan = S.accounts[hero('juan').accountId];
  assert.equal(juan.ref, 'MBA-REF-2026-004821');
  assert.ok(juan.borrower.mobile.endsWith('7310'));
  assert.equal(S.creditors[juan.creditorId].name, 'Sample Bank (demo)');
  assert.equal(S.portfolios[juan.portfolioId].name, 'Sample Bank Q3');
  assert.equal(S.tokens[hero('juan').token].status, 'active');

  // maria: ₱1,200 due, outcome defaults to pending in demo tools
  const mReq = currentOpenRequest(S, arrOf('maria').id);
  assert.equal(mReq.amount, 120000);
  assert.equal(hero('maria').defaultOutcome, 'pending');
  // carlo: ₱3,000 due + one prior failed attempt
  const cReq = currentOpenRequest(S, arrOf('carlo').id);
  assert.equal(cReq.amount, 300000);
  const cFailed = vals(S.attempts).filter((a) => a.requestId === cReq.id && a.status === 'failed');
  assert.equal(cFailed.length, 1);
  assert.equal(cFailed[0].failureReason, 'Declined by issuer (simulated)');
  // ana: final installment ₱5,000 due; all others paid
  const aInst = instOf(arrOf('ana').id);
  assert.equal(aInst.at(-1).amount, 500000);
  assert.ok(['due', 'overdue'].includes(aInst.at(-1).status));
  assert.ok(aInst.slice(0, -1).every((i) => i.status === 'paid'));
  assert.equal(currentOpenRequest(S, arrOf('ana').id).installmentId, aInst.at(-1).id);
  // nina: token revoked
  assert.equal(S.tokens[hero('nina').token].status, 'revoked');
  // rosa: disputed
  assert.equal(S.accounts[hero('rosa').accountId].status, 'disputed');
  // mark: no arrangement at all
  assert.equal(vals(S.arrangements).filter((a) => a.accountId === hero('mark').accountId).length, 0);
  assert.equal(hero('mark').token, null);
  // ben: defaulted, 2 missed, account assigned back to the queue
  const ben = S.accounts[hero('ben').accountId];
  assert.equal(ben.id, 'ac_ben');
  assert.equal(ben.status, 'assigned');
  const bArr = vals(S.arrangements).find((a) => a.accountId === ben.id);
  assert.equal(bArr.status, 'defaulted');
  assert.equal(instOf(bArr.id).filter((i) => i.status === 'missed').length, 2);
});

test('test_juan', () => {
  const arr = arrOf('juan');
  assert.equal(arr.total, 1500000);
  assert.equal(arr.count, 6);
  const p = arrangementProgress(S, arr.id);
  assert.equal(p.paidCount, 2);
  assert.equal(p.count, 6);
  assert.equal(p.paid, 500000);
  assert.equal(p.total, 1500000);
  assert.equal(p.remaining, 1000000);
  assert.equal(p.next.dueDate, '2026-12-05');
  assert.equal(p.next.seq, 3);
  assert.equal(p.next.amount, 250000);
  const inst = instOf(arr.id);
  assert.deepEqual(inst.map((i) => i.status), ['paid', 'paid', 'due', 'scheduled', 'scheduled', 'scheduled']);
  assert.equal(inst[3].dueDate, '2027-01-05');
  const req = currentOpenRequest(S, arr.id);
  assert.ok(req && req.installmentId === inst[2].id && req.amount === 250000);
  assert.equal(req.status, 'created');
});

test('test_luis', () => {
  const arr = arrOf('luis');
  const reqs = vals(S.requests).filter((r) => r.arrangementId === arr.id);
  const expired = reqs.find((r) => r.status === 'expired');
  assert.ok(expired, 'an expired request exists');
  assert.equal(expired.amount, 90000);
  assert.equal(phtDate(expired.expiresAt), '2026-11-24'); // 2 days before the demo date
  const repl = S.requests[expired.replacedById];
  assert.ok(['created', 'sent'].includes(repl.status));
  assert.equal(repl.replacesId, expired.id);
  assert.equal(repl.installmentId, expired.installmentId);
  assert.equal(S.installments[expired.installmentId].status, 'overdue');
  assert.equal(currentOpenRequest(S, arr.id).id, repl.id);
  assert.equal(S.tokens[hero('luis').token].status, 'active');
});

test('test_kpis_match_sums', () => {
  const k = kpis(S);
  const inMonth = (iso, m) => iso && phtMonth(iso) === m;
  const sumFor = (m) => vals(S.payments).reduce((s, p) => s
    + (inMonth(p.paidAt, m) ? p.gross : 0)
    - (p.refunded && inMonth(p.refundedAt, m) ? p.gross : 0), 0);
  assert.equal(k.collectedThisMonth, sumFor('2026-11'));
  assert.equal(k.collectedLastMonth, sumFor('2026-10'));
  assert.ok(k.collectedThisMonth > 0);
  const live = new Set(vals(S.arrangements).filter((a) => ['active', 'partially_paid'].includes(a.status)).map((a) => a.id));
  assert.equal(k.activeArrangements, live.size);
  const unpaidLive = vals(S.installments).filter((i) => live.has(i.arrangementId) && !['paid', 'cancelled', 'missed'].includes(i.status));
  const week = unpaidLive.filter((i) => i.dueDate >= '2026-11-26' && i.dueDate <= '2026-12-02');
  assert.deepEqual(k.dueThisWeek, { amount: week.reduce((s, i) => s + i.amount, 0), count: week.length });
  const od = vals(S.installments).filter((i) => live.has(i.arrangementId) && i.status === 'overdue');
  assert.deepEqual(k.overdue, { amount: od.reduce((s, i) => s + i.amount, 0), count: od.length });
  assert.ok(k.dueThisWeek.count > 0 && k.overdue.count > 0 && k.newArrangementsThisMonth > 0);
});

test('test_portfolio_recovery', () => {
  const rows = portfolioRecovery(S);
  assert.equal(rows.length, 3);
  for (const r of rows) {
    const placed = vals(S.accounts).filter((a) => a.portfolioId === r.portfolioId).reduce((s, a) => s + a.placedBalance, 0);
    const collected = vals(S.payments).filter((p) => !p.refunded && S.accounts[p.accountId].portfolioId === r.portfolioId).reduce((s, p) => s + p.gross, 0);
    assert.equal(r.placed, placed);
    assert.equal(r.collected, collected);
    assert.ok(r.pct > 0 && r.pct < 100);
  }
});

test('test_exception_types', () => {
  const types = ['amount_mismatch', 'unmatched_provider', 'stale_pending', 'missing_at_provider',
    'duplicate_overpayment', 'late_payment', 'status_mismatch', 'payout_mismatch'];
  const ex = vals(S.exceptions);
  for (const t of types) assert.ok(ex.some((e) => e.type === t && e.status === 'open'), `open ${t}`);
  assert.ok(ex.every((e) => types.includes(e.type)));
  assert.ok(ex.some((e) => e.status === 'resolved') && ex.some((e) => e.status === 'in_review'));
  // linked records exist
  for (const e of ex) {
    if (e.refs.attemptId) assert.ok(S.attempts[e.refs.attemptId], e.id);
    if (e.refs.paymentId) assert.ok(S.payments[e.refs.paymentId], e.id);
    if (e.refs.payoutId) assert.ok(S.payouts[e.refs.payoutId], e.id);
  }
});

test('test_no_real_domains', () => {
  for (const a of vals(S.accounts)) {
    assert.ok(a.borrower.email === null || a.borrower.email.endsWith('@example.com'), a.borrower.email);
    assert.match(a.borrower.mobile, /^\+639\d{9}$/);
  }
  const text = JSON.stringify(S);
  const emails = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g) || [];
  assert.ok(emails.every((e) => e.endsWith('@example.com')), 'every email in state is @example.com');
  const urls = text.match(/https?:\/\/[^"\s]+/g) || [];
  assert.ok(urls.every((u) => u.startsWith('https://pay.example/')), 'no real URLs in state');
});

test('test_selectors_shapes', () => {
  const juanId = hero('juan').accountId;
  const tl = accountTimeline(S, juanId);
  assert.ok(tl.length >= 5);
  for (let i = 1; i < tl.length; i++) assert.ok(tl[i - 1].at >= tl[i].at, 'newest first');
  assert.ok(tl.every((t) => t.at && t.kind && t.title && t.tone));
  const kinds = new Set(tl.map((t) => t.kind));
  for (const k of ['contact', 'request', 'attempt', 'payment']) assert.ok(kinds.has(k), k);

  const all = paymentHistory(S, {});
  assert.ok(all.some((r) => r.type === 'request') && all.some((r) => r.type === 'attempt'));
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].at >= all[i].at);
  const expired = paymentHistory(S, { status: 'expired' });
  assert.ok(expired.length > 0 && expired.every((r) => r.status === 'expired'));
  assert.ok(expired.some((r) => r.type === 'request'));
  const byRef = paymentHistory(S, { ref: '004821' });
  assert.ok(byRef.length > 0 && byRef.every((r) => r.accountId === juanId));
  const nov = paymentHistory(S, { from: '2026-11-01', to: '2026-11-30', min: 100000, max: 300000 });
  assert.ok(nov.length > 0 && nov.every((r) => r.at.startsWith('2026-11') && r.amount >= 100000 && r.amount <= 300000));
  const pf = vals(S.portfolios)[0].id;
  assert.ok(paymentHistory(S, { portfolioId: pf }).every((r) => r.portfolioId === pf));

  const bal = accountBalance(S, juanId);
  assert.equal(bal.paid, 500000);
  // Juan's arrangement agrees ₱15,000 of ₱18,500: current = the arrangement's remaining ₱10,000,
  // and the ₱3,500 gap is an explicit settlement discount (review fix: numbers agree across views).
  assert.equal(bal.current, 1000000);
  assert.equal(bal.discount, bal.placed - 500000 - 1000000);
  assert.equal(bal.agreed, 1500000);
});
