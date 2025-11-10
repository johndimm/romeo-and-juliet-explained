#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
IOS_DIR="${ROOT_DIR}/ios"
SCHEME="App"
CONFIGURATION="Release"

echo "==> Building static web bundle"
cd "$ROOT_DIR"
npm run clean:public
npm run build:ios:sync

echo "==> Syncing Capacitor iOS project"
npx cap sync ios

echo "==> Installing CocoaPods dependencies"
cd "$IOS_DIR/App"
pod install

echo "==> Building iOS archive (${SCHEME} - ${CONFIGURATION})"
cd "$IOS_DIR"
xcodebuild \
  -workspace App/App.xcworkspace \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -sdk iphoneos \
  -archivePath "build/${SCHEME}.xcarchive" \
  clean archive

echo "==> Exporting signed .ipa"
cd "$IOS_DIR"
if [[ ! -f exportOptions.plist ]]; then
  cat <<'PLIST' > exportOptions.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>ad-hoc</string>
  <key>compileBitcode</key>
  <false/>
  <key>uploadBitcode</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>destination</key>
  <string>export</string>
</dict>
</plist>
PLIST
fi

xcodebuild \
  -exportArchive \
  -archivePath "build/${SCHEME}.xcarchive" \
  -exportOptionsPlist exportOptions.plist \
  -exportPath build

echo "==> iOS build complete"
echo "Archive: ${IOS_DIR}/build/${SCHEME}.xcarchive"
find "${IOS_DIR}/build" -name '*.ipa' -print

