// Look switch (2026-11-26, user request: roll the "Midnight" design option into the demo).
// 'midnight' is the default; 'classic' is the previous design, kept one click away in Demo tools.
// The choice is a per-browser convenience (localStorage 'mba-look'); ?look=classic|midnight in the
// URL overrides it for one load (used by checks). All Midnight styling is scoped under
// html[data-look="midnight"], so Classic renders exactly as before.
export const LOOKS = Object.freeze(['midnight', 'classic']);
const KEY = 'mba-look';

export function getLook() {
  try {
    const q = new URLSearchParams(location.search).get('look');
    if (LOOKS.includes(q)) return q;
    const v = localStorage.getItem(KEY);
    if (LOOKS.includes(v)) return v;
  } catch { /* storage or URL unavailable: fall through */ }
  return 'midnight';
}

export function applyLook(look) {
  document.documentElement.dataset.look = LOOKS.includes(look) ? look : 'midnight';
}

/** Switches the look, remembers it, and tells the app to redraw. */
export function setLook(look) {
  if (!LOOKS.includes(look)) return;
  try { localStorage.setItem(KEY, look); } catch { /* private mode: still switch for this page */ }
  applyLook(look);
  window.dispatchEvent(new CustomEvent('mba-look', { detail: look }));
}

export const isMidnight = () => document.documentElement.dataset.look === 'midnight';
