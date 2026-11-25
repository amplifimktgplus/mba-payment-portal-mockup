// visual-gates (plan Task 10, Step 2): the client-visual-verify deterministic gates on the
// states the CEO sees, driven through the real UI (Juan's B3/B8 sit behind OTP, so a bare URL
// cannot reach them).
//
// The gate code is NOT re-implemented here: gateBatch() and pageWalker() are read verbatim from
// the skill's own .claude/skills/client-visual-verify/scripts/verify.mjs at run time.
//
// Hard gates (fail the scenario): h-overflow > 0, contrast (high-confidence) findings, broken
// images, drawer leaks. Console/page errors are failed by the e2e harness itself.
// Tap targets < 44px are reported for every breakpoint <= 768 and fail the scenario for the
// borrower view (a phone-first surface). MBA view at 768/375 is Tier 3 (D§15): reported only.

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openHero, verifyFromB1, screenSel } from './borrower-happyPath.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = resolve(ROOT, '..', '..', '.claude', 'skills', 'client-visual-verify', 'scripts', 'verify.mjs');
const REVEAL = '.reveal,.wow-reveal,.wow-stagger,[data-reveal]';

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`visual-gates: ${name} not found in ${SKILL}`);
  const end = src.indexOf('\n}\n', start);
  return src.slice(start, end + 2);
}

const BPS = {
  borrower: [
    { w: 1440, h: 900 },
    { w: 1024, h: 1366 },
    { w: 768, h: 1024 },
    { w: 375, h: 812 },
  ],
  mba: [
    { w: 1440, h: 900 },
    { w: 1024, h: 1366 },
    { w: 768, h: 1024 },
    { w: 375, h: 812 },
  ],
};

export default async function visualGates(page, t) {
  t.assert(existsSync(SKILL), `client-visual-verify script not found at ${SKILL}`);
  const src = readFileSync(SKILL, 'utf8');
  const gateBatch = extractFn(src, 'gateBatch');
  const pageWalker = extractFn(src, 'pageWalker');
  const results = [];
  const failures = [];

  async function gate(view, label) {
    for (const { w, h } of BPS[view]) {
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
      await page.mouse.move(2, h - 2); // park the cursor so no control is captured in :hover
      await t.settle();
      await t.sleep(250);
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), { timeout: 3000, polling: 50 }).catch(() => {});
      await page.evaluate(() => window.scrollTo(0, 0));
      const g = await page.evaluate(`(${gateBatch})(${JSON.stringify(REVEAL)})`);
      const contrast = await page.evaluate(`(${pageWalker})()`);
      await page.evaluate(() => window.scrollTo(0, 0));
      const hard = contrast.filter((f) => f.confidence === 'high');
      const shot = `cvv-${view}-${label}-${w}`;
      await t.screenshot(shot, { fullPage: w === 1440 || w === 375 });
      const fails = [];
      if (g.overflow > 0) fails.push(`h-overflow ${g.overflow}px`);
      if (hard.length) fails.push(`${hard.length} contrast: ${hard.map((f) => `${f.path} "${f.text}" ${f.ratio}:1 (${f.fg} on ${f.bg})`).join(' | ')}`);
      if (g.broken.length) fails.push(`broken images ${g.broken.join(',')}`);
      if (g.drawerLeak.length) fails.push(`drawer leak ${g.drawerLeak.join(',')}`);
      // Exact list of sub-44 taps (the skill's list is capped at 12 and by class only).
      const taps = w <= 768 ? await page.evaluate(() => {
        const inter = [...document.querySelectorAll('a[href],button,[role=button],input,select')];
        return inter.filter((el) => {
          const c = getComputedStyle(el);
          if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) < 0.05) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
        }).map((el) => {
          const r = el.getBoundingClientRect();
          const id = el.dataset.testid ? `[${el.dataset.testid}]` : '';
          const txt = (el.textContent || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 24);
          return `${el.tagName.toLowerCase()}${id} "${txt}" ${Math.round(r.width)}x${Math.round(r.height)}`;
        });
      }) : [];
      if (view === 'borrower' && taps.length) fails.push(`${taps.length} sub-44px taps: ${taps.join(' | ')}`);
      const row = { view, label, w, overflow: g.overflow, contrastHard: hard.length, contrastLow: contrast.length - hard.length, broken: g.broken.length, imgs: g.imgCount, h1min: g.h1min, docH: g.docH, taps, fails };
      results.push(row);
      const tapNote = w <= 768 ? ` · ${taps.length} sub-44 taps${taps.length && view === 'mba' ? ' (report-only, Tier 3)' : ''}` : '';
      t.log(`${fails.length ? 'FAIL' : 'ok  '} ${view}/${label} ${w}px — overflow ${g.overflow}, contrast hard ${hard.length} (low ${contrast.length - hard.length}), broken ${g.broken.length}/${g.imgCount} imgs${tapNote}${fails.length ? ` :: ${fails.join(' ; ')}` : ''}`);
      if (view === 'mba' && taps.length && w <= 768) t.log(`     mba taps ${w}: ${taps.slice(0, 8).join(' | ')}${taps.length > 8 ? ` …+${taps.length - 8}` : ''}`);
      if (fails.length) failures.push(`${view}/${label}@${w}: ${fails.join(' ; ')}`);
    }
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    await t.settle();
  }

  // ---- Borrower: Juan B3 ----
  await openHero(t, 'juan');
  await t.waitUntil(() => window.location.hash.startsWith('#/b/t/'));
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  // Close any toasts so they do not sit over content in the gate run.
  await page.evaluate(() => document.querySelectorAll('#toast-root .toast').forEach((n) => n.remove()));
  // Open the full schedule: with <details> closed, the walker scores its hidden rows against the
  // page backdrop (checkVisibility() === false) — a false positive. Open = every row really painted.
  await t.click('.bsched > summary');
  t.assert(await page.$eval('.bsched', (d) => d.open), 'schedule did not open');
  await gate('borrower', 'B3');

  // ---- Borrower: Juan B8 ----
  await t.click('pay-now');
  await t.waitFor(screenSel('B4'));
  await t.click('outcome-success');
  await t.click('checkout-pay');
  await t.waitFor(screenSel('B8'), { timeout: 8000 });
  await page.evaluate(() => document.querySelectorAll('#toast-root .toast').forEach((n) => n.remove()));
  await gate('borrower', 'B8');
  const txnId = await t.state((s) => s.borrower.attemptId);

  // ---- MBA: dashboard, account detail, transaction detail ----
  await t.click('view-mba');
  await t.goto('#/m/dashboard');
  await t.waitFor('page-title');
  await page.evaluate(() => document.querySelectorAll('#toast-root .toast').forEach((n) => n.remove()));
  await gate('mba', 'dashboard');

  await t.goto('#/m/accounts/ac_juan');
  await t.waitFor('page-title');
  await gate('mba', 'account-juan');

  await t.goto(`#/m/transactions/${txnId}`);
  await t.waitFor('page-title');
  await gate('mba', 'txn-detail');

  writeFileSync(join(ROOT, 'verify', 'shots', 'cvv-results.json'), JSON.stringify(results, null, 2));
  t.assert(failures.length === 0, `client-visual-verify hard gates failed:\n  ${failures.join('\n  ')}`);
}
