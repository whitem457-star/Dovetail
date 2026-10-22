// 2.16: pay patterns on screen (docs/payperiods.md 5.3, 6.1, 6.2, Appendix A, and 11.2 E6 to E17). Someone paid weekly,
// every two weeks or every four weeks: Settings › People ("How often they're paid", pay each time, "About … a month",
// standing orders or why there are none, the change sheet with a dated change), Settings › Payday as the transfer day
// (required), the Pay tab (the Pay line, the hint, "Had an extra payday?" only once pay is typed, the extra line, the
// tick rules, the standing-order notice when it's due, the top banner, the "changed" line for a step that went down),
// setup (step 2's select, step 3's transfer day, step 7, E17's layout), Analysis, Help and Words. Households without a
// pattern see nothing new but the select. Light and dark, 360px, larger text, keyboard, names, axe. Made-up households.
import { suite, session, K, LS, T, axe, noSideScroll, goMonth, sampleStorage, PAGE, skipTour } from './lib.mjs';
import fs from 'fs';
const NEWV = /var VERSION="([\d.]+)"/.exec(fs.readFileSync(PAGE, 'utf8'))[1];
const { check, finish } = suite('2.16: pay patterns');
const TODAY = '2026-10-15'; // payday or transfer day the 28th: the app opens on October 2026
const txt = (p, s) => T(p, s).then(t => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const amtsOf = p => p.$$eval('#steps .amt', l => l.map(x => x.textContent));
const focusId = p => p.evaluate(() => document.activeElement && document.activeElement.id);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (p, ms = 120) => p.waitForTimeout(ms);
const shown = async (p, s) => !!(await p.$(s)) && await p.isVisible(s);
const openSet = async (p, id) => { await p.click('#t-settings'); await wait(p, 80); if (!(await p.$eval('#' + id, d => d.open))) await p.click('#' + id + ' summary'); await wait(p, 80); };
const toPay = async p => { await p.click('#t-pay'); await wait(p, 150); };
const mon = async (p, k = '2026-10') => ((await LS(p, K.mon)) || {})[k] || {};

// Jordan (made up), paid £420.00 every week into his current account. Bills (£686.00 a month) are topped up from it, £60.00
// goes to Savings, and what's left moves on to Spending: the design's mockup 04 and 05.
const JORDAN = (o = {}) => Object.assign({ schema: 5, setupDone: true, lastVersion: NEWV, setupTips: true,
  people: [{ id: 'jordan', name: 'Jordan', payAccount: 'cur', usualPay: 1820, pattern: { every: 7, each: 420 } }],
  accounts: [{ id: 'cur', name: 'Current account', colour: 'blue', leftoverTo: 'spend' }, { id: 'bills', name: 'Bills account', colour: 'purple', leftoverTo: 'cur' },
    { id: 'spend', name: 'Spending', colour: 'orange', leftoverTo: null }],
  bills: [{ id: 'rent', name: 'Rent', amount: 600, account: 'bills', months: [] }, { id: 'en', name: 'Energy', amount: 86, account: 'bills', months: [] }],
  income: [], budgets: [{ id: 'food', name: 'Food', amount: 300, account: 'spend' }], savings: [{ id: 'sv', name: 'Savings', amount: 60, fromAccount: 'cur' }],
  reminders: [], doneLog: [], payday: { day: 28, weekend: true } }, o);
// Dan (monthly, £2,480.00) and Kerry (£1,560.00 every four weeks), each paying into Joint so they each keep the same.
const DK = (o = {}) => Object.assign({ schema: 5, setupDone: true, lastVersion: NEWV, setupTips: true,
  people: [{ id: 'dan', name: 'Dan', payAccount: 'D', usualPay: 2480 }, { id: 'kerry', name: 'Kerry', payAccount: 'Kc', usualPay: 1690, pattern: { every: 28, each: 1560 } }],
  accounts: [{ id: 'D', name: 'Dan own', colour: 'blue', leftoverTo: null }, { id: 'Kc', name: 'Kerry own', colour: 'teal', leftoverTo: null },
    { id: 'J', name: 'Joint account', colour: 'purple', leftoverTo: null, funding: { people: ['dan', 'kerry'], rule: 'sameLeft' } }],
  bills: [{ id: 'mort', name: 'Mortgage', amount: 1200, account: 'J', months: [] }, { id: 'car', name: 'Car insurance', amount: 420, account: 'J', months: [3] }],
  income: [], budgets: [], savings: [], reminders: [], doneLog: [], payday: { day: 28, weekend: true } }, o);
// Morgan (made up), paid monthly, with September saved: the change of pattern is dated.
const MORGAN = (o = {}) => Object.assign({ schema: 5, setupDone: true, lastVersion: NEWV, setupTips: true,
  people: [{ id: 'morgan', name: 'Morgan', payAccount: 'm1', usualPay: 2300 }],
  accounts: [{ id: 'm1', name: 'Main account', colour: 'blue', leftoverTo: 'm2' }, { id: 'm2', name: 'Bills pot', colour: 'purple', leftoverTo: null }],
  bills: [{ id: 'b1', name: 'Rent', amount: 900, account: 'm2', months: [] }], income: [], budgets: [], savings: [], reminders: [], doneLog: [], payday: { day: 28, weekend: true } }, o);

const NOTICE1 = 'From your next pay, standing orders of £171.50 a week to Bills account and £15.00 a week to Savings cover these transfers every month. This month, make them as usual.';
const HINT = "Type everything that's arrived since your last transfer day (usually 4 paydays). Until then: 4 × £420.00.";
const ASIDE = "Set aside: it stays in Jordan's account and isn't in these transfers.";
const WARN = 'Some transfers are ticked already. Setting this aside lowers them, and Dovetail will show what to move back.';
const OPENED = 'Some of these transfers are ticked already, so this extra payday is counted. Set it aside and the ticked ones will show what to move back.';

// ---------- 1. Jordan's first month, nothing typed: the words, the estimate, the notice, no extra-payday link ----------
let { ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: JORDAN() } });
check('Opens on October 2026', (await T(p, '#monthLabel')) === 'October 2026');
check('The Pay line: "Transfer day: Mon 28 Sep 2026 (17 days ago)" (October\'s transfer day)', (await txt(p, '#payLine')) === 'Transfer day: Mon 28 Sep 2026 (17 days ago)', await txt(p, '#payLine'));
check('The hint under Jordan\'s box: "' + HINT + '"', (await txt(p, '#payHint_jordan')) === HINT, await txt(p, '#payHint_jordan'));
check('…the estimate, 4 × £420.00, is the placeholder', (await p.getAttribute('#pay_jordan', 'placeholder')) === '1680.00');
check('The first-month line', (await txt(p, '#payX_jordan')).includes("This is your first transfer day: if some of that pay is already spent, type what's left of it."));
check('No "Had an extra payday?" while pay isn\'t typed (E7)', (await p.$('#extraAdd_jordan')) === null);
check('The standing-order notice, in its first month: "' + NOTICE1 + '"', (await txt(p, '#soNote_jordan')) === NOTICE1, await txt(p, '#soNote_jordan'));
check('…and it\'s the pay field\'s description (screen readers)', (await p.getAttribute('#pay_jordan', 'aria-describedby')) === 'soNote_jordan');
check('The top banner: "These transfers use Jordan\'s usual pay for 4 paydays."', (await txt(p, '#payBanner')) === "These transfers use Jordan's usual pay for 4 paydays.", await txt(p, '#payBanner'));
check('Transfers from £1,680.00: £686.00 top-up, £60.00 savings, £934.00 on to Spending', same(await amtsOf(p), ['£934.00', '£686.00', '£60.00']), (await amtsOf(p)).join(' '));
check('No JS errors (first month)', p.errs.length === 0, p.errs.join(' | '));

// Settings › Payday is the transfer day, and can't be unset.
await openSet(p, 'sPayday');
check('Settings: the card is "Transfer day"', (await p.$eval('#sPayday summary', s => s.firstChild.nodeValue)) === 'Transfer day');
check('…its intro (Appendix A)', (await txt(p, '#setPayday')).startsWith("The day each month you make the transfers. Pay that's arrived since the last one counts towards the next."));
check('…the select is labelled "Transfer day", with no "Not set"', (await txt(p, 'label[for=pay_day]')) === 'Transfer day' && !(await p.$$eval('#pay_day option', o => o.map(x => x.textContent))).includes('Not set'));
check('…"Next transfer day: … It\'s for November 2026." and the note', (await txt(p, '#setPayday')).includes("Next transfer day: Wed 28 Oct 2026 (in 13 days). It's for November 2026.") &&
  (await txt(p, '#setPayday')).includes("From 10 days before a transfer day, Dovetail opens on the month it's for."), await txt(p, '#setPayday'));
// 2.16.1 (payperiods.md 13.1, H4, H5): bank holidays move the day too, so the line says so; changed on purpose.
check('…the weekend line: "If it falls on a weekend or bank holiday, do it on the working day before"', (await txt(p, 'label:has(#pay_wk)')) === 'If it falls on a weekend or bank holiday, do it on the working day before');
// Settings › People
await openSet(p, 'sPeople');
check('People: "Take-home pay each time (£)" holding £420.00', (await txt(p, 'label[for=pp_u_jordan]')) === 'Take-home pay each time (£)' && (await p.inputValue('#pp_u_jordan')) === '420.00');
check('…"How often they\'re paid": Every week, with Appendix A\'s four options', (await txt(p, 'label[for=pp_f_jordan]')) === "How often they're paid" && (await p.inputValue('#pp_f_jordan')) === '7' &&
  same(await p.$$eval('#pp_f_jordan option', o => o.map(x => x.textContent)), ['Every month', 'Every four weeks', 'Every two weeks', 'Every week']));
check('…"About £1,820.00 a month over a year." (read out as it changes)', (await txt(p, '#pp_m_jordan')) === 'About £1,820.00 a month over a year.' && (await p.getAttribute('#pp_m_jordan', 'aria-live')) === 'polite');
check('…the standing orders line', (await txt(p, '#pp_so_jordan')) === 'Standing orders that cover every month: £171.50 a week to Bills account; £15.00 a week to Savings. Once they\'re set up, tick these transfers each month when they\'ve gone.', await txt(p, '#pp_so_jordan'));
await p.fill('#pp_u_jordan', '450'); await wait(p, 900);
let c = await LS(p, K.cfg);
check('Editing pay each time with no history: the pattern changes, usual pay follows, no date', same(c.people[0].pattern, { every: 7, each: 450 }) && c.people[0].usualPay === 1950 && c.people[0].was === undefined &&
  (await txt(p, '#pp_m_jordan')) === 'About £1,950.00 a month over a year.', JSON.stringify(c.people[0]));
await p.fill('#pp_u_jordan', '420'); await wait(p, 900);
check('No JS errors (Settings)', p.errs.length === 0, p.errs.join(' | '));

// ---------- 2. Typing pay: the link, the extra line, set aside, counted, remove ----------
await toPay(p);
await p.fill('#pay_jordan', '2146'); await wait(p);
check('Pay typed: the hint goes and "Had an extra payday?" appears', (await txt(p, '#payHint_jordan')) === '' && await shown(p, '#extraAdd_jordan') && (await txt(p, '#extraAdd_jordan')) === 'Had an extra payday?');
check('…its name for screen readers: "Had an extra payday, Jordan?"', (await p.getAttribute('#extraAdd_jordan', 'aria-label')) === 'Had an extra payday, Jordan?');
check('…the top banner goes (pay is typed)', (await txt(p, '#payBanner')) === '');
check('£2,146.00 in full: £1,400.00 on to Spending', same(await amtsOf(p), ['£1,400.00', '£686.00', '£60.00']), (await amtsOf(p)).join(' '));
await p.focus('#extraAdd_jordan'); await p.keyboard.press('Enter'); await wait(p);
check('The link (keyboard) opens the line, pre-filled with pay each time, focus on the amount', (await p.inputValue('#extraAmt_jordan')) === '420.00' && (await focusId(p)) === 'extraAmt_jordan' && (await txt(p, 'label[for=extraAmt_jordan]')) === 'Extra payday (£)');
check('…set aside: "' + ASIDE + '"', (await txt(p, '#extraSay_jordan')) === ASIDE && (await p.getAttribute('#extraSay_jordan', 'aria-live')) === 'polite');
check('…a group named "Jordan\'s extra payday", with "Count it this month" (named "Count Jordan\'s extra payday this month") and "Remove"',
  (await p.getAttribute('#extra_jordan', 'role')) === 'group' && (await p.getAttribute('#extra_jordan', 'aria-label')) === "Jordan's extra payday" &&
  (await txt(p, '#extraCount_jordan')) === 'Count it this month' && (await p.getAttribute('#extraCount_jordan', 'aria-label')) === "Count Jordan's extra payday this month" && (await txt(p, '#extraRemove_jordan')) === 'Remove');
check('…no warning (nothing ticked), no share-rule line (no shares)', (await p.$('#extraWarn_jordan')) === null && (await p.$('#extraRule_jordan')) === null);
check('Set aside: the transfers use £1,726.00 (£980.00 on to Spending)', same(await amtsOf(p), ['£980.00', '£686.00', '£60.00']), (await amtsOf(p)).join(' '));
let m = await mon(p);
check('Saved: extra {jordan: {amount: 420}}, and the results use the pay used', same(m.extra, { jordan: { amount: 420 } }) && m.pay.jordan === 2146 && Object.values(m.results.steps).includes(980), JSON.stringify(m));
await p.fill('#extraAmt_jordan', '412'); await wait(p, 900);
m = await mon(p);
check('Typing the amount: £412.00 set aside, £988.00 on to Spending (mockup 04), saved', same(await amtsOf(p), ['£988.00', '£686.00', '£60.00']) && same(m.extra, { jordan: { amount: 412 } }) && Object.values(m.results.steps).includes(988), JSON.stringify(m.extra));
check('…the focus stays in the amount while typing', (await focusId(p)) === 'extraAmt_jordan');
await p.click('#extraCount_jordan'); await wait(p);
m = await mon(p);
check('"Count it this month": counted, "Jordan\'s extra payday (£412.00) is counted in these transfers.", focus on "Set it aside"', same(m.extra, { jordan: { amount: 412, counted: true } }) &&
  (await txt(p, '#extraSay_jordan')) === "Jordan's extra payday (£412.00) is counted in these transfers." && (await txt(p, '#extraAside_jordan')) === 'Set it aside' && (await focusId(p)) === 'extraAside_jordan', JSON.stringify(m.extra));
check('…and the transfers count it: £1,400.00 on to Spending', same(await amtsOf(p), ['£1,400.00', '£686.00', '£60.00']));
await p.keyboard.press('Enter'); await wait(p);
check('"Set it aside" with nothing ticked: one tap (keyboard), set aside again', same((await mon(p)).extra, { jordan: { amount: 412 } }) && (await txt(p, '#extraSay_jordan')) === ASIDE && (await focusId(p)) === 'extraCount_jordan');
await p.reload(); await wait(p, 300);
check('After a reload: the line is still there with £412.00, set aside', (await p.inputValue('#extraAmt_jordan')) === '412.00' && (await txt(p, '#extraSay_jordan')) === ASIDE && same(await amtsOf(p), ['£988.00', '£686.00', '£60.00']));
await p.fill('#pay_jordan', ''); await wait(p, 900);
check('Pay cleared: no line and no link (E7), the transfers use the estimate (nothing set aside)', (await p.$('#extra_jordan')) === null && (await p.$('#extraAdd_jordan')) === null && same(await amtsOf(p), ['£934.00', '£686.00', '£60.00']));
await p.fill('#pay_jordan', '2146'); await wait(p, 900);
await p.click('#extraRemove_jordan'); await wait(p);
check('"Remove": the extra goes, the link comes back with focus', (await mon(p)).extra === undefined && await shown(p, '#extraAdd_jordan') && (await focusId(p)) === 'extraAdd_jordan' && same(await amtsOf(p), ['£1,400.00', '£686.00', '£60.00']));
check('No JS errors (the extra line)', p.errs.length === 0, p.errs.join(' | '));

// ---------- 3. Ticks first (5.3.4, 5.6 rule 2, E10) ----------
await p.click('#steps li:has-text("Spending") .tick'); await wait(p);
check('The move to Spending ticked at £1,400.00', Object.values((await mon(p)).done).includes(1400), JSON.stringify((await mon(p)).done));
await p.click('#extraAdd_jordan'); await wait(p);
m = await mon(p);
check('With a tick, the line opens counted: stored {amount: 420, counted: true}', same(m.extra, { jordan: { amount: 420, counted: true } }), JSON.stringify(m.extra));
check('…saying why: "' + OPENED + '"', (await txt(p, '#extraSay_jordan')) === OPENED, await txt(p, '#extraSay_jordan'));
check('…so the ticked transfer is unchanged (no "changed" line)', !(await txt(p, '#steps')).includes('You ticked this'));
await p.click('#extraAside_jordan'); await wait(p);
check('…the warning is the button\'s description, so it\'s read out with it (screen readers)', (await p.getAttribute('#extraAside_jordan', 'aria-describedby')) === 'extraWarn_jordan');
check('"Set it aside" with ticks, first tap: the warning, and "Set it aside anyway"; nothing changes yet', (await txt(p, '#extraWarn_jordan')) === WARN && (await txt(p, '#extraAside_jordan')) === 'Set it aside anyway' &&
  same((await mon(p)).extra, { jordan: { amount: 420, counted: true } }) && (await focusId(p)) === 'extraAside_jordan' && !(await txt(p, '#steps')).includes('You ticked this'));
await p.click('#extraAside_jordan'); await wait(p);
const DOWN = "You ticked this at £1,400.00 but it's now £980.00, £420.00 less. Move £420.00 back to Current account, or untick and tick again once it's right.";
check('Second tap: set aside, and the ticked step that went down says what to move back: "' + DOWN + '"', same((await mon(p)).extra, { jordan: { amount: 420 } }) && (await txt(p, '#steps li:has-text("Spending") .changed')) === DOWN, await txt(p, '#steps li:has-text("Spending") .changed'));
check('…the warning stays under the field while anything is ticked', (await txt(p, '#extraWarn_jordan')) === WARN && (await txt(p, '#extraSay_jordan')) === ASIDE);
await p.fill('#extraAmt_jordan', '450'); await wait(p, 900);
check('A typed amount applies as typed, the warning stays, and the "changed" line follows (£450.00 less)', (await txt(p, '#extraWarn_jordan')) === WARN &&
  (await txt(p, '#steps li:has-text("Spending") .changed')).startsWith("You ticked this at £1,400.00 but it's now £950.00, £450.00 less. Move £450.00 back to Current account") && same((await mon(p)).extra, { jordan: { amount: 450 } }));
await p.click('#extraCount_jordan'); await wait(p);
check('Counting it again: back to £1,400.00, no "changed" line, no warning', same(await amtsOf(p), ['£1,400.00', '£686.00', '£60.00']) && !(await txt(p, '#steps')).includes('You ticked this') && (await p.$('#extraWarn_jordan')) === null);
check('No JS errors (ticks)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 4. The standing-order notice when a figure goes up, and only then (E11) ----------
{ const months = { '2026-09': { month: '2026-09', pay: { jordan: 1680 }, done: {}, oneOffs: [] },
    '2027-09': { month: '2027-09', pay: {}, done: {}, oneOffs: [{ id: 'o1', kind: 'out', name: 'Boiler', amount: 200, account: 'bills' }] } };
  ({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: JORDAN(), [K.mon]: months } }));
  const UP = "Jordan's standing order to Bills account needs to be £221.50 a week from your next pay (it was £171.50). This month, make the transfer as usual.";
  check('October: a figure goes up (a one-off next September): "' + UP + '"', (await txt(p, '#soNote_jordan')) === UP, await txt(p, '#soNote_jordan'));
  check('…no first-month line (September was used)', !(await txt(p, '#payX_jordan')).includes('This is your first transfer day'));
  await goMonth(p, 'November 2026');
  check('November: nothing went up, so no notice (worked out, never stored)', (await p.$('#soNote_jordan')) === null && (await p.getAttribute('#pay_jordan', 'aria-describedby')) === null);
  await goMonth(p, 'September 2026');
  check('September, the household\'s first month: the first-month notice', (await txt(p, '#soNote_jordan')) === NOTICE1, await txt(p, '#soNote_jordan'));
  check('Nothing about the notice is saved', !JSON.stringify(await LS(p, K.mon)).includes('soNote') && !JSON.stringify(await LS(p, K.cfg)).includes('standing'));
  check('No JS errors (notice)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close(); }

// ---------- 5. Dan (monthly) and Kerry (every four weeks): one payday, the rule line, Analysis ----------
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: DK() } }));
check('Kerry\'s hint: "(usually 1 payday). Until then: £1,560.00."; Dan\'s as before', (await txt(p, '#payHint_kerry')) === "Type everything that's arrived since your last transfer day (usually 1 payday). Until then: £1,560.00." &&
  (await txt(p, '#payHint_dan')) === 'Using usual pay: £2,480.00', (await txt(p, '#payHint_kerry')) + ' / ' + await txt(p, '#payHint_dan'));
check('The banner names both', (await txt(p, '#payBanner')) === "These transfers use usual pay for Dan. These transfers use Kerry's usual pay for 1 payday. When pay arrives, type what reached your bank to make them exact.", await txt(p, '#payBanner'));
check('Dan has nothing new under his box', (await txt(p, '#payX_dan')) === '' && await p.isHidden('#payX_dan'));
await p.fill('#pay_kerry', '3120'); await wait(p); await p.click('#extraAdd_kerry'); await wait(p);
check('Under "so we each keep the same", set aside: "Counting it changes the shares, because you share so you each keep the same."', (await txt(p, '#extraRule_kerry')) === 'Counting it changes the shares, because you share so you each keep the same.');
const shares0 = await amtsOf(p);
await p.click('#extraCount_kerry'); await wait(p);
check('…counting it moves the shares (and the rule line goes)', !same(await amtsOf(p), shares0) && (await p.$('#extraRule_kerry')) === null, shares0.join(' ') + ' → ' + (await amtsOf(p)).join(' '));
await openSet(p, 'sPeople');
check('People: Kerry "Every four weeks", "About £1,690.00 a month over a year."; Dan "Every month", no About line', (await p.inputValue('#pp_f_kerry')) === '28' && (await txt(p, '#pp_m_kerry')) === 'About £1,690.00 a month over a year.' &&
  (await p.inputValue('#pp_f_dan')) === '' && (await p.$('#pp_m_dan')) === null && (await txt(p, 'label[for=pp_u_dan]')) === 'Usual take-home pay (£)');
check('…Kerry\'s share varies (car insurance in March), so a four-weekly standing order shows', /^Standing orders that cover every month: £[\d,]+\.\d\d every four weeks to Joint account\. Once they're set up, tick these transfers each month when they've gone\.$/.test(await txt(p, '#pp_so_kerry')), await txt(p, '#pp_so_kerry'));
await p.click('#t-analysis'); await wait(p, 300);
await p.click('#anPicture button.linkbtn'); await wait(p);
check('Analysis: "Kerry\'s pay (about £1,690.00 a month: £1,560.00 every four weeks)"', (await txt(p, '#anPictureTable')).includes("Kerry's pay (about £1,690.00 a month: £1,560.00 every four weeks) £1,690.00"), await txt(p, '#anPictureTable'));
await p.click('#t-due'); await wait(p, 200);
check('Reminders: "between transfer days"', (await txt(p, '#dueMonth')).includes('between transfer days'), await txt(p, '#dueMonth'));
check('No JS errors (Dan and Kerry)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 6. A dated change of pattern, and a dated edit of pay each time (5.3.7, E8) ----------
{ const months = { '2026-09': { month: '2026-09', pay: { morgan: 2300 }, done: { 'm:m1>m2': 1400 }, oneOffs: [] } };
  ({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: MORGAN(), [K.mon]: months } }));
  await goMonth(p, 'September 2026'); const sep0 = await amtsOf(p); await goMonth(p, 'October 2026');
  await openSet(p, 'sPeople');
  await p.selectOption('#pp_f_morgan', '7'); await wait(p, 200);
  check('With history, choosing "Every week" opens "Morgan\'s pay from now on"', await p.isVisible('#sheet') && (await T(p, '#sheetH')) === "Morgan's pay from now on");
  check('…pay each time (a guess from £2,300.00 a month), "From October 2026.", the week-in-hand line, no month picker, Change and Cancel',
    (await txt(p, 'label[for=ppc_pay]')) === 'Take-home pay each time (£)' && (await p.inputValue('#ppc_pay')) === '530.77' && (await txt(p, '#ppc_from')) === 'From October 2026.' &&
    (await txt(p, '#sheetB')).includes('Paid a week in hand? The first month will have fewer paydays, so type what arrived.') && (await p.$('#ppc_day')) === null && (await p.$('#sheetB select')) === null &&
    (await txt(p, '#ppc_go')) === 'Change' && (await txt(p, '#ppc_cancel')) === 'Cancel');
  check('No axe violations (the change sheet)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
  await p.click('#ppc_cancel'); await wait(p, 200);
  c = await LS(p, K.cfg);
  check('Cancel: nothing changes, the select is back on "Every month", focus on it', c.people[0].pattern === undefined && (await p.inputValue('#pp_f_morgan')) === '' && (await focusId(p)) === 'pp_f_morgan');
  await p.selectOption('#pp_f_morgan', '7'); await wait(p, 200);
  await p.fill('#ppc_pay', 'abc'); await p.click('#ppc_go'); await wait(p);
  check('An amount that can\'t be read: "Type pay as an amount, like 420.00."', (await txt(p, '#ppc_msg')) === 'Type pay as an amount, like 420.00.' && await p.isVisible('#sheet'));
  await p.fill('#ppc_pay', '500'); await p.focus('#ppc_go'); await p.keyboard.press('Enter'); await wait(p, 250);
  c = await LS(p, K.cfg);
  check('Change (keyboard): weekly £500.00 from October, earlier months keep monthly pay (was)', same(c.people[0].pattern, { every: 7, each: 500 }) && c.people[0].usualPay === 2166.67 &&
    same(c.people[0].was, [{ until: '2026-09', usualPay: 2300 }]), JSON.stringify(c.people[0]));
  check('…the line: "From October 2026. Earlier months keep monthly pay of £2,300.00." with "Change earlier months too"', (await txt(p, '#pp_d_morgan')) === 'From October 2026. Earlier months keep monthly pay of £2,300.00. Change earlier months too', await txt(p, '#pp_d_morgan'));
  check('…focus back on "How often they\'re paid"', (await focusId(p)) === 'pp_f_morgan', await focusId(p));
  check('…Settings › Payday now says "Transfer day"', (await p.$eval('#sPayday summary', s => s.firstChild.nodeValue)) === 'Transfer day');
  await toPay(p);
  check('October uses the pattern: "usually 4 paydays", 4 × £500.00', (await txt(p, '#payHint_morgan')) === "Type everything that's arrived since your last transfer day (usually 4 paydays). Until then: 4 × £500.00.", await txt(p, '#payHint_morgan'));
  await goMonth(p, 'September 2026');
  check('September keeps its figures exactly, with its monthly pay and no extra-payday link', same(await amtsOf(p), sep0) && (await p.$('#extraAdd_morgan')) === null && !(await txt(p, '#steps')).includes('You ticked this'), (await amtsOf(p)).join(' '));
  await goMonth(p, 'October 2026');
  // Pay each time edited later in the same pay month: still one entry, from before the first edit.
  await openSet(p, 'sPeople'); await p.fill('#pp_u_morgan', '520'); await wait(p, 900);
  c = await LS(p, K.cfg);
  check('Pay each time edited again this pay month: £520.00, the entry from before the first edit stays', same(c.people[0].pattern, { every: 7, each: 520 }) && same(c.people[0].was, [{ until: '2026-09', usualPay: 2300 }]));
  await p.click('#pp_d_morgan_all'); await wait(p, 200);
  c = await LS(p, K.cfg);
  check('"Change earlier months too": the date goes, September takes the pattern', c.people[0].was === undefined && same(c.people[0].pattern, { every: 7, each: 520 }));
  check('No JS errors (dated change)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close(); }
{ // Kerry, already every four weeks, with September saved: pay each time changes from October.
  const months = { '2026-09': { month: '2026-09', pay: { dan: 2480, kerry: 1560 }, done: {}, oneOffs: [] } };
  const hh = DK(); hh.people[1].pattern = { every: 28, each: 1500 }; hh.people[1].usualPay = 1625;
  ({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: hh, [K.mon]: months } }));
  await openSet(p, 'sPeople'); await p.fill('#pp_u_kerry', '1560'); await wait(p, 900);
  c = await LS(p, K.cfg);
  check('A dated edit of pay each time: was [{until 2026-09, usualPay 1625, pattern every 28 each 1500}]', same(c.people[1].was, [{ until: '2026-09', usualPay: 1625, pattern: { every: 28, each: 1500 } }]) && c.people[1].usualPay === 1690, JSON.stringify(c.people[1]));
  check('…"Changed from October 2026. Earlier months keep £1,500.00 each time." (mockup 03)', (await txt(p, '#pp_d_kerry')) === 'Changed from October 2026. Earlier months keep £1,500.00 each time. Change earlier months too', await txt(p, '#pp_d_kerry'));
  check('…and "About £1,690.00 a month over a year."', (await txt(p, '#pp_m_kerry')) === 'About £1,690.00 a month over a year.');
  check('No JS errors (pay each time)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close(); }

// ---------- 7. The transfer day is required (5.3.2, E12, E13) ----------
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: MORGAN({ payday: {} }) } }));
await openSet(p, 'sPeople');
await p.selectOption('#pp_f_morgan', '14'); await wait(p, 200);
check('No transfer day set, no history: choosing "Every two weeks" still opens the sheet, asking for the transfer day', await p.isVisible('#sheet') && (await txt(p, 'label[for=ppc_day]')) === 'Transfer day' && (await p.$('#ppc_from')) === null);
await p.click('#ppc_go'); await wait(p);
check('…Change without one: "Choose a transfer day."', (await txt(p, '#ppc_msg')) === 'Choose a transfer day.' && (await LS(p, K.cfg)).people[0].pattern === undefined);
await p.selectOption('#ppc_day', '25'); await wait(p, 100);
// 2.16.1 (13.1, H4, H5): the weekend and bank holiday line, changed on purpose.
check('…the weekend line for a transfer day', (await txt(p, 'label:has(#ppc_wk)')) === 'If it falls on a weekend or bank holiday, do it on the working day before');
await p.click('#ppc_go'); await wait(p, 250);
c = await LS(p, K.cfg);
check('…Change: every two weeks (£1,061.54 each time, from £2,300.00 a month), transfer day the 25th', same(c.people[0].pattern, { every: 14, each: 1061.54 }) && c.payday.day === 25 && c.payday.weekend === true, JSON.stringify([c.people[0], c.payday]));
await openSet(p, 'sPayday');
check('Settings › Payday: no "Not set" once someone has a pattern', !(await p.$$eval('#pay_day option', o => o.map(x => x.textContent))).includes('Not set') && (await p.inputValue('#pay_day')) === '25');
await openSet(p, 'sPeople');
await p.selectOption('#pp_f_morgan', ''); await wait(p, 200);
c = await LS(p, K.cfg);
check('Back to "Every month" with no history: the fields just change (no sheet), usual pay kept', !(await p.isVisible('#sheet')) && c.people[0].pattern === undefined && c.people[0].usualPay === 2300, JSON.stringify(c.people[0]));
await p.selectOption('#pp_f_morgan', '7'); await wait(p, 200);
c = await LS(p, K.cfg);
check('…and to "Every week" with a transfer day set and no history: no sheet, the fields change', !(await p.isVisible('#sheet')) && c.people[0].pattern && c.people[0].pattern.every === 7, JSON.stringify(c.people[0]));
check('No JS errors (transfer day)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
// A damaged file: a pattern and no transfer day (E12): months as a household with no payday has them, and the Pay line
// asks for one.
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: MORGAN({ payday: {} }) } }));
const monthNoDay = await T(p, '#monthLabel'); await ctx.close();
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: JORDAN({ payday: {} }) } }));
check('A pattern with no transfer day (a damaged file): "Set your transfer day", and the month a household with no payday gets', (await txt(p, '#payLine')) === 'Set your transfer day' && (await T(p, '#monthLabel')) === monthNoDay, (await txt(p, '#payLine')) + ' / ' + await T(p, '#monthLabel'));
await openSet(p, 'sPayday');
check('…and Settings › Payday offers "Choose a day", not "Not set"', (await p.$$eval('#pay_day option', o => o[0].textContent)) === 'Choose a day');
check('No JS errors (damaged)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 8. Setup with a pattern: step 2, step 3, step 7, and E17's layout ----------
({ ctx, p } = await session({ today: TODAY }));
await p.click('#su_start'); await wait(p, 80);
check('Step 2: the select (#su_pf_0) with Appendix A\'s options, "Every month" by default', (await p.inputValue('#su_pf_0')) === '' && (await txt(p, 'label[for=su_pf_0]')) === "How often they're paid" &&
  same(await p.$$eval('#su_pf_0 option', o => o.map(x => x.textContent)), ['Every month', 'Every four weeks', 'Every two weeks', 'Every week']) && (await txt(p, 'label[for=su_pu_0]')) === 'Usual take-home pay (£)');
await p.fill('#su_p_0', 'Jordan'); await p.selectOption('#su_pf_0', '7'); await wait(p);
check('Every week: "Take-home pay each time (£)", focus stays on the select', (await txt(p, 'label[for=su_pu_0]')) === 'Take-home pay each time (£)' && (await focusId(p)) === 'su_pf_0' && (await p.inputValue('#su_p_0')) === 'Jordan');
await p.fill('#su_pu_0', '420'); await wait(p, 900);
check('…"About £1,820.00 a month over a year." (read out once typing stops)', (await txt(p, '#su_pm_0')) === 'About £1,820.00 a month over a year.' && (await p.getAttribute('#su_pm_0', 'aria-live')) === 'polite');
await p.fill('#su_pu_0', '1000000.01'); await p.click('#su_next'); await wait(p);
check('…pay each time above £1,000,000: "Type pay as an amount, like 420.00."', (await txt(p, '#su_msg')) === 'Type pay as an amount, like 420.00.' && (await p.getAttribute('#su_pu_0', 'aria-invalid')) === 'true');
await p.fill('#su_pu_0', '42x'); await p.click('#su_next'); await wait(p);
check('…pay that can\'t be read: "Type pay as an amount, like 420.00."', (await txt(p, '#su_msg')) === 'Type pay as an amount, like 420.00.');
await p.fill('#su_pu_0', '420'); await p.click('#su_next'); await wait(p, 100);
check('Step 3: "Your transfer day", "When will you make the transfers?", the intro with nobody monthly', (await txt(p, '#suTitle')) === 'Your transfer day' && (await txt(p, '#su_h_day')) === 'When will you make the transfers?' &&
  (await txt(p, '#su_day_intro')) === "Pick one day a month to make the transfers: Dovetail counts the pay that's arrived since the last one. A day just before your rent or mortgage goes out works well.");
check('…"Transfer day", no Skip, no "same day" question', (await txt(p, 'label[for=su_day]')) === 'Transfer day' && (await p.$('#su_skip')) === null && (await p.$('#su_same_yes')) === null);
await p.click('#su_next'); await wait(p);
check('…Next without a day: "Choose a transfer day."', (await txt(p, '#su_msg')) === 'Choose a transfer day.' && (await txt(p, '#suTitle')) === 'Your transfer day');
await p.selectOption('#su_day', '28'); await wait(p);
check('…"Your next transfer day: Wednesday 28 October. It\'s for November 2026."', (await txt(p, '#su_next_payday')) === "Your next transfer day: Wednesday 28 October. It's for November 2026.", await txt(p, '#su_next_payday'));
check('No axe violations (step 3, transfer day)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#su_next'); await wait(p, 100);
await p.check('#su_shape_split'); await wait(p);
check('Step 4, E17: the line under the picture says why Bills is topped up from Jordan\'s account', /^Because Jordan is paid every week, .+ is topped up from .+ each month, and what's left goes on to .+\.$/.test(await txt(p, '#su_e17')), await txt(p, '#su_e17'));
await p.click('#su_next'); await wait(p, 100);
// Step 5: a bill in the bills account.
await p.fill('#su_b_1_0_n', 'Rent'); await p.fill('#su_b_1_0_a', '686');
await p.click('#su_next'); await wait(p, 100); await p.click('#su_skip'); await wait(p, 100);
check('Step 7: "Your first transfer day", "Your first transfer day: Wednesday 28 October, for November 2026."', (await txt(p, '#suTitle')) === 'Your first transfer day' && (await txt(p, '#su_first')) === 'Your first transfer day: Wednesday 28 October, for November 2026.', await txt(p, '#su_first'));
check('…the preview plans on 4 × £420.00: £686.00 to the bills account, £994.00 left over', (await txt(p, '#su_transfers')).includes('£686.00') && (await txt(p, '#su_left')).includes('£994.00'), (await txt(p, '#su_transfers')) + ' / ' + (await txt(p, '#su_left')));
check('…and the standing order that covers it: £171.50 a week', (await txt(p, '#su_so')).startsWith('From your next pay, standing orders of £171.50 a week to '), await txt(p, '#su_so'));
await p.click('#su_finish'); await wait(p, 300); await skipTour(p);
c = await LS(p, K.cfg);
const acc = id => c.accounts.find(a => a.id === id), me = c.people[0], pa = acc(me.payAccount), bi = c.accounts.find(a => a.leftoverTo === me.payAccount);
check('Saved: weekly £420.00 (usual pay £1,820.00)', same(me.pattern, { every: 7, each: 420 }) && me.usualPay === 1820, JSON.stringify(me));
check('E17: Bills → pay account → spending, so the pay account tops up Bills', !!bi && !!pa.leftoverTo && acc(pa.leftoverTo).leftoverTo === null, JSON.stringify(c.accounts.map(a => [a.name, a.leftoverTo])));
check('…and the Pay tab shows the standing orders notice for the first month', (await txt(p, '[id^=soNote_]')).startsWith('From your next pay, standing orders of £171.50 a week to '), await txt(p, '[id^=soNote_]'));
check('No JS errors (setup with a pattern)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
// Step 3 with someone monthly: the intro names the one on a pattern.
({ ctx, p } = await session({ today: TODAY }));
await p.click('#su_start'); await wait(p, 80);
await p.fill('#su_p_0', 'Dan'); await p.fill('#su_pu_0', '2480'); await p.click('#su_addp'); await p.fill('#su_p_1', 'Kerry'); await p.selectOption('#su_pf_1', '28'); await p.fill('#su_pu_1', '1560'); await wait(p, 900);
check('Step 2, Kerry every four weeks: "About £1,690.00 a month over a year."; Dan has no About line', (await txt(p, '#su_pm_1')) === 'About £1,690.00 a month over a year.' && (await p.$('#su_pm_0')) === null);
await p.click('#su_next'); await wait(p, 100);
check('Step 3 with someone monthly: "Kerry\'s pay comes every four weeks, …"', (await txt(p, '#su_day_intro')) === "Kerry's pay comes every four weeks, so its date moves each month. Pick one day a month to make the transfers: Dovetail counts the pay that's arrived since the last one. Most households pick the monthly payday.", await txt(p, '#su_day_intro'));
await ctx.close();

// ---------- 8b. One figure everywhere (section 7): Kerry £420.00 a week and Dan £1,500.00 a month share £1,000.00 in
// proportion to pay (£1,820.00 against £1,500.00: £548.19 and £451.81) in setup's worked example, its preview, the Pay tab
// and "Change how you manage your money".
{ ({ ctx, p } = await session({ today: TODAY }));
  const SHARE = "For example: if Joint account has £1,000.00 of bills, Dan's share is £451.81 and Kerry's is £548.19.";
  await p.click('#su_start'); await wait(p, 80);
  await p.fill('#su_p_0', 'Dan'); await p.fill('#su_pu_0', '1500'); await p.click('#su_addp'); await p.fill('#su_p_1', 'Kerry'); await p.selectOption('#su_pf_1', '7'); await p.fill('#su_pu_1', '420');
  await p.click('#su_next'); await wait(p, 100); await p.selectOption('#su_day', '28'); await p.click('#su_next'); await wait(p, 100);
  await p.check('#su_style_contribute'); await p.check('#su_rule_pay'); await wait(p);
  check('Setup\'s worked example: "' + SHARE + '"', (await txt(p, '#su_example_line')) === SHARE, await txt(p, '#su_example_line'));
  check('…no E17 line for a couple', (await p.$('#su_e17')) === null);
  await p.click('#su_next'); await wait(p, 100);
  await p.fill('#setup .su-bsec .qa-row input[id$="_0_n"]', 'Mortgage'); await p.fill('#setup .su-bsec .qa-row input[id$="_0_a"]', '1000');
  await p.click('#su_next'); await wait(p, 100); await p.click('#su_skip'); await wait(p, 100);
  const pv = await txt(p, '#su_transfers');
  check('Setup\'s preview: £451.81 from Dan and £548.19 from Kerry', pv.includes('£451.81') && pv.includes('£548.19'), pv);
  await p.click('#su_finish'); await wait(p, 300); await skipTour(p);
  const pa = await amtsOf(p);
  check('The Pay tab: the same shares', pa.includes('£451.81') && pa.includes('£548.19'), pa.join(' '));
  await openSet(p, 'sAccounts'); await p.click('#ac_change'); await wait(p, 150);
  await p.check('#su_style_contribute'); await p.check('#su_rule_pay'); await wait(p);
  check('"Change how you manage your money": the same worked example (Kerry\'s pay over a year ÷ 12, not 4 × £420.00)', (await txt(p, '#su_example_line')) === SHARE, await txt(p, '#su_example_line'));
  check('No JS errors (one figure everywhere)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close(); }

// ---------- 9. A household without a pattern: nothing new but the select ----------
({ ctx, p } = await session({ today: TODAY, storage: sampleStorage() }));
const payIds = await p.$$eval('[id^=payX_]', l => l.map(x => [x.id, x.textContent, x.getBoundingClientRect().height]));
check('Pay tab: nothing under the pay boxes', payIds.length > 0 && payIds.every(x => x[1] === '' && x[2] === 0), JSON.stringify(payIds));
check('…"Payday", not "Transfer day"', (await txt(p, '#payLine')).startsWith('Payday') || (await txt(p, '#payLine')).startsWith('Paid on') || (await txt(p, '#payLine')).startsWith('Set your payday'), await txt(p, '#payLine'));
const ids0 = await p.$$eval('#payGrid input', l => l.map(x => x.id));
await p.fill('#' + ids0[0], '2000'); await wait(p, 900);
check('…typing pay shows no extra-payday link, and the saved month has no extra', (await p.$('[id^=extraAdd_]')) === null && !JSON.stringify(await LS(p, K.mon)).includes('"extra"'));
await openSet(p, 'sPeople');
check('Settings › People: the select ("Every month") and nothing else new', (await p.$$('[id^=pp_f_]')).length === 2 && (await p.$$eval('[id^=pp_f_]', l => l.every(x => x.value === ''))) &&
  (await p.$('[id^=pp_m_]')) === null && (await p.$('[id^=pp_so_]')) === null && (await p.$$eval('#setPeople label.lbl', l => l.filter(x => x.textContent === 'Usual take-home pay (£)').length)) === 2);
await openSet(p, 'sPayday');
check('Settings › Payday as before: "Payday", "Not set" offered', (await p.$eval('#sPayday summary', s => s.firstChild.nodeValue)) === 'Payday' && (await txt(p, 'label[for=pay_day]')) === 'Payday' &&
  (await p.$$eval('#pay_day option', o => o[0].textContent)) === 'Not set');
check('Settings and months untouched by the new screens (no pattern, no extra written)', !JSON.stringify(await LS(p, K.cfg)).includes('pattern') && !JSON.stringify(await LS(p, K.mon)).includes('"extra"'));
await p.click('#t-due'); await wait(p, 200);
check('Reminders: "between paydays" as before', (await txt(p, '#dueMonth')).includes('between paydays') || (await txt(p, '#dueMonth')).includes('The calendar month'));
check('No JS errors (no pattern)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 10. Help, Words and the tour: one text for everyone ----------
for (const hh of [JORDAN(), MORGAN()]) {
  ({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: hh } }));
  await openSet(p, 'sHelp'); await p.click('#helpWords'); await wait(p, 150);
  const w = await txt(p, '#sheetB');
  check(`Words (${hh.people[0].name}): "Transfer day" and "Pay month" from Appendix A`, w.includes("Transfer day The day each month you make the transfers. For most people it's payday. If you're paid every week, two weeks or four weeks, it's a day you choose, and the pay that's arrived since the last one counts.") &&
    w.includes('Pay month The month your pay is for. It runs from one transfer day to the next.'));
  await p.click('#sheetClose'); await wait(p, 100); await p.click('#helpHow'); await wait(p, 150);
  const h = await txt(p, '#sheetB');
  check(`How Dovetail works (${hh.people[0].name}): pay that isn't monthly, standing orders, and other income every four weeks`,
    h.includes("Paid every week, two weeks or four weeks? Choose it in Settings › People. Each month, type everything that's arrived since your last transfer day. If one more payday came than usual, tap 'Had an extra payday?': it's set aside, out of the transfers, unless you count it. Settings › People shows standing orders that cover every month.") &&
    h.includes("Once the buffer's there, you can lower it to the month's amount × 12 ÷ 52 (weekly) or × 12 ÷ 26 (every two weeks).") && h.includes("Child Benefit or another payment every four weeks? Add it as other income, using one payment as the amount a month: in the month with two, you'll have a bit more."));
  check(`No axe violations (How Dovetail works, ${hh.people[0].name})`, (await axe(p)).length === 0, (await axe(p)).join(' | '));
  await ctx.close();
}

// ---------- 11. Light and dark, 360px, larger text: the Pay tab's line and notice, People, setup step 2 ----------
for (const dark of [false, true]) {
  const tag = dark ? 'dark' : 'light';
  ({ ctx, p } = await session({ today: TODAY, w: 360, dark, storage: { [K.cfg]: JORDAN({ appearance: { theme: dark ? 'dark' : 'light', textSize: 'large' } }) } }));
  await p.fill('#pay_jordan', '2146'); await wait(p); await p.click('#extraAdd_jordan'); await wait(p);
  await p.$eval('#extra_jordan', e => e.scrollIntoView());
  const fits = s => p.$eval(s, e => { const r = e.getBoundingClientRect(); return r.right <= 360 && r.left >= 0; });
  check(`Pay tab at 360px, larger text, ${tag}: the line, its buttons and the notice fit, no sideways scrolling`, (await p.getAttribute('html', 'data-text')) === 'large' && await noSideScroll(p, 360) &&
    await fits('#extra_jordan') && await fits('#extraCount_jordan') && await fits('#extraRemove_jordan') && await fits('#soNote_jordan'));
  check(`No axe violations (Pay tab with the extra line and notice, ${tag})`, (await axe(p)).length === 0, (await axe(p)).join(' | '));
  await p.click('#steps li:nth-child(1) .tick'); await wait(p); await p.click('#extraCount_jordan'); await wait(p); await p.click('#extraAside_jordan'); await wait(p);
  check(`…with the warning (${tag}): fits, no axe violations`, await shown(p, '#extraWarn_jordan') && await fits('#extraWarn_jordan') && await noSideScroll(p, 360) && (await axe(p)).length === 0, (await axe(p)).join(' | '));
  await openSet(p, 'sPeople');
  check(`Settings › People at 360px, larger text, ${tag}: "Every week" fits, no axe violations`, await fits('#pp_f_jordan') && await fits('#pp_so_jordan') && await noSideScroll(p, 360) && (await axe(p)).length === 0, (await axe(p)).join(' | '));
  await openSet(p, 'sPayday');
  check(`Settings › Transfer day (${tag}): no axe violations`, (await axe(p)).length === 0, (await axe(p)).join(' | '));
  check(`No JS errors (${tag})`, p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
  ({ ctx, p } = await session({ today: TODAY, w: 360, dark }));
  await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
  await p.click('#su_start'); await wait(p, 80); await p.selectOption('#su_pf_0', '28'); await wait(p); await p.fill('#su_pu_0', '1560'); await wait(p, 900);
  check(`Setup step 2 with "Every four weeks" at 360px, larger text, ${tag}: fits, no axe violations`, await fits('#su_pf_0') && await noSideScroll(p, 360) && (await axe(p)).length === 0, (await axe(p)).join(' | '));
  await ctx.close();
}

await finish();
