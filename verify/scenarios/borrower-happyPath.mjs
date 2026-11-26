// borrowerHappyPath (plan Task 5): Demo tools → Juan → Continue → code from the SMS toast →
// Pay now → Success → Pay → B8 contains ₱2,500.00 and MBA-TXN-. Also checks the B3 content the
// CEO sees, the payee line on checkout, the receipt download, and the state after payment.
// Named exports are shared helpers for the other borrower-* scenarios.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const screenSel = (n) => `[data-screen="${n}"]`;

/** Opens a hero scenario from the Demo tools drawer. */
export async function openHero(t, key) {
  await t.click('demo-tools');
  await t.waitFor('demo-drawer');
  await t.click(`hero-${key}`);
}

/** The 6-digit code from the newest demo SMS toast. */
export async function latestCode(page) {
  return page.evaluate(() => {
    const all = document.querySelectorAll('[data-testid="otp-toast"]');
    const last = all[all.length - 1];
    const m = last && last.textContent.match(/(\d{6})/);
    return m ? m[1] : null;
  });
}

/** From B1: send the code, read it from the toast, type it into the six boxes. */
export async function verifyFromB1(page, t) {
  await t.waitFor(screenSel('B1'));
  await t.click('b1-continue');
  await t.waitFor('otp-toast');
  await t.waitFor(screenSel('B2'));
  const code = await latestCode(page);
  t.assert(/^\d{6}$/.test(code || ''), `no 6-digit code in the SMS toast: ${code}`);
  await t.type('otp-0', code);
  await t.settle();
  return code;
}

/**
 * Mark's shortcut lands on B0 with his reference already typed in: check the prefill, press
 * Continue (which sends the code and goes to B2), read the code, type it.
 */
export async function verifyFromB0Ref(page, t, ref = 'MBA-REF-2026-003390') {
  await t.waitFor(screenSel('B0'));
  const val = await page.$eval('[data-testid="ref-input"]', (el) => el.value);
  t.assert(val === ref, `B0 reference should be prefilled with ${ref}, got "${val}"`);
  await t.click('ref-continue');
  await t.waitFor('otp-toast');
  await t.waitFor(screenSel('B2'));
  const code = await latestCode(page);
  t.assert(/^\d{6}$/.test(code || ''), `no 6-digit code in the SMS toast: ${code}`);
  await t.type('otp-0', code);
  await t.settle();
  return code;
}

/** Text of the current borrower screen root. */
export const screenText = (t) => t.text('[data-screen]');

/** Waits for a downloaded file to finish writing; returns its contents. */
export async function waitForDownload(t, name, { timeout = 5000 } = {}) {
  const path = join(t.downloads, name);
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const partial = readdirSync(t.downloads).some((f) => f.endsWith('.crdownload'));
    if (existsSync(path) && !partial) return readFileSync(path, 'utf8');
    await t.sleep(100);
  }
  throw new Error(`download ${name} did not appear in ${t.downloads} (has: ${readdirSync(t.downloads).join(', ') || 'nothing'})`);
}

export default async function borrowerHappyPath(page, t) {
  await openHero(t, 'juan');
  await t.waitUntil(() => window.location.hash.startsWith('#/b/t/'));
  await verifyFromB1(page, t);

  // B3 — the arrangement screen.
  await t.waitFor(screenSel('B3'));
  const b3 = await screenText(t);
  for (const want of ['Amount due now', '₱2,500.00', 'Installment 3 of 6', '₱5,000.00 paid of ₱15,000.00', 'Due Dec 5, 2026', 'Sample Bank (demo)', '6 monthly payments of ₱2,500.00', '₱10,000.00', 'Already paid at a bank? Send us your receipt', 'GCash · Maya · QR Ph · Online banking · Card · MariBank']) {
    t.assert(b3.includes(want), `B3 is missing "${want}"`);
  }
  t.assert((await t.textOf('pay-now')).includes('Pay now ₱2,500.00'), `pay-now label: ${await t.textOf('pay-now')}`);
  t.assert(await t.exists('support-open'), 'B3 has no support CTA');
  t.assert(await t.exists('b-footer'), 'B3 has no footer');
  const foot = await t.textOf('b-footer');
  for (const want of ['M.B.A. Consulting Philippines', 'Privacy Policy', 'Code of Conduct', 'DEMO']) t.assert(foot.includes(want), `footer missing "${want}"`);

  // B4 — simulated checkout.
  await t.click('pay-now');
  await t.waitFor(screenSel('B4'));
  const b4 = await screenText(t);
  t.assert(b4.includes('Simulated — PayMongo test-mode placeholder'), 'B4 missing the simulated label');
  t.assert(b4.includes('Sample Bank (demo) · collected by M.B.A. Consulting Philippines'), 'B4 missing the payee line (C10)');
  for (const m of ['GCash', 'Maya', 'QR Ph', 'Online banking', 'Card', 'MariBank']) t.assert(b4.includes(m), `B4 missing method ${m}`);
  // Method tiles show the real method logos (product owner, 2026-11-26); PayMongo's own logo never appears.
  await t.waitUntil(() => [...document.querySelectorAll('img.bmethod-logo')].every((i) => i.complete && i.naturalWidth > 0));
  const tiles = await t.page.$$eval('[data-testid="method-list"] .bmethod', (els) => els.map((el) => ({
    name: el.querySelector('.bmethod-name')?.firstChild?.textContent || '',
    marks: [...el.querySelectorAll('img.bmethod-logo')].map((i) => i.dataset.mark),
    icon: !!el.querySelector('.bmethod-mark svg'),
  })));
  t.assert(tiles.length === 6, `expected 6 method tiles, got ${tiles.length}`);
  for (const tile of tiles) t.assert(tile.marks.length || tile.icon, `method tile "${tile.name}" shows no logo or icon`);
  t.assert(tiles.find((x) => x.name === 'Card')?.marks.join('+') === 'Visa+Mastercard', 'Card tile should show Visa and Mastercard');
  t.assert(tiles.find((x) => x.name === 'Online banking')?.icon, 'Online banking should show the bank icon');
  t.assert(!(await t.exists('img[src*="paymongo" i], img[alt*="paymongo" i], img[data-mark*="paymongo" i]')), 'PayMongo logo found on B4');
  const providerNote = await t.textOf('provider-note');
  t.assert(providerNote.includes('secure page') && providerNote.includes('never reach MBA'), `provider note missing: "${providerNote}"`);
  await t.click('outcome-success');
  t.assert(await t.exists('[data-testid="outcome-success"][aria-pressed="true"]'), 'success outcome not selected');
  await t.click('checkout-pay');

  // B5 → B8 (only through the simulated webhook).
  await t.waitFor(screenSel('B5'), { timeout: 2000 });
  t.assert((await screenText(t)).includes('Checking your payment'), 'B5 copy');
  await t.waitFor(screenSel('B8'), { timeout: 6000 });
  const b8 = await screenText(t);
  t.assert(b8.includes('₱2,500.00') && b8.includes('MBA-TXN-'), 'B8 must contain ₱2,500.00 and MBA-TXN-');
  t.assert(b8.includes('Payment confirmation') && !/official receipt/i.test(b8.replace('not an official receipt', '')), 'B8 title');
  for (const want of ['pay_test_', 'Sample Bank (demo) · collected by M.B.A. Consulting Philippines', '₱7,500.00 remaining', 'Next installment', 'Jan 5, 2027', 'registered mobile ••••7310']) {
    t.assert(b8.includes(want), `B8 is missing "${want}"`);
  }
  const st = await t.state((s) => {
    const inst = Object.values(s.installments).find((i) => i.arrangementId === 'ar_juan' && i.seq === 3);
    const ev = Object.values(s.webhookEvents).filter((e) => e.attemptId === s.borrower.attemptId);
    return { inst: inst.status, steps: ev[0]?.steps.map((x) => x.name).join('>'), txn: s.borrower.attemptId };
  });
  t.assert(st.inst === 'paid', `installment 3 is ${st.inst}`);
  t.assert(st.steps === 'received>signature_valid>not_duplicate>verified_api>posted', `webhook steps ${st.steps}`);
  await t.screenshot('borrower-happy-B8-1440', { fullPage: true });

  // Download receipt.
  await t.click('download-receipt');
  const html = await waitForDownload(t, `MBA-receipt-${st.txn}.html`);
  t.assert(html.includes('Payment confirmation') && html.includes('₱2,500.00') && html.includes(st.txn), 'receipt file content');
  t.log(`receipt MBA-receipt-${st.txn}.html (${html.length} bytes)`);

  // Back to the arrangement: next installment is now due.
  await t.click('back-to-arrangement');
  await t.waitFor(screenSel('B3'));
  const after = await screenText(t);
  t.assert(after.includes('Installment 4 of 6') && after.includes('Due Jan 5, 2027') && after.includes('₱7,500.00 paid of ₱15,000.00'), 'B3 after payment does not show installment 4');
}
