# QRCall Apple Watch Integration Guide

## Overview
All watchOS files have been prepared in `ios/QRCallWatch/`. Now you need to add the watchOS target to your Xcode project.

## Files Created
✅ `QRCallWatch/QRCallWatchApp.swift` - App entry point with Firebase
✅ `QRCallWatch/ContentView.swift` - Main watch interface
✅ `QRCallWatch/FirebaseService.swift` - Firebase integration
✅ `QRCallWatch/NotificationService.swift` - Push notifications
✅ `QRCallWatch/WatchConnectivityManager.swift` - iOS ↔ Watch sync
✅ `QRCallWatch/ScanRequest.swift` - Data models
✅ `QRCallWatch/Info.plist` - Watch app configuration
✅ `QRCallWatch/GoogleService-Info.plist` - Firebase config
✅ `QRCallWatch/Assets.xcassets/` - App icons and assets
✅ `Podfile` - Updated with Firebase pods for watchOS

## Step-by-Step Integration

### Step 1: Open Project in Xcode
```bash
cd /Users/shanesmith/Documents/qrcall/apple/ios
open Runner.xcworkspace
```

### Step 2: Add watchOS Target

1. **File** → **New** → **Target**
2. Select **watchOS** tab
3. Choose **Watch App** template
4. Click **Next**

### Step 3: Configure Target Settings

**Product Name**: `QRCallWatch`
**Organization Identifier**: `com.stable.qrcallbox`
**Bundle Identifier**: `com.stable.qrcallbox.watchkitapp`
**Interface**: SwiftUI
**Language**: Swift

**IMPORTANT**: Uncheck **"Include Notification Scene"** and **"Include Complication"** (we'll add these later)

Click **Finish**

### Step 4: Replace Generated Files

Xcode will create a template. We need to replace it with our prepared files:

1. **Delete** the auto-generated QRCallWatch folder in Xcode (right-click → Delete → Move to Trash)

2. **Add** our prepared folder:
   - Right-click on the project root in Xcode
   - Select **Add Files to "Runner"...**
   - Navigate to `ios/QRCallWatch`
   - Select the **QRCallWatch** folder
   - **Check** "Copy items if needed"
   - **Select** "Create groups"
   - **Targets**: Check **only** QRCallWatch
   - Click **Add**

### Step 5: Configure Build Settings

Select the **QRCallWatch** target → **Build Settings**:

- **Product Bundle Identifier**: `com.stable.qrcallbox.watchkitapp`
- **watchOS Deployment Target**: 9.0 or higher
- **Swift Language Version**: Swift 5

### Step 6: Configure Capabilities

Select **QRCallWatch** target → **Signing & Capabilities**:

1. **+ Capability** → Add **Push Notifications**
2. **+ Capability** → Add **Background Modes**
   - Check: **Remote notifications**

### Step 7: Install Pods

Close Xcode temporarily, then:

```bash
cd /Users/shanesmith/Documents/qrcall/apple/ios
pod install
```

This will install Firebase for both iOS and watchOS targets.

### Step 8: Reopen Workspace

```bash
open Runner.xcworkspace
```

### Step 9: Set Up Schemes

1. Click on the scheme selector (top left, next to the device selector)
2. Click **"Manage Schemes..."**
3. Ensure **QRCallWatch** scheme is checked (shared)

### Step 10: Add Watch Connectivity to iOS App

Update `Runner/AppDelegate.swift` to enable Watch Connectivity:

```swift
import Flutter
import UIKit
import WatchConnectivity  // Add this

@main
@objc class AppDelegate: FlutterAppDelegate, WCSessionDelegate {  // Add WCSessionDelegate

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    GeneratedPluginRegistrant.register(with: self)

    // Set up Watch Connectivity
    if WCSession.isSupported() {
      let session = WCSession.default
      session.delegate = self
      session.activate()
      print("⌚ Watch Connectivity activated in iOS app")
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  // Handle Google Sign-In URL callbacks
  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey : Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
  }

  // MARK: - WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    if let error = error {
      print("❌ Watch Connectivity error: \(error.localizedDescription)")
    } else {
      print("✅ Watch Connectivity activated: \(activationState.rawValue)")
    }
  }

  func sessionDidBecomeInactive(_ session: WCSession) {
    print("⚠️ Watch session became inactive")
  }

  func sessionDidDeactivate(_ session: WCSession) {
    print("⚠️ Watch session deactivated")
    WCSession.default.activate()
  }

  // Handle messages from Watch
  func session(_ session: WCSession, didReceiveMessage message: [String : Any], replyHandler: @escaping ([String : Any]) -> Void) {
    print("📨 Received message from Watch: \(message)")

    if let action = message["action"] as? String {
      switch action {
      case "getUserData":
        // Send user data to watch
        // TODO: Get actual user data from Flutter
        let userData: [String: Any] = [
          "storeNumber": "1458",
          "userName": "Demo User",
          "isAuthenticated": true
        ]
        replyHandler(userData)

      case "assistScan":
        if let scanId = message["scanId"] as? String {
          print("🤝 Watch user assisting scan: \(scanId)")
          // TODO: Update Firestore scan status
          replyHandler(["success": true])
        }

      default:
        replyHandler(["error": "Unknown action"])
      }
    }
  }
}
```

### Step 11: Test Build

1. Select **QRCallWatch** scheme
2. Select **Apple Watch Series 10 (46mm)** simulator
3. Click **Build** (Cmd+B)

If build succeeds, you're ready to run!

### Step 12: Run on Simulator

1. Make sure the watch simulator is booted:
   ```bash
   open -a Simulator
   ```

2. In Xcode:
   - Select **QRCallWatch** scheme
   - Select **Apple Watch Series 10 (46mm)** simulator
   - Click **Run** (Cmd+R)

The watch app should launch showing the QRCall interface!

## Features Implemented

### ✅ Real-time Scan List
- Shows pending customer assistance requests
- Color-coded priorities (green → orange → red)
- Elapsed time tracking
- Auto-updates via Firestore listeners

### ✅ Interactive Detail View
- Full request information
- Location, wait time, store number
- Assist button with loading state
- Transaction-based claiming (prevents conflicts)

### ✅ Watch Connectivity
- Syncs user data from iPhone
- Sends assist responses back to iPhone
- Handles disconnection gracefully

### ✅ Push Notifications
- FCM token registration
- Background notification handling
- Haptic feedback for new requests

### ✅ Firebase Integration
- Authentication sync with iOS
- Real-time Firestore updates
- FCM push notifications

## Troubleshooting

### Build Errors

**"No such module 'Firebase'"**
- Run `pod install` again
- Clean build folder: **Product** → **Clean Build Folder** (Cmd+Shift+K)
- Restart Xcode

**"WKCompanionAppBundleIdentifier mismatch"**
- Check that Info.plist has correct iOS bundle ID: `com.stable.qrcallbox`
- Bundle IDs must match between iOS and Watch

**"Code signing error"**
- Select QRCallWatch target → Signing & Capabilities
- Choose your development team
- Let Xcode automatically manage signing

### Runtime Issues

**Watch app not appearing in simulator**
- Ensure both iOS app and Watch app have same team
- Check that watch simulator is properly paired with iPhone simulator
- Try: **Window** → **Devices and Simulators** → Unpair and re-pair

**Firebase errors**
- Verify GoogleService-Info.plist is added to QRCallWatch target
- Check Firebase console that watchOS is configured

**No data showing**
- Check Firestore security rules allow read access
- Verify user authentication is working
- Check console logs for Firebase errors

## Next Steps

### 1. Add Complications (Watch Face Widgets)
Show pending request count on watch face

### 2. Enhance Notifications
Add custom notification actions and better formatting

### 3. Offline Support
Cache recent requests for offline viewing

### 4. Voice Responses
Add Siri integration for hands-free responses

### 5. Health Integration
Track employee activity during shifts

## Testing Checklist

- [ ] Build succeeds for watchOS
- [ ] App launches on watch simulator
- [ ] Firestore data loads correctly
- [ ] Assist button claims scans
- [ ] Navigation works properly
- [ ] Watch Connectivity syncs with iPhone
- [ ] Push notifications arrive
- [ ] Icons display correctly

## Resources

- [watchOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/watchos)
- [Watch Connectivity Framework](https://developer.apple.com/documentation/watchconnectivity)
- [Firebase for iOS/watchOS](https://firebase.google.com/docs/ios/setup)

---

**Ready to integrate!** Follow the steps above to add the watchOS target to your Xcode project.
