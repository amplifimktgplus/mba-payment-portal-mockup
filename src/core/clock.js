// Fixed demo clock (design C5): "today" = Thu 26 Nov 2026, 10:00 PHT (UTC+8).
// Domain logic never reads Date.now(). Timestamps are stored as
// 'YYYY-MM-DDTHH:mm:ss+08:00' (lexically sortable); dates as 'YYYY-MM-DD'.

export const DEMO_NOW = '2026-11-26T10:00:00+08:00';
export const DEMO_TODAY = '2026-11-26';
const OFFSET_MS = 8 * 3600 * 1000;
const DAY_MS = 86400 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const p2 = (n) => String(n).padStart(2, '0');

export const isDateOnly = (s) => typeof s === 'string' && DATE_ONLY.test(s);

/** ISO string (date-only = 00:00 PHT) → Date. */
export function parse(iso) {
  if (iso instanceof Date) return new Date(iso.getTime());
  if (isDateOnly(iso)) return new Date(`${iso}T00:00:00+08:00`);
  return new Date(iso);
}

/** The demo "now". Always the same instant. */
export function now() {
  return new Date(DEMO_NOW);
}

/** Date → 'YYYY-MM-DDTHH:mm:ss+08:00'. */
export function toPHT(date) {
  const d = new Date(parse(date).getTime() + OFFSET_MS);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}T${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:${p2(d.getUTCSeconds())}+08:00`;
}

/** Calendar date in PHT: 'YYYY-MM-DD'. */
export function phtDate(iso) {
  if (isDateOnly(iso)) return iso;
  return toPHT(iso).slice(0, 10);
}

/** Month key in PHT: 'YYYY-MM'. */
export const phtMonth = (iso) => phtDate(iso).slice(0, 7);

/** Adds n days. Date-only in → date-only out; timestamp in → PHT timestamp out. */
export function addDays(iso, n) {
  if (isDateOnly(iso)) {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  return toPHT(new Date(parse(iso).getTime() + n * DAY_MS));
}

export const addMinutes = (iso, n) => toPHT(new Date(parse(iso).getTime() + n * 60000));
export const addSeconds = (iso, n) => toPHT(new Date(parse(iso).getTime() + n * 1000));

/** Adds n calendar months to a date ('YYYY-MM-DD'), clamping the day (Jan 31 + 1 → Feb 28). */
export function addMonths(dateIso, n) {
  const [y, m, d] = phtDate(dateIso).split('-').map(Number);
  const idx = (m - 1) + n;
  const ty = y + Math.floor(idx / 12);
  const tm = ((idx % 12) + 12) % 12;
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${p2(tm + 1)}-${p2(Math.min(d, last))}`;
}

/** Whole PHT calendar days from a to b (b − a). */
export function daysBetween(aIso, bIso) {
  const a = Date.parse(`${phtDate(aIso)}T00:00:00Z`);
  const b = Date.parse(`${phtDate(bIso)}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

/** Milliseconds from a to b (b − a), for timestamps. */
export const msBetween = (aIso, bIso) => parse(bIso).getTime() - parse(aIso).getTime();

/** 'Dec 5, 2026' (PHT). */
export function fmtDate(iso) {
  const [y, m, d] = phtDate(iso).split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** 'Nov 26, 2026, 10:00 AM' (PHT). */
export function fmtDateTime(iso) {
  const t = toPHT(iso);
  const h24 = Number(t.slice(11, 13));
  const mm = t.slice(14, 16);
  const ampm = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${fmtDate(t)}, ${h12}:${mm} ${ampm}`;
}

/** 'Dec 2026' (PHT). */
export function fmtMonth(iso) {
  const [y, m] = phtDate(iso).split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
