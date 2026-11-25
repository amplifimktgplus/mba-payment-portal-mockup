// Borrower session (V3 §9, D§6): link/QR or reference → masked pre-verification → OTP →
// the arrangement's current state. Nothing that reveals a debt is returned before OTP.
import { POLICIES, payeeLine } from '../config.js';
import { addMinutes, msBetween } from '../clock.js';
import { maskMobile, maskTail } from '../format.js';
import { mulberry32, hashStr } from '../rng.js';
import { currentArrangement, currentOpenRequest, arrangementProgress, installmentsOf } from '../selectors.js';
import { stamp, appendAudit, initialBorrower } from '../store.js';
import { resolveToken } from './links.js';
import { ok, fail, nowOf } from './util.js';

const MASK = '••••';
const normRef = (ref) => String(ref ?? '').trim().toUpperCase();
const minutes = (n) => n * 60000;

/** The account behind the borrower session (token first, then reference), or null. */
export function borrowerAccount(state) {
  const b = state.borrower;
  if (b.token) {
    const t = state.tokens[b.token];
    return t ? state.accounts[t.accountId] ?? null : null;
  }
  if (b.ref) return Object.values(state.accounts).find((a) => a.ref === b.ref) ?? null;
  return null;
}

/** Opens a link (#/b/t/<token>). Re-opening the same link keeps the verified session (reload). */
export function openByToken(store, token) {
  const s = store.get();
  const res = resolveToken(s, token);
  return store.set((d) => {
    const at = stamp(d);
    const b = d.borrower;
    if (!(b.token === token && !b.ref)) d.borrower = { ...initialBorrower(), token };
    if (res.status === 'active' && res.arrangementId) {
      const req = currentOpenRequest(d, res.arrangementId);
      if (req && req.status === 'sent') {
        req.status = 'opened';
        req.openedAt = at;
      }
      appendAudit(d, { role: 'borrower', action: 'link.opened', target: res.arrangementId, accountId: res.accountId, detail: req ? `Opened via arrangement link (${req.id})` : 'Opened via arrangement link' }, at);
    }
    return ok({ status: res.status });
  });
}

/** Manual entry (B0). Always the same generic answer, so references cannot be enumerated (V3 §8.2). */
export function openByRef(store, ref) {
  const r = normRef(ref);
  store.set((d) => {
    d.borrower = { ...initialBorrower(), ref: r };
    const acc = Object.values(d.accounts).find((a) => a.ref === r);
    if (acc) {
      const arr = currentArrangement(d, acc.id);
      const tok = arr && Object.values(d.tokens).find((t) => t.lineageId === arr.lineageId && t.status === 'active');
      if (tok) d.borrower.token = tok.token;
    }
  });
  return { ok: true };
}

function otpCode(state) {
  const b = state.borrower;
  const rng = mulberry32(hashStr(`${b.token || b.ref}|${state.seq.tick}|otp`) ^ 20261126);
  return String(Math.floor(rng() * 1e6)).padStart(6, '0');
}

/** Sends (or resends) the 6-digit code. Resend is blocked during the cooldown (V3 §8.1). */
export function sendOtp(store) {
  const s = store.get();
  const b = s.borrower;
  if (!b.token && !b.ref) return fail('no_context', 'Open your link or enter your reference number first.');
  if (b.token && !b.ref && resolveToken(s, b.token).status !== 'active') return fail('link_invalid', 'This link is no longer valid.');
  const now = nowOf(s);
  const otp = b.otp;
  if (otp?.lockedUntil && otp.lockedUntil > now) return fail('locked', 'Too many attempts. Please try again later.', { lockedUntil: otp.lockedUntil });
  if (otp?.sentAt && msBetween(otp.sentAt, now) < minutes(POLICIES.resendCooldownMin)) {
    return fail('cooldown', `You can request a new code ${POLICIES.resendCooldownMin} minutes after the last one.`, { retryAt: addMinutes(otp.sentAt, POLICIES.resendCooldownMin) });
  }
  if (otp && (otp.resends?.length ?? 0) + 1 >= POLICIES.resendMaxPerDay) return fail('daily_limit', 'You have reached the daily limit for new codes. Please contact MBA.');
  const acc = borrowerAccount(s);
  const code = acc ? otpCode(s) : null; // unknown reference: no SMS, same generic screen
  store.set((d) => {
    const at = stamp(d);
    const prev = d.borrower.otp;
    d.borrower.otp = {
      code, sentAt: at, attempts: prev?.attempts ?? 0, lockedUntil: prev?.lockedUntil ?? null,
      resends: prev ? [...(prev.resends || []), at] : [],
    };
    d.borrower.error = null;
    if (acc) appendAudit(d, { role: 'borrower', action: 'otp.sent', target: acc.id, accountId: acc.id, detail: `Code sent by SMS to ${maskMobile(acc.borrower.mobile)}` }, at);
  });
  return ok({ code, maskedMobile: acc ? maskMobile(acc.borrower.mobile) : MASK });
}

/** Checks the code: {ok} | {ok:false, error:'wrong'|'expired'|'locked'|'no_code'}. */
export function verifyOtp(store, code) {
  const s = store.get();
  const otp = s.borrower.otp;
  const now = nowOf(s);
  if (!otp) return fail('no_code', 'Please request a code first.');
  if (otp.lockedUntil && otp.lockedUntil > now) return fail('locked', 'Too many attempts. Please try again later.', { lockedUntil: otp.lockedUntil });
  if (s.borrower.verified && otp.usedAt) return ok({ already: true });
  if (otp.code && msBetween(otp.sentAt, now) > minutes(POLICIES.otpExpiryMin)) {
    store.set((d) => { d.borrower.error = 'expired'; });
    return fail('expired', 'This code has expired. Please request a new one.');
  }
  const acc = borrowerAccount(s);
  if (!otp.code || String(code ?? '').trim() !== otp.code) {
    const attempts = (otp.attempts || 0) + 1;
    const locked = attempts >= POLICIES.otpMaxAttempts;
    store.set((d) => {
      const at = stamp(d);
      const o = d.borrower.otp;
      o.attempts = attempts;
      if (locked) o.lockedUntil = addMinutes(at, POLICIES.lockoutMin);
      d.borrower.error = locked ? 'locked' : 'wrong';
      if (acc && locked) appendAudit(d, { role: 'borrower', action: 'otp.locked', target: acc.id, accountId: acc.id, detail: `${POLICIES.otpMaxAttempts} wrong codes → locked for ${POLICIES.lockoutMin} minutes` }, at);
    });
    if (locked) return fail('locked', 'Too many attempts. Please try again later.');
    const left = POLICIES.otpMaxAttempts - attempts;
    return fail('wrong', `That code didn't match. You have ${left} ${left === 1 ? 'try' : 'tries'} left.`, { attemptsLeft: left });
  }
  store.set((d) => {
    const at = stamp(d);
    const b = d.borrower;
    b.verified = true;
    b.verifiedAt = at;
    b.error = null;
    b.screenOverride = null;
    b.otp.code = null; // single-use
    b.otp.usedAt = at;
    if (acc) appendAudit(d, { role: 'borrower', action: 'borrower.verified', target: acc.id, accountId: acc.id, detail: 'Identity verified by SMS code' }, at);
  });
  return ok();
}

/** Demo action: makes the current code expire now and lifts the resend cooldown. */
export function expireOtpNow(store) {
  const otp = store.get().borrower.otp;
  if (!otp) return fail('no_code', 'No code has been sent.');
  const shift = POLICIES.resendCooldownMin + 1;
  store.set((d) => {
    const o = d.borrower.otp;
    o.sentAt = addMinutes(o.sentAt, -shift);
    o.resends = (o.resends || []).map((t) => addMinutes(t, -shift));
  });
  return ok();
}

/** Ends the borrower session (demo tools / "Not you?"). */
export function exitBorrower(store) {
  store.set((d) => { d.borrower = initialBorrower(); });
  return ok();
}

/** Back to the arrangement screen (B3) from checkout / result screens. */
export function clearScreenOverride(store) {
  store.set((d) => { d.borrower.screenOverride = null; d.borrower.error = null; });
  return ok();
}

function otpView(otp, now) {
  if (!otp) return null;
  return {
    sentAt: otp.sentAt,
    expiresAt: addMinutes(otp.sentAt, POLICIES.otpExpiryMin),
    resendAt: addMinutes(otp.sentAt, POLICIES.resendCooldownMin),
    canResend: msBetween(otp.sentAt, now) >= minutes(POLICIES.resendCooldownMin),
    attempts: otp.attempts || 0,
    attemptsLeft: Math.max(0, POLICIES.otpMaxAttempts - (otp.attempts || 0)),
  };
}

const typicalAmount = (insts) => {
  const counts = {};
  for (const i of insts) counts[i.amount] = (counts[i.amount] || 0) + 1;
  return Number(Object.entries(counts).sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))[0]?.[0] ?? 0);
};

/** Builds what a verified borrower may see about one arrangement. */
function arrangementView(state, acc, arr) {
  const creditor = state.creditors[acc.creditorId];
  const progress = arrangementProgress(state, arr.id);
  const req = currentOpenRequest(state, arr.id);
  const insts = installmentsOf(state, arr.id);
  const inst = req ? state.installments[req.installmentId] : (progress.next ? state.installments[progress.next.installmentId] : null);
  return {
    firstName: acc.borrower.first,
    creditorName: creditor?.name ?? '',
    payee: payeeLine(creditor?.name ?? ''),
    maskedAccount: maskTail(acc.creditorAccountNo || acc.ref),
    maskedMobile: maskMobile(acc.borrower.mobile),
    arrangementId: arr.id,
    progress,
    plan: { count: arr.count, installment: typicalAmount(insts), total: arr.total, frequency: arr.frequency },
    remaining: progress.remaining,
    amountDue: req ? req.amount : inst?.amount ?? 0,
    dueDate: inst?.dueDate ?? null,
    installmentSeq: inst?.seq ?? null,
    overdue: inst?.status === 'overdue',
    requestId: req?.id ?? null,
    methods: [...POLICIES.methods],
    earlyPayoff: POLICIES.earlyPayoff,
  };
}

function attemptView(state, attemptId) {
  const a = state.attempts[attemptId];
  if (!a) return null;
  const pay = Object.values(state.payments).find((p) => p.attemptId === attemptId) ?? null;
  const events = Object.values(state.webhookEvents).filter((e) => e.attemptId === attemptId).sort((x, y) => (x.receivedAt < y.receivedAt ? -1 : 1));
  return {
    attemptId: a.id, status: a.status, amount: a.amount, method: a.method ?? null, failureReason: a.failureReason ?? null,
    checkoutSessionId: a.provider?.checkoutSessionId ?? null, providerRef: a.provider?.paymentId ?? null,
    paidAt: pay?.paidAt ?? null, payment: pay, steps: events[0]?.steps ?? [],
  };
}

/**
 * Which borrower screen to show, and the data it may use (D§6, D§5.3):
 * B0 no context · B10 link not valid · B12 locked · B1/B2 not verified (masked mobile only)
 * · B4/B5/B7/B8/B9 set by checkout actions · B11 disputed or nothing active · B6 pending
 * · B9 completed · B3 otherwise.
 */
export function borrowerScreen(state) {
  const b = state.borrower;
  const now = nowOf(state);
  if (!b.token && !b.ref) return { screen: 'B0', data: {} };
  if (b.token && !b.ref) {
    const r = resolveToken(state, b.token);
    if (r.status !== 'active') return { screen: 'B10', data: { reason: r.status } };
  }
  const acc = borrowerAccount(state);
  const otp = b.otp;
  if (otp?.lockedUntil && otp.lockedUntil > now) {
    return { screen: 'B12', data: { lockedUntil: otp.lockedUntil, lockoutMin: POLICIES.lockoutMin } };
  }
  const fresh = b.verified && (!b.verifiedAt || msBetween(b.verifiedAt, now) <= minutes(POLICIES.sessionIdleMin));
  if (!fresh) {
    return { screen: otp ? 'B2' : 'B1', data: { maskedMobile: acc ? maskMobile(acc.borrower.mobile) : MASK, otp: otpView(otp, now), error: b.error ?? null } };
  }
  if (!acc) return { screen: 'B11', data: { reason: 'none', firstName: null } };
  const arr = currentArrangement(state, acc.id);
  const pending = Object.values(state.attempts).find((a) => a.accountId === acc.id && a.status === 'pending');
  const view = arr && ['active', 'partially_paid', 'completed'].includes(arr.status) ? arrangementView(state, acc, arr) : null;
  const ov = b.screenOverride;
  if (view && ov === 'B4' && !pending) return { screen: 'B4', data: view };
  if (view && ['B5', 'B7', 'B8', 'B9'].includes(ov) && b.attemptId) {
    return { screen: ov, data: { ...view, attempt: attemptView(state, b.attemptId) } };
  }
  if (acc.status === 'disputed') return { screen: 'B11', data: { reason: 'disputed', firstName: acc.borrower.first } };
  if (!view) return { screen: 'B11', data: { reason: 'none', firstName: acc.borrower.first } };
  if (pending) return { screen: 'B6', data: { ...view, attemptId: pending.id, attempt: attemptView(state, pending.id) } };
  if (arr.status === 'completed') {
    const lastPay = Object.values(state.payments).filter((p) => p.accountId === acc.id && !p.refunded).sort((x, y) => (x.paidAt < y.paidAt ? 1 : -1))[0];
    return { screen: 'B9', data: { ...view, attempt: lastPay ? attemptView(state, lastPay.attemptId) : null } };
  }
  return { screen: 'B3', data: view };
}
