// Pay tab behaviour on our upgraded household (ported from the 1.1 and 1.3 suites): typing pay, estimates,
// ticks, months and irregular bills, history, editing bills in Settings, back button and the payday setting.
import { suite, session, sampleStorage, K, T, LS, amts, float, typeIn, goMonth } from './lib.mjs';
const { check, finish } = suite('Pay tab');

let { ctx, p } = await session({ storage: sampleStorage(false) });
check('Opens on the Pay tab, budget month November 2026', (await T(p, '#monthLabel')) === 'November 2026' && await p.isVisible('#tab-pay'));
check('Estimate banner while pay boxes are empty', (await T(p, '#payBanner')).includes('usual pay'));
check('Hint shows the usual pay being used', (await T(p, '#payHint_alex')) === 'Using usual pay: £2,280.00');

// ---------- typing pay ----------
await typeIn(p, '#pay_alex', '2,401.25');
check('Comma in amount accepted (Alex → £2,084.37)', (await amts(p))[0] === '£2,084.37', (await amts(p))[0]);
await typeIn(p, '#pay_sam', '23x0');
check('Invalid amount shows an error', await p.$eval('#payBox_sam', e => e.classList.contains('err')) && (await T(p, '#payHint_sam')).includes('Enter an amount'));
check('Invalid amount falls back to the estimate, not £0', (await amts(p))[1] === '£2,099.25');
check('Banner names the person still estimated', (await T(p, '#payBanner')).includes('for Sam'));
await typeIn(p, '#pay_sam', '2310');
check('Banner disappears once both are entered', (await p.$eval('#payBanner', e => e.textContent)) === '');
await p.click('#pay_sam'); await p.click('h2#payH');
check('Amount formatted to 2dp on blur', (await p.inputValue('#pay_sam')) === '2310.00');
await p.waitForTimeout(900);
check('Month saved automatically', (await LS(p, K.mon))['2026-11'].pay.sam === 2310);
await p.focus('#pay_alex'); await p.keyboard.press('Enter');
check('Enter in the first pay box moves to the next', await p.evaluate(() => document.activeElement.id) === 'pay_sam');

// ---------- ticks ----------
await p.click('#steps li:nth-child(2) .tick');
check('Tick marks the step done: 1 of 5', (await T(p, '#progressText')) === '1 of 5 done' && await p.$eval('#steps li:nth-child(2)', e => e.classList.contains('done')));
check('Tick stored under the transfer\'s id (t:cur2>nw)', (await LS(p, K.mon))['2026-11'].done['t:cur2>jbills'] === 2269.25);
await typeIn(p, '#pay_sam', '2320');
const changed = await p.$eval('#steps li:nth-child(2)', e => e.querySelector('.changed')?.textContent || '');
check('Changing pay after ticking warns that the amount changed', changed.includes('£2,269.25') && changed.includes('£2,279.25'), changed);
for (const i of [1, 3, 4, 5]) await p.click(`#steps li:nth-child(${i}) .tick`);
check('All-done banner after ticking all five', (await T(p, '#warnings')).includes('All transfers done'));
await p.click('#steps li:nth-child(5) .tick');
check('Untick works', (await T(p, '#progressText')) === '4 of 5 done');
await p.click('#steps li:nth-child(1) .copy'); await p.waitForTimeout(250);
check('Copy button copies the amount', (await T(p, '#toast')).startsWith('Copied £'));

// ---------- months and irregular bills ----------
await p.click('#next'); await p.waitForTimeout(80);
check('December: Kestrel home added to Current account 1, pay carried from November', (await amts(p))[0] === '£1,942.19' && (await T(p, '#payBanner')).includes("last month"), (await amts(p)).join(' '));
check('December has no ticks carried over', (await T(p, '#progressText')) === '0 of 5 done');
await p.click('#next'); await p.click('#next');
check('February: TV Licence due, no Council Tax', await p.evaluate(() => { const t = document.getElementById('due').textContent, due = t.split('Coming up')[0]; return due.includes('TV Licence') && !due.includes('Council Tax'); }));
await goMonth(p, 'November 2026');
check('Back to November keeps the saved pay', (await p.inputValue('#pay_alex')) === '2401.25' && (await p.inputValue('#pay_sam')) === '2320.00');
check('November is saved with both people\'s pay, and there\'s no Saved months list (2.9.1)', (await LS(p, K.mon))['2026-11'].pay.alex === 2401.25 && (await LS(p, K.mon))['2026-11'].pay.sam === 2320 && (await p.$('#histBox')) === null, JSON.stringify((await LS(p, K.mon))['2026-11']));
await p.click('#accounts summary');
check('Bills by account lists each account', (await T(p, '#acctList')).includes('Joint bills account') && (await T(p, '#acctList')).includes('Council Tax'));

// ---------- Settings: edit, add, delete a bill ----------
await p.click('#t-settings'); await p.waitForTimeout(150);
check('Hash routing to settings hides the month bar', await p.evaluate(() => location.hash) === '#settings' && await p.isHidden('#monthBar'));
await p.click('#sBills summary');
await p.locator('#setBills .bill > button', { hasText: 'Lumen' }).click();
const octoId = await p.$eval('#setBills .bill .ed input[id^="ba_"]', e => e.id);
await p.fill('#' + octoId, '150.06'); await p.waitForTimeout(800);
check('Edited bill saves automatically', (await LS(p, K.cfg)).bills.find(b => b.name === 'Lumen').amount === 150.06);
await p.click('#setBills .linkbtn:has-text("Joint spending account")');
const newId = await p.evaluate(() => document.activeElement.id);
await p.fill('#' + newId, 'Car service'); await p.fill('#' + newId.replace('bn_', 'ba_'), '240');
const MN = { Jan: 'January', Feb: 'February', Mar: 'March', Apr: 'April', May: 'May', Jun: 'June', Jul: 'July', Aug: 'August', Sep: 'September', Oct: 'October', Dec: 'December' };
for (const m of Object.keys(MN)) await p.click(`#setBills .bill:has(#${newId}) .mbtn[aria-label="${MN[m]}"]`);
await p.waitForTimeout(700);
const car = (await LS(p, K.cfg)).bills.find(b => b.name === 'Car service');
check('New bill saved for November only, from Joint spending account', car && car.amount === 240 && JSON.stringify(car.months) === '[11]' && car.account === 'jspend', JSON.stringify(car));
await p.goBack(); await p.waitForTimeout(200);
check('Android back returns to the Pay tab', await p.evaluate(() => location.hash) === '#pay' && await p.isVisible('#tab-pay'));
check('The new bill and the Lumen change flow into the transfers (£2,771.41, float £296.42)', (await amts(p))[2] === '£2,771.41' && (await float(p)) === '£296.42', (await amts(p)).join(' ') + ' ' + await float(p));
check('Joint spending account\'s card lists the new bill', (await p.$eval('#floatCards', e => e.textContent)).includes('Joint spending account after the transfers') && (await p.$eval('#floatCards', e => e.textContent)).includes('Car service'));
await p.click('#t-settings'); { const cb = p.locator('#setBills .bill > button:has-text("Car service")'); if ((await cb.getAttribute('aria-expanded')) !== 'true') await cb.click(); }
await p.click('#setBills .bill .ed .btn.danger');
check('Delete needs a second tap', (await p.locator('#setBills .bill .ed .btn.danger').textContent()).includes('Tap again'));
await p.click('#setBills .bill .ed .btn.danger'); await p.waitForTimeout(100);
check('Bill deleted', !(await LS(p, K.cfg)).bills.some(b => b.name === 'Car service'));
check('No JS errors (part 1)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 1.3 fixes still hold ----------
({ ctx, p } = await session({ storage: sampleStorage(false) }));
await p.fill('#pay_alex', '2400'); await p.fill('#pay_sam', '2300'); await p.waitForTimeout(900);
await p.fill('#pay_alex', ''); await p.waitForTimeout(900);
let mo = (await LS(p, K.mon))['2026-11'];
check('Clearing a pay box saves it as not entered (null)', mo.pay.alex === null && mo.pay.sam === 2300, JSON.stringify(mo));
await p.click('#next'); await p.click('#prev');
check('Revisiting keeps the box empty with the estimate hint', (await p.inputValue('#pay_alex')) === '' && (await T(p, '#payHint_alex')).startsWith('Using'));
await p.fill('#pay_alex', '2400'); await p.waitForTimeout(900);
await p.click('#steps li:nth-child(5) .tick'); await p.waitForTimeout(150);
await p.click('#t-settings'); await p.click('#sSavings summary');
await p.locator('#setSavings .box').first().locator('.btn.danger').click(); await p.locator('#setSavings .box').first().locator('.btn.danger').click(); await p.waitForTimeout(150);
check('Stocks and shares ISA transfer removed', (await LS(p, K.cfg)).savings.map(s => s.name).join() === 'Holiday savings');
await p.click('#t-pay'); await p.waitForTimeout(100);
const doneRoutes = await p.$$eval('#steps li.done .route', els => els.map(e => e.textContent));
check('Holiday transfer still ticked after deleting the one above it', doneRoutes.length === 1 && doneRoutes[0].includes('Holiday'), JSON.stringify(doneRoutes));
check('Progress shows 1 of 4', (await T(p, '#progressText')) === '1 of 4 done');
const L0 = await p.evaluate(() => history.length);
for (const t of ['due', 'settings', 'due', 'settings']) { await p.click('#t-' + t); await p.waitForTimeout(40); }
const L1 = await p.evaluate(() => history.length);
check('Tab taps add at most one history entry', L1 - L0 <= 1, `${L0} → ${L1}`);
await p.goBack(); await p.waitForTimeout(120);
check('Back from any tab returns to Pay', await p.evaluate(() => location.hash) === '#pay' && await p.isVisible('#tab-pay'));
await p.evaluate(() => { location.hash = 'wealth'; }); await p.waitForTimeout(120);
check('The old Wealth address just shows Pay', await p.isVisible('#tab-pay'));
check('Pay tab invites you to set payday when unset', (await T(p, '#payLine')).includes('Set your payday'));
await p.click('#payLine button'); await p.waitForTimeout(150);
check('Invite opens Settings with Payday expanded', await p.evaluate(() => location.hash) === '#settings' && await p.$eval('#sPayday', e => e.open));
await p.selectOption('#pay_day', '28'); await p.waitForTimeout(100);
check('Next payday shown (Wed 28 Oct, pays for November)', (await T(p, '#setPayday')).includes('Next payday: Wed 28 Oct 2026 (in 13 days). It pays for November 2026.'), await T(p, '#setPayday'));
check('Settings summary shows 28th', (await T(p, '#sumPayday')) === '28th');
await p.reload(); await p.waitForTimeout(200); await p.click('#t-pay');
check('On 15 Oct (13 days before payday) the app opens on October', (await T(p, '#monthLabel')) === 'October 2026');
check('Pay line shows the payday that funded October', (await T(p, '#payLine')) === 'Paid on Mon 28 Sep 2026 (17 days ago)', await T(p, '#payLine'));
await p.evaluate(() => localStorage.setItem('qa.today', '2026-10-20T12:00:00Z')); await p.reload(); await p.waitForTimeout(250);
check('On 20 Oct (8 days before payday) it opens on November', (await T(p, '#monthLabel')) === 'November 2026');
check('Pay line counts down to payday', (await T(p, '#payLine')) === 'Payday: Wed 28 Oct 2026 (in 8 days)', await T(p, '#payLine'));
await p.click('#t-settings'); if (!(await p.$eval('#sPayday', e => e.open))) await p.click('#sPayday summary');
await p.selectOption('#pay_day', '31'); await p.waitForTimeout(100);
check('Payday on a Saturday moves to Friday (31 Oct → Fri 30 Oct)', (await T(p, '#setPayday')).includes('Fri 30 Oct 2026'));
await p.click('#pay_wk'); await p.waitForTimeout(100);
check('Unticking the weekend rule keeps Sat 31 Oct', (await T(p, '#setPayday')).includes('Sat 31 Oct 2026'));
await p.selectOption('#pay_day', 'last'); await p.waitForTimeout(100);
check('Last working day option (Oct 2026 → Fri 30 Oct)', (await T(p, '#setPayday')).includes('Fri 30 Oct 2026') && !(await p.$('#pay_wk')));
check('No JS errors (part 2)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
await finish();
