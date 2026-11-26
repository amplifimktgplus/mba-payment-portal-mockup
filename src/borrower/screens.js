// Borrower screens B0–B12 (D§6, V3 §9.2). Each renderer takes (ctx, data) where data comes from
// actions.borrowerScreen(state) and returns the screen's card. Domain changes go only through
// core actions; the views never decide payment truth (nothing is "paid" without deliverWebhook).
//
// Privacy: B0, B1 and B2 render only what borrowerScreen gives them for those screens
// (maskedMobile, otp timing, error) — never a creditor, amount or reference.

import {
  h, btn, icon, chip, tag, notice, spinner, segmented, input, field, toast, downloadFile,
  formatPHP, fmtDate, fmtDateTime,
} from '../ui/kit.js';
import { POLICIES, BRAND } from '../core/config.js';
import { isMidnight } from '../ui/look.js';
import { bui, bcard, bhead, bmark, openSupport, receiptHtml } from './parts.js';
import { METHOD_MARKS, METHOD_ICONS } from './payLogos.js';
// Midnight look (2026-11-26): extra parts built only when isMidnight() is true; Classic DOM is unchanged.
import { entering, moving, moneyParts, bigMoney, keypad, okMark, dueStack, glide, printer } from './midnight.js';

const EMPTY_DIGITS = () => ['', '', '', '', '', ''];
const OTP_MS = POLICIES.otpExpiryMin * 60000;

/** Real-time start of each OTP's visible 5:00 countdown, keyed by the code's sentAt. */
const otpDeadlines = new Map();

/**
 * Demo SMS (simulated): shown as a toast. No creditor, amount or reference (C11).
 * Only the newest code stays on screen; it closes once the borrower leaves B1/B2.
 */
let smsHandle = null;
export function closeSmsToast() {
  if (smsHandle) smsHandle.close();
  smsHandle = null;
}
export function smsToast(res) {
  closeSmsToast();
  if (!res?.code) return null;
  smsHandle = toast(`Demo SMS to ${res.maskedMobile}: Your ${BRAND} code is ${res.code}`, { kind: 'info', testid: 'otp-toast', duration: 60000 });
  return smsHandle;
}

const heroFor = (ctx) => {
  const b = ctx.store.get().borrower;
  return ctx.heroes.find((x) => (b.token && x.token === b.token) || (b.ref && x.ref === b.ref)) || null;
};

const clockText = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Label/value rows (used by B3 details, receipts, pending and failed summaries). */
function rows(list, { testid = null, cls = '' } = {}) {
  const dl = h('dl', { class: ['brows', cls], testid });
  for (const r of list) {
    if (!r) continue;
    const [k, v, o = {}] = r;
    dl.appendChild(h('div', { class: ['brow', o.cls || ''], testid: o.testid || null }, h('dt', {}, k), h('dd', { class: o.num ? 'num' : null }, v ?? '—')));
  }
  return dl;
}

/** One square cell per installment: paid / current / upcoming. Text alternative via aria-label. */
function segments(insts, currentSeq, { label }) {
  const wrap = h('div', { class: 'bsegs', attrs: { role: 'img', 'aria-label': label } });
  for (const i of insts) {
    const st = i.status === 'paid' ? 'paid' : i.seq === currentSeq ? (i.status === 'overdue' ? 'overdue' : 'current') : 'todo';
    wrap.appendChild(h('span', { class: ['bseg', `is-${st}`] }));
  }
  return wrap;
}

/** Progress block shared by B3 / B8 / B9. */
function progressBlock(ctx, d, { title, right = null, currentSeq = null, testid = 'b-progress' }) {
  const p = d.progress;
  const insts = ctx.selectors.installmentsOf(ctx.store.get(), d.arrangementId).filter((i) => i.status !== 'cancelled');
  return h('div', { class: 'bprog', testid },
    h('div', { class: 'bprog-top' },
      h('span', { class: 'bprog-title num' }, title),
      right ? h('span', { class: 'bprog-right num' }, right) : null),
    segments(insts, currentSeq, { label: `${p.paidCount} of ${p.count} installments paid` }),
    h('div', { class: 'bprog-bottom' },
      h('span', { class: 'num' }, `${p.paidCount} of ${p.count} installments paid`),
      h('span', {}, h('strong', { class: 'num' }, formatPHP(p.remaining)), ' remaining')));
}

// =============================================================================================
// B0 — Start (no link context)

function B0(ctx) {
  const ui = bui();
  const ref = input({
    name: 'ref', value: ui.refValue, placeholder: 'MBA-REF-2026-000000', testid: 'ref-input', cls: 'bref-input num',
    attrs: { autocomplete: 'off', spellcheck: 'false', autocapitalize: 'characters' },
    on: { input: (e) => { ui.refValue = e.target.value; } },
  });
  const form = h('form', { class: 'bform', attrs: { novalidate: true } },
    field({ label: 'Reference number', control: ref, hint: 'You’ll find it on your letter, email or text message from MBA.', error: ui.refError }),
    btn('Continue', { variant: 'primary', size: 'lg', block: true, type: 'submit', iconRight: 'arrowRight', testid: 'ref-continue' }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = ref.value.trim();
    if (!v) {
      ui.refError = 'Please enter your reference number.';
      ctx.rerender();
      return;
    }
    ui.refError = null;
    ui.refValue = '';
    ctx.actions.openByRef(ctx.store, v);
    const r = ctx.actions.sendOtp(ctx.store);
    if (r.ok) smsToast(r);
    else toast(r.message, { kind: 'warn' });
  });

  return bcard(ctx, {
    body: [
      bhead({ eyebrow: 'Payment portal', title: 'Pay your arrangement securely', lead: 'Enter your reference number to get started. For your privacy, we’ll ask you to confirm it’s you with a one-time code before showing any details.' }),
      form,
      h('ul', { class: 'btrust' },
        h('li', {}, icon('shield', { size: 18 }), h('span', {}, 'Your details stay private until you verify')),
        h('li', {}, icon('phoneDevice', { size: 18 }), h('span', {}, 'A 6-digit code is sent by text message')),
        h('li', {}, icon('lock', { size: 18 }), h('span', {}, 'Payments are confirmed before your balance changes'))),
      h('p', { class: 'bsmall' }, 'Have a payment link from us? Open it from your email or text message to skip this step.'),
    ],
  });
}

// =============================================================================================
// B1 — Pre-verification (link/QR or reference). Masked mobile only.

function B1(ctx, d) {
  const refMode = !!ctx.store.get().borrower.ref;
  const send = () => {
    const r = ctx.actions.sendOtp(ctx.store);
    if (r.ok) smsToast(r);
    else toast(r.message, { kind: 'warn', testid: 'otp-send-error' });
  };
  return bcard(ctx, {
    step: 'verify',
    helpVariant: 'notyou',
    body: [
      bhead({
        eyebrow: 'Welcome',
        title: 'First, let’s confirm it’s you',
        lead: refMode
          ? 'To keep your information private, we’ll send a 6-digit code to the mobile number registered to this reference.'
          : 'To keep your information private, we’ll send a 6-digit code to your mobile number.',
      }),
      refMode ? null : h('div', { class: 'bphone', testid: 'masked-mobile' },
        h('span', { class: 'bphone-icon' }, icon('phoneDevice', { size: 22 })),
        h('span', { class: 'bphone-text' },
          h('span', { class: 'bphone-label' }, 'Mobile ending'),
          h('span', { class: 'bphone-num num' }, d.maskedMobile))),
      btn('Send my code', { variant: 'primary', size: 'lg', block: true, iconRight: 'arrowRight', testid: 'b1-continue', onClick: send }),
      h('p', { class: 'bsmall bcenter' }, 'We’ll only show your account details after this check.'),
      h('div', { class: 'bnotyou' },
        h('span', {}, 'Not you?'),
        btn('Contact MBA', { variant: 'link', testid: 'not-you', onClick: () => openSupport('notyou') })),
    ],
  });
}

// =============================================================================================
// B2 — Verify it's you: six code boxes, 5:00 countdown, resend with cooldown.

function B2(ctx, d) {
  const ui = bui();
  const mn = isMidnight();
  const otp = d.otp || {};
  const refMode = !!ctx.store.get().borrower.ref;
  if (ui.otpFor !== otp.sentAt) {
    ui.otpFor = otp.sentAt;
    ui.digits = EMPTY_DIGITS();
    ui.otpNotice = null;
  }
  const expired = !!otp.canResend; // the demo lifts the cooldown only when the code expires
  if (otp.sentAt && !otpDeadlines.has(otp.sentAt)) otpDeadlines.set(otp.sentAt, Date.now() + OTP_MS);
  const deadline = otpDeadlines.get(otp.sentAt);

  const boxes = [];
  const verifyBtn = btn('Verify', { variant: 'primary', size: 'lg', block: true, testid: 'otp-verify', disabled: ui.digits.join('').length < 6, onClick: () => submit() });
  const sync = () => { verifyBtn.disabled = ui.digits.join('').length < 6; };
  const submit = () => {
    const code = ui.digits.join('');
    if (code.length < 6) return;
    ui.digits = EMPTY_DIGITS();
    ui.otpNotice = null;
    const r = ctx.actions.verifyOtp(ctx.store, code); // wrong / expired / locked are shown from state
    if (r.ok && isMidnight() && moving()) holdVerified(code);
    ctx.rerender();
    // A wrong code clears the boxes: put the cursor back in the first one (after the re-render).
    if (!r.ok) requestAnimationFrame(() => document.querySelector('[data-testid="otp-0"]')?.focus({ preventScroll: true }));
  };
  const fill = (from, text) => {
    const digits = String(text).replace(/\D/g, '').split('');
    let i = from;
    for (const ch of digits) {
      if (i > 5) break;
      ui.digits[i] = ch;
      boxes[i].value = ch;
      i += 1;
    }
    sync();
    if (ui.digits.every(Boolean)) submit();
    else boxes[Math.min(i, 5)].focus();
  };
  for (let i = 0; i < 6; i++) {
    const el = h('input', {
      type: 'text', class: 'otp-box num', value: ui.digits[i], testid: `otp-${i}`,
      attrs: { inputmode: 'numeric', autocomplete: i === 0 ? 'one-time-code' : 'off', pattern: '[0-9]*', 'aria-label': `Digit ${i + 1} of 6` },
      on: {
        focus: (e) => e.target.select(),
        input: (e) => {
          const v = e.target.value.replace(/\D/g, '');
          if (v.length > 1) { fill(i, v); return; }
          ui.digits[i] = v;
          e.target.value = v;
          sync();
          if (v && ui.digits.every(Boolean)) submit();
          else if (v && i < 5) boxes[i + 1].focus();
        },
        keydown: (e) => {
          if (e.key === 'Backspace' && !e.target.value && i > 0) {
            e.preventDefault();
            ui.digits[i - 1] = '';
            boxes[i - 1].value = '';
            boxes[i - 1].focus();
            sync();
          } else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); } else if (e.key === 'ArrowRight' && i < 5) { e.preventDefault(); boxes[i + 1].focus(); } else if (e.key === 'Enter') { e.preventDefault(); submit(); }
        },
        paste: (e) => {
          e.preventDefault();
          fill(i, (e.clipboardData || window.clipboardData)?.getData('text') || '');
        },
      },
    });
    boxes.push(el);
  }
  if (mn) {
    // ' ' placeholder → :placeholder-shown styles empty boxes. On touch screens the glass keypad is
    // the keyboard, so the phone's own keyboard stays down (typing and paste still work).
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    for (const b of boxes) {
      b.placeholder = ' ';
      if (touch) b.setAttribute('inputmode', 'none');
    }
  }

  let err = null;
  if (d.error === 'wrong') {
    const n = otp.attemptsLeft;
    err = notice(`That code didn’t match. You have ${n} ${n === 1 ? 'try' : 'tries'} left.`, { tone: 'danger', testid: 'otp-error' });
  } else if (d.error === 'expired' || expired) {
    err = notice('This code has expired. Please request a new code below.', { tone: 'warn', testid: 'otp-error' });
  }

  const resend = () => {
    const r = ctx.actions.sendOtp(ctx.store);
    if (r.ok) {
      smsToast(r);
      ui.otpNotice = { tone: 'ok', text: refMode && !r.code ? 'If this reference is valid, we’ve sent a new code.' : 'We’ve sent you a new code.' };
    } else {
      ui.otpNotice = { tone: 'info', text: r.message };
    }
    ctx.rerender();
  };

  // Midnight: the verified moment. Core has already verified the code (verifyOtp above); this very
  // screen stays up for a beat in its verified state (the boxes turn calm green, a check draws, the
  // timer row becomes "Verified · Welcome back"), then borrower.js renders the next screen.
  const vname = mn ? h('span', { class: 'mn-vname' }) : null;
  const vrow = mn ? h('p', { class: 'mn-vrow', attrs: { role: 'status' } }, okMark({ size: 22, cls: 'mn-okmark-sm' }), h('span', { class: 'mn-vpill' }, 'Verified'), vname) : null;
  const holdVerified = (code) => {
    const root = boxes[0]?.closest('.bscreen');
    if (!root || !vname) return;
    const st = ctx.store.get();
    const name = ctx.actions.borrowerScreen(st).data?.firstName;
    vname.textContent = name ? `Welcome back, ${name}.` : 'Welcome back.';
    boxes.forEach((b, i) => { b.value = code[i] || ''; b.disabled = true; });
    root.querySelectorAll('.mn-key, [data-testid="otp-verify"], [data-testid="otp-resend"]').forEach((k) => { k.disabled = true; });
    root.querySelector('[data-testid="otp-countdown"]')?.removeAttribute('data-deadline'); // the ticker lets go
    root.classList.remove('mn-enter');
    root.classList.add('mn-verified');
    ui.mnVerified = { at: Date.now(), key: st.borrower.token || st.borrower.ref, root };
  };

  return bcard(ctx, {
    step: 'verify',
    helpVariant: 'notyou',
    body: [
      bhead({
        eyebrow: 'Verify it’s you',
        title: 'Enter your 6-digit code',
        lead: refMode
          ? 'If this reference is valid, we’ve sent a 6-digit code to the mobile number on file.'
          : `We sent a 6-digit code to the mobile ending ${d.maskedMobile}.`,
      }),
      h('form', { class: 'bform', attrs: { novalidate: true }, on: { submit: (e) => { e.preventDefault(); submit(); } } },
        h('fieldset', { class: 'otp' },
          h('legend', { class: 'sr-only' }, 'One-time code'),
          h('div', { class: ['otp-boxes', mn && err ? 'has-error' : ''], testid: 'otp-boxes' }, boxes)),
        err,
        expired
          ? null
          : h('p', { class: 'otp-timer', testid: 'otp-timer', style: mn ? { '--mn-left': String(Math.max(0, Math.min(1, (deadline - Date.now()) / OTP_MS))) } : undefined },
            icon('clock', { size: 16 }), h('span', {}, 'Code expires in '),
            h('strong', { class: 'num', testid: 'otp-countdown', dataset: { deadline } }, clockText(deadline - Date.now()))),
        vrow,
        mn ? keypad(boxes) : null,
        verifyBtn),
      h('div', { class: 'otp-resend' },
        h('span', {}, 'Didn’t get a code?'),
        btn('Send a new code', { variant: 'link', testid: 'otp-resend', onClick: resend })),
      ui.otpNotice ? notice(ui.otpNotice.text, { tone: ui.otpNotice.tone, testid: 'otp-notice' }) : null,
      h('p', { class: 'bsmall' }, `For your security, codes work once and expire after ${POLICIES.otpExpiryMin} minutes. After ${POLICIES.otpMaxAttempts} incorrect tries we pause code entry for ${POLICIES.lockoutMin} minutes.`),
    ],
  });
}

/** Keeps every visible OTP countdown ticking; at 0:00 the code is expired through core. */
let ticker = null;
export function startOtpTicker(ctx) {
  if (ticker) return;
  ticker = setInterval(() => {
    const els = document.querySelectorAll('[data-testid="otp-countdown"][data-deadline]');
    if (!els.length) {
      clearInterval(ticker);
      ticker = null;
      return;
    }
    for (const el of els) {
      const left = Number(el.dataset.deadline) - Date.now();
      el.textContent = clockText(left);
      if (isMidnight()) el.closest('.otp-timer')?.style.setProperty('--mn-left', String(Math.max(0, Math.min(1, left / OTP_MS)))); // countdown ring
      if (left <= 0 && el.dataset.done !== '1') {
        el.dataset.done = '1';
        ctx.actions.expireOtpNow(ctx.store);
      }
    }
  }, 500);
}

// =============================================================================================
// B3 — Your payment arrangement

function B3(ctx, d) {
  const p = d.progress;
  const state = ctx.store.get();
  const insts = ctx.selectors.installmentsOf(state, d.arrangementId).filter((i) => i.status !== 'cancelled');
  const pay = () => {
    const r = ctx.actions.beginCheckout(ctx.store);
    if (!r.ok) toast(r.message, { kind: 'warn', testid: 'pay-error' });
  };
  const badge = d.overdue
    ? chip('overdue', { label: `Overdue · was due ${fmtDate(d.dueDate)}`, testid: 'due-badge', size: 'lg' })
    : chip('due', { label: `Due ${fmtDate(d.dueDate)}`, tone: 'info', testid: 'due-badge', size: 'lg' });

  const schedule = h('details', { class: 'bsched', testid: 'schedule' },
    h('summary', {}, h('span', {}, 'See your full payment schedule'), icon('chevronDown', { size: 18 })),
    h('ol', { class: 'bsched-list' }, insts.map((i) => {
      const isNow = i.seq === d.installmentSeq;
      let c;
      if (i.status === 'paid') c = chip('paid', { label: 'Paid' });
      else if (i.status === 'overdue') c = chip('overdue', { label: 'Overdue' });
      else if (isNow) c = chip('due', { label: 'Due now', tone: 'info' });
      else if (i.status === 'missed') c = chip('missed', { label: 'Missed' });
      else c = chip('scheduled', { label: 'Upcoming' });
      return h('li', { class: ['bsched-item', { 'is-now': isNow }] },
        h('span', { class: 'bsched-seq num' }, String(i.seq)),
        h('span', { class: 'bsched-date' }, fmtDate(i.dueDate)),
        h('span', { class: 'bsched-amt num' }, formatPHP(i.amount)),
        c);
    })));

  const mn = isMidnight();
  const head = bhead({
    eyebrow: `Hello, ${d.firstName}`,
    title: 'Your payment arrangement',
    lead: `Here’s your plan for ${d.creditorName} and what’s due now.`,
  });
  const amountCard = h('div', { class: ['bdue', { 'is-overdue': d.overdue }], testid: 'amount-due' },
    h('div', { class: 'bdue-top' },
      h('span', { class: 'bdue-label' }, 'Amount due now'),
      d.installmentSeq ? h('span', { class: 'bdue-inst num' }, `Installment ${d.installmentSeq} of ${p.count}`) : null),
    mn
      // Midnight: the amount counts up on arrival. The exact figure stays in amount-due-value (read by
      // screen readers and checks); the counting copy beside it is aria-hidden.
      ? h('div', { class: 'bdue-amount num' }, h('span', { class: 'sr-only', testid: 'amount-due-value' }, formatPHP(d.amountDue)), bigMoney(d.amountDue, { count: entering('B3') }))
      : h('div', { class: 'bdue-amount num', testid: 'amount-due-value' }, formatPHP(d.amountDue)),
    h('div', { class: 'bdue-meta' }, badge),
    d.overdue ? h('p', { class: 'bdue-note' }, 'This amount can still be paid through your link. Paying it brings your plan back up to date.') : null);
  const payBlock = h('div', { class: 'bpay' },
    btn(`Pay now ${formatPHP(d.amountDue)}`, { variant: 'primary', size: 'lg', block: true, icon: 'lock', testid: 'pay-now', onClick: pay }),
    h('p', { class: 'bmethods', testid: 'methods' }, h('span', { class: 'bmethods-label' }, 'Pay with'), h('span', {}, d.methods.join(' · '))));
  const prog = progressBlock(ctx, d, { title: `Installment ${d.installmentSeq ?? p.paidCount} of ${p.count} · ${formatPHP(p.paid)} paid of ${formatPHP(p.total)}`, currentSeq: d.installmentSeq });
  const details = rows([
    ['Creditor', d.creditorName, { testid: 'creditor' }],
    ['Account', d.maskedAccount, { num: true }],
    ['Agreed plan', `${d.plan.count} monthly payments of ${formatPHP(d.plan.installment)}`],
    ['Remaining balance', formatPHP(d.remaining), { num: true, testid: 'remaining', cls: 'brow-strong' }],
  ], { testid: 'arrangement-details' });
  const links = h('div', { class: 'blinks' },
    btn('Get help', { variant: 'link', icon: 'info', testid: 'get-help', onClick: () => openSupport('general') }),
    // Midnight: two spans so phones can break the line after the question (user request 2026-11-26).
    // Classic keeps the single string, so its rendering stays pixel-identical.
    btn(isMidnight() ? [h('span', { class: 'btn-label-a' }, 'Already paid at a bank?'), ' ', h('span', { class: 'btn-label-b' }, 'Send us your receipt')] : 'Already paid at a bank? Send us your receipt', { variant: 'link', icon: 'file', testid: 'bank-receipt', onClick: () => openSupport('bank') }));

  // Midnight: the amount card is notched glass with the next installments peeking above it (tap them
  // for the full schedule). Same blocks, same order; on wide screens they sit in two columns.
  const openSchedule = () => {
    schedule.open = true;
    schedule.scrollIntoView({ behavior: moving() ? 'smooth' : 'auto', block: 'nearest' });
  };
  return bcard(ctx, {
    step: 'review',
    cls: 'bcard-b3',
    body: mn
      ? [head, h('div', { class: 'mn-b3' },
        h('div', { class: 'mn-b3-main' },
          dueStack(amountCard, insts, d.installmentSeq, { onPeek: openSchedule }),
          payBlock,
          h('p', { class: 'mn-payee' }, icon('shield', { size: 16 }), h('span', {}, 'Paying ', h('strong', {}, d.payee)))),
        h('div', { class: 'mn-b3-side' }, prog, details, schedule, links))]
      : [head, amountCard, payBlock, prog, details, schedule, links],
  });
}

// =============================================================================================
// B4 — Simulated checkout (visibly separate). Payment-method tiles show the real method logos
// (product owner, 2026-11-26); never PayMongo's own logo or a look-alike of its checkout.

function B4(ctx, d) {
  const ui = bui();
  const mn = isMidnight();
  if (ui.methodFor !== d.requestId) {
    ui.methodFor = d.requestId;
    ui.method = d.methods[0];
    ui.outcome = heroFor(ctx)?.defaultOutcome || 'success';
  }
  if (!d.methods.includes(ui.method)) ui.method = d.methods[0];
  const slug = (m) => m.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  const methods = h('fieldset', { class: 'bmethod-list', testid: 'method-list' },
    h('legend', { class: 'bmethod-legend' }, 'Choose how to pay'),
    d.methods.map((m) => {
      const id = `method-${slug(m)}`;
      const marks = METHOD_MARKS[m];
      return h('label', { class: ['bmethod', 'fx-spot', { 'is-on': ui.method === m }], htmlFor: id },
        h('input', { type: 'radio', name: 'method', id, value: m, checked: ui.method === m, testid: id, on: { change: () => { ui.method = m; ctx.rerender(); } } }),
        h('span', { class: 'bmethod-check', attrs: { 'aria-hidden': 'true' } }, icon('check', { size: 12 })),
        h('span', { class: 'bmethod-mark', attrs: { 'aria-hidden': 'true' } },
          marks
            ? marks.map((k) => h('img', { class: 'bmethod-logo', src: k.src, alt: '', attrs: { 'data-mark': k.name } }))
            : icon(METHOD_ICONS[m] || 'bank', { size: 28 })),
        h('span', { class: 'bmethod-name' }, m, m === 'Card' ? h('span', { class: 'sr-only' }, ' (Visa or Mastercard)') : null));
    }));
  if (mn) glide(methods); // Midnight: one glowing edge glides to the chosen tile

  // MBA's version of the "you finish on the provider's page" reassurance. The last sentence is what
  // startCheckout guarantees: one active checkout per account, so a second payment is refused
  // while the first is still being confirmed.
  const providerNote = h('div', { class: 'bpaynote', testid: 'provider-note' },
    h('span', { class: 'bpaynote-icon', attrs: { 'aria-hidden': 'true' } }, icon('lock', { size: 18 })),
    h('p', { class: 'bpaynote-text' },
      h('strong', {}, 'You’ll finish paying on our payment provider’s secure page.'),
      ' Choosing a method above takes you there, so your card, wallet or bank details are entered with them and never reach MBA. This installment stays reserved for this payment until it’s confirmed, so it can’t be paid twice by mistake.'));

  const outcome = h('div', { class: 'bdemo', testid: 'outcome' },
    h('div', { class: 'bdemo-head' }, tag('DEMO', { tone: 'brand' }), h('span', {}, 'Choose what the simulated provider does')),
    segmented({
      label: 'Demo outcome',
      value: ui.outcome,
      testid: 'outcome-select',
      items: [
        { value: 'success', label: 'Success', testid: 'outcome-success' },
        { value: 'pending', label: 'Pending', testid: 'outcome-pending' },
        { value: 'failed', label: 'Failed', testid: 'outcome-failed' },
      ],
      onChange: (v) => { ui.outcome = v; ctx.rerender(); },
    }));

  const pay = () => {
    const r = ctx.actions.startCheckout(ctx.store, { method: ui.method, outcome: ui.outcome });
    if (!r.ok) toast(r.message, { kind: 'warn', testid: 'checkout-error' });
    else markStarted(r.attemptId);
  };

  const summary = [
    rows([
      ['Paying', d.payee, { testid: 'payee' }],
      ['Installment', d.installmentSeq ? `${d.installmentSeq} of ${d.progress.count}` : '—', { num: true }],
    ]),
    h('div', { class: 'bcheckout-amount' }, h('span', {}, 'Amount'), h('strong', { class: 'num', testid: 'checkout-amount' }, mn ? moneyParts(d.amountDue) : formatPHP(d.amountDue))),
  ];
  const paying = [
    methods,
    providerNote,
    outcome,
    btn(`Pay ${formatPHP(d.amountDue)}`, { variant: 'primary', size: 'lg', block: true, icon: 'lock', testid: 'checkout-pay', onClick: pay }),
    h('p', { class: 'bsmall bcenter' }, 'No card, wallet or bank details are entered in this demo.'),
  ];

  return bcard(ctx, {
    step: 'pay',
    body: [
      bhead({ eyebrow: 'Payment', title: 'Review and pay', lead: 'You’re paying your current installment. Your balance updates once the payment is confirmed.' }),
      h('section', { class: 'bcheckout', testid: 'checkout', attrs: { 'aria-label': 'Secure checkout (simulated)' } },
        h('header', { class: 'bcheckout-head' },
          h('span', { class: 'bcheckout-title' }, icon('lock', { size: 16 }), 'Secure checkout'),
          h('span', { class: 'bcheckout-sim' }, 'Simulated — PayMongo test-mode placeholder')),
        // Midnight groups the same blocks, in the same order, into "what you're paying" and "how";
        // on wide screens they sit side by side (summary left, methods and Pay right).
        h('div', { class: 'bcheckout-body' },
          mn ? [h('div', { class: 'mn-b4-sum' }, summary), h('div', { class: 'mn-b4-pay' }, paying)] : [...summary, ...paying])),
      btn('Back to my arrangement', { variant: 'ghost', icon: 'arrowLeft', testid: 'checkout-cancel', onClick: () => ctx.actions.cancelCheckout(ctx.store) }),
    ],
  });
}

/** Real start time of each attempt (for the demo delays), shared with borrower.js timers. */
export const attemptStarted = new Map();
const markStarted = (id) => attemptStarted.set(id, Date.now());

// =============================================================================================
// B5 — Checking your payment… (never says "Paid" from the redirect alone)

// The first three checks tick; provider confirmation is in progress; the balance update waits.
// Nothing here claims the payment is confirmed — that only happens through deliverWebhook.
const PIPE = [
  ['Payment details received', 'done'],
  ['Security signature checked', 'done'],
  ['Duplicate check passed', 'done'],
  ['Confirming with the payment provider', 'active'],
  ['Updating your balance', 'wait'],
];

function B5(ctx, d) {
  const a = d.attempt || {};
  return bcard(ctx, {
    step: 'pay',
    body: [
      bhead({
        mark: h('div', { class: 'bmark tone-brand bmark-spin', attrs: { 'aria-hidden': 'true' } }, spinner({ label: 'Checking' })),
        eyebrow: 'Please wait',
        title: 'Checking your payment…',
        lead: 'We’re confirming your payment with the payment provider. This page updates on its own — please don’t close it or pay again.',
      }),
      h('ol', { class: 'bpipe', testid: 'pipeline' }, PIPE.map(([label, st], i) => h('li', { class: ['bpipe-step', `is-${st}`], style: { '--i': String(i) } },
        h('span', { class: 'bpipe-mark', attrs: { 'aria-hidden': 'true' } }, st === 'done' ? icon('check', { size: 14 }) : null),
        h('span', { class: 'bpipe-label' }, label),
        h('span', { class: 'sr-only' }, st === 'done' ? ' — done' : st === 'active' ? ' — in progress' : ' — waiting')))),
      rows([
        ['Amount', formatPHP(a.amount ?? 0), { num: true }],
        ['Method', a.method],
        ['Reference', a.attemptId, { num: true, testid: 'attempt-ref' }],
      ]),
    ],
  });
}

// =============================================================================================
// B6 — Pending

function B6(ctx, d) {
  const a = d.attempt || {};
  const auto = ctx.store.get().demo.pendingDelay === 'auto';
  return bcard(ctx, {
    step: 'pay',
    body: [
      bhead({
        mark: bmark('clock', 'warn'),
        eyebrow: 'Payment pending',
        title: 'We’re confirming your payment',
        lead: 'Please don’t pay again. Some payments take a little longer to confirm. We’ll update this page as soon as it’s verified.',
      }),
      h('div', { class: 'bstatus' }, chip('pending', { label: 'Pending confirmation', size: 'lg', testid: 'pending-chip' })),
      rows([
        ['Amount', formatPHP(a.amount ?? 0), { num: true }],
        ['Method', a.method],
        ['Reference', a.attemptId, { num: true, testid: 'attempt-ref' }],
      ]),
      btn('Check status', {
        variant: 'secondary', size: 'lg', block: true, icon: 'refresh', testid: 'check-status',
        onClick: () => {
          const now = ctx.actions.borrowerScreen(ctx.store.get()).screen;
          if (now === 'B6') toast('Still confirming. There’s no need to pay again — this page will update.', { kind: 'info', testid: 'status-toast' });
          ctx.rerender();
        },
      }),
      btn(`Pay now ${formatPHP(d.amountDue)}`, { variant: 'primary', size: 'lg', block: true, disabled: true, icon: 'lock', testid: 'pay-disabled', title: 'Paying is paused while we confirm your payment' }),
      h('p', { class: 'bsmall bcenter' }, 'Paying is paused while we confirm your payment.'),
      h('p', { class: 'bdemo-note', testid: 'pending-demo-note' }, tag('DEMO', { tone: 'brand' }),
        h('span', {}, auto
          ? `This payment confirms on its own in about ${Math.round(POLICIES.pendingDelayMs / 1000)} seconds.`
          : 'Resolve it from MBA view → Transactions → Simulate webhook.')),
    ],
  });
}

// =============================================================================================
// B7 — Failed

function B7(ctx, d) {
  const ui = bui();
  const a = d.attempt || {};
  const retry = (other) => {
    if (other) {
      const i = d.methods.indexOf(a.method);
      ui.method = d.methods[(i + 1) % d.methods.length];
      ui.methodFor = d.requestId;
      ui.outcome = 'success';
    }
    const r = ctx.actions.beginCheckout(ctx.store);
    if (!r.ok) toast(r.message, { kind: 'warn' });
  };
  return bcard(ctx, {
    step: 'pay',
    body: [
      bhead({
        mark: bmark('alert', 'danger'),
        eyebrow: 'Payment not completed',
        title: 'Your payment wasn’t completed',
        lead: 'No money was taken for this attempt. You can try again, or choose another way to pay.',
      }),
      rows([
        ['Amount', formatPHP(a.amount ?? 0), { num: true }],
        ['Method', a.method],
        ['What happened', a.failureReason || 'The payment was not completed'],
        ['Reference', a.attemptId, { num: true, testid: 'attempt-ref' }],
      ]),
      h('div', { class: 'bactions' },
        btn('Try again', { variant: 'primary', size: 'lg', block: true, icon: 'refresh', testid: 'try-again', onClick: () => retry(false) }),
        btn('Choose another method', { variant: 'secondary', size: 'lg', block: true, testid: 'other-method', onClick: () => retry(true) })),
      btn('Back to my arrangement', { variant: 'ghost', icon: 'arrowLeft', testid: 'back-to-arrangement', onClick: () => ctx.actions.clearScreenOverride(ctx.store) }),
    ],
  });
}

// =============================================================================================
// B8 — Payment confirmation (never "Official Receipt")

function B8(ctx, d) {
  const a = d.attempt || {};
  const p = d.progress;
  const download = () => downloadFile(`MBA-receipt-${a.attemptId}.html`, 'text/html', receiptHtml(d));
  const mn = isMidnight();
  const receipt = h('div', { class: 'breceipt', testid: 'receipt' },
    mn ? h('div', { class: 'mn-rc-brand', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'mn-rc-logo' }), h('span', {}, BRAND)) : null,
    h('div', { class: 'breceipt-head' },
      h('span', { class: 'breceipt-label' }, 'Amount paid'),
      chip('paid', { label: 'Verified', testid: 'receipt-status' })),
    h('div', { class: 'breceipt-amount num', testid: 'receipt-amount' }, mn ? moneyParts(a.amount ?? 0) : formatPHP(a.amount ?? 0)),
    rows([
      ['Paid to', d.payee, { testid: 'receipt-payee' }],
      ['Method', a.method],
      ['Date and time', a.paidAt ? `${fmtDateTime(a.paidAt)} PHT` : '—', { num: true }],
      ['Reference', a.attemptId, { num: true, testid: 'receipt-ref', cls: 'brow-strong' }],
      ['Provider reference', h('span', { class: 'bprov' }, h('span', { class: 'num' }, a.providerRef || '—'), h('span', { class: 'bprov-sim' }, 'simulated')), { testid: 'receipt-provider' }],
    ], { cls: 'brows-receipt' }));
  const head = bhead({
    mark: mn ? okMark() : bmark('check', 'ok'),
    eyebrow: 'Payment verified',
    title: 'Payment confirmation',
    lead: `Thank you, ${d.firstName}. Your payment has been received and verified.`,
  });
  const after = [
    progressBlock(ctx, d, { title: 'Your progress', right: `${formatPHP(p.paid)} of ${formatPHP(p.total)} paid`, testid: 'b8-progress' }),
    p.next
      ? h('div', { class: 'bnext', testid: 'next-installment' },
        h('span', { class: 'bnext-icon' }, icon('arrangements', { size: 20 })),
        h('div', { class: 'bnext-text' },
          h('span', { class: 'bnext-label' }, 'Next installment'),
          h('span', { class: 'bnext-value' }, h('strong', { class: 'num' }, formatPHP(p.next.amount)), ` due ${fmtDate(p.next.dueDate)}`)))
      : null,
    notice(h('span', {}, `A confirmation was sent to your registered mobile ${d.maskedMobile}. `, tag('Simulated', { tone: 'neutral' })), { tone: 'ok', testid: 'sms-confirmation' }),
    h('div', { class: 'bactions' },
      btn('Download receipt', { variant: 'primary', size: 'lg', block: true, icon: 'download', testid: 'download-receipt', onClick: download }),
      btn('Back to my arrangement', { variant: 'secondary', size: 'lg', block: true, testid: 'back-to-arrangement', onClick: () => ctx.actions.clearScreenOverride(ctx.store) })),
    h('p', { class: 'bsmall bcenter' }, 'This is a payment confirmation, not an official receipt.'),
  ];
  return bcard(ctx, {
    step: 'done',
    cls: 'bcard-b8',
    // Midnight: the confirmation feeds out of a glass slot on arrival (still paper under reduced
    // motion). Same blocks, same order; on wide screens the paper sits left of progress and actions.
    body: mn
      ? [head, h('div', { class: 'mn-b8' },
        h('div', { class: 'mn-b8-paper' }, printer(receipt, { print: entering('B8') && moving() })),
        h('div', { class: 'mn-b8-side' }, after))]
      : [head, receipt, ...after],
  });
}

// =============================================================================================
// B9 — Settled

function B9(ctx, d) {
  const a = d.attempt;
  const p = d.progress;
  const mn = isMidnight();
  return bcard(ctx, {
    step: 'done',
    tone: 'ok',
    body: [
      bhead({
        mark: mn ? okMark() : bmark('check', 'ok'),
        eyebrow: 'Arrangement complete',
        title: 'Your arrangement is complete',
        lead: `Thank you, ${d.firstName}. Every payment in your plan has been received and verified. There’s nothing more to pay.`,
      }),
      h('div', { class: 'bsettled', testid: 'settled' },
        h('div', { class: 'bsettled-top' }, h('span', { class: 'bsettled-label' }, 'Total paid'), chip('settled', { label: 'Settled', size: 'lg', testid: 'settled-chip' })),
        h('div', { class: 'bsettled-amount num' }, mn ? moneyParts(p.paid) : formatPHP(p.paid)),
        h('div', { class: 'bsettled-sub' }, `${p.paidCount} of ${p.count} installments paid · ${d.creditorName}`)),
      a ? rows([
        ['Final payment', formatPHP(a.amount), { num: true }],
        ['Method', a.method],
        ['Date and time', a.paidAt ? `${fmtDateTime(a.paidAt)} PHT` : '—', { num: true }],
        ['Reference', a.attemptId, { num: true, testid: 'receipt-ref' }],
      ], { cls: 'brows-stack' }) : null,
      a ? btn('Download confirmation', { variant: 'primary', size: 'lg', block: true, icon: 'download', testid: 'download-confirmation', onClick: () => downloadFile(`MBA-receipt-${a.attemptId}.html`, 'text/html', receiptHtml(d, { final: true })) }) : null,
      h('p', { class: 'bsmall bcenter' }, 'Please keep this confirmation for your records.'),
    ],
  });
}

// =============================================================================================
// B10 — Link no longer valid (never for an expired payment request)

function B10(ctx) {
  const toRef = () => {
    ctx.actions.exitBorrower(ctx.store);
    ctx.router.go('#/b');
  };
  return bcard(ctx, {
    help: false,
    body: [
      bhead({
        mark: bmark('lock', 'neutral'),
        eyebrow: 'Link not active',
        title: 'This link is no longer valid',
        lead: 'For your security, this payment link has been turned off. This can happen if it was sent to the wrong number, or your arrangement has changed.',
      }),
      h('p', { class: 'btext' }, 'Please contact us and we’ll gladly send you a new link. If you have your reference number, you can also continue with it.'),
      h('div', { class: 'bactions' },
        btn('Contact MBA Support', { variant: 'primary', size: 'lg', block: true, icon: 'phone', testid: 'support-open', onClick: () => openSupport('general') }),
        btn('Use my reference number', { variant: 'secondary', size: 'lg', block: true, testid: 'enter-reference', onClick: toRef })),
    ],
  });
}

// =============================================================================================
// B11 — Nothing due / under review (status only, no Pay)

function B11(ctx, d) {
  const disputed = d.reason === 'disputed';
  return bcard(ctx, {
    help: false,
    body: [
      bhead({
        mark: bmark(disputed ? 'shield' : 'check', disputed ? 'info' : 'neutral'),
        eyebrow: disputed ? 'Under review' : 'Nothing due',
        title: disputed ? 'Your account is under review' : 'There’s nothing to pay right now',
        lead: disputed
          ? `Thank you for your patience${d.firstName ? `, ${d.firstName}` : ''}. Our team is looking into your account, so there’s nothing to pay while the review is open. We’ll contact you once it’s complete.`
          : 'You don’t have an active payment arrangement with us at the moment. If you think this isn’t right, or you’d like to set one up, we’re here to help.',
      }),
      h('div', { class: 'bstatus' }, disputed
        ? chip('in_review', { label: 'Under review', tone: 'info', size: 'lg', testid: 'b11-status' })
        : chip('none', { label: 'No payment due', tone: 'neutral', size: 'lg', testid: 'b11-status' })),
      btn('Contact MBA Support', { variant: 'primary', size: 'lg', block: true, icon: 'phone', testid: 'support-open', onClick: () => openSupport('general') }),
    ],
  });
}

// =============================================================================================
// B12 — Temporarily locked

function B12(ctx, d) {
  return bcard(ctx, {
    help: false,
    body: [
      bhead({
        mark: bmark('lock', 'warn'),
        eyebrow: 'Temporarily locked',
        title: 'Please try again later',
        lead: `For your security, we’ve paused code entry after ${POLICIES.otpMaxAttempts} incorrect codes. This protects your account from someone guessing.`,
      }),
      rows([
        ['You can try again after', d.lockedUntil ? `${fmtDateTime(d.lockedUntil)} PHT` : `${d.lockoutMin} minutes`, { num: true, testid: 'locked-until', cls: 'brow-strong' }],
      ], { cls: 'brows-stack' }),
      h('p', { class: 'btext' }, 'If you need help sooner, our team can assist you.'),
      btn('Contact MBA Support', { variant: 'primary', size: 'lg', block: true, icon: 'phone', testid: 'support-open', onClick: () => openSupport('general') }),
    ],
  });
}

export const SCREENS = Object.freeze({ B0, B1, B2, B3, B4, B5, B6, B7, B8, B9, B10, B11, B12 });
