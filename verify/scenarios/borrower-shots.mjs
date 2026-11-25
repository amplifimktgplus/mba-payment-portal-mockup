// Screenshot sweep of every borrower screen (B0–B12 + support sheet) at 1440×900 and 375×812,
// full page, into verify/shots/borrower-<screen>-<width>.png. At 375 it also fails on any
// horizontal overflow. B5 is held on screen by stretching its 1.2 s provider timer for the shot.

import { openHero, verifyFromB1, verifyFromB0Ref, screenSel } from './borrower-happyPath.mjs';

export default async function borrowerShots(page, t) {
  const shot = async (name) => {
    await t.screenshot(`borrower-${name}-1440`, { fullPage: true });
    await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
    await t.settle();
    const ov = await page.evaluate(() => {
      const de = document.documentElement;
      const wide = [...document.querySelectorAll('.bscreen *')].filter((n) => n.getBoundingClientRect().right > de.clientWidth + 0.5).map((n) => n.className || n.tagName).slice(0, 5);
      return { sw: de.scrollWidth, cw: de.clientWidth, wide };
    });
    t.assert(ov.sw <= ov.cw && !ov.wide.length, `${name} @375: horizontal overflow ${ov.sw} > ${ov.cw} (${ov.wide.join(' | ')})`);
    await t.screenshot(`borrower-${name}-375`, { fullPage: true });
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await t.settle();
  };
  const startOver = async () => {
    await page.evaluate(() => window.__MBA__.ctx.actions.exitBorrower(window.__MBA__.store));
    await t.goto('#/b');
    await t.waitFor(screenSel('B0'));
  };

  // B0
  await openHero(t, 'nina'); // any borrower route, then start over at #/b
  await startOver();
  await shot('B0');

  // B1, B2 (with a wrong-code error), B3, support sheet, B4, B8 — Juan.
  await openHero(t, 'juan');
  await t.waitFor(screenSel('B1'));
  await shot('B1');
  await t.click('b1-continue');
  await t.waitFor(screenSel('B2'));
  await t.waitFor('otp-toast');
  await shot('B2');
  const code = await page.evaluate(() => window.__MBA__.store.get().borrower.otp.code);
  await t.type('otp-0', code === '000000' ? '111111' : '000000');
  await t.waitFor('otp-error');
  await shot('B2-error');
  await t.type('otp-0', code);
  await t.waitFor(screenSel('B3'));
  await page.evaluate(() => document.querySelectorAll('[data-testid="toast"] .toast-x, [data-testid="otp-toast"] .toast-x').forEach((b) => b.click()));
  await shot('B3');
  await page.$eval('[data-testid="schedule"]', (d) => { d.open = true; });
  await shot('B3-schedule');
  await page.$eval('[data-testid="schedule"]', (d) => { d.open = false; });
  await t.click('bank-receipt');
  await t.waitFor('support');
  await shot('support-bank');
  await t.click('support-close');
  await t.click('pay-now');
  await t.waitFor(screenSel('B4'));
  await shot('B4');
  await t.click('checkout-pay');
  await t.waitFor(screenSel('B8'), { timeout: 5000 });
  await shot('B8');

  // B9 — Ana.
  await openHero(t, 'ana');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await t.click('pay-now');
  await t.click('checkout-pay');
  await t.waitFor(screenSel('B9'), { timeout: 5000 });
  await shot('B9');

  // B10 — Nina.
  await openHero(t, 'nina');
  await t.waitFor(screenSel('B10'));
  await shot('B10');

  // B11 — Rosa (under review) and Mark (nothing due).
  await openHero(t, 'rosa');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B11'));
  await shot('B11');
  await openHero(t, 'mark');
  await verifyFromB0Ref(page, t);
  await t.waitFor(screenSel('B11'));
  await shot('B11-none');

  // B3 overdue — Luis.
  await openHero(t, 'luis');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await shot('B3-overdue');

  // B7 — Carlo.
  await openHero(t, 'carlo');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await t.click('pay-now');
  await t.click('outcome-failed');
  await t.click('checkout-pay');
  await t.waitFor(screenSel('B7'), { timeout: 5000 });
  await shot('B7');

  // B6 — Maria, manual resolution.
  await t.click('demo-tools');
  await t.click('delay-manual');
  await openHero(t, 'maria');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await t.click('pay-now');
  await t.click('checkout-pay');
  await t.waitFor(screenSel('B6'), { timeout: 5000 });
  await shot('B6');

  // B12 — lockout (Juan, fresh session).
  await openHero(t, 'juan');
  await t.waitFor(screenSel('B1'));
  await t.click('b1-continue');
  await t.waitFor(screenSel('B2'));
  for (let i = 0; i < 5; i++) {
    const c = await page.evaluate(() => window.__MBA__.store.get().borrower.otp?.code);
    if (!(await t.exists(screenSel('B2')))) break;
    await t.type('otp-0', c === '000000' ? '111111' : '000000');
    await t.settle();
  }
  await t.waitFor(screenSel('B12'));
  await shot('B12');

  // B5 — hold the 1.2 s provider timer so the screen can be captured (Luis, success).
  await openHero(t, 'luis');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await t.click('pay-now');
  await page.evaluate(() => {
    const orig = window.setTimeout;
    window.__origSetTimeout = orig;
    // The B5 provider timer is successDelayMs (1200) minus the few ms since the click.
    window.setTimeout = (fn, ms, ...rest) => orig(fn, ms > 1000 && ms <= 1200 ? 600000 : ms, ...rest);
  });
  await t.click('checkout-pay');
  await t.waitFor(screenSel('B5'));
  await t.sleep(1400); // let the pipeline ticks finish
  await shot('B5');
  await page.evaluate(() => { window.setTimeout = window.__origSetTimeout; });
}
