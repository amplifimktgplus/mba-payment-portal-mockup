// splash (2026-11-26 refresh). The intro:
//   - never shows to an automated browser by default (it would cover the walkthroughs);
//   - plays when forced with ?splash=1 and removes itself in about 2.5 s;
//   - is skipped by a key press;
//   - can be replayed from Demo tools → Replay intro;
//   - leaves the app working underneath (the view toggle still switches views).

export default async function splash(page, t) {
  t.assert(!(await t.exists('.splash')), 'splash shown to an automated browser without ?splash=1');

  // Forced: plays, then clears on its own.
  await page.goto(`${t.url}?splash=1#/b`, { waitUntil: 'load' });
  t.assert(await t.exists('splash'), 'splash did not start with ?splash=1');
  const started = Date.now();
  await t.waitUntil(() => !document.querySelector('.splash'), { timeout: 4000 });
  const took = Date.now() - started;
  t.assert(took < 3200, `splash took ${took} ms to clear`);
  t.log(`splash cleared in ${took} ms`);

  // The app under it works.
  await t.click('view-mba');
  await t.waitFor('nav-reports');
  await t.click('view-borrower');

  // A key press skips it. (A different query forces a real reload; the same URL would only jump in-page.)
  await page.goto(`${t.url}?splash=1&again=1#/b`, { waitUntil: 'load' });
  t.assert(await t.exists('splash'), 'splash did not restart');
  await page.keyboard.press('Escape');
  await t.waitUntil(() => !document.querySelector('.splash'), { timeout: 1500 });

  // Replay from Demo tools.
  await t.click('demo-tools');
  await t.click('replay-intro');
  t.assert(await t.exists('splash'), 'Replay intro did not show the splash');
  t.assert(!(await t.exists('.drawer-layer')), 'Demo tools should close when the intro replays');
  await t.waitUntil(() => !document.querySelector('.splash'), { timeout: 4000 });
}
