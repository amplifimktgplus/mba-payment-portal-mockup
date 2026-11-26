// Option A · Midnight: borrower concept screens (2026-11-26).
//   Phone 390×844: code entry (B2) · amount due (B3) · choose how to pay (B4) · payment confirmation (B8)
//   Desktop 1440×900: the arrangement, what's due and paying, in one view.
// Every figure comes from ctx.data and is formatted with ctx.fmt or fx.money. Effects are hand-built
// in vanilla JS/CSS: aurora light, count-ups, a notched glass card with the next installments stacked
// behind it, glow edges, a glass keypad, a selection edge that glides between methods, a hand-off to
// the payment provider, and a confirmation that prints out of a glass slot. No third-party component
// code. Styles live in a/borrower.css (.a-b-* under .opt-a) on top of a/tokens.css.
// All helpers are local to this file (nothing shared with the other option files).
import logoWhite from '../../assets/mba_logo_white.svg';
import logoInk from '../../assets/mba_logo.svg';

const svgUrl = (text) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
const LOGO = svgUrl(logoWhite); // white wordmark, for the dark canvas
const LOGO_INK = svgUrl(logoInk); // dark wordmark, for the paper confirmation
const AURORA = ['#4B0096', '#1F4FE0', '#64C8FF'];
let uid = 0;
const nid = (p) => `a-b-${p}-${++uid}`;

// =============================================================================================
// Small local helpers

/** setTimeout / setInterval that are all cleared when the screen is removed. */
function timers(ctx) {
  const live = new Set();
  ctx.onCleanup(() => {
    for (const id of live) { clearTimeout(id); clearInterval(id); }
    live.clear();
  });
  return {
    after(ms, fn) { const id = setTimeout(() => { live.delete(id); fn(); }, ms); live.add(id); return id; },
    every(ms, fn) { const id = setInterval(fn, ms); live.add(id); return id; },
  };
}

/** Two extra stroke glyphs drawn in the icon set's style (24px grid, 1.75 stroke, square caps). */
const GLYPHS = {
  backspace: 'M21 5H9l-6 7 6 7h12z M17 9.5l-5 5 M12 9.5l5 5',
  arrowDown: 'M12 4v15 M6 13l6 6 6-6',
};
function glyph(ctx, name, size = 18) {
  const { svg } = ctx.fx;
  return svg('svg', {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75,
    'stroke-linecap': 'square', 'stroke-linejoin': 'miter', 'aria-hidden': 'true', focusable: 'false', class: `icon a-b-g-${name}`,
  }, svg('path', { d: GLYPHS[name] }));
}

/** Entrance: elements marked with rise() animate in once the screen is on screen. */
const rise = (el, d = 0) => { el.classList.add('a-b-in'); el.style.setProperty('--d', `${d}ms`); return el; };
function enter(ctx, root) {
  const go = () => root.classList.add('is-in');
  if (ctx.fx.reduced()) { go(); return; }
  ctx.onCleanup(ctx.fx.inView(root, go, { threshold: 0.2 }));
}

/** The Midnight canvas: navy, slow aurora light, a veil for legibility and film grain. */
function canvas(ctx, cls, { seed = 1, opacity = 0.62 } = {}) {
  const { h, fx, kind } = ctx;
  const bg = h('div', { class: 'a-b-bg', attrs: { 'aria-hidden': 'true' } });
  fx.aurora(bg, { colors: AURORA, opacity, seed, blur: kind === 'desktop' ? 110 : 60 });
  bg.append(h('div', { class: 'a-b-veil' }));
  fx.grain(bg, { opacity: 0.06 });
  return h('div', { class: ['a-b', `a-b-${kind}`, cls] }, bg);
}

function brand(ctx, sub = 'Payment portal') {
  const { h } = ctx;
  return h('div', { class: 'a-b-brand' },
    h('img', { class: 'a-b-logo', src: LOGO, alt: '' }),
    h('span', { class: 'a-b-brand-text' }, h('strong', {}, 'MBA Consult'), h('span', {}, sub)));
}

function avatar(ctx) {
  const { h, fmt, data } = ctx;
  return h('span', { class: 'a-b-avatar', attrs: { role: 'img', 'aria-label': data.borrower.name } }, fmt.initials(data.borrower.name));
}

/** Status pill: always text plus colour (and an icon or a dot). */
function pill(ctx, text, { tone = '', ic = null, dot = false, cls = '' } = {}) {
  const { h, icon } = ctx;
  return h('span', { class: ['a-pill', tone && `is-${tone}`, cls] },
    dot ? h('span', { class: 'a-dot', attrs: { 'aria-hidden': 'true' } }) : null,
    ic ? icon(ic, { size: 14 }) : null,
    h('span', {}, text));
}

/** How an installment reads to the borrower (same wording as the real B3 schedule). */
function instStatus(i, currentSeq) {
  if (i.status === 'paid') return { label: 'Paid', tone: 'ok' };
  if (i.status === 'overdue') return { label: 'Overdue', tone: 'danger' };
  if (i.status === 'missed') return { label: 'Missed', tone: 'warn' };
  if (i.seq === currentSeq) return { label: 'Due now', tone: 'info' };
  return { label: 'Upcoming', tone: '' };
}

const methodByName = (ctx, name) => ctx.data.methods.find((m) => m.name === name) || { name, marks: [], icon: 'bank' };

/** A method's logo(s) on a small white plate; Online banking gets the bank line icon instead. */
function plate(ctx, m, cls = '') {
  const { h, icon } = ctx;
  return h('span', { class: ['a-logo-plate', 'a-b-plate', { 'is-duo': m.marks.length > 1, 'is-icon': !m.marks.length }, cls], attrs: { 'aria-hidden': 'true' } },
    m.marks.length ? m.marks.map((k) => h('img', { src: k.src, alt: '', dataset: { mark: k.name } })) : icon(m.icon || 'bank', { size: 20 }));
}

/** A big peso amount with the same parts as fx.money, but static (for the printed paper). */
function staticMoney(ctx, centavos) {
  const { h, fmt } = ctx;
  const p = fmt.phpParts(centavos);
  return h('span', { class: ['mc', 'a-money'] }, h('span', { class: 'mc-sign' }, p.sign), h('span', { class: 'mc-whole' }, p.whole), h('span', { class: 'mc-cents' }, p.cents));
}

/** Six-segment progress: paid segments glow, the current one shimmers. */
function segBar(ctx, { count, paid, current = 0 }) {
  const { h } = ctx;
  return h('div', { class: 'a-b-seg', attrs: { role: 'img', 'aria-label': `${paid} of ${count} installments paid` } },
    Array.from({ length: count }, (_, i) => h('span', {
      class: ['a-b-seg-i', { 'is-paid': i < paid, 'is-now': i >= paid && i + 1 === current }],
      style: { '--i': String(i) },
    })));
}

const planLine = (ctx) => {
  const { fmt, data } = ctx;
  const s = data.borrower.schedule;
  const same = s.every((i) => i.amount === s[0].amount);
  return same ? `${s.length} monthly payments of ${fmt.php(s[0].amount)}` : `${s.length} payments · ${fmt.php(data.borrower.total)} in all`;
};

// =============================================================================================
// The notched glass balance card, with the next installments stacked behind it

/** Rounded rect with a soft notch in the middle of its top edge, as an SVG path (o = inset). */
function notchPath(w, hh, { r = 26, nw = 136, nd = 16, k = 30, o = 0 } = {}) {
  const f = (n) => Number(n.toFixed(2));
  const R = r - o;
  const L = o; const T = o; const RT = w - o; const B = hh - o;
  const x1 = (w - nw) / 2; const x2 = (w + nw) / 2; const y = T + nd;
  return [
    `M${f(L)} ${f(T + R)}`, `A${f(R)} ${f(R)} 0 0 1 ${f(L + R)} ${f(T)}`,
    `L${f(x1)} ${f(T)}`, `C${f(x1 + k * 0.55)} ${f(T)} ${f(x1 + k * 0.45)} ${f(y)} ${f(x1 + k)} ${f(y)}`,
    `L${f(x2 - k)} ${f(y)}`, `C${f(x2 - k * 0.45)} ${f(y)} ${f(x2 - k * 0.55)} ${f(T)} ${f(x2)} ${f(T)}`,
    `L${f(RT - R)} ${f(T)}`, `A${f(R)} ${f(R)} 0 0 1 ${f(RT)} ${f(T + R)}`,
    `L${f(RT)} ${f(B - R)}`, `A${f(R)} ${f(R)} 0 0 1 ${f(RT - R)} ${f(B)}`,
    `L${f(L + R)} ${f(B)}`, `A${f(R)} ${f(R)} 0 0 1 ${f(L)} ${f(B - R)}`, 'Z',
  ].join(' ');
}

/** Dark glass card cut with a top notch, a glowing brand-gradient edge that follows the notch. */
function notchCard(ctx, { w, geo = {}, cls = '' }, ...children) {
  const { h, fx } = ctx;
  const { svg } = fx;
  const gid = nid('edge');
  const fid = nid('glow');
  const glow = svg('path', { class: 'a-b-notch-glow', stroke: `url(#${gid})`, filter: `url(#${fid})` });
  const line = svg('path', { class: 'a-b-notch-line', stroke: `url(#${gid})` });
  const art = svg('svg', { class: 'a-b-notch-svg', width: w, 'aria-hidden': 'true', focusable: 'false' },
    svg('defs', {},
      svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 1, y2: 1 },
        svg('stop', { offset: '0%', 'stop-color': '#8FD8FF', 'stop-opacity': 0.95 }),
        svg('stop', { offset: '50%', 'stop-color': '#6B2FD0', 'stop-opacity': 0.85 }),
        svg('stop', { offset: '100%', 'stop-color': '#64C8FF', 'stop-opacity': 0.18 })),
      svg('filter', { id: fid, x: '-10%', y: '-10%', width: '120%', height: '120%' }, svg('feGaussianBlur', { stdDeviation: 3.5 }))),
    glow, line);
  const glass = h('div', { class: 'a-b-notch-glass' });
  const body = h('div', { class: 'a-b-notch-body' }, children);
  const el = h('div', { class: ['a-b-notch', cls], style: { width: `${w}px` } },
    h('div', { class: 'a-b-notch-shadow', attrs: { 'aria-hidden': 'true' } }), glass, art, body);
  const draw = (hh) => {
    if (!hh) return;
    const clip = `path('${notchPath(w, hh, geo)}')`;
    glass.style.clipPath = clip;
    glass.style.webkitClipPath = clip;
    const d = notchPath(w, hh, { ...geo, o: 0.75 });
    art.setAttribute('viewBox', `0 0 ${w} ${hh}`);
    art.setAttribute('height', String(hh));
    glow.setAttribute('d', d);
    line.setAttribute('d', d);
  };
  draw(geo.estimate || 240);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => draw(body.offsetHeight));
    ro.observe(body);
    ctx.onCleanup(() => ro.disconnect());
  }
  return el;
}

/** The amount-due card with installments 4 and 5 peeking above it. */
function balanceStack(ctx, { w, size = 'phone', onPeek = null }) {
  const { h, fx, fmt, data } = ctx;
  const b = data.borrower;
  const ahead = b.schedule.filter((i) => i.seq > b.due.seq).slice(0, 2);
  const peeks = ahead.map((i, n) => h('div', { class: ['a-b-peek', `a-b-peek-${n + 1}`] },
    h('span', { class: 'a-b-peek-l' }, `Installment ${i.seq} · ${fmt.date(i.dueDate)}`),
    h('span', { class: 'a-b-peek-r a-num' }, fmt.php(i.amount)))).reverse();
  const peekWrap = h('div', {
    class: ['a-b-peeks', { 'is-click': !!onPeek }], attrs: { 'aria-hidden': 'true' },
    on: onPeek ? { click: onPeek } : {},
  }, peeks);
  const desk = size === 'desk';
  const card = notchCard(ctx, { w, cls: 'a-b-bal', geo: desk ? { r: 28, nw: 168, nd: 18, k: 34, estimate: 250 } : { r: 26, nw: 136, nd: 16, k: 30, estimate: 240 } },
    h('div', { class: 'a-b-bal-top' },
      h('span', { class: 'a-label' }, 'Amount due'),
      pill(ctx, 'Due now', { tone: 'info', dot: true })),
    h('div', { class: 'a-b-bal-amt' }, fx.money(b.due.amount, { className: 'a-money', delay: 200, duration: 1200 })),
    h('p', { class: 'a-b-bal-sub' }, `Installment ${b.due.seq} of ${b.count} · due ${fmt.dayShort(b.due.dueDate)}`),
    h('div', { class: 'a-b-bal-prog' },
      h('div', { class: 'a-b-bal-row' },
        h('span', { class: 'a-label' }, `${b.paidCount} of ${b.count} paid`),
        h('span', { class: 'a-b-bal-rem' }, h('strong', { class: 'a-num' }, fmt.php(b.remaining)), ' remaining')),
      segBar(ctx, { count: b.count, paid: b.paidCount, current: b.due.seq }),
      h('p', { class: 'a-b-bal-of' }, h('span', { class: 'a-num' }, fmt.php(b.paid)), ' of ', h('span', { class: 'a-num' }, fmt.php(b.total)), ' paid')));
  return h('div', { class: ['a-b-stack', `is-${size}`], style: { width: `${w}px` } }, peekWrap, card);
}

// =============================================================================================
// Paying: the "You're paying" card, the method picker with a gliding edge, details, the hand-off

function payingCard(ctx) {
  const { h, fx, fmt, icon, data } = ctx;
  const b = data.borrower;
  const card = h('section', { class: ['a-b-paying', 'a-glass', 'a-spot'], attrs: { 'aria-label': 'You’re paying' } },
    h('div', { class: 'a-b-paying-top' },
      h('span', { class: 'a-label' }, 'You’re paying'),
      pill(ctx, `Installment ${b.due.seq} of ${b.count}`)),
    h('div', { class: 'a-b-paying-amt' }, fx.money(b.due.amount, { className: 'a-money', delay: 150 })),
    h('div', { class: 'a-b-paying-to' },
      h('span', { class: 'a-b-bankchip' }, icon('bank', { size: 16 }), h('span', {}, b.creditor)),
      h('span', { class: 'a-b-paying-due' }, `Due ${fmt.dayShort(b.due.dueDate)}`)));
  fx.spotlight(card);
  return card;
}

const connector = (ctx) => ctx.h('span', { class: 'a-b-link', attrs: { 'aria-hidden': 'true' } }, glyph(ctx, 'arrowDown', 18));

/** Method tiles in a 3-column grid; one glowing edge glides to the chosen tile. */
function methodPicker(ctx) {
  const { h, fx, icon, data } = ctx;
  let current = data.methods[0].name;
  const nowName = h('span', { class: 'a-b-pick-now' }, h('span', { class: 'a-b-pick-now-t' }, current));
  const glide = h('span', { class: 'a-b-glide', attrs: { 'aria-hidden': 'true' } });
  const tiles = data.methods.map((m, i) => {
    const tile = h('button', {
      type: 'button',
      class: ['a-b-mt', 'a-spot'],
      style: { '--c': String(i % 3), '--r': String(Math.floor(i / 3)) },
      attrs: { 'aria-pressed': 'false' },
      dataset: { method: m.name },
      on: { click: () => select(m.name) },
    },
    h('span', { class: 'a-b-mt-check', attrs: { 'aria-hidden': 'true' } }, icon('check', { size: 12 })),
    plate(ctx, m),
    h('span', { class: 'a-b-mt-name' }, m.name, m.name === 'Card' ? h('span', { class: 'a-b-sr' }, ' (Visa or Mastercard)') : null));
    fx.spotlight(tile);
    return tile;
  });
  const grid = h('div', { class: 'a-b-mgrid', attrs: { role: 'group', 'aria-label': 'Payment methods' } }, glide, tiles);
  function select(name, quiet = false) {
    current = name;
    for (const t of tiles) {
      const on = t.dataset.method === name;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-pressed', String(on));
      if (on) {
        glide.style.setProperty('--c', t.style.getPropertyValue('--c'));
        glide.style.setProperty('--r', t.style.getPropertyValue('--r'));
      }
    }
    const next = h('span', { class: ['a-b-pick-now-t', { 'is-new': !quiet }] }, name);
    nowName.replaceChildren(next);
  }
  select(current, true);
  const el = h('section', { class: ['a-b-pick', 'a-glass'], attrs: { 'aria-label': 'Choose how to pay' } },
    h('div', { class: 'a-b-pick-head' }, h('span', { class: 'a-label' }, 'Pay with'), nowName),
    grid);
  return { el, get: () => current };
}

function detailsList(ctx) {
  const { h, icon, data } = ctx;
  const b = data.borrower;
  const row = (ic, k, v, cls = '') => h('div', { class: ['a-b-dl-row', cls] },
    h('dt', {}, h('span', { class: 'a-b-dl-ic' }, icon(ic, { size: 15 })), k),
    h('dd', {}, v));
  return h('dl', { class: ['a-b-dl', 'a-glass'] },
    row('user', 'Paying to', b.payee, 'is-stack'),
    row('hash', 'Reference', h('span', { class: 'a-num' }, b.ref)));
}

function providerNote(ctx) {
  const { h, icon } = ctx;
  return h('div', { class: 'a-b-note' },
    h('span', { class: 'a-b-note-ic' }, icon('lock', { size: 16 })),
    h('p', {},
      h('strong', {}, 'You’ll finish paying on our payment provider’s secure page.'),
      ' Your card, wallet or bank details are entered with them and never reach MBA.'));
}

const testMode = (ctx) => ctx.h('p', { class: 'a-b-test' }, ctx.h('span', { class: 'a-dot', attrs: { 'aria-hidden': 'true' } }), 'Test mode · no real money moves');

function checkoutButton(ctx, onClick) {
  const { h, icon } = ctx;
  const btn = h('button', { type: 'button', class: ['a-btn', 'a-btn-light', 'a-b-cta'], on: { click: () => onClick(btn) } },
    h('span', { class: 'a-b-cta-idle' }, icon('lock', { size: 18 }), h('span', {}, 'Continue to secure checkout')),
    h('span', { class: 'a-b-cta-busy', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'a-b-spin' }), 'Connecting securely…'));
  return btn;
}

/** The hand-off: MBA passes the borrower to the payment provider, then the demo resets. */
function handoff(ctx, host, t, getMethod) {
  const { h, icon, fmt, data } = ctx;
  const b = data.borrower;
  const methodOut = h('strong', {});
  const card = h('div', { class: ['a-b-hand-card', 'a-glass'] },
    h('div', { class: 'a-b-hand-path' },
      h('span', { class: 'a-b-hand-node' }, h('img', { src: LOGO, alt: '' })),
      h('span', { class: 'a-b-hand-line' }, h('i'), h('i'), h('i')),
      h('span', { class: ['a-b-hand-node', 'is-lock'] }, icon('lock', { size: 22 }))),
    h('p', { class: 'a-b-hand-title' }, 'Taking you to secure checkout'),
    h('p', { class: 'a-b-hand-sub' }, 'Paying ', h('strong', { class: 'a-num' }, fmt.php(b.due.amount)), ' with ', methodOut),
    h('p', { class: 'a-b-hand-small' }, 'You’ll finish paying on our payment provider’s secure page.'),
    h('span', { class: 'a-b-hand-bar' }, h('i')),
    h('p', { class: 'a-b-hand-test' }, 'Test mode · no real money moves'));
  const ov = h('div', { class: 'a-b-hand', attrs: { 'aria-hidden': 'true' } }, card);
  const live = h('p', { class: 'a-b-sr', attrs: { role: 'status' } });
  host.append(ov, live);
  let busy = false;
  return (btn) => {
    if (busy) return;
    busy = true;
    methodOut.textContent = getMethod();
    btn.classList.add('is-busy');
    btn.setAttribute('aria-busy', 'true');
    t.after(220, () => {
      ov.classList.add('is-on');
      live.textContent = `Taking you to secure checkout. Paying ${fmt.php(b.due.amount)} with ${getMethod()}.`;
    });
    t.after(2900, () => {
      ov.classList.remove('is-on');
      btn.classList.remove('is-busy');
      btn.removeAttribute('aria-busy');
      live.textContent = '';
      busy = false;
    });
  };
}

// =============================================================================================
// Phone bottom sheet (schedule, help)

function sheet(ctx, host, { title, sub = '', body }) {
  const { h, icon } = ctx;
  let back = null;
  const closeBtn = h('button', { type: 'button', class: 'a-b-x', attrs: { 'aria-label': `Close ${title}` }, on: { click: () => close() } }, icon('x', { size: 18 }));
  const panel = h('section', {
    class: 'a-b-sheet',
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    on: { keydown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } } },
  },
  h('span', { class: 'a-b-grab', attrs: { 'aria-hidden': 'true' } }),
  h('header', { class: 'a-b-sheet-head' },
    h('div', {}, h('h2', { class: 'a-h2' }, title), sub ? h('p', { class: 'a-b-sheet-sub' }, sub) : null),
    closeBtn),
  body);
  const wrap = h('div', { class: 'a-b-sheetwrap', attrs: { inert: '' } },
    h('div', { class: 'a-b-scrim', on: { click: () => close() } }), panel);
  host.append(wrap);
  function open(from) {
    back = from || null;
    wrap.removeAttribute('inert');
    wrap.classList.add('is-open');
    requestAnimationFrame(() => closeBtn.focus({ preventScroll: true }));
  }
  function close() {
    if (!wrap.classList.contains('is-open')) return;
    wrap.classList.remove('is-open');
    wrap.setAttribute('inert', '');
    back?.focus({ preventScroll: true });
  }
  return { open, close };
}

function scheduleList(ctx, cls = '') {
  const { h, fmt, data } = ctx;
  const b = data.borrower;
  return h('ol', { class: ['a-b-sched', cls] }, b.schedule.map((i, n) => {
    const s = instStatus(i, b.due.seq);
    const now = i.seq === b.due.seq;
    return h('li', { class: ['a-b-sched-i', { 'is-now': now, 'a-edge': now, 'is-paid': i.status === 'paid' }], style: { '--i': String(n) } },
      h('span', { class: 'a-b-sched-n a-num', attrs: { 'aria-hidden': 'true' } }, String(i.seq)),
      h('span', { class: 'a-b-sched-main' },
        h('strong', {}, `Installment ${i.seq}`),
        h('span', {}, i.paidAt ? `Paid ${fmt.date(i.paidAt)}` : `Due ${fmt.date(i.dueDate)}`)),
      h('span', { class: 'a-b-sched-side' },
        h('span', { class: 'a-num a-b-sched-amt' }, fmt.php(i.amount)),
        pill(ctx, s.label, { tone: s.tone, dot: true, cls: 'a-b-sched-pill' })));
  }));
}

function recentList(ctx, cls = '') {
  const { h, icon, fmt, data } = ctx;
  return h('ul', { class: ['a-b-recent', cls] }, data.borrower.history.map((p) => h('li', { class: ['a-b-recent-i', 'a-spot'] },
    plate(ctx, methodByName(ctx, p.method)),
    h('span', { class: 'a-b-recent-main' },
      h('strong', {}, p.seq ? `Installment ${p.seq}` : p.method),
      h('span', {}, p.seq ? `${p.method} · ${fmt.date(p.paidAt)}` : fmt.date(p.paidAt))),
    h('span', { class: 'a-b-recent-side' },
      h('strong', { class: 'a-num' }, fmt.php(p.amount)),
      h('span', { class: 'a-b-ok' }, icon('check', { size: 13 }), 'Paid')))));
}

function payeeBlock(ctx) {
  const { h, icon, data } = ctx;
  const b = data.borrower;
  return h('div', { class: 'a-b-payee' },
    h('span', { class: 'a-b-payee-ic' }, icon('shield', { size: 16 })),
    h('p', {},
      h('span', { class: 'a-b-payee-k' }, 'Paying to'),
      h('span', { class: 'a-b-payee-v' }, b.payee),
      h('span', { class: 'a-b-payee-ref' }, 'Arrangement ', h('span', { class: 'a-num' }, b.arrangementRef))));
}

// =============================================================================================
// 1 · Code entry (B2): no amounts or balance before the code is confirmed

function renderCode(ctx) {
  const { h, icon, fx, data } = ctx;
  const b = data.borrower;
  const t = timers(ctx);
  const N = b.codeLength;
  const root = canvas(ctx, 'a-b-code', { seed: 3, opacity: 0.6 });
  const live = h('p', { class: 'a-b-sr', attrs: { role: 'status' } });

  // ---- the six cells
  const digits = [];
  let locked = false;
  const cells = Array.from({ length: N }, (_, i) => h('span', { class: 'a-b-cell', style: { '--i': String(i) } },
    h('span', { class: 'a-b-cell-d' }), h('span', { class: 'a-b-caret' })));
  const paint = () => cells.forEach((c, i) => {
    const filled = i < digits.length;
    const active = !locked && i === digits.length;
    c.classList.toggle('is-filled', filled);
    c.classList.toggle('is-active', active);
    c.classList.toggle('a-edge', active);
    c.firstChild.textContent = filled ? digits[i] : '';
  });

  // ---- countdown and resend (resend opens up when the code expires, as in the real demo)
  const [mm, ss] = String(b.codeExpiresIn).split(':').map(Number);
  const full = (mm * 60 + ss) || 1;
  let left = full;
  const clockText = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const clock = h('strong', { class: 'a-num' }, clockText(left));
  const timerText = h('span', { class: 'a-b-timer-t' }, 'Code expires in ', clock);
  const resendHint = nid('hint');
  const ring = h('span', { class: 'a-b-resend-ring', attrs: { 'aria-hidden': 'true' } }, icon('refresh', { size: 13 }));
  const resend = h('button', {
    type: 'button', class: 'a-b-resend',
    attrs: { 'aria-disabled': 'true', 'aria-describedby': resendHint },
    on: { click: () => doResend() },
  }, ring, h('span', {}, 'Send a new code'));
  const setRing = () => ring.style.setProperty('--p', String(1 - left / full));
  setRing();
  const expired = () => {
    timerText.replaceChildren('This code has expired.');
    timerText.parentElement?.classList.add('is-warn');
    resend.setAttribute('aria-disabled', 'false');
  };
  function doResend() {
    if (resend.getAttribute('aria-disabled') === 'true') return;
    left = full;
    clock.textContent = clockText(left);
    setRing();
    resend.setAttribute('aria-disabled', 'true');
    timerText.parentElement?.classList.remove('is-warn');
    timerText.replaceChildren('We’ve sent you a new code.');
    live.textContent = 'We’ve sent you a new code.';
    t.after(2400, () => timerText.replaceChildren('Code expires in ', clock));
  }
  t.every(1000, () => {
    if (left <= 0) return;
    left -= 1;
    clock.textContent = clockText(left);
    setRing();
    if (left === 0) expired();
  });

  // ---- verified state: cells turn calm green, a check draws, then it resets so it can be replayed
  const check = fx.svg('svg', { class: 'a-b-okmark', viewBox: '0 0 24 24', width: 22, height: 22, 'aria-hidden': 'true' },
    fx.svg('circle', { cx: 12, cy: 12, r: 10.5, pathLength: 1, class: 'a-b-okmark-c' }),
    fx.svg('path', { d: 'M7.2 12.4l3.2 3.2 6.4-6.6', pathLength: 1, class: 'a-b-okmark-p' }));
  const okRow = h('div', { class: 'a-b-okrow' }, h('span', { class: 'a-b-okpill' }, check, 'Verified'), h('span', { class: 'a-b-okrow-t' }, `Welcome back, ${b.first}.`));
  const timerRow = h('div', { class: 'a-b-timerrow' },
    h('span', { class: 'a-b-timer' }, icon('clock', { size: 16 }), timerText),
    resend);
  const statusRow = h('div', { class: 'a-b-statusrow' }, timerRow, okRow);

  function verify() {
    locked = true;
    paint();
    t.after(260, () => { root.classList.add('is-ok'); live.textContent = 'Code verified.'; });
    t.after(260 + 1400, () => root.classList.add('is-clearing'));
    t.after(260 + 1400 + 360, () => {
      digits.length = 0;
      locked = false;
      root.classList.remove('is-ok', 'is-clearing');
      live.textContent = '';
      paint();
    });
  }
  const press = (d) => {
    if (locked || digits.length >= N) return;
    digits.push(d);
    paint();
    if (digits.length === N) verify();
  };
  const del = () => {
    if (locked || !digits.length) return;
    digits.pop();
    paint();
  };

  // ---- the glass keypad
  const ink = (e) => {
    const k = e.currentTarget;
    const r = k.getBoundingClientRect();
    const s = k.offsetWidth ? r.width / k.offsetWidth : 1;
    k.style.setProperty('--kx', `${(e.clientX - r.left) / s}px`);
    k.style.setProperty('--ky', `${(e.clientY - r.top) / s}px`);
    k.classList.remove('is-ink');
    void k.offsetWidth; // restart the ink animation
    k.classList.add('is-ink');
  };
  const key = (d, n) => rise(h('button', {
    type: 'button', class: 'a-b-key', attrs: { 'aria-label': d },
    on: { pointerdown: ink, click: () => press(d) },
  }, h('span', { class: 'a-b-key-d' }, d)), 360 + n * 28);
  const pad = h('div', { class: 'a-b-pad', attrs: { role: 'group', 'aria-label': 'Keypad' } },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key),
    h('span', { class: ['a-b-key', 'is-blank'], attrs: { 'aria-hidden': 'true' } }),
    key('0', 10),
    rise(h('button', {
      type: 'button', class: ['a-b-key', 'is-back'], attrs: { 'aria-label': 'Delete last digit' },
      on: { pointerdown: ink, click: del },
    }, glyph(ctx, 'backspace', 24)), 360 + 11 * 28));

  root.addEventListener('keydown', (e) => {
    if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); } else if (e.key === 'Backspace') { e.preventDefault(); del(); }
  });

  const scroll = h('div', { class: 'a-b-scroll' },
    h('header', { class: 'a-b-top' }, brand(ctx), pill(ctx, 'Secure', { ic: 'lock', cls: 'a-b-secure' })),
    rise(h('div', { class: 'a-b-head' },
      h('p', { class: ['a-label', 'a-b-eyebrow'] }, 'Verify it’s you'),
      h('h1', { class: 'a-b-title' }, 'Enter your ', h('span', { class: 'a-b-nowrap' }, '6-digit code')),
      h('p', { class: 'a-b-lead' }, 'We sent a 6-digit code to the mobile ending ', h('strong', { class: 'a-num' }, b.maskedMobile), '.')), 60),
    rise(h('div', { class: 'a-b-cells', attrs: { role: 'group', 'aria-label': `One-time code, ${N} digits` } }, cells), 180),
    rise(statusRow, 260),
    pad,
    rise(h('p', { class: 'a-b-privacy' },
      h('span', { class: 'a-b-privacy-ic' }, icon('shield', { size: 16 })),
      h('span', {}, 'For your privacy, no account details are shown until you confirm it’s you.')), 720),
    h('p', { class: 'a-b-sr', attrs: { id: resendHint } }, 'You can send a new code when this one expires.'));
  root.append(scroll, live);
  paint();
  enter(ctx, root);
  return root;
}

// =============================================================================================
// 2 · Amount due (B3)

function renderDue(ctx) {
  const { h, icon, fmt, data } = ctx;
  const b = data.borrower;
  const root = canvas(ctx, 'a-b-due', { seed: 5, opacity: 0.66 });

  const schedule = sheet(ctx, root, { title: 'Payment schedule', sub: planLine(ctx), body: scheduleList(ctx) });
  const help = sheet(ctx, root, {
    title: 'Questions? We’re here to help.',
    body: h('div', { class: 'a-b-helprows' },
      h('button', { type: 'button', class: ['a-b-helprow', 'a-spot'], on: { click: () => help.close() } }, h('span', { class: 'a-b-helprow-ic' }, icon('phone', { size: 18 })), h('span', {}, 'Contact MBA Support'), icon('chevronRight', { size: 16 })),
      h('button', { type: 'button', class: ['a-b-helprow', 'a-spot'], on: { click: () => help.close() } }, h('span', { class: 'a-b-helprow-ic' }, icon('file', { size: 18 })), h('span', {}, 'Already paid at a bank? Send us your receipt'), icon('chevronRight', { size: 16 }))),
  });

  const payBtn = h('button', { type: 'button', class: ['a-btn', 'a-btn-light', 'a-b-paybtn'] },
    icon('lock', { size: 17 }), h('span', {}, `Pay ${fmt.php(b.due.amount)}`));
  const act = (ic, label, onClick) => h('button', { type: 'button', class: ['a-action', 'a-b-act'], on: { click: (e) => onClick(e.currentTarget) } },
    h('span', { class: 'a-action-ic' }, icon(ic, { size: 20 })), label);

  const stack = balanceStack(ctx, { w: 342, onPeek: () => schedule.open() });

  const scroll = h('div', { class: 'a-b-scroll' },
    h('header', { class: 'a-b-top' }, brand(ctx), avatar(ctx)),
    rise(h('div', { class: 'a-b-hello' },
      h('h1', { class: 'a-b-title' }, `Hi, ${b.first}`),
      h('p', { class: 'a-b-lead' }, `Here’s your plan for ${b.creditor}.`)), 40),
    rise(stack, 120),
    rise(h('div', { class: 'a-b-actrow' },
      payBtn,
      act('arrangements', 'Schedule', (el) => schedule.open(el)),
      act('info', 'Help', (el) => help.open(el))), 300),
    rise(h('section', { class: 'a-b-sec' },
      h('header', { class: 'a-b-sec-head' }, h('h2', { class: 'a-label' }, 'Recent payments'), h('span', { class: 'a-b-sec-meta' }, `${b.paidCount} of ${b.count} paid`)),
      recentList(ctx, 'a-glass')), 420),
    rise(payeeBlock(ctx), 520));
  root.append(scroll, h('div', { class: 'a-b-fade', attrs: { 'aria-hidden': 'true' } }));
  // sheets were appended first; keep them above the scroller
  root.querySelectorAll('.a-b-sheetwrap').forEach((s) => root.appendChild(s));
  enter(ctx, root);
  return root;
}

// =============================================================================================
// 3 · Choose how to pay (B4), in the "swap confirmation" spirit

function renderPay(ctx) {
  const { h, icon } = ctx;
  const t = timers(ctx);
  const root = canvas(ctx, 'a-b-pay', { seed: 9, opacity: 0.6 });
  const picker = methodPicker(ctx);
  const go = handoff(ctx, root, t, picker.get);
  const cta = checkoutButton(ctx, go);

  const scroll = h('div', { class: 'a-b-scroll' },
    h('header', { class: ['a-b-top', 'is-nav'] },
      h('button', { type: 'button', class: 'a-b-round', attrs: { 'aria-label': 'Back to my arrangement' } }, icon('arrowLeft', { size: 18 })),
      h('h1', { class: 'a-b-navtitle' }, 'Choose how to pay'),
      h('span', { class: ['a-b-round', 'is-lock'], attrs: { role: 'img', 'aria-label': 'Secure' } }, icon('lock', { size: 16 }))),
    rise(payingCard(ctx), 60),
    rise(connector(ctx), 200),
    rise(picker.el, 240),
    rise(providerNote(ctx), 380),
    rise(detailsList(ctx), 460));
  const dock = h('div', { class: 'a-b-dock' }, cta, testMode(ctx));
  root.append(scroll, dock);
  root.querySelectorAll(':scope > .a-b-hand, :scope > .a-b-sr').forEach((el) => root.appendChild(el)); // overlay above the dock
  enter(ctx, root);
  return root;
}

// =============================================================================================
// 4 · Payment confirmation (B8): the confirmation prints out of a glass slot

function receiptPaper(ctx) {
  const { h, icon, fmt, data } = ctx;
  const b = data.borrower;
  const c = b.confirmation;
  const m = methodByName(ctx, c.method);
  const row = (k, v) => h('div', { class: 'a-b-rc-row' }, h('dt', {}, k), h('dd', {}, v));
  // 'Nov 26, 2026, 10:00 AM' → date on one line, time (PHT, as on the real B8) on the next
  const when = /^(.*\d{4}),\s*(.+)$/.exec(fmt.dateTime(c.paidAt));
  const whenEl = when
    ? h('span', { class: 'a-num' }, h('span', { class: 'a-b-block' }, `${when[1]},`), h('span', { class: 'a-b-block' }, `${when[2]} PHT`))
    : h('span', { class: 'a-num' }, `${fmt.dateTime(c.paidAt)} PHT`);
  return h('div', { class: 'a-b-rc-paper' },
    h('div', { class: 'a-b-rc-head' },
      h('span', { class: 'a-b-rc-brand' }, h('img', { src: LOGO_INK, alt: '' }), h('span', {}, 'MBA Consult')),
      h('span', { class: 'a-b-rc-ok' }, icon('check', { size: 12 }), 'Verified')),
    h('div', { class: 'a-b-rc-amtrow' },
      h('div', {},
        h('p', { class: 'a-b-rc-k' }, 'Amount paid'),
        h('div', { class: 'a-b-rc-amt' }, staticMoney(ctx, c.amount))),
      h('p', { class: 'a-b-rc-by' }, plate(ctx, m, 'is-paper'), h('span', {}, 'Paid by ', h('strong', {}, c.method)))),
    h('dl', { class: 'a-b-rc-rows' },
      row('Reference', h('span', { class: 'a-num' }, c.txn)),
      row('Date and time', whenEl)),
    h('div', { class: 'a-b-rc-prog' },
      h('p', { class: 'a-b-rc-inst' }, icon('check', { size: 14 }), `Installment ${c.seq} of ${b.count} paid`),
      segBar(ctx, { count: b.count, paid: c.paidCountAfter }),
      h('p', { class: 'a-b-rc-of' }, h('span', { class: 'a-num' }, fmt.php(c.paidAfter)), ' of ', h('span', { class: 'a-num' }, fmt.php(b.total)), ' paid')),
    c.nextDue ? h('div', { class: 'a-b-rc-next' },
      h('span', {}, 'Next due'),
      h('strong', {}, h('span', { class: 'a-num' }, fmt.php(c.nextDue.amount)), ` on ${fmt.date(c.nextDue.dueDate)}`)) : null,
    h('p', { class: 'a-b-rc-fine' }, c.note));
}

function renderConfirm(ctx) {
  const { h, icon, fx, data } = ctx;
  const b = data.borrower;
  const c = b.confirmation;
  const t = timers(ctx);
  const root = canvas(ctx, 'a-b-confirm', { seed: 11, opacity: 0.62 });

  const paperWrap = h('div', { class: 'a-b-rc-wrap' }, receiptPaper(ctx));
  const win = h('div', { class: 'a-b-rc-win', attrs: { role: 'group', 'aria-label': c.title } }, paperWrap);
  const slot = h('div', { class: 'a-b-slot', attrs: { 'aria-hidden': 'true' } },
    h('span', { class: 'a-b-slot-slit' }), h('span', { class: 'a-b-slot-light' }), h('span', { class: 'a-b-slot-led' }));
  const printer = h('div', { class: ['a-b-printer', 'is-pre'] });
  const print = () => {
    printer.classList.remove('is-pre', 'is-printing');
    void printer.offsetWidth; // restart the print
    printer.classList.add('is-printing');
  };
  const reprint = h('button', { type: 'button', class: 'a-b-round', attrs: { 'aria-label': 'Print the confirmation again', title: 'Print again' }, on: { click: print } }, icon('refresh', { size: 16 }));
  printer.append(slot, win);
  win.addEventListener('click', print);
  if (fx.reduced()) printer.classList.remove('is-pre');
  else ctx.onCleanup(fx.inView(root, print, { threshold: 0.2 }));

  const saveLabel = h('span', {}, 'Save confirmation');
  const saveIc = h('span', { class: 'a-b-save-ic' }, icon('download', { size: 18 }));
  const save = h('button', {
    type: 'button', class: ['a-btn', 'a-btn-light', 'a-b-save'],
    on: {
      click: () => {
        save.classList.add('is-done');
        saveIc.replaceChildren(icon('check', { size: 18 }));
        saveLabel.textContent = 'Saved';
        t.after(1800, () => { save.classList.remove('is-done'); saveIc.replaceChildren(icon('download', { size: 18 })); saveLabel.textContent = 'Save confirmation'; });
      },
    },
  }, saveIc, saveLabel);

  const scroll = h('div', { class: 'a-b-scroll' },
    h('header', { class: 'a-b-top' }, brand(ctx), pill(ctx, 'Payment verified', { tone: 'ok', ic: 'check' })),
    rise(h('div', { class: 'a-b-cf-head' },
      h('h1', { class: 'a-b-title' }, c.title),
      h('p', { class: 'a-b-lead' }, `Thank you, ${b.first}. Your payment has been received and verified.`)), 40),
    printer,
    rise(h('div', { class: 'a-b-sentrow' },
      h('p', { class: 'a-b-sent' }, h('span', { class: 'a-b-sent-ic' }, icon('check', { size: 14 })), h('span', {}, 'A confirmation was sent to ', h('strong', { class: 'a-num' }, b.maskedMobile))),
      reprint), 500),
    rise(h('div', { class: 'a-b-cf-actions' },
      save,
      h('button', { type: 'button', class: ['a-btn', 'a-btn-glass', 'a-b-backbtn'] }, 'Back to my arrangement')), 600));
  root.append(scroll);
  enter(ctx, root);
  return root;
}

// =============================================================================================
// 5 · Desktop 1440×900: the arrangement on the left, paying on the right

function progressRing(ctx) {
  const { h, fx, data } = ctx;
  const { svg } = fx;
  const b = data.borrower;
  const gid = nid('ring');
  const C = 2 * Math.PI * 54;
  const seg = C / b.count;
  const gap = 15; // round caps eat 9px of it, leaving a clean gap between segments
  const arcs = Array.from({ length: b.count }, (_, i) => {
    const cls = i < b.paidCount ? 'is-paid' : i + 1 === b.due.seq ? 'is-now' : '';
    const a = svg('circle', {
      cx: 64, cy: 64, r: 54, class: `a-b-ring-seg ${cls}`.trim(),
      stroke: i < b.paidCount ? `url(#${gid})` : null,
      'stroke-dasharray': `${(seg - gap).toFixed(2)} ${(C - seg + gap).toFixed(2)}`,
      'stroke-dashoffset': (-(i * seg) - gap / 2).toFixed(2),
      transform: 'rotate(-90 64 64)',
    });
    a.style.setProperty('--i', String(i));
    return a;
  });
  return h('div', { class: 'a-b-ring' },
    svg('svg', { viewBox: '0 0 128 128', width: 128, height: 128, role: 'img', 'aria-label': `${b.paidCount} of ${b.count} installments paid` },
      svg('defs', {}, svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 1, y2: 1 },
        svg('stop', { offset: '0%', 'stop-color': '#6B2FD0' }), svg('stop', { offset: '100%', 'stop-color': '#64C8FF' }))),
      arcs),
    h('span', { class: 'a-b-ring-c', attrs: { 'aria-hidden': 'true' } },
      h('strong', { class: 'a-num' }, String(b.paidCount)), h('span', {}, `of ${b.count} paid`)));
}

function renderDesk(ctx) {
  const { h, icon, fx, fmt, data } = ctx;
  const b = data.borrower;
  const t = timers(ctx);
  const root = canvas(ctx, 'a-b-desk', { seed: 7, opacity: 0.56 });
  const picker = methodPicker(ctx);
  const go = handoff(ctx, root, t, picker.get);

  const stat = (k, v, cls = '') => h('div', { class: ['a-b-dstat', cls] }, h('dt', {}, k), h('dd', { class: 'a-num' }, v));
  const stats = h('section', { class: ['a-b-dstats', 'a-glass', 'a-spot'], attrs: { 'aria-label': 'Your progress' } },
    h('p', { class: 'a-label' }, 'Your progress'),
    h('div', { class: 'a-b-dstats-in' },
      progressRing(ctx),
      h('dl', { class: 'a-b-dstat-list' },
        stat('Paid so far', fx.money(b.paid, { className: 'a-money', delay: 300 }), 'is-big'),
        stat('Remaining', fmt.php(b.remaining)),
        stat('Total', fmt.php(b.total)))),
    h('p', { class: 'a-b-dstats-foot' }, icon('shield', { size: 15 }), h('span', {}, 'Paying to ', h('strong', {}, b.payee))));
  fx.spotlight(stats);

  const tiles = h('ol', { class: 'a-b-dsched' }, b.schedule.map((i, n) => {
    const s = instStatus(i, b.due.seq);
    const now = i.seq === b.due.seq;
    return rise(h('li', { class: ['a-b-dtile', 'a-glass', { 'is-now': now, 'a-edge': now, 'is-paid': i.status === 'paid' }] },
      h('span', { class: 'a-b-dtile-k' }, `${i.seq} of ${b.count}`),
      h('strong', { class: 'a-b-dtile-date' }, fmt.date(i.dueDate)),
      h('span', { class: 'a-b-dtile-amt a-num' }, fmt.php(i.amount)),
      h('span', { class: ['a-b-dtile-st', s.tone && `is-${s.tone}`] }, h('span', { class: 'a-dot', attrs: { 'aria-hidden': 'true' } }), s.label)), 420 + n * 50);
  }));

  const left = h('div', { class: 'a-b-dleft' },
    rise(h('div', { class: 'a-b-dhead' },
      h('p', { class: ['a-label', 'a-b-eyebrow'] }, 'Your payment arrangement'),
      h('h1', { class: 'a-b-dtitle' }, `Hi, ${b.first}`),
      h('p', { class: 'a-b-lead' }, `Here’s your plan for ${b.creditor} and what’s due now.`)), 40),
    h('div', { class: 'a-b-dhero' },
      rise(balanceStack(ctx, { w: 452, size: 'desk' }), 120),
      rise(stats, 240)),
    h('section', { class: 'a-b-dsec' },
      h('header', { class: 'a-b-sec-head' },
        h('h2', { class: 'a-label' }, 'Payment schedule'),
        h('span', { class: 'a-b-sec-meta' }, planLine(ctx), ' · Arrangement ', h('span', { class: 'a-num' }, b.arrangementRef))),
      tiles),
    rise(h('section', { class: ['a-b-dsec', 'is-recent'] },
      h('header', { class: 'a-b-sec-head' },
        h('h2', { class: 'a-label' }, 'Recent payments'),
        h('span', { class: 'a-b-sec-meta' }, 'Reference ', h('span', { class: 'a-num' }, b.ref))),
      recentList(ctx, 'is-row')), 700));

  const panel = rise(h('section', { class: ['a-b-dpanel', 'a-glass'], attrs: { 'aria-label': 'Choose how to pay' } },
    h('header', { class: 'a-b-dpanel-head' },
      h('h2', { class: 'a-b-dpanel-title' }, 'Choose how to pay'),
      pill(ctx, 'Secure checkout', { ic: 'lock', tone: 'info' })),
    payingCard(ctx),
    connector(ctx),
    picker.el,
    providerNote(ctx),
    h('div', { class: 'a-b-dpanel-foot' }, checkoutButton(ctx, go), testMode(ctx))), 160);

  root.append(
    h('header', { class: 'a-b-dtop' },
      brand(ctx),
      h('div', { class: 'a-b-dtop-r' },
        pill(ctx, 'Secure · verified', { tone: 'ok', ic: 'shield' }),
        h('span', { class: 'a-b-duser' }, avatar(ctx), h('span', {}, b.name)))),
    h('div', { class: 'a-b-dmain' }, left, panel));
  root.querySelectorAll(':scope > .a-b-hand, :scope > .a-b-sr').forEach((el) => root.appendChild(el)); // overlay on top
  enter(ctx, root);
  return root;
}

// =============================================================================================

export const borrowerPhone = [
  { id: 'code', title: 'Code entry', caption: 'Tap the glass keypad: keys press in, digits glow into place, six digits verify.', render: renderCode },
  { id: 'due', title: 'Amount due', caption: 'The amount counts up, the next installments peek out. Try Schedule.', render: renderDue },
  { id: 'pay', title: 'Choose how to pay', caption: 'Pick a method and the glowing edge glides to it. Continue shows the hand-off.', render: renderPay },
  { id: 'confirm', title: 'Payment confirmation', caption: 'The confirmation prints from a glass slot. Tap the paper to print it again.', render: renderConfirm },
];

export const borrowerDesktop = [
  { id: 'desk', title: 'Amount due and paying, desktop', caption: 'Arrangement and paying side by side. Pick a method, then continue.', render: renderDesk },
];
