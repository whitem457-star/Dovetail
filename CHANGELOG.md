# Changelog

## 2.10.1 (versionCode 18)
On the phone, WhatsApp sent only the update file: it drops a message that comes with a file.
- **Share asks what to send**, in the app with a household set up: "Share this month" offers "Send the transfers as a message" or "Send an update for the other phone". The update file still carries the transfers as its message, which an email keeps. If the file can't be prepared, it says "Couldn't prepare the update file." instead of sending the text in its place. The example household and a browser send the text straight away, as before.
- Share is labelled "Share this month's transfers or an update file" for screen readers and opens a dialog; the tour says Share sends the list or a file.
- `CONTRIBUTING.md`: issues and ideas are welcome; pull requests aren't accepted for now, so the author keeps the choice of licence for future versions.
- What's new: three lines, on the choice, opening the update, and making changes on one phone.
- Data: still schema 5 and backup version 5; no new fields. Calculations unchanged. No permission changes.
- Tests: the choice (keyboard, axe, each button, Close, a file that can't be prepared) in `qa_update.mjs`, and a real 2.10 → 2.10.1 update test (`RELEASE['2.10']`, from `d02ad9f`).

## 2.10 (versionCode 17)
Keeping a second phone up to date over WhatsApp (one way: the phone that sends is the one where changes are made), and choosing a month without paging through.
- **Share** on the Pay tab, in the app with a household set up, now sends an update file with the transfers: the whole backup as `Dovetail-update-20-Oct-2026.json`, with the month's transfers as the message (WhatsApp shows it with the file) and "Tap the file to update Dovetail on your phone." at the end. Anything still waiting to be saved is saved first. If the file can't be sent (over 2 MB, which the other phone wouldn't open, or it can't be written), the text goes on its own, as before. For screen readers the button is "Share this month's transfers and an update file", and the tour says Share sends a file too. The example household still sends the text only. A new `shareUpdate` on the bridge (no new permission).
- **Opening it on the other phone**: a file from the same household (it shares an account with this phone: `sameHousehold`) opens on the Pay tab with a short confirmation at the top, "Update from this file?", when it was saved, and that it replaces the figures on this phone (what's there is kept in the automatic backups for 30 days), with **Update** or Cancel. Update says "Updated" and changes nothing of this phone's own (notifications, appearance, app lock). If this phone has changes saved after the file was (an older file from further up the chat, say), the card says "This phone has changes made after this file was saved. They'll be replaced." and Update is red. A tour or help sheet that's open is closed first. Any other household's backup, a file picked with "Import a backup file…", the example and a new install get the full confirmation, as before. This also works for a backup file shared from Settings, and from a phone still on 2.9.1.
- **Choosing a month**: tap the month name in the month bar (Pay, Analysis, Reminders) for "Choose a month": two wheels, month and year, that snap to the middle, then "Show <month>", or "This month" when another month is on screen. The years run from last year (or the earliest saved month) to two years ahead (`pickerYears`). A tap or a scroll by finger picks (a screen reader moving through the options doesn't); with a keyboard, the arrow keys, Page Up/Down, Home and End move a wheel and Enter or Space shows the month. Options are at least 44px tall at any text size. Back, Esc and Close leave the month as it was. The month name says "Choose a month" to screen readers.
- Safer restores: Update and "Replace with this backup" now change nothing if the backup of what's on the phone can't be saved first ("Couldn't save a backup, so nothing was changed."), and save anything still being typed before they start.
- Settings › Backup says Share on the Pay tab sends the same file. The privacy policy says the update file holds all the figures.
- What's new: three lines, on sending and opening an update, making changes on one phone, and choosing a month.
- Data: still schema 5 and backup version 5; no new fields. Calculations unchanged. No permission changes.
- Tests: `qa_update.mjs` (sending, the update card with keyboard, screen reader labels and axe in light and dark at 360px with larger text, Cancel, Update, another household, the example, a new install), the older-file line, a failed backup, another household's file while an update waits, the file picker, a help sheet and the tour; `qa_month.mjs` (the month picker: keyboard, taps, scrolling, Back and Esc, each tab, axe in light and dark at 360px with larger text); unit tests for `updateFileName`, `updateText`, `sameHousehold`, `changedSince` and `pickerYears` (`v210.test.mjs`), Robolectric tests for `shareUpdate`, and a real 2.9.1 → 2.10 update test (including a 2.9.1 backup opened as an update).

## 2.9.1 (versionCode 16)
A tidier look, with less explaining. Nothing about the figures or the data changes.
- Pay tab: no "?" by Left over, Take-home pay, the transfers, Not every month or One-offs, and no "what reached your bank" beside Take-home pay. The line under the transfers is plain text ("Includes 1 bill that isn't monthly: £168.00."): This month in detail is just below it. The Saved months list is gone; every month is still saved, and the arrows and swipe reach them.
- Reminders: no "?".
- Analysis: Month by month has no "?", no summary line ("November 2026: £267.02 left over. Tightest month ahead…"), no heaviest and lightest month line and no one-offs line. Words appear above the chart only when a month is short or there's no pay yet. Each bar's reading and the figures have the rest, and the chart's description for screen readers still sums it up. The monthly picture has no income line and no note about yearly bills; each person's pay is in its figures, under Income. The other "?"s are gone except Saved so far's.
- "Show as table" is now "Show the figures" ("Hide the figures" when open) under every Analysis chart.
- Fixed: closing a help sheet with Esc on the Analysis tab lost the keyboard focus; it now goes back to the "?".
- What's new: three lines, on the tidier Pay tab, the Analysis charts and where help is now.
- Data: still schema 5 and backup version 5; no new fields. Calculations unchanged. No permission changes.
- Tests: a real 2.9 → 2.9.1 update test (including restoring a backup 2.9 made); the help sheet's checks (dialog, focus, Esc, Close, a tap outside, Back, axe, larger text) now run on Saved so far's "?"; the Saved months checks now read the saved months in storage. `oneOffsLine` (the one-offs line) is gone with its unit test.

## 2.9 (versionCode 15)
- Payday is now called **Dovetail**: on the home screen, in the app, in notifications' app name, in exports ("This is an export from Dovetail…", "Dovetail transfers for November 2026") and in the names of shared files (`dovetail-backup-<date>.json`, `dovetail-analysis-<date>.md`, `dovetail-bills/months-<date>.csv`). "Payday", the day pay arrives, keeps its name everywhere it means that (Settings › Payday, "Payday tomorrow").
- Nothing that holds data changes: same package (`uk.whiteboard.payday`), signing key, page address, storage keys and backup marker (`payday-transfers`), so the update installs over 2.8 with everything kept, and every earlier backup still opens.
- "Send feedback" in Settings › About and on the recovery screen: it opens the email app with a message to dovetail.feedback@gmail.com, the subject "Dovetail 2.9 feedback" and the app details (never names or amounts) under room for what happened. About shows the address too, and replaces "send them to whoever gave you the app". A new `sendFeedback` on the bridge (an email intent; no permission). Without an email app, Android shows a message with the address; in a browser it is a mailto link.
- What's new: three lines, on the new name, the file names and Send feedback.
- Builds: `build.sh` and CI also build the Android App Bundle (`app-release.aab`) for Google Play, checked like the APK (same certificate, no INTERNET); CI attaches `Dovetail-v<version>` with the `.apk` and the `.aab`.
- Licence: GNU GPL v3 or later (`LICENSE`), copyright 2026 Marcus White (in the README; the app names nobody, so Settings › About just says it is free software under the GPL).
- Data: still schema 5 and backup version 5; no new fields. Calculations unchanged. No permission changes.
- Tests: a real 2.8 → 2.9 update test (including restoring a backup 2.8 made), the suites expect the new name, unit tests for `feedbackMail` (`v29.test.mjs`), Playwright checks for Send feedback (link, bridge, fallback, recovery screen, axe at 360px dark and light with larger text) and Robolectric tests for the email intent.

## 2.8 (versionCode 14)
- The page always opens on something usable. If the figures saved on the phone can't be read, or opening them throws, a recovery screen replaces the app instead of a blank page or the setup wizard: restore one of the automatic backups (newest first, kept ones marked), open a backup file, start again (two taps), or copy the app details. Whatever was on the phone is set aside first (`payday.broken.v1`, one copy), never written over, and the app then reopens the normal way.
- Settings and months are checked item by item when they're opened or restored (`normCfg`, `normMonths`): a payday day that isn't 1–31 or "last" counts as not set, bill months are whole numbers 1–12, items and months that aren't objects are dropped, and ticks, pay and one-offs with the wrong shape are fixed. Sound data goes through unchanged. A restore is tried on copies first (including working out the month to open on) and refused ("That backup couldn't be opened, so nothing was changed.") before anything is saved.
- Ids (`uid`) now use 64 random bits (the phone's crypto) and a counter, so the many made in one go by setup and quick-add can't collide.
- The 1.x household built into the upgrade is only given to data that really came from 1.x (a schema number, the 1.x settings, bills on the 1.x accounts or months with the 1.x people's pay); a hand-made backup with no household stays empty and is refused as having no accounts.
- Pasted restores: refused over 2 MB, and when the text says it's from another app.
- Unexpected errors (uncaught errors and rejected promises) are kept, ten at most, on the phone (`payday.errors.v1`) and listed in "Copy app details" (time, version, message and where in the code; never names or amounts).
- `fmt` never prints "−£0.00".
- No names are built into the app any more. The 1.x upgrade gives the four 1.x accounts plain names ("Current account 1", "Current account 2", "Joint bills account", "Joint spending account") and takes the people, their ids and their names from the data itself (1.x kept each person's pay under a key of their own). The account ids and 1.x data keys stay, being part of the 1.x data format. Households already upgraded keep the names they have. The owner's 1.4 data upgrades to the same ids, ticks, transfers and float. Two deliberate narrowings: data only counts as 1.x with a 1.x sign (a schema number, defaultPay, budget, v12, bills on the 1.x accounts, or 1.x-shaped months with an overdraft or the joint transfer's result), so a month holding only pay isn't enough; and 1.x data with no pay keys at all gets the accounts but no people.
- What's new: three lines, on the recovery screen, the more careful restore and the recent errors in "Copy app details".
- Data: still schema 5 and backup version 5; no new fields on settings or months. Calculations unchanged. No Android changes apart from the version.
- Tests: `tests/unit/hardening.test.mjs`, `tests/qa_recovery.mjs`, a real 2.7 → 2.8 update test, and the existing suites now expect the plain account names.

## 2.7 (versionCode 13)
- The Pay tab leads with what's left over:
  - at most one notice above it: a backup to restore, What's new, or the example banner / "Finish setting up" (in that order); the reminders nudge is one line under it ("Gym in 20 days", or "3 reminders need attention: Gym, Energy and more", cut short with "…"), and the Reminders badge still counts them;
  - "Not every month", the one-offs, each account's figures and the month's totals are under "This month in detail" (with the left over beside it), closed unless the month has one-offs, and kept open or closed for the session once tapped. A line under the transfers names any bills that aren't monthly due that month and opens it there. One-off links, Reminders' "Open <month>" and the tour open it first.
- "Share" beside the transfers: the month's transfers as text, in order, with ticks (and any difference still to send), what's left over and whether pay is estimated, through the phone's share sheet (a new `shareText` on the bridge; no new permission). Copied in a browser.
- Ticking a transfer before typing pay still fills in the estimate, but now says so ("Using estimated pay for now. Type what arrived when it lands." and a hint under each box) and marks it (`payEstimated` on the month), so Analysis keeps the month hatched, with no predicted line, and leaves it out of averages and pay history until real pay is typed. Months from earlier versions read exactly as before.
- The example household's "Start my own" is now a green "Set up my own household", red only after the first tap ("Tap again: this clears the example").
- Reminders: something under Needs attention is one line in its month ("… — listed above") instead of a second set of buttons; "In <month>" has a hint, "‹ › change month above", until the month is changed there once.
- "Previous months" is "Saved months", split into "Ahead" and "This month and earlier", with "Pay not typed in" when nobody's pay was typed.
- Month by month outlines this month's bar and keeps its label (bold) however narrow the screen; Pay and what was left does the same.
- Settings: Appearance, Reminders & notifications and App lock come after Payday, and Help after Backup, just above About. About has "What changed".
- Smaller things: setup's bills step shows accounts that aren't for bills as one line ("Joint spending — + Add a bill"); a monthly subscription or membership's first renewal date reminds a week before (others a month; a choice already made never changes); the code now notes that date boxes show the phone's own date format and only ever read the date itself.
- Data: one optional month field, `payEstimated`; still schema 5 and backup version 5. Calculations unchanged.
- Tests: a 2.7 suite (`qa_v27.mjs`), unit tests for estimated pay, the Share text and the default reminder, Robolectric tests for `shareText`, and a real 2.6 → 2.7 update test.

## 2.6 (versionCode 12)
- A new seven-step setup, for a new install or after Start again (an update never shows it):
  - welcome: set up, restore from a backup, or explore an example;
  - your pay: take-home pay explained, with other regular income if there is any;
  - your payday;
  - your accounts: four starting points with small diagrams, then a diagram of how money moves with a worked example, the accounts to check and where each pay arrives;
  - your bills, account by account: every month, once a year or some months, with suggestions that go once that bill is there;
  - spending budgets and savings transfers;
  - a preview of the first payday (the next one from today, and the month it pays for), worked out with the real calculation.

  "Looks right, start" opens the Pay tab on that month once, and savings transfers count from that month; after that the app opens on its usual month. "Finish later" on every step keeps what's been entered and fills in the rest; rows that aren't complete (a bill with no amount, a yearly bill with no month) are left out, and a message says so ("2 rows weren't complete, so they were left out. You can add them in Settings."). The optional steps have "Skip this step". Nothing is saved until setup finishes.
- After a new setup, a "Finish setting up" card on the Pay tab lists what's still missing (pay, payday, bills, budgets or savings), each opening the right part of Settings. It goes when everything's done or "Hide this" is tapped. Existing households, the example and restores of earlier backups never see it.
- Settings › Backup, export & restore › "Start again" (on the phone): keeps the current figures as a backup first (and changes nothing if it can't), clears their reminders, then starts setup, which offers to bring them back. The old Wealth data, app lock, notifications and appearance are untouched, even if the app is closed before setup finishes (it reopens on setup, offering the backup).
- Help for newcomers:
  - "Show me around": a short guided tour straight after setup, and any time from Settings › Help (or the example household's banner). It rings one thing at a time on the real screens (pay month, what's left over with your own figure, take-home pay, the transfers, one-offs, bills that aren't monthly, then the Analysis, Reminders and Settings tabs), with a card saying what it is and what to do. Back, Next, Skip tour and Esc; the phone's Back button ends it on any tab (on Pay it no longer leaves the app). Screen readers and keyboards stay in the card. Existing households don't get it uninvited.
  - "What's this?" buttons: a small "?" next to the headings a newcomer may not know opens a plain explanation, using your own figures where it helps.
  - Settings › Help: Show me around, How Payday works (the routine, how money moves with your own accounts' diagram, what left over means) and Words Payday uses (a short glossary).
  - Until a month has had every transfer ticked, the Pay tab shows one quiet line above the transfers: "First payday? Open your banking app, make each payment below, then tick it here." A household that has used another month (a tick or typed pay) never sees it.
- Plain words for someone new to budgeting: the float is "left over" everywhere on screen ("Left over this month", "Total left over", "Pay and what was left"), "Budget month" is "Pay month", "Projected" is "Estimated", the savings rate is "Saved from pay", Top-ups are "Accounts that ran short" (with a line saying what a top-up is) and the Pay tab lists "Transfers to make, in this order". "Leftover goes to" is "What's left moves to", and Settings › Accounts shows the money-flow diagram from setup. Hints, Settings texts and the payday notification (with amounts on: "Expected left over") are plainer too. Every figure is the same; the exports keep their wording.
- Month by month: the dashed box round the month on screen is gone (it looked like a bar, as if it were a prediction). Instead, each month with pay typed in has a short line at the float that was predicted before pay was typed, and its reading and table say how far the actual float was from it ("£250.00 less than the £459.97 predicted"). No line when there was nothing to predict from (no earlier pay and no usual pay).
- Data: two optional settings, `setupTips` and `tourDone`, stored only when they matter; still schema 5 and backup version 5. Calculations unchanged.
- Tests: a new tour and help suite, the setup suite rewritten for the seven steps (every starting point, Finish later from each step, the checklist and Start again), unit tests for the setup and checklist helpers and the predicted float, and a real 2.5 → 2.6 update test.

## 2.5 (versionCode 11)
- Analysis, simplified: about half the words, the same figures. It opens with a verdict on the month on screen ("November 2026: £415.90 left over. Tightest month ahead: December 2026, £328.81", or a red "short by" banner), then the heaviest and lightest months and what makes the heaviest so. (The per-month "£123.06 more than average" reading has gone; the table has each month's outgoings.) "Heavy and light months" and "Projected float" are one card, "Month by month": one float chart, one key, one one-offs line and one table (float, bills, budgets, savings, one-offs, going out, what's different). The monthly picture keeps the savings rate tile and the income bar and loses the two other tiles and the sentences that restated them; this month's float, which it repeated from the Pay tab, is now the verdict above. Card subtitles, the intro line and the "bills have no category" banner are gone (the link in the Not categorised row remains). The Savings category says it's counted as saving in the monthly picture, which is why the two "bills a month" figures differ. Saved so far shows each transfer's total; "ticked in 2 of 3 months" moved to its table. History and Price changes are hidden until there's something to show, like Top-ups.

## 2.4 (versionCode 10)
- Swipe left or right to change the month (next and previous), exactly like the ‹ › arrows, on Pay, Analysis and Reminders. Swiping no longer changes tab; Settings ignores swipes. A new one-off still being typed stays open across a month change.
- Reminders follow the month on screen: the month bar shows there too, and a new "In <month>" section lists what falls between that month's payday and the next (or the calendar month without a payday), including dated one-offs whose date has passed. "Needs attention" and the badge still count from today. "Coming up" and "Later" are now one collapsed "All upcoming". A new reminder starts in the month on screen when that month is ahead.
- "Every pound accounted for" is gone: nothing is shown when the figures add up, and a warning with an "Open accounts" button appears in the hero when they don't.
- Tests: month swipes (including mid-edit), Reminders by month (unit tests for the payday windows and the page), the reconciliation warning in light and dark.

## 2.3 (versionCode 9)
- A restyle in the spirit of the best banking apps, with nothing about the figures changed:
  - the Pay tab opens on what's left this month (the float) in large type, with a ring showing progress through the transfers and the "every pound accounted for" check;
  - cards are set apart by tone and a soft shadow (light mode) instead of outlines; rounder corners; quieter, sentence-case section titles;
  - accounts get coloured badges with their initials; each person's pay is a row with their badge and the account it goes into;
  - amounts are set in the heading font with smaller pence;
  - ticking a transfer draws the tick and fades the amount (no strike-through), with a light haptic tap on the phone (no permission); finishing them all gets a stronger tap and a brief "All done";
  - buttons press in; sections and editors open with a short motion; the float rolls to its new value.
- Pages fade in when you change tab; a swipe or the month arrows slide them in from the side. Nothing moves if the phone asks for reduced motion.
- "Not every month" shows this month's bills only (total beside the title), with the link to all bills that aren't monthly.
- The Pay tab is reordered: what's left, pay, transfers, not every month, one-offs, then the float in detail.
- New app icon (adaptive, with a themed-icon layer) and an Android 12+ launch screen in the app's colours.
- Keyboard focus stays on a transfer's tick after ticking it.
- Tests: a new look-and-feel suite (hero, badges, money style, ticks and haptics, fades and reduced motion, light and dark surfaces) and a Robolectric haptics test.

## 2.2 (versionCode 8)
- Pay tab: other income (and any one-off income that month) is listed, read-only, under the pay boxes; a tap opens it in Settings or the one-offs card. On the "after the transfers" cards every row of money coming in shows "+ £x" in the accent colour.
- "Not every month" replaces "Irregular bills this month": the bills due this month with their account and a total, the next three months' bills (each listed once), and a link to Settings › Bills with a new "Not monthly" filter chip. No crossed-out chips.
- Undo message: swipe it sideways, tap ×, or press Escape to dismiss it.
- Analysis: heavy and light months and projected float now run from 3 months before the month on screen to 8 after, with "this month" marked; months with typed pay are solid and projected months hatched, with a key; no dots. Readings, the table's new "What's different" column and a one-offs line under each chart say what makes a month differ. "Average left over" is shown next to this month's figure from the Pay tab. Subscriptions and memberships are a highlighted, expandable line in "Where the money goes". Pay and float history is one chart, with pay in the readings and the table.
- Settings › Appearance: theme (follow phone, light, dark) and text size (smaller, normal, larger). The app's window, bars and lock screen follow the theme.
- Swipe left or right to change tab.
- Settings › Reminders & notifications (opt-in): payday tomorrow, bill renewals and reminders when due soon and on the day, and dated one-offs the day before, at a time you choose between 06:00 and 22:00. Amounts only if you ask. Adds the POST_NOTIFICATIONS permission, asked for only when you switch it on.
- Settings › Backup, export & restore: Payday opens a backup file shared from another phone (WhatsApp, Quick Share, email) with a confirmation first, and "Import a backup file…" uses the file picker. It's a copy, not sync, and it doesn't change this phone's notification or appearance settings.
- Before a restore or an opened backup file replaces everything, the data on the phone is saved as an automatic backup that's kept for 30 days.
- Exports: "Share for analysis" (a Markdown report written so an AI assistant reads it correctly, or "Copy report") and "Share spreadsheet (CSV)" (bills and saved months).
- "What's new" on the Pay tab after updating.
- Longer messages stay on screen longer.
- Switches that wait for the phone (app lock, notifications) keep keyboard focus.
- Payday never runs as two copies, and the page never saves over newer data written by another copy.
- New: web/src/export.js; OpenFileActivity.kt, Notifier.kt and ReminderWorker.kt; androidx.work. Data stays schema 5 and backups version 5; the new settings are optional. A backup from before 2.2 keeps this phone's appearance and notification settings when restored.
- Tests: new unit tests, four new Playwright suites, Robolectric tests for the theme, importing files, exports and notifications, and a real 2.1 → 2.2 update test.

## 2.1 (versionCode 7)
- Analysis tab (Pay, Analysis, Reminders, Settings), worked out from what's already in the app:
  - the monthly picture: savings rate, share committed to bills, spending and left over;
  - where the money goes, by bill category, with yearly and monthly costs;
  - subscriptions and memberships;
  - heavy and light months over the next 12 months (difference from the average month);
  - projected float for the next 12 months, with a warning for any month that would be short;
  - pay and float history;
  - saved so far, from ticked savings transfers, with this tax year's total and how consistently each was made;
  - price changes at renewal;
  - top-ups (accounts that keep needing money).
  Every chart has a table view and can be read with the keyboard.
- Bill categories: suggested from the bill's name, editable, and never overriding your choice. Bill renewals now record the old and new price.
- Settings › Bills: search, quick add (several bills at once), and the yearly cost and monthly equivalent for bills not paid every month.
- First-run setup has a fourth, skippable step for regular bills.
- Undo for deleted bills, income, budgets, savings transfers, reminders and one-offs (and for "Done" on a reminder).
- "Float" is explained during setup and in Settings › Accounts.
- Settings › About › "Copy app details" for reporting problems: no names or amounts.
- Fix (also in 2.0): editing a one-off a second time, after it had autosaved, wasn't saved.
- Fix: ticks and one-offs are saved even while a pay box holds something that isn't an amount.
- Anything waiting to be saved is saved at once when the app goes to the background.
- Restoring a backup never replaces the old Wealth data on the phone.
- The page source is split into web/src (calc, migrate, analysis, ui) and inlined into one page at build time. New Node unit tests, new Playwright suites, and a real 2.0 → 2.1 update test.
- Data: schema 5 (bill categories); backups are version 5.

## 2.0 (versionCode 6)
- Flexible household: people, accounts and "Leftover goes to" are set in Settings, and every transfer is worked out from them. No names, banks or accounts are built in. Accounts that can't cover their own outgoings get a top-up step; several accounts can keep their leftover (one float each, plus a total). Settings prevent loops, and deleting an account asks where its bills, income, budgets, savings and people move.
- Spending budgets are now a list (name, amount, account) instead of fixed food/fuel/general. Savings transfers say which account they're sent from.
- One-offs: known one-off payments or money in for a month, including future months, added on the Pay tab. They're part of that month's transfers, and dated ones show on Reminders. "Overdraft to clear from last month" is now a one-off.
- First-run setup for a new install (who gets paid, which accounts, where each is paid), an example household to explore, and the automatic-backup restore offer. The app no longer ships with any household data.
- Wealth tab removed (net worth, balances, ISA allowance, growth, debts, emergency fund, stale-balance reminders, savings "Goes into" link). Its data stays on the phone, untouched, and in every backup. Mortgage deal end dates moved onto the mortgage bills as renewal dates (6 months' notice).
- Fix: opening a bill (or a reminder editor, a Settings section, a one-off) no longer jumps the page back to the top; it stays put and scrolls whatever opened into view if needed.
- Fix: the bottom tab bar could go missing when reopening the app. The page is now an app shell (header, scrolling middle, tab bar) with no fixed positioning, and the app re-applies window insets every time it comes back.
- Upgrade: 1.4 data becomes the household's two people and its four accounts (two current accounts → the joint bills account → the joint spending account), with the same account ids, ticks renamed and pay moved; November 2026 gives exactly the same transfers and float as 1.4. Backups are version 4; older backups restore through the same upgrade.
- Tests: new Playwright suites (upgrade golden test, pay, household shapes, one-offs, setup, reminders, bridge, layout and axe on every screen in light/dark at 360/400 px), Robolectric tests for insets.

## 1.4 (versionCode 5)
- Rebuilt as a standard Gradle + Kotlin Android project (AGP 8.13.2, Kotlin 2.2.21, compile/target SDK 36, min SDK 29), replacing the apktool + hand-written smali build. Same package name and signing key, so it installs over 1.3.
- Data: the page still loads from file:///android_asset/index.html, so its saved data (localStorage) is untouched by the update. No migration was needed or attempted.
- Automatic backups: every change is saved as a JSON backup in the app's private storage (same format as "Copy backup"). Keeps the last 10 changes plus one per day for 14 days. Listed in Settings with a Restore button; a fresh install that finds backups offers to restore the newest.
- Share backup file: opens Android's share sheet (Drive, email, Files) through a FileProvider. Still no INTERNET permission.
- Optional app lock: fingerprint, face or screen lock on opening (BiometricPrompt), off by default. Relocks after a minute away; hides the app in Recents and blocks screenshots while on. Never locks you out if the phone's screen lock is removed.
- Android backup: allowBackup stays on, but now only the JSON backups are included, and only when Google backup is end-to-end encrypted. WebView storage and settings are excluded.
- Edge-to-edge layout for Android 15/16, predictive-back compatible back handling, and recovery if the WebView renderer crashes.
- USE_BIOMETRIC permission added (for the lock; granted at install, no prompt). The obsolete USE_FINGERPRINT that the library adds is removed.
- Tests: Robolectric JVM tests for the Kotlin code (21), a Playwright suite for the page side of the bridge and the 1.3 to 1.4 data test (39), plus the existing 172 checks.

## 1.3 (versionCode 4)
- Payday setting (day of month or last working day, weekend rule). Drives the month the app opens on, a payday line on Pay, and ISA tax-year counting.
- ISA allowance counts each transfer in the tax year of the payday that funds it (6 April boundary).
- Out-of-date balances are flagged on Wealth and listed in Reminders (3 months; pensions 6; property 12).
- Recently done list on Reminders (renewals and completed reminders, last 20).
- Fix: clearing a pay box no longer saves last month's figure as this month's pay.
- Fix: ticks on savings transfers use stable ids, so deleting or reordering a transfer keeps the right ticks. Old ticks are migrated.
- Fix: the back button goes from any tab to Pay, then out of the app.
- Fix: entering a balance refreshes the reminders count straight away.
- Security: removed setAllowFileAccess(true) from the WebView (assets load without it).
- Migrations consolidated into one migrate() with a schema number, also applied to restored backups.

## 1.2 (versionCode 3)
- Reminders tab: bill renewals, mortgage deal ends, custom reminders, badge, Pay banner, mark as renewed.

## 1.1 (versionCode 2)
- Wealth tab: balances, net worth chart, ISA allowance, investment growth, debts, emergency fund.
- Usability fixes, accessibility contrast, back button moves between tabs.

## 1.0 (versionCode 1)
- Monthly transfers calculator, offline, no permissions.
