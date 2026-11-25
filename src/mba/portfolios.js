// Portfolios (MBA view) — plan Task 8, D§7.3, V3 §5.
// List · detail (accounts, import batches, recovery) · Import accounts wizard:
//   1. download the template (TEMPLATE_HEADERS)  2. choose a sample file (clean / with errors)
//   3. result (Accepted / Partially accepted / Rejected) + error rows CSV.
import { renderMbaLayout } from './layout.js';

const REQUIRED = new Set(['creditor_account_no', 'full_name', 'mobile', 'placed_balance', 'currency', 'chargeoff_date']);
const HEADER_NOTES = {
  creditor_account_no: 'The creditor’s own account number; duplicates within a creditor are rejected',
  full_name: 'Borrower full name',
  mobile: 'Philippine mobile, +639XXXXXXXXX — used for the OTP',
  placed_balance: 'Pesos, greater than zero',
  currency: 'PHP',
  chargeoff_date: 'Original due / charge-off date, YYYY-MM-DD',
  email: 'Optional — for payment-link emails',
};
const CHECK_LABEL = { full_name: 'Missing name', mobile: 'Bad mobile', placed_balance: 'Bad balance', currency: 'Bad currency', chargeoff_date: 'Bad date', email: 'Bad email' };
const BATCH_LABEL = { accepted: 'Accepted', partial: 'Partially accepted', rejected: 'Rejected' };

export function register(router, ctx) {
  router.on('/m/portfolios', () => renderMbaLayout(ctx, listPage(ctx), 'portfolios'));
  router.on('/m/portfolios/:id', (params) => renderMbaLayout(ctx, detailPage(ctx, params.id), 'portfolios'));
  router.on('/m/portfolios/:id/import', (params) => renderMbaLayout(ctx, importPage(ctx, params.id), 'portfolios'));
}

const pctText = (p) => `${p.toFixed(1)}%`;

function pfStats(ctx, s) {
  const rec = Object.fromEntries(ctx.selectors.portfolioRecovery(s).map((r) => [r.portfolioId, r]));
  const accs = {};
  const fresh = {};
  for (const a of Object.values(s.accounts)) {
    accs[a.portfolioId] = (accs[a.portfolioId] || 0) + 1;
    if (a.status === 'new') fresh[a.portfolioId] = (fresh[a.portfolioId] || 0) + 1;
  }
  const lastBatch = {};
  for (const b of Object.values(s.importBatches)) if (!lastBatch[b.portfolioId] || b.at > lastBatch[b.portfolioId].at) lastBatch[b.portfolioId] = b;
  return Object.values(s.portfolios).map((p) => ({
    id: p.id, p, name: p.name, creditorId: p.creditorId, creditor: s.creditors[p.creditorId]?.name ?? '—', placedAt: p.placedAt,
    accounts: accs[p.id] || 0, unassignedNew: fresh[p.id] || 0,
    placed: rec[p.id]?.placed || 0, collected: rec[p.id]?.collected || 0, pct: rec[p.id]?.pct || 0, lastBatch: lastBatch[p.id] || null,
  }));
}

function recoveryCell(k, pct) {
  const { h } = k;
  return h('div', { class: 'pf-rec' }, k.progress({ value: pct, max: 100, label: `Recovery ${pctText(pct)}`, tone: 'brand' }), h('span', { class: 'num' }, pctText(pct)));
}

const batchChip = (k, b, opts = {}) => k.chip(b.status, { label: BATCH_LABEL[b.status] || k.humanize(b.status), ...opts });

/** Re-render, then bring the wizard back to the top so the new step starts in view. */
function toTop(ctx) {
  ctx.rerender();
  requestAnimationFrame(() => window.scrollTo(0, 0));
}

function notFound(ctx, id) {
  const k = ctx.kit;
  return k.h('div', { class: 'page page-portfolios' },
    k.pageHeader({ crumbs: [{ label: 'Portfolios', href: '#/m/portfolios' }, { label: id }], eyebrow: 'Clients', title: 'Portfolio not found' }),
    k.card({ body: k.emptyState(`There is no portfolio with ID ${id}.`, { title: 'Not found', action: k.btn('All portfolios', { variant: 'primary', onClick: () => ctx.router.go('#/m/portfolios') }) }) }));
}

// ------------------------------------------------------------------------------------------
// List

function listPage(ctx) {
  const k = ctx.kit;
  const { h } = k;
  const s = ctx.store.get();
  const rows = pfStats(ctx, s).sort((a, b) => (a.placedAt < b.placedAt ? -1 : 1));
  const first = rows[0]?.id;

  return h('div', { class: 'page page-portfolios' },
    k.pageHeader({
      eyebrow: 'Clients',
      title: 'Portfolios',
      subtitle: 'Accounts placed by each creditor, how they were imported, and recovery so far.',
      actions: k.permBtn(ctx, 'portfolio.import', 'Import accounts', { variant: 'primary', icon: 'upload', testid: 'pf-import-start', onClick: () => ctx.router.go(`#/m/portfolios/${first}/import`) }),
    }),
    h('div', { class: 'pf-cards', testid: 'pf-cards' }, rows.map((r) => h('a', { href: `#/m/portfolios/${r.id}`, class: 'pf-card', testid: `pf-card-${r.id}` },
      h('div', { class: 'pf-card-top' }, h('span', { class: 'eyebrow' }, r.creditor), h('strong', { class: 'pf-card-name' }, r.name)),
      h('div', { class: 'pf-card-pct num' }, pctText(r.pct)),
      k.progress({ value: r.pct, max: 100, label: `${r.name} recovery ${pctText(r.pct)}`, tone: 'brand' }),
      h('div', { class: 'pf-card-foot num' }, `${k.formatPHP(r.collected)} of ${k.formatPHP(r.placed)}`)))),
    k.card({
      title: 'All portfolios', eyebrow: 'List', flush: true,
      body: k.table({
        testid: 'pf-table', stateKey: 'pf.list', caption: 'Portfolios',
        rows,
        rowTestid: (r) => `pf-row-${r.id}`,
        onRowClick: (r) => ctx.router.go(`#/m/portfolios/${r.id}`),
        columns: [
          { key: 'name', label: 'Portfolio', render: (r) => h('div', { class: 'cell-2' }, h('a', { href: `#/m/portfolios/${r.id}` }, h('strong', {}, r.name)), h('span', { class: 'cell-sub' }, r.creditor)) },
          { key: 'placedAt', label: 'Placed on', render: (r) => h('span', { class: 'num' }, k.fmtDate(r.placedAt)) },
          { key: 'accounts', label: 'Accounts', align: 'right', render: (r) => h('div', { class: 'cell-2 al-right' }, h('span', { class: 'num' }, r.accounts.toLocaleString('en-US')), r.unassignedNew ? h('span', { class: 'cell-sub num' }, `${r.unassignedNew} new`) : null) },
          { key: 'placed', label: 'Placed', align: 'right', render: (r) => k.money(r.placed) },
          { key: 'collected', label: 'Collected', align: 'right', render: (r) => k.money(r.collected) },
          { key: 'pct', label: 'Recovery', render: (r) => recoveryCell(k, r.pct) },
          { key: 'lastBatch', label: 'Last import', sortValue: (r) => r.lastBatch?.at ?? '', render: (r) => (r.lastBatch ? h('div', { class: 'cell-2' }, batchChip(k, r.lastBatch), h('span', { class: 'cell-sub num' }, k.fmtDate(r.lastBatch.at))) : null) },
        ],
      }),
    }));
}

// ------------------------------------------------------------------------------------------
// Detail

function batchesTable(ctx, s, batches, { testid = 'pf-batches', compact = false } = {}) {
  const k = ctx.kit;
  const { h } = k;
  if (compact) {
    return k.table({
      testid, caption: 'Import batches', pageSize: 6, dense: true,
      rows: batches,
      rowTestid: (b) => `${testid}-${b.id}`,
      empty: 'No imports yet.',
      columns: [
        { key: 'filename', label: 'File and result', sortable: false, render: (b) => h('div', { class: 'cell-2 pf-batch-cell' }, h('span', { class: 'pf-file-name' }, b.filename), h('span', { class: 'qline' }, batchChip(k, b, { size: 'sm' }), h('span', { class: 'cell-sub num' }, `${k.fmtDate(b.at)} · ${b.accepted} of ${b.rows} rows`))) },
        { key: 'dl', label: '', sortable: false, align: 'right', render: (b) => (b.errors.length ? k.btn(null, { size: 'sm', variant: 'ghost', icon: 'download', title: `Download the ${b.errors.length} error rows as CSV`, testid: `${testid}-errors-${b.id}`, onClick: () => downloadErrors(ctx, b) }) : null) },
      ],
    });
  }
  return k.table({
    testid, caption: 'Import batches', pageSize: 10,
    rows: batches,
    rowTestid: (b) => `pf-batch-${b.id}`,
    empty: 'No imports yet.',
    columns: [
      { key: 'filename', label: 'File', render: (b) => h('span', { class: 'arr-file' }, k.icon('file', { size: 16 }), h('span', {}, b.filename)) },
      { key: 'at', label: 'Imported', render: (b) => h('span', { class: 'num' }, k.fmtDateTime(b.at)) },
      { key: 'status', label: 'Result', render: (b) => batchChip(k, b) },
      { key: 'rows', label: 'Rows', align: 'right', render: (b) => h('span', { class: 'num' }, String(b.rows)) },
      { key: 'accepted', label: 'Accepted', align: 'right', render: (b) => h('span', { class: 'num' }, String(b.accepted)) },
      { key: 'errors', label: 'Errors', align: 'right', sortValue: (b) => b.errors.length, render: (b) => h('span', { class: 'num' }, String(b.errors.length)) },
      {
        key: 'dl', label: '', sortable: false, align: 'right',
        render: (b) => (b.errors.length ? k.btn('Error rows', { size: 'sm', variant: 'ghost', icon: 'download', testid: `pf-batch-errors-${b.id}`, title: `Download the ${b.errors.length} error rows as CSV`, onClick: () => downloadErrors(ctx, b) }) : null),
      },
    ],
  });
}

function downloadErrors(ctx, b) {
  ctx.kit.downloadFile(`import-errors-${b.id}.csv`, 'text/csv', ctx.actions.importErrorsCSV(b));
  ctx.kit.toast(`Downloaded ${b.errors.length} error ${b.errors.length === 1 ? 'row' : 'rows'} (import-errors-${b.id}.csv).`, { kind: 'ok', testid: 'pf-toast' });
}

function detailPage(ctx, id) {
  const k = ctx.kit;
  const { h } = k;
  const s = ctx.store.get();
  const st = pfStats(ctx, s).find((r) => r.id === id);
  if (!st) return notFound(ctx, id);
  const ui = k.memo(`pf.detail.${id}`, () => ({ tab: 'accounts', status: '', q: '' }));
  const accs = Object.values(s.accounts).filter((a) => a.portfolioId === id);
  const batches = Object.values(s.importBatches).filter((b) => b.portfolioId === id).sort((a, b) => (a.at < b.at ? 1 : -1));
  const live = Object.values(s.arrangements).filter((a) => ['active', 'partially_paid'].includes(a.status) && s.accounts[a.accountId]?.portfolioId === id).length;

  const statusCounts = {};
  for (const a of accs) statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;

  let body;
  if (ui.tab === 'accounts') {
    const q = ui.q.toLowerCase();
    const rows = accs.filter((a) => (!ui.status || a.status === ui.status) && (!q || k.borrowerName(a).toLowerCase().includes(q) || a.ref.toLowerCase().includes(q)))
      .map((a) => ({ id: a.id, a, name: k.borrowerName(a), ref: a.ref, status: a.status, assignee: a.assigneeId ? (s.agents[a.assigneeId]?.name ?? a.assigneeId) : '', placed: a.placedBalance, createdAt: a.createdAt }))
      .sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : x.ref.localeCompare(y.ref)));
    body = [
      k.filterBar({
        testid: 'pf-acc-filter',
        values: { q: ui.q, status: ui.status },
        fields: [
          { type: 'text', name: 'q', label: 'Search', placeholder: 'Borrower or reference', wide: true },
          { type: 'select', name: 'status', label: 'Status', allLabel: 'All statuses', options: Object.keys(statusCounts).sort().map((x) => ({ value: x, label: `${k.humanize(x)} (${statusCounts[x]})` })) },
        ],
        onApply: (v) => { ui.q = v.q; ui.status = v.status; ctx.rerender(); },
      }),
      k.table({
        testid: 'pf-accounts', stateKey: `pf.acc.${id}`, caption: `Accounts in ${st.name}`,
        rows,
        rowTestid: (r) => `pf-acc-${r.id}`,
        onRowClick: (r) => ctx.router.go(`#/m/accounts/${r.id}`),
        empty: 'No accounts match these filters.',
        columns: [
          { key: 'name', label: 'Borrower', render: (r) => h('a', { href: `#/m/accounts/${r.id}` }, h('strong', {}, r.name)) },
          { key: 'ref', label: 'Reference', render: (r) => h('span', { class: 'num' }, r.ref) },
          { key: 'status', label: 'Status', render: (r) => k.chip(r.status) },
          { key: 'assignee', label: 'Assignee', render: (r) => r.assignee || h('span', { class: 'cell-sub' }, 'Unassigned') },
          { key: 'placed', label: 'Placed balance', align: 'right', render: (r) => k.money(r.placed) },
          { key: 'createdAt', label: 'Loaded', render: (r) => h('span', { class: 'num' }, k.fmtDate(r.createdAt)) },
        ],
      }),
    ];
  } else if (ui.tab === 'imports') {
    body = [batchesTable(ctx, s, batches)];
  } else {
    const order = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
    body = [h('div', { class: 'pf-recovery' },
      h('div', { class: 'pf-recovery-big' },
        h('span', { class: 'eyebrow' }, 'Recovered'),
        h('span', { class: 'pf-recovery-pct num' }, pctText(st.pct)),
        k.progress({ value: st.pct, max: 100, label: `Recovery ${pctText(st.pct)}`, tone: 'brand' }),
        h('span', { class: 'cell-sub num' }, `${k.formatPHP(st.collected)} collected of ${k.formatPHP(st.placed)} placed`)),
      h('div', { class: 'pf-mix' },
        h('span', { class: 'eyebrow' }, 'Accounts by status'),
        h('ul', { class: 'pf-mix-list', testid: 'pf-status-mix' }, order.map(([status, n]) => h('li', {},
          k.chip(status),
          h('span', { class: 'pf-mix-bar', attrs: { 'aria-hidden': 'true' } }, h('span', { style: { width: `${Math.max(2, (n / accs.length) * 100).toFixed(1)}%` } })),
          h('span', { class: 'num' }, String(n)))))))];
  }

  return h('div', { class: 'page page-portfolios', testid: 'pf-detail' },
    k.pageHeader({
      crumbs: [{ label: 'Portfolios', href: '#/m/portfolios' }, { label: st.name }],
      eyebrow: 'Portfolio',
      title: st.name,
      subtitle: h('span', {}, k.link(st.creditor, `#/m/creditors/${st.creditorId}`), ` · placed ${k.fmtDate(st.placedAt)}`),
      actions: k.permBtn(ctx, 'portfolio.import', 'Import accounts', { variant: 'primary', icon: 'upload', testid: 'pf-import', onClick: () => ctx.router.go(`#/m/portfolios/${id}/import`) }),
    }),
    h('div', { class: 'grid-4 pf-kpis' },
      k.kpi({ label: 'Accounts', value: accs.length.toLocaleString('en-US'), sub: `${st.unassignedNew} new in the unassigned queue`, tone: 'brand', testid: 'pf-kpi-accounts' }),
      k.kpi({ label: 'Placed balance', value: k.formatPHP(st.placed), sub: `${batches.length} import ${batches.length === 1 ? 'batch' : 'batches'}`, tone: 'neutral', testid: 'pf-kpi-placed' }),
      k.kpi({ label: 'Collected to date', value: k.formatPHP(st.collected), sub: `${live} live arrangements`, tone: 'ok', testid: 'pf-kpi-collected' }),
      k.kpi({ label: 'Recovery', value: pctText(st.pct), sub: 'Collected ÷ placed', tone: 'info', testid: 'pf-kpi-recovery' })),
    k.card({
      flush: true, testid: 'pf-tabs-card',
      body: [
        k.tabs({
          testid: 'pf-tabs', label: 'Portfolio sections', active: ui.tab,
          items: [{ id: 'accounts', label: 'Accounts', count: accs.length }, { id: 'imports', label: 'Import batches', count: batches.length }, { id: 'recovery', label: 'Recovery' }],
          onChange: (t) => { ui.tab = t; ctx.rerender(); },
        }),
        h('div', { class: 'pf-tab-body' }, body),
      ],
    }));
}

// ------------------------------------------------------------------------------------------
// Import wizard

function importPage(ctx, id) {
  const k = ctx.kit;
  const { h } = k;
  const s = ctx.store.get();
  const pf = s.portfolios[id];
  if (!pf) return notFound(ctx, id);
  const w = k.memo(`pf.import.${id}`, () => ({ step: 1, kind: 'clean', batchId: null }));
  const batch = w.batchId ? s.importBatches[w.batchId] : null;
  if (w.batchId && !batch) w.batchId = null; // e.g. after Reset demo
  const step = batch ? 3 : w.step;
  const allowed = ctx.can('portfolio.import');

  const stepper = h('ol', { class: 'pf-steps', testid: 'import-steps' },
    [['Download the template', 1], ['Choose a file', 2], ['Review the result', 3]].map(([label, n]) => h('li', { class: ['pf-step', { 'is-on': n === step, 'is-done': n < step }], attrs: { 'aria-current': n === step ? 'step' : null } },
      h('span', { class: 'pf-step-n num' }, n < step ? k.icon('check', { size: 16 }) : String(n)), h('span', { class: 'pf-step-label' }, label))));

  const pfPicker = k.field({
    label: 'Import into portfolio',
    control: k.select({
      testid: 'import-portfolio', value: id,
      options: Object.values(s.portfolios).map((p) => ({ value: p.id, label: `${p.name} · ${s.creditors[p.creditorId]?.name ?? ''}` })),
      on: { change: (e) => ctx.router.go(`#/m/portfolios/${e.target.value}/import`) },
    }),
  });

  // Step 1 — template
  const template = k.card({
    title: 'Standard import template', eyebrow: 'Step 1', testid: 'import-step1',
    actions: k.btn('Download template', {
      variant: 'secondary', icon: 'download', testid: 'import-template',
      onClick: () => { k.downloadFile('mba-import-template.csv', 'text/csv', ctx.actions.templateCSV()); k.toast('Template downloaded (mba-import-template.csv).', { kind: 'ok', testid: 'pf-toast' }); },
    }),
    body: [
      h('p', { class: 'pf-lead' }, 'Creditors send their placement in this format, one row per account. ', h('span', { class: 'qline' }, 'The final field list is still open', k.qtag('Q-03'))),
      k.table({
        testid: 'import-headers', dense: true, pageSize: 20, caption: 'Template columns',
        rows: ctx.actions.TEMPLATE_HEADERS.map((name) => ({ name, required: REQUIRED.has(name), note: HEADER_NOTES[name] || '' })),
        columns: [
          { key: 'name', label: 'Column', sortable: false, render: (r) => h('code', { class: 'pf-code' }, r.name) },
          { key: 'required', label: 'Required', sortable: false, render: (r) => (r.required ? k.tag('Required', { tone: 'brand' }) : k.tag('Optional', { tone: 'neutral' })) },
          { key: 'note', label: 'Rule', sortable: false, render: (r) => h('span', { class: 'cell-sub' }, r.note) },
        ],
      }),
      h('div', { class: 'pf-run' },
        h('span', { class: 'cell-sub' }, 'For the demo, step 2 offers two ready-made sample files.'),
        k.btn('Next: choose a file', { variant: 'primary', iconRight: 'arrowRight', testid: 'import-next', onClick: () => { w.step = 2; toTop(ctx); } })),
    ],
  });

  // Step 2 — choose a sample file
  const samples = [
    { kind: 'clean', title: 'Clean file', file: 'sample-clean.csv', desc: '12 rows, every row valid.', expect: 'Expected: Accepted' },
    { kind: 'errors', title: 'File with errors', file: 'sample-with-errors.csv', desc: '12 rows, 3 with problems: a bad mobile number, a missing name, a negative balance.', expect: 'Expected: Partially accepted' },
  ];
  const sampleRows = ctx.actions.sampleRows(w.kind);
  const rowErrs = sampleRows.map((r) => ctx.actions.validateRow(r));
  const choose = k.card({
    title: 'Choose a sample file', eyebrow: 'Step 2', testid: 'import-step2',
    body: [
      h('div', { class: 'pf-options', attrs: { role: 'radiogroup', 'aria-label': 'Sample file' } }, samples.map((o) => h('button', {
        type: 'button', class: ['pf-option', { 'is-on': w.kind === o.kind }], testid: `import-sample-${o.kind}`,
        attrs: { role: 'radio', 'aria-checked': w.kind === o.kind ? 'true' : 'false' },
        on: { click: () => { w.kind = o.kind; ctx.rerender(); } },
      },
      h('span', { class: 'pf-option-radio', attrs: { 'aria-hidden': 'true' } }),
      h('span', { class: 'pf-option-body' },
        h('strong', { class: 'pf-option-title' }, o.title),
        h('span', { class: 'pf-option-file' }, k.icon('file', { size: 14 }), o.file),
        h('span', { class: 'pf-option-desc' }, o.desc),
        h('span', { class: 'pf-option-expect' }, o.expect))))),
      h('details', { class: 'pf-peek', testid: 'import-peek' },
        h('summary', {}, `Preview the ${sampleRows.length} rows`),
        k.table({
          testid: 'import-peek-table', dense: true, pageSize: 12, caption: 'Sample file rows',
          rows: sampleRows.map((r, i) => ({ ...r, n: i + 1, err: rowErrs[i] })),
          columns: [
            { key: 'n', label: 'Row', sortable: false, render: (r) => h('span', { class: 'num' }, String(r.n)) },
            { key: 'full_name', label: 'Full name', sortable: false, render: (r) => (r.full_name ? h('span', { class: 'nowrap' }, r.full_name) : h('em', { class: 'pf-missing' }, '(blank)')) },
            { key: 'mobile', label: 'Mobile', sortable: false, render: (r) => h('span', { class: 'num' }, r.mobile) },
            { key: 'placed_balance', label: 'Placed balance', align: 'right', sortable: false, render: (r) => h('span', { class: 'num' }, r.placed_balance) },
            { key: 'err', label: 'Check', sortable: false, render: (r) => (r.err.length ? k.chip('failed', { label: r.err.map((e) => CHECK_LABEL[e.field] || e.field).join(', ') }) : k.chip('accepted', { label: 'OK' })) },
          ],
        })),
      !allowed ? k.notice('Only an Admin can import accounts. Switch the role to Admin to run the import.', { tone: 'neutral', title: 'Requires Admin', testid: 'import-denied' }) : null,
      h('p', { class: 'pf-run-note' }, `Imports into ${pf.name}. Valid rows become New accounts in the unassigned queue.`),
      h('div', { class: 'pf-run' },
        k.btn('Back', { variant: 'ghost', icon: 'arrowLeft', testid: 'import-back', onClick: () => { w.step = 1; toTop(ctx); } }),
        k.permBtn(ctx, 'portfolio.import', 'Import file', {
          variant: 'primary', icon: 'upload', testid: 'import-run',
          onClick: () => {
            const res = ctx.actions.importSample(ctx.store, id, w.kind);
            if (!res.ok) { k.toast(res.message, { kind: 'danger', testid: 'pf-toast' }); return; }
            w.batchId = res.batchId;
            k.toast(`Import ${BATCH_LABEL[res.status].toLowerCase()}: ${res.accepted} of 12 rows loaded.`, { kind: res.status === 'accepted' ? 'ok' : 'warn', testid: 'pf-toast' });
            toTop(ctx);
          },
        })),
    ],
  });

  // Step 3 — result
  let result = null;
  if (batch) {
    const tone = batch.status === 'accepted' ? 'ok' : batch.status === 'partial' ? 'warn' : 'danger';
    const headline = batch.status === 'accepted' ? 'Every row loaded.' : batch.status === 'partial' ? 'Valid rows loaded. Fix the error rows and import them again.' : 'Nothing loaded. Fix the file and import it again.';
    result = k.card({
      title: 'Import result', eyebrow: 'Step 3', testid: 'import-step3',
      body: [
        h('div', { class: ['pf-result', `tone-${tone}`] },
          batchChip(k, batch, { testid: 'import-status', size: 'lg' }),
          h('div', { class: 'pf-result-text' },
            h('strong', { class: 'num', testid: 'import-summary' }, `${batch.accepted} of ${batch.rows} rows accepted`),
            h('span', {}, `${batch.filename} · ${k.fmtDateTime(batch.at)} · ${headline}`))),
        batch.errors.length ? k.table({
          testid: 'import-errors', dense: true, pageSize: 20, caption: 'Rows with errors',
          rows: batch.errors,
          columns: [
            { key: 'row', label: 'Row', render: (e) => h('span', { class: 'num' }, String(e.row)) },
            { key: 'field', label: 'Field', render: (e) => h('code', { class: 'pf-code' }, e.field) },
            { key: 'message', label: 'Problem' },
            { key: 'value', label: 'Value in file', sortable: false, render: (e) => h('span', { class: 'num' }, String(e.values?.[e.field] ?? '') || '(blank)') },
          ],
        }) : null,
        h('div', { class: 'pf-result-actions' },
          k.btn('Import another file', { variant: 'ghost', icon: 'refresh', testid: 'import-again', onClick: () => { w.batchId = null; w.step = 2; toTop(ctx); } }),
          batch.errors.length ? k.btn(`Download ${batch.errors.length} error ${batch.errors.length === 1 ? 'row' : 'rows'}`, { variant: 'secondary', icon: 'download', testid: 'import-errors-csv', onClick: () => downloadErrors(ctx, batch) }) : null,
          batch.accepted ? k.btn(`View the ${batch.accepted} new accounts`, {
            variant: 'primary', iconRight: 'arrowRight', testid: 'import-view-accounts',
            onClick: () => { const ui = k.memo(`pf.detail.${id}`, () => ({ tab: 'accounts', status: '', q: '' })); ui.tab = 'accounts'; ui.status = 'new'; ui.q = ''; ctx.router.go(`#/m/portfolios/${id}`); },
          }) : null),
      ],
    });
  }

  const batches = Object.values(s.importBatches).filter((b) => b.portfolioId === id).sort((a, b) => (a.at < b.at ? 1 : -1));

  return h('div', { class: 'page page-portfolios', testid: 'import-wizard' },
    k.pageHeader({
      crumbs: [{ label: 'Portfolios', href: '#/m/portfolios' }, { label: pf.name, href: `#/m/portfolios/${id}` }, { label: 'Import accounts' }],
      eyebrow: 'Intake (V3 §5)',
      title: 'Import accounts',
      subtitle: 'Validate a creditor file row by row: required fields, formats, amounts and duplicates. Nothing invalid is loaded.',
    }),
    h('div', { class: 'pf-wiz-top' }, stepper, h('div', { class: 'pf-wiz-picker' }, pfPicker)),
    h('div', { class: 'pf-wiz' },
      h('div', { class: 'stack' }, step === 1 ? template : step === 2 ? choose : result),
      h('div', { class: 'stack' },
        k.card({
          title: 'How validation works', eyebrow: 'Rules',
          body: h('ul', { class: 'pf-rules' },
            h('li', {}, h('strong', {}, 'Accepted'), h('span', {}, 'Every row is valid and loads.')),
            h('li', {}, h('strong', {}, 'Partially accepted'), h('span', {}, 'Valid rows load; error rows can be downloaded, fixed and re-imported.')),
            h('li', {}, h('strong', {}, 'Rejected'), h('span', {}, 'No valid rows, for example the same file imported twice (duplicate account numbers).'))),
        }),
        k.card({ title: 'Earlier imports', eyebrow: pf.name, flush: true, body: batchesTable(ctx, s, batches, { testid: 'import-history', compact: true }) }))));
}
