// Reconciliation (MBA view, plan Task 9, D§7.8, V3 §13).
// Summary (matched + exceptions by the 8 V3 types) → exception queue → detail → Resolve (Finance,
// note required). "Run daily reconciliation" matches verified payments. Payouts tab: PayMongo
// payout vs bank deposit, net of fees and refunds. All figures come from core/reports.js.
// Midnight look (2026-11-26): count-up KPI figures and method marks in the payout breakdown are
// drawn only when isMidnight(); the rest is CSS (midnight-mba-ops.css). Classic is unchanged.
import { renderMbaLayout } from './layout.js';
import { EXCEPTION_TYPES, exceptionLabel, reconOverview, payoutRows } from '../core/reports.js';
import { auditTitle } from '../core/selectors.js';
import { isMidnight } from '../ui/look.js';
import { countKpis, methodPlate } from './transactions.js';

export function register(router, ctx) {
  router.on('/m/reconciliation', (params, query) => renderMbaLayout(ctx, renderList(ctx, query), 'reconciliation'));
  router.on('/m/reconciliation/:id', (params) => renderMbaLayout(ctx, renderDetail(ctx, params.id), 'reconciliation'));
}

const STATUS_OPTIONS = [
  { value: 'unresolved', label: 'Open + in review' },
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'all', label: 'All statuses' },
];

/** '−₱150.00' / '+₱5.00' / '₱0.00' (true minus sign). */
const signed = (c, fmt) => (c === 0 ? fmt(0) : `${c < 0 ? '−' : '+'}${fmt(Math.abs(c))}`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** '2026-11-09'..'2026-11-15' → 'Nov 9 – 15, 2026'; across months 'Oct 26 – Nov 1, 2026'. */
function weekLabel(po) {
  const [y1, m1, d1] = po.periodStart.split('-').map(Number);
  const [y2, m2, d2] = po.periodEnd.split('-').map(Number);
  return m1 === m2 ? `${MON[m1 - 1]} ${d1} – ${d2}, ${y2}` : `${MON[m1 - 1]} ${d1} – ${MON[m2 - 1]} ${d2}, ${y2}`;
}

function uiState(ctx) {
  return ctx.kit.memo('recon.ui', () => ({ tab: 'queue', status: 'unresolved', type: '' }));
}

/** The record an exception points at, as a node (link where one exists). */
function linkedRecord(ctx, e) {
  const { h, link } = ctx.kit;
  const r = e.refs || {};
  if (r.attemptId) return link(r.attemptId, `#/m/transactions/${r.attemptId}`, { cls: 'num' });
  if (r.payoutId) return h('span', { class: 'num' }, `Payout ${r.payoutId}`);
  if (r.providerPaymentId) return h('span', { class: 'num' }, r.providerPaymentId);
  return '—';
}

function amountOf(state, e) {
  const r = e.refs || {};
  if (r.paymentId && state.payments[r.paymentId]) return state.payments[r.paymentId].gross;
  if (r.attemptId && state.attempts[r.attemptId]) return state.attempts[r.attemptId].amount;
  if (r.payoutId && state.payouts?.[r.payoutId]) return state.payouts[r.payoutId].net;
  return null;
}

function runButton(ctx) {
  const { btn, toast } = ctx.kit;
  return btn('Run daily reconciliation', {
    variant: 'primary', icon: 'refresh', testid: 'run-recon',
    onClick: () => {
      const res = ctx.actions.runReconciliation(ctx.store);
      if (!res.ok) { toast(res.message || 'Reconciliation could not run.', { kind: 'danger' }); return; }
      toast(`${res.matched} ${res.matched === 1 ? 'payment' : 'payments'} matched · ${res.exceptions} exceptions still open`, { kind: 'ok', title: 'Daily reconciliation complete (demo)', testid: 'recon-toast' });
      ctx.rerender();
    },
  });
}

// ------------------------------------------------------------------------------------------ list

function renderList(ctx, query = {}) {
  const { h, pageHeader, card, kpi, tabs, chip, table, filterBar, formatPHP, fmtDateTime, fmtDate, qtag, notice } = ctx.kit;
  const state = ctx.store.get();
  const ui = uiState(ctx);
  if (query.tab === 'payouts' || query.tab === 'queue') ui.tab = query.tab;
  const ov = reconOverview(state);
  const unresolved = ov.exceptions.open + ov.exceptions.in_review;
  const payouts = payoutRows(state);

  const summary = h('div', { class: 'grid-4 recon-kpis' },
    kpi({ label: 'Matched payments', value: ov.payments.reconciled.count.toLocaleString('en-US'), sub: `${formatPHP(ov.payments.reconciled.amount)} reconciled`, tone: 'ok', icon: 'check', testid: 'recon-matched' }),
    kpi({ label: 'Awaiting match', value: ov.payments.awaiting.count.toLocaleString('en-US'), sub: ov.payments.awaiting.count ? `${formatPHP(ov.payments.awaiting.amount)} — run today's match` : 'Nothing waiting', tone: 'neutral', icon: 'clock', testid: 'recon-awaiting' }),
    kpi({ label: 'Held by an exception', value: ov.payments.flagged.count.toLocaleString('en-US'), sub: `${formatPHP(ov.payments.flagged.amount)} not matched until resolved`, tone: 'warn', icon: 'alert', testid: 'recon-flagged' }),
    kpi({ label: 'Open exceptions', value: String(unresolved), sub: `${ov.exceptions.open} open · ${ov.exceptions.in_review} in review · ${ov.exceptions.resolved} resolved`, tone: 'danger', icon: 'reconciliation', testid: 'recon-open' }));

  const typeGrid = h('div', { class: 'recon-types', testid: 'exception-summary' }, EXCEPTION_TYPES.map((t, i) => {
    const c = ov.byType[t.type];
    const n = c.open + c.in_review;
    const on = ui.type === t.type;
    return h('button', {
      type: 'button',
      class: ['recon-type', { 'is-on': on, 'is-zero': n === 0 }],
      testid: `exc-type-${t.type}`,
      attrs: { 'aria-pressed': on ? 'true' : 'false' },
      on: { click: () => { ui.type = on ? '' : t.type; ui.tab = 'queue'; if (!on && ui.status === 'resolved') ui.status = 'unresolved'; ctx.rerender(); } },
    },
    h('span', { class: 'recon-type-n num' }, String(i + 1).padStart(2, '0')),
    h('span', { class: 'recon-type-label' }, t.label),
    h('span', { class: 'recon-type-count num' }, String(n)),
    h('span', { class: 'recon-type-sub' }, n === 1 ? 'needs attention' : n ? 'need attention' : 'all clear', c.resolved ? ` · ${c.resolved} resolved` : ''));
  }));

  // ---- queue
  const statusOk = (e) => ui.status === 'all' || (ui.status === 'unresolved' ? e.status !== 'resolved' : e.status === ui.status);
  const rows = Object.values(state.exceptions).filter((e) => statusOk(e) && (!ui.type || e.type === ui.type))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const queue = h('div', { class: 'stack recon-queue' },
    filterBar({
      testid: 'recon-filter',
      values: { status: ui.status, type: ui.type },
      fields: [
        { type: 'select', name: 'status', label: 'Status', options: STATUS_OPTIONS, noAll: true },
        { type: 'select', name: 'type', label: 'Exception type', options: EXCEPTION_TYPES.map((t) => ({ value: t.type, label: t.label })), allLabel: 'All 8 types' },
      ],
      onApply: (v) => { ui.status = v.status || 'unresolved'; ui.type = v.type || ''; ctx.rerender(); },
      onReset: () => { ui.status = 'unresolved'; ui.type = ''; ctx.rerender(); },
    }),
    card({
      flush: true,
      body: table({
        testid: 'exception-table', stateKey: 'recon.queue', pageSize: 10, rows,
        empty: ui.status === 'unresolved' ? 'No open exceptions of this type. Everything is matched.' : 'No exceptions match these filters.',
        rowTestid: (r) => `exc-row-${r.id}`,
        onRowClick: (r) => ctx.router.go(`#/m/reconciliation/${r.id}`),
        columns: [
          { key: 'id', label: 'Exception', render: (r) => h('strong', { class: 'num' }, r.id) },
          { key: 'type', label: 'Type', sortValue: (r) => exceptionLabel(r.type), render: (r) => exceptionLabel(r.type) },
          { key: 'detail', label: 'What was found', sortable: false, cls: 'recon-detail-cell', render: (r) => h('span', { class: 'recon-detail', attrs: { title: r.detail } }, r.detail) },
          { key: 'ref', label: 'Linked record', sortable: false, render: (r) => linkedRecord(ctx, r) },
          { key: 'amount', label: 'Amount', align: 'right', sortValue: (r) => amountOf(state, r) ?? -1, render: (r) => { const a = amountOf(state, r); return a === null ? '—' : h('span', { class: 'num recon-nw' }, formatPHP(a)); } },
          { key: 'at', label: 'Raised', render: (r) => h('span', { class: 'recon-nw' }, fmtDateTime(r.at)) },
          { key: 'status', label: 'Status', render: (r) => chip(r.status) },
        ],
      }),
    }));

  // ---- payouts
  const payoutView = h('div', { class: 'stack recon-payouts' },
    notice(h('span', {}, 'PayMongo pays out net of fees and refunds. Each payout should equal its payments less fees and refunds, and the bank deposit should equal the payout. Weekly schedule assumed ', qtag('Q-19'), '.'), { tone: 'info', title: 'Payout vs bank deposit' }),
    card({
      flush: true,
      body: table({
        testid: 'payout-table', stateKey: 'recon.payouts', pageSize: 10, rows: payouts,
        rowTestid: (r) => `payout-row-${r.id}`,
        onRowClick: (r) => openPayout(ctx, r),
        columns: [
          { key: 'periodStart', label: 'Payments week', render: (r) => h('div', {}, h('div', { class: 'recon-nw' }, weekLabel(r)), h('div', { class: 'recon-sub' }, r.bankDeposit === null ? `Payout due ${fmtDate(r.payoutDate)}` : `Paid out ${fmtDate(r.payoutDate)} · ${r.count} payments`)) },
          { key: 'gross', label: 'Gross', align: 'right', render: (r) => h('span', { class: 'num recon-nw' }, formatPHP(r.gross)) },
          { key: 'fees', label: 'Fees', align: 'right', render: (r) => h('span', { class: 'num recon-nw' }, signed(-r.fees, formatPHP)) },
          { key: 'refunds', label: 'Refunds', align: 'right', render: (r) => h('span', { class: 'num recon-nw' }, signed(-r.refunds, formatPHP)) },
          { key: 'net', label: 'Payout', align: 'right', render: (r) => h('strong', { class: 'num recon-nw' }, formatPHP(r.net)) },
          { key: 'bankDeposit', label: 'Bank deposit', align: 'right', render: (r) => (r.bankDeposit === null ? h('span', { class: 'muted' }, 'Not yet') : h('span', { class: 'num recon-nw' }, formatPHP(r.bankDeposit))) },
          { key: 'difference', label: 'Difference', align: 'right', render: (r) => (r.difference === null ? '—' : h('span', { class: ['num', 'recon-nw', { 'recon-diff-bad': r.difference !== 0 }] }, signed(r.difference, formatPHP))) },
          { key: 'status', label: 'Status', render: (r) => chip(r.status) },
        ],
      }),
    }));

  const lastRun = [...(state.audit || [])].reverse().find((a) => a.action === 'recon.run');
  return countKpis(ctx, h('div', { class: 'page page-reconciliation' },
    pageHeader({
      eyebrow: 'Finance',
      title: 'Reconciliation',
      subtitle: 'Three-way match: platform ledger, PayMongo payments and the bank deposit. Finance resolves every exception with a written reason.',
      meta: h('span', { class: 'muted', testid: 'recon-last-run' }, lastRun ? `Last run ${fmtDateTime(lastRun.at)} (demo)` : 'Daily match runs at 06:00 · run it now for today’s payments'),
      actions: runButton(ctx),
    }),
    h('div', { class: 'stack' },
      summary,
      card({ eyebrow: 'V3 §13', title: 'Exceptions by type', actions: ui.type ? ctx.kit.btn('Show all types', { variant: 'ghost', size: 'sm', icon: 'x', testid: 'exc-type-clear', onClick: () => { ui.type = ''; ctx.rerender(); } }) : null, body: typeGrid }),
      h('div', {},
        tabs({
          testid: 'recon-tabs', label: 'Reconciliation views', active: ui.tab,
          items: [{ id: 'queue', label: 'Exception queue', count: unresolved }, { id: 'payouts', label: 'Payouts', count: payouts.length }],
          onChange: (id) => { ui.tab = id; ctx.rerender(); },
        }),
        h('div', { class: 'recon-tabpanel', attrs: { role: 'tabpanel' } }, ui.tab === 'payouts' ? payoutView : queue)))));
}

function openPayout(ctx, po) {
  const { h, modal, dl, chip, table, formatPHP, fmtDate, btn, link, borrowerName } = ctx.kit;
  const state = ctx.store.get();
  const pays = (po.paymentIds || []).map((id) => state.payments[id]).filter(Boolean);
  // Any navigation (link inside, Back button, hero shortcut) closes the dialog.
  const onHash = () => m.close();
  const m = modal({
    title: `Payout ${fmtDate(po.payoutDate)}`,
    eyebrow: `Payments ${weekLabel(po)}`,
    size: 'lg', testid: 'payout-modal',
    onClose: () => window.removeEventListener('hashchange', onHash),
    body: () => [
      h('div', { class: 'row' }, chip(po.status, { size: 'lg' })),
      dl([
        ['Gross collected', h('span', { class: 'num' }, formatPHP(po.gross))],
        ['PayMongo fees', h('span', { class: 'num' }, signed(-po.fees, formatPHP))],
        ['Refunds', h('span', { class: 'num' }, signed(-po.refunds, formatPHP))],
        ['PayMongo payout (net)', h('strong', { class: 'num' }, formatPHP(po.net))],
        ['Bank deposit', po.bankDeposit === null ? 'Expected — not received yet' : h('span', { class: 'num' }, formatPHP(po.bankDeposit))],
        ['Difference', po.difference === null ? '—' : h('span', { class: ['num', { 'recon-diff-bad': po.difference !== 0 }] }, signed(po.difference, formatPHP))],
      ], { cols: 3 }),
      table({
        testid: 'payout-payments', pageSize: 8, dense: true,
        columns: [
          { key: 'attemptId', label: 'Transaction', render: (p) => link(p.attemptId, `#/m/transactions/${p.attemptId}`, { cls: 'num recon-nw' }) },
          { key: 'borrower', label: 'Borrower', sortValue: (p) => borrowerName(state.accounts[p.accountId]), render: (p) => borrowerName(state.accounts[p.accountId]) },
          isMidnight() ? { key: 'method', label: 'Method', render: (p) => methodPlate(ctx, p.method, { size: 'sm' }) } : { key: 'method', label: 'Method' },
          { key: 'paidAt', label: 'Verified', render: (p) => h('span', { class: 'recon-nw' }, fmtDate(p.paidAt)) },
          { key: 'gross', label: 'Gross', align: 'right', render: (p) => h('span', { class: 'num recon-nw' }, formatPHP(p.gross)) },
          { key: 'net', label: 'Net', align: 'right', render: (p) => h('span', { class: 'num recon-nw' }, formatPHP(p.net)) },
        ],
        rows: pays,
      }),
    ],
    actions: (api) => [btn('Close', { variant: 'secondary', onClick: () => api.close() })],
  });
  window.addEventListener('hashchange', onHash);
  m.open();
}

// ---------------------------------------------------------------------------------------- detail

function renderDetail(ctx, id) {
  const { h, pageHeader, card, chip, dl, formatPHP, fmtDateTime, fmtDate, link, notice, emptyState, btn, permBtn, field, textarea, timeline, borrowerName, humanize, memo, toast } = ctx.kit;
  const state = ctx.store.get();
  const e = state.exceptions[id];
  const crumbs = [{ label: 'Reconciliation', href: '#/m/reconciliation' }, { label: id }];
  if (!e) {
    return h('div', { class: 'page page-reconciliation' },
      pageHeader({ eyebrow: 'Finance', title: 'Exception not found', crumbs }),
      card({ body: emptyState(`There is no exception ${id}.`, { action: btn('Back to the queue', { variant: 'secondary', icon: 'arrowLeft', onClick: () => ctx.router.go('#/m/reconciliation') }) }) }));
  }
  const meta = EXCEPTION_TYPES.find((t) => t.type === e.type);
  const r = e.refs || {};
  const pay = r.paymentId ? state.payments[r.paymentId] : null;
  const att = r.attemptId ? state.attempts[r.attemptId] : null;
  const accId = pay?.accountId || att?.accountId || null;
  const acc = accId ? state.accounts[accId] : null;
  const po = r.payoutId ? state.payouts?.[r.payoutId] : null;
  const draft = memo(`recon.note.${id}`, () => ({ note: '', error: null }));
  const allowed = ctx.can('recon.resolve');

  const what = card({
    eyebrow: 'What was found', title: meta?.label || humanize(e.type), testid: 'exc-what',
    body: [
      h('p', { class: 'recon-finding' }, e.detail || '—'),
      dl([
        ['Exception', h('span', { class: 'num' }, e.id)],
        ['Raised', fmtDateTime(e.at)],
        ['Transaction', r.attemptId ? link(r.attemptId, `#/m/transactions/${r.attemptId}`, { cls: 'num' }) : null],
        ['Platform payment', r.paymentId ? h('span', { class: 'num' }, r.paymentId) : null],
        ['Provider payment', r.providerPaymentId || pay && state.attempts[pay.attemptId]?.provider?.paymentId || null],
        ['Payout', r.payoutId ? h('span', { class: 'num' }, r.payoutId) : null],
        ['Account', acc ? link(`${borrowerName(acc)} · ${acc.ref}`, `#/m/accounts/${acc.id}`) : null],
        ['Creditor', acc ? state.creditors[acc.creditorId]?.name : null],
      ].filter((row) => row[1] !== null && row[1] !== undefined), { cols: 2 }),
    ],
  });

  const money = pay ? card({
    eyebrow: 'Linked payment', title: 'Platform record',
    body: dl([
      ['Gross', h('span', { class: 'num' }, formatPHP(pay.gross))],
      ['Fee', h('span', { class: 'num' }, formatPHP(pay.fee))],
      ['Net', h('span', { class: 'num' }, formatPHP(pay.net))],
      ['Method', pay.method],
      ['Verified', fmtDateTime(pay.paidAt)],
      ['Ledger', pay.refunded ? chip('refunded') : pay.reconciled ? chip('reconciled') : chip('pending', { label: 'Awaiting match' })],
    ], { cols: 3 }),
  }) : po ? card({
    eyebrow: 'Linked payout', title: `Payout ${fmtDate(po.payoutDate)}`,
    body: dl([
      ['Gross', h('span', { class: 'num' }, formatPHP(po.gross))],
      ['Fees', h('span', { class: 'num' }, signed(-po.fees, formatPHP))],
      ['Refunds', h('span', { class: 'num' }, signed(-po.refunds, formatPHP))],
      ['PayMongo payout', h('strong', { class: 'num' }, formatPHP(po.net))],
      ['Bank deposit', po.bankDeposit === null ? 'Not yet' : h('span', { class: 'num' }, formatPHP(po.bankDeposit))],
      ['Status', chip(po.status)],
    ], { cols: 3 }),
  }) : att ? card({
    eyebrow: 'Linked attempt', title: 'Checkout attempt',
    body: dl([
      ['Amount', h('span', { class: 'num' }, formatPHP(att.amount))],
      ['Method', att.method || '—'],
      ['Status', chip(att.status)],
      ['Started', fmtDateTime(att.createdAt)],
    ], { cols: 2 }),
  }) : null;

  let resolution;
  if (e.status === 'resolved') {
    resolution = card({
      eyebrow: 'Resolution', title: 'Resolved', testid: 'exc-resolution',
      body: [
        notice(e.note || '—', { tone: 'ok', title: 'Resolution note' }),
        dl([['Resolved by', humanize(e.resolvedBy || '—')], ['Resolved', e.resolvedAt ? fmtDateTime(e.resolvedAt) : '—']], { cols: 2 }),
      ],
    });
  } else {
    const ta = textarea({
      name: 'note', rows: 4, value: draft.note, testid: 'resolve-note', disabled: !allowed,
      placeholder: allowed ? 'What did you check, and what was done? (e.g. "Provider corrected the settlement report; amounts match.")' : 'Only Finance can record a resolution.',
      on: { input: (ev) => { draft.note = ev.target.value; } },
    });
    const doResolve = () => {
      const res = ctx.actions.resolveException(ctx.store, id, draft.note);
      if (!res.ok) {
        draft.error = res.error === 'note_required' ? 'A resolution note is required.' : (res.message || 'Could not resolve.');
        if (res.error !== 'note_required') toast(draft.error, { kind: 'danger' });
        ctx.rerender();
        requestAnimationFrame(() => document.querySelector('[data-testid="resolve-note"]')?.focus());
        return;
      }
      draft.note = '';
      draft.error = null;
      toast(`${id} resolved and written to the audit log.`, { kind: 'ok', title: 'Exception resolved', testid: 'resolve-toast' });
      ctx.rerender();
    };
    resolution = card({
      eyebrow: 'Resolution', title: 'Resolve this exception', testid: 'exc-resolution',
      body: [
        notice(meta?.check || 'Investigate and record what was done.', { tone: 'info', title: 'What to check' }),
        allowed ? null : notice('Finance resolves reconciliation exceptions. Switch “Viewing as” to Finance to continue.', { tone: 'warn', title: 'Requires Finance', testid: 'resolve-locked' }),
        field({ label: 'Resolution note', control: ta, required: true, error: draft.error, hint: 'Required. Saved with your role and the time in the audit log.' }),
        h('div', { class: 'row recon-resolve-actions' },
          e.status === 'open' ? permBtn(ctx, 'recon.resolve', 'Mark in review', {
            variant: 'secondary', testid: 'review-exception',
            onClick: () => {
              const res = ctx.actions.reviewException(ctx.store, id);
              if (!res.ok) { toast(res.message || 'Could not update.', { kind: 'danger' }); return; }
              toast(`${id} is now in review.`, { kind: 'info' });
              ctx.rerender();
            },
          }) : null,
          permBtn(ctx, 'recon.resolve', 'Resolve', { variant: 'primary', icon: 'check', testid: 'resolve-exception', onClick: doResolve })),
      ],
    });
  }

  const trail = (state.audit || []).filter((a) => a.target === id).map((a) => ({
    at: a.at, kind: 'audit', title: auditTitle(a.action), tone: a.action === 'recon.resolve' ? 'ok' : 'neutral',
    detail: [a.detail, a.before && a.after ? `${humanize(a.before)} → ${humanize(a.after)}` : null, `by ${humanize(a.role)}`].filter(Boolean).join(' · '),
  })).reverse();
  trail.push({ at: e.at, kind: 'raised', title: `Raised by reconciliation — ${meta?.label || e.type}`, detail: 'Automatic check', tone: 'danger' });
  if (e.status === 'resolved' && !trail.some((t) => t.title === auditTitle('recon.resolve'))) {
    trail.unshift({ at: e.resolvedAt, kind: 'audit', title: 'Resolved', detail: `${e.note || ''} · by ${humanize(e.resolvedBy || '')}`, tone: 'ok' });
  }

  return h('div', { class: 'page page-reconciliation page-recon-detail' },
    pageHeader({
      eyebrow: `Exception ${e.id}`,
      title: meta?.label || humanize(e.type),
      crumbs,
      meta: [chip(e.status, { size: 'lg', testid: 'exc-status' }), h('span', { class: 'muted' }, `Raised ${fmtDateTime(e.at)}`)],
      actions: btn('Back to the queue', { variant: 'ghost', icon: 'arrowLeft', testid: 'exc-back', onClick: () => ctx.router.go('#/m/reconciliation') }),
    }),
    h('div', { class: 'recon-detail-grid' },
      h('div', { class: 'stack' }, what, money),
      h('div', { class: 'stack' }, resolution, card({ eyebrow: 'Audit', title: 'History', body: timeline(trail, { testid: 'exc-trail' }) }))));
}
