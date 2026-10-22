// The household simulation (2.12.1): made-up households from a seeded generator (every money style, rule, one earner,
// board, other income, bills that come some months, households that can't cover their bills), the account each item is
// meant for, and an independent oracle of what each person should pay and keep, written from the description of each
// style in docs/plans/play-store.md, not from calc.js. Made-up names and amounts only.
import fs from 'fs';
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const NAMES = ['Alex', 'Sam', 'Kit', 'Robin', 'Jo', 'Ash', 'Charlie', 'Frankie', 'Jordan', 'Morgan', 'Riley', 'Casey', 'Jamie', 'Taylor', 'Drew', 'Lee', 'Max', 'Nico', 'Ola', 'Priya', 'Ravi', 'Wren', 'Zara', 'Bo'];
export const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;

export function makeHousehold(seed, force = {}) {
  const R = rng(seed), pick = a => a[Math.floor(R() * a.length)], chance = p => R() < p;
  const between = (lo, hi, pennies = chance(0.4)) => { const v = lo + R() * (hi - lo); return pennies ? r2(v) : Math.round(v); };
  const nPeople = force.n ?? pick([1, 1, 2, 2, 2, 2, 2, 2, 3, 3, 4]);
  const names = []; while (names.length < nPeople) { const n = pick(NAMES); if (!names.includes(n)) names.push(n); }
  const people = names.map(name => ({ name, pay: between(1150, 5200) }));
  const multi = nPeople > 1;
  // Style and its answers.
  let style = force.style ?? (multi ? pick(['pool', 'pool', 'contribute', 'contribute', 'contribute', 'housekeeping', 'separate', 'other']) : null);
  let pool = null, rule = null, two = false, payer = null, set = null, fun = null, gets = {}, board = {};
  if (!multi) pool = force.pool ?? pick(['joint', 'own', 'split', 'other']);
  if (style === 'pool') { pool = force.pool ?? pick(['joint', 'own', 'split']); if (chance(0.4)) fun = people.map(() => between(50, 300, false)); }
  if (style === 'contribute' || style === 'housekeeping') rule = force.rule ?? pick(['equal', 'pay', 'sameLeft', 'set']);
  if (style === 'contribute') two = force.two ?? chance(0.35);
  if (style === 'housekeeping') payer = force.payer ?? Math.floor(R() * nPeople);
  // One earner (style 11): the second person has no pay, sometimes with money from the earner.
  const oneEarner = force.oneEarner ?? (multi && ['contribute', 'housekeeping', 'separate', 'pool'].includes(style) && chance(0.18));
  if (oneEarner) { people[1].pay = 0; if (style !== 'pool' && chance(0.7)) gets[1] = between(150, 600, false); }
  // Board (style 16): with three or more, someone after the first pays a set amount.
  if (nPeople > 2 && ['pool', 'contribute', 'housekeeping'].includes(style) && chance(0.5)) {
    const b = 2 + Math.floor(R() * (nPeople - 2)); if (!(style === 'housekeeping' && payer === b) && !(oneEarner && b === 1)) { board[b] = between(150, 500, false); if (chance(0.25)) people[b].pay = 0; } }
  // A bill payer with no pay isn't offered half each (2.12.1): they'd split by pay instead.
  if (style === 'housekeeping' && rule === 'equal' && !(people[payer].pay > 0) && people.some(p => p.pay > 0)) rule = 'pay';
  if (rule === 'set') set = people.map(p => p.pay > 0 ? between(300, 1500, false) : 0);
  // 2.13: with only one earner among those who'd share (or one of us paying the bills and that's the only earner),
  // setup doesn't ask how to split it, and it goes by pay. (After the draws above, so the households are as before.)
  let ruleAsked = true;
  const earners = people.map((q, i) => i).filter(i => board[i] == null && people[i].pay > 0);
  if (multi && earners.length === 1 && (style === 'contribute' || (style === 'housekeeping' && earners[0] === payer))) { rule = 'pay'; set = null; ruleAsked = false; }
  // Someone paying board isn't asked for spending money (2.12.1).
  if (fun) Object.keys(board).forEach(i => { fun[i] = 0; });
  // Other income (Child Benefit and the like).
  const income = chance(0.25) ? [{ name: pick(['Child Benefit', 'Lodger rent', 'Maintenance', 'Carer\'s Allowance']), amount: between(80, 600) }] : [];
  const payday = chance(0.15) ? null : { day: pick([1, 15, 20, 25, 28, 'last', 31]), same: chance(0.7), weekend: chance(0.85) };
  // Bills: shared ones, and each person's own.
  const sharedTarget = () => (style === 'separate' ? Math.floor(R() * nPeople) : 'shared');
  const bills = [];
  const housing = pick(['Rent', 'Mortgage']);
  bills.push({ name: housing, amount: between(450, 1900), freq: 'monthly', owner: sharedTarget() });
  if (chance(0.85)) bills.push({ name: 'Council Tax', amount: between(110, 260), freq: 'some', picked: [4, 5, 6, 7, 8, 9, 10, 11, 12, 1], owner: sharedTarget() });
  if (chance(0.8)) bills.push({ name: 'Energy', amount: between(70, 260), freq: 'monthly', owner: sharedTarget() });
  if (chance(0.6)) bills.push({ name: 'Water', amount: between(25, 65), freq: 'monthly', owner: sharedTarget() });
  if (chance(0.7)) bills.push({ name: 'Broadband', amount: between(22, 65), freq: 'monthly', owner: sharedTarget() });
  if (chance(0.5)) bills.push({ name: 'TV Licence', amount: 174.5, freq: 'yearly', month: 1 + Math.floor(R() * 12), owner: sharedTarget() });
  if (chance(0.4)) bills.push({ name: 'Home insurance', amount: between(15, 45), freq: 'monthly', owner: sharedTarget() });
  if (chance(0.4)) bills.push({ name: 'Streaming', amount: between(6, 19), freq: 'monthly', owner: sharedTarget() });
  people.forEach((p, i) => {
    if (board[i] != null) { if (chance(0.5)) bills.push({ name: 'Mobile phone ' + p.name, amount: between(10, 45), freq: 'monthly', owner: i }); return; }
    if (chance(0.6)) bills.push({ name: 'Mobile phone ' + p.name, amount: between(10, 45), freq: 'monthly', owner: i });
    if (chance(0.35)) bills.push({ name: 'Car loan ' + p.name, amount: between(120, 380), freq: 'monthly', owner: i });
    if (chance(0.3)) bills.push({ name: 'Car insurance ' + p.name, amount: between(350, 900), freq: 'yearly', month: 1 + Math.floor(R() * 12), owner: i });
    if (chance(0.25)) bills.push({ name: 'Gym ' + p.name, amount: between(18, 55), freq: 'monthly', owner: i });
  });
  // A household in trouble now and then: bills well over pay.
  if (force.short ?? chance(0.08)) bills.push({ name: 'Debt plan', amount: r2(people.reduce((s, p) => s + p.pay, 0) * 0.9), freq: 'monthly', owner: sharedTarget() });
  const budgets = [], savings = [];
  if (chance(0.85)) budgets.push({ name: 'Food shopping', amount: between(200, 750, false), owner: style === 'separate' ? 0 : 'shared' });
  if (chance(0.4)) budgets.push({ name: 'Going out', amount: between(60, 250, false), owner: style === 'separate' ? 1 % nPeople : 'shared' });
  if (multi && chance(0.4)) { const i = Math.floor(R() * nPeople); if (board[i] == null) budgets.push({ name: 'Fuel ' + people[i].name, amount: between(60, 200, false), owner: i }); }
  if (chance(0.7)) savings.push({ name: 'Emergency fund', amount: between(25, 400, false), owner: style === 'separate' ? 0 : 'shared' });
  if (chance(0.3)) savings.push({ name: 'Holiday', amount: between(50, 250, false), owner: style === 'separate' ? 1 % nPeople : 'shared' });
  const h = { seed, people, multi, style, pool, rule, ruleAsked, two, payer, set, fun, gets, board, income, payday, bills, budgets, savings };
  // 2.16: pay patterns, drawn last and from their own seeded draws, so the households above are the same with or without them.
  const share = force.patterns ?? (patternsOn() ? 0.2 : 0);
  return share > 0 ? withPatterns(h, seed, share) : h;
}

/** An amount as a person types it: whole pounds as they are, otherwise with the pence. */
export const money = v => (Number.isInteger(v) ? String(v) : v.toFixed(2));

/** The answers a person gives setup's screens for household spec h (people p0, p1…), in the shape of setup's state
    (ui.js startSetup), as sim/ui.mjs types them: names and pay, other income, the payday (or the step skipped) and the
    questions in the accounts step. The accounts and the rows in them are filled in by logic.mjs's setupStateFor. */
export function answersOf(h) {
  const id = i => 'p' + i, ans = { fun: null, funAmt: {}, rule: null, set: {}, two: 'no', payer: null, gets: {}, getsAmt: {}, board: {}, boardAmt: {} };
  if (h.style === 'pool') { ans.fun = h.fun ? 'yes' : 'no'; if (h.fun) h.people.forEach((p, i) => { if (h.board[i] == null) ans.funAmt[id(i)] = money(h.fun[i]); }); }
  if (h.style === 'housekeeping') ans.payer = id(h.payer);
  // With one earner the split isn't asked (2.13), so it's left unanswered.
  if (h.rule && h.ruleAsked !== false) ans.rule = h.rule;
  if (h.style === 'contribute' && h.two) ans.two = 'yes';
  Object.keys(h.board).forEach(k => { ans.board[id(k)] = 'yes'; ans.boardAmt[id(k)] = money(h.board[k]); });
  Object.keys(h.gets).forEach(k => { ans.gets[id(k)] = 'yes'; ans.getsAmt[id(k)] = money(h.gets[k]); });
  if (h.rule === 'set' && h.set) h.people.forEach((p, i) => { if (h.board[i] == null) ans.set[id(i)] = money(h.set[i] || 0); });
  const pd = h.payday;
  // 2.16: someone paid weekly, every two weeks or every four weeks types their pay each time, with how often (every).
  return { people: h.people.map((p, i) => Object.assign({ id: id(i), name: p.name, pay: p.every ? money(p.each) : p.pay > 0 ? money(p.pay) : '', payAccount: null }, p.every ? { every: p.every } : {})),
    income: h.income.map((x, i) => ({ id: x.id || 'i' + i, name: x.name, amount: money(x.amount), account: null })),
    sameDay: h.multi && pd ? pd.same : null, payday: pd ? { day: String(pd.day), weekend: pd.day === 'last' || pd.weekend } : { day: '', weekend: true }, skip: pd ? {} : { 3: true },
    shape: null, style: h.multi ? h.style : null, pool: h.pool, ans, accounts: [], bills: {}, budgets: [], savings: [] };
}

/** The setupShape kind the answers make (as setup's suKind does). */
export function shapeOf(h) {
  const kind = !h.multi ? h.pool : h.style === 'pool' ? h.pool : h.style;
  return kind;
}

/** Which account an item is meant to be in, by account name in the default shapes, for a household spec. */
export function intendedAccount(h, item, list) {
  const P = i => h.people[i].name + "'s account", kind = shapeOf(h), owner = item.owner;
  if (!h.multi) { if (kind === 'joint' || kind === 'other') return 'Current account'; return list === 'bills' ? 'Bills account' : 'Spending account'; }
  if (owner !== 'shared') {
    const hasOwn = !(['joint', 'other'].includes(kind)) || h.board[owner] != null;
    return hasOwn ? P(owner) : 'Joint account';
  }
  if (kind === 'joint' || kind === 'other' || kind === 'own') return 'Joint account';
  if (kind === 'split') return list === 'bills' ? 'Joint bills' : 'Joint spending';
  if (kind === 'contribute') return h.two ? (list === 'bills' ? 'Joint bills' : 'Joint spending') : 'Joint account';
  if (kind === 'housekeeping') return P(h.payer);
  throw new Error('shared item in ' + kind);
}
export const incomeAccount = h => intendedAccount(h, { owner: 'shared' }, 'bills') ;

export const applies = (b, m) => !b.months || !b.months.length || b.months.length >= 12 || b.months.includes(m);
export function billMonths(b) { return b.freq === 'yearly' ? [b.month] : b.freq === 'some' ? b.picked.slice().sort((x, y) => x - y) : []; }

/** Water-filling: shares max(0, L_i − T) adding up to need. */
function sameLeft(need, L) {
  if (!(need > 0)) return L.map(() => 0);
  let lo = Math.min(...L) - need - 1, hi = Math.max(...L);
  for (let g = 0; g < 200; g++) { const T = (lo + hi) / 2, s = L.reduce((a, v) => a + Math.max(0, v - T), 0); if (s > need) lo = T; else hi = T; }
  const T = (lo + hi) / 2; return L.map(v => Math.max(0, v - T));
}

/** What should happen in month m (1–12), from the household's own description:
    contrib: [{who, to, amt}] (shares and set amounts), keeps: {personIndex: amount} (own accounts that keep what's
    left), hhLeft: what the household has left (everyone but boarders), total: every account's left over together. */
export function oracle(h, m, payNow, ones = []) {
  // usual: each person's usual pay (who shares, and the weights for "in proportion to pay"); pay: this month's.
  const n = h.people.length, kind = shapeOf(h), usual = h.people.map(p => p.pay), pay = payNow || usual;
  const w = i => usual[i] > 0 ? usual[i] : Math.max(0, pay[i]);
  const due = b => applies({ months: billMonths(b) }, m);
  const isBoard = i => h.board[i] != null;
  const cost = { shared: 0, sharedBills: 0, sharedSpend: 0 }, own = Array(n).fill(0);
  h.bills.forEach(b => { if (!due(b)) return; if (b.owner === 'shared') { cost.shared += b.amount; cost.sharedBills += b.amount; } else own[b.owner] += b.amount; });
  [...h.budgets, ...h.savings].forEach(x => { if (x.owner === 'shared') { cost.shared += x.amount; cost.sharedSpend += x.amount; } else own[x.owner] += x.amount; });
  // 2.14: what an account's rough figure covers that isn't listed yet is money out of it, the same every month, like a bill.
  figureExtras(h).forEach(e => { if (e.owner === 'shared') { cost.shared += e.amount; cost.sharedBills += e.amount; } else own[e.owner] += e.amount; });
  // One-offs (2.13 simulation): a payment out of an account is a cost of whoever's account it is this month, money in is
  // the same with the sign the other way (it lowers what that account needs).
  ones.forEach(o => { const v = o.kind === 'in' ? -o.amount : o.amount;
    if (o.owner === 'shared') { cost.shared += v; if (o.list === 'bills') cost.sharedBills += v; else cost.sharedSpend += v; } else own[o.owner] += v; });
  const fun = h.fun ? h.fun : Array(n).fill(0);
  if (h.style === 'pool') fun.forEach((v, i) => own[i] += v);
  const income = h.income.reduce((s, x) => s + x.amount, 0);
  const allCosts = cost.shared + own.reduce((a, b) => a + b, 0);
  const total = pay.reduce((a, b) => a + b, 0) + income - allCosts;
  const out = { contrib: [], keeps: {}, total, hhLeft: null, notes: [] };
  const boardAmt = i => h.board[i] || 0;
  const boardTotal = Object.keys(h.board).reduce((s, i) => s + boardAmt(Number(i)), 0);
  // Boarders keep their own account: pay − their own costs − board.
  Object.keys(h.board).forEach(k => { const i = Number(k); out.contrib.push({ who: i, to: 'main', amt: boardAmt(i), set: true }); out.keeps[i] = pay[i] - own[i] - boardAmt(i); });
  const boarderLeft = Object.keys(h.board).reduce((s, k) => s + out.keeps[Number(k)], 0);
  out.hhLeft = total - boarderLeft;
  if (!h.multi || h.style === 'pool' || h.style === 'other') return out;
  const earners = h.people.map((p, i) => i).filter(i => !isBoard(i) && usual[i] > 0);
  const inP = h.people.map((p, i) => i).filter(i => !isBoard(i));
  const earner = earners[0];
  const gets = {}; if (earner != null) Object.keys(h.gets).forEach(k => { const i = Number(k); if (usual[i] > 0 || i === h.payer) return; gets[i] = h.gets[i]; out.contrib.push({ who: earner, to: i, amt: h.gets[i], set: true }); });
  const getsGiven = i => i === earner ? Object.values(gets).reduce((a, b) => a + b, 0) : 0;
  // Someone ticked later as paying board (README: Settings › People): their own account is their money, not the household's.
  const apart = () => { Object.keys(h.ticked || {}).forEach(k => { out.hhLeft -= out.keeps[Number(k)]; }); return out; };
  if (h.style === 'separate') { inP.forEach(i => { out.keeps[i] = pay[i] - own[i] - getsGiven(i) + (gets[i] || 0) + (i === 0 ? income : 0); }); return apart(); }
  // contribute and housekeeping: the shared account's need, shared among the sharers by the rule.
  let sharers = inP.filter(i => usual[i] > 0); if (!sharers.length) sharers = inP.slice(0, 1);
  if (h.style === 'housekeeping' && !sharers.includes(h.payer)) sharers.unshift(h.payer);
  // The shared account's costs: shared items, less other income (which goes to it), less board.
  let need = cost.shared - income - boardTotal;
  // In housekeeping the shared account is the payer's own, so the payer's own costs are in it too.
  if (h.style === 'housekeeping') need += own[h.payer];
  const setAmt = i => h.rule === 'set' ? (h.set[i] || 0) : null;
  const L = sharers.map(i => (h.style === 'housekeeping' && i === h.payer) ? pay[i] - getsGiven(i) : pay[i] - own[i] - getsGiven(i));
  let shares;
  if (h.rule === 'set') shares = sharers.map(setAmt);
  else {
    const nd = Math.max(0, need);
    if (h.style === 'contribute' && h.two) {
      // Joint bills first (its own need), then joint spending (its budgets and savings, less what bills passed on).
      const nb = cost.sharedBills - income - boardTotal, ns = cost.sharedSpend - Math.max(0, -nb);
      const by = (x, Lx) => h.rule === 'equal' ? sharers.map(() => x / sharers.length) : h.rule === 'pay' ? sharers.map(i => x * w(i) / sharers.reduce((s, j) => s + w(j), 0)) : sameLeft(x, Lx);
      const s1 = by(Math.max(0, nb), L), s2 = by(Math.max(0, ns), L.map((v, k) => v - s1[k]));
      shares = s1.map((v, k) => v + s2[k]);
    } else shares = h.rule === 'equal' ? sharers.map(() => nd / sharers.length) : h.rule === 'pay' ? sharers.map(i => nd * w(i) / sharers.reduce((s, j) => s + w(j), 0)) : sameLeft(nd, L);
  }
  sharers.forEach((i, k) => { if (!(h.style === 'housekeeping' && i === h.payer)) out.contrib.push({ who: i, to: 'shared', amt: shares[k], set: h.rule === 'set' }); });
  const paid = {}; sharers.forEach((i, k) => paid[i] = shares[k]);
  inP.forEach(i => {
    if (h.style === 'housekeeping' && i === h.payer) {
      // Keeps what's left in their account: their pay + others' shares + board + income − everything in it.
      const others = sharers.filter(j => j !== i).reduce((s, j) => s + paid[j], 0);
      out.keeps[i] = pay[i] + others + boardTotal + income - cost.shared - own[i] - getsGiven(i);
    } else out.keeps[i] = pay[i] - own[i] - (paid[i] || 0) - getsGiven(i) + (gets[i] || 0);
  });
  if (h.style === 'contribute') { const paidIn = sharers.reduce((s, j) => s + paid[j], 0); out.jointLeft = paidIn + boardTotal + income - cost.shared; }
  out.sharers = sharers; out.shares = paid;
  return apart();
}

// ---------- The history layer (2.13): changes of style, dated items, one-offs and boarders ticked later ----------
// Written from the README's "Data" section and the plan's description (months before a change keep what they had; months
// from it follow the new household), not from calc.js. Specs below are whole households, one per stretch of months: the
// oracle for month m is the oracle of the spec in effect that month.

/** The account other income goes to: the shared account, or the first person's own when nothing is shared. */
export const incomeName = h => h.multi && h.style === 'separate' ? h.people[0].name + "'s account" : intendedAccount(h, { owner: 'shared' }, 'bills');

/** The household with ids on every item (as logic.mjs's buildCfg gives them: b0, g0, s0, i0; spending money f0) and spending
    money as budgets each person owns (the oracle counts both the same way, and a change of style keeps them as budgets). */
export function withIds(h) {
  const x = JSON.parse(JSON.stringify(h));
  x.bills.forEach((b, i) => { b.id ||= 'b' + i; }); x.budgets.forEach((b, i) => { b.id = 'g' + i; }); x.savings.forEach((b, i) => { b.id = 's' + i; }); x.income.forEach((b, i) => { b.id = 'i' + i; });
  if (x.fun) x.fun.forEach((v, i) => { if (v > 0) x.budgets.push({ id: 'f' + i, name: x.people[i].name + "'s spending money", amount: v, owner: i }); });
  x.fun = null; x.ticked = x.ticked || {};
  return x;
}

/** Whether person i's own account is one a boarder can have (README, Settings › People and boarderAccounts): their pay goes
    into an account of their own that keeps what's left, nothing passes into it, and nobody else pays into it. */
export function ownApart(h, i) {
  if (!h.multi || !(i > 0)) return false;
  if (h.board[i] != null) return true;
  if (h.style === 'pool' || h.style === 'other') return false;
  if (h.style === 'housekeeping' && i === h.payer) return false;
  // Money from the earner for someone with no pay of their own is someone else paying into it.
  if (h.gets[i] != null && !(h.people[i].pay > 0) && h.people.some((p, j) => j !== i && h.board[j] == null && p.pay > 0)) return false;
  return true;
}

/** A change of how the household manages its money: the same people, pay and items, a new style and rule from setup's
    catalogue (sometimes the same style with other answers). Items nobody shares in the new style go to someone; spending
    money stays a budget. Who pays board is asked only where setup asks (three or more people pooling, sharing or paying
    housekeeping); elsewhere anyone ticked stays ticked. */
export function restyle(h, seed) {
  const R = rng(seed * 7919 + 13), pick = a => a[Math.floor(R() * a.length)], chance = p => R() < p;
  const n = h.people.length, multi = h.multi, key = x => [shapeOf(x), x.rule, x.two, x.payer, JSON.stringify(x.board), JSON.stringify(x.set)].join('|');
  let x;
  for (let tries = 0; tries < 30; tries++) {
    x = JSON.parse(JSON.stringify(h)); x.rule = null; x.two = false; x.payer = null; x.set = null; x.gets = {}; x.board = {}; x.ticked = {};
    if (!multi) { x.pool = pick(['joint', 'own', 'split', 'other']); x.style = null; }
    else {
      x.style = pick(['pool', 'contribute', 'contribute', 'housekeeping', 'separate', 'other']); x.pool = x.style === 'pool' ? pick(['joint', 'own', 'split']) : null;
      if (x.style === 'contribute' || x.style === 'housekeeping') x.rule = pick(['equal', 'pay', 'sameLeft', 'set']);
      if (x.style === 'contribute') x.two = chance(0.4);
      if (x.style === 'housekeeping') x.payer = Math.floor(R() * n);
      if (n > 2 && ['pool', 'contribute', 'housekeeping'].includes(x.style) && chance(0.5)) {
        const b = 2 + Math.floor(R() * (n - 2)); if (!(x.style === 'housekeeping' && x.payer === b)) x.board[b] = h.board[b] != null && chance(0.6) ? h.board[b] : 150 + Math.floor(R() * 350); }
      const earner = x.people.findIndex((p, i) => p.pay > 0 && x.board[i] == null);
      if (['contribute', 'housekeeping', 'separate'].includes(x.style) && earner >= 0)
        x.people.forEach((p, i) => { if (!(p.pay > 0) && x.board[i] == null && i !== x.payer && chance(0.6)) x.gets[i] = h.gets[i] ?? 150 + Math.floor(R() * 450); });
      if (x.style === 'housekeeping' && x.rule === 'equal' && !(x.people[x.payer].pay > 0) && x.people.some(p => p.pay > 0)) x.rule = 'pay';
      if (x.rule === 'set') x.set = x.people.map(p => p.pay > 0 ? 300 + Math.floor(R() * 1200) : 0);
      // 2.13: with only one earner among those who'd share (or one of us paying the bills and that's the only earner), the
      // change doesn't ask how to split it, and it goes by pay, as in makeHousehold.
      x.ruleAsked = true;
      const earners = x.people.map((q, i) => i).filter(i => x.board[i] == null && x.people[i].pay > 0);
      if (earners.length === 1 && (x.style === 'contribute' || (x.style === 'housekeeping' && earners[0] === x.payer))) { x.rule = 'pay'; x.set = null; x.ruleAsked = false; }
      // Setup only asks about board where it can have it; anyone ticked before stays ticked when it doesn't ask.
      const asked = n > 2 && ['pool', 'contribute', 'housekeeping'].includes(x.style);
      if (!asked) Object.keys(h.board).concat(Object.keys(h.ticked || {})).forEach(k => { if (ownApart(x, Number(k))) x.ticked[k] = true; });
    }
    if (key(x) !== key(h)) break;
  }
  const personal = /^(Mobile phone|Car |Gym |Fuel )/;
  ['bills', 'budgets', 'savings'].forEach(l => x[l].forEach(it => {
    if (x.style === 'separate' && it.owner === 'shared') it.owner = Math.floor(R() * n);
    else if (multi && h.style === 'separate' && x.style !== 'separate' && !personal.test(it.name) && chance(0.7)) it.owner = 'shared';
  }));
  return x;
}

/** One-offs for each month (2.13 simulation): in about four months in ten, one or two payments out or money in, each in
    the account of an owner ("shared" with the list whose account it is, or a person). {month: [...]} */
export function oneOffsFor(h, seed) {
  const R = rng(seed * 31 + 7), out = {}, n = h.people.length;
  for (let m = 1; m <= 12; m++) {
    if (R() > 0.4) continue; out[m] = [];
    for (let j = 0, k = R() < 0.7 ? 1 : 2; j < k; j++) {
      const kind = R() < 0.65 ? 'out' : 'in', owner = h.multi && h.style !== 'separate' && R() < 0.55 ? 'shared' : Math.floor(R() * n);
      out[m].push({ id: 'o' + m + '_' + j, kind, name: kind === 'in' ? 'Refund' : 'Car repair', amount: r2(15 + R() * (kind === 'in' ? 500 : 900)), owner, list: R() < 0.5 ? 'bills' : 'budgets' });
    }
  }
  return out;
}
/** The account a one-off (or any item with an owner) is in, by name, for spec h. */
export const oneOffAccount = (h, o) => intendedAccount(h, o, o.list === 'bills' ? 'bills' : 'budgets');

/** The 2.13 top-up rule, for households where nobody pays shares (pooling without board, one person): what each account
    keeps, by name. From the README: an account's own money is what arrives in it less what goes out of it; a subtotal adds
    what the accounts sending to it pass up. Positive subtotals move up first (deepest first), then top-ups from the top
    down. A top-up sends only what its account has by then (money in, and what has reached it in the steps before); the
    rest is a shortfall in the account that needed it, and the account that would have sent it keeps that much more. The
    total left over is the same as without the rule. null for a household this doesn't describe. */
export function chainOracle(h, m, payNow, ones = []) {
  const kind = shapeOf(h), P = i => h.people[i].name + "'s account";
  if (Object.keys(h.board).length || (h.multi && h.style !== 'pool')) return null;
  const parent = {}, acc = [];
  const add = (name, up) => { if (!(name in parent)) { acc.push(name); parent[name] = up; } };
  if (!h.multi) {
    if (kind === 'own') { add('Bills account', 'Spending account'); add('Spending account', null); }
    // 2.16, E17: one person with a pay pattern gets Bills topped up from the pay account, which moves what's left on.
    else if (kind === 'split' && topsUpBills(h)) { add('Bills account', 'Pay account'); add('Pay account', 'Spending account'); add('Spending account', null); }
    else if (kind === 'split') { add('Pay account', 'Bills account'); add('Bills account', 'Spending account'); add('Spending account', null); }
    else return null;
  } else if (kind === 'own') { h.people.forEach((p, i) => add(P(i), 'Joint account')); add('Joint account', null); }
  else if (kind === 'split') { h.people.forEach((p, i) => add(P(i), 'Joint bills')); add('Joint bills', 'Joint spending'); add('Joint spending', null); }
  else return null;
  const payTo = !h.multi ? (kind === 'split' ? 'Pay account' : 'Bills account') : null;
  const inn = {}, out = {}; acc.forEach(a => { inn[a] = 0; out[a] = 0; });
  const pay = payNow || h.people.map(p => p.pay);
  h.people.forEach((p, i) => { inn[payTo || P(i)] += pay[i]; });
  h.income.forEach(x => { inn[incomeName(h)] += x.amount; });
  const due = b => applies({ months: billMonths(b) }, m);
  h.bills.forEach(b => { if (due(b)) out[intendedAccount(h, b, 'bills')] += b.amount; });
  h.budgets.forEach(b => { out[intendedAccount(h, b, 'budgets')] += b.amount; });
  h.savings.forEach(b => { out[intendedAccount(h, b, 'savings')] += b.amount; });
  figureExtras(h).forEach(e => { out[e.account] += e.amount; });
  if (h.fun) h.fun.forEach((v, i) => { out[intendedAccount(h, { owner: i }, 'budgets')] += v; });
  ones.forEach(o => { if (o.kind === 'in') inn[oneOffAccount(h, o)] += o.amount; else out[oneOffAccount(h, o)] += o.amount; });
  const depth = a => { let d = 0, x = parent[a]; while (x) { d++; x = parent[x]; } return d; };
  const sub = {}, subOf = a => sub[a] ??= inn[a] - out[a] + acc.filter(k => parent[k] === a).reduce((s, k) => s + subOf(k), 0);
  acc.forEach(subOf);
  const bal = {}, held = {}; acc.forEach(a => { bal[a] = inn[a]; held[a] = 0; });
  const kids = acc.filter(a => parent[a]);
  kids.slice().sort((a, b) => depth(b) - depth(a)).forEach(a => { if (r2(sub[a]) > 0.004) { bal[a] -= sub[a]; bal[parent[a]] += sub[a]; } });
  kids.slice().sort((a, b) => depth(a) - depth(b)).forEach(a => { if (!(r2(sub[a]) < -0.004)) return; const up = parent[a], want = -sub[a], send = Math.min(want, r2(Math.max(0, bal[up])));
    if (want - send > 0.004) { held[a] -= want - send; held[up] += want - send; } bal[up] -= send; bal[a] += send; });
  const keeps = {}; acc.forEach(a => { if (!parent[a]) keeps[a] = { amt: sub[a] + held[a] }; else if (Math.abs(held[a]) > 0.004) keeps[a] = { amt: held[a], short: true }; });
  return keeps;
}

// ---------- The rough figure (2.14) ----------
// Written from docs/onboarding.md (5.2 the rule, 5.9 where a figure is allowed, 7 what to simulate), not from calc.js.
// A household with a figure has h.figures [{id, owner, amount}] (owner: "shared" or a person, whose bills' account the
// figure is for; two on one account add up), h.bills with only the bills that are listed, and h.hidden with the rest of
// what the household really pays (the "truth", never in the settings). h.figureKind: "figure", or "anchor" (the figure
// raised to what the household moves in, modelled as the true total).

/** Whether a bill is counted inside its account's figure: it comes in every month or in 7 or more months a year. */
export const inFigure = b => { const n = billMonths(b).length; return n === 0 || n >= 7; };

/** The rule, per account (5.2). For each account with a figure: {account, owner, figure, listed, amount}, where listed is
    the amounts of its listed bills that come in every month or in 7 or more (whether or not they're due this month) and
    amount, "not listed yet", is the figure less that, never below £0: the same every month. */
export function figureExtras(h) {
  const by = {};
  (h.figures || []).forEach(f => { const a = intendedAccount(h, { owner: f.owner }, 'bills'); (by[a] ||= { account: a, owner: f.owner, figure: 0 }).figure += f.amount; });
  return Object.values(by).map(x => { x.figure = r2(x.figure);
    x.listed = r2(h.bills.filter(b => inFigure(b) && intendedAccount(h, b, 'bills') === x.account).reduce((s, b) => s + b.amount, 0));
    x.amount = Math.max(0, r2(x.figure - x.listed)); return x; });
}

/** An account's bills in month m: not listed yet plus the listed bills actually due that month (every bill, whatever its
    months). The worked example in 5.2 is checked against this in tests/unit/sim-oracle.test.mjs. */
export function billsOut(h, account, m) {
  const x = figureExtras(h).find(e => e.account === account);
  return r2((x ? x.amount : 0) + h.bills.filter(b => intendedAccount(h, b, 'bills') === account && applies({ months: billMonths(b) }, m)).reduce((s, b) => s + b.amount, 0));
}

/** The household with every bill listed and no figure: what the oracle (and the settings) would be without the figure. */
export function fullListed(h) {
  const x = JSON.parse(JSON.stringify(h)), n = b => Number(String(b.id).replace(/^\D+/, ''));
  x.bills = x.bills.concat(x.hidden || []).sort((a, b) => n(a) - n(b)); x.hidden = []; x.figures = []; x.figureKind = 'listed'; return x;
}

/** Where a figure is allowed (5.9): not on a boarder's own account (it's outside the household's figures), and not on
    someone's own account when they pay a share into another account under "in proportion to what's left after own bills"
    or "so we each keep the same" (a generous guess would shift cost to their partner). */
export function figureAllowed(h, account) {
  return !h.people.some((p, i) => account === p.name + "'s account" && (h.board[i] != null || (h.ticked && h.ticked[i])
    || (h.multi && ['contribute', 'housekeeping'].includes(h.style) && ['afterOwn', 'sameLeft'].includes(h.rule) && !(h.style === 'housekeeping' && i === h.payer))));
}

/** Make household h (from makeHousehold) one that starts from a rough figure, with its own seeded draws so makeHousehold's
    households are untouched. kind: "figure", "anchor" or "listed" (returned as it is); left out, one is drawn (listed
    about a quarter of the time). Per account bills come out of: with some probability a figure of the true monthly total
    of its 7-plus-month bills x 0.7 to 1.3, to £10 (sometimes exactly the total, sometimes £0 or blank: none), and only
    the biggest 0 to 100% of its bills listed (the rest are only in h.hidden). An anchor's figure is raised to the true
    total, what the household moves into the account. Accounts a figure isn't allowed on list everything. */
export function withFigures(h, seed, kind) {
  const R = rng(seed * 104729 + 31), chance = p => R() < p;
  const k = kind ?? (R() < 0.25 ? 'listed' : R() < 0.55 ? 'figure' : 'anchor');
  if (k === 'listed') return h;
  const x = JSON.parse(JSON.stringify(h)); x.bills.forEach((b, i) => { b.id ||= 'b' + i; });
  x.figureKind = k; x.figures = []; x.hidden = []; x.truth = [];
  // Boundary bills, which makeHousehold has none of: some that come in 6, 7 or 8 months a year (6 is never inside a figure, 7 is).
  [...new Set(x.bills.map(b => intendedAccount(x, b, 'bills')))].forEach(a => { if (!chance(0.3)) return; const owner = x.bills.find(b => intendedAccount(x, b, 'bills') === a).owner, n = 6 + Math.floor(R() * 3), st = 1 + Math.floor(R() * 12);
    x.bills.push({ id: 'b' + x.bills.length, name: n === 6 ? 'Boiler cover' : 'Seasonal bill', amount: r2(15 + R() * 80), freq: 'some', picked: Array.from({ length: n }, (_, i) => 1 + (st - 1 + i) % 12), owner }); });
  const accounts = [...new Set(x.bills.map(b => intendedAccount(x, b, 'bills')))], hid = new Set();
  accounts.forEach(a => {
    const mine = x.bills.filter(b => intendedAccount(x, b, 'bills') === a), true7 = r2(mine.filter(inFigure).reduce((s, b) => s + b.amount, 0));
    if (!figureAllowed(x, a) || !chance(0.85)) { x.truth.push({ account: a, true7, figure: 0, rough: 0, bills: mine.length, listed: mine.length }); return; }
    const u = R(); let fig = u < 0.1 ? 0 : u < 0.2 ? true7 : Math.round(true7 * (0.7 + R() * 0.6) / 10) * 10;
    const rough = fig; // what the household first thought of; an anchor is raised from it to what it moves in
    if (k === 'anchor') fig = Math.max(fig, true7);
    const frac = chance(0.15) ? 0 : chance(0.2) ? 1 : R(), nListed = Math.round(frac * mine.length);
    mine.slice().sort((p, q) => q.amount - p.amount).slice(nListed).forEach(b => hid.add(b));
    fig = r2(fig);
    if (fig > 0) { const owner = mine[0].owner, split = chance(0.1) && fig >= 20, first = split ? r2(fig * 0.6) : fig;
      x.figures.push({ id: 'e' + x.figures.length, owner, amount: first }); if (split) x.figures.push({ id: 'e' + x.figures.length, owner, amount: r2(fig - first) }); }
    x.truth.push({ account: a, true7, figure: fig, rough: r2(rough), bills: mine.length, listed: mine.length - mine.filter(b => hid.has(b)).length });
  });
  x.hidden = x.bills.filter(b => hid.has(b)); x.bills = x.bills.filter(b => !hid.has(b));
  return x;
}

// ---------- Pay patterns (2.16) ----------
// Written from docs/payperiods.md (5.3.1 data, 5.3.3 the pay a month plans on, 5.3.4 the extra payday, 5.3.5 money styles,
// section 7's simulation column) and section 11.2 (E6–E17), not from calc.js. A person on a pattern has every (7, 14 or 28:
// days between paydays) and each (take-home pay each time); their pay stays a month's usual pay, worked out from each.

/** Paydays a year and in a usual month, by days between paydays (5.3.1's PAY_EVERY, written out again here). */
export const PAY_YEAR = { 7: 52, 14: 26, 28: 13 }, PAY_N = { 7: 4, 14: 2, 28: 1 };
/** Whether households get patterns: on by default; SIM_PATTERNS=0 leaves them out (a run without them says so). */
export const patternsOn = () => process.env.SIM_PATTERNS ? process.env.SIM_PATTERNS !== '0' : true;
export const patternNote = 'Pay patterns: not run (SIM_PATTERNS=0)';
/** A month's usual pay for a person as the spec has them ({pay}, or {every, each}): over a year ÷ 12, to the penny (5.3.1). */
export const monthlyOf = s => s.every ? r2(s.each * PAY_YEAR[s.every] / 12) : s.pay;
/** Whether anyone in spec h is paid on a pattern. */
export const hasPattern = h => h.people.some(p => p.every);
/** E17: one person on a pattern who picks "My pay account, a bills account and a spending account" gets Bills topped up
    from the pay account (Bills → Pay account → Spending). A spec can say otherwise (h.e17, after a change of style). */
export const topsUpBills = h => h.e17 ?? (!h.multi && h.pool === 'split' && !!h.people[0].every);

/** Household h with about `share` of the people who have pay on a pattern: every 7, 14 or 28 days, each = their monthly pay
    × 12 ÷ paydays a year, to the penny, and their pay the month's usual pay that gives (so the oracle's weight is
    usualMonthly). A household with a pattern always has a transfer day (setup won't skip step 3 then). Own seeded draws. */
export function withPatterns(h, seed, share = 0.2) {
  const R = rng(seed * 7907 + 101), x = JSON.parse(JSON.stringify(h));
  x.people.forEach(p => { if (!(p.pay > 0) || R() >= share) return; const every = [7, 14, 28][Math.floor(R() * 3)];
    p.every = every; p.each = r2(p.pay * 12 / PAY_YEAR[every]); p.pay = monthlyOf(p); });
  if (hasPattern(x) && !x.payday) x.payday = { day: [1, 15, 20, 25, 28, 'last', 31][Math.floor(R() * 7)], same: R() < 0.7, weekend: R() < 0.85 };
  return x;
}

/** What month m plans on for person i (5.3.3 and E7), from the spec's months pm (payMonthsFor) and stateAt(i, m), the
    person as they were that month ({pay}, or {every, each, pay}): {arrived, setAside, used, typed}.
    - Arrived: what was saved for the month (typed, or an estimate saved by a tick); otherwise, on a pattern, each × N (never
      an earlier month's total); otherwise the latest month typed while they were paid monthly, else their usual pay then.
    - Set aside: an extra payday's amount, only for typed pay on a pattern and only when it isn't counted; otherwise 0.
    - Used: arrived less set aside, never below 0. */
export function planOracle(pm, stateAt, i, m) {
  const s = stateAt(i, m), d = (pm[m] || [])[i] || {}, typed = d.pay != null && !d.est;
  let arrived;
  if (d.pay != null) arrived = d.pay;
  else if (s.every) arrived = r2(s.each * PAY_N[s.every]);
  else { arrived = s.pay; for (let j = m - 1; j >= 1; j--) { const e = (pm[j] || [])[i]; if (e && e.pay != null && !e.est && !stateAt(i, j).every) { arrived = e.pay; break; } } }
  const setAside = typed && s.every && d.extra && !d.extra.counted ? d.extra.amount : 0;
  return { arrived, setAside, used: Math.max(0, r2(arrived - setAside)), typed };
}

/** The pay side of twelve saved months for spec h: pm[m][i] = {pay (number or null), est (saved by a tick before pay was
    typed), extra ({amount, counted?} or null)}. About a quarter of people never type their pay; the rest type it in a bit
    under half the months. On a pattern, a typed month holds N paydays, or N + 1 a quarter of the time: then the extra is set
    aside, counted or left in, at random (about one pay each time, sometimes a little more or less). Now and then an extra is
    saved on a month that isn't typed (E7: it sets nothing aside), and rarely one larger than what arrived (used is then 0). A month saved by a
    tick holds the estimate of the time. stateAt(i, m) as planOracle's (default: the person as h has them). Own draws. */
export function payMonthsFor(h, seed, stateAt) {
  stateAt ||= i => h.people[i];
  const R = rng(seed * 6007 + 29), pm = [], never = h.people.map(() => R() < 0.25);
  for (let m = 1; m <= 12; m++) pm[m] = h.people.map((p, i) => {
    const s = stateAt(i, m), d = { pay: null, est: false, extra: null }, x = R();
    if (!(p.pay > 0) || never[i]) return d;
    if (x < 0.45) {
      if (s.every) {
        const N = PAY_N[s.every], k = R() < 0.25 ? N + 1 : N; let sum = 0; for (let j = 0; j < k; j++) sum += r2(s.each * (0.9 + R() * 0.2)); d.pay = r2(sum);
        if (k > N) { const u = R(); if (u < 0.75) d.extra = Object.assign({ amount: R() < 0.7 ? s.each : r2(s.each * (0.8 + R() * 0.4)) }, u < 0.35 ? { counted: true } : {}); }
        else if (R() < 0.01) d.extra = { amount: r2(d.pay + s.each) };
      } else d.pay = r2(s.pay * (0.85 + R() * 0.3));
    } else if (x < 0.52) d.est = true;
    else if (s.every && R() < 0.05) d.extra = { amount: s.each };
    return d; });
  for (let m = 1; m <= 12; m++) pm[m].forEach((d, i) => { if (d.est) d.pay = planOracle(pm, stateAt, i, m).arrived; });
  return pm;
}

/** The saved months (payday.months.v1) for settings c from pm, with one-offs: ones[m] = [{id, kind, name, amount, account}]
    (account ids). Months with nothing saved are left out. */
export function monthsObj(c, pm, ones = {}) {
  const out = {};
  for (let m = 1; m <= 12; m++) {
    const k = '2027-' + String(m).padStart(2, '0'), d = {};
    (pm[m] || []).forEach((e, i) => { const id = c.people[i].id;
      if (e.pay != null) (d.pay ||= {})[id] = e.pay;
      if (e.est) (d.payEstimated ||= {})[id] = true;
      if (e.extra) (d.extra ||= {})[id] = Object.assign({ amount: e.extra.amount }, e.extra.counted ? { counted: true } : {}); });
    if ((ones[m] || []).length) d.oneOffs = ones[m].map(o => ({ ...o }));
    if (Object.keys(d).length) out[k] = d;
  }
  return out;
}

// ---------- Counting paydays (2.17, layer 2) ----------
// Written from docs/payperiods.md section 13 (13.1 H1–H2: how a date moves for weekends and bank holidays; 13.2 L1–L19:
// layer 2), 5.4–5.6 and model.md 3–4, not from calc.js. Dates are day numbers (0 = 1 January 1970) with their own
// arithmetic, never Date. Bank holidays: gov.uk's England and Wales list for 2024–2028 (the fixture), and outside those
// years H1's rule worked out here (Easter by Gauss's method, not the computus calc.js uses).

/** Day number of y-m-d (m 1–12): days counted from 1 March of year 0, so the leap day comes last. */
export function civilDays(y, m, d) { const yy = m <= 2 ? y - 1 : y, mm = m <= 2 ? m + 9 : m - 3;
  return 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + Math.floor((153 * mm + 2) / 5) + d - 1 - 719468; }
export const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return civilDays(y, m, d); };
const p2 = n => String(n).padStart(2, '0');
const yearOfDay = z => { let y = Math.floor(z / 365.2425) + 1970; while (civilDays(y, 1, 1) > z) y--; while (civilDays(y + 1, 1, 1) <= z) y++; return y; };
/** "YYYY-MM-DD" for day number z (the year by estimate and correction, then the month). */
export function dayStr(z) {
  const y = yearOfDay(z); let m = 1; while (m < 12 && civilDays(y, m + 1, 1) <= z) m++;
  return y + '-' + p2(m) + '-' + p2(z - civilDays(y, m, 1) + 1);
}
/** 0 Sunday … 6 Saturday (1 January 1970 was a Thursday). */
export const weekday = z => ((z + 4) % 7 + 7) % 7;
const leapYear = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const monthDays = (y, m) => [31, leapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
/** Month "YYYY-MM" moved on by j months. */
export const shiftK = (k, j) => { const [y, mo] = k.split('-').map(Number), t = y * 12 + (mo - 1) + j; return Math.floor(t / 12) + '-' + p2(t % 12 + 1); };
/** Easter Sunday by Gauss's method with its two exceptions (a day number). */
export function easterGauss(y) {
  const a = y % 19, b = y % 4, c = y % 7, k = Math.floor(y / 100), p = Math.floor((13 + 8 * k) / 25), q = Math.floor(k / 4);
  const M = ((15 - p + k - q) % 30 + 30) % 30, N = ((4 + k - q) % 7 + 7) % 7, d = (19 * a + M) % 30, e = (2 * b + 4 * c + 6 * d + N) % 7;
  if (d === 29 && e === 6) return civilDays(y, 4, 19);
  if (d === 28 && e === 6 && (11 * M + 11) % 30 < 19) return civilDays(y, 4, 18);
  return civilDays(y, 3, 22) + d + e;
}
/** England and Wales bank holidays in year y by H1's rule (day numbers, sorted): New Year's Day, Good Friday, Easter
    Monday, the first and last Mondays in May, the last Monday in August, Christmas Day and Boxing Day, each on a weekend
    moved to the next weekday that isn't already one. */
export function holidaysByRule(y) {
  const out = new Set(), mon = z => weekday(z) === 1;
  const free = z => { while (weekday(z) === 0 || weekday(z) === 6 || out.has(z)) z++; return z; };
  let z; out.add(free(civilDays(y, 1, 1)));
  const e = easterGauss(y); out.add(e - 2); out.add(e + 1);
  for (z = civilDays(y, 5, 1); !mon(z); z++); out.add(z);
  for (z = civilDays(y, 5, 31); !mon(z); z--); out.add(z);
  for (z = civilDays(y, 8, 31); !mon(z); z--); out.add(z);
  out.add(free(civilDays(y, 12, 25))); out.add(free(civilDays(y, 12, 26)));
  return [...out].sort((a, b) => a - b);
}
const GOVUK_FILE = JSON.parse(fs.readFileSync(new URL('../fixtures/govuk-bank-holidays-ew-2024-2028.json', import.meta.url), 'utf8'));
/** gov.uk's dates by year (day numbers), for the years the fixture covers. */
export const GOVUK = (() => { const o = {}; for (let y = GOVUK_FILE.years[0]; y <= GOVUK_FILE.years[1]; y++) o[y] = []; GOVUK_FILE.dates.forEach(x => o[Number(x.date.slice(0, 4))].push(dayNum(x.date))); return o; })();
const lastFriday = (y, m) => { let z = civilDays(y, m, monthDays(y, m)); while (weekday(z) !== 5) z--; return z; };
/** A bank holiday calendar. mode "real": gov.uk's list for 2024–2028, the rule outside; "none": no holidays (the rule
    switched off); "madeup": the real ones plus the last Friday of every month (a made-up holiday that lands on paydays and
    transfer days). {mode, has(z), list(y) ("YYYY-MM-DD", sorted)}. */
export function holidayCal(mode = 'real') {
  const memo = new Map(), year = y => { if (!memo.has(y)) { let s = new Set();
    if (mode !== 'none') { s = new Set(GOVUK[y] || holidaysByRule(y)); if (mode === 'madeup') for (let m = 1; m <= 12; m++) s.add(lastFriday(y, m)); }
    memo.set(y, s); } return memo.get(y); };
  return { mode, has: z => year(yearOfDay(z)).has(z), list: y => [...year(y)].sort((a, b) => a - b).map(dayStr) };
}
/** The working day on or before day z: back one day at a time past weekends and bank holidays. */
export function moveBack(z, cal) { let g = 0; while ((weekday(z) === 0 || weekday(z) === 6 || cal.has(z)) && g++ < 30) z--; return z; }
/** The transfer day for month k as 13.1 H2 has it (a day number), or null without one: a day from the 15th on (or
    "last") is in the month before; the day is capped at the month's length, then "last" always moves to the working day
    on or before it, and a numbered day does unless weekend is false. */
export function transferDayOracle(pc, k, cal) {
  if (!pc || !pc.day) return null;
  let [y, m] = k.split('-').map(Number);
  if (pc.day === 'last' || Number(pc.day) >= 15) { m--; if (m < 1) { m = 12; y--; } }
  if (pc.day === 'last') return moveBack(civilDays(y, m, monthDays(y, m)), cal);
  const z = civilDays(y, m, Math.min(Number(pc.day), monthDays(y, m)));
  return pc.weekend === false ? z : moveBack(z, cal);
}
/** L8: with no transfer day, the windows use the 25th, not moved. */
export const FALLBACK_DAY = { day: 25, weekend: false };
/** Month k's window (L8): after the transfer day before it, up to and including its own (day numbers). */
export function windowOracle(pc, k, cal) { const q = pc && pc.day ? pc : FALLBACK_DAY; return { after: transferDayOracle(q, shiftK(k, -1), cal), upTo: transferDayOracle(q, k, cal) }; }
/** The paydays counted in (after, upTo] (L8) for pattern {every, on, since?}: every on + j × every (any whole j), each
    moved to the working day on or before it, counted when after < moved ≤ upTo and, with since, moved ≥ since moved the
    same way (L20: since is stored as typed, and compared on the working day on or before it). L21: since only applies to
    a window that reaches it; a window that ends before the moved since counts as if there were none (and in a window
    after it, it removes nothing anyway). "YYYY-MM-DD", in order. */
export function countOracle(pt, after, upTo, cal) {
  const O = dayNum(pt.on), E = pt.every, S0 = pt.since ? moveBack(dayNum(pt.since), cal) : null, S = S0 != null && upTo >= S0 ? S0 : null, out = [];
  for (let j = Math.ceil((after + 1 - O) / E); O + j * E <= upTo + 12; j++) { const a = moveBack(O + j * E, cal); if (a > after && a <= upTo && (S == null || a >= S)) out.push(a); }
  return out.sort((a, b) => a - b).map(dayStr);
}

/** Household h (with patterns) with layer 2's dates, from its own seeded draws (so every other household is untouched):
    about three in four people on a pattern get `on`, a payday as it usually falls (a Friday more often than not, shifted
    by a random whole number of intervals: any payday in the series will do); about one in seven of them a `since` (a new
    job: a payday in the series in the first eight months, typed a few days early one time in four, as paid; then `on`
    is that payday half the time, as the change sheet sets both); about one in seven adds the date only from a later month (dateFrom, a month index: months saved before it
    stay in layer 1, M6). At least one person gets a date. h.start: the first of 24 months (November 2026 three times in
    four, otherwise a month in 2029–2040, where the rule stands in for gov.uk's list); h.noTransferDay: a damaged file
    with no transfer day (one in fifteen), whose windows use the 25th (L8). opts.start: the first month, given. */
export function withDates(h, seed, opts = {}) {
  const R = rng(seed * 6151 + 3), chance = p => R() < p, x = JSON.parse(JSON.stringify(h));
  x.start = chance(0.75) ? '2026-11' : (2029 + Math.floor(R() * 12)) + '-' + p2(1 + Math.floor(R() * 12));
  if (opts.start) x.start = opts.start;
  const base = dayNum(x.start + '-01');
  const date = p => { const want = chance(0.6) ? 5 : 1 + Math.floor(R() * 5); let z = base - 40 + Math.floor(R() * 7); while (weekday(z) !== want) z++;
    return z + 7 * Math.floor(R() * (p.every / 7)); };
  const dated = []; x.people.forEach((p, i) => { if (!p.every) return; const z = date(p), on = chance(0.75); dated.push([i, z, on]); });
  if (dated.length && !dated.some(d => d[2])) dated[0][2] = true;
  dated.forEach(([i, z, on]) => { const p = x.people[i]; if (!on) return;
    p.on = dayStr(z + p.every * (Math.floor(R() * 41) - 20));
    if (chance(0.15)) { const first = z + p.every * Math.floor(R() * Math.ceil(240 / p.every));
      // The first pay as the payslip dates it, or (one time in four) as it was paid, up to three days earlier (L20).
      p.since = dayStr(first - (chance(0.25) ? 1 + Math.floor(R() * 3) : 0)); if (chance(0.5)) p.on = dayStr(first); }
    if (chance(0.15)) p.dateFrom = 3 + Math.floor(R() * 13); });
  x.noTransferDay = chance(1 / 15);
  return x;
}

/** A settings person as layer 2 reads them: {id, every, each, n, on, since} (every null: paid every month). since only
    with on (L13). */
export function datedPerson(p) { const t = p && p.pattern;
  return t && PAY_N[t.every] && t.each > 0 ? { id: p.id, every: t.every, each: t.each, n: PAY_N[t.every], on: t.on || null, since: t.on && t.since ? t.since : null } : { id: p && p.id, every: null }; }
const has = (o, k) => !!(o && o[k] != null);
/** The default set aside (L3): r2(A × (M − N) ÷ M), A the typed pay, or each × M when a tick filled the box. */
export const defaultAside = (q, d, pid, M) => { const A = d.payEstimated && d.payEstimated[pid] ? q.each * M : d.pay[pid]; return r2(A * (M - q.n) / M); };
/** What a save of month body `body` should store (L3), the month as saved before being `old` (or undefined): for each
    person on a pattern, the freeze when their box goes from empty to a figure (typed or ticked), they have a date and no
    count is stored (paydays = M counted now; an extra already there is the household's and is marked edited, L22; else
    one of the default when M > N); then, when the
    count is above N and the extra has no `edited` and isn't locked (L6), its amount follows the box. people: datedPerson
    for each person that month; count(pid): M counted now; locked(pid): a one-off marks this month's extra as used;
    own(pid): whether an extra already there is the household's (default yes; L22's one exception is a counted line the
    count opened, frozen again after a change of interval, which stays the count's). A new object; body isn't changed. */
export function freezeOracle(people, body, old, count, locked, own = () => true) {
  const d = JSON.parse(JSON.stringify(body));
  people.forEach(q => { if (!q.every) return; const pid = q.id, box = has(d.pay, pid);
    if (box && !has(old && old.pay, pid) && q.on && !has(d.paydays, pid)) { const M = count(pid); (d.paydays ||= {})[pid] = M;
      // L22 (a): an extra already there (the household's own, from "Had an extra payday?") is marked edited and never
      // rewritten; only an entry the freeze creates follows typed pay.
      if (d.extra && d.extra[pid]) { if (own(pid)) d.extra[pid] = Object.assign({}, d.extra[pid], { edited: true }); }
      else if (M > q.n) (d.extra ||= {})[pid] = { amount: defaultAside(q, d, pid, M) }; }
    const M = d.paydays && d.paydays[pid], x = d.extra && d.extra[pid];
    if (box && M != null && M > q.n && x && !x.edited && !locked(pid)) x.amount = defaultAside(q, d, pid, M); });
  return d;
}
/** What planPay should give person q (datedPerson) in month body d (L1, L2, L9): a typed or ticked month reads only
    what's stored, with 2.16's rules (set aside only for typed pay, unless counted; used = arrived − set aside, never below
    0); an untyped month for someone with a date plans on each × min(M, N), M stored or else counted now (Mnow), nothing
    set aside, and gives layer 2, m, expected (each × M) and extraDefault (each × max(0, M − N)); without a date, or with
    typical, each × N (layer 1 without a date). monthlyEst: the estimate for someone paid every month. */
export function planOracle2(q, d, Mnow, monthlyEst, typical = false) {
  const pid = q.id, box = has(d.pay, pid), typed = box && !(d.payEstimated && d.payEstimated[pid]);
  if (!q.every) { const v = box ? d.pay[pid] : monthlyEst; return { arrived: v, setAside: 0, used: v, typed }; }
  if (box) { const v = d.pay[pid], x = d.extra && d.extra[pid], aside = typed && x && x.counted !== true ? Math.max(0, x.amount) : 0;
    return { arrived: v, setAside: aside, used: aside ? Math.max(0, r2(v - aside)) : v, typed, m: has(d.paydays, pid) ? d.paydays[pid] : undefined }; }
  // Layer 1 (no date): exactly 2.16's entry, with no layer (the head of engineering's ruling: the absence of layer means 1).
  if (typical || !q.on) { const v = r2(q.each * q.n); return { arrived: v, setAside: 0, used: v, typed: false }; }
  const M = has(d.paydays, pid) ? d.paydays[pid] : Mnow, v = r2(q.each * Math.min(M, q.n));
  return { arrived: v, setAside: 0, used: v, typed: false, layer: 2, m: M, expected: r2(q.each * M), extraDefault: r2(q.each * Math.max(0, M - q.n)) };
}
