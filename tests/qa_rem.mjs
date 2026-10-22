// Reminders on our upgraded household (ported from the 1.2 suite): renewals, advice, custom reminders, yearly
// roll-forward, and mortgage deal ends (now on the mortgage bills).
import { suite, session, sampleStorage, K, T, LS, axe, noSideScroll, goMonth } from './lib.mjs';
const { check, finish } = suite('Reminders');

// The made-up names suggest no advice, so this part names two bills the way the advice looks for (insurance, energy).
const named = sampleStorage(false); named[K.cfg] = Object.assign({}, named[K.cfg], { bills: named[K.cfg].bills.map(b => b.id === 'b6' ? Object.assign({}, b, { name: 'Kestrel home insurance' }) : b.id === 'b34' ? Object.assign({}, b, { name: 'Lumen energy' }) : b) });
let { ctx, p } = await session({ storage: named });
const setToday = async iso => { await p.evaluate(i => localStorage.setItem('qa.today', i), iso); await p.reload(); await p.waitForTimeout(250); };
// ---- 15 Oct 2026: only Leisure Centre (renewal 12 Apr 2026) is overdue ----
check('Badge shows 1 on the Reminders tab', (await T(p, '#dueBadge')) === '1' && !(await p.$eval('#dueBadge', e => e.hidden)));
check('Pay tab shows a red banner for the overdue item', (await T(p, '#actionBanner')).includes('Leisure Centre: date has passed') && await p.$eval('#actionBanner .banner', e => e.classList.contains('bad')));
await p.click('#actionBanner .banner'); await p.waitForTimeout(150);
check('Banner opens Reminders', await p.evaluate(() => location.hash) === '#due' && await p.isVisible('#tab-due') && await p.isVisible('#monthBar'));
let due = await T(p, '#dueList');
check('Leisure Centre overdue with advice', /Leisure Centre[\s\S]*Overdue[\s\S]*probably renewed/.test(due), due);
await p.click('#dueAll summary'); await p.waitForTimeout(80);
const all = await T(p, '#dueAll');
check('All upcoming, grouped by month: December 2026 has Kestrel and Lumen', /December 2026[\s\S]*Kestrel home[\s\S]*Lumen/.test(all), all);
check('MOT reminders kept (Jan and Mar 2027)', all.includes('Car 1 MOT') && all.includes('Car 2 MOT'));
check('Mortgage deal end now shows as the Mortgage 1 bill (September 2027)', /September 2027[\s\S]*Mortgage 1/i.test(all), all.slice(-400));
await p.click('#dueAll summary');
await p.click('#dueList .rem.over .btn:not(.ghost)');
check('Overdue renewal suggests the next anniversary (12 Apr 2027)', (await p.inputValue('input[id^="nd_b_"]')) === '2027-04-12');
await p.fill('input[id^="na_b_"]', '39.50'); await p.click('#dueList .rem.over .ed .btn:has-text("Save")'); await p.waitForTimeout(150);
const lc = (await LS(p, K.cfg)).bills.find(b => b.name === 'Leisure Centre');
check('Renewal saved: £39.50 and 12 Apr 2027', lc.amount === 39.5 && lc.renews === '2027-04-12', JSON.stringify(lc));
check('Badge clears', await p.$eval('#dueBadge', e => e.hidden));
check('Empty state names the next item', (await T(p, '#dueList')).includes('Nothing needs doing right now. Next up: Kestrel home insurance on 3 Dec 2026'));

// ---- 10 Nov 2026: Kestrel home (23 days) and Lumen (38 days, 45-day lead) due soon ----
await setToday('2026-11-10T12:00:00Z');
check('Badge shows 2 on 10 Nov', (await T(p, '#dueBadge')) === '2');
await p.click('#t-due'); await p.waitForTimeout(150);
due = await T(p, '#dueList');
check('Kestrel home "in 23 days" with insurance advice', /Kestrel home[\s\S]*3 Dec 2026 · in 23 days[\s\S]*Due soon[\s\S]*Get quotes/.test(due), due);
check('Lumen due soon with tariff advice', /Lumen[\s\S]*in 38 days[\s\S]*Compare tariffs/.test(due));
await p.click('#dueList .rem.soon:has-text("Kestrel") .btn:not(.ghost)');
check('Renewing a future date suggests a year later (3 Dec 2027)', (await p.inputValue('input[id^="nd_b_"]')) === '2027-12-03');
await p.fill('input[id^="na_b_"]', '142.10'); await p.click('#dueList .ed .btn:has-text("Save")'); await p.waitForTimeout(150);
check('Badge drops to 1', (await T(p, '#dueBadge')) === '1');
await p.click('#t-pay'); await p.waitForTimeout(100); await goMonth(p, 'December 2026');
await p.click('#accounts summary');
const dec = await p.$$eval('#acctList .row', rs => rs.map(r => r.textContent).join('|'));
check('December uses the renewed Kestrel price £142.10', dec.includes('Kestrel home') && dec.includes('£142.10'), dec);
await p.click('#t-due'); await p.click('#dueList .rem:has-text("Lumen") .btn.ghost');
await p.selectOption('select[id^="rl_b_"]', '7'); await p.waitForTimeout(100);
check('Changing remind-me to 1 week moves Lumen out of attention', await p.$eval('#dueBadge', e => e.hidden));

// ---- custom reminder ----
await p.click('#dueList .btn:has-text("+ Add a reminder")'); await p.waitForTimeout(100);
const rid = await p.evaluate(() => document.activeElement.id);
check('New reminder opens with the name focused', rid.startsWith('rn_'));
await p.fill('#' + rid, 'Passport renewal'); await p.waitForTimeout(600);
const dateSel = await p.$eval('#dueList .rem:has(#' + rid + ') input[type=date]', e => e.id);
await p.fill('#' + dateSel, '2026-11-20'); await p.dispatchEvent('#' + dateSel, 'change'); await p.waitForTimeout(150);
check('A reminder 10 days away needs attention', (await T(p, '#dueBadge')) === '1' && (await T(p, '#dueList')).includes('Passport renewal'));
await p.click('#dueList .rem.soon:has-text("Passport") .btn:has-text("Done")');
await p.click('#dueList .ed .btn:has-text("Yes, it\'s done")'); await p.waitForTimeout(100);
check('Done removes a one-time reminder', !(await T(p, '#dueList')).includes('Passport renewal') && await p.$eval('#dueBadge', e => e.hidden));

// ---- yearly roll-forward ----
await setToday('2026-12-18T12:00:00Z'); await p.click('#t-due'); await p.waitForTimeout(100);
due = await T(p, '#dueList');
check('Car 1 MOT due soon with MOT advice on 18 Dec', /Car 1 MOT[\s\S]*in 22 days[\s\S]*month \(minus a day\) early/.test(due), due);
check('Lumen fix-end today shows "today"', /Lumen[\s\S]*18 Dec 2026 · today/.test(due));
await p.click('#dueList .rem:has-text("Car 1 MOT") .btn:has-text("Mark as renewed")');
check('Yearly reminder suggests next year', (await p.inputValue('input[id^="nd_r_"]')) === '2028-01-09');
await p.click('#dueList .ed .btn:has-text("Save")'); await p.waitForTimeout(100);
check('MOT rolled to 9 Jan 2028', (await LS(p, K.cfg)).reminders.find(r => r.name === 'Car 1 MOT').date === '2028-01-09');

// ---- mortgage deal end, now on the bill ----
await setToday('2027-06-01T12:00:00Z'); await p.click('#t-due'); await p.waitForTimeout(100);
check('Mortgage deal end enters attention 6 months ahead (1 Jun 2027 → 30 Sep 2027) with mortgage advice', /Mortgage 1[\s\S]*Due soon[\s\S]*Compare deals/.test(await T(p, '#dueList')));
await p.click('#dueList .rem:has-text("Mortgage 1") .btn:has-text("Mark as renewed")');
await p.fill('#dueList .ed input[id^="na_b_"]', '845.00'); await p.fill('#dueList .ed input[id^="nd_b_"]', '2032-10-31');
await p.click('#dueList .ed .btn:has-text("Save")'); await p.waitForTimeout(150);
const nb = (await LS(p, K.cfg)).bills.find(x => x.name === 'Mortgage 1');
check('New deal saved on the bill: £845 a month until 31 Oct 2032', nb.amount === 845 && nb.renews === '2032-10-31', JSON.stringify(nb));
check('The Wealth data is still not touched', JSON.stringify((await LS(p, K.w)).accounts.find(a => a.id === 'mort1').dealEnd) === '"2027-09-30"');

// ---- settings and back button ----
await p.click('#t-settings'); await p.click('#sBills summary'); await p.click('#setBills .bill > button:has-text("Linkway Media")');
check('Bill editor has renewal date and remind-me fields', (await p.inputValue('input[id^="br_"]')) === '2027-08-12' && await p.$('select[id^="bl_"]') !== null);
check('Bill list shows the renewal date', (await T(p, '#setBills')).includes('renews 12 Aug 2027'));
await p.click('#t-due'); await p.goBack(); await p.waitForTimeout(100);
check('Back from Reminders returns to Pay', await p.evaluate(() => location.hash) === '#pay');
for (const dark of [false, true]) {
  await p.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
  await p.click('#t-due'); await p.waitForTimeout(100); await p.click('#dueList .rem .btn.ghost');
  const ax = await axe(p);
  check(`Accessibility on Reminders${dark ? ' (dark)' : ''}`, ax.length === 0, ax.join(', '));
  check(`No sideways scroll on Reminders${dark ? ' (dark)' : ''}`, await noSideScroll(p, 400));
  await p.click('#t-pay');
}
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2.4: Reminders by month ----------
// Payday the 28th, Friday before a weekend. Windows: Oct = 28 Sep–27 Oct, Nov = 28 Oct–26 Nov (December's payday is
// Fri 27 Nov), Dec = 27 Nov–23 Dec, Jan = 24 Dec–27 Jan. (2.16.1, payperiods.md 13.1 H5: January's payday moves to Thu 24
// Dec, as Fri 25 and Mon 28 Dec 2026 are bank holidays, so December's window ends on 23 Dec; changed on purpose.) Fixture dates: Leisure Centre 12 Apr 2026 (overdue), Kestrel home
// 3 Dec, Lumen 18 Dec, Car 1 MOT 9 Jan 2027, Car 2 MOT 11 Mar 2027.
const withPay = sampleStorage(false); withPay[K.cfg] = Object.assign({}, withPay[K.cfg], { payday: { day: 28, weekend: true } });
withPay[K.mon] = { '2026-11': { month: '2026-11', pay: {}, done: {}, oneOffs: [{ id: 'oX', kind: 'out', name: 'Xmas meal', amount: 80, account: 'jbills', date: '2026-11-27' }] } };
({ ctx, p } = await session({ storage: withPay }));
const att = () => T(p, '#dueList > section:first-child');
const label = () => T(p, '#monthLabel');
const mon0 = await label();
await p.click('#actionBanner .banner'); await p.waitForTimeout(150);
check('Opening Reminders from the Pay tab banner keeps the month on screen, with the month bar', (await label()) === mon0 && await p.isVisible('#monthBar'));
const att0 = await att(), badge0 = await T(p, '#dueBadge');
check('"Needs attention" first, then "In <month>"', att0.startsWith('Needs attention') && att0.includes('Leisure Centre') && (await p.$eval('#dueList > section:nth-child(2)', e => e.id)) === 'dueMonth');
await goMonth(p, 'November 2026');
let dm = await T(p, '#dueMonth');
check('November 2026: its window between paydays, and nothing due', dm.startsWith('In November 2026') && dm.includes('28 Oct to 26 Nov, between paydays') && dm.includes('Nothing due in November 2026.'), dm);
await goMonth(p, 'December 2026');
dm = await T(p, '#dueMonth');
check('December 2026 (27 Nov to 23 Dec): Kestrel home, Lumen and the one-off dated 27 Nov saved under November', dm.includes('27 Nov to 23 Dec, between paydays') && /Xmas meal[\s\S]*Kestrel home[\s\S]*Lumen/.test(dm) && !dm.includes('Car 1 MOT'), dm);
check('…with dates and days counted from today, renew/edit/open buttons as before', dm.includes('3 Dec 2026 · in 49 days') && await p.$('#dueMonth .rem .btn.ghost:has-text("Open November 2026")') !== null && await p.$('#dueMonth .rem:has-text("Kestrel") .btn:has-text("Edit")') !== null);
check('Stepping months changes "In …" but never "Needs attention" or the badge', (await att()) === att0 && (await T(p, '#dueBadge')) === badge0);
await goMonth(p, 'January 2027');
check('January 2027: Car 1 MOT', (await T(p, '#dueMonth')).includes('Car 1 MOT') && (await att()) === att0);
await goMonth(p, 'April 2026');
dm = await T(p, '#dueMonth');
// 2.7: an item already under Needs attention is one line in its month, "listed above", with no buttons.
check('A month that has passed still lists its renewal (Leisure Centre in April 2026), as a line pointing to Needs attention', /Leisure Centre · 12 Apr 2026 · \d+ days ago — listed above/.test(dm) && (await p.$$('#dueMonth .remnote button')).length === 0 && (await att()) === att0, dm);
check('An item in both lists has distinct row ids (no duplicate ids on the page)', await p.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.length === new Set(ids).size; }));
await goMonth(p, 'December 2026');
await p.click('#dueMonth .rem:has-text("Kestrel") .btn:has-text("Edit")'); await p.waitForTimeout(80);
check('Editing from the month list opens the editor there only', (await p.$$('#dueList .ed')).length === 1 && (await p.$('#dueMonth .ed')) !== null);
await p.click('#dueMonth .rem:has-text("Kestrel") .btn:has-text("Close")'); await p.waitForTimeout(80);
check('"All upcoming" starts collapsed', !(await p.$eval('#dueAll', d => d.open)));
await p.click('#dueAll summary'); await p.waitForTimeout(80);
const allTxt = await T(p, '#dueAll');
check('…and opens to everything ahead, by month', ['Xmas meal', 'Kestrel home', 'Lumen', 'Car 1 MOT', 'Car 2 MOT', 'Health cash plan', 'Fitzroy', 'Linkway Media', 'Mortgage 1'].every(n => allTxt.includes(n)) && /December 2026[\s\S]*January 2027[\s\S]*March 2027/.test(allTxt) && !allTxt.includes('Leisure Centre'), allTxt);
await p.click('#t-pay'); await p.click('#t-due'); await p.waitForTimeout(100);
check('…stays open for the session', await p.$eval('#dueAll', d => d.open));
await goMonth(p, 'December 2026');
await p.click('#dueList .btn:has-text("+ Add a reminder")'); await p.waitForTimeout(100);
let rs = (await LS(p, K.cfg)).reminders;
check('A new reminder in a month still ahead starts on that month\'s payday (27 Nov 2026), listed and open in that month', rs[rs.length - 1].date === '2026-11-27' && (await p.$('#dueMonth .ed input[id^="rn_"]')) !== null && await p.evaluate(() => document.activeElement.id.startsWith('rn_')));
for (const dark of [false, true]) {
  await p.emulateMedia({ colorScheme: dark ? 'dark' : 'light' }); await p.waitForTimeout(50);
  const ax = await axe(p);
  check(`Accessibility on Reminders by month, editor and All upcoming open${dark ? ' (dark)' : ''}`, ax.length === 0, ax.join(', '));
  check(`No sideways scroll${dark ? ' (dark)' : ''}`, await noSideScroll(p, 400));
}
await p.emulateMedia({ colorScheme: 'light' });
await goMonth(p, 'October 2026');
await p.click('#dueList .btn:has-text("+ Add a reminder")'); await p.waitForTimeout(100);
rs = (await LS(p, K.cfg)).reminders;
check('From the current month (its payday has passed), a new reminder is 30 days from today (14 Nov 2026)', rs[rs.length - 1].date === '2026-11-14');
await p.reload(); await p.waitForTimeout(250); await p.click('#t-due'); await p.waitForTimeout(100);
check('"All upcoming" is closed again after reopening the app', !(await p.$eval('#dueAll', d => d.open)));
check('No JS errors (by month)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Editors and forms across a month change (2.4 review)
const st2 = sampleStorage(false); st2[K.cfg] = Object.assign({}, st2[K.cfg], { payday: { day: 28, weekend: true } });
st2[K.mon] = { '2026-10': { month: '2026-10', pay: {}, done: {}, oneOffs: [{ id: 'oP', kind: 'out', name: 'Past meal', amount: 40, account: 'jbills', date: '2026-10-05' }] } };
({ ctx, p } = await session({ storage: st2 }));
await p.click('#t-due'); await p.waitForTimeout(100); await goMonth(p, 'October 2026');
check('A one-off whose date has passed shows in its month as passed, not overdue', (await T(p, '#dueMonth .rem:has-text("Past meal")')).includes('One-off, passed') && (await p.$('#dueMonth .rem.over:has-text("Past meal")')) === null && !(await att()).includes('Past meal'));
await goMonth(p, 'December 2026');
await p.click('#dueMonth .rem:has-text("Kestrel") .btn:has-text("Edit")'); await p.waitForTimeout(80);
await p.click('#next'); await p.waitForTimeout(100);
check('An editor whose item isn\'t in the new month moves to All upcoming, opened for it', (await p.$('#dueAll .ed')) !== null && (await p.$$('#dueList .ed')).length === 1 && await p.$eval('#dueAll', d => d.open));
await p.click('#prev'); await p.waitForTimeout(100);
check('…and comes back to the month it was opened from, with All upcoming closed again', (await p.$('#dueMonth .ed')) !== null && !(await p.$eval('#dueAll', d => d.open)));
await p.click('#dueMonth .rem:has-text("Kestrel") .btn:has-text("Close")'); await p.waitForTimeout(80); await p.click('#next'); await p.waitForTimeout(100);
check('After closing it, changing month leaves All upcoming closed', !(await p.$eval('#dueAll', d => d.open)) && (await p.$$('#dueList .ed')).length === 0);
await goMonth(p, 'April 2026');
await p.click('#dueList > section:first-child .rem:has-text("Leisure Centre") .btn:has-text("Update renewal")'); await p.waitForTimeout(80);
await p.fill('#dueList input[id^="na_b_"]', '39.50'); await p.fill('#dueList input[id^="nd_b_"]', '2027-05-01');
check('A renew form opened from Needs attention, with the item also in the month: no duplicate ids', (await p.$$('#dueList .ed')).length === 1 && await p.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.length === new Set(ids).size; }));
await p.click('#next'); await p.waitForTimeout(100);
check('A half-filled renew form keeps what was typed when the month changes, and stays in Needs attention', (await p.inputValue('#dueList input[id^="na_b_"]')) === '39.50' && (await p.inputValue('#dueList input[id^="nd_b_"]')) === '2027-05-01' && (await p.$('#dueList > section:first-child .ed')) !== null);
await p.click('#dueList .ed .btn:has-text("Cancel")'); await p.waitForTimeout(80);
await p.click('#dueList > section:first-child .rem:has-text("Leisure Centre") .btn:has-text("Update renewal")'); await p.waitForTimeout(80);
check('…and Cancel drops it: opened again, it starts from the suggestion', (await p.inputValue('#dueList input[id^="nd_b_"]')) === '2027-04-12');
await p.click('#dueList .ed .btn:has-text("Cancel")');
await goMonth(p, 'February 2027');
await p.click('#dueAll summary'); await p.waitForTimeout(80);
await p.click('#dueAll .rem:has-text("Car 1 MOT") .btn:has-text("Edit")'); await p.waitForTimeout(80);
await p.click('#dueList .ed .btn.danger'); await p.click('#prev'); await p.waitForTimeout(100);
check('A delete waiting for its second tap is cancelled by a month change', (await T(p, '#dueList .ed .btn.danger')) === 'Delete reminder');
await p.click('#next'); await p.waitForTimeout(100);
await p.click('#dueList .ed .btn.danger'); await p.click('#dueList .ed .btn.danger'); await p.waitForTimeout(100);
await p.click('#dueAll summary'); await goMonth(p, 'January 2027');
await p.click('#undoBtn'); await p.waitForTimeout(150);
check('Undo after a month change puts focus on the reminder where it\'s now listed', (await LS(p, K.cfg)).reminders.some(r => r.name === 'Car 1 MOT') && await p.evaluate(() => { const a = document.activeElement; return !!a && !!a.closest('#dueMonth .rem') && a.closest('.rem').textContent.includes('Car 1 MOT'); }));
check('No JS errors (editors across months)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Without a payday the month is the calendar month
({ ctx, p } = await session({ storage: sampleStorage(false) }));
await p.click('#t-due'); await p.waitForTimeout(100); await goMonth(p, 'December 2026');
dm = await T(p, '#dueMonth');
check('No payday: "The calendar month", December 2026 has Kestrel home and Lumen', dm.includes('The calendar month') && dm.includes('Kestrel home') && dm.includes('Lumen'), dm);
await goMonth(p, 'January 2027');
check('…and January 2027 has Car 1 MOT', (await T(p, '#dueMonth')).includes('Car 1 MOT'));
await ctx.close();

// ---- 2.13: an empty reminder isn't kept ----
({ ctx, p } = await session({ storage: sampleStorage(false) }));
await p.click('#t-due'); await p.waitForTimeout(100);
const nRem = async () => (await LS(p, K.cfg)).reminders.length, n0 = await nRem(), badgeR0 = await T(p, '#dueBadge');
const closeOpen = () => p.click('#dueList .rem:has(.ed) .btn.ghost[aria-expanded=true]');
await p.click('#remAdd'); await p.waitForTimeout(100);
check('2.13: "+ Add a reminder" opens the editor as before, with the name focused', (await nRem()) === n0 + 1 && (await p.evaluate(() => document.activeElement.id)).startsWith('rn_'));
await closeOpen(); await p.waitForTimeout(100);
check('…closed untouched: it\'s gone, with no Undo message, and focus is on "+ Add a reminder"', (await nRem()) === n0 && await p.isHidden('#undoBar') && !(await T(p, '#dueList')).includes('New reminder') &&
  (await p.evaluate(() => document.activeElement.id)) === 'remAdd');
check('…the badge is as it was', (await T(p, '#dueBadge')) === badgeR0);
await p.click('#remAdd'); await p.waitForTimeout(100); await p.click('#t-pay'); await p.waitForTimeout(100); await p.click('#t-due'); await p.waitForTimeout(100);
check('…left untouched by changing tab: gone too', (await nRem()) === n0 && !(await T(p, '#dueList')).includes('New reminder'));
await p.click('#remAdd'); await p.waitForTimeout(100);
const nid = await p.evaluate(() => document.activeElement.id);
await p.fill('#' + nid, 'Boiler service'); await p.waitForTimeout(600); await closeOpen(); await p.waitForTimeout(100);
check('…one that was edited stays, and focus stays on its Edit button', (await nRem()) === n0 + 1 && (await T(p, '#dueList')).includes('Boiler service') &&
  (await p.evaluate(() => document.activeElement.textContent)) === 'Edit');
await p.click('#remAdd'); await p.waitForTimeout(100);
const did = await p.$eval('#dueList .ed input[type=date]', e => e.id);
await p.fill('#' + did, '2026-12-01'); await p.dispatchEvent('#' + did, 'change'); await p.waitForTimeout(150);
await p.reload(); await p.waitForTimeout(250); await p.click('#t-due'); await p.waitForTimeout(100);
check('…and so does one with only its date changed', (await nRem()) === n0 + 2);
const names = await p.$$eval('#dueList .rem .btn', l => l.map(b => b.getAttribute('aria-label') || b.textContent));
check('2.13: each reminder\'s buttons say which item they\'re for ("Edit Boiler service")', names.includes('Edit Boiler service') && names.every(t => t !== 'Edit' && t !== 'Done' && t !== 'Mark as renewed' && t !== 'Update renewal'), names.join(' | '));
check('…and the name starts with the words on the button', await p.$$eval('#dueList .rem .btn', l => l.every(b => !b.getAttribute('aria-label') || b.getAttribute('aria-label').startsWith(b.textContent))));
check('No axe violations (reminder buttons)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('No JS errors (empty reminder)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
await finish();
