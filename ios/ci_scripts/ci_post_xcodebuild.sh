#!/bin/zsh
# Xcode Cloud runs this after each xcodebuild action. It only removes what ci_post_clone.sh wrote, so no secret
# stays in the build machine's working copy longer than the build (the machine is discarded anyway).
set -u
cd "${CI_PRIMARY_REPOSITORY_PATH:-.}/ios" 2>/dev/null || exit 0
rm -f Config/Secrets.xcconfig TappyAI/Resources/GoogleService-Info.plist
echo "post-xcodebuild: secret files removed"
exit 0
