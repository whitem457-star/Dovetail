// Unit tests for 2.13: the fixes that using the app found (setup, the change of style, wording helpers). Made-up
// households only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, sampleUpgraded, household } from './load.mjs';

const acc = (id, o = {}) => Object.assign({ id, name: id, colour: 'blue', leftoverTo: null }, o);

// ---------- matchAccounts: a change of style keeps the household's accounts ----------
/** What a change to these answers keeps, opens and closes, worked out as "Change how you manage your money" does:
    the household's own accounts and their roles, never the previous answer's list. */
function change(c, kind, opts = {}) {
  const roles = P.accountRoles(c), people = c.people.map((p, i) => ({ id: p.id, name: P.personName(p, i), payAccount: p.payAccount }));
  const sh = P.setupShape(kind, people, opts), m = P.matchAccounts(roles, sh.accounts);
  const live = c.accounts.filter(a => !a.closedFrom).map(a => a.id), kept = sh.accounts.map(a => m[a.id]).filter(Boolean);
  return { sh, m, kept: kept.slice().sort(), opens: sh.accounts.filter(a => !m[a.id]).map(a => a.role), closes: live.filter(id => kept.indexOf(id) < 0).sort() };
}

test('matchAccounts: the same role first, then a stand-in; each account used once', () => {
  const roles = { A: 'own:alex', S: 'own:sam', J: 'joint' };
  const shape = [{ id: 'x1', role: 'own:alex' }, { id: 'x2', role: 'own:sam' }, { id: 'x3', role: 'bills' }, { id: 'x4', role: 'spending' }];
  assert.deepEqual(P.matchAccounts(roles, shape), { x1: 'A', x2: 'S', x3: 'J' }, 'the joint account stands in for joint bills; joint spending is new');
  assert.deepEqual(P.matchAccounts({ B: 'bills', SP: 'spending' }, [{ id: 'y', role: 'joint' }]), { y: 'B' });
  assert.deepEqual(P.matchAccounts({}, shape), {});
});

test('the made-up 1.x household changing to "each paying into a joint account", separate accounts, keeps both by id and name, moves nothing', () => {
  const { c } = sampleUpgraded(false);
  const x = change(c, 'contribute', { two: true, rule: 'pay' });
  assert.deepEqual(x.closes, [], 'nothing closes');
  assert.deepEqual(x.opens, [], 'nothing opens');
  const next = { accounts: x.sh.accounts.map(a => ({ id: x.m[a.id], name: P.accById(c, x.m[a.id]).name, colour: a.colour, leftoverTo: a.leftoverTo ? x.m[a.leftoverTo] : null, funding: a.funding })), pay: {} };
  c.people.forEach(p => { next.pay[p.id] = x.m[x.sh.payAccount[p.id]]; });
  const out = P.applyChange(c, '2026-12', next, {}, []);
  assert.deepEqual(out.accounts.map(a => [a.id, a.name, a.closedFrom || '']), c.accounts.map(a => [a.id, a.name, '']), 'the same four accounts, none closed');
  assert.deepEqual(out.budgets.map(b => b.account), c.budgets.map(b => b.account), 'budgets stay in Joint spending account');
  assert.deepEqual(out.savings.map(b => b.fromAccount), c.savings.map(b => b.fromAccount));
  assert.deepEqual(out.income.map(b => b.account), c.income.map(b => b.account));
  assert.equal(out.flows[0].was.items, undefined, 'no item moved');
  assert.ok(out.accounts.find(a => a.id === 'jspend').funding, 'Joint spending account is shared into');
});

test('the result doesn\'t depend on the order of the answers', () => {
  const { c } = sampleUpgraded(false);
  const answers = [['contribute', { two: false }], ['contribute', { two: true }], ['pool:split', {}], ['housekeeping', { payer: 'sam' }], ['pool:own', {}], ['separate', {}]];
  const run = (kind, o) => change(c, kind.replace('pool:', ''), o);
  const alone = answers.map(([k, o]) => run(k, o));
  // Every order of the answers ends with the same result as the last answer given on its own.
  for (let i = 0; i < 20; i++) {
    const order = answers.slice().sort(() => Math.random() - 0.5);
    let last = null; order.forEach(([k, o]) => { last = run(k, o); });
    const want = alone[answers.indexOf(order[order.length - 1])];
    assert.deepEqual([last.kept, last.closes, last.opens], [want.kept, want.closes, want.opens]);
  }
  // Back to two joint accounts after one: both kept again.
  assert.deepEqual(alone[1].closes, []);
  assert.deepEqual(alone[0].closes, ['jspend'], 'one joint account: the spending account is the one left out');
});

test('choosing the household\'s current arrangement closes nothing and opens nothing', () => {
  const { c } = sampleUpgraded(false);
  let x = change(c, 'split');
  assert.deepEqual([x.closes, x.opens], [[], []], 'own accounts, then joint bills, then joint spending');
  const joint = household({ people: [{ id: 'alex', name: 'Alex', payAccount: 'A' }, { id: 'sam', name: 'Sam', payAccount: 'S' }],
    accounts: [acc('A'), acc('S'), acc('J', { funding: { people: ['alex', 'sam'], rule: 'equal' } })] });
  x = change(joint, 'contribute', { two: false });
  assert.deepEqual([x.closes, x.opens], [[], []], 'each paying into one joint account');
  const solo = household({ people: [{ id: 'jo', name: 'Jo', payAccount: 'B' }], accounts: [acc('B', { leftoverTo: 'SP' }), acc('SP')] });
  x = change(solo, 'own');
  assert.deepEqual([x.closes, x.opens], [[], []], 'one person: bills account, then spending account');
  const hk = household({ people: [{ id: 'alex', name: 'Alex', payAccount: 'A' }, { id: 'sam', name: 'Sam', payAccount: 'S' }],
    accounts: [acc('A', { funding: { people: ['alex', 'sam'], rule: 'pay' } }), acc('S')] });
  x = change(hk, 'housekeeping', { payer: 'alex' });
  assert.deepEqual([x.closes, x.opens], [[], []], 'one of us paying the bills');
});

// ---------- setupExample: the worked example matches the diagram ----------
const two = [{ id: 'alex', name: 'Alex' }, { id: 'sam', name: 'Sam' }];
function setupHh(kind, opts, pay, people = two) {
  const sh = P.setupShape(kind, people, opts);
  return { accounts: sh.accounts, people: people.map(p => Object.assign({}, p, { payAccount: sh.payAccount[p.id], usualPay: pay[p.id] || 0 })) };
}

test('setupExample, one earner who pays a share and an allowance: says both, not "what\'s left stays there" alone', () => {
  const c = setupHh('contribute', { noPay: ['sam'], gets: { sam: 400 }, rule: 'pay' }, { alex: 3200 });
  assert.equal(P.setupExample(c, {}), "For example: Alex's pay arrives in Alex's account. Its own bills come out of it, it sends £400.00 to Sam's account and covers what Joint account needs, and what's left stays there.");
});

test('setupExample, no bills typed: what moves, in words, never an invented "£20 of bills"', () => {
  const c = setupHh('own', {}, { alex: 3000, sam: 2000 });
  assert.equal(P.setupExample(c, {}), "For example: Alex's pay arrives in Alex's account, and what's left after its bills moves to Joint account.");
  assert.ok(!/£20\b/.test(P.setupExample(c, {})));
  assert.equal(P.setupExample(c, { [c.accounts[0].id]: 120 }), "For example: if Alex's account has £120.00 of bills, the rest of Alex's pay, £2,880.00, moves to Joint account.");
  const solo = setupHh('own', {}, { jo: 2000 }, [{ id: 'jo', name: 'Jo' }]);
  assert.equal(P.setupExample(solo, {}), "For example: Jo's pay arrives in Bills account, and what's left after its bills moves to Spending account.");
});

test('setupExample: shares of an account several people pay into; nothing until the split is chosen', () => {
  const c = setupHh('contribute', { rule: 'pay' }, { alex: 3000, sam: 2000 });
  assert.equal(P.setupExample(c, {}), "For example: if Joint account has £1,000.00 of bills, Alex's share is £600.00 and Sam's is £400.00.");
  const j = c.accounts.find(a => a.role === 'joint');
  assert.equal(P.setupExample(c, { [j.id]: 1500 }), "For example: if Joint account has £1,500.00 of bills, Alex's share is £900.00 and Sam's is £600.00.");
  j.funding = Object.assign({}, j.funding, { open: true });
  assert.equal(P.setupExample(c, {}), '');
  assert.equal(P.fundingWords(j.funding, c.people, 'it', j.id), 'Alex and Sam share its costs.');
  assert.equal(P.setupExample(setupHh('separate', {}, { alex: 3000, sam: 2000 }), {}), "For example: Alex's pay arrives in Alex's account. Bills and spending come out of it, and what's left stays there.");
});

// ---------- contribWords and board: what a share's label and the diagram say ----------
function withKit(rule, boarder = true) {
  return household({
    people: [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: 2000 }, Object.assign({ id: 'kit', name: 'Kit', payAccount: 'K', usualPay: 900 }, boarder ? { boarder: true } : {})],
    accounts: [acc('A', { name: "Alex's account" }), acc('S', { name: "Sam's account" }), acc('K', { name: "Kit's account" }),
      acc('J', { name: 'Joint account', funding: { people: ['alex', 'sam', 'kit'], rule, set: { kit: { amount: 350 } } } })],
    bills: [{ id: 'rent', name: 'Rent', amount: 1850, account: 'J', months: [] }],
  });
}
const labels = c => { const r = P.calc(c, 11, { alex: 3000, sam: 2000, kit: 900 }, []); return r.steps.filter(s => s.kind === 'contribute').map(s => P.contribWords(c, r, s)); };

test('contribWords: equal shares beside a boarder read "half each", and the boarder\'s is "board"', () => {
  assert.deepEqual(labels(withKit('equal')), ["Alex's share (half each)", "Sam's share (half each)", "Kit's board"]);
  // Not 41% (of everything paid in, board included): 60% and 40% of what Alex and Sam share.
  assert.deepEqual(labels(withKit('pay')), ["Alex's share (60%)", "Sam's share (40%)", "Kit's board"]);
  assert.deepEqual(labels(withKit('equal', false)), ["Alex's share (half each)", "Sam's share (half each)", "Kit's set amount"], 'a set amount that isn\'t board');
  const three = withKit('equal'); three.accounts[3].funding = { people: ['alex', 'sam', 'kit'], rule: 'equal' }; delete three.people[2].boarder;
  assert.deepEqual(labels(three), ["Alex's equal share", "Sam's equal share", "Kit's equal share"], 'more than two: "equal share", not a percentage');
});

test('board is "board" in the diagram, never "set amount"', () => {
  const c = withKit('equal'), story = P.flowStory(c).map(x => x.text);
  assert.ok(story.some(t => t === "Kit's pay arrives in Kit's account. It pays Kit's board into Joint account. It keeps what's left: Kit's left over."), story.join(' | '));
  assert.ok(story.some(t => t.startsWith('Alex and Sam share the costs of Joint account, half each. Kit pays board into Joint account.')), story.join(' | '));
  assert.ok(P.flowStory(c).some(x => JSON.stringify(x.shares) === JSON.stringify(["Alex's share", "Sam's share", "Kit's board"])));
  assert.equal(P.setWord(c.accounts[3].funding, c.people[2]), ' board');
  assert.equal(P.setWord(c.accounts[3].funding, c.people[0]), ' share');
  assert.ok(!story.join(' ').includes('set amount'));
});

test('fundingProblem: the "pay twice" warning names everyone it applies to', () => {
  const { c } = sampleUpgraded(false), nw = c.accounts.find(a => a.id === 'jbills');
  nw.funding = { people: ['alex'], rule: 'equal' };
  assert.equal(P.fundingProblem(c, 'jbills'), "Alex's pay already reaches Joint bills account through Current account 1, so they'd pay twice.");
  nw.funding = { people: ['alex', 'sam'], rule: 'equal' };
  assert.equal(P.fundingProblem(c, 'jbills'), "Alex's pay already reaches Joint bills account through Current account 1, and Sam's through Current account 2, so they'd pay twice.");
});
