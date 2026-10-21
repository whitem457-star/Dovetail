// The household simulation, calculation part: made-up households built by setup's own function (calc.js setupSettings,
// from the answers a person would give its screens, every item in the account it's meant for), worked out for all twelve
// months with calc, and checked against the invariants and the oracle. Exits 1 on any problem.
// node sim/logic.mjs [households=5000] [first seed=1]
import { P } from '../unit/load.mjs';
import { makeHousehold, shapeOf, intendedAccount, incomeName, answersOf, money } from './gen.mjs';
import { invariants, compare, topUps } from './check.mjs';

// The day setup finishes (sim/ui.mjs's): it only decides the month savings transfers start (since).
const TODAY = '2026-10-21';

/** Setup's state for household spec h once it has been typed in, as the screens leave it (sim/ui.mjs types the same
    answers): gen.mjs's answers, the accounts setup fills in from them (setupShape with setup's own options, as ui.js
    applyShape does), and every bill, budget, savings transfer and other income in the account it's meant for. Rows carry
    the spec's ids (gen.mjs's withIds), or b0, g0, s0, i0 by position, so the history checks can find them. */
export function setupStateFor(h) {
  const s = answersOf(h), kind = shapeOf(h), sh = P.setupShape(kind, P.setupPeople(s), P.setupOpts(s));
  s.shape = kind; s.accounts = sh.accounts; s.people.forEach(p => { p.payAccount = sh.payAccount[p.id]; });
  const at = n => { const a = s.accounts.find(x => x.name === n); if (!a) throw new Error('no account ' + n + ' in ' + s.accounts.map(x => x.name)); return a.id; };
  s.income.forEach(r => { r.account = at(incomeName(h)); });
  h.bills.forEach((b, i) => { const a = at(intendedAccount(h, b, 'bills'));
    (s.bills[a] ||= []).push({ id: b.id || 'b' + i, name: b.name, amount: money(b.amount), freq: b.freq, month: b.freq === 'yearly' ? String(b.month) : '', picked: b.freq === 'some' ? b.picked.slice() : [] }); });
  [['budgets', 'g'], ['savings', 's']].forEach(([l, k]) => h[l].forEach((x, i) => s[l].push({ id: x.id || k + i, name: x.name, amount: money(x.amount), account: at(intendedAccount(h, x, l)), picked: true })));
  return s;
}

/** Settings for household spec h, made by setup's own function (calc.js setupSettings) from setupStateFor(h). Spending
    money gets ids too (f0, f1… by person), and anyone ticked later as paying board (h.ticked, Settings › People) is. */
export function buildCfg(h) {
  const c = P.setupSettings(setupStateFor(h), null, { schema: 5, version: 'sim', today: TODAY }).cfg;
  c.budgets.forEach(b => { const i = h.people.findIndex(p => b.name === p.name + "'s spending money"); if (i >= 0) b.id = 'f' + i; });
  if (h.ticked) Object.keys(h.ticked).forEach(i => { c.people[i].boarder = true; });
  return P.normCfg(c);
}
export const styleKey = h => h.multi ? h.style + (h.style === 'pool' ? ':' + h.pool : '') + (h.rule ? ':' + h.rule : '') + (h.two ? ':two' : '') : 'single:' + h.pool;

/** Work out every month of each household and collect the problems: {households, months, fails: {kind: [seed@month]}}. */
export function run(specs) {
  const fails = {}; let months = 0;
  const add = (h, m, msg) => { const k = styleKey(h) + ' | ' + msg.replace(/[-\d.,£]+/g, '#').replace(/\b(p\d|a[0-9a-z]{6,})\b/g, '·'); (fails[k] ||= []).push(h.seed + '@' + m + ': ' + msg); };
  specs.forEach(h => {
    let c; try { c = buildCfg(h); } catch (e) { add(h, 0, 'build: ' + e.message); return; }
    // Half the households have this month's pay a little different from usual pay (a pay rise, fewer hours), on
    // alternate months: shares "in proportion to pay" still go by usual pay; everything else by this month's.
    const vary = h.seed % 2 === 1;
    for (let m = 1; m <= 12; m++) {
      const now = h.people.map((p, i) => vary && m % 2 === 0 && p.pay > 0 ? Math.round(p.pay * (0.85 + ((h.seed * 7 + i * 13 + m) % 31) / 100) * 100) / 100 : p.pay);
      const pay = {}; c.people.forEach((p, i) => pay[p.id] = now[i]);
      const r = P.calc(c, m, pay, []); months++;
      invariants(P, c, r).forEach(x => add(h, m, 'invariant: ' + x)); compare(P, h, c, r, m, now).bad.forEach(x => add(h, m, 'oracle: ' + x));
      topUps(P, h, c, r, m, now).forEach(x => add(h, m, 'top-ups: ' + x));
    }
  });
  return { households: specs.length, months, fails };
}
export function report(title, res) {
  const fk = Object.keys(res.fails);
  console.log(`${title}: ${res.households} households, ${res.months} months worked out, ${fk.length ? fk.length + ' kinds of problem' : 'no problems'}`);
  fk.sort((a, b) => res.fails[b].length - res.fails[a].length).forEach(k => console.log(`- [${new Set(res.fails[k].map(x => x.split('@')[0])).size} households] ${k}\n    e.g. seed ${res.fails[k][0]}`));
  if (fk.length) process.exitCode = 1;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const N = Number(process.argv[2] || 5000), S = Number(process.argv[3] || 1), specs = [];
  for (let s = S; s < S + N; s++) specs.push(makeHousehold(s));
  const tally = {}; specs.forEach(h => tally[styleKey(h)] = (tally[styleKey(h)] || 0) + 1);
  report('Random households', run(specs));
  console.log('Styles: ' + Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
}
