// Unit tests for "Paste a list" (onboarding 5.4): parseBillLines reads one bill per line from pasted text.
// Made-up lists only (Alex and Sam's household style).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P } from './load.mjs';

const parse = (t, ex) => P.parseBillLines(t, ex);
const one = (t, ex) => { const r = parse(t, ex); assert.equal(r.items.length, 1, JSON.stringify(r)); assert.equal(r.unread.length, 0); return r.items[0]; };
const TEN = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1];

test('a spreadsheet copy (tabs) with a header row', () => {
  const r = parse('Bill\tAmount\tHow often\nMortgage\t£1,250.00\tMonthly\nStreamly\t£9.49\nGym\t£32\tMonthly\n');
  assert.deepEqual(r.items.map(i => [i.name, i.amount, i.months, i.line]), [['Mortgage', 1250, [], 2], ['Streamly', 9.49, [], 3], ['Gym', 32, [], 4]]);
  assert.deepEqual(r.unread, []);
  assert.equal(r.truncated, false);
});

test('a spreadsheet copy with account and month columns', () => {
  const r = parse('Name\tAmount\tAccount\nBroadband\t£34.99\tJoint\nCar insurance\t£480\tJune\nTV Licence\t174.50\tannual\tMay');
  assert.deepEqual(r.items[0], { name: 'Broadband', amount: 34.99, months: [], line: 2, account: 'Joint' });
  assert.deepEqual(r.items[1], { name: 'Car insurance', amount: 480, months: [6], line: 3, month: 6 });
  assert.deepEqual(r.items[2], { name: 'TV Licence', amount: 174.5, months: [5], line: 4, month: 5 });
});

test('commas and semicolons, and thousands commas are not separators', () => {
  const r = parse('Streamly, 9.49\nRent, 1,200\nWater; 28,50\nRent £1,200.50, Joint\nSam phone;£18;Sam current');
  assert.deepEqual(r.items.map(i => [i.name, i.amount, i.account]), [['Streamly', 9.49, undefined], ['Rent', 1200, undefined], ['Rent', 1200.5, 'Joint'], ['Sam phone', 18, 'Sam current']]);
  assert.equal(r.unread.length, 1);
  assert.equal(r.unread[0].reason, 'two amounts'); // "28,50" is two numbers, not a guess
});

test('free text in any order', () => {
  assert.deepEqual(one('Streamly £9.49'), { name: 'Streamly', amount: 9.49, months: [], line: 1 });
  assert.equal(one('Streamly 9.49').amount, 9.49);
  const a = one('£9.49 Streamly');
  assert.deepEqual([a.name, a.amount], ['Streamly', 9.49]);
  assert.equal(one('Sam gym membership   £32  ').name, 'Sam gym membership');
  assert.equal(one('- Tunebox: £10.99').name, 'Tunebox');
  assert.equal(one('2. Dentist plan 25.00 DR').amount, 25);
});

test('amount formats and negatives', () => {
  for (const [t, v] of [['Rent £1,234.50', 1234.5], ['Rent 1234.5', 1234.5], ['Rent 12', 12], ['Rent -12.50', 12.5], ['Rent (12.50)', 12.5], ['Rent £-12.50', 12.5],
    ['Rent -£12.50', 12.5], ['Rent 12.50 CR', 12.5], ['Rent 12.50 DR', 12.5], ['Rent GBP 12.50', 12.5], ['GBP12.50 Rent', 12.5], ['Rent £ 12.50', 12.5], ['Rent −12.50', 12.5], ['Rent 1,234', 1234]]) {
    const i = one(t); assert.equal(i.amount, v, t); assert.equal(i.name, 'Rent', t);
  }
});

test('monthly words and marks', () => {
  for (const t of ['Streamly £9.49 monthly', 'Streamly £9.49 a month', 'Streamly £9.49/m', 'Streamly £9.49pm', 'Streamly 9.49 pm', 'Streamly monthly £9.49']) {
    const i = one(t); assert.deepEqual([i.name, i.amount, i.months], ['Streamly', 9.49, []], t);
    assert.equal('yearly' in i, false);
  }
});

test('yearly with a month, yearly without one', () => {
  for (const t of ['TV Licence £174.50 yearly May', 'TV Licence £174.50 annual May', 'TV Licence £174.50 annually in May', 'TV Licence 174.50 a year (May)', 'TV Licence £174.50 p.a. May', 'TV Licence £174.50 pa Mar'.replace('Mar', 'May'), 'May TV Licence £174.50 per year']) {
    const i = one(t); assert.deepEqual([i.name, i.amount, i.months, i.month], ['TV Licence', 174.5, [5], 5], t);
    assert.equal('yearly' in i, false);
  }
  const y = one('Car insurance £480 yearly');
  assert.deepEqual(y, { name: 'Car insurance', amount: 480, months: [], line: 1, month: null, yearly: true });
  assert.equal(one('Breakdown cover 60 pa').yearly, true);
  assert.equal(one('Home insurance, 15.5, Sept, yearly').month, 9);
});

test('quarterly', () => {
  const q = one('Water £90 quarterly Feb');
  assert.deepEqual([q.months, q.month, q.quarterly], [[2, 5, 8, 11], 2, true]);
  assert.deepEqual(one('Water £90 quarterly November').months, [2, 5, 8, 11]);
  const n = one('Water £90 a quarter');
  assert.deepEqual([n.months, n.quarterly, 'month' in n], [[], true, false]);
});

test('a month with no frequency word means once a year in that month', () => {
  const i = one('Boiler cover\t£12\tOctober');
  assert.deepEqual([i.months, i.month], [[10], 10]);
  const m = one('Boiler cover\t£12\tMonthly\tOctober');
  assert.deepEqual([m.months, m.month], [[], 10]);
});

test('Council Tax is ten-monthly unless a frequency is given', () => {
  assert.deepEqual(one('Council Tax £160').months, TEN);
  assert.deepEqual(one('council tax, 160').months, TEN);
  assert.deepEqual(one('Council Tax £160 monthly').months, []);
  assert.deepEqual(one('Council Tax £1,900 yearly April').months, [4]);
});

test('a bank-app style list: marks, dates and references are dropped', () => {
  const r = parse([
    '05/10/2026 DD STREAMLY.COM REF 88213 £9.49',
    'Northwind Energy  Direct Debit  *4821  £84.20',
    '01-02 SO Alex & Sam savings £200.00',
    'Standing order — Sam gym 12 Oct 2026 £32.00 ref: AB12345',
    'Harbour mobile DD 10:32 £25 987654321',
    'SO Gym £40',
    'So Good Gym £40',
  ].join('\n'));
  assert.deepEqual(r.items.map(i => [i.name, i.amount]), [['STREAMLY.COM', 9.49], ['Northwind Energy', 84.2], ['Alex & Sam savings', 200], ['Sam gym', 32], ['Harbour mobile', 25], ['Gym', 40], ['So Good Gym', 40]]);
  assert.deepEqual(r.unread, []);
});

test('a name keeps its capitalisation, spacing is collapsed and it is cut at 60 characters', () => {
  assert.equal(one('  McCarthy   &  Stone   charges £50').name, 'McCarthy & Stone charges');
  const long = one('A'.repeat(100) + ' £5');
  assert.equal(long.name.length, 60);
  assert.equal(one('3 Mobile £20').name, '3 Mobile');
});

test('a line with two amounts goes to unread, with its reason and line number', () => {
  const r = parse('Rent £900\nGreenfield Stores £45.00 £1,204.55\n\nGym 32 1500');
  assert.equal(r.items.length, 1);
  assert.deepEqual(r.unread.map(u => [u.line, u.reason]), [[2, 'two amounts'], [4, 'two amounts']]);
  assert.equal(r.unread[0].text, 'Greenfield Stores £45.00 £1,204.55');
  assert.equal(parse('12/05/2026 Streamly £9.49').items.length, 1); // a date is not a second amount
  assert.equal(parse('Streamly 01-02 9.49').items.length, 1);
});

test('lines with words but no amount, or an amount but no name', () => {
  const r = parse('Streamly\nStreamly monthly\n£9.49\n9.49 pm\n£0.00 Streamly\nRent £900');
  assert.deepEqual(r.unread.map(u => [u.line, u.reason]), [[1, 'no amount'], [2, 'no amount'], [3, 'no name'], [4, 'no name'], [5, 'no amount']]);
  assert.equal(r.items.length, 1);
});

test('headers, blank lines, rules and totals are skipped without comment', () => {
  const r = parse('Name, Amount\n\n-----\n=====\nBill\nRent £900\nTotal £900\nSubtotal, 900\n\n');
  assert.deepEqual(r.items.map(i => i.name), ['Rent']);
  assert.deepEqual(r.unread, []);
});

test('duplicates are marked by name and amount', () => {
  const ex = [{ name: 'Streamly', amount: 9.49 }, { name: 'Rent', amount: 900 }, { name: 'Gym', amount: '32' }];
  const r = parse('streamly  £9.49\nStreamly £14.99\nRent £900.01\nRent £901\nGym 32', ex);
  assert.deepEqual(r.items.map(i => !!i.duplicate), [true, false, true, false, true]);
  assert.equal('duplicate' in r.items[1], false);
  assert.equal(parse('Streamly 9.49', undefined).items[0].duplicate, undefined);
  assert.equal(parse('Streamly 9.49', [null, { name: 5 }, {}]).items.length, 1); // odd existing rows don't throw
});

test('large amounts are flagged above 5,000', () => {
  assert.equal(one('Mortgage £5,000').large, undefined);
  assert.equal(one('Mortgage £5,000.01').large, true);
  assert.equal(one('Mortgage 125,000').large, true);
  assert.equal(one('Mortgage £125000').large, true); // a bare 6-digit number is read as a reference, not an amount
});

test('long text is cut at a line end and says so', () => {
  const line = 'Streamly £9.49\n';
  const r = parse(line.repeat(3000));
  assert.equal(r.truncated, true);
  assert.ok(r.items.length > 1000 && r.items.length < 3000);
  assert.ok(r.items.every(i => i.amount === 9.49));
  assert.equal(parse(line.repeat(100)).truncated, false);
});

test('empty and odd input', () => {
  for (const t of ['', '   \n\t\n', null, undefined, 42]) {
    const r = parse(t);
    assert.deepEqual([r.items.length, r.unread.length, r.truncated], t === 42 ? [0, 1, false] : [0, 0, false], String(t));
  }
});

test('junk input never throws and stays quick', () => {
  const t0 = Date.now();
  let r = parse('£'.repeat(10000));
  assert.deepEqual([r.items.length, r.unread.length], [0, 1]);
  r = parse(Array.from({ length: 300 }, (_, i) => String.fromCharCode(i % 256)).join('') + '\n\u0000\u0001\u0002 £5\n��');
  assert.ok(Array.isArray(r.items) && Array.isArray(r.unread));
  for (const bad of ['1'.repeat(400), '1,'.repeat(200), ' '.repeat(400) + '£', '(' .repeat(400), '£ '.repeat(200) + '5', 'pa '.repeat(150), '1/'.repeat(200), '9'.repeat(400) + ' x']) {
    r = parse(bad); assert.ok(Array.isArray(r.items) && Array.isArray(r.unread), bad.slice(0, 20));
  }
  r = parse('x'.repeat(5000) + ' £5\nRent £9');
  assert.deepEqual([r.items.length, r.unread.length, r.unread[0].reason], [1, 1, "couldn't read"]);
  assert.ok(Date.now() - t0 < 2000, 'hostile input is read in linear time');
});

test('a line with a name only is unread', () => {
  const r = parse('Rent');
  assert.deepEqual(r.unread, [{ line: 1, text: 'Rent', reason: 'no amount' }]);
  assert.deepEqual(r.items, []);
});

test('a header made only of header words is skipped; a line that just contains one is not', () => {
  const r = parse('Name\tAmount\tHow often\nPhone bill\nCar insurance renewal date\nItem type\nRent £900');
  assert.deepEqual(r.items.map(i => i.name), ['Rent']);
  assert.deepEqual(r.unread.map(u => [u.line, u.text, u.reason]), [[2, 'Phone bill', 'no amount'], [3, 'Car insurance renewal date', 'no amount']]);
});

test('pence before a month name are not taken for a day', () => {
  let i = one('TV Licence 13.25 March'); assert.deepEqual([i.name, i.amount, i.months, i.month], ['TV Licence', 13.25, [3], 3]);
  i = one('Car tax 15.75 Apr'); assert.deepEqual([i.name, i.amount, i.months], ['Car tax', 15.75, [4]]);
  i = one('Boiler cover 12.50 May yearly'); assert.deepEqual([i.name, i.amount, i.months, i.month, 'yearly' in i], ['Boiler cover', 12.5, [5], 5, false]);
  i = one('Gym £30 March'); assert.deepEqual([i.name, i.amount, i.months], ['Gym', 30, [3]]);
  i = one('Gym £1,030 March'); assert.deepEqual([i.amount, i.months], [1030, [3]]);
});

test('a bare day and month is a date, unless it is all that gives an amount', () => {
  const r = parse('Gym £32 12 March\nGym 30 March\n12th Oct Streamly £9.49');
  assert.deepEqual(r.items.map(i => [i.name, i.amount, i.months]), [['Gym', 32, []], ['Gym', 30, [3]], ['Streamly', 9.49, []]]);
  assert.deepEqual(r.unread, []);
});

test('a month after the amount with no frequency word means once a year in that month', () => {
  for (const t of ['Insurance 480 June', 'Insurance £480 in June', 'Insurance, 480, June', 'Insurance\t480\tJune', 'Insurance £480 Jun.']) {
    const i = one(t); assert.deepEqual([i.name, i.amount, i.months, i.month], ['Insurance', 480, [6], 6], t);
  }
  // not read when the month isn't plainly after the amount, or a frequency word is there
  assert.equal(one('June Insurance 480').name, 'June Insurance');
  assert.deepEqual(one('Insurance 480 June monthly').months, []);
});
