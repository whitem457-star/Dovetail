// The household simulation, every combination: each money style with 2, 3 and 4 people, every rule, one or two joint
// accounts, with and without one earner, and households that can't cover their bills. Exits 1 on any problem.
// node sim/stress.mjs [households per combination=40]
import { makeHousehold } from './gen.mjs';
import { run, report } from './logic.mjs';

const per = Number(process.argv[2] || 40), combos = [];
for (const style of ['pool', 'contribute', 'housekeeping', 'separate', 'other']) for (const n of [2, 3, 4]) for (const short of [false, true]) for (const oneEarner of [false, true]) {
  const rules = ['contribute', 'housekeeping'].includes(style) ? ['equal', 'pay', 'sameLeft', 'set'] : [null];
  for (const rule of rules) for (const two of style === 'contribute' ? [false, true] : [false]) combos.push({ style, n, short, oneEarner, rule, two });
}
for (const pool of ['joint', 'own', 'split', 'other']) for (const short of [false, true]) combos.push({ n: 1, pool, short });
const specs = []; combos.forEach((f, ci) => { for (let s = 0; s < per; s++) specs.push(makeHousehold(1e6 + ci * 1000 + s, f)); });
report(`Every combination (${combos.length})`, run(specs));
