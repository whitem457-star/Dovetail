// The household simulation, onboarding part: each household typed into the real setup screens (the built page in
// Chromium), as a person would: the questions answered from the household's description, every bill, budget and
// savings transfer put where it's meant to go. Records every tap and field (friction), every message setup shows and
// every default that had to be changed, then checks the first payday's preview, the Pay tab and the saved settings
// against calc and the oracle. Results go to sim/out/ui-<households>-<date and time>.json (not committed), or to OUT
// if it's set, so two runs never overwrite each other; `node sim/analyse.mjs` sums up the newest.
// Exits 1 when a household has a problem. Build the page first (node build-page.mjs). With SAVED=<folder>, the settings
// each household was saved with go to <folder>/<seed>.json.
// node sim/ui.mjs [households=40] [first seed=5001] [at once=6]   (FORCED='[{…makeHousehold options…}]' adds more)
// `npm run sim:ui` is the full run: 360 households, about 4 minutes, then the summary.
import { session, K, LS, steps as paySteps, skipTour, axe, browser } from '../lib.mjs';
import { P } from '../unit/load.mjs';
import { makeHousehold, intendedAccount, r2 } from './gen.mjs';
import { invariants, compare, idByName } from './check.mjs';
import fs from 'fs';

const TODAY = '2026-10-21';
const money = v => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CHIPS = ['Rent', 'Mortgage', 'Council Tax', 'Energy', 'Water', 'Broadband', 'TV Licence', 'Home insurance', 'Streaming'];

async function runOne(h, opts = {}) {
  const { ctx, p } = await session({ today: TODAY, native: true });
  const M = { seed: h.seed, actions: 0, perStep: {}, msgs: [], fixes: [], textLen: {}, step: 1, axe: [], problems: [] };
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
    for (let i = 0; i < h.people.length; i++) { if (i) await act('click', '#su_addp'); await act('fill', '#su_p_' + i, h.people[i].name); if (h.people[i].pay > 0) await act('fill', '#su_pu_' + i, money(h.people[i].pay)); }
    for (let i = 0; i < h.income.length; i++) { await act('click', '#su_addi'); await act('fill', '#su_in_' + i, h.income[i].name); await act('fill', '#su_inv_' + i, money(h.income[i].amount)); }
    await textOf();
    let m = await next('Your payday');
    if (m) { if (/Without pay/.test(m)) { m = await next('Your payday'); } if (m) throw new Error('step 2: ' + m); }
    M.step = 3; await textOf();
    // 3. Payday
    if (!h.payday) await act('click', '#su_skip');
    else { if (h.people.length > 1) await act('click', `label[for=su_same_${h.payday.same ? 'yes' : 'no'}]`);
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
    const used = {};
    for (const b of h.bills) {
      const want = intendedAccount(h, b, 'bills'), a = acct[want]; if (!a) throw new Error('no bills section for ' + want);
      if (a.closed) { await act('click', `#su_b_${a.ai}_open`); a.closed = false; a.rows = 1; M.fixes.push({ step: 5, what: 'opened', name: want }); await p.waitForTimeout(30); }
      const j = used[a.ai] = (used[a.ai] ?? -1) + 1, id = f => `#su_b_${a.ai}_${j}_${f}`;
      const chip = CHIPS.includes(b.name) && (h.seed % 2 === 0) && !(b.freq === 'some' && b.name !== 'Council Tax');
      if (chip && j < a.rows) { await act('click', `section[aria-labelledby=su_h_b${a.ai}] .su-chips button[data-name="${b.name.toLowerCase()}"]`); await p.waitForTimeout(30); }
      else { if (j >= a.rows) { await act('click', `#su_b_${a.ai}_more`); a.rows++; await p.waitForTimeout(30); } await act('fill', id('n'), b.name); }
      await act('fill', id('a'), money(b.amount));
      const f = await p.inputValue(id('f'));
      if (f !== b.freq) { await act('select', id('f'), b.freq); await p.waitForTimeout(30); }
      if (b.freq === 'yearly') await act('select', id('m'), String(b.month));
      if (b.freq === 'some') { const on = await p.$$eval(`[id^="su_b_${a.ai}_${j}_m_"][aria-pressed=true]`, l => l.map(x => Number(x.id.split('_').pop())));
        for (let mm = 1; mm <= 12; mm++) if (on.includes(mm) !== b.picked.includes(mm)) await act('click', `#su_b_${a.ai}_${j}_m_${mm}`); }
    }
    await textOf();
    m = await next('Spending and saving'); if (m) throw new Error('step 5: ' + m);
    M.step = 6;
    // 6. Budgets and savings.
    for (const [key, list, rows] of [['g', h.budgets, 'budgets'], ['v', h.savings, 'savings']]) {
      for (let j = 0; j < list.length; j++) { const x = list[j];
        if (j > 0) await act('click', '#su_add' + key);
        await act('fill', `#su_${key}_${j}_n`, x.name); await act('fill', `#su_${key}_${j}_a`, money(x.amount));
        const want = intendedAccount(h, x, rows), cur = await p.$eval(`#su_${key}_${j}_s`, s => s.options[s.selectedIndex].text);
        if (cur !== want) { M.fixes.push({ step: 6, what: rows, name: x.name, was: cur, want }); await act('select', `#su_${key}_${j}_s`, { label: want }); } } }
    await textOf();
    m = await next('Your first payday'); if (m) throw new Error('step 6: ' + m);
    M.step = 7; await textOf();
    // 7. Preview.
    M.preview = await p.$$eval('#su_transfers li', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    M.previewLeft = await p.$eval('#su_left', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
    M.previewShort = await p.$eval('#su_short', e => e.innerText).catch(() => '');
    M.firstDay = await p.$eval('#su_first', e => e.innerText).catch(() => '');
    await act('click', '#su_finish'); await p.waitForTimeout(250); await skipTour(p);
    // The Pay tab.
    const c = await LS(p, K.cfg), label = await p.textContent('#monthLabel');
    // SAVED=folder: the settings setup saved, one file per seed (to compare two versions of setup).
    if (process.env.SAVED) { fs.mkdirSync(process.env.SAVED, { recursive: true }); fs.writeFileSync(process.env.SAVED + '/' + h.seed + '.json', JSON.stringify(c, null, 1)); }
    const [mn, yy] = label.split(' '), mo = MN.indexOf(mn) + 1, k = yy + '-' + String(mo).padStart(2, '0');
    const pay = {}; c.people.forEach(pp => pay[pp.id] = pp.usualPay);
    const mc = P.cfgFor(c, k, []), r = P.calc(mc, mo, pay, []);
    M.month = k;
    M.payTab = { steps: await paySteps(p), hero: await p.$eval('#heroFloat', e => e.textContent).catch(() => ''), heroH: await p.$eval('#heroH', e => e.textContent).catch(() => ''),
      keeps: await p.$eval('#heroKeeps', e => e.innerText.replace(/\s+/g, ' ')).catch(() => ''), warn: await p.$$eval('#hero .hwarn', l => l.map(x => x.textContent)), notes: await p.$$eval('#steps .note', l => l.map(x => x.textContent)) };
    // Saved settings: every item where it was meant to go, and nothing lost.
    const where = (list, field) => c[list].map(x => x.name + '@' + (c.accounts.find(a => a.id === x[field]) || {}).name);
    const wantBills = h.bills.map(b => b.name + '@' + intendedAccount(h, b, 'bills'));
    if (JSON.stringify(where('bills', 'account').sort()) !== JSON.stringify(wantBills.sort())) M.problems.push('saved bills differ: ' + JSON.stringify(where('bills', 'account')));
    if (c.bills.length !== h.bills.length) M.problems.push(`${h.bills.length} bills typed, ${c.bills.length} saved`);
    // The calculation on the saved settings, the oracle, and the screen.
    const inv = invariants(P, mc, r); inv.forEach(x => M.problems.push('invariant: ' + x));
    const cmp = compare(P, h, mc, r, mo); cmp.bad.forEach(x => M.problems.push('oracle: ' + x));
    const fm = x => P.fmt(x);
    const shown = M.payTab.steps.map(s => s.split(' £').pop()), want = r.steps.map(s => fm(s.amt).replace('£', ''));
    if (JSON.stringify(shown) !== JSON.stringify(want)) M.problems.push('Pay tab transfers ' + JSON.stringify(M.payTab.steps) + ' vs calc ' + JSON.stringify(want));
    if (M.payTab.hero.replace(/\s/g, '') !== fm(r.flt).replace(/\s/g, '')) M.problems.push(`hero shows ${M.payTab.hero}, calc ${fm(r.flt)}`);
    const pv = M.preview.map(t => (t.match(/£[\d,]+\.\d\d/) || [''])[0]);
    // The preview month is the same as the Pay tab's after "Looks right, start".
    if (pv.join() !== r.steps.map(s => fm(s.amt)).join()) M.problems.push('preview transfers differ from the Pay tab: ' + JSON.stringify(M.preview));
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
const specs = []; for (let s = S; s < S + N; s++) specs.push(makeHousehold(s));
extra.forEach((f, i) => specs.push(makeHousehold(9e6 + i, f)));
const out = []; let ix = 0; const t0 = Date.now();
await Promise.all(Array.from({ length: W }, async () => { while (ix < specs.length) { const h = specs[ix++]; out.push({ h, M: await runOne(h, { axe: h.seed % 15 === 0 }) }); if (out.length % 25 === 0) console.error(out.length + ' done, ' + Math.round((Date.now() - t0) / 1000) + 's'); } }));
const stamp = new Date().toISOString().replace(/\..*/, '').replace(/[-:]/g, '').replace('T', '-');
const OUT = process.env.OUT || new URL(`./out/ui-${N}-${stamp}.json`, import.meta.url).pathname;
fs.mkdirSync(OUT.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out));
const bad = out.filter(x => x.M.problems.length);
console.log(`${out.length} households set up through the screens in ${Math.round((Date.now() - t0) / 1000)}s; ${bad.length} with problems (results: ${OUT})`);
bad.slice(0, 30).forEach(x => console.log('seed ' + x.h.seed + ' (' + (x.h.style || 'single') + (x.h.pool ? ':' + x.h.pool : '') + (x.h.rule ? ':' + x.h.rule : '') + '): ' + x.M.problems.join(' || ').slice(0, 600)));
await browser.close(); process.exit(bad.length ? 1 : 0);
