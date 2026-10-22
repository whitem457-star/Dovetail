// Unit tests for 2.15: dated pay (docs/payperiods.md 5.2 and 11.1, E1 to E5). Editing someone's usual pay with months
// saved before the pay month the app opens on keeps the old pay for earlier months (people[].was), so the "in
// proportion to pay" shares and the estimates of months with no pay typed in never move. A household without was gets
// exactly what 2.14 gave. Made-up households only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, household, sampleUpgraded, clone } from './load.mjs';

const acc = (id, o = {}) => Object.assign({ id, name: id, colour: 'blue', leftoverTo: null }, o);
const bill = (id, amount, account, o = {}) => Object.assign({ id, name: id, amount, account, months: [] }, o);
// Hannah and Marc (2.3's example, made up): each paid into their own account, both paying into Joint "in proportion to
// pay", which has the bills.
const couple = (o = {}) => household(Object.assign({ payday: { day: 28 },
  people: [{ id: 'h', name: 'Hannah', payAccount: 'H', usualPay: 2400 }, { id: 'm', name: 'Marc', payAccount: 'M', usualPay: 2300 }],
  accounts: [acc('H'), acc('M'), acc('J', { name: 'Joint', funding: { people: ['h', 'm'], rule: 'pay' } })],
  bills: [bill('mortgage', 1500, 'J'), bill('energy', 180, 'J'), bill('council', 170, 'J'), bill('water', 50, 'J')] }, o));
// October 2026 done: pay typed and the shares ticked. The app now opens on November 2026.
const CUR = '2026-11', OCT = '2026-10';
const history = () => ({ [OCT]: { pay: { h: 2410, m: 2290 }, done: { 'c:h>J': true, 'c:m>J': true } } });
const shares = r => r.steps.filter(s => s.kind === 'contribute').map(s => [s.person, P.r2(s.amt)]);
const marc = c => c.people.find(p => p.id === 'm');

test('hasPersonDated: true only when someone has a was', () => {
  assert.equal(P.hasPersonDated(couple()), false);
  assert.equal(P.hasPersonDated({}), false);
  assert.equal(P.hasPersonDated(null), false);
  const c = couple(); marc(c).was = [{ until: '2026-10', usualPay: 2300 }];
  assert.equal(P.hasPersonDated(c), true);
});

test('personAt: the usual pay from the first entry whose until is k or later, else the person as they are', () => {
  const c = couple(); marc(c).usualPay = 3000;
  marc(c).was = [{ until: '2026-06', usualPay: 2000 }, { until: '2026-10', usualPay: 2300 }];
  assert.equal(P.personAt(c, 'm', '2026-01').usualPay, 2000);
  assert.equal(P.personAt(c, 'm', '2026-06').usualPay, 2000);
  assert.equal(P.personAt(c, 'm', '2026-07').usualPay, 2300);
  assert.equal(P.personAt(c, 'm', '2026-10').usualPay, 2300);
  assert.equal(P.personAt(c, 'm', '2026-11').usualPay, 3000);
  assert.equal(P.personAt(c, 'm', '2026-11'), marc(c), 'the person as they are');
  const then = P.personAt(c, 'm', '2026-01');
  assert.notEqual(then, marc(c), 'a copy');
  assert.equal(marc(c).usualPay, 3000, 'the person is unchanged');
  assert.equal(then.name, 'Marc'); assert.equal(then.payAccount, 'M');
  assert.equal(P.personAt(c, 'nobody', '2026-01'), null);
  assert.equal(P.personAt(couple(), 'h', '2020-01').usualPay, 2400, 'nobody dated: as they are');
});

test('personSnap: the dated fields, usual pay as a number', () => {
  assert.deepEqual(P.personSnap({ id: 'm', usualPay: 2300, name: 'Marc' }), { usualPay: 2300 });
  assert.deepEqual(P.personSnap({ id: 'm' }), { usualPay: 0 });
  assert.deepEqual(P.personSnap({ id: 'm', usualPay: 2300.456 }), { usualPay: 2300.46 });
});

test('datePersonEdit: dateEdit\'s rules on usual pay', () => {
  const p = { id: 'm', usualPay: 2300 };
  // No before, or no valid month: nothing dated.
  p.usualPay = 2500; assert.equal(P.datePersonEdit(p, null, CUR), false); assert.equal(p.was, undefined);
  assert.equal(P.datePersonEdit(p, { usualPay: 2300 }, 'nope'), false); assert.equal(p.was, undefined);
  assert.equal(P.datePersonEdit(null, { usualPay: 2300 }, CUR), false);
  // The edit: the old pay kept for the months before CUR.
  assert.equal(P.datePersonEdit(p, { usualPay: 2300 }, CUR), true);
  assert.deepEqual(p.was, [{ until: OCT, usualPay: 2300 }]);
  // A second edit in the same pay month keeps the value from before the first.
  let before = P.personSnap(p); p.usualPay = 2600;
  assert.equal(P.datePersonEdit(p, before, CUR), true);
  assert.deepEqual(p.was, [{ until: OCT, usualPay: 2300 }]);
  // An edit back to it drops the entry.
  before = P.personSnap(p); p.usualPay = 2300;
  assert.equal(P.datePersonEdit(p, before, CUR), false);
  assert.equal(p.was, undefined);
  // No change: nothing dated.
  assert.equal(P.datePersonEdit(p, P.personSnap(p), CUR), false); assert.equal(p.was, undefined);
  // An edit in a later pay month adds an entry after the earlier one.
  p.usualPay = 2500; P.datePersonEdit(p, { usualPay: 2300 }, CUR);
  before = P.personSnap(p); p.usualPay = 2700;
  assert.equal(P.datePersonEdit(p, before, '2027-03'), true);
  assert.deepEqual(p.was, [{ until: OCT, usualPay: 2300 }, { until: '2027-02', usualPay: 2500 }]);
  // A person whose usual pay was never set counts as £0, as payEstimate has it.
  const q = { id: 'q' }; q.usualPay = 1000;
  assert.equal(P.datePersonEdit(q, P.personSnap({ id: 'q' }), CUR), true);
  assert.deepEqual(q.was, [{ until: OCT, usualPay: 0 }]);
  // Typed as text and set back to the same amount: no entry.
  const t = { id: 't', usualPay: 1200 }, b0 = P.personSnap(t); t.usualPay = '1200';
  assert.equal(P.datePersonEdit(t, b0, CUR), false); assert.equal(t.was, undefined);
});

test('undateLast and datedNow work on a person', () => {
  const p = { id: 'm', usualPay: 2300 };
  p.usualPay = 2500; P.datePersonEdit(p, { usualPay: 2300 }, CUR);
  assert.deepEqual(P.datedNow(p, CUR), { until: OCT, usualPay: 2300 });
  assert.equal(P.datedNow(p, '2027-01'), null);
  const b = P.personSnap(p); p.usualPay = 2700; P.datePersonEdit(p, b, '2027-03');
  assert.deepEqual(P.datedNow(p, '2027-03'), { until: '2027-02', usualPay: 2500 });
  P.undateLast(p); assert.deepEqual(p.was, [{ until: OCT, usualPay: 2300 }]);
  P.undateLast(p); assert.equal(p.was, undefined);
  assert.equal(P.datedNow(p, CUR), null);
});

test('cfgFor: the very same settings when nobody is dated; each person as they were when someone is', () => {
  const c = couple();
  assert.equal(P.cfgFor(c, OCT), c);
  marc(c).usualPay = 3000; marc(c).was = [{ until: OCT, usualPay: 2300 }];
  const oct = P.cfgFor(c, OCT), nov = P.cfgFor(c, CUR);
  assert.notEqual(oct, c);
  assert.equal(marc(oct).usualPay, 2300); assert.equal(marc(nov).usualPay, 3000);
  assert.equal(oct.people[0].usualPay, 2400);
  assert.equal(marc(c).usualPay, 3000, 'settings unchanged');
  assert.deepEqual(oct.bills, c.bills); assert.deepEqual(oct.accounts, c.accounts);
});

test('cfgFor: a dated person keeps the pay account and board a change of style recorded', () => {
  let c = couple();
  marc(c).usualPay = 3000; marc(c).was = [{ until: OCT, usualPay: 2300 }];
  const next = { accounts: c.accounts.map(a => ({ id: a.id, name: a.name, colour: a.colour, leftoverTo: a.leftoverTo, funding: a.funding })), pay: { h: 'H', m: 'H' } };
  c = P.applyChange(c, '2027-01', next, {});
  assert.deepEqual(marc(c).was, [{ until: OCT, usualPay: 2300 }], 'applyChange keeps was');
  assert.equal(marc(c).payAccount, 'H');
  const oct = P.cfgFor(c, OCT), dec = P.cfgFor(c, '2026-12'), jan = P.cfgFor(c, '2027-01');
  assert.deepEqual([marc(oct).payAccount, marc(oct).usualPay], ['M', 2300]);
  assert.deepEqual([marc(dec).payAccount, marc(dec).usualPay], ['M', 3000]);
  assert.deepEqual([marc(jan).payAccount, marc(jan).usualPay], ['H', 3000]);
  const back = P.removeLastChange(c);
  assert.deepEqual(marc(back).was, [{ until: OCT, usualPay: 2300 }], 'removeLastChange keeps was');
  assert.equal(marc(back).payAccount, 'M');
  // A change of who pays board keeps it too.
  const withBoard = P.applyChange(back, '2027-01', Object.assign({}, next, { pay: { h: 'H', m: 'M' }, boarders: { m: true } }), {});
  assert.deepEqual(marc(withBoard).was, [{ until: OCT, usualPay: 2300 }]);
  assert.equal(marc(P.cfgFor(withBoard, OCT)).boarder, undefined);
  assert.equal(marc(P.cfgFor(withBoard, '2027-01')).boarder, true);
});

test('the history fix: a ticked earlier month keeps its shares when usual pay changes, dated', () => {
  const months = history();
  assert.equal(P.hasHistory(months, CUR), true);
  const c0 = couple(), was = shares(P.calcMonth(c0, months, OCT));
  assert.deepEqual(was.map(x => x[0]), ['h', 'm']);
  // Dated: October keeps its shares; November uses the new pay.
  const dated = clone(c0), b = P.personSnap(marc(dated)); marc(dated).usualPay = 3200;
  assert.equal(P.datePersonEdit(marc(dated), b, CUR), true);
  assert.deepEqual(shares(P.calcMonth(dated, months, OCT)), was);
  // Through a backup and back, too.
  const back = P.normCfg(JSON.parse(P.backupJson(dated, months, null, 'x')).config);
  assert.deepEqual(shares(P.calcMonth(back, months, OCT)), was);
  // November with the same pay as October: the new usual pay moves the shares there, as it should.
  const nov = { [CUR]: { pay: { h: 2410, m: 2290 } } }, all = Object.assign({}, months, nov);
  assert.notDeepEqual(shares(P.calcMonth(dated, all, CUR)), was);
  // Not dated (a plain edit, as before 2.15): October's ticked shares move. The test bites.
  const plain = clone(c0); marc(plain).usualPay = 3200;
  assert.notDeepEqual(shares(P.calcMonth(plain, months, OCT)), was);
});

test('payEstimate: an earlier month with no pay typed in uses the usual pay then (E1), from the raw settings', () => {
  const c = couple(); marc(c).usualPay = 3000; marc(c).was = [{ until: OCT, usualPay: 2300 }];
  assert.deepEqual(P.payEstimate(c, {}, 'm', '2026-09'), { v: 2300, from: null });
  assert.deepEqual(P.payEstimate(c, {}, 'm', OCT), { v: 2300, from: null });
  assert.deepEqual(P.payEstimate(c, {}, 'm', CUR), { v: 3000, from: null });
  assert.deepEqual(P.payEstimate(c, {}, 'h', '2026-09'), { v: 2400, from: null });
  // The latest typed month still wins.
  const m = { '2026-08': { pay: { m: 2350 } } };
  assert.deepEqual(P.payEstimate(c, m, 'm', '2026-09'), { v: 2350, from: '2026-08' });
  assert.deepEqual(P.payEstimate(c, m, 'm', CUR), { v: 2350, from: '2026-08' });
  assert.equal(P.payFor(c, {}, '2026-09').m, 2300);
  assert.equal(P.payFor(c, {}, CUR).m, 3000);
  assert.deepEqual(P.payEstimate(c, {}, 'nobody', OCT), { v: 0, from: null });
});

test('normCfg: a sound was goes through unchanged and round trips', () => {
  const c = couple(); marc(c).usualPay = 3000; marc(c).was = [{ until: '2026-06', usualPay: 2000 }, { until: OCT, usualPay: 2300.5 }];
  const rep = [], n = P.normCfg(c, rep);
  assert.deepEqual(rep, []);
  assert.deepEqual(n, c);
  assert.deepEqual(P.normCfg(n), n);
});

test('normCfg: each kind of bad entry is dropped and reported', () => {
  const norm = was => { const rep = [], c = couple(); marc(c).was = was; const n = P.normCfg(c, rep); return { was: marc(n).was, rep, has: 'was' in marc(n) }; };
  const BAD = 'an earlier pay that couldn\'t be used', REP = 'an earlier pay repeated for a month';
  for (const e of [{ until: '2026-13', usualPay: 1 }, { until: '2026-1', usualPay: 1 }, { usualPay: 1 }, { until: OCT }, { until: OCT, usualPay: -1 },
    { until: OCT, usualPay: '2300' }, { until: OCT, usualPay: NaN }, { until: OCT, usualPay: Infinity }, { until: OCT, usualPay: null }, null, 'x', [1]]) {
    const r = norm([e]);
    assert.deepEqual(r.rep, [BAD], JSON.stringify(e)); assert.equal(r.has, false, 'empty was deleted: ' + JSON.stringify(e));
  }
  // Not a list at all.
  for (const w of ['x', 5, { until: OCT, usualPay: 1 }, null]) { const r = norm(w); assert.deepEqual(r.rep, [BAD], JSON.stringify(w)); assert.equal(r.has, false); }
  // An empty list goes quietly.
  assert.deepEqual(norm([]), { was: undefined, rep: [], has: false });
  // Sorted, rounded to pence, repeats dropped (the first kept), bad ones dropped.
  const r = norm([{ until: OCT, usualPay: 2300.456 }, { until: '2026-03', usualPay: 1999.994 }, { until: OCT, usualPay: 9 }, { until: 'nope', usualPay: 1 }, { until: '2026-05', usualPay: 0, extra: 1 }]);
  assert.deepEqual(r.was, [{ until: '2026-03', usualPay: 1999.99 }, { until: '2026-05', usualPay: 0 }, { until: OCT, usualPay: 2300.46 }]);
  assert.deepEqual(r.rep, [BAD, REP]);
  // The household's sentence names them.
  assert.match(P.reportSentence(r.rep), /an earlier pay that couldn't be used/);
});

test('a household without was: byte-identical through normCfg and backupJson (version 5)', () => {
  const { c, m } = sampleUpgraded(true);
  assert.equal(P.hasPersonDated(c), false);
  assert.equal(JSON.stringify(P.normCfg(c)), JSON.stringify(c));
  assert.equal(P.cfgFor(c, '2026-01'), c);
  const o = JSON.parse(P.backupJson(c, m, null, 's'));
  assert.equal(o.version, 5); assert.equal(o.needs, undefined);
  assert.equal(JSON.stringify(o.config), JSON.stringify(c));
  const h = couple();
  assert.equal(JSON.stringify(P.normCfg(h)), JSON.stringify(h));
  assert.deepEqual([P.backupVersionFor(h), P.backupNeedsFor(h)], [6, '2.13'], 'shares alone: as 2.14 had it');
});

test('backups: version 6 with needs "2.15" when someone is dated; "2.15" beats "2.14"; older pages refuse', () => {
  assert.equal(P.DATED_PAY_NEEDS, '2.15');
  const c = couple(); marc(c).usualPay = 3000; marc(c).was = [{ until: OCT, usualPay: 2300 }];
  assert.equal(P.backupVersionFor(c), 6); assert.equal(P.backupNeedsFor(c), '2.15');
  const o = JSON.parse(P.backupJson(c, history(), null, 's'));
  assert.equal(o.version, 6); assert.equal(o.needs, '2.15');
  assert.deepEqual(P.normCfg(o.config), c, 'restored as saved');
  // With a rough figure too: the highest applies.
  const both = clone(c); both.estimates = [{ id: 'e1', account: 'J', amount: 2000 }];
  assert.equal(P.backupNeedsFor(P.normCfg(both)), '2.15');
  const est = couple({ estimates: [{ id: 'e1', account: 'J', amount: 2000 }] });
  assert.equal(P.backupNeedsFor(est), '2.14');
  assert.equal(P.backupNeedsFor(couple({ accounts: [acc('H', { closedFrom: '2026-01' }), acc('M'), acc('J')] })), '2.13');
  // A 2.14.1 page refuses with the version the file needs (ui.js: "This file needs Dovetail 2.15 or later."); 2.15 opens it.
  assert.equal(P.backupRefusal(o, 6, '2.14.1'), '2.15');
  assert.equal(P.backupRefusal(o, 6, '2.14'), '2.15');
  assert.equal(P.backupRefusal(o, 6, '2.15'), null);
  assert.equal(P.backupRefusal(o, 6, '2.15.1'), null);
  assert.equal(P.backupRefusal(o, 6, '2.16'), null);
  assert.equal(P.backupRefusal(o, 5, '2.12'), 'newer');
});

test('restore keeps was: normCfg, migrate and clone', () => {
  const c = couple(); marc(c).usualPay = 3000; marc(c).was = [{ until: OCT, usualPay: 2300 }];
  const m = history(), n = P.normCfg(JSON.parse(JSON.stringify(c)));
  P.migrate(n, m, null);
  assert.deepEqual(marc(n).was, [{ until: OCT, usualPay: 2300 }]);
  assert.deepEqual(marc(P.clone(n)).was, [{ until: OCT, usualPay: 2300 }]);
});

test('setupSettings (a brand-new household) has no was', () => {
  const r = P.setupSettings({ people: [{ id: 'p0', name: 'Hannah', pay: '2400', payAccount: 'a' }], accounts: [{ id: 'a', name: 'Current', colour: 'blue', leftoverTo: null }],
    income: [], bills: {}, budgets: [], savings: [], payday: { day: '28' }, skip: {} }, null, { schema: 5, version: '2.15' });
  assert.equal(P.hasPersonDated(r.cfg), false);
  assert.equal(r.cfg.people[0].usualPay, 2400);
});
