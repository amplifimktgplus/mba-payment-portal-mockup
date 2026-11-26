// Option A · Midnight: MBA back-office concept screens (2026-11-26).
// Desktop 1440×900: the dashboard as a night-time operations command centre, and the transaction
// history with the new Attachments column and a glass detail drawer. Phone 390×844: the dashboard
// with a floating glass dock. Every figure comes from ctx.data (src/options/data.js); amounts go
// through fmt.php / fmt.phpShort / fx.money, and borrower names are used exactly as given.
// Styles: a/mba.css (.a-m-*), on top of the Option A tokens and primitives in a/tokens.css.
// Local helpers only (no shared file is touched): method plates, status chips, PHT date labels,
// the chart scrubber, and the transaction drawer with its sample-page preview.
import logoSvg from '../../assets/mba_logo_white.svg';

const LOGO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;
const AURORA = ['#4B0096', '#1F4FE0', '#64C8FF'];
const PHT = 'Asia/Manila';

let uid = 0;
/** A unique id per rendered instance (the same screen can be on the page and in the viewer). */
const nid = (p) => `a-m-${p}-${++uid}`;

// ============================================================================== small helpers

const STATUS = Object.freeze({
  paid: { label: 'Paid', tone: 'ok' },
  pending: { label: 'Pending', tone: 'warn' },
  initiated: { label: 'Initiated', tone: 'info' },
  failed: { label: 'Failed', tone: 'danger' },
  expired: { label: 'Expired', tone: 'muted' },
});
const statusOf = (s) => STATUS[s] || { label: String(s || 'Unknown').replace(/^./, (c) => c.toUpperCase()), tone: 'muted' };

// Dates, always in Philippine time (the demo's clock).
const dayOf = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: PHT }); // 'YYYY-MM-DD'
const noon = (day) => new Date(`${day}T12:00:00+08:00`);
function shiftDay(day, n) {
  const d = noon(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dayOf(d.toISOString());
}
const monthDay = (day) => noon(day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: PHT }); // 'Nov 26'
const monthShort = (day) => noon(day).toLocaleDateString('en-US', { month: 'short', timeZone: PHT }); // 'Nov'
function daysInMonth(day) {
  const [y, m] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function prevMonthName(day) {
  const [y, m] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 15)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
}
/** 'Today, 1:47 AM' or 'Nov 25, 1:41 PM' (PHT). */
function stamp(ctx, iso) {
  const d = dayOf(iso);
  return `${d === ctx.data.mba.today ? 'Today' : monthDay(d)}, ${ctx.fmt.time(iso)}`;
}

// Payment-method marks. ctx.data.methods is [{ name, marks:[{src,name}], icon }].
const METHODS = new WeakMap();
function methodOf(ctx, name) {
  let map = METHODS.get(ctx.data);
  if (!map) {
    map = new Map(ctx.data.methods.map((m) => [m.name, m]));
    METHODS.set(ctx.data, map);
  }
  return map.get(name) || { name, marks: [], icon: null };
}
const toneOf = (name) => `is-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/** A method's mark on a small white plate (the logos are drawn for light backgrounds).
 *  label:true writes the method name beside an icon-only mark (Online banking). */
function plate(ctx, name, { size = 'md', label = false } = {}) {
  const { h, icon } = ctx;
  const m = methodOf(ctx, name);
  const el = h('span', { class: ['a-logo-plate', 'a-m-plate', `is-${size}`], attrs: { role: 'img', 'aria-label': name, title: name } });
  if (m.marks.length) {
    m.marks.forEach((k) => el.append(h('img', { src: k.src, alt: '', draggable: false })));
  } else {
    el.append(icon(m.icon || 'bank', { size: 16 }));
    if (label) el.append(h('span', { class: 'a-m-plate-name' }, name));
  }
  return el;
}

/** Status as text plus colour. */
function statusChip(ctx, status) {
  const st = statusOf(status);
  return ctx.h('span', { class: ['a-pill', 'a-m-status', `is-${st.tone}`] },
    ctx.h('span', { class: 'a-dot', attrs: { 'aria-hidden': 'true' } }), st.label);
}

/** A frosted panel with the pointer spotlight. */
function card(ctx, { tag = 'section', cls = null, edge = false, spot = true, lift = false, label = null } = {}, ...children) {
  const el = ctx.h(tag, {
    class: ['a-glass', 'a-m-card', spot && 'a-spot', edge && 'a-edge', lift && 'a-m-lift', cls],
    attrs: label ? { 'aria-label': label } : null,
  }, ...children);
  if (spot) ctx.fx.spotlight(el);
  return el;
}

function head(ctx, title, sub, side = null) {
  const { h } = ctx;
  return h('header', { class: 'a-m-head' },
    h('div', { class: 'a-m-head-text' }, h('h2', { class: 'a-m-title' }, title), sub ? h('p', { class: 'a-m-sub' }, sub) : null),
    side ? h('div', { class: 'a-m-head-side' }, side) : null);
}

/** Aurora light + grain behind everything; spots art-direct the three blobs. */
function backdrop(ctx, root, spots) {
  const layer = ctx.fx.aurora(root, { colors: AURORA, opacity: 0.55, blur: 80, seed: 3 });
  [...layer.children].forEach((b, i) => {
    const p = spots[i];
    if (p) Object.entries(p).forEach(([k, v]) => b.style.setProperty(`--${k}`, v));
  });
  ctx.fx.grain(root, { opacity: 0.06 });
}

/** Re-runs the staggered entrance of a list (a replay, never a fake new event). */
function replayRise(list) {
  const items = [...list.children];
  items.forEach((el) => el.classList.remove('fx-on'));
  void list.offsetWidth; // restart the CSS animation
  items.forEach((el) => el.classList.add('fx-on'));
}

const greeting = (ctx) => {
  const hr = Number(new Date(ctx.data.mba.now).toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: PHT }));
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
};

// ============================================================================== desktop shell

// The groups mirror the working demo's sidebar sections; the items come from data.mba.nav.
const NAV_GROUPS = [
  ['Overview', ['dashboard']],
  ['Clients', ['creditors', 'portfolios']],
  ['Collections', ['accounts', 'arrangements', 'requests', 'transactions']],
  ['Finance', ['reconciliation', 'reports', 'remittances']],
  ['System', ['settings']],
];

function sidebar(ctx, active) {
  const { h, icon, data } = ctx;
  const nav = data.mba.nav;
  const byId = new Map(nav.map((n) => [n.id, n]));
  const item = (n) => {
    const on = n.id === active;
    const recon = n.id === 'reconciliation';
    return h('button', {
      type: 'button',
      class: ['a-m-nav-item', on && 'is-active', on && 'a-edge'],
      attrs: {
        'aria-current': on ? 'page' : null,
        'aria-label': n.badge ? `${n.label}, ${n.badge} ${recon ? 'open' : 'awaiting approval'}` : null,
      },
    }, icon(n.icon, { size: 18 }), h('span', { class: 'a-m-nav-label' }, n.label),
    n.badge ? h('span', { class: ['a-m-badge', recon && 'is-warn'], attrs: { 'aria-hidden': 'true' } }, String(n.badge)) : null);
  };
  const seen = new Set();
  const groups = NAV_GROUPS.map(([cap, ids]) => {
    const items = ids.map((id) => byId.get(id)).filter(Boolean);
    items.forEach((n) => seen.add(n.id));
    return items.length ? h('div', { class: 'a-m-nav-group' }, h('p', { class: 'a-m-nav-cap' }, cap), items.map(item)) : null;
  });
  const rest = nav.filter((n) => !seen.has(n.id));
  if (rest.length) groups.push(h('div', { class: 'a-m-nav-group' }, rest.map(item)));
  return h('aside', { class: ['a-glass', 'a-m-side'] },
    h('div', { class: 'a-m-brand' },
      h('img', { src: LOGO, alt: '', class: 'a-m-brand-logo' }),
      h('div', { class: 'a-m-brand-text' }, h('strong', {}, 'MBA Consult'), h('span', {}, 'Collections back office'))),
    h('nav', { class: 'a-m-nav', attrs: { 'aria-label': 'Back office sections' } }, groups),
    h('p', { class: 'a-m-side-note' }, icon('shield', { size: 16 }),
      h('span', {}, h('strong', {}, 'Demo data only'), 'Every figure is computed from the seeded demo dataset.')));
}

function topBar(ctx, { eyebrow, title }) {
  const { h, icon, fmt, data } = ctx;
  const sid = nid('q');
  const user = data.mba.user;
  return h('header', { class: 'a-m-top' },
    h('div', { class: 'a-m-top-title' },
      h('p', { class: 'a-m-eyebrow' }, eyebrow),
      h('div', { class: 'a-m-top-row' },
        h('h1', { class: 'a-m-h1' }, title),
        h('span', { class: ['a-pill', 'a-m-asof'] }, icon('clock', { size: 14 }), `As of ${fmt.dateTime(data.mba.now)} PHT`))),
    h('div', { class: 'a-m-top-tools' },
      h('label', { class: 'a-m-search', htmlFor: sid }, icon('search', { size: 18 }),
        h('input', { id: sid, type: 'search', placeholder: 'Search accounts by name or reference', autocomplete: 'off', attrs: { 'aria-label': 'Search accounts by name or reference' } })),
      h('button', { type: 'button', class: 'a-m-iconbtn', attrs: { 'aria-label': 'Notifications' } }, icon('bell', { size: 19 })),
      h('button', { type: 'button', class: 'a-m-role', attrs: { 'aria-label': `Viewing as ${user.role}` } },
        h('span', { class: 'a-m-avatar', attrs: { 'aria-hidden': 'true' } }, ctx.fmt.initials(user.name)),
        h('span', { class: 'a-m-role-text' }, h('span', {}, 'Viewing as'), h('strong', {}, user.role)),
        icon('chevronDown', { size: 16 }))));
}

function deskShell(ctx, { active, eyebrow, title, cls }) {
  const { h } = ctx;
  const root = h('div', { class: ['a-m-root', 'a-m-desk', cls] });
  backdrop(ctx, root, [
    { x: '-12%', y: '-20%', s: '44%' }, // purple, top left, behind the sidebar
    { x: '30%', y: '40%', s: '40%' }, // blue, low centre
    { x: '62%', y: '-26%', s: '34%' }, // light blue, top right
  ]);
  const body = h('div', { class: 'a-m-body' });
  root.append(sidebar(ctx, active), h('div', { class: 'a-m-main' }, topBar(ctx, { eyebrow, title }), body));
  return { root, body };
}

// ============================================================================== dashboard pieces

/** "So far this month" against last month: a calm meter, never an alarm. */
function compareBits(ctx) {
  const { h, fmt, data } = ctx;
  const k = data.mba.kpis;
  const today = data.mba.today;
  const dayNo = Number(today.slice(8, 10));
  const left = daysInMonth(today) - dayNo;
  const pct = k.collectedLastMonth ? (k.collectedThisMonth / k.collectedLastMonth) * 100 : 0;
  const last = prevMonthName(today);
  return {
    range: `${monthShort(today)} 1–${dayNo}`,
    meter: h('div', { class: ['a-track', 'a-m-meter'], attrs: { 'aria-hidden': 'true' } },
      h('div', { class: 'a-fill', style: { width: `${Math.min(100, pct).toFixed(1)}%` } })),
    text: h('p', { class: 'a-m-compare-text' },
      h('strong', {}, `${Math.round(pct)}%`), ` of ${last}’s `, h('span', { class: 'a-num' }, fmt.php(k.collectedLastMonth)), ' total',
      left > 0 ? `, with ${left} day${left === 1 ? '' : 's'} to go` : ''),
  };
}

/**
 * Daily collections, drawn in with a glowing gradient line. With scrub:true a crosshair reads any
 * day (pointer, or arrow keys on the focusable slider). w is the plot's CSS width in px.
 */
function dailyChart(ctx, { w, h: hh, pad, scrub = false, peak = -1 }) {
  const { h, fx, fmt, data } = ctx;
  const days = data.mba.dailyCollected;
  const vals = days.map((d) => d.amount);
  const n = vals.length;
  const max = Math.max(1, ...vals);
  const step = (w - pad * 2) / Math.max(1, n - 1);
  const pt = (i) => [pad + i * step, hh - pad - (vals[i] / max) * (hh - pad * 2)];
  const pctX = (x) => `${((x / w) * 100).toFixed(3)}%`;
  const isToday = (i) => days[i].date === data.mba.today;
  const dayLabel = (i) => `${fmt.dayShort(days[i].date)}${isToday(i) ? ' (so far)' : ''}`;

  const svgEl = fx.areaChart({
    values: vals, w, h: hh, pad, className: 'a-m-area', stroke: '#8FD8FF', fillFrom: '#3D7BFF',
    label: `Daily collections, ${monthDay(days[0].date)} to ${monthDay(days[n - 1].date)}`,
  });
  const gid = nid('line');
  svgEl.querySelector('defs').append(fx.svg('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: w, y2: 0 },
    fx.svg('stop', { offset: '0%', 'stop-color': '#B89CFF' }),
    fx.svg('stop', { offset: '55%', 'stop-color': '#8FD8FF' }),
    fx.svg('stop', { offset: '100%', 'stop-color': '#64C8FF' })));
  svgEl.querySelector('.fx-area-line').setAttribute('stroke', `url(#${gid})`);
  svgEl.querySelector('defs linearGradient stop')?.setAttribute('stop-opacity', '0.6'); // a touch more body under the line
  fx.inView(svgEl, () => svgEl.classList.add('is-in'));

  const plot = h('div', { class: 'a-m-plot', style: { height: `${hh}px` } }, svgEl);
  if (peak >= 0) {
    const [x, y] = pt(peak);
    plot.append(h('span', { class: 'a-m-peak', style: { left: pctX(x), top: `${y}px` }, attrs: { 'aria-hidden': 'true' } }));
  }
  // weekly ticks, dropping any that would crowd the last ("Today") label (needs ~70px of room)
  const room = Math.ceil(70 / step);
  const ticks = [...new Set([0, 7, 14, 21].filter((i) => i <= n - 1 - room).concat(n - 1))];
  const axis = h('div', { class: 'a-m-axis', attrs: { 'aria-hidden': 'true' } },
    ticks.map((i) => h('span', { class: ['a-m-tick', i === 0 && 'is-first', i === n - 1 && 'is-last'], style: { left: pctX(pt(i)[0]) } },
      i === n - 1 && isToday(i) ? 'Today' : monthDay(days[i].date))));
  const box = h('div', { class: 'a-m-chart' }, plot, axis);
  if (!scrub) return box;

  const guide = h('span', { class: 'a-m-guide', attrs: { 'aria-hidden': 'true' } });
  const gdot = h('span', { class: 'a-m-gdot', attrs: { 'aria-hidden': 'true' } });
  const tipDay = h('span', { class: 'a-m-tip-day' });
  const tipAmt = h('strong', { class: 'a-m-tip-amt a-num' });
  const tip = h('span', { class: 'a-m-tip', attrs: { 'aria-hidden': 'true' } }, tipDay, tipAmt);
  let cur = n - 1;
  const text = (i) => `${dayLabel(i)}: ${fmt.php(vals[i])}`;
  const slider = h('div', {
    class: 'a-m-scrub', tabindex: 0,
    attrs: {
      role: 'slider', 'aria-label': 'Daily collections. Use the arrow keys to read each day.',
      'aria-valuemin': 1, 'aria-valuemax': n, 'aria-valuenow': n, 'aria-valuetext': text(n - 1),
    },
  });
  const show = (i) => {
    cur = Math.max(0, Math.min(n - 1, i));
    const [x, y] = pt(cur);
    box.classList.add('is-scrub');
    guide.style.left = pctX(x);
    gdot.style.left = pctX(x);
    gdot.style.top = `${y}px`;
    tipDay.textContent = dayLabel(cur);
    tipAmt.textContent = fmt.php(vals[cur]);
    // beside the point (left of it on the right half), kept inside the plot's height
    const right = x > w * 0.55;
    tip.classList.toggle('is-left', right);
    tip.style.left = pctX(x);
    tip.style.top = `${Math.max(-4, Math.min(hh - 38, y - 19))}px`;
    slider.setAttribute('aria-valuenow', String(cur + 1));
    slider.setAttribute('aria-valuetext', text(cur));
  };
  const hide = () => box.classList.remove('is-scrub');
  const fromPointer = (e) => {
    const r = plot.getBoundingClientRect();
    const own = plot.offsetWidth || w;
    const x = ((e.clientX - r.left) / (r.width / own)) * (w / own); // screen px → plot px → chart units
    show(Math.round((x - pad) / step));
  };
  slider.addEventListener('pointermove', fromPointer);
  slider.addEventListener('pointerdown', fromPointer);
  slider.addEventListener('pointerleave', () => { if (document.activeElement !== slider) hide(); });
  slider.addEventListener('focus', () => show(cur));
  slider.addEventListener('blur', hide);
  slider.addEventListener('keydown', (e) => {
    const move = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    if (move) { e.preventDefault(); show(cur + move); } else if (e.key === 'Home') { e.preventDefault(); show(0); } else if (e.key === 'End') { e.preventDefault(); show(n - 1); }
  });
  plot.append(guide, gdot, tip, slider);
  return box;
}

function heroCard(ctx) {
  const { h, fx, fmt, data } = ctx;
  const k = data.mba.kpis;
  const days = data.mba.dailyCollected;
  const vals = days.map((d) => d.amount);
  const best = vals.indexOf(Math.max(...vals));
  const cmp = compareBits(ctx);
  return card(ctx, { cls: 'a-m-hero', edge: true },
    h('div', { class: 'a-m-hero-top' },
      h('div', { class: 'a-m-hero-main' },
        h('div', { class: 'a-m-hero-label' }, h('h2', { class: 'a-label' }, 'Collected this month'), h('span', { class: ['a-pill', 'is-info'] }, `${cmp.range} so far`)),
        fx.money(k.collectedThisMonth, { delay: 120, duration: 1500, className: 'a-money a-m-hero-money' }),
        h('p', { class: 'a-m-hero-net' }, 'Net of fees ', h('strong', { class: 'a-num' }, fmt.php(k.collectedThisMonthNet)))),
      h('div', { class: 'a-m-best' },
        h('span', { class: 'a-m-best-label' }, h('i', { attrs: { 'aria-hidden': 'true' } }), 'Best day'),
        h('span', { class: 'a-m-best-day' }, fmt.dayShort(days[best].date)),
        h('strong', { class: 'a-num' }, fmt.php(vals[best])))),
    h('div', { class: 'a-m-compare' }, cmp.meter, cmp.text),
    dailyChart(ctx, { w: 738, h: 104, pad: 10, scrub: true, peak: best }));
}

function kpiCard(ctx, kind, { phone = false } = {}) {
  const { h, fx, icon, data } = ctx;
  const k = data.mba.kpis;
  const today = data.mba.today;
  const D = {
    arr: {
      label: 'Active arrangements', ic: 'arrangements', tone: 'info',
      value: () => fx.countUp(h('span', { class: 'a-m-kpi-num a-num' }), k.activeArrangements, { delay: 260, duration: 1200 }),
      sub: () => [h('strong', { class: 'a-m-up' }, `+${k.newArrangementsThisMonth}`), ' activated this month'],
    },
    due: {
      label: 'Due this week', ic: 'clock', tone: 'lilac',
      value: () => fx.money(k.dueThisWeek.amount, { delay: 330, duration: 1200, className: 'a-money a-m-kpi-money' }),
      sub: () => `${k.dueThisWeek.count} installments, ${monthDay(today)}–${monthDay(shiftDay(today, 6))}`,
    },
    over: {
      label: 'Overdue', ic: 'alert', tone: 'warn',
      value: () => fx.money(k.overdue.amount, { delay: 400, duration: 1200, className: 'a-money a-m-kpi-money' }),
      sub: () => [h('strong', { class: 'a-m-warn-text' }, String(k.overdue.count)), ' installments past due'],
    },
  }[kind];
  const el = card(ctx, { cls: ['a-m-kpi', `is-${D.tone}`, phone && 'is-phone'], lift: !phone },
    h('div', { class: 'a-m-kpi-head' },
      h('span', { class: 'a-m-tile', attrs: { 'aria-hidden': 'true' } }, icon(D.ic, { size: 16 })),
      h('h3', { class: 'a-m-kpi-label' }, D.label)),
    h('div', { class: 'a-m-kpi-value' }, D.value()),
    h('p', { class: 'a-m-kpi-sub' }, D.sub()));
  el.dataset.label = D.label;
  return el;
}

/** Method mix ring (all verified payments, by amount). Hover or focus a method to read it. */
function mixCard(ctx) {
  const { h, fx, fmt, data } = ctx;
  const rows = [...data.mba.methodMix].sort((a, b) => b.amount - a.amount || a.method.localeCompare(b.method));
  const payments = rows.reduce((s, m) => s + m.count, 0);
  const live = rows.filter((m) => m.amount > 0); // a 0% method gets no arc (it stays in the legend)
  const size = 100;
  const stroke = 12;
  const ring = fx.ring({
    parts: live.map((m) => ({ value: m.amount, className: toneOf(m.method) })), size, stroke, gap: 4, className: 'a-m-ring',
    label: `Method mix by amount: ${rows.map((m) => `${m.method} ${m.pct}%`).join(', ')}`,
  });
  ring.style.setProperty('--c', String(2 * Math.PI * ((size - stroke) / 2)));
  const segs = [...ring.querySelectorAll('.fx-ring-seg')];
  const cPct = h('strong', { class: 'a-num' });
  const cName = h('span');
  const detail = h('p', { class: 'a-m-mix-detail' });
  const btns = [];
  const pick = (m, dim) => {
    cPct.textContent = `${m.pct}%`;
    cName.textContent = m.method;
    detail.replaceChildren(h('strong', { class: 'a-num' }, fmt.php(m.amount)), ` · ${m.count} payment${m.count === 1 ? '' : 's'}`);
    ring.classList.toggle('has-pick', dim);
    segs.forEach((s, i) => s.classList.toggle('is-on', dim && live[i] === m));
    btns.forEach((b) => b.classList.toggle('is-on', dim && b.dataset.method === m.method));
  };
  const reset = () => pick(rows[0], false);
  segs.forEach((s, i) => s.addEventListener('pointerenter', () => pick(live[i], true)));
  ring.addEventListener('pointerleave', reset);
  const legend = h('ul', { class: 'a-m-legend' }, rows.map((m) => {
    const b = h('button', {
      type: 'button', class: ['a-m-legend-item', toneOf(m.method), !m.amount && 'is-zero'], dataset: { method: m.method },
      attrs: { 'aria-label': `${m.method}: ${m.pct}% of the amount, ${m.count} payments, ${fmt.php(m.amount)}` },
      on: { pointerenter: () => pick(m, true), pointerleave: reset, focus: () => pick(m, true), blur: reset },
    }, h('span', { class: 'a-m-swatch', attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'a-m-legend-name' }, m.method), h('span', { class: 'a-m-legend-pct a-num' }, `${m.pct}%`));
    btns.push(b);
    return h('li', {}, b);
  }));
  reset();
  return card(ctx, { cls: 'a-m-mix', lift: true },
    head(ctx, 'Method mix', `Share of the amount · all ${payments} verified payments`),
    h('div', { class: 'a-m-mix-body' },
      h('div', { class: 'a-m-ring-wrap' }, ring, h('div', { class: 'a-m-ring-center', attrs: { 'aria-hidden': 'true' } }, cPct, cName)),
      legend),
    detail);
}

function portfolioCard(ctx) {
  const { h, fmt, data } = ctx;
  const ps = data.mba.portfolios;
  const scale = Math.max(5, Math.ceil(Math.max(...ps.map((p) => p.pct)) / 5) * 5); // 0–15% for today's figures
  return card(ctx, { cls: 'a-m-port', lift: true },
    head(ctx, 'Portfolio recovery', 'Collected to date ÷ placed'),
    h('ul', { class: 'a-m-bars' }, ps.map((p) => h('li', { class: 'a-m-bar-row' },
      h('div', { class: 'a-m-bar-top' }, h('span', { class: 'a-m-bar-name' }, p.name), h('strong', { class: 'a-num' }, `${p.pct}%`)),
      h('div', { class: ['a-track', 'a-m-bar'], attrs: { 'aria-hidden': 'true' } }, h('div', { class: 'a-fill', style: { width: `${((p.pct / scale) * 100).toFixed(1)}%` } })),
      h('p', { class: 'a-m-bar-sub', attrs: { title: `${fmt.php(p.collected)} collected of ${fmt.php(p.placed)} placed` } },
        h('span', { attrs: { 'aria-hidden': 'true' } }, `${fmt.phpShort(p.collected)} of ${fmt.phpShort(p.placed)}`),
        h('span', { class: 'a-m-sr' }, `${fmt.php(p.collected)} collected of ${fmt.php(p.placed)} placed`))))),
    h('div', { class: 'a-m-scale', attrs: { 'aria-hidden': 'true' } }, h('span', {}, '0%'), h('span', {}, `${scale}%`)));
}

function agentsCard(ctx) {
  const { h, fmt, data } = ctx;
  const as = data.mba.agents;
  const top = Math.max(1, ...as.map((a) => a.collected));
  return card(ctx, { cls: 'a-m-agents', lift: true },
    head(ctx, 'Agents this month', 'Collected · payments'),
    h('ul', { class: 'a-m-bars' }, as.map((a) => h('li', { class: 'a-m-bar-row' },
      h('div', { class: 'a-m-bar-top' }, h('span', { class: 'a-m-bar-name' }, a.name), h('strong', { class: 'a-num' }, fmt.php(a.collected))),
      h('div', { class: ['a-track', 'a-m-bar', 'is-agent'], attrs: { 'aria-hidden': 'true' } }, h('div', { class: 'a-fill', style: { width: `${((a.collected / top) * 100).toFixed(1)}%` } })),
      h('p', { class: 'a-m-bar-sub' }, `${a.payments} payment${a.payments === 1 ? '' : 's'}`)))));
}

function attentionItems(ctx) {
  const k = ctx.data.mba.kpis;
  return [
    { n: k.pendingApproval, what: 'Awaiting approval', why: 'Arrangements need a supervisor’s sign-off', act: 'Review', aria: `Review the ${k.pendingApproval} arrangements awaiting approval`, primary: true, tone: 'lilac' },
    { n: k.exceptionsOpen, what: 'Reconciliation exceptions', why: 'Our records and the provider’s disagree', act: 'Open queue', aria: `Open the reconciliation queue, ${k.exceptionsOpen} exceptions open`, primary: false, tone: 'warn' },
  ];
}

function attentionCard(ctx) {
  const { h } = ctx;
  const items = attentionItems(ctx);
  return card(ctx, { cls: 'a-m-attn' },
    head(ctx, 'Needs attention', null, h('span', { class: 'a-pill' }, `${items.length} queues`)),
    h('ul', { class: 'a-m-attn-list' }, items.map((it) => h('li', { class: ['a-m-attn-item', `is-${it.tone}`] },
      h('span', { class: 'a-m-attn-n a-num' }, String(it.n)),
      h('div', { class: 'a-m-attn-text' }, h('strong', {}, it.what), h('span', {}, it.why)),
      h('button', { type: 'button', class: ['a-btn', it.primary ? 'a-btn-light' : 'a-btn-glass', 'a-m-btn-sm'], attrs: { 'aria-label': it.aria } }, it.act)))));
}

/** The newest verified payments, entering staggered. Replay re-runs the entrance; nothing is faked. */
function liveCard(ctx, { count = 8, phone = false } = {}) {
  const { h, fx, fmt, icon, data } = ctx;
  const list = data.mba.recentPayments.slice(0, count);
  const ol = h('ol', { class: 'a-m-live-list', attrs: { 'aria-label': `${list.length} newest verified payments` } },
    list.map((p, i) => h('li', { class: ['a-m-live-row', i === 0 && 'is-newest', i === 0 && 'a-edge'] },
      plate(ctx, p.method, { size: 'sm' }),
      h('div', { class: 'a-m-live-who' }, h('strong', {}, p.name), h('span', {}, phone ? stamp(ctx, p.paidAt) : p.ref)),
      h('div', { class: 'a-m-live-amt' }, h('strong', { class: 'a-num' }, fmt.php(p.amount)), phone ? null : h('span', {}, stamp(ctx, p.paidAt))))));
  fx.stagger(ol, ':scope > li', { step: 70, base: 280 });
  const replay = h('button', {
    type: 'button', class: ['a-m-chipbtn', phone && 'is-icon'], attrs: { 'aria-label': 'Replay the list' },
    on: { click: () => replayRise(ol) },
  }, icon('refresh', { size: 15 }), phone ? null : h('span', {}, 'Replay'));
  if (fx.reduced()) replay.hidden = true;
  return card(ctx, { cls: ['a-m-live', phone && 'is-phone'] },
    head(ctx, 'Live payments', 'Newest verified payments', replay), ol);
}

function renderDashboard(ctx) {
  const { h, fx } = ctx;
  const { root, body } = deskShell(ctx, { active: 'dashboard', eyebrow: 'Overview', title: 'Dashboard', cls: 'a-m-dash' });
  const hero = heroCard(ctx);
  const kpis = ['arr', 'due', 'over'].map((k) => kpiCard(ctx, k));
  const bottom = [mixCard(ctx), portfolioCard(ctx), agentsCard(ctx)];
  const attn = attentionCard(ctx);
  const live = liveCard(ctx);
  body.append(h('div', { class: 'a-m-dash-grid' },
    h('div', { class: 'a-m-dash-left' }, hero, kpis, h('div', { class: 'a-m-dash-bottom' }, bottom)),
    h('div', { class: 'a-m-dash-right' }, attn, live)));
  fx.stagger(body, '.a-m-card', { step: 60 });
  // Choreography: hero first, then the right column, then the figures and the detail cards.
  [hero, attn, live, ...kpis, ...bottom].forEach((el, i) => el.style.setProperty('--fx-i', String(i)));
  return root;
}

// ============================================================================== transactions

const FILTERS = ['all', 'paid', 'pending', 'initiated', 'failed', 'expired'];
const COLS = [['id', 'Transaction'], ['who', 'Borrower'], ['method', 'Method'], ['amt', 'Amount'], ['when', 'Started'], ['status', 'Status'], ['files', 'Attachments']];
const STEP_SR = { done: 'done', current: 'current step', todo: 'not reached yet', fail: 'stopped here' };

/** "Loan contract", "Signed agreement", … from the file name (the reference and extension removed). */
function docTitle(t, f) {
  const base = String(f.filename || '').replace(/\.[a-z0-9]+$/i, '').replace(t.ref, '').replace(/\s{2,}/g, ' ').trim();
  return base || f.label;
}

function fileChip(ctx, t, f, onOpen) {
  const { h, icon } = ctx;
  return h('button', {
    type: 'button', class: ['a-m-file', `is-${f.kind}`],
    attrs: { 'aria-label': `Preview ${f.label.toLowerCase()}${f.version > 1 ? ` version ${f.version}` : ''} for ${t.id}`, title: f.filename },
    on: { click: (e) => { e.stopPropagation(); onOpen(); } },
  }, h('span', { class: 'a-m-file-ic', attrs: { 'aria-hidden': 'true' } }, icon('file', { size: 13 })),
  h('span', { class: 'a-m-file-label' }, f.label),
  f.version > 1 ? h('span', { class: 'a-m-v' }, `v${f.version}`) : null);
}

/** A SAMPLE page: real title, borrower and reference, grey lines instead of legal text. */
function samplePage(ctx, t, f) {
  const { h, fmt } = ctx;
  const title = docTitle(t, f);
  const lines = f.kind === 'agreement' ? [100, 94, 98, 58, 0, 100, 90, 96, 44] : [100, 96, 100, 82, 0, 100, 92, 98, 66];
  return h('figure', { class: ['a-m-paper', `is-${f.kind}`] },
    h('div', {
      class: 'a-m-sheet',
      attrs: { role: 'img', 'aria-label': `Sample page of the ${title.toLowerCase()} for ${t.name}, reference ${t.ref}. Grey lines stand in for the legal text.` },
    },
    h('span', { class: 'a-m-sheet-wm' }, 'Sample'),
    h('div', { class: 'a-m-sheet-top' }, h('span', { class: 'a-m-sheet-tag' }, 'Sample'), h('span', {}, `Version ${f.version}`)),
    h('p', { class: 'a-m-sheet-title' }, title),
    h('div', { class: 'a-m-sheet-meta' },
      h('div', {}, h('span', {}, 'Borrower'), h('strong', {}, t.name)),
      h('div', {}, h('span', {}, 'Reference'), h('strong', {}, t.ref))),
    h('div', { class: 'a-m-sheet-lines' }, lines.map((wd) => (wd ? h('i', { style: { width: `${wd}%` } }) : h('b')))),
    h('div', { class: 'a-m-sheet-sign' },
      h('div', {}, h('i'), h('span', {}, 'Borrower signature')),
      // Same neutral wording as the demo's document viewer: the data doesn't say who signs for MBA.
      h('div', {}, h('i'), h('span', {}, f.kind === 'agreement' ? 'Prepared by, collections agent' : 'For the creditor')))),
    h('figcaption', { class: 'a-m-paper-cap' }, h('strong', {}, f.filename), h('span', {}, `Uploaded by ${f.uploader} · ${fmt.date(f.at)}`)));
}

/** The glass detail drawer: status timeline, amount, method, borrower and the attachments. */
function txnDrawer(ctx, root) {
  const { h, fx, fmt, icon, data, onCleanup } = ctx;
  const titleId = nid('dt');
  const idEl = h('h2', { class: 'a-m-dtitle a-num', id: titleId });
  const closeBtn = h('button', { type: 'button', class: ['a-m-iconbtn', 'a-m-close'], attrs: { 'aria-label': 'Close details' }, on: { click: () => close() } }, icon('x', { size: 20 }));
  const bodyEl = h('div', { class: 'a-m-dbody' });
  const panel = h('aside', {
    class: ['a-glass', 'a-edge', 'a-m-drawer'], tabindex: -1,
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
  }, h('header', { class: 'a-m-dhead' }, h('div', {}, h('p', { class: 'a-label' }, 'Transaction'), idEl), closeBtn), bodyEl);
  const scrim = h('div', { class: 'a-m-scrim', attrs: { 'aria-hidden': 'true' }, on: { click: () => close() } });
  let current = null;
  let lastFocus = null;
  let row = null;
  let stage = null;
  let prevBtns = [];
  let shown = null;
  let timer = 0;
  onCleanup(() => clearTimeout(timer));
  const smooth = () => (fx.reduced() ? 'auto' : 'smooth');

  const timeline = (t) => {
    const paidAt = data.mba.recentPayments.find((p) => p.txn === t.id)?.paidAt || null;
    const started = `Checkout started · ${fmt.dateTime(t.createdAt)}`;
    const steps = {
      paid: [['done', 'Initiated', started], ['done', 'Pending', 'Confirmed by the provider'], ['done', 'Paid', paidAt ? `Verified and posted · ${fmt.dateTime(paidAt)}` : 'Verified and posted']],
      pending: [['done', 'Initiated', started], ['current', 'Pending', 'Waiting for the provider’s confirmation'], ['todo', 'Paid', 'Posts once the provider confirms']],
      initiated: [['current', 'Initiated', started], ['todo', 'Pending', 'Begins when the borrower completes checkout'], ['todo', 'Paid', 'Not yet']],
      failed: [['done', 'Initiated', started], ['fail', 'Failed', 'No money taken; kept in history']],
      expired: [['done', 'Initiated', started], ['fail', 'Expired', 'The checkout timed out; no money taken']],
    }[t.status] || [['done', 'Initiated', started], ['current', statusOf(t.status).label, '']];
    const mark = { done: 'check', fail: 'x' };
    return h('section', { class: 'a-m-dsec' }, h('h3', { class: 'a-m-dsec-title' }, 'Status'),
      h('ol', { class: 'a-m-steps' }, steps.map(([st, title, sub], i) => h('li', { class: ['a-m-step', `is-${st}`], style: { '--i': i } },
        h('span', { class: 'a-m-step-dot', attrs: { 'aria-hidden': 'true' } }, mark[st] ? icon(mark[st], { size: 14 }) : null),
        h('div', { class: 'a-m-step-text' }, h('strong', {}, title, h('span', { class: 'a-m-sr' }, ` (${STEP_SR[st]})`)), sub ? h('span', {}, sub) : null)))));
  };

  const attachments = (t) => {
    const stageId = nid('pv');
    stage = h('div', { class: 'a-m-stage', id: stageId });
    prevBtns = [];
    const list = h('ul', { class: 'a-m-docs' }, t.files.map((f) => {
      const b = h('button', {
        type: 'button', class: 'a-m-chipbtn', dataset: { file: f.id },
        attrs: { 'aria-expanded': 'false', 'aria-controls': stageId, 'aria-label': `Preview the ${f.label.toLowerCase()}` },
        on: { click: () => { if (preview(f.id, { toggle: true })) scrollToStage(); } },
      }, icon('eye', { size: 15 }), h('span', {}, 'Preview'));
      prevBtns.push(b);
      return h('li', { class: ['a-m-doc', `is-${f.kind}`], dataset: { file: f.id } },
        h('span', { class: 'a-m-doc-ic', attrs: { 'aria-hidden': 'true' } }, icon('file', { size: 18 })),
        h('div', { class: 'a-m-doc-text' },
          h('strong', {}, f.label, h('span', { class: ['a-m-vtag', f.version > 1 && 'is-new'] }, `v${f.version}`)),
          h('span', { class: 'a-m-doc-name', attrs: { title: f.filename } }, f.filename),
          h('span', { class: 'a-m-doc-meta' }, `Uploaded by ${f.uploader} · ${fmt.date(f.at)}`)),
        b);
    }));
    return h('section', { class: 'a-m-dsec' },
      h('h3', { class: 'a-m-dsec-title' }, 'Attachments', h('span', {}, `${t.files.length} file${t.files.length === 1 ? '' : 's'}`)),
      t.files.length ? list : h('p', { class: 'a-m-doc-meta' }, 'No files on this arrangement yet.'),
      stage);
  };

  const build = (t) => {
    idEl.textContent = t.id;
    const st = statusOf(t.status);
    shown = null;
    bodyEl.replaceChildren(
      h('section', { class: ['a-m-dsum', `is-${st.tone}`] },
        h('div', { class: 'a-m-dsum-top' }, statusChip(ctx, t.status), h('span', {}, `Started ${fmt.dateTime(t.createdAt)}`)),
        fx.money(t.amount, { duration: 900, className: 'a-money a-m-dsum-money' }),
        h('div', { class: 'a-m-dsum-method' }, t.method ? plate(ctx, t.method, { label: true }) : null, h('span', {}, t.method ? `via ${t.method}` : 'No method chosen yet'))),
      h('dl', { class: 'a-m-dl' },
        h('div', {}, h('dt', {}, 'Borrower'), h('dd', {}, t.name)),
        h('div', {}, h('dt', {}, 'Account reference'), h('dd', { class: 'a-num' }, t.ref)),
        h('div', {}, h('dt', {}, 'Payment request'), h('dd', { class: 'a-num' }, t.requestId)),
        h('div', {}, h('dt', {}, 'Method'), h('dd', {}, t.method || 'Not chosen yet'))),
      timeline(t),
      attachments(t));
    bodyEl.scrollTop = 0;
  };

  /** Shows (or with toggle, hides) a file's sample page. Returns the file id now shown, or null. */
  const preview = (fileId, { toggle = false } = {}) => {
    if (!current) return null;
    const f = current.files.find((x) => x.id === fileId);
    if (!f) return null;
    if (toggle && shown === fileId) {
      shown = null;
      stage.replaceChildren();
    } else if (shown !== fileId) {
      shown = fileId;
      stage.replaceChildren(samplePage(ctx, current, f));
    }
    prevBtns.forEach((b) => {
      const on = b.dataset.file === shown;
      b.setAttribute('aria-expanded', String(on));
      b.classList.toggle('is-on', on);
      b.closest('.a-m-doc')?.classList.toggle('is-on', on);
    });
    return shown;
  };
  /** Scrolls the drawer so the attachments list and the open page are in view. */
  const scrollToStage = () => {
    const sec = stage?.parentElement;
    if (sec) bodyEl.scrollTo({ top: Math.max(0, sec.offsetTop - 8), behavior: smooth() });
  };

  function open(t, fileId, rowEl) {
    const wasOpen = panel.classList.contains('is-open');
    if (!wasOpen) {
      const a = document.activeElement;
      lastFocus = a && root.contains(a) && a !== root ? a : rowEl?.querySelector('.a-m-idbtn') || null;
    }
    if (row && row !== rowEl) row.classList.remove('is-selected', 'a-edge');
    row = rowEl;
    row?.classList.add('is-selected', 'a-edge');
    if (!current || current.id !== t.id || !wasOpen) { current = t; build(t); }
    panel.classList.add('is-open');
    scrim.classList.add('is-on');
    requestAnimationFrame(() => closeBtn.focus({ preventScroll: true }));
    clearTimeout(timer);
    if (fileId && preview(fileId)) timer = setTimeout(scrollToStage, wasOpen ? 0 : 380);
  }

  function close() {
    if (!panel.classList.contains('is-open')) return;
    clearTimeout(timer);
    panel.classList.remove('is-open');
    scrim.classList.remove('is-on');
    row?.classList.remove('is-selected', 'a-edge');
    row = null;
    if (lastFocus && root.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }

  const focusables = () => [...panel.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // the first Escape closes the drawer, not the full-screen viewer around it
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus({ preventScroll: true }); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus({ preventScroll: true }); }
  });
  return { scrim, panel, open, close };
}

function renderTransactions(ctx) {
  const { h, fx, fmt, icon, data } = ctx;
  const { root, body } = deskShell(ctx, { active: 'transactions', eyebrow: 'Collections', title: 'Transactions', cls: 'a-m-txn' });
  const s = data.mba.txnStats;
  const txns = data.mba.transactions;
  const drawer = txnDrawer(ctx, root);

  const stats = h('div', { class: 'a-m-stats' }, [
    { label: 'Verified payments', n: s.verified, tone: 'ok', ic: 'check', edge: true, sub: [h('strong', { class: 'a-num' }, fmt.php(s.verifiedGross)), ' gross, net of refunds'] },
    { label: 'Pending', n: s.pending, tone: 'warn', ic: 'clock', sub: 'Awaiting provider confirmation' },
    { label: 'Failed attempts', n: s.failed, tone: 'danger', ic: 'alert', sub: 'No money taken; kept in history' },
    { label: 'All attempts', n: s.total, tone: 'info', ic: 'transactions', sub: 'Every checkout attempt, newest first' },
  ].map((d, i) => card(ctx, { cls: ['a-m-stat', `is-${d.tone}`], edge: d.edge, lift: true },
    h('div', { class: 'a-m-stat-head' }, h('h2', { class: 'a-label' }, d.label), h('span', { class: 'a-m-tile', attrs: { 'aria-hidden': 'true' } }, icon(d.ic, { size: 16 }))),
    fx.countUp(h('p', { class: 'a-m-stat-num a-num' }), d.n, { delay: 140 + i * 80, duration: 1200 }),
    h('p', { class: 'a-m-stat-sub' }, d.sub))));

  // ---- the list
  const td = (key, ...kids) => h('div', { class: ['a-m-td', `a-m-c-${key}`], attrs: { role: 'cell' } }, ...kids);
  const rows = txns.map((t) => {
    const row = h('div', { class: 'a-m-tr', attrs: { role: 'row' }, dataset: { status: t.status } });
    const openIt = (fileId) => drawer.open(t, fileId, row);
    row.addEventListener('click', (e) => { if (!e.target.closest('button')) openIt(null); });
    row.append(
      td('id', h('button', { type: 'button', class: 'a-m-idbtn a-num', attrs: { 'aria-label': `Open details for ${t.id}` }, on: { click: () => openIt(null) } }, t.id),
        h('span', { class: 'a-m-small a-num' }, `for ${t.requestId}`)),
      td('who', h('strong', { class: 'a-m-name' }, t.name), h('span', { class: 'a-m-small a-num' }, t.ref)),
      td('method', t.method ? plate(ctx, t.method, { label: true }) : h('span', { class: 'a-m-small' }, 'Not chosen yet')),
      td('amt', h('strong', { class: 'a-num' }, fmt.php(t.amount))),
      td('when', h('span', {}, fmt.date(t.createdAt)), h('span', { class: 'a-m-small' }, fmt.time(t.createdAt))),
      td('status', statusChip(ctx, t.status)),
      td('files', t.files.length ? t.files.map((f) => fileChip(ctx, t, f, () => openIt(f.id))) : h('span', { class: 'a-m-small' }, 'No files')));
    return row;
  });
  const emptyMsg = h('span');
  const showAll = h('button', { type: 'button', class: 'a-m-chipbtn', on: { click: () => { state.status = 'all'; state.q = ''; search.value = ''; syncChips(); apply(); } } }, 'Show all');
  const empty = h('div', { class: 'a-m-empty', attrs: { role: 'row' }, hidden: true },
    h('div', { attrs: { role: 'cell' } }, icon('filter', { size: 22 }), h('strong', {}, 'Nothing to show'), emptyMsg, showAll));
  const tbody = h('div', { class: 'a-m-tbody', attrs: { role: 'rowgroup' } }, rows, empty);
  const table = h('div', { class: 'a-m-table', attrs: { role: 'table', 'aria-label': 'Transactions, newest first' } },
    h('div', { class: 'a-m-thead', attrs: { role: 'rowgroup' } },
      h('div', { class: ['a-m-tr', 'a-m-thr'], attrs: { role: 'row' } }, COLS.map(([key, label]) => h('div', { class: ['a-m-th', `a-m-c-${key}`], attrs: { role: 'columnheader' } },
        label, key === 'files' ? h('span', { class: 'a-m-new' }, 'New') : null)))),
    tbody);
  fx.stagger(tbody, '.a-m-tr', { step: 36, base: 280 });

  // ---- filters (client-side, for real) and search
  const state = { status: 'all', q: '' };
  const counts = Object.fromEntries(FILTERS.map((f) => [f, f === 'all' ? txns.length : txns.filter((t) => t.status === f).length]));
  const chips = FILTERS.map((f) => h('button', {
    type: 'button', class: ['a-m-seg-btn', f !== 'all' && `is-${statusOf(f).tone}`], dataset: { f },
    attrs: { 'aria-pressed': String(f === 'all') },
    on: { click: () => { state.status = f; syncChips(); apply(); } },
  }, f !== 'all' ? h('span', { class: 'a-m-seg-dot', attrs: { 'aria-hidden': 'true' } }) : null,
  f === 'all' ? 'All' : statusOf(f).label,
  h('span', { class: 'a-m-seg-n a-num' }, String(counts[f]))));
  const syncChips = () => chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.f === state.status)));
  const sid = nid('ts');
  const search = h('input', {
    id: sid, type: 'search', placeholder: 'Search ID, reference or name', autocomplete: 'off',
    attrs: { 'aria-label': 'Search the list' }, on: { input: (e) => { state.q = e.target.value; apply(); } },
  });
  const countEl = h('p', { class: 'a-m-count', attrs: { 'aria-live': 'polite' } });
  function apply({ animate = true } = {}) {
    const q = state.q.trim().toLowerCase();
    let shownN = 0;
    rows.forEach((r, i) => {
      const t = txns[i];
      const ok = (state.status === 'all' || t.status === state.status)
        && (!q || [t.id, t.name, t.ref, t.requestId, t.method].some((v) => String(v || '').toLowerCase().includes(q)));
      r.hidden = !ok;
      if (ok) { r.style.setProperty('--fx-i', String(shownN)); shownN += 1; }
    });
    if (animate && !fx.reduced()) {
      rows.forEach((r) => { r.style.setProperty('--fx-base', '0ms'); r.style.setProperty('--fx-step', '28ms'); r.classList.remove('fx-on'); });
      void tbody.offsetWidth; // restart the entrance for what's left
      rows.forEach((r) => { if (!r.hidden) r.classList.add('fx-on'); });
    }
    const lbl = state.status === 'all' ? '' : statusOf(state.status).label.toLowerCase();
    emptyMsg.textContent = q
      ? `Nothing in the ${txns.length} newest matches “${state.q.trim()}”${lbl ? ` with the status ${lbl}` : ''}.`
      : `No ${lbl} attempts among the ${txns.length} newest.`;
    empty.hidden = shownN > 0;
    countEl.replaceChildren(h('strong', { class: 'a-num' }, String(shownN)), ` of ${txns.length} newest · ${s.total} in all`);
  }
  apply({ animate: false });
  const tools = h('div', { class: 'a-m-tools' },
    h('div', { class: 'a-m-seg', attrs: { role: 'group', 'aria-label': 'Filter by status' } }, chips),
    h('div', { class: 'a-m-tools-side' }, countEl,
      h('label', { class: ['a-m-search', 'is-list'], htmlFor: sid }, icon('search', { size: 17 }), search)));

  body.append(h('div', { class: 'a-m-txn-body' }, stats,
    tools,
    card(ctx, { cls: 'a-m-tablecard' }, table, h('div', { class: 'a-m-tfade', attrs: { 'aria-hidden': 'true' } }))));
  fx.stagger(body, '.a-m-stat, .a-m-tools, .a-m-tablecard', { step: 70 });
  root.append(drawer.scrim, drawer.panel);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.panel.classList.contains('is-open')) { e.stopPropagation(); drawer.close(); } });
  return root;
}

// ============================================================================== phone

const DOCK = [['Home', 'dashboard'], ['Accounts', 'accounts'], ['Payments', 'transactions'], ['Recon', 'reconciliation'], ['More', 'menu']];

function phoneHero(ctx) {
  const { h, fx, fmt, data } = ctx;
  const k = data.mba.kpis;
  const cmp = compareBits(ctx);
  return card(ctx, { cls: 'a-m-phero', edge: true },
    h('div', { class: 'a-m-hero-label' }, h('h2', { class: 'a-label' }, 'Collected this month'), h('span', { class: ['a-pill', 'is-info'] }, `${cmp.range} so far`)),
    fx.money(k.collectedThisMonth, { delay: 160, duration: 1500, className: 'a-money a-m-phero-money' }),
    h('p', { class: 'a-m-hero-net' }, 'Net of fees ', h('strong', { class: 'a-num' }, fmt.php(k.collectedThisMonthNet))),
    dailyChart(ctx, { w: 332, h: 74, pad: 6 }),
    h('div', { class: 'a-m-compare' }, cmp.meter, cmp.text));
}

function phoneAttention(ctx) {
  const { h } = ctx;
  return h('section', { class: 'a-m-psec' }, h('h2', { class: 'a-m-ptitle' }, 'Needs attention'),
    h('div', { class: 'a-m-ptiles' }, attentionItems(ctx).map((it) => card(ctx, { cls: ['a-m-ptile', `is-${it.tone}`] },
      h('span', { class: 'a-m-attn-n a-num' }, String(it.n)),
      h('p', { class: 'a-m-ptile-text' }, h('strong', {}, it.what), h('span', {}, it.why)),
      h('button', { type: 'button', class: ['a-btn', it.primary ? 'a-btn-light' : 'a-btn-glass', 'a-m-btn-sm'], attrs: { 'aria-label': it.aria } }, it.act)))));
}

function renderPhone(ctx) {
  const { h, fx, fmt, icon, data } = ctx;
  const root = h('div', { class: ['a-m-root', 'a-m-phone'] });
  backdrop(ctx, root, [
    { x: '-34%', y: '-14%', s: '78%' }, // purple, top left
    { x: '34%', y: '34%', s: '70%' }, // blue, middle
    { x: '46%', y: '-22%', s: '58%' }, // light blue, top right
  ]);
  const user = data.mba.user;
  const header = h('header', { class: 'a-m-phead' },
    h('span', { class: ['a-m-avatar', 'is-lg'], attrs: { 'aria-hidden': 'true' } }, fmt.initials(user.name)),
    h('div', { class: 'a-m-phead-text' }, h('h1', {}, `${greeting(ctx)}, ${user.name}`), h('p', {}, `${fmt.dayShort(data.mba.today)} · as of ${fmt.time(data.mba.now)}`)),
    h('button', { type: 'button', class: 'a-m-iconbtn', attrs: { 'aria-label': 'Notifications' } }, icon('bell', { size: 20 })));

  // Key figures: a horizontal scroll-snap row with live position dots (the phone's signature).
  const cards = ['arr', 'due', 'over'].map((k) => kpiCard(ctx, k, { phone: true }));
  const row = h('div', { class: 'a-m-krow', attrs: { role: 'group', 'aria-label': 'Key figures, swipe for more' } }, cards);
  const dots = cards.map((c, i) => h('button', {
    type: 'button', class: ['a-m-pdot', i === 0 && 'is-on'], attrs: { 'aria-label': `Show ${c.dataset.label}`, 'aria-current': i === 0 ? 'true' : null },
    on: { click: () => row.scrollTo({ left: c.offsetLeft - cards[0].offsetLeft, behavior: fx.reduced() ? 'auto' : 'smooth' }) },
  }));
  let raf = 0;
  row.addEventListener('scroll', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const max = row.scrollWidth - row.clientWidth;
      const idx = row.scrollLeft >= max - 2 ? cards.length - 1 : Math.round(row.scrollLeft / (cards[1].offsetLeft - cards[0].offsetLeft || 1));
      dots.forEach((d, i) => { d.classList.toggle('is-on', i === idx); if (i === idx) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    });
  }, { passive: true });
  ctx.onCleanup(() => cancelAnimationFrame(raf));

  const scroller = h('div', { class: 'a-m-pscroll' },
    header,
    phoneHero(ctx),
    h('section', { class: 'a-m-psec', attrs: { 'aria-label': 'Key figures' } }, row, h('div', { class: 'a-m-pdots' }, dots)),
    phoneAttention(ctx),
    liveCard(ctx, { count: 5, phone: true }));
  fx.stagger(scroller, ':scope > *', { step: 80 });

  const k = data.mba.kpis;
  const dock = h('nav', { class: ['a-glass', 'a-m-dock'], attrs: { 'aria-label': 'Back office' } }, DOCK.map(([label, ic], i) => {
    const badge = label === 'Recon' && k.exceptionsOpen ? k.exceptionsOpen : 0;
    return h('button', {
      type: 'button', class: ['a-m-dock-item', i === 0 && 'is-active'],
      attrs: { 'aria-current': i === 0 ? 'page' : null, 'aria-label': badge ? `${label}, ${badge} exceptions open` : null },
    }, h('span', { class: 'a-m-dock-ic' }, icon(ic, { size: 21 }), badge ? h('span', { class: 'a-m-dock-badge', attrs: { 'aria-hidden': 'true' } }, String(badge)) : null),
    h('span', { class: 'a-m-dock-label' }, label));
  }));
  root.append(h('div', { class: 'a-m-pfade', attrs: { 'aria-hidden': 'true' } }), scroller, h('div', { class: 'a-m-pfade-b', attrs: { 'aria-hidden': 'true' } }), dock);
  return root;
}

// ============================================================================== exports

export const mbaDesktop = [
  {
    id: 'dashboard', title: 'Dashboard',
    caption: 'Figures count up and the chart draws in; hover the chart to read any day.',
    render: renderDashboard,
  },
  {
    id: 'transactions', title: 'Transactions',
    caption: 'Filter by status, then open a row or an attachment in the glass drawer.',
    render: renderTransactions,
  },
];

export const mbaPhone = [
  {
    id: 'dashboard-phone', title: 'Dashboard on a phone', statusBar: 'light',
    caption: 'Swipe the key figures; the month’s total counts up and its chart draws in.',
    render: renderPhone,
  },
];
