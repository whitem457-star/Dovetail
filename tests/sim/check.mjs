// The household simulation's checks: invariants that hold for any household, and a comparison with the oracle in gen.mjs.
import { oracle, r2, intendedAccount, chainOracle } from './gen.mjs';

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
    if (!near(f.amt, o.keeps[i], 0.03)) bad.push(`${h.people[i].name} keeps ${r2(f.amt)} but expected ${r2(o.keeps[i])}`);
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
