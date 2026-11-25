// Shared helpers for actions. Every action returns {ok:true, ...} or {ok:false, error, message}.
import { can, deniedHint } from '../permissions.js';
import { POLICIES } from '../config.js';
import { addDays, phtDate } from '../clock.js';
import { nextSeqId, nowOf } from '../store.js';
import { mulberry32, hashStr, tokenFrom } from '../rng.js';

export const ok = (extra = {}) => ({ ok: true, ...extra });
export const fail = (error, message, extra = {}) => ({ ok: false, error, message: message ?? error, ...extra });

/** Permission re-check at action time (role may have changed while a screen was open). */
export function guard(store, action) {
  const role = store.get().role;
  if (can(role, action)) return null;
  return fail('forbidden', deniedHint(action) || 'Not allowed for this role', { action, role });
}

/** Request expiry: due date + grace, end of day PHT; never earlier than now + grace. */
export function requestExpiry(dueDate, now) {
  const byDue = `${addDays(dueDate, POLICIES.requestGraceDays)}T23:59:00+08:00`;
  const floor = addDays(now, POLICIES.requestGraceDays);
  return byDue > floor ? byDue : floor;
}

/** Creates a payment request (status 'created') on a draft and returns it. */
export function createRequest(draft, arr, inst, at, extra = {}) {
  const r = {
    id: nextSeqId(draft, 'req'), installmentId: inst.id, arrangementId: arr.id, accountId: arr.accountId,
    amount: inst.amount, createdAt: at, expiresAt: extra.expiresAt ?? requestExpiry(inst.dueDate, at),
    status: 'created', deliveries: [],
  };
  if (extra.replacesId) r.replacesId = extra.replacesId;
  draft.requests[r.id] = r;
  if (inst.status === 'scheduled') inst.status = 'due';
  return r;
}

/** Returns the lineage's active token, creating one (non-guessable-looking, deterministic) if none. */
export function ensureToken(draft, arr, at) {
  const existing = Object.values(draft.tokens).find((t) => t.lineageId === arr.lineageId && t.status === 'active');
  if (existing) return existing;
  const rng = mulberry32(hashStr(`${arr.lineageId}|${draft.seq.obj}|${draft.seq.tick}`));
  let token;
  do { token = tokenFrom(rng); } while (draft.tokens[token]);
  draft.tokens[token] = { token, lineageId: arr.lineageId, accountId: arr.accountId, status: 'active', createdAt: at };
  return draft.tokens[token];
}

/** All deliveries of an account on one channel. */
export function deliveriesOf(state, accountId, channel) {
  const out = [];
  for (const r of Object.values(state.requests)) {
    if (r.accountId !== accountId) continue;
    for (const d of r.deliveries || []) if (!channel || d.channel === channel) out.push(d);
  }
  return out.sort((a, b) => (a.at < b.at ? -1 : 1));
}

/** Same-day count helper (PHT). */
export const sameDay = (a, b) => phtDate(a) === phtDate(b);
export { nowOf };
