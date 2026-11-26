// Dashboard (MBA view, D§7.1, V3 §18 / §18.1). Every figure is computed by core selectors from
// the demo dataset (C6) — nothing here is hard-coded. Rows are typed: MBA-REQ-… = payment
// request, MBA-TXN-… = checkout attempt / payment (V3 §16 mockup fix). Payment history shows
// Expired requests and exports a real CSV file.
// 2026-11-26: the "Midnight" look (design option A, chosen by the owner) has its own dashboard
// arrangement further down (renderMidnight). The Classic dashboard is unchanged.
import { renderMbaLayout } from './layout.js';
import {
  h, btn, card, table, filterBar, kpi, pageHeader, chip, tag, toast, memo, icon,
  formatPHP, fmtDate, fmtDateTime, humanize, downloadFile,
} from '../ui/kit.js';
import { isMidnight } from '../ui/look.js';
import * as fx from '../ui/fx.js';

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

function renderExceptions(ctx, state, { mn = false } = {}) {
  const sum = ctx.selectors.exceptionSummary(state);
  const total = Object.values(sum).reduce((s, n) => s + n, 0);
  const most = Math.max(1, ...Object.values(sum));
  const list = h('ul', { class: 'dash-exc', testid: 'dash-exceptions' });
  for (const type of EXCEPTION_TYPES) {
    const n = sum[type] || 0;
    list.appendChild(h('li', {},
      h('a', { href: '#/m/reconciliation', class: ['dash-exc-row', { 'is-zero': n === 0 }], testid: `exc-${type}` },
        h('span', { class: 'dash-exc-label' }, humanize(type)),
        // Midnight only: a glowing bar, open count relative to the busiest type (decoration; the chip says it in words).
        mn ? h('span', { class: 'mnd-exc-bar', attrs: { 'aria-hidden': 'true' } }, h('i', { style: { width: `${((n / most) * 100).toFixed(1)}%` } })) : null,
        n > 0 ? chip('open', { label: `${n} open`, size: 'md' }) : chip('resolved', { label: 'None open' }))));
  }
  return card({
    eyebrow: 'Reconciliation',
    title: 'Exceptions',
    testid: 'dash-exc-card',
    cls: mn ? 'dash-exc-card mnd-card mnd-exc-card' : 'dash-exc-card',
    flush: true,
    actions: h('span', { class: 'dash-exc-total num', testid: 'exc-total' }, `${total} open`),
    body: list,
    footer: h('a', { href: '#/m/reconciliation', class: 'dash-foot-link' }, 'Open the reconciliation queue', icon('chevronRight', { size: 16 })),
  });
}

// ---------------------------------------------------------------------------------------------
// Portfolio recovery bars (single series, one hue; values labelled directly)

function renderRecovery(ctx, state, { mn = false } = {}) {
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
    cls: mn ? 'mnd-card mnd-rec-card' : '',
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
// Midnight look (2026-11-26). The owner picked design option A from dist/options.html and asked for
// it across the working demo; this is its dashboard, built from src/options/a/mba.js on the real
// state. Everything here renders only when isMidnight(). Styles: midnight-mba-shell.css (.mnd-*).
//
// Testids are kept: the hero IS the "Collected this month" KPI (kpi-collected, kpi-collected-value),
// the three other KPI tiles sit in dash-kpis, the recent list keeps recent-table / recent-<id>.
// kpi-collected-value always holds the exact formatPHP() text (scenarios read it right after the
// render), so its count-up is painted on an aria-hidden copy laid over it.
//
// Motion runs only when the screen is entered (ctx.entering, set by the shell on a route change or a
// look switch), so a re-render (bell, role, a webhook) never replays it; it waits for the intro,
// and is skipped under "reduce motion".

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const clamp01 = (t) => Math.max(0, Math.min(1, t));
let mndUid = 0;

/** 'Sat, Nov 21' for a 'YYYY-MM-DD' day. */
function dayShort(day) {
  const [y, m, d] = day.split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${shortDate(day)}`;
}
const daysInMonth = (day) => {
  const [y, m] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * Daily collections for the current month to date (PHT): each payment on its paidAt day, less any
 * refund on its refundedAt day. The same rule as kpis().collectedThisMonth, so the days add up to it.
 */
export function dailyCollected(state, clock) {
  const month = clock.phtMonth(clock.DEMO_NOW);
  const days = [];
  for (let d = `${month}-01`; d <= clock.DEMO_TODAY; d = clock.addDays(d, 1)) days.push(d);
  const daily = Object.fromEntries(days.map((d) => [d, 0]));
  for (const p of Object.values(state.payments)) {
    const d = p.paidAt && clock.phtDate(p.paidAt);
    if (d && d in daily) daily[d] += p.gross;
    const r = p.refunded && p.refundedAt && clock.phtDate(p.refundedAt);
    if (r && r in daily) daily[r] -= p.gross;
  }
  return days.map((d) => ({ date: d, amount: daily[d] }));
}

/** Peso amount split for big-number styling; its textContent is exactly formatPHP(centavos). */
function moneyEl(centavos, { cls = null, testid = null } = {}) {
  const s = formatPHP(centavos);
  const m = /^(-?₱)([\d,]+)(\.\d{2})$/.exec(s);
  return h('span', { class: ['mnd-money', 'num', cls], testid },
    m ? [h('span', { class: 'mc-sign' }, m[1]), h('span', { class: 'mc-whole' }, m[2]), h('span', { class: 'mc-cents' }, m[3])] : s);
}
function paintMoney(el, centavos) {
  const v = Math.max(0, Math.round(centavos));
  el.querySelector('.mc-whole').textContent = Math.floor(v / 100).toLocaleString('en-US');
  el.querySelector('.mc-cents').textContent = `.${String(v % 100).padStart(2, '0')}`;
}

/** Runs fn once the intro splash has started to leave (or right away when there is none). */
function afterIntro(fn) {
  const wait = () => {
    const s = document.querySelector('.splash');
    if (s && !s.classList.contains('is-out')) setTimeout(wait, 120);
    else fn();
  };
  wait();
}

/** paint(p) for p 0 → 1 (ease-out), once el is on screen and the intro has gone. */
function tweenIn(el, paint, { delay = 0, duration = 1200, done = null } = {}) {
  paint(0);
  afterIntro(() => fx.inView(el, () => {
    const start = performance.now() + delay;
    const step = (now) => {
      const t = clamp01((now - start) / duration);
      paint(easeOutExpo(t));
      if (t < 1) requestAnimationFrame(step);
      else if (done) done();
    };
    requestAnimationFrame(step);
  }));
}

/** fx.stagger, but it waits for the intro too. */
function staggerIn(parent, selector, { step = 60, base = 0 } = {}) {
  const items = [...parent.querySelectorAll(selector)];
  items.forEach((el, i) => {
    el.style.setProperty('--fx-i', String(i));
    el.style.setProperty('--fx-step', `${step}ms`);
    el.style.setProperty('--fx-base', `${base}ms`);
    el.classList.add('fx-rise');
  });
  afterIntro(() => fx.inView(parent, () => items.forEach((el) => el.classList.add('fx-on'))));
}

/** A KPI figure: the exact text, or a count-up that ends on the exact text. */
function countMoney(centavos, anim, { delay = 0 } = {}) {
  const el = moneyEl(centavos);
  if (anim && el.querySelector('.mc-whole')) tweenIn(el, (p) => paintMoney(el, centavos * p), { delay, duration: 1200 });
  return el;
}
function countNumber(n, anim, { delay = 0 } = {}) {
  const el = h('span', { class: 'num' }, n.toLocaleString('en-US'));
  if (anim) tweenIn(el, (p) => { el.textContent = Math.round(n * p).toLocaleString('en-US'); }, { delay, duration: 1100 });
  return el;
}

/**
 * The daily area chart, Nov 1 → today, with a hover / arrow-key readout. The SVG is drawn in fixed
 * chart units and stretched to the plot (non-scaling stroke); the dots and the readout are HTML,
 * placed in % so they stay round and in place at any width. Its entrance (a left-to-right sweep)
 * is CSS, keyed to the hero's fx-on class.
 */
function dailyChart(days, { best }) {
  const W = 720;
  const H = 120;
  const PAD = 8;
  const vals = days.map((d) => d.amount);
  const n = vals.length;
  const max = Math.max(1, ...vals);
  const step = (W - PAD * 2) / Math.max(1, n - 1);
  const pt = (i) => [PAD + i * step, H - PAD - (Math.max(0, vals[i]) / max) * (H - PAD * 2)];
  const pctX = (x) => `${((x / W) * 100).toFixed(3)}%`;
  const pctY = (y) => `${((y / H) * 100).toFixed(3)}%`;
  const today = days[n - 1].date;
  const label = (i) => `${dayShort(days[i].date)}${i === n - 1 ? ' (so far)' : ''}`;

  const svgEl = fx.areaChart({
    values: vals.map((v) => Math.max(0, v)), w: W, h: H, pad: PAD, className: 'mnd-area', stroke: '#8FD8FF', fillFrom: '#3D7BFF', drawn: false,
    label: `Daily collections, ${shortDate(days[0].date)} to ${shortDate(today)}`,
  });
  const gid = `mnd-line-${++mndUid}`;
  svgEl.querySelector('defs').append(fx.svg('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: W, y2: 0 },
    fx.svg('stop', { offset: '0%', 'stop-color': '#B89CFF' }),
    fx.svg('stop', { offset: '55%', 'stop-color': '#8FD8FF' }),
    fx.svg('stop', { offset: '100%', 'stop-color': '#64C8FF' })));
  svgEl.querySelector('.fx-area-line').setAttribute('stroke', `url(#${gid})`);
  svgEl.querySelector('defs linearGradient stop')?.setAttribute('stop-opacity', '0.6');

  const dot = (i, cls) => {
    const [x, y] = pt(i);
    return h('span', { class: cls, style: { left: pctX(x), top: pctY(y) }, attrs: { 'aria-hidden': 'true' } });
  };
  const plot = h('div', { class: 'mnd-plot' }, svgEl, best >= 0 && best !== n - 1 ? dot(best, 'mnd-peak') : null, dot(n - 1, 'mnd-end'));

  // Weekly ticks (Nov 1, 8, 15, 22) and Today; the last weekly one hides on phones where it would crowd "Today".
  const ticks = [0, 7, 14, 21].filter((i) => i < n - 2).concat(n - 1);
  const axis = h('div', { class: 'mnd-axis', attrs: { 'aria-hidden': 'true' } },
    ticks.map((i) => h('span', {
      class: ['mnd-tick', { 'is-first': i === 0, 'is-last': i === n - 1, 'is-crowd': i !== 0 && i !== n - 1 && n - 1 - i < 6 }],
      style: { left: pctX(pt(i)[0]) },
    }, i === n - 1 ? 'Today' : shortDate(days[i].date))));
  const box = h('div', { class: 'mnd-chart' }, plot, axis);

  // Readout: pointer, or the arrow keys on the focusable slider.
  const guide = h('span', { class: 'mnd-guide', attrs: { 'aria-hidden': 'true' } });
  const gdot = h('span', { class: 'mnd-gdot', attrs: { 'aria-hidden': 'true' } });
  const tipDay = h('span', { class: 'mnd-tip-day' });
  const tipAmt = h('strong', { class: 'mnd-tip-amt num' });
  const tip = h('span', { class: 'mnd-tip', attrs: { 'aria-hidden': 'true' } }, tipDay, tipAmt);
  let cur = n - 1;
  const text = (i) => `${label(i)}: ${formatPHP(vals[i])}`;
  const slider = h('div', {
    class: 'mnd-scrub',
    tabindex: 0,
    testid: 'hero-chart',
    attrs: {
      role: 'slider', 'aria-label': 'Daily collections. Use the arrow keys to read each day.',
      'aria-valuemin': 1, 'aria-valuemax': n, 'aria-valuenow': n, 'aria-valuetext': text(n - 1),
    },
  });
  const show = (i) => {
    cur = Math.max(0, Math.min(n - 1, i));
    const [x, y] = pt(cur);
    box.classList.add('is-scrub');
    guide.style.left = pctX(x);
    gdot.style.left = pctX(x);
    gdot.style.top = pctY(y);
    tipDay.textContent = label(cur);
    tipAmt.textContent = formatPHP(vals[cur]);
    // beside the point (left of it on the right half), kept inside the plot's height
    const ph = plot.clientHeight || H;
    const ypx = (y / H) * ph;
    tip.classList.toggle('is-left', x > W * 0.55);
    tip.style.left = pctX(x);
    tip.style.top = `${Math.max(-6, Math.min(ph - 40, ypx - 20))}px`;
    slider.setAttribute('aria-valuenow', String(cur + 1));
    slider.setAttribute('aria-valuetext', text(cur));
  };
  const hide = () => box.classList.remove('is-scrub');
  const fromPointer = (e) => {
    const r = plot.getBoundingClientRect();
    if (!r.width) return;
    const x = ((e.clientX - r.left) / r.width) * W;
    show(Math.round((x - PAD) / step));
  };
  slider.addEventListener('pointermove', fromPointer);
  slider.addEventListener('pointerdown', fromPointer);
  slider.addEventListener('pointerleave', () => { if (document.activeElement !== slider) hide(); });
  slider.addEventListener('focus', () => show(cur));
  slider.addEventListener('blur', hide);
  slider.addEventListener('keydown', (e) => {
    const move = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (move) { e.preventDefault(); show(cur + move); } else if (e.key === 'Home') { e.preventDefault(); show(0); } else if (e.key === 'End') { e.preventDefault(); show(n - 1); }
  });
  plot.append(guide, gdot, tip, slider);
  return box;
}

/** "Collected this month": the hero, and the kpi-collected tile in this look. */
function renderHeroMidnight(ctx, state, k, anim) {
  const { clock } = ctx;
  const days = dailyCollected(state, clock);
  const vals = days.map((d) => d.amount);
  const best = vals.reduce((bi, v, i) => (v > vals[bi] ? i : bi), 0);
  const today = clock.DEMO_TODAY;
  const dayNo = Number(today.slice(8, 10));
  const left = daysInMonth(today) - dayNo;
  const lastMonth = MONTHS_LONG[Number(clock.addDays(`${today.slice(0, 7)}-01`, -1).slice(5, 7)) - 1];
  const thisMonth = MONTHS_LONG[Number(today.slice(5, 7)) - 1].slice(0, 3);
  const pct = k.collectedLastMonth ? (k.collectedThisMonth / k.collectedLastMonth) * 100 : 0;

  // The exact figure (read by checks and screen readers); a count-up copy is laid over it on entry.
  const value = moneyEl(k.collectedThisMonth, { cls: 'mnd-hero-money', testid: 'kpi-collected-value' });
  const figure = h('div', { class: 'mnd-figure' }, value);
  if (anim && value.querySelector('.mc-whole')) {
    const ghost = moneyEl(k.collectedThisMonth, { cls: 'mnd-hero-money mnd-ghost' });
    ghost.setAttribute('aria-hidden', 'true');
    figure.classList.add('is-counting');
    figure.append(ghost);
    tweenIn(figure, (p) => paintMoney(ghost, k.collectedThisMonth * p), {
      delay: 150, duration: 1500, done: () => { figure.classList.remove('is-counting'); ghost.remove(); },
    });
  }

  const compare = k.collectedLastMonth
    ? h('div', { class: 'mnd-compare', testid: 'hero-compare' },
      h('div', { class: 'mnd-meter', attrs: { 'aria-hidden': 'true' } }, h('i', { style: { width: `${Math.min(100, pct).toFixed(1)}%` } })),
      h('p', { class: 'mnd-compare-text' },
        h('strong', { class: 'num' }, `${Math.round(pct)}%`), ` of ${lastMonth}’s `, h('span', { class: 'num mnd-strong' }, formatPHP(k.collectedLastMonth)), ' total',
        left > 0 ? `, with ${left} day${left === 1 ? '' : 's'} to go` : ''))
    : null;

  const el = h('section', { class: 'mnd-hero', testid: 'kpi-collected', attrs: { 'aria-labelledby': 'mnd-hero-title' } },
    h('div', { class: 'mnd-hero-top' },
      h('div', { class: 'mnd-hero-main' },
        h('div', { class: 'mnd-hero-label' },
          h('h2', { class: 'mnd-label', id: 'mnd-hero-title' }, 'Collected this month'),
          h('span', { class: 'mnd-pill is-info num' }, `${thisMonth} 1–${dayNo} so far`)),
        figure,
        h('p', { class: 'mnd-hero-net' }, 'Net of fees ', h('strong', { class: 'num' }, formatPHP(k.collectedThisMonthNet)))),
      vals[best] > 0 ? h('div', { class: 'mnd-best', testid: 'hero-best-day' },
        h('span', { class: 'mnd-best-label' }, h('i', { attrs: { 'aria-hidden': 'true' } }), 'Best day'),
        h('span', { class: 'mnd-best-day' }, dayShort(days[best].date)),
        h('strong', { class: 'num' }, formatPHP(vals[best]))) : null),
    compare,
    days.length >= 2 ? dailyChart(days, { best }) : null);
  return el;
}

/** The other three KPI tiles (same labels, values and notes as Classic; count-ups on entry). */
function renderKpisMidnight(ctx, k, anim) {
  const weekEnd = ctx.clock.addDays(ctx.clock.DEMO_TODAY, 6);
  const row = h('div', { class: 'dash-kpis mnd-kpis', testid: 'dash-kpis', attrs: { role: 'group', 'aria-label': 'Key figures' } },
    kpi({
      label: 'Active arrangements',
      value: countNumber(k.activeArrangements, anim, { delay: 250 }),
      sub: `+${k.newArrangementsThisMonth} activated this month`,
      tone: 'info',
      icon: 'arrangements',
      testid: 'kpi-active',
    }),
    kpi({
      label: 'Due this week',
      value: countMoney(k.dueThisWeek.amount, anim, { delay: 330 }),
      // Same text as Classic; the date range is kept on one line when the note wraps.
      sub: h('span', {}, `${k.dueThisWeek.count} installments · `, h('span', { class: 'mnd-nowrap' }, `${shortDate(ctx.clock.DEMO_TODAY)} – ${shortDate(weekEnd)}`)),
      tone: 'brand',
      icon: 'clock',
      testid: 'kpi-due',
    }),
    kpi({
      label: 'Overdue installments',
      value: countNumber(k.overdue.count, anim, { delay: 410 }),
      sub: `${formatPHP(k.overdue.amount)} at risk`,
      tone: 'warn',
      icon: 'alert',
      testid: 'kpi-overdue',
    }));
  // Phones: the tiles become a swipe row; the dots show (and jump to) the tile in view.
  const tiles = [...row.children];
  const dots = tiles.map((tile, i) => h('button', {
    type: 'button',
    class: ['mnd-dot', { 'is-on': i === 0 }],
    testid: `kpi-dot-${i + 1}`,
    attrs: { 'aria-label': `Show ${tile.querySelector('.kpi-label')?.textContent || `figure ${i + 1}`}`, 'aria-current': i === 0 ? 'true' : null },
    on: { click: () => row.scrollTo({ left: tile.offsetLeft - tiles[0].offsetLeft, behavior: fx.reduced() ? 'auto' : 'smooth' }) },
  }));
  let raf = 0;
  row.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const span = (tiles[1]?.offsetLeft ?? 0) - tiles[0].offsetLeft || 1;
      const end = row.scrollLeft >= row.scrollWidth - row.clientWidth - 2;
      const idx = end ? tiles.length - 1 : Math.round(row.scrollLeft / span);
      dots.forEach((d, i) => { d.classList.toggle('is-on', i === idx); if (i === idx) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    });
  }, { passive: true });
  return h('div', { class: 'mnd-kpis-wrap' }, row, h('div', { class: 'mnd-dots' }, dots));
}

/** Needs attention: the two queues waiting on a person, each opening its real screen. */
function renderAttention(ctx, state) {
  let approvals = 0;
  for (const a of Object.values(state.arrangements)) if (a.status === 'pending_approval') approvals++;
  const exceptions = Object.values(ctx.selectors.exceptionSummary(state)).reduce((s, n) => s + n, 0);
  const items = [
    {
      key: 'approvals', n: approvals, tone: 'lilac', variant: 'primary', act: 'Review',
      what: 'Awaiting approval',
      why: approvals ? 'Waiting for a supervisor’s sign-off' : 'No arrangement is waiting for sign-off',
      aria: `Review the ${approvals} arrangement${approvals === 1 ? '' : 's'} awaiting approval`,
      go: () => {
        // Open the Arrangements list filtered to what is waiting (its own filter memory).
        Object.assign(memo('arr.list', () => ({ status: '', q: '', portfolioId: '' })), { status: 'pending_approval', q: '', portfolioId: '' });
        ctx.router.go('#/m/arrangements');
      },
    },
    {
      key: 'exceptions', n: exceptions, tone: 'warn', variant: 'secondary', act: 'Open queue',
      what: 'Reconciliation exceptions',
      why: exceptions ? 'Our records and the provider’s disagree' : 'Our records match the provider’s',
      aria: `Open the reconciliation queue, ${exceptions} exception${exceptions === 1 ? '' : 's'} open`,
      go: () => ctx.router.go('#/m/reconciliation?tab=queue'),
    },
  ];
  return card({
    eyebrow: 'Queues',
    title: 'Needs attention',
    testid: 'dash-attention',
    cls: 'mnd-card mnd-attn',
    body: h('ul', { class: 'mnd-attn-list' }, items.map((it) => h('li', { class: ['mnd-attn-item', `is-${it.n ? it.tone : 'clear'}`] },
      h('span', { class: 'mnd-attn-n num', testid: `attn-${it.key}-count` }, String(it.n)),
      h('div', { class: 'mnd-attn-text' }, h('strong', {}, it.what), h('span', {}, it.why)),
      btn(it.act, { variant: it.variant, size: 'sm', testid: `attn-${it.key}`, attrs: { 'aria-label': it.aria }, onClick: it.go })))),
  });
}

/** '9:41 AM' today, 'Yesterday', else 'Nov 24' (PHT); the full date-time goes in the tooltip. */
function whenShort(ctx, iso) {
  const full = fmtDateTime(iso); // 'Nov 25, 2026, 1:41 PM'
  const day = ctx.clock.phtDate(iso);
  if (day === ctx.clock.DEMO_TODAY) return full.slice(full.lastIndexOf(', ') + 2);
  if (day === ctx.clock.addDays(ctx.clock.DEMO_TODAY, -1)) return 'Yesterday';
  return shortDate(iso);
}

/** Recent activity as a live list: newest requests and transactions, entering one after another. */
function renderRecentMidnight(ctx, state, anim) {
  const rows = ctx.selectors.paymentHistory(state).slice(0, 8);
  const list = h('ol', { class: 'mnd-live', testid: 'recent-table', attrs: { 'aria-label': `${rows.length} newest requests and transactions` } },
    rows.map((r, i) => h('li', { class: ['mnd-live-row', { 'is-newest': i === 0 }] },
      // Type in words too (never colour or shape alone): the record ID says MBA-REQ / MBA-TXN.
      h('a', { href: recordHref(r), class: 'mnd-live-link', testid: `recent-${r.id}` },
        h('span', { class: ['mnd-live-ic', r.type === 'request' ? 'is-request' : 'is-attempt'], attrs: { 'aria-hidden': 'true', title: r.type === 'request' ? 'Payment request' : 'Transaction' } },
          icon(r.type === 'request' ? 'requests' : 'transactions', { size: 17 })),
        h('span', { class: 'mnd-live-who' },
          h('strong', {}, r.borrowerName),
          h('span', { class: 'mnd-live-meta' },
            h('span', { class: 'sr-only' }, r.type === 'request' ? 'Payment request ' : 'Transaction '),
            h('span', { class: 'num' }, r.id), ' · ',
            h('time', { class: 'num', attrs: { datetime: r.at, title: fmtDateTime(r.at) } }, whenShort(ctx, r.at)))),
        h('span', { class: 'mnd-live-amt' },
          h('strong', { class: 'num' }, formatPHP(r.amount)),
          chip(r.status))))));
  if (!rows.length) list.appendChild(h('li', { class: 'mnd-live-empty' }, 'No payment activity yet.'));
  if (anim) staggerIn(list, ':scope > li', { step: 65, base: 260 });
  return card({
    eyebrow: 'Requests and transactions',
    title: 'Recent activity',
    cls: 'dash-recent mnd-card mnd-recent',
    testid: 'dash-recent',
    body: list,
    footer: h('a', { href: '#/m/transactions', class: 'dash-foot-link', testid: 'recent-all' }, 'All transactions', icon('chevronRight', { size: 16 })),
  });
}

function renderMidnight(ctx, state) {
  const anim = ctx.entering !== false && !fx.reduced();
  const k = ctx.selectors.kpis(state);
  const hero = renderHeroMidnight(ctx, state, k, anim);
  const kpis = renderKpisMidnight(ctx, k, anim);
  const attn = renderAttention(ctx, state);
  const recent = renderRecentMidnight(ctx, state, anim);
  const pair = h('div', { class: 'mnd-pair' }, renderExceptions(ctx, state, { mn: true }), renderRecovery(ctx, state, { mn: true }));
  const grid = h('div', { class: 'mnd-grid' },
    h('div', { class: 'mnd-col-main' }, hero, kpis, pair),
    h('div', { class: 'mnd-col-side' }, attn, recent));
  const page = h('div', { class: 'page page-dashboard is-midnight', testid: 'dashboard' },
    pageHeader({
      eyebrow: 'Overview',
      title: 'Dashboard',
      subtitle: 'Collections at a glance: money in, arrangements, what is due and what needs attention.',
      meta: [
        h('span', { class: 'dash-asof' }, icon('clock', { size: 16 }), h('span', { class: 'num' }, `As of ${fmtDateTime(ctx.clock.DEMO_NOW)} PHT`)),
        tag('Demo data', { tone: 'neutral' }),
      ],
    }),
    grid,
    renderHistory(ctx, state));
  // Choreography on entry: the hero first, then the side column, then the figures and detail cards.
  if (anim) {
    const order = [hero, attn, recent, ...kpis.querySelectorAll('.kpi'), ...pair.children];
    order.forEach((el, i) => {
      el.style.setProperty('--fx-i', String(i));
      el.style.setProperty('--fx-step', '70ms');
      el.classList.add('fx-rise');
    });
    afterIntro(() => fx.inView(grid, () => order.forEach((el) => el.classList.add('fx-on')), { threshold: 0.01 }));
  }
  return page;
}

// ---------------------------------------------------------------------------------------------

function renderDashboard(ctx) {
  const state = ctx.store.get();
  if (isMidnight()) return renderMidnight(ctx, state);
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

