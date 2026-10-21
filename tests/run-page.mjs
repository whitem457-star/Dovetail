// Runs every Playwright suite, a few at a time, and reports every one of them: one line per suite as it finishes, then
// a table. Each suite's full output goes to tests/out/<suite>.log. Every suite runs even when one fails (the old `&&`
// chain stopped at the first failure and hid the rest), and the exit code is 1 if any failed.
//   node run-page.mjs [--jobs N]     (default 4; --jobs 1 runs them one after another)
// Each suite starts its own browser and web server on a free port, so they don't get in each other's way.
// `npm run page:serial` is the old chain, for watching one run's output as it happens.
import { spawn } from 'child_process';
import fs from 'fs';

// The suites and their order come from `page:serial` in package.json, so the two can't drift apart.
const pkg = JSON.parse(fs.readFileSync(new globalThis.URL('./package.json', import.meta.url), 'utf8'));
const SUITES = [...pkg.scripts['page:serial'].matchAll(/node (qa_\w+)\.mjs/g)].map(m => m[1]);

const args = process.argv.slice(2);
const at = args.findIndex(a => a === '--jobs' || a.startsWith('--jobs='));
const jobs = at < 0 ? 4 : Number(args[at].includes('=') ? args[at].split('=')[1] : args[at + 1]);
if (!Number.isInteger(jobs) || jobs < 1) { console.error('Usage: node run-page.mjs [--jobs N]  (N is 1 or more)'); process.exit(2); }

const dir = new globalThis.URL('.', import.meta.url).pathname;
const outDir = dir + 'out/';
fs.mkdirSync(outDir, { recursive: true });

const secs = ms => (ms / 1000).toFixed(1);
// The harness ends each suite with "N passed, N failed[, N skipped]" (lib.mjs, suite().finish).
const counts = log => { const m = [...log.matchAll(/^(\d+) passed, (\d+) failed(?:, (\d+) skipped)?$/gm)].pop();
  return m ? { passed: +m[1], failed: +m[2], skipped: +(m[3] || 0) } : null; };

function run(name) {
  return new Promise(resolve => {
    const log = outDir + name + '.log', fd = fs.openSync(log, 'w'), t0 = Date.now();
    const child = spawn(process.execPath, [name + '.mjs'], { cwd: dir, stdio: ['ignore', fd, fd], env: process.env });
    const done = code => {
      fs.closeSync(fd);
      const c = counts(fs.readFileSync(log, 'utf8'));
      const r = { name, code, ok: code === 0, c, ms: Date.now() - t0, log };
      console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${name.padEnd(14)} ${c ? `${c.passed} passed, ${c.failed} failed, ${c.skipped} skipped` : 'no results (see its log)'}  ${secs(r.ms)} s`);
      resolve(r);
    };
    child.on('error', e => { fs.writeSync(fd, String(e)); done(-1); });
    child.on('close', (code, signal) => done(code ?? (signal ? 1 : 0)));
  });
}

console.log(`Running ${SUITES.length} suites, ${jobs} at a time (each suite's output: tests/out/<suite>.log)\n`);
const t0 = Date.now(), queue = [...SUITES], results = [];
await Promise.all(Array.from({ length: Math.min(jobs, SUITES.length) }, async () => {
  while (queue.length) results.push(await run(queue.shift()));
}));
const wall = Date.now() - t0;

// The table, in the suites' usual order.
results.sort((a, b) => SUITES.indexOf(a.name) - SUITES.indexOf(b.name));
const n = k => results.reduce((s, r) => s + (r.c ? r.c[k] : 0), 0);
const row = (...cells) => cells.map((c, i) => i === 0 ? String(c).padEnd(14) : String(c).padStart(8)).join('  ');
console.log('\n' + row('Suite', 'Result', 'Passed', 'Failed', 'Skipped', 'Seconds'));
for (const r of results) console.log(row(r.name, r.ok ? 'pass' : 'FAIL', r.c ? r.c.passed : '-', r.c ? r.c.failed : '-', r.c ? r.c.skipped : '-', secs(r.ms)));
console.log(row('All', results.every(r => r.ok) ? 'pass' : 'FAIL', n('passed'), n('failed'), n('skipped'), secs(wall)));
console.log(`\nWall time ${secs(wall)} s with ${jobs} at a time (the suites' own times add up to ${secs(results.reduce((s, r) => s + r.ms, 0))} s).`);
const failed = results.filter(r => !r.ok);
if (failed.length) {
  console.log(`\n${failed.length} of ${results.length} suites failed.`);
  // Show what went wrong here too, so a CI log is enough: the failed and skipped checks, or the end of the output when
  // the suite stopped before its results (a crash, or the stale-page check).
  for (const r of failed) {
    const lines = fs.readFileSync(r.log, 'utf8').trimEnd().split('\n'), bad = lines.filter(l => /^(FAIL|SKIP) /.test(l));
    console.log(`\n--- ${r.name} (exit code ${r.code}; full output in ${r.log}) ---\n` + (bad.length ? bad : lines.slice(-20)).join('\n'));
  }
  process.exitCode = 1;
} else console.log(`All ${results.length} suites passed.`);
