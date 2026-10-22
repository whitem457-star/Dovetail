// The household simulation, onboarding part: each household typed into the real setup screens (the built page in
// Chromium), as a person would: the questions answered from the household's description, every bill, budget and
// savings transfer put where it's meant to go. Records every tap and field (friction), every message setup shows and
// every default that had to be changed, then checks the first payday's preview, the Pay tab and the saved settings
// against calc and the oracle. Results go to sim/out/ui-<households>-<date and time>.json (not committed), or to OUT
// if it's set, so two runs never overwrite each other; `node sim/analyse.mjs` sums up the newest.
// 2.14, the rough figure: a quarter of the households are "figure" households and another quarter "anchor" ones (gen.mjs's
// withFigures; SIM_FIGURES=0 leaves them out). They open the figure box in each account that can have one, type the figure
// (an anchor also what the household moves into the account, and answers setup's question about the difference: "Yes,
// it's bills" makes the figure that amount), and list only h.bills, the biggest of what they pay; h.hidden is what they
// really pay and is never typed. Recorded for sim/analyse.mjs: the actions on the bills step and on the figure itself, how
// often the preview says an account is short, and the checks: setup offers a figure exactly where gen.mjs's figureAllowed
// (docs/onboarding.md 5.9) says, the saved settings carry the figures (cfg.estimates, none for a household without),
// the preview and the Pay tab say what's not listed yet, and calc and the oracle agree with the figures as typed.
// 2.17: about half the people on a pattern type "A recent payday (optional)" (#su_pon_<i>, docs/payperiods.md L15); the
// saved pattern must carry it as `on`, and their first month plans on each × the paydays counted (gen.mjs's counter).
// Before setup has the field, the run types nothing there and says how many dates it skipped.
// Exits 1 when a household has a problem. Build the page first (node build-page.mjs). With SAVED=<folder>, the settings
// each household was saved with go to <folder>/<seed>.json.
// node sim/ui.mjs [households=40] [first seed=5001] [at once=6]   (FORCED='[{…makeHousehold options…}]' adds more)
// `npm run sim:ui` is the full run: 360 households, about 4 minutes, then the summary.
import { session, K, LS, steps as paySteps, skipTour, axe, browser } from '../lib.mjs';
import { P } from '../unit/load.mjs';
import { makeHousehold, intendedAccount, r2, withFigures, figureExtras, figureAllowed, PAY_N, topsUpBills, hasPattern, rng, dayNum, dayStr, weekday, holidayCal, windowOracle, countOracle } from './gen.mjs';
import { invariants, compare, idByName } from './check.mjs';
import { figuresOn } from './logic.mjs';
import fs from 'fs';

const TODAY = '2026-10-21';
const money = v => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// 2.16: setup step 2's "How often they're paid" (#su_pf_<i>), by days between paydays (Appendix A's words).
const EVERY = { 7: 'Every week', 14: 'Every two weeks', 28: 'Every four weeks' };
// 2.17 (L15): about half the people on a pattern type "A recent payday (optional)" (#su_pon_<i>): a payday in the three weeks
// before today as it usually falls (a Friday more often than not; never a bank holiday). Their own draws, so nothing else
// about the household changes. null: left empty.
const CAL = holidayCal('real');
function recentPayday(h, i) {
  const q = h.people[i], R = rng(h.seed * 131 + i); if (!q.every || R() >= 0.5) return null;
  const want = R() < 0.6 ? 5 : 1 + Math.floor(R() * 5); let z = dayNum(TODAY) - Math.floor(R() * 14); while (weekday(z) !== want || CAL.has(z)) z--; return dayStr(z);
}
const CHIPS = ['Rent', 'Mortgage', 'Council Tax', 'Energy', 'Water', 'Broadband', 'TV Licence', 'Home insurance', 'Streaming'];

/** What a figure household does in setup (a household without figures: nothing). plan: per account with a figure, the rough
    figure typed, for an anchor the amount moved in, the question's answer when setup asks (gap of £20 and 5% or more, as
    setup's rule) and the figure that results; spec: h with those final figures, one per account, for the oracle. */
function personaOf(h) {
  if (!h.figures || !h.figureKind || h.figureKind === 'listed') return { plan: [], spec: { ...h, figures: [] } };
  const plan = [], spec = JSON.parse(JSON.stringify(h)); spec.figures = [];
  h.truth.forEach(t => { const f = h.figures.find(x => intendedAccount(h, { owner: x.owner }, 'bills') === t.account); if (!f) return;
    const anchor = h.figureKind === 'anchor' && t.rough > 0, gap = r2(t.true7 - t.rough), asks = anchor && gap >= 20 && gap >= t.true7 * 0.05, yes = h.seed % 5 !== 0;
    const typed = h.figureKind === 'anchor' ? t.rough : t.figure, final = asks && yes ? t.true7 : typed;
    plan.push({ account: t.account, owner: f.owner, typed, movesIn: anchor ? t.true7 : null, asks, yes, final });
    if (final > 0) spec.figures.push({ id: f.id, owner: f.owner, amount: final }); });
  // Setup keeps a figure only when it's above the account's listed bills that come in 7 or more months (calc.js setupSettings
  // says so in a note otherwise): the others are dropped.
  const over = new Set(figureExtras(spec).filter(e => e.amount > 0.004).map(e => e.account));
  plan.forEach(g => { g.dropped = g.final > 0 && !over.has(g.account); });
  spec.figures = spec.figures.filter(f => over.has(intendedAccount(spec, { owner: f.owner }, 'bills')));
  spec.figures.forEach((f, i) => { f.id = 'e' + i; });
  return { plan, spec };
}

async function runOne(h, opts = {}) {
  const { ctx, p } = await session({ today: TODAY, native: true });
  const M = { seed: h.seed, actions: 0, perStep: {}, msgs: [], fixes: [], textLen: {}, step: 1, axe: [], problems: [], figActions: 0, figAsked: 0, dated: {}, datesSkipped: 0 };
  const { plan, spec } = personaOf(h);
  const act = async (kind, sel, v) => { M.actions++; M.perStep[M.step] = (M.perStep[M.step] || 0) + 1;
    if (kind === 'click') await p.click(sel); else if (kind === 'fill') await p.fill(sel, v); else if (kind === 'check') await p.check(sel); else if (kind === 'uncheck') await p.uncheck(sel); else if (kind === 'select') await p.selectOption(sel, v); };
  const msg = async () => { const e = await p.$('#su_msg'); if (!e || !(await e.isVisible())) return ''; await p.waitForTimeout(50); return (await e.innerText()).trim(); };
  const title = () => p.textContent('#suTitle');
  const next = async (expectTitle) => { await act('click', '#su_next'); await p.waitForTimeout(60);
    if (expectTitle && (await title()) !== expectTitle) { const m = await msg(); M.msgs.push({ step: M.step, msg: m }); return m || 'stayed'; } return ''; };
  const textOf = async () => { M.textLen[M.step] = await p.$eval('#setup', e => e.innerText.length); };
  try {
    // 1. Welcome
    await textOf(); await act('click', '#su_start'); M.step = 2; await p.waitForTimeout(40);
    // 2. Pay
    // 2.16: someone on a pattern picks how often they're paid first, then types their pay each time. Nobody else touches it.
    for (let i = 0; i < h.people.length; i++) { const q = h.people[i]; if (i) await act('click', '#su_addp'); await act('fill', '#su_p_' + i, q.name);
      if (q.every) { if (!(await p.$('#su_pf_' + i))) throw new Error(`no #su_pf_${i} ("How often they're paid", 2.16) for ${q.name}, paid ${EVERY[q.every].toLowerCase()}`);
        await act('select', '#su_pf_' + i, { label: EVERY[q.every] }); await p.waitForTimeout(30); await act('fill', '#su_pu_' + i, money(q.each));
        // 2.17: the recent payday, when setup has the field (before the screens exist, the run says the dates were skipped).
        const on = recentPayday(h, i); if (on) { if (await p.$('#su_pon_' + i)) { await act('fill', '#su_pon_' + i, on); M.dated[i] = on; } else M.datesSkipped++; } }
      else if (q.pay > 0) await act('fill', '#su_pu_' + i, money(q.pay)); }
    for (let i = 0; i < h.income.length; i++) { await act('click', '#su_addi'); await act('fill', '#su_in_' + i, h.income[i].name); await act('fill', '#su_inv_' + i, money(h.income[i].amount)); }
    await textOf();
    // 2.16: with someone on a pattern, steps 3 and 7 are about the transfer day.
    const day = hasPattern(h) ? 'Your transfer day' : 'Your payday', first = hasPattern(h) ? 'Your first transfer day' : 'Your first payday';
    let m = await next(day);
    if (m) { if (/Without pay/.test(m)) { m = await next(day); } if (m) throw new Error('step 2: ' + m); }
    M.step = 3; await textOf();
    // 3. Payday
    if (!h.payday) await act('click', '#su_skip');
    // 2.16: with someone on a pattern, step 3 asks only for the transfer day (no "same day" question, no Skip).
    else { if (h.people.length > 1 && !hasPattern(h)) await act('click', `label[for=su_same_${h.payday.same ? 'yes' : 'no'}]`);
      await act('select', '#su_day', String(h.payday.day)); await p.waitForTimeout(30);
      if (h.payday.day !== 'last' && !h.payday.weekend) await act('uncheck', '#su_wk');
      await act('click', '#su_next'); }
    await p.waitForTimeout(60); if ((await title()) !== 'Your accounts') throw new Error('step 3 stuck: ' + (await msg()));
    M.step = 4;
    // 4. Accounts: the questions.
    if (!h.multi) await act('check', '#su_shape_' + h.pool);
    else {
      await act('check', '#su_style_' + h.style); await p.waitForTimeout(40);
      if (h.style === 'pool') { await act('check', '#su_shape_' + h.pool); await act('check', '#su_fun_' + (h.fun ? 'yes' : 'no')); }
      if (h.style === 'housekeeping') await act('check', '#su_payer_' + h.payer);
      if (h.rule && h.ruleAsked !== false) { await act('check', '#su_rule_' + h.rule); await p.waitForTimeout(30); }
      if (h.style === 'contribute' && h.two) await act('check', '#su_two_yes');
      for (const k of Object.keys(h.board)) { await act('check', `#su_board_${k}_yes`); await p.waitForTimeout(30); await act('fill', `#su_boardv_${k}`, money(h.board[k])); }
      for (let i = 0; i < h.people.length; i++) {
        if (await p.$('#su_gets_' + i + '_no')) { const yes = h.gets[i] != null; await act('check', `#su_gets_${i}_${yes ? 'yes' : 'no'}`); await p.waitForTimeout(30); if (yes) await act('fill', '#su_getsv_' + i, money(h.gets[i])); }
      }
      if (h.style === 'pool' && h.fun) for (let i = 0; i < h.people.length; i++) { if (h.board[i] != null) continue; if (await p.$('#su_funv_' + i)) await act('fill', '#su_funv_' + i, money(h.fun[i])); }
      if (h.rule === 'set') for (let i = 0; i < h.people.length; i++) { if (h.board[i] != null) continue; if (await p.$('#su_set_' + i)) await act('fill', '#su_set_' + i, money(h.set[i] || 0)); }
    }
    await p.waitForTimeout(40);
    // The income's account: by default the first account that keeps what's left.
    const names = await p.$$eval('#setup .su-acct input[id^=su_a_]', l => l.map(x => x.value));
    M.accounts = names;
    for (let i = 0; i < h.income.length; i++) { const want = h.style === 'separate' ? h.people[0].name + "'s account" : intendedAccount(h, { owner: 'shared' }, 'bills');
      const cur = await p.$eval('#su_ia_' + i, s => s.options[s.selectedIndex].text);
      if (cur !== want) { M.fixes.push({ step: 4, what: 'income', name: h.income[i].name, was: cur, want }); await act('select', '#su_ia_' + i, { label: want }); } }
    M.dia = await p.$eval('#su_dia', e => e.innerText).catch(() => '');
    M.example = await p.$eval('#su_example_line', e => e.innerText).catch(() => '');
    M.hasRoots = !!(await p.$('#su_roots'));
    if (opts.axe) M.axe.push(...(await axe(p)).map(x => 'step 4: ' + x));
    await textOf();
    m = await next('Your bills');
    if (m) { // Boxes left empty that setup still wants (a boarder's spending money or set amount): type 0, as a person would.
      if (/Type each amount/.test(m)) { const empty = await p.$$eval('#setup .su-amt input', l => l.filter(i => !i.value.trim()).map(i => i.id));
        M.zeroed = empty; for (const id of empty) await act('fill', '#' + id, '0'); m = await next('Your bills'); }
      if (m) throw new Error('step 4: ' + m); }
    M.step = 5;
    // 5. Bills: sections by account.
    const secs = await p.$$eval('#setup .su-bsec', l => l.map(s => ({ ai: s.getAttribute('aria-labelledby').replace('su_h_b', ''), name: s.querySelector('h2').textContent.replace(/^Paid from /, ''), rows: s.querySelectorAll('.qa-row').length })));
    const lines = await p.$$eval('#setup .su-bline', l => l.map(s => ({ ai: s.querySelector('button').id.replace(/^su_b_|_open$/g, ''), name: s.querySelector('b').textContent, rows: 0, closed: true })));
    const acct = {}; secs.concat(lines).forEach(x => acct[x.name] = x);
    M.billsOpen = secs.map(s => s.name);
    // 2.14: the figure for each account that has one, before its bills (a person starts there): open the account, the figure
    // link, the figure, and for an anchor what's moved in and the answer to setup's question.
    const was0 = M.actions;
    for (const g of plan) { const a = acct[g.account]; if (!a) throw new Error('no bills section for ' + g.account);
      if (a.closed) { await act('click', `#su_b_${a.ai}_open`); a.closed = false; a.rows = 1; M.fixes.push({ step: 5, what: 'opened', name: g.account }); await p.waitForTimeout(30); }
      if (!(await p.$(`#su_b_${a.ai}_fig`))) { M.problems.push(`no rough figure offered on ${g.account} (figureAllowed says it can have one)`); continue; }
      await act('click', `#su_b_${a.ai}_fig`); await p.waitForTimeout(30);
      if (g.typed > 0) await act('fill', `#su_fig_${a.ai}`, money(g.typed));
      if (g.movesIn != null) { await p.locator(`#su_fig_${a.ai}`).blur(); await act('fill', `#su_figin_${a.ai}`, money(g.movesIn)); await p.locator(`#su_figin_${a.ai}`).blur(); await p.waitForTimeout(40);
        const asked = !!(await p.$(`#su_figask_${a.ai}_q`));
        if (asked !== g.asks) M.problems.push(`${g.account}: moves in ${money(g.movesIn)} with a figure of ${money(g.typed)}, setup ${asked ? 'asked' : "didn't ask"} whether the rest is bills (expected ${g.asks ? 'a question' : 'none'})`);
        if (asked) { M.figAsked++; await act('click', `#su_figask_${a.ai}_${g.yes ? 'yes' : 'no'}`); await p.waitForTimeout(30); } } }
    M.figActions = M.actions - was0;
    const used = {};
    for (const b of h.bills) {
      const want = intendedAccount(h, b, 'bills'), a = acct[want]; if (!a) throw new Error('no bills section for ' + want);
      if (a.closed) { await act('click', `#su_b_${a.ai}_open`); a.closed = false; a.rows = 1; M.fixes.push({ step: 5, what: 'opened', name: want }); await p.waitForTimeout(30); }
      const j = used[a.ai] = (used[a.ai] ?? -1) + 1, id = f => `#su_b_${a.ai}_${j}_${f}`;
      // 2.14: suggestions are grouped, and only the most common show until a group is opened: a household uses one
      // only when it's on screen, and types the name otherwise (one action either way).
      const chipSel = `section[aria-labelledby=su_h_b${a.ai}] .su-chips button[data-name="${b.name.toLowerCase()}"]`;
      const chip = CHIPS.includes(b.name) && (h.seed % 2 === 0) && !(b.freq === 'some' && b.name !== 'Council Tax') && await p.isVisible(chipSel);
      if (chip && j < a.rows) { await act('click', chipSel); await p.waitForTimeout(30); }
      else { if (j >= a.rows) { await act('click', `#su_b_${a.ai}_more`); a.rows++; await p.waitForTimeout(30); } await act('fill', id('n'), b.name); }
      await act('fill', id('a'), money(b.amount));
      const f = await p.inputValue(id('f'));
      if (f !== b.freq) { await act('select', id('f'), b.freq); await p.waitForTimeout(30); }
      if (b.freq === 'yearly') await act('select', id('m'), String(b.month));
      if (b.freq === 'some') { const on = await p.$$eval(`[id^="su_b_${a.ai}_${j}_m_"][aria-pressed=true]`, l => l.map(x => Number(x.id.split('_').pop())));
        for (let mm = 1; mm <= 12; mm++) if (on.includes(mm) !== b.picked.includes(mm)) await act('click', `#su_b_${a.ai}_${j}_m_${mm}`); }
    }
    // Setup says a figure isn't offered exactly where docs/onboarding.md 5.9 says (the sections that are open).
    for (const x of secs.concat(lines)) { if (x.closed) continue; const link = !!(await p.$(`#su_b_${x.ai}_fig`)) || !!(await p.$(`#su_figbox_${x.ai}`)), why = !!(await p.$(`#su_b_${x.ai}_nofig`)), ok = figureAllowed(h, x.name);
      if (ok === why || (ok && !link)) M.problems.push(`${x.name}: setup ${why ? 'says a figure is not offered' : 'offers a figure'}, 5.9 says ${ok ? 'it can have one' : 'it cannot'}`); }
    if (opts.axe) M.axe.push(...(await axe(p)).map(x => 'step 5: ' + x));
    await textOf();
    m = await next('Spending and saving'); if (m) throw new Error('step 5: ' + m);
    M.step = 6;
    // 6. Budgets and savings. 2.14: drawn by account ("Kept in Joint account", data-acct), so each is typed in its
    // account's group: an empty row there if there is one, else its "+ Add" (a line's opens it with a row).
    const group = (key, want) => p.evaluate(([key, want]) => { const sec = document.querySelector(`section[aria-labelledby=su_h_${key}]`);
      const g = [...sec.querySelectorAll('[data-acct]')].find(e => e.getAttribute('data-acct') === want); if (!g) return null;
      const names = [...g.querySelectorAll('.qa-row input[id$="_n"]')], empty = names.find(i => !i.value.trim() && !i.closest('.qa-row').querySelector('input.num').value.trim());
      return { add: (g.querySelector('button[id^="su_add"]') || {}).id, empty: empty ? empty.id.replace(/_n$/, '') : null, last: names.length ? names[names.length - 1].id.replace(/_n$/, '') : null }; }, [key, want]);
    for (const [key, list, rows] of [['g', h.budgets, 'budgets'], ['v', h.savings, 'savings']]) {
      for (let j = 0; j < list.length; j++) { const x = list[j], want = intendedAccount(h, x, rows);
        let g = await group(key, want); if (!g) throw new Error(`no ${rows} group for ${want}`);
        if (!g.empty) { await act('click', '#' + g.add); await p.waitForTimeout(30); g = await group(key, want); g.empty = g.last; }
        await act('fill', `#${g.empty}_n`, x.name); await act('fill', `#${g.empty}_a`, money(x.amount)); } }
    await textOf();
    m = await next(first); if (m) throw new Error('step 6: ' + m);
    M.step = 7; await textOf();
    // 7. Preview.
    M.preview = await p.$$eval('#su_transfers li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    M.previewLeft = await p.$eval('#su_left', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
    M.previewShort = await p.$eval('#su_short', e => e.innerText).catch(() => '');
    M.figNotes = await p.$eval('#su_fignotes', e => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
    M.previewNotes = await p.$$eval('[id^=su_fig_note_]', l => l.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
    M.firstDay = await p.$eval('#su_first', e => e.innerText).catch(() => '');
    await act('click', '#su_finish'); await p.waitForTimeout(250); await skipTour(p);
    // The Pay tab.
    const c = await LS(p, K.cfg), label = await p.textContent('#monthLabel');
    // SAVED=folder: the settings setup saved, one file per seed (to compare two versions of setup).
    if (process.env.SAVED) { fs.mkdirSync(process.env.SAVED, { recursive: true }); fs.writeFileSync(process.env.SAVED + '/' + h.seed + '.json', JSON.stringify(c, null, 1)); }
    const [mn, yy] = label.split(' '), mo = MN.indexOf(mn) + 1, k = yy + '-' + String(mo).padStart(2, '0');
    // The first month's pay, nothing typed yet: usual pay, or each × N for someone on a pattern (5.3.3).
    // 2.17 (L2): with a recent payday, each × min(M, N), M the paydays counted in the month's window.
    const counts = h.people.map((q, i) => { if (!M.dated[i]) return null; const w = windowOracle(c.payday, k, CAL); return countOracle({ every: q.every, on: M.dated[i] }, w.after, w.upTo, CAL).length; });
    const now = h.people.map((q, i) => q.every ? r2(q.each * Math.min(counts[i] ?? PAY_N[q.every], PAY_N[q.every])) : q.pay), pay = {}; c.people.forEach((pp, i) => pay[pp.id] = now[i]);
    M.counts = counts;
    const mc = P.cfgFor(c, k, []), r = P.calc(mc, mo, pay, []);
    M.month = k; M.payNotes = await p.$$eval('[id^=figNote]', l => l.map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
    M.payTab = { steps: await paySteps(p), hero: await p.$eval('#heroFloat', e => e.textContent).catch(() => ''), heroH: await p.$eval('#heroH', e => e.textContent).catch(() => ''),
      keeps: await p.$eval('#heroKeeps', e => e.innerText.replace(/\s+/g, ' ')).catch(() => ''), warn: await p.$$eval('#hero .hwarn', l => l.map(x => x.textContent)), notes: await p.$$eval('#steps .note', l => l.map(x => x.textContent)) };
    // Saved settings: every item where it was meant to go, and nothing lost.
    const where = (list, field) => c[list].map(x => x.name + '@' + (c.accounts.find(a => a.id === x[field]) || {}).name);
    const wantBills = h.bills.map(b => b.name + '@' + intendedAccount(h, b, 'bills'));
    if (JSON.stringify(where('bills', 'account').sort()) !== JSON.stringify(wantBills.sort())) M.problems.push('saved bills differ: ' + JSON.stringify(where('bills', 'account')));
    if (c.bills.length !== h.bills.length) M.problems.push(`${h.bills.length} bills typed, ${c.bills.length} saved`);
    // The calculation on the saved settings, the oracle, and the screen.
    const inv = invariants(P, mc, r); inv.forEach(x => M.problems.push('invariant: ' + x));
    const cmp = compare(P, spec, mc, r, mo, now); cmp.bad.forEach(x => M.problems.push('oracle: ' + x));
    // 2.16: the patterns as typed; E17 (one person on a pattern with a pay account, bills and spending gets Bills topped up
    // from the pay account); and step 2 takes one more action per person on a pattern, and no more for anyone paid monthly.
    h.people.forEach((q, i) => { const got = c.people[i].pattern, want = q.every ? Object.assign({ every: q.every, each: q.each }, M.dated[i] ? { on: M.dated[i] } : {}) : undefined;
      if (JSON.stringify(got) !== JSON.stringify(want)) M.problems.push(`${q.name}'s pattern saved as ${JSON.stringify(got)}, typed ${JSON.stringify(want)}`); });
    if (!h.multi && h.pool === 'split') { const nm = id => (c.accounts.find(a => a.id === id) || {}).name || 'nowhere', up = n => nm((c.accounts.find(a => a.name === n) || {}).leftoverTo);
      const want = topsUpBills(h) ? { 'Bills account': 'Pay account', 'Pay account': 'Spending account' } : { 'Pay account': 'Bills account', 'Bills account': 'Spending account' };
      M.e17 = topsUpBills(h) ? { topUp: r.steps.some(x => x.kind === 'topup' && nm(x.from) === 'Pay account' && nm(x.to) === 'Bills account') } : null;
      Object.keys(want).forEach(n => { if (up(n) !== want[n]) M.problems.push(`E17: ${n} sends what's left to ${up(n)}, expected ${want[n]}${topsUpBills(h) ? ' (one person with a pattern)' : ''}`); });
      if (M.e17 && !M.e17.topUp && h.bills.length) M.problems.push('E17: no top-up from Pay account to Bills account on the Pay tab: ' + JSON.stringify(M.payTab.steps)); }
    { const n = h.people.length, step2 = (n - 1) + n + h.people.filter(q => q.pay > 0).length + 3 * h.income.length + 1 + M.msgs.filter(x => x.step === 2).length + h.people.filter(q => q.every).length + Object.keys(M.dated).length;
      M.step2 = { want: step2, got: M.perStep[2] || 0, patterned: h.people.filter(q => q.every).length };
      if (M.step2.got !== step2) M.problems.push(`step 2 took ${M.step2.got} actions, expected ${step2} (${M.step2.patterned} on a pattern)`); }
    const fm = x => P.fmt(x);
    const shown = M.payTab.steps.map(s => s.split(' £').pop()), want = r.steps.map(s => fm(s.amt).replace('£', ''));
    if (JSON.stringify(shown) !== JSON.stringify(want)) M.problems.push('Pay tab transfers ' + JSON.stringify(M.payTab.steps) + ' vs calc ' + JSON.stringify(want));
    if (M.payTab.hero.replace(/\s/g, '') !== fm(r.flt).replace(/\s/g, '')) M.problems.push(`hero shows ${M.payTab.hero}, calc ${fm(r.flt)}`);
    const pv = M.preview.map(t => (t.match(/£[\d,]+\.\d\d/) || [''])[0]);
    // The preview month is the same as the Pay tab's after "Looks right, start".
    if (pv.join() !== r.steps.map(s => fm(s.amt)).join()) M.problems.push('preview transfers differ from the Pay tab: ' + JSON.stringify(M.preview));
    // 2.14: the figures as typed are saved (a household without one saves none), and the preview and the Pay tab say what's
    // in each account that isn't listed yet.
    const est = (c.estimates || []).map(x => ((c.accounts.find(a => a.id === x.account) || {}).name) + '@' + x.amount).sort(), wantEst = spec.figures.map(f => intendedAccount(spec, { owner: f.owner }, 'bills') + '@' + f.amount).sort();
    if (est.join('|') !== wantEst.join('|')) M.problems.push('saved figures ' + JSON.stringify(est) + ', typed ' + JSON.stringify(wantEst));
    figureExtras(spec).filter(e => e.amount > 0.004).forEach(e => { const say = fm(e.amount);
      [['preview', M.previewNotes], ['Pay tab', M.payNotes]].forEach(([where, notes]) => { if (!notes.some(n => n.includes(say) && /not listed yet/.test(n))) M.problems.push(`${where} doesn't say ${say} of ${e.account}'s bills are not listed yet: ${JSON.stringify(notes)}`); }); });
    plan.filter(g => g.dropped).forEach(g => { if (!(M.figNotes.includes(g.account) && /isn't needed/.test(M.figNotes))) M.problems.push(`${g.account}'s figure is below its listed bills but setup didn't say so: ${JSON.stringify(M.figNotes)}`); });
    if (!spec.figures.length && (M.previewNotes.length || M.payNotes.length)) M.problems.push('a note about bills not listed yet without a figure');
    // 2.12.1: shared budgets, savings and income start where shared money goes (contribute, housekeeping, and
    // households with a boarder); no box needs filling with 0; the pay note stops Next only when nobody has pay.
    const sharedHH = ['contribute', 'housekeeping'].includes(h.style) || Object.keys(h.board).length;
    M.fixes.filter(f => f.what !== 'opened' && sharedHH && (f.what === 'income' || (h[f.what] || []).some(i => i.name === f.name && i.owner === 'shared')))
      .forEach(f => M.problems.push(`setup put ${f.what} "${f.name}" in ${f.was}, not ${f.want}`));
    if (M.zeroed && M.zeroed.length) M.problems.push('setup wanted amounts it doesn\'t use: ' + M.zeroed.join(', '));
    if (M.msgs.some(x => /Without pay/.test(x.msg)) && h.people.some(p => p.pay > 0)) M.problems.push('the pay note stopped Next with someone\'s pay in');
    M.o = cmp.o; M.r = { flt: r.flt, floats: r.floats.map(f => ({ name: (c.accounts.find(a => a.id === f.id) || {}).name, amt: r2(f.amt) })), steps: r.steps.length };
    if (opts.axe) M.axe.push(...(await axe(p)).map(x => 'Pay: ' + x));
  } catch (e) { M.problems.push('STOPPED at step ' + M.step + ': ' + e.message.split('\n')[0]); }
  M.errs = p.errs.slice(); if (M.errs.length) M.problems.push('JS errors: ' + M.errs.join(' | '));
  await ctx.close(); return M;
}

const N = Number(process.argv[2] || 40), S = Number(process.argv[3] || 5001), W = Number(process.argv[4] || 6);
const extra = process.env.FORCED ? JSON.parse(process.env.FORCED) : [];
// 2.14: a quarter of the households (seeds that are 2 or 3 more than a multiple of 4) start from a rough figure, half of those an anchor.
const specs = []; for (let s = S; s < S + N; s++) { const h = makeHousehold(s); specs.push(figuresOn() && s % 4 >= 2 ? withFigures(h, s, (s >> 2) % 2 ? 'anchor' : 'figure') : h); }
extra.forEach((f, i) => specs.push(makeHousehold(9e6 + i, f)));
const out = []; let ix = 0; const t0 = Date.now();
await Promise.all(Array.from({ length: W }, async () => { while (ix < specs.length) { const h = specs[ix++]; out.push({ h, M: await runOne(h, { axe: h.seed % 15 === 0 }) }); if (out.length % 25 === 0) console.error(out.length + ' done, ' + Math.round((Date.now() - t0) / 1000) + 's'); } }));
const stamp = new Date().toISOString().replace(/\..*/, '').replace(/[-:]/g, '').replace('T', '-');
const OUT = process.env.OUT || new URL(`./out/ui-${N}-${stamp}.json`, import.meta.url).pathname;
fs.mkdirSync(OUT.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out));
const bad = out.filter(x => x.M.problems.length);
console.log(`${out.length} households set up through the screens in ${Math.round((Date.now() - t0) / 1000)}s; ${bad.length} with problems (results: ${OUT})`);
// 2.17 (L15): the recent paydays typed, or why not.
{ const typed = out.reduce((s, x) => s + Object.keys(x.M.dated || {}).length, 0), skipped = out.reduce((s, x) => s + (x.M.datesSkipped || 0), 0), odd = out.reduce((s, x) => s + (x.M.counts || []).filter((n, i) => n != null && n !== PAY_N[x.h.people[i].every]).length, 0);
  if (skipped) console.log(`A recent payday (2.17, #su_pon_<i>): SKIPPED for ${skipped} people on a pattern, because setup has no such field yet; everything else was checked as usual.`);
  else console.log(`A recent payday (2.17, #su_pon_<i>): typed for ${typed} people on a pattern; their first month planned on each × the paydays counted (${odd} first months with a count other than the usual).`); }
bad.slice(0, 30).forEach(x => console.log('seed ' + x.h.seed + ' (' + (x.h.style || 'single') + (x.h.pool ? ':' + x.h.pool : '') + (x.h.rule ? ':' + x.h.rule : '') + '): ' + x.M.problems.join(' || ').slice(0, 600)));
await browser.close(); process.exit(bad.length ? 1 : 0);
