// Remittances (MBA view, plan Task 9, D§7.10, C8): a decision screen for V3 Q-01, not a workflow.
// Two side-by-side money-flow models (inline SVG), what each screen would contain and the
// trade-offs, then — under model (a) only — a sample remittance statement computed from the seed.
// Model letters follow the design doc D§7.10: (a) MBA collects then remits; (b) per-creditor accounts.
import { renderMbaLayout } from './layout.js';
import { remittanceStatement } from '../core/reports.js';

export function register(router, ctx) {
  router.on('/m/remittances', () => renderMbaLayout(ctx, renderRemittances(ctx), 'remittances'));
}

// ------------------------------------------------------------------------------- flow diagram
const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

/**
 * Vertical money-flow diagram. nodes: [{id, title, sub, kind:'mba'|'creditor'|'borrower', col:0|1, row}]
 * edges: [{from, to, label, dashed}]. Column 0 is the money path; column 1 holds a side party.
 */
function flowDiagram(kit, { id, title, nodes, edges }) {
  const W = 480;
  const BOX_W = [224, 160];
  const BOX_H = 54;
  const GAP = 50;
  const X = [2, 318];
  const rows = Math.max(...nodes.map((n) => n.row)) + 1;
  const H = rows * BOX_H + (rows - 1) * GAP + 8;
  const pos = Object.fromEntries(nodes.map((n) => [n.id, { x: X[n.col], y: 4 + n.row * (BOX_H + GAP), w: BOX_W[n.col], h: BOX_H }]));
  const arrowId = `rm-arrow-${id}`;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rm-flow', role: 'img', 'aria-label': title, 'data-testid': `flow-${id}` },
    s('defs', {}, s('marker', { id: arrowId, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' },
      s('path', { d: 'M0 0L10 5L0 10z', class: 'rm-arrowhead' }))));
  for (const e of edges) {
    const a = pos[e.from];
    const b = pos[e.to];
    let line;
    let label;
    if (a.x === b.x) { // vertical, down the money path
      const x = a.x + a.w / 2;
      line = s('line', { x1: x, y1: a.y + a.h, x2: x, y2: b.y - 2, class: ['rm-edge', e.dashed ? 'is-dashed' : ''].join(' '), 'marker-end': `url(#${arrowId})` });
      label = s('text', { x: x + 12, y: (a.y + a.h + b.y) / 2 + 4, class: 'rm-edge-label' }, e.label);
    } else { // horizontal, to/from the side party
      const y = Math.max(a.y, b.y) + BOX_H / 2;
      const leftToRight = a.x < b.x;
      const x1 = leftToRight ? a.x + a.w : a.x;
      const x2 = leftToRight ? b.x - 2 : b.x + b.w + 2;
      line = s('line', { x1, y1: y, x2, y2: y, class: ['rm-edge', e.dashed ? 'is-dashed' : ''].join(' '), 'marker-end': `url(#${arrowId})` });
      label = s('text', { x: (x1 + x2) / 2, y: y - 8, 'text-anchor': 'middle', class: 'rm-edge-label' }, e.label);
    }
    svg.append(line, label);
  }
  for (const n of nodes) {
    const p = pos[n.id];
    svg.append(
      s('rect', { x: p.x, y: p.y, width: p.w, height: p.h, class: `rm-node rm-node-${n.kind}` }),
      n.kind === 'mba' ? s('rect', { x: p.x, y: p.y, width: 4, height: p.h, class: 'rm-node-bar' }) : null,
      s('text', { x: p.x + 16, y: p.y + 23, class: 'rm-node-title' }, n.title),
      s('text', { x: p.x + 16, y: p.y + 41, class: 'rm-node-sub' }, n.sub));
  }
  return kit.h('figure', { class: 'rm-figure' }, svg);
}

function modelCard(ctx, m) {
  const { h, card, dl, tag, eyebrow } = ctx.kit;
  return card({
    eyebrow: m.eyebrow, title: m.title, testid: `model-${m.id}`, cls: 'rm-model',
    actions: m.flag ? tag(m.flag.text, { tone: m.flag.tone }) : null,
    body: [
      h('p', { class: 'rm-model-lead' }, m.lead),
      flowDiagram(ctx.kit, { id: m.id, title: m.title, nodes: m.nodes, edges: m.edges }),
      h('div', { class: 'rm-block' },
        eyebrow('This screen would contain'),
        h('ul', { class: 'rm-list' }, m.contains.map((t) => h('li', {}, t)))),
      h('div', { class: 'rm-block' },
        eyebrow('Trade-offs'),
        dl(m.tradeoffs.map(([k, v]) => [k, v]), { cols: 1 })),
    ],
  });
}

// ----------------------------------------------------------------------------------------- page

function renderRemittances(ctx) {
  const { h, pageHeader, card, notice, tag, qtag, btn, toast, formatPHP, fmtDate, downloadFile } = ctx.kit;
  const state = ctx.store.get();
  const st = remittanceStatement(state);
  const monthStart = `${st.month}-01`;
  const today = ctx.clock.DEMO_TODAY;

  const models = [
    {
      id: 'a', eyebrow: 'Model (a)', title: 'MBA collects, then remits',
      flag: { text: 'Assumed in V3', tone: 'brand' },
      lead: 'Borrowers pay into MBA’s PayMongo account. MBA reconciles, then sends each creditor its share less commission.',
      nodes: [
        { id: 'b', title: 'Borrower pays', sub: 'Through the secure link', kind: 'borrower', col: 0, row: 0 },
        { id: 'pm', title: 'MBA PayMongo account', sub: 'Merchant of record: MBA', kind: 'mba', col: 0, row: 1 },
        { id: 'bank', title: 'MBA bank account', sub: 'Holds creditors’ money', kind: 'mba', col: 0, row: 2 },
        { id: 'cr', title: 'Creditor bank account', sub: 'Receives net due', kind: 'creditor', col: 0, row: 3 },
        { id: 'fee', title: 'MBA commission', sub: 'Deducted first', kind: 'mba', col: 1, row: 2 },
      ],
      edges: [
        { from: 'b', to: 'pm', label: 'Payment' },
        { from: 'pm', to: 'bank', label: 'Payout, net of fees' },
        { from: 'bank', to: 'cr', label: 'Remittance, less commission' },
        { from: 'bank', to: 'fee', label: 'Keeps', dashed: true },
      ],
      contains: [
        'Remittance statements per creditor and period: gross, refunds, fees, commission, net due',
        'Finance prepares, Admin approves, then the bank transfer is recorded with its reference',
        'Refunds after a remittance are clawed back from the next one (Q-24)',
      ],
      tradeoffs: [
        ['Licensing / legal', 'MBA holds third-party funds. This may bring regulatory obligations (e.g. BSP rules on payment services) — unverified; confirm with counsel.'],
        ['Reconciliation', 'Three-way match (ledger, PayMongo, MBA bank), then a remittance per creditor. More Finance work; MBA sees every peso.'],
        ['Current practice', 'A change: MBA’s website tells debtors to pay the creditor’s bank directly today.'],
      ],
    },
    {
      id: 'b', eyebrow: 'Model (b)', title: 'Creditor collects directly',
      lead: 'Each creditor has its own PayMongo account. Money settles straight to the creditor; MBA invoices its commission.',
      nodes: [
        { id: 'b', title: 'Borrower pays', sub: 'Same link and checkout', kind: 'borrower', col: 0, row: 0 },
        { id: 'pm', title: 'Creditor’s PayMongo', sub: 'One account per creditor', kind: 'creditor', col: 0, row: 1 },
        { id: 'cr', title: 'Creditor bank account', sub: 'Receives the payout', kind: 'creditor', col: 0, row: 2 },
        { id: 'mba', title: 'MBA', sub: 'Sends an invoice', kind: 'mba', col: 1, row: 2 },
      ],
      edges: [
        { from: 'b', to: 'pm', label: 'Payment' },
        { from: 'pm', to: 'cr', label: 'Payout, net of fees' },
        { from: 'cr', to: 'mba', label: 'Pays', dashed: true },
      ],
      contains: [
        'Commission invoices per creditor: collected in the period, rate, invoice status',
        'Each creditor’s PayMongo account and payout status (read-only)',
        'No remittance transfers — money never passes through MBA',
      ],
      tradeoffs: [
        ['Licensing / legal', 'Money never sits with MBA, which may simplify the licensing position — confirm with counsel.'],
        ['Reconciliation', 'One PayMongo account per creditor to onboard and reconcile; MBA must chase commission invoices.'],
        ['Current practice', 'Closest to today: creditors are already paid directly.'],
      ],
    },
  ];

  const pct = (c) => `${c.commissionPct}%`;
  const cell = (c, cls = '') => h('td', { class: ['al-right', 'num', 'rm-nw', cls] }, c);
  const table = h('div', { class: 'tbl rm-statement', testid: 'remittance-statement' },
    h('div', { class: 'tbl-scroll' },
      h('table', {},
        h('caption', { class: 'sr-only' }, 'Sample remittance statement, model (a)'),
        h('thead', {}, h('tr', {},
          h('th', { attrs: { scope: 'col' } }, 'Creditor'),
          h('th', { class: 'al-right', attrs: { scope: 'col' } }, 'Gross collected'),
          h('th', { class: 'al-right', attrs: { scope: 'col' } }, 'Refunds'),
          h('th', { class: 'al-right', attrs: { scope: 'col' } }, h('span', { class: 'rm-th-q' }, 'PayMongo fees', qtag('Q-17'))),
          h('th', { class: 'al-right', attrs: { scope: 'col' } }, h('span', { class: 'rm-th-q' }, 'Commission', qtag('Q-24'))),
          h('th', { class: 'al-right', attrs: { scope: 'col' } }, 'Net due'))),
        h('tbody', {}, st.rows.map((r) => h('tr', { testid: `statement-${r.creditorId}` },
          h('th', { attrs: { scope: 'row' }, class: 'rm-creditor' }, r.name, h('span', { class: 'rm-cell-note' }, `${r.payments} payments`)),
          cell(formatPHP(r.gross)),
          cell(r.refunds ? `−${formatPHP(r.refunds)}` : formatPHP(0)),
          cell(h('span', {}, formatPHP(r.fees), h('span', { class: 'rm-cell-note' }, 'borne by MBA')), 'rm-muted'),
          cell(h('span', {}, `−${formatPHP(r.commission)}`, h('span', { class: 'rm-cell-note' }, `${pct(r)} of gross less refunds`))),
          cell(h('strong', {}, formatPHP(r.netDue)))))),
        h('tfoot', {}, h('tr', { testid: 'statement-total' },
          h('th', { attrs: { scope: 'row' } }, 'Total', h('span', { class: 'rm-cell-note' }, `${st.total.payments} payments`)),
          cell(formatPHP(st.total.gross)),
          cell(st.total.refunds ? `−${formatPHP(st.total.refunds)}` : formatPHP(0)),
          cell(formatPHP(st.total.fees), 'rm-muted'),
          cell(`−${formatPHP(st.total.commission)}`),
          cell(h('strong', {}, formatPHP(st.total.netDue))))))));

  const exportCsv = () => {
    const P = (c) => (c / 100).toFixed(2);
    const rows = [...st.rows, { name: 'Total', ...st.total, commissionPct: '' }].map((r) => ({
      name: r.name, payments: r.payments, gross: P(r.gross), refunds: P(r.refunds), fees: P(r.fees), commissionPct: r.commissionPct, commission: P(r.commission), netDue: P(r.netDue),
    }));
    downloadFile(`sample-remittance-statement-${st.month}.csv`, 'text/csv', ctx.csv.toCSV(rows, [
      { key: 'name', label: 'Creditor' }, { key: 'payments', label: 'Payments' }, { key: 'gross', label: 'Gross collected (PHP)' },
      { key: 'refunds', label: 'Refunds (PHP)' }, { key: 'fees', label: 'PayMongo fees, borne by MBA (PHP)' }, { key: 'commissionPct', label: 'Commission %' },
      { key: 'commission', label: 'Commission (PHP)' }, { key: 'netDue', label: 'Net due (PHP)' },
    ]));
    toast('Sample statement downloaded as CSV.', { kind: 'ok', testid: 'csv-toast' });
  };

  const statement = card({
    eyebrow: 'Model (a) only',
    title: 'Sample remittance statement',
    testid: 'sample-statement',
    actions: btn('CSV', { variant: 'secondary', size: 'sm', icon: 'download', testid: 'csv-statement', title: 'Download the sample statement as CSV', onClick: exportCsv }),
    body: [
      h('div', { class: 'rm-statement-meta' },
        tag('Sample — if model (a) is chosen', { tone: 'warn', testid: 'sample-label' }),
        h('span', { class: 'muted' }, `Period ${fmtDate(monthStart)} – ${fmtDate(today)} (month to date) · demo data`)),
      table,
      h('ul', { class: 'rm-notes' },
        h('li', {}, 'Net due = gross collected − refunds − commission.'),
        h('li', {}, 'PayMongo fees are shown for information. Under the current assumption MBA bears them, so they do not reduce the creditor’s share ', qtag('Q-17'), '.'),
        h('li', {}, 'Commission = the creditor’s rate × (gross − refunds). The basis, remittance frequency and clawback of later refunds are open ', qtag('Q-24'), '.'),
        h('li', {}, `Only reconciled funds would be remitted (proposed). ${formatPHP(st.total.reconciled)} of this period’s ${formatPHP(st.total.gross)} is reconciled so far.`),
        h('li', {}, 'There is no approval or transfer step in this mockup — this page exists to support the Q-01 decision.')),
    ],
  });

  return h('div', { class: 'page page-remittances' },
    pageHeader({
      eyebrow: 'Finance',
      title: 'Remittances',
      subtitle: 'How collected money reaches creditors. This depends on a decision MBA has not made yet, so both options are shown.',
      meta: tag('Decision needed — Q-01', { tone: 'warn', testid: 'q01-tag' }),
    }),
    h('div', { class: 'stack' },
      notice(h('span', {}, 'Should borrowers’ payments land in MBA’s PayMongo account and be remitted to creditors (a), or settle in each creditor’s own account with MBA invoicing commission (b)? Holding and remitting third-party funds may carry regulatory obligations — confirm with counsel before choosing.'),
        { tone: 'warn', title: 'Decision needed — Q-01', testid: 'q01-notice' }),
      h('div', { class: 'grid-2 rm-models' }, models.map((m) => modelCard(ctx, m))),
      statement));
}
