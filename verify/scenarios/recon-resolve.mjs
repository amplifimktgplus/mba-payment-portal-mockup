// recon-resolve (plan Task 9 "reconResolve"): as Admin the Resolve button is disabled with
// "Requires Finance"; switch to Finance → an empty note is refused → resolve with a note →
// status Resolved, audit written, queue count drops. Also drives the rest of Task 9:
// daily reconciliation, payouts view, Reports (5 cards, tooltip, a real CSV download),
// Remittances (Q-01 decision screen + sample statement) and Settings (read-only policies).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function reconResolve(page, t) {
  const hash = () => page.evaluate(() => window.location.hash);
  const valueOf = async (testid) => (await t.textOf(`${testid}-value`)) ?? '';

  // ---- Reconciliation summary: 8 exception types, queue rows.
  await t.click('nav-reconciliation');
  await t.waitFor('exception-summary');
  const tiles = await page.$$eval('[data-testid^="exc-type-"]', (els) => els.filter((e) => e.dataset.testid !== 'exc-type-clear').length);
  t.assert(tiles === 8, `expected 8 exception-type tiles, got ${tiles}`);
  const openBefore = Number(await valueOf('recon-open'));
  t.assert(openBefore >= 8, `open exceptions before: ${openBefore}`);
  await t.screenshot('ops-recon-1440');

  // ---- Detail as Admin: Resolve is visible but locked with the deniedHint.
  await t.click('[data-testid="exc-row-EXC-0001"] td:first-child');
  await t.waitUntil(() => window.location.hash === '#/m/reconciliation/EXC-0001');
  const locked = await page.$eval('[data-testid="resolve-exception"]', (b) => ({ disabled: b.disabled, hint: b.getAttribute('data-hint') }));
  t.assert(locked.disabled === true, 'Resolve should be disabled for Admin');
  t.assert(locked.hint === 'Requires Finance', `hint was ${locked.hint}`);
  t.assert(await t.exists('resolve-locked'), 'locked notice missing for Admin');
  t.assert((await page.$eval('[data-testid="exc-status"]', (c) => c.dataset.status)) === 'open', 'EXC-0001 should start open');

  // ---- Switch to Finance (role switcher re-checks permissions).
  await page.select('[data-testid="role-switcher"]', 'finance');
  await t.waitUntil(() => { const b = document.querySelector('[data-testid="resolve-exception"]'); return b && !b.disabled; });
  t.assert(!(await t.exists('resolve-locked')), 'locked notice should be gone for Finance');

  // Empty note → refused, nothing changes.
  await t.click('resolve-exception');
  await t.waitForText('.field-error', 'A resolution note is required.');
  t.assert((await t.state((s) => s.exceptions['EXC-0001'].status)) === 'open', 'empty note must not resolve');

  // With a note → resolved + audit.
  const NOTE = 'Provider corrected the settlement report; amounts now match.';
  await t.type('resolve-note', NOTE);
  await t.click('resolve-exception');
  await t.waitFor('resolve-toast');
  await t.waitUntil(() => document.querySelector('[data-testid="exc-status"]')?.dataset.status === 'resolved');
  const exc = await t.state((s) => ({ ...s.exceptions['EXC-0001'], audit: s.audit.filter((a) => a.action === 'recon.resolve' && a.target === 'EXC-0001').length }));
  t.assert(exc.status === 'resolved' && exc.resolvedBy === 'finance' && exc.note === NOTE, `resolved record: ${JSON.stringify(exc)}`);
  t.assert(exc.audit === 1, `audit rows for the resolve: ${exc.audit}`);
  t.assert((await t.textOf('exc-resolution')).includes(NOTE), 'resolution note not shown');
  await t.screenshot('ops-recon-detail-resolved-1440', { fullPage: true });

  // ---- Back to the queue: the row left the default (unresolved) view, the count dropped.
  await t.click('exc-back');
  await t.waitFor('exception-table');
  t.assert(!(await t.exists('exc-row-EXC-0001')), 'resolved exception still in the unresolved queue');
  t.assert(Number(await valueOf('recon-open')) === openBefore - 1, 'open exception count did not drop by 1');

  // ---- Run daily reconciliation: matches the awaiting payments.
  const awaiting = Number(await valueOf('recon-awaiting'));
  await t.click('run-recon');
  await t.waitFor('recon-toast');
  t.assert((await t.textOf('recon-toast')).includes(`${awaiting} payment`), `toast: ${await t.textOf('recon-toast')}`);
  await t.waitUntil(() => document.querySelector('[data-testid="recon-awaiting-value"]')?.textContent.trim() === '0');

  // ---- Payouts: the mismatched payout and its breakdown.
  await t.click('tab-payouts');
  await t.waitFor('payout-table');
  t.assert(await t.exists('[data-testid^="payout-row-"] [data-status="mismatch"]'), 'no mismatched payout shown');
  await t.click('[data-testid^="payout-row-"] td:first-child');
  await t.waitFor('payout-modal');
  await t.click('payout-modal-close');
  t.assert(!(await t.exists('payout-modal')), 'payout modal did not close');

  // ---- Reports: 5 cards with SVG charts, tooltip on hover, a real CSV file.
  await t.click('nav-reports');
  await t.waitFor('report-collections');
  for (const id of ['collections', 'agents', 'aging', 'methods', 'recon']) {
    t.assert(await t.exists(`[data-testid="report-${id}"] svg .viz-mark`), `report ${id} has no chart marks`);
  }
  const bar = await page.$('[data-testid="chart-collections"] .viz-bar');
  await bar.hover();
  await t.waitUntil(() => { const tip = document.querySelector('[data-testid="chart-collections"] .viz-tip'); return tip && !tip.hidden && tip.textContent.includes('₱'); });
  await page.mouse.move(5, 5);
  await t.screenshot('ops-reports-1440');
  await t.click('csv-collections');
  await t.waitFor('csv-toast');
  const file = join(t.downloads, 'report-collections.csv');
  for (let i = 0; i < 40 && !existsSync(file); i++) await t.sleep(100);
  t.assert(existsSync(file), `CSV not downloaded; dir has ${readdirSync(t.downloads).join(', ')}`);
  const csv = readFileSync(file, 'utf8');
  t.assert(csv.startsWith('Portfolio,Creditor,Payments,Collected (PHP)'), `csv header: ${csv.slice(0, 60)}`);
  t.assert(csv.split('\r\n').length === 4, 'csv should have a header + 3 portfolios');

  // ---- Remittances: decision screen + sample statement (labelled).
  await t.click('nav-remittances');
  await t.waitFor('q01-tag');
  t.assert((await t.textOf('q01-tag')) === 'Decision needed — Q-01', 'Q-01 tag text');
  t.assert((await t.textOf('sample-label')) === 'Sample — if model (a) is chosen', 'sample label text');
  t.assert(await t.exists('flow-a') && await t.exists('flow-b'), 'both model diagrams render');
  const rows = await page.$$eval('[data-testid^="statement-cr_"]', (els) => els.length);
  t.assert(rows === 3, `statement rows: ${rows}`);
  await t.screenshot('ops-remittances-1440');

  // ---- Settings: read-only POLICY_META table with Q-ids and the assumption tag.
  await t.click('nav-settings');
  await t.waitFor('policy-table');
  const policyRows = await page.$$eval('tr[data-testid^="policy-"]', (els) => els.length);
  t.assert(policyRows === 9, `policy rows: ${policyRows}`);
  t.assert((await t.textOf('policy-fee')).includes('Q-17'), 'fee row missing Q-17');
  t.assert((await t.textOf('policy-fee')).includes('Assumption — awaiting MBA decision'), 'fee row missing assumption tag');
  t.assert(!(await t.exists('.page-settings input, .page-settings select, .page-settings textarea')), 'Settings must be read-only');
  await t.screenshot('ops-settings-1440');
  t.log(`resolved EXC-0001 as finance; open ${openBefore} → ${openBefore - 1}; matched ${awaiting}; csv ${csv.length} bytes; hash ${await hash()}`);
}
