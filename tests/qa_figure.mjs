// 2.14: the rough figure for an account's bills, pasting a list, and setup's two smaller fixes (docs/onboarding.md 5.1 to
// 5.10): setup's bills step (the two links, the figure box, "No bills from here", the check against what's moved in now,
// the suggestions, the not-every-month card, the preview), pasting a list (in setup and Settings › Bills), the figure
// after setup (Pay, the account's card, Bills by account, Settings › Bills and its questions, Finish setting up,
// Analysis, Words), accounts a figure isn't offered on, the budgets step drawn by account, and keyboard, axe, light and
// dark at 360px. Made-up households only.
import { suite, session, K, LS, T, axe, noSideScroll, walkSetup, SETUP_FILL, skipTour, openDetails, goMonth, PAGE } from './lib.mjs';
import fs from 'fs';
// The version being tested, read from the built page, so a household "already on this version" gets no What's new.
const NEWV = /var VERSION="([\d.]+)"/.exec(fs.readFileSync(PAGE, 'utf8'))[1];
const { check, finish } = suite('2.14: the rough figure and pasting a list');
const TODAY = '2026-10-15';
const focusId = p => p.evaluate(() => document.activeElement && document.activeElement.id);
const txt = (p, s) => T(p, s).then(t => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const shown = (p, s) => p.isVisible(s);
const errs = p => p.errs.length === 0;

// ---------- 1. Setup's bills step: the links, the figure box and its check ----------
let { ctx, p } = await session({ today: TODAY });
await walkSetup(p, 5);
check('Bills step: two links at the top, help behind a third, and no figure box until asked', await shown(p, '#su_paste_open') && (await txt(p, '#su_paste_open')) === 'Paste a list' &&
  (await txt(p, '#su_fig_all')) === 'Not sure of every bill? Start with a rough figure' && (await txt(p, '#su_find')) === 'How do I find my bills?' && !(await p.$('#su_figbox_2')) && !(await p.$('#su_paste')));
check('…each open section has "Not sure you\'ve got them all? Add a rough figure for the rest"', (await txt(p, 'section[aria-labelledby=su_h_b2] .su-figlink')) === "Not sure you've got them all? Add a rough figure for the rest" &&
  (await p.getAttribute('#su_b_2_fig', 'aria-label')) === "Not sure you've got them all? Add a rough figure for the rest of the bills paid from Joint bills");
check('…someone\'s own account is a slim line with its own few suggestions', (await txt(p, '#setup .su-bline:has(#su_b_0_open)')) === "Alex's account — + Add a bill + Mobile phone + Car finance + Car insurance + Gym", await txt(p, '#setup .su-bline:has(#su_b_0_open)'));
check('…no running total before anything is typed', await p.isHidden('#su_b_2_tot'));
await p.focus('#su_b_2_fig'); await p.keyboard.press('Enter'); await p.waitForTimeout(60);
check('The link opens the figure box, by keyboard, with focus on the figure', (await focusId(p)) === 'su_fig_2' && await shown(p, '#su_figbox_2'));
check('…asking in the design\'s words', (await txt(p, '#su_fig_2_l')) === 'Roughly how much goes out of Joint bills in bills each month?' &&
  (await txt(p, '#su_figbox_2')).includes('Count what leaves by itself: direct debits, standing orders and subscriptions. Count Council Tax as monthly. Leave out bills that come only a few times a year; they have their own question below. Food and fuel come later, as spending.') &&
  (await txt(p, '#su_figbox_2')).includes("Round up if you're unsure: anything over stays in the account. You can change it any time.") &&
  (await txt(p, '#su_figbox_2')).includes('Do this together if you can. One of you may know the joint bills better.'));
check('…its help is read with the figure', (await p.getAttribute('#su_fig_2', 'aria-describedby')) === 'su_fig_2_h su_fig_2_r');
check('…"No bills from here" while nothing is listed, the check against what\'s moved in, and the suggestions as "Did your figure include…?"', await shown(p, '#su_fig_2_none') &&
  (await txt(p, 'label[for=su_figin_2]')) === 'Already move a set amount into Joint bills each month? (optional, £)' &&
  (await txt(p, 'section[aria-labelledby=su_h_b2] .su-big')) === 'Add the big ones now if you know them: rent or mortgage, Council Tax, energy. The rest can wait.' &&
  (await p.getAttribute('section[aria-labelledby=su_h_b2] .su-chips', 'aria-labelledby')) === 'su_b_2_cl' && (await txt(p, '#su_b_2_cl')) === 'Did your figure include…?');
check('…and the section\'s link goes while the box is open', !(await p.$('#su_b_2_fig')));
await p.fill('#su_fig_2', '1500'); await p.fill('#su_figin_2', '1700'); await p.press('#su_figin_2', 'Tab'); await p.waitForTimeout(60);
check('Well below what\'s moved in now: asked once', (await txt(p, '#su_figask_2_q')) === 'You move £1,700.00 into Joint bills but put £1,500.00 for bills. Is the other £200.00 for bills too?' &&
  await shown(p, '#su_figask_2_yes') && await shown(p, '#su_figask_2_no') && (await p.getAttribute('#su_figask_2', 'aria-live')) === 'polite');
await p.click('#su_figask_2_yes'); await p.waitForTimeout(60);
check('"Yes, it\'s bills": the figure becomes what\'s moved in, and it isn\'t asked again', (await p.inputValue('#su_fig_2')) === '1700.00' && !(await p.$('#su_figask_2_q')) && (await focusId(p)) === 'su_fig_2');
await p.fill('#su_figin_2', '2500'); await p.press('#su_figin_2', 'Tab'); await p.waitForTimeout(60);
check('…not even when what\'s moved in changes', !(await p.$('#su_figask_2_q')));
await p.click('section[aria-labelledby=su_h_b2] .su-chips button:has-text("Mortgage")'); await p.keyboard.type('925');
check('A suggestion fills a row; the running total counts it as it\'s typed', (await p.inputValue('#su_b_2_0_n')) === 'Mortgage' && (await txt(p, '#su_b_2_tot')) === 'Joint bills: 1 bill, £925.00 a month', await txt(p, '#su_b_2_tot'));
check('…and "No bills from here" goes once something is listed', !(await p.$('#su_fig_2_none')));
await p.fill('#su_b_2_1_n', 'Energy'); await p.fill('#su_b_2_1_a', '1000'); await p.waitForTimeout(40);
check('Listed bills past the figure: said beside it, as it\'s typed', (await txt(p, '#su_fig_2_n')) === 'Your bills here already add up to £1,925.00, more than the £1,700.00 you put. Raise the figure if there are more to come, or leave it out.', await txt(p, '#su_fig_2_n'));
await p.fill('#su_b_2_1_a', '120'); await p.waitForTimeout(40);
check('…and not once they\'re back within it', await p.isHidden('#su_fig_2_n') && (await txt(p, '#su_b_2_tot')) === 'Joint bills: 2 bills, £1,045.00 a month');
// The not-every-month card (5.3)
check('"Any bills that don\'t come every month?" at the end, with its suggestions (no Council Tax) and the renewal letter line',
  (await txt(p, '#su_h_nm')) === "Any bills that don't come every month?" &&
  JSON.stringify(await p.$$eval('#su_nm .su-chips button', l => l.map(b => b.textContent))) === JSON.stringify(['+ Car insurance', '+ TV Licence', '+ Home insurance', '+ Breakdown cover', '+ Boiler cover', '+ Yearly subscriptions', '+ Service charge', '+ Water (if quarterly)']) &&
  (await txt(p, '#su_nm')).includes('Not sure of the month? Add it when the renewal letter comes.'));
await p.click('#su_nm button:has-text("Car insurance")'); await p.waitForTimeout(60);
check('…a suggestion adds a yearly row there, paid from the bills account, with focus on its month', (await p.inputValue('#su_b_2_3_n')) === 'Car insurance' && (await p.inputValue('#su_b_2_3_f')) === 'yearly' &&
  (await focusId(p)) === 'su_b_2_3_m' && (await p.$eval('#su_b_2_3_s', s => s.selectedOptions[0].textContent)) === 'Joint bills' && !(await p.$('section[aria-labelledby=su_h_b2] #su_b_2_3_n')) && !(await shown(p, '#su_nm button[data-name="car insurance"]')));
await p.selectOption('#su_b_2_3_m', '3'); await p.fill('#su_b_2_3_a', '420');
await p.click('#su_nm button:has-text("Water (if quarterly)")'); await p.waitForTimeout(60);
check('…"Water (if quarterly)" is "Some months", its months to pick', (await p.inputValue('#su_b_2_4_n')) === 'Water' && (await p.inputValue('#su_b_2_4_f')) === 'some' && (await focusId(p)) === 'su_b_2_4_a');
await p.selectOption('#su_b_2_4_s', { label: 'Joint spending' }); await p.waitForTimeout(60);
check('…a row can move to the account it\'s paid from (and keeps focus)', (await focusId(p)) === 'su_b_3_0_s' && (await p.inputValue('#su_b_3_0_n')) === 'Water' && !(await p.$('#su_b_2_4_n')) &&
  !(await p.$('section[aria-labelledby=su_h_b3]')));
await p.locator('#su_nm .qa-row', { has: p.locator('#su_b_3_0_n') }).locator('button:has-text("Remove")').click(); await p.waitForTimeout(60);
check('…and Remove takes it away, with focus back on the card\'s suggestions', !(await p.$('#su_b_3_0_n')) && await p.evaluate(() => !!document.activeElement.closest('#su_nm .su-chips')));
// Joint spending: no bills from here
await p.click('#su_b_3_open'); await p.click('#su_b_3_fig'); await p.waitForTimeout(60);
await p.click('#su_fig_3_none'); await p.waitForTimeout(60);
check('"No bills from here": one tap, and the account is a line again, saying so, with focus on its "+ Add a bill"', (await txt(p, '#setup .su-bline:has(#su_b_3_open)')) === 'Joint spending — no bills · + Add a bill' && (await focusId(p)) === 'su_b_3_open');
// A figure that isn't an amount stops Next.
await p.fill('#su_fig_2', 'lots'); await p.click('#su_next'); await p.waitForTimeout(60);
check('A rough figure that isn\'t an amount: Next says so and marks it', (await txt(p, '#su_msg')) === 'Type the rough figure as an amount a month, like 1500.00.' && await p.$eval('#su_fig_2', e => e.classList.contains('bad')) && (await focusId(p)) === 'su_fig_2');
await p.fill('#su_fig_2', '1700');
check('No axe violations (bills step with a figure)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#su_next'); await p.waitForTimeout(60); await SETUP_FILL[6](p); await p.click('#su_next'); await p.waitForTimeout(80);
// Joint bills' bills in November: Mortgage 925 + Energy 120 (car insurance is March), plus 1700 − 1045 not listed yet.
check('Preview: the transfer into Joint bills says what\'s not listed yet', (await txt(p, '#su_fig_note_' + (await p.evaluate(() => document.querySelector('[id^=su_fig_note_]').id.slice(12))))) === 'Includes £655.00 of bills not listed yet.' &&
  (await p.$$('[id^=su_fig_note_]')).length === 1);
const preview = await p.$$eval('#su_transfers li', l => l.map(x => x.textContent.replace(/\s+/g, ' ')));
check('…on the first transfer into it, with its amount worked out with the figure', preview[0].includes("Alex's account") && preview[0].includes('Includes £655.00 of bills not listed yet.') && !preview[1].includes('not listed') && preview[2].includes('to Joint spending£2,250.00'), preview.join(' | '));
await p.click('#su_finish'); await p.waitForTimeout(250); await skipTour(p);
let c = await LS(p, K.cfg);
const jb = c.accounts.find(a => a.name === 'Joint bills').id;
check('Saved: the figure on Joint bills, and the bills as listed', JSON.stringify(c.estimates.map(e => [e.account, e.amount])) === JSON.stringify([[jb, 1700]]) &&
  JSON.stringify(c.bills.filter(b => b.account === jb).map(b => b.name + ':' + b.amount + ':' + JSON.stringify(b.months))) === JSON.stringify(['Mortgage:925:[]', 'Energy:120:[]', 'Car insurance:420:[3]']), JSON.stringify([c.estimates, c.bills]));
check('Finish setting up: "List Joint bills\'s bills (£655.00 to go)"', (await txt(p, '#tip_bills')) === "List Joint bills's bills (£655.00 to go)", await txt(p, '#tip_bills'));
check('No JS errors (setup with a figure)', errs(p), p.errs.join(' | '));
await ctx.close();

// ---------- 2. Start with a rough figure, everywhere; figureNotes; the worked example ----------
({ ctx, p } = await session({ today: TODAY }));
await walkSetup(p, 4); await p.check('#su_style_contribute'); await p.check('#su_rule_equal'); await p.waitForTimeout(60);
await p.click('#su_next'); await p.waitForTimeout(60);
check('Each paying into a joint account: the joint account is open; the top link opens its figure', await shown(p, '#su_fig_all'));
await p.click('#su_fig_all'); await p.waitForTimeout(60);
const figs = await p.$$eval('#setup .su-fig input[id^=su_fig_]:not([id^=su_figin])', l => l.map(x => x.id));
check('…every open section a figure can go in gets one (here, the joint account), with focus on it, and the link goes', figs.length === 1 && (await focusId(p)) === figs[0] && !(await p.$('#su_fig_all')), JSON.stringify(figs));
const ai = figs[0].replace('su_fig_', '');
await p.fill('#' + figs[0], '900'); await p.fill(`#su_b_${ai}_0_n`, 'Rent'); await p.fill(`#su_b_${ai}_0_a`, '1000');
await p.click('#su_back'); await p.waitForTimeout(60);
check('The shares\' worked example uses the larger of the figure and the bills listed', (await txt(p, '#su_example_line')).includes('£1,000.00 of bills'), await txt(p, '#su_example_line'));
await p.click('#su_next'); await p.waitForTimeout(60);
await p.fill('#' + figs[0], '1600'); await p.press('#' + figs[0], 'Tab');
await p.click('#su_back'); await p.waitForTimeout(60);
check('…a figure above the bills: the example uses the figure', (await txt(p, '#su_example_line')).includes('£1,600.00 of bills') && (await txt(p, '#su_example_line')).includes("Alex's share is £800.00"), await txt(p, '#su_example_line'));
await p.click('#su_next'); await p.waitForTimeout(60);
await p.fill('#' + figs[0], '900'); await p.click('#su_next'); await p.click('#su_next'); await p.waitForTimeout(80);
check('A figure already covered by the bills listed: the preview says it isn\'t needed', (await txt(p, '#su_fignotes')) === 'The bills listed for Joint account already come to £1,000.00, so its rough figure of £900.00 isn\'t needed.', await txt(p, '#su_fignotes'));
await p.click('#su_finish'); await p.waitForTimeout(250); await skipTour(p); await p.waitForTimeout(80);
check('…and says so again once setup is finished (after the tour)', (await T(p, '#toast')).includes("so its rough figure of £900.00 isn't needed.") && !(await LS(p, K.cfg)).estimates, await T(p, '#toast'));
await ctx.close();

// ---------- 3. Where a figure isn't offered (5.9) ----------
({ ctx, p } = await session({ today: TODAY }));
await walkSetup(p, 4); await p.check('#su_style_contribute'); await p.check('#su_rule_sameLeft'); await p.waitForTimeout(60);
await p.click('#su_next'); await p.waitForTimeout(60);
await p.click('#su_b_0_open'); await p.waitForTimeout(60);
check('"So we each keep the same": no figure on Alex\'s own account, and setup says why', !(await p.$('#su_b_0_fig')) && (await txt(p, '#su_b_0_nofig')) === 'With this split, list your own bills so the shares are fair.');
check('…the joint account still has the link', await shown(p, 'section.su-bsec #su_b_' + (await p.evaluate(() => document.querySelector('[id$=_fig]').id.split('_')[2])) + '_fig'));
await p.click('#su_fig_all'); await p.waitForTimeout(60);
check('…and "Start with a rough figure" opens only the joint account\'s', !(await p.$('#su_fig_0')) && (await p.$$('#setup .su-fig')).length === 1);
check('No axe violations (a figure not offered)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await ctx.close();

// ---------- 4. Paste a list in setup ----------
({ ctx, p } = await session({ today: TODAY }));
await walkSetup(p, 5, true);
await p.click('#su_paste_open'); await p.waitForTimeout(60);
check('"Paste a list" opens a plain text box, with focus in it', (await focusId(p)) === 'su_paste_text' && (await p.getAttribute('#su_paste_open', 'aria-expanded')) === 'true' && (await txt(p, 'label[for=su_paste_text]')) === 'Your list');
await p.click('#su_paste_read'); await p.waitForTimeout(40);
check('…reading nothing says so', (await txt(p, '#su_paste_msg')) === 'Paste your list into the box first.');
await p.fill('#su_paste_text', ['Bill\tAmount\tAccount', 'Broadband\t32.50\tJoint bills', 'Mortgage\t925', 'Water £41.20 monthly', 'Phone\t18\tSam', 'Boat\t6,500\tBarclays', 'TV Licence yearly 174.50', 'Total 1,234.00 2,000.00', 'nothing here'].join('\n'));
await p.click('#su_paste_read'); await p.waitForTimeout(60);
check('What it found: "Found 6 bills, … a month. N lines need a look." with focus on it', /^Found 6 bills, £[\d,]+\.\d\d a month\. 4 lines need a look\.$/.test(await txt(p, '#su_paste_sum')) && (await focusId(p)) === 'su_paste_sum', await txt(p, '#su_paste_sum'));
const prow = i => p.inputValue(`#su_paste_${i}_n`);
check('…as bill rows to check', JSON.stringify(await Promise.all([0, 1, 2, 3, 4, 5].map(prow))) === JSON.stringify(['Broadband', 'Mortgage', 'Water', 'Phone', 'Boat', 'TV Licence']));
check('…an account named in the list is matched; one it doesn\'t know falls back and is flagged', (await p.$eval('#su_paste_0_s', s => s.selectedOptions[0].textContent)) === 'Joint bills' &&
  (await p.$eval('#su_paste_3_s', s => s.selectedOptions[0].textContent)) === "Sam's account" && (await txt(p, '#su_paste_4_why')).includes('“Barclays” isn\'t one of your accounts, so it\'s paid from Joint bills for now.'));
check('…a bill already there is left unticked; a large amount is flagged', !(await p.isChecked('#su_paste_1_on')) && (await txt(p, '#su_paste_1_why')) === 'Already in your bills, so it isn\'t ticked.' && await p.isChecked('#su_paste_0_on') &&
  (await txt(p, '#su_paste_4_why')).startsWith('A large amount: check it\'s a bill, not a balance.'));
check('…a yearly bill with no month asks for it', (await p.inputValue('#su_paste_5_f')) === 'yearly' && (await p.inputValue('#su_paste_5_m')) === '' && (await txt(p, '#su_paste_5_why')) === 'Once a year: choose the month.');
check('…lines it couldn\'t read are shown as they were pasted', (await txt(p, '#su_paste .su-unread')).includes('Total 1,234.00 2,000.00 (line 8: two amounts, so it isn\'t clear which is the bill)') && (await txt(p, '#su_paste .su-unread')).includes('nothing here (line 9: no amount)'), await txt(p, '#su_paste .su-unread'));
check('No axe violations (paste review)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.uncheck('#su_paste_4_on'); await p.click('#su_paste_add'); await p.waitForTimeout(60);
check('Adding with a yearly bill that has no month: flagged, nothing added', (await txt(p, '#su_paste_msg')).startsWith('Each ticked bill needs a name and an amount') && await p.$eval('#su_paste_5_m', e => e.classList.contains('bad')) && (await focusId(p)) === 'su_paste_5_m');
await p.selectOption('#su_paste_5_m', '6'); await p.click('#su_paste_add'); await p.waitForTimeout(80);
const names = sec => p.$$eval(`section[aria-labelledby=${sec}] .qa-row input[id$="_n"]`, l => l.map(x => x.value).filter(Boolean));
check('…then the ticked bills go into their accounts\' sections, and the box closes', !(await p.$('#su_paste')) && (await focusId(p)) === 'su_paste_open' &&
  JSON.stringify(await names('su_h_b2')) === JSON.stringify(['Mortgage', 'Council Tax', 'Car insurance', 'Broadband', 'Water', 'TV Licence']) && JSON.stringify(await names('su_h_b1')) === JSON.stringify(['Phone']), JSON.stringify([await names('su_h_b2'), await names('su_h_b1')]));
check('…saying how many', (await T(p, '#toast')) === 'Added 4 bills');
check('No JS errors (paste in setup)', errs(p), p.errs.join(' | '));
await ctx.close();

// ---------- 5. The budgets and savings step, by account (5.10) ----------
({ ctx, p } = await session({ today: TODAY }));
await walkSetup(p, 4); await p.check('#su_style_contribute'); await p.check('#su_rule_equal'); await p.waitForTimeout(60);
await p.click('#su_next'); await p.waitForTimeout(60); await p.click('#su_next'); await p.waitForTimeout(60);
const groups = await p.$$eval('section[aria-labelledby=su_h_g] [data-acct]', l => l.map(e => (e.classList.contains('su-bline') ? 'line:' : 'open:') + e.querySelector('b,h3').textContent));
check('Budgets are drawn by account: kept in the joint account (open), and a line for each person\'s own', JSON.stringify(groups) === JSON.stringify(["line:Kept in Alex's account", "line:Kept in Sam's account", 'open:Kept in Joint account']), JSON.stringify(groups));
check('…with no account to choose on a row', !(await p.$('#su_g_0_s')) && !(await p.$('#su_v_0_s')));
check('…and "Alex\'s spending money" on Alex\'s line (they pay into a joint account)', await shown(p, '[data-acct="Alex\'s account"] button[data-name="alex\'s spending money"]') && !(await p.$('section[aria-labelledby=su_h_v] button[data-name="alex\'s spending money"]')));
await p.click('[data-acct="Alex\'s account"] button[data-name="alex\'s spending money"]'); await p.waitForTimeout(60);
check('…a tap opens Alex\'s budgets with it filled in, focus on its amount', (await p.inputValue('#su_g_1_n')) === "Alex's spending money" && (await focusId(p)) === 'su_g_1_a' &&
  (await p.$eval('#su_g_1_n', e => e.closest('[data-acct]').getAttribute('data-acct'))) === "Alex's account" && (await txt(p, '#su_h_g_0')) === "Kept in Alex's account");
await p.keyboard.type('150'); await p.click('#su_addv_0'); await p.waitForTimeout(60);
check('A savings transfer added on Alex\'s line is sent from Alex\'s account', (await focusId(p)) === 'su_v_1_n' && (await p.$eval('#su_v_1_n', e => e.closest('[data-acct]').getAttribute('data-acct'))) === "Alex's account");
await p.fill('#su_v_1_n', 'ISA'); await p.fill('#su_v_1_a', '50');
check('No axe violations (budgets by account)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#su_next'); await p.waitForTimeout(60); await p.click('#su_finish'); await p.waitForTimeout(250); await skipTour(p);
c = await LS(p, K.cfg);
const acc = n => c.accounts.find(a => a.name === n).id;
check('Saved where they were typed', c.budgets.length === 1 && c.budgets[0].name === "Alex's spending money" && c.budgets[0].account === acc("Alex's account") && c.savings[0].fromAccount === acc("Alex's account"), JSON.stringify([c.budgets, c.savings]));
await ctx.close();

// ---------- 6. After setup: where the figure shows, and its questions ----------
const HH = () => ({ schema: 5, setupDone: true, lastVersion: NEWV, setupTips: true,
  people: [{ id: 'alex', name: 'Alex', payAccount: 'a1', usualPay: 2000 }, { id: 'sam', name: 'Sam', payAccount: 'a2', usualPay: 2000 }],
  accounts: [{ id: 'a1', name: "Alex's account", colour: 'blue', leftoverTo: null }, { id: 'a2', name: "Sam's account", colour: 'teal', leftoverTo: null },
    { id: 'j', name: 'Joint', colour: 'purple', leftoverTo: null, funding: { people: ['alex', 'sam'], rule: 'equal' } }],
  bills: [{ id: 'b1', name: 'Mortgage', amount: 900, account: 'j', months: [] }, { id: 'b2', name: 'Energy', amount: 120, account: 'j', months: [] }, { id: 'b3', name: 'Gym', amount: 30, account: 'j', months: [] }],
  estimates: [{ id: 'e1', account: 'j', amount: 1500 }], income: [], budgets: [], savings: [], reminders: [], doneLog: [], payday: { day: 28, weekend: true } });
({ ctx, p } = await session({ today: TODAY, w: 360, storage: { [K.cfg]: HH() } }));
check('Pay: under the transfer into Joint, "Includes £450.00 of bills not listed yet." (once)', (await txt(p, '#figNote_j')) === 'Includes £450.00 of bills not listed yet.' && (await p.$$('#steps [id^=figNote_]')).length === 1 && await p.isHidden('#figNote'));
check('…the shares are worked out with the figure', JSON.stringify(await p.$$eval('#steps .amt', l => l.map(x => x.textContent))) === JSON.stringify(['£750.00', '£750.00']));
check('Finish setting up: "List Joint\'s bills (£450.00 to go)"', (await txt(p, '#tip_bills')) === "List Joint's bills (£450.00 to go)");
await openDetails(p);
check('This month in detail: Joint\'s card has "Bills not listed yet − £450.00"', /Bills not listed yet\s*− £450\.00/.test(await T(p, '#floatRows_j')), await T(p, '#floatRows_j'));
await p.click('#accounts summary'); await p.waitForTimeout(60);
check('Bills by account: "Joint: £1,050.00 listed · £450.00 not listed yet (your figure £1,500.00)", with a bar, and the total with it', (await txt(p, '#bba_j_t')) === 'Joint: £1,050.00 listed · £450.00 not listed yet (your figure £1,500.00)' &&
  (await p.getAttribute('#bba_j .figbar', 'aria-hidden')) === 'true' && (await txt(p, '#acctList')).includes('Joint £1,500.00'));
check('No axe violations (Pay with a figure, 360px)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('…and nothing scrolls sideways', await noSideScroll(p, 360));
await p.click('#tip_bills'); await p.waitForTimeout(150);
check('The checklist item opens Settings › Bills', await p.$eval('#sBills', d => d.open));
check('Settings › Bills: the same line, what adding bills does, the quiet line, and the buttons', (await txt(p, '#bf_j_line_t')) === 'Joint: £1,050.00 listed · £450.00 not listed yet (your figure £1,500.00)' &&
  (await txt(p, '#bf_j')).includes("Adding bills won't change your transfers until they go past your figure.") && (await txt(p, '#bf_j')).includes('If Joint ran short before payday, the figure may be low.') &&
  (await txt(p, '#bf_j_paste')) === 'Paste a list' && (await txt(p, '#bf_j_change')) === 'Change the figure' && (await txt(p, '#bf_j_end')) === "That's all of them" && await shown(p, '#billAdd_j'));
check('…and on accounts without one, a way to add one', (await txt(p, '#bf_a1_new')) === "Not sure you've got them all? Add a rough figure" && !(await p.$('#bf_j_new')));
// Deleting a bill inside the figure
await p.click('#bill_b3 > button'); await p.click('#bill_b3 [data-confirm]'); await p.click('#bill_b3 [data-confirm]'); await p.waitForTimeout(100);
check('Deleting Gym: "Gym deleted. Lower Joint\'s figure by £30.00 too?" with Lower it and Keep it', (await txt(p, '#bf_j_offer_t')) === "Gym deleted. Lower Joint's figure by £30.00 too?" && await shown(p, '#bf_j_lower') && await shown(p, '#bf_j_keep') && !(await p.isHidden('#undoBar')));
await p.click('#bf_j_lower'); await p.waitForTimeout(100);
check('"Lower it": the figure is £1,470.00, said with a Change link', (await LS(p, K.cfg)).estimates[0].amount === 1470 && (await txt(p, '#bf_j_msg')).startsWith("Joint's figure is now £1,470.00.") && (await focusId(p)) === 'bf_j_msgc');
// A price rise inside the figure
await p.click('#bill_b2 > button'); await p.fill('#ba_b2', '140'); await p.press('#ba_b2', 'Tab'); await p.waitForTimeout(100);
check('A price rise inside the figure: "Energy now £140.00. Joint\'s transfer doesn\'t change: it comes out of the £450.00 not listed yet."', (await T(p, '#toast')) === "Energy now £140.00. Joint's transfer doesn't change: it comes out of the £450.00 not listed yet.", await T(p, '#toast'));
// Past the figure
await p.click('#bill_b1 > button'); await p.fill('#ba_b1', '1400'); await p.press('#ba_b1', 'Tab'); await p.waitForTimeout(100);
check('Past the figure: asked once, "Your bills now add up to £1,540.00, more than the £1,470.00 you put. Is that all of them?"', (await txt(p, '#bf_j_q_t')) === 'Your bills now add up to £1,540.00, more than the £1,470.00 you put. Is that all of them?' &&
  (await txt(p, '#bf_j_qall')) === "That's all of them" && (await txt(p, '#bf_j_qmore')) === 'There are more' && (await txt(p, '#bf_j_line_t')) === 'Joint: £1,540.00 listed, more than your figure of £1,470.00');
await p.click('#bf_j_qmore'); await p.waitForTimeout(100);
check('"There are more": the figure goes to the next £50, "Joint\'s figure is now £1,550.00. Change"', (await LS(p, K.cfg)).estimates[0].amount === 1550 && (await txt(p, '#bf_j_msg')) === "Joint's figure is now £1,550.00. Change" && !(await p.$('#bf_j_q')));
await p.click('#bf_j_msgc'); await p.waitForTimeout(80);
check('…Change opens the figure, focused', (await focusId(p)) === 'bf_j_amt' && (await p.inputValue('#bf_j_amt')) === '1550.00');
await p.fill('#bf_j_amt', '1600'); await p.click('#bf_j_save'); await p.waitForTimeout(100);
check('Change the figure: saved (no months before this one, so every month changes)', (await LS(p, K.cfg)).estimates[0].amount === 1600 && !(await LS(p, K.cfg)).estimates[0].was && (await focusId(p)) === 'bf_j_change' && (await T(p, '#toast')) === "Joint's figure is now £1,600.00.");
check('No axe violations (Settings › Bills with a figure)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('No JS errors (after setup)', errs(p), p.errs.join(' | '));
await ctx.close();

// Deleting a bill, "Lower it", then Undo: both the bill and the figure come back.
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: HH() } }));
await p.click('#t-settings'); await p.click('#sBills summary'); await p.waitForTimeout(80);
await p.click('#bill_b3 > button'); await p.click('#bill_b3 [data-confirm]'); await p.click('#bill_b3 [data-confirm]'); await p.waitForTimeout(100);
check('The delete offer is said in a live region too (it appears away from focus)', (await p.$eval('#figLive', e => e.getAttribute('aria-live'))) === 'polite' &&
  (await p.waitForFunction(() => document.getElementById('figLive').textContent === "Lower Joint's figure by £30.00 too? Lower it or Keep it, under Joint.", null, { timeout: 2000 }).then(() => true, () => false)));
await p.click('#bf_j_lower'); await p.waitForTimeout(100);
check('"Lower it" gives one Undo for both', (await T(p, '#undoMsg')) === "Gym deleted and Joint's figure lowered to £1,470.00" && (await LS(p, K.cfg)).estimates[0].amount === 1470);
await p.click('#undoBtn'); await p.waitForTimeout(150);
c = await LS(p, K.cfg);
check('…Undo puts back the bill and the figure', c.bills.some(b => b.id === 'b3') && c.estimates[0].amount === 1500 && await p.evaluate(() => document.activeElement.closest('#bill_b3') !== null));
await p.click('#t-pay'); await p.waitForTimeout(80);
check('…so the transfers are as they were (£750.00 each)', JSON.stringify(await p.$$eval('#steps .amt', l => l.map(x => x.textContent))) === JSON.stringify(['£750.00', '£750.00']));
check('No JS errors (Lower it, then Undo)', errs(p), p.errs.join(' | '));
await ctx.close();

// "That's all of them": the good news, and Undo. Analysis and Words.
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: HH() } }));
await p.click('#t-analysis'); await p.waitForTimeout(150);
check('Analysis: "Not listed yet" is its own bar after the categories, hatched, not a category', (await txt(p, '#cat_unlisted')).startsWith('Not listed yet £5,400.00 a year £450.00 a month') && await p.$eval('#cat_unlisted .track i', e => e.classList.contains('hatch')) &&
  (await p.$eval('#anCategories', c => { const r = [...c.querySelectorAll('.catrow')]; return r[r.length - 1].id; })) === 'cat_unlisted' && (await txt(p, '#cat_unlisted')).includes('from your rough figure for Joint'), await txt(p, '#cat_unlisted'));
check('…in the totals', (await txt(p, '#anCategories .lead')) === '£18,000.00 a year on bills, £1,500.00 a month.', await txt(p, '#anCategories .lead'));
await p.click('#anCategories button:has-text("Show the figures")');
check('…and in the figures', (await txt(p, '#anCategoriesTable')).includes('Not listed yet £5,400.00 £450.00 30%'), await txt(p, '#anCategoriesTable'));
check('No axe violations (Analysis with a figure)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#t-settings'); await p.click('#sHelp summary'); await p.click('#helpWords'); await p.waitForTimeout(80);
check('Words Dovetail uses: "Rough figure (bills)"', (await txt(p, '#sheet')).includes("Rough figure (bills) A rough amount for what goes out of an account in bills each month, for when you haven't listed every bill. What it has over the bills you've listed is shown as not listed yet."));
check('Words Dovetail uses: "Board" says what it is, and that it\'s also called keep', (await txt(p, '#sheet')).includes("Board Money someone living with you, like a grown-up child at home, pays towards the household each month. It's also called keep."), (await txt(p, '#sheet')).slice(0, 200));
await p.click('#sheetClose'); await p.click('#helpHow'); await p.waitForTimeout(80);
check('How Dovetail works: one line about it', (await txt(p, '#sheet')).includes("An account can have a rough figure for its bills instead of every bill listed: Dovetail counts the figure until the bills you list go past it, so listing a bill within it doesn't change your transfers."));
await p.click('#sheetClose'); await p.click('#sBills summary'); await p.waitForTimeout(80);
await p.click('#bf_j_end'); await p.waitForTimeout(120);
check('"That\'s all of them": the good news, worked out with the shares', (await txt(p, '#bf_j_msg')) === "All of Joint's bills are in. Your transfers for Joint are exact now. Alex's share goes down by £225.00 a month and Sam's by £225.00." &&
  (await focusId(p)) === 'bf_j_msg' && !(await LS(p, K.cfg)).estimates && (await T(p, '#undoMsg')) === "Joint's rough figure ended", await txt(p, '#bf_j_msg'));
await p.click('#t-pay'); await p.waitForTimeout(80);
check('…the Pay tab is exact now', !(await p.$('#figNote_j')) && JSON.stringify(await p.$$eval('#steps .amt', l => l.map(x => x.textContent))) === JSON.stringify(['£525.00', '£525.00']));
await p.click('#t-settings'); await p.waitForTimeout(80);
await p.click('#undoBtn'); await p.waitForTimeout(120);
check('Undo puts the figure back exactly', JSON.stringify((await LS(p, K.cfg)).estimates) === JSON.stringify([{ id: 'e1', account: 'j', amount: 1500 }]) && !(await p.$('#bf_j_msg')) && await shown(p, '#bf_j_end'));
check('No JS errors (that\'s all of them)', errs(p), p.errs.join(' | '));
await ctx.close();

// Dated: with a month saved before this one, changes apply from this pay month (as bills do).
const HIST = { '2026-09': { month: '2026-09', pay: { alex: 2000, sam: 2000 }, done: {}, oneOffs: [] } };
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: HH(), [K.mon]: HIST } }));
await p.click('#t-settings'); await p.click('#sBills summary'); await p.waitForTimeout(80);
await p.click('#bf_j_change'); await p.fill('#bf_j_amt', '1600'); await p.press('#bf_j_amt', 'Enter'); await p.waitForTimeout(100);
c = await LS(p, K.cfg);
check('Change the figure with a month saved before: dated, "Changed from October 2026. Earlier months keep £1,500.00."', c.estimates[0].amount === 1600 && JSON.stringify(c.estimates[0].was) === JSON.stringify([{ until: '2026-09', amount: 1500, account: 'j' }]) &&
  (await txt(p, '#bf_j_d')) === 'Changed from October 2026. Earlier months keep £1,500.00. Change earlier months too', await txt(p, '#bf_j_d'));
await p.click('#bf_j_d_all'); await p.waitForTimeout(100);
check('…"Change earlier months too" takes the date off', !(await LS(p, K.cfg)).estimates[0].was && await p.isHidden('#bf_j_d'));
await p.click('#bf_j_end'); await p.waitForTimeout(120);
c = await LS(p, K.cfg);
check('"That\'s all of them" from this pay month: earlier months keep the figure, with Undo', !c.estimates && c.ended.estimates.length === 1 && c.ended.estimates[0].ended === '2026-10' && (await T(p, '#undoMsg')) === "Joint's rough figure ended from October 2026");
await p.click('#undoBtn'); await p.waitForTimeout(100);
c = await LS(p, K.cfg);
check('…and Undo puts it back as it was', c.estimates.length === 1 && c.estimates[0].amount === 1600 && !c.ended);
await ctx.close();

// An account whose only use is a rough figure is in use: deleting it, closing it or a change of style that leaves it out
// asks where the figure goes, and moves it there.
const SPARE = () => { const h = HH(); h.accounts.push({ id: 'x', name: 'Spare', colour: 'gold', leftoverTo: null }); h.estimates.push({ id: 'e2', account: 'x', amount: 200 }); return h; };
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: SPARE() } }));
await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.waitForTimeout(80);
check('Settings › Accounts: an account with only a rough figure says it uses it', (await txt(p, '#acct_x')).includes('Uses: its rough figure.'));
await p.locator('#acct_x .btn.danger').click(); await p.waitForTimeout(80);
check('…"Delete account…" asks where it goes (no months saved: deleted)', await shown(p, '#ac_mv_x') && !(await txt(p, '#acct_x')).includes('Nothing uses this account') && (await txt(p, '#ac_del_go_x')) === 'Delete Spare');
await p.selectOption('#ac_mv_x', 'a2'); await p.click('#ac_del_go_x'); await p.waitForTimeout(150);
c = await LS(p, K.cfg);
check('…and the figure goes to the account chosen', !c.accounts.some(a => a.id === 'x') && c.estimates.find(e => e.id === 'e2').account === 'a2', JSON.stringify(c.estimates));
await ctx.close();
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: SPARE(), [K.mon]: HIST } }));
await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.waitForTimeout(80);
await p.locator('#acct_x .btn.danger').click(); await p.waitForTimeout(80);
check('With a month saved before: it closes from this pay month, asking where the figure goes', (await txt(p, '#ac_del_go_x')) === 'Close Spare' && await shown(p, '#ac_mv_x'));
await p.selectOption('#ac_mv_x', 'j'); await p.click('#ac_del_go_x'); await p.waitForTimeout(150);
c = await LS(p, K.cfg);
check('…the figure moves to Joint from then', c.accounts.find(a => a.id === 'x').closedFrom === '2026-10' && c.estimates.find(e => e.id === 'e2').account === 'j', JSON.stringify(c.estimates));
await p.click('#t-pay'); await p.waitForTimeout(80);
check('…and the shares cover it, with nothing left on the closed account', JSON.stringify(await p.$$eval('#steps .amt', l => l.map(x => x.textContent))) === JSON.stringify(['£850.00', '£850.00']) && !(await T(p, '#tab-pay')).includes('Spare'));
check('No JS errors (closing an account with a figure)', errs(p), p.errs.join(' | '));
await ctx.close();
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: SPARE(), [K.mon]: HIST } }));
await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.click('#ac_change'); await p.waitForTimeout(100);
await p.check('#su_style_separate'); await p.waitForTimeout(60); await p.click('#su_next'); await p.waitForTimeout(100);
check('A change of style that leaves it out (each paying certain bills): "Spare closes. Move its bills, budgets, savings and rough figure to"', (await txt(p, '#chBox')).includes('Spare closes. Move its bills, budgets, savings and rough figure to') && !(await txt(p, '#chBox')).includes('Nothing uses it'), await txt(p, '#chBox'));
const mv = await p.$$eval('#chBox select[id^=ch_mv_]', l => l.map(x => x.id));
const spareMv = await p.$eval('#chBox', b => { const l = [...b.querySelectorAll('label')].find(x => x.textContent.startsWith('Spare closes')); return l && l.htmlFor; });
await p.selectOption('#' + spareMv, 'a2'); await p.click('#ch_go'); await p.waitForTimeout(200);
c = await LS(p, K.cfg);
check('…the figure moves to the account chosen from the change', mv.length === 2 && c.estimates.find(e => e.id === 'e2').account === 'a2' && c.accounts.find(a => a.id === 'x').closedFrom === '2026-11', JSON.stringify([c.estimates, c.accounts]));
await p.click('#t-pay'); await p.waitForTimeout(80); await goMonth(p, 'December 2026'); await openDetails(p);
check('…so December has nothing on the closed account, and Sam\'s account carries the figure', !(await T(p, '#tab-pay')).includes('Spare') && /Bills not listed yet\s*− £200\.00/.test(await T(p, '#floatRows_a2')), await T(p, '#floatCards'));
check('No JS errors (a change of style with a figure)', errs(p), p.errs.join(' | '));
await ctx.close();

// A boarder's own account with a figure: its own plain reason.
const BOARD = HH(); BOARD.people.push({ id: 'kit', name: 'Kit', payAccount: 'k', usualPay: 1000, boarder: true }); BOARD.accounts.push({ id: 'k', name: "Kit's account", colour: 'teal', leftoverTo: null });
BOARD.accounts[2].funding = { people: ['alex', 'sam', 'kit'], rule: 'equal', set: { kit: { amount: 300 } } }; BOARD.estimates.push({ id: 'e3', account: 'k', amount: 100 });
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: BOARD } }));
await p.click('#t-settings'); await p.click('#sBills summary'); await p.waitForTimeout(80);
check('A figure on a boarder\'s own account: "Their own money isn\'t part of the household\'s figures."', (await txt(p, '#bf_k')).includes("Their own money isn't part of the household's figures.") && !(await txt(p, '#bf_k')).includes('With the way you share costs'), await txt(p, '#bf_k'));
await ctx.close();

// A figure on an account a change of style has since made one a figure isn't offered on: it still counts, and Settings says so.
const blocked = HH(); blocked.accounts[2].funding.rule = 'afterOwn'; blocked.estimates = [{ id: 'e1', account: 'j', amount: 1500 }, { id: 'e2', account: 'a1', amount: 200 }];
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: blocked } }));
await p.click('#t-settings'); await p.click('#sBills summary'); await p.waitForTimeout(80);
check('A figure on someone\'s own account under "what\'s left after own bills": it still counts, and Settings says why to list instead', (await txt(p, '#bf_a1')).includes('With the way you share costs now, list your own bills here so the shares are fair. The figure still counts until you tap That\'s all of them.') &&
  !(await p.$('#bf_a2_new')) && (await txt(p, '#bf_a1_line_t')) === "Alex's account: £0.00 listed · £200.00 not listed yet (your figure £200.00)");
await ctx.close();

// Paste a list in Settings › Bills
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: HH() } }));
await p.click('#t-settings'); await p.click('#sBills summary'); await p.waitForTimeout(80);
check('Settings › Bills: "Paste a list" next to Quick add', (await txt(p, '#pasteBtn')) === 'Paste a list' && await shown(p, '#quickAddBtn'));
await p.click('#bf_j_paste'); await p.waitForTimeout(80);
check('…an account\'s "Paste a list" opens the box, focused', (await focusId(p)) === 'pl_text' && (await p.getAttribute('#pasteBtn', 'aria-expanded')) === 'true');
await p.fill('#pl_text', 'Water £41.20\nMortgage 900\nCar tax\t15'); await p.click('#pl_read'); await p.waitForTimeout(80);
check('…found, a duplicate left unticked, the bills paid from that account', (await txt(p, '#pl_sum')) === 'Found 3 bills, £956.20 a month.' && !(await p.isChecked('#pl_1_on')) && (await p.$eval('#pl_0_s', s => s.value)) === 'j');
await p.click('#pl_add'); await p.waitForTimeout(100);
c = await LS(p, K.cfg);
check('…added (within the figure, so the transfers don\'t change)', c.bills.length === 5 && c.bills.slice(3).map(b => b.name).join() === 'Water,Car tax' && (await T(p, '#toast')) === 'Added 2 bills' && (await txt(p, '#bf_j_line_t')) === 'Joint: £1,106.20 listed · £393.80 not listed yet (your figure £1,500.00)');
await ctx.close();

// ---------- 7. Light and dark at 360px, larger text, keyboard ----------
for (const dark of [false, true]) {
  ({ ctx, p } = await session({ today: TODAY, w: 360, dark }));
  await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
  await walkSetup(p, 5, true);
  await p.click('#su_fig_all'); await p.click('#su_paste_open'); await p.click('#su_find'); await p.click('#su_b_2_g_home'); await p.waitForTimeout(60);
  await p.fill('#su_fig_2', '1200'); await p.fill('#su_figin_2', '1500'); await p.press('#su_figin_2', 'Tab');
  await p.fill('#su_paste_text', 'Gym £30\nBoat 9000'); await p.click('#su_paste_read'); await p.waitForTimeout(80);
  const name = dark ? 'dark' : 'light';
  check(`Bills step with everything open (${name}, 360px, larger text): no axe violations`, (await axe(p)).length === 0, (await axe(p)).join(' | '));
  check(`…nothing scrolls sideways (${name})`, await noSideScroll(p, 360));
  check(`…the figure box and the question use the theme's colours (${name})`, await p.$eval('#su_figbox_2', (e, dark) => { const bg = getComputedStyle(e).backgroundColor; return dark ? bg !== 'rgb(237, 241, 238)' : bg === 'rgb(237, 241, 238)'; }, dark));
  // Keyboard: Tab from the figure reaches its help-free controls in order.
  await p.focus('#su_fig_2'); await p.keyboard.press('Tab');
  check(`…Tab goes from the figure to what's moved in now (${name})`, (await focusId(p)) === 'su_figin_2');
  await p.click('#su_next'); await p.waitForTimeout(60); await SETUP_FILL[6](p);
  check(`Budgets by account (${name}, 360px, larger text): no axe violations, no sideways scroll`, (await axe(p)).length === 0 && await noSideScroll(p, 360), (await axe(p)).join(' | '));
  await ctx.close();
}
({ ctx, p } = await session({ today: TODAY, w: 360, dark: true, storage: { [K.cfg]: Object.assign(HH(), { appearance: { theme: 'dark', textSize: 'large' } }) } }));
await p.click('#t-settings'); await p.click('#sBills summary'); await p.click('#bf_j_change'); await p.waitForTimeout(80);
check('Settings › Bills with a figure being changed (dark, larger text, 360px): no axe violations, no sideways scroll', (await axe(p)).length === 0 && await noSideScroll(p, 360), (await axe(p)).join(' | '));
await p.keyboard.press('Escape');
await ctx.close();

await finish();
