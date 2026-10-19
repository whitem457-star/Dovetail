// A second copy of the page (two Dovetail screens open at once) must never save its out-of-date data over newer data.
import { suite, session, sampleStorage, K, T, LS, BASE, PAGE } from './lib.mjs';
const { check, finish } = suite('Two copies of the page');
let { ctx, p } = await session({ storage: sampleStorage(true) });
const b = await ctx.newPage(); b.errs = []; b.on('pageerror', e => b.errs.push(e.message));
await b.goto(BASE + PAGE); await b.waitForTimeout(300);
check('Both copies show the same household', (await T(p, '#payGrid')).includes('Alex') && (await T(b, '#payGrid')).includes('Alex'));
await b.fill('#pay_alex', '2500'); await b.waitForTimeout(900);
check('The second copy saves November pay', (await LS(b, K.mon))['2026-11'].pay.alex === 2500);
await p.waitForTimeout(200);
check('The first copy is brought up to date straight away', (await p.inputValue('#pay_alex')) === '2500.00' && (await T(p, '#toast')).includes('brought up to date'));
await p.click('#steps li:nth-child(1) .tick'); await p.waitForTimeout(200);
let m = (await LS(p, K.mon))['2026-11'];
check('A change in the first copy keeps the second copy\'s pay', m.pay.alex === 2500 && Object.keys(m.done).length === 1);
// Without a "storage" event (e.g. a different WebView): the copy notices before it saves, and keeps the newer data.
await p.evaluate(k => { const c = JSON.parse(localStorage.getItem(k)); c.people[0].name = 'Alexa'; localStorage.setItem(k, JSON.stringify(c)); }, K.cfg);
await p.click('#steps li:nth-child(2) .tick'); await p.waitForTimeout(200);
check('…a save that would overwrite newer settings doesn\'t; the page reloads them instead', (await LS(p, K.cfg)).people[0].name === 'Alexa' && (await T(p, '#payGrid')).includes('Alexa') && (await T(p, '#toast')).includes('brought up to date'));
await p.click('#steps li:nth-child(2) .tick'); await p.waitForTimeout(200);
m = (await LS(p, K.mon))['2026-11'];
check('…and the next change saves normally', Object.keys(m.done).length === 2 && (await LS(p, K.cfg)).people[0].name === 'Alexa');
// Coming back to a copy that was in the background
await b.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
await p.fill('#pay_sam', '2222'); await p.waitForTimeout(900);
await b.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await b.waitForTimeout(150);
check('A copy coming back to the front shows the latest data', (await b.inputValue('#pay_sam')) === '2222.00');
check('No JS errors', p.errs.length === 0 && b.errs.length === 0, p.errs.concat(b.errs).join(' | '));
await ctx.close();

// One copy chooses "Start my own" while the other still shows the example: the other goes to setup too, and never
// writes the example back.
({ ctx, p } = await session());
await p.click('#su_example'); await p.waitForTimeout(200);
const c2 = await ctx.newPage(); c2.errs = []; c2.on('pageerror', e => c2.errs.push(e.message));
await c2.goto(BASE + PAGE); await c2.waitForTimeout(300);
await c2.click('#exStart'); await c2.click('#exStart'); await c2.waitForTimeout(200);
await p.waitForTimeout(200);
check('The other copy leaves the example and goes to setup', await p.isVisible('#tab-setup') && (await LS(p, K.cfg)) === null);
await c2.click('#su_start'); await c2.click('#su_later'); await c2.waitForTimeout(250);
check('Setup finished in one copy is kept (not replaced by the example)', (await LS(c2, K.cfg)).setupDone === true && !(await LS(c2, K.cfg)).example);
check('No JS errors (Start my own)', p.errs.length === 0 && c2.errs.length === 0, p.errs.concat(c2.errs).join(' | '));
await ctx.close();

// One copy chooses "Start again": the other goes to setup too, keeping the phone's appearance, and writes nothing back.
({ ctx, p } = await session({ native: true, storage: { ...sampleStorage(true), [K.cfg]: { ...sampleStorage(true)[K.cfg], appearance: { theme: 'dark', textSize: 'large' } } } }));
const c3 = await ctx.newPage(); c3.errs = []; c3.on('pageerror', e => c3.errs.push(e.message));
await c3.goto(BASE + PAGE); await c3.waitForTimeout(300);
await c3.click('#t-settings'); await c3.click('#sBackup summary'); await c3.click('#startAgain'); await c3.click('[data-confirm=startAgain]'); await c3.waitForTimeout(250);
const stub = await LS(c3, K.cfg); await p.waitForTimeout(300);
check('After Start again in one copy, the other goes to setup, still dark with larger text', await p.isVisible('#tab-setup') && await c3.isVisible('#tab-setup') &&
  (await p.evaluate(() => document.documentElement.getAttribute('data-theme') + ',' + document.documentElement.getAttribute('data-text'))) === 'dark,large');
check('…and the settings stay as Start again left them (no household written back)', !stub.setupDone && !('people' in stub) && JSON.stringify(await LS(p, K.cfg)) === JSON.stringify(stub) && (await LS(p, K.mon)) === null, JSON.stringify(await LS(p, K.cfg)));
check('No JS errors (Start again)', p.errs.length === 0 && c3.errs.length === 0, p.errs.concat(c3.errs).join(' | '));
await ctx.close();
await finish();
