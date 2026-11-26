// Option B · Daylight: MBA back-office concept screens (2026-11-26).
// Desktop 1440×900: the Dashboard and Transactions. Phone 390×844: the dashboard.
// A light canvas, oversized editorial type, chunky white bento tiles and ONE vivid MBA-gradient
// hero per screen carrying the key number; dark ink pills, springy hovers, staggered entrances.
// Every figure comes from ctx.data; every amount goes through fmt.php / fmt.phpShort / fx.money.
// Signature interactions:
//   dashboard        scrub the hero's daily bars (pointer or arrow keys) to read any day
//   transactions     click a row: it opens in place with its status timeline, the payment facts
//                    and the attachment cards; Preview swaps a SAMPLE page thumbnail
//   dashboard-phone  pull the tab under the hero to reveal net, last month and the pace
// Local helpers only (no shared file touched): uid(), facts(), methodMark(), docTitle(), md().
import logoSvg from '../../assets/mba_logo.svg';

const LOGO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;
const TZ = 'Asia/Manila';
const AURORA = { colors: ['#64C8FF', '#8B5CF6', '#2457E6'], opacity: 0.5 };

let seq = 0;
/** Unique DOM id: several copies of a screen can be on the page at once (overview + viewer). */
const uid = (p) => `b-m-${p}-${++seq}`;

/** Sidebar grouping (presentation only; items, labels, icons and badges come from data.mba.nav). */
const NAV_GROUPS = [
  ['Overview', ['dashboard']],
  ['Clients', ['creditors', 'portfolios']],
  ['Collections', ['accounts', 'arrangements', 'requests', 'transactions']],
  ['Finance', ['reconciliation', 'reports', 'remittances']],
  ['System', ['settings']],
];

/** Attempt status → label and chip tone (labels as in the demo; text always shown). */
const STATUS = {
  paid: { label: 'Paid', tone: 'is-ok' },
  pending: { label: 'Pending', tone: 'is-warn' },
  initiated: { label: 'Initiated', tone: '' },
  failed: { label: 'Failed', tone: 'is-danger' },
  expired: { label: 'Expired session', tone: '' },
  cancelled: { label: 'Cancelled', tone: '' },
  refunded: { label: 'Refunded', tone: 'is-info' },
};
const statusOf = (s) => STATUS[s] || { label: s ? s[0].toUpperCase() + s.slice(1) : 'Unknown', tone: '' };
const FILTERS = [['all', 'All'], ['paid', 'Paid'], ['pending', 'Pending'], ['initiated', 'Initiated'], ['failed', 'Failed'], ['expired', 'Expired']];

// --------------------------------------------------------------------------------------------
// Small helpers

const noon = (isoDate) => new Date(`${String(isoDate).slice(0, 10)}T12:00:00+08:00`);
/** 'Nov 26' (PHT) from a date ('2026-11-26') or a timestamp. */
const md = (iso) => (String(iso).length > 10 ? new Date(iso) : noon(iso))
  .toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: TZ });
const slug = (s) => String(s).toLowerCase().replace(/[^a-z]+/g, '-');

/** Calendar labels derived from data.mba (no new figures): greeting, ranges, days left, pace. */
function facts(data) {
  const k = data.mba.kpis;
  const days = data.mba.dailyCollected;
  const t = noon(data.mba.today);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const hour = Number(new Date(data.mba.now).toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }));
  return {
    greet: hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening',
    range: `${md(days[0].date)}–${Number(days.at(-1).date.slice(8, 10))}`, // 'Nov 1–26'
    daysLeft: lastDay - Number(data.mba.today.slice(8, 10)), // 4
    lastMonth: new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }), // 'October'
    week: `${md(data.mba.today)} – ${md(new Date(t.getTime() + 6 * 864e5).toISOString())}`, // 'Nov 26 – Dec 2'
    pace: Math.round((k.collectedThisMonth / k.collectedLastMonth) * 100), // 88 (% of last month's total)
  };
}

/** White logo plate for a payment method (Online banking uses the bank icon, as the demo does). */
function methodMark(ctx, name, { small = false } = {}) {
  const { h, icon, data } = ctx;
  const m = data.methods.find((x) => x.name === name);
  const plate = h('span', { class: ['b-logo-plate', 'b-m-plate', small && 'is-sm'], attrs: { role: 'img', 'aria-label': name || 'No method yet' } });
  if (!m) plate.append(h('span', { class: 'b-m-plate-none' }, '—'));
  else if (m.icon) plate.append(icon(m.icon, { size: small ? 16 : 18 }));
  else m.marks.forEach((k) => plate.append(h('img', { src: k.src, alt: '' })));
  return plate;
}

function statusChip(ctx, status) {
  const st = statusOf(status);
  return ctx.h('span', { class: ['b-chip', 'b-m-st', st.tone] }, ctx.h('i', { attrs: { 'aria-hidden': 'true' } }), st.label);
}

/** 'Loan contract MBA-REF-2026-004603.pdf' → 'Loan contract' */
const docTitle = (f) => String(f.filename || '').replace(/\.pdf$/i, '').replace(/\s*MBA-REF-[\w-]+$/i, '').trim() || f.label;

function tileHead(ctx, title, sub, action) {
  const { h } = ctx;
  return h('div', { class: 'b-m-th' }, h('h3', {}, title), sub ? h('span', { class: 'b-m-th-sub' }, sub) : null, action || null);
}

// --------------------------------------------------------------------------------------------
// Desktop shell: floating white sidebar + header

function sidebar(ctx, active) {
  const { h, icon, data } = ctx;
  const byId = Object.fromEntries(data.mba.nav.map((n) => [n.id, n]));
  return h('aside', { class: 'b-m-side' },
    h('div', { class: 'b-m-brand' },
      h('img', { src: LOGO, alt: '' }),
      h('div', {}, h('strong', {}, 'MBA Consult'), h('span', {}, 'Collections back office'))),
    h('nav', { class: 'b-m-nav', attrs: { 'aria-label': 'Back office' } },
      NAV_GROUPS.map(([label, ids]) => h('div', { class: 'b-m-navgroup' },
        h('span', { class: 'b-m-navlabel' }, label),
        h('ul', { class: 'b-m-navlist' }, ids.map((id) => byId[id]).filter(Boolean).map((n) => {
          const on = n.id === active;
          return h('li', {}, h('button', {
            type: 'button', class: ['b-m-navitem', on && 'is-active'], attrs: { 'aria-current': on ? 'page' : null },
          },
          icon(n.icon, { size: 18 }),
          h('span', { class: 'b-m-navtext' }, n.label),
          n.badge ? h('span', { class: 'b-m-badge b-num' }, String(n.badge), h('span', { class: 'b-m-sr' }, ' waiting')) : null));
        }))))),
    h('div', { class: 'b-m-side-note' },
      icon('info', { size: 18 }),
      h('p', {}, h('strong', {}, 'Demo data only'), 'Every figure comes from the seeded demo.')));
}

function searchField(ctx, placeholder, onInput) {
  const { h, icon } = ctx;
  return h('label', { class: 'b-m-search' },
    icon('search', { size: 18 }),
    h('input', { type: 'search', placeholder, attrs: { 'aria-label': placeholder }, on: onInput ? { input: (e) => onInput(e.target.value) } : {} }));
}

function topbar(ctx, { kicker, title, sub, search = true, extra = null }) {
  const { h, icon, fmt, data } = ctx;
  const user = data.mba.user;
  return h('header', { class: 'b-m-top' },
    h('div', { class: 'b-m-hello' },
      h('span', { class: 'b-m-kicker' }, kicker),
      h('h2', { class: 'b-m-title' }, title),
      sub ? h('p', { class: 'b-m-sub' }, sub) : null),
    search ? searchField(ctx, 'Search accounts, TXN or reference') : null,
    extra,
    h('button', { type: 'button', class: 'b-m-icbtn', attrs: { 'aria-label': 'Notifications' } }, icon('bell', { size: 20 }), h('span', { class: 'b-m-dot', attrs: { 'aria-hidden': 'true' } })),
    h('button', { type: 'button', class: 'b-m-me', attrs: { 'aria-label': `Signed in as ${user.name}. Account menu` } },
      h('span', { class: 'b-m-me-ava', attrs: { 'aria-hidden': 'true' } }, fmt.initials(user.name)),
      h('span', {}, user.name),
      icon('chevronDown', { size: 16 })));
}

function shell(ctx, active, cls, ...main) {
  const { h } = ctx;
  return h('div', { class: ['b-m-desk', cls] },
    sidebar(ctx, active),
    h('div', { class: 'b-m-main' }, ...main));
}

// --------------------------------------------------------------------------------------------
// Shared tiles

/** "88% of October's total" meter on the hero (month-to-date framing, not an alarm). */
function pace(ctx, F, { foot = true } = {}) {
  const { h, fmt, data } = ctx;
  const k = data.mba.kpis;
  return h('div', { class: ['b-m-pace', !foot && 'is-compact'] },
    h('div', { class: 'b-m-pace-top' }, h('strong', { class: 'b-num' }, `${F.pace}%`), h('span', {}, `of ${F.lastMonth}’s total, so far`)),
    h('div', { class: 'b-m-pace-track', attrs: { role: 'img', 'aria-label': `${F.pace}% of ${F.lastMonth}’s full-month total collected so far, ${F.daysLeft} days to go` } },
      h('i', { style: { '--p': `${Math.min(100, F.pace)}%` } })),
    h('div', { class: 'b-m-pace-foot' },
      foot ? h('span', {}, `${F.lastMonth}: `, h('strong', { class: 'b-num' }, fmt.php(k.collectedLastMonth))) : h('span', {}, 'Month to date'),
      h('span', {}, `${F.daysLeft} days to go`)));
}

/** The dark ink "Needs attention" tile: approvals and reconciliation exceptions, with actions. */
function needsTile(ctx, { phone = false } = {}) {
  const { h, icon, data } = ctx;
  const k = data.mba.kpis;
  const row = (n, what, ic, btn) => h('div', { class: 'b-m-need-row' },
    h('p', { class: 'b-m-need-what' }, h('span', { class: 'b-m-need-ic', attrs: { 'aria-hidden': 'true' } }, icon(ic, { size: 16 })), what),
    h('div', { class: 'b-m-need-act' },
      h('strong', { class: 'b-m-need-n b-num' }, String(n)),
      h('button', { type: 'button', class: 'b-m-need-btn', attrs: { 'aria-label': `${btn}: ${n} ${what.toLowerCase()}` } }, btn, icon('arrowRight', { size: 16 }))));
  return h('section', { class: ['b-m-tile', 'b-m-need', phone && 'is-phone'], attrs: { 'aria-label': 'Needs attention' } },
    h('div', { class: 'b-m-need-head' },
      h('span', { class: 'b-m-need-pulse', attrs: { 'aria-hidden': 'true' } }),
      h('h3', {}, 'Needs attention')),
    row(k.pendingApproval, 'Arrangements awaiting approval', 'arrangements', 'Review'),
    row(k.exceptionsOpen, 'Reconciliation exceptions', 'reconciliation', 'Open queue'));
}

function kpiTiles(ctx, F, { phone = false } = {}) {
  const { h, fx, fmt, icon, data } = ctx;
  const k = data.mba.kpis;
  const tile = (cls, label, ic, value, sub) => h('section', { class: ['b-m-tile', 'b-card', 'b-m-kpi', cls], attrs: { 'aria-label': label } },
    phone
      ? h('span', { class: 'b-m-kpi-ic' }, icon(ic, { size: 18 }))
      : h('div', { class: 'b-m-kpi-top' }, h('span', { class: 'b-m-kpi-label' }, label), h('span', { class: 'b-m-kpi-ic' }, icon(ic, { size: 18 }))),
    phone ? h('span', { class: 'b-m-kpi-label' }, label) : null,
    value,
    h('div', { class: 'b-m-kpi-sub' }, sub));
  const active = h('span', { class: 'b-m-kpi-val b-num' });
  fx.countUp(active, k.activeArrangements, { duration: 1100, delay: 220 });
  const tiles = [
    tile('is-a', 'Active arrangements', 'arrangements', active,
      h('span', { class: 'b-chip is-ok' }, `+${k.newArrangementsThisMonth} this month`)),
    tile('is-b', 'Due this week', 'clock', fx.money(k.dueThisWeek.amount, { className: 'b-money b-m-kpi-val', delay: 280 }),
      h('span', {}, phone ? `${k.dueThisWeek.count} installments` : `${k.dueThisWeek.count} installments · ${F.week}`)),
    tile('is-c is-warn', 'Overdue', 'alert', fx.money(k.overdue.amount, { className: 'b-money b-m-kpi-val', delay: 340 }),
      h('span', { class: 'b-chip is-warn' }, `${k.overdue.count} installments`)),
  ];
  if (phone) {
    const today = data.mba.dailyCollected.at(-1); // the demo's "today" (Nov 26), month-to-date list's last day
    tiles.push(tile('is-d', 'Collected today', 'transactions', fx.money(today.amount, { className: 'b-money b-m-kpi-val', delay: 400 }),
      h('span', {}, `So far · ${fmt.dayShort(today.date)}`)));
  }
  return tiles;
}

function payRow(ctx, p) {
  const { h, fmt } = ctx;
  return h('li', { class: 'b-m-pay' },
    methodMark(ctx, p.method),
    h('div', { class: 'b-m-pay-who' }, h('strong', {}, p.name), h('span', { class: 'b-num' }, p.txn)),
    h('div', { class: 'b-m-pay-amt' }, h('strong', { class: 'b-num' }, fmt.php(p.amount)), h('span', { class: 'b-num' }, `${md(p.paidAt)}, ${fmt.time(p.paidAt)}`)));
}

function recentTile(ctx, count, { phone = false } = {}) {
  const { h, fx, icon, data } = ctx;
  const list = h('ul', { class: 'b-m-pays' }, data.mba.recentPayments.slice(0, count).map((p) => payRow(ctx, p)));
  fx.stagger(list, ':scope > li', { step: 55, base: phone ? 260 : 460 });
  return h('section', { class: ['b-m-tile', 'b-card', 'b-m-recent', phone && 'is-phone'], attrs: { 'aria-label': 'Recent payments' } },
    tileHead(ctx, 'Recent payments', null,
      h('button', { type: 'button', class: 'b-m-link' }, phone ? 'See all' : 'View all', icon('chevronRight', { size: 16 }))),
    list);
}

// --------------------------------------------------------------------------------------------
// Dashboard tiles (desktop)

/** Rounded white bars for Nov 1–26 with a scrub readout (pointer or arrow keys). */
function scrubBars(ctx, { w, h: bh, gap, radius }) {
  const { h, fx, fmt, data } = ctx;
  const days = data.mba.dailyCollected;
  const values = days.map((d) => d.amount);
  const n = values.length;
  const maxIdx = values.indexOf(Math.max(...values));
  const bw = (w - gap * (n - 1)) / n;
  const cx = (i) => i * (bw + gap) + bw / 2;
  const chart = fx.barChart({ values, w, h: bh, gap, radius, className: 'b-m-bars' });
  chart.setAttribute('width', String(w));
  chart.setAttribute('height', String(bh));
  chart.setAttribute('aria-hidden', 'true');
  chart.removeAttribute('role');
  const rects = [...chart.querySelectorAll('.fx-bar')];
  const tipK = h('span', { class: 'b-m-tip-k' });
  const tipDay = h('strong');
  const tipAmt = h('span', { class: 'b-num' });
  const tip = h('div', { class: 'b-m-tip', attrs: { 'aria-hidden': 'true' } }, tipK, tipDay, tipAmt);
  const caret = h('span', { class: 'b-m-tip-caret', attrs: { 'aria-hidden': 'true' } });
  const ticks = [0, 7, 14, 21, n - 1].filter((i, j, a) => i < n && a.indexOf(i) === j);
  const axis = h('div', { class: 'b-m-axis', attrs: { 'aria-hidden': 'true' } }, ticks.map((i) => h('span', {
    class: [i === 0 && 'is-first', i === n - 1 && 'is-last'], style: { left: `${cx(i).toFixed(1)}px` },
  }, md(days[i].date))));
  const wrap = h('div', {
    class: 'b-m-scrub',
    attrs: { tabindex: '0', role: 'slider', 'aria-label': `Daily collections, ${md(days[0].date)} to ${md(days[n - 1].date)}. Use the arrow keys to read each day`, 'aria-valuemin': '1', 'aria-valuemax': String(n) },
  }, tip, caret, chart, axis);
  let cur = maxIdx;
  const show = (i, idle = false) => {
    cur = i;
    rects.forEach((r, j) => r.classList.toggle('is-hot', !idle && j === i));
    wrap.classList.toggle('is-scrub', !idle);
    const d = days[i];
    tipK.textContent = i === maxIdx ? 'Best day' : d.date === data.mba.today ? 'Today so far' : 'Collected';
    tipDay.textContent = fmt.dayShort(d.date);
    tipAmt.textContent = fmt.php(d.amount);
    const tw = tip.offsetWidth || 230;
    tip.style.left = `${Math.max(tw / 2, Math.min(w - tw / 2, cx(i))).toFixed(1)}px`;
    caret.style.left = `${cx(i).toFixed(1)}px`;
    wrap.setAttribute('aria-valuenow', String(i + 1));
    wrap.setAttribute('aria-valuetext', `${fmt.dayShort(d.date)}: ${fmt.php(d.amount)}`);
  };
  const at = (e) => {
    const r = chart.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
  };
  wrap.addEventListener('pointermove', (e) => show(at(e)));
  wrap.addEventListener('pointerdown', (e) => show(at(e)));
  wrap.addEventListener('pointerleave', () => show(maxIdx, true));
  wrap.addEventListener('blur', () => show(maxIdx, true));
  wrap.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
    let i;
    if (step) i = Math.max(0, Math.min(n - 1, cur + step));
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else return;
    e.preventDefault();
    show(i);
  });
  show(maxIdx, true);
  // Re-measure the readout once the screen is laid out (it is built detached).
  requestAnimationFrame(() => { if (wrap.isConnected) show(maxIdx, true); });
  return wrap;
}

function heroDesk(ctx, F) {
  const { h, fx, fmt, data } = ctx;
  const k = data.mba.kpis;
  const hero = h('section', { class: 'b-hero b-m-hero', attrs: { 'aria-label': 'Collected this month' } },
    h('div', { class: 'b-m-hero-head' },
      h('div', { class: 'b-m-hero-main' },
        h('div', { class: 'b-m-hero-eyebrow' }, h('span', {}, 'Collected this month'), h('span', { class: 'b-chip b-chip-on-hero' }, `So far · ${F.range}`)),
        fx.money(k.collectedThisMonth, { className: 'b-money b-m-hero-num', duration: 1600, delay: 200 }),
        h('p', { class: 'b-m-hero-net' }, 'Net of fees ', h('strong', { class: 'b-num' }, fmt.php(k.collectedThisMonthNet)))),
      pace(ctx, F)),
    scrubBars(ctx, { w: 744, h: 64, gap: 8, radius: 8 }));
  fx.aurora(hero, { ...AURORA, seed: 4 });
  return hero;
}

function agentsTile(ctx) {
  const { h, fmt, data } = ctx;
  const agents = data.mba.agents;
  return h('section', { class: 'b-m-tile b-card b-m-agents', attrs: { 'aria-label': 'Agents this month' } },
    tileHead(ctx, 'Agents this month', `Collected and payments, ${md(data.mba.today).split(' ')[0]} to date`),
    h('ul', { class: 'b-m-agent-row' }, agents.map((a, i) => h('li', { class: 'b-m-agent' },
      h('span', { class: ['b-m-ava', `is-${i % 4}`], attrs: { 'aria-hidden': 'true' } }, fmt.initials(a.name)),
      h('strong', { class: 'b-m-agent-name' }, a.name),
      h('span', { class: 'b-m-agent-amt b-num' }, fmt.php(a.collected)),
      h('span', { class: 'b-m-agent-sub' }, `${a.payments} payments`)))));
}

function methodTile(ctx) {
  const { h, data } = ctx;
  const mix = data.mba.methodMix;
  return h('section', { class: 'b-m-tile b-card b-m-mix', attrs: { 'aria-label': 'Method mix' } },
    tileHead(ctx, 'Method mix', 'By amount'),
    h('p', { class: 'b-m-mix-note' }, `All ${data.mba.txnStats.verified} verified payments`),
    h('div', { class: 'b-m-mix-bar', attrs: { role: 'img', 'aria-label': `Share of amount by method: ${mix.map((m) => `${m.method} ${m.pct}%`).join(', ')}` } },
      mix.filter((m) => m.pct > 0).map((m, i) => h('span', { class: 'b-m-mix-seg', dataset: { m: slug(m.method) }, style: { flexGrow: String(m.pct), '--b-i': String(i) } }))),
    h('ul', { class: 'b-m-mix-list' }, mix.map((m) => {
      const plate = methodMark(ctx, m.method, { small: true });
      plate.append(h('i', { class: 'b-m-mix-dot', dataset: { m: slug(m.method) }, attrs: { 'aria-hidden': 'true' } }));
      return h('li', { class: ['b-m-mix-item', !m.pct && 'is-zero'] },
        plate,
        h('span', { class: 'b-m-mix-name' }, m.method),
        h('strong', { class: 'b-m-mix-pct b-num' }, `${m.pct}%`));
    })));
}

function portfolioTile(ctx) {
  const { h, fmt, data } = ctx;
  const list = data.mba.portfolios;
  const scale = Math.max(10, Math.ceil(Math.max(...list.map((p) => p.pct)) / 10) * 10); // 20 → bars on a 0–20% scale (labelled)
  return h('section', { class: 'b-m-tile b-card b-m-pf', attrs: { 'aria-label': 'Portfolio recovery' } },
    tileHead(ctx, 'Portfolio recovery', `Collected ÷ placed · bars to ${scale}%`),
    h('ul', { class: 'b-m-pf-list' }, list.map((p, i) => h('li', { class: 'b-m-pf-item' },
      h('span', { class: 'b-m-pf-name' }, p.name),
      h('strong', { class: 'b-m-pf-pct b-num' }, `${p.pct}%`),
      h('span', { class: 'b-m-pf-bar', attrs: { role: 'img', 'aria-label': `${p.name}: ${p.pct}% recovered, ${fmt.php(p.collected)} of ${fmt.php(p.placed)} placed` } },
        h('i', { style: { '--p': String(Math.min(100, (p.pct / scale) * 100)), '--b-i': String(i) } })),
      h('span', { class: 'b-m-pf-amt b-num' }, `${fmt.phpShort(p.collected)} of ${fmt.phpShort(p.placed)}`)))));
}

function renderDashboard(ctx) {
  const { h, fx, fmt, data } = ctx;
  const F = facts(data);
  const bento = h('div', { class: 'b-m-bento' },
    heroDesk(ctx, F),
    needsTile(ctx),
    ...kpiTiles(ctx, F),
    agentsTile(ctx),
    methodTile(ctx),
    portfolioTile(ctx),
    recentTile(ctx, 8));
  fx.stagger(bento, ':scope > *', { step: 70, base: 60 });
  return shell(ctx, 'dashboard', 'is-dash',
    topbar(ctx, { kicker: fmt.dayShort(data.mba.today), title: `${F.greet}, ${data.mba.user.name}` }),
    bento);
}

// --------------------------------------------------------------------------------------------
// Transactions (desktop)

function timelineSteps(ctx, t, paidAt) {
  const { fmt } = ctx;
  const at = (iso) => (iso ? `${fmt.dayShort(iso)}, ${fmt.time(iso)}` : null);
  const init = { title: 'Initiated', detail: 'Checkout session created', at: at(t.createdAt), state: 'done' };
  const pend = { title: 'Pending', detail: 'At the payment provider', state: 'done' };
  const paid = { title: 'Paid', detail: 'Posts once the provider confirms', state: 'next' };
  switch (t.status) {
    case 'initiated': return [{ ...init, state: 'now' }, { ...pend, detail: 'When the borrower reaches the provider', state: 'next' }, paid];
    case 'pending': return [init, { ...pend, detail: 'Waiting for the provider’s confirmation', state: 'now', tone: 'warn' }, paid];
    case 'paid': return [init, pend, { title: 'Paid', detail: `Verified and posted · ${fmt.php(t.amount)}`, at: at(paidAt), state: 'ok' }];
    case 'failed': return [init, pend, { title: 'Failed', detail: 'Payment not completed · no money taken', state: 'bad' }];
    case 'expired': return [init, { title: 'Expired session', detail: 'Expired before payment', state: 'muted' }];
    default: return [init, { title: statusOf(t.status).label, detail: '', state: 'muted' }];
  }
}

/** A SAMPLE page: title, borrower, reference, grey lines instead of legal text. */
function docPage(ctx, t, f) {
  const { h, fx } = ctx;
  const title = docTitle(f);
  const agreement = f.kind === 'agreement';
  const lines = agreement ? [100, 93, 97, 70] : [100, 92, 97, 86, 100, 64];
  let end;
  if (agreement) {
    const path = fx.svg('path', { d: 'M3 25c7-13 12-19 16-13s-5 15 3 11 9-17 15-13-2 13 6 9 9-11 15-9 6 6 12 2', fill: 'none', stroke: '#1E2A6B', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    fx.drawPath(path, { duration: 1100, delay: 260 });
    end = h('div', { class: 'b-m-page-sign' }, fx.svg('svg', { viewBox: '0 0 76 32', width: 76, height: 32, 'aria-hidden': 'true' }, path), h('span', {}, 'Signature'));
  } else {
    end = h('div', { class: 'b-m-page-box', attrs: { 'aria-hidden': 'true' } }, h('i'), h('i'));
  }
  return h('div', { class: ['b-m-page', `is-${f.kind}`], attrs: { role: 'img', 'aria-label': `Sample page: ${title}, ${t.name}, ${t.ref}` } },
    h('div', { class: 'b-m-page-top' }, h('span', { class: 'b-m-page-mark' }), h('span', { class: 'b-m-page-stamp' }, 'Sample')),
    h('span', { class: 'b-m-page-title' }, title),
    h('span', { class: 'b-m-page-who' }, t.name),
    h('span', { class: 'b-m-page-ref b-num' }, t.ref),
    h('span', { class: 'b-m-page-lines', attrs: { 'aria-hidden': 'true' } }, lines.map((w) => h('i', { style: { width: `${w}%` } }))),
    end);
}

function txnRow(ctx, t, { paidAt, onOpen }) {
  const { h, icon, fmt } = ctx;
  const st = statusOf(t.status);
  const panelId = uid('txn');
  let built = false;
  let shown = null;
  const pvBtns = new Map();
  const cards = new Map();
  const stage = h('div', { class: 'b-m-stage' });
  const inner = h('div', { class: 'b-m-trow-in' });
  const more = h('div', { class: 'b-m-trow-more', id: panelId, attrs: { role: 'region', 'aria-label': `${t.id} details`, inert: '' } }, inner);

  const showDoc = (fid) => {
    shown = fid;
    pvBtns.forEach((b, id) => b.setAttribute('aria-pressed', String(id === fid)));
    cards.forEach((c, id) => c.classList.toggle('is-on', id === fid));
    chips.forEach((c) => c.classList.toggle('is-on', api.isOpen() && c.dataset.fid === fid));
    const f = t.files.find((x) => x.id === fid);
    stage.classList.toggle('is-empty', !f);
    stage.replaceChildren(
      f ? docPage(ctx, t, f) : h('div', { class: 'b-m-page-empty' }, icon('eye', { size: 20 }), h('span', {}, 'Choose Preview to see a sample page')),
      h('span', { class: 'b-m-stage-cap' }, f ? 'Sample page, not the real file' : ' '));
  };

  const build = () => {
    built = true;
    const steps = timelineSteps(ctx, t, paidAt);
    const timeline = h('section', { class: 'b-m-tl-wrap', style: { '--b-j': '0' } },
      h('h4', { class: 'b-m-dh' }, 'Status timeline'),
      h('ol', { class: 'b-m-tl' }, steps.map((s) => h('li', { class: ['b-m-tl-step', `is-${s.state}`, s.tone && `is-${s.tone}`] },
        h('span', { class: 'b-m-tl-dot', attrs: { 'aria-hidden': 'true' } },
          s.state === 'done' || s.state === 'ok' ? icon('check', { size: 13 }) : s.state === 'bad' ? icon('x', { size: 13 }) : null),
        h('div', { class: 'b-m-tl-txt' },
          h('strong', {}, s.title, h('span', { class: 'b-m-sr' }, s.state === 'next' ? ' (not yet)' : s.state === 'now' ? ' (current)' : '')),
          s.detail ? h('span', {}, s.detail) : null,
          s.at ? h('time', {}, s.at) : null)))));
    const factsEl = h('section', { class: 'b-m-facts-wrap', style: { '--b-j': '1' } },
      h('h4', { class: 'b-m-dh' }, 'Payment'),
      h('dl', { class: 'b-m-facts' },
        h('div', {}, h('dt', {}, 'Amount'), h('dd', { class: 'is-amt b-num' }, fmt.php(t.amount))),
        h('div', {}, h('dt', {}, 'Method'), h('dd', {}, methodMark(ctx, t.method, { small: true }), t.method || 'Not chosen yet')),
        h('div', {}, h('dt', {}, 'Borrower'), h('dd', { class: 'is-two' }, t.name, h('small', { class: 'b-num' }, t.ref))),
        h('div', {}, h('dt', {}, 'Request'), h('dd', { class: 'is-two' }, h('span', { class: 'b-num' }, t.requestId), h('small', {}, 'Payment request')))));
    const docs = h('section', { class: 'b-m-docs', style: { '--b-j': '2' } },
      h('h4', { class: 'b-m-dh' }, `Attachments · ${t.files.length}`),
      t.files.map((f) => {
        const pv = h('button', {
          type: 'button', class: 'b-m-pv', attrs: { 'aria-pressed': 'false', 'aria-label': `Preview ${f.label}` },
          on: { click: () => showDoc(shown === f.id ? null : f.id) },
        }, icon('eye', { size: 16 }), 'Preview');
        pvBtns.set(f.id, pv);
        const card = h('div', { class: ['b-m-doc', `is-${f.kind}`] },
          h('span', { class: 'b-m-doc-ic', attrs: { 'aria-hidden': 'true' } }, icon('file', { size: 20 })),
          h('div', { class: 'b-m-doc-txt' },
            h('strong', {}, f.label, f.version > 1 ? h('span', { class: 'b-m-v' }, `v${f.version}`) : null),
            h('span', { class: 'b-m-doc-file', attrs: { title: f.filename } }, f.filename),
            h('span', { class: 'b-m-doc-meta' }, `${f.uploader} · ${fmt.date(f.at)}`)),
          pv);
        cards.set(f.id, card);
        return card;
      }),
      h('p', { class: 'b-m-doc-note' }, 'The borrower’s own contract and signed agreement, from the arrangement.'));
    stage.style.setProperty('--b-j', '3');
    inner.append(h('div', { class: 'b-m-tdetail' }, timeline, factsEl, docs, h('section', { class: 'b-m-stage-wrap', style: { '--b-j': '3' } }, h('h4', { class: 'b-m-dh' }, 'Preview'), stage)));
  };

  const hit = h('button', {
    type: 'button', class: 'b-m-trow-hit',
    attrs: { 'aria-expanded': 'false', 'aria-controls': panelId, 'aria-label': `${t.id}, ${t.name}, ${fmt.php(t.amount)}, ${st.label}. Show the timeline and attachments` },
  });
  const chips = t.files.map((f) => h('button', {
    type: 'button', class: ['b-m-dchip', `is-${f.kind}`], dataset: { fid: f.id },
    attrs: { 'aria-label': `Preview ${f.label}${f.version > 1 ? `, version ${f.version}` : ''} for ${t.id}` },
    on: { click: () => api.open(f.id, true) },
  }, h('span', { class: 'b-m-dchip-ic', attrs: { 'aria-hidden': 'true' } }, icon('file', { size: 14 })), h('span', {}, f.label),
  f.version > 1 ? h('span', { class: 'b-m-v' }, `v${f.version}`) : null));
  const sum = h('div', { class: 'b-m-trow-sum' },
    hit,
    h('div', { class: 'b-m-c-id' }, h('strong', { class: 'b-num' }, t.id), h('span', {}, 'for ', h('span', { class: 'b-num' }, t.requestId))),
    h('div', { class: 'b-m-c-who' }, h('strong', {}, t.name), h('span', { class: 'b-num' }, t.ref)),
    h('div', { class: 'b-m-c-method' }, methodMark(ctx, t.method)),
    h('div', { class: 'b-m-c-amt b-num' }, fmt.php(t.amount)),
    h('div', { class: 'b-m-c-time' }, h('strong', {}, fmt.dayShort(t.createdAt)), h('span', { class: 'b-num' }, fmt.time(t.createdAt))),
    h('div', { class: 'b-m-c-st' }, statusChip(ctx, t.status)),
    h('div', { class: 'b-m-c-docs' }, chips),
    h('span', { class: 'b-m-c-chev', attrs: { 'aria-hidden': 'true' } }, icon('chevronDown', { size: 18 })));
  const el = h('li', { class: 'b-m-trow', dataset: { status: t.status } }, sum, more);

  const api = {
    el, t,
    isOpen: () => el.classList.contains('is-open'),
    open(fid = null, fromUser = true) {
      if (!built) build();
      const wasOpen = api.isOpen();
      el.classList.add('is-open');
      hit.setAttribute('aria-expanded', 'true');
      more.inert = false;
      if (fid || !wasOpen) showDoc(fid || t.files[0]?.id || null);
      onOpen(api, fromUser);
    },
    close() {
      el.classList.remove('is-open');
      hit.setAttribute('aria-expanded', 'false');
      more.inert = true;
      chips.forEach((c) => c.classList.remove('is-on'));
    },
  };
  hit.addEventListener('click', () => (api.isOpen() ? api.close() : api.open(null, true)));
  return api;
}

function renderTransactions(ctx) {
  const { h, fx, icon, data, onCleanup } = ctx;
  const S = data.mba.txnStats;
  const rows = data.mba.transactions;
  const paidAt = Object.fromEntries(data.mba.recentPayments.map((p) => [p.txn, p.paidAt]));
  let filter = 'all';
  let query = '';
  let touched = false;

  // ---- stats: the vivid hero carries the verified figure; three white tiles beside it
  const nVerified = h('span', { class: 'b-m-thero-n b-num' });
  fx.countUp(nVerified, S.verified, { duration: 1300, delay: 150 });
  const hero = h('section', { class: 'b-hero b-m-thero', attrs: { 'aria-label': 'Verified payments' } },
    h('div', { class: 'b-m-thero-l' },
      h('span', { class: 'b-m-hero-eyebrow' }, 'Verified payments'),
      h('div', { class: 'b-m-thero-big' }, nVerified, h('span', {}, 'verified'))),
    h('div', { class: 'b-m-thero-r' },
      fx.money(S.verifiedGross, { className: 'b-money b-m-thero-amt', duration: 1500, delay: 250 }),
      h('span', { class: 'b-m-thero-sub' }, 'gross, net of refunds'),
      h('span', { class: 'b-chip b-chip-on-hero' }, `from ${S.total} attempts`)));
  fx.aurora(hero, { ...AURORA, seed: 7 });
  const stat = (cls, label, n, sub, ic) => {
    const v = h('span', { class: 'b-m-stat-n b-num' });
    fx.countUp(v, n, { duration: 1000, delay: 260 });
    return h('section', { class: ['b-m-tile', 'b-card', 'b-m-stat', cls], attrs: { 'aria-label': label } },
      h('div', { class: 'b-m-kpi-top' }, h('span', { class: 'b-m-kpi-label' }, label), h('span', { class: 'b-m-kpi-ic' }, icon(ic, { size: 18 }))),
      v, h('span', { class: 'b-m-stat-sub' }, sub));
  };
  const stats = h('div', { class: 'b-m-tstats' },
    hero,
    stat('is-warn', 'Pending', S.pending, 'Waiting for the provider to confirm', 'clock'),
    stat('is-danger', 'Failed', S.failed, 'No money taken; kept in history', 'alert'),
    stat('', 'Attempts', S.total, 'Every checkout attempt, all statuses', 'transactions'));
  fx.stagger(stats, ':scope > *', { step: 70, base: 40 });

  // ---- rows (accordion: one open at a time)
  let openApi = null;
  const onOpen = (api, fromUser) => {
    if (fromUser) touched = true;
    if (openApi && openApi !== api) openApi.close();
    openApi = api;
  };
  const apis = rows.map((t) => txnRow(ctx, t, { paidAt: paidAt[t.id], onOpen }));
  apis.forEach((a, i) => a.el.style.setProperty('--b-i', String(i)));
  const emptyText = h('p', {});
  const empty = h('li', { class: 'b-m-tempty', hidden: true },
    h('span', { class: 'b-m-tempty-ic', attrs: { 'aria-hidden': 'true' } }, icon('search', { size: 22 })),
    emptyText,
    h('button', { type: 'button', class: 'b-btn b-btn-ink b-m-tempty-btn', on: { click: () => { filter = 'all'; query = ''; searchEl.querySelector('input').value = ''; apply(); } } }, 'Show all'));
  const list = h('ol', { class: 'b-m-tlist', attrs: { 'aria-label': 'Transactions, newest first' } }, apis.map((a) => a.el), empty);
  fx.stagger(list, ':scope > .b-m-trow', { step: 40, base: 260 });

  // ---- filter chips (they really filter) + search (it really searches)
  const count = (key) => (key === 'all' ? rows.length : rows.filter((r) => r.status === key).length);
  const note = h('span', { class: 'b-m-showing', attrs: { 'aria-live': 'polite' } });
  const chipBtns = FILTERS.map(([key, label]) => h('button', {
    type: 'button', class: 'b-m-fchip', dataset: { key }, attrs: { 'aria-pressed': String(key === filter) },
    on: { click: () => { filter = key; touched = true; apply(); } },
  }, h('span', {}, label), h('span', { class: 'b-m-fchip-n b-num' }, String(count(key)))));
  const searchEl = searchField(ctx, 'Search TXN, name or reference', (v) => { query = v; touched = true; apply(); });
  const apply = (initial = false) => {
    const q = query.trim().toLowerCase();
    let shownN = 0;
    apis.forEach((a) => {
      const okS = filter === 'all' || a.t.status === filter;
      const okQ = !q || [a.t.id, a.t.name, a.t.ref, a.t.requestId, a.t.method].some((v) => String(v).toLowerCase().includes(q));
      const vis = okS && okQ;
      if (!vis && a.isOpen()) a.close();
      a.el.hidden = !vis;
      if (vis) { a.el.style.setProperty('--b-i', String(shownN)); shownN += 1; }
    });
    if (!initial) {
      list.classList.remove('is-refresh');
      void list.offsetWidth; // restart the short re-entrance
      list.classList.add('is-refresh');
    }
    const label = FILTERS.find(([k]) => k === filter)?.[1].toLowerCase() || '';
    empty.hidden = shownN > 0;
    emptyText.textContent = q ? `No transactions match “${query.trim()}”${filter !== 'all' ? ` among the ${label} ones` : ''}.` : `No ${label} sessions among the ${rows.length} newest attempts.`;
    note.textContent = filter === 'all' && !q ? `${rows.length} newest of ${S.total}` : `${shownN} of the ${rows.length} newest`;
    chipBtns.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.key === filter)));
  };
  apply(true);

  const tbar = h('div', { class: 'b-m-tbar' },
    h('div', { class: 'b-m-tools' },
      h('div', { class: 'b-m-fchips', attrs: { role: 'group', 'aria-label': 'Filter by status' } }, chipBtns),
      note,
      searchEl),
    h('div', { class: 'b-m-thead', attrs: { 'aria-hidden': 'true' } },
      ['Transaction', 'Borrower', 'Method', 'Amount', 'Started', 'Status', 'Attachments', ''].map((x) => h('span', {}, x))));

  // Choreography: once the list is on screen, open the newest row to show the expansion.
  // Under reduced motion it is simply open from the start (no late layout shift).
  if (fx.reduced()) apis[0]?.open(null, false);
  else {
    const stop = fx.inView(list, () => {
      const id = setTimeout(() => { if (!touched && !openApi) apis[0]?.open(null, false); }, 1300);
      onCleanup(() => clearTimeout(id));
    });
    onCleanup(stop);
  }

  return shell(ctx, 'transactions', 'is-txn',
    topbar(ctx, {
      kicker: 'Collections', title: 'Transactions', sub: 'Every checkout attempt and verified payment, newest first.', search: false,
      extra: h('button', { type: 'button', class: 'b-btn b-btn-ink b-m-export' }, icon('download', { size: 18 }), 'Export CSV'),
    }),
    stats, tbar, list);
}

// --------------------------------------------------------------------------------------------
// Dashboard on a phone

function renderPhone(ctx) {
  const { h, fx, fmt, icon, data } = ctx;
  const F = facts(data);
  const k = data.mba.kpis;
  const days = data.mba.dailyCollected;
  const user = data.mba.user;

  const top = h('header', { class: 'b-m-ph-top' },
    h('div', { class: 'b-m-ph-hello' },
      h('span', { class: 'b-m-kicker' }, fmt.dayShort(data.mba.today)),
      h('h2', {}, `${F.greet}, ${user.name}`)),
    h('button', { type: 'button', class: 'b-m-icbtn', attrs: { 'aria-label': 'Notifications' } }, icon('bell', { size: 20 }), h('span', { class: 'b-m-dot', attrs: { 'aria-hidden': 'true' } })),
    h('button', { type: 'button', class: 'b-m-icbtn is-ink', attrs: { 'aria-label': `Signed in as ${user.name}. Account menu` } }, fmt.initials(user.name)));

  // hero: count-up, mini bars, and the pull-tab reveal
  const moreId = uid('more');
  const more = h('div', { class: 'b-m-ph-more', id: moreId, attrs: { inert: '' } },
    h('div', { class: 'b-m-ph-more-in' }, h('div', { class: 'b-m-ph-more-body' },
      h('div', { class: 'b-m-ph-kv' }, h('span', {}, 'Net of fees'), h('strong', { class: 'b-num' }, fmt.php(k.collectedThisMonthNet))),
      h('div', { class: 'b-m-ph-kv' }, h('span', {}, `${F.lastMonth}, full month`), h('strong', { class: 'b-num' }, fmt.php(k.collectedLastMonth))),
      pace(ctx, F, { foot: false }))));
  const bars = fx.barChart({ values: days.map((d) => d.amount), w: 314, h: 52, gap: 4, radius: 4, className: 'b-m-bars b-m-ph-bars', label: `Daily collections, ${md(days[0].date)} to ${md(days.at(-1).date)}` });
  bars.setAttribute('width', '314');
  bars.setAttribute('height', '52');
  const hero = h('section', { class: 'b-hero b-m-ph-hero', attrs: { 'aria-label': 'Collected this month' } },
    h('div', { class: 'b-m-hero-eyebrow' }, h('span', {}, 'Collected this month')),
    fx.money(k.collectedThisMonth, { className: 'b-money b-m-ph-num', duration: 1500, delay: 250 }),
    h('div', { class: 'b-m-ph-chips' }, h('span', { class: 'b-chip b-chip-on-hero' }, `So far · ${F.range}`)),
    bars,
    h('div', { class: 'b-m-ph-axis', attrs: { 'aria-hidden': 'true' } }, h('span', {}, md(days[0].date)), h('span', {}, md(days.at(-1).date))),
    more);
  fx.aurora(hero, { ...AURORA, seed: 5 });
  const wrap = h('div', { class: 'b-m-ph-herowrap' }, hero);
  let open = false;
  const tab = h('button', {
    type: 'button', class: 'b-tab b-m-ph-tab',
    attrs: { 'aria-expanded': 'false', 'aria-controls': moreId, 'aria-label': `Show net, ${F.lastMonth} and the comparison` },
    on: {
      click: () => {
        open = !open;
        wrap.classList.toggle('is-open', open);
        more.inert = !open;
        tab.setAttribute('aria-expanded', String(open));
        tab.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} net, ${F.lastMonth} and the comparison`);
      },
    },
  }, icon('chevronDown', { size: 18 }));
  wrap.append(tab);

  const kpis = h('div', { class: 'b-m-ph-kpis' }, kpiTiles(ctx, F, { phone: true }));
  fx.stagger(kpis, ':scope > *', { step: 60, base: 260 });

  const scroll = h('div', { class: 'b-m-ph-scroll' }, top, wrap, kpis, needsTile(ctx, { phone: true }), recentTile(ctx, 5, { phone: true }));
  fx.stagger(scroll, ':scope > *', { step: 80, base: 30 });

  const tabs = [['Home', 'dashboard', true], ['Accounts', 'accounts'], ['Payments', 'transactions'], ['Recon', 'reconciliation', false, k.exceptionsOpen], ['More', 'menu']];
  const tabbar = h('nav', { class: 'b-m-ph-tabbar', attrs: { 'aria-label': 'Back office' } },
    tabs.map(([label, ic, on, badge]) => h('button', {
      type: 'button', class: ['b-m-ph-tabbtn', on && 'is-active'], attrs: { 'aria-current': on ? 'page' : null },
    },
    h('span', { class: 'b-m-ph-tabic' }, icon(ic, { size: 20 }), badge ? h('span', { class: 'b-m-ph-tabbadge b-num', attrs: { 'aria-hidden': 'true' } }, String(badge)) : null),
    h('span', {}, label),
    badge ? h('span', { class: 'b-m-sr' }, `, ${badge} open exceptions`) : null)));

  return h('div', { class: 'b-m-ph' },
    scroll,
    h('div', { class: 'b-m-ph-fadetop', attrs: { 'aria-hidden': 'true' } }),
    h('div', { class: 'b-m-ph-fadebot', attrs: { 'aria-hidden': 'true' } }),
    tabbar);
}

// --------------------------------------------------------------------------------------------

export const mbaDesktop = [
  {
    id: 'dashboard', title: 'Dashboard',
    caption: 'Hover or arrow-key through the daily bars to read any day; totals count up as the tiles rise.',
    render: renderDashboard,
  },
  {
    id: 'transactions', title: 'Transactions',
    caption: 'Click any row to open its timeline and documents in place; the status chips really filter.',
    render: renderTransactions,
  },
];
export const mbaPhone = [
  {
    id: 'dashboard-phone', title: 'Dashboard on a phone', statusBar: 'dark',
    caption: 'Tap the tab under the gradient block to reveal net, October and the pace.',
    render: renderPhone,
  },
];
