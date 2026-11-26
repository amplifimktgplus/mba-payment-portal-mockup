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

**Two looks.** The demo opens in **Midnight**: deep navy, frosted glass and slow aurora light. **Classic**, the earlier MBA-site look, is one click away under **Demo tools → Look**. Your browser remembers the choice, and adding `?look=classic` or `?look=midnight` to the address overrides it for one visit.

## Design options (concepts)

`dist/options.html` is a separate page that compares today's design with two new directions: **A · Midnight**, which is dark and immersive, and **B · Daylight**, which is light and bold. Each direction shows live concept screens: the Borrower view on a phone and a desktop, and the MBA back office on a desktop and a phone. The screens use the demo's own figures. The demo itself doesn't change.

```bash
npm run build:options   # writes dist/options.html
npm run check:options   # renders every screen headless and checks it
```

## Checks

```bash
npm test           # unit tests
npm run e2e        # browser walkthroughs of dist/index.html (needs Google Chrome; set CHROME_PATH if it isn't in /Applications)
```

## Built with

Plain JavaScript modules bundled into one file by esbuild, qrcode-generator for the payment QR code, and puppeteer-core for the browser walkthroughs. The Montserrat font is included under the SIL Open Font License; see `src/assets/fonts/OFL.txt`. The payment-method logos are trademarks of their owners and appear only to show which methods are accepted. Their sources and licences are listed in `src/assets/pay/CREDITS.md`.
