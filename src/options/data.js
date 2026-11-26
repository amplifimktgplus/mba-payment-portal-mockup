// Real demo figures for the design-options page (2026-11-26). Everything comes from the same seed
// and selectors as the working demo, so a number on a concept screen matches the demo exactly.
// Built once, read-only. Money is in integer centavos; format with fmt.php().
import { createSeedState } from '../data/seed.js';
import {
  kpis, arrangementProgress, installmentsOf, currentArrangement, attachmentsFor, exceptionSummary,
  docKind, DOC_LABEL, portfolioRecovery, OPEN_REQUEST,
} from '../core/selectors.js';
import { methodMix, agentPerformance } from '../core/reports.js';
import { formatPHP } from '../core/money.js';
import { borrowerName, maskMobile, arrangementRef, maskTail } from '../core/format.js';
import { DEMO_NOW, DEMO_TODAY, phtDate, phtMonth, addDays, addMonths, fmtDate, fmtDateTime } from '../core/clock.js';
import { POLICIES, LEGAL_NAME, payeeLine, BANNER_TEXT } from '../core/config.js';
import { METHOD_MARKS, METHOD_ICONS } from '../borrower/payLogos.js';

const vals = (m) => Object.values(m || {});
const byDesc = (k) => (a, b) => (a[k] < b[k] ? 1 : a[k] > b[k] ? -1 : 0);

/** Formatting helpers every screen should use (same rules as the demo). */
export const fmt = Object.freeze({
  php: formatPHP, // 250000 → '₱2,500.00'
  /** '₱2,500.00' split for big-number styling: { sign: '₱', whole: '2,500', cents: '.00' } */
  phpParts(c) {
    const s = formatPHP(c);
    const m = /^(-?)(₱)([\d,]+)(\.\d{2})$/.exec(s);
    return m ? { sign: `${m[1]}${m[2]}`, whole: m[3], cents: m[4] } : { sign: '', whole: s, cents: '' };
  },
  /** Compact: 116562182 → '₱1.17M', 29785050 → '₱297.9K' */
  phpShort(c) {
    const v = c / 100;
    if (Math.abs(v) >= 1e6) return `₱${(v / 1e6).toFixed(2)}M`;
    if (Math.abs(v) >= 1e3) return `₱${(v / 1e3).toFixed(1)}K`;
    return `₱${v.toFixed(0)}`;
  },
  date: fmtDate, // 'Dec 5, 2026'
  dateTime: fmtDateTime, // 'Nov 26, 2026, 9:41 AM'
  /** 'Sat, Dec 5' */
  dayShort(iso) {
    const d = new Date(`${String(iso).slice(0, 10)}T12:00:00+08:00`);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
  },
  /** '9:41 AM' */
  time(iso) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
  },
  initials: (name) => String(name).replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(),
});

let cache = null;

/** The data every concept screen draws from. See the shape notes inline. */
export function getData() {
  if (cache) return cache;
  const S = createSeedState();

  // ---------------------------------------------------------------- borrower: Juan D. (hero, happy path)
  const acc = S.accounts.ac_juan;
  const creditor = S.creditors[acc.creditorId];
  const arr = currentArrangement(S, acc.id);
  const prog = arrangementProgress(S, arr.id);
  const insts = installmentsOf(S, arr.id);
  const payments = vals(S.payments).filter((p) => p.accountId === acc.id && !p.refunded).sort(byDesc('paidAt'));
  const next = prog.next; // { seq, amount, dueDate, status }
  const after = insts.find((i) => i.seq === next.seq + 1) || null;
  const nextTxnNo = S.seq.txn; // the id the demo would give the next checkout attempt
  const confirmAt = DEMO_NOW; // the demo's clock, as on the real B8
  const borrower = {
    first: acc.borrower.first,
    name: borrowerName(acc), // 'Juan D.'
    ref: acc.ref, // 'MBA-REF-2026-004821'
    maskedMobile: maskMobile(acc.borrower.mobile), // '+63 ••• ••• 7310' style, never the full number
    creditor: creditor.name, // 'Sample Bank (demo)'
    payee: payeeLine(creditor.name), // 'Sample Bank (demo) · collected by M.B.A. Consulting Philippines'
    legalName: LEGAL_NAME,
    arrangementRef: arrangementRef(arr.id),
    total: prog.total, // 1500000
    paid: prog.paid, // 500000
    remaining: prog.remaining, // 1000000
    count: prog.count, // 6
    paidCount: prog.paidCount, // 2
    due: { seq: next.seq, amount: next.amount, dueDate: next.dueDate, status: next.status }, // installment 3
    schedule: insts.map((i) => ({ seq: i.seq, amount: i.amount, dueDate: i.dueDate, status: i.status, paidAt: i.paidAt || null })),
    history: payments.map((p) => ({ txn: p.attemptId, amount: p.gross, method: p.method, paidAt: p.paidAt, seq: insts.find((i) => i.paymentId === p.id)?.seq ?? null })),
    // What the confirmation screen (B8) shows after paying installment 3 by GCash in the demo.
    confirmation: {
      title: 'Payment confirmation', // never "Official receipt" (BIR rules, Q-28)
      txn: `MBA-TXN-${String(nextTxnNo).padStart(6, '0')}`,
      amount: next.amount,
      method: 'GCash',
      paidAt: confirmAt,
      seq: next.seq,
      paidCountAfter: prog.paidCount + 1,
      paidAfter: prog.paid + next.amount,
      nextDue: after ? { seq: after.seq, amount: after.amount, dueDate: after.dueDate } : null,
      note: 'This is a payment confirmation, not an official receipt.',
    },
    codeLength: 6,
    codeExpiresIn: '4:59',
  };

  // ---------------------------------------------------------------- payment methods (B4)
  const methods = POLICIES.methods.map((m) => ({
    name: m,
    marks: METHOD_MARKS[m] || [], // [{ src (data URL), name }]
    icon: METHOD_ICONS[m] || null, // 'bank' for Online banking (use an icon, not a logo)
  }));

  // ---------------------------------------------------------------- MBA back office
  const k = kpis(S);
  const excOpen = Object.values(exceptionSummary(S)).reduce((s, n) => s + n, 0);
  const month = phtMonth(DEMO_NOW);
  // Daily gross for Nov 1 … Nov 26 (PHT), net of refunds made that day.
  const days = [];
  for (let d = `${month}-01`; d <= DEMO_TODAY; d = addDays(d, 1)) days.push(d);
  const daily = Object.fromEntries(days.map((d) => [d, 0]));
  for (const p of vals(S.payments)) {
    const d = p.paidAt && phtDate(p.paidAt);
    if (d && d in daily) daily[d] += p.gross;
    const r = p.refunded && p.refundedAt && phtDate(p.refundedAt);
    if (r && r in daily) daily[r] -= p.gross;
  }
  const accName = (id) => borrowerName(S.accounts[id]);
  const recentPayments = vals(S.payments).filter((p) => !p.refunded).sort(byDesc('paidAt')).slice(0, 8).map((p) => ({
    txn: p.attemptId, name: accName(p.accountId), ref: S.accounts[p.accountId].ref, amount: p.gross, method: p.method, paidAt: p.paidAt,
  }));
  const attempts = vals(S.attempts).sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
  const counts = {};
  for (const a of attempts) counts[a.status] = (counts[a.status] || 0) + 1;
  const transactions = attempts.slice(0, 14).map((a) => {
    const req = S.requests[a.requestId];
    const files = req ? attachmentsFor(S, req.arrangementId) : [];
    return {
      id: a.id, name: accName(a.accountId), ref: S.accounts[a.accountId].ref, requestId: a.requestId,
      method: a.method || '', amount: a.amount, createdAt: a.createdAt, status: a.status,
      files: files.map((f) => ({ id: f.id, kind: docKind(f), label: DOC_LABEL[docKind(f)], filename: f.filename, version: f.version, uploader: f.uploader, at: f.at })),
    };
  });
  const pendingApproval = vals(S.arrangements).filter((a) => a.status === 'pending_approval').length;
  const openRequests = vals(S.requests).filter((r) => OPEN_REQUEST.includes(r.status)).length;
  const verified = vals(S.payments).filter((p) => !p.refunded);

  const mba = {
    today: DEMO_TODAY, now: DEMO_NOW,
    kpis: {
      collectedThisMonth: k.collectedThisMonth, // gross, net of refunds — ₱1,165,621.82
      collectedThisMonthNet: k.collectedThisMonthNet,
      collectedLastMonth: k.collectedLastMonth,
      activeArrangements: k.activeArrangements, // 177
      newArrangementsThisMonth: k.newArrangementsThisMonth,
      dueThisWeek: k.dueThisWeek, // { amount, count }
      overdue: k.overdue, // { amount, count }
      exceptionsOpen: excOpen, // 9
      pendingApproval, // arrangements waiting for a supervisor
      openRequests,
    },
    dailyCollected: days.map((d) => ({ date: d, amount: daily[d] })), // Nov 1 … Nov 26
    methodMix: methodMix(S), // [{ method, count, amount, pct }] in the fixed method order
    agents: agentPerformance(S).filter((r) => r.agentId), // [{ name, accounts, contacts, activeArrangements, collected, payments }]
    portfolios: portfolioRecovery(S).map((p) => ({ ...p, creditor: S.creditors[S.portfolios[p.portfolioId].creditorId].name })), // [{ name, collected, placed, pct, creditor }]
    recentPayments, // 8 newest verified payments
    transactions, // 14 newest checkout attempts, each with its contract / agreement files
    txnStats: {
      verified: verified.length,
      verifiedGross: verified.reduce((s, p) => s + p.gross, 0),
      pending: counts.pending || 0,
      failed: counts.failed || 0,
      total: attempts.length,
    },
    nav: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'creditors', label: 'Creditors', icon: 'creditors' },
      { id: 'portfolios', label: 'Portfolios', icon: 'portfolios' },
      { id: 'accounts', label: 'Accounts', icon: 'accounts' },
      { id: 'arrangements', label: 'Arrangements', icon: 'arrangements', badge: pendingApproval },
      { id: 'requests', label: 'Payment requests', icon: 'requests' },
      { id: 'transactions', label: 'Transactions', icon: 'transactions' },
      { id: 'reconciliation', label: 'Reconciliation', icon: 'reconciliation', badge: excOpen },
      { id: 'reports', label: 'Reports', icon: 'reports' },
      { id: 'remittances', label: 'Remittances', icon: 'remittances' },
      { id: 'settings', label: 'Settings', icon: 'settings' },
    ],
    user: { name: 'Admin', role: 'Admin' },
  };

  cache = Object.freeze({ borrower, methods, mba, demoNotice: BANNER_TEXT, maskTail, addMonths });
  return cache;
}
