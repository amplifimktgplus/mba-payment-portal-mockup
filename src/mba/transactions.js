// Transactions (MBA view, plan Task 7, D§7.7).
// List of checkout attempts and payments (MBA-TXN-…). Detail: status timeline, simulated PayMongo
// IDs (cs_test_… / pay_test_…), method, gross / fee / net ("Fee borne by MBA — Q-17") and the
// simulated webhook log with every step ticked.
// Actions: Simulate webhook paid / failed (pending attempts only), Replay webhook (idempotency:
// "Duplicate ignored — not re-posted"), Refund (payment.refund, Finance).
// Payment truth: this file never marks anything paid itself — it calls deliverWebhook().
// Attachments (2026-11-26, user request): each row shows the borrower's own contract and signed
// agreement (the arrangement's files, V3 §7); a chip opens the preview without opening the row.
import { renderMbaLayout } from './layout.js';
import { docChips, docList } from './docViewer.js';

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

  const pendingList = all.filter((a) => a.status === 'pending').sort((a, b) => byAt(b.createdAt, a.createdAt));
  const pendingNotice = pendingList.length
    ? notice(h('span', { class: 'tx-pending-line' },
      `${pendingList.length} ${pendingList.length === 1 ? 'payment is' : 'payments are'} waiting for PayMongo’s confirmation (${formatPHP(pendingAmount)}). Open one to simulate the webhook: `,
      pendingList.slice(0, 4).map((a, i) => [i ? ', ' : '', link(`${a.id} (${borrowerName(state.accounts[a.accountId])})`, `#/m/transactions/${a.id}`, { cls: 'mono', testid: `tx-pending-${a.id}` })])),
    { tone: 'warn', title: 'Pending confirmation', testid: 'tx-pending-notice', icon: 'clock' })
    : null;

  return h('div', { class: 'page page-transactions', testid: 'transactions-page' },
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
          { key: 'id', label: 'Transaction', render: (row) => link(row.id, `#/m/transactions/${row.id}`, { cls: 'mono', testid: `tx-link-${row.id}` }) },
          { key: 'name', label: 'Borrower', render: (row) => h('div', { class: 'cell-2' }, h('span', { class: 'cell-main' }, row.name), h('span', { class: 'cell-sub mono' }, row.accRef)) },
          { key: 'requestId', label: 'For request', render: (row) => link(row.requestId, `#/m/requests/${row.requestId}`, { cls: 'mono' }) },
          { key: 'method', label: 'Method' },
          { key: 'amount', label: 'Amount', align: 'right', render: (row) => kit.money(row.amount) },
          { key: 'createdAt', label: 'Started', render: (row) => dateTimeCell(kit, row.createdAt) },
          { key: 'status', label: 'Status', render: (row) => chip(row.status, { label: statusLabel(kit, row.status) }), sortValue: (row) => STATUSES.indexOf(row.status) },
          { key: 'files', label: 'Attachments', sortable: false, cls: 'tx-docs-cell', render: (row) => docChips(ctx, filesOf(row.arrangementId)) },
        ],
      }),
    }));
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

function statusTimeline(ctx, state, a, pay) {
  const { formatPHP } = ctx.kit;
  const detail = {
    initiated: 'Checkout session created (simulated)',
    pending: 'Borrower is at the payment provider; waiting for the webhook',
    paid: pay ? `Verified and posted · ${formatPHP(pay.gross)}` : 'Verified and posted',
    failed: a.failureReason || 'Payment not completed',
    expired: 'Session expired before payment — replaced by a newer attempt',
    cancelled: 'Session cancelled with its request',
    refunded: pay ? `Refunded ${formatPHP(pay.gross)} by Finance` : 'Refunded',
  };
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
        ['Method', a.method || '—'],
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
