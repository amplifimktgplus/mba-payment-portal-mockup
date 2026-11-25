// End-to-end runner (plan Task 4). Drives the built single-file page in the system Chrome.
//
//   node verify/e2e.mjs [--file dist/index.html] [--only <scenario>[,<scenario>]] [--headful]
//
// - Scenarios are loaded automatically from verify/scenarios/*.mjs. Each exports
//   `default async function (page, helpers)`; the scenario name is the file name.
// - Every scenario gets a FRESH incognito browser context (own localStorage) at 1440×900,
//   with the page loaded and the app ready.
// - Offline guarantee: every request that is not file:/data:/blob:/about: is aborted and fails
//   the scenario. Any console error or page error also fails it.
// - Exit code 0 only if every scenario passes.

import puppeteer from 'puppeteer-core';
import { readdirSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve, basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1] ?? null;
};
const FILE = resolve(root, argOf('--file') || 'dist/index.html');
const ONLY = (argOf('--only') || '').split(',').map((s) => s.trim()).filter(Boolean);
const HEADFUL = args.includes('--headful');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SCEN_DIR = join(root, 'verify', 'scenarios');
const SHOTS = join(root, 'verify', 'shots');
const ALLOWED_SCHEMES = ['file:', 'data:', 'blob:', 'about:', 'chrome-extension:', 'devtools:'];

if (!existsSync(FILE)) {
  console.error(`e2e: ${FILE} does not exist — run: node build.mjs --out ${argOf('--file') || 'dist/index.html'}`);
  process.exit(2);
}
mkdirSync(SHOTS, { recursive: true });

class AssertionError extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sel = (testid) => `[data-testid="${testid}"]`;

function makeHelpers(page, log, name) {
  const url = pathToFileURL(FILE).href;
  const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const helpers = {
    page,
    url,
    sel,
    sleep,
    settle,
    /** Throws (fails the scenario) unless cond is truthy. */
    assert(cond, msg) {
      if (!cond) throw new AssertionError(msg || 'assertion failed');
    },
    /** Navigates to a hash route ('#/m/accounts') and waits for the render. */
    async goto(hash) {
      await page.evaluate((h) => { window.location.hash = h; }, hash.startsWith('#') ? hash : `#${hash}`);
      await settle();
      await settle();
    },
    /** Waits for [data-testid=testid] (or a CSS selector if it contains [ . # or space). */
    async waitFor(target, { timeout = 5000, visible = true } = {}) {
      const s = /[[.#\s>]/.test(target) ? target : sel(target);
      return page.waitForSelector(s, { timeout, visible });
    },
    /** Clicks [data-testid=testid] after waiting for it; waits for the re-render. */
    async click(testid, { timeout = 5000 } = {}) {
      const s = /[[.#\s>]/.test(testid) ? testid : sel(testid);
      const el = await page.waitForSelector(s, { timeout, visible: true });
      await el.click();
      await settle();
      return el;
    },
    /** Types into [data-testid=testid] (clears first). */
    async type(testid, text, { clear = true } = {}) {
      const s = /[[.#\s>]/.test(testid) ? testid : sel(testid);
      const el = await page.waitForSelector(s, { visible: true });
      if (clear) await el.evaluate((n) => { n.value = ''; n.dispatchEvent(new Event('input', { bubbles: true })); });
      await el.type(String(text));
      await settle();
      return el;
    },
    /** textContent of the first match of a CSS selector, whitespace-collapsed; null if absent. */
    async text(selector) {
      const s = selector;
      return page.evaluate((q) => {
        const n = document.querySelector(q);
        return n ? n.textContent.replace(/\s+/g, ' ').trim() : null;
      }, s);
    },
    /** textContent of [data-testid=testid]. */
    async textOf(testid) {
      return helpers.text(sel(testid));
    },
    async exists(selector) {
      const s = /[[.#\s>]/.test(selector) ? selector : sel(selector);
      return page.evaluate((q) => !!document.querySelector(q), s);
    },
    /** Polls until fn() (run in the page) returns truthy. */
    async waitUntil(fn, { timeout = 5000, arg } = {}) {
      await page.waitForFunction(fn, { timeout, polling: 50 }, arg);
    },
    /** Waits until the text of selector includes str. */
    async waitForText(selector, str, { timeout = 5000 } = {}) {
      const s = /[[.#\s>]/.test(selector) ? selector : sel(selector);
      await page.waitForFunction((q, t) => {
        const n = document.querySelector(q);
        return n && n.textContent.includes(t);
      }, { timeout, polling: 50 }, s, str);
    },
    /** Reads app state through the debug handle: state((s) => s.role). */
    async state(fnSrc) {
      return page.evaluate(`(${fnSrc.toString()})(window.__MBA__.store.get())`);
    },
    /** Full-page or viewport screenshot to verify/shots/<name>.png. */
    async screenshot(shotName, { fullPage = false } = {}) {
      const path = join(SHOTS, `${shotName}.png`);
      await settle();
      // Let entrance animations finish so the shot shows the settled screen.
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), { timeout: 3000, polling: 50 }).catch(() => {});
      await page.screenshot({ path, fullPage });
      log.shots.push(path);
      return path;
    },
    /** Console errors + page errors + blocked requests so far. */
    consoleErrors() {
      return [...log.errors];
    },
    blockedRequests() {
      return [...log.blocked];
    },
    log: (...m) => log.notes.push(m.join(' ')),
    name,
  };
  return helpers;
}

async function loadScenarios() {
  const files = readdirSync(SCEN_DIR).filter((f) => f.endsWith('.mjs')).sort();
  const out = [];
  for (const f of files) {
    const name = basename(f, '.mjs');
    if (ONLY.length && !ONLY.includes(name)) continue;
    const mod = await import(pathToFileURL(join(SCEN_DIR, f)).href);
    if (typeof mod.default !== 'function') {
      out.push({ name, fn: null, error: 'no default export function' });
      continue;
    }
    out.push({ name, fn: mod.default });
  }
  if (ONLY.length) {
    for (const o of ONLY) if (!out.find((s) => s.name === o)) out.push({ name: o, fn: null, error: `no scenario file verify/scenarios/${o}.mjs` });
  }
  return out;
}

async function runScenario(browser, scen) {
  const log = { errors: [], blocked: [], shots: [], notes: [] };
  const context = await browser.createBrowserContext();
  const downloads = join(tmpdir(), `mba-e2e-dl-${process.pid}-${scen.name}`);
  mkdirSync(downloads, { recursive: true });
  const page = await context.newPage();
  try {
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, browserContextId: context.id }).catch(() => {});
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if (ALLOWED_SCHEMES.some((s) => u.startsWith(s))) {
        req.continue().catch(() => {});
      } else {
        log.blocked.push(u);
        req.abort('blockedbyclient').catch(() => {});
      }
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') log.errors.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => log.errors.push(`pageerror: ${err.message}`));

    const helpers = makeHelpers(page, log, scen.name);
    helpers.downloads = downloads;
    await page.goto(helpers.url, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.appReady === '1', { timeout: 8000 });
    await helpers.settle();

    const t0 = Date.now();
    await scen.fn(page, helpers);
    const ms = Date.now() - t0;
    await helpers.settle();
    const problems = [];
    if (log.errors.length) problems.push(`console/page errors: ${log.errors.join(' | ')}`);
    if (log.blocked.length) problems.push(`network requests blocked (offline guarantee): ${log.blocked.join(', ')}`);
    return { ok: problems.length === 0, ms, problems, log };
  } catch (err) {
    const extra = log.errors.length ? ` [errors: ${log.errors.join(' | ')}]` : '';
    try {
      await page.screenshot({ path: join(SHOTS, `FAIL-${scen.name}.png`) });
      log.shots.push(join(SHOTS, `FAIL-${scen.name}.png`));
    } catch { /* page may be gone */ }
    return { ok: false, ms: 0, problems: [`${err instanceof AssertionError ? 'assert' : err.name}: ${err.message}${extra}`], log };
  } finally {
    await context.close().catch(() => {});
    rmSync(downloads, { recursive: true, force: true });
  }
}

const scenarios = await loadScenarios();
if (!scenarios.length) {
  console.error('e2e: no scenarios found');
  process.exit(2);
}
console.log(`e2e: ${FILE}`);
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: !HEADFUL,
  args: ['--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files'],
});
let failed = 0;
let blockedTotal = 0;
try {
  for (const scen of scenarios) {
    if (!scen.fn) {
      failed++;
      console.log(`FAIL ${scen.name}: ${scen.error}`);
      continue;
    }
    const res = await runScenario(browser, scen);
    blockedTotal += res.log.blocked.length;
    for (const n of res.log.notes) console.log(`  · ${n}`);
    if (res.ok) {
      console.log(`PASS ${scen.name} (${res.ms} ms)${res.log.shots.length ? ` shots: ${res.log.shots.map((p) => basename(p)).join(', ')}` : ''}`);
    } else {
      failed++;
      console.log(`FAIL ${scen.name}: ${res.problems.join(' ; ')}`);
    }
  }
} finally {
  await browser.close();
}
console.log(`e2e: offline — every non-file:/data:/blob:/about: request is aborted and fails its scenario; ${blockedTotal} such request(s) attempted in this run`);
console.log(`e2e: ${scenarios.length - failed}/${scenarios.length} scenarios passed`);
process.exit(failed ? 1 : 0);
