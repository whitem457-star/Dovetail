// The flexible household: transfers worked out from people, accounts and "leftover goes to", for different
// household shapes, plus editing people and accounts in Settings (loops prevented, deleting moves items).
import { suite, session, household, K, T, LS, steps, float } from './lib.mjs';
const { check, finish } = suite('Household shapes and settings');
const open = (h, extra = {}) => session(Object.assign({ storage: { [K.cfg]: household(h) } }, extra));
const txt = (p, s) => p.$eval(s, e => e.textContent);
// The money-flow diagram in Settings › Accounts: one plain sentence per account (what a screen reader hears).
const flow = p => p.$$eval('#setAccounts .fd li > .sr', l => l.map(x => x.textContent).join(' '));

// ---------- 1. One person, one account ----------
let { ctx, p } = await open({ people: [{ id: 'pat', name: 'Pat', payAccount: 'main', usualPay: 2000 }], accounts: [{ id: 'main', name: 'Current account', colour: 'blue', leftoverTo: null }],
  bills: [{ id: 'b1', name: 'Rent', amount: 900, account: 'main', months: [] }], budgets: [{ id: 'g1', name: 'Food', amount: 300, account: 'main' }] });
check('Single person: no transfers needed', (await T(p, '#steps')).includes('No transfers needed') && (await T(p, '#progressText')) === '');
check('Single person: float = pay − bills − budgets (£800.00)', (await float(p)) === '£800.00');
check('Single person: one pay box labelled with the name', (await p.$$('#payGrid input')).length === 1 && (await T(p, '#payGrid')).includes('Pat'));
check('Single person: card is named after the account', (await txt(p, '#floatCards')).includes('Current account after the transfers'));
check('Single person: the card lists the pay without an owner label', !(await txt(p, '#floatCards')).includes('(Pat)'));
check('The figures reconcile (no warning shown)', (await p.$('#check')) === null);
await ctx.close();

// ---------- 2. A couple with no joint account ----------
const couple = { people: [{ id: 'ann', name: 'Ann', payAccount: 'acA', usualPay: 1500 }, { id: 'ben', name: 'Ben', payAccount: 'acB', usualPay: 1200 }],
  accounts: [{ id: 'acA', name: 'Ann current', colour: 'blue', leftoverTo: null }, { id: 'acB', name: 'Ben current', colour: 'red', leftoverTo: 'acA' }],
  bills: [{ id: 'b1', name: 'Rent', amount: 1000, account: 'acA', months: [] }, { id: 'b2', name: 'Phone', amount: 20, account: 'acB', months: [] }] };
({ ctx, p } = await open(couple));
let s = await steps(p);
check('Couple: Ben sends his leftover (£1,180.00) to Ann', s.length === 1 && s[0] === 'Ben current (Ben) → Ann current (Ann) £1,180.00', s.join(' | '));
check('Couple: Ann\'s float £1,680.00', (await float(p)) === '£1,680.00');
check('Couple: Ann\'s card shows what arrives from Ben and her pay', (await txt(p, '#floatCards')).includes('Arrives from Ben current') && (await txt(p, '#floatCards')).includes("Ann's pay"));
await p.fill('#pay_ben', '1300'); await p.waitForTimeout(100);
check('Couple: typing Ben\'s pay updates his transfer (£1,280.00)', (await steps(p))[0].endsWith('£1,280.00'));

// Settings: people
await p.click('#t-settings'); await p.click('#sPeople summary');
await p.click('#setPeople .linkbtn'); await p.waitForTimeout(50);
const newPid = await p.evaluate(() => document.activeElement.id);
check('Adding a person focuses their name', /^pp_n_/.test(newPid));
await p.fill('#' + newPid, 'Cal'); await p.waitForTimeout(700);
let cfg = await LS(p, K.cfg);
check('New person saved, paid into the first account', cfg.people.length === 3 && cfg.people[2].name === 'Cal' && cfg.people[2].payAccount === 'acA');
await p.click('#t-pay'); await p.waitForTimeout(100);
check('Pay tab gets a pay box for the new person', (await T(p, '#payGrid')).includes('Cal') && (await p.$$('#payGrid input')).length === 3);
check('Typed pay for others is kept when the pay boxes are rebuilt', (await p.inputValue('#pay_ben')) === '1300.00');

// Settings: accounts, loops and the flow preview
await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.waitForTimeout(50);
check('Flow diagram: Ben current\'s money moves to Ann current, which keeps what\'s left', (await flow(p)).includes("Ben's pay arrives in Ben current. What's left moves to Ann current.") && (await flow(p)).includes("It also gets what's left from Ben current. It keeps what's left: your left over."), await flow(p));
let optsA = await p.$$eval('#ac_l_acA option', o => o.map(x => x.value));
check('Ann\'s account can\'t send its leftover to itself or to Ben (who sends to Ann): loop prevented', JSON.stringify(optsA) === '[""]', JSON.stringify(optsA));
await p.click('#setAccounts > .linkbtn'); await p.waitForTimeout(50);
const acId = await p.evaluate(() => document.activeElement.id);
await p.fill('#' + acId, 'Joint pot'); await p.waitForTimeout(700);
cfg = await LS(p, K.cfg);
const joint = cfg.accounts.find(a => a.name === 'Joint pot');
check('New account added, leftover going to the account that keeps its leftover', joint && joint.leftoverTo === 'acA');
optsA = await p.$$eval('#ac_l_acA option', o => o.map(x => x.value));
check('Ann\'s account still can\'t point at accounts that send to it', JSON.stringify(optsA) === '[""]', JSON.stringify(optsA));
await p.selectOption('#ac_l_' + joint.id, ''); await p.waitForTimeout(100);
await p.selectOption('#ac_l_acA', joint.id); await p.waitForTimeout(100);
cfg = await LS(p, K.cfg);
check('Re-pointing works: Ann current → Joint pot, which keeps its leftover', cfg.accounts.find(a => a.id === 'acA').leftoverTo === joint.id && cfg.accounts.find(a => a.id === joint.id).leftoverTo === null);
check('Flow diagram shows the three-account chain', (await flow(p)).includes("Ben's pay arrives in Ben current. What's left moves to Ann current.") && (await flow(p)).includes("It also gets what's left from Ben current. What's left moves to Joint pot.") && (await flow(p)).includes("Joint pot gets what's left from Ann current. It keeps what's left: your left over."), await flow(p));
await p.click('#t-pay'); await p.waitForTimeout(100);
s = await steps(p);
check('Chain: deepest transfer first (Ben → Ann, then Ann → Joint pot)', s.length === 2 && s[0].startsWith('Ben current (Ben) → Ann current') && s[1].startsWith('Ann current → Joint pot'), s.join(' | '));
check('Chain: all money ends up in Joint pot\'s float (£1,780.00)', (await float(p)) === '£1,780.00' && (await p.$('#check')) === null);

// delete an account and move what uses it
await p.click('#t-settings'); await p.waitForTimeout(50);
await p.click('#acct_acB .btn.danger');
check('Deleting asks where its items should go', (await T(p, '#acct_acB')).includes('Move everything that uses Ben current to:'));
await p.selectOption('#ac_mv_acB', 'acA'); await p.click('#ac_del_go_acB'); await p.waitForTimeout(150);
cfg = await LS(p, K.cfg);
check('Account deleted; its bill and Ben\'s pay moved to Ann current', !cfg.accounts.some(a => a.id === 'acB') && cfg.bills.find(b => b.id === 'b2').account === 'acA' && cfg.people.find(x => x.id === 'ben').payAccount === 'acA');
await p.click('#t-pay'); await p.waitForTimeout(100);
s = await steps(p);
check('After deleting: one transfer, Ann current → Joint pot, still reconciles', s.length === 1 && s[0].startsWith('Ann current → Joint pot') && (await float(p)) === '£1,780.00' && (await p.$('#check')) === null, s.join(' | ') + ' ' + await float(p));

// budgets, savings and income from Settings
await p.click('#t-settings'); await p.click('#sBudget summary'); await p.click('#setBudget .linkbtn'); await p.waitForTimeout(50);
const bn = await p.evaluate(() => document.activeElement.id);
await p.fill('#' + bn, 'Food'); await p.fill('#' + bn.replace('_n_', '_a_'), '400'); await p.waitForTimeout(700);
await p.click('#sSavings summary'); await p.click('#setSavings .linkbtn'); await p.waitForTimeout(50);
const sn = await p.evaluate(() => document.activeElement.id);
await p.fill('#' + sn, 'Holiday'); await p.fill('#' + sn.replace('_n_', '_a_'), '150'); await p.waitForTimeout(700);
await p.click('#sIncome summary'); await p.click('#setIncome .linkbtn'); await p.waitForTimeout(50);
const inn = await p.evaluate(() => document.activeElement.id);
await p.fill('#' + inn, 'Child Benefit'); await p.fill('#' + inn.replace('_n_', '_a_'), '100'); await p.selectOption('#' + inn.replace('_n_', '_s_'), 'acA'); await p.waitForTimeout(700);
cfg = await LS(p, K.cfg);
check('Budget, savings transfer and income saved, from/into the chosen accounts', cfg.budgets[0].name === 'Food' && cfg.budgets[0].account === joint.id && cfg.savings[0].fromAccount === joint.id && cfg.income[0].account === 'acA');
await p.click('#t-pay'); await p.waitForTimeout(100);
s = await steps(p);
check('Savings transfer appears as a step from Joint pot; income passes through Ann current', s.length === 2 && s[0].endsWith('£1,880.00') && s[1] === 'Joint pot → Holiday £150.00', s.join(' | '));
check('Float after budget and savings: £1,330.00', (await float(p)) === '£1,330.00');
check('No JS errors (couple)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 3. Top-up: an account that can't cover its own bills ----------
({ ctx, p } = await open({ people: [{ id: 'q', name: 'Quinn', payAccount: 'x', usualPay: 500 }, { id: 'r', name: 'Rae', payAccount: 'y', usualPay: 2000 }],
  accounts: [{ id: 'x', name: 'Bills A', colour: 'blue', leftoverTo: 'y' }, { id: 'y', name: 'Hub', colour: 'purple', leftoverTo: 'z' }, { id: 'z', name: 'Spending', colour: 'orange', leftoverTo: null }],
  bills: [{ id: 'b1', name: 'Mortgage', amount: 700, account: 'x', months: [] }, { id: 'b2', name: 'Energy', amount: 100, account: 'y', months: [] }],
  budgets: [{ id: 'g', name: 'Food', amount: 200, account: 'z' }] }));
s = await steps(p);
check('Top-up: surplus moves first (Hub → Spending £1,700), then Hub tops up Bills A (£200)', s.length === 2 && s[0] === 'Hub (Rae) → Spending £1,700.00' && s[1] === 'Hub (Rae) → Bills A (Quinn) £200.00', s.join(' | '));
check('Top-up step is explained', (await T(p, '#steps')).includes("Bills A doesn't have enough for its own bills this month") && (await T(p, '#warnings')).includes('tops it up with £200.00'));
check('Top-up: float £1,500.00 and reconciles', (await float(p)) === '£1,500.00' && (await p.$('#check')) === null);
await p.locator('#steps .tick').nth(1).click(); await p.waitForTimeout(150);
check('Top-up tick stored as t:y>x', (await LS(p, K.mon))['2026-11'].done['t:y>x'] === 200);
await ctx.close();

// ---------- 4. Two accounts that keep their leftover; a short root ----------
({ ctx, p } = await open({ people: [{ id: 'a', name: 'Avi', payAccount: 'k1', usualPay: 1000 }, { id: 'b', name: 'Bo', payAccount: 'k2', usualPay: 800 }],
  accounts: [{ id: 'k1', name: 'Avi bank', colour: 'blue', leftoverTo: null }, { id: 'k2', name: 'Bo bank', colour: 'green', leftoverTo: null }],
  bills: [{ id: 'b1', name: 'Car loan', amount: 1100, account: 'k1', months: [] }, { id: 'b2', name: 'Gym', amount: 30, account: 'k2', months: [] }] }));
check('Two keeping accounts: two float cards and a total', (await p.$$('#floatCards > section')).length === 3 && (await float(p)) === '−£100.00' && (await txt(p, '#floatV_k2')) === '£770.00' && (await txt(p, '#floatTotal')) === '£670.00', await txt(p, '#floatCards'));
check('A keeping account that ends up short is flagged', (await T(p, '#warnings')).includes('Avi bank will be short by £100.00'));
check('Still reconciles across both', (await p.$('#check')) === null);
await ctx.close();

// ---------- 5. Depth ordering in a longer chain ----------
({ ctx, p } = await open({ people: [{ id: 'p', name: 'Pip', payAccount: 'w', usualPay: 1000 }],
  accounts: [{ id: 'z', name: 'Z', colour: 'blue', leftoverTo: null }, { id: 'y', name: 'Y', colour: 'blue', leftoverTo: 'z' }, { id: 'x', name: 'X', colour: 'blue', leftoverTo: 'y' }, { id: 'w', name: 'W', colour: 'blue', leftoverTo: 'x' }],
  bills: [{ id: 'b', name: 'B', amount: 100, account: 'x', months: [] }] }));
s = await steps(p);
check('Four-level chain: W → X, then X → Y, then Y → Z', JSON.stringify(s) === JSON.stringify(['W (Pip) → X £1,000.00', 'X → Y £900.00', 'Y → Z £900.00']), s.join(' | '));
await ctx.close();

// ---------- 6. Bad data (a loop from an edited backup) doesn't break anything ----------
({ ctx, p } = await open({ people: [{ id: 'p', name: 'Pip', payAccount: 'a', usualPay: 1000 }],
  accounts: [{ id: 'a', name: 'A', colour: 'blue', leftoverTo: 'b' }, { id: 'b', name: 'B', colour: 'red', leftoverTo: 'a' }, { id: 'c', name: 'C', colour: 'teal', leftoverTo: 'missing' }],
  bills: [{ id: 'b1', name: 'Orphan', amount: 10, account: 'gone', months: [] }] }));
check('A loop or a missing account counts as "keeps its leftover" (no crash)', p.errs.length === 0 && (await p.$$('#floatCards > section')).length === 4, p.errs.join(' | '));
check('A bill on a missing account shows up as a reconciliation problem', (await T(p, '#check')).includes('off by £10.00'));
check('…as a warning in the hero, with a way to fix it', (await p.$('#hero #check.banner.bad')) !== null && (await T(p, '#check')).includes('points at an account in Settings'));
await p.click('#check button');
check('"Open accounts" opens Settings at Accounts', await p.$eval('#sAccounts', d => d.open && !document.getElementById('tab-settings').hidden));
await p.click('#sBills summary');
check('…and is listed in Settings under "Not linked to an account"', (await T(p, '#setBills')).includes('Not linked to an account'));
await ctx.close();
await finish();
