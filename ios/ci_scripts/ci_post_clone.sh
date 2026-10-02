#!/bin/zsh
# Xcode Cloud runs this right after cloning the repository (ios/ci_scripts/ci_post_clone.sh).
#
# What it does, in this order — the same things the GitHub Actions TestFlight job does, minus signing (Xcode Cloud
# signs for itself with cloud-managed signing):
#   1. installs XcodeGen and GENERATES TappyAI.xcodeproj (the project is not in the repository: it is built from project.yml);
#   2. writes Config/Secrets.xcconfig from the workflow's secret environment variables;
#   3. refuses an archive that is not pointed at production (www.tappyai.com);
#   4. writes GoogleService-Info.plist from a secret (push; never committed);
#   5. puts a build number that always goes UP into the generated project (CI_BUILD_NUMBER + XCLOUD_BUILD_OFFSET).
#
# Secrets are never printed: only the names that are set and the length of the anon key.
# Also runnable from a GitHub Actions macOS job (.github/workflows/ios-xcloud-dry.yml) to prove it works before the Mac day.
set -euo pipefail

: "${CI_PRIMARY_REPOSITORY_PATH:?CI_PRIMARY_REPOSITORY_PATH is not set (Xcode Cloud sets it)}"
cd "$CI_PRIMARY_REPOSITORY_PATH/ios"

echo "post-clone: $(xcodebuild -version | tr '\n' ' ')"
echo "post-clone: action=${CI_XCODEBUILD_ACTION:-unknown} workflow=${CI_WORKFLOW:-?} build=${CI_BUILD_NUMBER:-?} branch=${CI_BRANCH:-?}"

# ── 1. XcodeGen ──────────────────────────────────────────────────────────────────────────────────────────────────
if ! command -v xcodegen >/dev/null 2>&1; then
  export HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_INSTALL_CLEANUP=1 HOMEBREW_NO_ENV_HINTS=1
  if ! command -v brew >/dev/null 2>&1; then
    echo "error: Homebrew is not on this machine, so XcodeGen cannot be installed (see docs/ios/MAC-DAY-CHECKLIST.md, 'If Homebrew is missing')." >&2
    exit 1
  fi
  brew install xcodegen
fi
echo "post-clone: xcodegen $(xcodegen --version 2>/dev/null | head -1)"

# ── 5 (before generating). The build number: project.yml carries CURRENT_PROJECT_VERSION; Xcode Cloud cannot pass
# command-line settings, so the value is written into project.yml (this checkout only) before the project is generated.
# It must be higher than EVERY build already uploaded to App Store Connect: that is what the offset is for.
OFFSET="${XCLOUD_BUILD_OFFSET:-1000}"
BUILD_NUMBER=$(( OFFSET + ${CI_BUILD_NUMBER:-0} ))
sed -i '' "s/CURRENT_PROJECT_VERSION: \"[0-9]*\"/CURRENT_PROJECT_VERSION: \"${BUILD_NUMBER}\"/" project.yml
grep -q "CURRENT_PROJECT_VERSION: \"${BUILD_NUMBER}\"" project.yml \
  || { echo "error: could not write the build number into project.yml" >&2; exit 1; }
echo "post-clone: CFBundleVersion for this build = ${BUILD_NUMBER}"

# ── 2. Secrets.xcconfig ──────────────────────────────────────────────────────────────────────────────────────────
for v in SUPABASE_URL SUPABASE_ANON_KEY TAPPY_API_BASE_URL; do
  if [[ -z "${(P)v:-}" ]]; then
    echo "error: the environment variable $v is not set in the Xcode Cloud workflow (Environment → Environment Variables, marked Secret)." >&2
    exit 1
  fi
done
# `//` starts a comment in an xcconfig, so a URL is written as https:/$()/host.
xc_url() { printf '%s' "${1%/}" | sed 's|//|/$()/|'; }
{
  echo '// Written by ci_post_clone.sh for this build only; never committed.'
  echo "SUPABASE_URL = $(xc_url "$SUPABASE_URL")"
  echo "SUPABASE_ANON_KEY = $SUPABASE_ANON_KEY"
  echo "TAPPY_API_BASE_URL = $(xc_url "$TAPPY_API_BASE_URL")"
} > Config/Secrets.xcconfig
echo "post-clone: Secrets.xcconfig defines: $(grep -oE '^[A-Z_]+' Config/Secrets.xcconfig | tr '\n' ' ')"

# ── 3. Production only ───────────────────────────────────────────────────────────────────────────────────────────
base="${TAPPY_API_BASE_URL%/}"
host="$(printf '%s' "$base" | sed -E 's|^https?://([^/:]+).*|\1|')"
echo "post-clone: API host for this build: $host"
case "$host" in
  www.tappyai.com|tappyai.com) ;;
  *) echo "error: TAPPY_API_BASE_URL host is '$host', not production (www.tappyai.com). Refusing to build." >&2; exit 1 ;;
esac
case "$base" in https://*) ;; *) echo "error: TAPPY_API_BASE_URL is not https" >&2; exit 1 ;; esac
case "${SUPABASE_URL}${SUPABASE_ANON_KEY}" in
  *YOUR-PROJECT*|*REPLACE_ME*|*localhost*) echo "error: a placeholder value is set for SUPABASE_URL / SUPABASE_ANON_KEY" >&2; exit 1 ;;
esac
echo "post-clone: SUPABASE_ANON_KEY length ${#SUPABASE_ANON_KEY}"

# ── 4. Firebase (push) ───────────────────────────────────────────────────────────────────────────────────────────
if [[ -n "${GOOGLE_SERVICE_INFO_PLIST_BASE64:-}" ]]; then
  printf '%s' "$GOOGLE_SERVICE_INFO_PLIST_BASE64" | base64 --decode > TappyAI/Resources/GoogleService-Info.plist
  plutil -lint TappyAI/Resources/GoogleService-Info.plist
  echo "post-clone: GoogleService-Info.plist written; bundle id $(plutil -extract BUNDLE_ID raw -o - TappyAI/Resources/GoogleService-Info.plist)"
else
  echo "warning: GOOGLE_SERVICE_INFO_PLIST_BASE64 is not set — this build has NO push notifications" >&2
fi

# ── Generate the project ─────────────────────────────────────────────────────────────────────────────────────────
xcodegen generate
test -d TappyAI.xcodeproj || { echo "error: xcodegen did not produce TappyAI.xcodeproj" >&2; exit 1; }
echo "post-clone: generated $(pwd)/TappyAI.xcodeproj"
