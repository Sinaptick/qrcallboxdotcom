# iOS Push Notification Troubleshooting Guide

**Last Updated**: October 31, 2025
**Status**: Notifications not going through despite backend implementation

---

## Quick Diagnosis Checklist

### 1. **APNS Configuration in Firebase Console** ⚠️ MOST COMMON ISSUE

iOS push notifications **REQUIRE** APNS authentication keys uploaded to Firebase Console.

**Steps to verify and fix:**

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select project: **qrwebaccdb**
3. Go to **Project Settings** (gear icon) → **Cloud Messaging** tab
4. Scroll to **Apple app configuration**
5. Check if you see:
   - ✅ **APNS Authentication Key** uploaded OR
   - ✅ **APNS Certificate** uploaded
6. If **NEITHER** is present, notifications WILL NOT work!

#### How to Get APNS Authentication Key:

**Method 1: APNS Auth Key (Recommended - Easier)**
1. Log in to [Apple Developer Portal](https://developer.apple.com/account/)
2. Go to **Certificates, Identifiers & Profiles**
3. Select **Keys** from sidebar
4. Click **+** to create new key
5. Enable **Apple Push Notifications service (APNs)**
6. Download the `.p8` file (SAVE THIS - you can only download once!)
7. Note the **Key ID** and **Team ID**
8. Upload to Firebase Console:
   - Upload the `.p8` file
   - Enter **Key ID**
   - Enter **Team ID** (found in Apple Developer account under Membership)

**Method 2: APNS Certificate (Legacy - More Complex)**
1. Generate Certificate Signing Request (CSR) on Mac
2. Create APNs certificate in Apple Developer Portal
3. Download and install certificate
4. Export as `.p12` file
5. Upload to Firebase Console

---

### 2. **Testing Device Requirements**

**iOS Simulators DO NOT support push notifications!**

✅ **Required for testing:**
- Physical iPhone or iPad
- Device connected to Mac OR installed via TestFlight
- Device has internet connectivity
- App has notification permissions enabled

❌ **Won't work:**
- iOS Simulator (Xcode Simulator)
- Any virtual device
- Device without notification permissions

---

### 3. **App Configuration Verification**

Check iOS app configuration files:

#### GoogleService-Info.plist
Location: `/Users/shanesmith/Documents/qrcall/apple/ios/Runner/GoogleService-Info.plist`

**Verify contains:**
- `BUNDLE_ID` matches app: `com.stable.qrcallbox` (or your actual bundle ID)
- `GCM_SENDER_ID` is present
- File is from correct Firebase project (qrwebaccdb)

#### Info.plist
Location: `/Users/shanesmith/Documents/qrcall/apple/ios/Runner/Info.plist`

**Verify contains:**
```xml
<key>UIBackgroundModes</key>
<array>
    <string>fetch</string>
    <string>remote-notification</string>
</array>
```

---

### 4. **Runtime Diagnostics**

Run the iOS app and check console logs for these indicators:

**✅ Good Signs:**
```
🔔 FCM Permission status: AuthorizationStatus.authorized
✅ FCM Token obtained: <token string>...
📱 Token from FCM service: EXISTS
```

**❌ Bad Signs:**
```
❌ FCM Token is NULL - check permissions and APNS setup
[firebase_messaging/apns-token-not-set] APNS device token not set
🔔 FCM Permission status: AuthorizationStatus.denied
```

---

### 5. **Check Firestore for iOS Users**

Verify iOS users have FCM tokens stored:

1. Go to [Firestore Console](https://console.firebase.google.com/project/qrwebaccdb/firestore)
2. Open `users` collection
3. Find your test iOS user document
4. Check for fields:
   - `fcmToken`: Should be a long string (100+ characters)
   - `fcmTokenUpdatedAt`: Should be recent timestamp

**If fcmToken is empty or missing:**
- User hasn't logged in on iOS yet, OR
- APNS keys not configured, OR
- Testing on simulator

---

### 6. **Backend Verification**

The backend already has iOS support implemented (✅ confirmed):

**File**: `functions/index.js` lines 2955-2967

```javascript
apns: {
  payload: {
    aps: {
      alert: {
        title: notificationData.title,
        body: notificationData.body
      },
      sound: "default",
      badge: 1,
      category: "ASSISTANCE_REQUEST"
    }
  }
}
```

---

### 7. **Test Notification Flow**

Once APNS is configured, test with these steps:

1. **Install app on physical iOS device**
   ```bash
   cd /Users/shanesmith/Documents/qrcall/apple
   flutter run -d [DEVICE_ID]
   ```

2. **Log in and verify FCM token**
   - Check console for: `✅ FCM Token obtained`
   - Check Firestore `users/{uid}` has `fcmToken` field

3. **Trigger a test scan**
   - Use a QR code for your store number
   - Or use Firebase Functions test:
   ```bash
   firebase functions:shell
   # Then run:
   sendAndroidNotification('YOUR_STORE_NUMBER', 'Test Area')
   ```

4. **Check Firebase Functions logs**
   ```bash
   firebase functions:log --only sendAndroidNotification
   ```

   Look for:
   - ✅ `FCM sent successfully to token...`
   - ❌ `Failed to send FCM` (check error details)

---

## Common Error Messages & Solutions

### "APNS device token not set"
**Cause**: APNS keys not configured in Firebase Console
**Solution**: Upload APNS Auth Key (see Section 1)

### "Messaging/invalid-registration-token"
**Cause**: FCM token is invalid or expired
**Solution**: Delete app, reinstall, and log in again to get new token

### "Messaging/registration-token-not-registered"
**Cause**: Token was generated for different Firebase project
**Solution**: Verify `GoogleService-Info.plist` is from correct project

### "AuthorizationStatus.denied"
**Cause**: User denied notification permissions
**Solution**: Go to iOS Settings → QRCallBox → Notifications → Enable

### Token is NULL on physical device
**Cause**: APNS keys not configured OR network issue
**Solution**:
1. Configure APNS in Firebase Console
2. Check device has internet
3. Restart app
4. Check Xcode console for detailed error

---

## Expected Behavior After Fix

Once APNS is properly configured:

1. **On App Launch:**
   - iOS requests notification permission
   - FCM token is generated immediately
   - Token saved to Firestore automatically

2. **On QR Scan:**
   - Backend sends notification to all on-shift users
   - iOS users receive push notification
   - Notification shows even if app is closed
   - Tapping notification opens app to home screen

3. **Notification Display:**
   - Title: "🚨 Customer Needs Assistance"
   - Body: "Store {number}: Customer needs help in {area}"
   - Badge count increases
   - Sound plays

---

## Debugging Commands

```bash
# Check Flutter environment
cd /Users/shanesmith/Documents/qrcall/apple
flutter doctor

# List connected iOS devices
flutter devices

# Run with verbose logging
flutter run -v -d [DEVICE_ID]

# Check Firebase Functions logs
firebase functions:log --only sendAndroidNotification

# Test FCM from Firebase Console
# Go to: Cloud Messaging → Send test message
# Enter FCM token from Firestore
```

---

## Next Steps

1. ⚠️ **PRIORITY 1**: Configure APNS in Firebase Console (Section 1)
2. Install app on physical iOS device (not simulator)
3. Verify FCM token appears in Firestore after login
4. Test with real QR scan or Functions shell
5. Check Firebase Functions logs for send results

---

## Reference Documentation

- **Firebase iOS Setup**: https://firebase.google.com/docs/cloud-messaging/ios/client
- **Apple APNS Guide**: https://developer.apple.com/documentation/usernotifications
- **Firebase Console**: https://console.firebase.google.com/project/qrwebaccdb
- **Apple Developer Portal**: https://developer.apple.com/account/

---

## Status Tracking

- [x] Backend iOS support implemented (APNS payload in sendAndroidNotification)
- [x] iOS app FCM service implemented
- [x] iOS app stores tokens to Firestore
- [ ] **APNS keys uploaded to Firebase Console** ⚠️
- [ ] Tested on physical iOS device
- [ ] Notifications successfully delivered

---

**Contact**: sinaptick@gmail.com
**Project**: QRCallBox iOS/Flutter App
