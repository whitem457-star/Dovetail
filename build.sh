#!/usr/bin/env bash
# Build Dovetail: page -> web tests -> JVM tests -> lint -> signed release APK and app bundle (for Google Play) -> checks.
# Needs: JDK 21+ (Robolectric needs it for Android 36), Node 18+, the Android SDK (ANDROID_HOME, platform 36, build-tools 36.0.0).
# Signing needs PAYDAY_KEYSTORE and PAYDAY_KEYSTORE_PASS (never commit either).
# Optional: PW_CHROMIUM for a local Chromium. The 1.4 -> 2.0 update test builds the real 1.4 page from its commit in the git history
# (or set PAGE14 to a 1.4 index.html).
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_HOME:?set ANDROID_HOME to your Android SDK}"
: "${PAYDAY_KEYSTORE:?set PAYDAY_KEYSTORE to the .jks path}"; : "${PAYDAY_KEYSTORE_PASS:?set PAYDAY_KEYSTORE_PASS}"
[ -f local.properties ] || echo "sdk.dir=$ANDROID_HOME" > local.properties

./gradlew --no-daemon :app:generatePaydayPage
if [ "${SKIP_WEB_TESTS:-0}" != "1" ]; then
  (cd tests && { [ -d node_modules ] || npm install --silent; } && npm test)
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
grep -E "^package|uses-permission" <<<"$BADGING"
# The bundle (what Google Play takes) must be signed with the same certificate as the APK, and have no INTERNET either.
APK_CERT=$("$BT/apksigner" verify --print-certs "$APK" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p')
AAB_CERT=$(keytool -printcert -jarfile "$AAB" 2>/dev/null | sed -n 's/^[[:space:]]*SHA256: //p' | tr -d ':' | tr 'A-F' 'a-f')
if [ -z "$AAB_CERT" ] || [ "$AAB_CERT" != "$APK_CERT" ]; then echo "ERROR: the app bundle isn't signed with the APK's certificate" >&2; exit 1; fi
AAB_MANIFEST=$(mktemp); trap 'rm -f "$AAB_MANIFEST"' EXIT
unzip -p "$AAB" base/manifest/AndroidManifest.xml > "$AAB_MANIFEST"
grep -aq "android.permission.USE_BIOMETRIC" "$AAB_MANIFEST" || { echo "ERROR: couldn't read the app bundle's manifest" >&2; exit 1; }
if grep -aq "android.permission.INTERNET" "$AAB_MANIFEST"; then echo "ERROR: INTERNET permission found in the app bundle" >&2; exit 1; fi
echo "Signed APK: $APK"
echo "Signed app bundle (for Google Play): $AAB"
