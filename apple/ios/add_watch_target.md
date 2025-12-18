# Quick Guide: Add watchOS Target

## You have Xcode open now. Follow these steps:

### Step 1: Add New Target
1. Click **File** → **New** → **Target** (or click the project in the navigator, then click the + button under targets)
2. Select **watchOS** tab at the top
3. Choose **Watch App** template
4. Click **Next**

### Step 2: Configure Target
- **Product Name**: `QRCallWatch`
- **Team**: Select your team
- **Organization Identifier**: `com.stable.qrcallbox`
- **Bundle Identifier**: Should auto-fill as `com.stable.qrcallbox.QRCallWatch`
- **Interface**: **SwiftUI**
- **Language**: **Swift**
- **Uncheck** "Include Notification Scene"
- **Uncheck** "Include Complication"

Click **Finish**

When asked **"Activate QRCallWatch scheme?"**, click **Activate**

### Step 3: Clean Up Generated Files

Xcode created a template folder. We'll replace it with our prepared files:

1. In the Project Navigator (left sidebar):
   - Find the **QRCallWatch** folder (the one Xcode just created)
   - **Delete it** (Right-click → Delete → Move to Trash)

2. **Add our prepared folder**:
   - Right-click on the **Runner** project (top level, blue icon)
   - Select **Add Files to "Runner"...**
   - Navigate to and select the `ios/QRCallWatch` folder we created
   - **Important settings in the dialog:**
     - ✅ Check "Copy items if needed"
     - ✅ Select "Create groups" (not Create folder references)
     - ✅ Under "Add to targets", check **only QRCallWatch** (uncheck Runner)
   - Click **Add**

### Step 4: Verify Files Added

In Project Navigator, you should now see under QRCallWatch:
- ✅ QRCallWatchApp.swift
- ✅ ContentView.swift
- ✅ FirebaseService.swift
- ✅ NotificationService.swift
- ✅ WatchConnectivityManager.swift
- ✅ ScanRequest.swift
- ✅ Info.plist
- ✅ GoogleService-Info.plist
- ✅ Assets.xcassets

### Step 5: Configure Info.plist

1. Select **QRCallWatch** target
2. Go to **Build Settings** tab
3. Search for "Info.plist File"
4. Set it to: `QRCallWatch/Info.plist`

### Step 6: Save and Close Xcode

**File** → **Save** (or Cmd+S)

Then **close Xcode completely** (Cmd+Q)

### Step 7: Install Pods

Run in terminal:
```bash
cd /Users/shanesmith/Documents/qrcall/apple/ios
pod install
```

### Step 8: Reopen Workspace

```bash
open Runner.xcworkspace
```

### Step 9: Update iOS App Delegate

Open `Runner/AppDelegate.swift` and replace with:

```swift
import Flutter
import UIKit
import WatchConnectivity

@main
@objc class AppDelegate: FlutterAppDelegate, WCSessionDelegate {

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
      print("⌚ Watch Connectivity activated")
    }

    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey : Any] = [:]
  ) -> Bool {
    return super.application(app, open: url, options: options)
  }

  // MARK: - WCSessionDelegate

  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
    print("✅ Watch Connectivity: \(activationState.rawValue)")
  }

  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) {
    WCSession.default.activate()
  }

  func session(_ session: WCSession, didReceiveMessage message: [String : Any], replyHandler: @escaping ([String : Any]) -> Void) {
    print("📨 Watch message: \(message)")
    // TODO: Handle watch requests
    replyHandler(["success": true])
  }
}
```

### Step 10: Test Build

1. In Xcode, select **QRCallWatch** scheme (top left)
2. Select an Apple Watch simulator
3. Press **Cmd+B** to build

### Step 11: Run!

Press **Cmd+R** to run the app on the watch simulator!

---

**Need help?** See the full guide: `ios/WATCH_INTEGRATION_GUIDE.md`
