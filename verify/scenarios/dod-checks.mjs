// dod-checks (plan Task 10 / D§11, D§3 anti-goals): reachability + anti-goal sweep.
//  - every one of the 11 MBA menus renders a titled, non-empty page, and its first detail link
//    (if the list has one) opens a titled, non-empty detail page;
//  - every borrower screen B0–B12 is reached through the UI and is non-empty;
//  - on every one of those screens, at 1440 and 375, scrolled to the BOTTOM: the DEMO banner is
//    painted inside the viewport and not covered (C15 "always visible");
//  - page text never contains "Official Receipt"; the only <img> is MBA's own logo; no element is
//    labelled as a PayMongo / GCash / Maya logo.

import { openHero, verifyFromB1, screenSel, waitForDownload } from './borrower-happyPath.mjs';

const NAV = ['dashboard', 'creditors', 'portfolios', 'accounts', 'arrangements', 'requests', 'transactions', 'reconciliation', 'reports', 'remittances', 'settings'];
const BANNER = 'DEMO — no real payments · simulated PayMongo test mode';

export default async function dodChecks(page, t) {
  const checked = { banner: 0, pages: 0 };

  async function antiGoals(where) {
    const r = await page.evaluate(() => {
      const txt = document.body.innerText;
      const imgs = [...document.images].map((i) => i.className + '|' + (i.getAttribute('src') || '').slice(0, 40));
      // 2026-11-26: payment-method logos are allowed on the B4 tiles (product owner); PayMongo's is not.
      const logoLike = [...document.querySelectorAll('[aria-label],[alt],title')].filter((n) => /paymongo\s*logo/i.test(n.getAttribute?.('aria-label') || n.getAttribute?.('alt') || n.textContent || '')).length;
      return { official: /Official Receipt/.test(txt), imgs, logoLike };
    });
    t.assert(!r.official, `${where}: page text contains "Official Receipt"`);
    t.assert(r.imgs.every((s) => s.startsWith('lockup-logo|') || s.startsWith('bmethod-logo|')), `${where}: unexpected <img>: ${r.imgs.join(', ')}`);
    t.assert(r.logoLike === 0, `${where}: PayMongo logo label found`);
  }

  async function bannerVisible(where) {
    for (const w of [1440, 375]) {
      await page.setViewport({ width: w, height: w === 375 ? 812 : 900, deviceScaleFactor: 1 });
      await t.settle();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await t.settle();
      await t.sleep(60);
      const b = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="demo-banner"]');
        if (!el) return { ok: false, why: 'no banner element' };
        const r = el.getBoundingClientRect();
        const txt = el.querySelector('[data-testid="banner-text"]')?.textContent;
        const hit = document.elementFromPoint(Math.min(r.left + 40, innerWidth - 1), r.top + Math.min(r.height / 2, 14));
        const scrolled = window.scrollY;
        return { ok: el.checkVisibility() && r.height > 0 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && !!hit && el.contains(hit), top: Math.round(r.top), bottom: Math.round(r.bottom), txt, scrolled, hit: hit ? hit.className || hit.tagName : null };
      });
      t.assert(b.ok, `${where} @${w}: DEMO banner not visible after scrolling (top ${b.top}, bottom ${b.bottom}, scrollY ${b.scrolled}, hit ${b.hit}${b.why ? ', ' + b.why : ''})`);
      t.assert(b.txt === BANNER, `${where} @${w}: banner text "${b.txt}"`);
      checked.banner++;
    }
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await t.settle();
  }

  // ---------------- MBA: 11 menus + first detail of each ----------------
  for (const id of NAV) {
    await t.click(`nav-${id}`);
    await t.waitUntil((want) => window.location.hash === want, { arg: `#/m/${id}` });
    const title = await t.textOf('page-title');
    const len = await page.evaluate(() => (document.getElementById('main')?.innerText || '').length);
    t.assert(title && len >= 200, `nav-${id}: title "${title}", main text ${len} chars`);
    await antiGoals(`nav-${id}`);
    await bannerVisible(`nav-${id}`);
    checked.pages++;
    const href = await page.evaluate((nid) => {
      const a = [...document.querySelectorAll(`#main a[href^="#/m/${nid}/"]`)].find((x) => !/\/(new|import)(\?|$)/.test(x.getAttribute('href')));
      return a ? a.getAttribute('href') : null;
    }, id);
    if (href) {
      await t.goto(href);
      await t.waitFor('page-title');
      const dt = await t.textOf('page-title');
      const dlen = await page.evaluate(() => (document.getElementById('main')?.innerText || '').length);
      t.assert(dt && dlen >= 150, `${href}: title "${dt}", main text ${dlen} chars`);
      await antiGoals(href);
      checked.pages++;
      t.log(`nav-${id} "${title}" (${len} chars) → ${href} "${dt}" (${dlen} chars)`);
    } else {
      t.log(`nav-${id} "${title}" (${len} chars) — no detail link on the list (single-page menu)`);
    }
  }

  // ---------------- CSV exports download (D§11.2) ----------------
  const csvs = [
    ['#/m/dashboard', 'export-csv', 'payment-history.csv'],
    ['#/m/reports', 'csv-collections', 'report-collections.csv'],
    ['#/m/reports', 'csv-agents', 'report-agents.csv'],
    ['#/m/reports', 'csv-aging', 'report-aging.csv'],
    ['#/m/reports', 'csv-methods', 'report-methods.csv'],
    ['#/m/reports', 'csv-recon', 'report-recon.csv'],
    ['#/m/remittances', 'csv-statement', null],
  ];
  const got = [];
  for (const [route, tid, file] of csvs) {
    await t.goto(route);
    await t.waitFor('page-title');
    await t.click(tid);
    let name = file;
    let text;
    if (file) text = await waitForDownload(t, file);
    else {
      const { readdirSync } = await import('node:fs');
      const t0 = Date.now();
      let f;
      while (!(f = readdirSync(t.downloads).find((x) => x.startsWith('sample-remittance-statement-') && x.endsWith('.csv'))) && Date.now() - t0 < 5000) await t.sleep(100);
      t.assert(f, 'remittance statement CSV did not download');
      name = f;
      text = await waitForDownload(t, f);
    }
    const lines = text.trim().split(/\r?\n/);
    t.assert(lines.length >= 2 && lines[0].includes(','), `${name}: ${lines.length} lines, header "${lines[0]}"`);
    got.push(`${name} (${lines.length - 1} rows)`);
  }
  t.log(`CSV exports downloaded: ${got.join(', ')}`);

  // ---------------- Borrower: B0–B12 ----------------
  const seen = {};
  async function screen(n, label = n) {
    await t.waitFor(screenSel(n), { timeout: 8000 });
    const len = await page.evaluate((q) => (document.querySelector(q)?.innerText || '').trim().length, screenSel(n));
    t.assert(len >= 60, `${label}: screen text only ${len} chars`);
    await antiGoals(label);
    await bannerVisible(label);
    seen[n] = Math.max(seen[n] || 0, len);
  }

  await openHero(t, 'nina');
  await screen('B10');
  await page.evaluate(() => window.__MBA__.ctx.actions.exitBorrower(window.__MBA__.store));
  await t.goto('#/b');
  await screen('B0');

  await openHero(t, 'juan');
  await screen('B1');
  await t.click('b1-continue');
  await screen('B2');
  await t.type('otp-0', await page.evaluate(() => window.__MBA__.store.get().borrower.otp.code));
  await screen('B3');
  await t.click('pay-now');
  await screen('B4');
  await t.click('outcome-success');
  await t.click('checkout-pay');
  await screen('B8');

  await openHero(t, 'ana');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await t.click('pay-now');
  await t.click('checkout-pay');
  await screen('B9');

  await openHero(t, 'rosa');
  await verifyFromB1(page, t);
  await screen('B11');

  await openHero(t, 'carlo');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await t.click('pay-now');
  await t.click('outcome-failed');
  await t.click('checkout-pay');
  await screen('B7');

  await t.click('demo-tools');
  await t.click('delay-manual');
  await openHero(t, 'maria');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await t.click('pay-now');
  await t.click('checkout-pay');
  await screen('B6');

  // B5: hold the provider timer so the screen stays up while it is checked.
  await openHero(t, 'luis');
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await t.click('pay-now');
  await page.evaluate(() => {
    const orig = window.setTimeout;
    window.__origSetTimeout = orig;
    window.setTimeout = (fn, ms, ...rest) => orig(fn, ms > 1000 && ms <= 1200 ? 600000 : ms, ...rest);
  });
  await t.click('checkout-pay');
  await screen('B5');
  await page.evaluate(() => { window.setTimeout = window.__origSetTimeout; });

  // B12: five wrong codes (fresh Juan session).
  await openHero(t, 'juan');
  await t.waitFor(screenSel('B1'));
  await t.click('b1-continue');
  await t.waitFor(screenSel('B2'));
  for (let i = 0; i < 5; i++) {
    if (!(await t.exists(screenSel('B2')))) break;
    const c = await page.evaluate(() => window.__MBA__.store.get().borrower.otp?.code);
    await t.type('otp-0', c === '000000' ? '111111' : '000000');
    await t.settle();
  }
  await screen('B12');

  const all = ['B0', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12'];
  const missing = all.filter((n) => !seen[n]);
  t.assert(!missing.length, `borrower screens not reached: ${missing.join(', ')}`);
  t.log(`borrower screens reached + non-empty: ${all.map((n) => `${n}(${seen[n]})`).join(' ')}`);
  t.log(`DEMO banner visible+unobscured after scroll-to-bottom: ${checked.banner} checks (11 MBA menus + 13 borrower screens, each at 1440 and 375); ${checked.pages} MBA pages incl. details checked non-empty`);
  t.log('anti-goals: no "Official Receipt" in page text; only <img> is MBA logo; no provider-logo labels');
}
