// Unit tests for the 2.6 setup helpers: the four starting points for accounts (setupShape), flow order and the plain
// sentences under the setup diagram, a bill's months from "How often" (billMonths), the "Finish setting up" checklist
// (setupChecklist), the first-month hint (firstMonthDone) and the two new optional settings in normCfg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, household, sampleUpgraded } from './load.mjs';

const ONE = [{ id: 'alex', name: 'Alex' }];
const TWO = [{ id: 'alex', name: 'Alex' }, { id: 'sam', name: 'Sam' }];
/** The shape as a household: names in order, each one's leftover target by name (null: keeps what's left). */
function describe(sh, people) {
  const c = { accounts: sh.accounts, people: people.map(p => ({ ...p, payAccount: sh.payAccount[p.id] })) };
  const name = id => (P.accById(c, id) || {}).name;
  return { c, names: sh.accounts.map(a => a.name), to: sh.accounts.map(a => name(P.parentId(c, a.id)) || null), pay: people.map(p => name(sh.payAccount[p.id])) };
}
/** Every shape is a proper household: unique ids, colours in order, no loops, exactly one account keeps what's left,
    everything reaches it, and accounts are listed in flow order (each one before the account it sends to). */
function wellFormed(sh, people, label) {
  const { c } = describe(sh, people), ids = sh.accounts.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, label + ': unique ids');
  assert.deepEqual(sh.accounts.map(a => a.colour), P.COLOURS.slice(0, ids.length).map(x => x[0]), label + ': colours in order');
  const roots = P.rootIds(c);
  assert.equal(roots.length, 1, label + ': one account keeps what\'s left');
  assert.equal(roots[0], ids[ids.length - 1], label + ': and it is the last one');
  assert.deepEqual(P.descendants(c, roots[0]).sort(), ids.slice(0, -1).sort(), label + ': every other account reaches it');
  sh.accounts.forEach((a, i) => {
    assert.equal(P.descendants(c, a.id).includes(a.id), false, label + ': no loop through ' + a.name);
    const par = P.parentId(c, a.id);
    if (par) assert.ok(ids.indexOf(par) > i, label + ': ' + a.name + ' comes before the account it sends to');
    assert.equal(a.leftoverTo, par, label + ': leftoverTo is a real account');
  });
  assert.deepEqual(P.flowOrder(c), ids, label + ': already in flow order');
  people.forEach(p => assert.ok(ids.includes(sh.payAccount[p.id]), label + ': ' + p.name + ' is paid into an account'));
}

test('setupShape: one joint account', () => {
  const two = describe(P.setupShape('joint', TWO), TWO), one = describe(P.setupShape('joint', ONE), ONE);
  assert.deepEqual([two.names, two.to, two.pay], [['Joint account'], [null], ['Joint account', 'Joint account']]);
  assert.deepEqual([one.names, one.to, one.pay], [['Current account'], [null], ['Current account']]);
});

test('setupShape: own accounts, then a joint one', () => {
  const two = describe(P.setupShape('own', TWO), TWO), one = describe(P.setupShape('own', ONE), ONE);
  assert.deepEqual(two.names, ["Alex's account", "Sam's account", 'Joint account']);
  assert.deepEqual(two.to, ['Joint account', 'Joint account', null]);
  assert.deepEqual(two.pay, ["Alex's account", "Sam's account"]);
  assert.deepEqual([one.names, one.to, one.pay], [['Bills account', 'Spending account'], ['Spending account', null], ['Bills account']]);
});

test('setupShape: separate accounts for bills and spending (the example household\'s shape)', () => {
  const two = describe(P.setupShape('split', TWO), TWO), one = describe(P.setupShape('split', ONE), ONE);
  assert.deepEqual(two.names, ["Alex's account", "Sam's account", 'Joint bills', 'Joint spending']);
  assert.deepEqual(two.to, ['Joint bills', 'Joint bills', 'Joint spending', null]);
  assert.deepEqual(two.pay, ["Alex's account", "Sam's account"]);
  assert.deepEqual(one.names, ['Pay account', 'Bills account', 'Spending account']);
  assert.deepEqual(one.to, ['Bills account', 'Spending account', null]);
  assert.deepEqual(one.pay, ['Pay account']);
});

test('setupShape: something else starts with one account', () => {
  const two = describe(P.setupShape('other', TWO), TWO), one = describe(P.setupShape('other', ONE), ONE);
  assert.deepEqual([two.names, two.pay], [['Joint account'], ['Joint account', 'Joint account']]);
  assert.deepEqual([one.names, one.pay], [['Current account'], ['Current account']]);
});

test('setupShape: each account has a role that stays the same when the starting point is filled in again', () => {
  const roles = (kind, people) => P.setupShape(kind, people).accounts.map(a => a.role);
  assert.deepEqual(roles('joint', ONE), ['main']);
  assert.deepEqual(roles('joint', TWO), ['joint']);
  assert.deepEqual(roles('own', ONE), ['bills', 'spending']);
  assert.deepEqual(roles('own', TWO), ['own:alex', 'own:sam', 'joint']);
  assert.deepEqual(roles('split', ONE), ['pay', 'bills', 'spending']);
  assert.deepEqual(roles('split', TWO), ['own:alex', 'own:sam', 'bills', 'spending']);
  assert.deepEqual(roles('other', ONE), ['main']);
  assert.deepEqual(roles('other', TWO), ['joint']);
  const THREE = TWO.concat([{ id: 'kim', name: 'Kim' }]);
  assert.deepEqual(roles('split', THREE), ['own:alex', 'own:sam', 'own:kim', 'bills', 'spending'], 'a third person adds one role; the others are the same');
  for (const kind of P.SETUP_SHAPES) for (const people of [ONE, TWO, THREE]) { const r = roles(kind, people); assert.equal(new Set(r).size, r.length, kind + ': roles are unique'); }
});

test('defaultBillAccount: where bills are paid from, for each starting point, one person and two', () => {
  const name = (kind, people) => { const sh = P.setupShape(kind, people), c = { accounts: sh.accounts, people: people.map(p => ({ ...p, payAccount: sh.payAccount[p.id] })) };
    return [P.accById(c, P.defaultBillAccount(c)).name, (P.accById(c, P.sharedPayAccount(c)) || {}).name || null]; };
  assert.deepEqual(name('joint', ONE), ['Current account', null]);
  assert.deepEqual(name('own', ONE), ['Bills account', 'Bills account'], 'one person, bills then spending: the bills account (Pat is paid into it)');
  assert.deepEqual(name('split', ONE), ['Bills account', 'Pay account'], 'an account nobody is paid into comes first');
  assert.deepEqual(name('other', ONE), ['Current account', null]);
  assert.deepEqual(name('joint', TWO), ['Joint account', null]);
  assert.deepEqual(name('own', TWO), ['Joint account', null], 'two people with their own accounts: the joint account, not one person\'s');
  assert.deepEqual(name('split', TWO), ['Joint bills', null]);
  assert.deepEqual(name('other', TWO), ['Joint account', null]);
  // Unchanged for existing households: our 1.4 household's bills come from Joint bills account.
  assert.equal(P.defaultBillAccount(sampleUpgraded().c), 'jbills');
  assert.equal(P.defaultBillAccount(household({ accounts: [] })), '', 'no accounts');
  // Nobody paid in anywhere: the first account nobody is paid into
  assert.equal(P.defaultBillAccount(household({ accounts: [{ id: 'm', name: 'Main' }, { id: 's', name: 'Savings', leftoverTo: 'm' }] })), 's');
});

test('setupShape: every kind, for one, two and three people, is a well-formed household', () => {
  const THREE = TWO.concat([{ id: 'kim', name: '' }]);
  for (const kind of P.SETUP_SHAPES) for (const people of [ONE, TWO, THREE]) wellFormed(P.setupShape(kind, people), people, kind + ' × ' + people.length);
  assert.deepEqual(describe(P.setupShape('own', THREE), THREE).names[2], "Person 3's account", 'an empty name becomes "Person 3"');
  assert.notEqual(P.setupShape('joint', ONE).accounts[0].id, P.setupShape('joint', ONE).accounts[0].id, 'fresh ids each time');
});

test('setupShape: the transfers work out as expected for the bills-and-spending shape', () => {
  const sh = P.setupShape('split', TWO), [a, s, bills, spend] = sh.accounts.map(x => x.id);
  const c = household({ accounts: sh.accounts, people: TWO.map(p => ({ ...p, payAccount: sh.payAccount[p.id] })),
    bills: [{ name: 'Mobile', amount: 18, account: a, months: [] }, { name: 'Mortgage', amount: 900, account: bills, months: [] }],
    budgets: [{ name: 'Food shopping', amount: 400, account: spend }] });
  const r = P.calc(c, 11, { alex: 2000, sam: 1800 }, []);
  assert.deepEqual(r.steps.map(x => [x.from, x.to, P.r2(x.amt)]), [[a, bills, 1982], [s, bills, 1800], [bills, spend, 2882]]);
  assert.equal(P.r2(r.flt), 2482);
  assert.ok(r.ok);
});

test('flowOrder: furthest from the account that keeps what\'s left first, ties in list order', () => {
  const c = household({ accounts: [{ id: 'spend', leftoverTo: null }, { id: 'bills', leftoverTo: 'spend' }, { id: 'a', leftoverTo: 'bills' }, { id: 'b', leftoverTo: 'bills' }, { id: 'pot', leftoverTo: null }] });
  assert.deepEqual(P.flowOrder(c), ['a', 'b', 'bills', 'spend', 'pot']);
  // a loop counts as "keeps its leftover", as everywhere else
  const loop = household({ accounts: [{ id: 'x', leftoverTo: 'y' }, { id: 'y', leftoverTo: 'x' }] });
  assert.deepEqual(P.flowOrder(loop).sort(), ['x', 'y']);
});

test('flowStory: a plain sentence for each account, in flow order', () => {
  const sh = P.setupShape('split', TWO);
  const c = { accounts: sh.accounts, people: TWO.map(p => ({ ...p, payAccount: sh.payAccount[p.id] })), income: [{ id: 'i', name: 'Child Benefit', amount: 110, account: sh.accounts[3].id }] };
  assert.deepEqual(P.flowStory(c).map(x => x.text), [
    "Alex's pay arrives in Alex's account. What's left moves to Joint bills.",
    "Sam's pay arrives in Sam's account. What's left moves to Joint bills.",
    "Joint bills gets what's left from Alex's account and Sam's account. What's left moves to Joint spending.",
    "Child Benefit arrives in Joint spending. It also gets what's left from Joint bills. It keeps what's left: your left over."]);
  const j = P.setupShape('joint', TWO), cj = { accounts: j.accounts, people: TWO.map(p => ({ ...p, payAccount: j.payAccount[p.id] })) };
  assert.equal(P.flowStory(cj)[0].text, "Alex's pay and Sam's pay arrive in Joint account. It keeps what's left: your left over.");
  const lone = household({ accounts: [{ id: 'm', name: 'Main' }, { id: 's', name: 'Savings', leftoverTo: 'm' }] });
  assert.equal(P.flowStory(lone)[0].text, "Nothing arrives in Savings yet. What's left moves to Main.");
  assert.equal(P.listAnd(['A', 'B', 'C']), 'A, B and C');
});

test('billMonths: every month, once a year, some months', () => {
  assert.deepEqual(P.billMonths('monthly'), []);
  assert.deepEqual(P.billMonths('monthly', 3, [1, 2]), [], 'month and picks are ignored for every month');
  assert.deepEqual(P.billMonths(undefined), [], 'no choice means every month');
  assert.deepEqual(P.billMonths('yearly', 6), [6]);
  assert.deepEqual(P.billMonths('yearly', '11'), [11], 'a month from a select (text)');
  assert.equal(P.billMonths('yearly', ''), null, 'once a year needs a month');
  assert.equal(P.billMonths('yearly', 13), null);
  assert.deepEqual(P.billMonths('some', null, [1, 12, 4, 5, 6, 7, 8, 9, 10, 11]), [1, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'Council Tax: April to January, sorted');
  assert.deepEqual(P.billMonths('some', null, ['3', 3, 9]), [3, 9], 'duplicates and text');
  assert.deepEqual(P.billMonths('some', null, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), [], 'all twelve is every month');
  assert.equal(P.billMonths('some', null, []), null, 'none picked can\'t be saved');
  assert.equal(P.billMonths('some', null, [0, 13]), null);
  // what applies() makes of them
  assert.ok(P.applies({ months: P.billMonths('yearly', 6) }, 6) && !P.applies({ months: P.billMonths('yearly', 6) }, 7));
});

test('setupChecklist: each item done and not done', () => {
  const keys = c => P.setupChecklist(c, {}).map(x => x.key + ':' + x.done).join(' ');
  const base = household({ people: [{ id: 'a', name: 'A', usualPay: 0 }, { id: 'b', name: 'B', usualPay: 1500 }], accounts: [{ id: 'x', name: 'X' }] });
  assert.equal(keys(base), 'pay:false payday:false bills:false budgets:false');
  assert.deepEqual(P.setupChecklist(base, {}).map(x => x.label), ['Add your take-home pay', 'Set your payday', 'Add your bills', 'Add spending budgets or savings']);
  // pay: every person needs usual pay or a typed figure
  assert.equal(P.setupChecklist(base, { '2026-11': { pay: { a: 2100 } } })[0].done, true, 'A typed pay, B has usual pay');
  assert.equal(P.setupChecklist(base, { '2026-11': { pay: { a: null, b: 1500 } } })[0].done, false, 'an empty pay box isn\'t typed pay');
  assert.equal(P.setupChecklist({ ...base, people: [] }, {})[0].done, false, 'nobody yet');
  assert.equal(keys({ ...base, payday: { day: 'last' } }).includes('payday:true'), true);
  assert.equal(keys({ ...base, payday: { day: 28, weekend: true } }).includes('payday:true'), true);
  assert.equal(keys({ ...base, bills: [{ name: 'Rent', amount: 800 }] }).includes('bills:true'), true);
  assert.equal(keys({ ...base, budgets: [{ name: 'Food', amount: 300 }] }).includes('budgets:true'), true);
  assert.equal(keys({ ...base, savings: [{ name: 'Rainy day', amount: 50 }] }).includes('budgets:true'), true);
  const full = { ...base, people: [{ id: 'b', usualPay: 1500 }], payday: { day: 1 }, bills: [{}], savings: [{}] };
  assert.ok(P.setupChecklist(full, {}).every(x => x.done));
  assert.equal(keys(sampleUpgraded().c), 'pay:true payday:false bills:true budgets:true', 'a 1.x household: everything but a payday');
});

test('firstMonthDone: a month with every transfer ticked (November on screen)', () => {
  const K = '2026-11';
  assert.equal(P.firstMonthDone({}, K), false);
  assert.equal(P.firstMonthDone({ '2026-11': { done: { 't:a>b': 10 }, results: { steps: { 't:a>b': 10, 's:x': 50 } } } }, K), false, 'one of two ticked');
  assert.equal(P.firstMonthDone({ '2026-11': { done: { 't:a>b': 10, 's:x': false }, results: { steps: { 't:a>b': 10, 's:x': 50 } } } }, K), false, 'unticked');
  assert.equal(P.firstMonthDone({ '2026-10': { done: {}, results: { steps: {} } }, '2026-11': { done: { 't:a>b': 10, 's:x': 50 }, results: { steps: { 't:a>b': 10, 's:x': 50 } } } }, K), true);
  assert.equal(P.firstMonthDone({ '2026-11': { done: {}, results: { steps: {} } } }, K), false, 'a month with no transfers doesn\'t count');
  assert.equal(P.firstMonthDone({ '2026-11': { pay: { a: 1 } } }, K), false, 'nothing ticked');
  assert.equal(P.firstMonthDone({ '2026-11': { done: { 't:a>b': 10 } } }, K), true, 'a month saved before results were kept: any tick counts');
  assert.equal(P.firstMonthDone({ '2026-11': { done: { 't:a>b': false } } }, K), false, '…but not an untick');
  assert.equal(P.firstMonthDone(sampleUpgraded().m, K), true, 'a 1.x household has ticked months');
  assert.equal(P.firstMonthDone(sampleUpgraded().m, '2026-12'), true, '…whichever month is on screen');
});

test('firstMonthDone: any other month used before (a tick or typed pay) also counts', () => {
  const part = { done: { 't:a>b': 1100 }, results: { steps: { 't:a>b': 1100, 's:x': 100 } } };
  // A 2.5 household that ticks the main transfer each month but not the savings transfer
  assert.equal(P.firstMonthDone({ '2026-08': part, '2026-09': part }, '2026-10'), true, 'ticks in earlier months');
  assert.equal(P.firstMonthDone({ '2026-11': part }, '2026-10'), true, 'a tick in a later month counts too');
  assert.equal(P.firstMonthDone({ '2026-09': { pay: { a: 2000 }, done: {} } }, '2026-10'), true, 'pay typed in another month');
  // …but not the month on screen, which is the new household's first
  assert.equal(P.firstMonthDone({ '2026-10': part }, '2026-10'), false, 'a tick in the month on screen');
  assert.equal(P.firstMonthDone({ '2026-10': { pay: { a: 2000 }, done: {} } }, '2026-10'), false, 'pay typed in the month on screen');
  // …and not an empty month, an empty pay box or an untick
  assert.equal(P.firstMonthDone({ '2026-09': { pay: { a: null }, done: { 't:a>b': false }, oneOffs: [] } }, '2026-10'), false, 'nothing used in September');
  assert.equal(P.firstMonthDone({ '2026-09': { oneOffs: [{ id: 'o', kind: 'out', amount: 5 }] } }, '2026-10'), false, 'only a one-off planned');
});

test('normCfg: setupTips missing means off, tourDone missing means already seen; nothing is added to old settings', () => {
  const c = P.normCfg({});
  assert.equal('setupTips' in c || 'tourDone' in c, false, 'neither is added');
  assert.equal(c.setupTips === true, false, 'no checklist');
  assert.equal(c.tourDone === false, false, 'no tour');
  const n = P.normCfg({ setupTips: true, tourDone: false });
  assert.equal(n.setupTips, true);
  assert.equal(n.tourDone, false);
  const odd = P.normCfg({ setupTips: 'yes', tourDone: 0 });
  assert.equal('setupTips' in odd || 'tourDone' in odd, false, 'only true turns the card on, only false starts the tour');
  const done = P.normCfg({ setupTips: false, tourDone: true });
  assert.equal('setupTips' in done || 'tourDone' in done, false, 'finished with: dropped');
  const u = sampleUpgraded().c;
  assert.equal('setupTips' in u || 'tourDone' in u, false, 'an existing household sees neither, and its settings don\'t change');
});

test('nextPayday: the next payday on or after today, and the pay month it pays for', () => {
  assert.equal(P.nextPayday({}, '2026-10-15'), null, 'no payday');
  assert.deepEqual(P.nextPayday({ day: 28, weekend: true }, '2026-10-15'), { date: '2026-10-28', month: '2026-11' }, 'the 28th pays for the month after');
  assert.deepEqual(P.nextPayday({ day: 28, weekend: true }, '2026-10-28'), { date: '2026-10-28', month: '2026-11' }, 'payday itself counts');
  assert.deepEqual(P.nextPayday({ day: 28, weekend: true }, '2026-10-29'), { date: '2026-11-27', month: '2026-12' }, '28 November 2026 is a Saturday: the Friday before');
  assert.deepEqual(P.nextPayday({ day: 1, weekend: false }, '2026-10-15'), { date: '2026-11-01', month: '2026-11' }, 'the 1st pays for its own month');
  assert.deepEqual(P.nextPayday({ day: 1 }, '2026-10-15'), { date: '2026-10-30', month: '2026-11' }, '…paid on Friday 30 October when the 1st is a Sunday');
  assert.deepEqual(P.nextPayday({ day: 'last' }, '2026-10-15'), { date: '2026-10-30', month: '2026-11' }, 'last working day: Friday 30 October');
  assert.deepEqual(P.nextPayday({ day: 1, weekend: true }, '2026-10-31'), { date: '2026-12-01', month: '2026-12' }, '1 November is a Sunday, so it was paid on Friday 30 October: the next is December');
  // The month it gives is never before the month the app opens on.
  for (const day of [1, 10, 15, 20, 28, 31, 'last']) for (const t of ['2026-01-31', '2026-02-27', '2026-10-15', '2026-12-24']) {
    const nx = P.nextPayday({ day, weekend: true }, t);
    assert.ok(nx.date >= t && nx.month >= P.defaultMonth({ day, weekend: true }, t), day + ' on ' + t);
  }
});
