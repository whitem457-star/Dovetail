// Unit tests for 2.13: one meaning of "short" everywhere (any account that keeps what's left ends the month below zero),
// and exports that understand shares and board. A pooled household with one account keeping what's left must get exactly
// what 2.12.1 gave: the made-up 1.x household over 36 months (sample36) through the old and new rules, and its exports
// against 2.12.1's own output (tests/fixtures/sample36-2.12.1-exports.json). Made-up households only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { P, household, sample36, sampleUpgraded, clone } from './load.mjs';

const acc = (id, o = {}) => Object.assign({ id, name: id, colour: 'blue', leftoverTo: null }, o);
const bill = (id, amount, account, o = {}) => Object.assign({ id, name: id, amount, account, months: [] }, o);
const OLD = JSON.parse(fs.readFileSync(new globalThis.URL('../fixtures/sample36-2.12.1-exports.json', import.meta.url), 'utf8'));

// 2.12.1's rules, as they were (analysis.js at 9273b93), for the comparison.
const oldProjected = (c, months, k, keys) => keys.map(x => { const ones = P.monthOneOffs(months, x), r = P.calc(P.cfgFor(c, x, ones), P.mNum(x), P.payFor(c, months, x), ones), actual = P.hasTypedPay(months, x);
  return { k: x, float: r.flt, short: P.r2(r.flt) < 0, oneOffs: ones.length, actual, predicted: actual ? P.predictedFloat(c, months, x) : null }; });
const oldTopUps = (c, months, k) => { const used = P.usedMonths(months, k).slice(-12), acc = {};
  used.forEach(x => P.calcMonth(c, months, x).steps.forEach(s => { if (s.kind !== 'topup') return;
    const a = acc[s.to] || (acc[s.to] = { account: s.to, from: s.from, count: 0, total: 0, months: [] }); a.count++; a.total += s.amt; a.months.push(x); a.from = s.from; }));
  const list = Object.keys(acc).map(id => { const a = acc[id]; a.average = a.total / a.count; return a; });
  list.sort((a, b) => b.count - a.count || b.total - a.total); return { accounts: list, monthsLooked: used.length }; };

// "Half each" into a joint account with £1,400 rent: Alex £3,000, Sam £600. Sam's half leaves Sam's account £100 short
// every month, while the household's total left over is £2,200 (product.md R2.3; user.md R2.1).
const halfEach = () => household({ payday: { day: 28, weekend: true },
  people: [{ id: 'a', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 's', name: 'Sam', payAccount: 'S', usualPay: 600 }],
  accounts: [acc('A', { name: "Alex's account" }), acc('S', { name: "Sam's account" }), acc('J', { name: 'Joint account', funding: { people: ['a', 's'], rule: 'equal' } })],
  bills: [bill('rent', 1400, 'J')] });
const halfMonths = { '2026-10': { pay: { a: 3000, s: 600 } }, '2026-11': { pay: { a: 3000, s: 600 } } };

test('the made-up pooled household over 36 months: Month by month, history and top-ups exactly as in 2.12.1', () => {
  const { c, m } = sample36(), keys = Object.keys(m).sort();
  assert.equal(keys.length, 36);
  let short = 0, tops = 0;
  for (const k of keys) {
    const win = P.chartMonths(k), now = P.projectedFloat(c, m, k, win), was = oldProjected(c, m, k, win);
    now.forEach((x, i) => {
      const { shortBy, named, ...rest } = x;
      assert.deepEqual(rest, was[i], k + ' window, ' + x.k);
      assert.equal(named, false, 'one account keeps what\'s left');
      assert.deepEqual(shortBy, x.short ? [{ id: 'jspend', amount: -P.r2(x.float) }] : [], 'the short account is the one that keeps what\'s left, by the total');
    });
    const t = P.topUps(c, m, k), o = oldTopUps(c, m, k);
    assert.deepEqual(t.accounts.map(({ short, ...a }) => a), o.accounts, k + ' top-ups');
    t.accounts.forEach(a => assert.equal(a.short.count, 0, 'nothing left short in a pooled household: a short month is Month by month\'s'));
    assert.deepEqual(P.monthlyPicture(c, m, k).shortBy, []);
    P.payHistory(c, m, k).forEach(h => assert.equal(h.short, P.r2(h.float) < 0));
    const r = P.calcMonth(c, m, k);
    assert.ok(!r.cant.length && r.steps.every(s => !('short' in s)), k + ': every top-up had the money there, so 2.13\'s top-up rule changes nothing');
    if (P.isShort(r)) short++; tops += o.accounts.length;
  }
  assert.ok(short >= 2 && tops > 0, 'the comparison covers short months and top-ups: ' + short + ', ' + tops);
});

test('top-ups only from money that\'s there, pooled household too: the forced month sends what there is and names the shortfall, the total unchanged', () => {
  const { c, m } = sample36({ forced: true }), plain = sample36();
  const r = P.calcMonth(c, m, '2026-06'), top = r.steps.filter(s => s.kind === 'topup');
  assert.equal(P.r2(r.flt), -3049.53, 'the same total as 2.12.1 gave');
  assert.deepEqual(top.map(s => [s.id, s.amt, s.short]), [['t:jspend>jbills', 25, 789.54]], 'Joint spending sends the £25.00 it has (2.12.1 listed all £814.54)');
  assert.deepEqual(P.shortAccounts(r), [{ id: 'jspend', amount: 2259.99 }, { id: 'jbills', amount: 789.54, topup: true }], 'Joint bills is named as short, by what the top-up couldn\'t send');
  assert.equal(P.shortWords(c, P.shortAccounts(r)), 'Joint spending account short by £2,259.99 and Joint bills account short by £789.54');
  const pf = P.projectedFloat(c, m, '2026-06', ['2026-06'])[0];
  assert.deepEqual([P.r2(pf.float), pf.short, pf.named], [-3049.53, true, true]);
  const nw = P.topUps(c, m, '2026-06').accounts.find(a => a.account === 'jbills');
  assert.deepEqual([nw.count, nw.total, nw.short.part, nw.short.total], [1, 25, 1, 789.54]);
  for (const k of Object.keys(m).filter(x => x !== '2026-06')) {
    const a = P.calcMonth(c, m, k), b = P.calcMonth(plain.c, plain.m, k);
    assert.deepEqual([a.steps, a.floats], [b.steps, b.floats], k + ': every other month is as without it');
  }
});

test('the made-up pooled household\'s exports are 2.12.1\'s, apart from the preface\'s description', () => {
  const { c, m } = sample36(), md = P.exportMarkdown(c, m, '2026-10-16', { version: '2.12.1' }), x = P.exportCsv(c, m, '2026-10-16');
  const a = OLD.markdown.split('\n'), b = md.split('\n');
  assert.equal(b.length, a.length, 'the same lines');
  assert.deepEqual(b.filter((l, i) => l !== a[i]).length, 1, 'only one line differs');
  assert.ok(a[2].includes('a personal app') && !b[2].includes('personal app'), 'the description');
  assert.equal(x.bills.text, OLD.bills); assert.equal(x.months.text, OLD.months);
  assert.ok(!/Paid for by|\*\*Board\*\*|Short accounts|left short|pays_in/.test(md + x.months.text), 'nothing about shares, board or short accounts for a pooled household');
});

test('the preface: one sentence on the job, one on what Dovetail doesn\'t do', () => {
  const { c, m } = sample36(), md = P.exportMarkdown(c, m, '2026-10-16', {}), p = md.split('\n')[2];
  assert.ok(p.startsWith('This is an export from Dovetail, an offline app for households that run their money across more than one bank account: each payday it works out which transfers to make'));
  assert.ok(p.includes('what each person pays into anything they share, and what\'s left over.') && p.includes('It doesn\'t connect to banks or the internet, track what is actually spent, move money or give financial advice'));
});

test('short accounts, isShort, shortNamed, shortWords and personKeeps (calc.js)', () => {
  const c = halfEach(), r = P.calcMonth(c, halfMonths, '2026-11');
  assert.equal(P.r2(r.flt), 2200, 'the total left over looks healthy');
  assert.deepEqual(P.shortAccounts(r), [{ id: 'S', amount: 100 }]);
  assert.equal(P.isShort(r), true); assert.equal(P.shortNamed(r), true);
  assert.equal(P.shortWords(c, P.shortAccounts(r)), "Sam's account short by £100.00");
  assert.equal(P.shortWords(c, [{ id: 'S', amount: 100 }, { id: 'J', amount: 5 }], P.n2), "Sam's account short by 100.00 and Joint account short by 5.00");
  assert.deepEqual(P.personKeeps(c, r).map(k => [k.p.name, k.amt]), [['Alex', 2300], ['Sam', -100]], 'what each person keeps, from the month\'s settings');
  const one = household({ people: [{ id: 'p', payAccount: 'A' }], accounts: [acc('A')], bills: [bill('b', 900, 'A')] }), r1 = P.calc(one, 11, { p: 500 }, []);
  assert.deepEqual(P.personKeeps(one, r1), [], 'nobody with one person');
  assert.deepEqual([P.isShort(r1), P.shortNamed(r1), P.shortAccounts(r1)], [true, false, [{ id: 'A', amount: 400 }]], 'one account: short by the total, not named');
  assert.equal(P.isShort(P.calc(one, 11, { p: 900.004 }, [])), false, 'pennies are rounded as on screen');
});

test('Month by month: short by the rule, with the short account named', () => {
  const c = halfEach(), pf = P.projectedFloat(c, halfMonths, '2026-11', ['2026-11', '2026-12']);
  assert.deepEqual(pf.map(x => [x.k, P.r2(x.float), x.short, x.named, x.shortBy]), [['2026-11', 2200, true, true, [{ id: 'S', amount: 100 }]], ['2026-12', 2200, true, true, [{ id: 'S', amount: 100 }]]]);
  const h = P.payHistory(c, halfMonths, '2026-11');
  assert.deepEqual(h.map(x => [x.k, x.short, x.shortBy]), [['2026-10', true, [{ id: 'S', amount: 100 }]], ['2026-11', true, [{ id: 'S', amount: 100 }]]]);
  const pic = P.monthlyPicture(c, halfMonths, '2026-11');
  assert.equal(P.r2(pic.float), 2200); assert.deepEqual(pic.shortBy, [{ id: 'S', amount: 100 }], 'the average month names Sam\'s account');
  c.accounts[2].funding.rule = 'pay';
  assert.equal(P.projectedFloat(c, halfMonths, '2026-11', ['2026-11'])[0].short, false, 'in proportion to pay, nobody is short');
});

test('Accounts that ran short: an own account that ends short, a top-up that couldn\'t be made and one made only in part', () => {
  const c = halfEach(), t = P.topUps(c, halfMonths, '2026-11');
  assert.equal(t.accounts.length, 1);
  assert.deepEqual([t.accounts[0].account, t.accounts[0].count, t.accounts[0].short.count, t.accounts[0].short.ended, t.accounts[0].short.average], ['S', 0, 2, 2, 100]);
  // Joint bills is paid for by set amounts that don't cover its £450 bill; Joint spending, which would top it up, has
  // nothing in October and £20 of other income in November.
  const j = household({ people: [{ id: 'a', name: 'Alex', payAccount: 'A' }, { id: 's', name: 'Sam', payAccount: 'S' }],
    accounts: [acc('A'), acc('S'), acc('JB', { name: 'Joint bills', leftoverTo: 'JS', funding: { people: ['a', 's'], rule: 'set', set: { a: { amount: 300 }, s: { amount: 100 } } } }), acc('JS', { name: 'Joint spending' })],
    bills: [bill('energy', 450, 'JB')], income: [{ id: 'i', name: 'Refunds', amount: 20, account: 'JS', start: '2026-11' }] });
  const jm = { '2026-10': { pay: { a: 2000, s: 1000 } }, '2026-11': { pay: { a: 2000, s: 1000 } } };
  const oct = P.calcMonth(j, jm, '2026-10'), nov = P.calcMonth(j, jm, '2026-11');
  assert.deepEqual([oct.cant.length, P.shortAccounts(oct)], [1, [{ id: 'JB', amount: 50, topup: true }]], 'October: the top-up can\'t be made');
  assert.deepEqual(P.shortAccounts(nov), [{ id: 'JB', amount: 30, topup: true }], 'November: £20 sent, £30 short');
  const u = P.topUps(j, jm, '2026-11').accounts;
  assert.equal(u.length, 1);
  assert.deepEqual([u[0].account, u[0].from, u[0].count, u[0].total, u[0].short.count, u[0].short.cant, u[0].short.part, u[0].short.ended, u[0].short.average],
    ['JB', 'JS', 1, 20, 2, 1, 1, 0, 40], 'one top-up made (in part), two months left short, by £40 on average');
});

// One person, pay into Bills, Bills' leftover to Spending (which keeps it), a £1,500 yearly bill in November. That month
// Bills can't be topped up (Spending has nothing), so the month has two floats, but only one account keeps what's left.
const pooledYearly = () => household({ payday: { day: 28 }, people: [{ id: 'p', name: 'Alex', payAccount: 'B', usualPay: 2000 }],
  accounts: [acc('B', { name: 'Bills', leftoverTo: 'S' }), acc('S', { name: 'Spending' })],
  bills: [bill('rent', 1000, 'B'), bill('ins', 1500, 'B', { months: [11] })], budgets: [{ id: 'g', name: 'Food', amount: 400, account: 'S' }] });

test('a pooled household whose top-up can\'t be made: no "short in the average month", no "ended short"; shares still get both', () => {
  const c = pooledYearly(), m = {};
  for (let i = 0; i < 7; i++) m[P.shiftMonth('2026-05', i)] = { pay: { p: 2000 }, done: {} };
  const nov = P.calcMonth(c, m, '2026-11');
  assert.deepEqual([nov.floats.length, P.shortAccounts(nov)], [2, [{ id: 'S', amount: 400 }, { id: 'B', amount: 500, topup: true }]], 'November: the top-up to Bills can\'t be made');
  const pic = P.monthlyPicture(c, m, '2026-10');
  assert.equal(P.r2(pic.float), 475); assert.deepEqual(pic.shortBy, [], 'no account is short in the average month');
  assert.ok(!P.exportMarkdown(c, m, '2026-10-21', { version: '2.13' }).includes('Short in the average month'), 'nor in the export');
  const t = P.topUps(c, m, '2026-11').accounts;
  assert.deepEqual(t.map(a => [a.account, a.short.count, a.short.ended, a.short.cant]), [['B', 1, 0, 1]], 'Bills was left short by the top-up; Spending isn\'t listed as ending the month short');
  const h = halfEach();
  assert.deepEqual(P.monthlyPicture(h, halfMonths, '2026-11').shortBy, [{ id: 'S', amount: 100 }], 'with shares, the average month still names Sam\'s account');
  assert.equal(P.topUps(h, halfMonths, '2026-11').accounts[0].short.ended, 2, 'and Sam\'s account still ended the month short');
});

test('board: a boarder\'s own account is never "short" for the household', () => {
  const c = household({ people: [{ id: 'a', name: 'Alex', payAccount: 'A', usualPay: 2500 }, { id: 'k', name: 'Kit', payAccount: 'K', boarder: true }],
    accounts: [acc('A', { leftoverTo: 'J' }), acc('K', { name: "Kit's account" }), acc('J', { name: 'Joint account', funding: { people: ['k'], rule: 'set', set: { k: { amount: 350 } } } })],
    bills: [bill('rent', 1400, 'J')] });
  const m = { '2026-11': { pay: { a: 2500, k: 0 } } }, r = P.calcMonth(c, m, '2026-11');
  assert.ok(r.outside.some(f => f.id === 'K' && f.amt < 0), 'Kit has no pay in yet, so their own account is below zero');
  assert.deepEqual([P.isShort(r), P.shortAccounts(r)], [false, []], 'but it isn\'t the household\'s');
  assert.equal(P.projectedFloat(c, m, '2026-11', ['2026-11'])[0].short, false);
  assert.deepEqual(P.topUps(c, m, '2026-11').accounts, []);
});

// Alex and Sam share Joint bills by set amounts (not enough) and Joint account half each; Kit boards. Sam can't afford half.
const sharesBoard = () => household({ payday: { day: 28, weekend: true },
  people: [{ id: 'a', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 's', name: 'Sam', payAccount: 'S', usualPay: 600 }, { id: 'k', name: 'Kit', payAccount: 'K', usualPay: 1200, boarder: true }],
  accounts: [acc('A', { name: "Alex's account" }), acc('S', { name: "Sam's account" }), acc('K', { name: "Kit's account" }),
    acc('JB', { name: 'Joint bills', leftoverTo: 'J', funding: { people: ['a', 's'], rule: 'set', set: { a: { amount: 300 }, s: { pct: 10 } } } }),
    acc('J', { name: 'Joint account', funding: { people: ['a', 's', 'k'], rule: 'equal', set: { k: { amount: 350 } } } })],
  bills: [bill('rent', 1400, 'J'), bill('energy', 450, 'JB')], budgets: [{ id: 'f', name: 'Food', amount: 300, account: 'J' }] });
const sbMonths = { '2026-10': { pay: { a: 3000, s: 600, k: 1200 } }, '2026-11': { pay: { a: 3000, s: 600, k: 1200 }, done: { 'c:a>J': 720 } } };

test('the Markdown export explains Paid for by and board, lists who pays into what, and each month\'s shares and short accounts', () => {
  const c = sharesBoard(), md = P.exportMarkdown(c, sbMonths, '2026-10-16', { version: '2.13' });
  assert.ok(md.includes('- **Paid for by**: an account can be paid for by named people') && md.includes('a percentage of that month\'s pay') && md.includes('so they each keep the same'), 'the preface explains Paid for by, set amounts and percentages, and the rules');
  assert.ok(md.includes('- **Board**: someone who pays board pays a set amount into the household\'s account'), 'and board');
  assert.ok(md.includes('- **Short**: a month is short when any account that keeps its leftover ends it below zero'), 'and what short means');
  assert.ok(md.includes('| Joint bills | Alex | a set amount, 300.00 a month |') && md.includes('| Joint bills | Sam | a set amount, 10% of their pay each month |') &&
    md.includes('| Joint account | Alex | a share, half each |') && md.includes('| Joint account | Kit | board, 350.00 a month |'), 'who pays into what');
  assert.ok(md.includes("| Kit's account | blue | keeps its leftover (a boarder's own money, not in the float) |"));
  assert.ok(md.includes('| Month | Alex pay | Sam pay | Kit pay | Float | Transfers ticked | One-offs | Shares and board | Short accounts |'));
  assert.ok(md.includes("| Nov 2026 | 3000.00 | 600.00 | 1200.00 | 1800.00 | 1 of 6 |  | Alex 300.00 into Joint bills (set amount); Sam 60.00 into Joint bills (set amount); Alex 720.00 into Joint account (share, half each); Sam 720.00 into Joint account (share, half each); Kit 350.00 into Joint account (board) | Sam's account short by 180.00 |"),
    md.split('## Saved months')[1].slice(0, 900));
  assert.ok(md.includes('| Month | Outgoings | Projected float | Pay | What\'s different | Short accounts |') && md.includes("| Dec 2026 | 2150.00 | 1800.00 | estimated | only the monthly bills | Sam's account short by 180.00 |"), 'the next 12 months name the short account');
  assert.ok(md.includes("Short in the average month: Sam's account short by 180.00.") && md.includes("This month (October 2026): 1800.00 left over; Sam's account short by 180.00."));
  assert.ok(md.includes('### Top-ups and accounts left short') && md.includes("| Sam's account | 0 of 1 |  |  | 1 of 1 | 180.00 | ended below zero 1× |"), md.split('### Top-ups')[1]);
});

test('the CSV export keeps what each person paid in and the short accounts, which the float leaves out', () => {
  const x = P.exportCsv(sharesBoard(), sbMonths, '2026-10-16'), rows = x.months.text.trim().split('\r\n');
  assert.equal(rows[0], 'month,Alex_pay,Sam_pay,Kit_pay,float,transfers_ticked,transfers_total,one_off_payments,one_off_income,Alex_pays_in,Sam_pays_in,Kit_pays_in,short_accounts');
  assert.equal(rows[2], "2026-11,3000.00,600.00,1200.00,1800.00,1,6,0.00,0.00,1020.00,780.00,350.00,Sam's account short by 180.00");
  const fine = sharesBoard(); fine.accounts[4].funding.rule = 'pay';
  assert.ok(!P.exportCsv(fine, sbMonths, '2026-10-16').months.text.includes('short_accounts'), 'no short column when nobody was short');
});

test('the export uses each month\'s own arrangement after a change of style', () => {
  const c = halfEach(), m = clone(halfMonths);
  // Before November the household pooled: everything went to the joint account.
  c.flows = [{ from: '2026-11', was: { accounts: { A: { leftoverTo: 'J' }, S: { leftoverTo: 'J' }, J: { leftoverTo: null } }, pay: { a: 'A', s: 'S' } } }];
  const md = P.exportMarkdown(P.normCfg(c), m, '2026-10-16', {});
  assert.ok(md.includes('- **Changes**: the household changed how it manages its money from November 2026.'));
  assert.ok(md.includes('| Oct 2026 | 3000.00 | 600.00 | 2200.00 | 0 of 2 |  |  |  |') && md.includes("| Nov 2026 | 3000.00 | 600.00 | 2200.00 | 0 of 2 |  | Alex 700.00 into Joint account (share, half each); Sam 700.00 into Joint account (share, half each) | Sam's account short by 100.00 |"), md.split('## Saved months')[1].slice(0, 700));
});

test('the Share message and the export word shares and board as the Pay tab does', () => {
  // Alex £3,000 and Sam £2,000 share Joint half each; Kit pays £300 board into it.
  const c = household({ payday: { day: 28 }, people: [{ id: 'a', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 's', name: 'Sam', payAccount: 'S', usualPay: 2000 }, { id: 'k', name: 'Kit', payAccount: 'K', usualPay: 1500, boarder: true }],
    accounts: [acc('A', { name: 'Alex own' }), acc('S', { name: 'Sam own' }), acc('K', { name: 'Kit own' }), acc('J', { name: 'Joint', funding: { people: ['a', 's', 'k'], rule: 'equal', set: { k: { amount: 300 } } } })],
    bills: [bill('rent', 1500, 'J')] });
  const m = { '2026-01': { pay: { a: 3000, s: 2000, k: 1500 }, done: {} } }, r = P.calcMonth(c, m, '2026-01'), contrib = r.steps.filter(s => s.kind === 'contribute');
  assert.deepEqual(contrib.map(s => P.contribWords(c, r, s)), ["Alex's share (half each)", "Sam's share (half each)", "Kit's board"], 'the Pay tab');
  const t = P.transfersText(c, '2026-01', r, {}, null).split('\n');
  assert.deepEqual(t.slice(1, 4), ["1. ☐ Alex own → Joint  £600.00 (Alex's share, half each)", "2. ☐ Sam own → Joint  £600.00 (Sam's share, half each)", "3. ☐ Kit own → Joint  £300.00 (Kit's board)"], 'the Share message');
  const md = P.exportMarkdown(c, m, '2026-01-10', { version: '2.13' });
  assert.ok(md.includes('| Jan 2026 | 3000.00 | 2000.00 | 1500.00 | 3800.00 | 0 of 3 |  | Alex 600.00 into Joint (share, half each); Sam 600.00 into Joint (share, half each); Kit 300.00 into Joint (board) |'), md.split('## Saved months')[1].slice(0, 600));
  assert.ok(!/40%|set amount/.test(t.join('\n') + md.split('## Saved months')[1]), 'no percentage of everyone, and board isn\'t a set amount');
  // A third person sharing equally.
  c.people.push({ id: 'z', name: 'Zoe', payAccount: 'Z' }); c.accounts.push(acc('Z')); c.accounts[3].funding.people.push('z');
  const r3 = P.calc(c, 1, { a: 3000, s: 2000, k: 1500, z: 900 }, []);
  assert.deepEqual(r3.steps.filter(s => s.kind === 'contribute').map(s => P.contribLabel(c, r3, s)), ["Alex's equal share", "Sam's equal share", "Kit's board", "Zoe's equal share"], 'three sharing equally');
});

test('Share text already follows the rule: each account that keeps what\'s left, short or not', () => {
  const c = halfEach(), r = P.calcMonth(c, halfMonths, '2026-11'), t = P.transfersText(c, '2026-11', r, {}, null).split('\n');
  assert.deepEqual(t.slice(-3), ["Left over in Alex's account: £2,300.00", "Short in Sam's account: £100.00", 'Left over in Joint account: £0.00']);
});

test('normCfg keeps wealthRemoved only when it is true, and adds nothing otherwise', () => {
  assert.equal(P.normCfg({ wealthRemoved: true }).wealthRemoved, true);
  for (const v of [false, 'yes', 1, null]) assert.ok(!('wealthRemoved' in P.normCfg({ wealthRemoved: v })), String(v));
  assert.ok(!('wealthRemoved' in P.normCfg({})));
  assert.equal(P.backupVersionFor(P.normCfg({ wealthRemoved: true })), 5, 'it doesn\'t make a file need 2.13');
});

test('the export preface explains short and the top-up limit for a pooled household that has a short account, not only for shares', () => {
  const c = pooledYearly(), m = {};
  for (let i = 0; i < 7; i++) m[P.shiftMonth('2026-05', i)] = { pay: { p: 2000 }, done: {} };
  const md = P.exportMarkdown(c, m, '2026-10-21', { version: '2.13' }), pre = md.split('## Household')[0];
  assert.ok(pre.includes('- **Short**: a month is short when any account that keeps its leftover ends it below zero'), 'what short means');
  assert.ok(pre.includes('- **Top-ups** only send what the account sending them has by then, so a top-up can be made only in part, or not at all; the rest stays short.'), 'and the top-up limit');
  assert.ok(!pre.includes('Paid for by') && !pre.includes('**Board**'), 'nothing about shares or board');
  assert.ok(md.includes('Short accounts') && md.includes('### Top-ups and accounts left short'), 'which the figures below use');
  const sb = P.exportMarkdown(sharesBoard(), sbMonths, '2026-10-16', { version: '2.13' }).split('## Household')[0];
  assert.ok(sb.includes('- **Top-ups** only send') && !sb.includes('When people pay like this'), 'with shares, the limit is its own line, not part of Paid for by');
});

test('the exports leave out a month whose key isn\'t a real month', () => {
  const { c, m } = sampleUpgraded(true), rep = [];
  m['2026-13'] = { pay: { alex: 2000 }, done: {} }; m['2026-1'] = { pay: { alex: 2000 }, done: {} };
  const m2 = P.normMonths(m, rep);
  assert.ok('2026-13' in m2 && rep.length > 0, 'a restore keeps it and says so');
  assert.deepEqual(P.savedMonthKeys(m2), P.savedMonthKeys(m), 'the same months as without them');
  assert.ok(!P.savedMonthKeys(m2).some(k => !P.validMonth(k)));
  const md = P.exportMarkdown(c, m2, '2026-10-21', { version: '2.13' }), csv = P.exportCsv(c, m2, '2026-10-21').months.text;
  assert.ok(!md.includes('undefined') && !csv.includes('2026-13') && !csv.includes('2026-1,'), 'neither export lists them');
  delete m2['2026-13']; delete m2['2026-1'];
  assert.equal(P.exportCsv(c, m2, '2026-10-21').months.text, csv, 'the CSV is as without them');
});

test('the payday notification names a short account by the one rule, as the Pay tab does', () => {
  const c = halfEach(); c.notify = { on: true, time: '09:00', amounts: true };
  const pay = P.notificationSchedule(c, halfMonths, '2026-10-20', 30).filter(e => e.key.startsWith('pay:'));
  assert.equal(pay.length, 1);
  assert.ok(pay[0].text.endsWith("2 transfers to make. Expected left over £2,200.00; Sam's account is short by £100.00."), pay[0].text);
  assert.ok(pay[0].late.text.endsWith("Expected left over £2,200.00; Sam's account is short by £100.00."), pay[0].late.text);
  c.notify.amounts = false;
  assert.ok(!/short|£/.test(P.notificationSchedule(c, halfMonths, '2026-10-20', 30).find(e => e.key.startsWith('pay:')).text), 'no amounts, no names');
  const one = household({ payday: { day: 28 }, people: [{ id: 'p', name: 'Pat', payAccount: 'A', usualPay: 500 }], accounts: [acc('A', { name: 'Current' })], bills: [bill('rent', 800, 'A')], notify: { on: true, time: '09:00', amounts: true } });
  assert.ok(P.notificationSchedule(one, {}, '2026-10-20', 30).find(e => e.key.startsWith('pay:')).text.endsWith('Expected left over −£300.00.'), 'one account keeping what\'s left: the total says it, as before');
});
