// Unit tests for 2.16: pay patterns, layer 1 (docs/payperiods.md 5.3, 6.1, Appendix A and section 11.2, E6 to E17).
// Someone paid weekly, every two weeks or every four weeks has pattern {every, each}; the household still makes its
// transfers once a month; the pay a month plans on comes from one function (planPay); an extra payday is set aside
// unless counted; standing orders from each pay cover every month. Households without a pattern get exactly what 2.15
// gave. The households are the design's made-up ones (docs/payperiods/worked-examples.md) and the made-up Alex and Sam.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, household, sampleUpgraded, sample36, clone } from './load.mjs';

const CT = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1];
const bills = (list, acct) => list.map((b, i) => ({ id: 'b' + i, name: b[0], amount: b[1], account: acct, months: b[2] || [] }));
const acc = (id, name, o = {}) => Object.assign({ id, name, colour: 'blue', leftoverTo: null }, o);
// Priya: £1,640 every four weeks, a bills account topped up from her current account.
const priya = () => household({ people: [{ id: 'priya', name: 'Priya', payAccount: 'cur', usualPay: 0, pattern: { every: 28, each: 1640 } }],
  accounts: [acc('cur', 'Current account'), acc('bills', 'Bills account', { leftoverTo: 'cur' })],
  bills: bills([['Rent', 725], ['Council Tax', 128, CT], ['Energy', 85], ['Broadband', 28], ['Phone', 16], ['Contents insurance', 9]], 'bills'),
  budgets: [{ id: 'g1', name: 'Spending', amount: 380, account: 'cur' }], savings: [{ id: 's1', name: 'Savings', amount: 100, fromAccount: 'cur' }], payday: { day: 1, weekend: true } });
// Jordan: weekly, usual £420.
const jordan = (o = {}) => household(Object.assign({ people: [{ id: 'jordan', name: 'Jordan', payAccount: 'cur', usualPay: 0, pattern: { every: 7, each: 420 } }],
  accounts: [acc('cur', 'Current account'), acc('bills', 'Bills account', { leftoverTo: 'cur' })],
  bills: bills([['Room rent', 560], ['Phone', 22], ['Gym', 25], ['Streaming', 11], ['Bus pass', 68]], 'bills'),
  savings: [{ id: 's1', name: 'Savings', amount: 60, fromAccount: 'cur' }], payday: { day: 'last', weekend: true } }, o));
// Dan (monthly, £2,480) and Kerry (£1,560 every four weeks), each paying into Joint by rule (default: in proportion to pay).
const danKerry = (funding = { people: ['dan', 'kerry'], rule: 'pay' }, o = {}) => household(Object.assign({
  people: [{ id: 'dan', name: 'Dan', payAccount: 'dan', usualPay: 2480 }, { id: 'kerry', name: 'Kerry', payAccount: 'kerry', usualPay: 0, pattern: { every: 28, each: 1560 } }],
  accounts: [acc('dan', "Dan's account"), acc('kerry', "Kerry's account"), acc('joint', 'Joint account', { funding })],
  bills: bills([['Mortgage', 1045], ['Council Tax', 186, CT], ['Energy', 165], ['Water', 48], ['Broadband and TV', 55], ['Home insurance', 24], ['Life insurance', 28]], 'joint'),
  budgets: [{ id: 'g1', name: 'Food and household', amount: 520, account: 'joint' }], payday: { day: 'last', weekend: true } }, o));
const MAY = '2027-05';
// Kerry's May 2027: two paydays arrived (£3,120), with the extra set aside, counted, or the link not used.
const kerryMay = (extra) => { const d = { pay: { dan: 2480, kerry: 3120 } }; if (extra) d.extra = { kerry: extra }; return { [MAY]: d }; };
const shares = r => Object.fromEntries(r.steps.filter(s => s.kind === 'contribute').map(s => [s.person, P.r2(s.amt)]));
const view = r => ({ steps: r.steps.map(s => [s.id, P.r2(s.amt)]), floats: r.floats.map(f => [f.id, P.r2(f.amt)]) });

test('PAY_EVERY and the words', () => {
  assert.deepEqual(P.PAY_EVERY, { 7: { n: 4, year: 52, word: 'week' }, 14: { n: 2, year: 26, word: 'two weeks' }, 28: { n: 1, year: 13, word: 'four weeks' } });
  assert.equal(P.everyWords(7), 'a week'); assert.equal(P.everyWords(14), 'every two weeks'); assert.equal(P.everyWords(28), 'every four weeks'); assert.equal(P.everyWords(30), '');
  assert.equal(P.patternWords({ every: 28, each: 1560 }), '£1,560.00 every four weeks');
  assert.equal(P.patternWords({ every: 7, each: 420 }), '£420.00 a week');
  assert.equal(P.patternWords(null), '');
});

test('validPattern: every 7, 14 or 28 (a number), pay each time above £0 and up to £1,000,000', () => {
  for (const ok of [{ every: 7, each: 420 }, { every: 14, each: 0.01 }, { every: 28, each: 1000000 }, { every: 7, each: 420, on: '2026-10-02' }]) assert.equal(P.validPattern(ok), true, JSON.stringify(ok));
  for (const bad of [null, undefined, 7, 'weekly', [], {}, { every: 30, each: 420 }, { every: '7', each: 420 }, { every: 7, each: '420' }, { every: 7, each: 0 },
    { every: 7, each: -5 }, { every: 7, each: 0.004 }, { every: 7, each: 1000000.01 }, { every: 7, each: NaN }, { every: 7, each: Infinity }, { every: 7 }, { each: 420 }])
    assert.equal(P.validPattern(bad), false, JSON.stringify(bad));
});

test('usualMonthly, hasPatterns, patternsEver, dayWord', () => {
  assert.equal(P.usualMonthly({ pattern: { every: 28, each: 1560 } }), 1690);
  assert.equal(P.usualMonthly({ pattern: { every: 7, each: 420 } }), 1820);
  assert.equal(P.usualMonthly({ pattern: { every: 14, each: 1020 } }), 2210);
  assert.equal(P.usualMonthly({ pattern: { every: 28, each: 1640 } }), 1776.67);
  assert.equal(P.usualMonthly({ usualPay: 2300 }), 2300, 'monthly: the usual pay');
  assert.equal(P.usualMonthly({ usualPay: 2300, pattern: { every: 30, each: 5 } }), 2300, 'a pattern that can\'t be used is monthly');
  assert.equal(P.usualMonthly(null), 0);
  const s = sampleUpgraded(false).c;
  assert.equal(P.hasPatterns(s), false); assert.equal(P.patternsEver(s), false);
  assert.equal(P.hasPatterns(danKerry()), true); assert.equal(P.patternsEver(danKerry()), true);
  const was = clone(s); was.people[0].was = [{ until: '2026-01', usualPay: 1800, pattern: { every: 7, each: 400 } }];
  assert.equal(P.hasPatterns(was), false, 'not now'); assert.equal(P.patternsEver(was), true, 'in an earlier pay');
  assert.equal(P.hasPatterns(null), false); assert.equal(P.patternsEver({}), false);
  assert.equal(P.dayWord(s), 'payday'); assert.equal(P.dayWord(s, true), 'Payday');
  assert.equal(P.dayWord(danKerry()), 'transfer day'); assert.equal(P.dayWord(danKerry(), true), 'Transfer day');
  assert.equal(P.dayWord(was), 'payday', 'only a pattern now counts');
});

test('normCfg: a pattern sets usual pay without a report; one that can\'t be used goes, with a report', () => {
  const rep = [];
  const c = P.normCfg({ people: [{ id: 'k', name: 'Kerry', payAccount: 'a', usualPay: 99, pattern: { every: 28, each: 1560.004 } }], accounts: [acc('a', 'A')] }, rep);
  assert.deepEqual(c.people[0].pattern, { every: 28, each: 1560 }, 'pay each time to the penny');
  assert.equal(c.people[0].usualPay, 1690, 'usual pay worked out from it');
  assert.deepEqual(rep, [], 'derived, not entered: no report');
  // Anything else inside a pattern is kept (layer 2 may add to it).
  assert.deepEqual(P.normCfg({ people: [{ id: 'k', pattern: { every: 7, each: 420, on: '2026-10-02' } }] }).people[0].pattern, { every: 7, each: 420, on: '2026-10-02' });
  for (const bad of [null, 'weekly', { every: 30, each: 420 }, { every: 7, each: 0 }, { every: 7, each: -1 }, { every: 7, each: 2e6 }, { every: '14', each: 500 }]) {
    const r2 = [], x = P.normCfg({ people: [{ id: 'k', usualPay: 2000, pattern: bad }] }, r2);
    assert.equal(x.people[0].pattern, undefined, JSON.stringify(bad));
    assert.equal(x.people[0].usualPay, 2000, 'usual pay as it was');
    assert.deepEqual(r2, ['a pay pattern that couldn\'t be used']);
  }
  // Someone without a pattern is exactly as before.
  const s = sampleUpgraded(true).c;
  assert.equal(JSON.stringify(P.normCfg(s)), JSON.stringify(s));
  assert.ok(P.normCfg(s).people.every(p => !('pattern' in p)));
});

test('normCfg: a was entry with a pattern gets its usual pay from it; one without means paid every month', () => {
  const rep = [];
  const c = P.normCfg({ people: [{ id: 'm', usualPay: 2400, was: [
    { until: '2026-06', usualPay: 2000 },
    { until: '2026-09', pattern: { every: 7, each: 540 } },
    { until: '2026-10', usualPay: 5, pattern: { every: 14, each: 1100.456 } },
    { until: '2026-11', usualPay: 2100, pattern: { every: 99, each: 1 } },
    { until: '2026-12', pattern: { every: 99, each: 1 } }] }] }, rep);
  assert.deepEqual(c.people[0].was, [
    { until: '2026-06', usualPay: 2000 },
    { until: '2026-09', usualPay: 2340, pattern: { every: 7, each: 540 } },
    { until: '2026-10', usualPay: 2384.33, pattern: { every: 14, each: 1100.46 } },
    { until: '2026-11', usualPay: 2100 }]);
  assert.deepEqual(rep, ['a pay pattern that couldn\'t be used', 'a pay pattern that couldn\'t be used', 'an earlier pay that couldn\'t be used']);
  // 2.15's entries are untouched.
  const old = { people: [{ id: 'm', usualPay: 2400, was: [{ until: '2026-06', usualPay: 2000 }] }] };
  assert.deepEqual(P.normCfg(old).people[0].was, [{ until: '2026-06', usualPay: 2000 }]);
});

test('normMonths: extra paydays kept as {amount, counted?}, with anything else inside; what can\'t be read goes', () => {
  const rep = [];
  const m = P.normMonths({
    '2026-11': { pay: { k: 3120 }, extra: { k: { amount: 1560 }, j: { amount: 0, counted: true, edited: true, paydays: 5 } } },
    '2026-12': { pay: { k: 1560 }, extra: { k: { amount: 100, counted: false }, x: { amount: -1 }, y: 'oops', z: { counted: true } } },
    '2027-01': { pay: { k: 1560 }, extra: 'nope' },
    '2027-02': { pay: { k: 1560 }, extra: { x: null } },
    '2027-03': { pay: { k: 1560 } } }, rep);
  assert.deepEqual(m['2026-11'].extra, { k: { amount: 1560 }, j: { amount: 0, counted: true, edited: true, paydays: 5 } });
  assert.deepEqual(m['2026-12'].extra, { k: { amount: 100 } }, 'counted only as true');
  assert.equal('extra' in m['2027-01'], false); assert.equal('extra' in m['2027-02'], false, 'stored only when used');
  assert.equal('extra' in m['2027-03'], false);
  assert.deepEqual(rep, Array(5).fill('an extra payday that couldn\'t be read'));
  // Months from earlier versions go through unchanged.
  const s = sampleUpgraded(true).m;
  assert.equal(JSON.stringify(P.normMonths(s)), JSON.stringify(s));
});

test('backups: version 6 needing 2.16 with any pattern, now or in a was entry; 2.16 beats 2.15, 2.14 and 2.13', () => {
  const s = sampleUpgraded(false).c;
  assert.equal(P.backupVersionFor(s), 5);
  const now = clone(s); now.people[0].pattern = { every: 7, each: 500 };
  assert.equal(P.backupVersionFor(now), 6); assert.equal(P.backupNeedsFor(now), '2.16'); assert.equal(P.PATTERN_NEEDS, '2.16');
  const was = clone(s); was.people[0].was = [{ until: '2026-01', usualPay: 2000, pattern: { every: 14, each: 900 } }];
  assert.equal(P.backupVersionFor(was), 6); assert.equal(P.backupNeedsFor(was), '2.16');
  const all = clone(now); all.people[1].was = [{ until: '2026-01', usualPay: 1900 }]; all.estimates = [{ id: 'e1', account: all.accounts[0].id, amount: 900 }];
  all.flows = [{ from: '2026-01', was: { accounts: {}, pay: {} } }];
  assert.equal(P.backupNeedsFor(all), '2.16');
  const dated = clone(s); dated.people[1].was = [{ until: '2026-01', usualPay: 1900 }];
  assert.equal(P.backupNeedsFor(dated), '2.15', 'dated pay without a pattern is still 2.15');
  const f = JSON.parse(P.backupJson(now, {}, null, 'T'));
  assert.equal(f.version, 6); assert.equal(f.needs, '2.16');
  assert.equal(P.backupRefusal(f, 6, '2.15'), '2.16', 'a 2.15 page names 2.16');
  assert.equal(P.backupRefusal(f, 6, '2.16'), null);
  assert.equal(JSON.parse(P.backupJson(s, {}, null, 'T')).needs, undefined, 'a monthly household: version 5 as before');
});

test('personSnap, datePersonEdit and personAt with patterns: a change of pattern or of pay each time is dated', () => {
  const CUR = '2027-02', JAN = '2027-01';
  assert.deepEqual(P.personSnap({ usualPay: 2300 }), { usualPay: 2300 });
  assert.deepEqual(P.personSnap({ usualPay: 2340, pattern: { every: 7, each: 540 } }), { usualPay: 2340, pattern: { every: 7, each: 540 } });
  // Monthly to weekly from February: the entry has no pattern, so January is monthly.
  const p = { id: 'm', usualPay: 2300 };
  let before = P.personSnap(p); p.pattern = { every: 7, each: 540 }; p.usualPay = P.usualMonthly(p);
  assert.equal(P.datePersonEdit(p, before, CUR), true);
  assert.deepEqual(p.was, [{ until: JAN, usualPay: 2300 }]);
  const c = { people: [p] };
  assert.equal(P.personAt(c, 'm', JAN).pattern, undefined, 'paid every month then');
  assert.equal(P.personAt(c, 'm', JAN).usualPay, 2300);
  assert.deepEqual(P.personAt(c, 'm', CUR).pattern, { every: 7, each: 540 });
  // A second edit in the same pay month (pay each time) keeps what was there before the first.
  before = P.personSnap(p); p.pattern = { every: 7, each: 560 }; p.usualPay = P.usualMonthly(p);
  assert.equal(P.datePersonEdit(p, before, CUR), true);
  assert.deepEqual(p.was, [{ until: JAN, usualPay: 2300 }]);
  // Back to monthly £2,300: the entry goes.
  before = P.personSnap(p); delete p.pattern; p.usualPay = 2300;
  assert.equal(P.datePersonEdit(p, before, CUR), false);
  assert.equal(p.was, undefined);
  // Weekly in January, then pay each time changes from February: January keeps £540 each time.
  const q = { id: 'q', usualPay: 2340, pattern: { every: 7, each: 540 } };
  before = P.personSnap(q); q.pattern = { every: 7, each: 600 }; q.usualPay = P.usualMonthly(q);
  assert.equal(P.datePersonEdit(q, before, CUR), true);
  assert.deepEqual(q.was, [{ until: JAN, usualPay: 2340, pattern: { every: 7, each: 540 } }]);
  assert.deepEqual(P.personAt({ people: [q] }, 'q', JAN).pattern, { every: 7, each: 540 });
  // A pattern whose keys come in another order is the same pattern.
  before = P.personSnap(q); q.pattern = { each: 540, every: 7 }; q.usualPay = 2340;
  assert.equal(P.datePersonEdit(q, before, CUR), false, 'back to January\'s: the entry goes');
  assert.equal(q.was, undefined);
  // Weekly to monthly: earlier months keep the pattern.
  const r = { id: 'r', usualPay: 2340, pattern: { every: 7, each: 540 } };
  before = P.personSnap(r); delete r.pattern; r.usualPay = 2500;
  assert.equal(P.datePersonEdit(r, before, CUR), true);
  assert.deepEqual(r.was, [{ until: JAN, usualPay: 2340, pattern: { every: 7, each: 540 } }]);
  // Items are dated exactly as before (dateFields' comparison).
  const b = { id: 'b', amount: 50, account: 'x', months: [] }, bb = P.itemSnap('bills', b); b.amount = 60;
  assert.equal(P.dateEdit('bills', b, bb, CUR), true); assert.deepEqual(b.was, [{ until: JAN, amount: 50, account: 'x', months: [] }]);
  const b2 = P.itemSnap('bills', b); b.amount = 50; assert.equal(P.dateEdit('bills', b, b2, CUR), false); assert.equal(b.was, undefined);
});

test('planPay: someone paid monthly, as today; someone on a pattern, what arrived or pay each time × n', () => {
  const c = danKerry(), months = { '2026-11': { pay: { dan: 2500, kerry: 1600 } }, '2026-12': { pay: { dan: 2470, kerry: 3120 } } };
  const pl = P.planPay(c, months, '2027-01');
  assert.deepEqual(pl.dan, { kind: 'month', arrived: 2470, setAside: 0, used: 2470, typed: false, n: null, each: null, from: '2026-12' });
  assert.deepEqual(pl.kerry, { kind: 'pattern', arrived: 1560, setAside: 0, used: 1560, typed: false, n: 1, each: 1560, from: null }, 'never December\'s two paydays');
  const typed = P.planPay(c, months, '2026-12');
  assert.deepEqual(typed.kerry, { kind: 'pattern', arrived: 3120, setAside: 0, used: 3120, typed: true, n: 1, each: 1560, from: '2026-12' }, 'the link not used: in the pay used');
  assert.deepEqual(P.planPay(c, {}, '2026-11').dan, { kind: 'month', arrived: 2480, setAside: 0, used: 2480, typed: false, n: null, each: null, from: null }, 'usual pay');
  assert.deepEqual(P.planPay(c, months, '2026-11').kerry.used, 1600);
  assert.equal(P.planPay(jordan(), {}, '2026-11').jordan.used, 1680, 'weekly: 4 × £420');
  assert.equal(P.planPay(danKerry(undefined, { people: [{ id: 'dan', name: 'Dan', payAccount: 'dan', usualPay: 2480 }, { id: 'kerry', name: 'Kerry', payAccount: 'kerry', pattern: { every: 14, each: 880 } }] }), {}, MAY).kerry.used, 1760, 'every two weeks: 2 × £880');
});

test('planPay: an extra payday is set aside only when the pay is typed, unless it\'s counted; never below £0', () => {
  const c = danKerry();
  const aside = P.planPay(c, kerryMay({ amount: 1560 }), MAY).kerry;
  assert.deepEqual([aside.arrived, aside.setAside, aside.used, aside.typed], [3120, 1560, 1560, true]);
  const counted = P.planPay(c, kerryMay({ amount: 1560, counted: true }), MAY).kerry;
  assert.deepEqual([counted.arrived, counted.setAside, counted.used], [3120, 0, 3120]);
  // Pay filled in by a tick (payEstimated) isn't typed: nothing is set aside (E7).
  const est = kerryMay({ amount: 1560 }); est[MAY].payEstimated = { kerry: true };
  assert.deepEqual([P.planPay(c, est, MAY).kerry.setAside, P.planPay(c, est, MAY).kerry.used, P.planPay(c, est, MAY).kerry.typed], [0, 3120, false]);
  // Untyped: the estimate, nothing set aside whatever is stored.
  const none = { [MAY]: { pay: { dan: 2480 }, extra: { kerry: { amount: 900 } } } };
  assert.deepEqual([P.planPay(c, none, MAY).kerry.arrived, P.planPay(c, none, MAY).kerry.setAside, P.planPay(c, none, MAY).kerry.used], [1560, 0, 1560]);
  // More set aside than arrived: the pay used is £0, never below.
  assert.equal(P.planPay(c, kerryMay({ amount: 5000 }), MAY).kerry.used, 0);
  // Set aside to the penny.
  assert.equal(P.planPay(c, { [MAY]: { pay: { kerry: 2146 }, extra: { kerry: { amount: 412.1 } } } }, MAY).kerry.used, 1733.9);
  // Someone paid monthly never has anything set aside, whatever is stored.
  assert.equal(P.planPay(c, { [MAY]: { pay: { dan: 2480 }, extra: { dan: { amount: 100 } } } }, MAY).dan.used, 2480);
});

test('planPay: live (the month being typed) takes the place of the saved month', () => {
  const c = danKerry(), months = kerryMay({ amount: 1560 });
  // The boxes say otherwise: £3,200 typed, nothing set aside yet.
  let pl = P.planPay(c, months, MAY, { pay: { dan: 2480, kerry: 3200 }, extra: {} });
  assert.deepEqual([pl.kerry.arrived, pl.kerry.setAside, pl.kerry.used], [3200, 0, 3200]);
  // A box emptied: the estimate.
  pl = P.planPay(c, months, MAY, { pay: { dan: null, kerry: null } });
  assert.deepEqual([pl.dan.used, pl.dan.from, pl.kerry.used, pl.kerry.typed], [2480, null, 1560, false]);
  // Only the extra given: the saved pay with it.
  pl = P.planPay(c, months, MAY, { extra: { kerry: { amount: 1000 } } });
  assert.deepEqual([pl.kerry.arrived, pl.kerry.used], [3120, 2120]);
  // payEstimated given in live.
  pl = P.planPay(c, months, MAY, { pay: { kerry: 3120 }, payEstimated: { kerry: true } });
  assert.equal(pl.kerry.setAside, 0);
  // The saved month isn't changed.
  assert.deepEqual(months, kerryMay({ amount: 1560 }));
});

test('payFor, payEstimate and calcMonth all use planPay: one figure everywhere', () => {
  const c = danKerry(), months = { '2026-12': { pay: { dan: 2470, kerry: 3120 } }, ...kerryMay({ amount: 1560 }) };
  for (const k of ['2026-11', '2026-12', '2027-01', MAY, '2027-06']) {
    const pl = P.planPay(c, months, k), pay = P.payFor(c, months, k);
    c.people.forEach(p => assert.equal(pay[p.id], pl[p.id].used, k + ' ' + p.id));
    assert.deepEqual(P.calcMonth(c, months, k), P.calc(P.cfgFor(c, k, []), P.mNum(k), pay, []));
  }
  assert.deepEqual(P.payEstimate(c, months, 'kerry', '2027-01'), { v: 1560, from: null });
  assert.deepEqual(P.payEstimate(c, months, 'dan', '2027-01'), { v: 2470, from: '2026-12' });
  // The untyped month: the Pay tab's figure (calcMonth), predictedFloat and projectedFloat agree.
  const j = jordan(), jm = { '2026-11': { pay: { jordan: 1851 } } };
  const r = P.calcMonth(j, jm, '2026-12');
  assert.equal(P.r2(r.flt), P.r2(P.projectedFloat(j, jm, '2026-12', ['2026-12'])[0].float));
  const typedDec = { ...jm, '2026-12': { pay: { jordan: 1999 } } };
  assert.equal(P.r2(P.predictedFloat(j, typedDec, '2026-12')), P.r2(r.flt), 'predicted: as the month showed before pay was typed');
  assert.equal(P.planPay(j, jm, '2026-12').jordan.used, 1680);
});

test('the estimate is never above pay each time × n, whatever arrived before', () => {
  for (const [every, each] of [[7, 420], [14, 1020], [28, 1640]]) {
    const c = jordan({ people: [{ id: 'jordan', name: 'Jordan', payAccount: 'cur', pattern: { every, each } }] }), months = {};
    for (let i = 0; i < 24; i++) {
      const k = P.shiftMonth('2026-11', i), e = P.planPay(c, months, k).jordan;
      assert.ok(e.used <= P.r2(each * P.PAY_EVERY[every].n) + 1e-9, k);
      assert.equal(e.used, P.r2(each * P.PAY_EVERY[every].n));
      assert.deepEqual(P.payEstimate(c, months, 'jordan', k), { v: P.r2(each * P.PAY_EVERY[every].n), from: null });
      months[k] = { pay: { jordan: each * (P.PAY_EVERY[every].n + (i % 3 === 0 ? 1 : 0)) + i } };
    }
  }
});

test('a monthly person\'s estimate skips the months they were on a pattern', () => {
  // Marc: monthly £2,300 to January, weekly February to April, monthly again (£2,400) from May.
  const c = household({ people: [{ id: 'm', name: 'Marc', payAccount: 'M', usualPay: 2400, was: [{ until: '2027-01', usualPay: 2300 }, { until: '2027-04', usualPay: 2340, pattern: { every: 7, each: 540 } }] }],
    accounts: [acc('M', "Marc's account")] });
  const months = { '2027-01': { pay: { m: 2290 } }, '2027-02': { pay: { m: 1707 } }, '2027-03': { pay: { m: 2302 } }, '2027-04': { pay: { m: 2937 } } };
  assert.deepEqual(P.payEstimate(c, months, 'm', '2027-05'), { v: 2290, from: '2027-01' }, 'January, not April\'s five Fridays');
  assert.equal(P.planPay(c, months, '2027-05').m.kind, 'month');
  assert.deepEqual(P.payEstimate(c, {}, 'm', '2027-05'), { v: 2400, from: null });
  // In February to April he was on the pattern: pay each time × 4.
  assert.deepEqual(P.payEstimate(c, {}, 'm', '2027-03'), { v: 2160, from: null });
  assert.equal(P.planPay(c, {}, '2027-03').m.kind, 'pattern');
});

test('money styles (5.3.5): setting aside changes nothing; counting moves shares only under the rules that share what\'s left or take a percentage', () => {
  const styles = {
    pay: { people: ['dan', 'kerry'], rule: 'pay' }, equal: { people: ['dan', 'kerry'], rule: 'equal' },
    set: { people: ['dan', 'kerry'], rule: 'set', set: { dan: { amount: 1300 }, kerry: { amount: 800 } } },
    pct: { people: ['dan', 'kerry'], rule: 'pay', set: { kerry: { pct: 30 } } },
    afterOwn: { people: ['dan', 'kerry'], rule: 'afterOwn' }, sameLeft: { people: ['dan', 'kerry'], rule: 'sameLeft' } };
  const got = {};
  for (const [name, f] of Object.entries(styles)) {
    const c = danKerry(f), plain = { [MAY]: { pay: { dan: 2480, kerry: 1560 } } }, all = { [MAY]: { pay: { dan: 2480, kerry: 3120 } } };
    const nothing = P.calcMonth(c, kerryMay(null), MAY), aside = P.calcMonth(c, kerryMay({ amount: 1560 }), MAY), counted = P.calcMonth(c, kerryMay({ amount: 1560, counted: true }), MAY);
    assert.deepEqual(view(aside), view(P.calcMonth(c, plain, MAY)), name + ': set aside is as if it never arrived');
    assert.deepEqual(view(counted), view(P.calcMonth(c, all, MAY)), name + ': counted is in the pay used');
    assert.deepEqual(view(nothing), view(counted), name + ': the link not used is the same as counted');
    got[name] = { aside: shares(aside), counted: shares(counted) };
  }
  // In proportion to pay: the weight is usual pay (pay over a year ÷ 12), so no change either way.
  assert.deepEqual(got.pay, { aside: { dan: 1231.67, kerry: 839.33 }, counted: { dan: 1231.67, kerry: 839.33 } });
  assert.deepEqual(got.equal.aside, got.equal.counted);
  assert.deepEqual(got.set.aside, got.set.counted);
  // A percentage of pay: of what arrived, the extra included when counted.
  assert.equal(got.pct.aside.kerry, 468); assert.equal(got.pct.counted.kerry, 936);
  // After own bills, and so we each keep the same: the shares move when counted (Kerry £575.50 / £1,355.50).
  assert.notDeepEqual(got.afterOwn.aside, got.afterOwn.counted);
  assert.deepEqual(got.sameLeft, { aside: { dan: 1495.5, kerry: 575.5 }, counted: { dan: 715.5, kerry: 1355.5 } });
  // Kerry keeps the extra when it's set aside: it's in her account, outside the transfers.
  const c = danKerry(), keeps = r => P.personKeeps(c, r).map(x => P.r2(x.amt));
  assert.deepEqual(keeps(P.calcMonth(c, kerryMay({ amount: 1560 }), MAY)), [1248.33, 720.67]);
  assert.deepEqual(keeps(P.calcMonth(c, kerryMay({ amount: 1560, counted: true }), MAY)), [1248.33, 2280.67]);
});

test('money styles: pooling (counted flows on; left over goes up) and board (a set amount: no change)', () => {
  // Gemma (weekly) pools into Joint, where Craig is paid.
  const pool = household({ people: [{ id: 'gemma', name: 'Gemma', payAccount: 'gemma', pattern: { every: 7, each: 320 } }, { id: 'craig', name: 'Craig', payAccount: 'joint', usualPay: 1450 }],
    accounts: [acc('gemma', "Gemma's account", { leftoverTo: 'joint' }), acc('joint', 'Joint account')], bills: bills([['Rent', 950], ['Energy', 170]], 'joint'), payday: { day: 18 } });
  const m = extra => ({ '2027-01': Object.assign({ pay: { gemma: 1600, craig: 1450 } }, extra ? { extra: { gemma: extra } } : {}) });
  const aside = P.calcMonth(pool, m({ amount: 320 }), '2027-01'), counted = P.calcMonth(pool, m({ amount: 320, counted: true }), '2027-01');
  assert.equal(P.r2(aside.steps[0].amt), 1280, 'the move of what\'s left leaves the extra in Gemma\'s account');
  assert.equal(P.r2(counted.steps[0].amt), 1600);
  assert.equal(P.r2(counted.flt - aside.flt), 320, 'left over goes up when counted');
  // Kerry pays board (a set amount into Dan's account): the same either way.
  const board = household({ people: [{ id: 'dan', name: 'Dan', payAccount: 'dan', usualPay: 2480 }, { id: 'kerry', name: 'Kerry', payAccount: 'kerry', boarder: true, pattern: { every: 28, each: 1560 } }],
    accounts: [acc('dan', "Dan's account", { funding: { people: ['dan', 'kerry'], rule: 'set', set: { kerry: { amount: 400 } } } }), acc('kerry', "Kerry's account")],
    bills: bills([['Rent', 1200]], 'dan'), payday: { day: 'last' } });
  const b1 = P.calcMonth(board, kerryMay({ amount: 1560 }), MAY), b2 = P.calcMonth(board, kerryMay({ amount: 1560, counted: true }), MAY);
  assert.deepEqual(shares(b1), { kerry: 400 }); assert.deepEqual(shares(b2), { kerry: 400 });
  assert.equal(P.r2(b1.flt), P.r2(b2.flt), 'her board is the household\'s; the rest is her own money');
});

test('a dated change to a pattern leaves earlier months exactly as they were', () => {
  // Hannah and Marc, in proportion to pay; Marc goes weekly from February 2027 (the app opens on February).
  const c = household({ payday: { day: 'last' }, people: [{ id: 'h', name: 'Hannah', payAccount: 'H', usualPay: 2050 }, { id: 'm', name: 'Marc', payAccount: 'M', usualPay: 2300 }],
    accounts: [acc('H', "Hannah's account"), acc('M', "Marc's account"), acc('J', 'Joint account', { funding: { people: ['h', 'm'], rule: 'pay' } })],
    bills: bills([['Mortgage', 1150], ['Council Tax', 170, CT], ['Energy', 160], ['Water', 45], ['Broadband', 35], ['Insurance', 40], ['Car loan', 300]], 'J'),
    budgets: [{ id: 'g1', name: 'Food', amount: 450, account: 'J' }] });
  const months = {}; for (let i = 0; i < 6; i++) months[P.shiftMonth('2026-08', i)] = { pay: { h: 2050, m: 2300 }, done: { 'c:h>J': true } };
  months['2026-12'] = { done: { 'c:m>J': true } }; // a ticked month with Marc's pay untyped
  const fig = r => Object.assign(view(r), { flt: r.flt, contribs: r.contribs.map(x => x.people.map(q => [q.p.id, q.amt, q.share])) });
  const keys = Object.keys(months).sort(), before = keys.map(k => fig(P.calcMonth(c, months, k)));
  assert.ok(P.hasHistory(months, '2027-02'));
  const after = clone(c), marc = after.people[1], snap = P.personSnap(marc);
  marc.pattern = { every: 7, each: 540 }; marc.usualPay = P.usualMonthly(marc);
  assert.equal(P.datePersonEdit(marc, snap, '2027-02'), true);
  const n = P.normCfg(after);
  assert.deepEqual(keys.map(k => fig(P.calcMonth(n, months, k))), before, 'every earlier month identical');
  assert.deepEqual(keys.map(k => P.cfgFor(n, k).people[1].usualPay), keys.map(() => 2300));
  assert.deepEqual(P.planPay(n, months, '2026-12').m, { kind: 'month', arrived: 2300, setAside: 0, used: 2300, typed: false, n: null, each: null, from: '2026-11' });
  // From February: four weeks of £540, and his weight is £2,340 a month.
  assert.equal(P.planPay(n, months, '2027-02').m.used, 2160);
  const feb = P.calcMonth(n, months, '2027-02'), w = P.cfgFor(n, '2027-02').people[1];
  assert.equal(w.usualPay, 2340); assert.deepEqual(w.pattern, { every: 7, each: 540 });
  assert.equal(feb.contribs[0].rule, 'pay');
});

test('standingOrders: the design\'s figures (Jordan £171.50 and £15.00 a week; Priya £991.00 and Kerry £839.33 every four weeks)', () => {
  const j = P.standingOrders(jordan(), {}, '2026-11');
  assert.deepEqual(j, { jordan: { orders: [
    { step: 't:cur>bills', kind: 'topup', to: 'bills', name: 'Bills account', amount: 171.5, word: 'week' },
    { step: 's:s1', kind: 'save', to: null, name: 'Savings', amount: 15, word: 'week' }], moveTo: null } });
  // Priya: February and March need only £863.00, so the largest month (£991.00) is the figure; it varies, so four-weekly
  // pay gets one. Her savings transfer is the same every month: no order.
  assert.deepEqual(P.standingOrders(priya(), {}, '2026-11'), { priya: { orders: [{ step: 't:cur>bills', kind: 'topup', to: 'bills', name: 'Bills account', amount: 991, word: 'four weeks' }], moveTo: null } });
  // Kerry's share varies (Council Tax): £839.33. Dan is paid monthly: no entry.
  assert.deepEqual(P.standingOrders(danKerry(), {}, '2026-11'), { kerry: { orders: [{ step: 'c:kerry>joint', kind: 'contribute', to: 'joint', name: 'Joint account', amount: 839.33, word: 'four weeks' }], moveTo: null } });
  // Rounded up to the penny: Marc's £1,252.62 a month ÷ 4 = £313.155 → £313.16.
  const marc = household({ people: [{ id: 'm', name: 'Marc', payAccount: 'M', pattern: { every: 7, each: 540 } }], accounts: [acc('M', 'M'), acc('B', 'Bills', { leftoverTo: 'M' })], bills: bills([['Rent', 1252.62]], 'B') });
  assert.equal(P.standingOrders(marc, {}, '2026-11').m.orders[0].amount, 313.16);
  // Every two weeks: half, always.
  const lewis = household({ people: [{ id: 'l', name: 'Lewis', payAccount: 'L', pattern: { every: 14, each: 1020 } }, { id: 'a', name: 'Amira', payAccount: 'A', pattern: { every: 14, each: 880 } }],
    accounts: [acc('L', "Lewis's account"), acc('A', "Amira's account"), acc('J', 'Joint account', { funding: { people: ['l', 'a'], rule: 'equal' } })],
    bills: bills([['Rent', 950], ['Council Tax', 152, CT], ['Energy', 140], ['Water', 38], ['Broadband', 30], ['Car finance', 210], ['Car insurance', 70]], 'J'),
    budgets: [{ id: 'g1', name: 'Food', amount: 480, account: 'J' }] });
  const la = P.standingOrders(lewis, {}, '2026-11');
  assert.deepEqual([la.l.orders.map(o => [o.amount, o.word]), la.a.orders.map(o => [o.amount, o.word])], [[[517.5, 'two weeks']], [[517.5, 'two weeks']]]);
});

test('standingOrders: four-weekly only when the amount varies; never a move (moveTo names where it goes); not from a shared account', () => {
  // Four-weekly with the same top-up every month: no order, and no moveTo either (there's a transfer, just no figure).
  const flat = household({ people: [{ id: 'p', name: 'Pat', payAccount: 'C', pattern: { every: 28, each: 1500 } }], accounts: [acc('C', 'Current'), acc('B', 'Bills', { leftoverTo: 'C' })], bills: bills([['Rent', 700]], 'B') });
  assert.deepEqual(P.standingOrders(flat, {}, '2026-11'), { p: { orders: [], moveTo: null } });
  // A one-off in a later month makes it vary: an order for the largest.
  const months = { '2027-03': { oneOffs: [{ id: 'o', kind: 'out', name: 'Boiler', amount: 300, account: 'B' }] } };
  assert.deepEqual(P.standingOrders(flat, months, '2026-11').p.orders.map(o => o.amount), [1000]);
  assert.deepEqual(P.standingOrders(flat, months, '2027-04').p.orders, [], 'the one-off has passed');
  // Gemma pools: her account only moves what's left on to Joint. No order; moveTo Joint (Settings › People says why).
  const pool = household({ people: [{ id: 'gemma', name: 'Gemma', payAccount: 'gemma', pattern: { every: 7, each: 320 } }, { id: 'craig', name: 'Craig', payAccount: 'joint', usualPay: 1450 }],
    accounts: [acc('gemma', "Gemma's account", { leftoverTo: 'joint' }), acc('joint', 'Joint account')], bills: bills([['Rent', 950]], 'joint') });
  assert.deepEqual(P.standingOrders(pool, {}, '2026-11'), { gemma: { orders: [], moveTo: 'joint' } });
  // An account that keeps what's left and pays nothing out: nothing at all.
  const alone = household({ people: [{ id: 'p', name: 'Pat', payAccount: 'C', pattern: { every: 7, each: 400 } }], accounts: [acc('C', 'Current')], bills: bills([['Rent', 700]], 'C') });
  assert.deepEqual(P.standingOrders(alone, {}, '2026-11'), { p: { orders: [], moveTo: null } });
  // Two people paid into the same account: not only theirs, so no figure.
  const both = household({ people: [{ id: 'a', name: 'A', payAccount: 'C', pattern: { every: 7, each: 400 } }, { id: 'b', name: 'B', payAccount: 'C', usualPay: 1000 }],
    accounts: [acc('C', 'Current'), acc('B', 'Bills', { leftoverTo: 'C' })], savings: [{ id: 's', name: 'Savings', amount: 50, fromAccount: 'C' }], bills: bills([['Rent', 700]], 'B') });
  assert.deepEqual(P.standingOrders(both, {}, '2026-11'), { a: { orders: [], moveTo: null } });
  // Nobody on a pattern: an empty object.
  assert.deepEqual(P.standingOrders(sampleUpgraded(false).c, {}, '2026-11'), {});
});

test('standingOrdersNotice: first month on the pattern (or the household\'s first), and when a figure goes up; worked out, never stored', () => {
  const c = jordan(), months = { '2026-11': { pay: { jordan: 1851 }, done: { 't:cur>bills': true } } };
  const first = P.standingOrdersNotice(c, {}, '2026-11', 'jordan');
  assert.equal(first.kind, 'first'); assert.deepEqual(first.orders.map(o => o.amount), [171.5, 15]);
  assert.equal(P.standingOrdersNotice(c, months, '2026-12', 'jordan'), null, 'the second month: nothing new');
  // A boiler in Bills in November 2027 (the month that comes into the 12) raises the figure from December.
  const up = clone(months); up['2027-11'] = { oneOffs: [{ id: 'o', kind: 'out', name: 'Boiler', amount: 120, account: 'bills' }] };
  assert.equal(P.standingOrdersNotice(c, up, '2026-11', 'jordan').kind, 'first');
  const n = P.standingOrdersNotice(c, up, '2026-12', 'jordan');
  assert.deepEqual([n.kind, n.step, n.to, n.name, n.amount, n.was, n.word, n.ups.length], ['up', 't:cur>bills', 'bills', 'Bills account', 201.5, 171.5, 'week', 1]);
  assert.deepEqual(up, (() => { const x = clone(months); x['2027-11'] = { oneOffs: [{ id: 'o', kind: 'out', name: 'Boiler', amount: 120, account: 'bills' }] }; return x; })(), 'nothing stored');
  // The first month on a pattern after being paid monthly (personAt at k − 1 had none), even with history.
  const m = jordan(); m.people[0].was = [{ until: '2026-11', usualPay: 1800 }];
  assert.equal(P.standingOrdersNotice(m, months, '2026-12', 'jordan').kind, 'first');
  // A change of interval counts as a first month too (the orders are a different size each time).
  const f = jordan(); f.people[0].was = [{ until: '2026-11', usualPay: 1820, pattern: { every: 14, each: 840 } }];
  assert.equal(P.standingOrdersNotice(P.normCfg(f), months, '2026-12', 'jordan').kind, 'first');
  // No orders, no notice; someone paid monthly, no notice.
  assert.equal(P.standingOrdersNotice(danKerry(), {}, '2026-11', 'dan'), null);
  assert.equal(P.standingOrdersNotice(danKerry(), {}, '2026-11', 'kerry').kind, 'first');
});

test('setupSettings: a pattern from setup\'s answers (every 7, 14 or 28), with the pay typed as pay each time', () => {
  const s = pay => ({ people: [{ id: 'p0', name: 'Jordan', pay, payAccount: 'a1', every: 7 }], income: [], payday: { day: 'last', weekend: true }, skip: {}, shape: 'other', style: null, pool: 'other',
    ans: { fun: null, funAmt: {}, rule: null, set: {}, two: 'no', payer: null, gets: {}, getsAmt: {}, board: {}, boardAmt: {} }, accounts: [{ id: 'a1', name: 'Current account', colour: 'blue', leftoverTo: null, role: 'main' }], bills: {}, budgets: [], savings: [] });
  const O = { schema: 5, version: '2.16', today: '2026-10-05' };
  assert.deepEqual(P.setupSettings(s('420'), null, O).cfg.people, [{ id: 'p0', name: 'Jordan', payAccount: 'a1', usualPay: 1820, pattern: { every: 7, each: 420 } }]);
  for (const [every, want] of [['14', { every: 14, each: 420 }], [28, { every: 28, each: 420 }]]) { const x = s('420'); x.people[0].every = every; assert.deepEqual(P.setupSettings(x, null, O).cfg.people[0].pattern, want); }
  // Missing or anything else is monthly, exactly as before; so is no pay.
  const plain = s('420'); delete plain.people[0].every;
  const want = JSON.stringify(P.setupSettings(plain, null, O).cfg);
  assert.deepEqual(JSON.parse(want).people, [{ id: 'p0', name: 'Jordan', payAccount: 'a1', usualPay: 420 }]);
  for (const other of [undefined, null, '', 30, 'week', 0, 1]) { const x = s('420'); x.people[0].every = other; assert.equal(JSON.stringify(P.setupSettings(x, null, O).cfg), want, String(other)); }
  assert.deepEqual(P.setupSettings(s(''), null, O).cfg.people, [{ id: 'p0', name: 'Jordan', payAccount: 'a1', usualPay: 0 }]);
});

// E17: setup's answers for one person, "My pay account, a bills account and a spending account".
function splitSetup(people, every) {
  const s = { people: people.map(([name, pay], i) => ({ id: 'p' + i, name, pay, payAccount: null, every })), income: [], payday: { day: 'last', weekend: true }, skip: {}, shape: null, style: people.length > 1 ? 'pool' : null, pool: 'split',
    ans: { fun: null, funAmt: {}, rule: null, set: {}, two: 'no', payer: null, gets: {}, getsAmt: {}, board: {}, boardAmt: {} }, accounts: [], bills: {}, budgets: [], savings: [] };
  const sh = P.setupShape('split', P.setupPeople(s), P.setupOpts(s));
  s.shape = 'split'; s.accounts = sh.accounts; s.people.forEach(p => { p.payAccount = sh.payAccount[p.id]; });
  const bills = s.accounts.find(a => a.role === 'bills' || a.name === 'Joint bills');
  s.bills[bills.id] = [{ id: 'b1', name: 'Rent', amount: '560', freq: 'monthly' }, { id: 'b2', name: 'Phone', amount: '22', freq: 'monthly' }, { id: 'b3', name: 'Bus pass', amount: '104', freq: 'monthly' }];
  s.savings = [{ id: 's1', name: 'Savings', amount: '60', account: s.accounts[s.accounts.length - 1].id }];
  return s;
}
const O17 = { schema: 5, version: '2.16', today: '2026-10-05' };
const chain = c => c.accounts.map(a => a.name + '→' + ((c.accounts.find(x => x.id === a.leftoverTo) || {}).name || 'keeps'));

test('E17: one person on a pattern with a pay, bills and spending account: Bills → Pay account → Spending, topped up by exactly its bills', () => {
  const c = P.setupSettings(splitSetup([['Jordan', '420']], 7), null, O17).cfg;
  assert.deepEqual(chain(c), ['Bills account→Pay account', 'Pay account→Spending account', 'Spending account→keeps']);
  assert.equal(c.accounts.find(a => a.id === c.people[0].payAccount).name, 'Pay account', 'pay still arrives in the pay account');
  const r = P.calcMonth(c, {}, '2026-11'), pay = c.people[0].payAccount, bills = c.accounts[0].id, spend = c.accounts[2].id;
  const sav = c.savings[0].id;
  assert.deepEqual(r.steps.map(s => [s.id, s.kind, P.r2(s.amt)]), [['t:' + pay + '>' + spend, 'move', 1680 - 686], ['t:' + pay + '>' + bills, 'topup', 686], ['s:' + sav, 'save', 60]], 'exactly its bills; what\'s left moves on');
  assert.equal(r.steps[2].from, spend, 'savings come from Spending, as before');
  assert.equal(P.r2(r.flt), 1680 - 686 - 60);
  assert.deepEqual(r.floats.map(f => f.id), [spend], 'left over stays in Spending');
  // A standing order of the bills ÷ 4, rounded up: £686.00 ÷ 4 = £171.50.
  assert.deepEqual(P.standingOrders(c, {}, '2026-11')[c.people[0].id].orders.map(o => [o.name, o.amount, o.word]), [['Bills account', 171.5, 'week']]);
  // Every four weeks: the bills don't vary, so no figure (the monthly transfer is the figure), but the layout is the same.
  const f = P.setupSettings(splitSetup([['Priya', '1000']], 28), null, O17).cfg;
  assert.deepEqual(chain(f), ['Bills account→Pay account', 'Pay account→Spending account', 'Spending account→keeps']);
  // Rounded up: bills of £687.01 a month every two weeks → £343.51.
  const odd = splitSetup([['Lee', '900']], 14); odd.bills[Object.keys(odd.bills)[0]][2].amount = '105.01';
  const oc = P.setupSettings(odd, null, O17).cfg;
  assert.equal(P.standingOrders(oc, {}, '2026-11')[oc.people[0].id].orders[0].amount, 343.51);
});

test('E17: monthly pay, and every couple\'s picture, are saved exactly as before', () => {
  const strip = c => JSON.stringify(c, (k, v) => (k === 'since' ? undefined : v));
  // One person paid monthly: Pay → Bills → Spending, the same as with no answer at all.
  const mon = P.setupSettings(splitSetup([['Alex', '2500']], undefined), null, O17).cfg;
  assert.deepEqual(chain(mon), ['Pay account→Bills account', 'Bills account→Spending account', 'Spending account→keeps']);
  const s2 = splitSetup([['Alex', '2500']], undefined); s2.people.forEach(p => { delete p.every; });
  const ids = s => s.accounts.map(a => a.id);
  const a = splitSetup([['Alex', '2500']], undefined), b = splitSetup([['Alex', '2500']], 'monthly');
  // The account ids differ between runs (random), so compare with each run's own ids swapped for their roles.
  const norm = (s, c) => { let t = strip(c); ids(s).forEach((id, i) => { t = t.split(id).join('ACC' + i); }); return t; };
  assert.equal(norm(b, P.setupSettings(b, null, O17).cfg), norm(a, P.setupSettings(a, null, O17).cfg));
  assert.equal(norm(s2, P.setupSettings(s2, null, O17).cfg), norm(a, P.setupSettings(a, null, O17).cfg));
  // A couple pooling into joint bills and joint spending, one of them weekly: the same layout as a monthly couple.
  const cw = P.setupSettings(splitSetup([['Lewis', '1020'], ['Amira', '2000']], 7), null, O17).cfg;
  const cm = P.setupSettings(splitSetup([['Lewis', '1020'], ['Amira', '2000']], undefined), null, O17).cfg;
  assert.deepEqual(chain(cw), chain(cm));
  assert.deepEqual(chain(cm), ["Lewis's account→Joint bills", "Amira's account→Joint bills", 'Joint bills→Joint spending', 'Joint spending→keeps']);
  // A single person with "own" (Bills → Spending, pay into Bills) keeps it: there's no pay account to top up from.
  const own = splitSetup([['Jordan', '420']], 7);
  const sh = P.setupShape('own', P.setupPeople(own), P.setupOpts(own)); own.shape = 'own'; own.accounts = sh.accounts; own.people[0].payAccount = sh.payAccount.p0; own.bills = {};
  assert.deepEqual(chain(P.setupSettings(own, null, O17).cfg), ['Bills account→Spending account', 'Spending account→keeps']);
  // Accounts changed by hand in setup: left as they are.
  const hand = splitSetup([['Jordan', '420']], 7); hand.accounts[1].leftoverTo = null; hand.accounts[2].leftoverTo = hand.accounts[1].id;
  const hc = P.setupSettings(hand, null, O17).cfg;
  assert.ok(!hc.accounts.some(a => a.name === 'Bills account' && (hc.accounts.find(x => x.id === a.leftoverTo) || {}).name === 'Pay account'));
});

test('setupChecklist and the words: "Set your transfer day" with a pattern, "Set your payday" without', () => {
  assert.equal(P.setupChecklist(jordan({ payday: {} }), {})[1].label, 'Set your transfer day');
  assert.equal(P.setupChecklist(sampleUpgraded(false).c, {})[1].label, 'Set your payday');
});

test('Analysis: typical income uses pay over a year ÷ 12 for someone on a pattern; short and the history use the pay used', () => {
  const c = danKerry(), months = { '2026-12': { pay: { dan: 2480, kerry: 3120 } }, ...kerryMay({ amount: 1560 }) };
  const inc = P.avgIncome(c, months, '2027-06');
  assert.deepEqual(inc.people.map(p => [p.name, P.r2(p.avg), p.months, p.pattern || null]), [['Dan', 2480, 2, null], ['Kerry', 1690, 0, { every: 28, each: 1560 }]], 'not the mean of £3,120 months');
  assert.equal(P.r2(inc.total), 4170);
  // payHistory: the pay used, with what was set aside.
  const h = P.payHistory(c, months, '2027-06');
  assert.deepEqual(h.map(x => [x.k, x.pay.kerry, x.setAside.kerry, x.setAside.dan]), [['2026-12', 3120, 0, 0], [MAY, 1560, 1560, 0]]);
  assert.equal('setAside' in P.payHistory(sampleUpgraded(true).c, sampleUpgraded(true).m, '2026-11')[0], false, 'monthly households as before');
  // The average month's short accounts plan on pay each time × n (an extra payday is set aside): Kerry's £1,000 every four
  // weeks is short by £50 of a £1,050 half-share every month, though £1,083.33 a month over a year would cover it.
  const tight = danKerry({ people: ['dan', 'kerry'], rule: 'equal' }, { people: [{ id: 'dan', name: 'Dan', payAccount: 'dan', usualPay: 2480 }, { id: 'kerry', name: 'Kerry', payAccount: 'kerry', pattern: { every: 28, each: 1000 } }],
    bills: bills([['Mortgage', 2100]], 'joint'), budgets: [] });
  const pic = P.monthlyPicture(tight, {}, '2026-11');
  assert.equal(P.r2(pic.incomeDetail.people[1].avg), 1083.33);
  assert.deepEqual(pic.shortBy.map(s => [s.id, P.r2(s.amount)]), [['kerry', 50]]);
  // Month by month (projectedFloat) and predictedFloat through planPay.
  const j = jordan(), pf = P.projectedFloat(j, {}, '2026-11');
  assert.ok(pf.every(x => P.r2(x.float) === P.r2(1680 - 686 - 60)), 'every month on 4 × £420');
  assert.equal(P.r2(P.predictedFloat(j, { '2026-11': { pay: { jordan: 1851 } } }, '2026-11')), 934);
});

test('notifications: "Transfer day tomorrow" and "… is for …" with a pattern; monthly households exactly as before', () => {
  const j = jordan(), today = '2026-10-20';
  const pay = P.notificationSchedule(j, {}, today).filter(x => x.key.startsWith('pay:'));
  assert.deepEqual(pay[0], { date: '2026-10-29', key: 'pay:2026-10-30@2026-10-29', title: 'Transfer day tomorrow', text: 'Fri 30 Oct 2026 is for November 2026. 2 transfers to make.',
    late: { title: 'Transfer day today', text: 'Today, Fri 30 Oct 2026, is for November 2026. 2 transfers to make.' } });
  const m = clone(j); delete m.people[0].pattern; m.people[0].usualPay = 1820;
  assert.deepEqual(P.notificationSchedule(m, {}, today).filter(x => x.key.startsWith('pay:'))[0], { date: '2026-10-29', key: 'pay:2026-10-30@2026-10-29', title: 'Payday tomorrow', text: 'Fri 30 Oct 2026 pays for November 2026. 2 transfers to make.',
    late: { title: 'Payday today', text: 'Today, Fri 30 Oct 2026, pays for November 2026. 2 transfers to make.' } });
  // With amounts, the left over comes from planPay (4 × £420).
  const a = clone(j); a.notify = { on: true, time: '09:00', amounts: true };
  assert.match(P.notificationSchedule(a, {}, today)[0].text, /Expected left over £934\.00\.$/);
});

test('exports with a pattern: the pay cell, extra paydays, the CSV\'s set aside and pay used, the preface, "Transfer day"', () => {
  const c = danKerry(), months = { '2026-12': { pay: { dan: 2480, kerry: 1560 } }, ...kerryMay({ amount: 1560 }), '2027-06': { pay: { dan: 2480, kerry: 3120 }, extra: { kerry: { amount: 1560, counted: true } } } };
  const md = P.exportMarkdown(c, months, '2027-06-10', { version: '2.16' });
  assert.ok(md.includes('Transfer day: the last working day of the month.'));
  assert.ok(md.includes('more than one bank account: each transfer day it works out which transfers to make'));
  assert.ok(!md.includes('each payday it works out'));
  assert.ok(md.includes("| Kerry | Kerry's account | £1,560.00 every four weeks (about £1,690.00 a month) |"));
  assert.ok(md.includes('| Dan | Dan\'s account | 2480.00 |'), 'monthly pay as before');
  assert.ok(md.includes('Kerry extra payday: £1,560.00 set aside'));
  assert.ok(md.includes('Kerry extra payday: £1,560.00 counted'));
  assert.ok(md.includes('- **Pay that isn\'t monthly**: Some people here are paid weekly, every two weeks or every four weeks. The household makes its transfers once a month, on its transfer day. Such a person\'s saved pay for a month is what arrived since the transfer day before. When one more payday than usual arrived, the household can set it aside: the pay used is the saved pay less what was set aside. In proportion to pay uses each person\'s pay over a year ÷ 12.'));
  assert.ok(md.includes('Kerry 1690.00 (pay over a year ÷ 12: 1560.00 every four weeks)'));
  const csv = P.exportCsv(c, months, '2027-06-10').months.text.split('\r\n');
  assert.equal(csv[0], 'month,Dan_pay,Kerry_pay,Kerry_set_aside,Kerry_pay_used,float,transfers_ticked,transfers_total,one_off_payments,one_off_income,Dan_pays_in,Kerry_pays_in');
  assert.ok(csv[2].startsWith('2027-05,2480.00,3120.00,1560.00,1560.00,'));
  assert.ok(csv[3].startsWith('2027-06,2480.00,3120.00,0.00,3120.00,'));
  const row = P.savedMonthRow(c, months, MAY);
  assert.deepEqual([row.used, row.setAside, row.extra], [[2480, 1560], [0, 1560], [{ person: 'kerry', amount: 1560, counted: false }]]);
  const r = P.calcMonth(c, months, MAY);
  assert.equal(P.transfersText(c, MAY, r, {}, {}).split('\n')[0], 'Dovetail transfers for May 2027 (transfer day Fri 30 Apr 2027)');
});

test('households without a pattern: settings, 24 months of transfers, exports and notifications exactly as 2.15 gave', () => {
  const { c, m } = sample36({ forced: true });
  // payFor as 2.15 had it: typed, else the latest earlier typed month, else usual pay as they were.
  const old = (k) => { const d = m[k] || {}, out = {}; c.people.forEach(p => {
    if (d.pay && d.pay[p.id] != null) { out[p.id] = P.num(d.pay[p.id]); return; }
    const keys = Object.keys(m).filter(x => x < k && P.validMonth(x) && P.payIsTyped(m[x], p.id)).sort();
    out[p.id] = keys.length ? P.num(m[keys[keys.length - 1]].pay[p.id]) : P.num(P.personAt(c, p.id, k).usualPay); }); return out; };
  for (let i = 0; i < 24; i++) {
    const k = P.shiftMonth('2025-06', i);
    assert.deepEqual(P.payFor(c, m, k), old(k), k);
    assert.deepEqual(P.calcMonth(c, m, k), P.calc(P.cfgFor(c, k, P.monthOneOffs(m, k)), P.mNum(k), old(k), P.monthOneOffs(m, k)), k);
    c.people.forEach(p => assert.equal(P.planPay(c, m, k)[p.id].kind, 'month'));
  }
  assert.equal(JSON.stringify(P.normCfg(c)), JSON.stringify(c));
  assert.deepEqual(P.standingOrders(c, m, '2026-11'), {});
  const md = P.exportMarkdown(c, m, '2026-11-10', { version: '2.16' });
  assert.ok(md.includes('\nPayday: ')); assert.ok(md.includes('more than one bank account: each payday it works out')); assert.ok(!md.includes('Transfer day')); assert.ok(!md.includes('Extra paydays')); assert.ok(!md.includes('isn\'t monthly'));
  assert.ok(!P.exportCsv(c, m, '2026-11-10').months.text.includes('_set_aside'));
  assert.ok(!('used' in P.savedMonthRow(c, m, '2026-10')));
  const withDay = Object.assign(clone(c), { payday: { day: 28, weekend: true } });
  const notes = P.notificationSchedule(withDay, m, '2026-10-20').filter(x => x.key.startsWith('pay:'));
  assert.ok(notes.length > 2 && notes.every(x => x.title === 'Payday tomorrow' && / pays for /.test(x.text) && x.late.title === 'Payday today'));
});
