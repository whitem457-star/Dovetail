// 2.3 look and feel: the Pay tab hero, account badges, money style, drawn ticks with haptics, fades between pages,
// and the restyled surfaces. Behaviour and figures are covered by the other suites.
import { suite, session, sampleStorage, household, K, T, LS, swipe, axe, noSideScroll, openDetails } from './lib.mjs';
const { check, finish } = suite('Look and feel (2.3)');

let { ctx, p } = await session({ storage: sampleStorage(true), native: true, w: 360, h: 800 });
check('The Pay tab opens on the hero: what\'s left this month, as on the float card', (await T(p, '#heroH')) === 'Left over this month' && (await p.textContent('#heroFloat')) === (await p.textContent('#floatV')) && (await p.textContent('#heroFloat')) === '£267.02');
check('…in the one account that keeps its leftover', (await T(p, '#hero .where')) === 'in Joint spending account');
check('…with the transfers\' progress as a labelled ring', (await p.getAttribute('#hero .ring', 'aria-label')) === '0 of 5 transfers done' && (await p.textContent('#hero .rt b')) === '0/5');
check('…and no reconciliation warning when the figures add up', (await p.$('#check')) === null);
check('The hero comes before the pay boxes; one-offs come after the transfers', await p.evaluate(() => { const o = id => document.getElementById(id).compareDocumentPosition.bind(document.getElementById(id)); return !!(o('hero')(document.getElementById('payGrid')) & 4) && !!(o('steps')(document.getElementById('oneOffCard')) & 4); }));
check('Amounts are set with smaller pence, but read the same', await p.$eval('#heroFloat .p', e => e.textContent === '.02') && (await p.textContent('#steps .amt')) === '£1,974.58');
check('Account badges: initials drawn by CSS, hidden from screen readers, not in the text', await p.evaluate(() => { const a = document.querySelector('#steps .route .av'); return a && a.getAttribute('aria-hidden') === 'true' && a.getAttribute('data-i') === 'A' && a.textContent === '' && getComputedStyle(a, '::before').content === '"A"'; }));
check('…a joint account gets its two initials (Joint bills account → JB)', await p.$$eval('#steps .route .av', a => a.some(x => x.getAttribute('data-i') === 'JB')));
check('Each person\'s pay row has their badge and the account it goes into', (await T(p, '#payGrid')).includes('Into Current account 1') && (await p.$$('#payGrid .payrow .av')).length === 2);
// ticking
await p.focus('#steps li:nth-child(1) .tick'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
check('Ticking: the hero ring moves on, the tick is drawn, the amount fades (no strike-through)', (await p.getAttribute('#hero .ring', 'aria-label')) === '1 of 5 transfers done' &&
  await p.$eval('#steps li:nth-child(1)', li => li.classList.contains('done') && getComputedStyle(li.querySelector('.tick svg')).strokeDashoffset === '0px' && getComputedStyle(li.querySelector('.amt')).textDecorationLine === 'none' && getComputedStyle(li.querySelector('.amt')).color !== getComputedStyle(document.body).color));
check('…keyboard focus stays on that transfer\'s tick', await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('tick') && document.activeElement.closest('li') === document.querySelector('#steps li:nth-child(1)')));
check('…and the phone gives a light tap', await p.evaluate(() => window.__qaNative.calls.filter(c => c[0] === 'haptic').pop()[1] === 'tick'));
await p.keyboard.press('Enter'); await p.waitForTimeout(100);
check('Unticking gives a different tap', await p.evaluate(() => window.__qaNative.calls.filter(c => c[0] === 'haptic').pop()[1] === 'untick'));
for (const i of [1, 2, 3, 4, 5]) { await p.click(`#steps li:nth-child(${i}) .tick`); await p.waitForTimeout(60); }
check('No axe violations with transfers ticked (faded amounts keep their contrast)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('The last tick: "All done" and a stronger tap', (await T(p, '#warnings')).includes('All transfers done') && await p.evaluate(() => window.__qaNative.calls.filter(c => c[0] === 'haptic').pop()[1] === 'done') && (await p.textContent('#hero .rt b')) === '5/5');
// surfaces and labels
check('Section titles are sentence case, not capitals', await p.$eval('#trH', h => getComputedStyle(h).textTransform === 'none'));
check('Cards have no outline but a soft shadow (light mode)', await p.$eval('#payCard', c => getComputedStyle(c).borderTopWidth === '0px' && getComputedStyle(c).boxShadow !== 'none'));
await openDetails(p);
check('"Not every month" lists this month only', !(await T(p, '#due')).includes('Coming up') && await p.isVisible('#nmAll'));
check('No JS errors', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// dark: no shadows, tonal surfaces
({ ctx, p } = await session({ storage: sampleStorage(true), dark: true }));
await p.click('#steps li:nth-child(1) .tick'); await p.waitForTimeout(100);
check('No axe violations in dark with a transfer ticked', (await axe(p)).length === 0, (await axe(p)).join(' | '));
check('Dark mode: cards are set apart by tone, without shadows', await p.$eval('#payCard', c => getComputedStyle(c).boxShadow === 'none' && getComputedStyle(c).backgroundColor !== getComputedStyle(document.body).backgroundColor));
await ctx.close();

// motion: a quick fade between tabs, a slide when the month changes (swipe or arrows); none for reduced motion
({ ctx, p } = await session({ storage: sampleStorage(true), reducedMotion: 'no-preference', touch: true }));
await p.click('#t-analysis'); await p.waitForTimeout(30);
check('Changing tab fades the page in', await p.$eval('#tab-analysis', e => e.classList.contains('fadein') && getComputedStyle(e).animationName === 'fadein'));
await p.waitForTimeout(400);
check('…briefly', !(await p.$eval('#tab-analysis', e => e.classList.contains('fadein'))));
await swipe(p, 300, 200, 150, 200); await p.waitForTimeout(10);
check('A swipe slides the next month in from the side', await p.$eval('#tab-analysis', e => e.classList.contains('slide-l')));
await p.waitForTimeout(400); await swipe(p, 100, 200, 250, 200); await p.waitForTimeout(10);
check('…and swiping back slides it in from the other side', await p.$eval('#tab-analysis', e => e.classList.contains('slide-r')));
await p.click('#t-pay'); await p.waitForTimeout(400);
check('Going to a tab fades it in (no slide)', await p.$eval('#tab-pay', e => !e.classList.contains('slide-l') && !e.classList.contains('slide-r')));
await p.click('#next'); await p.waitForTimeout(20);
check('The › arrow slides the next month in too', await p.$eval('#tab-pay', e => e.classList.contains('slide-l')));
await p.click('#prev'); await p.waitForTimeout(500);
const frames = await p.evaluate(async () => { const seen = []; const inp = document.getElementById('pay_alex'); inp.value = '2500'; inp.dispatchEvent(new Event('input'));
  for (let i = 0; i < 30; i++) { seen.push(document.getElementById('heroFloat').textContent); await new Promise(r => requestAnimationFrame(r)); } return seen; });
check('The hero figure rolls to its new value without ever going blank', frames.every(f => /^−?£[\d,]+\.\d\d$/.test(f)) && new Set(frames).size > 2, frames.join(' | '));
await p.waitForTimeout(600);
check('…landing on the same figure as the float card', (await p.textContent('#heroFloat')) === (await p.textContent('#floatV')));
await ctx.close();
({ ctx, p } = await session({ storage: sampleStorage(true) }));
await p.click('#t-analysis'); await p.waitForTimeout(30);
check('With reduced motion nothing animates', !(await p.$eval('#tab-analysis', e => e.classList.contains('fadein') || getComputedStyle(e).animationName !== 'none')));
await ctx.close();

// a short month: the hero says so in the warning colour
({ ctx, p } = await session({ storage: { [K.cfg]: household({ schema: 5, people: [{ id: 'a', name: 'Ann', payAccount: 'x', usualPay: 500 }], accounts: [{ id: 'x', name: 'Current', colour: 'blue', leftoverTo: null }],
  bills: [{ id: 'r', name: 'Rent', amount: 800, account: 'x', months: [] }] }) } }));
check('Short month: "Short this month" with the shortfall in red', (await T(p, '#heroH')) === 'Short this month' && (await p.textContent('#heroFloat')) === '−£300.00' && await p.$eval('#hero', h => h.classList.contains('neg')));
check('…and no ring when there are no transfers', (await p.$('#hero .ring')) === null);
await ctx.close();

// one account short while the total is fine; a big float; long names at 360px with larger text
({ ctx, p } = await session({ w: 360, h: 800, storage: { [K.cfg]: household({ schema: 5, appearance: { theme: 'system', textSize: 'large' },
  people: [{ id: 'a', name: 'Rosalind', payAccount: 'x', usualPay: 250000 }],
  accounts: [{ id: 'x', name: 'Santander Everyday Current Account With A Long Name', colour: 'red', leftoverTo: null }, { id: 'y', name: 'Barclays Holiday Saver', colour: 'gold', leftoverTo: null }],
  bills: [{ id: 'r', name: 'Hotel deposit', amount: 300, account: 'y', months: [] }] }) } }));
check('One account short: the hero says which, even though the total is fine', (await T(p, '#heroH')) === 'Left over this month' && (await T(p, '#hero .hwarn')) === 'Barclays Holiday Saver is short by £300.00');
check('A big float gets smaller type rather than breaking mid-number', await p.$eval('#heroFloat', e => e.classList.contains('long') && e.getBoundingClientRect().height < 60));
check('Long account names wrap: no sideways scrolling at 360px with larger text', await noSideScroll(p, 360));
check('No axe violations (long names, larger text)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await ctx.close();

// 2.4: the figures don't reconcile (a bill on an account that no longer exists): a warning in the hero, light and dark,
// 360px with larger text
for (const dark of [false, true]) {
  ({ ctx, p } = await session({ w: 360, h: 800, dark, storage: { [K.cfg]: household({ schema: 5, appearance: { theme: 'system', textSize: 'large' },
    people: [{ id: 'a', name: 'Ann', payAccount: 'x', usualPay: 1000 }], accounts: [{ id: 'x', name: 'Current', colour: 'blue', leftoverTo: null }],
    bills: [{ id: 'r', name: 'Gym', amount: 25, account: 'gone', months: [] }] }) } }));
  const tag = dark ? ' (dark)' : '';
  check('Figures off: the hero warns, says by how much and offers "Open accounts"' + tag, (await T(p, '#hero #check')).includes("The figures don't add up: off by £25.00") && (await T(p, '#check button')) === 'Open accounts');
  check('…no sideways scrolling and no axe violations' + tag, await noSideScroll(p, 360) && (await axe(p)).length === 0, (await axe(p)).join(' | '));
  await ctx.close();
}

// nobody set up yet: no hero, just the prompt to add people
({ ctx, p } = await session({ storage: { [K.cfg]: household({ schema: 5, accounts: [{ id: 'x', name: 'Current', colour: 'blue', leftoverTo: null }] }) } }));
check('No people yet: no hero, just the prompt', await p.isHidden('#hero') && (await T(p, '#payGrid')).includes('Add the people'));
await ctx.close();
await finish();
