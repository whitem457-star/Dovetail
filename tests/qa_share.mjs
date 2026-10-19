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
check('…and the kept backup is labelled in the list', (await T(p, '#setBackup')).includes('saved before a restore, kept 30 days'));
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
await finish();
