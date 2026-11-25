// balanceAgree (review fix, blocking): the MBA view's account balance must agree with what the
// borrower sees and with the account's status (D§3 anti-goal "Numbers disagree across screens").
//   (a) Juan: MBA current balance = borrower B3 "Remaining balance" before paying, and = B8
//       "remaining" after paying; the placed − agreed gap is shown as "Settlement discount".
//   (d) Ana: paying the final installment → B9; MBA shows Settled and Current balance ₱0.00, with the
//       ₱6,000.00 settlement discount explaining the gap to the ₱26,000.00 placed balance.
//   Every Settled account reads ₱0.00 on screen; the open duplicate payment shows as Unapplied credit.
import { openHero, verifyFromB1, screenSel, screenText } from './borrower-happyPath.mjs';

const balText = (t, id) => t.text(`[data-testid="${id}"] .acc-bal-value`);

async function mbaAccount(page, t, id) {
  if (await t.exists('view-mba')) await t.click('view-mba');
  await t.goto(`#/m/accounts/${id}`);
  await t.waitFor('account-balances');
  return {
    status: await t.text('[data-testid="account-status"]'),
    placed: await balText(t, 'bal-placed'),
    paid: await balText(t, 'bal-paid'),
    discount: await balText(t, 'bal-discount'),
    credit: await balText(t, 'bal-credit'),
    current: await balText(t, 'bal-current'),
  };
}

async function payFromB3(t) {
  await t.click('pay-now');
  await t.waitFor(screenSel('B4'));
  await t.click('outcome-success');
  await t.click('checkout-pay');
}

export default async function balanceAgree(page, t) {
  // ---- (a) Juan, before paying
  await t.waitFor('page-title');
  const j0 = await mbaAccount(page, t, 'ac_juan');
  t.assert(j0.placed === '₱18,500.00' && j0.paid === '₱5,000.00' && j0.discount === '−₱3,500.00' && j0.current === '₱10,000.00', `Juan MBA before: ${JSON.stringify(j0)}`);
  // the account card on New arrangement (src/mba/arrangements.js) shows the same figures
  await t.goto('#/m/arrangements/new?account=ac_juan');
  await t.waitFor('arr-new-accountcard');
  const card = await t.textOf('arr-new-accountcard');
  t.assert(card.includes('Settlement discount') && (await t.textOf('arr-new-discount')) === '−₱3,500.00' && card.includes('Current balance₱10,000.00'), `New-arrangement card: ${card}`);
  await t.screenshot('balance-juan-mba-before');
  await openHero(t, 'juan');
  await t.waitUntil(() => window.location.hash.startsWith('#/b/t/'));
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  const b3Remaining = await t.textOf('remaining');
  t.assert(b3Remaining.includes(j0.current), `B3 remaining "${b3Remaining}" ≠ MBA current ${j0.current}`);
  await payFromB3(t);
  await t.waitFor(screenSel('B8'), { timeout: 6000 });
  const b8 = await screenText(t);
  t.assert(b8.includes('₱7,500.00 remaining'), 'B8 should show ₱7,500.00 remaining');
  const j1 = await mbaAccount(page, t, 'ac_juan');
  t.assert(j1.paid === '₱7,500.00' && j1.discount === '−₱3,500.00' && j1.current === '₱7,500.00', `Juan MBA after: ${JSON.stringify(j1)}`);
  await t.screenshot('balance-juan-mba-after');
  t.log(`Juan: B3 ${b3Remaining} = MBA ${j0.current}; after pay B8 ₱7,500.00 remaining = MBA ${j1.current} (discount ${j1.discount})`);

  // ---- (d) Ana, final installment → Settled
  await openHero(t, 'ana');
  await t.waitUntil(() => window.location.hash.startsWith('#/b/t/'));
  await verifyFromB1(page, t);
  await t.waitFor(screenSel('B3'));
  await payFromB3(t);
  await t.waitFor(screenSel('B9'), { timeout: 6000 });
  const b9 = await screenText(t);
  t.assert(/nothing more to pay/i.test(b9), 'B9 should say there is nothing more to pay');
  const a1 = await mbaAccount(page, t, 'ac_ana');
  t.assert(/settled/i.test(a1.status), `Ana status: ${a1.status}`);
  t.assert(a1.placed === '₱26,000.00' && a1.paid === '₱20,000.00' && a1.discount === '−₱6,000.00' && a1.current === '₱0.00', `Ana MBA after settle: ${JSON.stringify(a1)}`);
  await t.screenshot('balance-ana-mba-settled');
  t.log(`Ana: B9 complete; MBA ${a1.status} · placed ${a1.placed} − paid ${a1.paid} − discount ${a1.discount.slice(1)} = current ${a1.current}`);

  // ---- every Settled account reads ₱0.00 on screen
  const settled = await t.state((s) => Object.values(s.accounts).filter((a) => a.status === 'settled').map((a) => a.id).sort());
  const bad = [];
  for (const id of settled) {
    const b = await mbaAccount(page, t, id);
    if (b.current !== '₱0.00') bad.push(`${id}=${b.current}`);
  }
  t.assert(settled.length >= 26 && bad.length === 0, `settled accounts with a non-zero current balance: ${bad.join(', ') || 'none'} (of ${settled.length})`);
  t.log(`${settled.length} settled accounts, all Current balance ₱0.00`);

  // ---- the open duplicate payment: unapplied credit, never a negative balance
  const dupAcc = await t.state((s) => {
    const e = Object.values(s.exceptions).find((x) => x.type === 'duplicate_overpayment' && x.status === 'open');
    return s.payments[e.refs.paymentId].accountId;
  });
  const d = await mbaAccount(page, t, dupAcc);
  t.assert(d.credit && d.credit.startsWith('+₱') && d.credit !== '+₱0.00' && d.current === '₱0.00', `duplicate-payment account ${dupAcc}: ${JSON.stringify(d)}`);
  await t.screenshot('balance-duplicate-credit');
  t.log(`${dupAcc}: credit ${d.credit}, current ${d.current}`);
}
