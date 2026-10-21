// First run: the app ships with no household data, walks a new user through setup, offers an example household,
// and offers to restore an automatic backup on a phone that has one.
import fs from 'fs';
import { suite, session, SAMPLE, K, T, LS, steps, float, PAGE, BASE, walkSetup, SETUP_FILL, sampleStorage, skipTour } from './lib.mjs';
const { check, finish } = suite('First-run setup');
/** The phone's Back button on the Pay tab leaves the app straight away (no stray history entry under Pay). */
const backLeaves = async p => { await p.goBack().catch(() => null); await p.waitForTimeout(300); return !p.url().startsWith(BASE); };

// ---------- 1. No seed data in the app ----------
// (The check that none of the owner's real names or figures are built into the app reads the owner's backup, so it lives
// in qa_upgrade.mjs, which is private-repository only.)
const src = fs.readFileSync(PAGE, 'utf8');
check('No seed data is inserted at build time', !src.includes('SEED_CFG'));

// ---------- 2. Walk through setup: two people, a payday, shape 3, bills on two accounts, a budget and savings ----------
let { ctx, p } = await session();
const focusId = () => p.evaluate(() => document.activeElement.id);
const title = () => T(p, '#suTitle');
const txt = () => T(p, '#setup');
const sel = (s) => p.$eval(s, e => e.selectedOptions[0].textContent);
/** The bill names typed in one account's section of the bills step (sec: the section's heading id). */
const rowNames = sec => p.$$eval(`section[aria-labelledby=${sec}] .qa-row input[id$="_n"]`, l => l.map(x => x.value).filter(Boolean));
check('A new install opens on setup, with no tab bar or month bar', await p.isVisible('#tab-setup') && await p.isHidden('#tabbar') && await p.isHidden('#monthBar') && await p.isHidden('#tab-pay'));
check('Step 1 welcomes, with "Step 1 of 7" and the three ways in', (await title()) === 'Welcome to Dovetail' && (await txt()).includes('Step 1 of 7') &&
  (await txt()).includes('Setting up takes about five minutes') && await p.isVisible('#su_start') && await p.isVisible('#su_restore summary') && await p.isVisible('#su_example') && (await T(p, '#su_later')) === 'Skip setup for now');
check('Nothing is saved before setup is finished', (await LS(p, K.cfg)) === null);
await p.click('#su_start'); await p.waitForTimeout(50);
check('Step 2 is pay, with focus on its title and "Step 2 of 7"', (await title()) === 'Your pay' && (await focusId()) === 'suTitle' && (await txt()).includes('Step 2 of 7'));
check('…explaining take-home pay in plain words', (await txt()).includes("Take-home pay is the money that actually reaches your bank account, after tax, National Insurance and pension.") &&
  (await txt()).includes("Paid a different amount each month? Use a typical month.") && (await txt()).includes('Not employed?'));
check('…with Back, Next and Finish later, but no Skip (pay is the point)', await p.isVisible('#su_back') && await p.isVisible('#su_next') && await p.isVisible('#su_later') && (await p.$('#su_skip')) === null);
await p.fill('#su_p_0', 'Alex'); await p.fill('#su_pu_0', '2100'); await p.click('#su_addp'); await p.waitForTimeout(50);
check('Adding someone focuses the new name box', (await focusId()) === 'su_p_1');
check('Other income is only a link until there is some', await p.isVisible('#su_addi') && !(await txt()).includes('Any other regular income?'));
await p.click('#su_addi'); await p.waitForTimeout(50);
check('…which opens a row and focuses its name', (await focusId()) === 'su_in_0' && (await txt()).includes('Any other regular income?'));
await p.fill('#su_in_0', 'Child Benefit'); await p.click('#su_next'); await p.waitForTimeout(50);
check('An income with no amount is flagged and setup waits', (await title()) === 'Your pay' && (await T(p, '#su_msg')).includes('needs a name and an amount') &&
  await p.$eval('#su_inv_0', e => e.classList.contains('bad') && e.getAttribute('aria-invalid') === 'true') && (await focusId()) === 'su_inv_0');
await p.fill('#su_inv_0', '110'); await p.fill('#su_pu_0', '21x'); await p.click('#su_next'); await p.waitForTimeout(50);
check('Pay that isn\'t an amount is flagged', (await title()) === 'Your pay' && (await T(p, '#su_msg')).includes('like 1850.00') && (await focusId()) === 'su_pu_0');
await p.fill('#su_pu_0', ''); await p.click('#su_next'); await p.waitForTimeout(50);
check('No pay for anyone: a gentle note (not an error), once', (await title()) === 'Your pay' && (await T(p, '#su_msg')) === "Without pay, Dovetail can't show what's left. You can add it later." &&
  await p.$eval('#su_msg', e => e.classList.contains('banner') && !e.classList.contains('err')) && (await p.$('#setup .bad')) === null);
await p.click('#su_next'); await p.waitForTimeout(50);
check('…and the second tap carries on to the payday', (await title()) === 'Your payday');
await p.click('#su_back'); await p.waitForTimeout(50);
await p.fill('#su_pu_0', '2100'); await p.click('#su_next'); await p.waitForTimeout(50);
check('2.12.1: one person\'s pay in and the other\'s not (a partner at home, say): Next goes straight on', (await title()) === 'Your payday');
await p.click('#su_back'); await p.waitForTimeout(50);
check('Back keeps what was typed; the empty name became "Person 2"', (await p.inputValue('#su_p_0')) === 'Alex' && (await p.inputValue('#su_p_1')) === 'Person 2' &&
  Number(await p.inputValue('#su_pu_0')) === 2100 && (await p.inputValue('#su_in_0')) === 'Child Benefit' && (await focusId()) === 'suTitle');
await p.fill('#su_p_1', 'Sam'); await p.fill('#su_pu_1', '1850'); await p.click('#su_next'); await p.waitForTimeout(50);
// step 3
// 2.13: "both" for two people.
check('Step 3 first asks whether everyone is paid on the same day', (await title()) === 'Your payday' && (await txt()).includes('Are you both paid on the same day?') && (await p.$('#su_day')) === null);
check('…and can be skipped', await p.isVisible('#su_skip') && await p.isVisible('#su_later'));
await p.click('label[for=su_same_no]'); await p.waitForTimeout(50);
check('"No": pick the day the transfers are made', (await txt()).includes("Pick the day you'll make the transfers, once everyone's pay is in.") && await p.isVisible('#su_day') && (await focusId()) === 'su_same_no');
check('The same choices as Settings › Payday', JSON.stringify(await p.$$eval('#su_day option', o => [o.length, o[1].textContent, o[31].textContent, o[32].textContent])) === JSON.stringify([33, '1st of the month', '31st of the month', 'Last working day of the month']));
await p.selectOption('#su_day', '28'); await p.waitForTimeout(50);
check('A day shows the weekend box, ticked', await p.isVisible('#su_wk') && await p.isChecked('#su_wk'));
check('…and the next payday, and the month that pay is for', (await T(p, '#su_next_payday')) === 'Your next payday: Wednesday 28 October. That pay is for November 2026.', await T(p, '#su_next_payday'));
await p.selectOption('#su_day', 'last'); await p.waitForTimeout(50);
check('"Last working day" needs no weekend box', (await p.$('#su_wk')) === null && (await T(p, '#su_next_payday')) === 'Your next payday: Friday 30 October. That pay is for November 2026.', await T(p, '#su_next_payday'));
await p.selectOption('#su_day', '1'); await p.waitForTimeout(50);
check('The 1st: that pay is for its own month', (await T(p, '#su_next_payday')) === 'Your next payday: Friday 30 October. That pay is for November 2026.' && (await p.selectOption('#su_day', '10'), (await T(p, '#su_next_payday')) === 'Your next payday: Tuesday 10 November. That pay is for November 2026.'), await T(p, '#su_next_payday'));
await p.selectOption('#su_day', '28'); await p.click('#su_next'); await p.waitForTimeout(50);
// step 4
const styles = await p.$$eval('#setup fieldset:has(#su_style_pool) .su-shape b', l => l.map(x => x.textContent));
check('Step 4 asks how the household manages its money first, before any accounts', (await title()) === 'Your accounts' && (await txt()).includes('In our house we manage our money by…') && (await p.$('#su_a_0')) === null &&
  JSON.stringify(styles) === JSON.stringify(['Putting it all together', 'Each paying into a joint account', 'One of us paying the bills', 'Each paying certain bills', 'Something else']), styles.join(' | '));
await p.click('#su_next'); await p.waitForTimeout(50);
check('Next without an answer says what to do', (await title()) === 'Your accounts' && (await T(p, '#su_msg')).includes('Choose how you manage your money first'), await T(p, '#su_msg'));
await p.check('#su_style_pool'); await p.waitForTimeout(50);
check('Putting it all together: then how money moves', (await txt()).includes('Each payday, pay lands in an account. That account pays its own bills first.') && (await p.$('#su_a_0')) === null);
const shapes = await p.$$eval('#setup fieldset:has(#su_shape_joint) .su-shape', l => l.map(x => x.querySelector('b').textContent));
check('Three starting points, worded for two people', JSON.stringify(shapes) === JSON.stringify(['One joint account', 'Our own accounts, then a joint one', 'Separate accounts for bills and spending']), shapes.join(' | '));
check('…a radio group, each with a decorative diagram', (await p.getAttribute('#setup fieldset:has(#su_shape_joint)', 'role')) === 'radiogroup' && (await p.$$('#setup .su-shape input[name=su_shape]')).length === 3 && (await p.$$('#setup .su-shape .mini[aria-hidden=true]')).length === 3);
await p.click('#su_next'); await p.waitForTimeout(50);
check('Next without a starting point says what to do', (await title()) === 'Your accounts' && (await T(p, '#su_msg')).includes('Choose how pay reaches the joint account'), await T(p, '#su_msg'));
await p.check('#su_shape_split'); await p.waitForTimeout(50);
const accNames = () => p.$$eval('#setup .su-acct input[id^=su_a_]', l => l.map(x => x.value));
check('Separate accounts for bills and spending: own accounts, then Joint bills, then Joint spending', JSON.stringify(await accNames()) === JSON.stringify(["Alex's account", "Sam's account", 'Joint bills', 'Joint spending']), (await accNames()).join(' | '));
check('…each person paid into their own account, Child Benefit into Joint spending', (await sel('#su_pa_0')) === "Alex's account" && (await sel('#su_pa_1')) === "Sam's account" && (await sel('#su_ia_0')) === 'Joint spending');
check('…"Paid in here" on each account', JSON.stringify(await p.$$eval('#setup .su-acct', l => l.map(b => [...b.querySelectorAll('.chip')].map(c => c.textContent).join(',')))) === JSON.stringify(["Alex's pay", "Sam's pay", '', 'Child Benefit']));
check('…and what\'s left: moves on, or stays in Joint spending', (await sel('#su_l_0')) === '…moves to Joint bills' && (await sel('#su_l_2')) === '…moves to Joint spending' && (await sel('#su_l_3')) === '…stays here (this is your left over)');
const story = () => p.$$eval('#setup .fd li > .sr', l => l.map(x => x.textContent));
check('The diagram is a list a screen reader reads as sentences', JSON.stringify(await story()) === JSON.stringify(["Alex's pay arrives in Alex's account. What's left moves to Joint bills.", "Sam's pay arrives in Sam's account. What's left moves to Joint bills.",
  "Joint bills gets what's left from Alex's account and Sam's account. What's left moves to Joint spending.", "Child Benefit arrives in Joint spending. It also gets what's left from Joint bills. It keeps what's left: your left over."]), (await story()).join(' | '));
check('…the drawing is hidden from screen readers, and the last account says it keeps what\'s left', (await p.$$('#setup .fd li > .fd-v[aria-hidden=true]')).length === 4 && (await p.$eval('#setup .fd li.root', e => e.textContent)).includes("Keeps what's left: your left over"));
// 2.13: no bills are typed yet, so the example says what moves in words, not with an invented £20 of bills.
check('A worked example from their own figures', (await T(p, '#su_example_line')) === "For example: Alex's pay arrives in Alex's account, and what's left after its bills moves to Joint bills.", await T(p, '#su_example_line'));
check('The diagram comes straight after the choice, before "Check your accounts"', await p.evaluate(() => { const d = document.getElementById('su_dia'), f = document.querySelector('#setup fieldset:has(#su_shape_joint)'), c = document.getElementById('su_h_check');
  return d.closest('section') === f.closest('section') && !!(f.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(d.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING); }));
const fsz = s => p.$eval(s, e => parseFloat(getComputedStyle(e).fontSize));
check('Sub-headings are smaller than their card\'s title', (await fsz('#su_h_dia')) < (await fsz('#su_h_move')) && (await fsz('#su_h_where')) < (await fsz('#su_h_check')), [await fsz('#su_h_dia'), await fsz('#su_h_move'), await fsz('#su_h_where'), await fsz('#su_h_check')].join(','));
check('"Remove" is a quiet link on the account name\'s line', (await p.$$('#setup .su-acct .su-rm.linkbtn')).length === 4 && (await p.$('#setup .su-acct .btn')) === null && (await p.getAttribute('#setup .su-acct .su-rm >> nth=0', 'aria-label')) === 'Remove account 1');
check('An account can\'t send what\'s left to itself or to an account that sends to it', !(await p.$$eval('#su_l_2 option', o => o.map(x => x.textContent))).some(t => /Joint bills|Alex|Sam/.test(t)) &&
  !(await p.$$eval('#su_l_3 option', o => o.map(x => x.textContent))).some(t => t.includes('moves to')));
await p.focus('#su_shape_split'); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(80);
check('Arrow keys move between starting points; with nothing edited, no question', await p.isChecked('#su_shape_joint') && (await focusId()) === 'su_shape_joint' && JSON.stringify(await accNames()) === '["Joint account"]' && (await p.$('#su_replace')) === null);
await p.keyboard.press('ArrowUp'); await p.waitForTimeout(80);
check('…and back', await p.isChecked('#su_shape_split') && (await accNames()).length === 4);
await p.fill('#su_a_2', 'Bills pot'); await p.check('#su_shape_own'); await p.waitForTimeout(80);
check('After an edit, a new starting point asks first', await p.isVisible('#su_replace') && (await T(p, '#su_replace')).includes('Replace the accounts below?') && (await p.inputValue('#su_a_2')) === 'Bills pot');
await p.click('#su_replace_no'); await p.waitForTimeout(50);
check('"Keep mine" keeps the accounts and the choice', (await p.$('#su_replace')) === null && (await p.inputValue('#su_a_2')) === 'Bills pot' && await p.isChecked('#su_shape_split') && (await focusId()) === 'su_shape_split');
await p.check('#su_shape_own'); await p.click('#su_replace_yes'); await p.waitForTimeout(50);
check('"Replace them" uses the new starting point', JSON.stringify(await accNames()) === JSON.stringify(["Alex's account", "Sam's account", 'Joint account']));
await p.check('#su_shape_split'); await p.waitForTimeout(50);
check('…and the next change doesn\'t ask again until something is edited', (await p.$('#su_replace')) === null && (await accNames()).length === 4);
await p.selectOption('#su_l_2', ''); await p.waitForTimeout(50);
check('Two accounts keeping what\'s left is allowed, and said plainly', (await T(p, '#su_roots')) === "Two accounts keep what's left, so you'll see two left-over amounts. That's fine if it's what you want.");
await p.selectOption('#su_l_2', { label: '…moves to Joint spending' }); await p.waitForTimeout(50);
await p.click('#su_adda'); await p.waitForTimeout(50);
check('A new account: its name is focused, and what\'s left moves to the account that keeps it', (await focusId()) === 'su_a_4' && (await sel('#su_l_4')) === '…moves to Joint spending');
await p.fill('#su_a_4', 'Car fund'); await p.selectOption('#su_pa_1', { label: 'Car fund' }); await p.waitForTimeout(50);
await p.locator('#setup .su-acct', { has: p.locator('#su_a_4') }).locator('.su-rm').click(); await p.waitForTimeout(50);
check('Removing an account moves the pay that went into it on to where its money went', (await p.$('#su_a_4')) === null && (await sel('#su_pa_1')) === 'Joint spending');
await p.selectOption('#su_pa_1', { label: "Sam's account" });
check('Nothing saved yet', (await LS(p, K.cfg)) === null);
await p.click('#su_next'); await p.waitForTimeout(50);
// step 5
// 2.7: accounts not usually for bills are one line each ("Alex's account — + Add a bill") until opened.
const heads = await p.$$eval('#setup .su-bsec h2, #setup .su-bline b', l => l.map(x => x.textContent));
check('Step 5: bills account by account, in the order money moves', (await title()) === 'Your bills' && JSON.stringify(heads) === JSON.stringify(["Alex's account", "Sam's account", 'Paid from Joint bills', 'Joint spending']), JSON.stringify(heads));
check('…Joint bills (nobody\'s paid into it, and it passes what\'s left on) opens with three rows; the others are links', (await p.$$('section[aria-labelledby=su_h_b2] .qa-row')).length === 3 && await p.isVisible('#su_b_0_open') && await p.isVisible('#su_b_1_open') && await p.isVisible('#su_b_3_open'));
check('…with the bank-statement tip and suggestions', (await txt()).includes('Payments marked DD (Direct Debit) or SO (Standing Order) are usually regular bills.') && (await p.$$('section[aria-labelledby=su_h_b2] .su-chips button')).length === 12 && (await p.$('#setup .su-chips button[aria-pressed]')) === null);
const chip = n => p.click(`section[aria-labelledby=su_h_b2] .su-chips button:has-text("${n}")`);
await chip('Mortgage'); await p.waitForTimeout(50);
check('A suggestion fills the first empty row and moves to its amount; its chip goes', (await p.inputValue('#su_b_2_0_n')) === 'Mortgage' && (await focusId()) === 'su_b_2_0_a' && !(await T(p, 'section[aria-labelledby=su_h_b2] .su-chips')).includes('Mortgage'));
await p.keyboard.type('925'); await chip('Council Tax'); await p.waitForTimeout(50);
check('Council Tax is set to "Some months", April to January', (await p.inputValue('#su_b_2_1_f')) === 'some' && JSON.stringify(await p.$$eval('#su_b_2_1_m .mbtn', b => b.map(x => x.getAttribute('aria-pressed') === 'true' ? 1 : 0))) === '[1,0,0,1,1,1,1,1,1,1,1,1]');
await p.keyboard.type('168'); await chip('TV Licence'); await p.waitForTimeout(50);
check('TV Licence is "Once a year", with focus on the month to pick', (await p.inputValue('#su_b_2_2_f')) === 'yearly' && (await focusId()) === 'su_b_2_2_m' && (await p.inputValue('#su_b_2_2_m')) === '');
await p.fill('#su_b_2_2_a', '174.50'); await chip('Car insurance'); await p.waitForTimeout(50);
check('No empty row left: a suggestion adds one', (await p.$$('section[aria-labelledby=su_h_b2] .qa-row')).length === 4 && (await p.inputValue('#su_b_2_3_n')) === 'Car insurance');
await p.fill('#su_b_2_3_a', '420'); await p.selectOption('#su_b_2_3_m', '3');
for (const m of [1, 4, 5, 6, 7, 8, 9, 10, 11, 12]) await p.click('#su_b_2_1_m_' + m);
await p.click('#su_next'); await p.waitForTimeout(50);
check('A yearly bill with no month, and "some months" with none picked, are flagged', (await title()) === 'Your bills' && (await T(p, '#su_msg')) === 'Choose the month each yearly bill is paid in. Pick at least one month for each bill paid in some months.' &&
  await p.$eval('#su_b_2_2_m', e => e.classList.contains('bad')) && await p.$eval('#su_b_2_1_m', e => e.classList.contains('bad')), await T(p, '#su_msg'));
for (const m of [1, 4, 5, 6, 7, 8, 9, 10, 11, 12]) await p.click('#su_b_2_1_m_' + m);
await p.selectOption('#su_b_2_2_m', '6');
await p.click('#su_b_0_open'); await p.waitForTimeout(50);
check('Opening another account\'s bills focuses its first row', (await focusId()) === 'su_b_0_0_n');
await p.keyboard.type('Mobile phone'); await p.fill('#su_b_0_0_a', '18'); await p.focus('#su_b_0_0_a'); await p.keyboard.press('Enter'); await p.waitForTimeout(50);
check('Enter on the last amount adds a row and moves to it', (await focusId()) === 'su_b_0_1_n');
const chipShown = (sec, n) => p.isVisible(`section[aria-labelledby=${sec}] .su-chips button[data-name="${n}"]`);
check('A typed name hides its suggestion in that section', !(await chipShown('su_h_b0', 'mobile phone')) && await chipShown('su_h_b0', 'gym'));
await p.fill('#su_b_0_1_n', '  GYM '); await p.waitForTimeout(30);
check('…as it\'s typed, whatever the capitals and spaces, and only in that section', !(await chipShown('su_h_b0', 'gym')) && await chipShown('su_h_b2', 'gym'));
await p.click('#su_next'); await p.waitForTimeout(50);
check('A bill with a name and no amount is flagged', (await T(p, '#su_msg')).includes('Each bill needs a name and an amount') && (await focusId()) === 'su_b_0_1_a');
await p.locator('section[aria-labelledby=su_h_b0] .qa-row').nth(1).locator('button:has-text("Remove")').click(); await p.waitForTimeout(50);
check('…and comes back when the row goes', await chipShown('su_h_b0', 'gym'));
await p.click('#su_next'); await p.waitForTimeout(50);
// step 6
check('Step 6: spending budgets and savings transfers, with suggestions and tips', (await title()) === 'Spending and saving' && (await txt()).includes('Not sure how much? Look at what you spent last month') && (await txt()).includes('Many people start with an emergency fund'));
check('…kept in and sent from the account that keeps what\'s left', (await sel('#su_g_0_s')) === 'Joint spending' && (await sel('#su_v_0_s')) === 'Joint spending');
await p.click('section[aria-labelledby=su_h_g] .su-chips button:has-text("Food shopping")'); await p.waitForTimeout(50);
check('A suggestion fills the budget\'s name and moves to its amount', (await p.inputValue('#su_g_0_n')) === 'Food shopping' && (await focusId()) === 'su_g_0_a');
await p.keyboard.type('520');
await p.click('section[aria-labelledby=su_h_v] .su-chips button:has-text("Emergency fund")'); await p.keyboard.type('100');
await p.click('#su_next'); await p.waitForTimeout(50);
// step 7
check('Step 7: the first payday, the next one from today, and the month it pays for', (await title()) === 'Your first payday' && (await T(p, '#su_first')) === 'Your first payday: Wednesday 28 October, for November 2026.' &&
  (await T(p, '#su_for')) === 'With the pay you entered:' && (await p.$('#su_later')) === null, await T(p, '#su_first'));
const preview = await p.$$eval('#su_transfers li', l => l.map(x => x.textContent.replace(/\s*→\s*to\s*/, ' → ').replace(/(\S)£/, '$1 £')));
check('…the transfers to make, in order', JSON.stringify(preview) === JSON.stringify(["Alex's account → Joint bills £2,082.00", "Sam's account → Joint bills £1,850.00", 'Joint bills → Joint spending £2,839.00', 'Joint spending → Emergency fund £100.00']), preview.join(' | '));
check('…and what\'s left over, in large type', (await T(p, '#su_left')).replace(/\s+/g, ' ') === 'Left over £2,329.00 in Joint spending', await T(p, '#su_left'));
check('…then what happens each payday', JSON.stringify(await p.$$eval('#setup .su-how li', l => l.map(x => x.textContent))) === JSON.stringify(['Type the pay that arrived.', 'Make these transfers in your banking app.', "Tick each one off in Dovetail. What's left over is yours to spend for the month."]));
check('Still nothing saved', (await LS(p, K.cfg)) === null && (await LS(p, K.mon)) === null);
for (const t of ['Spending and saving', 'Your bills', 'Your accounts', 'Your payday', 'Your pay']) { await p.click('#su_back'); await p.waitForTimeout(40); if ((await title()) !== t) break; }
check('Back all the way keeps everything typed', (await title()) === 'Your pay' && (await p.inputValue('#su_p_1')) === 'Sam' && (await p.inputValue('#su_in_0')) === 'Child Benefit');
for (let i = 0; i < 5; i++) { await p.click('#su_next'); await p.waitForTimeout(40); }
check('…and forward again', (await title()) === 'Your first payday' && (await p.$$('#su_transfers li')).length === 4 && (await T(p, '#su_left')).includes('£2,329.00'));
await p.click('#su_finish'); await p.waitForTimeout(250);
check('"Looks right, start" opens the Pay tab with the tab bar, on the month the preview showed', await p.isVisible('#tab-pay') && await p.isVisible('#tabbar') && await p.evaluate(() => location.hash) === '#pay' && (await T(p, '#monthLabel')) === 'November 2026', await T(p, '#monthLabel'));
const s = await steps(p);
check('The Pay tab shows exactly the transfers and left over the preview did', JSON.stringify(s.map(x => x.slice(x.lastIndexOf('£')))) === JSON.stringify(['£2,082.00', '£1,850.00', '£2,839.00', '£100.00']) && (await T(p, '#heroFloat')) === '£2,329.00' && (await p.$('#check')) === null, s.join(' | '));
check('A pay box for each person, with usual pay', (await T(p, '#payGrid')).includes('Alex') && (await T(p, '#payGrid')).includes('Sam') && (await p.getAttribute('#payGrid input >> nth=1', 'placeholder')) === '1850.00');
const cfg = await LS(p, K.cfg);
const nameOf = id => (cfg.accounts.find(a => a.id === id) || {}).name;
check('Saved: schema 5, two people, four accounts in flow order', cfg.schema === 5 && cfg.setupDone && !cfg.example && cfg.people.map(x => [x.name, x.usualPay, nameOf(x.payAccount)]).join('|') === "Alex,2100,Alex's account|Sam,1850,Sam's account" &&
  JSON.stringify(cfg.accounts.map(a => [a.name, nameOf(a.leftoverTo) || null])) === JSON.stringify([["Alex's account", 'Joint bills'], ["Sam's account", 'Joint bills'], ['Joint bills', 'Joint spending'], ['Joint spending', null]]), JSON.stringify(cfg.accounts));
check('…the payday', JSON.stringify(cfg.payday) === '{"day":28,"weekend":true}');
check('…the bills with their months and suggested categories', JSON.stringify(cfg.bills.map(b => [b.name, b.amount, nameOf(b.account), b.months, b.category])) === JSON.stringify([
  ['Mobile phone', 18, "Alex's account", [], 'utilities'], ['Mortgage', 925, 'Joint bills', [], 'housing'], ['Council Tax', 168, 'Joint bills', [1, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'utilities'],
  ['TV Licence', 174.5, 'Joint bills', [6], 'subscriptions'], ['Car insurance', 420, 'Joint bills', [3], 'insurance']]), JSON.stringify(cfg.bills));
check('…other income, the budget and the savings transfer (from the first pay month, the one on screen)', JSON.stringify([cfg.income.map(x => [x.name, x.amount, nameOf(x.account)]), cfg.budgets.map(x => [x.name, x.amount, nameOf(x.account)]), cfg.savings.map(x => [x.name, x.amount, nameOf(x.fromAccount), x.since])]) ===
  JSON.stringify([[['Child Benefit', 110, 'Joint spending']], [['Food shopping', 520, 'Joint spending']], [['Emergency fund', 100, 'Joint spending', '2026-11']]]));
check('…nothing left to finish, so no "Finish setting up" card (setupTips dropped); the tour shows straight away, with no "All set" message', !('setupTips' in cfg) && (await p.$('#setupTips')) === null && cfg.tourDone === false && await p.isVisible('#tour') && !(await T(p, '#toast')).includes('All set'));
await skipTour(p);
check('Skipping the tour saves that it\'s been seen', !('tourDone' in await LS(p, K.cfg)) && await p.isHidden('#tour'));
check('No months saved yet', JSON.stringify(await LS(p, K.mon)) === '{}');
await p.reload(); await p.waitForTimeout(200);
check('Reopening goes straight to Pay, on the month the app usually opens on (the last payday\'s until 10 days before the next)', await p.isVisible('#tab-pay') && await p.isHidden('#tab-setup') && (await T(p, '#monthLabel')) === 'October 2026');
check('No JS errors (setup)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2a. Every starting point, for one person and for two ----------
const EXPECT = {
  1: { joint: [['Current account'], ["Pat's pay arrives in Current account. It keeps what's left: your left over."]],
    own: [['Bills account', 'Spending account'], ["Pat's pay arrives in Bills account. What's left moves to Spending account.", "Spending account gets what's left from Bills account. It keeps what's left: your left over."]],
    split: [['Pay account', 'Bills account', 'Spending account'], ["Pat's pay arrives in Pay account. What's left moves to Bills account.", "Bills account gets what's left from Pay account. What's left moves to Spending account.", "Spending account gets what's left from Bills account. It keeps what's left: your left over."]],
    other: [['Current account'], ["Pat's pay arrives in Current account. It keeps what's left: your left over."]] },
  2: { joint: [['Joint account'], ["Pat's pay and Kim's pay arrive in Joint account. It keeps what's left: your left over."]],
    own: [["Pat's account", "Kim's account", 'Joint account'], ["Pat's pay arrives in Pat's account. What's left moves to Joint account.", "Kim's pay arrives in Kim's account. What's left moves to Joint account.", "Joint account gets what's left from Pat's account and Kim's account. It keeps what's left: your left over."]],
    split: [["Pat's account", "Kim's account", 'Joint bills', 'Joint spending'], ["Pat's pay arrives in Pat's account. What's left moves to Joint bills.", "Kim's pay arrives in Kim's account. What's left moves to Joint bills.", "Joint bills gets what's left from Pat's account and Kim's account. What's left moves to Joint spending.", "Joint spending gets what's left from Joint bills. It keeps what's left: your left over."]],
    other: [['Joint account'], ["Pat's pay and Kim's pay arrive in Joint account. It keeps what's left: your left over."]] } };
for (const n of [1, 2]) {
  ({ ctx, p } = await session());
  await p.click('#su_start'); await p.fill('#su_p_0', 'Pat'); await p.fill('#su_pu_0', '1500');
  if (n === 2) { await p.click('#su_addp'); await p.fill('#su_p_1', 'Kim'); await p.fill('#su_pu_1', '1200'); }
  await p.click('#su_next'); await p.click('#su_skip'); await p.waitForTimeout(50);
  const words = await p.$$eval('#setup .su-shape b', l => l.map(x => x.textContent));
  if (n === 1) check('One person: the starting points are worded for one', JSON.stringify(words) === JSON.stringify(['My account', 'A bills account and a spending account', 'My pay account, a bills account and a spending account', 'Something else']), words.join(' | '));
  for (const kind of ['joint', 'own', 'split', 'other']) {
    if (n === 2) await p.check(kind === 'other' ? '#su_style_other' : '#su_style_pool');
    if (n === 1 || kind !== 'other') await p.check('#su_shape_' + kind); await p.waitForTimeout(50);
    const got = [await p.$$eval('#setup .su-acct input[id^=su_a_]', l => l.map(x => x.value)), await p.$$eval('#setup .fd li > .sr', l => l.map(x => x.textContent))];
    check(`${n === 1 ? 'One person' : 'Two people'}, "${kind}": the expected accounts and flow`, JSON.stringify(got) === JSON.stringify(EXPECT[n][kind]), JSON.stringify(got));
  }
  check('No JS errors (starting points, ' + n + ')', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 2a. (cont.) The bills step opens the account bills are usually paid from, for every starting point ----------
const BILLS_OPEN = { 1: { joint: 'Current account', own: 'Bills account', split: 'Bills account', other: 'Current account' },
  2: { joint: 'Joint account', own: 'Joint account', split: 'Joint bills', other: 'Joint account' } };
for (const n of [1, 2]) {
  ({ ctx, p } = await session());
  await p.click('#su_start'); await p.fill('#su_p_0', 'Pat'); await p.fill('#su_pu_0', '1500');
  if (n === 2) { await p.click('#su_addp'); await p.fill('#su_p_1', 'Kim'); await p.fill('#su_pu_1', '1200'); }
  await p.click('#su_next'); await p.click('#su_skip'); await p.waitForTimeout(50);
  for (const kind of ['joint', 'own', 'split', 'other']) {
    if (n === 2) await p.check(kind === 'other' ? '#su_style_other' : '#su_style_pool');
    if (n === 1 || kind !== 'other') await p.check('#su_shape_' + kind); await p.waitForTimeout(50); await p.click('#su_next'); await p.waitForTimeout(50);
    const open = await p.$$eval('#setup .su-bsec', l => l.filter(x => x.querySelector('.qa-row')).map(x => x.querySelector('h2').textContent + ': ' + x.querySelectorAll('.qa-row').length + ' rows'));
    check(`${n === 1 ? 'One person' : 'Two people'}, "${kind}": the bills step opens ${BILLS_OPEN[n][kind]} with three rows, and only that`, JSON.stringify(open) === JSON.stringify(['Paid from ' + BILLS_OPEN[n][kind] + ': 3 rows']), JSON.stringify(open));
    await p.click('#su_back'); await p.waitForTimeout(50);
  }
  check('No JS errors (bills account, ' + n + ')', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 2b. Finish later, Skip setup for now, Skip this step, and defaults ----------
({ ctx, p } = await session());
await p.click('#su_later'); await p.waitForTimeout(200);
let c0 = await LS(p, K.cfg);
check('"Skip setup for now" opens Pay with one person ("You") in one account ("Current account")', await p.isVisible('#tab-pay') && c0.setupDone && c0.people.length === 1 && c0.people[0].name === 'You' &&
  JSON.stringify(c0.accounts.map(a => [a.name, a.leftoverTo])) === '[["Current account",null]]' && c0.people[0].payAccount === c0.accounts[0].id && JSON.stringify(c0.payday) === '{}' && c0.bills.length === 0 && c0.setupTips === true, JSON.stringify(c0));
check('…and a reconciled Pay tab', (await p.$('#check')) === null && (await T(p, '#payGrid')).includes('You') && p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
({ ctx, p } = await session());
await p.click('#su_start'); await p.fill('#su_p_0', 'Pat'); await p.fill('#su_pu_0', '1500'); await p.click('#su_addi'); await p.fill('#su_in_0', 'Rent from lodger'); await p.fill('#su_inv_0', '300');
await p.click('#su_later'); await p.waitForTimeout(200);
c0 = await LS(p, K.cfg);
check('Finish later from step 2 keeps the pay and other income, with one "Current account"', await p.isVisible('#tab-pay') && c0.people[0].name === 'Pat' && c0.people[0].usualPay === 1500 && c0.accounts.length === 1 &&
  c0.income.length === 1 && c0.income[0].account === c0.accounts[0].id && (await T(p, '#heroFloat')) === '£1,800.00', JSON.stringify(c0) + (await T(p, '#heroFloat')));
await ctx.close();
({ ctx, p } = await session());
await walkSetup(p, 4, true);
await p.click('#su_later'); await p.waitForTimeout(200);
c0 = await LS(p, K.cfg);
check('Finish later from step 4 keeps the pay, the payday and the accounts', c0.people.length === 2 && JSON.stringify(c0.payday) === '{"day":28,"weekend":true}' && c0.accounts.length === 4 && c0.bills.length === 0 && c0.budgets.length === 0 && (await steps(p)).length === 3);
check('…and opens on the month the app usually opens on', (await T(p, '#monthLabel')) === 'October 2026');
await ctx.close();
({ ctx, p } = await session());
await walkSetup(p, 3);
await p.click('label[for=su_same_yes]'); await p.selectOption('#su_day', '1'); await p.click('#su_skip'); await p.waitForTimeout(50);
check('"Skip this step" on the payday goes on to the accounts', (await title()) === 'Your accounts');
await SETUP_FILL[4](p); await p.click('#su_next'); await SETUP_FILL[5](p); await p.click('#su_b_2_more'); await p.fill('#su_b_2_3_n', 'Water');
await p.click('#su_next'); await p.waitForTimeout(50);
check('(set-up) an unfinished bill stops Next', (await title()) === 'Your bills');
await p.click('#su_later'); await p.waitForTimeout(200);
c0 = await LS(p, K.cfg);
check('Finish later from step 5: no payday (skipped), the finished bills kept, the unfinished one left out', JSON.stringify(c0.payday) === '{}' && c0.bills.map(b => b.name).join(',') === 'Mobile phone,Mortgage,Council Tax,Car insurance', JSON.stringify(c0.bills.map(b => b.name)));
await ctx.close();
({ ctx, p } = await session());
await walkSetup(p, 6, true);
await p.click('#su_later'); await p.waitForTimeout(200);
c0 = await LS(p, K.cfg);
check('Finish later from step 6 keeps everything, budgets and savings included', c0.bills.length === 4 && c0.budgets.length === 1 && c0.savings.length === 1 && c0.savings[0].since === '2026-10' && (await T(p, '#heroFloat')) === '£2,329.00');
await ctx.close();
({ ctx, p } = await session());
await walkSetup(p, 5, true); await p.click('#su_skip'); await SETUP_FILL[6](p); await p.click('#su_skip'); await p.waitForTimeout(50);
check('Skipping the bills and the spending steps leaves them out of the preview', (await title()) === 'Your first payday' && (await T(p, '#su_left')).includes('£4,060.00'), await T(p, '#su_left'));
await p.click('#su_back'); await p.waitForTimeout(50);
check('…but Back still shows what was typed', (await p.inputValue('#su_g_0_n')) === 'Food shopping');
await p.click('#su_next'); await p.waitForTimeout(50);
check('…and Next on that step uses it again', (await T(p, '#su_left')).includes('£3,440.00'), await T(p, '#su_left'));
await p.click('#su_finish'); await p.waitForTimeout(200);
c0 = await LS(p, K.cfg);
check('…so the household has no bills but has the budget and savings', c0.bills.length === 0 && c0.budgets.length === 1 && c0.savings.length === 1 && (await T(p, '#heroFloat')) === '£3,440.00');
await skipTour(p);
check('"Looks right, start": the savings transfer starts in the month the Pay tab opens on (November), not the month it is now', c0.savings[0].since === '2026-11' && (await T(p, '#monthLabel')) === 'November 2026', c0.savings[0].since);
// Pay typed in October as well: October isn't counted as a month the savings transfer was missed.
await p.click('#prev'); await p.waitForTimeout(80); await p.fill('#payGrid input >> nth=0', '2100'); await p.waitForTimeout(150);
await p.click('#next'); await p.waitForTimeout(80); await p.fill('#payGrid input >> nth=0', '2100'); await p.waitForTimeout(150);
await p.click('#steps li:last-child .tick'); await p.waitForTimeout(150);
await p.click('#t-analysis'); await p.waitForTimeout(150); await p.click('#anSaved .linkbtn[aria-controls]'); await p.waitForTimeout(50);
const svRow = await p.$$eval('#anSavedTable tbody tr', r => r.map(x => [...x.children].map(c => c.textContent)));
check('…so Saved so far counts it from November: 1 of 1 month', JSON.stringify(svRow) === JSON.stringify([['Emergency fund', '£100.00', '£100.00', '1 of 1 month since Nov 2026 (100%)']]), JSON.stringify(svRow));
check('No JS errors (savings start month)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
({ ctx, p } = await session());
await walkSetup(p, 6, true); await p.click('#su_back'); await p.click('#su_back'); await p.click('#su_back'); await p.waitForTimeout(50);
await p.click('#su_skip'); await p.waitForTimeout(50);
for (let i = 0; i < 3; i++) { await p.click('#su_next'); await p.waitForTimeout(40); }
await p.click('#su_finish'); await p.waitForTimeout(200);
c0 = await LS(p, K.cfg);
check('No payday: "Looks right, start" opens on the month the app usually opens on, and the savings transfer starts then', JSON.stringify(c0.payday) === '{}' && c0.savings.length === 1 && c0.savings[0].since === '2026-11' && (await T(p, '#monthLabel')) === 'November 2026', JSON.stringify([c0.payday, c0.savings, await T(p, '#monthLabel')]));
await ctx.close();
({ ctx, p } = await session());
await p.click('#su_start'); await p.fill('#su_p_0', 'Pat'); await p.click('#su_next'); await p.click('#su_next'); await p.click('#su_skip'); await p.check('#su_shape_other'); await p.click('#su_next');
await p.click('#su_next'); await p.click('#su_next'); await p.waitForTimeout(50);
check('No pay at all: the preview says to add pay, and lists the transfers without amounts', (await T(p, '#su_nopay')) === 'Add pay to see real amounts.' && (await p.$('#su_left')) === null && (await T(p, '#su_for')) === 'For November 2026:', await T(p, '#su_for'));
await ctx.close();

// ---------- 2c. An account removed after reaching the bills step ----------
({ ctx, p } = await session());
await p.click('#su_start'); await p.fill('#su_p_0', 'Pat'); await p.click('#su_next'); await p.click('#su_next'); await p.click('#su_skip');
await p.check('#su_shape_own'); await p.click('#su_next'); await p.waitForTimeout(50);
check('One person, bills then spending: the bills account opens (Pat is paid into it, and it passes what\'s left on), not the spending account', await p.isVisible('#su_b_1_open') && (await p.$$('section[aria-labelledby=su_h_b0] .qa-row')).length === 3);
await p.fill('#su_b_0_0_n', 'Rent'); await p.fill('#su_b_0_0_a', '800');
await p.click('#su_back'); await p.locator('#setup .su-acct').nth(0).locator('.su-rm').click(); await p.waitForTimeout(50);
check('Removing the account Pat is paid into moves the pay on', (await p.$$('#setup .su-acct')).length === 1 && (await p.$eval('#su_pa_0', e => e.selectedOptions[0].textContent)) === 'Spending account');
await p.click('#su_next'); await p.waitForTimeout(50);
check('…and the bills typed for it move to an account that\'s still there', (await p.inputValue('#su_b_0_0_n')) === 'Rent');
await p.click('#su_later'); await p.waitForTimeout(200);
let cfgA = await LS(p, K.cfg);
check('A bill never points at a removed account', cfgA.bills.length === 1 && cfgA.bills[0].account === cfgA.accounts[0].id && cfgA.accounts.length === 1 && (await p.$('#check')) === null, JSON.stringify(cfgA.bills));
check('No JS errors (finish later and skips)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2d. Removing the account that keeps what's left ----------
({ ctx, p } = await session());
await walkSetup(p, 5, true); await p.click('#su_b_3_open'); await p.fill('#su_b_3_0_n', 'Streaming'); await p.fill('#su_b_3_0_a', '11');
await p.click('#su_next'); await SETUP_FILL[6](p); await p.click('#su_back'); await p.click('#su_back'); await p.waitForTimeout(50);
await p.locator('#setup .su-acct', { has: p.locator('#su_a_3') }).locator('.su-rm').click(); await p.waitForTimeout(50);
check('Removing Joint spending (it kept what\'s left): Joint bills keeps it now, and Child Benefit goes there, not to Alex\'s account', (await accNames()).join() === "Alex's account,Sam's account,Joint bills" &&
  (await sel('#su_ia_0')) === 'Joint bills' && (await sel('#su_l_2')) === '…stays here (this is your left over)', JSON.stringify([await accNames(), await sel('#su_ia_0')]));
await p.click('#su_next'); await p.waitForTimeout(50);
check('…its bills move to Joint bills too', JSON.stringify(await rowNames('su_h_b2')) === JSON.stringify(['Mortgage', 'Council Tax', 'Car insurance', 'Streaming']) && JSON.stringify(await rowNames('su_h_b0')) === JSON.stringify(['Mobile phone']), JSON.stringify([await rowNames('su_h_b0'), await rowNames('su_h_b2')]));
await p.click('#su_next'); await p.waitForTimeout(50);
check('…and so do the budget and the savings transfer', (await sel('#su_g_0_s')) === 'Joint bills' && (await sel('#su_v_0_s')) === 'Joint bills', JSON.stringify([await sel('#su_g_0_s'), await sel('#su_v_0_s')]));
await p.click('#su_later'); await p.waitForTimeout(250); await skipTour(p);
cfgA = await LS(p, K.cfg);
const jb = cfgA.accounts.find(a => a.name === 'Joint bills').id;
check('…as saved', cfgA.accounts.length === 3 && cfgA.income[0].account === jb && cfgA.budgets[0].account === jb && cfgA.savings[0].fromAccount === jb && cfgA.bills.find(b => b.name === 'Streaming').account === jb && cfgA.bills.find(b => b.name === 'Mobile phone').account !== jb, JSON.stringify(cfgA));
check('No JS errors (removing the left-over account)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2e. Someone added after the bills were typed: every bill stays with its account ----------
({ ctx, p } = await session());
await walkSetup(p, 5, true); await p.click('#su_back'); await p.waitForTimeout(40);
const ids4 = await p.$$eval('#su_pa_0 option', o => o.map(x => x.value));
for (let i = 0; i < 2; i++) { await p.click('#su_back'); await p.waitForTimeout(40); }
await p.click('#su_addp'); await p.fill('#su_p_2', 'Kim'); await p.fill('#su_pu_2', '1000'); await p.click('#su_next');
// Ids are made from the time (fixed in these tests) and a random number, so a new id can be one that's already there.
// Make sure it is: the next five account ids made are the four accounts' own ids, then the first again.
const clash = await p.evaluate(ids => { const T = Date.now().toString(36); if (!ids.every(id => id.startsWith('a' + T))) return false;
  const seq = ids.concat(ids[0]).map(id => (parseInt(id.slice(1 + T.length), 36) + 0.5) / 1e4), real = Math.random; let n = 0;
  Math.random = () => (n < seq.length ? seq[n++] : real()); return true; }, ids4);
await p.click('#su_next'); await p.waitForTimeout(50);
check('A third person added in step 2: the same starting point, with Kim\'s own account too', (await accNames()).join() === "Alex's account,Sam's account,Kim's account,Joint bills,Joint spending" && (await sel('#su_pa_2')) === "Kim's account", (await accNames()).join());
check('…every account with an id of its own, even when a new id happens to be one already there', clash && new Set(await p.$$eval('#su_pa_0 option', o => o.map(x => x.value))).size === 5, String(clash));
await p.click('#su_next'); await p.waitForTimeout(50);
check('…Alex\'s mobile phone is still paid from Alex\'s account, and the joint bills from Joint bills', JSON.stringify(await rowNames('su_h_b0')) === JSON.stringify(['Mobile phone']) &&
  JSON.stringify(await rowNames('su_h_b3')) === JSON.stringify(['Mortgage', 'Council Tax', 'Car insurance']) && await p.isVisible('#su_b_2_open'), JSON.stringify([await rowNames('su_h_b0'), await rowNames('su_h_b3')]));
await p.click('#su_later'); await p.waitForTimeout(250); await skipTour(p);
cfgA = await LS(p, K.cfg);
const acctOf = n => (cfgA.accounts.find(a => a.id === (cfgA.bills.find(b => b.name === n) || {}).account) || {}).name;
check('…as saved', acctOf('Mobile phone') === "Alex's account" && acctOf('Mortgage') === 'Joint bills' && cfgA.people.length === 3 && cfgA.income[0].account === cfgA.accounts.find(a => a.name === 'Joint spending').id, JSON.stringify(cfgA.bills));
check('No JS errors (someone added)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2f. Finish later with rows that aren't complete: they're left out, and a message says so ----------
({ ctx, p } = await session());
await p.click('#su_start'); await p.fill('#su_p_0', 'Pat'); await p.fill('#su_pu_0', '1500'); await p.click('#su_addi'); await p.fill('#su_in_0', 'Child Benefit');
await p.click('#su_later'); await p.waitForTimeout(250);
check('Finish later with an income that has no amount: the tour comes first, with no message behind it', await p.isVisible('#tour') && !(await p.$eval('#toast', e => e.classList.contains('show'))));
await skipTour(p);
check('…then a message says the row was left out, and where to add it', (await T(p, '#toast')) === "One row wasn't complete, so it was left out. You can add it in Settings." && await p.$eval('#toast', e => e.classList.contains('show')) && (await LS(p, K.cfg)).income.length === 0, await T(p, '#toast'));
await ctx.close();
({ ctx, p } = await session());
await walkSetup(p, 5, true);
await p.click('section[aria-labelledby=su_h_b2] .su-chips button:has-text("TV Licence")'); await p.fill('#su_b_2_3_a', '174.50');
await p.click('#su_b_0_more'); await p.fill('#su_b_0_1_n', 'Gym'); await p.waitForTimeout(30);
await p.click('#su_later'); await p.waitForTimeout(250); await skipTour(p);
check('A yearly bill with no month and a bill with no amount: "2 rows weren\'t complete", and only the complete bills are saved', (await T(p, '#toast')) === "2 rows weren't complete, so they were left out. You can add them in Settings." &&
  JSON.stringify((await LS(p, K.cfg)).bills.map(b => b.name)) === JSON.stringify(['Mobile phone', 'Mortgage', 'Council Tax', 'Car insurance']), [await T(p, '#toast'), JSON.stringify((await LS(p, K.cfg)).bills.map(b => b.name))].join(' '));
await ctx.close();
({ ctx, p } = await session());
await walkSetup(p, 5, true); await p.click('#su_b_0_more'); await p.fill('#su_b_0_1_n', 'Gym'); await p.click('#su_skip'); await p.waitForTimeout(50);
await p.click('#su_later'); await p.waitForTimeout(250); await skipTour(p);
check('A step that was skipped isn\'t counted (its rows were left out on purpose)', !(await T(p, '#toast')).includes('complete') && (await LS(p, K.cfg)).bills.length === 0, await T(p, '#toast'));
check('No JS errors (rows left out)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2g. The money-flow diagram with three or four people, at 400px ----------
// Side by side only with two or fewer accounts to a row; long names wrap between words; nothing sticks out of its card.
// The same diagram is in setup's step 4, Settings › Accounts and Settings › Help › How Dovetail works.
const diagram = sel => p.$eval(sel, ol => {
  const bad = [];
  ol.querySelectorAll(':scope > li').forEach(li => {
    const lr = li.getBoundingClientRect(), b = li.querySelector('.fd-card b');
    if (li.scrollWidth > li.clientWidth + 1) bad.push('overflows: ' + b.textContent);
    li.querySelectorAll('.fd-v, .fd-in, .chip, .fd-card, .fd-card b, .fd-keep, .fd-arrow, .fd-to').forEach(e => { const r = e.getBoundingClientRect();
      if (r.width && (r.left < lr.left - 1 || r.right > lr.right + 1)) bad.push('sticks out: ' + e.textContent);
      if (e.clientWidth && e.scrollWidth > e.clientWidth + 1) bad.push('overflows: ' + e.textContent); });
    const range = document.createRange(); range.selectNodeContents(b);
    const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
    if (lines > b.textContent.trim().split(/\s+/).length) bad.push('broken mid-word: ' + b.textContent);
  });
  return { side: ol.classList.contains('side'), cards: ol.querySelectorAll(':scope > li').length, bad };
});
for (const names of [['Christopher', 'Alexandra'], ['Christopher', 'Alexandra', 'Bartholomew'], ['Alexandra', 'Bartholomew', 'Christabel', 'Dominique']]) {
  ({ ctx, p } = await session({ w: 400 }));
  await p.click('#su_start');
  for (let i = 0; i < names.length; i++) { if (i) await p.click('#su_addp'); await p.fill('#su_p_' + i, names[i]); await p.fill('#su_pu_' + i, '1500'); }
  await p.click('#su_next'); await p.click('#su_skip'); await p.check('#su_style_pool'); await p.check('#su_shape_split'); await p.waitForTimeout(80);
  const side = names.length === 2, tag = `${names.length} people with long names at 400px`;
  const places = [['setup step 4', '#su_dia .fd']];
  let d = await diagram('#su_dia .fd');
  check(`${tag}, setup step 4: ${side ? 'side by side (two to a row)' : 'one under another'}, nothing overflows its card, names unbroken`, d.side === side && d.cards === names.length + 2 && !d.bad.length, JSON.stringify(d));
  await p.click('#su_later'); await p.waitForTimeout(250); await skipTour(p);
  await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.waitForTimeout(80);
  d = await diagram('#setAccounts .fd');
  check(`${tag}, Settings › Accounts: the same`, d.side === side && d.cards === names.length + 2 && !d.bad.length, JSON.stringify(d));
  await p.click('#sHelp summary'); await p.click('#helpHow'); await p.waitForTimeout(150);
  d = await diagram('#sheetB .fd');
  check(`${tag}, How Dovetail works: the same`, d.side === side && d.cards === names.length + 2 && !d.bad.length, JSON.stringify(d));
  check(`No JS errors (diagram, ${names.length} people)`, p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 3. Example household ----------
({ ctx, p } = await session({ native: true }));
await p.click('#su_example'); await p.waitForTimeout(250);
check('Example household opens on Pay with a clear banner', await p.isVisible('#tab-pay') && (await T(p, '#exampleBanner')).includes('example household'));
check('Example transfers reconcile', (await p.$$('#steps .step')).length >= 4 && (await p.$('#check')) === null);
await p.waitForTimeout(2800);
let st = await p.evaluate(() => window.__qaNative);
check('The example is never backed up', st.calls.filter(c => c[0] === 'save').length === 0);
await p.click('#exStart'); await p.click('#exStart'); await p.waitForTimeout(150);
check('"Start my own" clears the example and goes back to setup', await p.isVisible('#tab-setup') && (await LS(p, K.cfg)) === null && (await LS(p, K.mon)) === null);
check('…with no restore offer when the phone has no backups', (await p.$eval('#restoreOfferSetup', e => e.textContent)) === '');
await ctx.close();

// ---------- 4. A phone with automatic backups (reinstall or new phone) ----------
const backup = JSON.stringify(SAMPLE);
({ ctx, p } = await session({ native: true, storage: { 'qa.native': { backups: [{ name: 'backup-20261014-090000.json', savedAt: '2026-10-14T09:00:00', json: backup }], calls: [], lockOn: false, lockAvail: true, n: 0 } } }));
check('Setup offers the newest automatic backup', (await T(p, '#restoreOfferSetup')).includes('Found an automatic backup from 14 Oct 2026, 09:00'));
await p.waitForTimeout(1800); st = await p.evaluate(() => window.__qaNative);
check('Nothing is backed up while the offer is open', st.calls.filter(c => c[0] === 'save').length === 0);
await p.click('#restoreOfferSetup .btn:has-text("Restore backup")'); await p.waitForTimeout(300);
check('Restoring brings back our household on the Pay tab', await p.isVisible('#tab-pay') && (await T(p, '#payGrid')).includes('Alex') && (await float(p)) === '£267.02', await float(p));
await p.waitForTimeout(2700); st = await p.evaluate(() => window.__qaNative);
check('Automatic backups start again after restoring', st.calls.filter(c => c[0] === 'save').length >= 1);
await ctx.close();
({ ctx, p } = await session({ native: true, storage: { 'qa.native': { backups: [{ name: 'backup-20261014-090000.json', savedAt: '2026-10-14T09:00:00', json: backup }], calls: [], lockOn: false, lockAvail: true, n: 0 } } }));
await p.click('#restoreOfferSetup .btn:has-text("Start fresh")'); await p.waitForTimeout(100);
check('"Start fresh" hides the offer and stays on setup', (await T(p, '#restoreOfferSetup')) === '' && await p.isVisible('#tab-setup'));
await p.click('#su_example'); await p.waitForTimeout(200); await p.click('#exStart'); await p.click('#exStart'); await p.waitForTimeout(150);
check('Leaving the example household offers the automatic backup again', (await T(p, '#restoreOfferSetup')).includes('Found an automatic backup'));
await ctx.close();

// ---------- 5. Restore by pasting during setup ----------
({ ctx, p } = await session());
await p.click('#su_restore summary'); await p.fill('#backupIn', backup); await p.click('#restoreBtn'); await p.waitForTimeout(250);
check('Pasting a backup during setup restores it with one tap', await p.isVisible('#tab-pay') && (await T(p, '#payGrid')).includes('Sam'));
check('No JS errors (restore in setup)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
({ ctx, p } = await session());
await p.click('#su_restore summary'); await p.waitForTimeout(50);
check('"Restore from a backup" opens the file button and the paste box in place', await p.isVisible('#su_import') && (await T(p, '#su_import')) === 'Open a backup file' && await p.isVisible('#backupIn'));
const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#su_import')]);
await chooser.setFiles({ name: 'payday-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) }); await p.waitForTimeout(250);
check('Opening a backup file from the welcome step offers it', await p.isVisible('#importOffer') && (await T(p, '#importYes')) === 'Restore this backup');
await p.click('#importYes'); await p.waitForTimeout(250);
check('…and restores it', await p.isVisible('#tab-pay') && (await T(p, '#payGrid')).includes('Alex') && (await float(p)) === '£267.02');
check('A restored household doesn\'t get the checklist or the tour', !('setupTips' in await LS(p, K.cfg)) && !('tourDone' in await LS(p, K.cfg)));
check('No JS errors (restore a file in setup)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
// ---------- 6. "Finish setting up" on the Pay tab ----------
const tips = () => p.$$eval('#setupTips .checklist li', l => l.map(x => (x.classList.contains('done') ? 'done: ' : 'todo: ') + x.textContent.replace('Done: ', '')));
({ ctx, p } = await session());
await p.click('#su_later'); await p.waitForTimeout(200); await skipTour(p);
check('"Skip setup for now": the Pay tab lists everything still to do', JSON.stringify(await tips()) === JSON.stringify(['todo: Add your take-home pay', 'todo: Set your payday', 'todo: Add your bills', 'todo: Add spending budgets or savings']), (await tips()).join(' | '));
check('…a labelled card above the hero, with "0 of 4 done", and no old "add your bills" banner', (await T(p, '#tipsH')) === 'Finish setting up' && (await T(p, '#setupTips')).includes('0 of 4 done') && !(await T(p, '#tab-pay')).includes('Next: add your regular bills') &&
  await p.evaluate(() => document.getElementById('setupTips').compareDocumentPosition(document.getElementById('hero')) & Node.DOCUMENT_POSITION_FOLLOWING));
for (const [key, sec] of [['pay', 'sPeople'], ['payday', 'sPayday'], ['bills', 'sBills'], ['budgets', 'sBudget']]) {
  await p.click('#tip_' + key); await p.waitForTimeout(150);
  check(`"${key}" opens Settings › ${sec}`, await p.evaluate(() => location.hash) === '#settings' && await p.$eval('#' + sec, d => d.open));
  await p.evaluate(s => { document.getElementById(s).open = false; }, sec);
  await p.goBack(); await p.waitForTimeout(150);
}
check('…and Back returns to Pay each time', await p.isVisible('#tab-pay'));
await p.click('#tip_payday'); await p.waitForTimeout(150); await p.selectOption('#pay_day', '25'); await p.waitForTimeout(100);
await p.click('#t-pay'); await p.waitForTimeout(150);
check('Setting the payday ticks it off', JSON.stringify(await tips()) === JSON.stringify(['todo: Add your take-home pay', 'done: Set your payday', 'todo: Add your bills', 'todo: Add spending budgets or savings']) && (await T(p, '#setupTips')).includes('1 of 4 done'), (await tips()).join(' | '));
check('…the done item is a tick and words, not a button, and says "Done" to a screen reader', (await p.$('#tip_payday')) === null && (await p.$eval('#setupTips li.done', e => e.textContent)).startsWith('Done: ') && (await p.$eval('#setupTips li.done .tick', e => e.getAttribute('aria-hidden'))) === 'true');
await p.click('#tipsHide'); await p.waitForTimeout(100);
check('"Hide this" hides it, with focus on the pay card', (await p.$('#setupTips')) === null && (await p.evaluate(() => document.activeElement.id)) === 'payH' && !('setupTips' in await LS(p, K.cfg)));
await p.reload(); await p.waitForTimeout(250);
check('…for good', (await p.$('#setupTips')) === null);
check('No JS errors (checklist)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
({ ctx, p } = await session());
await walkSetup(p, 4, true); await p.click('#su_later'); await p.waitForTimeout(200); await skipTour(p);
check('Finish later from step 4: pay and payday done; bills and budgets to do', JSON.stringify(await tips()) === JSON.stringify(['done: Add your take-home pay', 'done: Set your payday', 'todo: Add your bills', 'todo: Add spending budgets or savings']), (await tips()).join(' | '));
await p.click('#tip_budgets'); await p.waitForTimeout(150); await p.click('#setBudget .linkbtn'); await p.waitForTimeout(80);
await p.fill('#setBudget input[id^="bu_n_"]', 'Food'); await p.fill('#setBudget input[id^="bu_a_"]', '400'); await p.waitForTimeout(700);
await p.click('#t-pay'); await p.waitForTimeout(150);
check('Adding a budget ticks that off', (await tips())[3] === 'done: Add spending budgets or savings' && (await T(p, '#setupTips')).includes('3 of 4 done'));
await p.click('#tip_bills'); await p.waitForTimeout(150); await p.click('#quickAddBtn'); await p.fill('#qa_n_0', 'Rent'); await p.fill('#qa_a_0', '900'); await p.click('#qa_add'); await p.waitForTimeout(150);
await p.click('#t-pay'); await p.waitForTimeout(150);
check('Once everything is done the card goes, for good', (await p.$('#setupTips')) === null && !('setupTips' in await LS(p, K.cfg)) && (await LS(p, K.cfg)).bills.length === 1);
await ctx.close();
({ ctx, p } = await session());
await p.click('#su_start'); await p.fill('#su_p_0', 'Pat'); await p.fill('#su_pu_0', '1500'); await p.click('#su_later'); await p.waitForTimeout(200);
check('Finish later from step 2: only pay is done', JSON.stringify(await tips()) === JSON.stringify(['done: Add your take-home pay', 'todo: Set your payday', 'todo: Add your bills', 'todo: Add spending budgets or savings']));
await ctx.close();
({ ctx, p } = await session());
await walkSetup(p, 7); await p.click('#su_finish'); await p.waitForTimeout(200);
check('A full setup has nothing left to do: no card, and the setting is dropped', (await p.$('#setupTips')) === null && !('setupTips' in await LS(p, K.cfg)));
await ctx.close();
({ ctx, p } = await session({ storage: sampleStorage(true) }));
check('An existing household never sees the card', (await p.$('#setupTips')) === null);
await ctx.close();
({ ctx, p } = await session());
await p.click('#su_example'); await p.waitForTimeout(200);
check('Nor does the example household', (await p.$('#setupTips')) === null && (await T(p, '#exampleBanner')).includes('example household'));
await ctx.close();

// ---------- 7. Start again ----------
({ ctx, p } = await session());
await p.click('#su_later'); await p.waitForTimeout(150); await skipTour(p); await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(100);
check('Start again isn\'t offered in a plain browser (there\'s nowhere to keep a backup)', (await p.$('#startAgain')) === null);
await ctx.close();
({ ctx, p } = await session({ native: true }));
await p.click('#su_example'); await p.waitForTimeout(150); await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(100);
check('…nor for the example household', (await p.$('#startAgain')) === null);
await ctx.close();
const WEALTH = { accounts: [{ name: 'Old ISA', value: 1234 }] };
({ ctx, p } = await session({ native: true, storage: { [K.w]: WEALTH } }));
await walkSetup(p, 7); await p.click('#su_finish'); await p.waitForTimeout(300); await skipTour(p);
await p.fill('#payGrid input >> nth=0', '2200'); await p.waitForTimeout(900); await p.click('#steps li:nth-child(1) .tick'); await p.waitForTimeout(900);
const before = { cfg: await LS(p, K.cfg), mon: await LS(p, K.mon), w: await p.evaluate(k => localStorage.getItem(k), K.w) };
check('(set-up) a household with a saved month and old Wealth data', Object.keys(before.mon).length === 1 && before.w.includes('Old ISA'));
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(100);
check('Start again is at the bottom of Backup, export & restore, saying what happens', (await T(p, '#setBackup')).includes('Set Dovetail up from scratch. Your current figures are saved as a backup on this phone first, kept for 30 days, and setup will offer to bring them back.') && (await T(p, '#startAgain')) === 'Start again');
await p.evaluate(() => { const s = window.__qaNative; s.calls = []; s.lockOn = true; window.__qaSave(); });
await p.click('#sPeople summary'); await p.fill('#setPeople input[id^="pp_n_"]', 'Alexander');
await p.click('#startAgain'); await p.waitForTimeout(30);
check('The first tap asks again', (await T(p, '[data-confirm=startAgain]')) === 'Tap again to start again' && await p.isVisible('#tab-settings'));
await p.click('[data-confirm=startAgain]'); await p.waitForTimeout(250);
st = await p.evaluate(() => window.__qaNative);
check('The second tap keeps a backup first, with a change made a moment before', JSON.stringify(st.calls.filter(c => c[0] === 'keep')) === '[["keep","Alexander,Sam"]]' && st.backups[0].kept, JSON.stringify(st.calls));
check('…clears the reminders on the phone (an empty schedule)', st.schedule && st.schedule.entries.length === 0 && st.calls.findIndex(c => c[0] === 'schedule') > st.calls.findIndex(c => c[0] === 'keep'));
check('…and leaves app lock and notifications alone', !st.calls.some(c => c[0] === 'lock' || c[0] === 'notify') && st.lockOn === true);
check('The household and its months are gone (the settings keep only this phone\'s appearance and notifications); the old Wealth data isn\'t', JSON.stringify(await LS(p, K.cfg)) === JSON.stringify({ schema: 5, appearance: before.cfg.appearance, notify: before.cfg.notify }) &&
  (await LS(p, K.mon)) === null && (await p.evaluate(k => localStorage.getItem(k), K.w)) === before.w, JSON.stringify(await LS(p, K.cfg)));
check('Setup starts again, with focus on its title', await p.isVisible('#tab-setup') && await p.isHidden('#tabbar') && (await T(p, '#suTitle')) === 'Welcome to Dovetail' && (await p.evaluate(() => document.activeElement.id)) === 'suTitle');
check('…offering to bring back what was there', (await T(p, '#restoreOfferSetup')).startsWith('Bring back what you had before?') && (await T(p, '#restoreOfferSetup')).includes('Restore backup') && (await T(p, '#restoreOfferSetup')).includes('Start fresh'));
await p.waitForTimeout(2700); st = await p.evaluate(() => window.__qaNative);
check('Nothing is backed up or scheduled while setup waits', !st.calls.some(c => c[0] === 'save') && st.calls.filter(c => c[0] === 'schedule').length === 1);
await p.click('#restoreOfferSetup .btn:has-text("Restore backup")'); await p.waitForTimeout(400);
const kept = JSON.parse(st.backups[0].json), after = { cfg: await LS(p, K.cfg), mon: await LS(p, K.mon) };
check('Restoring brings everything back exactly', await p.isVisible('#tab-pay') && JSON.stringify(after.cfg) === JSON.stringify(kept.config) && JSON.stringify(after.mon) === JSON.stringify(before.mon) &&
  after.cfg.people[0].name === 'Alexander' && JSON.stringify({ ...after.cfg, people: null }) === JSON.stringify({ ...before.cfg, people: null }), JSON.stringify([after.cfg.people, before.cfg.people]));
check('…the Wealth data is still the same', (await p.evaluate(k => localStorage.getItem(k), K.w)) === before.w);
await p.waitForTimeout(2300); st = await p.evaluate(() => window.__qaNative);
check('…and reminders are scheduled again', st.schedule && st.calls.filter(c => c[0] === 'schedule').length >= 2);
check('No JS errors (start again)', p.errs.length === 0, p.errs.join(' | '));
// a backup that can't be kept changes nothing
await p.evaluate(() => { window.__qaNative.keepFails = true; window.__qaSave(); });
const c1 = await LS(p, K.cfg), m1 = await LS(p, K.mon);
await p.click('#t-settings'); await p.waitForTimeout(100); if (!(await p.$eval('#sBackup', d => d.open))) await p.click('#sBackup summary');
await p.click('#startAgain'); await p.click('[data-confirm=startAgain]'); await p.waitForTimeout(200);
check('If the backup can\'t be kept, nothing changes, and it says so', await p.isVisible('#tab-settings') && (await T(p, '#toast')) === "Couldn't save a backup, so nothing was changed." &&
  JSON.stringify(await LS(p, K.cfg)) === JSON.stringify(c1) && JSON.stringify(await LS(p, K.mon)) === JSON.stringify(m1));
await ctx.close();
({ ctx, p } = await session({ native: true, storage: { [K.cfg]: SAMPLE.config, [K.mon]: SAMPLE.months, [K.w]: SAMPLE.wealth } }));
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.click('#startAgain'); await p.click('[data-confirm=startAgain]'); await p.waitForTimeout(250);
await p.click('#restoreOfferSetup .btn:has-text("Start fresh")'); await p.waitForTimeout(100);
check('"Start fresh" after Start again: a new setup, the old figures still in the backups', await p.isVisible('#tab-setup') && (await T(p, '#restoreOfferSetup')) === '' && (await p.evaluate(() => window.__qaNative.backups[0].kept)));
await p.click('#su_start'); await p.fill('#su_p_0', 'Jo'); await p.click('#su_later'); await p.waitForTimeout(250);
check('…and a new household from it, the Wealth data untouched', (await LS(p, K.cfg)).people[0].name === 'Jo' && JSON.stringify(await LS(p, K.w)) === JSON.stringify(SAMPLE.wealth) && (await LS(p, K.cfg)).setupTips === true);
await skipTour(p);
check('No JS errors (start fresh)', p.errs.length === 0, p.errs.join(' | '));
check('…and the phone\'s Back button on Pay leaves the app at once (Start again left no stray history entry)', await p.isVisible('#tab-pay') && await backLeaves(p), p.url());
await ctx.close();
({ ctx, p } = await session({ native: true, storage: sampleStorage(true) }));
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.click('#startAgain'); await p.click('[data-confirm=startAgain]'); await p.waitForTimeout(250);
await p.click('#restoreOfferSetup .btn:has-text("Restore backup")'); await p.waitForTimeout(400);
check('Start again, then Restore backup: back on Pay, and Back leaves the app at once', await p.isVisible('#tab-pay') && (await float(p)) === '£267.02' && (await p.evaluate(() => history.state)) === null && await backLeaves(p), p.url());
await ctx.close();

// Start again, then the app is closed before setup finishes (Android closes it, or the phone restarts). The phone's own
// settings (dark, larger text, notifications at 18:30 with amounts) must survive, and the backup is still offered.
const MINE = { appearance: { theme: 'dark', textSize: 'large' }, notify: { on: true, time: '18:30', amounts: true } };
async function startAgainThenReopen() {
  const r = await session({ native: true, storage: { [K.cfg]: { ...SAMPLE.config, ...MINE }, [K.mon]: SAMPLE.months, [K.w]: SAMPLE.wealth,
    'qa.native': { backups: [], calls: [], lockOn: false, lockAvail: true, n: 0, notifyOn: true } } });
  const q = r.p, look = () => q.evaluate(() => [document.documentElement.getAttribute('data-theme'), document.documentElement.getAttribute('data-text')].join());
  const was = { cfg: await LS(q, K.cfg), mon: await LS(q, K.mon), look: await look(), float: await float(q) };
  await q.click('#t-settings'); await q.click('#sBackup summary'); await q.click('#startAgain'); await q.click('[data-confirm=startAgain]'); await q.waitForTimeout(250);
  const kept = await LS(q, K.cfg);
  await q.evaluate(() => { window.__qaNative.calls = []; window.__qaSave(); });
  await q.reload(); await q.waitForTimeout(300);
  return { ...r, was, kept, look, calls: (await q.evaluate(() => window.__qaNative.calls)) };
}
let re = await startAgainThenReopen();
({ ctx, p } = re);
check('(set-up) dark, larger text and notifications at 18:30 with amounts, before Start again', re.was.look === 'dark,large' && JSON.stringify(re.was.cfg.notify) === JSON.stringify(MINE.notify) && re.was.float === '£267.02', JSON.stringify(re.was));
check('Start again keeps only this phone\'s settings: no household, no setupDone', JSON.stringify(re.kept) === JSON.stringify({ schema: 5, ...MINE }), JSON.stringify(re.kept));
check('Reopened before setup finished: setup, still dark with larger text', await p.isVisible('#tab-setup') && (await T(p, '#suTitle')) === 'Welcome to Dovetail' && (await re.look()) === 'dark,large', await re.look());
check('…and the app is told "dark", never "system"', JSON.stringify(re.calls.filter(c => c[0] === 'theme')) === '[["theme","dark"]]', JSON.stringify(re.calls));
check('…with the backup it kept offered', (await T(p, '#restoreOfferSetup')).includes('Found an automatic backup from') && (await T(p, '#restoreOfferSetup')).includes('Restore backup') && (await T(p, '#restoreOfferSetup')).includes('Start fresh'), await T(p, '#restoreOfferSetup'));
await p.waitForTimeout(1800);
check('…and nothing is backed up or scheduled while it waits', !(await p.evaluate(() => window.__qaNative.calls)).some(c => c[0] === 'save' || c[0] === 'schedule'));
await p.click('#restoreOfferSetup .btn:has-text("Restore backup")'); await p.waitForTimeout(400);
let back = await LS(p, K.cfg);
check('Restore backup: appearance and notifications exactly as before', JSON.stringify(back.appearance) === JSON.stringify(MINE.appearance) && JSON.stringify(back.notify) === JSON.stringify(MINE.notify) && (await re.look()) === 'dark,large', JSON.stringify([back.appearance, back.notify]));
check('…and every figure exactly as before', await p.isVisible('#tab-pay') && JSON.stringify(back) === JSON.stringify(re.was.cfg) && JSON.stringify(await LS(p, K.mon)) === JSON.stringify(re.was.mon) && (await float(p)) === '£267.02', await float(p));
check('No JS errors (start again, reopened, restored)', p.errs.length === 0, p.errs.join(' | '));
check('…and Back on Pay leaves the app at once', await backLeaves(p), p.url());
await ctx.close();
re = await startAgainThenReopen();
({ ctx, p } = re);
await p.click('#restoreOfferSetup .btn:has-text("Start fresh")'); await p.waitForTimeout(100);
await p.click('#su_start'); await p.fill('#su_p_0', 'Jo'); await p.click('#su_later'); await p.waitForTimeout(300); await skipTour(p);
back = await LS(p, K.cfg);
check('Start fresh after reopening: the new household keeps this phone\'s appearance and notifications', back.people[0].name === 'Jo' && JSON.stringify(back.appearance) === JSON.stringify(MINE.appearance) &&
  JSON.stringify(back.notify) === JSON.stringify(MINE.notify) && (await re.look()) === 'dark,large', JSON.stringify([back.appearance, back.notify]));
check('No JS errors (start again, reopened, start fresh)', p.errs.length === 0, p.errs.join(' | '));
check('…and Back on Pay leaves the app at once', await p.isVisible('#tab-pay') && await backLeaves(p), p.url());
await ctx.close();
await finish();
