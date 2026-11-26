// tx-attachments (2026-11-26, user request): MBA → Transactions has an "Attachments" column holding
// each borrower's own contract and signed agreement. A chip opens the preview without opening the
// row (mouse and keyboard); the same files show on the transaction detail and the arrangement page;
// a file uploaded during the demo shows an honest placeholder; the column and viewer fit at 375px.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function txAttachments(page, t) {
  const hash = () => page.evaluate(() => window.location.hash);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const first = '[data-testid="tx-table"] tbody tr:first-child';

  // ---- List: the column, and every row's files are that borrower's own.
  await t.goto('#/m/transactions');
  await t.waitFor('tx-table');
  const headers = await page.$$eval('[data-testid="tx-table"] thead th', (ths) => ths.map((th) => th.textContent.trim()));
  t.assert(headers.at(-1) === 'Attachments', `headers: ${headers.join(' | ')}`);
  const audit = await page.evaluate(() => {
    const s = window.__MBA__.store.get();
    return [...document.querySelectorAll('[data-testid="tx-table"] tbody tr')].map((tr) => {
      const id = tr.dataset.testid.replace('tx-row-', '');
      const lineage = s.arrangements[s.requests[s.attempts[id].requestId].arrangementId].lineageId;
      const chips = [...tr.querySelectorAll('[data-testid="doc-chip"]')];
      return {
        id,
        kinds: chips.map((c) => c.dataset.kind),
        foreign: chips.filter((c) => s.arrangements[s.attachments[c.dataset.attachment].arrangementId].lineageId !== lineage).length,
      };
    });
  });
  t.assert(audit.length === 20, `rows on page 1: ${audit.length}`);
  const missing = audit.filter((r) => !(r.kinds.includes('contract') && r.kinds.includes('agreement')));
  t.assert(!missing.length, `rows without a contract and an agreement: ${missing.map((r) => r.id).join(', ')}`);
  t.assert(audit.every((r) => r.foreign === 0), 'a chip points at another borrower’s file');
  await page.$eval('[data-testid="tx-table"]', (el) => el.scrollIntoView({ block: 'start' }));
  await t.screenshot('tx-attachments-1440');
  await page.evaluate(() => window.scrollTo(0, 0));

  // ---- Mouse: the Contract chip opens the viewer and leaves the row alone.
  await t.click(`${first} [data-testid="doc-chip"][data-kind="contract"]`);
  await t.waitFor('doc-viewer');
  t.assert((await hash()) === '#/m/transactions', `chip click navigated to ${await hash()}`);
  t.assert(await t.exists('[data-testid="doc-viewer"] [data-testid="doc-paper"][data-kind="contract"]'), 'contract page missing');
  const stamp = await t.textOf('doc-stamp');
  t.assert(/Placed for collection/.test(stamp) && /M\.B\.A\. Consulting Philippines/.test(stamp), `stamp: ${stamp}`);
  const meta = await t.textOf('doc-meta');
  t.assert(/Uploaded by/.test(meta) && /MBA-ARR-\d{5}/.test(meta), `meta: ${meta}`);
  const logoOk = await page.$eval('[data-testid="doc-viewer"] [data-testid="doc-paper"]', (p) => !p.querySelector('img') || [...p.querySelectorAll('img')].every((i) => i.complete && i.naturalWidth > 0));
  t.assert(logoOk, 'an image on the contract page did not load');
  await t.screenshot('tx-doc-contract-1440');

  // Escape closes it and focus returns to the chip.
  await page.keyboard.press('Escape');
  await t.settle();
  t.assert(!(await t.exists('doc-viewer')), 'viewer still open after Escape');
  t.assert((await page.evaluate(() => document.activeElement?.dataset?.kind)) === 'contract', 'focus did not return to the chip');

  // ---- Keyboard: Enter on the Agreement chip opens the viewer, not the row.
  await page.focus(`${first} [data-testid="doc-chip"][data-kind="agreement"]`);
  await page.keyboard.press('Enter');
  await t.waitFor('doc-viewer');
  t.assert((await hash()) === '#/m/transactions', `Enter on a chip navigated to ${await hash()}`);
  const sched = await page.evaluate(() => {
    const s = window.__MBA__.store.get();
    const id = document.querySelector('[data-testid="doc-viewer"] .docv').dataset.attachment;
    const arrId = s.attachments[id].arrangementId;
    const logo = document.querySelector('[data-testid="doc-viewer"] .docv-logo');
    const insts = Object.values(s.installments).filter((i) => i.arrangementId === arrId);
    return {
      kind: s.attachments[id].sample,
      shown: document.querySelectorAll('[data-testid="doc-schedule"] li').length,
      count: insts.length,
      carried: insts.filter((i) => i.carriedFrom).length,
      note: !!document.querySelector('[data-testid="doc-carried"]'),
      logo: !!logo && logo.complete && logo.naturalWidth > 0,
      focus: document.activeElement?.dataset?.testid,
    };
  });
  t.assert(sched.kind === 'agreement' && sched.count > 0 && sched.shown === sched.count, `schedule ${JSON.stringify(sched)}`);
  t.assert(sched.note === sched.carried > 0, `carried-over note shown=${sched.note} for ${sched.carried} carried installment(s)`);
  t.assert(sched.logo, 'MBA logo on the agreement did not load');
  t.assert(sched.focus === 'doc-close', `focus on open: ${sched.focus}`);
  await t.screenshot('tx-doc-agreement-1440');
  await t.click('doc-close');
  t.assert(!(await t.exists('doc-viewer')), 'Close did not close the viewer');

  // ---- Detail page: the same files in a card; "Open arrangement" goes there.
  await t.goto(`#/m/transactions/${audit[0].id}`);
  await t.waitFor('tx-attachments');
  const listed = await page.$$eval('[data-testid="tx-attachments"] [data-testid="doc-row"]', (els) => els.map((e) => e.dataset.kind));
  t.assert(listed.includes('contract') && listed.includes('agreement'), `detail files: ${listed.join(',')}`);
  await t.screenshot('tx-detail-attachments-1440');
  await t.click('[data-testid="tx-attachments"] [data-testid="doc-row"][data-kind="agreement"]');
  await t.waitFor('doc-viewer');
  await t.click('doc-open-arrangement');
  await t.waitUntil(() => window.location.hash.startsWith('#/m/arrangements/'));
  t.assert(!(await t.exists('doc-viewer')), 'viewer should close when opening the arrangement');

  // ---- Arrangement page: file names open the same viewer.
  await t.waitFor('arr-attachments');
  await t.click('[data-testid="arr-attachments"] [data-testid="arr-file-open"]');
  await t.waitFor('[data-testid="doc-viewer"] [data-testid="doc-paper"]');
  await page.keyboard.press('Escape');
  await t.settle();

  // ---- A file uploaded in the demo keeps only its name and size → placeholder, no sample page.
  const file = join(t.downloads, 'Scanned addendum.pdf');
  writeFileSync(file, '%PDF-1.4 demo');
  const input = await page.$('[data-testid="attachment-input"]');
  await input.uploadFile(file);
  await t.waitUntil(() => [...document.querySelectorAll('[data-testid="arr-file-open"]')].some((b) => b.textContent.includes('Scanned addendum.pdf')));
  await page.evaluate(() => [...document.querySelectorAll('[data-testid="arr-file-open"]')].find((b) => b.textContent.includes('Scanned addendum.pdf')).click());
  await t.waitFor('doc-placeholder');
  t.assert(!(await t.exists('[data-testid="doc-viewer"] [data-testid="doc-paper"]')), 'uploaded file must not get a sample page');
  await t.click('doc-close');

  // ---- Phone width: the column and the viewer fit without page-level horizontal scroll.
  await page.setViewport({ width: 375, height: 812, deviceScaleFactor: 1 });
  await t.goto('#/m/transactions');
  await t.waitFor('tx-table');
  t.assert((await overflow()) <= 0, `h-overflow at 375 (list): ${await overflow()}px`);
  await t.click(`${first} [data-testid="doc-chip"][data-kind="agreement"]`);
  await t.waitFor('doc-viewer');
  t.assert((await overflow()) <= 0, `h-overflow at 375 (viewer): ${await overflow()}px`);
  await t.screenshot('tx-doc-agreement-375');
  await page.keyboard.press('Escape');
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
}
