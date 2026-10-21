// 2.12: household money styles. Setup's questions build each kind of household; shares show on the Pay tab and in
// Settings › Accounts › Paid for by; and the way a household manages its money can change from a month, leaving earlier
// months as they were. Made-up households only.
import { suite, session, K, LS, T, axe, noSideScroll, household, steps, skipTour, openDetails, sampleStorage } from './lib.mjs';
const { check, finish } = suite('2.12: household money styles');
const TODAY = '2026-10-20';
const accNames = p => p.$$eval('#setup .su-acct input[id^=su_a_]', l => l.map(x => x.value));
const byName = (c, n) => c.accounts.find(a => a.name === n) || {};
const focusId = p => p.evaluate(() => document.activeElement && document.activeElement.id);

/** Setup up to step 4, with these people ([name, usual pay]; '' for none) and no payday. */
async function toStep4(p, people) {
  await p.click('#su_start');
  for (let i = 0; i < people.length; i++) { if (i) await p.click('#su_addp'); await p.fill('#su_p_' + i, people[i][0]); await p.fill('#su_pu_' + i, people[i][1]); }
  await p.click('#su_next'); await p.waitForTimeout(40);
  if ((await p.textContent('#suTitle')) === 'Your pay') { await p.click('#su_next'); await p.waitForTimeout(40); }
  await p.click('#su_skip'); await p.waitForTimeout(60);
}
/** From step 4: Next, a bill in the first open bills section, on to the preview; its transfers; then finish. */
async function finishWithBill(p, name, amount) {
  await p.click('#su_next'); await p.waitForTimeout(60);
  const sec = await p.$eval('#setup .su-bsec', s => s.querySelector('h2').textContent);
  await p.fill('#setup .su-bsec .qa-row input[id$="_0_n"]', name); await p.fill('#setup .su-bsec .qa-row input[id$="_0_a"]', String(amount));
  await p.click('#su_next'); await p.waitForTimeout(40); await p.click('#su_skip'); await p.waitForTimeout(60);
  const preview = await p.$$eval('#su_transfers li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').replace(' to ', ' ').replace(/\s*→\s*/, ' → ').replace(/(\S)£/, '$1 £').trim()));
  await p.click('#su_finish'); await p.waitForTimeout(250); await skipTour(p);
  return { sec, preview };
}

// ---------- 1. The questions ----------
let { ctx, p } = await session({ today: TODAY });
await toStep4(p, [['Alex', '3000'], ['Sam', '2000']]);
check('Two people: the first question is how the household manages its money, a radio group of five', (await p.textContent('#su_h_move')) === 'How do you manage your money?' &&
  (await p.getAttribute('#setup fieldset:has(#su_style_pool)', 'role')) === 'radiogroup' && (await p.$$('#setup input[name=su_style]')).length === 5 &&
  (await p.textContent('#setup fieldset:has(#su_style_pool) legend')) === 'In our house we manage our money by…');
check('…each choice is a real radio button with its words as its name', await p.$$eval('#setup input[name=su_style]', l => l.every(r => r.closest('label') && r.closest('label').textContent.length > 20)));
await p.focus('#su_style_pool'); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(80);
check('Arrow keys move between the answers', await p.isChecked('#su_style_contribute') && (await focusId(p)) === 'su_style_contribute');
check('"Each paying into a joint account": how to split it, then one joint account or two', await p.isVisible('#su_rule_equal') && await p.isVisible('#su_two_no') && await p.isChecked('#su_two_no'));
const rules = await p.$$eval('#setup fieldset:has(#su_rule_equal) .su-shape b', l => l.map(x => x.textContent));
check('…four ways to split it', JSON.stringify(rules) === JSON.stringify(['Half each', 'In proportion to pay', 'So we each keep the same', 'Set amounts']), rules.join(' | '));
await p.click('#su_next'); await p.waitForTimeout(50);
check('Next without a split says what to do, and focus goes to it', (await T(p, '#su_msg')).includes('Choose how you split the shared costs') && (await focusId(p)) === 'su_rule_equal');
await p.check('#su_rule_set'); await p.waitForTimeout(50);
check('Set amounts: a box for each person', await p.isVisible('#su_set_0') && await p.isVisible('#su_set_1'));
await p.click('#su_next'); await p.waitForTimeout(50);
check('…which must be filled in', (await T(p, '#su_msg')).includes('Type each amount a month') && (await p.getAttribute('#su_set_0', 'aria-invalid')) === 'true');
await p.fill('#su_set_0', '800'); await p.fill('#su_set_1', '600'); await p.waitForTimeout(50);
check('The diagram says who pays into what', (await T(p, '#su_dia')).includes("It pays Alex's set amount into Joint account.") && (await T(p, '#su_dia')).includes('Alex and Sam each pay a set amount into Joint account.'), await T(p, '#su_dia'));
check('Own accounts that keep what\'s left need no "two accounts keep what\'s left" note', (await p.$('#su_roots')) === null);
check('No axe violations (questions, light)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.check('#su_rule_pay'); await p.waitForTimeout(50);
check('In proportion to pay: a worked example from their pay', (await T(p, '#su_example_line')) === "For example: if Joint account has £1,000.00 of bills, Alex's share is £600.00 and Sam's is £400.00.", await T(p, '#su_example_line'));
await p.fill('#su_a_2', 'Joint bills'); await p.check('#su_two_yes'); await p.waitForTimeout(80);
check('After editing the accounts, an answer that changes them asks first', await p.isVisible('#su_replace'));
await p.click('#su_replace_no'); await p.waitForTimeout(80);
check('"Keep mine" puts the answer back', await p.isChecked('#su_two_no') && (await focusId(p)) === 'su_two_no' && (await p.inputValue('#su_a_2')) === 'Joint bills');
check('No JS errors (questions)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// The questions in dark, at 360px, with larger text.
({ ctx, p } = await session({ today: TODAY, w: 360, dark: true }));
await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
await toStep4(p, [['Alexandra', '3000'], ['Bartholomew', ''], ['Christabel', '900']]);
await p.check('#su_style_contribute'); await p.check('#su_rule_sameLeft'); await p.waitForTimeout(80);
check('Three people: "Everyone in the household", with board for anyone but the first', await p.isVisible('#su_h_board') && !(await p.$('#su_board_0_no')) && await p.isVisible('#su_board_1_no') && await p.isVisible('#su_board_2_no'));
check('Someone with no pay: does the earner give them money?', (await T(p, '#su_h_move')) && (await p.textContent('#setup fieldset:has(#su_gets_1_no) legend')) === 'Does Bartholomew get money from Alexandra each month?');
await p.check('#su_gets_1_yes'); await p.check('#su_board_2_yes'); await p.waitForTimeout(80);
check('Dark, 360px, larger text: no sideways scrolling', await noSideScroll(p, 360));
check('No axe violations (questions, dark, larger text)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('No JS errors (dark)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2. Every style from the questions: the accounts, who pays, the transfers ----------
const STYLES = [
  { name: 'Putting it all together, own accounts, with spending money', people: [['Alex', '3000'], ['Sam', '2000']],
    answer: async p => { await p.check('#su_style_pool'); await p.check('#su_shape_own'); await p.check('#su_fun_yes'); await p.fill('#su_funv_0', '200'); await p.fill('#su_funv_1', '150'); },
    accounts: ["Alex's account", "Sam's account", 'Joint account'], bills: 'Paid from Joint account',
    transfers: ["Alex's account → Joint account £2,800.00", "Sam's account → Joint account £1,850.00"],
    saved: c => c.budgets.map(b => b.name + ' ' + b.amount).join(',') === "Alex's spending money 200,Sam's spending money 150" && c.accounts.every(a => !a.funding) },
  { name: 'Each paying into a joint account, half each', people: [['Alex', '3000'], ['Sam', '2000']],
    answer: async p => { await p.check('#su_style_contribute'); await p.check('#su_rule_equal'); },
    accounts: ["Alex's account", "Sam's account", 'Joint account'], bills: 'Paid from Joint account',
    transfers: ["Alex's account → Joint account £600.00", "Sam's account → Joint account £600.00"],
    saved: c => JSON.stringify(byName(c, 'Joint account').funding) === JSON.stringify({ people: c.people.map(x => x.id), rule: 'equal' }), pay: ["Alex's share (half each)", "Sam's share (half each)"] }, // 2.13: the equal rule in words
  { name: 'Each paying into a joint bills and a joint spending account, by pay', people: [['Alex', '3000'], ['Sam', '2000']],
    answer: async p => { await p.check('#su_style_contribute'); await p.check('#su_rule_pay'); await p.check('#su_two_yes'); },
    accounts: ["Alex's account", "Sam's account", 'Joint bills', 'Joint spending'], bills: 'Paid from Joint bills',
    transfers: ["Alex's account → Joint bills £720.00", "Sam's account → Joint bills £480.00"],
    saved: c => byName(c, 'Joint bills').funding.rule === 'pay' && byName(c, 'Joint spending').funding.rule === 'pay' && byName(c, 'Joint bills').leftoverTo === byName(c, 'Joint spending').id },
  { name: 'One of us paying the bills (Sam), so we each keep the same', people: [['Alex', '3000'], ['Sam', '2000']],
    answer: async p => { await p.check('#su_style_housekeeping'); await p.check('#su_payer_1'); await p.check('#su_rule_sameLeft'); },
    accounts: ["Alex's account", "Sam's account"], bills: "Paid from Sam's account",
    transfers: ["Alex's account → Sam's account £1,100.00"],
    saved: c => byName(c, "Sam's account").funding && byName(c, "Sam's account").funding.rule === 'sameLeft' && !byName(c, "Alex's account").funding, keeps: 'Alex keeps £1,900.00,Sam keeps £1,900.00' },
  { name: 'Each paying certain bills', people: [['Alex', '3000'], ['Sam', '2000']],
    answer: async p => { await p.check('#su_style_separate'); },
    accounts: ["Alex's account", "Sam's account"], bills: "Paid from Alex's account", transfers: ['No transfers needed: each account keeps its own money.'], noPay: true,
    saved: c => c.accounts.every(a => !a.funding && !a.leftoverTo) },
  { name: 'One earner: Sam gets a set amount from Alex', people: [['Alex', '3000'], ['Sam', '']],
    // 2.13: with one earner, how to split it isn't asked.
    answer: async p => { await p.check('#su_style_contribute'); await p.check('#su_gets_1_yes'); await p.fill('#su_getsv_1', '300'); },
    accounts: ["Alex's account", "Sam's account", 'Joint account'], bills: 'Paid from Joint account',
    transfers: ["Alex's account → Sam's account £300.00", "Alex's account → Joint account £1,200.00"],
    saved: c => byName(c, 'Joint account').funding.people.length === 1 && byName(c, "Sam's account").funding.rule === 'set' },
  { name: 'Three adults, one paying board', people: [['Alex', '3000'], ['Sam', '2000'], ['Kit', '1000']],
    answer: async p => { await p.check('#su_style_pool'); await p.check('#su_shape_own'); await p.check('#su_board_2_yes'); await p.fill('#su_boardv_2', '250'); },
    accounts: ["Alex's account", "Sam's account", "Kit's account", 'Joint account'], bills: 'Paid from Joint account',
    transfers: ["Kit's account → Joint account £250.00", "Alex's account → Joint account £3,000.00", "Sam's account → Joint account £2,000.00"],
    saved: c => JSON.stringify(byName(c, 'Joint account').funding.set) === JSON.stringify({ [c.people[2].id]: { amount: 250 } }) },
];
for (const st of STYLES) {
  ({ ctx, p } = await session({ today: TODAY }));
  await toStep4(p, st.people); await st.answer(p); await p.waitForTimeout(80);
  check(`${st.name}: the accounts`, JSON.stringify(await accNames(p)) === JSON.stringify(st.accounts), (await accNames(p)).join(' | '));
  const r = await finishWithBill(p, 'Rent', 1200);
  check(`…the bills step opens ${st.bills}`, r.sec === st.bills, r.sec);
  check('…the first payday\'s transfers', JSON.stringify(r.preview) === JSON.stringify(st.transfers), JSON.stringify(r.preview));
  const c = await LS(p, K.cfg);
  check('…saved as expected', st.saved(c), JSON.stringify(c.accounts));
  const onPay = (await steps(p)).map(t => t.replace(/ \((Alex|Sam|Kit)\)/g, ''));
  check('…the Pay tab has the same transfers', JSON.stringify(onPay) === JSON.stringify(st.noPay ? [] : st.transfers), JSON.stringify(onPay));
  if (st.pay) check('…each share says whose it is', JSON.stringify(await p.$$eval('#steps .note', l => l.map(x => x.textContent))) === JSON.stringify(st.pay), JSON.stringify(await p.$$eval('#steps .note', l => l.map(x => x.textContent))));
  if (st.keeps) check('…the top card says what each person keeps', (await p.$$eval('#heroKeeps span', l => l.map(x => x.textContent.replace(/,$/, '')).join(','))) === st.keeps, await T(p, '#hero'));
  check('No JS errors (' + st.name + ')', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 3. A joint account paid for by two: the Pay tab, ticks and Settings › Accounts ----------
const couple = () => household({ schema: 5, lastVersion: '2.12', payday: { day: 28, weekend: true },
  people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: 2000 }],
  accounts: [{ id: 'A', name: 'Alex current', colour: 'blue', leftoverTo: null }, { id: 'S', name: 'Sam current', colour: 'teal', leftoverTo: null },
    { id: 'J', name: 'Joint bills', colour: 'purple', leftoverTo: null, funding: { people: ['alex', 'sam'], rule: 'pay' } }],
  bills: [{ id: 'b1', name: 'Mortgage', amount: 1200, account: 'J', months: [] }, { id: 'b2', name: 'Energy', amount: 150, account: 'J', months: [] }, { id: 'b3', name: 'Car loan', amount: 250, account: 'A', months: [] }] });
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: couple() } }));
check('Pay tab: each share is a transfer, first, from each pay account', JSON.stringify(await steps(p)) === JSON.stringify(['Alex current (Alex) → Joint bills £810.00', 'Sam current (Sam) → Joint bills £540.00']), JSON.stringify(await steps(p)));
check('…with whose share it is', JSON.stringify(await p.$$eval('#steps .note', l => l.map(x => x.textContent))) === JSON.stringify(["Alex's share (60%)", "Sam's share (40%)"]));
check('…and the top card says what each keeps', (await T(p, '#heroKeeps')).replace(/\s+/g, ' ') === 'Alex keeps £1,940.00, Sam keeps £1,460.00', await T(p, '#heroKeeps'));
await p.click('#steps .step >> nth=0 >> .tick'); await p.waitForTimeout(900);
const m = await LS(p, K.mon);
check('Ticking a share saves it under its own id', m['2026-11'] && m['2026-11'].done['c:alex>J'] === 810, JSON.stringify(m));
await openDetails(p);
check('This month in detail: shares going out and coming in', (await T(p, '#floatRows_A')).includes('To Joint bills (Alex\'s share)') && (await T(p, '#floatRows_J')).includes("Sam's share"));
check('No axe violations (Pay)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.waitForTimeout(100);
check('Settings › Accounts: "Paid for by" is open on the joint account and says who and how', await p.$eval('#acf_J', d => d.open) && (await p.textContent('#acf_J summary')).includes('Alex and Sam share its costs, in proportion to pay.'));
check('…and closed on accounts nobody pays into', !(await p.$eval('#acf_A', d => d.open)) && (await p.textContent('#acf_A summary')).includes('Nobody pays into it directly.'));
await p.selectOption('#ac_fr_J', 'equal'); await p.waitForTimeout(100);
check('Changing the split saves it and changes the transfers', (await LS(p, K.cfg)).accounts[2].funding.rule === 'equal' && (await focusId(p)) === 'ac_fr_J');
await p.selectOption('#ac_fk_J_1', 'pct'); await p.fill('#ac_fv_J_1', '20'); await p.waitForTimeout(800);
check('A percentage of pay for one person', JSON.stringify((await LS(p, K.cfg)).accounts[2].funding.set) === JSON.stringify({ sam: { pct: 20 } }));
await p.fill('#ac_fv_J_1', '120'); await p.waitForTimeout(100);
check('…over 100% is marked and not saved', (await p.getAttribute('#ac_fv_J_1', 'aria-invalid')) === 'true');
// Sam's account passes what's left into the joint account: Sam would pay twice.
await p.selectOption('#ac_l_S', 'J'); await p.waitForTimeout(150);
check('Someone whose pay already reaches the account: a warning', (await T(p, '#ac_fprob_J')).startsWith("Sam's pay already reaches Joint bills through Sam current, so they'd pay twice."), await T(p, '#ac_fprob_J'));
await p.selectOption('#ac_l_S', ''); await p.waitForTimeout(150);
await p.uncheck('#ac_fp_J_0'); await p.uncheck('#ac_fp_J_1'); await p.waitForTimeout(150);
check('Unticking everyone removes "Paid for by"', !('funding' in (await LS(p, K.cfg)).accounts[2]));
check('No axe violations (Settings › Accounts)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('No JS errors (Pay and Settings)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 4. Changing how the household manages its money, from a month ----------
const pooled = () => household({ schema: 5, lastVersion: '2.12', payday: { day: 28, weekend: true },
  people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: 2000 }],
  accounts: [{ id: 'A', name: 'Alex current', colour: 'blue', leftoverTo: 'JB' }, { id: 'S', name: 'Sam current', colour: 'teal', leftoverTo: 'JB' },
    { id: 'JB', name: 'Joint bills', colour: 'purple', leftoverTo: 'JS' }, { id: 'JS', name: 'Joint spending', colour: 'orange', leftoverTo: null }],
  bills: [{ id: 'b1', name: 'Mortgage', amount: 1200, account: 'JB', months: [] }], budgets: [{ id: 'g1', name: 'Food', amount: 500, account: 'JS' }] });
const MON = { '2026-11': { pay: { alex: 3000, sam: 2000 }, done: { 't:A>JB': 3000 } } };
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: pooled(), [K.mon]: MON } }));
const nov = await steps(p);
await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.waitForTimeout(100);
check('Settings › Accounts: "How you manage your money", with a way to change it', (await T(p, '#acMoney')).includes('Change how you manage your money from a month you choose.') && await p.isVisible('#ac_change'));
await p.click('#ac_change'); await p.waitForTimeout(100);
check('Change: the questions, in place, step 1 of 2, with the title focused', (await p.textContent('#suTitle')) === 'Change how you manage your money' && (await focusId(p)) === 'suTitle' && (await T(p, '#chBox')).includes('Step 1 of 2') && (await p.$('#su_back')) === null);
await p.check('#su_style_contribute'); await p.check('#su_rule_pay'); await p.waitForTimeout(80);
// 2.13: a household with joint bills and joint spending starts on two joint accounts; this test is about one.
check('2.13: "separate joint accounts?" starts on Yes for a household that has both', await p.isChecked('#su_two_yes'));
await p.check('#su_two_no'); await p.waitForTimeout(80);
check('…no spending-money question and no income to move (those are in Settings)', (await p.$('#su_fun_no')) === null && (await p.$('#su_ia_0')) === null);
check('…headings sit under Settings\' own: an h3 title, h4 cards', await p.$eval('#suTitle', e => e.tagName) === 'H3' && await p.$eval('#su_h_move', e => e.tagName) === 'H4');
check('…the household\'s own accounts are kept, with their names', JSON.stringify(await p.$$eval('#chBox .su-acct input[id^=su_a_]', l => l.map(x => x.value))) === JSON.stringify(['Alex current', 'Sam current', 'Joint bills']));
check('No axe violations (change, step 1)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#su_next'); await p.waitForTimeout(100);
check('Step 2: when it starts, the next pay month by default', (await p.textContent('#suTitle')) === 'When does the change start?' && (await p.inputValue('#ch_from')) === '2026-12');
await p.selectOption('#ch_from', '2026-11'); await p.waitForTimeout(80);
check('…a month with ticks says so', (await T(p, '#ch_ticked')) === 'November 2026 already has transfers ticked. The ticks stay, but the transfers may change.');
await p.selectOption('#ch_from', '2027-01'); await p.waitForTimeout(80);
check('…an account that closes asks where its bills go; earlier months keep them where they were', (await T(p, '#chBox')).includes('Joint spending closes. Move its bills, budgets and savings to') && (await p.inputValue('#ch_mv_0')) === 'JB' && (await T(p, '#chBox')).includes('Months before January 2027 keep them where they were.'));
await p.click('#su_back'); await p.waitForTimeout(80);
check('Back goes to the questions, with the answers kept (never to setup\'s last step)', (await p.textContent('#suTitle')) === 'Change how you manage your money' && await p.isChecked('#su_rule_pay') && (await p.$('#su_finish')) === null);
await p.click('#su_next'); await p.waitForTimeout(80);
check('…and Next comes back to the month chosen', (await p.inputValue('#ch_from')) === '2027-01');
check('No axe violations (change, step 2)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#ch_go'); await p.waitForTimeout(200);
let c = await LS(p, K.cfg);
check('Saved: the change from January, the closed account, the moved budget', JSON.stringify(c.flows.map(f => f.from)) === '["2027-01"]' && c.accounts[3].closedFrom === '2027-01' && c.budgets[0].account === 'JB' && c.accounts[2].funding.rule === 'pay');
check('…Undo is offered, and Settings says when it changes', await p.isVisible('#undoBar') && (await T(p, '#acMoney')).includes('Changes from January 2027.'));
check('…the closed account says so', (await T(p, '#ac_closed_JS')) === 'Closed from Jan 2027' || (await T(p, '#ac_closed_JS')) === 'Closed from January 2027', await T(p, '#ac_closed_JS'));
await p.click('#t-pay'); await p.waitForTimeout(150);
const novAfter = await steps(p);
check('November keeps exactly the transfers it had, the budget still in Joint spending', JSON.stringify(novAfter) === JSON.stringify(nov), JSON.stringify([nov, novAfter]));
await p.click('#next'); await p.click('#next'); await p.waitForTimeout(150);
check('January has the shares by pay', (await T(p, '#monthLabel')) === 'January 2027' && JSON.stringify(await steps(p)) === JSON.stringify(['Alex current (Alex) → Joint bills £1,020.00', 'Sam current (Sam) → Joint bills £680.00']), JSON.stringify(await steps(p)));
await p.click('#t-settings'); await p.waitForTimeout(100);
await p.click('#ac_undoChange'); await p.waitForTimeout(80);
check('"Undo the change" asks first', (await T(p, '#ac_undoChange')) === 'Undo it: every month goes back to how it was' && (await focusId(p)) === 'ac_undoChange');
await p.click('#ac_undoChange'); await p.waitForTimeout(150);
c = await LS(p, K.cfg);
check('…then every month goes back: the settings are as they were', JSON.stringify(c.accounts) === JSON.stringify(pooled().accounts) && JSON.stringify(c.budgets) === JSON.stringify(pooled().budgets) && !('flows' in c), JSON.stringify(c.accounts));
check('No JS errors (change)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Undo straight after, and Cancel.
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: pooled(), [K.mon]: MON } }));
await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.click('#ac_change'); await p.waitForTimeout(80);
await p.click('#ch_cancel'); await p.waitForTimeout(80);
check('Cancel leaves everything as it was', (await p.$('#chBox')) === null && (await focusId(p)) === 'ac_change' && !('flows' in (await LS(p, K.cfg))));
await p.click('#ac_change'); await p.check('#su_style_separate'); await p.click('#su_next'); await p.waitForTimeout(80);
await p.click('#ch_go'); await p.waitForTimeout(150);
check('Each paying certain bills: both joint accounts close from December', JSON.stringify((await LS(p, K.cfg)).accounts.map(a => a.closedFrom || '')) === JSON.stringify(['', '', '2026-12', '2026-12']));
await p.click('#undoBtn'); await p.waitForTimeout(150);
c = await LS(p, K.cfg);
check('Undo on the bar puts it all back', JSON.stringify(c.accounts) === JSON.stringify(pooled().accounts) && !('flows' in c), JSON.stringify(c.accounts));
check('No JS errors (cancel and undo)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Dark, 360px, larger text: the change flow fits.
const d = pooled(); d.appearance = { theme: 'dark', textSize: 'large' };
({ ctx, p } = await session({ today: TODAY, w: 360, dark: true, storage: { [K.cfg]: d } }));
await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.click('#ac_change'); await p.check('#su_style_housekeeping'); await p.check('#su_payer_0'); await p.check('#su_rule_set'); await p.waitForTimeout(80);
check('Dark, 360px, larger text: step 1 fits', await noSideScroll(p, 360));
check('No axe violations (change, dark, larger text)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('2.12.1: no set amount for the bill payer (Alex), only for Sam', !(await p.$('#su_set_0')) && await p.isVisible('#su_set_1'));
await p.fill('#su_set_1', '500'); await p.click('#su_next'); await p.waitForTimeout(80);
check('…and step 2', await noSideScroll(p, 360) && (await axe(p)).length === 0);
check('No JS errors (dark change)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 5. Dated edits (stage 4): a change in Settings applies from this pay month; earlier months keep theirs ----------
const withHistory = () => { const c = couple(); c.budgets = [{ id: 'g1', name: 'Food', amount: 400, account: 'J' }]; return c; };
const HIST = { '2026-10': { pay: { alex: 3000, sam: 2000 }, done: {} } };
const octNov = async p => { await p.click('#t-pay'); await p.waitForTimeout(100); const nov = await steps(p); await p.click('#prev'); await p.waitForTimeout(120); const oct = await steps(p); await p.click('#next'); await p.waitForTimeout(80); return { oct, nov }; };
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: withHistory(), [K.mon]: HIST } }));
const base = await octNov(p);
await p.click('#t-settings'); await p.click('#sBills summary'); await p.waitForTimeout(100);
await p.click('#bill_b1 > button'); await p.waitForTimeout(80);
check('Before any change, no dated line', await p.isHidden('#bd_b1'));
await p.fill('#ba_b1', '1300'); await p.waitForTimeout(150);
check('A new price: "Changed from November 2026. Earlier months keep £1,200.00."', (await T(p, '#bd_b1')).startsWith('Changed from November 2026. Earlier months keep £1,200.00.') && await p.isVisible('#bd_b1_all'), await T(p, '#bd_b1'));
await p.waitForTimeout(700);
let on = await octNov(p);
check('…October keeps its transfers; November has the new price', JSON.stringify(on.oct) === JSON.stringify(base.oct) && on.nov[0] !== base.nov[0], JSON.stringify([base, on]));
await p.click('#t-settings'); await p.waitForTimeout(100);
await p.click('#bd_b1_all'); await p.waitForTimeout(150);
check('"Change earlier months too": the line goes', (await LS(p, K.cfg)).bills[0].was === undefined && await p.isHidden('#bd_b1'));
on = await octNov(p);
check('…and October has the new price too', on.oct[0] !== base.oct[0] && on.oct[0] === on.nov[0], JSON.stringify(on));
await p.click('#t-settings'); await p.waitForTimeout(100);
check('No axe violations (Bills, dated)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
// Delete a bill: still in October; Undo puts it back.
await p.click('#bill_b2 > button'); await p.waitForTimeout(80);
await p.locator('#bill_b2 .btn.danger').click(); await p.waitForTimeout(60); await p.locator('#bill_b2 .btn.danger').click(); await p.waitForTimeout(150);
let cc = await LS(p, K.cfg);
check('A deleted bill is kept for earlier months', cc.bills.every(b => b.id !== 'b2') && cc.ended && cc.ended.bills[0].id === 'b2' && cc.ended.bills[0].ended === '2026-11');
await p.click('#undoBtn'); await p.waitForTimeout(150); cc = await LS(p, K.cfg);
check('…Undo puts it back', cc.bills.some(b => b.id === 'b2') && !cc.ended);
// A new budget starts this month.
await p.click('#sBudget summary'); await p.waitForTimeout(80); await p.click('#setBudget > .linkbtn'); await p.waitForTimeout(120);
cc = await LS(p, K.cfg); const nb = cc.budgets[cc.budgets.length - 1];
check('A new budget starts this pay month, and says so', nb.start === '2026-11' && (await T(p, '#bu_d_' + nb.id)).startsWith('New from November 2026'), await T(p, '#bu_d_' + nb.id));
await p.click('#bu_d_' + nb.id + '_all'); await p.waitForTimeout(120);
check('…"Add it to earlier months too"', !('start' in (await LS(p, K.cfg)).budgets[cc.budgets.length - 1]));
// Deleting an account closes it from this pay month.
await p.click('#sAccounts summary'); await p.waitForTimeout(80);
await p.locator('#acct_A .btn.danger').click(); await p.waitForTimeout(80);
check('With months saved, "Delete account…" closes it from this pay month, and says so', (await T(p, '#ac_del_go_A')) === 'Close Alex current' && (await T(p, '#acct_A')).includes('It closes from November 2026. Earlier months keep it.'));
await p.selectOption('#ac_mv_A', 'S'); await p.click('#ac_del_go_A'); await p.waitForTimeout(150);
cc = await LS(p, K.cfg);
check('Deleting an account with months saved closes it from this pay month instead', cc.accounts.find(a => a.id === 'A').closedFrom === '2026-11' && cc.people[0].payAccount === 'S' && cc.bills.find(b => b.id === 'b3').account === 'S');
on = await octNov(p);
check('…October still has it', on.oct.some(t => t.startsWith('Alex current')) && !on.nov.some(t => t.startsWith('Alex current')), JSON.stringify(on));
await p.click('#t-settings'); await p.waitForTimeout(100);
check('A closed account has no Delete, and isn\'t offered to move things to', !(await p.$('#acct_A .btn.danger')) && await (async () => { await p.locator('#acct_S .btn.danger').click(); await p.waitForTimeout(80);
  return !(await p.$$eval('#ac_mv_S option', o => o.map(x => x.value))).includes('A'); })());
await p.click('#acct_S .btn.ghost'); await p.waitForTimeout(80);
// An account added by mistake and deleted straight away goes for good.
await p.click('#setAccounts > .linkbtn'); await p.waitForTimeout(120);
const added = (await LS(p, K.cfg)).accounts.slice(-1)[0].id;
await p.locator('#acct_' + added + ' .btn.danger').click(); await p.waitForTimeout(80);
check('…an account nothing has used is deleted, not closed', (await T(p, '#ac_del_go_' + added)).startsWith('Delete'));
await p.click('#ac_del_go_' + added); await p.waitForTimeout(150);
check('…and it\'s gone', !(await LS(p, K.cfg)).accounts.some(a => a.id === added) && (await LS(p, K.cfg)).flows.length === 1);
check('No JS errors (dated edits)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// No saved months yet: edits change every month, with no dated line (as before 2.12).
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: withHistory() } }));
await p.click('#t-settings'); await p.click('#sBills summary'); await p.click('#bill_b1 > button'); await p.waitForTimeout(80);
await p.fill('#ba_b1', '1300'); await p.waitForTimeout(800);
check('Without saved months: no dated line, nothing kept', await p.isHidden('#bd_b1') && (await LS(p, K.cfg)).bills[0].was === undefined);
await p.click('#sAccounts summary'); await p.waitForTimeout(80);
await p.locator('#acct_A .btn.danger').click(); await p.waitForTimeout(80); await p.click('#ac_del_go_A'); await p.waitForTimeout(150);
check('…and deleting an account deletes it', !(await LS(p, K.cfg)).accounts.some(a => a.id === 'A'));
check('No JS errors (no history)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2.13: the preview names a short account, as the Pay tab does (stock take, user.md S1) ----------
// Alex £2,600 and Sam £1,900, each paying a set amount (£800 and £600) into a joint account that costs £1,850: the joint
// account is £450 short, though there's £2,650 left in total.
async function setAmountsPreview(p) {
  await toStep4(p, [['Alex', '2600'], ['Sam', '1900']]);
  await p.check('#su_style_contribute'); await p.check('#su_rule_set'); await p.waitForTimeout(50);
  await p.fill('#su_set_0', '800'); await p.fill('#su_set_1', '600');
  await p.click('#su_next'); await p.waitForTimeout(60);
  await p.fill('#setup .su-bsec .qa-row input[id$="_0_n"]', 'Mortgage'); await p.fill('#setup .su-bsec .qa-row input[id$="_0_a"]', '1350');
  await p.click('#su_next'); await p.waitForTimeout(60);
  await p.fill('#su_g_0_n', 'Food shopping'); await p.fill('#su_g_0_a', '500');
  await p.click('#su_next'); await p.waitForTimeout(80);
}
({ ctx, p } = await session({ today: TODAY }));
await setAmountsPreview(p);
check('Preview: the total left over is still the headline', (await p.textContent('#su_left .hv')) === '£2,650.00' && !(await p.$eval('#su_left', e => e.classList.contains('neg'))));
check('…and the short joint account is named in the Pay tab\'s words, above "Looks right, start"', JSON.stringify(await p.$$eval('#su_left .hwarn', l => l.map(x => x.textContent))) === JSON.stringify(['Joint account is short by £450.00']) &&
  await p.$eval('#su_left .hwarn', e => !!(e.compareDocumentPosition(document.getElementById('su_finish')) & 4)), await T(p, '#su_left'));
check('…in the hero\'s weight and colour, not small grey text', await p.$eval('#su_left .hwarn', e => { const s = getComputedStyle(e), h = document.createElement('div'); h.style.color = 'var(--bad)'; document.body.appendChild(h); const bad = getComputedStyle(h).color; h.remove();
  return s.fontWeight === '600' && s.color === bad && !e.classList.contains('muted'); }));
check('…with what can be done about it', (await T(p, '#su_short')) === 'You can raise the set amounts, trim a budget or a bill, or carry on and adjust later.', await T(p, '#su_short'));
check('No axe violations (preview, short joint account)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#su_finish'); await p.waitForTimeout(250); await skipTour(p);
check('The Pay tab says the same', (await T(p, '#hero')).includes('Joint account is short by £450.00') && (await p.textContent('#heroFloat')) === '£2,650.00', await T(p, '#hero'));
check('No JS errors (preview, short)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
({ ctx, p } = await session({ today: TODAY, w: 360, dark: true }));
await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
await setAmountsPreview(p);
check('Preview, dark, 360px, larger text: the warning fits with no sideways scrolling', await p.isVisible('#su_left .hwarn') && await noSideScroll(p, 360));
check('No axe violations (preview, dark, larger text)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await ctx.close();
// Someone with no usual pay has no pay of their own: not pay that "isn't in yet" (user.md S7).
({ ctx, p } = await session({ today: TODAY }));
await toStep4(p, [['Alex', '3000'], ['Sam', '']]);
await p.check('#su_style_contribute'); await p.waitForTimeout(60);
check('With one earner, how to split isn\'t asked (2.13)', !(await p.$('#su_rule_equal')));
await p.check('#su_gets_1_yes'); await p.fill('#su_getsv_1', '300');
await p.click('#su_next'); await p.waitForTimeout(60);
await p.fill('#setup .su-bsec .qa-row input[id$="_0_n"]', 'Rent'); await p.fill('#setup .su-bsec .qa-row input[id$="_0_a"]', '1200');
await p.click('#su_next'); await p.waitForTimeout(40); await p.click('#su_skip'); await p.waitForTimeout(80);
const card7 = await T(p, '#setup');
check('Preview: "Sam has no pay of their own, so it counts as £0."', card7.includes('Sam has no pay of their own, so it counts as £0.') && !card7.includes("isn't in yet"), card7.slice(0, 400));
check('No JS errors (preview, no pay)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 6. 2.13: a change of style keeps the household's own accounts, whatever order the answers come in ----------
{
  ({ ctx, p } = await session({ today: TODAY, storage: sampleStorage() }));
  const before = await LS(p, K.cfg), names4 = ['Current account 1', 'Current account 2', 'Joint bills account', 'Joint spending account'];
  const chNames = () => p.$$eval('#chBox .su-acct input[id^=su_a_]', l => l.map(x => x.value));
  await skipTour(p); await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.click('#ac_change'); await p.waitForTimeout(100);
  await p.check('#su_style_contribute'); await p.waitForTimeout(80);
  check('2.13: joint bills and joint spending: "separate joint accounts?" starts on Yes, and all four accounts are kept', await p.isChecked('#su_two_yes') && JSON.stringify(await chNames()) === JSON.stringify(names4), JSON.stringify(await chNames()));
  await p.check('#su_two_no'); await p.waitForTimeout(80);
  check('…one joint account leaves the spending account out', JSON.stringify(await chNames()) === JSON.stringify(names4.slice(0, 3)), JSON.stringify(await chNames()));
  await p.check('#su_two_yes'); await p.waitForTimeout(80);
  check('…and Yes again brings the household\'s own spending account back (no "Joint spending" twin)', JSON.stringify(await chNames()) === JSON.stringify(names4), JSON.stringify(await chNames()));
  await p.check('#su_style_pool'); await p.check('#su_shape_split'); await p.waitForTimeout(80);
  check('…the arrangement it has now keeps all four too', JSON.stringify(await chNames()) === JSON.stringify(names4), JSON.stringify(await chNames()));
  await p.check('#su_style_contribute'); await p.check('#su_rule_pay'); await p.waitForTimeout(80);
  check('No axe violations (2.13 change, step 1)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
  await p.click('#su_next'); await p.waitForTimeout(100);
  check('Step 2: nothing closes and nothing opens', (await p.$('#ch_h_close')) === null && !(await T(p, '#chBox')).includes('opens then'), await T(p, '#chBox'));
  await p.click('#ch_go'); await p.waitForTimeout(200);
  const c2 = await LS(p, K.cfg);
  check('Saved: the same four accounts by id and name, none closed; budgets and savings stay where they were',
    JSON.stringify(c2.accounts.map(a => [a.id, a.name, a.closedFrom || ''])) === JSON.stringify(before.accounts.map(a => [a.id, a.name, ''])) &&
    JSON.stringify(c2.budgets.map(b => b.account)) === JSON.stringify(before.budgets.map(b => b.account)) && JSON.stringify(c2.savings.map(b => b.fromAccount)) === JSON.stringify(before.savings.map(b => b.fromAccount)) &&
    !!c2.accounts[3].funding && c2.accounts[3].funding.rule === 'pay', JSON.stringify(c2.accounts));
  await p.click('#undoBtn'); await p.waitForTimeout(150);
  const c3 = await LS(p, K.cfg);
  check('…Undo still puts everything back', JSON.stringify(c3.accounts) === JSON.stringify(before.accounts) && JSON.stringify(c3.budgets) === JSON.stringify(before.budgets) && !('flows' in c3), JSON.stringify(c3.accounts));
  check('No JS errors (2.13 change)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 7. 2.13: setup doesn't ask what can't change the result ----------
{
  ({ ctx, p } = await session({ today: TODAY }));
  await toStep4(p, [['Alex', '3000'], ['Sam', '2000']]);
  await p.check('#su_style_contribute'); await p.waitForTimeout(80);
  check('2.13: before the split is chosen, the diagram names no rule and there\'s no worked example', (await T(p, '#su_dia')).includes('Alex and Sam share the costs of Joint account.') && !(await T(p, '#su_dia')).includes('half each') && (await p.$('#su_example_line')) === null, await T(p, '#su_dia'));
  await p.check('#su_rule_equal'); await p.waitForTimeout(80);
  check('…once chosen, it does', (await T(p, '#su_dia')).includes('Alex and Sam share the costs of Joint account, half each.') && (await p.$('#su_example_line')) !== null);
  await ctx.close();

  ({ ctx, p } = await session({ today: TODAY }));
  await toStep4(p, [['Alex', '3200'], ['Sam', '']]);
  await p.check('#su_style_contribute'); await p.waitForTimeout(80);
  check('One earner, each paying into a joint account: how to split it isn\'t asked, and says why', (await p.$('#su_rule_equal')) === null && (await p.$('#su_rule_pay')) === null &&
    (await T(p, '#su_oneearner')) === 'Only Alex has pay of their own, so there\'s nothing to split.', await T(p, '#su_h_move'));
  check('…the diagram says Alex pays what the joint account needs', (await T(p, '#su_dia')).includes('Alex pays what Joint account needs.'), await T(p, '#su_dia'));
  check('…the allowance question is still asked', await p.isVisible('#su_gets_1_no'));
  await p.check('#su_gets_1_yes'); await p.fill('#su_getsv_1', '400'); await p.locator('#su_getsv_1').blur(); await p.waitForTimeout(80);
  check('2.13: the worked example says what Alex\'s account pays out, as the diagram does', (await T(p, '#su_example_line')) === "For example: Alex's pay arrives in Alex's account. Its own bills come out of it, it sends £400.00 to Sam's account and covers what Joint account needs, and what's left stays there.", await T(p, '#su_example_line'));
  check('No axe violations (one earner)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
  await p.click('#su_next'); await p.waitForTimeout(80);
  check('…and Next goes on without a split chosen', (await p.textContent('#suTitle')) === 'Your bills', await T(p, '#su_msg'));
  await p.click('#su_back'); await p.waitForTimeout(80);
  await p.check('#su_style_housekeeping'); await p.check('#su_payer_1'); await p.waitForTimeout(80);
  check('One of us paying the bills, the payer (Sam) with no pay: the split is asked, without "Half each" (2.12.1)', (await p.$('#su_rule_equal')) === null && await p.isVisible('#su_rule_pay') && await p.isVisible('#su_rule_set') && await p.isVisible('#su_nohalf'));
  await p.check('#su_payer_0'); await p.waitForTimeout(80);
  check('…the payer (Alex) is the only earner: not asked', (await p.$('#su_rule_pay')) === null && await p.isVisible('#su_oneearner'));
  await p.check('#su_style_contribute'); await p.waitForTimeout(80);
  const r = await finishWithBill(p, 'Rent', 1000);
  const c = await LS(p, K.cfg), j = byName(c, 'Joint account');
  check('Saved: the joint account is paid for by Alex, by pay (not a rule that reads as an answer)', JSON.stringify(j.funding) === JSON.stringify({ people: [c.people[0].id], rule: 'pay' }) && r.preview.some(x => x.includes('£1,000.00')), JSON.stringify([j.funding, r.preview]));
  check('No JS errors (one earner)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 8. 2.13: Paid for by names everyone ticked, and the "pay twice" warning names everyone it applies to ----------
{
  ({ ctx, p } = await session({ today: TODAY, storage: sampleStorage() }));
  await skipTour(p); await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.waitForTimeout(100);
  if (!(await p.$eval('#acf_jbills', d => d.open))) await p.click('#acf_jbills summary');
  const sum = () => T(p, '#acf_jbills summary span');
  check('2.13: Paid for by, nobody ticked', (await sum()) === 'Nobody pays into it directly.', await sum());
  await p.check('#ac_fp_jbills_0'); await p.waitForTimeout(100);
  check('…Alex ticked: the summary says so', (await sum()) === 'Alex pays what it needs.', await sum());
  check('…and the warning names Alex', (await T(p, '#ac_fprob_jbills')).startsWith("Alex's pay already reaches Joint bills account through Current account 1, so they'd pay twice."), await T(p, '#ac_fprob_jbills'));
  await p.check('#ac_fp_jbills_1'); await p.waitForTimeout(100);
  check('…Alex and Sam ticked: "Alex and Sam share its costs, half each."', (await sum()) === 'Alex and Sam share its costs, half each.', await sum());
  check('…and the warning names both', (await T(p, '#ac_fprob_jbills')).startsWith("Alex's pay already reaches Joint bills account through Current account 1, and Sam's through Current account 2, so they'd pay twice."), await T(p, '#ac_fprob_jbills'));
  check('…and focus stays on the box just ticked', (await p.evaluate(() => document.activeElement.id)) === 'ac_fp_jbills_1');
  check('No axe violations (Paid for by)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
  check('No JS errors (Paid for by)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 9. 2.13: board is board, shares read as the rule chosen ----------
{
  ({ ctx, p } = await session({ today: TODAY }));
  await toStep4(p, [['Alex', '3000'], ['Sam', '2000'], ['Kit', '900']]);
  await p.check('#su_style_pool'); await p.check('#su_shape_own'); await p.check('#su_board_2_yes'); await p.fill('#su_boardv_2', '350'); await p.locator('#su_boardv_2').blur(); await p.waitForTimeout(80);
  check('2.13: pooled with a boarder: no "two left-over amounts" note (a boarder\'s own account isn\'t counted)', (await p.$('#su_roots')) === null);
  check('…the diagram says board, never set amount', (await T(p, '#su_dia')).includes("It pays Kit's board into Joint account.") && (await T(p, '#su_dia')).includes('Kit pays board into Joint account.') && !(await T(p, '#su_dia')).includes('set amount'), await T(p, '#su_dia'));
  await p.check('#su_style_contribute'); await p.check('#su_rule_equal'); await p.waitForTimeout(80);
  await finishWithBill(p, 'Rent', 1850);
  const notes = await p.$$eval('#steps .note', l => l.map(x => x.textContent));
  check('…on the Pay tab, equal shares beside a boarder read "half each" (not 41%), and Kit\'s is board', JSON.stringify(notes) === JSON.stringify(["Alex's share (half each)", "Sam's share (half each)", "Kit's board"]), JSON.stringify(notes));
  await openDetails(p);
  check('…and in the month in detail', (await T(p, '#floatCards')).includes("Kit's board") && !(await T(p, '#floatCards')).includes('set amount'), await T(p, '#floatCards'));
  check('No axe violations (board)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
  check('No JS errors (board)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 11. 2.13: "all" for three or more on the payday step ----------
({ ctx, p } = await session({ today: TODAY }));
await p.click('#su_start');
for (const [i, n] of ['Alex', 'Sam', 'Kit'].entries()) { if (i) await p.click('#su_addp'); await p.fill('#su_p_' + i, n); await p.fill('#su_pu_' + i, '1000'); }
await p.click('#su_next'); await p.waitForTimeout(60);
check('2.13: three people: "Are you all paid on the same day?"', (await T(p, '#setup')).includes('Are you all paid on the same day?'), await p.textContent('#suTitle'));
await ctx.close();

// ---------- 10. 2.13: setup's pay step says what Dovetail works with ----------
for (const dark of [false, true]) {
  ({ ctx, p } = await session({ today: TODAY, w: 360, dark }));
  await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
  await p.click('#su_start'); await p.waitForTimeout(80);
  check(`2.13: the pay step says "Dovetail works with monthly pay, in pounds." (360px, larger text${dark ? ', dark' : ''})`, (await T(p, '#setup')).includes('Dovetail works with monthly pay, in pounds.') && await noSideScroll(p, 360));
  check(`No axe violations (pay step${dark ? ', dark' : ''})`, (await axe(p)).length === 0, (await axe(p)).join(' | '));
  await ctx.close();
}

await finish();
