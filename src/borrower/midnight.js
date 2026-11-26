// Midnight-only parts of the borrower view (2026-11-26). The product owner picked design option A
// ("Midnight") from dist/options.html; this file turns its borrower concept (src/options/a/borrower.js)
// into parts the real screens use: the glass keypad that types into the real code boxes, the calm
// "verified" moment, the notched amount card with the next installments peeking above it, the
// gliding selection edge on the payment methods, and the confirmation that prints out of a glass slot.
//
// Rules: every part here is built only when isMidnight() is true, so the Classic look keeps its DOM
// exactly. Parts never decide payment or verification truth; the keypad drives the existing code
// inputs through the same events they already listen to. Decorative layers are aria-hidden and use
// pseudo-elements or in-bounds boxes only (the 375px overflow check measures every element).
// Styles: src/styles/midnight-borrower.css (all under html[data-look="midnight"]).

import { h, nextId, formatPHP, fmtDate } from '../ui/kit.js';
import * as fx from '../ui/fx.js';
import { bui } from './parts.js';

/** True on the first render of a screen; false when the same screen re-renders (picking a method, Demo tools). */
export const entering = (screen) => bui().lastScreen !== screen;

/** Motion is wanted (Midnight runs calm or still under "reduce motion"). */
export const moving = () => !fx.reduced();

// ---------------------------------------------------------------------------------------------
// Money

/** "₱2,500.00" with the sign and centavos in their own spans. textContent is unchanged. */
export function moneyParts(centavos) {
  const text = formatPHP(centavos);
  const m = /^(-?)(₱)(.+?)(\.\d{2})$/.exec(text);
  if (!m) return [text];
  return [m[1], h('span', { class: 'mn-cur' }, m[2]), m[3], h('span', { class: 'mn-dec' }, m[4])];
}

/** Same parts as fx.money(), painted at the final value (re-renders and reduced motion). */
function staticMoney(centavos) {
  const v = Math.round(centavos);
  return h('span', { class: 'mc' },
    h('span', { class: 'mc-sign' }, '₱'),
    h('span', { class: 'mc-whole' }, Math.floor(v / 100).toLocaleString('en-US')),
    h('span', { class: 'mc-cents' }, `.${String(Math.abs(v) % 100).padStart(2, '0')}`));
}

/** The big visible amount (aria-hidden: the exact figure sits in a screen-reader twin next to it). */
export function bigMoney(centavos, { count = false } = {}) {
  return h('span', { class: 'mn-money', attrs: { 'aria-hidden': 'true' } },
    count && moving() ? fx.money(centavos, { delay: 260, duration: 1250 }) : staticMoney(centavos));
}

// ---------------------------------------------------------------------------------------------
// B2: glass keypad + the verified moment

const BACKSPACE = 'M21 5H9l-6 7 6 7h12z M17 9.5l-5 5 M12 9.5l5 5';

/**
 * Glass keypad for the six code boxes. A key sets the value of the box that has focus (or the
 * first empty one) and dispatches the same `input` event typing would; backspace clears the box or,
 * on an empty box, dispatches the `keydown` Backspace the boxes already handle. Mouse presses keep
 * focus in the box, so the caret glow stays where the next digit goes.
 */
export function keypad(boxes) {
  const focusedIndex = () => boxes.indexOf(document.activeElement);
  const fire = (box) => box.dispatchEvent(new Event('input', { bubbles: true }));
  const press = (d) => {
    let i = focusedIndex();
    if (i < 0) i = boxes.findIndex((b) => !b.value);
    if (i < 0) i = boxes.length - 1;
    const box = boxes[i];
    if (!box?.isConnected) return;
    box.value = d;
    fire(box);
  };
  const back = () => {
    const i = focusedIndex();
    if (i >= 0) {
      const box = boxes[i];
      if (box.value) { box.value = ''; fire(box); } else box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
      return;
    }
    for (let j = boxes.length - 1; j >= 0; j--) {
      if (!boxes[j].value) continue;
      boxes[j].value = '';
      fire(boxes[j]);
      boxes[j].focus({ preventScroll: true });
      return;
    }
  };
  const ink = (e) => {
    if (!moving()) return;
    const k = e.currentTarget;
    const r = k.getBoundingClientRect();
    k.style.setProperty('--kx', `${e.clientX - r.left}px`);
    k.style.setProperty('--ky', `${e.clientY - r.top}px`);
    k.classList.remove('is-ink');
    void k.offsetWidth; // restart the ink
    k.classList.add('is-ink');
  };
  const key = (content, { label, testid, onPress, cls = '' }) => h('button', {
    type: 'button', class: ['mn-key', cls], testid, attrs: { 'aria-label': label },
    on: { mousedown: (e) => e.preventDefault(), pointerdown: ink, click: onPress },
  }, content);
  const digit = (d) => key(h('span', { class: 'mn-key-d num' }, d), { label: d, testid: `otp-key-${d}`, onPress: () => press(d) });
  return h('div', { class: 'mn-pad', testid: 'otp-keypad', attrs: { role: 'group', 'aria-label': 'Keypad' } },
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit),
    h('span', { class: ['mn-key', 'is-blank'], attrs: { 'aria-hidden': 'true' } }),
    digit('0'),
    key(fx.svg('svg', { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.75, 'aria-hidden': 'true', focusable: 'false', class: 'icon' }, fx.svg('path', { d: BACKSPACE })),
      { label: 'Delete last digit', testid: 'otp-key-back', cls: 'is-back', onPress: back }));
}

/** Calm verified mark: a ring and a check that draw themselves once (static under reduced motion). */
export function okMark({ size = 30, cls = '' } = {}) {
  return h('div', { class: ['bmark', 'tone-ok', 'mn-okmark', cls], attrs: { 'aria-hidden': 'true' } },
    fx.svg('svg', { viewBox: '0 0 48 48', width: size, height: size, fill: 'none', focusable: 'false' },
      fx.svg('circle', { cx: 24, cy: 24, r: 20.5, pathLength: 1, class: 'mn-ok-c' }),
      fx.svg('path', { d: 'M15.5 24.6l5.9 5.9 11.6-12.2', pathLength: 1, class: 'mn-ok-p' })));
}

// ---------------------------------------------------------------------------------------------
// B3: the notched amount card with the next installments stacked behind it

/** Rounded rect with a soft notch in the middle of its top edge, as an SVG path (o = inset). */
function notchPath(w, hh, { r = 26, nw = 128, nd = 15, k = 28, o = 0 } = {}) {
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

/**
 * Turns `card` into the notched glass card: a glass layer clipped to the notched shape and a glowing
 * brand-gradient edge that follows the notch. Redrawn whenever the card changes size.
 */
export function notch(card) {
  const gid = nextId('mn-edge');
  const fid = nextId('mn-glow');
  const glass = h('div', { class: 'mn-notch-glass', attrs: { 'aria-hidden': 'true' } });
  const glow = fx.svg('path', { class: 'mn-notch-glow', stroke: `url(#${gid})`, filter: `url(#${fid})` });
  const line = fx.svg('path', { class: 'mn-notch-line', stroke: `url(#${gid})` });
  const art = fx.svg('svg', { class: 'mn-notch-svg', 'aria-hidden': 'true', focusable: 'false' },
    fx.svg('defs', {},
      fx.svg('linearGradient', { id: gid, x1: 0, y1: 0, x2: 1, y2: 1 },
        fx.svg('stop', { offset: '0%', 'stop-color': '#8FD8FF', 'stop-opacity': 0.95 }),
        fx.svg('stop', { offset: '50%', 'stop-color': '#7B4BE0', 'stop-opacity': 0.85 }),
        fx.svg('stop', { offset: '100%', 'stop-color': '#64C8FF', 'stop-opacity': 0.2 })),
      fx.svg('filter', { id: fid, x: '-10%', y: '-10%', width: '120%', height: '120%' }, fx.svg('feGaussianBlur', { stdDeviation: 3.5 }))),
    glow, line);
  card.classList.add('mn-notch');
  card.prepend(glass, art);
  const draw = () => {
    const w = card.offsetWidth;
    const hh = card.offsetHeight;
    if (!w || !hh) return;
    const geo = { r: w > 420 ? 28 : 26, nw: Math.min(w > 420 ? 160 : 128, w * 0.4), nd: w > 420 ? 17 : 15, k: w > 420 ? 32 : 28 };
    const clip = `path('${notchPath(w, hh, geo)}')`;
    glass.style.clipPath = clip;
    glass.style.webkitClipPath = clip;
    const d = notchPath(w, hh, { ...geo, o: 0.75 });
    art.setAttribute('viewBox', `0 0 ${w} ${hh}`);
    art.setAttribute('width', String(w));
    art.setAttribute('height', String(hh));
    glow.setAttribute('d', d);
    line.setAttribute('d', d);
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(draw).observe(card);
  return card;
}

/** The next (unpaid) installments after the current one, as cards peeking above the amount card. */
export function dueStack(card, insts, currentSeq, { onPeek = null } = {}) {
  const ahead = currentSeq ? insts.filter((i) => i.seq > currentSeq && i.status !== 'paid').slice(0, 2) : [];
  const peeks = ahead.map((i, n) => h('div', { class: ['mn-peek', `mn-peek-${n + 1}`] },
    h('span', { class: 'mn-peek-l' }, `Installment ${i.seq} · ${fmtDate(i.dueDate)}`),
    h('span', { class: 'mn-peek-r num' }, formatPHP(i.amount)))).reverse();
  return h('div', { class: ['mn-stack', `has-${ahead.length}`] },
    ahead.length ? h('div', { class: ['mn-peeks', { 'is-click': !!onPeek }], attrs: { 'aria-hidden': 'true' }, on: onPeek ? { click: onPeek } : {} }, peeks) : null,
    notch(card));
}

// ---------------------------------------------------------------------------------------------
// B4: the selection edge that glides between payment methods

/**
 * Adds a glowing gradient edge to the method list that glides to the chosen tile. The list re-renders
 * on every pick, so the last position is kept in the borrower UI memory and the new edge starts there.
 */
export function glide(list) {
  const ui = bui();
  const edge = h('span', { class: 'mn-glide', attrs: { 'aria-hidden': 'true' } });
  list.classList.add('has-glide');
  list.prepend(edge);
  // Measured against the edge's own untransformed origin: in a <fieldset>, offsetTop counts the
  // legend but an absolutely placed child starts below it, so offsets alone would land one legend
  // too low. Rect deltas are divided by any ancestor scale (the card's entrance animation).
  const rectOf = () => {
    const t = list.querySelector('.bmethod.is-on');
    if (!t) return null;
    const keep = edge.style.transform;
    edge.style.transform = 'none';
    const o = edge.getBoundingClientRect();
    const r = t.getBoundingClientRect();
    edge.style.transform = keep;
    const s = list.offsetWidth ? list.getBoundingClientRect().width / list.offsetWidth : 1;
    return { x: (r.left - o.left) / s, y: (r.top - o.top) / s, w: t.offsetWidth, h: t.offsetHeight, vw: list.offsetWidth };
  };
  const put = (r, animate) => {
    if (!r) return;
    edge.classList.toggle('is-moving', !!animate);
    edge.style.width = `${r.w}px`;
    edge.style.height = `${r.h}px`;
    edge.style.transform = `translate(${r.x}px, ${r.y}px)`;
  };
  // Snap (no glide) onto the tile's final box once layout has settled: logos decode and fonts swap
  // after the first frame and can move a row by a pixel. Never before the glide has started, never
  // during it (a logo that decodes early must not cut the glide short).
  let ready = false;
  const snap = () => {
    if (!ready || !edge.isConnected || edge.classList.contains('is-moving')) return;
    const r = rectOf();
    put(r, false);
    ui.mnGlide = r;
  };
  edge.addEventListener('transitionend', (e) => {
    if (e.propertyName !== 'transform') return;
    edge.classList.remove('is-moving');
    snap();
  });
  for (const img of list.querySelectorAll('img')) if (!img.complete) img.addEventListener('load', snap, { once: true });
  setTimeout(snap, 700);
  const same = (a, b) => ['x', 'y', 'w', 'h'].every((k) => Math.abs(a[k] - b[k]) < 0.5);
  requestAnimationFrame(() => {
    if (!edge.isConnected) return;
    const now = rectOf();
    const prev = ui.mnGlide;
    const from = prev && now && prev.vw === now.vw && moving() ? prev : now;
    put(from, false);
    edge.classList.add('is-on');
    void edge.offsetWidth; // commit the start position
    requestAnimationFrame(() => { put(now, !!(from && now) && !same(from, now)); ui.mnGlide = now; ready = true; });
  });
  // Re-place (no glide) only when the list itself changes width, e.g. 3 → 2 columns on a resize.
  // The observer's first call lands in the same frame as the start position above, so it is skipped.
  let lastW = null;
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (!edge.isConnected) return;
      const w = list.offsetWidth;
      if (lastW === null || w === lastW) { lastW = w; return; }
      lastW = w;
      edge.classList.remove('is-moving');
      snap();
    }).observe(list);
  }
  return list;
}

// ---------------------------------------------------------------------------------------------
// B8: the confirmation prints out of a glass slot

/**
 * Glass slot + window; the paper (the receipt block) feeds out of the slot when `print` is set
 * (first arrival on B8 with motion allowed). Otherwise the paper simply rests below the slot.
 */
export function printer(paper, { print = false } = {}) {
  return h('div', { class: ['mn-printer', { 'is-printing': print }] },
    h('div', { class: 'mn-slot', attrs: { 'aria-hidden': 'true' } },
      h('span', { class: 'mn-slot-slit' }), h('span', { class: 'mn-slot-light' }), h('span', { class: 'mn-slot-led' })),
    h('div', { class: 'mn-rc-win' }, paper));
}
