// 2.15: dated pay (docs/payperiods.md 5.2 and 11.1, E1 to E5). With a month saved before the pay month the app opens on,
// changing someone's usual pay in Settings › People applies from this pay month: a line under the field says what
// earlier months keep, with "Change earlier months too". Earlier ticked months keep their shares exactly; a ticked
// current month shows the usual "changed" line. Also: setup's interim words, the update file's version, keyboard, axe,
// light and dark at 360px with larger text. Made-up households only.
import { suite, session, K, LS, T, axe, noSideScroll, goMonth, PAGE } from './lib.mjs';
import fs from 'fs';
// The version being tested, read from the built page, so the household gets no What's new.
const NEWV = /var VERSION="([\d.]+)"/.exec(fs.readFileSync(PAGE, 'utf8'))[1];
const { check, finish } = suite('2.15: dated pay');
const TODAY = '2026-10-15'; // the app opens on October 2026
const focusId = p => p.evaluate(() => document.activeElement && document.activeElement.id);
const txt = (p, s) => T(p, s).then(t => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const amtsOf = p => p.$$eval('#steps .amt', l => l.map(x => x.textContent));
const nat = p => p.evaluate(() => window.__qaNative);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Kim and Lee (made up): each paid into their own account, both paying into Joint in proportion to usual pay
// (3,000 and 2,000, so 900 and 600 of the 1,500 rent).
const HH = (o = {}) => Object.assign({ schema: 5, setupDone: true, lastVersion: NEWV, setupTips: true,
  people: [{ id: 'kim', name: 'Kim', payAccount: 'K', usualPay: 3000 }, { id: 'lee', name: 'Lee', payAccount: 'L', usualPay: 2000 }],
  accounts: [{ id: 'K', name: 'Kim own', colour: 'blue', leftoverTo: null }, { id: 'L', name: 'Lee own', colour: 'teal', leftoverTo: null },
    { id: 'J', name: 'Joint', colour: 'purple', leftoverTo: null, funding: { people: ['kim', 'lee'], rule: 'pay' } }],
  bills: [{ id: 'rent', name: 'Rent', amount: 1500, account: 'J', months: [] }],
  income: [], budgets: [], savings: [], reminders: [], doneLog: [], payday: { day: 28, weekend: true } }, o);
// September (before the month the app opens on) is done: Kim's pay typed, Lee's not (so it's estimated from usual pay),
// both shares ticked. October is ticked too, at the same shares.
const TICKS = { 'c:kim>J': 900, 'c:lee>J': 600 };
const HIST = () => ({ '2026-09': { month: '2026-09', pay: { kim: 3000 }, done: Object.assign({}, TICKS), oneOffs: [] },
  '2026-10': { month: '2026-10', pay: { kim: 3000, lee: 2000 }, done: Object.assign({}, TICKS), oneOffs: [] } });
const openPeople = async p => { await p.click('#t-settings'); await p.waitForTimeout(80); if (!(await p.$eval('#sPeople', d => d.open))) await p.click('#sPeople summary'); await p.waitForTimeout(80); };
const LINE = 'Changed from October 2026. Earlier months keep £2,000.00. Change earlier months too';

// ---------- 1. Without history: editing changes every month, as before (no line) ----------
let { ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: HH(), [K.mon]: { '2026-10': HIST()['2026-10'] } } });
await openPeople(p);
check('Settings › People: no dated line before any edit', await p.isHidden('#pp_d_lee') && await p.isHidden('#pp_d_kim'));
await p.fill('#pp_u_lee', '3000'); await p.waitForTimeout(800);
let c = await LS(p, K.cfg);
check('No months saved before this one: the edit changes every month (no was, no line)', c.people[1].usualPay === 3000 && c.people[1].was === undefined && await p.isHidden('#pp_d_lee'), JSON.stringify(c.people[1]));
check('No JS errors (no history)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2. With history: the line, earlier months keep their figures, reload, the update file, undating ----------
({ ctx, p } = await session({ today: TODAY, native: true, storage: { [K.cfg]: HH(), [K.mon]: HIST() } }));
check('October, ticked: the shares are £900.00 and £600.00', same(await amtsOf(p), ['£900.00', '£600.00']), (await amtsOf(p)).join(' '));
await goMonth(p, 'September 2026');
const sepBefore = await amtsOf(p), sepHint = await txt(p, '#payHint_lee');
check('September, ticked, Lee\'s pay not typed: £900.00 and £600.00, "Using usual pay: £2,000.00"', same(sepBefore, ['£900.00', '£600.00']) && sepHint === 'Using usual pay: £2,000.00', sepBefore.join(' ') + ' / ' + sepHint);
await goMonth(p, 'October 2026');
await p.click('#shareTransfers'); await p.waitForTimeout(150); await p.click('#shareAsFile'); await p.waitForTimeout(150);
let f = JSON.parse(((await nat(p)).lastUpdate || {}).json || '{}');
check('Before the edit, the update file is version 6 needing 2.13 (shares)', f.version === 6 && f.needs === '2.13', JSON.stringify([f.version, f.needs]));

await openPeople(p);
await p.fill('#pp_u_lee', '3000'); await p.waitForTimeout(800);
c = await LS(p, K.cfg);
check('Editing Lee\'s usual pay dates it: was [{until: 2026-09, usualPay: 2000}]', c.people[1].usualPay === 3000 && same(c.people[1].was, [{ until: '2026-09', usualPay: 2000 }]) && c.people[0].was === undefined, JSON.stringify(c.people[1]));
check('The line under the field: "' + LINE + '"', (await txt(p, '#pp_d_lee')) === LINE && await p.isVisible('#pp_d_lee_all') && await p.isHidden('#pp_d_kim'), await txt(p, '#pp_d_lee'));
check('…read out as it changes (aria-live polite)', (await p.getAttribute('#pp_d_lee', 'aria-live')) === 'polite');
await p.fill('#pp_u_lee', '3100'); await p.waitForTimeout(100);
check('A second edit in the same pay month keeps the pay from before the first', (await txt(p, '#pp_d_lee')) === LINE);
await p.fill('#pp_u_lee', '2000'); await p.waitForTimeout(800);
c = await LS(p, K.cfg);
check('An edit back to the old pay drops the date and the line', c.people[1].was === undefined && c.people[1].usualPay === 2000 && await p.isHidden('#pp_d_lee'), JSON.stringify(c.people[1]));
await p.fill('#pp_u_lee', '3000'); await p.fill('#pp_u_kim', '2500'); await p.waitForTimeout(800);
c = await LS(p, K.cfg);
check('Several people: each gets their own line and ids', (await txt(p, '#pp_d_lee')) === LINE &&
  (await txt(p, '#pp_d_kim')) === 'Changed from October 2026. Earlier months keep £3,000.00. Change earlier months too' && await p.isVisible('#pp_d_kim_all') &&
  same(c.people[0].was, [{ until: '2026-09', usualPay: 3000 }]), await txt(p, '#pp_d_kim'));
// Kim back to 3,000: only Lee's change is left.
await p.fill('#pp_u_kim', '3000'); await p.waitForTimeout(800);
check('…and Kim\'s goes when it\'s put back', (await LS(p, K.cfg)).people[0].was === undefined && await p.isHidden('#pp_d_kim'));

await p.click('#t-pay'); await p.waitForTimeout(150);
check('October (the pay month the app opens on) takes the new pay: £750.00 each', same(await amtsOf(p), ['£750.00', '£750.00']), (await amtsOf(p)).join(' '));
check('…and its ticks show the existing "changed" line', (await txt(p, '#steps')).includes("You ticked this at £900.00 but it's now £750.00") && (await txt(p, '#steps')).includes("You ticked this at £600.00 but it's now £750.00"), await txt(p, '#steps'));
await goMonth(p, 'September 2026');
check('September (ticked, before) keeps its figures exactly: £900.00 and £600.00', same(await amtsOf(p), sepBefore), (await amtsOf(p)).join(' '));
check('…with no "changed" line, and Lee\'s estimate still "Using usual pay: £2,000.00"', !(await txt(p, '#steps')).includes('You ticked this at') && (await txt(p, '#payHint_lee')) === sepHint, await txt(p, '#payHint_lee'));
await goMonth(p, 'October 2026');
await p.click('#shareTransfers'); await p.waitForTimeout(150); await p.click('#shareAsFile'); await p.waitForTimeout(150);
const up = (await nat(p)).lastUpdate || {}; f = JSON.parse(up.json || '{}');
check('An update file made after the edit is version 6 with "needs":"2.15", carrying the earlier pay', f.version === 6 && f.needs === '2.15' && String(up.json).startsWith('{"app":"payday-transfers","version":6,"needs":"2.15",') &&
  same(f.config.people[1].was, [{ until: '2026-09', usualPay: 2000 }]), String(up.json).slice(0, 80));
check('No JS errors (dated edit)', p.errs.length === 0, p.errs.join(' | '));

await p.reload(); await p.waitForTimeout(300);
c = await LS(p, K.cfg);
check('After a reload: the edit and its date are kept', c.people[1].usualPay === 3000 && same(c.people[1].was, [{ until: '2026-09', usualPay: 2000 }]));
await goMonth(p, 'September 2026');
check('…September still £900.00 and £600.00', same(await amtsOf(p), sepBefore), (await amtsOf(p)).join(' '));
await openPeople(p);
check('…and the line is still there', (await txt(p, '#pp_d_lee')) === LINE);

// "Change earlier months too", by keyboard: the date goes, focus back on the usual pay field.
await p.focus('#pp_d_lee_all'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
c = await LS(p, K.cfg);
check('"Change earlier months too" (keyboard) takes the date off and the line goes', c.people[1].was === undefined && c.people[1].usualPay === 3000 && await p.isHidden('#pp_d_lee'), JSON.stringify(c.people[1]));
check('…with focus on Lee\'s usual pay', (await focusId(p)) === 'pp_u_lee', await focusId(p));
await p.click('#t-pay'); await p.waitForTimeout(150);
await goMonth(p, 'September 2026');
check('…and earlier months then take the new pay: September £750.00 each, "Using usual pay: £3,000.00"', same(await amtsOf(p), ['£750.00', '£750.00']) && (await txt(p, '#payHint_lee')) === 'Using usual pay: £3,000.00', (await amtsOf(p)).join(' '));
await goMonth(p, 'October 2026');
await p.click('#shareTransfers'); await p.waitForTimeout(150); await p.click('#shareAsFile'); await p.waitForTimeout(150);
f = JSON.parse(((await nat(p)).lastUpdate || {}).json || '{}');
check('…and the update file needs 2.13 again', f.version === 6 && f.needs === '2.13', JSON.stringify([f.version, f.needs]));
check('No JS errors (change earlier months too)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 3. Light and dark, 360px, larger text: it fits, axe ----------
for (const dark of [false, true]) {
  ({ ctx, p } = await session({ today: TODAY, w: 360, dark, storage: { [K.cfg]: HH({ appearance: { theme: dark ? 'dark' : 'light', textSize: 'large' } }), [K.mon]: HIST() } }));
  await openPeople(p);
  await p.fill('#pp_u_lee', '3000'); await p.waitForTimeout(800);
  await p.$eval('#pp_d_lee', e => e.scrollIntoView());
  const tag = dark ? 'dark' : 'light';
  check(`The line at 360px, larger text, ${tag}: shown, no sideways scrolling`, (await txt(p, '#pp_d_lee')) === LINE && (await p.getAttribute('html', 'data-text')) === 'large' && await noSideScroll(p, 360) &&
    await p.$eval('#pp_d_lee', e => e.getBoundingClientRect().right <= 360));
  check(`No axe violations (Settings › People with the line, ${tag})`, (await axe(p)).length === 0, (await axe(p)).join(' | '));
  check(`No JS errors (${tag})`, p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 4. Setup's pay step: the interim words ----------
for (const dark of [false, true]) {
  ({ ctx, p } = await session({ today: TODAY, w: 360, dark }));
  await p.evaluate(() => document.documentElement.setAttribute('data-text', 'large'));
  await p.click('#su_start'); await p.waitForTimeout(80);
  const s = await txt(p, '#setup'), tag = dark ? 'dark' : 'light';
  // 2.16: release 2's limits line replaces 2.15's interim one (Appendix A).
  check(`Setup step 2: the limits line in Appendix A's words (${tag})`, s.includes("Dovetail works in pounds. Pay can come monthly, every four weeks, every two weeks or weekly. Paid a different amount each time? Use a typical amount: you'll type what actually arrived.") &&
    !s.includes("You'll type the real figure each payday."), s.slice(0, 600));
  check(`…and "Not employed?" with Universal Credit (${tag})`, s.includes('Not employed? Use what you usually receive, such as a pension or self-employed income. Universal Credit is paid monthly: count it as the pay of the person whose account it goes into, and type the amount from your statement each month. No money of your own coming in? Leave it empty.'));
  check(`…fits at 360px with larger text, no axe violations (${tag})`, await noSideScroll(p, 360) && (await axe(p)).length === 0, (await axe(p)).join(' | '));
  await ctx.close();
}

// ---------- 5. Someone with no usual pay before: "Earlier months keep no usual pay." ----------
{
  const hh = HH(); hh.people[1].usualPay = 0;
  ({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: hh, [K.mon]: HIST() } }));
  await openPeople(p);
  await p.fill('#pp_u_lee', '2000'); await p.waitForTimeout(800);
  const c5 = await LS(p, K.cfg);
  check('Usual pay from £0: dated, and the line says "Earlier months keep no usual pay."', same(c5.people[1].was, [{ until: '2026-09', usualPay: 0 }]) &&
    (await txt(p, '#pp_d_lee')) === 'Changed from October 2026. Earlier months keep no usual pay. Change earlier months too', await txt(p, '#pp_d_lee'));
  check('No JS errors (from £0)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

// ---------- 6. A 2.15 file with dated pay keeps it when restored (paste) or opened as an update file ----------
{
  ({ ctx, p } = await session({ today: TODAY, native: true, storage: { [K.cfg]: HH(), [K.mon]: HIST() } }));
  await openPeople(p);
  await p.fill('#pp_u_lee', '3000'); await p.waitForTimeout(800);
  await p.click('#t-pay'); await p.waitForTimeout(150);
  await p.click('#shareTransfers'); await p.waitForTimeout(150); await p.click('#shareAsFile'); await p.waitForTimeout(150);
  const upJson = ((await nat(p)).lastUpdate || {}).json || '';
  await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(60);
  await p.click('#setBackup .btn.ghost:has-text("Show backup")'); await p.waitForTimeout(60);
  const backupText = await p.inputValue('#backupOut');
  check('(The backup and the update file both carry Lee\'s earlier pay, needing 2.15)', [upJson, backupText].every(j => { try { const o = JSON.parse(j); return o.needs === '2.15' && same(o.config.people[1].was, [{ until: '2026-09', usualPay: 2000 }]); } catch (e) { return false; } }));
  await ctx.close();
  const kept = async (p, how) => {
    const c6 = await LS(p, K.cfg);
    check(`${how}: Lee's earlier pay is kept (was [{until: 2026-09, usualPay: 2000}], usual pay 3,000)`, same(c6.people[1].was, [{ until: '2026-09', usualPay: 2000 }]) && c6.people[1].usualPay === 3000, JSON.stringify(c6.people[1]));
    await p.click('#t-pay'); await p.waitForTimeout(150); await goMonth(p, 'September 2026');
    check(`…September still shows £900.00 and £600.00 (${how.toLowerCase()})`, same(await amtsOf(p), ['£900.00', '£600.00']), (await amtsOf(p)).join(' '));
    await goMonth(p, 'October 2026');
    check(`…October takes the new pay: £750.00 each (${how.toLowerCase()})`, same(await amtsOf(p), ['£750.00', '£750.00']), (await amtsOf(p)).join(' '));
    check(`No JS errors (${how.toLowerCase()})`, p.errs.length === 0, p.errs.join(' | '));
  };
  // The other phone: the same household before the edit.
  ({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: HH(), [K.mon]: HIST() } }));
  await p.click('#t-settings'); await p.click('#sBackup summary'); await p.waitForTimeout(60);
  await p.fill('#backupIn', backupText); await p.click('#restoreBtn'); await p.waitForTimeout(80); await p.click('#restoreBtn'); await p.waitForTimeout(300);
  check('Pasted into Settings › Backup: "Backup restored"', (await T(p, '#restoreMsg')).includes('restored'), await T(p, '#restoreMsg'));
  await kept(p, 'Pasted backup');
  await ctx.close();
  ({ ctx, p } = await session({ today: TODAY, native: true, storage: { [K.cfg]: HH(), [K.mon]: HIST() } }));
  await p.evaluate(v => window.paydayNativeEvent('import', v, true), upJson); await p.waitForTimeout(250);
  check('Opened as an update file: "Update from this file?"', await p.isVisible('#updateOffer #importOffer'));
  await p.click('#importYes'); await p.waitForTimeout(400);
  check('…"Updated"', (await T(p, '#toast')) === 'Updated', await T(p, '#toast'));
  await kept(p, 'Update file');
  await ctx.close();
}

// ---------- 7. "+ Add a person" with history: earlier months keep no usual pay for them ----------
{
  ({ ctx, p } = await session({ today: TODAY, storage: { [K.cfg]: HH(), [K.mon]: HIST() } }));
  await openPeople(p);
  await p.click('#setPeople .linkbtn:has-text("+ Add a person")'); await p.waitForTimeout(150);
  const sid = String(await focusId(p)).replace(/^pp_n_/, '');
  await p.fill('#pp_n_' + sid, 'Max'); await p.fill('#pp_u_' + sid, '1200'); await p.waitForTimeout(800);
  const c7 = await LS(p, K.cfg), max = c7.people[2] || {};
  check('A person added and given pay with history: dated from this pay month, earlier months keep £0', c7.people.length === 3 && max.usualPay === 1200 && same(max.was, [{ until: '2026-09', usualPay: 0 }]), JSON.stringify(max));
  check('…the line: "Changed from October 2026. Earlier months keep no usual pay."', (await txt(p, '#pp_d_' + sid)) === 'Changed from October 2026. Earlier months keep no usual pay. Change earlier months too', await txt(p, '#pp_d_' + sid));
  await p.click('#t-pay'); await p.waitForTimeout(150); await goMonth(p, 'September 2026');
  check('…September (ticked) keeps its figures: £900.00 and £600.00', same(await amtsOf(p), ['£900.00', '£600.00']), (await amtsOf(p)).join(' '));
  check('…and Max\'s September pay isn\'t estimated from the new usual pay', (await txt(p, '#payHint_' + sid)) === 'Not typed in yet', await txt(p, '#payHint_' + sid));
  check('No JS errors (adding a person)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

await finish();
