// Creditors (MBA view) — plan Task 8, D§7.2, V3 §18.
// List (name, portfolios, placed, collected, recovery %) · detail (profile, commission terms Q-24,
// remittance placeholders Q-01, portfolios) · Add creditor form (Admin only, creditor.manage).
import { renderMbaLayout } from './layout.js';
import { isMidnight } from '../ui/look.js';
import { mnrIntro, mnrRise, mnrMoney, mnrNum, mnrSpot } from './accounts.js'; // Midnight look helpers (2026-11-26)

/** KPI values: Classic shows the text; Midnight shows oversized figures that count up once per
 *  visit and end on exactly the same text. */
function kpiValues(ctx, intro) {
  const mid = isMidnight();
  return {
    money: (c, delay = 0) => (mid ? mnrMoney(c, { animate: intro, delay }) : ctx.kit.formatPHP(c)),
    count: (n, delay = 0) => (mid ? mnrNum(n, (v) => Math.round(v).toLocaleString('en-US'), { animate: intro, delay }) : String(n)),
    pct: (p, delay = 0) => (mid ? mnrNum(p, pctText, { animate: intro, delay }) : pctText(p)),
  };
}

export function register(router, ctx) {
  router.on('/m/creditors', () => renderMbaLayout(ctx, listPage(ctx), 'creditors'));
  router.on('/m/creditors/new', () => renderMbaLayout(ctx, newPage(ctx), 'creditors'));
  router.on('/m/creditors/:id', (params) => renderMbaLayout(ctx, detailPage(ctx, params.id), 'creditors'));
}

/** Per-creditor roll-up of the portfolioRecovery selector + simple counts. */
function creditorStats(ctx, s) {
  const rec = ctx.selectors.portfolioRecovery(s);
  const byPf = Object.fromEntries(rec.map((r) => [r.portfolioId, r]));
  const accByCr = {};
  for (const a of Object.values(s.accounts)) accByCr[a.creditorId] = (accByCr[a.creditorId] || 0) + 1;
  const liveByCr = {};
  for (const ar of Object.values(s.arrangements)) {
    if (!['active', 'partially_paid'].includes(ar.status)) continue;
    const c = s.accounts[ar.accountId]?.creditorId;
    if (c) liveByCr[c] = (liveByCr[c] || 0) + 1;
  }
  return Object.values(s.creditors).map((c) => {
    const pfs = Object.values(s.portfolios).filter((p) => p.creditorId === c.id);
    const placed = pfs.reduce((sum, p) => sum + (byPf[p.id]?.placed || 0), 0);
    const collected = pfs.reduce((sum, p) => sum + (byPf[p.id]?.collected || 0), 0);
    return {
      id: c.id, c, name: c.name, commissionPct: c.commissionPct, portfolios: pfs, portfolioCount: pfs.length,
      accounts: accByCr[c.id] || 0, live: liveByCr[c.id] || 0, placed, collected,
      pct: placed ? Math.round((collected / placed) * 1000) / 10 : 0, byPf,
    };
  });
}

const pctText = (p) => `${p.toFixed(1)}%`;

function recoveryCell(k, pct) {
  const { h } = k;
  return h('div', { class: 'cr-rec' }, k.progress({ value: pct, max: 100, label: `Recovery ${pctText(pct)}`, tone: 'brand' }), h('span', { class: 'num' }, pctText(pct)));
}

// ------------------------------------------------------------------------------------------

function listPage(ctx) {
  const k = ctx.kit;
  const { h } = k;
  const s = ctx.store.get();
  const rows = creditorStats(ctx, s).sort((a, b) => b.placed - a.placed || a.name.localeCompare(b.name));
  const placed = rows.reduce((x, r) => x + r.placed, 0);
  const collected = rows.reduce((x, r) => x + r.collected, 0);
  const intro = mnrIntro(ctx);
  const v = kpiValues(ctx, intro);

  const kpis = h('div', { class: 'grid-4 cr-kpis' },
    k.kpi({ label: 'Creditors', value: v.count(rows.length), sub: `${Object.keys(s.portfolios).length} portfolios placed`, tone: 'brand', icon: 'creditors', testid: 'cr-kpi-count' }),
    k.kpi({ label: 'Placed balance', value: v.money(placed, 60), sub: `${Object.keys(s.accounts).length.toLocaleString('en-US')} accounts`, tone: 'neutral', testid: 'cr-kpi-placed' }),
    k.kpi({ label: 'Collected to date', value: v.money(collected, 120), sub: 'Verified payments, net of refunds', tone: 'ok', testid: 'cr-kpi-collected' }),
    k.kpi({ label: 'Recovery', value: v.pct(placed ? Math.round((collected / placed) * 1000) / 10 : 0, 180), sub: 'Collected ÷ placed', tone: 'info', testid: 'cr-kpi-recovery' }));
  if (intro) mnrRise(kpis.children, { step: 70, base: 40 });

  const page = h('div', { class: 'page page-creditors' },
    k.pageHeader({
      eyebrow: 'Clients',
      title: 'Creditors',
      subtitle: 'The creditors MBA collects for, the portfolios they placed and how much has been recovered.',
      actions: k.permBtn(ctx, 'creditor.manage', 'Add creditor', { variant: 'primary', icon: 'plus', testid: 'cr-add', onClick: () => ctx.router.go('#/m/creditors/new') }),
    }),
    kpis,
    k.card({
      title: 'All creditors', eyebrow: 'List', flush: true,
      body: k.table({
        testid: 'cr-table', stateKey: 'cr.list', caption: 'Creditors',
        rows,
        rowTestid: (r) => `cr-row-${r.id}`,
        onRowClick: (r) => ctx.router.go(`#/m/creditors/${r.id}`),
        empty: 'No creditors yet.',
        columns: [
          { key: 'name', label: 'Creditor', render: (r) => h('div', { class: 'cell-2' }, h('a', { href: `#/m/creditors/${r.id}` }, h('strong', {}, r.name)), h('span', { class: 'cell-sub' }, `${r.accounts.toLocaleString('en-US')} accounts`)) },
          { key: 'portfolioCount', label: 'Portfolios', render: (r) => (r.portfolios.length ? h('span', { class: 'cr-pfs' }, r.portfolios.map((p) => k.link(p.name, `#/m/portfolios/${p.id}`))) : h('span', { class: 'cell-sub' }, 'None yet')) },
          { key: 'live', label: 'Live plans', align: 'right', render: (r) => h('span', { class: 'num' }, String(r.live)) },
          { key: 'placed', label: 'Placed', align: 'right', render: (r) => k.money(r.placed) },
          { key: 'collected', label: 'Collected', align: 'right', render: (r) => k.money(r.collected) },
          { key: 'pct', label: 'Recovery', render: (r) => recoveryCell(k, r.pct) },
          { key: 'commissionPct', label: 'Commission', align: 'right', render: (r) => h('span', { class: 'qline cr-comm' }, h('span', { class: 'num' }, `${r.commissionPct}%`), k.qtag('Q-24')) },
        ],
      }),
    }));
  if (intro) mnrRise(page.querySelectorAll('[data-testid="cr-table"] tbody tr'), { step: 40, base: 200 });
  return mnrSpot(page);
}

// ------------------------------------------------------------------------------------------

function detailPage(ctx, id) {
  const k = ctx.kit;
  const { h } = k;
  const s = ctx.store.get();
  const st = creditorStats(ctx, s).find((r) => r.id === id);
  if (!st) {
    return h('div', { class: 'page page-creditors' },
      k.pageHeader({ crumbs: [{ label: 'Creditors', href: '#/m/creditors' }, { label: id }], eyebrow: 'Clients', title: 'Creditor not found' }),
      k.card({ body: k.emptyState(`There is no creditor with ID ${id}. It may have been removed by Reset demo.`, { title: 'Not found', action: k.btn('All creditors', { variant: 'primary', onClick: () => ctx.router.go('#/m/creditors') }) }) }));
  }
  const c = st.c;
  const addedAt = c.createdAt ? k.fmtDate(c.createdAt) : null;
  const pfRows = st.portfolios.map((p) => {
    const r = st.byPf[p.id] || { placed: 0, collected: 0, pct: 0 };
    const accounts = Object.values(s.accounts).filter((a) => a.portfolioId === p.id).length;
    return { id: p.id, name: p.name, placedAt: p.placedAt, accounts, placed: r.placed, collected: r.collected, pct: r.pct };
  });

  const profile = k.card({
    title: 'Profile', eyebrow: 'Creditor', testid: 'cr-profile',
    body: k.dl([
      ['Name', c.name],
      ['Portfolios', h('span', { class: 'num' }, String(st.portfolioCount))],
      ['Client since', addedAt || (pfRows.length ? k.fmtDate(pfRows.map((p) => p.placedAt).sort()[0]) : '—')],
      ['Accounts placed', h('span', { class: 'num' }, st.accounts.toLocaleString('en-US'))],
      ['Payee line on receipts', ctx.config.payeeLine(c.name), { wide: true }],
    ], { cols: 2 }),
  });

  const commission = k.card({
    title: 'Commission & remittance', eyebrow: 'Terms', testid: 'cr-terms',
    body: [
      k.dl([
        ['Commission rate', h('span', { class: 'qline' }, h('span', { class: 'num cr-big' }, `${c.commissionPct}%`), k.qtag('Q-24'))],
        ['Commission basis', h('span', { class: 'qline' }, 'Gross or net of fees — to confirm', k.qtag('Q-24'))],
        ['Remittance model', h('span', { class: 'qline' }, 'Decision needed', k.qtag('Q-01'))],
        ['PayMongo account', h('span', { class: 'qline' }, 'Only under the per-creditor model', k.qtag('Q-01'))],
      ], { cols: 1 }),
      h('p', { class: 'cr-note' }, 'Today borrowers pay the creditor directly. How money collected through the portal reaches the creditor is an open MBA decision. ', k.link('See the two models', '#/m/remittances', { testid: 'cr-remit-link' })),
    ],
  });

  const portfolios = k.card({
    title: 'Portfolios', eyebrow: 'Placements', flush: true, testid: 'cr-portfolios',
    body: k.table({
      testid: 'cr-pf-table', caption: `Portfolios of ${c.name}`,
      rows: pfRows,
      rowTestid: (r) => `cr-pf-${r.id}`,
      onRowClick: (r) => ctx.router.go(`#/m/portfolios/${r.id}`),
      empty: 'No portfolios placed yet. A portfolio is created when this creditor places accounts with MBA.',
      columns: [
        { key: 'name', label: 'Portfolio', render: (r) => h('a', { href: `#/m/portfolios/${r.id}` }, h('strong', {}, r.name)) },
        { key: 'placedAt', label: 'Placed on', render: (r) => h('span', { class: 'num' }, k.fmtDate(r.placedAt)) },
        { key: 'accounts', label: 'Accounts', align: 'right', render: (r) => h('span', { class: 'num' }, r.accounts.toLocaleString('en-US')) },
        { key: 'placed', label: 'Placed', align: 'right', render: (r) => k.money(r.placed) },
        { key: 'collected', label: 'Collected', align: 'right', render: (r) => k.money(r.collected) },
        { key: 'pct', label: 'Recovery', render: (r) => recoveryCell(k, r.pct) },
      ],
    }),
  });

  const intro = mnrIntro(ctx);
  const v = kpiValues(ctx, intro);
  const kpis = h('div', { class: 'grid-4 cr-kpis' },
    k.kpi({ label: 'Placed balance', value: v.money(st.placed), sub: 'Across all portfolios', tone: 'neutral', testid: 'cr-d-placed' }),
    k.kpi({ label: 'Collected to date', value: v.money(st.collected, 60), sub: 'Verified, net of refunds', tone: 'ok', testid: 'cr-d-collected' }),
    k.kpi({ label: 'Recovery', value: v.pct(st.pct, 120), sub: 'Collected ÷ placed', tone: 'info', testid: 'cr-d-recovery' }),
    k.kpi({ label: 'Live arrangements', value: v.count(st.live, 180), sub: 'Active or partially paid', tone: 'brand', testid: 'cr-d-live' }));
  if (intro) {
    mnrRise(kpis.children, { step: 70, base: 40 });
    mnrRise(portfolios.querySelectorAll('tbody tr'), { step: 50, base: 260 });
  }

  return mnrSpot(h('div', { class: 'page page-creditors', testid: 'cr-detail' },
    k.pageHeader({
      crumbs: [{ label: 'Creditors', href: '#/m/creditors' }, { label: c.name }],
      eyebrow: 'Creditor',
      title: c.name,
      subtitle: `${st.portfolioCount} ${st.portfolioCount === 1 ? 'portfolio' : 'portfolios'} · ${st.accounts.toLocaleString('en-US')} accounts · ${st.live} live arrangements`,
    }),
    kpis,
    h('div', { class: 'grid-2 cr-row' }, profile, commission),
    portfolios));
}

// ------------------------------------------------------------------------------------------

function newPage(ctx) {
  const k = ctx.kit;
  const { h } = k;
  const f = k.memo('cr.new', () => ({ name: '', commission: '15', error: null }));
  const allowed = ctx.can('creditor.manage');
  const nameIn = k.input({ testid: 'cr-new-name', value: f.name, placeholder: 'e.g. Metro Lending (demo)', disabled: !allowed, attrs: { autocomplete: 'off', maxlength: 80 }, on: { input: (e) => { f.name = e.target.value; } } });
  const pctIn = k.input({ type: 'number', testid: 'cr-new-commission', value: f.commission, disabled: !allowed, attrs: { min: 0, max: 100, step: 0.5, inputmode: 'decimal' }, on: { input: (e) => { f.commission = e.target.value; } } });

  const save = k.permBtn(ctx, 'creditor.manage', 'Add creditor', {
    variant: 'primary', icon: 'check', testid: 'cr-new-submit', type: 'submit',
  });
  const form = h('form', {
    class: 'cr-form', testid: 'cr-new-form', attrs: { novalidate: true },
    on: {
      submit: (e) => {
        e.preventDefault();
        if (!allowed) return;
        const res = ctx.actions.addCreditor(ctx.store, { name: f.name, commissionPct: f.commission === '' ? Number.NaN : Number(f.commission) });
        if (!res.ok) { f.error = res.message; ctx.rerender(); return; }
        f.name = ''; f.commission = '15'; f.error = null;
        k.toast('Creditor added. Portfolios appear here once they place accounts.', { kind: 'ok', testid: 'cr-toast' });
        ctx.router.go(`#/m/creditors/${res.creditorId}`);
      },
    },
  },
  !allowed ? k.notice('Only an Admin can add creditors. Switch the role to Admin to try it.', { tone: 'neutral', title: 'Requires Admin', testid: 'cr-new-denied' }) : null,
  h('div', { class: 'cr-form-grid' },
    k.field({ label: 'Creditor name', control: nameIn, required: true, hint: 'Shown to borrowers on the payee line after they verify.' }),
    k.field({ label: 'Commission (%)', control: pctIn, required: true, hint: h('span', { class: 'qline' }, 'Basis and tiers are open', k.qtag('Q-24')) })),
  f.error ? k.notice(f.error, { tone: 'danger', title: 'Check the details', testid: 'cr-new-error' }) : null,
  h('div', { class: 'cr-form-actions' }, k.btn('Cancel', { variant: 'ghost', onClick: () => ctx.router.go('#/m/creditors') }), save));

  return mnrSpot(h('div', { class: 'page page-creditors' },
    k.pageHeader({
      crumbs: [{ label: 'Creditors', href: '#/m/creditors' }, { label: 'Add creditor' }],
      eyebrow: 'Clients',
      title: 'Add creditor',
      subtitle: 'Register a creditor before its first portfolio is placed. Remittance and PayMongo details wait on Q-01.',
    }),
    h('div', { class: 'cr-new-layout' },
      k.card({ title: 'Creditor details', eyebrow: 'New', body: form }),
      k.card({
        title: 'What happens next', eyebrow: 'Intake (V3 §5)',
        body: h('ol', { class: 'cr-steps' },
          h('li', {}, h('strong', {}, 'Creditor'), h('span', {}, 'Name and commission terms.')),
          h('li', {}, h('strong', {}, 'Portfolio'), h('span', {}, 'Placement date and remittance terms.')),
          h('li', {}, h('strong', {}, 'Import'), h('span', {}, 'Accounts loaded from the standard template, validated row by row.')),
          h('li', {}, h('strong', {}, 'Queue'), h('span', {}, 'Valid accounts arrive as New in the unassigned queue.'))),
      }))));
}
