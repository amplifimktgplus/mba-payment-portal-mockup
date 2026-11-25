// pendingResolve (plan Task 7): Maria pays with outcome Pending while the demo delay is Manual →
// borrower B6 → MBA Transactions → Simulate webhook: paid → the borrower view shows B8.
// Also proves on the same attempt: the webhook log ticks every step, gross/fee/net with the Q-17
// label, Replay webhook is idempotent (no re-post), Refund is Finance-only and reverses the payment,
// and Simulate webhook: failed marks another pending attempt Failed.
//
// MBA side: UI only. Borrower side: Task 5's UI when its controls are present (pay-now,
// outcome-*), otherwise the same core actions that UI dispatches (logged as "core path").

const MARIA = 'ac_maria';
const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('#toast-root .toast').forEach((n) => n.remove()));

async function verifyBorrower(page, t) {
  // OTP entry is Task 5's borrowerHappyPath; here the code is sent and checked through the same actions.
  const res = await page.evaluate(() => {
    const { store, ctx } = window.__MBA__;
    const sent = ctx.actions.sendOtp(store);
    return ctx.actions.verifyOtp(store, sent.code);
  });
  t.assert(res.ok, `OTP verify failed: ${JSON.stringify(res)}`);
  await t.settle();
}

async function payAsBorrower(page, t, outcome) {
  if (await t.exists('pay-now')) {
    await t.click('pay-now');
    await t.waitFor('[data-screen="B4"]');
    await t.click(`outcome-${outcome}`);
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-screen="B4"] button')].find((x) => /^\s*Pay\s/.test(x.textContent) && !x.disabled);
      if (b) b.click();
      return !!b;
    });
    t.assert(clicked, 'B4: no enabled "Pay ₱…" button');
    t.log('borrower: paid through the Task 5 UI (pay-now → outcome → Pay)');
    return 'ui';
  }
  const res = await page.evaluate((o) => {
    const { store, ctx } = window.__MBA__;
    const b = ctx.actions.beginCheckout(store);
    if (!b.ok) return b;
    return ctx.actions.startCheckout(store, { method: 'GCash', outcome: o });
  }, outcome);
  t.assert(res.ok, `startCheckout failed: ${JSON.stringify(res)}`);
  t.log('borrower: core path (Task 5 pay-now not present) — beginCheckout + startCheckout');
  return 'core';
}

export default async function pendingResolve(page, t) {
  // 1. Demo tools → pending delay Manual.
  await t.click('demo-tools');
  await t.click('delay-manual');
  t.assert((await t.state((s) => s.demo.pendingDelay)) === 'manual', 'delay not manual');

  // 2. Maria's link → B1 → verified → B3.
  await t.click('hero-maria');
  await t.waitFor('[data-screen="B1"]');
  await verifyBorrower(page, t);
  await t.waitFor('[data-screen="B3"]');

  // 3. Pay with outcome Pending → B6 (B5 "Checking…" first; manual delay never auto-resolves).
  const path = await payAsBorrower(page, t, 'pending');
  if (path === 'core') {
    // Task 5's B5 moves on to B6 by itself; without it, clear B5 the way that screen does.
    await t.waitFor('[data-screen="B5"]');
    await page.evaluate(() => window.__MBA__.ctx.actions.clearScreenOverride(window.__MBA__.store));
  }
  await t.waitFor('[data-screen="B6"]', { timeout: 8000 });
  const attemptId = await t.state((s) => Object.values(s.attempts).find((a) => a.accountId === 'ac_maria' && a.status === 'pending')?.id);
  t.assert(attemptId && attemptId.startsWith('MBA-TXN-'), `no pending attempt for Maria: ${attemptId}`);
  t.log(`Maria pending attempt ${attemptId} → borrower B6`);
  const paymentsBefore = await t.state((s) => Object.keys(s.payments).length);

  // 4. MBA view → Transactions: the pending notice names the attempt; open it.
  await t.click('view-mba');
  await t.click('nav-transactions');
  await t.waitUntil(() => window.location.hash === '#/m/transactions');
  await t.waitForText('tx-pending-notice', attemptId);
  t.assert((await t.textOf('tx-kpi-pending-value')) === '4', `pending KPI ${await t.textOf('tx-kpi-pending-value')} (3 seeded + Maria)`);
  await t.click(`tx-row-${attemptId}`);
  await t.waitUntil((id) => window.location.hash === `#/m/transactions/${id}`, { arg: attemptId });
  t.assert((await t.textOf('page-title')) === attemptId, 'detail title');
  t.assert((await t.textOf('tx-head-status')) === 'Pending', `status ${await t.textOf('tx-head-status')}`);
  t.assert(await t.exists('webhook-empty'), 'pending attempt should have no webhook yet');
  t.assert(/^cs_test_\d+$/.test(await t.textOf('tx-cs')), 'checkout session id');
  t.assert((await t.textOf('fee-label')) === 'Fee borne by MBA — Q-17', `fee label: ${await t.textOf('fee-label')}`);
  t.assert(!(await t.exists('replay-webhook')) && !(await t.exists('refund')), 'replay/refund must not show before a webhook');
  await clearToasts(page);
  await t.screenshot('txn-pending-1440');

  // 5. Simulate webhook: paid → every step ticked, posted once, gross/fee/net.
  await t.click('simulate-paid');
  await t.waitFor('simulate-toast');
  await t.waitFor('webhook-log');
  t.assert((await t.textOf('tx-head-status')) === 'Paid', `after simulate: ${await t.textOf('tx-head-status')}`);
  const steps = await page.$$eval('[data-testid="webhook-log"] .wh-step', (els) => els.map((e) => ({ step: e.dataset.step, ok: e.classList.contains('is-ok'), mark: e.querySelector('.wh-mark').textContent })));
  const names = steps.map((s) => s.step).join(',');
  t.assert(names === 'received,signature_valid,not_duplicate,verified_api,posted,receipt_notified', `steps ${names}`);
  t.assert(steps.every((s) => s.ok && s.mark === '✓'), `every step must show ✓: ${JSON.stringify(steps)}`);
  t.assert((await t.textOf('tx-gross')) === '₱1,200.00', `gross ${await t.textOf('tx-gross')}`);
  t.assert((await t.textOf('tx-fee')) === '− ₱30.00', `fee ${await t.textOf('tx-fee')}`);
  t.assert((await t.textOf('tx-net')) === '₱1,170.00', `net ${await t.textOf('tx-net')}`);
  t.assert(/^pay_test_\d+$/.test(await t.textOf('tx-pay')), 'payment id');
  t.assert((await t.textOf('fee-label')) === 'Fee borne by MBA — Q-17', 'fee label after paid');
  const paymentsAfter = await t.state((s) => Object.keys(s.payments).length);
  t.assert(paymentsAfter === paymentsBefore + 1, `payments ${paymentsBefore} → ${paymentsAfter}`);
  await clearToasts(page);
  await t.screenshot('txn-paid-1440', { fullPage: true });

  // 6. Replay webhook → "Duplicate ignored — not re-posted", nothing re-posted.
  const evBefore = await t.state((s) => Object.keys(s.webhookEvents).length);
  await t.click('replay-webhook');
  await t.waitForText('replay-toast', 'Duplicate ignored — not re-posted');
  await t.waitFor('[data-testid="webhook-log"] .wh-event.is-dup');
  const after = await t.state((s) => ({ pay: Object.keys(s.payments).length, ev: Object.keys(s.webhookEvents).length }));
  t.assert(after.pay === paymentsAfter, `replay re-posted: payments ${paymentsAfter} → ${after.pay}`);
  t.assert(after.ev === evBefore + 1, `replay should add one event: ${evBefore} → ${after.ev}`);
  const dupSteps = await page.$$eval('[data-testid="webhook-log"] .wh-event.is-dup .wh-step', (els) => els.map((e) => e.dataset.step).join(','));
  t.assert(dupSteps === 'received,signature_valid,duplicate_ignored', `duplicate steps ${dupSteps}`);
  t.log(`replay: payments stay ${after.pay}; events ${evBefore} → ${after.ev}`);

  // 7. Borrower view now shows B8 (payment confirmation).
  await t.click('view-borrower');
  await t.waitFor('[data-screen="B8"]', { timeout: 8000 });
  t.log('borrower view → B8');

  // 8. Refund is Finance-only: locked for Admin, works for Finance and reverses the payment.
  await t.click('view-mba');
  await t.waitUntil((id) => window.location.hash === `#/m/transactions/${id}`, { arg: attemptId });
  const locked = await page.$eval('[data-testid="refund"]', (b) => ({ disabled: b.disabled, hint: b.dataset.hint }));
  t.assert(locked.disabled && locked.hint === 'Requires Finance', `refund as admin: ${JSON.stringify(locked)}`);
  await page.select('[data-testid="role-switcher"]', 'finance');
  await t.settle();
  await t.click('refund');
  await t.waitFor('refund-confirm');
  await t.click('refund-confirm-ok');
  await t.waitFor('refund-toast');
  await t.waitForText('tx-head-status', 'Refunded');
  const refunded = await t.state((s) => {
    const p = Object.values(s.payments).find((x) => x.accountId === 'ac_maria' && x.refunded);
    return p ? { refunded: p.refunded, count: Object.keys(s.payments).length } : null;
  });
  t.assert(refunded && refunded.count === paymentsAfter, `refund state ${JSON.stringify(refunded)}`);
  t.assert(await t.exists('tx-refunded-banner'), 'refunded banner');

  // 9. Simulate webhook: failed on a seeded pending attempt.
  await t.goto('#/m/transactions/MBA-TXN-004210');
  await t.click('simulate-failed');
  await t.waitForText('tx-head-status', 'Failed');
  const failedSteps = await page.$$eval('[data-testid="webhook-log"] .wh-step', (els) => els.map((e) => e.dataset.step).join(','));
  t.assert(failedSteps === 'received,signature_valid,not_duplicate,verified_api,failed_recorded', `failed steps ${failedSteps}`);
  t.assert((await t.state((s) => s.attempts['MBA-TXN-004210'].status)) === 'failed', 'attempt not failed');
  t.log(`Maria account ${MARIA}: pending → paid → replay ignored → refunded; MBA-TXN-004210 → failed`);
}
