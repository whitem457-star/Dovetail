// Unit tests for 2.12.1, fixes from the household simulation (tests/sim): set amounts worked out first, money a bill
// payer sends a partner kept out of the shared bills, board as money in, top-ups only from money that's there, where
// setup puts shared spending, savings and income, and the bill payer with set amounts. Made-up households only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, sampleUpgraded, household } from './load.mjs';

const acc = (id, o = {}) => Object.assign({ id, name: id, colour: 'blue', leftoverTo: null }, o);
const bill = (id, amount, account, o = {}) => Object.assign({ id, name: id, amount, account, months: [] }, o);
const floats = r => Object.fromEntries(r.floats.map(f => [f.id, Math.round(f.amt * 100) / 100]));
const run = (c, pay, m = 11) => { const r = P.calc(c, m, pay, []); assert.ok(r.ok, 'the figures reconcile'); return r; };
const named = (sh, n) => sh.accounts.find(a => a.name === n).id;

test('"So we each keep the same" is the same with one joint account or two, when an earner gives money to a partner with no pay', () => {
  const people = [{ id: 'a', name: 'Alex' }, { id: 's', name: 'Sam' }, { id: 'k', name: 'Kit' }], pay = { a: 3000, s: 0, k: 2000 }, keeps = [];
  for (const two of [false, true]) {
    const sh = P.setupShape('contribute', people, { rule: 'sameLeft', two, noPay: ['s'], gets: { s: 300 } });
    const c = household({ people: people.map(p => ({ ...p, payAccount: sh.payAccount[p.id], usualPay: pay[p.id] })), accounts: sh.accounts,
      bills: [bill('rent', 1200, named(sh, two ? 'Joint bills' : 'Joint account'))], budgets: [{ id: 'g', name: 'Food', amount: 30, account: named(sh, two ? 'Joint spending' : 'Joint account') }] });
    const f = floats(run(c, pay)); keeps.push([f[sh.payAccount.a], f[sh.payAccount.k]]);
  }
  assert.deepEqual(keeps, [[1735, 1735], [1735, 1735]]);
});

test('set amounts are worked out before shares, wherever the accounts sit', () => {
  const c = household({ people: [{ id: 'a', payAccount: 'A' }], accounts: [acc('A'), acc('S', { funding: { people: ['a'], rule: 'set', set: { a: { amount: 1 } } } }),
    acc('JB', { leftoverTo: 'JS', funding: { people: ['a'], rule: 'equal' } }), acc('JS')] });
  assert.deepEqual(P.fundedOrder(c, ['A', 'S', 'JB', 'JS'], id => id === 'JB' ? 1 : 0), ['S', 'JB']);
});

test('one of us pays the bills: money the payer sends a partner with no pay is theirs, not a bill to share', () => {
  // Alex pays the bills and gives Jo £400; Charlie shares the bills half each.
  const c = household({ people: [{ id: 'a', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'j', name: 'Jo', payAccount: 'J', usualPay: 0 }, { id: 'c', name: 'Charlie', payAccount: 'C', usualPay: 2000 }],
    accounts: [acc('A', { funding: { people: ['a', 'c'], rule: 'equal' } }), acc('J', { funding: { people: ['a'], rule: 'set', set: { a: { amount: 400 } } } }), acc('C')],
    bills: [bill('rent', 1000, 'A')] });
  const r = run(c, { a: 3000, j: 0, c: 2000 });
  assert.equal(r.steps.find(s => s.id === 'c:c>A').amt, 500, 'Charlie pays half the rent, not half the rent and Jo\'s money');
  assert.deepEqual(floats(r), { A: 2100, J: 400, C: 1500 });
  // So we each keep the same: Alex's £400 to Jo counts against Alex.
  c.accounts[0].funding.rule = 'sameLeft';
  const s = floats(run(c, { a: 3000, j: 0, c: 2000 }));
  assert.equal(s.A, s.C);
});

test('board: a boarder\'s own account is apart from the household; their board is money in', () => {
  const c = household({ people: [{ id: 'a', name: 'Alex', payAccount: 'J', usualPay: 3000 }, { id: 'k', name: 'Kit', payAccount: 'K', usualPay: 1500, boarder: true }],
    accounts: [acc('J', { funding: { people: ['k'], rule: 'set', set: { k: { amount: 300 } } } }), acc('K')],
    bills: [bill('rent', 1000, 'J'), bill('phone', 20, 'K')] });
  const r = run(c, { a: 3000, k: 1500 });
  assert.deepEqual(floats(r), { J: 2300 }, 'what the household has left');
  assert.deepEqual(r.outside.map(f => [f.id, f.amt]), [['K', 1180]], 'the boarder keeps the rest of theirs');
  assert.equal(r.t.board, 300); assert.equal(r.t.pay, 3000); assert.equal(r.t.bills, 1000); assert.equal(r.totalIn, 3300);
  // No pay typed for the boarder: the household still has their board, and only their own account is short.
  const n = run(c, { a: 3000, k: 0 });
  assert.equal(Math.round(n.flt * 100) / 100, 2300);
  assert.deepEqual(P.boarderAccounts(c), { K: true });
  assert.deepEqual(P.boarderAccounts(Object.assign({}, c, { people: c.people.map(p => ({ ...p, boarder: undefined })) })), {}, 'nobody boards: nothing apart');
});

test('board: normCfg keeps boarder only when true', () => {
  const c = P.normCfg({ people: [{ id: 'a', boarder: true }, { id: 'b', boarder: 'yes' }, { id: 'c', boarder: false }] });
  assert.deepEqual(c.people.map(p => p.boarder), [true, undefined, undefined]);
  assert.ok(!('boarder' in c.people[1]) && !('boarder' in c.people[2]));
});

test('top-ups: with shares, an account can only top up with money it has; the rest is a shortfall where it\'s needed', () => {
  // Set amounts into joint bills that don't cover them; joint spending has nothing of its own.
  const c = household({ people: [{ id: 'a', payAccount: 'A', usualPay: 3000 }, { id: 's', payAccount: 'S', usualPay: 2000 }],
    accounts: [acc('A'), acc('S'), acc('JB', { leftoverTo: 'JS', funding: { people: ['a', 's'], rule: 'set', set: { a: { amount: 500 }, s: { amount: 300 } } } }), acc('JS')],
    bills: [bill('rent', 1200, 'JB')], budgets: [{ id: 'g', name: 'Food', amount: 100, account: 'JS' }] });
  const r = run(c, { a: 3000, s: 2000 });
  assert.ok(!r.steps.some(s => s.kind === 'topup'), 'no top-up from an empty account');
  assert.deepEqual(r.cant.map(s => [s.from, s.to, s.short]), [['JS', 'JB', 400]]);
  assert.deepEqual(floats(r), { A: 2500, S: 1700, JB: -400, JS: -100 });
  // Part of it there: the top-up sends what there is.
  c.income = [{ id: 'i', name: 'Lodger', amount: 150, account: 'JS' }];
  const p = run(c, { a: 3000, s: 2000 }), t = p.steps.find(s => s.kind === 'topup');
  assert.deepEqual([t.amt, t.short], [150, 250]);
  assert.deepEqual(floats(p), { A: 2500, S: 1700, JB: -250, JS: -100 });
});

test('top-ups: without shares, as before whenever the money is there (the made-up household, every month)', () => {
  const { c, m } = sampleUpgraded();
  for (let mo = 1; mo <= 12; mo++) { const pay = {}; c.people.forEach(p => pay[p.id] = 2000);
    const r = P.calc(c, mo, pay, []); assert.ok(r.ok); assert.deepEqual(r.cant, []);
    assert.ok(r.steps.filter(s => s.kind === 'topup').every(s => !('short' in s))); }
  assert.ok(m);
});

test('top-ups only from money that\'s there, for every household (2.13): with almost no pay, a pooled household tops up with what there is', () => {
  const { c } = sampleUpgraded();
  for (let mo = 1; mo <= 12; mo++) { const pay = {}; c.people.forEach(p => pay[p.id] = 1);
    const r = P.calc(c, mo, pay, []); assert.ok(r.ok, 'the figures still reconcile');
    // £1 each can't cover the own accounts' bills, and Joint bills has only its other income to send.
    r.steps.filter(s => s.kind === 'topup').forEach(s => assert.ok(s.amt > 0 && s.short > 0, 'a top-up made only in part: ' + s.id));
    assert.ok(r.cant.every(s => s.short > 0));
    assert.ok(P.shortAccounts(r).some(x => x.topup), 'the account a top-up couldn\'t reach is named as short');
    assert.equal(P.r2(r.floats.reduce((t, f) => t + f.amt, 0)), P.r2(r.flt)); }
});

test('setup: shared spending, savings and income go to the shared account, never one person\'s or a boarder\'s', () => {
  const ppl = n => ['Alex', 'Sam', 'Kit'].slice(0, n).map((x, i) => ({ id: 'p' + i, name: x }));
  const cfgOf = (kind, n, opts = {}, boarder) => { const people = ppl(n), sh = P.setupShape(kind, people, opts);
    return { sh, c: { accounts: sh.accounts, people: people.map(p => Object.assign({ ...p, payAccount: sh.payAccount[p.id] }, p.id === boarder ? { boarder: true } : {})) } }; };
  const name = (sh, id) => (sh.accounts.find(a => a.id === id) || {}).name;
  const cases = [
    ['contribute', 2, {}, null, 'Joint account', 'Joint account'],
    ['contribute', 2, { two: true }, null, 'Joint spending', 'Joint bills'],
    ['housekeeping', 2, { payer: 'p1' }, null, "Sam's account", "Sam's account"],
    ['housekeeping', 2, { payer: 'p1', rule: 'set', set: { p0: 500 } }, null, "Sam's account", "Sam's account"],
    ['housekeeping', 2, { payer: 'p0', noPay: ['p1'], gets: { p1: 200 } }, null, "Alex's account", "Alex's account"],
    ['own', 3, { board: { p2: 300 } }, 'p2', 'Joint account', 'Joint account'],
    ['joint', 3, { board: { p2: 300 } }, 'p2', 'Joint account', 'Joint account'],
    ['split', 3, { board: { p2: 300 } }, 'p2', 'Joint spending', 'Joint bills'],
    ['separate', 2, {}, null, "Alex's account", "Alex's account"],
    ['own', 1, {}, null, 'Spending account', 'Spending account'],
    ['joint', 1, {}, null, 'Current account', 'Current account'],
  ];
  for (const [kind, n, opts, boarder, spend, inc] of cases) { const { sh, c } = cfgOf(kind, n, opts, boarder);
    assert.equal(name(sh, P.sharedSpendAccount(c)), spend, kind + ' ' + JSON.stringify(opts) + ': spending');
    assert.equal(name(sh, P.sharedInAccount(c)), inc, kind + ' ' + JSON.stringify(opts) + ': income'); }
});

test('setup: with set amounts, the bill payer has none of their own and pays what their account needs', () => {
  const people = [{ id: 'a', name: 'Alex' }, { id: 's', name: 'Sam' }];
  const sh = P.setupShape('housekeeping', people, { payer: 's', rule: 'set', set: { a: 800, s: 500 } }), f = sh.accounts.find(a => a.id === sh.payAccount.s).funding;
  assert.deepEqual(f.set, { a: { amount: 800 } });
  const c = { accounts: sh.accounts, people: people.map(p => ({ ...p, payAccount: sh.payAccount[p.id] })) };
  assert.equal(P.fundingWords(f, P.fundingPeople(c, sh.payAccount.s), 'it', sh.payAccount.s), 'Sam pays what it needs. Alex pays a set amount into it.');
});

test('Settings: equal shares with someone who has no usual pay say what would happen', () => {
  const c = household({ people: [{ id: 'a', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 's', name: 'Sam', payAccount: 'S', usualPay: 0 }],
    accounts: [acc('A'), acc('S', { funding: { people: ['a', 's'], rule: 'equal' } })] });
  assert.equal(P.fundingProblem(c, 'S'), 'Sam has no usual pay, so an equal share would leave this account short. In proportion to usual pay leaves them out.');
  c.accounts[1].funding.rule = 'pay'; assert.equal(P.fundingProblem(c, 'S'), null);
});

test('Analysis, the monthly picture: a boarder\'s pay and bills are theirs; their board is income', () => {
  const c = household({ people: [{ id: 'a', name: 'Alex', payAccount: 'J', usualPay: 3000 }, { id: 'k', name: 'Kit', payAccount: 'K', usualPay: 1500, boarder: true }],
    accounts: [acc('J', { funding: { people: ['k'], rule: 'set', set: { k: { amount: 300 } } } }), acc('K')],
    bills: [bill('rent', 1000, 'J'), bill('phone', 20, 'K')], budgets: [{ id: 'g', name: 'Food', amount: 400, account: 'J' }] });
  const pic = P.monthlyPicture(c, {}, '2026-11');
  assert.deepEqual([pic.income, pic.incomeDetail.board, pic.incomeDetail.people.map(p => p.name), pic.bills, pic.float], [3300, 300, ['Alex'], 1000, 1900]);
  // The same household without the flag: as before 2.12.1.
  c.people[1].boarder = undefined;
  const old = P.monthlyPicture(P.normCfg(c), {}, '2026-11');
  assert.deepEqual([old.income, old.incomeDetail.board, old.bills], [4500, 0, 1020]);
});

// Three adults each paying into a joint account; from a month, Kit pays board instead.
function threeAdults() {
  return household({ people: [{ id: 'a', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 's', name: 'Sam', payAccount: 'S', usualPay: 2000 }, { id: 'k', name: 'Kit', payAccount: 'K', usualPay: 1500 }],
    accounts: [acc('A'), acc('S'), acc('K'), acc('J', { funding: { people: ['a', 's', 'k'], rule: 'equal' } })], bills: [bill('rent', 1500, 'J')] });
}
const kitBoards = c => ({ accounts: c.accounts.map(a => a.id === 'J' ? { ...a, funding: { people: ['a', 's', 'k'], rule: 'equal', set: { k: { amount: 300 } } } } : a), pay: { a: 'A', s: 'S', k: 'K' }, boarders: { s: false, k: true } });

test('a change of style that makes someone a boarder applies from its month; earlier months and Undo keep who boarded before', () => {
  const c = threeAdults(), ch = P.applyChange(c, '2026-12', kitBoards(c), {}, []);
  assert.equal(ch.people[2].boarder, true);
  assert.deepEqual(ch.flows[0].was.boarders, [], 'nobody boarded before');
  const nov = P.calc(P.cfgFor(ch, '2026-11'), 11, { a: 3000, s: 2000, k: 1500 }, []), dec = P.calc(P.cfgFor(ch, '2026-12'), 12, { a: 3000, s: 2000, k: 1500 }, []);
  assert.equal(Math.round(nov.flt), 5000, 'November: everyone\'s money, as before the change');
  assert.deepEqual(dec.outside.map(f => f.id), ['K'], 'December: Kit\'s own money is apart');
  const undone = P.removeLastChange(ch, []);
  assert.ok(!('boarder' in undone.people[2]), 'Undo puts the flag back');
  // A change that doesn't ask about board leaves the flags alone.
  const two = household({ people: [{ id: 'a', payAccount: 'A' }, { id: 'k', payAccount: 'K', boarder: true }], accounts: [acc('A'), acc('K')] });
  assert.equal(P.applyChange(two, '2026-12', { accounts: two.accounts, pay: { a: 'A', k: 'K' } }, {}, []).people[1].boarder, true);
  // normFlows keeps the list, people in the household only.
  assert.deepEqual(P.normCfg(Object.assign({}, ch, { flows: [{ from: '2026-12', was: Object.assign({}, ch.flows[0].was, { boarders: ['k', 'nobody', 'k'] }) }] })).flows[0].was.boarders, ['k']);
});

test('board: an account others pay into (the bill payer\'s) is never a boarder\'s, even if ticked', () => {
  const c = household({ people: [{ id: 'a', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 's', name: 'Sam', payAccount: 'S', usualPay: 2000, boarder: true }],
    accounts: [acc('A'), acc('S', { funding: { people: ['a', 's'], rule: 'equal' } })], bills: [bill('rent', 1500, 'S')] });
  assert.deepEqual(P.boarderAccounts(c), {});
  const r = run(c, { a: 3000, s: 2000 });
  assert.equal(Math.round(r.flt), 3500); assert.equal(r.t.bills, 1500);
});

test('Analysis: board paid as a share counts the same as on the Pay tab; a boarder\'s bills aren\'t the household\'s', () => {
  const c = household({ people: [{ id: 'a', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'k', name: 'Kit', payAccount: 'K', usualPay: 1000, boarder: true }],
    accounts: [acc('A'), acc('K'), acc('J', { funding: { people: ['a', 'k'], rule: 'pay' } })], bills: [bill('rent', 2400, 'J'), bill('phone', 30, 'K')] });
  const r = run(c, { a: 3000, k: 1000 }), pic = P.monthlyPicture(c, {}, '2026-11');
  assert.equal(r.t.board, 600);
  assert.equal(pic.incomeDetail.board, 600);
  assert.equal(Math.round(pic.float), Math.round(r.flt));
  assert.equal(P.monthOutgoings(c, {}, '2026-11').bills, 2400);
});
