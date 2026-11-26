// Read-only derived data. Every KPI is computed from the records (design C6) — never hard-coded.
import { DEMO_NOW, DEMO_TODAY, addDays, phtMonth, phtDate } from './clock.js';
import { formatPHP } from './money.js';
import { borrowerName, humanize, STATUS_TONE } from './format.js';

const vals = (m) => Object.values(m || {});
export const OPEN_REQUEST = Object.freeze(['created', 'sent', 'opened']);
export const LIVE_ARRANGEMENT = Object.freeze(['active', 'partially_paid']);
const UNPAID = ['scheduled', 'due', 'overdue'];
const desc = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

/** Installments of an arrangement, by seq. */
export function installmentsOf(state, arrangementId) {
  return vals(state.installments).filter((i) => i.arrangementId === arrangementId).sort((a, b) => a.seq - b.seq);
}

/** The arrangement version that is current for an account (latest non-superseded), or null. */
export function currentArrangement(state, accountId) {
  const list = vals(state.arrangements).filter((a) => a.accountId === accountId && a.status !== 'superseded');
  list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return list[0] || null;
}

/** The current (non-superseded, highest version) arrangement of a lineage, or null. */
export function lineageArrangement(state, lineageId) {
  const list = vals(state.arrangements).filter((a) => a.lineageId === lineageId && a.status !== 'superseded');
  list.sort((a, b) => b.version - a.version);
  return list[0] || null;
}

/** All arrangement versions for an account, newest first. */
export function arrangementsOf(state, accountId) {
  return vals(state.arrangements).filter((a) => a.accountId === accountId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** Paid-to-date and next installment for one arrangement version. */
export function arrangementProgress(state, arrangementId) {
  const arr = state.arrangements[arrangementId];
  if (!arr) return null;
  const insts = installmentsOf(state, arrangementId);
  const paidInsts = insts.filter((i) => i.status === 'paid');
  const paid = paidInsts.reduce((s, i) => s + i.amount, 0);
  const nx = insts.find((i) => UNPAID.includes(i.status));
  return {
    paidCount: paidInsts.length,
    count: arr.count,
    paid,
    total: arr.total,
    remaining: arr.total - paid,
    next: nx ? { seq: nx.seq, amount: nx.amount, dueDate: nx.dueDate, status: nx.status, installmentId: nx.id } : null,
  };
}

/** The open request (created/sent/opened) for the earliest unpaid installment of an arrangement, or null. */
export function currentOpenRequest(state, arrangementId) {
  const open = vals(state.requests).filter((r) => r.arrangementId === arrangementId && OPEN_REQUEST.includes(r.status));
  if (!open.length) return null;
  const seqOf = (r) => state.installments[r.installmentId]?.seq ?? 0;
  open.sort((a, b) => seqOf(a) - seqOf(b) || (a.createdAt < b.createdAt ? 1 : -1));
  return open[0];
}

// Membership index per state snapshot: store.set() clones and replaces the whole state, so a
// collection object never gains or loses records in place. The grouped arrays hold the live record
// objects, so field changes (status, paymentId, refunded) are always read fresh.
const _groups = new WeakMap();
function groupBy(coll, key) {
  if (!coll || typeof coll !== 'object') return new Map();
  let m = _groups.get(coll);
  if (!m) {
    m = new Map();
    for (const x of Object.values(coll)) {
      let list = m.get(x[key]);
      if (!list) m.set(x[key], (list = []));
      list.push(x);
    }
    _groups.set(coll, m);
  }
  return m;
}

/** Arrangement statuses whose agreed total is binding on the account balance. */
export const IN_FORCE_ARRANGEMENT = Object.freeze([...LIVE_ARRANGEMENT, 'completed']);

/**
 * Placed, paid (verified, net of refunds) and current balance of an account.
 * While an approved arrangement is in force (active / partially paid / completed), the current
 * balance IS that arrangement's remaining commitment, so the MBA view always matches what the
 * borrower is shown (B3/B8) and a Settled account reads ₱0.00. When the agreed total is less
 * than what was owed, the gap is returned as `discount` (a settlement discount) so the screen can
 * explain it: placed − paid − discount = current. Without an arrangement in force (none, draft,
 * pending, defaulted, cancelled) no discount applies and current = placed − paid.
 * `credit` is verified money not applied to any installment — a duplicate charge awaiting a
 * refund-or-hold decision (V3 E2, reconciliation exception) — so it never reduces the debt twice.
 * Identity, always: placed − paid − discount + credit = current.
 * `agreed` is the in-force arrangement's total (null when none); `arrangementId` its id.
 */
export function accountBalance(state, accountId) {
  const acc = state.accounts[accountId];
  const payments = (groupBy(state.payments, 'accountId').get(accountId) || []).filter((p) => !p.refunded);
  const paid = payments.reduce((s, p) => s + p.gross, 0);
  const placed = acc ? acc.placedBalance : 0;
  const accArrs = groupBy(state.arrangements, 'accountId').get(accountId) || [];
  // same rule as currentArrangement(): the latest non-superseded version
  const arr = acc ? accArrs.filter((a) => a.status !== 'superseded').sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0))[0] || null : null;
  if (!arr || !IN_FORCE_ARRANGEMENT.includes(arr.status)) {
    return { placed, paid, current: placed - paid, discount: 0, credit: 0, agreed: null, arrangementId: null };
  }
  const instBy = groupBy(state.installments, 'arrangementId');
  const applied = new Set();
  for (const a of accArrs) for (const i of instBy.get(a.id) || []) if (i.paymentId) applied.add(i.paymentId);
  const credit = payments.filter((p) => !applied.has(p.id)).reduce((s, p) => s + p.gross, 0);
  const owed = placed - (paid - credit);
  // same as arrangementProgress().remaining: total − paid installments of this version
  const arrPaid = (instBy.get(arr.id) || []).filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const remaining = Math.max(0, arr.total - arrPaid);
  // The action layer refuses a total above what is owed, so remaining <= owed; clamp defensively.
  const current = Math.max(0, Math.min(remaining, owed));
  return { placed, paid, current, discount: owed - current, credit, agreed: arr.total, arrangementId: arr.id };
}

function collectedIn(state, month) {
  let gross = 0, net = 0;
  for (const p of vals(state.payments)) {
    if (p.paidAt && phtMonth(p.paidAt) === month) { gross += p.gross; net += p.net; }
    if (p.refunded && p.refundedAt && phtMonth(p.refundedAt) === month) { gross -= p.gross; net -= p.net; }
  }
  return { gross, net };
}

/** Dashboard KPIs (V3 §18.1). "This month" = Nov 2026 by paidAt in PHT, net of refunds. */
export function kpis(state) {
  const month = phtMonth(DEMO_NOW);
  const lastMonth = phtMonth(addDays(`${month}-01`, -1));
  const live = vals(state.arrangements).filter((a) => LIVE_ARRANGEMENT.includes(a.status));
  const liveIds = new Set(live.map((a) => a.id));
  const unpaidLive = vals(state.installments).filter((i) => liveIds.has(i.arrangementId) && UNPAID.includes(i.status));
  const weekEnd = addDays(DEMO_TODAY, 6);
  const week = unpaidLive.filter((i) => i.dueDate >= DEMO_TODAY && i.dueDate <= weekEnd);
  const overdue = unpaidLive.filter((i) => i.status === 'overdue');
  const sum = (xs) => xs.reduce((s, i) => s + i.amount, 0);
  const thisM = collectedIn(state, month);
  const lastM = collectedIn(state, lastMonth);
  return {
    collectedThisMonth: thisM.gross,
    collectedThisMonthNet: thisM.net,
    collectedLastMonth: lastM.gross,
    activeArrangements: live.length,
    newArrangementsThisMonth: live.filter((a) => a.activatedAt && phtMonth(a.activatedAt) === month).length,
    dueThisWeek: { amount: sum(week), count: week.length },
    overdue: { amount: sum(overdue), count: overdue.length },
  };
}

/** Gross collected to date ÷ placed balance, per portfolio (V3 §18.1). */
export function portfolioRecovery(state) {
  return vals(state.portfolios).map((pf) => {
    const accIds = new Set(vals(state.accounts).filter((a) => a.portfolioId === pf.id).map((a) => a.id));
    const placed = vals(state.accounts).filter((a) => accIds.has(a.id)).reduce((s, a) => s + a.placedBalance, 0);
    const collected = vals(state.payments).filter((p) => !p.refunded && accIds.has(p.accountId)).reduce((s, p) => s + p.gross, 0);
    return { portfolioId: pf.id, name: pf.name, collected, placed, pct: placed ? Math.round((collected / placed) * 1000) / 10 : 0 };
  });
}

const tone = (status) => STATUS_TONE[status] || 'neutral';
const AUDIT_TITLES = {
  'automation.settled': 'Arrangement completed — account settled',
  'automation.defaulted': 'Arrangement defaulted',
  'arrangement.approve': 'Arrangement approved',
  'arrangement.reject': 'Arrangement rejected',
  'arrangement.revise': 'Arrangement revised',
  'arrangement.cancel': 'Arrangement cancelled',
  'arrangement.draft': 'Arrangement drafted',
  'request.send': 'Payment link sent',
  'request.revoke': 'Payment link revoked',
  'request.cancel': 'Payment request cancelled',
  'request.expireDemo': 'Request expired (demo action)',
  'account.assign': 'Account assigned',
  'account.hold': 'Account on hold',
  'account.escalate': 'Account escalated',
  'account.dispute': 'Account marked disputed',
  'contact.log': 'Contact attempt logged',
  'link.opened': 'Borrower opened the link',
  'borrower.verified': 'Borrower verified (OTP)',
  'payment.refund': 'Payment refunded',
  'webhook.paid': 'Webhook: payment verified',
  'webhook.failed': 'Webhook: payment failed',
  'webhook.replay': 'Webhook replayed — duplicate ignored',
  'attachment.upload': 'Attachment uploaded',
  // Task 10: titles for actions that fell back to humanize() ("Otp sent", "Recon run", …).
  'otp.sent': 'Verification code sent (SMS)',
  'otp.locked': 'Code entry locked — too many tries',
  'checkout.started': 'Checkout started',
  'arrangement.submit': 'Arrangement submitted for approval',
  'recon.run': 'Daily reconciliation run',
  'recon.review': 'Reconciliation exception in review',
  'recon.resolve': 'Reconciliation exception resolved',
  'creditor.manage': 'Creditor updated',
  'portfolio.import': 'Portfolio import',
};
export const auditTitle = (action) => AUDIT_TITLES[action] || humanize(String(action).replace(/\./g, ' '));

/** Unified account timeline, newest first: contacts, requests, deliveries, attempts, payments, audit. */
export function accountTimeline(state, accountId) {
  const items = [];
  for (const c of vals(state.contactAttempts)) {
    if (c.accountId !== accountId) continue;
    items.push({ at: c.at, kind: 'contact', title: `${humanize(c.channel)} — ${humanize(c.outcome)}`, detail: c.note || '', tone: c.outcome === 'dispute' ? 'danger' : c.outcome === 'agreement' ? 'ok' : c.outcome === 'contacted' ? 'info' : 'neutral' });
  }
  const reqIds = new Set();
  for (const r of vals(state.requests)) {
    if (r.accountId !== accountId) continue;
    reqIds.add(r.id);
    const seq = state.installments[r.installmentId]?.seq;
    items.push({ at: r.createdAt, kind: 'request', title: `Payment request ${r.id} created`, detail: `${formatPHP(r.amount)} · installment ${seq}${r.replacesId ? ` · replaces ${r.replacesId}` : ''}`, tone: 'neutral', ref: r.id });
    for (const d of r.deliveries || []) {
      items.push({ at: d.at, kind: 'delivery', title: `Arrangement link sent by ${d.channel === 'sms' ? 'SMS' : 'email'}`, detail: `To ${d.to} · for ${r.id} · by ${humanize(d.by)}`, tone: 'info', ref: r.id });
    }
    if (r.status === 'expired') items.push({ at: r.expiredAt || r.expiresAt, kind: 'request', title: `Payment request ${r.id} expired`, detail: r.replacedById ? `Replaced by ${r.replacedById}` : 'Installment overdue', tone: 'neutral', ref: r.id });
    if (r.status === 'cancelled' && r.cancelledAt) items.push({ at: r.cancelledAt, kind: 'request', title: `Payment request ${r.id} cancelled`, detail: '', tone: 'neutral', ref: r.id });
  }
  for (const a of vals(state.attempts)) {
    if (a.accountId !== accountId) continue;
    const last = a.history[a.history.length - 1];
    items.push({ at: a.createdAt, kind: 'attempt', title: `Checkout ${a.id} — ${humanize(a.status)}`, detail: [a.method, formatPHP(a.amount), a.failureReason].filter(Boolean).join(' · '), tone: tone(a.status), ref: a.id, lastAt: last?.at });
  }
  for (const p of vals(state.payments)) {
    if (p.accountId !== accountId) continue;
    items.push({ at: p.paidAt, kind: 'payment', title: `Payment verified ${formatPHP(p.gross)}`, detail: `${p.method} · ${p.attemptId}`, tone: 'ok', ref: p.attemptId });
    if (p.refunded) items.push({ at: p.refundedAt, kind: 'payment', title: `Payment refunded ${formatPHP(p.gross)}`, detail: p.attemptId, tone: 'neutral', ref: p.attemptId });
  }
  for (const e of state.audit || []) {
    if (e.accountId !== accountId && e.target !== accountId) continue;
    items.push({ at: e.at, kind: 'audit', title: auditTitle(e.action), detail: [e.detail, `by ${humanize(e.role)}`].filter(Boolean).join(' · '), tone: e.action.startsWith('automation.settled') ? 'ok' : e.action.includes('default') ? 'danger' : 'neutral', ref: e.target });
  }
  return items.sort(desc);
}

/**
 * Typed payment history (requests AND attempts), newest first. Filters (all optional):
 * from/to 'YYYY-MM-DD' (inclusive, PHT), ref (substring of id / account ref / name),
 * min/max (centavos), portfolioId, status, type ('request'|'attempt').
 */
export function paymentHistory(state, filters = {}) {
  const { from, to, ref, min, max, portfolioId, status, type } = filters;
  const rows = [];
  const base = (accountId) => {
    const acc = state.accounts[accountId];
    return { accountId, accountRef: acc?.ref ?? '', borrowerName: borrowerName(acc), portfolioId: acc?.portfolioId ?? null, creditorId: acc?.creditorId ?? null };
  };
  for (const r of vals(state.requests)) {
    rows.push({ type: 'request', id: r.id, at: r.createdAt, ...base(r.accountId), amount: r.amount, status: r.status, method: null, installmentSeq: state.installments[r.installmentId]?.seq ?? null, replacedById: r.replacedById ?? null, replacesId: r.replacesId ?? null });
  }
  for (const a of vals(state.attempts)) {
    rows.push({ type: 'attempt', id: a.id, at: a.createdAt, ...base(a.accountId), amount: a.amount, status: a.status, method: a.method ?? null, requestId: a.requestId });
  }
  const q = ref ? String(ref).trim().toLowerCase() : '';
  const out = rows.filter((r) => {
    const day = phtDate(r.at);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (q && !(r.id.toLowerCase().includes(q) || r.accountRef.toLowerCase().includes(q) || r.borrowerName.toLowerCase().includes(q))) return false;
    if (min !== undefined && min !== null && min !== '' && r.amount < Number(min)) return false;
    if (max !== undefined && max !== null && max !== '' && r.amount > Number(max)) return false;
    if (portfolioId && r.portfolioId !== portfolioId) return false;
    if (status && r.status !== status) return false;
    if (type && r.type !== type) return false;
    return true;
  });
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
}

/** Open exception counts by type (dashboard / reconciliation summary). */
export function exceptionSummary(state) {
  const out = {};
  for (const e of vals(state.exceptions)) {
    if (e.status === 'resolved') continue;
    out[e.type] = (out[e.type] || 0) + 1;
  }
  return out;
}

// ---- Contract / agreement files (V3 §7: one attachment type on the arrangement, every version
// kept). Added 2026-11-26 for the Transactions "Attachments" column (user request).

const DOC_ORDER = Object.freeze({ contract: 0, agreement: 1, file: 2 });
export const DOC_LABEL = Object.freeze({ contract: 'Contract', agreement: 'Agreement', file: 'File' });

/** 'contract' | 'agreement' | 'file': the seeded sample type when present, else read from the file name. */
export function docKind(att) {
  if (att?.sample === 'contract' || att?.sample === 'agreement') return att.sample;
  const name = String(att?.filename ?? '');
  if (/contract/i.test(name)) return 'contract';
  if (/agree|promissory|compromise|arrangement/i.test(name)) return 'agreement';
  return 'file';
}

/** Every file version uploaded to an arrangement's lineage (all its versions), newest first. */
export function lineageAttachments(state, arrangementId) {
  const arr = state.arrangements?.[arrangementId];
  if (!arr) return [];
  const ids = new Set(vals(state.arrangements).filter((a) => a.lineageId === arr.lineageId).map((a) => a.id));
  return vals(state.attachments).filter((f) => ids.has(f.arrangementId)).sort((a, b) => desc(a, b) || b.version - a.version);
}

/** The files behind an arrangement: the latest version of each file name, contracts first, then agreements. */
export function attachmentsFor(state, arrangementId) {
  const latest = new Map();
  for (const f of lineageAttachments(state, arrangementId)) {
    const cur = latest.get(f.filename);
    if (!cur || f.version > cur.version) latest.set(f.filename, f);
  }
  return [...latest.values()].sort((a, b) => DOC_ORDER[docKind(a)] - DOC_ORDER[docKind(b)]
    || (a.at < b.at ? -1 : a.at > b.at ? 1 : 0) || a.filename.localeCompare(b.filename));
}

/**
 * The shape of a schedule, for one-line descriptions that always add up:
 * 'equal' n × per · 'final' (n − 1) × per + last · 'mixed' anything else (e.g. carried-over payments).
 */
export function installmentPlan(insts) {
  const n = insts.length;
  if (!n) return { shape: 'mixed', n: 0, per: 0, last: 0, total: 0 };
  const per = insts[0].amount;
  const last = insts[n - 1].amount;
  const total = insts.reduce((s, i) => s + i.amount, 0);
  const headEqual = insts.slice(0, -1).every((i) => i.amount === per);
  const shape = !headEqual ? 'mixed' : last === per ? 'equal' : 'final';
  return { shape, n, per, last, total };
}

/** Every version of one file (same lineage and file name), newest first. */
export function attachmentVersions(state, attachmentId) {
  const f = state.attachments?.[attachmentId];
  if (!f) return [];
  return lineageAttachments(state, f.arrangementId).filter((x) => x.filename === f.filename);
}
