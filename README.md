# MBA Collections payment portal: interactive mockup

A clickable one-page mockup of the MBA Collections payment portal. A switch at the top moves between two views:

- **Borrower view:** what a borrower sees after opening a payment link. They confirm who they are with a one-time code, review what's due, and pay.
- **MBA view:** the back office. Every menu is clickable: Dashboard, Creditors, Portfolios, Accounts, Arrangements, Payment requests, Transactions, Reconciliation, Reports, Remittances and Settings. A role switcher shows what an agent, supervisor, finance user or admin can each do.

**Live preview:** https://amplifimktgplus.github.io/mba-payment-portal-mockup/

> **Demo only.** All names, accounts and amounts are made up, and no real payments are taken. Everything runs in your browser: the page doesn't contact any server or payment service. The payment step simulates a PayMongo test-mode checkout. PayMongo is the planned payment gateway; this mockup isn't connected to it.

## Run it locally

The build produces one self-contained HTML file that works offline.

```bash
npm install
npm run build      # writes dist/index.html
open dist/index.html
```

Demo changes are saved in your browser. To start over, use **Demo tools → Reset demo**.

## Checks

```bash
npm test           # unit tests
npm run e2e        # browser walkthroughs of dist/index.html (needs Google Chrome; set CHROME_PATH if it isn't in /Applications)
```

## Built with

Plain JavaScript modules bundled into one file by esbuild, qrcode-generator for the payment QR code, and puppeteer-core for the browser walkthroughs. The Montserrat font is included under the SIL Open Font License; see `src/assets/fonts/OFL.txt`.
