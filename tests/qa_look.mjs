// 2.2 appearance (theme and text size), and from 2.4 swiping between months.
import { suite, session, sampleStorage, K, T, LS, axe, noSideScroll, swipe, centre, SAMPLE, SETUP_FILL, openDetails } from './lib.mjs';
const { check, finish } = suite('Appearance and swipe');
const bg = p => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const LIGHT = 'rgb(241, 244, 242)', DARK = 'rgb(10, 17, 14)';

// ---------- appearance ----------
let { ctx, p } = await session({ storage: sampleStorage(true), w: 360, h: 800, native: true });
await p.click('#t-settings'); await p.click('#sLook summary'); await p.waitForTimeout(80);
check('Settings has an Appearance section: Follow phone, Normal by default', (await T(p, '#sumLook')) === 'Follow phone · Normal' && await p.isChecked('#look_theme_system') && await p.isChecked('#look_text_normal'));
check('The choices are real radio buttons in labelled groups', (await p.$$eval('#setLook fieldset', f => f.map(x => x.querySelector('legend').textContent))).join('|') === 'Theme|Text size' && (await p.$$('#setLook input[type=radio]')).length === 6);
check('Follow phone on a light phone: light colours', (await bg(p)) === LIGHT && !(await p.evaluate(() => document.documentElement.hasAttribute('data-theme'))));
check('…and the app is told the theme on start', await p.evaluate(() => window.__qaNative.calls.some(c => c[0] === 'theme' && c[1] === 'system')));
await p.check('#look_theme_dark'); await p.waitForTimeout(80);
check('Dark: data-theme="dark" on <html>, dark colours', (await p.getAttribute('html', 'data-theme')) === 'dark' && (await bg(p)) === DARK);
check('…saved in the settings (cfg.appearance) and summarised', (await LS(p, K.cfg)).appearance.theme === 'dark' && (await T(p, '#sumLook')) === 'Dark · Normal');
check('…and passed to the app (setTheme)', await p.evaluate(() => window.__qaNative.calls.filter(c => c[0] === 'theme').pop()[1] === 'dark'));
check('No axe violations in dark (Settings)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.check('#look_text_large'); await p.waitForTimeout(120);
const fsz = () => p.evaluate(() => [parseFloat(getComputedStyle(document.documentElement).fontSize), parseFloat(getComputedStyle(document.body).fontSize), parseFloat(getComputedStyle(document.querySelector('#sLook summary')).fontSize)]);
let f = await fsz();
check('Larger text: root font size × 1.15 and every size scales with it', (await p.getAttribute('html', 'data-text')) === 'large' && Math.abs(f[0] - 18.4) < 0.01 && Math.abs(f[1] - 17.25) < 0.01, JSON.stringify(f));
check('…the section stays in view after the page reflows', await p.evaluate(() => { const r = document.getElementById('sLook').getBoundingClientRect(), m = document.getElementById('main').getBoundingClientRect(); return r.top < m.bottom && r.bottom > m.top; }));
await p.reload(); await p.waitForTimeout(300);
check('Both choices are applied on the next start', (await p.getAttribute('html', 'data-theme')) === 'dark' && (await p.getAttribute('html', 'data-text')) === 'large' && (await bg(p)) === DARK);
// every screen at 360px with Larger, light and dark
for (const theme of ['dark', 'light']) {
  await p.evaluate(t => { const c = JSON.parse(localStorage.getItem('payday.config.v1')); c.appearance.theme = t; localStorage.setItem('payday.config.v1', JSON.stringify(c)); }, theme);
  await p.reload(); await p.waitForTimeout(250);
  for (const t of ['pay', 'analysis', 'due', 'settings']) {
    await p.click('#t-' + t); await p.waitForTimeout(150);
    if (t === 'settings') for (const d of await p.$$('#tab-settings details.card:not([hidden]) > summary')) await d.click();
    if (t === 'analysis') for (const b of await p.$$('#analysis .linkbtn[aria-controls]')) await b.click();
    await p.waitForTimeout(100);
    const v = await axe(p);
    check(`Larger text, ${theme}, ${t}: no sideways scrolling at 360px and no axe violations`, await noSideScroll(p, 360) && v.length === 0, v.join(' | '));
  }
}
await p.check('#look_text_small'); await p.waitForTimeout(80);
f = await fsz();
check('Smaller text: × 0.9', Math.abs(f[0] - 14.4) < 0.01, JSON.stringify(f));
await p.check('#look_theme_system'); await p.check('#look_text_normal'); await p.waitForTimeout(80);
check('Back to Follow phone and Normal: the attributes are removed', !(await p.evaluate(() => document.documentElement.hasAttribute('data-theme') || document.documentElement.hasAttribute('data-text'))));
check('No JS errors (appearance)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Light chosen on a dark phone; and a backup from before 2.2 keeps this phone's appearance
({ ctx, p } = await session({ storage: sampleStorage(true), dark: true }));
check('Follow phone on a dark phone: dark colours', (await bg(p)) === DARK);
await p.click('#t-settings'); await p.click('#sLook summary'); await p.check('#look_theme_light'); await p.waitForTimeout(80);
check('Light on a dark phone: light colours (the light guard wins)', (await bg(p)) === LIGHT && (await p.getAttribute('html', 'data-theme')) === 'light');
check('No axe violations (light chosen on a dark phone)', (await axe(p)).length === 0);
await p.click('#sBackup summary'); await p.fill('#backupIn', JSON.stringify({ app: 'payday-transfers', version: 4, config: SAMPLE.config, months: {} }));
await p.click('#restoreBtn'); await p.click('#restoreBtn'); await p.waitForTimeout(250);
check('Restoring a backup made before 2.2 keeps the chosen appearance', (await LS(p, K.cfg)).appearance.theme === 'light' && (await bg(p)) === LIGHT);
const withLook = JSON.parse(await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('payday.config.v1')); c.appearance = { theme: 'dark', textSize: 'large' }; return JSON.stringify({ app: 'payday-transfers', version: 5, config: c, months: {} }); }));
await p.click('#t-settings'); await p.click('#sBackup summary').catch(() => {}); await p.waitForTimeout(50);
if (!(await p.$eval('#sBackup', d => d.open))) await p.click('#sBackup summary');
await p.fill('#backupIn', JSON.stringify(withLook)); await p.click('#restoreBtn'); await p.click('#restoreBtn'); await p.waitForTimeout(250);
check('A 2.2 backup brings its own appearance with it', (await p.getAttribute('html', 'data-theme')) === 'dark' && (await p.getAttribute('html', 'data-text')) === 'large');
check('No JS errors (restore)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- swipe between months (2.4) ----------
({ ctx, p } = await session({ storage: sampleStorage(true), w: 400, h: 860, touch: true, reducedMotion: 'no-preference' }));
const where = () => p.evaluate(() => ['pay', 'analysis', 'due', 'settings'].find(t => !document.getElementById('tab-' + t).hidden));
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const shiftL = (l, d) => { const [m, y] = l.split(' '); const i = MN.indexOf(m) + d + Number(y) * 12; return MN[((i % 12) + 12) % 12] + ' ' + Math.floor(i / 12); };
const label = () => T(p, '#monthLabel');
// What the Pay tab shows for a month: pay boxes, hero, transfers.
const payState = () => p.evaluate(() => JSON.stringify([document.getElementById('monthLabel').textContent,
  [...document.querySelectorAll('#payGrid input')].map(i => i.value), document.getElementById('heroFloat').textContent,
  [...document.querySelectorAll('#steps .step')].map(s => s.textContent)]));
const L0 = await label(), S0 = await payState();
await p.click('#next'); await p.waitForTimeout(700); const S1 = await payState(); await p.click('#prev'); await p.waitForTimeout(700);
check('(set-up) the next month looks different on the Pay tab', S1 !== S0 && (await payState()) === S0);
await swipe(p, 300, 500, 150, 510); await p.waitForTimeout(20);
const slidL = await p.$eval('#tab-pay', e => e.classList.contains('slide-l')); await p.waitForTimeout(700);
check('Swipe left on Pay: the next month, still on Pay', (await where()) === 'pay' && (await label()) === shiftL(L0, 1) && await p.evaluate(() => location.hash) !== '#analysis');
check('…the pay boxes, hero and transfers are that month\'s, exactly as the › arrow shows them', (await payState()) === S1, (await payState()) + ' vs ' + S1);
check('…and it slides in from the right', slidL);
await swipe(p, 100, 500, 260, 500); await p.waitForTimeout(20);
const slidR = await p.$eval('#tab-pay', e => e.classList.contains('slide-r')); await p.waitForTimeout(700);
check('Swipe right: back to the month before, sliding in from the left', (await label()) === L0 && (await payState()) === S0 && slidR, (await payState()) + ' vs ' + S0);
await p.click('#t-analysis'); await p.waitForTimeout(400);
const an0 = await T(p, '#analysis');
await swipe(p, 300, 200, 150, 200); await p.waitForTimeout(400);
check('On Analysis a swipe moves the Analysis month', (await where()) === 'analysis' && (await label()) === shiftL(L0, 1) && (await T(p, '#analysis')) !== an0);
await swipe(p, 100, 200, 260, 200); await p.waitForTimeout(400);
check('…and back', (await label()) === L0);
await p.click('#t-due'); await p.waitForTimeout(400);
await swipe(p, 300, 300, 150, 300); await p.waitForTimeout(400);
check('On Reminders a swipe moves the month too', (await where()) === 'due' && (await label()) === shiftL(L0, 1) && !(await p.isHidden('#monthBar')));
await swipe(p, 100, 300, 260, 300); await p.waitForTimeout(400);
await p.click('#t-settings'); await p.waitForTimeout(400);
await swipe(p, 300, 300, 150, 300); await swipe(p, 100, 300, 260, 300); await p.waitForTimeout(100);
check('On Settings a swipe does nothing: no tab change, no month change', (await where()) === 'settings' && (await label()) === L0 && await p.isHidden('#monthBar'));
await p.goBack(); await p.waitForTimeout(300);
check('Back from Settings still goes to Pay', (await where()) === 'pay');
await p.waitForTimeout(400);
await swipe(p, 10, 400, 200, 400);
check('A swipe starting at the left edge does nothing (Android back gesture)', (await label()) === L0);
await swipe(p, 392, 400, 200, 400);
check('…nor at the right edge', (await label()) === L0);
await swipe(p, 300, 600, 240, 300);
check('A mostly vertical drag doesn\'t change month', (await label()) === L0);
await swipe(p, 300, 500, 245, 500);
check('A short sideways drag (55px) doesn\'t change month', (await label()) === L0);
await swipe(p, 300, 700, 160, 520);
check('A sideways drag with too much vertical movement doesn\'t change month', (await label()) === L0);
const y0 = await p.$eval('#main', m => m.scrollTop);
await swipe(p, 200, 700, 205, 300, 12); await p.waitForTimeout(400);
check('Vertical scrolling still works', (await p.$eval('#main', m => m.scrollTop)) > y0 && (await label()) === L0);
// A vertical swipe can leave the page still gliding (more so on a busy machine): let it stop before measuring.
const settle = async () => { for (let i = 0, last = -1; i < 30; i++) { const y = await p.$eval('#main', m => m.scrollTop); if (y === last) break; last = y; await p.waitForTimeout(100); } };
await settle(); await p.$eval('#main', m => m.scrollTop = 0); await settle();
let c = await centre(p, '#pay_alex');
await swipe(p, c.x + 40, c.y, c.x - 100, c.y);
check('A swipe starting on an input is ignored', (await label()) === L0);
await p.click('#t-analysis'); await p.waitForTimeout(200);
await p.$eval('#anMonths .chartbox', e => e.scrollIntoView({ block: 'center' })); await p.waitForTimeout(80);
c = await centre(p, '#anMonths .chartbox svg');
await swipe(p, c.x + 100, c.y, c.x - 80, c.y);
check('A drag on a chart reads the chart instead of changing month', (await label()) === L0 && await p.isVisible('#anMonths .tip'));
await p.click('#anMonths .linkbtn[aria-controls]'); await p.waitForTimeout(80);
c = await centre(p, '#anMonthsTable');
await swipe(p, c.x + 80, c.y, c.x - 80, c.y);
check('A drag on a sideways-scrolling table is ignored', (await label()) === L0);
check('No JS errors (swipe)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// every setup step with larger text, at 360px, light and dark
for (const dark of [false, true]) {
  ({ ctx, p } = await session({ w: 360, h: 800, dark }));
  await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large')); await p.waitForTimeout(50);
  for (let n = 1; n <= 7; n++) {
    if (n === 1) await p.click('#su_restore summary'); else if (n === 2) await p.click('#su_start');
    if (SETUP_FILL[n]) await SETUP_FILL[n](p);
    await p.waitForTimeout(80);
    const v = await axe(p);
    check(`Larger text, ${dark ? 'dark' : 'light'}, setup step ${n}: no sideways scrolling at 360px and no axe violations`, (await T(p, '#suTitle')) && await noSideScroll(p, 360) && v.length === 0, v.join(' | '));
    if (n >= 2 && n < 7) { await p.click('#su_next'); await p.waitForTimeout(40); }
  }
  check('…larger text really is larger, and the setup steps all reached', Math.abs(await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)) - 18.4) < 0.01 && (await T(p, '#suTitle')) === 'Your first payday');
  check('No JS errors (setup with larger text)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// during setup a swipe does nothing
({ ctx, p } = await session({ w: 400, h: 860, touch: true }));
const setupH = await T(p, '#tab-setup h1');
await swipe(p, 300, 400, 150, 400); await swipe(p, 100, 400, 260, 400);
check('During setup a swipe does nothing', await p.isVisible('#tab-setup') && (await T(p, '#tab-setup h1')) === setupH && await p.isHidden('#monthBar') && p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// a swipe while editing a one-off doesn't lose what was typed
({ ctx, p } = await session({ storage: sampleStorage(true), w: 400, h: 860, touch: true }));
const L1 = await T(p, '#monthLabel'), mk = () => p.evaluate(() => { const m = document.getElementById('monthLabel').textContent.split(' ');
  return m[1] + '-' + String(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].indexOf(m[0]) + 1).padStart(2, '0'); });
const k1 = await mk();
await openDetails(p);
await p.click('#addOneOff'); await p.fill('#oo_name_new', 'Boiler'); await p.fill('#oo_amt_new', '90'); await p.click('#oo_add'); await p.waitForTimeout(150);
await p.locator('#oneOffs .bill > button', { hasText: 'Boiler' }).click(); await p.waitForTimeout(60);
await p.fill('#oneOffs .ed input[id^="oo_amt_"]', '95'); await p.fill('#oneOffs .ed input[id^="oo_name_"]', 'Boiler repair');
// Swipe across the top of the one-offs card (its heading, not a field), wherever it has scrolled to.
const edSpot = async () => { await p.$eval('#oneOffs', e => e.scrollIntoView({ block: 'center' })); const b = await p.$eval('#oneOffs', e => { const r = e.getBoundingClientRect(); return { y: r.top + 12 }; }); return { x: 200, y: b.y }; };
c = await edSpot();
const amtBefore = (await LS(p, K.mon))[k1].oneOffs[0].amount;
await swipe(p, c.x + 60, c.y, c.x - 100, c.y); await p.waitForTimeout(150);
check('(set-up) the edit hadn\'t been saved yet when the swipe began', amtBefore === 90);
check('Swiping away mid-edit saves the edit to its own month', (await T(p, '#monthLabel')) === shiftL(L1, 1) && JSON.stringify((await LS(p, K.mon))[k1].oneOffs.map(o => [o.name, o.amount])) === '[["Boiler repair",95]]', (await T(p, '#monthLabel')) + ' ' + k1 + ' ' + JSON.stringify((await LS(p, K.mon))[k1]));
c = await edSpot(); await swipe(p, c.x - 60, c.y, c.x + 100, c.y); await p.waitForTimeout(150);
check('…and swiping back shows it', (await T(p, '#oneOffs')).includes('Boiler repair') && (await T(p, '#oneOffs')).includes('95.00'));
await p.click('#addOneOff'); await p.fill('#oo_name_new', 'Window cleaner'); await p.fill('#oo_amt_new', '18');
c = await edSpot();
await swipe(p, c.x + 60, c.y, c.x - 100, c.y); await p.waitForTimeout(150);
check('A new one-off being typed stays open with its text, now for the month on screen', await p.isVisible('#oneOffNew') && (await p.inputValue('#oo_name_new')) === 'Window cleaner' && (await p.inputValue('#oo_amt_new')) === '18.00' && (await T(p, '#oneOffNew h3')).includes(shiftL(L1, 1)), await p.isVisible('#oneOffNew') && [await p.inputValue('#oo_name_new'), await p.inputValue('#oo_amt_new'), await T(p, '#oneOffNew h3')].join(' | '));
check('No JS errors (swipe while editing)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
await finish();
