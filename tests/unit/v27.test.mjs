// Unit tests for 2.7: pay filled in with the estimate when a transfer is ticked (payEstimated) isn't typed pay, the
// "Share" text for the month's transfers (transfersText) and the default "Remind me" for a new renewal date (defaultLead).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, household, sampleUpgraded, clone } from './load.mjs';

// The example household's shape: Alex and Sam paid into their own accounts, then joint bills, then joint spending.
const EX = () => household({
  people: [{ id: 'alex', name: 'Alex', payAccount: 'a1', usualPay: 2150 }, { id: 'sam', name: 'Sam', payAccount: 'a2', usualPay: 1875 }],
  accounts: [{ id: 'a1', name: "Alex's current account", leftoverTo: 'bills' }, { id: 'a2', name: "Sam's current account", leftoverTo: 'bills' },
    { id: 'bills', name: 'Joint bills account', leftoverTo: 'spend' }, { id: 'spend', name: 'Joint spending account', leftoverTo: null }],
  bills: [{ id: 'm', name: 'Mortgage', amount: 925, account: 'bills', months: [] }, { id: 'p', name: 'Mobile phone', amount: 18, account: 'a1', months: [] }],
  budgets: [{ id: 'g', name: 'Food', amount: 520, account: 'spend' }],
  savings: [{ id: 's1', name: 'Holiday pot', amount: 150, fromAccount: 'spend' }, { id: 's2', name: 'Emergency fund', amount: 100, fromAccount: 'spend' }],
  payday: { day: 28, weekend: true } });

test('payIsTyped: a saved figure counts unless payEstimated marks it; older months (no payEstimated) count as before', () => {
  assert.equal(P.payIsTyped({ pay: { a: 100 } }, 'a'), true);
  assert.equal(P.payIsTyped({ pay: { a: 100 }, payEstimated: { a: true } }, 'a'), false);
  assert.equal(P.payIsTyped({ pay: { a: 100, b: 50 }, payEstimated: { a: true } }, 'b'), true);
  assert.equal(P.payIsTyped({ pay: { a: null } }, 'a'), false);
  assert.equal(P.payIsTyped(null, 'a'), false);
  assert.equal(P.payIsTyped({}, 'a'), false);
});

test('A month whose pay was only filled in by a tick is estimated everywhere: not actual, no predicted line, not in averages or history', () => {
  const c = EX(), months = {
    '2026-08': { pay: { alex: 2000, sam: 1800 }, done: {} },
    '2026-09': { pay: { alex: 2100, sam: 1900 }, done: {} },
    '2026-10': { pay: { alex: 2100, sam: 1900 }, payEstimated: { alex: true, sam: true }, done: { 's:s1': 150 } } };
  assert.equal(P.hasTypedPay(months, '2026-10'), false);
  assert.equal(P.hasTypedPay(months, '2026-09'), true);
  const pf = P.projectedFloat(c, months, '2026-10', ['2026-09', '2026-10']);
  assert.equal(pf[0].actual, true); assert.notEqual(pf[0].predicted, null);
  assert.equal(pf[1].actual, false); assert.equal(pf[1].predicted, null);
  // Its transfers still use the figures saved for it (the ticks were made at those amounts).
  assert.equal(pf[1].float, P.calc(c, 10, { alex: 2100, sam: 1900 }, []).flt);
  const inc = P.avgIncome(c, months, '2026-10');
  assert.deepEqual(inc.people.map(p => [p.avg, p.months]), [[2050, 2], [1850, 2]]);
  assert.deepEqual(P.payHistory(c, months, '2026-10').map(h => h.k), ['2026-08', '2026-09']);
  assert.deepEqual(P.typedPayMonths(months, '2026-12'), ['2026-08', '2026-09']);
  // The next month's estimate comes from the last pay that was typed, not the estimate.
  const m2 = clone(months); m2['2026-10'].pay.alex = 2222;
  assert.deepEqual(P.payEstimate(c, m2, 'alex', '2026-11'), { v: 2100, from: '2026-09' });
  // The checklist's "Add your take-home pay" isn't ticked by an estimate.
  const fresh = household({ people: [{ id: 'x', name: 'X', payAccount: 'a', usualPay: 0 }], accounts: [{ id: 'a', name: 'A' }] });
  assert.equal(P.setupChecklist(fresh, { '2026-10': { pay: { x: 0 }, payEstimated: { x: true } } })[0].done, false);
  assert.equal(P.setupChecklist(fresh, { '2026-10': { pay: { x: 0 } } })[0].done, true);
  // Exports say it wasn't typed.
  assert.deepEqual(P.savedMonthRow(c, months, '2026-10').pay, [null, null]);
  assert.deepEqual(P.savedMonthRow(c, months, '2026-09').pay, [2100, 1900]);
});

test('Only one person estimated: the month is still actual for the other', () => {
  const c = EX(), months = { '2026-10': { pay: { alex: 2100, sam: 1900 }, payEstimated: { sam: true }, done: {} } };
  assert.equal(P.hasTypedPay(months, '2026-10'), true);
  assert.deepEqual(P.avgIncome(c, months, '2026-10').people.map(p => p.months), [1, 0]);
  assert.deepEqual(P.payHistory(c, months, '2026-10')[0].pay, { alex: 2100, sam: null });
});

test('1.x data (no payEstimated anywhere): typed pay is typed pay, as before', () => {
  const { c, m } = sampleUpgraded(true);
  const keys = Object.keys(m).filter(k => /^\d{4}-\d{2}$/.test(k));
  for (const k of keys) assert.equal(P.hasTypedPay(m, k), !!(m[k].pay && Object.keys(m[k].pay).some(p => m[k].pay[p] != null)), k);
});

test('transfersText: the month\'s transfers in order, ticks, the left over and the payday', () => {
  const c = EX(), k = '2026-11', pay = { alex: 2150, sam: 1875 }, r = P.calc(c, 11, pay, []);
  const done = { [r.steps[2].id]: r.steps[2].amt };
  const t = P.transfersText(c, k, r, done, { estimated: [] }).split('\n');
  assert.equal(t[0], 'Dovetail transfers for November 2026 (payday Wed 28 Oct 2026)');
  assert.equal(t[1], "1. ☐ Alex's current account → Joint bills account  £2,132.00");
  assert.equal(t[2], "2. ☐ Sam's current account → Joint bills account  £1,875.00");
  assert.match(t[3], /^3\. ☑ Joint bills account → Joint spending account  £/);
  assert.equal(t[4], '4. ☐ Joint spending account → Holiday pot  £150.00');
  assert.equal(t[5], '5. ☐ Joint spending account → Emergency fund  £100.00');
  assert.equal(t[6], 'Left over this month: ' + P.fmt(r.flt) + ' in Joint spending account');
  assert.equal(t.length, 7);
  // Ticked at an amount that has changed since: the difference is said, as on the Pay tab.
  const r2 = P.calc(c, 11, { alex: 2200, sam: 1875 }, []), moved = P.transfersText(c, k, r2, { [r2.steps[0].id]: 2132 }, null).split('\n');
  assert.equal(moved[1], "1. \u2611 Alex's current account \u2192 Joint bills account  £2,182.00 (ticked at £2,132.00: £50.00 more to send)");
  const less = P.transfersText(c, k, r, { [r.steps[0].id]: 2200 }, null).split('\n');
  assert.equal(less[1], "1. \u2611 Alex's current account \u2192 Joint bills account  £2,132.00 (ticked at £2,200.00: £68.00 less now)");
  const e = P.transfersText(c, k, r, {}, { estimated: ['Alex', 'Sam'] }).split('\n');
  assert.equal(e[e.length - 1], 'Amounts use estimated pay for Alex and Sam.');
  assert.ok(e.slice(1, 6).every(l => l.includes('☐')));
});

test('transfersText: no payday, a top-up, two accounts that keep what\'s left, and a short month', () => {
  const c = household({ people: [{ id: 'p', name: 'Pat', payAccount: 'a', usualPay: 0 }],
    accounts: [{ id: 'a', name: 'Main', leftoverTo: null }, { id: 'b', name: 'Bills', leftoverTo: 'a' }, { id: 'k', name: 'Pot', leftoverTo: null }],
    bills: [{ id: 'x', name: 'Rent', amount: 500, account: 'b', months: [] }], income: [{ id: 'i', name: 'Gift', amount: 200, account: 'k' }] });
  const r = P.calc(c, 3, { p: 1000 }, []), t = P.transfersText(c, '2027-03', r, {}, null).split('\n');
  assert.equal(t[0], 'Dovetail transfers for March 2027');
  assert.equal(t[1], '1. ☐ Main → Bills  £500.00 (top-up)');
  assert.deepEqual(t.slice(2), ['Left over in Main: £500.00', 'Left over in Pot: £200.00']);
  const short = P.calc(c, 3, { p: 100 }, []), s = P.transfersText(c, '2027-03', short, {}, null).split('\n');
  assert.equal(s[2], 'Short in Main: £400.00');
  const none = household({ people: [{ id: 'p', name: 'Pat', payAccount: 'a' }], accounts: [{ id: 'a', name: 'Main' }] });
  assert.deepEqual(P.transfersText(none, '2027-03', P.calc(none, 3, { p: 10 }, []), {}, null).split('\n').slice(1),
    ['No transfers needed this month.', 'Left over this month: £10.00 in Main']);
});

test('defaultLead: a week for a monthly subscription or membership, otherwise a month', () => {
  assert.equal(P.defaultLead({ name: 'Netflix', months: [] }), 7);
  assert.equal(P.defaultLead({ name: 'Gym', months: [] }), 7);
  assert.equal(P.defaultLead({ name: 'Anything', category: 'subscriptions', months: [] }), 7);
  assert.equal(P.defaultLead({ name: 'Gym', category: '', months: [] }), 30, 'chose "Not categorised"');
  assert.equal(P.defaultLead({ name: 'Netflix', months: [3] }), 30, 'paid once a year');
  assert.equal(P.defaultLead({ name: 'Car insurance', months: [] }), 30);
  assert.equal(P.defaultLead({ name: 'Energy', months: [] }), 30);
});
