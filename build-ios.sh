#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
IOS_DIR="${ROOT_DIR}/ios"
SCHEME="App"
CONFIGURATION="Release"

echo "==> Building static web bundle"
cd "$ROOT_DIR"
npm run clean:public

echo "==> Building Next.js static export"
BUILD_STATIC=true npm run build:ios

if [ $? -ne 0 ]; then
  echo "❌ Next.js build failed"
  exit 1
fi

echo "==> Copying static files to public"
npm run copy:static

if [ $? -ne 0 ]; then
  echo "❌ Copy static files failed"
  exit 1
fi

echo "==> Syncing Capacitor iOS project"
npx cap sync ios

echo "==> Installing CocoaPods dependencies"
cd "$IOS_DIR/App"
pod install

echo "==> Building iOS archive (${SCHEME} - ${CONFIGURATION})"
cd "$IOS_DIR"

# Check available destinations first
echo "Checking available build destinations..."
DEST_OUTPUT=$(xcodebuild -workspace App/App.xcworkspace -scheme "${SCHEME}" -showdestinations 2>&1)

if echo "$DEST_OUTPUT" | grep -qi "not installed"; then
  echo ""
  echo "❌ iOS platform support is not fully installed."
  echo ""
  echo "To fix this:"
  echo "1. Open Xcode:"
  echo "   open App/App.xcworkspace"
  echo ""
  echo "2. Install iOS platform support:"
  echo "   Xcode > Settings (or Preferences) > Platforms (or Components)"
  echo "   Download and install iOS 26.1 platform support"
  echo ""
  echo "3. After installation, run this build script again"
  echo ""
  exit 1
fi

# Try to find a valid destination
# Use generic platform for archiving
echo "Building archive for generic iOS platform..."
xcodebuild \
  -workspace App/App.xcworkspace \
  -scheme "${SCHEME}" \
  -configuration "${CONFIGURATION}" \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath "build/${SCHEME}.xcarchive" \
  clean archive

echo "==> Exporting signed .ipa"
cd "$IOS_DIR"

# Use development method which works with development certificates
# For App Store or ad-hoc distribution, you'll need distribution certificates
if [[ ! -f exportOptions.plist ]]; then
  cat <<'PLIST' > exportOptions.plist
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>development</string>
  <key>compileBitcode</key>
  <false/>
  <key>uploadBitcode</key>
  <false/>
  <key>uploadSymbols</key>
  <true/>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>Q7GDVRDLKY</string>
  <key>destination</key>
  <string>export</string>
</dict>
</plist>
PLIST
  echo "Created exportOptions.plist with development method"
else
  echo "Using existing exportOptions.plist"
fi

# Try to export with better error handling
if ! xcodebuild \
  -exportArchive \
  -archivePath "build/${SCHEME}.xcarchive" \
  -exportOptionsPlist exportOptions.plist \
  -exportPath build 2>&1; then
  
  echo ""
  echo "❌ Export failed. Common issues:"
  echo ""
  echo "1. Missing signing certificate:"
  echo "   - Open Xcode: open App/App.xcworkspace"
  echo "   - Go to Signing & Capabilities tab"
  echo "   - Ensure 'Automatically manage signing' is checked"
  echo "   - Select your development team"
  echo "   - Xcode will create/download certificates automatically"
  echo ""
  echo "2. For App Store or ad-hoc distribution:"
  echo "   - You need an 'iOS Distribution' certificate"
  echo "   - Create one in: Xcode > Settings > Accounts > [Your Account] > Manage Certificates"
  echo "   - Or use Apple Developer portal: https://developer.apple.com/account/resources/certificates/list"
  echo ""
  echo "3. Alternative: Use Xcode GUI to export:"
  echo "   - Product > Archive (if not already done)"
  echo "   - Window > Organizer"
  echo "   - Select your archive > Distribute App"
  echo ""
  exit 1
fi

echo "==> iOS build complete"
echo "Archive: ${IOS_DIR}/build/${SCHEME}.xcarchive"
find "${IOS_DIR}/build" -name '*.ipa' -print

