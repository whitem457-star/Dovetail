// Shared harness for the Dovetail page tests (Playwright + axe-core).
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';

export const PAGE = process.env.APP_URL ? new globalThis.URL(process.env.APP_URL).pathname
  : new globalThis.URL('../app/build/generated/payday-assets/index.html', import.meta.url).pathname;
export const AXE = fs.readFileSync(new globalThis.URL('./node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
// A real 1.4 backup of our household (made by the 1.4 page). Test data only: it is never part of the app, and only the
// golden and update tests use it. It isn't in the public copy, so it's null there and those tests skip.
const readJson = name => { const u = new globalThis.URL('./fixtures/' + name, import.meta.url); return fs.existsSync(u) ? JSON.parse(fs.readFileSync(u, 'utf8')) : null; };
export const FIXTURE = readJson('household-1.4-backup.json');
// A made-up 1.x household with the same shape (Alex and Sam, four 1.x accounts, 31 bills, a saved month with ticks,
// old Wealth data with mortgage deal ends). Every other suite uses this one.
export const SAMPLE = readJson('sample-1.x-backup.json');
export const K = { cfg: 'payday.config.v1', mon: 'payday.months.v1', w: 'payday.wealth.v1' };

export function suite(title) {
  const results = []; let fails = 0;
  const check = (name, cond, detail) => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail != null && !cond ? '  — ' + String(detail).slice(0, 400) : ''}`); if (!cond) fails++; };
  const skip = name => results.push('SKIP  ' + name);
  const finish = async () => {
    await browser.close(); server.close();
    console.log(`\n== ${title} ==\n` + results.join('\n'));
    const skipped = results.filter(r => r.startsWith('SKIP')).length;
    console.log(`\n${results.length - fails - skipped} passed, ${fails} failed${skipped ? ', ' + skipped + ' skipped' : ''}`);
    if (fails) process.exitCode = 1;
  };
  return { check, skip, finish };
}

// Pages are served from a local web server rather than file://: headless Chromium sometimes drops file:// storage
// across a reload, which made the reload tests flaky. In the app the page loads from file:///android_asset/.
const TYPES = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const f = decodeURIComponent(new globalThis.URL(req.url, 'http://x').pathname);
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(data); });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
export const BASE = 'http://127.0.0.1:' + server.address().port;
export const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

// A fixed "today" (qa.today in localStorage, default 15 Oct 2026) so dates are predictable across reloads.
const CLOCK = () => { const D = Date; const f = new D(localStorage.getItem('qa.today') || '2026-10-15T12:00:00Z').getTime();
  class FD extends D { constructor(...a) { if (a.length) super(...a); else super(f); } static now() { return f; } } window.Date = FD; };
// A stand-in for the Kotlin NativeBridge. State lives in localStorage under qa.native so it survives reloads.
const MOCK = () => {
  const st = JSON.parse(localStorage.getItem('qa.native') || '{"backups":[],"calls":[],"lockOn":false,"lockAvail":true,"n":0}');
  const save = () => localStorage.setItem('qa.native', JSON.stringify(st));
  const strip = j => { const x = JSON.parse(j); delete x.savedAt; return JSON.stringify(x); };
  window.__qaNative = st; window.__qaSave = save;
  window.PaydayNative = {
    saveBackup(json) { st.calls.push(['save', Date.now()]); const last = st.backups[0];
      if (last && strip(last.json) === strip(json)) { save(); return false; }
      st.n++; st.backups.unshift({ name: 'backup-20261015-12' + String(st.n).padStart(4, '0') + '.json', savedAt: '2026-10-15T12:' + String(st.n).padStart(2, '0') + ':00', json }); save(); return true; },
    listBackups() { return JSON.stringify(st.backups.map(b => ({ name: b.name, savedAt: b.savedAt, bytes: b.json.length, kept: !!b.kept }))); },
    readBackup(n) { const b = st.backups.find(b => b.name === n); return b ? b.json : ''; },
    share(json, name) { st.calls.push(['share', name, JSON.parse(json).app]); save(); return true; },
    lockAvailable() { return st.lockAvail; }, lockEnabled() { return st.lockOn; },
    setLockEnabled(on) { st.calls.push(['lock', on]); save(); },
    setTheme(t) { st.calls.push(['theme', t]); save(); },
    haptic(k) { st.calls.push(['haptic', k]); save(); },
    pickBackupFile() { st.calls.push(['pick']); save(); },
    keepBackup(json) { st.calls.push(['keep', JSON.parse(json).config.people.map(x => x.name).join(',')]); if (st.keepFails) { save(); return false; } st.n++; st.backups.unshift({ name: 'backup-20261015-12' + String(st.n).padStart(4, '0') + '-keep.json', savedAt: '2026-10-15T12:' + String(st.n).padStart(2, '0') + ':00', kept: true, json }); save(); return true; },
    notificationsEnabled() { return !!st.notifyOn; }, notificationsAllowed() { return st.notifyAllowed !== false; },
    setNotificationsEnabled(on) { st.calls.push(['notify', on]); save(); },
    setNotificationSchedule(j) { st.schedules = (st.schedules || 0) + 1; st.schedule = JSON.parse(j); st.calls.push(['schedule', st.schedule.entries.length]); save(); return true; },
    shareText(t, title) { st.calls.push(['shareText', title]); st.lastText = t; save(); return true; },
    shareUpdate(json, name, t, title) { st.calls.push(['shareUpdate', name, title]); st.lastUpdate = { json, name, text: t, title }; save(); return !st.updateFails; },
    sendFeedback(subject, body) { st.calls.push(['feedback', subject]); st.lastFeedback = { subject, body }; save(); return true; },
    shareFiles(j) { const f = JSON.parse(j); st.calls.push(['shareFiles', f.map(x => [x.name, x.mime])]); st.lastFiles = f; save(); return true; },
  };
};

/** Open the page. storage: {key: value} written before the page's first real load (like data already on the phone). */
export async function session({ native = false, w = 400, h = 860, dark = false, storage = null, today = null, url = PAGE, reducedMotion = 'reduce', touch = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', reducedMotion, hasTouch: touch });
  // CLOCK must see qa.today, so it runs after seeding.
  // Seed storage from an init script on the first load only, so it's in place before the page's own code runs.
  if (storage || today) await ctx.addInitScript(([s, t]) => { if (sessionStorage.getItem('qa.seeded')) return; sessionStorage.setItem('qa.seeded', '1');
    localStorage.clear(); if (t) localStorage.setItem('qa.today', t);
    for (const k in (s || {})) localStorage.setItem(k, typeof s[k] === 'string' ? s[k] : JSON.stringify(s[k])); }, [storage, today]);
  await ctx.addInitScript(CLOCK); if (native) await ctx.addInitScript(MOCK);
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
  await p.goto(BASE + url);
  await p.waitForTimeout(250); return { ctx, p };
}
/** Storage for "our household as it was in 1.4", optionally with the saved months (golden and update tests only). */
export function v14Storage(withMonths = true) {
  const s = { [K.cfg]: FIXTURE.config, [K.w]: FIXTURE.wealth };
  if (withMonths) s[K.mon] = FIXTURE.months; return s;
}
/** Storage for the made-up 1.x household (Alex and Sam), as it would be on a phone that last ran 1.4. */
export function sampleStorage(withMonths = true) {
  const s = { [K.cfg]: SAMPLE.config, [K.w]: SAMPLE.wealth };
  if (withMonths) s[K.mon] = SAMPLE.months; return s;
}
/** A 2.0 (schema 4) household. */
export function household(o) {
  return Object.assign({ schema: 4, setupDone: true, people: [], accounts: [], bills: [], income: [], budgets: [], savings: [], reminders: [], doneLog: [], payday: {} }, o);
}
export const T = (p, s) => p.$eval(s, e => e.innerText);
export const LS = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k)), k);
export const amts = p => p.$$eval('#steps .amt', e => e.map(x => x.textContent));
export const steps = p => p.$$eval('#steps .step', e => e.map(s => s.querySelector('.route').textContent.replace(/\s+/g, ' ').replace(/\s*→\s*/g, ' → ').trim() + ' ' + s.querySelector('.amt').textContent));
export const float = p => p.$eval('#floatV', e => e.textContent);
export async function typeIn(p, sel, v, wait = 120) { await p.fill(sel, v); await p.waitForTimeout(wait); }
export async function axe(p) {
  await p.addScriptTag({ content: AXE });
  return p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(v => v.id + ':' + v.nodes.length + ' ' + v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' / ')));
}
export const noSideScroll = (p, w) => p.evaluate(w => document.documentElement.scrollWidth <= w && document.getElementById('main').scrollWidth <= w, w);
export async function goMonth(p, label) { for (let g = 0; g < 30 && (await T(p, '#monthLabel')) !== label; g++) {
  const [mn, y] = label.split(' '); const cur = (await T(p, '#monthLabel')).split(' ');
  const MN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const d = (Number(y) * 12 + MN.indexOf(mn)) - (Number(cur[1]) * 12 + MN.indexOf(cur[0]));
  await p.click(d > 0 ? '#next' : '#prev'); await p.waitForTimeout(40); } }
/** A finger swipe from (x1,y1) to (x2,y2) in CSS pixels, as real touch events (needs a session with touch: true). */
export async function swipe(p, x1, y1, x2, y2, steps = 10) {
  const c = await p.context().newCDPSession(p);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
  for (let i = 1; i <= steps; i++) await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + (x2 - x1) * i / steps, y: y1 + (y2 - y1) * i / steps }] });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await c.detach(); await p.waitForTimeout(120);
}
/** The centre of an element in CSS pixels. */
export const centre = async (p, sel) => { const b = await p.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

/* First-run setup, filled in step by step with a two-person household: Alex (£2,100) and Sam (£1,850), Child Benefit
   (£110), paid on the 28th, separate accounts for bills and spending, a mortgage, Council Tax (April to January), car
   insurance (once a year, March) and Alex's mobile phone, a food budget and an emergency fund. In October 2026 that's
   Alex → Joint bills £2,082, Sam → Joint bills £1,850, Joint bills → Joint spending £2,839, £100 to the emergency fund,
   and £2,329 left over in Joint spending. */
export const SETUP_FILL = {
  2: async p => { await p.fill('#su_p_0', 'Alex'); await p.fill('#su_pu_0', '2100'); await p.click('#su_addp'); await p.fill('#su_p_1', 'Sam'); await p.fill('#su_pu_1', '1850');
    await p.click('#su_addi'); await p.fill('#su_in_0', 'Child Benefit'); await p.fill('#su_inv_0', '110'); },
  3: async p => { await p.click('label[for=su_same_yes]'); await p.selectOption('#su_day', '28'); },
  4: async p => { await p.check('#su_shape_split'); },
  5: async p => { const chip = (sec, n) => p.click(`section[aria-labelledby=${sec}] .su-chips button:has-text("${n}")`);
    await chip('su_h_b2', 'Mortgage'); await p.fill('#su_b_2_0_a', '925'); await chip('su_h_b2', 'Council Tax'); await p.fill('#su_b_2_1_a', '168');
    await chip('su_h_b2', 'Car insurance'); await p.selectOption('#su_b_2_2_m', '3'); await p.fill('#su_b_2_2_a', '420');
    await p.click('#su_b_0_open'); await p.fill('#su_b_0_0_n', 'Mobile phone'); await p.fill('#su_b_0_0_a', '18'); },
  6: async p => { await p.click('section[aria-labelledby=su_h_g] .su-chips button:has-text("Food shopping")'); await p.fill('#su_g_0_a', '520');
    await p.click('section[aria-labelledby=su_h_v] .su-chips button:has-text("Emergency fund")'); await p.fill('#su_v_0_a', '100'); },
};
/** The guided tour opens straight after setup finishes: close it (Skip tour) when a test goes on to use the screens. */
export async function skipTour(p) { if (await p.isVisible('#tour')) { await p.click('#tourSkip'); await p.waitForTimeout(80); } }
/** Go from the welcome step to step n (2–7) of setup, filling in each step on the way; fill: also fill in step n. */
export async function walkSetup(p, n, fill = false) {
  await p.click('#su_start');
  for (let s = 2; s < n; s++) { await SETUP_FILL[s](p); await p.click('#su_next'); await p.waitForTimeout(30); }
  if (fill && SETUP_FILL[n]) await SETUP_FILL[n](p);
  await p.waitForTimeout(60);
}
/** 2.7: open the Pay tab's "This month in detail" (Not every month, one-offs, the account cards and the totals), as a
    person would by tapping it, when it isn't open already. */
export async function openDetails(p) { if (!(await p.$eval('#payDetails', d => d.open))) { await p.click('#payDetails summary'); await p.waitForTimeout(80); } }
