// Display helpers shared by core and UI (UI re-exports maskMobile from here; core never imports the UI kit).

const DOTS = '••••';

/** '+639171237310' → '••••7310'; null/empty → '••••'. */
export function maskMobile(m) {
  const digits = String(m ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? DOTS + digits.slice(-4) : DOTS;
}

/** 'juan.d@example.com' → 'j•••@example.com'. */
export function maskEmail(e) {
  if (!e || !String(e).includes('@')) return DOTS;
  const [user, domain] = String(e).split('@');
  return `${user.slice(0, 1)}•••@${domain}`;
}

/** Any account/reference number → '••••' + last 4 characters (alphanumeric). */
export function maskTail(s) {
  const clean = String(s ?? '').replace(/[^0-9A-Za-z]/g, '');
  return clean.length >= 4 ? DOTS + clean.slice(-4) : DOTS;
}

/** Borrower display name: 'Juan D.' */
export function borrowerName(account) {
  const b = account?.borrower;
  if (!b) return 'Unknown';
  return b.lastInitial ? `${b.first} ${b.lastInitial}.` : b.first;
}

/** 'arrangement_active' → 'Arrangement active'. */
export function humanize(s) {
  const t = String(s ?? '').replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Zero-padded typed IDs: seqId('MBA-REQ', 812) → 'MBA-REQ-000812'. */
export const seqId = (prefix, n) => `${prefix}-${String(n).padStart(6, '0')}`;

/**
 * Display reference for an arrangement id (display only; ids, routes and stored data keep the
 * raw id): 'ar_02659' → 'MBA-ARR-02659'. Named seed ids ('ar_juan') get a stable 5-digit number
 * in the 9xxxx range, which the object sequence never reaches in a demo, so the style is uniform.
 */
export function arrangementRef(id) {
  const raw = String(id ?? '');
  const tail = raw.replace(/^ar_/i, '');
  if (/^\d+$/.test(tail)) return `MBA-ARR-${tail.padStart(5, '0')}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < tail.length; i++) { h ^= tail.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `MBA-ARR-${90000 + ((h >>> 0) % 10000)}`;
}

/**
 * Status → tone (V3 §16 colour mapping [PROPOSED]): ok = green (settled/completed/paid),
 * warn = amber (pending/overdue), danger = red (failed/defaulted/exception), info = blue (sent),
 * neutral = grey (expired/cancelled/superseded), brand = purple (draft/pending approval).
 * Always shown with a text label — never colour alone (D§7).
 */
export const STATUS_TONE = Object.freeze({
  // green
  settled: 'ok', completed: 'ok', paid: 'ok', verified: 'ok', reconciled: 'ok', resolved: 'ok', accepted: 'ok', received: 'ok',
  // amber
  pending: 'warn', overdue: 'warn', due: 'warn', partial: 'warn', in_review: 'warn', on_hold: 'warn', escalated: 'warn', initiated: 'warn', expected: 'warn',
  // red
  failed: 'danger', defaulted: 'danger', missed: 'danger', disputed: 'danger', rejected: 'danger', mismatch: 'danger', open: 'danger',
  // blue
  sent: 'info', opened: 'info', created: 'info', active: 'info', partially_paid: 'info', arrangement_active: 'info',
  assigned: 'info', contact_attempted: 'info', contacted: 'info', negotiating: 'info',
  // grey
  expired: 'neutral', cancelled: 'neutral', superseded: 'neutral', revoked: 'neutral', refunded: 'neutral', returned: 'neutral',
  uncollectable: 'neutral', new: 'neutral', scheduled: 'neutral',
  // purple
  draft: 'brand', pending_approval: 'brand',
});
