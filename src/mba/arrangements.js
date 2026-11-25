// Arrangements (MBA view) — plan Task 8, D§7.5, V3 §7.
// List by status · detail (schedule, attachments, versions, approval history) · create form with a
// live schedule preview · Approve / Reject / Revise / Cancel / Submit through permBtn (C7).
// Domain logic only through ctx.actions / ctx.selectors; DOM only through ctx.kit.
import { renderMbaLayout } from './layout.js';

const STATUSES = ['draft', 'pending_approval', 'active', 'partially_paid', 'completed', 'defaulted', 'cancelled', 'superseded'];
const IN_PROGRESS = ['draft', 'pending_approval', 'active', 'partially_paid'];
const CLOSED_ACCOUNT = ['settled', 'uncollectable', 'returned'];
const HISTORY_TITLES = {
  drafted: 'Drafted', submitted: 'Submitted for approval', approved: 'Approved', rejected: 'Returned to draft',
  revised: 'Revised — new version', superseded: 'Superseded by a new version', cancelled: 'Cancelled',
};
const HISTORY_TONES = { approved: 'ok', rejected: 'danger', cancelled: 'neutral', superseded: 'neutral', submitted: 'brand', drafted: 'brand', revised: 'info' };

export function register(router, ctx) {
  router.on('/m/arrangements', (params, query) => renderMbaLayout(ctx, listPage(ctx, query), 'arrangements'));
  router.on('/m/arrangements/new', (params, query) => renderMbaLayout(ctx, createPage(ctx, query), 'arrangements'));
  router.on('/m/arrangements/:id', (params) => renderMbaLayout(ctx, detailPage(ctx, params.id), 'arrangements'));
}

// ------------------------------------------------------------------------------------------
// Shared helpers (display only)

/** 'ag_1' → 'Andrea L.'; 'supervisor' → 'Supervisor'. */
function who(ctx, s, by) {
  if (!by) return '—';
  return s.agents?.[by]?.name || ctx.permissions.ROLE_LABELS[by] || ctx.kit.humanize(by);
}

/** Pesos string for an input from centavos: 880000 → '8800.00'. */
const pesosInput = (c) => (Number.isFinite(c) && c > 0 ? (c / 100).toFixed(2) : '');

/**
 * Prefilled input (amount or installment count): focusing it (Tab, click, or a dialog's autofocus) selects the whole
 * value, and so does the first click after it gains focus, so typing replaces the prefilled amount
 * instead of appending to it. That click's mouseup would otherwise drop the selection to a caret,
 * so it re-selects and is cancelled. Once the user types, clicks place the caret as usual.
 */
function selectAllOnFocus(el) {
  let armed = false;
  el.addEventListener('focus', () => { armed = true; el.select(); });
  el.addEventListener('blur', () => { armed = false; });
  el.addEventListener('input', () => { armed = false; });
  el.addEventListener('mouseup', (e) => {
    if (!armed) return;
    armed = false;
    e.preventDefault();
    el.select();
  });
  return el;
}

/** The token (arrangement link) of a lineage: active first, else the latest. */
function lineageToken(s, lineageId) {
  const list = Object.values(s.tokens).filter((t) => t.lineageId === lineageId);
  return list.find((t) => t.status === 'active') || list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] || null;
}

function arrRow(ctx, s, a) {
  const acc = s.accounts[a.accountId];
  const pf = acc ? s.portfolios[acc.portfolioId] : null;
  const pr = ctx.selectors.arrangementProgress(s, a.id);
  return {
    id: a.id, a, acc,
    name: ctx.kit.borrowerName(acc), ref: acc?.ref ?? '', portfolio: pf?.name ?? '—', portfolioId: acc?.portfolioId ?? '',
    status: a.status, total: a.total, paid: pr.paid, paidCount: pr.paidCount, count: a.count, version: a.version,
    nextDue: pr.next?.dueDate ?? null, nextStatus: pr.next?.status ?? null, createdAt: a.createdAt,
  };
}

// ------------------------------------------------------------------------------------------
// List

function listPage(ctx) {
  const k = ctx.kit;
  const { h } = k;
  const s = ctx.store.get();
  const ui = k.memo('arr.list', () => ({ status: '', q: '', portfolioId: '' }));

  // Needs-attention first (pending approval, then drafts), then newest first.
  const rank = (st) => (st === 'pending_approval' ? 0 : st === 'draft' ? 1 : 2);
  const all = Object.values(s.arrangements).map((a) => arrRow(ctx, s, a))
    .sort((x, y) => rank(x.status) - rank(y.status) || (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0));
  const counts = Object.fromEntries(STATUSES.map((st) => [st, 0]));
  for (const r of all) counts[r.status] = (counts[r.status] || 0) + 1;

  const q = ui.q.toLowerCase();
  const rows = all.filter((r) => (!ui.status || r.status === ui.status)
    && (!ui.portfolioId || r.portfolioId === ui.portfolioId)
    && (!q || r.name.toLowerCase().includes(q) || r.ref.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || ctx.format.arrangementRef(r.id).toLowerCase().includes(q)));

  const setStatus = (st) => { ui.status = st; ctx.rerender(); };
  const tiles = h('div', { class: 'arr-tiles', testid: 'arr-status-tiles', attrs: { role: 'group', 'aria-label': 'Filter by status' } },
    h('button', {
      type: 'button', class: ['arr-tile', 'arr-tile-all', { 'is-on': !ui.status }], testid: 'arr-tile-all',
      attrs: { 'aria-pressed': !ui.status ? 'true' : 'false' }, on: { click: () => setStatus('') },
    }, h('span', { class: 'arr-tile-label' }, 'All'), h('span', { class: 'arr-tile-count num' }, String(all.length))),
    STATUSES.map((st) => h('button', {
      type: 'button', class: ['arr-tile', `tone-${ctx.format.STATUS_TONE[st] || 'neutral'}`, { 'is-on': ui.status === st }], testid: `arr-tile-${st}`,
      attrs: { 'aria-pressed': ui.status === st ? 'true' : 'false' }, on: { click: () => setStatus(ui.status === st ? '' : st) },
    }, h('span', { class: 'arr-tile-label' }, h('span', { class: 'arr-tile-dot', attrs: { 'aria-hidden': 'true' } }), k.humanize(st)), h('span', { class: 'arr-tile-count num' }, String(counts[st] || 0)))));

  const filters = k.filterBar({
    testid: 'arr-filter',
    values: { q: ui.q, portfolioId: ui.portfolioId },
    fields: [
      { type: 'text', name: 'q', label: 'Search', placeholder: 'Borrower, reference or arrangement ID', wide: true },
      { type: 'select', name: 'portfolioId', label: 'Portfolio', allLabel: 'All portfolios', options: Object.values(s.portfolios).map((p) => ({ value: p.id, label: p.name })) },
    ],
    onApply: (v) => { ui.q = v.q; ui.portfolioId = v.portfolioId; ctx.rerender(); },
    onReset: () => { ui.q = ''; ui.portfolioId = ''; ui.status = ''; ctx.rerender(); },
  });

  const tbl = k.table({
    testid: 'arr-table', stateKey: 'arr.list', caption: 'Arrangements',
    rows,
    rowTestid: (r) => `arr-row-${r.id}`,
    onRowClick: (r) => ctx.router.go(`#/m/arrangements/${r.id}`),
    empty: 'No arrangements match these filters.',
    columns: [
      { key: 'id', label: 'Arrangement', render: (r) => h('span', { class: 'arr-idcell' }, h('a', { href: `#/m/arrangements/${r.id}`, class: 'arr-id' }, ctx.format.arrangementRef(r.id)), r.version > 1 ? k.tag(`v${r.version}`, { tone: 'info' }) : null) },
      { key: 'name', label: 'Borrower', render: (r) => h('div', { class: 'cell-2' }, h('strong', {}, r.name), h('span', { class: 'cell-sub num' }, r.ref)) },
      { key: 'portfolio', label: 'Portfolio' },
      { key: 'total', label: 'Total', align: 'right', render: (r) => k.money(r.total) },
      {
        key: 'paidCount', label: 'Progress', sortValue: (r) => (r.count ? r.paidCount / r.count : 0),
        render: (r) => h('div', { class: 'arr-prog' }, k.progress({ value: r.paidCount, max: r.count, label: `${r.paidCount} of ${r.count} installments paid`, tone: r.status === 'completed' ? 'ok' : r.status === 'defaulted' ? 'danger' : 'brand' }),
          h('span', { class: 'cell-sub num' }, `${r.paidCount} of ${r.count} paid`)),
      },
      {
        key: 'nextDue', label: 'Next due',
        render: (r) => (r.nextDue && IN_PROGRESS.includes(r.status) ? h('div', { class: 'cell-2' }, h('span', { class: 'num' }, k.fmtDate(r.nextDue)), r.nextStatus === 'overdue' ? k.chip('overdue', { size: 'sm' }) : null) : '—'),
      },
      { key: 'status', label: 'Status', render: (r) => k.chip(r.status) },
    ],
  });

  return h('div', { class: 'page page-arrangements' },
    k.pageHeader({
      eyebrow: 'Collections',
      title: 'Arrangements',
      subtitle: 'Payment plans agreed with borrowers: equal monthly installments, approval by a Supervisor, and every version kept.',
      actions: k.permBtn(ctx, 'arrangement.draft', 'New arrangement', { variant: 'primary', icon: 'plus', testid: 'arr-new', onClick: () => ctx.router.go('#/m/arrangements/new') }),
    }),
    tiles,
    filters,
    tbl);
}

// ------------------------------------------------------------------------------------------
// Create

function eligibleAccounts(ctx, s) {
  return Object.values(s.accounts).filter((a) => {
    if (CLOSED_ACCOUNT.includes(a.status) || a.status === 'disputed') return false;
    const cur = ctx.selectors.currentArrangement(s, a.id);
    return !(cur && IN_PROGRESS.includes(cur.status));
  }).sort((a, b) => ctx.kit.borrowerName(a).localeCompare(ctx.kit.borrowerName(b)));
}

function schedulePreview(ctx, terms, { carried = [], testid = 'arr-preview' } = {}) {
  const k = ctx.kit;
  const { h } = k;
  const sched = ctx.actions.previewSchedule(terms);
  if (!sched.length) {
    return h('div', { testid, class: 'arr-preview-empty' },
      k.emptyState('Enter a total above zero, 1 to 60 installments and a first due date from today to see the schedule.', { title: 'No schedule yet', icon: 'arrangements', testid: `${testid}-empty` }));
  }
  const sum = sched.reduce((acc, x) => acc + x.amount, 0);
  const first = sched[0].amount;
  const last = sched[sched.length - 1].amount;
  const rows = [
    ...carried.map((c) => ({ ...c, carried: true })),
    ...sched.map((x) => ({ ...x, seq: x.seq + carried.length })),
  ];
  return h('div', { testid, class: 'arr-preview' },
    h('div', { class: 'arr-preview-sum' },
      h('div', {}, h('span', { class: 'arr-preview-big num' }, `${sched.length} × ${k.formatPHP(first)}`), h('span', { class: 'cell-sub' }, ' monthly')),
      last !== first ? h('div', { class: 'cell-sub' }, `The last installment is ${k.formatPHP(last)}: it absorbs the centavo rounding (V3 §7).`) : null),
    k.table({
      testid: `${testid}-table`, dense: true, pageSize: 60, caption: 'Schedule preview',
      rows,
      columns: [
        { key: 'seq', label: '#', sortable: false, render: (r) => h('span', { class: 'num' }, String(r.seq)) },
        { key: 'dueDate', label: 'Due date', sortable: false, render: (r) => h('span', { class: 'num' }, k.fmtDate(r.dueDate)) },
        { key: 'amount', label: 'Amount', align: 'right', sortable: false, render: (r) => k.money(r.amount) },
        carried.length ? { key: 'carried', label: 'Note', sortable: false, render: (r) => (r.carried ? k.chip('paid', { label: 'Paid — carries over', size: 'sm' }) : h('span', { class: 'cell-sub' }, 'New installment')) } : null,
      ].filter(Boolean),
    }),
    h('div', { class: 'arr-preview-check', testid: `${testid}-total` },
      h('span', {}, carried.length ? 'New installments total' : 'Schedule total'),
      h('strong', { class: 'num' }, k.formatPHP(sum))));
}

function createPage(ctx, query) {
  const k = ctx.kit;
  const { h } = k;
  const s = ctx.store.get();
  const role = s.role;
  const accountId = query.account || '';
  const acc = accountId ? s.accounts[accountId] : null;

  const head = k.pageHeader({
    crumbs: [{ label: 'Arrangements', href: '#/m/arrangements' }, { label: 'New arrangement' }],
    eyebrow: 'Collections',
    title: 'New arrangement',
    subtitle: 'Equal monthly installments; the schedule is generated for you and always adds up to the agreed total.',
  });

  // Account picker (when opened without ?account=).
  const eligible = eligibleAccounts(ctx, s);
  const picker = k.field({
    label: 'Account',
    hint: `${eligible.length} accounts can take a new arrangement (no plan in progress, not disputed or closed).`,
    control: k.select({
      testid: 'arr-new-account',
      value: acc ? accountId : '',
      options: [{ value: '', label: 'Choose an account…' }, ...(acc && !eligible.includes(acc) ? [{ value: acc.id, label: `${k.borrowerName(acc)} · ${acc.ref}` }] : []),
        ...eligible.map((a) => ({ value: a.id, label: `${k.borrowerName(a)} · ${a.ref} · ${s.portfolios[a.portfolioId]?.name ?? ''}` }))],
      on: { change: (e) => { if (e.target.value) ctx.router.go(`#/m/arrangements/new?account=${encodeURIComponent(e.target.value)}`); } },
    }),
  });

  if (!acc) {
    return h('div', { class: 'page page-arrangements' }, head,
      k.card({
        title: 'Choose the account', eyebrow: 'Step 1',
        body: [accountId ? k.notice(`No account with ID ${accountId}.`, { tone: 'warn' }) : null, h('div', { class: 'arr-picker' }, picker)],
      }));
  }

  const bal = ctx.selectors.accountBalance(s, acc.id);
  const pf = s.portfolios[acc.portfolioId];
  const cr = s.creditors[acc.creditorId];
  const cur = ctx.selectors.currentArrangement(s, acc.id);
  const accountCard = k.card({
    title: k.borrowerName(acc), eyebrow: 'Account', testid: 'arr-new-accountcard',
    actions: k.link('Open account', `#/m/accounts/${acc.id}`, { testid: 'arr-new-open-account' }),
    body: k.dl([
      ['Reference', h('span', { class: 'num' }, acc.ref)],
      ['Status', k.chip(acc.status)],
      ['Creditor', cr?.name ?? '—'],
      ['Portfolio', pf?.name ?? '—'],
      ['Placed balance', k.money(bal.placed)],
      ['Paid to date', k.money(bal.paid)],
      ...(bal.discount > 0 ? [['Settlement discount', h('span', { class: 'num', testid: 'arr-new-discount' }, `\u2212${k.formatPHP(bal.discount)}`)]] : []),
      ...(bal.credit > 0 ? [['Unapplied credit', k.money(bal.credit)]] : []),
      ['Current balance', k.money(bal.current)],
      ['Mobile', k.maskMobile(acc.borrower.mobile)],
      ['Assignee', acc.assigneeId ? who(ctx, s, acc.assigneeId) : 'Unassigned'],
    ], { cols: 2 }),
  });

  let blocker = null;
  if (CLOSED_ACCOUNT.includes(acc.status)) blocker = k.notice('This account is closed, so it cannot take a new arrangement.', { tone: 'neutral', title: 'Account closed', testid: 'arr-new-blocked' });
  else if (acc.status === 'disputed') blocker = k.notice('The borrower disputes this debt. Collection is paused until a Supervisor resolves the dispute (V3 §6).', { tone: 'warn', title: 'Account disputed', testid: 'arr-new-blocked' });
  else if (cur && IN_PROGRESS.includes(cur.status)) {
    blocker = k.notice(h('span', {}, 'This account already has an arrangement in progress. To change the terms, revise it instead. ', k.link(`Open ${ctx.format.arrangementRef(cur.id)}`, `#/m/arrangements/${cur.id}`, { testid: 'arr-new-existing' })),
      { tone: 'info', title: 'Arrangement in progress', testid: 'arr-new-blocked' });
  }
  if (blocker) {
    return h('div', { class: 'page page-arrangements' }, head,
      h('div', { class: 'arr-layout' }, h('div', { class: 'stack' }, blocker, k.card({ title: 'Choose another account', body: h('div', { class: 'arr-picker' }, picker) })), accountCard));
  }

  const f = k.memo(`arr.new.${acc.id}`, () => ({ total: pesosInput(bal.current > 0 ? bal.current : acc.placedBalance), count: '6', firstDue: ctx.clock.addDays(ctx.clock.DEMO_TODAY, 14).slice(0, 10), error: null }));
  const terms = () => ({ total: ctx.money.parsePesos(f.total), count: Number.parseInt(f.count, 10), firstDue: f.firstDue });

  const previewSlot = h('div', { class: 'arr-preview-slot' });
  const drawPreview = () => previewSlot.replaceChildren(schedulePreview(ctx, terms()));
  drawPreview();

  const bind = (key) => ({ input: (e) => { f[key] = e.target.value; f.error = null; drawPreview(); }, change: (e) => { f[key] = e.target.value; drawPreview(); } });
  const totalIn = selectAllOnFocus(k.input({ testid: 'arr-new-total', value: f.total, attrs: { inputmode: 'decimal', autocomplete: 'off' }, placeholder: '0.00', on: bind('total') }));
  const countIn = selectAllOnFocus(k.input({ type: 'number', testid: 'arr-new-count', value: f.count, attrs: { min: 1, max: 60, step: 1 }, on: bind('count') }));
  const dueIn = k.input({ type: 'date', testid: 'arr-new-firstdue', value: f.firstDue, attrs: { min: ctx.clock.DEMO_TODAY }, on: bind('firstDue') });
  const freq = k.select({ testid: 'arr-new-frequency', value: 'monthly', options: [{ value: 'monthly', label: 'Monthly' }], disabled: true });

  const submitLabel = role === 'agent' ? 'Submit for approval' : 'Create arrangement';
  const submit = k.permBtn(ctx, 'arrangement.draft', submitLabel, {
    variant: 'primary', icon: 'check', testid: 'arr-create-submit',
    onClick: () => {
      const res = ctx.actions.createArrangement(ctx.store, acc.id, terms());
      if (!res.ok) {
        f.error = res.message;
        ctx.rerender();
        return;
      }
      f.error = null;
      k.toast(res.status === 'pending_approval' ? 'Arrangement sent to a Supervisor for approval.' : 'Arrangement active. The borrower link and the first payment request are ready.', { kind: 'ok', testid: 'arr-toast' });
      ctx.router.go(`#/m/arrangements/${res.arrangementId}`);
    },
  });

  const routeNote = role === 'agent'
    ? k.notice('As an Agent, this goes to a Supervisor for approval before the borrower can pay. Whether approval is always needed is open: Q-09.', { tone: 'brand', title: 'Needs approval', testid: 'arr-new-route' })
    : k.notice('As Admin or Supervisor, the arrangement activates now: the borrower link and the first payment request are created.', { tone: 'info', title: 'Activates on create', testid: 'arr-new-route' });

  const form = k.card({
    title: 'Terms', eyebrow: 'Step 2',
    body: [
      h('div', { class: 'arr-form-grid' },
        k.field({ label: 'Total to collect (₱)', control: totalIn, required: true, hint: `Current balance ${k.formatPHP(bal.current)}` }),
        k.field({ label: 'Installments', control: countIn, required: true, hint: '1 to 60' }),
        k.field({ label: 'Frequency', control: freq, hint: h('span', { class: 'qline' }, 'Other plan types are open', k.qtag('Q-07')) }),
        k.field({ label: 'First due date', control: dueIn, required: true, hint: `Today is ${k.fmtDate(ctx.clock.DEMO_TODAY)}` })),
      f.error ? k.notice(f.error, { tone: 'danger', title: 'Check the terms', testid: 'arr-new-error' }) : null,
      routeNote,
      h('div', { class: 'arr-form-actions' }, k.btn('Cancel', { variant: 'ghost', onClick: () => ctx.router.go(`#/m/accounts/${acc.id}`) }), submit),
    ],
  });

  return h('div', { class: 'page page-arrangements' }, head,
    h('div', { class: 'arr-layout' },
      h('div', { class: 'stack' }, form, k.card({ title: 'Schedule preview', eyebrow: 'Live', body: previewSlot })),
      h('div', { class: 'stack' }, accountCard, k.card({ title: 'Choose another account', body: h('div', { class: 'arr-picker' }, picker) }))));
}

// ------------------------------------------------------------------------------------------
// Detail

function detailPage(ctx, id) {
  const k = ctx.kit;
  const { h } = k;
  const s = ctx.store.get();
  const a = s.arrangements[id];
  if (!a) {
    return h('div', { class: 'page page-arrangements' },
      k.pageHeader({ crumbs: [{ label: 'Arrangements', href: '#/m/arrangements' }, { label: id }], eyebrow: 'Collections', title: 'Arrangement not found' }),
      k.card({ body: k.emptyState(`There is no arrangement with ID ${id}. It may have been removed by Reset demo.`, { title: 'Not found', action: k.btn('All arrangements', { variant: 'primary', onClick: () => ctx.router.go('#/m/arrangements') }) }) }));
  }
  const acc = s.accounts[a.accountId];
  const pf = s.portfolios[acc?.portfolioId];
  const cr = s.creditors[acc?.creditorId];
  const pr = ctx.selectors.arrangementProgress(s, a.id);
  const insts = ctx.selectors.installmentsOf(s, a.id);
  const token = lineageToken(s, a.lineageId);
  const openReq = ctx.selectors.currentOpenRequest(s, a.id);
  const versions = Object.values(s.arrangements).filter((x) => x.lineageId === a.lineageId).sort((x, y) => y.version - x.version);
  const latest = versions.find((x) => x.status !== 'superseded');

  // ---- actions (status-applicable; permission via permBtn) ----
  const acts = [];
  if (a.status === 'draft') acts.push(k.permBtn(ctx, 'arrangement.draft', 'Submit for approval', { variant: 'primary', icon: 'arrowRight', testid: 'arr-submit', onClick: () => run(ctx, () => ctx.actions.submitArrangement(ctx.store, a.id), 'Sent to a Supervisor for approval.') }));
  if (a.status === 'pending_approval') {
    acts.push(k.permBtn(ctx, 'arrangement.approve', 'Approve', { variant: 'primary', icon: 'check', testid: 'arr-approve', onClick: () => run(ctx, () => ctx.actions.approveArrangement(ctx.store, a.id), 'Arrangement approved. The borrower link and first payment request are ready.') }));
    acts.push(k.permBtn(ctx, 'arrangement.approve', 'Reject', { variant: 'secondary', icon: 'x', testid: 'arr-reject', onClick: () => openReject(ctx, a) }));
  }
  if (['active', 'partially_paid', 'defaulted'].includes(a.status)) acts.push(k.permBtn(ctx, 'arrangement.revise', 'Revise', { variant: 'primary', icon: 'refresh', testid: 'arr-revise', onClick: () => openRevise(ctx, a) }));
  if (['draft', 'pending_approval', 'active', 'partially_paid', 'defaulted'].includes(a.status)) acts.push(k.permBtn(ctx, 'arrangement.cancel', 'Cancel arrangement', { variant: 'danger', testid: 'arr-cancel', onClick: () => openCancel(ctx, a) }));

  const head = k.pageHeader({
    crumbs: [{ label: 'Arrangements', href: '#/m/arrangements' }, { label: ctx.format.arrangementRef(a.id) }],
    eyebrow: `Arrangement ${ctx.format.arrangementRef(a.id)} · version ${a.version}`,
    title: k.borrowerName(acc),
    subtitle: [acc?.ref, cr?.name, pf?.name].filter(Boolean).join(' · '),
    meta: [k.chip(a.status, { testid: 'arr-status', size: 'lg' }), token ? k.chip(token.status, { label: `Link ${token.status}`, testid: 'arr-link-status' }) : k.tag('No link yet', { tone: 'neutral' })],
    actions: acts.length ? acts : null,
  });

  // ---- status notices ----
  let statusNote = null;
  if (a.status === 'pending_approval') statusNote = k.notice('This plan is waiting for a Supervisor. The borrower cannot pay until it is approved. An agent cannot approve their own arrangement (C7).', { tone: 'brand', title: 'Pending approval', testid: 'arr-note' });
  else if (a.status === 'draft') {
    const rej = [...(a.history || [])].reverse().find((x) => x.action === 'rejected');
    statusNote = k.notice(rej ? `Returned by ${who(ctx, s, rej.by)}: “${rej.note}”. Adjust the terms with the borrower, then submit again.` : 'Draft — not yet submitted for approval.', { tone: rej ? 'warn' : 'neutral', title: 'Draft', testid: 'arr-note' });
  } else if (a.status === 'superseded' && latest) statusNote = k.notice(h('span', {}, 'A newer version replaced this one. Payments made carried over. ', k.link(`Open current version (v${latest.version})`, `#/m/arrangements/${latest.id}`, { testid: 'arr-latest' })), { tone: 'neutral', title: 'Superseded', testid: 'arr-note' });
  else if (a.status === 'cancelled') statusNote = k.notice('Cancelled: the borrower link was revoked and open requests were cancelled. Payments already made stay posted.', { tone: 'neutral', title: 'Cancelled', testid: 'arr-note' });
  else if (a.status === 'defaulted') statusNote = k.notice('Two installments were missed, so this plan defaulted and the account went back to the agent queue (V3 §12). A Supervisor can revise it.', { tone: 'danger', title: 'Defaulted', testid: 'arr-note' });
  else if (a.status === 'completed') statusNote = k.notice('Every installment is verified as paid. The account is settled.', { tone: 'ok', title: 'Completed', testid: 'arr-note' });

  // ---- summary ----
  const summary = k.card({
    testid: 'arr-summary',
    body: [
      h('div', { class: 'arr-kpis' },
        k.kpi({ label: 'Total', value: k.formatPHP(a.total), sub: `${a.count} monthly installments`, tone: 'brand', testid: 'arr-kpi-total' }),
        k.kpi({ label: 'Paid to date', value: k.formatPHP(pr.paid), sub: `${pr.paidCount} of ${pr.count} installments`, tone: 'ok', testid: 'arr-kpi-paid' }),
        k.kpi({ label: 'Remaining', value: k.formatPHP(pr.remaining), sub: pr.remaining > 0 ? 'Still to collect' : 'Nothing left to pay', tone: 'info', testid: 'arr-kpi-remaining' }),
        k.kpi({ label: 'Next due', value: pr.next && IN_PROGRESS.includes(a.status) ? k.fmtDate(pr.next.dueDate) : '—', sub: pr.next && IN_PROGRESS.includes(a.status) ? `Installment ${pr.next.seq} · ${k.formatPHP(pr.next.amount)}${pr.next.status === 'overdue' ? ' · overdue' : ''}` : 'No installment due', tone: pr.next?.status === 'overdue' ? 'warn' : 'neutral', testid: 'arr-kpi-next' })),
      k.progress({ value: pr.paid, max: a.total, label: `${k.formatPHP(pr.paid)} paid of ${k.formatPHP(a.total)}`, tone: a.status === 'completed' ? 'ok' : 'brand', testid: 'arr-progress' }),
      h('div', { class: 'arr-progress-cap cell-sub num' }, `${k.formatPHP(pr.paid)} paid of ${k.formatPHP(a.total)}`),
    ],
  });

  // ---- schedule ----
  const schedule = k.card({
    title: 'Installment schedule', eyebrow: 'Schedule', flush: true, testid: 'arr-schedule',
    body: k.table({
      testid: 'arr-schedule-table', pageSize: 60, caption: 'Installment schedule',
      rows: insts,
      rowTestid: (r) => `arr-inst-${r.seq}`,
      columns: [
        { key: 'seq', label: '#', render: (r) => h('span', { class: 'num' }, String(r.seq)) },
        { key: 'dueDate', label: 'Due date', render: (r) => h('span', { class: 'num' }, k.fmtDate(r.dueDate)) },
        { key: 'amount', label: 'Amount', align: 'right', render: (r) => k.money(r.amount) },
        { key: 'status', label: 'Status', render: (r) => k.chip(r.status) },
        {
          key: 'paidAt', label: 'Payment',
          render: (r) => {
            if (!r.paidAt) return null;
            const p = r.paymentId ? s.payments[r.paymentId] : null;
            return h('div', { class: 'cell-2' },
              p ? k.link(p.attemptId, `#/m/transactions/${p.attemptId}`) : h('span', { class: 'cell-sub' }, r.carriedFrom ? 'Carried over' : 'Paid'),
              h('span', { class: 'cell-sub num', attrs: { title: k.fmtDateTime(r.paidAt) } }, `Verified ${k.fmtDate(r.paidAt)}`));
          },
        },
      ],
    }),
  });

  // ---- attachments ----
  const lineageIds = new Set(versions.map((x) => x.id));
  const files = Object.values(s.attachments).filter((x) => lineageIds.has(x.arrangementId)).sort((x, y) => (x.at < y.at ? 1 : -1));
  const fileInput = h('input', {
    type: 'file', class: 'sr-only', testid: 'attachment-input', attrs: { 'aria-label': 'Choose a contract or agreement file', tabindex: '-1' },
    on: {
      change: (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const res = ctx.actions.addAttachment(ctx.store, a.id, { filename: file.name, size: file.size });
        e.target.value = '';
        if (!res.ok) { k.toast(res.message, { kind: 'danger', testid: 'arr-toast' }); return; }
        k.toast(`${file.name} uploaded as version ${res.version}.`, { kind: 'ok', testid: 'arr-toast' });
        ctx.rerender();
      },
    },
  });
  const uploadBtn = k.permBtn(ctx, 'attachment.upload', 'Upload file', { variant: 'secondary', size: 'sm', icon: 'upload', testid: 'attachment-upload', onClick: () => fileInput.click() });
  const attachments = k.card({
    title: 'Contract / agreement files', eyebrow: 'Attachments', testid: 'arr-attachments', flush: true,
    actions: [uploadBtn, fileInput],
    body: [
      k.table({
        testid: 'attachments-table', pageSize: 10, caption: 'Attachments',
        rows: files,
        empty: 'No files yet. Upload the signed agreement (PDF preferred).',
        columns: [
          { key: 'filename', label: 'File', render: (r) => h('span', { class: 'arr-file' }, k.icon('file', { size: 16 }), h('span', {}, r.filename)) },
          { key: 'version', label: 'Version', render: (r) => k.tag(`v${r.version}`, { tone: r.version > 1 ? 'info' : 'neutral' }) },
          { key: 'size', label: 'Size', align: 'right', render: (r) => h('span', { class: 'num' }, fmtSize(r.size)) },
          { key: 'uploader', label: 'Uploaded by' },
          { key: 'at', label: 'Uploaded', render: (r) => h('span', { class: 'num' }, k.fmtDateTime(r.at)) },
        ],
      }),
      h('p', { class: 'arr-foot-note' }, 'Re-uploading the same file name adds a new version; nothing is overwritten. The demo keeps the name and size only. ', k.qtag('Q-08', 'File types, size and retention:', { tone: 'brand' })),
    ],
  });

  // ---- side: terms, versions, history ----
  const terms = k.card({
    title: 'Terms', eyebrow: 'Record', testid: 'arr-terms',
    body: k.dl([
      ['Account', acc ? k.link(`${k.borrowerName(acc)} · ${acc.ref}`, `#/m/accounts/${acc.id}`, { testid: 'arr-account-link' }) : '—'],
      ['Creditor', cr ? k.link(cr.name, `#/m/creditors/${cr.id}`) : '—'],
      ['Portfolio', pf ? k.link(pf.name, `#/m/portfolios/${pf.id}`) : '—'],
      ['Plan', `${a.count} × monthly, from ${k.fmtDate(a.firstDue)}`],
      ['Created', `${k.fmtDateTime(a.createdAt)} · ${who(ctx, s, a.createdBy)}`],
      ['Approved by', a.approvedBy ? who(ctx, s, a.approvedBy) : 'Not yet'],
      ['Borrower link', token ? h('span', { class: 'qline' }, k.chip(token.status), h('span', { class: 'cell-sub' }, 'Same link across every version')) : 'Created on approval'],
      ['Open payment request', openReq ? k.link(openReq.id, `#/m/requests/${openReq.id}`, { testid: 'arr-open-request' }) : 'None'],
    ], { cols: 1 }),
  });

  const versionsCard = k.card({
    title: 'Versions', eyebrow: 'Lineage', testid: 'arr-versions',
    body: h('ol', { class: 'arr-versions' }, versions.map((v) => h('li', { class: ['arr-version', { 'is-current': v.id === a.id }] },
      h('a', { href: `#/m/arrangements/${v.id}`, class: 'arr-version-link', attrs: { 'aria-current': v.id === a.id ? 'page' : null } },
        h('strong', {}, `v${v.version}`), h('span', { class: 'num' }, `${k.formatPHP(v.total)} · ${v.count} inst.`)),
      k.chip(v.status, { size: 'sm' })))),
  });

  const hist = [];
  for (const v of versions) {
    for (const e of v.history || []) {
      hist.push({ at: e.at, kind: 'history', title: `${HISTORY_TITLES[e.action] || k.humanize(e.action)}${versions.length > 1 ? ` (v${v.version})` : ''}`, detail: [`by ${who(ctx, s, e.by)}`, e.note].filter(Boolean).join(' · '), tone: HISTORY_TONES[e.action] || 'neutral' });
    }
  }
  hist.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));
  const history = k.card({ title: 'Approval history', eyebrow: 'Audit', testid: 'arr-history', body: k.timeline(hist, { testid: 'arr-history-list', empty: 'No approval events yet.' }) });

  return h('div', { class: 'page page-arrangements', testid: 'arr-detail', dataset: { status: a.status } },
    head,
    h('div', { class: 'arr-layout' },
      h('div', { class: 'stack' }, statusNote, summary, schedule, attachments),
      h('div', { class: 'stack' }, terms, versionsCard, history)));
}

function fmtSize(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Runs an action, toasts the result, re-renders. */
function run(ctx, fn, okText) {
  const res = fn();
  if (res.ok) ctx.kit.toast(okText, { kind: 'ok', testid: 'arr-toast' });
  else ctx.kit.toast(res.message || 'That did not work.', { kind: 'danger', testid: 'arr-toast' });
  ctx.rerender();
  return res;
}

function openReject(ctx, a) {
  const k = ctx.kit;
  const { h } = k;
  const reason = k.textarea({ testid: 'arr-reject-reason', rows: 3, placeholder: 'e.g. First due date is before the borrower’s payday — move it to the 15th.' });
  const errSlot = h('div', {});
  k.modal({
    title: 'Reject arrangement', eyebrow: ctx.format.arrangementRef(a.id), testid: 'arr-reject-modal', size: 'sm',
    body: [h('p', {}, 'The plan goes back to the agent as a draft. Tell them what to change.'), k.field({ label: 'Reason', control: reason, required: true }), errSlot],
    actions: (api) => [
      k.btn('Keep pending', { variant: 'ghost', onClick: () => api.close() }),
      k.btn('Reject', {
        variant: 'danger', testid: 'arr-reject-confirm',
        onClick: () => {
          const res = ctx.actions.rejectArrangement(ctx.store, a.id, reason.value);
          if (!res.ok) { errSlot.replaceChildren(k.notice(res.message, { tone: 'danger', testid: 'arr-reject-error' })); reason.focus(); return; }
          api.close();
          k.toast('Returned to the agent as a draft.', { kind: 'ok', testid: 'arr-toast' });
          ctx.rerender();
        },
      }),
    ],
  }).open();
}

function openCancel(ctx, a) {
  ctx.kit.confirmDialog({
    title: 'Cancel this arrangement?',
    testid: 'arr-cancel-confirm',
    message: 'The borrower’s link stops working and open payment requests are cancelled. Payments already made stay posted. This cannot be undone.',
    confirmLabel: 'Cancel arrangement', cancelLabel: 'Keep it', variant: 'danger',
    onConfirm: () => run(ctx, () => ctx.actions.cancelArrangement(ctx.store, a.id), 'Arrangement cancelled. The borrower link is revoked.'),
  });
}

function openRevise(ctx, a) {
  const k = ctx.kit;
  const { h } = k;
  const s = ctx.store.get();
  const insts = ctx.selectors.installmentsOf(s, a.id);
  const paidInsts = insts.filter((i) => i.status === 'paid');
  const paid = paidInsts.reduce((sum, i) => sum + i.amount, 0);
  const unpaid = insts.filter((i) => ['scheduled', 'due', 'overdue', 'missed'].includes(i.status));
  const nextDue = unpaid.find((i) => i.dueDate >= ctx.clock.DEMO_TODAY)?.dueDate || ctx.clock.addDays(ctx.clock.DEMO_TODAY, 14).slice(0, 10);
  const f = { total: pesosInput(a.total), count: String(Math.max(1, unpaid.length)), firstDue: nextDue };
  const carried = paidInsts.map((i) => ({ seq: i.seq, dueDate: i.dueDate, amount: i.amount }));
  const terms = () => {
    const total = ctx.money.parsePesos(f.total);
    return { total, count: Number.parseInt(f.count, 10), firstDue: f.firstDue, remainder: Number.isInteger(total) ? total - paid : null };
  };
  const preview = h('div', {});
  const draw = () => {
    const t = terms();
    preview.replaceChildren(t.remainder !== null && t.remainder > 0
      ? schedulePreview(ctx, { total: t.remainder, count: t.count, firstDue: t.firstDue }, { carried, testid: 'arr-revise-preview' })
      : k.notice(`The new total must be more than the ${k.formatPHP(paid)} already paid.`, { tone: 'warn', testid: 'arr-revise-preview-empty' }));
  };
  const on = (key) => ({ input: (e) => { f[key] = e.target.value; draw(); }, change: (e) => { f[key] = e.target.value; draw(); } });
  const totalIn = selectAllOnFocus(k.input({ testid: 'arr-revise-total', value: f.total, attrs: { inputmode: 'decimal' }, on: on('total') }));
  const countIn = selectAllOnFocus(k.input({ type: 'number', testid: 'arr-revise-count', value: f.count, attrs: { min: 1, max: 60 }, on: on('count') }));
  const dueIn = k.input({ type: 'date', testid: 'arr-revise-firstdue', value: f.firstDue, attrs: { min: ctx.clock.DEMO_TODAY }, on: on('firstDue') });
  const errSlot = h('div', {});
  draw();
  k.modal({
    title: 'Revise arrangement', eyebrow: `${ctx.format.arrangementRef(a.id)} · v${a.version} → v${a.version + 1}`, testid: 'arr-revise-modal', size: 'lg',
    body: [
      k.notice(`A new version is created and this one becomes Superseded. Open requests and any pending checkout are cancelled. ${paidInsts.length ? `${paidInsts.length} paid installment${paidInsts.length > 1 ? 's' : ''} (${k.formatPHP(paid)}) carry over. ` : ''}The borrower keeps the same link and sees the new amount.`, { tone: 'info', title: 'What changes' }),
      h('div', { class: 'arr-form-grid arr-form-grid-3' },
        k.field({ label: 'New total commitment (₱)', control: totalIn, required: true, hint: `Includes the ${k.formatPHP(paid)} already paid` }),
        k.field({ label: 'Remaining installments', control: countIn, required: true, hint: '1 to 60' }),
        k.field({ label: 'Next due date', control: dueIn, required: true })),
      preview,
      errSlot,
    ],
    actions: (api) => [
      k.btn('Keep current terms', { variant: 'ghost', onClick: () => api.close() }),
      k.btn('Create new version', {
        variant: 'primary', icon: 'check', testid: 'arr-revise-confirm',
        onClick: () => {
          const t = terms();
          const res = ctx.actions.reviseArrangement(ctx.store, a.id, { total: t.total, count: t.count, firstDue: t.firstDue });
          if (!res.ok) { errSlot.replaceChildren(k.notice(res.message, { tone: 'danger', testid: 'arr-revise-error' })); return; }
          api.close();
          k.toast(`Version ${a.version + 1} is active. Same borrower link, new amount due.`, { kind: 'ok', testid: 'arr-toast' });
          ctx.router.go(`#/m/arrangements/${res.arrangementId}`);
        },
      }),
    ],
  }).open();
}
