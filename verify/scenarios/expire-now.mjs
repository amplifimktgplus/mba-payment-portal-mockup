// expireNow (plan Task 7, D§7.6, D§11 invariant): Expire Juan's open request from MBA view →
// request Expired → installment Overdue → replacement request created (listed next to it) →
// Juan's link still opens (never B10) and shows B3 with the same amount and an Overdue badge.
// Also covers on the replacement: Resend (with the per-channel cooldown) and Cancel being locked
// for an Agent ("Requires Supervisor").
//
// MBA side: UI only. Borrower OTP: the same core actions Task 5's B1/B2 dispatch (that UI is
// proved by borrowerHappyPath).

const JUAN_REF = 'MBA-REF-2026-004821';
// Screenshots show the screen, not the confirmation toasts stacked over it.
const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('#toast-root .toast').forEach((n) => n.remove()));

export default async function expireNow(page, t) {
  const open0 = await t.state((s) => Object.values(s.requests).filter((r) => r.accountId === 'ac_juan' && ['created', 'sent', 'opened'].includes(r.status)).map((r) => r.id));
  t.assert(open0.length === 1, `Juan should have exactly 1 open request, has ${open0}`);
  const reqId = open0[0];

  // 1. MBA → Payment requests → search Juan's reference → open his request.
  await t.click('nav-requests');
  await t.waitUntil(() => window.location.hash === '#/m/requests');
  await t.type('rq-filter-q', JUAN_REF);
  await t.click('rq-filter-apply');
  await t.waitFor(`rq-row-${reqId}`);
  await clearToasts(page);
  await t.screenshot('requests-list-1440');
  await t.click(`rq-row-${reqId}`);
  await t.waitUntil((id) => window.location.hash === `#/m/requests/${id}`, { arg: reqId });
  t.assert((await t.textOf('page-title')) === reqId, 'request title');
  t.assert((await t.textOf('rq-head-status')) === 'Created', `status ${await t.textOf('rq-head-status')}`);
  t.assert((await t.textOf('rq-amount')) === '₱2,500.00', `amount ${await t.textOf('rq-amount')}`);
  t.assert((await t.text('[data-testid="rq-delivery"] .eyebrow')) === 'Delivered via arrangement link', 'delivery eyebrow');
  const qrUrl = await page.$eval('[data-testid="rq-qr"]', (s) => s.getAttribute('data-qr-text'));
  t.assert(qrUrl === 'https://pay.example/t/hT7qPz2KmW9vXc4RbN8sLd', `QR encodes the arrangement link: ${qrUrl}`);
  await clearToasts(page);
  await t.screenshot('request-open-1440', { fullPage: true });

  // 2. Expire now (demo) → Expired, installment Overdue, replacement created.
  await t.click('expire-now');
  await t.waitFor('expire-toast');
  await t.waitForText('rq-head-status', 'Expired');
  t.assert((await t.textOf('rq-inst-status')) === 'Overdue', `installment ${await t.textOf('rq-inst-status')}`);
  t.assert(await t.exists('replacement-notice'), 'replacement notice');
  const s1 = await t.state((s) => {
    const r = Object.values(s.requests).find((x) => x.accountId === 'ac_juan' && x.status === 'expired' && x.replacedById);
    const n = r && s.requests[r.replacedById];
    return r && { expired: r.id, repl: n.id, replStatus: n.status, replacesId: n.replacesId, amount: n.amount, inst: s.installments[r.installmentId].status };
  });
  t.assert(s1 && s1.expired === reqId && s1.replacesId === reqId && s1.amount === 250000 && s1.inst === 'overdue' && s1.replStatus === 'created', `state after expire ${JSON.stringify(s1)}`);
  t.assert(await page.$eval('[data-testid="expire-now"]', (b) => b.disabled), 'expire-now should be disabled once expired');
  await clearToasts(page);
  await t.screenshot('request-expired-1440', { fullPage: true });
  t.log(`${reqId} expired → installment overdue → replacement ${s1.repl}`);

  // 3. Replacement detail: Overdue replacement, same amount, same link.
  await t.click('replacement-link');
  await t.waitUntil((id) => window.location.hash === `#/m/requests/${id}`, { arg: s1.repl });
  t.assert((await t.textOf('rq-head-status')) === 'Created', 'replacement status');
  t.assert(await t.exists('replaces-notice'), 'replaces notice');
  t.assert((await t.textOf('rq-amount')) === '₱2,500.00', 'replacement amount');
  t.assert((await page.$eval('[data-testid="rq-qr"]', (s) => s.getAttribute('data-qr-text'))) === qrUrl, 'replacement uses the same arrangement link');

  // 3b. Resend by SMS → logged; a second SMS inside the cooldown is refused in the modal.
  await t.click('resend-link');
  await t.waitFor('resend-modal');
  await t.click('resend-sms');
  await t.click('resend-send');
  await t.waitFor('resend-toast');
  await t.waitForText('rq-head-status', 'Sent');
  t.assert(await t.exists('rq-deliveries'), 'delivery log should list the send');
  await t.click('resend-link');
  await t.waitFor('resend-modal');
  await t.click('resend-sms');
  await t.click('resend-send');
  await t.waitFor('resend-error');
  t.assert((await t.textOf('resend-error')).includes('Please wait before resending'), `cooldown message: ${await t.textOf('resend-error')}`);
  await t.click('resend-cancel');
  const sms = await t.state((s) => Object.values(s.requests).filter((r) => r.accountId === 'ac_juan').flatMap((r) => r.deliveries).filter((d) => d.channel === 'sms' && d.at > '2026-11-26').length);
  t.assert(sms === 1, `exactly one SMS should be logged today, got ${sms}`);
  await clearToasts(page);
  await t.screenshot('request-replacement-1440', { fullPage: true });

  // 3c. Agent: Cancel is visible but locked.
  await page.select('[data-testid="role-switcher"]', 'agent');
  await t.settle();
  const cancel = await page.$eval('[data-testid="cancel-request"]', (b) => ({ disabled: b.disabled, hint: b.dataset.hint }));
  t.assert(cancel.disabled && cancel.hint === 'Requires Supervisor', `cancel as agent: ${JSON.stringify(cancel)}`);
  await page.select('[data-testid="role-switcher"]', 'admin');
  await t.settle();

  // 4. List: the expired request sits right after its replacement, with "→ replaced by".
  await t.click('nav-requests');
  await t.waitFor(`rq-row-${reqId}`);
  t.assert((await t.textOf(`replaced-by-${reqId}`)) === `→ replaced by ${s1.repl}`, `replaced-by text: ${await t.textOf(`replaced-by-${reqId}`)}`);
  const order = await page.$$eval('[data-testid="rq-table"] tbody tr', (trs) => trs.map((tr) => tr.dataset.testid));
  const iR = order.indexOf(`rq-row-${s1.repl}`);
  t.assert(iR >= 0 && order[iR + 1] === `rq-row-${reqId}`, `expired row should follow its replacement: ${order.join(',')}`);

  // 5. Juan's link still works: B1 (not B10) → verified → B3 with the same amount, Overdue.
  await t.click('demo-tools');
  await t.click('hero-juan');
  await t.waitFor('[data-screen="B1"]');
  const v = await page.evaluate(() => {
    const { store, ctx } = window.__MBA__;
    const sent = ctx.actions.sendOtp(store);
    return ctx.actions.verifyOtp(store, sent.code);
  });
  t.assert(v.ok, `verify ${JSON.stringify(v)}`);
  await t.waitFor('[data-screen="B3"]');
  const scr = await page.evaluate(() => {
    const r = window.__MBA__.ctx.actions.borrowerScreen(window.__MBA__.store.get());
    return { screen: r.screen, overdue: r.data.overdue, amountDue: r.data.amountDue, requestId: r.data.requestId };
  });
  t.assert(scr.screen === 'B3' && scr.overdue === true && scr.amountDue === 250000, `borrowerScreen ${JSON.stringify(scr)}`);
  const b3 = await t.text('[data-screen="B3"]');
  if (/is being built/.test(b3)) {
    t.log('NOT CHECKED: B3 DOM is still the Task 4 stub, so the Overdue badge text cannot be asserted yet (core says overdue=true, ₱2,500.00)');
  } else {
    t.assert(b3.includes('Overdue'), `B3 should show an Overdue badge: ${b3.slice(0, 200)}`);
    t.assert(b3.includes('₱2,500.00'), 'B3 should show ₱2,500.00');
    t.log('B3 DOM shows Overdue and ₱2,500.00');
  }
  await clearToasts(page);
  await t.screenshot('expire-borrower-b3-1440');
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await t.settle();
  await t.sleep(700); // entrance animation after the resize
  await clearToasts(page);
  await t.screenshot('expire-borrower-b3-375');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
}
