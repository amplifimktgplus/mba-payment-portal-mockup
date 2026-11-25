// polish (pre-demo review fixes P1–P6):
//   P1 prefilled money inputs select their whole value on click, so typing replaces it;
//   P2 "Send payment link" is disabled (with a reason) when there is nothing to collect;
//   P3 the Overdue aging report states its split, and it reconciles with the Overdue KPI;
//   P4 Mark's Demo tools shortcut lands on B0 with his reference prefilled (still private);
//   P5 arrangement ids are shown as MBA-ARR-xxxxx (routes keep the raw id);
//   P6 a route change (link, hash, Back) closes any open modal.

import { openHero, screenSel } from './borrower-happyPath.mjs';

const RAW_ARR_ID = /\bar_[a-z0-9]+\b/i;
const ARR_REF = /MBA-ARR-\d{5}/;
const centavos = (txt) => Math.round(Number(String(txt).replace(/[^\d.]/g, '')) * 100);

export default async function polish(page, t) {
  const bodyText = () => page.evaluate(() => document.body.innerText);
  const value = (testid) => page.$eval(`[data-testid="${testid}"]`, (el) => el.value);
  const modalGone = async (testid, label) => {
    await t.settle();
    t.assert(!(await t.exists(testid)), `${label}: ${testid} is still open`);
    t.assert(!(await t.exists('.modal-backdrop')), `${label}: a modal backdrop is still on screen`);
    t.assert(!(await page.evaluate(() => document.documentElement.classList.contains('has-modal'))), `${label}: html.has-modal left behind`);
  };
  await t.waitFor('page-title');

  // ------------------------------------------------------------------ P3 reports: aging split
  await t.goto('#/m/reports');
  await t.waitFor('aging-split');
  const kpiCount = Number(await t.text('[data-testid="rep-kpi-overdue"] .kpi-value'));
  const kpiSub = await t.text('[data-testid="rep-kpi-overdue"] .kpi-sub');
  const split = await page.$eval('[data-testid="aging-split"]', (el) => ({ ...el.dataset, text: el.textContent }));
  const agingRows = await page.$$eval('[data-testid="report-table-aging"] tbody tr', (trs) => trs.map((tr) => [...tr.querySelectorAll('td, th')].map((c) => c.textContent.trim())));
  const agingTotal = agingRows.reduce((s, r) => ({ count: s.count + Number(r[1].replace(/,/g, '')), amount: s.amount + centavos(r[2]) }), { count: 0, amount: 0 });
  const kpiState = await t.state((s) => window.__MBA__.ctx.selectors.kpis(s).overdue);
  t.assert(Number.isFinite(kpiCount) && kpiCount === kpiState.count, `KPI tile ${kpiCount} vs kpis() ${kpiState.count}`);
  t.assert(Number(split.activeCount) === kpiState.count && Number(split.activeAmount) === kpiState.amount,
    `active part ${split.activeCount}/${split.activeAmount} must equal the Overdue KPI ${kpiState.count}/${kpiState.amount}`);
  t.assert(Number(split.activeCount) + Number(split.defaultedCount) + Number(split.otherCount) === agingTotal.count,
    `active + defaulted + other counts (${split.activeCount}+${split.defaultedCount}+${split.otherCount}) ≠ aging total ${agingTotal.count}`);
  t.assert(Number(split.activeAmount) + Number(split.defaultedAmount) + Number(split.otherAmount) === agingTotal.amount,
    `active + defaulted + other amounts ≠ aging total ${agingTotal.amount}`);
  t.assert(split.text.includes('the Overdue installments figure') && kpiSub.includes(split.text.match(/₱[\d,]+\.\d{2}/)[0]),
    `split text should name the KPI and its amount: "${split.text}" / KPI "${kpiSub}"`);
  t.log(`P3 aging: ${agingTotal.count} = ${split.activeCount} active + ${split.defaultedCount} defaulted (+${split.otherCount} other); KPI ${kpiCount} — "${split.text.trim()}"`);
  await page.$eval('[data-testid="report-aging"]', (el) => el.scrollIntoView({ block: 'center' }));
  await t.screenshot('polish-reports-aging-1440');

  // ------------------------------------------------------------------ P2 send link: disabled states
  const sendBtn = async (accountId) => {
    await t.goto(`#/m/accounts/${accountId}`);
    await t.waitFor('send-link');
    return page.$eval('[data-testid="send-link"]', (b) => ({ disabled: b.disabled, title: b.getAttribute('title') }));
  };
  const ben = await sendBtn('ac_ben');
  t.assert(ben.disabled && ben.title === 'Arrangement defaulted: agree a new arrangement first', `Ben: ${JSON.stringify(ben)}`);
  await t.screenshot('polish-account-ben-1440');
  const settledId = await t.state((s) => Object.values(s.accounts).find((a) => a.status === 'settled').id);
  const settled = await sendBtn(settledId);
  t.assert(settled.disabled && settled.title === 'Nothing to collect: the arrangement is complete', `${settledId}: ${JSON.stringify(settled)}`);
  for (const id of ['ac_mark', 'ac_juan', 'ac_ana', 'ac_maria']) {
    const b = await sendBtn(id);
    t.assert(!b.disabled && !b.title, `${id} still needs a link, button must stay enabled: ${JSON.stringify(b)}`);
  }
  // Ana's final payment (through the real pipeline) → Settled → the button disables.
  await page.evaluate(() => {
    const { store, ctx: { actions: A } } = window.__MBA__;
    A.openByToken(store, 'Ky8dNf3GqW6tZp2XbM7rLs');
    A.verifyOtp(store, A.sendOtp(store).code);
    A.beginCheckout(store);
    const r = A.startCheckout(store, { method: 'GCash', outcome: 'success' });
    A.deliverWebhook(store, r.attemptId, 'paid');
    A.exitBorrower(store);
  });
  t.assert((await t.state((s) => s.accounts.ac_ana.status)) === 'settled', 'Ana should be settled after her final payment');
  const ana = await sendBtn('ac_ana');
  t.assert(ana.disabled && ana.title === 'Nothing to collect: the arrangement is complete', `Ana settled: ${JSON.stringify(ana)}`);
  t.assert(await page.$eval('[data-testid="revoke-link"]', (b) => !b.disabled), 'Revoke link is unchanged (Ana still has an active link)');
  await t.screenshot('polish-account-ana-settled-1440');
  t.log(`P2 disabled: ac_ben ("${ben.title}"), ${settledId} + ac_ana settled ("${ana.title}"); enabled: mark, juan, maria`);

  // ------------------------------------------------------------------ P1 create: click + type replaces
  await t.goto('#/m/arrangements/new?account=ac_mark');
  await t.waitFor('arr-new-total');
  t.assert((await value('arr-new-total')) === '8800.00', `prefill: ${await value('arr-new-total')}`);
  await t.click('arr-new-total');
  await page.keyboard.type('8000');
  await t.settle();
  t.assert((await value('arr-new-total')) === '8000', `create total after click + type: "${await value('arr-new-total')}"`);
  t.assert((await t.textOf('arr-preview-total')).includes('₱8,000.00'), `preview total: ${await t.textOf('arr-preview-total')}`);
  // P1 also covers the prefilled installment count (same append trap: "6" + "4" → "64").
  t.assert((await value('arr-new-count')) !== '', 'installments should be prefilled');
  await t.click('arr-new-count');
  await page.keyboard.type('4');
  await t.settle();
  t.assert((await value('arr-new-count')) === '4', `create installments after click + type: "${await value('arr-new-count')}"`);
  await t.screenshot('polish-arr-new-1440');
  await t.click('arr-create-submit');
  await t.waitUntil(() => /^#\/m\/arrangements\/ar_\d+$/.test(window.location.hash));
  const newId = (await page.evaluate(() => window.location.hash)).split('/').pop();
  await t.waitFor('[data-testid="arr-status"][data-status="active"]');

  // ------------------------------------------------------------------ P5 new arrangement shows MBA-ARR
  const head = await t.text('.page-arrangements');
  const wantNew = `MBA-ARR-${newId.slice(3).padStart(5, '0')}`;
  t.assert(head.includes(`Arrangement ${wantNew} · version 1`.toUpperCase()) || head.includes(`Arrangement ${wantNew} · version 1`), `new arrangement eyebrow should show ${wantNew}`);
  t.assert(!RAW_ARR_ID.test(await bodyText()), `raw arrangement id on ${newId}: ${(await bodyText()).match(RAW_ARR_ID)}`);
  t.log(`P1/P5 created ${newId} (route kept) shown as ${wantNew}`);

  // ------------------------------------------------------------------ P1 revise + P5 + P6 (hash change)
  await t.goto('#/m/arrangements/ar_juan');
  await t.waitFor('arr-revise');
  const juanText = await bodyText();
  t.assert(ARR_REF.test(juanText) && !RAW_ARR_ID.test(juanText), `Juan's arrangement page: ${juanText.match(RAW_ARR_ID)}`);
  await t.screenshot('polish-arr-juan-1440');
  await t.click('arr-revise');
  await t.waitFor('arr-revise-modal');
  t.assert((await value('arr-revise-total')) === '15000.00', `revise prefill: ${await value('arr-revise-total')}`);
  await t.click('arr-revise-total');
  await page.keyboard.type('15500');
  await t.settle();
  t.assert((await value('arr-revise-total')) === '15500', `revise total after click + type: "${await value('arr-revise-total')}"`);
  await t.click('arr-revise-count');
  await page.keyboard.type('3');
  await t.settle();
  t.assert((await value('arr-revise-count')) === '3', `revise installments after click + type: "${await value('arr-revise-count')}"`);
  t.assert(!RAW_ARR_ID.test(await t.text('[data-testid="arr-revise-modal"]')), 'revise modal eyebrow shows a raw id');
  await t.screenshot('polish-arr-revise-1440');
  await t.goto('#/m/dashboard');
  await modalGone('arr-revise-modal', 'P6 hash change');
  t.assert((await t.state((s) => s.arrangements.ar_juan.status)) === 'partially_paid', 'closing the modal by navigation must not revise');

  // ------------------------------------------------------------------ P5 list, search, request link
  await t.goto('#/m/arrangements');
  await t.waitFor('arr-table');
  t.assert(!RAW_ARR_ID.test(await t.text('[data-testid="arr-table"]')), 'arrangement list shows raw ids');
  const juanRef = await page.evaluate(() => window.__MBA__.ctx.format.arrangementRef('ar_juan'));
  await t.type('arr-filter-q', juanRef);
  await t.click('arr-filter-apply');
  const hits = await page.$$eval('[data-testid="arr-table"] tbody tr[data-testid]', (rs) => rs.map((r) => r.dataset.testid));
  t.assert(hits.length === 1 && hits[0] === 'arr-row-ar_juan', `search by ${juanRef}: ${hits.join(',')}`);
  await t.click('arr-filter-reset');
  const reqId = await t.state((s) => Object.values(s.requests).find((r) => r.arrangementId === 'ar_juan' && ['created', 'sent', 'opened'].includes(r.status)).id);
  await t.goto(`#/m/requests/${reqId}`);
  const rqLink = await page.$eval('[data-testid="rq-arr-link"]', (a) => ({ text: a.textContent.trim(), href: a.getAttribute('href') }));
  t.assert(rqLink.text === `${juanRef} · version 1` && rqLink.href === '#/m/arrangements/ar_juan', `request → arrangement link: ${JSON.stringify(rqLink)}`);
  t.log(`P5 ar_juan → ${juanRef}; list search hit; request link ${JSON.stringify(rqLink)}`);
  // Sweep: no raw arrangement id in the visible text of the other MBA screens either.
  const sweep = [];
  for (const route of ['#/m/dashboard', '#/m/requests', '#/m/transactions', '#/m/reconciliation', '#/m/reports', '#/m/accounts/ac_ben', '#/m/arrangements/ar_ben']) {
    await t.goto(route);
    await t.waitFor('page-title');
    const m = (await bodyText()).match(RAW_ARR_ID);
    t.assert(!m, `${route} shows a raw arrangement id: ${m && m[0]}`);
    sweep.push(route);
  }
  await t.goto('#/m/accounts/ac_juan');
  for (const tab of ['overview', 'contacts', 'arrangement', 'requests', 'transactions', 'audit']) {
    await t.click(`tab-${tab}`);
    const m = (await bodyText()).match(RAW_ARR_ID);
    t.assert(!m, `ac_juan ${tab} tab shows a raw arrangement id: ${m && m[0]}`);
  }
  await t.click('notifications');
  await t.waitFor('notif-panel');
  t.assert(!RAW_ARR_ID.test(await t.text('[data-testid="notif-panel"]')), 'notifications show a raw arrangement id');
  await t.click('notifications');
  t.log(`P5 sweep clean: ${sweep.length} routes, 6 account tabs, notifications`);

  // ------------------------------------------------------------------ P6 browser Back closes a modal
  await t.goto('#/m/accounts/ac_juan');
  await t.click('send-link');
  await t.waitFor('send-link-modal');
  await page.evaluate(() => window.history.back());
  await t.waitUntil(() => window.location.hash !== '#/m/accounts/ac_juan');
  await modalGone('send-link-modal', 'P6 Back');
  // The payout modal also closes itself on hashchange: no double-close error (console errors fail).
  await t.goto('#/m/reconciliation?tab=payouts');
  await t.click('[data-testid^="payout-row-"] td:first-child');
  await t.waitFor('payout-modal');
  await t.goto('#/m/dashboard');
  await modalGone('payout-modal', 'P6 payout modal');
  t.log('P6 revise modal (hash), send-link modal (Back), payout modal (hash) all closed');

  // ------------------------------------------------------------------ P4 Mark → B0 with reference
  await openHero(t, 'mark');
  await t.waitFor(screenSel('B0'));
  t.assert((await page.evaluate(() => window.location.hash)) === '#/b', 'Mark lands on #/b');
  t.assert((await value('ref-input')) === 'MBA-REF-2026-003390', `B0 prefill: ${await value('ref-input')}`);
  const b0 = await bodyText();
  for (const f of ['Sample Bank', 'Demo Lender', 'Telco Demo', '₱', 'MBA-REF', 'MBA-TXN', 'MBA-REQ', '••••']) t.assert(!b0.includes(f), `B0 (Mark) page text contains "${f}"`);
  t.assert((await t.state((s) => [s.borrower.ref, s.borrower.token, s.borrower.otp])).every((x) => !x), 'nothing opened before Continue');
  await t.screenshot('polish-B0-mark-1440', { fullPage: true });
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await t.settle();
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  t.assert(ov <= 0, `B0 @375 horizontal overflow ${ov}px`);
  await t.screenshot('polish-B0-mark-375', { fullPage: true });
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await t.settle();
  await t.click('ref-continue');
  await t.waitFor(screenSel('B2'));
  t.assert((await t.text('[data-screen]')).includes('If this reference is valid'), 'B2 by reference keeps the generic message');
  t.log('P4 Mark → B0 (#/b) with MBA-REF-2026-003390 prefilled → Continue → B2');
}
