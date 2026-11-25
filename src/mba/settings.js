// Settings (MBA view, plan Task 9, D§7.11, C9): the Policies page, read-only. Every value comes
// from config.POLICY_META (derived from POLICIES — the one object the app reads), each with its
// V3 reference and the "Assumption — awaiting MBA decision" tag. Live knobs were dropped (U8).
// Also shows the role permission matrix the role switcher enforces (V3 §2), read-only.
import { renderMbaLayout } from './layout.js';

export function register(router, ctx) {
  router.on('/m/settings', () => renderMbaLayout(ctx, renderSettings(ctx), 'settings'));
}

/** Plain-English names for the permission keys (V3 §2). */
const ACTION_LABELS = {
  'creditor.manage': 'Add and edit creditors',
  'portfolio.import': 'Import portfolio files',
  'account.assign': 'Assign accounts',
  'account.writeoff': 'Write off an account',
  'account.hold': 'Put an account on hold',
  'account.escalate': 'Escalate an account',
  'contact.log': 'Log contact attempts',
  'arrangement.draft': 'Draft an arrangement',
  'attachment.upload': 'Upload attachments',
  'request.send': 'Send the payment link',
  'request.revoke': 'Revoke the payment link',
  'arrangement.approve': 'Approve or reject an arrangement',
  'arrangement.revise': 'Revise an arrangement',
  'arrangement.cancel': 'Cancel an arrangement',
  'request.cancel': 'Cancel a payment request',
  'request.expireDemo': 'Expire a request now (demo)',
  'recon.resolve': 'Resolve reconciliation exceptions',
  'payment.refund': 'Refund a payment',
  'settings.view': 'View policies',
  'remittance.view': 'View remittances',
};

function renderSettings(ctx) {
  const { h, pageHeader, card, notice, table, tag, qtag, icon } = ctx.kit;
  const { POLICY_META, ASSUMPTION_TAG } = ctx.config;
  const { ROLES, ROLE_LABELS, ACTIONS, can } = ctx.permissions;
  const role = ctx.store.get().role;

  const policies = card({
    eyebrow: 'Policies', title: 'Assumed values', flush: true, testid: 'policies',
    body: table({
      testid: 'policy-table', pageSize: 50,
      rowTestid: (r) => `policy-${r.key}`,
      columns: [
        { key: 'label', label: 'Policy', render: (r) => h('strong', { class: 'set-policy' }, r.label) },
        { key: 'value', label: 'Assumed value', render: (r) => h('span', { class: 'set-value' }, r.value) },
        { key: 'qid', label: 'V3 ref', render: (r) => qtag(r.qid) },
        { key: 'status', label: 'Status', sortable: false, render: () => tag(ASSUMPTION_TAG, { tone: 'warn' }) },
      ],
      rows: POLICY_META,
    }),
  });

  const yes = (on) => (on
    ? h('span', { class: 'set-yes', attrs: { role: 'img', 'aria-label': 'Allowed' } }, icon('check', { size: 16 }))
    : h('span', { class: 'set-no', attrs: { role: 'img', 'aria-label': 'Not allowed' } }, '—'));
  const perms = card({
    eyebrow: 'Roles', title: 'Who can do what', flush: true, testid: 'permissions',
    actions: h('span', { class: 'muted set-viewing' }, `Viewing as ${ROLE_LABELS[role]}`),
    body: table({
      testid: 'perm-table', pageSize: 50, dense: true,
      columns: [
        { key: 'label', label: 'Action', render: (r) => r.label },
        ...ROLES.map((ro) => ({ key: ro, label: ROLE_LABELS[ro], align: 'center', sortable: false, cls: ro === role ? 'set-col-on' : '', render: (r) => yes(r[ro]) })),
      ],
      rows: ACTIONS.map((a) => ({ key: a, label: ACTION_LABELS[a] || a, ...Object.fromEntries(ROLES.map((ro) => [ro, can(ro, a)])) })),
    }),
  });

  return h('div', { class: 'page page-settings' },
    pageHeader({
      eyebrow: 'System',
      title: 'Settings',
      subtitle: 'The policies this mockup assumes. Each one is waiting for an MBA decision, so it is shown here, read-only, with its V3 reference.',
      meta: tag(ASSUMPTION_TAG, { tone: 'warn', testid: 'assumption-tag' }),
    }),
    h('div', { class: 'stack' },
      notice('Every screen reads these values from one place, so changing a decision later changes the whole platform consistently. Nothing on this page can be edited in the mockup.', { tone: 'info', title: 'Read-only' }),
      policies,
      perms,
      h('p', { class: 'muted set-foot' }, 'Permissions follow the V3 §2 proposed matrix. Disallowed actions stay visible but disabled across the back office, with a hint such as “Requires Supervisor”. Switch roles with “Viewing as” in the top bar.')));
}
