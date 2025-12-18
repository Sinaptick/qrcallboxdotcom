# iOS App Crash Fix - RESOLVED ✅

**Date**: November 1, 2025
**Issue**: App crashed with white screen on launch
**Status**: **FIXED AND VERIFIED**

---

## Problem Summary

The iOS Flutter app was crashing immediately after launch when attempting to register the FCM token in Firestore. The app would show a white screen briefly, then crash when the dashboard started loading.

## Root Cause

**Firestore Limitation**: Using `FieldValue.serverTimestamp()` inside array elements is **NOT supported** by Firestore.

The crash occurred in `auth_service.dart` when updating the `fcmTokens` array:

```dart
// ❌ INCORRECT - Causes crash:
fcmTokens.add({
  'token': token,
  'platform': 'ios',
  'deviceName': 'iOS Device',
  'addedAt': FieldValue.serverTimestamp(),  // ❌ NOT allowed in arrays
  'lastSeen': FieldValue.serverTimestamp(),  // ❌ NOT allowed in arrays
});
```

### Why This Failed
- `FieldValue.serverTimestamp()` is a sentinel value that tells Firestore to replace it with the server timestamp
- Firestore only supports FieldValue sentinels at the **top level** of a document
- They **cannot be used** inside arrays or nested maps
- Attempting to do so causes a silent crash

## Solution

Replace `FieldValue.serverTimestamp()` with `Timestamp.now()` for all timestamps within the `fcmTokens` array:

```dart
// ✅ CORRECT - Works perfectly:
import 'package:cloud_firestore/cloud_firestore.dart';

final now = Timestamp.now();

fcmTokens.add({
  'token': token,
  'platform': 'ios',
  'deviceName': 'iOS Device',
  'addedAt': now,  // ✅ Real timestamp object
  'lastSeen': now,  // ✅ Real timestamp object
});
```

### Why This Works
- `Timestamp.now()` creates an actual Timestamp object
- Real objects can be stored anywhere in Firestore (arrays, nested maps, etc.)
- Server still gets an accurate timestamp (client time is close enough for this use case)

---

## Files Modified

### `/Users/shanesmith/Documents/qrcall/apple/lib/services/auth_service.dart`

**Lines 417-438** - Critical fix in `updateFCMToken()` method:

```dart
Future<void> updateFCMToken(String uid, String token) async {
  try {
    // Get device info
    final deviceName = await _getDeviceName();
    final platform = Platform.isIOS ? 'ios' : 'android';

    // Get current tokens array
    final userDoc = await _firestore.collection('users').doc(uid).get();
    final userData = userDoc.data();
    List<dynamic> fcmTokens = userData?['fcmTokens'] ?? [];

    // Check if this token already exists
    final existingIndex = fcmTokens.indexWhere((t) {
      if (t is Map<String, dynamic>) {
        return t['token'] == token;
      }
      return false;
    });

    final now = Timestamp.now();  // ✅ Create real timestamp

    if (existingIndex >= 0) {
      // Update existing token
      final existingToken = fcmTokens[existingIndex] as Map<String, dynamic>;
      fcmTokens[existingIndex] = {
        'token': token,
        'platform': platform,
        'deviceName': deviceName,
        'addedAt': existingToken['addedAt'] ?? now,  // ✅ Use Timestamp.now()
        'lastSeen': now,  // ✅ Use Timestamp.now()
      };
    } else {
      // Add new token to array
      fcmTokens.add({
        'token': token,
        'platform': platform,
        'deviceName': deviceName,
        'addedAt': now,  // ✅ Use Timestamp.now()
        'lastSeen': now,  // ✅ Use Timestamp.now()
      });
    }

    // Update Firestore
    await _firestore.collection('users').doc(uid).set({
      'fcmToken': token,
      'fcmTokens': fcmTokens,
      'fcmTokenUpdatedAt': FieldValue.serverTimestamp(),  // ✅ OK at top level
    }, SetOptions(merge: true));

    if (kDebugMode) {
      print('✅ FCM token updated: $platform - $deviceName');
      print('   Total devices: ${fcmTokens.length}');
    }
  } catch (e) {
    if (kDebugMode) {
      print('Error updating FCM token: $e');
    }
    rethrow;
  }
}
```

**Key Changes**:
1. ✅ Added `final now = Timestamp.now();` to create real timestamp
2. ✅ Replaced all `FieldValue.serverTimestamp()` with `now` inside array elements
3. ✅ Kept `FieldValue.serverTimestamp()` for top-level field `fcmTokenUpdatedAt` (this is fine)

---

## Additional Fixes (Bonus)

### `/Users/shanesmith/Documents/qrcall/apple/lib/screens/home_screen.dart`

**Memory Leak Fix** - Properly dispose of stream subscriptions:

```dart
StreamSubscription<String>? _tokenRefreshSubscription;

@override
void dispose() {
  _shiftStatusTimer?.cancel();
  _tokenRefreshSubscription?.cancel();  // ✅ Prevent memory leak
  super.dispose();
}
```

**setState After Dispose Fix** - Added `mounted` checks:

```dart
if (mounted) {
  setState(() => _selectedIndex = 0);
}
```

---

## Verification

### ✅ iOS App Status
```bash
node verify_multi_device.cjs
```

**Result**:
```
✅ fcmTokens Array: 1 device(s)

Device 1:
  Platform: ios
  Device: iOS Device
  Token: c9SdoGrQc0emv1spHjdrXX:APA91bF...
  Last Seen: 11/1/2025, 2:09:34 PM  # ✅ Real timestamp!

📊 Platform Coverage:
  Android: ❌ NO
  iOS: ✅ YES
```

**SUCCESS INDICATORS**:
1. ✅ FCM token successfully registered
2. ✅ Real timestamp shown (11/1/2025, 2:09:34 PM) - not FieldValue
3. ✅ No crash during Firestore write
4. ✅ App remains running and functional

---

## Debugging Process

### What Didn't Work
1. ❌ Multiple rebuilds without identifying root cause (5+ attempts)
2. ❌ Adding try-catch blocks and error logging (crash was silent)
3. ❌ Debug mode with Flutter debugger (iOS 14+ connection issues)
4. ❌ Console.app (too noisy, thousands of messages)

### What Worked ✅
Examined **background Flutter process logs** and found:
```
flutter: 📱 Updating FCM token in Firestore for user: Zp2HKoHQVlR7eNA6hhDPjkIJApB2
[CRASH - never saw success message]
```

This pinpointed the exact crash location: during the Firestore `fcmTokens` array update.

---

## Key Learnings

### Firestore FieldValue Rules
| Location | FieldValue.serverTimestamp() | Timestamp.now() |
|----------|------------------------------|-----------------|
| Top-level field | ✅ Supported | ✅ Supported |
| Inside array | ❌ **NOT supported** | ✅ Supported |
| Inside nested map | ❌ **NOT supported** | ✅ Supported |

### Best Practices
1. ✅ **Use `Timestamp.now()`** for timestamps in arrays/nested structures
2. ✅ **Use `FieldValue.serverTimestamp()`** only for top-level fields
3. ✅ **Check background process logs** when debugging silent crashes
4. ✅ **Test Firestore writes early** - they can fail silently

---

## Android App Status

The Android app **already has the correct implementation** using `com.google.firebase.Timestamp.now()`:

```kotlin
val tokenEntry = mapOf(
    "token" to token,
    "platform" to "android",
    "deviceName" to "${android.os.Build.MODEL}",
    "addedAt" to com.google.firebase.Timestamp.now(),  // ✅ Correct
    "lastSeen" to com.google.firebase.Timestamp.now(),  // ✅ Correct
    "appVersion" to versionName
)
```

**Status**: Ready for installation and testing (requires device connection)

---

## Next Steps for Multi-Device Testing

### 1. Connect Android Device
```bash
# Connect Android phone via USB
adb devices  # Should show device
```

### 2. Install Android App
```bash
cd /Users/shanesmith/AndroidStudioProjects/QRCallBox
./gradlew installDebug
```

### 3. Log In on Both Devices
- Open QRCallBox on Android and log in
- iOS app already logged in (iPad)

### 4. Verify Both Devices Registered
```bash
node verify_multi_device.cjs
```

**Expected Output**:
```
✅ fcmTokens Array: 2 device(s)

Device 1: ios - iOS Device
Device 2: android - Pixel 7 (or your device model)

📊 Platform Coverage:
  Android: ✅ YES
  iOS: ✅ YES
```

### 5. Test Multi-Device Notifications
```bash
node test_ios_notification.cjs
```

**Expected Behavior**:
- ✅ Notification appears on Android phone
- ✅ Notification appears on iPad
- ✅ Both devices receive notification simultaneously

---

## Summary

| Item | Status |
|------|--------|
| Root cause identified | ✅ FieldValue in arrays |
| iOS fix implemented | ✅ Changed to Timestamp.now() |
| iOS app built & installed | ✅ Installed on iPad |
| iOS app launches successfully | ✅ No crash |
| iOS FCM token registered | ✅ Verified in Firestore |
| Android app implementation | ✅ Already correct |
| Android device connected | ⏳ Waiting |
| Multi-device testing | ⏳ Pending |

---

## Technical Details

**Error Type**: Silent crash during Firestore write
**Error Location**: `auth_service.dart:417-438` (updateFCMToken)
**Error Cause**: Firestore API limitation
**Fix Type**: Change Firestore API usage pattern
**Build Tool**: Flutter 3.35.5
**Target**: iOS 13.0+
**Device**: iPad (00008110-000971E922BB801E)
**User**: Shane Smith (Zp2HKoHQVlR7eNA6hhDPjkIJApB2)
**Store**: 1458

---

**Fix Status**: ✅ **COMPLETE AND VERIFIED**
**App Status**: ✅ **STABLE AND RUNNING**
**Ready for**: Multi-device testing once Android device is connected
