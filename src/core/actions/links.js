// Link model (D§5.3, V3 §3/§8.1): ONE arrangement-scoped token per lineage; payment requests
// never have their own link. An expired request never kills the link (replacement request).
import { POLICIES, QR_BASE } from '../config.js';
import { DEMO_NOW, addDays, addMinutes, msBetween } from '../clock.js';
import { maskMobile, maskEmail, borrowerName } from '../format.js';
import { currentArrangement, currentOpenRequest, lineageArrangement, arrangementProgress, installmentsOf, OPEN_REQUEST, LIVE_ARRANGEMENT } from '../selectors.js';
import { stamp, appendAudit, pushNotification } from '../store.js';
import { ok, fail, guard, createRequest, ensureToken, deliveriesOf, sameDay, nowOf } from './util.js';

const CHANNEL_LABEL = { email: 'email', sms: 'SMS' };

/** Status of a token as the borrower would experience it. */
export function resolveToken(state, token) {
  const t = state.tokens[token];
  if (!t) return { status: 'unknown' };
  const arr = lineageArrangement(state, t.lineageId);
  const base = { accountId: t.accountId, arrangementId: arr?.id ?? null };
  if (t.status !== 'active') return { status: t.status, ...base };
  if (arr && arr.status === 'cancelled') return { status: 'revoked', ...base };
  if (arr && arr.status === 'completed' && arr.completedAt
      && msBetween(arr.completedAt, nowOf(state)) > POLICIES.completedReadOnlyDays * 86400000) {
    return { status: 'expired', ...base };
  }
  return { status: 'active', ...base };
}

/** The open request for the arrangement's current installment, created by the system if missing. */
export function ensureOpenRequest(draft, arr, at) {
  const existing = currentOpenRequest(draft, arr.id);
  if (existing) return existing;
  const inst = installmentsOf(draft, arr.id).find((i) => ['due', 'overdue', 'scheduled'].includes(i.status));
  if (!inst) return null;
  return createRequest(draft, arr, inst, at);
}

/** Send (or resend) the arrangement link by email (link + QR) or SMS (link). Cooldown per channel. */
export function sendPaymentLink(store, accountId, channel) {
  const denied = guard(store, 'request.send');
  if (denied) return denied;
  if (!['email', 'sms'].includes(channel)) return fail('bad_channel', 'Choose email or SMS.');
  const s = store.get();
  const acc = s.accounts[accountId];
  if (!acc) return fail('not_found', 'Account not found.');
  if (['disputed', 'on_hold'].includes(acc.status)) return fail('paused', 'Collection contact is paused while the account is disputed or on hold.');
  if (channel === 'email' && !acc.borrower.email) return fail('no_email', 'No email address on file. Send by SMS instead.');
  const arr = currentArrangement(s, accountId);
  if (!arr || !LIVE_ARRANGEMENT.includes(arr.status)) return fail('no_arrangement', 'No active arrangement — create or approve one first.');
  if (!arrangementProgress(s, arr.id).next) return fail('nothing_due', 'Nothing is due on this arrangement.');
  const now = nowOf(s);
  const prior = deliveriesOf(s, accountId, channel);
  const last = prior[prior.length - 1];
  const cooldownMs = POLICIES.resendCooldownMin * 60000;
  if (last && msBetween(last.at, now) < cooldownMs) {
    return fail('cooldown', `A link was sent by ${CHANNEL_LABEL[channel]} less than ${POLICIES.resendCooldownMin} minutes ago. Please wait before resending.`, { retryAt: addMinutes(last.at, POLICIES.resendCooldownMin) });
  }
  if (prior.filter((d) => sameDay(d.at, now)).length >= POLICIES.resendMaxPerDay) {
    return fail('daily_limit', `The daily limit of ${POLICIES.resendMaxPerDay} sends by ${CHANNEL_LABEL[channel]} has been reached.`);
  }
  const to = channel === 'email' ? maskEmail(acc.borrower.email) : maskMobile(acc.borrower.mobile);
  return store.set((d) => {
    const at = stamp(d);
    const a = d.arrangements[arr.id];
    const tok = ensureToken(d, a, at);
    const req = ensureOpenRequest(d, a, at);
    req.deliveries.push({ channel, to, at, by: d.role });
    if (req.status === 'created') req.status = 'sent';
    appendAudit(d, { action: 'request.send', target: req.id, accountId, detail: `Arrangement link sent by ${CHANNEL_LABEL[channel]} to ${to}` });
    return ok({ requestId: req.id, token: tok.token, url: QR_BASE + tok.token, channel, to });
  });
}

/** Revoke the account's active link(s). The borrower then sees B10. */
export function revokeLink(store, accountId) {
  const denied = guard(store, 'request.revoke');
  if (denied) return denied;
  const s = store.get();
  const active = Object.values(s.tokens).filter((t) => t.accountId === accountId && t.status === 'active');
  if (!active.length) return fail('no_token', 'There is no active link to revoke.');
  return store.set((d) => {
    const at = stamp(d);
    for (const t of active) Object.assign(d.tokens[t.token], { status: 'revoked', revokedAt: at });
    appendAudit(d, { action: 'request.revoke', target: active[0].lineageId, accountId, detail: 'Payment link revoked' });
    return ok({ revoked: active.length });
  });
}

/**
 * Demo scheduler for one request (D§7.6): request Expired → installment Overdue →
 * replacement request created (expires DEMO_NOW + grace). The link keeps working.
 */
export function expireRequestNow(store, requestId) {
  const denied = guard(store, 'request.expireDemo');
  if (denied) return denied;
  const s = store.get();
  const req = s.requests[requestId];
  if (!req) return fail('not_found', 'Request not found.');
  if (!OPEN_REQUEST.includes(req.status)) return fail('not_open', 'Only an open request can be expired.');
  const acc = s.accounts[req.accountId];
  return store.set((d) => {
    const at = stamp(d);
    const r = d.requests[requestId];
    const inst = d.installments[r.installmentId];
    const arr = d.arrangements[r.arrangementId];
    r.status = 'expired';
    r.expiredAt = at;
    if (inst.status !== 'paid') inst.status = 'overdue';
    const repl = createRequest(d, arr, inst, at, { expiresAt: addDays(DEMO_NOW, POLICIES.requestGraceDays), replacesId: r.id });
    r.replacedById = repl.id;
    appendAudit(d, { action: 'request.expireDemo', target: r.id, accountId: r.accountId, detail: `Expired → installment ${inst.seq} overdue → replacement ${repl.id}`, before: 'open', after: 'expired' });
    pushNotification(d, `Request expired → replacement created: ${borrowerName(acc)} (${repl.id})`, `#/m/requests/${repl.id}`);
    return ok({ replacementId: repl.id });
  });
}

/** Cancel an open request (Supervisor). Unfinished checkout sessions on it are cancelled too. */
export function cancelRequest(store, requestId) {
  const denied = guard(store, 'request.cancel');
  if (denied) return denied;
  const s = store.get();
  const req = s.requests[requestId];
  if (!req) return fail('not_found', 'Request not found.');
  if (!OPEN_REQUEST.includes(req.status)) return fail('not_open', 'Only an open request can be cancelled.');
  return store.set((d) => {
    const at = stamp(d);
    const r = d.requests[requestId];
    const before = r.status;
    r.status = 'cancelled';
    r.cancelledAt = at;
    for (const a of Object.values(d.attempts)) {
      if (a.requestId === requestId && a.status === 'initiated') {
        a.status = 'cancelled';
        a.history.push({ status: 'cancelled', at });
      }
    }
    appendAudit(d, { action: 'request.cancel', target: r.id, accountId: r.accountId, before, after: 'cancelled' });
    return ok();
  });
}
