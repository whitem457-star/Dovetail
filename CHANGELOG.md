# Changelog

## 2.18 (versionCode 29)
A new welcome screen, setup's first step (`docs/welcome.md`, agreed by the owner on 22 October 2026). Nothing else
changes: no figures, data, calculation or permissions; later setup steps change only their step numbers; the golden
tests are unchanged.
- **The welcome sells the idea at a glance**: the mark and "Dovetail" in a small brand line, the headline "Payday,
  without the guesswork", one line ("Every bill, the account it leaves from, and the transfers to cover them, all in one
  place."), and a picture of a finished payday: a card in the Pay tab's style with £3,000 pay, three numbered transfers
  to a Bills account, an Everyday account and Savings with each account's bills ticked under its transfer, and "£500
  left over, yours to spend" with "All 7 bills covered". It's captioned "An example. If pay won't stretch, Dovetail says
  which account will be short." The figures are made up, add up, and are worked out from one constant
  (`WELCOME_EXAMPLE`); words and amounts are text, so they grow with larger text, and screen readers hear one sentence.
- **A trust line** above the buttons: Any bank · No bank login · No internet. The three ways in and "Skip setup for
  now" are unchanged, with a note under them: "About five minutes to set up, and you can change anything later. A rough
  figure is fine for bills."
- **Someone arriving with figures** (an opened backup or update file, an automatic backup, Start again) sees the offer
  straight under the headline with no picture, so the card and the buttons come first. "Start fresh" brings the picture
  back and puts focus on the headline.
- **Setup counts six steps from pay**: the welcome has no step counter, pay is "Step 1 of 6" and the first payday "Step 6
  of 6"; the pay step's other income card says "in step 3". Code, tests and the simulation keep the internal numbers 1–7.
  "Change how you manage your money" still says "Step 1 of 2".
- **Cancel** on an opened backup file in setup now puts focus on the headline too (the button that had it is gone).
- What's new: one line, saying the first screen is new and nothing changes in your figures. (The plan had none, since
  households already set up never see the welcome; but someone updating from an older version would then have seen
  "What's new in 2.18" with nothing for 2.18.)
- Tests: a new `qa_welcome.mjs` (88 checks: the picture and its figures, the screen-reader sentence, the trust line, the
  step counter forward and back, change mode, every way of arriving with figures, the fold at 360×640, 320px with larger
  text, axe and the card's edge in light, dark and each forced theme); `qa_setup.mjs` and `qa_mark.mjs` for the new
  title, counter and brand line; `qa_v27.mjs` and `qa_fixes.mjs` for 2.18's What's new line.

## 2.17 (versionCode 28)
Counting paydays: layer 2 of pay patterns (`docs/payperiods.md` 5.4–5.6, built now at the owner's decision of 22 October
2026 rather than waiting for evidence; the engineering decisions are section 13.2). Nothing changes for a household
without a payday date: monthly households match 2.15's own figures (400 in the simulation) and households on a pattern
without a date match 2.16.1's (300), the golden tests are unchanged, and the schema stays 5.
- **A recent payday, optional, for someone on a pattern**: setup's pay step ("A recent payday (optional)") and
  Settings › People, with "Next payday: Fri 22 Jan, then every week." under it. Adding, correcting or removing it isn't
  a change of pay, and never moves a month already typed.
- **Counting**: Dovetail counts each dated person's paydays between one transfer day and the next, moving a payday on a
  weekend or an England and Wales bank holiday to the working day before (2.16.1's rule, the same as the transfer day).
  The Pay tab's hint lists them ("4 paydays since Fri 30 Oct: 6, 13, 20 and 27 Nov (2 still to come)").
- **An extra payday opens by itself**: with one more payday than usual, the extra payday line opens once pay is typed,
  with an average pay set aside; the amount follows the typed pay until you change it. "Not an extra payday" corrects a
  count that's too high, and "Had an extra payday?" stays for a count that's too low (a holiday Dovetail doesn't know).
- **Fewer paydays than usual** (a new job, or a payday moved across the transfer day): a line says so, and the transfers
  use what arrived. After a month whose extra was set aside, "Use it this month" adds it as a one-off, and the earlier
  month's line is locked ("Used in May 2027.") until the one-off is removed.
- **The count is frozen when a month is first typed or ticked**, with the amount set aside, so no later change to the
  transfer day, a payday date or the holiday rule moves a saved month, and a phone on 2.16 shows the same figures.
  An extra payday already there when a month is counted (one you opened with "Had an extra payday?") stays yours:
  it's never rewritten, and changing how often someone's paid never clears it (L22).
- **A new job**: the change sheet's "When's the first pay on the new pattern?" counts from that pay; if it's for a later
  month, the sheet says when to make the change.
- **Analysis** measures average pay per payday from the months typed ("about £1,837.62 a month: an average of £424.07 a
  payday over 6 months"), and Month by month shows extra paydays ahead. Exports say "not an extra payday" and add a
  preface sentence for a household with a date.
- What's new: two lines.
- Data: schema 5. New optional `people[].pattern.on` and `.since`, `months[k].paydays` {personId: 0–6},
  `extra[id].edited`, and a one-off's `extraFrom`/`extraOf`. A file with a payday date, or with an extra payday used in a
  later month, is version 6 and needs 2.17 (`PAYDAY_DATE_NEEDS`).
- An update test from the real 2.16.1 release. The simulation gained an independent payday counter and the freeze's
  oracle (`sim/paydays.mjs`): every typed or ticked month is unchanged after 14 kinds of settings edit; `sim/patterns.mjs`
  holds 2.16.1's figures for households on a pattern without a date.

## 2.16.1 (versionCode 27)
Bank holidays (`docs/payperiods.md` section 10, item 1, approved by the owner on 22 October 2026; the engineering
decisions are section 13.1). Transfers, shares, left over and files don't change: the golden tests are unchanged, the
simulation checks 400 monthly households against 2.15's own figures, and a unit test checks every month's transfers are
the same under every payday setting.
- **England and Wales bank holidays, by rule** (`bankHolidaysEW`, no table to maintain): New Year's Day, Good Friday,
  Easter Monday, the early May, spring and summer bank holidays, Christmas Day and Boxing Day, with substitute days.
  They match gov.uk's published dates for 2019–2028 apart from one-off holidays (VE Day 2020, the 2022 Jubilee and
  state funeral, the 2023 coronation), which a rule can't know; nor does it know Scotland's or Northern Ireland's.
- **A payday or transfer day on one moves to the working day before** (`workingDayOnOrBefore`), wherever a weekend
  moves it: "Last working day", and a day with "If it falls on a weekend…" ticked. An unticked day never moves.
- **What that changes for an existing household: dates only.** The month the app opens on, the Pay line, "Payday
  tomorrow", the Reminders window, and, once from 2019 to 2035, which tax year a month's savings count in: a payday on
  the 6th (moved for weekends) in April 2026 (Easter Monday) is now Thursday 2 April, so April 2026's savings count in 2025–26. What's new
  says so (D11).
- **Words:** the checkbox reads "If it falls on a weekend or bank holiday, we're paid the working day before" (or "do it
  on the working day before" for a transfer day); Settings › Payday says it knows England and Wales bank holidays, not
  Scotland's, Northern Ireland's or one-off ones (with and without a pay pattern); the export says "the working day
  before if it falls on a weekend or an England and Wales bank holiday".
- What's new: three lines. Data: unchanged (schema 5; no new fields; files are as they were).
- An update test from the real 2.16 release (`RELEASE['2.16']`), and an independent check in the simulation
  (`sim/holidays.mjs`: its own Easter and holiday rule and a brute-force step back, over every setting and month
  1990–2100).

## 2.16 (versionCode 26)
Pay patterns: people paid weekly, every two weeks or every four weeks (`docs/payperiods.md` 5.3 and 11.2, adopted by
the owner on 22 October 2026). The routine stays once a month. Nothing changes for a household that doesn't choose a
pattern: monthly households' settings, months, transfers, exports, notifications and files are byte-identical (the
simulation checks 400 against 2.15's own figures), the golden tests are unchanged, and the schema stays 5.
- **How often they're paid**: setup's pay step and Settings › People ask it for each person (every month by default).
  For a pattern, the pay asked for is the take-home pay each time, with "About £1,690.00 a month over a year."
- **The transfer day**: in a household with a pattern, the payday setting is called the transfer day everywhere
  (`dayWord`), and it's required. Monthly households keep "payday".
- **What the transfers plan on** (`planPay`, one figure for the Pay tab, setup's preview, Analysis's months ahead and
  a change of style): someone on a pattern types everything that's arrived since the last transfer day; until then
  the plan is their pay each time × the paydays every month has (4, 2 or 1), never an earlier month's total.
- **An extra payday**: once their pay is typed, "Had an extra payday?" sets one pay aside, left in their account and
  out of the transfers, unless "Count it this month". Set aside never moves a share; counted moves shares only when
  you share what's left after your own bills or so you each keep the same, and a percentage of pay. If transfers are
  already ticked it starts counted, and setting it aside takes two taps with a warning.
- **A ticked transfer that went down** now says how much to move back, for every household: "…, £64.80 less. Move
  £64.80 back to Current account, or untick and tick again once it's right."
- **Standing orders from each pay**: for each share, top-up or savings transfer out of an account only that person
  is paid into, the amount that covers every month (the largest over the next year ÷ 4, 2 or 1, rounded up), listed in
  Settings › People and shown on the Pay tab in the first month and when it goes up. A pay account that passes
  everything on says why there's no figure. One person on a pattern who picks setup's pay, bills and spending accounts
  gets Bills topped up from the pay account, so a standing order shows (E17, `docs/payperiods/decision12.md`).
- **Changing pattern** with saved months applies from the pay month the app opens on, like usual pay in 2.15, and
  asks for a transfer day if there isn't one; an edit to pay each time is dated too.
- **Shares in proportion to pay** use pay over a year ÷ 12 for someone on a pattern, so an extra payday never moves them.
- Analysis, exports (a pay cell, extra paydays, two CSV columns, the preface), notifications ("Transfer day
  tomorrow"; the Android channel description) and Help (one text for everyone: Words, How Dovetail works, the tour)
  follow. Universal Credit stays a person's pay typed from the statement.
- The product's definition now reads "Pay can come monthly, every four weeks, every two weeks or weekly; the
  transfers are made once a month." (README, CLAUDE.md, the stock take).
- What's new: three lines.
- Data: schema 5. New optional `people[].pattern` {every: 7, 14 or 28, each}, with `usualPay` worked out from it
  (each × 52, 26 or 13 ÷ 12), dated through `was`; new optional `months[k].extra` {personId: {amount, counted?}}. A file
  with a pattern is version 6 and needs 2.16 (`PATTERN_NEEDS`), so a 2.15 phone says "This file needs Dovetail 2.16 or
  later".
- Built by an engineering team: a core engineer, a screens engineer, and a test and simulation engineer whose oracle
  was written from the design alone, with a fresh reviewer before and after.
- Tests: `unit/v216.test.mjs`; a new page suite `qa_patterns.mjs`; the household simulation gains patterns throughout
  (an independent oracle for the pay used, the share rules, standing orders and the notice), dated pattern changes in
  the history part, `monthly.mjs` (400 monthly households exactly as 2.15 had them) and setup's screens with patterns
  in `sim:ui`; a real 2.15 → 2.16 update test (`RELEASE['2.15']`, from `66d192d`).

## 2.15 (versionCode 25)
Dated pay, the first release of pay periods (`docs/payperiods.md` 5.2 and 11.1, adopted by the owner on 22 October
2026). A fix for every household: changing someone's usual pay used to rewrite every earlier month that read it (the
"in proportion to pay" shares and the estimate of months with no typed pay), so a month already ticked could show a
difference to send. No household's figures change until its usual pay is edited; the golden tests are unchanged.
- **Usual pay is dated like a bill**: with months saved before the pay month the app opens on, editing someone's usual
  pay in Settings › People applies from that month, and earlier months keep what it was. The line under it says
  "Changed from November 2026. Earlier months keep £2,300.00." ("…keep no usual pay." for someone added with none), with
  "Change earlier months too". Without saved months, an edit changes every month, as before. Removing a person, their
  pay account and board are still undated, as before.
- **Setup's pay step** says what to do if you're paid weekly, every two weeks or every four weeks (make the payday the
  day you'll do the transfers, and type the pay that's arrived since the last one), and that Universal Credit is
  counted as the pay of the person it's paid to, typed from the statement each month.
- Analysis's predicted line for a past month now asks whether that month had a pay to predict from, not whether the
  person has a usual pay today (the same answer for every household without dated pay).
- What's new: one line.
- Data: schema 5. New optional `people[].was` [{until, usualPay}], its own dating (`hasPersonDated`, `personAt`,
  `personSnap`, `datePersonEdit`; people aren't in `ITEM_DATED`, whose checks would overwrite it), read by `cfgFor` and
  by `payEstimate`'s usual-pay fallback, so callers that pass the settings as they are still get the month's figure.
  `normCfg` keeps an entry only with a valid month and an amount of £0 or more, sorted, one per month, and reports the
  rest. A file with dated pay is version 6 and needs 2.15 (`DATED_PAY_NEEDS`; `backupNeedsFor` gives the highest that
  applies), so a 2.14.1 phone says "This file needs Dovetail 2.15 or later"; every other household's files are as before.
- Built by an engineering team (a core engineer, a screens engineer and a test and simulation engineer, with a fresh
  reviewer before the build and after it) from `docs/payperiods.md`; the readiness review's answers are its section 11.
- Tests: `unit/datedpay.test.mjs` (every function, `normCfg`'s reports, backups and needs, and the history fix: a
  ticked month's shares in proportion to pay kept after a dated edit, and moved by an undated one, to show the test
  bites); a new page suite `qa_datedpay.mjs` (the line, "Change earlier months too", a ticked earlier month unchanged
  through an edit and a reload, the current month's "changed" line, the update file's version and needs, the setup
  wording, axe, dark, 360px, larger text and focus); the household simulation's history part gains dated usual pay
  (random edits, repeats in a month and edits back, every earlier month's transfers and pay unchanged, checked
  against an independent list of the edits and the oracle); a real 2.14.1 → 2.15 update test (`RELEASE['2.14.1']`,
  from `afcbf61`).

## 2.14.1 (versionCode 24)
Wording only (the owner, 22 October 2026). No household's figures change: the golden tests are unchanged and the
simulation's figures are the same.
- **Board is explained where you first meet it**: setup's "Everyone in the household" and the hint under Settings ›
  People's "Pays board" now start "Board is a set amount each month towards the household, as a grown-up child living
  at home might pay." (`BOARD_IS` in `ui.js`, so the two can't drift apart), and "Words Dovetail uses" reads "Money
  someone living with you, like a grown-up child at home, pays towards the household each month. It's also called keep." Board is the usual UK word, but not everyone knows it; "keep" is what it's
  called in much of the north and Scotland.
- What's new: one line.
- An independent review found, and this fixes: a page suite whose household was pinned to 2.14 (it now reads the
  version from the built page), and wording where "(also called keep)" seemed to name the grown-up child.
- Tests: checks for the new wording in `qa_money`, `qa_fixes` and `qa_figure`; a real 2.14 → 2.14.1 update test
  (`RELEASE['2.14']`, from `45fab3a`), with a household that has shares and a rough figure keeping its transfers, its
  "not listed yet" line and a backup that still needs 2.14.

## 2.14 (versionCode 23)
Onboarding, from `docs/onboarding.md` (agreed by the owner on 21 October 2026): setting up no longer needs every direct debit typed before Dovetail can help. Built as three waves (the calculation and data, the paste reader and the simulation's independent oracle in parallel; then the screens; then an independent review), each tested on its own and then together. The owner's household has no rough figure and gets exactly the transfers, Analysis figures and exports it had (every saved and future month compared with 2.13; the golden tests unchanged). Dovetail is for a wide audience (the owner, 21 October 2026): people new to managing money are one group among several, so setup and Help suit confident households too.
- **A rough figure for an account's bills**: in setup's bills step, "Not sure of every bill? Start with a rough figure" (or the link in any account's section) asks "Roughly how much goes out of Joint in bills each month?", counting what leaves by itself, Council Tax as monthly, and leaving out bills that come only a few times a year; "No bills from here" is one tap; "Already move a set amount into Joint each month?" checks the figure against it and asks once if the figure is well below ("Is the other £200 for bills too?"); round up if unsure. Then add the big ones if you know them. The figure is money out of the account: *not listed yet* = the figure less the account's listed bills that come 7 or more months a year (never below £0), whatever month it is, and the listed bills due that month count on top; so listing a monthly bill within the figure changes no transfer in any month, a Council Tax over 10 months lowers the months it skips, and yearly or quarterly bills always sit on top. Someone's own account under "what's left after own bills" or "so we each keep the same" isn't offered a figure (a generous guess would shift cost to their partner; setup says why), nor is a boarder's. `estimates`, `estimateParts`, `setEstimate`, `endEstimates`, `estimateBlock` in `calc.js`.
- **Living with the figure**: the Pay tab says "Includes £380 of bills not listed yet." under the transfer into the account, the account's card in This month in detail has the row, Bills by account and Settings › Bills show "£1,120 listed · £380 not listed yet (your figure £1,500)" with a progress bar and **Change the figure** and **That's all of them**, the "Finish setting up" checklist says "List Joint's bills (£380 to go)", setup's preview says what's included, Analysis's monthly picture and Month by month count it as bills and "Where the money goes" shows "Not listed yet" as its own bar after the categories, and the exports list each figure (the months spreadsheet gains a `bills_not_listed` column only for households with one). When the listed bills pass the figure Dovetail asks once "Is that all of them?" ("There are more" sets the figure to the next £50 above, shown with Change); "That's all of them" ends the figure from this pay month, with Undo and the good news when it lowers a transfer ("Alex's share goes down by £100 a month"); deleting a 7-plus-month bill offers "Lower Joint's figure by £30 too?"; a price rise absorbed by the figure says so; a quiet Settings line says a figure may be low if the account ran short. Changes to a figure are dated like bills once there are earlier months, so those months keep what they had. No notifications, nothing on the top card.
- **Paste a list** (`parseBillLines` in `calc.js`), in setup and Settings › Bills: one bill per line from copied spreadsheet cells, "Netflix £9.49" or "Netflix, 9.49"; amounts with £, commas or brackets; monthly, yearly (asks the month when none is named), quarterly and Council Tax; DD/SO marks, dates and references stripped; a third column naming the account or month; header and total lines ignored; lines with two amounts, no amount or no name shown as they were pasted; duplicates of bills already there left unticked; amounts over £5,000 flagged. The rows are checked before anything is added, as Quick add's are.
- **Setup's bills step**: a running total per account ("Joint: 14 bills, £1,642.30 a month"); "Any bills that don't come every month?" at the end, with its own chips (car insurance, TV Licence, home insurance, breakdown and boiler cover, yearly subscriptions, service charge, quarterly water); the common bills grouped (about 25: home, phones, transport, children, debt, subscriptions, insurance, each with its usual frequency; the most common shown, a group opens with a tap); each own account's bills a tap away with its own chips (the simulation's households each needed about two extra taps to reach them); help behind "How do I find my bills?". A household that lists every bill takes no more taps than before (the simulation's listed households: none up, 13 down).
- **Budgets and savings by account**: setup's step 6 is drawn by account, as the bills step is, so the account comes from where you type rather than a select, with a spending-money chip for each person in households that pay into a joint account or where one person pays the bills (the simulation had 125 items starting in the wrong account).
- Words and help: "Rough figure (bills)" in "Words Dovetail uses"; one line in "How Dovetail works". What's new: three lines; no existing household's figures change, and the lines say so.
- An independent review of this release found, and it fixes before shipping: an account whose only use was a rough figure counted as unused, so closing it by a change of style left the figure on the closed account for good and Delete account moved it to the first other account without asking (both now ask where the figure goes); "Lower it" after deleting a bill left the figure lowered when the delete was undone (one Undo now puts back both); the paste reader read "13.25 March" as £13 and a month with no frequency word as part of the name; the delete offer and "Is that all of them?" weren't read out by screen readers; a boarder's own account was given the wrong reason for having no figure; and a few words.
- Data: schema 5. New optional list `estimates` [{id, account, amount}], dated like bills, budgets, savings and income (`was`, `start`, `ended.estimates`), moved with its account by a change of style, kept by `normCfg` only when usable ("a rough figure that couldn't be used" otherwise) and stored only when there is one, so every existing household's settings are byte-identical. A backup or update file with a figure (live or ended) is version 6 and needs 2.14 (`backupNeedsFor`); a 2.13 phone refuses it with "This file needs Dovetail 2.14 or later. Update the app first."; files from households with no figure are exactly as 2.13 wrote them. The backup kept on the first open of a new version says the right `needs` too. No permission changes, no new dependencies.
- Tests: `unit/v214.test.mjs` (the design's worked example, properties over 300 seeded households, `normCfg`, backups, the dated machinery, a change of style moving a figure, every helper, the checklist, `setupSettings`, Analysis and the exports, and the 36-month comparison with 2.13's own figures from `fixtures/sample36-2.13-calc.json`), `unit/paste.test.mjs`, `unit/sim-oracle.test.mjs`; the household simulation gained figure households (a figure of 0.7 to 1.3 times the truth with only the biggest bills listed, and one raised to what the household moves in) checked against an oracle written from the design alone, in `npm run sim`, `sim:full` and the history layer (bills listed over the year, the figure raised, ended, a bill deleted with the figure lowered or kept, each undone), and `sim:ui` types figure households through the real screens; `qa_figure.mjs` (the 25th page suite); and a real 2.13 → 2.14 update test (`RELEASE['2.13']`, from `7cc9964`), which also checks that 2.13 refuses a file with a figure.

## 2.13 (versionCode 22)
The first release of the phase that followed the 2.12.1 stock take (`docs/stocktake/2.12.1-stocktake.md`, 21 October 2026; the owner adopted its product definition and chose this release's scope and decisions the same day). The aim: one coherent app that does the job for every household in the definition, before any Google Play or tester work. Built as seven tracks, each independently tested, then merged and reviewed. The owner's household (pooled, nothing dated) gives identical transfers, Analysis figures and exports (every saved and projected month compared; the golden tests unchanged).
- **Changing how you manage your money keeps your accounts**: each answer is matched against the household's own accounts (a pure matcher in `calc.js`), so a joint spending account dropped by one answer comes back with the next, whatever order the answers come in, and a household with joint bills and joint spending starts on "separate joint accounts". Before, changing a household with those two accounts to "each paying into a joint account" closed its spending account, opened an empty twin and moved the spending budgets into the bills account; now nothing closes and nothing moves.
- **One meaning of "short" everywhere**: a month is short when any account that keeps what's left ends it below zero, as the Pay tab already said (`shortAccounts`, `isShort` in `calc.js`; `personKeeps` moved there). Analysis's Month by month, its readings, figures and description, Pay and what was left and the monthly picture now name the account ("October 2026: Sam's account short by £100.00") instead of showing a healthy total. "Accounts that ran short" also lists an account that ended a month short, a top-up that couldn't be made and one made only in part, each explained. Setup's last step names a short account under the total, in the Pay tab's words, before "Looks right, start". With amounts shown, the payday notification names a short account too ("Expected left over £2,200.00; Sam's account is short by £100.00").
- **Top-ups only from money that's there, for every household** (the owner's decision; 2.12.1 did this for households with shares only): a top-up sends what the account sending it has by then, and the rest is shown as that account's shortfall, so no transfer is ever listed from an empty account. Months where the money is there are unchanged; the owner's months all are. When the account that keeps what's left had nothing to send, the Pay tab's top card says where the left over is ("in Spending") rather than "across 1 account", and Analysis doesn't count the top-up's shortfall as a second account short in the average month or as the month "ended short".
- **Setup asks only what makes a difference**: with one earner among those sharing, "How do you split the shared costs?" isn't asked (the earner pays what the joint account needs); the worked example matches the diagram (no invented "£20 of bills"; an account that pays a share and an allowance says so); equal shares beside someone paying board read "half each" rather than 41%, percentages are of what the sharers pay between them, and board is called board everywhere; a boarder no longer brings up "you'll see two left-over amounts"; "Are you both paid on the same day?" for two; someone with no pay of their own is no longer told their pay "isn't in yet"; one line says Dovetail works with monthly pay, in pounds.
- **"All transfers done" means done**: when a transfer was ticked before its amount changed, the banner, the ring's word and the phone's "done" tap wait until the difference is sent, and a line says how much is still to send ("N of M done" still counts ticks).
- **An empty reminder isn't kept**: a new reminder closed without any change is removed.
- **Keyboard and screen readers**: Enter on a bill opens its editor with focus inside and Escape closes it; after deleting a bill, income, budget, savings transfer or reminder, focus goes to the next one; Reminders' buttons say which item they're for. "Paid for by" says who's ticked as you tick them, and the "pay twice" warning names everyone it applies to.
- **Share for analysis understands shares and board**: the report opens with what Dovetail is (the adopted definition), explains Paid for by, board and "short", lists who pays into what, and each saved month shows its shares and any short account; the spreadsheet's months file adds what each person paid in and any short account for households that have them. The report and the Share message word shares and board as the Pay tab does ("Alex's share, half each", "Kit's board"), and the report explains "short" and the top-up limit whenever something in it is short. A pooled household with nothing short gets the report as before apart from the opening description.
- **Backup and update files say which version they need** (the owner's decision): a file from a household with shares, board, a closed account, a change of style or items changed from a month is version 6 and says it needs 2.13, so a phone on 2.11 to 2.12.1 refuses it with "Update the app first" instead of showing different figures; every other household's files stay version 5 and open on any version. A file that needs a later Dovetail is refused by name ("This file needs Dovetail 2.14 or later"), and nothing changes. `backupVersionFor`, `backupRefusal` in `calc.js`.
- **A restore says what it couldn't use**: after a restore or an opened file, one sentence lists anything dropped or fixed (a bill with a negative amount, a change of style with a bad month, a share rule Dovetail doesn't know). A negative amount is kept but counted as £0; a month with a bad date is kept but left out of the figures and the exports. `normCfg` and `normMonths` report it.
- **Kept backups**: the first time a new version opens, it keeps a backup of the data exactly as it was before changing anything; a pasted backup says what's in it before the second tap and, like an opened file and Restore in Settings, changes nothing if the backup of what's on the phone can't be saved; automatic backups also keep the newest of each month for a year, and up to 20 made before a restore or update (was 5), each for 30 days.
- **The old Wealth data** (balances from 1.x, not shown since 2.0, carried in every backup and update file): Settings › Backup, export & restore can save it as a file and then remove it, once, by choice (the owner's decision). Once removed, nothing brings it back by itself: an update from the other phone, an opened file, a pasted backup or the recovery screen restores everything else but not the file's Wealth data.
- **What's new remembers every version**: after an update it shows each version's lines since the one you had, newest first; About › What changed shows the last three. Any release that changes an existing household's figures says so in its lines.
- **Android**: if Android stops the part of the phone that draws the page (it can, to free memory), Dovetail carries on in a fresh WebView and loads the page again instead of rebuilding the screen from the stopped one; the page also saves what's waiting (pay typed a moment ago, the automatic backup, the reminder schedule) when the app is paused and when the page is torn down, and the WebView is released when the screen closes.
- Words and help: Board in "Words Dovetail uses"; "How Dovetail works" covers own accounts that keep what's left, board and changes from this month; the tour's Analysis stop is about the months ahead; Settings › Backup says Share can send the update file.
- Docs: the README opens with what Dovetail is for and names every file; CLAUDE.md and the plan say where things stand after the pause, with the plan's history in a dated log; the privacy policy's effective date and Share wording are current.
- Data: schema 5; backup files version 5 or 6 by content (above), with `needs` on version 6 files. New optional fields: `badAmount` on an item whose amount was negative; `wealthRemoved` in the settings once the old Wealth data has been removed. Calculations change only in a month where a top-up had no money behind it, and the "short" flags Analysis shows for households with more than one account keeping what's left. No permission changes, no new dependencies.
- Tests: the household simulation now covers what makes one month's figures differ from another's (`tests/sim/history.mjs`, in `npm run sim` and `sim:full`): a change of style from a random month and its Undo, bills, budgets, savings and income changed, added and deleted from a month and each undone, one-offs, and someone ticked later as paying board; earlier months must keep exactly their transfers, later months must match an independent working-out, Undo and a backup must give the settings back exactly, every month must add up. A skipped check fails a run (`ALLOW_SKIP=1` accepts skips on purpose), `npm test` rebuilds the page first and a suite run on its own stops if the page is older than `web/`, the 24 page suites run four at a time with every result shown (`tests/run-page.mjs`; under 4 minutes instead of about 13), `npm run sim:ui` is the full 360-household run, `build.sh` and CI fail on any permission not on the owner's list and check the two page builders agree, and the cloud start-up hook fetches the full git history. The settings a new household is saved with are made by one function that setup and the simulation share (`setupSettings` in `calc.js`), so every made-up household the simulation checks is built the way setup builds it, from the answers a person would give its screens (`unit/setup.test.mjs`: each way of managing money, Finish later from each step, incomplete rows left out, what setup keeps). New: `unit/v213.test.mjs`, `v213-use.test.mjs`, `backups.test.mjs`, `whatsnew.test.mjs`, `RendererCrashTest.kt`; the suites for each change; and a real 2.12.1 → 2.13 update test (`RELEASE['2.12.1']`, from `fbed4b8`).

## 2.12.1 (versionCode 21)
Fixes from a simulation of nearly 50,000 made-up households (the owner asked for it on 21 October 2026, then for these six fixes). Twenty thousand random households and every combination of money style, rule, number of people, one earner and households that can't cover their bills were worked out for every month of the year and checked against an independent model of each style; 378 more were typed into the real setup screens. The arithmetic held everywhere but one case (the first fix); the rest is what setup defaults to and how a few figures are shown. The owner's household has no shares or boarders and gets exactly the transfers it had (every saved and future month compared with 2.12).
- **"So we each keep the same" is the same with two joint accounts**: with joint bills and joint spending, money an earner sends a partner with no pay was worked out after the shares, so the earner kept less than the others (Alex £1,600, Kit £1,870 instead of £1,735 each). Set amounts are now always worked out first (`fundedOrder`). And in "One of us paying the bills", money the bill payer sends a partner with no pay is the payer's own: it's no longer counted as a bill the others share, and "keep the same" counts it against the payer.
- **Setup puts shared spending, savings and other income in the shared account**: the joint account (joint spending for budgets and savings, joint bills for income, when there are two), or the bill payer's account, instead of the first person's own account (153 of 155 simulated households had to change it by hand). With a boarder, they never start in the boarder's account (all 14 pooled households with a boarder did). They follow the answers if those change, until one is picked by hand (`sharedSpendAccount`, `sharedInAccount`).
- **Setup asks only for amounts it uses**: no "spending money" for someone paying board, no set amount for someone paying board (they have their board), and none for the bill payer with set amounts, which changed nothing (£500 or £5,000 gave the same transfers): the payer pays what their account still needs, and the diagram says so ("Sam pays what it needs. Alex pays a set amount into it."). Someone with no pay of their own no longer stops Next on the pay step: the note now appears only when nobody's pay is in (the last step still says whose pay counts as £0).
- **Board is money coming in**: a boarder's own account is their money, so it isn't in the household's left over, its totals or Analysis (it was: a household's £1,742.65 showed as £5,919.65). The board they pay counts as money in, and their own account shows apart in This month in detail ("Their own money, so it isn't counted in what the household has left."). With no pay typed for them, the household still has their board, and they're no longer "short". Setup marks them, and "Change how you manage your money" from the month it starts (earlier months, and Undo, keep who paid board before). Settings › People has "Pays board" wherever it counts: someone whose pay goes into an account of their own that keeps what's left and nobody else pays into (a household set up on 2.12 with board should tick it there). Analysis counts board as the transfers work it out, however it's paid.
- **A short joint account is named, and there's no top-up from an empty account**: the top card names every account that's short, even when the whole month is short (it was hidden then), and no longer repeats people's own accounts already in "keeps". In a household with shares, a top-up only sends what its account has by then: when set amounts don't cover joint bills, "Joint spending → Joint bills £4,440" from an empty account is gone, and a warning says "Joint bills is £400.00 short, and Joint spending has nothing to top it up with. Raise the set amounts paid into it, or move money into it." Households without shares are as before.
- **"Half each" isn't offered when the bill payer has no pay** (they'd have nothing to pay it from: the payer's account was left short by half the bills while the top card showed money left over). Settings › Accounts › Paid for by warns when equal shares include someone with no usual pay.
- What's new: three lines; someone updating straight from 2.11 also sees 2.12's three.
- An independent review of this release found, and it fixes before shipping: a change of style set who pays board for every month at once and Undo didn't put it back; "Pays board" could be ticked for the bill payer, whose account everyone pays into; Analysis left out board paid as a share and counted a boarder's bills in the months chart; with "Half each" hidden, the answers still defaulted to it (the diagram, "Finish later") and Next's message had nothing to point at; a board answer stayed in force after switching to a style that doesn't ask it; focus was lost after ticking "Pays board"; account counts included short accounts; a hand-picked account wasn't kept on the next row.
- Data: still schema 5 and backup version 5. New optional fields: `boarder: true` on a person (kept by `normCfg` only when true), and `boarders` (who paid board before) in a change's `was`. Calculations change only for households with shares or a boarder. No permission changes, no new dependencies.
- Tests: the simulation is kept in `tests/sim/` (`npm run sim`, part of `npm test`; `npm run sim:full`; `npm run sim:ui` for the setup screens), `unit/v2121.test.mjs`, `qa_fixes.mjs`, `qa_setup.mjs` updated for the pay note, and a real 2.12 → 2.12.1 update test (`RELEASE['2.12']`, from `680016a`).

## 2.12 (versionCode 20)
Household money styles, agreed with the owner on 20 October 2026 so Dovetail suits households that don't pool everything. The owner's own household pools, has none of the new settings, and gets exactly the transfers it had.
- **Shares**: an account can be paid for by more than one person, each from their own pay account: half each (equal shares for three or more), in proportion to usual pay (this month's when there's none), in proportion to what's left after their own bills, so everyone keeps the same (someone who'd keep less pays nothing and the others cover it), or set amounts. Anyone can pay a set amount or a percentage of their pay while the others share the rest. What's shared is what the account still needs after its own income and what reaches it. Shares are to the penny. Someone whose account can't cover their share shows short.
- **Setup asks how the household manages its money** (two or more people): "In our house we manage our money by…" putting it all together (then today's pictures, and whether each keeps some spending money, which becomes a budget in their account), each paying into a joint account (how to split it, and one joint account or joint bills and joint spending), one of us paying the bills (who, and how to split it), each paying certain bills (own accounts only), or something else. Someone with no pay can get a set amount from the earner each month, and with three or more people anyone else can pay board instead of sharing. The diagram says who pays into what, with a worked example of the shares; the bills step opens the account the shares go into (every own account when each pays certain bills). One person's setup is as before.
- **Pay tab**: each share is a transfer of its own, first in the list, with "Alex's share (60%)" or "Kit's set amount" under it, and its own tick. When people's own accounts keep what's left, the top card also says what each keeps. The account cards in This month in detail show shares going out and coming in. Share's message says whose share each is.
- **Settings › Accounts › Paid for by** on each account: who pays into it, how they split it, set amounts or percentages, and a warning when someone's pay already reaches the account (they'd pay twice).
- **Changing how you manage your money from a month**: Settings › Accounts › "Change how you manage your money…" asks the same questions, keeping your accounts where they fit, then when it starts (the next pay month by default). Accounts left out close from that month, and their bills, budgets and savings move to an account you choose; new accounts open then. Months before it keep the way you managed your money then, with the bills, budgets and savings it moved still where they were: every calculation (Pay, Analysis, exports, notifications) uses each month's own arrangement. Undo straight after, or "Undo the change" later, which puts everything back, names included.
- **Earlier months stay as they were when you change a bill** (the plan's stage 4): once there are months saved before the pay month the app opens on, a change to a bill's amount, account or months, or to a budget, savings transfer or other income, applies from that pay month, and earlier months keep what it was. A line under it says so ("Changed from November 2026. Earlier months keep £104.00.") with "Change earlier months too". Something added starts that month ("Add it to earlier months too"); something deleted still counts in earlier months (Undo puts it back); a renewal's new price applies from that month. With months saved, "Delete account…" becomes "Close …" for an account that's been used: it closes from that month, so earlier months keep it (an account nothing has used is still deleted; a closed one can't be deleted or chosen to move things to). Analysis, Saved so far and the exports use each month's own figures. A household with no saved months yet changes every month, as before. A second independent review, of this part, found and this release fixes: a move recorded by a change of style overriding a later dated move; accounts removed while earlier values still named them; a closed account offered as where to move things; Undo of a delete counting the item twice after other changes; a renewal that only changed month not being dated; and the wording of the note.
- Help, the tour and "Words Dovetail uses" (Share) explain shares. What's new: three lines.
- Data: still schema 5 and backup version 5. New optional fields, checked by `normCfg` (anything unusable is dropped): `funding` and `closedFrom` on accounts, `flows` on the settings (each change keeps the arrangement before it, and where the items it moved were), `was` and `start` on bills, budgets, savings transfers and income, and `ended` on the settings (items deleted, kept for earlier months). A household without them is unchanged byte for byte. A phone on 2.11 ignores them and would show pooled transfers, so update both phones before sending an update file from a household with shares. No permission changes, no new dependencies.
- Tests: `unit/v212.test.mjs` (every style in the plan's catalogue worked through, rules, rounding, short accounts, someone who'd pay twice, the setup shapes, the diagram's words, changes from a month and undoing them, `normFlows`), `qa_money.mjs` (setup's questions for every style with their accounts and transfers, keyboard and axe in light and dark at 360px with larger text; shares, ticks and Paid for by; changing from a month, Cancel, Undo), the setup and tour suites updated for the new question, and a real 2.11 → 2.12 update test (`RELEASE['2.11']`, from `e3b3041`).
- An independent review of the release found, and this release fixes before shipping: Back on the change's second step led to setup's last step, whose "Looks right, start" would have replaced the household; spending money and other income were asked in the change but not saved (now not asked there); closed accounts were offered for what's left and new accounts; "By what's left" and "keep the same" looked only at the account pay arrives in, not the person's own accounts beyond it; Undo kept moved bills and renames.

## 2.11 (versionCode 19)
A new mark for Dovetail, chosen with the owner on 20 October 2026: money coming in, brought together and sent on. Two streams (blue and amber) meet and become one green arrow; blue and yellow make green. The streams are money coming in (one pay, two or several, plus other income), not people, so it fits someone on their own as well as a couple. Drawn with round strokes like the tab icons, in the Analysis chart colours (`--viz-1`, `--viz-4`, `--viz-3`) on white.
- **App icon**: the mark on a white background (was a pound sign and arrow on green), with a one-colour layer for themed icons on Android 13+ (it used to reuse the two-colour layer).
- **Launch screen** (Android 12+): the mark draws itself in, in about 0.6 s, on a white circle (dark circle and the charts' dark colours when the phone is dark). The launch screen now stays until the animation has played and the page has loaded (at most 1.5 s), then fades into the page, so there's no blank moment while the page loads. It doesn't wait while the app lock is up, or for the animation when the phone's animations are off or a backup file is being opened from another app.
- **Notification icon**: the mark (was the Pay tab's arrows).
- **In the app**: the mark above "Welcome to Dovetail" on the first setup step, and beside the name in Settings › About, in the theme's chart colours, hidden from screen readers.
- `tools/make-store-art.mjs` makes the Google Play icon (512×512) and feature graphic (1024×500) from the same mark, locally.
- What's new: three lines, on the icon, the launch screen and notifications.
- Data: still schema 5 and backup version 5; no new fields. Calculations unchanged. No permission changes, no new dependencies.
- Tests: `BrandTest` (Robolectric: the icon's three layers, the notification icon, the launch screen's animated icon and circle colours in light and dark, when the first frame is held, that a recreated screen isn't, and that an opened backup file waits only for the page), `unit/mark.test.mjs` (every copy of the mark has the same paths and the chart colours), `qa_mark.mjs` (the mark in setup and About: colours light and dark, hidden from screen readers, 360px with larger text, axe), and a real 2.10.1 → 2.11 update test (`RELEASE['2.10.1']`, from `4290aca`).

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
