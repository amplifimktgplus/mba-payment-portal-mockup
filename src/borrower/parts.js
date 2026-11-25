// Shared borrower-view parts (Task 5): card frame, journey stepper, support sheet, footer, and
// the downloadable receipt file. Built only from the UI kit (src/ui/kit.js) + token classes.
// Copy follows MBA's debtor voice (D§9): calm, respectful, "we're here to help".

import { h, btn, icon, modal, tag, link, memo, formatPHP, fmtDate, fmtDateTime } from '../ui/kit.js';
import { SUPPORT, LEGAL_NAME, BRAND, PRIVACY_URL, CONDUCT_URL, RECEIPT_TITLE } from '../core/config.js';

/** Per-session UI memory for the borrower view (survives re-renders; cleared by Reset demo). */
export const bui = () => memo('borrower.ui', () => ({
  digits: ['', '', '', '', '', ''],
  otpFor: null,          // sentAt the typed digits belong to
  otpNotice: null,       // {tone, text} shown under the code boxes (resend cooldown etc.)
  refValue: '',
  refError: null,
  method: null,
  methodFor: null,       // requestId the chosen method/outcome belong to
  outcome: null,
  lastScreen: null,
}));

const STEPS = [
  { id: 'verify', label: 'Verify' },
  { id: 'review', label: 'Review' },
  { id: 'pay', label: 'Pay' },
  { id: 'done', label: 'Done' },
];

/** Journey stepper: Verify → Review → Pay → Done. Text + marker, never colour alone. */
export function stepper(active) {
  const idx = STEPS.findIndex((s) => s.id === active);
  const ol = h('ol', { class: 'bsteps', attrs: { 'aria-label': 'Progress' } });
  STEPS.forEach((s, i) => {
    const state = i < idx ? 'done' : i === idx ? 'current' : 'todo';
    ol.appendChild(h('li', { class: ['bstep', `is-${state}`], attrs: { 'aria-current': state === 'current' ? 'step' : null } },
      h('span', { class: 'bstep-mark', attrs: { 'aria-hidden': 'true' } }, state === 'done' ? icon('check', { size: 12 }) : String(i + 1)),
      h('span', { class: 'bstep-label' }, s.label, state === 'done' ? h('span', { class: 'sr-only' }, ' (completed)') : null)));
  });
  return ol;
}

/**
 * The white card every screen sits in: secure strip (+ optional stepper), body, help row.
 * opts: {step, tone, testid}
 */
export function bcard(ctx, { step = null, tone = null, body, help = true, helpVariant = 'general', cls = '' }) {
  return h('section', { class: ['bcard', tone ? `bcard-${tone}` : '', cls] },
    h('div', { class: 'bcard-strip' },
      h('span', { class: 'bsecure' }, icon('lock', { size: 14 }), h('span', {}, 'Secure payment portal')),
      step ? stepper(step) : null),
    h('div', { class: 'bcard-body' }, body),
    help ? h('div', { class: 'bcard-help' },
      h('span', { class: 'bcard-help-text' }, 'Questions? We’re here to help.'),
      btn('Contact MBA Support', { variant: 'link', icon: 'phone', testid: 'support-open', onClick: () => openSupport(helpVariant) })) : null);
}

/** Screen heading block: eyebrow, h1 (focus target on screen change), lead. */
export function bhead({ eyebrow: eb = null, title, lead = null, mark = null }) {
  return h('header', { class: 'bhead' },
    mark,
    eb ? h('div', { class: 'eyebrow' }, eb) : null,
    h('h1', { class: 'bh1', attrs: { tabindex: '-1' }, testid: 'b-title' }, title),
    lead ? h('p', { class: 'blead' }, lead) : null);
}

/** Round-free square status mark (square corners per the brand). */
export const bmark = (name, tone) => h('div', { class: ['bmark', `tone-${tone}`], attrs: { 'aria-hidden': 'true' } }, icon(name, { size: 28 }));

const SUPPORT_COPY = {
  general: {
    title: 'Contact MBA Support',
    lead: 'Our team can help with your arrangement, your payment link or anything on this page. You can reach us by phone or email.',
  },
  notyou: {
    title: 'Not your number?',
    lead: 'If this mobile number isn’t yours, please don’t continue. Contact us and we’ll make sure your link reaches the right person.',
  },
  bank: {
    title: 'Already paid at a bank?',
    lead: 'Thank you. Please email a photo or scan of your bank receipt to us, with your full name. We’ll update your balance once our team has checked it.',
    extra: 'Please don’t pay again online in the meantime. Your balance changes only after MBA confirms the payment.',
  },
};

/** Support sheet (C12): published MBA debtor contacts, flagged "To be confirmed — Q-14". */
export function openSupport(variant = 'general') {
  const c = SUPPORT_COPY[variant] || SUPPORT_COPY.general;
  const tel = `tel:${SUPPORT.phone.replace(/\s+/g, '')}`;
  const m = modal({
    title: c.title,
    eyebrow: 'MBA Support',
    testid: 'support',
    size: 'sm',
    body: [
      h('p', {}, c.lead),
      h('ul', { class: 'bcontacts' },
        h('li', {}, h('a', { class: 'bcontact', href: tel, testid: 'support-phone' },
          h('span', { class: 'bcontact-icon' }, icon('phone', { size: 20 })),
          h('span', { class: 'bcontact-text' }, h('span', { class: 'bcontact-label' }, 'Call us'), h('span', { class: 'bcontact-value num' }, SUPPORT.phone)))),
        h('li', {}, h('a', { class: 'bcontact', href: `mailto:${SUPPORT.email}`, testid: 'support-email' },
          h('span', { class: 'bcontact-icon' }, icon('mail', { size: 20 })),
          h('span', { class: 'bcontact-text' }, h('span', { class: 'bcontact-label' }, 'Email us'), h('span', { class: 'bcontact-value' }, SUPPORT.email))))),
      c.extra ? h('p', { class: 'bsupport-extra' }, c.extra) : null,
      h('div', { class: 'bsupport-note' }, tag(SUPPORT.note, { tone: 'brand' }), h('span', {}, 'Contact details and hours are awaiting MBA confirmation.')),
    ],
    actions: (api) => [btn('Close', { variant: 'secondary', testid: 'support-close', onClick: () => api.close() })],
  });
  return m.open();
}

/** Footer under every screen: legal name, Privacy Policy, Code of Conduct, DEMO. */
export function bfooter() {
  return h('footer', { class: 'bfoot', testid: 'b-footer' },
    h('div', { class: 'bfoot-legal' }, LEGAL_NAME),
    h('nav', { class: 'bfoot-links', attrs: { 'aria-label': 'Legal' } },
      link('Privacy Policy', PRIVACY_URL, { external: true, testid: 'privacy-link', cls: 'bfoot-link' }),
      link('Code of Conduct', CONDUCT_URL, { external: true, testid: 'conduct-link', cls: 'bfoot-link' }),
      h('span', { class: 'bfoot-demo' }, 'DEMO')));
}

// --------------------------------------------------------------------------------------------
// Downloadable receipt (C13): a small self-contained HTML file. All values are escaped.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** Builds the receipt file's HTML from a B8/B9 screen's data. */
export function receiptHtml(data, { final = false } = {}) {
  const a = data.attempt || {};
  const p = data.progress || {};
  const rows = [
    ['Amount paid', formatPHP(a.amount ?? 0)],
    ['Paid to', data.payee],
    ['Payment method', a.method || '—'],
    ['Date and time', a.paidAt ? `${fmtDateTime(a.paidAt)} PHT` : '—'],
    ['Reference', a.attemptId],
    ['Provider reference (simulated)', a.providerRef || '—'],
    ['Account', data.maskedAccount],
    ['Installments paid', `${p.paidCount} of ${p.count}`],
    ['Paid so far', `${formatPHP(p.paid ?? 0)} of ${formatPHP(p.total ?? 0)}`],
    ['Remaining balance', formatPHP(p.remaining ?? 0)],
  ];
  if (!final && p.next) rows.push(['Next installment', `${formatPHP(p.next.amount)} due ${fmtDate(p.next.dueDate)}`]);
  const trs = rows.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(RECEIPT_TITLE)} ${esc(a.attemptId)}</title>
<style>
body{margin:0;background:#F4F5F9;font-family:Montserrat,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#0B1020}
.demo{background:#4B0096;color:#fff;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:8px 20px;text-align:center}
.wrap{max-width:560px;margin:32px auto;background:#fff;border:1px solid #DDE1EB}
.top{height:4px;background:linear-gradient(90deg,#4B0096,#64C8FF)}
.in{padding:28px 32px}
.brand{font-weight:800;letter-spacing:.16em;text-transform:uppercase;font-size:14px}
h1{margin:18px 0 4px;font-size:24px;text-transform:uppercase;letter-spacing:.03em}
.sub{color:#4A5068;font-size:14px;margin:0 0 20px}
.amt{font-size:36px;font-weight:700;margin:8px 0 20px}
table{width:100%;border-collapse:collapse;font-size:14px}
th{text-align:left;color:#4A5068;font-weight:600;padding:10px 0;border-top:1px solid #DDE1EB;width:48%}
td{text-align:right;font-weight:600;padding:10px 0;border-top:1px solid #DDE1EB}
.ok{display:inline-block;background:#E6F6EC;color:#0B6B3A;font-weight:700;font-size:12px;padding:4px 10px;text-transform:uppercase;letter-spacing:.06em}
.foot{color:#4A5068;font-size:12px;margin-top:24px;line-height:1.6}
</style></head><body>
<div class="demo">Demo — not a real payment · simulated PayMongo test mode</div>
<div class="wrap"><div class="top"></div><div class="in">
<div class="brand">${esc(BRAND)}</div>
<h1>${esc(RECEIPT_TITLE)}</h1>
<p class="sub">${final ? 'Your arrangement is complete. Thank you.' : 'Thank you. Your payment has been verified.'}</p>
<span class="ok">${final ? 'Arrangement complete' : 'Payment verified'}</span>
<div class="amt">${esc(formatPHP(a.amount ?? 0))}</div>
<table>${trs}</table>
<p class="foot">This is a payment confirmation, not an official receipt.<br>${esc(LEGAL_NAME)} · ${esc(SUPPORT.phone)} · ${esc(SUPPORT.email)}<br>Generated from demo data only. No real money was moved.</p>
</div></div></body></html>
`;
}
