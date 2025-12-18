# Apple Watch App Setup Guide

## Prerequisites
- Xcode 15.0 or later
- macOS Sonoma or later
- Active Apple Developer account
- Existing iOS QRCall app project

## Step-by-Step Setup

### 1. Add watchOS Target to Xcode Project

```bash
# Open the iOS project in Xcode
cd /Users/shanesmith/Documents/qrcall/apple
open ios/Runner.xcworkspace
```

#### In Xcode:
1. **File** > **New** > **Target**
2. Select **watchOS** > **Watch App**
3. Configure:
   - Product Name: `QRCallWatch`
   - Organization Identifier: `com.stable.qrcallbox`
   - Bundle Identifier: `com.stable.qrcallbox.watchkitapp`
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Notifications: **✓ Enabled**
   - Complications: **✓ Enabled**
4. Click **Finish**
5. **Activate** the scheme when prompted

### 2. Configure Build Settings

#### Update Info.plist (Watch App)
Add the following keys:
```xml
<key>WKCompanionAppBundleIdentifier</key>
<string>com.stable.qrcallbox</string>
<key>WKWatchKitApp</key>
<true/>
<key>UIBackgroundModes</key>
<array>
    <string>remote-notification</string>
</array>
```

#### Update Capabilities
Enable the following for both iOS app and Watch app:
- ✓ Push Notifications
- ✓ Background Modes (Remote notifications)
- ✓ Sign in with Apple (if using Apple Auth)

### 3. Add Firebase to watchOS Target

#### Install Firebase SDK
Add Firebase to your `Podfile`:

```ruby
# Podfile
platform :ios, '13.0'

# iOS App Target
target 'Runner' do
  use_frameworks!
  pod 'Firebase/Auth'
  pod 'Firebase/Firestore'
  pod 'Firebase/Messaging'
end

# watchOS Target
target 'QRCallWatch WatchKit Extension' do
  platform :watchos, '9.0'
  use_frameworks!

  pod 'Firebase/Auth'
  pod 'Firebase/Firestore'
  pod 'Firebase/Messaging'
end
```

Run:
```bash
cd ios
pod install
```

#### Configure Firebase
1. Download `GoogleService-Info.plist` for watchOS from Firebase Console
2. Add to Watch App target in Xcode
3. Initialize Firebase in `QRCallWatchApp.swift`

### 4. Set Up APNs (Apple Push Notification Service)

#### Generate APNs Certificates
1. Go to [Apple Developer Portal](https://developer.apple.com/account)
2. **Certificates, Identifiers & Profiles** > **Keys**
3. Create new key with **Apple Push Notifications service (APNs)** enabled
4. Download `.p8` key file
5. Note the **Key ID** and **Team ID**

#### Upload to Firebase
1. Firebase Console > Project Settings > Cloud Messaging
2. iOS app configuration > Upload APNs Certificate
3. Upload `.p8` file with Key ID and Team ID

### 5. Project Structure

The watchOS app should have this structure:

```
QRCallWatch/
├── QRCallWatchApp.swift          # App entry point
├── Views/
│   ├── ContentView.swift         # Main view
│   ├── RequestListView.swift     # List of pending requests
│   ├── RequestDetailView.swift   # Individual request details
│   └── SettingsView.swift        # User settings
├── Models/
│   ├── ScanRequest.swift         # Data model for scans
│   └── UserProfile.swift         # User data model
├── Services/
│   ├── FirebaseService.swift    # Firebase integration
│   ├── NotificationService.swift # APNs handling
│   └── AuthService.swift         # Authentication
├── Complications/
│   └── ComplicationController.swift
└── Assets.xcassets/
    └── AppIcon.appiconset/
```

### 6. Code Integration Points

#### Share Data Between iOS and watchOS

Create a shared App Group:
1. Capabilities > App Groups
2. Add group: `group.com.stable.qrcallbox`
3. Enable for both iOS and watchOS targets

```swift
// Shared UserDefaults
let sharedDefaults = UserDefaults(suiteName: "group.com.stable.qrcallbox")
```

#### Watch Connectivity Framework

```swift
import WatchConnectivity

class WatchConnectivityManager: NSObject, WCSessionDelegate {
    static let shared = WatchConnectivityManager()

    func setupSession() {
        if WCSession.isSupported() {
            let session = WCSession.default
            session.delegate = self
            session.activate()
        }
    }

    // Send data from iOS to watchOS
    func sendToWatch(_ data: [String: Any]) {
        WCSession.default.sendMessage(data, replyHandler: nil)
    }
}
```

### 7. Next Steps

See the following files in this directory:
- `QRCallWatchApp.swift` - App entry point with Firebase initialization
- `ContentView.swift` - Main watch interface
- `FirebaseService.swift` - Backend integration
- `NotificationService.swift` - Push notification handling

## Testing

### Simulator Testing
```bash
# Run on Apple Watch Simulator
# In Xcode: Select "QRCallWatch" scheme > Choose Apple Watch simulator > Run
```

### Physical Device Testing
1. Pair Apple Watch with iPhone running iOS app
2. Enable Developer Mode on Apple Watch:
   - Settings > Privacy & Security > Developer Mode
3. Install via Xcode to paired watch

## Troubleshooting

### Build Errors
- Ensure deployment target matches (watchOS 9.0+)
- Verify all targets have correct Bundle IDs
- Clean build folder: **Product** > **Clean Build Folder**

### Notification Issues
- Verify APNs certificate is uploaded to Firebase
- Check notification permissions on watch
- Ensure FCM token is registered for watch device

### Connectivity Issues
- Verify App Group is enabled on both targets
- Check Watch Connectivity session is activated
- Ensure iPhone and Watch are on same WiFi network

## Resources
- [watchOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/watchos)
- [Firebase for watchOS](https://firebase.google.com/docs/ios/setup)
- [WatchConnectivity Framework](https://developer.apple.com/documentation/watchconnectivity)
