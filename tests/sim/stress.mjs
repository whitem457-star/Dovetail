// The household simulation, every combination: each money style with 2, 3 and 4 people, every rule, one or two joint
// accounts, with and without one earner, and households that can't cover their bills. Exits 1 on any problem.
// node sim/stress.mjs [households per combination=40]
import { makeHousehold, withFigures, patternsOn, patternNote } from './gen.mjs';
import { run, report, figuresOn, figureNote } from './logic.mjs';

const per = Number(process.argv[2] || 40), combos = [];
for (const style of ['pool', 'contribute', 'housekeeping', 'separate', 'other']) for (const n of [2, 3, 4]) for (const short of [false, true]) for (const oneEarner of [false, true]) {
  const rules = ['contribute', 'housekeeping'].includes(style) ? ['equal', 'pay', 'sameLeft', 'set'] : [null];
  for (const rule of rules) for (const two of style === 'contribute' ? [false, true] : [false]) combos.push({ style, n, short, oneEarner, rule, two });
}
for (const pool of ['joint', 'own', 'split', 'other']) for (const short of [false, true]) combos.push({ n: 1, pool, short });
const specs = []; combos.forEach((f, ci) => { for (let s = 0; s < per; s++) specs.push(makeHousehold(1e6 + ci * 1000 + s, f)); });
report(`Every combination (${combos.length})`, run(specs));
// 2.14: every combination again with a rough figure on the accounts bills come out of (SIM_FIGURES=1): a third of each
// combination's households (the figure checks work out 100 months each), every other one an anchor.
if (figuresOn()) report(`Every combination, with a rough figure (${combos.length})`, run(specs.filter((h, i) => i % 3 === 0).map((h, i) => withFigures(h, h.seed, i % 2 ? 'anchor' : 'figure')).filter(h => h.figures)));
else console.log(figureNote);
// 2.16: every combination again with everyone who has pay on a pattern (weekly, fortnightly or four-weekly at random): a
// third of each combination's households. With SIM_PATTERNS=0 they're left out, and the line says so.
if (patternsOn()) report(`Every combination, everyone with pay on a pattern (${combos.length})`, run(specs.filter((h, i) => i % 3 === 1).map(h => makeHousehold(h.seed, { ...combos[Math.floor((h.seed - 1e6) / 1000)], patterns: 1 }))));
else console.log(patternNote);
