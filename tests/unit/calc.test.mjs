// Fast unit tests for calc.js: money and date helpers, payday rules, the household tree and the transfer calculation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, sampleUpgraded, household, money } from './load.mjs';

const amounts = r => r.steps.map(s => money(s.amt));

test('money parsing and formatting', () => {
  assert.equal(P.r2(1.005), 1.01);
  assert.equal(P.num('£2,401.25'), 2401.25);
  assert.equal(P.num(''), 0);
  assert.equal(P.num(null), 0);
  assert.deepEqual(P.parseMoney('2,450'), { empty: false, value: 2450 });
  assert.deepEqual(P.parseMoney(' '), { empty: true, value: null });
  assert.equal(P.parseMoney('23x0').invalid, true);
  assert.equal(P.parseMoney('12.345').invalid, true);
  assert.equal(P.parseMoney('-5').invalid, true);
  assert.equal(P.parseMoney('-5', true).value, -5);
  assert.equal(P.parseMoney('.5').value, 0.5);
  assert.equal(P.fmt(1234.5), '£1,234.50');
  assert.equal(P.fmt(-100), '−£100.00');
  assert.equal(P.fmtS(12), '+£12.00');
  assert.equal(P.fmtS(-12), '−£12.00');
  assert.equal(P.fmtS(0), '£0.00');
});

test('months and dates', () => {
  assert.equal(P.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(P.shiftMonth('2027-01', -1), '2026-12');
  assert.equal(P.shiftMonth('2026-11', -23), '2024-12');
  assert.equal(P.mLabel('2026-11'), 'November 2026');
  assert.equal(P.mShort('2027-02'), 'Feb 2027');
  const ct = { months: [1, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
  assert.equal(P.applies(ct, 2), false);
  assert.equal(P.applies(ct, 4), true);
  assert.equal(P.applies({ months: [] }, 2), true);
  assert.equal(P.perYear(ct), 10);
  assert.equal(P.perYear({ months: [] }), 12);
  assert.equal(P.whenText({ months: [11, 2] }), 'Feb, Nov');
  assert.equal(P.addYear('2028-02-29'), '2029-02-28');
  assert.equal(P.daysUntil('2026-10-20', '2026-10-15'), 5);
  assert.equal(P.daysUntil('2026-10-01', '2026-10-15'), -14);
  assert.equal(P.nextFuture('2026-04-08', '2026-10-15'), '2027-04-08');
  assert.equal(P.fmtDate('2026-12-01'), '1 Dec 2026');
  assert.equal(P.validDate('2026-1-1'), false);
});

test('payday rules', () => {
  const p28 = { day: 28, weekend: true }, p31 = { day: 31, weekend: true };
  assert.equal(P.paydayIn(p28, 2026, 10), '2026-10-28');
  assert.equal(P.paydayIn(p31, 2026, 10), '2026-10-30', 'Saturday moves to Friday');
  assert.equal(P.paydayIn({ day: 31, weekend: false }, 2026, 10), '2026-10-31');
  assert.equal(P.paydayIn({ day: 31 }, 2026, 11), '2026-11-30', 'short month');
  assert.equal(P.paydayIn({ day: 'last' }, 2026, 10), '2026-10-30');
  assert.equal(P.paydayIn({ day: 'last' }, 2027, 1), '2027-01-29', 'last working day');
  assert.equal(P.paydayIn({}, 2026, 10), null);
  assert.equal(P.paydayFor(p28, '2026-11'), '2026-10-28', 'paid late in the month: it funds next month');
  assert.equal(P.paydayFor({ day: 1 }, '2026-11'), '2026-10-30', 'paid early in the month: the same month; 1 Nov 2026 is a Sunday, so the Friday before');
  assert.equal(P.paydayFor({ day: 3 }, '2026-11'), '2026-11-03');
  assert.equal(P.budgetMonthOfPay(p28, '2026-10'), '2026-11');
  assert.equal(P.defaultMonth({}, '2026-10-14'), '2026-10');
  assert.equal(P.defaultMonth({}, '2026-10-15'), '2026-11');
  assert.equal(P.defaultMonth({}, '2026-12-20'), '2027-01');
  assert.equal(P.defaultMonth(p28, '2026-10-15'), '2026-10', '13 days before payday: the month the last payday paid for');
  assert.equal(P.defaultMonth(p28, '2026-10-20'), '2026-11', '8 days before payday: the next month');
  assert.equal(P.defaultMonth(p28, '2026-10-29'), '2026-11');
});

test('household tree helpers', () => {
  const c = household({ accounts: [{ id: 'a', leftoverTo: 'b' }, { id: 'b', leftoverTo: 'c' }, { id: 'c', leftoverTo: null }, { id: 'x', leftoverTo: 'y' }, { id: 'y', leftoverTo: 'x' }, { id: 'z', leftoverTo: 'gone' }, { id: 's', leftoverTo: 's' }] });
  assert.equal(P.parentId(c, 'a'), 'b');
  assert.equal(P.parentId(c, 'c'), null);
  assert.equal(P.parentId(c, 'x'), null, 'a loop counts as keeping its leftover');
  assert.equal(P.parentId(c, 'z'), null, 'a missing account counts as keeping its leftover');
  assert.equal(P.parentId(c, 's'), null, 'itself counts as keeping its leftover');
  assert.deepEqual(P.descendants(c, 'c').sort(), ['a', 'b']);
  assert.deepEqual(P.rootIds(c), ['c', 'x', 'y', 'z', 's']);
  assert.deepEqual(P.flowLines(c)[0], ['a', 'b', 'c']);
});

// The golden tests on the owner's real 1.4 data are in owner.test.mjs; these are the same checks on the made-up one.
test('1.x household, nothing entered, November 2026', () => {
  const { c, m } = sampleUpgraded(false);
  const r = P.calc(c, 11, P.payFor(c, m, '2026-11'), P.monthOneOffs(m, '2026-11'));
  assert.deepEqual(amounts(r), [1963.12, 2099.25, 2501.82, 200, 250]);
  assert.deepEqual(r.steps.slice(0, 3).map(s => s.id), ['t:cur1>jbills', 't:cur2>jbills', 't:jbills>jspend']);
  assert.equal(money(r.flt), 266.83);
  assert.equal(r.ok, true);
});

test('1.x household with saved October', () => {
  const { c, m } = sampleUpgraded(true);
  const oct = P.calc(c, 10, P.payFor(c, m, '2026-10'), P.monthOneOffs(m, '2026-10'));
  assert.deepEqual(amounts(oct), [1974.58, 2087.98, 2545.65, 200, 250]);
  assert.equal(money(oct.flt), 215.66);
  const nov = P.calc(c, 11, P.payFor(c, m, '2026-11'), P.monthOneOffs(m, '2026-11'));
  assert.deepEqual(amounts(nov), [1974.58, 2087.98, 2502.01, 200, 250]);
  assert.equal(money(nov.flt), 267.02);
  assert.deepEqual(P.payEstimate(c, m, 'alex', '2026-11'), { v: 2291.46, from: '2026-10' });
  assert.deepEqual(P.payEstimate(c, m, 'alex', '2026-10'), { v: 2280, from: null });
});

test('shape: one person, one account', () => {
  const c = household({ people: [{ id: 'p', payAccount: 'm', usualPay: 2000 }], accounts: [{ id: 'm', leftoverTo: null }],
    bills: [{ id: 'b', amount: 900, account: 'm', months: [] }], budgets: [{ id: 'g', amount: 300, account: 'm' }] });
  const r = P.calc(c, 11, { p: 2000 }, []);
  assert.equal(r.steps.length, 0);
  assert.equal(r.flt, 800);
  assert.equal(r.ok, true);
});

test('shape: top-up comes after surplus transfers; chain ordering deepest first', () => {
  const c = household({ people: [{ id: 'q', payAccount: 'x' }, { id: 'r', payAccount: 'y' }],
    accounts: [{ id: 'x', leftoverTo: 'y' }, { id: 'y', leftoverTo: 'z' }, { id: 'z', leftoverTo: null }],
    bills: [{ id: 'b1', amount: 700, account: 'x', months: [] }, { id: 'b2', amount: 100, account: 'y', months: [] }], budgets: [{ id: 'g', amount: 200, account: 'z' }] });
  const r = P.calc(c, 11, { q: 500, r: 2000 }, []);
  assert.deepEqual(r.steps.map(s => [s.id, s.kind, money(s.amt)]), [['t:y>z', 'move', 1700], ['t:y>x', 'topup', 200]]);
  assert.equal(r.flt, 1500);
  const d = household({ people: [{ id: 'p', payAccount: 'w' }], accounts: [{ id: 'z' }, { id: 'y', leftoverTo: 'z' }, { id: 'x', leftoverTo: 'y' }, { id: 'w', leftoverTo: 'x' }],
    bills: [{ id: 'b', amount: 100, account: 'x', months: [] }] });
  assert.deepEqual(P.calc(d, 1, { p: 1000 }, []).steps.map(s => s.id), ['t:w>x', 't:x>y', 't:y>z']);
});

test('shape: two keeping accounts, one-offs, bad data', () => {
  const c = household({ people: [{ id: 'a', payAccount: 'k1' }, { id: 'b', payAccount: 'k2' }], accounts: [{ id: 'k1' }, { id: 'k2' }],
    bills: [{ id: 'b1', amount: 1100, account: 'k1', months: [] }, { id: 'b2', amount: 30, account: 'k2', months: [] }, { id: 'b3', amount: 10, account: 'gone', months: [] }] });
  const r = P.calc(c, 3, { a: 1000, b: 800 }, [{ kind: 'in', amount: 60, account: 'k2' }, { kind: 'out', amount: 20, account: 'k1' }]);
  assert.deepEqual(r.floats.map(f => [f.id, money(f.amt)]), [['k1', -120], ['k2', 830]]);
  assert.equal(r.ok, false, 'a bill on a missing account is caught by the reconciliation check');
  assert.equal(money(r.diff), -10);
});
