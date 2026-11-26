// Option B · Daylight: borrower concept screens (2026-11-26).
//   Phone 390×844: code (B2), due (B3), pay (B4), confirm (B8).   Desktop 1440×900: desk.
// Direction: a soft light canvas, oversized 800-weight type, chunky rounded shapes, and ONE vivid
// MBA-gradient block per screen that carries the key number, with a slow, hand-placed aurora inside
// it and a pull-tab under it. Dark ink keys, tiles and pills press with a spring.
// Rules kept: every figure comes from ctx.data and every amount goes through fmt.php / fx.money; the
// checkout is "our payment provider" (no provider brand); statuses are text plus colour; timers and
// observers are released through ctx.onCleanup. Styles live in b/borrower.css (.b-b-* classes).
import logoSvg from '../../assets/mba_logo.svg';
import logoWhiteSvg from '../../assets/mba_logo_white.svg';

const svgUrl = (text) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`;
const LOGO = svgUrl(logoSvg);
const LOGO_WHITE = svgUrl(logoWhiteSvg);

let uid = 0;
/** Unique ids: the same screen can be on the page twice (overview + full-screen viewer). */
const nid = (p) => `b-b-${p}-${++uid}`;

// =============================================================================================
// Small shared pieces

/** Timeouts and intervals that are all cleared when the screen is removed. */
function clock(ctx) {
  const live = new Set();
  ctx.onCleanup(() => { for (const t of live) { clearTimeout(t); clearInterval(t); } live.clear(); });
  return {
    after(fn, ms) { const t = setTimeout(() => { live.delete(t); fn(); }, ms); live.add(t); return t; },
    every(fn, ms) { const t = setInterval(fn, ms); live.add(t); return t; },
    stop(t) { clearTimeout(t); clearInterval(t); live.delete(t); },
  };
}

// Count-ups started by a screen's entrance (see money()).
const COUNTERS = new WeakMap();

/**
 * Choreographed entrance. Screens are drawn in their FINAL state by default, so a print, a PDF or a
 * full-page capture never shows hidden tiles or ₱0.00. The entrance (.is-in: rises, fills, count-ups)
 * plays when the screen is on screen at first paint, or just before it scrolls into view.
 * Under "reduce motion" nothing plays.
 */
function entrance(ctx, root) {
  if (ctx.fx.reduced()) return;
  let io = null;
  const go = () => {
    if (root.classList.contains('is-in')) return;
    io?.disconnect();
    root.classList.add('is-in');
    root.querySelectorAll('.mc').forEach((m) => COUNTERS.get(m)?.());
  };
  // render() runs before the screen is attached; the first frame callback runs before first paint
  requestAnimationFrame(() => {
    const r = root.getBoundingClientRect();
    if (r.width && r.bottom > 0 && r.top < window.innerHeight) { go(); return; }
    if (typeof IntersectionObserver !== 'function') return;
    io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) go(); }, { rootMargin: '0px 0px 120px 0px' });
    io.observe(root);
  });
  ctx.onCleanup(() => io?.disconnect());
}
/** Tags elements for the staggered rise (CSS: .b-b-in, gated by .is-in on the root). */
function enter(els, { step = 70, base = 0 } = {}) {
  els.filter(Boolean).forEach((el, i) => {
    el.classList.add('b-b-in');
    el.style.setProperty('--b-b-ei', String(i));
    el.style.setProperty('--b-b-es', `${step}ms`);
    el.style.setProperty('--b-b-eb', `${base}ms`);
  });
}

const mark = (ctx, { white = false, size = 36, alt = '', cls = '' } = {}) =>
  ctx.h('img', { class: ['b-b-mark', cls], src: white ? LOGO_WHITE : LOGO, alt, width: size, height: size, draggable: false });

/**
 * A peso amount split for big-number styling, in the same markup as fx.money (.mc / .mc-sign /
 * .mc-whole / .mc-cents). Unlike fx.money it is painted at its final value and only counts up when its
 * screen's entrance plays (entrance() starts it), so nothing ever freezes at ₱0.00. Every frame is
 * formatted by fmt.phpParts. Screen readers get the full amount once.
 */
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
function money(ctx, centavos, { cls = '', delay = 0, duration = 1200, count = true } = {}) {
  const { h, fmt } = ctx;
  const sign = h('span', { class: 'mc-sign' });
  const whole = h('span', { class: 'mc-whole' });
  const cents = h('span', { class: 'mc-cents' });
  const el = h('span', { class: ['mc', 'b-money', cls] },
    h('span', { class: 'b-b-mc', attrs: { 'aria-hidden': 'true' } }, sign, whole, cents),
    h('span', { class: 'b-b-sr' }, fmt.php(centavos)));
  const paint = (c) => {
    const p = fmt.phpParts(Math.round(c));
    sign.textContent = p.sign;
    whole.textContent = p.whole;
    cents.textContent = p.cents;
  };
  paint(centavos);
  if (count) {
    let raf = 0;
    ctx.onCleanup(() => cancelAnimationFrame(raf));
    COUNTERS.set(el, () => {
      if (ctx.fx.reduced()) return;
      cancelAnimationFrame(raf);
      paint(0);
      const start = performance.now() + delay;
      const step = (now) => {
        const t = Math.max(0, Math.min(1, (now - start) / duration));
        paint(centavos * easeOutExpo(t));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
  }
  return el;
}

const plural = (n, one, many) => (n === 1 ? one : many);

/** Method logo(s) on a white plate. Online banking has no single brand, so it gets the bank icon. */
function plate(ctx, m, { size = 'md' } = {}) {
  const { h, icon } = ctx;
  return h('span', { class: ['b-logo-plate', 'b-b-plate', `is-${size}`], attrs: { 'aria-hidden': 'true' } },
    m && m.marks.length
      ? m.marks.map((k) => h('img', { src: k.src, alt: '', draggable: false, dataset: { mark: k.name } }))
      : icon((m && m.icon) || 'bank', { size: size === 'sm' ? 18 : 22 }));
}

const kindOf = (b, it) => (it.status === 'paid' ? 'paid' : it.seq === b.due.seq ? 'now' : it.status === 'overdue' ? 'overdue' : 'upcoming');

/** Status as text plus colour (never colour alone). */
function statusChip(ctx, kind) {
  const { h, icon } = ctx;
  if (kind === 'paid') return h('span', { class: 'b-chip is-ok b-b-chip' }, icon('check', { size: 13 }), 'Paid');
  if (kind === 'now') return h('span', { class: 'b-chip is-brand b-b-chip' }, h('i', { class: 'b-b-dot', attrs: { 'aria-hidden': 'true' } }), 'Due now');
  if (kind === 'overdue') return h('span', { class: 'b-chip is-danger b-b-chip' }, icon('alert', { size: 13 }), 'Overdue');
  return h('span', { class: 'b-chip b-b-chip' }, 'Upcoming');
}

/** Segmented progress: one pill per installment, filled ones sweep in one after another. */
function segs(ctx, { count, done, now = null, label, base = 0, numbered = false }) {
  const { h } = ctx;
  return h('div', { class: ['b-segs', 'b-b-segs', { 'is-numbered': numbered }], attrs: { role: 'img', 'aria-label': label } },
    Array.from({ length: count }, (_, i) => {
      const n = i + 1;
      const st = n <= done ? 'is-d' : n === now ? 'is-n' : 'is-u';
      return h('span', { class: ['b-b-segw', st], style: { '--b-b-si': String(i), '--b-b-sb': `${base}ms` } },
        h('span', { class: ['b-seg', 'b-b-seg'] }),
        numbered ? h('span', { class: 'b-b-seg-n b-num', attrs: { 'aria-hidden': 'true' } }, String(n)) : null);
    }));
}

/** The six installments with their status. */
function scheduleList(ctx, { compact = false } = {}) {
  const { h, fmt, data } = ctx;
  const b = data.borrower;
  return h('ol', { class: ['b-b-sched', { 'is-compact': compact }] }, b.schedule.map((it, i) => {
    const k = kindOf(b, it);
    return h('li', { class: ['b-b-srow', `is-${k}`], style: { '--b-b-ri': String(i) } },
      h('span', { class: 'b-b-srow-n b-num' }, h('span', { class: 'b-b-sr' }, 'Installment '), String(it.seq)),
      h('span', { class: 'b-b-srow-date' }, fmt.date(it.dueDate)),
      h('span', { class: 'b-b-srow-amt b-num' }, fmt.php(it.amount)),
      statusChip(ctx, k));
  }));
}

/** Recent verified payments: method logo on a white plate, installment, date, amount. */
function historyList(ctx) {
  const { h, icon, fmt, data } = ctx;
  return h('ul', { class: 'b-b-hist' }, data.borrower.history.map((p) => {
    const m = data.methods.find((x) => x.name === p.method);
    return h('li', { class: 'b-b-hrow' },
      plate(ctx, m, { size: 'sm' }),
      h('div', { class: 'b-b-hrow-main' },
        h('strong', {}, p.seq ? `Installment ${p.seq}` : 'Payment'),
        h('span', { class: 'b-b-muted' }, `${fmt.date(p.paidAt)} · ${p.method}`)),
      h('div', { class: 'b-b-hrow-amt' },
        h('strong', { class: 'b-num' }, fmt.php(p.amount)),
        h('span', { class: 'b-b-paid' }, icon('check', { size: 12 }), 'Paid')));
  }));
}

/** Backspace glyph (the shared icon set has none). */
function backspaceIcon(ctx) {
  const { svg } = ctx.fx;
  return svg('svg', { viewBox: '0 0 24 24', width: 26, height: 26, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.9, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: 'M21 5H9.5L3 12l6.5 7H21z' }),
    svg('path', { d: 'M16.5 9.5l-5 5M11.5 9.5l5 5' }));
}

/** A check whose stroke can be drawn in (pathLength 1). */
function drawnCheck(ctx, cls) {
  const { svg } = ctx.fx;
  return svg('svg', { viewBox: '0 0 48 48', class: cls, 'aria-hidden': 'true', focusable: 'false' },
    svg('path', { d: 'M13 25.5l7.5 7.5L35.5 17', pathLength: 1 }));
}

/** Scrolls only this screen's own scroller (scrollIntoView would also move the options page). */
function scrollToEl(ctx, scroll, el, pad = 76) {
  const s = scroll.getBoundingClientRect();
  const k = scroll.offsetHeight ? s.height / scroll.offsetHeight : 1;
  const y = (el.getBoundingClientRect().top - s.top) / k + scroll.scrollTop - pad;
  scroll.scrollTo({ top: Math.max(0, y), behavior: ctx.fx.reduced() ? 'auto' : 'smooth' });
}

function flash(el) {
  el.classList.remove('is-flash');
  void el.offsetWidth; // restart the animation
  el.classList.add('is-flash');
}

/** A small ink toast at the bottom of a screen (announced politely). */
function toaster(ctx, host, t) {
  const { h, icon } = ctx;
  const el = h('div', { class: 'b-b-toast', attrs: { role: 'status' } });
  host.appendChild(el);
  let hide = null;
  return (text, ic = 'info') => {
    el.replaceChildren(icon(ic, { size: 16 }), h('span', {}, text));
    el.classList.add('is-on');
    if (hide) t.stop(hide);
    hide = t.after(() => el.classList.remove('is-on'), 2400);
  };
}

// =============================================================================================
// The vivid block: hand-placed aurora + a pull-tab whose colour follows the block's bottom edge

const GLOW = ['#64C8FF', '#8B5CF6', '#2457E6'];
// Blob placements (percent of the aurora layer, which overhangs the block by 10% on each side).
// The light-blue field always sits in a corner with no white text over it (white on #64C8FF fails
// contrast); violet and blue drift behind the large figures, where white keeps its contrast.
const SPOTS = {
  code: [
    { x: '74%', y: '-46%', s: '40%', dx: '-8%', dy: '10%', d: '12s' },
    { x: '-16%', y: '-12%', s: '46%', dx: '22%', dy: '12%', d: '13s' },
    { x: '30%', y: '64%', s: '40%', dx: '20%', dy: '-14%', d: '15s' },
  ],
  due: [
    { x: '71%', y: '-30%', s: '45%', dx: '-8%', dy: '9%', d: '12s' },
    { x: '-12%', y: '8%', s: '52%', dx: '20%', dy: '-12%', d: '13s' },
    { x: '-8%', y: '66%', s: '42%', dx: '22%', dy: '-14%', d: '15s' },
  ],
  pay: [
    { x: '76%', y: '-42%', s: '38%', dx: '-8%', dy: '9%', d: '11s' },
    { x: '-14%', y: '-10%', s: '46%', dx: '22%', dy: '12%', d: '13s' },
    { x: '30%', y: '70%', s: '36%', dx: '-20%', dy: '-12%', d: '15s' },
  ],
  confirm: [
    { x: '-26%', y: '72%', s: '44%', dx: '8%', dy: '-8%', d: '12s' },
    { x: '58%', y: '-20%', s: '50%', dx: '-18%', dy: '14%', d: '13s' },
    { x: '-18%', y: '-14%', s: '44%', dx: '20%', dy: '12%', d: '15s' },
  ],
  desk: [
    { x: '74%', y: '-46%', s: '34%', dx: '-8%', dy: '9%', d: '12s' },
    { x: '-8%', y: '-14%', s: '40%', dx: '18%', dy: '14%', d: '14s' },
    { x: '30%', y: '58%', s: '34%', dx: '22%', dy: '-12%', d: '16s' },
  ],
};

function glow(ctx, host, spots, { opacity = 0.55, blur = 64 } = {}) {
  const layer = ctx.fx.aurora(host, { colors: GLOW, opacity, blur });
  [...layer.children].forEach((blob, i) => {
    const s = spots[i];
    if (s) for (const [k, v] of Object.entries(s)) blob.style.setProperty(`--${k}`, v);
  });
  return layer;
}

// --b-hero is linear-gradient(140deg, #3A0080 0%, #5B1FD0 48%, #2457E6 100%). The tab hangs under
// the block, so its colour is the block's bottom edge at the same x (computed, not guessed).
const HERO_STOPS = [[0, [58, 0, 128]], [0.48, [91, 31, 208]], [1, [36, 87, 230]]];
function heroColorAt(w, hh, x, y) {
  const a = (140 * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const len = Math.abs(w * dx) + Math.abs(hh * dy);
  const t = Math.min(1, Math.max(0, ((x - w / 2) * dx + (y - hh / 2) * dy) / len + 0.5));
  for (let i = 1; i < HERO_STOPS.length; i++) {
    const [p0, c0] = HERO_STOPS[i - 1];
    const [p1, c1] = HERO_STOPS[i];
    if (t <= p1) {
      const f = (t - p0) / (p1 - p0);
      return `rgb(${c0.map((v, k) => Math.round(v + (c1[k] - v) * f)).join(' ')})`;
    }
  }
  return 'rgb(36 87 230)';
}
function matchTab(ctx, hero, tab) {
  const paint = () => {
    const W = hero.offsetWidth;
    const H = hero.offsetHeight;
    const tw = tab.offsetWidth;
    if (!W || !H || !tw) return;
    const l = (W - tw) / 2;
    const r = l + tw;
    const at = (x) => heroColorAt(W, H, x, H - 1);
    hero.style.setProperty('--b-b-h', `${H}px`); // sizes the calm bottom strip (CSS) to the block
    tab.style.setProperty('--b-b-tl', at(l));
    tab.style.setProperty('--b-b-tr', at(r));
    tab.style.setProperty('--b-b-fl', at(l - 9));
    tab.style.setProperty('--b-b-fr', at(r + 9));
  };
  requestAnimationFrame(paint);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(paint);
    ro.observe(hero);
    ro.observe(tab);
    ctx.onCleanup(() => ro.disconnect());
  }
}

/** Hero + pull-tab + the panel the tab reveals. */
function pullTab(ctx, hero, { label, openLabel, panel }) {
  const { h, icon } = ctx;
  const pid = nid('more');
  const text = h('span', {}, label);
  const tab = h('button', { type: 'button', class: 'b-tab b-b-tab', attrs: { 'aria-expanded': 'false', 'aria-controls': pid } },
    text, icon('chevronDown', { size: 16, cls: 'b-b-tab-chev' }));
  const reveal = h('div', { class: 'b-b-reveal', id: pid, attrs: { inert: '' } }, h('div', { class: 'b-b-reveal-in' }, panel));
  const wrap = h('div', { class: 'b-b-herowrap' }, hero, tab, reveal);
  const set = (open) => {
    wrap.classList.toggle('is-open', open);
    tab.setAttribute('aria-expanded', String(open));
    text.textContent = open ? openLabel : label;
    if (open) reveal.removeAttribute('inert');
    else reveal.setAttribute('inert', '');
  };
  tab.addEventListener('click', () => set(!wrap.classList.contains('is-open')));
  matchTab(ctx, hero, tab);
  return { wrap, tab, set, isOpen: () => wrap.classList.contains('is-open') };
}

// =============================================================================================
// Paying: method tiles, provider note, the ink checkout button with its hand-off state

function methodPicker(ctx, { onPick } = {}) {
  const { h, icon, data } = ctx;
  const name = nid('method');
  const lid = nid('paywith');
  let current = data.methods[0].name;
  const tiles = data.methods.map((m) => {
    const id = nid('m');
    const input = h('input', { type: 'radio', class: 'b-b-radio', name, id, value: m.name, checked: m.name === current });
    const tile = h('label', { class: ['b-b-method', { 'is-on': m.name === current }], htmlFor: id, dataset: { method: m.name } },
      input,
      plate(ctx, m),
      h('span', { class: 'b-b-method-name' }, m.name, m.name === 'Card' ? h('span', { class: 'b-b-sr' }, ' (Visa or Mastercard)') : null),
      h('span', { class: 'b-b-method-tick', attrs: { 'aria-hidden': 'true' } }, icon('check', { size: 14 })));
    input.addEventListener('change', () => {
      if (!input.checked) return;
      current = m.name;
      for (const t of tiles) t.classList.toggle('is-on', t === tile);
      tile.classList.remove('is-pop');
      void tile.offsetWidth;
      tile.classList.add('is-pop');
      onPick?.(m.name);
    });
    return tile;
  });
  const el = h('div', { class: 'b-b-methods', attrs: { role: 'radiogroup', 'aria-labelledby': lid } },
    h('p', { class: 'b-eyebrow b-b-legend', id: lid }, 'Pay with'),
    h('div', { class: 'b-b-methods-grid' }, tiles));
  return { el, tiles, get: () => current };
}

const providerNote = (ctx, { compact = false } = {}) => ctx.h('div', { class: ['b-b-note', { 'is-compact': compact }] },
  ctx.h('span', { class: 'b-b-note-ic', attrs: { 'aria-hidden': 'true' } }, ctx.icon('lock', { size: 18 })),
  ctx.h('p', {},
    ctx.h('strong', {}, 'You’ll finish paying on our payment provider’s secure page.'),
    ' Your card, wallet or bank details are entered with them and never reach MBA.'));

const testLine = (ctx) => ctx.h('p', { class: 'b-b-test' },
  ctx.h('i', { class: 'b-b-test-dot', attrs: { 'aria-hidden': 'true' } }), 'Test mode · no real money moves');

/** Ink "Continue to secure checkout" + the short hand-off state it plays when pressed. */
function checkout(ctx, t, { live } = {}) {
  const { h, icon, fmt, data } = ctx;
  const amount = data.borrower.due.amount;
  const methodEl = h('span', {}, data.methods[0].name);
  const hand = h('div', { class: 'b-b-handoff', attrs: { 'aria-hidden': 'true' } },
    h('div', { class: 'b-b-handoff-path' },
      h('span', { class: 'b-b-handoff-node' }, mark(ctx, { size: 30 })),
      h('span', { class: 'b-b-handoff-dots' }, h('i'), h('i'), h('i'), h('i'), h('i')),
      h('span', { class: 'b-b-handoff-node is-lock' }, icon('lock', { size: 18 }))),
    h('p', { class: 'b-b-handoff-t' }, 'Taking you to our payment provider’s secure page'),
    h('p', { class: 'b-b-handoff-s b-num' }, fmt.php(amount), ' · ', methodEl, ' · test mode'));
  const btn = h('button', { type: 'button', class: 'b-btn b-btn-ink b-b-cta' },
    h('span', { class: 'b-b-cta-idle' },
      icon('lock', { size: 18 }),
      h('span', { class: 'b-b-cta-t' }, h('span', {}, 'Continue to secure checkout'), h('span', { class: 'b-b-cta-amt b-num' }, ` · ${fmt.php(amount)}`))),
    h('span', { class: 'b-b-cta-wait', attrs: { 'aria-hidden': 'true' } }, h('i', { class: 'b-b-spin' }), 'Opening secure checkout…'));
  const host = h('div', { class: 'b-b-checkout' }, hand, btn);
  let busy = false;
  btn.addEventListener('click', () => {
    if (busy) return;
    busy = true;
    host.classList.add('is-handoff');
    btn.setAttribute('aria-busy', 'true');
    if (live) live.textContent = `Opening our payment provider’s secure page to pay ${fmt.php(amount)} by ${methodEl.textContent}. Test mode, no real money moves.`;
    t.after(() => {
      host.classList.remove('is-handoff');
      btn.removeAttribute('aria-busy');
      busy = false;
    }, 2300);
  });
  return { host, btn, setMethod: (m) => { methodEl.textContent = m; } };
}

// =============================================================================================
// Phone shell: a non-scrolling root (overlays sit on it) around a scroller with a hidden bar

function phone(ctx, id) {
  const { h } = ctx;
  const scroll = h('div', { class: 'b-b-scroll' });
  const root = h('div', { class: ['b-b-root', 'b-b-phone', `b-b-${id}`] }, scroll);
  scroll.addEventListener('scroll', () => root.classList.toggle('is-scrolled', scroll.scrollTop > 6), { passive: true });
  entrance(ctx, root);
  return { root, scroll };
}

const toSec = (s) => { const [m, ss] = String(s).split(':').map(Number); return (m || 0) * 60 + (ss || 0); };
const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

// =============================================================================================
// 1 · code: verify it's you (B2). No amounts or balance before the code is confirmed.

function renderCode(ctx) {
  const { h, icon, fx, data } = ctx;
  const b = data.borrower;
  const N = b.codeLength;
  const START = toSec(b.codeExpiresIn);
  const t = clock(ctx);
  const { root, scroll } = phone(ctx, 'code');
  const live = h('p', { class: 'b-b-sr', attrs: { 'aria-live': 'polite' } });

  const top = h('header', { class: 'b-b-top' },
    h('div', { class: 'b-b-brand' }, mark(ctx, { size: 40 }), h('div', {}, h('strong', {}, 'MBA Consult'), h('span', {}, 'Secure payment portal'))),
    h('span', { class: 'b-chip b-b-step' }, icon('lock', { size: 13 }), 'Step 1 of 4'));
  const intro = h('div', { class: 'b-b-intro' },
    h('p', { class: 'b-eyebrow' }, 'Check your phone'),
    h('h1', { class: 'b-h1 b-b-title' }, `Enter your ${N}‑digit code`),
    h('p', { class: 'b-b-lead' }, 'We sent it to the mobile ending ', h('strong', { class: 'b-num' }, b.maskedMobile), '.'));

  // the vivid block holds the code itself
  const boxes = Array.from({ length: N }, () => h('span', { class: 'b-b-box' }, h('span', { class: 'b-b-box-d' })));
  const boxRow = h('div', { class: 'b-b-boxes', attrs: { role: 'group', 'aria-label': `One-time code, 0 of ${N} digits entered` } }, boxes);
  let left = START;
  const tLabel = h('span', {}, 'Code expires in ');
  const tLeft = h('strong', { class: 'b-num' }, mmss(left));
  const timer = h('span', { class: 'b-b-hchip b-b-timer' }, icon('clock', { size: 15 }), tLabel, tLeft);
  const vstamp = h('div', { class: 'b-b-vstamp', attrs: { 'aria-hidden': 'true' } },
    h('span', { class: 'b-b-vstamp-disc' }, h('span', { class: 'b-b-vstamp-ring' }), drawnCheck(ctx, 'b-b-check')),
    h('span', { class: 'b-b-vstamp-t' }, 'Verified'));
  const hero = h('section', { class: 'b-hero b-b-hero b-b-code-hero', attrs: { 'aria-label': 'Your code' } },
    h('div', { class: 'b-b-hero-row' }, h('span', { class: 'b-b-hero-label' }, 'Your code'), timer),
    boxRow,
    vstamp);
  glow(ctx, hero, SPOTS.code);

  const privacy = h('p', { class: 'b-b-privacy' }, icon('shield', { size: 18 }),
    h('span', {}, 'For your privacy, no account details are shown until you confirm it’s you.'));

  let digits = [];
  let locked = false;
  let auto = true;
  const paint = (pop = -1) => {
    boxes.forEach((bx, i) => {
      const d = digits[i];
      bx.firstChild.textContent = d ?? '';
      bx.classList.toggle('is-filled', d !== undefined);
      bx.classList.toggle('is-active', !locked && i === digits.length);
      if (i === pop) { bx.classList.remove('is-pop'); void bx.offsetWidth; bx.classList.add('is-pop'); }
    });
    boxRow.setAttribute('aria-label', `One-time code, ${digits.length} of ${N} digits entered`);
  };
  const reset = () => {
    hero.classList.remove('is-verified');
    root.classList.remove('is-locked');
    digits = [];
    locked = false;
    left = START;
    tLeft.textContent = mmss(left);
    setExpired(false);
    paint();
  };
  const verify = () => {
    locked = true;
    root.classList.add('is-locked');
    paint();
    t.after(() => {
      hero.classList.add('is-verified');
      live.textContent = 'Code verified.';
      t.after(reset, 1400);
    }, 240);
  };
  const press = (k, fromUser = true) => {
    if (locked) return;
    if (fromUser) auto = false;
    if (k === 'del') { if (digits.length) { digits.pop(); paint(); } return; }
    if (digits.length >= N || hero.classList.contains('is-expired')) return;
    digits.push(k);
    paint(digits.length - 1);
    if (digits.length === N) verify();
  };

  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  const pad = h('div', { class: 'b-b-pad', attrs: { role: 'group', 'aria-label': 'Number keypad' } }, KEYS.map((k) => {
    if (!k) return h('span', { class: 'b-b-key-gap', attrs: { 'aria-hidden': 'true' } });
    if (k === 'del') return h('button', { type: 'button', class: 'b-b-key is-del', attrs: { 'aria-label': 'Delete last digit' }, on: { click: () => press('del') } }, backspaceIcon(ctx));
    return h('button', { type: 'button', class: 'b-b-key b-num', on: { click: () => press(k) } }, k);
  }));
  root.addEventListener('keydown', (e) => {
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); press(e.key); } else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
  });

  // resend: like the demo, the cooldown lifts when this code expires
  const resend = h('button', { type: 'button', class: 'b-b-resend', disabled: true }, icon('refresh', { size: 16 }), 'Send a new code');
  const resendNote = h('span', { class: 'b-b-resend-note' }, 'Available when this code expires');
  const setExpired = (on) => {
    hero.classList.toggle('is-expired', on);
    resend.disabled = !on;
    tLabel.textContent = on ? 'This code has expired' : 'Code expires in ';
    tLeft.hidden = on;
    resendNote.textContent = on ? 'Ready when you are' : 'Available when this code expires';
  };
  resend.addEventListener('click', () => {
    digits = [];
    left = START;
    tLeft.textContent = mmss(left);
    setExpired(false);
    paint();
    live.textContent = 'We’ve sent you a new code.';
  });
  const resendRow = h('div', { class: 'b-b-resend-row' },
    h('span', { class: 'b-b-resend-q' }, 'Didn’t get a code?'),
    h('div', { class: 'b-b-resend-r' }, resend, resendNote));

  t.every(() => {
    if (locked || left <= 0) return;
    left -= 1;
    tLeft.textContent = mmss(left);
    if (left === 0) { setExpired(true); live.textContent = 'This code has expired. You can send a new code.'; }
  }, 1000);

  // entrance: three digits type themselves in so the springy boxes read at a glance
  const AUTO = ['4', '8', '1'];
  ctx.onCleanup(fx.inView(root, () => {
    if (fx.reduced()) { AUTO.forEach((d) => press(d, false)); return; }
    AUTO.forEach((d, i) => t.after(() => { if (auto) press(d, false); }, 900 + i * 260));
  }));

  enter([top, intro, hero, privacy, pad, resendRow], { step: 70 });
  scroll.append(top, intro, hero, privacy, pad, resendRow, live);
  paint();
  return root;
}

// =============================================================================================
// 2 · due: what's due now (B3)

function renderDue(ctx) {
  const { h, icon, fmt, data } = ctx;
  const b = data.borrower;
  const t = clock(ctx);
  const { root, scroll } = phone(ctx, 'due');
  const toast = toaster(ctx, root, t);

  const hello = h('header', { class: 'b-b-hello' },
    h('span', { class: 'b-b-avatar', attrs: { 'aria-hidden': 'true' } }, fmt.initials(b.name)),
    h('div', { class: 'b-b-hello-t' },
      h('h1', { class: 'b-b-hi' }, `Hi, ${b.first}`),
      h('p', {}, `Your plan with ${b.creditor}`)),
    h('span', { class: 'b-b-markdisc' }, mark(ctx, { size: 34, alt: 'MBA Consult' })));

  // help sheet (wording from the real portal)
  const sheetClose = () => { sheet.classList.remove('is-on'); sheet.setAttribute('inert', ''); };
  const sheet = h('div', { class: 'b-b-sheet', attrs: { inert: '' }, on: { click: (e) => { if (e.target === sheet) sheetClose(); } } },
    h('div', { class: 'b-b-sheet-card', attrs: { role: 'dialog', 'aria-label': 'Get help' } },
      h('span', { class: 'b-b-sheet-grab', attrs: { 'aria-hidden': 'true' } }),
      h('div', { class: 'b-b-sheet-head' },
        h('h2', { class: 'b-h2' }, 'Get help'),
        h('button', { type: 'button', class: 'b-b-round is-sm', attrs: { 'aria-label': 'Close help' }, on: { click: sheetClose } }, icon('x', { size: 18 }))),
      h('p', { class: 'b-b-sheet-lead' }, 'Questions about your plan? We’re here to help.'),
      h('button', { type: 'button', class: 'b-b-sheet-item', on: { click: sheetClose } },
        h('span', { class: 'b-b-sheet-ic' }, icon('phone', { size: 18 })), h('span', {}, 'Contact MBA Support'), icon('chevronRight', { size: 18 })),
      h('button', { type: 'button', class: 'b-b-sheet-item', on: { click: sheetClose } },
        h('span', { class: 'b-b-sheet-ic' }, icon('file', { size: 18 })), h('span', {}, 'Already paid at a bank? Send us your receipt'), icon('chevronRight', { size: 18 }))));
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('is-on')) sheetClose(); });

  const recentId = nid('recent');
  let tabCtl = null;
  let recent = null;
  const actions = [
    ['Pay', 'transactions', () => toast('Next: choose how to pay', 'arrowRight')],
    ['Schedule', 'arrangements', () => { tabCtl.set(true); t.after(() => scrollToEl(ctx, scroll, tabCtl.tab, 120), 80); }],
    ['Receipts', 'file', () => { scrollToEl(ctx, scroll, recent); flash(recent); }],
    ['Help', 'info', () => { sheet.classList.add('is-on'); sheet.removeAttribute('inert'); sheet.querySelector('button')?.focus({ preventScroll: true }); }],
  ].map(([label, ic, fn]) => h('button', { type: 'button', class: 'b-action b-b-act', on: { click: fn } },
    h('span', { class: 'b-action-ic' }, icon(ic, { size: 22 })), h('span', { class: 'b-b-act-l' }, label)));

  const lid = nid('due');
  const hero = h('section', { class: 'b-hero b-b-hero b-b-due-hero', attrs: { 'aria-labelledby': lid } },
    h('p', { class: 'b-b-hero-label', id: lid }, 'Amount due'),
    h('div', { class: 'b-b-amt' }, money(ctx, b.due.amount, { cls: 'b-b-amt-xl', delay: 200 })),
    h('div', { class: 'b-b-hero-meta' },
      h('span', { class: 'b-b-hchip' }, `Installment ${b.due.seq} of ${b.count}`),
      h('span', { class: 'b-b-due-on' }, icon('clock', { size: 16 }), `Due ${fmt.dayShort(b.due.dueDate)}`)),
    h('div', { class: 'b-b-acts' }, actions));
  glow(ctx, hero, SPOTS.due);

  const schedCard = h('div', { class: 'b-card b-b-sched-card' },
    h('div', { class: 'b-b-card-head' },
      h('h2', { class: 'b-h2' }, 'Payment schedule'),
      h('span', { class: 'b-b-muted b-b-small' }, `${b.count} monthly installments`)),
    scheduleList(ctx));
  tabCtl = pullTab(ctx, hero, { label: 'Your schedule', openLabel: 'Hide schedule', panel: schedCard });

  const prog = h('section', { class: 'b-card b-b-prog' },
    h('div', { class: 'b-b-card-head' },
      h('h2', { class: 'b-h2' }, 'Your progress'),
      h('span', { class: 'b-chip is-ok' }, `${b.paidCount} of ${b.count} paid`)),
    h('p', { class: 'b-b-prog-fig' },
      money(ctx, b.paid, { cls: 'b-b-prog-paid', delay: 350 }),
      h('span', { class: 'b-b-prog-of' }, `of ${fmt.php(b.total)} paid`)),
    segs(ctx, { count: b.count, done: b.paidCount, now: b.due.seq, base: 500, label: `${b.paidCount} of ${b.count} installments paid; installment ${b.due.seq} is due now` }),
    h('div', { class: 'b-b-prog-foot' },
      h('span', {}, h('strong', { class: 'b-num' }, fmt.php(b.remaining)), ' remaining'),
      h('span', {}, `Installment ${b.due.seq} is next`)));

  recent = h('section', { class: 'b-card b-b-recent', attrs: { 'aria-labelledby': recentId } },
    h('div', { class: 'b-b-card-head' },
      h('h2', { class: 'b-h2', id: recentId }, 'Recent payments'),
      h('span', { class: 'b-b-muted b-b-small' }, `${b.history.length} ${plural(b.history.length, 'payment', 'payments')}`)),
    historyList(ctx));

  const payee = h('section', { class: 'b-b-payee' },
    h('span', { class: 'b-b-payee-ic', attrs: { 'aria-hidden': 'true' } }, icon('shield', { size: 20 })),
    h('div', {},
      h('p', { class: 'b-eyebrow' }, 'Paying'),
      h('p', { class: 'b-b-payee-t' }, b.payee),
      h('p', { class: 'b-b-payee-ref b-num' }, `Arrangement ${b.arrangementRef}`)));

  enter([hello, tabCtl.wrap, prog, recent, payee], { step: 80 });
  scroll.append(hello, tabCtl.wrap, prog, recent, payee);
  root.append(sheet);
  return root;
}

// =============================================================================================
// 3 · pay: choose how to pay (B4)

function renderPay(ctx) {
  const { h, icon, fmt, data } = ctx;
  const b = data.borrower;
  const t = clock(ctx);
  const { root, scroll } = phone(ctx, 'pay');
  const live = h('p', { class: 'b-b-sr', attrs: { 'aria-live': 'polite' } });

  const nav = h('header', { class: 'b-b-nav' },
    h('button', { type: 'button', class: 'b-b-round', attrs: { 'aria-label': 'Back to my arrangement' } }, icon('arrowLeft', { size: 20 })),
    h('span', { class: 'b-b-nav-t' }, 'Payment'),
    h('span', { class: 'b-chip is-ok b-b-nav-chip' }, icon('lock', { size: 13 }), 'Secure'));
  const title = h('h1', { class: 'b-h1 b-b-title b-b-pay-title' }, 'Choose how to pay');

  const sum = h('section', { class: 'b-hero b-b-hero b-b-sum', attrs: { 'aria-label': 'What you’re paying' } },
    h('p', { class: 'b-b-hero-label' }, 'You’re paying'),
    h('div', { class: 'b-b-amt' }, money(ctx, b.due.amount, { cls: 'b-b-amt-md', delay: 150 })),
    h('div', { class: 'b-b-hero-meta' },
      h('span', { class: 'b-b-hchip' }, `Installment ${b.due.seq} of ${b.count}`),
      h('span', { class: 'b-b-sum-cred' }, b.creditor)));
  glow(ctx, sum, SPOTS.pay, { blur: 56 });
  const details = h('div', { class: 'b-card b-b-details' },
    h('dl', { class: 'b-b-dl' },
      h('div', {}, h('dt', {}, 'Paying'), h('dd', {}, b.payee)),
      h('div', {}, h('dt', {}, 'Due'), h('dd', { class: 'b-num' }, fmt.date(b.due.dueDate))),
      h('div', {}, h('dt', {}, 'Arrangement'), h('dd', { class: 'b-num' }, b.arrangementRef))));
  const tab = pullTab(ctx, sum, { label: 'Details', openLabel: 'Hide details', panel: details });

  const co = checkout(ctx, t, { live });
  const picker = methodPicker(ctx, { onPick: (m) => co.setMethod(m) });
  enter(picker.tiles, { step: 55, base: 380 });

  const bar = h('div', { class: 'b-b-bar' }, co.host);
  enter([nav, title, tab.wrap, picker.el.firstChild], { step: 70 });
  const note = providerNote(ctx);
  const test = testLine(ctx);
  enter([note, test], { step: 70, base: 760 });
  scroll.append(nav, title, tab.wrap, picker.el, note, test, live);
  root.append(bar);
  return root;
}

// =============================================================================================
// 4 · confirm: payment confirmation (B8). Never "official receipt" except in the required note.

function confirmStamp(ctx) {
  const { svg } = ctx.fx;
  const pid = nid('arc');
  const gid = nid('ck');
  const R = 53;
  const ringText = svg('text', { class: 'b-b-cs-text' }, svg('textPath', { href: `#${pid}`, startOffset: '0', textLength: String(Math.floor(2 * Math.PI * R) - 2), lengthAdjust: 'spacing' }));
  ringText.firstChild.textContent = 'PAYMENT VERIFIED • MBA CONSULT • ';
  return svg('svg', { viewBox: '0 0 132 132', class: 'b-b-cs-svg', 'aria-hidden': 'true', focusable: 'false' },
    svg('defs', {},
      svg('path', { id: pid, d: `M66 66m-${R} 0a${R} ${R} 0 1 1 ${2 * R} 0a${R} ${R} 0 1 1 -${2 * R} 0` }),
      svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 1, y2: 1 },
        svg('stop', { offset: '0%', 'stop-color': '#5B1FD0' }),
        svg('stop', { offset: '100%', 'stop-color': '#2457E6' }))),
    svg('circle', { cx: 66, cy: 66, r: 57, class: 'b-b-cs-band' }),
    svg('g', { class: 'b-b-cs-spin' }, ringText),
    svg('circle', { cx: 66, cy: 66, r: 40, class: 'b-b-cs-pulse' }),
    svg('circle', { cx: 66, cy: 66, r: 40, class: 'b-b-cs-pulse is-2' }),
    svg('g', { class: 'b-b-cs-core' },
      svg('circle', { cx: 66, cy: 66, r: 40, class: 'b-b-cs-disc' }),
      svg('path', { d: 'M48 67.5l11.5 11.5L85 53.5', class: 'b-b-cs-check', stroke: `url(#${gid})`, pathLength: 1 })));
}

function renderConfirm(ctx) {
  const { h, icon, fmt, data } = ctx;
  const b = data.borrower;
  const c = b.confirmation;
  const t = clock(ctx);
  const { root, scroll } = phone(ctx, 'confirm');
  const m = data.methods.find((x) => x.name === c.method);

  const amtSlot = h('div', { class: 'b-b-amt b-b-c-amt' }, money(ctx, c.amount, { cls: 'b-b-amt-lg', delay: 700, duration: 1000 }));
  const play = () => {
    root.classList.remove('is-play');
    void root.offsetWidth; // restart every CSS animation in the sequence
    root.classList.add('is-play');
  };
  const replay = h('button', { type: 'button', class: 'b-b-replay', attrs: { 'aria-label': 'Replay the confirmation' } }, icon('refresh', { size: 18 }));
  replay.addEventListener('click', () => {
    const m = money(ctx, c.amount, { cls: 'b-b-amt-lg', delay: 700, duration: 1000 });
    amtSlot.replaceChildren(m);
    COUNTERS.get(m)?.();
    play();
  });

  const tid = nid('ctitle');
  const hero = h('section', { class: 'b-hero b-b-hero b-b-c-hero', attrs: { 'aria-labelledby': tid } },
    mark(ctx, { white: true, size: 34, cls: 'b-b-c-logo', alt: 'MBA Consult' }),
    replay,
    h('div', { class: 'b-b-cs' }, confirmStamp(ctx)),
    h('p', { class: 'b-b-c-eyebrow' }, 'Payment verified'),
    h('h1', { class: 'b-b-c-title', id: tid }, c.title),
    amtSlot,
    h('div', { class: 'b-b-c-meta' },
      h('span', { class: 'b-b-c-by' }, `Paid by ${c.method}`),
      h('span', { class: 'b-b-hchip' }, icon('check', { size: 13 }), `Installment ${c.seq} of ${b.count} paid`)));
  glow(ctx, hero, SPOTS.confirm);

  const perf = h('div', { class: 'b-b-perf', attrs: { 'aria-hidden': 'true' } });
  const rcpt = h('div', { class: 'b-b-rcpt' },
    h('dl', { class: 'b-b-rgrid' },
      h('div', {}, h('dt', {}, 'Reference'), h('dd', { class: 'b-num b-b-strong' }, c.txn)),
      h('div', {}, h('dt', {}, 'Method'), h('dd', { class: 'b-b-rmethod' }, plate(ctx, m, { size: 'xs' }), c.method)),
      h('div', { class: 'is-wide' }, h('dt', {}, 'Date and time'), h('dd', { class: 'b-num' }, `${fmt.dateTime(c.paidAt)} PHT`)),
      h('div', { class: 'is-wide' }, h('dt', {}, 'Paid to'), h('dd', {}, b.payee))),
    perf,
    h('p', { class: 'b-b-rnote' }, icon('info', { size: 16 }), h('span', {}, c.note)));
  const slot = h('div', { class: 'b-b-slot' }, h('div', { class: 'b-b-print' }, rcpt, h('div', { class: 'b-b-redge', attrs: { 'aria-hidden': 'true' } })));
  // the side notches line up with the perforation, wherever the text wraps
  const notch = () => { if (perf.offsetTop) rcpt.style.setProperty('--b-b-notch', `${perf.offsetTop + 1}px`); };
  requestAnimationFrame(notch);
  if (typeof ResizeObserver === 'function') { const ro = new ResizeObserver(notch); ro.observe(rcpt); ctx.onCleanup(() => ro.disconnect()); }

  const prog = h('section', { class: 'b-card b-b-prog' },
    h('div', { class: 'b-b-card-head' },
      h('h2', { class: 'b-h2' }, 'Your progress'),
      h('span', { class: 'b-chip is-ok' }, `${c.paidCountAfter} of ${b.count} paid`)),
    h('p', { class: 'b-b-prog-fig' },
      money(ctx, c.paidAfter, { cls: 'b-b-prog-paid', count: false }), // below the fold: no count-up
      h('span', { class: 'b-b-prog-of' }, `of ${fmt.php(b.total)} paid`)),
    segs(ctx, { count: b.count, done: c.paidCountAfter, base: 1700, label: `${c.paidCountAfter} of ${b.count} installments paid` }),
    h('div', { class: 'b-b-prog-foot' },
      h('span', {}, h('strong', { class: 'b-num' }, fmt.php(b.total - c.paidAfter)), ' remaining'),
      h('span', {}, `Installment ${c.seq} paid`)));

  const next = c.nextDue
    ? h('section', { class: 'b-card b-b-next' },
      h('span', { class: 'b-b-next-ic', attrs: { 'aria-hidden': 'true' } }, icon('arrangements', { size: 22 })),
      h('div', {},
        h('p', { class: 'b-eyebrow' }, 'Next installment'),
        h('p', { class: 'b-b-next-t' }, h('strong', { class: 'b-num' }, fmt.php(c.nextDue.amount)), ` due ${fmt.date(c.nextDue.dueDate)}`)))
    : null;
  const sms = h('p', { class: 'b-b-sms' }, h('span', { class: 'b-b-sms-ic', attrs: { 'aria-hidden': 'true' } }, icon('check', { size: 14 })), `A confirmation was sent to ${b.maskedMobile}`);

  const saveLabel = h('span', {}, 'Save confirmation');
  const save = h('button', { type: 'button', class: 'b-btn b-btn-ink b-b-wide' }, icon('download', { size: 18 }), saveLabel);
  save.addEventListener('click', () => {
    saveLabel.textContent = 'Saved to this device';
    save.classList.add('is-done');
    t.after(() => { saveLabel.textContent = 'Save confirmation'; save.classList.remove('is-done'); }, 1800);
  });
  const back = h('button', { type: 'button', class: 'b-btn b-btn-white b-b-wide' }, icon('arrowLeft', { size: 18 }), 'Back to my arrangement');
  const acts = h('div', { class: 'b-b-cacts' }, save, back);

  enter([prog, next, sms, acts], { step: 80, base: 1600 });
  scroll.append(hero, slot, prog, next, sms, acts);
  ctx.onCleanup(ctx.fx.inView(root, play, { threshold: 0.1 }));
  if (ctx.fx.reduced()) root.classList.add('is-play');
  return root;
}

// =============================================================================================
// 5 · desk: the borrower on a desktop. Amount due and paying in one bento view (1440×900).

function renderDesk(ctx) {
  const { h, icon, fmt, fx, data } = ctx;
  const b = data.borrower;
  const t = clock(ctx);
  const root = h('div', { class: ['b-b-root', 'b-b-desk'] });
  entrance(ctx, root);
  const toast = toaster(ctx, root, t);
  const live = h('p', { class: 'b-b-sr', attrs: { 'aria-live': 'polite' } });

  const top = h('header', { class: 'b-b-dtop' },
    h('div', { class: 'b-b-brand' }, mark(ctx, { size: 42 }), h('div', {}, h('strong', {}, 'MBA Consult'), h('span', {}, 'Payment portal'))),
    h('div', { class: 'b-b-dtop-r' },
      h('span', { class: 'b-chip is-ok b-b-secure' }, icon('shield', { size: 15 }), 'Secure · verified'),
      h('span', { class: 'b-b-who' },
        h('span', { class: 'b-b-avatar is-sm', attrs: { 'aria-hidden': 'true' } }, fmt.initials(b.name)),
        h('span', {}, b.name))));

  // tiles referenced by the quick actions
  let schedTile = null;
  let recentTile = null;
  let payTile = null;
  const co = checkout(ctx, t, { live });
  const actions = [
    ['Pay', 'transactions', () => { flash(payTile); co.btn.focus({ preventScroll: true }); }],
    ['Schedule', 'arrangements', () => flash(schedTile)],
    ['Receipts', 'file', () => flash(recentTile)],
    ['Help', 'info', () => toast('Questions? Contact MBA Support. We’re here to help.', 'info')],
  ].map(([label, ic, fn]) => h('button', { type: 'button', class: 'b-action b-b-act', on: { click: fn } },
    h('span', { class: 'b-action-ic' }, icon(ic, { size: 22 })), h('span', { class: 'b-b-act-l' }, label)));

  const lid = nid('ddue');
  const hero = h('section', { class: 'b-hero b-b-hero b-b-dhero', attrs: { 'aria-labelledby': lid } },
    h('div', { class: 'b-b-dhero-top' },
      h('p', { class: 'b-b-dhi' }, `Hi, ${b.first}`),
      h('span', { class: 'b-b-hchip' }, b.creditor)),
    h('p', { class: 'b-b-hero-label', id: lid }, 'Amount due'),
    h('div', { class: 'b-b-amt' }, money(ctx, b.due.amount, { cls: 'b-b-amt-xxl', delay: 250, duration: 1300 })),
    h('div', { class: 'b-b-hero-meta' },
      h('span', { class: 'b-b-hchip' }, `Installment ${b.due.seq} of ${b.count}`),
      h('span', { class: 'b-b-due-on' }, icon('clock', { size: 17 }), `Due ${fmt.dayShort(b.due.dueDate)}`)),
    h('div', { class: 'b-b-acts is-desk' }, actions),
    // the plan as a ring: paid, due now, upcoming (one segment per installment)
    h('div', { class: 'b-b-dring' },
      fx.ring({
        parts: b.schedule.map((it) => ({ value: 1, className: `is-${kindOf(b, it)}` })),
        size: 196, stroke: 14, gap: 22, className: 'b-b-dring-svg',
        label: `${b.paidCount} of ${b.count} installments paid; installment ${b.due.seq} is due now`,
      }),
      h('div', { class: 'b-b-dring-c', attrs: { 'aria-hidden': 'true' } },
        h('strong', { class: 'b-num' }, String(b.count - b.paidCount)),
        h('span', {}, `${plural(b.count - b.paidCount, 'installment', 'installments')} left`))));
  glow(ctx, hero, SPOTS.desk, { blur: 90, opacity: 0.6 });
  fx.spotlight(hero);

  const picker = methodPicker(ctx, { onPick: (m) => co.setMethod(m) });
  const payId = nid('dpay');
  payTile = h('section', { class: 'b-card b-b-dpay', attrs: { 'aria-labelledby': payId } },
    h('div', { class: 'b-b-card-head' },
      h('h2', { class: 'b-h2 b-b-dh2', id: payId }, 'Choose how to pay'),
      h('span', { class: 'b-chip is-info' }, icon('lock', { size: 13 }), 'Secure checkout')),
    h('p', { class: 'b-b-dsub' }, 'You’re paying ', h('strong', { class: 'b-num' }, fmt.php(b.due.amount)), ` for installment ${b.due.seq} of ${b.count}.`),
    picker.el,
    providerNote(ctx, { compact: true }),
    co.host,
    testLine(ctx));

  const prog = h('section', { class: 'b-card b-b-dtile b-b-dprog' },
    h('div', { class: 'b-b-card-head' },
      h('h2', { class: 'b-h2' }, 'Your progress'),
      h('span', { class: 'b-chip is-ok' }, `${b.paidCount} of ${b.count} paid`)),
    h('p', { class: 'b-b-prog-fig' },
      money(ctx, b.paid, { cls: 'b-b-prog-paid', delay: 500 }),
      h('span', { class: 'b-b-prog-of' }, `of ${fmt.php(b.total)} paid`)),
    segs(ctx, { count: b.count, done: b.paidCount, now: b.due.seq, base: 650, numbered: true, label: `${b.paidCount} of ${b.count} installments paid; installment ${b.due.seq} is due now` }),
    h('div', { class: 'b-b-dstats' },
      h('div', {}, h('span', {}, 'Remaining'), h('strong', { class: 'b-num' }, fmt.php(b.remaining))),
      h('div', {}, h('span', {}, 'Last installment'), h('strong', { class: 'b-num' }, fmt.date(b.schedule.at(-1).dueDate)))));

  schedTile = h('section', { class: 'b-card b-b-dtile b-b-dsched' },
    h('div', { class: 'b-b-card-head' },
      h('h2', { class: 'b-h2' }, 'Payment schedule'),
      h('span', { class: 'b-b-muted b-b-small' }, `${b.count} monthly installments`)),
    scheduleList(ctx, { compact: true }));

  recentTile = h('section', { class: 'b-card b-b-dtile b-b-drecent' },
    h('div', { class: 'b-b-card-head' },
      h('h2', { class: 'b-h2' }, 'Recent payments'),
      h('span', { class: 'b-b-muted b-b-small' }, `${b.history.length} ${plural(b.history.length, 'payment', 'payments')}`)),
    historyList(ctx),
    h('div', { class: 'b-b-dpayee' },
      h('span', { class: 'b-b-payee-ic', attrs: { 'aria-hidden': 'true' } }, icon('shield', { size: 18 })),
      h('div', {},
        h('p', { class: 'b-b-payee-t' }, b.payee),
        h('p', { class: 'b-b-payee-ref b-num' }, `Arrangement ${b.arrangementRef}`))));

  const grid = h('main', { class: 'b-b-bento' }, hero, payTile, prog, schedTile, recentTile);
  enter([hero, payTile, prog, schedTile, recentTile], { step: 80 });
  enter(picker.tiles, { step: 45, base: 420 });
  root.append(top, grid, live);
  return root;
}

// =============================================================================================

export const borrowerPhone = [
  { id: 'code', title: 'Code entry', caption: 'Tap the keypad: each digit pops into its box, and the sixth stamps it verified.', render: renderCode },
  { id: 'due', title: 'Amount due', caption: 'The gradient block drifts and counts up. Pull the tab under it for the schedule.', render: renderDue },
  { id: 'pay', title: 'Choose how to pay', caption: 'Pick a method for a springy select, then continue to see the hand-off.', render: renderPay },
  { id: 'confirm', title: 'Payment confirmation', caption: 'The stamp draws its check, then the confirmation prints out. Tap replay.', render: renderConfirm },
];
export const borrowerDesktop = [
  { id: 'desk', title: 'Amount due and paying, desktop', caption: 'Amount due and paying in one bento view. Pick a method and continue.', render: renderDesk },
];
