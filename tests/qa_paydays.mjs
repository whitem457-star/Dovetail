// 2.17: counting paydays (layer 2) on screen (docs/payperiods.md 13.2, L1 to L19; 5.4 to 5.6; model.md 4). Someone paid
// weekly, every two weeks or every four weeks with "A recent payday": setup step 2's field and step 3's last pay, Settings
// › People's field and "Next payday", the change sheet's first pay and L7's wait, the Pay tab's hint with dates, the
// extra payday line the count opens (Count it, Set it aside, Not an extra payday, It was an extra payday, E10's two taps
// with ticks), the default following typed pay until it's edited, the gap line and "Use it this month" with its lock,
// frozen months, Analysis, backups needing 2.17, and that typed months never move (L1, L19). Light and dark, 360px,
// larger text, keyboard, screen-reader names and axe. Made-up households only.
import { suite, session, K, LS, T, axe, noSideScroll, goMonth, openDetails, PAGE } from './lib.mjs';
import fs from 'fs';
const NEWV = /var VERSION="([\d.]+)"/.exec(fs.readFileSync(PAGE, 'utf8'))[1];
const { check, finish } = suite('2.17: counting paydays');
const txt = (p, s) => T(p, s).then(t => t.replace(/\s+/g, ' ').trim()).catch(() => '');
// What's on screen (short dates; the .sr full dates left out) and what a screen reader reads (aria-hidden left out).
const vis = (p, s) => p.$eval(s, e => { const c = e.cloneNode(true); c.querySelectorAll('.sr').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); }).catch(() => '');
const heard = (p, s) => p.$eval(s, e => { const c = e.cloneNode(true); c.querySelectorAll('[aria-hidden=true]').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); }).catch(() => '');
const amtsOf = p => p.$$eval('#steps .amt', l => l.map(x => x.textContent));
const focusId = p => p.evaluate(() => document.activeElement && document.activeElement.id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (p, ms = 150) => p.waitForTimeout(ms);
const shown = async (p, s) => !!(await p.$(s)) && await p.isVisible(s);
const openSet = async (p, id) => { await p.click('#t-settings'); await wait(p, 80); if (!(await p.$eval('#' + id, d => d.open))) await p.click('#' + id + ' summary'); await wait(p, 80); };
const toPay = async p => { await p.click('#t-pay'); await wait(p); };
const mon = async (p, k) => ((await LS(p, K.mon)) || {})[k] || {};
const hero = p => p.$eval('#heroFloat', e => e.textContent).catch(() => '');
const name = (p, s) => p.$eval(s, e => e.getAttribute('aria-label') || e.textContent.trim()).catch(() => '');
const noAxe = async (p, what) => { const v = await axe(p); check('No axe violations (' + what + ')', v.length === 0, v.join(' | ')); };
const base = o => Object.assign({ schema: 5, setupDone: true, lastVersion: NEWV, setupTips: true, income: [], budgets: [], savings: [], reminders: [], doneLog: [] }, o);

// Jordan (made up), £420.00 every week on Fridays, a recent payday Fri 2 Oct 2026; transfer day the 28th. Bills (£686.00) are
// topped up from his current account, £60.00 goes to Savings and the rest moves on to Spending.
const JORDAN = (o = {}) => base(Object.assign({
  people: [{ id: 'jordan', name: 'Jordan', payAccount: 'cur', usualPay: 1820, pattern: { every: 7, each: 420, on: '2026-10-02' } }],
  accounts: [{ id: 'cur', name: 'Current account', colour: 'blue', leftoverTo: 'spend' }, { id: 'bills', name: 'Bills account', colour: 'purple', leftoverTo: 'cur' },
    { id: 'spend', name: 'Spending', colour: 'orange', leftoverTo: null }],
  bills: [{ id: 'rent', name: 'Rent', amount: 600, account: 'bills', months: [] }, { id: 'en', name: 'Energy', amount: 86, account: 'bills', months: [] }],
  budgets: [{ id: 'food', name: 'Food', amount: 300, account: 'spend' }], savings: [{ id: 'sv', name: 'Savings', amount: 60, fromAccount: 'cur' }],
  payday: { day: 28, weekend: true } }, o));

const ASIDE = "Set aside: it stays in Jordan's account and isn't in these transfers.";
const WARN = 'Some transfers are ticked already. Setting this aside lowers them, and Dovetail will show what to move back.';
let ctx, p, c, m;

// ---------- 1. Jordan's December 2026: five Fridays. The hint, a tick before pay is typed (rule 1), the line it opens ----------
{
  ({ ctx, p } = await session({ today: '2026-11-20', storage: { [K.cfg]: JORDAN() } }));
  check('Opens on December 2026 (transfer day Fri 27 Nov)', (await T(p, '#monthLabel')) === 'December 2026');
  const H1 = '5 paydays since Wed 28 Oct, one more than usual: 30 Oct, 6, 13, 20 and 27 Nov (1 still to come). Until then: 4 × £420.00; the extra one is set aside once you type what arrived.';
  check('The hint, untyped, with one more than usual: "' + H1 + '"', (await vis(p, '#payHint_jordan')) === H1, await vis(p, '#payHint_jordan'));
  check('…a screen reader hears full dates: "since Wednesday 28 October, … 30 October, 6, 13, 20 and 27 November"', (await heard(p, '#payHint_jordan')) ===
    '5 paydays since Wednesday 28 October, one more than usual: 30 October, 6, 13, 20 and 27 November (1 still to come). Until then: 4 × £420.00; the extra one is set aside once you type what arrived.', await heard(p, '#payHint_jordan'));
  check('…the estimate is 4 × £420.00 (never above usual: min(M, N), L2), in the placeholder and the transfers', (await p.getAttribute('#pay_jordan', 'placeholder')) === '1680.00' &&
    same(await amtsOf(p), ['£934.00', '£686.00', '£60.00']), (await amtsOf(p)).join(' '));
  check('…the top banner: "These transfers use Jordan\'s usual pay for 4 paydays."', (await txt(p, '#payBanner')) === "These transfers use Jordan's usual pay for 4 paydays.");
  check('…no extra payday line or link until pay is typed', (await p.$('#extra_jordan')) === null && (await p.$('#extraAdd_jordan')) === null);
  await noAxe(p, 'the hint with dates');
  // A tick before pay is typed: the box gets 4 × £420.00, and the month's count is frozen with the default (inert).
  await p.click('#steps li:nth-child(2) .tick'); await wait(p, 300);
  m = await mon(p, '2026-12');
  check('A tick fills the box with £1,680.00 and freezes 5 paydays with £420.00 set aside (inert while untyped, L2)', (await p.inputValue('#pay_jordan')) === '1680.00' &&
    same(m.paydays, { jordan: 5 }) && same(m.extra, { jordan: { amount: 420 } }) && same(m.payEstimated, { jordan: true }), JSON.stringify(m));
  check('…the hint: "4 × £420.00 (estimated — tap to type what arrived)", and no line yet', (await vis(p, '#payHint_jordan')) === '4 × £420.00 (estimated — tap to type what arrived)' && (await p.$('#extra_jordan')) === null, await vis(p, '#payHint_jordan'));
  check('…the transfers are unchanged (the set-aside amount is inert)', same(await amtsOf(p), ['£934.00', '£686.00', '£60.00']), (await amtsOf(p)).join(' '));
  // Jordan types £1,851.00: the line opens by itself, set aside (never counted), with £370.20 (rule 1).
  await p.fill('#pay_jordan', '1851'); await wait(p, 900);
  const HEAD = 'Jordan has 5 paydays since Wed 28 Oct, one more than usual: 30 Oct, 6, 13, 20 and 27 Nov (1 still to come).';
  check('Typing £1,851.00 opens the line by itself: "' + HEAD + '"', (await vis(p, '#extraHead_jordan')) === HEAD, await vis(p, '#extraHead_jordan'));
  check('…its amount is £370.20 (£1,851.00 × 1 ÷ 5), set aside: "' + ASIDE + '"', (await p.inputValue('#extraAmt_jordan')) === '370.20' && (await txt(p, '#extraSay_jordan')) === ASIDE, await p.inputValue('#extraAmt_jordan'));
  check('…the transfers use £1,480.80: £686.00 top-up, £60.00 savings, £734.80 on to Spending', same(await amtsOf(p), ['£734.80', '£686.00', '£60.00']), (await amtsOf(p)).join(' '));
  check('…buttons "Count it this month" and "Not an extra payday", no Remove; the hint is empty (the line has the dates)', await shown(p, '#extraCount_jordan') && await shown(p, '#extraNot_jordan') &&
    (await p.$('#extraRemove_jordan')) === null && (await vis(p, '#payHint_jordan')) === '');
  check('…names: "Count Jordan\'s extra payday this month", "Not an extra payday, Jordan"; the head and the state are read out (aria-live)', (await name(p, '#extraCount_jordan')) === "Count Jordan's extra payday this month" &&
    (await name(p, '#extraNot_jordan')) === 'Not an extra payday, Jordan' && (await p.getAttribute('#extraHead_jordan', 'aria-live')) === 'polite' && (await p.getAttribute('#extraSay_jordan', 'aria-live')) === 'polite');
  check('…with a transfer ticked, the warning shows', (await txt(p, '#extraWarn_jordan')) === WARN);
  m = await mon(p, '2026-12');
  check('…saved: pay £1,851.00, 5 paydays, £370.20 set aside (no edited), the estimate mark gone', m.pay.jordan === 1851 && same(m.paydays, { jordan: 5 }) && same(m.extra, { jordan: { amount: 370.2 } }) && m.payEstimated === undefined, JSON.stringify(m));
  // The default follows typed pay until the amount is typed in.
  await p.fill('#pay_jordan', '1900'); await wait(p, 900);
  check('Pay £1,900.00: the amount follows, £380.00, saved too', (await p.inputValue('#extraAmt_jordan')) === '380.00' && (await mon(p, '2026-12')).extra.jordan.amount === 380, await p.inputValue('#extraAmt_jordan'));
  // Correcting the amount by keyboard (the release review's M1): clearing it on the way to a new figure keeps the field.
  await p.click('#extraAmt_jordan'); await p.keyboard.press('Control+A'); await p.keyboard.press('Backspace'); await wait(p, 900);
  check('Ctrl+A, Backspace in the amount: the field stays, with focus (an empty field isn\'t "Not an extra payday")', (await focusId(p)) === 'extraAmt_jordan' && (await p.$('#extraWas_jordan')) === null &&
    (await p.inputValue('#extraAmt_jordan')) === '', await focusId(p));
  await p.keyboard.type('350'); await wait(p, 900);
  check('…typing 350: focus stays, £350.00 stored as the household\'s own (edited)', (await focusId(p)) === 'extraAmt_jordan' && same((await mon(p, '2026-12')).extra, { jordan: { amount: 350, edited: true } }), JSON.stringify((await mon(p, '2026-12')).extra));
  await p.keyboard.press('Control+A'); await p.keyboard.type('400'); await wait(p, 900);
  check('Typing £400.00 in the line stores it as the household\'s own (edited)', same((await mon(p, '2026-12')).extra, { jordan: { amount: 400, edited: true } }), JSON.stringify((await mon(p, '2026-12')).extra));
  await p.fill('#pay_jordan', '1950'); await wait(p, 900);
  check('…then pay £1,950.00: the amount stays £400.00 (it no longer follows)', (await p.inputValue('#extraAmt_jordan')) === '400.00' && (await mon(p, '2026-12')).extra.jordan.amount === 400 &&
    same(await amtsOf(p), ['£804.00', '£686.00', '£60.00']), (await amtsOf(p)).join(' '));
  // Count it, then Set it aside: with a tick, two taps (E10).
  await p.click('#extraCount_jordan'); await wait(p);
  check('Count it this month: counted, "Jordan\'s extra payday (£400.00) is counted in these transfers.", focus on "Set it aside"', (await txt(p, '#extraSay_jordan')) === "Jordan's extra payday (£400.00) is counted in these transfers." &&
    (await mon(p, '2026-12')).extra.jordan.counted === true && (await focusId(p)) === 'extraAside_jordan' && same(await amtsOf(p), ['£1,204.00', '£686.00', '£60.00']), (await amtsOf(p)).join(' '));
  await p.keyboard.press('Enter'); await wait(p);
  check('Set it aside (keyboard), with a tick: the first tap warns and asks again ("Set it aside anyway")', (await txt(p, '#extraAside_jordan')) === 'Set it aside anyway' && (await txt(p, '#extraWarn_jordan')) === WARN &&
    (await mon(p, '2026-12')).extra.jordan.counted === true && (await focusId(p)) === 'extraAside_jordan');
  await p.keyboard.press('Enter'); await wait(p);
  check('…the second sets it aside', (await mon(p, '2026-12')).extra.jordan.counted === undefined && (await txt(p, '#extraSay_jordan')) === ASIDE && (await focusId(p)) === 'extraCount_jordan');
  // Not an extra payday, then It was an extra payday (two taps with a tick).
  await p.click('#extraNot_jordan'); await wait(p);
  check('Not an extra payday: stores £0.00 as edited; "All 5 of Jordan\'s paydays are in these transfers." and "It was an extra payday"', same((await mon(p, '2026-12')).extra, { jordan: { amount: 0, edited: true } }) &&
    (await txt(p, '#extraSay_jordan')) === "All 5 of Jordan's paydays are in these transfers." && (await txt(p, '#extraWas_jordan')) === 'It was an extra payday' && (await p.$('#extraAmt_jordan')) === null && (await focusId(p)) === 'extraWas_jordan');
  check('…the whole £1,950.00 is used', same(await amtsOf(p), ['£1,204.00', '£686.00', '£60.00']), (await amtsOf(p)).join(' '));
  await p.fill('#pay_jordan', '1960'); await wait(p, 900);
  check('…and stays not an extra payday when pay is saved again (£0.00, edited)', same((await mon(p, '2026-12')).extra, { jordan: { amount: 0, edited: true } }));
  await p.click('#extraWas_jordan'); await wait(p);
  check('It was an extra payday, with a tick: the first tap warns ("Set it aside anyway")', (await txt(p, '#extraWas_jordan')) === 'Set it aside anyway' && (await txt(p, '#extraWarn_jordan')) === WARN && (await mon(p, '2026-12')).extra.jordan.edited === true);
  await p.click('#extraWas_jordan'); await wait(p);
  check('…the second puts the default back (£392.00, £1,960.00 ÷ 5) and it follows pay again', same((await mon(p, '2026-12')).extra, { jordan: { amount: 392 } }) && (await p.inputValue('#extraAmt_jordan')) === '392.00' &&
    (await focusId(p)) === 'extraCount_jordan', JSON.stringify((await mon(p, '2026-12')).extra));
  await p.click('#extraAmt_jordan'); await p.keyboard.press('Control+A'); await p.keyboard.type('0'); await wait(p, 900);
  check('Typing 0 keeps the field while it has focus', (await focusId(p)) === 'extraAmt_jordan' && (await p.$('#extraWas_jordan')) === null);
  await p.keyboard.press('Tab'); await wait(p, 600);
  check('…left at £0 (Tab), the line becomes "All 5 of Jordan\'s paydays are in these transfers."', (await txt(p, '#extraSay_jordan')) === "All 5 of Jordan's paydays are in these transfers." &&
    await shown(p, '#extraWas_jordan') && same((await mon(p, '2026-12')).extra, { jordan: { amount: 0, edited: true } }), await txt(p, '#extraSay_jordan'));
  check('…and keyboard focus is on "It was an extra payday"', (await focusId(p)) === 'extraWas_jordan', await focusId(p));
  await noAxe(p, 'the line the count opened');
  // A press on one of the line's buttons straight after typing 0 isn't lost.
  await p.click('#extraWas_jordan'); await wait(p); await p.click('#extraWas_jordan'); await wait(p);
  await p.click('#extraAmt_jordan'); await p.keyboard.press('Control+A'); await p.keyboard.type('0'); await wait(p, 100);
  await p.click('#extraCount_jordan', { delay: 80 }); await wait(p, 600);
  check('Typing 0, then pressing "Count it this month" at once: the press goes ahead (counted)', (await mon(p, '2026-12')).extra.jordan.counted === true, JSON.stringify((await mon(p, '2026-12')).extra));
  check('No JS errors (Jordan)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 2. Priya (every four weeks, transfer day the 1st): January 2027 has two paydays, 3 and 31 December ----------
// The 1st of January is New Year's Day, so January's transfer day is Thu 31 Dec, and her payday that day counts.
const PRIYA = (o = {}) => base(Object.assign({
  people: [{ id: 'priya', name: 'Priya', payAccount: 'cur', usualPay: 1690, pattern: { every: 28, each: 1560, on: '2026-12-03' } }],
  accounts: [{ id: 'cur', name: 'Current account', colour: 'blue', leftoverTo: null }],
  bills: [{ id: 'rent', name: 'Rent', amount: 900, account: 'cur', months: [] }, { id: 'ct', name: 'Council Tax', amount: 120, account: 'cur', months: [] }],
  payday: { day: 1, weekend: true } }, o));
{
  ({ ctx, p } = await session({ today: '2026-12-22', storage: { [K.cfg]: PRIYA() } }));
  check('Priya: opens on January 2027 (transfer day Thu 31 Dec, the 1st being New Year\'s Day)', (await T(p, '#monthLabel')) === 'January 2027' && (await txt(p, '#payLine')) === 'Transfer day: Thu 31 Dec 2026 (in 9 days)', await txt(p, '#payLine'));
  const H = '2 paydays since Tue 1 Dec, one more than usual: 3 and 31 Dec (1 still to come). Until then: £1,560.00; the extra one is set aside once you type what arrived.';
  check('The hint: "' + H + '"', (await vis(p, '#payHint_priya')) === H, await vis(p, '#payHint_priya'));
  check('…the plan uses one payday: £540.00 left over', (await txt(p, '#payDetailsSum')) === '£540.00 left over', await txt(p, '#payDetailsSum'));
  await p.fill('#pay_priya', '3120'); await wait(p, 900);
  check('Typing £3,120.00 opens the line by itself: "Priya has 2 paydays since Tue 1 Dec, one more than usual: 3 and 31 Dec (1 still to come)."',
    (await vis(p, '#extraHead_priya')) === 'Priya has 2 paydays since Tue 1 Dec, one more than usual: 3 and 31 Dec (1 still to come).', await vis(p, '#extraHead_priya'));
  check('…£1,560.00 set aside, so £540.00 left over, not £2,100.00 (5.6 rule 1), and saved with the count', (await p.inputValue('#extraAmt_priya')) === '1560.00' && (await txt(p, '#payDetailsSum')) === '£540.00 left over' &&
    same((await mon(p, '2027-01')).paydays, { priya: 2 }) && same((await mon(p, '2027-01')).extra, { priya: { amount: 1560 } }), JSON.stringify(await mon(p, '2027-01')));
  check('…no ticks, so no warning; and the line isn\'t counted', (await p.$('#extraWarn_priya')) === null && await shown(p, '#extraCount_priya'));
  await p.click('#next'); await wait(p);
  check('February 2027: "1 payday since Thu 31 Dec: 28 Jan (1 still to come). Until then: £1,560.00."', (await vis(p, '#payHint_priya')) === '1 payday since Thu 31 Dec: 28 Jan (1 still to come). Until then: £1,560.00.', await vis(p, '#payHint_priya'));
  await p.fill('#pay_priya', '1560'); await wait(p, 900);
  check('…typed: "1 payday since Thu 31 Dec: 28 Jan (1 still to come).", no line opens, "Had an extra payday?" is there (rule 4)', (await vis(p, '#payHint_priya')) === '1 payday since Thu 31 Dec: 28 Jan (1 still to come).' &&
    (await p.$('#extra_priya')) === null && await shown(p, '#extraAdd_priya') && same((await mon(p, '2027-02')).paydays, { priya: 1 }), await vis(p, '#payHint_priya'));
  // Rule 4: a count that's too low is corrected with the link, exactly as in 2.16 (with Remove).
  await p.click('#extraAdd_priya'); await wait(p);
  check('…the link opens 2.16\'s line: £1,560.00, set aside, with "Remove" (no "Not an extra payday"), focus on the amount', (await p.inputValue('#extraAmt_priya')) === '1560.00' && await shown(p, '#extraRemove_priya') &&
    (await p.$('#extraNot_priya')) === null && (await p.$('#extraHead_priya')) === null && (await focusId(p)) === 'extraAmt_priya');
  await p.fill('#extraAmt_priya', '1500'); await wait(p, 900);
  check('…typing an amount there stores only the amount, as 2.16 does (no edited: the ruling on L3)', same((await mon(p, '2027-02')).extra, { priya: { amount: 1500 } }), JSON.stringify((await mon(p, '2027-02')).extra));
  await p.click('#extraRemove_priya'); await wait(p);
  check('…Remove takes it away again', (await p.$('#extra_priya')) === null && (await mon(p, '2027-02')).extra === undefined);
  check('No JS errors (Priya)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
  // E12 / L8: a damaged file with no transfer day counts against the 25th, unmoved, but shows no dates.
  ({ ctx, p } = await session({ today: '2026-12-22', storage: { [K.cfg]: PRIYA({ payday: {} }) } }));
  check('No transfer day: "Set your transfer day", and the hint counts without dates: "1 payday since your last transfer day. Until then: £1,560.00."', (await txt(p, '#payLine')) === 'Set your transfer day' &&
    (await vis(p, '#payHint_priya')) === '1 payday since your last transfer day. Until then: £1,560.00.', (await txt(p, '#payLine')) + ' / ' + await vis(p, '#payHint_priya'));
  check('No JS errors (no transfer day)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// No paydays at all: every four weeks on Mondays from Mon 9 Nov 2026, transfer day the 25th. Easter Monday's pay (29 March)
// is paid on Thu 25 March, so May 2027 (26 March to 23 April) has none.
{
  ({ ctx, p } = await session({ today: '2027-04-20', storage: { [K.cfg]: PRIYA({ people: [{ id: 'priya', name: 'Priya', payAccount: 'cur', usualPay: 1690, pattern: { every: 28, each: 1560, on: '2026-11-09' } }], payday: { day: 25, weekend: true } }) } }));
  check('May 2027, no paydays: "No paydays for Priya since Thu 25 Mar, not the usual 1."', (await T(p, '#monthLabel')) === 'May 2027' && (await vis(p, '#payHint_priya')) === 'No paydays for Priya since Thu 25 Mar, not the usual 1.', await vis(p, '#payHint_priya'));
  check('…the top banner: "Priya has no paydays this month, so these transfers use none of Priya\'s pay."', (await txt(p, '#payBanner')) === "Priya has no paydays this month, so these transfers use none of Priya's pay.", await txt(p, '#payBanner'));
  check('…nothing to offer, so no gap line', (await p.$('#gap_priya')) === null);
  await p.fill('#pay_priya', '0'); await wait(p, 900);
  check('Typed (£0.00), it still says so: "No paydays for Priya since Thu 25 Mar, not the usual 1."', (await vis(p, '#payHint_priya')) === 'No paydays for Priya since Thu 25 Mar, not the usual 1.' && same((await mon(p, '2027-05')).paydays, { priya: 0 }), await vis(p, '#payHint_priya'));
  check('No JS errors (no paydays)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 3. Marc's change of job (L7): monthly to weekly, first pay Fri 15 Jan 2027; February has 3 of 4 paydays ----------
const MARC = (o = {}) => base(Object.assign({
  people: [{ id: 'marc', name: 'Marc', payAccount: 'main', usualPay: 2300 }],
  accounts: [{ id: 'main', name: 'Main account', colour: 'blue', leftoverTo: null }],
  bills: [{ id: 'rent', name: 'Rent', amount: 900, account: 'main', months: [] }], payday: { day: 31, weekend: true } }, o));
const MARC_MONTHS = () => ({ '2026-12': { month: '2026-12', pay: { marc: 2300 }, done: {}, oneOffs: [] } });
const WAIT = "Marc's first weekly pay is for February 2027. Make this change from Tuesday 19 January, when Dovetail moves on to February 2027.";
{
  ({ ctx, p } = await session({ today: '2026-12-23', storage: { [K.cfg]: MARC(), [K.mon]: MARC_MONTHS() } }));
  check('Marc: opens on January 2027', (await T(p, '#monthLabel')) === 'January 2027');
  await openSet(p, 'sPeople');
  check('Settings › People, paid every month: no "A recent payday" field', (await p.$('#pp_on_marc')) === null);
  await p.selectOption('#pp_f_marc', '7'); await wait(p, 250);
  check('Every week, with history: the sheet asks "When\'s the first pay on the new pattern?" (optional)', (await txt(p, 'label[for=ppc_on]')) === "When's the first pay on the new pattern?" && (await p.getAttribute('#ppc_on', 'type')) === 'date');
  check('…described by "As it usually falls, not one moved for a bank holiday."', (await txt(p, '#' + (await p.getAttribute('#ppc_on', 'aria-describedby')))) === 'As it usually falls, not one moved for a bank holiday.');
  await p.fill('#ppc_pay', '420'); await p.fill('#ppc_on', '2027-01-15'); await wait(p);
  check('A first pay for February 2027 (L7): "' + WAIT + '"', (await txt(p, '#ppc_wait')) === WAIT, await txt(p, '#ppc_wait'));
  check('…Change is unavailable until then, and says why (its description)', await p.isDisabled('#ppc_go') && (await p.getAttribute('#ppc_go', 'aria-describedby')) === 'ppc_wait');
  await noAxe(p, 'the change sheet waiting');
  await p.fill('#ppc_on', ''); await wait(p);
  check('…without the date, Change is available again and the line goes', !(await p.isDisabled('#ppc_go')) && !(await shown(p, '#ppc_wait')));
  await p.click('#ppc_cancel'); await wait(p, 250);
  check('Cancel leaves Marc paid every month', (await LS(p, K.cfg)).people[0].pattern === undefined);
  await ctx.close();

  // Tuesday 19 January: Dovetail is on February 2027, so the change can be made.
  ({ ctx, p } = await session({ today: '2027-01-20', storage: { [K.cfg]: MARC(), [K.mon]: MARC_MONTHS() } }));
  check('20 January: opens on February 2027', (await T(p, '#monthLabel')) === 'February 2027');
  await openSet(p, 'sPeople'); await p.selectOption('#pp_f_marc', '7'); await wait(p, 250);
  await p.fill('#ppc_pay', '420'); await p.fill('#ppc_on', '2027-01-15'); await wait(p);
  check('…the first pay is for February, the month on now: no wait line, Change available', !(await shown(p, '#ppc_wait')) && !(await p.isDisabled('#ppc_go')));
  await p.focus('#ppc_on'); await p.keyboard.press('Backspace'); await p.click('#ppc_go'); await wait(p, 200);
  check('…with a part of the date cleared, Change says "Finish the date, or clear it all." and changes nothing', (await txt(p, '#ppc_msg')) === 'Finish the date, or clear it all.' && (await LS(p, K.cfg)).people[0].pattern === undefined, await txt(p, '#ppc_msg'));
  await p.fill('#ppc_on', '2027-01-15'); await wait(p);
  await p.click('#ppc_go'); await wait(p, 300);
  c = await LS(p, K.cfg);
  check('Change: weekly £420.00 with a recent payday and a first pay of 15 January (as typed), earlier months monthly', same(c.people[0].pattern, { every: 7, each: 420, on: '2027-01-15', since: '2027-01-15' }) &&
    same(c.people[0].was, [{ until: '2027-01', usualPay: 2300 }]), JSON.stringify(c.people[0]));
  check('Settings › People: the date field holds 15 January; "Next payday: Fri 22 Jan, then every week."', (await p.inputValue('#pp_on_marc')) === '2027-01-15' && (await vis(p, '#pp_next_marc')) === 'Next payday: Fri 22 Jan, then every week.' &&
    (await heard(p, '#pp_next_marc')) === 'Next payday: Friday 22 January, then every week.', await vis(p, '#pp_next_marc'));
  check('…the field is labelled "A recent payday (optional)" and described by its hint', (await txt(p, 'label[for=pp_on_marc]')) === 'A recent payday (optional)' &&
    (await txt(p, '#' + (await p.getAttribute('#pp_on_marc', 'aria-describedby')).split(' ')[0])) === 'Any payday in the last few weeks, or the next one, as it usually falls (not one moved for a bank holiday). With it, Dovetail counts your paydays and spots an extra one.');
  await toPay(p);
  const GAP = 'Marc has 3 paydays since Thu 31 Dec, not the usual 4: 15, 22 and 29 Jan (2 still to come). These transfers use the 3.';
  check('February: the gap line "' + GAP + '"', (await vis(p, '#gap_marc')) === GAP, await vis(p, '#gap_marc'));
  check('…in the --due style (.banner), with full dates for a screen reader', (await p.getAttribute('#gap_marc', 'class')).split(' ').includes('banner') &&
    (await heard(p, '#gap_marc')) === 'Marc has 3 paydays since Thursday 31 December, not the usual 4: 15, 22 and 29 January (2 still to come). These transfers use the 3.', await heard(p, '#gap_marc'));
  check('…the hint: "Until then: 3 × £420.00."; the banner: "These transfers use Marc\'s usual pay for 3 paydays."; £360.00 left over', (await vis(p, '#payHint_marc')) === 'Until then: 3 × £420.00.' &&
    (await txt(p, '#payBanner')) === "These transfers use Marc's usual pay for 3 paydays." && (await txt(p, '#payDetailsSum')) === '£360.00 left over', await txt(p, '#payBanner'));
  check('…no "Use it this month" (a new job has no earlier extra payday)', (await p.$('#useExtra_marc')) === null);
  await goMonth(p, 'January 2027');
  check('January 2027 is before the change: monthly £2,300.00, no dates', (await p.getAttribute('#pay_marc', 'placeholder')) === '2300.00' && (await p.$('#gap_marc')) === null);
  await goMonth(p, 'February 2027');
  // Editing one part of the date (the release review's S1): while a part is typed again the field reads as empty, which
  // mustn't remove the date or the first pay.
  await openSet(p, 'sPeople'); await p.focus('#pp_on_marc'); await p.keyboard.press('Backspace'); await wait(p, 300);
  c = await LS(p, K.cfg);
  check('A part of the date cleared while editing: the date and the first pay are still stored', (await p.inputValue('#pp_on_marc')) === '' && same(c.people[0].pattern, { every: 7, each: 420, on: '2027-01-15', since: '2027-01-15' }), JSON.stringify(c.people[0].pattern));
  await p.keyboard.type('01'); await wait(p, 300); await p.$eval('#pp_on_marc', e => e.blur()); await wait(p, 300);
  c = await LS(p, K.cfg);
  check('…typed back: the same date, and the first pay kept', (await p.inputValue('#pp_on_marc')) === '2027-01-15' && same(c.people[0].pattern, { every: 7, each: 420, on: '2027-01-15', since: '2027-01-15' }), JSON.stringify(c.people[0].pattern));
  await p.focus('#pp_on_marc'); await p.keyboard.press('Backspace'); await wait(p, 200); await p.click('#t-pay'); await wait(p, 300);
  c = await LS(p, K.cfg);
  check('A part cleared, then another tab: the date and the first pay are kept, and the field says "Finish the date, or clear it all."', same(c.people[0].pattern, { every: 7, each: 420, on: '2027-01-15', since: '2027-01-15' }) &&
    (await p.$eval('#pp_on_marc_msg', e => e.textContent)) === 'Finish the date, or clear it all.' && (await p.getAttribute('#pp_on_marc', 'aria-invalid')) === 'true', JSON.stringify(c.people[0].pattern));
  await openSet(p, 'sPeople'); await p.fill('#pp_on_marc', '2027-01-15'); await p.$eval('#pp_on_marc', e => e.blur()); await wait(p, 300);
  await p.fill('#pp_on_marc', '1999-01-15'); await p.$eval('#pp_on_marc', e => e.blur()); await wait(p, 300);
  c = await LS(p, K.cfg);
  check('A date before 2000 isn\'t stored: "Choose a date from 2000 to 2099, or leave it empty." under the field', (await txt(p, '#pp_on_marc_msg')) === 'Choose a date from 2000 to 2099, or leave it empty.' &&
    (await p.getAttribute('#pp_on_marc', 'aria-invalid')) === 'true' && same(c.people[0].pattern, { every: 7, each: 420, on: '2027-01-15', since: '2027-01-15' }), JSON.stringify(c.people[0].pattern));
  await p.fill('#pp_on_marc', '2027-01-15'); await p.$eval('#pp_on_marc', e => e.blur()); await wait(p, 300);
  check('…a good date clears the message', (await txt(p, '#pp_on_marc_msg')) === '' && (await p.getAttribute('#pp_on_marc', 'aria-invalid')) === null);
  // Clearing the date removes the first pay too, and February is back to layer 1.
  await openSet(p, 'sPeople'); await p.fill('#pp_on_marc', ''); await wait(p, 300);
  c = await LS(p, K.cfg);
  check('Clearing the whole date removes on and since at once, before the field is left (not dated), and "Next payday" goes', (await focusId(p)) === 'pp_on_marc' && same(c.people[0].pattern, { every: 7, each: 420 }) && same(c.people[0].was, [{ until: '2027-01', usualPay: 2300 }]) && !(await shown(p, '#pp_next_marc')), JSON.stringify(c.people[0]));
  await toPay(p);
  check('…February is layer 1 again: "(usually 4 paydays)", no gap line', (await txt(p, '#payHint_marc')) === "Type everything that's arrived since your last transfer day (usually 4 paydays). Until then: 4 × £420.00." && (await p.$('#gap_marc')) === null, await txt(p, '#payHint_marc'));
  check('No JS errors (Marc)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 4. Lewis and Amira (every two weeks, alternate Fridays, half each into Joint), New Year 2027 ----------
// Transfer day the last working day: January's is Thu 31 Dec, and Lewis's payday on New Year's Day is paid that day.
const LA = (o = {}) => base(Object.assign({
  people: [{ id: 'lewis', name: 'Lewis', payAccount: 'la', usualPay: 2210, pattern: { every: 14, each: 1020, on: '2026-10-09' } },
    { id: 'amira', name: 'Amira', payAccount: 'aa', usualPay: 1906.67, pattern: { every: 14, each: 880, on: '2026-10-02' } }],
  accounts: [{ id: 'la', name: 'Lewis own', colour: 'blue', leftoverTo: null }, { id: 'aa', name: 'Amira own', colour: 'teal', leftoverTo: null },
    { id: 'jt', name: 'Joint account', colour: 'purple', leftoverTo: null, funding: { people: ['lewis', 'amira'], rule: 'equal' } }],
  bills: [{ id: 'mort', name: 'Mortgage', amount: 2070, account: 'jt', months: [] }], payday: { day: 'last' } }, o));
{
  ({ ctx, p } = await session({ today: '2026-12-22', storage: { [K.cfg]: LA() } }));
  check('Lewis and Amira: opens on January 2027', (await T(p, '#monthLabel')) === 'January 2027');
  check('Lewis: "3 paydays since Mon 30 Nov, one more than usual: 4, 18 and 31 Dec (1 still to come). Until then: 2 × £1,020.00; …"', (await vis(p, '#payHint_lewis')) ===
    '3 paydays since Mon 30 Nov, one more than usual: 4, 18 and 31 Dec (1 still to come). Until then: 2 × £1,020.00; the extra one is set aside once you type what arrived.', await vis(p, '#payHint_lewis'));
  check('Amira: "2 paydays since Mon 30 Nov: 11 and 24 Dec (1 still to come). Until then: 2 × £880.00." (Christmas Day\'s pay on Thu 24)', (await vis(p, '#payHint_amira')) ===
    '2 paydays since Mon 30 Nov: 11 and 24 Dec (1 still to come). Until then: 2 × £880.00.', await vis(p, '#payHint_amira'));
  await p.fill('#pay_lewis', '3060'); await p.fill('#pay_amira', '1760'); await wait(p, 900);
  check('Typed: Lewis\'s line opens with £1,020.00 set aside; Amira\'s doesn\'t', (await p.inputValue('#extraAmt_lewis')) === '1020.00' && (await p.$('#extra_amira')) === null && await shown(p, '#extraAdd_amira'));
  check('…shares £1,035.00 each; Lewis keeps £1,005.00, Amira £725.00 (rule 4\'s right answer)', same(await amtsOf(p), ['£1,035.00', '£1,035.00']) && (await txt(p, '#heroKeeps')) === 'Lewis keeps £1,005.00, Amira keeps £725.00', (await amtsOf(p)).join(' ') + ' / ' + await txt(p, '#heroKeeps'));
  check('…Amira\'s typed hint: "2 paydays since Mon 30 Nov: 11 and 24 Dec (1 still to come)."', (await vis(p, '#payHint_amira')) === '2 paydays since Mon 30 Nov: 11 and 24 Dec (1 still to come).', await vis(p, '#payHint_amira'));
  await p.click('#next'); await wait(p);
  check('February 2027: two each, no made-up extra: Lewis 15 and 29 Jan, Amira 8 and 22 Jan', (await vis(p, '#payHint_lewis')) === '2 paydays since Thu 31 Dec: 15 and 29 Jan (2 still to come). Until then: 2 × £1,020.00.' &&
    (await vis(p, '#payHint_amira')) === '2 paydays since Thu 31 Dec: 8 and 22 Jan (2 still to come). Until then: 2 × £880.00.', await vis(p, '#payHint_lewis') + ' / ' + await vis(p, '#payHint_amira'));
  check('No JS errors (Lewis and Amira)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 5. Easter 2027 (L6): Sam, weekly on Mondays, transfer day the 25th. April has 5 paydays, May 3 ----------
// Easter Monday (29 March) is paid on Thu 25 March, the transfer day, so it counts in April.
const SAM = (o = {}) => base(Object.assign({
  people: [{ id: 'sam', name: 'Sam', payAccount: 'cur', usualPay: 1820, pattern: { every: 7, each: 420, on: '2027-03-01' } }],
  accounts: [{ id: 'cur', name: 'Current account', colour: 'blue', leftoverTo: null }],
  bills: [{ id: 'rent', name: 'Rent', amount: 1100, account: 'cur', months: [] }], budgets: [{ id: 'food', name: 'Food', amount: 400, account: 'cur' }],
  payday: { day: 25, weekend: true } }, o));
const USE = "Last month's extra payday (£420.00) was set aside. If it's still in Sam's account, use it this month.";
{
  ({ ctx, p } = await session({ today: '2027-03-20', storage: { [K.cfg]: SAM() } }));
  check('Sam: opens on April 2027; "5 paydays since Thu 25 Feb, one more than usual: 1, 8, 15, 22 and 25 Mar (2 still to come)…"', (await T(p, '#monthLabel')) === 'April 2027' &&
    (await vis(p, '#payHint_sam')).startsWith('5 paydays since Thu 25 Feb, one more than usual: 1, 8, 15, 22 and 25 Mar (2 still to come).'), await vis(p, '#payHint_sam'));
  await p.fill('#pay_sam', '2100'); await wait(p, 900);
  check('April typed £2,100.00: £420.00 set aside, £180.00 left over', (await p.inputValue('#extraAmt_sam')) === '420.00' && (await txt(p, '#payDetailsSum')) === '£180.00 left over');
  await p.click('#next'); await wait(p);
  const GAP = 'Sam has 3 paydays since Thu 25 Mar, not the usual 4: 5, 12 and 19 Apr (3 still to come). These transfers use the 3. ' + USE;
  check('May 2027: the gap line with the offer: "' + GAP + '"', (await vis(p, '#gap_sam div')) === GAP, await vis(p, '#gap_sam div'));
  check('…£240.00 short', (await txt(p, '#payDetailsSum')) === '£240.00 short' && (await txt(p, '#heroH')) === 'Short this month');
  check('…"Use it this month", named "Use Sam\'s extra payday from April this month"', (await txt(p, '#useExtra_sam')) === 'Use it this month' && (await name(p, '#useExtra_sam')) === "Use Sam's extra payday from April this month");
  await noAxe(p, 'the gap line with Use it this month');
  await p.focus('#useExtra_sam'); await p.keyboard.press('Enter'); await wait(p, 300);
  m = await mon(p, '2027-05');
  check('Use it this month (keyboard): a one-off "Sam\'s extra payday from April", £420.00 into Current account, marked extraFrom April and extraOf Sam', m.oneOffs.length === 1 &&
    same([m.oneOffs[0].kind, m.oneOffs[0].name, m.oneOffs[0].amount, m.oneOffs[0].account, m.oneOffs[0].extraFrom, m.oneOffs[0].extraOf], ['in', "Sam's extra payday from April", 420, 'cur', '2027-04', 'sam']) &&
    m.paydays === undefined && (m.pay === undefined || same(m.pay, { sam: null })), JSON.stringify(m));
  check('…May now has £180.00 left over', (await txt(p, '#payDetailsSum')) === '£180.00 left over', await txt(p, '#payDetailsSum'));
  check('…the gap line says "Sam\'s extra payday from April (£420.00) is in these transfers as a one-off." and has focus', (await vis(p, '#gap_sam div')) ===
    "Sam has 3 paydays since Thu 25 Mar, not the usual 4: 5, 12 and 19 Apr (3 still to come). These transfers use the 3. Sam's extra payday from April (£420.00) is in these transfers as a one-off." &&
    (await p.$('#useExtra_sam')) === null && (await focusId(p)) === 'gap_sam', await vis(p, '#gap_sam div'));
  check('…"Also coming in" lists it', (await txt(p, '#payExtra')).includes("Sam's extra payday from April"));
  await p.click('#prev'); await wait(p);
  check('April is locked: "Used in May 2027.", the amount read-only, no buttons', (await txt(p, '#extraSay_sam')) === 'Used in May 2027.' && await p.$eval('#extraAmt_sam', e => e.readOnly) &&
    (await p.$('#extraCount_sam')) === null && (await p.$('#extraNot_sam')) === null && (await p.$('#extra_sam .btnrow')) === null);
  await noAxe(p, 'the locked line');
  await p.click('#next'); await wait(p);
  // Removing the one-off unlocks April; nothing else changes by itself.
  await openDetails(p); await p.locator('#oneOffs .bill > button', { hasText: "Sam's extra payday from April" }).click(); await wait(p, 80);
  await p.click('#oneOffs .ed .btn.danger'); await p.click('#oneOffs .ed .btn.danger'); await wait(p, 300);
  check('Deleting the one-off: May is £240.00 short again with the offer back', (await txt(p, '#payDetailsSum')) === '£240.00 short' && await shown(p, '#useExtra_sam'));
  await p.click('#prev'); await wait(p);
  check('…and April is unlocked: its buttons are back, £420.00 still set aside', await shown(p, '#extraCount_sam') && await shown(p, '#extraNot_sam') && (await p.inputValue('#extraAmt_sam')) === '420.00' &&
    !(await p.$eval('#extraAmt_sam', e => e.readOnly)) && same((await mon(p, '2027-04')).extra, { sam: { amount: 420 } }));
  check('No JS errors (Sam)', p.errs.length === 0, p.errs.join(' | '));
  // L14: a one-off that uses an earlier month's extra payday needs 2.17, even once the date is removed.
  await p.click('#next'); await wait(p); await p.click('#useExtra_sam'); await wait(p, 300);
  await openSet(p, 'sPeople'); await p.fill('#pp_on_sam', ''); await p.$eval('#pp_on_sam', e => e.blur()); await wait(p, 300);
  await openSet(p, 'sBackup'); await p.click('#setBackup .btn.ghost:has-text("Show backup")'); await wait(p, 80);
  const b = JSON.parse(await p.inputValue('#backupOut'));
  check('Backup with no date left but May\'s one-off from April\'s extra payday: version 6, needs 2.17 (L14)', b.version === 6 && b.needs === '2.17' && b.config.people[0].pattern.on === undefined, JSON.stringify([b.version, b.needs]));
  await ctx.close();
}

// ---------- 6. Settings edits never move a typed month (L1), a date added later leaves it layer 1 (L19), and L5 ----------
const DEC = o => ({ '2026-12': Object.assign({ month: '2026-12', pay: { jordan: 1851 }, done: {}, oneOffs: [], paydays: { jordan: 5 }, extra: { jordan: { amount: 370.2 } } }, o) });
{
  ({ ctx, p } = await session({ today: '2026-11-20', storage: { [K.cfg]: JORDAN(), [K.mon]: DEC() } }));
  const saved = JSON.stringify(await mon(p, '2026-12')), amts0 = await amtsOf(p);
  const HEAD = 'Jordan has 5 paydays since Wed 28 Oct, one more than usual: 30 Oct, 6, 13, 20 and 27 Nov (1 still to come).';
  const FROZEN = 'Jordan has 5 paydays (counted when this month was first saved), one more than usual.';
  check('December 2026, typed and frozen by a 2.17 page: £1,480.80 used, the line with its dates', same(amts0, ['£734.80', '£686.00', '£60.00']) && (await vis(p, '#extraHead_jordan')) === HEAD, (await vis(p, '#extraHead_jordan')) + ' ' + amts0.join(' '));
  const unchanged = async what => {
    await toPay(p);
    check(what + ': December\'s figures and stored month are unchanged', same(await amtsOf(p), amts0) && JSON.stringify(await mon(p, '2026-12')) === saved, (await amtsOf(p)).join(' '));
  };
  await openSet(p, 'sPeople'); await p.fill('#pp_on_jordan', '2026-10-05'); await wait(p, 300);
  check('A date corrected to a Monday is written straight to the pattern (not dated): "Next payday: Mon 23 Nov, then every week."', same((await LS(p, K.cfg)).people[0].pattern, { every: 7, each: 420, on: '2026-10-05' }) &&
    (await LS(p, K.cfg)).people[0].was === undefined && (await vis(p, '#pp_next_jordan')) === 'Next payday: Mon 23 Nov, then every week.', await vis(p, '#pp_next_jordan'));
  await unchanged('A date corrected by part of an interval');
  check('…today\'s count (4) no longer matches the frozen 5: "' + FROZEN + '"', (await vis(p, '#extraHead_jordan')) === FROZEN, await vis(p, '#extraHead_jordan'));
  await openSet(p, 'sPeople'); await p.fill('#pp_on_jordan', '2026-10-09'); await wait(p, 300);
  await unchanged('A date moved by a whole week');
  check('…the dates are back while the count matches', (await vis(p, '#extraHead_jordan')) === HEAD);
  await openSet(p, 'sPeople'); await p.fill('#pp_on_jordan', ''); await p.$eval('#pp_on_jordan', e => e.blur()); await wait(p, 300);
  await unchanged('The date removed');
  check('…the line keeps its count without dates', (await vis(p, '#extraHead_jordan')) === FROZEN, await vis(p, '#extraHead_jordan'));
  await p.goto(p.url()); await wait(p, 300);
  check('…and the same after a reload', same(await amtsOf(p), amts0) && JSON.stringify(await mon(p, '2026-12')) === saved);
  // L5: a change of how often he's paid clears December's count and its untouched extra payday (no date now: not counted again).
  await openSet(p, 'sPeople'); await p.selectOption('#pp_f_jordan', '14'); await wait(p, 300);
  m = await mon(p, '2026-12');
  check('A change to every two weeks (L5): December\'s count and its untouched extra payday are cleared', m.paydays === undefined && m.extra === undefined && m.pay.jordan === 1851, JSON.stringify(m));
  check('No JS errors (L1, L5)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();

  // L19: December typed while Jordan had no date stays layer 1 when a date is added.
  ({ ctx, p } = await session({ today: '2026-11-20', storage: { [K.cfg]: JORDAN({ people: [{ id: 'jordan', name: 'Jordan', payAccount: 'cur', usualPay: 1820, pattern: { every: 7, each: 420 } }] }),
    [K.mon]: { '2026-12': { month: '2026-12', pay: { jordan: 1851 }, done: {}, oneOffs: [] } } } }));
  const l1 = await amtsOf(p);
  await openSet(p, 'sPeople'); await p.fill('#pp_on_jordan', '2026-10-02'); await wait(p, 300); await toPay(p);
  check('A date added after December was typed (L19): its figures are as before, "Had an extra payday?", no line, no count', same(await amtsOf(p), l1) && same(l1, ['£1,105.00', '£686.00', '£60.00']) &&
    await shown(p, '#extraAdd_jordan') && (await p.$('#extra_jordan')) === null && (await vis(p, '#payHint_jordan')) === '', l1.join(' '));
  await p.fill('#pay_jordan', '1852'); await wait(p, 900);
  check('…retyping its pay still doesn\'t count it', (await mon(p, '2026-12')).paydays === undefined && (await p.$('#extra_jordan')) === null);
  await p.click('#next'); await wait(p);
  check('…January 2027, not typed yet, is counted: "4 paydays since Fri 27 Nov: 4, 11, 18 and 24 Dec (4 still to come)…"', (await vis(p, '#payHint_jordan')).startsWith('4 paydays since Fri 27 Nov: 4, 11, 18 and 24 Dec (4 still to come). Until then: 4 × £420.00.'), await vis(p, '#payHint_jordan'));
  // L22: a line the household opened from "Had an extra payday?" survives a change of interval (the month has no count).
  await p.click('#prev'); await wait(p); await p.click('#extraAdd_jordan'); await wait(p, 900);
  const before22 = JSON.stringify(await mon(p, '2026-12'));
  await openSet(p, 'sPeople'); await p.selectOption('#pp_f_jordan', '14'); await wait(p, 300);
  check('A change to every two weeks leaves December (typed without a count, with a line opened from the link) as it was (L22)', JSON.stringify(await mon(p, '2026-12')) === before22 &&
    same((await mon(p, '2026-12')).extra, { jordan: { amount: 420 } }), JSON.stringify(await mon(p, '2026-12')));
  check('No JS errors (L19)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 7. Backups: a recent payday makes the file version 6, needing 2.17, and so does the backup kept on update ----------
{
  ({ ctx, p } = await session({ today: '2026-11-20', native: true, storage: { [K.cfg]: JORDAN({ lastVersion: '2.16' }), [K.mon]: DEC() } }));
  const st = JSON.parse(await p.evaluate(() => localStorage.getItem('qa.native')) || '{}'), kept = (st.backups || []).find(x => x.kept);
  const kj = kept ? JSON.parse(kept.json) : {};
  check('First open after an update: the backup kept as it was stored is version 6, needing 2.17 (keepRaw passes the months)', kj.version === 6 && kj.needs === '2.17' && kj.config.people[0].pattern.on === '2026-10-02', JSON.stringify([kj.version, kj.needs]));
  await openSet(p, 'sBackup'); await p.click('#setBackup .btn.ghost:has-text("Show backup")'); await wait(p, 80);
  const b = JSON.parse(await p.inputValue('#backupOut'));
  check('Settings › Backup: version 6, needing 2.17, with the date and December\'s count', b.version === 6 && b.needs === '2.17' && same(b.months['2026-12'].paydays, { jordan: 5 }), JSON.stringify([b.version, b.needs]));
  await ctx.close();
}

// ---------- 8. Setup: "A recent payday (optional)" in step 2 and each person's last pay in step 3 ----------
{
  ({ ctx, p } = await session({ today: '2026-10-15' }));
  await p.click('#su_start'); await wait(p, 80);
  await p.fill('#su_p_0', 'Jordan'); await p.selectOption('#su_pf_0', '7'); await wait(p); await p.fill('#su_pu_0', '420');
  check('Step 2, someone paid weekly: "A recent payday (optional)", a date, described by its hint', (await txt(p, 'label[for=su_pon_0]')) === 'A recent payday (optional)' && (await p.getAttribute('#su_pon_0', 'type')) === 'date' &&
    (await txt(p, '#su_pon_0_h')) === 'Any payday in the last few weeks, or the next one, as it usually falls (not one moved for a bank holiday). With it, Dovetail counts your paydays and spots an extra one.' &&
    (await p.getAttribute('#su_pon_0', 'aria-describedby')) === 'su_pon_0_h su_pon_0_msg');
  await p.click('#su_addp'); await wait(p); await p.fill('#su_p_1', 'Kerry'); await p.fill('#su_pu_1', '1800');
  check('…someone paid every month has no date field', (await p.$('#su_pon_1')) === null);
  await p.selectOption('#su_pf_1', '28'); await wait(p); await p.fill('#su_pu_1', '1560');
  await p.fill('#su_pon_0', '1999-12-31'); await p.click('#su_next'); await wait(p);
  check('A date before 2000 isn\'t taken: "Choose a date from 2000 to 2099, or leave it empty."', (await txt(p, '#su_msg')) === 'Choose a date from 2000 to 2099, or leave it empty.' && (await p.$('#su_pon_0')) !== null, await txt(p, '#su_msg'));
  await noAxe(p, 'setup step 2 with the date fields');
  await p.fill('#su_pon_0', '2026-10-09'); await p.fill('#su_pon_1', '2026-10-15'); await p.click('#su_next'); await wait(p);
  await p.selectOption('#su_day', '28'); await wait(p);
  const NX = "Your next transfer day: Wednesday 28 October. It's for November 2026. Jordan's last pay before then: Friday 23 October, and Kerry's: Thursday 15 October.";
  check('Step 3: "' + NX + '"', (await txt(p, '#su_next_payday')) === NX, await txt(p, '#su_next_payday'));
  await noAxe(p, 'setup step 3 with last pays');
  await p.click('#su_back'); await wait(p);
  check('Back to step 2: the dates are still there', (await p.inputValue('#su_pon_0')) === '2026-10-09' && (await p.inputValue('#su_pon_1')) === '2026-10-15');
  await p.fill('#su_pon_1', ''); await p.click('#su_next'); await wait(p);
  check('…with one date: "…Jordan\'s last pay before then: Friday 23 October."', (await txt(p, '#su_next_payday')).endsWith("It's for November 2026. Jordan's last pay before then: Friday 23 October."), await txt(p, '#su_next_payday'));
  check('No JS errors (setup, two people)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
  // Through to the end with Jordan alone: setup keeps the date as pattern.on.
  ({ ctx, p } = await session({ today: '2026-10-15' }));
  await p.click('#su_start'); await wait(p, 80);
  await p.fill('#su_p_0', 'Jordan'); await p.selectOption('#su_pf_0', '7'); await wait(p); await p.fill('#su_pu_0', '420'); await p.fill('#su_pon_0', '2026-10-09');
  await p.focus('#su_pon_0'); await p.keyboard.press('Backspace'); await p.click('#su_next'); await wait(p, 100);
  check('Step 2 with a date part cleared: Next says "Finish the date, or clear it all." and stays', (await txt(p, '#su_msg')) === 'Finish the date, or clear it all.' && (await p.$('#su_pon_0')) !== null, await txt(p, '#su_msg'));
  await p.fill('#su_pon_0', '2026-10-09');
  await p.click('#su_next'); await wait(p, 100); await p.selectOption('#su_day', '28'); await wait(p); await p.click('#su_next'); await wait(p, 100);
  await p.check('#su_shape_split'); await wait(p); await p.click('#su_next'); await wait(p, 100);
  await p.fill('#su_b_1_0_n', 'Rent'); await p.fill('#su_b_1_0_a', '686'); await p.click('#su_next'); await wait(p, 100); await p.click('#su_skip'); await wait(p, 100);
  check('Step 7\'s preview plans on 4 paydays (November has 4): £994.00 left over', (await txt(p, '#su_left')).includes('£994.00'), await txt(p, '#su_left'));
  await p.click('#su_finish'); await wait(p, 300);
  c = await LS(p, K.cfg);
  check('Finished: Jordan is paid weekly with a recent payday of Fri 9 Oct (pattern.on)', same(c.people[0].pattern, { every: 7, each: 420, on: '2026-10-09' }), JSON.stringify(c.people[0].pattern));
  check('No JS errors (setup)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 9. Analysis: the measured average (L11) and extra paydays ahead in Month by month (L12) ----------
{
  const typed = k => ({ month: k, pay: { jordan: 1700 }, done: {}, oneOffs: [], paydays: { jordan: 4 } });
  ({ ctx, p } = await session({ today: '2026-11-20', storage: { [K.cfg]: JORDAN(), [K.mon]: { '2026-09': typed('2026-09'), '2026-10': typed('2026-10'), '2026-11': typed('2026-11') } } }));
  await p.click('#t-analysis'); await wait(p, 300);
  const an = await p.$eval('#tab-analysis', e => e.textContent);
  check('Analysis: "Jordan\'s pay (about £1,841.67 a month: an average of £425.00 a payday over 3 months)"', an.includes("Jordan's pay (about £1,841.67 a month: an average of £425.00 a payday over 3 months)"), an.slice(0, 300));
  check('Month by month: "Jordan: an extra payday, about £420.00 (set aside unless you count it)" for December', an.includes('Jordan: an extra payday, about £420.00 (set aside unless you count it)'));
  await noAxe(p, 'Analysis');
  check('No JS errors (Analysis)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 10. Light and dark, 360px, larger text: the line, the gap line, People and setup ----------
for (const dark of [false, true]) {
  const tag = dark ? 'dark' : 'light', look = { appearance: { theme: dark ? 'dark' : 'light', textSize: 'large' } };
  const fits = s => p.$eval(s, e => { const r = e.getBoundingClientRect(); return r.right <= 360 && r.left >= 0; });
  ({ ctx, p } = await session({ today: '2026-11-20', w: 360, dark, storage: { [K.cfg]: JORDAN(look) } }));
  await p.click('#steps li:nth-child(1) .tick'); await wait(p); await p.fill('#pay_jordan', '1851'); await wait(p, 900);
  await p.$eval('#extra_jordan', e => e.scrollIntoView());
  check(`Pay tab at 360px, larger text, ${tag}: the line with its dates, buttons and warning fit; no sideways scrolling`, (await p.getAttribute('html', 'data-text')) === 'large' && await noSideScroll(p, 360) &&
    await fits('#extraHead_jordan') && await fits('#extraCount_jordan') && await fits('#extraNot_jordan') && await fits('#extraWarn_jordan') && await fits('#payHint_jordan'));
  await noAxe(p, 'the line the count opened, ' + tag);
  await p.click('#extraNot_jordan'); await wait(p);
  check(`…"Not an extra payday" (${tag}): fits`, await fits('#extraWas_jordan') && await noSideScroll(p, 360));
  await noAxe(p, 'not an extra payday, ' + tag);
  await openSet(p, 'sPeople');
  check(`Settings › People (${tag}): the date and "Next payday" fit`, await fits('#pp_on_jordan') && await fits('#pp_next_jordan') && await noSideScroll(p, 360));
  await noAxe(p, 'Settings › People with a date, ' + tag);
  check(`No JS errors (${tag}, Jordan)`, p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
  ({ ctx, p } = await session({ today: '2027-04-20', w: 360, dark, storage: { [K.cfg]: SAM(look), [K.mon]: { '2027-04': { month: '2027-04', pay: { sam: 2100 }, done: {}, oneOffs: [], paydays: { sam: 5 }, extra: { sam: { amount: 420 } } } } } }));
  check(`Sam's May at 360px (${tag}): the gap line and its button fit`, (await T(p, '#monthLabel')) === 'May 2027' && await fits('#gap_sam') && await fits('#useExtra_sam') && await noSideScroll(p, 360));
  await noAxe(p, 'the gap line, ' + tag);
  await ctx.close();
  ({ ctx, p } = await session({ today: '2026-10-15', w: 360, dark }));
  await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
  await p.click('#su_start'); await wait(p, 80); await p.selectOption('#su_pf_0', '7'); await wait(p); await p.fill('#su_pu_0', '420'); await p.fill('#su_pon_0', '2026-10-09'); await wait(p);
  check(`Setup step 2 with the date at 360px, larger text, ${tag}: fits`, await fits('#su_pon_0') && await fits('#su_pon_0_h') && await noSideScroll(p, 360));
  await noAxe(p, 'setup step 2 with the date, ' + tag);
  await ctx.close();
}

await finish();
