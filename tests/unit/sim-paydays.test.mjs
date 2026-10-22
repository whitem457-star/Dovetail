// Unit tests for the simulation's layer-2 oracle (2.17, docs/payperiods.md 13.2) and the worked examples' layer-2 figures
// (docs/payperiods/worked-examples.md, model.md 3.5, critique.md 6), pinned from the documents: the payday counter in
// sim/gen.mjs on its own, then the app's functions against the same figures. The households are the design's made-up
// ones (Priya, Jordan, Sam, Hannah and Marc). Until the 2.17 core is in calc.js the app's tests fail, naming what's missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, loadPage, household, clone } from './load.mjs';
import { holidayCal, holidaysByRule, GOVUK, easterGauss, dayStr, windowOracle, countOracle, freezeOracle, planOracle2, datedPerson } from '../sim/gen.mjs';
import { paydayApiMissing } from '../sim/check.mjs';

const CAL = holidayCal('real');
const count = (pc, k, pt) => { const w = windowOracle(pc, k, CAL); return countOracle(pt, w.after, w.upTo, CAL); };
const core = () => { const m = paydayApiMissing(P); if (m.length) assert.fail(`2.17's core isn't in calc.js yet: missing ${m.join(', ')}`); };
const CT = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1];
const bills = (list, acct) => list.map((b, i) => ({ id: 'b' + i, name: b[0], amount: b[1], account: acct, months: b[2] || [] }));
const acc = (id, name, o = {}) => Object.assign({ id, name, colour: 'blue', leftoverTo: null }, o);
// Priya: £1,640 every four weeks on Thursdays (8 October 2026 is one), transfer day the 1st.
const priya = () => household({ people: [{ id: 'priya', name: 'Priya', payAccount: 'cur', usualPay: 0, pattern: { every: 28, each: 1640, on: '2026-10-08' } }],
  accounts: [acc('cur', 'Current account'), acc('bills', 'Bills account', { leftoverTo: 'cur' })],
  bills: bills([['Rent', 725], ['Council Tax', 128, CT], ['Energy', 85], ['Broadband', 28], ['Phone', 16], ['Contents insurance', 9]], 'bills'),
  budgets: [{ id: 'g1', name: 'Spending', amount: 380, account: 'cur' }], savings: [{ id: 's1', name: 'Savings', amount: 100, fromAccount: 'cur' }], payday: { day: 1, weekend: true } });
// Jordan: weekly on Fridays (2 October 2026 is one), usual £420, transfer day the last working day.
const jordan = () => household({ people: [{ id: 'jordan', name: 'Jordan', payAccount: 'cur', usualPay: 0, pattern: { every: 7, each: 420, on: '2026-10-02' } }],
  accounts: [acc('cur', 'Current account'), acc('bills', 'Bills account', { leftoverTo: 'cur' })],
  bills: bills([['Room rent', 560], ['Phone', 22], ['Gym', 25], ['Streaming', 11], ['Bus pass', 68]], 'bills'),
  savings: [{ id: 's1', name: 'Savings', amount: 60, fromAccount: 'cur' }], payday: { day: 'last', weekend: true } });
// Sam: weekly on Mondays (1 March 2027 is one), £420, rent £1,500, transfer day the 25th: Easter 2027 (model.md 3.5).
const sam = () => household({ people: [{ id: 'sam', name: 'Sam', payAccount: 'cur', usualPay: 0, pattern: { every: 7, each: 420, on: '2027-03-01' } }],
  accounts: [acc('cur', 'Current account'), acc('bills', 'Bills account', { leftoverTo: 'cur' })], bills: bills([['Rent', 1500]], 'bills'), payday: { day: 25, weekend: true } });
// Hannah (monthly £2,050) and Marc (monthly £2,300 up to January 2027, then £540 a week from Friday 15 January), in
// proportion to pay into Joint, transfer day the last working day.
const hannahMarc = () => household({ people: [{ id: 'hannah', name: 'Hannah', payAccount: 'hannah', usualPay: 2050 },
    { id: 'marc', name: 'Marc', payAccount: 'marc', usualPay: 2340, pattern: { every: 7, each: 540, on: '2027-01-15', since: '2027-01-15' }, was: [{ until: '2027-01', usualPay: 2300 }] }],
  accounts: [acc('hannah', "Hannah's account"), acc('marc', "Marc's account"), acc('joint', 'Joint account', { funding: { people: ['hannah', 'marc'], rule: 'pay' } })],
  bills: bills([['Mortgage', 1150], ['Council Tax', 170, CT], ['Energy', 160], ['Water', 45], ['Broadband', 35], ['Insurance', 40], ['Car loan', 300]], 'joint'),
  budgets: [{ id: 'g1', name: 'Food', amount: 450, account: 'joint' }], payday: { day: 'last', weekend: true } });
/** A save of month k as flushMonth makes it: the body through freezePaydays, with the month as saved before. */
function save(PP, c, months, k, body) { const b = clone(body), r = PP.freezePaydays(c, months, k, b, months[k] || {}); months[k] = r && typeof r === 'object' ? r : b; return months[k]; }
const left = (c, months, k, PP = P) => PP.r2(PP.calcMonth(c, months, k).flt);

// ---------- The oracle on its own ----------
test('the counter: H1\'s rule is gov.uk\'s England and Wales list for 2024–2028, and Easter by Gauss\'s method', () => {
  for (let y = 2024; y <= 2028; y++) assert.deepEqual(holidaysByRule(y), GOVUK[y], String(y));
  assert.deepEqual([1954, 1981, 2019, 2027, 2038, 2049].map(y => dayStr(easterGauss(y))), ['1954-04-18', '1981-04-19', '2019-04-21', '2027-03-28', '2038-04-25', '2049-04-18']);
});
test('the counter: the worked examples\' windows and paydays', () => {
  assert.deepEqual(count({ day: 1, weekend: true }, '2027-01', { every: 28, on: '2026-10-08' }), ['2026-12-03', '2026-12-31'], 'Priya, January 2027: 2 (New Year\'s Day moves the transfer day to Thu 31 Dec)');
  assert.deepEqual(count({ day: 'last', weekend: true }, '2026-11', { every: 7, on: '2026-10-02' }), ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'], 'Jordan, November 2026: 5');
  assert.deepEqual(count({ day: 'last', weekend: true }, '2027-01', { every: 14, on: '2026-12-04' }), ['2026-12-04', '2026-12-18', '2026-12-31'], 'Lewis, January 2027: 3 (Fri 1 Jan moves to Thu 31 Dec)');
  assert.equal(count({ day: 25, weekend: true }, '2027-04', { every: 7, on: '2027-03-01' }).length, 5, 'Sam, April 2027: 5 (Easter Monday moves to Thu 25 Mar)');
  assert.deepEqual(count({ day: 25, weekend: true }, '2027-05', { every: 7, on: '2027-03-01' }), ['2027-04-05', '2027-04-12', '2027-04-19'], 'Sam, May 2027: 3');
  assert.deepEqual(count({ day: 'last', weekend: true }, '2027-02', { every: 7, on: '2027-01-15', since: '2027-01-15' }), ['2027-01-15', '2027-01-22', '2027-01-29'], 'Marc, February 2027: 3 of 4');
  assert.deepEqual(count({}, '2027-01', { every: 14, on: '2026-12-04' }), ['2026-12-04', '2026-12-18'], 'no transfer day: the 25th, not moved (L8)');
  assert.deepEqual(count({ day: 25, weekend: true }, '2027-04', { every: 7, on: '2027-03-01', since: '2027-03-29' }), ['2027-03-25'], 'L20: a since on Easter Monday counts the pay moved to Thu 25 Mar');
});
test('the oracle: rule 1 (5.6): a tick freezes 5 paydays and £420.00; typing £1,851 makes it £370.20, used £1,480.80', () => {
  const q = datedPerson(jordan().people[0]);
  const t = freezeOracle([q], { pay: { jordan: 1680 }, payEstimated: { jordan: true } }, {}, () => 5, () => false);
  assert.deepEqual(t, { pay: { jordan: 1680 }, payEstimated: { jordan: true }, paydays: { jordan: 5 }, extra: { jordan: { amount: 420 } } });
  const typed = freezeOracle([q], { pay: { jordan: 1851 }, paydays: { jordan: 5 }, extra: { jordan: { amount: 420 } } }, t, () => 5, () => false);
  assert.equal(typed.extra.jordan.amount, 370.2);
  assert.equal(planOracle2(q, typed, 5, null).used, 1480.8);
});

// ---------- The app against the same figures ----------
test('2.17: transferWindow and paydaysIn give the worked examples\' paydays', () => {
  core();
  const cases = [[priya(), '2027-01'], [jordan(), '2026-11'], [sam(), '2027-04'], [sam(), '2027-05'], [hannahMarc(), '2027-02']];
  cases.forEach(([c, k]) => { const p = c.people.find(x => x.pattern), w = P.transferWindow(c, k), o = windowOracle(c.payday, k, CAL);
    assert.deepEqual(w, { after: dayStr(o.after), upTo: dayStr(o.upTo) }, `${p.name} ${k}'s window`);
    assert.deepEqual(P.paydaysIn(p.pattern, w.after, w.upTo), count(c.payday, k, p.pattern), `${p.name} ${k}'s paydays`); });
});
test('2.17: Priya\'s January 2027, frozen at 2 paydays, keeps £169.00 left over under every edit (critique.md 6)', () => {
  core();
  const c = priya(), months = {}, d = save(P, c, months, '2027-01', { pay: { priya: 3280 } });
  assert.equal(d.paydays.priya, 2); assert.deepEqual(d.extra.priya, { amount: 1640 });
  assert.equal(P.planPay(c, months, '2027-01').priya.used, 1640);
  assert.equal(left(c, months, '2027-01'), 169);
  const edits = {
    'transfer day the last working day': x => { x.payday = { day: 'last', weekend: true }; },
    'transfer day the 15th, not moved': x => { x.payday = { day: 15, weekend: false }; },
    'date corrected by 3 days': x => { x.people[0].pattern.on = '2026-10-11'; },
    'date corrected by one interval': x => { x.people[0].pattern.on = '2026-11-05'; },
    'date removed': x => { delete x.people[0].pattern.on; },
    'since added after it': x => { x.people[0].pattern.since = '2027-03-25'; },
    'pay each time changed from June 2027': x => { const p = x.people[0], s = P.personSnap(p); p.pattern = Object.assign({}, p.pattern, { each: 1700 }); p.usualPay = P.r2(1700 * 13 / 12); P.datePersonEdit(p, s, '2027-06'); },
    'weekly from June 2027': x => { const p = x.people[0], s = P.personSnap(p); p.pattern = { every: 7, each: 410 }; p.usualPay = P.r2(410 * 52 / 12); P.datePersonEdit(p, s, '2027-06'); },
  };
  Object.entries(edits).forEach(([what, f]) => { const x = clone(c); f(x); assert.equal(left(x, months, '2027-01'), 169, what); assert.equal(P.planPay(x, months, '2027-01').priya.setAside, 1640, what); });
  const none = loadPage('function bankHolidaysEW(y){return []}');
  assert.equal(none.transferWindow(c, '2027-01').upTo, '2027-01-01', 'without holidays January\'s transfer day is Fri 1 Jan');
  assert.equal(left(c, months, '2027-01', none), 169, 'the holiday rule switched off');
  assert.equal(P.backupNeedsFor(c, months), '2.17');
});
test('2.17: rule 1, Jordan\'s November 2026: a tick stores 5 paydays and £420.00 with £1,680.00 in the box; typing £1,851 gives £370.20 set aside and £1,480.80 used', () => {
  core();
  const c = jordan(), months = {}, k = '2026-11', est = P.planPay(c, months, k).jordan;
  assert.equal(est.m, 5); assert.equal(est.used, 1680); assert.equal(est.layer, 2); assert.equal(est.expected, 2100); assert.equal(est.extraDefault, 420);
  let d = save(P, c, months, k, { pay: { jordan: est.used }, payEstimated: { jordan: true } });
  assert.deepEqual([d.pay.jordan, d.paydays.jordan, d.extra.jordan], [1680, 5, { amount: 420 }]);
  assert.equal(P.planPay(c, months, k).jordan.used, 1680, 'a ticked month reads its box');
  d = save(P, c, months, k, { pay: { jordan: 1851 }, paydays: d.paydays, extra: d.extra });
  assert.equal(d.extra.jordan.amount, 370.2);
  assert.deepEqual(['arrived', 'setAside', 'used'].map(f => P.planPay(c, months, k).jordan[f]), [1851, 370.2, 1480.8]);
});
test('2.17: Easter 2027, weekly on Mondays with the transfer day the 25th: April 5 paydays, May 3, and Use it this month turns May\'s −£240.00 into £180.00', () => {
  core();
  const c = sam(), months = {};
  const apr = save(P, c, months, '2027-04', { pay: { sam: 2100 } });
  assert.equal(apr.paydays.sam, 5); assert.deepEqual(apr.extra.sam, { amount: 420 });
  assert.deepEqual(['arrived', 'setAside', 'used'].map(f => P.planPay(c, months, '2027-04').sam[f]), [2100, 420, 1680]);
  const may = save(P, c, months, '2027-05', { pay: { sam: 1260 } });
  assert.equal(may.paydays.sam, 3); assert.equal(may.extra, undefined);
  assert.equal(left(c, months, '2027-05'), -240);
  const o = P.useExtraOffer(c, months, '2027-05', 'sam');
  assert.deepEqual(o, { kind: 'in', name: "Sam's extra payday from April", amount: 420, account: 'cur', extraFrom: '2027-04', extraOf: 'sam' });
  save(P, c, months, '2027-05', Object.assign(clone(may), { oneOffs: [Object.assign({ id: 'o1' }, o)] }));
  assert.equal(left(c, months, '2027-05'), 180);
  assert.equal(P.extraLock(months, '2027-04', 'sam'), '2027-05');
  assert.equal(P.useExtraOffer(c, months, '2027-05', 'sam'), null, 'offered once');
  assert.equal(save(P, c, months, '2027-04', Object.assign(clone(months['2027-04']), { pay: { sam: 2150 } })).extra.sam.amount, 420, 'locked: April\'s amount doesn\'t follow its pay');
  assert.equal(P.backupNeedsFor(c, months), '2.17');
  const noDate = clone(c); delete noDate.people[0].pattern.on;
  assert.equal(P.backupNeedsFor(noDate, months), '2.17', 'a one-off used later still needs 2.17 without the date (L14)');
  save(P, c, months, '2027-05', Object.assign(clone(months['2027-05']), { oneOffs: [] }));
  assert.equal(P.extraLock(months, '2027-04', 'sam'), null);
  assert.equal(save(P, c, months, '2027-04', clone(months['2027-04'])).extra.sam.amount, 430, 'unlocked: it follows April\'s pay again (2,150 ÷ 5)');
});
test('2.17, L22: with no payday date, a change of interval leaves an extra payday typed through "Had an extra payday?" exactly as it was', () => {
  core();
  const c = jordan(); delete c.people[0].pattern.on;
  const months = { '2026-12': { pay: { jordan: 2100 }, extra: { jordan: { amount: 500 } } } }, before = JSON.stringify(months);
  const c2 = clone(c); c2.people[0].pattern = { every: 14, each: 840 }; c2.people[0].usualPay = 1820;
  const ks = P.intervalChangedMonths(c, c2, months, 'jordan'), after = P.refreezeInterval(c2, months, 'jordan', ks, c);
  assert.equal(JSON.stringify(after), before);
  assert.equal(P.planPay(c2, after, '2026-12').jordan.setAside, 500);
});
test('2.17, L22: a layer-1 line typed before the date was added keeps its amount when the box is cleared and typed again', () => {
  core();
  const c = jordan(), months = { '2026-11': { pay: { jordan: 2100 }, extra: { jordan: { amount: 300 } } } };
  save(P, c, months, '2026-11', { extra: { jordan: { amount: 300 } } });
  const d = save(P, c, months, '2026-11', { pay: { jordan: 2100 }, extra: months['2026-11'].extra });
  assert.equal(d.paydays.jordan, 5); assert.deepEqual(d.extra.jordan, { amount: 300, edited: true });
  assert.equal(P.planPay(c, months, '2026-11').jordan.used, 1800);
});
test('2.17: Marc\'s February 2027, his first weekly month, has 3 paydays of the usual 4; typed £1,707 the shares are £1,018.00 and £1,162.00', () => {
  core();
  const c = hannahMarc(), months = {}, k = '2027-02';
  assert.equal(P.patternStartMonth(c, 'marc', '2027-01-15'), '2027-02');
  const e = P.planPay(c, months, k).marc;
  assert.deepEqual([e.layer, e.m, e.n, e.arrived, e.used], [2, 3, 4, 1620, 1620]);
  const d = save(P, c, months, k, { pay: { hannah: 2050, marc: 1707 } });
  assert.equal(d.paydays.marc, 3); assert.equal(d.paydays.hannah, undefined); assert.equal(d.extra, undefined);
  const r = P.calcMonth(c, months, k), share = id => P.r2(r.steps.filter(s => s.kind === 'contribute' && s.person === id).reduce((t, s) => t + s.amt, 0));
  assert.deepEqual([share('hannah'), share('marc')], [1018, 1162]);
});
