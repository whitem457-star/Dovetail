// Unit tests for 2.16.1: England and Wales bank holidays by rule, used by monthly paydays and the transfer day
// (docs/payperiods.md 13.1, H1 to H3). Dates are checked against gov.uk's list (tests/fixtures/govuk-bank-holidays-ew-
// 2024-2028.json) and by hand: 25 Dec 2026 is a Friday, 28 Dec 2026 a Monday, 6 Apr 2026 Easter Monday. Made-up
// households only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { P, household, sampleUpgraded, sample36 } from './load.mjs';

const GOVUK = JSON.parse(fs.readFileSync(new globalThis.URL('../fixtures/govuk-bank-holidays-ew-2024-2028.json', import.meta.url), 'utf8'));
const everyDay = (from, to) => { const out = []; for (let s = from; s <= to; s = P.addDays(s, 1)) out.push(s); return out; };

test('easterSunday: the Gregorian computus, against known Easter Sundays', () => {
  const known = { 1900: '1900-04-15', 1943: '1943-04-25', 2000: '2000-04-23', 2008: '2008-03-23', 2011: '2011-04-24', 2019: '2019-04-21',
    2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2038: '2038-04-25', 2285: '2285-03-22' };
  for (const [y, d] of Object.entries(known)) assert.equal(P.easterSunday(Number(y)), d, y);
  for (let y = 1900; y <= 2999; y++) {
    const e = P.easterSunday(y);
    assert.equal(P.dow(e), 0, y + ' is a Sunday'); assert.ok(e >= y + '-03-22' && e <= y + '-04-25', y + ' ' + e);
  }
});

test('bankHolidaysEW: gov.uk\'s England and Wales dates for 2024 to 2028, exactly', () => {
  assert.deepEqual(GOVUK.years, [2024, 2028]);
  const gov = GOVUK.dates.map(d => d.date).sort();
  for (let y = 2024; y <= 2028; y++) assert.deepEqual(P.bankHolidaysEW(y), gov.filter(d => d.startsWith(y + '-')), String(y));
  const set = new Set(gov);
  for (const d of everyDay('2024-01-01', '2028-12-31')) {
    assert.equal(P.isBankHolidayEW(d), set.has(d), d);
    const w = P.dow(d);
    assert.equal(P.isWorkingDay(d), w !== 0 && w !== 6 && !set.has(d), d);
  }
});

test('bankHolidaysEW: 2019 to 2023, with the one-off holidays the rule doesn\'t know recorded as known', () => {
  // gov.uk's lists. The rule can't know one-off holidays, so these differences are expected.
  const gov = {
    2019: ['2019-01-01', '2019-04-19', '2019-04-22', '2019-05-06', '2019-05-27', '2019-08-26', '2019-12-25', '2019-12-26'],
    2020: ['2020-01-01', '2020-04-10', '2020-04-13', '2020-05-08', '2020-05-25', '2020-08-31', '2020-12-25', '2020-12-28'],
    2021: ['2021-01-01', '2021-04-02', '2021-04-05', '2021-05-03', '2021-05-31', '2021-08-30', '2021-12-27', '2021-12-28'],
    2022: ['2022-01-03', '2022-04-15', '2022-04-18', '2022-05-02', '2022-06-02', '2022-06-03', '2022-08-29', '2022-09-19', '2022-12-26', '2022-12-27'],
    2023: ['2023-01-02', '2023-04-07', '2023-04-10', '2023-05-01', '2023-05-08', '2023-05-29', '2023-08-28', '2023-12-25', '2023-12-26'] };
  const known = {
    2019: { missing: [], extra: [] },
    2020: { missing: ['2020-05-08'], extra: ['2020-05-04'] },                           // VE Day: the early May holiday moved to Friday 8 May
    2021: { missing: [], extra: [] },
    2022: { missing: ['2022-06-02', '2022-06-03', '2022-09-19'], extra: ['2022-05-30'] }, // the Jubilee (spring holiday moved, an extra day) and the state funeral
    2023: { missing: ['2023-05-08'], extra: [] } };                                       // the coronation
  for (let y = 2019; y <= 2023; y++) {
    const rule = P.bankHolidaysEW(y);
    assert.deepEqual(gov[y].filter(d => !rule.includes(d)), known[y].missing, y + ': gov.uk dates the rule doesn\'t know');
    assert.deepEqual(rule.filter(d => !gov[y].includes(d)), known[y].extra, y + ': rule dates gov.uk didn\'t have');
  }
});

test('bankHolidaysEW: substitute days for New Year and Christmas', () => {
  const xmas = y => P.bankHolidaysEW(y).filter(d => d.slice(5, 7) === '12');
  const ny = y => P.bankHolidaysEW(y)[0];
  assert.equal(P.dow('2021-12-25'), 6); assert.deepEqual(xmas(2021), ['2021-12-27', '2021-12-28'], 'Christmas on a Saturday: Monday 27 and Tuesday 28');
  assert.equal(P.dow('2027-12-25'), 6); assert.deepEqual(xmas(2027), ['2027-12-27', '2027-12-28']);
  assert.equal(P.dow('2022-12-25'), 0); assert.deepEqual(xmas(2022), ['2022-12-26', '2022-12-27'], 'Christmas on a Sunday: Boxing Day Monday 26, Christmas Tuesday 27');
  assert.equal(P.dow('2033-12-25'), 0); assert.deepEqual(xmas(2033), ['2033-12-26', '2033-12-27']);
  assert.equal(P.dow('2026-12-26'), 6); assert.deepEqual(xmas(2026), ['2026-12-25', '2026-12-28'], 'Boxing Day on a Saturday: Monday 28');
  assert.deepEqual(xmas(2025), ['2025-12-25', '2025-12-26'], 'weekdays: no substitute');
  assert.equal(P.dow('2022-01-01'), 6); assert.equal(ny(2022), '2022-01-03', 'New Year on a Saturday: Monday 3');
  assert.equal(P.dow('2028-01-01'), 6); assert.equal(ny(2028), '2028-01-03');
  assert.equal(P.dow('2023-01-01'), 0); assert.equal(ny(2023), '2023-01-02', 'New Year on a Sunday: Monday 2');
  assert.equal(P.dow('2034-01-01'), 0); assert.equal(ny(2034), '2034-01-02');
  assert.equal(P.isBankHolidayEW('2022-01-01'), false, 'the day itself isn\'t the holiday once it\'s moved');
  // Every year in range: 8 holidays, sorted, all weekdays.
  for (let y = 1900; y <= 2999; y++) {
    const h = P.bankHolidaysEW(y);
    assert.equal(h.length, 8, String(y)); assert.deepEqual(h, h.slice().sort(), String(y));
    for (const d of h) { assert.ok(d.startsWith(y + '-'), d); assert.ok(P.dow(d) >= 1 && P.dow(d) <= 5, d); }
  }
});

test('bankHolidaysEW: [] outside 1900 to 2999 or for a year that isn\'t a whole number; a copy each time', () => {
  for (const y of [1899, 3000, 2026.5, NaN, null, undefined, -1, Infinity]) assert.deepEqual(P.bankHolidaysEW(y), [], String(y));
  assert.equal(P.bankHolidaysEW(1900).length, 8); assert.equal(P.bankHolidaysEW(2999).length, 8);
  const a = P.bankHolidaysEW(2026); a.push('2026-07-04'); a[0] = 'x';
  assert.deepEqual(P.bankHolidaysEW(2026), ['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28']);
  assert.equal(P.isBankHolidayEW('2026-07-04'), false);
  for (const s of ['', null, undefined, '2026-12', 'Christmas', '1899-12-25']) { assert.equal(P.isBankHolidayEW(s), false, String(s)); }
  assert.equal(P.isWorkingDay('nonsense'), false);
});

test('workingDayOnOrBefore: a working day stays; otherwise back across weekends, holidays, month and year ends', () => {
  assert.equal(P.workingDayOnOrBefore('2026-10-22'), '2026-10-22', 'a Thursday');
  assert.equal(P.workingDayOnOrBefore('2026-10-25'), '2026-10-23', 'a Sunday: the Friday');
  assert.equal(P.workingDayOnOrBefore('2024-04-01'), '2024-03-28', 'Easter Monday: Thu 28 Mar, not Good Friday');
  assert.equal(P.workingDayOnOrBefore('2028-01-03'), '2027-12-31', 'the New Year substitute: Fri 31 Dec 2027, from the earlier year');
  assert.equal(P.workingDayOnOrBefore('2027-12-28'), '2027-12-24', 'Christmas on a Saturday: four days back');
  assert.equal(P.workingDayOnOrBefore('2026-12-28'), '2026-12-24');
  assert.equal(P.workingDayOnOrBefore('2026-05-25'), '2026-05-22', 'spring bank holiday');
  assert.equal(P.workingDayOnOrBefore('2026-08-31'), '2026-08-28', 'summer bank holiday');
  // Never more than 4 days back from 1900 to 2999 (every holiday and weekend), and the result is always a working day.
  for (let y = 1900; y <= 2999; y++) for (const d of P.bankHolidaysEW(y)) for (let i = 0; i < 3; i++) {
    const s = P.addDays(d, i), w = P.workingDayOnOrBefore(s);
    assert.ok(P.isWorkingDay(w) && w <= s && P.daysUntil(s, w) <= 4, s + ' → ' + w);
  }
});

test('paydayIn: bank holidays move a payday that moves for weekends', () => {
  assert.equal(P.paydayIn({ day: 'last', weekend: true }, 2026, 8), '2026-08-28', 'Mon 31 Aug is the summer holiday');
  assert.equal(P.paydayIn({ day: 'last', weekend: false }, 2026, 8), '2026-08-28', '"last" always moves, whatever weekend says');
  assert.equal(P.paydayIn({ day: 25, weekend: true }, 2026, 12), '2026-12-24', 'Christmas Day');
  assert.equal(P.paydayIn({ day: 28, weekend: true }, 2026, 12), '2026-12-24', 'the Boxing Day substitute');
  assert.equal(P.paydayIn({ day: 28 }, 2026, 12), '2026-12-24', 'weekend unset counts as ticked');
  assert.equal(P.paydayIn({ day: 6, weekend: true }, 2026, 4), '2026-04-02', 'Easter Monday, then Good Friday');
  assert.equal(P.paydayIn({ day: 1, weekend: true }, 2027, 1), '2026-12-31', 'New Year\'s Day: into the year before');
  assert.equal(P.paydayIn({ day: 31, weekend: true }, 2026, 4), '2026-04-30', 'capped at the month\'s length first');
  // Unticked: never moves, for weekends or holidays.
  assert.equal(P.paydayIn({ day: 25, weekend: false }, 2026, 12), '2026-12-25');
  assert.equal(P.paydayIn({ day: 28, weekend: false }, 2026, 12), '2026-12-28');
  assert.equal(P.paydayIn({ day: 6, weekend: false }, 2026, 4), '2026-04-06');
  assert.equal(P.paydayIn({ day: 31, weekend: false }, 2026, 4), '2026-04-30');
  assert.equal(P.paydayIn({}, 2026, 12), null); assert.equal(P.paydayIn({ day: '' }, 2026, 12), null);
  // Away from holidays, exactly the weekend rule as before.
  assert.equal(P.paydayIn({ day: 28, weekend: true }, 2026, 11), '2026-11-27', 'Sat 28 Nov: Friday');
  assert.equal(P.paydayIn({ day: 1, weekend: true }, 2026, 11), '2026-10-30', 'Sun 1 Nov: Fri 30 Oct');
});

test('paydayFor and the tax year: a payday on the 6th in April 2026 now counts in 2025–26', () => {
  const pc = { day: 6, weekend: true };
  assert.equal(P.paydayFor(pc, '2026-04'), '2026-04-02');
  assert.equal(P.taxYear(pc, '2026-04').label, '2025–26');
  assert.equal(P.inTaxYear(pc, '2026-04', P.tyObj(2025)), true); assert.equal(P.inTaxYear(pc, '2026-04', P.tyObj(2026)), false);
  assert.equal(P.taxYear(pc, '2026-05').label, '2026–27', 'May 2026 is unchanged');
  assert.equal(P.taxYear(pc, '2027-04').label, '2027–28', 'Tue 6 Apr 2027 isn\'t a holiday');
  assert.equal(P.taxYear({ day: 6, weekend: false }, '2026-04').label, '2026–27', 'unticked: the payday stays on the 6th');
});

test('nextPayday and defaultMonth around Christmas 2026', () => {
  const p28 = { day: 28, weekend: true };
  assert.deepEqual(P.nextPayday(p28, '2026-12-15'), { date: '2026-12-24', month: '2027-01' });
  assert.equal(P.defaultMonth(p28, '2026-12-15'), '2027-01', '9 days before Thu 24 Dec: January (2.16 opened on December)');
  assert.equal(P.defaultMonth(p28, '2026-12-14'), '2027-01', '10 days before');
  assert.equal(P.defaultMonth(p28, '2026-12-13'), '2026-12', '11 days before');
  assert.deepEqual(P.nextPayday(p28, '2026-12-24'), { date: '2026-12-24', month: '2027-01' }, 'payday is today');
  assert.deepEqual(P.nextPayday(p28, '2026-12-25'), { date: '2027-01-28', month: '2027-02' });
  assert.equal(P.defaultMonth(p28, '2026-12-25'), '2027-01');
  assert.deepEqual(P.nextPayday({ day: 25, weekend: true }, '2026-12-24'), { date: '2026-12-24', month: '2027-01' });
  assert.deepEqual(P.nextPayday({ day: 25, weekend: false }, '2026-12-24'), { date: '2026-12-25', month: '2027-01' });
  assert.deepEqual(P.nextPayday({ day: 1, weekend: true }, '2026-12-31'), { date: '2026-12-31', month: '2027-01' }, 'New Year\'s Day: paid on 31 Dec, for January');
  assert.equal(P.defaultMonth({ day: 1, weekend: true }, '2026-12-31'), '2027-01');
  assert.deepEqual(P.nextPayday({ day: 'last', weekend: true }, '2026-12-29'), { date: '2026-12-31', month: '2027-01' });
});

test('calcMonth is the same under every payday setting (H3: only dates move)', () => {
  const acc = (id, name, o = {}) => Object.assign({ id, name, colour: 'blue', leftoverTo: null }, o);
  const couple = household({
    people: [{ id: 'a', name: 'Ash', payAccount: 'a', usualPay: 2300 }, { id: 'b', name: 'Bo', payAccount: 'b', usualPay: 0, pattern: { every: 14, each: 820 } }],
    accounts: [acc('a', "Ash's account"), acc('b', "Bo's account"), acc('j', 'Joint account', { funding: { people: ['a', 'b'], rule: 'pay' } })],
    bills: [{ id: 'm', name: 'Rent', amount: 1150, account: 'j', months: [] }, { id: 'ct', name: 'Council Tax', amount: 160, account: 'j', months: [4, 5, 6, 7, 8, 9, 10, 11, 12, 1] }],
    budgets: [{ id: 'g', name: 'Food', amount: 450, account: 'j' }], savings: [{ id: 's', name: 'Savings', amount: 100, fromAccount: 'a' }] });
  const single = household({ people: [{ id: 'p', name: 'Pat', payAccount: 'cur', usualPay: 0, pattern: { every: 7, each: 410 } }],
    accounts: [acc('cur', 'Current account'), acc('bills', 'Bills account', { leftoverTo: 'cur' })],
    bills: [{ id: 'r', name: 'Room rent', amount: 560, account: 'bills', months: [] }, { id: 'ph', name: 'Phone', amount: 20, account: 'bills', months: [] }] });
  const s36 = sample36(), forced = sample36({ forced: true }), alexSam = sampleUpgraded(true);
  const homes = [['Alex and Sam', alexSam.c, alexSam.m], ['36 months', s36.c, s36.m], ['36 months, short', forced.c, forced.m],
    ['couple', couple, { '2026-12': { pay: { a: 2300, b: 1640 }, done: {} } }], ['single', single, {}]];
  const settings = [{}];
  for (const day of [1, 6, 15, 25, 28, 31, 'last']) for (const weekend of [true, false]) settings.push({ day, weekend });
  for (const [name, c0, m] of homes) {
    let k = '2025-01';
    for (let i = 0; i < 24; i++, k = P.shiftMonth(k, 1)) {
      const base = JSON.stringify(P.calcMonth(Object.assign({}, c0, { payday: {} }), m, k));
      for (const pc of settings) assert.equal(JSON.stringify(P.calcMonth(Object.assign({}, c0, { payday: pc }), m, k)), base, name + ' ' + k + ' ' + JSON.stringify(pc));
    }
  }
});
