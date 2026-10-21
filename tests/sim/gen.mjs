// The household simulation (2.12.1): made-up households from a seeded generator (every money style, rule, one earner,
// board, other income, bills that come some months, households that can't cover their bills), the account each item is
// meant for, and an independent oracle of what each person should pay and keep, written from the description of each
// style in docs/plans/play-store.md, not from calc.js. Made-up names and amounts only.
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const NAMES = ['Alex', 'Sam', 'Kit', 'Robin', 'Jo', 'Ash', 'Charlie', 'Frankie', 'Jordan', 'Morgan', 'Riley', 'Casey', 'Jamie', 'Taylor', 'Drew', 'Lee', 'Max', 'Nico', 'Ola', 'Priya', 'Ravi', 'Wren', 'Zara', 'Bo'];
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
  return { seed, people, multi, style, pool, rule, ruleAsked, two, payer, set, fun, gets, board, income, payday, bills, budgets, savings };
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
  return { people: h.people.map((p, i) => ({ id: id(i), name: p.name, pay: p.pay > 0 ? money(p.pay) : '', payAccount: null })),
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
  x.bills.forEach((b, i) => { b.id = 'b' + i; }); x.budgets.forEach((b, i) => { b.id = 'g' + i; }); x.savings.forEach((b, i) => { b.id = 's' + i; }); x.income.forEach((b, i) => { b.id = 'i' + i; });
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
