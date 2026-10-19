// Loads the page's pure modules (calc, migrate, analysis, export) into Node exactly as the app concatenates them,
// and returns every top-level function and constant. No DOM is involved.
import fs from 'fs';
const SRC = new globalThis.URL('../../web/src/', import.meta.url);
const FILES = ['calc.js', 'migrate.js', 'analysis.js', 'export.js'];
const src = FILES.map(f => fs.readFileSync(new globalThis.URL(f, SRC), 'utf8')).join('\n');
const names = new Set();
for (const m of src.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)) names.add(m[1]);
for (const m of src.matchAll(/^var\s+([A-Za-z0-9_$]+)\s*=/gm)) names.add(m[1]);
for (const m of src.matchAll(/^var\s+[^;]*?,\s*([A-Za-z0-9_$]+)\s*=/gm)) names.add(m[1]);
export const P = new Function('"use strict";\n' + src + '\nreturn {' + [...names].join(',') + '};')();
// The real 1.4 backup (golden tests only; null in the public copy, where they skip) and the made-up one (everything else).
const readJson = name => { const u = new globalThis.URL('../fixtures/' + name, import.meta.url); return fs.existsSync(u) ? JSON.parse(fs.readFileSync(u, 'utf8')) : null; };
export const FIXTURE = readJson('household-1.4-backup.json');
export const SAMPLE = readJson('sample-1.x-backup.json');
export const clone = o => JSON.parse(JSON.stringify(o));
/** Our 1.4 household upgraded to the current schema, as the app does on first opening. */
export function upgraded(withMonths = true) {
  const c = P.normCfg(FIXTURE.config), m = withMonths ? clone(FIXTURE.months) : {}, w = clone(FIXTURE.wealth);
  P.migrate(c, m, w); return { c, m, w };
}
/** The made-up 1.x household (Alex and Sam) upgraded the same way. */
export function sampleUpgraded(withMonths = true) {
  const c = P.normCfg(SAMPLE.config), m = withMonths ? clone(SAMPLE.months) : {}, w = clone(SAMPLE.wealth);
  P.migrate(c, m, w); return { c, m, w };
}
/** A current-schema household. */
export function household(o) {
  return P.normCfg(Object.assign({ schema: 5, setupDone: true, people: [], accounts: [], bills: [], income: [], budgets: [], savings: [], reminders: [], doneLog: [], payday: {} }, o));
}
export const money = x => Math.round(x * 100) / 100;
