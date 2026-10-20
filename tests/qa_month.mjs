// 2.10: the month name in the month bar opens a month picker: two wheels (month and year) in a sheet, "Show <month>",
// and "This month" when another month is on screen. Keyboard, screen reader labels, Back and Esc, every tab with the
// month bar, light and dark at 360px with larger text.
import { suite, session, sampleStorage, K, T, LS, axe, noSideScroll } from './lib.mjs';
const { check, finish } = suite('2.10: choosing a month');
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const focused = p => p.evaluate(() => document.activeElement && (document.activeElement.id || document.activeElement.textContent));
const chosen = (p, id) => p.$eval('#' + id + ' [aria-selected="true"]', o => o.textContent);
const open = async p => { await p.click('#monthPick'); await p.waitForTimeout(150); };

let { ctx, p } = await session({ storage: sampleStorage(true) });
const start = await T(p, '#monthLabel'), [m0, y0] = start.split(' ');
check('The month name is a button that opens a dialog, inside the page\'s only h1', (await p.textContent('#monthPick')) === start && (await p.getAttribute('#monthPick', 'aria-haspopup')) === 'dialog' &&
  (await p.$$eval('h1', l => l.filter(h => h.offsetParent).length)) === 1 && await p.$eval('#monthPick', b => b.closest('h1') !== null && b.tagName === 'BUTTON'));
check('…described as "Choose a month" for screen readers (a hidden description, so it isn\'t read twice), without changing the heading\'s text', (await p.$eval('#monthPickHint', e => e.textContent)) === 'Choose a month' && await p.$eval('#monthPickHint', e => e.hidden) && (await p.$eval('#monthBar h1', h => h.innerText.replace(/\s+/g, ' ').trim())) === start + ' Pay month');
check('…at least 44px tall', await p.$eval('#monthPick', b => b.getBoundingClientRect().height >= 44));
await open(p);
check('Tapping it opens "Choose a month", with focus on the title', await p.isVisible('#sheet') && (await T(p, '#sheetH')) === 'Choose a month' && (await focused(p)) === 'sheetH');
check('…two wheels, labelled Month and Year, on the month on screen', (await p.getAttribute('#pickMonth', 'role')) === 'listbox' && (await p.$eval('#pickMonth', w => document.getElementById(w.getAttribute('aria-labelledby')).textContent)) === 'Month' &&
  (await p.$eval('#pickYear', w => document.getElementById(w.getAttribute('aria-labelledby')).textContent)) === 'Year' && (await chosen(p, 'pickMonth')) === m0 && (await chosen(p, 'pickYear')) === y0);
check('…every month in the month wheel, and "Show <month>"', (await p.$$eval('#pickMonth [role=option]', l => l.map(o => o.textContent))).join() === MN.join() && (await p.textContent('#pickGo')) === 'Show ' + start);
const years = await p.$$eval('#pickYear [role=option]', l => l.map(o => Number(o.textContent)));
const savedYears = Object.keys(await LS(p, K.mon)).map(k => Number(k.slice(0, 4)));
check('…years from the earliest saved month (or last year) to two years ahead', years[0] === Math.min(2025, ...savedYears) && years[years.length - 1] === 2028 && years.every((y, i) => !i || y === years[i - 1] + 1), years.join());
check('…with the chosen ones in the middle band', await p.$$eval('.wheel', ws => ws.every(w => { const o = w.querySelector('[aria-selected="true"]').getBoundingClientRect(), b = document.querySelector('.wheel-band').getBoundingClientRect(); return Math.abs((o.top + o.bottom) / 2 - (b.top + b.bottom) / 2) < 3; })));
check('No "This month" button when this month is already on screen', (await p.$('#pickNow')) === null);
check('No axe violations with the picker open', (await axe(p)).length === 0, (await axe(p)).join(' | '));
// Keyboard
await p.keyboard.press('Tab');
check('Keyboard: Tab from the title reaches the month wheel, then the year wheel', (await focused(p)) === 'pickMonth' && (await p.keyboard.press('Tab'), await focused(p)) === 'pickYear');
await p.focus('#pickMonth'); await p.keyboard.press('End'); await p.waitForTimeout(80);
check('End: December', (await chosen(p, 'pickMonth')) === 'December' && (await p.getAttribute('#pickMonth', 'aria-activedescendant')) === 'pickMonth_11');
await p.keyboard.press('ArrowDown'); await p.waitForTimeout(80);
check('…and the wheel stops at the end', (await chosen(p, 'pickMonth')) === 'December');
await p.keyboard.press('Home'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(80);
await p.focus('#pickYear'); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(200);
check('Home, Down, Down and the year Up: March, last year', (await chosen(p, 'pickMonth')) === 'March' && (await chosen(p, 'pickYear')) === String(Number(y0) - 1) && (await p.textContent('#pickGo')) === 'Show March ' + (Number(y0) - 1));
check('…the wheel scrolled so March sits in the band', await p.$eval('#pickMonth', w => { const o = w.querySelector('[aria-selected="true"]').getBoundingClientRect(), b = document.querySelector('.wheel-band').getBoundingClientRect(); return Math.abs((o.top + o.bottom) / 2 - (b.top + b.bottom) / 2) < 3; }));
await p.keyboard.press('Enter'); await p.waitForTimeout(250);
check('Enter shows that month and closes the picker, with focus back on the month name', (await T(p, '#monthLabel')) === 'March ' + (Number(y0) - 1) && !(await p.isVisible('#sheet')) && (await focused(p)) === 'monthPick');
// "This month"
await open(p);
check('Another month on screen: "This month" is offered', await p.isVisible('#pickNow') && (await p.textContent('#pickNow')) === 'This month');
await p.click('#pickNow'); await p.waitForTimeout(250);
check('…and goes straight back', (await T(p, '#monthLabel')) === start && !(await p.isVisible('#sheet')));
// Tapping options
await open(p);
await p.click('#pickYear [role=option]:text-is("' + (Number(y0) + 1) + '")'); await p.click('#pickMonth_0'); await p.waitForTimeout(400);
check('Tapping options picks them', (await chosen(p, 'pickYear')) === String(Number(y0) + 1) && (await chosen(p, 'pickMonth')) === 'January' && (await p.textContent('#pickGo')) === 'Show January ' + (Number(y0) + 1));
await p.click('#pickGo'); await p.waitForTimeout(250);
check('"Show January" shows it', (await T(p, '#monthLabel')) === 'January ' + (Number(y0) + 1));
// A scroll that isn't the user's (a screen reader moving through the options scrolls the wheel too) changes nothing.
await open(p);
await p.$eval('#pickMonth', w => { w.scrollTop = 5 * w.querySelector('[role=option]').getBoundingClientRect().height; }); await p.waitForTimeout(400);
check('A scroll that isn\'t the user\'s (a screen reader exploring) doesn\'t change the choice', (await chosen(p, 'pickMonth')) === 'January');
// Scrolling a wheel by hand (here the mouse wheel) picks what settles in the middle.
await p.$eval('#pickMonth', w => { w.scrollTop = 0; }); await p.waitForTimeout(200);
const wb = await p.$eval('#pickMonth', w => { const r = w.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: w.querySelector('[role=option]').getBoundingClientRect().height }; });
await p.mouse.move(wb.x, wb.y); await p.mouse.wheel(0, 5 * wb.h); await p.waitForTimeout(600);
check('Scrolling the month wheel by hand picks the month that settles in the middle (June)', (await chosen(p, 'pickMonth')) === 'June' && (await p.textContent('#pickGo')) === 'Show June ' + (Number(y0) + 1), await chosen(p, 'pickMonth'));
// Back and Esc close it without changing anything.
await p.goBack(); await p.waitForTimeout(300);
check('The phone\'s Back closes it and changes nothing', !(await p.isVisible('#sheet')) && (await T(p, '#monthLabel')) === 'January ' + (Number(y0) + 1) && await p.isVisible('#tab-pay'));
await open(p); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
check('Esc closes it too, with focus back on the month name', !(await p.isVisible('#sheet')) && (await focused(p)) === 'monthPick');
// Pay typed just before is kept.
await open(p); await p.click('#pickNow'); await p.waitForTimeout(250);
await p.fill('#pay_alex', '2123.45');
await open(p); await p.focus('#pickMonth'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
const mon = await LS(p, K.mon), k0 = Object.keys(mon).find(k => mon[k].pay && mon[k].pay.alex === 2123.45);
check('Pay typed just before choosing another month is saved in its own month', !!k0 && (await T(p, '#monthLabel')) !== start);
// Analysis and Reminders have the month bar too.
for (const t of ['analysis', 'due']) {
  await p.click('#t-' + t); await p.waitForTimeout(250);
  await open(p); await p.focus('#pickMonth'); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(80);
  const want = (await p.textContent('#pickGo')).replace('Show ', '');
  await p.click('#pickGo'); await p.waitForTimeout(300);
  check('It works on ' + (t === 'due' ? 'Reminders' : 'Analysis') + ', which stays on screen', (await T(p, '#monthLabel')) === want && await p.isVisible('#tab-' + t));
}
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Smaller text: the options are still 44px tall.
const st = sampleStorage(true); st[K.cfg] = Object.assign({}, st[K.cfg], { appearance: { theme: 'light', textSize: 'small' } });
({ ctx, p } = await session({ storage: st, w: 360 }));
await open(p);
check('Smaller text: the options are still at least 44px tall, and the chosen ones sit in the band', (await p.getAttribute('html', 'data-text')) === 'small' && await p.$$eval('.wheel-o', l => l.every(o => o.getBoundingClientRect().height >= 44)) &&
  await p.$$eval('.wheel', ws => ws.every(w => { const o = w.querySelector('[aria-selected="true"]').getBoundingClientRect(), b = document.querySelector('.wheel-band').getBoundingClientRect(); return Math.abs((o.top + o.bottom) / 2 - (b.top + b.bottom) / 2) < 3; })));
await ctx.close();

// With motion (smooth scrolling): quick key presses and taps still end with the band, the choice and "Show" agreeing.
({ ctx, p } = await session({ storage: sampleStorage(true), reducedMotion: 'no-preference' }));
await open(p); await p.focus('#pickMonth');
for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowDown');
await p.waitForTimeout(800);
const inBand = () => p.$$eval('.wheel', ws => ws.every(w => { const o = w.querySelector('[aria-selected="true"]').getBoundingClientRect(), b = document.querySelector('.wheel-band').getBoundingClientRect(); return Math.abs((o.top + o.bottom) / 2 - (b.top + b.bottom) / 2) < 3; }));
const want3 = MN[(MN.indexOf(m0) + 3) > 11 ? 11 : MN.indexOf(m0) + 3];
check('With motion: three quick Down presses move three months, settled in the band', (await chosen(p, 'pickMonth')) === want3 && await inBand() && (await p.textContent('#pickGo')) === 'Show ' + want3 + ' ' + y0, await chosen(p, 'pickMonth'));
await p.click('#pickMonth_1'); await p.waitForTimeout(800);
check('With motion: a tap scrolls the option into the band and picks it', (await chosen(p, 'pickMonth')) === 'February' && await inBand() && (await p.textContent('#pickGo')) === 'Show February ' + y0);
await p.click('#pickGo'); await p.waitForTimeout(500);
check('…and Show goes there', (await T(p, '#monthLabel')) === 'February ' + y0);
check('No JS errors (with motion)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Dark, 360px, larger text
const s = sampleStorage(true); s[K.cfg] = Object.assign({}, s[K.cfg], { appearance: { theme: 'dark', textSize: 'large' } });
({ ctx, p } = await session({ storage: s, w: 360, dark: true }));
await open(p);
check('Dark, 360px, larger text: the picker fits, with no sideways scrolling', await noSideScroll(p, 360) && await p.$eval('#sheet', sh => [...sh.querySelectorAll('.wheel-col, .btn')].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= 360; })) &&
  (await p.getAttribute('html', 'data-text')) === 'large');
check('…the options are at least 44px tall', await p.$$eval('.wheel-o', l => l.every(o => o.getBoundingClientRect().height >= 44)));
check('…and the chosen ones still sit in the band', await p.$$eval('.wheel', ws => ws.every(w => { const o = w.querySelector('[aria-selected="true"]').getBoundingClientRect(), b = document.querySelector('.wheel-band').getBoundingClientRect(); return Math.abs((o.top + o.bottom) / 2 - (b.top + b.bottom) / 2) < 3; })));
check('No axe violations (dark, larger text)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await ctx.close();

await finish();
