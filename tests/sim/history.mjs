// The household simulation, history part (2.13): for each made-up household, the things that make one month's figures
// differ from another's, worked out with calcMonth (so cfgFor) for twelve months of 2027 and checked against the oracle
// for the household in effect that month, the invariants, and what earlier months had before:
//   1. a change of style from a random month (applyChange, as "Change how you manage your money…" builds it), then
//      Undo (removeLastChange);
//   2. dated edits: an amount, account or months changed from a month (dateEdit), an item added from a month (start) and
//      one deleted from a month (endItem), each undone again, plus "change earlier months too" (undateLast);
//   3. one-offs in about four months in ten, in every one of the above;
//   4. someone ticked later as paying board (boarder: true in Settings › People) where their own account allows it.
// Exits 1 on any problem.
// node sim/history.mjs [households=300] [first seed=1]
import { isDeepStrictEqual } from 'node:util';
import { P } from '../unit/load.mjs';
import { makeHousehold, oracle, withIds, restyle, oneOffsFor, oneOffAccount, incomeName, ownApart, intendedAccount, shapeOf, answersOf, rng, r2 } from './gen.mjs';
import { invariants, compare, sameResult, topUps, idByName } from './check.mjs';
import { buildCfg, styleKey } from './logic.mjs';

const key = m => '2027-' + String(m).padStart(2, '0');
const clone = o => JSON.parse(JSON.stringify(o));
const LISTS = [['bills', 'account'], ['budgets', 'account'], ['savings', 'fromAccount'], ['income', 'account']];
// ui.js applyShape: when an existing household changes, a joint account can stand in for joint bills or joint spending
// and the other way round.
const ALIAS = { joint: ['bills', 'spending', 'main'], bills: ['joint', 'main'], spending: ['joint', 'main'], main: ['joint', 'bills', 'spending'] };

const fails = {}, notes = {}, tally = { change: [0, 0], dated: [0, 0], oneOffs: [0, 0], ticked: [0, 0] };
const cover = { kind: 0, closed: 0, moved: 0, fixed: 0, board: 0, renamed: 0, single: 0 };
let current = null;
function add(part, h, m, msg) {
  const k = part + ' | ' + styleKey(h) + ' | ' + msg.replace(/[-\d.,£]+/g, '#').replace(/\b(p\d|a[0-9a-z]{6,}|[bgsifn]\d+)\b/g, '·');
  ((/order only/.test(msg) ? notes : fails)[k] ||= []).push(current + '@' + m + ': ' + msg);
}

/** A one-off as spec h has it: in a household where nothing is shared, a "shared" one-off is the first person's. */
const oneFor = (h, o) => o.owner === 'shared' && h.style === 'separate' ? { ...o, owner: 0 } : o;
/** The months object calcMonth reads: each month's one-offs in the account they're meant for in the spec of that month. */
function monthsFor(ones, specAt, idAt) {
  const out = {};
  Object.keys(ones).forEach(m => { const h = specAt(Number(m)), idOf = idAt(Number(m));
    out[key(m)] = { oneOffs: ones[m].map(o => { const x = oneFor(h, o); return { id: o.id, kind: o.kind, name: o.name, amount: o.amount, account: idOf(oneOffAccount(h, x)) }; }) }; });
  return out;
}
/** Work out month m of settings c and check it against spec h: invariants, the oracle and the 2.13 top-up rule. */
function check(part, ctx, c, months, m, h, idOf) {
  const k = key(m), now = ctx.payFor(m), pay = {}; c.people.forEach((p, i) => { pay[p.id] = now[i]; });
  const ones = (ctx.ones[m] || []).map(o => oneFor(h, o)), cm = P.cfgFor(c, k, months[k] && months[k].oneOffs), r = P.calcMonth(c, months, k, pay);
  invariants(P, cm, r).forEach(x => add(part, h, m, 'invariant: ' + x));
  compare(P, h, cm, r, m, now, { ones, idOf }).bad.forEach(x => add(part, h, m, 'oracle: ' + x));
  topUps(P, h, cm, r, m, now, { ones, idOf }).forEach(x => add(part, h, m, 'top-ups: ' + x));
  if (ones.length) tally.oneOffs[1]++;
  return r;
}
/** Every month of c: months before `from` must be exactly as `before` had them; months from it are checked against
    specAt(m). Returns the results. */
function months12(part, ctx, c, months, before, from, specAt, idAt) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    if (m < from) { const k = key(m), pay = {}, now = ctx.payFor(m); c.people.forEach((p, i) => { pay[p.id] = now[i]; });
      const r = P.calcMonth(c, months, k, pay); sameResult(before[m], r).forEach(x => add(part, specAt(m), m, 'earlier month changed: ' + x));
      invariants(P, P.cfgFor(c, k, months[k] && months[k].oneOffs), r).forEach(x => add(part, specAt(m), m, 'invariant: ' + x)); out[m] = r; }
    else out[m] = check(part, ctx, c, months, m, specAt(m), idAt(m));
    tally[part][1]++;
  }
  return out;
}
/** A backup keeps everything: normCfg of a copy is the same settings. */
function roundTrip(part, h, c, what) { if (!isDeepStrictEqual(P.normCfg(clone(c)), c)) add(part, h, 0, 'normCfg changes the settings after ' + what); }
function same(part, h, a, b, what) {
  if (isDeepStrictEqual(a, b)) return;
  const d = Object.keys({ ...a, ...b }).filter(k => !isDeepStrictEqual(a[k], b[k]));
  add(part, h, 0, what + ' does not give the settings back exactly (' + d.join(', ') + ')');
}

/** 1. A change of style from a random month, built as ui.js's startChange, applyShape and confirmChange build it. */
function change(ctx) {
  const { h, c, seed, idOf, months, base } = ctx, R = rng(seed * 13 + 5), h2 = restyle(h, seed), k = 2 + Math.floor(R() * 11), from = key(k);
  // Setup's accounts for the new answers, the household's own kept wherever their role fits, with their names and colours.
  const people = c.people.map(p => ({ id: p.id, name: p.name })), sh = P.setupShape(shapeOf(h2), people, P.setupOpts(answersOf(h2)));
  const roles = P.accountRoles(c), had = {}, used = {}, map = {};
  Object.keys(roles).forEach(id => { had[roles[id]] = id; });
  sh.accounts.forEach(a => { if (had[a.role]) used[had[a.role]] = 1; });
  sh.accounts.forEach(a => { if (had[a.role]) return; (ALIAS[a.role] || []).some(r => { const id = had[r]; if (id && !used[id]) { had[a.role] = id; used[id] = 1; return true; } return false; }); });
  sh.accounts.forEach(a => { map[a.id] = had[a.role] || a.id; });
  const old = id => c.accounts.find(a => a.id === id);
  const next = { accounts: sh.accounts.map(a => { const id = map[a.id], o = old(id), x = { id, name: o ? o.name : a.name, colour: o ? o.colour : a.colour, leftoverTo: a.leftoverTo ? map[a.leftoverTo] : null };
    if (a.funding) x.funding = clone(a.funding); return x; }), pay: {} };
  // Sometimes an account kept is renamed in the change (Undo puts the name back).
  if (R() < 0.3) { const kx = next.accounts.filter(a => old(a.id)); if (kx.length) { const a = kx[Math.floor(R() * kx.length)]; a.name = 'Household ' + a.name; a.colour = 'gold'; } }
  c.people.forEach(p => { next.pay[p.id] = map[sh.payAccount[p.id]]; });
  // Who pays board from then, when setup asks (2.12.1).
  if (h.people.length > 2 && ['pool', 'contribute', 'housekeeping'].includes(h2.style)) { next.boarders = {}; c.people.forEach((p, i) => { if (i) next.boarders[p.id] = h2.board[i] != null; }); }
  const names = {}; sh.accounts.forEach(a => { names[a.name] = map[a.id]; });
  const idOf2 = n => names[n];
  // Accounts that close: their bills, budgets, savings and income go to setup's default (ui.js suChangeWhen), or sometimes
  // to another of the new accounts.
  const kept = new Set(next.accounts.map(a => a.id)), sc = { people: c.people.map(p => ({ ...p, payAccount: next.pay[p.id] })), accounts: clone(next.accounts) };
  let def = P.defaultBillAccount(sc); if (!old(def)) { const o = P.flowOrder(sc).filter(id => old(id)); if (o.length) def = o[o.length - 1]; }
  const busy = id => LISTS.some(([l, f]) => c[l].some(x => x[f] === id)), moves = {};
  c.accounts.forEach(a => { if (!kept.has(a.id) && busy(a.id)) moves[a.id] = R() < 0.7 ? def : next.accounts[Math.floor(R() * next.accounts.length)].id; });
  const keep = [...new Set(Object.values(months).flatMap(d => d.oneOffs.map(o => o.account)))];
  const c2 = P.applyChange(c, from, next, moves, keep), applied = clone(c2);
  cover.kind += shapeOf(h) !== shapeOf(h2); cover.closed += c2.accounts.some(a => a.closedFrom); cover.moved += Object.keys(moves).length > 0; cover.board += !!next.boarders;
  cover.renamed += next.accounts.some(a => old(a.id) && old(a.id).name !== a.name); cover.single += !h.multi;
  // Then each item the new style has somewhere else is moved there from the same month (a dated edit, as Settings makes it).
  const fixes = [];
  LISTS.forEach(([l, f]) => c2[l].forEach(x => { const it = h2[l].find(y => y.id === x.id), n = l === 'income' ? incomeName(h2) : intendedAccount(h2, it, l), want = idOf2(n);
    if (!want) { add('change', h2, k, 'no account ' + n); return; }
    if (x[f] !== want) { const before = P.itemSnap(l, x); fixes.push({ l, f, x, was: x[f] }); x[f] = want; P.dateEdit(l, x, before, from); } }));
  cover.fixed += fixes.length > 0;
  const specAt = m => m < k ? h : h2, idAt = m => m < k ? idOf : idOf2;
  const months2 = monthsFor(ctx.ones, specAt, idAt);
  months12('change', ctx, c2, months2, base, k, specAt, idAt);
  roundTrip('change', h2, c2, 'a change of style');
  // Undo: the moves back (each dated edit undone in the same month drops its entry), then the change itself.
  fixes.reverse().forEach(({ l, f, x, was }) => { const before = P.itemSnap(l, x); x[f] = was; P.dateEdit(l, x, before, from); });
  same('change', h2, c2, applied, 'moving the items back');
  same('change', h2, P.removeLastChange(c2, keep), c, 'Undo the change (removeLastChange)');
  tally.change[0]++;
}

/** 2. Dated edits, one after another from three random months, each checked and then undone. */
function dated(ctx) {
  const { h, c, seed, idOf, months, base } = ctx, R = rng(seed * 17 + 3), pick = a => a[Math.floor(R() * a.length)];
  const k1 = 2 + Math.floor(R() * 11), k2 = 2 + Math.floor(R() * 11), k3 = 2 + Math.floor(R() * 11);
  const owners = h.multi && h.style !== 'separate' ? ['shared', ...h.people.map((p, i) => i)] : h.people.map((p, i) => i);
  const acctOf = (s, l, it) => idOf(l === 'income' ? incomeName(s) : intendedAccount(s, it, l));
  const events = [], specAt = m => events.filter(e => e.from <= m).reduce((s, e) => e.apply(s), h), idAt = () => idOf;
  const find = (s, l, id) => s[l].find(y => y.id === id);
  const lists = LISTS.filter(([l]) => c[l].length);
  if (!lists.length) return;
  // Edit: a new amount (and sometimes another account, or a bill's months) from k1.
  const [l1, f1] = pick(lists), x1 = pick(c[l1]), it1 = find(h, l1, x1.id), ch = {};
  if (R() < 0.8) ch.amount = r2(Math.max(1, x1.amount * (0.4 + R() * 1.4)));
  if (l1 !== 'income' && R() < 0.5) { const o = owners.filter(w => acctOf(h, l1, { ...it1, owner: w }) !== x1[f1]); if (o.length) ch.owner = pick(o); }
  if (l1 === 'bills' && R() < 0.3) ch.months = R() < 0.4 ? [] : [...new Set([1 + Math.floor(R() * 12), 1 + Math.floor(R() * 12), 1 + Math.floor(R() * 12)])].sort((a, b) => a - b);
  if (!Object.keys(ch).length || (ch.months && ch.months.join() === x1.months.join() && Object.keys(ch).length === 1)) ch.amount = r2(x1.amount + 10);
  const editSpec = s => { const t = clone(s), y = find(t, l1, x1.id); if (!y) return t; if (ch.amount != null) y.amount = ch.amount; if (ch.owner != null) y.owner = ch.owner;
    if (ch.months) { y.freq = 'some'; y.picked = ch.months.length ? ch.months : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; } return t; };
  const s0 = clone(c), y1 = s0[l1].find(y => y.id === x1.id), snap1 = P.itemSnap(l1, y1);
  if (ch.amount != null) y1.amount = ch.amount; if (ch.owner != null) y1[f1] = acctOf(h, l1, { ...it1, owner: ch.owner }); if (ch.months) y1.months = ch.months;
  const undated = clone(s0); P.dateEdit(l1, y1, snap1, key(k1));
  events.push({ from: k1, apply: editSpec });
  const r1 = months12('dated', ctx, s0, months, base, k1, specAt, idAt); roundTrip('dated', h, s0, 'a dated edit');
  // "Change earlier months too": the same settings as the edit made without history.
  { const u = clone(s0); P.undateLast(u[l1].find(y => y.id === x1.id)); same('dated', h, u, undated, '"Change earlier months too" (undateLast)'); }
  // Add: a new item from k2.
  const [l2, f2] = pick(LISTS), owner2 = l2 === 'income' ? 'shared' : pick(owners), id2 = 'n' + seed;
  const it2 = { id: id2, name: 'New ' + l2, amount: r2(10 + R() * 300), owner: owner2, freq: 'monthly' };
  const s1 = clone(s0), x2 = { id: id2, name: it2.name, amount: it2.amount, [f2]: acctOf(h, l2, it2), start: key(k2) }; if (l2 === 'bills') x2.months = [];
  s1[l2].push(x2); const added = clone(s1); delete added[l2][added[l2].length - 1].start;
  events.push({ from: k2, apply: s => { const t = clone(s); t[l2].push(clone(it2)); return t; } });
  const r2s = months12('dated', ctx, s1, months, r1, k2, specAt, idAt); roundTrip('dated', h, s1, 'an item added from a month');
  { const u = clone(s1); delete u[l2].find(y => y.id === id2).start; same('dated', h, u, added, '"Add it to earlier months too"'); }
  // Delete: an item (any, the edited or new one too) from k3.
  const l3 = pick(LISTS.filter(([l]) => s1[l].length))[0], ix3 = Math.floor(R() * s1[l3].length), s2 = clone(s1), x3 = s2[l3][ix3], copy3 = clone(x3);
  s2[l3].splice(ix3, 1); P.endItem(s2, l3, x3, key(k3));
  events.push({ from: k3, apply: s => { const t = clone(s); t[l3] = t[l3].filter(y => y.id !== copy3.id); return t; } });
  months12('dated', ctx, s2, months, r2s, k3, specAt, idAt); roundTrip('dated', h, s2, 'an item deleted from a month');
  // Undo each, newest first: the settings come back exactly.
  s2[l3].splice(ix3, 0, copy3); P.unendItem(s2, l3, copy3.id); same('dated', h, s2, s1, 'Undo of a delete (unendItem)');
  const ix2 = s2[l2].findIndex(y => y.id === id2), x2b = s2[l2][ix2]; s2[l2].splice(ix2, 1); P.endItem(s2, l2, x2b, key(k2)); same('dated', h, s2, s0, 'removing an item added that month');
  const y1b = s2[l1].find(y => y.id === x1.id), snapB = P.itemSnap(l1, y1b); ['amount', f1, 'months'].forEach(f => { if (snap1[f] !== undefined && snap1[f] !== null) y1b[f] = clone(snap1[f]); });
  P.dateEdit(l1, y1b, snapB, key(k1)); same('dated', h, s2, c, 'an edit changed back in the same month');
  tally.dated[0]++;
}

/** 4. Someone ticked later as paying board, where their own account allows it. */
function ticked(ctx) {
  const { h, c, seed, idOf, months } = ctx, R = rng(seed * 23 + 11);
  // calc agrees about whose account can be a boarder's.
  const cands = [];
  h.people.forEach((p, i) => { if (!i || h.board[i] != null) return; const t = clone(c); t.people[i].boarder = true;
    const calcSays = !!P.boarderAccounts(t)[t.people[i].payAccount], want = ownApart(h, i);
    if (calcSays !== want) add('ticked', h, 0, `${p.name}'s account ${want ? 'should' : "shouldn't"} be one a boarder can have (boarderAccounts says ${calcSays})`);
    if (want) cands.push(i); });
  if (!cands.length) return;
  const i = cands[Math.floor(R() * cands.length)], hT = clone(h), cT = clone(c); hT.ticked[i] = true; cT.people[i].boarder = true;
  roundTrip('ticked', hT, cT, 'ticking a boarder');
  for (let m = 1; m <= 12; m++) {
    const r = check('ticked', ctx, cT, months, m, hT, idOf), now = ctx.payFor(m);
    const homePay = now.reduce((s, v, j) => s + (hT.board[j] != null || hT.ticked[j] ? 0 : v), 0);
    if (Math.abs(r.t.pay - homePay) > 0.005) add('ticked', hT, m, `household pay ${r2(r.t.pay)} but expected ${r2(homePay)} (without the boarder's)`);
    // What they pay in (their share, or board) is money coming in to the household.
    const boardIn = oracle(hT, m, now, (ctx.ones[m] || []).map(o => oneFor(hT, o))).contrib.filter(x => hT.board[x.who] != null || hT.ticked[x.who]).reduce((s, x) => s + x.amt, 0);
    if (Math.abs(r.t.board - boardIn) > 0.02) add('ticked', hT, m, `board in ${r2(r.t.board)} but expected ${r2(boardIn)}`);
    tally.ticked[1]++;
  }
  tally.ticked[0]++;
}

const N = Number(process.argv[2] || 300), S = Number(process.argv[3] || 1), t0 = Date.now();
for (let seed = S; seed < S + N; seed++) {
  current = seed;
  const raw = makeHousehold(seed), h = withIds(raw), c = buildCfg(raw), ones = oneOffsFor(h, seed), vary = seed % 2 === 1;
  const payFor = m => h.people.map((p, i) => vary && m % 2 === 0 && p.pay > 0 ? Math.round(p.pay * (0.85 + ((seed * 7 + i * 13 + m) % 31) / 100) * 100) / 100 : p.pay);
  const idOf = n => idByName(c, n), months = monthsFor(ones, () => h, () => idOf);
  const ctx = { h, c, seed, ones, payFor, idOf, months };
  // 3. One-offs: the household's own twelve months, with them.
  try { ctx.base = []; for (let m = 1; m <= 12; m++) ctx.base[m] = check('oneOffs', ctx, c, months, m, h, idOf); if (Object.keys(ones).length) tally.oneOffs[0]++; }
  catch (e) { add('oneOffs', h, 0, 'threw: ' + e.message); continue; }
  for (const [part, fn] of [['change', change], ['dated', dated], ['ticked', ticked]]) { try { fn(ctx); } catch (e) { add(part, h, 0, 'threw: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); } }
}
const fk = Object.keys(fails);
console.log(`History: ${N} households, ${fk.length ? fk.length + ' kinds of problem' : 'no problems'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log(`  1. a change of style from a month, then Undo: ${tally.change[0]} households, ${tally.change[1]} months`);
console.log(`     (${cover.kind} to another set of accounts, ${cover.single} households of one person; ${cover.closed} closing an account, ${cover.moved} moving its items, ${cover.fixed} with items moved by dated edits after; ${cover.board} asked about board; ${cover.renamed} renaming an account)`);
console.log(`  2. dated edits (changed, added, deleted from a month; each undone): ${tally.dated[0]} households, ${tally.dated[1]} months`);
console.log(`  3. one-offs: ${tally.oneOffs[0]} households with some, ${tally.oneOffs[1]} months with one-offs checked against the oracle`);
console.log(`  4. a boarder ticked later: ${tally.ticked[0]} households, ${tally.ticked[1]} months`);
fk.sort((a, b) => fails[b].length - fails[a].length).forEach(k => console.log(`- [${new Set(fails[k].map(x => x.split('@')[0])).size} households] ${k}\n    e.g. seed ${fails[k][0]}`));
const nk = Object.keys(notes);
if (nk.length) console.log(`  Savings transfers listed in another order in earlier months after one is deleted from a later month (same transfers and amounts; for the lead): ${nk.reduce((s, k) => s + notes[k].length, 0)} months in ${new Set(nk.flatMap(k => notes[k].map(x => x.split('@')[0]))).size} households; e.g. seed ${notes[nk[0]][0]}`);
if (fk.length) process.exitCode = 1;
