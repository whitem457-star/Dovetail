// The made-up household's 36 months (sample36, plain and forced) worked out by calc.js and analysis.js, for
// v214.test.mjs: a household without a rough figure must get exactly what 2.13 gave. The fixture
// (tests/fixtures/sample36-2.13-calc.json) holds a SHA-256 of each month's figures as 2.13 worked them out, not the
// figures (so the public copy's search for the owner's amounts has nothing to trip on). To see a difference in full, run
// `node tests/unit/snap214.mjs out.json` on 2.13's code and on this code, and compare the two files.
import fs from 'fs';
import crypto from 'crypto';
import { P, sample36 } from './load.mjs';
export function snapshot() {
  const out = {};
  for (const forced of [false, true]) {
    const { c, m } = sample36({ forced }), rows = {};
    for (const k of Object.keys(m).sort()) {
      const r = P.calcMonth(c, m, k);
      rows[k] = { steps: r.steps, floats: r.floats, cant: r.cant, flt: r.flt, ok: r.ok, t: r.t, totalIn: r.totalIn, billsExSav: r.billsExSav, totalSaving: r.totalSaving,
        accounts: Object.fromEntries(Object.keys(r.A).map(id => [id, [r.A[id].inn, r.A[id].out]])), sub: r.sub,
        outgoings: P.monthOutgoings(c, m, k), picture: (({ incomeDetail, ...x }) => x)(P.monthlyPicture(c, m, k)) };
    }
    out[forced ? 'forced' : 'plain'] = { months: rows, byCategory: P.byCategory(c) };
  }
  // Account ids are replaced by their place in the household (a0, a1, …) before hashing, so the digest is the same in the
  // public copy, which renames the 1.x ids (tools/make-public.mjs), and only the figures count.
  const ids = sample36().c.accounts.map(x => x.id), re = new RegExp('([\'":>_])(' + ids.join('|') + ')(?=[\'">]|$)', 'g');
  return JSON.parse(JSON.stringify(out).replace(re, (m, pre, id) => pre + 'a' + ids.indexOf(id)));
}
const sha = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
/** A snapshot as the fixture holds it: a SHA-256 for each month and for Where the money goes. */
export function digest(s) {
  return Object.fromEntries(Object.keys(s).map(w => [w, { months: Object.fromEntries(Object.keys(s[w].months).map(k => [k, sha(s[w].months[k])])), byCategory: sha(s[w].byCategory) }]));
}
if (process.argv[1] && process.argv[1].endsWith('snap214.mjs') && process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(process.argv[3] === 'digest' ? digest(snapshot()) : snapshot(), null, 1));
