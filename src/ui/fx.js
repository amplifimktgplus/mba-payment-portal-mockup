// Motion kit shared by the demo's Midnight look and the design-options page (2026-11-26). Vanilla, hand-built effects in
// the spirit of React Bits-style components (aurora light, count-up numbers, spotlight, tilt,
// staggered entrances, drawn lines). No React and no copied code. Every effect is calm under
// "reduce motion" and frame-scale aware (screens are rendered at design size, then CSS-scaled).

export const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const raf = (fn) => requestAnimationFrame(fn);
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));

/** Runs cb once the element is on screen (or immediately when IntersectionObserver is missing). */
export function inView(el, cb, { threshold = 0.15, once = true } = {}) {
  if (typeof IntersectionObserver !== 'function') { cb(); return () => {}; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      cb();
      if (once) io.disconnect();
    }
  }, { threshold });
  io.observe(el);
  return () => io.disconnect();
}

/** Tweens a number into el.textContent when el comes into view. format(value) → string. */
export function countUp(el, to, { from = 0, duration = 1100, delay = 0, format = (v) => Math.round(v).toLocaleString('en-US') } = {}) {
  el.textContent = format(reduced() ? to : from);
  if (reduced()) return el;
  inView(el, () => {
    const start = performance.now() + delay;
    const step = (now) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      el.textContent = format(from + (to - from) * easeOutExpo(t));
      if (t < 1) raf(step);
    };
    raf(step);
  });
  return el;
}

/**
 * A peso amount that counts up, split for big-number styling:
 * <span class="mc"><span class="mc-sign">₱</span><span class="mc-whole">2,500</span><span class="mc-cents">.00</span></span>
 * centavos is an integer. Style the parts per option (e.g. smaller, dimmer sign and cents).
 */
export function money(centavos, { duration = 1100, delay = 0, className = '' } = {}) {
  const root = document.createElement('span');
  root.className = `mc ${className}`.trim();
  const sign = document.createElement('span'); sign.className = 'mc-sign'; sign.textContent = '₱';
  const whole = document.createElement('span'); whole.className = 'mc-whole';
  const cents = document.createElement('span'); cents.className = 'mc-cents';
  root.append(sign, whole, cents);
  root.setAttribute('aria-label', `₱${(centavos / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const paint = (c) => {
    const v = Math.round(c);
    whole.textContent = Math.floor(v / 100).toLocaleString('en-US');
    cents.textContent = `.${String(Math.abs(v) % 100).padStart(2, '0')}`;
  };
  paint(reduced() ? centavos : 0);
  if (!reduced()) {
    inView(root, () => {
      const start = performance.now() + delay;
      const step = (now) => {
        const t = Math.max(0, Math.min(1, (now - start) / duration));
        paint(centavos * easeOutExpo(t));
        if (t < 1) raf(step); else paint(centavos);
      };
      raf(step);
    });
  }
  return root;
}

/**
 * Slow aurora light (soft blurred colour fields drifting). Appends a layer to `host` (which should
 * be position:relative; overflow:hidden). colors: CSS colours. Returns the layer element.
 */
export function aurora(host, { colors = ['#4B0096', '#64C8FF', '#1F4FE0'], blur = 70, opacity = 0.75, speed = 1, seed = 1 } = {}) {
  const layer = document.createElement('div');
  layer.className = 'fx-aurora';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.setProperty('--fx-blur', `${blur}px`);
  layer.style.opacity = String(opacity);
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  colors.forEach((c, i) => {
    const b = document.createElement('span');
    b.className = 'fx-aurora-blob';
    b.style.setProperty('--c', c);
    b.style.setProperty('--x', `${Math.round(rnd() * 80 - 10)}%`);
    b.style.setProperty('--y', `${Math.round(rnd() * 70 - 10)}%`);
    b.style.setProperty('--s', `${Math.round(45 + rnd() * 35)}%`);
    b.style.setProperty('--dx', `${Math.round(rnd() * 30 - 15)}%`);
    b.style.setProperty('--dy', `${Math.round(rnd() * 30 - 15)}%`);
    b.style.setProperty('--d', `${Math.round((14 + rnd() * 10 + i * 3) / speed)}s`);
    layer.appendChild(b);
  });
  host.prepend(layer);
  return layer;
}

/** Film-grain overlay (static SVG noise). Appends to host; host should be position:relative. */
export function grain(host, { opacity = 0.08 } = {}) {
  const g = document.createElement('div');
  g.className = 'fx-grain';
  g.style.opacity = String(opacity);
  g.setAttribute('aria-hidden', 'true');
  host.appendChild(g);
  return g;
}

/** Pointer spotlight: sets --mx/--my (px, in the element's own unscaled space) for CSS radial glows. */
export function spotlight(el) {
  if (reduced()) return el;
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const sx = el.offsetWidth ? r.width / el.offsetWidth : 1;
    el.style.setProperty('--mx', `${(e.clientX - r.left) / sx}px`);
    el.style.setProperty('--my', `${(e.clientY - r.top) / sx}px`);
  }, { passive: true });
  return el;
}

/** Gentle 3D tilt toward the pointer (max degrees). */
export function tilt(el, { max = 6, perspective = 900 } = {}) {
  if (reduced()) return el;
  el.style.transformStyle = 'preserve-3d';
  el.style.transition = 'transform .45s cubic-bezier(.22,1,.36,1)';
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(${perspective}px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`;
  }, { passive: true });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  return el;
}

/** Magnetic hover: the element drifts a little toward the pointer. */
export function magnetic(el, { strength = 0.18 } = {}) {
  if (reduced()) return el;
  el.style.transition = 'transform .35s cubic-bezier(.22,1,.36,1)';
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    const sx = el.offsetWidth ? r.width / el.offsetWidth : 1;
    const dx = (e.clientX - (r.left + r.width / 2)) / sx;
    const dy = (e.clientY - (r.top + r.height / 2)) / sx;
    el.style.transform = `translate(${(dx * strength).toFixed(1)}px, ${(dy * strength).toFixed(1)}px)`;
  }, { passive: true });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  return el;
}

/** Staggered entrance: children matching selector rise in, step ms apart, once visible. */
export function stagger(parent, selector = ':scope > *', { step = 45, base = 0 } = {}) {
  const items = [...parent.querySelectorAll(selector)];
  items.forEach((el, i) => { el.style.setProperty('--fx-i', String(i)); el.style.setProperty('--fx-step', `${step}ms`); el.style.setProperty('--fx-base', `${base}ms`); el.classList.add('fx-rise'); });
  if (reduced()) { items.forEach((el) => el.classList.add('fx-on')); return parent; }
  inView(parent, () => items.forEach((el) => el.classList.add('fx-on')));
  return parent;
}

/** Draws an SVG path's stroke once visible. */
export function drawPath(path, { duration = 1400, delay = 0 } = {}) {
  const run = () => {
    const len = path.getTotalLength ? path.getTotalLength() : 1000;
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = reduced() ? '0' : `${len}`;
    if (reduced()) return;
    path.getBoundingClientRect();
    path.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(.22,1,.36,1) ${delay}ms`;
    raf(() => { path.style.strokeDashoffset = '0'; });
  };
  inView(path.ownerSVGElement || path, run);
  return path;
}

// --------------------------------------------------------------------------------------------
// Tiny SVG chart builders (style them with CSS classes per option).

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;
export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c) el.appendChild(c);
  return el;
}

/** Smooth path through points (Catmull-Rom → cubic Bézier). */
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Area chart: { values:number[], w, h, pad, className, stroke, fillFrom, fillTo, drawn } → <svg>.
 * Classes: .fx-area-line (stroke path), .fx-area-fill (area), .fx-area-dot (last point).
 */
export function areaChart({ values, w = 600, h = 180, pad = 8, className = '', stroke = 'currentColor', fillFrom = 'currentColor', fillTo = 'transparent', drawn = true, label = '' } = {}) {
  const id = `fxg${++uid}`;
  const max = Math.max(1, ...values);
  const step = (w - pad * 2) / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [pad + i * step, h - pad - (v / max) * (h - pad * 2)]);
  const line = smoothPath(pts);
  const area = `${line} L${pts.at(-1)[0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  const s = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: `fx-area ${className}`.trim(), role: 'img', 'aria-label': label || null, preserveAspectRatio: 'none' },
    svg('defs', {}, svg('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 },
      svg('stop', { offset: '0%', 'stop-color': fillFrom, 'stop-opacity': 0.45 }),
      svg('stop', { offset: '100%', 'stop-color': fillTo, 'stop-opacity': 0 }))),
    svg('path', { d: area, fill: `url(#${id})`, class: 'fx-area-fill' }),
    svg('path', { d: line, fill: 'none', stroke, 'stroke-width': 2.5, 'stroke-linecap': 'round', class: 'fx-area-line', 'vector-effect': 'non-scaling-stroke' }),
    svg('circle', { cx: pts.at(-1)[0], cy: pts.at(-1)[1], r: 4.5, class: 'fx-area-dot', fill: stroke }));
  if (drawn) drawPath(s.querySelector('.fx-area-line'));
  return s;
}

/**
 * Rounded bars that grow in: { values, w, h, gap, radius, className, labels } → <svg>.
 * Each bar is <rect class="fx-bar" style="--fx-i:i">; the tallest also gets .is-max.
 */
export function barChart({ values, w = 600, h = 160, gap = 6, radius = 6, className = '', label = '' } = {}) {
  const max = Math.max(1, ...values);
  const bw = (w - gap * (values.length - 1)) / values.length;
  const s = svg('svg', { viewBox: `0 0 ${w} ${h}`, class: `fx-bars ${className}`.trim(), role: 'img', 'aria-label': label || null, preserveAspectRatio: 'none' });
  values.forEach((v, i) => {
    const bh = Math.max(2, (v / max) * h);
    const r = svg('rect', { x: (i * (bw + gap)).toFixed(1), y: (h - bh).toFixed(1), width: bw.toFixed(1), height: bh.toFixed(1), rx: Math.min(radius, bw / 2), class: `fx-bar${v === max ? ' is-max' : ''}` });
    r.style.setProperty('--fx-i', String(i));
    s.appendChild(r);
  });
  if (!reduced()) inView(s, () => s.classList.add('fx-on')); else s.classList.add('fx-on');
  return s;
}

/** Donut / ring: { parts:[{value, className}], size, stroke, gap } → <svg>; segments draw in. */
export function ring({ parts, size = 160, stroke = 16, gap = 3, className = '', label = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const s = svg('svg', { viewBox: `0 0 ${size} ${size}`, class: `fx-ring ${className}`.trim(), role: 'img', 'aria-label': label || null });
  let offset = 0;
  parts.forEach((p, i) => {
    const len = Math.max(0, (p.value / total) * c - gap);
    const seg = svg('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round', class: `fx-ring-seg ${p.className || ''}`.trim(), transform: `rotate(-90 ${size / 2} ${size / 2})` });
    seg.style.strokeDasharray = `${len} ${c}`;
    seg.style.strokeDashoffset = String(-offset);
    seg.style.setProperty('--fx-i', String(i));
    offset += (p.value / total) * c;
    s.appendChild(seg);
  });
  if (!reduced()) inView(s, () => s.classList.add('fx-on')); else s.classList.add('fx-on');
  return s;
}
