// Borrower non-happy states (plan Task 5, D§6 / D§8 heroes): B10 revoked (Nina), B11 disputed
// (Rosa) and nothing-due by reference (Mark), Luis's overdue replacement on B3 (never B10),
// OTP lockout → B12, Carlo failed → B7 → another method → B8, Ana's final payment → B9,
// Maria pending (double-click safe) → B6 → reload → auto-resolves → B8.

import { openHero, verifyFromB1, verifyFromB0Ref, screenSel, screenText, latestCode, waitForDownload } from './borrower-happyPath.mjs';

export default async function borrowerStates(page, t) {
  // ---- Nina: revoked link → B10, no OTP step; "use my reference" → B0.
  await openHero(t, 'nina');
  await t.waitFor(screenSel('B10'));
  t.assert((await screenText(t)).includes('This link is no longer valid'), 'B10 copy');
  t.assert(!(await t.exists('pay-now')), 'B10 must not offer Pay');
  await t.click('support-open');
  await t.waitFor('support');
  const sup = await t.textOf('support');
  t.assert(sup.includes('+63 998 58 64 100') && sup.includes('info@ph.mbacgroup.com') && sup.includes('To be confirmed — Q-14'), `support sheet: ${sup}`);
  await t.click('support-close');
  await t.click('enter-reference');
  await t.waitFor(screenSel('B0'));
  t.log('Nina → B10 → support sheet → B0');

  // ---- Rosa: disputed → B11 (under review), no Pay.
  await openHero(t, 'rosa');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B11'));
  const b11 = await screenText(t);
  t.assert(b11.includes('under review') && !(await t.exists('pay-now')), 'Rosa B11');

  // ---- Mark: B0 with his reference prefilled → Continue → generic B2 → code → B11 nothing due.
  await openHero(t, 'mark');
  await t.waitFor(screenSel('B0'));
  t.assert(!(await t.exists('masked-mobile')), 'reference entry must not show the masked mobile');
  await verifyFromB0Ref(page, t);
  await t.waitFor(screenSel('B11'));
  t.assert((await screenText(t)).includes('nothing to pay right now'), 'Mark B11 copy');

  // ---- Luis: expired request → replacement shows as Overdue on B3 (not B10).
  await openHero(t, 'luis');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  const badge = await t.textOf('due-badge');
  t.assert(badge.startsWith('Overdue · was due'), `Luis badge: ${badge}`);
  t.assert((await t.textOf('amount-due-value')) === '₱900.00', `Luis amount: ${await t.textOf('amount-due-value')}`);
  t.assert(await t.exists('pay-now'), 'Luis can still pay');

  // ---- Lockout: 5 wrong codes → B12.
  await openHero(t, 'juan');
  await t.waitFor(screenSel('B1'));
  await t.click('b1-continue');
  await t.waitFor(screenSel('B2'));
  const good = await latestCode(page);
  const wrong = good === '000000' ? '111111' : '000000';
  for (let i = 1; i <= 5; i++) {
    await t.type('otp-0', wrong);
    await t.settle();
    if (i < 5) {
      await t.waitFor('otp-error');
      t.assert((await t.textOf('otp-error')).includes(`${5 - i} ${5 - i === 1 ? 'try' : 'tries'} left`), `after ${i} wrong: ${await t.textOf('otp-error')}`);
    }
  }
  await t.waitFor(screenSel('B12'));
  t.assert((await t.textOf('locked-until')).includes('PHT'), 'B12 shows the lockout time');
  t.log(`5 wrong codes → B12 (${await t.textOf('locked-until')})`);

  // ---- Carlo: failed → B7 → choose another method → success → B8.
  await openHero(t, 'carlo');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await t.click('pay-now');
  await t.waitFor(screenSel('B4'));
  await t.click('outcome-failed');
  await t.click('checkout-pay');
  await t.waitFor(screenSel('B7'), { timeout: 5000 });
  const b7 = await screenText(t);
  t.assert(b7.includes('No money was taken for this attempt'), 'B7 copy');
  const failedMethod = await t.state((s) => s.attempts[s.borrower.attemptId].method);
  await t.click('other-method');
  await t.waitFor(screenSel('B4'));
  const chosen = await page.$eval('input[name="method"]:checked', (n) => n.value);
  t.assert(chosen !== failedMethod, `another method should be preselected (failed ${failedMethod}, chosen ${chosen})`);
  t.assert(await t.exists('[data-testid="outcome-success"][aria-pressed="true"]'), 'retry outcome resets to success');
  await t.click('checkout-pay');
  await t.waitFor(screenSel('B8'), { timeout: 5000 });
  const attempts = await t.state((s) => Object.values(s.attempts).filter((a) => a.accountId === 'ac_carlo').map((a) => a.status).sort().join(','));
  t.assert(attempts.includes('failed') && attempts.includes('paid'), `Carlo attempts: ${attempts}`);
  t.log(`Carlo: ${failedMethod} failed → ${chosen} paid (attempts ${attempts})`);

  // ---- Ana: final installment → B9 settled + confirmation download.
  await openHero(t, 'ana');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await t.click('pay-now');
  await t.waitFor(screenSel('B4'));
  await t.click('checkout-pay');
  await t.waitFor(screenSel('B9'), { timeout: 5000 });
  t.assert((await screenText(t)).includes('Your arrangement is complete'), 'B9 copy');
  const ana = await t.state((s) => ({ arr: Object.values(s.arrangements).find((a) => a.accountId === 'ac_ana' && a.status === 'completed')?.status, acc: s.accounts.ac_ana.status, txn: s.borrower.attemptId }));
  t.assert(ana.arr === 'completed' && ana.acc === 'settled', `Ana ${JSON.stringify(ana)}`);
  await t.click('download-confirmation');
  await waitForDownload(t, `MBA-receipt-${ana.txn}.html`);

  // ---- Maria: outcome defaults to Pending; double-click creates one attempt; B6; reload; auto → B8.
  await openHero(t, 'maria');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await t.click('pay-now');
  await t.waitFor(screenSel('B4'));
  t.assert(await t.exists('[data-testid="outcome-pending"][aria-pressed="true"]'), 'Maria outcome should default to Pending');
  await page.evaluate(() => { const b = document.querySelector('[data-testid="checkout-pay"]'); b.click(); b.click(); });
  await t.settle();
  const pendings = await t.state((s) => Object.values(s.attempts).filter((a) => a.accountId === 'ac_maria' && a.status === 'pending').length);
  t.assert(pendings === 1, `double-click created ${pendings} pending attempts`);
  await t.waitFor(screenSel('B6'), { timeout: 4000 });
  t.assert(await t.exists('[data-testid="pay-disabled"][disabled]'), 'Pay must be disabled on B6');
  await t.click('check-status');
  await t.waitFor('status-toast');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.appReady === '1');
  await t.waitFor(screenSel('B6'));
  t.log('reload mid-pending → still B6');
  await t.waitFor(screenSel('B8'), { timeout: 12000 });
  t.assert((await screenText(t)).includes('₱1,200.00'), 'Maria B8 amount');
  t.log('Maria pending → auto-resolved → B8');
}
