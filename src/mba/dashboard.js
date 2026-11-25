// Dashboard (MBA view, D§7.1, V3 §18 / §18.1). Every figure is computed by core selectors from
// the demo dataset (C6) — nothing here is hard-coded. Rows are typed: MBA-REQ-… = payment
// request, MBA-TXN-… = checkout attempt / payment (V3 §16 mockup fix). Payment history shows
// Expired requests and exports a real CSV file.
import { renderMbaLayout } from './layout.js';
import {
  h, btn, card, table, filterBar, kpi, pageHeader, chip, tag, toast, memo, icon,
  formatPHP, fmtDate, fmtDateTime, humanize, downloadFile,
} from '../ui/kit.js';

export function register(router, ctx) {
  router.on('/m/dashboard', (params, query) => renderMbaLayout(ctx, renderDashboard(ctx, params, query), 'dashboard'));
}

/** Statuses a payment-history row can have (requests + attempts), in lifecycle order. */
export const HISTORY_STATUSES = Object.freeze([
  'created', 'sent', 'opened', 'paid', 'expired', 'cancelled', 'initiated', 'pending', 'failed', 'refunded',
]);

const EXCEPTION_TYPES = Object.freeze([
  'amount_mismatch', 'unmatched_provider', 'stale_pending', 'missing_at_provider',
  'duplicate_overpayment', 'late_payment', 'status_mismatch', 'payout_mismatch',
]);

const shortDate = (iso) => fmtDate(iso).replace(/, \d{4}$/, '');
const recordHref = (row) => (row.type === 'request' ? `#/m/requests/${row.id}` : `#/m/transactions/${row.id}`);

/** Type label: Request (MBA-REQ) vs Transaction (MBA-TXN) — never colour alone. */
export function typeTag(type) {
  return type === 'request'
    ? tag('Request', { tone: 'info', title: 'Payment request (MBA-REQ-…)' })
    : tag('Transaction', { tone: 'brand', title: 'Checkout attempt / payment (MBA-TXN-…)' });
}

function idCell(row) {
  return h('a', { href: recordHref(row), class: 'dash-id num' }, row.id);
}

function borrowerCell(state, row) {
  return h('div', { class: 'dash-who' },
    h('a', { href: `#/m/accounts/${row.accountId}`, class: 'dash-who-name' }, row.borrowerName),
    h('span', { class: 'dash-who-ref num' }, row.accountRef));
}

// ---------------------------------------------------------------------------------------------
// KPI row (V3 §18.1 definitions)

function renderKpis(ctx, state) {
  const k = ctx.selectors.kpis(state);
  const weekEnd = ctx.clock.addDays(ctx.clock.DEMO_TODAY, 6);
  return h('div', { class: 'grid-4 dash-kpis', testid: 'dash-kpis' },
    kpi({
      label: 'Collected this month',
      value: formatPHP(k.collectedThisMonth),
      sub: h('span', {}, `Net of fees ${formatPHP(k.collectedThisMonthNet)}`, h('br'), `October: ${formatPHP(k.collectedLastMonth)}`),
      tone: 'brand',
      icon: 'transactions',
      testid: 'kpi-collected',
    }),
    kpi({
      label: 'Active arrangements',
      value: k.activeArrangements.toLocaleString('en-US'),
      sub: `+${k.newArrangementsThisMonth} activated this month`,
      tone: 'info',
      icon: 'arrangements',
      testid: 'kpi-active',
    }),
    kpi({
      label: 'Due this week',
      value: formatPHP(k.dueThisWeek.amount),
      sub: `${k.dueThisWeek.count} installments · ${shortDate(ctx.clock.DEMO_TODAY)} – ${shortDate(weekEnd)}`,
      tone: 'neutral',
      icon: 'clock',
      testid: 'kpi-due',
    }),
    kpi({
      label: 'Overdue installments',
      value: k.overdue.count.toLocaleString('en-US'),
      sub: `${formatPHP(k.overdue.amount)} at risk`,
      tone: 'warn',
      icon: 'alert',
      testid: 'kpi-overdue',
    }));
}

// ---------------------------------------------------------------------------------------------
// Recent activity (top 8, typed)

function renderRecent(ctx, state) {
  const rows = ctx.selectors.paymentHistory(state).slice(0, 8);
  return card({
    eyebrow: 'Requests and transactions',
    title: 'Recent activity',
    cls: 'dash-recent',
    flush: true,
    testid: 'dash-recent',
    actions: btn('All transactions', { variant: 'ghost', size: 'sm', iconRight: 'chevronRight', onClick: () => ctx.router.go('#/m/transactions') }),
    body: table({
      testid: 'recent-table',
      dense: true,
      pageSize: 8,
      rows,
      empty: 'No payment activity yet.',
      rowTestid: (r) => `recent-${r.id}`,
      onRowClick: (r) => ctx.router.go(recordHref(r)),
      columns: [
        { key: 'id', label: 'Record', sortable: false, render: (r) => h('div', { class: 'dash-rec' }, typeTag(r.type), idCell(r)) },
        { key: 'borrowerName', label: 'Borrower', sortable: false, render: (r) => borrowerCell(state, r) },
        { key: 'amount', label: 'Amount', align: 'right', sortable: false, render: (r) => h('span', { class: 'num' }, formatPHP(r.amount)) },
        { key: 'status', label: 'Status', sortable: false, render: (r) => h('div', { class: 'dash-status' }, chip(r.status), h('time', { class: 'dash-when num', attrs: { datetime: r.at } }, fmtDateTime(r.at))) },
      ],
    }),
  });
}

// ---------------------------------------------------------------------------------------------
// Reconciliation exceptions summary (8 V3 §13 types)

function renderExceptions(ctx, state) {
  const sum = ctx.selectors.exceptionSummary(state);
  const total = Object.values(sum).reduce((s, n) => s + n, 0);
  const list = h('ul', { class: 'dash-exc', testid: 'dash-exceptions' });
  for (const type of EXCEPTION_TYPES) {
    const n = sum[type] || 0;
    list.appendChild(h('li', {},
      h('a', { href: '#/m/reconciliation', class: ['dash-exc-row', { 'is-zero': n === 0 }], testid: `exc-${type}` },
        h('span', { class: 'dash-exc-label' }, humanize(type)),
        n > 0 ? chip('open', { label: `${n} open`, size: 'md' }) : chip('resolved', { label: 'None open' }))));
  }
  return card({
    eyebrow: 'Reconciliation',
    title: 'Exceptions',
    testid: 'dash-exc-card',
    cls: 'dash-exc-card',
    flush: true,
    actions: h('span', { class: 'dash-exc-total num', testid: 'exc-total' }, `${total} open`),
    body: list,
    footer: h('a', { href: '#/m/reconciliation', class: 'dash-foot-link' }, 'Open the reconciliation queue', icon('chevronRight', { size: 16 })),
  });
}

// ---------------------------------------------------------------------------------------------
// Portfolio recovery bars (single series, one hue; values labelled directly)

function renderRecovery(ctx, state) {
  const rows = ctx.selectors.portfolioRecovery(state);
  const maxPct = Math.max(0, ...rows.map((r) => r.pct));
  const axisMax = Math.max(5, Math.ceil(maxPct / 5) * 5);
  const list = h('ul', { class: 'rec', testid: 'dash-recovery', attrs: { 'aria-label': 'Recovery by portfolio: collected to date as a share of placed balance' } });
  for (const r of rows) {
    const w = axisMax ? (r.pct / axisMax) * 100 : 0;
    list.appendChild(h('li', { class: 'rec-row', testid: `recovery-${r.portfolioId}`, attrs: { title: `${r.name}: ${formatPHP(r.collected)} collected of ${formatPHP(r.placed)} placed (${r.pct}%)` } },
      h('div', { class: 'rec-top' },
        h('a', { href: `#/m/portfolios/${r.portfolioId}`, class: 'rec-name' }, r.name),
        h('span', { class: 'rec-pct num' }, `${r.pct.toFixed(1)}%`)),
      h('div', { class: 'rec-track', attrs: { 'aria-hidden': 'true' } }, h('div', { class: 'rec-fill', style: { width: `${w.toFixed(2)}%` } })),
      h('div', { class: 'rec-sub num' }, `${formatPHP(r.collected)} collected of ${formatPHP(r.placed)} placed`)));
  }
  return card({
    eyebrow: 'Collected to date ÷ placed balance',
    title: 'Portfolio recovery',
    testid: 'dash-recovery-card',
    body: h('div', {}, list,
      h('div', { class: 'rec-axis num', attrs: { 'aria-hidden': 'true' } }, h('span', {}, '0%'), h('span', {}, `${axisMax}%`))),
  });
}

// ---------------------------------------------------------------------------------------------
// Payment history: filters (incl. status Expired), sortable/paged table, CSV export

const hist = memo('dash.history', () => ({ from: '', to: '', ref: '', min: '', max: '', portfolioId: '', status: '', type: '' }));

/** UI filter values → paymentHistory() filters (pesos → centavos). */
function historyFilters(ctx) {
  const toC = (v) => {
    if (v === '' || v === null || v === undefined) return '';
    const c = ctx.money.parsePesos(v);
    return c === null ? '' : c;
  };
  return {
    from: hist.from || undefined,
    to: hist.to || undefined,
    ref: hist.ref || undefined,
    min: toC(hist.min),
    max: toC(hist.max),
    portfolioId: hist.portfolioId || undefined,
    status: hist.status || undefined,
    type: hist.type || undefined,
  };
}

const CSV_COLUMNS = [
  { key: 'typeLabel', label: 'Type' },
  { key: 'id', label: 'Record ID' },
  { key: 'date', label: 'Date (PHT)' },
  { key: 'borrowerName', label: 'Borrower' },
  { key: 'accountRef', label: 'Account reference' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'amountPHP', label: 'Amount (PHP)' },
  { key: 'statusLabel', label: 'Status' },
  { key: 'method', label: 'Method' },
  { key: 'related', label: 'Related record' },
];

/** Rows exactly as shown (filtered) → CSV text. Amounts as plain decimal pesos. */
export function historyCSV(ctx, state, rows) {
  const out = rows.map((r) => ({
    typeLabel: r.type === 'request' ? 'Payment request' : 'Transaction',
    id: r.id,
    date: fmtDateTime(r.at),
    borrowerName: r.borrowerName,
    accountRef: r.accountRef,
    portfolio: state.portfolios[r.portfolioId]?.name ?? '',
    amountPHP: (r.amount / 100).toFixed(2),
    statusLabel: humanize(r.status),
    method: r.method ?? '',
    related: r.type === 'request' ? (r.replacedById ? `Replaced by ${r.replacedById}` : r.replacesId ? `Replaces ${r.replacesId}` : '') : (r.requestId ?? ''),
  }));
  return ctx.csv.toCSV(out, CSV_COLUMNS);
}

function renderHistory(ctx, state) {
  const rows = ctx.selectors.paymentHistory(state, historyFilters(ctx));
  const portfolios = Object.values(state.portfolios).map((p) => ({ value: p.id, label: p.name }));
  const active = Object.values(hist).filter(Boolean).length;
  const bar = filterBar({
    testid: 'history-filter',
    values: hist,
    fields: [
      { type: 'date', name: 'from', label: 'From' },
      { type: 'date', name: 'to', label: 'To' },
      { type: 'text', name: 'ref', label: 'Reference, ID or name', placeholder: 'e.g. MBA-TXN-004216', wide: true },
      { type: 'number', name: 'min', label: 'Min ₱', placeholder: '0', min: 0, step: '0.01' },
      { type: 'number', name: 'max', label: 'Max ₱', placeholder: 'Any', min: 0, step: '0.01' },
      { type: 'select', name: 'portfolioId', label: 'Portfolio', options: portfolios },
      { type: 'select', name: 'status', label: 'Status', options: HISTORY_STATUSES.map((s) => ({ value: s, label: humanize(s) })) },
      { type: 'select', name: 'type', label: 'Type', options: [{ value: 'request', label: 'Requests (MBA-REQ)' }, { value: 'attempt', label: 'Transactions (MBA-TXN)' }] },
    ],
    onApply: (v) => {
      Object.assign(hist, v);
      memo('table:dash-history', () => ({})).page = 0;
      ctx.rerender();
    },
  });

  const exportBtn = btn('Export CSV', {
    variant: 'secondary', size: 'sm', icon: 'download', testid: 'export-csv',
    disabled: rows.length === 0,
    onClick: () => {
      downloadFile('payment-history.csv', 'text/csv', historyCSV(ctx, state, rows));
      toast(`Exported ${rows.length.toLocaleString('en-US')} rows to payment-history.csv.`, { kind: 'ok', testid: 'export-toast' });
    },
  });

  return card({
    eyebrow: 'Requests and transactions, newest first',
    title: 'Payment history',
    testid: 'dash-history',
    cls: 'dash-history',
    actions: h('div', { class: 'row' },
      h('span', { class: 'dash-hist-count num', testid: 'history-count' }, `${rows.length.toLocaleString('en-US')} ${rows.length === 1 ? 'record' : 'records'}${active ? ' (filtered)' : ''}`),
      exportBtn),
    body: h('div', {},
      bar,
      table({
        testid: 'history-table',
        stateKey: 'dash-history',
        pageSize: 15,
        rows,
        caption: 'Payment history',
        empty: 'No requests or transactions match these filters. Reset the filters to see everything.',
        rowTestid: (r) => `history-${r.id}`,
        onRowClick: (r) => ctx.router.go(recordHref(r)),
        columns: [
          { key: 'id', label: 'Record', sortValue: (r) => r.id, render: (r) => h('div', { class: 'dash-rec' }, typeTag(r.type), idCell(r)) },
          { key: 'borrowerName', label: 'Borrower', render: (r) => borrowerCell(state, r) },
          { key: 'portfolioId', label: 'Portfolio', sortValue: (r) => state.portfolios[r.portfolioId]?.name ?? '', render: (r) => state.portfolios[r.portfolioId]?.name ?? '—' },
          { key: 'amount', label: 'Amount', align: 'right', render: (r) => h('span', { class: 'num' }, formatPHP(r.amount)) },
          {
            key: 'at', label: 'Status · date', sortValue: (r) => r.at,
            render: (r) => h('div', { class: 'dash-status' }, chip(r.status),
              h('time', { class: 'dash-when num', attrs: { datetime: r.at } }, fmtDateTime(r.at)),
              r.type === 'request' && r.replacedById ? h('span', { class: 'dash-repl num' }, `→ replaced by ${r.replacedById}`) : null),
          },
        ],
      })),
  });
}

// ---------------------------------------------------------------------------------------------

function renderDashboard(ctx) {
  const state = ctx.store.get();
  return h('div', { class: 'page page-dashboard', testid: 'dashboard' },
    pageHeader({
      eyebrow: 'Overview',
      title: 'Dashboard',
      subtitle: 'Collections at a glance: money in, arrangements, what is due and what needs attention.',
      meta: [
        h('span', { class: 'dash-asof' }, icon('clock', { size: 16 }), h('span', { class: 'num' }, `As of ${fmtDateTime(ctx.clock.DEMO_NOW)} PHT`)),
        tag('Demo data', { tone: 'neutral' }),
      ],
    }),
    renderKpis(ctx, state),
    h('div', { class: 'dash-grid' },
      h('div', { class: 'dash-main' }, renderRecent(ctx, state), renderRecovery(ctx, state)),
      h('div', { class: 'dash-side' }, renderExceptions(ctx, state))),
    renderHistory(ctx, state));
}

