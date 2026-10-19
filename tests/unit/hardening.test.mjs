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
