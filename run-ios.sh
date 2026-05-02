#!/usr/bin/env bash
# run-ios.sh — build & launch SplitPay on iPhone 17 Pro simulator
# Usage: ./run-ios.sh
set -e

SIMULATOR_UDID="7F8D9137-42D1-45ED-8DD1-F86B1C059D96"
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
SYMLINK="/Users/abdulvasih/GitHub/SplitExpenseApp"
APP_BUNDLE="$PROJECT_ROOT/node_modules/expo-constants"

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

echo "▶ Ensuring symlink (no-space path for Xcode scripts)..."
ln -sf "$PROJECT_ROOT" "$SYMLINK" 2>/dev/null || true

echo "▶ Booting simulator..."
xcrun simctl boot "$SIMULATOR_UDID" 2>/dev/null || true

echo "▶ Building (this may take a moment)..."
cd "$SYMLINK"
xcodebuild \
  -workspace ios/SplitPay.xcworkspace \
  -scheme SplitPay \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "id=$SIMULATOR_UDID" \
  ONLY_ACTIVE_ARCH=YES \
  build 2>&1 | grep -E "(error:|warning: Run script|BUILD SUCCEEDED|BUILD FAILED)" | grep -v "warning:"
echo ""

DERIVED_APP="$HOME/Library/Developer/Xcode/DerivedData/Build/Products/Debug-iphonesimulator/SplitPay.app"

echo "▶ Generating expo-constants manifest..."
NODE_BINARY=$(which node)
cd "$PROJECT_ROOT"
"$NODE_BINARY" "$APP_BUNDLE/scripts/getAppConfig.js" \
  "$PROJECT_ROOT" \
  "$DERIVED_APP/EXConstants.bundle" 2>/dev/null || true

echo "▶ Installing on simulator..."
xcrun simctl install "$SIMULATOR_UDID" "$DERIVED_APP"

echo "▶ Launching app..."
xcrun simctl terminate "$SIMULATOR_UDID" com.splitpay.app 2>/dev/null || true
sleep 1
xcrun simctl launch "$SIMULATOR_UDID" com.splitpay.app

echo ""
echo "✅ SplitPay is running on iPhone 17 Pro simulator!"
echo "   (Use 'xcrun simctl io $SIMULATOR_UDID screenshot ~/Desktop/sim.png' to capture screen)"
