// Intro splash for the 2026-11-26 refresh (styles in theme-glass.css). The MBA mark resolves out of
// the deep-water scene, the wordmark rises with a light sheen, a brand-gradient line draws, then the
// scene lifts away. About 2.4 s in all.
// - Plays once per browser session (sessionStorage). Demo tools → Replay intro forces it.
// - Any click or key skips it. It never traps focus, and it is removed from the DOM when done.
// - Skipped when reduced motion is requested, and for automated browsers (navigator.webdriver) so
//   the e2e walkthroughs are not covered. ?splash=1 forces it, ?splash=0 suppresses it.
import logoWhiteSvg from '../assets/mba_logo_white.svg';

const SEEN_KEY = 'mba-splash-seen';
const LOGO_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoWhiteSvg)}`;
const HOLD_MS = 1750; // when the exit starts
const EXIT_MS = 700; // a little longer than the .splash.is-out transition (0.65 s)

function wanted() {
  const q = new URLSearchParams(window.location.search);
  if (q.has('splash')) return q.get('splash') !== '0';
  if (navigator.webdriver) return false;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    if (window.sessionStorage.getItem(SEEN_KEY)) return false;
  } catch { /* storage blocked: show it */ }
  return true;
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text) n.textContent = text;
  return n;
}

/** Shows the intro over the app. Returns true when it started. */
export function playSplash({ force = false } = {}) {
  if (!force && !wanted()) return false;
  if (document.querySelector('.splash')) return false;
  try { window.sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* fine */ }

  const root = el('div', 'splash');
  root.dataset.testid = 'splash';
  root.setAttribute('aria-hidden', 'true');
  const center = el('div', 'splash-center');
  const logo = el('img', 'splash-logo');
  logo.src = LOGO_URL;
  logo.alt = '';
  const line = el('div', 'splash-line');
  line.append(el('span'));
  center.append(logo, el('div', 'splash-word', 'MBA CONSULT'), line, el('div', 'splash-sub', 'Collections & Payments'));
  root.append(el('div', 'splash-glow'), center);
  document.body.append(root);

  let timer = 0;
  const finish = () => {
    if (root.classList.contains('is-out')) return;
    window.clearTimeout(timer);
    window.removeEventListener('keydown', finish, true);
    root.classList.add('is-out');
    window.setTimeout(() => root.remove(), EXIT_MS);
  };
  root.addEventListener('pointerdown', finish);
  window.addEventListener('keydown', finish, true);
  timer = window.setTimeout(finish, HOLD_MS);
  return true;
}
