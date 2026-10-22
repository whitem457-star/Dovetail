// The household simulation, calculation part: made-up households built by setup's own function (calc.js setupSettings,
// from the answers a person would give its screens, every item in the account it's meant for), worked out for all twelve
// months with calc, and checked against the invariants and the oracle. Exits 1 on any problem.
// node sim/logic.mjs [households=5000] [first seed=1]
import { P } from '../unit/load.mjs';
import { makeHousehold, shapeOf, intendedAccount, incomeName, answersOf, money, withFigures, fullListed, figureExtras, billsOut, applies, billMonths, r2,
  NAMES, hasPattern, monthlyOf, topsUpBills, payMonthsFor, monthsObj, oneOffsFor, oneOffAccount, patternsOn, patternNote } from './gen.mjs';
import { invariants, compare, topUps, figureProperties, idByName, patternApiMissing, patternApiNote, patternBasics, planChecks, liveCheck, ordersChecks, noticeChecks, extraRules } from './check.mjs';

// 2.14, the rough figure: households with a figure for an account's bills (gen.mjs withFigures) are worked out too when
// SIM_FIGURES=1 (SIM_FIGURES=0 switches them off). They need calc.js to know cfg.estimates, so they're off until it does:
// change FIGURES_DEFAULT to true then, and a run without them says so rather than leaving them out silently.
const FIGURES_DEFAULT = true;
export const figuresOn = () => process.env.SIM_FIGURES ? process.env.SIM_FIGURES !== '0' : FIGURES_DEFAULT;
export const figureNote = 'Households with a rough figure: not run (SIM_FIGURES=1 switches them on; calc.js needs cfg.estimates)';
/** n households with a figure, from seeds first… (the same households as makeHousehold(seed), with figures; "listed" ones left out). */
export function figureSpecs(n, first = 1) { const out = []; for (let s = first; out.length < n && s < first + 10 * n; s++) { const h = withFigures(makeHousehold(s), s, s % 3 === 0 ? 'anchor' : 'figure'); if (h.figures) out.push(h); } return out; }

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
  // 2.16: a household with a pay pattern needs setupSettings to take s.people[i].every; before 2.16's core, say so plainly.
  if (hasPattern(h) && patternApiMissing(P).length) throw new Error('needs 2.16 (pay patterns): ' + patternApiMissing(P).join(', ') + ' missing from calc.js');
  const c = P.setupSettings(setupStateFor(h), null, { schema: 5, version: 'sim', today: TODAY }).cfg;
  c.budgets.forEach(b => { const i = h.people.findIndex(p => b.name === p.name + "'s spending money"); if (i >= 0) b.id = 'f' + i; });
  // 2.14: the figures, as cfg.estimates [{id, account, amount}] (setup's own function doesn't make them yet).
  if (h.figures && h.figures.length) c.estimates = h.figures.map(f => ({ id: f.id, account: idByName(c, intendedAccount(h, { owner: f.owner }, 'bills')), amount: f.amount }));
  if (h.ticked) Object.keys(h.ticked).forEach(i => { c.people[i].boarder = true; });
  return P.normCfg(c);
}
export const styleKey = h => (h.multi ? h.style + (h.style === 'pool' ? ':' + h.pool : '') + (h.rule ? ':' + h.rule : '') + (h.two ? ':two' : '') : 'single:' + h.pool) + (h.figureKind && h.figureKind !== 'listed' ? ' +' + h.figureKind : '');

/** Work out every month of each household and collect the problems: {households, months, fails: {kind: [seed@month]}}. */
export function run(specs) {
  const fails = {}, figures = []; let months = 0;
  const add = (h, m, msg) => { const k = styleKey(h) + ' | ' + msg.replace(NAME_RE, 'Someone').replace(/[-\d.,£]+/g, '#').replace(/\b(p\d|a[0-9a-z]{6,})\b/g, '·'); (fails[k] ||= []).push(h.seed + '@' + m + ': ' + msg); };
  const pat = { households: 0, every: { 7: 0, 14: 0, 28: 0 }, months: 0, extras: { aside: 0, counted: 0, untyped: 0 }, orders: 0, notices: 0, rules: {}, moved: {}, notRun: 0 };
  const api = patternApiMissing(P).length === 0;
  specs.forEach(h => {
    if (hasPattern(h) && !api) { pat.notRun++; return; }
    let c; try { c = buildCfg(h); } catch (e) { add(h, 0, 'build: ' + e.message); return; }
    layoutChecks(h, c).forEach(x => add(h, 0, 'settings: ' + x));
    if (hasPattern(h)) { try { patternRun(h, c, add, pat); } catch (e) { add(h, 0, 'pattern checks threw: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); } months += 12; return; }
    // A household with figures: the settings must keep them (a backup would otherwise lose them), and they're measured.
    const fig = h.figures && h.figures.length ? { h, c, short: 0, shortFull: 0, months: 0 } : null;
    if (h.figures && h.figures.length && !(Array.isArray(c.estimates) && c.estimates.length === h.figures.length)) { add(h, 0, 'build: normCfg dropped cfg.estimates (calc does not know the figures yet)'); return; }
    // Half the households have this month's pay a little different from usual pay (a pay rise, fewer hours), on
    // alternate months: shares "in proportion to pay" still go by usual pay; everything else by this month's.
    const vary = h.seed % 2 === 1;
    for (let m = 1; m <= 12; m++) {
      const now = h.people.map((p, i) => vary && m % 2 === 0 && p.pay > 0 ? Math.round(p.pay * (0.85 + ((h.seed * 7 + i * 13 + m) % 31) / 100) * 100) / 100 : p.pay);
      const pay = {}; c.people.forEach((p, i) => pay[p.id] = now[i]);
      const r = P.calc(c, m, pay, []); months++;
      invariants(P, c, r).forEach(x => add(h, m, 'invariant: ' + x)); compare(P, h, c, r, m, now).bad.forEach(x => add(h, m, 'oracle: ' + x));
      topUps(P, h, c, r, m, now).forEach(x => add(h, m, 'top-ups: ' + x));
      if (fig) { fig.months++; if (isShort(r)) fig.short++; }
    }
    if (h.figureKind && h.figureKind !== 'listed') { // 2.14: the properties that need more than one working-out
      try { const cFull = buildCfg(fullListed(h)), payFor = m => h.people.map((p, i) => vary && m % 2 === 0 && p.pay > 0 ? Math.round(p.pay * (0.85 + ((h.seed * 7 + i * 13 + m) % 31) / 100) * 100) / 100 : p.pay);
        if (fig) for (let m = 1; m <= 12; m++) { const pay = {}; cFull.people.forEach((p, i) => { pay[p.id] = payFor(m)[i]; }); if (isShort(P.calc(cFull, m, pay, []))) fig.shortFull++; }
        const fp = figureProperties(P, h, c, cFull, payFor, h.seed); fp.bad.forEach(x => add(h, 0, 'figure: ' + x)); if (fig) { fig.ran = fp.ran; fig.skipped = fp.skipped; }
      } catch (e) { add(h, 0, 'figure checks threw: ' + (e.stack || e.message).split('\n').slice(0, 2).join(' ')); }
    }
    if (fig) figures.push(fig);
  });
  return { households: specs.length, months, fails, figures, patterns: pat };
}

const mk = m => '2027-' + String(m).padStart(2, '0');
/** People's names, so problems group by kind rather than by who had them. */
const NAME_RE = new RegExp('\\b(' + NAMES.join('|') + ')\\b', 'g');
/** 2.16: what setup saved for spec h: each pattern as typed (with usualPay worked out from it, E9) and none for anyone paid
    monthly; one person's "pay account, bills, spending" as E17 says (Bills topped up from the pay account when they have a
    pattern, Pay → Bills → Spending otherwise). A list of problems. */
function layoutChecks(h, c) {
  const bad = [];
  h.people.forEach((p, i) => { const q = c.people[i], want = p.every ? { every: p.every, each: p.each } : undefined;
    if (JSON.stringify(q.pattern) !== JSON.stringify(want)) bad.push(`${p.name}'s pattern saved as ${JSON.stringify(q.pattern)}, typed ${JSON.stringify(want)}`);
    else if (p.every && q.usualPay !== monthlyOf(p)) bad.push(`${p.name}'s usual pay is ${q.usualPay}, expected ${monthlyOf(p)} from ${p.each} every ${p.every} days`); });
  if (!h.multi && h.pool === 'split') { const id = n => idByName(c, n), up = n => (c.accounts.find(a => a.id === id(n)) || {}).leftoverTo || null;
    const want = topsUpBills(h) ? [['Bills account', 'Pay account'], ['Pay account', 'Spending account']] : [['Pay account', 'Bills account'], ['Bills account', 'Spending account']];
    want.concat([['Spending account', null]]).forEach(([a, b]) => { if (up(a) !== (b && id(b))) bad.push(`E17: ${a} sends what's left to ${(c.accounts.find(x => x.id === up(a)) || {}).name || 'nowhere'}, expected ${b || 'nowhere'}${topsUpBills(h) ? ' (one person with a pattern)' : ''}`); }); }
  return bad;
}
/** 2.16: a household with a pay pattern, worked out through its saved months (gen.mjs payMonthsFor: typed, untyped and
    ticked months, extra paydays set aside, counted or left in, and one-offs): every month's pay against the oracle
    (planChecks, liveCheck), its transfers against the invariants, the oracle with the pay used and the top-up rule;
    standing orders in two months and the Pay tab's notice in another; and the extra payday under every rule (extraRules). */
function patternRun(h, c, add, st) {
  const pm = payMonthsFor(h, h.seed), spec = oneOffsFor(h, h.seed), sep = o => o.owner === 'shared' && h.style === 'separate' ? { ...o, owner: 0 } : o, ones = {};
  Object.keys(spec).forEach(m => { ones[m] = spec[m].map(o => ({ id: o.id, kind: o.kind, name: o.name, amount: o.amount, account: idByName(c, oneOffAccount(h, sep(o))) })); });
  const months = monthsObj(c, pm, ones), stateAt = i => h.people[i];
  st.households++; h.people.forEach(p => { if (p.every) st.every[p.every]++; });
  for (let m = 1; m <= 12; m++) {
    pm[m].forEach((d, i) => { if (d.extra && h.people[i].every) st.extras[d.pay == null || d.est ? 'untyped' : d.extra.counted ? 'counted' : 'aside']++; });
    const pc = planChecks(P, h, c, months, pm, stateAt, m); pc.bad.forEach(x => add(h, m, 'pay: ' + x));
    liveCheck(P, c, months, m).forEach(x => add(h, m, 'pay: ' + x));
    const r = P.calcMonth(c, months, mk(m)), o = (spec[m] || []).map(sep);
    invariants(P, c, r).forEach(x => add(h, m, 'invariant: ' + x)); compare(P, h, c, r, m, pc.used, { ones: o }).bad.forEach(x => add(h, m, 'oracle: ' + x));
    topUps(P, h, c, r, m, pc.used, { ones: o }).forEach(x => add(h, m, 'top-ups: ' + x)); st.months++;
  }
  // Standing orders in two months running (the second is the month the notice is checked in, so the figures are worked out once).
  const k = mk(2 + h.seed % 11), cache = {};
  [mk(1 + h.seed % 11), k].forEach(x => { ordersChecks(P, h, c, months, x, cache).bad.forEach(y => add(h, 0, 'standing orders: ' + y)); st.orders++; });
  noticeChecks(P, h, c, months, k, cache).forEach(x => add(h, 0, 'notice: ' + x)); st.notices++;
  const er = extraRules(P, h, c, months, h.seed); er.bad.forEach(x => add(h, 0, 'extra payday: ' + x));
  if (er.ran) { Object.keys(er.ran.rules).forEach(k => { st.rules[k] = (st.rules[k] || 0) + er.ran.rules[k]; }); Object.keys(er.ran.moved).forEach(k => { st.moved[k] = (st.moved[k] || 0) + er.ran.moved[k]; }); }
}
/** The pattern line of a report, and the failure when 2.16's core isn't there. */
export function patternSummary(res) {
  const p = res.patterns; if (!p) return '';
  if (p.notRun) return patternApiNote(P) + ` (${p.notRun} households)`;
  if (!p.households) return '';
  const kv = o => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ');
  return `  pay patterns: ${p.households} households (people every 7 days ${p.every[7]}, 14 days ${p.every[14]}, 28 days ${p.every[28]}), ${p.months} months through planPay; extra paydays: ${p.extras.aside} set aside, ${p.extras.counted} counted, ${p.extras.untyped} on months not typed (E7); standing orders checked in ${p.orders} months, the notice in ${p.notices}; the extra payday under each rule: ${kv(p.rules)} (their share moved when counted: ${kv(p.moved) || 'never'})`;
}
/** Whether a month's result has an account short (or a top-up that couldn't all be made). */
const isShort = r => r.floats.concat(r.outside || []).some(f => f.amt < -0.004 || f.short) || (r.cant || []).length > 0;

/** What the figure households show (2.14), from the results run() gives: how many, how often an account is short against the
    same household fully listed, and how far the figures are from the truth (the figure against what the 7-plus-month bills
    really come to, and the month's bills the app works with against what the household really pays that month). */
export function figureSummary(res) {
  const f = res.figures || [], pct = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : '-';
  if (!f.length) return 'Households with a rough figure: none';
  const accts = f.flatMap(x => x.h.truth.filter(t => t.figure > 0)), ratios = accts.filter(t => t.true7 > 0).map(t => t.figure / t.true7);
  const lowAcc = ratios.filter(r => r < 0.9).length, highAcc = ratios.filter(r => r > 1.1).length, exact = ratios.filter(r => Math.abs(r - 1) < 1e-9).length;
  // The month's bills as the app works them out against what's really paid, for each account with a figure.
  let under = 0, over = 0, n = 0, absErr = 0;
  f.forEach(x => figureExtras(x.h).forEach(e => { const mine = x.h.bills.concat(x.h.hidden).filter(b => intendedAccount(x.h, b, 'bills') === e.account);
    for (let m = 1; m <= 12; m++) { const truth = mine.filter(b => applies({ months: billMonths(b) }, m)).reduce((s, b) => s + b.amount, 0), got = billsOut(x.h, e.account, m);
      if (truth > 0) { n++; absErr += Math.abs(got - truth) / truth; if (got < truth * 0.99) under++; else if (got > truth * 1.01) over++; } } }));
  const shortF = f.filter(x => x.short).length, shortFull = f.filter(x => x.shortFull).length, newly = f.filter(x => x.short && !x.shortFull).length, hidden = f.filter(x => x.h.hidden.length).length;
  return [`Households with a rough figure: ${f.length} (${f.filter(x => x.h.figureKind === 'anchor').length} raised to what the household moves in), ${accts.length} figures on accounts, ${hidden} with bills not listed`,
    `  figure against the true monthly total of the 7-plus-month bills: ${pct(lowAcc, ratios.length)} more than 10% low, ${pct(highAcc, ratios.length)} more than 10% high, ${pct(exact, ratios.length)} exactly right`,
    `  the month's bills the app works with against what's really paid (account-months): ${pct(under, n)} under, ${pct(over, n)} over, average error ${pct(absErr, n)}`,
    `  an account shown short in some month: ${shortF} households (${pct(shortF, f.length)}); the same households fully listed: ${shortFull}; short only with the figure: ${newly}`].join('\n');
}
export function report(title, res) {
  const fk = Object.keys(res.fails);
  console.log(`${title}: ${res.households} households, ${res.months} months worked out, ${fk.length ? fk.length + ' kinds of problem' : 'no problems'}`);
  const ps = patternSummary(res); if (ps) console.log(ps); if (res.patterns && res.patterns.notRun) process.exitCode = 1;
  if (res.figures && res.figures.length) console.log(figureSummary(res));
  if (res.figures && res.figures.length) { const ran = res.figures.reduce((a, x) => { Object.keys(x.ran || {}).forEach(k => { a[k] = (a[k] || 0) + x.ran[k]; }); Object.keys(x.skipped || {}).forEach(k => { a['skipped ' + k] = (a['skipped ' + k] || 0) + x.skipped[k]; }); return a; }, {});
    console.log('  properties worked out (months): ' + Object.entries(ran).map(([k, v]) => `${k} ${v}`).join(', ')); }
  fk.sort((a, b) => res.fails[b].length - res.fails[a].length).forEach(k => console.log(`- [${new Set(res.fails[k].map(x => x.split('@')[0])).size} households] ${k}\n    e.g. seed ${res.fails[k][0]}`));
  if (fk.length) process.exitCode = 1;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const N = Number(process.argv[2] || 5000), S = Number(process.argv[3] || 1), specs = [];
  for (let s = S; s < S + N; s++) specs.push(makeHousehold(s));
  const tally = {}; specs.forEach(h => tally[styleKey(h)] = (tally[styleKey(h)] || 0) + 1);
  // 2.16: the pattern functions on their own, once, when the core is there.
  if (patternsOn() && !patternApiMissing(P).length) { const pb = patternBasics(P); console.log(`Pay pattern functions: ${pb.length ? pb.length + ' problems' : 'no problems'}`); pb.forEach(x => console.log('- ' + x)); if (pb.length) process.exitCode = 1; }
  else if (!patternsOn()) console.log(patternNote);
  report('Random households', run(specs));
  if (figuresOn()) report('Households with a rough figure', run(figureSpecs(N, S))); else console.log(figureNote);
  console.log('Styles: ' + Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
}
