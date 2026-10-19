# Contributing to Dovetail

Thanks for your interest. Dovetail is a small, offline Android app with a few firm rules. Please read this before opening an issue or a pull request.

## The rules

- **No internet, ever.** The app has no INTERNET permission and makes no network calls: no analytics, no crash reporting, no remote fonts or CDNs. The build fails if the permission appears.
- **No new permissions** without discussing it first in an issue. Never camera, storage, contacts, location, network state or exact alarms.
- **No JavaScript libraries.** The page is plain JavaScript; charts are inline SVG. New Android dependencies need discussing first.
- **Calculations never change by accident.** Changes to how transfers or left over are worked out need a clear reason and tests that show exactly what changes.
- **Data is never lost.** Saved data and backups must keep opening in every later version. New settings are optional, with defaults.
- **Plain English** in the app (UK spelling, no jargon). Every new piece of screen works in light and dark, at 360px wide, with larger text, by keyboard and with a screen reader.

## Your data

Never put real financial details in an issue, a pull request, a screenshot or a test. The tests use a made-up household (`tests/fixtures/sample-1.x-backup.json`, Alex and Sam). "Copy app details" in Settings › About is safe to paste: it has no names or amounts.

## Building and testing

- **Page tests (any computer with Node 18+):** `node tests/build-page.mjs`, then `cd tests && npm install && npm test`.
- **Android tests and lint (Android SDK, JDK 21):** `./gradlew :app:testReleaseUnitTest :app:lintRelease :app:assembleRelease :app:bundleRelease`.
- `README.md` explains the data model, the calculation and every feature.

Pure logic goes in `web/src/calc.js`, `analysis.js` or `export.js`, with unit tests in `tests/unit`. Behaviour on screen gets a Playwright check in `tests/qa_*.mjs`. Android behaviour gets a Robolectric test in `app/src/test`.

## Signing and releases

Official releases are signed with a key that isn't in this repository. Your own builds are unsigned (or signed with your own key), so they can't install over the official app. That's deliberate, and it protects people's data.

## Licence

By contributing, you agree that your contribution is licensed under the GNU General Public License, version 3 or later, like the rest of Dovetail.
