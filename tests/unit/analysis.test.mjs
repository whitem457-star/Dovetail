// Unit tests for the Analysis computations and bill categories. Expected values are worked out by hand; the household
// ones use the made-up 1.x household (Alex and Sam, tests/fixtures/sample-1.x-backup.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, sampleUpgraded, household, money } from './load.mjs';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg || ''} ${a} ≠ ${b}`);

test('category suggestions use generic words and respect the user\'s choice', () => {
  const s = n => P.suggestCategory({ name: n });
  assert.equal(s('Mortgage'), 'housing'); assert.equal(s('Rent'), 'housing');
  assert.equal(s('Council Tax'), 'utilities'); assert.equal(s('Water'), 'utilities'); assert.equal(s('Mobile phone'), 'utilities');
  assert.equal(s('Car insurance'), 'insurance', 'insurance wins over transport');
  assert.equal(s('Car finance'), 'debt', 'debt wins over transport');
  assert.equal(s('Store CC'), 'debt');
  assert.equal(s('TV Licence'), 'subscriptions'); assert.equal(s('Amazon Prime'), 'subscriptions');
  assert.equal(s('Gym'), 'memberships'); assert.equal(s('Nursery'), 'children'); assert.equal(s('Dentist'), 'health');
  assert.equal(s('DVLA'), 'transport'); assert.equal(s('Train season ticket'), 'transport');
  assert.equal(s('Something else'), '');
  assert.equal(P.suggestCategory({ name: 'Lender 1', note: 'Your fixed mortgage deal ends.' }), 'housing');
  assert.equal(P.suggestCategory({ name: 'Rent', savings: true }), 'savings');
  const b = { name: 'Gym' }; P.applyCategorySuggestion(b);
  assert.deepEqual([b.category, b.categoryAuto], ['memberships', true]);
  b.name = 'Nursery'; P.applyCategorySuggestion(b);
  assert.equal(b.category, 'children', 'a suggestion follows a rename');
  P.setCategory(b, 'other'); b.name = 'Gym'; P.applyCategorySuggestion(b);
  assert.deepEqual([b.category, b.categoryAuto], ['other', undefined], 'a chosen category is never overridden');
  P.setCategory(b, 'savings'); assert.equal(b.savings, true, 'Savings category = savings flag');
  P.setCategory(b, 'health'); assert.equal(b.savings, undefined);
  const j = { name: 'Junior ISA' }; P.setSavingsFlag(j, true); assert.deepEqual([j.category, j.savings], ['savings', true]);
  P.setSavingsFlag(j, false); assert.equal(j.category, undefined);
});

test('schema 5 upgrade suggests categories for a 1.x household', () => {
  const { c } = sampleUpgraded(false);
  assert.equal(c.schema, 5);
  const cat = n => c.bills.find(b => b.name === n).category;
  assert.equal(cat('Mortgage 1'), 'housing'); assert.equal(cat('Council Tax'), 'utilities'); assert.equal(cat('Junior ISA'), 'savings');
  assert.equal(cat('Credit card'), 'debt'); assert.equal(cat('Leisure Centre'), 'memberships'); assert.equal(cat('Lumen'), undefined, 'brand names are not guessed');
  assert.equal(c.bills.filter(b => !b.category).length, 13);
  const d = P.normCfg({ schema: 4, bills: [{ id: 'x', name: 'Gym', category: 'health', months: [] }], people: [], accounts: [{ id: 'a' }] });
  P.migrate(d, {}, null);
  assert.equal(d.bills[0].category, 'health', 'an existing choice survives the upgrade');
});

test('annual and monthly cost of a bill', () => {
  assert.equal(P.annualCost({ amount: 198, months: [1, 4, 5, 6, 7, 8, 9, 10, 11, 12] }), 1980);
  near(P.monthlyEquivalent({ amount: 142.18, months: [12] }), 11.848);
  assert.equal(P.monthlyEquivalent({ amount: 48, months: [] }), 48);
});

test('1. the monthly picture for a household (typed October pay)', () => {
  const { c, m } = sampleUpgraded(true);
  const r = P.monthlyPicture(c, m, '2026-11');
  near(r.income, 4547.59, 'income = 2291.46 + 2128.73 + 102.40 + 25.00');
  near(r.bills, 1950.325, 'bills, irregular ones spread over 12 months, excluding the Junior ISA');
  near(r.saving, 500, 'savings transfers 450 + Junior ISA 50');
  near(r.budgets, 1780);
  near(r.float, 317.265);
  near(r.savingsRate * 100, 10.995, 'savings rate');
  near(r.committed * 100, 42.887, 'committed');
  near(r.discretionary, 2097.265);
  const u = P.monthlyPicture(c, {}, '2026-11');
  near(u.income, 4547.40, 'with nothing typed yet, usual pay is used');
  assert.equal(P.monthlyPicture(household({ people: [{ id: 'p' }], accounts: [{ id: 'a' }] }), {}, '2026-11').savingsRate, null, 'no income: no percentages');
});

test('income averages the last 6 typed months', () => {
  const c = household({ people: [{ id: 'p', usualPay: 1000 }], accounts: [{ id: 'a' }] });
  const m = {}; [1000, 1100, 1200, 1300, 1400, 1500, 1600].forEach((v, i) => { m['2026-0' + (i + 1)] = { pay: { p: v } }; });
  near(P.avgIncome(c, m, '2026-07').total, (1100 + 1200 + 1300 + 1400 + 1500 + 1600) / 6);
  near(P.avgIncome(c, m, '2026-03').total, 1100, 'only months up to the one on screen');
});

test('2 and 3. where the money goes, and subscriptions', () => {
  const { c } = sampleUpgraded(false);
  const r = P.byCategory(c);
  assert.deepEqual(r.groups.map(g => g.key), ['housing', 'utilities', 'debt', 'insurance', 'subscriptions', 'savings', 'transport', 'memberships', 'health', '']);
  near(r.annual, 24003.90);
  near(r.groups[0].annual, 11540.40, 'housing: (865.20 + 96.50) × 12');
  near(r.groups[1].annual, 2556.00, 'utilities: water 576 + council tax 1980');
  near(r.groups[0].share * 100, 48.077);
  assert.equal(r.uncategorised, 13);
  assert.equal(r.groups[9].name, 'Not categorised');
  const s = P.subscriptions(c);
  assert.deepEqual(s.bills.map(b => b.name), ['Leisure Centre', 'TV Licence', 'Netflix', 'Spotify', 'Disney+', 'Amazon Prime']);
  near(s.annual, 1110.08, '408 + 174.56 + 155.88 + 143.88 + 119.88 + 107.88');
});

test('4. heavy and light months, with one-offs', () => {
  const { c, m } = sampleUpgraded(true);
  const r = P.heavyLight(c, m, '2026-11');
  assert.equal(r.months.length, 12);
  near(r.months[0].total, 4280.57);
  assert.equal(r.heaviest.k, '2026-12'); near(r.heaviest.total, 4379.11, 'December: home insurance');
  assert.equal(r.lightest.k, '2027-03'); near(r.lightest.total, 4038.93, 'March: no Council Tax, no TV Licence');
  near(r.average, 4230.325);
  m['2027-01'] = { pay: {}, oneOffs: [{ id: 'o', kind: 'out', amount: 500, account: 'jspend' }, { id: 'i', kind: 'in', amount: 99, account: 'jspend' }] };
  const j = P.heavyLight(c, m, '2026-11').months[2];
  near(j.total, 4736.93, 'one-off payments count, money in does not'); assert.equal(j.oneOffCount, 1);
});

test('5. projected float', () => {
  const { c, m } = sampleUpgraded(true);
  const r = P.projectedFloat(c, m, '2026-11');
  near(r[0].float, 267.02, 'November, as on the Pay tab');
  near(r[1].float, 168.48, 'December: home insurance in, TV Licence out');
  m['2027-02'] = { pay: {}, oneOffs: [{ id: 'o', kind: 'out', amount: 900, account: 'jspend' }] };
  const f = P.projectedFloat(c, m, '2026-11')[3];
  near(f.float, 465.02 - 900); assert.equal(f.short, true); assert.equal(f.oneOffs, 1);
});

test('5b. predicted float for months with typed pay', () => {
  const { c, m } = sampleUpgraded(true);
  const oct = P.projectedFloat(c, m, '2026-10')[0];
  assert.equal(oct.actual, true); near(oct.float, 215.66, 'October as typed');
  near(oct.predicted, 215.47, 'usual pay £2,280 and £2,140 (no earlier typed month): 19p less than typed');
  assert.equal(P.projectedFloat(c, m, '2026-11')[0].predicted, null, 'no typed pay: projected, nothing to compare');
  m['2026-11'] = { pay: { alex: 2400, sam: 2128.73 } };
  near(P.projectedFloat(c, m, '2026-11')[0].predicted, 267.02, 'November predicted from October\'s typed pay, as the Pay tab showed');
  c.people.forEach(p => { p.usualPay = 0; });
  assert.equal(P.projectedFloat(c, m, '2026-10')[0].predicted, null, 'no earlier pay and no usual pay: nothing was predicted');
  assert.notEqual(P.projectedFloat(c, m, '2026-11')[0].predicted, null, 'October\'s typed pay still predicts November');
});

test('6. pay and float history', () => {
  const { c, m } = sampleUpgraded(true);
  m['2026-09'] = { pay: { alex: 2300, sam: null } }; m['2026-08'] = { done: { 't:cur1>jbills': 1 } }; m['2026-12'] = { pay: { alex: 2500 } };
  const h = P.payHistory(c, m, '2026-11');
  assert.deepEqual(h.map(x => x.k), ['2026-09', '2026-10'], 'typed months only, up to the month on screen, oldest first');
  assert.deepEqual(h[0].pay, { alex: 2300, sam: null });
  near(h[1].float, 215.66);
  const many = {}; for (let i = 0; i < 30; i++) many[P.shiftMonth('2024-01', i)] = { pay: { alex: 2000 } };
  assert.equal(P.payHistory(c, many, '2026-11').length, 24);
});

test('7. saved so far, by tax year and consistency', () => {
  const c = household({ people: [{ id: 'p', payAccount: 'a' }], accounts: [{ id: 'a' }], payday: { day: 28, weekend: true },
    savings: [{ id: 'h', name: 'Holiday', amount: 100, fromAccount: 'a' }], bills: [{ id: 'j', name: 'Junior ISA', amount: 40, account: 'a', months: [], savings: true }] });
  const m = { '2026-03': { pay: { p: 2000 }, done: { 's:h': 100 } }, '2026-04': { pay: { p: 2000 }, done: { 's:h': 120 } },
    '2026-05': { pay: { p: 2000 }, done: {} }, '2026-06': { done: { 's:h': true } }, '2026-07': { pay: { p: null }, oneOffs: [] } };
  const r = P.savedSoFar(c, m, '2026-06');
  const h = r.items.find(i => i.id === 'h'), j = r.items.find(i => i.id === 'j');
  assert.equal(h.total, 320, '100 + 120 + 100 (a tick without an amount counts the transfer amount)');
  assert.equal(h.monthsDone, 3); assert.equal(h.monthsSaved, 4); assert.equal(h.consistency, 0.75);
  assert.equal(r.taxYear.label, '2026–27');
  assert.equal(h.taxYear, 100, 'April 2026 is paid on 27 Mar 2026, in 2025–26; only June counts in 2026–27');
  assert.equal(j.total, 160, 'direct-debit savings: counted in each used month');
  assert.equal(r.since, '2026-03');
  assert.equal(P.savedSoFar(c, {}, '2026-06').items[0].consistency, null);
});

test('8. price changes at renewal', () => {
  const c = household({ accounts: [{ id: 'a' }], bills: [
    { id: 'e', name: 'Energy', amount: 118, account: 'a', months: [], history: [{ on: '2026-03-01', date: '2027-03-01', from: 104, to: 118 }] },
    { id: 'i', name: 'Home insurance', amount: 130, account: 'a', months: [12], history: [{ on: '2025-09-01', date: '2026-12-01', from: 120, to: 130 }, { on: '2026-06-01', date: '2027-06-01', from: 130, to: 130 }] },
    { id: 'o', name: 'Old', amount: 50, account: 'a', months: [], history: [{ on: '2024-01-01', date: '2025-01-01', from: 40, to: 50 }] }] });
  const r = P.priceChanges(c, '2026-10-15');
  assert.deepEqual(r.changes.map(x => x.name), ['Energy'], 'only changes in the last 12 months; same-price renewals are not changes');
  near(r.changes[0].pct * 100, 13.4615);
  assert.equal(r.renewed, 2);
  near(r.rate * 100, (118 * 12 + 130 - (104 * 12 + 130)) / (104 * 12 + 130) * 100, 'household rate across every bill renewed');
  assert.equal(P.priceChanges(household({ accounts: [{ id: 'a' }] }), '2026-10-15').rate, null);
});

test('9. top-ups', () => {
  const c = household({ people: [{ id: 'q', payAccount: 'x' }, { id: 'r', payAccount: 'y' }], accounts: [{ id: 'x', name: 'Bills A', leftoverTo: 'y' }, { id: 'y', name: 'Hub' }],
    bills: [{ id: 'b', amount: 700, account: 'x', months: [] }] });
  const m = { '2026-08': { pay: { q: 500, r: 2000 } }, '2026-09': { pay: { q: 800, r: 2000 } }, '2026-10': { pay: { q: 600, r: 2000 } } };
  const r = P.topUps(c, m, '2026-10');
  assert.equal(r.monthsLooked, 3);
  assert.equal(r.accounts.length, 1);
  assert.deepEqual([r.accounts[0].account, r.accounts[0].from, r.accounts[0].count], ['x', 'y', 2]);
  near(r.accounts[0].average, 150, '(200 + 100) / 2');
});

test('review fixes: categories, chart ticks, bad history entries, savings counted from when they started', () => {
  assert.equal(P.suggestCategory({ name: 'Travel card' }), 'transport', 'a travel card is not debt');
  assert.equal(P.suggestCategory({ name: 'Phone credit' }), 'utilities', 'phone credit is not debt');
  assert.equal(P.suggestCategory({ name: 'Credit card' }), 'debt');
  const w = { name: 'Water' }; P.applyCategorySuggestion(w); P.setCategory(w, ''); w.name = 'Water rates'; P.applyCategorySuggestion(w);
  assert.equal(w.category, '', 'choosing "Not categorised" sticks after a rename');
  const c0 = household({ accounts: [{ id: 'a' }], bills: [{ id: 'x', name: 'Water', amount: 1, account: 'a', months: [], category: '' }, { id: 'y', name: 'Zzz', amount: 1, account: 'a', months: [] }] });
  assert.deepEqual([P.byCategory(c0).uncategorised, P.byCategory(c0).unset], [2, 1], 'only never-chosen bills count as needing a category');
  const t = P.niceTicks(2150, 2150.0000000000005, 4);
  assert.ok(t.length >= 2 && t.length <= 21 && t[0] < 2150 && t[t.length - 1] > 2150, JSON.stringify(t));
  assert.ok(P.niceTicks(0, 0, 4).length <= 21);
  assert.ok(P.niceTicks(-1e-12, 1e-12, 4).length <= 21);
  assert.ok(P.niceTicks(NaN, Infinity, 4).length <= 21);
  const ch = household({ accounts: [{ id: 'a' }], bills: [{ id: 'e', name: 'E', amount: 10, account: 'a', months: [], history: [null, { from: 1 }, { on: 'x' }, { on: '2026-09-01', from: 8, to: 10 }] }] });
  assert.equal(P.priceChanges(ch, '2026-10-15').changes.length, 1, 'broken history entries are skipped, not fatal');
  const c = household({ people: [{ id: 'p', payAccount: 'a' }], accounts: [{ id: 'a' }],
    savings: [{ id: 'old', name: 'Old', amount: 50, fromAccount: 'a' }, { id: 'new', name: 'New', amount: 100, fromAccount: 'a', since: '2026-09' }],
    bills: [{ id: 'j', name: 'Junior ISA', amount: 100, account: 'a', months: [], savings: true, savingsSince: '2026-10' }] });
  const m = {}; for (let i = 1; i <= 10; i++) m['2026-' + String(i).padStart(2, '0')] = { pay: { p: 2000 }, done: i >= 9 ? { 's:new': 100 } : {} };
  const r = P.savedSoFar(c, m, '2026-10'), get = id => r.items.find(x => x.id === id);
  assert.deepEqual([get('new').monthsDone, get('new').monthsSaved, get('new').consistency], [2, 2, 1], 'a transfer added in September counts from September');
  assert.deepEqual([get('old').monthsSaved, get('old').consistency], [10, 0], 'one with no start month counts from the first month used');
  assert.equal(get('j').total, 100, 'a bill marked as savings in October counts from October, not all ten months');
  const early = household({ people: [{ id: 'p', payAccount: 'a' }], accounts: [{ id: 'a' }], savings: [{ id: 'h', name: 'Holiday', amount: 100, fromAccount: 'a', since: '2026-11' }] });
  const e = P.savedSoFar(early, { '2026-09': { pay: { p: 1 } }, '2026-10': { pay: { p: 1 }, done: { 's:h': 100 } }, '2026-11': { pay: { p: 1 } } }, '2026-11').items[0];
  assert.deepEqual([e.total, e.monthsDone, e.monthsSaved, e.since], [100, 1, 2, '2026-10'], 'a tick before the since month still counts, and the count starts from it');
  const b = { name: 'Junior ISA' }; P.setSavingsFlag(b, true, '2026-10'); assert.equal(b.savingsSince, '2026-10');
  P.setSavingsFlag(b, false); assert.equal(b.savingsSince, undefined);
  P.setCategory(b, 'savings', '2026-11'); assert.equal(b.savingsSince, '2026-11');
});
