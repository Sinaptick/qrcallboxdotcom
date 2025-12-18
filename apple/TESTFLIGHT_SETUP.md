# QRCallBox iOS - TestFlight Distribution Guide

## Current Configuration
- **Bundle ID**: `com.stable.qrcallbox`
- **Version**: 1.7.32 (Build 47)
- **App Name**: QRCallBox
- **Project Path**: `/Users/shanesmith/Documents/qrcall/apple/`

---

## Step 1: Firebase iOS Configuration

### Add iOS App to Firebase Console
1. Go to https://console.firebase.google.com/project/qrwebaccdb/overview
2. Click **iOS+** icon to add iOS app
3. Enter details:
   - **Bundle ID**: `com.stable.qrcallbox`
   - **App nickname**: `QRCallBox iOS`
   - **App Store ID**: (leave blank for now)
4. **Download** `GoogleService-Info.plist`
5. Place it at: `apple/ios/Runner/GoogleService-Info.plist`

### Add to Xcode
```bash
# Open project in Xcode
cd /Users/shanesmith/Documents/qrcall/apple
open ios/Runner.xcworkspace
```

In Xcode:
1. Drag `GoogleService-Info.plist` into `Runner` folder in project navigator
2. ✅ Check "Copy items if needed"
3. ✅ Check "Runner" target

---

## Step 2: Configure App Signing in Xcode

### Open Signing & Capabilities
1. Open: `ios/Runner.xcworkspace` in Xcode
2. Select **Runner** project in navigator
3. Select **Runner** target
4. Click **Signing & Capabilities** tab

### Configure Automatic Signing
1. ✅ Check **Automatically manage signing**
2. Select **Team**: Your Apple Developer team
3. Xcode will create provisioning profiles automatically

### Required Capabilities
Add these capabilities (click **+ Capability**):
- **Push Notifications** (for FCM)
- **Background Modes** → Check:
  - ✅ Remote notifications
  - ✅ Background fetch (optional)

---

## Step 3: Register App ID in Apple Developer Portal

Go to https://developer.apple.com/account/resources/identifiers/list

1. Click **+** to create new identifier
2. Select **App IDs** → Continue
3. Select **App** → Continue
4. Configure:
   - **Description**: QRCallBox iOS
   - **Bundle ID**: `com.stable.qrcallbox` (Explicit)
   - **Capabilities**:
     - ✅ Push Notifications
     - ✅ Sign in with Apple (if using)
5. Click **Continue** → **Register**

---

## Step 4: Create App in App Store Connect

Go to https://appstoreconnect.apple.com

### Create New App
1. Click **+** → **New App**
2. Configure:
   - **Platform**: iOS
   - **Name**: QRCallBox
   - **Primary Language**: English (U.S.)
   - **Bundle ID**: `com.stable.qrcallbox`
   - **SKU**: `qrcallbox-ios` (unique identifier)
   - **User Access**: Full Access
3. Click **Create**

### Fill App Information
Navigate to your app → **App Information**:
- **Privacy Policy URL**: `https://qrwebaccdb.web.app/privacy-policy.html`
- **Category**: Business or Productivity
- **Subtitle**: Customer assistance notifications
- **Description**: (brief description of your app)

---

## Step 5: Build iOS Archive

### Method 1: Using Xcode (Recommended)
```bash
cd /Users/shanesmith/Documents/qrcall/apple
open ios/Runner.xcworkspace
```

In Xcode:
1. Select **Any iOS Device (arm64)** as destination (NOT Simulator)
2. **Product** → **Archive**
3. Wait for archive to complete (shows in Organizer)

### Method 2: Using Flutter CLI
```bash
cd /Users/shanesmith/Documents/qrcall/apple

# Clean build
flutter clean
flutter pub get

# Build IPA (requires Xcode signing configured)
flutter build ipa --release

# IPA location:
# build/ios/ipa/qrcallbox.ipa
```

---

## Step 6: Upload to App Store Connect

### Method A: Using Xcode Organizer (Easiest)
After archiving in Xcode:
1. Xcode Organizer opens automatically
2. Select your archive
3. Click **Distribute App**
4. Select **TestFlight & App Store** → **Next**
5. Select **Upload** → **Next**
6. Keep defaults → **Next**
7. Click **Upload**
8. Wait for processing (5-15 minutes)

### Method B: Using Transporter App
1. Download **Transporter** from Mac App Store
2. Open Transporter
3. Sign in with Apple ID
4. Drag `build/ios/ipa/qrcallbox.ipa` into Transporter
5. Click **Deliver**

### Method C: Using Command Line
```bash
# Create API Key in App Store Connect first:
# https://appstoreconnect.apple.com/access/api

xcrun altool --upload-app \
  --type ios \
  --file build/ios/ipa/qrcallbox.ipa \
  --apiKey YOUR_API_KEY \
  --apiIssuer YOUR_ISSUER_ID
```

---

## Step 7: Configure TestFlight

### Wait for Processing
- After upload, build processes for 5-15 minutes
- Check status: https://appstoreconnect.apple.com → Your App → TestFlight

### Add Internal Testers (Immediate)
1. Go to **TestFlight** tab
2. Click **Internal Testing**
3. Click **+** next to Testers
4. Add testers (anyone in your App Store Connect team)
5. **Save** → Testers receive email invite immediately

### Add External Testers (Requires Review)
1. Click **External Testing**
2. Create new group (e.g., "Beta Testers")
3. Add testers by email
4. First build requires **App Review** (24-48 hours)
5. Subsequent builds go live immediately

### TestFlight Information
Configure test details:
- **What to Test**: Brief description of features to test
- **Feedback Email**: Your support email
- **Marketing URL**: `https://qrwebaccdb.web.app`
- **Privacy Policy URL**: `https://qrwebaccdb.web.app/privacy-policy.html`

---

## Step 8: Distribute to Testers

### Testers Install App
1. Testers download **TestFlight** from App Store
2. Open invite email/link
3. Accept invitation in TestFlight
4. Install QRCallBox from TestFlight
5. Provide feedback via TestFlight app

### Get TestFlight Public Link
1. Go to **TestFlight** → Your build
2. Enable **Public Link**
3. Copy public link (e.g., `https://testflight.apple.com/join/ABCD1234`)
4. Share this link with testers

---

## Step 9: Create iOS Download Page

Add to your web app download page:

```html
<!-- Add to dist/app/index.html -->
<div class="platform-tabs">
    <button class="tab-button active" onclick="showPlatform('android')">Android</button>
    <button class="tab-button" onclick="showPlatform('ios')">iOS</button>
</div>

<div id="android-content" class="platform-content">
    <!-- Existing Android download content -->
</div>

<div id="ios-content" class="platform-content" style="display: none;">
    <div class="version">Version 1.7.32 (Build 47) - iOS Beta</div>

    <a href="https://testflight.apple.com/join/YOUR_CODE" class="download-btn">
        <span>🍎</span>
        Join iOS Beta via TestFlight
    </a>

    <div class="features">
        <h3>How to Install</h3>
        <ol>
            <li>Install <strong>TestFlight</strong> from App Store</li>
            <li>Tap the button above or enter code: <code>YOUR_CODE</code></li>
            <li>Accept the invitation in TestFlight</li>
            <li>Install QRCallBox from TestFlight</li>
        </ol>
    </div>
</div>
```

---

## Troubleshooting

### "No accounts with App Store Connect access"
- Ensure your Apple ID is added to App Store Connect team
- Check at: https://appstoreconnect.apple.com/access/users

### "Failed to register bundle identifier"
- Bundle ID `com.stable.qrcallbox` must be registered in Developer Portal
- Go to: https://developer.apple.com/account/resources/identifiers/list

### "Provisioning profile doesn't include signing certificate"
- Use **Automatic** signing in Xcode
- Or manually create provisioning profile in Developer Portal

### "Missing GoogleService-Info.plist"
- Download from Firebase Console
- Place in `ios/Runner/` directory
- Add to Xcode project (drag & drop)

### Build fails with signing errors
```bash
# Clean and rebuild
cd /Users/shanesmith/Documents/qrcall/apple
flutter clean
rm -rf ios/Pods ios/.symlinks
flutter pub get
pod repo update
cd ios && pod install && cd ..
```

---

## Quick Commands Reference

```bash
# Navigate to project
cd /Users/shanesmith/Documents/qrcall/apple

# Check Flutter environment
flutter doctor -v

# Get dependencies
flutter pub get

# Run on iOS simulator (testing)
open -a Simulator
flutter run

# Build for device testing
flutter build ios --debug
flutter install

# Build release IPA for TestFlight
flutter clean
flutter pub get
flutter build ipa --release

# Open in Xcode
open ios/Runner.xcworkspace

# Check for iOS build issues
flutter build ios --release --verbose
```

---

## Version Management

### Update Version
Edit `pubspec.yaml`:
```yaml
version: 1.7.32+47
# Format: MAJOR.MINOR.PATCH+BUILD_NUMBER
```

Then rebuild:
```bash
flutter pub get
flutter build ipa --release
```

### Version History
- **1.7.32 (47)**: Active Associates shift display fix, iOS TestFlight release
- **1.7.31 (46)**: Privacy policy and Active Associates fixes
- Previous versions tracked in Android `CHANGELOG.md`

---

## TestFlight Limits
- **Internal Testers**: Up to 100 (no review required)
- **External Testers**: Up to 10,000 (first build requires review)
- **Build Expiration**: 90 days after upload
- **Tester Groups**: Unlimited

---

## Next Steps After TestFlight Setup

1. **Gather Feedback**: Monitor TestFlight feedback and analytics
2. **Iterate**: Upload new builds as needed (no review for subsequent builds)
3. **App Store Submission**: When ready for public release:
   - Complete App Store listing
   - Add screenshots (required sizes)
   - Submit for App Review
   - ~24-48 hour review time

---

## Support Resources
- **Apple Developer**: https://developer.apple.com/support/
- **TestFlight Guide**: https://developer.apple.com/testflight/
- **App Store Connect**: https://appstoreconnect.apple.com
- **Flutter iOS Deployment**: https://docs.flutter.dev/deployment/ios

---

**Project**: QRCallBox iOS
**Bundle ID**: com.stable.qrcallbox
**Current Version**: 1.7.32 (47)
**Updated**: October 15, 2025
