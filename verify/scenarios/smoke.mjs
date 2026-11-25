// Smoke (plan Task 4): no console errors; all 11 nav items show a non-empty page title; the view
// toggle switches views and restores each view's last route; role switcher, global search,
// notifications and Demo tools work; Reset demo restores the seed.

const NAV = ['dashboard', 'creditors', 'portfolios', 'accounts', 'arrangements', 'requests', 'transactions', 'reconciliation', 'reports', 'remittances', 'settings'];
const BANNER = 'DEMO — no real payments · simulated PayMongo test mode';

export default async function smoke(page, t) {
  const hash = () => page.evaluate(() => window.location.hash);

  // Boot: default route, banner, header.
  await t.waitFor('page-title');
  t.assert((await hash()) === '#/m/dashboard', `boot route is ${await hash()}`);
  t.assert((await t.textOf('banner-text')) === BANNER, `banner text: ${await t.textOf('banner-text')}`);
  t.assert(await t.exists('img.lockup-logo'), 'logo missing');

  // Every nav item renders a titled page, marks itself current, and changes the hash.
  for (const id of NAV) {
    await t.click(`nav-${id}`);
    await t.waitUntil((want) => window.location.hash === want, { arg: `#/m/${id}` });
    const title = await t.textOf('page-title');
    t.assert(title && title.length > 0, `nav-${id}: empty page title`);
    const current = await page.$eval(`[data-testid="nav-${id}"]`, (a) => a.getAttribute('aria-current'));
    t.assert(current === 'page', `nav-${id}: aria-current=${current}`);
    t.log(`nav-${id} → "${title}"`);
  }

  // Back to the dashboard for the MBA screenshot.
  await t.click('nav-dashboard');
  await t.screenshot('shell-mba-1440');

  // Toggle to Borrower: lands on #/b, shows a borrower screen root with data-screen.
  await t.click('view-borrower');
  await t.waitFor('[data-screen]');
  t.assert((await hash()).startsWith('#/b'), `borrower hash ${await hash()}`);
  t.assert(await t.exists('[data-testid="view-borrower"][aria-pressed="true"]'), 'borrower toggle not pressed');
  await t.screenshot('shell-borrower-1440');

  // Toggle back: restores the MBA view's last route.
  await t.click('view-mba');
  await t.waitUntil(() => window.location.hash === '#/m/dashboard');
  await t.click('nav-settings');
  await t.click('view-borrower');
  await t.click('view-mba');
  await t.waitUntil(() => window.location.hash === '#/m/settings');
  t.log('toggle restores lastRoute.mba = #/m/settings');

  // Unknown route → redirected to a real one.
  await t.goto('#/nowhere');
  await t.waitUntil(() => window.location.hash === '#/m/settings');

  // Role switcher.
  await page.select('[data-testid="role-switcher"]', 'supervisor');
  await t.settle();
  t.assert((await t.state((s) => s.role)) === 'supervisor', 'role did not change to supervisor');
  await t.waitFor('role-toast');

  // Global search → account route.
  await t.type('global-search', 'Juan');
  await t.click('search-result-ac_juan');
  await t.waitUntil(() => window.location.hash === '#/m/accounts/ac_juan');
  t.assert((await t.textOf('page-title')).length > 0, 'account page title empty');

  // Notifications dropdown.
  const before = await t.state((s) => s.notifications.filter((n) => !n.read).length);
  await t.click('notifications');
  await t.waitFor('notif-panel');
  const after = await t.state((s) => s.notifications.filter((n) => !n.read).length);
  t.assert(after === 0, `opening notifications should mark read (before ${before}, after ${after})`);
  await page.mouse.click(700, 600);
  await t.settle();
  t.assert(!(await t.exists('notif-panel')), 'notifications panel did not close on outside click');

  // Demo tools → hero shortcut opens Juan's link as a fresh borrower session (B1).
  await t.click('demo-tools');
  await t.waitFor('demo-drawer');
  t.assert((await t.textOf('demo-clock')).includes('Nov 26, 2026, 10:00 AM'), 'demo clock text');
  await t.click('hero-juan');
  await t.waitUntil(() => window.location.hash.startsWith('#/b/t/'));
  await t.waitFor('[data-screen="B1"]');
  t.assert(!(await t.exists('demo-drawer')), 'drawer should close after picking a hero');

  // Ben is an MBA-view scenario.
  await t.click('demo-tools');
  await t.click('hero-ben');
  await t.waitUntil(() => window.location.hash === '#/m/accounts/ac_ben');

  // Reset demo: change things, reset, confirm the seed is back.
  await t.click('demo-tools');
  await t.click('delay-manual');
  t.assert((await t.state((s) => s.demo.pendingDelay)) === 'manual', 'pending delay did not switch to manual');
  await t.click('reset-demo');
  await t.waitFor('reset-confirm');
  await t.click('reset-confirm-ok');
  await t.waitFor('reset-toast');
  const s = await t.state((st) => ({ role: st.role, delay: st.demo.pendingDelay, token: st.borrower.token, tick: st.seq.tick, unread: st.notifications.filter((n) => !n.read).length }));
  t.assert(s.role === 'admin' && s.delay === 'auto' && s.token === null, `reset did not restore seed: ${JSON.stringify(s)}`);
  t.assert(s.unread === before, `reset did not restore notifications: ${s.unread} vs ${before}`);
  t.log(`reset → ${JSON.stringify(s)}`);

  // Reload keeps the place (persistence).
  await t.click('nav-transactions');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.dataset.appReady === '1');
  t.assert((await hash()) === '#/m/transactions', `after reload: ${await hash()}`);
}
