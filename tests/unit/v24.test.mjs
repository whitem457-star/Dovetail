// Unit tests for the 2.4 pure functions: a budget month's window (payday to the day before the next payday) and the
// reminders that fall in it. Expected dates are worked out by hand: 28 Nov 2026 is a Saturday, 1 Nov 2026 a Sunday.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, household } from './load.mjs';

const PAY28 = { day: 28, weekend: true };

test('month window: payday 28th, Friday before a weekend', () => {
  assert.deepEqual(P.monthWindow(PAY28, '2026-11'), { from: '2026-10-28', to: '2026-11-26' }, 'December is funded on Fri 27 Nov');
  assert.deepEqual(P.monthWindow(PAY28, '2026-12'), { from: '2026-11-27', to: '2026-12-27' }, 'January is funded on Mon 28 Dec');
  // The windows tile: each starts the day after the last one ends.
  let k = '2026-01';
  for (let i = 0; i < 24; i++, k = P.shiftMonth(k, 1)) {
    const a = P.monthWindow(PAY28, k), b = P.monthWindow(PAY28, P.shiftMonth(k, 1));
    assert.equal(P.addDays(a.to, 1), b.from, k);
    assert.equal(a.from, P.paydayFor(PAY28, k), k + ' starts on its payday');
  }
});

test('month windows tile for every payday setting, without gaps or overlaps', () => {
  const days = [...Array.from({ length: 31 }, (_, i) => i + 1), 'last'];
  for (const day of days) for (const weekend of [true, false]) {
    const pc = { day, weekend };
    let k = '2027-11';
    for (let i = 0; i < 28; i++, k = P.shiftMonth(k, 1)) {   // Nov 2027 to Feb 2030, so leap-year February 2028 is in
      const a = P.monthWindow(pc, k), b = P.monthWindow(pc, P.shiftMonth(k, 1));
      assert.equal(P.addDays(a.to, 1), b.from, JSON.stringify(pc) + ' ' + k);
      assert.ok(a.from <= a.to && P.daysUntil(a.to, a.from) >= 26 && P.daysUntil(a.to, a.from) <= 33, JSON.stringify(pc) + ' ' + k + ' ' + JSON.stringify(a));
    }
  }
});

test('month window: payday early in the month pays for that month', () => {
  assert.deepEqual(P.monthWindow({ day: 1, weekend: true }, '2026-11'), { from: '2026-10-30', to: '2026-11-30' }, '1 Nov is a Sunday, so Fri 30 Oct; 1 Dec is a Tuesday');
  assert.deepEqual(P.monthWindow({ day: 1, weekend: false }, '2026-11'), { from: '2026-11-01', to: '2026-11-30' });
});

test('month window: no payday set means the calendar month', () => {
  assert.deepEqual(P.monthWindow({}, '2026-11'), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(P.monthWindow(undefined, '2027-02'), { from: '2027-02-01', to: '2027-02-28' });
  assert.deepEqual(P.monthWindow({ day: null }, '2028-02'), { from: '2028-02-01', to: '2028-02-29' });
});

test('reminders in a month: boundaries, passed renewals and one-offs by their date', () => {
  const c = household({ payday: PAY28,
    accounts: [{ id: 'a', name: 'Current', colour: 'blue', leftoverTo: null }],
    bills: [
      { id: 'b1', name: 'Car insurance', amount: 400, account: 'a', months: [1], renews: '2026-10-28', lead: 30 },
      { id: 'b2', name: 'Broadband', amount: 30, account: 'a', months: [], renews: '2026-11-26', lead: 30 },
      { id: 'b3', name: 'Phone', amount: 20, account: 'a', months: [], renews: '2026-11-27', lead: 30 },
      { id: 'b4', name: 'Gym', amount: 25, account: 'a', months: [], renews: '2026-10-27', lead: 30 },
      { id: 'b5', name: 'Water', amount: 40, account: 'a', months: [] }],
    reminders: [{ id: 'r1', name: 'MOT', date: '2026-11-10', lead: 14, yearly: true }] });
  const months = {
    '2026-11': { month: '2026-11', pay: {}, done: {}, oneOffs: [
      { id: 'o1', kind: 'out', name: 'Boiler service', amount: 90, account: 'a', date: '2026-11-02' },
      { id: 'o2', kind: 'out', name: 'Party', amount: 60, account: 'a', date: '2026-11-30' },
      { id: 'o3', kind: 'out', name: 'Undated', amount: 10, account: 'a' }] },
    '2026-12': { month: '2026-12', pay: {}, done: {}, oneOffs: [
      { id: 'o4', kind: 'in', name: 'Refund', amount: 15, account: 'a', date: '2026-11-05' }] } };
  const today = '2026-11-20';
  const nov = P.remindersInMonth(c, months, '2026-11', today);
  assert.deepEqual(nov.map(i => [i.name, i.date]), [
    ['Car insurance', '2026-10-28'], ['Boiler service', '2026-11-02'], ['Refund', '2026-11-05'], ['MOT', '2026-11-10'], ['Broadband', '2026-11-26']],
    'both ends of the window are in; 27 Oct and 27 Nov are not; undated one-offs never appear');
  const by = n => nov.find(i => i.name === n);
  assert.equal(by('Car insurance').status, 'over', 'a renewal that has passed still shows in its month, as overdue');
  assert.equal(by('Car insurance').days, -23);
  assert.equal(by('Broadband').status, 'soon');
  assert.equal(by('Broadband').days, 6);
  assert.equal(by('Boiler service').days, -18, 'a past one-off is listed in its month');
  assert.equal(by('Boiler service').status, 'past', '…as passed, not overdue: it has simply happened');
  assert.equal(by('Refund').month, '2026-12', 'a one-off saved under December but dated in November lands in November, keeping its own month');
  assert.ok(!P.reminderList(c, months, today).some(i => i.name === 'Boiler service'), 'reminderList (Needs attention, notifications) still leaves past one-offs out');
  const dec = P.remindersInMonth(c, months, '2026-12', today);
  assert.deepEqual(dec.map(i => i.name), ['Phone', 'Party'], 'Phone (27 Nov) and Party (30 Nov, saved under November) are December money');
  const calNov = P.remindersInMonth(household(Object.assign({}, c, { payday: {} })), months, '2026-11', today);
  assert.deepEqual(calNov.map(i => i.name), ['Boiler service', 'Refund', 'MOT', 'Broadband', 'Phone', 'Party'], 'no payday: the calendar month');
});
