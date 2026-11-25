// Simulated PayMongo checkout + webhook pipeline (V3 §10–§11, D§7.7).
// Payment truth: nothing reaches 'paid' except through deliverWebhook().
import { POLICIES } from '../config.js';
import { phtDate } from '../clock.js';
import { formatPHP } from '../money.js';
import { borrowerName } from '../format.js';
import { currentArrangement, installmentsOf, OPEN_REQUEST } from '../selectors.js';
import { stamp, appendAudit, pushNotification, nextSeqId } from '../store.js';
import { borrowerScreen, borrowerAccount } from './borrower.js';
import { ensureOpenRequest } from './links.js';
import { ok, fail, guard, createRequest, nowOf } from './util.js';

const OUTCOMES = ['success', 'pending', 'failed'];
const txnNumber = (attemptId) => Number(String(attemptId).slice(-6));
const DEFAULT_FAIL = 'Declined by issuer (simulated)';

function pendingFor(state, accountId) {
  return Object.values(state.attempts).find((a) => a.accountId === accountId && a.status === 'pending') || null;
}

/** Creates a reconciliation exception on a draft. */
export function raiseException(draft, type, refs, detail, at) {
  const id = `EXC-${String(draft.seq.exc++).padStart(4, '0')}`;
  draft.exceptions[id] = { id, type, refs, status: 'open', at, detail };
  return draft.exceptions[id];
}

/** B3/B7 → B4 (simulated checkout panel). */
export function beginCheckout(store) {
  const s = store.get();
  const scr = borrowerScreen(s);
  if (scr.screen === 'B6' || (scr.screen === 'B5' && scr.data?.attempt?.status === 'pending')) {
    return fail('pending_exists', "We're still confirming your last payment. Please don't pay again.");
  }
  if (!['B3', 'B7', 'B4'].includes(scr.screen)) return fail('not_payable', 'There is nothing to pay right now.');
  store.set((d) => { d.borrower.screenOverride = 'B4'; d.borrower.error = null; });
  return ok();
}

/** B4 → back to the arrangement (B3). */
export function cancelCheckout(store) {
  store.set((d) => { if (d.borrower.screenOverride === 'B4') d.borrower.screenOverride = null; });
  return ok();
}

/**
 * Starts ONE checkout attempt for the current request (status 'pending' until the webhook).
 * A second call while one is pending returns 'pending_exists' (double-click safe).
 */
export function startCheckout(store, { method, outcome = 'success' } = {}) {
  const s = store.get();
  const acc = borrowerAccount(s);
  if (acc && pendingFor(s, acc.id)) return fail('pending_exists', "We're still confirming your last payment. Please don't pay again.");
  if (!POLICIES.methods.includes(method)) return fail('bad_method', 'Choose a payment method.');
  if (!OUTCOMES.includes(outcome)) return fail('bad_outcome', 'Choose a demo outcome.');
  const scr = borrowerScreen(s);
  if (!['B3', 'B4', 'B7'].includes(scr.screen) || !acc) return fail('not_payable', 'There is nothing to pay right now.');
  const arr = currentArrangement(s, acc.id);
  return store.set((d) => {
    const at = stamp(d);
    const req = ensureOpenRequest(d, d.arrangements[arr.id], at);
    // one active attempt per request: an unfinished session is expired first (V3 §10.2)
    for (const a of Object.values(d.attempts)) {
      if (a.requestId === req.id && a.status === 'initiated') {
        a.status = 'expired';
        a.history.push({ status: 'expired', at });
      }
    }
    const n = d.seq.txn;
    const id = nextSeqId(d, 'txn');
    d.attempts[id] = {
      id, requestId: req.id, accountId: acc.id, amount: req.amount, method, outcome, status: 'pending',
      provider: { checkoutSessionId: `cs_test_${n}` },
      history: [{ status: 'initiated', at }, { status: 'pending', at }], createdAt: at,
    };
    if (req.status === 'created' || req.status === 'sent') { req.status = 'opened'; req.openedAt = req.openedAt || at; }
    d.borrower.screenOverride = 'B5';
    d.borrower.attemptId = id;
    appendAudit(d, { role: 'borrower', action: 'checkout.started', target: id, accountId: acc.id, detail: `${method} · ${formatPHP(req.amount)} · simulated session cs_test_${n}` }, at);
    return ok({ attemptId: id });
  });
}

/**
 * Simulated webhook: received → signature_valid → not_duplicate → verified_api → posted | failed_recorded.
 * 'paid' posts the payment exactly once and updates installment, request, arrangement, account.
 */
export function deliverWebhook(store, attemptId, kind) {
  const s = store.get();
  const att0 = s.attempts[attemptId];
  if (!att0) return fail('not_found', 'Attempt not found.');
  if (!['paid', 'failed'].includes(kind)) return fail('bad_kind', 'Unknown webhook kind.');
  if (att0.status !== 'pending') return fail('not_pending', 'This attempt already has a final status.');
  return store.set((d) => {
    const at = stamp(d);
    const att = d.attempts[attemptId];
    const req = d.requests[att.requestId];
    const acc = d.accounts[att.accountId];
    const evId = nextSeqId(d, 'evt');
    const names = ['received', 'signature_valid', 'not_duplicate', 'verified_api', kind === 'paid' ? 'posted' : 'failed_recorded'];
    const steps = names.map((name, i) => ({ name, ok: true, at: i === 0 ? at : stamp(d) }));
    d.webhookEvents[evId] = { id: evId, attemptId, kind, receivedAt: at, steps };
    const onThisBorrower = borrowerAccount(d)?.id === acc.id;
    const name = borrowerName(acc);

    if (kind === 'failed') {
      att.status = 'failed';
      att.failureReason = att.outcome === 'failed' || !att.outcome ? DEFAULT_FAIL : 'Payment not completed (simulated)';
      att.history.push({ status: 'failed', at });
      if (onThisBorrower) { d.borrower.screenOverride = 'B7'; d.borrower.attemptId = attemptId; }
      appendAudit(d, { role: 'system', action: 'webhook.failed', target: attemptId, accountId: acc.id, detail: att.failureReason, before: 'pending', after: 'failed' });
      return ok({ eventId: evId });
    }

    // ---- paid: post once
    const n = txnNumber(attemptId);
    att.status = 'paid';
    att.history.push({ status: 'paid', at });
    att.provider.paymentId = `pay_test_${n}`;
    const fee = Math.round((att.amount * POLICIES.feePct) / 100);
    const pay = { id: `pm_${n}`, attemptId, accountId: acc.id, gross: att.amount, fee, net: att.amount - fee, method: att.method, paidAt: at, reconciled: false, refunded: false, refundedAt: null };
    d.payments[pay.id] = pay;
    const late = !OPEN_REQUEST.includes(req.status) && req.status !== 'paid';
    const inst = d.installments[req.installmentId];
    const arr = d.arrangements[req.arrangementId];
    let completed = false;
    if (inst.status === 'paid') {
      // money landed twice for one installment (E2): post it, never drop it, raise Overpayment
      raiseException(d, 'duplicate_overpayment', { attemptId, paymentId: pay.id }, `Second payment for installment ${inst.seq} (${formatPHP(pay.gross)}). Refund or hold as credit.`, at);
    } else {
      req.status = 'paid';
      req.paidAt = at;
      if (late) req.lateAfterExpiry = true;
      inst.status = 'paid';
      inst.paidAt = at;
      inst.paymentId = pay.id;
      for (const r of Object.values(d.requests)) {
        if (r.id !== req.id && r.installmentId === inst.id && OPEN_REQUEST.includes(r.status)) { r.status = 'cancelled'; r.cancelledAt = at; }
      }
      const insts = installmentsOf(d, arr.id);
      const paidSum = insts.filter((i) => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
      completed = paidSum >= arr.total && insts.every((i) => ['paid', 'cancelled'].includes(i.status));
      if (completed) {
        const before = acc.status;
        arr.status = 'completed';
        arr.completedAt = at;
        (arr.history ||= []).push({ action: 'completed', by: 'system', at });
        acc.status = 'settled';
        appendAudit(d, { role: 'system', action: 'automation.settled', target: arr.id, accountId: acc.id, detail: 'Verified payments equal the commitment → Arrangement Completed, Account Settled', before, after: 'settled' });
      } else {
        if (['active', 'partially_paid'].includes(arr.status)) arr.status = 'partially_paid';
        const hasOpen = Object.values(d.requests).some((r) => r.arrangementId === arr.id && OPEN_REQUEST.includes(r.status));
        const nextInst = insts.find((i) => ['scheduled', 'due', 'overdue'].includes(i.status));
        if (!hasOpen && nextInst && ['active', 'partially_paid'].includes(arr.status)) createRequest(d, arr, nextInst, at);
      }
    }
    if (late) {
      raiseException(d, 'late_payment', { attemptId, paymentId: pay.id }, `Verified after its request ${req.id} was no longer open. Posted (money was taken); review only.`, at);
      pushNotification(d, `Reconciliation exception: Late payment (${attemptId})`, '#/m/reconciliation', at);
    }
    appendAudit(d, { role: 'system', action: 'webhook.paid', target: attemptId, accountId: acc.id, detail: `Verified and posted once · ${formatPHP(pay.gross)} · ${pay.method}`, before: 'pending', after: 'paid' });
    pushNotification(d, `Payment verified: ${name} ${formatPHP(pay.gross)}`, `#/m/transactions/${attemptId}`, at);
    if (completed) pushNotification(d, `Arrangement completed: ${name} — account settled`, `#/m/accounts/${acc.id}`, at);
    if (onThisBorrower) { d.borrower.screenOverride = completed ? 'B9' : 'B8'; d.borrower.attemptId = attemptId; }
    return ok({ eventId: evId, paymentId: pay.id, completed });
  });
}

/** Re-sends a processed event: acknowledged as a duplicate, never re-posted (V3 E5). */
export function replayWebhook(store, eventId) {
  const ev = store.get().webhookEvents[eventId];
  if (!ev) return fail('not_found', 'Webhook event not found.');
  return store.set((d) => {
    const at = stamp(d);
    const id = nextSeqId(d, 'evt');
    const original = ev.duplicateOf || ev.id;
    d.webhookEvents[id] = {
      id, attemptId: ev.attemptId, kind: ev.kind, receivedAt: at, duplicateOf: original,
      steps: [{ name: 'received', ok: true, at }, { name: 'signature_valid', ok: true, at: stamp(d) }, { name: 'duplicate_ignored', ok: true, at: stamp(d) }],
    };
    appendAudit(d, { role: 'system', action: 'webhook.replay', target: ev.attemptId, accountId: d.attempts[ev.attemptId]?.accountId, detail: `Event ${original} replayed as ${id} — duplicate ignored, not re-posted` });
    return ok({ duplicate: true, eventId: id });
  });
}

/** Finance refund. Reopens a Completed arrangement and un-settles the account (V3 §11.4). */
export function refundPayment(store, paymentId) {
  const denied = guard(store, 'payment.refund');
  if (denied) return denied;
  const s = store.get();
  const p0 = s.payments[paymentId];
  if (!p0) return fail('not_found', 'Payment not found.');
  if (p0.refunded) return fail('already_refunded', 'This payment has already been refunded.');
  return store.set((d) => {
    const at = stamp(d);
    const pay = d.payments[paymentId];
    const acc = d.accounts[pay.accountId];
    const att = d.attempts[pay.attemptId];
    pay.refunded = true;
    pay.refundedAt = at;
    att.status = 'refunded';
    att.history.push({ status: 'refunded', at });
    const today = phtDate(nowOf(d));
    const insts = Object.values(d.installments).filter((i) => i.paymentId === paymentId && d.arrangements[i.arrangementId].status !== 'superseded');
    let reopened = false;
    for (const inst of insts) {
      inst.status = inst.dueDate < today ? 'overdue' : 'due';
      delete inst.paidAt;
      delete inst.paymentId;
      const arr = d.arrangements[inst.arrangementId];
      if (arr.status === 'completed') {
        const anyPaid = installmentsOf(d, arr.id).some((i) => i.status === 'paid');
        arr.status = anyPaid ? 'partially_paid' : 'active';
        arr.reopenedAt = at;
        delete arr.completedAt;
        (arr.history ||= []).push({ action: 'reopened', by: 'system', at, note: 'Refund brought paid-to-date below the commitment' });
        reopened = true;
      }
      if (acc.status === 'settled') acc.status = 'arrangement_active';
      const open = Object.values(d.requests).some((r) => r.installmentId === inst.id && OPEN_REQUEST.includes(r.status));
      if (!open) createRequest(d, arr, inst, at);
    }
    appendAudit(d, { action: 'payment.refund', target: pay.attemptId, accountId: acc.id, detail: `Refunded ${formatPHP(pay.gross)}${reopened ? ' — arrangement reopened, account no longer Settled' : ''}`, before: 'paid', after: 'refunded' });
    pushNotification(d, `Refund issued: ${borrowerName(acc)} ${formatPHP(pay.gross)}`, `#/m/transactions/${pay.attemptId}`, at);
    if (reopened) pushNotification(d, `Supervisor alert: refund reopened ${borrowerName(acc)}'s arrangement`, `#/m/accounts/${acc.id}`, at);
    return ok({ reopened });
  });
}
