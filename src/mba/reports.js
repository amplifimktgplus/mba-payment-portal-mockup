// Reports (MBA view, plan Task 9, D§7.9). Five report cards, each with an inline-SVG chart
// (no library; dataviz skill specs: ≤24px bars with a 4px rounded data end, 2px surface gaps,
// recessive baseline, text in text tokens, selective direct labels, hover + focus tooltips),
// a table view and a CSV export. Figures come from core/reports.js and core/selectors.js.
import { renderMbaLayout } from './layout.js';
import { collectionsByPortfolio, agentPerformance, overdueAging, overdueAgingSplit, methodMix, reconOverview } from '../core/reports.js';

export function register(router, ctx) {
  router.on('/m/reports', () => renderMbaLayout(ctx, renderReports(ctx), 'reports'));
}

// ------------------------------------------------------------------------------------ SVG helpers
const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const pesos = (c) => (c / 100).toFixed(2);

/** Horizontal bar: square at the baseline (x0), 4px rounded data end. */
function hBarPath(x0, y, len, t, r = 4) {
  if (len <= 0) return '';
  const rr = Math.min(r, len, t / 2);
  return `M${x0} ${y}h${len - rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${t - 2 * rr}a${rr} ${rr} 0 0 1 ${-rr} ${rr}h${-(len - rr)}z`;
}
/** Vertical column: square at the baseline (yBase), 4px rounded top. */
function vBarPath(x, yBase, len, t, r = 4) {
  if (len <= 0) return '';
  const rr = Math.min(r, len, t / 2);
  return `M${x} ${yBase}v${-(len - rr)}a${rr} ${rr} 0 0 1 ${rr} ${-rr}h${t - 2 * rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}v${len - rr}z`;
}
/** Rough Montserrat text width at a given size (for "does the label fit inside" checks). */
const textW = (str, size) => String(str).length * size * 0.62;

/**
 * Chart frame: draws the SVG at its real pixel width (1:1, so text is true size in a half-width
 * card, a full-width card and a phone) and redraws when the width changes. One tooltip per chart:
 * every mark is a <g class="viz-mark" tabindex=0> carrying data-tip-value / data-tip-label, and
 * hover and keyboard focus show the same readout (value leads, label follows).
 */
const MIN_W = 420; // below this the chart scrolls inside its card instead of squashing
function vizFrame(kit, draw, { testid }) {
  const { h } = kit;
  const tipValue = h('strong', { class: 'viz-tip-value num' });
  const tipLabel = h('span', { class: 'viz-tip-label' });
  const tip = h('div', { class: 'viz-tip', attrs: { role: 'status', 'aria-live': 'polite' }, hidden: true }, tipValue, tipLabel);
  const holder = h('div', { class: 'viz-scroll' });
  const wrap = h('div', { class: 'viz', testid }, holder, tip);
  let lastW = 0;
  const paint = (w) => {
    const W = Math.max(MIN_W, Math.floor(w));
    if (!w || W === lastW) return;
    lastW = W;
    holder.replaceChildren(draw(W));
    wrap.dataset.width = String(W);
  };
  paint(560); // first guess; the observer redraws at the real width before the first paint
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver((entries) => {
      if (!holder.isConnected) { ro.disconnect(); return; }
      for (const e of entries) paint(e.contentRect.width);
    });
    ro.observe(holder);
  }
  const show = (g, x, y) => {
    tipValue.textContent = g.dataset.tipValue || '';
    tipLabel.textContent = g.dataset.tipLabel || '';
    tip.hidden = false;
    const wr = wrap.getBoundingClientRect();
    const left = Math.max(4, Math.min(x - wr.left + 14, wr.width - tip.offsetWidth - 4));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, y - wr.top - tip.offsetHeight - 10)}px`;
  };
  const hide = () => { tip.hidden = true; };
  holder.addEventListener('pointermove', (e) => {
    const g = e.target.closest?.('.viz-mark');
    if (g) show(g, e.clientX, e.clientY); else hide();
  });
  holder.addEventListener('pointerleave', hide);
  holder.addEventListener('focusin', (e) => {
    const g = e.target.closest?.('.viz-mark');
    if (!g) return;
    const r = (g.querySelector('.viz-bar') || g).getBoundingClientRect();
    show(g, r.left + r.width / 2, r.top);
  });
  holder.addEventListener('focusout', hide);
  return wrap;
}

function mark(valueText, labelText, ...children) {
  return s('g', { class: 'viz-mark', tabindex: 0, role: 'img', 'aria-label': `${labelText}: ${valueText}`, 'data-tip-value': valueText, 'data-tip-label': labelText }, ...children);
}

/**
 * Horizontal bar chart, one row per category. rows: [{name, sub?, value, valueText, tip?, cls?}].
 * Every bar is direct-labelled at its tip (few rows), so no value axis is drawn.
 */
function hBars(kit, rows, { testid, title, labelW = 168, valueW = 136 }) {
  const rowH = 52;
  const T = 20;
  const top = 4;
  const H = top + rows.length * rowH + 4;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return vizFrame(kit, (W) => {
    const zone = W - labelW - valueW;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'viz-svg', role: 'group', 'aria-label': title });
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const by = y + (rowH - T) / 2;
      const len = r.value > 0 ? Math.max(2, (r.value / max) * zone) : 0;
      svg.appendChild(mark(r.tip?.value ?? r.valueText, r.tip?.label ?? r.name,
        s('rect', { class: 'viz-hit', x: 0, y, width: W, height: rowH, fill: 'transparent' }),
        s('text', { class: 'viz-cat', x: 0, y: r.sub ? y + rowH / 2 - 3 : y + rowH / 2 + 5 }, r.name),
        r.sub ? s('text', { class: 'viz-cat-sub', x: 0, y: y + rowH / 2 + 14 }, r.sub) : null,
        len ? s('path', { class: ['viz-bar', r.cls || 'viz-fill-brand'].join(' '), d: hBarPath(labelW, by, len, T) }) : null,
        s('text', { class: 'viz-val', x: labelW + len + 10, y: by + T / 2 + 5 }, r.valueText)));
    });
    svg.appendChild(s('line', { class: 'viz-axis', x1: labelW + 0.5, x2: labelW + 0.5, y1: top, y2: H - 4 }));
    return svg;
  }, { testid });
}

/** Column chart for ordered buckets (overdue aging). rows: [{name, sub, value, valueText}]. */
function columns(kit, rows, { testid, title }) {
  const H = 220;
  const base = H - 50;
  const top = 30;
  const T = 24;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return vizFrame(kit, (W) => {
    const slot = W / rows.length;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'viz-svg', role: 'group', 'aria-label': title });
    // Recessive hairline gridlines at 50% / 100% of the tallest column.
    for (const f of [0.5, 1]) {
      const gy = Math.round(base - (base - top) * f) + 0.5;
      svg.appendChild(s('line', { class: 'viz-grid', x1: 0, x2: W, y1: gy, y2: gy }));
    }
    rows.forEach((r, i) => {
      const cx = slot * i + slot / 2;
      const len = r.value > 0 ? Math.max(2, (r.value / max) * (base - top)) : 0;
      svg.appendChild(mark(r.valueText, `${r.name} past due · ${r.sub}`,
        s('rect', { class: 'viz-hit', x: slot * i + 4, y: 0, width: slot - 8, height: H, fill: 'transparent' }),
        len ? s('path', { class: 'viz-bar viz-fill-brand', d: vBarPath(cx - T / 2, base, len, T) }) : null,
        s('text', { class: ['viz-val', r.value ? '' : 'viz-val-zero'].join(' '), x: cx, y: base - len - 9, 'text-anchor': 'middle' }, r.valueText),
        s('text', { class: 'viz-cat', x: cx, y: base + 22, 'text-anchor': 'middle' }, r.name),
        s('text', { class: 'viz-cat-sub', x: cx, y: base + 40, 'text-anchor': 'middle' }, r.sub)));
    });
    svg.appendChild(s('line', { class: 'viz-axis', x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5 }));
    return svg;
  }, { testid });
}

/**
 * Tall segmented bar (one whole split into parts): 28px, 2px surface gaps, 4px corners, the share
 * printed inside when it fits. The legend (HTML, block order) names each part and gives its
 * count and amount — numbers the blocks do not print.
 */
function segmentedBar(kit, parts, { testid, title, legendCols }) {
  const { h } = kit;
  const H = 28;
  const GAP = 2;
  const total = parts.reduce((t, p) => t + p.value, 0);
  const visible = parts.filter((p) => p.value > 0);
  const frame = vizFrame(kit, (W) => {
    const avail = W - GAP * Math.max(0, visible.length - 1);
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'viz-svg viz-seg', role: 'group', 'aria-label': title });
    let x = 0;
    for (const p of visible) {
      const w = total ? (p.value / total) * avail : 0;
      const share = `${p.pct}%`;
      const fits = w >= textW(share, 12) + 16;
      svg.appendChild(mark(p.tipValue, `${p.name} · ${share}`,
        s('rect', { class: ['viz-bar', p.cls].join(' '), x, y: 0, width: Math.max(1, w), height: H, rx: Math.min(4, w / 2) }),
        fits ? s('text', { class: 'viz-in', x: x + 8, y: H / 2 + 4.5 }, share) : null));
      x += w + GAP;
    }
    return svg;
  }, { testid });
  const legend = h('table', { class: 'viz-legend-table', attrs: { 'aria-label': `${title} legend` } },
    h('thead', {}, h('tr', {}, legendCols.map((c, i) => h('th', { class: i ? 'al-right' : '', attrs: { scope: 'col' } }, c.label)))),
    h('tbody', {}, parts.map((p) => h('tr', {}, legendCols.map((c, i) => h(i ? 'td' : 'th', { class: i ? 'al-right num' : '', attrs: i ? {} : { scope: 'row' } },
      i ? c.value(p) : h('span', { class: 'viz-legend-name' },
        s('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true', class: 'viz-key' }, s('rect', { class: p.cls, width: 12, height: 12, rx: 2 })),
        p.name)))))));
  frame.appendChild(legend);
  return frame;
}

// ------------------------------------------------------------------------------------ report card

function reportCard(ctx, { id, n, title, def, chart, columns: cols, rows, csvRows, csvCols, wide = false }) {
  const { h, card, btn, table, toast, downloadFile } = ctx.kit;
  const exportCsv = () => {
    downloadFile(`report-${id}.csv`, 'text/csv', ctx.csv.toCSV(csvRows, csvCols));
    toast(`report-${id}.csv downloaded (${csvRows.length} rows).`, { kind: 'ok', testid: 'csv-toast' });
  };
  return card({
    eyebrow: `Report ${n}`,
    title,
    testid: `report-${id}`,
    cls: ['report-card', { 'report-wide': wide }],
    actions: btn('CSV', { variant: 'secondary', size: 'sm', icon: 'download', title: `Download ${title} as CSV`, testid: `csv-${id}`, onClick: exportCsv }),
    body: [
      h('p', { class: 'report-def' }, def),
      chart,
      h('details', { class: 'report-table' },
        h('summary', { testid: `table-${id}` }, 'View as table'),
        table({ columns: cols, rows, pageSize: 50, dense: true, testid: `report-table-${id}`, caption: title })),
    ],
  });
}

// ----------------------------------------------------------------------------------------- page

function renderReports(ctx) {
  const { h, pageHeader, kpi, formatPHP, fmtDateTime, humanize } = ctx.kit;
  const state = ctx.store.get();
  const k = ctx.selectors.kpis(state);
  const byPf = collectionsByPortfolio(state).sort((a, b) => b.collected - a.collected);
  const agents = agentPerformance(state);
  const aging = overdueAging(state);
  const mix = methodMix(state);
  const rec = reconOverview(state);
  const placed = byPf.reduce((t, r) => t + r.placed, 0);
  const collected = byPf.reduce((t, r) => t + r.collected, 0);
  const recoveryPct = placed ? Math.round((collected / placed) * 1000) / 10 : 0;
  const unresolved = rec.exceptions.open + rec.exceptions.in_review;
  const money = (c) => h('span', { class: 'num' }, formatPHP(c));
  const numCell = (v) => h('span', { class: 'num' }, Number(v).toLocaleString('en-US'));

  // 1 — Collections by portfolio
  const r1 = reportCard(ctx, {
    id: 'collections', n: '01', title: 'Collections by portfolio',
    def: 'Verified payments to date, net of refunds, against each portfolio’s placed balance.',
    chart: hBars(ctx.kit, byPf.map((r) => ({ name: r.name, sub: `${r.pct}% recovered`, value: r.collected, valueText: formatPHP(r.collected), tip: { value: formatPHP(r.collected), label: `${r.name} · ${r.pct}% of ${formatPHP(r.placed)} placed` } })), { testid: 'chart-collections', title: 'Collections by portfolio' }),
    columns: [
      { key: 'name', label: 'Portfolio' },
      { key: 'creditorName', label: 'Creditor' },
      { key: 'payments', label: 'Payments', align: 'right', render: (r) => numCell(r.payments) },
      { key: 'collected', label: 'Collected', align: 'right', render: (r) => money(r.collected) },
      { key: 'placed', label: 'Placed', align: 'right', render: (r) => money(r.placed) },
      { key: 'pct', label: 'Recovery', align: 'right', render: (r) => `${r.pct}%` },
    ],
    rows: byPf,
    csvRows: byPf.map((r) => ({ ...r, collected: pesos(r.collected), placed: pesos(r.placed) })),
    csvCols: [{ key: 'name', label: 'Portfolio' }, { key: 'creditorName', label: 'Creditor' }, { key: 'payments', label: 'Payments' }, { key: 'collected', label: 'Collected (PHP)' }, { key: 'placed', label: 'Placed (PHP)' }, { key: 'pct', label: 'Recovery %' }],
  });

  // 2 — Agent performance (this month)
  const r2 = reportCard(ctx, {
    id: 'agents', n: '02', title: 'Agent performance',
    def: 'November to date: money collected on each agent’s assigned accounts, with workload alongside.',
    chart: hBars(ctx.kit, agents.map((r) => ({ name: r.name, sub: `${r.accounts} accounts · ${r.contacts} contacts`, value: r.collected, valueText: formatPHP(r.collected), tip: { value: formatPHP(r.collected), label: `${r.name} · ${r.payments} payments · ${r.activeArrangements} active arrangements` } })), { testid: 'chart-agents', title: 'Collected this month by agent' }),
    columns: [
      { key: 'name', label: 'Agent' },
      { key: 'accounts', label: 'Accounts', align: 'right', render: (r) => numCell(r.accounts) },
      { key: 'contacts', label: 'Contacts (Nov)', align: 'right', render: (r) => numCell(r.contacts) },
      { key: 'activeArrangements', label: 'Active arr.', align: 'right', render: (r) => numCell(r.activeArrangements) },
      { key: 'payments', label: 'Payments (Nov)', align: 'right', render: (r) => numCell(r.payments) },
      { key: 'collected', label: 'Collected (Nov)', align: 'right', render: (r) => money(r.collected) },
    ],
    rows: agents,
    csvRows: agents.map((r) => ({ ...r, collected: pesos(r.collected) })),
    csvCols: [{ key: 'name', label: 'Agent' }, { key: 'accounts', label: 'Assigned accounts' }, { key: 'contacts', label: 'Contacts logged (Nov)' }, { key: 'activeArrangements', label: 'Active arrangements' }, { key: 'payments', label: 'Payments (Nov)' }, { key: 'collected', label: 'Collected Nov (PHP)' }],
  });

  // 3 — Overdue aging
  const agingTotal = aging.reduce((t, r) => ({ count: t.count + r.count, amount: t.amount + r.amount }), { count: 0, amount: 0 });
  // Reconciles this report with the "Overdue installments" KPI on the same page (computed, never
  // hard-coded): active + defaulted (+ other) = the aging total, counts and amounts.
  const split = overdueAgingSplit(state);
  const kpiMatch = split.active.count === k.overdue.count && split.active.amount === k.overdue.amount;
  const inst = (n) => `${n} ${n === 1 ? 'installment' : 'installments'}`;
  const agingSplit = h('span', {
    testid: 'aging-split',
    dataset: {
      activeCount: split.active.count, activeAmount: split.active.amount,
      defaultedCount: split.defaulted.count, defaultedAmount: split.defaulted.amount,
      otherCount: split.other.count, otherAmount: split.other.amount,
    },
  },
  ` That is ${split.active.count} on active plans (${formatPHP(split.active.amount)}${kpiMatch ? ', the Overdue installments figure' : ''})`,
  ` + ${split.defaulted.count} on defaulted plans (${formatPHP(split.defaulted.amount)})`,
  split.other.count ? ` + ${split.other.count} on other plans (${formatPHP(split.other.amount)})` : '',
  '.',
  !kpiMatch && split.notYetPastDue.count ? ` The Overdue installments figure (${k.overdue.count}) also counts ${inst(split.notYetPastDue.count)} marked overdue before the due date.` : '');
  const r3 = reportCard(ctx, {
    id: 'aging', n: '03', title: 'Overdue aging',
    def: [`Unpaid installments past their due date (overdue or missed), by days past due: ${agingTotal.count} installments, ${formatPHP(agingTotal.amount)}.`, agingSplit],
    chart: columns(ctx.kit, aging.map((r) => ({ name: r.label, sub: `${r.count} ${r.count === 1 ? 'installment' : 'installments'}`, value: r.amount, valueText: formatPHP(r.amount) })), { testid: 'chart-aging', title: 'Overdue aging by days past due' }),
    columns: [
      { key: 'label', label: 'Days past due' },
      { key: 'count', label: 'Installments', align: 'right', render: (r) => numCell(r.count) },
      { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
    ],
    rows: aging,
    csvRows: aging.map((r) => ({ ...r, amount: pesos(r.amount) })),
    csvCols: [{ key: 'label', label: 'Days past due' }, { key: 'count', label: 'Installments' }, { key: 'amount', label: 'Amount (PHP)' }],
  });

  // 4 — Payment-method mix (categorical: validated 4-slot palette, fixed method order)
  const mixTotal = mix.reduce((t, r) => t + r.amount, 0);
  const r4 = reportCard(ctx, {
    id: 'methods', n: '04', title: 'Payment-method mix',
    def: `Share of verified payments to date by method (${formatPHP(mixTotal)} across ${mix.reduce((t, r) => t + r.count, 0)} payments). Methods come from the Policies list.`,
    chart: segmentedBar(ctx.kit, mix.map((r, i) => ({ name: r.method, value: r.amount, pct: r.pct, cls: `viz-fill-${(i % 4) + 1}`, tipValue: formatPHP(r.amount), count: r.count })), { testid: 'chart-methods', title: 'Payment-method mix', legendCols: [{ label: 'Method' }, { label: 'Payments', value: (p) => p.count.toLocaleString('en-US') }, { label: 'Amount', value: (p) => formatPHP(p.value) }] }),
    columns: [
      { key: 'method', label: 'Method' },
      { key: 'count', label: 'Payments', align: 'right', render: (r) => numCell(r.count) },
      { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
      { key: 'pct', label: 'Share', align: 'right', render: (r) => `${r.pct}%` },
    ],
    rows: mix,
    csvRows: mix.map((r) => ({ ...r, amount: pesos(r.amount) })),
    csvCols: [{ key: 'method', label: 'Method' }, { key: 'count', label: 'Payments' }, { key: 'amount', label: 'Amount (PHP)' }, { key: 'pct', label: 'Share %' }],
  });

  // 5 — Reconciliation status (status colours, always with a text label)
  const recRows = [
    { key: 'reconciled', name: 'Reconciled', ...rec.payments.reconciled, cls: 'viz-tone-ok' },
    { key: 'awaiting', name: 'Awaiting match', ...rec.payments.awaiting, cls: 'viz-tone-neutral' },
    { key: 'flagged', name: 'Held by an exception', ...rec.payments.flagged, cls: 'viz-tone-danger' },
  ];
  const excRows = ['open', 'in_review', 'resolved'].map((st) => ({ key: st, name: `Exceptions ${humanize(st).toLowerCase()}`, count: rec.exceptions[st] || 0 }));
  const r5 = reportCard(ctx, {
    id: 'recon', n: '05', title: 'Reconciliation status', wide: true,
    def: `Every verified payment is in exactly one state. ${unresolved} exceptions are unresolved; payments they reference stay out of the match until Finance resolves them.`,
    chart: h('div', { class: 'report-recon' },
      hBars(ctx.kit, recRows.map((r) => ({ name: r.name, sub: formatPHP(r.amount), value: r.count, valueText: `${r.count.toLocaleString('en-US')} payments`, cls: r.cls, tip: { value: `${r.count} payments`, label: `${r.name} · ${formatPHP(r.amount)}` } })), { testid: 'chart-recon', title: 'Payments by reconciliation state', labelW: 190, valueW: 120 }),
      h('ul', { class: 'report-exc', testid: 'report-exc' }, excRows.map((r) => h('li', {},
        ctx.kit.chip(r.key), h('span', { class: 'report-exc-n num' }, String(r.count)))),
        h('li', { class: 'report-exc-link' }, ctx.kit.link('Open the exception queue', '#/m/reconciliation')))),
    columns: [
      { key: 'name', label: 'State' },
      { key: 'count', label: 'Count', align: 'right', render: (r) => numCell(r.count) },
      { key: 'amount', label: 'Amount', align: 'right', render: (r) => (r.amount === undefined ? '—' : money(r.amount)) },
    ],
    rows: [...recRows, ...excRows],
    csvRows: [...recRows.map((r) => ({ name: r.name, count: r.count, amount: pesos(r.amount) })), ...excRows.map((r) => ({ name: r.name, count: r.count, amount: '' }))],
    csvCols: [{ key: 'name', label: 'State' }, { key: 'count', label: 'Count' }, { key: 'amount', label: 'Amount (PHP)' }],
  });

  return h('div', { class: 'page page-reports' },
    pageHeader({
      eyebrow: 'Finance',
      title: 'Reports',
      subtitle: 'Collections, agent performance, aging, method mix and reconciliation status. Every figure is computed from the records, so it matches the dashboard and the tables.',
      meta: h('span', { class: 'muted' }, `As of ${fmtDateTime(ctx.clock.DEMO_NOW)} (demo clock)`),
    }),
    h('div', { class: 'stack' },
      h('div', { class: 'grid-4' },
        kpi({ label: 'Collected this month', value: formatPHP(k.collectedThisMonth), sub: `Last month ${formatPHP(k.collectedLastMonth)}`, tone: 'brand', testid: 'rep-kpi-month' }),
        kpi({ label: 'Recovered to date', value: `${recoveryPct}%`, sub: `${formatPHP(collected)} of ${formatPHP(placed)} placed`, tone: 'ok', testid: 'rep-kpi-recovery' }),
        kpi({ label: 'Overdue installments', value: String(k.overdue.count), sub: `${formatPHP(k.overdue.amount)} at risk (active plans)`, tone: 'warn', testid: 'rep-kpi-overdue' }),
        kpi({ label: 'Unresolved exceptions', value: String(unresolved), sub: `${rec.payments.reconciled.count} of ${rec.totalPayments} payments reconciled`, tone: 'danger', testid: 'rep-kpi-exc' })),
      h('div', { class: 'report-grid' }, r1, r2, r3, r4, r5)));
}
