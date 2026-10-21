// 2.2: opening a backup file (shared from another phone or picked with "Import a backup file…") and the exports.
import fs from 'fs';
import { suite, session, sampleStorage, household, K, T, LS, axe, SAMPLE } from './lib.mjs';
const { check, finish } = suite('Backup files and exports');
const other = { app: 'payday-transfers', version: 5, savedAt: '2026-10-16T10:00:00.000Z', months: { '2026-09': { pay: { pat: 1500 }, done: {}, oneOffs: [] } },
  config: household({ schema: 5, people: [{ id: 'pat', name: 'Pat', payAccount: 'm', usualPay: 1500 }], accounts: [{ id: 'm', name: 'Main', colour: 'blue', leftoverTo: null }],
    bills: [{ id: 'r', name: 'Rent', amount: 650, account: 'm', months: [] }] }) };
const OTHER = JSON.stringify(other);
const send = (p, v, ok) => p.evaluate(([v, ok]) => window.paydayNativeEvent('import', v, ok), [v, ok]);
const calls = p => p.evaluate(() => window.__qaNative.calls);

// ---------- in the app (bridge present) ----------
let { ctx, p } = await session({ storage: sampleStorage(true), native: true });
await p.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied = t; return Promise.resolve(); } } }); });
await p.click('#t-settings');
check('The section is called "Backup, export & restore"', (await p.textContent('#sBackup summary')) === 'Backup, export & restore');
await p.click('#sBackup summary'); await p.waitForTimeout(80);
check('It explains how to put Dovetail on another phone, and that it\'s a copy', (await T(p, '#setBackup')).includes("To put Dovetail on another phone, share the backup file to it (WhatsApp, Quick Share, email) and open the file there. It's a copy: changes made on one phone don't reach the other."));
check('The paste-a-backup box is still there', await p.isVisible('#backupIn'));
await p.click('#importFile'); await p.waitForTimeout(50);
check('"Import a backup file…" opens the system file picker (through the app)', (await calls(p)).some(c => c[0] === 'pick'));
await p.click('#t-pay'); await p.waitForTimeout(80);
await send(p, OTHER, true); await p.waitForTimeout(200);
check('A backup file opened from another app shows the restore confirmation in Settings', await p.isVisible('#tab-settings') && await p.$eval('#sBackup', d => d.open) && await p.isVisible('#importOffer'));
const offer = await T(p, '#importOffer');
check('…with what\'s in the file', offer.includes('Saved 16 Oct 2026, ') && offer.includes('1 person (Pat), 1 account, 1 bill, 1 saved month.'), offer);
check('…and the same warning as restoring a pasted backup', offer.includes('This replaces all people, accounts, bills and saved months on this phone.') && offer.includes('automatic backups'));
check('No axe violations with the confirmation showing', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('…and focus moves to it, so a screen reader announces it', await p.evaluate(() => document.activeElement && document.activeElement.textContent === 'Open this Dovetail backup?'));
check('Nothing has changed yet', (await LS(p, K.cfg)).people[0].name === 'Alex');
await p.click('#importNo'); await p.waitForTimeout(80);
check('Cancel: the offer goes and nothing changes', (await p.$('#importOffer')) === null && (await LS(p, K.cfg)).people[0].name === 'Alex' && (await T(p, '#toast')) === 'Nothing was changed');
const wBefore = await p.evaluate(k => localStorage.getItem(k), K.w);
// this phone's own settings, which a file from another phone mustn't change
await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('payday.config.v1')); c.notify = { on: false, time: '21:00', amounts: false }; c.appearance = { theme: 'light', textSize: 'large' }; localStorage.setItem('payday.config.v1', JSON.stringify(c)); });
await p.reload(); await p.waitForTimeout(300);
const OTHER2 = JSON.stringify(Object.assign({}, other, { config: Object.assign({}, other.config, { notify: { on: true, time: '06:00', amounts: true }, appearance: { theme: 'dark', textSize: 'small' } }) }));
await send(p, OTHER2, true); await p.waitForTimeout(150);
await p.click('#importYes'); await p.waitForTimeout(300);
const c = await LS(p, K.cfg);
check('"Replace with this backup" restores it and opens the Pay tab', c.people.length === 1 && c.people[0].name === 'Pat' && await p.isVisible('#tab-pay') && (await T(p, '#payGrid')).includes('Pat'));
check('…what was on the phone was kept as a backup first (kept 30 days)', await p.evaluate(() => window.__qaNative.calls.some(c => c[0] === 'keep' && c[1] === 'Alex,Sam') && window.__qaNative.backups.some(b => b.kept && b.json.includes('"Alex"'))));
check('…this phone\'s notification and appearance settings are kept, not the file\'s', JSON.stringify(c.notify) === '{"on":false,"time":"21:00","amounts":false}' && JSON.stringify(c.appearance) === '{"theme":"light","textSize":"large"}' && (await p.getAttribute('html', 'data-theme')) === 'light');
await p.click('#t-settings'); if (!(await p.$eval('#sBackup', d => d.open))) await p.click('#sBackup summary');
check('…and the kept backup is labelled in the list', (await T(p, '#setBackup')).includes('saved before a restore or update, kept 30 days'));
await p.click('#t-pay');
check('…and the old Wealth data is left alone', (await p.evaluate(k => localStorage.getItem(k), K.w)) === wBefore);
await send(p, 'notbackup', false); await p.waitForTimeout(60);
check('A file that isn\'t a backup: a clear message, nothing else', (await T(p, '#toast')) === "That file isn't a Dovetail backup, so nothing was changed." && (await p.$('#importOffer')) === null);
await send(p, 'toobig', false); await p.waitForTimeout(60);
check('A file over 2 MB: a clear message', (await T(p, '#toast')).includes('too big'));
await send(p, '{"app":"something-else","config":{"bills":[]}}', true); await p.waitForTimeout(60);
check('Text that passes the app\'s check but isn\'t Dovetail\'s is still refused', (await T(p, '#toast')) === "That file isn't a Dovetail backup, so nothing was changed." && (await p.$('#importOffer')) === null);
await send(p, JSON.stringify(Object.assign({}, other, { version: 99 })), true); await p.waitForTimeout(60);
check('A backup from a newer version: asks to update first', (await T(p, '#toast')).includes('newer version'));
await send(p, 'cancelled', false); await p.waitForTimeout(60);
check('Backing out of the file picker says nothing', (await p.$('#importOffer')) === null);
// exports
await p.click('#t-settings'); if (!(await p.$eval('#sBackup', d => d.open))) await p.click('#sBackup summary');
await p.evaluate(s => { localStorage.setItem('payday.config.v1', JSON.stringify(s.cfg)); localStorage.setItem('payday.months.v1', JSON.stringify(s.mon)); }, { cfg: SAMPLE.config, mon: SAMPLE.months });
await p.reload(); await p.waitForTimeout(300); await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(60);
await p.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied = t; return Promise.resolve(); } } }); });
await p.click('#exportMd'); await p.waitForTimeout(80);
let st = await p.evaluate(() => window.__qaNative);
check('"Share for analysis" shares one Markdown file through the app', JSON.stringify(st.calls.filter(x => x[0] === 'shareFiles').pop()[1]) === '[["dovetail-analysis-2026-10-15.md","text/markdown"]]');
const md = st.lastFiles[0].text;
check('…a report with the preface, household, bills, months and Analysis figures', md.startsWith('# Dovetail export, 15 Oct 2026') && ['## Household', '## Bills', '## Spending budgets', '## Savings transfers', '## Other income', '## Saved months', '## Analysis'].every((h, i, a) => md.indexOf(h) > 0 && (i === 0 || md.indexOf(h) > md.indexOf(a[i - 1]))) && md.includes('| Council Tax | 198.00 |') && /Exported by Dovetail \d+\.\d+/.test(md));
check('…with no "Who pays for what" section (left out of 2.2)', !/who pays/i.test(md));
await p.click('#exportCsv'); await p.waitForTimeout(80);
st = await p.evaluate(() => window.__qaNative);
check('"Share spreadsheet (CSV)" shares both CSV files in one go', JSON.stringify(st.calls.filter(x => x[0] === 'shareFiles').pop()[1]) === '[["dovetail-bills-2026-10-15.csv","text/csv"],["dovetail-months-2026-10-15.csv","text/csv"]]' && st.lastFiles[1].text.startsWith('month,Alex_pay,Sam_pay,float'));
await p.click('#exportCopy'); await p.waitForTimeout(150);
check('"Copy report" copies the same report', (await p.evaluate(() => window.__copied || '')).startsWith('# Dovetail export') && (await T(p, '#toast')).startsWith('Report copied'));
check('No axe violations (Backup, export & restore)', (await axe(p)).length === 0);
check('No JS errors (app)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- a new phone: open the backup during setup ----------
({ ctx, p } = await session({ native: true }));
check('A new phone opens on setup', await p.isVisible('#tab-setup'));
await send(p, OTHER, true); await p.waitForTimeout(150);
check('Opening a backup file during setup offers to restore it (nothing to replace yet)', await p.isVisible('#importOffer') && !(await T(p, '#importOffer')).includes('This replaces') && (await p.textContent('#importYes')) === 'Restore this backup');
await p.click('#importYes'); await p.waitForTimeout(300);
check('…and restoring it skips setup and opens the Pay tab with that household', await p.isVisible('#tab-pay') && (await T(p, '#payGrid')).includes('Pat') && (await LS(p, K.cfg)).setupDone === true);
check('No JS errors (new phone)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- in a browser (no app): file input and downloads ----------
({ ctx, p } = await session({ storage: sampleStorage(true) }));
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(60);
check('Without the app: "Open a backup file" and downloads instead of sharing', (await T(p, '#setBackup')).includes('Open a backup file') && (await p.textContent('#exportMd')) === 'Download report');
let [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#importFile')]);
await fc.setFiles({ name: 'payday-backup.json', mimeType: 'application/json', buffer: Buffer.from('﻿' + OTHER) }); await p.waitForTimeout(200);
check('Choosing a backup file shows the same confirmation', await p.isVisible('#importOffer') && (await T(p, '#importOffer')).includes('1 person (Pat)'));
await p.click('#importNo');
[fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('#importFile')]);
await fc.setFiles({ name: 'photo.json', mimeType: 'application/json', buffer: Buffer.from('not json at all') }); await p.waitForTimeout(150);
check('Choosing something else is refused', (await T(p, '#toast')) === "That file isn't a Dovetail backup, so nothing was changed.");
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#exportMd')]);
check('Download report saves dovetail-analysis-<date>.md', dl.suggestedFilename() === 'dovetail-analysis-2026-10-15.md' && fs.readFileSync(await dl.path(), 'utf8').startsWith('# Dovetail export'));
const dls = []; p.on('download', d => dls.push(d.suggestedFilename()));
await p.click('#exportCsv'); await p.waitForTimeout(600);
check('Download spreadsheet saves both CSV files', JSON.stringify(dls.sort()) === '["dovetail-bills-2026-10-15.csv","dovetail-months-2026-10-15.csv"]', JSON.stringify(dls));
check('No JS errors (browser)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2.13: kept backups ----------
// The made-up 1.x household as stored on a phone, opened by this version for the first time.
({ ctx, p } = await session({ storage: sampleStorage(true), native: true }));
let nat = await p.evaluate(() => window.__qaNative);
const keptNow = nat.backups.filter(b => b.kept);
check('First open of a new version: one kept backup of the data exactly as stored, before anything is written', keptNow.length === 1 && nat.calls.filter(c => c[0] === 'keep').length === 1 &&
  keptNow[0].json.includes('"config":' + JSON.stringify(SAMPLE.config) + ',"months":' + JSON.stringify(SAMPLE.months) + ',"wealth":' + JSON.stringify(SAMPLE.wealth) + '}') &&
  JSON.parse(keptNow[0].json).version === 5 && JSON.parse(keptNow[0].json).app === 'payday-transfers', keptNow.map(b => b.json.slice(0, 100)).join(' | '));
check('…while the stored settings are now upgraded', (await LS(p, K.cfg)).schema === 5 && (await LS(p, K.cfg)).people.length === 2);
await p.waitForTimeout(1800); await p.reload(); await p.waitForTimeout(300);
check('…and opening it again keeps nothing more', (await p.evaluate(() => window.__qaNative.calls.filter(c => c[0] === 'keep').length)) === 1);
// A pasted backup is described before the second tap, as an opened file is.
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(60);
await p.fill('#backupIn', OTHER); await p.click('#restoreBtn'); await p.waitForTimeout(100);
const armed = await T(p, '#restoreMsg');
check('A pasted backup is described before the second tap: when it was saved, people, accounts, bills and saved months', armed === 'Saved 16 Oct 2026, ' + armed.slice(19, 24) + '. 1 person (Pat), 1 account, 1 bill, 1 saved month. This replaces all people, accounts, bills and saved months on this phone.' &&
  (await T(p, '#restoreBtn')) === 'Tap again to replace everything', armed);
check('No axe violations with the description showing', (await axe(p)).length === 0, (await axe(p)).join(' | '));
// The kept backup can't be written: the paste stops.
await p.evaluate(() => { window.__qaNative.keepFails = true; window.__qaSave(); });
const cfgRaw = await p.evaluate(k => localStorage.getItem(k), K.cfg);
await p.click('#restoreBtn'); await p.waitForTimeout(200);
check('If the backup of this phone can\'t be saved, a pasted restore changes nothing and says so', (await T(p, '#restoreMsg')) === "Couldn't save a backup, so nothing was changed." &&
  (await p.evaluate(k => localStorage.getItem(k), K.cfg)) === cfgRaw && (await T(p, '#restoreBtn')) === 'Restore');
// …and so does restoring one of the automatic backups from Settings.
const auto = await p.$('#setBackup [data-confirm^="nb:"]');
await auto.click(); await p.waitForTimeout(80); await p.click('#setBackup [data-confirm^="nb:"].danger:has-text("Tap again")'); await p.waitForTimeout(200);
check('…and so does Restore on an automatic backup in Settings', (await T(p, '#toast')) === "Couldn't save a backup, so nothing was changed." && (await p.evaluate(k => localStorage.getItem(k), K.cfg)) === cfgRaw);
await p.evaluate(() => { window.__qaNative.keepFails = false; window.__qaSave(); });
await p.click('#restoreBtn'); await p.waitForTimeout(100); await p.click('#restoreBtn'); await p.waitForTimeout(300);
check('With the backup saved, the paste goes ahead, keeping this phone\'s data first', (await T(p, '#restoreMsg')) === 'Backup restored.' && (await LS(p, K.cfg)).people[0].name === 'Pat' &&
  (await p.evaluate(() => window.__qaNative.calls.filter(c => c[0] === 'keep').pop()[1])) === 'Alex,Sam');
check('Settings › Backup says what the automatic backups keep', (await T(p, '#setBackup')).includes('It keeps the last 10 changes, one from each of the last 14 days and one from each of the last 12 months. A backup made just before a restore, an update or a new version of Dovetail is kept for 30 days.'));
check('No JS errors (kept backups)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2.13: the old Wealth data, saved as a file and removed (the made-up 1.x household has some) ----------
({ ctx, p } = await session({ storage: sampleStorage(true), native: true }));
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(60);
let sb = await T(p, '#setBackup');
check('Settings › Backup has a section for the old Wealth data, saying what it is', sb.includes('Old Wealth data') && sb.includes('Backups and update files include figures from the old Wealth tab: balances from version 1, not shown anywhere since 2.0.') &&
  (await p.textContent('#wealthSave')) === 'Save the old Wealth data as a file, then remove it' && (await p.$('#wealthDrop')) === null);
await p.click('#wealthSave'); await p.waitForTimeout(150);
nat = await p.evaluate(() => window.__qaNative);
check('"Save…" shares the Wealth data as dovetail-wealth-<date>.json through the app', JSON.stringify(nat.calls.filter(c => c[0] === 'shareFiles').pop()[1]) === '[["dovetail-wealth-2026-10-15.json","application/json"]]' &&
  JSON.stringify(JSON.parse(nat.lastFiles[0].text).wealth) === JSON.stringify(SAMPLE.wealth));
check('…nothing is removed yet; a button to remove it appears, with focus on it', (await p.evaluate(k => localStorage.getItem(k), K.w)) === JSON.stringify(SAMPLE.wealth) && await p.isVisible('#wealthDrop') &&
  (await p.textContent('#wealthDrop')) === 'Remove the old Wealth data' && (await p.evaluate(() => document.activeElement.id)) === 'wealthDrop');
check('No axe violations (Old Wealth data)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#wealthDrop'); await p.waitForTimeout(80);
check('Removing takes a second tap', (await p.textContent('#wealthDrop')) === 'Tap again to remove it' && (await p.evaluate(k => localStorage.getItem(k), K.w)) !== null);
await p.evaluate(() => { window.__qaNative.keepFails = true; window.__qaSave(); });
await p.click('#wealthDrop'); await p.waitForTimeout(150);
check('If the backup of everything can\'t be saved first, nothing is removed', (await T(p, '#toast')) === "Couldn't save a backup, so nothing was removed." && (await p.evaluate(k => localStorage.getItem(k), K.w)) === JSON.stringify(SAMPLE.wealth));
await p.evaluate(() => { window.__qaNative.keepFails = false; window.__qaSave(); });
await p.click('#wealthDrop'); await p.waitForTimeout(80); await p.click('#wealthDrop'); await p.waitForTimeout(200);
nat = await p.evaluate(() => window.__qaNative);
const keptW = nat.backups.filter(b => b.kept)[0];
check('Two taps: a backup of everything, with the Wealth data, is kept first, then it\'s removed', (await p.evaluate(k => localStorage.getItem(k), K.w)) === null &&
  JSON.stringify(JSON.parse(keptW.json).wealth) === JSON.stringify(SAMPLE.wealth) && JSON.parse(keptW.json).config.people.length === 2 && (await T(p, '#toast')) === 'The old Wealth data has been removed.');
check('…the section has gone, and focus is on the section\'s heading', !(await T(p, '#setBackup')).includes('Old Wealth data') && (await p.$('#wealthSave')) === null &&
  (await p.evaluate(() => document.activeElement && document.activeElement.closest('#sBackup') && document.activeElement.tagName)) === 'SUMMARY');
await p.click('#setBackup .btn.ghost:has-text("Show backup")'); await p.waitForTimeout(60);
check('…and backups no longer carry it', !('wealth' in JSON.parse(await p.inputValue('#backupOut'))));
await p.waitForTimeout(2700);
check('…nor the automatic backup that follows', await p.evaluate(() => { const b = window.__qaNative.backups.filter(x => !x.kept)[0]; return !!b && !('wealth' in JSON.parse(b.json)); }));
await p.reload(); await p.waitForTimeout(300); await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(60);
check('…and it stays gone after reopening', (await p.evaluate(k => localStorage.getItem(k), K.w)) === null && !(await T(p, '#setBackup')).includes('Old Wealth data'));
check('…and the settings remember that it was removed', (await LS(p, K.cfg)).wealthRemoved === true);
// Nothing brings it back by itself: an update from the household's other phone, which still has it (the backup kept a
// moment ago is such a file: the same household, with the Wealth data)...
const otherPhone = JSON.stringify(Object.assign(JSON.parse(keptW.json), { savedAt: '2026-10-15T12:00:00.000Z' }));
await p.click('#t-pay'); await p.waitForTimeout(100);
await send(p, otherPhone, true); await p.waitForTimeout(300);
const wOffer = await T(p, '#importOffer');
await p.click('#importYes'); await p.waitForTimeout(400);
check('An update from the other phone that still has the Wealth data doesn\'t bring it back', wOffer.startsWith('Update from this file?') && (await T(p, '#toast')) === 'Updated' &&
  (await p.evaluate(k => localStorage.getItem(k), K.w)) === null && (await LS(p, K.cfg)).wealthRemoved === true && (await LS(p, K.cfg)).people.length === 2, wOffer + ' / ' + await T(p, '#toast'));
// ...nor a pasted backup made before it was removed (a restore never replaces Wealth data that's on the phone, either).
await p.click('#t-settings'); await p.waitForTimeout(100); if (!(await p.isVisible('#backupIn'))) { await p.click('#sBackup summary'); await p.waitForTimeout(60); }
await p.fill('#backupIn', keptW.json); await p.click('#restoreBtn'); await p.waitForTimeout(80); await p.click('#restoreBtn'); await p.waitForTimeout(300);
check('Restoring a backup made before it was removed restores everything else, not the Wealth data', (await T(p, '#restoreMsg')) === 'Backup restored.' && (await p.evaluate(k => localStorage.getItem(k), K.w)) === null &&
  !(await T(p, '#setBackup')).includes('Old Wealth data') && (await LS(p, K.cfg)).wealthRemoved === true);
// Start again keeps it, with this phone's appearance and notifications.
await p.click('#startAgain'); await p.waitForTimeout(80); await p.click('#startAgain'); await p.waitForTimeout(300);
const againCfg = await LS(p, K.cfg);
check('Start again keeps "removed" with this phone\'s own settings', await p.isVisible('#tab-setup') && JSON.stringify(Object.keys(againCfg).sort()) === '["appearance","notify","schema","wealthRemoved"]' && againCfg.wealthRemoved === true, JSON.stringify(againCfg));
check('No JS errors (old Wealth data)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
// The recovery screen (the months can't be read): restoring an automatic backup that has the Wealth data leaves it out.
const wBackup = { name: 'backup-20261014-090000.json', savedAt: '2026-10-14T09:00:00', bytes: 10, json: keptW.json };
({ ctx, p } = await session({ native: true, storage: { [K.cfg]: Object.assign(JSON.parse(keptW.json).config, { wealthRemoved: true }), [K.mon]: 'not json',
  'qa.native': { backups: [wBackup], calls: [], lockOn: false, lockAvail: true, n: 0 } } }));
check('(The recovery screen, offering a backup that has the Wealth data)', await p.isVisible('#recover_0'));
await p.click('#recover_0'); await p.waitForTimeout(700);
check('Restoring it there opens the app without bringing the Wealth data back', await p.isVisible('#tab-pay') && (await p.evaluate(k => localStorage.getItem(k), K.w)) === null && (await LS(p, K.cfg)).wealthRemoved === true, p.errs.join(' | '));
check('No JS errors (old Wealth data, recovery)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
// Dark, 360px wide, larger text; and in a browser, a download.
({ ctx, p } = await session({ storage: sampleStorage(true), w: 360, dark: true }));
await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(60);
const [wdl] = await Promise.all([p.waitForEvent('download'), p.click('#wealthSave')]);
check('In a browser, "Save…" downloads dovetail-wealth-<date>.json', wdl.suggestedFilename() === 'dovetail-wealth-2026-10-15.json' && JSON.stringify(JSON.parse(fs.readFileSync(await wdl.path(), 'utf8')).wealth) === JSON.stringify(SAMPLE.wealth));
await p.waitForTimeout(100);
check('Dark, 360px, larger text: the section fits with no sideways scrolling and no axe violations', await p.isVisible('#wealthDrop') && await p.evaluate(() => document.documentElement.scrollWidth <= 360) && (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#wealthDrop'); await p.waitForTimeout(80); await p.click('#wealthDrop'); await p.waitForTimeout(150);
check('…and removing works there too (the downloaded file is the copy)', (await p.evaluate(k => localStorage.getItem(k), K.w)) === null);
check('No JS errors (old Wealth data, browser)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
await finish();
