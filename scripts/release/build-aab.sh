#!/usr/bin/env bash
# Build the signed Play release AAB (vc10 / 1.0.0) from ONE exact commit, in a FRESH worktree.
# LEAD-RUN ONLY, from Git Bash. Nothing is uploaded; Play Console is the owner's step (RELEASE-PLAN §3d).
#
#   bash scripts/release/build-aab.sh <sha>
#
# It never checks out anything in a shared worktree (C:/wtrel, C:/wtandroid, …): it runs
# `git worktree add --detach C:/wtbuild-<sha7> <sha>` (no branch is created), copies
#   android/gradle.properties.template -> gradle.properties   (non-secret defaults; prod URLs)
#   C:/wtrel/android/local.properties  -> local.properties    (sdk.dir)
# and relies on ~/.gradle/gradle.properties for the release Supabase values and the upload-key
# signing properties (TAPPYAI_RELEASE_KEYSTORE_PATH/_KEYSTORE_PASSWORD/_KEY_ALIAS/_KEY_PASSWORD).
# Gradle gives the user-home file precedence over the project file, so the template's placeholders
# never reach the build; app/build.gradle.kts (C19) fails the build if any release value is a placeholder.
#
# Verifies: jarsigner -verify ("jar verified."), BuildConfig VERSION_CODE=10, VERSION_NAME="1.0.0",
# API_BASE_URL="https://www.tappyai.com/", WEB_APP_URL="https://www.tappyai.com", GIT_SHA=<sha7>,
# VERCEL_BYPASS_SECRET="" and a production SUPABASE_URL. Prints the AAB path, its sha256 and the
# signing certificate fingerprint (compare with Play Console -> App integrity -> Upload key certificate).
# Secrets are never printed (the anon key line of BuildConfig is not echoed).
#
# Cleanup afterwards (keeps nothing shared):  git -C C:/wtrel worktree remove --force C:/wtbuild-<sha7>
set -euo pipefail

SRC_REPO="${TAPPY_SRC_REPO:-C:/wtrel}"
export JAVA_HOME="${JAVA_HOME_OVERRIDE:-/c/Program Files/Android/Android Studio/jbr}"
EXPECT_VC=10
EXPECT_VN="1.0.0"
EXPECT_API="https://www.tappyai.com/"
EXPECT_WEB="https://www.tappyai.com"
PROD_REF="fwznnobrdctuskgrvuik"

die() { printf '\n\033[31mBUILD REFUSED/FAILED: %s\033[0m\n' "$*" >&2; exit 1; }

[ $# -eq 1 ] || die "usage: build-aab.sh <sha>"
[[ "$1" =~ ^[0-9a-f]{7,40}$ ]] || die "<sha> must be 7-40 hex chars"
FULL="$(git -C "$SRC_REPO" rev-parse --verify --quiet "$1^{commit}")" \
  || die "commit $1 not found in $SRC_REPO — run 'git -C $SRC_REPO fetch origin' first"
SHORT="${FULL:0:7}"
WT="C:/wtbuild-$SHORT"
[ ! -e "$WT" ] || die "$WT already exists — remove it (git -C $SRC_REPO worktree remove --force $WT) or build elsewhere"

[ -x "$JAVA_HOME/bin/java.exe" ] || [ -x "$JAVA_HOME/bin/java" ] || die "JAVA_HOME has no java: $JAVA_HOME"
[ -f "$SRC_REPO/android/local.properties" ] || die "missing $SRC_REPO/android/local.properties (sdk.dir)"
USER_PROPS="${GRADLE_USER_HOME:-$HOME/.gradle}/gradle.properties"
[ -f "$USER_PROPS" ] || die "missing $USER_PROPS (release Supabase values + signing properties)"
for k in TAPPYAI_SUPABASE_URL TAPPYAI_SUPABASE_ANON_KEY TAPPYAI_GOOGLE_WEB_CLIENT_ID \
         TAPPYAI_RELEASE_KEYSTORE_PATH TAPPYAI_RELEASE_KEYSTORE_PASSWORD TAPPYAI_RELEASE_KEY_ALIAS TAPPYAI_RELEASE_KEY_PASSWORD; do
  grep -qE "^$k=.+" "$USER_PROPS" || die "$USER_PROPS lacks $k (name checked only; value not read)"
done
KS="$(grep -E '^TAPPYAI_RELEASE_KEYSTORE_PATH=' "$USER_PROPS" | head -1 | cut -d= -f2- | tr -d '\r')"
[ -f "$KS" ] || [ -f "$(cygpath -u "$KS" 2>/dev/null || echo "$KS")" ] || die "upload keystore not found at the path TAPPYAI_RELEASE_KEYSTORE_PATH names"

echo "== worktree: $WT @ $FULL (detached)"
git -C "$SRC_REPO" worktree add --detach "$WT" "$FULL"
[ -f "$WT/android/gradle.properties.template" ] || die "no android/gradle.properties.template at $SHORT"
cp "$WT/android/gradle.properties.template" "$WT/android/gradle.properties"
cp "$SRC_REPO/android/local.properties" "$WT/android/local.properties"
[ -f "$WT/android/app/google-services.json" ] || die "android/app/google-services.json missing at $SHORT"

echo "== ./gradlew :app:bundleRelease (JAVA_HOME=$JAVA_HOME)"
( cd "$WT/android" && ./gradlew --no-daemon --console=plain :app:bundleRelease )

AAB="$WT/android/app/build/outputs/bundle/release/app-release.aab"
BC="$WT/android/app/build/generated/source/buildConfig/release/com/tappyai/app/BuildConfig.java"
[ -f "$AAB" ] || die "AAB not produced at $AAB"
[ -f "$BC" ] || die "BuildConfig not found at $BC"

echo "== signature"
VERIFY_OUT="$("$JAVA_HOME/bin/jarsigner" -verify "$AAB" 2>&1 || true)"
echo "$VERIFY_OUT" | grep -q "jar verified." || { echo "$VERIFY_OUT" | tail -5; die "jarsigner did not verify the AAB (unsigned? signing props missing?)"; }
echo "$VERIFY_OUT" | grep -qi "unsigned" && die "jarsigner reports unsigned entries"
CERT_SHA256="$("$JAVA_HOME/bin/keytool" -printcert -jarfile "$AAB" 2>/dev/null | grep -m1 'SHA256:' | sed 's/^[[:space:]]*SHA256:[[:space:]]*//')"
[ -n "$CERT_SHA256" ] || die "could not read the signing certificate"

echo "== BuildConfig"
check() { grep -qF "$1" "$BC" || die "BuildConfig mismatch — expected: $1"; echo "  ok  $1"; }
check "VERSION_CODE = $EXPECT_VC;"
check "VERSION_NAME = \"$EXPECT_VN\";"
check "API_BASE_URL = \"$EXPECT_API\";"
check "WEB_APP_URL = \"$EXPECT_WEB\";"
check "VERCEL_BYPASS_SECRET = \"\";"
check "GIT_SHA = \"$SHORT"
grep -qE "SUPABASE_URL = \"https://$PROD_REF\.supabase\.co/?\";" "$BC" || die "SUPABASE_URL is not the production project ($PROD_REF)"
echo "  ok  SUPABASE_URL = production ($PROD_REF)"
grep -qE 'DEBUG = (false|Boolean.parseBoolean\("false"\));' "$BC" || die "BuildConfig.DEBUG is not false"
echo "  ok  DEBUG = false"

AAB_SHA="$(sha256sum "$AAB" | cut -d' ' -f1)"
cat <<EOF

================ AAB READY (not uploaded) ================
path:           $AAB
sha256:         $AAB_SHA
commit:         $FULL
version:        versionCode $EXPECT_VC / versionName $EXPECT_VN
signer SHA-256: $CERT_SHA256
  -> must equal Play Console > Test and release > App integrity > "Upload key certificate" SHA-256.
Next: RELEASE-PLAN §3d (owner uploads to Internal testing). Cleanup after upload:
  git -C $SRC_REPO worktree remove --force $WT
===========================================================
EOF
