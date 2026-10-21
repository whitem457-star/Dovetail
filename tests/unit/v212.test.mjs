// Unit tests for 2.12, household money styles: accounts paid for by several people under a rule (funding), worked
// through for each style in the plan's catalogue. Made-up households only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, sampleUpgraded, household, clone } from './load.mjs';

const acc = (id, o = {}) => Object.assign({ id, name: id, colour: 'blue', leftoverTo: null }, o);
const bill = (id, amount, account, o = {}) => Object.assign({ id, name: id, amount, account, months: [] }, o);
const contribs = r => Object.fromEntries(r.steps.filter(s => s.kind === 'contribute').map(s => [s.id, s.amt]));
const floats = r => Object.fromEntries(r.floats.map(f => [f.id, Math.round(f.amt * 100) / 100]));
const run = (c, pay, m = 11, ones = []) => { const r = P.calc(c, m, pay, ones); assert.ok(r.ok, 'the figures reconcile'); return r; };

// Two people with their own accounts (which keep what's left) and a joint account paid for by both.
function couple(rule, o = {}) {
  return household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: o.alexUsual ?? 3000 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: o.samUsual ?? 2000 }],
    accounts: [acc('A'), acc('S'), acc('J', { funding: Object.assign({ people: ['alex', 'sam'], rule }, o.set ? { set: o.set } : {}) })],
    bills: [bill('rent', o.joint ?? 1500, 'J')].concat(o.bills || []),
  });
}

test('style 4, half each: the joint account\'s bills split equally, each keeps the rest', () => {
  const r = run(couple('equal'), { alex: 3000, sam: 2000 });
  assert.deepEqual(contribs(r), { 'c:alex>J': 750, 'c:sam>J': 750 });
  assert.deepEqual(floats(r), { A: 2250, S: 1250, J: 0 });
  assert.equal(r.steps[0].kind, 'contribute', 'contributions come first');
  assert.equal(r.steps[0].from, 'A'); assert.equal(r.steps[0].to, 'J'); assert.equal(r.steps[0].share, 0.5);
});

test('style 5, in proportion to pay: usual pay sets the shares, this month\'s when there is none', () => {
  // Usual pay 3000 and 2000: 60% and 40%, even though Alex's pay this month is lower.
  let r = run(couple('pay'), { alex: 2500, sam: 2000 });
  assert.deepEqual(contribs(r), { 'c:alex>J': 900, 'c:sam>J': 600 });
  assert.equal(r.steps[0].share, 0.6);
  // No usual pay: this month's pay.
  r = run(couple('pay', { alexUsual: 0, samUsual: 0 }), { alex: 2500, sam: 2500 });
  assert.deepEqual(contribs(r), { 'c:alex>J': 750, 'c:sam>J': 750 });
  // Nobody has any pay: equal shares, and both accounts show short.
  r = run(couple('pay', { alexUsual: 0, samUsual: 0 }), { alex: 0, sam: 0 });
  assert.deepEqual(contribs(r), { 'c:alex>J': 750, 'c:sam>J': 750 });
  assert.deepEqual(floats(r), { A: -750, S: -750, J: 0 });
});

test('style 6, by what\'s left after own bills: own commitments come off first', () => {
  const r = run(couple('afterOwn', { joint: 1800, bills: [bill('car loan', 500, 'A')] }), { alex: 3000, sam: 2000 });
  // Alex has 2500 left after the car loan, Sam 2000: 2500:2000 of 1800.
  assert.deepEqual(contribs(r), { 'c:alex>J': 1000, 'c:sam>J': 800 });
  assert.deepEqual(floats(r), { A: 1500, S: 1200, J: 0 });
});

test('style 7, so we each keep the same; someone who would keep less pays nothing', () => {
  let r = run(couple('sameLeft'), { alex: 3000, sam: 2000 });
  assert.deepEqual(contribs(r), { 'c:alex>J': 1250, 'c:sam>J': 250 });
  assert.deepEqual(floats(r), { A: 1750, S: 1750, J: 0 });
  // Sam earns too little to keep as much as Alex would: Sam pays nothing, Alex covers the rest.
  r = run(couple('sameLeft', { joint: 2000 }), { alex: 3000, sam: 500 });
  assert.deepEqual(contribs(r), { 'c:alex>J': 2000 });
  assert.deepEqual(floats(r), { A: 1000, S: 500, J: 0 });
  // Own bills count: Alex's car loan means Alex has less to keep.
  r = run(couple('sameLeft', { bills: [bill('car loan', 500, 'A')] }), { alex: 3000, sam: 2000 });
  assert.deepEqual(contribs(r), { 'c:alex>J': 1000, 'c:sam>J': 500 });
  assert.deepEqual(floats(r), { A: 1500, S: 1500, J: 0 });
});

test('style 8, set amounts or a percentage of pay: the joint account builds up or runs short', () => {
  const set = { alex: { amount: 800 }, sam: { pct: 30 } };
  let r = run(couple('set', { set }), { alex: 3000, sam: 2000 });
  assert.deepEqual(contribs(r), { 'c:alex>J': 800, 'c:sam>J': 600 });
  assert.deepEqual(floats(r), { A: 2200, S: 1400, J: -100 }, 'short by 100');
  r = run(couple('set', { set, joint: 1000 }), { alex: 3000, sam: 2000 });
  assert.deepEqual(floats(r), { A: 2200, S: 1400, J: 400 }, 'builds up by 400');
  // A set amount for one, the rest shared by the rule: Sam pays 300, Alex what's still needed.
  r = run(couple('equal', { set: { sam: { amount: 300 } } }), { alex: 3000, sam: 2000 });
  assert.deepEqual(contribs(r), { 'c:alex>J': 1200, 'c:sam>J': 300 });
  assert.equal(r.steps.find(s => s.person === 'sam').set, true);
});

test('style 9, housekeeping to one partner: the bill payer\'s share stays in their own account', () => {
  const c = household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 2500 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: 1500 }],
    accounts: [acc('A', { funding: { people: ['alex', 'sam'], rule: 'pay' } }), acc('S')],
    bills: [bill('rent', 2000, 'A')],
  });
  const r = run(c, { alex: 2500, sam: 1500 });
  assert.deepEqual(contribs(r), { 'c:sam>A': 750 }, 'no transfer for Alex');
  assert.deepEqual(floats(r), { A: 1250, S: 750 });
  const x = r.contribs[0];
  assert.deepEqual(x.people.map(q => [q.p.id, q.amt, q.stays]), [['alex', 1250, true], ['sam', 750, false]]);
  assert.equal(x.need, 2000);
});

test('style 10, each pays certain bills: own accounts, no transfers between them', () => {
  const c = household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A' }, { id: 'sam', name: 'Sam', payAccount: 'S' }],
    accounts: [acc('A'), acc('S')], bills: [bill('rent', 1200, 'A'), bill('energy', 150, 'S')],
  });
  const r = run(c, { alex: 3000, sam: 2000 });
  assert.equal(r.steps.length, 0);
  assert.deepEqual(floats(r), { A: 1800, S: 1850 });
});

test('style 11, one earner: a set amount into the partner\'s own account', () => {
  const c = household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: 0 }],
    accounts: [acc('A'), acc('S', { funding: { people: ['alex'], rule: 'set', set: { alex: { amount: 400 } } } })],
    bills: [bill('rent', 1800, 'A')],
  });
  const r = run(c, { alex: 3000, sam: 0 });
  assert.deepEqual(contribs(r), { 'c:alex>S': 400 });
  assert.deepEqual(floats(r), { A: 800, S: 400 });
});

test('style 12, mixed: bills by pay into joint bills, then set amounts each into joint savings', () => {
  const c = household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: 2000 }],
    accounts: [acc('A'), acc('S'), acc('JB', { funding: { people: ['alex', 'sam'], rule: 'pay' } }),
      acc('JS', { funding: { people: ['alex', 'sam'], rule: 'set', set: { alex: { amount: 100 }, sam: { amount: 100 } } } })],
    bills: [bill('rent', 1500, 'JB')],
  });
  const r = run(c, { alex: 3000, sam: 2000 });
  assert.deepEqual(contribs(r), { 'c:alex>JB': 900, 'c:sam>JB': 600, 'c:alex>JS': 100, 'c:sam>JS': 100 });
  assert.deepEqual(floats(r), { A: 2000, S: 1300, JB: 0, JS: 200 });
});

test('style 12, mixed: a funded account that passes what\'s left on is worked out before the one it passes to', () => {
  // Joint bills (half each) passes what's left to joint spending, which Alex and Sam pay for by pay.
  const c = household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: 1000 }],
    accounts: [acc('A'), acc('S'), acc('JSP', { funding: { people: ['alex', 'sam'], rule: 'pay' } }),
      acc('JB', { leftoverTo: 'JSP', funding: { people: ['alex', 'sam'], rule: 'set', set: { alex: { amount: 600 }, sam: { amount: 600 } } } })],
    bills: [bill('rent', 1000, 'JB')], budgets: [{ id: 'food', name: 'Food', amount: 600, account: 'JSP' }],
  });
  const r = run(c, { alex: 3000, sam: 1000 });
  // JB gets 1200, pays 1000 and passes 200 on; JSP then needs 400 more: 300 and 100.
  assert.deepEqual(contribs(r), { 'c:alex>JB': 600, 'c:sam>JB': 600, 'c:alex>JSP': 300, 'c:sam>JSP': 100 });
  assert.deepEqual(floats(r), { A: 2100, S: 300, JSP: 0 });
  assert.deepEqual(r.steps.filter(s => s.kind === 'move').map(s => [s.id, s.amt]), [['t:JB>JSP', 200]]);
});

test('styles 1 to 3 and 13 to 15: no funding gives exactly the transfers it always did', () => {
  const { c, m } = sampleUpgraded(true);
  for (const k of Object.keys(m).concat(['2026-12', '2027-01'])) {
    const before = P.calc(c, P.mNum(k), P.payFor(c, m, k), P.monthOneOffs(m, k));
    assert.deepEqual(before.contribs, []);
    assert.ok(!before.steps.some(s => s.kind === 'contribute'));
    assert.ok(before.A[c.accounts[0].id].cIn.length === 0);
  }
  // Pooling with spending money for each (style 3): a budget on each own account, kept before the rest moves on.
  const p = household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A' }, { id: 'sam', name: 'Sam', payAccount: 'S' }],
    accounts: [acc('A', { leftoverTo: 'J' }), acc('S', { leftoverTo: 'J' }), acc('J')],
    bills: [bill('rent', 1500, 'J')], budgets: [{ id: 'fa', name: 'Fun money', amount: 200, account: 'A' }, { id: 'fs', name: 'Fun money', amount: 200, account: 'S' }],
  });
  const r = run(p, { alex: 3000, sam: 2000 });
  assert.deepEqual(r.steps.map(s => [s.id, s.amt]), [['t:A>J', 2800], ['t:S>J', 1800]]);
});

test('style 16, board: a set amount into the household\'s account; the rest is the boarder\'s own', () => {
  const c = household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A' }, { id: 'sam', name: 'Sam', payAccount: 'S' }, { id: 'kit', name: 'Kit', payAccount: 'K' }],
    accounts: [acc('A', { leftoverTo: 'J' }), acc('S', { leftoverTo: 'J' }), acc('K'), acc('J', { funding: { people: ['kit'], rule: 'set', set: { kit: { amount: 300 } } } })],
    bills: [bill('rent', 1500, 'J')],
  });
  const r = run(c, { alex: 3000, sam: 2000, kit: 1100 });
  assert.deepEqual(r.steps.map(s => [s.id, s.amt]), [['c:kit>J', 300], ['t:A>J', 3000], ['t:S>J', 2000]]);
  assert.deepEqual(floats(r), { K: 800, J: 3800 });
});

test('style 17, three adults: equal shares to the penny, the rounding penny to the largest share', () => {
  const c = household({
    people: ['a', 'b', 'd'].map(id => ({ id, name: id, payAccount: id.toUpperCase() })),
    accounts: [acc('A'), acc('B'), acc('D'), acc('J', { funding: { people: ['a', 'b', 'd'], rule: 'equal' } })],
    bills: [bill('rent', 100, 'J')],
  });
  const r = run(c, { a: 1000, b: 1000, d: 1000 });
  assert.deepEqual(contribs(r), { 'c:a>J': 33.34, 'c:b>J': 33.33, 'c:d>J': 33.33 });
  assert.equal(floats(r).J, 0);
});

test('what the account still needs: its other income, one-offs and the branch passing up all count', () => {
  const c = couple('equal');
  c.income = [{ id: 'cb', name: 'Child Benefit', amount: 100, account: 'J' }];
  // A one-off payment from the joint account raises the need; a one-off in lowers it.
  let r = run(c, { alex: 3000, sam: 2000 }, 11, [{ id: 'o', kind: 'out', name: 'Boiler', amount: 400, account: 'J' }]);
  assert.deepEqual(contribs(r), { 'c:alex>J': 900, 'c:sam>J': 900 });
  r = run(c, { alex: 3000, sam: 2000 }, 11, [{ id: 'o', kind: 'in', name: 'Refund', amount: 1400, account: 'J' }]);
  assert.deepEqual(contribs(r), {}, 'nothing needed');
  assert.deepEqual(floats(r).J, 0);
  // A bill not due this month doesn't count.
  const d = couple('equal', { bills: [bill('insurance', 300, 'J', { months: [3] })] });
  assert.deepEqual(contribs(run(d, { alex: 3000, sam: 2000 }, 11)), { 'c:alex>J': 750, 'c:sam>J': 750 });
  assert.deepEqual(contribs(run(d, { alex: 3000, sam: 2000 }, 3)), { 'c:alex>J': 900, 'c:sam>J': 900 });
});

test('someone whose account can\'t cover their share shows short; someone whose pay already reaches the account is left out', () => {
  const c = couple('equal', { joint: 3000 });
  assert.deepEqual(floats(run(c, { alex: 3000, sam: 1000 })), { A: 1500, S: -500, J: 0 });
  // Sam's account passes what's left into the joint account: Sam is left out (they'd pay twice), and Settings says so.
  const d = couple('equal');
  d.accounts.find(a => a.id === 'S').leftoverTo = 'J';
  const r = run(d, { alex: 3000, sam: 2000 });
  assert.deepEqual(contribs(r), {}, 'Sam passes 2000 up, which covers it');
  assert.match(P.fundingProblem(d, 'J'), /^Sam's pay already reaches J through S, so they'd pay twice\.$/);
  assert.equal(P.fundingProblem(couple('equal'), 'J'), null);
  assert.equal(P.fundingProblem(couple('equal'), 'A'), null);
});

test('totals don\'t change: contributions move money between accounts', () => {
  const plain = household({ people: couple('equal').people, accounts: [acc('A'), acc('S'), acc('J')], bills: [bill('rent', 1500, 'J')] });
  const a = run(plain, { alex: 3000, sam: 2000 }), b = run(couple('equal'), { alex: 3000, sam: 2000 });
  assert.equal(a.totalIn, b.totalIn); assert.equal(a.flt, b.flt); assert.deepEqual(a.t, b.t);
  assert.equal(b.A.A.cOut[0].v, 750); assert.equal(b.A.J.cIn.length, 2);
});

test('normFunding and normCfg: sound funding passes through; anything unusable is taken out', () => {
  const c = couple('pay', { set: { sam: { pct: 25 } } });
  assert.deepEqual(c.accounts[2].funding, { people: ['alex', 'sam'], rule: 'pay', set: { sam: { pct: 25 } } });
  assert.deepEqual(P.normCfg(clone(c)), c, 'unchanged');
  const ppl = { people: [{ id: 'alex' }, { id: 'sam' }] };
  assert.equal(P.normFunding(null, ppl), null);
  assert.equal(P.normFunding({ people: ['alex'], rule: 'halves' }, ppl), null, 'unknown rule');
  assert.equal(P.normFunding({ people: ['pat'], rule: 'equal' }, ppl), null, 'nobody in the household');
  assert.deepEqual(P.normFunding({ people: ['alex', 'pat', 'alex', 3, 'sam'], rule: 'equal' }, ppl), { people: ['alex', 'sam'], rule: 'equal' });
  assert.deepEqual(P.normFunding({ people: ['alex', 'sam'], rule: 'set', set: { alex: { amount: -5 }, sam: { pct: 120 }, pat: { amount: 5 } } }, ppl), { people: ['alex', 'sam'], rule: 'set' });
  assert.deepEqual(P.normFunding({ people: ['alex', 'sam'], rule: 'set', set: { alex: { amount: 0 }, sam: { amount: '5' } } }, ppl), { people: ['alex', 'sam'], rule: 'set', set: { alex: { amount: 0 } } });
  const bad = clone(c); bad.accounts[2].funding = { people: [], rule: 'equal' }; bad.accounts[1].funding = 'yes';
  const n = P.normCfg(bad);
  assert.equal('funding' in n.accounts[2], false); assert.equal('funding' in n.accounts[1], false);
  assert.equal('funding' in n.accounts[0], false);
});

test('pennyShares and sameLeftShares add up exactly', () => {
  assert.deepEqual(P.pennyShares(10, [1, 1, 1]), [3.34, 3.33, 3.33]);
  assert.deepEqual(P.pennyShares(10, [1, 2, 0]), [3.33, 6.67, 0]);
  assert.deepEqual(P.pennyShares(10, [0, 0]), [5, 5]);
  assert.deepEqual(P.pennyShares(0, [3, 2]), [0, 0]);
  assert.deepEqual(P.sameLeftShares(1500, [3000, 2000]), [1250, 250]);
  assert.deepEqual(P.sameLeftShares(2000, [3000, 500]), [2000, 0]);
  assert.deepEqual(P.sameLeftShares(6000, [3000, 2000]), [3500, 2500], 'both left at -500');
  assert.deepEqual(P.sameLeftShares(100, [500, 500, 500]), [33.34, 33.33, 33.33]);
  assert.deepEqual(P.sameLeftShares(0, [500, 400]), [0, 0]);
});

// ---------- setup's new starting points ----------
const AS = [{ id: 'alex', name: 'Alex' }, { id: 'sam', name: 'Sam' }];
const shapeCfg = (sh, people, extra = {}) => household(Object.assign({ people: people.map(p => ({ id: p.id, name: p.name, payAccount: sh.payAccount[p.id] })), accounts: sh.accounts }, extra));
const names = sh => sh.accounts.map(a => a.name);

test('setupShape: the pooled starting points are as they were', () => {
  for (const [kind, want] of [['joint', ['Joint account']], ['own', ["Alex's account", "Sam's account", 'Joint account']],
    ['split', ["Alex's account", "Sam's account", 'Joint bills', 'Joint spending']], ['other', ['Joint account']]]) {
    const sh = P.setupShape(kind, AS);
    assert.deepEqual(names(sh), want, kind);
    assert.ok(sh.accounts.every(a => !('funding' in a)), kind + ': no funding');
  }
});

test('setupShape "contribute": own accounts that keep what\'s left, and a joint account both pay into', () => {
  let sh = P.setupShape('contribute', AS, { rule: 'pay' });
  assert.deepEqual(names(sh), ["Alex's account", "Sam's account", 'Joint account']);
  assert.deepEqual(sh.accounts.map(a => a.leftoverTo), [null, null, null]);
  assert.deepEqual(sh.accounts[2].funding, { people: ['alex', 'sam'], rule: 'pay' });
  assert.equal(sh.payAccount.alex, sh.accounts[0].id);
  const c = shapeCfg(sh, AS, { bills: [bill('rent', 1000, sh.accounts[2].id)] });
  c.people[0].usualPay = 3000; c.people[1].usualPay = 1000;
  assert.deepEqual(Object.values(contribs(run(c, { alex: 3000, sam: 1000 }))), [750, 250]);
  assert.equal(P.defaultBillAccount(c), sh.accounts[2].id, 'bills come from the joint account');
  // Two joint accounts: both paid for by the rule, bills passing what's left to spending.
  sh = P.setupShape('contribute', AS, { rule: 'equal', two: true });
  assert.deepEqual(names(sh), ["Alex's account", "Sam's account", 'Joint bills', 'Joint spending']);
  assert.equal(sh.accounts[2].leftoverTo, sh.accounts[3].id);
  assert.deepEqual([sh.accounts[2].funding.rule, sh.accounts[3].funding.rule], ['equal', 'equal']);
  assert.equal(P.defaultBillAccount(shapeCfg(sh, AS)), sh.accounts[2].id, 'joint bills');
  // Set amounts: into joint bills only; what's left moves to joint spending.
  sh = P.setupShape('contribute', AS, { rule: 'set', two: true, set: { alex: '600', sam: 450.5 } });
  assert.deepEqual(sh.accounts[2].funding, { people: ['alex', 'sam'], rule: 'set', set: { alex: { amount: 600 }, sam: { amount: 450.5 } } });
  assert.equal('funding' in sh.accounts[3], false);
});

test('setupShape "housekeeping": the bill payer\'s account, paid for by both', () => {
  const sh = P.setupShape('housekeeping', AS, { rule: 'sameLeft', payer: 'sam' });
  assert.deepEqual(names(sh), ["Alex's account", "Sam's account"]);
  assert.deepEqual(sh.accounts[1].funding, { people: ['alex', 'sam'], rule: 'sameLeft' });
  assert.equal('funding' in sh.accounts[0], false);
  assert.equal(P.defaultBillAccount(shapeCfg(sh, AS)), sh.accounts[1].id, "bills come from Sam's account");
});

test('setupShape "separate": own accounts, nothing shared', () => {
  const sh = P.setupShape('separate', AS);
  assert.deepEqual(names(sh), ["Alex's account", "Sam's account"]);
  assert.ok(sh.accounts.every(a => !a.funding && !a.leftoverTo));
});

test('setupShape: someone with no pay is left out of shared costs and can get a set amount', () => {
  let sh = P.setupShape('contribute', AS, { rule: 'equal', noPay: ['sam'], gets: { sam: 300 } });
  assert.deepEqual(sh.accounts[2].funding.people, ['alex']);
  assert.deepEqual(sh.accounts[1].funding, { people: ['alex'], rule: 'set', set: { alex: { amount: 300 } } });
  sh = P.setupShape('separate', AS, { noPay: ['sam'], gets: { sam: '250' } });
  assert.deepEqual(sh.accounts[1].funding, { people: ['alex'], rule: 'set', set: { alex: { amount: 250 } } });
  // Not when pooling: they share everything.
  sh = P.setupShape('own', AS, { noPay: ['sam'], gets: { sam: 300 } });
  assert.ok(sh.accounts.every(a => !a.funding));
  // Nothing typed, or no answer: no transfer.
  sh = P.setupShape('separate', AS, { noPay: ['sam'], gets: { sam: '' } });
  assert.ok(sh.accounts.every(a => !a.funding));
});

test('setupShape: board, with three or more people', () => {
  const three = AS.concat([{ id: 'kit', name: 'Kit' }]);
  let sh = P.setupShape('own', three, { board: { kit: 300 } });
  assert.deepEqual(names(sh), ["Alex's account", "Sam's account", 'Joint account', "Kit's account"]);
  assert.deepEqual(sh.accounts[2].funding, { people: ['kit'], rule: 'set', set: { kit: { amount: 300 } } });
  assert.equal(sh.payAccount.kit, sh.accounts[3].id);
  const c = shapeCfg(sh, three, { bills: [bill('rent', 1500, sh.accounts[2].id)] });
  assert.deepEqual(run(c, { alex: 2000, sam: 1000, kit: 900 }).steps.map(s => s.amt), [300, 2000, 1000]);
  sh = P.setupShape('contribute', three, { rule: 'pay', board: { kit: 250 } });
  assert.deepEqual(sh.accounts[2].funding, { people: ['alex', 'sam', 'kit'], rule: 'pay', set: { kit: { amount: 250 } } });
  // The first person is never a boarder.
  sh = P.setupShape('joint', three, { board: { alex: 100 } });
  assert.deepEqual(names(sh), ['Joint account']);
});

test('flowStory: who pays into which account, and whose left over it is', () => {
  let sh = P.setupShape('contribute', AS, { rule: 'equal' }), story = P.flowStory(shapeCfg(sh, AS)).map(x => x.text);
  assert.deepEqual(story, ["Alex's pay arrives in Alex's account. It pays Alex's share into Joint account. It keeps what's left: Alex's left over.",
    "Sam's pay arrives in Sam's account. It pays Sam's share into Joint account. It keeps what's left: Sam's left over.",
    "Alex and Sam share the costs of Joint account, half each. It keeps what's left: your left over."]);
  sh = P.setupShape('housekeeping', AS, { rule: 'pay', payer: 'alex' }); story = P.flowStory(shapeCfg(sh, AS));
  // Sam pays into Alex's account, so Sam's comes first.
  assert.deepEqual(story.map(x => x.text), ["Sam's pay arrives in Sam's account. It pays Sam's share into Alex's account. It keeps what's left: Sam's left over.",
    "Alex's pay arrives in Alex's account. Alex and Sam share its costs, in proportion to pay. It keeps what's left: Alex's left over."]);
  assert.deepEqual(story[1].shares, ["Sam's share"]); assert.deepEqual(story[0].paysInto, [sh.accounts[0].id]);
  const three = AS.concat([{ id: 'kit', name: 'Kit' }]);
  sh = P.setupShape('own', three, { board: { kit: 300 } }); story = P.flowStory(shapeCfg(sh, three)).map(x => x.text);
  // Kit's account pays into the joint account, so it comes before it.
  assert.equal(story[2], "Kit's pay arrives in Kit's account. It pays Kit's set amount into Joint account. It keeps what's left: Kit's left over.");
  assert.equal(story[3], "Kit pays a set amount into Joint account. It also gets what's left from Alex's account and Sam's account. It keeps what's left: your left over.");
  // A pooled household reads as before.
  sh = P.setupShape('own', AS); story = P.flowStory(shapeCfg(sh, AS)).map(x => x.text);
  assert.equal(story[2], "Joint account gets what's left from Alex's account and Sam's account. It keeps what's left: your left over.");
});

test('transfersText: a contribution says whose share it is', () => {
  const c = couple('pay', { set: undefined });
  const r = P.calc(c, 11, { alex: 3000, sam: 2000 }, []);
  const t = P.transfersText(c, '2026-11', r, { 'c:alex>J': 900 }, {});
  assert.match(t, /^1\. ☑ A → J  £900\.00 \(Alex's share, 60%\)$/m);
  assert.match(t, /^2\. ☐ S → J  £600\.00 \(Sam's share, 40%\)$/m);
  const k = P.calc(couple('set', { set: { alex: { amount: 100 }, sam: { amount: 100 } } }), 11, { alex: 3000, sam: 2000 }, []);
  assert.equal(P.contribLabel(couple('set'), k, k.steps[0]), "Alex's set amount");
});

// ---------- stage 3: changing how the household manages its money, from a month ----------
function pooled() {
  return household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: 2000 }],
    accounts: [acc('A', { leftoverTo: 'J' }), acc('S', { leftoverTo: 'J' }), acc('J')],
    bills: [bill('rent', 1500, 'J'), bill('phone', 20, 'A')],
  });
}
const PAY = { alex: 3000, sam: 2000 };
const stepsOf = (c, k, ones = []) => { const r = P.calc(P.cfgFor(c, k, ones), P.mNum(k), PAY, ones); assert.ok(r.ok, k + ' reconciles'); return r.steps.map(s => [s.id, s.amt]); };

test('cfgFor: with no changes, every month uses the settings as they are (the same object)', () => {
  const c = pooled();
  assert.equal(P.cfgFor(c, '2026-11'), c);
  const { c: s } = sampleUpgraded(false);
  assert.equal(P.cfgFor(s, '2020-01'), s);
});

test('applyChange: from March, own accounts keep what\'s left and both pay into the joint account by pay; earlier months stay pooled', () => {
  const c = pooled();
  const next = { accounts: [acc('A'), acc('S'), acc('J', { funding: { people: ['alex', 'sam'], rule: 'pay' } })], pay: { alex: 'A', sam: 'S' } };
  const d = P.applyChange(c, '2027-03', next, {});
  assert.deepEqual(d.flows, [{ from: '2027-03', was: { accounts: { A: { leftoverTo: 'J' }, S: { leftoverTo: 'J' }, J: { leftoverTo: null } }, pay: { alex: 'A', sam: 'S' } } }]);
  assert.deepEqual(stepsOf(d, '2027-02'), [['t:A>J', 2980], ['t:S>J', 2000]], 'February: pooled, as before');
  assert.deepEqual(stepsOf(d, '2027-03'), [['c:alex>J', 900], ['c:sam>J', 600]], 'March: by pay');
  assert.deepEqual(stepsOf(d, '2028-01'), [['c:alex>J', 900], ['c:sam>J', 600]]);
  assert.deepEqual(stepsOf(c, '2027-03'), [['t:A>J', 2980], ['t:S>J', 2000]], 'the original settings are unchanged');
  assert.deepEqual(P.normCfg(clone(d)), d, 'normCfg keeps it as it is');
  // Undo: pooled again for every month, and no changes left.
  const u = P.removeLastChange(d);
  assert.equal('flows' in u, false);
  assert.deepEqual(stepsOf(u, '2027-03'), [['t:A>J', 2980], ['t:S>J', 2000]]);
  assert.equal(u.accounts.find(a => a.id === 'J').funding, undefined);
});

test('applyChange: an account left out is closed from that month; its bills move; a new account opens then', () => {
  const c = household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A' }, { id: 'sam', name: 'Sam', payAccount: 'S' }],
    accounts: [acc('A', { leftoverTo: 'JB' }), acc('S', { leftoverTo: 'JB' }), acc('JB', { leftoverTo: 'JS' }), acc('JS')],
    bills: [bill('rent', 1500, 'JB'), bill('streaming', 10, 'JS')], budgets: [{ id: 'food', name: 'Food', amount: 500, account: 'JS' }],
  });
  // From April: one joint account (a new one), half each; JB and JS close; their bills and budgets move to it.
  const next = { accounts: [acc('A'), acc('S'), acc('NEW', { name: 'Joint account', funding: { people: ['alex', 'sam'], rule: 'equal' } })], pay: { alex: 'A', sam: 'S' } };
  const d = P.applyChange(c, '2027-04', next, { JB: 'NEW', JS: 'NEW' });
  assert.deepEqual(d.accounts.map(a => [a.id, a.closedFrom || '']), [['A', ''], ['S', ''], ['JB', '2027-04'], ['JS', '2027-04'], ['NEW', '']]);
  assert.ok(d.bills.every(b => b.account === 'NEW') && d.budgets[0].account === 'NEW');
  assert.deepEqual(stepsOf(d, '2027-04'), [['c:alex>NEW', 1005], ['c:sam>NEW', 1005]]);
  assert.deepEqual(P.cfgFor(d, '2027-04').accounts.map(a => a.id), ['A', 'S', 'NEW'], 'closed accounts are gone from April');
  // Before April the old accounts are back, and so are the bills and budget the change moved: March is as it was.
  const mar = P.cfgFor(d, '2027-03');
  assert.deepEqual(mar.accounts.map(a => [a.id, a.leftoverTo]), [['A', 'JB'], ['S', 'JB'], ['JB', 'JS'], ['JS', null]]);
  assert.deepEqual([mar.bills.map(b => b.account), mar.budgets[0].account], [['JB', 'JS'], 'JS']);
  assert.deepEqual(stepsOf(d, '2027-03'), stepsOf(c, '2027-03'), 'March: the same transfers as before the change');
  assert.deepEqual(d.flows[0].was.items, { bills: { rent: 'JB', streaming: 'JS' }, budgets: { food: 'JS' } });
  // An unused new account isn't shown before it opened.
  const e = P.applyChange(c, '2027-04', { accounts: [acc('A'), acc('S'), acc('JB', { leftoverTo: 'JS' }), acc('JS'), acc('POT')], pay: { alex: 'A', sam: 'S' } }, {});
  assert.deepEqual(P.cfgFor(e, '2027-03').accounts.map(a => a.id), ['A', 'S', 'JB', 'JS']);
  assert.deepEqual(P.cfgFor(e, '2027-04').accounts.map(a => a.id), ['A', 'S', 'JB', 'JS', 'POT']);
  // Undo puts the bills back, reopens the closed accounts and removes the one the change opened: exactly as before.
  assert.deepEqual(P.removeLastChange(d), c);
  assert.deepEqual(P.removeLastChange(e), c);
  // …unless a saved month's one-off uses it.
  assert.deepEqual(P.removeLastChange(d, ['NEW']).accounts.map(a => a.id), ['A', 'S', 'JB', 'JS', 'NEW']);
});

test('applyChange: pay moves account from a month; a one-off on a closed account keeps it on screen', () => {
  const c = pooled();
  // From May, Sam is paid straight into the joint account.
  const d = P.applyChange(c, '2027-05', { accounts: [acc('A', { leftoverTo: 'J' }), acc('J')], pay: { alex: 'A', sam: 'J' } }, { S: 'J' });
  assert.equal(d.people[1].payAccount, 'J');
  assert.deepEqual(stepsOf(d, '2027-04'), [['t:A>J', 2980], ['t:S>J', 2000]]);
  assert.deepEqual(stepsOf(d, '2027-05'), [['t:A>J', 2980]]);
  const ones = [{ id: 'o', kind: 'out', name: 'Fee', amount: 5, account: 'S' }];
  assert.deepEqual(P.cfgFor(d, '2027-06', ones).accounts.map(a => a.id), ['A', 'S', 'J']);
  assert.deepEqual(stepsOf(d, '2027-06', ones), [['t:A>J', 2980]]);
});

test('applyChange: two changes; a new one from an earlier month replaces a later one', () => {
  const c = pooled();
  const contribute = { accounts: [acc('A'), acc('S'), acc('J', { funding: { people: ['alex', 'sam'], rule: 'equal' } })], pay: { alex: 'A', sam: 'S' } };
  const d = P.applyChange(c, '2027-03', contribute, {});
  const e = P.applyChange(d, '2027-09', { accounts: [acc('A', { leftoverTo: 'J' }), acc('S', { leftoverTo: 'J' }), acc('J')], pay: { alex: 'A', sam: 'S' } }, {});
  assert.deepEqual(e.flows.map(f => f.from), ['2027-03', '2027-09']);
  assert.deepEqual(stepsOf(e, '2027-02'), [['t:A>J', 2980], ['t:S>J', 2000]]);
  assert.deepEqual(stepsOf(e, '2027-03'), [['c:alex>J', 750], ['c:sam>J', 750]]);
  assert.deepEqual(stepsOf(e, '2027-09'), [['t:A>J', 2980], ['t:S>J', 2000]]);
  assert.deepEqual(P.removeLastChange(e).flows.map(f => f.from), ['2027-03']);
  assert.deepEqual(stepsOf(P.removeLastChange(e), '2027-10'), [['c:alex>J', 750], ['c:sam>J', 750]]);
  // A change from June replaces the September one; March stays.
  const f = P.applyChange(e, '2027-06', { accounts: [acc('A'), acc('S'), acc('J', { funding: { people: ['alex', 'sam'], rule: 'pay' } })], pay: { alex: 'A', sam: 'S' } }, {});
  assert.deepEqual(f.flows.map(x => x.from), ['2027-03', '2027-06']);
  assert.deepEqual(stepsOf(f, '2027-05'), [['c:alex>J', 750], ['c:sam>J', 750]]);
  assert.deepEqual(stepsOf(f, '2027-10'), [['c:alex>J', 900], ['c:sam>J', 600]]);
});

test('calcMonth and the Analysis figures use each month\'s arrangement', () => {
  const c = pooled();
  const d = P.applyChange(c, '2027-03', { accounts: [acc('A'), acc('S'), acc('J', { funding: { people: ['alex', 'sam'], rule: 'pay' } })], pay: { alex: 'A', sam: 'S' } }, {});
  const months = { '2027-02': { pay: PAY, done: {} }, '2027-03': { pay: PAY, done: {} } };
  assert.equal(P.calcMonth(d, months, '2027-02').steps[0].id, 't:A>J');
  assert.equal(P.calcMonth(d, months, '2027-03').steps[0].id, 'c:alex>J');
  // The total left over is the same either way here: the change only moves where it's kept.
  assert.deepEqual(P.projectedFloat(d, months, '2027-02', ['2027-02', '2027-03']).map(x => Math.round(x.float)), [3480, 3480]);
});

test('normFlows: anything unusable is taken out; sound changes pass through', () => {
  const c = household({ people: [{ id: 'alex' }, { id: 'sam' }], accounts: [acc('A')] });
  assert.deepEqual(P.normFlows([null, 3, { from: '2027-13', was: {} }, { from: '2027-03' }, { from: '2027-02', was: { accounts: { A: { leftoverTo: '' }, B: 'x', C: { leftoverTo: 'A', funding: { people: ['zed'], rule: 'equal' } } }, pay: { alex: 'A', sam: 5 } } },
    { from: '2027-02', was: { accounts: {}, pay: {} } }, { from: '2026-12', was: { accounts: {}, pay: {} } }], c),
  [{ from: '2026-12', was: { accounts: {}, pay: {} } }, { from: '2027-02', was: { accounts: { A: { leftoverTo: null }, C: { leftoverTo: 'A' } }, pay: { alex: 'A' } } }]);
  const n = P.normCfg(Object.assign(clone(c), { flows: [{ from: 'soon' }], accounts: [acc('A', { closedFrom: 'never' }), acc('B', { closedFrom: '2027-04' })] }));
  assert.equal('flows' in n, false); assert.equal('closedFrom' in n.accounts[0], false); assert.equal(n.accounts[1].closedFrom, '2027-04');
});

test('accountRoles: an existing household\'s accounts, as setup names them', () => {
  const r = P.accountRoles(pooled());
  assert.deepEqual(r, { A: 'own:alex', S: 'own:sam', J: 'joint' });
  const { c } = sampleUpgraded(false);
  const roles = P.accountRoles(c);
  assert.deepEqual(Object.values(roles).sort(), ['bills', 'own:' + c.people[0].id, 'own:' + c.people[1].id, 'spending'].sort());
  const one = household({ people: [{ id: 'p', payAccount: 'P' }], accounts: [acc('P', { leftoverTo: 'B' }), acc('B', { leftoverTo: 'S' }), acc('S')] });
  assert.deepEqual(P.accountRoles(one), { P: 'pay', B: 'bills', S: 'spending' });
  assert.deepEqual(P.accountRoles(household({ people: [{ id: 'p', payAccount: 'M' }], accounts: [acc('M')] })), { M: 'main' });
  assert.deepEqual(P.accountRoles(household({ people: [{ id: 'p', payAccount: 'B' }], accounts: [acc('B', { leftoverTo: 'S' }), acc('S')] })), { B: 'bills', S: 'spending' });
});

// ---------- fixes from the independent review ----------
test('Undo puts back names and colours the change set; normCfg keeps items and names', () => {
  const c = pooled();
  const d = P.applyChange(c, '2027-03', { accounts: [acc('A', { name: 'Alex own', colour: 'red' }), acc('S'), acc('J', { funding: { people: ['alex', 'sam'], rule: 'pay' } })], pay: { alex: 'A', sam: 'S' } }, {});
  assert.equal(d.accounts[0].name, 'Alex own');
  assert.deepEqual(d.flows[0].was.names, { A: { name: 'A', colour: 'blue' } });
  assert.deepEqual(P.normCfg(clone(d)), d);
  assert.deepEqual(P.removeLastChange(d), c);
});

test('A change that replaces a later one removes an account only that later one opened (when nothing uses it)', () => {
  const c = pooled();
  const later = P.applyChange(c, '2027-09', { accounts: [acc('A', { leftoverTo: 'J' }), acc('S', { leftoverTo: 'J' }), acc('J'), acc('POT')], pay: { alex: 'A', sam: 'S' } }, {});
  const earlier = P.applyChange(later, '2027-03', { accounts: [acc('A'), acc('S'), acc('J', { funding: { people: ['alex', 'sam'], rule: 'equal' } })], pay: { alex: 'A', sam: 'S' } }, {});
  assert.deepEqual(earlier.accounts.map(a => a.id), ['A', 'S', 'J']);
  assert.deepEqual(earlier.flows.map(f => f.from), ['2027-03']);
  // Kept when a saved month's one-off uses it.
  assert.ok(P.applyChange(later, '2027-03', { accounts: [acc('A'), acc('S'), acc('J')], pay: { alex: 'A', sam: 'S' } }, {}, ['POT']).accounts.some(a => a.id === 'POT'));
});

test('Moving an item twice: each month before each change has it where it was then', () => {
  const c = household({ people: [{ id: 'alex', name: 'Alex', payAccount: 'A' }], accounts: [acc('A', { leftoverTo: 'X' }), acc('X'), acc('Y'), acc('Z')], bills: [bill('rent', 100, 'X')] });
  const keep = ids => ({ accounts: ids.map(id => acc(id, id === 'A' ? { leftoverTo: ids[1] } : {})), pay: { alex: 'A' } });
  const d = P.applyChange(c, '2027-03', keep(['A', 'Y']), { X: 'Y' });
  const e = P.applyChange(d, '2027-09', keep(['A', 'Z']), { Y: 'Z' });
  assert.deepEqual(['2027-01', '2027-05', '2027-10'].map(k => P.cfgFor(e, k).bills[0].account), ['X', 'Y', 'Z']);
});

test('"By what\'s left" and "keep the same" follow a person\'s own accounts, not just the one pay arrives in', () => {
  // Alex's pay account passes what's left to Alex's bills account, which pays Alex's own £500 bill.
  const c = household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: 2000 }],
    accounts: [acc('A', { leftoverTo: 'X' }), acc('X'), acc('S'), acc('J', { funding: { people: ['alex', 'sam'], rule: 'sameLeft' } })],
    bills: [bill('rent', 1500, 'J'), bill('car', 500, 'X')],
  });
  const r = run(c, { alex: 3000, sam: 2000 });
  assert.deepEqual(contribs(r), { 'c:alex>J': 1000, 'c:sam>J': 500 });
  assert.deepEqual(floats(r), { X: 1500, S: 1500, J: 0 }, 'both keep the same');
  // An account someone else is paid into isn't "their own": Alex stops before it.
  const d = clone(c); d.people[1].payAccount = 'X'; d.accounts.find(a => a.id === 'S').leftoverTo = 'X';
  assert.equal(P.ownTop(d, d.people[0], 'J'), 'A');
});

test('setupShape "housekeeping": the bill payer never pays board', () => {
  const three = AS.concat([{ id: 'kit', name: 'Kit' }]);
  const sh = P.setupShape('housekeeping', three, { rule: 'equal', payer: 'kit', board: { kit: 300 } });
  assert.deepEqual(sh.accounts[2].funding, { people: ['alex', 'sam', 'kit'], rule: 'equal' });
});

// ---------- stage 4: dated bills, budgets, savings and income ----------
const NOV = '2026-11';
const hist = { '2026-09': { pay: { alex: 3000 }, done: {} }, '2026-10': { pay: {}, done: { 't:A>J': 100 } } };

test('hasHistory: months before this one with typed pay or a tick', () => {
  assert.equal(P.hasHistory(hist, NOV), true);
  assert.equal(P.hasHistory({ '2026-11': { pay: { alex: 3000 } } }, NOV), false, 'only this month');
  assert.equal(P.hasHistory({ '2026-10': { pay: { alex: 3000 }, payEstimated: { alex: true }, done: { x: false } } }, NOV), false, 'estimated pay and unticked');
  assert.equal(P.hasHistory({}, NOV), false);
});

test('dateEdit: a new price from this month; earlier months keep the old one; edits back drop it', () => {
  const c = pooled(), b = c.bills[0], before = P.itemSnap('bills', b);
  b.amount = 1600;
  assert.equal(P.dateEdit('bills', b, before, NOV), true);
  assert.deepEqual(b.was, [{ until: '2026-10', amount: 1500, account: 'J', months: [] }]);
  b.amount = 1650; P.dateEdit('bills', b, before, NOV);
  assert.equal(b.was.length, 1, 'several edits in one pay month: one entry, the value from before the first');
  assert.deepEqual(stepsOf(c, '2026-10'), [['t:A>J', 2980], ['t:S>J', 2000]]);
  assert.equal(P.cfgFor(c, '2026-10').bills[0].amount, 1500);
  assert.equal(P.cfgFor(c, NOV).bills[0].amount, 1650);
  b.amount = 1500; P.dateEdit('bills', b, before, NOV);
  assert.equal('was' in b, false, 'back to the old price: nothing dated');
  // A second change a few months later: each month gets the price it had.
  b.amount = 1600; P.dateEdit('bills', b, before, NOV);
  const b2 = P.itemSnap('bills', b); b.amount = 1700; P.dateEdit('bills', b, b2, '2027-03');
  assert.deepEqual(['2026-10', '2026-12', '2027-02', '2027-03'].map(k => P.cfgFor(c, k).bills[0].amount), [1500, 1600, 1600, 1700]);
  // "Change earlier months too" peels back the latest.
  P.undateLast(b);
  assert.deepEqual(['2026-10', '2027-02'].map(k => P.cfgFor(c, k).bills[0].amount), [1500, 1700]);
  assert.deepEqual(P.datedNow(b, NOV), b.was[0]); assert.equal(P.datedNow(b, '2027-03'), null);
});

test('dateEdit: account and months move from this month too; savings use fromAccount', () => {
  const c = pooled(), b = c.bills[1], before = P.itemSnap('bills', b);
  b.account = 'S'; b.months = [12]; P.dateEdit('bills', b, before, NOV);
  assert.deepEqual(stepsOf(c, '2026-10'), [['t:A>J', 2980], ['t:S>J', 2000]], 'October as it was');
  assert.deepEqual(P.cfgFor(c, '2027-01').bills.find(x => x.id === 'phone'), Object.assign({}, b), 'January: the new account, not due');
  const s = { id: 'sv', name: 'Pot', amount: 50, fromAccount: 'J' }; c.savings = [s];
  const sb = P.itemSnap('savings', s); s.fromAccount = 'A'; s.amount = 80; P.dateEdit('savings', s, sb, NOV);
  assert.deepEqual(s.was, [{ until: '2026-10', amount: 50, fromAccount: 'J' }]);
  assert.deepEqual(P.calcMonth(c, {}, '2026-10', PAY).steps.find(x => x.kind === 'save'), { id: 's:sv', kind: 'save', from: 'J', toText: 'Pot', amt: 50 });
});

test('start and ended: an item added this month isn\'t in earlier ones; a deleted one still is', () => {
  const c = pooled();
  c.budgets = [{ id: 'food', name: 'Food', amount: 400, account: 'J', start: NOV }];
  assert.deepEqual([P.cfgFor(c, '2026-10').budgets.length, P.cfgFor(c, NOV).budgets.length], [0, 1]);
  const gone = c.bills.splice(1, 1)[0]; P.endItem(c, 'bills', gone, NOV);
  assert.deepEqual(c.ended, { bills: [Object.assign({}, gone, { ended: NOV })] });
  assert.deepEqual(P.cfgFor(c, '2026-10').bills.map(b => b.id), ['rent', 'phone']);
  assert.deepEqual(P.cfgFor(c, NOV).bills.map(b => b.id), ['rent']);
  assert.deepEqual(P.allItems(c, 'bills').map(b => b.id), ['rent', 'phone']);
  P.unendItem(c, 'bills', 'phone'); assert.equal('ended' in c, false);
  // Ended in the same month it started: nothing to keep.
  P.endItem(c, 'budgets', c.budgets[0], NOV); assert.equal('ended' in c, false);
});

test('Saved so far counts a savings transfer ended since, and each month\'s amount', () => {
  const c = pooled(); c.savings = [];
  c.ended = { savings: [{ id: 'sv', name: 'Pot', amount: 80, fromAccount: 'J', ended: NOV, was: [{ until: '2026-09', amount: 50, fromAccount: 'J' }] }] };
  const m = { '2026-09': { pay: PAY, done: { 's:sv': true } }, '2026-10': { pay: PAY, done: { 's:sv': true } } };
  const it = P.savedSoFar(P.normCfg(c), m, NOV).items.find(x => x.id === 'sv');
  assert.equal(it.total, 130, '£50 in September and £80 in October');
});

test('normCfg: dated items and ended lists are checked; sound ones pass through; none means nothing added', () => {
  const c = pooled();
  c.bills[0].was = [{ until: '2026-10', amount: 1500, account: 'J', months: [] }]; c.bills[0].start = '2026-01';
  c.ended = { budgets: [{ id: 'g', name: 'Old', amount: 5, account: 'J', ended: '2026-11' }] };
  assert.deepEqual(P.normCfg(clone(c)), c);
  const bad = clone(c); bad.bills[0].was = [{ until: 'x' }, null, { until: '2026-08', amount: -3, account: 7, months: [13, 2] }]; bad.bills[0].start = 'soon';
  bad.ended = { budgets: [{ id: 'g', ended: 'no' }], bills: 'x', other: [{ id: 'z', ended: '2026-01' }] };
  const n = P.normCfg(bad);
  assert.deepEqual(n.bills[0].was, [{ until: '2026-08', amount: 1500, account: 'J', months: [2] }]);
  assert.equal('start' in n.bills[0], false); assert.equal('ended' in n, false);
  assert.equal(P.hasDated(pooled()), false); assert.equal(P.cfgFor(pooled(), NOV) !== null, true);
  const p = pooled(); assert.equal(P.cfgFor(p, NOV), p, 'nothing dated: the settings themselves');
});

// ---------- fixes from the review of stage 4 ----------
test('A dated move, then a change of style: each month has the account recorded nearest to it', () => {
  const c = pooled(); c.accounts.push(acc('X')); c.bills.push(bill('gym', 40, 'A'));
  const g = c.bills[2], before = P.itemSnap('bills', g);
  g.account = 'S'; P.dateEdit('bills', g, before, NOV); // November: the gym moves from A to S
  // A change from December closes S and moves its items to X.
  const d = P.applyChange(c, '2026-12', { accounts: [acc('A', { leftoverTo: 'J' }), acc('J'), acc('X')], pay: { alex: 'A', sam: 'J' } }, { S: 'X' });
  assert.deepEqual(['2026-10', NOV, '2026-12'].map(k => P.cfgFor(d, k).bills.find(b => b.id === 'gym').account), ['A', 'S', 'X']);
});

test('Undoing a change keeps an account that a deleted item or an earlier value still names', () => {
  const c = household({ people: [{ id: 'alex', name: 'Alex', payAccount: 'A' }], accounts: [acc('A', { leftoverTo: 'X' }), acc('X')], bills: [bill('b', 100, 'X')] });
  const d = P.applyChange(c, NOV, { accounts: [acc('A', { leftoverTo: 'N' }), acc('N')], pay: { alex: 'A' } }, { X: 'N' });
  const gone = d.bills.splice(0, 1)[0]; P.endItem(d, 'bills', gone, '2026-12');
  const u = P.removeLastChange(d);
  assert.deepEqual(u.accounts.map(a => a.id), ['A', 'X', 'N'], 'N is still named by the deleted bill');
  assert.ok(P.calc(P.cfgFor(u, NOV), 11, { alex: 1000 }, []).ok, 'November adds up');
});

test('endItem twice keeps one; allItems never lists an item twice', () => {
  const c = pooled(), b = c.bills[1];
  P.endItem(c, 'bills', b, NOV); P.endItem(c, 'bills', b, NOV);
  assert.equal(c.ended.bills.length, 1);
  c.ended.bills.push(Object.assign({}, b, { ended: '2026-12' }));
  assert.deepEqual(P.allItems(c, 'bills').map(x => x.id), ['rent', 'phone']);
});

test('normDated: an earlier entry with no months keeps the bill\'s own months', () => {
  const c = pooled(); c.bills[0].months = [3, 9]; c.bills[0].was = [{ until: '2026-10', amount: 10, account: 'J' }];
  assert.deepEqual(P.normCfg(c).bills[0].was[0].months, [3, 9]);
});
