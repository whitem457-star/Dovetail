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
/** A second, separate copy of the page's pure code with `extra` source after it: a later declaration of a function
    (say bankHolidaysEW) replaces the page's own everywhere, as the last one wins. `inject` names values the extra
    source can use ({name: value}). The simulation uses it to switch the bank holiday rule (docs/payperiods.md L18). */
export function loadPage(extra = '', inject = {}) {
  const keys = Object.keys(inject), all = new Set(names);
  for (const m of extra.matchAll(/^function\s+([A-Za-z0-9_$]+)\s*\(/gm)) all.add(m[1]);
  return new Function(...keys, '"use strict";\n' + src + '\n' + extra + '\nreturn {' + [...all].join(',') + '};')(...keys.map(k => inject[k]));
}
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
/** 2.13: the made-up household with 36 saved months (January 2024 to December 2026): typed pay that varies, ticks,
 *  one-offs, top-ups of Current account 1 every fifth month (always from money that's there) and months made short by
 *  one-offs (November 2024, June 2025). Pooled, with one account keeping what's left: Analysis and the exports must give
 *  exactly what 2.12.1 gave. forced: also June 2026 with £500 pay each, where Joint bills needs a top-up the spending
 *  account hasn't the money for (2.13 sends what there is and names the shortfall; 2.12.1 sent it all). */
export function sample36({ forced = false } = {}) {
  const { c, m } = sampleUpgraded(true);
  for (let i = 0; i < 36; i++) {
    const k = P.shiftMonth('2024-01', i); if (m[k]) continue;
    const d = { pay: { alex: 2200 + (i * 37) % 300, sam: 2050 + (i * 53) % 250 }, done: {} };
    if (i % 5 === 0) { d.pay.alex = 300; d.pay.sam += 1900; }
    if (i % 4 === 1) d.done['s:sisa01'] = 200;
    if (i % 7 === 3) d.oneOffs = [{ id: 'o' + i, kind: 'out', name: 'Car repair', amount: 400, account: 'jspend' }];
    if (i % 9 === 2) d.oneOffs = [{ id: 'i' + i, kind: 'in', name: 'Refund', amount: 60, account: 'jbills' }];
    if (i === 17) d.oneOffs = [{ id: 'big', kind: 'out', name: 'New boiler', amount: 3000, account: 'jspend' }];
    if (forced && i === 29) d.pay = { alex: 500, sam: 500 };
    if (i === 31) d.payEstimated = { sam: true };
    if (i === 33) delete d.pay.sam;
    m[k] = d;
  }
  return { c, m };
}
