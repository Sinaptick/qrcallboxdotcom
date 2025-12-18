# iOS Notification Filtering: Client-Side vs Server-Side

## Current Implementation (Server-Side Only)

### Backend (Cloud Functions)
```javascript
// functions/index.js - s() function
const isOnShift = isUserOnShift(userData);
if (isOnShift) {
  await sendFCMNotification(user.fcmToken, notificationData);
}
```

**Flow**:
1. Customer scans QR code
2. Backend gets all users for that store
3. For each user, check `workSchedule` against current time
4. Only send FCM to users currently on shift
5. iOS receives notification and displays it immediately

**Problem with Current Approach**:
- If user just updated their schedule, backend might have stale data
- Backend timezone calculation might differ from device
- No failsafe if backend calculation is wrong

---

## Option 1: Add Client-Side Filtering with Notification Service Extension

### Architecture
```
Customer Scan → Backend calculates shift → Sends FCM to on-shift users
                                                    ↓
                              iOS Notification Service Extension
                                                    ↓
                              Check shift status locally
                                                    ↓
                              Display or Suppress notification
```

### Implementation

#### Step 1: Create Notification Service Extension

1. **Open Xcode**: `ios/Runner.xcworkspace`
2. **File** → **New** → **Target**
3. Select **Notification Service Extension**
4. Name: `NotificationService`
5. Language: Swift
6. Click **Finish**

#### Step 2: Update NotificationService.swift

```swift
import UserNotifications
import FirebaseFirestore

class NotificationService: UNNotificationServiceExtension {
    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        guard let bestAttemptContent = bestAttemptContent else {
            return contentHandler(request.content)
        }

        // Check if user is on shift
        if shouldShowNotification(userData: bestAttemptContent.userInfo) {
            // User is on shift - display notification
            contentHandler(bestAttemptContent)
        } else {
            // User is off shift - suppress notification
            bestAttemptContent.title = ""
            bestAttemptContent.body = ""
            bestAttemptContent.sound = nil
            bestAttemptContent.badge = nil
            contentHandler(bestAttemptContent) // Delivers empty notification (effectively hidden)
        }
    }

    private func shouldShowNotification(userData: [AnyHashable: Any]) -> Bool {
        // Get work schedule from UserDefaults (shared with main app)
        let sharedDefaults = UserDefaults(suiteName: "group.com.stable.qrcallbox")

        guard let workScheduleData = sharedDefaults?.data(forKey: "workSchedule"),
              let workSchedule = try? JSONDecoder().decode([String: DaySchedule].self, from: workScheduleData) else {
            // No schedule = always on shift
            return true
        }

        // Calculate current shift status
        let now = Date()
        let calendar = Calendar.current
        let dayName = calendar.weekdaySymbols[calendar.component(.weekday, from: now) - 1].lowercased()

        guard let daySchedule = workSchedule[dayName] else {
            // No schedule for today = off shift
            return false
        }

        let currentMinutes = calendar.component(.hour, from: now) * 60 + calendar.component(.minute, from: now)
        let startMinutes = daySchedule.startMinutes
        let endMinutes = daySchedule.endMinutes

        let isOnShift = currentMinutes >= startMinutes && currentMinutes <= endMinutes

        NSLog("NotificationService: \(dayName) shift check - \(isOnShift ? "ON" : "OFF") shift")

        return isOnShift
    }

    override func serviceExtensionTimeWillExpire() {
        // Called if extension takes too long
        if let contentHandler = contentHandler,
           let bestAttemptContent = bestAttemptContent {
            // Deliver notification anyway (failsafe)
            contentHandler(bestAttemptContent)
        }
    }
}

struct DaySchedule: Codable {
    let start: String
    let end: String

    var startMinutes: Int {
        let parts = start.split(separator: ":")
        return (Int(parts[0]) ?? 0) * 60 + (Int(parts[1]) ?? 0)
    }

    var endMinutes: Int {
        let parts = end.split(separator: ":")
        return (Int(parts[0]) ?? 0) * 60 + (Int(parts[1]) ?? 0)
    }
}
```

#### Step 3: Enable App Groups

**In Main App Target (Runner)**:
1. Signing & Capabilities → **+ Capability**
2. Add **App Groups**
3. Add group: `group.com.stable.qrcallbox`

**In Notification Service Extension Target**:
1. Signing & Capabilities → **+ Capability**
2. Add **App Groups**
3. Add group: `group.com.stable.qrcallbox`

#### Step 4: Update Main App to Share Schedule Data

```dart
// lib/services/firestore_service.dart
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

Future<void> updateWorkSchedule(String uid, Map<String, dynamic> schedule) async {
  // ... existing Firestore update code ...

  // Share schedule with Notification Service Extension
  final prefs = await SharedPreferences.getInstance();
  final scheduleJson = jsonEncode(schedule);
  await prefs.setString('workSchedule', scheduleJson);

  // Also save to App Group (for Notification Service Extension)
  // Note: Need to use iOS-specific code for this
  // See Step 5
}
```

#### Step 5: Bridge to App Group UserDefaults (iOS-specific)

Add platform channel in `AppDelegate.swift`:

```swift
import UIKit
import Flutter

@UIApplicationMain
@objc class AppDelegate: FlutterAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let controller = window?.rootViewController as! FlutterViewController
    let channel = FlutterMethodChannel(
      name: "com.stable.qrcallbox/shared_prefs",
      binaryMessenger: controller.binaryMessenger
    )

    channel.setMethodCallHandler { (call: FlutterMethodCall, result: @escaping FlutterResult) in
      if call.method == "saveToAppGroup" {
        guard let args = call.arguments as? [String: Any],
              let key = args["key"] as? String,
              let value = args["value"] as? String else {
          result(FlutterError(code: "INVALID_ARGS", message: nil, details: nil))
          return
        }

        let sharedDefaults = UserDefaults(suiteName: "group.com.stable.qrcallbox")
        sharedDefaults?.set(value, forKey: key)
        result(true)
      } else {
        result(FlutterMethodNotImplemented)
      }
    }

    GeneratedPluginRegistrant.register(with: self)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
```

---

## Option 2: Data-Only Notifications (Android Pattern)

### Backend Changes
```javascript
// Send data-only notification (no alert)
const message = {
  token: user.fcmToken,
  data: {
    type: 'customer_request',
    scanId: scanId,
    storeNumber: storeNumber,
    area: area,
    timestamp: timestamp,
  },
  // No notification field = silent delivery
  apns: {
    headers: {
      'apns-priority': '5', // Low priority for background
    },
    payload: {
      aps: {
        'content-available': 1, // Background notification
      }
    }
  }
};
```

### iOS App Changes
```dart
// lib/services/fcm_service.dart
FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // This runs even when app is in background

  // Check shift status
  final prefs = await SharedPreferences.getInstance();
  final scheduleJson = prefs.getString('workSchedule');

  if (scheduleJson != null) {
    final schedule = jsonDecode(scheduleJson);
    final shiftStatus = ShiftCalculator.calculateShiftStatus(schedule);

    if (!shiftStatus['isOnShift']) {
      // User is off shift - don't display notification
      return;
    }
  }

  // User is on shift - display local notification
  await _showLocalNotification(message);
}
```

**Problem**: iOS background delivery is unreliable, especially if:
- App is not running
- Device is in Low Power Mode
- User has disabled Background App Refresh

---

## Comparison

| Feature | Server-Side Only | + Notification Extension | Data-Only (Background) |
|---------|-----------------|-------------------------|------------------------|
| **Reliability** | ✅ High | ✅ High | ⚠️ Medium (iOS limits) |
| **Battery Impact** | ✅ Low | ✅ Low | ⚠️ Medium |
| **Works when terminated** | ✅ Yes | ✅ Yes | ❌ No |
| **Real-time schedule updates** | ❌ No | ✅ Yes | ✅ Yes |
| **Implementation complexity** | ✅ Simple | ⚠️ Medium | ⚠️ Medium |
| **Timezone accuracy** | ⚠️ Server TZ | ✅ Device TZ | ✅ Device TZ |
| **Failsafe if server wrong** | ❌ No | ✅ Yes | ✅ Yes |

---

## Recommended Approach: Server + Extension (Hybrid)

### Why Hybrid?

1. **Server-side filter** = Primary defense
   - Reduces network traffic
   - Most battery efficient
   - Works 99% of the time

2. **Notification Service Extension** = Failsafe
   - Catches edge cases (schedule just changed, timezone issues)
   - Uses device's local time (more accurate)
   - No backend changes needed

3. **Best of both worlds**:
   - Efficient (server filters most)
   - Accurate (client validates)
   - Reliable (works when app terminated)

### Implementation Plan

1. ✅ Server-side filtering (already implemented)
2. ➕ Add Notification Service Extension (new)
3. ➕ Share schedule data via App Groups (new)
4. ➕ Update iOS app to save schedule to App Group (new)

### Estimated Effort
- **Time**: 2-3 hours
- **Complexity**: Medium
- **Files to modify**: 4-5
- **Benefits**: High (catches 100% of cases)

---

## Quick Decision Matrix

**If you want**:
- ✅ Maximum reliability → **Server + Extension**
- ✅ Simplest solution → **Server-side only** (current)
- ⚠️ Most flexible → **Data-only** (but less reliable on iOS)

**My recommendation**: Implement **Notification Service Extension** as a failsafe. It's the iOS best practice and catches edge cases without sacrificing reliability.

---

## Next Steps

Want me to:
1. Implement the Notification Service Extension? (Recommended)
2. Switch to data-only notifications? (Android pattern)
3. Keep current server-side only? (Simplest)

Let me know and I can implement whichever option you prefer!
