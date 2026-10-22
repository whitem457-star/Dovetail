// 2.16.1: bank holidays move monthly paydays and the transfer day (docs/payperiods.md 13.1, H2 and H4). Settings › Payday's
// note and weekend box with and without a pattern, setup step 3's box (paid on the same day, not, and with a pattern),
// and the dates: with today fixed at 15 December 2026, a payday on the 28th is Thu 24 Dec (Fri 25 and Mon 28 are
// holidays, Sat 26 and Sun 27 the weekend), so the app opens on January 2027; "last working day" in August 2026 is Fri
// 28 Aug (Mon 31 is the summer bank holiday); a 25th with the box unticked stays Fri 25 Dec. Light and dark, 360px,
// larger text, keyboard, screen-reader names and axe. The made-up household (Alex and Sam) and made-up setups only.
import { suite, session, sampleStorage, K, LS, T, axe, noSideScroll, goMonth, SETUP_FILL } from './lib.mjs';
const { check, finish } = suite('2.16.1: bank holidays');
const TODAY = '2026-12-15';
const txt = (p, s) => T(p, s).then(t => t.replace(/\s+/g, ' ').trim()).catch(() => '');
const wait = (p, ms = 120) => p.waitForTimeout(ms);
const openSet = async (p, id) => { await p.click('#t-settings'); await wait(p, 80); if (!(await p.$eval('#' + id, d => d.open))) await p.click('#' + id + ' summary'); await wait(p, 80); };
const focusId = p => p.evaluate(() => document.activeElement && document.activeElement.id);
// The 13.1 (H4) words.
const PAY_BOX = "If it falls on a weekend or bank holiday, we're paid the working day before";
const XFER_BOX = 'If it falls on a weekend or bank holiday, do it on the working day before';
const KNOWS = "It knows England and Wales bank holidays, not Scotland's, Northern Ireland's or one-off ones.";
const NOTE = 'From 10 days before a payday, Dovetail opens on the month that pay is for. ' + KNOWS;
const NOTE_PAT = "From 10 days before a transfer day, Dovetail opens on the month it's for. " + KNOWS;
// The made-up household with a payday already set (as on a phone), and optionally a look.
const withPayday = (payday, appearance) => { const s = sampleStorage(false); s[K.cfg] = Object.assign({}, s[K.cfg], { payday }, appearance ? { appearance } : {}); return s; };
// The note is the last line of the card; the box is the label holding #pay_wk.
const note = p => p.$eval('#setPayday', b => { const n = [...b.querySelectorAll(':scope > .small.muted')].pop(); return n ? n.textContent : ''; });
const boxName = (p, name) => p.getByRole('checkbox', { name, exact: true }).count();

// ---------- 1. No pattern: payday the 28th, today 15 December 2026 ----------
let { ctx, p } = await session({ today: TODAY, storage: withPayday({ day: 28, weekend: true }) });
check('Payday the 28th on 15 Dec 2026: the app opens on January 2027 (the payday is Thu 24 Dec, 9 days away)', (await T(p, '#monthLabel')) === 'January 2027', await T(p, '#monthLabel'));
check('…the Pay line: "Payday: Thu 24 Dec 2026 (in 9 days)"', (await T(p, '#payLine')) === 'Payday: Thu 24 Dec 2026 (in 9 days)', await T(p, '#payLine'));
await openSet(p, 'sPayday');
check('Settings › Payday: the box says "' + PAY_BOX + '"', (await txt(p, 'label:has(#pay_wk)')) === PAY_BOX, await txt(p, 'label:has(#pay_wk)'));
check('…and that is its name for a screen reader, ticked', (await boxName(p, PAY_BOX)) === 1 && await p.isChecked('#pay_wk'));
check('…the note: "' + NOTE + '"', (await note(p)) === NOTE, await note(p));
check('…"Next payday: Thu 24 Dec 2026 (in 9 days). It pays for January 2027."', (await txt(p, '#setPayday')).includes('Next payday: Thu 24 Dec 2026 (in 9 days). It pays for January 2027.'), await txt(p, '#setPayday'));
check('No axe violations (Settings › Payday, no pattern)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
// By keyboard: Tab from the day reaches the box; Space unticks it, and the day no longer moves (Mon 28 Dec is Boxing Day's substitute, but unticked never moves).
await p.focus('#pay_day'); await p.keyboard.press('Tab');
check('Keyboard: Tab from the day goes to the box', (await focusId(p)) === 'pay_wk');
await p.keyboard.press('Space'); await wait(p);
check('…Space unticks it: saved, and the next payday stays Mon 28 Dec', (await LS(p, K.cfg)).payday.weekend === false && !(await p.isChecked('#pay_wk')) &&
  (await txt(p, '#setPayday')).includes('Next payday: Mon 28 Dec 2026 (in 13 days). It pays for January 2027.'), await txt(p, '#setPayday'));
check('…and focus stays on the box', (await focusId(p)) === 'pay_wk', await focusId(p));
// The 25th: unticked stays Fri 25 Dec (Christmas Day); ticked, Thu 24 Dec.
await p.selectOption('#pay_day', '25'); await wait(p);
check('…and after choosing a day, focus stays on the day (the card is redrawn)', (await focusId(p)) === 'pay_day', await focusId(p));
check('The 25th with the box unticked stays on Fri 25 Dec (Christmas Day)', (await txt(p, '#setPayday')).includes('Next payday: Fri 25 Dec 2026 (in 10 days).'), await txt(p, '#setPayday'));
await p.click('#pay_wk'); await wait(p);
check('…ticked, it moves to Thu 24 Dec', (await LS(p, K.cfg)).payday.weekend === true && (await txt(p, '#setPayday')).includes('Next payday: Thu 24 Dec 2026 (in 9 days).'), await txt(p, '#setPayday'));
await p.selectOption('#pay_day', 'last'); await wait(p);
check('"Last working day": no box, and the note is still there', (await p.$('#pay_wk')) === null && (await note(p)) === NOTE && (await txt(p, '#setPayday')).includes('Next payday: Thu 31 Dec 2026'), await txt(p, '#setPayday'));
check('No JS errors (no pattern)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2. A 25th with the box unticked, opened on 15 December 2026 ----------
({ ctx, p } = await session({ today: TODAY, storage: withPayday({ day: 25, weekend: false }) }));
check('A 25th with the box unticked: the Pay line still says Fri 25 Dec 2026 (in 10 days)', (await T(p, '#payLine')) === 'Payday: Fri 25 Dec 2026 (in 10 days)' && (await T(p, '#monthLabel')) === 'January 2027', [await T(p, '#monthLabel'), await T(p, '#payLine')].join(' / '));
check('No JS errors (25th unticked)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
({ ctx, p } = await session({ today: TODAY, storage: withPayday({ day: 25, weekend: true }) }));
check('The same 25th ticked: Thu 24 Dec 2026 (in 9 days)', (await T(p, '#payLine')) === 'Payday: Thu 24 Dec 2026 (in 9 days)' && (await T(p, '#monthLabel')) === 'January 2027', [await T(p, '#monthLabel'), await T(p, '#payLine')].join(' / '));
await ctx.close();

// ---------- 3. "Last working day" in August 2026: Fri 28 Aug, not Mon 31 Aug (the summer bank holiday) ----------
({ ctx, p } = await session({ today: '2026-08-15', storage: withPayday({ day: 'last' }) }));
check('"Last working day" on 15 Aug 2026: opens on August 2026 (13 days before payday)', (await T(p, '#monthLabel')) === 'August 2026', await T(p, '#monthLabel'));
await goMonth(p, 'September 2026'); await wait(p);
check('…September\'s Pay line: "Payday: Fri 28 Aug 2026 (in 13 days)"', (await T(p, '#payLine')) === 'Payday: Fri 28 Aug 2026 (in 13 days)', await T(p, '#payLine'));
await openSet(p, 'sPayday');
check('…Settings: "Next payday: Fri 28 Aug 2026 (in 13 days). It pays for September 2026."', (await txt(p, '#setPayday')).includes('Next payday: Fri 28 Aug 2026 (in 13 days). It pays for September 2026.'), await txt(p, '#setPayday'));
check('No JS errors (last working day)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 4. With a pattern: Alex goes weekly, so the 28th is the transfer day ----------
({ ctx, p } = await session({ today: TODAY, storage: withPayday({ day: 28, weekend: true }) }));
await openSet(p, 'sPeople');
await p.selectOption('#pp_f_alex', '7'); await wait(p, 250);
check('(Alex now paid every week)', !!(await LS(p, K.cfg)).people[0].pattern, JSON.stringify((await LS(p, K.cfg)).people[0]));
await openSet(p, 'sPayday');
check('Settings › Transfer day: the box says "' + XFER_BOX + '"', (await txt(p, 'label:has(#pay_wk)')) === XFER_BOX, await txt(p, 'label:has(#pay_wk)'));
check('…and that is its name for a screen reader', (await boxName(p, XFER_BOX)) === 1);
check('…the note: "' + NOTE_PAT + '"', (await note(p)) === NOTE_PAT, await note(p));
check('…"Next transfer day: Thu 24 Dec 2026 (in 9 days). It\'s for January 2027."', (await txt(p, '#setPayday')).includes("Next transfer day: Thu 24 Dec 2026 (in 9 days). It's for January 2027."), await txt(p, '#setPayday'));
check('No axe violations (Settings › Transfer day)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.reload(); await wait(p, 300);
check('Reopened: January 2027, and "Transfer day: Thu 24 Dec 2026 (in 9 days)"', (await T(p, '#monthLabel')) === 'January 2027' && (await T(p, '#payLine')) === 'Transfer day: Thu 24 Dec 2026 (in 9 days)', [await T(p, '#monthLabel'), await T(p, '#payLine')].join(' / '));
check('No JS errors (pattern)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 5. Setup step 3: the payday box, or the transfer-day box when people aren't paid on the same day or anyone has a pattern ----------
const step3 = async (two, same, every) => { ({ ctx, p } = await session({ today: TODAY })); await p.click('#su_start'); await wait(p, 80);
  if (two) await SETUP_FILL[2](p); else { await p.fill('#su_p_0', 'Alex'); await p.fill('#su_pu_0', '2100'); }
  if (every) { await p.selectOption('#su_pf_0', every); await wait(p); await p.fill('#su_pu_0', '420'); }
  await p.click('#su_next'); await wait(p, 100);
  if (two && !every) { await p.click(same ? 'label[for=su_same_yes]' : 'label[for=su_same_no]'); await wait(p); }
  await p.selectOption('#su_day', '28'); await wait(p); };
await step3(false, null, null);
check('Setup, one person paid monthly: "' + PAY_BOX + '", ticked', (await txt(p, 'label:has(#su_wk)')) === PAY_BOX && (await boxName(p, PAY_BOX)) === 1 && await p.isChecked('#su_wk'), await txt(p, 'label:has(#su_wk)'));
check('…"Your next payday: Thursday 24 December. That pay is for January 2027."', (await txt(p, '#su_next_payday')) === 'Your next payday: Thursday 24 December. That pay is for January 2027.', await txt(p, '#su_next_payday'));
check('No axe violations (setup step 3, payday)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await ctx.close();
await step3(true, true, null);
check('Setup, two people paid on the same day: the payday box', (await txt(p, 'label:has(#su_wk)')) === PAY_BOX, await txt(p, 'label:has(#su_wk)'));
await ctx.close();
await step3(true, false, null);
check('Setup, two people not paid on the same day: the transfer-day box', (await txt(p, 'label:has(#su_wk)')) === XFER_BOX && (await boxName(p, XFER_BOX)) === 1, await txt(p, 'label:has(#su_wk)'));
await p.click('#su_wk'); await wait(p);
check('…unticked, the next day stays Monday 28 December', !(await p.isChecked('#su_wk')) && (await txt(p, '#su_next_payday')).startsWith('Your next payday: Monday 28 December.'), await txt(p, '#su_next_payday'));
check('No axe violations (setup step 3, not paid on the same day)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await ctx.close();
await step3(true, null, '7');
check('Setup with someone paid weekly: the transfer-day box', (await txt(p, 'label:has(#su_wk)')) === XFER_BOX, await txt(p, 'label:has(#su_wk)'));
check('…"Your next transfer day: Thursday 24 December. It\'s for January 2027."', (await txt(p, '#su_next_payday')) === "Your next transfer day: Thursday 24 December. It's for January 2027.", await txt(p, '#su_next_payday'));
check('No JS errors (setup)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 6. Light and dark, 360px, larger text: Settings › Payday ----------
for (const dark of [false, true]) {
  const tag = dark ? 'dark' : 'light';
  ({ ctx, p } = await session({ today: TODAY, w: 360, dark, storage: withPayday({ day: 28, weekend: true }, { theme: dark ? 'dark' : 'light', textSize: 'large' }) }));
  await openSet(p, 'sPayday');
  await p.$eval('#pay_wk', e => e.scrollIntoView());
  const fits = s => p.$eval(s, e => { const r = e.getBoundingClientRect(); return r.right <= 360 && r.left >= 0; });
  const lastNote = () => p.$eval('#setPayday', b => { const r = [...b.querySelectorAll(':scope > .small.muted')].pop().getBoundingClientRect(); return r.right <= 360 && r.left >= 0; });
  check(`Settings › Payday at 360px, larger text, ${tag}: the box and the note fit, no sideways scrolling`, (await p.getAttribute('html', 'data-text')) === 'large' &&
    await noSideScroll(p, 360) && await fits('label:has(#pay_wk)') && await lastNote() && (await note(p)) === NOTE);
  check(`…the box is at least 24px tall to tap (${tag})`, await p.$eval('label:has(#pay_wk)', l => l.getBoundingClientRect().height >= 24));
  check(`No axe violations (Settings › Payday, 360px, larger text, ${tag})`, (await axe(p)).length === 0, (await axe(p)).join(' | '));
  check(`No JS errors (${tag})`, p.errs.length === 0, p.errs.join(' | '));
  await ctx.close();
}

await finish();
