// Borrower view (B0–B12), plan Task 5 / D§6. Routed at #/b and #/b/t/:token (and #/b/ref) and
// rendered inside the shell's navy backdrop + centred column (shell.js borrowerFrame).
//
// Contract: renderBorrower(ctx) → HTMLElement whose root carries data-screen="B<n>", taken from
// actions.borrowerScreen(state). Screens live in screens.js; shared parts in parts.js.
//
// Simulated provider timing (D§6 B5/B6, POLICIES):
// - B5 resolves after successDelayMs: success → deliverWebhook(paid), failed → deliverWebhook(failed),
//   pending → back to the arrangement's live state, which is B6 while the attempt is pending.
// - B6 with Demo tools "Auto": deliverWebhook(paid) pendingDelayMs after the attempt started.
//   "Manual": no call; MBA view → Transactions resolves it.
// Timers are keyed by attempt and re-armed on render, so a reload mid-flow still resolves.

import { h } from '../ui/kit.js';
import { POLICIES } from '../core/config.js';
import { SCREENS, attemptStarted, startOtpTicker, closeSmsToast } from './screens.js';
import { bui, bfooter } from './parts.js';

const timers = new Map(); // key → timeout id

function arm(key, ms, fn) {
  if (timers.has(key)) return;
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    fn();
  }, Math.max(0, ms)));
}

const elapsed = (attemptId) => (attemptStarted.has(attemptId) ? Date.now() - attemptStarted.get(attemptId) : 0);

/** Arms the simulated-provider timer for the attempt shown on B5 / B6. */
function armProviderTimers(ctx, screen, data) {
  const state = ctx.store.get();
  const id = screen === 'B6' ? data.attemptId : data.attempt?.attemptId;
  const att = id ? state.attempts[id] : null;
  if (!att || att.status !== 'pending') return;
  const stillThisAttempt = (s) => {
    const a = s.attempts[id];
    return a && a.createdAt === att.createdAt && a.status === 'pending' ? a : null;
  };

  if (screen === 'B5') {
    arm(`B5|${id}|${att.createdAt}`, POLICIES.successDelayMs - elapsed(id), () => {
      const s = ctx.store.get();
      const a = stillThisAttempt(s);
      if (!a) return;
      if (a.outcome === 'pending') {
        // The provider has not confirmed yet: show the live state (B6) instead of a result.
        if (s.borrower.attemptId === id && s.borrower.screenOverride === 'B5') ctx.actions.clearScreenOverride(ctx.store);
        return;
      }
      ctx.actions.deliverWebhook(ctx.store, id, a.outcome === 'failed' ? 'failed' : 'paid');
    });
  } else if (screen === 'B6' && state.demo.pendingDelay === 'auto') {
    arm(`B6|${id}|${att.createdAt}`, POLICIES.pendingDelayMs - elapsed(id), () => {
      const s = ctx.store.get();
      if (s.demo.pendingDelay !== 'auto' || !stillThisAttempt(s)) return;
      ctx.actions.deliverWebhook(ctx.store, id, 'paid');
    });
  }
}

/** On a screen change: scroll to the top and move focus to the new heading (or the first code box). */
function focusOnScreenChange(screen, root) {
  const ui = bui();
  if (ui.lastScreen === screen) return;
  const first = ui.lastScreen === null;
  ui.lastScreen = screen;
  requestAnimationFrame(() => {
    if (!root.isConnected || document.querySelector('.modal-backdrop')) return;
    if (!first) window.scrollTo(0, 0);
    const target = screen === 'B2'
      ? root.querySelector('.otp-box')
      : root.querySelector('[data-testid="b-title"]');
    if (target && (!first || screen === 'B2')) target.focus({ preventScroll: true });
  });
}

export function renderBorrower(ctx) {
  const { screen, data } = ctx.actions.borrowerScreen(ctx.store.get());
  const render = SCREENS[screen] || SCREENS.B0;
  const root = h('div', { class: ['bscreen', `bscreen-${screen}`], dataset: { screen }, testid: 'borrower-screen' },
    render(ctx, data || {}),
    bfooter());

  if (screen === 'B5' || screen === 'B6') armProviderTimers(ctx, screen, data || {});
  if (screen === 'B2') queueMicrotask(() => startOtpTicker(ctx));
  if (screen !== 'B1' && screen !== 'B2') closeSmsToast(); // the code is used up or no longer relevant
  focusOnScreenChange(screen, root);
  return root;
}
