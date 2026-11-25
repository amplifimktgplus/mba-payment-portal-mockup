// Report aggregates for the Finance screens (plan Task 9: Reconciliation, Reports, Remittances).
// NEW core module (additive). Pure functions over state: every figure is computed from the
// records (design C6), so totals agree with the dashboard KPIs and the transaction tables.
import { DEMO_NOW, DEMO_TODAY, phtMonth, daysBetween } from './clock.js';
import { portfolioRecovery, LIVE_ARRANGEMENT } from './selectors.js';
import { POLICIES } from './config.js';

const vals = (m) => Object.values(m || {});

/** The 8 V3 §13 exception types, in V3 order, with display labels and what Finance checks. */
export const EXCEPTION_TYPES = Object.freeze([
  { type: 'amount_mismatch', label: 'Amount mismatch', check: 'Compare the platform amount with the PayMongo payment and settlement line; post a correcting entry if the provider figure is right.' },
  { type: 'unmatched_provider', label: 'Unmatched provider payment', check: 'PayMongo has a payment the platform does not — usually a missed webhook. Find the checkout session, then post it through verification.' },
  { type: 'stale_pending', label: 'Stale pending', check: 'The attempt has been Pending for over 24 hours. Query PayMongo for its final status; never mark it paid by hand.' },
  { type: 'missing_at_provider', label: 'Missing at provider', check: 'The platform shows a payment PayMongo does not. Confirm with the provider report before reversing anything.' },
  { type: 'duplicate_overpayment', label: 'Duplicate / overpayment', check: 'Two payments for one request. Contact the borrower, then refund the surplus or hold it as credit.' },
  { type: 'late_payment', label: 'Late / post-expiry payment', check: 'Money was taken after the request expired. It stays posted; confirm it was applied to the right installment.' },
  { type: 'status_mismatch', label: 'Status mismatch', check: 'PayMongo and the platform disagree on status (e.g. refunded there, paid here). Align the ledger to the provider record.' },
  { type: 'payout_mismatch', label: 'Payout mismatch', check: 'The bank deposit differs from the payout (payments less fees and refunds). Check the bank statement and the payout report.' },
]);
export const exceptionLabel = (type) => EXCEPTION_TYPES.find((t) => t.type === type)?.label ?? type;

/** Payment ids referenced by an exception that is not resolved. */
export function flaggedPaymentIds(state) {
  return new Set(vals(state.exceptions).filter((e) => e.status !== 'resolved' && e.refs?.paymentId).map((e) => e.refs.paymentId));
}

/**
 * Reconciliation overview (D§7.8): payment-level match state and exception counts.
 * Each payment is in exactly one bucket: flagged (open exception) → reconciled → awaiting.
 */
export function reconOverview(state) {
  const flagged = flaggedPaymentIds(state);
  const pay = { reconciled: { count: 0, amount: 0 }, awaiting: { count: 0, amount: 0 }, flagged: { count: 0, amount: 0 } };
  for (const p of vals(state.payments)) {
    const k = flagged.has(p.id) ? 'flagged' : p.reconciled ? 'reconciled' : 'awaiting';
    pay[k].count += 1;
    pay[k].amount += p.gross;
  }
  const byType = Object.fromEntries(EXCEPTION_TYPES.map((t) => [t.type, { open: 0, in_review: 0, resolved: 0 }]));
  const exc = { open: 0, in_review: 0, resolved: 0 };
  for (const e of vals(state.exceptions)) {
    exc[e.status] = (exc[e.status] || 0) + 1;
    if (byType[e.type]) byType[e.type][e.status] = (byType[e.type][e.status] || 0) + 1;
  }
  return { payments: pay, exceptions: exc, byType, totalPayments: vals(state.payments).length };
}

/** Payouts (PayMongo → MBA bank), newest period first, with the deposit difference. */
export function payoutRows(state) {
  return vals(state.payouts)
    .map((po) => ({ ...po, difference: po.bankDeposit === null || po.bankDeposit === undefined ? null : po.bankDeposit - po.net }))
    .sort((a, b) => (a.periodStart < b.periodStart ? 1 : a.periodStart > b.periodStart ? -1 : 0));
}

/** Collections by portfolio (to date, verified, net of refunds) with recovery %. */
export function collectionsByPortfolio(state) {
  const counts = {};
  for (const p of vals(state.payments)) {
    if (p.refunded) continue;
    const pf = state.accounts[p.accountId]?.portfolioId;
    counts[pf] = (counts[pf] || 0) + 1;
  }
  return portfolioRecovery(state).map((r) => ({
    ...r,
    creditorName: state.creditors[state.portfolios[r.portfolioId]?.creditorId]?.name ?? '',
    payments: counts[r.portfolioId] || 0,
  }));
}

/** Gross collected in a PHT month (YYYY-MM) by accountId, net of refunds made that month (same rule as kpis()). */
function monthCollectedByAccount(state, month) {
  const out = {};
  for (const p of vals(state.payments)) {
    if (p.paidAt && phtMonth(p.paidAt) === month) out[p.accountId] = (out[p.accountId] || 0) + p.gross;
    if (p.refunded && p.refundedAt && phtMonth(p.refundedAt) === month) out[p.accountId] = (out[p.accountId] || 0) - p.gross;
  }
  return out;
}

/**
 * Agent performance, this month (Nov 2026, PHT). Collected is by the account's current assignee,
 * so the rows (plus "Unassigned" when non-zero) sum to kpis().collectedThisMonth.
 */
export function agentPerformance(state) {
  const month = phtMonth(DEMO_NOW);
  const collected = monthCollectedByAccount(state, month);
  const rows = vals(state.agents).map((a) => ({ agentId: a.id, name: a.name, accounts: 0, contacts: 0, activeArrangements: 0, collected: 0, payments: 0 }));
  const byId = Object.fromEntries(rows.map((r) => [r.agentId, r]));
  const unassigned = { agentId: null, name: 'Unassigned', accounts: 0, contacts: 0, activeArrangements: 0, collected: 0, payments: 0 };
  const rowOf = (accountId) => byId[state.accounts[accountId]?.assigneeId] || unassigned;
  for (const acc of vals(state.accounts)) rowOf(acc.id).accounts += 1;
  for (const c of vals(state.contactAttempts)) if (phtMonth(c.at) === month) (byId[c.by] || unassigned).contacts += 1;
  for (const a of vals(state.arrangements)) if (LIVE_ARRANGEMENT.includes(a.status)) rowOf(a.accountId).activeArrangements += 1;
  for (const [accountId, amt] of Object.entries(collected)) rowOf(accountId).collected += amt;
  for (const p of vals(state.payments)) if (!p.refunded && phtMonth(p.paidAt) === month) rowOf(p.accountId).payments += 1;
  rows.sort((a, b) => b.collected - a.collected || a.name.localeCompare(b.name));
  if (unassigned.collected || unassigned.activeArrangements || unassigned.contacts) rows.push(unassigned);
  return rows;
}

/** Overdue aging (as of the demo date): unpaid installments past their due date, in 4 buckets. */
export const AGING_BUCKETS = Object.freeze([
  { id: 'd1_30', label: '1–30 days', min: 1, max: 30 },
  { id: 'd31_60', label: '31–60 days', min: 31, max: 60 },
  { id: 'd61_90', label: '61–90 days', min: 61, max: 90 },
  { id: 'd90p', label: '90+ days', min: 91, max: Infinity },
]);
export function overdueAging(state) {
  const out = AGING_BUCKETS.map((b) => ({ ...b, count: 0, amount: 0 }));
  for (const i of vals(state.installments)) {
    if (i.status !== 'overdue' && i.status !== 'missed') continue;
    const arr = state.arrangements[i.arrangementId];
    if (!arr || arr.status === 'superseded' || arr.status === 'cancelled') continue;
    const days = daysBetween(i.dueDate, DEMO_TODAY);
    if (days < 1) continue;
    const b = out.find((x) => days >= x.min && days <= x.max);
    b.count += 1;
    b.amount += i.amount;
  }
  return out.map(({ min, max, ...r }) => r);
}

/**
 * The overdue-aging population (same filter as overdueAging) split by the plan it sits on:
 * active = active / partially paid plans (the KPI "Overdue installments" population),
 * defaulted = defaulted plans (their missed installments), other = any other plan status.
 * active + defaulted + other always equals the aging total, counts and amounts.
 * notYetPastDue = installments on active plans marked overdue before their due date has passed
 * (the demo "Expire now" can do this): the KPI counts them, aging (1+ days past due) does not,
 * so KPI overdue = active + notYetPastDue (missed installments only occur on defaulted plans).
 */
export function overdueAgingSplit(state) {
  const z = () => ({ count: 0, amount: 0 });
  const out = { active: z(), defaulted: z(), other: z(), notYetPastDue: z() };
  const add = (p, i) => { p.count += 1; p.amount += i.amount; };
  for (const i of vals(state.installments)) {
    if (i.status !== 'overdue' && i.status !== 'missed') continue;
    const arr = state.arrangements[i.arrangementId];
    if (!arr || arr.status === 'superseded' || arr.status === 'cancelled') continue;
    const live = LIVE_ARRANGEMENT.includes(arr.status);
    if (daysBetween(i.dueDate, DEMO_TODAY) < 1) {
      if (live && i.status === 'overdue') add(out.notYetPastDue, i);
      continue;
    }
    add(live ? out.active : arr.status === 'defaulted' ? out.defaulted : out.other, i);
  }
  return out;
}

/** Payment-method mix (verified, not refunded, to date), in the configured method order. */
export function methodMix(state) {
  const order = [...POLICIES.methods];
  const m = Object.fromEntries(order.map((k) => [k, { method: k, count: 0, amount: 0 }]));
  for (const p of vals(state.payments)) {
    if (p.refunded) continue;
    if (!m[p.method]) { m[p.method] = { method: p.method, count: 0, amount: 0 }; order.push(p.method); }
    m[p.method].count += 1;
    m[p.method].amount += p.gross;
  }
  const total = order.reduce((s, k) => s + m[k].amount, 0);
  return order.map((k) => ({ ...m[k], pct: total ? Math.round((m[k].amount / total) * 1000) / 10 : 0 }));
}

/**
 * Sample remittance statement, model (a) (D§7.10, C8): per creditor for the month to date.
 * gross = payments verified this month; refunds = refunds made this month; fees = PayMongo fees
 * on this month's payments (borne by MBA under the Q-17 assumption, so NOT deducted);
 * commission = commissionPct × (gross − refunds) (basis is Q-24); netDue = gross − refunds − commission.
 * reconciled = gross of this month's payments already matched (only reconciled funds would be remitted).
 */
export function remittanceStatement(state) {
  const month = phtMonth(DEMO_NOW);
  const rows = vals(state.creditors).map((c) => ({ creditorId: c.id, name: c.name, commissionPct: c.commissionPct, payments: 0, gross: 0, refunds: 0, fees: 0, commission: 0, netDue: 0, reconciled: 0 }));
  const byId = Object.fromEntries(rows.map((r) => [r.creditorId, r]));
  for (const p of vals(state.payments)) {
    const r = byId[state.accounts[p.accountId]?.creditorId];
    if (!r) continue;
    if (p.paidAt && phtMonth(p.paidAt) === month) {
      r.gross += p.gross; r.fees += p.fee; r.payments += 1;
      if (p.reconciled && !p.refunded) r.reconciled += p.gross;
    }
    if (p.refunded && p.refundedAt && phtMonth(p.refundedAt) === month) r.refunds += p.gross;
  }
  for (const r of rows) {
    r.commission = Math.round(((r.gross - r.refunds) * r.commissionPct) / 100);
    r.netDue = r.gross - r.refunds - r.commission;
  }
  const total = rows.reduce((t, r) => {
    for (const k of ['payments', 'gross', 'refunds', 'fees', 'commission', 'netDue', 'reconciled']) t[k] += r[k];
    return t;
  }, { payments: 0, gross: 0, refunds: 0, fees: 0, commission: 0, netDue: 0, reconciled: 0 });
  return { month, rows, total };
}
