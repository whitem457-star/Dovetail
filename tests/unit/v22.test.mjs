// Unit tests for the 2.2 pure functions: the "Not every month" card, what makes a month differ, the notification
// schedule and the exports. Expected values are worked out by hand from the data in each test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, sampleUpgraded, household } from './load.mjs';

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg || ''} ${a} ≠ ${b}`);

test('not every month: due now, coming up, each bill once', () => {
  const { c } = sampleUpgraded(false);
  const r = P.notEveryMonth(c, '2026-11');
  assert.equal(r.any, true);
  assert.deepEqual(r.due.map(b => [b.name, b.amount, b.account]), [['Council Tax', 198, 'jbills'], ['TV Licence', 43.64, 'jbills']], 'biggest first, with the account');
  near(r.dueTotal, 241.64);
  assert.deepEqual(r.coming.map(m => [m.k, m.bills.map(b => b.name), m.total]), [['2026-12', ['Kestrel home'], 142.18]], 'Jan (Council Tax) and Feb (TV Licence) are repeats, so skipped');
  assert.equal(r.repeats, true);
  const f = P.notEveryMonth(c, '2027-02');
  assert.deepEqual(f.due.map(b => b.name), ['TV Licence']);
  assert.deepEqual(f.coming.map(m => [m.k, m.bills.map(b => b.name)]), [['2027-04', ['Council Tax']]], 'March has nothing; May only repeats');
  const m = P.notEveryMonth(c, '2027-03');
  assert.deepEqual(m.due, []); assert.equal(m.dueTotal, 0);
  assert.deepEqual(m.coming.map(x => [x.k, x.bills.map(b => b.name)]), [['2027-04', ['Council Tax']], ['2027-05', ['TV Licence']]], 'May lists only TV Licence: Council Tax was already listed in April');
  const flat = household({ accounts: [{ id: 'x', name: 'X' }], bills: [{ id: 'b', name: 'Rent', amount: 500, account: 'x', months: [] }] });
  assert.deepEqual(P.notEveryMonth(flat, '2026-11'), { any: false, due: [], dueTotal: 0, coming: [], repeats: false });
  const twelve = household({ accounts: [{ id: 'x', name: 'X' }], bills: [{ id: 'b', name: 'Rent', amount: 500, account: 'x', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }] });
  assert.equal(P.notEveryMonth(twelve, '2026-11').any, false, 'all 12 months ticked counts as monthly');
});

test('chart window, actual months and what makes a month differ', () => {
  const { c, m } = sampleUpgraded(true);
  assert.deepEqual(P.chartMonths('2026-11'), ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07']);
  assert.equal(P.chartMonths('2027-01')[0], '2026-10', 'crosses the year boundary');
  assert.equal(P.hasTypedPay(m, '2026-10'), true); assert.equal(P.hasTypedPay(m, '2026-11'), false);
  assert.equal(P.hasTypedPay({ '2026-12': { pay: { a: null, b: null } } }, '2026-12'), false, 'cleared boxes are not typed pay');
  assert.equal(P.hasTypedPay({ '2026-12': { pay: { a: null, b: 0 } } }, '2026-12'), true, 'a typed £0 counts');
  const oct = P.monthExtras(c, m, '2026-10');
  assert.deepEqual(oct.bills, [{ name: 'Council Tax', amount: 198 }]);
  assert.deepEqual(oct.oneOffsOut, [{ name: 'Overdraft from last month', amount: 95 }]);
  assert.deepEqual(oct.oneOffsIn, []);
  assert.equal(P.extrasText(oct), 'Council Tax £198.00, Overdraft from last month £95.00 (one-off)');
  const dec = P.monthExtras(c, m, '2026-12');
  assert.equal(P.extrasText(dec), 'Council Tax £198.00, Kestrel home £142.18', 'biggest first');
  assert.equal(P.extrasText(P.monthExtras(c, m, '2027-03')), '', 'March: nothing but monthly bills');
  const m2 = Object.assign({}, m, { '2027-02': { oneOffs: [{ id: 'x', kind: 'out', name: 'Boiler', amount: 900, account: 'jspend' }, { id: 'y', kind: 'in', name: 'Refund', amount: 60, account: 'jspend' }] } });
  const feb = P.monthExtras(c, m2, '2027-02');
  assert.equal(P.extrasText(feb), 'TV Licence £43.64, Boiler £900.00 (one-off)', 'money in is left out of outgoings');
  assert.equal(P.extrasText(feb, true), 'TV Licence £43.64, Boiler £900.00 (one-off), Refund +£60.00 (one-off)');
  assert.equal(feb.billsTotal + feb.outTotal, 943.64);
  const keys = P.chartMonths('2026-11');
  assert.equal(P.oneOffsLine(c, m2, keys, false), 'One-offs: Oct 2026 Overdraft from last month £95.00; Feb 2027 Boiler £900.00');
  assert.equal(P.oneOffsLine(c, m2, keys, true), 'One-offs: Oct 2026 Overdraft from last month £95.00; Feb 2027 Boiler £900.00; Feb 2027 Refund +£60.00');
  assert.equal(P.oneOffsLine(c, {}, keys, true), '');
  // the charts over the window: hand-checked against the monthly base of £4,038.93 (March, no irregular bills)
  const h = P.heavyLight(c, m, '2026-11', keys);
  assert.deepEqual(h.months.map(x => x.actual), [false, false, true, false, false, false, false, false, false, false, false, false]);
  near(h.months[7].total, 4038.93); near(h.months[0].total, 4038.93 + 198 + 43.64); near(h.months[2].total, 4038.93 + 198 + 95);
  near(h.average, 50858.90 / 12); assert.equal(h.heaviest.k, '2026-12'); assert.equal(h.lightest.k, '2027-03');
  const pf = P.projectedFloat(c, m, '2026-11', keys);
  near(pf[2].float, 215.66, 'October with typed pay'); near(pf[3].float, 267.02, 'November, as on the Pay tab'); assert.equal(pf[2].actual, true); assert.equal(pf[3].actual, false);
  near(pf[0].float, 266.83, 'August: no earlier pay, so usual pay (November\'s figure with usual pay)');
  assert.equal(P.heavyLight(c, m, '2026-11').months[0].k, '2026-11', 'without a window it still starts at k');
});

test('export: Markdown report from a 1.x household', () => {
  const { c, m } = sampleUpgraded(true);
  const md = P.exportMarkdown(c, m, '2026-10-16', { version: '2.2' });
  const order = ['# Dovetail export, 16 Oct 2026', 'How Dovetail\'s figures work', '## Household', '## Bills', '## Spending budgets', '## Savings transfers', '## Other income', '## Saved months', '## Analysis',
    '### The average month', '### Bills by category', '### The next 12 months', '### Saved so far', '### Price changes', '### Top-ups', 'Exported by Dovetail 2.2 (data version 5) on 2026-10-16.'];
  let last = -1; for (const h of order) { const i = md.indexOf(h); assert.ok(i > last, 'in order: ' + h); last = i; }
  assert.ok(md.includes('"leftover goes to"') && md.includes('**float**') && md.includes('budget month') && md.includes('Ticks'), 'the preface explains the model');
  assert.ok(md.includes('| Alex | Current account 1 | 2280.00 |'), 'people with pay account and usual pay');
  assert.ok(md.includes('| Joint bills account | purple | Joint spending account |') && md.includes('| Joint spending account | orange | keeps its leftover (float) |'));
  assert.ok(md.includes('- Current account 1 → Joint bills account → Joint spending account'), 'money-flow lines');
  assert.ok(md.includes('| Council Tax | 198.00 | Jan, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec | 10 | Utilities | Joint bills account |'), 'bills table');
  assert.ok(md.includes('| Junior ISA | 50.00 | Every month | 12 | Savings | Joint bills account |  | yes |'));
  assert.ok(md.includes('| Food | 550.00 | Joint spending account |') && md.includes('| Stocks and shares ISA | 200.00 | Joint spending account |') && md.includes('| Child Benefit | 102.40 | Joint bills account |'));
  assert.ok(md.includes('| Oct 2026 | 2291.46 | 2128.73 | 215.66 | 3 of 5 | Overdraft from last month -95.00 |'), 'saved month: typed pay, the float, ticks, one-off');
  assert.ok(md.includes('| Average left over | 317.26 | 7.0% |') && md.includes('This month (November 2026): 267.02 left over.'), 'the same figures as the Analysis tab');
  assert.ok(md.includes('| Housing | 11540.40 | 961.70 | 48.1% |') && md.includes('Subscriptions and memberships: 1110.08 a year'));
  assert.ok(md.includes('| Dec 2026 | 4379.11 | 168.48 | estimated | Council Tax 198.00, Kestrel home 142.18 |'), 'next 12 months, plain numbers');
  assert.ok(md.includes('| Stocks and shares ISA | 200.00 | 200.00 | 1 of 1 ticked |'));
  assert.ok(!/£/.test(md.split('## Household')[1]), 'amounts are plain numbers, no £ signs');
  assert.ok(!/who pays/i.test(md));
  assert.ok(/\| Amount \|[^\n]*\n\| --- \| ---: \|/.test(md), 'numbers right-aligned, text left-aligned');
});

test('export: tables and CSV are safe with awkward names', () => {
  const c = household({ people: [{ id: 'a', name: 'Al | Bo', payAccount: 'x', usualPay: 1000 }], accounts: [{ id: 'x', name: 'Main, "joint"', colour: 'blue' }],
    bills: [{ id: 'b', name: '=HYPERLINK("x")', amount: 12.5, account: 'x', months: [1, 7] }, { id: 'c', name: 'Line\nbreak', amount: -0, account: 'x', months: [] }] });
  const months = { '2026-10': { pay: { a: 1000 }, done: {}, oneOffs: [{ id: 'o', kind: 'in', name: 'Gift', amount: 50, account: 'x' }] } };
  const md = P.exportMarkdown(c, months, '2026-10-16', {});
  assert.ok(md.includes('| Al \\| Bo | Main, "joint" | 1000.00 |'), 'pipes escaped');
  assert.ok(md.includes('| Line break | 0.00 |'), 'line breaks flattened, −0 shown as 0.00');
  const x = P.exportCsv(c, months, '2026-10-16');
  assert.equal(x.bills.name, 'dovetail-bills-2026-10-16.csv'); assert.equal(x.months.name, 'dovetail-months-2026-10-16.csv');
  const rows = x.bills.text.split('\r\n');
  assert.equal(rows[0], 'bill,amount,months_paid,times_a_year,yearly_cost,category,paid_from,renews,savings');
  assert.equal(rows[1], `"'=HYPERLINK(""x"")",12.50,"Jan, Jul",2,25.00,,"Main, ""joint""",,no`, 'quoted, formula disarmed');
  assert.equal(rows[2], '"Line\nbreak",0.00,Every month,12,0.00,,"Main, ""joint""",,no');
  const mr = x.months.text.split('\r\n');
  assert.equal(mr[0], 'month,Al | Bo_pay,float,transfers_ticked,transfers_total,one_off_payments,one_off_income');
  assert.equal(mr[1], '2026-10,1000.00,1050.00,0,0,0.00,50.00', 'float = 1000 pay + 50 gift; the Jan/Jul bill isn\'t due in October');
});

test('export: CSV from a 1.x household', () => {
  const { c, m } = sampleUpgraded(true);
  const x = P.exportCsv(c, m, '2026-10-16');
  const b = x.bills.text.trim().split('\r\n');
  assert.equal(b.length, 1 + c.bills.length, 'one row per bill');
  assert.ok(b.includes('Council Tax,198.00,"Jan, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec",10,1980.00,Utilities,Joint bills account,,no'));
  assert.equal(x.months.text, 'month,Alex_pay,Sam_pay,float,transfers_ticked,transfers_total,one_off_payments,one_off_income\r\n2026-10,2291.46,2128.73,215.66,3,5,95.00,0.00\r\n');
});

test('notification schedule: payday tomorrow, due soon and due day, one-offs the day before', () => {
  const c = household({ payday: { day: 28, weekend: true },
    people: [{ id: 'a', name: 'Alex', payAccount: 'cur', usualPay: 2000 }],
    accounts: [{ id: 'cur', name: 'Current', colour: 'blue', leftoverTo: 'joint' }, { id: 'joint', name: 'Joint', colour: 'teal', leftoverTo: null }],
    bills: [{ id: 'es', name: 'Home insurance', amount: 142.18, account: 'joint', months: [12], renews: '2026-12-01', lead: 30 },
      { id: 'mob', name: 'Mobile', amount: 12, account: 'cur', months: [], renews: '2026-10-20', lead: 30 },
      { id: 'far', name: 'Mortgage deal', amount: 900, account: 'joint', months: [], renews: '2027-03-01', lead: 90 },
      { id: 'old', name: 'Old renewal', amount: 5, account: 'joint', months: [], renews: '2026-09-01', lead: 30 }],
    reminders: [{ id: 'mot', name: 'Car MOT', date: '2026-11-20', lead: 14, yearly: true }] });
  const months = { '2026-11': { pay: {}, done: {}, oneOffs: [{ id: 'cs', kind: 'out', name: 'Car service', amount: 185, account: 'joint', date: '2026-11-12' }, { id: 'rf', kind: 'in', name: 'Refund', amount: 60, account: 'joint', date: '2026-10-15' }] } };
  const s = P.notificationSchedule(c, months, '2026-10-15');
  const by = k => s.filter(e => e.key.startsWith(k));
  // (a) the day before each payday in the next 90 days (to 12 Jan 2027): Wed 28 Oct, Fri 27 Nov (28th is a Saturday), Mon 28 Dec
  assert.deepEqual(by('pay:').map(e => e.date), ['2026-10-27', '2026-11-26', '2026-12-27']);
  const p1 = by('pay:')[0];
  assert.equal(p1.title, 'Payday tomorrow');
  assert.equal(p1.text, 'Wed 28 Oct 2026 pays for November 2026. 1 transfer to make.');
  // (b) lead day and due day; a lead day already past gives only the due day; past dates give nothing
  assert.deepEqual(by('b:es').map(e => [e.date, e.text]), [
    ['2026-11-01', 'Due soon: Tue 1 Dec 2026, in 30 days. Get quotes before it renews automatically. Renewal prices are often higher than new-customer prices.'],
    ['2026-12-01', 'Today, Tue 1 Dec 2026. Get quotes before it renews automatically. Renewal prices are often higher than new-customer prices.']]);
  assert.deepEqual(by('b:mob').map(e => e.date), ['2026-10-20'], 'its lead day (20 Sep) has passed');
  assert.deepEqual(by('b:far').map(e => e.date), ['2026-12-01'], 'lead day inside 90 days, due day beyond it');
  assert.equal(by('b:far')[0].text.startsWith('Due soon: Mon 1 Mar 2027, in about 3 months.'), true);
  assert.deepEqual(by('b:old'), [], 'nothing for a date that has passed');
  assert.deepEqual(by('r:mot').map(e => e.date), ['2026-11-06', '2026-11-20']);
  assert.equal(by('r:mot')[1].title, 'Car MOT');
  // (c) dated one-offs the day before; one dated today is too late for "tomorrow"
  assert.deepEqual(by('o:').map(e => [e.date, e.title, e.text]), [['2026-11-11', 'Car service', "Tomorrow, Thu 12 Nov 2026. One-off payment from Joint. It's included in the November 2026 transfers."]]);
  // each entry is also worded for the next day, in case Android only runs the check then
  assert.deepEqual(p1.late, { title: 'Payday today', text: 'Today, Wed 28 Oct 2026, pays for November 2026. 1 transfer to make.' });
  assert.equal(by('b:es')[0].late.text.startsWith('Due soon: Tue 1 Dec 2026, in 29 days.'), true);
  assert.equal(by('b:es')[1].late.text.startsWith('Yesterday, Tue 1 Dec 2026.'), true);
  assert.equal(by('o:')[0].late.text.startsWith('Today, Thu 12 Nov 2026.'), true);
  assert.ok(s.every(e => e.late && e.late.title && e.late.text));
  // rules
  assert.ok(s.every(e => e.date >= '2026-10-15' && e.date <= '2027-01-12'), 'nothing in the past, 90-day cap');
  assert.equal(new Set(s.map(e => e.key)).size, s.length, 'one per item per day');
  assert.deepEqual(s.map(e => e.date), s.map(e => e.date).slice().sort(), 'in date order');
  assert.ok(!s.some(e => /£/.test(e.title + e.text)), 'no amounts unless switched on');
  // amounts on
  const c2 = Object.assign({}, c, { notify: { on: true, time: '09:00', amounts: true } });
  const s2 = P.notificationSchedule(c2, months, '2026-10-15');
  assert.equal(s2.find(e => e.key.startsWith('b:es')).title, 'Home insurance £142.18');
  assert.equal(s2.find(e => e.key.startsWith('o:')).title, 'Car service £185.00');
  assert.ok(s2.find(e => e.key.startsWith('pay:')).text.includes('Expected left over £'));
  assert.equal(s2.find(e => e.key.startsWith('r:')).title, 'Car MOT', 'reminders have no amount');
  // no payday set: no payday entries
  assert.deepEqual(P.notificationSchedule(Object.assign({}, c, { payday: {} }), months, '2026-10-15').filter(e => e.key.startsWith('pay:')), []);
  // a shorter window
  assert.ok(P.notificationSchedule(c, months, '2026-10-15', 30).every(e => e.date <= '2026-11-13'));
});

test('2.2 settings defaults: appearance and notifications', () => {
  const c = P.normCfg({});
  assert.deepEqual(c.appearance, { theme: 'system', textSize: 'normal' });
  assert.deepEqual(c.notify, { on: false, time: '09:00', amounts: false });
  const d = P.normCfg({ appearance: { theme: 'dark', textSize: 'huge' }, notify: { on: 'yes', time: '7:00', amounts: true } });
  assert.deepEqual(d.appearance, { theme: 'dark', textSize: 'normal' }, 'unknown values fall back');
  assert.deepEqual(d.notify, { on: false, time: '09:00', amounts: true });
  assert.deepEqual(P.normCfg({ notify: { on: true, time: '18:30' } }).notify, { on: true, time: '18:30', amounts: false });
  assert.deepEqual([P.notifyTime('05:30'), P.notifyTime('23:30'), P.notifyTime('12:15'), P.notifyTime('7:00'), P.notifyTime(null)], ['06:00', '22:00', '12:15', '09:00', '09:00'], 'between 06:00 and 22:00');
  assert.equal(P.addDays('2026-12-31', 1), '2027-01-01'); assert.equal(P.addDays('2026-03-01', -1), '2026-02-28');
});
