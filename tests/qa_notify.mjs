// 2.2 reminder notifications, page side (with the stand-in for the Android bridge): the settings, the permission
// result coming back, the schedule handed to the app, and opening Reminders from a notification.
import { suite, session, sampleStorage, K, T, LS, axe, PAGE } from './lib.mjs';
import fs from 'fs';
const { check, finish } = suite('Reminder notifications');
const st = p => p.evaluate(() => window.__qaNative);
const ev = (p, type, v, ok) => p.evaluate(([t, v, ok]) => window.paydayNativeEvent(t, v, ok), [type, v, ok]);

// ---------- in a browser there are no notifications ----------
let { ctx, p } = await session({ storage: sampleStorage(true) });
await p.click('#t-settings');
check('In a browser the section is hidden', await p.isHidden('#sNotify'));
await ctx.close();

// ---------- in the app ----------
({ ctx, p } = await session({ storage: sampleStorage(true), native: true }));
await p.click('#t-settings'); await p.click('#sPayday summary'); await p.selectOption('#pay_day', '28'); await p.waitForTimeout(100);
await p.click('#sNotify summary'); await p.waitForTimeout(60);
check('Settings › Reminders & notifications: off, 09:00, amounts off', (await T(p, '#sumNotify')) === 'Off' && !(await p.isChecked('#notify_on')) && (await p.inputValue('#notify_time')) === '09:00' && !(await p.isChecked('#notify_amounts')));
check('It explains what is notified and that nothing leaves the phone', (await T(p, '#setNotify')).includes('the day before payday') && (await T(p, '#setNotify')).includes('nothing is sent anywhere'));
check('No axe violations (notifications section)', (await axe(p)).length === 0, (await axe(p)).join(' | '));
await p.waitForTimeout(2300);
let s = await st(p);
check('The schedule is handed to the app even while off (so turning on is instant)', !!s.schedule && s.schedule.time === '09:00' && Array.isArray(s.schedule.entries));
const pay = s.schedule.entries.find(e => e.key.startsWith('pay:'));
check('…with "Payday tomorrow" the day before the 28th', pay && pay.date === '2026-10-27' && pay.title === 'Payday tomorrow' && pay.text === 'Wed 28 Oct 2026 pays for November 2026. 5 transfers to make.', JSON.stringify(pay));
check('…and no amounts', !s.schedule.entries.some(e => /£/.test(e.title + e.text)));
await p.click('#notify_on'); await p.waitForTimeout(60);
s = await st(p);
check('Switching on asks the app (which asks Android for permission)', JSON.stringify(s.calls.filter(c => c[0] === 'notify').pop()) === '["notify",true]' && (await p.getAttribute('#notify_on', 'aria-disabled')) === 'true' && (await T(p, '#setNotify')).includes('Waiting for your phone'));
check('…and keyboard focus stays on the switch', await p.evaluate(() => document.activeElement && document.activeElement.id === 'notify_on'));
await ev(p, 'notify', false, false); await p.waitForTimeout(80);
check('Permission refused: the switch stays off, with how to allow it', !(await p.isChecked('#notify_on')) && (await T(p, '#setNotify')).includes('allow notifications for Dovetail in your phone') && (await LS(p, K.cfg)).notify.on === false && (await T(p, '#toast')) === "Notifications weren't turned on");
await p.click('#notify_on'); await p.waitForTimeout(40);
await p.evaluate(() => { window.__qaNative.notifyOn = true; window.__qaSave(); });
await ev(p, 'notify', true, true); await p.waitForTimeout(80);
check('Permission given: on, saved, summarised', await p.isChecked('#notify_on') && (await LS(p, K.cfg)).notify.on === true && (await T(p, '#sumNotify')) === 'On, 09:00' && (await T(p, '#toast')) === 'Notifications are on');
const n0 = (await st(p)).schedules;
await p.fill('#notify_time', '18:30'); await p.dispatchEvent('#notify_time', 'change'); await p.waitForTimeout(60);
s = await st(p);
check('A new time is saved and sent straight away', (await LS(p, K.cfg)).notify.time === '18:30' && s.schedule.time === '18:30' && s.schedules > n0 && (await T(p, '#sumNotify')) === 'On, 18:30');
await p.fill('#notify_time', '23:30'); await p.dispatchEvent('#notify_time', 'change'); await p.waitForTimeout(60);
check('Times are kept between 06:00 and 22:00', (await LS(p, K.cfg)).notify.time === '22:00' && (await p.inputValue('#notify_time')) === '22:00');
await p.fill('#notify_time', '18:30'); await p.dispatchEvent('#notify_time', 'change'); await p.waitForTimeout(60);
await p.check('#notify_amounts'); await p.waitForTimeout(60);
s = await st(p);
check('"Show amounts" puts amounts in (bills and the expected left over)', (await LS(p, K.cfg)).notify.amounts === true && s.schedule.entries.some(e => /£/.test(e.title)) && s.schedule.entries.find(e => e.key.startsWith('pay:')).text.includes('Expected left over £'));
// a data change reaches the app (debounced)
await p.click('#t-due'); await p.click('#dueList .btn:has-text("+ Add a reminder")'); await p.waitForTimeout(80);
const rid = await p.evaluate(() => document.activeElement.id);
await p.fill('#' + rid, 'Boiler service'); await p.waitForTimeout(2700);
s = await st(p);
check('A new reminder reaches the app\'s schedule', s.schedule.entries.some(e => e.title === 'Boiler service'));
await p.click('#t-pay'); await ev(p, 'open', 'due', true); await p.waitForTimeout(100);
check('Opening the app from a notification shows Reminders', await p.isVisible('#tab-due') && await p.evaluate(() => location.hash) === '#due');
await p.goBack(); await p.waitForTimeout(100);
check('…and Back goes to Pay', await p.isVisible('#tab-pay'));
await p.reload(); await p.waitForTimeout(300); await p.click('#t-settings'); await p.click('#sNotify summary');
check('After a restart the switch shows what the app says (on)', await p.isChecked('#notify_on'));
await p.evaluate(() => { window.__qaNative.notifyAllowed = false; window.__qaSave(); });
await p.click('#t-pay'); await p.click('#t-settings'); if (!(await p.$eval('#sNotify', d => d.open))) await p.click('#sNotify summary');
check('Notifications blocked later in the phone\'s settings: shown as off', !(await p.isChecked('#notify_on')) && (await LS(p, K.cfg)).notify.on === false);
await p.evaluate(() => { window.__qaNative.notifyAllowed = true; window.__qaSave(); });
await p.click('#t-pay'); await p.click('#t-settings'); if (!(await p.$eval('#sNotify', d => d.open))) await p.click('#sNotify summary');
await p.click('#notify_on'); await p.waitForTimeout(40);
await p.evaluate(() => { window.__qaNative.notifyOn = false; window.__qaSave(); }); await ev(p, 'notify', false, true); await p.waitForTimeout(60);
check('Switching off tells the app and stays off', JSON.stringify((await st(p)).calls.filter(c => c[0] === 'notify').pop()) === '["notify",false]' && !(await p.isChecked('#notify_on')) && (await T(p, '#sumNotify')) === 'Off');
check('No JS errors (app)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();

// ---------- 2.16 (E14): a household with someone on a pay pattern has a transfer day ----------
{ // Jordan (made up), paid £420.00 a week into his current account, which sends £600.00 to Bills.
  const c = { schema: 5, setupDone: true, lastVersion: /var VERSION="([\d.]+)"/.exec(fs.readFileSync(PAGE, 'utf8'))[1], people: [{ id: 'jordan', name: 'Jordan', payAccount: 'cur', usualPay: 1820, pattern: { every: 7, each: 420 } }],
    accounts: [{ id: 'cur', name: 'Current account', colour: 'blue', leftoverTo: null }, { id: 'bills', name: 'Bills account', colour: 'purple', leftoverTo: 'cur' }],
    bills: [{ id: 'rent', name: 'Rent', amount: 600, account: 'bills', months: [] }], income: [], budgets: [], savings: [], reminders: [], doneLog: [], payday: { day: 28, weekend: true } };
  ({ ctx, p } = await session({ storage: { [K.cfg]: c }, native: true }));
  await p.click('#t-settings'); await p.click('#sNotify summary'); await p.waitForTimeout(60);
  check('Pay pattern: Settings says "the day before transfer day"', (await T(p, '#setNotify')).includes('the day before transfer day'));
  await p.waitForTimeout(2300);
  const e = (await st(p)).schedule.entries.find(x => x.key.startsWith('pay:'));
  check('…"Transfer day tomorrow" the day before the 28th, "Wed 28 Oct 2026 is for November 2026. …"', e && e.date === '2026-10-27' && e.title === 'Transfer day tomorrow' && /^Wed 28 Oct 2026 is for November 2026\. \d+ transfers? to make\.$/.test(e.text), JSON.stringify(e));
  check('…and, if Android delays it, "Transfer day today"', e && e.late && e.late.title === 'Transfer day today' && e.late.text.startsWith('Today, Wed 28 Oct 2026, is for November 2026.'), JSON.stringify(e && e.late));
  check('No JS errors (pay pattern)', p.errs.length === 0, p.errs.join(' | '));
  await ctx.close(); }

// ---------- the example household never sends a schedule ----------
({ ctx, p } = await session({ native: true }));
await p.click('#su_example'); await p.waitForTimeout(2500);
check('Exploring the example household sends nothing to the app', !(await st(p)).schedule);
check('No JS errors (example)', p.errs.length === 0, p.errs.join(' | '));
await ctx.close();
await finish();
