// The household simulation's own oracle for the rough figure (2.14), tested on its own, so it is right whatever the app does:
// the worked example in docs/onboarding.md 5.2, the edges of the rule, where a figure is allowed (5.9) and what the
// generator makes. Nothing here loads calc.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeHousehold, withFigures, figureExtras, billsOut, fullListed, figureAllowed, oracle, inFigure } from '../sim/gen.mjs';

const ACC = 'Current account';
/** One person, one joint "Current account": Joint's example from 5.2. */
function example(figure = 1500) {
  return { seed: 0, people: [{ name: 'Alex', pay: 3000 }], multi: false, style: null, pool: 'joint', rule: null, two: false, payer: null, set: null, fun: null, gets: {}, board: {}, income: [], payday: null, budgets: [], savings: [],
    bills: [
      { id: 'b0', name: 'Mortgage', amount: 900, freq: 'monthly', owner: 'shared' },
      { id: 'b1', name: 'Council Tax', amount: 160, freq: 'some', picked: [4, 5, 6, 7, 8, 9, 10, 11, 12, 1], owner: 'shared' },
      { id: 'b2', name: 'Energy', amount: 120, freq: 'monthly', owner: 'shared' },
      { id: 'b3', name: 'Car insurance', amount: 480, freq: 'yearly', month: 6, owner: 'shared' }],
    figures: [{ id: 'e0', owner: 'shared', amount: figure }], hidden: [] };
}

test('the worked example in 5.2', () => {
  const h = example();
  assert.equal(figureExtras(h)[0].amount, 320);
  assert.equal(billsOut(h, ACC, 5), 1500);   // May: 320 not listed yet + 1,180 listed bills due
  assert.equal(billsOut(h, ACC, 6), 1980);   // June: + car insurance 480
  assert.equal(billsOut(h, ACC, 2), 1340);   // February: no Council Tax
  h.bills.push({ id: 'b4', name: 'Broadband', amount: 35, freq: 'monthly', owner: 'shared' });
  assert.equal(figureExtras(h)[0].amount, 285);
  assert.equal(billsOut(h, ACC, 5), 1500);   // unchanged after listing broadband
  assert.equal(billsOut(h, ACC, 6), 1980);
  assert.equal(billsOut(h, ACC, 2), 1340);
});

test('the oracle counts the not-listed amount as money out, like a bill', () => {
  const h = example();
  [[5, 1500], [6, 1980], [2, 1340]].forEach(([m, out]) => assert.equal(Math.round(oracle(h, m).total * 100) / 100, 3000 - out, 'month ' + m));
  const g = example(); g.figures = []; g.hidden = [];
  // Without the figure the same household's listed bills alone: 1,180 in May.
  assert.equal(oracle(g, 5).total, 3000 - 1180);
});

test('the edges of the rule', () => {
  // Never below 0: listed monthly bills over the figure leave nothing not listed, and the bills are just the listed ones.
  const over = example(1000); assert.equal(figureExtras(over)[0].amount, 0); assert.equal(billsOut(over, ACC, 5), 1180);
  // Exactly equal to the listed bills: nothing not listed yet.
  const eq = example(1180); assert.equal(figureExtras(eq)[0].amount, 0); assert.equal(billsOut(eq, ACC, 6), 1660);
  // Bills of 6 months or fewer are never inside the figure: a listed 6-month bill doesn't lower not listed yet; a 7-month bill does.
  const six = example(); six.bills.push({ id: 'b5', name: 'Boiler cover', amount: 50, freq: 'some', picked: [1, 2, 3, 4, 5, 6], owner: 'shared' });
  assert.equal(figureExtras(six)[0].amount, 320); assert.equal(billsOut(six, ACC, 5), 320 + 900 + 160 + 120 + 50);   // the 6-month bill is on top
  assert.equal(inFigure(six.bills[4]), false);
  const seven = example(); seven.bills.push({ id: 'b5', name: 'Seasonal', amount: 50, freq: 'some', picked: [1, 2, 3, 4, 5, 6, 7], owner: 'shared' });
  assert.equal(inFigure(seven.bills[4]), true); assert.equal(figureExtras(seven)[0].amount, 270);
  // Counted whether or not due: in August (a month the 7-month bill isn't due) not listed yet is still 270.
  assert.equal(billsOut(seven, ACC, 8), 270 + 900 + 160 + 120);
  assert.equal(billsOut(seven, ACC, 3), 270 + 900 + 120 + 50);   // Council Tax isn't taken in March
  // Twelve months picked is every month.
  const twelve = example(); twelve.bills.push({ id: 'b5', name: 'Twelve', amount: 20, freq: 'some', picked: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], owner: 'shared' });
  assert.equal(figureExtras(twelve)[0].amount, 300);
  // Two figures on one account add up.
  const two = example(); two.figures = [{ id: 'e0', owner: 'shared', amount: 1000 }, { id: 'e1', owner: 'shared', amount: 500 }];
  assert.equal(figureExtras(two)[0].amount, 320);
  // No figure: nothing changes.
  const none = example(); none.figures = []; assert.deepEqual(figureExtras(none), []); assert.equal(billsOut(none, ACC, 5), 1180);
});

test('where a figure is allowed (5.9)', () => {
  const base = { multi: true, style: 'contribute', rule: 'equal', payer: null, board: {}, ticked: {}, people: [{ name: 'Alex' }, { name: 'Sam' }, { name: 'Kit' }] };
  assert.equal(figureAllowed(base, "Alex's account"), true);
  assert.equal(figureAllowed(base, 'Joint account'), true);
  assert.equal(figureAllowed({ ...base, rule: 'sameLeft' }, "Alex's account"), false);
  assert.equal(figureAllowed({ ...base, rule: 'afterOwn' }, "Sam's account"), false);
  assert.equal(figureAllowed({ ...base, rule: 'sameLeft' }, 'Joint account'), true);
  assert.equal(figureAllowed({ ...base, rule: 'pay' }, "Alex's account"), true);
  assert.equal(figureAllowed({ ...base, board: { 2: 300 } }, "Kit's account"), false);
  assert.equal(figureAllowed({ ...base, ticked: { 1: true } }, "Sam's account"), false);
  // The person paying the bills: their own account is the shared one, so a figure is fine.
  assert.equal(figureAllowed({ ...base, style: 'housekeeping', rule: 'sameLeft', payer: 1 }, "Sam's account"), true);
  assert.equal(figureAllowed({ ...base, style: 'housekeeping', rule: 'sameLeft', payer: 1 }, "Alex's account"), false);
  assert.equal(figureAllowed({ ...base, style: 'separate', rule: null }, "Alex's account"), true);
});

test('the generator: makeHousehold is untouched, figures follow the brief', () => {
  let extras = 0, anchors = 0, figures = 0, noneBlank = 0, partial = 0, forbidden = 0;
  for (let s = 1; s <= 3000; s++) {
    const h = makeHousehold(s), before = JSON.stringify(h);
    assert.equal(h.figures, undefined);
    assert.equal(withFigures(h, s, 'listed'), h);
    for (const kind of ['figure', 'anchor']) {
      const x = withFigures(h, s, kind);
      assert.equal(JSON.stringify(h), before, 'withFigures changes the household it is given');
      // Everything the household really pays is either listed or hidden, once; the generator adds some bills of 6 to 8 months.
      const ids = x.bills.concat(x.hidden).map(b => b.id); assert.equal(new Set(ids).size, ids.length);
      h.bills.forEach((b, i) => assert.ok(ids.includes('b' + i)));
      assert.deepEqual(fullListed(x).bills.slice(0, h.bills.length).map(b => b.name), h.bills.map(b => b.name), 'the full list starts with the original, in order');
      fullListed(x).bills.slice(h.bills.length).forEach(b => { extras++; assert.ok(b.freq === 'some' && b.picked.length >= 6 && b.picked.length <= 8 && new Set(b.picked).size === b.picked.length); });
      x.figures.forEach(f => { if (!figureAllowed(x, figureExtras(x).find(e => e.owner === f.owner).account)) forbidden++; });
      x.truth.forEach(t => {
        if (!(t.figure > 0)) { noneBlank++; return; }
        if (kind === 'anchor') { anchors++; assert.ok(t.figure >= t.true7 - 0.005, 'an anchor is at least the true total'); }
        else { figures++; assert.ok(t.figure >= t.true7 * 0.7 - 5.005 && t.figure <= t.true7 * 1.3 + 5.005, `figure ${t.figure} of true ${t.true7}`); }
        if (t.listed < t.bills) partial++;
      });
    }
  }
  assert.equal(forbidden, 0);
  assert.ok(extras > 500 && anchors > 500 && figures > 500 && noneBlank > 100 && partial > 300, JSON.stringify({ extras, anchors, figures, noneBlank, partial }));
});
