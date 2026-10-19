// Fast unit tests for migrate.js: 1.x data and backups upgrade to the current schema, once, without touching Wealth data.
// They use the made-up 1.x household (Alex and Sam); the same checks on the owner's real 1.4 data are in owner.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, SAMPLE, clone, sampleUpgraded } from './load.mjs';

test('1.x data upgrades to people, accounts, budgets and savings sources', () => {
  const { c } = sampleUpgraded(false);
  assert.equal(c.setupDone, true);
  assert.deepEqual(c.people.map(p => [p.id, p.name, p.payAccount, p.usualPay]), [['alex', 'Alex', 'cur1', 2280], ['sam', 'Sam', 'cur2', 2140]]);
  assert.deepEqual(c.accounts.map(a => a.id + '>' + a.leftoverTo), ['cur1>jbills', 'cur2>jbills', 'jbills>jspend', 'jspend>null']);
  assert.deepEqual(c.budgets.map(b => [b.id, b.amount, b.account]), [['food', 550, 'jspend'], ['fuel', 220, 'jspend'], ['general', 1010, 'jspend']]);
  assert.ok(c.savings.every(s => s.fromAccount === 'jspend'));
  assert.equal(c.savings[0].wealthLink, 'isa');
  assert.equal(c.savings[0].account, undefined);
  assert.equal(c.budget, undefined);
  assert.equal(c.defaultPay, undefined);
  const n1 = c.bills.find(b => b.id === 'b36');
  assert.equal(n1.renews, '2027-09-30');
  assert.equal(n1.lead, 180);
  assert.match(n1.note, /mortgage deal ends/);
  assert.equal(c.bills.find(b => b.id === 'b37').renews, '2028-01-15', 'each mortgage gets its own deal end');
});

test('months: pay moved, ticks renamed, overdraft becomes a one-off', () => {
  const { m } = sampleUpgraded(true);
  const oct = m['2026-10'];
  assert.deepEqual(oct.pay, { alex: 2291.46, sam: 2128.73 });
  assert.equal(oct.alex, undefined);
  assert.equal(oct.done['t:cur2>jbills'], 2087.98);
  assert.equal(oct.done['t:jbills>jspend'], 2535.65);
  assert.equal(oct.done['s:' + SAMPLE.config.savings[0].id], 200);
  assert.equal(oct.overdraft, undefined);
  assert.deepEqual(oct.oneOffs.map(o => [o.kind, o.name, o.amount, o.account]), [['out', 'Overdraft from last month', 95, 'jspend']]);
});

test('upgrade runs once and never changes the Wealth data', () => {
  const c = P.normCfg(SAMPLE.config), m = clone(SAMPLE.months), w = clone(SAMPLE.wealth);
  assert.equal(P.migrate(c, m, w), true);
  const snap = JSON.stringify([c, m]);
  assert.equal(P.migrate(c, m, w), false);
  assert.equal(JSON.stringify([c, m]), snap);
  assert.deepEqual(w, SAMPLE.wealth);
});

test('1.0 backup: no ids, savings ticks by position', () => {
  const c = P.normCfg(clone(SAMPLE.config)); delete c.schema; delete c.v12; c.savings.forEach(s => { delete s.id; delete s.account; });
  const m = { '2026-09': { alex: 2300, sam: null, overdraft: 0, done: { sam: 2100, sav0: 200 }, results: { sam: 2100 } } };
  P.migrate(c, m, null);
  const sid = c.savings[0].id;
  assert.ok(sid);
  assert.deepEqual(m['2026-09'].done, { 't:cur2>jbills': 2100, ['s:' + sid]: 200 });
  assert.deepEqual(m['2026-09'].pay, { alex: 2300, sam: null });
  assert.equal(m['2026-09'].oneOffs, undefined, 'no one-off for a zero overdraft');
});

test('1.2 backup: month-only deal end, unlinked mortgage, negative ticked transfer', () => {
  const c = P.normCfg(clone(SAMPLE.config)); delete c.schema;
  const w = clone(SAMPLE.wealth); w.accounts.find(a => a.id === 'mort1').dealEnd = '2027-09'; w.accounts.find(a => a.id === 'mort2').billId = 'nope';
  const m = { '2026-08': { alex: 2300, sam: 40, overdraft: 75.5, done: { sam: -15.66, jbjs: 10 }, results: { sam: -15.66, jbillsToJspend: -10 } } };
  P.migrate(c, m, w);
  assert.equal(c.bills.find(b => b.id === 'b36').renews, '2027-09-30', 'a month-only deal end is the last day of that month');
  const r = c.reminders.find(x => x.fromWealth === 'mort2');
  assert.deepEqual([r.name, r.date, r.lead], ['Mortgage 2 deal ends', '2028-01-15', 180]);
  assert.deepEqual(m['2026-08'].done, { 't:jbills>cur2': -15.66, 't:jspend>jbills': 10 });
  assert.equal(m['2026-08'].oneOffs[0].amount, 75.5);
  P.migrate(c, m, w);
  assert.equal(c.reminders.filter(x => x.fromWealth === 'mort2').length, 1, 'no duplicate reminder');
});

test('odd month entries are skipped safely', () => {
  const c = P.normCfg(clone(SAMPLE.config)), m = { '2026-09': null, bad: 5, '2026-10': { alex: 2000 } };
  P.migrate(c, m, null);
  assert.deepEqual(m['2026-10'].pay, { alex: 2000, sam: null });
  assert.equal(m['2026-09'], null);
});
