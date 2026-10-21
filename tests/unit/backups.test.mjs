// Unit tests for 2.13's backup and update files: the version each file is written as (5, or 6 with needs when the
// settings use something a phone before 2.13 would misread), and which files a page refuses. Made-up households only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, sampleUpgraded, household, clone } from './load.mjs';

const acc = (id, o = {}) => Object.assign({ id, name: id, colour: 'blue', leftoverTo: null }, o);
const bill = (id, amount, account, o = {}) => Object.assign({ id, name: id, amount, account, months: [] }, o);
const people = [{ id: 'alex', name: 'Alex', payAccount: 'A', usualPay: 3000 }, { id: 'sam', name: 'Sam', payAccount: 'S', usualPay: 2000 }];
// Pooled: both send what's left to the joint account (the owner's kind of household). Nothing here needs 2.13.
const pooled = (o = {}) => household(Object.assign({ people: clone(people), accounts: [acc('A', { leftoverTo: 'J' }), acc('S', { leftoverTo: 'J' }), acc('J')],
  bills: [bill('rent', 1200, 'J')], budgets: [{ id: 'food', name: 'Food', amount: 400, account: 'J' }], savings: [{ id: 'sv', name: 'Rainy day', amount: 100, fromAccount: 'J' }],
  income: [{ id: 'cb', name: 'Child Benefit', amount: 100, account: 'J' }] }, o));

test('backupVersionFor: the made-up 1.x household and a pooled household write version 5', () => {
  assert.equal(P.backupVersionFor(sampleUpgraded().c), 5);
  assert.equal(P.backupVersionFor(pooled()), 5);
  assert.equal(P.backupVersionFor(household({})), 5);
  // Anything unreadable counts as needing nothing new.
  assert.equal(P.backupVersionFor(null), 5);
  assert.equal(P.backupVersionFor({ accounts: 'x', people: [null, 3], flows: {} }), 5);
});

test('backupVersionFor: each thing a phone before 2.13 would misread makes it version 6', () => {
  const v = f => { const c = pooled(); f(c); return P.backupVersionFor(c); };
  assert.equal(v(c => { c.accounts[2].funding = { people: ['alex', 'sam'], rule: 'equal' }; }), 6, 'shares (funding)');
  assert.equal(v(c => { c.accounts[1].closedFrom = '2026-09'; }), 6, 'a closed account');
  assert.equal(v(c => { c.flows = [{ from: '2026-09', was: { accounts: {}, pay: {} } }]; }), 6, 'a change of style');
  assert.equal(v(c => { c.people[1].boarder = true; }), 6, 'someone paying board');
  assert.equal(v(c => { c.bills[0].was = [{ until: '2026-08', amount: 1100, account: 'J', months: [] }]; }), 6, 'a bill with an earlier amount');
  assert.equal(v(c => { c.budgets[0].start = '2026-10'; }), 6, 'a budget that starts in a month');
  assert.equal(v(c => { c.savings[0].was = [{ until: '2026-08', amount: 50, fromAccount: 'J' }]; }), 6, 'a savings transfer with an earlier amount');
  assert.equal(v(c => { c.income[0].start = '2026-10'; }), 6, 'income that starts in a month');
  assert.equal(v(c => { c.ended = { bills: [Object.assign(bill('tv', 14, 'J'), { ended: '2026-10' })] }; }), 6, 'a deleted item still counted earlier');
  // Not new: board not ticked, an empty list of changes.
  assert.equal(v(c => { c.people[1].boarder = false; c.flows = []; }), 5);
});

test('backupJson: the made-up 1.x household\'s backup text is byte for byte what 2.12.1 wrote', () => {
  const { c, m, w } = sampleUpgraded(), at = '2026-10-15T12:00:00.000Z';
  // 2.12.1's backupText, as it was.
  const old = (cfg, months, wealthRaw) => { const o = { app: 'payday-transfers', version: 5, savedAt: at, config: cfg, months }; if (wealthRaw != null) o.wealth = wealthRaw; return JSON.stringify(o); };
  assert.equal(P.backupJson(c, m, w, at), old(c, m, w));
  assert.equal(P.backupJson(c, m, null, at), old(c, m, null), 'without the old Wealth data');
  assert.equal(P.backupJson(pooled(), {}, undefined, at), old(pooled(), {}, undefined));
  assert.ok(!P.backupJson(c, m, w, at).includes('"needs"'));
});

test('backupJson: a household with shares writes version 6 and needs 2.13, straight after the version', () => {
  const c = pooled(); c.accounts[2].funding = { people: ['alex', 'sam'], rule: 'pay' };
  const t = P.backupJson(c, {}, null, '2026-10-15T12:00:00.000Z'), d = JSON.parse(t);
  assert.ok(t.startsWith('{"app":"payday-transfers","version":6,"needs":"2.13","savedAt":"2026-10-15T12:00:00.000Z","config":'));
  assert.equal(d.needs, P.BACKUP_NEEDS);
  assert.deepEqual(d.config, c);
  assert.ok(!('wealth' in d));
});

test('backupRefusal: which files a 2.13 page opens', () => {
  const r = d => P.backupRefusal(d, 6, '2.13');
  assert.equal(r({ version: 5 }), null);
  assert.equal(r({ version: 3 }), null, '1.x backups');
  assert.equal(r({}), null, 'no version at all (1.0)');
  assert.equal(r({ version: 6, needs: '2.13' }), null);
  assert.equal(r({ version: 6, needs: '2.12.1' }), null);
  assert.equal(r({ version: 7, needs: '2.13' }), 'newer', 'a later version');
  assert.equal(r({ version: 6 }), 'newer', 'version 6 without needs: no Dovetail writes that');
  assert.equal(r({ version: 6, needs: 'soon' }), 'newer');
  assert.equal(r({ version: 6, needs: '9.0' }), '9.0', 'a later app version is named');
  assert.equal(r({ version: 5, needs: '2.14' }), '2.14');
  assert.equal(r({ version: 5, needs: 'soon' }), null, 'needs that isn\'t a version is ignored on a version 5 file');
  // A page that's still numbered before 2.13 refuses what 2.13 writes.
  assert.equal(P.backupRefusal({ version: 6, needs: '2.13' }, 6, '2.12.1'), '2.13');
  assert.equal(P.backupRefusal({ version: 6, needs: '2.13' }, 5, '2.12.1'), 'newer');
});

test('wealthFile: the old Wealth data as a readable file of its own, which Dovetail won\'t take for a backup', () => {
  const { w } = sampleUpgraded(), f = P.wealthFile(w, '2026-10-15', '2026-10-15T12:00:00.000Z'), d = JSON.parse(f.text);
  assert.equal(f.name, 'dovetail-wealth-2026-10-15.json'); assert.equal(f.mime, 'application/json');
  assert.deepEqual(d.wealth, w); assert.equal(d.savedAt, '2026-10-15T12:00:00.000Z');
  assert.match(d.about, /old Wealth tab/);
  assert.ok(f.text.includes('\n  "wealth": {'), 'indented, so it can be read');
  assert.ok(!('config' in d) && !('app' in d), 'not a backup');
});

test('versionBefore: compares app versions number by number', () => {
  assert.equal(P.versionBefore('2.12.1', '2.13'), true);
  assert.equal(P.versionBefore('2.13', '2.13'), false);
  assert.equal(P.versionBefore('2.13', '2.13.0'), false);
  assert.equal(P.versionBefore('2.13.1', '2.13'), false);
  assert.equal(P.versionBefore('2.9', '2.13'), true);
  assert.equal(P.versionBefore('10.0', '9.0'), false);
  assert.equal(P.versionBefore(null, '2.0'), true);
});
