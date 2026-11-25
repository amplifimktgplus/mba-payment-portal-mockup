// Role permissions (V3 §2 PROPOSED matrix, as fixed by the plan). Disallowed actions stay
// visible but disabled, with deniedHint(action) as the explanation.

export const ROLES = ['admin', 'supervisor', 'agent', 'finance'];
export const ROLE_LABELS = Object.freeze({ admin: 'Admin', supervisor: 'Supervisor', agent: 'Agent', finance: 'Finance' });

const A = ['admin'];
const AS = ['admin', 'supervisor'];
const ASG = ['admin', 'supervisor', 'agent'];
const F = ['finance'];
const ALL = ROLES;

/** action → roles allowed. */
export const ALLOWED = Object.freeze({
  'creditor.manage': A,
  'portfolio.import': A,
  'account.assign': AS,
  'account.writeoff': AS,
  'account.hold': AS,        // additive: supervisor decision "Hold until date" (V3 §6)
  'account.escalate': ASG,   // additive: agent escalates to supervisor (V3 §6)
  'contact.log': ASG,
  'arrangement.draft': ASG,
  'attachment.upload': ASG,
  'request.send': ASG,
  'request.revoke': ASG,
  'arrangement.approve': AS,
  'arrangement.revise': AS,
  'arrangement.cancel': AS,
  'request.cancel': AS,
  'request.expireDemo': ALL,
  'recon.resolve': F,
  'payment.refund': F,
  'settings.view': ALL,
  'remittance.view': ALL,
});

/** The action keys. */
export const ACTIONS = Object.freeze(Object.keys(ALLOWED));

export function can(role, action) {
  const roles = ALLOWED[action];
  return Array.isArray(roles) && roles.includes(role);
}

/** Short reason shown on a disabled control, e.g. 'Requires Supervisor'. */
export function deniedHint(action) {
  const roles = ALLOWED[action];
  if (!roles) return 'Not available';
  if (roles.length === ROLES.length) return '';
  if (roles.length === 1) return `Requires ${ROLE_LABELS[roles[0]]}`;
  if (roles.includes('agent')) return 'Requires Agent or Supervisor';
  if (roles.includes('supervisor')) return 'Requires Supervisor';
  return `Requires ${roles.map((r) => ROLE_LABELS[r]).join(' or ')}`;
}
