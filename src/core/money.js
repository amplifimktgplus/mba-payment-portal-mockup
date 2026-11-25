// Money is always integer centavos (V3 §3 money rules). Never floats.

/** 250000 → '₱2,500.00'. Negative values render as '-₱1.00'. */
export function formatPHP(c) {
  const n = Math.round(Number(c) || 0);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const pesos = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = String(abs % 100).padStart(2, '0');
  return `${sign}₱${pesos}.${cents}`;
}

/** Equal installments; the last one absorbs the centavo remainder (V3 §7). */
export function splitInstallments(total, count) {
  if (!Number.isInteger(total) || !Number.isInteger(count) || count < 1) {
    throw new Error(`splitInstallments: bad input ${total}/${count}`);
  }
  const base = Math.floor(total / count);
  const parts = Array.from({ length: count }, () => base);
  parts[count - 1] = total - base * (count - 1);
  return parts;
}

/** '2,500' / '2500.50' / 2500 (pesos, as typed by a user) → centavos, or null if invalid. */
export function parsePesos(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : null;
  const s = String(v ?? '').replace(/[₱,\s]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
  const [w, f = ''] = s.replace('-', '').split('.');
  const c = Number(w) * 100 + Number(f.padEnd(2, '0'));
  return s.startsWith('-') ? -c : c;
}
