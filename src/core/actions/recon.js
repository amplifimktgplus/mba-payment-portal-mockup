// Reconciliation (V3 §13): daily match of verified payments; Finance resolves exceptions with a note.
import { stamp, appendAudit, pushNotification } from '../store.js';
import { ok, fail, guard } from './util.js';

const openExceptionPaymentIds = (s) => new Set(Object.values(s.exceptions).filter((e) => e.status !== 'resolved' && e.refs?.paymentId).map((e) => e.refs.paymentId));

/** Marks every verified, unreconciled payment reconciled unless an open exception references it. */
export function runReconciliation(store) {
  const s = store.get();
  const flagged = openExceptionPaymentIds(s);
  const toMatch = Object.values(s.payments).filter((p) => !p.reconciled && !flagged.has(p.id)).map((p) => p.id);
  const openCount = Object.values(s.exceptions).filter((e) => e.status !== 'resolved').length;
  return store.set((d) => {
    const at = stamp(d);
    for (const id of toMatch) { d.payments[id].reconciled = true; d.payments[id].reconciledAt = at; }
    appendAudit(d, { action: 'recon.run', target: 'reconciliation', detail: `${toMatch.length} payments matched; ${openCount} exceptions open` }, at);
    pushNotification(d, `Daily reconciliation: ${toMatch.length} matched, ${openCount} exceptions open`, '#/m/reconciliation', at);
    return ok({ matched: toMatch.length, exceptions: openCount });
  });
}

/** Open → In review. */
export function reviewException(store, id) {
  const denied = guard(store, 'recon.resolve');
  if (denied) return denied;
  const e = store.get().exceptions[id];
  if (!e) return fail('not_found', 'Exception not found.');
  if (e.status !== 'open') return fail('not_open', 'Only an open exception can be put in review.');
  return store.set((d) => {
    d.exceptions[id].status = 'in_review';
    appendAudit(d, { action: 'recon.review', target: id, before: 'open', after: 'in_review' });
    return ok();
  });
}

/** Resolve with a documented reason (note required). */
export function resolveException(store, id, note) {
  const denied = guard(store, 'recon.resolve');
  if (denied) return denied;
  const e = store.get().exceptions[id];
  if (!e) return fail('not_found', 'Exception not found.');
  if (e.status === 'resolved') return fail('already_resolved', 'This exception is already resolved.');
  const text = String(note ?? '').trim();
  if (!text) return fail('note_required', 'A resolution note is required.');
  return store.set((d) => {
    const at = stamp(d);
    const x = d.exceptions[id];
    const before = x.status;
    Object.assign(x, { status: 'resolved', note: text, resolvedBy: d.role, resolvedAt: at });
    appendAudit(d, { action: 'recon.resolve', target: id, detail: text, before, after: 'resolved' }, at);
    return ok();
  });
}
