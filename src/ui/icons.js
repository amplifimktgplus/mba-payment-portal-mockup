// One stroke-icon family (24px grid, 1.75 stroke, square-ish joins to echo MBA's square corners).
// Paths are static constants: they never carry data, so building them with setAttribute is safe.
// Usage: icon('search') → <svg class="icon" aria-hidden="true">…</svg>

const SVG_NS = 'http://www.w3.org/2000/svg';

const ring = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const ICON_PATHS = Object.freeze({
  dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  creditors: 'M3 21h18 M6 17v-6 M10 17v-6 M14 17v-6 M18 17v-6 M12 3l9 5H3z',
  bank: 'M3 21h18 M6 17v-6 M10 17v-6 M14 17v-6 M18 17v-6 M12 3l9 5H3z', // online banking (same building as creditors)
  portfolios: 'M3 6h6l2 2h10v12H3z M3 11h18',
  accounts: `M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 ${ring(9, 7, 4)} M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75`,
  arrangements: 'M8 2v4 M16 2v4 M3 5h18v16H3z M3 10h18 M9 15.5l2 2 4-4',
  requests: 'M22 2L11 13 M22 2l-7 20-4-9-9-4z',
  transactions: 'M2 5h20v14H2z M2 10h20 M6 15h4',
  reconciliation: 'M18 6L7 17l-5-5 M22 10l-7.5 7.5L13 16',
  reports: 'M3 3v18h18 M8 17v-6 M13 17V7 M18 17v-4',
  remittances: 'M16 3l4 4-4 4 M20 7H4 M8 21l-4-4 4-4 M4 17h16',
  settings: 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0',
  search: `${ring(11, 11, 7)} M21 21l-4.35-4.35`,
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M18 15l-6-6-6 6',
  chevronRight: 'M9 18l6-6-6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  sort: 'M7 15l5 5 5-5 M7 9l5-5 5 5',
  x: 'M18 6L6 18 M6 6l12 12',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  lock: 'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
  check: 'M20 6L9 17l-5-5',
  alert: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  info: `${ring(12, 12, 10)} M12 16v-4 M12 8h.01`,
  download: 'M21 15v6H3v-6 M7 10l5 5 5-5 M12 15V3',
  upload: 'M21 15v6H3v-6 M17 8l-5-5-5 5 M12 3v12',
  external: 'M15 3h6v6 M10 14L21 3 M18 13v8H3V6h8',
  refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M8 16H3v5',
  clock: `${ring(12, 12, 10)} M12 6v6l4 2`,
  tool: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z',
  user: `M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 ${ring(12, 7, 4)}`,
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z',
  mail: 'M2 4h20v16H2z M22 6l-10 7L2 6',
  arrowLeft: 'M19 12H5 M12 19l-7-7 7-7',
  arrowRight: 'M5 12h14 M12 5l7 7-7 7',
  plus: 'M12 5v14 M5 12h14',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54z',
  file: 'M14 2H4v20h16V8z M14 2v6h6',
  monitor: 'M2 3h20v14H2z M8 21h8 M12 17v4',
  phoneDevice: 'M6 2h12v20H6z M11 18h2',
  play: 'M6 4l14 8-14 8z',
  eye: `M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z ${ring(12, 12, 3)}`,
  hash: 'M4 9h16 M4 15h16 M10 3L8 21 M16 3l-2 18',
  qr: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3z M20 14v1 M14 20h1 M17 17h4v4h-4z',
});

/** <svg class="icon icon-<name>"> with the named path. Unknown names render an empty icon. */
export function icon(name, { size = 18, title = null, cls = '' } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'square');
  svg.setAttribute('stroke-linejoin', 'miter');
  svg.setAttribute('class', `icon icon-${name}${cls ? ` ${cls}` : ''}`);
  if (title) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', title);
  } else {
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
  }
  const d = ICON_PATHS[name];
  if (d) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}
