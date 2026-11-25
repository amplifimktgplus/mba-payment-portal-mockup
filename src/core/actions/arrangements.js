// Arrangement lifecycle (V3 §7): draft → pending approval → active → partially paid → completed;
// revision = new version, same lineage and SAME token; cancel revokes the token.
import { DEMO_TODAY, addMonths, isDateOnly } from '../clock.js';
import { splitInstallments, formatPHP } from '../money.js';
import { borrowerName } from '../format.js';
import { ROLE_LABELS } from '../permissions.js';
import { currentArrangement, installmentsOf, accountBalance, OPEN_REQUEST } from '../selectors.js';
import { stamp, appendAudit, pushNotification, nextObjId } from '../store.js';
import { ok, fail, guard, createRequest, ensureToken } from './util.js';

const IN_PROGRESS = ['draft', 'pending_approval', 'active', 'partially_paid'];
const CLOSED_ACCOUNT = ['settled', 'uncollectable', 'returned'];

function validateTerms({ total, count, firstDue } = {}) {
  if (!Number.isInteger(total) || total <= 0) return fail('bad_total', 'Enter a total greater than zero.');
  if (!Number.isInteger(count) || count < 1 || count > 60) return fail('bad_count', 'Installments must be between 1 and 60.');
  if (!isDateOnly(firstDue) || firstDue < DEMO_TODAY) return fail('bad_first_due', 'The first due date must be today or later.');
  return null;
}

/** Live schedule preview (no state change): [{seq, amount, dueDate}]. */
export function previewSchedule({ total, count, firstDue }) {
  if (validateTerms({ total, count, firstDue })) return [];
  return splitInstallments(total, count).map((amount, i) => ({ seq: i + 1, amount, dueDate: addMonths(firstDue, i) }));
}

function addInstallments(d, arrId, amounts, firstDue, startSeq = 1) {
  return amounts.map((amount, i) => {
    const id = nextObjId(d, 'in');
    d.installments[id] = { id, arrangementId: arrId, seq: startSeq + i, amount, dueDate: addMonths(firstDue, i), status: 'scheduled' };
    return d.installments[id];
  });
}

/** Activation: token (if the lineage has none) + the first request (V3 §8.1). */
function activate(d, arr, at) {
  arr.status = installmentsOf(d, arr.id).some((i) => i.status === 'paid') ? 'partially_paid' : 'active';
  arr.approvedBy = d.role;
  arr.activatedAt = at;
  ensureToken(d, arr, at);
  const first = installmentsOf(d, arr.id).find((i) => ['scheduled', 'due', 'overdue'].includes(i.status));
  if (first) createRequest(d, arr, first, at);
  const acc = d.accounts[arr.accountId];
  if (acc.status !== 'disputed') acc.status = 'arrangement_active';
}

/** Draft an arrangement. Agents → Pending approval; Supervisor/Admin → Active. */
export function createArrangement(store, accountId, terms = {}) {
  const denied = guard(store, 'arrangement.draft');
  if (denied) return denied;
  const s = store.get();
  const acc = s.accounts[accountId];
  if (!acc) return fail('not_found', 'Account not found.');
  const bad = validateTerms(terms);
  if (bad) return bad;
  if (CLOSED_ACCOUNT.includes(acc.status)) return fail('closed', 'This account is closed.');
  if (acc.status === 'disputed') return fail('paused', 'Resolve the dispute before drafting an arrangement.');
  const cur = currentArrangement(s, accountId);
  if (cur && IN_PROGRESS.includes(cur.status)) return fail('exists', 'This account already has an arrangement in progress — revise it instead.');
  const { total, count, firstDue } = terms;
  // An arrangement can agree to less than is owed (settlement discount), never more: otherwise the
  // borrower's "remaining" and the account's current balance would disagree (D§3 anti-goal).
  const owed = accountBalance(s, accountId).current;
  if (total > owed) return fail('over_balance', `The total can't be more than the ${formatPHP(owed)} owed on this account.`);
  return store.set((d) => {
    const at = stamp(d);
    const id = nextObjId(d, 'ar');
    const lineageId = nextObjId(d, 'ln');
    const role = d.role;
    const arr = { id, lineageId, accountId, version: 1, total, count, frequency: 'monthly', firstDue, status: 'draft', createdBy: role, createdAt: at, history: [{ action: 'drafted', by: role, at }] };
    d.arrangements[id] = arr;
    addInstallments(d, id, splitInstallments(total, count), firstDue);
    const a = d.accounts[accountId];
    const before = a.status;
    if (role === 'agent') {
      arr.status = 'pending_approval';
      arr.history.push({ action: 'submitted', by: role, at });
      if (a.status !== 'disputed') a.status = 'negotiating';
      pushNotification(d, `Arrangement awaiting approval: ${borrowerName(a)}`, `#/m/arrangements/${id}`, at);
    } else {
      arr.history.push({ action: 'approved', by: role, at });
      activate(d, arr, at);
    }
    appendAudit(d, { action: 'arrangement.draft', target: id, accountId, detail: `${count} × ${formatPHP(Math.floor(total / count))} monthly · total ${formatPHP(total)} · ${arr.status === 'pending_approval' ? 'sent for approval' : 'active'}`, before, after: a.status });
    return ok({ arrangementId: id, status: arr.status });
  });
}

/** Draft (e.g. after a rejection) → Pending approval. */
export function submitArrangement(store, id) {
  const denied = guard(store, 'arrangement.draft');
  if (denied) return denied;
  const arr = store.get().arrangements[id];
  if (!arr) return fail('not_found', 'Arrangement not found.');
  if (arr.status !== 'draft') return fail('not_draft', 'Only a draft can be submitted.');
  return store.set((d) => {
    const at = stamp(d);
    const a = d.arrangements[id];
    a.status = 'pending_approval';
    a.history.push({ action: 'submitted', by: d.role, at });
    appendAudit(d, { action: 'arrangement.submit', target: id, accountId: a.accountId, before: 'draft', after: 'pending_approval' }, at);
    return ok();
  });
}

/** Supervisor approval → Active (+ token + first request). */
export function approveArrangement(store, id) {
  const denied = guard(store, 'arrangement.approve');
  if (denied) return denied;
  const arr = store.get().arrangements[id];
  if (!arr) return fail('not_found', 'Arrangement not found.');
  if (arr.status !== 'pending_approval') return fail('not_pending', 'Only an arrangement pending approval can be approved.');
  return store.set((d) => {
    const at = stamp(d);
    const a = d.arrangements[id];
    a.history.push({ action: 'approved', by: d.role, at });
    activate(d, a, at);
    appendAudit(d, { action: 'arrangement.approve', target: id, accountId: a.accountId, before: 'pending_approval', after: a.status, detail: `Approved by ${ROLE_LABELS[d.role]}` });
    pushNotification(d, `Arrangement approved: ${borrowerName(d.accounts[a.accountId])}`, `#/m/arrangements/${id}`, at);
    return ok({ status: a.status });
  });
}

/** Supervisor rejection → back to Draft for the agent (reason required). */
export function rejectArrangement(store, id, reason) {
  const denied = guard(store, 'arrangement.approve');
  if (denied) return denied;
  const arr = store.get().arrangements[id];
  if (!arr) return fail('not_found', 'Arrangement not found.');
  if (arr.status !== 'pending_approval') return fail('not_pending', 'Only an arrangement pending approval can be rejected.');
  const note = String(reason ?? '').trim();
  if (!note) return fail('reason_required', 'Enter a reason for the agent.');
  return store.set((d) => {
    const at = stamp(d);
    const a = d.arrangements[id];
    a.status = 'draft';
    a.history.push({ action: 'rejected', by: d.role, at, note });
    appendAudit(d, { action: 'arrangement.reject', target: id, accountId: a.accountId, detail: note, before: 'pending_approval', after: 'draft' }, at);
    pushNotification(d, `Arrangement returned to draft: ${borrowerName(d.accounts[a.accountId])}`, `#/m/arrangements/${id}`, at);
    return ok();
  });
}

/**
 * Revision: new version, same lineage and token. Old → Superseded; its unpaid installments,
 * open requests and unfinished/pending checkouts are cancelled; paid installments carry over.
 * terms.total = the new TOTAL commitment (incl. already paid); terms.count = number of NEW installments.
 */
export function reviseArrangement(store, id, terms = {}) {
  const denied = guard(store, 'arrangement.revise');
  if (denied) return denied;
  const s = store.get();
  const old = s.arrangements[id];
  if (!old) return fail('not_found', 'Arrangement not found.');
  if (!['active', 'partially_paid', 'defaulted'].includes(old.status)) return fail('not_revisable', 'Only an active, partially paid or defaulted arrangement can be revised.');
  const bad = validateTerms(terms);
  if (bad) return bad;
  const paidInsts = installmentsOf(s, id).filter((i) => i.status === 'paid');
  const paid = paidInsts.reduce((sum, i) => sum + i.amount, 0);
  if (terms.total <= paid) return fail('bad_total', `The new total must be more than the ${formatPHP(paid)} already paid.`);
  const bal = accountBalance(s, old.accountId);
  const maxTotal = paid + bal.current + bal.discount; // already paid on this lineage + everything still owed
  if (terms.total > maxTotal) return fail('over_balance', `The new total can't be more than ${formatPHP(maxTotal)}: the ${formatPHP(paid)} already paid plus the ${formatPHP(maxTotal - paid)} still owed.`);
  return store.set((d) => {
    const at = stamp(d);
    const o = d.arrangements[id];
    const newId = nextObjId(d, 'ar');
    const before = o.status;
    o.status = 'superseded';
    o.supersededAt = at;
    o.supersededBy = newId;
    (o.history ||= []).push({ action: 'superseded', by: d.role, at });
    for (const i of installmentsOf(d, id)) if (['scheduled', 'due', 'overdue', 'missed'].includes(i.status)) i.status = 'cancelled';
    const cancelledReqs = new Set();
    for (const r of Object.values(d.requests)) {
      if (r.arrangementId === id && OPEN_REQUEST.includes(r.status)) { r.status = 'cancelled'; r.cancelledAt = at; cancelledReqs.add(r.id); }
    }
    for (const a of Object.values(d.attempts)) {
      if (cancelledReqs.has(a.requestId) && ['initiated', 'pending'].includes(a.status)) {
        a.status = 'cancelled';
        a.history.push({ status: 'cancelled', at });
        if (d.borrower.attemptId === a.id) { d.borrower.screenOverride = null; d.borrower.attemptId = null; }
      }
    }
    const k = paidInsts.length;
    const arr = {
      id: newId, lineageId: o.lineageId, accountId: o.accountId, version: o.version + 1, total: terms.total,
      count: k + terms.count, frequency: 'monthly', firstDue: terms.firstDue, status: 'active', createdBy: d.role,
      createdAt: at, supersedes: id, history: [{ action: 'revised', by: d.role, at, note: `v${o.version} → v${o.version + 1}: ${terms.count} remaining installments` }],
    };
    d.arrangements[newId] = arr;
    paidInsts.forEach((p, i) => {
      const cid = nextObjId(d, 'in');
      d.installments[cid] = { id: cid, arrangementId: newId, seq: i + 1, amount: p.amount, dueDate: p.dueDate, status: 'paid', paidAt: p.paidAt, paymentId: p.paymentId, carriedFrom: p.id };
    });
    addInstallments(d, newId, splitInstallments(terms.total - paid, terms.count), terms.firstDue, k + 1);
    const acc = d.accounts[o.accountId];
    const accBefore = acc.status;
    // same token: activation reuses the lineage's active token (never issues a new one here)
    arr.status = k ? 'partially_paid' : 'active';
    arr.approvedBy = d.role;
    arr.activatedAt = at;
    const first = installmentsOf(d, newId).find((i) => i.status === 'scheduled');
    if (first) createRequest(d, arr, first, at);
    if (acc.status !== 'disputed') acc.status = 'arrangement_active';
    appendAudit(d, { action: 'arrangement.revise', target: newId, accountId: o.accountId, detail: `v${o.version} (${before}) → v${arr.version}: total ${formatPHP(terms.total)}, ${terms.count} remaining installments; same link`, before: accBefore, after: acc.status });
    pushNotification(d, `Arrangement revised: ${borrowerName(acc)} (v${arr.version})`, `#/m/arrangements/${newId}`, at);
    return ok({ arrangementId: newId });
  });
}

/** Supervisor cancellation: cancels open requests and revokes the token (V3 §7). */
export function cancelArrangement(store, id) {
  const denied = guard(store, 'arrangement.cancel');
  if (denied) return denied;
  const arr = store.get().arrangements[id];
  if (!arr) return fail('not_found', 'Arrangement not found.');
  if (!['draft', 'pending_approval', 'active', 'partially_paid', 'defaulted'].includes(arr.status)) return fail('not_cancellable', 'This arrangement cannot be cancelled.');
  return store.set((d) => {
    const at = stamp(d);
    const a = d.arrangements[id];
    const before = a.status;
    a.status = 'cancelled';
    a.cancelledAt = at;
    (a.history ||= []).push({ action: 'cancelled', by: d.role, at });
    for (const i of installmentsOf(d, id)) if (['scheduled', 'due', 'overdue', 'missed'].includes(i.status)) i.status = 'cancelled';
    const reqs = new Set();
    for (const r of Object.values(d.requests)) {
      if (r.arrangementId === id && OPEN_REQUEST.includes(r.status)) { r.status = 'cancelled'; r.cancelledAt = at; reqs.add(r.id); }
    }
    for (const x of Object.values(d.attempts)) {
      if (reqs.has(x.requestId) && ['initiated', 'pending'].includes(x.status)) { x.status = 'cancelled'; x.history.push({ status: 'cancelled', at }); }
    }
    for (const t of Object.values(d.tokens)) {
      if (t.lineageId === a.lineageId && t.status === 'active') { t.status = 'revoked'; t.revokedAt = at; }
    }
    const acc = d.accounts[a.accountId];
    if (['arrangement_active', 'negotiating'].includes(acc.status)) acc.status = 'assigned';
    appendAudit(d, { action: 'arrangement.cancel', target: id, accountId: a.accountId, detail: 'Cancelled — link revoked, open requests cancelled; payments already made stay posted', before, after: 'cancelled' }, at);
    return ok();
  });
}

/** Contract / agreement attachment. Same filename → new version; nothing is overwritten (V3 §7). */
export function addAttachment(store, arrangementId, { filename, size } = {}) {
  const denied = guard(store, 'attachment.upload');
  if (denied) return denied;
  const s = store.get();
  const arr = s.arrangements[arrangementId];
  if (!arr) return fail('not_found', 'Arrangement not found.');
  const name = String(filename ?? '').trim();
  if (!name) return fail('filename_required', 'Choose a file.');
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes < 0) return fail('bad_size', 'Invalid file size.');
  const lineageArrIds = new Set(Object.values(s.arrangements).filter((a) => a.lineageId === arr.lineageId).map((a) => a.id));
  const version = 1 + Object.values(s.attachments).filter((x) => lineageArrIds.has(x.arrangementId) && x.filename === name).length;
  return store.set((d) => {
    const at = stamp(d);
    const id = nextObjId(d, 'at');
    d.attachments[id] = { id, arrangementId, filename: name, size: Math.round(bytes), uploader: ROLE_LABELS[d.role] ?? d.role, at, version };
    appendAudit(d, { action: 'attachment.upload', target: id, accountId: arr.accountId, detail: `${name} (v${version})` }, at);
    return ok({ attachmentId: id, version });
  });
}
