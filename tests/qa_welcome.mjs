// 2.18: the welcome (setup's first step, docs/welcome.md). A brand line, the headline, one line, a picture of a finished
// payday whose figures add up, a trust line, the same three ways in and a setup note; no step counter (setup counts six
// steps from pay). With figures arriving (an opened file, an automatic backup, Start again) the picture is left out so
// their card comes first. Only the made-up household (SAMPLE) is used, as the backup being offered.
import { suite, session, sampleStorage, SAMPLE, K, T, axe, noSideScroll, SETUP_FILL } from './lib.mjs';
const { check, finish } = suite('2.18: the welcome');

const TITLE = 'Payday, without the guesswork';
const LEAD = 'Every bill, the account it leaves from, and the transfers to cover them, all in one place.';
const CAPTION = "An example. If pay won't stretch, Dovetail says which account will be short.";
const NOTE = 'About five minutes to set up, and you can change anything later. A rough figure is fine for bills.';
const SR = 'An example payday. £3,000 pay arrives. Transfer 1: move £1,400 to the Bills account, which pays rent, council tax, energy and 2 more bills. ' +
  'Transfer 2: move £800 to the Everyday account, which pays the phone and the gym. Transfer 3: move £300 to Savings. £500 is left over, yours to spend. All 7 bills are covered.';
const TRUST = ['Any bank', 'No bank login', 'No internet'];
const ROWS = [['Bills account', '£1,400', ['Rent', 'Council tax', 'Energy', '+2']], ['Everyday account', '£800', ['Phone', 'Gym']], ['Savings', '£300', []]];
const LIGHT = 'rgb(241, 244, 242)', DARK = 'rgb(10, 17, 14)';
const BACKUP = JSON.stringify(SAMPLE);
const NATIVE_BACKUP = { 'qa.native': { backups: [{ name: 'backup-20261014-090000.json', savedAt: '2026-10-14T09:00:00', json: BACKUP }], calls: [], lockOn: false, lockAvail: true, n: 0 } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const norm = s => String(s || '').replace(/\s+/g, ' ').trim();
const pounds = s => Number(String(s).replace(/[£,]/g, ''));
const focusId = p => p.evaluate(() => document.activeElement && document.activeElement.id);
const bg = p => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
const send = (p, v, ok) => p.evaluate(([v, ok]) => window.paydayNativeEvent('import', v, ok), [v, ok]);
/** The step counters shown in setup ("Step n of N") and the dots (how many, how many on). */
const counters = (p, box = '#setup') => p.$eval(box, b => ({ text: (b.innerText.match(/Step \d+ of \d+/g) || []), dots: [...b.querySelectorAll('.steps-dots i')].length,
  on: [...b.querySelectorAll('.steps-dots i.on')].length }));

/** Everything the picture shows, read from the screen. */
const picture = p => p.evaluate(() => {
  const f = document.getElementById('su_pic'); if (!f) return null;
  const vis = e => !!e && e.getClientRects().length > 0, txt = e => (e ? e.textContent : '').replace(/\s+/g, ' ').trim();
  // The first amount in the card (outside the screen-reader sentence and the caption) is the pay.
  const walker = document.createTreeWalker(f, NodeFilter.SHOW_TEXT); let pay = null, payRow = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { const el = n.parentElement;
    if (el.closest('.sr, figcaption, li.su-pic-tr')) continue; const m = /£[\d,]+/.exec(n.textContent); if (m) { pay = m[0]; payRow = el; break; } }
  let row = payRow; while (row && row.parentElement !== f && !/Pay in/.test(row.textContent)) row = row.parentElement;
  return {
    tag: f.tagName, cls: f.classList.contains('su-pic'), visible: vis(f), pay, payRow: row ? txt(row) : '',
    rows: [...f.querySelectorAll('li.su-pic-tr')].map(li => ({ text: txt(li), amount: ((/£[\d,]+/.exec(li.textContent)) || [''])[0],
      chips: [...li.querySelectorAll('.su-pic-chip')].map(c => ({ t: txt(c), more: c.classList.contains('more') })) })),
    left: txt(document.getElementById('su_pic_left')), covered: txt(document.getElementById('su_pic_covered')),
    sr: [...f.querySelectorAll('.sr')].map(txt), caption: [...f.querySelectorAll('figcaption')].map(txt),
    // The drawing: every child of the figure other than the sentence and the caption is hidden from screen readers.
    drawingHidden: [...f.children].filter(c => !c.matches('.sr, figcaption')).length > 0 &&
      [...f.children].filter(c => !c.matches('.sr, figcaption')).every(c => c.getAttribute('aria-hidden') === 'true'),
    srFirst: (() => { const s = f.querySelector('.sr'), d = [...f.children].find(c => !c.matches('.sr, figcaption')); return !!(s && d && (s.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING)); })(),
    svgsHidden: f.querySelectorAll('svg').length === 6 && [...f.querySelectorAll('svg')].every(s => s.closest('[aria-hidden="true"]')),
  };
});
/** The welcome's parts in page order (and whether they also run top to bottom on screen). */
const order = p => p.evaluate(() => {
  const parts = [['brand', '#setup .su-brand'], ['title', '#suTitle'], ['offer', '#setup #importOffer, #restoreOfferSetup:not(:empty)'], ['lead', '#setup .su-lead'],
    ['picture', '#su_pic'], ['trust', '#su_trust'], ['buttons', '#su_start'], ['links', '#su_later'], ['note', '#su_note']]
    .map(([n, s]) => [n, document.querySelector(s)]).filter(([, e]) => e && e.getClientRects().length);
  parts.sort((a, b) => a[1] === b[1] ? 0 : a[1].compareDocumentPosition(b[1]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
  const tops = parts.map(([, e]) => e.getBoundingClientRect().top);
  return { names: parts.map(([n]) => n).join(','), downwards: tops.every((t, i) => !i || t > tops[i - 1]) };
});
/** Text on screen in #setup that's cut off: past the window's edges, overflowing its own box, or outside a parent that
    hides overflow. The screen-reader sentence (.sr) is clipped on purpose and left out. */
const clipped = (p, w) => p.evaluate(w => {
  const out = [], name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  for (const e of document.querySelectorAll('#setup *')) {
    if (e.closest('.sr') || !e.getClientRects().length) continue;
    if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = e.getBoundingClientRect();
    if (r.left < -0.5 || r.right > w + 0.5) { out.push(name(e) + ' outside the window'); continue; }
    if (getComputedStyle(e).display !== 'inline' && e.scrollWidth > e.clientWidth + 1) out.push(name(e) + ' overflows its box');
    for (let a = e.parentElement; a && a.id !== 'setup'; a = a.parentElement) {
      const s = getComputedStyle(a); if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const ar = a.getBoundingClientRect();
      if (r.left < ar.left - 0.5 || r.right > ar.right + 0.5 || r.top < ar.top - 0.5 || r.bottom > ar.bottom + 0.5) { out.push(name(e) + ' cut off by ' + name(a)); break; }
    }
  }
  return out;
}, w);

// ---------- 1. A new install: the welcome ----------
let { ctx, p } = await session({ w: 360, h: 780 });
check('A new install opens on the welcome, titled "' + TITLE + '"', await p.isVisible('#tab-setup') && (await T(p, '#suTitle')) === TITLE && await p.$eval('#suTitle', e => e.tagName) === 'H1', await T(p, '#suTitle'));
check('The brand line (the mark and "Dovetail") comes directly before the title', await p.$eval('#suTitle', h => { const b = h.previousElementSibling;
  return !!b && b.classList.contains('su-brand') && b.textContent.trim() === 'Dovetail' && !!b.querySelector('svg.su-mark') && b.querySelector('svg.su-mark').getAttribute('aria-hidden') === 'true'; }));
check('…and the title is larger than the brand word', await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('suTitle')).fontSize) > parseFloat(getComputedStyle(document.querySelector('#setup .su-brand')).fontSize)));
check('The lead says what Dovetail does', norm(await T(p, '#setup p.su-lead')) === LEAD, await T(p, '#setup p.su-lead'));
const counts = await counters(p);
check('No step counter and no dots on the welcome', counts.text.length === 0 && counts.dots === 0 && (await p.$('#setup .steps-dots')) === null, JSON.stringify(counts));
let o = await order(p);
check('Top to bottom: brand line, title, lead, picture, trust line, buttons, Skip, the setup note', o.names === 'brand,title,lead,picture,trust,buttons,links,note' && o.downwards, JSON.stringify(o));
check('The three ways in and "Skip setup for now", unchanged', (await T(p, '#su_start')) === 'Set up my household' && (await T(p, '#su_restore summary')) === 'Restore from a backup' &&
  (await T(p, '#su_example')) === 'Explore an example' && (await T(p, '#su_later')) === 'Skip setup for now');
check('The setup note under them', norm(await T(p, '#su_note')) === NOTE && await p.isVisible('#su_note'), await T(p, '#su_note'));

// The picture.
const pic = await picture(p);
check('The picture is there: a figure (su-pic)', pic && pic.visible && pic.tag === 'FIGURE' && pic.cls, JSON.stringify(pic));
check('…pay of £3,000 into the Current account', pic.pay === '£3,000' && pic.payRow.includes('Pay in') && pic.payRow.includes('Current account'), JSON.stringify([pic.pay, pic.payRow]));
check('…three transfers in order: Bills account £1,400, Everyday account £800, Savings £300', pic.rows.length === 3 &&
  ROWS.every(([n, a], i) => pic.rows[i].text.includes('Move to') && pic.rows[i].text.includes(n) && pic.rows[i].amount === a), JSON.stringify(pic.rows.map(r => [r.text, r.amount])));
check('…each account\'s bills under its transfer: Rent, Council tax, Energy, +2; Phone, Gym; none for Savings', same(pic.rows.map(r => r.chips.map(c => c.t)), ROWS.map(r => r[2])) &&
  same(pic.rows.map(r => r.chips.filter(c => c.more).map(c => c.t)), [['+2'], [], []]), JSON.stringify(pic.rows.map(r => r.chips)));
check('…"£500" left over and "All 7 bills covered"', pic.left === '£500' && pic.covered === 'All 7 bills covered', JSON.stringify([pic.left, pic.covered]));
const sent = pic.rows.reduce((s, r) => s + pounds(r.amount), 0);
check('The figures on screen add up: pay − the transfers = left over', pounds(pic.pay) - sent === pounds(pic.left) && pounds(pic.left) > 0, `${pic.pay} − ${sent} vs ${pic.left}`);
const chips = pic.rows.flatMap(r => r.chips), more = chips.filter(c => c.more).reduce((s, c) => s + Number((/^\+(\d+)$/.exec(c.t) || [, NaN])[1]), 0);
const billCount = Number((/^All (\d+) bills covered$/.exec(pic.covered) || [, NaN])[1]);
check('…and the bills: the chips + the "+n" = the bills covered', chips.filter(c => !c.more).length + more === billCount && billCount === 7, `${chips.filter(c => !c.more).length} + ${more} vs ${billCount}`);
check('The drawing is hidden from screen readers (its ticks and icons too)', pic.drawingHidden && pic.svgsHidden);
check('…and one plain sentence before it says what it shows', pic.sr.length === 1 && pic.sr[0] === SR && pic.srFirst, JSON.stringify(pic.sr));
check('…which matches the card: every amount and the bill count in it', [pic.pay, ...pic.rows.map(r => r.amount), pic.left].every(a => pic.sr[0].includes(a)) &&
  pic.sr[0].includes(`All ${billCount} bills are covered`) && ROWS.every(([n]) => pic.sr[0].includes(n.replace(' account', ''))));
const snap = await p.locator('#su_pic').ariaSnapshot();
check('…so a screen reader hears the sentence and the caption, not the card\'s words', snap.includes('An example payday.') && snap.includes('An example. If pay') && !snap.includes('Move to') && !snap.includes('Pay in'), snap);
check('The figure has its caption', pic.caption.length === 1 && pic.caption[0] === CAPTION && await p.isVisible('#su_pic figcaption'), JSON.stringify(pic.caption));

// The trust line.
const trust = await p.$eval('#su_trust', u => ({ tag: u.tagName, items: [...u.children].map(li => [li.tagName, li.textContent.replace(/\s+/g, ' ').trim()]), label: u.getAttribute('aria-label'),
  icons: u.querySelectorAll('svg').length === 3 && [...u.querySelectorAll('svg')].every(s => s.closest('[aria-hidden="true"]')) }));
check('The trust line is a list of three: Any bank, No bank login, No internet', trust.tag === 'UL' && same(trust.items, TRUST.map(t => ['LI', t])), JSON.stringify(trust.items));
check('…with no aria-label, and its icons hidden from screen readers', trust.label === null && trust.icons);
check('…above "Set up my household"', await p.evaluate(() => { const t = document.getElementById('su_trust'), s = document.getElementById('su_start');
  return !!(t.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) && t.getBoundingClientRect().bottom <= s.getBoundingClientRect().top; }));
check('No axe violations (welcome, light)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('No JS errors (welcome)', p.errs.length === 0, p.errs.join(' | '));

// ---------- 2. Setup counts six steps from pay ----------
await p.click('#su_start'); await p.waitForTimeout(60);
for (let s = 2; s <= 7; s++) {
  const c = await counters(p);
  check(`Setup step ${s} reads "Step ${s - 1} of 6", with ${s - 1} of 6 dots on`, same(c, { text: [`Step ${s - 1} of 6`], dots: 6, on: s - 1 }), JSON.stringify(c) + ' ' + await T(p, '#suTitle'));
  if (s === 2) check('…with focus on its title', (await T(p, '#suTitle')) === 'Your pay' && (await focusId(p)) === 'suTitle');
  if (SETUP_FILL[s]) await SETUP_FILL[s](p);
  if (s === 2) { const inc = await T(p, 'section[aria-labelledby=su_h_inc]');
    check('The pay step\'s other income card says "in step 3"', inc.includes("You'll choose the account it goes into in step 3.") && !inc.includes('step 4'), inc); }
  if (s < 7) { await p.click('#su_next'); await p.waitForTimeout(40); }
}
check('…the last is "Your first payday", "Step 6 of 6"', (await T(p, '#suTitle')) === 'Your first payday' && same((await counters(p)).text, ['Step 6 of 6']));
await p.click('#su_back'); await p.waitForTimeout(40); for (let s = 6; s > 1; s--) { await p.click('#su_back'); await p.waitForTimeout(40); }
check('Back to the welcome: the picture and no counter again', (await T(p, '#suTitle')) === TITLE && await p.isVisible('#su_pic') && (await counters(p)).text.length === 0, await T(p, '#suTitle'));
check('No JS errors (the steps)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// Change how you manage your money still counts its own two steps.
({ ctx, p } = await session({ storage: sampleStorage(true) }));
await p.click('#t-settings'); await p.click('#sAccounts summary'); await p.click('#ac_change'); await p.waitForTimeout(100);
check('Change how you manage your money: still "Step 1 of 2"', (await p.textContent('#suTitle')) === 'Change how you manage your money' && same((await counters(p, '#chBox')).text, ['Step 1 of 2']), JSON.stringify(await counters(p, '#chBox')));
await p.click('#su_next'); await p.waitForTimeout(100);
if ((await p.textContent('#suTitle')) !== 'When does the change start?') { await p.check('#su_style_separate'); await p.click('#su_next'); await p.waitForTimeout(100); }
check('…and "Step 2 of 2"', (await p.textContent('#suTitle')) === 'When does the change start?' && same((await counters(p, '#chBox')).text, ['Step 2 of 2']), JSON.stringify(await counters(p, '#chBox')));
check('No JS errors (change)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 3. Arriving with figures: the card first, no picture ----------
const offerShape = async (what, sel) => {
  o = await order(p);
  check(`${what}: no picture`, (await p.$('#su_pic')) === null && (await p.$('#su_pic_left')) === null && !(await T(p, '#setup')).includes(CAPTION));
  check(`${what}: brand line, title, the card, lead, trust line, buttons`, o.names === 'brand,title,offer,lead,trust,buttons,links,note' && o.downwards && await p.isVisible(sel), JSON.stringify(o));
  check(`${what}: still no step counter, the note still there`, (await counters(p)).text.length === 0 && norm(await T(p, '#su_note')) === NOTE);
  check(`No axe violations (${what})`, (await axe(p)).length === 0, (await axe(p)).join(' | '));
};
// An automatic backup on a new install.
({ ctx, p } = await session({ native: true, w: 360, h: 640, storage: NATIVE_BACKUP }));
check('(set-up) an automatic backup is offered', (await T(p, '#restoreOfferSetup')).includes('Found an automatic backup from 14 Oct 2026, 09:00'));
await offerShape('An automatic backup offered', '#restoreOfferSetup .banner');
check('…with "Set up my household" in view at 360×640', await p.$eval('#su_start', b => b.getBoundingClientRect().bottom <= 640));
await p.click('#restoreOfferSetup .btn:has-text("Start fresh")'); await p.waitForTimeout(150);
o = await order(p);
check('"Start fresh": the offer goes and the picture comes back, in the usual order', (await T(p, '#restoreOfferSetup')) === '' && await p.isVisible('#su_pic') && o.names === 'brand,title,lead,picture,trust,buttons,links,note', JSON.stringify(o));
check('…with focus on the title', (await focusId(p)) === 'suTitle', await focusId(p));
check('No JS errors (automatic backup)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// A backup file opened on a new install.
({ ctx, p } = await session({ native: true, w: 360, h: 640 }));
await send(p, BACKUP, true); await p.waitForTimeout(200);
check('(set-up) an opened backup file is offered on the welcome', await p.isVisible('#tab-setup') && await p.isVisible('#setup #importOffer') && (await T(p, '#importOffer')).includes('Open this Dovetail backup?'));
await offerShape('An opened file offered', '#setup #importOffer');
check('…with "Set up my household" in view at 360×640', await p.$eval('#su_start', b => b.getBoundingClientRect().bottom <= 640));
await p.click('#importNo'); await p.waitForTimeout(150);
check('Cancel: the card goes and the picture comes back', (await p.$('#importOffer')) === null && await p.isVisible('#su_pic') && (await order(p)).names === 'brand,title,lead,picture,trust,buttons,links,note');
check('…with focus on the title (the button that had it is gone)', (await p.evaluate(() => document.activeElement && document.activeElement.id)) === 'suTitle');
check('No JS errors (opened file)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
// A file arriving while the picture is already on screen (the page had loaded first): the picture makes way.
({ ctx, p } = await session({ native: true }));
check('(set-up) the picture is on screen first', await p.isVisible('#su_pic'));
await send(p, BACKUP, true); await p.waitForTimeout(200);
check('A file opened with the welcome on screen: the card replaces the picture', await p.isVisible('#setup #importOffer') && (await p.$('#su_pic')) === null && (await order(p)).names === 'brand,title,offer,lead,trust,buttons,links,note');
await ctx.close();

// Start again.
({ ctx, p } = await session({ native: true, storage: sampleStorage(true) }));
await p.click('#t-settings'); await p.click('#sBackup summary'); await p.click('#startAgain'); await p.click('[data-confirm=startAgain]'); await p.waitForTimeout(250);
check('(set-up) Start again: "Bring back what you had before?"', (await T(p, '#suTitle')) === TITLE && (await T(p, '#restoreOfferSetup')).startsWith('Bring back what you had before?') && (await focusId(p)) === 'suTitle');
await offerShape('After Start again', '#restoreOfferSetup .banner');
await p.click('#restoreOfferSetup .btn:has-text("Start fresh")'); await p.waitForTimeout(150);
check('"Start fresh" after Start again: the picture comes back, with focus on the title', await p.isVisible('#su_pic') && (await T(p, '#restoreOfferSetup')) === '' && (await focusId(p)) === 'suTitle', await focusId(p));
check('No JS errors (Start again)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 4. Small screens ----------
({ ctx, p } = await session({ w: 360, h: 640 }));
let b = await p.$eval('#su_start', e => e.getBoundingClientRect().bottom);
check('360×640, normal text: "Set up my household" is fully in view without scrolling (bottom ≤ 640)', b <= 640 && await p.isVisible('#su_pic') && await p.evaluate(() => document.getElementById('main').scrollTop === 0 && scrollY === 0), 'bottom ' + b);
check('…no sideways scrolling, nothing cut off', await noSideScroll(p, 360) && (await clipped(p, 360)).length === 0, (await clipped(p, 360)).join(' | '));
await ctx.close();

const LARGE = { [K.cfg]: { schema: 5, appearance: { theme: 'system', textSize: 'large' } } };
for (const w of [320, 360]) {
  ({ ctx, p } = await session({ w, h: 640, storage: LARGE }));
  const cut = await clipped(p, w);
  check(`${w}×640 with the app's larger text: no sideways scrolling, nothing cut off`, (await p.getAttribute('html', 'data-text')) === 'large' && await p.isVisible('#su_pic') && await noSideScroll(p, w) && cut.length === 0, cut.join(' | '));
  check(`…the trust line's three items and the buttons all fit across (${w}px)`, await p.evaluate(w => ['#su_trust li', '#su_start', '#su_example', '#su_later', '#su_pic_covered', '#su_pic_left']
    .every(s => [...document.querySelectorAll(s)].every(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= w; })), w));
  check(`No axe violations (${w}px, larger text)`, (await axe(p)).length === 0, (await axe(p)).join(' | '));
  check(`No JS errors (${w}px, larger text)`, p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 5. Light, dark, and the app's theme against the phone's ----------
const LOOKS = [
  ['dark (the phone\'s)', { dark: true }, DARK, null],
  ['dark chosen on a light phone', { dark: false, storage: { [K.cfg]: { schema: 5, appearance: { theme: 'dark', textSize: 'normal' } } } }, DARK, 'dark'],
  ['light chosen on a dark phone', { dark: true, storage: { [K.cfg]: { schema: 5, appearance: { theme: 'light', textSize: 'normal' } } } }, LIGHT, 'light'],
];
for (const [what, opts, colour, attr] of LOOKS) {
  ({ ctx, p } = await session({ w: 360, h: 780, ...opts }));
  check(`(set-up) the welcome, ${what}`, await p.isVisible('#su_pic') && (await bg(p)) === colour && (await p.getAttribute('html', 'data-theme')) === attr, (await bg(p)) + ' ' + (await p.getAttribute('html', 'data-theme')));
  // In dark the card has a hairline edge instead of its shadow (both dark blocks in template.html); in light, the shadow.
  const edge = await p.$eval('.su-pic-card', c => getComputedStyle(c).boxShadow);
  check(`…the card's edge: ${colour === DARK ? 'a 1px line' : 'the light shadow'} (${what})`, /0px 0px 0px 1px/.test(edge) === (colour === DARK), edge);
  const v = await axe(p);
  check(`No axe violations (welcome, ${what})`, v.length === 0, v.join(' | '));
  check(`No JS errors (${what})`, p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

await finish();
