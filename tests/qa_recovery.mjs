// Beta hardening: the page always opens on something usable. Damaged or unreadable data on the phone brings up the
// recovery screen (never the setup wizard over the top of it), a backup restored from there opens the app, a backup
// that can't be opened changes nothing, and unexpected errors are kept for "Copy app details".
import { suite, session, sampleStorage, household, K, T, LS, axe, skipTour, noSideScroll } from './lib.mjs';
const { check, finish } = suite('Recovery');

// A household whose payday day is nonsense (as a hand-edited or damaged backup might have): before, this threw while
// working out the month to open on, every time the app opened.
const bad = household({ people: [{ id: 'p', name: 'Pat', payAccount: 'a', usualPay: 2000 }], accounts: [{ id: 'a', name: 'Current', leftoverTo: null }],
  bills: [{ id: 'b', name: 'Rent', amount: 800, account: 'a', months: [] }], payday: { day: 'x', weekend: true } });
let { ctx, p } = await session({ native: true, storage: { [K.cfg]: bad } });
check('A payday day that makes no sense is treated as "not set", so the app opens', await p.isVisible('#tab-pay') && (await T(p, '#payGrid')).includes('Pat'), p.errs.join(' | '));
check('…and the saved settings now say so', (await LS(p, K.cfg)).payday.day === '');
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Settings that can't be read at all: not a new install.
({ ctx, p } = await session({ native: true, storage: { [K.cfg]: '{"schema":5,"setupDone":true,"people":[' } }));
check('Unreadable settings show the recovery screen, not setup', await p.isVisible('#recovery') && !(await p.isVisible('#tab-setup')) && (await T(p, '#recoveryH')) === "Dovetail couldn't open");
check('The tab bar and month bar are out of the way', !(await p.isVisible('#tabbar')) && !(await p.isVisible('#monthBar')));
check('The damaged data is still there, untouched', (await p.evaluate(k => localStorage.getItem(k), K.cfg)) === '{"schema":5,"setupDone":true,"people":[');
check('Focus is on the heading', await p.evaluate(() => document.activeElement && document.activeElement.id === 'recoveryH'));
check('Accessible', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('The recovery screen offers Send feedback and names the address', await p.isVisible('#recoverFeedback') && (await T(p, '#recovery')).includes('write to dovetail.feedback@gmail.com'));
await p.click('#recoverFeedback'); await p.waitForTimeout(150);
const rfb = await p.evaluate(() => window.__qaNative.lastFeedback || {});
check('…which sends the app details, saying the household couldn\'t be opened', /^Dovetail \d+(\.\d+)+ feedback$/.test(rfb.subject || '') && (rfb.body || '').includes("Household: couldn't be opened (recovery screen)"), JSON.stringify(rfb));
for (const dark of [false, true]) {
  const r2 = await session({ native: true, dark, w: 360, storage: { [K.cfg]: '{"schema":5,"setupDone":true,"people":[' } });
  await r2.p.evaluate(() => document.documentElement.setAttribute('data-text', 'large')); await r2.p.waitForTimeout(100);
  const ax = await axe(r2.p);
  check(`Recovery screen with Send feedback at 360px, larger text, ${dark ? 'dark' : 'light'}: accessible, no sideways scrolling`, ax.length === 0 && await noSideScroll(r2.p, 360), ax.join(' | '));
  await r2.ctx.close();
}
// Start again: two taps, the damaged data is set aside, and the app opens on setup
await p.click('#recoverFresh');
check('"Start again" asks twice', (await T(p, '#recoverFresh')).startsWith('Tap again') && (await p.evaluate(k => localStorage.getItem(k), K.cfg)) !== null);
await p.click('#recoverFresh'); await p.waitForTimeout(600);
check('…then opens the app on setup', await p.isVisible('#tab-setup') && (await LS(p, K.cfg)) === null);
const aside = await LS(p, 'payday.broken.v1');
check('…with the damaged data set aside on the phone', aside && aside.config === '{"schema":5,"setupDone":true,"people":[' && /^\d{4}-/.test(aside.at));
await p.click('#su_start'); await p.click('#su_later'); await p.waitForTimeout(250); await skipTour(p); await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(100);
check('Settings › Backup offers to copy or remove the set-aside data', await p.isVisible('#asideCopy') && (await T(p, '#setBackup')).includes('Set-aside data') && (await T(p, '#setBackup')).includes('on 15 Oct 2026'));
const copied = await p.evaluate(() => new Promise(r => { navigator.clipboard.writeText = s => { r(s); return Promise.resolve(); }; document.getElementById('asideCopy').click(); }));
check('Copying gives the data exactly as it was', JSON.parse(copied).config === '{"schema":5,"setupDone":true,"people":[');
check('App details mention it', (await p.evaluate(() => new Promise(r => { navigator.clipboard.writeText = s => { r(s); return Promise.resolve(); }; document.getElementById('copyDetails').click(); }))).includes('Set-aside data from a recovery'));
await p.click('#asideDrop'); await p.waitForTimeout(100);
check('Removing it clears it', !(await p.isVisible('#asideCopy')) && (await LS(p, 'payday.broken.v1')) === null);
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Months that can't be read, with sound settings: still the recovery screen (the months are the user's history).
({ ctx, p } = await session({ native: true, storage: { [K.cfg]: bad, [K.mon]: 'not json' } }));
check('Unreadable months show the recovery screen too', await p.isVisible('#recovery'));
await ctx.close();

// Restoring from the recovery screen: the automatic backups are offered, newest first, and one tap opens the app.
const good = { app: 'payday-transfers', version: 5, savedAt: '2026-10-14T09:00:00Z', config: household({ people: [{ id: 'p', name: 'Robin', payAccount: 'a', usualPay: 2100 }],
  accounts: [{ id: 'a', name: 'Current', leftoverTo: null }], bills: [{ id: 'b', name: 'Rent', amount: 900, account: 'a', months: [] }], payday: { day: 25, weekend: true }, schema: 5 }), months: {} };
const native = { backups: [{ name: 'backup-20261014-090000.json', savedAt: '2026-10-14T09:00:00', bytes: 10, json: JSON.stringify(good) }], calls: [], lockOn: false, lockAvail: true, n: 0 };
({ ctx, p } = await session({ native: true, storage: { [K.cfg]: '{{', 'qa.native': native } }));
check('The newest automatic backup is offered, with when it was saved', await p.isVisible('#recover_0') && (await T(p, '#recover_0')).includes('14 Oct 2026, 09:00'));
await p.click('#recover_0'); await p.waitForTimeout(700);
check('Restoring it opens the app with that household', await p.isVisible('#tab-pay') && (await T(p, '#payGrid')).includes('Robin') && (await LS(p, K.cfg)).people[0].name === 'Robin', p.errs.join(' | '));
check('The data that was there is set aside', (await LS(p, 'payday.broken.v1')).config === '{{');
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// A backup file opened from the recovery screen goes the same way (the app hands its text to paydayNativeEvent).
({ ctx, p } = await session({ native: true, storage: { [K.cfg]: '{{' } }));
check('With no automatic backups there is still "Open a backup file"', !(await p.isVisible('#recover_0')) && await p.isVisible('#recoverFile'));
await p.evaluate(j => window.paydayNativeEvent('import', j, true), JSON.stringify(good)); await p.waitForTimeout(700);
check('A backup file opened from the recovery screen opens the app', await p.isVisible('#tab-pay') && (await T(p, '#payGrid')).includes('Robin'), p.errs.join(' | '));
await ctx.close();

// A backup that can't be opened (the upgrade or opening throws) changes nothing, on the recovery screen…
const poison = JSON.stringify({ app: 'payday-transfers', version: 5, config: Object.assign({}, good.config, { payday: { day: 25 }, savings: [null, { amount: 1 }], accounts: 'none' }), months: 'x' });
({ ctx, p } = await session({ native: true, storage: { [K.cfg]: '{{' } }));
await p.evaluate(j => window.paydayNativeEvent('import', j, true), poison); await p.waitForTimeout(400);
check('A backup with no accounts is refused on the recovery screen and nothing changes', await p.isVisible('#recovery') && (await T(p, '#toast')).includes('no accounts') && (await p.evaluate(k => localStorage.getItem(k), K.cfg)) === '{{');
// One whose upgrade throws (a 1.x backup with damaged Wealth data) is refused the same way, before anything is saved
const throwsInMigrate = JSON.stringify({ app: 'payday-transfers', version: 3, config: Object.assign({}, good.config, { schema: 3 }), months: {}, wealth: { accounts: [null] } });
await p.evaluate(j => window.paydayNativeEvent('import', j, true), throwsInMigrate); await p.waitForTimeout(400);
check("A backup whose upgrade throws is refused ('couldn't be opened') and nothing changes", await p.isVisible('#recovery') && (await T(p, '#toast')).includes("couldn't be opened") && (await p.evaluate(k => localStorage.getItem(k), K.cfg)) === '{{');
check('…and the error is logged', (await LS(p, 'payday.errors.v1')).some(e => e.kind === 'recover'));
// If the old data can't be set aside (the phone's storage is full), nothing is deleted
await p.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'payday.broken.v1') throw new Error('QuotaExceededError'); return o.call(this, k, v); }; });
await p.click('#recoverFresh'); await p.click('#recoverFresh'); await p.waitForTimeout(300);
check("Start again does nothing when the old data can't be set aside", await p.isVisible('#recovery') && (await T(p, '#toast')).includes("set the old data aside") && (await p.evaluate(k => localStorage.getItem(k), K.cfg)) === '{{');
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// …and in Settings › Restore, where a backup with a nonsense payday is now opened safely instead of breaking the next launch.
({ ctx, p } = await session({ native: true, storage: sampleStorage(true) }));
await p.click('#t-settings'); await p.click('#sBackup summary');
const badBackup = JSON.stringify({ app: 'payday-transfers', version: 5, config: Object.assign({}, good.config, { payday: { day: 'x' } }), months: { '2026-11': 'junk', '2026-12': { month: '2026-12', pay: { p: 2100 }, done: {}, oneOffs: [] } } });
await p.fill('#backupIn', badBackup); await p.click('#restoreBtn'); await p.click('#restoreBtn'); await p.waitForTimeout(400);
check('Restoring it works, with the payday left unset and the junk month dropped', (await T(p, '#restoreMsg')).includes('restored') && (await LS(p, K.cfg)).payday.day === '' && Object.keys(await LS(p, K.mon)).join() === '2026-12');
await p.reload(); await p.waitForTimeout(300); await p.click('#t-pay'); await p.waitForTimeout(100);
check('…and the app opens normally afterwards', await p.isVisible('#tab-pay') && (await T(p, '#payGrid')).includes('Robin'), p.errs.join(' | '));
// Pasted text that isn't a Dovetail backup, or is far too big, is refused before anything is parsed
await p.click('#t-settings'); await p.click('#sBackup summary');
await p.fill('#backupIn', JSON.stringify({ app: 'something-else', config: { bills: [] } })); await p.click('#restoreBtn'); await p.waitForTimeout(150);
check('Pasted text from another app is refused', (await T(p, '#restoreMsg')).includes("isn't a Dovetail backup"));
await p.fill('#backupIn', throwsInMigrate); await p.click('#restoreBtn'); await p.click('#restoreBtn'); await p.waitForTimeout(300);
check("A pasted backup whose upgrade throws says it couldn't be opened, and the household is unchanged", (await T(p, '#restoreMsg')).includes("couldn't be opened") && (await LS(p, K.cfg)).people[0].name === 'Robin');
await p.evaluate(() => { const t = document.getElementById('backupIn'); t.value = '{"a":"' + 'x'.repeat(2 * 1024 * 1024 + 10) + '"}'; t.dispatchEvent(new Event('input')); }); await p.waitForTimeout(600);
await p.click('#restoreBtn'); await p.waitForTimeout(150);
check('Pasted text over 2 MB is refused', (await T(p, '#restoreMsg')).includes('too big'));
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Unexpected errors are remembered for "Copy app details", without names or amounts.
({ ctx, p } = await session({ native: true, storage: sampleStorage(true) }));
await p.evaluate(() => { setTimeout(() => { throw new Error('qa boom'); }, 0); }); await p.waitForTimeout(200);
await p.evaluate(() => { Promise.reject(new Error('qa promise')); }); await p.waitForTimeout(200);
await p.click('#t-settings'); await p.waitForTimeout(100);
const details = await p.evaluate(() => { let t = ''; const orig = navigator.clipboard.writeText;
  return new Promise(r => { navigator.clipboard.writeText = s => { t = s; return Promise.resolve(); }; document.getElementById('copyDetails').click(); setTimeout(() => { navigator.clipboard.writeText = orig; r(t); }, 100); }); });
check('App details list the recent errors', details.includes('Recent errors:') && details.includes('qa boom') && details.includes('qa promise') && details.includes('ui.js') === false, details);
check('…and still none of the names or amounts', !details.includes('Alex') && !details.includes('2280'));
const log = await LS(p, 'payday.errors.v1');
check('Errors are kept on the phone (last ten at most)', Array.isArray(log) && log.length >= 2 && log.length <= 10 && log.every(e => e.msg && e.at && e.kind));
await p.reload(); await p.waitForTimeout(300);
check('They survive reopening the app', (await LS(p, 'payday.errors.v1')).some(e => e.msg.includes('qa boom')));
await ctx.close();

// ---------- 2.13: a restore says what it couldn't use ----------
// A made-up, hand-damaged 2.12.1 backup: a negative bill, a share rule from a later version, a change of style dated
// "2026-9" and a month "2026-13".
const broken = household({ schema: 5, lastVersion: '2.12', payday: { day: 28 },
  people: [{ id: 'kim', name: 'Kim', payAccount: 'K', usualPay: 3000 }, { id: 'lee', name: 'Lee', payAccount: 'L', usualPay: 2000 }],
  accounts: [{ id: 'K', name: 'Kim own', colour: 'blue', leftoverTo: null }, { id: 'L', name: 'Lee own', colour: 'red', leftoverTo: null },
    { id: 'J', name: 'Joint', colour: 'purple', leftoverTo: null, funding: { people: ['kim', 'lee'], rule: 'byRoom' } }],
  flows: [{ from: '2026-9', was: { accounts: { K: { leftoverTo: 'J' }, L: { leftoverTo: 'J' }, J: { leftoverTo: null } }, pay: {} } }],
  bills: [{ id: 'rent', name: 'Rent', amount: -50, account: 'J', months: [] }, { id: 'energy', name: 'Energy', amount: 120, account: 'J', months: [] }] });
const brokenMonths = { '2026-10': { pay: { kim: 3000, lee: 2000 }, done: {}, oneOffs: [] }, '2026-13': { pay: { kim: 9999 }, done: {} } };
const SENTENCE = "Some things couldn't be used: a bill with a negative amount (counted as £0), a share rule Dovetail doesn't know, a change of style with a bad month and 1 more.";
const errs = p => p.evaluate(() => JSON.parse(localStorage.getItem('payday.errors.v1') || '[]'));
({ ctx, p } = await session({ native: true, storage: sampleStorage(true) }));
let e0 = (await errs(p)).length;
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(60);
await p.fill('#backupIn', JSON.stringify({ app: 'payday-transfers', version: 5, savedAt: '2026-10-14T09:00:00.000Z', config: broken, months: brokenMonths }));
await p.click('#restoreBtn'); await p.waitForTimeout(80); await p.click('#restoreBtn'); await p.waitForTimeout(300);
check('A pasted backup with things Dovetail can\'t use: "Backup restored." and one sentence saying what (three, then "and 1 more")', (await T(p, '#restoreMsg')) === 'Backup restored. ' + SENTENCE, await T(p, '#restoreMsg'));
check('…not shown as an error', !(await p.$eval('#restoreMsg', e => e.classList.contains('err'))));
let el1 = await errs(p);
check('…one entry in the error log, with no names or amounts', el1.length === e0 + 1 && el1[el1.length - 1].kind === 'restore' && !/Kim|Lee|Rent|50|9999/.test(el1[el1.length - 1].msg), JSON.stringify(el1.slice(-2)));
let cr = await LS(p, K.cfg), mr = await LS(p, K.mon);
check('…the negative bill is kept in the data but counts as £0, and the month "2026-13" is kept', cr.bills[0].amount === 0 && cr.bills[0].badAmount === -50 && !!mr['2026-13'] && mr['2026-13'].pay.kim === 9999);
await p.click('#t-pay'); await p.waitForTimeout(150);
check('…and the Pay tab works it out without them', !(await T(p, '#tab-pay')).includes('9,999') && (await T(p, '#payGrid')).includes('Kim'));
// The same file opened from another app.
await p.evaluate(v => window.paydayNativeEvent('import', v, true), JSON.stringify({ app: 'payday-transfers', version: 5, savedAt: '2026-10-14T09:00:00.000Z', config: Object.assign({}, broken, { accounts: broken.accounts.map(a => Object.assign({}, a, { id: a.id + '2' })) }), months: brokenMonths }));
await p.waitForTimeout(200); e0 = (await errs(p)).length;
await p.click('#importYes'); await p.waitForTimeout(300);
check('Opened as a file: the same sentence after "Backup restored."', (await T(p, '#toast')).startsWith('Backup restored. Some things couldn\'t be used: a bill with a negative amount'), await T(p, '#toast'));
check('…and one entry in the error log', (await errs(p)).length === e0 + 1);
check('No axe violations (after a restore that couldn\'t use everything)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('No JS errors (restore report)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
// On the phone already, first open of this version: a kept backup of the data exactly as stored, then the sentence once.
({ ctx, p } = await session({ native: true, storage: { [K.cfg]: broken, [K.mon]: brokenMonths } }));
const kept = await p.evaluate(() => window.__qaNative.backups.filter(b => b.kept));
check('First open of a new version with things it can\'t use: a kept backup of the data exactly as it was stored', kept.length === 1 && kept[0].json.includes('"config":' + JSON.stringify(broken) + ',"months":' + JSON.stringify(brokenMonths)) &&
  JSON.parse(kept[0].json).app === 'payday-transfers', kept.map(k => k.json.slice(0, 120)).join(' | '));
check('…shows the sentence', (await T(p, '#toast')) === SENTENCE, await T(p, '#toast'));
check('…and puts one entry in the error log', (await errs(p)).length === 1 && (await errs(p))[0].kind === 'boot');
check('…the stored settings now count the bill as £0, keeping what it was', (await LS(p, K.cfg)).bills[0].badAmount === -50);
await p.reload(); await p.waitForTimeout(300);
check('Opened again: said once only', !(await T(p, '#toast')).includes('couldn\'t be used') && (await errs(p)).length === 1);
check('No JS errors (first open with a report)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
// The recovery screen restoring that backup: the page reloads, then says what it couldn't use, once.
const brokenFile = JSON.stringify({ app: 'payday-transfers', version: 5, savedAt: '2026-10-14T09:00:00.000Z', config: broken, months: brokenMonths });
({ ctx, p } = await session({ native: true, storage: { [K.cfg]: '{"schema":5,"setupDone":true,"people":[', 'qa.native': { backups: [{ name: 'backup-20261014-090000.json', savedAt: '2026-10-14T09:00:00', json: brokenFile }], calls: [], lockOn: false, lockAvail: true, n: 0 } } }));
await p.click('#recover_0'); await p.waitForTimeout(500);
check('Restored from the recovery screen: once the app opens, "Backup restored." and the sentence', await p.isVisible('#tab-pay') && (await T(p, '#toast')) === 'Backup restored. ' + SENTENCE, await T(p, '#toast'));
check('…with one entry in the error log for it', (await errs(p)).filter(e => e.kind === 'restore').length === 1, JSON.stringify(await errs(p)));
await p.reload(); await p.waitForTimeout(300);
check('…said once only', !(await T(p, '#toast')).includes('couldn\'t be used'));
await ctx.close();

await finish();
