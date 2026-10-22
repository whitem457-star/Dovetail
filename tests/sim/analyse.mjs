// The household simulation: sums up an onboarding run (sim/ui.mjs): taps and fields per style and step, messages,
// defaults that had to be changed, boarders, shortfalls, and how much there is to read on each step.
// node sim/analyse.mjs [results file=the newest sim/out/ui-*.json]
import fs from 'fs';
import { figuresOn, figureSpecs, figureNote, figureSummary, run } from './logic.mjs';
const dir = new URL('./out/', import.meta.url).pathname;
const wantFigures = process.argv.includes('--figures') || figuresOn();
const newest = () => { const f = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(n => /^ui-.*\.json$/.test(n))
  .map(n => ({ n: dir + n, t: fs.statSync(dir + n).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  if (!f) { if (wantFigures) return null; console.error('No results in ' + dir + ': run node sim/ui.mjs first'); process.exit(1); } return f.n; };
// 2.14, the rough figure, from the calculation: how many households had figures, how far they are from the truth, and how
// often an account is short (against the same household fully listed), worked out with calc, not read from the screens
// (the screens' own figures are further down). Default on; SIM_FIGURES=0 leaves it out, --figures asks for it; FIGURE_N households (1000).
if (wantFigures) { const res = run(figureSpecs(Number(process.env.FIGURE_N || 1000))), fk = Object.keys(res.fails); console.log(figureSummary(res)); console.log(`  checked against the oracle: ${fk.length ? fk.length + ' kinds of problem (npm run sim says which)' : 'no problems'}\n`); }
else console.log(figureNote + '\n');
const file = process.argv.slice(2).find(a => !a.startsWith('--')) || newest();
if (!file) process.exit(0);
console.log('Results:', file);
const o = JSON.parse(fs.readFileSync(file));
const key = h => h.multi ? h.style + (h.style === 'pool' ? ':' + h.pool : '') : 'single:' + h.pool;
const avg = a => a.length ? (a.reduce((s, x) => s + x, 0) / a.length) : 0;
const g = {}; o.forEach(x => (g[key(x.h)] ||= []).push(x));
console.log('Households:', o.length, ' JS errors:', o.filter(x => x.M.errs.length).length, ' stopped:', o.filter(x => x.M.problems.some(p => p.startsWith('STOPPED'))).length);
console.log('axe violations:', [...new Set(o.flatMap(x => x.M.axe))].join(' | ') || 'none', ' (checked on', o.filter(x => x.h.seed % 15 === 0).length, 'households)');
console.log('\nActions (taps + fields) per household, by style: avg [min-max]; per step avg');
Object.keys(g).sort().forEach(k => { const a = g[k].map(x => x.M.actions); const ps = s => avg(g[k].map(x => x.M.perStep[s] || 0)).toFixed(1);
  console.log(`  ${k.padEnd(18)} n=${String(g[k].length).padEnd(4)} ${avg(a).toFixed(0)} [${Math.min(...a)}-${Math.max(...a)}]  steps 2:${ps(2)} 3:${ps(3)} 4:${ps(4)} 5:${ps(5)} 6:${ps(6)}`); });
const items = o.map(x => x.h.bills.length + x.h.budgets.length + x.h.savings.length + x.h.income.length);
console.log('  items typed per household avg', avg(items).toFixed(1), '; actions per item avg', avg(o.map((x, i) => x.M.actions / Math.max(1, items[i]))).toFixed(2));
console.log('\nMessages setup showed (a Next that did not move on):');
const msgs = {}; o.forEach(x => x.M.msgs.forEach(m => { const k = 'step ' + m.step + ': ' + m.msg; msgs[k] = (msgs[k] || 0) + 1; }));
Object.entries(msgs).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}× ${k}`));
console.log('\nBoxes setup required that had to be filled with 0:', o.filter(x => x.M.zeroed && x.M.zeroed.length).map(x => x.h.seed + ':' + x.M.zeroed.join(',')).join('  '));
console.log('\nDefaults that had to be changed (where the item was meant to go):');
const fx = {}; o.forEach(x => x.M.fixes.forEach(f => { if (f.what === 'opened') return; const shared = (x.h[f.what] || []).find(i => i.name === f.name);
  const k = `${key(x.h)}: ${f.what}${shared && shared.owner !== undefined ? (shared.owner === 'shared' ? ' (shared)' : ' (one person\'s)') : ''} defaulted to ${f.was.replace(/^[A-Z][a-z]+'s account$/, "<someone>'s account")} → wanted ${f.want.replace(/^[A-Z][a-z]+'s account$/, "<someone>'s account")}`; fx[k] = (fx[k] || 0) + 1; }));
Object.entries(fx).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}× ${k}`));
const opened = {}; o.forEach(x => { const n = x.M.fixes.filter(f => f.what === 'opened').length; if (n) opened[key(x.h)] = (opened[key(x.h)] || 0) + n; });
console.log('\n"+ Add a bill" taps to open a closed bills section, by style:', JSON.stringify(opened));
const shared = o.filter(x => x.h.multi && ['contribute', 'housekeeping'].includes(x.h.style));
const hit = shared.filter(x => x.M.fixes.some(f => f.step === 6 && (x.h[f.what] || []).some(i => i.name === f.name && i.owner === 'shared')));
console.log(`Shared budgets/savings defaulting to one person's account: ${hit.length} of ${shared.filter(x => x.h.budgets.concat(x.h.savings).some(i => i.owner === 'shared')).length} contribute/housekeeping households with shared budgets or savings`);
const wb = o.filter(x => Object.keys(x.h.board).length && x.M.r);
console.log('\nHouseholds with a boarder:', wb.length, '; left over without the boarder\'s own money:', wb.filter(x => Math.abs(x.M.r.flt - x.M.o.hhLeft) < 0.02).length,
  '; boarder listed in "keeps":', wb.filter(x => Object.keys(x.h.board).some(i => x.M.payTab.keeps.includes(x.h.people[i].name + ' '))).length);
console.log('\nPeople shown short in the hero:', o.filter(x => x.M.payTab && /short/.test(x.M.payTab.keeps + x.M.payTab.warn.join())).length, ' whole household short:', o.filter(x => x.M.payTab && /Short/.test(x.M.payTab.heroH)).length);
console.log('Preview said "short":', o.filter(x => x.M.previewShort).length);
// 2.14, the rough figure, on the screens (sim/ui.mjs: a quarter of the households are figure households, a quarter anchors).
{ const kind = x => x.h.figureKind && x.h.figureKind !== 'listed' ? x.h.figureKind : 'listed', pct = (n, d) => d ? (100 * n / d).toFixed(0) + '%' : '-';
  const grp = { listed: [], figure: [], anchor: [] }; o.forEach(x => grp[kind(x)].push(x));
  const step5 = x => x.M.perStep[5] || 0, typed = x => x.h.bills.length;
  console.log('\nRough figure, by how the household set up (listed = every bill typed, as before):');
  Object.keys(grp).forEach(k => { const g = grp[k]; if (!g.length) return;
    const bills = g.reduce((t, x) => t + typed(x), 0), s5 = g.reduce((t, x) => t + step5(x), 0);
    console.log(`  ${k.padEnd(7)} n=${String(g.length).padEnd(4)} actions ${avg(g.map(x => x.M.actions)).toFixed(0)} in all; bills step ${avg(g.map(step5)).toFixed(1)} [${Math.min(...g.map(step5))}-${Math.max(...g.map(step5))}] with ${avg(g.map(typed)).toFixed(1)} bills typed (${(s5 / Math.max(1, bills)).toFixed(2)} actions per bill typed); ${k === 'listed' ? '' : 'figure itself ' + avg(g.map(x => x.M.figActions || 0)).toFixed(1) + ' actions; '}under 10 on the bills step: ${pct(g.filter(x => step5(x) < 10).length, g.length)}`); });
  const fh = grp.figure.concat(grp.anchor);
  if (fh.length) {
    const small = fh.filter(x => typed(x) <= 3);
    console.log(`  figure households that typed 3 bills or fewer: ${small.length}, bills step avg ${avg(small.map(step5)).toFixed(1)}, under 10: ${pct(small.filter(x => step5(x) < 10).length, small.length)}`);
    const withFig = fh.filter(x => x.h.figures && x.h.figures.length);
    console.log(`  with a figure typed: ${withFig.length} of ${fh.length}; anchors asked "is the other £x for bills too?": ${grp.anchor.reduce((t, x) => t + (x.M.figAsked || 0), 0)} times in ${grp.anchor.filter(x => x.M.figAsked).length} households; figures setup did not keep (below the listed bills): ${fh.filter(x => /isn't needed/.test(x.M.figNotes || '')).length} households`);
    const low = grp.figure.filter(x => x.h.truth.some(t => t.rough > 0 && t.rough < t.true7 * 0.9)), notLow = grp.figure.filter(x => !low.includes(x));
    console.log(`  preview said "short": ${pct(grp.listed.filter(x => x.M.previewShort).length, grp.listed.length)} of listed households; ${pct(low.filter(x => x.M.previewShort).length, low.length)} of figure households with a figure 10% or more under the true total (${low.length}); ${pct(notLow.filter(x => x.M.previewShort).length, notLow.length)} of the other figure households (${notLow.length}); ${pct(grp.anchor.filter(x => x.M.previewShort).length, grp.anchor.length)} of anchors`);
    console.log(`  preview or Pay tab note "of bills not listed yet": ${fh.filter(x => (x.M.previewNotes || []).length).length} households (preview), ${fh.filter(x => (x.M.payNotes || []).length).length} (Pay tab); a figure on an account setup said it can't have: ${o.filter(x => x.M.problems.some(p => /figure is not offered|offers a figure|no rough figure offered/.test(p))).length}`); } }
console.log('\nSetup text length per step (characters on screen, avg):', [1, 2, 3, 4, 5, 6, 7].map(s => s + ':' + avg(o.map(x => x.M.textLen[s] || 0)).toFixed(0)).join(' '));
console.log('Step 4 diagram length (chars) avg/max:', avg(o.map(x => (x.M.dia || '').length)).toFixed(0), Math.max(...o.map(x => (x.M.dia || '').length)));
// 2.16, pay patterns on the screens (sim/ui.mjs): how many households, step 2's actions with and without a pattern (a
// household paid monthly takes exactly as many as before), and E17 for one person on a pattern with a pay account, bills
// and spending.
{ const pat = o.filter(x => x.h.people.some(p => p.every)), mon = o.filter(x => !x.h.people.some(p => p.every)), every = { 7: 0, 14: 0, 28: 0 };
  pat.forEach(x => x.h.people.forEach(p => { if (p.every) every[p.every]++; }));
  const s2 = g => avg(g.map(x => x.M.perStep[2] || 0)).toFixed(1), off = o.filter(x => x.M.step2 && x.M.step2.got !== x.M.step2.want);
  console.log(`\nPay patterns: ${pat.length} households with someone on one (people every week ${every[7]}, two weeks ${every[14]}, four weeks ${every[28]}), stopped: ${pat.filter(x => x.M.problems.some(p => p.startsWith('STOPPED'))).length}`);
  console.log(`  step 2 actions avg: paid monthly ${s2(mon)}, with a pattern ${s2(pat)}; households whose step 2 wasn't the expected count: ${off.length}${off.length ? ' (' + off.slice(0, 5).map(x => x.h.seed).join(', ') + ')' : ''}`);
  const e17 = o.filter(x => x.M.e17);
  console.log(`  E17, one person on a pattern with "pay account, bills, spending": ${e17.length} households, Bills topped up from the pay account in ${e17.filter(x => x.M.e17.topUp).length}`); }
