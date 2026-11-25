// crossView (plan Task 6, D§8 cross-view proof sequence) — THE demo.
//   1. MBA view → Accounts → Juan D. → Send payment link (Email) → preview (no creditor, no amount,
//      real QR to pay.example) → Send → Open as borrower.
//   2. Borrower view: Continue → OTP from the demo SMS toast → arrangement → Pay now → simulated
//      checkout, Success → Checking… → Payment confirmation (B8).
//   3. Toggle back to MBA: Juan's installment 3 is Paid, "Collected this month" went up by exactly
//      ₱2,500.00, the unread notification count went up, the webhook log posted once.
// Also: a second send on the same channel is refused by the cooldown (no duplicate delivery).
//
// The borrower leg uses the plan's testids first (pay-now, outcome-success, otp-toast) and falls
// back to visible button text, so a renamed testid can't silently break the demo proof.

const JUAN = { id: 'ac_juan', token: 'hT7qPz2KmW9vXc4RbN8sLd', request: 'MBA-REQ-000655' };

/** Clicks the first visible match among testids, else a button inside `scope` whose text matches re. */
async function clickAny(page, t, { testids = [], scope = 'body', text = null, timeout = 6000, what = 'control' }) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const handle = await page.evaluateHandle((ids, sc, src) => {
      const visible = (el) => el && el.offsetParent !== null && !el.disabled;
      for (const id of ids) {
        const el = document.querySelector(`${sc} [data-testid="${id}"], [data-testid="${id}"]`);
        if (visible(el)) return el;
      }
      if (src) {
        const re = new RegExp(src, 'i');
        const root = document.querySelector(sc) || document.body;
        for (const el of root.querySelectorAll('button, a.btn, [role="button"]')) {
          if (visible(el) && re.test(el.textContent.replace(/\s+/g, ' ').trim())) return el;
        }
      }
      return null;
    }, testids, scope, text ? text.source : null);
    const el = handle.asElement();
    if (el) {
      await el.click();
      await t.settle();
      return;
    }
    await t.sleep(80);
  }
  throw new Error(`crossView: could not find ${what} (testids ${testids.join('|') || '—'}${text ? `, text ${text}` : ''} in ${scope})`);
}

/** Screenshot without transient toasts covering the content. */
async function shot(page, t, name, opts) {
  await page.evaluate(() => document.querySelectorAll('#toast-root .toast').forEach((n) => n.remove()));
  return t.screenshot(name, opts);
}

const screenIs = (t, s, timeout = 8000) => t.waitFor(`[data-screen="${s}"]`, { timeout });

export default async function crossView(page, t) {
  const hash = () => page.evaluate(() => window.location.hash);
  const fmt = (c) => page.evaluate((x) => window.__MBA__.ctx.kit.formatPHP(x), c);

  // ---- before: dashboard values the CEO will compare against -------------------------------
  await t.click('nav-dashboard');
  await t.waitFor('kpi-collected-value');
  const before = await t.state((s) => ({
    unread: s.notifications.filter((n) => !n.read).length,
    payments: Object.keys(s.payments).length,
    inst3: Object.values(s.installments).find((i) => i.arrangementId === 'ar_juan' && i.seq === 3).status,
  }));
  const collectedBefore = await page.evaluate(() => window.__MBA__.ctx.selectors.kpis(window.__MBA__.store.get()).collectedThisMonth);
  const kpiTextBefore = await t.textOf('kpi-collected-value');
  t.assert(kpiTextBefore === await fmt(collectedBefore), `dashboard KPI "${kpiTextBefore}" ≠ selector ${collectedBefore}`);
  const notifBefore = Number(await t.textOf('notif-count'));
  t.assert(notifBefore === before.unread, `bell shows ${notifBefore}, state has ${before.unread} unread`);
  t.assert(before.inst3 === 'due', `Juan installment 3 should start due, got ${before.inst3}`);
  t.log(`before: collected ${kpiTextBefore}, unread ${notifBefore}, payments ${before.payments}`);

  // ---- 1. MBA → Accounts → Juan → Send payment link (email) --------------------------------
  await t.click('nav-accounts');
  await t.waitUntil(() => window.location.hash === '#/m/accounts');
  await t.type('accounts-filter-q', 'Juan');
  await page.keyboard.press('Enter');
  await t.settle();
  await t.waitFor(`account-row-${JUAN.id}`);
  await t.click(`account-row-${JUAN.id}`);
  await t.waitUntil((id) => window.location.hash === `#/m/accounts/${id}`, { arg: JUAN.id });
  t.assert((await t.textOf('page-title')) === 'Juan D.', `account title: ${await t.textOf('page-title')}`);
  t.assert((await t.textOf('acc-mobile')).includes('••••7310'), 'masked mobile missing in header');

  await t.click('send-link');
  await t.waitFor('send-link-modal');
  await t.click('channel-email');
  await t.waitFor('link-preview');
  const preview = await t.textOf('link-preview');
  for (const bad of ['Sample Bank', '₱', 'MBA-REF', '2,500']) t.assert(!preview.includes(bad), `email preview leaks "${bad}" (C11)`);
  t.assert(preview.includes('View your payment arrangement'), 'email preview has no "View your payment arrangement" button');
  const qrText = await page.$eval('[data-testid="link-qr"]', (n) => n.getAttribute('data-qr-text'));
  t.assert(qrText === `https://pay.example/t/${JUAN.token}`, `QR encodes ${qrText}`);
  await shot(page, t, 'accounts-sendlink-preview-1440');

  // SMS preview: link only.
  await t.click('channel-sms');
  const sms = await t.textOf('link-preview');
  t.assert(sms.includes(`https://pay.example/t/${JUAN.token}`) && !sms.includes('₱') && !sms.includes('Sample Bank'), `SMS preview: ${sms}`);
  t.assert(!(await t.exists('[data-testid="send-link-modal"] [data-testid="link-qr"]')), 'SMS preview should have no QR');
  await t.click('channel-email');

  await t.click('send-link-confirm');
  await t.waitFor('send-link-success');
  const sent = await t.state((s) => {
    const r = s.requests['MBA-REQ-000655'];
    return { status: r.status, deliveries: r.deliveries.map((d) => d.channel) };
  });
  t.assert(sent.status === 'sent' && sent.deliveries.join() === 'email', `after send: ${JSON.stringify(sent)}`);
  t.assert((await t.textOf('sent-url')) === `https://pay.example/t/${JUAN.token}`, 'sent link URL');
  await shot(page, t, 'accounts-sendlink-sent-1440');

  await t.click('open-as-borrower');
  await t.waitUntil((tok) => window.location.hash === `#/b/t/${tok}`, { arg: JUAN.token });
  await screenIs(t, 'B1');
  t.assert(!(await t.exists('send-link-modal')), 'modal should close when opening as borrower');
  const opened = await t.state((s) => s.requests['MBA-REQ-000655'].status);
  t.assert(opened === 'opened', `opening the link should mark the request opened, got ${opened}`);

  // ---- 2. Borrower: verify → pay → confirmation --------------------------------------------
  await clickAny(page, t, { testids: ['b1-continue', 'send-code', 'continue', 'otp-send'], scope: '[data-screen="B1"]', text: /^(continue|send( me a)? code)/, what: 'B1 Continue' });
  await t.waitFor('otp-toast');
  const toastText = await t.textOf('otp-toast');
  const code = (toastText.match(/\b(\d{6})\b/) || [])[1];
  t.assert(code, `no 6-digit code in the SMS toast: ${toastText}`);
  t.assert(toastText.includes('••••7310') && !toastText.includes('₱') && !toastText.includes('Sample Bank'), `SMS toast: ${toastText}`);
  await screenIs(t, 'B2');
  const boxes = await page.$$('[data-screen="B2"] input:not([type="hidden"])');
  t.assert(boxes.length >= 1, 'no OTP input on B2');
  if (boxes.length >= 6) {
    await boxes[0].click();
    await page.keyboard.type(code, { delay: 30 });
  } else {
    await boxes[0].click();
    await boxes[0].type(code);
  }
  await t.settle();
  const autoAdvanced = await page.waitForSelector('[data-screen="B3"]', { timeout: 1500 }).then(() => true).catch(() => false);
  if (!autoAdvanced) await clickAny(page, t, { testids: ['otp-verify', 'verify', 'otp-submit'], scope: '[data-screen="B2"]', text: /^(verify|continue|confirm)/, what: 'B2 Verify' });
  await screenIs(t, 'B3');
  const b3 = await t.text('[data-screen="B3"]');
  t.assert(b3.includes('₱2,500.00'), 'B3 should show ₱2,500.00 due');

  await clickAny(page, t, { testids: ['pay-now'], scope: '[data-screen="B3"]', text: /^pay now/, what: 'Pay now' });
  await screenIs(t, 'B4');
  await clickAny(page, t, { testids: ['outcome-success'], scope: '[data-screen="B4"]', text: /^success/, what: 'outcome Success' });
  await clickAny(page, t, { testids: ['checkout-pay', 'pay-confirm', 'pay-submit', 'pay'], scope: '[data-screen="B4"]', text: /^pay\s*₱/, what: 'checkout Pay' });
  await screenIs(t, 'B8', 10000);
  const b8 = await t.text('[data-screen="B8"]');
  t.assert(b8.includes('₱2,500.00') && b8.includes('MBA-TXN-'), `B8 text: ${b8.slice(0, 200)}`);
  t.log('borrower reached B8 with ₱2,500.00 and an MBA-TXN reference');

  // ---- 3. Back to MBA: the effects are visible -----------------------------------------------
  await t.click('view-mba');
  await t.waitUntil((id) => window.location.hash === `#/m/accounts/${id}`, { arg: JUAN.id });
  await t.click('tab-arrangement');
  await t.waitFor('inst-status-3');
  t.assert((await t.textOf('inst-status-3')) === 'Paid', `installment 3 shows "${await t.textOf('inst-status-3')}"`);
  t.assert((await t.textOf('arrangement-progress')).startsWith('3 of 6 paid'), `progress: ${await t.textOf('arrangement-progress')}`);
  t.assert((await t.textOf('arrangement-remaining')) === '₱7,500.00', `remaining: ${await t.textOf('arrangement-remaining')}`);
  await shot(page, t, 'accounts-juan-after-1440', { fullPage: true });

  const notifAfter = Number(await t.textOf('notif-count'));
  t.assert(notifAfter > notifBefore, `notification count did not go up (${notifBefore} → ${notifAfter})`);

  const posted = await t.state((s) => {
    const att = Object.values(s.attempts).filter((a) => a.accountId === 'ac_juan' && a.status === 'paid').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    const ev = Object.values(s.webhookEvents).filter((e) => e.attemptId === att.id);
    return { id: att.id, events: ev.length, steps: ev[0]?.steps.map((x) => x.name).join('>'), payments: Object.keys(s.payments).length };
  });
  t.assert(posted.steps === 'received>signature_valid>not_duplicate>verified_api>posted', `webhook steps: ${posted.steps}`);
  t.assert(posted.payments === before.payments + 1, `payments ${before.payments} → ${posted.payments} (must post exactly once)`);

  // Double-send guard (Review Focus 1): a second email right away is refused by the cooldown.
  await t.click('send-link');
  await t.waitFor('send-link-modal');
  await t.click('channel-email');
  await t.click('send-link-confirm');
  await t.waitFor('send-link-error');
  const deliveries = await t.state((s) => Object.values(s.requests).filter((r) => r.accountId === 'ac_juan').reduce((n, r) => n + r.deliveries.filter((d) => d.channel === 'email').length, 0));
  t.assert(deliveries === 1, `cooldown should block a duplicate email, have ${deliveries}`);
  await t.click('send-link-cancel');

  await t.click('nav-dashboard');
  await t.waitFor('kpi-collected-value');
  const want = await fmt(collectedBefore + 250000);
  const kpiAfter = await t.textOf('kpi-collected-value');
  t.assert(kpiAfter === want, `Collected this month: ${kpiTextBefore} → ${kpiAfter}, expected ${want}`);
  t.assert(await t.exists(`recent-${posted.id}`), `recent activity does not list ${posted.id}`);
  t.log(`after: collected ${kpiAfter} (+₱2,500.00), unread ${notifAfter}, ${posted.id} posted once`);
  await shot(page, t, 'dashboard-after-1440');
  t.assert((await hash()) === '#/m/dashboard', 'ended on the dashboard');
}
