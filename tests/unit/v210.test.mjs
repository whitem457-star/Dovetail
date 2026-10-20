// Unit tests for 2.10: the update file sent with Share on the Pay tab (updateFileName, updateText) and how the other
// phone tells it's from the same household (sameHousehold).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, sampleUpgraded, household, clone } from './load.mjs';

test('updateFileName: says what it is and when, with no spaces', () => {
  assert.equal(P.updateFileName('2026-10-20'), 'Dovetail-update-20-Oct-2026.json');
  assert.equal(P.updateFileName('2027-01-05'), 'Dovetail-update-5-Jan-2027.json');
});

test('updateText: the transfers, then what to do with the file', () => {
  assert.equal(P.updateText('Dovetail transfers for November 2026\n1. ☐ A → B  £10.00'),
    'Dovetail transfers for November 2026\n1. ☐ A → B  £10.00\n\nTap the file to update Dovetail on your phone.');
});

test('sameHousehold: the same household, including after accounts are added or removed on one phone', () => {
  const { c } = sampleUpgraded(false), d = clone(c);
  assert.equal(P.sameHousehold(c, d), true);
  d.accounts = d.accounts.slice(1).concat([{ id: 'new1', name: 'New', colour: 'blue', leftoverTo: null }]);
  assert.equal(P.sameHousehold(c, d), true);
  assert.equal(P.sameHousehold(d, c), true);
});

test('sameHousehold: a household set up separately, or nothing to compare, is not the same', () => {
  const { c } = sampleUpgraded(false);
  const other = household({ people: [{ id: 'pat', name: 'Pat', payAccount: 'm', usualPay: 1500 }], accounts: [{ id: 'm', name: 'Main', colour: 'blue', leftoverTo: null }] });
  assert.equal(P.sameHousehold(c, other), false);
  assert.equal(P.sameHousehold(c, household({})), false);
  assert.equal(P.sameHousehold(household({}), household({})), false);
  assert.equal(P.sameHousehold(null, c), false);
  assert.equal(P.sameHousehold(c, { accounts: [null, {}, { id: '' }] }), false);
  // Same names but different ids: still not the same household.
  assert.equal(P.sameHousehold(c, Object.assign(clone(c), { accounts: c.accounts.map(a => Object.assign({}, a, { id: a.id + 'x' })) })), false);
});

test('changedSince: a month saved on this phone after the file was saved', () => {
  const m = { '2026-10': { updatedAt: '2026-10-20T18:00:00.000Z' }, '2026-11': { updatedAt: '2026-10-20T18:10:00.000Z' } };
  assert.equal(P.changedSince(m, '2026-10-20T18:05:00.000Z'), true);
  assert.equal(P.changedSince(m, '2026-10-20T18:10:00.000Z'), false, 'the same moment is not newer');
  assert.equal(P.changedSince(m, '2026-10-21T09:00:00.000Z'), false);
});

test('changedSince: nothing to compare counts as not newer', () => {
  assert.equal(P.changedSince({}, '2026-10-20T18:05:00.000Z'), false);
  assert.equal(P.changedSince({ '2026-11': { pay: {} } }, '2026-10-20T18:05:00.000Z'), false);
  assert.equal(P.changedSince({ '2026-11': { updatedAt: 'nonsense' } }, '2026-10-20T18:05:00.000Z'), false);
  assert.equal(P.changedSince({ '2026-11': { updatedAt: '2026-10-21T09:00:00.000Z' } }, undefined), false);
  assert.equal(P.changedSince(null, '2026-10-20T18:05:00.000Z'), false);
  assert.equal(P.changedSince({ '2026-11': null }, '2026-10-20T18:05:00.000Z'), false);
});

test('pickerYears: last year to two years ahead, back to the earliest saved month, always the month on screen', () => {
  assert.deepEqual(P.pickerYears([], '2026-11', '2026-11'), [2025, 2026, 2027, 2028]);
  assert.deepEqual(P.pickerYears(['2023-04', '2026-10', 'junk'], '2026-11', '2026-11'), [2023, 2024, 2025, 2026, 2027, 2028]);
  assert.deepEqual(P.pickerYears([], '2026-11', '2031-02'), [2025, 2026, 2027, 2028, 2029, 2030, 2031]);
  assert.deepEqual(P.pickerYears([], '2026-11', '2020-01')[0], 2020);
  assert.equal(P.pickerYears(['1900-01'], '2026-11', '2026-11')[0], 1996, 'no more than 30 years back from a stray saved month');
});
