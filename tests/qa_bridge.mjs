// The page side of the Android bridge (automatic backups, backup list, share, app lock), using a stand-in
// PaydayNative. Ported from the 1.4 suite; first-run restore is covered in qa_setup.mjs.
import { suite, session, sampleStorage, K, T, LS, axe, noSideScroll } from './lib.mjs';
const { check, finish } = suite('Android bridge');
const NS = p => p.evaluate(() => window.__qaNative);
const saves = st => st.calls.filter(c => c[0] === 'save').length;

// ---------- 1. Automatic backups ----------
let { ctx, p } = await session({ native: true, storage: sampleStorage(false) });
await p.waitForTimeout(1800);
// 2.13: the first open of a new version keeps the data as stored first (qa_share.mjs checks what's in it). It's taken
// out of the stand-in here, so what follows counts the automatic backups only.
check('The first open of this version kept a backup of the stored data first', (await NS(p)).backups.filter(b => b.kept).length === 1);
await p.evaluate(() => { const st = window.__qaNative; st.backups = st.backups.filter(b => !b.kept); window.__qaSave(); });
let st = await NS(p);
check('A backup is saved shortly after opening', st.backups.length === 1 && JSON.parse(st.backups[0].json).app === 'payday-transfers', JSON.stringify(st.calls));
const b0 = JSON.parse(st.backups[0].json);
check('Backup is version 5 with config, months and the old Wealth data', b0.version === 5 && b0.config.schema === 5 && b0.months && b0.wealth && b0.wealth.accounts.length > 0);
const before = saves(st);
for (const v of ['2', '24', '240', '2401']) { await p.fill('#pay_alex', v); await p.waitForTimeout(150); }
await p.waitForTimeout(800); st = await NS(p);
check('Typing does not save a backup on every keystroke', saves(st) === before, saves(st) - before);
await p.waitForTimeout(2600); st = await NS(p);
check('A backup is saved after a pause in editing', saves(st) === before + 1 && st.backups.length === 2);
check('Newest backup holds the new pay', (JSON.parse(st.backups[0].json).months['2026-11'] || {}).pay.alex === 2401, st.backups[0].json.slice(0, 200));
await p.fill('#pay_sam', '2320'); await p.waitForTimeout(900);
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
st = await NS(p);
check('Leaving the app saves a pending backup straight away', (JSON.parse(st.backups[0].json).months['2026-11'] || {}).pay.sam === 2320);
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
await p.fill('#pay_sam', '2330');
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
check('Leaving the app straight after typing saves the month (no waiting on the autosave timer)', (await LS(p, K.mon))['2026-11'].pay.sam === 2330 && (JSON.parse((await NS(p)).backups[0].json).months['2026-11'] || {}).pay.sam === 2330);
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
// 2.13: the app calls window.paydayFlush when it's paused (MainActivity.onPause), before Android may destroy the page.
await p.fill('#pay_sam', '2340');
const flushed = await p.evaluate(k => { const was = JSON.parse(localStorage.getItem(k))['2026-11'].pay.sam; window.paydayFlush(); return [was, JSON.parse(localStorage.getItem(k))['2026-11'].pay.sam]; }, K.mon);
check('2.13: the app\'s pause call saves the month typed a moment ago at once, and the backup with it', flushed[0] === 2330 && flushed[1] === 2340 &&
  (JSON.parse((await NS(p)).backups[0].json).months['2026-11'] || {}).pay.sam === 2340, JSON.stringify(flushed));
const nSaves = saves(await NS(p));
await p.evaluate(() => window.paydayFlush()); await p.waitForTimeout(3000);
check('…and with nothing waiting it saves nothing more', saves(await NS(p)) === nSaves && p.errs.length === 0, p.errs.join(' | '));

// ---------- 2. Backup settings: list, restore, share ----------
await p.evaluate(() => { const st = window.__qaNative; const j = JSON.parse(st.backups[st.backups.length - 1].json); j.config.budgets[0].amount = 650;
  st.backups.push({ name: 'backup-20261001-090000.json', savedAt: '2026-10-01T09:00:00', json: JSON.stringify(j) }); window.__qaSave(); });
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(100);
const bs = await T(p, '#setBackup');
check('Settings lists automatic backups with dates', bs.includes('Automatic backups') && bs.includes('1 Oct 2026, 09:00') && bs.includes('15 Oct 2026, 12:0'), bs.slice(0, 300));
const row = p.locator('#setBackup .spread', { hasText: '1 Oct 2026, 09:00' });
await row.locator('.btn.danger').click();
check('Restoring an automatic backup needs a second tap', (await row.locator('.btn.danger').textContent()).includes('Tap again'));
await row.locator('.btn.danger').click(); await p.waitForTimeout(150);
check('Restore applies the chosen backup', (await LS(p, K.cfg)).budgets[0].amount === 650);
check('…and the Wealth data stays', (await LS(p, K.w)).accounts.length > 0);
await p.click('#setBackup .btn:has-text("Share backup file")'); await p.waitForTimeout(50);
st = await NS(p);
const sh = st.calls.filter(c => c[0] === 'share').pop();
check('Share sends a Dovetail backup named dovetail-backup-<date>.json', sh && sh[1] === 'dovetail-backup-2026-10-15.json' && sh[2] === 'payday-transfers', JSON.stringify(sh));
check('Copy and paste backup is still available', (await T(p, '#setBackup')).includes('Copy backup') && (await T(p, '#setBackup')).includes('Restore from a backup'));

// ---------- 3. App lock ----------
check('App lock section shows in the app', !(await p.$eval('#sLock', e => e.hidden)) && (await T(p, '#sumLock')) === 'Off');
await p.click('#sLock summary');
check('Lock switch is available when the phone has a screen lock', !(await p.$eval('#lock_on', e => e.disabled)));
await p.click('#lock_on'); await p.waitForTimeout(50);
st = await NS(p);
check('Turning it on asks the app to confirm with fingerprint/PIN', JSON.stringify(st.calls.filter(c => c[0] === 'lock')) === '[["lock",true]]' && (await T(p, '#setLock')).includes('Confirm with your fingerprint'));
check('…while waiting the switch keeps focus and is marked unavailable', await p.evaluate(() => document.activeElement && document.activeElement.id === 'lock_on' && document.activeElement.getAttribute('aria-disabled') === 'true'));
await p.click('#lock_on', { force: true }); await p.waitForTimeout(40);
check('…and a second tap meanwhile asks nothing more', (await NS(p)).calls.filter(c => c[0] === 'lock').length === 1);
await p.evaluate(() => { window.__qaNative.lockOn = true; window.paydayNativeEvent('lock', true, true); }); await p.waitForTimeout(50);
check('After confirming, the switch shows On', await p.$eval('#lock_on', e => e.checked && !e.disabled) && (await T(p, '#sumLock')) === 'On' && (await T(p, '#toast')) === 'App lock is on');
await p.click('#lock_on'); await p.evaluate(() => { window.__qaNative.lockOn = false; window.paydayNativeEvent('lock', false, true); }); await p.waitForTimeout(50);
check('Turning it off works', !(await p.$eval('#lock_on', e => e.checked)) && (await T(p, '#sumLock')) === 'Off');
await p.click('#lock_on'); await p.evaluate(() => window.paydayNativeEvent('lock', false, false)); await p.waitForTimeout(50);
check('A cancelled fingerprint/PIN leaves the lock off', !(await p.$eval('#lock_on', e => e.checked)) && (await T(p, '#toast')) === "App lock wasn't changed");
await p.evaluate(() => { window.__qaNative.lockAvail = false; }); await p.click('#t-pay'); await p.click('#t-settings'); await p.waitForTimeout(50);
if (!(await p.$eval('#sLock', e => e.open))) await p.click('#sLock summary');
check('Without a phone screen lock the switch is disabled with an explanation', await p.$eval('#lock_on', e => e.disabled) && (await T(p, '#setLock')).includes('Set up a fingerprint, face unlock or screen lock'));
check('No JS errors (bridge flows)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 4. In a browser (no bridge) ----------
({ ctx, p } = await session({ storage: sampleStorage(false) }));
await p.click('#t-settings'); await p.click('#sBackup summary');
check('Without the app bridge: no automatic-backup list, no share, no app lock', !(await T(p, '#setBackup')).includes('Automatic backups') && !(await T(p, '#setBackup')).includes('Share backup') && await p.$eval('#sLock', e => e.hidden));
await ctx.close();

// ---------- 5. Accessibility on these parts ----------
for (const dark of [false, true]) {
  ({ ctx, p } = await session({ native: true, dark, storage: sampleStorage(false) }));
  await p.click('#t-settings'); await p.click('#sBackup summary'); await p.click('#sLock summary'); await p.waitForTimeout(100);
  const ax = await axe(p);
  check(`Accessibility on backup & lock settings${dark ? ' (dark)' : ''}`, ax.length === 0, ax.join(', '));
  check(`No sideways scroll${dark ? ' (dark)' : ''}`, await noSideScroll(p, 400));
  await ctx.close();
}
await finish();
