#!/bin/bash

set -e  # Exit on error

echo "🚀 Android Build Setup Script"
echo "=============================="
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

# Function to add to shell config if not already present
add_to_shell_config() {
    local line=$1
    local config_file=$2
    
    if ! grep -Fxq "$line" "$config_file" 2>/dev/null; then
        echo "$line" >> "$config_file"
        echo "✅ Added to $config_file"
    else
        echo "ℹ️  Already present in $config_file"
    fi
}

# Detect shell config file
if [ -n "$ZSH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ]; then
    SHELL_CONFIG="$HOME/.bash_profile"
else
    SHELL_CONFIG="$HOME/.profile"
fi

echo "📋 Step 1: Checking prerequisites..."
echo ""

# Check Java
echo -n "Checking Java... "
if command_exists java; then
    JAVA_VERSION_OUTPUT=$(java -version 2>&1 | head -n 1)
    JAVA_VERSION=$(echo "$JAVA_VERSION_OUTPUT" | sed -E 's/.*version "([^"]*)".*/\1/' | cut -d'.' -f1)
    if [ -n "$JAVA_VERSION" ] && [ "$JAVA_VERSION" -ge 11 ] 2>/dev/null; then
        echo -e "${GREEN}✓ Found Java $JAVA_VERSION${NC}"
        JAVA_INSTALLED=true
    else
        echo -e "${YELLOW}⚠ Java found but version check failed or version < 11${NC}"
        echo "   Output: $JAVA_VERSION_OUTPUT"
        JAVA_INSTALLED=false
    fi
else
    echo -e "${RED}✗ Not found${NC}"
    JAVA_INSTALLED=false
fi

# Check Homebrew (for macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -n "Checking Homebrew... "
    if command_exists brew; then
        echo -e "${GREEN}✓ Found${NC}"
        BREW_INSTALLED=true
    else
        echo -e "${YELLOW}⚠ Not found - will need manual installation${NC}"
        BREW_INSTALLED=false
    fi
fi

# Check Android SDK
echo -n "Checking Android SDK... "
if [ -d "$HOME/Library/Android/sdk" ] || [ -n "$ANDROID_HOME" ]; then
    ANDROID_SDK="$ANDROID_HOME"
    if [ -z "$ANDROID_SDK" ]; then
        ANDROID_SDK="$HOME/Library/Android/sdk"
    fi
    if [ -d "$ANDROID_SDK" ]; then
        echo -e "${GREEN}✓ Found at $ANDROID_SDK${NC}"
        ANDROID_SDK_INSTALLED=true
    else
        echo -e "${RED}✗ Not found${NC}"
        ANDROID_SDK_INSTALLED=false
    fi
else
    echo -e "${RED}✗ Not found${NC}"
    ANDROID_SDK_INSTALLED=false
fi

# Check adb
echo -n "Checking Android Debug Bridge (adb)... "
if command_exists adb; then
    echo -e "${GREEN}✓ Found${NC}"
    ADB_INSTALLED=true
else
    echo -e "${RED}✗ Not found${NC}"
    ADB_INSTALLED=false
fi

echo ""
echo "📦 Step 2: Installing prerequisites..."
echo ""

# Install Java if needed
if [ "$JAVA_INSTALLED" = false ]; then
    if [[ "$OSTYPE" == "darwin"* ]] && [ "$BREW_INSTALLED" = true ]; then
        echo "Installing Java JDK 17..."
        brew install openjdk@17
        
        # Detect Homebrew prefix (Intel vs Apple Silicon)
        BREW_PREFIX=$(brew --prefix)
        JAVA_PATH="$BREW_PREFIX/opt/openjdk@17"
        
        # Link Java (requires sudo)
        echo "Linking Java (may require sudo password)..."
        sudo ln -sfn "$JAVA_PATH/libexec/openjdk.jdk" /Library/Java/JavaVirtualMachines/openjdk-17.jdk 2>/dev/null || true
        
        # Add to PATH
        add_to_shell_config "export PATH=\"$JAVA_PATH/bin:\$PATH\"" "$SHELL_CONFIG"
        add_to_shell_config "export JAVA_HOME=\"$JAVA_PATH\"" "$SHELL_CONFIG"
        
        export PATH="$JAVA_PATH/bin:$PATH"
        export JAVA_HOME="$JAVA_PATH"
        
        echo -e "${GREEN}✅ Java installed at $JAVA_PATH${NC}"
    else
        echo -e "${RED}❌ Please install Java JDK 11 or higher manually:${NC}"
        echo "   macOS: brew install openjdk@17"
        echo "   Or download from: https://adoptium.net/"
        exit 1
    fi
fi

# Android Studio check
if [ "$ANDROID_SDK_INSTALLED" = false ]; then
    echo ""
    echo -e "${YELLOW}⚠ Android SDK not found${NC}"
    echo "Please:"
    echo "1. Download and install Android Studio from: https://developer.android.com/studio"
    echo "2. Open Android Studio and complete the setup wizard"
    echo "3. Let it download the Android SDK components"
    echo "4. Run this script again after installation"
    echo ""
    read -p "Have you installed Android Studio? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Please install Android Studio first, then run this script again."
        exit 1
    fi
    
    # Set default Android SDK path
    ANDROID_SDK="$HOME/Library/Android/sdk"
    if [ ! -d "$ANDROID_SDK" ]; then
        echo "Android SDK not found at default location. Please enter the path:"
        read -p "Android SDK path: " ANDROID_SDK
    fi
fi

# If SDK exists but adb not in PATH, set up PATH
if [ "$ANDROID_SDK_INSTALLED" = true ] && [ "$ADB_INSTALLED" = false ]; then
    echo ""
    echo -e "${YELLOW}⚠ Android SDK found but adb not in PATH${NC}"
    echo "Setting up Android SDK PATH..."
    ANDROID_SDK="$ANDROID_HOME"
    if [ -z "$ANDROID_SDK" ]; then
        ANDROID_SDK="$HOME/Library/Android/sdk"
    fi
fi

# Set up Android environment variables
if [ "$ANDROID_SDK_INSTALLED" = true ] || [ -n "$ANDROID_SDK" ]; then
    echo ""
    echo "Setting up Android environment variables..."
    
    if [ -z "$ANDROID_SDK" ]; then
        ANDROID_SDK="$ANDROID_HOME"
    fi
    if [ -z "$ANDROID_SDK" ]; then
        ANDROID_SDK="$HOME/Library/Android/sdk"
    fi
    
    add_to_shell_config "export ANDROID_HOME=\"$ANDROID_SDK\"" "$SHELL_CONFIG"
    add_to_shell_config 'export PATH=$PATH:$ANDROID_HOME/emulator' "$SHELL_CONFIG"
    add_to_shell_config 'export PATH=$PATH:$ANDROID_HOME/platform-tools' "$SHELL_CONFIG"
    add_to_shell_config 'export PATH=$PATH:$ANDROID_HOME/tools' "$SHELL_CONFIG"
    add_to_shell_config 'export PATH=$PATH:$ANDROID_HOME/tools/bin' "$SHELL_CONFIG"
    
    export ANDROID_HOME="$ANDROID_SDK"
    export PATH=$PATH:$ANDROID_HOME/emulator
    export PATH=$PATH:$ANDROID_HOME/platform-tools
    export PATH=$PATH:$ANDROID_HOME/tools
    export PATH=$PATH:$ANDROID_HOME/tools/bin
    
    echo -e "${GREEN}✅ Android environment variables configured${NC}"
fi

echo ""
echo "🔨 Step 3: Building static export..."
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
echo "📁 Step 4: Copying static build to public/..."
echo ""

# Copy to public
npm run copy:static

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Copy failed${NC}"
    exit 1
fi

echo ""
echo "🔄 Step 5: Setting up Android local.properties..."
echo ""

# Create local.properties file for Gradle to find Android SDK
ANDROID_LOCAL_PROPERTIES="android/local.properties"
if [ -n "$ANDROID_SDK" ]; then
    echo "sdk.dir=$ANDROID_SDK" > "$ANDROID_LOCAL_PROPERTIES"
    echo -e "${GREEN}✅ Created $ANDROID_LOCAL_PROPERTIES${NC}"
elif [ -n "$ANDROID_HOME" ]; then
    echo "sdk.dir=$ANDROID_HOME" > "$ANDROID_LOCAL_PROPERTIES"
    echo -e "${GREEN}✅ Created $ANDROID_LOCAL_PROPERTIES${NC}"
elif [ -d "$HOME/Library/Android/sdk" ]; then
    echo "sdk.dir=$HOME/Library/Android/sdk" > "$ANDROID_LOCAL_PROPERTIES"
    echo -e "${GREEN}✅ Created $ANDROID_LOCAL_PROPERTIES${NC}"
else
    echo -e "${YELLOW}⚠ Could not determine Android SDK location for local.properties${NC}"
fi

echo ""
echo "🔄 Step 6: Syncing with Capacitor..."
echo ""

# Sync Capacitor
npx cap sync android

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Capacitor sync failed${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ Android build setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Open Android Studio:"
echo "   cd android && open -a \"Android Studio\" ."
echo ""
echo "2. Or build from command line:"
echo "   cd android && ./gradlew assembleDebug"
echo ""
echo "3. Install on device:"
echo "   cd android && ./gradlew installDebug"
echo ""
echo "Remember to:"
echo "- Reload your shell config: source $SHELL_CONFIG"
echo "- Or restart your terminal for environment variables to take effect"
echo ""
