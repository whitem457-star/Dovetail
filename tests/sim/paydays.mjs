// The household simulation, counting paydays (2.17, layer 2; docs/payperiods.md 13.2, L18). Made-up households with
// someone on a pay pattern and a recent payday (gen.mjs withDates), over 24 months: each month's pay typed, filled by a
// tick (payEstimated) or left empty, saved through the app's own freezePaydays as flushMonth saves it (typing digit by
// digit isn't modelled; the save is), with the extra payday line's controls at random (an amount typed: edited; Count it
// this month; Set it aside; Not an extra payday; It was an extra payday; the layer-1 link; a ticked box typed over; a box
// cleared; Use it this month in a gap month, the lock on the month before, and the one-off removed again). Then:
//   - every save against gen.mjs's freezeOracle (what L2 and L3 say is stored), byte for byte (keys in any order);
//   - every month's window and count against gen.mjs's own counter (transferWindow, paydaysIn), planPay against
//     planOracle2 (typed or ticked: the stored figures only; untyped: each × min(M, N); typical: each × N), payFor,
//     predictedFloat, and the transfers against check.mjs's invariants, the household oracle and the top-up rule;
//   - L1 across versions: 2.16's planPay (sim/v216.mjs) gives every typed or ticked month the same figures, and after every
//     date is removed every month;
//   - L9: standing orders and averageShort are the same with or without the dates; L13 and L14: the settings and months
//     survive normCfg and normMonths, and the backup is version 6 needing 2.17;
//   - the invariant (L18): for every typed or ticked month, after each edit to the settings alone (the transfer day moved,
//     a date added, corrected by whole intervals and otherwise, removed; since added, moved and removed; the holiday rule
//     switched off, or given a made-up holiday, in a second copy of the page's code; a dated each edit and a dated change
//     of pattern; a change of interval with "Change earlier months too", where only the months it names may change), the
//     stored month byte for byte, planPay's arrived, setAside and used, and calcMonth's steps, floats and left over are
//     unchanged; untyped months' counts and estimates are checked against the counter after each edit too.
// Then (L22 b) households with no payday date: extras typed through "Had an extra payday?" and a change of interval three
// ways (undated, dated, "Change earlier months too"), every saved month byte for byte as before.
// Reports counts per edit kind and the M − N range seen. Exits 1 on any problem, or when 2.17's core isn't there.
// node sim/paydays.mjs [households=60] [first seed=1]     (npm run sim: 60; sim:full: 600)
import { P as P0, loadPage } from '../unit/load.mjs';
import { makeHousehold, withDates, oneOffsFor, oneOffAccount, r2, NAMES, PAY_N, PAY_YEAR, monthlyOf, holidayCal, windowOracle, transferDayOracle, countOracle,
  dayStr, dayNum, shiftK, moveBack, datedPerson, freezeOracle, planOracle2, defaultAside, GOVUK, holidaysByRule, rng, payMonthsFor, monthsObj } from './gen.mjs';
import { buildCfg, styleKey } from './logic.mjs';
import { invariants, compare, topUps, sameResult, idByName, PAYDAY_API, paydayApiMissing, paydayApiNote, paydayBasics } from './check.mjs';
import { V216 } from './v216.mjs';

const cl = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}' : JSON.stringify(v);
const near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 0.005;
const MONTHS = 24, CAL = { real: holidayCal('real'), none: holidayCal('none'), madeup: holidayCal('madeup') };
const has = (o, k) => !!(o && o[k] != null);
const NAME_RE = new RegExp('\\b(' + NAMES.join('|') + ')\\b', 'g');

/** The page's code with the bank holiday rule replaced (L18): a later bankHolidaysEW declaration giving cal's list. */
export const switchedPage = (load, cal) => load('function bankHolidaysEW(y){return __HOLIDAYS(y)}', { __HOLIDAYS: y => (Number.isInteger(y) && y >= 1900 && y <= 2999 ? cal.list(y) : []) });

/** Runs `n` households from seed `first` against page code P (load(extra, inject) makes a second copy of the same code,
    for the holiday switch). Returns {fails, st}. */
export function runPaydays(P, n, first = 1, load = loadPage) {
  const fails = {}, st = { households: 0, skipped: 0, people: { 7: 0, 14: 0, 28: 0 }, dated: 0, since: 0, later: 0, noDay: 0, outside: 0, easter: 0, months: 0,
    saves: 0, frozen: 0, kinds: { typed: 0, ticked: 0, untyped: 0 }, actions: {}, mn: { 7: {}, 14: {}, 28: {} }, edits: {}, untyped: { compared: 0, changed: 0 }, v216: 0, sinceHoliday: 0, beforeSince: 0 };
  const act = k => { st.actions[k] = (st.actions[k] || 0) + 1; };
  const P2 = { none: switchedPage(load, CAL.none), madeup: switchedPage(load, CAL.madeup) };
  const switchTook = P2.none.isBankHolidayEW && !P2.none.isBankHolidayEW('2027-12-27') && P2.madeup.isBankHolidayEW('2027-12-31') && P.isBankHolidayEW('2027-12-27');
  if (!switchTook) (fails['holiday switch: a second copy of the page with bankHolidaysEW replaced still has the old holidays (isBankHolidayEW must read bankHolidaysEW)'] = []).push('all');
  for (let seed = first; seed < first + n; seed++) {
    let h = withDates(makeHousehold(seed, { patterns: 0.6 }), seed, seed % 4 === 0 ? { start: '2026-11' } : {});
    // One household in four starts in November 2026 with its first weekly earner (or its first earner, made weekly) dated,
    // paid on Mondays, and the transfer day the 25th: Easter 2027's moved Monday makes a gap month after an extra one (5.6
    // rule 3, "Use it this month").
    if (seed % 4 === 0) { let p = h.people.find(q => q.every === 7) || h.people.find(q => q.pay > 0);
      if (p && !p.every) { p.every = 7; p.each = r2(p.pay * 12 / 52); p.pay = monthlyOf(p); }
      if (p) { p.on = '2027-03-01'; delete p.since; delete p.dateFrom; h.payday = { day: 25, same: true, weekend: true }; h.noTransferDay = false; st.easter++; } }
    if (!h.people.some(p => p.on)) { st.skipped++; continue; }
    const add = (k, msg) => { const key = msg.replace(NAME_RE, 'Someone').replace(/\[[^\]]*\]|\{.*\}/g, '…').replace(/\d{4}-\d{2}(-\d{2})?/g, 'D').replace(/[-\d.,£]+/g, '#').replace(/\b(p\d|a[0-9a-z]{6,})\b/g, '·'); (fails[key] ||= []).push(seed + '@' + k + ': ' + msg); };
    try { household(P, P2, h, seed, add, st, act); } catch (e) { add('-', 'threw: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' ')); }
  }
  return { fails, st };
}

/** One household: build its 24 months through freezePaydays, check them, then the edits. */
function household(P, P2, h, seed, add, st, act) {
  const R = rng(seed * 977 + 5), chance = p => R() < p;
  st.households++; if (h.noTransferDay) st.noDay++; if (h.start !== '2026-11') st.outside++;
  h.people.forEach(p => { if (p.every) st.people[p.every]++; if (p.on) st.dated++; if (p.since) st.since++; if (p.since && moveCheck(p.since)) st.sinceHoliday++; if (p.dateFrom) st.later++; });
  const c0 = buildCfg(h), keys = Array.from({ length: MONTHS }, (_, j) => shiftK(h.start, j)), idx = {}; keys.forEach((k, j) => { idx[k] = j; });
  // The settings as they were in month j: dates written straight onto the pattern (L4), from dateFrom on; no transfer day
  // in a damaged file.
  const cfgAt = j => { const c = cl(c0); h.people.forEach((p, i) => { if (p.on && !(p.dateFrom > j)) { c.people[i].pattern.on = p.on; if (p.since) c.people[i].pattern.since = p.since; } });
    if (h.noTransferDay) c.payday = {}; return c; };
  const pid = i => c0.people[i].id, ix = {}; c0.people.forEach((p, i) => { ix[p.id] = i; });
  // One-offs as patternRun has them (by month number), and "Use it this month"'s, which the oracle counts as the person's pay.
  const spec = oneOffsFor(h, seed), sep = o => o.owner === 'shared' && h.style === 'separate' ? { ...o, owner: 0 } : o;
  const regular = m => (spec[m] || []).map(o => ({ id: o.id, kind: o.kind, name: o.name, amount: o.amount, account: idByName(c0, oneOffAccount(h, sep(o))) }));
  const months = {};
  const counted = (c, i, k, cal = CAL.real) => { const q = datedPerson(c.people[i]); if (!q.every || !q.on) return null; const w = windowOracle(c.payday, k, cal); return countOracle(q, w.after, w.upTo, cal); };
  // A save of month k with body, as flushMonth makes it: the app's freezePaydays and the oracle's, compared; the oracle's is kept.
  function save(c, k, body, why) {
    const old = months[k], dp = c.people.map(datedPerson), b = cl(body);
    let got; try { const r = P.freezePaydays(cl(c), cl(months), k, b, cl(old)); got = r && typeof r === 'object' ? r : b; } catch (e) { got = { threw: e.message }; }
    const want = freezeOracle(dp, body, old, id => (counted(c, ix[id], k) || []).length, id => lockedIn(Object.assign({}, months, { [k]: body }), k, id));
    if (stable(got) !== stable(want)) add(k, `${why}: freezePaydays stores ${stable(got)} but L3 says ${stable(want)} (before: ${stable(old)})`);
    st.saves++; months[k] = want; return want;
  }
  // ---- Building the 24 months.
  const never = h.people.map(() => chance(0.2));
  keys.forEach((k, j) => {
    // L22 (a): the month a date is added from, some earlier months typed with "Had an extra payday?" (layer 1) have the box
    // cleared and typed again: the freeze runs then, and the household's amount stays, marked edited.
    h.people.forEach((p, i) => { if (p.dateFrom !== j) return; const id = pid(i), c = cfgAt(j);
      keys.slice(0, j).forEach(x => { const d0 = months[x]; if (!d0 || !has(d0.pay, id) || (d0.payEstimated && d0.payEstimated[id]) || !(d0.extra && d0.extra[id]) || has(d0.paydays, id) || !chance(0.5)) return;
        const v = d0.pay[id], b = cl(d0); delete b.pay[id]; if (!Object.keys(b.pay).length) delete b.pay; act('a layer-1 box with its own extra cleared and typed again after the date was added');
        save(c, x, b, 'a layer-1 box cleared after the date was added'); const b2 = cl(months[x]); (b2.pay ||= {})[id] = v; const got = save(c, x, b2, 'the box typed again');
        if (!(got.extra && got.extra[id] && got.extra[id].amount === d0.extra[id].amount)) add(x, `the household's own extra (${d0.extra[id].amount}) became ${JSON.stringify(got.extra && got.extra[id])} when the box was typed again (L22)`); }); });
    const c = cfgAt(j), m = Number(k.slice(5)), body = cl(months[k]) || {}, kind = {};
    h.people.forEach((p, i) => { kind[i] = never[i] || !(p.pay > 0) ? 'untyped' : (x => x < 0.55 ? 'typed' : x < 0.7 ? 'ticked' : 'untyped')(R()); });
    const typedAmount = i => { const p = h.people[i]; if (!p.every) return r2(p.pay * (0.85 + R() * 0.3));
      const cnt = counted(c, i, k), M = cnt ? cnt.length : (R() < 0.25 ? PAY_N[p.every] + 1 : PAY_N[p.every]); let s = 0; for (let t = 0; t < M; t++) s += r2(p.each * (0.9 + R() * 0.2)); return r2(s); };
    const plan0 = P.planPay(c, months, k) || {};
    h.people.forEach((p, i) => { const id = pid(i);
      if (kind[i] === 'typed') { const v = typedAmount(i); if (v === 0 && chance(0.5)) { kind[i] = 'untyped'; return; } (body.pay ||= {})[id] = v; }
      if (kind[i] === 'ticked') { const q = datedPerson(c.people[i]), cnt = counted(c, i, k), want = q.every ? planOracle2(q, body, cnt ? cnt.length : null, null).used : null, g = plan0[id] && plan0[id].used;
        if (want != null && !near(g, want)) add(k, `a tick before ${p.name}'s pay is typed would fill the box with ${g}, but L2 says ${want}`);
        (body.pay ||= {})[id] = want != null ? want : g; (body.payEstimated ||= {})[id] = true; }
      st.kinds[kind[i]]++; });
    const ro = regular(m); if (ro.length) body.oneOffs = (body.oneOffs || []).concat(ro.filter(o => !(body.oneOffs || []).some(x => x.id === o.id)));
    let d = save(c, k, body, 'the month typed or ticked');
    if (d.paydays) st.frozen += Object.keys(d.paydays).length;
    // The extra payday line and the boxes, at random.
    h.people.forEach((p, i) => { if (!p.every) return; const id = pid(i), q = datedPerson(c.people[i]);
      const line = () => d.extra && d.extra[id], frozenExtra = () => has(d.paydays, id) && d.paydays[id] > q.n;
      const again = (f, what) => { const b = cl(d); f(b); act(what); d = save(c, k, b, what); };
      if (kind[i] === 'ticked' && chance(0.3)) { const v = typedAmount(i); again(b => { b.pay[id] = v; delete b.payEstimated[id]; if (!Object.keys(b.payEstimated).length) delete b.payEstimated; }, 'a ticked box typed over'); kind[i] = 'typed'; }
      if (kind[i] !== 'typed') return;
      if (line() && !lockedIn(months, k, id)) {
        const a = R();
        if (a < 0.15) { const v = r2(q.each * (0.6 + R() * 0.6)), fz = frozenExtra(); again(b => { b.extra[id] = Object.assign({}, b.extra[id], { amount: v }, fz ? { edited: true } : {}); }, fz ? 'an amount typed in the line' : 'an amount typed in a layer-1 line'); }
        else if (a < 0.3 && !line().counted) again(b => { b.extra[id].counted = true; }, 'Count it this month');
        else if (a < 0.5 && !line().counted && frozenExtra()) { again(b => { b.extra[id] = { amount: 0, edited: true }; }, 'Not an extra payday');
          if (chance(0.5)) again(b => { delete b.extra[id].edited; }, 'It was an extra payday'); }
        if (line() && line().counted && chance(0.3)) again(b => { delete b.extra[id].counted; }, 'Set it aside');
      } else if (!line() && !frozenExtra() && chance(h.people[i].dateFrom > j ? 0.3 : 0.06)) { const v = chance(0.5) ? q.each : r2(q.each * (0.5 + R())); again(b => { (b.extra ||= {})[id] = { amount: v }; }, 'the layer-1 link "Had an extra payday?"'); }
      if (chance(0.03) && (!line() || line().edited || !frozenExtra())) { again(b => { delete b.pay[id]; if (!Object.keys(b.pay).length) delete b.pay; }, 'a box cleared (M7)'); kind[i] = 'untyped'; }
    });
    // "Use it this month" (L6): offered in a month with fewer paydays than usual (frozen or counted) after a month whose
    // pay is typed with an extra above £0 that isn't counted, and no one-off using it yet. Checked against useExtraOffer for
    // everyone on a pattern every month; taken at random when offered.
    if (j > 0) h.people.forEach((p, i) => { const id = pid(i), q = datedPerson(c.people[i]); if (!q.every) return;
      const prev = keys[j - 1], pd = months[prev], x = pd && pd.extra && pd.extra[id], cnt = counted(c, i, k), M = has(d.paydays, id) ? d.paydays[id] : cnt ? cnt.length : null;
      const offered = q.on != null && M != null && M < q.n && !!(pd && has(pd.pay, id) && !(pd.payEstimated && pd.payEstimated[id])) && !!x && x.amount > 0 && !x.counted && !lockedIn(months, prev, id);
      const o = offered ? { kind: 'in', name: `${p.name}'s extra payday from ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(prev.slice(5)) - 1]}`,
        amount: x.amount, account: c.people[i].payAccount, extraFrom: prev, extraOf: id } : null;
      let got; try { got = P.useExtraOffer(c, months, k, id); } catch (e) { got = { threw: e.message }; }
      if (stable(got || null) !== stable(o)) add(k, `useExtraOffer for ${p.name} gives ${stable(got || null)}, L6 says ${stable(o)} (${M} paydays, the month before ${pd ? stable({ pay: pd.pay && pd.pay[id], extra: x }) : 'not saved'})`);
      if (!offered || !chance(0.6)) return;
      o.id = 'use' + k + id; act('Use it this month'); d = save(c, k, Object.assign(cl(d), { oneOffs: (d.oneOffs || []).concat([o]) }), 'Use it this month');
      if (P.extraLock(months, prev, id) !== k) add(k, `extraLock for ${prev} gives ${P.extraLock(months, prev, id)} after Use it this month in ${k}`);
      // The lock: the month before's pay typed again doesn't move its amount; removing the one-off unlocks it.
      if (chance(0.5)) { const b = cl(months[prev]); b.pay[id] = r2(b.pay[id] * (0.95 + R() * 0.1)); act('the month before typed again while locked'); save(c, prev, b, 'the month before typed again while locked'); }
      if (chance(0.35)) { act('the one-off removed'); d = save(c, k, Object.assign(cl(d), { oneOffs: d.oneOffs.filter(z => z.id !== o.id) }), 'the one-off removed');
        if (P.extraLock(months, prev, id) != null) add(k, `extraLock for ${prev} gives ${P.extraLock(months, prev, id)} after the one-off was removed`);
        if (chance(0.6)) { const b = cl(months[prev]); b.pay[id] = r2(b.pay[id] * (0.95 + R() * 0.1)); act('the month before typed again, unlocked'); save(c, prev, b, 'the month before typed again, unlocked'); } }
    });
  });
  const c = cfgAt(MONTHS - 1);
  // ---- Every month against the counter and the oracles.
  const monthlyEst = (cc, i, k) => { const id = pid(i), ks = Object.keys(months).filter(x => x < k && months[x] && has(months[x].pay, id) && !(months[x].payEstimated && months[x].payEstimated[id])).sort();
    return ks.length ? months[ks[ks.length - 1]].pay[id] : cc.people[i].usualPay; };
  const extraIn = k => { const out = {}; (((months[k] || {}).oneOffs) || []).forEach(o => { if (o.extraFrom && o.extraOf) out[o.extraOf] = (out[o.extraOf] || 0) + o.amount; }); return out; };
  const typedOrTicked = k => !!(months[k] && months[k].pay && Object.keys(months[k].pay).length);
  keys.forEach(k => {
    const m = Number(k.slice(5)), d = months[k] || {}, tw = P.transferWindow(c, k), wo = windowOracle(c.payday, k, CAL.real);
    st.months++;
    if (!tw || tw.after !== dayStr(wo.after) || tw.upTo !== dayStr(wo.upTo)) add(k, `transferWindow is ${JSON.stringify(tw)} but L8 says after ${dayStr(wo.after)}, up to ${dayStr(wo.upTo)} (transfer day ${JSON.stringify(c.payday)})`);
    if (c.payday && c.payday.day && P.paydayFor(c.payday, k) !== dayStr(transferDayOracle(c.payday, k, CAL.real))) add(k, `paydayFor gives ${P.paydayFor(c.payday, k)}, the counter's transfer day is ${dayStr(transferDayOracle(c.payday, k, CAL.real))}`);
    const pl = P.planPay(c, months, k) || {}, typ = P.planPay(c, months, k, undefined, { typical: true }) || {}, pf = P.payFor(c, months, k), now = [];
    c.people.forEach((p, i) => { const q = datedPerson(p), cnt = counted(c, i, k), g = pl[p.id] || {}, nm = p.name;
      if (q.every) { const pf2 = P.paydaysFor(c, p.id, k); if (stable(pf2 == null ? null : pf2) !== stable(cnt)) add(k, `paydaysFor gives ${nm} ${JSON.stringify(pf2)}, the counter ${JSON.stringify(cnt)}`); }
      if (cnt) { const got = P.paydaysIn(p.pattern, tw && tw.after, tw && tw.upTo);
        if (stable(got) !== stable(cnt)) add(k, `paydaysIn gives ${nm} ${JSON.stringify(got)} but the counter counts ${JSON.stringify(cnt)} (every ${q.every} from ${q.on}${q.since ? ', since ' + q.since : ''}; window ${dayStr(wo.after)} to ${dayStr(wo.upTo)})`);
        // M − N over windows a new job has started by (before since, a count of 0 is the job not having started).
        const sm = q.since ? moveBack(dayNum(q.since), CAL.real) : null;
        if (sm == null || sm <= wo.after || sm > wo.upTo) { const dmn = cnt.length - q.n; st.mn[q.every][dmn] = (st.mn[q.every][dmn] || 0) + 1; } else st.beforeSince++;
      }
      const how = has(d.pay, p.id) ? (d.payEstimated && d.payEstimated[p.id] ? 'ticked' : 'typed') : 'untyped', w = planOracle2(q, d, cnt ? cnt.length : null, monthlyEst(c, i, k)), what = `${nm} (${q.every ? 'every ' + q.every + (q.on ? ', dated' : ', no date') : 'monthly'}, ${how})`;
      ['arrived', 'setAside', 'used'].forEach(f => { if (!near(g[f], w[f])) add(k, `planPay gives ${what} ${f} ${g[f]} but L1/L2 say ${w[f]}`); });
      if (!!g.typed !== w.typed) add(k, `planPay gives ${what} typed ${g.typed}, expected ${w.typed}`);
      if (q.every && how === 'untyped') {
        if (w.layer === 2) { if (g.m !== w.m) add(k, `planPay gives ${what} m ${g.m}, expected ${w.m}${has(d.paydays, p.id) ? ' (stored)' : ' (counted)'}`);
          if (!near(g.expected, w.expected) || !near(g.extraDefault, w.extraDefault)) add(k, `planPay gives ${what} expected ${g.expected} and extraDefault ${g.extraDefault}, L2 says ${w.expected} and ${w.extraDefault}`);
          // The dates: today's count, but none for a frozen month whose count today differs (L15: they'd contradict it).
          const wantDates = has(d.paydays, p.id) && d.paydays[p.id] !== cnt.length ? null : cnt;
          if (stable(g.dates == null ? null : g.dates) !== stable(wantDates)) add(k, `planPay gives ${what} dates ${JSON.stringify(g.dates)}, expected ${JSON.stringify(wantDates)}${wantDates ? '' : ' (today\'s count differs from the frozen one, L15)'}`); }
        const t = typ[p.id] || {}, tw2 = planOracle2(q, d, null, null, true); if (!near(t.used, tw2.used)) add(k, `planPay with {typical: true} gives ${what} ${t.used}, L9 says each × N = ${tw2.used}`); }
      else if (q.every && has(d.paydays, p.id) && g.m !== d.paydays[p.id]) add(k, `planPay gives ${what} m ${g.m}, the frozen count is ${d.paydays[p.id]}`);
      if (!near(pf[p.id], g.used)) add(k, `payFor gives ${nm} ${pf[p.id]}, not planPay's used ${g.used}`);
      now.push(w.used); });
    // E6 with layer 2: the month given as live (the Pay tab's working copy, its counts included) reads the same.
    if (d.pay) { const rest = cl(months), live = { pay: {}, extra: cl(d.extra || {}), paydays: cl(d.paydays || {}), payEstimated: cl(d.payEstimated || {}) };
      ['pay', 'extra', 'paydays', 'payEstimated'].forEach(f => { delete rest[k][f]; }); c.people.forEach(p => { live.pay[p.id] = has(d.pay, p.id) ? d.pay[p.id] : null; });
      const a = stable(pl), b = stable(P.planPay(c, rest, k, live) || {}); if (a !== b) add(k, `planPay with the month given as live differs: ${b} against ${a} (E6)`); }
    // L12: Month by month lists a dated person's untyped month (an empty box) when its count isn't the usual one.
    { const ex = (P.monthExtras(c, months, k) || {}), got = ex.paydays, want = [];
      c.people.forEach((p, i) => { const q = datedPerson(p), cnt = counted(c, i, k); if (!cnt || has(d.pay, p.id)) return; const M = has(d.paydays, p.id) ? d.paydays[p.id] : cnt.length; if (M !== q.n) want.push({ person: p.id, m: M, n: q.n }); });
      const g = (got || []).filter(x => !(d.payEstimated && d.payEstimated[x.person])).map(x => ({ person: x.person, m: x.m, n: x.n }));
      if (stable(g) !== stable(want)) add(k, `monthExtras' paydays are ${JSON.stringify(got)}, L12 says ${JSON.stringify(want)}`);
      if (got !== undefined && !(got || []).length) add(k, 'monthExtras has an empty paydays list (L12: only when it isn\'t empty)'); }
    // The transfers against the household oracle, with "Use it this month"'s one-off counted as the person's pay.
    const ex = extraIn(k), payNow = now.map((v, i) => r2(v + (ex[pid(i)] || 0))), r = P.calcMonth(c, months, k), ones = (spec[m] || []).map(sep);
    invariants(P, P.cfgFor(c, k, d.oneOffs), r).forEach(x => add(k, 'invariant: ' + x));
    compare(P, h, c, r, m, payNow, { ones }).bad.forEach(x => add(k, 'oracle: ' + x));
    topUps(P, h, c, r, m, payNow, { ones }).forEach(x => add(k, 'top-ups: ' + x));
    // L1 across versions: 2.16's planPay reads typed and ticked months the same.
    if (typedOrTicked(k)) { const v = V216.planPay(c, months, k); st.v216++;
      c.people.forEach(p => { if (!has(d.pay, p.id)) return; ['arrived', 'setAside', 'used'].forEach(f => { if (!near(v[p.id][f], (pl[p.id] || {})[f])) add(k, `2.16's planPay gives ${p.name} ${f} ${v[p.id][f]} but 2.17's ${(pl[p.id] || {})[f]} (L1)`); }); }); }
    // Layer-1 entries are exactly 2.16's, field for field (the head of engineering's ruling): anyone paid monthly, a box
    // with a figure and no frozen count, and an empty box for someone with no date. Only layer-2 entries carry layer: 2.
    { const v = V216.planPay(c, months, k); c.people.forEach(p => { const q = datedPerson(p), l1 = !q.every || (has(d.pay, p.id) ? !has(d.paydays, p.id) : !q.on);
      if (l1 && stable(pl[p.id]) !== stable(v[p.id])) add(k, `planPay's layer-1 entry for ${p.name} is ${stable(pl[p.id])}, 2.16's ${stable(v[p.id])}`);
      if (!l1 && (pl[p.id] || {}).layer !== 2) add(k, `planPay's entry for ${p.name} has layer ${(pl[p.id] || {}).layer}, expected 2 (a frozen count, or a date and an empty box)`); }); }
    // predictedFloat: the month's pay as if untyped (the counted figure), through calcMonth.
    const pr = P.predictedFloat(c, months, k); if (pr != null) { const pay = {}; c.people.forEach((p, i) => { pay[p.id] = planOracle2(datedPerson(p), Object.assign({}, d, { pay: {}, payEstimated: {} }), (counted(c, i, k) || []).length, monthlyEst(c, i, k)).used; });
      const want = P.calcMonth(c, months, k, pay).flt; if (!near(pr, want)) add(k, `predictedFloat is ${pr} but the counted plan gives ${want} (L9)`); }
  });
  // ---- L11: Analysis's typical pay for a person with a date, in the last month and the middle one: the last 6 months up to
  // k with pay typed, a stored count of 1 or more, the same interval as month k and no correction (no extra with edited and
  // £0, no extra in a month counted at N or fewer); the mean of typed pay ÷ count, × paydays a year ÷ 12, rounded at the
  // end. With none, pay over a year ÷ 12.
  [keys[11], keys[MONTHS - 1]].forEach(k => { const got = (P.avgIncome(c, months, k) || {}).pay || {};
    c.people.forEach(p => { const q = datedPerson(p); if (!q.every || !q.on) return;
      const ks = Object.keys(months).filter(x => { const d = months[x], e = d.extra && d.extra[p.id];
        return x <= k && has(d.pay, p.id) && !(d.payEstimated && d.payEstimated[p.id]) && has(d.paydays, p.id) && d.paydays[p.id] >= 1 && !(e && ((e.edited && e.amount === 0) || d.paydays[p.id] <= q.n)); }).sort().slice(-6);
      const want = ks.length ? r2(ks.reduce((s, x) => s + months[x].pay[p.id] / months[x].paydays[p.id], 0) / ks.length * PAY_YEAR[q.every] / 12) : monthlyOf({ every: q.every, each: q.each });
      if (!(Math.abs((got[p.id] ?? NaN) - want) <= 0.006)) add(k, `avgIncome gives ${p.name} ${got[p.id]}, L11 says ${want} (${ks.length} months measured)`); }); });
  // ---- After every date is removed: every month as 2.16 reads it (L1), standing orders and averageShort unchanged (L9),
  // the backup's version and needs (L14), and the data round trips (L13).
  const noDates = cl(c); noDates.people.forEach(p => { if (p.pattern) { delete p.pattern.on; delete p.pattern.since; } });
  keys.forEach(k => { const a = P.planPay(noDates, months, k), b = V216.planPay(noDates, months, k);
    noDates.people.forEach(p => ['arrived', 'setAside', 'used'].forEach(f => { if (!near(a[p.id][f], b[p.id][f])) add(k, `with every date removed, planPay gives ${p.name} ${f} ${a[p.id][f]} but 2.16's ${b[p.id][f]} (L1)`); })); });
  { const k = keys[seed % 12], so = P.standingOrders(c, months, k), so0 = P.standingOrders(noDates, months, k);
    if (stable(so) !== stable(so0)) add(k, `standing orders differ with the dates (${stable(so)}) and without (${stable(so0)}); L9 plans them on a typical month`);
    const pay = P.payFor(noDates, months, k), as = P.averageShort(c, k, pay), as0 = P.averageShort(noDates, k, pay);
    if (stable(as) !== stable(as0)) add(k, `averageShort differs with the dates (${stable(as)}) and without (${stable(as0)}) (L9)`); }
  { const v = P.backupVersionFor(c, months), nd = P.backupNeedsFor(c, months), used = Object.keys(months).some(k => (months[k].oneOffs || []).some(o => o.extraFrom));
    if (v !== 6 || nd !== '2.17') add('-', `the backup is version ${v} needing ${nd}, expected 6 needing 2.17 (L14: someone has a date)`);
    const nd0 = P.backupNeedsFor(noDates, months), want0 = used ? '2.17' : '2.16';
    if (nd0 !== want0) add('-', `with every date removed the backup needs ${nd0}, expected ${want0}${used ? ' (a one-off marks an extra payday used later)' : ''} (L14)`);
    const rep = [], nc = P.normCfg(cl(c), rep); if (stable(nc) !== stable(c) || rep.length) add('-', `normCfg changes the settings or reports ${JSON.stringify(rep)} (L13)`);
    const rep2 = [], nm = P.normMonths(cl(months), rep2); if (stable(nm) !== stable(months) || rep2.length) add('-', `normMonths changes the months or reports ${JSON.stringify(rep2)} (L13)`); }
  edits(P, P2, h, c, months, keys, add, st, R, counted, monthlyEst, pid);
}
/** Whether a date is a weekend or a bank holiday (a since on one is compared on the working day before it, L20). */
function moveCheck(s) { const z = dayNum(s), w = ((z + 4) % 7 + 7) % 7; return w === 0 || w === 6 || CAL.real.has(z); }

/** The invariant (L18): each edit to the settings alone, then every typed or ticked month compared with before. */
function edits(P, P2, h, c, months, keys, add, st, R, counted, monthlyEst, pid) {
  const chance = p => R() < p, pick = a => a[Math.floor(R() * a.length)];
  // A typed or ticked month, person by person: planPay is compared for each person with a figure in the box (and anyone paid
  // monthly, whose estimate comes from earlier typed months); the transfers when everyone on a pattern has one.
  const filled = keys.filter(k => months[k] && months[k].pay && Object.keys(months[k].pay).length);
  const boxed = k => c.people.filter(p => !p.pattern || has(months[k].pay, p.id)).map(p => p.id), whole = k => c.people.every(p => !p.pattern || has(months[k].pay, p.id));
  const snapOf = (PP, cc, k, ms = months) => { const pl = PP.planPay(cc, ms, k) || {}, r = PP.calcMonth(cc, ms, k);
    return { stored: JSON.stringify(ms[k]), plan: Object.fromEntries(cc.people.map(p => [p.id, ['arrived', 'setAside', 'used'].map(f => (pl[p.id] || {})[f])])), r }; };
  const base = {}; filled.forEach(k => { base[k] = snapOf(P, c, k); });
  const dated = c.people.map((p, i) => i).filter(i => c.people[i].pattern && c.people[i].pattern.on), undated = c.people.map((p, i) => i).filter(i => c.people[i].pattern && !c.people[i].pattern.on);
  const patterned = c.people.map((p, i) => i).filter(i => c.people[i].pattern);
  const randomOn = (i, k) => { const t = c.people[i].pattern; let z = dayNum(k + '-01') - 20 + Math.floor(R() * 7); return dayStr(z + 7 * Math.floor(R() * (t.every / 7))); };
  /** One edit: c2 the edited settings, PP the page code, cal the calendar the counter uses. opts.after: a dated edit from
      that month index (months before it compared in full; from it on, with storedAfter, only the stored figures, otherwise
      not at all: they're the months the user asked to change). opts.months: the saved months after the edit (L5's
      refreeze), when it changes them. */
  function check(name, c2, opts = {}) {
    const PP = opts.PP || P, cal = opts.cal || CAL.real, ms = opts.months || months, e = st.edits[name] ||= { households: 0, typed: 0, whole: 0, changed: 0, untyped: 0, untypedChanged: 0 }; e.households++;
    const before = JSON.stringify(ms);
    filled.forEach(k => { const j = keys.indexOf(k); if (opts.after != null && j >= opts.after && !opts.storedAfter) return;
      const a = base[k], b = snapOf(PP, c2, k, ms), probs = [];
      if (b.stored !== a.stored) probs.push(`the stored month changed: ${b.stored} (was ${a.stored})`);
      boxed(k).forEach(id => { if (stable(a.plan[id]) !== stable(b.plan[id])) probs.push(`planPay's arrived, setAside, used for ${id} were ${a.plan[id]}, now ${b.plan[id]}`); });
      if (!(opts.after != null && j >= opts.after) && whole(k)) { sameResult(a.r, b.r).forEach(x => probs.push(x)); e.whole++; }
      e.typed++; if (probs.length) { e.changed++; add(k, `after ${name}: ${probs[0]}`); } });
    if (JSON.stringify(ms) !== before) add('-', `after ${name}: planPay or calcMonth changed the saved months it was given`);
    // Untyped months: the counter under the edited settings (not for dated edits, whose people are as they were each month).
    if (!opts.dated) keys.forEach(k => { if (filled.includes(k)) return; const pl = PP.planPay(c2, months, k) || {}, pl0 = P.planPay(c, months, k) || {};
      c2.people.forEach((p, i) => { const q = datedPerson(p); if (!q.every) return; const cnt = counted(c2, i, k, cal), d = months[k] || {}, w = planOracle2(q, d, cnt ? cnt.length : null, null);
        e.untyped++; if (!near((pl[p.id] || {}).used, (pl0[p.id] || {}).used)) e.untypedChanged++;
        if (!near((pl[p.id] || {}).used, w.used)) add(k, `after ${name}: planPay gives ${p.name}'s untyped month ${(pl[p.id] || {}).used} but the counter gives ${w.used}${cnt ? ` (${cnt.length} paydays)` : ''}`);
        if (cnt) { const tw = PP.transferWindow(c2, k), got = PP.paydaysIn(p.pattern, tw && tw.after, tw && tw.upTo); if (stable(got) !== stable(cnt)) add(k, `after ${name}: paydaysIn gives ${p.name} ${JSON.stringify(got)} but the counter ${JSON.stringify(cnt)}`); } }); });
  }
  const edit = f => { const c2 = cl(c); f(c2); return c2; };
  // The transfer day moved: any day, the last working day, the weekend box on and off.
  { const pd = chance(0.2) ? { day: 'last', weekend: true } : { day: 1 + Math.floor(R() * 31), weekend: chance(0.6) };
    check('the transfer day moved', edit(x => { x.payday = pd; })); }
  if (c.payday && c.payday.day && c.payday.day !== 'last') check('the weekend box switched', edit(x => { x.payday = Object.assign({}, x.payday, { weekend: x.payday.weekend === false }); }));
  if (undated.length) { const i = pick(undated); check('a date added', edit(x => { x.people[i].pattern.on = randomOn(i, keys[0]); })); }
  if (dated.length) {
    const i = pick(dated), t = c.people[i].pattern, j = (chance(0.5) ? 1 : -1) * (1 + Math.floor(R() * 3)), off = (chance(0.5) ? 1 : -1) * (1 + Math.floor(R() * (t.every - 1)));
    check('the date corrected by whole intervals', edit(x => { x.people[i].pattern.on = dayStr(dayNum(t.on) + j * t.every); }));
    check('the date corrected otherwise', edit(x => { x.people[i].pattern.on = dayStr(dayNum(t.on) + off); }));
    check('the date removed', edit(x => { delete x.people[i].pattern.on; delete x.people[i].pattern.since; }));
    if (!t.since) check('since added', edit(x => { x.people[i].pattern.since = dayStr(dayNum(t.on) + t.every * Math.floor(R() * 30 - 10) - (chance(0.25) ? 1 + Math.floor(R() * 3) : 0)); }));
    else { check('since moved', edit(x => { x.people[i].pattern.since = dayStr(dayNum(t.since) + Math.floor(R() * 120) - 60); })); check('since removed', edit(x => { delete x.people[i].pattern.since; })); }
  }
  check('the holiday rule switched off', c, { PP: P2.none, cal: CAL.none });
  check('a made-up holiday added', c, { PP: P2.madeup, cal: CAL.madeup });
  // Dated edits (E8: from the month the app opens on, here a month in the second half): months before it compared in full.
  if (patterned.length) {
    const i = pick(patterned), id = pid(i), from = 8 + Math.floor(R() * 15), cur = keys[from], t = c.people[i].pattern, year = PAY_YEAR[t.every];
    const datedEach = x => { const p = x.people[i], snap = P.personSnap(p); p.pattern = Object.assign({}, p.pattern, { each: r2(t.each * (0.8 + R() * 0.4)) }); p.usualPay = r2(p.pattern.each * year / 12); P.datePersonEdit(p, snap, cur); };
    check('a dated each edit', edit(datedEach), { after: from, storedAfter: true, dated: true });
    const newEvery = pick([7, 14, 28].filter(e => e !== t.every));
    // L4/L7: a change of interval starts without a date unless the change sheet's first pay is given: here a working day in
    // the window of the month it's made from, so the pay month it's for (patternStartMonth) is that month.
    const changeEvery = (x, at, k) => { const p = x.people[i], snap = P.personSnap(p), each = r2(p.usualPay * 12 / PAY_YEAR[newEvery]);
      p.pattern = { every: newEvery, each }; p.usualPay = r2(each * PAY_YEAR[newEvery] / 12);
      if (at) { const w = windowOracle(x.payday, k, CAL.real); let z = w.after + 1 + Math.floor(R() * Math.max(1, w.upTo - w.after)); z = moveBack(z, CAL.real); if (z <= w.after) z = w.upTo;
        p.pattern.on = dayStr(z); p.pattern.since = dayStr(z);
        const sm = P.patternStartMonth(x, id, dayStr(z)); if (sm !== k) add(k, `patternStartMonth for a first pay on ${dayStr(z)} is ${sm}, but its window is ${k}'s (L7)`); }
      P.datePersonEdit(p, snap, k); };
    // L5: the months whose interval changes are frozen again (intervalChangedMonths, refreezeInterval); only they may
    // change. A dated change from cur changes cur on; an each edit from a and a change from b with "Change earlier months
    // too" (undateLast) changes a on, and the months before a must not change.
    const l5 = (name, c2, fromIx) => {
      const want = Object.keys(months).filter(k => k >= keys[fromIx]).sort();
      let ks; try { ks = (P.intervalChangedMonths(c, c2, months, id) || []).slice().sort(); } catch (e) { ks = []; add(cur, `${name}: intervalChangedMonths threw ${e.message}`); }
      if (stable(ks) !== stable(want)) add(keys[fromIx], `${name}: intervalChangedMonths gives ${JSON.stringify(ks)}, but the interval changed in ${JSON.stringify(want)} (L5)`);
      let m2; try { m2 = P.refreezeInterval(c2, months, id, want, c) || months; } catch (e) { m2 = months; add(cur, `${name}: refreezeInterval threw ${e.message}`); }
      const exp = refreezeOracle(c2, months, id, want, (k, i2) => (counted(c2, i2, k) || []).length, () => PAY_N[t.every]);
      st.edits[name] ||= { households: 0, typed: 0, whole: 0, changed: 0, untyped: 0, untypedChanged: 0 }; st.edits[name].refrozen = (st.edits[name].refrozen || 0) + want.length;
      Object.keys(Object.assign({}, months, m2)).forEach(k => { if (stable(m2[k]) !== stable(exp[k])) add(k, `${name}: refreezeInterval stores ${stable(m2[k])}, L5 says ${stable(exp[k])} (before: ${stable(months[k])})`); });
      want.forEach(k => { const pl = (P.planPay(c2, exp, k) || {})[id] || {}, wo = planOracle2(datedPerson(c2.people[i]), exp[k] || {}, (counted(c2, i, k) || []).length, null);
        if (has((exp[k] || {}).pay, id)) ['arrived', 'setAside', 'used'].forEach(f => { if (!near(pl[f], wo[f])) add(k, `${name}: after the refreeze planPay gives ${f} ${pl[f]}, L5 says ${wo[f]}`); }); });
      check(name, c2, { after: fromIx, dated: true, months: exp });
    };
    l5('a dated change of pattern', edit(x => changeEvery(x, chance(0.5), cur)), from);
    const a = 4 + Math.floor(R() * 8), b = a + 2 + Math.floor(R() * (MONTHS - a - 2));
    const c2 = edit(x => { const p = x.people[i], snap = P.personSnap(p); p.pattern = Object.assign({}, p.pattern, { each: r2(t.each * 1.1) }); p.usualPay = r2(p.pattern.each * year / 12); P.datePersonEdit(p, snap, keys[a]);
      changeEvery(x, chance(0.5), keys[b]); P.undateLast(x.people[i]); });
    const w = c2.people[i].was || []; if (w.length !== 1 || w[0].until !== keys[a - 1]) add(keys[b], `L5 setup: after undateLast ${c2.people[i].name}'s earlier pay is ${JSON.stringify(w)}, expected one entry up to ${keys[a - 1]}`);
    l5('a change of interval with "Change earlier months too"', c2, a);
  }
}
/** How often L22's cases came up in the refreezes: a counted line the count opened (kept as the count's), and a line kept
    as the household's own (marked edited). */
const L22_SEEN = { countsLines: 0, own: 0 };
/** Whether month k's extra for person id is used by a one-off anywhere (L6's lock). */
const lockedIn = (ms, k, id) => Object.keys(ms).some(x => ((ms[x] && ms[x].oneOffs) || []).some(o => o && o.extraFrom === k && o.extraOf === id));
/** L5's refreeze, worked out here, with L22 (b): in each of keys, person id's count is cleared, and so is their extra, but
    only one the freeze opened (the month's old count above the old N, oldN(k), from the settings before the change) that
    is neither edited, counted nor locked; then the month is frozen again (freezeOracle, for that person only, which marks
    an extra still there edited, L22 a) when they have a date, a figure in the box and had a count before (a month with
    no count stays layer 1, L22). A month with no count for them
    (a household with no date) has nothing cleared. count(k, i): M counted now. A new months object. */
export function refreezeOracle(cc, ms, id, ks, count, oldN) {
  const out = cl(ms), i = cc.people.findIndex(p => p.id === id), q = datedPerson(cc.people[i]);
  ks.forEach(k => { if (!ms[k]) return; const body = cl(ms[k]), x = body.extra && body.extra[id], locked = lockedIn(ms, k, id), was = body.paydays ? body.paydays[id] : undefined;
    if (body.paydays) { delete body.paydays[id]; if (!Object.keys(body.paydays).length) delete body.paydays; }
    if (x && was != null && was > oldN(k) && !x.edited && !x.counted && !locked) { delete body.extra[id]; if (!Object.keys(body.extra).length) delete body.extra; }
    if (!has(body.pay, id) || was == null) { out[k] = body; return; } // L22: a month with no count is never frozen again
    // L22: a counted line the count opened stays the count's (kept, counted, not marked edited, still following typed pay).
    const countsLine = !!(x && body.extra && body.extra[id] && x.counted && !x.edited && was > oldN(k)); if (countsLine) L22_SEEN.countsLines++; else if (body.extra && body.extra[id]) L22_SEEN.own++;
    const old = cl(body); delete old.pay[id]; out[k] = freezeOracle([q], body, old, () => count(k, i), () => locked, () => !countsLine); });
  return out;
}

/** L5's refreeze through the app: the months whose interval changed (intervalChangedMonths, from settings `before` to
    `after`) frozen again (refreezeInterval; `before` is passed last, for L22's old count against the old N). */
export function appRefreeze(P, before, after, months, id) {
  const ks = (P.intervalChangedMonths(before, after, months, id) || []).slice().sort();
  return { ks, months: P.refreezeInterval(after, months, id, ks, before) || months };
}

/** L22 (b), households with no payday date: saved months with extra paydays opened through "Had an extra payday?" (gen.mjs
    payMonthsFor's, and more at random amounts), then someone's interval changed three ways (undated; dated from a later
    month, E8; an each edit, a change of interval later and "Change earlier months too"), each through intervalChangedMonths
    and refreezeInterval: every saved month must stay byte for byte, and saving any month through freezePaydays must
    change nothing (no date, no freeze, L1). {fails, st}. */
export function runUndated(P, n, first = 1) {
  const fails = {}, st = { households: 0, extras: 0, changes: 0, months: 0 };
  const add = (seed, what, msg) => { (fails[what + ': ' + msg.replace(NAME_RE, 'Someone').replace(/\{.*\}|\[.*\]/g, '…').replace(/[-\d.,£]+/g, '#')] ||= []).push(seed + ': ' + msg); };
  for (let seed = first; seed < first + n; seed++) {
    const h = makeHousehold(seed, { patterns: 0.6 }); if (!h.people.some(p => p.every)) continue;
    const R = rng(seed * 4241 + 17), c = buildCfg(h), pm = payMonthsFor(h, seed);
    // More lines from the link, at random amounts, on typed months on a pattern.
    for (let m = 1; m <= 12; m++) pm[m].forEach((d, i) => { if (h.people[i].every && d.pay != null && !d.est && !d.extra && R() < 0.3) d.extra = Object.assign({ amount: r2(h.people[i].each * (0.3 + R())) }, R() < 0.3 ? { counted: true } : {}); });
    const months = monthsObj(c, pm), before = stable(months); st.households++;
    Object.values(months).forEach(d => { Object.keys(d.extra || {}).forEach(() => { st.extras++; }); });
    Object.keys(months).forEach(k => { st.months++; let got; try { const b = cl(months[k]), r = P.freezePaydays(c, months, k, b, {}); got = r && typeof r === 'object' ? r : b; } catch (e) { got = { threw: e.message }; }
      if (stable(got) !== stable(months[k])) add(seed, 'a save with no date', `freezePaydays changes ${k}: ${stable(got)} (was ${stable(months[k])})`); });
    const ps = h.people.map((p, j) => j).filter(j => h.people[j].every), i = ps[Math.floor(R() * ps.length)], id = c.people[i].id, t = c.people[i].pattern;
    const newEvery = [7, 14, 28].filter(e => e !== t.every)[Math.floor(R() * 2)], setTo = (p, every, each) => { p.pattern = { every, each }; p.usualPay = r2(each * PAY_YEAR[every] / 12); };
    const changes = {
      'undated (no history)': x => setTo(x.people[i], newEvery, r2(t.each * PAY_YEAR[t.every] / PAY_YEAR[newEvery])),
      'dated from 2027-07': x => { const p = x.people[i], s = P.personSnap(p); setTo(p, newEvery, r2(t.each * PAY_YEAR[t.every] / PAY_YEAR[newEvery])); P.datePersonEdit(p, s, '2027-07'); },
      'each from 2027-04, then the interval from 2027-09 with "Change earlier months too"': x => { const p = x.people[i]; let s = P.personSnap(p); setTo(p, t.every, r2(t.each * 1.1)); P.datePersonEdit(p, s, '2027-04');
        s = P.personSnap(p); setTo(p, newEvery, r2(t.each * PAY_YEAR[t.every] / PAY_YEAR[newEvery])); P.datePersonEdit(p, s, '2027-09'); P.undateLast(p); },
    };
    Object.entries(changes).forEach(([what, f]) => { const c2 = cl(c); f(c2); st.changes++;
      let r; try { r = appRefreeze(P, c, c2, months, id); } catch (e) { add(seed, what, 'threw ' + e.message); return; }
      if (stable(r.months) !== before) { const k = Object.keys(months).find(x => stable(r.months[x]) !== stable(months[x])); add(seed, what, `the months changed (L22 b: a household with no date is never touched): ${k} is ${stable(r.months[k])}, was ${stable(months[k])}`); }
      Object.keys(months).forEach(k => { const a = P.planPay(c, months, k), b = P.planPay(c2, r.months, k);
        c.people.forEach(p => { if (!has(months[k].pay, p.id) || (months[k].payEstimated && months[k].payEstimated[p.id])) return;
          if (stable(['arrived', 'setAside', 'used'].map(f => a[p.id][f])) !== stable(['arrived', 'setAside', 'used'].map(f => b[p.id][f]))) add(seed, what, `${p.name}'s typed ${k} plans on ${stable(b[p.id])}, was ${stable(a[p.id])} (L1)`); }); }); });
  }
  return { fails, st };
}
export function undatedReport(res, secs) {
  const fk = Object.keys(res.fails), s = res.st;
  console.log(`Households with no payday date (L22 b): ${s.households} households, ${s.months} saved months (${s.extras} extra paydays typed through the link), ${s.changes} changes of interval (undated, dated, "Change earlier months too"), ${fk.length ? fk.length + ' kinds of problem' : 'every month byte for byte as before'} (${secs} s)`);
  fk.forEach(k => console.log(`- [${res.fails[k].length}] ${k}\n    e.g. seed ${res.fails[k][0].slice(0, 500)}`));
  if (fk.length) process.exitCode = 1;
}

/** The report, and the failure when 2.17's core isn't there. */
export function paydayReport(res, secs) {
  const { fails, st } = res, fk = Object.keys(fails), kv = o => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`Counting paydays: ${st.households} dated households (${st.skipped} drawn without anyone dated were skipped), ${st.months} months, ${fk.length ? fk.length + ' kinds of problem' : 'no problems'} (${secs} s)`);
  console.log(`  people on a pattern: every 7 days ${st.people[7]}, 14 days ${st.people[14]}, 28 days ${st.people[28]}; ${st.dated} with a date (${st.since} with since, ${st.later} dated only from a later month); ${st.noDay} households with no transfer day (the 25th), ${st.outside} starting 2029–2040 (the rule, not gov.uk's list), ${st.easter} paid on Mondays with the transfer day the 25th (Easter 2027)`);
  console.log(`  boxes: ${kv(st.kinds)}; ${st.saves} saves through freezePaydays, ${st.frozen} counts frozen; the line and boxes: ${kv(st.actions) || 'none'}`);
  console.log('  M − N seen (paydays counted less the usual, by person-month): ' + [7, 14, 28].map(e => `every ${e} days ${Object.keys(st.mn[e]).map(Number).sort((a, b) => a - b).map(x => `${x >= 0 ? '+' : ''}${x}: ${st.mn[e][x]}`).join(', ') || 'none'}`).join('; ') + `; and ${st.beforeSince} windows holding a new job's first pay (since, L21) left out`);
  console.log(`  a since on a weekend or bank holiday (compared on the working day before it, L20): ${st.sinceHoliday} people; 2.16's planPay compared on ${st.v216} typed or ticked months`);
  console.log(`  L22 in the refreezes: ${L22_SEEN.own} extras kept as the household's own, ${L22_SEEN.countsLines} counted lines the count opened kept as the count's`);
  console.log('  edits (typed or ticked months compared, changed; untyped person-months checked against the counter, their estimate moved):');
  Object.entries(st.edits).forEach(([k, e]) => console.log(`    ${k}: ${e.households} households, ${e.typed} months (${e.whole} with everyone's box filled: transfers compared too), ${e.changed} changed; untyped ${e.untyped}, moved ${e.untypedChanged}${e.refrozen ? `; ${e.refrozen} named months frozen again` : ''}`));
  fk.sort((a, b) => fails[b].length - fails[a].length).forEach(k => console.log(`- [${new Set(fails[k].map(x => x.split('@')[0])).size} households] ${k}\n    e.g. seed ${fails[k][0]}`));
  if (fk.length) process.exitCode = 1;
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const N = Number(process.argv[2] || 60), S = Number(process.argv[3] || 1), t0 = Date.now();
  // The counter on its own: H1's rule against gov.uk's list (the oracle's own check), and the transfer day against 2.16.1's paydayFor.
  const own = []; for (let y = 2024; y <= 2028; y++) if (holidaysByRule(y).join() !== GOVUK[y].join()) own.push(`the counter's holiday rule for ${y} differs from gov.uk's list`);
  if (P0.paydayFor) for (const pc of [{ day: 'last' }, { day: 1, weekend: true }, { day: 25, weekend: true }, { day: 31, weekend: false }, { day: 15 }])
    for (let j = 0; j < 12 * 15; j++) { const k = shiftK('2024-01', j), g = P0.paydayFor(pc, k), w = dayStr(transferDayOracle(pc, k, CAL.real)); if (g !== w) { own.push(`paydayFor(${JSON.stringify(pc)}, ${k}) is ${g}, the counter's transfer day ${w}`); break; } }
  console.log(`The payday counter: ${own.length ? own.length + ' problems' : 'its holiday rule matches gov.uk 2024–2028, and its transfer day matches paydayFor 2024–2038'}`); own.forEach(x => console.log('- ' + x)); if (own.length) process.exitCode = 1;
  if (paydayApiMissing(P0).length) { console.log(paydayApiNote(P0)); process.exitCode = 1; }
  else {
    const pb = paydayBasics(P0); console.log(`Layer 2's data and backup rules: ${pb.length ? pb.length + ' problems' : 'no problems'}`); pb.forEach(x => console.log('- ' + x)); if (pb.length) process.exitCode = 1;
    paydayReport(runPaydays(P0, N, S), ((Date.now() - t0) / 1000).toFixed(1));
    const t1 = Date.now(); undatedReport(runUndated(P0, N * 5, S), ((Date.now() - t1) / 1000).toFixed(1));
  }
}
