// 2.13: What's new is one list keyed by version (WHATS_NEW in ui.js). The card after an update shows every version
// since the one last opened, newest first; About › What changed shows the last three. ui.js isn't one of the pure
// modules load.mjs loads, so its plain part (versionBefore, WHATS_NEW and whatsNewVersions, which touch no page) is
// read from the file as written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const ui = fs.readFileSync(new globalThis.URL('../../web/src/ui.js', import.meta.url), 'utf8');
// versionBefore lives in calc.js (2.13, with the backup version checks); its two lines are taken from there.
const calc = fs.readFileSync(new globalThis.URL('../../web/src/calc.js', import.meta.url), 'utf8');
const vb0 = calc.indexOf('function versionBefore('), vb1 = calc.indexOf('\n', calc.indexOf('\n', vb0) + 1);
const from = ui.indexOf("/* What's new, by version"), to = ui.indexOf("/* Each version's lines in a list");
assert.ok(vb0 > 0 && from > 0 && to > from, 'the What\'s new code is where this test expects it in ui.js and calc.js');
const VERSION = ui.match(/VERSION="([^"]+)"/)[1];
const { versionBefore, WHATS_NEW, whatsNewVersions } =
  new Function(calc.slice(vb0, vb1) + '\n' + ui.slice(from, to) + '\nreturn { versionBefore, WHATS_NEW, whatsNewVersions };')();

// Made-up versions, so the tests don't change with each release's lines.
const LIST = { '2.12': ['a'], '2.12.1': ['b', 'c'], '2.13': ['d'], '2.13.1': [], '2.14': ['e'], '2.9': ['f'] };

test('versionBefore compares part by part, as numbers, and missing counts as before', () => {
  assert.equal(versionBefore('2.9', '2.10'), true);
  assert.equal(versionBefore('2.10', '2.9'), false);
  assert.equal(versionBefore('2.12', '2.12.1'), true);
  assert.equal(versionBefore('2.12.1', '2.12'), false);
  assert.equal(versionBefore('2.12', '2.12.0'), false);
  assert.equal(versionBefore('2.12.1', '2.12.1'), false);
  assert.equal(versionBefore(null, '1.0'), true);
  assert.equal(versionBefore(undefined, '2.12'), true);
});

test('whatsNewVersions: only versions after the one last opened, up to this one, newest first', () => {
  assert.deepEqual(whatsNewVersions(LIST, '2.12', '2.13'), ['2.13', '2.12.1']);
  assert.deepEqual(whatsNewVersions(LIST, '2.12.1', '2.13'), ['2.13']);
  assert.deepEqual(whatsNewVersions(LIST, '2.11', '2.12.1'), ['2.12.1', '2.12']);
  assert.deepEqual(whatsNewVersions(LIST, '2.10.1', '2.14'), ['2.14', '2.13', '2.12.1', '2.12']);
});

test('whatsNewVersions: a version with no lines is left out, and so is one newer than this', () => {
  assert.deepEqual(whatsNewVersions(LIST, '2.13', '2.13.1'), []);
  assert.deepEqual(whatsNewVersions(LIST, '2.13', '2.14'), ['2.14']);
  assert.ok(!whatsNewVersions(LIST, '2.12', '2.13').includes('2.14'));
});

test('whatsNewVersions: nothing last opened (or opened after a downgrade) gives every version up to this, or none', () => {
  assert.deepEqual(whatsNewVersions(LIST, null, '2.13'), ['2.13', '2.12.1', '2.12', '2.9']);
  assert.deepEqual(whatsNewVersions(LIST, '2.14', '2.13'), []);
});

test('About\'s last three versions are the newest three with lines', () => {
  assert.deepEqual(whatsNewVersions(LIST, null, '2.14').slice(0, 3), ['2.14', '2.13', '2.12.1']);
});

test('the app\'s own list: keyed by version, every line a sentence, and this version has something to say', () => {
  for (const [v, lines] of Object.entries(WHATS_NEW)) {
    assert.match(v, /^\d+\.\d+(\.\d+)?$/);
    assert.ok(Array.isArray(lines), v);
    for (const t of lines) assert.match(t, /^[A-Z].*[.!?]$/, t);
  }
  assert.ok(WHATS_NEW['2.12'].length && WHATS_NEW['2.12.1'].length);
  assert.ok(!Object.keys(WHATS_NEW).some(v => versionBefore(VERSION, v) && WHATS_NEW[v].length),
    'no lines for a version newer than ' + VERSION + ' (they would never show)');
  assert.ok(whatsNewVersions(WHATS_NEW, null, VERSION)[0] === VERSION, 'What\'s new has lines for ' + VERSION);
});

test('2.13\'s lines: three, the backups line short and saying which files need 2.13 on the other phone', () => {
  const l = WHATS_NEW['2.13'], words = t => t.split(/\s+/).length;
  assert.equal(l.length, 3);
  assert.ok(words(l[2]) < 30, words(l[2]) + ' words');
  assert.ok(/shares/.test(l[2]) && /board/.test(l[2]) && /change from a month/.test(l[2]) && /need 2\.13 on the other phone/.test(l[2]), l[2]);
});
