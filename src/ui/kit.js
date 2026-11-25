// Shared UI kit (plan Task 4). Every screen builds its DOM from these helpers.
// Rules: no innerHTML with data (text goes in via text nodes); styling only via tokens.css
// custom properties (see components.css); statuses always render as text + colour chip (D§7).
// Core code must never import this file.

import qrcode from 'qrcode-generator';
import { can, deniedHint } from '../core/permissions.js';
import { STATUS_TONE, humanize, maskMobile, maskEmail, maskTail, borrowerName } from '../core/format.js';
import { formatPHP } from '../core/money.js';
import { fmtDate, fmtDateTime } from '../core/clock.js';
import { icon } from './icons.js';

export { maskMobile, maskEmail, maskTail, borrowerName, humanize, formatPHP, fmtDate, fmtDateTime, icon };

let uid = 0;
/** Unique DOM id with a readable prefix. */
export const nextId = (prefix = 'k') => `${prefix}-${++uid}`;

// --------------------------------------------------------------------------------------------
// Per-key UI memory that survives re-renders (sort/page of a table, active tab, filter values).
// It lives in memory only: a page reload starts fresh, which is the right default for view state.
const MEMORY = new Map();
/** memo('accounts.filters', () => ({status:''})) → the same mutable object on every render. */
export function memo(key, init) {
  if (!MEMORY.has(key)) MEMORY.set(key, typeof init === 'function' ? init() : (init ?? {}));
  return MEMORY.get(key);
}
/** Clears every memo (used by Reset demo). */
export function clearMemo() {
  MEMORY.clear();
}

// --------------------------------------------------------------------------------------------
// h(): the only element factory.
const RESERVED = new Set(['class', 'attrs', 'on', 'dataset', 'style', 'testid', 'text']);

function classOf(c) {
  if (!c) return '';
  if (Array.isArray(c)) return c.map(classOf).filter(Boolean).join(' ');
  if (typeof c === 'object') return Object.keys(c).filter((k) => c[k]).join(' ');
  return String(c);
}

/** Appends children: strings/numbers → text nodes; arrays are flattened; null/false/undefined skipped. */
export function append(el, ...children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === true) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const isProps = (p) => p && typeof p === 'object' && !(p instanceof Node) && !Array.isArray(p);

/**
 * h('button', {class, attrs, on:{click}, dataset, style, testid, ...domProps}, ...children)
 * Unknown keys are set as DOM properties when the element has them (value, checked, disabled,
 * id, type, name, placeholder, htmlFor…), otherwise as attributes.
 */
export function h(tag, props, ...children) {
  if (!isProps(props)) {
    if (props !== undefined) children.unshift(props);
    props = {};
  }
  const el = document.createElement(tag);
  const cls = classOf(props.class);
  if (cls) el.className = cls;
  if (props.testid) el.setAttribute('data-testid', props.testid);
  if (props.text !== undefined && props.text !== null) el.textContent = String(props.text);
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v === false || v === null || v === undefined) continue;
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (props.dataset) for (const [k, v] of Object.entries(props.dataset)) if (v !== undefined && v !== null) el.dataset[k] = String(v);
  if (props.style) {
    if (typeof props.style === 'string') el.setAttribute('style', props.style);
    else for (const [k, v] of Object.entries(props.style)) {
      if (v === undefined || v === null) continue;
      if (k.startsWith('--')) el.style.setProperty(k, String(v));
      else el.style[k] = v;
    }
  }
  if (props.on) for (const [ev, fn] of Object.entries(props.on)) if (typeof fn === 'function') el.addEventListener(ev, fn);
  for (const [k, v] of Object.entries(props)) {
    if (RESERVED.has(k) || v === undefined) continue;
    if (k in el) el[k] = v;
    else if (v !== null && v !== false) el.setAttribute(k, v === true ? '' : String(v));
  }
  return append(el, children);
}

/** A fragment of children (no wrapper element). */
export const frag = (...children) => append(document.createDocumentFragment(), children);

// --------------------------------------------------------------------------------------------
// Buttons

/**
 * btn(label, {variant:'primary'|'secondary'|'ghost'|'danger'|'link'|'on-dark', size:'sm'|'md'|'lg',
 *             icon, iconRight, onClick, disabled, title, testid, type, block, attrs, cls})
 * A click while the handler's promise is pending is ignored (double-click guard).
 */
export function btn(label, opts = {}) {
  const {
    variant = 'secondary', size = 'md', icon: ic = null, iconRight = null, onClick = null,
    disabled = false, title = null, testid = null, type = 'button', block = false, attrs = {}, cls = '',
  } = opts;
  let busy = false;
  const el = h('button', {
    type,
    class: ['btn', `btn-${variant}`, `btn-${size}`, { 'btn-block': block, 'btn-icon-only': !label && ic }, cls],
    testid,
    attrs: { title: title || null, 'aria-label': !label && title ? title : null, ...attrs },
    disabled: !!disabled,
    on: {
      click: async (e) => {
        if (busy || el.disabled || !onClick) return;
        busy = true;
        try {
          await onClick(e);
        } finally {
          busy = false;
        }
      },
    },
  });
  if (ic) el.appendChild(icon(ic, { size: size === 'sm' ? 16 : 18 }));
  if (label !== null && label !== undefined && label !== '') append(el, h('span', { class: 'btn-label' }, label));
  if (iconRight) el.appendChild(icon(iconRight, { size: size === 'sm' ? 16 : 18 }));
  return el;
}

/**
 * Permission-aware button (C7). Allowed → a normal btn. Not allowed → visible but disabled,
 * with a lock icon and the deniedHint ('Requires Supervisor') as visible text and tooltip.
 */
export function permBtn(ctx, action, label, opts = {}) {
  const role = ctx.store.get().role;
  if (can(role, action)) return btn(label, opts);
  const hint = deniedHint(action) || 'Not available for this role';
  const el = btn(null, { ...opts, disabled: true, title: hint, onClick: null, icon: null, iconRight: null, cls: `${opts.cls || ''} is-locked` });
  el.setAttribute('data-hint', hint);
  el.setAttribute('aria-label', `${typeof label === 'string' ? label : 'Action'} — ${hint}`);
  append(el, icon('lock', { size: 14 }), h('span', { class: 'btn-label' }, label), h('span', { class: 'btn-hint' }, hint));
  return el;
}

/** Segmented control: [{value, label, icon?, testid?}] — one selected. */
export function segmented({ items, value, onChange, label = null, testid = null, variant = 'light' }) {
  const wrap = h('div', { class: ['seg', `seg-${variant}`], testid, attrs: { role: 'group', 'aria-label': label } });
  for (const it of items) {
    const on = it.value === value;
    const b = h('button', {
      type: 'button',
      class: ['seg-btn', { 'is-on': on }],
      testid: it.testid || null,
      attrs: { 'aria-pressed': on ? 'true' : 'false' },
      on: { click: () => { if (!on && onChange) onChange(it.value); } },
    });
    if (it.icon) b.appendChild(icon(it.icon, { size: 16 }));
    append(b, h('span', {}, it.label));
    wrap.appendChild(b);
  }
  return wrap;
}

// --------------------------------------------------------------------------------------------
// Status, tags, text

/** Status chip: dot + text label, tone from STATUS_TONE (V3 §16). Never colour alone. */
export function chip(status, { label = null, tone = null, testid = null, size = 'md' } = {}) {
  const t = tone || STATUS_TONE[status] || 'neutral';
  return h('span', { class: ['chip', `tone-${t}`, `chip-${size}`], testid, dataset: { status } },
    h('span', { class: 'chip-dot', attrs: { 'aria-hidden': 'true' } }),
    h('span', { class: 'chip-label' }, label ?? humanize(status)));
}

/** Small square tag, e.g. tag('Assumption', {tone:'brand'}) or tag('Q-14'). */
export function tag(text, { tone = 'neutral', testid = null, title = null } = {}) {
  return h('span', { class: ['tag', `tone-${tone}`], testid, attrs: { title } }, text);
}

/** V3 question marker: qtag('Q-17') → "Q-17" tag; qtag('Q-17', 'Fee borne by MBA') → label + tag. */
export function qtag(qid, label = null, { tone = 'brand' } = {}) {
  const t = tag(qid, { tone, title: 'Open question for MBA — see V3 decisions list' });
  return label ? h('span', { class: 'qline' }, h('span', {}, label), t) : t;
}

/** Uppercase spaced section label (the site's heading style). */
export const eyebrow = (text, { tone = null } = {}) => h('div', { class: ['eyebrow', { [`eyebrow-${tone}`]: tone }] }, text);

/** Money in a tabular-figure span. */
export const money = (centavos, { cls = '' } = {}) => h('span', { class: ['num', cls] }, formatPHP(centavos));

/** External link (opens a new tab) or in-app hash link. */
export function link(label, href, { external = false, testid = null, cls = '' } = {}) {
  const a = h('a', { href, class: ['link', cls], testid });
  append(a, label);
  if (external) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.appendChild(icon('external', { size: 14 }));
  }
  return a;
}

/** Definition list for detail panes: dl([['Creditor', 'Sample Bank (demo)'], ['Status', chip('active')]]). */
export function dl(rows, { cols = 2, testid = null } = {}) {
  const el = h('dl', { class: ['dl', `dl-cols-${cols}`], testid });
  for (const r of rows) {
    if (!r) continue;
    const [k, v, opts = {}] = r;
    el.appendChild(h('div', { class: ['dl-row', { 'dl-wide': opts.wide }], testid: opts.testid || null },
      h('dt', {}, k), h('dd', {}, v ?? '—')));
  }
  return el;
}

/** Progress bar with an accessible label. */
export function progress({ value, max, label = null, tone = 'brand', testid = null }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return h('div', { class: ['progress', `tone-${tone}`], testid, attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value, 'aria-label': label } },
    h('div', { class: 'progress-fill', style: { width: `${pct.toFixed(1)}%` } }));
}

/** Spinner (respects reduced motion via motion.css). */
export const spinner = ({ label = 'Loading' } = {}) => h('span', { class: 'spinner mba-anim-spin', attrs: { role: 'status', 'aria-label': label } });

/** Inline notice: notice('Text', {tone:'warn', title}) */
export function notice(body, { tone = 'info', title = null, testid = null, icon: ic = null } = {}) {
  const name = ic || ({ ok: 'check', warn: 'alert', danger: 'alert', info: 'info', brand: 'info', neutral: 'info' }[tone] || 'info');
  return h('div', { class: ['notice', `tone-${tone}`], testid, attrs: { role: tone === 'danger' ? 'alert' : null } },
    icon(name, { size: 18 }),
    h('div', { class: 'notice-body' }, title ? h('strong', { class: 'notice-title' }, title) : null, h('div', {}, body)));
}

// --------------------------------------------------------------------------------------------
// Layout blocks

/** card({title, eyebrow, actions, body, footer, testid, cls, flush}) */
export function card({ title = null, eyebrow: eb = null, actions = null, body = null, footer = null, testid = null, cls = '', flush = false } = {}) {
  const hasHead = title || eb || actions;
  return h('section', { class: ['card', { 'card-flush': flush }, cls], testid },
    hasHead ? h('header', { class: 'card-head' },
      h('div', { class: 'card-titles' }, eb ? eyebrow(eb) : null, title ? h('h2', { class: 'card-title' }, title) : null),
      actions ? h('div', { class: 'card-actions' }, actions) : null) : null,
    body !== null ? h('div', { class: 'card-body' }, body) : null,
    footer ? h('footer', { class: 'card-foot' }, footer) : null);
}

/** pageHeader({title, subtitle, actions, eyebrow, crumbs:[{label, href}], meta}) — title carries data-testid="page-title". */
export function pageHeader({ title, subtitle = null, actions = null, eyebrow: eb = null, crumbs = null, meta = null } = {}) {
  let crumbNav = null;
  if (crumbs && crumbs.length) {
    const ol = h('ol', {});
    crumbs.forEach((c, i) => {
      const last = i === crumbs.length - 1;
      ol.appendChild(h('li', {}, c.href && !last ? h('a', { href: c.href }, c.label) : h('span', { attrs: { 'aria-current': last ? 'page' : null } }, c.label)));
    });
    crumbNav = h('nav', { class: 'crumbs', attrs: { 'aria-label': 'Breadcrumb' } }, ol);
  }
  return h('header', { class: 'page-head' },
    crumbNav,
    h('div', { class: 'page-head-row' },
      h('div', { class: 'page-head-titles' },
        eb ? eyebrow(eb) : null,
        h('h1', { class: 'page-title', testid: 'page-title', attrs: { tabindex: '-1' } }, title),
        subtitle ? h('p', { class: 'page-sub' }, subtitle) : null,
        meta ? h('div', { class: 'page-meta' }, meta) : null),
      actions ? h('div', { class: 'page-actions' }, actions) : null));
}

/** kpi({label, value, sub, tone, testid}) — value is a string or node. */
export function kpi({ label, value, sub = null, tone = 'brand', testid = null, icon: ic = null } = {}) {
  return h('div', { class: ['kpi', `tone-${tone}`], testid },
    h('div', { class: 'kpi-head' }, h('span', { class: 'kpi-label' }, label), ic ? icon(ic, { size: 18 }) : null),
    h('div', { class: 'kpi-value num', testid: testid ? `${testid}-value` : null }, value),
    sub ? h('div', { class: 'kpi-sub' }, sub) : null);
}

/** emptyState(text, {title, action, icon}) */
export function emptyState(text, { title = null, action = null, icon: ic = 'info', testid = 'empty-state' } = {}) {
  return h('div', { class: 'empty', testid },
    h('span', { class: 'empty-icon' }, icon(ic, { size: 22 })),
    title ? h('strong', { class: 'empty-title' }, title) : null,
    h('p', { class: 'empty-text' }, text),
    action ? h('div', { class: 'empty-action' }, action) : null);
}

/** timeline([{at, kind, title, detail, tone}]) — newest first as given. */
export function timeline(items, { testid = 'timeline', empty = 'Nothing has happened on this record yet.' } = {}) {
  if (!items || !items.length) return emptyState(empty);
  const ol = h('ol', { class: 'timeline', testid });
  for (const it of items) {
    ol.appendChild(h('li', { class: ['tl-item', `tone-${it.tone || 'neutral'}`], dataset: { kind: it.kind } },
      h('span', { class: 'tl-dot', attrs: { 'aria-hidden': 'true' } }),
      h('div', { class: 'tl-main' },
        h('div', { class: 'tl-top' },
          h('span', { class: 'tl-title' }, it.title),
          it.at ? h('time', { class: 'tl-time', attrs: { datetime: it.at } }, fmtDateTime(it.at)) : null),
        it.detail ? h('div', { class: 'tl-detail' }, it.detail) : null)));
  }
  return ol;
}

/** tabs({items:[{id,label,count?}], active, onChange, testid}) — ARIA tablist with arrow-key support. */
export function tabs({ items, active, onChange, testid = 'tabs', label = 'Sections' }) {
  const list = h('div', { class: 'tabs', testid, attrs: { role: 'tablist', 'aria-label': label } });
  const buttons = items.map((it) => {
    const on = it.id === active;
    return h('button', {
      type: 'button',
      class: ['tab', { 'is-on': on }],
      testid: `tab-${it.id}`,
      attrs: { role: 'tab', 'aria-selected': on ? 'true' : 'false', tabindex: on ? '0' : '-1' },
      on: { click: () => { if (!on && onChange) onChange(it.id); } },
    }, h('span', {}, it.label), it.count !== undefined && it.count !== null ? h('span', { class: 'tab-count num' }, String(it.count)) : null);
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = buttons.indexOf(document.activeElement);
    if (i === -1) return;
    const n = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    n.focus();
    n.click();
  });
  append(list, buttons);
  return list;
}

// --------------------------------------------------------------------------------------------
// Forms

/** input({type, name, value, placeholder, testid, on, attrs, ...}) */
export function input(props = {}) {
  const { cls = '', type = 'text', ...rest } = props;
  return h('input', { ...rest, type, class: ['input', cls] });
}

/** select({name, value, options:[string | {value,label}], testid, on}) */
export function select({ options = [], value = '', cls = '', ...rest } = {}) {
  const el = h('select', { ...rest, class: ['input', 'select', cls] });
  for (const o of options) {
    const opt = typeof o === 'object' ? o : { value: o, label: o };
    el.appendChild(h('option', { value: String(opt.value) }, opt.label));
  }
  // Only select a value that exists; otherwise the browser default (first option) stays visible.
  const v = String(value ?? '');
  if ([...el.options].some((o) => o.value === v)) el.value = v;
  return el;
}

/** textarea({name, value, rows, testid}) */
export function textarea({ value = '', rows = 3, cls = '', ...rest } = {}) {
  const el = h('textarea', { ...rest, rows, class: ['input', 'textarea', cls] });
  el.value = value;
  return el;
}

/** field({label, control, hint, error, required, testid}) — visible label bound to the control. */
export function field({ label, control, hint = null, error = null, required = false, testid = null, cls = '' }) {
  if (!control.id) control.id = nextId('f');
  const hintId = hint ? nextId('hint') : null;
  const errId = error ? nextId('err') : null;
  const describedBy = [hintId, errId].filter(Boolean).join(' ');
  if (describedBy) control.setAttribute('aria-describedby', describedBy);
  if (error) control.setAttribute('aria-invalid', 'true');
  if (required) control.required = true;
  return h('div', { class: ['field', { 'has-error': !!error }, cls], testid },
    h('label', { class: 'field-label', htmlFor: control.id }, label, required ? h('span', { class: 'req', attrs: { 'aria-hidden': 'true' } }, ' *') : null),
    control,
    hint ? h('div', { class: 'field-hint', id: hintId }, hint) : null,
    error ? h('div', { class: 'field-error', id: errId, attrs: { role: 'alert' } }, error) : null);
}

/**
 * filterBar({fields:[{type:'text'|'select'|'date'|'number', name, label, options?, placeholder?}],
 *            values, onApply(values), onReset(), testid})
 * Select fields get an "All" option first unless field.noAll. Enter in any input applies.
 */
export function filterBar({ fields, values = {}, onApply, onReset = null, testid = 'filter' }) {
  const controls = {};
  const form = h('form', { class: 'filterbar', testid, attrs: { role: 'search', novalidate: true } });
  for (const f of fields) {
    let control;
    const tid = `${testid}-${f.name}`;
    if (f.type === 'select') {
      const opts = f.noAll ? f.options : [{ value: '', label: f.allLabel || 'All' }, ...(f.options || [])];
      control = select({ name: f.name, value: values[f.name] ?? '', options: opts, testid: tid });
    } else {
      control = input({ type: f.type || 'text', name: f.name, value: values[f.name] ?? '', placeholder: f.placeholder || '', testid: tid, attrs: { step: f.step || null, min: f.min ?? null } });
    }
    controls[f.name] = control;
    form.appendChild(field({ label: f.label, control, cls: ['filter-field', `filter-${f.type || 'text'}`, f.wide ? 'filter-wide' : ''].join(' ') }));
  }
  const collect = () => Object.fromEntries(Object.entries(controls).map(([k, c]) => [k, c.value.trim()]));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (onApply) onApply(collect());
  });
  form.appendChild(h('div', { class: 'filter-actions' },
    btn('Apply', { variant: 'primary', type: 'submit', testid: `${testid}-apply`, icon: 'filter' }),
    btn('Reset', {
      variant: 'ghost', testid: `${testid}-reset`,
      onClick: () => {
        for (const c of Object.values(controls)) c.value = '';
        if (onReset) onReset();
        else if (onApply) onApply(collect());
      },
    })));
  for (const c of Object.values(controls)) if (c.tagName === 'SELECT') c.addEventListener('change', () => onApply && onApply(collect()));
  return form;
}

// --------------------------------------------------------------------------------------------
// Table: sorting + pagination, state kept in memo(stateKey) across re-renders.

function cmp(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });
}

/**
 * table({columns:[{key,label,render?,align?,sortable?,sortValue?,width?}], rows, onRowClick?,
 *        pageSize=20, empty, testid, stateKey, rowTestid?(row), caption?, initialSort?:{key,dir}})
 */
export function table({
  columns, rows, onRowClick = null, pageSize = 20, empty = 'No records match.', testid = 'table',
  stateKey = null, rowTestid = null, caption = null, initialSort = null, dense = false,
}) {
  const st = stateKey ? memo(`table:${stateKey}`, () => ({ sortKey: initialSort?.key ?? null, dir: initialSort?.dir ?? 'asc', page: 0 }))
    : { sortKey: initialSort?.key ?? null, dir: initialSort?.dir ?? 'asc', page: 0 };
  const wrap = h('div', { class: ['tbl', { 'tbl-dense': dense }], testid });

  function sorted() {
    if (!st.sortKey) return rows;
    const col = columns.find((c) => c.key === st.sortKey);
    if (!col) return rows;
    const val = col.sortValue || ((r) => r[col.key]);
    const out = rows.map((r, i) => [r, i]).sort((x, y) => cmp(val(x[0]), val(y[0])) || x[1] - y[1]);
    if (st.dir === 'desc') out.reverse();
    return out.map((x) => x[0]);
  }

  function draw() {
    wrap.replaceChildren();
    if (!rows.length) {
      wrap.appendChild(emptyState(empty, { testid: `${testid}-empty` }));
      return;
    }
    const all = sorted();
    const pages = Math.max(1, Math.ceil(all.length / pageSize));
    if (st.page >= pages) st.page = pages - 1;
    const start = st.page * pageSize;
    const slice = all.slice(start, start + pageSize);

    const thead = h('thead', {}, h('tr', {}, columns.map((c) => {
      const sortable = c.sortable !== false && !!(c.key);
      const on = st.sortKey === c.key;
      const th = h('th', {
        class: [c.align ? `al-${c.align}` : '', { 'is-sorted': on }],
        attrs: { scope: 'col', 'aria-sort': on ? (st.dir === 'asc' ? 'ascending' : 'descending') : (sortable ? 'none' : null) },
        style: c.width ? { width: c.width } : null,
      });
      if (sortable) {
        th.appendChild(h('button', {
          type: 'button', class: 'th-sort', testid: `${testid}-sort-${c.key}`,
          on: {
            click: () => {
              if (st.sortKey === c.key) st.dir = st.dir === 'asc' ? 'desc' : 'asc';
              else { st.sortKey = c.key; st.dir = 'asc'; }
              st.page = 0;
              draw();
            },
          },
        }, h('span', {}, c.label), icon(on ? (st.dir === 'asc' ? 'chevronUp' : 'chevronDown') : 'sort', { size: 14 })));
      } else {
        th.appendChild(h('span', {}, c.label));
      }
      return th;
    })));

    const tbody = h('tbody', {});
    slice.forEach((r, i) => {
      const tr = h('tr', {
        class: { 'is-clickable': !!onRowClick },
        testid: rowTestid ? rowTestid(r) : null,
        attrs: onRowClick ? { tabindex: '0' } : {},
      });
      if (onRowClick) {
        tr.addEventListener('click', (e) => {
          if (e.target.closest('a, button, input, select, textarea, label')) return;
          onRowClick(r);
        });
        tr.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target === tr) onRowClick(r);
        });
      }
      for (const c of columns) {
        const v = c.render ? c.render(r, start + i) : r[c.key];
        tr.appendChild(h('td', { class: [c.align ? `al-${c.align}` : '', c.cls || ''], dataset: { label: c.label } }, v === null || v === undefined || v === '' ? '—' : v));
      }
      tbody.appendChild(tr);
    });

    wrap.appendChild(h('div', { class: 'tbl-scroll' },
      h('table', {}, caption ? h('caption', { class: 'sr-only' }, caption) : null, thead, tbody)));

    if (all.length > pageSize) {
      wrap.appendChild(h('div', { class: 'tbl-foot' },
        h('span', { class: 'tbl-count num' }, `${(start + 1).toLocaleString('en-US')}–${(start + slice.length).toLocaleString('en-US')} of ${all.length.toLocaleString('en-US')}`),
        h('div', { class: 'tbl-pager' },
          btn('Previous', { size: 'sm', variant: 'ghost', icon: 'chevronLeft', disabled: st.page === 0, testid: `${testid}-prev`, onClick: () => { st.page -= 1; draw(); } }),
          h('span', { class: 'tbl-page num' }, `Page ${st.page + 1} of ${pages}`),
          btn('Next', { size: 'sm', variant: 'ghost', iconRight: 'chevronRight', disabled: st.page >= pages - 1, testid: `${testid}-next`, onClick: () => { st.page += 1; draw(); } }))));
    } else {
      wrap.appendChild(h('div', { class: 'tbl-foot' }, h('span', { class: 'tbl-count num' }, `${all.length.toLocaleString('en-US')} ${all.length === 1 ? 'record' : 'records'}`)));
    }
  }
  draw();
  return wrap;
}

// --------------------------------------------------------------------------------------------
// Overlays: modal, confirm, toast

function rootOf(id, cls) {
  let el = document.getElementById(id);
  if (!el) {
    el = h('div', { id, class: cls });
    document.body.appendChild(el);
  }
  return el;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const openModals = [];

/**
 * modal({title, body, actions, testid, size:'sm'|'md'|'lg', onClose, dismissible}) → {open, close, el, body}
 * body / actions may be nodes, arrays, or functions (api) => nodes.
 */
export function modal({ title, body = null, actions = null, testid = 'modal', size = 'md', onClose = null, dismissible = true, eyebrow: eb = null } = {}) {
  const titleId = nextId('mt');
  let returnFocus = null;
  let isOpen = false;
  const api = {};
  const bodyEl = h('div', { class: 'modal-body' });
  const footEl = h('footer', { class: 'modal-foot' });
  const dialog = h('div', { class: ['modal', `modal-${size}`], testid, attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' } },
    h('header', { class: 'modal-head' },
      h('div', {}, eb ? eyebrow(eb) : null, h('h2', { class: 'modal-title', id: titleId }, title)),
      dismissible ? btn(null, { variant: 'ghost', icon: 'x', title: 'Close', testid: `${testid}-close`, onClick: () => api.close() }) : null),
    bodyEl, footEl);
  const backdrop = h('div', { class: 'modal-backdrop' }, dialog);
  backdrop.addEventListener('mousedown', (e) => { if (dismissible && e.target === backdrop) api.close(); });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation();
      api.close();
    } else if (e.key === 'Tab') {
      const f = [...dialog.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  const fill = (el, content) => {
    el.replaceChildren();
    append(el, typeof content === 'function' ? content(api) : content);
  };
  api.el = dialog;
  api.body = bodyEl;
  api.setBody = (content) => fill(bodyEl, content);
  api.setActions = (content) => { fill(footEl, content); footEl.hidden = !footEl.childNodes.length; };
  api.isOpen = () => isOpen;
  api.open = () => {
    if (isOpen) return api;
    isOpen = true;
    returnFocus = document.activeElement;
    api.setBody(body);
    api.setActions(actions);
    rootOf('modal-root', 'modal-root').appendChild(backdrop);
    openModals.push(api);
    document.documentElement.classList.add('has-modal');
    const first = bodyEl.querySelector(FOCUSABLE) || footEl.querySelector(FOCUSABLE) || dialog;
    first.focus({ preventScroll: true });
    return api;
  };
  api.close = () => {
    if (!isOpen) return;
    isOpen = false;
    backdrop.remove();
    openModals.splice(openModals.indexOf(api), 1);
    if (!openModals.length) document.documentElement.classList.remove('has-modal');
    if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
    if (onClose) onClose();
  };
  return api;
}

/** Closes every open modal (used on route change and Reset demo). */
export function closeAllModals() {
  for (const m of [...openModals]) m.close();
}

/** confirm({title, message, confirmLabel, variant, onConfirm, testid}) — opens immediately. */
export function confirmDialog({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'primary', onConfirm, testid = 'confirm' }) {
  const m = modal({
    title, testid, size: 'sm',
    body: typeof message === 'string' ? h('p', {}, message) : message,
    actions: (api) => [
      btn(cancelLabel, { variant: 'ghost', testid: `${testid}-cancel`, onClick: () => api.close() }),
      btn(confirmLabel, { variant, testid: `${testid}-ok`, onClick: async () => { api.close(); if (onConfirm) await onConfirm(); } }),
    ],
  });
  return m.open();
}

/**
 * toast(text, {kind:'info'|'ok'|'warn'|'danger', testid, duration, title}) → {close}
 * Lives outside #app so re-renders never wipe it. aria-live polite (danger → alert).
 */
export function toast(text, { kind = 'info', testid = 'toast', duration = 4500, title = null } = {}) {
  const root = rootOf('toast-root', 'toast-root');
  root.setAttribute('aria-live', 'polite');
  const name = { ok: 'check', warn: 'alert', danger: 'alert', info: 'info' }[kind] || 'info';
  const el = h('div', { class: ['toast', `tone-${kind === 'ok' ? 'ok' : kind}`, 'mba-anim-rise'], testid, attrs: { role: kind === 'danger' ? 'alert' : 'status' } },
    icon(name, { size: 18 }),
    h('div', { class: 'toast-body' }, title ? h('strong', { class: 'toast-title' }, title) : null, h('div', { class: 'toast-text' }, text)));
  let timer = null;
  const close = () => {
    clearTimeout(timer);
    el.remove();
  };
  el.appendChild(btn(null, { variant: 'ghost', size: 'sm', icon: 'x', title: 'Dismiss', cls: 'toast-x', onClick: close }));
  root.appendChild(el);
  while (root.children.length > 4) root.firstChild.remove();
  if (duration > 0) timer = setTimeout(close, duration);
  return { close, el };
}

// --------------------------------------------------------------------------------------------
// QR + downloads

/** Real, scannable QR code as an inline <svg> (C14). Quiet zone of 4 modules. */
export function qrSvg(text, px = 180, { testid = 'qr' } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  const q = qrcode(0, 'M');
  q.addData(String(text));
  q.make();
  const n = q.getModuleCount();
  const quiet = 4;
  const size = n + quiet * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c + quiet} ${r + quiet}h1v1h-1z`;
  }
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('width', String(px));
  svg.setAttribute('height', String(px));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'QR code for the payment link');
  svg.setAttribute('class', 'qr');
  svg.setAttribute('data-testid', testid);
  svg.setAttribute('data-qr-text', String(text));
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', String(size));
  bg.setAttribute('height', String(size));
  bg.setAttribute('fill', '#FFFFFF');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d);
  p.setAttribute('fill', '#060D1C');
  svg.append(bg, p);
  return svg;
}

/** Saves a file from memory (CSV exports, receipts). No dialog, no network. */
export function downloadFile(name, mime, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, attrs: { download: name }, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
