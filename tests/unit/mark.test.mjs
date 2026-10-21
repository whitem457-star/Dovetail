// 2.11: the Dovetail mark is drawn in six places: the app icon (colour and one-colour), the launch screen (light and
// dark), the notification icon and the page (MARK in ui.js). They must stay the same shape and the colours must be the
// chart colours, so a change in one place can't quietly leave the others behind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';

const read = p => fs.readFileSync(new globalThis.URL('../../' + p, import.meta.url), 'utf8');
const RES = 'app/src/main/res/';
const paths = xml => [...xml.matchAll(/android:pathData="([^"]+)"/g)].map(m => m[1]);
const colours = xml => [...xml.matchAll(/android:strokeColor="#FF([0-9A-F]{6})"/g)].map(m => '#' + m[1].toLowerCase());
const ui = read('web/src/ui.js'), template = read('web/template.html');
const MARK = new Function('return ' + ui.match(/var MARK=(\{[\s\S]*?\}),markN=0;/)[1])();
const token = (css, name) => css.match(new RegExp('--' + name + ':(#[0-9a-f]{6})'))[1];
const lightCss = template.match(/:root\{[\s\S]*?\}/)[0], darkCss = template.match(/:root\[data-theme="dark"\]\{[\s\S]*?\}/)[0];
const LIGHT = ['viz-1', 'viz-4', 'viz-3'].map(n => token(lightCss, n)), DARK = ['viz-1', 'viz-4', 'viz-3'].map(n => token(darkCss, n));
const FULL = [MARK.clipA, MARK.a, MARK.clipB, MARK.b, MARK.shaft, MARK.head];

test('the app icon has the page mark\'s paths, in the light chart colours', () => {
  const xml = read(RES + 'drawable/ic_launcher_foreground.xml');
  assert.deepEqual(paths(xml), FULL);
  assert.deepEqual(colours(xml), [LIGHT[0], LIGHT[1], LIGHT[2], LIGHT[2]]);
});

test('the one-colour layer is the same shape, all white', () => {
  const xml = read(RES + 'drawable/ic_launcher_monochrome.xml');
  assert.deepEqual(paths(xml), FULL);
  assert.deepEqual(colours(xml), Array(4).fill('#ffffff'));
});

test('the launch screen draws the same mark: chart colours in light, dark chart colours at night', () => {
  for (const [file, cols] of [['drawable/splash_mark.xml', LIGHT], ['drawable-night/splash_mark.xml', DARK]]) {
    const xml = read(RES + file), [c1, a, c2, b, shaft, hl, hr] = paths(xml);
    assert.deepEqual([c1, a, c2, b, shaft], FULL.slice(0, 5), file);
    // The arrowhead in two halves, each from the tip, so it opens out: together the same chevron.
    const [l, tip, r] = MARK.head.slice(1).split('L');
    assert.deepEqual([hl, hr], ['M' + tip + 'L' + l, 'M' + tip + 'L' + r], file);
    assert.deepEqual(colours(xml), [cols[0], cols[1], cols[2], cols[2], cols[2]], file);
    assert.equal([...xml.matchAll(/android:name="(\w+)"/g)].length, 5, file);
  }
});

test('the animation targets every part of the launch screen mark', () => {
  const anim = read(RES + 'drawable/splash_mark_anim.xml');
  const names = [...read(RES + 'drawable/splash_mark.xml').matchAll(/android:name="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual([...anim.matchAll(/<target android:name="(\w+)"/g)].map(m => m[1]), names);
});

test('the notification icon is the same mark with wider gaps', () => {
  const [, a, , b, , head] = paths(read(RES + 'drawable/ic_stat_payday.xml'));
  assert.deepEqual([a, b, head], [MARK.a, MARK.b, MARK.head]);
});
