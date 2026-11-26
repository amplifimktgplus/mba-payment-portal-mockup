// App shell (D§5.1): DEMO banner + Demo tools drawer (C4), header with logo + view toggle,
// and the render loop that maps the current route into the page.
//
// Render model: one store. Any store change or route change schedules ONE render on the next
// microtask. A render rebuilds #view from the route handler; overlays (modals, toasts, drawer)
// live outside #view so they survive. Focus and caret in a re-rendered input are restored.

import logoWhiteSvg from '../assets/mba_logo_white.svg';
import { BANNER_TEXT, BRAND, LEGAL_NAME } from '../core/config.js';
import { DEMO_NOW, fmtDateTime } from '../core/clock.js';
import { HEROES } from '../data/seed.js';
import { h, btn, icon, segmented, toast, confirmDialog, closeAllModals, clearMemo, borrowerName } from '../ui/kit.js';
import { installLayoutListeners, resetLayoutUi } from '../mba/layout.js';
import { bui } from '../borrower/parts.js';
import { playSplash } from '../ui/splash.js';

export const LOGO_WHITE_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoWhiteSvg)}`;

const shellUi = { drawerOpen: false };

/** The brand lockup: logo mark + wordmark + product name. */
export function brandLockup({ product = 'Payment Portal' } = {}) {
  return h('a', { href: '#/', class: 'lockup', attrs: { 'aria-label': `${BRAND} ${product} — home` }, on: { click: (e) => e.preventDefault() } },
    h('img', { class: 'lockup-logo', src: LOGO_WHITE_URL, alt: '', width: 44, height: 44 }),
    h('span', { class: 'lockup-text' },
      h('span', { class: 'lockup-brand' }, BRAND),
      h('span', { class: 'lockup-product' }, product)));
}

// --------------------------------------------------------------------------------------------
// Demo tools drawer

function heroAccountName(state, hero) {
  const a = state.accounts[hero.accountId];
  return a ? borrowerName(a) : hero.key;
}

/** Opens a hero scenario (D§8 shortcuts). Borrower heroes start a fresh borrower session. */
export function openHero(ctx, hero) {
  const { store, actions, router } = ctx;
  shellUi.drawerOpen = false;
  closeAllModals();
  if (hero.view === 'mba') {
    router.go(hero.route || `#/m/accounts/${hero.accountId}`);
    return;
  }
  actions.exitBorrower(store);
  if (hero.entry === 'ref') {
    // Manual path: land on B0 (reference entry) with the reference typed in; the presenter
    // presses Continue. B0 shows nothing about the account, so the privacy rule holds.
    Object.assign(bui(), { refValue: hero.ref, refError: null });
    router.go('#/b');
    return;
  }
  router.go(`#/b/t/${hero.token}`);
}

function renderDrawer(ctx) {
  const state = ctx.store.get();
  const close = () => { shellUi.drawerOpen = false; ctx.rerender(); };
  const heroes = h('ul', { class: 'heroes' });
  for (const hero of HEROES) {
    heroes.appendChild(h('li', {},
      h('button', {
        type: 'button',
        class: 'hero-btn',
        testid: `hero-${hero.key}`,
        on: { click: () => openHero(ctx, hero) },
      },
      h('span', { class: 'hero-name' }, heroAccountName(state, hero)),
      h('span', { class: 'hero-label' }, hero.label),
      h('span', { class: ['hero-view', `is-${hero.view}`] }, hero.view === 'mba' ? 'MBA view' : 'Borrower'),
      icon('chevronRight', { size: 16, cls: 'hero-go' }))));
  }

  const delay = segmented({
    label: 'Pending payment resolution',
    value: state.demo.pendingDelay,
    variant: 'dark',
    testid: 'pending-delay',
    items: [
      { value: 'auto', label: 'Auto (8 s)', testid: 'delay-auto' },
      { value: 'manual', label: 'Manual', testid: 'delay-manual' },
    ],
    onChange: (v) => {
      ctx.actions.setPendingDelay(ctx.store, v);
      toast(v === 'auto' ? 'Pending payments now resolve on their own after 8 seconds.' : 'Pending payments now wait until you resolve them in MBA view → Transactions.', { kind: 'info', testid: 'delay-toast' });
    },
  });

  const panel = h('aside', {
    class: ['drawer', { 'mba-anim-rise': !shellUi.drawerShown }],
    testid: 'demo-drawer',
    attrs: { role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'drawer-title' },
    on: { click: (e) => e.stopPropagation() },
  },
  h('header', { class: 'drawer-head' },
    h('div', {}, h('div', { class: 'eyebrow eyebrow-on-dark' }, 'Presenter only'), h('h2', { class: 'drawer-title', id: 'drawer-title' }, 'Demo tools')),
    btn(null, { variant: 'on-dark', icon: 'x', title: 'Close demo tools', testid: 'demo-tools-close', onClick: close })),
  h('div', { class: 'drawer-body' },
    h('section', { class: 'drawer-sec' },
      h('h3', { class: 'drawer-label' }, 'Scenarios'),
      h('p', { class: 'drawer-help' }, 'Each shortcut opens that person’s situation. Borrower scenarios start a fresh session.'),
      heroes),
    h('section', { class: 'drawer-sec' },
      h('h3', { class: 'drawer-label' }, 'Pending payment resolution'),
      delay,
      h('p', { class: 'drawer-help' }, 'Manual: a pending payment stays pending until you simulate the webhook in MBA view.')),
    h('section', { class: 'drawer-sec' },
      h('h3', { class: 'drawer-label' }, 'Demo clock'),
      h('div', { class: 'clock', testid: 'demo-clock' }, icon('clock', { size: 18 }), h('span', { class: 'num' }, `${fmtDateTime(DEMO_NOW)} PHT`), h('span', { class: 'clock-fixed' }, 'Fixed')),
      h('p', { class: 'drawer-help' }, 'Due dates, overdue and expiry states are computed against this fixed date.')),
    h('section', { class: 'drawer-sec' },
      h('h3', { class: 'drawer-label' }, 'Intro'),
      h('p', { class: 'drawer-help' }, 'The opening animation plays once per browser session. Replay it just before you present.'),
      btn('Replay intro', { variant: 'on-dark', testid: 'replay-intro', onClick: () => { close(); playSplash({ force: true }); } })),
    h('section', { class: 'drawer-sec' },
      h('h3', { class: 'drawer-label' }, 'Data'),
      h('p', { class: 'drawer-help', testid: 'storage-mode' }, ctx.store.persistent
        ? 'Changes are saved in this browser, so a reload keeps your place.'
        : 'This browser blocks storage, so changes last until the page reloads.'),
      btn('Reset demo', {
        variant: 'danger', icon: 'refresh', testid: 'reset-demo',
        onClick: () => confirmDialog({
          title: 'Reset the demo?',
          message: 'This restores the starting data: every payment, link and change made in this session is undone.',
          confirmLabel: 'Reset demo',
          variant: 'danger',
          testid: 'reset-confirm',
          onConfirm: () => resetDemo(ctx),
        }),
      }))));
  return h('div', { class: 'drawer-layer', on: { click: close } }, panel);
}

/** Restores the seed and returns to the current view's start screen. */
export function resetDemo(ctx) {
  shellUi.drawerOpen = false;
  closeAllModals();
  clearMemo();
  resetLayoutUi();
  ctx.store.reset();
  const s = ctx.store.get();
  const view = ctx.router.current()?.view || s.view;
  ctx.router.go(s.lastRoute[view] || '#/m/dashboard');
  toast('Demo reset to the starting data.', { kind: 'ok', testid: 'reset-toast' });
}

// --------------------------------------------------------------------------------------------
// Banner + header

function renderBanner(ctx) {
  return h('div', { class: 'banner', testid: 'demo-banner', attrs: { role: 'note' } },
    h('div', { class: 'banner-inner' },
      icon('alert', { size: 16, cls: 'banner-icon' }),
      h('span', { class: 'banner-text', testid: 'banner-text' }, BANNER_TEXT),
      h('button', {
        type: 'button',
        class: ['banner-tools', { 'is-on': shellUi.drawerOpen }],
        testid: 'demo-tools',
        attrs: { 'aria-expanded': shellUi.drawerOpen ? 'true' : 'false' },
        on: { click: (e) => { e.stopPropagation(); shellUi.drawerOpen = !shellUi.drawerOpen; ctx.rerender(); } },
      }, icon('tool', { size: 16 }), h('span', {}, 'Demo tools'), icon(shellUi.drawerOpen ? 'chevronUp' : 'chevronDown', { size: 16 }))));
}

function renderHeader(ctx, view) {
  const toggle = segmented({
    label: 'Switch view',
    value: view,
    variant: 'dark',
    testid: 'view-toggle',
    items: [
      { value: 'borrower', label: 'Borrower view', icon: 'phoneDevice', testid: 'view-borrower' },
      { value: 'mba', label: 'MBA view', icon: 'monitor', testid: 'view-mba' },
    ],
    onChange: (v) => switchView(ctx, v),
  });
  return h('header', { class: 'hdr', testid: 'app-header' },
    h('div', { class: 'hdr-inner' },
      brandLockup({ product: view === 'mba' ? 'Collections back office' : 'Payment Portal' }),
      toggle));
}

/** Toggle: restores the last route used in that view (D§5.1). */
export function switchView(ctx, view) {
  const s = ctx.store.get();
  closeAllModals();
  ctx.router.go(s.lastRoute[view] || (view === 'mba' ? '#/m/dashboard' : '#/b'));
}

/** Navy brand backdrop + centred ~520px column for borrower screens. */
export function borrowerFrame(contentEl) {
  return h('div', { class: 'bframe', testid: 'borrower-frame' },
    h('div', { class: 'bframe-deco', attrs: { 'aria-hidden': 'true' } }),
    h('main', { class: 'bcol', id: 'main', attrs: { tabindex: '-1' } }, contentEl),
    h('p', { class: 'bframe-legal' }, `${LEGAL_NAME} · Demo`));
}

// --------------------------------------------------------------------------------------------
// Render loop

function focusKey(el) {
  if (!el || el === document.body) return null;
  if (el.dataset?.testid) return `[data-testid="${CSS.escape(el.dataset.testid)}"]`;
  if (el.id) return `#${CSS.escape(el.id)}`;
  return null;
}

/**
 * mountShell(ctx, root) — wires store + router to the DOM.
 * ctx.renderRoute(route) must return {view, el}; it is provided by main.js.
 */
export function mountShell(ctx, root) {
  const bannerSlot = h('div', { class: 'shell-top' });
  const viewSlot = h('div', { id: 'view', class: 'view' });
  const drawerSlot = h('div', { class: 'drawer-slot' });
  const skip = h('a', { href: '#main', class: 'skip', on: { click: (e) => { e.preventDefault(); document.getElementById('main')?.focus(); } } }, 'Skip to content');
  root.replaceChildren(skip, bannerSlot, viewSlot, drawerSlot);

  let scheduled = false;
  let lastPath = null;
  const bannerKeys = new Set(['[data-testid="view-borrower"]', '[data-testid="view-mba"]', '[data-testid="demo-tools"]']);

  let lastShellH = 0;
  let lastBannerH = 0;
  function measureShell() {
    // --banner-h (Task 10): lets narrow layouts keep the DEMO banner pinned (C15) while the
    // header scrolls away — see integration.css.
    const bh = bannerSlot.firstElementChild ? bannerSlot.firstElementChild.offsetHeight : 0;
    if (bh && bh !== lastBannerH) {
      lastBannerH = bh;
      document.documentElement.style.setProperty('--banner-h', `${bh}px`);
    }
    const hgt = bannerSlot.offsetHeight;
    if (hgt && hgt !== lastShellH) {
      lastShellH = hgt;
      document.documentElement.style.setProperty('--shell-h', `${hgt}px`);
    }
  }
  window.addEventListener('resize', measureShell);

  function render() {
    scheduled = false;
    const route = ctx.router.current();
    if (!route) return;
    const active = document.activeElement;
    const key = viewSlot.contains(active) || bannerSlot.contains(active) ? focusKey(active) : null;
    const sel = key && 'selectionStart' in active ? (() => { try { return [active.selectionStart, active.selectionEnd]; } catch { return null; } })() : null;

    const { view, el } = ctx.renderRoute(route);
    document.documentElement.dataset.view = view;
    bannerSlot.replaceChildren(renderBanner(ctx), renderHeader(ctx, view));
    viewSlot.replaceChildren(el);
    viewSlot.className = `view view-${view}`;
    drawerSlot.replaceChildren(shellUi.drawerOpen ? renderDrawer(ctx) : '');
    shellUi.drawerShown = shellUi.drawerOpen;

    measureShell();
    const routeChanged = route.hash !== lastPath;
    lastPath = route.hash;
    // Same screen re-rendered: put focus (and caret) back where the user was.
    // New screen: scroll to top and move focus to the page title (WCAG focus-on-route-change),
    // unless the user is in the shell chrome (toggle, banner), which keeps its focus.
    const restore = key && (!routeChanged || bannerKeys.has(key)) ? document.querySelector(key) : null;
    if (restore) {
      if (restore !== document.activeElement) {
        restore.focus({ preventScroll: true });
        if (sel && 'setSelectionRange' in restore) { try { restore.setSelectionRange(sel[0], sel[1]); } catch { /* not a text input */ } }
      }
    }
    if (routeChanged) {
      viewSlot.querySelector('.mpage, .bcol')?.classList.add('mba-anim-rise');
    }
    if (!restore && routeChanged) {
      window.scrollTo(0, 0);
      const target = viewSlot.querySelector('[data-testid="page-title"]') || document.getElementById('main');
      if (target && !document.querySelector('.modal-backdrop')) target.focus({ preventScroll: true });
    }
    document.documentElement.dataset.appReady = '1';
  }

  ctx.rerender = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(render);
  };

  ctx.store.subscribe(() => ctx.rerender());
  installLayoutListeners(ctx);
  document.addEventListener('click', () => { if (shellUi.drawerOpen) { shellUi.drawerOpen = false; ctx.rerender(); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && shellUi.drawerOpen) { shellUi.drawerOpen = false; ctx.rerender(); } });

  // A modal never sits over a different page: any real hash change (Back/Forward, a link, a
  // hero shortcut) closes every open modal. Re-running the same hash (router.go to the current
  // route) keeps them. modal.close() is idempotent, so modals that also close themselves on
  // hashchange (the payout modal) are not closed twice.
  let lastRouteHash = null;
  ctx.router.start((route) => {
    if (lastRouteHash !== null && route.hash !== lastRouteHash) closeAllModals();
    lastRouteHash = route.hash;
    ctx.onRoute?.(route);
    ctx.rerender();
  });
}
