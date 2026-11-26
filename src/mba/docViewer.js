// Contract / agreement files (MBA view). Added 2026-11-26 at the user's request: an Attachments
// column on Transactions holding each borrower's own contract and signed agreement.
// V3 §7: one attachment type ("Contract / agreement document") on the arrangement, every version
// kept. This module only reads those records:
// - docChips()      compact buttons for a table cell (Transactions list)
// - docList()       fuller rows for a card (transaction detail)
// - openDocViewer() the preview modal. Seeded files carry `sample` and draw a SAMPLE page from the
//   record (parties, terms, schedule, endorsement). Files uploaded during the demo keep only their
//   name and size (Q-08), so they show an honest placeholder, never invented content.
import { arrangementRef, maskTail, borrowerName, fmtSize } from '../core/format.js';
import logoSvg from '../assets/mba_logo.svg';

const SVG_NS = 'http://www.w3.org/2000/svg';
const LOGO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;

/** Compact chips for a table cell. Clicking one opens the viewer, never the row behind it. */
export function docChips(ctx, files, { empty = 'None on file' } = {}) {
  const { h, icon } = ctx.kit;
  const { docKind, DOC_LABEL } = ctx.selectors;
  if (!files.length) return h('span', { class: 'doc-none' }, empty);
  return h('div', { class: 'doc-chips', testid: 'doc-chips' }, files.map((f) => {
    const kind = docKind(f);
    const label = DOC_LABEL[kind];
    return h('button', {
      type: 'button', class: ['doc-chip', `is-${kind}`], testid: 'doc-chip', dataset: { attachment: f.id, kind },
      attrs: { title: `${f.filename} · v${f.version}`, 'aria-label': `Open ${label.toLowerCase()}: ${f.filename}${f.version > 1 ? `, version ${f.version}` : ''}` },
      on: { click: () => openDocViewer(ctx, f.id) },
    }, icon('file', { size: 14 }), h('span', { class: 'doc-chip-label' }, label), f.version > 1 ? h('span', { class: 'doc-chip-ver num' }, `v${f.version}`) : null);
  }));
}

/** One row per file, with name, version, size and date (cards). */
export function docList(ctx, files, { testid = 'doc-list' } = {}) {
  const { h, icon, fmtDate } = ctx.kit;
  const { docKind, DOC_LABEL } = ctx.selectors;
  return h('ul', { class: 'doc-list', testid }, files.map((f) => {
    const kind = docKind(f);
    return h('li', {}, h('button', {
      type: 'button', class: ['doc-row', `is-${kind}`], testid: 'doc-row', dataset: { attachment: f.id, kind },
      on: { click: () => openDocViewer(ctx, f.id) },
    },
      h('span', { class: 'doc-row-icon' }, icon('file', { size: 18 })),
      h('span', { class: 'doc-row-text' },
        h('span', { class: 'doc-row-kind' }, DOC_LABEL[kind]),
        h('span', { class: 'doc-row-name' }, f.filename),
        h('span', { class: 'doc-row-sub num' }, `v${f.version} · ${fmtSize(f.size)} · ${fmtDate(f.at)}`)),
      h('span', { class: 'doc-row-go' }, icon('eye', { size: 16 }))));
  }));
}

/** Opens the preview modal for one attachment; returns the modal api (null if the file is gone). */
export function openDocViewer(ctx, attachmentId) {
  const k = ctx.kit;
  const { h } = k;
  const s = ctx.store.get();
  const f = s.attachments[attachmentId];
  if (!f) {
    k.toast('That file is no longer in the demo data.', { kind: 'warn', testid: 'doc-toast' });
    return null;
  }
  const arr = s.arrangements[f.arrangementId] || null;
  const acc = arr ? s.accounts[arr.accountId] : null;
  const creditor = acc ? s.creditors[acc.creditorId] : null;
  const current = arr ? (ctx.selectors.lineageArrangement(s, arr.lineageId) || arr) : null;
  const o = { f, arr, acc, creditor, kind: ctx.selectors.docKind(f), versions: ctx.selectors.attachmentVersions(s, f.id) };
  return k.modal({
    title: f.filename,
    eyebrow: 'Contract / agreement document',
    testid: 'doc-viewer',
    size: 'lg',
    initialFocus: '[data-testid="doc-close"]',
    body: h('div', { class: 'docv', dataset: { attachment: f.id } }, preview(ctx, s, o), details(ctx, o)),
    actions: (api) => [
      current ? k.btn('Open arrangement', {
        variant: 'secondary', icon: 'arrangements', testid: 'doc-open-arrangement',
        onClick: () => { api.close(); ctx.router.go(`#/m/arrangements/${current.id}`); },
      }) : null,
      k.btn('Close', { variant: 'primary', testid: 'doc-close', onClick: () => api.close() }),
    ],
  }).open();
}

// --------------------------------------------------------------------------------------------
// Side panel: the V3 §7 metadata (file name, uploader, timestamp, version, arrangement)

function details(ctx, { f, arr, acc, creditor, versions }) {
  const { h, dl, link, fmtDateTime } = ctx.kit;
  return h('aside', { class: 'docv-side' },
    dl([
      ['Version', versions.length > 1 ? `v${f.version} of ${versions.length}` : `v${f.version}`],
      ['Size', h('span', { class: 'num' }, fmtSize(f.size))],
      ['Uploaded by', f.uploader || '—'],
      ['Uploaded', h('span', { class: 'num' }, fmtDateTime(f.at))],
      ['Arrangement', arr ? link(`${arrangementRef(arr.id)} · v${arr.version}`, `#/m/arrangements/${arr.id}`, { cls: 'mono', testid: 'doc-arr-link' }) : '—'],
      ['Account', acc ? link(`${borrowerName(acc)} · ${acc.ref}`, `#/m/accounts/${acc.id}`, { testid: 'doc-acc-link' }) : '—'],
      ['Creditor', creditor ? creditor.name : '—'],
    ], { cols: 1, testid: 'doc-meta' }),
    versions.length > 1
      ? h('div', { class: 'docv-versions', testid: 'doc-versions' },
        h('h3', { class: 'docv-side-h' }, 'Versions'),
        h('ol', {}, versions.map((v) => h('li', { class: { 'is-current': v.id === f.id } },
          h('span', { class: 'docv-v' }, `v${v.version}`),
          h('span', { class: 'num' }, fmtDateTime(v.at)),
          h('span', {}, v.uploader)))))
      : null,
    h('p', { class: 'docv-note' }, 'Every version is kept and nothing is overwritten. Proposed for the live platform: files are stored encrypted and opened through a short-lived link, staff only.'));
}

// --------------------------------------------------------------------------------------------
// Preview: a sample page for seeded files, an honest placeholder for files uploaded in the demo

function preview(ctx, s, o) {
  const { h, icon, qtag } = ctx.kit;
  const page = o.f.sample === 'agreement' && o.arr && o.acc ? agreementPage(ctx, s, o)
    : o.f.sample === 'contract' && o.acc ? contractPage(ctx, s, o) : null;
  if (!page) {
    return h('figure', { class: 'docv-preview docv-preview-empty', testid: 'doc-placeholder' },
      h('div', { class: 'docv-empty' },
        icon('file', { size: 40 }),
        h('strong', {}, o.f.filename),
        h('p', {}, 'No preview in the demo: the mockup stores only the file name and size.'),
        qtag('Q-08', 'File types, size and retention:', { tone: 'brand' })));
  }
  return h('figure', { class: 'docv-preview', testid: 'doc-preview' },
    page,
    h('figcaption', { class: 'docv-caption' },
      h('span', {}, 'Sample page drawn from the demo record. The live platform shows the uploaded PDF.'),
      o.f.sample === 'agreement' ? qtag('Q-10', 'Or a summary the platform generates?', { tone: 'brand' }) : null));
}

function agreementPage(ctx, s, { f, arr, acc, creditor }) {
  const { h, fmtDate, formatPHP } = ctx.kit;
  const legal = ctx.config.LEGAL_NAME;
  const insts = ctx.selectors.installmentsOf(s, arr.id);
  const plan = ctx.selectors.installmentPlan(insts);
  const planText = plan.shape === 'equal' ? `${plan.n} × ${formatPHP(plan.per)}, ${arr.frequency}`
    : plan.shape === 'final' ? `${plan.n - 1} × ${formatPHP(plan.per)} + final ${formatPHP(plan.last)}, ${arr.frequency}`
      : `${plan.n}, ${arr.frequency}`;
  const agent = s.agents[arr.createdBy]?.name ?? 'Collections agent';
  const carried = insts.filter((i) => i.carriedFrom).map((i) => i.seq);
  return paper(ctx, 'agreement',
    h('header', { class: 'docv-letterhead' },
      h('div', { class: 'docv-brand' },
        h('img', { class: 'docv-logo', src: LOGO, alt: '' }),
        h('div', {}, h('strong', {}, 'MBA Consult'), h('span', {}, legal))),
      h('div', { class: 'docv-ref' }, h('span', { class: 'mono' }, arrangementRef(arr.id)), h('span', {}, `Version ${arr.version}`))),
    h('h3', { class: 'docv-title' }, 'Payment arrangement agreement'),
    h('p', { class: 'docv-dated' }, `Dated ${fmtDate(arr.createdAt)}`),
    h('div', { class: 'docv-parties' },
      party(ctx, 'Borrower', borrowerName(acc), `Account ${acc.ref}`),
      party(ctx, 'Collecting for the creditor', legal, creditor?.name ?? '')),
    h('table', { class: 'docv-terms', testid: 'doc-terms' },
      h('tbody', {},
        termRow(ctx, 'Total committed', formatPHP(arr.total)),
        termRow(ctx, 'Installments', planText),
        termRow(ctx, 'First due', fmtDate(arr.firstDue)),
        termRow(ctx, 'Pay to', creditor ? ctx.config.payeeLine(creditor.name) : legal))),
    h('div', { class: 'docv-schedule' },
      h('h4', { class: 'docv-h4' }, 'Schedule'),
      h('ol', { class: ['docv-sched', { 'is-long': insts.length > 6 }], testid: 'doc-schedule' }, insts.map((i) => h('li', {},
        h('span', { class: 'docv-sched-n num' }, String(i.seq)),
        h('span', { class: 'num' }, fmtDate(i.dueDate)),
        h('span', { class: 'num docv-sched-amt' }, formatPHP(i.amount))))),
      carried.length ? h('p', { class: 'docv-sched-note', testid: 'doc-carried' },
        `${carried.length === 1 ? 'Installment' : 'Installments'} ${carried.join(', ')} ${carried.length === 1 ? 'was' : 'were'} paid under the earlier version and ${carried.length === 1 ? 'carries' : 'carry'} over.`) : null),
    h('h4', { class: 'docv-h4' }, 'Terms and conditions'),
    lines(ctx, [100, 97, 99, 62, 100, 94, 48]),
    h('div', { class: 'docv-signs' },
      sign(ctx, borrowerName(acc), 'Borrower'),
      sign(ctx, agent, 'Prepared by, collections agent', { squiggle: false })));
}

function contractPage(ctx, s, { f, acc, creditor }) {
  const { h, fmtDate, formatPHP } = ctx.kit;
  const pf = s.portfolios[acc.portfolioId];
  const name = creditor?.name ?? 'Creditor';
  const base = f.filename.replace(` ${acc.ref}`, '').replace(/\.pdf$/i, '');
  const title = base.charAt(0).toUpperCase() + base.slice(1);
  const sections = [34, 46, 28, 40, 36]; // grey heading bars: the sample never names clauses
  return paper(ctx, 'contract',
    h('header', { class: 'docv-letterhead' },
      h('div', { class: 'docv-cred' },
        h('span', { class: 'docv-mark', attrs: { 'aria-hidden': 'true' } }, initials(name)),
        h('div', {}, h('strong', {}, name), h('span', {}, 'Copy on file'))),
      h('div', { class: 'docv-ref' }, h('span', {}, 'Account no.'), h('span', { class: 'num' }, maskTail(acc.creditorAccountNo || acc.ref)))),
    h('h3', { class: 'docv-title' }, title),
    h('div', { class: 'docv-parties' },
      party(ctx, 'Borrower', borrowerName(acc), `MBA reference ${acc.ref}`),
      party(ctx, 'Creditor', name, '')),
    sections.map((w, i) => [h('span', { class: 'docv-hbar', style: { width: `${w}%` }, attrs: { 'aria-hidden': 'true' } }), lines(ctx, i % 2 ? [100, 88, 54] : [100, 96, 71])]),
    h('div', { class: 'docv-stamp', testid: 'doc-stamp' },
      h('strong', {}, 'Placed for collection'),
      h('span', {}, ctx.config.LEGAL_NAME),
      pf ? h('span', {}, `${pf.name} · placed ${fmtDate(pf.placedAt)}`) : null,
      h('span', { class: 'num' }, `Balance placed ${formatPHP(acc.placedBalance)}`)),
    h('div', { class: 'docv-signs' },
      sign(ctx, borrowerName(acc), 'Borrower'),
      sign(ctx, name, 'For the creditor')));
}

// --------------------------------------------------------------------------------------------
// Paper parts

function paper(ctx, kind, ...children) {
  const { h } = ctx.kit;
  return h('div', { class: ['docv-paper', `docv-${kind}`], testid: 'doc-paper', dataset: { kind } },
    h('span', { class: 'docv-watermark', attrs: { 'aria-hidden': 'true' } }, 'Sample'),
    children,
    h('footer', { class: 'docv-foot' }, h('span', {}, 'Demo document · fictional data'), h('span', {}, 'Page 1 of 1')));
}

function party(ctx, role, name, sub) {
  const { h } = ctx.kit;
  return h('div', { class: 'docv-party' }, h('span', { class: 'docv-party-role' }, role), h('strong', {}, name), sub ? h('span', {}, sub) : null);
}

function termRow(ctx, label, value) {
  const { h } = ctx.kit;
  return h('tr', {}, h('th', { attrs: { scope: 'row' } }, label), h('td', { class: 'num' }, value));
}

/** Grey text lines standing in for clauses, so the sample never invents legal wording. */
function lines(ctx, widths) {
  const { h } = ctx.kit;
  return h('div', { class: 'docv-lines', attrs: { 'aria-hidden': 'true' } }, widths.map((w) => h('span', { style: { width: `${w}%` } })));
}

function sign(ctx, name, role, { squiggle: drawn = true } = {}) {
  const { h } = ctx.kit;
  return h('div', { class: ['docv-sign', { 'is-unsigned': !drawn }] },
    drawn ? squiggle(name) : h('span', { class: 'docv-sig-space', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'docv-sign-line' }), h('strong', {}, name), h('span', {}, role));
}

/** A signature-like stroke, different per name and stable across renders. */
function squiggle(seedText) {
  let x = 0x811c9dc5;
  for (const ch of String(seedText)) x = Math.imul(x ^ ch.charCodeAt(0), 0x01000193);
  const rnd = () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return ((x >>> 0) % 1000) / 1000;
  };
  let d = `M6 ${(28 + rnd() * 6).toFixed(1)}`;
  for (let i = 0; i < 6; i++) d += ` Q${14 + i * 17} ${(6 + rnd() * 30).toFixed(1)} ${22 + i * 17} ${(14 + rnd() * 18).toFixed(1)}`;
  d += ` M10 40 Q60 ${(34 + rnd() * 6).toFixed(1)} 120 37`;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 128 46');
  svg.setAttribute('class', 'docv-sig');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  svg.appendChild(p);
  return svg;
}

const initials = (name) => String(name).replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
