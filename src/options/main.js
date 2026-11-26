// Design options page (2026-11-26): today's design plus two new directions, each as live concept
// screens (Borrower on phone + desktop, MBA back office on desktop + phone) drawn from the demo's
// real figures. Screens render at their design size (phone 390×844, desktop 1440×900) and are
// CSS-scaled into frames, so the same screen code serves the overview, full screen and solo mode.
//
// URLs:  options.html#a | #b | #today        which option is shown (default #a)
//        options.html?solo=a/borrowerPhone/1  one screen alone at design size (for checks and shots)
//        options.html?solo=…&frame=1          the same, inside its phone/desktop frame
import { h } from '../ui/kit.js';
import { icon } from '../ui/icons.js';
import { getData, fmt } from './data.js';
import * as fx from './fx.js';
import today from './today/index.js';
import optionA from './a/index.js';
import optionB from './b/index.js';
import logoSvg from '../assets/mba_logo.svg';

const OPTIONS = [today, optionA, optionB];
const SIZE = { phone: { w: 390, h: 844 }, desktop: { w: 1440, h: 900 } };
const SECTIONS = [
  { key: 'borrowerPhone', kind: 'phone' },
  { key: 'borrowerDesktop', kind: 'desktop' },
  { key: 'mbaDesktop', kind: 'desktop' },
  { key: 'mbaPhone', kind: 'phone' },
];
const LOGO = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg)}`;

// --------------------------------------------------------------------------------------------
// One screen, rendered at design size into a host element

function mountScreen(opt, screen, kind) {
  const { w, h: hh } = SIZE[kind];
  const cleanups = [];
  const el = h('div', {
    class: ['op-screen', `opt-${opt.id}`, `scr-${kind}`],
    style: { width: `${w}px`, height: `${hh}px` },
    dataset: { option: opt.id, screen: screen.id },
  });
  const ctx = {
    data: getData(), fmt, fx, h, icon, kind, option: opt.id,
    /** register a teardown (timers, listeners) for when this screen is removed */
    onCleanup: (fn) => cleanups.push(fn),
  };
  try {
    el.appendChild(screen.render(ctx));
  } catch (err) {
    el.appendChild(h('div', { class: 'op-error' }, `This screen failed to draw: ${err.message}`));
    console.error(err);
  }
  return { el, destroy: () => cleanups.splice(0).forEach((fn) => { try { fn(); } catch { /* ignore */ } }) };
}

function statusBar(tone) {
  return h('div', { class: ['op-status', `is-${tone}`], attrs: { 'aria-hidden': 'true' } },
    h('span', { class: 'op-status-time' }, '9:41'),
    h('span', { class: 'op-status-icons' },
      h('span', { class: 'op-sig' }, h('i'), h('i'), h('i'), h('i')),
      h('span', { class: 'op-wifi' }),
      h('span', { class: 'op-batt' }, h('i'))));
}

/** A framed, scaled screen. Returns the <figure>. */
function frame(opt, screen, kind, { solo = false, native = false } = {}) {
  const { w, h: hh } = SIZE[kind];
  const fig = h('figure', { class: ['op-frame', `op-frame-${kind}`], dataset: { screen: `${opt.id}/${screen.id}` } });
  const device = h('div', { class: ['op-device', `op-device-${kind}`] });
  const port = h('div', { class: 'op-port' });
  const tone = screen.statusBar || opt.statusBar || 'dark';
  // Phone chrome (status bar, home indicator) lives inside the scaled screen so it scales with it.
  const dress = (m) => { if (kind === 'phone') m.el.append(statusBar(tone), h('span', { class: ['op-home', `is-${tone}`], attrs: { 'aria-hidden': 'true' } })); return m; };
  let mounted = dress(mountScreen(opt, screen, kind));
  port.appendChild(mounted.el);
  if (kind === 'phone') {
    device.append(port);
  } else {
    device.append(h('div', { class: 'op-chrome', attrs: { 'aria-hidden': 'true' } },
      h('span', { class: 'op-dots' }, h('i'), h('i'), h('i')),
      h('span', { class: 'op-chrome-label' }, kind === 'desktop' && screen.chromeLabel ? screen.chromeLabel : 'MBA Consult · demo'),
      h('span', { class: 'op-chrome-side' })), port);
  }
  fig.appendChild(device);
  if (!solo) {
    fig.appendChild(h('figcaption', { class: 'op-cap' },
      h('div', { class: 'op-cap-text' }, h('strong', {}, screen.title), screen.caption ? h('span', {}, screen.caption) : null),
      h('button', {
        type: 'button', class: 'op-expand', attrs: { 'aria-label': `Open ${screen.title} full screen` },
        on: { click: () => openViewer(opt, screen, kind) },
      }, icon('external', { size: 16 }))));
  }

  // Scale the design-size screen to the frame's width.
  const fit = () => {
    const avail = device.clientWidth - (kind === 'phone' ? 2 * PHONE_BEZEL : 0);
    const s = native ? 1 : Math.max(0.1, avail / w);
    mounted.el.style.transform = `scale(${s})`;
    port.style.width = `${w * s}px`;
    port.style.height = `${hh * s}px`;
    port.style.setProperty('--op-s', String(s));
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(device);
  requestAnimationFrame(fit);
  fig.replay = () => { mounted.destroy(); mounted.el.remove(); mounted = dress(mountScreen(opt, screen, kind)); port.prepend(mounted.el); fit(); };
  return fig;
}
const PHONE_BEZEL = 11;

// --------------------------------------------------------------------------------------------
// Full-screen viewer: re-renders the screen fresh, fitted to the window

let viewerOpen = null;
function openViewer(opt, screen, kind) {
  closeViewer();
  const back = h('div', { class: ['op-viewer', `is-${kind}`], attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': `${screen.title} full screen` } });
  const box = h('div', { class: 'op-viewer-box' });
  const f = frame(opt, screen, kind, { solo: false });
  f.classList.add('is-viewer');
  f.querySelector('.op-cap')?.remove();
  const close = h('button', { type: 'button', class: 'op-viewer-close', attrs: { 'aria-label': 'Close full screen' }, on: { click: () => closeViewer() } }, icon('x', { size: 20 }));
  const title = h('div', { class: 'op-viewer-title' }, h('strong', {}, `${opt.short} · ${screen.title}`), screen.caption ? h('span', {}, screen.caption) : null);
  box.append(f);
  back.append(title, close, box);
  back.addEventListener('mousedown', (e) => { if (e.target === back) closeViewer(); });
  document.body.appendChild(back);
  document.documentElement.classList.add('op-noscroll');
  const sizeBox = () => {
    const { w, h: hh } = SIZE[kind];
    const vw = window.innerWidth - 48;
    const vh = window.innerHeight - 120;
    const dev = kind === 'phone' ? { w: w + 2 * PHONE_BEZEL, h: hh + 2 * PHONE_BEZEL } : { w, h: hh + 38 };
    const s = Math.min(1, vw / dev.w, vh / dev.h);
    box.style.width = `${Math.floor(dev.w * s)}px`;
  };
  sizeBox();
  window.addEventListener('resize', sizeBox);
  const onKey = (e) => { if (e.key === 'Escape') closeViewer(); };
  document.addEventListener('keydown', onKey);
  viewerOpen = { back, cleanup: () => { window.removeEventListener('resize', sizeBox); document.removeEventListener('keydown', onKey); } };
  close.focus();
}
function closeViewer() {
  if (!viewerOpen) return;
  viewerOpen.cleanup();
  viewerOpen.back.remove();
  viewerOpen = null;
  document.documentElement.classList.remove('op-noscroll');
}

// --------------------------------------------------------------------------------------------
// Page

function optionPanel(opt) {
  const s = opt.sections;
  const phones = (s.borrowerPhone || []).map((sc) => frame(opt, sc, 'phone'));
  const bDesk = (s.borrowerDesktop || []).map((sc) => frame(opt, sc, 'desktop'));
  const mDesk = (s.mbaDesktop || []).map((sc) => frame(opt, sc, 'desktop'));
  const mPhone = (s.mbaPhone || []).map((sc) => frame(opt, sc, 'phone'));
  return h('div', { class: ['op-panel', `op-panel-${opt.id}`], attrs: { role: 'tabpanel', id: `panel-${opt.id}`, 'aria-labelledby': `tab-${opt.id}` } },
    h('section', { class: 'op-intro' },
      h('div', { class: 'op-intro-main' },
        h('p', { class: 'op-eyebrow' }, opt.eyebrow),
        h('h1', { class: 'op-title' }, opt.name),
        h('p', { class: 'op-tagline' }, opt.tagline)),
      h('div', { class: 'op-intro-side' },
        opt.points?.length ? h('ul', { class: 'op-points' }, opt.points.map((p) => h('li', {}, p))) : null,
        opt.effects?.length ? h('div', { class: 'op-effects' }, h('span', { class: 'op-effects-label' }, 'Motion and effects'), h('div', { class: 'op-chips' }, opt.effects.map((e) => h('span', { class: 'op-chip' }, e)))) : null)),
    h('section', { class: 'op-sec' },
      h('header', { class: 'op-sec-head' }, h('h2', {}, 'Borrower view'), h('p', {}, opt.borrowerNote || 'Phone first: the code, what’s due, choosing how to pay, and the confirmation. Then the same flow on a desktop.')),
      h('div', { class: 'op-phones' }, phones),
      bDesk.length ? h('div', { class: 'op-desks' }, bDesk) : null),
    h('section', { class: 'op-sec' },
      h('header', { class: 'op-sec-head' }, h('h2', {}, 'MBA back office'), h('p', {}, opt.mbaNote || 'The dashboard and the transaction history on a desktop, then the dashboard on a phone.')),
      h('div', { class: 'op-mba' },
        h('div', { class: 'op-desks' }, mDesk),
        mPhone.length ? h('div', { class: 'op-mba-phone' }, mPhone) : null)));
}

function page() {
  const root = document.getElementById('opts');
  const panels = new Map();
  const tabs = h('div', { class: 'op-tabs', attrs: { role: 'tablist', 'aria-label': 'Design options' } });
  const main = h('main', { class: 'op-main' });
  const select = (id, { focus = false } = {}) => {
    const opt = OPTIONS.find((o) => o.id === id) || OPTIONS[1];
    document.body.dataset.opt = opt.id;
    for (const b of tabs.children) {
      const on = b.dataset.id === opt.id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    }
    if (!panels.has(opt.id)) { const p = optionPanel(opt); panels.set(opt.id, p); main.appendChild(p); }
    for (const [pid, p] of panels) p.hidden = pid !== opt.id;
    if (location.hash !== `#${opt.id}`) history.replaceState(null, '', `#${opt.id}`);
  };
  OPTIONS.forEach((o, i) => {
    tabs.appendChild(h('button', {
      type: 'button', class: 'op-tab', attrs: { role: 'tab', id: `tab-${o.id}`, 'aria-controls': `panel-${o.id}` }, dataset: { id: o.id },
      on: {
        click: () => select(o.id),
        keydown: (e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          const n = (i + (e.key === 'ArrowRight' ? 1 : OPTIONS.length - 1)) % OPTIONS.length;
          select(OPTIONS[n].id, { focus: true });
        },
      },
    }, h('span', { class: 'op-tab-k' }, o.key), h('span', {}, o.tabLabel)));
  });
  root.append(
    h('header', { class: 'op-top' },
      h('div', { class: 'op-brand' }, h('img', { src: LOGO, alt: '', class: 'op-logo' }), h('div', {}, h('strong', {}, 'MBA Consult'), h('span', {}, 'Design options · payment portal'))),
      tabs,
      h('span', { class: 'op-demo' }, 'Demo concepts · fictional data')),
    main,
    h('footer', { class: 'op-foot' },
      h('p', {}, 'Concept screens for choosing a direction. Every figure comes from the demo’s data. Effects are hand-built in the spirit of React Bits-style components; no third-party component code is used. Payments are simulated; nothing here is live.')));
  window.addEventListener('hashchange', () => select(location.hash.slice(1)));
  select(location.hash.slice(1) || 'a');
}

/** ?solo=a/borrowerPhone/1 → that one screen at design size (optionally framed). */
function solo(spec, framed) {
  const [oid, key, idx] = spec.split('/');
  const opt = OPTIONS.find((o) => o.id === oid);
  const list = opt?.sections?.[key];
  const sc = list?.[Number(idx) || 0];
  const sec = SECTIONS.find((x) => x.key === key);
  const root = document.getElementById('opts');
  document.body.dataset.opt = oid;
  document.body.classList.add('op-solo');
  if (!sc || !sec) { root.appendChild(h('p', { class: 'op-error' }, `No screen ${spec}`)); return; }
  if (framed) {
    const f = frame(opt, sc, sec.kind, { solo: true, native: true });
    f.classList.add('is-framed');
    root.appendChild(h('div', { class: ['op-solo-wrap', `is-${sec.kind}`] }, f));
  } else {
    root.appendChild(mountScreen(opt, sc, sec.kind).el);
  }
}

// Read-only list of every screen, for verify/options-check.mjs: [{ id, sections: { key: [screenId…] } }]
window.__OPTIONS__ = OPTIONS.map((o) => ({ id: o.id, sections: Object.fromEntries(Object.entries(o.sections).map(([k, list]) => [k, list.map((x) => x.id)])) }));

const params = new URLSearchParams(location.search);
if (params.get('solo')) solo(params.get('solo'), params.get('frame') === '1');
else page();
