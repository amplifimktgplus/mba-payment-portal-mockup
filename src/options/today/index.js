// "Today": the current demo design, as screenshots taken from the working mockup (build 1057007a,
// 2026-11-26) at the same frame sizes as the new options, so the three can be compared directly.
// Each frame scrolls to show the whole screen.
import bCode from './b-code.jpg';
import bDue from './b-due.jpg';
import bPay from './b-pay.jpg';
import bConfirm from './b-confirm.jpg';
import bDesk from './b-desk.jpg';
import mDash from './m-dash.jpg';
import mTxn from './m-txn.jpg';
import mPhone from './m-phone.jpg';

const shot = (src, alt) => (ctx) => ctx.h('div', { class: 't-shot', attrs: { tabindex: '0', 'aria-label': `${alt}, screenshot (scrolls)` } },
  ctx.h('img', { src, alt }));

export default {
  id: 'today',
  key: '0',
  tabLabel: 'Today',
  short: 'Today',
  eyebrow: 'Current design',
  name: 'Today',
  tagline: 'The working demo as it stands: MBA’s site look with the glass refresh. Shown here as screenshots at the same sizes, so you can compare like for like. Scroll inside a frame to see the whole screen.',
  points: [
    'Brand-faithful to ph.mbacgroup.com: purple, light blue, navy, uppercase Montserrat.',
    'Light pages with frosted panels, rounded corners and a moving glow.',
    'Everything here is the real, clickable demo; the options next door are concepts.',
  ],
  effects: [],
  statusBar: 'light',
  borrowerNote: 'Screenshots of the working demo on a phone, then on a desktop.',
  mbaNote: 'Screenshots of the working back office on a desktop, then on a phone.',
  sections: {
    borrowerPhone: [
      { id: 'code', title: 'Code entry', caption: 'Today’s B2', render: shot(bCode, 'Code entry, today') },
      { id: 'due', title: 'Amount due', caption: 'Today’s B3', render: shot(bDue, 'Amount due, today') },
      { id: 'pay', title: 'Choose how to pay', caption: 'Today’s B4', render: shot(bPay, 'Choose how to pay, today') },
      { id: 'confirm', title: 'Payment confirmation', caption: 'Today’s B8', render: shot(bConfirm, 'Payment confirmation, today') },
    ],
    borrowerDesktop: [{ id: 'desk', title: 'Amount due, desktop', caption: 'Today’s B3 at 1440', render: shot(bDesk, 'Borrower amount due on a desktop, today') }],
    mbaDesktop: [
      { id: 'dashboard', title: 'Dashboard', caption: 'Today’s MBA dashboard', render: shot(mDash, 'MBA dashboard, today') },
      { id: 'transactions', title: 'Transactions', caption: 'Today’s transaction history with the Attachments column', render: shot(mTxn, 'MBA transactions, today') },
    ],
    mbaPhone: [{ id: 'dashboard-phone', title: 'Dashboard on a phone', caption: 'Today’s dashboard at 390', render: shot(mPhone, 'MBA dashboard on a phone, today') }],
  },
};
