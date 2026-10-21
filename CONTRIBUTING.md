# Contributing to Dovetail

Thanks for your interest. Dovetail is a small, offline Android app with a few firm rules. Issues and ideas are welcome; pull requests aren't accepted for now (see below).

## Issues, ideas and pull requests

- **Issues and ideas are welcome.** Describe the problem or the idea, and how to see it. Good ones may be built into a later version.
- **Pull requests aren't accepted for now,** so that Dovetail's author can keep choosing how future versions are licensed. Please open an issue instead.
- You're welcome to build Dovetail yourself, or fork it, under its licence.

## The rules

- **No internet, ever.** The app has no INTERNET permission and makes no network calls: no analytics, no crash reporting, no remote fonts or CDNs. The build fails if the permission appears.
- **No new permissions** without discussing it first in an issue. Never camera, storage, contacts, location, network state or exact alarms. The build fails on any permission that isn't on the allowed list in `build.sh` and the CI workflow.
- **No JavaScript libraries.** The page is plain JavaScript; charts are inline SVG. New Android dependencies need discussing first.
- **Calculations never change by accident.** Changes to how transfers or left over are worked out need a clear reason and tests that show exactly what changes.
- **Data is never lost.** Saved data and backups must keep opening in every later version. New settings are optional, with defaults.
- **Plain English** in the app (UK spelling, no jargon). Every new piece of screen works in light and dark, at 360px wide, with larger text, by keyboard and with a screen reader.

## Your data

Never put real financial details in an issue, a pull request, a screenshot or a test. The tests use a made-up household (`tests/fixtures/sample-1.x-backup.json`, Alex and Sam). "Copy app details" in Settings › About is safe to paste: it has no names or amounts.

## Building and testing

- **Page tests (any computer with Node 18+):** `cd tests && npm install && npx playwright install chromium && npm test` (it builds the page first; run `node tests/build-page.mjs` yourself before running one suite with `node qa_x.mjs`).
- **Android tests and lint (Android SDK, JDK 21):** `./gradlew :app:testReleaseUnitTest :app:lintRelease :app:assembleRelease :app:bundleRelease`.
- `README.md` explains the data model, the calculation and every feature.

Pure logic goes in `web/src/calc.js`, `analysis.js` or `export.js`, with unit tests in `tests/unit`. Behaviour on screen gets a Playwright check in `tests/qa_*.mjs`. Android behaviour gets a Robolectric test in `app/src/test`.

## Signing and releases

Official releases are signed with a key that isn't in this repository. Your own builds are unsigned (or signed with your own key), so they can't install over the official app. That's deliberate, and it protects people's data.

## Licence

Dovetail is licensed under the GNU General Public License, version 3 or later (`LICENSE`).
