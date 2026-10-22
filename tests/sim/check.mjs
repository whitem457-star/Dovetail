// The household simulation's checks: invariants that hold for any household, and a comparison with the oracle in gen.mjs.
import { oracle, r2, intendedAccount, chainOracle, figureExtras, fullListed, planOracle, PAY_N, PAY_YEAR } from './gen.mjs';

const near = (a, b, tol = 0.011) => Math.abs(a - b) <= tol;

/** Account id for an account name (the default names setup gives). */
export const idByName = (c, n) => (c.accounts.find(a => a.name === n) || {}).id;
const idByNameIn = idByName;

/** The household's main account (where board goes), by its shape. */
function mainName(h) {
  const kind = !h.multi ? h.pool : h.style === 'pool' ? h.pool : h.style;
  if (kind === 'contribute') return h.two ? 'Joint bills' : 'Joint account';
  if (kind === 'housekeeping') return h.people[h.payer].name + "'s account";
  if (kind === 'split') return 'Joint bills';
  return 'Joint account';
}

/** Invariants on calc's result r for settings c. Returns a list of problems (empty when all hold).
    - the figures reconcile, and nothing is NaN;
    - step ids are unique, amounts positive, shares to the penny;
    - doing the transfers in order never sends money an account hasn't got yet (unless that account ends short; a
      top-up never: in a household with shares since 2.12.1, in every household since 2.13);
    - after the transfers and everything going out, an account that passes what's left on ends at £0, and an account
      that keeps what's left (or is short because a top-up couldn't reach it) ends with what the app shows. */
export function invariants(P, c, r) {
  const bad = [];
  if (!r.ok) bad.push('does not reconcile: off by ' + r.diff);
  if (!isFinite(r.flt)) bad.push('left over is not a number');
  const ids = new Set(); r.steps.forEach(s => { if (ids.has(s.id)) bad.push('duplicate step id ' + s.id); ids.add(s.id);
    if (!(s.amt > 0) || !isFinite(s.amt)) bad.push('step with amount ' + s.amt + ' ' + s.id);
    if (s.kind === 'contribute' && Math.abs(Math.round(s.amt * 100) - s.amt * 100) > 1e-6) bad.push('share not to the penny ' + s.amt); });
  const shown = r.floats.concat(r.outside || []), at = {}; shown.forEach(f => at[f.id] = f);
  const bal = {}, short = {}; c.accounts.forEach(a => bal[a.id] = r.A[a.id] ? r.A[a.id].inn : 0);
  shown.forEach(f => { if (f.amt < -0.004) short[f.id] = true; });
  const rootOf = id => { let x = id, g = 0; while (r.par[x] && g++ < 50) x = r.par[x]; return x; };
  r.steps.forEach((s, i) => { if (s.kind === 'save') return; bal[s.from] -= s.amt; if (s.to) bal[s.to] += s.amt;
    const strict = s.kind === 'topup';
    if (bal[s.from] < -0.005 && (strict || (!short[rootOf(s.from)] && !short[s.from]))) bad.push(`step ${i + 1} (${s.id}) sends money ${s.from} hasn't got yet (${r2(bal[s.from])})`); });
  c.accounts.forEach(a => { const A = r.A[a.id]; if (!A) return; bal[a.id] -= A.out; });
  c.accounts.forEach(a => { if (!r.A[a.id]) return; const f = at[a.id];
    if (f) { if (!near(bal[a.id], f.amt)) bad.push(`${a.name} ends with ${r2(bal[a.id])} but shows ${r2(f.amt)} left`); }
    else if (!near(bal[a.id], 0)) bad.push(`${a.name} passes what's left on but ends with ${r2(bal[a.id])}`); });
  return bad;
}

/** Compare calc's result r for month m (with this month's pay payNow, a list by person; usual pay when left out) with
    the oracle for household spec h. opts: ones (the month's one-offs, as the spec has them), idOf (account name to id,
    when the household's accounts don't have setup's names: after a change of style they keep their own). Returns {bad, o}. */
export function compare(P, h, c, r, m, payNow, opts = {}) {
  const o = oracle(h, m, payNow, opts.ones || []), bad = [], idByName = opts.idOf ? (c, n) => opts.idOf(n) : idByNameIn;
  const pid = i => c.people[i].id;
  // What the household has left: everyone's but a boarder's (their own money, 2.12.1).
  if (!near(r.flt, o.hhLeft, 0.02)) bad.push(`left over ${r2(r.flt)} but expected ${r2(o.hhLeft)}`);
  // Shares and set amounts, by person and where they go.
  const got = {}; r.steps.filter(s => s.kind === 'contribute').forEach(s => { const k = s.person + '>' + s.to; got[k] = (got[k] || 0) + s.amt; });
  const want = {};
  o.contrib.forEach(x => { let to;
    if (x.to === 'shared') to = idByName(c, intendedAccount(h, { owner: 'shared' }, 'bills'));
    else if (x.to === 'main') to = idByName(c, mainName(h));
    else to = c.people[x.to].payAccount;
    if (x.amt < 0.005) return; const k = pid(x.who) + '>' + to; want[k] = (want[k] || 0) + x.amt; });
  // Two joint accounts: compare each person's total into the pair.
  const fold = o => { if (!(h.style === 'contribute' && h.two)) return o; const f = {}; const js = idByName(c, 'Joint spending'), jb = idByName(c, 'Joint bills');
    Object.keys(o).forEach(k => { const kk = k.replace('>' + js, '>' + jb); f[kk] = (f[kk] || 0) + o[k]; }); return f; };
  const G = fold(got), W = fold(want);
  new Set([...Object.keys(G), ...Object.keys(W)]).forEach(k => { if (!near(G[k] || 0, W[k] || 0, 0.02 * Math.max(1, h.people.length))) bad.push(`contribution ${k}: ${r2(G[k] || 0)} but expected ${r2(W[k] || 0)}`); });
  // What each person keeps (own accounts that keep what's left; a boarder's is apart from the household's).
  const shown = r.floats.concat(r.outside || []);
  Object.keys(o.keeps).forEach(k => { const i = Number(k), acc = c.people[i].payAccount, f = shown.find(x => x.id === acc);
    if (!f) { bad.push(`${h.people[i].name}'s account doesn't keep what's left`); return; }
    // 2.12's rounding puts leftover pennies on the first share: the same tolerance as for contributions.
    if (!near(f.amt, o.keeps[i], Math.max(0.03, 0.02 * h.people.length))) bad.push(`${h.people[i].name} keeps ${r2(f.amt)} but expected ${r2(o.keeps[i])}`);
    const apart = h.board[i] != null || !!(h.ticked && h.ticked[i]);
    if (apart !== !!(r.outside || []).find(x => x.id === acc)) bad.push(`${h.people[i].name}'s account ${apart ? 'is' : "isn't"} a boarder's but ${apart ? "isn't" : 'is'} kept apart`); });
  if (o.jointLeft != null) { const jl = r.floats.filter(f => !c.people.some(p => p.payAccount === f.id)).reduce((s, f) => s + f.amt, 0);
    if (!near(jl, o.jointLeft, 0.03)) bad.push(`joint accounts left ${r2(jl)} but expected ${r2(o.jointLeft)}`); }
  return { bad, o };
}

/** Differences between two results for the same month, step by step to the penny (ids, kinds, accounts, amounts, what's
    short), and what each account keeps. Empty when they're the same. Savings transfers in another order but otherwise
    the same come back as one entry starting "order only" (an item deleted from a later month is listed after the others
    in earlier months: allItems puts ended items last), so the caller can count that apart. */
export function sameResult(a, b) {
  const st = r => r.steps.map(s => [s.id, s.kind, s.from, s.to || s.toText, r2(s.amt), s.short ? r2(s.short) : 0].join(' '));
  const fl = r => r.floats.concat(r.outside || []).map(f => f.id + ' ' + r2(f.amt) + (f.short ? ' short' : '')).join(', ');
  const x = st(a), y = st(b), bad = [], sorted = l => l.slice().sort().join('|');
  if (x.join('|') !== y.join('|') && sorted(x) === sorted(y) && x.filter(s => !s.startsWith('s:')).join('|') === y.filter(s => !s.startsWith('s:')).join('|'))
    bad.push(`order only: savings transfers were ${x.filter(s => s.startsWith('s:')).map(s => s.split(' ')[0]).join(' ')}, now ${y.filter(s => s.startsWith('s:')).map(s => s.split(' ')[0]).join(' ')}`);
  else for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) { bad.push(`step ${i + 1} was "${x[i] || 'none'}", now "${y[i] || 'none'}"`); break; }
  if (fl(a) !== fl(b)) bad.push(`left over was ${fl(a)}, now ${fl(b)}`);
  if (r2(a.flt) !== r2(b.flt)) bad.push(`total left over was ${r2(a.flt)}, now ${r2(b.flt)}`);
  if (a.cant.map(s => s.id).join() !== b.cant.map(s => s.id).join()) bad.push('top-ups that can\'t be made differ');
  return bad;
}

/** The top-up rule (2.13, every household): a top-up sends only what its account has by then, and the rest is a named
    shortfall. Two checks: no top-up step sends money its account hasn't got yet, and, for households where nobody pays
    shares, each account keeps what chainOracle says. A list of problems. */
export function topUps(P, h, c, r, m, payNow, opts = {}) {
  const bad = [], bal = {}, idOf = opts.idOf || (n => idByNameIn(c, n));
  c.accounts.forEach(a => { bal[a.id] = r.A[a.id] ? r.A[a.id].inn : 0; });
  r.steps.forEach((s, i) => { if (s.kind === 'save') return; if (s.kind === 'topup' && bal[s.from] - s.amt < -0.005) bad.push(`top-up ${i + 1} (${s.id}) sends ${r2(s.amt)} but its account has ${r2(bal[s.from])}`);
    bal[s.from] -= s.amt; if (s.to) bal[s.to] += s.amt; });
  const want = chainOracle(h, m, payNow, opts.ones || []);
  if (want) {
    const got = {}; r.floats.concat(r.outside || []).forEach(f => { got[f.id] = f; });
    Object.keys(want).forEach(n => { const id = idOf(n), f = got[id]; if (!f || !near(f.amt, want[n].amt, 0.02) || !!f.short !== !!want[n].short) bad.push(`${n} keeps ${f ? r2(f.amt) + (f.short ? ' (short)' : '') : 'nothing'} but expected ${r2(want[n].amt)}${want[n].short ? ' (short)' : ''}`); });
    Object.keys(got).forEach(id => { if (!Object.keys(want).some(n => idOf(n) === id) && Math.abs(got[id].amt) > 0.004) bad.push(`${(c.accounts.find(a => a.id === id) || {}).name} keeps ${r2(got[id].amt)} but expected nothing`); });
  }
  return bad;
}

// ---------- The rough figure (2.14) ----------
// Checks from docs/onboarding.md 5.2, 5.7 and 7, against the oracle in gen.mjs (figureExtras: the rule, written from the
// document). invariants and compare above already cover every month of a figure household (the not-listed amount is in the
// oracle's costs), including "every month reconciles". These are the properties that need more than one working-out.

const mk = m => '2027-' + String(m).padStart(2, '0');
const payOf = (c, now) => { const pay = {}; c.people.forEach((p, i) => { pay[p.id] = now[i]; }); return pay; };
const nameOf = (c, id) => (c.accounts.find(a => a.id === id) || {}).name || id;

/** A result as the figures it shows, by account name (two settings built separately have different account ids): the steps
    (kind, from, to, person, amount, shortfall) in a fixed order, what each account keeps, and the total left over. */
export function byName(c, r) {
  const st = r.steps.map(s => [s.kind, nameOf(c, s.from), s.to ? nameOf(c, s.to) : s.toText, s.person || '', r2(s.amt), s.short ? r2(s.short) : 0].join(' ')).sort();
  const fl = r.floats.concat(r.outside || []).map(f => nameOf(c, f.id) + ' ' + r2(f.amt) + (f.short ? ' short' : '')).sort();
  return { steps: st, floats: fl, flt: r2(r.flt) };
}
export function sameByName(cA, rA, cB, rB) {
  const a = byName(cA, rA), b = byName(cB, rB), bad = [];
  if (a.steps.join('|') !== b.steps.join('|')) { const i = a.steps.findIndex((s, k) => s !== b.steps[k]); bad.push(`transfers differ: "${a.steps[i] || 'none'}" against "${b.steps[i] || 'none'}"`); }
  if (a.floats.join('|') !== b.floats.join('|')) bad.push(`left over by account differs: ${a.floats.join(', ')} against ${b.floats.join(', ')}`);
  if (a.flt !== b.flt) bad.push(`total left over ${a.flt} against ${b.flt}`);
  return bad;
}

/** The properties a figure household has. h has h.figures; c is its settings; cFull the settings of fullListed(h), built the
    same way (a different set of account ids); payFor(m) the month's pay by person. Returns {bad, ran, skipped}: what was
    worked out for each property, and what had nothing to work on (a property that can't run says so, never silently).
    - within: one more bill listed inside the figure. An every-month bill changes no month's transfers; a bill of 7 to 11
      months changes none of the months it comes in and lowers the months it skips by its amount (5.2); a bill of 6 months
      or fewer is always on top of the figure, so the months it doesn't come in are unchanged and the months it does cost
      its amount more;
    - over: an every-month bill that takes the listed bills past the figure raises that account's money out by exactly the
      overshoot (5.7);
    - full: with every bill listed and the figures ended from the first month (as "That's all of them" does), the figures
      equal the fully listed household's, by account name;
    and every month of each is checked against the oracle for the household with the bill added or the figure ended. */
export function figureProperties(P, h, c, cFull, payFor, seed) {
  const bad = [], ran = { within: 0, over: 0, full: 0 }, skipped = { within: 0, full: 0 }, clone = o => JSON.parse(JSON.stringify(o));
  const ex = figureExtras(h), base = [], idOf = n => (c.accounts.find(a => a.name === n) || {}).id;
  for (let m = 1; m <= 12; m++) base[m] = P.calc(c, m, payOf(c, payFor(m)), []);
  const add = (what, m, msgs) => msgs.forEach(x => bad.push(`${what}, month ${m}: ${x}`));
  ex.forEach((e, k) => {
    const acc = idOf(e.account); if (!acc) { bad.push(`no account ${e.account} for a figure`); return; }
    // within: the kind of bill rotates with the seed so every kind turns up across households.
    const variant = (seed + k) % 3, whole = ((seed >> 1) + k) % 2 === 0;
    if (variant < 2 && e.amount < 0.02) skipped.within++;
    else {
      const a = variant === 2 ? r2(20 + ((seed + k) % 9) * 15) : whole ? e.amount : r2(Math.floor(e.amount * 50) / 100);
      let months = [], spec = { freq: 'monthly' };
      if (variant === 1) { const out = Array.from({ length: 1 + ((seed + k) % 5) }, (_, i) => 1 + ((seed + k + i * 2) % 12)); months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter(m => !out.includes(m)); spec = { freq: 'some', picked: months }; }
      if (variant === 2) { months = [1 + ((seed + k) % 12)]; spec = { freq: 'yearly', month: months[0] }; }
      const hn = clone(h); hn.bills.push({ id: 'nx', name: 'Extra bill', amount: a, owner: e.owner, ...spec });
      const cn = clone(c); cn.bills.push({ id: 'nx', name: 'Extra bill', amount: a, account: acc, months: months.slice() });
      const what = `listing a ${variant === 0 ? 'monthly' : months.length + '-month'} bill of ${a} on ${e.account} (not listed yet ${e.amount})`;
      for (let m = 1; m <= 12; m++) {
        const now = payFor(m), r = P.calc(cn, m, payOf(cn, now), []), due = !months.length || months.includes(m), d = r.A[acc].out - base[m].A[acc].out;
        add(what, m, invariants(P, cn, r)); add(what, m, compare(P, hn, cn, r, m, now).bad);
        const want = variant === 0 ? 0 : variant === 1 ? (due ? 0 : -a) : (due ? a : 0);
        if (Math.abs(d - want) > 0.011) add(what, m, [`money out of ${e.account} changed by ${r2(d)}, expected ${r2(want)}`]);
        if (!want) add(what, m, sameResult(base[m], r).map(x => 'a transfer changed: ' + x));
        ran.within++;
      }
    }
    // over: a bill past the figure; the account's money out rises by exactly the overshoot.
    const over = r2(25 + ((seed * 3 + k) % 8) * 20), a = r2(e.amount + over), hn = clone(h); hn.bills.push({ id: 'nx', name: 'Extra bill', amount: a, owner: e.owner, freq: 'monthly' });
    const cn = clone(c); cn.bills.push({ id: 'nx', name: 'Extra bill', amount: a, account: acc, months: [] });
    for (let m = 1; m <= 12; m++) {
      const now = payFor(m), r = P.calc(cn, m, payOf(cn, now), []), what = `a bill of ${a} on ${e.account}, ${over} past the figure`, d = r.A[acc].out - base[m].A[acc].out;
      add(what, m, invariants(P, cn, r)); add(what, m, compare(P, hn, cn, r, m, now).bad);
      if (Math.abs(d - over) > 0.011) add(what, m, [`money out of ${e.account} rose by ${r2(d)}, not by the overshoot ${over}`]);
      ran.over++;
    }
  });
  // full: every bill listed, the figures ended from the first month.
  if (!ex.length) skipped.full++;
  else {
    const c3 = clone(c), have = new Set(c3.bills.map(b => b.id)), hf = fullListed(h), num = b => Number(String(b.id).replace(/^\D+/, ''));
    cFull.bills.forEach(b => { if (!have.has(b.id)) c3.bills.push({ ...clone(b), account: idOf(nameOf(cFull, b.account)) }); });
    c3.bills.sort((x, y) => num(x) - num(y));
    const ests = clone(c3.estimates || []); delete c3.estimates; ests.forEach(x => P.endItem(c3, 'estimates', x, mk(1)));
    for (let m = 1; m <= 12; m++) {
      const now = payFor(m), r = P.calcMonth(c3, {}, mk(m), payOf(c3, now)), rf = P.calc(cFull, m, payOf(cFull, now), []), what = 'every bill listed and the figure ended';
      add(what, m, invariants(P, c3, r)); add(what, m, compare(P, hf, c3, r, m, now).bad); add(what, m, sameByName(c3, r, cFull, rf).map(x => 'not the fully listed household: ' + x));
      ran.full++;
    }
  }
  return { bad, ran, skipped };
}

// ---------- Pay patterns (2.16) ----------
// From docs/payperiods.md 5.3 and section 11.2, not from calc.js: the pay each month plans on (gen.mjs planOracle), the
// extra payday under every money style (5.3.5), standing orders from each pay (5.3.6, E15) and when the Pay tab mentions
// them (E11). The app's functions are only called, never copied: each figure here is worked out on its own.

/** What the 2.16 core provides that these checks call. */
export const PATTERN_API = ['PAY_EVERY', 'validPattern', 'usualMonthly', 'hasPatterns', 'planPay', 'standingOrders', 'standingOrdersNotice', 'dayWord'];
/** The names in PATTERN_API that P doesn't have (all of them until 2.16's core lands). */
export const patternApiMissing = P => PATTERN_API.filter(n => P[n] === undefined);
export const patternApiNote = P => `Pay patterns: 2.16's core isn't in calc.js yet (missing ${patternApiMissing(P).join(', ')}), so households with a pattern were not run. This is a failure until it lands (SIM_PATTERNS=0 runs without them).`;

const cl = o => JSON.parse(JSON.stringify(o));
const num = v => (typeof v === 'number' && isFinite(v) ? v : Number(v) || 0);
/** Month k ("YYYY-MM") moved on by j months (j may be negative). */
export const shiftMk = (k, j) => { const [y, mo] = k.split('-').map(Number), t = y * 12 + (mo - 1) + j; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
/** Pennies, rounded up: 5.3.6's figure is the largest month ÷ N, rounded up to the penny. */
const upTo = (amt, n) => Math.ceil(Math.round(amt * 100) / n - 1e-9) / 100;

/** The pay planPay gives month m against the oracle, for every person, and payFor against planPay's used (5.3.3, E7):
    {bad, used (a list by person, the oracle's)}. stateAt(i, m): the person then, as planOracle takes it. */
export function planChecks(P, h, c, months, pm, stateAt, m) {
  const k = mk(m), bad = [], used = [], plan = P.planPay(c, months, k) || {}, pf = P.payFor(c, months, k);
  c.people.forEach((p, i) => {
    const w = planOracle(pm, stateAt, i, m), g = plan[p.id], s = stateAt(i, m), d = (pm[m] || [])[i] || {}, nm = h.people[i].name;
    const how = (s.every ? `every ${s.every} days, ` : 'monthly, ') + (d.pay == null ? 'untyped' : d.est ? 'saved by a tick' : 'typed') + (d.extra ? `, extra ${d.extra.amount}${d.extra.counted ? ' counted' : ''}` : '');
    used.push(w.used);
    if (!g) { bad.push(`planPay has nothing for ${nm} (${how})`); return; }
    ['arrived', 'setAside', 'used'].forEach(f => { if (!near(num(g[f]), w[f], 0.005)) bad.push(`${nm}'s ${f} is ${g[f]} but expected ${w[f]} (${how})`); });
    if (!!g.typed !== w.typed) bad.push(`${nm}'s typed is ${g.typed} but expected ${w.typed} (${how})`);
    if (s.every && (g.n !== PAY_N[s.every] || !near(num(g.each), s.each, 0.005))) bad.push(`${nm}'s n and each are ${g.n} and ${g.each}, expected ${PAY_N[s.every]} and ${s.each}`);
    if (s.every && d.pay == null && num(g.used) > r2(s.each * PAY_N[s.every]) + 0.005) bad.push(`${nm}'s untyped estimate ${g.used} is above each × N (${r2(s.each * PAY_N[s.every])})`);
    if (!near(num(pf[p.id]), num(g.used), 0.005)) bad.push(`payFor gives ${nm} ${pf[p.id]}, not planPay's used ${g.used}`);
  });
  return { bad, used };
}

/** E6: planPay with month m's pay and extras given as live (the Pay tab's boxes) instead of saved gives the same. Months
    saved by a tick are left out (their box holds an estimate, not typed pay). */
export function liveCheck(P, c, months, m) {
  const k = mk(m), d = months[k]; if (!d || d.payEstimated) return [];
  const rest = cl(months); delete rest[k].pay; delete rest[k].extra;
  const live = { pay: {}, extra: {} }; c.people.forEach(p => { live.pay[p.id] = d.pay && d.pay[p.id] != null ? d.pay[p.id] : null; });
  Object.keys(d.extra || {}).forEach(id => { live.extra[id] = { amount: d.extra[id].amount, counted: !!d.extra[id].counted }; });
  const a = JSON.stringify(P.planPay(c, months, k)), b = JSON.stringify(P.planPay(c, rest, k, live));
  return a === b ? [] : [`planPay with the month given as live (E6) differs: ${b} against ${a}`];
}

/** Standing orders (5.3.6, E15), worked out from the transfers of month k and the 11 after it (calcMonth, so through
    planPay): for each person on a pattern, each share, top-up or savings transfer out of their pay account when nobody
    else is paid into it, matched by step id; the figure is the largest of the 12 ÷ N, rounded up to the penny; every four
    weeks only when the amount isn't the same all 12 months (a month without it counts as £0). Moves of what's left never.
    {pid: {orders: {stepId: amount}, steps: whether the pay account has any share, top-up or savings transfer in the 12
    months, moveTo: where a move of what's left goes from the pay account in month k, or null}}. */
export function ordersOracle(P, c, months, k, cache) {
  if (cache && cache[k]) return cache[k];
  const res = Array.from({ length: 12 }, (_, j) => P.calcMonth(c, months, shiftMk(k, j))), out = {};
  c.people.forEach(p => { const pt = p.pattern; if (!pt) return;
    const alone = c.people.filter(q => q.payAccount === p.payAccount).length === 1, amts = {};
    res.forEach((r, j) => r.steps.forEach(s => { if (!['contribute', 'topup', 'save'].includes(s.kind) || s.from !== p.payAccount) return; (amts[s.id] ||= Array(12).fill(0))[j] += s.amt; }));
    const orders = {};
    if (alone) Object.keys(amts).forEach(id => { const a = amts[id], max = Math.max(...a), varies = a.some(v => Math.abs(v - a[0]) > 0.004);
      if (max < 0.005 || (pt.every === 28 && !varies)) return; orders[id] = upTo(max, PAY_N[pt.every]); });
    // Ruled: moveTo is about how the accounts are set up, not one month's figures. The pay account's only link is sending
    // what's left on (no share, top-up or savings transfer in the 12 months), whether or not a month has anything to move.
    const par = (c.accounts.find(a => a.id === p.payAccount) || {}).leftoverTo || null;
    out[p.id] = { orders, steps: Object.keys(amts).length > 0, moveTo: par };
  });
  if (cache) cache[k] = out;
  return out;
}
/** standingOrders(c, months, k) against ordersOracle: the same transfers and figures to the penny for everyone on a
    pattern, nothing for anyone paid monthly, and moveTo (the People line, 5.3.6) naming where their pay account moves
    what's left only when it has no share, top-up or savings transfer at all in the 12 months, and nothing otherwise. {bad, want}. */
export function ordersChecks(P, h, c, months, k, cache) {
  const bad = [], want = ordersOracle(P, c, months, k, cache), got = P.standingOrders(c, months, k) || {};
  c.people.forEach((p, i) => { const nm = h.people[i].name, g = got[p.id], w = want[p.id];
    const gm = {}; ((g && g.orders) || []).forEach(o => { gm[o.step] = o.amount; });
    if (!w) { if (Object.keys(gm).length) bad.push(`${nm} is paid monthly but has standing orders ${JSON.stringify(g.orders)}`); return; }
    new Set([...Object.keys(gm), ...Object.keys(w.orders)]).forEach(id => {
      if (!(id in w.orders)) bad.push(`${nm} has a standing order for ${id} (${gm[id]}) the design doesn't give (every ${p.pattern.every} days)`);
      else if (!(id in gm)) bad.push(`${nm} has no standing order for ${id}, expected ${w.orders[id]} (every ${p.pattern.every} days)`);
      else if (Math.abs(gm[id] - w.orders[id]) > 0.001) bad.push(`${nm}'s standing order for ${id} is ${gm[id]} but expected ${w.orders[id]} (every ${p.pattern.every} days)`); });
    const mt = !w.steps && w.moveTo ? w.moveTo : null;
    if (((g && g.moveTo) || null) !== mt) bad.push(`${nm}'s moveTo is ${g && g.moveTo}, expected ${mt}${w.steps ? ' (their pay account has standing-order transfers)' : ''}`);
  });
  return { bad, want };
}
/** E11, with the head of engineering's rulings: the Pay tab's standing-order notice shows in month k for someone on a
    pattern who has standing orders (no orders, no notice) when it's their first month on it (personAt at k − 1 had none, or
    another interval, or nothing before k is typed or ticked: hasHistory false), or when a figure for a transfer that has
    one in both months is higher than in k − 1 (a transfer new in k gives no notice: Settings › People lists it). */
export function noticeChecks(P, h, c, months, k, cache) {
  const bad = [], prev = shiftMk(k, -1), now = ordersOracle(P, c, months, k, cache), before = ordersOracle(P, c, months, prev, cache);
  c.people.forEach((p, i) => { if (!p.pattern) return;
    const was = P.personAt(c, p.id, prev), first = !(was && was.pattern) || was.pattern.every !== p.pattern.every || !P.hasHistory(months, k), old = (before[p.id] || { orders: {} }).orders;
    const up = Object.keys(now[p.id].orders).filter(id => id in old && now[p.id].orders[id] > old[id] + 0.004);
    const want = (first && Object.keys(now[p.id].orders).length > 0) || up.length > 0, got = !!P.standingOrdersNotice(c, months, k, p.id);
    if (got !== want) bad.push(`${h.people[i].name}'s standing-order notice in ${k} is ${got ? 'shown' : 'not shown'}, expected ${want ? 'shown' : 'not shown'} (${first ? 'first month on this pattern' : up.length ? 'a figure up' : 'nothing higher'})`); });
  return bad;
}

/** The extra payday under every money style (5.3.4, 5.3.5), on one person on a pattern in one month: their pay typed as
    N + 1 paydays, then the extra set aside (A), counted (B), not there with the pay less the extra (C), and not there
    with all of it (D). Set aside is as if it never arrived (A = C) and counted as if it were typed with it (B = D), to the
    penny. Then, on the account people pay into, with each rule in turn: set aside never moves a share; counted moves
    none under half each, in proportion to pay (the weight is a year's pay ÷ 12), set amounts or board; under "after own
    bills" and "so we each keep the same" theirs can only go up and the total stays the same; with a percentage of pay
    theirs goes up by exactly that percentage of the extra. Pooling: left over goes up by the extra. {bad, ran}. */
export function extraRules(P, h, c, months, seed) {
  const bad = [], ran = { rules: {}, moved: {} };
  const i = h.people.findIndex((p, j) => p.every && h.board[j] == null && !(h.ticked || {})[j]); if (i < 0) return { bad, ran: null };
  const s = h.people[i], N = PAY_N[s.every], pid = c.people[i].id, m = 1 + (seed % 12), k = mk(m), extra = s.each, arrived = r2(s.each * (N + 1));
  const variant = (pay, ex) => { const x = cl(months), d = x[k] = x[k] || {}; (d.pay ||= {})[pid] = pay;
    if (d.payEstimated) { delete d.payEstimated[pid]; if (!Object.keys(d.payEstimated).length) delete d.payEstimated; }
    if (d.extra) { delete d.extra[pid]; if (!Object.keys(d.extra).length) delete d.extra; } if (ex) (d.extra ||= {})[pid] = ex; return x; };
  const mA = variant(arrived, { amount: extra }), mB = variant(arrived, { amount: extra, counted: true }), mC = variant(r2(arrived - extra)), mD = variant(arrived);
  const fa = ['contribute', 'housekeeping'].includes(h.style) ? c.accounts.find(a => a.funding && (a.funding.people || []).includes(pid)) : null;
  const rules = [['own', x => x]];
  if (fa) {
    const setF = (x, f) => { x.accounts.find(a => a.id === fa.id).funding = f; return x; }, ppl = fa.funding.people;
    ['equal', 'pay', 'afterOwn', 'sameLeft'].forEach(r => rules.push([r, x => setF(x, { people: ppl.slice(), rule: r })]));
    rules.push(['set', x => setF(x, { people: ppl.slice(), rule: 'set', set: Object.fromEntries(ppl.map(q => [q, { amount: 300 }])) })]);
    rules.push(['pct', x => setF(x, { people: ppl.slice(), rule: 'equal', set: { [pid]: { pct: 20 } } })]);
  }
  const shares = r => { const o = {}; if (fa) r.steps.filter(x => x.kind === 'contribute' && x.to === fa.id).forEach(x => { o[x.person] = (o[x.person] || 0) + x.amt; }); return o; };
  const stays = fa && c.people[i].payAccount === fa.id, own = fa && fa.funding, ownMoves = own && (['afterOwn', 'sameLeft'].includes(own.rule) || (own.set && own.set[pid] && own.set[pid].pct != null));
  rules.forEach(([rule, mod]) => {
    const cv = P.normCfg(mod(cl(c))), [rA, rB, rC, rD] = [mA, mB, mC, mD].map(x => P.calcMonth(cv, x, k)), what = `${h.people[i].name}'s extra payday in ${k} (rule ${rule})`;
    ran.rules[rule] = (ran.rules[rule] || 0) + 1;
    sameResult(rC, rA).forEach(x => bad.push(`${what}: set aside isn't as if it never arrived: ${x}`));
    sameResult(rD, rB).forEach(x => bad.push(`${what}: counted isn't as if it were typed with the rest: ${x}`));
    if (!fa) { if (h.style === 'pool' && !near(rB.flt - rA.flt, extra, 0.011)) bad.push(`${what}: counting it raises left over by ${r2(rB.flt - rA.flt)}, not ${extra}`); return; }
    const a = shares(rA), b = shares(rB), ids = new Set([...Object.keys(a), ...Object.keys(b)]), tot = o => Object.values(o).reduce((t, v) => t + v, 0);
    if (Math.abs((b[pid] || 0) - (a[pid] || 0)) > 0.004) ran.moved[rule] = (ran.moved[rule] || 0) + 1;
    if (['equal', 'pay', 'set'].includes(rule) || (rule === 'own' && !ownMoves))
      ids.forEach(q => { if (Math.abs((b[q] || 0) - (a[q] || 0)) > 0.004) bad.push(`${what}: counting it moves ${q}'s share from ${r2(a[q] || 0)} to ${r2(b[q] || 0)}`); });
    if (['afterOwn', 'sameLeft'].includes(rule) && !stays) {
      // A bill payer's own share stays in their account (no transfer), so the total of the transfers is only fixed with a joint account.
      if (h.style === 'contribute' && Math.abs(tot(a) - tot(b)) > 0.02) bad.push(`${what}: counting it changes the total shared from ${r2(tot(a))} to ${r2(tot(b))}`);
      if ((b[pid] || 0) < (a[pid] || 0) - 0.01) bad.push(`${what}: counting it lowers their share from ${r2(a[pid] || 0)} to ${r2(b[pid] || 0)}`); }
    if (rule === 'pct' && !stays) { const want = r2(arrived * 0.2) - r2((arrived - extra) * 0.2);
      if (Math.abs(((b[pid] || 0) - (a[pid] || 0)) - want) > 0.011) bad.push(`${what}: 20% of pay goes from ${r2(a[pid] || 0)} to ${r2(b[pid] || 0)}, expected ${r2(want)} more`); }
  });
  return { bad, ran };
}

/** The pattern functions on their own (5.3.1, E9, E16, the backup rule, dayWord, personSnap), on small made-up settings. A
    list of problems. */
export function patternBasics(P) {
  const bad = [], say = (ok, what) => { if (!ok) bad.push(what); };
  const pe = P.PAY_EVERY || {};
  [7, 14, 28].forEach(e => say(pe[e] && pe[e].n === PAY_N[e] && pe[e].year === PAY_YEAR[e], `PAY_EVERY[${e}] is ${JSON.stringify(pe[e])}, expected n ${PAY_N[e]} and year ${PAY_YEAR[e]}`));
  say(Object.keys(pe).sort().join() === '14,28,7', 'PAY_EVERY has the keys ' + Object.keys(pe).join(', '));
  [[{ every: 7, each: 420 }, true], [{ every: 14, each: 0.01 }, true], [{ every: 28, each: 1000000 }, true], [{ every: 30, each: 420 }, false], [{ every: 7, each: 0 }, false],
    [{ every: 7, each: -5 }, false], [{ every: 7, each: 1000000.01 }, false], [{ every: 7, each: NaN }, false], [{ every: 7 }, false], [null, false]]
    .forEach(([p, ok]) => say(!!P.validPattern(p) === ok, `validPattern(${JSON.stringify(p)}) is ${!!P.validPattern(p)}, expected ${ok}`));
  [[{ usualPay: 2000 }, 2000], [{ usualPay: 1, pattern: { every: 7, each: 420 } }, 1820], [{ usualPay: 1, pattern: { every: 14, each: 1000 } }, 2166.67], [{ usualPay: 1, pattern: { every: 28, each: 1560 } }, 1690]]
    .forEach(([p, v]) => say(near(P.usualMonthly(p), v, 0.001), `usualMonthly(${JSON.stringify(p)}) is ${P.usualMonthly(p)}, expected ${v}`));
  const base = pt => ({ schema: 5, setupDone: true, people: [Object.assign({ id: 'p', name: 'Kit', payAccount: 'a', usualPay: 5 }, pt === undefined ? {} : { pattern: pt })],
    accounts: [{ id: 'a', name: 'Main', colour: 'blue', leftoverTo: null }], bills: [], income: [], budgets: [], savings: [], reminders: [], doneLog: [], payday: { day: 25, weekend: true } });
  { const rep = [], c = P.normCfg(base({ every: 7, each: 420.456 }), rep), p = c.people[0], m = P.normCfg(base());
    say(p.pattern && p.pattern.every === 7 && p.pattern.each === 420.46 && p.usualPay === r2(420.46 * 52 / 12), `normCfg gives ${JSON.stringify(p)} for 420.456 every 7 days (E9: each to pence, usualPay worked out from it)`);
    say(!rep.length, 'normCfg reports a sound pattern: ' + rep.join('; '));
    const kept = P.normCfg(base({ every: 14, each: 900, from: '2027-01-08' })).people[0].pattern;
    say(kept && kept.from === '2027-01-08', 'normCfg drops a key it doesn\'t know inside pattern (kept like E16\'s extra): ' + JSON.stringify(kept));
    say(P.hasPatterns(c) === true && P.hasPatterns(m) === false, 'hasPatterns is wrong one way or the other');
    say(P.backupVersionFor(c) === 6 && P.backupNeedsFor(c) === '2.16', `a backup with a pattern is version ${P.backupVersionFor(c)} needing ${P.backupNeedsFor(c)}, expected 6 needing 2.16`);
    say(P.backupVersionFor(m) === 5, 'a backup of one person paid monthly is version ' + P.backupVersionFor(m));
    say(/transfer day/i.test(P.dayWord(c)) && /^Transfer day/.test(P.dayWord(c, true)), `dayWord with a pattern is "${P.dayWord(c)}" / "${P.dayWord(c, true)}"`);
    say(/payday/i.test(P.dayWord(m)) && /^Payday/.test(P.dayWord(m, true)), `dayWord without one is "${P.dayWord(m)}" / "${P.dayWord(m, true)}"`);
    const snap = P.personSnap(p); say(snap.pattern && snap.pattern.every === 7 && snap.pattern.each === 420.46, 'personSnap leaves the pattern out: ' + JSON.stringify(snap));
    const w = P.normCfg(Object.assign(base(), { people: [{ id: 'p', name: 'Kit', payAccount: 'a', usualPay: 2000, was: [{ until: '2027-01', usualPay: 1820, pattern: { every: 7, each: 420 } }] }] }));
    say(P.backupVersionFor(w) === 6 && P.backupNeedsFor(w) === '2.16', `a backup with a pattern only in an earlier month is version ${P.backupVersionFor(w)} needing ${P.backupNeedsFor(w)}`); }
  [{ every: 7, each: -1 }, { every: 30, each: 420 }, { every: 7, each: 1000000.01 }, { every: 7, each: 'x' }].forEach(pt => { const rep = [], c = P.normCfg(base(pt), rep);
    say(!c.people[0].pattern && rep.some(t => /a pay pattern that couldn't be used/.test(t)), `normCfg with ${JSON.stringify(pt)} gives ${JSON.stringify(c.people[0])} and reports ${JSON.stringify(rep)}`); });
  { const sound = { '2027-01': { pay: { p: 1680 }, extra: { p: { amount: 420, counted: true, window: '2027-01-29' } } } }, rep = [], got = P.normMonths(cl(sound), rep)['2027-01'];
    say(JSON.stringify(got && got.extra) === JSON.stringify(sound['2027-01'].extra) && !rep.length, 'normMonths changes a sound extra, or one with a key it doesn\'t know (E16): ' + JSON.stringify(got));
    const rep2 = [], b = P.normMonths({ '2027-01': { pay: { p: 1680 }, extra: { p: { amount: -1 } } } }, rep2)['2027-01'];
    say(!(b && b.extra && b.extra.p) && rep2.some(t => /an extra payday that couldn't be read/.test(t)), 'normMonths keeps an extra of −£1, or doesn\'t say so: ' + JSON.stringify(b) + ' ' + JSON.stringify(rep2)); }
  return bad;
}

// ---------- Counting paydays (2.17, layer 2) ----------
// From docs/payperiods.md 13.2 (L1–L19), not from calc.js. sim/paydays.mjs runs the households; these are the pieces it
// shares: what the core must provide, and the data and backup rules on small made-up settings (L4, L13, L14).

/** What the 2.17 core provides that sim/paydays.mjs calls: the names in 13.2 and the core's API note (L5's refreeze, L6's offer
    and lock), and 2.16.1's holiday functions, which layer 2 reuses. */
export const PAYDAY_API = ['transferWindow', 'paydaysIn', 'paydaysFor', 'freezePaydays', 'patternStartMonth', 'intervalChangedMonths', 'refreezeInterval', 'useExtraOffer', 'extraLock',
  'workingDayOnOrBefore', 'bankHolidaysEW', 'isBankHolidayEW'];
/** The names in PAYDAY_API that P doesn't have (all of 2.17's until its core lands). */
export const paydayApiMissing = P => PAYDAY_API.filter(n => P[n] === undefined);
export const paydayApiNote = P => `Counting paydays (2.17): the core isn't in calc.js yet (missing ${paydayApiMissing(P).join(', ')}), so the dated households were not run. This is a failure until it lands.`;

/** L4, L13 and L14 on small made-up settings: pattern.on and since kept, a bad one dropped on its own with its report (and
    since without on), dates stripped from was entries; months' paydays (whole numbers 0–6), extra's edited (only true)
    and a one-off's extraFrom/extraOf (as a pair); backups version 6 needing 2.17 with a date or a one-off used later;
    personSnap and dated edits ignore the dates; personWas gives an earlier entry with the same interval the current on,
    never since. A list of problems. */
export function paydayBasics(P) {
  const bad = [], say = (ok, what) => { if (!ok) bad.push(what); };
  const base = pt => ({ schema: 5, setupDone: true, people: [Object.assign({ id: 'p', name: 'Kit', payAccount: 'a', usualPay: 1820 }, pt === undefined ? {} : { pattern: pt })],
    accounts: [{ id: 'a', name: 'Main', colour: 'blue', leftoverTo: null }], bills: [], income: [], budgets: [], savings: [], reminders: [], doneLog: [], payday: { day: 25, weekend: true } });
  { const rep = [], c = P.normCfg(base({ every: 7, each: 420, on: '2027-03-05', since: '2027-01-15' }), rep), t = c.people[0].pattern;
    say(t && t.on === '2027-03-05' && t.since === '2027-01-15' && !rep.length, `normCfg changes a sound on and since (L13): ${JSON.stringify(t)} ${JSON.stringify(rep)}`);
    say(P.backupVersionFor(c, {}) === 6 && P.backupNeedsFor(c, {}) === '2.17', `a backup with a payday date is version ${P.backupVersionFor(c, {})} needing ${P.backupNeedsFor(c, {})}, expected 6 needing 2.17 (L14)`);
    say(P.backupNeedsFor(c) === '2.17', `backupNeedsFor without the months gives ${P.backupNeedsFor(c)} for a payday date, expected 2.17 (L14)`); }
  [['2027-02-30', 'not a real date'], ['1999-12-31', 'before 2000'], ['2100-01-01', 'after 2099'], ['5 March', 'not YYYY-MM-DD'], [20270305, 'a number']].forEach(([on, why]) => {
    const rep = [], t = P.normCfg(base({ every: 7, each: 420, on }), rep).people[0].pattern;
    say(t && t.every === 7 && t.each === 420 && t.on === undefined && rep.some(x => /a payday date that couldn't be used/.test(x)), `normCfg with on ${JSON.stringify(on)} (${why}) gives ${JSON.stringify(t)} and reports ${JSON.stringify(rep)}; expected the pattern without on, and "a payday date that couldn't be used" (L13)`); });
  { const rep = [], t = P.normCfg(base({ every: 14, each: 900, since: '2027-01-15' }), rep).people[0].pattern;
    say(t && t.since === undefined && t.every === 14 && rep.some(x => /a payday date that couldn't be used/.test(x)), `normCfg keeps since without on, or doesn't say so (L13): ${JSON.stringify(t)} ${JSON.stringify(rep)}`); }
  { const rep = [], t = P.normCfg(base({ every: 14, each: 900, on: '2027-01-08', since: '2027-02-31' }), rep).people[0].pattern;
    say(t && t.on === '2027-01-08' && t.since === undefined && rep.some(x => /a payday date that couldn't be used/.test(x)), `normCfg with a bad since doesn't drop it on its own (L13): ${JSON.stringify(t)} ${JSON.stringify(rep)}`); }
  { const c = P.normCfg(Object.assign(base({ every: 7, each: 420, on: '2027-03-05' }), {})); c.people[0].was = [{ until: '2027-01', usualPay: 1820, pattern: { every: 7, each: 400, on: '2026-01-02', since: '2026-01-02' } }];
    const w = P.normCfg(c).people[0].was; say(w && w[0] && w[0].pattern && w[0].pattern.on === undefined && w[0].pattern.since === undefined && w[0].pattern.each === 400, `normCfg keeps a date in a was entry (L13 strips it): ${JSON.stringify(w)}`); }
  { const p = P.normCfg(base({ every: 7, each: 420, on: '2027-03-05', since: '2027-01-15' })).people[0], snap = P.personSnap(p);
    say(snap.pattern && snap.pattern.on === undefined && snap.pattern.since === undefined, `personSnap keeps the dates (L4 compares {every, each} only): ${JSON.stringify(snap)}`);
    const q = JSON.parse(JSON.stringify(p)); q.pattern.on = '2027-03-12'; delete q.pattern.since; P.datePersonEdit(q, snap, '2027-06');
    say(q.was === undefined, `a date changed through datePersonEdit makes an earlier pay (L4: dates aren't changes of pay): ${JSON.stringify(q.was)}`);
    const r = JSON.parse(JSON.stringify(p)); r.pattern.each = 450; r.usualPay = 1950; P.datePersonEdit(r, snap, '2027-06');
    say(Array.isArray(r.was) && r.was.length === 1 && r.was[0].pattern && r.was[0].pattern.on === undefined && r.was[0].pattern.since === undefined, `a dated each edit stores ${JSON.stringify(r.was)}; expected one entry with {every, each} only (L4)`);
    say(r.pattern.on === '2027-03-05' && r.pattern.since === '2027-01-15', `a dated each edit loses the dates (L4 keeps them): ${JSON.stringify(r.pattern)}`);
    const c = P.normCfg(base()); c.people = [r]; const at = P.personAt(c, 'p', '2027-05').pattern;
    say(at && at.each === 420 && at.on === '2027-03-05' && at.since === undefined, `personAt in an earlier month with the same interval gives ${JSON.stringify(at)}; expected each 420 with the current on and no since (L4)`);
    const s = JSON.parse(JSON.stringify(p)); s.pattern = { every: 14, each: 840 }; s.usualPay = 1820; P.datePersonEdit(s, snap, '2027-06'); c.people = [s];
    const at2 = P.personAt(c, 'p', '2027-05').pattern; say(at2 && at2.every === 7 && at2.on === undefined, `personAt in an earlier month with another interval gives ${JSON.stringify(at2)}; expected every 7 and no date (L4)`); }
  { const sound = { '2027-01': { pay: { p: 2100 }, paydays: { p: 5 }, extra: { p: { amount: 420, edited: true } }, oneOffs: [{ id: 'o', kind: 'in', name: "Kit's extra payday from December", amount: 420, account: 'a', extraFrom: '2026-12', extraOf: 'p' }] } };
    const rep = [], got = P.normMonths(JSON.parse(JSON.stringify(sound)), rep);
    say(JSON.stringify(got) === JSON.stringify(sound) && !rep.length, `normMonths changes a sound layer-2 month (L13): ${JSON.stringify(got)} ${JSON.stringify(rep)}`);
    [[{ p: 7 }, 'seven'], [{ p: 2.5 }, 'not whole'], [{ p: -1 }, 'below 0'], [{ p: '3' }, 'a string']].forEach(([pd, why]) => { const rep2 = [], g = P.normMonths({ '2027-01': { pay: { p: 2100 }, paydays: Object.assign({ q: 4 }, pd) } }, rep2)['2027-01'];
      say(g && g.paydays && g.paydays.q === 4 && g.paydays.p === undefined && rep2.some(x => /a payday count that couldn't be read/.test(x)), `normMonths with a count ${JSON.stringify(pd)} (${why}) gives ${JSON.stringify(g)} and reports ${JSON.stringify(rep2)} (L13)`); });
    [{}, [], 'x', 3].forEach(pd => { const g = P.normMonths({ '2027-01': { pay: { p: 2100 }, paydays: pd } }, [])['2027-01'];
      say(g && g.paydays === undefined, `normMonths keeps paydays ${JSON.stringify(pd)} (L13 deletes an empty or non-object one): ${JSON.stringify(g)}`); });
    { const g = P.normMonths({ '2027-01': { pay: { p: 2100 }, extra: { p: { amount: 0, edited: 'yes' } } } }, [])['2027-01'];
      say(g && g.extra && g.extra.p && g.extra.p.amount === 0 && g.extra.p.edited === undefined, `normMonths keeps edited that isn't true (L13): ${JSON.stringify(g)}`); }
    [[{ extraFrom: '2026-13', extraOf: 'p' }, 'a bad month'], [{ extraFrom: '2026-12' }, 'no extraOf'], [{ extraOf: 'p' }, 'no extraFrom'], [{ extraFrom: '2026-12', extraOf: 5 }, 'extraOf not a string']].forEach(([o, why]) => {
      const rep3 = [], g = P.normMonths({ '2027-01': { oneOffs: [Object.assign({ id: 'o', kind: 'in', name: 'Extra', amount: 420, account: 'a' }, o)] } }, rep3)['2027-01'], x = g && g.oneOffs && g.oneOffs[0];
      say(x && x.amount === 420 && x.extraFrom === undefined && x.extraOf === undefined && rep3.some(t => /an extra payday used later that couldn't be read/.test(t)), `normMonths with a one-off ${JSON.stringify(o)} (${why}) gives ${JSON.stringify(x)} and reports ${JSON.stringify(rep3)}; expected the one-off without either, and the report (L13)`); });
    const c = P.normCfg(base({ every: 7, each: 420 }));
    say(P.backupVersionFor(c, sound) === 6 && P.backupNeedsFor(c, sound) === '2.17', `a backup with no date but a one-off used later is version ${P.backupVersionFor(c, sound)} needing ${P.backupNeedsFor(c, sound)}, expected 6 needing 2.17 (L14)`);
    say(P.backupNeedsFor(c, { '2027-01': { pay: { p: 2100 }, paydays: { p: 5 }, extra: { p: { amount: 420 } } } }) === '2.16', `a backup with no date and only counts and amounts needs ${P.backupNeedsFor(c, { '2027-01': { pay: { p: 2100 }, paydays: { p: 5 } } })}, expected 2.16 (L14: they need nothing more)`);
    const m = P.normCfg(base()); say(P.backupVersionFor(m, sound) === 6 && P.backupNeedsFor(m, sound) === '2.17', `a monthly household's backup with a one-off used later is version ${P.backupVersionFor(m, sound)} needing ${P.backupNeedsFor(m, sound)}, expected 6 needing 2.17 (L14)`); }
  return bad;
}
