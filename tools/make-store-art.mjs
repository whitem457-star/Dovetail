#!/usr/bin/env node
// Makes the Google Play artwork from the app's own mark (MARK in web/src/ui.js) and colours (the chart colours in
// web/template.html): the 512×512 app icon and the 1024×500 feature graphic, as PNGs. Local only, with the Playwright
// the tests already use (cd tests && npm install first). The output is generated, so it isn't committed.
//
//   node tools/make-store-art.mjs [out-folder]      (default: build/store-art)
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || path.join(repo, 'build/store-art'));
const read = f => fs.readFileSync(path.join(repo, f), 'utf8');
const { chromium } = createRequire(path.join(repo, 'tests/package.json'))('playwright');

const MARK = new Function('return ' + read('web/src/ui.js').match(/var MARK=(\{[\s\S]*?\}),markN=0;/)[1])();
const css = read('web/template.html').match(/:root\{[\s\S]*?\}/)[0];
const token = n => css.match(new RegExp('--' + n + ':(#[0-9a-fA-F]{6})'))[1];
const C = { a: token('viz-1'), b: token('viz-4'), j: token('viz-3'), ink: token('ink'), muted: token('muted'), bg: token('bg') };
const font = (w, file) => `@font-face{font-family:'Bricolage Grotesque';font-weight:${w};src:url(data:font/woff2;base64,${
  fs.readFileSync(path.join(repo, 'web/fonts', file)).toString('base64')}) format('woff2')}`;

// The mark on its 108-unit canvas; viewBox picks the part to show.
const mark = (viewBox, attrs = '') => `<svg viewBox="${viewBox}" ${attrs} xmlns="http://www.w3.org/2000/svg">
<defs><clipPath id="ca"><path d="${MARK.clipA}"/></clipPath><clipPath id="cb"><path d="${MARK.clipB}"/></clipPath></defs>
<g fill="none" stroke-width="7" stroke-linejoin="round">
<path d="${MARK.a}" stroke="${C.a}" stroke-linecap="round" clip-path="url(#ca)"/><path d="${MARK.b}" stroke="${C.b}" stroke-linecap="round" clip-path="url(#cb)"/>
<path d="${MARK.shaft}" stroke="${C.j}" stroke-linecap="butt"/><path d="${MARK.head}" stroke="${C.j}" stroke-linecap="round"/></g></svg>`;

const pages = {
  // Play masks the corners itself, so this is the full square: the icon's visible 72 units on white.
  'dovetail-icon-512.png': [512, 512, `<body style="margin:0;background:#fff">${mark('18 18 72 72', 'width="512" height="512"')}</body>`],
  'dovetail-feature-1024x500.png': [1024, 500, `<style>${font(700, 'bricolage-grotesque-latin-700-normal.woff2')}${font(500, 'bricolage-grotesque-latin-500-normal.woff2')}
    body{margin:0;width:1024px;height:500px;background:${C.bg};display:flex;align-items:center;justify-content:center;gap:56px;font-family:'Bricolage Grotesque'}
    b{display:block;font-weight:700;font-size:112px;line-height:1;letter-spacing:-.025em;color:${C.ink}}
    span{display:block;margin-top:18px;font-weight:500;font-size:34px;line-height:1.25;color:${C.muted}}</style>
    <body>${mark('31 27 46 52', 'width="230" height="260"')}<div><b>Dovetail</b><span>Your payday transfers, worked out.</span></div></body>`],
};

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [name, [width, height, html]] of Object.entries(pages)) {
  const p = await browser.newPage({ viewport: { width, height } });
  await p.setContent(html); await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(out, name) });
  console.log('Wrote ' + path.join(out, name));
}
await browser.close();
