// Pointer-reactive light for the 2026-11-26 glass refresh (styles/theme-glass.css). It only writes
// CSS custom properties:
//   --mx / --my on <html>: eased pointer position as % of the viewport; moves the scene glow.
//   --px / --py on the hovered CTA, tile or KPI: pointer position inside it in px; places its highlight.
// It stays idle when reduced motion is requested and on touch-only devices, where the CSS keeps its
// static fallback positions.

const SPOT = '.btn-primary, .fx-spot, .kpi, .hero-btn';
const EASE = 0.08; // fraction of the remaining distance per frame

export function initAmbient(root = document.documentElement) {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  let tx = 0.72;
  let ty = 0.18;
  let x = tx;
  let y = ty;
  let frame = 0;

  const paint = () => {
    x += (tx - x) * EASE;
    y += (ty - y) * EASE;
    root.style.setProperty('--mx', `${(x * 100).toFixed(2)}%`);
    root.style.setProperty('--my', `${(y * 100).toFixed(2)}%`);
    frame = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? window.requestAnimationFrame(paint) : 0;
  };

  window.addEventListener('pointermove', (e) => {
    if (reduce.matches || !fine.matches || e.pointerType === 'touch') return;
    tx = e.clientX / window.innerWidth;
    ty = e.clientY / window.innerHeight;
    if (!frame) frame = window.requestAnimationFrame(paint);
    const el = e.target instanceof Element ? e.target.closest(SPOT) : null;
    if (el) {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--px', `${Math.round(e.clientX - r.left)}px`);
      el.style.setProperty('--py', `${Math.round(e.clientY - r.top)}px`);
    }
  }, { passive: true });
}
