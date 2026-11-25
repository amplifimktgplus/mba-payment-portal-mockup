// Task 9 report aggregates (src/core/reports.js): every figure must agree with the records and
// with the dashboard KPIs (design C6 — "numbers disagree across screens" is an anti-goal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState } from '../src/data/seed.js';
import { kpis } from '../src/core/selectors.js';
import {
  EXCEPTION_TYPES, reconOverview, payoutRows, collectionsByPortfolio, agentPerformance,
  overdueAging, overdueAgingSplit, methodMix, remittanceStatement,
} from '../src/core/reports.js';
import { createStore } from '../src/core/store.js';
import { expireRequestNow } from '../src/core/actions/links.js';

const S = createSeedState();
const pays = Object.values(S.payments);

test('test_recon_overview_partitions_payments', () => {
  const o = reconOverview(S);
  const p = o.payments;
  assert.equal(p.reconciled.count + p.awaiting.count + p.flagged.count, pays.length);
  assert.equal(p.reconciled.amount + p.awaiting.amount + p.flagged.amount, pays.reduce((s, x) => s + x.gross, 0));
  assert.equal(EXCEPTION_TYPES.length, 8);
  for (const t of EXCEPTION_TYPES) assert.ok(o.byType[t.type].open + o.byType[t.type].in_review >= 1, `${t.type} has an unresolved exception`);
  assert.equal(o.exceptions.open + o.exceptions.in_review + o.exceptions.resolved, Object.keys(S.exceptions).length);
});

test('test_payout_rows_difference', () => {
  const rows = payoutRows(S);
  assert.ok(rows.length > 0);
  const mm = rows.filter((r) => r.status === 'mismatch');
  assert.equal(mm.length, 1);
  assert.equal(mm[0].difference, -15000);
  for (const r of rows) {
    assert.equal(r.net, r.gross - r.fees - r.refunds);
    if (r.status === 'expected') assert.equal(r.difference, null);
    if (r.status === 'reconciled') assert.equal(r.difference, 0);
  }
});

test('test_collections_by_portfolio_sum', () => {
  const total = collectionsByPortfolio(S).reduce((s, r) => s + r.collected, 0);
  assert.equal(total, pays.filter((p) => !p.refunded).reduce((s, p) => s + p.gross, 0));
});

test('test_agent_performance_matches_kpi', () => {
  const rows = agentPerformance(S);
  assert.equal(rows.reduce((s, r) => s + r.collected, 0), kpis(S).collectedThisMonth);
  assert.ok(rows.filter((r) => r.agentId).length === Object.keys(S.agents).length);
});

test('test_overdue_aging_counts', () => {
  const rows = overdueAging(S);
  assert.deepEqual(rows.map((r) => r.label), ['1–30 days', '31–60 days', '61–90 days', '90+ days']);
  const n = rows.reduce((s, r) => s + r.count, 0);
  assert.ok(n > 0, 'seed has overdue installments');
  // Luis's overdue ₱900 installment is in the first bucket.
  assert.ok(rows[0].amount >= 90000);
});

test('test_overdue_aging_split_reconciles_with_kpi', () => {
  const check = (state, label) => {
    const rows = overdueAging(state);
    const total = { count: rows.reduce((s, r) => s + r.count, 0), amount: rows.reduce((s, r) => s + r.amount, 0) };
    const sp = overdueAgingSplit(state);
    const k = kpis(state).overdue;
    // active + defaulted (+ other) = the aging total, counts and amounts
    assert.equal(sp.active.count + sp.defaulted.count + sp.other.count, total.count, `${label}: counts`);
    assert.equal(sp.active.amount + sp.defaulted.amount + sp.other.amount, total.amount, `${label}: amounts`);
    // the KPI "Overdue installments" = active part (+ any marked overdue before the due date)
    assert.equal(sp.active.count + sp.notYetPastDue.count, k.count, `${label}: kpi count`);
    assert.equal(sp.active.amount + sp.notYetPastDue.amount, k.amount, `${label}: kpi amount`);
    return { sp, k, total };
  };
  const { sp, k, total } = check(S, 'seed');
  // On the seed the active part IS the KPI figure, and the rest sits on defaulted plans.
  assert.equal(sp.notYetPastDue.count, 0);
  assert.equal(sp.other.count, 0);
  assert.deepEqual(sp.active, { count: k.count, amount: k.amount });
  assert.ok(sp.defaulted.count > 0 && total.count === k.count + sp.defaulted.count);
  // After the demo "Expire now" on Juan's not-yet-due request, both identities still hold.
  const st = createStore({ storage: null, seed: () => structuredClone(S) });
  const juanReq = Object.values(st.get().requests).find((r) => r.accountId === 'ac_juan' && ['created', 'sent', 'opened'].includes(r.status));
  assert.equal(expireRequestNow(st, juanReq.id).ok, true);
  const after = check(st.get(), 'after expire-now');
  assert.equal(after.sp.notYetPastDue.count, 1);
});

test('test_method_mix_sum', () => {
  const rows = methodMix(S);
  assert.equal(rows.reduce((s, r) => s + r.amount, 0), pays.filter((p) => !p.refunded).reduce((s, p) => s + p.gross, 0));
  assert.ok(rows.length >= 3);
});

test('test_remittance_statement_math', () => {
  const st = remittanceStatement(S);
  assert.equal(st.month, '2026-11');
  assert.equal(st.rows.length, 3);
  for (const r of st.rows) {
    assert.equal(r.netDue, r.gross - r.refunds - r.commission);
    assert.equal(r.commission, Math.round(((r.gross - r.refunds) * r.commissionPct) / 100));
  }
  // Gross − refunds across creditors equals the dashboard's "Collected this month".
  assert.equal(st.total.gross - st.total.refunds, kpis(S).collectedThisMonth);
});
