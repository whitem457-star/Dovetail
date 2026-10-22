// The household simulation, households paid monthly (2.16): pay patterns must leave every household without one exactly as
// 2.15 had it. For each of the first N made-up households with nobody on a pattern (makeHousehold with patterns: 0) this
// works out, with this version's code: the settings setup saves, whether a backup keeps them (normCfg) and the backup's
// version and needs, and for twelve saved months (typed, untyped and ticked pay, one-offs, and now and then an extra payday
// saved for someone paid monthly, which must change nothing) each month's transfers, left over, pay (payFor) and estimates
// (payEstimate). tests/fixtures/sim-monthly-2.15.json holds a SHA-256 of each household's snapshot as 2.15's code worked it
// out (hashes only, with account ids replaced by their place, so the public copy's search has nothing to trip on).
// Exits 1 when any household differs.
// node sim/monthly.mjs [households=400]       compare with the fixture
// node sim/monthly.mjs 400 --write            write the fixture (only ever on 2.15's code: git checkout 6a20c35 -- web/src)
// node sim/monthly.mjs 1 --show <seed>        print one household's snapshot, to compare two versions by eye
import fs from 'fs';
import crypto from 'crypto';
import { P } from '../unit/load.mjs';
import { makeHousehold, payMonthsFor, monthsObj, oneOffsFor, oneOffAccount } from './gen.mjs';
import { buildCfg } from './logic.mjs';
import { idByName } from './check.mjs';

const FIX = new URL('../fixtures/sim-monthly-2.15.json', import.meta.url);
const clone = o => JSON.parse(JSON.stringify(o));
// Written as a decimal number: digits only, so make-public's search for the owner's names can't match inside a hash.
const sha = o => BigInt('0x' + crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex')).toString();

/** Household `seed` paid monthly, worked out by this code, with account ids as a0, a1… by their place in the settings. */
export function snapshot(seed) {
  const h = makeHousehold(seed, { patterns: 0 }), c = buildCfg(h), pm = payMonthsFor(h, seed), spec = oneOffsFor(h, seed), ones = {};
  const sep = o => o.owner === 'shared' && h.style === 'separate' ? { ...o, owner: 0 } : o;
  Object.keys(spec).forEach(m => { ones[m] = spec[m].map(o => ({ id: o.id, kind: o.kind, name: o.name, amount: o.amount, account: idByName(c, oneOffAccount(h, sep(o))) })); });
  const months = monthsObj(c, pm, ones);
  // Every fifth household: an extra payday saved for someone paid monthly, in a month their pay is typed (it sets nothing aside).
  if (seed % 5 === 0) { const k = Object.keys(months).find(x => months[x].pay && months[x].pay[c.people[0].id] != null); if (k) months[k].extra = { [c.people[0].id]: { amount: 100 } }; }
  const out = { settings: c, keeps: JSON.stringify(P.normCfg(clone(c))) === JSON.stringify(c), version: P.backupVersionFor(c), needs: P.backupNeedsFor(c), months: {} };
  for (let m = 1; m <= 12; m++) {
    const k = '2027-' + String(m).padStart(2, '0'), r = P.calcMonth(c, months, k);
    out.months[k] = { pay: P.payFor(c, months, k), est: Object.fromEntries(c.people.map(p => [p.id, P.payEstimate(c, months, p.id, k)])),
      steps: r.steps, floats: r.floats, outside: r.outside || [], cant: r.cant, flt: r.flt, ok: r.ok, t: r.t };
  }
  let text = JSON.stringify(out);
  c.accounts.forEach((a, i) => { text = text.split(a.id).join('a' + i); });
  return JSON.parse(text);
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const args = process.argv.slice(2), N = Number(args.find(a => /^\d+$/.test(a)) || 400), t0 = Date.now();
  if (args.includes('--show')) { console.log(JSON.stringify(snapshot(Number(args[args.indexOf('--show') + 1])), null, 1)); process.exit(0); }
  const digest = {}; for (let s = 1; s <= N; s++) digest[s] = sha(snapshot(s));
  if (args.includes('--write')) {
    const v = (/var VERSION="([^"]+)"/.exec(fs.readFileSync(new URL('../../web/src/ui.js', import.meta.url), 'utf8')) || [])[1];
    fs.writeFileSync(FIX, JSON.stringify({ about: 'sim/monthly.mjs: a SHA-256 of each made-up household paid monthly, as this version worked it out, written as a decimal number (digits only, so tools/make-public.mjs\'s search for the owner\'s names can\'t match inside a hash)', version: v, households: N, digest }, null, 1) + '\n');
    console.log(`Wrote ${N} households as ${v} works them out`); process.exit(0);
  }
  const fix = JSON.parse(fs.readFileSync(FIX, 'utf8')), seeds = Object.keys(digest).filter(s => fix.digest[s]), diff = seeds.filter(s => fix.digest[s] !== digest[s]);
  console.log(`Households paid monthly: ${seeds.length} households, ${diff.length ? diff.length + ' not as ' + fix.version + ' had them' : 'all exactly as ' + fix.version + ' had them'} (settings, backup, twelve months' transfers, pay and estimates; ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (seeds.length < N) console.log(`  (the fixture has ${fix.households} households; ${N - seeds.length} more asked for were not compared)`);
  if (diff.length) { console.log('  e.g. seeds ' + diff.slice(0, 10).join(', ') + ': node sim/monthly.mjs 1 --show <seed> here and on ' + fix.version + "'s code shows the difference"); process.exitCode = 1; }
}
