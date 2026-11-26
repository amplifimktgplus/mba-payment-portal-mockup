// One config object for every policy value (design C9: screens never hard-code these).
// Values are V3 PROPOSED/OPEN defaults — "Assumption — awaiting MBA decision".

export const BRAND = 'MBA CONSULT';
export const LEGAL_NAME = 'M.B.A. Consulting Philippines';
export const APP_TITLE = 'MBA CONSULT · Payment Portal (Demo)';
export const BANNER_TEXT = 'DEMO — no real payments · simulated PayMongo test mode';
export const RECEIPT_TITLE = 'Payment confirmation'; // never "Official Receipt" (D§6 B8, Q-28)
export const QR_BASE = 'https://pay.example/t/';      // reserved demo domain (C14)
export const PRIVACY_URL = 'https://ph.mbacgroup.com/debtors/patakaran-sa-privacy/';
export const CONDUCT_URL = 'https://ph.mbacgroup.com/debtors/norms/';
export const SUPPORT = Object.freeze({
  phone: '+63 998 58 64 100',
  email: 'info@ph.mbacgroup.com',
  note: 'To be confirmed — Q-14',
});
export const ASSUMPTION_TAG = 'Assumption — awaiting MBA decision';

/** Payee line on checkout and receipts (C10). */
export const payeeLine = (creditorName) => `${creditorName} · collected by ${LEGAL_NAME}`;

export const POLICIES = Object.freeze({
  otpExpiryMin: 5,
  otpMaxAttempts: 5,
  lockoutMin: 15,
  resendCooldownMin: 10,
  resendMaxPerDay: 5,
  requestGraceDays: 5,
  reminders: Object.freeze(['D-3', 'D0', 'D+1']),
  defaultThreshold: 2,
  earlyPayoff: false,
  methods: Object.freeze(['GCash', 'Maya', 'QR Ph', 'Online banking', 'Card', 'MariBank']),
  feeBorneBy: 'MBA',
  feePct: 2.5,
  sessionIdleMin: 15,
  completedReadOnlyDays: 30,
  pendingDelayMs: 8000,
  successDelayMs: 1200,
});

const P = POLICIES;
/** Read-only Policies page rows (D§7.11). Values are derived from POLICIES, never typed twice. */
export const POLICY_META = Object.freeze([
  { key: 'otp', label: 'OTP expiry / max attempts / lockout', value: `${P.otpExpiryMin} min / ${P.otpMaxAttempts} / ${P.lockoutMin} min`, qid: '§9.2' },
  { key: 'resend', label: 'Resend cooldown', value: `${P.resendCooldownMin} min, max ${P.resendMaxPerDay}/day`, qid: 'Q-12' },
  { key: 'grace', label: 'Request grace after due date', value: `${P.requestGraceDays} days`, qid: 'Q-11' },
  { key: 'reminders', label: 'Reminder schedule', value: P.reminders.join(', '), qid: 'Q-23' },
  { key: 'threshold', label: 'Default threshold', value: `${P.defaultThreshold} missed installments`, qid: 'Q-23' },
  { key: 'earlyPayoff', label: 'Allow early full payoff', value: P.earlyPayoff ? 'On' : 'Off', qid: 'Q-13' },
  { key: 'methods', label: 'Enabled payment methods', value: `${P.methods.join(', ')} (min 3)`, qid: '§10.2' },
  { key: 'fee', label: 'PayMongo fee borne by', value: `${P.feeBorneBy} (${P.feePct}% simulated)`, qid: 'Q-17' },
  { key: 'support', label: 'Support contacts / hours', value: `${SUPPORT.phone} · ${SUPPORT.email} (to confirm)`, qid: 'Q-14' },
]);
