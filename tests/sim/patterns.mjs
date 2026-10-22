// The household simulation, pay patterns without a date (2.17, docs/payperiods.md L18): layer 2 counts paydays only for
// someone with a recent payday (pattern.on), so every household on a pattern without one must stay exactly as 2.16.1 had
// it. For the first N made-up households with someone on a pattern and no date (makeHousehold with patterns, no `on`)
// this works out: the settings setup saves, whether a backup keeps them, the backup's version and needs (given the months
// too, as 2.17's backupJson does), and for twelve saved months (typed, untyped and ticked pay, extra paydays set aside,
// counted or left in, one-offs): planPay's 2.16 fields, payFor, payEstimate, the transfers, left over, predictedFloat and
// Month by month's extras; standing orders and the Pay tab's notice in two months; averageShort, Analysis's typical
// income and both exports. tests/fixtures/sim-patterns-2.16.1.json holds a SHA-256 of each household's snapshot as
// 2.16.1's code worked it out, as a decimal number (account ids replaced by their place), like sim/monthly.mjs.
// Exits 1 when any household differs.
// node sim/patterns.mjs [households=300]      compare with the fixture
// node sim/patterns.mjs 300 --write           write the fixture (only ever on 2.16.1's code: the 2.16.1 release commit's web/src)
// node sim/patterns.mjs 1 --show <seed>       print one household's snapshot
import fs from 'fs';
import crypto from 'crypto';
import { P } from '../unit/load.mjs';
import { makeHousehold, payMonthsFor, monthsObj, oneOffsFor, oneOffAccount, hasPattern } from './gen.mjs';
import { buildCfg } from './logic.mjs';
import { idByName } from './check.mjs';

const FIX = new URL('../fixtures/sim-patterns-2.16.1.json', import.meta.url);
const clone = o => JSON.parse(JSON.stringify(o));
const sha = o => BigInt('0x' + crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex')).toString();
/** Only the fields 2.16 gave (2.17 adds layer, m, dates, expected and extraDefault to planPay, for words only). */
const PLAN = ['kind', 'arrived', 'setAside', 'used', 'typed', 'n', 'each', 'from'], ORDER = ['step', 'kind', 'to', 'name', 'amount', 'word'];
const pick = (o, f) => o == null ? o : Object.fromEntries(f.map(k => [k, o[k] === undefined ? null : o[k]]));
const TODAY = '2027-06-15';

/** The seeds of the first n households (from seed 1) with someone on a pattern. */
export function patternSeeds(n) { const out = []; for (let s = 1; out.length < n; s++) if (hasPattern(makeHousehold(s, { patterns: 0.5 }))) out.push(s); return out; }

/** Household `seed` (with patterns, no dates), worked out by this code, with account ids as a0, a1… by their place. */
export function snapshot(seed) {
  const h = makeHousehold(seed, { patterns: 0.5 }), c = buildCfg(h), pm = payMonthsFor(h, seed), spec = oneOffsFor(h, seed), ones = {};
  if (c.people.some(p => p.pattern && (p.pattern.on || p.pattern.since))) throw new Error('a layer-1 household has a date');
  const sep = o => o.owner === 'shared' && h.style === 'separate' ? { ...o, owner: 0 } : o;
  Object.keys(spec).forEach(m => { ones[m] = spec[m].map(o => ({ id: o.id, kind: o.kind, name: o.name, amount: o.amount, account: idByName(c, oneOffAccount(h, sep(o))) })); });
  const months = monthsObj(c, pm, ones);
  const out = { settings: c, keeps: JSON.stringify(P.normCfg(clone(c))) === JSON.stringify(c), version: P.backupVersionFor(c, months), needs: P.backupNeedsFor(c, months), months: {} };
  for (let m = 1; m <= 12; m++) {
    const k = '2027-' + String(m).padStart(2, '0'), r = P.calcMonth(c, months, k), pl = P.planPay(c, months, k);
    out.months[k] = { plan: Object.fromEntries(c.people.map(p => [p.id, pick(pl[p.id], PLAN)])), pay: P.payFor(c, months, k),
      est: Object.fromEntries(c.people.map(p => [p.id, P.payEstimate(c, months, p.id, k)])),
      steps: r.steps, floats: r.floats, outside: r.outside || [], cant: r.cant, flt: r.flt, ok: r.ok, t: r.t,
      predicted: P.predictedFloat(c, months, k), extras: P.monthExtras(c, months, k) };
  }
  const so = k => { const s = P.standingOrders(c, months, k); return Object.fromEntries(Object.keys(s).map(id => [id, { orders: s[id].orders.map(x => pick(x, ORDER)), moveTo: s[id].moveTo }])); };
  out.orders = { '2027-01': so('2027-01'), '2027-07': so('2027-07') };
  out.notices = Object.fromEntries(['2027-01', '2027-07'].map(k => [k, Object.fromEntries(c.people.map(p => [p.id, P.standingOrdersNotice(c, months, k, p.id)]))]));
  out.averageShort = P.averageShort(c, '2027-03', P.payFor(c, months, '2027-03'));
  out.avgIncome = P.avgIncome(c, months, '2027-12');
  out.markdown = P.exportMarkdown(c, months, TODAY); out.csv = P.exportCsv(c, months, TODAY);
  let text = JSON.stringify(out);
  c.accounts.forEach((a, i) => { text = text.split(a.id).join('a' + i); });
  return JSON.parse(text);
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const args = process.argv.slice(2), N = Number(args.find(a => /^\d+$/.test(a)) || 300), t0 = Date.now();
  if (args.includes('--show')) { console.log(JSON.stringify(snapshot(Number(args[args.indexOf('--show') + 1])), null, 1)); process.exit(0); }
  const digest = {}; patternSeeds(N).forEach(s => { digest[s] = sha(snapshot(s)); });
  if (args.includes('--write')) {
    const v = (/var VERSION="([^"]+)"/.exec(fs.readFileSync(new URL('../../web/src/ui.js', import.meta.url), 'utf8')) || [])[1];
    fs.writeFileSync(FIX, JSON.stringify({ about: 'sim/patterns.mjs: a SHA-256 of each made-up household with a pay pattern and no payday date, as this version worked it out, written as a decimal number (digits only, so tools/make-public.mjs\'s search for the owner\'s names can\'t match inside a hash)', version: v, households: N, digest }, null, 1) + '\n');
    console.log(`Wrote ${N} households as ${v} works them out`); process.exit(0);
  }
  const fix = JSON.parse(fs.readFileSync(FIX, 'utf8')), seeds = Object.keys(digest).filter(s => fix.digest[s]), diff = seeds.filter(s => fix.digest[s] !== digest[s]);
  console.log(`Households on a pattern without a date: ${seeds.length} households, ${diff.length ? diff.length + ' not as ' + fix.version + ' had them' : 'all exactly as ' + fix.version + ' had them'} (settings, backup, twelve months' pay, transfers, estimates and extras, standing orders, Analysis and exports; ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (seeds.length < N) console.log(`  (the fixture has ${fix.households} households; ${N - seeds.length} more asked for were not compared)`);
  if (diff.length) { console.log('  e.g. seeds ' + diff.slice(0, 10).join(', ') + ': node sim/patterns.mjs 1 --show <seed> here and on ' + fix.version + "'s code shows the difference"); process.exitCode = 1; }
}
