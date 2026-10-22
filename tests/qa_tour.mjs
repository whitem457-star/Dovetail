// 2.6: showing people around. The guided tour (after setup, and from Settings › Help or the example's banner), the
// "What's this?" help buttons and their sheet, Settings › Help, and the first-month hint on the Pay tab.
import { suite, session, sampleStorage, SAMPLE, K, T, LS, axe, noSideScroll, walkSetup, skipTour, swipe, household, openDetails } from './lib.mjs';
const { check, finish } = suite('Tour, help and hints');

const shown = p => p.isVisible('#tour');
const stopId = p => p.getAttribute('#tourCard', 'data-stop');
const focusId = p => p.evaluate(() => document.activeElement && document.activeElement.id);
const focusIn = (p, sel) => p.evaluate(s => !!document.querySelector(s).contains(document.activeElement), sel);
/** Where the stop's element is: it must be on screen, ringed, and clear of the card (the card never covers it; an element
    taller than the space between the month bar and the card shows its top part, ringed down to just above the card). */
const geo = p => p.evaluate(() => {
  const t = document.querySelector('[aria-describedby="tourT"]:not(#tourCard)'); if (!t) return { ok: false, why: 'nothing highlighted' };
  const r = t.getBoundingClientRect(), ring = document.getElementById('tourRing').getBoundingClientRect(), card = document.getElementById('tourCard').getBoundingClientRect();
  const m = document.getElementById('main'), mr = m.getBoundingClientRect(), bar = document.getElementById('monthBar'), inMain = m.contains(t) && t.id !== 'monthBar';
  const top = mr.top + (bar.hidden ? 0 : bar.offsetHeight), vh = window.innerHeight;
  const onScreen = inMain ? r.top >= top - 1 && r.top + 24 < card.top : r.top >= -1 && r.bottom <= vh + 1;
  const clear = inMain ? ring.bottom <= card.top + 1 : (r.bottom <= card.top + 1 || r.top >= card.bottom - 1);
  const ringed = ring.left <= r.left + 1 && ring.right >= r.right - 1 && ring.top <= Math.max(r.top, top) + 1 && ring.bottom >= Math.min(r.bottom, card.top - 12) - 1 && ring.height > 20;
  return { ok: onScreen && clear && ringed, id: t.id, onScreen, clear, ringed, r: [r.top, r.bottom].map(Math.round), ring: [ring.top, ring.bottom].map(Math.round), card: [card.top, card.bottom].map(Math.round) };
});
/** Walk the whole tour with Next, checking each stop; returns the stop ids in order. */
async function walk(p, tag, each) {
  const ids = []; let total = 0;
  for (let i = 0; i < 12 && await shown(p); i++) {
    const n = (await T(p, '#tourN')).split(' of '); total = Number(n[1]); ids.push(await stopId(p));
    if (each) await each(i, ids[i], n);
    const g = await geo(p);
    check(`${tag}: stop ${i + 1} (${ids[i]}) is on screen, ringed and clear of the card`, g.ok, JSON.stringify(g));
    await p.click('#tourNext'); await p.waitForTimeout(120);
  }
  return { ids, total };
}
const ALL = ['month', 'hero', 'pay', 'transfers', 'oneoffs', 'notevery', 'analysis', 'reminders', 'settings'];

// ---------- 1. After setup: every stop, in order, at 360px with larger text, light and dark ----------
for (const dark of [false, true]) {
  let { ctx, p } = await session({ w: 360, h: 760, dark });
  await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
  await walkSetup(p, 7); await p.click('#su_finish'); await p.waitForTimeout(300);
  const tag = `Larger text, 360px${dark ? ', dark' : ''}`;
  if (!dark) {
    check('"Looks right, start" starts the tour straight away, on the Pay tab, with no "All set" message', await shown(p) && await p.isVisible('#tab-pay') && !(await T(p, '#toast')).includes('All set'));
    check('The card is a modal dialog named by its title and described by its text', (await p.getAttribute('#tourCard', 'role')) === 'dialog' && (await p.getAttribute('#tourCard', 'aria-modal')) === 'true' &&
      (await p.getAttribute('#tourCard', 'aria-labelledby')) === 'tourH' && (await p.getAttribute('#tourCard', 'aria-describedby')) === 'tourT');
    check('First stop: the month bar, "1 of 9", focus on the title, no Back button', (await stopId(p)) === 'month' && (await T(p, '#tourN')) === '1 of 9' && (await T(p, '#tourH')) === 'Your pay month' &&
      (await focusId(p)) === 'tourH' && await p.isHidden('#tourBack') && (await T(p, '#tourT')).startsWith('This is the month your pay is for, from one payday to the next.'));
    check('Everything behind the card is inert: the page and the tab bar', (await p.getAttribute('#main', 'inert')) === '' && (await p.getAttribute('#tabbar', 'inert')) === '');
    check('The highlighted element is described by the card\'s text', (await p.getAttribute('#monthBar', 'aria-describedby')) === 'tourT');
  }
  const ax = await axe(p);
  check(`Accessibility of a tour stop (${dark ? 'dark' : 'light'})`, ax.length === 0, ax.join(' | '));
  check(`No sideways scroll during the tour (${dark ? 'dark' : 'light'})`, await noSideScroll(p, 360));
  const hashes = [];
  const { ids, total } = await walk(p, tag, async (i, id) => {
    hashes.push(await p.evaluate(() => location.hash));
    if (id === 'hero' && !dark) check('The hero stop uses the real figure', (await T(p, '#tourT')) === "After every bill, budget and savings transfer, this is what's left for the month: £2,329.00.", await T(p, '#tourT'));
    if (id === 'transfers' && !dark) check('Transfers: what to do with them', (await T(p, '#tourH')) === 'Then make these transfers' && (await T(p, '#tourT')).includes('Tick each one off when it\'s done.'));
    if (i > 0 && !dark) check(`Stop ${i + 1}: focus moves to the new title`, (await focusId(p)) === 'tourH' && await focusIn(p, '#tourCard'));
    if (id === 'settings') check(`${tag}: the last stop ends with the routine and a Done button`, (await T(p, '#tourT')).includes("That's it. Each payday: type your pay, make the transfers, tick them off.") && (await T(p, '#tourNext')) === 'Done' && (await T(p, '#tourT')).includes('Settings › Help'));
  });
  check(`${tag}: all nine stops, in the plan's order`, JSON.stringify(ids) === JSON.stringify(ALL) && total === 9, ids.join(','));
  check(`${tag}: the Pay tab for the first six, then Analysis, Reminders and Settings`, JSON.stringify(hashes) === JSON.stringify(['#pay', '#pay', '#pay', '#pay', '#pay', '#pay', '#analysis', '#due', '#settings']), hashes.join(','));
  await p.waitForTimeout(150);
  check(`${tag}: Done closes it, back on Pay with focus on the hero, and saves that it's been seen`, !(await shown(p)) && (await p.evaluate(() => location.hash)) === '#pay' && (await focusId(p)) === 'heroH' &&
    !('tourDone' in await LS(p, K.cfg)) && (await p.$('[aria-describedby="tourT"]:not(#tourCard)')) === null && (await p.getAttribute('#main', 'inert')) === null);
  if (!dark) check(`${tag}: …and leaves no history entry behind (Back from Pay leaves the app, as before)`, (await p.evaluate(() => history.state)) === null, JSON.stringify(await p.evaluate(() => history.state)));
  await p.reload(); await p.waitForTimeout(250);
  check(`${tag}: it doesn't come back on the next start`, !(await shown(p)) && await p.isVisible('#tab-pay'));
  check('No JS errors (tour after setup' + (dark ? ', dark' : '') + ')', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 2. Back, Next, Skip, Esc; focus kept in the card; nothing behind can be touched or swiped ----------
let { ctx, p } = await session({ w: 400, h: 860, touch: true });
await walkSetup(p, 4, true); await p.click('#su_later'); await p.waitForTimeout(300);
check('"Finish later" starts the tour too', await shown(p) && (await stopId(p)) === 'month');
check('No "Not every month" bills: that stop is left out and the count says 8', (await T(p, '#tourN')) === '1 of 8');
await p.click('#tourNext'); await p.click('#tourNext'); await p.waitForTimeout(80);
check('Next, Next: stop 3, take-home pay', (await stopId(p)) === 'pay' && (await T(p, '#tourN')) === '3 of 8' && (await T(p, '#tourH')) === 'Type your pay');
check('…saying what to type and that Dovetail uses an estimate until then (2.16: one text for every household)', (await T(p, '#tourT')) === 'When pay arrives, type what actually reached your bank since you last made the transfers. Until then, Dovetail uses an estimate.', await T(p, '#tourT'));
await p.click('#tourBack'); await p.waitForTimeout(80);
check('Back: stop 2, the hero, focus on its title', (await stopId(p)) === 'hero' && (await focusId(p)) === 'tourH');
check('…and the hero moved its description over (the month bar\'s is gone)', (await p.getAttribute('#hero', 'aria-describedby')) === 'tourT' && (await p.getAttribute('#monthBar', 'aria-describedby')) === null);
const seen = new Set();
for (let i = 0; i < 8; i++) { await p.keyboard.press('Tab'); seen.add(await focusId(p)); if (!(await focusIn(p, '#tourCard'))) { seen.add('OUTSIDE'); break; } }
check('Tab goes round Back, Next and Skip tour, never out of the card', !seen.has('OUTSIDE') && ['tourBack', 'tourNext', 'tourSkip'].every(x => seen.has(x)), [...seen].join(','));
for (let i = 0; i < 5; i++) await p.keyboard.press('Shift+Tab');
check('…and so does Shift+Tab', await focusIn(p, '#tourCard'));
const label0 = await T(p, '#monthLabel'), nb = await p.locator('#next').boundingBox(), ab = await p.locator('#t-analysis').boundingBox();
await p.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2); await p.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2); await p.waitForTimeout(150);
check('Taps on the month arrows and the tab bar do nothing', (await T(p, '#monthLabel')) === label0 && (await p.evaluate(() => location.hash)) === '#pay' && await shown(p) && (await stopId(p)) === 'hero');
await swipe(p, 300, 420, 120, 425); await swipe(p, 120, 420, 300, 425); await p.waitForTimeout(150);
check('Swipes don\'t change the month', (await T(p, '#monthLabel')) === label0 && await shown(p));
await p.click('#tourNext'); await p.click('#tourNext'); await p.waitForTimeout(80);
check('(set-up) on the transfers stop', (await stopId(p)) === 'transfers');
await p.keyboard.press('Escape'); await p.waitForTimeout(150);
check('Esc ends the tour and saves that it\'s been seen', !(await shown(p)) && !('tourDone' in await LS(p, K.cfg)) && (await p.getAttribute('#main', 'inert')) === null && (await p.getAttribute('#tabbar', 'inert')) === null);
check('…with focus on the "Finish setting up" card\'s title (Finish later leaves things to do)', (await focusId(p)) === 'tipsH');
check('…and no history entry left behind', (await p.evaluate(() => history.state)) === null);
await swipe(p, 300, 420, 120, 425); await p.waitForTimeout(150);
check('Swiping works again afterwards', (await T(p, '#monthLabel')) !== label0);
check('No JS errors (Back, Next, Esc)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

({ ctx, p } = await session());
await p.click('#su_later'); await p.waitForTimeout(300);
check('"Skip setup for now" starts the tour too', await shown(p));
check('…a household with no pay: the hero stop asks for pay instead of quoting £0.00', await (async () => { await p.click('#tourNext'); await p.waitForTimeout(60);
  return (await T(p, '#tourT')) === "After every bill, budget and savings transfer, this is what's left for the month. Add your pay to see it."; })(), await T(p, '#tourT'));
await p.click('#tourSkip'); await p.waitForTimeout(150);
check('"Skip tour" ends it and saves that it\'s been seen', !(await shown(p)) && !('tourDone' in await LS(p, K.cfg)));
check('…and leaves no history entry behind', (await p.evaluate(() => history.state)) === null);
await ctx.close();

// The phone's Back button on the Pay tab: it ends the tour (the tour has a history entry of its own) instead of leaving the app.
({ ctx, p } = await session());
await walkSetup(p, 7); await p.click('#su_finish'); await p.waitForTimeout(300);
await p.click('#tourNext'); await p.waitForTimeout(80);
check('(set-up) the tour is open on the Pay tab, on the hero stop, with an entry of its own in the history', await shown(p) && (await stopId(p)) === 'hero' && (await p.evaluate(() => location.hash)) === '#pay' && (await p.evaluate(() => !!(history.state && history.state.tour))));
await p.evaluate(() => history.back()); await p.waitForTimeout(300);
check('Back on the Pay tab closes the tour and stays on Pay', !(await shown(p)) && await p.isVisible('#tab-pay') && await p.isVisible('#tabbar') && (await p.evaluate(() => location.hash)) === '#pay' &&
  (await p.getAttribute('#main', 'inert')) === null && (await p.getAttribute('#tabbar', 'inert')) === null && (await p.$('[aria-describedby="tourT"]:not(#tourCard)')) === null);
check('…saves that it\'s been seen, like Skip tour', !('tourDone' in await LS(p, K.cfg)));
check('…puts focus on the hero\'s title', (await focusId(p)) === 'heroH');
check('…and leaves nothing behind in the history (the next Back leaves the app)', (await p.evaluate(() => history.state)) === null);
await p.reload(); await p.waitForTimeout(250);
check('…and the tour doesn\'t come back on the next start', !(await shown(p)) && await p.isVisible('#tab-pay'));
check('No JS errors (Back on Pay)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 3. Never uninvited: an existing household, an update, a restore ----------
({ ctx, p } = await session({ storage: sampleStorage(true) }));
check('An existing household doesn\'t get the tour', await p.isVisible('#tab-pay') && !(await shown(p)));
check('…its saved settings gain no tour setting', !('tourDone' in await LS(p, K.cfg)));
await ctx.close();
({ ctx, p } = await session({ storage: { [K.cfg]: household({ schema: 5, lastVersion: '2.4', people: [{ id: 'a', name: 'Ann', payAccount: 'x', usualPay: 1500 }], accounts: [{ id: 'x', name: 'Current', colour: 'blue', leftoverTo: null }] }) } }));
check('After an update ("What\'s new" showing) there\'s no tour', await p.isVisible('#whatsNew .banner') && !(await shown(p)));
await ctx.close();
({ ctx, p } = await session());
await p.click('#su_restore summary'); await p.fill('#backupIn', JSON.stringify(SAMPLE)); await p.click('#restoreBtn'); await p.waitForTimeout(300);
check('Restoring a backup in setup doesn\'t start the tour', await p.isVisible('#tab-pay') && !(await shown(p)));
await ctx.close();
({ ctx, p } = await session({ native: true, storage: { 'qa.native': { backups: [{ name: 'backup-20261014-090000.json', savedAt: '2026-10-14T09:00:00', json: JSON.stringify(SAMPLE) }], calls: [], lockOn: false, lockAvail: true, n: 0 } } }));
await p.click('#restoreOfferSetup .btn:has-text("Restore backup")'); await p.waitForTimeout(300);
check('…nor does the automatic-backup offer', await p.isVisible('#tab-pay') && !(await shown(p)));
await ctx.close();

// ---------- 4. Settings › Help, and the example's banner ----------
({ ctx, p } = await session({ storage: sampleStorage(true) }));
await p.click('#t-settings'); await p.waitForTimeout(100);
check('Settings has a Help section, after Backup, export & restore and just above About (2.7)', await p.evaluate(() => document.getElementById('sHelp').previousElementSibling.id === 'sBackup' && document.getElementById('sHelp').nextElementSibling.textContent.startsWith('About')));
await p.click('#sHelp summary'); await p.waitForTimeout(100);
check('…with "Show me around", "How Dovetail works" and "Words Dovetail uses"', (await T(p, '#tourStart')) === 'Show me around' && (await T(p, '#helpHow')) === 'How Dovetail works' && (await T(p, '#helpWords')) === 'Words Dovetail uses');
await p.click('#tourStart'); await p.waitForTimeout(400);
check('"Show me around" starts the tour on the Pay tab', await shown(p) && (await p.evaluate(() => location.hash)) === '#pay' && (await stopId(p)) === 'month' && (await T(p, '#tourN')) === '1 of 9');
for (let i = 0; i < 6; i++) { await p.click('#tourNext'); await p.waitForTimeout(80); }
check('(set-up) on the Analysis stop', (await stopId(p)) === 'analysis' && (await p.evaluate(() => location.hash)) === '#analysis');
check('2.13: the Analysis stop is about the months ahead and whether any account will be short', (await T(p, '#tourH')) === 'See the months ahead' && (await T(p, '#tourT')).includes('whether any account will be short'), await T(p, '#tourT'));
await p.click('#tourBack'); await p.waitForTimeout(400);
check('Back from Analysis goes back to the Pay tab\'s last stop, still in place', (await stopId(p)) === 'notevery' && (await p.evaluate(() => location.hash)) === '#pay' && (await geo(p)).ok, JSON.stringify(await geo(p)));
await p.click('#tourNext'); await p.waitForTimeout(150);
await p.goBack(); await p.waitForTimeout(400);
check('The phone\'s Back button ends the tour', !(await shown(p)) && (await p.evaluate(() => location.hash)) === '#pay' && (await p.getAttribute('#main', 'inert')) === null);
await p.click('#t-settings'); await p.waitForTimeout(100); if (!(await p.$eval('#sHelp', d => d.open))) await p.click('#sHelp summary');
await p.click('#tourStart'); await p.waitForTimeout(400); await p.click('#tourSkip'); await p.waitForTimeout(400);
check('Skipping a tour started from Settings goes back to Settings › Help, with focus on "Show me around"', await p.isVisible('#tab-settings') && (await focusId(p)) === 'tourStart');
await p.goBack(); await p.waitForTimeout(300);
check('…and Back from there goes to Pay, with no history entry left behind', await p.isVisible('#tab-pay') && (await p.evaluate(() => location.hash)) === '#pay' && (await p.evaluate(() => history.state)) === null);
check('No JS errors (Settings › Help)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
({ ctx, p } = await session());
await p.click('#su_example'); await p.waitForTimeout(250);
check('The example household doesn\'t start the tour by itself', !(await shown(p)));
check('…its banner offers "Show me around"', (await T(p, '#exTour')) === 'Show me around');
await p.click('#exTour'); await p.waitForTimeout(300);
const ex = await walk(p, 'Example household, 400px');
check('…which shows every stop, "Not every month" included', JSON.stringify(ex.ids) === JSON.stringify(ALL), ex.ids.join(','));
check('No JS errors (example)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 5. Reduced motion ----------
for (const rm of ['reduce', 'no-preference']) {
  ({ ctx, p } = await session({ reducedMotion: rm }));
  await p.click('#su_later'); await p.waitForTimeout(400);
  const tr = await p.$eval('#tourRing', e => getComputedStyle(e).transitionDuration);
  check(rm === 'reduce' ? 'Reduced motion: the ring jumps (no transition)' : 'Otherwise the ring glides between stops', rm === 'reduce' ? /^0s(, 0s)*$/.test(tr) : tr.includes('0.25s'), tr);
  await ctx.close();
}

// ---------- 6. "What's this?" buttons and the help sheet ----------
// 2.9.1: one "?" is left, on Saved so far (Analysis); the tour, Settings › Help and the charts' own keys explain the rest.
// Everything about the sheet is checked through it: a dialog, focus, Tab kept inside, and Esc, Close, a tap outside and
// Back each closing it with focus back on the "?".
({ ctx, p } = await session({ storage: sampleStorage(true), w: 360, h: 780 }));
await openDetails(p);
check('2.9.1: no "?" on the Pay tab or Reminders', (await p.$$('#tab-pay .helpq, #tab-due .helpq')).length === 0);
check('…and the Pay tab\'s headings are as before', (await T(p, '#heroH')) === 'Left over this month' && (await T(p, '#payH')) === 'Take-home pay' && (await T(p, '#trH')) === 'Transfers to make, in this order');
await p.click('#t-analysis'); await p.waitForTimeout(200);
check('Analysis: the only "?" is on Saved so far', JSON.stringify(await p.$$eval('.helpq', b => b.map(x => x.getAttribute('data-help')))) === JSON.stringify(['saved']), JSON.stringify(await p.$$eval('.helpq', b => b.map(x => x.getAttribute('data-help')))));
check('…named as a question, with a 44px tap area', (await p.getAttribute('.helpq', 'aria-label')) === 'What does saved so far show?' && await p.$eval('.helpq', x => { const r = x.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; }));
const SQ = '#analysis .helpq[data-help=saved]';
const openSaved = async () => { await p.$eval(SQ, e => e.scrollIntoView({ block: 'center' })); await p.click(SQ); await p.waitForTimeout(150); };
for (const how of ['Esc', 'Close', 'a tap outside', 'Back']) {
  await openSaved();
  check(`Saved so far: opens a sheet with its explanation, focus on its title (then closed with ${how})`, await p.isVisible('#sheet') && (await T(p, '#sheetH')) === 'Saved so far' && (await focusId(p)) === 'sheetH' &&
    (await p.getAttribute('#sheet', 'role')) === 'dialog' && (await p.getAttribute('#sheet', 'aria-modal')) === 'true' && (await p.getAttribute('#sheet', 'aria-describedby')) === 'sheetB' &&
    (await T(p, '#sheetB')).includes('Only months where you typed pay or ticked a transfer are counted.') && (await T(p, '#sheetB')).includes('Tax years run from 6 April to 5 April.'));
  if (how === 'Esc') {
    const ax = await axe(p); check('Accessibility of an open help sheet', ax.length === 0, ax.join(' | '));
    const s2 = new Set(); for (let i = 0; i < 4; i++) { await p.keyboard.press('Tab'); s2.add(await focusIn(p, '#sheet') ? await focusId(p) : 'OUTSIDE'); }
    check('Tab stays inside the sheet', [...s2].join() === 'sheetClose', [...s2].join());
    await p.keyboard.press('Escape'); await p.waitForTimeout(120);
  } else if (how === 'Close') {
    await p.click('#sheetClose'); await p.waitForTimeout(120);
  } else if (how === 'a tap outside') {
    await p.click('#sheetBack', { position: { x: 20, y: 20 } }); await p.waitForTimeout(120);
  } else {
    const y0 = await p.$eval('#main', m => m.scrollTop);
    await p.goBack(); await p.waitForTimeout(200);
    check('The phone\'s Back button closes the sheet and stays put', await p.isHidden('#sheetWrap') && await p.isVisible('#tab-analysis') && Math.abs((await p.$eval('#main', m => m.scrollTop)) - y0) < 2);
  }
  check(`Closed (${how}), focus back on its "?", nothing left inert`, await p.isHidden('#sheetWrap') && (await p.evaluate(() => document.activeElement.getAttribute('data-help'))) === 'saved' &&
    (await p.getAttribute('#main', 'inert')) === null && (await p.getAttribute('#tabbar', 'inert')) === null);
}
check('Closing went back in history too: no sheet entry left behind', (await p.evaluate(() => JSON.stringify(history.state))) === '{"sub":true}', await p.evaluate(() => JSON.stringify(history.state)));
// Settings › Help: how Dovetail works, and the words it uses
await p.click('#t-settings'); await p.click('#sHelp summary'); await p.click('#helpHow'); await p.waitForTimeout(150);
check('"How Dovetail works": the routine, the flow of money with the household\'s own diagram, left over and pay months', (await T(p, '#sheetH')) === 'How Dovetail works' &&
  (await p.$$eval('#sheetB .how li', l => l.map(x => x.textContent))).length === 3 && (await p.$$('#sheetB .fd li')).length === 4 && (await p.getAttribute('#sheetB .fd', 'aria-labelledby')) === 'howFlowH' &&
  (await T(p, '#sheetB')).includes('What left over means') && (await T(p, '#sheetB')).includes('A pay month runs from one transfer day to the next'));
check('2.13: …and own accounts that pay shares in, board, and changes from this pay month',
  (await T(p, '#sheetB')).includes("your own account keeps what's left of your pay after your share") && (await T(p, '#sheetB')).includes('Someone who pays board pays a set amount') && (await T(p, '#sheetB')).includes('a change to a bill, budget or savings transfer applies from this pay month'), await T(p, '#sheetB'));
const ax2 = await axe(p); check('Accessibility of "How Dovetail works"', ax2.length === 0, ax2.join(' | '));
await p.click('#sheetClose'); await p.waitForTimeout(100);
check('…closing it returns focus to its button', (await focusId(p)) === 'helpHow');
await p.click('#helpWords'); await p.waitForTimeout(150);
const terms = await p.$$eval('#sheetB dt', d => d.map(x => x.textContent));
// 2.13: Board, after Share.
check('"Words Dovetail uses": a glossary of the fifteen words (2.14: rough figure; 2.16: transfer day)', JSON.stringify(terms) === JSON.stringify(['Take-home pay', 'Pay month', 'Transfer day', 'Transfer', 'Left over', 'One-off', 'Share', 'Board', 'Spending budget', 'Savings transfer', 'Rough figure (bills)', 'Direct Debit', 'Standing Order', 'Renewal', 'Tax year']), terms.join(','));
// 2.16: "Transfer day" is Appendix A's wording, whose last sentence runs to 25 words; the rest stay short.
check('…in short sentences (none over about 20 words, but Appendix A\'s "Transfer day")', await p.$$eval('#sheetB dd', d => d.filter(x => x.previousElementSibling.textContent !== 'Transfer day').every(x => x.textContent.split(/(?<=\.)\s+/).every(s => s.split(/\s+/).length <= 21))));
await p.keyboard.press('Escape'); await p.waitForTimeout(100);
check('No JS errors (help)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
// the sheets with larger text at 360px, light and dark
for (const dark of [false, true]) {
  ({ ctx, p } = await session({ storage: sampleStorage(true), w: 360, h: 740, dark }));
  await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
  for (const open of [async () => { await p.click('#t-analysis'); await p.waitForTimeout(150); await p.click('#analysis .helpq[data-help=saved]'); }, async () => { await p.click('#t-settings'); await p.click('#sHelp summary'); await p.click('#helpHow'); }, async () => { await p.click('#helpWords'); }]) {
    await open(); await p.waitForTimeout(150);
    const v = await axe(p), fits = await p.$eval('#sheet', e => e.scrollWidth <= e.clientWidth + 1 && e.getBoundingClientRect().right <= window.innerWidth + 1);
    check(`Larger text, 360px${dark ? ', dark' : ''}: "${await T(p, '#sheetH')}" fits without sideways scrolling and passes axe`, fits && v.length === 0, v.join(' | '));
    await p.keyboard.press('Escape'); await p.waitForTimeout(80);
  }
  await ctx.close();
}
// sentences in the help sheets: short ones
({ ctx, p } = await session({ storage: sampleStorage(true) }));
await p.click('#t-analysis'); await p.waitForTimeout(150);
const long = [];
for (const key of ['saved']) { await p.click(`#analysis .helpq[data-help=${key}]`); await p.waitForTimeout(80);
  (await p.$$eval('#sheetB p', ps => ps.map(x => x.textContent))).forEach(t => t.split(/(?<=[.:?])\s+/).forEach(s => { if (s.split(/\s+/).length > 21) long.push(s); }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(60); }
check('Help sheet: no sentence over about 20 words', long.length === 0, long.join(' | '));
await ctx.close();

// ---------- 7. The first-month hint ----------
({ ctx, p } = await session());
await walkSetup(p, 7); await p.click('#su_finish'); await p.waitForTimeout(300); await skipTour(p);
const HINT = 'First payday? Open your banking app, make each payment below, then tick it here.';
check('A new household: one quiet line above the transfers', await p.isVisible('#firstHint') && (await T(p, '#firstHint')) === HINT &&
  await p.evaluate(() => !!(document.getElementById('firstHint').compareDocumentPosition(document.getElementById('steps')) & Node.DOCUMENT_POSITION_FOLLOWING)));
const ticks = await p.$$('#steps .tick');
for (let i = 0; i < ticks.length - 1; i++) { await p.click(`#steps li:nth-child(${i + 1}) .tick`); await p.waitForTimeout(60); }
check('…still there with one transfer to go', await p.isVisible('#firstHint'));
await p.click(`#steps li:nth-child(${ticks.length}) .tick`); await p.waitForTimeout(150);
check('Gone once every transfer in a month is ticked', await p.isHidden('#firstHint'));
await p.reload(); await p.waitForTimeout(250);
await p.click('#next'); await p.waitForTimeout(100);
check('…and it doesn\'t come back, in any month', await p.isHidden('#firstHint') && (await p.$$('#steps .tick')).length > 0);
check('No new setting is stored for it', JSON.stringify(Object.keys(await LS(p, K.cfg)).filter(k => /hint/i.test(k))) === '[]');
await ctx.close();
({ ctx, p } = await session());
await p.click('#su_example'); await p.waitForTimeout(250);
await p.evaluate(() => { const m = JSON.parse(localStorage.getItem('payday.months.v1')); for (const k in m) m[k].done = {}; localStorage.setItem('payday.months.v1', JSON.stringify(m)); }); await p.reload(); await p.waitForTimeout(250);
check('Never for the example household (even with nothing ticked)', await p.isHidden('#firstHint') && (await p.$$('#steps .tick')).length > 0);
await ctx.close();
({ ctx, p } = await session({ storage: sampleStorage(true) }));
check('Not for an existing household that has ticked a month', await p.isHidden('#firstHint'));
await ctx.close();
// A 2.5 household that ticks its main transfer each month but never its savings transfer: no month has every transfer
// ticked, but it has used Dovetail before, so it isn't its first payday.
const H25 = household({ schema: 5, lastVersion: '2.5', people: [{ id: 'a', name: 'Ann', payAccount: 'x', usualPay: 2000 }],
  accounts: [{ id: 'x', name: 'Current', colour: 'blue', leftoverTo: 'y' }, { id: 'y', name: 'Joint', colour: 'red', leftoverTo: null }],
  bills: [{ id: 'b1', name: 'Rent', amount: 900, account: 'x', months: [] }], budgets: [{ id: 'g', name: 'Food', amount: 300, account: 'y' }],
  savings: [{ id: 's1', name: 'Pot', amount: 100, fromAccount: 'y', since: '2026-01' }] });
const M25 = {};
for (const k of ['2026-07', '2026-08', '2026-09']) M25[k] = { month: k, pay: { a: 2000 }, done: { 't:x>y': 1100 }, oneOffs: [], results: { steps: { 't:x>y': 1100, 's:s1': 100 }, float: 600 } };
({ ctx, p } = await session({ storage: { [K.cfg]: H25, [K.mon]: M25 } }));
check('Not for an existing household that has used earlier months, even if it never ticks every transfer', await p.isHidden('#firstHint') && (await p.$$('#steps .tick')).length === 2, await T(p, '#trSec'));
await ctx.close();
({ ctx, p } = await session({ storage: { [K.cfg]: H25, [K.mon]: { '2026-09': { month: '2026-09', pay: { a: 2000 }, done: {}, oneOffs: [] } } } }));
check('…nor one that has only typed pay in an earlier month', await p.isHidden('#firstHint'));
await ctx.close();
({ ctx, p } = await session());
await p.click('#su_later'); await p.waitForTimeout(300); await skipTour(p);
check('Not when there are no transfers to make', await p.isHidden('#firstHint') && (await p.$$('#steps .tick')).length === 0);
check('No JS errors (hint)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
await finish();
