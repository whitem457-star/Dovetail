// Bank holidays (2.16.1): an independent check of the payday rule, written from docs/payperiods.md section 13.1 alone
// (H1, H2, H6), never from calc.js. Its own oracle: Easter by Knuth's epact method (TAOCP 1.3.2, exercise 14) checked
// against Gauss's (neither is the anonymous Gregorian computus), England and Wales bank holidays by H1's rule, dates as day
// numbers with their own arithmetic, and a brute-force step back one day at a time. It checks:
//   - gov.uk's England and Wales dates for 2024–2028 (tests/fixtures/govuk-bank-holidays-ew-2024-2028.json), exactly, for
//     the oracle and for P.bankHolidaysEW / P.isBankHolidayEW;
//   - P.easterSunday and P.bankHolidaysEW against the oracle for every year 1950–2150 (and [] outside 1900–2999): rule
//     against rule, not history (the early May holiday began in 1978, the late May one in 1971);
//   - P.isBankHolidayEW, P.isWorkingDay and P.workingDayOnOrBefore against the oracle on every day 1990–2100;
//   - for every payday setting (days 1–31 with the weekend box ticked, unticked or missing, and "last") and every month
//     1990–2100: P.paydayIn and P.paydayFor equal the oracle's dates; a moved date is never a weekend or bank holiday, and
//     is at most 4 days before the intended day (capped at the month's length); an unticked day never moves; the windows
//     (paydayFor(k) to paydayFor(k+1)) tile, with no gaps or overlaps;
//   - for every day of 2026–2028 and every setting: P.nextPayday is on or after today, the first such payday, for the
//     month it pays for; P.defaultMonth follows the 10-day rule (stated here on its own).
// Exits 1 on any problem, or when calc.js doesn't have H1's functions yet (it then checks paydayIn and the rest against the
// weekend-only rule of 2.16, so the harness itself is tested, and says which functions are missing).
// node sim/holidays.mjs
import fs from 'fs';
import { P } from '../unit/load.mjs';

const t0 = Date.now();
const problems = [];
let checks = 0;
const bad = (msg) => { problems.push(msg); };
const eq = (got, want, what) => { checks++; if (got !== want) bad(`${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`); };

// ---------- Dates as day numbers (0 = 1 January 1970), proleptic Gregorian ----------
const fdiv = (a, b) => Math.floor(a / b);
const mod = (a, b) => ((a % b) + b) % b;
/** Day number of y-m-d (m 1–12). */
function dayNo(y, m, d) {
  // Count from 1 March of year 0 so the leap day falls at the end of the counting year.
  const yy = m <= 2 ? y - 1 : y, mm = m <= 2 ? m + 9 : m - 3; // March = 0 … February = 11
  const days = 365 * yy + fdiv(yy, 4) - fdiv(yy, 100) + fdiv(yy, 400) + fdiv(153 * mm + 2, 5) + (d - 1);
  return days - 719468; // 1970-03-01 counted this way is 719528; 1970-01-01 is 59 days earlier
}
/** [y, m, d] for day number n: search the year, then the month (slow but obviously right; results are cached). */
const ymdCache = new Map();
function ymdOf(n) {
  let r = ymdCache.get(n); if (r) return r;
  let y = 1970 + Math.floor(n / 365.2425);
  while (dayNo(y, 1, 1) > n) y--;
  while (dayNo(y + 1, 1, 1) <= n) y++;
  let m = 12; while (dayNo(y, m, 1) > n) m--;
  r = [y, m, n - dayNo(y, m, 1) + 1]; ymdCache.set(n, r); return r;
}
const p2 = (x) => String(x).padStart(2, '0');
const str = (n) => { const [y, m, d] = ymdOf(n); return `${y}-${p2(m)}-${p2(d)}`; };
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return dayNo(y, m, d); };
/** 0 = Sunday … 6 = Saturday (1 January 1970 was a Thursday). */
const weekday = (n) => mod(n + 4, 7);
const monthLen = (y, m) => (m === 12 ? dayNo(y + 1, 1, 1) : dayNo(y, m + 1, 1)) - dayNo(y, m, 1);
const mk = (y, m) => `${y}-${p2(m)}`;
const mkShift = (k, j) => { const [y, m] = k.split('-').map(Number), t = y * 12 + (m - 1) + j; return mk(fdiv(t, 12), mod(t, 12) + 1); };

// ---------- Easter, two ways ----------
/** Knuth, Algorithm E: [month, day]. */
function easterKnuth(Y) {
  const G = mod(Y, 19) + 1, C = fdiv(Y, 100) + 1, X = fdiv(3 * C, 4) - 12, Z = fdiv(8 * C + 5, 25) - 5;
  const D = fdiv(5 * Y, 4) - X - 10;
  let E = mod(11 * G + 20 + Z - X, 30);
  if ((E === 25 && G > 11) || E === 24) E++;
  let N = 44 - E; if (N < 21) N += 30;
  N = N + 7 - mod(D + N, 7);
  return N > 31 ? [4, N - 31] : [3, N];
}
/** Gauss's method with the Gregorian corrections and its two exceptions: [month, day]. */
function easterGauss(y) {
  const a = mod(y, 19), b = mod(y, 4), c = mod(y, 7), k = fdiv(y, 100), p = fdiv(13 + 8 * k, 25), q = fdiv(k, 4);
  const M = mod(15 - p + k - q, 30), N = mod(4 + k - q, 7), d = mod(19 * a + M, 30), e = mod(2 * b + 4 * c + 6 * d + N, 7);
  if (d === 29 && e === 6) return [4, 19];
  if (d === 28 && e === 6 && mod(11 * M + 11, 30) < 19) return [4, 18];
  return 22 + d + e <= 31 ? [3, 22 + d + e] : [4, d + e - 9];
}
const easterNo = (y) => { const [m, d] = easterKnuth(y); return dayNo(y, m, d); };

// ---------- England and Wales bank holidays, H1's rule ----------
const holCache = new Map();
/** The year's bank holidays as a sorted list of day numbers. */
function holidaysOf(y) {
  let r = holCache.get(y); if (r) return r;
  const out = [];
  const ny = dayNo(y, 1, 1), nyw = weekday(ny);
  out.push(nyw === 6 ? ny + 2 : nyw === 0 ? ny + 1 : ny); // Saturday or Sunday: the Monday after
  const e = easterNo(y); out.push(e - 2, e + 1); // Good Friday, Easter Monday
  const may1 = dayNo(y, 5, 1); out.push(may1 + mod(1 - weekday(may1), 7)); // first Monday in May
  const lastMonday = (n) => n - mod(weekday(n) - 1, 7);
  out.push(lastMonday(dayNo(y, 5, 31)), lastMonday(dayNo(y, 8, 31)));
  const xmas = dayNo(y, 12, 25), xw = weekday(xmas);
  if (xw === 6) out.push(xmas + 2, xmas + 3); // Christmas on a Saturday: Monday 27 and Tuesday 28
  else if (xw === 0) out.push(xmas + 1, xmas + 2); // on a Sunday: Boxing Day Monday 26, Christmas Tuesday 27
  else if (xw === 5) out.push(xmas, xmas + 3); // Boxing Day on a Saturday: Monday 28
  else out.push(xmas, xmas + 1);
  r = out.sort((a, b) => a - b); holCache.set(y, r); return r;
}
const isHol = (n) => holidaysOf(ymdOf(n)[0]).includes(n);
const isWork = (n) => { const w = weekday(n); return w !== 0 && w !== 6 && !isHol(n); };
/** Brute force: step back one day at a time while the day isn't a working day. */
const backToWork = (n) => { while (!isWork(n)) n--; return n; };

// ---------- The payday rule, H2 ----------
/** The intended day in month y-m: the day, capped at the month's length ("last": the month's last day). */
const intendedDay = (pc, y, m) => { const len = monthLen(y, m); return dayNo(y, m, pc.day === 'last' ? len : Math.min(pc.day, len)); };
/** "last" always moves; a numbered day moves unless the box is unticked (weekend: false; missing counts as ticked). */
const moves = (pc) => pc.day === 'last' || pc.weekend !== false;
/** Days 15 and later, and "last", pay for the next month. */
const paysNext = (pc) => pc.day === 'last' || pc.day >= 15;

const SETTINGS = [];
for (let day = 1; day <= 31; day++) for (const weekend of [true, false, undefined]) SETTINGS.push(weekend === undefined ? { day } : { day, weekend });
for (const weekend of [true, false, undefined]) SETTINGS.push(weekend === undefined ? { day: 'last' } : { day: 'last', weekend });
const label = (pc) => `{day: ${JSON.stringify(pc.day)}${'weekend' in pc ? ', weekend: ' + pc.weekend : ''}}`;

// ---------- 1. The oracle against gov.uk and known Easters ----------
const FIX = JSON.parse(fs.readFileSync(new URL('../fixtures/govuk-bank-holidays-ew-2024-2028.json', import.meta.url), 'utf8'));
const govuk = {};
FIX.dates.forEach(({ date }) => { (govuk[date.slice(0, 4)] = govuk[date.slice(0, 4)] || []).push(date); });
for (let y = FIX.years[0]; y <= FIX.years[1]; y++) eq(holidaysOf(y).map(str).join(' '), (govuk[y] || []).sort().join(' '), `oracle's ${y} against gov.uk`);
const KNOWN_EASTER = { 1954: '04-18', 1981: '04-19', 1990: '04-15', 2000: '04-23', 2008: '03-23', 2011: '04-24', 2016: '03-27', 2019: '04-21', 2038: '04-25', 2049: '04-18', 2076: '04-19', 2285: '03-22' };
for (const [y, md] of Object.entries(KNOWN_EASTER)) eq(str(easterNo(+y)), `${y}-${md}`, `oracle's Easter ${y}`);
for (let y = 1583; y <= 4099; y++) { const a = easterKnuth(y), b = easterGauss(y); checks++; if (a[0] !== b[0] || a[1] !== b[1]) bad(`oracle's two Easter methods differ for ${y}: ${a} and ${b}`); }
// The date arithmetic: day numbers run on one a day, and every day's string reads back to the same number.
for (let n = dayNo(1899, 1, 1); n <= dayNo(3000, 12, 31); n++) { const [y, m, d] = ymdOf(n); if (dayNo(y, m, d) !== n || d < 1 || d > monthLen(y, m)) { bad(`date arithmetic broken at day ${n}`); break; } }
eq(weekday(dayNo(2026, 10, 22)), 4, 'oracle: 22 October 2026 is a Thursday');

// ---------- 2. H1's functions ----------
const HOLIDAY_API = ['easterSunday', 'bankHolidaysEW', 'isBankHolidayEW', 'isWorkingDay', 'workingDayOnOrBefore'];
const missing = HOLIDAY_API.filter((n) => typeof P[n] !== 'function');
const D1990 = dayNo(1990, 1, 1), D2100 = dayNo(2100, 12, 31);
if (!missing.length) {
  // gov.uk, exactly
  for (let y = FIX.years[0]; y <= FIX.years[1]; y++) {
    eq(JSON.stringify(P.bankHolidaysEW(y)), JSON.stringify((govuk[y] || []).sort()), `bankHolidaysEW(${y}) against gov.uk`);
    for (let n = dayNo(y, 1, 1); n <= dayNo(y, 12, 31); n++) eq(!!P.isBankHolidayEW(str(n)), (govuk[y] || []).includes(str(n)), `isBankHolidayEW("${str(n)}") against gov.uk`);
  }
  // Every year 1950–2150 against the oracle, and nothing outside 1900–2999
  const easterStr = (v, y) => {
    if (typeof v === 'string') return v;
    if (v instanceof Date) return `${v.getFullYear()}-${p2(v.getMonth() + 1)}-${p2(v.getDate())}`;
    if (Array.isArray(v) && v.length === 2) return `${y}-${p2(v[0])}-${p2(v[1])}`;
    if (v && typeof v === 'object' && 'month' in v && 'day' in v) return `${y}-${p2(v.month)}-${p2(v.day)}`;
    return JSON.stringify(v);
  };
  for (let y = 1950; y <= 2150; y++) {
    eq(easterStr(P.easterSunday(y), y), str(easterNo(y)), `easterSunday(${y})`);
    eq(JSON.stringify(P.bankHolidaysEW(y)), JSON.stringify(holidaysOf(y).map(str)), `bankHolidaysEW(${y})`);
  }
  for (const y of [1899, 3000, 2026.5, NaN, -2026]) eq(JSON.stringify(P.bankHolidaysEW(y)), '[]', `bankHolidaysEW(${y}) (not a whole number from 1900 to 2999)`);
  for (const y of [1900, 2999]) { checks++; if (!(P.bankHolidaysEW(y) || []).length) bad(`bankHolidaysEW(${y}) is empty; 1900 to 2999 are in range`); }
  { const a = P.bankHolidaysEW(2026); a.push('x'); a.length = 0; eq(P.bankHolidaysEW(2026).length, 8, 'bankHolidaysEW returns a copy (changing it changes nothing)'); }
  // Every day 1990–2100
  for (let n = D1990; n <= D2100; n++) {
    const s = str(n);
    eq(!!P.isBankHolidayEW(s), isHol(n), `isBankHolidayEW("${s}")`);
    eq(!!P.isWorkingDay(s), isWork(n), `isWorkingDay("${s}")`);
    eq(P.workingDayOnOrBefore(s), str(backToWork(n)), `workingDayOnOrBefore("${s}")`);
    if (problems.length > 200) break;
  }
}

// ---------- 3. The payday cluster, every setting and month 1990–2100 ----------
// Without H1's functions, the same checks run against the weekend-only rule of 2.16 (so the harness is tested too).
const withHolidays = !missing.length;
const ruleWork = withHolidays ? isWork : (n) => weekday(n) !== 0 && weekday(n) !== 6;
const ruleBack = (n) => { while (!ruleWork(n)) n--; return n; };
/** The payday in month y-m: {intended, date} as day numbers. */
const rPayday = (pc, y, m) => { const i = intendedDay(pc, y, m); return { intended: i, date: moves(pc) ? ruleBack(i) : i }; };
/** The payday that pays for month k. */
const rPaydayFor = (pc, k) => { const [y, m] = mkShift(k, paysNext(pc) ? -1 : 0).split('-').map(Number); return rPayday(pc, y, m).date; };
/** The first payday on or after day number t: {date, month it pays for}. */
function rNext(pc, t) {
  const [y, m] = ymdOf(t); const k0 = mk(y, m);
  for (let j = -1; j <= 3; j++) { const k = mkShift(k0, j), d = rPaydayFor(pc, k); if (d >= t) return { date: d, month: k }; }
  throw new Error('no payday found');
}
/** The 10-day rule: from 10 days before the next payday (that day included) the app opens on the month it pays for;
 *  before then, on the month the last payday paid for (the month before it). */
const rDefault = (pc, t) => { const nx = rNext(pc, t); return nx.date - t <= 10 ? nx.month : mkShift(nx.month, -1); };

// The rule's own figures (the oracle's, so they print the same whatever calc.js does): how many paydays move, how far,
// and the windows' lengths in days (payday to the day before the next, both counted).
let moved = 0, maxBack = 0, longest = '';
const win = { all: [Infinity, 0], y2000: [Infinity, 0] };
for (const pc of SETTINGS) for (let k = '1990-01'; k < '2100-12'; k = mkShift(k, 1)) {
  const [y, m] = k.split('-').map(Number), o = rPayday(pc, y, m);
  if (o.date !== o.intended) moved++;
  maxBack = Math.max(maxBack, o.intended - o.date);
  const a = rPaydayFor(pc, k), b = rPaydayFor(pc, mkShift(k, 1)), len = b - a;
  if (len > win.all[1]) longest = `${label(pc)}: ${str(a)} to ${str(b - 1)}`;
  win.all = [Math.min(win.all[0], len), Math.max(win.all[1], len)];
  if (k >= '2000-01' && k <= '2049-12') win.y2000 = [Math.min(win.y2000[0], len), Math.max(win.y2000[1], len)];
}

for (const pc of SETTINGS) {
  const n0 = problems.length;
  let prevFor = null;
  for (let y = 1990; y <= 2100 && problems.length - n0 < 5; y++) for (let m = 1; m <= 12; m++) {
    const o = rPayday(pc, y, m), got = P.paydayIn(pc, y, m);
    eq(got, str(o.date), `paydayIn(${label(pc)}, ${y}, ${m})`);
    if (typeof got !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(got)) continue;
    const g = parse(got), back = o.intended - g;
    checks += 3;
    if (back < 0 || back > 4) bad(`paydayIn(${label(pc)}, ${y}, ${m}) = ${got}: ${back} days from the intended ${str(o.intended)} (0 to 4 back allowed)`);
    if (back && !ruleWork(g)) bad(`paydayIn(${label(pc)}, ${y}, ${m}) = ${got} moved on to a weekend or bank holiday`);
    if (pc.day !== 'last' && pc.weekend === false && back) bad(`paydayIn(${label(pc)}, ${y}, ${m}) = ${got}: the box is unticked, so it never moves`);
    // paydayFor: the payday that pays for month k; monthWindow: from it to the day before the next; the windows tile
    const k = mk(y, m), f = P.paydayFor(pc, k), w = P.monthWindow(pc, k) || {};
    eq(f, str(rPaydayFor(pc, k)), `paydayFor(${label(pc)}, "${k}")`);
    eq(`${w.from} to ${w.to}`, `${str(rPaydayFor(pc, k))} to ${str(rPaydayFor(pc, mkShift(k, 1)) - 1)}`, `monthWindow(${label(pc)}, "${k}")`);
    if (prevFor) {
      checks++;
      if (!(prevFor < f)) bad(`windows for ${label(pc)}: paydayFor("${mkShift(k, -1)}") = ${prevFor} isn't before paydayFor("${k}") = ${f}`);
    }
    prevFor = f;
  }
}
// The windows tile: each day 1990–2100 is in exactly one window, the one whose payday is the last on or before it.
// (Strictly increasing paydayFor gives that; this spells it out for three settings, by brute force.)
for (const pc of [{ day: 28 }, { day: 1 }, { day: 'last' }]) {
  const starts = []; for (let k = '1990-01'; k <= '2100-12'; k = mkShift(k, 1)) starts.push(parse(P.paydayFor(pc, k)));
  let i = 0;
  for (let n = starts[0]; n < starts[starts.length - 1]; n++) {
    while (starts[i + 1] <= n) i++;
    let inWins = 0; for (let j = Math.max(0, i - 2); j <= Math.min(starts.length - 2, i + 2); j++) if (starts[j] <= n && n < starts[j + 1]) inWins++;
    checks++; if (inWins !== 1) { bad(`windows for ${label(pc)}: ${str(n)} is in ${inWins} windows`); break; }
  }
}

// ---------- 4. nextPayday and defaultMonth, every day of 2026–2028 ----------
for (const pc of SETTINGS) {
  const n0 = problems.length;
  for (let t = dayNo(2026, 1, 1); t <= dayNo(2028, 12, 31) && problems.length - n0 < 5; t++) {
    const s = str(t), nx = P.nextPayday(pc, s) || {}, want = rNext(pc, t);
    checks++;
    if (!(typeof nx.date === 'string' && nx.date >= s)) bad(`nextPayday(${label(pc)}, "${s}") = ${JSON.stringify(nx)}: not on or after today`);
    eq(nx.date, str(want.date), `nextPayday(${label(pc)}, "${s}").date (the first payday on or after today)`);
    eq(nx.month, want.month, `nextPayday(${label(pc)}, "${s}").month`);
    eq(P.defaultMonth(pc, s), rDefault(pc, t), `defaultMonth(${label(pc)}, "${s}") (10-day rule; next payday ${str(want.date)} for ${want.month})`);
  }
}

// ---------- Report ----------
const secs = ((Date.now() - t0) / 1000).toFixed(1);
problems.slice(0, 40).forEach((p) => console.log('  ' + p));
if (problems.length > 40) console.log(`  … and ${problems.length - 40} more`);
const rule = withHolidays ? 'weekends and England and Wales bank holidays' : "weekends only (2.16's rule)";
if (missing.length) console.log(`Bank holidays: 2.16.1's core isn't in calc.js yet (missing ${missing.join(', ')}), so the payday rule was checked against ${rule}. This is a failure until it lands.`);
console.log(`Bank holidays: ${problems.length ? problems.length + ' problems' : 'no problems'} in ${checks} checks (oracle = gov.uk 2024–2028; ${SETTINGS.length} payday settings × 1990–2100 by ${rule}: ${moved} paydays move, at most ${maxBack} days back; windows ${win.all[0]}–${win.all[1]} days, ${win.y2000[0]}–${win.y2000[1]} in 2000–2049, the longest ${longest}; nextPayday and defaultMonth every day 2026–2028; ${secs} s)`);
if (problems.length || missing.length) process.exitCode = 1;
