# Dovetail

Dovetail (called Payday up to version 2.8) is an Android app for the monthly household transfers. You type in take-home pay; it works out the transfers between your accounts, in order, so every bill, budget and savings transfer is covered, and shows what's left over (the "float" in the code and data). It also has an Analysis tab, Reminders, optional notifications, backup files that open on another phone, and exports. Offline (no INTERNET permission). Package `uk.whiteboard.payday`.

Nothing about any household is built in: everything comes from what's entered. A new install starts with a seven-step setup.

## Layout
- `web/`: the whole UI.
  - `template.html`: HTML and CSS (design tokens at the top), with a `/*PAYDAY_SCRIPTS*/` marker.
  - `src/calc.js`: money, date and payday helpers, the household tree, the transfer calculation, bill categories, tax years.
  - `src/migrate.js`: data upgrades (1.x → schema 5).
  - `src/analysis.js`: Analysis figures, the reminder list, the notification schedule.
  - `src/export.js`: Markdown and CSV exports, Share text, feedback email.
  - `src/ui.js`: the page (DOM, storage, Android bridge, charts). The other four are pure functions with unit tests.
  - `fonts/`: Figtree and Bricolage Grotesque (OFL).
- `app/`: the Android app (Kotlin).
  - `MainActivity.kt`: WebView on `file:///android_asset/index.html`, edge-to-edge insets (refreshed on every resume), Back, app lock, theme, share sheet, opening backup files, notification permission.
  - `NativeBridge.kt`: `window.PaydayNative` (see Bridge).
  - `OpenFileActivity.kt`: receives a backup file opened or shared from another app.
  - `Notifier.kt`, `ReminderWorker.kt`: notifications.
  - `BackupStore.kt`: rolling JSON backups in `files/backups/`.
  - `res/xml/`: FileProvider paths and Android backup rules.
  - `src/test/`: Robolectric JVM tests.
- `tests/`: `npm test` runs everything. Pages are served from a local web server (headless Chromium can drop `file://` storage across reloads). `lib.mjs`: the harness, a stand-in for the Android bridge, `openDetails(p)`.
  - `unit/`: Node tests (`node --test`) loading the app's own files (`unit/load.mjs`), using the made-up household `fixtures/sample-1.x-backup.json` (Alex and Sam, made by `fixtures/make_sample.py`). `v22.test.mjs`, `v24.test.mjs`, `v26.test.mjs`, `v27.test.mjs`, `v29.test.mjs` and `v210.test.mjs` cover each release's new functions.
  - Playwright suites: `qa_pay.mjs`, `qa_pay22.mjs` (other income, Not every month, What's new), `qa_household.mjs`, `qa_oneoff.mjs`, `qa_setup.mjs`, `qa_rem.mjs`, `qa_bridge.mjs`, `qa_analysis.mjs`, `qa_quality.mjs` (categories, quick add, search, undo), `qa_ui.mjs` (axe on every screen, light and dark, 360/400px), `qa_look.mjs` (appearance, swipe), `qa_share.mjs` (backup files, exports), `qa_notify.mjs`, `qa_twocopies.mjs`, `qa_style.mjs`, `qa_tour.mjs`, `qa_recovery.mjs`, `qa_v27.mjs` (Share, estimated pay, This month in detail), `qa_update.mjs` (update file), `qa_month.mjs` (the month picker).
- `build.sh`: page, web tests, JVM tests, lint, signed APK and app bundle, checks. `tests/build-page.mjs` builds the page without the Android SDK.
- `.github/workflows/ci.yml`: everything `build.sh` checks, on every push. On `main` it also signs the APK and AAB with the repository secrets, checks both certificates and attaches `Dovetail-v<version>` (the `.apk` and `.aab`) to the run.
- `CONTRIBUTING.md`: the rules for everyone.

Gradle's `:app:generatePaydayPage` builds `app/build/generated/payday-assets/` before every build: `index.html` is `template.html` with the five scripts inlined in order inside one function scope, plus `fonts/`. It fails if a script contains `</script`. Nothing generated is committed.

## Building
Needs JDK 21+ (for Robolectric; the app compiles for Java 17), Node 18+, Android SDK platform 36 and build-tools 36.0.0.
```
export ANDROID_HOME=/path/to/android-sdk
export PAYDAY_KEYSTORE=/path/to/payday-release.jks
export PAYDAY_KEYSTORE_PASS=...
./build.sh
```
- Output: `app/build/outputs/apk/release/app-release.apk` and `app/build/outputs/bundle/release/app-release.aab` (Google Play), same key (alias `payday`). `build.sh` checks the certificates match and neither has INTERNET. Updates only install over the top with the same key.
- `settings.gradle.kts` lists Google's Maven Central mirror first (Maven Central can return HTTP 429 to shared machines); Robolectric uses it too.
- Each release: bump `versionCode`/`versionName` in `app/build.gradle.kts` and `VERSION` in `web/src/ui.js`, update the "What's new" lines in `ui.js`, add a CHANGELOG entry.

## How the transfers are worked out
- Per account: in = pay of the people paid into it (typed, or estimated from the last month that has it, or usual pay) + other income + one-off income. Out = bills due that month + budgets + savings transfers + one-off payments.
- Each account sends its leftover to another (`leftoverTo`) or keeps it. Working up from the accounts nothing sends to, a subtotal is the account's in − out plus what its children pass up. Positive goes to the parent; negative is a top-up from the parent; an account that keeps its leftover holds its subtotal as the float. Settings won't allow a loop.
- Order: surplus transfers deepest first, then top-ups from the top down, then savings transfers.
- Step ids (used for ticks): `t:<from>><to>` and `s:<savingsId>`.
- Reconciliation: total floats = total in − total out. If not (say a bill points at a deleted account), the hero shows a warning and "Open accounts" (`#check`).
- On screen the words are plainer (float is "left over", budget month is "pay month", projected is "estimated"); code, data and exports keep the old names.

## Data
Everything is in WebView localStorage for the origin of `file:///android_asset/index.html`. **Don't change that URL** (for example to WebViewAssetLoader's https://appassets.androidplatform.net) without a migration: a different origin starts with empty storage.

- `payday.config.v1` (schema 5):
  - `people` {id, name, payAccount, usualPay}; `accounts` {id, name, colour, leftoverTo}.
  - `bills` {id, name, amount, account, months, renews?, lead?, note?, savings?, savingsSince?, category?, categoryAuto?, history?: [{on, date, from, to}]}.
  - `income`, `budgets`, `savings` {id, name, amount, fromAccount, since?} (`since`: the budget month Saved so far counts it from), `reminders`, `payday`, `doneLog`, `setupDone`, `example` (example household only).
  - Optional, defaults in `normCfg`: `appearance` {theme: system/light/dark, textSize: small/normal/large}, `notify` {on, time "HH:MM", amounts}, `lastVersion` (for What's new), `setupTips` (true shows "Finish setting up"; missing means off), `tourDone` (false until the tour has run; missing means seen). `normCfg` keeps those last two only when they say something, so an existing household's settings never change.
- Bill categories: housing, utilities, insurance, transport, children, health, subscriptions, memberships, debt, savings, other. A suggestion from the name has `categoryAuto: true` and follows renames; one the user picks (including "Not categorised", `""`) is never overridden. The Savings category and the savings tick are kept in step.
- `payday.months.v1`, per budget month: `pay` {personId: amount or null}, `payEstimated`? {personId: true} (that pay is the estimate filled in when a transfer was ticked before pay was typed; removed when the box is typed in; a month without it reads as before), `done` {stepId: amount when ticked}, `oneOffs` [{id, kind "out"/"in", name, amount, account, date?}], `results`, `updatedAt`.
- `payday.wealth.v1`: the old Wealth tab's data. Never used or changed; kept in every backup.
- `payday.errors.v1`: the last ten unexpected errors (never names or amounts), listed in "Copy app details". `payday.broken.v1`: one copy of data the recovery screen set aside; Settings › Backup can copy it out or remove it.
- `migrate(c, m, w)` runs on load and on restore; each step is idempotent.
  - 1.x data (schema 3 and older, `looksLegacy`) becomes editable people and accounts in the old built-in shape, keeping the account ids so bills need no change. Accounts get plain names ("Current account 1", "Current account 2", "Joint bills account", "Joint spending account"); people come from the data (`legacyPeople`: defaultPay's keys, then the months' pay fields; `nameFromKey`). Ticks are renamed, the overdraft becomes a one-off, mortgage deal ends move onto the mortgage bills.
  - Schema 4 → 5 suggests bill categories.
- `normCfg` and `normMonths` check settings and months item by item on open and restore: a payday day that isn't 1–31 or "last" counts as not set, bill months are whole numbers 1–12, non-object items are dropped, badly shaped ticks, pay and one-offs are fixed. Sound data passes through unchanged.
- Recovery screen: if saved data can't be read or opening it throws, "Dovetail couldn't open" replaces the app: restore an automatic backup, open a backup file, start again (two taps) or copy app details. The data is set aside first (if it can't be, nothing happens). Unreadable data is never treated as a new install.
- Saving: pay and one-offs 0.7 s after the last change, settings 0.6 s; at once when the app goes to the background.
- The page never saves over newer data: if storage changed underneath it (another copy of the page) it takes the newer data instead (on the `storage` event, on coming to the front and before every save).
- Android settings (SharedPreferences `payday`): `app_lock`, `theme` (applied to the window before the page loads), `notify_on`, `notify_schedule`, `notify_posted` ("date|key" already shown, kept 100 days).
- Android backup (`allowBackup=true`): only `files/backups/`, only when end-to-end encrypted (`backup_rules.xml` for Android 10–11, `data_extraction_rules.xml` for 12+). A fresh install that finds backups offers the newest in setup.

## Backups and restore
- Format (Copy backup, Share, automatic): `{"app":"payday-transfers","version":5,...}`, months copied as they are.
- A restore is tried on copies first (including the month to open on) and refused before anything is saved if it can't be opened. Pasted text over 2 MB, or from another app, is refused. Any earlier version restores through the same migration; newer versions are refused.
- A restore never replaces Wealth data already on the phone and never changes notification settings. A backup file opened from another app also keeps this phone's appearance (a pasted or automatic backup brings its own back).
- Just before anything replaces the data, the current data is kept as a backup (`-keep`, `keepCurrent`). For an opened file (Update, "Replace with this backup") and Start again, anything being typed is saved first and, if the kept backup fails, nothing changes ("Couldn't save a backup, so nothing was changed.").
- Automatic backups: `files/backups/backup-YYYYMMDD-HHMMSS.json`, 2.5 s after the last change (or on going to the background), skipped when nothing changed, never for the example or before setup. Kept: the 10 newest, the newest per day for 14 days, and `backup-…-keep.json` for 30 days (at most 5).

## Opening backup files (Android)
- `OpenFileActivity` (no screen) takes `ACTION_VIEW` for `application/json` and `text/plain` (some apps label .json as text) and `ACTION_SEND` for `application/json` only (`text/plain` would put Dovetail in every share menu). Payday backups open too.
- It reads only `content://` links, while it holds access (no storage permission), and refuses files over 2 MB or that aren't backups.
- Hand-over to MainActivity: a private file (new name each time, written before it appears, read once), with NEW_TASK | CLEAR_TOP | SINGLE_TOP so the open Dovetail receives it.
- Launch modes, on purpose: MainActivity keeps the normal mode, so tapping the icon never closes a file picker, permission prompt or share screen. Hand-over and notification intents are MAIN/LAUNCHER like the icon's, so they land in the same task; a second MainActivity started on top closes itself. Reopening from Recents (FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) is ignored.
- The page gets `paydayNativeEvent("import", text, true)` (or a reason with `false`), checks it again and shows what's in it; nothing changes until "Replace with this backup".
- "Import a backup file…" uses the system picker (`ACTION_OPEN_DOCUMENT`, Activity Result API) and the same path. It's a copy, not sync. Dovetail leaves itself out of its own share sheet.
- **Updates from the other phone.** A file whose settings share an account id with this phone's (`sameHousehold`; ids are random, so separate households never match) is this household brought up to date. On a set-up phone (not the example) it's the first notice on Pay (`#updateOffer`): "Update from this file?", when it was saved, **Update** or Cancel. If a month here was saved after the file (`changedSince`: its `updatedAt` is later than the file's `savedAt`) it warns and Update turns red. An open tour or sheet closes first. Update does the restore above, then shows "Updated". Other households, "Import a backup file…", the example and a new install get the full confirmation. One way: the receiving phone's changes are replaced.

## The Pay tab
- From the top: month bar; at most one notice (`#notice`, `renderNotice`: an update file, a restore offer, What's new, or the example banner / "Finish setting up"); the hero; the reminders nudge (`#actionBanner`); take-home pay; the transfers with "N of M done" and **Share** (`#shareTransfers`); a line when non-monthly bills are due (`#nmNote`); **This month in detail** (`#payDetails`: Not every month, one-offs, each account's figures, totals); Bills by account.
- This month in detail is closed, but opens by itself in a month with one-offs, until opened or closed by hand (kept for the session: `payDetailsOpen`, not saved). A one-off's link and Reminders' "Open <month>" open it; the tour opens it and puts it back.
- **Share**: `transfersText(c, k, r, done, payInfo)` in `export.js`: each transfer in order with ☑ or ☐, "(top-up)", what's still to send if it changed since ticking, what's left over, and a line when pay is estimated. Sent with `shareText`; in a browser, the browser's sharing or the clipboard.
- **Update file**: in the app with a household set up (not the example), Share asks first ("Share this month", `openShareChoice`): "Send the transfers as a message" (the text above) or "Send an update for the other phone" (`shareUpdateFile`): the whole backup (`shareUpdate`) as `Dovetail-update-20-Oct-2026.json` (`updateFileName`, today's date), with the transfers as its message too (`updateText`; an email keeps it, but WhatsApp drops a message sent with a file, which is why it's a choice). Pending changes are saved first (`savePending`). If the file can't be prepared (over 2 MB, or can't be written) it says "Couldn't prepare the update file." The example household and a browser send the text straight away.
- **Ticking before pay is typed** fills empty pay boxes with the estimate and marks them in `payEstimated`.
- **Remind me** (`defaultLead`): when a renewal date is first set with no choice made, a week for a monthly subscription or membership, otherwise a month. A stored choice never changes.

## Analysis tab
Derived only: nothing new is asked for, and it can't see actual spending, so it judges the plan. Each chart has a key and a "Show the figures" table.
- **Month by month**: the float for 12 budget months (3 before the one on screen, that month, 8 after); a banner only when a month is short or there's no pay. `monthExtras` lists non-monthly bills and one-offs.
  - Typed pay (`payIsTyped`, not in `payEstimated`) makes a month actual: solid, with a line at its predicted float (each person's latest earlier typed pay, or usual pay). Others are estimated and hatched. Estimated pay is left out of averages, history and the predicted line.
- **The monthly picture**: savings rate, and income split into bills, budgets, savings and average left over. The average month spreads non-monthly bills over 12 months and uses each person's average over their last 6 typed months (or usual pay). Savings rate = (savings transfers + bills marked as savings) ÷ income.
- **Where the money goes**: bills by category. Bills marked as savings are bills here but saving in the monthly picture. This and Month by month hide until there are bills, budgets or savings.
- **Pay and what was left** (once two months have typed pay), **Saved so far** (ticked transfers and savings bills), **Price changes** (from bill `history`; hidden until there is one), **Accounts that ran short** (top-ups; hidden when none). These use months with typed pay or a tick.
- Charts are inline SVG (no libraries); keyboard readings go to a live region. Colours: `--viz-1`…`--viz-8`, separate light and dark.

## Reminders tab
On the same month as Pay and Analysis.
- **Needs attention**: overdue and due soon, from today, whatever the month. Drives the tab badge and the Pay nudge.
- **In <month>**: renewals, reminders and dated one-offs in the budget month's window (`monthWindow(pc, k)`): from its payday to the day before the next, or the calendar month with no payday. One-offs go by date, whichever month holds them; past ones show as passed, not overdue. An item also in Needs attention is one line with no buttons, keeping its `rem_m_` id. `remindersInMonth(c, months, k, today)` in `analysis.js`.
- **All upcoming** (collapsed), **Recently done**, **Add your own** (starts on the window's first day if the month is ahead, else 30 days from today).
- Notifications and the badge are about today, not the month on screen. The month bar's h1 is the page's only h1.

## Changing month
- The ‹ › arrows and a sideways swipe move one month (`stepMonth` → `goMonth`), wherever the month bar shows (Pay, Analysis, Reminders). Tabs change only by the tab bar and Back.
- **Choosing a month**: the month name (`#monthPick`) opens "Choose a month" (`openMonthPicker`) in the sheet: two wheels (`wheel()`), month and year, each a listbox that scrolls and snaps to the middle band. Years from last year (or the earliest saved month, 30 years back at most) to two years ahead, always including the month on screen (`pickerYears` in `calc.js`). Options are at least 44px tall. A tap or a scroll by finger, mouse or wheel picks (not a screen reader moving through the options); arrow keys, Page Up/Down and Home/End move a wheel; Enter, Space or "Show <month>" goes there; "This month" when another month is on screen. Back, Esc and Close change nothing; focus returns to the month name.
- Swipes need at least 70px sideways with under half that vertically, starting over 24px from either edge (Android's back gesture). Ignored on charts, sideways-scrolling tables, form fields and `data-noswipe`. Passive listeners.
- Changing month saves anything typed first. An open one-off closes (saved to its month); a new one being typed stays open. On Reminders open editors keep what's typed; a pending delete is cancelled.

## Setup, the checklist and Start again
- **Setup** (`#tab-setup`, no tab or month bar): on a new install, after "Set up my own household" in the example (two taps), and after Start again. Seven steps: welcome (set up, restore, or explore the example), pay, payday, accounts (four starting points from `setupShape`, then `flowDiagram`), bills (`billMonths`; default account from `sharedPayAccount` / `defaultBillAccount`, also used by Quick add), budgets and savings, first payday (`nextPayday`, worked out with the real calculation). Accounts from a starting point keep their ids when it's refilled. Back keeps what's typed; nothing is saved until setup finishes.
- **Finishing** (`setupResult`, `finishSetup`): "Looks right, start", "Finish later" or "Skip setup for now". Keeps what was entered; with nobody, one person "You"; with no accounts, one "Current account" that keeps what's left; incomplete rows are dropped with a message. Saves `setupDone`, `setupTips: true`, `tourDone: false`, `lastVersion`, keeps appearance and notification settings, backs up, starts the tour. Savings start (`since`) in the previewed month after "Looks right, start", otherwise `defaultMonth`.
- **Finish setting up** (`#setupTips`): `setupChecklist(cfg, months)` in `calc.js` (pay, payday, bills, budgets or savings). When all done or hidden, `setupTips` is removed for good. A restore brings back what the backup had.
- **Start again** (end of Settings › Backup; app only; not the example; two taps): saves, keeps a backup (`keepBackup`; if that fails nothing changes), clears the reminder schedule and the months, cuts settings to `{schema, appearance, notify}` (no `setupDone`; `payday.wealth.v1` untouched), and setup offers the backup back. App lock, notifications and appearance stay. Any settings without `setupDone` open setup.

## Help, the tour and hints
- **"?"** by Saved so far opens a sheet from the `HELP` map in `ui.js`. The sheet (`#sheet`) is a modal dialog: focus trapped; Esc, Close, a tap outside and Back close it (one history entry); focus returns to the "?"; the rest is `inert`.
- **Settings › Help** (`#sHelp`): "Show me around" (`#tourStart`), "How Dovetail works", "Words Dovetail uses".
- **The tour** (`TOUR`): once after setup (`tourDone` false), and from Help or the example banner; never after an update or restore. Stops on the Pay tab's parts, then the Analysis, Reminders and Settings tabs; missing elements are skipped. The card is a modal dialog. Esc, Skip tour and Back end it. It keeps one history entry that moves with it (`goTab` replaces it), so Back ends it on any tab; ending otherwise removes it (`tourUnwind`). Ending removes `tourDone` and saves.
- **First-month hint** above the transfers until a month is fully ticked, or another month has a tick or typed pay (`firstMonthDone(months, k)`; nothing stored).

## Look and feel
- Tokens in `web/template.html`, light and dark: `--bg`, `--surface`, `--sunk`, `--hair`, `--line`, `--ctl`, `--ring`, `--shadow`, `--r`, `--r-in`.
- `moneyEl()` shows smaller pence (textContent unchanged). `avatar()` badges get initials from CSS (`data-i`, `::before`), so screen readers and tests never see them. `renderHero` draws the hero.
- `animatePanel()` fades on tab change and slides on month change; `rollHero()` rolls the float; no animation under reduced motion. Ticking calls `haptic("tick" | "untick" | "done")` (no permission).
- Appearance: theme sets `data-theme` on `<html>`; text size sets `data-text` (root font size 0.9 / 1 / 1.15; all font sizes in rem). `setTheme` tells the app, which applies it to the window, lock screen and system bar icons on every start. Android's night mode isn't switched (it would restart the screen), so the splash follows the phone.

## Exports
Settings › Backup, export & restore, using the app's own functions; in a browser the files download.
- "Share for analysis" (`exportMarkdown`): `dovetail-analysis-<date>.md`, a preface explaining the model, then the household, bills, saved months, Analysis figures and app version. "Copy report" copies it.
- "Share spreadsheet (CSV)" (`exportCsv`): `dovetail-bills-<date>.csv` and `dovetail-months-<date>.csv` (`ACTION_SEND_MULTIPLE`). Text a spreadsheet would read as a formula gets a leading apostrophe.

## Reminder notifications
- Off until switched on (app only), which asks for `POST_NOTIFICATIONS` (Android 13+); if refused, the switch stays off.
- `notificationSchedule(c, months, today)`, next 90 days: "Payday tomorrow", each renewal and reminder when due soon and on the day, each dated one-off the day before. Amounts only with "Show amounts in notifications".
- The page sends it (`setNotificationSchedule`) 2 s after any change and on every start. Time 06:00–22:00.
- A daily WorkManager job (inexact; no exact alarms) runs from the chosen time, and each run books a one-off run for the next chosen time, as the daily job drifts: a run over an hour early books today's and posts nothing; otherwise it posts today's unposted entries and books tomorrow's. Switching on or changing the time after today's time posts today's at once.
- If Android only runs the check the next day, missed entries go out in a "late" wording ("Payday today", "Yesterday, …"); never from before notifications were on.
- One channel, "Reminders". Tapping opens Reminders. WorkManager reschedules after a restart.

## For testers
- Settings › About: "What changed", "Copy app details" (version, data version, Android/WebView, screen size, counts; never names or amounts) and "Send feedback" (also on the recovery screen).
- Send feedback (`feedbackMail` in `export.js`) opens the email app to dovetail.feedback@gmail.com with the app details; through the bridge in the app, a `mailto:` link in a browser.
- The app names nobody; the copyright line is only in this README.

## Bridge (`window.PaydayNative`)
- `saveBackup(json)`, `keepBackup(json)`, `listBackups()`, `readBackup(name)`.
- `share(json, fileName)` (backups only), `shareFiles(json)` (exports: one or two text files), `shareText(text, title)`, `shareUpdate(json, fileName, text, title)` (a backup file with the transfers as message), `sendFeedback(subject, body)` (to `FEEDBACK_EMAIL` in `MainActivity.kt` and `export.js`). Text at most 20,000 characters.
- `pickBackupFile()`, `lockAvailable()`, `lockEnabled()`, `setLockEnabled(on)`, `setTheme(theme)`, `haptic(kind)`, `setNotificationsEnabled(on)`, `notificationsEnabled()`, `notificationsAllowed()`, `setNotificationSchedule(json)`.
- Results come back through `window.paydayNativeEvent(type, value, ok)`: `"lock"`, `"notify"`, `"import"` (a backup's text, or a reason) and `"open"` (`"due"`, from a notification).
- Absent in a browser, where the page works without it. Only the bundled page can load.

## Permissions
- `USE_BIOMETRIC`: the optional app lock (no prompt).
- `POST_NOTIFICATIONS`: asked only when notifications are switched on.
- `RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK`: added by WorkManager so the daily check survives a restart. Its `ACCESS_NETWORK_STATE` and `FOREGROUND_SERVICE` are removed in the manifest.
- `uk.whiteboard.payday.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`: added by AndroidX Core, app-private.
- No INTERNET, network state, storage, camera, contacts or exact alarms. Files use content links and the system picker. `build.sh` fails if INTERNET ever appears.

## Licence
Copyright (C) 2026 Marcus White.

Dovetail is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version (`GPL-3.0-or-later`). It is distributed in the hope that it will be useful, but without any warranty; see `LICENSE` for the full text. The bundled fonts, Figtree and Bricolage Grotesque, are under the SIL Open Font License (`web/fonts/OFL-*.txt`).
