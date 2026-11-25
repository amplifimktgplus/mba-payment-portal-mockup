// approvalFlow (plan Task 8). Core of the plan's scenario:
//   1. role Agent → create an arrangement for Mark → pending_approval; Approve is disabled with
//      "Requires Supervisor".
//   2. switch to Supervisor → approve → active (link + first request created).
// Then the rest of the Task 8 screens, so every click there stays covered:
//   attachments (upload + new version), revise (same link, old version superseded), reject (reason
//   required), cancel (link revoked), add creditor (Admin), import wizard (template, partial with
//   error-rows CSV, accepted, rejected duplicates).

import { writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export default async function approvalFlow(page, t) {
  const hash = () => page.evaluate(() => window.location.hash);
  const setRole = async (role) => {
    await page.select('[data-testid="role-switcher"]', role);
    await t.settle();
    await t.waitUntil((r) => window.__MBA__.store.get().role === r, { arg: role });
  };
  const setValue = async (testid, value) => {
    await page.$eval(`[data-testid="${testid}"]`, (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await t.settle();
  };
  const waitDownload = async (prefix) => {
    for (let i = 0; i < 60; i++) {
      const f = readdirSync(t.downloads).find((n) => n.startsWith(prefix) && !n.endsWith('.crdownload'));
      if (f) return f;
      await t.sleep(50);
    }
    throw new Error(`download ${prefix}* did not arrive`);
  };

  // ---------------------------------------------------------------- 1. Agent drafts for Mark
  await t.waitFor('page-title');
  await setRole('agent');
  await t.goto('#/m/arrangements/new?account=ac_mark');
  await t.waitFor('arr-new-total');
  t.assert((await t.textOf('arr-new-route')).includes('Supervisor'), 'agent route note should mention Supervisor approval');
  await t.type('arr-new-total', '8400'); // Mark owes ₱8,800; a total above that is refused (over_balance)
  await setValue('arr-new-count', '3');
  await setValue('arr-new-firstdue', '2026-12-15');
  const previewRows = await page.$$eval('[data-testid="arr-preview-table"] tbody tr', (r) => r.length);
  t.assert(previewRows === 3, `live preview should show 3 installments, got ${previewRows}`);
  t.assert((await t.textOf('arr-preview-total')).includes('₱8,400.00'), `preview total: ${await t.textOf('arr-preview-total')}`);
  t.assert((await t.textOf('arr-create-submit')).includes('Submit for approval'), 'agent submit label');
  await t.click('arr-create-submit');
  await t.waitUntil(() => /^#\/m\/arrangements\/ar_/.test(window.location.hash));
  const arrId = (await hash()).split('/').pop();
  await t.waitFor('[data-testid="arr-status"][data-status="pending_approval"]');
  t.assert((await t.state((s) => s.accounts.ac_mark.status)) === 'negotiating', 'Mark should stay negotiating while pending');
  const approve = await page.$eval('[data-testid="arr-approve"]', (b) => ({ disabled: b.disabled, text: b.textContent, hint: b.getAttribute('data-hint') }));
  t.assert(approve.disabled, 'Approve must be disabled for an Agent');
  t.assert(approve.hint === 'Requires Supervisor' && approve.text.includes('Requires Supervisor'), `Approve hint: ${JSON.stringify(approve)}`);
  t.assert(await page.$eval('[data-testid="arr-reject"]', (b) => b.disabled), 'Reject must be disabled for an Agent');
  t.log(`agent drafted ${arrId} → pending_approval; Approve disabled ("${approve.hint}")`);
  await t.screenshot('approval-pending-agent');

  // ---------------------------------------------------------------- 2. Supervisor approves
  await setRole('supervisor');
  await t.waitUntil(() => { const b = document.querySelector('[data-testid="arr-approve"]'); return b && !b.disabled; });
  await t.click('arr-approve');
  await t.waitFor('[data-testid="arr-status"][data-status="active"]');
  const after = await t.state(`(s) => {
    const a = s.arrangements['${arrId}'];
    const tok = Object.values(s.tokens).find((x) => x.lineageId === a.lineageId);
    const reqs = Object.values(s.requests).filter((r) => r.arrangementId === a.id && ['created','sent','opened'].includes(r.status));
    return { status: a.status, approvedBy: a.approvedBy, token: tok && tok.status, tokenId: tok && tok.token, openReqs: reqs.length, account: s.accounts[a.accountId].status };
  }`);
  t.assert(after.status === 'active' && after.approvedBy === 'supervisor', `after approve: ${JSON.stringify(after)}`);
  t.assert(after.token === 'active' && after.openReqs === 1 && after.account === 'arrangement_active', `link/request/account after approve: ${JSON.stringify(after)}`);
  t.assert((await t.textOf('arr-link-status')).includes('active'), 'link status chip should read active');
  t.log(`supervisor approved → ${JSON.stringify(after)}`);
  await t.screenshot('approval-active');

  // ---------------------------------------------------------------- attachments: upload twice → v1, v2
  const file = join(t.downloads, 'Signed agreement Mark V.pdf');
  writeFileSync(file, '%PDF-1.4 demo');
  for (const want of ['v1', 'v2']) {
    const input = await page.$('[data-testid="attachment-input"]');
    await input.uploadFile(file);
    await t.waitUntil((v) => [...document.querySelectorAll('[data-testid="attachments-table"] tbody tr')].some((tr) => tr.textContent.includes('Signed agreement Mark V.pdf') && tr.textContent.includes(v)), { arg: want });
  }
  const atts = await t.state(`(s) => Object.values(s.attachments).filter((a) => a.arrangementId === '${arrId}').map((a) => a.version).sort().join(',')`);
  t.assert(atts === '1,2', `attachment versions: ${atts}`);

  // ---------------------------------------------------------------- revise: new version, same link
  await t.click('arr-revise');
  await t.waitFor('arr-revise-modal');
  await setValue('arr-revise-total', '8800');
  await setValue('arr-revise-count', '4');
  t.assert((await page.$$eval('[data-testid="arr-revise-preview-table"] tbody tr', (r) => r.length)) === 4, 'revise preview rows');
  await t.click('arr-revise-confirm');
  await t.waitUntil((old) => /^#\/m\/arrangements\/ar_/.test(window.location.hash) && !window.location.hash.endsWith(old), { arg: arrId });
  const v2 = (await hash()).split('/').pop();
  const rev = await t.state(`(s) => {
    const o = s.arrangements['${arrId}'], n = s.arrangements['${v2}'];
    const toks = Object.values(s.tokens).filter((x) => x.lineageId === n.lineageId);
    return { old: o.status, neu: n.status, ver: n.version, total: n.total, tokens: toks.length, token: toks[0] && toks[0].token, tokStatus: toks[0] && toks[0].status };
  }`);
  t.assert(rev.old === 'superseded' && rev.neu === 'active' && rev.ver === 2 && rev.total === 880000, `revise: ${JSON.stringify(rev)}`);
  t.assert(rev.tokens === 1 && rev.token === after.tokenId && rev.tokStatus === 'active', `revise must keep the same link: ${JSON.stringify(rev)}`);
  t.assert(await t.exists('[data-testid="arr-versions"] .arr-version:nth-child(2)'), 'versions card should list v2 and v1');

  // ---------------------------------------------------------------- reject: reason required → draft
  const pendingId = await t.state("(s) => Object.values(s.arrangements).filter((a) => a.status === 'pending_approval').map((a) => a.id).sort()[0]");
  await t.goto(`#/m/arrangements/${pendingId}`);
  await t.click('arr-reject');
  await t.waitFor('arr-reject-modal');
  await t.click('arr-reject-confirm');
  await t.waitFor('arr-reject-error');
  await t.type('arr-reject-reason', 'Move the first due date to the 15th, after payday.');
  await t.click('arr-reject-confirm');
  await t.waitFor('[data-testid="arr-status"][data-status="draft"]');
  t.assert((await t.textOf('arr-note')).includes('after payday'), 'draft note should quote the rejection reason');

  // ---------------------------------------------------------------- cancel (v2 of Mark): link revoked
  await t.goto(`#/m/arrangements/${v2}`);
  await t.click('arr-cancel');
  await t.waitFor('arr-cancel-confirm');
  await t.click('arr-cancel-confirm-ok');
  await t.waitFor('[data-testid="arr-status"][data-status="cancelled"]');
  const tokAfterCancel = await t.state(`(s) => Object.values(s.tokens).find((x) => x.token === '${after.tokenId}').status`);
  t.assert(tokAfterCancel === 'revoked', `cancel should revoke the link, got ${tokAfterCancel}`);

  // ---------------------------------------------------------------- list: status tile filters
  await t.goto('#/m/arrangements');
  await t.click('arr-tile-cancelled');
  const cancelledRows = await page.$$eval('[data-testid="arr-table"] tbody tr', (rs) => rs.map((r) => r.querySelector('[data-status]')?.dataset.status));
  t.assert(cancelledRows.length > 0 && cancelledRows.every((x) => x === 'cancelled'), `cancelled filter rows: ${cancelledRows.join(',')}`);
  await t.click('arr-tile-all');

  // ---------------------------------------------------------------- creditors: add (Admin only)
  await setRole('agent');
  await t.goto('#/m/creditors/new');
  await t.waitFor('cr-new-denied');
  t.assert(await page.$eval('[data-testid="cr-new-submit"]', (b) => b.disabled), 'Add creditor must be disabled for an Agent');
  await setRole('admin');
  await t.type('cr-new-name', 'Metro Lending (demo)');
  await setValue('cr-new-commission', '12.5');
  await t.click('cr-new-submit');
  await t.waitUntil(() => /^#\/m\/creditors\/cr_/.test(window.location.hash));
  t.assert((await t.textOf('page-title')) === 'Metro Lending (demo)', `creditor title: ${await t.textOf('page-title')}`);
  await t.goto('#/m/creditors');
  t.assert((await t.text('[data-testid="cr-table"]')).includes('Metro Lending (demo)'), 'new creditor in the list');

  // ---------------------------------------------------------------- import wizard
  const newBefore = await t.state("(s) => Object.values(s.accounts).filter((a) => a.portfolioId === 'pf_tdb' && a.status === 'new').length");
  await t.goto('#/m/portfolios/pf_tdb/import');
  await t.click('import-template');
  const tpl = await waitDownload('mba-import-template');
  t.assert(tpl === 'mba-import-template.csv', `template file ${tpl}`);
  await t.click('import-next');
  await t.click('import-sample-errors');
  await t.click('import-run');
  await t.waitFor('[data-testid="import-status"][data-status="partial"]');
  t.assert((await t.textOf('import-summary')) === '9 of 12 rows accepted', `summary: ${await t.textOf('import-summary')}`);
  t.assert((await page.$$eval('[data-testid="import-errors"] tbody tr', (r) => r.length)) === 3, '3 error rows listed');
  await t.click('import-errors-csv');
  const errCsv = await waitDownload('import-errors-');
  await t.screenshot('import-result-partial');
  await t.click('import-again');
  await t.click('import-sample-clean');
  await t.click('import-run');
  await t.waitFor('[data-testid="import-status"][data-status="accepted"]');
  await t.click('import-again');
  await t.click('import-run');
  await t.waitFor('[data-testid="import-status"][data-status="rejected"]');
  const newAfter = await t.state("(s) => Object.values(s.accounts).filter((a) => a.portfolioId === 'pf_tdb' && a.status === 'new').length");
  t.assert(newAfter - newBefore === 21, `new accounts added: ${newAfter - newBefore} (want 9 + 12)`);
  t.log(`import: partial 9/12 (${errCsv}), clean accepted 12/12, duplicate re-import rejected; +${newAfter - newBefore} new accounts`);

  // "View the new accounts" lands on the portfolio's accounts tab filtered to New.
  await t.goto('#/m/portfolios/pf_dla/import');
  await t.click('import-next');
  await t.click('import-run');
  await t.waitFor('[data-testid="import-status"][data-status="accepted"]');
  await t.click('import-view-accounts');
  await t.waitUntil(() => window.location.hash === '#/m/portfolios/pf_dla');
  const statuses = await page.$$eval('[data-testid="pf-accounts"] tbody tr [data-status]', (xs) => [...new Set(xs.map((x) => x.dataset.status))]);
  t.assert(statuses.length === 1 && statuses[0] === 'new', `accounts tab filter: ${statuses.join(',')}`);
}
