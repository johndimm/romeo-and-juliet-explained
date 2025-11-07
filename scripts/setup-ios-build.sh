#!/bin/bash

set -e  # Exit on error

echo "🍎 iOS Build Setup Script"
echo "========================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo "📋 Step 1: Checking prerequisites..."
echo ""

# Check if macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}❌ iOS apps can only be built on macOS${NC}"
    exit 1
fi

# Check Xcode
echo -n "Checking Xcode... "
if command_exists xcodebuild; then
    XCODE_VERSION=$(xcodebuild -version | head -n 1)
    echo -e "${GREEN}✓ Found $XCODE_VERSION${NC}"
    XCODE_INSTALLED=true
else
    echo -e "${RED}✗ Not found${NC}"
    XCODE_INSTALLED=false
fi

# Check CocoaPods
echo -n "Checking CocoaPods... "
if command_exists pod; then
    POD_VERSION=$(pod --version)
    echo -e "${GREEN}✓ Found version $POD_VERSION${NC}"
    COCOAPODS_INSTALLED=true
else
    echo -e "${YELLOW}⚠ Not found${NC}"
    COCOAPODS_INSTALLED=false
fi

# Check Homebrew
echo -n "Checking Homebrew... "
if command_exists brew; then
    echo -e "${GREEN}✓ Found${NC}"
    BREW_INSTALLED=true
else
    echo -e "${YELLOW}⚠ Not found${NC}"
    BREW_INSTALLED=false
fi

echo ""
echo "📦 Step 2: Installing prerequisites..."
echo ""

# Install Xcode Command Line Tools if needed
if [ "$XCODE_INSTALLED" = false ]; then
    echo -e "${YELLOW}⚠ Xcode not found${NC}"
    echo "Please:"
    echo "1. Install Xcode from the Mac App Store"
    echo "2. Open Xcode and accept the license agreement"
    echo "3. Run: xcode-select --install"
    echo "4. Run this script again"
    echo ""
    read -p "Have you installed Xcode? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Please install Xcode first, then run this script again."
        exit 1
    fi
    
    # Try to install command line tools
    echo "Installing Xcode Command Line Tools..."
    xcode-select --install || true
    echo "Please complete the Xcode Command Line Tools installation, then run this script again."
    exit 1
fi

# Install CocoaPods if needed
if [ "$COCOAPODS_INSTALLED" = false ]; then
    echo "Installing CocoaPods..."
    if [ "$BREW_INSTALLED" = true ]; then
        brew install cocoapods
    else
        sudo gem install cocoapods
    fi
    COCOAPODS_INSTALLED=true
    echo -e "${GREEN}✅ CocoaPods installed${NC}"
fi

echo ""
echo "📦 Step 3: Installing Capacitor iOS..."
echo ""

# Install @capacitor/ios if not already installed
if [ ! -d "node_modules/@capacitor/ios" ]; then
    echo "Installing @capacitor/ios..."
    npm install @capacitor/ios
    echo -e "${GREEN}✅ @capacitor/ios installed${NC}"
else
    echo -e "${GREEN}✓ @capacitor/ios already installed${NC}"
fi

echo ""
echo "🔨 Step 4: Building static export..."
echo ""

# Check if NEXT_PUBLIC_API_URL is set
if [ -z "$NEXT_PUBLIC_API_URL" ]; then
    if [ -f .env.local ]; then
        API_URL=$(grep "NEXT_PUBLIC_API_URL" .env.local | cut -d '=' -f2 | tr -d '"' | tr -d "'")
        if [ -n "$API_URL" ]; then
            export NEXT_PUBLIC_API_URL="$API_URL"
            echo "📡 Using API URL from .env.local: $API_URL"
        fi
    fi
    
    if [ -z "$NEXT_PUBLIC_API_URL" ]; then
        echo -e "${YELLOW}⚠ NEXT_PUBLIC_API_URL not set${NC}"
        echo "The static build needs to know where your Vercel API is deployed."
        read -p "Enter your Vercel deployment URL (e.g., https://your-app.vercel.app): " API_URL
        export NEXT_PUBLIC_API_URL="$API_URL"
    fi
fi

# Build static export
echo "Building Next.js static export..."
BUILD_STATIC=true npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
fi

echo ""
echo "📁 Step 5: Copying static build to public/..."
echo ""

# Copy to public
npm run copy:static

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Copy failed${NC}"
    exit 1
fi

echo ""
echo "🔄 Step 6: Adding iOS platform (if not exists)..."
echo ""

# Add iOS platform if it doesn't exist
if [ ! -d "ios" ]; then
    echo "Adding iOS platform..."
    npx cap add ios
    echo -e "${GREEN}✅ iOS platform added${NC}"
else
    echo -e "${GREEN}✓ iOS platform already exists${NC}"
fi

echo ""
echo "🔄 Step 7: Syncing with Capacitor..."
echo ""

# Sync Capacitor
npx cap sync ios

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Capacitor sync failed${NC}"
    exit 1
fi

echo ""
echo "📦 Step 8: Installing CocoaPods dependencies..."
echo ""

# Install CocoaPods dependencies
cd ios/App
pod install
cd ../..

echo ""
echo -e "${GREEN}✅ iOS build setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Open in Xcode:"
echo "   npx cap open ios"
echo ""
echo "2. Or open manually:"
echo "   open ios/App/App.xcworkspace"
echo ""
echo "3. In Xcode:"
echo "   - Select your development team in Signing & Capabilities"
echo "   - Choose a device or simulator"
echo "   - Click the Play button to build and run"
echo ""
echo "4. To build for distribution:"
echo "   - Product → Archive (creates .xcarchive)"
echo "   - Then distribute via App Store, Ad Hoc, or Enterprise"
echo ""

