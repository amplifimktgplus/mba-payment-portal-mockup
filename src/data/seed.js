// Seeded, deterministic demo dataset (design C6, D§8). Same seed → deep-equal state.
// Heroes are hand-written (D§8 table); ~410 bulk accounts are generated from mulberry32.
// Money is integer centavos. Timestamps are PHT strings ('YYYY-MM-DDTHH:mm:ss+08:00').
// Demo data only: fictional first name + initial, @example.com emails, no real URLs.

import { mulberry32, randInt, pick, pickWeighted, shuffle, tokenFrom } from '../core/rng.js';
import { DEMO_NOW, DEMO_TODAY, addDays, addMonths, addMinutes, addSeconds } from '../core/clock.js';
import { splitInstallments } from '../core/money.js';
import { POLICIES } from '../core/config.js';
import { maskMobile, maskEmail, seqId, borrowerName } from '../core/format.js';

export const DEFAULT_SEED = 20261126;

/** Hero accounts reachable from the Demo tools shortcuts (D§8). */
export const HEROES = Object.freeze([
  { key: 'juan', accountId: 'ac_juan', token: 'hT7qPz2KmW9vXc4RbN8sLd', ref: 'MBA-REF-2026-004821', label: 'Email link — happy path', view: 'borrower', entry: 'token', defaultOutcome: 'success' },
  { key: 'maria', accountId: 'ac_maria', token: 'Wm3sVq8YtE6pLk2HdR9cXa', ref: 'MBA-REF-2026-003156', label: 'Pending payment', view: 'borrower', entry: 'token', defaultOutcome: 'pending' },
  { key: 'carlo', accountId: 'ac_carlo', token: 'Bn5RkT2wQz7mYc9HsP4vJe', ref: 'MBA-REF-2026-002974', label: 'Failed then retry', view: 'borrower', entry: 'token', defaultOutcome: 'success' },
  { key: 'ana', accountId: 'ac_ana', token: 'Ky8dNf3GqW6tZp2XbM7rLs', ref: 'MBA-REF-2026-001538', label: 'Final installment → Settled', view: 'borrower', entry: 'token', defaultOutcome: 'success' },
  { key: 'luis', accountId: 'ac_luis', token: 'Pq4XzM9cVr2TsK7nHw3YdB', ref: 'MBA-REF-2026-004410', label: 'Overdue after expiry', view: 'borrower', entry: 'token', defaultOutcome: 'success' },
  { key: 'nina', accountId: 'ac_nina', token: 'Ft6YbL3mRk8QwZ2sNc9HvE', ref: 'MBA-REF-2026-004407', label: 'Revoked link', view: 'borrower', entry: 'token', defaultOutcome: 'success' },
  { key: 'rosa', accountId: 'ac_rosa', token: 'Jc2WnS7vXq4TpR9mKd6GzA', ref: 'MBA-REF-2026-002203', label: 'Under review (disputed)', view: 'borrower', entry: 'token', defaultOutcome: 'success' },
  { key: 'mark', accountId: 'ac_mark', token: null, ref: 'MBA-REF-2026-003390', label: 'Nothing due (reference entry)', view: 'borrower', entry: 'ref', defaultOutcome: 'success' },
  { key: 'ben', accountId: 'ac_ben', token: 'Ud9HqK4sZw2MtB7xRc5PnY', ref: 'MBA-REF-2026-001877', label: 'Defaulted (MBA view)', view: 'mba', entry: 'mba', route: '#/m/accounts/ac_ben', defaultOutcome: 'success' },
]);

const CREDITORS = [
  { id: 'cr_sb', name: 'Sample Bank (demo)', commissionPct: 15 },
  { id: 'cr_dl', name: 'Demo Lender (demo)', commissionPct: 18 },
  { id: 'cr_tc', name: 'Telco Demo (demo)', commissionPct: 20 },
];
const PORTFOLIOS = [
  { id: 'pf_sbq3', creditorId: 'cr_sb', name: 'Sample Bank Q3', placedAt: '2026-07-15T10:00:00+08:00' },
  { id: 'pf_dla', creditorId: 'cr_dl', name: 'Demo Lender A', placedAt: '2026-08-01T10:00:00+08:00' },
  { id: 'pf_tdb', creditorId: 'cr_tc', name: 'Telco Demo B', placedAt: '2026-08-20T10:00:00+08:00' },
];
const AGENTS = [
  { id: 'ag_1', name: 'Andrea L.' },
  { id: 'ag_2', name: 'Paolo M.' },
  { id: 'ag_3', name: 'Bea R.' },
  { id: 'ag_4', name: 'Miguel T.' },
];
const FIRST_NAMES = ['Andres', 'Bianca', 'Carmela', 'Dante', 'Elena', 'Felipe', 'Gloria', 'Hector', 'Isabel', 'Jose',
  'Karen', 'Lorenzo', 'Marites', 'Noel', 'Olivia', 'Pedro', 'Queenie', 'Ramon', 'Sofia', 'Tomas', 'Victor', 'Wilma',
  'Xavier', 'Ysabel', 'Zaldy', 'Analyn', 'Benjie', 'Cristina', 'Dennis', 'Erlinda', 'Ferdinand', 'Grace', 'Herminio',
  'Imelda', 'Jerome', 'Kristine', 'Leonardo', 'Maricel', 'Nestor', 'Rowena', 'Rodel', 'Sheila', 'Teodoro', 'Vilma',
  'Arnel', 'Jocelyn', 'Rommel', 'Liza', 'Edwin', 'Corazon', 'Danilo', 'Estrella', 'Gilbert', 'Honeylyn', 'Jun',
  'Lourdes', 'Melchor', 'Norma', 'Perla', 'Reynaldo'];
const LAST_INITIALS = 'ABCDEFGHIJKLMNOPQRSTUVWY'.split('');
const MOBILE_PREFIXES = ['17', '18', '19', '20', '27', '28', '47', '56', '66', '77', '95', '98'];
const NOTES = {
  no_contact: ['No answer, left voicemail', 'Number busy — will retry', 'SMS sent, no reply yet', 'Rang out, no voicemail set up', 'Phone off — try again in the evening'],
  contacted: ['Spoke with borrower; asked for time to review their budget', 'Borrower confirmed details; call back next week', 'Explained options; borrower will discuss with family', 'Borrower asked for the balance breakdown by email'],
  agreement: ['Agreed a monthly plan; sending the arrangement for approval', 'Borrower accepted the installment plan', 'Agreed terms on the call; confirmed mobile for the payment link'],
  dispute: ['Borrower says the balance was already paid — requested creditor statement', 'Borrower disputes the amount; asked the creditor for a breakdown', 'Borrower does not recognise the account — escalated for review'],
};
const FAIL_REASONS = ['Declined by issuer (simulated)', 'Insufficient balance (simulated)', 'Authentication not completed (simulated)'];
const METHODS = POLICIES.methods;
const OPEN = ['created', 'sent', 'opened'];

const ts = (date, h = 9, m = 0, s = 0) => `${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}+08:00`;
const maxTs = (a, b) => (a > b ? a : b);
const feeOf = (gross) => Math.round((gross * POLICIES.feePct) / 100);
const expiryFor = (dueDate) => ts(addDays(dueDate, POLICIES.requestGraceDays), 23, 59);

function emptyState() {
  return {
    version: 1,
    role: 'admin',
    view: 'mba',
    lastRoute: { borrower: '#/b', mba: '#/m/dashboard' },
    demo: { pendingDelay: 'auto' },
    creditors: {}, portfolios: {}, accounts: {}, arrangements: {}, installments: {},
    tokens: {}, requests: {}, attempts: {}, payments: {}, webhookEvents: {},
    contactAttempts: {}, attachments: {}, importBatches: {}, exceptions: {}, agents: {},
    payouts: {},
    notifications: [],
    audit: [],
    borrower: { token: null, ref: null, verified: false, verifiedAt: null, otp: null, screenOverride: null, error: null, attemptId: null },
    seq: { req: 812, txn: 4217, ref: 5000, evt: 9000, obj: 1, exc: 1, tick: 0 },
  };
}

/** Builds a deterministic seed state. */
export function createSeedState(seed = DEFAULT_SEED) {
  const rng = mulberry32(seed);
  const S = emptyState();
  const R = (a, b) => randInt(rng, a, b);
  let objN = 1;
  const oid = (prefix) => `${prefix}_${String(objN++).padStart(5, '0')}`;
  let tR = 0, tT = 0, tE = 0, tP = 0;
  const auditRows = [];
  const marks = { pendingStale: null, duplicates: [], late: null, revisedCancelledAttempt: null };

  for (const c of CREDITORS) S.creditors[c.id] = { ...c };
  for (const p of PORTFOLIOS) S.portfolios[p.id] = { ...p };
  for (const a of AGENTS) S.agents[a.id] = { ...a };

  // ---------------------------------------------------------------- builders
  function account(o) {
    const pf = S.portfolios[o.portfolioId];
    const acc = {
      id: o.id, ref: o.ref, portfolioId: pf.id, creditorId: pf.creditorId,
      creditorAccountNo: o.creditorAccountNo,
      borrower: { first: o.first, lastInitial: o.lastInitial, mobile: o.mobile, email: o.email },
      placedBalance: o.placedBalance, assigneeId: o.assigneeId ?? null, status: o.status,
      createdAt: o.createdAt ?? pf.placedAt,
    };
    if (o.holdUntil) acc.holdUntil = o.holdUntil;
    S.accounts[acc.id] = acc;
    return acc;
  }
  function audit(at, role, action, target, accountId, detail) {
    const row = { id: null, at, role, action, target, accountId };
    if (detail) row.detail = detail;
    auditRows.push(row);
  }
  function contact(acc, at, outcome, channel = 'call', note = null, nextAt = null) {
    const c = { id: oid('ca'), accountId: acc.id, channel, outcome, note: note ?? pick(rng, NOTES[outcome]), by: acc.assigneeId || 'ag_1', at };
    if (nextAt) c.nextAt = nextAt;
    S.contactAttempts[c.id] = c;
    return c;
  }
  function arrangement(acc, o) {
    const id = o.id ?? oid('ar');
    const arr = {
      id, lineageId: o.lineageId ?? (o.id ? o.id.replace(/^ar_/, 'ln_') : oid('ln')), accountId: acc.id,
      version: o.version ?? 1, total: o.total, count: o.count, frequency: 'monthly', firstDue: o.firstDue,
      status: o.status, createdBy: o.createdBy ?? acc.assigneeId ?? 'ag_1', createdAt: o.createdAt,
      history: [{ action: 'drafted', by: 'agent', at: o.createdAt }],
    };
    if (o.approvedAt) {
      arr.approvedBy = 'supervisor';
      arr.activatedAt = o.approvedAt;
      arr.history.push({ action: 'approved', by: 'supervisor', at: o.approvedAt });
      audit(o.approvedAt, 'supervisor', 'arrangement.approve', id, acc.id, `${borrowerName(acc)} · v${arr.version}`);
    }
    S.arrangements[id] = arr;
    const parts = o.amounts ?? splitInstallments(o.total, o.count);
    const insts = parts.map((amount, i) => {
      const inst = { id: oid('in'), arrangementId: id, seq: i + 1, amount, dueDate: addMonths(o.firstDue, i), status: 'scheduled' };
      S.installments[inst.id] = inst;
      return inst;
    });
    return { arr, insts };
  }
  function token(arr, createdAt, value = null, status = 'active') {
    let t = value;
    while (!t || S.tokens[t]) t = tokenFrom(rng);
    S.tokens[t] = { token: t, lineageId: arr.lineageId, accountId: arr.accountId, status, createdAt };
    return S.tokens[t];
  }
  function request(arr, inst, createdAt, o = {}) {
    const r = {
      id: `R#${++tR}`, installmentId: inst.id, arrangementId: arr.id, accountId: arr.accountId,
      amount: inst.amount, createdAt, expiresAt: o.expiresAt ?? expiryFor(inst.dueDate), status: 'created', deliveries: [],
    };
    S.requests[r.id] = r;
    return r;
  }
  function deliver(req, channel, at, by) {
    const acc = S.accounts[req.accountId];
    const ch = channel === 'email' && !acc.borrower.email ? 'sms' : channel;
    req.deliveries.push({ channel: ch, to: ch === 'email' ? maskEmail(acc.borrower.email) : maskMobile(acc.borrower.mobile), at, by });
    if (req.status === 'created') req.status = 'sent';
  }
  function event(att, kind, at) {
    const names = ['received', 'signature_valid', 'not_duplicate', 'verified_api', kind === 'paid' ? 'posted' : 'failed_recorded'];
    const ev = { id: `E#${++tE}`, attemptId: att.id, kind, receivedAt: at, steps: names.map((name, i) => ({ name, ok: true, at: addSeconds(at, i) })) };
    S.webhookEvents[ev.id] = ev;
    return ev;
  }
  function attempt(req, createdAt, method, status, finalAt, failureReason) {
    const a = {
      id: `T#${++tT}`, requestId: req.id, accountId: req.accountId, amount: req.amount, method, status,
      provider: { checkoutSessionId: null }, history: [{ status: 'initiated', at: createdAt }], createdAt,
    };
    if (status !== 'initiated') a.history.push({ status: 'pending', at: addSeconds(createdAt, 20) });
    if (!['initiated', 'pending'].includes(status)) a.history.push({ status, at: finalAt });
    if (failureReason) a.failureReason = failureReason;
    S.attempts[a.id] = a;
    if (status === 'failed') event(a, 'failed', finalAt);
    return a;
  }
  function payment(req, att, paidAt) {
    const p = {
      id: `P#${++tP}`, attemptId: att.id, accountId: req.accountId, gross: req.amount, fee: feeOf(req.amount),
      net: req.amount - feeOf(req.amount), method: att.method, paidAt, reconciled: false, refunded: false, refundedAt: null,
    };
    S.payments[p.id] = p;
    event(att, 'paid', addSeconds(paidAt, 4));
    return p;
  }
  /** One verified payment for an installment's request (optionally preceded by a failed / lapsed attempt). */
  function pay(inst, req, paidAt, method, { failFirst = false, lapseFirst = false } = {}) {
    if (failFirst) {
      const at = addMinutes(paidAt, -R(15, 90));
      attempt(req, at, pick(rng, METHODS), 'failed', addMinutes(at, 2), pick(rng, FAIL_REASONS));
    } else if (lapseFirst) {
      const at = addMinutes(paidAt, -R(70, 200));
      attempt(req, at, method, 'expired', addMinutes(at, 60));
    }
    const created = addMinutes(paidAt, -R(2, 6));
    const att = attempt(req, created, method, 'paid', paidAt);
    const p = payment(req, att, paidAt);
    inst.status = 'paid';
    inst.paidAt = paidAt;
    inst.paymentId = p.id;
    req.status = 'paid';
    req.paidAt = paidAt;
    return { att, p };
  }
  function payTime(inst, req) {
    let day = addDays(inst.dueDate, -R(0, 4));
    if (rng() < 0.08) day = addDays(inst.dueDate, R(1, 3)); // a little late, within grace
    let t = ts(day, R(8, 21), R(0, 59), R(0, 59));
    const lo = maxTs(addMinutes(req.createdAt, 90), '2026-09-01T08:00:00+08:00');
    if (t < lo) t = addMinutes(lo, R(30, 600));
    const hi = addMinutes(DEMO_NOW, -120);
    if (t > hi) t = addMinutes(hi, -R(0, 600));
    if (t <= req.createdAt) t = addMinutes(req.createdAt, 5);
    return t;
  }
  const methodPick = () => pickWeighted(rng, [['GCash', 45], ['Maya', 25], ['Card', 18], ['Online banking', 12]]);

  /**
   * Plays an arrangement forward from `startAt` up to the demo date:
   * past-due installments are paid, except (mode 'overdue') the last one, which is overdue —
   * inside the grace window, or with an expired request and an open replacement (V3 §8.1).
   * The first future installment gets the open request. Returns {open, lastPaidAt}.
   */
  function play(acc, arr, insts, startAt, mode, firstBy = 'agent') {
    let cursor = startAt;
    let lastPaidAt = null;
    let first = true;
    for (let i = 0; i < insts.length; i++) {
      const inst = insts[i];
      const isPast = inst.dueDate < DEMO_TODAY;
      const lastPast = isPast && (i === insts.length - 1 || insts[i + 1].dueDate >= DEMO_TODAY);
      const req = request(arr, inst, cursor);
      if (first) deliver(req, rng() < 0.7 ? 'sms' : 'email', addMinutes(cursor, R(2, 30)), firstBy);
      else if (addDays(inst.dueDate, -3) <= DEMO_TODAY) {
        const remind = ts(addDays(inst.dueDate, -3), 9, 0);
        if (remind > req.createdAt && remind <= DEMO_NOW) deliver(req, 'sms', remind, 'system');
      }
      first = false;
      if (isPast && !(lastPast && mode === 'overdue')) {
        const paidAt = payTime(inst, req);
        pay(inst, req, paidAt, methodPick(), { failFirst: rng() < 0.07, lapseFirst: rng() < 0.03 });
        lastPaidAt = paidAt;
        cursor = addMinutes(paidAt, 1);
        continue;
      }
      if (isPast) {
        inst.status = 'overdue';
        if (req.expiresAt < DEMO_NOW) {
          req.status = 'expired';
          req.expiredAt = req.expiresAt;
          const replAt = addMinutes(req.expiresAt, 1);
          const repl = request(arr, inst, replAt, { expiresAt: ts(addDays(req.expiresAt.slice(0, 10), POLICIES.requestGraceDays), 23, 59) });
          repl.replacesId = req.id;
          req.replacedById = repl.id;
          if (rng() < 0.75) deliver(repl, 'sms', ts(addDays(replAt.slice(0, 10), 0), 9, R(0, 30)), 'system');
          if (repl.deliveries.length && repl.deliveries[0].at <= repl.createdAt) repl.deliveries[0].at = addMinutes(repl.createdAt, 540);
          if (repl.deliveries.length && repl.deliveries[0].at > DEMO_NOW) { repl.deliveries = []; repl.status = 'created'; }
          return { open: repl, lastPaidAt };
        }
        if (req.status === 'sent' && rng() < 0.4) req.status = 'opened';
        return { open: req, lastPaidAt };
      }
      inst.status = 'due';
      if (req.status === 'sent' && rng() < 0.4) req.status = 'opened';
      return { open: req, lastPaidAt };
    }
    return { open: null, lastPaidAt };
  }
  function attach(arr, acc, at) {
    const name = `Signed agreement ${acc.ref}.pdf`;
    // `sample` marks seeded files so the viewer may draw a sample page; it consumes no random draw.
    const a = { id: oid('at'), arrangementId: arr.id, filename: name, size: R(80, 420) * 1024, uploader: S.agents[arr.createdBy]?.name ?? 'Agent', at, version: 1, sample: 'agreement' };
    S.attachments[a.id] = a;
    if (rng() < 0.12) {
      const b = { ...a, id: oid('at'), size: R(80, 420) * 1024, at: addMinutes(at, R(30, 300)), version: 2 };
      S.attachments[b.id] = b;
    }
  }

  // ---------------------------------------------------------------- heroes (D§8)
  const H = Object.fromEntries(HEROES.map((h) => [h.key, h]));
  {
    // Juan D. — 6 × ₱2,500; 2 paid; installment 3 due Sat 5 Dec 2026; open request; active token.
    const acc = account({ id: 'ac_juan', ref: H.juan.ref, portfolioId: 'pf_sbq3', creditorAccountNo: '5521-0087-3349', first: 'Juan', lastInitial: 'D', mobile: '+639171237310', email: 'juan.d@example.com', placedBalance: 1850000, assigneeId: 'ag_1', status: 'arrangement_active' });
    contact(acc, ts('2026-09-22', 10, 15), 'no_contact', 'call', 'No answer, left voicemail', '2026-09-24');
    contact(acc, ts('2026-09-24', 14, 30), 'agreement', 'call', 'Agreed 6 × ₱2,500 monthly; sending the arrangement for approval');
    const { arr, insts } = arrangement(acc, { id: 'ar_juan', total: 1500000, count: 6, firstDue: '2026-10-05', status: 'partially_paid', createdAt: ts('2026-09-24', 15, 0), approvedAt: ts('2026-09-25', 10, 0) });
    token(arr, ts('2026-09-25', 10, 0), H.juan.token);
    attach(arr, acc, ts('2026-09-24', 15, 20));
    const r1 = request(arr, insts[0], ts('2026-09-25', 10, 0));
    deliver(r1, 'sms', ts('2026-09-25', 10, 5), 'agent');
    pay(insts[0], r1, ts('2026-10-04', 19, 12), 'GCash');
    const r2 = request(arr, insts[1], ts('2026-10-04', 19, 13));
    deliver(r2, 'sms', ts('2026-11-02', 9, 0), 'system');
    pay(insts[1], r2, ts('2026-11-04', 12, 40), 'Card');
    request(arr, insts[2], ts('2026-11-04', 12, 41)); // 'created', not yet delivered
    insts[2].status = 'due';
  }
  {
    // Maria S. — ₱1,200 installment due Nov 28 (demo outcome defaults to Pending).
    const acc = account({ id: 'ac_maria', ref: H.maria.ref, portfolioId: 'pf_dla', creditorAccountNo: 'DL-4471902', first: 'Maria', lastInitial: 'S', mobile: '+639181234412', email: 'maria.s@example.com', placedBalance: 980000, assigneeId: 'ag_2', status: 'arrangement_active' });
    contact(acc, ts('2026-09-08', 11, 0), 'agreement', 'call');
    const { arr, insts } = arrangement(acc, { id: 'ar_maria', total: 720000, count: 6, firstDue: '2026-09-28', status: 'partially_paid', createdAt: ts('2026-09-08', 11, 30), approvedAt: ts('2026-09-09', 9, 30) });
    token(arr, ts('2026-09-09', 9, 30), H.maria.token);
    const r1 = request(arr, insts[0], ts('2026-09-09', 9, 30));
    deliver(r1, 'email', ts('2026-09-09', 9, 40), 'agent');
    pay(insts[0], r1, ts('2026-09-27', 18, 5), 'Maya');
    const r2 = request(arr, insts[1], ts('2026-09-27', 18, 6));
    deliver(r2, 'sms', ts('2026-10-25', 9, 0), 'system');
    pay(insts[1], r2, ts('2026-10-27', 20, 22), 'GCash');
    const r3 = request(arr, insts[2], ts('2026-10-27', 20, 23));
    deliver(r3, 'sms', ts('2026-11-25', 9, 0), 'system');
    insts[2].status = 'due';
  }
  {
    // Carlo R. — ₱3,000 due Nov 30; one prior failed attempt on this request.
    const acc = account({ id: 'ac_carlo', ref: H.carlo.ref, portfolioId: 'pf_sbq3', creditorAccountNo: '5521-0412-7760', first: 'Carlo', lastInitial: 'R', mobile: '+639201239902', email: 'carlo.r@example.com', placedBalance: 1640000, assigneeId: 'ag_1', status: 'arrangement_active' });
    contact(acc, ts('2026-10-12', 15, 10), 'agreement', 'call');
    const { arr, insts } = arrangement(acc, { id: 'ar_carlo', total: 1200000, count: 4, firstDue: '2026-10-30', status: 'partially_paid', createdAt: ts('2026-10-12', 15, 40), approvedAt: ts('2026-10-13', 10, 0) });
    token(arr, ts('2026-10-13', 10, 0), H.carlo.token);
    const r1 = request(arr, insts[0], ts('2026-10-13', 10, 0));
    deliver(r1, 'sms', ts('2026-10-13', 10, 3), 'agent');
    pay(insts[0], r1, ts('2026-10-29', 13, 15), 'Online banking');
    const r2 = request(arr, insts[1], ts('2026-10-29', 13, 16));
    deliver(r2, 'email', ts('2026-11-25', 10, 0), 'agent');
    r2.status = 'opened';
    attempt(r2, ts('2026-11-25', 20, 14), 'Card', 'failed', ts('2026-11-25', 20, 16), 'Declined by issuer (simulated)');
    insts[1].status = 'due';
  }
  {
    // Ana P. — final installment ₱5,000 due Dec 1; installments 1–3 paid.
    const acc = account({ id: 'ac_ana', ref: H.ana.ref, portfolioId: 'pf_dla', creditorAccountNo: 'DL-3308815', first: 'Ana', lastInitial: 'P', mobile: '+639271235567', email: 'ana.p@example.com', placedBalance: 2600000, assigneeId: 'ag_2', status: 'arrangement_active' });
    contact(acc, ts('2026-08-18', 9, 40), 'agreement', 'call');
    const { arr, insts } = arrangement(acc, { id: 'ar_ana', total: 2000000, count: 4, firstDue: '2026-09-01', status: 'partially_paid', createdAt: ts('2026-08-18', 10, 0), approvedAt: ts('2026-08-20', 9, 0) });
    token(arr, ts('2026-08-20', 9, 0), H.ana.token);
    attach(arr, acc, ts('2026-08-18', 10, 30));
    let prev = ts('2026-08-20', 9, 0);
    const paidAts = [ts('2026-09-01', 10, 30), ts('2026-09-30', 17, 45), ts('2026-10-31', 11, 5)];
    const methods = ['GCash', 'GCash', 'Maya'];
    for (let i = 0; i < 3; i++) {
      const r = request(arr, insts[i], prev);
      deliver(r, i === 0 ? 'email' : 'sms', i === 0 ? addMinutes(prev, 10) : ts(addDays(insts[i].dueDate, -3), 9, 0), i === 0 ? 'agent' : 'system');
      pay(insts[i], r, paidAts[i], methods[i]);
      prev = addMinutes(paidAts[i], 1);
    }
    const r4 = request(arr, insts[3], prev);
    deliver(r4, 'email', ts('2026-11-20', 14, 0), 'agent');
    insts[3].status = 'due';
  }
  {
    // Luis M. — ₱900; request expired 2 days ago (Nov 24); installment overdue; replacement sent.
    const acc = account({ id: 'ac_luis', ref: H.luis.ref, portfolioId: 'pf_tdb', creditorAccountNo: 'TD-90044182', first: 'Luis', lastInitial: 'M', mobile: '+639471230928', email: 'luis.m@example.com', placedBalance: 410000, assigneeId: 'ag_3', status: 'arrangement_active' });
    contact(acc, ts('2026-10-02', 16, 0), 'agreement', 'call');
    const { arr, insts } = arrangement(acc, { id: 'ar_luis', total: 270000, count: 3, firstDue: '2026-10-19', status: 'partially_paid', createdAt: ts('2026-10-02', 16, 20), approvedAt: ts('2026-10-03', 9, 15) });
    token(arr, ts('2026-10-03', 9, 15), H.luis.token);
    const r1 = request(arr, insts[0], ts('2026-10-03', 9, 15));
    deliver(r1, 'sms', ts('2026-10-03', 9, 20), 'agent');
    pay(insts[0], r1, ts('2026-10-18', 12, 30), 'GCash');
    const r2 = request(arr, insts[1], ts('2026-10-18', 12, 31));
    deliver(r2, 'sms', ts('2026-11-16', 9, 0), 'system');
    r2.status = 'expired';
    r2.expiredAt = r2.expiresAt; // '2026-11-24T23:59:00+08:00'
    insts[1].status = 'overdue';
    const r3 = request(arr, insts[1], ts('2026-11-25', 0, 0), { expiresAt: ts('2026-11-29', 23, 59) });
    r3.replacesId = r2.id;
    r2.replacedById = r3.id;
    deliver(r3, 'sms', ts('2026-11-25', 9, 0), 'system');
    contact(acc, ts('2026-11-25', 15, 20), 'no_contact', 'call', 'Overdue follow-up: no answer, SMS reminder already sent', '2026-11-27');
  }
  {
    // Nina G. — link revoked (it had been sent to a wrong number).
    const acc = account({ id: 'ac_nina', ref: H.nina.ref, portfolioId: 'pf_tdb', creditorAccountNo: 'TD-90051377', first: 'Nina', lastInitial: 'G', mobile: '+639561234455', email: null, placedBalance: 750000, assigneeId: 'ag_3', status: 'arrangement_active' });
    contact(acc, ts('2026-09-29', 10, 0), 'agreement', 'call');
    const { arr, insts } = arrangement(acc, { id: 'ar_nina', total: 600000, count: 4, firstDue: '2026-10-12', status: 'partially_paid', createdAt: ts('2026-09-29', 10, 30), approvedAt: ts('2026-09-30', 9, 0) });
    const tk = token(arr, ts('2026-09-30', 9, 0), H.nina.token);
    const r1 = request(arr, insts[0], ts('2026-09-30', 9, 0));
    deliver(r1, 'sms', ts('2026-09-30', 9, 4), 'agent');
    pay(insts[0], r1, ts('2026-10-11', 9, 50), 'Maya');
    const r2 = request(arr, insts[1], ts('2026-10-11', 9, 51));
    deliver(r2, 'sms', ts('2026-11-09', 9, 0), 'system');
    pay(insts[1], r2, ts('2026-11-12', 8, 35), 'Maya');
    const r3 = request(arr, insts[2], ts('2026-11-12', 8, 36));
    deliver(r3, 'sms', ts('2026-11-19', 16, 10), 'agent');
    insts[2].status = 'due';
    tk.status = 'revoked';
    tk.revokedAt = ts('2026-11-20', 11, 5);
    audit(tk.revokedAt, 'supervisor', 'request.revoke', arr.id, acc.id, 'Link revoked — it had been sent to a wrong number');
  }
  {
    // Rosa T. — account Disputed (portal shows "under review").
    const acc = account({ id: 'ac_rosa', ref: H.rosa.ref, portfolioId: 'pf_sbq3', creditorAccountNo: '5521-0933-1048', first: 'Rosa', lastInitial: 'T', mobile: '+639661237781', email: 'rosa.t@example.com', placedBalance: 1520000, assigneeId: 'ag_4', status: 'disputed' });
    contact(acc, ts('2026-09-25', 11, 0), 'agreement', 'call');
    const { arr, insts } = arrangement(acc, { id: 'ar_rosa', total: 1200000, count: 6, firstDue: '2026-10-08', status: 'partially_paid', createdAt: ts('2026-09-25', 11, 30), approvedAt: ts('2026-09-26', 9, 0) });
    token(arr, ts('2026-09-26', 9, 0), H.rosa.token);
    const r1 = request(arr, insts[0], ts('2026-09-26', 9, 0));
    deliver(r1, 'sms', ts('2026-09-26', 9, 6), 'agent');
    pay(insts[0], r1, ts('2026-10-07', 19, 40), 'Online banking');
    const r2 = request(arr, insts[1], ts('2026-10-07', 19, 41));
    deliver(r2, 'sms', ts('2026-11-05', 9, 0), 'system');
    pay(insts[1], r2, ts('2026-11-07', 10, 10), 'Online banking');
    request(arr, insts[2], ts('2026-11-07', 10, 11));
    insts[2].status = 'due';
    contact(acc, ts('2026-11-21', 13, 45), 'dispute', 'call', 'Borrower says part of the balance was settled with the bank in 2024 — requested a creditor statement');
    audit(ts('2026-11-21', 13, 46), 'agent', 'account.dispute', acc.id, acc.id, 'Arrangement active → Disputed');
  }
  {
    // Mark V. — no arrangement (agreement in principle only).
    const acc = account({ id: 'ac_mark', ref: H.mark.ref, portfolioId: 'pf_tdb', creditorAccountNo: 'TD-90061920', first: 'Mark', lastInitial: 'V', mobile: '+639771236604', email: 'mark.v@example.com', placedBalance: 880000, assigneeId: 'ag_4', status: 'negotiating' });
    contact(acc, ts('2026-11-18', 10, 0), 'no_contact', 'call', 'No answer, left voicemail', '2026-11-20');
    contact(acc, ts('2026-11-20', 15, 30), 'contacted', 'call', 'Borrower confirmed details; asked for time to review their budget', '2026-11-24');
    contact(acc, ts('2026-11-24', 11, 10), 'agreement', 'call', 'Agreed in principle to monthly payments; arrangement to be drafted');
  }
  {
    // Ben C. — arrangement Defaulted (2 missed), account back in the agent queue (V3 §12).
    const acc = account({ id: 'ac_ben', ref: H.ben.ref, portfolioId: 'pf_dla', creditorAccountNo: 'DL-2209641', first: 'Ben', lastInitial: 'C', mobile: '+639981232290', email: 'ben.c@example.com', placedBalance: 1260000, assigneeId: 'ag_2', status: 'assigned' });
    contact(acc, ts('2026-08-25', 10, 0), 'agreement', 'call');
    const { arr, insts } = arrangement(acc, { id: 'ar_ben', total: 900000, count: 6, firstDue: '2026-09-10', status: 'defaulted', createdAt: ts('2026-08-25', 10, 30), approvedAt: ts('2026-08-26', 9, 0) });
    token(arr, ts('2026-08-26', 9, 0), H.ben.token);
    const r1 = request(arr, insts[0], ts('2026-08-26', 9, 0));
    deliver(r1, 'sms', ts('2026-08-26', 9, 2), 'agent');
    pay(insts[0], r1, ts('2026-09-09', 14, 20), 'GCash');
    const r2 = request(arr, insts[1], ts('2026-09-09', 14, 21));
    deliver(r2, 'sms', ts('2026-10-07', 9, 0), 'system');
    r2.status = 'expired'; r2.expiredAt = r2.expiresAt;
    const r2b = request(arr, insts[1], ts('2026-10-16', 0, 0), { expiresAt: ts('2026-10-20', 23, 59) });
    r2b.replacesId = r2.id; r2.replacedById = r2b.id;
    deliver(r2b, 'sms', ts('2026-10-16', 9, 0), 'system');
    r2b.status = 'expired'; r2b.expiredAt = r2b.expiresAt;
    const r3 = request(arr, insts[2], ts('2026-11-07', 9, 0));
    deliver(r3, 'sms', ts('2026-11-07', 9, 1), 'system');
    r3.status = 'expired'; r3.expiredAt = r3.expiresAt; // Nov 15
    insts[1].status = 'missed';
    insts[2].status = 'missed';
    for (const i of insts.slice(3)) i.status = 'cancelled';
    arr.defaultedAt = ts('2026-11-16', 0, 5);
    arr.history.push({ action: 'defaulted', by: 'system', at: arr.defaultedAt });
    audit(arr.defaultedAt, 'system', 'automation.defaulted', arr.id, acc.id, '2 consecutive missed installments → Defaulted; account returned to the agent queue');
    contact(acc, ts('2026-11-18', 10, 30), 'no_contact', 'call', 'Renegotiation call: no answer', '2026-11-27');
  }

  // ---------------------------------------------------------------- bulk accounts
  const heroRefs = new Set(HEROES.map((h) => Number(h.ref.slice(-6))));
  const usedRefs = new Set(heroRefs);
  const STATUS_PLAN = [
    ['new', 30], ['assigned', 40], ['contact_attempted', 45], ['contacted', 30], ['negotiating', 25],
    ['arrangement_active', 170], ['settled', 25], ['on_hold', 10], ['disputed', 8], ['escalated', 8],
    ['uncollectable', 10], ['returned', 10],
  ];
  const statuses = shuffle(rng, STATUS_PLAN.flatMap(([s, n]) => Array(n).fill(s)));
  const counters = Object.fromEntries(STATUS_PLAN.map(([s]) => [s, 0]));
  const liveAccounts = [];

  const randomDateBetween = (fromDate, toDate) => addDays(fromDate, R(0, Math.max(0, Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86400000))));
  const contactSeries = (acc, from, to, outcomes) => {
    let day = from;
    for (const o of outcomes) {
      day = randomDateBetween(day, to);
      const ch = o === 'no_contact' ? pickWeighted(rng, [['call', 70], ['sms', 20], ['email', 10]]) : 'call';
      contact(acc, ts(day, R(9, 17), R(0, 59)), o, acc.borrower.email ? ch : (ch === 'email' ? 'call' : ch), null,
        o === 'no_contact' || o === 'contacted' ? addDays(day, R(2, 6)) : null);
      day = addDays(day, 1);
      if (day > to) day = to;
    }
  };

  for (let i = 0; i < statuses.length; i++) {
    const status = statuses[i];
    const nth = counters[status]++;
    const pf = pickWeighted(rng, [['pf_sbq3', 45], ['pf_dla', 30], ['pf_tdb', 25]]);
    let refN;
    do { refN = R(1000, 4999); } while (usedRefs.has(refN));
    usedRefs.add(refN);
    const first = pick(rng, FIRST_NAMES);
    const li = pick(rng, LAST_INITIALS);
    const placedBalance = R(500, 12000) * 1000;
    const acc = account({
      id: `ac_${String(i + 1).padStart(4, '0')}`,
      ref: `MBA-REF-2026-${String(refN).padStart(6, '0')}`,
      portfolioId: pf,
      creditorAccountNo: pf === 'pf_sbq3' ? `5521-${R(1000, 9999)}-${R(1000, 9999)}` : pf === 'pf_dla' ? `DL-${R(1000000, 9999999)}` : `TD-${R(10000000, 99999999)}`,
      first, lastInitial: li,
      mobile: `+639${pick(rng, MOBILE_PREFIXES)}${String(R(0, 9999999)).padStart(7, '0')}`,
      email: rng() < 0.85 ? `${first.toLowerCase()}.${li.toLowerCase()}${R(10, 99)}@example.com` : null,
      placedBalance,
      assigneeId: status === 'new' ? null : pick(rng, AGENTS).id,
      status,
    });
    const placedDay = S.portfolios[pf].placedAt.slice(0, 10);
    const contactFrom = addDays(placedDay, 3);
    if (status !== 'new') audit(ts(addDays(placedDay, 1), 9, R(0, 59)), 'supervisor', 'account.assign', acc.id, acc.id, `Assigned to ${S.agents[acc.assigneeId].name}`);

    switch (status) {
      case 'assigned': {
        if (nth < 8) {
          // Defaulted arrangement (2 consecutive missed), back in the queue.
          const firstDue = `2026-09-${String(R(3, 15)).padStart(2, '0')}`;
          const created = ts(addDays(firstDue, -R(10, 18)), 11, R(0, 59));
          contact(acc, addMinutes(created, -60), 'agreement', 'call');
          const inst = R(10, 40) * 5000;
          const { arr, insts } = arrangement(acc, { total: inst * 6, count: 6, firstDue, status: 'defaulted', createdAt: created, approvedAt: addMinutes(created, R(60, 1200)) });
          token(arr, arr.activatedAt);
          const r1 = request(arr, insts[0], arr.activatedAt);
          deliver(r1, 'sms', addMinutes(arr.activatedAt, 5), 'agent');
          pay(insts[0], r1, payTime(insts[0], r1), methodPick());
          for (const k of [1, 2]) {
            const r = request(arr, insts[k], ts(addDays(insts[k].dueDate, -3), 9, 0));
            deliver(r, 'sms', r.createdAt, 'system');
            r.status = 'expired'; r.expiredAt = r.expiresAt;
            insts[k].status = 'missed';
          }
          for (const x of insts.slice(3)) x.status = 'cancelled';
          arr.defaultedAt = addMinutes(expiryFor(insts[2].dueDate), 6);
          arr.history.push({ action: 'defaulted', by: 'system', at: arr.defaultedAt });
          audit(arr.defaultedAt, 'system', 'automation.defaulted', arr.id, acc.id, '2 consecutive missed installments → Defaulted');
        } else if (rng() < 0.4) contactSeries(acc, contactFrom, '2026-11-25', ['no_contact']);
        break;
      }
      case 'contact_attempted':
        contactSeries(acc, contactFrom, '2026-11-25', Array(R(1, 3)).fill('no_contact'));
        break;
      case 'contacted':
        contactSeries(acc, contactFrom, '2026-11-25', [...Array(R(0, 2)).fill('no_contact'), 'contacted']);
        break;
      case 'escalated':
        contactSeries(acc, contactFrom, '2026-11-20', Array(R(3, 4)).fill('no_contact'));
        audit(ts(randomDateBetween('2026-11-10', '2026-11-25'), 15, R(0, 59)), 'agent', 'account.escalate', acc.id, acc.id, 'No contact after repeated attempts → Escalated');
        break;
      case 'disputed':
        contactSeries(acc, contactFrom, '2026-11-25', [...Array(R(0, 1)).fill('no_contact'), 'contacted', 'dispute']);
        break;
      case 'on_hold': {
        contactSeries(acc, contactFrom, '2026-11-20', ['contacted']);
        acc.holdUntil = randomDateBetween('2026-12-01', '2026-12-18');
        audit(ts(randomDateBetween('2026-11-05', '2026-11-24'), 11, R(0, 59)), 'supervisor', 'account.hold', acc.id, acc.id, `On hold until ${acc.holdUntil} — borrower between jobs, review then`);
        break;
      }
      case 'uncollectable':
      case 'returned': {
        contactSeries(acc, contactFrom, '2026-11-10', Array(R(2, 4)).fill('no_contact'));
        if (nth < 3) {
          // Cancelled arrangement: token revoked, open request cancelled (V3 §7).
          const firstDue = `2026-09-${String(R(5, 25)).padStart(2, '0')}`;
          const created = ts(addDays(firstDue, -R(10, 15)), 10, R(0, 59));
          const inst = R(10, 30) * 5000;
          const { arr, insts } = arrangement(acc, { total: inst * 6, count: 6, firstDue, status: 'cancelled', createdAt: created, approvedAt: addMinutes(created, R(60, 600)) });
          const tk = token(arr, arr.activatedAt);
          const r1 = request(arr, insts[0], arr.activatedAt);
          deliver(r1, 'sms', addMinutes(arr.activatedAt, 4), 'agent');
          pay(insts[0], r1, payTime(insts[0], r1), methodPick());
          const r2 = request(arr, insts[1], addMinutes(insts[0].paidAt, 1));
          const cancelledAt = ts(addDays(insts[1].dueDate, R(6, 12)), 14, R(0, 59));
          r2.status = 'cancelled'; r2.cancelledAt = cancelledAt;
          for (const x of insts.slice(1)) x.status = 'cancelled';
          arr.cancelledAt = cancelledAt;
          arr.history.push({ action: 'cancelled', by: 'supervisor', at: cancelledAt });
          tk.status = 'revoked'; tk.revokedAt = cancelledAt;
          audit(cancelledAt, 'supervisor', 'arrangement.cancel', arr.id, acc.id, status === 'returned' ? 'Creditor recalled the account' : 'Borrower unreachable — closing as uncollectable');
        }
        break;
      }
      case 'negotiating': {
        contactSeries(acc, contactFrom, '2026-11-24', [...Array(R(0, 2)).fill('no_contact'), 'contacted', 'agreement']);
        if (nth < 10) {
          const created = ts(randomDateBetween('2026-11-16', '2026-11-25'), R(9, 17), R(0, 59));
          const count = pick(rng, [3, 4, 6, 6, 12]);
          const inst = Math.max(10, Math.round((placedBalance * (0.5 + rng() * 0.4)) / count / 5000)) * 5000;
          const { arr } = arrangement(acc, { total: inst * count, count, firstDue: randomDateBetween('2026-12-05', '2026-12-28'), status: nth < 7 ? 'pending_approval' : 'draft', createdAt: created });
          if (nth < 7) arr.history.push({ action: 'submitted', by: 'agent', at: addMinutes(created, 5) });
          if (nth === 7) {
            arr.history.push({ action: 'submitted', by: 'agent', at: addMinutes(created, 5) });
            arr.history.push({ action: 'rejected', by: 'supervisor', at: addMinutes(created, 180), note: 'Installment below the creditor minimum — please revise' });
            audit(addMinutes(created, 180), 'supervisor', 'arrangement.reject', arr.id, acc.id, 'Installment below the creditor minimum — please revise');
          }
        }
        break;
      }
      case 'settled': {
        const count = pickWeighted(rng, [[1, 3], [2, 3], [3, 4]]);
        const latestFirst = addMonths('2026-11-20', -(count - 1));
        const firstDue = randomDateBetween('2026-09-03', latestFirst);
        const created = ts(addDays(firstDue, -R(7, 16)), R(9, 16), R(0, 59));
        contactSeries(acc, contactFrom, created.slice(0, 10), ['contacted', 'agreement']);
        const inst = Math.max(10, Math.round((placedBalance * (0.55 + rng() * 0.4)) / count / 5000)) * 5000;
        const { arr, insts } = arrangement(acc, { total: inst * count, count, firstDue, status: 'completed', createdAt: created, approvedAt: addMinutes(created, R(30, 900)) });
        const tk = token(arr, arr.activatedAt);
        if (rng() < 0.5) attach(arr, acc, addMinutes(created, 20));
        const { lastPaidAt } = play(acc, arr, insts, arr.activatedAt, 'current');
        arr.completedAt = lastPaidAt;
        arr.history.push({ action: 'completed', by: 'system', at: lastPaidAt });
        audit(addSeconds(lastPaidAt, 10), 'system', 'automation.settled', arr.id, acc.id, 'Verified payments equal the commitment → Completed / Settled');
        if (addDays(lastPaidAt, POLICIES.completedReadOnlyDays) < DEMO_NOW) {
          tk.status = 'expired';
          tk.expiredAt = addDays(lastPaidAt, POLICIES.completedReadOnlyDays);
        }
        break;
      }
      case 'arrangement_active':
        liveAccounts.push({ acc, nth, contactFrom });
        break;
      default:
        break; // 'new': fresh from import, nothing yet
    }
  }

  // Live arrangements (active / partially paid), including 6 revised lineages.
  for (const { acc, nth, contactFrom } of liveAccounts) {
    const revise = nth < 6;
    let count = pickWeighted(rng, [[3, 2], [4, 2], [6, 4], [8, 1], [10, 1], [12, 2]]);
    let firstDue = randomDateBetween('2026-09-03', '2026-12-20');
    while (addMonths(firstDue, count - 1) < '2026-11-27') count += 1;
    if (revise) {
      firstDue = randomDateBetween('2026-09-03', '2026-09-25');
      count = Math.max(count, 6);
    }
    const instAmt = Math.max(10, Math.round((acc.placedBalance * (0.55 + rng() * 0.4)) / count / 5000)) * 5000;
    const total = instAmt * count + (rng() < 0.15 ? R(1, 99) : 0);
    const placedDay = S.portfolios[acc.portfolioId].placedAt.slice(0, 10);
    let createdDay = addDays(firstDue, -R(7, 20));
    if (createdDay < addDays(placedDay, 3)) createdDay = addDays(placedDay, 3);
    if (createdDay > '2026-11-25') createdDay = randomDateBetween('2026-11-10', '2026-11-25'); // never after the demo clock
    const created = ts(createdDay, R(9, 16), R(0, 59));
    contactSeries(acc, contactFrom, createdDay, [...Array(R(0, 1)).fill('no_contact'), 'agreement']);
    const mode = !revise && rng() < 0.16 ? 'overdue' : 'current';

    if (!revise) {
      const { arr, insts } = arrangement(acc, { total, count, firstDue, status: 'active', createdAt: created, approvedAt: addMinutes(created, R(30, 600)) });
      token(arr, arr.activatedAt);
      if (rng() < 0.5) attach(arr, acc, addMinutes(created, 25));
      // overdue only makes sense when the last past-due installment is recent (so the replacement is still open)
      const lastPast = insts.filter((x) => x.dueDate < DEMO_TODAY).at(-1);
      const m = mode === 'overdue' && lastPast && lastPast.dueDate >= '2026-11-16' ? 'overdue' : 'current';
      play(acc, arr, insts, arr.activatedAt, m);
      if (insts.some((x) => x.status === 'paid')) arr.status = 'partially_paid';
      continue;
    }

    // Revised lineage: v1 → Superseded after k payments; v2 carries the payments; same token (V3 §7).
    const v1 = arrangement(acc, { total, count, firstDue, status: 'superseded', createdAt: created, approvedAt: addMinutes(created, R(30, 600)) });
    const tk = token(v1.arr, v1.arr.activatedAt);
    const k = 1;
    const r1 = request(v1.arr, v1.insts[0], v1.arr.activatedAt);
    deliver(r1, 'sms', addMinutes(v1.arr.activatedAt, 5), 'agent');
    const paidAt = payTime(v1.insts[0], r1);
    pay(v1.insts[0], r1, paidAt, methodPick());
    const r2 = request(v1.arr, v1.insts[1], addMinutes(paidAt, 1));
    const revisedAt = ts(addDays(v1.insts[1].dueDate, -R(4, 8)), 15, R(0, 59));
    if (nth === 0) {
      const a = attempt(r2, addMinutes(revisedAt, -45), 'GCash', 'initiated', null);
      a.status = 'cancelled';
      a.history.push({ status: 'cancelled', at: revisedAt });
      marks.revisedCancelledAttempt = a;
    }
    r2.status = 'cancelled'; r2.cancelledAt = revisedAt;
    for (const x of v1.insts.slice(k)) x.status = 'cancelled';
    v1.arr.supersededAt = revisedAt;
    v1.arr.history.push({ action: 'superseded', by: 'supervisor', at: revisedAt });
    const paid = v1.insts[0].amount;
    const newCount = count - k + 2;
    const newParts = splitInstallments(total - paid, newCount);
    const v2Id = oid('ar');
    v1.arr.supersededBy = v2Id;
    const v2 = arrangement(acc, {
      id: v2Id, lineageId: v1.arr.lineageId, version: 2, total, count: k + newCount,
      firstDue: v1.arr.firstDue, amounts: [paid, ...newParts], status: 'partially_paid',
      createdAt: revisedAt, approvedAt: addMinutes(revisedAt, 2),
    });
    v2.arr.supersedes = v1.arr.id;
    // carried payment (already paid on v1)
    Object.assign(v2.insts[0], { status: 'paid', paidAt: v1.insts[0].paidAt, paymentId: v1.insts[0].paymentId, carriedFrom: v1.insts[0].id });
    const newFirstDue = addMonths(v1.insts[1].dueDate, 1);
    v2.insts.slice(1).forEach((x, j) => { x.dueDate = addMonths(newFirstDue, j); });
    v2.arr.history.unshift({ action: 'revised', by: 'supervisor', at: revisedAt, note: `Extended to ${newCount} remaining installments` });
    audit(revisedAt, 'supervisor', 'arrangement.revise', v2Id, acc.id, `v1 → v2: ${newCount} remaining installments; same link`);
    void tk;
    play(acc, v2.arr, v2.insts.slice(1), addMinutes(revisedAt, 3), 'current', 'system');
  }

  // Pending / initiated attempts on open requests (bulk only), one of them stale (> 24 h).
  const liveOpen = Object.values(S.requests).filter((r) => OPEN.includes(r.status) && !r.accountId.match(/^ac_[a-z]/));
  const pendSlots = liveOpen.filter((r) => S.installments[r.installmentId].status === 'due').slice(0, 4);
  if (pendSlots.length < 4) throw new Error('seed: not enough open requests for pending attempts');
  marks.pendingStale = attempt(pendSlots[0], ts('2026-11-24', 21, 7), 'Online banking', 'pending');
  attempt(pendSlots[1], ts('2026-11-26', 9, 12), 'GCash', 'pending');
  attempt(pendSlots[2], ts('2026-11-26', 9, 41), 'Maya', 'pending');
  attempt(pendSlots[3], ts('2026-11-26', 8, 40), 'Card', 'initiated');
  for (const r of pendSlots.slice(0, 3)) if (r.status !== 'opened') r.status = 'opened';

  // Duplicate payments on two devices (E2): one refunded + resolved, one still open.
  const novPaid = Object.values(S.installments)
    .filter((x) => x.status === 'paid' && x.paidAt >= '2026-11-03' && x.paidAt <= '2026-11-20' && !x.carriedFrom && !S.arrangements[x.arrangementId].accountId.match(/^ac_[a-z]/))
    .sort((a, b) => (a.paidAt < b.paidAt ? -1 : 1));
  for (const [j, inst] of [novPaid[3], novPaid[Math.floor(novPaid.length / 2)]].entries()) {
    const req = Object.values(S.requests).find((r) => r.installmentId === inst.id && r.status === 'paid');
    const at = addMinutes(inst.paidAt, R(2, 9));
    const att = attempt(req, addMinutes(at, -3), pick(rng, METHODS), 'paid', at);
    const p = payment(req, att, at);
    if (j === 0) {
      const refundedAt = ts(addDays(at.slice(0, 10), 2), 11, 20);
      att.status = 'refunded';
      att.history.push({ status: 'refunded', at: refundedAt });
      p.refunded = true;
      p.refundedAt = refundedAt;
    }
    marks.duplicates.push({ p, att, refunded: j === 0 });
  }
  // Late / post-expiry payment (E3): verified 2 hours after its request expired.
  {
    const inst = novPaid[novPaid.length - 5];
    const req = Object.values(S.requests).find((r) => r.installmentId === inst.id && r.status === 'paid');
    req.expiresAt = addMinutes(inst.paidAt, -120);
    req.lateAfterExpiry = true;
    marks.late = { inst, req, p: S.payments[inst.paymentId] };
  }

  // ---------------------------------------------------------------- renumber chronologically
  const byTime = (field) => (a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0);
  const reqs = Object.values(S.requests).sort(byTime('createdAt'));
  const atts = Object.values(S.attempts).sort(byTime('createdAt'));
  const evs = Object.values(S.webhookEvents).sort(byTime('receivedAt'));
  if (reqs.length >= S.seq.req || atts.length >= S.seq.txn || evs.length >= S.seq.evt) {
    throw new Error(`seed: too many records for the fixed sequences (${reqs.length}/${atts.length}/${evs.length})`);
  }
  const reqMap = {}, attMap = {}, payMap = {}, attNum = {};
  reqs.forEach((r, i) => { reqMap[r.id] = seqId('MBA-REQ', S.seq.req - reqs.length + i); });
  atts.forEach((a, i) => { const n = S.seq.txn - atts.length + i; attMap[a.id] = seqId('MBA-TXN', n); attNum[a.id] = n; });
  const evMap = {};
  evs.forEach((e, i) => { evMap[e.id] = `evt_${S.seq.evt - evs.length + i}`; });
  for (const p of Object.values(S.payments)) payMap[p.id] = `pm_${attNum[p.attemptId]}`;

  S.requests = {};
  for (const r of reqs) {
    r.id = reqMap[r.id];
    if (r.replacesId) r.replacesId = reqMap[r.replacesId];
    if (r.replacedById) r.replacedById = reqMap[r.replacedById];
    S.requests[r.id] = r;
  }
  S.attempts = {};
  for (const a of atts) {
    const n = attNum[a.id];
    a.id = attMap[a.id];
    a.requestId = reqMap[a.requestId];
    a.provider = { checkoutSessionId: `cs_test_${n}` };
    if (a.status === 'paid' || a.status === 'refunded') a.provider.paymentId = `pay_test_${n}`;
    S.attempts[a.id] = a;
  }
  const pays = Object.values(S.payments);
  S.payments = {};
  for (const p of pays) {
    p.id = payMap[p.id];
    p.attemptId = attMap[p.attemptId];
    S.payments[p.id] = p;
  }
  S.webhookEvents = {};
  for (const e of evs) {
    e.id = evMap[e.id];
    e.attemptId = attMap[e.attemptId];
    S.webhookEvents[e.id] = e;
  }
  for (const x of Object.values(S.installments)) if (x.paymentId) x.paymentId = payMap[x.paymentId];

  // ---------------------------------------------------------------- reconciliation exceptions (V3 §13, all 8 types)
  const novPays = Object.values(S.payments).filter((p) => p.paidAt >= '2026-11-01' && !p.refunded).sort(byTime('paidAt'));
  const octPays = Object.values(S.payments).filter((p) => p.paidAt >= '2026-10-01' && p.paidAt < '2026-11-01').sort(byTime('paidAt'));
  const fp = (c) => `₱${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  let excN = 1;
  const exc = (type, refs, status, at, detail, extra = {}) => {
    const e = { id: `EXC-${String(excN++).padStart(4, '0')}`, type, refs, status, at, detail, ...extra };
    S.exceptions[e.id] = e;
    return e;
  };
  const pAmt = novPays[7];
  exc('amount_mismatch', { attemptId: pAmt.attemptId, paymentId: pAmt.id }, 'open', addMinutes(DEMO_NOW, -235),
    `Provider settlement line shows ${fp(pAmt.gross - 2000)}; the platform posted ${fp(pAmt.gross)}.`);
  exc('unmatched_provider', { providerPaymentId: 'pay_test_77812' }, 'open', addMinutes(DEMO_NOW, -230),
    `PayMongo reports a ${fp(250000)} GCash payment (pay_test_77812) with no matching platform record — likely a missed webhook.`);
  exc('stale_pending', { attemptId: marks.pendingStale.id }, 'open', ts('2026-11-25', 21, 10),
    `Attempt ${marks.pendingStale.id} has been Pending for more than 24 hours; polling has not returned a final status.`);
  const pMiss = novPays[19];
  exc('missing_at_provider', { attemptId: pMiss.attemptId, paymentId: pMiss.id }, 'open', addMinutes(DEMO_NOW, -225),
    `Platform payment ${pMiss.id} (${fp(pMiss.gross)}) is not in the PayMongo payments report for ${pMiss.paidAt.slice(0, 10)}.`);
  const dupOpen = marks.duplicates.find((d) => !d.refunded);
  const dupDone = marks.duplicates.find((d) => d.refunded);
  exc('duplicate_overpayment', { attemptId: dupOpen.att.id, paymentId: dupOpen.p.id }, 'open', addMinutes(dupOpen.p.paidAt, 30),
    `Second payment for the same request within minutes (paid on two devices). Surplus ${fp(dupOpen.p.gross)} — refund or hold as credit.`);
  exc('duplicate_overpayment', { attemptId: dupDone.att.id, paymentId: dupDone.p.id }, 'resolved', addMinutes(dupDone.p.paidAt, 30),
    `Second payment for the same request (paid on two devices). Surplus ${fp(dupDone.p.gross)}.`,
    { note: 'Borrower confirmed the double payment; surplus refunded in full.', resolvedBy: 'finance', resolvedAt: dupDone.p.refundedAt });
  exc('late_payment', { attemptId: marks.late.p.attemptId, paymentId: marks.late.p.id }, 'open', addMinutes(marks.late.p.paidAt, 15),
    `Verified 2 hours after its request expired. Posted (money was taken); review only.`);
  const pStat = novPays[31];
  exc('status_mismatch', { attemptId: pStat.attemptId, paymentId: pStat.id }, 'open', addMinutes(DEMO_NOW, -220),
    `PayMongo shows ${pStat.id} as Refunded; the platform still shows Paid.`);
  const pRes = octPays[12];
  exc('amount_mismatch', { attemptId: pRes.attemptId, paymentId: pRes.id }, 'resolved', addMinutes(pRes.paidAt, 900),
    `Provider settlement line differed by ${fp(1000)} (rounding on the report).`,
    { note: 'Provider corrected the settlement report; amounts now match.', resolvedBy: 'finance', resolvedAt: addMinutes(pRes.paidAt, 2900) });
  const pRev = novPays[2];
  exc('late_payment', { attemptId: pRev.attemptId, paymentId: pRev.id }, 'in_review', addMinutes(pRev.paidAt, 20),
    `Verified shortly after the request's expiry time; checking the session timeline.`);

  // ---------------------------------------------------------------- payouts (weekly PayMongo → MBA bank) + reconciled flags
  const flagged = new Set(Object.values(S.exceptions).filter((e) => e.status !== 'resolved' && e.refs.paymentId).map((e) => e.refs.paymentId));
  for (const p of Object.values(S.payments)) {
    if (p.paidAt < '2026-11-25' && !flagged.has(p.id)) {
      p.reconciled = true;
      p.reconciledAt = ts(addDays(p.paidAt.slice(0, 10), 1), 6, 0);
    }
  }
  const weekStart = (iso) => {
    const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  };
  const weeks = {};
  for (const p of Object.values(S.payments).sort(byTime('paidAt'))) (weeks[weekStart(p.paidAt)] ||= []).push(p);
  const refundsByWeek = {};
  for (const p of Object.values(S.payments)) if (p.refunded) (refundsByWeek[weekStart(p.refundedAt)] ||= []).push(p);
  let mismatchSet = false;
  for (const wk of Object.keys(weeks).sort()) {
    const list = weeks[wk];
    const payoutDate = addDays(wk, 9); // Wednesday after the week closes
    const gross = list.reduce((s, p) => s + p.gross, 0);
    const fees = list.reduce((s, p) => s + p.fee, 0);
    const refunds = (refundsByWeek[wk] || []).reduce((s, p) => s + p.gross, 0);
    const net = gross - fees - refunds;
    const id = `po_${wk.replace(/-/g, '')}`;
    const received = payoutDate <= DEMO_TODAY;
    const po = { id, periodStart: wk, periodEnd: addDays(wk, 6), payoutDate, count: list.length, gross, fees, refunds, net, bankDeposit: received ? net : null, status: received ? 'reconciled' : 'expected', paymentIds: list.map((p) => p.id) };
    if (received && !mismatchSet && wk >= '2026-11-09') {
      po.bankDeposit = net - 15000;
      po.status = 'mismatch';
      mismatchSet = true;
      exc('payout_mismatch', { payoutId: id }, 'open', ts(payoutDate, 16, 0),
        `Bank deposit ${fp(po.bankDeposit)} is ${fp(15000)} less than the payout net ${fp(net)} (gross ${fp(gross)} − fees ${fp(fees)} − refunds ${fp(refunds)}).`);
    }
    S.payouts[id] = po;
    for (const p of list) p.payoutId = id;
  }
  if (!mismatchSet) throw new Error('seed: no payout available for the payout_mismatch exception');

  // ---------------------------------------------------------------- import batches (one per placement + one partial)
  const perPf = {};
  for (const a of Object.values(S.accounts)) perPf[a.portfolioId] = (perPf[a.portfolioId] || 0) + 1;
  let ibN = 1;
  const ib = (portfolioId, filename, status, rows, accepted, errors, at) => {
    const b = { id: `ib_${String(ibN++).padStart(3, '0')}`, portfolioId, filename, status, rows, accepted, errors, at };
    S.importBatches[b.id] = b;
  };
  ib('pf_sbq3', 'sample-bank-q3-placement.csv', 'accepted', perPf.pf_sbq3, perPf.pf_sbq3, [], S.portfolios.pf_sbq3.placedAt);
  ib('pf_dla', 'demo-lender-a-placement.csv', 'accepted', perPf.pf_dla, perPf.pf_dla, [], S.portfolios.pf_dla.placedAt);
  ib('pf_tdb', 'telco-demo-b-placement.csv', 'accepted', perPf.pf_tdb - 18, perPf.pf_tdb - 18, [], S.portfolios.pf_tdb.placedAt);
  ib('pf_tdb', 'telco-demo-b-topup.csv', 'partial', 20, 18, [
    { row: 7, field: 'mobile', message: 'Mobile number must look like +639XXXXXXXXX' },
    { row: 15, field: 'placed_balance', message: 'Placed balance must be greater than zero' },
  ], '2026-09-03T10:30:00+08:00');

  // ---------------------------------------------------------------- contract / agreement files (2026-11-26)
  // User request: Transactions shows each borrower's own contract and signed agreement. Every
  // arrangement that reached approval gets the creditor's original contract (received with the
  // placement) and, where the random pass above gave it none, the signed arrangement agreement.
  // Deterministic and RNG-free, so every figure above is unchanged.
  {
    const CONTRACT_NAME = { cr_sb: 'Loan contract', cr_dl: 'Loan contract', cr_tc: 'Postpaid service contract' };
    const sizeOf = (key) => {
      let x = 0x811c9dc5;
      for (let i = 0; i < key.length; i++) { x ^= key.charCodeAt(i); x = Math.imul(x, 0x01000193); }
      return (80 + ((x >>> 0) % 341)) * 1024;
    };
    const uploader = (arr) => S.agents[arr.createdBy]?.name ?? 'Agent';
    const lineages = {};
    for (const a of Object.values(S.arrangements)) (lineages[a.lineageId] ||= []).push(a);
    const has = {};
    for (const f of Object.values(S.attachments)) (has[S.arrangements[f.arrangementId].lineageId] ||= new Set()).add(f.sample);
    for (const ln of Object.keys(lineages).sort()) {
      const versions = lineages[ln].sort((x, y) => x.version - y.version);
      if (!versions.some((v) => v.activatedAt)) continue;
      const first = versions[0];
      const signed = versions.filter((v) => v.activatedAt).at(-1);
      const acc = S.accounts[first.accountId];
      const kinds = has[ln] ?? new Set();
      if (!kinds.has('contract')) {
        const id = oid('at');
        S.attachments[id] = { id, arrangementId: first.id, filename: `${CONTRACT_NAME[acc.creditorId] ?? 'Contract'} ${acc.ref}.pdf`, size: sizeOf(`${id}:contract`), uploader: uploader(first), at: addMinutes(first.createdAt, 10), version: 1, sample: 'contract' };
      }
      if (!kinds.has('agreement')) {
        const id = oid('at');
        S.attachments[id] = { id, arrangementId: signed.id, filename: `Signed agreement ${acc.ref}.pdf`, size: sizeOf(`${id}:agreement`), uploader: uploader(signed), at: addMinutes(signed.createdAt, 20), version: 1, sample: 'agreement' };
      }
    }
    // V3 §19 (decided): every file upload is audited, as addAttachment() does at run time.
    for (const f of Object.values(S.attachments)) {
      audit(f.at, 'agent', 'attachment.upload', f.id, S.arrangements[f.arrangementId].accountId, `${f.filename} (v${f.version})`);
    }
  }

  // ---------------------------------------------------------------- audit + notifications
  auditRows.sort(byTime('at'));
  S.audit = auditRows.map((r, i) => ({ ...r, id: `au_${String(i + 1).padStart(5, '0')}` }));

  const recentPays = Object.values(S.payments).sort(byTime('paidAt')).slice(-4);
  const notes = [];
  for (const p of recentPays) {
    const att = S.attempts[p.attemptId];
    notes.push({ at: addSeconds(p.paidAt, 6), text: `Payment verified: ${borrowerName(S.accounts[p.accountId])} ${fp(p.gross)}`, link: `#/m/transactions/${att.id}` });
  }
  notes.push({ at: ts('2026-11-25', 21, 10), text: `Reconciliation exception: Stale pending (${marks.pendingStale.id})`, link: '#/m/reconciliation' });
  const pendArr = Object.values(S.arrangements).filter((a) => a.status === 'pending_approval').sort(byTime('createdAt')).at(-1);
  notes.push({ at: addMinutes(pendArr.createdAt, 5), text: `Arrangement awaiting approval: ${borrowerName(S.accounts[pendArr.accountId])}`, link: `#/m/arrangements/${pendArr.id}` });
  notes.push({ at: ts('2026-11-25', 0, 1), text: `Request expired → replacement created: Luis M. (${S.requests[Object.values(S.requests).find((r) => r.accountId === 'ac_luis' && r.status === 'expired').replacedById].id})`, link: '#/m/accounts/ac_luis' });
  notes.sort(byTime('at')).reverse();
  S.notifications = notes.map((n, i) => ({ id: `nt_${String(i + 1).padStart(4, '0')}`, ...n, read: i >= 3 }));

  S.seq.obj = objN;
  S.seq.exc = excN;
  return S;
}
