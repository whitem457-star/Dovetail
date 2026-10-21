// 2.1 quality improvements: bill categories in Settings, quick add, search, undo for deletes, the cost line,
// and the app details for testers (which must not contain names or amounts).
import { suite, session, sampleStorage, K, T, LS, goMonth, axe, noSideScroll } from './lib.mjs';
const { check, finish } = suite('Quality improvements');
const bills = p => LS(p, K.cfg).then(c => c.bills);
const openBill = async (p, name) => { const b = p.locator('#billList .bill > button', { hasText: name }).first(); if ((await b.getAttribute('aria-expanded')) !== 'true') await b.click(); await p.waitForTimeout(60); };

let { ctx, p } = await session({ storage: sampleStorage(true) });
await p.evaluate(() => { window.__copied = null; try { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied = t; return Promise.resolve(); } } }); } catch (e) {} });
await p.click('#t-settings'); await p.click('#sBills summary'); await p.waitForTimeout(100);

// ---------- categories ----------
check('Bill list shows the category on each bill', (await T(p, '#billList')).includes('Every month · Utilities'));
await openBill(p, 'Council Tax');
const ct = (await bills(p)).find(b => b.name === 'Council Tax');
check('Bill editor has a category select with the suggestion', (await p.inputValue('#bcat_' + ct.id)) === 'utilities' && (await T(p, '#bch_' + ct.id)).includes('Suggested from the name'));
await openBill(p, 'Lumen');
const oc = (await bills(p)).find(b => b.name === 'Lumen');
check('A brand name gets no guess', (await p.inputValue('#bcat_' + oc.id)) === '');
await p.fill('#bn_' + oc.id, 'Lumen energy'); await p.waitForTimeout(700);
check('Renaming re-suggests (Lumen energy → Utilities)', (await p.inputValue('#bcat_' + oc.id)) === 'utilities' && (await bills(p)).find(b => b.id === oc.id).categoryAuto === true);
await p.selectOption('#bcat_' + oc.id, 'housing'); await p.waitForTimeout(100);
let ob = (await bills(p)).find(b => b.id === oc.id);
check('Choosing a category stores it as the user\'s choice', ob.category === 'housing' && ob.categoryAuto === undefined && (await T(p, '#bch_' + oc.id)) === '');
await p.fill('#bn_' + oc.id, 'Lumen gas'); await p.waitForTimeout(700);
check('…and a later rename doesn\'t override it', (await bills(p)).find(b => b.id === oc.id).category === 'housing');
await p.click('#bsv_' + oc.id); await p.waitForTimeout(100);
ob = (await bills(p)).find(b => b.id === oc.id);
check('Ticking "this is savings" sets the category to Savings', ob.savings === true && ob.category === 'savings' && (await p.inputValue('#bcat_' + oc.id)) === 'savings');
await p.selectOption('#bcat_' + oc.id, 'utilities'); await p.waitForTimeout(100);
check('Choosing another category clears the savings tick', !(await bills(p)).find(b => b.id === oc.id).savings && !(await p.isChecked('#bsv_' + oc.id)));

// ---------- cost line ----------
await openBill(p, 'Kestrel home');
const es = (await bills(p)).find(b => b.name === 'Kestrel home');
check('A bill paid once a year shows its yearly cost and monthly equivalent', (await T(p, '#bc_' + es.id)) === '£142.18 a year · £11.85 a month equivalent');
await p.fill('#ba_' + es.id, '144'); await p.waitForTimeout(80);
check('…and updates as you type', (await T(p, '#bc_' + es.id)) === '£144.00 a year · £12.00 a month equivalent');
await openBill(p, 'Water');
check('A monthly bill has no cost line', (await p.$eval('#bc_b4', e => e.textContent)) === '');

// ---------- search ----------
await p.fill('#billSearch', 'net'); await p.waitForTimeout(100);
let names = await p.$$eval('#billList .bill > button > span:first-child', s => s.map(x => x.textContent));
check('Search filters by name ("net" → Netflix)', JSON.stringify(names) === '["Netflix"]', JSON.stringify(names));
check('Search keeps focus while typing', await p.evaluate(() => document.activeElement.id) === 'billSearch');
await p.fill('#billSearch', 'subscriptions'); await p.waitForTimeout(100);
names = await p.$$eval('#billList .bill > button > span:first-child', s => s.map(x => x.textContent));
check('…or by category ("subscriptions")', names.length === 5 && names.includes('Spotify') && names.includes('TV Licence'), JSON.stringify(names));
await p.fill('#billSearch', 'zzz'); await p.waitForTimeout(100);
check('No matches: a clear message', (await T(p, '#billList')).includes('No bills match “zzz”'));
await p.fill('#billSearch', ''); await p.waitForTimeout(100);
check('Clearing the search shows every bill again', (await p.$$('#billList .bill')).length === 31);

// ---------- quick add ----------
await p.click('#quickAddBtn'); await p.waitForTimeout(80);
check('Quick add opens with three rows and the first name focused', (await p.$$('#qa_box .qa-row')).length === 3 && await p.evaluate(() => document.activeElement.id) === 'qa_n_0');
check('Rows default to the joint bills account', (await p.$eval('#qa_s_0', e => e.selectedOptions[0].textContent)) === 'Joint bills account');
await p.fill('#qa_n_0', 'Window cleaner'); await p.click('#qa_add'); await p.waitForTimeout(80);
check('A row with no amount is flagged', (await T(p, '#qa_msg')).includes('needs a name and an amount') && await p.$eval('#qa_a_0', e => e.classList.contains('bad')));
await p.fill('#qa_a_0', '15'); await p.fill('#qa_n_1', 'Pet insurance'); await p.fill('#qa_a_1', '22.40'); await p.selectOption('#qa_s_1', 'jspend');
await p.click('#qa_add'); await p.waitForTimeout(150);
let all = await bills(p);
const wc = all.find(b => b.name === 'Window cleaner'), pi = all.find(b => b.name === 'Pet insurance');
check('Quick add creates the bills, paid every month, with categories suggested', all.length === 33 && wc && wc.amount === 15 && wc.account === 'jbills' && JSON.stringify(wc.months) === '[]' && pi.category === 'insurance' && pi.account === 'jspend');
check('…confirms how many were added and closes', (await T(p, '#toast')).includes('Added 2 bills') && (await p.$('#qa_box')) === null);
await p.click('#t-pay'); await p.waitForTimeout(100);
check('…and the new bills flow into the transfers', (await p.$eval('#floatCards', e => e.textContent)).includes('Pet insurance'));

// ---------- undo ----------
await p.click('#t-settings'); await p.waitForTimeout(80);
const idsBefore = (await bills(p)).map(b => b.id);
await openBill(p, 'Spotify');
await p.click('#billList .bill .ed .btn.danger'); await p.click('#billList .bill .ed .btn.danger'); await p.waitForTimeout(100);
// 2.12: with saved months, a deleted item still counts in earlier months, and the message says so.
check('Deleting a bill offers Undo', await p.isVisible('#undoBar') && (await T(p, '#undoMsg')) === 'Spotify deleted. Earlier months keep it' && !(await bills(p)).some(b => b.name === 'Spotify'));
await p.click('#undoBtn'); await p.waitForTimeout(100);
check('…and puts focus back on the restored bill', await p.evaluate(() => document.activeElement && document.activeElement.closest('.bill') && document.activeElement.textContent.includes('Spotify')));
check('Undo puts it back in the same place with the same id', JSON.stringify((await bills(p)).map(b => b.id)) === JSON.stringify(idsBefore) && await p.isHidden('#undoBar') && (await T(p, '#toast')) === 'Restored');
await openBill(p, 'Netflix');
await p.click('#billList .bill .ed .btn.danger'); await p.click('#billList .bill .ed .btn.danger'); await p.waitForTimeout(100);
await p.mouse.move(5, 5);
check('Undo is offered for 6 seconds…', await p.isVisible('#undoBar'));
await p.waitForTimeout(6300);
check('…then goes away and the delete stands', await p.isHidden('#undoBar') && !(await bills(p)).some(b => b.name === 'Netflix'));
await p.click('#sIncome summary'); await p.locator('#setIncome .box').first().locator('.btn.danger').click(); await p.locator('#setIncome .box').first().locator('.btn.danger').click(); await p.waitForTimeout(100);
check('Removing income offers Undo', (await T(p, '#undoMsg')) === 'Child Benefit removed. Earlier months keep it' && (await LS(p, K.cfg)).income.length === 1);
await p.click('#undoBtn'); await p.waitForTimeout(100);
check('…and Undo restores it first in the list', (await LS(p, K.cfg)).income[0].name === 'Child Benefit');
await p.click('#sBudget summary'); await p.locator('#setBudget .box').nth(1).locator('.btn.danger').click(); await p.locator('#setBudget .box').nth(1).locator('.btn.danger').click(); await p.waitForTimeout(100);
await p.click('#undoBtn'); await p.waitForTimeout(100);
check('Removing and restoring a budget keeps the order', JSON.stringify((await LS(p, K.cfg)).budgets.map(b => b.id)) === '["food","fuel","general"]');
await p.click('#sSavings summary'); await p.locator('#setSavings .box').first().locator('.btn.danger').click(); await p.locator('#setSavings .box').first().locator('.btn.danger').click(); await p.waitForTimeout(100);
check('Removing a savings transfer offers Undo', (await T(p, '#undoMsg')) === 'Stocks and shares ISA removed. Earlier months keep it');
await p.click('#undoBtn'); await p.waitForTimeout(100);
check('…and its October tick still counts after Undo (same id)', (await LS(p, K.cfg)).savings[0].name === 'Stocks and shares ISA');
// reminders
await p.click('#t-due'); await p.waitForTimeout(80);
await p.click('#dueList .btn:has-text("+ Add a reminder")'); await p.waitForTimeout(80);
const rid = await p.evaluate(() => document.activeElement.id);
await p.fill('#' + rid, 'Passport'); await p.waitForTimeout(600);
const dsel = await p.$eval('#dueList .rem:has(#' + rid + ') input[type=date]', e => e.id);
await p.fill('#' + dsel, '2026-10-20'); await p.dispatchEvent('#' + dsel, 'change'); await p.waitForTimeout(100);
await p.click('#dueList .rem:has-text("Passport") .btn:has-text("Done")'); await p.click('#dueList .ed .btn:has-text("Yes, it\'s done")'); await p.waitForTimeout(100);
check('"Done" on a reminder offers Undo', (await T(p, '#undoMsg')) === 'Passport done' && (await LS(p, K.cfg)).doneLog[0].text === 'Passport done');
await p.click('#undoBtn'); await p.waitForTimeout(100);
let cfg = await LS(p, K.cfg);
check('…Undo brings the reminder back and takes it off the done list', cfg.reminders.some(r => r.name === 'Passport') && !(cfg.doneLog[0] || {}).text?.includes('Passport'));
await p.click('#dueList .rem:has-text("Passport") .btn.ghost'); await p.click('#dueList .rem:has-text("Passport") .btn.danger'); await p.click('#dueList .rem:has-text("Passport") .btn.danger'); await p.waitForTimeout(100);
check('Deleting a reminder offers Undo', (await T(p, '#undoMsg')) === 'Passport deleted');
await p.click('#undoBtn'); await p.waitForTimeout(100);
check('…and Undo restores it', (await LS(p, K.cfg)).reminders.some(r => r.name === 'Passport'));
// one-offs
await p.click('#t-pay'); await goMonth(p, 'October 2026');
await p.click('#oneOffs .bill > button'); await p.click('#oneOffs .ed .btn.danger'); await p.click('#oneOffs .ed .btn.danger'); await p.waitForTimeout(100);
check('Deleting a one-off offers Undo', (await T(p, '#undoMsg')) === 'Overdraft from last month deleted' && (await LS(p, K.mon))['2026-10'].oneOffs.length === 0);
await p.click('#next'); await p.click('#undoBtn'); await p.waitForTimeout(100);
check('…Undo puts it back in its own month even after moving to another', (await LS(p, K.mon))['2026-10'].oneOffs.length === 1 && !((await LS(p, K.mon))['2026-11'] || {}).oneOffs?.length);

// ---------- keyboard and timing ----------
await p.click('#t-settings'); await p.waitForTimeout(50); await p.click('#sPeople summary'); await p.fill('#pp_n_alex', 'Al');
await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
check('A Settings change made just before leaving the app is saved and shown', (await LS(p, K.cfg)).people[0].name === 'Al' && (await T(p, '#payGrid')).includes('Al'));
await p.fill('#pp_n_alex', 'Alex'); await p.waitForTimeout(700);
await p.click('#t-settings'); await p.waitForTimeout(50); await openBill(p, 'Water');
await p.focus('#billList .bill .ed .btn.danger'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
check('After the first tap on a delete button, focus stays on it ("Tap again to confirm")', await p.evaluate(() => document.activeElement && document.activeElement.textContent === 'Tap again to confirm'));
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
check('A second press deletes and offers Undo', (await T(p, '#undoMsg')) === 'Water deleted. Earlier months keep it');
await p.focus('#undoBtn'); await p.waitForTimeout(6500);
check('The undo bar waits while it has focus', await p.isVisible('#undoBar'));
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
check('…and Undo still works', (await bills(p)).some(b => b.name === 'Water'));

// ---------- app details for testers ----------
await p.click('#t-settings'); await p.click('#copyDetails'); await p.waitForTimeout(150);
const det = await p.evaluate(() => window.__copied || '');
check('"Copy app details" copies version and device facts', /^Dovetail \d+(\.\d+)+ \(data version 5\)/.test(det) && det.includes('Household: 2 people, 4 accounts, 32 bills, 1 saved month') && (await T(p, '#toast')) === 'App details copied', det);
check('…with no names or amounts', !/Alex|Sam|Mortgage|Kestrel|Joint|Current account|Spotify|£/.test(det), det);
// Send feedback (2.9): in a browser, a mailto link to the support address with the app details.
const fbHref = await p.getAttribute('#sendFeedback', 'href');
const fbBody = decodeURIComponent((/[?&]body=([^&]*)/.exec(fbHref || '') || [])[1] || '');
check('About gives the licence', (await T(p, '#about')).includes('Dovetail is free software under the GNU General Public License, version 3 or later.'));
check('About names the support address and has Send feedback beside Copy app details', (await T(p, '#about')).includes('Or write to dovetail.feedback@gmail.com.') && (await T(p, '#sendFeedback')) === 'Send feedback' && await p.isVisible('#copyDetails'));
check('In a browser, Send feedback is a mailto link with the subject and the app details', (fbHref || '').startsWith('mailto:dovetail.feedback@gmail.com?subject=Dovetail%20' ) && fbHref.includes('%20feedback&body=') && fbBody.startsWith('What happened, or your idea:') && fbBody.includes('App details (no names or amounts):\r\nDovetail '), fbHref);
check('…with no names or amounts in it', !/Alex|Sam|Mortgage|Kestrel|Joint|Current account|Spotify|£/.test(fbBody), fbBody);
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- Send feedback in the app (2.9) ----------
({ ctx, p } = await session({ native: true, storage: sampleStorage(true) }));
await p.click('#t-settings'); await p.waitForTimeout(100);
await p.click('#sBackup summary'); await p.waitForTimeout(100);
check('2.13: Settings › Backup says Share on the Pay tab can send the file too', (await T(p, '#setBackup')).includes('Share on the Pay tab can send the file too (“Send an update for the other phone”)'), await T(p, '#setBackup'));
await p.click('#sBackup summary'); await p.waitForTimeout(80);
check('In the app, Send feedback is a button', (await p.$eval('#sendFeedback', e => e.tagName)) === 'BUTTON');
await p.click('#sendFeedback'); await p.waitForTimeout(150);
const fb = await p.evaluate(() => window.__qaNative.lastFeedback || {});
check('…that asks the app to open the email app, with the subject and the app details', /^Dovetail \d+(\.\d+)+ feedback$/.test(fb.subject || '') && (fb.body || '').startsWith('What happened, or your idea:\n') && fb.body.includes('App details (no names or amounts):\nDovetail ') && fb.body.includes('Household: 2 people, 4 accounts'), JSON.stringify(fb));
check('…never names or amounts', !/Alex|Sam|Mortgage|Kestrel|Joint|Current account|Spotify|£/.test(fb.body || ''), fb.body);
// If the bridge refuses the request (it shouldn't: a missing email app is Android's message), the address is copied.
await p.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied = t; return Promise.resolve(); } } }); delete window.PaydayNative.sendFeedback; });
await p.click('#sendFeedback'); await p.waitForTimeout(150);
check('If the request is refused, the address is copied and the message says so', (await p.evaluate(() => window.__copied)) === 'dovetail.feedback@gmail.com' && (await T(p, '#toast')).startsWith("Couldn't open an email app"));
for (const [dark, w, native] of [[false, 360, true], [true, 360, true], [false, 360, false], [true, 360, false]]) {
  const s2 = await session({ native, storage: sampleStorage(true), dark, w });
  await s2.p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
  await s2.p.click('#t-settings'); await s2.p.locator('#about').scrollIntoViewIfNeeded(); await s2.p.waitForTimeout(100);
  const ax = await axe(s2.p);
  check(`Accessibility: About with Send feedback (${native ? 'app' : 'browser link'}, ${dark ? 'dark' : 'light'}, ${w}px, larger text)`, ax.length === 0 && await noSideScroll(s2.p, w), ax.join(' | '));
  await s2.ctx.close();
}
check('No JS errors (Send feedback)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2.13: keyboard focus survives opening, deleting and restoring an item in Settings ----------
({ ctx, p } = await session({ storage: sampleStorage(false) }));
const act = () => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || (a.parentNode && a.parentNode.id ? a.parentNode.id + '>' + a.tagName : a.tagName)) : ''; });
await p.click('#t-settings'); await p.click('#sBills summary'); await p.waitForTimeout(100);
await p.focus('#bill_b5 > button'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
check('2.13: Enter on a bill opens it with focus in its name box', (await act()) === 'bn_b5' && (await p.getAttribute('#bill_b5 > button', 'aria-expanded')) === 'true', await act());
await p.keyboard.press('Tab');
check('…and Tab goes on through its editor, not back to the top of the list', (await act()) === 'ba_b5', await act());
await p.keyboard.press('Escape'); await p.waitForTimeout(100);
check('…Escape closes it, back on the bill', (await act()) === 'bill_b5>BUTTON' && (await p.getAttribute('#bill_b5 > button', 'aria-expanded')) === 'false', await act());
await p.click('#bill_b5 > button'); await p.waitForTimeout(100);
check('…a tap opens it with focus on the bill, not the name box (no phone keyboard popping up)', (await act()) === 'bill_b5>BUTTON', await act());
await p.focus('#bill_b5 .btn.danger'); await p.keyboard.press('Enter'); await p.waitForTimeout(80); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
check('…"Delete bill", confirmed: focus goes to the next bill', !(await bills(p)).some(b => b.id === 'b5') && (await act()) === 'bill_b6>BUTTON', await act());
await p.focus('#undoBtn'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
check('…Undo: focus goes to the restored bill', (await bills(p)).some(b => b.id === 'b5') && (await act()) === 'bill_b5>BUTTON', await act());
// The last bill of an account: the one before it, and with none, "+ Add a bill".
const lastFd = await p.$$eval('#billList .bill', l => l.map(x => x.id)), fdBills = (await bills(p)).filter(b => b.account === 'cur1').map(b => 'bill_' + b.id);
const lastId = fdBills[fdBills.length - 1], before = lastFd[lastFd.indexOf(lastId) + 1];
await p.click('#' + lastId + ' > button'); await p.waitForTimeout(80); await p.focus('#' + lastId + ' .btn.danger'); await p.keyboard.press('Enter'); await p.waitForTimeout(80); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
check('…deleting the last bill of an account goes on to the next bill in the list', (await act()) === before + '>BUTTON', [await act(), before]);
await p.click('#sIncome summary'); await p.waitForTimeout(100);
const inRows = await p.$$eval('#setIncome > .box', l => l.map(x => x.id));
await p.focus('#' + inRows[0] + ' .btn.danger'); await p.keyboard.press('Enter'); await p.waitForTimeout(80); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
check('Income: "Remove", confirmed: focus goes to the next row\'s name', (await act()) === inRows[1].replace('in_', 'in_n_'), [await act(), inRows[1]]);
await p.focus('#' + inRows[1] + ' .btn.danger'); await p.keyboard.press('Enter'); await p.waitForTimeout(80); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
check('…the last one: focus goes to "+ Add income"', (await act()) === 'in_add', await act());
await p.click('#sBudget summary'); await p.waitForTimeout(100);
const buRows = await p.$$eval('#setBudget > .box', l => l.map(x => x.id));
await p.focus('#' + buRows[buRows.length - 1] + ' .btn.danger'); await p.keyboard.press('Enter'); await p.waitForTimeout(80); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
check('Budgets: removing the last row goes to the one before', (await act()) === buRows[buRows.length - 2].replace('bu_', 'bu_n_'), [await act(), buRows]);
await p.click('#t-due'); await p.waitForTimeout(100); await p.click('#remAdd'); await p.waitForTimeout(100);
await p.fill('#' + (await act()), 'Boiler service'); await p.waitForTimeout(600);
await p.focus('#dueList .ed .btn.danger'); await p.keyboard.press('Enter'); await p.waitForTimeout(80); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
check('Reminders: "Delete reminder", confirmed: focus isn\'t lost', (await act()) !== 'BODY' && !(await LS(p, K.cfg)).reminders.some(r => r.name === 'Boiler service'), await act());
check('No JS errors (focus)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
await finish();
