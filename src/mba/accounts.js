// Accounts (MBA view, D§7.4): the list with search + filters, and the account detail — the agent
// workspace. Header, six tabs (Overview, Contact attempts, Arrangement, Payment requests,
// Transactions, Audit) and the account actions. Send payment link (D§7.4, C11, C14): channel →
// preview (no creditor, no amount) with a real QR → send → "Open as borrower".
// Every change goes through a core action (permission re-checked there); results show as toasts.
import { renderMbaLayout } from './layout.js';
import {
  h, btn, permBtn, card, table, filterBar, pageHeader, chip, tag, qtag, emptyState, toast, memo, icon,
  tabs, dl, progress, notice, field, input, select, textarea, modal, confirmDialog, closeAllModals,
  timeline, qrSvg, segmented, formatPHP, fmtDate, fmtDateTime, humanize, borrowerName,
  maskMobile, maskEmail, maskTail,
} from '../ui/kit.js';
import { ROLE_LABELS } from '../core/permissions.js';
import { isMidnight } from '../ui/look.js';
import { reduced } from '../ui/fx.js';

// =============================================================================================
// Midnight look (2026-11-26) — small helpers shared by the record screens (accounts,
// arrangements, creditors, portfolios, settings). Classic never reaches them: every caller checks
// isMidnight() first; their styles live in styles/midnight-mba-records.css under
// html[data-look="midnight"]. Figures always end on exactly the text the Classic look shows.

const introSeen = new WeakSet();
/**
 * True for the first render of a route visit in Midnight. Any store change re-renders the whole
 * page, so entrances and count-ups run once per visit: a tab, a filter or a role switch never
 * replays them. (router.current() is a new object per hash change, the same one per re-render.)
 */
export function mnrIntro(ctx) {
  const r = ctx.route;
  if (!isMidnight() || !r || introSeen.has(r)) return false;
  introSeen.add(r);
  return true;
}

/** Staggered rise with the motion kit's classes (fx.css), started now rather than on scroll so
 *  nothing below the fold is left waiting. Calm under reduced motion (fx.css + motion.css). */
export function mnrRise(els, { step = 45, base = 0 } = {}) {
  [...els].filter(Boolean).forEach((el, i) => {
    el.style.setProperty('--fx-i', String(i));
    el.style.setProperty('--fx-step', `${step}ms`);
    el.style.setProperty('--fx-base', `${base}ms`);
    el.classList.add('fx-rise', 'fx-on');
  });
  return els;
}

/**
 * Eases paint(0 → 1) from now (+delay). Unlike fx.countUp it does not wait for the element to
 * scroll into view, so a figure below the fold is already final when the user gets there (and in
 * full-page captures). paint(1) is always the last call; reduced motion paints 1 at once.
 */
function tween(paint, { duration = 1100, delay = 0 } = {}) {
  if (reduced() || typeof requestAnimationFrame !== 'function') { paint(1); return; }
  paint(0);
  const t0 = performance.now() + delay;
  const step = (now) => {
    const t = Math.max(0, Math.min(1, (now - t0) / duration));
    paint(t >= 1 ? 1 : 1 - 2 ** (-10 * t)); // ease-out expo, as fx.js
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * An oversized peso figure split for styling (₱ · whole · .cents, fx.money's markup). It counts up
 * when `animate` (first render of a visit) and always ends on exactly formatPHP(centavos).
 * `hidden` marks a visual copy of a value that is also in the page as text.
 */
export function mnrMoney(centavos, { animate = false, delay = 0, cls = '', hidden = false } = {}) {
  const v = Math.round(Number(centavos) || 0);
  if (v < 0) return h('span', { class: ['mc', 'mnr-mc', cls] }, formatPHP(v));
  const whole = h('span', { class: 'mc-whole' });
  const cents = h('span', { class: 'mc-cents' });
  const el = h('span', { class: ['mc', 'mnr-mc', cls], attrs: { 'aria-label': hidden ? null : formatPHP(v), 'aria-hidden': hidden ? 'true' : null } },
    h('span', { class: 'mc-sign' }, '₱'), whole, cents);
  const paint = (k) => {
    const c = k >= 1 ? v : Math.round(v * k);
    whole.textContent = Math.floor(c / 100).toLocaleString('en-US');
    cents.textContent = `.${String(c % 100).padStart(2, '0')}`;
  };
  if (animate) tween(paint, { delay }); else paint(1);
  return el;
}

/** A count or percentage that counts up on the first render of a visit; ends on format(value). */
export function mnrNum(value, format, { animate = false, delay = 0, cls = '' } = {}) {
  const el = h('span', { class: ['mnr-num', cls] }, format(value));
  if (animate) tween((k) => { el.textContent = format(k >= 1 ? value : value * k); }, { delay });
  return el;
}

export function register(router, ctx) {
  router.on('/m/accounts', () => renderMbaLayout(ctx, renderList(ctx), 'accounts'));
  router.on('/m/accounts/:id', (params) => renderMbaLayout(ctx, renderDetail(ctx, params.id), 'accounts'));
}

/** Account statuses in V3 §16 lifecycle order. */
export const ACCOUNT_STATUSES = Object.freeze([
  'new', 'assigned', 'contact_attempted', 'contacted', 'negotiating', 'arrangement_active', 'settled',
  'on_hold', 'disputed', 'escalated', 'uncollectable', 'returned',
]);
const STATUS_LABEL = { returned: 'Returned to creditor' };
const statusChip = (s, opts = {}) => chip(s, { label: STATUS_LABEL[s] || null, ...opts });

const CHANNEL_LABEL = { call: 'Call', sms: 'SMS', email: 'Email' };
const OUTCOME_LABEL = { no_contact: 'No contact', contacted: 'Contacted — no agreement', dispute: 'Borrower disputes the debt', agreement: 'Agreement reached' };
const OUTCOME_TONE = { no_contact: 'neutral', contacted: 'info', dispute: 'danger', agreement: 'ok' };

const agentName = (state, id) => (id ? state.agents[id]?.name ?? humanize(id) : 'Unassigned');

// =============================================================================================
// List

const filters = memo('accounts.filters', () => ({ q: '', status: '', portfolioId: '', assigneeId: '' }));

function matches(a, f) {
  if (f.status && a.status !== f.status) return false;
  if (f.portfolioId && a.portfolioId !== f.portfolioId) return false;
  if (f.assigneeId === '__none' && a.assigneeId) return false;
  if (f.assigneeId && f.assigneeId !== '__none' && a.assigneeId !== f.assigneeId) return false;
  const q = f.q.trim().toLowerCase();
  if (q) {
    const name = borrowerName(a).toLowerCase();
    const hit = name.includes(q) || String(a.ref).toLowerCase().includes(q) || String(a.creditorAccountNo || '').toLowerCase().includes(q);
    if (!hit) return false;
  }
  return true;
}

function renderList(ctx) {
  const state = ctx.store.get();
  const mid = isMidnight();
  const intro = mnrIntro(ctx);
  const all = Object.values(state.accounts);
  const rows = all.filter((a) => matches(a, filters));
  const balances = new Map(rows.map((a) => [a.id, ctx.selectors.accountBalance(state, a.id)]));
  const unassigned = all.filter((a) => !a.assigneeId).length;
  const disputed = all.filter((a) => a.status === 'disputed').length;
  // Midnight: the two queue shortcuts carry a glowing tone dot (decoration; the text names them).
  const dot = (tone) => (mid ? h('span', { class: ['mnr-dot', `tone-${tone}`], attrs: { 'aria-hidden': 'true' } }) : null);

  const bar = filterBar({
    testid: 'accounts-filter',
    values: filters,
    fields: [
      { type: 'text', name: 'q', label: 'Search', placeholder: 'Name, MBA reference or creditor account no.', wide: true },
      { type: 'select', name: 'status', label: 'Status', options: ACCOUNT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] || humanize(s) })) },
      { type: 'select', name: 'portfolioId', label: 'Portfolio', options: Object.values(state.portfolios).map((p) => ({ value: p.id, label: p.name })) },
      { type: 'select', name: 'assigneeId', label: 'Assignee', options: [{ value: '__none', label: 'Unassigned queue' }, ...Object.values(state.agents).map((g) => ({ value: g.id, label: g.name }))] },
    ],
    onApply: (v) => {
      Object.assign(filters, v);
      memo('table:accounts', () => ({})).page = 0;
      ctx.rerender();
    },
  });

  const tbl = table({
      testid: 'accounts-table',
      stateKey: 'accounts',
      pageSize: 20,
      rows,
      caption: 'Accounts',
      empty: 'No accounts match these filters. Reset the filters to see every account.',
      rowTestid: (a) => `account-row-${a.id}`,
      onRowClick: (a) => ctx.router.go(`#/m/accounts/${a.id}`),
      columns: [
        {
          key: 'name', label: 'Borrower', sortValue: (a) => borrowerName(a),
          render: (a) => h('div', { class: 'acc-who' },
            h('a', { href: `#/m/accounts/${a.id}`, class: 'acc-who-name' }, borrowerName(a)),
            h('span', { class: 'acc-who-ref num' }, a.ref)),
        },
        {
          key: 'portfolioId', label: 'Creditor · portfolio', sortValue: (a) => state.portfolios[a.portfolioId]?.name ?? '',
          render: (a) => h('div', { class: 'acc-pf' }, h('span', {}, state.portfolios[a.portfolioId]?.name ?? '—'), h('span', { class: 'acc-pf-cr' }, state.creditors[a.creditorId]?.name ?? '')),
        },
        { key: 'placedBalance', label: 'Placed', align: 'right', render: (a) => h('span', { class: 'num' }, formatPHP(a.placedBalance)) },
        { key: 'paid', label: 'Paid to date', align: 'right', sortValue: (a) => balances.get(a.id).paid, render: (a) => h('span', { class: 'num' }, formatPHP(balances.get(a.id).paid)) },
        { key: 'status', label: 'Status', sortValue: (a) => ACCOUNT_STATUSES.indexOf(a.status), render: (a) => statusChip(a.status) },
        { key: 'assigneeId', label: 'Assignee', sortValue: (a) => agentName(state, a.assigneeId), render: (a) => (a.assigneeId ? agentName(state, a.assigneeId) : h('span', { class: 'muted' }, 'Unassigned')) },
      ],
    });
  if (intro) mnrRise(tbl.querySelectorAll('tbody tr'), { step: 22, base: 80 });

  return h('div', { class: 'page page-accounts', testid: 'accounts-list' },
    pageHeader({
      eyebrow: 'Collections',
      title: 'Accounts',
      subtitle: 'Every placed account, its status and who is working it. Open an account to log contact, send the payment link or review its history.',
      meta: [
        h('span', { class: 'acc-meta num' }, `${all.length.toLocaleString('en-US')} accounts`),
        h('button', { type: 'button', class: 'acc-quick', testid: 'quick-unassigned', on: { click: () => { Object.assign(filters, { q: '', status: '', portfolioId: '', assigneeId: '__none' }); ctx.rerender(); } } }, dot('warn'), `${unassigned} in the unassigned queue`),
        h('button', { type: 'button', class: 'acc-quick', testid: 'quick-disputed', on: { click: () => { Object.assign(filters, { q: '', status: 'disputed', portfolioId: '', assigneeId: '' }); ctx.rerender(); } } }, dot('danger'), `${disputed} disputed`),
      ],
    }),
    bar,
    tbl);
}

// =============================================================================================
// Detail

const tabMemo = memo('accounts.tab', () => ({}));

function activeToken(state, accountId) {
  return Object.values(state.tokens).find((t) => t.accountId === accountId && t.status === 'active') || null;
}

function notFound(id) {
  return h('div', { class: 'page page-accounts' },
    pageHeader({ eyebrow: 'Collections', title: 'Account not found', crumbs: [{ label: 'Accounts', href: '#/m/accounts' }, { label: id }] }),
    card({ body: emptyState(`There is no account with the ID ${id}. It may have been removed by Reset demo.`, { title: 'Nothing here', action: h('a', { href: '#/m/accounts', class: 'btn btn-secondary btn-md' }, 'Back to accounts') }) }));
}

/** Midnight: every glass panel on a record page follows the pointer (ambient.js sets --px/--py). */
export function mnrSpot(root) {
  if (!isMidnight()) return root;
  root.querySelectorAll('.card').forEach((c) => { if (!c.closest('.mnr-acc-hero')) c.classList.add('fx-spot', 'mnr-spot'); });
  return root;
}

function renderDetail(ctx, id) {
  const state = ctx.store.get();
  const acc = state.accounts[id];
  if (!acc) return notFound(id);
  const mid = isMidnight();
  const intro = mnrIntro(ctx);
  const name = borrowerName(acc);
  const creditor = state.creditors[acc.creditorId];
  const portfolio = state.portfolios[acc.portfolioId];
  const bal = ctx.selectors.accountBalance(state, id);
  const arr = ctx.selectors.currentArrangement(state, id);
  const tok = activeToken(state, id);
  const tab = tabMemo[id] || 'overview';
  // Nothing to send when the in-force arrangement is finished or has defaulted. An account with no
  // arrangement yet keeps the button: the dialog explains what to do first.
  const noLinkReason = arr?.status === 'completed' ? 'Nothing to collect: the arrangement is complete'
    : arr?.status === 'defaulted' ? 'Arrangement defaulted: agree a new arrangement first'
      : null;

  const header = pageHeader({
    crumbs: [{ label: 'Accounts', href: '#/m/accounts' }, { label: name }],
    eyebrow: acc.ref,
    title: name,
    meta: [
      statusChip(acc.status, { size: 'lg', testid: 'account-status' }),
      arr ? h('span', { class: 'acc-meta' }, 'Arrangement ', chip(arr.status, { testid: 'account-arr-status' })) : h('span', { class: 'acc-meta muted' }, 'No arrangement'),
      h('span', { class: 'acc-meta' }, icon('user', { size: 16 }), agentName(state, acc.assigneeId)),
      acc.status === 'on_hold' && acc.holdUntil ? h('span', { class: 'acc-meta' }, icon('clock', { size: 16 }), `Review ${fmtDate(acc.holdUntil)}`) : null,
    ],
    actions: [
      permBtn(ctx, 'request.revoke', 'Revoke link', { variant: 'secondary', icon: 'lock', testid: 'revoke-link', disabled: !tok, title: tok ? null : 'There is no active link to revoke', onClick: () => openRevoke(ctx, acc) }),
      permBtn(ctx, 'request.send', 'Send payment link', { variant: 'primary', icon: 'mail', testid: 'send-link', disabled: !!noLinkReason, title: noLinkReason, onClick: () => openSendLink(ctx, id) }),
    ],
  });

  const summary = card({
    testid: 'account-summary',
    cls: 'acc-summary',
    body: h('div', { class: 'acc-sum' },
      dl([
        ['Mobile', h('span', { class: 'num' }, maskMobile(acc.borrower.mobile)), { testid: 'acc-mobile' }],
        ['Email', acc.borrower.email ? maskEmail(acc.borrower.email) : 'Not on file', { testid: 'acc-email' }],
        ['Creditor', creditor?.name ?? '—'],
        ['Portfolio', portfolio ? h('a', { href: `#/m/portfolios/${portfolio.id}` }, portfolio.name) : '—'],
        ['Creditor account', h('span', { class: 'num' }, maskTail(acc.creditorAccountNo || acc.ref))],
        ['Assignee', agentName(state, acc.assigneeId)],
      ], { cols: 3 }),
      h('div', { class: 'acc-bal', testid: 'account-balances' },
        balBlock('Placed balance', bal.placed, 'bal-placed'),
        balBlock('Paid to date', bal.paid, 'bal-paid'),
        // The gap between placed − paid and the current balance is always shown, never implied:
        // placed − paid − discount + credit = current (selectors.accountBalance).
        bal.discount > 0 ? balBlock('Settlement discount', bal.discount, 'bal-discount', false, {
          minus: true, qid: 'Q-22',
          sub: `Arrangement total agreed at ${formatPHP(bal.agreed)}; the difference is not collected`,
        }) : null,
        bal.credit > 0 ? balBlock('Unapplied credit', bal.credit, 'bal-credit', false, {
          plus: true,
          sub: h('span', {}, 'Duplicate payment awaiting refund or hold · ', h('a', { href: '#/m/reconciliation' }, 'Reconciliation')),
        }) : null,
        balBlock('Current balance', bal.current, 'bal-current', true))),
  });
  if (mid) {
    // Midnight: the current balance leads the balance column as the oversized figure, counting up
    // once per visit. It is a visual copy (aria-hidden): the "Current balance" row keeps the exact
    // text for screen readers and checks, visually hidden by midnight-mba-records.css.
    summary.querySelector('.acc-bal')?.prepend(h('div', { class: 'mnr-bal-hero', attrs: { 'aria-hidden': 'true' } },
      h('span', { class: 'mnr-bal-hero-label' }, 'Current balance'),
      mnrMoney(bal.current, { animate: intro, delay: 120, cls: 'mnr-bal-fig', hidden: true })));
  }

  const actionsBar = h('div', { class: 'acc-actions', testid: 'account-actions', attrs: { role: 'group', 'aria-label': 'Account actions' } },
    h('span', { class: 'acc-actions-label' }, 'Account actions'),
    permBtn(ctx, 'account.assign', acc.assigneeId ? 'Reassign' : 'Assign', { variant: 'ghost', size: 'sm', icon: 'user', testid: 'act-assign', onClick: () => openAssign(ctx, acc) }),
    permBtn(ctx, 'account.hold', 'Hold', { variant: 'ghost', size: 'sm', icon: 'clock', testid: 'act-hold', onClick: () => openHold(ctx, acc) }),
    permBtn(ctx, 'account.escalate', 'Escalate', { variant: 'ghost', size: 'sm', icon: 'arrowRight', testid: 'act-escalate', disabled: acc.status === 'escalated', onClick: () => openEscalate(ctx, acc) }),
    permBtn(ctx, 'contact.log', 'Mark dispute', { variant: 'ghost', size: 'sm', icon: 'alert', testid: 'act-dispute', disabled: acc.status === 'disputed', onClick: () => openDispute(ctx, acc) }),
    btn('Record offline payment', { variant: 'ghost', size: 'sm', icon: 'file', testid: 'act-offline', onClick: () => openOffline(ctx, acc) }));

  const counts = {
    contacts: Object.values(state.contactAttempts).filter((c) => c.accountId === id).length,
    requests: Object.values(state.requests).filter((r) => r.accountId === id).length,
    transactions: Object.values(state.attempts).filter((a) => a.accountId === id).length,
    audit: state.audit.filter((e) => e.accountId === id || e.target === id).length,
  };
  const tabBar = tabs({
    testid: 'account-tabs',
    label: 'Account sections',
    active: tab,
    onChange: (t) => { tabMemo[id] = t; ctx.rerender(); },
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'contacts', label: 'Contact attempts', count: counts.contacts },
      { id: 'arrangement', label: 'Arrangement' },
      { id: 'requests', label: 'Payment requests', count: counts.requests },
      { id: 'transactions', label: 'Transactions', count: counts.transactions },
      { id: 'audit', label: 'Audit', count: counts.audit },
    ],
  });

  const panels = {
    overview: () => renderOverview(ctx, state, acc, arr, tok, intro),
    contacts: () => renderContacts(ctx, state, acc),
    arrangement: () => renderArrangement(ctx, state, acc, arr),
    requests: () => renderRequests(ctx, state, acc),
    transactions: () => renderTransactions(ctx, state, acc),
    audit: () => renderAudit(ctx, state, acc),
  };

  const disputedNote = acc.status === 'disputed' ? notice('Collection contact and reminders are paused while the debt is under review (V3 §6). The borrower can still view their link and sees an “under review” notice.', { tone: 'danger', title: 'Disputed', testid: 'disputed-notice' }) : null;
  // Midnight: borrower, status, balances and the account actions share one glass header panel
  // (the actions sit under the contact facts, beside the balance column).
  if (mid) summary.querySelector('.acc-sum')?.append(actionsBar);
  const top = mid ? [h('section', { class: 'mnr-acc-hero fx-spot', attrs: { 'aria-label': `${name}: account summary` } }, header, summary), disputedNote]
    : [header, disputedNote, summary, actionsBar];

  return mnrSpot(h('div', { class: 'page page-account', testid: 'account-detail', dataset: { account: id } },
    top,
    h('div', { class: 'acc-tabs' }, tabBar,
      h('div', { class: 'acc-panel', testid: `panel-${tab}`, attrs: { role: 'tabpanel' } }, (panels[tab] || panels.overview)()))));
}

function balBlock(label, value, testid, strong = false, { minus = false, plus = false, qid = null, sub = null } = {}) {
  return h('div', { class: ['acc-bal-item', { 'is-strong': strong, 'is-adj': Boolean(minus || plus || sub) }], testid },
    h('span', { class: 'acc-bal-label' }, label, qid ? qtag(qid) : null),
    h('span', { class: 'acc-bal-value num' }, minus ? `\u2212${formatPHP(value)}` : plus ? `+${formatPHP(value)}` : formatPHP(value)),
    sub ? h('span', { class: 'acc-bal-sub' }, sub) : null);
}

// ---------------------------------------------------------------------------------------------
// Tabs

function renderOverview(ctx, state, acc, arr, tok, intro = false) {
  const mid = isMidnight();
  const items = ctx.selectors.accountTimeline(state, acc.id);
  const req = arr ? ctx.selectors.currentOpenRequest(state, arr.id) : null;
  const tokState = tok ? 'active' : Object.values(state.tokens).some((t) => t.accountId === acc.id) ? 'revoked' : null;
  const lastDelivery = req && req.deliveries.length ? req.deliveries[req.deliveries.length - 1] : null;

  const linkCard = card({
    eyebrow: 'One link per arrangement',
    title: 'Payment link',
    testid: 'overview-link',
    body: h('div', { class: 'stack acc-link' },
      dl([
        ['Link', tokState ? chip(tokState === 'active' ? 'active' : 'revoked', { label: tokState === 'active' ? 'Active' : 'Revoked' }) : h('span', { class: 'muted' }, 'Not created yet')],
        ['Open request', req ? h('a', { href: `#/m/requests/${req.id}`, class: 'num' }, req.id) : h('span', { class: 'muted' }, 'None')],
        ['Request status', req ? chip(req.status) : '—'],
        ['Last sent', lastDelivery ? `${fmtDateTime(lastDelivery.at)} · ${lastDelivery.channel === 'sms' ? 'SMS' : 'Email'}` : 'Not sent yet'],
      ], { cols: 2 }),
      h('p', { class: 'acc-help' }, 'The link and QR belong to the arrangement, not to a single request. An expired request never stops the link working.')),
  });

  let arrCard;
  if (arr) {
    const p = ctx.selectors.arrangementProgress(state, arr.id);
    arrCard = card({
      eyebrow: `Version ${arr.version}`,
      title: 'Arrangement',
      testid: 'overview-arrangement',
      cls: mid ? 'mnr-feature' : '',
      actions: btn('Schedule', { variant: 'ghost', size: 'sm', iconRight: 'chevronRight', onClick: () => { tabMemo[acc.id] = 'arrangement'; ctx.rerender(); } }),
      body: h('div', { class: 'stack' },
        h('div', { class: 'acc-prog-head' }, chip(arr.status), h('span', { class: 'num acc-prog-text' }, `${p.paidCount} of ${p.count} paid · ${formatPHP(p.paid)} of ${formatPHP(p.total)}`)),
        progress({ value: p.paid, max: p.total, label: 'Paid so far', tone: 'ok' }),
        p.next ? h('div', { class: 'acc-next' },
          h('span', { class: 'acc-bal-label' }, `Next · installment ${p.next.seq}`),
          h('span', { class: 'acc-next-row' }, h('strong', { class: 'num' }, mid ? mnrMoney(p.next.amount, { animate: intro, delay: 260 }) : formatPHP(p.next.amount)), h('span', { class: 'muted' }, ` due ${fmtDate(p.next.dueDate)}`), chip(p.next.status))) : h('p', { class: 'muted' }, 'Nothing left to pay on this arrangement.')),
    });
  } else {
    arrCard = card({ title: 'Arrangement', testid: 'overview-arrangement', body: emptyState('No arrangement yet. Agree terms with the borrower, then create one.', { title: 'No arrangement', action: permBtn(ctx, 'arrangement.draft', 'Create arrangement', { variant: 'primary', icon: 'plus', testid: 'create-arrangement-ov', onClick: () => ctx.router.go(`#/m/arrangements/new?account=${acc.id}`) }) }) });
  }

  const tl = timeline(items, { testid: 'account-timeline', empty: 'Nothing has happened on this account yet.' });
  if (intro) {
    mnrRise([arrCard, linkCard], { step: 80, base: 60 });
    mnrRise(tl.querySelectorAll('.tl-item'), { step: 38, base: 140 });
  }
  return h('div', { class: 'acc-ov' },
    card({ eyebrow: 'Contacts, requests, payments and changes', title: 'Timeline', testid: 'overview-timeline', body: tl }),
    h('div', { class: 'stack' }, arrCard, linkCard));
}

const contactDraft = memo('accounts.contactDraft', () => ({}));

function renderContacts(ctx, state, acc) {
  const draft = contactDraft[acc.id] ||= { channel: 'call', outcome: 'no_contact', note: '', nextAt: '', error: null };
  const list = Object.values(state.contactAttempts).filter((c) => c.accountId === acc.id).sort((a, b) => (a.at < b.at ? 1 : -1));

  const ch = select({ name: 'channel', value: draft.channel, testid: 'contact-channel', options: Object.entries(CHANNEL_LABEL).map(([value, label]) => ({ value, label })) });
  const oc = select({ name: 'outcome', value: draft.outcome, testid: 'contact-outcome', options: Object.entries(OUTCOME_LABEL).map(([value, label]) => ({ value, label })) });
  const note = textarea({ name: 'note', value: draft.note, rows: 3, testid: 'contact-note', placeholder: 'What happened, in a sentence or two' });
  const next = input({ type: 'date', name: 'nextAt', value: draft.nextAt, testid: 'contact-next', attrs: { min: ctx.clock.addDays(ctx.clock.DEMO_TODAY, 1).slice(0, 10) } });
  ch.addEventListener('change', () => { draft.channel = ch.value; });
  oc.addEventListener('change', () => { draft.outcome = oc.value; });
  note.addEventListener('input', () => { draft.note = note.value; });
  next.addEventListener('input', () => { draft.nextAt = next.value; });

  const submit = permBtn(ctx, 'contact.log', 'Log attempt', {
    variant: 'primary', icon: 'check', testid: 'log-contact', type: 'submit',
    onClick: (e) => { e.preventDefault(); doLog(); },
  });
  function doLog() {
    const res = ctx.actions.logContactAttempt(ctx.store, acc.id, { channel: draft.channel, outcome: draft.outcome, note: draft.note, nextAt: draft.nextAt || null });
    if (!res.ok) {
      draft.error = res.message;
      toast(res.message, { kind: 'danger', testid: 'contact-toast' });
      ctx.rerender();
      return;
    }
    const outcome = draft.outcome;
    contactDraft[acc.id] = { channel: draft.channel, outcome: 'no_contact', note: '', nextAt: '', error: null };
    const tail = outcome === 'agreement' ? ' Next: create the arrangement.' : outcome === 'dispute' ? ' Contact and reminders are now paused.' : '';
    toast(`Contact attempt logged. Account status: ${STATUS_LABEL[res.status] || humanize(res.status)}.${tail}`, { kind: 'ok', testid: 'contact-toast' });
  }

  const form = h('form', { class: 'acc-contact-form', testid: 'contact-form', on: { submit: (e) => { e.preventDefault(); if (ctx.can('contact.log')) doLog(); } } },
    h('div', { class: 'acc-contact-row' },
      field({ label: 'Channel', control: ch }),
      field({ label: 'Outcome', control: oc, hint: 'The outcome moves the account status (V3 §6).' }),
      field({ label: 'Next action date', control: next, hint: 'Optional follow-up date.' })),
    field({ label: 'Note', control: note }),
    h('div', { class: 'acc-form-actions' }, submit),
    draft.error ? notice(draft.error, { tone: 'danger' }) : null,
    draft.outcome === 'agreement' && !ctx.selectors.currentArrangement(state, acc.id)
      ? notice('After logging the agreement, create the arrangement from the Arrangement tab.', { tone: 'info' }) : null);

  return h('div', { class: 'acc-contacts' },
    card({ eyebrow: 'Agent workspace', title: 'Log a contact attempt', testid: 'contact-card', body: form }),
    card({
      title: 'Contact history',
      flush: true,
      testid: 'contact-history',
      body: table({
        testid: 'contacts-table',
        stateKey: `contacts-${acc.id}`,
        rows: list,
        empty: 'No contact attempts logged yet.',
        initialSort: null,
        columns: [
          { key: 'at', label: 'When', render: (c) => h('span', { class: 'num acc-nowrap' }, fmtDateTime(c.at)) },
          { key: 'channel', label: 'Channel', render: (c) => CHANNEL_LABEL[c.channel] || humanize(c.channel) },
          { key: 'outcome', label: 'Outcome', render: (c) => tag(OUTCOME_LABEL[c.outcome] || humanize(c.outcome), { tone: OUTCOME_TONE[c.outcome] || 'neutral' }) },
          { key: 'note', label: 'Note', sortable: false, render: (c) => h('span', { class: 'acc-note' }, c.note || '—') },
          { key: 'nextAt', label: 'Next action', render: (c) => (c.nextAt ? h('span', { class: 'num acc-nowrap' }, fmtDate(c.nextAt)) : '—') },
          { key: 'by', label: 'By', render: (c) => h('span', { class: 'acc-nowrap' }, state.agents[c.by]?.name || ROLE_LABELS[c.by] || humanize(c.by)) },
        ],
      }),
    }));
}

function renderArrangement(ctx, state, acc, arr) {
  if (!arr) {
    return card({
      testid: 'arrangement-empty',
      body: emptyState('This account has no arrangement yet. Agents draft one; a Supervisor approves it.', {
        title: 'No arrangement',
        action: permBtn(ctx, 'arrangement.draft', 'Create arrangement', { variant: 'primary', icon: 'plus', testid: 'create-arrangement', onClick: () => ctx.router.go(`#/m/arrangements/new?account=${acc.id}`) }),
      }),
    });
  }
  const p = ctx.selectors.arrangementProgress(state, arr.id);
  const insts = ctx.selectors.installmentsOf(state, arr.id);
  const versions = ctx.selectors.arrangementsOf(state, acc.id).filter((a) => a.id !== arr.id);
  const pct = p.total ? Math.round((p.paid / p.total) * 100) : 0;
  // Midnight marks the next installment's row (it glows; see midnight-mba-records.css).
  const nextSeq = isMidnight() && p.next ? p.next.seq : null;

  return h('div', { class: 'stack' },
    card({
      eyebrow: `Version ${arr.version} · ${humanize(arr.frequency)}`,
      title: `${formatPHP(arr.total)} in ${arr.count} installments`,
      testid: 'arrangement-card',
      actions: btn('Open arrangement', { variant: 'secondary', size: 'sm', iconRight: 'chevronRight', testid: 'open-arrangement', onClick: () => ctx.router.go(`#/m/arrangements/${arr.id}`) }),
      body: h('div', { class: 'stack' },
        h('div', { class: 'acc-prog-head' }, chip(arr.status, { size: 'lg', testid: 'arrangement-status' }),
          h('span', { class: 'num acc-prog-text', testid: 'arrangement-progress' }, `${p.paidCount} of ${p.count} paid · ${formatPHP(p.paid)} of ${formatPHP(p.total)} (${pct}%)`)),
        progress({ value: p.paid, max: p.total, label: `${pct}% paid`, tone: 'ok', testid: 'arrangement-bar' }),
        dl([
          ['Paid so far', h('span', { class: 'num' }, formatPHP(p.paid))],
          ['Remaining', h('span', { class: 'num', testid: 'arrangement-remaining' }, formatPHP(p.remaining))],
          ['Next due', p.next ? h('span', { class: 'num' }, `${formatPHP(p.next.amount)} on ${fmtDate(p.next.dueDate)}`) : 'Nothing due'],
          ['First due', fmtDate(arr.firstDue)],
        ], { cols: 4 })),
    }),
    card({
      title: 'Installment schedule',
      flush: true,
      testid: 'schedule-card',
      body: table({
        testid: 'schedule-table',
        rows: insts,
        pageSize: 60,
        rowTestid: (i) => `inst-row-${i.seq}`,
        columns: [
          { key: 'seq', label: '#', render: (i) => h('span', { class: ['num', { 'mnr-next': i.seq === nextSeq }] }, String(i.seq)) },
          { key: 'dueDate', label: 'Due date', render: (i) => h('span', { class: 'num' }, fmtDate(i.dueDate)) },
          { key: 'amount', label: 'Amount', align: 'right', render: (i) => h('span', { class: 'num' }, formatPHP(i.amount)) },
          { key: 'status', label: 'Status', render: (i) => chip(i.status, { testid: `inst-status-${i.seq}` }) },
          { key: 'paidAt', label: 'Paid', render: (i) => (i.paidAt ? h('span', { class: 'num' }, fmtDateTime(i.paidAt)) : '—') },
        ],
      }),
    }),
    versions.length ? card({
      title: 'Earlier versions',
      flush: true,
      testid: 'versions-card',
      body: table({
        testid: 'versions-table',
        rows: versions,
        onRowClick: (v) => ctx.router.go(`#/m/arrangements/${v.id}`),
        columns: [
          { key: 'version', label: 'Version', render: (v) => `v${v.version}` },
          { key: 'total', label: 'Total', align: 'right', render: (v) => h('span', { class: 'num' }, formatPHP(v.total)) },
          { key: 'count', label: 'Installments' },
          { key: 'status', label: 'Status', render: (v) => chip(v.status) },
          { key: 'createdAt', label: 'Created', render: (v) => h('span', { class: 'num' }, fmtDate(v.createdAt)) },
        ],
      }),
    }) : null);
}

function renderRequests(ctx, state, acc) {
  const rows = Object.values(state.requests).filter((r) => r.accountId === acc.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return card({
    eyebrow: 'MBA-REQ-… · delivered via the arrangement link',
    title: 'Payment requests',
    flush: true,
    testid: 'requests-card',
    body: table({
      testid: 'acc-requests-table',
      rows,
      rowTestid: (r) => `acc-req-${r.id}`,
      onRowClick: (r) => ctx.router.go(`#/m/requests/${r.id}`),
      empty: 'No payment requests yet. They are created when an arrangement is active.',
      columns: [
        { key: 'id', label: 'Request', render: (r) => h('a', { href: `#/m/requests/${r.id}`, class: 'num' }, r.id) },
        { key: 'inst', label: 'Installment', sortValue: (r) => state.installments[r.installmentId]?.seq ?? 0, render: (r) => h('span', { class: 'num' }, `#${state.installments[r.installmentId]?.seq ?? '—'}`) },
        { key: 'amount', label: 'Amount', align: 'right', render: (r) => h('span', { class: 'num' }, formatPHP(r.amount)) },
        { key: 'createdAt', label: 'Created', render: (r) => h('span', { class: 'num' }, fmtDate(r.createdAt)) },
        { key: 'expiresAt', label: 'Expires', render: (r) => h('span', { class: 'num' }, fmtDate(r.expiresAt)) },
        { key: 'deliveries', label: 'Sent', sortValue: (r) => r.deliveries.length, render: (r) => h('span', { class: 'num' }, r.deliveries.length ? `${r.deliveries.length}× (${[...new Set(r.deliveries.map((d) => (d.channel === 'sms' ? 'SMS' : 'Email')))].join(', ')})` : '—') },
        {
          key: 'status', label: 'Status',
          render: (r) => h('div', { class: 'dash-status' }, chip(r.status), r.replacedById ? h('span', { class: 'dash-repl num' }, `→ replaced by ${r.replacedById}`) : null),
        },
      ],
    }),
  });
}

function renderTransactions(ctx, state, acc) {
  const rows = Object.values(state.attempts).filter((a) => a.accountId === acc.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return card({
    eyebrow: 'MBA-TXN-… · checkout attempts and verified payments',
    title: 'Transactions',
    flush: true,
    testid: 'transactions-card',
    body: table({
      testid: 'acc-txn-table',
      rows,
      rowTestid: (a) => `acc-txn-${a.id}`,
      onRowClick: (a) => ctx.router.go(`#/m/transactions/${a.id}`),
      empty: 'No checkout attempts on this account yet.',
      columns: [
        { key: 'id', label: 'Transaction', render: (a) => h('a', { href: `#/m/transactions/${a.id}`, class: 'num' }, a.id) },
        { key: 'createdAt', label: 'Started', render: (a) => h('span', { class: 'num' }, fmtDateTime(a.createdAt)) },
        { key: 'method', label: 'Method', render: (a) => a.method || '—' },
        { key: 'amount', label: 'Amount', align: 'right', render: (a) => h('span', { class: 'num' }, formatPHP(a.amount)) },
        { key: 'status', label: 'Status', render: (a) => chip(a.status) },
        { key: 'failureReason', label: 'Detail', sortable: false, render: (a) => a.failureReason || (a.provider?.paymentId ? h('span', { class: 'num muted' }, a.provider.paymentId) : '—') },
      ],
    }),
  });
}

function renderAudit(ctx, state, acc) {
  const rows = state.audit.filter((e) => e.accountId === acc.id || e.target === acc.id).slice().sort((a, b) => (a.at < b.at ? 1 : -1));
  return card({
    eyebrow: 'Who, what, when, before → after',
    title: 'Audit log',
    flush: true,
    testid: 'audit-card',
    body: table({
      testid: 'acc-audit-table',
      rows,
      empty: 'No audit entries for this account yet.',
      columns: [
        { key: 'at', label: 'When', render: (e) => h('span', { class: 'num acc-nowrap' }, fmtDateTime(e.at)) },
        { key: 'role', label: 'Who', render: (e) => ROLE_LABELS[e.role] || humanize(e.role) },
        { key: 'action', label: 'What', render: (e) => h('div', { class: 'acc-audit-what' }, h('strong', {}, ctx.selectors.auditTitle(e.action)), e.detail ? h('span', { class: 'muted' }, e.detail) : null) },
        {
          key: 'change', label: 'Before → after', sortable: false,
          render: (e) => {
            if (!e.before && !e.after) return '—';
            if (e.before === e.after) return h('span', { class: 'muted' }, 'No status change');
            return h('span', { class: 'acc-change' }, humanize(e.before ?? '—'), icon('arrowRight', { size: 14 }), humanize(e.after ?? '—'));
          },
        },
      ],
    }),
  });
}

// =============================================================================================
// Actions

function result(res, okText, testid = 'account-toast') {
  if (res.ok) toast(okText, { kind: 'ok', testid });
  else toast(res.message || 'That did not work.', { kind: res.error === 'forbidden' ? 'warn' : 'danger', testid });
  return res.ok;
}

function openAssign(ctx, acc) {
  const state = ctx.store.get();
  const sel = select({ name: 'agent', value: acc.assigneeId || Object.keys(state.agents)[0], testid: 'assign-agent', options: Object.values(state.agents).map((g) => ({ value: g.id, label: g.name })) });
  modal({
    title: `Assign ${borrowerName(acc)}`,
    eyebrow: 'Account',
    testid: 'assign-modal',
    size: 'sm',
    body: [h('p', {}, 'The agent works the account: contact, arrangement and payment link.'), field({ label: 'Agent', control: sel })],
    actions: (api) => [
      btn('Cancel', { variant: 'ghost', onClick: () => api.close() }),
      btn('Assign', { variant: 'primary', testid: 'assign-confirm', onClick: () => { const res = ctx.actions.assignAccount(ctx.store, acc.id, sel.value); if (result(res, `Assigned to ${state.agents[sel.value]?.name}.`)) api.close(); } }),
    ],
  }).open();
}

function openHold(ctx, acc) {
  const minDate = ctx.clock.addDays(ctx.clock.DEMO_TODAY, 1).slice(0, 10);
  const date = input({ type: 'date', name: 'until', testid: 'hold-date', attrs: { min: minDate } });
  const err = h('div', { class: 'field-error', testid: 'hold-error', attrs: { role: 'alert' } });
  err.hidden = true;
  const m = modal({
    title: 'Put the account on hold',
    eyebrow: borrowerName(acc),
    testid: 'hold-modal',
    size: 'sm',
    body: [
      h('p', {}, 'On Hold always has a review date. On that date the account returns to the agent’s queue (V3 §6).'),
      field({ label: 'Review date', control: date, required: true, hint: `The review date must be after ${fmtDate(ctx.clock.DEMO_TODAY)}.` }),
      err,
    ],
    actions: (api) => [
      btn('Cancel', { variant: 'ghost', onClick: () => api.close() }),
      btn('Put on hold', {
        variant: 'primary', testid: 'hold-confirm',
        onClick: () => {
          const res = ctx.actions.holdAccount(ctx.store, acc.id, date.value);
          if (!res.ok) {
            err.textContent = res.message;
            err.hidden = false;
            date.setAttribute('aria-invalid', 'true');
            date.focus();
            return;
          }
          toast(`On hold until ${fmtDate(date.value)}.`, { kind: 'ok', testid: 'account-toast' });
          api.close();
        },
      }),
    ],
  });
  m.open();
}

function openEscalate(ctx, acc) {
  confirmDialog({
    title: 'Escalate to a Supervisor?',
    message: `${borrowerName(acc)} moves to Escalated so a Supervisor can decide: reassign, hold until a date, or close as uncollectable.`,
    confirmLabel: 'Escalate',
    testid: 'escalate-confirm',
    onConfirm: () => result(ctx.actions.escalateAccount(ctx.store, acc.id), 'Escalated to a Supervisor.'),
  });
}

function openDispute(ctx, acc) {
  const note = textarea({ name: 'note', rows: 3, testid: 'dispute-note', placeholder: 'What the borrower disputes' });
  modal({
    title: 'Mark as disputed',
    eyebrow: borrowerName(acc),
    testid: 'dispute-modal',
    size: 'sm',
    body: [
      h('p', {}, 'Disputed pauses collection contact and reminders while a Supervisor reviews the debt with the creditor. The borrower still sees an “under review” notice on their link.'),
      field({ label: 'Note', control: note }),
    ],
    actions: (api) => [
      btn('Cancel', { variant: 'ghost', onClick: () => api.close() }),
      btn('Mark disputed', { variant: 'danger', testid: 'dispute-confirm', onClick: () => { if (result(ctx.actions.markDisputed(ctx.store, acc.id, note.value), 'Marked disputed. Contact and reminders are paused.')) api.close(); } }),
    ],
  }).open();
}

function openRevoke(ctx, acc) {
  confirmDialog({
    title: 'Revoke the payment link?',
    message: `The link and QR stop working for ${borrowerName(acc)}. They will see “This link is no longer valid” with MBA’s contact details. Use this when a link went to the wrong person.`,
    confirmLabel: 'Revoke link',
    variant: 'danger',
    testid: 'revoke-confirm',
    onConfirm: () => result(ctx.actions.revokeLink(ctx.store, acc.id), 'Link revoked. The borrower now sees “link no longer valid”.'),
  });
}

function openOffline(ctx, acc) {
  modal({
    title: 'Record offline payment',
    eyebrow: 'Decision needed — Q-25',
    testid: 'offline-modal',
    body: [
      notice('Not built in this mockup: MBA has not yet decided how bank-counter and transfer payments are posted.', { tone: 'brand', title: 'Placeholder', icon: 'info' }),
      h('p', {}, 'Proposed flow, for MBA to confirm:'),
      h('ol', { class: 'acc-steps' },
        h('li', {}, h('strong', {}, 'Borrower sends proof. '), 'Through support (email or call) — no upload in the portal (V3 E18).'),
        h('li', {}, h('strong', {}, 'Finance matches the deposit. '), 'Against MBA’s bank statement, by amount, date and reference.'),
        h('li', {}, h('strong', {}, 'Supervisor approves posting. '), 'Two people, so no one can mark a debt paid alone.'),
        h('li', {}, h('strong', {}, 'Installment marked Paid. '), 'Source “offline”, with an audit entry and a confirmation to the borrower.')),
      h('div', { class: 'row' }, qtag('Q-25', 'Offline payment posting'), qtag('Q-28', 'Receipt wording')),
    ],
    actions: (api) => [btn('Close', { variant: 'primary', testid: 'offline-close', onClick: () => api.close() })],
  }).open();
}

// ---------------------------------------------------------------------------------------------
// Send payment link (D§7.4): channel → preview (C11: no creditor, no amount; real QR, C14) →
// send → confirmation with "Open as borrower".

/** What the borrower will receive. Pure content; no creditor name and no amount (C11, V3 §17). */
function messagePreview(ctx, acc, channel, url) {
  const { SUPPORT, BRAND } = ctx.config;
  if (channel === 'sms') {
    return h('div', { class: 'lp lp-sms', testid: 'link-preview' },
      h('div', { class: 'lp-head' }, icon('phone', { size: 16 }), h('span', {}, `SMS to ${maskMobile(acc.borrower.mobile)}`)),
      h('div', { class: 'lp-bubble' },
        `${BRAND}: Hi ${acc.borrower.first}, you can view your payment arrangement securely here: `,
        h('span', { class: 'lp-url', testid: 'preview-url' }, url),
        ` Questions? Call ${SUPPORT.phone}.`),
      h('p', { class: 'lp-note' }, 'Link only. No creditor name or amount, because a phone’s lock screen can be read by others.'));
  }
  return h('div', { class: 'lp lp-email', testid: 'link-preview' },
    h('div', { class: 'lp-head' }, icon('mail', { size: 16 }), h('span', {}, `Email to ${maskEmail(acc.borrower.email)}`)),
    h('div', { class: 'lp-mail' },
      h('div', { class: 'lp-mail-meta' },
        h('div', {}, h('span', { class: 'lp-k' }, 'From'), `${BRAND} (demo sender)`),
        h('div', {}, h('span', { class: 'lp-k' }, 'Subject'), 'Your payment arrangement')),
      h('div', { class: 'lp-mail-body' },
        h('div', { class: 'lp-bar', attrs: { 'aria-hidden': 'true' } }),
        h('p', { class: 'lp-hello' }, `Hi ${acc.borrower.first},`),
        h('p', {}, 'You can view your payment arrangement and pay securely online. To protect your privacy, we will first send a 6-digit code to your registered mobile.'),
        h('span', { class: 'lp-cta', testid: 'preview-cta' }, 'View your payment arrangement'),
        h('div', { class: 'lp-qr' },
          url ? qrSvg(url, 132, { testid: 'link-qr' }) : h('div', { class: 'lp-qr-empty' }, 'QR is created when you send'),
          h('div', { class: 'lp-qr-text' },
            h('span', {}, 'Or scan this code with your phone camera.'),
            h('span', { class: 'lp-url', testid: 'preview-url' }, url))),
        h('p', { class: 'lp-help' }, `Questions? We’re here to help: ${SUPPORT.phone} · ${SUPPORT.email}`))),
    h('p', { class: 'lp-note' }, 'No creditor name or amount appears before the borrower verifies with the code (V3 §9.2).'));
}

function openSendLink(ctx, accountId) {
  const s0 = ctx.store.get();
  const acc = s0.accounts[accountId];
  if (!acc) return;
  const ui = { channel: acc.borrower.email ? 'email' : 'sms', sent: null, error: null };

  const m = modal({ title: 'Send payment link', eyebrow: borrowerName(acc), testid: 'send-link-modal', size: 'lg' });

  function blocker(state) {
    const a = state.accounts[accountId];
    const arr = ctx.selectors.currentArrangement(state, accountId);
    if (['disputed', 'on_hold'].includes(a.status)) return 'Collection contact is paused while the account is disputed or on hold.';
    if (!arr || !['active', 'partially_paid'].includes(arr.status)) return 'There is no active arrangement on this account. Create or approve one first.';
    if (!ctx.selectors.arrangementProgress(state, arr.id).next) return 'Nothing is due on this arrangement.';
    return null;
  }

  function draw() {
    const state = ctx.store.get();
    const a = state.accounts[accountId];
    if (ui.sent) {
      const r = ui.sent;
      m.setBody([
        h('div', { class: 'lp-done', testid: 'send-link-success' },
          h('span', { class: 'lp-done-icon' }, icon('check', { size: 22 })),
          h('div', {},
            h('strong', { class: 'lp-done-title' }, `Link sent by ${r.channel === 'sms' ? 'SMS' : 'email'} to ${r.to}`),
            h('p', {}, 'Added to the delivery log of ', h('a', { href: `#/m/requests/${r.requestId}`, class: 'num', on: { click: () => m.close() } }, r.requestId), '. The same link always shows the arrangement’s current amount due.'))),
        h('div', { class: 'lp-done-link' },
          qrSvg(r.url, 112, { testid: 'sent-qr' }),
          h('div', { class: 'lp-done-url' }, h('span', { class: 'lp-k' }, 'Arrangement link'), h('span', { class: 'lp-url num', testid: 'sent-url' }, r.url),
            h('span', { class: 'lp-note' }, 'pay.example is a reserved demo address: scanning it can never reach a live site.'))),
        notice('See what the borrower sees: the link opens in the Borrower view as a fresh visit.', { tone: 'info', title: 'Try it' }),
      ]);
      m.setActions([
        btn('Done', { variant: 'ghost', testid: 'send-link-done', onClick: () => m.close() }),
        btn('Open as borrower', {
          variant: 'primary', icon: 'phoneDevice', testid: 'open-as-borrower',
          onClick: () => {
            closeAllModals();
            ctx.actions.exitBorrower(ctx.store);
            ctx.router.go(`#/b/t/${r.token}`);
          },
        }),
      ]);
      return;
    }

    const tok = activeToken(state, accountId);
    const url = tok ? ctx.config.QR_BASE + tok.token : null;
    const block = blocker(state);
    const chan = segmented({
      label: 'Channel',
      value: ui.channel,
      testid: 'link-channel',
      items: [
        { value: 'email', label: 'Email + QR', icon: 'mail', testid: 'channel-email' },
        { value: 'sms', label: 'SMS', icon: 'phone', testid: 'channel-sms' },
      ],
      onChange: (v) => { ui.channel = v; ui.error = null; draw(); },
    });
    const noEmail = ui.channel === 'email' && !a.borrower.email;
    m.setBody([
      h('div', { class: 'lp-step' },
        h('span', { class: 'lp-step-n' }, '1'), h('span', { class: 'lp-step-t' }, 'Choose the channel'), chan),
      h('div', { class: 'lp-step' }, h('span', { class: 'lp-step-n' }, '2'), h('span', { class: 'lp-step-t' }, 'Preview')),
      noEmail ? notice('No email address on file. Send by SMS instead.', { tone: 'warn' }) : messagePreview(ctx, a, ui.channel, url || `${ctx.config.QR_BASE}…`),
      block ? notice(block, { tone: 'warn', title: 'Can’t send yet', testid: 'send-link-blocked' }) : null,
      ui.error ? notice(ui.error, { tone: 'danger', title: 'Not sent', testid: 'send-link-error' }) : null,
      h('p', { class: 'lp-foot' }, `Resends are limited to one per channel every ${ctx.config.POLICIES.resendCooldownMin} minutes and ${ctx.config.POLICIES.resendMaxPerDay} per day `, qtag('Q-12'), '.'),
    ]);
    m.setActions([
      btn('Cancel', { variant: 'ghost', testid: 'send-link-cancel', onClick: () => m.close() }),
      permBtn(ctx, 'request.send', ui.channel === 'sms' ? 'Send SMS' : 'Send email', {
        variant: 'primary', icon: 'arrowRight', testid: 'send-link-confirm',
        disabled: !!block || noEmail,
        onClick: () => {
          const res = ctx.actions.sendPaymentLink(ctx.store, accountId, ui.channel);
          if (!res.ok) {
            ui.error = res.message;
            toast(res.message, { kind: res.error === 'cooldown' ? 'warn' : 'danger', testid: 'send-link-toast' });
            draw();
            return;
          }
          ui.sent = res;
          toast(`Payment link sent by ${res.channel === 'sms' ? 'SMS' : 'email'} to ${res.to}.`, { kind: 'ok', testid: 'send-link-toast' });
          draw();
        },
      }),
    ]);
  }

  m.open();
  draw();
  // Focus the first control of the freshly drawn body (open() focused the empty body).
  const first = m.el.querySelector('.seg-btn.is-on, button:not([disabled])');
  if (first) first.focus({ preventScroll: true });
}
