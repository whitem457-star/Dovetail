// The household simulation, history part (2.13): for each made-up household, the things that make one month's figures
// differ from another's, worked out with calcMonth (so cfgFor) for twelve months of 2027 and checked against the oracle
// for the household in effect that month, the invariants, and what earlier months had before:
//   1. a change of style from a random month (applyChange, as "Change how you manage your money…" builds it), then
//      Undo (removeLastChange);
//   2. dated edits: an amount, account or months changed from a month (dateEdit), an item added from a month (start) and
//      one deleted from a month (endItem), each undone again, plus "change earlier months too" (undateLast);
//   3. one-offs in about four months in ten, in every one of the above;
//   4. someone ticked later as paying board (boarder: true in Settings › People) where their own account allows it;
//   5. (2.14, with SIM_FIGURES=1) the rough figure: bills listed over the year (dated, from a month), the figure raised from
//      a month, ended from a month ("That's all of them"), a listed bill deleted with the figure lowered by its amount or
//      kept, each undone: months before each action keep exactly their transfers, Undo gives the settings back exactly;
//   6. (2.15) dated usual pay: pay typed in some months, an estimate saved by a tick in a few and none in the rest, then one
//      to three edits to someone's usual pay from a month (datePersonEdit), some in the same month and some back again:
//      earlier months keep exactly their pay and transfers, later ones use the pay an independent list of the edits gives
//      (and the oracle the usual pay of that month), was is what the edits should leave, files are version 6 needing 2.15,
//      and "change earlier months too" (undateLast) and an edit back in the same month give the settings back exactly;
//   7. (2.16) dated pay patterns: someone's pay changed from a month to weekly, fortnightly or four-weekly, back to monthly,
//      to another pattern or to another amount each time (datePersonEdit, with personSnap's pattern), checked as in 6 with
//      planPay against the oracle: earlier months keep exactly their pay and transfers, and files need 2.16.
// Households with a pattern (gen.mjs, about a fifth of people) run through every part; before 2.16's core is in calc.js they
// can't be set up, so they're left out and the run fails saying so (SIM_PATTERNS=0 leaves patterns out altogether).
// Exits 1 on any problem.
// node sim/history.mjs [households=300] [first seed=1]
import { isDeepStrictEqual } from 'node:util';
import { P } from '../unit/load.mjs';
import { makeHousehold, oracle, withIds, restyle, oneOffsFor, oneOffAccount, incomeName, ownApart, intendedAccount, shapeOf, answersOf, rng, r2, withFigures, figureExtras, billMonths,
  NAMES, PAY_YEAR, monthlyOf, hasPattern, topsUpBills, payMonthsFor, planOracle, monthsObj, patternsOn, patternNote } from './gen.mjs';
import { invariants, compare, sameResult, topUps, idByName, patternApiMissing, patternApiNote, planChecks } from './check.mjs';
import { buildCfg, styleKey, figuresOn } from './logic.mjs';

const key = m => '2027-' + String(m).padStart(2, '0');
const clone = o => JSON.parse(JSON.stringify(o));
const LISTS = [['bills', 'account'], ['budgets', 'account'], ['savings', 'fromAccount'], ['income', 'account']];
// ui.js applyShape: when an existing household changes, a joint account can stand in for joint bills or joint spending
// and the other way round.
const ALIAS = { joint: ['bills', 'spending', 'main'], bills: ['joint', 'main'], spending: ['joint', 'main'], main: ['joint', 'bills', 'spending'] };

const fails = {}, notes = {}, tally = { change: [0, 0], dated: [0, 0], oneOffs: [0, 0], ticked: [0, 0], figures: [0, 0], pay: [0, 0], pattern: [0, 0] };
const cover = { kind: 0, closed: 0, moved: 0, fixed: 0, board: 0, renamed: 0, single: 0, fig: { raised: 0, ended: 0, listed: 0, lowered: 0, kept: 0, noFigure: 0, noListedBill: 0, tooSmall: 0 },
  pay: { edits: 0, sameMonth: 0, back: 0, noEntry: 0, undated: 0, editedBack: 0, typed: 0, estimated: 0, untyped: 0 },
  pattern: { edits: 0, sameMonth: 0, back: 0, noEntry: 0, undated: 0, editedBack: 0, typed: 0, estimated: 0, untyped: 0, toPattern: 0, each: 0, every: 0, toMonthly: 0 }, notRun: 0, e17change: 0 };
const API = !patternApiMissing(P).length, NAME_RE = new RegExp('\\b(' + NAMES.join('|') + ')\\b', 'g');
let current = null;
function add(part, h, m, msg) {
  const k = part + ' | ' + styleKey(h) + ' | ' + msg.replace(NAME_RE, 'Someone').replace(/[-\d.,£]+/g, '#').replace(/\b(p\d|a[0-9a-z]{6,}|[bgsifn]\d+)\b/g, '·');
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
  // 2.16: one person on a pattern changing to "pay account, bills, spending": the oracle follows the layout the change made
  // (E17 is checked where setup makes it, in logic.mjs and sim/ui.mjs).
  if (!h2.multi && h2.pool === 'split') { const b = sh.accounts.find(a => a.role === 'bills'), y = sh.accounts.find(a => a.role === 'pay'); h2.e17 = !!(b && y && b.leftoverTo === y.id); cover.e17change += h2.e17; }
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

/** 5. The rough figure (2.14), on a household that has one: listed bills, a raise, the end, a delete with or without lowering. */
function figures(ctx) {
  const { h, c, seed, idOf, months, base } = ctx, R = rng(seed * 29 + 17), f0 = h.figures[0], A = intendedAccount(h, { owner: f0.owner }, 'bills'), acc = idOf(A);
  const ks = [...Array(11).keys()].map(i => i + 2).sort(() => R() - 0.5).slice(0, 5).sort((a, b) => a - b), idAt = () => idOf;
  const estOf = (st, id) => st.estimates.find(x => x.id === id), figSpec = (t, amt) => { const x = clone(t); x.figures.find(f => f.id === f0.id).amount = amt; return x; };
  // The household as a list of what happened from which month; the spec for month m has every event from m or earlier.
  const events = [], specAt = m => events.filter(e => e.from <= m).reduce((t, e) => e.apply(t), h);
  const billSpec = b => ({ ...clone(b), owner: f0.owner });
  // a. Bills listed over the year (dated, from a month), the biggest of the unlisted ones first; then the figure raised.
  const s = clone(c), states = [clone(c)], undo = []; let prev = base;
  const pool = (h.hidden || []).filter(b => intendedAccount(h, b, 'bills') === A).sort((a, b) => b.amount - a.amount).slice(0, 3);
  if (!pool.length) pool.push({ id: 'nf' + seed, name: 'Extra bill', amount: r2(15 + R() * 200), freq: 'monthly', owner: f0.owner });
  pool.forEach((b, i) => { const k = ks[i], ms = billMonths(b);
    s.bills.push({ id: b.id, name: b.name, amount: b.amount, account: acc, months: ms.slice(), start: key(k) });
    events.push({ from: k, apply: t => { const x = clone(t); x.bills.push(billSpec(b)); return x; } });
    prev = months12('figures', ctx, s, months, prev, k, specAt, idAt); roundTrip('figures', h, s, 'a bill listed from a month'); states.push(clone(s));
    undo.push(() => { const ix = s.bills.findIndex(y => y.id === b.id), x = s.bills[ix]; s.bills.splice(ix, 1); P.endItem(s, 'bills', x, key(k)); });
    cover.fig.listed++; });
  { const k = ks[3], est = estOf(s, f0.id), snap = P.itemSnap('estimates', est), old = est.amount, amt = Math.max(r2(old + 10), Math.round(old * (1.1 + R() * 0.4) / 10) * 10);
    est.amount = amt; P.dateEdit('estimates', est, snap, key(k)); events.push({ from: k, apply: t => figSpec(t, amt) });
    prev = months12('figures', ctx, s, months, prev, k, specAt, idAt); roundTrip('figures', h, s, 'the figure raised from a month'); states.push(clone(s)); cover.fig.raised++;
    undo.push(() => { const e = estOf(s, f0.id), sn = P.itemSnap('estimates', e); e.amount = old; P.dateEdit('estimates', e, sn, key(k)); }); }
  // Undo each, newest first: the settings come back exactly.
  for (let i = undo.length - 1; i >= 0; i--) { undo[i](); same('figures', h, s, states[i], i === undo.length - 1 ? 'Undo of raising the figure' : 'Undo of listing a bill (removing it the month it was listed)'); }
  // b. "That's all of them": the figure ends from a month (its bills keep counting before it), then Undo.
  events.length = 0;
  { const k = ks[1], s2 = clone(c), ix = s2.estimates.findIndex(x => x.id === f0.id), copy = clone(s2.estimates[ix]); s2.estimates.splice(ix, 1); if (!s2.estimates.length) delete s2.estimates; P.endItem(s2, 'estimates', copy, key(k));
    events.push({ from: k, apply: t => { const x = clone(t); x.figures = x.figures.filter(f => f.id !== f0.id); return x; } });
    months12('figures', ctx, s2, months, base, k, specAt, idAt); roundTrip('figures', h, s2, 'the figure ended from a month'); cover.fig.ended++;
    (s2.estimates ||= []).splice(ix, 0, copy); P.unendItem(s2, 'estimates', copy.id); same('figures', h, s2, c, 'Undo of ending the figure (unendItem)'); }
  // c. A listed bill deleted, with the figure lowered by its amount ("Lower it") and then without ("Keep it").
  events.length = 0;
  const L = c.bills.find(b => b.account === acc && !b.start && !(b.months.length && b.months.length < 7)), est0 = estOf(c, f0.id);
  if (!L) cover.fig.noListedBill++;
  else {
    const k = ks[2], ix = c.bills.indexOf(L), gone = t => { const x = clone(t); x.bills = x.bills.filter(y => y.id !== L.id); return x; };
    { const s3 = clone(c), x = s3.bills[ix]; s3.bills.splice(ix, 1); P.endItem(s3, 'bills', x, key(k)); events.push({ from: k, apply: gone });
      const r = months12('figures', ctx, s3, months, base, k, specAt, idAt); roundTrip('figures', h, s3, 'a listed bill deleted from a month'); cover.fig.kept++;
      // "Keep it" on a bill that comes every month, while the listed bills are within the figure: its amount becomes "not
      // listed yet" again, so nothing sent changes from that month (past the figure the bills do come down, 5.7).
      const x0 = figureExtras(h).find(e => e.account === A);
      if (!L.months.length && x0 && x0.figure >= x0.listed) for (let m = k; m <= 12; m++) sameResult(base[m], r[m]).forEach(y => add('figures', h, m, 'deleting an every-month bill and keeping the figure changed a transfer: ' + y));
      s3.bills.splice(ix, 0, x); P.unendItem(s3, 'bills', L.id); same('figures', h, s3, c, 'Undo of a delete (unendItem)'); }
    events.length = 0;
    if (est0.amount - L.amount < 0.5) cover.fig.tooSmall++;
    else { const s3 = clone(c), x = s3.bills[ix], e = estOf(s3, f0.id), snap = P.itemSnap('estimates', e), old = e.amount, amt = r2(old - L.amount);
      s3.bills.splice(ix, 1); P.endItem(s3, 'bills', x, key(k)); e.amount = amt; P.dateEdit('estimates', e, snap, key(k));
      events.push({ from: k, apply: t => figSpec(gone(t), amt) });
      months12('figures', ctx, s3, months, base, k, specAt, idAt); roundTrip('figures', h, s3, 'a bill deleted and the figure lowered from a month'); cover.fig.lowered++;
      { const sn = P.itemSnap('estimates', e); e.amount = old; P.dateEdit('estimates', e, sn, key(k)); } s3.bills.splice(ix, 0, x); P.unendItem(s3, 'bills', L.id); same('figures', h, s3, c, 'Undo of deleting a bill and lowering the figure'); }
  }
  tally.figures[0]++;
}

/** 6 and 7. Dated pay (2.15) and dated pay patterns (2.16): the household's months with pay typed in some, an estimate
    saved by a tick in a few and none in the rest (gen.mjs payMonthsFor: some people never type theirs, so their usual pay,
    or each × N, is what every month uses; extra paydays set aside, counted or left in), then one to three edits to someone's
    pay from a month, as Settings › People makes them (personSnap, datePersonEdit). part "pay": a new usual pay for someone
    paid monthly. part "pattern": monthly to a pattern, another amount each time, another pattern, or back to monthly.
    What each month should have comes from the list of edits (stateAt) and gen.mjs's planOracle, not from calc. */
function payEdits(ctx, part) {
  const { h, c, seed, idOf } = ctx, R = rng(seed * (part === 'pay' ? 31 : 41) + 7), q = cover[part], pid = i => c.people[i].id;
  const who = h.people.map((p, i) => i).filter(i => h.people[i].pay > 0 && (part === 'pattern' || !h.people[i].every));
  if (!who.length) return;
  const base = i => { const p = h.people[i]; return p.every ? { pay: p.pay, every: p.every, each: p.each } : { pay: p.pay }; };
  // The independent expectation: the edits made, in order ({i, from, st: the person from then}).
  const edits = [], stateAt = (i, m) => edits.reduce((v, e) => e.i === i && e.from <= m ? e.st : v, base(i));
  const sameSt = (a, b) => a.pay === b.pay && (a.every || 0) === (b.every || 0) && (a.each || 0) === (b.each || 0);
  const pm = payMonthsFor(h, seed * 3 + (part === 'pay' ? 1 : 2), base), months = monthsObj(c, pm);
  Object.keys(ctx.months).forEach(k => { if (ctx.months[k].oneOffs.length) (months[k] ||= {}).oneOffs = clone(ctx.months[k].oneOffs); });
  const kindOf = (i, m) => { const d = pm[m][i]; return d.pay == null ? 'untyped' : d.est ? 'estimated' : 'typed'; };
  // was: an entry for the months before each month an edit was made from, when the person then was different.
  const entry = (until, st) => Object.assign({ until, usualPay: st.pay }, st.every ? { pattern: { every: st.every, each: st.each } } : {});
  const wasOf = i => { const w = [...new Set(edits.filter(e => e.i === i).map(e => e.from))].sort((a, b) => a - b).filter(f => !sameSt(stateAt(i, f - 1), stateAt(i, f))).map(f => entry(key(f - 1), stateAt(i, f - 1)));
    return w.length ? w : undefined; };
  const norm = w => w && w.map(e => Object.assign({ until: e.until, usualPay: e.usualPay }, e.pattern ? { pattern: { every: e.pattern.every, each: e.pattern.each } } : {}));
  const e17 = topsUpBills(h), specAt = m => ({ ...h, e17, people: h.people.map((p, i) => { const st = stateAt(i, m), x = { ...p, pay: st.pay }; delete x.every; delete x.each; if (st.every) { x.every = st.every; x.each = st.each; } return x; }) });
  const setTo = (p, st) => { p.usualPay = st.pay; if (st.every) p.pattern = { every: st.every, each: st.each }; else delete p.pattern; };
  if (c.people.some((p, i) => p.usualPay !== h.people[i].pay)) { add(part, h, 0, 'setup saved a usual pay that is not the one typed'); return; }
  // Every month of s: months before `from` exactly as `before` had them (pay, plan and transfers), the rest as the edits say.
  function run(s, from, before, what) {
    const out = [];
    for (let m = 1; m <= 12; m++) {
      const k = key(m), r = P.calcMonth(s, months, k), pf = P.payFor(s, months, k), plan = API ? P.planPay(s, months, k) : null;
      if (m < from) {
        sameResult(before[m].r, r).forEach(x => add(part, h, m, 'earlier month changed after ' + what + ': ' + x));
        if (!isDeepStrictEqual(before[m].pf, pf)) add(part, h, m, `earlier month's pay changed after ${what}: ${JSON.stringify(before[m].pf)} now ${JSON.stringify(pf)}`);
        if (API && !isDeepStrictEqual(before[m].plan, plan)) add(part, h, m, `earlier month's planPay changed after ${what}: ${JSON.stringify(before[m].plan)} now ${JSON.stringify(plan)}`);
        h.people.forEach((p, i) => { q[kindOf(i, m)]++; });
      } else {
        const sp = specAt(m), now = h.people.map((p, i) => planOracle(pm, stateAt, i, m).used), ones = (ctx.ones[m] || []).map(o => oneFor(sp, o)), cm = P.cfgFor(s, k, months[k] && months[k].oneOffs);
        if (API) planChecks(P, sp, s, months, pm, stateAt, m).bad.forEach(x => add(part, h, m, `pay after ${what}: ${x}`));
        else s.people.forEach((p, i) => { if (Math.abs(pf[p.id] - now[i]) > 0.005) add(part, h, m, `${p.name}'s pay (${kindOf(i, m)}) ${pf[p.id]} but expected ${now[i]} after ${what}`); });
        invariants(P, cm, r).forEach(x => add(part, h, m, 'invariant: ' + x));
        compare(P, sp, cm, r, m, now, { ones, idOf }).bad.forEach(x => add(part, h, m, 'oracle: ' + x));
        topUps(P, sp, cm, r, m, now, { ones, idOf }).forEach(x => add(part, h, m, 'top-ups: ' + x));
      }
      s.people.forEach((p, i) => { const got = P.personAt(s, p.id, k), want = stateAt(i, m), gp = got.pattern || null;
        if (Math.abs(got.usualPay - want.pay) > 0.005 || (gp ? gp.every : 0) !== (want.every || 0) || (gp ? gp.each : 0) !== (want.each || 0))
          add(part, h, m, `personAt gives ${p.name} ${got.usualPay}${gp ? ` (${gp.each} every ${gp.every} days)` : ''} but expected ${want.pay}${want.every ? ` (${want.each} every ${want.every} days)` : ''} after ${what}`); });
      out[m] = { r, pf, plan }; tally[part][1]++;
    }
    return out;
  }
  // The settings after each step: was as the edits say, a backup keeps them, and the file is version 6 needing 2.15, or
  // 2.16 when anyone has a pattern now or in an earlier month.
  function settled(s, what) {
    s.people.forEach((p, i) => { if (!isDeepStrictEqual(norm(p.was), wasOf(i))) add(part, h, 0, `${p.name}'s was after ${what} is ${JSON.stringify(p.was)}, expected ${JSON.stringify(wasOf(i))}`); });
    roundTrip(part, h, s, what);
    const dated = s.people.some(p => p.was !== undefined), pat = s.people.some(p => p.pattern || (p.was || []).some(e => e.pattern));
    if (P.hasPersonDated(s) !== dated) add(part, h, 0, 'hasPersonDated is ' + P.hasPersonDated(s) + ' after ' + what);
    if (P.backupVersionFor(s) !== (dated || pat ? 6 : P.backupVersionFor(c))) add(part, h, 0, `backup version ${P.backupVersionFor(s)} after ${what}`);
    const needs = pat ? '2.16' : dated ? '2.15' : P.backupNeedsFor(c);
    if (P.backupNeedsFor(s) !== needs) add(part, h, 0, `backup needs ${P.backupNeedsFor(s)}, expected ${needs}, after ${what}`);
  }
  // The next state for person i from month k: for "pay" a new usual pay; for "pattern" one of the changes a pattern allows.
  function nextState(i, k) {
    const cur = stateAt(i, k);
    if (part === 'pay') return { pay: r2(h.people[i].pay * (0.6 + R() * 0.9)) };
    const op = cur.every ? ['each', 'every', 'toMonthly'][Math.floor(R() * 3)] : 'toPattern', ev = [7, 14, 28];
    q[op]++;
    let st;
    if (op === 'each') st = { every: cur.every, each: r2(cur.each * (0.7 + R() * 0.6)) };
    else if (op === 'every') { const e = ev.filter(x => x !== cur.every)[Math.floor(R() * 2)]; st = { every: e, each: r2(cur.pay * 12 / PAY_YEAR[e]) }; }
    else if (op === 'toPattern') { const e = ev[Math.floor(R() * 3)]; st = { every: e, each: r2(cur.pay * 12 / PAY_YEAR[e] * (0.9 + R() * 0.2)) }; }
    else return { pay: r2(cur.pay * (0.85 + R() * 0.3)) };
    st.pay = monthlyOf(st); return st;
  }
  if (P.hasPersonDated(c) || P.cfgFor(c, key(1)) !== c) add(part, h, 0, 'a household with no dated pay is not left as it is');
  const s = clone(c);
  let before = run(s, 1, null, 'nothing'), k = 1;
  const n = 1 + Math.floor(R() * 3), states = [];
  for (let j = 0; j < n; j++) {
    // Edits are made as the months go by (the month the app opens on never goes back, E8): sometimes again in the same month.
    const again = j > 0 && R() < 0.3;
    if (!again) k = Math.min(12, k + 1 + Math.floor(R() * 5));
    const last = edits[edits.length - 1], i = again && R() < 0.7 ? last.i : who[Math.floor(R() * who.length)], earlier = edits.some(e => e.i === i && e.from === k);
    let st = nextState(i, k); if (earlier && R() < 0.4) { st = stateAt(i, k - 1); q.back++; }
    states.push(clone(s));
    const p = s.people[i], snap = P.personSnap(p); setTo(p, st); const had = (p.was || []).length; P.datePersonEdit(p, snap, key(k));
    edits.push({ i, from: k, st, grew: (p.was || []).length > had }); q.edits++; if (earlier) q.sameMonth++; if (!p.was) q.noEntry++;
    const what = `${h.people[i].name}'s pay edited to ${st.every ? st.each + ' every ' + st.every + ' days' : st.pay + ' a month'} from ${key(k)}`;
    before = run(s, k, before, what); settled(s, what);
  }
  // "Change earlier months too" on the last edit, when it added an entry: the settings as the edit made without history.
  const e = edits[edits.length - 1];
  if (e.grew) { const u = clone(s), undated = clone(states[states.length - 1]); P.undateLast(u.people[e.i]); setTo(undated.people[e.i], e.st);
    same(part, h, u, undated, '"Change earlier months too" (undateLast)'); q.undated++; }
  // An edit back to the pay before the month's first edit, in the same month: that person as they were before it.
  { const first = edits.findIndex(x => x.i === e.i && x.from === e.from), p = s.people[e.i], snap = P.personSnap(p), st = stateAt(e.i, e.from - 1);
    setTo(p, st); P.datePersonEdit(p, snap, key(e.from)); edits.push({ i: e.i, from: e.from, st });
    same(part, h, p, states[first].people[e.i], 'an edit back in the same month'); q.editedBack++;
    const what = 'an edit back from ' + key(e.from); run(s, e.from, before, what); settled(s, what); }
  tally[part][0]++;
}
const datedPay = ctx => payEdits(ctx, 'pay'), datedPattern = ctx => payEdits(ctx, 'pattern');

const N = Number(process.argv[2] || 300), S = Number(process.argv[3] || 1), t0 = Date.now();
for (let seed = S; seed < S + N; seed++) {
  current = seed;
  const raw = makeHousehold(seed);
  // 2.16: a household with a pattern can't be set up before the core lands (said once, at the end).
  if (hasPattern(raw) && !API) { cover.notRun++; continue; }
  let c; try { c = buildCfg(raw); } catch (e) { add('build', withIds(raw), 0, 'threw: ' + e.message); continue; }
  const h = withIds(raw), ones = oneOffsFor(h, seed), vary = seed % 2 === 1;
  const payFor = m => h.people.map((p, i) => vary && m % 2 === 0 && p.pay > 0 ? Math.round(p.pay * (0.85 + ((seed * 7 + i * 13 + m) % 31) / 100) * 100) / 100 : p.pay);
  const idOf = n => idByName(c, n), months = monthsFor(ones, () => h, () => idOf);
  const ctx = { h, c, seed, ones, payFor, idOf, months };
  // 3. One-offs: the household's own twelve months, with them.
  try { ctx.base = []; for (let m = 1; m <= 12; m++) ctx.base[m] = check('oneOffs', ctx, c, months, m, h, idOf); if (Object.keys(ones).length) tally.oneOffs[0]++; }
  catch (e) { add('oneOffs', h, 0, 'threw: ' + e.message); continue; }
  for (const [part, fn] of [['change', change], ['dated', dated], ['ticked', ticked], ['pay', datedPay]].concat(API && patternsOn() ? [['pattern', datedPattern]] : [])) { try { fn(ctx); } catch (e) { add(part, h, 0, 'threw: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); } }
  // 5. The rough figure, on the same household with a figure (every third an "anchor").
  if (figuresOn()) {
    const rawF = withFigures(raw, seed, seed % 3 === 0 ? 'anchor' : 'figure');
    if (!rawF.figures || !rawF.figures.length) { cover.fig.noFigure++; continue; }
    try {
      const hF = withIds(rawF), cF = buildCfg(rawF), idF = n => idByName(cF, n), onesF = oneOffsFor(hF, seed), monthsF = monthsFor(onesF, () => hF, () => idF);
      const ctxF = { h: hF, c: cF, seed, ones: onesF, payFor: m => hF.people.map((p, i) => vary && m % 2 === 0 && p.pay > 0 ? Math.round(p.pay * (0.85 + ((seed * 7 + i * 13 + m) % 31) / 100) * 100) / 100 : p.pay), idOf: idF, months: monthsF };
      if (!(Array.isArray(cF.estimates) && cF.estimates.length === hF.figures.length)) throw new Error('normCfg dropped cfg.estimates (calc does not know the figures yet)');
      ctxF.base = []; for (let m = 1; m <= 12; m++) { ctxF.base[m] = check('figures', ctxF, cF, monthsF, m, hF, idF); tally.figures[1]++; }
      figures(ctxF);
    } catch (e) { add('figures', rawF, 0, 'threw: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); }
  }
}
const fk = Object.keys(fails);
console.log(`History: ${N} households, ${fk.length ? fk.length + ' kinds of problem' : 'no problems'} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
console.log(`  1. a change of style from a month, then Undo: ${tally.change[0]} households, ${tally.change[1]} months`);
console.log(`     (${cover.kind} to another set of accounts, ${cover.single} households of one person; ${cover.closed} closing an account, ${cover.moved} moving its items, ${cover.fixed} with items moved by dated edits after; ${cover.board} asked about board; ${cover.renamed} renaming an account)`);
console.log(`  2. dated edits (changed, added, deleted from a month; each undone): ${tally.dated[0]} households, ${tally.dated[1]} months`);
console.log(`  3. one-offs: ${tally.oneOffs[0]} households with some, ${tally.oneOffs[1]} months with one-offs checked against the oracle`);
console.log(`  4. a boarder ticked later: ${tally.ticked[0]} households, ${tally.ticked[1]} months`);
if (figuresOn()) console.log(`  5. rough figures (bills listed over the year, the figure raised, ended, a bill deleted with the figure lowered or kept; each undone): ${tally.figures[0]} households, ${tally.figures[1]} base months, ${cover.fig.listed} bills listed, ${cover.fig.raised} raised, ${cover.fig.ended} ended, ${cover.fig.lowered} lowered, ${cover.fig.kept} kept (not run: ${cover.fig.noFigure} households with no figure, ${cover.fig.noListedBill} with no listed 7-plus-month bill to delete, ${cover.fig.tooSmall} where the bill is more than the figure)`);
else console.log('  5. rough figures: not run (SIM_FIGURES=1 switches them on; calc.js needs cfg.estimates)');
{ const q = cover.pay; console.log(`  6. dated usual pay (edited from a month, some again in the same month; "change earlier months too" and an edit back): ${tally.pay[0]} households, ${tally.pay[1]} months, ${q.edits} edits (${q.sameMonth} in the same month as another, ${q.back} back to the pay before it, ${q.noEntry} leaving no entry), ${q.undated} undated, ${q.editedBack} edited back; earlier months kept: ${q.typed} typed, ${q.estimated} saved by a tick, ${q.untyped} untyped (by person)`); }
{ const q = cover.pattern;
  if (!patternsOn()) console.log('  7. ' + patternNote);
  else if (!API) { console.log('  7. dated pay patterns: not run. ' + patternApiNote(P) + ` (${cover.notRun} households left out of every part)`); process.exitCode = 1; }
  else console.log(`  7. dated pay patterns (to a pattern ${q.toPattern}, another amount each time ${q.each}, another pattern ${q.every}, back to monthly ${q.toMonthly}; "change earlier months too" and an edit back): ${tally.pattern[0]} households, ${tally.pattern[1]} months, ${q.edits} edits (${q.sameMonth} in the same month as another, ${q.back} back to the pay before it, ${q.noEntry} leaving no entry), ${q.undated} undated, ${q.editedBack} edited back; earlier months kept: ${q.typed} typed, ${q.estimated} saved by a tick, ${q.untyped} untyped (by person); a change of style to E17's layout: ${cover.e17change}`); }
fk.sort((a, b) => fails[b].length - fails[a].length).forEach(k => console.log(`- [${new Set(fails[k].map(x => x.split('@')[0])).size} households] ${k}\n    e.g. seed ${fails[k][0]}`));
const nk = Object.keys(notes);
if (nk.length) console.log(`  Savings transfers listed in another order in earlier months after one is deleted from a later month (same transfers and amounts; for the lead): ${nk.reduce((s, k) => s + notes[k].length, 0)} months in ${new Set(nk.flatMap(k => notes[k].map(x => x.split('@')[0]))).size} households; e.g. seed ${notes[nk[0]][0]}`);
if (fk.length) process.exitCode = 1;
