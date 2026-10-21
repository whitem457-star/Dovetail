// 2.2 Pay tab changes: other income under the pay boxes, plus signs on the float cards, the "Not every month" card
// with its link to a "Not monthly" filter in Settings › Bills, and dismissing the undo bar (×, swipe, Escape).
import fs from 'fs';
import { suite, session, sampleStorage, household, K, T, LS, goMonth, swipe, centre, axe, openDetails, noSideScroll, PAGE } from './lib.mjs';
const { check, finish } = suite('Pay tab (2.2)');

let { ctx, p } = await session({ storage: sampleStorage(true), w: 360, h: 800, touch: true });
// ---------- other income under the pay boxes ----------
const extra = () => p.$$eval('#payExtra .extras button', b => b.map(x => [x.querySelector('.n').textContent, x.querySelector('.w').textContent, x.querySelector('.v').textContent]));
let ex = await extra();
check('Other income is listed under the pay boxes', JSON.stringify(ex) === JSON.stringify([['Child Benefit', 'into Joint bills account', '+ £102.40'], ['Grandparent (Junior ISA gift)', 'into Joint spending account', '+ £25.00']]), JSON.stringify(ex));
check('…in smaller type than the pay boxes, amounts in the accent colour', await p.evaluate(() => {
  const n = document.querySelector('#payExtra .n'), inp = document.querySelector('#payGrid input'), v = document.querySelector('#payExtra .v');
  const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(); const probe = document.createElement('i'); probe.style.color = acc; document.body.appendChild(probe); const want = getComputedStyle(probe).color; probe.remove();
  return parseFloat(getComputedStyle(n).fontSize) < parseFloat(getComputedStyle(inp).fontSize) && getComputedStyle(v).color === want; }));
check('…and nothing in it can be edited', (await p.$$('#payExtra input, #payExtra select, #payExtra textarea')).length === 0);
// a one-off income this month shows too
await openDetails(p);
await p.click('#addOneOff'); await p.selectOption('#oo_kind_new', 'in'); await p.selectOption('#oo_acct_new', 'jspend'); await p.fill('#oo_name_new', 'Refund'); await p.fill('#oo_amt_new', '60'); await p.click('#oo_add'); await p.waitForTimeout(150);
ex = await extra();
check('One-off income for the month is listed, marked as a one-off', ex.some(x => x[0] === 'Refund' && x[1] === 'into Joint spending account, one-off' && x[2] === '+ £60.00'), JSON.stringify(ex));
await p.locator('#payExtra button', { hasText: 'Child Benefit' }).click(); await p.waitForTimeout(200);
check('Tapping a regular income opens Settings › Other income with that item', await p.isVisible('#tab-settings') && await p.$eval('#sIncome', d => d.open) &&
  await p.evaluate(() => { const a = document.activeElement; return !!a && a.id.startsWith('in_') && a.querySelector('input').value === 'Child Benefit'; }));
check('…and it is on screen', await p.evaluate(() => { const r = document.activeElement.getBoundingClientRect(), m = document.getElementById('main').getBoundingClientRect(); return r.top >= m.top && r.bottom <= m.bottom; }));
await p.click('#t-pay'); await p.waitForTimeout(100);
await p.locator('#payExtra button', { hasText: 'Refund' }).click(); await p.waitForTimeout(150);
check('Tapping a one-off opens it in the one-offs card', await p.evaluate(() => { const b = document.activeElement; return b && b.getAttribute('aria-expanded') === 'true' && b.textContent.includes('Refund'); }) && await p.isVisible('#oneOffs .ed'));

// ---------- plus signs on the float cards ----------
const rows = await p.$$eval('#floatCards .rows .row', r => r.map(x => ({ k: x.querySelector('.k').textContent, v: x.querySelector('.v').textContent, cls: x.className, col: getComputedStyle(x.querySelector('.v')).color })));
const ins = rows.filter(r => r.cls.includes(' in')), outs = rows.filter(r => !r.cls.includes(' in'));
check('"Arrives from" rows show a plus sign', rows.some(r => r.k === 'Arrives from Joint bills account' && r.v.startsWith('+ £') && r.cls.includes(' in')), JSON.stringify(rows.slice(0, 3)));
check('Every incoming row has "+ £" and the same accent colour', ins.length >= 3 && ins.every(r => r.v.startsWith('+ £')) && new Set(ins.map(r => r.col)).size === 1, JSON.stringify(ins));
check('Outgoing rows are unchanged: muted, "− £"', outs.length > 5 && outs.every(r => r.v.startsWith('− £') && r.cls.includes('sub')) && outs[0].col !== ins[0].col);

// ---------- Not every month ----------
await p.click('#oneOffs .ed .btn.ghost');
const nm = () => p.$eval('#due', e => e.innerText);
let t = await nm();
check('The card is called "Not every month"', (await p.$eval('#dueH', e => e.textContent)) === 'Not every month');
check('This month only: November has Council Tax and TV Licence with their accounts, and the total beside the title', /Council Tax\s+From Joint bills account\s+£198\.00\s+TV Licence\s+From Joint bills account\s+£43\.64/.test(t) && (await p.textContent('#dueTotal')) === '£241.64', t);
check('No "Coming up" any more (December\'s Kestrel home isn\'t listed in November)', !t.includes('Coming up') && !t.includes('Kestrel') && !t.includes('December'), t);
check('…and the link to all bills that aren\'t monthly stays', await p.isVisible('#nmAll'));
check('No crossed-out chips anywhere (and none on the Pay tab)', (await p.$$('#tab-pay .chip, .chip.off')).length === 0 && !(await p.evaluate(() => document.body.innerHTML.includes('line-through'))));
await goMonth(p, 'February 2027'); t = await nm();
check('February: just TV Licence (no Council Tax); one bill, so no separate total', t.includes('TV Licence') && !t.includes('Council Tax') && (await p.textContent('#dueTotal')) === '', t);
await goMonth(p, 'March 2027'); t = await nm();
check('March: "Nothing extra this month."', t.includes('Nothing extra this month.'), t);
await goMonth(p, 'November 2026');
await p.click('#nmAll'); await p.waitForTimeout(200);
const shown = await p.$$eval('#billList .bill > button span:first-child', s => s.map(x => x.textContent));
check('"See all bills that aren\'t monthly" opens Settings › Bills filtered to them', await p.$eval('#sBills', d => d.open) && (await p.getAttribute('#billNotMonthly', 'aria-pressed')) === 'true' && JSON.stringify(shown.sort()) === JSON.stringify(['Council Tax', 'Kestrel home', 'TV Licence']), JSON.stringify(shown));
check('…the filter is a visible chip next to the search box', await p.isVisible('#billNotMonthly') && (await p.textContent('#billNotMonthly')) === 'Not monthly');
await p.fill('#billSearch', 'tv'); await p.waitForTimeout(80);
check('Search works inside the filter', JSON.stringify(await p.$$eval('#billList .bill > button span:first-child', s => s.map(x => x.textContent))) === '["TV Licence"]');
await p.fill('#billSearch', 'mortgage'); await p.waitForTimeout(80);
check('…with a clear message when nothing matches', (await T(p, '#billList')).includes("No bills match “mortgage” among the bills that aren't monthly."));
await p.fill('#billSearch', ''); await p.click('#billNotMonthly'); await p.waitForTimeout(80);
check('Turning the chip off shows every bill again', (await p.$$('#billList .bill')).length === (await LS(p, K.cfg)).bills.length && (await p.getAttribute('#billNotMonthly', 'aria-pressed')) === 'false');
check('No axe violations on Settings with the filter chip', (await axe(p)).length === 0);

// ---------- undo bar: ×, swipe, Escape ----------
const del = async name => { const b = p.locator('#billList .bill > button', { hasText: name }).first(); await b.click(); await p.waitForTimeout(50);
  await p.click('#billList .bill .ed .btn.danger'); await p.click('#billList .bill .ed .btn.danger'); await p.waitForTimeout(120); };
const names = async () => (await LS(p, K.cfg)).bills.map(b => b.name);
await del('Spotify');
check('The undo bar has a Dismiss (×) button', await p.isVisible('#undoX') && (await p.getAttribute('#undoX', 'aria-label')) === 'Dismiss');
check('No axe violations with the undo bar showing', (await axe(p)).length === 0);
await p.focus('#undoX'); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
check('× dismisses it and the delete stands', await p.isHidden('#undoBar') && !(await names()).includes('Spotify'));
check('…focus moves to the tab bar, not lost', await p.evaluate(() => document.activeElement && document.activeElement.id === 't-settings'));
await del('Netflix');
let c = await centre(p, '#undoMsg');
await swipe(p, c.x, c.y, c.x + 20, c.y);
check('A short sideways drag doesn\'t dismiss it', await p.isVisible('#undoBar'));
c = await centre(p, '#undoMsg');
await swipe(p, c.x, c.y, c.x + 90, c.y + 4);
check('Swiping right more than 40px dismisses it; the delete stands', await p.isHidden('#undoBar') && !(await names()).includes('Netflix'));
await del('Disney+'); c = await centre(p, '#undoMsg');
await swipe(p, c.x, c.y, c.x - 70, c.y);
check('Swiping left dismisses it too', await p.isHidden('#undoBar') && !(await names()).includes('Disney+'));
await del('Water'); c = await centre(p, '#undoBtn');
await swipe(p, c.x, c.y, c.x + 60, c.y);
check('A swipe that starts on the Undo button dismisses rather than undoes', await p.isHidden('#undoBar') && !(await names()).includes('Water'));
await del('Lumen'); await p.tap('#undoBtn'); await p.waitForTimeout(120);
check('A tap on Undo still undoes', (await names()).includes('Lumen') && await p.isHidden('#undoBar'));
await del('Lumen'); await p.mouse.move(5, 5); await p.waitForTimeout(6300);
check('It still goes away by itself after 6 seconds', await p.isHidden('#undoBar') && !(await names()).includes('Lumen'));
await del('Kite Alex'); await p.focus('#undoBtn'); await p.keyboard.press('Escape'); await p.waitForTimeout(80);
check('Escape dismisses it from the keyboard', await p.isHidden('#undoBar') && !(await names()).includes('Kite Alex'));
await del('Kite Sam'); await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.keyboard.press('Escape'); await p.waitForTimeout(80);
check('…wherever the focus is', await p.isHidden('#undoBar') && !(await names()).includes('Kite Sam'));
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- "What's new" only after an update ----------
({ ctx, p } = await session());
await p.click('#su_example'); await p.waitForTimeout(200);
check('The example household doesn\'t show "What\'s new"', await p.isHidden('#whatsNew'));
await ctx.close();
({ ctx, p } = await session());
await p.click('#su_start'); await p.click('#su_later'); await p.waitForTimeout(200);
check('A new install doesn\'t show "What\'s new"', await p.isVisible('#tab-pay') && await p.isHidden('#whatsNew'));
await p.reload(); await p.waitForTimeout(250);
check('…nor on its next start', await p.isHidden('#whatsNew'));
await ctx.close();

// ---------- What's new keyed by version (2.13) ----------
// The lines and the choice of versions come from ui.js (WHATS_NEW, whatsNewVersions; unit/whatsnew.test.mjs tests the
// choice), so these checks hold from release to release: what's on screen, in what order, under which headings.
const VER = /var VERSION="([\d.]+)"/.exec(fs.readFileSync(PAGE, 'utf8'))[1];
const uiSrc = fs.readFileSync(new globalThis.URL('../web/src/ui.js', import.meta.url), 'utf8');
const calcSrc = fs.readFileSync(new globalThis.URL('../web/src/calc.js', import.meta.url), 'utf8'), vb0 = calcSrc.indexOf('function versionBefore(');
const WN = new Function(calcSrc.slice(vb0, calcSrc.indexOf('\n', calcSrc.indexOf('\n', vb0) + 1)) + '\n' + uiSrc.slice(uiSrc.indexOf("/* What's new, by version"), uiSrc.indexOf("/* Each version's lines in a list")) + '\nreturn { WHATS_NEW, whatsNewVersions };')();
const wnHome = from => ({ [K.cfg]: household({ lastVersion: from, payday: { day: 28, weekend: true },
  people: [{ id: 'a', name: 'Alex', payAccount: 'x', usualPay: 2000 }], accounts: [{ id: 'x', name: 'Current', colour: 'blue', leftoverTo: null }],
  bills: [{ id: 'b1', name: 'Rent', amount: 800, account: 'x', months: [] }] }) });
const wnSeen = sel => p.$eval(sel, box => ({ heads: [...box.querySelectorAll('b')].map(b => b.textContent), lines: [...box.querySelectorAll('li')].map(l => l.textContent), text: box.textContent }));
for (const from of ['2.11', '2.12']) {
  const vs = WN.whatsNewVersions(WN.WHATS_NEW, from, VER);
  ({ ctx, p } = await session({ storage: wnHome(from) }));
  const seen = await wnSeen('#whatsNew');
  check(`What's new after updating from ${from}: titled for ${VER}, then ${vs.join(' and ')}, newest first` + (vs.length > 1 ? ', each under its own heading' : ', with no heading of its own'),
    vs[0] === VER && JSON.stringify(seen.heads) === JSON.stringify(["What's new in " + VER].concat(vs.length > 1 ? vs.map(v => 'In ' + v) : [])) &&
    JSON.stringify(seen.lines) === JSON.stringify(vs.flatMap(v => WN.WHATS_NEW[v])), JSON.stringify(seen));
  check('…a group named for screen readers', (await p.getAttribute('#whatsNew .banner', 'role')) === 'group' && (await p.getAttribute('#whatsNew .banner', 'aria-label')) === "What's new in Dovetail " + VER);
  await p.click('#whatsNewOk'); await p.waitForTimeout(60);
  check('…"Got it" closes it and puts focus on the Pay heading', await p.isHidden('#whatsNew') && (await p.evaluate(() => document.activeElement && document.activeElement.id)) === 'payH');
  await ctx.close();
}
// Opened after going back to an older version: nothing to say, so no empty card.
({ ctx, p } = await session({ storage: wnHome('9.9') }));
check('No What\'s new card when the version last opened is newer than this one', await p.isHidden('#whatsNew') && (await LS(p, K.cfg)).lastVersion === VER);
await ctx.close();
// About › What changed: the last three versions with lines, newest first, each under its heading.
({ ctx, p } = await session({ storage: wnHome(VER) }));
check('(No What\'s new when nothing has changed)', await p.isHidden('#whatsNew'));
await p.click('#t-settings'); await p.waitForTimeout(150); await p.click('#whatChanged summary'); await p.waitForTimeout(60);
const last3 = WN.whatsNewVersions(WN.WHATS_NEW, null, VER).slice(0, 3), about = await wnSeen('#whatChanged');
check('About › What changed: the last versions\' lines (' + last3.join(', ') + '), each under "In …", and where the rest are',
  JSON.stringify(about.heads) === JSON.stringify(last3.map(v => 'In ' + v)) && JSON.stringify(about.lines) === JSON.stringify(last3.flatMap(v => WN.WHATS_NEW[v])) &&
  about.text.includes("Earlier versions aren't listed here.") && !about.text.includes('Only this version'), JSON.stringify(about));
check('No JS errors (What\'s new)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
// The longest card (from 2.11) in dark, at 360px, with larger text.
({ ctx, p } = await session({ storage: wnHome('2.11'), w: 360, h: 740, dark: true }));
await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large')); await p.waitForTimeout(100);
check('What\'s new from 2.11, dark, 360px, larger text: no sideways scrolling', await noSideScroll(p, 360));
let wnAx = await axe(p); check('Accessibility: What\'s new from 2.11 (dark, 360px, larger text)', wnAx.length === 0, wnAx.join(' | '));
await ctx.close();
({ ctx, p } = await session({ storage: wnHome('2.11'), w: 360, h: 740 }));
wnAx = await axe(p); check('Accessibility: What\'s new from 2.11 (light, 360px)', wnAx.length === 0, wnAx.join(' | '));
await ctx.close();

// ---------- empty states ----------
({ ctx, p } = await session({ storage: { [K.cfg]: household({ schema: 5, people: [{ id: 'a', name: 'A', payAccount: 'x', usualPay: 1000 }], accounts: [{ id: 'x', name: 'Current', colour: 'blue', leftoverTo: null }],
  bills: [{ id: 'b1', name: 'Rent', amount: 500, account: 'x', months: [] }] }) } }));
check('Nothing coming in besides pay: the list is hidden', await p.isHidden('#payExtra'));
check('All bills monthly: the card says so', (await p.$eval('#due', e => e.textContent)).includes('Every bill is paid monthly'));
check('…and the float card has only the pay coming in', JSON.stringify(await p.$$eval('#floatCards .row.in .v', v => v.map(x => x.textContent))) === '["+ £1,000.00"]');
check('No JS errors (empty states)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
await finish();
