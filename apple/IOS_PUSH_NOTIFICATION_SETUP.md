# iOS Push Notifications - APNs Configuration Required

**Date**: November 1, 2025
**Status**: ⚠️ **APNs Authentication Key Required**

---

## Current Situation

✅ **Working**:
- iOS app launches successfully
- FCM token registration works
- Token stored in Firestore correctly
- App permissions granted (notifications enabled)
- iOS entitlements configured (`aps-environment: development`)
- GoogleService-Info.plist present

❌ **Not Working**:
- iOS push notifications not being received
- **Root Cause**: Firebase needs APNs authentication key

---

## Why iOS Notifications Aren't Working

iOS push notifications require **two services** to work together:

1. **Firebase Cloud Messaging (FCM)** ✅ - Your backend uses this
2. **Apple Push Notification service (APNs)** ❌ - **NOT CONFIGURED**

**The Problem**: FCM needs an APNs authentication key to communicate with Apple's servers. Without this key, FCM cannot deliver notifications to iOS devices.

```
Your Backend → FCM ✅ → APNs ❌ → iOS Device
                         ^
                         |
                    MISSING KEY!
```

---

## How to Fix: Upload APNs Authentication Key to Firebase

### Step 1: Get Your APNs Authentication Key

You need an APNs authentication key (.p8 file) from Apple Developer Portal.

**Option A: If you already have a .p8 key**
- Skip to Step 2

**Option B: Create a new .p8 key**

1. Go to [Apple Developer Portal](https://developer.apple.com/account/resources/authkeys/list)
2. Click **"+"** to create a new key
3. Name it: "QRCallBox APNs Key"
4. Check **"Apple Push Notifications service (APNs)"**
5. Click **Continue** → **Register**
6. **Download the .p8 file** (you can only download ONCE!)
7. Save the Key ID (looks like: `AB12CD34EF`)

### Step 2: Upload Key to Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **qrwebaccdb**
3. Click **Settings** ⚙️ → **Project settings**
4. Go to **Cloud Messaging** tab
5. Scroll to **Apple app configuration**
6. Click **Upload** under "APNs Authentication Key"
7. Upload your **.p8 file**
8. Enter:
   - **Key ID**: (from Apple, e.g., `AB12CD34EF`)
   - **Team ID**: (Your Apple Developer Team ID, found in your Apple Developer account)

### Step 3: Verify Upload

After uploading, you should see:
```
✅ APNs Authentication Key: AB12CD34EF
   Team ID: YOUR_TEAM_ID
   Uploaded: [Date]
```

### Step 4: Test iOS Notifications

1. **Wait 5 minutes** for Firebase to propagate the key
2. **Test notification** by having someone scan a QR code at store 1458
3. **Check your iPad** - notification should appear!

---

## Alternative: APNs Certificate (Legacy Method)

If you can't use the authentication key, you can use an APNs certificate instead:

1. Create **APNs Certificate** in Apple Developer Portal
2. Download the `.cer` file
3. Convert to `.p12` using Keychain Access on Mac:
   ```bash
   # Open the .cer file in Keychain Access
   # Right-click → Export → Save as .p12
   ```
4. Upload `.p12` file to Firebase Console (same location as auth key)

**Note**: Authentication key is preferred (easier to manage, doesn't expire every year)

---

## Troubleshooting

### After Uploading Key, Still No Notifications?

**Check #1: Firebase Log**
```bash
firebase functions:log --only sendAndroidNotification
```
Look for errors like:
```
"messaging/invalid-apns-credentials"
```

**Check #2: iOS App Logs**
Run the app with Flutter and watch for FCM messages:
```bash
cd /Users/shanesmith/Documents/qrcall/apple
flutter run -d "00008110-000971E922BB801E"
```

Look for logs:
```
🔔 FCM Permission status: AuthorizationStatus.authorized
Foreground message: [messageId]
```

**Check #3: Token Valid?**
```bash
node verify_multi_device.cjs
```
Ensure iOS token is present and recent.

### Common Issues

| Issue | Solution |
|-------|----------|
| "Invalid APNs credentials" | Re-upload correct .p8 file with matching Key ID |
| "APNs certificate expired" | Upload new certificate or switch to auth key |
| "Token not registered" | Log out/in on iOS app to refresh token |
| App not in foreground | iOS should still show notification banner |

---

## Technical Details

### What Happens When Notification Sent

**Backend** (`functions/index.js:2965-3000`):
```javascript
const message = {
  notification: {
    title: "🚨 Customer Needs Assistance",
    body: "Store 1458: Customer needs help in Electronics"
  },
  apns: {  // APNs-specific config
    payload: {
      aps: {
        alert: { title, body },
        sound: "default",
        badge: 1
      }
    }
  },
  token: "c9SdoGrQc0emv1sp..." // Your iOS FCM token
};

await admin.messaging().send(message);
```

**Firebase (with APNs key)**:
```
FCM receives message
→ Looks up APNs auth key
→ Signs request with key
→ Sends to APNs
→ APNs delivers to device
```

**Firebase (WITHOUT APNs key)**:
```
FCM receives message
→ No APNs key found ❌
→ Returns error: "invalid-apns-credentials"
→ Notification fails silently
```

### iOS App Notification Handlers

**Foreground** (`fcm_service.dart:109-132`):
```dart
FirebaseMessaging.onMessage.listen((message) {
  print('Foreground message: ${message.messageId}');
  _showLocalNotification(...)  // Shows banner
});
```

**Background** (`main.dart:16-23`):
```dart
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  print('Background message: ${message.messageId}');
}
```

Both require APNs key to receive the message from FCM.

---

## Verification Checklist

After uploading APNs key:

- [ ] APNs authentication key uploaded to Firebase Console
- [ ] Key ID and Team ID match your Apple Developer account
- [ ] Wait 5 minutes for propagation
- [ ] iOS app is installed and logged in
- [ ] User is marked "on shift" in Firestore
- [ ] Store number matches (1458)
- [ ] Send test notification (QR scan or test script)
- [ ] Check iPad for notification

---

## Summary

**Problem**: iOS can't receive push notifications
**Cause**: Firebase doesn't have APNs authentication key
**Solution**: Upload APNs .p8 key to Firebase Console
**Time**: 5-10 minutes to set up
**Location**: [Firebase Console → Project Settings → Cloud Messaging](https://console.firebase.google.com/project/qrwebaccdb/settings/cloudmessaging)

---

## Files Reference

**iOS App**:
- `/Users/shanesmith/Documents/qrcall/apple/lib/services/fcm_service.dart` - FCM setup
- `/Users/shanesmith/Documents/qrcall/apple/lib/main.dart` - Background handler
- `/Users/shanesmith/Documents/qrcall/apple/ios/Runner/Runner.entitlements` - APNs entitlement
- `/Users/shanesmith/Documents/qrcall/apple/ios/Runner/GoogleService-Info.plist` - Firebase config

**Backend**:
- `/Users/shanesmith/Documents/qrcall/functions/index.js:2965-3000` - Notification sending with APNs payload

**Verification**:
- `/Users/shanesmith/Documents/qrcall/verify_multi_device.cjs` - Check FCM tokens

---

**Next Step**: Upload APNs authentication key to Firebase Console and test! 🚀
