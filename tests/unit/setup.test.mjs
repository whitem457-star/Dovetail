// Unit tests for 2.13's setupSettings (calc.js): the settings a new household is saved with, from setup's answers, as
// ui.js's setupResult (setup's "Looks right, start", "Finish later" and "Skip setup for now") and the household
// simulation both make them. Made-up households only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, clone } from './load.mjs';

const TODAY = '2026-10-05';
const O = { schema: 5, version: '9.9', today: TODAY };

/** Setup's state as ui.js startSetup makes it, with people (name, pay) and anything else in o. */
function fresh(people = [['', '']], o = {}) {
  return Object.assign({ step: 1, people: people.map(([name, pay], i) => ({ id: 'p' + i, name, pay, payAccount: null })), income: [], sameDay: null,
    payday: { day: '', weekend: true }, skip: {}, shape: null, style: null, pool: null,
    ans: { fun: null, funAmt: {}, rule: null, set: {}, two: 'no', payer: null, gets: {}, getsAmt: {}, board: {}, boardAmt: {} },
    applied: null, pending: null, edited: false, accounts: [], bills: {}, billOpen: {}, budgets: [], savings: [] }, o);
}
/** The accounts step filled in from the answers, as ui.js applyShape does for a new household. */
function shaped(s, kind) {
  const sh = P.setupShape(kind, P.setupPeople(s), P.setupOpts(s));
  s.shape = kind; s.accounts = sh.accounts; s.people.forEach(p => { p.payAccount = sh.payAccount[p.id]; });
  return s;
}
const idOf = (s, name) => s.accounts.find(a => a.name === name).id;
const names = c => c.accounts.map(a => a.name);
const nameOf = (c, id) => (c.accounts.find(a => a.id === id) || {}).name;
const where = (c, l, f = 'account') => c[l].map(x => x.name + '@' + nameOf(c, x[f]));
const bill = (name, amount, o = {}) => Object.assign({ name, amount, freq: 'monthly', month: '', picked: [] }, o);
const row = (name, amount, account) => ({ name, amount, account, picked: true });
const save = (s, old = null, o = {}) => P.setupSettings(s, old, Object.assign({}, O, o));
const couple = (style, o = {}) => fresh([['Alex', '3000'], ['Sam', o.samPay ?? '2000']], { style, ans: Object.assign(fresh().ans, o.ans || {}) });

test('one person, each starting point: accounts in flow order, pay into the first, what\'s left kept by the last', () => {
  const want = { joint: ['Current account'], other: ['Current account'], own: ['Bills account', 'Spending account'], split: ['Pay account', 'Bills account', 'Spending account'] };
  for (const kind of ['joint', 'own', 'split', 'other']) {
    const s = shaped(fresh([['Alex', '2500']], { pool: kind }), kind);
    const { cfg: c, dropped } = save(s);
    assert.equal(dropped, 0);
    assert.deepEqual(names(c), want[kind], kind);
    assert.equal(nameOf(c, c.people[0].payAccount), want[kind][0], kind + ': pay arrives in the first');
    c.accounts.forEach((a, i) => assert.equal(nameOf(c, a.leftoverTo), want[kind][i + 1], kind + ': each passes what\'s left on'));
    assert.ok(c.accounts.every(a => !a.funding), kind + ': nobody pays shares');
    assert.deepEqual(c.people, [{ id: 'p0', name: 'Alex', payAccount: c.people[0].payAccount, usualPay: 2500 }]);
  }
});

test('putting it all together: one joint account, own accounts then joint, or joint bills then joint spending; spending money', () => {
  const want = { joint: ['Joint account'], own: ["Alex's account", "Sam's account", 'Joint account'], split: ["Alex's account", "Sam's account", 'Joint bills', 'Joint spending'] };
  for (const kind of ['joint', 'own', 'split']) {
    const s = shaped(couple('pool', { ans: { fun: 'yes', funAmt: { p0: '150', p1: '80.5' } } }), kind);
    s.pool = kind;
    const c = save(s).cfg;
    assert.deepEqual(names(c), want[kind], kind);
    assert.ok(c.accounts.every(a => !a.funding), kind + ': pooling has no shares');
    // Spending money each person keeps, in their pay account.
    assert.deepEqual(c.budgets.map(b => [b.name, b.amount, b.account]), [["Alex's spending money", 150, c.people[0].payAccount], ["Sam's spending money", 80.5, c.people[1].payAccount]], kind);
  }
  // Spending money only when it was asked for and answered yes.
  const no = shaped(couple('pool', { ans: { fun: 'no', funAmt: { p0: '150' } } }), 'own');
  assert.deepEqual(save(no).cfg.budgets, []);
});

test('a joint account each pays into, under each rule; two joint accounts', () => {
  for (const rule of ['equal', 'pay', 'sameLeft', 'set']) {
    const s = shaped(couple('contribute', { ans: { rule, set: { p0: '900', p1: '600' } } }), 'contribute');
    const c = save(s).cfg, j = c.accounts.find(a => a.name === 'Joint account');
    assert.deepEqual(names(c), ["Alex's account", "Sam's account", 'Joint account'], rule);
    assert.deepEqual(j.funding.people, ['p0', 'p1'], rule); assert.equal(j.funding.rule, rule);
    if (rule === 'set') assert.deepEqual(j.funding.set, { p0: { amount: 900 }, p1: { amount: 600 } });
    assert.equal(c.accounts[0].leftoverTo, null, 'own accounts keep what\'s left');
  }
  const two = save(shaped(couple('contribute', { ans: { rule: 'pay', two: 'yes' } }), 'contribute')).cfg;
  assert.deepEqual(names(two), ["Alex's account", "Sam's account", 'Joint bills', 'Joint spending']);
  assert.equal(nameOf(two, two.accounts[2].leftoverTo), 'Joint spending');
  assert.equal(two.accounts[2].funding.rule, 'pay'); assert.equal(two.accounts[3].funding.rule, 'pay');
});

test('one earner: the split isn\'t asked and goes by pay, and money for the partner comes from the earner', () => {
  const s = shaped(couple('contribute', { samPay: '', ans: { gets: { p1: 'yes' }, getsAmt: { p1: '250' } } }), 'contribute');
  const c = save(s).cfg, j = c.accounts.find(a => a.name === 'Joint account'), sam = c.accounts.find(a => a.name === "Sam's account");
  assert.deepEqual(j.funding, { people: ['p0'], rule: 'pay' });
  assert.deepEqual(sam.funding, { people: ['p0'], rule: 'set', set: { p0: { amount: 250 } } });
  assert.equal(c.people[1].usualPay, 0);
  // P.setupOneEarner names the earner; with two earners, nobody.
  assert.equal(P.setupOneEarner(s).id, 'p0');
  assert.equal(P.setupOneEarner(shaped(couple('contribute'), 'contribute')), null);
});

test('one of us pays the bills: the payer\'s account is paid into; a payer with no pay isn\'t offered half each', () => {
  const s = shaped(couple('housekeeping', { ans: { payer: 'p1', rule: 'equal' } }), 'housekeeping');
  const c = save(s).cfg, sam = c.accounts.find(a => a.name === "Sam's account");
  assert.deepEqual(sam.funding, { people: ['p0', 'p1'], rule: 'equal' });
  assert.ok(!c.accounts.find(a => a.name === "Alex's account").funding);
  // Bills go to the payer's account by default (the account people pay into).
  const s2 = shaped(couple('housekeeping', { ans: { payer: 'p1' } }), 'housekeeping');
  s2.bills.gone = [bill('Rent', '1200')];
  assert.deepEqual(where(save(s2).cfg, 'bills'), ["Rent@Sam's account"]);
  const noPay = couple('housekeeping', { samPay: '', ans: { payer: 'p1' } });
  assert.equal(P.setupNoHalf(noPay), true);
  assert.equal(P.setupOpts(noPay).rule, 'pay');
});

test('separate money: own accounts, nothing shared', () => {
  const c = save(shaped(couple('separate'), 'separate')).cfg;
  assert.deepEqual(names(c), ["Alex's account", "Sam's account"]);
  assert.ok(c.accounts.every(a => !a.funding && !a.leftoverTo));
  assert.notEqual(c.people[0].payAccount, c.people[1].payAccount);
});

test('something else: one joint account to build on', () => {
  const c = save(shaped(couple('other'), 'other')).cfg;
  assert.deepEqual(names(c), ['Joint account']);
  assert.equal(c.people[0].payAccount, c.people[1].payAccount);
});

test('board: with three people, someone after the first who pays board keeps their own account and pays a set amount', () => {
  const s = fresh([['Alex', '3000'], ['Sam', '2000'], ['Kit', '1500']], { style: 'contribute', ans: Object.assign(fresh().ans, { rule: 'equal', board: { p2: 'yes' }, boardAmt: { p2: '300' } }) });
  shaped(s, 'contribute');
  const c = save(s).cfg, j = c.accounts.find(a => a.name === 'Joint account');
  assert.deepEqual(c.people.map(p => !!p.boarder), [false, false, true]);
  assert.deepEqual(j.funding.people, ['p0', 'p1', 'p2']);
  assert.deepEqual(j.funding.set, { p2: { amount: 300 } });
  assert.ok(names(c).includes("Kit's account"));
  // Board isn't asked with two people, or when keeping money separate, so nobody is a boarder there.
  const two = couple('contribute', { ans: { board: { p1: 'yes' } } });
  assert.equal(P.setupBoarder(two, two.people[1], 1), false);
  const sep = fresh([['Alex', '1'], ['Sam', '1'], ['Kit', '1']], { style: 'separate', ans: Object.assign(fresh().ans, { board: { p2: 'yes' } }) });
  assert.equal(P.setupBoardAsked(sep), false);
  assert.ok(!save(shaped(sep, 'separate')).cfg.people.some(p => p.boarder));
  // Spending money isn't kept for someone paying board.
  const pool = fresh([['Alex', '3000'], ['Sam', '2000'], ['Kit', '1500']], { style: 'pool', pool: 'own', ans: Object.assign(fresh().ans, { fun: 'yes', funAmt: { p0: '100', p1: '100', p2: '100' }, board: { p2: 'yes' }, boardAmt: { p2: '250' } }) });
  assert.deepEqual(save(shaped(pool, 'own')).cfg.budgets.map(b => b.name), ["Alex's spending money", "Sam's spending money"]);
});

test('Finish later from each step keeps what was entered and fills in the rest', () => {
  // Step 1 (or Skip setup for now): nothing entered: one person, "You", and one "Current account".
  const s1 = fresh();
  const c1 = save(s1).cfg;
  assert.deepEqual(c1.people.map(p => [p.id, p.name, p.usualPay]), [['p0', 'You', 0]]);
  assert.deepEqual(c1.accounts.map(a => [a.name, a.colour, a.leftoverTo]), [['Current account', 'blue', null]]);
  assert.equal(c1.people[0].payAccount, c1.accounts[0].id);
  assert.deepEqual(c1.payday, {});
  assert.deepEqual([c1.bills, c1.budgets, c1.savings, c1.income], [[], [], [], []]);
  assert.equal(c1.setupDone, true); assert.equal(c1.tourDone, false); assert.equal(c1.setupTips, true);
  assert.equal(c1.schema, 5); assert.equal(c1.lastVersion, '9.9');
  // Step 2: names, pay and other income typed, no accounts yet: everyone paid into one Current account, income there.
  const s2 = fresh([['Alex', '2,500.50'], ['', '1800']], { step: 2, income: [{ id: 'i1', name: 'Child Benefit', amount: '102.40', account: null }] });
  const c2 = save(s2).cfg;
  assert.deepEqual(c2.people.map(p => [p.name, p.usualPay]), [['Alex', 2500.5], ['Person 2', 1800]]);
  assert.deepEqual(names(c2), ['Current account']);
  assert.ok(c2.people.every(p => p.payAccount === c2.accounts[0].id));
  assert.deepEqual(c2.income, [{ id: 'i1', name: 'Child Benefit', amount: 102.4, account: c2.accounts[0].id }]);
  // Step 3: a payday picked, or the step skipped.
  const s3 = fresh([['Alex', '2500']], { step: 3, payday: { day: '25', weekend: false } });
  assert.deepEqual(save(s3).cfg.payday, { day: 25, weekend: false });
  assert.deepEqual(save(fresh([['Alex', '2500']], { payday: { day: 'last', weekend: true } })).cfg.payday, { day: 'last', weekend: true });
  assert.deepEqual(save(fresh([['Alex', '2500']], { payday: { day: '25', weekend: true }, skip: { 3: true } })).cfg.payday, {});
  // Step 4: the accounts.
  const s4 = shaped(fresh([['Alex', '2500']], { step: 4, pool: 'own' }), 'own');
  assert.deepEqual(names(save(s4).cfg), ['Bills account', 'Spending account']);
  // Step 5: bills typed are kept; skipped, they're left out (and not counted as dropped).
  s4.bills[idOf(s4, 'Bills account')] = [bill('Rent', '950'), bill('TV Licence', '174.50', { freq: 'yearly', month: '3' }), bill('Broken', '')];
  const c5 = save(s4);
  assert.deepEqual(c5.cfg.bills.map(b => [b.name, b.amount, b.months, nameOf(c5.cfg, b.account)]), [['Rent', 950, [], 'Bills account'], ['TV Licence', 174.5, [3], 'Bills account']]);
  assert.equal(c5.dropped, 1);
  assert.deepEqual(save(Object.assign(clone(s4), { skip: { 5: true } })), { cfg: Object.assign(clone(c5.cfg), { bills: [] }), dropped: 0 });
  // Step 6: budgets and savings, or neither when skipped.
  const sp = idOf(s4, 'Spending account');
  s4.budgets = [row('Food shopping', '400', sp)]; s4.savings = [row('Holiday', '50', sp)];
  const c6 = save(s4).cfg;
  assert.deepEqual(where(c6, 'budgets'), ['Food shopping@Spending account']);
  assert.deepEqual(where(c6, 'savings', 'fromAccount'), ['Holiday@Spending account']);
  const c6s = save(Object.assign(clone(s4), { skip: { 6: true } }));
  assert.deepEqual([c6s.cfg.budgets, c6s.cfg.savings, c6s.dropped], [[], [], 1]);
});

test('rows that aren\'t complete are left out and counted once each; empty rows are ignored', () => {
  const s = shaped(fresh([['Alex', '2500']], { pool: 'joint' }), 'joint'), cur = s.accounts[0].id;
  s.income = [{ id: 'i1', name: 'Lodger rent', amount: '', account: cur }, { id: 'i2', name: '', amount: '', account: cur }];
  s.bills[cur] = [bill('Rent', '900'), bill('', '45'), bill('Water', 'abc'), bill('Car insurance', '400', { freq: 'yearly', month: '' }),
    bill('Council Tax', '150', { freq: 'some', picked: [] }), bill('', ''), bill('Energy', '0')];
  s.budgets = [row('Food shopping', '-20', cur), row('', '', cur)];
  s.savings = [row('', '30', cur), row('Holiday', '25', cur)];
  const { cfg: c, dropped } = save(s);
  assert.equal(dropped, 1 + 5 + 1 + 1, 'one income, five bills, one budget, one savings transfer');
  assert.deepEqual(c.bills.map(b => b.name), ['Rent']);
  assert.deepEqual([c.income, c.budgets].map(l => l.length), [0, 0]);
  assert.deepEqual(c.savings.map(x => x.name), ['Holiday']);
  // A row with neither a name nor a valid amount still counts once.
  const t = shaped(fresh([['Alex', '2500']], { pool: 'joint' }), 'joint');
  t.bills[t.accounts[0].id] = [bill('', 'x')];
  assert.equal(save(t).dropped, 1);
});

test('since: savings start in the month the Pay tab first opens on', () => {
  const s = fresh([['Alex', '2500']], { payday: { day: '25', weekend: true }, savings: [row('Holiday', '50', null)] });
  // After "Looks right, start": the month the next payday (Friday 23 October) pays for.
  assert.equal(save(s, null, { fromPreview: true }).cfg.savings[0].since, '2026-11');
  // After Finish later: the month the app opens on (18 days before payday, the month September's pay is for).
  assert.equal(save(s, null, { fromPreview: false }).cfg.savings[0].since, '2026-10');
  assert.equal(save(s).cfg.savings[0].since, '2026-10');
  // No payday: the calendar month, or the next one from the 15th.
  const n = fresh([['Alex', '2500']], { savings: [row('Holiday', '50', null)] });
  assert.equal(save(n, null, { fromPreview: true }).cfg.savings[0].since, '2026-10');
  assert.equal(save(n, null, { today: '2026-10-21' }).cfg.savings[0].since, '2026-11');
  // Budgets and bills have no since.
  assert.ok(!('since' in save(Object.assign(n, { budgets: [row('Food', '100', null)] })).cfg.budgets[0]));
});

test('what setup keeps from the settings there are now: appearance and notifications, nothing else', () => {
  const old = { schema: 5, setupDone: true, example: true, appearance: { theme: 'dark', textSize: 'large' }, notify: { on: true, time: '08:30', amounts: true },
    people: [{ id: 'x', name: 'Old' }], accounts: [{ id: 'ax', name: 'Old account' }], bills: [{ id: 'bx', name: 'Old bill', amount: 5, account: 'ax' }], reminders: [{ id: 'r', name: 'Old' }], payday: { day: 1 } };
  const c = save(fresh([['Alex', '2500']]), old).cfg;
  assert.deepEqual(c.appearance, old.appearance); assert.deepEqual(c.notify, old.notify);
  assert.ok(!('example' in c)); assert.deepEqual(c.reminders, []); assert.deepEqual(c.bills, []); assert.deepEqual(c.payday, {});
  assert.deepEqual(c.people.map(p => p.name), ['Alex']); assert.deepEqual(names(c), ['Current account']);
  // No settings yet (first run): the defaults.
  const n = save(fresh([['Alex', '2500']]), null).cfg, d = P.normCfg({});
  assert.deepEqual([n.appearance, n.notify], [d.appearance, d.notify]);
  assert.deepEqual(d.appearance, { theme: 'system', textSize: 'normal' });
});

test('anything pointing at an account that isn\'t there goes somewhere that is', () => {
  const s = shaped(fresh([['Alex', '2500']], { pool: 'own' }), 'own');
  s.people[0].payAccount = 'gone';
  s.income = [{ id: 'i1', name: 'Refunds', amount: '20', account: 'gone' }];
  s.bills.gone = [bill('Gym', '30')];
  s.budgets = [row('Food', '200', 'gone')]; s.savings = [row('Rainy day', '40', 'gone')];
  const c = save(s).cfg;
  assert.equal(nameOf(c, c.people[0].payAccount), 'Bills account', 'pay: the first account');
  assert.deepEqual(where(c, 'income'), ['Refunds@Spending account'], 'other income: the account that keeps what\'s left');
  assert.deepEqual(where(c, 'bills'), ['Gym@Bills account'], 'bills: the usual bills account');
  assert.deepEqual(where(c, 'budgets'), ['Food@Spending account']);
  assert.deepEqual(where(c, 'savings', 'fromAccount'), ['Rainy day@Spending account']);
});

test('accounts: names filled in, funding worked out again from the answers by role, accounts added by hand kept as they are', () => {
  const s = shaped(couple('contribute', { ans: { rule: 'equal' } }), 'contribute');
  // The rule changed after the accounts were filled in: the saved funding follows the answers.
  s.ans.rule = 'pay';
  s.accounts[2].name = '  ';
  s.accounts.push({ id: 'mine', name: 'Holiday pot', colour: 'gold', leftoverTo: null, funding: { people: ['p0'], rule: 'set', set: { p0: { amount: 50 } } } });
  const before = clone(s);
  const c = save(s).cfg;
  assert.deepEqual(s, before, 'the answers passed in are left as they were');
  const j = c.accounts.find(a => a.name === 'Account 3');
  assert.ok(j, 'an account with no name is named by its place in the list');
  assert.equal(j.funding.rule, 'pay');
  assert.deepEqual(c.accounts.find(a => a.id === 'mine').funding, { people: ['p0'], rule: 'set', set: { p0: { amount: 50 } } });
  assert.ok(c.accounts.every(a => !('role' in a)), 'roles are setup\'s, not saved');
  // P.setupSyncFunding changes the list it's given (ui.js's suSyncFunding passes setup's own).
  P.setupSyncFunding(s, s.accounts);
  assert.equal(s.accounts[2].funding.rule, 'pay');
});

test('ids: people keep theirs, a row with an id keeps it, the rest get new ones; the result round-trips normCfg', () => {
  const s = shaped(fresh([['Alex', '2500']], { pool: 'joint' }), 'joint'), cur = s.accounts[0].id;
  s.bills[cur] = [Object.assign(bill('Rent', '900'), { id: 'b-rent' }), bill('Water', '30')];
  s.budgets = [row('Food', '200', cur)];
  const c = save(s).cfg;
  assert.equal(c.people[0].id, 'p0'); assert.equal(c.accounts[0].id, cur);
  assert.equal(c.bills[0].id, 'b-rent');
  assert.match(c.bills[1].id, /^b/); assert.match(c.budgets[0].id, /^g/);
  assert.deepEqual(P.normCfg(clone(c)), c);
  // Bills get the category setup suggests from their names.
  assert.equal(c.bills[0].category, P.suggestCategory({ name: 'Rent' }));
});
