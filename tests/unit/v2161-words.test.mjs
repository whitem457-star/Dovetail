// Unit tests for 2.16.1's words (payperiods.md 13.1, H4): the exports say that a payday or transfer day on a weekend
// or an England and Wales bank holiday moves to the working day before. Made-up households only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, sampleUpgraded } from './load.mjs';

test('paydayText: a numbered day says the working day before a weekend or an England and Wales bank holiday', () => {
  assert.equal(P.paydayText({ day: 28, weekend: true }), '28th of the month (the working day before if it falls on a weekend or an England and Wales bank holiday)');
  assert.equal(P.paydayText({ day: 25 }), '25th of the month (the working day before if it falls on a weekend or an England and Wales bank holiday)', 'weekend not stored: ticked');
  assert.equal(P.paydayText({ day: 25, weekend: false }), '25th of the month', 'box unticked: the day never moves, so nothing is added');
  assert.equal(P.paydayText({ day: 'last' }), 'the last working day of the month');
  assert.equal(P.paydayText({}), 'not set');
});

test('the Markdown export carries the phrase on its Payday line', () => {
  const { c, m } = sampleUpgraded();
  c.payday = { day: 28, weekend: true };
  const md = P.exportMarkdown(c, m, '2026-12-15', { version: '2.16.1' });
  assert.ok(md.includes('\nPayday: 28th of the month (the working day before if it falls on a weekend or an England and Wales bank holiday).\n'), md.slice(0, 600));
  assert.ok(!md.includes('Friday before'));
});
