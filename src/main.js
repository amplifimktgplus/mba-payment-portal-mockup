// Entry point (plan Task 4): builds the store, router and ctx, registers every module, and mounts
// the shell. Screen modules only edit their own files: each MBA module exports
// register(router, ctx); the borrower module exports renderBorrower(ctx).
//
// ctx = {store, router, kit, actions, selectors, config, rerender(), route, can(action), heroes, ...}

import { createStore } from './core/store.js';
import { createRouter } from './core/router.js';
import * as actions from './core/actions/index.js';
import * as selectors from './core/selectors.js';
import * as config from './core/config.js';
import * as permissions from './core/permissions.js';
import * as format from './core/format.js';
import * as clock from './core/clock.js';
import * as money from './core/money.js';
import * as csv from './core/csv.js';
import { HEROES } from './data/seed.js';
import * as kit from './ui/kit.js';
import { mountShell, borrowerFrame } from './shell/shell.js';

import * as dashboard from './mba/dashboard.js';
import * as creditors from './mba/creditors.js';
import * as portfolios from './mba/portfolios.js';
import * as accounts from './mba/accounts.js';
import * as arrangements from './mba/arrangements.js';
import * as requests from './mba/requests.js';
import * as transactions from './mba/transactions.js';
import * as reconciliation from './mba/reconciliation.js';
import * as reports from './mba/reports.js';
import * as remittances from './mba/remittances.js';
import * as settings from './mba/settings.js';
import { renderBorrower } from './borrower/borrower.js';
import { initAmbient } from './ui/ambient.js';
import { playSplash } from './ui/splash.js';
import { getLook, applyLook } from './ui/look.js';

const MBA_MODULES = [dashboard, creditors, portfolios, accounts, arrangements, requests, transactions, reconciliation, reports, remittances, settings];

function boot() {
  const root = document.getElementById('app');
  if (!root) return;

  const store = createStore();
  const router = createRouter();
  const ctx = {
    store, router, kit, actions, selectors, config, permissions, format, clock, money, csv,
    heroes: HEROES,
    rerender: () => {},
    /** The current route: {hash, path, query, params, view, pattern}. */
    get route() { return router.current(); },
    /** can(action) for the current role. */
    can: (action) => permissions.can(store.get().role, action),
  };

  // Borrower routes (D§5.1): #/b and #/b/t/<token>. The frame gives the navy backdrop + column.
  const borrowerRoute = () => borrowerFrame(renderBorrower(ctx));
  router.on('/b', borrowerRoute);
  router.on('/b/t/:token', borrowerRoute);
  router.on('/b/ref', borrowerRoute);
  for (const m of MBA_MODULES) m.register(router, ctx);

  // Side effects of entering a route (kept out of render so a re-render never repeats them).
  ctx.onRoute = (route) => {
    const s = store.get();
    if (!route.handler || !route.view) {
      router.go(s.lastRoute[s.view] || '#/m/dashboard');
      return;
    }
    if (s.view !== route.view) actions.setView(store, route.view);
    actions.setLastRoute(store, route.view, route.hash);
    if (route.pattern === '/b/t/:token') {
      const b = store.get().borrower;
      if (b.token !== route.params.token || b.ref) actions.openByToken(store, route.params.token);
    }
  };

  ctx.renderRoute = (route) => {
    const view = route.view || store.get().view;
    if (!route.handler) return { view, el: kit.h('div', { class: 'boot' }, 'Loading…') };
    try {
      return { view, el: route.handler(route.params, route.query, route) };
    } catch (err) {
      console.error('render failed', route.hash, err);
      return {
        view,
        el: kit.h('div', { class: 'render-error', testid: 'render-error' },
          kit.notice('This screen hit an error while drawing. Use the view toggle or Demo tools → Reset demo to continue.', { tone: 'danger', title: 'Something went wrong' })),
      };
    }
  };

  // Handy for e2e scenarios and live debugging in the meeting.
  globalThis.__MBA__ = { store, router, ctx };
  applyLook(getLook()); // Midnight (default) or Classic, before the first paint
  window.addEventListener('mba-look', () => ctx.rerender());
  mountShell(ctx, root);
  initAmbient(); // pointer-reactive light (theme-glass.css)
  playSplash(); // intro, once per session
}

boot();
