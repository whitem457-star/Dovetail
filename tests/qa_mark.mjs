// 2.11: the Dovetail mark in the page, on the first setup screen and in Settings › About. It's drawn in the chart
// colours so it follows the theme, hidden from screen readers (the name is beside it), and fits at 360px with larger text.
import { suite, session, sampleStorage, K, axe, noSideScroll } from './lib.mjs';
const { check, finish } = suite('2.11: the Dovetail mark');
const strokes = (p, sel) => p.$eval(sel, s => [...s.querySelectorAll(':scope > path')].map(x => getComputedStyle(x).stroke));
const hidden = (p, sel) => p.$eval(sel, s => s.getAttribute('aria-hidden') === 'true' && s.getAttribute('focusable') === 'false');
const rgb = h => 'rgb(' + [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')';
const LIGHT = ['#2a78d6', '#eda100', '#1baf7a', '#1baf7a'].map(rgb), DARK = ['#3987e5', '#c98500', '#199e70', '#199e70'].map(rgb);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// A new install: the welcome step shows the mark above "Welcome to Dovetail"; later steps don't.
let { ctx, p } = await session({});
check('Setup step 1 shows the mark above the title', await p.isVisible('#setup .su-mark') &&
  await p.$eval('#setup .su-mark', m => m.nextElementSibling && m.nextElementSibling.id === 'suTitle'));
check('…in the chart colours (light)', same(await strokes(p, '#setup .su-mark'), LIGHT), (await strokes(p, '#setup .su-mark')).join(' '));
check('…hidden from screen readers, and the title is still the heading', await hidden(p, '#setup .su-mark') && (await p.textContent('#suTitle')) === 'Welcome to Dovetail');
check('…with each stream clipped to its own half', await p.$eval('#setup .su-mark', s => [...s.querySelectorAll('path[clip-path]')].length === 2 &&
  [...s.querySelectorAll('path[clip-path]')].every(x => s.querySelector(x.getAttribute('clip-path').slice(4, -1)))));
check('No axe violations on the welcome step', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.click('#su_start'); await p.waitForTimeout(150);
check('Step 2 has no mark', !(await p.$('#setup .su-mark')));
check('No JS errors (setup)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Settings › About: the mark beside the name.
({ ctx, p } = await session({ storage: sampleStorage(false) }));
await p.click('#t-settings'); await p.waitForTimeout(200);
check('Settings › About starts with the mark and "Dovetail"', await p.$eval('#about > .about-brand', b => b.querySelector('svg.mark') !== null && b.textContent === 'Dovetail'));
check('…in the chart colours (light)', same(await strokes(p, '#about .mark'), LIGHT));
check('…hidden from screen readers', await hidden(p, '#about .mark'));
check('Two marks never share clip ids', await p.evaluate(() => { const ids = [...document.querySelectorAll('svg.mark clipPath')].map(c => c.id); return new Set(ids).size === ids.length; }));
check('No JS errors (About)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Dark, 360px, larger text.
const s = sampleStorage(false); s[K.cfg] = Object.assign({}, s[K.cfg], { appearance: { theme: 'dark', textSize: 'large' } });
({ ctx, p } = await session({ storage: s, w: 360, dark: true }));
await p.click('#t-settings'); await p.waitForTimeout(200);
await p.$eval('#about', a => a.scrollIntoView());
check('Dark: the mark uses the dark chart colours', same(await strokes(p, '#about .mark'), DARK), (await strokes(p, '#about .mark')).join(' '));
check('Dark, 360px, larger text: it fits, with no sideways scrolling', await noSideScroll(p, 360) && (await p.getAttribute('html', 'data-text')) === 'large' &&
  await p.$eval('#about .about-brand', b => { const r = b.getBoundingClientRect(), m = b.querySelector('.mark').getBoundingClientRect(); return r.right <= 360 && m.width >= 32 && m.height > m.width; }));
check('No axe violations (dark, larger text)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('No JS errors (dark)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

({ ctx, p } = await session({ w: 360, dark: true }));
check('Dark welcome step: dark chart colours', same(await strokes(p, '#setup .su-mark'), DARK));
check('No axe violations (dark welcome)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await ctx.close();

await finish();
