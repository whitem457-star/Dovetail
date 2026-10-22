// 2.10 and 2.10.1: Share on the Pay tab asks what to send (2.10.1: WhatsApp drops a message sent with a file): the
// transfers as a message, or an update file for the other phone, which opens it with a short confirmation at the top of
// the Pay tab ("Update from this file?"). A backup from a different household still gets the
// full confirmation in Settings (qa_share.mjs has the rest of that).
import { suite, session, sampleStorage, household, SAMPLE, K, T, LS, axe, noSideScroll } from './lib.mjs';
// Only the calls that send something: the page's own timers (the backup and the notification schedule) can land between two counts on a busy machine.
const sent = calls => calls.filter(c => ['share', 'shareText', 'shareUpdate', 'shareFiles', 'feedback'].includes(c[0]));
const { check, finish } = suite('2.10: updates from the other phone');
const send = (p, v, ok) => p.evaluate(([v, ok]) => window.paydayNativeEvent('import', v, ok), [v, ok]);
const nat = p => p.evaluate(() => window.__qaNative);
// Waits (up to 3 s) until the stand-in for the Android bridge has had `count` calls named `name`: a fixed pause after a tap
// was too short on a slow CI runner (run 212).
const calledTimes = async (p, name, count) => { for (let i = 0; i < 30; i++) { const n = await nat(p); if (n.calls.filter(c => c[0] === name).length >= count) return; await p.waitForTimeout(100); } };
const ticks = p => p.$$eval('#steps .step', l => l.map(s => s.classList.contains('done')));
const focused = p => p.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.textContent));
// The other phone: the same household (the made-up one), with this phone's own look and notification settings.
const herStorage = (look) => { const s = sampleStorage(true); s[K.cfg] = Object.assign({}, SAMPLE.config, { appearance: look, notify: { on: false, time: '21:00', amounts: false } }); return s; };

// ---------- A. Sending: Share on the Pay tab ----------
let { ctx, p } = await session({ storage: sampleStorage(true), native: true });
const month = await T(p, '#monthLabel');
await p.click('#steps li:nth-child(1) .tick'); await p.waitForTimeout(100);
await p.fill('#pay_alex', '2444.44');
check('Share is labelled for screen readers as offering the transfers or an update file, and opens a dialog', (await p.getAttribute('#shareTransfers', 'aria-label')) === "Share this month's transfers or an update file" &&
  (await p.getAttribute('#shareTransfers', 'aria-haspopup')) === 'dialog');
// Straight away, before the pay has been saved on its timer (0.7 s): the file must still have it.
await p.click('#shareTransfers'); await p.click('#shareAsFile'); await p.waitForTimeout(150);
let n = await nat(p);
const up = n.lastUpdate || {};
check('"Send an update for the other phone" sends the update file, not the text, and closes the panel, focus back on Share', n.calls.some(c => c[0] === 'shareUpdate') && !n.calls.some(c => c[0] === 'shareText') &&
  !(await p.isVisible('#sheet')) && (await p.evaluate(() => document.activeElement.id)) === 'shareTransfers', JSON.stringify(n.calls.slice(-3)));
check('…named so it says what it is and when', up.name === 'Dovetail-update-15-Oct-2026.json', up.name);
check('…with the transfers as its message too (an email keeps it), then what to do with the file', String(up.text).startsWith('Dovetail transfers for ' + month + '\n1. ') &&
  String(up.text).endsWith('\n\nTap the file to update Dovetail on your phone.') && up.title === 'Dovetail transfers for ' + month, up.text);
const file = JSON.parse(up.json || '{}'), mk = Object.keys(file.months || {}).find(k => file.months[k].pay && file.months[k].pay.alex === 2444.44);
check('…and the file is a whole backup, with the pay typed a moment ago and the tick', file.app === 'payday-transfers' && file.version === 5 && !!mk &&
  Object.keys(file.months[mk].done || {}).length === 1 && file.config.people.length === 2, JSON.stringify(file.months && file.months[mk]));
await p.click('#shareTransfers'); await p.waitForTimeout(150);
check('2.10.1: Share asks what to send (WhatsApp drops the message when a file goes with it)', await p.isVisible('#sheet') && (await T(p, '#sheetH')) === 'Share this month' &&
  (await p.textContent('#shareAsText')) === 'Send the transfers as a message' && (await p.textContent('#shareAsFile')) === 'Send an update for the other phone' && (await p.evaluate(() => document.activeElement.id)) === 'sheetH');
check('…nothing is sent until one is chosen', sent((await nat(p)).calls).length === sent(n.calls).length);
check('No axe violations with the choice showing', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.keyboard.press('Tab');
check('Keyboard: Tab from the title reaches the two choices in order', (await p.evaluate(() => document.activeElement.id)) === 'shareAsText' && (await p.keyboard.press('Tab'), await p.evaluate(() => document.activeElement.id)) === 'shareAsFile');
const textsBefore = (await nat(p)).calls.filter(c => c[0] === 'shareText').length;
await p.click('#shareAsText'); await calledTimes(p, 'shareText', textsBefore + 1);
n = await nat(p);
check('"Send the transfers as a message" sends the text only', n.calls[n.calls.length - 1][0] === 'shareText' && n.calls.filter(c => c[0] === 'shareUpdate').length === 1 &&
  String(n.lastText).startsWith('Dovetail transfers for ' + month + '\n1. ') && !String(n.lastText).includes('Tap the file'));
await p.click('#shareTransfers'); await p.waitForTimeout(150); await p.click('#sheetClose'); await p.waitForTimeout(150);
check('Close sends nothing', sent((await nat(p)).calls).length === sent(n.calls).length && !(await p.isVisible('#sheet')));
// If the app can't prepare the file, it says so (the choice was the file, so no text goes instead).
const prevCalls = (await nat(p)).calls;
await p.evaluate(() => { window.__qaNative.updateFails = true; window.__qaSave(); });
await p.click('#shareTransfers'); await p.waitForTimeout(150); await p.click('#shareAsFile');
await p.waitForFunction(() => document.getElementById('toast').textContent === "Couldn't prepare the update file.", null, { timeout: 3000 }).catch(() => {});
n = await nat(p);
// The last thing sent is the failed update file (an automatic backup, "save", can land in between under load: not a send).
check('If the file can\'t be prepared, it says so and sends nothing else', sent(n.calls)[sent(n.calls).length - 1][0] === 'shareUpdate' && sent(n.calls).length === sent(prevCalls).length + 1 && (await T(p, '#toast')) === "Couldn't prepare the update file.", JSON.stringify([n.calls.slice(-2), await T(p, '#toast')]));
await p.evaluate(() => { window.__qaNative.updateFails = false; window.__qaSave(); });
const sentTicks = await ticks(p), sentFloat = await p.textContent('#heroFloat'), sentProgress = await T(p, '#progressText');
check('No JS errors (sending)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- B. Opening it on the other phone ----------
({ ctx, p } = await session({ storage: herStorage({ theme: 'light', textSize: 'normal' }), native: true }));
const herBefore = await LS(p, K.mon);
check('(The other phone has no ticks yet, and shows What\'s new)', (await ticks(p)).every(t => !t) && await p.isVisible('#whatsNew .banner'));
await send(p, up.json, true); await p.waitForTimeout(250);
check('It opens on the Pay tab, not Settings', await p.isVisible('#tab-pay') && !(await p.isVisible('#tab-settings')));
check('…with a short confirmation at the top, as the only notice', await p.isVisible('#updateOffer #importOffer') && (await p.$$('#notice .banner, #notice .card')).length === 1 && (await T(p, '#whatsNew')) === '');
const card = await T(p, '#importOffer');
check('…"Update from this file?", when it was saved and what happens', card.startsWith('Update from this file?') && card.includes('Saved 15 Oct 2026, ') &&
  card.includes("This replaces the figures on this phone; what's here now is kept in the automatic backups for 30 days."), card);
check('…without the list of what\'s in it or the red "Replace" button', !card.includes('saved month') && (await p.textContent('#importYes')) === 'Update' && !(await p.$eval('#importYes', b => b.classList.contains('danger'))) && (await p.textContent('#importNo')) === 'Cancel');
check('…labelled for screen readers, with focus on its title', (await p.getAttribute('#importOffer', 'role')) === 'group' && (await p.getAttribute('#importOffer', 'aria-label')) === 'Update from a Dovetail file' && (await focused(p)) === 'Update from this file?');
await p.keyboard.press('Tab');
check('Keyboard: Tab from the title reaches Update, then Cancel', (await focused(p)) === 'importYes' && (await p.keyboard.press('Tab'), await focused(p)) === 'importNo');
check('No axe violations with it showing (light)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('Nothing has changed yet', JSON.stringify(await LS(p, K.mon)) === JSON.stringify(herBefore));
await p.click('#importNo'); await p.waitForTimeout(150);
check('Cancel: it goes, nothing changes, and focus goes to the pay card', (await p.$('#importOffer')) === null && (await T(p, '#toast')) === 'Nothing was changed' &&
  JSON.stringify(await LS(p, K.mon)) === JSON.stringify(herBefore) && (await focused(p)) === 'payH');
// From another tab, it still comes up on Pay.
await p.click('#t-settings'); await p.waitForTimeout(100);
await send(p, up.json, true); await p.waitForTimeout(900);
check('Opened while Settings is on screen: it comes up on the Pay tab', await p.isVisible('#tab-pay') && await p.isVisible('#updateOffer #importOffer') && (await focused(p)) === 'Update from this file?');
await p.click('#importYes'); await p.waitForTimeout(400);
const herCfg = await LS(p, K.cfg);
check('Update: the other phone now has the same ticks, left over and progress', JSON.stringify(await ticks(p)) === JSON.stringify(sentTicks) &&
  (await p.textContent('#heroFloat')) === sentFloat && (await T(p, '#progressText')) === sentProgress, JSON.stringify([await ticks(p), sentTicks, await p.textContent('#heroFloat'), sentFloat]));
check('…and the pay that was typed', (await LS(p, K.mon))[mk].pay.alex === 2444.44);
check('…says "Updated", stays on Pay with focus on the pay card, and the card has gone', (await T(p, '#toast')) === 'Updated' && await p.isVisible('#tab-pay') && (await p.$('#importOffer')) === null && (await focused(p)) === 'payH');
check('…what was on the phone was kept as a backup first (kept 30 days)', (await nat(p)).calls.some(c => c[0] === 'keep' && c[1] === 'Alex,Sam'));
check('…and this phone keeps its own notification and appearance settings', JSON.stringify(herCfg.notify) === '{"on":false,"time":"21:00","amounts":false}' && herCfg.appearance.theme === 'light');
check('…and an automatic backup of the update follows', await p.waitForTimeout(2800).then(async () => (await nat(p)).backups.some(b => !b.kept && b.json.includes('2444.44'))));
check('No JS errors (opening)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- C. Dark, 360px wide, larger text ----------
({ ctx, p } = await session({ storage: herStorage({ theme: 'dark', textSize: 'large' }), native: true, w: 360, dark: true }));
await send(p, up.json, true); await p.waitForTimeout(250);
check('Dark, 360px, larger text: the card shows with no sideways scrolling', await p.isVisible('#importOffer') && await noSideScroll(p, 360) && (await p.getAttribute('html', 'data-text')) === 'large');
check('…buttons fit inside the card', await p.$eval('#importOffer', c => { const r = c.getBoundingClientRect(); return [...c.querySelectorAll('button')].every(b => { const x = b.getBoundingClientRect(); return x.left >= r.left - 1 && x.right <= r.right + 1 && x.height >= 44; }); }));
check('No axe violations (dark, larger text)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await ctx.close();

// ---------- C2. What the review of 2.10 found ----------
// The other phone has ticked something since the file was saved (the file is from 12:00, the clock's "now").
({ ctx, p } = await session({ storage: (() => { const s = herStorage({ theme: 'light', textSize: 'normal' }); s[K.mon] = JSON.parse(JSON.stringify(SAMPLE.months));
  const k = Object.keys(s[K.mon])[0]; s[K.mon][k].updatedAt = '2026-10-15T13:00:00.000Z'; return s; })(), native: true }));
await send(p, up.json, true); await p.waitForTimeout(250);
check('A file older than changes on this phone says so, and Update turns red', (await T(p, '#updateOlder')) === "This phone has changes made after this file was saved. They'll be replaced." &&
  await p.$eval('#importYes', b => b.classList.contains('danger')) && (await p.textContent('#importYes')) === 'Update');
check('No axe violations with that line showing', (await axe(p)).length === 0, (await axe(p)).join(' | '));
// The kept backup can't be written: nothing changes.
const monBefore = await LS(p, K.mon);
await p.evaluate(() => { window.__qaNative.keepFails = true; window.__qaSave(); });
await p.click('#importYes'); await p.waitForTimeout(300);
check('If the backup of this phone can\'t be saved, Update changes nothing and says so', (await T(p, '#toast')) === "Couldn't save a backup, so nothing was changed." &&
  JSON.stringify(await LS(p, K.mon)) === JSON.stringify(monBefore) && await p.isVisible('#updateOffer #importOffer'));
await p.evaluate(() => { window.__qaNative.keepFails = false; window.__qaSave(); });
// While that card waits, a different household's file arrives: it goes to Settings, and focus goes there.
const otherFile = JSON.stringify({ app: 'payday-transfers', version: 5, savedAt: '2026-10-16T10:00:00.000Z', months: {},
  config: household({ schema: 5, people: [{ id: 'pat', name: 'Pat', payAccount: 'm', usualPay: 1500 }], accounts: [{ id: 'm', name: 'Main', colour: 'blue', leftoverTo: null }], bills: [] }) });
await send(p, otherFile, true); await p.waitForTimeout(250);
check('Another household\'s file while an update waits: the Settings card, with focus on it, and no second card on Pay', await p.isVisible('#setBackup #importOffer') &&
  (await p.$$('#importOffer')).length === 1 && (await focused(p)) === 'Open this Dovetail backup?');
await p.click('#importNo'); await p.waitForTimeout(100);
// "Import a backup file…" is a restore chosen on purpose: the full confirmation, even for this household's own file.
await p.click('#importFile'); await p.waitForTimeout(50);
await send(p, up.json, true); await p.waitForTimeout(250);
check('A file picked with "Import a backup file…" gets the full confirmation, even from this household', await p.isVisible('#setBackup #importOffer') &&
  (await p.textContent('#importYes')) === 'Replace with this backup' && (await p.$('#updateOffer #importOffer')) === null);
await p.click('#importNo'); await p.waitForTimeout(100);
await send(p, up.json, true); await p.waitForTimeout(250);
check('…and the next file shared from WhatsApp is an update again', await p.isVisible('#updateOffer #importOffer'));
await p.click('#importNo'); await p.waitForTimeout(100);
// A help sheet open on Analysis.
await p.click('#t-analysis'); await p.waitForTimeout(300);
await p.click('#tab-analysis .helpq'); await p.waitForTimeout(200);
check('(A help sheet is open)', await p.isVisible('#sheet'));
await send(p, up.json, true); await p.waitForTimeout(1300);
check('Opened with a help sheet showing: the sheet closes and the card comes up on Pay, with focus on it', !(await p.isVisible('#sheet')) && await p.isVisible('#tab-pay') &&
  await p.isVisible('#updateOffer #importOffer') && (await focused(p)) === 'Update from this file?' && (await p.evaluate(() => location.hash)) === '#pay');
await p.click('#importNo'); await p.waitForTimeout(100);
// The tour.
await p.click('#t-settings'); await p.waitForTimeout(100); await p.click('#sHelp summary'); await p.waitForTimeout(80); await p.click('#tourStart'); await p.waitForTimeout(400);
check('(The tour is running)', await p.isVisible('#tour'));
await send(p, up.json, true); await p.waitForTimeout(1300);
check('Opened during the tour: the tour ends and the card comes up on Pay, with focus on it', !(await p.isVisible('#tour')) && await p.isVisible('#tab-pay') &&
  await p.isVisible('#updateOffer #importOffer') && (await focused(p)) === 'Update from this file?' && (await p.$('#main[inert]')) === null);
await p.click('#importYes'); await p.waitForTimeout(400);
check('…and Update still works from there', (await T(p, '#toast')) === 'Updated' && (await LS(p, K.mon))[mk].pay.alex === 2444.44);
check('No JS errors (review checks)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- D. A different household's file, the example, and a phone not set up yet ----------
const other = JSON.stringify({ app: 'payday-transfers', version: 5, savedAt: '2026-10-16T10:00:00.000Z', months: {},
  config: household({ schema: 5, people: [{ id: 'pat', name: 'Pat', payAccount: 'm', usualPay: 1500 }], accounts: [{ id: 'm', name: 'Main', colour: 'blue', leftoverTo: null }], bills: [] }) });
({ ctx, p } = await session({ storage: sampleStorage(true), native: true }));
await send(p, other, true); await p.waitForTimeout(250);
check('A different household\'s backup: the full confirmation in Settings, as before', await p.isVisible('#tab-settings') && await p.isVisible('#setBackup #importOffer') &&
  (await T(p, '#importOffer')).includes('This replaces all people, accounts, bills and saved months on this phone.') && (await p.textContent('#importYes')) === 'Replace with this backup' && (await p.$('#updateOffer #importOffer')) === null);
await p.click('#importNo'); await ctx.close();
({ ctx, p } = await session({ native: true }));
await p.click('#su_example'); await p.waitForTimeout(300);
await p.click('#shareTransfers'); await p.waitForTimeout(150);
n = await nat(p);
check('…and Share there isn\'t marked as opening a dialog', (await p.getAttribute('#shareTransfers', 'aria-haspopup')) === null && (await p.getAttribute('#shareTransfers', 'aria-label')) === "Share this month's transfers");
check('The example household: Share sends the text only (no file of the example)', n.calls.some(c => c[0] === 'shareText') && !n.calls.some(c => c[0] === 'shareUpdate'));
await send(p, up.json, true); await p.waitForTimeout(250);
check('…and opening an update there is a restore, as before', await p.isVisible('#setBackup #importOffer') && (await p.textContent('#importYes')) === 'Restore this backup');
await ctx.close();
({ ctx, p } = await session({ native: true }));
await send(p, up.json, true); await p.waitForTimeout(250);
check('A new install opening an update: restored from setup, as before', await p.isVisible('#tab-setup') && await p.isVisible('#importOffer') && (await p.textContent('#importYes')) === 'Restore this backup');
await p.click('#importYes'); await p.waitForTimeout(400);
check('…giving the same household', (await LS(p, K.cfg)).people.map(x => x.name).join(',') === 'Alex,Sam' && (await LS(p, K.mon))[mk].pay.alex === 2444.44);
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- E. 2.13: files say which version they need ----------
// A made-up couple sharing a joint account half each: a phone before 2.13 would show it as short, so the file is version 6.
const shares = () => ({ [K.cfg]: household({ schema: 5, lastVersion: '2.12.1', payday: { day: 28 },
  people: [{ id: 'kim', name: 'Kim', payAccount: 'K', usualPay: 3000 }, { id: 'lee', name: 'Lee', payAccount: 'L', usualPay: 2000 }],
  accounts: [{ id: 'K', name: 'Kim own', colour: 'blue', leftoverTo: null }, { id: 'L', name: 'Lee own', colour: 'red', leftoverTo: null },
    { id: 'J', name: 'Joint', colour: 'purple', leftoverTo: null, funding: { people: ['kim', 'lee'], rule: 'equal' } }],
  bills: [{ id: 'rent', name: 'Rent', amount: 1500, account: 'J', months: [] }] }) });
({ ctx, p } = await session({ storage: shares(), native: true }));
await p.fill('#pay_kim', '3100'); await p.waitForTimeout(100);
await p.click('#shareTransfers'); await p.waitForTimeout(150); await p.click('#shareAsFile'); await p.waitForTimeout(150);
const up6 = (await nat(p)).lastUpdate || {}, f6 = JSON.parse(up6.json || '{}');
check('A household with shares sends a version 6 update file that needs 2.13', f6.version === 6 && f6.needs === '2.13' && f6.config.accounts[2].funding.rule === 'equal' &&
  String(up6.json).startsWith('{"app":"payday-transfers","version":6,"needs":"2.13","savedAt":'), String(up6.json).slice(0, 90));
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(60);
await p.click('#shareBackup'); await p.waitForTimeout(80);
await p.click('#setBackup .btn.ghost:has-text("Show backup")'); await p.waitForTimeout(60);
const shown = JSON.parse(await p.inputValue('#backupOut'));
check('…and so does its backup (shared or copied)', (await nat(p)).calls.some(c => c[0] === 'share') && shown.version === 6 && shown.needs === '2.13');
await p.waitForTimeout(2700);
check('…and its automatic backups', (await nat(p)).backups.filter(b => !b.kept).every(b => JSON.parse(b.json).version === 6 && JSON.parse(b.json).needs === '2.13') && (await nat(p)).backups.some(b => !b.kept));
check('No JS errors (sending a version 6 file)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
({ ctx, p } = await session({ storage: shares(), native: true }));
await send(p, up6.json, true); await p.waitForTimeout(250);
check('Opened on the other phone, a version 6 file is offered as an update', await p.isVisible('#updateOffer #importOffer') && (await p.textContent('#importYes')) === 'Update');
await p.click('#importYes'); await p.waitForTimeout(400);
check('…and Update brings it in, shares and all', (await T(p, '#toast')) === 'Updated' && Object.values(await LS(p, K.mon)).some(m => m.pay && m.pay.kim === 3100) && (await LS(p, K.cfg)).accounts[2].funding.rule === 'equal');
// A file from a later version that says it needs that version.
const cfgBefore = await p.evaluate(k => localStorage.getItem(k), K.cfg), monBefore9 = await p.evaluate(k => localStorage.getItem(k), K.mon);
const f9 = JSON.stringify(Object.assign({}, f6, { needs: '9.0' }));
await send(p, f9, true); await p.waitForTimeout(250);
check('A file that needs Dovetail 9.0 is refused, naming the version, with no card', (await T(p, '#toast')) === 'This file needs Dovetail 9.0 or later. Update the app first.' && (await p.$('#importOffer')) === null);
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(60);
await p.fill('#backupIn', f9); await p.click('#restoreBtn'); await p.waitForTimeout(80); if ((await T(p, '#restoreBtn')).includes('Tap again')) await p.click('#restoreBtn'); await p.waitForTimeout(200);
check('…pasted, it\'s refused the same way', (await T(p, '#restoreMsg')) === 'This file needs Dovetail 9.0 or later. Update the app first.');
check('…and nothing changes', (await p.evaluate(k => localStorage.getItem(k), K.cfg)) === cfgBefore && (await p.evaluate(k => localStorage.getItem(k), K.mon)) === monBefore9);
check('A version 6 file without "needs" (no Dovetail writes one) is refused as from a newer version', await (async () => {
  await send(p, JSON.stringify(Object.assign({}, f6, { needs: undefined })), true); await p.waitForTimeout(150); return (await T(p, '#toast')).includes('newer version of Dovetail'); })());
check('No JS errors (opening a version 6 file)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

await finish();
