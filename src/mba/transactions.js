// Transactions (MBA view, plan Task 7, D§7.7).
// List of checkout attempts and payments (MBA-TXN-…). Detail: status timeline, simulated PayMongo
// IDs (cs_test_… / pay_test_…), method, gross / fee / net ("Fee borne by MBA — Q-17") and the
// simulated webhook log with every step ticked.
// Actions: Simulate webhook paid / failed (pending attempts only), Replay webhook (idempotency:
// "Duplicate ignored — not re-posted"), Refund (payment.refund, Finance).
// Payment truth: this file never marks anything paid itself — it calls deliverWebhook().
// Attachments (2026-11-26, user request): each row shows the borrower's own contract and signed
// agreement (the arrangement's files, V3 §7); a chip opens the preview without opening the row.
// Midnight look (2026-11-26, the owner picked design option A): only when isMidnight(), the list
// adds status filter chips, method marks on white plates, count-up KPI figures and an eye button
// per row that opens a glass quick-view panel (a bottom sheet on phones); the detail page shows
// the method's mark. A row click still opens the detail page. Classic draws exactly as before.
// Styles: midnight-mba-ops.css.
import { renderMbaLayout } from './layout.js';
import { docChips, docList, openDocViewer } from './docViewer.js';
import { isMidnight } from '../ui/look.js';
import * as fx from '../ui/fx.js';
import { STATUS_TONE, fmtSize } from '../core/format.js';
import { METHOD_MARKS, METHOD_ICONS } from '../borrower/payLogos.js';

const STATUSES = ['initiated', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded'];
const STATUS_LABEL = { expired: 'Expired session' };
const STEP_LABEL = {
  received: 'Event received',
  signature_valid: 'Signature valid',
  not_duplicate: 'Not a duplicate (event ID is new)',
  verified_api: 'Verified via provider API',
  posted: 'Posted once to the ledger',
  failed_recorded: 'Failure recorded on the attempt',
  duplicate_ignored: 'Duplicate ignored — not re-posted',
};
const EVENT_KIND = { paid: 'payment.paid', failed: 'payment.failed' };

export function register(router, ctx) {
  router.on('/m/transactions', (params, query) => renderMbaLayout(ctx, renderList(ctx, query || {}), 'transactions'));
  router.on('/m/transactions/:id', (params) => renderMbaLayout(ctx, renderDetail(ctx, params.id), 'transactions'));
}

const vals = (m) => Object.values(m || {});
/** 'Fee borne by MBA — Q-17' (text) with the Q-id as a tag. */
const feeLabel = (kit) => kit.h('span', { class: 'qline tx-fee-label', testid: 'fee-label' }, 'Fee borne by MBA —', ' ', kit.qtag('Q-17'));
const statusLabel = (kit, s) => STATUS_LABEL[s] || kit.humanize(s);
/** '…T10:00:07+08:00' → '10:00:07' (demo clock, PHT) */
const fmtTime = (iso) => String(iso || '').slice(11, 19);
/** Date over time, both nowrap: 'Nov 26, 2026' / '9:41 AM'. */
const dateTimeCell = (kit, iso) => {
  const full = kit.fmtDateTime(iso);
  const cut = full.lastIndexOf(', ');
  return kit.h('div', { class: 'cell-2' }, kit.h('span', { class: 'cell-main num' }, full.slice(0, cut)), kit.h('span', { class: 'cell-sub num' }, full.slice(cut + 2)));
};
const byAt = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function paymentOf(state, attemptId) {
  return vals(state.payments).find((p) => p.attemptId === attemptId) || null;
}

function eventsOf(state, attemptId) {
  return vals(state.webhookEvents).filter((e) => e.attemptId === attemptId)
    .sort((a, b) => byAt(a.receivedAt, b.receivedAt) || byAt(a.id, b.id));
}

// --------------------------------------------------------------------------------------------
// Midnight helpers (drawn only when isMidnight(); other MBA ops screens import the first two)

/**
 * A payment method's mark on a small white plate (the marks are drawn for light backgrounds).
 * Same marks as the borrower's method tiles (class bmethod-logo); a method without a brand mark
 * (Online banking) gets a line icon and its name. The plate is named for assistive tech, or
 * hidden from it (decorative) when the method's name is already written beside it.
 */
export function methodPlate(ctx, method, { size = 'md', decorative = false } = {}) {
  if (!method) return null;
  const { h, icon } = ctx.kit;
  const marks = METHOD_MARKS[method] || [];
  const plate = h('span', {
    class: ['mn-plate', `is-${size}`, { 'has-name': !marks.length }],
    attrs: decorative ? { 'aria-hidden': 'true' } : { role: 'img', 'aria-label': method, title: method },
  });
  if (marks.length) {
    for (const m of marks) plate.appendChild(h('img', { class: 'bmethod-logo', src: m.src, alt: '', draggable: false, attrs: { 'data-mark': m.name } }));
  } else {
    plate.append(icon(METHOD_ICONS[method] || 'bank', { size: 15 }), h('span', { class: 'mn-plate-name' }, method));
  }
  return plate;
}

/** Plate + the method's name in words; a plate that already spells the name stands alone. */
function methodLine(ctx, method, { prefix = '' } = {}) {
  const { h } = ctx.kit;
  if (!(METHOD_MARKS[method] || []).length) return h('span', { class: 'mn-method' }, methodPlate(ctx, method));
  return h('span', { class: 'mn-method' }, methodPlate(ctx, method, { decorative: true }), h('span', {}, `${prefix}${method}`));
}

/**
 * KPI figures count up to their real value. The exact text stays in .kpi-value (what assistive
 * tech reads and the e2e checks compare); the count runs in an aria-hidden copy shown in its
 * place. Entering a screen counts from zero; a re-render of the same screen counts from the
 * figure shown before (so "Awaiting match 2 → 0" moves, and an unchanged figure stays still).
 */
export function countKpis(ctx, root) {
  if (!isMidnight()) return root;
  const seen = ctx.kit.memo('mn.kpi-count', () => ({ hash: null, vals: {} }));
  const hash = ctx.route?.hash ?? '';
  const fresh = seen.hash !== hash;
  seen.hash = hash;
  root.querySelectorAll('.kpi .kpi-value').forEach((v, i) => {
    const m = v.textContent.trim().match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/);
    if (!m) return;
    const [, pre, num, post] = m;
    const dec = (num.split('.')[1] || '').length;
    const to = Number(num.replace(/,/g, ''));
    const key = v.closest('.kpi')?.dataset.testid || String(i);
    const from = fresh ? 0 : (seen.vals[key] ?? to);
    seen.vals[key] = to;
    const fmt = (x) => `${pre}${x.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${post}`;
    const copy = ctx.kit.h('div', { class: 'mn-count num', attrs: { 'aria-hidden': 'true' } });
    v.classList.add('mn-counted');
    v.after(copy);
    if (from === to) copy.textContent = fmt(to);
    else fx.countUp(copy, to, { from, format: fmt, duration: 1100, delay: fresh ? 120 + i * 90 : 0 });
  });
  return root;
}

const STEP_SR = { done: 'done', current: 'current step', fail: 'stopped here', todo: 'not reached yet' };

/** The attempt's history, oldest first, as steps; an open attempt ends with the step it awaits. */
function quickSteps(ctx, a, pay) {
  const detail = statusDetail(ctx, a, pay);
  const hist = a.history || [];
  const end = { pending: 'current', initiated: 'current', failed: 'fail', expired: 'fail', cancelled: 'fail' };
  const steps = hist.map((x, i) => ({
    state: i < hist.length - 1 ? 'done' : (end[x.status] || 'done'),
    title: statusLabel(ctx.kit, x.status), detail: detail[x.status] || '', at: x.at,
  }));
  const last = hist.at(-1)?.status;
  if (last === 'pending' || last === 'initiated') steps.push({ state: 'todo', title: 'Paid', detail: 'Posts once the webhook is verified', at: null });
  return steps;
}

/** The eye button on a list row (Midnight): opens the quick view, never the row behind it. */
function quickBtn(ctx, id) {
  const { h, icon } = ctx.kit;
  return h('button', {
    type: 'button', class: 'mn-eye', testid: `tx-quick-${id}`,
    attrs: { 'aria-label': `Quick view of ${id}`, title: 'Quick view', 'aria-haspopup': 'dialog' },
    on: { click: (e) => { e.stopPropagation(); openQuickView(ctx, id); } },
  }, icon('eye', { size: 16 }));
}

/**
 * Midnight quick view: a glass side panel (a bottom sheet on phones) with the status timeline,
 * amount, method, borrower, request and the files. Escape, the close buttons and a click outside
 * close it and focus returns to the row's eye button; "Open transaction" goes to the detail page.
 * Built on the kit modal, so a route change closes it like every other dialog.
 */
function openQuickView(ctx, id) {
  const kit = ctx.kit;
  const { h, chip, link, btn, icon, dl, fmtDate, fmtDateTime, borrowerName } = kit;
  const { docKind, DOC_LABEL } = ctx.selectors;
  const s = ctx.store.get();
  const a = s.attempts[id];
  if (!a) return null;
  const acc = s.accounts[a.accountId] || null;
  const req = s.requests[a.requestId] || null;
  const inst = req ? s.installments[req.installmentId] : null;
  const arr = req ? s.arrangements[req.arrangementId] : null;
  const pay = paymentOf(s, a.id);
  const files = req ? ctx.selectors.attachmentsFor(s, req.arrangementId) : [];
  const steps = quickSteps(ctx, a, pay);
  const onLook = () => m.close(); // switching to Classic mid-view closes the panel
  const m = kit.modal({
    title: a.id,
    eyebrow: pay ? 'Payment · quick view' : 'Checkout attempt · quick view',
    testid: 'tx-quick-panel',
    size: 'quick',
    initialFocus: '[data-testid="tx-quick-panel-close"]',
    onClose: () => {
      window.removeEventListener('mba-look', onLook);
      const eye = document.querySelector(`[data-testid="tx-quick-${id}"]`);
      if (eye && document.activeElement !== eye) eye.focus({ preventScroll: true });
    },
    body: () => [
      h('section', { class: ['mn-qv-sum', `tone-${STATUS_TONE[a.status] || 'neutral'}`] },
        h('div', { class: 'mn-qv-sum-top' },
          chip(a.status, { label: statusLabel(kit, a.status), size: 'lg', testid: 'tx-quick-status' }),
          h('span', { class: 'num' }, `Started ${fmtDateTime(a.createdAt)}`)),
        fx.money(a.amount, { duration: 900, className: 'mn-qv-money' }),
        h('div', { class: 'mn-qv-method' }, a.method ? methodLine(ctx, a.method, { prefix: 'via ' }) : h('span', {}, 'No method chosen yet'))),
      dl([
        ['Borrower', acc ? link(borrowerName(acc), `#/m/accounts/${acc.id}`) : '—'],
        ['Account reference', acc ? h('span', { class: 'num' }, acc.ref) : '—'],
        ['Payment request', req ? link(req.id, `#/m/requests/${req.id}`, { cls: 'num' }) : '—'],
        ['Installment', inst ? `${inst.seq} of ${arr?.count ?? '—'} · due ${fmtDate(inst.dueDate)}` : '—'],
      ], { cols: 2, testid: 'tx-quick-meta' }),
      h('section', { class: 'mn-qv-sec' },
        h('h3', { class: 'mn-qv-h' }, 'Status timeline'),
        h('ol', { class: 'mn-qv-steps', testid: 'tx-quick-steps' }, steps.map((st, i) => h('li', { class: ['mn-qv-step', `is-${st.state}`], style: { '--i': i } },
          h('span', { class: 'mn-qv-dot', attrs: { 'aria-hidden': 'true' } }, { done: icon('check', { size: 13 }), fail: icon('x', { size: 13 }) }[st.state] || null),
          h('div', { class: 'mn-qv-step-text' },
            h('strong', {}, st.title, h('span', { class: 'sr-only' }, ` (${STEP_SR[st.state]})`)),
            st.detail ? h('span', {}, st.detail) : null,
            st.at ? h('time', { class: 'num', attrs: { datetime: st.at } }, fmtDateTime(st.at)) : null))))),
      h('section', { class: 'mn-qv-sec' },
        h('h3', { class: 'mn-qv-h' }, 'Attachments', h('span', { class: 'mn-qv-h-n' }, `${files.length} file${files.length === 1 ? '' : 's'}`)),
        files.length
          ? h('ul', { class: 'mn-qv-docs', testid: 'tx-quick-files' }, files.map((f) => {
            const kind = docKind(f);
            return h('li', { class: ['mn-qv-doc', `is-${kind}`] },
              h('span', { class: 'mn-qv-doc-ic', attrs: { 'aria-hidden': 'true' } }, icon('file', { size: 18 })),
              h('span', { class: 'mn-qv-doc-text' },
                h('strong', {}, DOC_LABEL[kind]),
                h('span', { class: 'mn-qv-doc-name' }, f.filename),
                h('span', { class: 'mn-qv-doc-meta num' }, `v${f.version} · ${fmtSize(f.size)} · ${fmtDate(f.at)}`)),
              btn('Preview', {
                variant: 'secondary', size: 'sm', icon: 'eye', testid: `tx-quick-preview-${f.id}`,
                attrs: { 'aria-label': `Preview the ${DOC_LABEL[kind].toLowerCase()}: ${f.filename}` },
                onClick: () => openDocViewer(ctx, f.id),
              }));
          }))
          : h('p', { class: 'mn-qv-none' }, 'No contract or agreement is on file for this arrangement.')),
    ],
    actions: (api) => [
      btn('Close', { variant: 'secondary', testid: 'tx-quick-close', onClick: () => api.close() }),
      btn('Open transaction', { variant: 'primary', iconRight: 'arrowRight', testid: 'tx-quick-open', onClick: () => { api.close(); ctx.router.go(`#/m/transactions/${id}`); } }),
    ],
  });
  window.addEventListener('mba-look', onLook);
  return m.open();
}

// --------------------------------------------------------------------------------------------
// List

function renderList(ctx, query) {
  const kit = ctx.kit;
  const { h, pageHeader, card, filterBar, table, chip, kpi, memo, link, formatPHP, fmtDateTime, borrowerName, tag, notice } = kit;
  const state = ctx.store.get();
  const f = memo('transactions.filters', () => ({ status: '', q: '', method: '', lastQuery: null }));
  const qKey = query.status ?? null;
  if (qKey !== f.lastQuery) {
    f.lastQuery = qKey;
    if (qKey && STATUSES.includes(qKey)) f.status = qKey;
  }
  const tableState = memo('table:transactions.list', () => ({ sortKey: null, dir: 'asc', page: 0 }));

  const all = vals(state.attempts);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let pendingAmount = 0;
  for (const a of all) {
    counts[a.status] = (counts[a.status] || 0) + 1;
    if (a.status === 'pending') pendingAmount += a.amount;
  }
  const pays = vals(state.payments);
  const posted = pays.filter((p) => !p.refunded);
  const gross = posted.reduce((s, p) => s + p.gross, 0);
  const fees = posted.reduce((s, p) => s + p.fee, 0);
  const evCount = vals(state.webhookEvents).length;
  const dupCount = vals(state.webhookEvents).filter((e) => e.duplicateOf).length;

  const q = f.q.trim().toLowerCase();
  const rows = all.filter((a) => {
    if (f.status && a.status !== f.status) return false;
    if (f.method && a.method !== f.method) return false;
    if (q) {
      const acc = state.accounts[a.accountId];
      const hay = `${a.id} ${a.requestId} ${acc?.ref || ''} ${borrowerName(acc)} ${a.provider?.checkoutSessionId || ''} ${a.provider?.paymentId || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => byAt(b.createdAt, a.createdAt) || byAt(b.id, a.id)).map((a) => {
    const acc = state.accounts[a.accountId];
    return { a, id: a.id, name: borrowerName(acc), accRef: acc?.ref || '', requestId: a.requestId, arrangementId: state.requests[a.requestId]?.arrangementId ?? null, method: a.method || '', amount: a.amount, createdAt: a.createdAt, status: a.status };
  });
  // Files per arrangement, looked up only for the rows a page actually draws.
  const filesCache = new Map();
  const filesOf = (arrId) => {
    if (!arrId) return [];
    if (!filesCache.has(arrId)) filesCache.set(arrId, ctx.selectors.attachmentsFor(state, arrId));
    return filesCache.get(arrId);
  };

  const applyFilters = (v) => {
    Object.assign(f, { status: v.status || '', q: v.q || '', method: v.method || '' });
    tableState.page = 0;
    ctx.rerender();
  };

  // Midnight: one-click status chips (the same filter as the Status field, kept in step with it).
  const mn = isMidnight();
  const chipBar = mn
    ? h('div', { class: 'mn-chipbar', testid: 'tx-status-chips', attrs: { role: 'group', 'aria-label': 'Filter by status' } },
      [['', 'All', all.length], ...STATUSES.map((st) => [st, statusLabel(kit, st), counts[st]])].map(([st, label, n]) => h('button', {
        type: 'button', class: ['mn-fchip', st ? `tone-${STATUS_TONE[st] || 'neutral'}` : 'is-all'], testid: `tx-status-chip-${st || 'all'}`,
        attrs: { 'aria-pressed': String(f.status === st) },
        on: { click: () => { if (f.status !== st) applyFilters({ ...f, status: st }); } },
      }, st ? h('span', { class: 'mn-fchip-dot', attrs: { 'aria-hidden': 'true' } }) : null, h('span', {}, label), h('span', { class: 'mn-fchip-n num' }, n.toLocaleString('en-US')))))
    : null;

  const pendingList = all.filter((a) => a.status === 'pending').sort((a, b) => byAt(b.createdAt, a.createdAt));
  const pendingNotice = pendingList.length
    ? notice(h('span', { class: 'tx-pending-line' },
      `${pendingList.length} ${pendingList.length === 1 ? 'payment is' : 'payments are'} waiting for PayMongo’s confirmation (${formatPHP(pendingAmount)}). Open one to simulate the webhook: `,
      pendingList.slice(0, 4).map((a, i) => [i ? ', ' : '', link(`${a.id} (${borrowerName(state.accounts[a.accountId])})`, `#/m/transactions/${a.id}`, { cls: 'mono', testid: `tx-pending-${a.id}` })])),
    { tone: 'warn', title: 'Pending confirmation', testid: 'tx-pending-notice', icon: 'clock' })
    : null;

  return countKpis(ctx, h('div', { class: 'page page-transactions', testid: 'transactions-page' },
    pageHeader({
      eyebrow: 'Collections',
      title: 'Transactions',
      subtitle: 'Every checkout attempt and verified payment (MBA-TXN), with simulated PayMongo references. A payment counts only after the webhook is verified and posted once.',
    }),
    h('div', { class: 'grid-4 tx-kpis' },
      kpi({ label: 'Verified payments', value: posted.length.toLocaleString('en-US'), sub: `${formatPHP(gross)} gross, net of refunds`, tone: 'ok', icon: 'check', testid: 'tx-kpi-paid' }),
      kpi({ label: 'Pending', value: counts.pending.toLocaleString('en-US'), sub: `${formatPHP(pendingAmount)} awaiting the webhook`, tone: 'warn', icon: 'clock', testid: 'tx-kpi-pending' }),
      kpi({ label: 'Failed attempts', value: counts.failed.toLocaleString('en-US'), sub: 'No money taken; kept in history', tone: 'danger', icon: 'alert', testid: 'tx-kpi-failed' }),
      kpi({ label: 'Webhook events', value: evCount.toLocaleString('en-US'), sub: `${dupCount} duplicate${dupCount === 1 ? '' : 's'} ignored · fees ${formatPHP(fees)} borne by MBA`, tone: 'brand', icon: 'shield', testid: 'tx-kpi-events' })),
    pendingNotice,
    filterBar({
      testid: 'tx-filter',
      values: f,
      fields: [
        { type: 'text', name: 'q', label: 'Search', placeholder: 'TXN, request, reference, name or cs_test_…', wide: true },
        { type: 'select', name: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: `${statusLabel(kit, s)} (${counts[s]})` })) },
        { type: 'select', name: 'method', label: 'Method', options: ctx.config.POLICIES.methods.map((m) => ({ value: m, label: m })) },
      ],
      onApply: applyFilters,
      onReset: () => applyFilters({}),
    }),
    chipBar,
    card({
      flush: true,
      title: f.status ? `${statusLabel(kit, f.status)} transactions` : 'All transactions',
      actions: tag(`${rows.length.toLocaleString('en-US')} shown`, { tone: 'neutral' }),
      body: table({
        testid: 'tx-table',
        stateKey: 'transactions.list',
        caption: 'Transactions',
        rows,
        rowTestid: (row) => `tx-row-${row.id}`,
        onRowClick: (row) => ctx.router.go(`#/m/transactions/${row.id}`),
        empty: 'No transactions match these filters.',
        columns: [
          {
            key: 'id', label: 'Transaction',
            // Midnight: the eye button, then the id over its request (the request column folds in here).
            render: (row) => (mn
              ? h('div', { class: 'mn-txid' }, quickBtn(ctx, row.id),
                h('div', { class: 'cell-2' },
                  link(row.id, `#/m/transactions/${row.id}`, { cls: 'mono', testid: `tx-link-${row.id}` }),
                  h('span', { class: 'cell-sub' }, 'for ', link(row.requestId, `#/m/requests/${row.requestId}`, { cls: 'mono mn-txreq' }))))
              : link(row.id, `#/m/transactions/${row.id}`, { cls: 'mono', testid: `tx-link-${row.id}` })),
          },
          { key: 'name', label: 'Borrower', render: (row) => h('div', { class: 'cell-2' }, h('span', { class: 'cell-main' }, row.name), h('span', { class: 'cell-sub mono' }, row.accRef)) },
          { key: 'requestId', label: 'For request', render: (row) => link(row.requestId, `#/m/requests/${row.requestId}`, { cls: 'mono' }) },
          mn ? { key: 'method', label: 'Method', render: (row) => methodPlate(ctx, row.method) } : { key: 'method', label: 'Method' },
          { key: 'amount', label: 'Amount', align: 'right', render: (row) => kit.money(row.amount) },
          { key: 'createdAt', label: 'Started', render: (row) => dateTimeCell(kit, row.createdAt) },
          { key: 'status', label: 'Status', render: (row) => chip(row.status, { label: statusLabel(kit, row.status) }), sortValue: (row) => STATUSES.indexOf(row.status) },
          { key: 'files', label: 'Attachments', sortable: false, cls: 'tx-docs-cell', render: (row) => docChips(ctx, filesOf(row.arrangementId)) },
        ],
      }),
    })));
}

// --------------------------------------------------------------------------------------------
// Detail

function webhookLog(ctx, state, a) {
  const kit = ctx.kit;
  const { h, tag, emptyState, fmtDateTime, icon } = kit;
  const events = eventsOf(state, a.id);
  if (!events.length) {
    return emptyState(a.status === 'pending'
      ? 'No webhook yet — PayMongo has not confirmed this payment. Use “Simulate webhook” to deliver one (demo).'
      : 'No webhook was received for this attempt (the checkout session never completed).', { testid: 'webhook-empty', icon: 'clock' });
  }
  const list = h('ol', { class: 'wh-events', testid: 'webhook-log' });
  for (const ev of events) {
    const dup = !!ev.duplicateOf;
    const steps = ev.steps.map((s) => ({ ...s, label: STEP_LABEL[s.name] || kit.humanize(s.name) }));
    if (!dup && ev.kind === 'paid') steps.push({ name: 'receipt_notified', ok: true, at: steps[steps.length - 1]?.at, label: 'Receipt and notifications', derived: true });
    list.appendChild(h('li', { class: ['wh-event', { 'is-dup': dup }], testid: `webhook-event-${ev.id}`, dataset: { kind: ev.kind, duplicate: dup ? '1' : '0' } },
      h('div', { class: 'wh-head' },
        h('span', { class: 'wh-id mono' }, ev.id),
        h('span', { class: 'wh-kind mono' }, EVENT_KIND[ev.kind] || ev.kind),
        dup ? tag(`Replay of ${ev.duplicateOf}`, { tone: 'warn', testid: `webhook-dup-${ev.id}` }) : tag(ev.kind === 'paid' ? 'Processed' : 'Processed — failed', { tone: ev.kind === 'paid' ? 'ok' : 'danger' }),
        h('time', { class: 'wh-time num', attrs: { datetime: ev.receivedAt } }, fmtDateTime(ev.receivedAt))),
      h('ol', { class: 'wh-steps' }, steps.map((s) => h('li', { class: ['wh-step', s.ok ? 'is-ok' : 'is-bad', { 'is-final': s.name === 'posted' || s.name === 'duplicate_ignored' }], testid: `step-${ev.id}-${s.name}`, dataset: { step: s.name } },
        h('span', { class: 'wh-mark', attrs: { 'aria-hidden': 'true' } }, s.ok ? '✓' : '✕'),
        h('span', { class: 'wh-label' }, s.label, h('span', { class: 'sr-only' }, s.ok ? ' — passed' : ' — failed')),
        s.derived ? h('span', { class: 'wh-step-time' }, 'after posting') : h('time', { class: 'wh-step-time num', attrs: { datetime: s.at } }, fmtTime(s.at)))))));
  }
  return list;
}

/** One line per attempt status, for the detail timeline and the Midnight quick view. */
function statusDetail(ctx, a, pay) {
  const { formatPHP } = ctx.kit;
  return {
    initiated: 'Checkout session created (simulated)',
    pending: 'Borrower is at the payment provider; waiting for the webhook',
    paid: pay ? `Verified and posted · ${formatPHP(pay.gross)}` : 'Verified and posted',
    failed: a.failureReason || 'Payment not completed',
    expired: 'Session expired before payment — replaced by a newer attempt',
    cancelled: 'Session cancelled with its request',
    refunded: pay ? `Refunded ${formatPHP(pay.gross)} by Finance` : 'Refunded',
  };
}

function statusTimeline(ctx, state, a, pay) {
  const detail = statusDetail(ctx, a, pay);
  const tone = { initiated: 'neutral', pending: 'warn', paid: 'ok', failed: 'danger', expired: 'neutral', cancelled: 'neutral', refunded: 'neutral' };
  // history is recorded in order; equal timestamps (initiated + pending in one tick) keep that order
  return a.history.map((x, i) => ({ i, at: x.at, kind: x.status, title: statusLabel(ctx.kit, x.status), detail: detail[x.status] || '', tone: tone[x.status] || 'neutral' }))
    .sort((x, y) => byAt(y.at, x.at) || y.i - x.i);
}

function renderDetail(ctx, id) {
  const kit = ctx.kit;
  const { h, pageHeader, card, chip, tag, dl, link, btn, permBtn, timeline, notice, emptyState, toast, confirmDialog, formatPHP, fmtDate, fmtDateTime, borrowerName, humanize } = kit;
  const state = ctx.store.get();
  const a = state.attempts[id];
  const crumbs = [{ label: 'Transactions', href: '#/m/transactions' }, { label: id }];
  if (!a) {
    return h('div', { class: 'page page-transactions' },
      pageHeader({ eyebrow: 'Transaction', title: 'Transaction not found', crumbs }),
      card({ body: emptyState(`There is no transaction ${id} in the demo data.`, { action: link('Back to transactions', '#/m/transactions') }) }));
  }
  const acc = state.accounts[a.accountId];
  const req = state.requests[a.requestId];
  const inst = req ? state.installments[req.installmentId] : null;
  const arr = req ? state.arrangements[req.arrangementId] : null;
  const creditor = acc ? state.creditors[acc.creditorId] : null;
  const pay = paymentOf(state, a.id);
  const events = eventsOf(state, a.id);
  const original = events.find((e) => !e.duplicateOf) || null;
  const exceptions = vals(state.exceptions).filter((e) => e.refs?.attemptId === a.id || (pay && e.refs?.paymentId === pay.id));
  const pending = a.status === 'pending';
  const name = borrowerName(acc);

  const simulate = (kind) => {
    const res = ctx.actions.deliverWebhook(ctx.store, a.id, kind);
    if (!res.ok) { toast(res.message, { kind: 'warn', testid: 'simulate-toast' }); return; }
    if (kind === 'paid') {
      toast(`Webhook ${res.eventId}: signature valid, not a duplicate, verified via API, posted once. ${name} ${formatPHP(a.amount)} is paid${res.completed ? ' and the arrangement is complete' : ''}.`, { kind: 'ok', title: 'Payment verified', testid: 'simulate-toast', duration: 7000 });
    } else {
      toast(`Webhook ${res.eventId}: the attempt is marked Failed. No money was taken; the borrower can try again.`, { kind: 'warn', title: 'Payment failed', testid: 'simulate-toast', duration: 7000 });
    }
  };

  const actions = [];
  if (pending) {
    actions.push(btn('Simulate webhook: failed', { variant: 'secondary', icon: 'x', testid: 'simulate-failed', onClick: () => simulate('failed') }));
    actions.push(btn('Simulate webhook: paid', { variant: 'primary', icon: 'check', testid: 'simulate-paid', onClick: () => simulate('paid') }));
  }
  if (original) {
    actions.push(btn('Replay webhook', {
      variant: 'secondary', icon: 'refresh', testid: 'replay-webhook',
      title: `Sends ${original.id} again to show idempotency`,
      onClick: () => {
        const res = ctx.actions.replayWebhook(ctx.store, original.id);
        if (!res.ok) { toast(res.message, { kind: 'warn', testid: 'replay-toast' }); return; }
        toast('Duplicate ignored — not re-posted', { kind: 'info', title: `Replayed ${original.id} as ${res.eventId}`, testid: 'replay-toast' });
      },
    }));
  }
  const canRefund = pay && !pay.refunded && a.status === 'paid';
  if (canRefund) {
    actions.push(permBtn(ctx, 'payment.refund', 'Refund', {
      variant: 'danger', icon: 'arrowLeft', testid: 'refund',
      onClick: () => confirmDialog({
        title: `Refund ${formatPHP(pay.gross)} to ${name}?`,
        message: h('div', { class: 'stack tx-refund-msg' },
          h('p', {}, `The payment on ${a.id} is reversed and installment ${inst?.seq ?? ''} is due again. If this was the final installment, the arrangement reopens and the account is no longer Settled.`),
          notice('In the real platform Finance requests the refund and an Admin approves it before PayMongo is called (proposed — Q-18). Here both steps happen at once.', { tone: 'info', title: 'Approval step simulated' })),
        confirmLabel: 'Refund payment', variant: 'danger', testid: 'refund-confirm',
        onConfirm: () => {
          const res = ctx.actions.refundPayment(ctx.store, pay.id);
          if (!res.ok) { toast(res.message, { kind: 'warn', testid: 'refund-toast' }); return; }
          toast(res.reopened ? `Refunded. ${name}’s arrangement reopened and the account is no longer Settled.` : `Refunded ${formatPHP(pay.gross)}. Installment ${inst?.seq ?? ''} is due again.`, { kind: 'ok', title: 'Refund issued (simulated)', testid: 'refund-toast', duration: 7000 });
        },
      }),
    }));
  }

  const amounts = pay
    ? h('div', { class: 'tx-amounts', testid: 'tx-amounts' },
      h('div', { class: 'tx-amt' }, h('span', { class: 'tx-amt-label' }, 'Gross'), h('span', { class: 'tx-amt-value num', testid: 'tx-gross' }, formatPHP(pay.gross)), h('span', { class: 'tx-amt-sub' }, 'Paid by the borrower')),
      h('div', { class: 'tx-amt tx-amt-fee' }, h('span', { class: 'tx-amt-label' }, `PayMongo fee (${ctx.config.POLICIES.feePct}% simulated)`), h('span', { class: 'tx-amt-value num', testid: 'tx-fee' }, `− ${formatPHP(pay.fee)}`), h('span', { class: 'tx-amt-sub' }, feeLabel(kit))),
      h('div', { class: 'tx-amt tx-amt-net' }, h('span', { class: 'tx-amt-label' }, 'Net to MBA'), h('span', { class: 'tx-amt-value num', testid: 'tx-net' }, formatPHP(pay.net)), h('span', { class: 'tx-amt-sub' }, 'The borrower is credited the full gross')))
    : h('div', { class: 'stack' },
      dl([['Amount', h('span', { class: 'num tx-big' }, formatPHP(a.amount))], ['Fee treatment', feeLabel(kit)]], { cols: 2 }),
      h('p', { class: 'muted tx-small' }, pending ? 'Gross, fee and net appear once the webhook verifies the payment.' : 'No money moved on this attempt, so there is no fee.'));

  const main = h('div', { class: 'stack' },
    pending ? notice(`PayMongo has not confirmed this payment yet, so nothing is posted and the borrower sees “We’re confirming your payment”. In the demo, resolve it with Simulate webhook.`, { tone: 'warn', title: 'Waiting for the webhook', testid: 'tx-pending-banner' }) : null,
    a.status === 'failed' ? notice(`${a.failureReason || 'Payment not completed'}. No money was taken; the attempt stays in history and the borrower can try again.`, { tone: 'danger', title: 'Failed' }) : null,
    pay && pay.refunded ? notice(`Refunded on ${fmtDateTime(pay.refundedAt)}. Collected-this-month figures are net of this refund.`, { tone: 'neutral', title: 'Refunded', testid: 'tx-refunded-banner' }) : null,
    card({
      title: 'Payment',
      testid: 'tx-summary',
      body: dl([
        ['Amount', h('span', { class: 'num tx-big', testid: 'tx-amount' }, formatPHP(a.amount))],
        ['Status', chip(a.status, { label: statusLabel(kit, a.status), size: 'lg', testid: 'tx-status' })],
        ['Method', a.method && isMidnight() ? methodLine(ctx, a.method) : a.method || '—'],
        ['Borrower', acc ? link(`${name} · ${acc.ref}`, `#/m/accounts/${acc.id}`, { testid: 'tx-account-link' }) : '—'],
        ['For request', req ? link(req.id, `#/m/requests/${req.id}`, { cls: 'mono', testid: 'tx-request-link' }) : '—'],
        ['Installment', inst ? `${inst.seq} of ${arr?.count ?? '—'} · due ${fmtDate(inst.dueDate)}` : '—'],
        ['Payee', creditor ? ctx.config.payeeLine(creditor.name) : '—', { wide: true }],
        ['Started', h('span', { class: 'num' }, fmtDateTime(a.createdAt))],
        ['Paid', pay ? h('span', { class: 'num' }, fmtDateTime(pay.paidAt)) : '—'],
      ], { cols: 2 }),
    }),
    card({
      title: 'Simulated PayMongo references',
      eyebrow: 'Test mode — not a real provider',
      testid: 'tx-provider',
      body: dl([
        ['Checkout session', h('span', { class: 'mono', testid: 'tx-cs' }, a.provider?.checkoutSessionId || '—')],
        ['Payment ID', a.provider?.paymentId ? h('span', { class: 'mono', testid: 'tx-pay' }, a.provider.paymentId) : h('span', { class: 'muted' }, 'Issued when the payment is verified')],
      ], { cols: 2 }),
    }),
    card({ title: 'Gross, fee and net', testid: 'tx-money', body: amounts }),
    card({
      title: 'Webhook log',
      eyebrow: 'Simulated — signature, idempotency and API verification',
      testid: 'tx-webhooks',
      actions: original ? tag(`${events.length} event${events.length === 1 ? '' : 's'}`, { tone: 'neutral' }) : null,
      body: webhookLog(ctx, state, a),
    }));

  const recon = pay
    ? [
      dl([
        ['Reconciliation', pay.reconciled ? chip('reconciled', { label: 'Reconciled' }) : chip('pending', { label: 'Ready for reconciliation' })],
        ['Exceptions', exceptions.length ? `${exceptions.length} open or past` : 'None'],
      ], { cols: 1 }),
      exceptions.length ? h('ul', { class: 'tx-exc' }, exceptions.map((e) => h('li', {}, chip(e.status), ' ', humanize(e.type), ' · ', link(e.id, '#/m/reconciliation', { cls: 'mono' })))) : null,
    ]
    : h('p', { class: 'muted tx-small' }, 'Only verified payments go to reconciliation.');

  const files = req ? ctx.selectors.attachmentsFor(state, req.arrangementId) : [];
  const side = h('div', { class: 'stack' },
    card({ title: 'Status timeline', testid: 'tx-history', body: timeline(statusTimeline(ctx, state, a, pay), { testid: 'tx-timeline' }) }),
    card({
      title: 'Contract / agreement files',
      eyebrow: 'Attachments',
      testid: 'tx-attachments',
      actions: files.length ? tag(`${files.length} file${files.length === 1 ? '' : 's'}`, { tone: 'neutral' }) : null,
      body: files.length ? docList(ctx, files) : emptyState('No contract or agreement is on file for this arrangement.', { testid: 'tx-attachments-empty', icon: 'file' }),
    }),
    card({ title: 'Reconciliation', testid: 'tx-recon', body: recon }),
    card({
      title: 'How a payment becomes Paid',
      body: h('ol', { class: 'tx-explain' },
        h('li', {}, 'The browser return page only says “Checking…” — it is never proof of payment.'),
        h('li', {}, 'PayMongo sends a webhook; its signature is checked and its event ID is stored so a repeat is ignored.'),
        h('li', {}, 'The payment is re-checked through the provider API, then posted exactly once.')),
    }));

  return h('div', { class: 'page page-transactions page-tx-detail', testid: 'transaction-detail' },
    pageHeader({
      crumbs,
      eyebrow: pay ? 'Payment · MBA-TXN' : 'Checkout attempt · MBA-TXN',
      title: a.id,
      subtitle: `${name} · ${formatPHP(a.amount)}${a.method ? ` · ${a.method}` : ''}`,
      meta: [chip(a.status, { label: statusLabel(kit, a.status), size: 'lg', testid: 'tx-head-status' }), tag('Simulated PayMongo test mode', { tone: 'neutral' })],
      actions: actions.length ? actions : null,
    }),
    h('div', { class: 'tx-grid' }, main, side));
}
