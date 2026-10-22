// Unit tests for 2.17: layer 2 of pay patterns, counting paydays from one optional date per person (docs/payperiods.md
// section 13.2, L1 to L20; model.md 3 and 4; the layer-2 figures in docs/payperiods/worked-examples.md). Someone on a
// pattern can have a recent payday (pattern.on) and a first pay (since); their paydays between transfer days are counted
// (England and Wales bank holidays included), a month's count is frozen when its pay is first typed or ticked, and an
// extra payday is set aside by default. Households without a date get exactly what 2.16.1 gave: the comparisons load
// 2.16.1's and 2.16's own code from git (skipped where there's no history, as in the public copy).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { P, household, sample36, clone } from './load.mjs';

// ---------- an earlier release's pure code, from git, loaded as load.mjs loads today's ----------
const REL_2161 = '70bc07ba81977c810e9dfb3c7cbe6e3bd7575d8a'; // 2.16.1 (bank holidays) on the session branch
const REL_216 = 'f24c62c8a7f0c87a2357968115a002e0337808a7'; // 2.16's merge commit (RELEASE['2.16'])
const ROOT = new globalThis.URL('../../', import.meta.url).pathname;
function loadAt(rev) {
  try {
    const src = ['calc.js', 'migrate.js', 'analysis.js', 'export.js'].map(f => execSync(`git show ${rev}:web/src/${f}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).join('\n');
    const names = new Set();
    for (const m of src.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^var\s+([A-Za-z0-9_$]+)\s*=/gm)) names.add(m[1]);
    for (const m of src.matchAll(/^var\s+[^;]*?,\s*([A-Za-z0-9_$]+)\s*=/gm)) names.add(m[1]);
    return new Function('"use strict";\n' + src + '\nreturn {' + [...names].join(',') + '};')();
  } catch (e) { return null; }
}
const P2161 = loadAt(REL_2161), P216 = loadAt(REL_216);

// ---------- the design's made-up households (docs/payperiods/worked-examples.md) ----------
const CT = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1];
const acc = (id, name, o = {}) => Object.assign({ id, name, colour: 'blue', leftoverTo: null }, o);
const bills = (list, a) => list.map((b, i) => ({ id: 'b' + i, name: b[0], amount: b[1], account: a, months: b[2] || [] }));
const pat = (every, each, on, since) => { const t = { every, each }; if (on) t.on = on; if (since) t.since = since; return t; };
// Jordan: weekly on Fridays, £420 usual; transfer day the last working day; Bills topped up from his current account.
const jordan = (on = '2026-10-02') => household({ people: [{ id: 'jordan', name: 'Jordan', payAccount: 'cur', usualPay: 0, pattern: pat(7, 420, on) }],
  accounts: [acc('cur', 'Current account'), acc('bills', 'Bills account', { leftoverTo: 'cur' })],
  bills: bills([['Room rent', 560], ['Phone', 22], ['Gym', 25], ['Streaming', 11], ['Bus pass', 68]], 'bills'),
  savings: [{ id: 's1', name: 'Savings', amount: 60, fromAccount: 'cur' }], payday: { day: 'last', weekend: true } });
// Priya: £1,640 every four weeks on Thursdays, transfer day the 1st.
const priya = (on = '2026-10-08') => household({ people: [{ id: 'priya', name: 'Priya', payAccount: 'cur', usualPay: 0, pattern: pat(28, 1640, on) }],
  accounts: [acc('cur', 'Current account'), acc('bills', 'Bills account', { leftoverTo: 'cur' })],
  bills: bills([['Rent', 725], ['Council Tax', 128, CT], ['Energy', 85], ['Broadband', 28], ['Phone', 16], ['Contents insurance', 9]], 'bills'),
  budgets: [{ id: 'g1', name: 'Spending', amount: 380, account: 'cur' }], savings: [{ id: 's1', name: 'Savings', amount: 100, fromAccount: 'cur' }], payday: { day: 1, weekend: true } });
// Lewis (£1,020) and Amira (£880), every two weeks on alternate Fridays, half each into Joint.
const lewisAmira = (dated = true) => household({ people: [
  { id: 'lewis', name: 'Lewis', payAccount: 'lewis', usualPay: 0, pattern: pat(14, 1020, dated && '2026-10-09') },
  { id: 'amira', name: 'Amira', payAccount: 'amira', usualPay: 0, pattern: pat(14, 880, dated && '2026-10-02') }],
  accounts: [acc('lewis', "Lewis's account"), acc('amira', "Amira's account"), acc('joint', 'Joint account', { funding: { people: ['lewis', 'amira'], rule: 'equal' } })],
  bills: bills([['Household', 2070]], 'joint'), payday: { day: 'last', weekend: true } });
// Hannah (monthly, £2,050) and Marc (monthly £2,300, then weekly from Friday 15 January 2027 at £540), in proportion to pay.
const hannahMarc = () => household({ people: [{ id: 'hannah', name: 'Hannah', payAccount: 'hannah', usualPay: 2050 },
  { id: 'marc', name: 'Marc', payAccount: 'marc', usualPay: 0, pattern: pat(7, 540, '2027-01-15', '2027-01-15'), was: [{ until: '2027-01', usualPay: 2300 }] }],
  accounts: [acc('hannah', "Hannah's account"), acc('marc', "Marc's account"), acc('joint', 'Joint account', { funding: { people: ['hannah', 'marc'], rule: 'pay' } })],
  bills: bills([['Household', 2350]], 'joint'), payday: { day: 'last', weekend: true } });
// Sam: weekly on Mondays, £420, transfer day the 25th, £1,500 of bills (the Easter 2027 case).
const sam = (on = '2027-03-01') => household({ people: [{ id: 'sam', name: 'Sam', payAccount: 'cur', usualPay: 0, pattern: pat(7, 420, on) }],
  accounts: [acc('cur', 'Current account'), acc('bills', 'Bills account', { leftoverTo: 'cur' })],
  bills: bills([['Rent and bills', 1500]], 'bills'), payday: { day: 25, weekend: true } });
const view = r => ({ steps: r.steps.map(s => [s.id, P.r2(s.amt)]), floats: r.floats.map(f => [f.id, P.r2(f.amt)]) });
const keeps = (c, r) => Object.fromEntries(P.personKeeps(c, r).map(x => [x.p.id, P.r2(x.amt)]));
const shares = r => Object.fromEntries(r.steps.filter(s => s.kind === 'contribute').map(s => [s.person, P.r2(s.amt)]));
// The Pay tab's save (L3): month k's pay boxes as typed (or ticked: ticked[pid] true fills the box with the estimate).
function save(c, months, k, pay, o = {}) {
  const old = months[k] || {}, body = Object.assign({}, old, { pay: Object.assign({}, old.pay || {}, pay) });
  if (o.ticked) { body.payEstimated = Object.assign({}, old.payEstimated || {}); for (const pid of o.ticked) { body.payEstimated[pid] = true; body.pay[pid] = P.planPay(c, months, k, { pay: {} })[pid].arrived; } }
  else if (body.payEstimated) { body.payEstimated = Object.assign({}, body.payEstimated); for (const pid of Object.keys(pay)) delete body.payEstimated[pid]; if (!Object.keys(body.payEstimated).length) delete body.payEstimated; }
  if (o.extra) body.extra = Object.assign({}, body.extra || {}, o.extra);
  return Object.assign({}, months, { [k]: P.freezePaydays(c, months, k, body, old) });
}

// ---------- L13: data ----------
test('L13: normCfg keeps a recent payday and a first pay on a person, drops bad ones on their own, and strips them from was entries', () => {
  const base = (t, was) => ({ people: [Object.assign({ id: 'p', name: 'Jo', payAccount: 'a', usualPay: 0, pattern: t }, was ? { was } : {})], accounts: [acc('a', 'A')] });
  let rep = [], c = P.normCfg(base(pat(7, 420, '2026-10-02', '2026-09-25')), rep);
  assert.deepEqual(c.people[0].pattern, { every: 7, each: 420, on: '2026-10-02', since: '2026-09-25' }); assert.deepEqual(rep, []);
  for (const bad of ['2026-02-30', '2026-13-01', '1999-12-31', '2100-01-01', '2026-1-2', 20261002, '', null]) {
    rep = []; c = P.normCfg(base({ every: 7, each: 420, on: bad }), rep);
    assert.deepEqual(c.people[0].pattern, { every: 7, each: 420 }, String(bad)); assert.deepEqual(rep, ["a payday date that couldn't be used"]);
  }
  rep = []; c = P.normCfg(base({ every: 7, each: 420, since: '2026-10-02' }), rep);
  assert.deepEqual(c.people[0].pattern, { every: 7, each: 420 }, 'since without on goes'); assert.deepEqual(rep, ["a payday date that couldn't be used"]);
  rep = []; c = P.normCfg(base({ every: 7, each: 420, on: '2026-10-02', since: '2026-02-31' }), rep);
  assert.deepEqual(c.people[0].pattern, { every: 7, each: 420, on: '2026-10-02' }); assert.deepEqual(rep, ["a payday date that couldn't be used"]);
  rep = []; c = P.normCfg(base({ every: 7, each: 420, on: '2000-01-01', since: '2099-12-31' }), rep); assert.equal(c.people[0].pattern.since, '2099-12-31'); assert.deepEqual(rep, []);
  rep = []; c = P.normCfg(base(pat(7, 420, '2026-10-02'), [{ until: '2026-09', usualPay: 0, pattern: { every: 14, each: 900, on: '2026-01-02', since: '2026-01-02' } }]), rep);
  assert.deepEqual(c.people[0].was, [{ until: '2026-09', usualPay: 1950, pattern: { every: 14, each: 900 } }]); assert.deepEqual(rep, [], 'stripped without a word');
  rep = []; c = P.normCfg(base({ every: 30, each: 420, on: '2026-10-02' }), rep); assert.equal(c.people[0].pattern, undefined); assert.deepEqual(rep, ["a pay pattern that couldn't be used"]);
});

test('L13: normMonths keeps payday counts 0 to 6, edited only as true, and extraFrom/extraOf as a pair', () => {
  let rep = [];
  let m = P.normMonths({ '2026-11': { pay: { a: 1 }, paydays: { a: 5, b: 0, c: 6, d: 7, e: -1, f: 2.5, g: '4', h: null }, extra: { a: { amount: 420, edited: true }, b: { amount: 0, edited: 'yes' } } } }, rep);
  assert.deepEqual(m['2026-11'].paydays, { a: 5, b: 0, c: 6 }); assert.deepEqual(m['2026-11'].extra, { a: { amount: 420, edited: true }, b: { amount: 0 } });
  assert.deepEqual([...new Set(rep)], ["a payday count that couldn't be read"]); assert.equal(rep.length, 5);
  rep = []; m = P.normMonths({ x: {}, '2026-11': { paydays: { a: 'x' } }, '2026-12': { paydays: {} }, '2027-01': { paydays: [3] } }, rep);
  assert.equal('paydays' in m['2026-11'], false); assert.equal('paydays' in m['2026-12'], false); assert.equal('paydays' in m['2027-01'], false);
  assert.deepEqual(rep.filter(t => /payday count/.test(t)).length, 2, 'a bad entry and a non-object; an empty one goes silently');
  rep = []; m = P.normMonths({ '2027-05': { oneOffs: [
    { id: 'o1', kind: 'in', name: "Sam's extra payday from April", amount: 420, account: 'cur', extraFrom: '2027-04', extraOf: 'sam' },
    { id: 'o2', kind: 'in', name: 'x', amount: 1, account: 'cur', extraFrom: '2027-13', extraOf: 'sam' },
    { id: 'o3', kind: 'in', name: 'y', amount: 1, account: 'cur', extraFrom: '2027-04' },
    { id: 'o4', kind: 'in', name: 'z', amount: 1, account: 'cur', extraOf: 7 },
    { id: 'o5', kind: 'out', name: 'w', amount: 1, account: 'cur' }] } }, rep);
  const o = m['2027-05'].oneOffs; assert.equal(o.length, 5, 'the one-offs stay');
  assert.deepEqual([o[0].extraFrom, o[0].extraOf], ['2027-04', 'sam']);
  for (const x of o.slice(1)) { assert.equal('extraFrom' in x, false); assert.equal('extraOf' in x, false); }
  assert.deepEqual(rep, Array(3).fill("an extra payday used later that couldn't be read"));
  // Sound 2.16 data goes through unchanged.
  const s = { '2026-11': { pay: { a: 1 }, extra: { a: { amount: 3, counted: true } } } }; assert.deepEqual(P.normMonths(clone(s)), s);
});

// ---------- L4: dates aren't changes of pay ----------
test('L4: personSnap and dated edits use {every, each} only; personWas carries today\'s date back at the same interval', () => {
  const p = { id: 'j', usualPay: 1820, pattern: pat(7, 420, '2026-10-02', '2026-09-25') };
  assert.deepEqual(P.personSnap(p), { usualPay: 1820, pattern: { every: 7, each: 420 } });
  const before = P.personSnap(p); p.pattern = pat(7, 420, '2026-10-09');
  assert.equal(P.datePersonEdit(p, before, '2026-12'), false, 'a date alone is never dated'); assert.equal(p.was, undefined);
  p.pattern = pat(7, 450, '2026-10-09', '2026-09-25'); p.usualPay = P.usualMonthly(p);
  assert.equal(P.datePersonEdit(p, before, '2026-12'), true); assert.deepEqual(p.was, [{ until: '2026-11', usualPay: 1820, pattern: { every: 7, each: 420 } }]);
  assert.deepEqual(P.personWas(p, '2026-11').pattern, { every: 7, each: 420, on: '2026-10-09' }, 'same interval: today\'s on, not since');
  assert.deepEqual(P.personWas(p, '2026-12').pattern, pat(7, 450, '2026-10-09', '2026-09-25'));
  const q = { id: 'm', usualPay: 2340, pattern: pat(7, 540, '2027-01-15', '2027-01-15'), was: [{ until: '2026-12', usualPay: 1950, pattern: { every: 14, each: 900 } }, { until: '2027-01', usualPay: 2300 }] };
  assert.deepEqual(P.personWas(q, '2026-12').pattern, { every: 14, each: 900 }, 'another interval: no date');
  assert.equal(P.personWas(q, '2027-01').pattern, undefined, 'monthly then');
});

// ---------- L14: backups ----------
test('L14: a recent payday or a one-off marked extraFrom needs 2.17; months are optional', () => {
  assert.equal(P.PAYDAY_DATE_NEEDS, '2.17');
  const c = jordan(), c1 = jordan(null), m = { '2027-05': { oneOffs: [{ id: 'o', kind: 'in', name: 'x', amount: 1, account: 'cur', extraFrom: '2027-04', extraOf: 'jordan' }] } };
  assert.equal(P.backupNeedsFor(c), '2.17'); assert.equal(P.backupVersionFor(c), 6);
  assert.equal(P.backupNeedsFor(c1), '2.16'); assert.equal(P.backupNeedsFor(c1, {}), '2.16'); assert.equal(P.backupNeedsFor(c1, m), '2.17');
  const plain = household({ people: [{ id: 'a', name: 'A', payAccount: 'x', usualPay: 1 }], accounts: [acc('x', 'X')] });
  assert.equal(P.backupVersionFor(plain), 5); assert.equal(P.backupVersionFor(plain, m), 6); assert.equal(P.backupNeedsFor(plain, m), '2.17');
  const f = JSON.parse(P.backupJson(c1, m, null, 't')); assert.equal(f.version, 6); assert.equal(f.needs, '2.17');
  assert.equal(P.backupJson(plain, {}, null, 't'), '{"app":"payday-transfers","version":5,"savedAt":"t","config":' + JSON.stringify(plain) + ',"months":{}}');
  // A 2.16 page refuses such a file with its own words.
  assert.equal(P.backupRefusal(f, 6, '2.16'), '2.17'); assert.equal(P.backupRefusal(f, 6, '2.17'), null);
});

// ---------- L8: counting ----------
test('L8: transferWindow, and the 25th unmoved without a transfer day', () => {
  assert.deepEqual(P.transferWindow({ payday: { day: 'last', weekend: true } }, '2027-01'), { after: '2026-11-30', upTo: '2026-12-31' });
  assert.deepEqual(P.transferWindow({ payday: { day: 1, weekend: true } }, '2027-01'), { after: '2026-12-01', upTo: '2026-12-31' }, 'New Year\'s Day moves the transfer day');
  assert.deepEqual(P.transferWindow({ payday: {} }, '2026-11'), { after: '2026-09-25', upTo: '2026-10-25' }, 'Sun 25 Oct, not moved');
  assert.deepEqual(P.transferWindow({}, '2026-11'), { after: '2026-09-25', upTo: '2026-10-25' });
});

test('L8: Easter 2027, weekly on Mondays, transfer day the 25th: April counts 5 and May 3', () => {
  const c = sam(), t = c.people[0].pattern;
  assert.deepEqual(P.paydaysFor(c, 'sam', '2027-04'), ['2027-03-01', '2027-03-08', '2027-03-15', '2027-03-22', '2027-03-25']);
  assert.deepEqual(P.paydaysFor(c, 'sam', '2027-05'), ['2027-04-05', '2027-04-12', '2027-04-19']);
  // Any date in the series gives the same count: it steps from the window, not from on.
  for (const on of ['2019-01-07', '2027-03-29', '2035-12-31']) assert.deepEqual(P.paydaysIn(Object.assign({}, t, { on }), '2027-03-25', '2027-04-23'), ['2027-04-05', '2027-04-12', '2027-04-19'], on);
  assert.deepEqual(P.paydaysIn({ every: 7, each: 1 }, '2027-03-25', '2027-04-23'), [], 'no date');
});

test("L8: Lewis's New Year 2027: Friday 1 January is paid on Thursday 31 December, in January's window", () => {
  const c = lewisAmira();
  assert.deepEqual(P.paydaysFor(c, 'lewis', '2027-01'), ['2026-12-04', '2026-12-18', '2026-12-31']);
  assert.deepEqual(P.paydaysFor(c, 'lewis', '2027-02'), ['2027-01-15', '2027-01-29']);
  assert.deepEqual(P.paydaysFor(c, 'amira', '2026-11'), ['2026-10-02', '2026-10-16', '2026-10-30']);
  assert.equal(P.paydaysFor(lewisAmira(false), 'lewis', '2027-01'), null);
});

test('L8 and L20: since: paydays before it don\'t count, and a first pay on a bank holiday counts on the working day before', () => {
  const c = hannahMarc();
  assert.deepEqual(P.paydaysFor(c, 'marc', '2027-02'), ['2027-01-15', '2027-01-22', '2027-01-29'], 'Marc\'s first weekly month: 3 of 4');
  assert.equal(P.paydaysFor(c, 'marc', '2027-01'), null, 'paid every month then');
  // A first pay typed as Easter Monday, Mon 29 March 2027: it's paid on Thu 25 March, which counts.
  const t = pat(7, 420, '2027-03-29', '2027-03-29');
  assert.deepEqual(P.paydaysIn(t, '2027-02-25', '2027-03-25'), ['2027-03-25']);
  assert.deepEqual(P.paydaysIn(t, '2027-03-25', '2027-04-23'), ['2027-04-05', '2027-04-12', '2027-04-19']);
  assert.equal(P.patternStartMonth(sam(), 'sam', '2027-03-29'), '2027-04', 'the month whose window holds it (moved)');
  assert.equal(P.patternStartMonth(c, 'marc', '2027-01-15'), '2027-02', "Marc's 15 January 2027 gives February 2027");
  assert.equal(P.patternStartMonth(c, 'marc', '2027-02-30'), null);
});

test('L21: since removes paydays only from the window that holds it; "Change earlier months too" plans earlier months on each × N, not £0', () => {
  const c = hannahMarc(), marc = c.people[1];
  P.undateLast(marc); assert.equal(marc.was, undefined, 'Change earlier months too');
  const jan = P.planPay(c, {}, '2027-01').marc, dec = P.planPay(c, {}, '2026-12').marc;
  assert.deepEqual([jan.m, jan.used], [5, 2160], 'January 2027 (window to Thu 31 Dec) counts as if there were no since');
  assert.deepEqual([dec.m, dec.used], [4, 2160]);
  assert.deepEqual(P.paydaysFor(c, 'marc', '2027-02'), ['2027-01-15', '2027-01-22', '2027-01-29'], "Marc's February 2027 is still 3 of 4");
  assert.equal(P.planPay(c, {}, '2027-02').marc.used, 1620);
  // The window that holds since: it's moved first (L20), and a payday before it in that window doesn't count.
  const t = pat(7, 420, '2027-03-29', '2027-03-29');
  assert.deepEqual(P.paydaysIn(t, '2027-02-25', '2027-03-25'), ['2027-03-25']);
  assert.deepEqual(P.paydaysIn(t, '2027-01-25', '2027-02-25'), ['2027-02-01', '2027-02-08', '2027-02-15', '2027-02-22'], 'a window ending before since');
});

test('L8: counts run from N − 1 to N + 1 (N − 1 only across a moved transfer day or payday), and four-weekly can have 0', () => {
  const seen = { 7: {}, 14: {}, 28: {} }, days = [1, 8, 15, 25, 28, 'last'];
  for (const every of [7, 14, 28]) for (const day of days) for (let s = 0; s < every; s += every === 7 ? 1 : 3) {
    const c = { payday: { day, weekend: true } }, t = pat(every, 1, P.addDays('2026-01-05', s));
    for (let k = '2026-01'; k <= '2040-12'; k = P.shiftMonth(k, 1)) { const w = P.transferWindow(c, k), n = P.paydaysIn(t, w.after, w.upTo).length; seen[every][n] = (seen[every][n] || 0) + 1; }
  }
  const N = { 7: 4, 14: 2, 28: 1 };
  for (const e of [7, 14, 28]) { const ns = Object.keys(seen[e]).map(Number); assert.ok(Math.min(...ns) >= N[e] - 1 && Math.max(...ns) <= N[e] + 1, e + ': ' + JSON.stringify(seen[e])); assert.ok(seen[e][N[e] - 1] > 0, e + ' has N − 1'); }
  assert.ok(seen[28][0] > 0, 'four-weekly: 0');
});

test('nextPaydayOf, lastPaydayBy and monthOpensOn', () => {
  const t = pat(7, 420, '2027-03-01');
  assert.equal(P.nextPaydayOf(t, '2027-03-26'), '2027-04-05', 'Easter Monday was paid on Thu 25 Mar, before today');
  assert.equal(P.nextPaydayOf(t, '2027-03-25'), '2027-03-25');
  assert.equal(P.lastPaydayBy(t, '2027-03-28'), '2027-03-25');
  assert.equal(P.nextPaydayOf({ every: 7, each: 1 }, '2027-03-25'), null);
  assert.equal(P.nextPaydayOf(pat(7, 1, '2027-03-01', '2027-06-07'), '2027-03-26'), '2027-06-07', 'not before since');
  const pc = { day: 'last', weekend: true };
  assert.equal(P.monthOpensOn(pc, '2027-02'), '2027-01-19', 'February 2027 (transfer day Fri 29 Jan) opens on Tue 19 Jan');
  assert.equal(P.defaultMonth(pc, '2027-01-18'), '2027-01'); assert.equal(P.defaultMonth(pc, '2027-01-19'), '2027-02');
  assert.equal(P.monthOpensOn({}, '2027-02'), '2027-01-15');
});

// ---------- L2, L9: planPay ----------
test('L2: a month not typed plans on each × min(m, n); a typed month reads only what\'s stored; layer-1 entries are 2.16\'s', () => {
  const c = jordan(), k = '2026-11';
  const e = P.planPay(c, {}, k).jordan;
  assert.deepEqual(e, { kind: 'pattern', arrived: 1680, setAside: 0, used: 1680, typed: false, n: 4, each: 420, from: null,
    layer: 2, m: 5, dates: ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30'], expected: 2100, extraDefault: 420 });
  const g = P.planPay(sam(), {}, '2027-05').sam; assert.deepEqual([g.arrived, g.used, g.setAside, g.m, g.expected, g.extraDefault], [1260, 1260, 0, 3, 1260, 0], 'a gap month plans on what arrives');
  assert.equal(P.planPay(sam(), {}, '2027-05', undefined, { typical: true }).sam.used, 1680, 'typical: each × n');
  assert.equal(P.planPay(sam(), {}, '2027-05', undefined, { typical: true }).sam.layer, undefined);
  // A stored count wins over today's, while the box is empty (a box cleared later keeps its count, M7).
  const st = P.planPay(c, { [k]: { paydays: { jordan: 3 } } }, k).jordan; assert.deepEqual([st.used, st.m, st.dates], [1260, 3, null]);
  // Typed without a frozen count: layer 1, exactly 2.16 (no new fields).
  const l1 = P.planPay(c, { [k]: { pay: { jordan: 1851 }, extra: { jordan: { amount: 400 } } } }, k).jordan;
  assert.deepEqual(l1, { kind: 'pattern', arrived: 1851, setAside: 400, used: 1451, typed: true, n: 4, each: 420, from: k });
  assert.deepEqual(P.planPay(jordan(null), {}, k).jordan, { kind: 'pattern', arrived: 1680, setAside: 0, used: 1680, typed: false, n: 4, each: 420, from: null });
  // Typed and frozen: the box less the stored extra, whatever today's count; dates only while today's count matches.
  const fz = P.planPay(c, { [k]: { pay: { jordan: 2000 }, paydays: { jordan: 4 }, extra: { jordan: { amount: 100 } } } }, k).jordan;
  assert.deepEqual([fz.arrived, fz.setAside, fz.used, fz.layer, fz.m, fz.dates], [2000, 100, 1900, 2, 4, null]);
  // live.paydays and live.extra override the month (the Pay tab's working copy).
  const lv = P.planPay(c, {}, k, { pay: { jordan: 1851 }, extra: { jordan: { amount: 370.2 } }, paydays: { jordan: 5 } }).jordan;
  assert.deepEqual([lv.used, lv.layer, lv.m], [1480.8, 2, 5]);
  // Monthly people: unchanged.
  const h = hannahMarc(); assert.deepEqual(P.planPay(h, {}, '2027-02').hannah, { kind: 'month', arrived: 2050, setAside: 0, used: 2050, typed: false, n: null, each: null, from: null });
});

test("L2 and L3: rule 1's example: a tick stores 5 paydays and £420.00 (inert), £1,680.00 in the box; Jordan types £1,851 and it becomes £370.20", () => {
  const c = jordan(), k = '2026-11';
  let m = save(c, {}, k, {}, { ticked: ['jordan'] });
  assert.deepEqual(m[k].pay, { jordan: 1680 }); assert.deepEqual(m[k].paydays, { jordan: 5 }); assert.deepEqual(m[k].extra, { jordan: { amount: 420 } });
  let e = P.planPay(c, m, k).jordan; assert.deepEqual([e.arrived, e.setAside, e.used], [1680, 0, 1680], 'a 2.16 page reads the same');
  m = save(c, m, k, { jordan: 1851 });
  assert.deepEqual(m[k].extra, { jordan: { amount: 370.2 } }); assert.equal(m[k].payEstimated, undefined);
  e = P.planPay(c, m, k).jordan; assert.deepEqual([e.arrived, e.setAside, e.used], [1851, 370.2, 1480.8]);
  // The line never opens counted from the freeze; extraState says the freeze opened it.
  assert.deepEqual(P.extraState(c, m, k, 'jordan', m[k]), { opened: 'freeze', lockedIn: null, not: false, counted: false, m: 5, n: 4 });
  assert.equal(P.extraDefaultFor(c, m, k, 'jordan', m[k]), 370.2);
});

// ---------- L3: the freeze ----------
test('L3: freezePaydays freezes only when a box goes from empty to a figure while the person has a date', () => {
  const c = jordan(), k = '2026-12', body = { pay: { jordan: 1560 } };
  const m1 = P.freezePaydays(c, {}, k, body, {});
  assert.deepEqual(m1, { pay: { jordan: 1560 }, paydays: { jordan: 4 } }, '4 paydays: a count and no line'); assert.notEqual(m1, body);
  assert.equal(P.freezePaydays(jordan(null), {}, k, body, {}), body, 'no date: the body itself');
  assert.equal(P.freezePaydays(c, {}, k, body, { pay: { jordan: 1500 } }), body, 'typed before (in layer 1): never frozen later (M6)');
  const plain = household({ people: [{ id: 'a', name: 'A', payAccount: 'x', usualPay: 1 }], accounts: [acc('x', 'X')] }), b2 = { pay: { a: 5 } };
  assert.equal(P.freezePaydays(plain, {}, k, b2, {}), b2);
  // A box cleared later keeps its count.
  const cleared = P.freezePaydays(c, { [k]: m1 }, k, { pay: { jordan: null }, paydays: { jordan: 4 } }, m1); assert.deepEqual(cleared.paydays, { jordan: 4 });
  // A stored count isn't counted again, whatever today's dates.
  const again = P.freezePaydays(jordan('2026-10-05'), {}, k, { pay: { jordan: 1 }, paydays: { jordan: 3 } }, {}); assert.deepEqual(again.paydays, { jordan: 3 });
  // L22 (a): a line already there when the month is frozen is the household's own: marked edited, never rewritten.
  const k5 = '2026-11', withLink = P.freezePaydays(c, {}, k5, { pay: { jordan: 2000 }, extra: { jordan: { amount: 999, counted: true } } }, {});
  assert.deepEqual(withLink.extra, { jordan: { amount: 999, counted: true, edited: true } });
  assert.deepEqual(P.freezePaydays(c, { [k5]: withLink }, k5, Object.assign({}, withLink, { pay: { jordan: 2500 } }), withLink).extra, withLink.extra);
  // The line the freeze opens follows typed pay, counted or not.
  const opened = P.freezePaydays(c, {}, k5, { pay: { jordan: 2000 } }, {}); assert.deepEqual(opened.extra, { jordan: { amount: 400 } });
  const cnt = Object.assign({}, opened, { extra: { jordan: { amount: 400, counted: true } } });
  assert.deepEqual(P.freezePaydays(c, { [k5]: cnt }, k5, Object.assign({}, cnt, { pay: { jordan: 2100 } }), cnt).extra, { jordan: { amount: 420, counted: true } });
  const edited = P.freezePaydays(c, {}, k5, { pay: { jordan: 2000 }, extra: { jordan: { amount: 999, edited: true } } }, {});
  assert.deepEqual(edited.extra, { jordan: { amount: 999, edited: true } });
});

test('L3: "Not an extra payday" and "It was an extra payday"', () => {
  const c = jordan(), k = '2026-11';
  let m = save(c, {}, k, { jordan: 2100 }); assert.deepEqual(m[k].extra, { jordan: { amount: 420 } });
  m = save(c, m, k, {}, { extra: { jordan: { amount: 0, edited: true } } });
  assert.deepEqual(m[k].extra, { jordan: { amount: 0, edited: true } }, 'the next save doesn\'t put the default back');
  assert.equal(P.planPay(c, m, k).jordan.used, 2100); assert.equal(P.extraState(c, m, k, 'jordan', m[k]).not, true);
  assert.equal(P.notExtraWords('Jordan', 5), "All 5 of Jordan's paydays are in these transfers.");
  m = save(c, m, k, {}, { extra: { jordan: { amount: 0 } } }); // "It was an extra payday": edited goes, the default comes back
  assert.deepEqual(m[k].extra, { jordan: { amount: 420 } }); assert.equal(P.planPay(c, m, k).jordan.used, 1680);
  // A line opened from "Had an extra payday?" (once pay is typed, so after the freeze) in a month with no extra counted is
  // 2.16's: never rewritten.
  let m4 = save(c, {}, '2026-12', { jordan: 1700 }); m4 = save(c, m4, '2026-12', { jordan: 1750 }, { extra: { jordan: { amount: 420 } } });
  assert.deepEqual(m4['2026-12'].extra, { jordan: { amount: 420 } }, 'not rewritten: the count isn\'t above usual');
  assert.equal(P.extraState(c, m4, '2026-12', 'jordan', m4['2026-12']).opened, 'link');
  assert.equal(P.extraState(c, m4, '2026-12', 'nobody', m4['2026-12']), null);
});

// ---------- L5: a change of interval ----------
test('L5: a change of interval clears and freezes again only the months named', () => {
  const before = jordan(), k1 = '2026-11', k2 = '2026-12';
  let m = save(before, {}, k1, { jordan: 2100 }); m = save(before, m, k2, { jordan: 1680 });
  m[k1] = Object.assign({}, m[k1], { extra: { jordan: { amount: 420 } } });
  const after = clone(before); after.people[0].pattern = pat(14, 840, '2026-10-02'); after.people[0].usualPay = P.usualMonthly(after.people[0]);
  assert.deepEqual(P.intervalChangedMonths(before, after, m, 'jordan'), [k1, k2]);
  const out = P.refreezeInterval(after, m, 'jordan', [k2], before);
  assert.equal(out[k1], m[k1], 'not named: the same month'); assert.deepEqual(out[k2].paydays, { jordan: 2 });
  const all = P.refreezeInterval(after, m, 'jordan', [k1, k2], before);
  assert.deepEqual(P.refreezeInterval(after, m, 'jordan', [k1])[k1].extra, { jordan: { amount: 420, edited: true } }, 'without the settings before, nothing is cleared');
  assert.deepEqual(all[k1].paydays, { jordan: 3 }); assert.deepEqual(all[k1].extra, { jordan: { amount: 700 } }, 'fortnightly: 3 in November, 2100 × 1 ÷ 3');
  // A counted line the count opened stays the count's: still counted, not edited, and it follows typed pay (L22 ruling).
  const mc = Object.assign({}, m, { [k1]: Object.assign({}, m[k1], { extra: { jordan: { amount: 420, counted: true } } }) });
  const rc = P.refreezeInterval(after, mc, 'jordan', [k1], before)[k1];
  assert.deepEqual(rc.extra, { jordan: { amount: 700, counted: true } }); assert.deepEqual(rc.paydays, { jordan: 3 });
  // Edited or counted extras stay; a person without a date then gets no count.
  m[k1].extra = { jordan: { amount: 5, edited: true } };
  assert.deepEqual(P.refreezeInterval(after, m, 'jordan', [k1], before)[k1].extra, { jordan: { amount: 5, edited: true } });
  const nodate = clone(after); delete nodate.people[0].pattern.on;
  assert.equal(P.refreezeInterval(nodate, m, 'jordan', [k2], before)[k2].paydays, undefined);
  // Dated changes: only the months whose interval differs.
  const dated = clone(after); dated.people[0].was = [{ until: k1, usualPay: 1820, pattern: { every: 7, each: 420 } }];
  assert.deepEqual(P.intervalChangedMonths(before, dated, m, 'jordan'), [k2]);
});

// ---------- L22: lines the household opened are its own ----------
test('L22 (b): changing the interval in a household without a date leaves every saved month as it was (the review\'s M2)', () => {
  const one = (t) => household({ people: [{ id: 'jo', name: 'Jo', payAccount: 'cur', usualPay: 0, pattern: t }],
    accounts: [acc('cur', 'Current account'), acc('bills', 'Bills account', { leftoverTo: 'cur' })], bills: bills([['Rent', 600]], 'bills'), payday: { day: 'last', weekend: true } });
  const before = one(pat(7, 420)), after = one(pat(14, 840)), k = '2026-12';
  const m = { '2026-11': { pay: { jo: 1680 }, done: {} }, [k]: { pay: { jo: 2100 }, extra: { jo: { amount: 500 } }, done: {} } };
  assert.equal(P.r2(P.calcMonth(before, m, k).flt), 1000);
  const keys = P.intervalChangedMonths(before, after, m, 'jo'); assert.deepEqual(keys, ['2026-11', k]);
  const out = P.refreezeInterval(after, m, 'jo', keys, before);
  for (const x of keys) assert.equal(out[x], m[x], x + ': the very same month');
  assert.equal(JSON.stringify(out), JSON.stringify(m)); assert.equal(P.r2(P.calcMonth(after, out, k).flt), 1000, 'the £500 stays set aside');
  assert.deepEqual(P.refreezeInterval(after, m, 'jo', keys), m, 'without the settings before, too');
  // With a date now, a month typed before it (no count) stays layer 1: no count, no extra, the same object.
  const dated = one(pat(14, 840, '2026-10-02')), out2 = P.refreezeInterval(dated, m, 'jo', [k], before);
  assert.equal(out2[k], m[k]);
  // A line the household opened in a counted month (count not above usual) isn't cleared by the change either.
  const c7 = one(pat(7, 420, '2026-10-02')), m7 = { [k]: { pay: { jo: 1700 }, paydays: { jo: 4 }, extra: { jo: { amount: 300 } } } };
  assert.deepEqual(P.refreezeInterval(one(pat(14, 840, '2026-10-02')), m7, 'jo', [k], c7)[k].extra, { jo: { amount: 300, edited: true } });
});

test("L22 (a): a link line typed before the date was added keeps the household's amount when pay is cleared and typed again (the review's minor 5)", () => {
  const k = '2026-11';
  let m = { [k]: { pay: { jordan: 2100 }, extra: { jordan: { amount: 300 } } } }; // layer 1: typed, then "Had an extra payday?" £300
  const c = jordan(); // the date is added later
  m = save(c, m, k, { jordan: null }); assert.equal(m[k].paydays, undefined, 'clearing the box freezes nothing');
  m = save(c, m, k, { jordan: 2150 });
  assert.deepEqual(m[k].paydays, { jordan: 5 }); assert.deepEqual(m[k].extra, { jordan: { amount: 300, edited: true } });
  assert.equal(P.planPay(c, m, k).jordan.used, 1850);
  m = save(c, m, k, { jordan: 2200 }); assert.deepEqual(m[k].extra, { jordan: { amount: 300, edited: true } }, 'never rewritten');
});

test('L22 (c): a payday date that can\'t be used doesn\'t make a file need 2.17', () => {
  const c = jordan(null); c.people[0].pattern.on = '0002-11-06';
  assert.equal(P.hasPaydayDates(c), false); assert.equal(P.backupNeedsFor(c), '2.16');
  c.people[0].pattern.on = '2026-02-30'; assert.equal(P.backupNeedsFor(c), '2.16');
  c.people[0].pattern.on = '2026-11-06'; assert.equal(P.backupNeedsFor(c), '2.17');
});

test('L6: Easter 2027: April sets £420.00 aside, May is £240.00 short with 3 paydays, and "Use it this month" leaves £180.00', () => {
  const c = sam();
  let m = save(c, {}, '2027-04', { sam: 2100 });
  assert.deepEqual(m['2027-04'].paydays, { sam: 5 }); assert.deepEqual(m['2027-04'].extra, { sam: { amount: 420 } });
  assert.equal(P.r2(P.calcMonth(c, m, '2027-04').flt), 180);
  assert.equal(P.r2(P.calcMonth(c, m, '2027-05').flt), -240); assert.equal(P.planPay(c, m, '2027-05').sam.m, 3);
  const o = P.useExtraOffer(c, m, '2027-05', 'sam');
  assert.deepEqual(o, { kind: 'in', name: "Sam's extra payday from April", amount: 420, account: 'cur', extraFrom: '2027-04', extraOf: 'sam' });
  assert.equal(P.useExtraWords(c, 'sam', o), "Last month's extra payday (£420.00) was set aside. If it's still in Sam's account, use it this month.");
  m = Object.assign({}, m, { '2027-05': { oneOffs: [Object.assign({ id: 'o1' }, o)] } });
  assert.equal(P.r2(P.calcMonth(c, m, '2027-05').flt), 180);
  assert.equal(m['2027-05'].paydays, undefined, 'it doesn\'t freeze May');
  assert.equal(P.useExtraOffer(c, m, '2027-05', 'sam'), null, 'not offered twice');
  assert.equal(P.extraLock(m, '2027-04', 'sam'), '2027-05'); assert.equal(P.extraState(c, m, '2027-04', 'sam', m['2027-04']).lockedIn, '2027-05');
  assert.equal(P.usedInWords('2027-05'), 'Used in May 2027.');
  assert.equal(P.extraUsedIn(m, '2027-05', 'sam').id, 'o1');
  assert.equal(P.usedExtraWords(c, 'sam', m['2027-05'].oneOffs[0]), "Sam's extra payday from April (£420.00) is in these transfers as a one-off.");
  // While locked, April's default isn't rewritten when its pay is saved again.
  const m2 = save(c, m, '2027-04', { sam: 2200 }); assert.deepEqual(m2['2027-04'].extra, { sam: { amount: 420 } });
  // Removing the one-off unlocks it.
  const m3 = save(c, Object.assign({}, m2, { '2027-05': { oneOffs: [] } }), '2027-04', { sam: 2200 }); assert.deepEqual(m3['2027-04'].extra, { sam: { amount: 440 } });
  assert.equal(P.backupNeedsFor(jordan(null), m), '2.17');
  // Not offered: counted, £0, not typed, a month with the usual count, someone without a date.
  const variants = [['counted', { amount: 420, counted: true }], ['zero', { amount: 0, edited: true }]];
  for (const [why, x] of variants) { const mm = clone(m); mm['2027-05'] = {}; mm['2027-04'].extra = { sam: x }; assert.equal(P.useExtraOffer(c, mm, '2027-05', 'sam'), null, why); }
  const ticked = save(c, {}, '2027-04', {}, { ticked: ['sam'] }); assert.equal(P.useExtraOffer(c, ticked, '2027-05', 'sam'), null, 'April only ticked');
  assert.equal(P.useExtraOffer(c, m, '2027-06', 'sam'), null);
  assert.equal(P.useExtraOffer(sam(null), m, '2027-05', 'sam'), null);
});

// ---------- the worked examples' layer-2 figures ----------
test('worked examples, layer 2: Priya\'s January 2027, Lewis and Amira, Marc\'s first weekly month and his extra paydays', () => {
  let c = priya(), m = save(c, {}, '2027-01', { priya: 3280 });
  assert.deepEqual(m['2027-01'].paydays, { priya: 2 }); assert.deepEqual(m['2027-01'].extra, { priya: { amount: 1640 } });
  let r = P.calcMonth(c, m, '2027-01'); assert.equal(P.r2(r.flt), 169); assert.equal(P.planPay(c, m, '2027-01').priya.used, 1640);
  for (const k of ['2026-11', '2026-12', '2027-02']) assert.equal(P.planPay(c, {}, k).priya.m, 1, k);
  // Counted in January 2028 instead: left over £1,809.00.
  m = save(c, m, '2028-01', { priya: 3280 }); m['2028-01'].extra = { priya: Object.assign({}, m['2028-01'].extra.priya, { counted: true }) };
  assert.equal(P.r2(P.calcMonth(c, m, '2028-01').flt), 1809);
  // Lewis and Amira: Amira's November 2026 and Lewis's January 2027 set aside their default, an average pay.
  c = lewisAmira(); m = save(c, {}, '2026-11', { lewis: 2040, amira: 2640 }); m = save(c, m, '2027-01', { lewis: 3060, amira: 1760 });
  assert.deepEqual(m['2026-11'].extra, { amira: { amount: 880 } }); assert.deepEqual(m['2027-01'].extra, { lewis: { amount: 1020 } });
  for (const k of ['2026-11', '2027-01']) { r = P.calcMonth(c, m, k); assert.deepEqual(shares(r), { lewis: 1035, amira: 1035 }, k); assert.deepEqual(keeps(c, r), { lewis: 1005, amira: 725 }, k); }
  assert.equal(P.planPay(c, m, '2027-02').lewis.used, 2040, "February isn't given January's third payday");
  // Hannah and Marc: February 2027 has 3 weekly pays; May and August 2027 set aside £587.40 and £568.80.
  c = hannahMarc();
  const feb = P.planPay(c, {}, '2027-02').marc; assert.deepEqual([feb.m, feb.n, feb.used], [3, 4, 1620]);
  m = save(c, {}, '2027-02', { hannah: 2050, marc: 1707 }); assert.deepEqual(m['2027-02'].paydays, { marc: 3 }); assert.equal(m['2027-02'].extra, undefined);
  m = save(c, m, '2027-05', { hannah: 2050, marc: 2937 }); m = save(c, m, '2027-08', { hannah: 2050, marc: 2844 });
  assert.deepEqual(m['2027-05'].extra, { marc: { amount: 587.4 } }); assert.deepEqual(m['2027-08'].extra, { marc: { amount: 568.8 } });
  r = P.calcMonth(c, m, '2027-05'); assert.deepEqual(shares(r), { hannah: 1097.38, marc: 1252.62 }); assert.deepEqual(keeps(c, r), { hannah: 952.62, marc: 1096.98 });
  assert.deepEqual(keeps(c, P.calcMonth(c, m, '2027-08')), { hannah: 952.62, marc: 1022.58 });
});

// ---------- L11: Analysis's measured average ----------
test('L11: avgIncome measures typed pay per counted payday over the last 6 months (Jordan £1,837.62 in June 2027)', () => {
  const c = jordan(), m = {};
  const typed = { '2026-11': [1851, 5], '2026-12': [1560, 4], '2027-01': [2146, 5], '2027-02': [1650, 4], '2027-03': [1690, 4], '2027-05': [2176, 5], '2027-06': [1820, 4] };
  for (const [k, [v, n]] of Object.entries(typed)) { m[k] = { pay: { jordan: v }, paydays: { jordan: n } }; if (n > 4) m[k].extra = { jordan: { amount: P.r2(v / n) } }; }
  const x = P.avgIncome(c, m, '2027-06').people[0];
  assert.deepEqual(x, { id: 'jordan', name: 'Jordan', avg: 1837.62, months: 6, pattern: c.people[0].pattern, perPay: 424.07 });
  assert.equal(P.incomeLabel(x), "Jordan's pay (about £1,837.62 a month: an average of £424.07 a payday over 6 months)");
  // Left out: "Not an extra payday", an extra in a month with the usual count, another interval, no count; with none, layer 1.
  const m2 = clone(m); m2['2027-06'].extra = { jordan: { amount: 0, edited: true } }; m2['2027-03'].extra = { jordan: { amount: 10 } }; delete m2['2027-02'].paydays;
  assert.equal(P.avgIncome(c, m2, '2027-06').people[0].months, 4, 'November, December, January and May');
  const one = { '2026-12': { pay: { jordan: 1600 }, paydays: { jordan: 4 } } };
  assert.equal(P.avgIncome(c, one, '2027-06').people[0].avg, 1733.33); assert.equal(P.incomeLabel(P.avgIncome(c, one, '2027-06').people[0]), "Jordan's pay (about £1,733.33 a month: an average of £400.00 a payday over 1 month)");
  const none = P.avgIncome(jordan(null), m, '2027-06').people[0]; assert.deepEqual(none, { id: 'jordan', name: 'Jordan', avg: 1820, months: 0, pattern: { every: 7, each: 420 } });
  assert.equal(P.incomeLabel(none), "Jordan's pay (about £1,820.00 a month: £420.00 a week)");
  assert.equal(P.incomeLabel({ name: 'Alex', avg: 1, months: 3 }), "Alex's pay (average of 3 months)"); assert.equal(P.incomeLabel({ name: '', avg: 1, months: 0 }), 'Pay (usual pay)');
  // Priya, June 2027: £1,776.67.
  const pc = priya(), pm = {}; for (let k = '2026-11'; k <= '2027-06'; k = P.shiftMonth(k, 1)) pm[k] = { pay: { priya: k === '2027-01' ? 3280 : 1640 }, paydays: { priya: k === '2027-01' ? 2 : 1 } };
  pm['2027-01'].extra = { priya: { amount: 1640 } }; assert.equal(P.avgIncome(pc, pm, '2027-06').people[0].avg, 1776.67);
  // The export's words.
  const md = P.exportMarkdown(c, m, '2027-06-20', { version: '2.17' }); assert.match(md, /Jordan 1837\.62 \(average of 6 typed months: 424\.07 a payday\)/);
});

// ---------- L12: Month by month ----------
test('L12: monthExtras lists paydays more or fewer than usual in months not typed, and extrasText says them', () => {
  const c = lewisAmira(), e = P.monthExtras(c, {}, '2027-01');
  assert.deepEqual(e.paydays, [{ person: 'lewis', name: 'Lewis', m: 3, n: 2, amount: 1020 }]);
  assert.equal(P.extrasText(e, true), 'Lewis: an extra payday, about £1,020.00 (set aside unless you count it)');
  assert.equal(P.extrasText(e, true, P.n2), 'Lewis: an extra payday, about 1020.00 (set aside unless you count it)');
  const g = P.monthExtras(hannahMarc(), {}, '2027-02'); assert.equal(P.extrasText(g), 'Marc: 3 paydays, not the usual 4');
  assert.equal(P.extrasText({ bills: [], oneOffsOut: [], oneOffsIn: [], paydays: [{ name: 'Priya', m: 0, n: 1, amount: 1640 }] }), 'Priya: no paydays, not the usual 1');
  assert.equal('paydays' in P.monthExtras(c, {}, '2027-02'), false, 'the usual count: no list');
  assert.equal('paydays' in P.monthExtras(lewisAmira(false), {}, '2027-01'), false, 'no date: no list');
  const typed = save(c, {}, '2027-01', { lewis: 3060, amira: 1760 }); assert.equal('paydays' in P.monthExtras(c, typed, '2027-01'), false, 'typed: no list');
});

// ---------- L16: exports ----------
test('L16: exports say "not an extra payday" and one more preface sentence when someone has a date', () => {
  const c = jordan(), k = '2026-11';
  let m = save(c, {}, k, { jordan: 2100 }); m = save(c, m, k, {}, { extra: { jordan: { amount: 0, edited: true } } });
  const row = P.savedMonthRow(c, m, k); assert.deepEqual(row.extra, [{ person: 'jordan', amount: 0, counted: false, not: true }]);
  const md = P.exportMarkdown(c, m, '2026-11-20', { version: '2.17' });
  assert.match(md, /\| Jordan: not an extra payday \|/);
  const S = "With a recent payday, Dovetail counts each person's paydays between transfer days and sets an extra one aside unless it's counted.";
  assert.ok(md.includes("over a year ÷ 12. " + S)); assert.ok(!P.exportMarkdown(jordan(null), m, '2026-11-20', { version: '2.17' }).includes(S));
  // A layer-1 £0 line is 2.16's.
  const l1 = { [k]: { pay: { jordan: 2100 }, extra: { jordan: { amount: 0, edited: true } } } };
  assert.deepEqual(P.savedMonthRow(jordan(null), l1, k).extra, [{ person: 'jordan', amount: 0, counted: false }]);
});

// ---------- setup and words ----------
test('L15: setupSettings copies "A recent payday" to pattern.on for someone on a pattern', () => {
  const s = { people: [{ id: 'p1', name: 'Kerry', pay: '1560', every: 28, on: '2026-10-15', payAccount: 'a1' }, { id: 'p2', name: 'Dan', pay: '2480', on: '2026-10-15', payAccount: 'a1' }],
    accounts: [{ id: 'a1', name: 'Joint', colour: 'blue', leftoverTo: null }], income: [], bills: {}, budgets: [], savings: [], payday: { day: 'last' }, ans: { fun: null, funAmt: {}, rule: null, set: {}, two: 'no', payer: null, gets: {}, getsAmt: {}, board: {}, boardAmt: {} }, shape: 'joint', style: 'pool' };
  const c = P.setupSettings(s, null, { today: '2026-10-20' }).cfg;
  assert.deepEqual(c.people[0].pattern, { every: 28, each: 1560, on: '2026-10-15' }); assert.equal(c.people[1].pattern, undefined);
  s.people[0].on = '2026-02-30'; assert.deepEqual(P.setupSettings(s, null, {}).cfg.people[0].pattern, { every: 28, each: 1560 });
  s.people[0].on = ''; assert.deepEqual(P.setupSettings(s, null, {}).cfg.people[0].pattern, { every: 28, each: 1560 });
});

test('date words and plain sentences', () => {
  assert.equal(P.shortDay('2026-10-30'), 'Fri 30 Oct'); assert.equal(P.dayDate('2026-10-15'), 'Thursday 15 October');
  assert.equal(P.datesWords(['2026-11-06', '2026-11-13', '2026-11-20', '2026-11-27']), '6, 13, 20 and 27 Nov');
  assert.equal(P.datesWords(['2026-10-30', '2026-11-06', '2026-11-13']), '30 Oct, 6 and 13 Nov');
  assert.equal(P.datesWords(['2026-10-30', '2026-11-06']), '30 Oct and 6 Nov');
  assert.equal(P.datesWords(['2026-12-27', '2026-12-31', '2027-01-03']), '27 and 31 Dec, 3 Jan');
  assert.equal(P.datesWords(['2027-01-15']), '15 Jan'); assert.equal(P.datesWords([]), '');
  assert.equal(P.datesWordsFull(['2026-10-30', '2026-11-06', '2026-11-13']), '30 October, 6 and 13 November');
  assert.equal(P.datesWordsFull(['2026-12-31', '2027-01-07']), '31 December 2026 and 7 January 2027');
  assert.equal(P.frozenWords(5), '5 paydays (counted when this month was first saved)'); assert.equal(P.frozenWords(1), '1 payday (counted when this month was first saved)');
  const two = household({ people: [{ id: 'k', name: 'Kerry', payAccount: 'x', usualPay: 0, pattern: pat(28, 1560, '2026-10-15') }, { id: 'd', name: 'Dan', payAccount: 'x', usualPay: 2480 },
    { id: 'j', name: 'Jordan', payAccount: 'x', usualPay: 0, pattern: pat(7, 420, '2026-10-02') }], accounts: [acc('x', 'X')], payday: { day: 'last' } });
  assert.equal(P.lastPayWords(two, '2026-10-30'), "Kerry's last pay before then: Thursday 15 October, and Jordan's: Friday 30 October.");
  assert.equal(P.lastPayWords(jordan(null), '2026-10-30'), '');
  assert.deepEqual([P.everyAdjective(7), P.everyAdjective(14), P.everyAdjective(28)], ['weekly', 'two-weekly', 'four-weekly']);
  assert.deepEqual(P.firstPayChange(hannahMarc(), 'marc', 7, '2027-01-15'), { k: '2027-02', opensOn: '2027-01-19',
    text: "Marc's first weekly pay is for February 2027. Make this change from Tuesday 19 January, when Dovetail moves on to February 2027." });
});

// ---------- L9: every reader plans on the counted figure, except two on the typical one ----------
test('L9: the Pay tab, setup\'s preview, predictedFloat, projectedFloat and calcMonth agree on the counted figure; averageShort and standingOrders use the typical one', () => {
  for (const [c, keys] of [[sam(), ['2027-04', '2027-05', '2027-06']], [jordan(), ['2026-11', '2026-12']], [hannahMarc(), ['2027-02', '2027-05']], [priya(), ['2027-01', '2027-02']]]) {
    const months = {}, ids = c.people.map(p => p.id);
    for (const k of keys) {
      const none = Object.fromEntries(ids.map(id => [id, null]));
      const payTab = P.planPay(c, months, k, { pay: none, extra: {}, payEstimated: {} }), preview = P.planPay(c, {}, k), plan = P.planPay(c, months, k);
      const used = Object.fromEntries(ids.map(id => [id, plan[id].used]));
      for (const id of ids) { assert.equal(payTab[id].used, used[id], k + id); assert.equal(preview[id].used, used[id], k + id); }
      const flt = P.calcMonth(c, months, k).flt;
      assert.equal(P.projectedFloat(c, months, k, [k])[0].float, flt);
      assert.equal(P.calc(P.cfgFor(c, k, []), P.mNum(k), used, []).flt, flt);
      // predictedFloat on the month once typed: the float before pay was typed (each × min(m, n), with the frozen count).
      const typed = save(c, months, k, Object.fromEntries(ids.map(id => [id, 999])));
      assert.equal(P.predictedFloat(c, typed, k), flt, 'predicted ' + k);
    }
    // averageShort and standingOrders: the same with or without a date.
    const c1 = clone(c); c1.people.forEach(p => { if (p.pattern) { delete p.pattern.on; delete p.pattern.since; } });
    for (const k of keys) {
      assert.deepEqual(P.standingOrders(c, {}, k), P.standingOrders(c1, {}, k), 'standing orders ' + k);
      const inc = P.avgIncome(c1, {}, k); assert.deepEqual(P.averageShort(c, k, inc.pay), P.averageShort(c1, k, inc.pay), 'averageShort ' + k);
    }
  }
  // Marc's standing order: £313.16 a week, from February 2027 (the gap month doesn't change it).
  const so = P.standingOrders(hannahMarc(), {}, '2027-02').marc.orders; assert.equal(so.length, 1); assert.equal(so[0].amount, 313.16);
});

// ---------- existing households: exactly as 2.16.1 had them ----------
const layer1Households = () => {
  const out = [];
  const s = sample36(); out.push(['sample36 (monthly)', s.c, s.m, '2026-06']);
  const j = jordan(null), jm = {};
  [['2026-11', 1851], ['2026-12', 1560], ['2027-01', 2146, { amount: 412 }], ['2027-02', 1650], ['2027-03', 1690], ['2027-05', 2176, { amount: 406, counted: true }], ['2027-06', 1820]].forEach(([k, v, x], i) => {
    jm[k] = { pay: { jordan: v }, done: i % 2 ? { 's:s1': 60 } : {} }; if (x) jm[k].extra = { jordan: x }; });
  jm['2027-07'] = { pay: { jordan: 1680 }, payEstimated: { jordan: true }, done: { 's:s1': 60 } };
  out.push(['Jordan, layer 1', j, jm, '2027-03']);
  const la = lewisAmira(false), lm = { '2026-11': { pay: { lewis: 2040, amira: 2640 }, extra: { amira: { amount: 880 } } }, '2027-01': { pay: { lewis: 3060 } } };
  out.push(['Lewis and Amira, layer 1', la, lm, '2026-12']);
  const pr = priya(null), pm = { '2027-01': { pay: { priya: 3280 }, extra: { priya: { amount: 1640 } } } };
  out.push(['Priya, layer 1', pr, pm, '2027-01']);
  const hm = hannahMarc(); hm.people[1].pattern = pat(7, 540); out.push(['Hannah and Marc, layer 1', hm, { '2027-02': { pay: { hannah: 2050, marc: 1707 } } }, '2027-02']);
  return out;
};
function snapshot(Q, c, m, k0) {
  const s = {}, keys = []; for (let i = -4; i < 14; i++) keys.push(Q.shiftMonth(k0, i));
  for (const k of keys) { s[k] = { plan: Q.planPay(clone(c), clone(m), k), calc: view(Q.calcMonth(clone(c), clone(m), k)), extras: Q.extrasText(Q.monthExtras(clone(c), clone(m), k), true) }; }
  s.so = Q.standingOrders(clone(c), clone(m), k0); s.pic = JSON.stringify(Q.monthlyPicture(clone(c), clone(m), k0));
  s.pf = JSON.stringify(Q.projectedFloat(clone(c), clone(m), k0)); s.hist = JSON.stringify(Q.payHistory(clone(c), clone(m), k0));
  s.md = Q.exportMarkdown(clone(c), clone(m), k0 + '-20', { version: 'x' }); s.csv = Q.exportCsv(clone(c), clone(m), k0 + '-20');
  s.backup = Q.backupJson(clone(c), clone(m), null, 't'); s.norm = JSON.stringify([Q.normCfg(clone(c)), Q.normMonths(clone(m))]);
  s.notes = JSON.stringify(Q.notificationSchedule(clone(c), clone(m), k0 + '-05', 60));
  return s;
}
test('existing households (monthly, and on a pattern without a date) are exactly as 2.16.1 had them', { skip: !P2161 && 'no git history' }, () => {
  for (const [name, c, m, k] of layer1Households()) assert.deepEqual(snapshot(P, c, m, k), snapshot(P2161, c, m, k), name);
});

// ---------- a 2.16 page reads 2.17's frozen months the same ----------
test("a 2.16 page's planPay gives the same figures on every typed or ticked month, before and after the date is removed", { skip: !P216 && 'no git history' }, () => {
  const cases = [];
  { const c = jordan(); let m = {};
    m = save(c, m, '2026-11', {}, { ticked: ['jordan'] }); m = save(c, m, '2026-11', { jordan: 1851 });
    m = save(c, m, '2026-12', { jordan: 1560 }); m = save(c, m, '2027-01', { jordan: 2146 }); m = save(c, m, '2027-01', {}, { extra: { jordan: { amount: 412, edited: true } } });
    m = save(c, m, '2027-04', {}, { ticked: ['jordan'] }); m = save(c, m, '2027-07', { jordan: 2176 }); m = save(c, m, '2027-07', {}, { extra: { jordan: { amount: 0, edited: true } } });
    m = save(c, m, '2027-11', { jordan: 2159 }); m['2027-11'].extra = { jordan: Object.assign({}, m['2027-11'].extra.jordan, { counted: true }) };
    cases.push([c, m]); }
  { const c = sam(); let m = save(c, {}, '2027-04', { sam: 2100 }); const o = P.useExtraOffer(c, m, '2027-05', 'sam'); m['2027-05'] = { oneOffs: [Object.assign({ id: 'o1' }, o)] }; m = save(c, m, '2027-05', { sam: 1260 }); cases.push([c, m]); }
  { const c = hannahMarc(); let m = {}; for (const [k, v] of [['2027-02', 1707], ['2027-05', 2937], ['2027-08', 2844], ['2027-11', 2887]]) m = save(c, m, k, { hannah: 2050, marc: v }); cases.push([c, m]); }
  for (const [c, m] of cases) {
    const typedKeys = Object.keys(m).filter(k => m[k].pay && Object.values(m[k].pay).some(v => v != null));
    assert.ok(typedKeys.length > 0);
    const c0 = P216.normCfg(clone(c)), m0 = P216.normMonths(clone(m));
    const noDate = clone(c); noDate.people.forEach(p => { if (p.pattern) { delete p.pattern.on; delete p.pattern.since; } });
    for (const k of typedKeys) {
      const a = P.planPay(c, m, k), b = P216.planPay(c0, m0, k), d = P.planPay(noDate, m, k);
      for (const p of c.people) for (const f of ['arrived', 'setAside', 'used']) { assert.equal(a[p.id][f], b[p.id][f], `${k} ${p.id} ${f}`); assert.equal(d[p.id][f], b[p.id][f], `${k} ${p.id} ${f}, no date`); }
      assert.deepEqual(view(P.calcMonth(c, m, k)), view(P216.calcMonth(c0, m0, k)), k);
    }
  }
});
