// The household simulation: sums up an onboarding run (sim/ui.mjs): taps and fields per style and step, messages,
// defaults that had to be changed, boarders, shortfalls, and how much there is to read on each step.
// node sim/analyse.mjs [results file=the newest sim/out/ui-*.json]
import fs from 'fs';
const dir = new URL('./out/', import.meta.url).pathname;
const newest = () => { const f = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter(n => /^ui-.*\.json$/.test(n))
  .map(n => ({ n: dir + n, t: fs.statSync(dir + n).mtimeMs })).sort((a, b) => b.t - a.t)[0];
  if (!f) { console.error('No results in ' + dir + ': run node sim/ui.mjs first'); process.exit(1); } return f.n; };
const file = process.argv[2] || newest();
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
console.log('\nSetup text length per step (characters on screen, avg):', [1, 2, 3, 4, 5, 6, 7].map(s => s + ':' + avg(o.map(x => x.M.textLen[s] || 0)).toFixed(0)).join(' '));
console.log('Step 4 diagram length (chars) avg/max:', avg(o.map(x => (x.M.dia || '').length)).toFixed(0), Math.max(...o.map(x => (x.M.dia || '').length)));
