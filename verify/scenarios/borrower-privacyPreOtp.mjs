// privacyPreOtp (plan Task 5, D§3 anti-goal): before OTP verification, the page text never shows
// a creditor name, an amount or a reference. Covers B1 and B2 from a link, B0 → B2 by reference
// (valid and unknown), and the generic answer for an unknown reference (no SMS toast).

import { openHero, screenSel } from './borrower-happyPath.mjs';

const FORBIDDEN = ['Sample Bank', 'Demo Lender', 'Telco Demo', '₱', 'MBA-REF', 'MBA-TXN', 'MBA-REQ'];

async function assertPrivate(page, t, label) {
  const text = await page.evaluate(() => document.body.innerText);
  for (const f of FORBIDDEN) t.assert(!text.includes(f), `${label}: page text contains "${f}"`);
  t.log(`${label}: clean (${text.length} chars checked)`);
}

async function startOver(page, t) {
  await page.evaluate(() => window.__MBA__.ctx.actions.exitBorrower(window.__MBA__.store));
  await t.goto('#/b');
  await t.waitFor(screenSel('B0'));
}

export default async function privacyPreOtp(page, t) {
  // Link → B1 → B2.
  await openHero(t, 'juan');
  await t.waitFor(screenSel('B1'));
  await assertPrivate(page, t, 'B1 (link)');
  t.assert((await t.textOf('masked-mobile')).includes('••••7310'), 'B1 must show the masked mobile');
  await t.click('b1-continue');
  await t.waitFor(screenSel('B2'));
  await t.waitFor('otp-toast');
  const toastText = await t.textOf('otp-toast');
  t.assert(/^Demo SMS to ••••7310: Your MBA CONSULT code is \d{6}/.test(toastText), `toast text: ${toastText}`);
  await assertPrivate(page, t, 'B2 (link, with SMS toast)');

  // Wrong code: still private, error shown.
  await t.type('otp-0', '000000' === (await page.evaluate(() => window.__MBA__.store.get().borrower.otp.code)) ? '111111' : '000000');
  await t.waitFor('otp-error');
  t.assert((await t.textOf('otp-error')).includes('4 tries left'), `wrong-code message: ${await t.textOf('otp-error')}`);
  await assertPrivate(page, t, 'B2 (after a wrong code)');

  // Reference entry (valid reference): generic copy, no masked mobile, still private.
  await startOver(page, t);
  await assertPrivate(page, t, 'B0');
  const countSms = () => page.evaluate(() => document.querySelectorAll('[data-testid="otp-toast"]').length);
  const toastsBefore = await countSms();
  t.assert(toastsBefore === 0, `leaving B2 should close the demo SMS toast (${toastsBefore} left)`);
  await t.type('ref-input', 'MBA-REF-2026-004821');
  await t.click('ref-continue');
  await t.waitFor(screenSel('B2'));
  t.assert((await t.text('[data-screen]')).includes('If this reference is valid'), 'B2 by reference must use the generic message');
  t.assert(!(await t.exists('masked-mobile')), 'reference entry must not reveal the masked mobile');
  await assertPrivate(page, t, 'B2 (valid reference)');
  t.assert((await countSms()) === 1, 'a valid reference should send the demo SMS');

  // Unknown reference: identical screen, no SMS (enumeration-safe, V3 §8.2).
  await startOver(page, t);
  await t.type('ref-input', 'MBA-REF-2026-999999');
  await t.click('ref-continue');
  await t.waitFor(screenSel('B2'));
  t.assert((await t.text('[data-screen]')).includes('If this reference is valid'), 'unknown reference must get the same generic message');
  t.assert((await countSms()) === 0, 'an unknown reference must not show an SMS toast');
  await assertPrivate(page, t, 'B2 (unknown reference)');

  // Empty reference: inline error, stays on B0.
  await startOver(page, t);
  await t.click('ref-continue');
  t.assert((await t.text('[data-screen]')).includes('Please enter your reference number'), 'empty reference error');
  t.assert(await t.exists(screenSel('B0')), 'empty reference must stay on B0');
}
