// Layout fixes in 2.0: opened items scroll into view (instead of jumping to the top), the tab bar always stays
// on screen (app-shell layout), the Wealth tab is gone, and every screen passes axe in light and dark at 360/400 px.
import fs from 'fs';
import { suite, session, sampleStorage, K, T, axe, noSideScroll, walkSetup, skipTour, openDetails } from './lib.mjs';
const { check, finish } = suite('Layout, scrolling and accessibility');
fs.mkdirSync(new globalThis.URL('./shots/', import.meta.url), { recursive: true });
const shot = (p, n) => p.screenshot({ path: new globalThis.URL('./shots/' + n + '.png', import.meta.url).pathname });
const scrollTop = p => p.$eval('#main', m => m.scrollTop);
const setScroll = (p, y) => p.$eval('#main', (m, y) => { m.scrollTop = y; }, y);
/** Is the element fully inside the visible part of #main (below the month bar if it shows)? */
const inView = (p, sel) => p.$eval(sel, e => { const m = document.getElementById('main').getBoundingClientRect(), r = e.getBoundingClientRect(), bar = document.getElementById('monthBar');
  const top = m.top + (bar.hidden ? 0 : bar.offsetHeight); return r.top >= top - 1 && r.bottom <= m.bottom + 1; });
const barOK = p => p.evaluate(() => { const r = document.getElementById('tabbar').getBoundingClientRect(); return !document.getElementById('tabbar').hidden && Math.abs(r.bottom - window.innerHeight) <= 1 && r.height > 40; });

// ---------- 1. Tabs ----------
let { ctx, p } = await session({ storage: sampleStorage(false) });
check('Four tabs: Pay, Analysis, Reminders, Settings (no Wealth)', JSON.stringify(await p.$$eval('#tabbar [role=tab]', b => b.map(x => x.textContent.replace(/\d+/g, '').trim()))) === '["Pay","Analysis","Reminders","Settings"]');
check('No Wealth screens or settings left', (await p.$('#tab-wealth')) === null && (await p.$('#sIsa')) === null && !(await p.$eval('#tab-settings', e => e.textContent)).includes('net worth'));

// ---------- 2. The tab bar stays on screen ----------
check('Tab bar sits at the bottom of the screen on opening', await barOK(p));
check('The page itself never scrolls (only the middle does)', await p.evaluate(() => { window.scrollTo(0, 800); return window.scrollY === 0 && document.documentElement.scrollHeight <= window.innerHeight + 1; }));
await setScroll(p, 99999); await p.waitForTimeout(50);
check('Tab bar still at the bottom after scrolling to the end', (await scrollTop(p)) > 500 && await barOK(p));
await p.focus('#pay_alex');
await p.setViewportSize({ width: 400, height: 480 }); await p.waitForTimeout(100);   // keyboard opens: the WebView gets shorter
check('Tab bar at the bottom while the keyboard is open', await barOK(p));
await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(100);   // keyboard closes
check('Tab bar back at the bottom after the keyboard closes', await barOK(p));
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
await p.setViewportSize({ width: 400, height: 700 }); await p.waitForTimeout(50); await p.setViewportSize({ width: 400, height: 860 }); await p.waitForTimeout(100);
check('Tab bar at the bottom after leaving and coming back to the app', await barOK(p));
for (const t of ['analysis', 'due', 'settings', 'pay']) { await p.click('#t-' + t); await p.waitForTimeout(50); }
check('Tab bar at the bottom after switching tabs', await barOK(p));

// ---------- 3. Opening things scrolls them into view instead of jumping to the top ----------
await p.click('#t-settings'); await p.click('#sBills summary'); await p.waitForTimeout(200);
const octo = p.locator('#setBills .bill', { hasText: 'Lumen' });
await octo.evaluate(e => { const m = document.getElementById('main'); m.scrollTop += e.getBoundingClientRect().top - m.getBoundingClientRect().top - 200; });
const y0 = await scrollTop(p);
await octo.locator('> button').click(); await p.waitForTimeout(150);
const octoSel = '#' + await octo.evaluate(e => e.id);
check('Opening a bill in the middle of the list keeps your place (no jump to the top)', y0 > 800 && Math.abs((await scrollTop(p)) - y0) < 300, `${y0} → ${await scrollTop(p)}`);
check('The opened bill is fully on screen', await inView(p, octoSel));
await octo.locator('> button').click(); await p.waitForTimeout(100);
const nf = p.locator('#setBills .bill', { hasText: 'Netflix' });
await nf.evaluate(e => { const m = document.getElementById('main'); m.scrollTop += e.getBoundingClientRect().bottom - m.getBoundingClientRect().bottom + 2; });
const y1 = await scrollTop(p);
await nf.locator('> button').click(); await p.waitForTimeout(150);
check('A bill opened at the bottom edge scrolls up so the whole editor shows', (await scrollTop(p)) > y1 + 100 && await inView(p, '#' + await nf.evaluate(e => e.id)), `${y1} → ${await scrollTop(p)}`);
await shot(p, 'u1_bill_open');
await p.click('#sBills summary'); await p.waitForTimeout(50);
await setScroll(p, 0); await p.click('#sBackup summary'); await p.waitForTimeout(200);
check('A Settings section opened near the bottom scrolls into view', await p.$eval('#sBackup', e => { const m = document.getElementById('main').getBoundingClientRect(), r = e.getBoundingClientRect(); return r.top >= m.top - 1 && r.top < m.bottom - 200; }));
// reminders
await p.click('#t-due'); await p.waitForTimeout(100); await p.click('#dueAll summary'); await p.waitForTimeout(100);
const rem = p.locator('#dueAll .rem', { hasText: 'Car 2 MOT' });
await rem.evaluate(e => { const m = document.getElementById('main'); m.scrollTop += e.getBoundingClientRect().bottom - m.getBoundingClientRect().bottom + 2; });
const y2 = await scrollTop(p);
await rem.locator('.btn.ghost').click(); await p.waitForTimeout(150);
check('Editing a reminder near the bottom keeps your place and shows the editor', (await scrollTop(p)) >= y2 && await inView(p, '#' + await rem.evaluate(e => e.id)), `${y2} → ${await scrollTop(p)}`);
// one-off form
await p.click('#t-pay'); await p.waitForTimeout(100); await openDetails(p);
await p.$eval('#addOneOff', e => { const m = document.getElementById('main'); m.scrollTop += e.getBoundingClientRect().bottom - m.getBoundingClientRect().bottom + 2; });
await p.click('#addOneOff'); await p.waitForTimeout(150);
check('The one-off form scrolls fully into view when it opens', await inView(p, '#oneOffNew'));
check('No JS errors (layout)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 4. Accessibility and no sideways scroll on every screen ----------
const screens = [
  ['setup step 1, restore open', null, async p => { await p.click('#su_restore summary'); }],
  ['setup step 2, pay note', null, async p => { await walkSetup(p, 2, true); await p.fill('#su_pu_1', ''); await p.click('#su_next'); }],
  ['setup step 3', null, async p => { await walkSetup(p, 3, true); await p.click('label[for=su_same_no]'); }],
  ['setup step 4, asking to replace', null, async p => { await walkSetup(p, 4, true); await p.fill('#su_a_2', 'Bills pot'); await p.check('#su_shape_own'); }],
  ['setup step 5, with an error', null, async p => { await walkSetup(p, 5, true); await p.click('#su_b_2_more'); await p.fill('#su_b_2_3_n', 'Water'); await p.selectOption('#su_b_2_3_f', 'some'); await p.click('#su_next'); }],
  ['setup step 6', null, async p => { await walkSetup(p, 6, true); }],
  ['setup step 7', null, async p => { await walkSetup(p, 7); }],
  ['Pay with the "Finish setting up" card', null, async p => { await walkSetup(p, 4, true); await p.click('#su_later'); await skipTour(p); }],
  ['Settings, Start again waiting for the second tap', sampleStorage(false), async p => { await p.click('#t-settings'); await p.click('#sBackup summary'); await p.click('#startAgain'); }, { native: true }],
  ['setup after Start again, offering the backup', sampleStorage(false), async p => { await p.click('#t-settings'); await p.click('#sBackup summary'); await p.click('#startAgain'); await p.click('[data-confirm=startAgain]'); }, { native: true }],
  ['Pay', sampleStorage(true), async p => { await p.click('#prev'); await p.click('#accounts summary'); }],
  ['Pay with one-off editor', sampleStorage(true), async p => { await p.click('#prev'); await p.click('#oneOffs .bill > button'); await p.click('#addOneOff'); }],
  ['Reminders with editor', sampleStorage(false), async p => { await p.click('#t-due'); await p.click('#dueList .rem .btn.ghost'); }],
  ['Settings, all open', sampleStorage(false), async p => { await p.click('#t-settings'); await p.evaluate(() => document.querySelectorAll('#tab-settings details').forEach(d => { d.open = true; }));
    await p.click('#setBills .bill > button'); await p.click('#acct_jbills .btn.danger'); }],
  ['Example household', null, async p => { await p.click('#su_example'); }],
  ['Analysis', sampleStorage(true), async p => { await p.click('#t-analysis'); await p.click('#cat_housing'); await p.evaluate(() => document.querySelectorAll('#analysis .linkbtn[aria-expanded]').forEach(b => b.click())); }],
  ['Analysis, example household', null, async p => { await p.click('#su_example'); await p.click('#t-analysis'); await p.focus('#anMonths svg'); }],
  ['Analysis, empty household', { 'payday.config.v1': { schema: 5, setupDone: true, people: [{ id: 'p', name: 'Pat', payAccount: 'a' }], accounts: [{ id: 'a', name: 'Main' }], bills: [], income: [], budgets: [], savings: [], reminders: [], doneLog: [], payday: {} } }, async p => { await p.click('#t-analysis'); }],
  ['tour stop (the transfers)', null, async p => { await walkSetup(p, 7); await p.click('#su_finish'); await p.waitForTimeout(200); for (let i = 0; i < 3; i++) await p.click('#tourNext'); }],
  ['tour stop (Reminders tab)', null, async p => { await p.click('#su_example'); await p.click('#exTour'); for (let i = 0; i < 7; i++) await p.click('#tourNext'); }],
  ['help sheet open (Saved so far)', sampleStorage(true), async p => { await p.click('#t-analysis'); await p.click('#analysis .helpq[data-help=saved]'); }],
  ['Settings › Help', sampleStorage(false), async p => { await p.click('#t-settings'); await p.click('#sHelp summary'); }],
  ['How Dovetail works', sampleStorage(false), async p => { await p.click('#t-settings'); await p.click('#sHelp summary'); await p.click('#helpHow'); }],
  ['Pay with the first-month hint', null, async p => { await walkSetup(p, 7); await p.click('#su_finish'); await p.waitForTimeout(200); await skipTour(p); }],
  ['Settings, quick add and search', sampleStorage(false), async p => { await p.click('#t-settings'); await p.click('#sBills summary'); await p.click('#quickAddBtn'); await p.fill('#billSearch', 'lum'); }],
];
// Each screen is opened once, at 360px in light, and then checked at both widths in light and dark by resizing and
// switching the colour scheme in place (the page's colours come from CSS alone, with no transitions under reduced
// motion). Opening it fresh for each of the four took most of this suite's time.
for (const [name, storage, act, opts] of screens) {
  ({ ctx, p } = await session({ w: 360, storage, ...(opts || {}) }));
  await act(p); await p.waitForTimeout(150);
  let errs = 0;
  for (const [w, dark] of [[360, false], [360, true], [400, false], [400, true]]) {
    await p.setViewportSize({ width: w, height: 860 }); await p.emulateMedia({ colorScheme: dark ? 'dark' : 'light' }); await p.waitForTimeout(100);
    const ax = await axe(p);
    const tag = `${name} at ${w}px${dark ? ', dark' : ''}`;
    check('Accessibility: ' + tag, ax.length === 0, ax.join(', '));
    check('No sideways scroll: ' + tag, await noSideScroll(p, w));
    if (w === 400) await shot(p, ('s_' + name + (dark ? '_dark' : '')).replace(/[^a-z0-9_]+/gi, '_'));
    if (p.errs.length > errs) { check('No JS errors: ' + tag, false, p.errs.slice(errs).join(' | ')); errs = p.errs.length; }
  }
  await ctx.close();
}
await finish();
