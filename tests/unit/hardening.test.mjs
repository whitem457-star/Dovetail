// Unit tests for the beta hardening: ids that can't collide, settings and months checked item by item (normCfg,
// normMonths), the 1.x household only given to data that really came from 1.x (looksLegacy), and no "−£0.00".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, SAMPLE, household, sampleUpgraded, clone } from './load.mjs';

test('uid: thousands made in the same millisecond are all different', () => {
  const ids = new Set(); for (let i = 0; i < 5000; i++) ids.add(P.uid('b'));
  assert.equal(ids.size, 5000);
  assert.ok([...ids].every(id => /^b[a-z0-9]+$/.test(id)));
});

test('normCfg: a payday day that is not 1–31 or "last" becomes "not set", valid ones are kept as they are', () => {
  assert.equal(P.normCfg(household({ payday: { day: 'x', weekend: true } })).payday.day, '');
  assert.equal(P.normCfg(household({ payday: { day: 0 } })).payday.day, '');
  assert.equal(P.normCfg(household({ payday: { day: 32 } })).payday.day, '');
  assert.equal(P.normCfg(household({ payday: { day: 2.5 } })).payday.day, '');
  assert.equal(P.normCfg(household({ payday: { day: 28 } })).payday.day, 28);
  assert.equal(P.normCfg(household({ payday: { day: '28' } })).payday.day, '28');
  assert.equal(P.normCfg(household({ payday: { day: 'last' } })).payday.day, 'last');
  assert.equal(P.normCfg(household({ payday: { day: '' } })).payday.day, '');
  assert.deepEqual(P.normCfg(household({ payday: 'tuesday' })).payday, {});
  assert.equal(P.normCfg(household({ payday: { day: true } })).payday.day, '');
  assert.equal(P.normCfg(household({ payday: { day: [28] } })).payday.day, '');
  assert.equal(P.normCfg(household({ payday: { day: { d: 1 } } })).payday.day, '');
  // and the app can always work out a month to open on
  assert.match(P.defaultMonth(P.normCfg(household({ payday: { day: 'x' } })).payday, '2026-10-15'), /^\d{4}-\d{2}$/);
});

test('normCfg: items that are not objects are dropped; bill months are whole numbers 1–12, each once', () => {
  const c = P.normCfg(household({ bills: [null, 'x', 7, { id: 'a', name: 'A', amount: 1, account: 'x', months: ['3', 3, 13, 0, 'y', 12.5, 12] }], people: [null], accounts: [[]] }));
  assert.equal(c.bills.length, 1); assert.deepEqual(c.bills[0].months, [3, 12]);
  assert.equal(c.people.length, 0); assert.equal(c.accounts.length, 0);
});

test('normCfg: sound data goes through unchanged (a 1.x household)', () => {
  const before = JSON.stringify(P.normCfg(SAMPLE.config));
  assert.equal(JSON.stringify(P.normCfg(JSON.parse(before))), before);
});

test('normMonths: months that are not objects are dropped, wrong-shaped parts are fixed, sound months are untouched', () => {
  const m = P.normMonths({ '2026-10': 'gone', '2026-11': null, '2026-12': { month: '2026-12', done: 'x', pay: [1], oneOffs: [null, { id: 'o', name: 'x', amount: 1 }], results: 3 },
    '2027-01': { month: '2027-01', pay: { a: 1 }, done: { 't:a>b': 5 }, oneOffs: [] } });
  assert.deepEqual(Object.keys(m), ['2026-12', '2027-01']);
  assert.deepEqual(m['2026-12'], { month: '2026-12', done: {}, oneOffs: [{ id: 'o', name: 'x', amount: 1 }] });
  assert.deepEqual(m['2027-01'], { month: '2027-01', pay: { a: 1 }, done: { 't:a>b': 5 }, oneOffs: [] });
  assert.deepEqual(P.normMonths(null), {}); assert.deepEqual(P.normMonths('x'), {}); assert.deepEqual(P.normMonths([1]), {});
  // a copy: the caller's object is left alone
  const src = { '2026-12': { done: 'x' } }; P.normMonths(src); assert.equal(src['2026-12'].done, 'x');
  // a 1.x household's months, before migration, are the same afterwards
  assert.deepEqual(P.normMonths(SAMPLE.months), SAMPLE.months);
});

test('migrate: 1.x data still gets the 1.x household', () => {
  const { c } = sampleUpgraded();
  assert.deepEqual(c.people.map(p => [p.id, p.name]), [['alex', 'Alex'], ['sam', 'Sam']]);
  assert.deepEqual(c.accounts.map(a => a.id), ['cur1', 'cur2', 'jbills', 'jspend']);
  assert.equal(c.setupDone, true);
});

test('migrate: data with no schema and no household is not given the 1.x household', () => {
  const c = P.normCfg({ bills: [], people: [], accounts: [] }), m = {};
  P.migrate(c, m, null);
  assert.equal(c.accounts.length, 0); assert.equal(c.people.length, 0); assert.equal(c.budgets.length, 0);
  assert.equal(c.schema, 5); assert.notEqual(c.setupDone, true);
});

test('migrate: 1.x markers other than the schema number still count as 1.x', () => {
  for (const c0 of [{ defaultPay: { alex: 2000 } }, { budget: { food: 1 } }, { v12: true }, { bills: [{ id: 'b', name: 'x', amount: 1, account: 'jbills' }] }]) {
    const c = P.normCfg(c0); P.migrate(c, {}, null);
    assert.equal(c.accounts.length, 4, JSON.stringify(c0));
  }
  const c = P.normCfg({}); P.migrate(c, { '2026-09': { sam: 2300, alex: null, overdraft: 0 } }, null);
  assert.deepEqual(c.people.map(p => [p.id, p.name, p.payAccount]), [['sam', 'Sam', 'cur1'], ['alex', 'Alex', 'cur2']]);
  // defaultPay with only one person: the other comes from the months
  const c3 = P.normCfg({ schema: 3, defaultPay: { sam: 1 } }), m3 = { '2026-09': { sam: 1, alex: 2, overdraft: 0, done: { alex: 2 }, results: { alex: 2 } } };
  P.migrate(c3, m3, null);
  assert.deepEqual(c3.people.map(p => p.id), ['sam', 'alex']); assert.deepEqual(m3['2026-09'].pay, { sam: 1, alex: 2 }); assert.deepEqual(m3['2026-09'].done, { 't:cur2>jbills': 2 });
});

test('migrate: on purpose, a month holding only pay is not enough to count as 1.x (1.x always saved an overdraft)', () => {
  const c = P.normCfg({}), m = { '2026-09': { sam: 2300 } }; P.migrate(c, m, null);
  assert.equal(c.people.length, 0); assert.equal(c.accounts.length, 0);
});

test('fmt: never "−£0.00"', () => {
  assert.equal(P.fmt(-0.004), '£0.00'); assert.equal(P.fmt(-0), '£0.00'); assert.equal(P.fmt(0), '£0.00');
  assert.equal(P.fmt(-0.006), '−£0.01'); assert.equal(P.fmt(-1), '−£1.00');
});

test('migrate: the 1.x people come from the data, with plain account names', () => {
  const { c, m } = sampleUpgraded();
  // the same ids, the names from the data's own keys, the accounts with plain names
  assert.deepEqual(c.people.map(p => [p.id, p.name, p.payAccount, p.usualPay]), [['alex', 'Alex', 'cur1', 2280], ['sam', 'Sam', 'cur2', 2140]]);
  assert.deepEqual(c.accounts.map(a => a.name), ['Current account 1', 'Current account 2', 'Joint bills account', 'Joint spending account']);
  assert.deepEqual(m['2026-10'].pay, { alex: SAMPLE.months['2026-10'].alex, sam: SAMPLE.months['2026-10'].sam });
  // a 1.x household with other people
  const c2 = P.normCfg({ schema: 3, defaultPay: { jo: 1800, chris_b: 2100 }, bills: [], budget: { food: 1 } }), m2 = { '2026-09': { jo: 1700, chris_b: null, overdraft: 0, done: { chris_b: 5, jo: 6, jbjs: 7 }, results: { jo: 6, chris_b: -5, jbillsToJspend: 7 } } };
  P.migrate(c2, m2, null);
  assert.deepEqual(c2.people.map(p => [p.id, p.name, p.payAccount, p.usualPay]), [['jo', 'Jo', 'cur1', 1800], ['chris_b', 'Chris b', 'cur2', 2100]]);
  assert.deepEqual(m2['2026-09'].pay, { jo: 1700, chris_b: null });
  assert.deepEqual(m2['2026-09'].done, { 't:jbills>cur2': 5, 't:cur1>jbills': 6, 't:jbills>jspend': 7 });
});

// ---------- 2.13: a restore says what it couldn't use ----------
const acc = (id, o = {}) => Object.assign({ id, name: id, colour: 'blue', leftoverTo: null }, o);
const bill = (id, amount, account, o = {}) => Object.assign({ id, name: id, amount, account, months: [] }, o);
// A made-up 2.12.1 household with every newer field: shares, set amounts, board, a closed account, a change of style,
// a dated bill, a budget that starts later and a deleted bill.
const full = () => household({ payday: { day: 28 },
  people: [{ id: 'kim', name: 'Kim', payAccount: 'K', usualPay: 3000 }, { id: 'lee', name: 'Lee', payAccount: 'L', usualPay: 2000 }, { id: 'kit', name: 'Kit', payAccount: 'T', usualPay: 900, boarder: true }],
  accounts: [acc('K'), acc('L'), acc('T'), acc('O', { closedFrom: '2026-09' }),
    acc('J', { funding: { people: ['kim', 'lee', 'kit'], rule: 'pay', set: { kit: { amount: 400 }, lee: { pct: 10 } } } })],
  flows: [{ from: '2026-09', was: { accounts: { K: { leftoverTo: 'J' }, L: { leftoverTo: 'J' }, T: { leftoverTo: null }, O: { leftoverTo: null }, J: { leftoverTo: null } }, pay: { kim: 'K' }, items: { bills: { gym: 'O' } }, boarders: [] } }],
  bills: [bill('rent', 1500, 'J'), bill('energy', 150, 'J', { was: [{ until: '2026-09', amount: 120, account: 'J', months: [] }] }), bill('gym', 30, 'J')],
  budgets: [{ id: 'fun', name: 'Fun', amount: 100, account: 'J', start: '2026-10' }],
  savings: [{ id: 'sv', name: 'Rainy day', amount: 100, fromAccount: 'J' }], income: [{ id: 'cb', name: 'Benefit', amount: 100, account: 'J' }],
  ended: { bills: [Object.assign(bill('tv', 14, 'J'), { ended: '2026-10' })] } });
const fullMonths = () => ({ '2026-08': { pay: { kim: 3000, lee: 2000, kit: 900 }, done: { 't:K>J': 1000 }, oneOffs: [] }, '2026-09': { pay: { kim: 3100 }, done: {}, oneOffs: [{ id: 'o1', kind: 'out', name: 'Gift', amount: 50, account: 'K' }] } });

test('normCfg and normMonths: sound data from any version reports nothing', () => {
  for (const c0 of [SAMPLE.config, sampleUpgraded().c, full(), household({})]) {
    const rep = []; const c = P.normCfg(c0, rep);
    assert.deepEqual(rep, [], JSON.stringify(rep));
    const rep2 = []; assert.equal(JSON.stringify(P.normCfg(c, rep2)), JSON.stringify(c)); assert.deepEqual(rep2, []);
  }
  for (const m0 of [SAMPLE.months, sampleUpgraded().m, fullMonths(), {}, null, undefined]) { const rep = []; P.normMonths(m0, rep); assert.deepEqual(rep, [], JSON.stringify(m0)); }
  // and the made-up 2.12.1 household goes through exactly as it was
  assert.equal(JSON.stringify(P.normCfg(full())), JSON.stringify(full()));
  // Someone removed in Settings stays in a share's list until the next open: dropped without a word.
  const c = full(); c.people.pop(); const rep = []; P.normCfg(c, rep); assert.deepEqual(rep, []);
});

test('normCfg: a negative amount is kept in the data but counted as £0, and reported', () => {
  const c0 = full(); c0.bills[0].amount = -50; c0.budgets[0].amount = -1; c0.savings[0].amount = '-20'; c0.income[0].amount = -100;
  const rep = [], c = P.normCfg(c0, rep);
  assert.deepEqual(rep, ['a bill with a negative amount (counted as £0)', 'a spending budget with a negative amount (counted as £0)', 'a savings transfer with a negative amount (counted as £0)', 'other income with a negative amount (counted as £0)']);
  assert.equal(c.bills[0].amount, 0); assert.equal(c.bills[0].badAmount, -50);
  assert.equal(c.savings[0].amount, 0); assert.equal(c.savings[0].badAmount, '-20');
  // The calculation counts it as nothing: the same transfers as with a £0 rent.
  const zero = full(); zero.bills[0].amount = 0; zero.budgets[0].amount = 0; zero.savings[0].amount = 0; zero.income[0].amount = 0;
  const pay = { kim: 3000, lee: 2000, kit: 900 }, a = P.calc(c, 11, pay, []), b = P.calc(P.normCfg(zero), 11, pay, []);
  assert.deepEqual(a.steps.map(s => [s.id, s.amt]), b.steps.map(s => [s.id, s.amt]));
  assert.deepEqual(a.floats, b.floats);
  // Opened again it says nothing more, and once the bill has an amount again the old one is let go.
  const rep2 = []; assert.equal(JSON.stringify(P.normCfg(c, rep2)), JSON.stringify(c)); assert.deepEqual(rep2, []);
  c.bills[0].amount = 1400; const c3 = P.normCfg(c); assert.equal(c3.bills[0].amount, 1400); assert.ok(!('badAmount' in c3.bills[0]));
});

test('normCfg: everything it drops or fixes is described, without names or amounts', () => {
  const c0 = full();
  c0.flows.push({ from: '2026-9', was: { accounts: {}, pay: {} } }, { from: '2026-09', was: { accounts: {}, pay: {} } }, 'junk');
  c0.accounts[4].funding.rule = 'byRoom';
  c0.accounts[3].closedFrom = 'soon';
  c0.bills[1].was.push({ until: '2026-13', amount: 1 }, { until: '2026-07', amount: -5, account: 'J', months: [] });
  c0.budgets[0].start = '2026';
  c0.ended.bills.push({ id: 'x', name: 'Old', amount: 1, account: 'J', ended: 'later' });
  c0.bills[2].months = [1, 13];
  c0.payday.day = 'Friday';
  c0.people.push(null); c0.reminders = [4];
  const rep = [], c = P.normCfg(c0, rep);
  assert.deepEqual([...new Set(rep)].sort(), ['a bill month that isn\'t January to December', 'a change of style that couldn\'t be read', 'a change of style with a bad month', 'a closed account with a bad month',
    'a deleted item with a bad month', 'a payday that isn\'t a day of the month', 'a person that couldn\'t be read', 'a reminder that couldn\'t be read', 'a second change of style in the same month',
    'a share rule Dovetail doesn\'t know', 'a spending budget with a bad first month', 'an earlier amount that couldn\'t be used', 'an earlier amount with a bad month'].sort());
  assert.ok(rep.every(t => !/Kim|Lee|Kit|rent|energy|\d{2}/i.test(t)), 'no names or amounts');
  // What's kept: the good change of style; the account, without its unknown rule.
  assert.deepEqual(c.flows.map(f => f.from), ['2026-09']); assert.ok(!('funding' in c.accounts[4]));
  // A set amount that can't be used, and a share rule that isn't an object.
  const c1 = full(); c1.accounts[4].funding.set.kit = { amount: -400 }; c1.accounts[0].funding = 'half';
  const r1 = []; P.normCfg(c1, r1); assert.deepEqual(r1, ['a share rule that couldn\'t be read', 'a set amount that couldn\'t be used (negative, or over 100%)']);
  // Without a list, normCfg gives the same settings.
  assert.equal(JSON.stringify(P.normCfg(full())), JSON.stringify(P.normCfg(full(), [])));
});

test('normMonths: a month with a bad date is kept and reported, and left out of the calculations', () => {
  const m0 = Object.assign(fullMonths(), { '2026-13': { pay: { kim: 9999 }, done: { 't:K>J': 1 } }, junk: { pay: { kim: 8888 } }, '2026-10': { done: 'yes', pay: [1], oneOffs: [null, { id: 'o', amount: 1 }] }, '2026-11': 7 });
  const rep = [], m = P.normMonths(m0, rep);
  assert.deepEqual(rep.sort(), ['a month that couldn\'t be read', 'a month with a bad date (left out)', 'a month with a bad date (left out)', 'a one-off that couldn\'t be read', 'pay that couldn\'t be read', 'ticks that couldn\'t be read']);
  assert.ok('2026-13' in m && 'junk' in m, 'kept in the data'); assert.ok(!('2026-11' in m));
  // Left out: the latest typed pay before 2027 is September's, not "2026-13"'s; Analysis's months and averages skip it.
  assert.deepEqual(P.payEstimate(full(), m, 'kim', '2027-02'), { v: 3100, from: '2026-09' });
  assert.deepEqual(P.usedMonths(m, '2027-12'), ['2026-08', '2026-09']);
  assert.deepEqual(P.typedPayMonths(m, '2027-12'), ['2026-08', '2026-09']);
  assert.equal(P.avgIncome(full(), m, '2027-02').people.find(x => x.id === 'kim').avg, 3050);
  assert.equal(P.hasHistory({ '2026-13': { done: { x: 1 } } }, '2027-01'), false);
  assert.equal(P.hasHistory({ '2026-12': { done: { x: 1 } } }, '2027-01'), true);
  const r2 = []; P.normMonths('x', r2); assert.deepEqual(r2, ['saved months that couldn\'t be read']);
});

test('reportSentence: one sentence, each kind once, at most three, then "and N more"', () => {
  assert.equal(P.reportSentence([]), ''); assert.equal(P.reportSentence(undefined), '');
  assert.equal(P.reportSentence(['a']), 'Some things couldn\'t be used: a.');
  assert.equal(P.reportSentence(['a', 'b', 'a']), 'Some things couldn\'t be used: a and b.');
  assert.equal(P.reportSentence(['a', 'b', 'c']), 'Some things couldn\'t be used: a, b and c.');
  assert.equal(P.reportSentence(['a', 'b', 'c', 'd', 'e', 'd']), 'Some things couldn\'t be used: a, b, c and 2 more.');
});
