// One-off payments and income for a month: included in that month's transfers, editable, allowed in future
// months, and shown on Reminders when they have a date.
import { suite, session, sampleStorage, K, T, LS, amts, float, goMonth, openDetails } from './lib.mjs';
const { check, finish } = suite('One-offs');
const txt = (p, s) => p.$eval(s, e => e.textContent);

let { ctx, p } = await session({ storage: sampleStorage(false) });
await openDetails(p);
check('One-offs card explains what it\'s for', (await T(p, '#oneOffs')).includes("isn't a regular bill"));
await p.click('#addOneOff'); await p.waitForTimeout(80);
check('Add form opens with the name box focused', await p.isVisible('#oneOffNew') && await p.evaluate(() => document.activeElement.id) === 'oo_name_new');
check('New one-offs default to a payment from the account that keeps its leftover', (await p.inputValue('#oo_kind_new')) === 'out' && (await p.inputValue('#oo_acct_new')) === 'jspend');
await p.fill('#oo_name_new', 'Car service'); await p.click('#oo_add'); await p.waitForTimeout(80);
check('An amount is required', (await T(p, '#oneOffNew')).includes('Enter an amount'));
await p.fill('#oo_amt_new', '240'); await p.selectOption('#oo_acct_new', 'jbills'); await p.click('#oo_add'); await p.waitForTimeout(150);
check('Payment from Joint bills account reduces what it sends to joint spending (£2,261.82)', (await amts(p))[2] === '£2,261.82', (await amts(p)).join(' '));
check('…and the float (£26.83)', (await float(p)) === '£26.83');
check('Listed with its amount and account; card total − £240.00', (await T(p, '#oneOffs')).includes('Car service') && (await T(p, '#oneOffs')).includes('From Joint bills account') && (await T(p, '#ooSum')) === '− £240.00');
let mon = (await LS(p, K.mon))['2026-11'];
check('Saved with the month (pay not entered stays empty)', mon.oneOffs.length === 1 && mon.oneOffs[0].kind === 'out' && mon.oneOffs[0].amount === 240 && mon.oneOffs[0].account === 'jbills' && mon.pay.alex === null);
check('Estimates still used for pay', (await T(p, '#payBanner')).includes('usual pay'));
check('Still reconciles', (await p.$('#check')) === null);

// edit
await p.click('#oneOffs .bill > button'); await p.waitForTimeout(80);
const oid = mon.oneOffs[0].id;
await p.fill('#oo_amt_' + oid, '250'); await p.waitForTimeout(100);
check('Editing the amount updates the transfers straight away (£2,251.82)', (await amts(p))[2] === '£2,251.82' && (await T(p, '#oneOffs .bill > button')).includes('− £250.00'));
await p.click('#oneOffs .ed .btn.ghost'); await p.waitForTimeout(900);
check('Edit saved', (await LS(p, K.mon))['2026-11'].oneOffs[0].amount === 250);

// money in
await p.click('#addOneOff'); await p.selectOption('#oo_kind_new', 'in'); await p.fill('#oo_name_new', 'Refund'); await p.fill('#oo_amt_new', '60'); await p.click('#oo_add'); await p.waitForTimeout(150);
check('Money in to Joint spending account raises the float (£76.83)', (await float(p)) === '£76.83', await float(p));
check('Joint spending account\'s card lists the refund', (await T(p, '#floatCards')).includes('Refund (one-off)') && (await T(p, '#floatCards')).includes('+ £60.00'));
check('Card total is the net (− £190.00)', (await T(p, '#ooSum')) === '− £190.00');
check('Stats include one-offs', (await T(p, '#stats')).includes('BUDGETS & ONE-OFFS') || (await txt(p, '#stats')).includes('Budgets & one-offs'));

// delete
await p.locator('#oneOffs .bill > button', { hasText: 'Car service' }).click(); await p.waitForTimeout(60);
await p.click('#oneOffs .ed .btn.danger');
check('Deleting needs a second tap', (await T(p, '#oneOffs .ed .btn.danger')).includes('Tap again'));
await p.click('#oneOffs .ed .btn.danger'); await p.waitForTimeout(150);
check('Deleted: Joint bills account sends the full £2,501.82 again', (await amts(p))[2] === '£2,501.82' && (await float(p)) === '£326.83');

// future month, with a date
await goMonth(p, 'January 2027');
const janBefore = await float(p);
await p.click('#addOneOff'); await p.fill('#oo_name_new', 'Birthday'); await p.fill('#oo_amt_new', '150'); await p.fill('#oo_date_new', '2027-01-10'); await p.click('#oo_add'); await p.waitForTimeout(150);
check('A one-off can be added to a future month', (await T(p, '#monthLabel')) === 'January 2027' && (await T(p, '#oneOffs')).includes('Birthday') && (await T(p, '#oneOffs')).includes('10 Jan 2027'));
check('…and only changes that month', (await float(p)) !== janBefore && (await LS(p, K.mon))['2027-01'].oneOffs[0].date === '2027-01-10');
await goMonth(p, 'November 2026');
check('November is unaffected', (await float(p)) === '£326.83');
await p.click('#addOneOff'); await p.fill('#oo_name_new', 'School trip'); await p.fill('#oo_amt_new', '30'); await p.fill('#oo_date_new', '2026-10-20'); await p.click('#oo_add'); await p.waitForTimeout(150);
await p.click('#addOneOff'); await p.fill('#oo_name_new', 'Already paid'); await p.fill('#oo_amt_new', '5'); await p.fill('#oo_date_new', '2026-10-01'); await p.click('#oo_add'); await p.waitForTimeout(150);
check('A one-off due within a week counts on the Reminders badge (Leisure Centre + School trip = 2)', (await T(p, '#dueBadge')) === '2');
if (await p.isVisible('#undoBar')) await p.click('#undoX'); // the delete's undo bar sits over the bottom of the page
await p.click('#histBox summary');
check('History lists a month that only has one-offs (January 2027)', (await T(p, '#hist')).includes('January 2027'));
await p.click('#t-due'); await p.waitForTimeout(100); await p.click('#dueAll summary'); await p.waitForTimeout(80);
const due = await T(p, '#dueList');
check('Reminders: School trip needs attention, due soon', /Needs attention[\s\S]*School trip[\s\S]*20 Oct 2026 · in 5 days[\s\S]*Due soon/i.test(due), due.slice(0, 500));
const allUp = await T(p, '#dueAll');
check('Reminders: Birthday under All upcoming in January as a one-off with its budget month', /January 2027[\s\S]*Birthday[\s\S]*One-off/i.test(allUp) && allUp.includes('included in the January 2027 transfers'), allUp);
check('A one-off whose date has passed isn\'t listed as needing attention or upcoming', !due.includes('Already paid'));
await p.click('#prev'); await p.waitForTimeout(150);
check('…but the month it fell in (October 2026) still lists it', (await T(p, '#dueMonth')).includes('Already paid') && (await T(p, '#dueMonth')).includes('School trip'));
await p.click('#next'); await p.waitForTimeout(150);
await p.click('#dueList .rem:has-text("Birthday") .btn:has-text("Open January 2027")'); await p.waitForTimeout(200);
check('"Open January 2027" goes to that month with the one-off open', (await T(p, '#monthLabel')) === 'January 2027' && await p.isVisible('#oo_amt_' + (await LS(p, K.mon))['2027-01'].oneOffs[0].id));
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- editing twice (after an autosave), deleting after an edit, and an unreadable pay box ----------
({ ctx, p } = await session({ storage: sampleStorage(false) }));
await openDetails(p);
await p.click('#addOneOff'); await p.fill('#oo_name_new', 'Dentist'); await p.fill('#oo_amt_new', '100'); await p.click('#oo_add'); await p.waitForTimeout(150);
const did = (await LS(p, K.mon))['2026-11'].oneOffs[0].id;
await p.click('#oneOffs .bill > button'); await p.fill('#oo_amt_' + did, '150'); await p.waitForTimeout(1000);
await p.fill('#oo_amt_' + did, '300'); await p.fill('#oo_name_' + did, 'Dentist and hygienist'); await p.waitForTimeout(1000);
check('A second edit after the autosave is saved too (amount and name)', (await LS(p, K.mon))['2026-11'].oneOffs[0].amount === 300 && (await LS(p, K.mon))['2026-11'].oneOffs[0].name === 'Dentist and hygienist');
check('…and the transfers use it (float −£33.17)', (await float(p)) === '−£33.17', await float(p));
await p.click('#oneOffs .ed .btn.ghost'); await p.waitForTimeout(100);
check('Closing the editor keeps the new amount', (await T(p, '#oneOffs')).includes('− £300.00'));
await p.click('#oneOffs .bill > button'); await p.fill('#oo_amt_' + did, '310'); await p.waitForTimeout(1000);
await p.click('#oneOffs .ed .btn.danger'); await p.click('#oneOffs .ed .btn.danger'); await p.waitForTimeout(150);
check('Deleting after an autosaved edit works', (await LS(p, K.mon))['2026-11'].oneOffs.length === 0 && (await float(p)) === '£266.83');
await p.fill('#pay_alex', '2,000.5.1'); await p.waitForTimeout(100);
await p.click('#addOneOff'); await p.fill('#oo_name_new', 'Gift'); await p.fill('#oo_amt_new', '40'); await p.click('#oo_add'); await p.waitForTimeout(150);
await p.click('#next'); await p.click('#prev'); await p.waitForTimeout(100);
check('A one-off added while a pay box can\'t be read is still saved', (await T(p, '#oneOffs')).includes('Gift') && (await LS(p, K.mon))['2026-11'].oneOffs.length === 1);
check('…and the unreadable pay isn\'t saved as anything', (await LS(p, K.mon))['2026-11'].pay.alex === null);
const gid = (await LS(p, K.mon))['2026-11'].oneOffs[0].id;
await p.click('#oneOffs .bill > button'); await p.fill('#oo_date_' + gid, '2026-10-18'); await p.dispatchEvent('#oo_date_' + gid, 'change'); await p.waitForTimeout(50);
check('Giving a one-off a date updates the Reminders badge straight away', (await T(p, '#dueBadge')) === '2' && (await LS(p, K.mon))['2026-11'].oneOffs[0].date === '2026-10-18');
check('No JS errors (edits)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
await finish();
