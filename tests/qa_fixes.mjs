// 2.12.1: fixes from the household simulation (tests/sim). Setup puts shared spending, savings and other income in the
// shared account (never one person's or a boarder's) and asks only for amounts it uses; a household with a boarder
// doesn't count the boarder's own money as its left over; a joint account that's short is named, and a top-up from an
// account with nothing in it isn't a transfer to make. Made-up households only.
import { suite, session, K, LS, T, axe, noSideScroll, household, steps, skipTour } from './lib.mjs';
const { check, finish } = suite('2.12.1: fixes from the household simulation');
const TODAY = '2026-10-21';
const selText = (p, sel) => p.$eval(sel, s => s.options[s.selectedIndex].text);
const focusId = p => p.evaluate(() => document.activeElement && document.activeElement.id);

/** Setup up to step 4 with these people ([name, usual pay]), no payday. Returns the messages shown on the way. */
async function toStep4(p, people, income) {
  await p.click('#su_start');
  for (let i = 0; i < people.length; i++) { if (i) await p.click('#su_addp'); await p.fill('#su_p_' + i, people[i][0]); await p.fill('#su_pu_' + i, people[i][1]); }
  if (income) { await p.click('#su_addi'); await p.fill('#su_in_0', income[0]); await p.fill('#su_inv_0', income[1]); }
  await p.click('#su_next'); await p.waitForTimeout(60);
  const stayed = (await p.textContent('#suTitle')) === 'Your pay';
  if (stayed) { await p.click('#su_next'); await p.waitForTimeout(60); }
  await p.click('#su_skip'); await p.waitForTimeout(60);
  return { stayed };
}
const toSpend = async p => { await p.click('#su_next'); await p.waitForTimeout(60); await p.click('#su_next'); await p.waitForTimeout(60); };

// ---------- 1. Shared spending, savings and income start in the joint account ----------
let { ctx, p } = await session({ today: TODAY });
await toStep4(p, [['Alex', '3000'], ['Sam', '2000']], ['Child Benefit', '110']);
await p.check('#su_style_contribute'); await p.check('#su_rule_pay'); await p.waitForTimeout(60);
check('Each paying into a joint account: other income goes into the joint account', (await selText(p, '#su_ia_0')) === 'Joint account', await selText(p, '#su_ia_0'));
await toSpend(p);
check('…and a budget and a savings transfer are kept in it', (await selText(p, '#su_g_0_s')) === 'Joint account' && (await selText(p, '#su_v_0_s')) === 'Joint account', await selText(p, '#su_g_0_s'));
await p.click('#su_addg'); await p.waitForTimeout(40);
check('…a budget added there too', (await selText(p, '#su_g_1_s')) === 'Joint account');
await p.selectOption('#su_g_1_s', { label: "Alex's account" }); await p.fill('#su_g_1_n', 'Fuel'); await p.fill('#su_g_1_a', '80');
// Back to the questions: one of us pays the bills (Sam). Budgets nobody moved follow; the one moved by hand stays.
await p.click('#su_back'); await p.click('#su_back'); await p.waitForTimeout(60);
await p.check('#su_style_housekeeping'); await p.check('#su_payer_1'); await p.check('#su_rule_sameLeft'); await p.waitForTimeout(60);
check('One of us paying the bills (Sam): other income follows to Sam\'s account', (await selText(p, '#su_ia_0')) === "Sam's account", await selText(p, '#su_ia_0'));
await toSpend(p);
check('…so do the budget and savings nobody moved; the one moved by hand stays', (await selText(p, '#su_g_0_s')) === "Sam's account" && (await selText(p, '#su_v_0_s')) === "Sam's account" && (await selText(p, '#su_g_1_s')) === "Alex's account",
  [await selText(p, '#su_g_0_s'), await selText(p, '#su_g_1_s')].join(' | '));
check('No JS errors (defaults)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2. Only amounts setup uses ----------
({ ctx, p } = await session({ today: TODAY }));
const two = await toStep4(p, [['Alex', '3000'], ['Sam', '']]);
check('One earner: Next on the pay step goes straight on (no "Without pay" stop)', !two.stayed);
await p.check('#su_style_housekeeping'); await p.check('#su_payer_1'); await p.waitForTimeout(60);
check('The bill payer has no pay: "Half each" isn\'t offered, and says why', !(await p.$('#su_rule_equal')) && (await T(p, '#su_nohalf')) === "Sam has no pay of their own, so “Half each” isn't offered: they'd have nothing to pay their share from.", await T(p, '#su_nohalf').catch(() => ''));
check('…the other three are', await p.isVisible('#su_rule_pay') && await p.isVisible('#su_rule_sameLeft') && await p.isVisible('#su_rule_set'));
await p.check('#su_payer_0'); await p.waitForTimeout(60);
// 2.13: Alex is the only earner and pays the bills, so how to split them isn't asked at all.
check('…and with the only earner paying, the split isn\'t asked', !(await p.$('#su_rule_equal')) && !(await p.$('#su_nohalf')) && await p.isVisible('#su_oneearner'));
check('No axe violations (no half each)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await ctx.close();

({ ctx, p } = await session({ today: TODAY }));
await toStep4(p, [['Alex', '3000'], ['Sam', '2000']]);
await p.check('#su_style_housekeeping'); await p.check('#su_payer_1'); await p.check('#su_rule_set'); await p.waitForTimeout(60);
check('Set amounts, one of us paying the bills: a box for Alex only (Sam pays what\'s left from their own account)', await p.isVisible('#su_set_0') && !(await p.$('#su_set_1')));
await p.fill('#su_set_0', '800'); await p.waitForTimeout(60);
check('…the diagram says so', (await T(p, '#su_dia')).includes('Sam pays what it needs. Alex pays a set amount into it.'), await T(p, '#su_dia'));
await p.click('#su_next'); await p.waitForTimeout(60);
check('…and Next goes on', (await p.textContent('#suTitle')) === 'Your bills');
await ctx.close();

// ---------- 3. Board: no spending money asked, defaults never theirs, their money apart ----------
({ ctx, p } = await session({ today: TODAY }));
await toStep4(p, [['Alex', '3000'], ['Sam', '2000'], ['Kit', '1200']]);
await p.check('#su_style_pool'); await p.check('#su_shape_own'); await p.check('#su_fun_yes'); await p.check('#su_board_2_yes'); await p.waitForTimeout(60);
check('Someone paying board isn\'t asked for spending money', await p.isVisible('#su_funv_0') && await p.isVisible('#su_funv_1') && !(await p.$('#su_funv_2')));
await p.fill('#su_funv_0', '150'); await p.fill('#su_funv_1', '150'); await p.fill('#su_boardv_2', '300');
check('No axe violations (board questions)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#su_next'); await p.waitForTimeout(60);
await p.fill('#setup .su-bsec .qa-row input[id$="_0_n"]', 'Rent'); await p.fill('#setup .su-bsec .qa-row input[id$="_0_a"]', '1200');
await p.click('#su_next'); await p.waitForTimeout(60);
check('A budget and a savings transfer start in the joint account, not Kit\'s', (await selText(p, '#su_g_0_s')) === 'Joint account' && (await selText(p, '#su_v_0_s')) === 'Joint account');
await p.fill('#su_g_0_n', 'Food shopping'); await p.fill('#su_g_0_a', '500');
await p.click('#su_next'); await p.waitForTimeout(60);
check('The first payday: what\'s left is the household\'s, without Kit\'s own money', (await T(p, '#su_left')).replace(/\s+/g, ' ').includes('£3,300.00'), await T(p, '#su_left'));
await p.click('#su_finish'); await p.waitForTimeout(250); await skipTour(p);
let c = await LS(p, K.cfg);
check('Saved: Kit pays board, with no spending money of their own', c.people[2].boarder === true && !c.people[0].boarder && !c.budgets.some(b => b.name.startsWith('Kit')));
check('Pay tab: the board is a transfer, first', (await steps(p))[0] === "Kit's account (Kit) → Joint account £300.00", (await steps(p)).join(' | '));
check('…the top card shows the household\'s left over, without Kit\'s own money', (await p.textContent('#heroFloat')) === '£3,300.00' && (await p.textContent('#heroH')) === 'Left over this month', await p.textContent('#heroFloat'));
await p.click('#payDetails summary'); await p.waitForTimeout(80);
check('This month in detail: Kit\'s account after the transfers, marked as their own money', /Kit's account after the transfers\s+Their own money, so it isn't counted in what the household has left\./.test(await T(p, '#floatCards')), await T(p, '#floatCards'));
check('No axe violations (Pay with a boarder)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#t-settings'); await p.click('#sPeople summary'); await p.waitForTimeout(80);
check('Settings › People: "Pays board" is ticked for Kit; not offered for Sam, whose money goes to the joint account', await p.isChecked('#pp_b_' + c.people[2].id) && !(await p.$('#pp_b_' + c.people[1].id)) && !(await p.$('#pp_b_' + c.people[0].id)));
await p.uncheck('#pp_b_' + c.people[2].id); await p.waitForTimeout(150);
check('…unticking it saves', !('boarder' in (await LS(p, K.cfg)).people[2]));
check('No JS errors (board)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 4. A joint account short of its set amounts ----------
const setShort = () => household({ lastVersion: '2.12.1', payday: { day: 28, weekend: true },
  people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: 2000 }],
  accounts: [{ id: 'A', name: 'Alex current', colour: 'blue', leftoverTo: null }, { id: 'S', name: 'Sam current', colour: 'teal', leftoverTo: null },
    { id: 'JB', name: 'Joint bills', colour: 'purple', leftoverTo: 'JS', funding: { people: ['alex', 'sam'], rule: 'set', set: { alex: { amount: 500 }, sam: { amount: 300 } } } },
    { id: 'JS', name: 'Joint spending', colour: 'orange', leftoverTo: null }],
  bills: [{ id: 'b1', name: 'Rent', amount: 1200, account: 'JB', months: [] }], budgets: [{ id: 'g1', name: 'Food', amount: 100, account: 'JS' }] });
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: setShort() } }));
check('Set amounts too low: only the set amounts are transfers (no top-up from an empty account)', JSON.stringify(await steps(p)) === JSON.stringify(['Alex current (Alex) → Joint bills £500.00', 'Sam current (Sam) → Joint bills £300.00']), JSON.stringify(await steps(p)));
check('…a warning says what\'s short and what to do', (await T(p, '#cant_JB')) === 'Joint bills is £400.00 short, and Joint spending has nothing to top it up with. Raise the set amounts paid into it, or move money into it.', await T(p, '#cant_JB'));
const hero = await T(p, '#hero');
check('…the top card names the short joint accounts, as well as what each person keeps', hero.includes('Joint bills is short by £400.00') && hero.includes('Joint spending is short by £100.00') && hero.includes('Alex keeps £2,500.00'), hero);
check('…people\'s own accounts aren\'t named twice', !hero.includes('Alex current is short'));
check('No axe violations (short joint accounts)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
// Settings › Accounts: equal shares with someone with no usual pay.
const eq = setShort(); eq.people[1].usualPay = 0; eq.accounts[2].funding = { people: ['alex', 'sam'], rule: 'equal' };
await ctx.close();
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: eq } }));
await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.waitForTimeout(100);
check('Settings › Accounts: equal shares with someone who has no usual pay says so (no "untick them")', (await T(p, '#ac_fprob_JB')) === "Sam has no usual pay, so an equal share would leave Sam's account short. In proportion to usual pay leaves them out.", await T(p, '#ac_fprob_JB'));
check('No JS errors (short joint accounts)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 5. 360px, dark, larger text ----------
({ ctx, p } = await session({ today: TODAY, w: 360, dark: true }));
await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
await toStep4(p, [['Alexandra', ''], ['Bartholomew', '2400']]);
await p.check('#su_style_housekeeping'); await p.check('#su_payer_0'); await p.waitForTimeout(80);
check('Dark, 360px, larger text: the "half each" note fits', await p.isVisible('#su_nohalf') && await noSideScroll(p, 360));
check('No axe violations (dark, larger text)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('Focus stays on the answer just picked', (await focusId(p)) === 'su_payer_0');
await ctx.close();

// ---------- 6. From the review: no "half each" behind the scenes, Settings' tick where it counts, What's new ----------
({ ctx, p } = await session({ today: TODAY }));
await toStep4(p, [['Alex', '3000'], ['Sam', '']]);
await p.check('#su_style_housekeeping'); await p.check('#su_payer_1'); await p.waitForTimeout(60);
check('No rule picked yet, bill payer with no pay: the diagram doesn\'t say "half each"', !(await T(p, '#su_dia')).includes('half each'), await T(p, '#su_dia'));
check('…the note is linked to the choices for screen readers', (await p.getAttribute('#setup fieldset:has(#su_rule_pay)', 'aria-describedby')) === 'su_nohalf');
await p.click('#su_next'); await p.waitForTimeout(80);
check('…Next asks for a split and puts focus on the first one offered', (await T(p, '#su_msg')).includes('Choose how you split the bills') && (await focusId(p)) === 'su_rule_pay');
await p.click('#su_later'); await p.waitForTimeout(250); await skipTour(p);
c = await LS(p, K.cfg);
check('…"Finish later" saves the split by pay, not half each', c.accounts.find(a => a.funding && a.funding.people.length > 1).funding.rule === 'pay', JSON.stringify(c.accounts));
await p.click('#t-settings'); await p.click('#sPeople summary'); await p.waitForTimeout(80);
check('Settings › People: no "Pays board" for Sam, whose account Alex pays into', !(await p.$('#pp_b_' + c.people[1].id)));
check('No JS errors (no half each)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

const ownTwo = () => household({ lastVersion: '2.12.1', payday: { day: 28, weekend: true },
  people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'kit', name: 'Kit', payAccount: 'K', usualPay: 1200 }],
  accounts: [{ id: 'A', name: 'Alex current', colour: 'blue', leftoverTo: null, funding: { people: ['kit'], rule: 'set', set: { kit: { amount: 300 } } } }, { id: 'K', name: 'Kit current', colour: 'teal', leftoverTo: null }],
  bills: [{ id: 'b1', name: 'Rent', amount: 1000, account: 'A', months: [] }] });
({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: ownTwo() } }));
await p.click('#t-settings'); await p.click('#sPeople summary'); await p.waitForTimeout(80);
check('Settings › People: "Pays board" for Kit, whose own account keeps what\'s left, with its hint linked', await p.isVisible('#pp_b_kit') && (await p.getAttribute('#pp_b_kit', 'aria-describedby')) === 'pp_b_kit_h');
await p.check('#pp_b_kit'); await p.waitForTimeout(150);
check('…ticking it saves and keeps focus on it', (await LS(p, K.cfg)).people[1].boarder === true && (await focusId(p)) === 'pp_b_kit');
await p.click('#t-pay'); await p.waitForTimeout(100);
check('…and the top card is the household\'s left over (£2,300.00), without Kit\'s', (await p.textContent('#heroFloat')) === '£2,300.00', await p.textContent('#heroFloat'));
await ctx.close();

// Updating from before 2.12 (straight from 2.11) shows 2.12's lines too; from 2.12, this version's and 2.12.1's.
for (const [from, more] of [['2.11', true], ['2.12', false]]) {
  const h = ownTwo(); h.lastVersion = from;
  ({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: h } }));
  const t = await T(p, '#whatsNew');
  const heads = await p.$$eval('#whatsNew b', l => l.map(b => b.textContent));
  check(`What's new after updating from ${from}: ${more ? 'with' : 'without'} 2.12's lines`, t.includes("What's new in 2.13") && heads.includes('In 2.12') === more && heads.includes('In 2.12.1') && (await p.$$('#whatsNew li')).length === (more ? 9 : 6), t);
  await ctx.close();
}

await finish();
