// Payment requests (MBA view, plan Task 7, D§7.6).
// List (MBA-REQ-…) with status filter; expired rows point to their replacement and sit next to it.
// Detail: installment, amount, expiry, delivery log ("delivered via arrangement link" — the link
// and QR belong to the arrangement, D§5.3), linked checkout attempts, replacement chain.
// Actions: Resend the arrangement link (request.send, cooldown), Cancel (request.cancel),
// Expire now (demo) → request Expired → installment Overdue → replacement request.
// Domain logic lives in src/core (actions/selectors); this file only renders and dispatches.
import { renderMbaLayout } from './layout.js';

const STATUSES = ['created', 'sent', 'opened', 'paid', 'expired', 'cancelled'];
const OPEN = ['created', 'sent', 'opened'];
const CHANNEL = { email: 'Email', sms: 'SMS' };

export function register(router, ctx) {
  router.on('/m/requests', (params, query) => renderMbaLayout(ctx, renderList(ctx, query || {}), 'requests'));
  router.on('/m/requests/:id', (params) => renderMbaLayout(ctx, renderDetail(ctx, params.id), 'requests'));
}

// --------------------------------------------------------------------------------------------
// helpers

const vals = (m) => Object.values(m || {});

function accountOf(state, accountId) {
  return state.accounts[accountId] || null;
}

/** Newest first, but each expired request is placed right after the replacement that took over. */
function orderWithReplacements(list, byId) {
  const sorted = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1));
  const present = new Set(sorted.map((r) => r.id));
  const placed = new Set();
  const out = [];
  for (const r of sorted) {
    if (placed.has(r.id)) continue;
    // a replaced request whose replacement is also listed is emitted with the replacement
    if (r.replacedById && present.has(r.replacedById)) continue;
    out.push(r);
    placed.add(r.id);
    let prev = r.replacesId ? byId[r.replacesId] : null;
    while (prev && present.has(prev.id) && !placed.has(prev.id)) {
      out.push(prev);
      placed.add(prev.id);
      prev = prev.replacesId ? byId[prev.replacesId] : null;
    }
  }
  // anything skipped above (replacement filtered out of view) still appears
  for (const r of sorted) if (!placed.has(r.id)) out.push(r);
  return out;
}

function lastDelivery(r) {
  const d = r.deliveries || [];
  return d.length ? d[d.length - 1] : null;
}

// --------------------------------------------------------------------------------------------
// List

function renderList(ctx, query) {
  const kit = ctx.kit;
  const { h } = kit;
  const { pageHeader, card, filterBar, table, chip, kpi, memo, link, formatPHP, fmtDate, borrowerName, tag } = kit;
  const state = ctx.store.get();
  const f = memo('requests.filters', () => ({ status: '', q: '', portfolio: '', lastQuery: null }));
  // #/m/requests?status=expired (e.g. from the dashboard) sets the filter once per distinct query
  const qKey = query.status ?? null;
  if (qKey !== f.lastQuery) {
    f.lastQuery = qKey;
    if (qKey && STATUSES.includes(qKey)) f.status = qKey;
  }
  const tableState = memo('table:requests.list', () => ({ sortKey: null, dir: 'asc', page: 0 }));

  const all = vals(state.requests);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let openAmount = 0;
  for (const r of all) {
    counts[r.status] = (counts[r.status] || 0) + 1;
    if (OPEN.includes(r.status)) openAmount += r.amount;
  }
  const openCount = counts.created + counts.sent + counts.opened;

  const q = f.q.trim().toLowerCase();
  const filtered = all.filter((r) => {
    if (f.status && r.status !== f.status) return false;
    const acc = accountOf(state, r.accountId);
    if (f.portfolio && acc?.portfolioId !== f.portfolio) return false;
    if (q) {
      const hay = `${r.id} ${acc?.ref || ''} ${borrowerName(acc)}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const byId = state.requests;
  const rows = orderWithReplacements(filtered, byId).map((r) => {
    const acc = accountOf(state, r.accountId);
    const inst = state.installments[r.installmentId];
    const arr = state.arrangements[r.arrangementId];
    const ld = lastDelivery(r);
    return {
      r, id: r.id, name: borrowerName(acc), accRef: acc?.ref || '', amount: r.amount, seq: inst?.seq ?? 0, count: arr?.count ?? 0,
      dueDate: inst?.dueDate || '', expiresAt: r.expiresAt, status: r.status, deliveries: (r.deliveries || []).length, lastAt: ld?.at || '', createdAt: r.createdAt,
    };
  });

  const applyFilters = (v) => {
    Object.assign(f, { status: v.status || '', q: v.q || '', portfolio: v.portfolio || '' });
    tableState.page = 0;
    ctx.rerender();
  };

  const statusCell = (row) => {
    const r = row.r;
    const parts = [chip(r.status)];
    if (r.status === 'expired' && r.replacedById) {
      parts.push(h('span', { class: 'rq-repl', testid: `replaced-by-${r.id}` }, '→ replaced by ', link(r.replacedById, `#/m/requests/${r.replacedById}`, { cls: 'mono' })));
    } else if (r.replacesId) {
      parts.push(h('span', { class: 'rq-repl' }, 'replaces ', link(r.replacesId, `#/m/requests/${r.replacesId}`, { cls: 'mono' })));
    }
    return h('div', { class: 'rq-status' }, parts);
  };

  const portfolios = vals(state.portfolios).map((p) => ({ value: p.id, label: p.name }));

  return h('div', { class: 'page page-requests', testid: 'requests-page' },
    pageHeader({
      eyebrow: 'Collections',
      title: 'Payment requests',
      subtitle: 'One request per installment due (MBA-REQ). The borrower always pays through the arrangement’s single link and QR, so a request never has a link of its own.',
    }),
    h('div', { class: 'grid-4 rq-kpis' },
      kpi({ label: 'Open requests', value: openCount.toLocaleString('en-US'), sub: `${formatPHP(openAmount)} awaiting payment`, tone: 'info', icon: 'requests', testid: 'rq-kpi-open' }),
      kpi({ label: 'Opened by borrower', value: counts.opened.toLocaleString('en-US'), sub: `${counts.sent.toLocaleString('en-US')} sent, not yet opened`, tone: 'brand', icon: 'eye', testid: 'rq-kpi-opened' }),
      kpi({ label: 'Paid', value: counts.paid.toLocaleString('en-US'), sub: 'Verified through the webhook', tone: 'ok', icon: 'check', testid: 'rq-kpi-paid' }),
      kpi({ label: 'Expired', value: counts.expired.toLocaleString('en-US'), sub: 'Each replaced by an overdue request', tone: 'neutral', icon: 'clock', testid: 'rq-kpi-expired' })),
    filterBar({
      testid: 'rq-filter',
      values: f,
      fields: [
        { type: 'text', name: 'q', label: 'Search', placeholder: 'Request ID, reference or name', wide: true },
        { type: 'select', name: 'status', label: 'Status', options: STATUSES.map((s) => ({ value: s, label: `${kit.humanize(s)} (${counts[s]})` })) },
        { type: 'select', name: 'portfolio', label: 'Portfolio', options: portfolios },
      ],
      onApply: applyFilters,
      onReset: () => applyFilters({}),
    }),
    card({
      flush: true,
      cls: 'rq-list-card',
      title: f.status ? `${kit.humanize(f.status)} requests` : 'All requests',
      actions: tag(`${rows.length.toLocaleString('en-US')} shown`, { tone: 'neutral' }),
      body: table({
        testid: 'rq-table',
        stateKey: 'requests.list',
        caption: 'Payment requests',
        rows,
        rowTestid: (row) => `rq-row-${row.id}`,
        onRowClick: (row) => ctx.router.go(`#/m/requests/${row.id}`),
        empty: 'No payment requests match these filters.',
        columns: [
          { key: 'id', label: 'Request', render: (row) => link(row.id, `#/m/requests/${row.id}`, { cls: 'mono', testid: `rq-link-${row.id}` }) },
          { key: 'name', label: 'Borrower', render: (row) => h('div', { class: 'cell-2' }, h('span', { class: 'cell-main' }, row.name), h('span', { class: 'cell-sub mono' }, row.accRef)) },
          { key: 'seq', label: 'Installment', render: (row) => h('div', { class: 'cell-2' }, h('span', { class: 'cell-main' }, `${row.seq} of ${row.count}`), h('span', { class: 'cell-sub' }, row.dueDate ? `Due ${fmtDate(row.dueDate)}` : '')) },
          { key: 'amount', label: 'Amount', align: 'right', render: (row) => kit.money(row.amount) },
          { key: 'deliveries', label: 'Deliveries', render: (row) => (row.deliveries ? h('div', { class: 'cell-2' }, h('span', { class: 'cell-main' }, `${row.deliveries} sent`), h('span', { class: 'cell-sub' }, `${CHANNEL[lastDelivery(row.r).channel]} · ${fmtDate(row.lastAt)}`)) : h('span', { class: 'muted' }, 'Not sent')) },
          { key: 'expiresAt', label: 'Expires', render: (row) => h('span', { class: 'num' }, fmtDate(row.expiresAt)) },
          { key: 'status', label: 'Status', render: statusCell, sortValue: (row) => STATUSES.indexOf(row.status) },
        ],
      }),
    }));
}

// --------------------------------------------------------------------------------------------
// Detail

function requestHistory(ctx, state, r) {
  const { formatPHP, humanize } = ctx.kit;
  const items = [{ at: r.createdAt, title: 'Request created', detail: r.replacesId ? `Replacement for ${r.replacesId} (expired) · ${formatPHP(r.amount)}` : `For installment ${state.installments[r.installmentId]?.seq} · ${formatPHP(r.amount)}`, tone: 'info' }];
  for (const d of r.deliveries || []) items.push({ at: d.at, title: `Arrangement link sent by ${CHANNEL[d.channel]}`, detail: `To ${d.to} · by ${humanize(d.by)}`, tone: 'info' });
  if (r.openedAt) items.push({ at: r.openedAt, title: 'Opened by the borrower', detail: 'Through the arrangement link', tone: 'info' });
  for (const a of vals(state.attempts)) {
    if (a.requestId !== r.id) continue;
    items.push({ at: a.createdAt, title: `Checkout ${a.id} started`, detail: `${a.method || 'Method not chosen'} · now ${humanize(a.status)}`, tone: a.status === 'paid' ? 'ok' : a.status === 'failed' ? 'danger' : a.status === 'pending' ? 'warn' : 'neutral' });
  }
  if (r.status === 'paid' && r.paidAt) items.push({ at: r.paidAt, title: 'Paid — verified by webhook', detail: r.lateAfterExpiry ? 'Verified after the request had closed (late payment)' : '', tone: 'ok' });
  if (r.status === 'expired') items.push({ at: r.expiredAt || r.expiresAt, title: 'Expired', detail: r.replacedById ? `Installment overdue · replaced by ${r.replacedById}` : 'Installment overdue', tone: 'neutral' });
  if (r.status === 'cancelled' && r.cancelledAt) items.push({ at: r.cancelledAt, title: 'Cancelled', detail: '', tone: 'neutral' });
  // newest first; equal timestamps keep the order events happened in (reversed)
  return items.map((x, i) => ({ ...x, i })).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : b.i - a.i));
}

function openResendModal(ctx, r) {
  const { h, modal, btn, segmented, notice, toast } = ctx.kit;
  const state = ctx.store.get();
  const acc = state.accounts[r.accountId];
  const ui = { channel: acc?.borrower?.email ? 'email' : 'sms', error: null };
  const m = modal({
    title: 'Resend the arrangement link',
    eyebrow: r.id,
    testid: 'resend-modal',
    body: () => draw(),
    actions: (api) => [
      btn('Cancel', { variant: 'ghost', testid: 'resend-cancel', onClick: () => api.close() }),
      btn('Resend link', {
        variant: 'primary', icon: 'mail', testid: 'resend-send',
        onClick: () => {
          const res = ctx.actions.sendPaymentLink(ctx.store, r.accountId, ui.channel);
          if (!res.ok) {
            ui.error = res.message;
            api.setBody(draw());
            return;
          }
          api.close();
          toast(`Arrangement link sent by ${CHANNEL[ui.channel]} to ${res.to}. Logged on ${res.requestId}.`, { kind: 'ok', testid: 'resend-toast' });
        },
      }),
    ],
  });
  function draw() {
    return h('div', { class: 'stack rq-resend' },
      h('p', {}, 'The borrower receives the same link and QR as before — they belong to the arrangement. The message names no creditor and no amount.'),
      segmented({
        label: 'Channel', value: ui.channel, testid: 'resend-channel',
        items: [
          { value: 'email', label: 'Email (link + QR)', icon: 'mail', testid: 'resend-email' },
          { value: 'sms', label: 'SMS (link)', icon: 'phone', testid: 'resend-sms' },
        ],
        onChange: (v) => { ui.channel = v; ui.error = null; m.setBody(draw()); },
      }),
      h('p', { class: 'muted rq-small' }, `To ${ui.channel === 'email' ? ctx.kit.maskEmail(acc?.borrower?.email) : ctx.kit.maskMobile(acc?.borrower?.mobile)} · resends are limited to one every ${ctx.config.POLICIES.resendCooldownMin} minutes per channel (Q-12).`),
      ui.error ? notice(ui.error, { tone: 'warn', title: 'Not sent', testid: 'resend-error' }) : null);
  }
  m.open();
}

function renderDetail(ctx, id) {
  const kit = ctx.kit;
  const { h, pageHeader, card, chip, tag, dl, link, btn, permBtn, table, timeline, notice, emptyState, toast, confirmDialog, qrSvg, formatPHP, fmtDate, fmtDateTime, borrowerName, humanize } = kit;
  const state = ctx.store.get();
  const r = state.requests[id];
  const crumbs = [{ label: 'Payment requests', href: '#/m/requests' }, { label: id }];
  if (!r) {
    return h('div', { class: 'page page-requests' },
      pageHeader({ eyebrow: 'Payment request', title: 'Request not found', crumbs }),
      card({ body: emptyState(`There is no payment request ${id} in the demo data.`, { action: link('Back to payment requests', '#/m/requests') }) }));
  }
  const acc = state.accounts[r.accountId];
  const inst = state.installments[r.installmentId];
  const arr = state.arrangements[r.arrangementId];
  const creditor = acc ? state.creditors[acc.creditorId] : null;
  const isOpen = OPEN.includes(r.status);
  const token = arr ? vals(state.tokens).find((t) => t.lineageId === arr.lineageId && t.status === 'active') || vals(state.tokens).find((t) => t.lineageId === arr.lineageId) : null;
  const url = token ? ctx.config.QR_BASE + token.token : null;
  const attempts = vals(state.attempts).filter((a) => a.requestId === r.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const expireBtn = btn('Expire now (demo)', {
    variant: 'secondary', icon: 'clock', testid: 'expire-now', disabled: !isOpen,
    title: isOpen ? 'Runs the nightly expiry job for this request now' : 'Only an open request can be expired',
    onClick: () => {
      const res = ctx.actions.expireRequestNow(ctx.store, r.id);
      if (!res.ok) { toast(res.message, { kind: 'warn', testid: 'expire-toast' }); return; }
      toast(`${r.id} expired → installment ${inst?.seq} is overdue → replacement ${res.replacementId} created. The borrower’s link now shows the overdue amount.`, { kind: 'ok', title: 'Expired (demo)', testid: 'expire-toast', duration: 7000 });
    },
  });
  const resendBtn = isOpen
    ? permBtn(ctx, 'request.send', 'Resend link', { variant: 'primary', icon: 'mail', testid: 'resend-link', onClick: () => openResendModal(ctx, r) })
    : null;
  const cancelBtn = isOpen
    ? permBtn(ctx, 'request.cancel', 'Cancel request', {
      variant: 'danger', icon: 'x', testid: 'cancel-request',
      onClick: () => confirmDialog({
        title: `Cancel ${r.id}?`,
        message: 'The request closes and any unfinished checkout on it is cancelled. The arrangement link stays valid. Create or send a new request when the borrower should pay again.',
        confirmLabel: 'Cancel request', cancelLabel: 'Keep request', variant: 'danger', testid: 'cancel-confirm',
        onConfirm: () => {
          const res = ctx.actions.cancelRequest(ctx.store, r.id);
          toast(res.ok ? `${r.id} cancelled.` : res.message, { kind: res.ok ? 'ok' : 'warn', testid: 'cancel-toast' });
        },
      }),
    })
    : null;

  // Replacement chain banner
  let chain = null;
  if (r.status === 'expired' && r.replacedById) {
    const nr = state.requests[r.replacedById];
    chain = notice(h('span', {}, 'This request expired, so installment ', String(inst?.seq ?? ''), ' became overdue and ', link(r.replacedById, `#/m/requests/${r.replacedById}`, { cls: 'mono', testid: 'replacement-link' }), ` was created for the same ${formatPHP(r.amount)}${nr ? ` (now ${humanize(nr.status).toLowerCase()})` : ''}. The borrower’s link still works and shows the overdue amount.`),
      { tone: 'info', title: 'Replaced', testid: 'replacement-notice' });
  } else if (r.replacesId) {
    chain = notice(h('span', {}, 'Created because ', link(r.replacesId, `#/m/requests/${r.replacesId}`, { cls: 'mono', testid: 'replaces-link' }), ' expired. The installment is overdue, and the amount stays payable through the same arrangement link.'),
      { tone: 'warn', title: 'Overdue replacement', testid: 'replaces-notice' });
  }

  const deliveryRows = (r.deliveries || []).map((d, i) => ({ ...d, i, channelLabel: CHANNEL[d.channel] })).reverse();

  const main = h('div', { class: 'stack' },
    chain,
    card({
      title: 'Request',
      testid: 'rq-summary',
      body: dl([
        ['Amount', h('span', { class: 'rq-amount num', testid: 'rq-amount' }, formatPHP(r.amount))],
        ['Status', chip(r.status, { testid: 'rq-status', size: 'lg' })],
        ['Installment', inst ? h('span', { class: 'qline' }, `${inst.seq} of ${arr?.count ?? '—'} · due ${fmtDate(inst.dueDate)}`, chip(inst.status, { testid: 'rq-inst-status', size: 'sm' })) : '—'],
        ['Expires', h('span', { class: 'num' }, fmtDateTime(r.expiresAt))],
        ['Borrower', acc ? link(`${borrowerName(acc)} · ${acc.ref}`, `#/m/accounts/${acc.id}`, { testid: 'rq-account-link' }) : '—'],
        ['Creditor', creditor?.name || '—'],
        ['Arrangement', arr ? link(`${ctx.format.arrangementRef(arr.id)} · version ${arr.version}`, `#/m/arrangements/${arr.id}`, { testid: 'rq-arr-link' }) : '—'],
        ['Created', h('span', { class: 'num' }, fmtDateTime(r.createdAt))],
      ], { cols: 2 }),
    }),
    card({
      title: 'Delivery',
      eyebrow: 'Delivered via arrangement link',
      testid: 'rq-delivery',
      body: [
        h('div', { class: 'rq-link' },
          url ? qrSvg(url, 112, { testid: 'rq-qr' }) : null,
          h('div', { class: 'rq-link-text' },
            h('p', { class: 'rq-link-lead' }, 'The link and QR belong to the arrangement, not to this request. Every request on this arrangement — including overdue replacements — is paid through the same link.'),
            url ? h('div', { class: 'rq-url mono', testid: 'rq-url' }, url) : h('div', { class: 'muted' }, 'No link has been issued for this arrangement yet.'),
            token ? h('div', { class: 'qline' }, h('span', { class: 'muted rq-small' }, 'Link status'), chip(token.status, { size: 'sm', testid: 'rq-token-status' }), tag('Demo domain — scanning never reaches a live site', { tone: 'neutral' })) : null)),
        h('h3', { class: 'rq-subhead' }, 'Delivery log'),
        deliveryRows.length
          ? table({
            testid: 'rq-deliveries', dense: true, rows: deliveryRows, pageSize: 10,
            columns: [
              { key: 'channelLabel', label: 'Channel', render: (d) => h('span', { class: 'qline' }, kit.icon(d.channel === 'sms' ? 'phone' : 'mail', { size: 16 }), d.channelLabel) },
              { key: 'to', label: 'To (masked)', render: (d) => h('span', { class: 'mono' }, d.to) },
              { key: 'at', label: 'Sent', render: (d) => h('span', { class: 'num' }, fmtDateTime(d.at)) },
              { key: 'by', label: 'By', render: (d) => humanize(d.by) },
            ],
          })
          : emptyState(isOpen ? 'Not sent yet. Use Resend link, or send it from the account.' : 'This request was never sent.', { testid: 'rq-deliveries-empty' }),
      ],
    }),
    card({
      title: 'Checkout attempts',
      eyebrow: 'MBA-TXN',
      flush: true,
      testid: 'rq-attempts',
      body: table({
        testid: 'rq-attempts-table', dense: true, rows: attempts, pageSize: 10,
        empty: 'No checkout has been started for this request.',
        rowTestid: (a) => `rq-attempt-${a.id}`,
        onRowClick: (a) => ctx.router.go(`#/m/transactions/${a.id}`),
        columns: [
          { key: 'id', label: 'Transaction', render: (a) => link(a.id, `#/m/transactions/${a.id}`, { cls: 'mono' }) },
          { key: 'method', label: 'Method' },
          { key: 'amount', label: 'Amount', align: 'right', render: (a) => kit.money(a.amount) },
          { key: 'createdAt', label: 'Started', render: (a) => h('span', { class: 'num' }, fmtDateTime(a.createdAt)) },
          { key: 'status', label: 'Status', render: (a) => chip(a.status) },
        ],
      }),
    }));

  const side = h('div', { class: 'stack' },
    card({
      title: 'Demo actions',
      testid: 'rq-actions',
      body: [
        h('p', { class: 'rq-small' }, 'Expire now runs the nightly job for this one request: the request becomes Expired, the installment becomes Overdue, and a replacement request is created for the same amount.'),
        h('div', { class: 'rq-action-row' }, expireBtn),
        isOpen ? null : h('p', { class: 'muted rq-small', testid: 'rq-closed-note' }, `This request is ${humanize(r.status).toLowerCase()}, so it can no longer be resent, cancelled or expired.`),
      ],
    }),
    card({ title: 'History', testid: 'rq-history', body: timeline(requestHistory(ctx, state, r), { testid: 'rq-timeline' }) }));

  return h('div', { class: 'page page-requests page-rq-detail', testid: 'request-detail' },
    pageHeader({
      crumbs,
      eyebrow: 'Payment request',
      title: r.id,
      subtitle: acc ? `${borrowerName(acc)} · installment ${inst?.seq ?? '—'} of ${arr?.count ?? '—'} · ${formatPHP(r.amount)}` : null,
      meta: [chip(r.status, { size: 'lg', testid: 'rq-head-status' }), r.replacesId ? tag('Overdue replacement', { tone: 'warn' }) : null, tag('MBA-REQ · request', { tone: 'neutral' })],
      actions: isOpen ? [cancelBtn, resendBtn] : null,
    }),
    h('div', { class: 'rq-grid' }, main, side));
}
