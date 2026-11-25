// Agent workspace actions (V3 §6). Statuses move forward only; Dispute always applies.
import { DEMO_TODAY, isDateOnly, phtDate } from '../clock.js';
import { borrowerName } from '../format.js';
import { stamp, appendAudit, nextObjId } from '../store.js';
import { ok, fail, guard } from './util.js';

const CHANNELS = ['call', 'sms', 'email'];
const OUTCOMES = ['no_contact', 'contacted', 'dispute', 'agreement'];
const OUTCOME_STATUS = { no_contact: 'contact_attempted', contacted: 'contacted', agreement: 'negotiating' };
const RANK = { new: 0, assigned: 1, contact_attempted: 2, contacted: 3, negotiating: 4 };

/** Logs a contact attempt; outcome drives the account status (V3 §6). */
export function logContactAttempt(store, accountId, { channel, outcome, note = '', nextAt = null } = {}) {
  const denied = guard(store, 'contact.log');
  if (denied) return denied;
  const acc = store.get().accounts[accountId];
  if (!acc) return fail('not_found', 'Account not found.');
  if (!CHANNELS.includes(channel)) return fail('bad_channel', 'Choose call, SMS or email.');
  if (!OUTCOMES.includes(outcome)) return fail('bad_outcome', 'Choose an outcome.');
  if (nextAt && !isDateOnly(nextAt)) return fail('bad_date', 'Next action date must be a date.');
  return store.set((d) => {
    const at = stamp(d);
    const a = d.accounts[accountId];
    const id = nextObjId(d, 'ca');
    const c = { id, accountId, channel, outcome, note: String(note).trim(), by: d.role, at };
    if (nextAt) c.nextAt = nextAt;
    d.contactAttempts[id] = c;
    const before = a.status;
    if (outcome === 'dispute') a.status = 'disputed';
    else if (before in RANK && RANK[OUTCOME_STATUS[outcome]] > RANK[before]) a.status = OUTCOME_STATUS[outcome];
    appendAudit(d, { action: 'contact.log', target: id, accountId, detail: `${channel} — ${outcome.replace('_', ' ')}${c.note ? `: ${c.note}` : ''}`, before, after: a.status }, at);
    if (outcome === 'dispute' && before !== 'disputed') appendAudit(d, { action: 'account.dispute', target: accountId, accountId, before, after: 'disputed' });
    return ok({ contactId: id, status: a.status });
  });
}

/** Assign (or reassign) an account to an agent. */
export function assignAccount(store, accountId, agentId) {
  const denied = guard(store, 'account.assign');
  if (denied) return denied;
  const s = store.get();
  if (!s.accounts[accountId]) return fail('not_found', 'Account not found.');
  if (!s.agents[agentId]) return fail('not_found', 'Agent not found.');
  return store.set((d) => {
    const a = d.accounts[accountId];
    const before = a.assigneeId ? d.agents[a.assigneeId]?.name : 'Unassigned';
    a.assigneeId = agentId;
    if (a.status === 'new') a.status = 'assigned';
    appendAudit(d, { action: 'account.assign', target: accountId, accountId, detail: `Assigned to ${d.agents[agentId].name}`, before, after: d.agents[agentId].name });
    return ok();
  });
}

/** On Hold always has a review date (V3 §6). */
export function holdAccount(store, accountId, untilIso) {
  const denied = guard(store, 'account.hold');
  if (denied) return denied;
  if (!store.get().accounts[accountId]) return fail('not_found', 'Account not found.');
  if (!untilIso || !/^\d{4}-\d{2}-\d{2}/.test(String(untilIso))) return fail('date_required', 'A review date is required to put an account on hold.');
  const until = phtDate(String(untilIso));
  if (until <= DEMO_TODAY) return fail('date_in_past', 'The review date must be after today.');
  return store.set((d) => {
    const a = d.accounts[accountId];
    const before = a.status;
    a.status = 'on_hold';
    a.holdUntil = until;
    appendAudit(d, { action: 'account.hold', target: accountId, accountId, detail: `On hold until ${until}`, before, after: 'on_hold' });
    return ok();
  });
}

/** Escalate to a Supervisor. */
export function escalateAccount(store, accountId) {
  const denied = guard(store, 'account.escalate');
  if (denied) return denied;
  const acc = store.get().accounts[accountId];
  if (!acc) return fail('not_found', 'Account not found.');
  if (acc.status === 'escalated') return fail('already', 'This account is already escalated.');
  return store.set((d) => {
    const a = d.accounts[accountId];
    const before = a.status;
    a.status = 'escalated';
    appendAudit(d, { action: 'account.escalate', target: accountId, accountId, detail: `${borrowerName(a)} escalated to a Supervisor`, before, after: 'escalated' });
    return ok();
  });
}

/** Mark the debt as disputed: pauses collection contact and reminders (V3 §6). */
export function markDisputed(store, accountId, note = '') {
  const denied = guard(store, 'contact.log');
  if (denied) return denied;
  const acc = store.get().accounts[accountId];
  if (!acc) return fail('not_found', 'Account not found.');
  if (acc.status === 'disputed') return fail('already', 'This account is already disputed.');
  return store.set((d) => {
    const a = d.accounts[accountId];
    const before = a.status;
    a.status = 'disputed';
    appendAudit(d, { action: 'account.dispute', target: accountId, accountId, detail: String(note).trim() || 'Borrower disputes the debt', before, after: 'disputed' });
    return ok();
  });
}

/** Admin: add a creditor. */
export function addCreditor(store, { name, commissionPct } = {}) {
  const denied = guard(store, 'creditor.manage');
  if (denied) return denied;
  const n = String(name ?? '').trim();
  if (!n) return fail('name_required', 'Enter the creditor name.');
  if (Object.values(store.get().creditors).some((c) => c.name.toLowerCase() === n.toLowerCase())) return fail('exists', 'A creditor with this name already exists.');
  const pct = Number(commissionPct);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return fail('bad_commission', 'Commission must be between 0 and 100%.');
  return store.set((d) => {
    const id = nextObjId(d, 'cr');
    d.creditors[id] = { id, name: n, commissionPct: pct, createdAt: stamp(d) };
    appendAudit(d, { action: 'creditor.manage', target: id, detail: `Creditor added: ${n} (${pct}% commission — Q-24)` });
    return ok({ creditorId: id });
  });
}
