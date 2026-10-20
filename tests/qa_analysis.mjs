// Analysis tab: every section with the made-up 1.x household (figures hand-checked against its backup), the example
// household, an empty household and a household with top-ups; charts labelled, tables available, keyboard readable.
import { suite, session, sampleStorage, household, K, T, LS, goMonth, openDetails } from './lib.mjs';
const { check, finish } = suite('Analysis tab');
const txt = (p, s) => p.$eval(s, e => e.textContent);
const card = (p, id) => T(p, '#' + id);
const words = s => s.trim().split(/\s+/).length;

// ---------- 1. Our household (October typed, November on screen) ----------
let { ctx, p } = await session({ storage: sampleStorage(true) });
await p.click('#t-analysis'); await p.waitForTimeout(200);
check('Analysis tab opens with the month bar (November 2026)', await p.isVisible('#tab-analysis') && await p.isVisible('#monthBar') && (await T(p, '#monthLabel')) === 'November 2026' && await p.evaluate(() => location.hash) === '#analysis');
const order = await p.$$eval('#analysis section.card', s => s.map(x => x.id));
check('Cards in order: Month by month first, then the picture, categories and saved so far; history and price changes hidden with nothing to show', JSON.stringify(order) === JSON.stringify(['anMonths', 'anPicture', 'anCategories', 'anSaved']), JSON.stringify(order));
check('No intro line and no card subtitles', !(await T(p, '#analysis')).includes('nothing to type in') && (await p.$$('#analysis section.card > h2 + .small.muted')).length === 0);
check('Fewer than 350 words on the tab (was 658)', words(await p.$eval('#analysis', e => e.innerText)) < 350, String(words(await p.$eval('#analysis', e => e.innerText))));

let mon = await card(p, 'anMonths');
check('2.9.1: no verdict line when this month is fine and no month ahead is short (the chart says it)', (await p.$('#anVerdict')) === null && (await p.$$('#anMonths .banner')).length === 0 && !mon.includes('Tightest month ahead'));
check('2.9.1: no heaviest and lightest sentence, and no one-offs line under the chart (the readings and the figures have them)', !mon.includes('Heaviest month') && !mon.includes('Lightest') && !mon.includes('One-offs:') && (await p.$('#anMonthsOneOffs')) === null && (await p.$$('#anMonths > div.small')).length === 0, mon.slice(0, 300));
check('One chart in the card, not two', (await p.$$('#anMonths svg')).length === 1 && (await p.$('#anHeavy')) === null && (await p.$('#anProjected')) === null);
check('Chart is an SVG image with a description', (await p.getAttribute('#anMonths svg', 'role')) === 'img' && (await p.getAttribute('#anMonths svg', 'aria-label')).includes('Left over each month from August 2026 to July 2027. November 2026 (this month) £267.02 left over. Tightest from November 2026: December 2026 £168.48.'));
check('Actual vs projected: October (typed pay) is solid, the other 11 are hatched', (await p.$$('#anMonths svg path[data-kind="actual"]')).length === 1 && (await p.$$('#anMonths svg path[data-kind="projected"]')).length === 11 &&
  await p.$eval('#anMonths svg path[data-kind="projected"]', e => e.getAttribute('fill').startsWith('url(#') && !!document.querySelector(e.getAttribute('fill').slice(4, -1) + ' line')));
// 2.7: the month on screen's bar has an ink outline and its label is bold (no box round it, no "this month" text on the chart).
check('The month on screen: its bar outlined, its label bold, and no box or "this month" text on the chart', (await p.$('#anMonths svg rect[data-current]')) === null &&
  await p.$$eval('#anMonths svg text', t => !t.some(x => x.textContent === 'this month') && t.filter(x => x.getAttribute('font-weight') === '700').map(x => x.textContent).join() === 'Nov') &&
  (await p.$$('#anMonths svg path[data-current][stroke="var(--ink)"]')).length === 1);
check('October (typed pay) has a line at its predicted float; projected months have none', (await p.$$('#anMonths svg line[data-kind="predicted"]')).length === 1 && (await p.$$('#anMonths .keyrow .sw.line')).length === 1 && (await T(p, '#anMonths .keyrow')).includes('Predicted'));
check('One key explains actual and estimated (hatched swatch)', (await p.$$('#anMonths .keyrow')).length === 1 && (await T(p, '#anMonths .keyrow')).includes('Actual (pay typed in)') && (await T(p, '#anMonths .keyrow')).includes('Estimated') && !(await T(p, '#anMonths .keyrow')).includes('Projected') && (await p.$$('#anMonths .keyrow .sw.hatch')).length === 1);
await p.focus('#anMonths svg'); await p.waitForTimeout(50);
check('Keyboard: focusing the chart reads the first month: float, going out, what makes it differ', (await T(p, '#anMonths .tip')).includes('August 2026: £266.83') && (await T(p, '#anMonths .tip')).includes('£4,280.57 going out') && (await T(p, '#anMonths .tip')).includes('Council Tax £198.00, TV Licence £43.64') && (await T(p, '#anMonths .tip')).includes('Estimated'), await T(p, '#anMonths .tip'));
await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(50);
const oct = await T(p, '#anMonths .tip');
check('Keyboard: October reads its float, outgoings, its one-off and that it\'s actual', oct.includes('October 2026: £215.66') && oct.includes('£4,331.93 going out') && oct.includes('Council Tax £198.00, Overdraft from last month £95.00 (one-off)') && oct.includes('Actual: pay typed in, £0.19 more than the £215.47 predicted'), oct);
check('Keyboard readings are announced through a live region', (await p.$eval('#anMonths .sr', e => e.getAttribute('aria-live') + '|' + e.textContent)).startsWith('polite|October 2026: £215.66. £4,331.93 going out. Council Tax £198.00, Overdraft'));
await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(50);
check('December reads "Kestrel home £142.18" as what\'s different', (await T(p, '#anMonths .tip')).includes('December 2026: £168.48') && (await T(p, '#anMonths .tip')).includes('£4,379.11 going out') && (await T(p, '#anMonths .tip')).includes('Council Tax £198.00, Kestrel home £142.18'));
await p.keyboard.press('Escape');
check('Escape hides the reading', await p.isHidden('#anMonths .tip'));
check('The button under the chart says "Show the figures"', (await T(p, '#anMonths .linkbtn[aria-controls]')) === 'Show the figures');
await p.click('#anMonths .linkbtn[aria-controls]');
const mrows = await p.$$eval('#anMonthsTable tbody tr', r => r.map(x => [...x.children].map(c => c.textContent)));
check('Table: 12 months from Aug 2026 with float, the outgoings and a "What\'s different" column', mrows.length === 12 && mrows[0][0] === 'Aug 2026' && mrows[0][1] === '£266.83' && mrows[2][0] === 'Oct 2026 (actual)' && mrows[2][1] === '£215.66 (predicted £215.47)' && mrows[2][6] === '£4,331.93' && mrows[2][7] === 'Council Tax £198.00, Overdraft from last month £95.00 (one-off)' && mrows[3][1] === '£267.02' && mrows[7][7] === 'Only the monthly bills' &&
  JSON.stringify(await p.$$eval('#anMonthsTable th', t => t.map(x => x.textContent))) === JSON.stringify(['Month', 'Left over', 'Bills', 'Budgets', 'Savings', 'One-offs out', 'Going out', "What's different"]), JSON.stringify(mrows.slice(0, 4)));
await p.click('#anMonths .linkbtn[aria-controls]');

let pic = await card(p, 'anPicture');
check('Monthly picture: one tile, saved from pay 11%', (await p.$$('#anPicture .stat')).length === 1 && (await T(p, '#anPicture .stat')).includes('Saved from pay') && (await T(p, '#anPicture .stat')).includes('11%'), pic.slice(0, 200));
check('…no "Committed to bills" or "Spending and left over" tiles, and no sentence restating the figures', !pic.includes('Committed to bills') && !pic.includes('£2,097') && !pic.includes('You save'));
check('Legend: bills £1,950.33 42.9%, budgets £1,780.00, savings £500.00, left over £317.26', ['£1,950.33', '42.9%', '£1,780.00', '£500.00', '£317.26'].every(v => pic.includes(v)), pic);
check('2.9.1: no income sentence under the key (each person\'s pay is in the figures)', !pic.includes('Income £4,547.59 a month') && !pic.includes('average of 1 month'));
check('Stacked bar is labelled for screen readers', (await p.getAttribute('#anPicture .stack', 'role')) === 'img' && (await p.getAttribute('#anPicture .stack', 'aria-label')).startsWith('Of £4,547.59 income a month: Bills £1,950.33'));
check('"Average left over" in the legend, and no note under it (2.9.1)', pic.includes('Average left over') && !pic.includes('spread over the year'));
check('This month\'s float is no longer repeated here (it\'s the verdict above)', !pic.includes('as on the Pay tab') && (await p.$('#anThisMonth')) === null);
check('Legend text is ink, not the series colour', await p.$eval('#anPicture .legend li span', e => getComputedStyle(e).color === getComputedStyle(document.body).color));
await p.click('#anPicture .linkbtn[aria-controls]');
check('"Show the figures" reveals the figures and says "Hide the figures"', await p.isVisible('#anPictureTable') && (await T(p, '#anPictureTable')).includes('£4,547.59') && (await p.getAttribute('#anPicture .linkbtn[aria-controls]', 'aria-expanded')) === 'true' && (await T(p, '#anPicture .linkbtn[aria-controls]')) === 'Hide the figures' && (await p.getAttribute('#anPictureTable', 'aria-label')) === 'The monthly picture: the figures');
const prows = await p.$$eval('#anPictureTable tbody tr', r => r.map(x => [...x.children].map(c => c.textContent)));
check('…with each person\'s pay under Income: Alex and Sam (averages of typed pay) and other income', JSON.stringify(prows.slice(0, 4)) === JSON.stringify([['Income', '£4,547.59', '100%'], ["Alex's pay (average of 1 month)", '£2,291.46', '50.4%'], ["Sam's pay (average of 1 month)", '£2,128.73', '46.8%'], ['Other income', '£127.40', '2.8%']]), JSON.stringify(prows));
await p.click('#anPicture .linkbtn[aria-controls]');
check('…and hides it again', await p.isHidden('#anPictureTable'));

const cats = await p.$$eval('#anCategories .catrow:not(.subs)', r => r.map(x => x.children[0].textContent));
check('Where the money goes: categories biggest first, uncategorised last', JSON.stringify(cats) === JSON.stringify(['Housing (2)', 'Utilities (2)', 'Debt (1)', 'Insurance (3)', 'Subscriptions (5)', 'Savings (1)', 'Transport (2)', 'Memberships (1)', 'Health (1)', 'Not categorised (13)']), JSON.stringify(cats));
check('Housing £11,540.40 a year, £961.70 a month, 48.1% of bills', (await T(p, '#cat_housing')).includes('£11,540.40 a year') && (await T(p, '#cat_housing')).includes('£961.70 a month · 48.1% of bills'));
check('Total: £24,003.90 a year on bills, £2,000.33 a month', (await card(p, 'anCategories')).includes('£24,003.90 a year on bills, £2,000.33 a month.'));
check('The Savings row says it\'s counted as saving in the monthly picture (the £50 the two "bills" figures differ by)', (await T(p, '#cat_savings')).includes('£50.00 a month · 2.5% of bills · counted as savings in the monthly picture'));
await p.click('#cat_housing'); await p.waitForTimeout(100);
check('Tapping a category lists its bills', await p.isVisible('#catb_housing') && (await T(p, '#catb_housing')).includes('Mortgage 1') && (await p.getAttribute('#cat_housing', 'aria-expanded')) === 'true');
await p.click('#cat_utilities'); await p.waitForTimeout(100);
check('Opening another category closes the first', await p.isHidden('#catb_housing') && await p.isVisible('#catb_utilities'));
check('Bills not paid monthly say how often', (await T(p, '#catb_utilities')).includes('Council Tax (10× a year)'));
check('No "bills have no category" banner; the link is in the Not categorised row', !(await card(p, 'anCategories')).includes('no category yet') && (await T(p, '#catb_none')).includes('Give these bills a category'));
check('Subscriptions and memberships: a highlighted line at the top of "Where the money goes"', (await p.$eval('#anCategories .catrow', e => e.id)) === 'cat_subs' && (await T(p, '#cat_subs')).includes('£1,110.08 a year goes on subscriptions and memberships') && (await T(p, '#cat_subs')).includes('£92.51 a month'));
await p.click('#cat_subs'); await p.waitForTimeout(80);
let subs = await T(p, '#catb_subs');
check('…that opens the list when tapped, Leisure Centre first', await p.isVisible('#catb_subs') && (await p.getAttribute('#cat_subs', 'aria-expanded')) === 'true' && subs.indexOf('Leisure Centre') >= 0 && subs.indexOf('Leisure Centre') < subs.indexOf('Spotify'), subs);
await p.click('#cat_housing'); await p.waitForTimeout(80);
check('…and closes when another category opens', await p.isHidden('#catb_subs') && await p.isVisible('#catb_housing'));
await p.click('#cat_housing');

let saved = await card(p, 'anSaved');
check('Saved so far: £250.00 since October 2026', saved.includes('£250.00 saved since October 2026, £250.00 of it this tax year (2026–27).'), saved.slice(0, 200));
check('Each item shows its total only; consistency is in the table', saved.includes('Stocks and shares ISA') && saved.includes('£200.00') && saved.includes('Junior ISA') && !saved.includes('Ticked in') && !saved.includes('direct debit') && (await p.$$('#anSaved .meter')).length === 0);
await p.click('#anSaved .linkbtn[aria-controls]');
const srows = await p.$$eval('#anSavedTable tbody tr', r => r.map(x => [...x.children].map(c => c.textContent)));
check('Saved table: Stocks and shares ISA ticked 1 of 1 month (100%), Holiday 0 of 1 (0%), Junior ISA a direct debit', JSON.stringify(srows) === JSON.stringify([['Stocks and shares ISA', '£200.00', '£200.00', '1 of 1 month (100%)'], ['Holiday savings', '£0.00', '£0.00', '0 of 1 month (0%)'], ['Junior ISA', '£50.00', '£50.00', 'Direct Debit, 1 month']]), JSON.stringify(srows));
await p.click('#anSaved .linkbtn[aria-controls]');
check('Tax year note in one line', saved.includes('Tax years run 6 April to 5 April.') && !saved.includes('first month you used the app'));
await p.goBack(); await p.waitForTimeout(150);
check('Back from Analysis returns to Pay', await p.isVisible('#tab-pay'));

// renewing a bill feeds price changes; typing a second month of pay feeds the history
await p.click('#t-due'); await p.click('#dueList .rem.over .btn:not(.ghost)'); await p.fill('input[id^="na_b_"]', '36.00'); await p.click('#dueList .rem.over .ed .btn:has-text("Save")'); await p.waitForTimeout(150);
const lc = (await LS(p, K.cfg)).bills.find(b => b.name === 'Leisure Centre');
check('Renewal saved as history: 15 Oct 2026, £34.00 → £36.00, next 12 Apr 2027', JSON.stringify(lc.history) === JSON.stringify([{ on: '2026-10-15', date: '2027-04-12', from: 34, to: 36 }]), JSON.stringify(lc.history));
await p.click('#t-pay'); await p.fill('#pay_alex', '2400'); await p.fill('#pay_sam', '2300'); await p.waitForTimeout(900);
await p.click('#t-analysis'); await p.waitForTimeout(150);
const prices = await card(p, 'anPrices');
check('Price changes appears: Leisure Centre £34.00 → £36.00, up 5.9%', prices.includes('Leisure Centre') && prices.includes('£34.00 → £36.00') && prices.includes('up 5.9%') && prices.includes('went up 5.9% overall: £24.00 a year more'), prices);
check('History appears: one float chart once two months are typed', (await p.$$('#anHistory svg')).length === 1 && (await p.$$('#anHistory svg path[data-kind]')).length === 2);
await p.focus('#anHistory svg'); await p.waitForTimeout(50);
// (£2 less than October's £215.66: Leisure Centre was renewed at £36.00 above)
check('…its reading has the float and each person\'s pay', (await T(p, '#anHistory .tip')).includes('October 2026: £213.66 left over') && (await T(p, '#anHistory .tip')).includes('Alex: £2,291.46') && (await T(p, '#anHistory .tip')).includes('Sam: £2,128.73'), await T(p, '#anHistory .tip'));
await p.keyboard.press('Escape');
await p.click('#anHistory .linkbtn[aria-controls]');
check('History table lists both months', (await T(p, '#anHistoryTable')).includes('Oct 2026') && (await T(p, '#anHistoryTable')).includes('Nov 2026') && (await T(p, '#anHistoryTable')).includes('£2,400.00'));
// a big one-off makes a month short
await p.click('#t-pay'); await goMonth(p, 'February 2027'); await openDetails(p);
await p.click('#addOneOff'); await p.fill('#oo_name_new', 'Boiler'); await p.fill('#oo_amt_new', '900'); await p.click('#oo_add'); await p.waitForTimeout(150);
await goMonth(p, 'November 2026'); await p.click('#t-analysis'); await p.waitForTimeout(150);
mon = await card(p, 'anMonths');
check('A £900 one-off in February: this month is still fine, February is named as short, with advice', (await p.$('#anVerdict')) === null && mon.includes('Short: February 2027 by £') && mon.includes('Move a one-off to another month or trim a spending budget.'), mon.slice(0, 400));
check('…and no heaviest-month sentence or one-offs line (the figures have them)', !mon.includes('Heaviest month') && (await p.$('#anMonthsOneOffs')) === null);
check('…and "Short" joins the key', (await T(p, '#anMonths .keyrow')).includes('Short'));
const feb = await p.$$eval('#anMonthsTable tbody tr', r => r.map(x => x.textContent).find(t => t.startsWith('Feb 2027')));
check('…and its "What\'s different" says why', feb.includes('(short)') && feb.includes('TV Licence £43.64, Boiler £900.00 (one-off)'), feb);
await goMonth(p, 'February 2027'); await p.waitForTimeout(150);
check('With the short month on screen the verdict is a red banner', (await p.$eval('#anVerdict', e => e.className)) === 'banner bad' && (await T(p, '#anVerdict')).startsWith('February 2027 is short by £') && (await T(p, '#anVerdict')).includes('Move a one-off'));
await goMonth(p, 'December 2026'); await p.waitForTimeout(150);
check('The month bar moves the projections (from December 2026)', (await T(p, '#monthLabel')) === 'December 2026' && (await p.getAttribute('#anMonths svg', 'aria-label')).includes('December 2026 (this month)') && (await p.$eval('#anMonthsTable tbody tr', r => r.textContent)).startsWith('Sep 2026'));
await p.click('#cat_none'); await p.click('#catb_none .linkbtn');
await p.waitForTimeout(150);
check('"Give these bills a category" opens Settings › Bills', await p.evaluate(() => location.hash) === '#settings' && await p.$eval('#sBills', e => e.open));
check('No JS errors (our household)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2. Example household: every section has something ----------
({ ctx, p } = await session());
await p.click('#su_example'); await p.waitForTimeout(200); await p.click('#t-analysis'); await p.waitForTimeout(200);
check('Example: monthly picture with a savings rate', /Saved from pay\s*\d/i.test(await card(p, 'anPicture')));
check('Example: the chart describes this month for screen readers', /\(this month\)( short by £| £[\d,.]+ left over)/.test(await p.getAttribute('#anMonths svg', 'aria-label')), await p.getAttribute('#anMonths svg', 'aria-label'));
await p.focus('#anHistory svg'); await p.waitForTimeout(50);
check('Example: the history reading names each person\'s pay', (await T(p, '#anHistory .tip')).includes('Alex: £') && (await T(p, '#anHistory .tip')).includes('Sam: £'));
await p.keyboard.press('Escape');
await p.click('#anSaved .linkbtn[aria-controls]');
check('Example: saved so far\'s table shows a missed month (Emergency fund 2 of 3)', (await T(p, '#anSavedTable')).includes('2 of 3 months (66.7%)'));
check('Example: price change for Energy (£104.00 → £118.00)', (await card(p, 'anPrices')).includes('£104.00 → £118.00'));
check('Example: the one-off next month is in that month\'s figures', (await p.$eval('#anMonthsTable', e => e.textContent)).includes('Car service £185.00 (one-off)'));
check('Example: subscriptions listed', (await T(p, '#catb_subs')).includes('Music') && (await T(p, '#catb_subs')).includes('Gym'));
check('No JS errors (example)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 3. Empty household ----------
({ ctx, p } = await session({ storage: { [K.cfg]: household({ people: [{ id: 'p', name: 'Pat', payAccount: 'a', usualPay: 1500 }], accounts: [{ id: 'a', name: 'Main' }] }) } }));
await p.click('#t-analysis'); await p.waitForTimeout(150);
const all = await T(p, '#analysis');
check('Empty household: a clear starting point and friendly empty states', all.includes('Add your bills, spending budgets and savings in Settings') && all.includes('No bills yet') && all.includes('Add a savings transfer'));
check('Empty household: month by month, history and price changes are hidden, not explained', (await p.$('#anMonths')) === null && (await p.$('#anHistory')) === null && (await p.$('#anPrices')) === null && !all.includes('two months'));
check('Empty household: monthly picture still shows income and a 0% savings rate', (await card(p, 'anPicture')).includes('£1,500.00') && (await card(p, 'anPicture')).includes('0%'));
await p.click('#analysis .empty .btn'); await p.waitForTimeout(150);
check('Its button opens Settings › Bills', await p.evaluate(() => location.hash) === '#settings' && await p.$eval('#sBills', e => e.open));
check('No JS errors (empty)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 4. Bills but no pay at all: a missing figure, not advice ----------
({ ctx, p } = await session({ storage: { [K.cfg]: household({ people: [{ id: 'p', name: 'Pat', payAccount: 'a' }], accounts: [{ id: 'a', name: 'Main' }], bills: [{ id: 'b', name: 'Rent', amount: 700, account: 'a', months: [] }] }) } }));
await p.click('#t-analysis'); await p.waitForTimeout(150);
check('No pay: the verdict asks for pay instead of calling every month short', (await p.$eval('#anVerdict', e => e.className)) === 'lead' && (await T(p, '#anVerdict')).startsWith('Add each person\'s pay') && !(await card(p, 'anMonths')).includes('Move a one-off'));
check('No JS errors (no pay)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 5. A household with top-ups ----------
({ ctx, p } = await session({ storage: { [K.cfg]: household({ people: [{ id: 'q', name: 'Quinn', payAccount: 'x' }, { id: 'r', name: 'Rae', payAccount: 'y' }],
  accounts: [{ id: 'x', name: 'Bills A', leftoverTo: 'y' }, { id: 'y', name: 'Hub' }], bills: [{ id: 'b', name: 'Mortgage', amount: 700, account: 'x', months: [] }] }),
  [K.mon]: { '2026-08': { pay: { q: 500, r: 2000 } }, '2026-09': { pay: { q: 800, r: 2000 } }, '2026-10': { pay: { q: 600, r: 2000 } } } } }));
await goMonth(p, 'October 2026'); await p.click('#t-analysis'); await p.waitForTimeout(150);
check('Top-ups: Bills A needed topping up in 2 of the last 3 months, £150.00 on average, with a suggestion',
  (await card(p, 'anTopUps')).includes('Bills A needed topping up in 2 of the last 3 months you used the app, by £150.00 on average. Moving a bill of about £150.00 from Bills A to Hub would stop that.') && (await T(p, '#anTopUpsH')) === 'Accounts that ran short' && (await card(p, 'anTopUps')).includes("That's a top-up."), await card(p, 'anTopUps').catch(() => ''));
check('No JS errors (top-ups)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
await finish();
