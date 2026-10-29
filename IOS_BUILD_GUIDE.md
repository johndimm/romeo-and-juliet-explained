# iOS Build Guide: Creating an Installable IPA File

## Prerequisites

1. **Apple Developer Account** (free or paid)
   - Free account: Can install on your own devices
   - Paid account ($99/year): Can distribute via App Store, TestFlight, or ad-hoc

2. **Xcode** installed with iOS platform support

3. **Code Signing Certificates** (Xcode can create these automatically)

## Step-by-Step Process

### Method 1: Using the Build Script (Automated)

Your project has a `build-ios.sh` script that automates most of this:

```bash
./build-ios.sh
```

This script:
1. Builds the static web bundle
2. Syncs Capacitor
3. Installs CocoaPods
4. Creates an archive
5. Exports an IPA file

**The IPA will be in:** `ios/build/App.ipa`

### Method 2: Using Xcode GUI (Recommended for First Time)

#### Step 1: Open Project in Xcode

```bash
open ios/App/App.xcworkspace
```

#### Step 2: Configure Signing

**Finding the Target:**

1. In Xcode, look at the **left sidebar** (Project Navigator)
2. Click on the **blue project icon** at the very top (it says "App" or shows a folder icon)
   - This is the **project**, not a file
3. In the main editor area, you'll see **TARGETS** section
4. Click on **"App"** under TARGETS (it has a blue icon with a checkmark)
   - If you don't see TARGETS, make sure you clicked the project icon (blue), not a file

**Alternative way to find it:**
- Look at the top toolbar where it shows the scheme selector (next to the play/stop buttons)
- Click the scheme dropdown - you should see "App" there
- Or go to: **Product > Scheme > App** (if it's not already selected)

**Once you've selected the App target:**

1. Click on the **"Signing & Capabilities"** tab at the top
2. Check **"Automatically manage signing"**
3. Select your **Team** from the dropdown
   - If you don't see your team, add it: **Xcode > Settings > Accounts** (or **Preferences > Accounts**)
   - Click the **"+"** button to add your Apple ID
4. Xcode will automatically:
   - Create/download development certificates
   - Create provisioning profiles
   - Configure bundle identifier

**If you still can't find it:**
- Make sure you opened the **workspace** file: `App.xcworkspace` (NOT `App.xcodeproj`)
- The workspace file is required because of CocoaPods dependencies

#### Step 3: Build Archive

1. Select **"Any iOS Device"** as the build destination (not a simulator)
2. Go to **Product > Archive**
3. Wait for the archive to build
4. The **Organizer** window will open automatically

#### Step 4: Export IPA

In the Organizer window:

1. Select your archive
2. Click **"Distribute App"**
3. You'll see a dialog with distribution methods. Choose one:

   **⚠️ Important: Free Apple ID (Personal Team) Limitations:**
   - If you see "Team 'Your Name (Personal Team)' is not enrolled in the Apple Developer Program"
   - You're using a **free Apple ID**, which has limitations:
     - ✅ **Debugging**: Works (for your own devices only)
     - ✅ **Release Testing**: Works (limited to 3 apps, 3 devices per year)
     - ❌ **TestFlight Internal Only**: Requires paid account ($99/year)
     - ❌ **App Store Connect**: Requires paid account
     - ❌ **Enterprise**: Requires enterprise account ($299/year)

   **For Free Apple ID (Personal Team):**
   - **Debugging**: ✅ Recommended - For installing on your own devices
     - Best for: Your own devices, development testing
     - Creates a development-signed IPA
     - Works with free account
   
   - **Release Testing**: ✅ Works but limited
     - Best for: Distributing to up to 3 specific devices per year
     - Requires: Device UDIDs registered
     - Creates an ad-hoc signed IPA
     - **Limitation**: Only 3 apps and 3 devices per year with free account

   **For Paid Apple Developer Account ($99/year):**
   - **TestFlight Internal Only**: For internal testing via TestFlight
     - Best for: Testing with your team (up to 100 internal testers)
     - Requires: Paid Apple Developer account
     - Uploads to TestFlight automatically
   
   - **App Store Connect**: For App Store submission
     - Best for: Publishing to the App Store
     - Uploads directly to App Store Connect
   
   - **Enterprise**: For enterprise distribution
     - Best for: Internal company distribution
     - Requires: Enterprise Developer account ($299/year)
   
   - **Custom**: For custom distribution options
     - Allows manual configuration of signing and export options

4. Click **"Distribute"** and follow the prompts:
   - Select signing options (usually "Automatically manage signing")
   - For "Debugging" or "Release Testing": Choose export location
   - For "TestFlight" or "App Store Connect": Follow upload process
   - Wait for export/upload to complete

5. The IPA file will be:
   - **Debugging/Release Testing**: Saved to your chosen location
   - **TestFlight/App Store**: Uploaded to App Store Connect

## Distribution Methods Explained

### Free Apple ID (Personal Team) vs Paid Account

**Free Apple ID Limitations:**
- ✅ Can use "Debugging" method
- ✅ Can use "Release Testing" (limited to 3 apps, 3 devices per year)
- ❌ Cannot use TestFlight
- ❌ Cannot submit to App Store
- ❌ Cannot use Enterprise distribution
- Apps expire after 7 days (need to reinstall)

**Paid Apple Developer Account ($99/year):**
- ✅ All distribution methods available
- ✅ TestFlight for up to 10,000 testers
- ✅ App Store submission
- ✅ Apps don't expire
- ✅ Up to 100 devices for ad-hoc distribution

### 1. Debugging
- **Use case**: Testing on your own registered devices
- **Requirements**: 
  - Development certificate (created automatically)
  - Device registered in your Apple Developer account
  - ✅ Works with **free Apple ID**
- **Device limit**: Devices you've registered in your developer account
- **Installation**: 
  - Via Xcode: Window > Devices and Simulators > Install app
  - Via Finder (iOS 17+): Drag IPA to connected device
- **Best for**: Personal development and testing
- **Note**: With free account, apps expire after 7 days

### 2. TestFlight Internal Only
- **Use case**: Internal testing with your team (up to 100 testers)
- **Requirements**: 
  - ✅ **Paid Apple Developer account** ($99/year) required
  - App Store Connect account
- **Device limit**: 100 internal testers
- **Installation**: Via TestFlight app (testers receive invitation)
- **Best for**: Team testing before public release
- **Note**: Uploads automatically to App Store Connect
- **❌ Not available with free Apple ID**

### 3. Release Testing (Ad Hoc)
- **Use case**: Distributing to specific devices
- **Requirements**: 
  - Distribution certificate
  - Device UDIDs registered
  - ✅ Works with **free Apple ID** (but limited)
- **Device limit**: 
  - Free account: **3 devices per year**
  - Paid account: 100 devices per year
- **Installation**: Direct install (requires device UDID and IPA file)
- **Best for**: Testing with specific external testers
- **Note**: Free account limited to 3 apps and 3 devices per year

### 4. App Store Connect
- **Use case**: Public distribution via App Store
- **Requirements**: 
  - ✅ **Paid Apple Developer account** ($99/year) required
  - Distribution certificate
  - App Store Connect account
- **Installation**: Via App Store after Apple review and approval
- **Best for**: Public release
- **❌ Not available with free Apple ID**

### 5. Enterprise
- **Use case**: Internal company distribution (no App Store)
- **Requirements**: Enterprise Developer account ($299/year)
- **Device limit**: Unlimited (within your organization)
- **Installation**: Via enterprise distribution method
- **Best for**: Large organizations distributing apps internally
- **❌ Not available with free Apple ID**

### 6. Custom
- **Use case**: Manual configuration of export options
- **Requirements**: Varies based on your configuration
- **Best for**: Advanced users who need specific export settings

## Installing the IPA on iPhone

### Option 1: Via Xcode (Debugging builds)
1. Connect iPhone to Mac via USB
2. Trust the computer on iPhone if prompted
3. In Xcode: **Window > Devices and Simulators**
4. Select your device
5. Click **"+"** under "Installed Apps"
6. Select your IPA file

### Option 2: Via Finder (iOS 17+, Debugging builds)
1. Connect iPhone to Mac via USB
2. Open Finder
3. Select your iPhone in sidebar
4. Drag the IPA file to the device
5. The app will install automatically

### Option 3: Via TestFlight (Recommended for Testing)
1. Export using **"TestFlight Internal Only"** method
2. Wait for upload to App Store Connect to complete
3. Go to [App Store Connect](https://appstoreconnect.apple.com)
4. Navigate to your app > TestFlight tab
5. Add internal testers (up to 100)
6. Testers install **TestFlight** app from App Store
7. They receive invitation email and can install your app
8. **Best option** for sharing with testers

### Option 4: Direct Install (Release Testing/Ad Hoc)
1. Export using **"Release Testing"** method
2. Get device UDID from tester (Settings > General > About > Identifier)
3. Register device in [Apple Developer Portal](https://developer.apple.com/account/resources/devices/list)
4. Re-export with updated provisioning profile
5. Send IPA file to tester
6. Tester installs via:
   - iTunes (older method)
   - Third-party tools (3uTools, etc.)
   - Or use TestFlight instead (easier)

### Option 5: Via Third-Party Services (Ad Hoc builds)
- **Diawi**: Upload IPA, get install link (requires ad-hoc build)
- **InstallOnAir**: Similar service
- **Note**: These require "Release Testing" distribution method

## Troubleshooting

### "Team 'Your Name (Personal Team)' is not enrolled" (After Paying for Developer Account)

**If you've paid for an Apple Developer account but still see "Personal Team":**

**Solution: Switch to Your Paid Developer Account**

1. **Add your paid account to Xcode:**
   - Go to **Xcode > Settings** (or **Preferences**)
   - Click **Accounts** tab
   - Click the **"+"** button
   - Select **"Apple ID"**
   - Sign in with the **same Apple ID** you used to enroll in the Developer Program
   - Wait for Xcode to verify your account

2. **Verify your account is enrolled:**
   - In Accounts, you should see your account listed
   - Under your account, it should show:
     - ✅ **"Apple Developer Program"** (not just "Personal Team")
     - Your team name (e.g., "John Dimm" without "(Personal Team)")
   - If it still shows "Personal Team", wait a few minutes for Apple's servers to update

3. **Select the paid team in your project:**
   - Open your project: `open ios/App/App.xcworkspace`
   - Click the **blue project icon** in sidebar
   - Select **"App"** under TARGETS
   - Click **"Signing & Capabilities"** tab
   - In the **Team** dropdown, select your **paid team** (the one WITHOUT "Personal Team" in the name)
     - It should show as "John Dimm" or your organization name
     - NOT "John Dimm (Personal Team)"
   - Xcode will automatically configure signing with your paid account

4. **If you don't see your paid team:**
   - Wait 5-10 minutes after enrollment (Apple's servers need to sync)
   - Sign out and sign back in: Xcode > Settings > Accounts > Select account > Click "-" then add again
   - Check your enrollment status at: https://developer.apple.com/account
   - Make sure you're signed in with the same Apple ID you used to enroll

5. **After switching teams, try exporting again:**
   - All distribution methods should now work (TestFlight, App Store, etc.)

### "Team 'Your Name (Personal Team)' is not enrolled in the Apple Developer Program" (Even with Debugging - Free Account)

**This error can appear even when selecting "Debugging" method.**

**Solution 1: Install directly via Xcode (Easiest for free account)**
Instead of exporting an IPA, install directly:
1. Connect your iPhone to Mac via USB
2. In Xcode: **Window > Devices and Simulators**
3. Select your device
4. Select your archive in the Organizer
5. Click **"+"** under "Installed Apps"
6. Select the `.app` file from your archive (not an IPA)
   - Location: `ios/build/App.xcarchive/Products/Applications/App.app`
7. The app will install directly

**Solution 2: Remove teamID from export options**
The teamID might be causing issues. Try:
1. In Xcode Organizer, when exporting:
2. Select "Debugging"
3. When prompted for signing, choose "Automatically manage signing"
4. Don't specify a teamID - let Xcode use your Personal Team automatically

**Solution 3: Build and install directly (No export needed)**
**First, configure signing:**
1. Open project in Xcode: `open ios/App/App.xcworkspace`
2. Click the **blue project icon** in the left sidebar (top of Project Navigator)
3. Select **"App"** under **TARGETS** (blue icon with checkmark)
4. Click **"Signing & Capabilities"** tab
5. Check **"Automatically manage signing"**
6. In the **Team** dropdown, select **"John Dimm (Personal Team)"** or your Apple ID
   - If you don't see your team:
     - Click the **"+"** button or go to **Xcode > Settings > Accounts**
     - Add your Apple ID
     - Return to Signing & Capabilities and select your team
7. Xcode will automatically:
   - Create a development certificate
   - Create a provisioning profile
   - Set the bundle identifier (may add a suffix like `.JohnDimm`)

**Then build and install:**
1. Connect iPhone to Mac via USB
2. Trust the computer on iPhone if prompted
3. In Xcode: Select your iPhone from the device dropdown (top toolbar, next to scheme)
4. Click the **Play button** (or Product > Run)
5. Xcode will build and install directly to your device
6. This works with free Apple ID and doesn't require exporting

**Solution 4: Use Xcode's direct install from archive**
1. In Organizer, right-click your archive
2. Select "Show in Finder"
3. Navigate to: `App.xcarchive/Products/Applications/`
4. You'll find `App.app` there
5. Drag this to Xcode's Devices window (Window > Devices and Simulators)

**Why this happens:**
- Xcode sometimes checks enrollment even for debugging
- Free Personal Team should work, but Xcode can be overly strict
- Direct installation bypasses the export/validation step

### "Cannot find App target"

**Make sure you opened the workspace, not the project:**
- ✅ Correct: `ios/App/App.xcworkspace` (has `.xcworkspace` extension)
- ❌ Wrong: `ios/App/App.xcodeproj` (has `.xcodeproj` extension)

**To verify:**
1. Check the Xcode window title - it should say "App.xcworkspace"
2. If it says "App.xcodeproj", close it and open the workspace instead:
   ```bash
   open ios/App/App.xcworkspace
   ```

**Finding the target in Xcode:**
1. In the **left sidebar** (Project Navigator), click the **blue project icon** at the top
2. In the main area, you should see:
   - **PROJECT** section (with "App" project)
   - **TARGETS** section (with "App" target)
3. Click **"App"** under **TARGETS** (blue icon with checkmark)
4. Then click the **"Signing & Capabilities"** tab

**If TARGETS section is missing:**
- You might have a file selected instead of the project
- Click the blue project icon in the sidebar again
- Make sure nothing is selected in the editor area

### "No signing certificate found"
**Solution**: 
1. Open project in Xcode
2. Go to Signing & Capabilities
3. Select your team
4. Xcode will create certificates automatically

### "No provisioning profiles found"
**Solution**:
- Ensure "Automatically manage signing" is checked
- Xcode will create profiles automatically

### "Device not registered"
**Solution**:
1. In Xcode: Window > Devices and Simulators
2. Select your device
3. Click "Use for Development"
4. Or register at: https://developer.apple.com/account/resources/devices/list

### "App installation failed"
**Possible causes**:
- Device not registered for development
- Wrong distribution method (e.g., using App Store build for ad-hoc)
- Expired certificate or profile
- Device storage full

## Current Project Configuration

Your project is currently set up for **development** distribution:
- **Team ID**: Q7GDVRDLKY
- **Bundle ID**: dimm.explainers.shakespeare.romeo-and-juliet
- **Export method**: development (in `ios/exportOptions.plist`)

**Note**: If you're using a free Apple ID (Personal Team), you can only use:
- `development` - For your devices (recommended for free account)
- `ad-hoc` - For specific testers (limited to 3 devices per year with free account)

To change distribution method, edit `ios/exportOptions.plist` and change the `method` value:
- `development` - For your devices (✅ works with free account)
- `ad-hoc` - For specific testers (✅ works with free account, but limited)
- `app-store` - For App Store submission (❌ requires paid account)
- `enterprise` - For enterprise distribution (❌ requires enterprise account)

## Upgrading to Paid Account

If you want to use TestFlight or submit to the App Store:
1. Go to [Apple Developer Program](https://developer.apple.com/programs/)
2. Enroll for $99/year
3. After enrollment, your team will upgrade from "Personal Team" to enrolled status
4. You'll then have access to all distribution methods

## Quick Reference

**Build archive via command line:**
```bash
./build-ios.sh
```

**Build archive via Xcode:**
1. Open `ios/App/App.xcworkspace`
2. Product > Archive

**Export IPA location:**
- Script: `ios/build/App.ipa`
- Xcode: Location you choose during export

**Install on device:**
- Development: Xcode or Finder (iOS 17+)
- Ad Hoc: Direct install or TestFlight
- App Store: Via App Store after approval
- TestFlight: Via TestFlight app (recommended)
