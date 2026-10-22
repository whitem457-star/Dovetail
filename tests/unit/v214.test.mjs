// Unit tests for 2.14: a rough figure for an account's bills (docs/onboarding.md 5.2): the data (estimates, dated like
// the other items), the rule in calc, the helpers the screens use, setup, the checklist, Analysis, the exports and backup
// files. A household without a rough figure must get exactly what 2.13 gave: the made-up household's 36 months against
// 2.13's own output (tests/fixtures/sample36-2.13-calc.json: snap214.mjs's figures from 2.13's code, as a SHA-256 for each
// month). Made-up households only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { P, household, sample36, clone } from './load.mjs';
import { snapshot, digest } from './snap214.mjs';

const acc = (id, o = {}) => Object.assign({ id, name: id, colour: 'blue', leftoverTo: null }, o);
const bill = (id, amount, account, o = {}) => Object.assign({ id, name: id, amount, account, months: [] }, o);
const est = (id, amount, account, o = {}) => Object.assign({ id, account, amount }, o);
const CT = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1]; // Council Tax, April to January
const YEAR = Array.from({ length: 12 }, (x, i) => P.shiftMonth('2026-04', i));

// The design's worked example: Joint's figure is £1,500; listed so far a mortgage £900 (every month), Council Tax £160
// (April to January), energy £120 (every month) and car insurance £480 (June only). Alex is paid into Joint, which sends
// what's left to Spending.
const example = (o = {}) => household(Object.assign({ payday: { day: 28 }, people: [{ id: 'a', name: 'Alex', payAccount: 'J', usualPay: 3000 }],
  accounts: [acc('J', { name: 'Joint', leftoverTo: 'S' }), acc('S', { name: 'Spending' })],
  bills: [bill('mortgage', 900, 'J'), bill('ct', 160, 'J', { months: CT }), bill('energy', 120, 'J'), bill('car', 480, 'J', { months: [6] })],
  budgets: [{ id: 'food', name: 'Food', amount: 400, account: 'S' }], estimates: [est('e1', 1500, 'J')] }, o));
// Alex and Sam each pay half of a joint account with the same bills and figure.
const couple = (rule = 'equal', o = {}) => household(Object.assign({ payday: { day: 28 },
  people: [{ id: 'a', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 's', name: 'Sam', payAccount: 'B', usualPay: 2000 }],
  accounts: [acc('A', { name: "Alex's account" }), acc('B', { name: "Sam's account" }), acc('J', { name: 'Joint', funding: { people: ['a', 's'], rule } })],
  bills: [bill('mortgage', 900, 'J'), bill('ct', 160, 'J', { months: CT }), bill('energy', 120, 'J'), bill('car', 480, 'J', { months: [6] })],
  estimates: [est('e1', 1500, 'J')] }, o));
const run = (c, k, months = {}) => P.calcMonth(c, months, k);
// The transfers and what's left, to the penny as on screen (a figure's sums can differ in the last binary place).
const pence = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'number' ? P.r2(v) : v));
const moves = r => pence({ steps: r.steps, floats: r.floats, cant: r.cant });

test('the worked example: not listed yet is £320 every month; May £1,500, June £1,980, February £1,340', () => {
  const c = example(), want = { '2026-05': [320, 1180, 1500], '2026-06': [320, 1660, 1980], '2027-02': [320, 1020, 1340] };
  for (const k of Object.keys(want)) {
    const r = run(c, k), j = r.A.J, listedDue = P.r2(j.bills.reduce((t, b) => t + b.amount, 0));
    assert.deepEqual([j.unlisted, listedDue, P.r2(j.out)], want[k], k);
    assert.equal(j.figure, 1500);
    assert.equal(r.t.unlisted, 320); assert.equal(r.unlisted, 320);
    assert.equal(P.r2(r.billsExSav), want[k][2], 'Bills on This month in detail include what\'s not listed yet');
    assert.ok(r.ok, 'the figures reconcile: left over = in − out');
    assert.equal(P.r2(r.steps.find(s => s.id === 't:J>S').amt), P.r2(3000 - want[k][2]));
  }
  // Listing broadband £35: £285 not listed yet, May still £1,500, and no transfer moves in any month.
  const b = example(); b.bills.push(bill('broadband', 35, 'J'));
  assert.deepEqual([run(b, '2026-05').A.J.unlisted, P.r2(run(b, '2026-05').A.J.out)], [285, 1500]);
  for (const k of YEAR) assert.deepEqual(moves(run(b, k)), moves(run(c, k)), k);
  assert.deepEqual(P.estimateParts(b, 'J'), { has: true, figure: 1500, listed: 1215, unlisted: 285, over: 0, passed: false });
});

test('bills that come in 6 or fewer months always count on top; a 7-to-11-month bill lowers the months it skips', () => {
  const c = example();
  // Council Tax (10 months) is inside the figure: February and March are £160 lighter than May.
  assert.equal(P.r2(run(c, '2027-03').A.J.out), 1340);
  // A quarterly water bill (4 months) adds its amount in its months, and nothing otherwise.
  const w = example(); w.bills.push(bill('water', 90, 'J', { months: [1, 4, 7, 10] }));
  for (const k of YEAR) assert.equal((P.r2(run(w, k).A.J.out - run(c, k).A.J.out) + 0), [1, 4, 7, 10].includes(P.mNum(k)) ? 90 : 0, k);
  // inFigure: an empty list or all 12 months is every month; 7 months is in; 6 is out.
  assert.deepEqual([[], [1, 2, 3, 4, 5, 6, 7], [1, 2, 3, 4, 5, 6], Array.from({ length: 12 }, (x, i) => i + 1)].map(m => P.inFigure({ months: m })), [true, true, false, true]);
});

// A small seeded random generator, so the property tests are the same every run.
function rng(seed) { let x = seed >>> 0 || 1; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function randomHousehold(R) {
  const rules = ['equal', 'pay', 'afterOwn', 'sameLeft'], pooled = R() < 0.4, months = () => { const n = 1 + Math.floor(R() * 11), all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; for (let i = 11; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; } return all.slice(0, n).sort((a, b) => a - b); };
  const bills = []; for (let i = 0; i < Math.floor(R() * 7); i++) bills.push(bill('b' + i, Math.round(R() * 60000) / 100, 'J', { months: R() < 0.5 ? [] : months() }));
  const base = pooled ? example({ bills, estimates: [] }) : couple(rules[Math.floor(R() * rules.length)], { bills, estimates: [] });
  if (!pooled) base.people[1].usualPay = Math.round(R() * 300000) / 100;
  base.estimates = [est('e1', Math.round((300 + R() * 3000) * 100) / 100, 'J')];
  return P.normCfg(base);
}

test('properties over 300 made-up households: listing within the figure moves nothing; past it, exactly the overshoot', () => {
  const R = rng(214);
  for (let h = 0; h < 300; h++) {
    const c = randomHousehold(R), p = P.estimateParts(c, 'J');
    for (const k of YEAR) assert.ok(run(c, k).ok, h + ' ' + k + ' reconciles');
    if (p.unlisted > 0.01) {
      // A monthly bill within what's not listed yet: no transfer, share or left over changes in any month.
      const within = clone(c); within.bills.push(bill('new', Math.max(0.01, Math.floor(p.unlisted * R() * 100) / 100), 'J'));
      for (const k of YEAR) assert.deepEqual(moves(run(within, k)), moves(run(c, k)), h + ' ' + k + ' within');
      // A 7-to-11-month bill within it: the months it's due are as before; the months it skips are lighter by its amount.
      const amt = Math.max(0.01, Math.floor(p.unlisted * R() * 100) / 100), due = [1, 2, 3, 4, 5, 6, 7, 8, 9].slice(0, 7 + Math.floor(R() * 3)), part = clone(c);
      part.bills.push(bill('part', amt, 'J', { months: due }));
      for (const k of YEAR) assert.equal((P.r2(run(part, k).A.J.out - run(c, k).A.J.out) + 0), due.includes(P.mNum(k)) ? 0 : -amt, h + ' ' + k + ' part year');
    }
    // A monthly bill past what's not listed yet raises the account's out by exactly the overshoot, every month.
    const extra = Math.round(R() * 20000) / 100 + 0.01, past = clone(c); past.bills.push(bill('past', P.r2(p.unlisted + extra), 'J'));
    for (const k of YEAR) assert.equal((P.r2(run(past, k).A.J.out - run(c, k).A.J.out) + 0), P.r2(extra), h + ' ' + k + ' past');
    assert.equal(P.estimatePassed(past, 'J'), true); assert.equal(P.estimateJustPassed(c, past, 'J'), !p.passed);
    // Ending the figure from a month (dated): earlier months keep exactly their transfers; from then, none is left.
    const from = YEAR[1 + Math.floor(R() * 10)], ended = P.endEstimates(c, 'J', from, true);
    for (const k of YEAR) if (k < from) assert.deepEqual(moves(run(ended, k)), moves(run(c, k)), h + ' ' + k + ' before the end');
      else assert.equal(run(ended, k).A.J.unlisted, 0, h + ' ' + k + ' after the end');
    // Without the figure, the household is the one that lists its bills.
    const none = clone(c); delete none.estimates;
    for (const k of YEAR) assert.deepEqual(moves(run(ended, k >= from ? k : from)), moves(run(none, k >= from ? k : from)));
  }
});

test('a household without a rough figure gets exactly what 2.13 gave: the made-up household over 36 months', () => {
  const old = JSON.parse(fs.readFileSync(new globalThis.URL('../fixtures/sample36-2.13-calc.json', import.meta.url), 'utf8')), now = snapshot();
  for (const which of ['plain', 'forced']) {
    assert.equal(now[which].byCategory.unlisted, null); delete now[which].byCategory.unlisted;
    for (const k of Object.keys(now[which].months)) {
      const r = now[which].months[k];
      assert.deepEqual([r.t.unlisted, r.picture.unlisted, r.outgoings.unlisted], [0, 0, 0], k);
      delete r.t.unlisted; delete r.picture.unlisted; delete r.outgoings.unlisted;
    }
  }
  assert.equal(Object.keys(old.plain.months).length, 36);
  assert.deepEqual(digest(now), old, 'each month as 2.13 worked it out (snap214.mjs shows a difference in full)');
  const { c } = sample36();
  assert.ok(!('estimates' in c) && !('estimates' in P.cfgFor(c, '2026-01')), 'no estimates list appears');
});

test('normCfg: estimates kept only when they can be used, stored only when there\'s one; sound settings pass through unchanged', () => {
  const c = example(), rep = [];
  assert.equal(JSON.stringify(P.normCfg(c, rep)), JSON.stringify(c), 'a household with a figure');
  assert.deepEqual(rep, []);
  const { c: s } = sample36();
  assert.equal(JSON.stringify(P.normCfg(s)), JSON.stringify(s), 'a household without one');
  const bad = clone(c), r2 = [];
  bad.accounts[0].closedFrom = '2026-09';
  bad.estimates = [est('e1', 1500, 'J'), null, est('', 10, 'J'), est('x', 10, 'nope'), est('y', -1, 'J'), est('z', '12', 'J'), est('w', Infinity, 'J'), est('e1', 9, 'S'), est('ok', 0, 'S')];
  const n = P.normCfg(bad, r2);
  assert.deepEqual(n.estimates, [est('e1', 1500, 'J'), est('ok', 0, 'S')], 'a closed account and £0 are fine');
  assert.deepEqual([...new Set(r2)], ['a rough figure that couldn\'t be read', 'a rough figure that couldn\'t be used']);
  assert.equal(P.reportSentence(r2), 'Some things couldn\'t be used: a rough figure that couldn\'t be read and a rough figure that couldn\'t be used.');
  const empty = P.normCfg(Object.assign(clone(c), { estimates: [] }), []);
  assert.ok(!('estimates' in empty));
  const odd = [], o = P.normCfg(Object.assign(clone(c), { estimates: { J: 1500 } }), odd);
  assert.ok(!('estimates' in o)); assert.deepEqual(odd, ['a rough figure that couldn\'t be read']);
  // Ended ones too; their dated values are checked as other items' are.
  const en = clone(c), r3 = []; en.ended = { estimates: [Object.assign(est('g', 100, 'gone'), { ended: '2026-09' }), Object.assign(est('h', 100, 'J'), { ended: '2026-09', start: 'soon' })] };
  const ne = P.normCfg(en, r3);
  assert.deepEqual(ne.ended, { estimates: [Object.assign(est('h', 100, 'J'), { ended: '2026-09' })] });
  assert.deepEqual(r3, ['a rough figure that couldn\'t be used', 'a rough figure with a bad first month']);
});

test('backup files: a rough figure (live or ended) makes a file version 6 that needs 2.14; 2.13 things alone still need 2.13', () => {
  const at = '2026-10-15T12:00:00.000Z', pooled = example({ estimates: [] });
  delete pooled.estimates;
  assert.equal(P.backupVersionFor(pooled), 5);
  assert.ok(P.backupJson(pooled, {}, null, at).startsWith('{"app":"payday-transfers","version":5,"savedAt":'));
  assert.ok(P.backupJson(example(), {}, null, at).startsWith('{"app":"payday-transfers","version":6,"needs":"2.14","savedAt":'));
  const ended = P.endEstimates(example(), 'J', '2026-11', true);
  assert.ok(!('estimates' in ended) && ended.ended.estimates.length === 1);
  assert.equal(P.backupNeedsFor(ended), '2.14'); assert.equal(P.backupVersionFor(ended), 6);
  const dated = clone(pooled); dated.bills[0].start = '2026-10';
  assert.equal(P.backupNeedsFor(dated), '2.13');
  assert.ok(P.backupJson(dated, {}, null, at).startsWith('{"app":"payday-transfers","version":6,"needs":"2.13",'));
  // A 2.14 page opens it; a 2.13 page names the version it needs.
  assert.equal(P.backupRefusal({ version: 6, needs: '2.14' }, 6, '2.14'), null);
  assert.equal(P.backupRefusal({ version: 6, needs: '2.14' }, 6, '2.13'), '2.14');
  assert.equal(P.backupRefusal({ version: 6, needs: '2.13' }, 6, '2.14'), null);
});

test('dated like other items: a figure from a month, an earlier figure, a change from a month, ended with earlier months kept', () => {
  const later = example({ estimates: [est('e1', 1500, 'J', { start: '2026-07' })] });
  assert.deepEqual(['2026-06', '2026-07'].map(k => run(later, k).A.J.unlisted), [0, 320], 'nothing before it starts');
  const was = example({ estimates: [est('e1', 1500, 'J', { was: [{ until: '2026-06', amount: 1200, account: 'J' }] })] });
  assert.deepEqual(['2026-06', '2026-07'].map(k => run(was, k).A.J.unlisted), [20, 320]);
  // setEstimate dated from August: July keeps £1,500, August has £1,700.
  const up = P.setEstimate(example(), 'J', 1700, '2026-08', true);
  assert.deepEqual(up.estimates, [est('e1', 1700, 'J', { was: [{ until: '2026-07', amount: 1500, account: 'J' }] })]);
  assert.deepEqual(['2026-07', '2026-08'].map(k => P.estimateFor(P.cfgFor(up, k), 'J')), [1500, 1700]);
  // Without history: every month changes; a new figure has no start; 0 ends it.
  assert.deepEqual(P.setEstimate(example(), 'J', 1700, '2026-08', false).estimates, [est('e1', 1700, 'J')]);
  const fresh = P.setEstimate(example({ estimates: [] }), 'S', 250, '2026-08', true);
  assert.equal(fresh.estimates.length, 1); assert.deepEqual([fresh.estimates[0].account, fresh.estimates[0].amount, fresh.estimates[0].start], ['S', 250, '2026-08']);
  assert.ok(!('estimates' in P.setEstimate(example(), 'J', 0, '2026-08', false)) && !('ended' in P.setEstimate(example(), 'J', '', '2026-08', false)));
  // Two on one account: the first takes the figure, the other ends.
  const two = example({ estimates: [est('e1', 1000, 'J'), est('e2', 500, 'J')] });
  assert.equal(P.estimateFor(two, 'J'), 1500);
  const one = P.setEstimate(two, 'J', 1600, '2026-08', true);
  assert.deepEqual([one.estimates.map(e => [e.id, e.amount]), one.ended.estimates.map(e => [e.id, e.ended])], [[['e1', 1600]], [['e2', '2026-08']]]);
  assert.deepEqual(['2026-07', '2026-08'].map(k => P.estimateFor(P.cfgFor(one, k), 'J')), [1500, 1600]);
  // The other dated machinery works on the list as on bills: dateEdit, endItem and unendItem.
  const d = example(), e = d.estimates[0], before = P.itemSnap('estimates', e); e.amount = 1400;
  assert.equal(P.dateEdit('estimates', e, before, '2026-09'), true);
  assert.deepEqual(P.itemAt('estimates', e, '2026-08'), Object.assign({}, e, { amount: 1500 }));
  P.endItem(d, 'estimates', e, '2026-10'); d.estimates = [];
  assert.deepEqual(P.allItems(d, 'estimates').map(x => x.id), ['e1']);
  assert.equal(P.cfgFor(d, '2026-09').estimates[0].amount, 1400); assert.deepEqual(P.cfgFor(d, '2026-10').estimates, []);
  P.unendItem(d, 'estimates', 'e1'); assert.ok(!('ended' in d));
});

test('a change of style moves a figure with the account\'s bills; two figures in one account add up; Undo gives it back', () => {
  const c = example({ estimates: [est('e1', 1500, 'J'), est('e2', 200, 'S')] });
  const next = { accounts: [acc('S', { name: 'Spending' })], pay: { a: 'S' } };
  const d = P.applyChange(c, '2026-09', next, { J: 'S' });
  assert.deepEqual(d.estimates.map(e => [e.id, e.account]), [['e1', 'S'], ['e2', 'S']]);
  assert.deepEqual(d.flows[0].was.items.estimates, { e1: 'J' });
  assert.deepEqual(P.cfgFor(d, '2026-08').estimates.map(e => e.account), ['J', 'S'], 'earlier months keep it in Joint');
  const aug = run(d, '2026-08'), sep = run(d, '2026-09');
  assert.deepEqual([aug.A.J.unlisted, aug.A.S.unlisted], [320, 200]);
  assert.deepEqual([sep.A.S.figure, sep.A.S.unlisted], [1700, 520], 'two figures add up: £1,700 less the £1,180 of 7-plus-month bills');
  assert.ok(sep.ok && aug.ok);
  assert.deepEqual(P.removeLastChange(d), P.normCfg(c));
  // An account the change closes keeps its figure in earlier months (it's used), and the list is optional throughout.
  const plain = example({ estimates: [] }); delete plain.estimates;
  const p2 = P.applyChange(plain, '2026-09', next, { J: 'S' });
  assert.ok(!('estimates' in p2) && !('estimates' in P.cfgFor(p2, '2026-08')));
  assert.deepEqual(P.removeLastChange(p2), P.normCfg(plain));
});

test('where a figure is allowed: not on a boarder\'s own account, nor on own accounts under "after own bills" or "keep the same"', () => {
  for (const rule of ['equal', 'pay', 'set']) assert.deepEqual(['A', 'B', 'J'].map(id => P.estimateBlock(couple(rule), id)), [null, null, null], rule);
  for (const rule of ['afterOwn', 'sameLeft']) {
    assert.deepEqual(['A', 'B', 'J'].map(id => P.estimateBlock(couple(rule), id)), ['share', 'share', null], rule);
    assert.equal(P.estimateAllowed(couple(rule), 'J'), true); assert.equal(P.estimateAllowed(couple(rule), 'A'), false);
  }
  // An own account that passes what's left into Sam's own savings: both are Sam's (ownTop and what passes into it).
  const chain = couple('afterOwn'); chain.accounts.push(acc('SV', { name: "Sam's savings" })); chain.accounts[1].leftoverTo = 'SV';
  assert.deepEqual(['B', 'SV', 'J'].map(id => P.estimateBlock(chain, id)), ['share', 'share', null]);
  // One of us paying the bills: the payer's own account is the one paid into, so a figure there is fine; the other's isn't.
  const hk = household({ people: [{ id: 'a', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 's', name: 'Sam', payAccount: 'B', usualPay: 2000 }],
    accounts: [acc('A', { funding: { people: ['a', 's'], rule: 'afterOwn' } }), acc('B')] });
  assert.deepEqual(['A', 'B'].map(id => P.estimateBlock(hk, id)), [null, 'share']);
  // Board: Kit's own account is outside the household's figures.
  const kit = couple('equal'); kit.people.push({ id: 'k', name: 'Kit', payAccount: 'K', usualPay: 1500, boarder: true }); kit.accounts.push(acc('K'));
  kit.accounts[2].funding = { people: ['a', 's', 'k'], rule: 'equal', set: { k: { amount: 300 } } };
  assert.deepEqual(['A', 'K', 'J'].map(id => P.estimateBlock(kit, id)), [null, 'board', null]);
});

test('helpers for the screens: the parts, past the figure, "There are more", the delete offer', () => {
  assert.deepEqual(P.estimateParts(example({ estimates: [] }), 'J'), { has: false, figure: 0, listed: 0, unlisted: 0, over: 0, passed: false });
  const over = example(); over.bills.push(bill('broadband', 340, 'J'));
  assert.deepEqual(P.estimateParts(over, 'J'), { has: true, figure: 1500, listed: 1520, unlisted: 0, over: 20, passed: true });
  const at = example(); at.bills.push(bill('broadband', 320, 'J'));
  assert.deepEqual([P.estimatePassed(at, 'J'), P.estimateParts(at, 'J').unlisted], [false, 0], 'reaching the figure isn\'t passing it');
  assert.equal(P.estimateJustPassed(at, over, 'J'), true); assert.equal(P.estimateJustPassed(over, over, 'J'), false);
  assert.deepEqual([1520, 1500, 1549.99, 1550, 0, 49.99].map(P.estimateRoundUp), [1550, 1550, 1550, 1600, 50, 50]);
  // Deleting the gym (£30, monthly) while £320 isn't listed: lower the figure by £30. With bills past the figure, only the
  // part that was within it; none for a bill that comes in 6 or fewer months, or without a figure.
  const g = example(); g.bills.push(bill('gym', 30, 'J'));
  assert.deepEqual(P.estimateDeleteOffer(g, g.bills[4]), { account: 'J', amount: 30, figure: 1500 });
  assert.deepEqual(P.estimateDeleteOffer(example(), bill('gym', 30, 'J')), { account: 'J', amount: 30, figure: 1500 }, 'with the bill already gone');
  const o2 = example(); o2.bills.push(bill('broadband', 310, 'J'), bill('gym', 30, 'J'));
  assert.deepEqual(P.estimateDeleteOffer(o2, o2.bills[5]), { account: 'J', amount: 10, figure: 1500 }, '£20 past the figure: only £10 comes back');
  o2.bills[4].amount = 400; assert.equal(P.estimateDeleteOffer(o2, o2.bills[5]), null);
  assert.equal(P.estimateDeleteOffer(example(), example().bills[3]), null, 'car insurance, June only');
  assert.equal(P.estimateDeleteOffer(example({ estimates: [] }), bill('gym', 30, 'J')), null);
});

test('the good news: ending the figure, worked out before and after, shares split the change', () => {
  const c = couple('equal'), e = P.estimateEndEffect(c, {}, '2026-05', 'J');
  assert.deepEqual(e.people.map(p => [p.name, p.before, p.after, p.change]), [['Alex', 750, 590, -160], ['Sam', 750, 590, -160]]);
  assert.deepEqual(e.steps.map(s => [s.id, s.change]), [['c:a>J', -160], ['c:s>J', -160]]);
  assert.equal(e.float, 320);
  const pay = P.estimateEndEffect(couple('pay'), {}, '2027-02', 'J');
  assert.deepEqual(pay.people.map(p => p.change), [-192, -128], 'in proportion to pay: £320 split 60:40');
  // Pooled: nobody pays a share; Joint sends £320 more on.
  const pooled = P.estimateEndEffect(example(), {}, '2026-05', 'J');
  assert.deepEqual([pooled.people.map(p => p.change), pooled.steps.map(s => [s.id, s.change])], [[0], [['t:J>S', 320]]]);
  // Nothing to say when the bills are past the figure already.
  const done = couple('equal'); done.bills.push(bill('broadband', 400, 'J'));
  assert.deepEqual(P.estimateEndEffect(done, {}, '2026-05', 'J').steps, []);
});

test('Finish setting up: the bills item stays undone while anything isn\'t listed', () => {
  const tip = c => P.setupChecklist(c, {}).find(x => x.key === 'bills');
  assert.deepEqual(tip(example()), { key: 'bills', label: 'List Joint\'s bills (£320.00 to go)', done: false, unlisted: [{ account: 'J', amount: 320 }] });
  const two = example({ estimates: [est('e1', 1500, 'J'), est('e2', 100, 'S')] });
  assert.equal(tip(two).label, 'List the bills for Joint and Spending (£420.00 to go)');
  const full = example(); full.bills.push(bill('rest', 320, 'J'));
  assert.deepEqual(tip(full), { key: 'bills', label: 'Add your bills', done: true });
  assert.deepEqual(tip(example({ bills: [], estimates: [] })), { key: 'bills', label: 'Add your bills', done: false });
});

// Setup's state, as setup.test.mjs builds it.
function setupState(style, rule, figures, bills) {
  const s = { step: 7, people: [{ id: 'p0', name: 'Alex', pay: '3000', payAccount: null }, { id: 'p1', name: 'Sam', pay: '2000', payAccount: null }], income: [], payday: { day: '28', weekend: true }, skip: {},
    shape: null, style, pool: null, ans: { fun: null, funAmt: {}, rule, set: {}, two: 'no', payer: style === 'housekeeping' ? 'p0' : null, gets: {}, getsAmt: {}, board: {}, boardAmt: {} },
    accounts: [], bills: {}, budgets: [], savings: [] };
  const sh = P.setupShape(style, P.setupPeople(s), P.setupOpts(s));
  s.shape = style; s.accounts = sh.accounts; s.people.forEach(p => { p.payAccount = sh.payAccount[p.id]; });
  const id = n => s.accounts.find(a => a.name === n).id;
  s.bills = Object.fromEntries(Object.entries(bills).map(([n, rows]) => [id(n), rows.map(([name, amount, freq = 'monthly', month = '']) => ({ name, amount, freq, month, picked: [] }))]));
  if (figures) s.figures = Object.fromEntries(Object.entries(figures).map(([n, v]) => [id(n), v]));
  return s;
}
const O = { schema: 5, version: '9.9', today: '2026-10-05' };

test('setupSettings: a rough figure per account, kept only when it\'s above the listed bills that count within it', () => {
  const s = setupState('contribute', 'equal', { 'Joint account': '1500', "Alex's account": '', "Sam's account": '0' }, { 'Joint account': [['Mortgage', '900'], ['Car insurance', '480', 'yearly', '6']] });
  const r = P.setupSettings(s, null, O), j = r.cfg.accounts.find(a => a.name === 'Joint account').id;
  assert.deepEqual(r.cfg.estimates.map(e => [e.account, e.amount]), [[j, 1500]]);
  assert.equal(r.dropped, 0); assert.ok(!('figureNotes' in r));
  assert.equal(P.estimateParts(r.cfg, j).unlisted, 600, 'the car insurance (June only) counts on top');
  // At or below the listed bills: not kept, and said.
  const low = P.setupSettings(setupState('contribute', 'equal', { 'Joint account': '£900' }, { 'Joint account': [['Mortgage', '900']] }), null, O);
  assert.ok(!('estimates' in low.cfg));
  assert.deepEqual(low.figureNotes, ['The bills listed for Joint account already come to £900.00, so its rough figure of £900.00 isn\'t needed.']);
  // Text that isn't an amount is a row that wasn't complete.
  const odd = P.setupSettings(setupState('contribute', 'equal', { 'Joint account': 'lots' }, {}), null, O);
  assert.deepEqual([odd.dropped, 'estimates' in odd.cfg], [1, false]);
  // Under "after own bills", not on someone's own account; a bills step that was skipped keeps none.
  const own = P.setupSettings(setupState('contribute', 'afterOwn', { "Alex's account": '200', 'Joint account': '1000' }, {}), null, O);
  assert.deepEqual(own.cfg.estimates.map(e => e.amount), [1000]);
  assert.deepEqual(own.figureNotes, ['A rough figure isn\'t used for Alex\'s account. With this split, list your own bills so the shares are fair.']);
  // A figure typed on an account that step 4 later made one a figure isn't allowed on is said as that, even when it isn't
  // an amount, rather than counted as a row that wasn't complete.
  const late = P.setupSettings(setupState('contribute', 'afterOwn', { "Alex's account": 'lots', 'Joint account': '1000' }, {}), null, O);
  assert.equal(late.dropped, 0);
  assert.deepEqual(late.figureNotes, ['A rough figure isn\'t used for Alex\'s account. With this split, list your own bills so the shares are fair.']);
  const skipped = setupState('contribute', 'equal', { 'Joint account': '1500' }, {}); skipped.skip = { 5: true };
  assert.ok(!('estimates' in P.setupSettings(skipped, null, O).cfg));
  // The same answers without figures give exactly the settings they did before.
  const a = setupState('contribute', 'equal', null, { 'Joint account': [['Mortgage', '900']] }), b = setupState('contribute', 'equal', {}, { 'Joint account': [['Mortgage', '900']] });
  const strip = x => JSON.stringify(x.cfg, (k, v) => /^(id|account|payAccount|leftoverTo)$/.test(k) ? undefined : v);
  assert.equal(strip(P.setupSettings(a, null, O)), strip(P.setupSettings(b, null, O)));
});

test('Analysis: bills include what\'s not listed yet; Where the money goes gives it its own bar, not a category', () => {
  const c = example(), pic = P.monthlyPicture(c, {}, '2026-05'), plain = example({ estimates: [] }), pp = P.monthlyPicture(plain, {}, '2026-05');
  assert.equal(pic.unlisted, 320); assert.equal(P.r2(pic.bills - pp.bills), 320); assert.equal(P.r2(pp.float - pic.float), 320);
  const mo = P.monthOutgoings(c, {}, '2026-06');
  assert.deepEqual([mo.unlisted, P.r2(mo.bills), P.r2(mo.total)], [320, 1980, 2380]);
  const pf = P.projectedFloat(c, {}, '2026-05', ['2026-05', '2026-06']);
  assert.deepEqual(pf.map(x => P.r2(x.float)), [1100, 620]);
  const cat = P.byCategory(c), none = P.byCategory(plain);
  assert.equal(none.unlisted, null);
  assert.deepEqual([cat.unlisted.monthly, cat.unlisted.annual, cat.unlisted.accounts], [320, 3840, [{ account: 'J', monthly: 320 }]]);
  assert.equal(P.r2(cat.annual - none.annual), 3840);
  assert.equal(P.r2(cat.groups.reduce((t, g) => t + g.share, 0) + cat.unlisted.share), 1, 'the shares add up to all the bills');
  assert.ok(!cat.groups.some(g => /listed/i.test(g.name)), 'not a category');
  // Accounts that ran short see the figure through calc: a low month for Joint.
  const tight = example({ people: [{ id: 'a', name: 'Alex', payAccount: 'J', usualPay: 1400 }] }), m = { '2026-05': { pay: { a: 1400 } } };
  assert.equal(P.r2(P.calcMonth(tight, m, '2026-05').flt), -500);
});

test('exports: a row per figure in the bills tables, a preface line, and bills_not_listed only for a household with a figure', () => {
  const c = example(), m = { '2026-05': { pay: { a: 3000 } }, '2026-06': { pay: { a: 3100 } } };
  const md = P.exportMarkdown(c, m, '2026-05-01', { version: '2.14' });
  assert.ok(md.includes('- **Rough figures**: this household has bills not listed yet.'));
  assert.ok(md.includes('| Rough figure for Joint\'s bills (1500.00): not listed yet | 320.00 | Every month | 12 |  | Joint |'));
  assert.ok(md.includes('| Not listed yet (rough figures) | 3840.00 | 320.00 |'));
  const x = P.exportCsv(c, m, '2026-05-01'), rows = x.bills.text.trim().split('\r\n'), mon = x.months.text.trim().split('\r\n');
  assert.equal(rows[rows.length - 1], 'Rough figure for Joint\'s bills (1500.00): not listed yet,320.00,Every month,12,3840.00,,Joint,,no');
  assert.equal(mon[0], 'month,Alex_pay,float,transfers_ticked,transfers_total,one_off_payments,one_off_income,bills_not_listed');
  assert.deepEqual(mon.slice(1).map(l => l.split(',').pop()), ['320.00', '320.00']);
  const plain = example({ estimates: [] }), px = P.exportCsv(plain, m, '2026-05-01'), pmd = P.exportMarkdown(plain, m, '2026-05-01', {});
  assert.ok(!/bills_not_listed|Rough figure/.test(px.bills.text + px.months.text + pmd));
  // A figure ended earlier still gets the column (its months had one), but no row now.
  const ended = P.endEstimates(c, 'J', '2026-06', true), ex = P.exportCsv(ended, m, '2026-05-01');
  assert.ok(ex.months.text.startsWith('month,Alex_pay,float,transfers_ticked,transfers_total,one_off_payments,one_off_income,bills_not_listed'));
  assert.deepEqual(ex.months.text.trim().split('\r\n').slice(1).map(l => l.split(',').pop()), ['320.00', '0.00']);
  assert.ok(!ex.bills.text.includes('Rough figure'));
});
