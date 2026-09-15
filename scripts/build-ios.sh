#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# XcodeGen makes the small, readable project.yml the project source of truth.
command -v xcodegen >/dev/null || { echo 'Install XcodeGen: brew install xcodegen' >&2; exit 1; }
xcrun --sdk iphoneos --show-sdk-path >/dev/null
npm run build
node scripts/bundle-ios.mjs
xcodegen generate --spec platforms/ios/project.yml

build_target="${1:-simulator}"
case "$build_target" in
  simulator) destination='generic/platform=iOS Simulator'; product='Release-iphonesimulator' ;;
  device) destination='generic/platform=iOS'; product='Release-iphoneos' ;;
  *) echo 'Usage: scripts/build-ios.sh [simulator|device]' >&2; exit 1 ;;
esac
xcodebuild -project platforms/ios/SimFarm.xcodeproj -scheme SimFarm \
  -configuration Release -destination "$destination" \
  -derivedDataPath "build/ios-$build_target" CODE_SIGNING_ALLOWED=NO build
# Fail if the app compiled without its offline game resources.
test -f "build/ios-$build_target/Build/Products/$product/SimFarm.app/Web/index.html"
test -f "build/ios-$build_target/Build/Products/$product/SimFarm.app/Web/game.js"
mkdir -p dist
ditto -c -k --sequesterRsrc --keepParent \
  "build/ios-$build_target/Build/Products/$product/SimFarm.app" \
  "dist/SimFarm-iOS-$build_target-unsigned.zip"
echo "Built dist/SimFarm-iOS-$build_target-unsigned.zip"
