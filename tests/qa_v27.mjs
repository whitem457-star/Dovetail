// 2.7: one notice above the hero and the reminders nudge under it, "This month in detail", the example's "Set up my own
// household", Reminders without repeats, Saved months, pay filled in by a tick stays an estimate, this month marked on
// the Month by month chart, Settings in its new order, Reminders' month hint, Share, and the smaller polish.
import { suite, session, K, T, LS, axe, noSideScroll, walkSetup, SETUP_FILL, skipTour } from './lib.mjs';
const { check, finish } = suite('2.7');
const TODAY = '2026-10-20T12:00:00Z'; // the example opens on November 2026 (payday Wed 28 Oct is 8 days away)
const stubCopy = p => p.evaluate(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: t => { window.__copied = t; return Promise.resolve(); } } }); });
const inView = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(), m = document.getElementById('main').getBoundingClientRect(); return r.height > 0 && r.top >= m.top - 1 && r.top < m.bottom - 40; });
const order = p => p.$$eval('#tab-pay > *', l => l.filter(e => !e.hidden && getComputedStyle(e).display !== 'none').map(e => e.id || e.className));

let { ctx, p } = await session({ today: TODAY });
await p.click('#su_example'); await p.waitForTimeout(300);
await stubCopy(p);

// ---------- A. One notice above the hero; the rest of the month under "This month in detail" ----------
check('The example opens on November 2026', (await T(p, '#monthLabel')) === 'November 2026');
check('Pay tab order: one notice, the hero, the reminders line, pay, transfers, This month in detail, bills, saved months',
  JSON.stringify(await order(p)) === JSON.stringify(['notice', 'hero', 'actionBanner', 'payCard', 'trSec', 'payDetails', 'accounts', 'histBox']), JSON.stringify(await order(p)));
check('The notice holds only the example banner', await p.isVisible('#exampleBanner .banner') && (await p.$$('#notice .banner, #notice .card')).length === 1 && (await T(p, '#whatsNew')) === '' && (await T(p, '#restoreOffer')) === '');
const nudge = await p.$eval('#actionBanner .banner', b => ({ h: b.offsetHeight, t: b.innerText, ws: getComputedStyle(b.querySelector('.t')).whiteSpace }));
check('The Gym nudge is one line under the hero, with View ›', /^Gym in \d+ days/.test(nudge.t) && nudge.t.includes('View ›') && nudge.h < 60 && nudge.ws === 'nowrap', JSON.stringify(nudge));
check('"This month in detail" is closed, with the left over beside it', !(await p.$eval('#payDetails', d => d.open)) &&
  (await T(p, '#payDetails summary')).startsWith('This month in detail') && (await T(p, '#payDetailsSum')) === (await p.textContent('#heroFloat')) + ' left over', await T(p, '#payDetails summary'));
check('…holding Not every month, the one-offs, the account figures and the totals', await p.$$eval('#payDetails .inner > *', l => l.map(e => e.id).join(',')) === 'nmCard,oneOffCard,floatCards,stats');
const note = await T(p, '#nmNote');
check('A line under the transfers names the bill that isn\'t monthly', note === 'Includes 1 bill that isn\'t monthly: £168.00 — see This month in detail.', note);
await p.click('#nmNote'); await p.waitForTimeout(400);
check('…and opens This month in detail at Not every month', await p.$eval('#payDetails', d => d.open) && await inView(p, '#nmCard') && await p.evaluate(() => document.activeElement.id) === 'dueH');
await p.click('#payDetails summary'); await p.waitForTimeout(100);
check('Closed by hand, it stays closed in a month with one-offs (December)', !(await p.$eval('#payDetails', d => d.open)));
await p.click('#next'); await p.waitForTimeout(150);
check('…December: still closed, though it has the car service', !(await p.$eval('#payDetails', d => d.open)) && (await p.$$('#oo_o1')).length === 1);
await p.click('#prev'); await p.waitForTimeout(150);
// Deep link: Reminders' "Open December 2026" for the one-off opens it.
await p.click('#t-due'); await p.waitForTimeout(150); await p.click('#dueAll summary'); await p.waitForTimeout(100);
await p.click('#rem_u_o_2026-12_o1 .btn'); await p.waitForTimeout(600);
check('Reminders › "Open December 2026" opens This month in detail at the one-off', (await T(p, '#monthLabel')) === 'December 2026' && await p.$eval('#payDetails', d => d.open) && await inView(p, '#oo_o1'));
check('No JS errors so far', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// A fresh session: closed by default, opened by itself in a month with one-offs, and the tour opens it and puts it back.
({ ctx, p } = await session({ today: TODAY }));
await p.click('#su_example'); await p.waitForTimeout(300); await stubCopy(p);
await p.click('#next'); await p.waitForTimeout(150);
check('December (a one-off typed for it) opens with This month in detail open', await p.$eval('#payDetails', d => d.open) && await p.isVisible('#oo_o1'));
await p.click('#prev'); await p.waitForTimeout(150);
check('…November (none) with it closed', !(await p.$eval('#payDetails', d => d.open)));
await p.click('#exTour'); await p.waitForTimeout(250);
let ids = [];
for (let i = 0; i < 12 && await p.isVisible('#tour'); i++) { const id = await p.getAttribute('#tourCard', 'data-stop'); ids.push(id);
  if (id === 'oneoffs') { check('Tour: the one-offs stop opens This month in detail and rings the card', await p.$eval('#payDetails', d => d.open) && await p.isVisible('#tourRing') && await inView(p, '#oneOffCard')); }
  if (id === 'notevery') { check('Tour: the Not every month stop rings its card', await inView(p, '#nmCard')); await p.click('#tourSkip'); await p.waitForTimeout(250); break; }
  await p.click('#tourNext'); await p.waitForTimeout(250); }
check('Tour stops include one-offs and Not every month', ids.includes('oneoffs') && ids.includes('notevery'), ids.join(','));
check('…and This month in detail is closed again after the tour', !(await p.$eval('#payDetails', d => d.open)));
check('No JS errors (tour)', p.errs.length === 0, p.errs.join(' | '));

// ---------- B. "Set up my own household" ----------
const sb = await p.$eval('#exStart', b => ({ t: b.textContent, danger: b.classList.contains('danger'), bg: getComputedStyle(b).backgroundColor }));
check('"Set up my own household" is the main (green) button, not red', sb.t === 'Set up my own household' && !sb.danger, JSON.stringify(sb));
check('"Show me around" sits beside it as a quiet button', await p.$eval('#exStart', b => b.nextElementSibling && b.nextElementSibling.id === 'exTour' && b.nextElementSibling.classList.contains('ghost')));
await p.click('#exStart'); await p.waitForTimeout(100);
const armed = await p.$eval('[data-confirm="example"]', b => ({ t: b.textContent, danger: b.classList.contains('danger'), focus: document.activeElement === b }));
check('First tap: "Tap again: this clears the example", now red, focus kept', armed.t === 'Tap again: this clears the example' && armed.danger && armed.focus, JSON.stringify(armed));
check('…nothing cleared yet', (await LS(p, K.cfg)).example === true);

// ---------- C, H. Reminders: no repeats, and the month hint ----------
await p.click('#t-due'); await p.waitForTimeout(200);
check('Gym is under Needs attention with its buttons', (await p.$$('#rem_b_x3 .btn')).length === 2);
const gm = await p.$eval('#rem_m_b_x3', e => ({ t: e.textContent, btns: e.querySelectorAll('button').length, cls: e.className }));
check('…and once more in November as a single line, "listed above", no buttons', /^Gym · 9 Nov 2026 · in 20 days — listed above$/.test(gm.t) && gm.btns === 0, JSON.stringify(gm));
await p.click('#dueAll summary'); await p.waitForTimeout(80);
check('…and in All upcoming', (await p.$$('#rem_u_b_x3 .btn')).length >= 1);
const dup = await p.$$eval('#dueList [id^="rem_"]', l => { const t = l.filter(e => !e.closest('#dueAll')).map(e => e.textContent); return t.filter((x, i) => t.indexOf(x) !== i); });
check('No reminder\'s text is repeated outside All upcoming', dup.length === 0, dup.join(' | '));
check('"In November 2026" with the hint "‹ › change month above"', (await T(p, '#dueMonthH')) === 'In November 2026' && (await T(p, '#remMonthHint')).replace(/\s+/g, ' ') === '‹ › change month above' &&
  await p.$eval('#remMonthHint span', s => s.getAttribute('aria-hidden') === 'true'));
await p.click('#dueList .btn:has-text("+ Add a reminder")'); await p.waitForTimeout(150);
const nr = (await LS(p, K.cfg)).reminders.slice(-1)[0];
check('A new reminder due soon in this month opens under Needs attention; the month has its one line', nr.date === '2026-10-28' && (await p.$('#dueList > section:first-child .ed')) !== null &&
  (await p.$$('#dueList .ed')).length === 1 && (await T(p, '#rem_m_r_' + nr.id)).endsWith('listed above'));
await p.click('#dueList > section:first-child .ed .btn.danger'); await p.click('#dueList > section:first-child .ed .btn.danger'); await p.waitForTimeout(150);
await p.click('#next'); await p.waitForTimeout(150);
check('The hint goes once the month is changed here', (await p.$('#remMonthHint')) === null && (await T(p, '#dueMonthH')) === 'In December 2026');
await p.click('#t-pay'); await p.waitForTimeout(150); await p.click('#t-due'); await p.waitForTimeout(150);
check('…and stays gone', (await p.$('#remMonthHint')) === null);
await p.click('#t-pay'); await p.waitForTimeout(150); await p.click('#prev'); await p.waitForTimeout(150);

// ---------- E. Ticking before pay is typed ----------
await p.click('#steps .tick'); await p.waitForTimeout(150);
check('Toast: "Using estimated pay for now. Type what arrived when it lands."', (await T(p, '#toast')) === 'Using estimated pay for now. Type what arrived when it lands.');
const hintA = await T(p, '#payHint_alex');
check('The hint under each box says it\'s estimated', hintA === 'Using Oct 2026: £2,150.00 (estimated — tap to type what arrived)' && (await T(p, '#payHint_sam')).includes('(estimated — tap to type what arrived)'), hintA);
check('…and the banner says the transfers use last month\'s pay', (await T(p, '#payBanner')).includes("These transfers use last month's pay."));
let nov = (await LS(p, K.mon))['2026-11'];
check('Saved with payEstimated for both, the figures kept', JSON.stringify(nov.payEstimated) === '{"alex":true,"sam":true}' && nov.pay.alex === 2150, JSON.stringify(nov));
await p.click('#histBox summary'); await p.waitForTimeout(100);
check('Saved months marks the figures as estimated', (await T(p, '#hist')).includes('Alex £2,150.00 (estimated)'), await T(p, '#hist'));
await p.click('#t-analysis'); await p.waitForTimeout(300);
const bars = await p.$$eval('#anMonths svg path[data-kind]', l => l.map(e => e.getAttribute('data-kind')));
check('Analysis: November is hatched (estimated), with no predicted line', bars[3] === 'projected' && (await p.$$('#anMonths svg [data-kind="predicted"]')).length === 3, bars.join(','));
check('The monthly picture still averages the typed months only', (await T(p, '#anPicture')).includes('Alex £2,157.67 (average of 3 months)'), await T(p, '#anPicture'));
// F. this month on the chart
const cur = await p.$$eval('#anMonths svg [data-current]', l => Object.fromEntries(l.map(e => [e.tagName, [e.getAttribute('stroke') || e.getAttribute('fill'), e.getAttribute('stroke-width') || e.getAttribute('font-weight'), e.textContent]])));
check('Month by month: November\'s bar has a 2px ink outline and its label is bold ink', JSON.stringify(cur) === JSON.stringify({ text: ['var(--ink)', '700', 'Nov'], path: ['var(--ink)', '2', ''] }), JSON.stringify(cur));
check('…the other labels stay muted', await p.$$eval('#anMonths svg text:not([data-current])', l => l.filter(t => /^[A-Z][a-z]{2}$/.test(t.textContent)).every(t => t.getAttribute('fill') === 'var(--muted)')));
check('…"(this month)" in its reading and in the chart\'s description', (await p.getAttribute('#anMonths svg', 'aria-label')).includes('November 2026 (this month)'));
await p.focus('#anMonths svg'); for (let i = 0; i < 3; i++) await p.keyboard.press('ArrowRight');
check('…the tooltip\'s first line', (await T(p, '#anMonths .tip b')).startsWith('November 2026 (this month): '), await T(p, '#anMonths .tip b'));
await p.click('#t-pay'); await p.waitForTimeout(150);
await p.fill('#pay_alex', '2150.555'); await p.waitForTimeout(900);
check('Something unreadable in an estimated box keeps the saved estimate marked', JSON.stringify((await LS(p, K.mon))['2026-11'].payEstimated) === '{"alex":true,"sam":true}' && (await T(p, '#payHint_alex')).startsWith('Enter an amount'));
await p.fill('#pay_alex', '2200'); await p.waitForTimeout(900);
check('Typing a figure clears the estimated hint for that box only', (await T(p, '#payHint_alex')) === '' && (await T(p, '#payHint_sam')).includes('estimated'));
nov = (await LS(p, K.mon))['2026-11'];
check('…and the mark: payEstimated is only Sam now', JSON.stringify(nov.payEstimated) === '{"sam":true}' && nov.pay.alex === 2200, JSON.stringify(nov));
await p.click('#t-analysis'); await p.waitForTimeout(300);
check('Analysis: November is now solid (actual)', (await p.$$eval('#anMonths svg path[data-kind]', l => l[3].getAttribute('data-kind'))) === 'actual');
await p.click('#t-pay'); await p.waitForTimeout(150);
await p.fill('#pay_sam', '1875'); await p.waitForTimeout(900);
check('Both typed: payEstimated goes from the saved month', !('payEstimated' in (await LS(p, K.mon))['2026-11']));

// ---------- I. Share ----------
await p.click('#shareTransfers'); await p.waitForTimeout(150);
const shared = await p.evaluate(() => window.__copied);
const onScreen = await p.$$eval('#steps .step', l => l.map(s => s.classList.contains('done')));
const lines = (shared || '').split('\n');
check('Share (in a browser) copies the transfers: title with the payday', lines[0] === 'Dovetail transfers for November 2026 (payday Wed 28 Oct 2026)' && (await T(p, '#toast')) === 'Transfers copied', shared);
check('…one line per transfer, in order, ticks as on screen', lines.length === 7 && lines.slice(1, 6).every((l, i) => l.startsWith((i + 1) + '. ' + (onScreen[i] ? '☑' : '☐') + ' ')) &&
  lines[1] === "1. ☑ Alex's current account → Joint bills account  £2,182.00 (ticked at £2,132.00: £50.00 more to send)", shared);
check('…and what\'s left', lines[6] === 'Left over this month: ' + (await p.textContent('#heroFloat')) + ' in Joint spending account', lines[6]);
check('The Share button is labelled for screen readers and sits beside the count', (await p.getAttribute('#shareTransfers', 'aria-label')) === "Share this month's transfers" && await p.$eval('#shareTransfers', b => b.parentElement.querySelector('#progressText') !== null));
await p.click('#next'); await p.waitForTimeout(150);
await p.click('#shareTransfers'); await p.waitForTimeout(150);
check('Estimated pay is said at the end', String(await p.evaluate(() => window.__copied)).endsWith('\nAmounts use estimated pay for Alex and Sam.'), await p.evaluate(() => window.__copied));


// ---------- D. Saved months ----------
await p.click('#prev'); await p.waitForTimeout(150);
const hist = await p.$$eval('#hist > *', l => l.map(e => e.className === 'mhead' ? '# ' + e.textContent : e.querySelector('b').textContent + ' | ' + e.querySelectorAll('span')[1].textContent));
check('"Saved months": Ahead (December), then This month and earlier', (await T(p, '#histBox summary')) === 'Saved months' && hist[0] === '# Ahead' && hist[1].startsWith('December 2026') && hist[2] === '# This month and earlier' && hist[3].startsWith('November 2026'), hist.join(' / '));
check('A month with no pay typed reads "Pay not typed in"', hist[1] === 'December 2026 | Pay not typed in', hist[1]);
check('No JS errors (example)', p.errs.length === 0, p.errs.join(' | '));

// ---------- G, J4. Settings order and What changed ----------
await p.click('#t-settings'); await p.waitForTimeout(150);
const so = await p.$$eval('#tab-settings > details, #tab-settings > section', l => l.map(e => e.id || e.querySelector('h2').textContent));
check('Settings order: … Payday, Appearance, Reminders & notifications, App lock, Backup, Help, About',
  JSON.stringify(so) === JSON.stringify(['sPeople', 'sAccounts', 'sBills', 'sIncome', 'sBudget', 'sSavings', 'sPayday', 'sLook', 'sNotify', 'sLock', 'sBackup', 'sHelp', 'About']), so.join(','));
check('About › What changed: closed, this version and its What\'s new lines', !(await p.$eval('#whatChanged', d => d.open)) &&
  await p.$eval('#whatChanged', d => d.textContent.includes('In version 2.9:') && d.querySelectorAll('li').length === 3) && await p.isVisible('#copyDetails'));
// J3: a monthly subscription's renewal reminder defaults to a week before.
await p.click('#sBills summary'); await p.waitForTimeout(80);
await p.click('#bill_x11 > button'); await p.waitForTimeout(80);
check('Streaming (monthly subscription, no renewal date): Remind me shows 1 week before', (await p.inputValue('#bl_x11')) === '7');
await p.fill('#br_x11', '2026-12-01'); await p.dispatchEvent('#br_x11', 'change'); await p.waitForTimeout(150);
let bx = (await LS(p, K.cfg)).bills.find(b => b.id === 'x11');
check('…setting the date stores a week', bx.renews === '2026-12-01' && bx.lead === 7, JSON.stringify(bx));
await p.click('#bill_x11 > button'); await p.click('#bill_x7 > button'); await p.waitForTimeout(80);
check('Broadband: Remind me shows 1 month before', (await p.inputValue('#bl_x7')) === '30');
await p.fill('#br_x7', '2027-02-01'); await p.dispatchEvent('#br_x7', 'change'); await p.waitForTimeout(150);
check('…and stores a month', (await LS(p, K.cfg)).bills.find(b => b.id === 'x7').lead === 30);
await p.click('#bill_x7 > button'); await p.click('#bill_x3 > button'); await p.waitForTimeout(80);
await p.fill('#br_x3', '2027-01-15'); await p.dispatchEvent('#br_x3', 'change'); await p.waitForTimeout(150);
check('Gym, which already has a choice (30): moving its date never changes it', (await LS(p, K.cfg)).bills.find(b => b.id === 'x3').lead === 30 && (await p.inputValue('#bl_x3')) === '30');
check('No date input names a format', await p.$$eval('input[type=date]', l => l.every(i => !i.placeholder)) && !/\b(dd|mm|yyyy)\b/i.test(await T(p, '#tab-settings')));
await ctx.close();

// ---------- I (app). Share through the phone's share sheet ----------
({ ctx, p } = await session({ today: TODAY, native: true }));
await p.click('#su_example'); await p.waitForTimeout(300);
await p.click('#shareTransfers'); await p.waitForTimeout(150);
const nat = await p.evaluate(() => window.__qaNative);
check('In the app, Share hands the text to the share sheet', nat.calls.some(c => c[0] === 'shareText' && c[1] === 'Dovetail transfers for November 2026') && nat.lastText.startsWith('Dovetail transfers for November 2026 (payday Wed 28 Oct 2026)\n1. ☐ '));
await ctx.close();

// ---------- A (fresh setup), J2 ----------
({ ctx, p } = await session({ today: TODAY }));
await walkSetup(p, 5);
await SETUP_FILL[5](p);
check('Setup step 5: an account that isn\'t for bills is one line with "+ Add a bill"', await p.$$eval('.su-bline', l => l.length) >= 1 &&
  (await p.$$eval('.su-bline', l => l.map(e => e.textContent))).every(t => /—\+ Add a bill$/.test(t)) && (await p.$$('section.su-bsec')).length >= 2);
check('…each with its colour stripe and a full label', await p.$$eval('.su-bline', l => l.every(e => parseFloat(getComputedStyle(e).borderLeftWidth) === 5 && e.querySelector('button').getAttribute('aria-label').startsWith('Add a bill paid from '))));
await p.click('#su_next'); await SETUP_FILL[6](p); await p.click('#su_next'); await p.waitForTimeout(100);
await p.click('#su_finish'); await p.waitForTimeout(300); await skipTour(p);
check('After setup: (at most one notice), hero, pay, transfers, This month in detail (closed), bills, saved months',
  JSON.stringify((await order(p)).filter(x => x !== 'notice' && x !== 'actionBanner')) === JSON.stringify(['hero', 'payCard', 'trSec', 'payDetails', 'accounts', 'histBox']) &&
  (await p.$$('#notice .card, #notice .banner')).length <= 1 && !(await p.$eval('#payDetails', d => d.open)), JSON.stringify(await order(p)));
check('No JS errors (setup)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- J5. Several reminders: one line, cut short ----------
const many = { schema: 5, setupDone: true, people: [{ id: 'p', name: 'Pat', payAccount: 'a', usualPay: 2000 }], accounts: [{ id: 'a', name: 'Main', colour: 'blue', leftoverTo: null }], bills: [], income: [], budgets: [], savings: [], doneLog: [], payday: {},
  reminders: ['Passport renewal for the whole family', 'Boiler service and gas safety check', 'Energy tariff'].map((n, i) => ({ id: 'r' + i, name: n, date: '2026-10-2' + (i + 1), lead: 30 })) };
({ ctx, p } = await session({ today: TODAY, w: 360, h: 740, storage: { [K.cfg]: many } }));
await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large')); await p.waitForTimeout(100);
const n3 = await p.$eval('#actionBanner .banner', b => { const t = b.querySelector('.t'); return { text: t.textContent, h: b.offsetHeight, cut: t.scrollWidth > t.clientWidth, view: b.querySelector('.go').getBoundingClientRect().right <= b.getBoundingClientRect().right }; });
check('Three reminders: one line, cut short with "…", View › still showing (360px, larger text)', n3.text === '3 reminders need attention: Passport renewal for the whole family, Boiler service and gas safety check and more' && n3.h < 70 && n3.cut && n3.view, JSON.stringify(n3));
check('No sideways scrolling at 360px with larger text', await noSideScroll(p, 360));
await ctx.close();

// ---------- Accessibility and layout: light and dark, 360 and 412, normal and larger text ----------
for (const [w, h, dark, large] of [[412, 915, false, false], [360, 740, true, true], [360, 740, false, true], [412, 915, true, false]]) {
  ({ ctx, p } = await session({ today: TODAY, w, h, dark }));
  await p.click('#su_example'); await p.waitForTimeout(300);
  if (large) { await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large')); await p.waitForTimeout(100); }
  const tag = `${w}px ${dark ? 'dark' : 'light'}${large ? ', larger text' : ''}`;
  const head = await p.$eval('#trSec .sech', s => { const h = s.querySelector('h2').getBoundingClientRect(), b = s.querySelector('#shareTransfers').getBoundingClientRect(); return { over: !(b.right <= h.left || b.left >= h.right || b.bottom <= h.top || b.top >= h.bottom), inside: b.right <= s.getBoundingClientRect().right + 1 }; });
  check('Transfers heading and Share don\'t overlap (' + tag + ')', !head.over && head.inside, JSON.stringify(head));
  await p.click('#payDetails summary'); await p.waitForTimeout(150);
  check('No sideways scrolling on Pay (' + tag + ')', await noSideScroll(p, w));
  let ax = await axe(p); check('Accessibility: Pay with This month in detail open (' + tag + ')', ax.length === 0, ax.join(' | '));
  await p.click('#t-due'); await p.waitForTimeout(150);
  ax = await axe(p); check('Accessibility: Reminders (' + tag + ')', ax.length === 0, ax.join(' | '));
  await p.click('#t-analysis'); await p.waitForTimeout(250);
  check('This month\'s label shows at this width (' + tag + ')', await p.$eval('#anMonths svg text[data-current]', t => t.textContent === 'Nov'));
  ax = await axe(p); check('Accessibility: Analysis (' + tag + ')', ax.length === 0, ax.join(' | '));
  await p.click('#t-settings'); await p.waitForTimeout(150); await p.click('#whatChanged summary');
  ax = await axe(p); check('Accessibility: Settings with What changed open (' + tag + ')', ax.length === 0, ax.join(' | '));
  check('No JS errors (' + tag + ')', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// Keyboard: Tab reaches Share after the transfers' "?", and the summary of This month in detail after the last transfer.
({ ctx, p } = await session({ today: TODAY }));
await p.click('#su_example'); await p.waitForTimeout(300);
await p.focus('#trSec .helpq'); await p.keyboard.press('Tab');
check('Keyboard: after the transfers\' "?" comes Share', await p.evaluate(() => document.activeElement.id) === 'shareTransfers');
await p.focus('#steps li:last-child .copy'); await p.keyboard.press('Tab');
check('…after the last transfer, the line about bills that aren\'t monthly, then This month in detail', await p.evaluate(() => document.activeElement.id) === 'nmNote');
await p.keyboard.press('Tab');
check('…then the summary of This month in detail', await p.evaluate(() => document.activeElement.parentElement.id) === 'payDetails');
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
check('Enter opens it', await p.$eval('#payDetails', d => d.open));
await ctx.close();

await finish();
