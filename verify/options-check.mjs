// Headless check of the design-options page (dist/options.html), added 2026-11-26.
// Renders every concept screen alone at its design size, then the overview per option at desktop
// and phone widths. Fails on: a console or page error, any non-file network request, a leftover
// placeholder, horizontal overflow, an amount on the code screen (nothing before verification),
// "official receipt" other than "not an official receipt", or PayMongo named on a borrower screen.
// Screenshots: verify/shots/options/. Usage: node verify/options-check.mjs [--file dist/options.html]
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argi = process.argv.indexOf('--file');
const FILE = resolve(root, argi !== -1 ? process.argv[argi + 1] : 'dist/options.html');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = join(root, 'verify', 'shots', 'options');
const SIZE = { borrowerPhone: [390, 844], mbaPhone: [390, 844], borrowerDesktop: [1440, 900], mbaDesktop: [1440, 900] };
if (!existsSync(FILE)) { console.error(`options-check: ${FILE} missing — run: node build-options.mjs`); process.exit(2); }
mkdirSync(SHOTS, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-first-run'] });
const url = pathToFileURL(FILE).href;
const fails = [];
let checked = 0;

async function open(w, h, suffix) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.setRequestInterception(true);
  page.on('request', (r) => { const u = r.url(); if (/^(file|data|blob|about):/.test(u)) r.continue(); else { errors.push(`network: ${u.slice(0, 80)}`); r.abort(); } });
  await page.goto(url + suffix, { waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 1800));
  return { page, errors };
}

// enumerate screens from the page itself
const { page: p0, errors: e0 } = await open(1440, 900, '#a');
const options = await p0.evaluate(() => window.__OPTIONS__);
await p0.close();
if (e0.length) fails.push(`overview load: ${e0.join(' | ')}`);

for (const o of options) {
  for (const [key, ids] of Object.entries(o.sections)) {
    for (let i = 0; i < ids.length; i++) {
      const [w, h] = SIZE[key];
      const { page, errors } = await open(w, h, `?solo=${o.id}/${key}/${i}`);
      const r = await page.evaluate(() => {
        const scr = document.querySelector('.op-screen');
        const text = scr ? scr.innerText : '';
        return {
          stub: !!document.querySelector('.op-stub'),
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          empty: !scr || scr.getBoundingClientRect().height < 100,
          text,
        };
      });
      const id = `${o.id}/${key}/${ids[i]}`;
      const bad = [...errors];
      if (o.id !== 'today' && r.stub) bad.push('placeholder screen');
      if (r.overflow > 0) bad.push(`h-overflow ${r.overflow}px`);
      if (r.empty) bad.push('empty screen');
      if (o.id !== 'today') {
        if (ids[i] === 'code' && /₱/.test(r.text)) bad.push('an amount is shown before verification');
        const receipt = (r.text.match(/official receipt/gi) || []).length;
        const notReceipt = (r.text.match(/not an official receipt/gi) || []).length;
        if (receipt > notReceipt) bad.push('says "official receipt"');
        if (key.startsWith('borrower') && /paymongo/i.test(r.text)) bad.push('names PayMongo on a borrower screen');
      }
      await page.screenshot({ path: join(SHOTS, `${o.id}-${key}-${ids[i]}.png`) });
      await page.close();
      checked += 1;
      if (bad.length) fails.push(`${id}: ${bad.join(' | ')}`);
      console.log(`${bad.length ? 'FAIL' : 'ok  '} ${id}`);
    }
  }
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const { page, errors } = await open(w, h, `#${o.id}`);
    const r = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - window.innerWidth, frames: document.querySelectorAll('.op-panel:not([hidden]) .op-frame').length }));
    await page.screenshot({ path: join(SHOTS, `overview-${o.id}-${w}.png`), fullPage: true });
    await page.close();
    checked += 1;
    const bad = [...errors];
    if (r.overflow > 0) bad.push(`h-overflow ${r.overflow}px`);
    if (r.frames !== 8) bad.push(`${r.frames} frames, expected 8`);
    if (bad.length) fails.push(`overview #${o.id} @${w}: ${bad.join(' | ')}`);
    console.log(`${bad.length ? 'FAIL' : 'ok  '} overview #${o.id} @${w}`);
  }
}
await browser.close();
console.log(`options-check: ${checked} checks, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
