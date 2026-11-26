// MBA back-office chrome (D§7 global chrome): navy left nav with the 11 menus, white top bar with
// global search, notifications and the role switcher (C7). Page modules call
// renderMbaLayout(ctx, pageEl, activeId) and return the result from their route handler.

import { h, btn, icon, memo, select, toast, borrowerName } from '../ui/kit.js';
import { ROLES, ROLE_LABELS } from '../core/permissions.js';
import { fmtDateTime } from '../core/clock.js';
import { isMidnight } from '../ui/look.js';

/** Left-nav items, in the plan's fixed order, grouped under uppercase section labels. */
export const NAV = Object.freeze([
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'Overview' },
  { id: 'creditors', label: 'Creditors', icon: 'creditors', group: 'Clients' },
  { id: 'portfolios', label: 'Portfolios', icon: 'portfolios', group: 'Clients' },
  { id: 'accounts', label: 'Accounts', icon: 'accounts', group: 'Collections' },
  { id: 'arrangements', label: 'Arrangements', icon: 'arrangements', group: 'Collections' },
  { id: 'requests', label: 'Payment requests', icon: 'requests', group: 'Collections' },
  { id: 'transactions', label: 'Transactions', icon: 'transactions', group: 'Collections' },
  { id: 'reconciliation', label: 'Reconciliation', icon: 'reconciliation', group: 'Finance' },
  { id: 'reports', label: 'Reports', icon: 'reports', group: 'Finance' },
  { id: 'remittances', label: 'Remittances', icon: 'remittances', group: 'Finance' },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'System' },
]);

const ui = memo('mba.layout', () => ({ notifOpen: false, navOpen: false, query: '', searchOpen: false, active: 0 }));

/** Badge counts shown next to nav items (computed from state, never hard-coded). */
function navCounts(state) {
  let pendingApproval = 0;
  for (const a of Object.values(state.arrangements)) if (a.status === 'pending_approval') pendingApproval++;
  let openExceptions = 0;
  for (const e of Object.values(state.exceptions)) if (e.status !== 'resolved') openExceptions++;
  return { arrangements: pendingApproval, reconciliation: openExceptions };
}

function renderNav(ctx, activeId) {
  const state = ctx.store.get();
  const counts = navCounts(state);
  const nav = h('nav', { class: 'mnav', attrs: { 'aria-label': 'Back office' }, testid: 'mba-nav' });
  let group = null;
  let list = null;
  for (const item of NAV) {
    if (item.group !== group) {
      group = item.group;
      nav.appendChild(h('div', { class: 'mnav-group' }, group));
      list = h('ul', { class: 'mnav-list' });
      nav.appendChild(list);
    }
    const on = item.id === activeId;
    const count = counts[item.id];
    list.appendChild(h('li', {},
      h('a', {
        href: `#/m/${item.id}`,
        class: ['mnav-item', { 'is-on': on }],
        testid: `nav-${item.id}`,
        attrs: { 'aria-current': on ? 'page' : null },
        on: { click: () => { ui.navOpen = false; } },
      },
      icon(item.icon, { size: 18 }),
      h('span', { class: 'mnav-label' }, item.label),
      count ? h('span', { class: 'mnav-count num', attrs: { 'aria-label': `${count} need attention` } }, String(count)) : null)));
  }
  nav.appendChild(h('div', { class: 'mnav-foot' },
    h('div', { class: 'mnav-foot-label' }, 'Demo data only'),
    h('div', { class: 'mnav-foot-text' }, 'Every figure is computed from the seeded demo dataset.')));
  return nav;
}

/** Accounts matching a query by borrower name or reference (top 8). */
export function searchAccounts(state, q) {
  const s = String(q || '').trim().toLowerCase();
  if (s.length < 2) return [];
  // Names match from the start of a word ("ma" → Maria, Mark; not Tomas); references match anywhere.
  const out = [];
  for (const a of Object.values(state.accounts)) {
    const name = borrowerName(a).toLowerCase();
    const wordHit = name.startsWith(s) || name.split(/[\s.]+/).some((w) => w && w.startsWith(s));
    if (wordHit || String(a.ref).toLowerCase().includes(s)) out.push(a);
    if (out.length >= 8) break;
  }
  return out;
}

function renderSearch(ctx) {
  const state = ctx.store.get();
  const listId = 'gsearch-list';
  const wrap = h('div', { class: 'gsearch', attrs: { role: 'search' } });
  const inp = h('input', {
    type: 'search',
    class: 'gsearch-input',
    value: ui.query,
    placeholder: 'Search accounts by name or reference',
    testid: 'global-search',
    attrs: { 'aria-label': 'Search accounts by name or reference', autocomplete: 'off', role: 'combobox', 'aria-controls': listId, 'aria-expanded': 'false' },
  });
  const panel = h('div', { class: 'gsearch-panel', id: listId, attrs: { role: 'listbox' }, testid: 'search-results' });
  wrap.append(icon('search', { size: 18, cls: 'gsearch-icon' }), inp, panel);

  const go = (a) => {
    ui.query = '';
    ui.searchOpen = false;
    ctx.router.go(`#/m/accounts/${a.id}`);
  };
  function draw() {
    const results = searchAccounts(ctx.store.get(), ui.query);
    const show = ui.searchOpen && ui.query.trim().length >= 2;
    panel.replaceChildren();
    panel.hidden = !show;
    inp.setAttribute('aria-expanded', show ? 'true' : 'false');
    if (!show) return;
    if (!results.length) {
      panel.appendChild(h('div', { class: 'gsearch-empty' }, 'No accounts match that name or reference.'));
      return;
    }
    if (ui.active >= results.length) ui.active = 0;
    results.forEach((a, i) => {
      const cr = state.creditors[a.creditorId];
      panel.appendChild(h('button', {
        type: 'button',
        class: ['gsearch-item', { 'is-active': i === ui.active }],
        testid: `search-result-${a.id}`,
        attrs: { role: 'option', 'aria-selected': i === ui.active ? 'true' : 'false' },
        on: { mousedown: (e) => e.preventDefault(), click: () => go(a) },
      },
      h('span', { class: 'gsearch-name' }, borrowerName(a)),
      h('span', { class: 'gsearch-meta num' }, `${a.ref} · ${cr ? cr.name : ''}`)));
    });
  }
  inp.addEventListener('input', () => { ui.query = inp.value; ui.searchOpen = true; ui.active = 0; draw(); });
  inp.addEventListener('focus', () => { ui.searchOpen = true; draw(); });
  inp.addEventListener('blur', () => { ui.searchOpen = false; draw(); });
  inp.addEventListener('keydown', (e) => {
    const results = searchAccounts(ctx.store.get(), ui.query);
    if (e.key === 'ArrowDown') { e.preventDefault(); ui.active = Math.min(results.length - 1, ui.active + 1); draw(); } else if (e.key === 'ArrowUp') { e.preventDefault(); ui.active = Math.max(0, ui.active - 1); draw(); } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[ui.active]) go(results[ui.active]);
    } else if (e.key === 'Escape') { ui.query = ''; inp.value = ''; ui.searchOpen = false; draw(); }
  });
  draw();
  return wrap;
}

function renderNotifications(ctx) {
  const state = ctx.store.get();
  const unread = state.notifications.filter((n) => !n.read).length;
  const wrap = h('div', { class: 'notif' });
  const bell = h('button', {
    type: 'button',
    class: ['iconbtn', { 'is-on': ui.notifOpen }],
    testid: 'notifications',
    attrs: { 'aria-label': `Notifications, ${unread} unread`, 'aria-expanded': ui.notifOpen ? 'true' : 'false', 'aria-haspopup': 'true' },
    on: {
      click: (e) => {
        e.stopPropagation();
        ui.notifOpen = !ui.notifOpen;
        if (ui.notifOpen) ctx.actions.markNotificationsRead(ctx.store);
        ctx.rerender();
      },
    },
  }, icon('bell', { size: 20 }),
  h('span', { class: ['notif-count', 'num', { 'is-zero': unread === 0 }], testid: 'notif-count', attrs: { 'aria-hidden': 'true' } }, String(unread)));
  wrap.appendChild(bell);
  if (ui.notifOpen) {
    const items = state.notifications.slice(0, 12);
    const panel = h('div', { class: ['notif-panel', { 'mba-anim-rise': !ui.notifShown }], testid: 'notif-panel', on: { click: (e) => e.stopPropagation() } },
      h('div', { class: 'notif-head' }, h('span', { class: 'eyebrow' }, 'Notifications'), h('span', { class: 'notif-total num' }, `${state.notifications.length} total`)));
    if (!items.length) panel.appendChild(h('p', { class: 'notif-empty' }, 'No notifications yet. Payments, approvals and exceptions appear here.'));
    const ul = h('ul', { class: 'notif-list' });
    for (const n of items) {
      const body = [h('span', { class: 'notif-text' }, n.text), h('time', { class: 'notif-time', attrs: { datetime: n.at } }, fmtDateTime(n.at))];
      ul.appendChild(h('li', { class: { 'is-unread': !n.read } },
        n.link ? h('a', { href: n.link, class: 'notif-item', on: { click: () => { ui.notifOpen = false; } } }, body) : h('div', { class: 'notif-item' }, body)));
    }
    if (items.length) panel.appendChild(ul);
    wrap.appendChild(panel);
  }
  ui.notifShown = ui.notifOpen;
  return wrap;
}

function renderRoleSwitcher(ctx) {
  const role = ctx.store.get().role;
  const sel = select({
    value: role,
    testid: 'role-switcher',
    cls: 'role-select',
    options: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
    attrs: { 'aria-label': 'Viewing as role' },
  });
  sel.addEventListener('change', () => {
    const res = ctx.actions.setRole(ctx.store, sel.value);
    if (res.ok) toast(`Now viewing as ${ROLE_LABELS[sel.value]}. Actions this role can't take are locked.`, { kind: 'info', testid: 'role-toast' });
  });
  return h('label', { class: 'role' },
    h('span', { class: 'role-label' }, 'Viewing as'),
    sel);
}

// Midnight look (2026-11-26): on phones and small tablets (<= 768px, CSS) a glass dock at the bottom
// holds the four most used sections and "More", which opens the same nav drawer as the menu button.
// Created only in Midnight; Classic keeps its layout exactly. "Reconciliation" is shortened to
// "Recon" on screen so five labels fit a 360px phone; its accessible name stays in full.
const DOCK = Object.freeze([
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'reconciliation', label: 'Recon', full: 'Reconciliation' },
]);

function renderDock(ctx, activeId) {
  const counts = navCounts(ctx.store.get());
  const items = DOCK.map((d) => {
    const on = d.id === activeId;
    const n = counts[d.id] || 0;
    const name = d.full || d.label;
    return h('a', {
      href: `#/m/${d.id}`,
      class: ['mdock-item', { 'is-on': on }],
      testid: `dock-${d.id}`,
      attrs: { 'aria-current': on ? 'page' : null, 'aria-label': n ? `${name}, ${n} need attention` : d.full ? name : null, title: d.full || null },
      on: { click: () => { ui.navOpen = false; } },
    },
    h('span', { class: 'mdock-ic' }, icon(NAV.find((x) => x.id === d.id).icon, { size: 20 }),
      n ? h('span', { class: 'mdock-badge num', attrs: { 'aria-hidden': 'true' } }, String(n)) : null),
    h('span', { class: 'mdock-label' }, d.label));
  });
  const elsewhere = !DOCK.some((d) => d.id === activeId);
  const here = NAV.find((x) => x.id === activeId);
  const more = h('button', {
    type: 'button',
    class: ['mdock-item', { 'is-on': elsewhere }],
    testid: 'dock-more',
    attrs: { 'aria-expanded': ui.navOpen ? 'true' : 'false', 'aria-label': elsewhere && here ? `More sections, now on ${here.label}` : 'More sections' },
    on: { click: () => { ui.navOpen = true; ctx.rerender(); } },
  }, h('span', { class: 'mdock-ic' }, icon('menu', { size: 20 })), h('span', { class: 'mdock-label' }, 'More'));
  return h('nav', { class: 'mdock', testid: 'mba-dock', attrs: { 'aria-label': 'Quick navigation' } }, items, more);
}

/** Wraps a page element in the MBA chrome. activeId is one of NAV ids. */
export function renderMbaLayout(ctx, pageEl, activeId) {
  const role = ctx.store.get().role;
  const mn = isMidnight();
  const top = h('div', { class: 'mtop', testid: 'mba-topbar' },
    btn(null, { variant: 'ghost', icon: 'menu', title: 'Menu', cls: 'mtop-menu', testid: 'nav-toggle', attrs: { 'aria-expanded': ui.navOpen ? 'true' : 'false' }, onClick: () => { ui.navOpen = !ui.navOpen; ctx.rerender(); } }),
    renderSearch(ctx),
    h('div', { class: 'mtop-right' },
      renderNotifications(ctx),
      renderRoleSwitcher(ctx),
      h('div', { class: 'avatar', attrs: { title: `Demo user · ${ROLE_LABELS[role]}`, 'aria-hidden': 'true' } }, ROLE_LABELS[role].slice(0, 1))));

  const main = h('main', { class: 'mmain', id: 'main', attrs: { tabindex: '-1' }, testid: `mba-page-${activeId}` },
    h('div', { class: 'mpage' }, pageEl));

  return h('div', { class: ['mlayout', { 'nav-open': ui.navOpen, 'has-dock': mn }], testid: 'mba-layout', dataset: { active: activeId } },
    renderNav(ctx, activeId),
    h('div', { class: 'mscrim', on: { click: () => { ui.navOpen = false; ctx.rerender(); } } }),
    h('div', { class: 'mcol' }, top, main),
    mn ? renderDock(ctx, activeId) : null);
}

/** Closes the notifications dropdown on outside click / Escape. Installed once by the shell. */
export function installLayoutListeners(ctx) {
  document.addEventListener('click', () => {
    if (ui.notifOpen) { ui.notifOpen = false; ctx.rerender(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && (ui.notifOpen || ui.navOpen)) { ui.notifOpen = false; ui.navOpen = false; ctx.rerender(); }
  });
}

/** Clears layout memory (Reset demo). */
export function resetLayoutUi() {
  Object.assign(ui, { notifOpen: false, navOpen: false, query: '', searchOpen: false, active: 0 });
}
