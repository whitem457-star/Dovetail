#!/usr/bin/env bash
# Build Dovetail: page -> web tests -> JVM tests -> lint -> signed release APK and app bundle (for Google Play) -> checks.
# Needs: JDK 21+ (Robolectric needs it for Android 36), Node 18+, the Android SDK (ANDROID_HOME, platform 36, build-tools 36.0.0).
# Signing needs PAYDAY_KEYSTORE and PAYDAY_KEYSTORE_PASS (never commit either).
# Optional: PW_CHROMIUM for a local Chromium (otherwise Playwright's own, installed on the first run if missing). The 1.4 -> 2.0 update test builds the real 1.4 page from its commit in the git history
# (or set PAGE14 to a 1.4 index.html).
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
: "${PAYDAY_KEYSTORE:?set PAYDAY_KEYSTORE to the .jks path}"; : "${PAYDAY_KEYSTORE_PASS:?set PAYDAY_KEYSTORE_PASS}"
[ -f local.properties ] || echo "sdk.dir=$ANDROID_HOME" > local.properties
# SHA-256 of the release certificate (CN=Payday Transfers), the same in every release so far; the same value as ci.yml.
# An APK signed with any other key wouldn't install over Dovetail on the phone.
PAYDAY_CERT_SHA256=030edfd0c5aad7ea3f09693f8666be56ba1aba1083662cfc2db9e9009698dc39

./gradlew --no-daemon :app:generatePaydayPage
if [ "${SKIP_WEB_TESTS:-0}" != "1" ]; then
  (
    cd tests
    [ -d node_modules ] || npm install --silent
    # Playwright's Chromium, once, on a computer that hasn't got it (not needed when PW_CHROMIUM names a browser).
    if [ -z "${PW_CHROMIUM:-}" ] && ! node -e "process.exit(require('fs').existsSync(require('playwright').chromium.executablePath()) ? 0 : 1)"; then
      npx playwright install chromium
    fi
    npm test
  )
fi
./gradlew --no-daemon :app:testReleaseUnitTest :app:lintRelease :app:assembleRelease :app:bundleRelease

APK=app/build/outputs/apk/release/app-release.apk
AAB=app/build/outputs/bundle/release/app-release.aab
BT="$ANDROID_HOME/build-tools/36.0.0"
"$BT/apksigner" verify --print-certs "$APK" | grep "certificate SHA-256"
# Read each manifest in full first, and check it really was read, so a failed read can never pass as "no INTERNET".
BADGING=$("$BT/aapt2" dump badging "$APK")
grep -q "package: name='uk.whiteboard.payday'" <<<"$BADGING" || { echo "ERROR: couldn't read the APK's manifest" >&2; exit 1; }
if grep -q "android.permission.INTERNET" <<<"$BADGING"; then echo "ERROR: INTERNET permission found" >&2; exit 1; fi
# The owner's rule: no new permissions without asking. Anything not on this list fails the build, including one a new
# dependency brings in. The same list is in ci.yml (twice) and CLAUDE.md's Rules: change all of them together.
ALLOWED="android.permission.POST_NOTIFICATIONS android.permission.USE_BIOMETRIC android.permission.WAKE_LOCK android.permission.RECEIVE_BOOT_COMPLETED uk.whiteboard.payday.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION"
PERMS=$(sed -n "s/^uses-permission\(-sdk-23\)\{0,1\}: name='\([^']*\)'.*/\2/p" <<<"$BADGING" | sort -u)
EXTRA=$(comm -23 <(echo "$PERMS") <(tr ' ' '\n' <<<"$ALLOWED" | sort -u))
if [ -n "$EXTRA" ]; then echo "ERROR: permissions not on the allowed list (ask the owner first): $EXTRA" >&2; exit 1; fi
grep -E "^package|uses-permission" <<<"$BADGING"
# The bundle (what Google Play takes) must be signed with the same certificate as the APK, and have no INTERNET either.
APK_CERT=$("$BT/apksigner" verify --print-certs "$APK" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p')
if [ "$APK_CERT" != "$PAYDAY_CERT_SHA256" ]; then echo "ERROR: signed with a different certificate ($APK_CERT); it wouldn't install over Dovetail" >&2; exit 1; fi
AAB_CERT=$(keytool -printcert -jarfile "$AAB" 2>/dev/null | sed -n 's/^[[:space:]]*SHA256: //p' | tr -d ':' | tr 'A-F' 'a-f')
if [ -z "$AAB_CERT" ] || [ "$AAB_CERT" != "$APK_CERT" ]; then echo "ERROR: the app bundle isn't signed with the APK's certificate" >&2; exit 1; fi
AAB_MANIFEST=$(mktemp); trap 'rm -f "$AAB_MANIFEST"' EXIT
unzip -p "$AAB" base/manifest/AndroidManifest.xml > "$AAB_MANIFEST"
grep -aq "android.permission.USE_BIOMETRIC" "$AAB_MANIFEST" || { echo "ERROR: couldn't read the app bundle's manifest" >&2; exit 1; }
if grep -aq "android.permission.INTERNET" "$AAB_MANIFEST"; then echo "ERROR: INTERNET permission found in the app bundle" >&2; exit 1; fi
# The bundle's manifest is binary, so check every permission name in it; BIND_JOB_SERVICE and DUMP guard WorkManager's services.
AAB_PERMS=$(grep -aoE '[A-Za-z][A-Za-z0-9_.]*\.(permission\.[A-Z][A-Z0-9_]*|[A-Z0-9_]+_PERMISSION)' "$AAB_MANIFEST" | sort -u)
EXTRA=$(comm -23 <(echo "$AAB_PERMS") <(printf '%s\n' $ALLOWED android.permission.BIND_JOB_SERVICE android.permission.DUMP | sort -u))
if [ -n "$EXTRA" ]; then echo "ERROR: permissions not on the allowed list in the app bundle: $EXTRA" >&2; exit 1; fi
echo "Signed APK: $APK"
echo "Signed app bundle (for Google Play): $AAB"
