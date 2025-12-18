# iOS App Security Updates - QRCallBox

**Date**: January 2025
**Version**: 1.7.32+
**Status**: Security Hardening Complete (Client-Side)

---

## Executive Summary

This document tracks security improvements implemented in the QRCallBox iOS/Flutter app following a comprehensive security audit. The audit identified several critical and high-priority security issues that have been systematically addressed.

**Overall Security Posture**: ⚠️ **MODERATE → HIGH**

---

## ✅ Completed Security Improvements

### 1. Sensitive Data Logging Protection

**Issue**: FCM tokens, user credentials, and error details were being logged to console in production builds, exposing sensitive information.

**Risk Level**: 🔴 CRITICAL

**Solution Implemented**:
- Added `kDebugMode` checks around all print statements
- FCM tokens only logged in debug builds
- Error messages sanitized to not expose implementation details
- User data logging restricted to development environment

**Files Modified**:
- `lib/services/auth_service.dart` - 8 print statements wrapped
- `lib/services/fcm_service.dart` - 9 print statements wrapped
- `lib/services/firestore_service.dart` - 11 print statements wrapped
- `lib/main.dart` - 2 print statements wrapped

**Example**:
```dart
// Before
print('FCM Token: $token');

// After
if (kDebugMode) {
  print('FCM Token: $token');
}
```

**Impact**: Prevents sensitive data exposure in production app logs and crash reports.

---

### 2. iOS Privacy Permissions

**Issue**: Missing NSUserNotificationsUsageDescription and other privacy declarations required by App Store.

**Risk Level**: 🟠 HIGH (App Store rejection risk)

**Solution Implemented**:
Added privacy usage descriptions to `Info.plist`:
- `NSUserNotificationsUsageDescription` - Notification permissions
- `NSCameraUsageDescription` - QR code scanning (future feature)
- `NSPhotoLibraryUsageDescription` - QR code saving (future feature)

**File Modified**: `ios/Runner/Info.plist`

**Impact**: Ensures App Store compliance and provides clear user communication about permission requirements.

---

### 3. Input Validation & Sanitization

**Issue**: No validation of user inputs before Firestore writes, allowing potential injection attacks and data corruption.

**Risk Level**: 🔴 CRITICAL

**Solution Implemented**:

#### 3.1 Scan Response Validation
- Validates `scanId` length (max 100 chars)
- Requires `timestamp` and `userId` fields
- Sanitizes and limits message length (max 500 chars)
- Trims whitespace from all string inputs

#### 3.2 Work Schedule Validation
- Validates UID format and length
- Restricts days to valid weekdays
- Enforces time format (HH:mm) with regex validation
- Prevents invalid schedule data

#### 3.3 FCM Token Validation
- Validates UID and token format
- Length restrictions (token max 200 chars)
- Type checking

#### 3.4 Claim Scan Validation
- Validates scanId, userId, and userName
- Length restrictions on all parameters
- Prevents malformed claim requests

**File Modified**: `lib/services/firestore_service.dart`

**Code Example**:
```dart
// Scan response validation
if (scanId.isEmpty || scanId.length > 100) {
  throw ArgumentError('Invalid scan ID');
}

// Message sanitization
final message = (response['message'] as String).trim();
sanitizedResponse['message'] = message.length > 500
  ? message.substring(0, 500)
  : message;
```

**Impact**: Prevents injection attacks, data corruption, and Firestore quota abuse.

---

### 4. Password Strength Enforcement

**Issue**: Weak password requirements (Firebase default: 6+ characters) allowing brute force attacks.

**Risk Level**: 🟠 HIGH

**Solution Implemented**:

Created comprehensive password validation with requirements:
- **Minimum 12 characters** (up from 6)
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (!@#$%^&*(),.?":{}|<>)

Additional validations:
- Email format validation
- First/last name length validation (1-50 chars)
- Store number format validation (1-20 chars)

**File Modified**: `lib/services/auth_service.dart`

**Code Example**:
```dart
String? validatePassword(String password) {
  if (password.length < 12) {
    return 'Password must be at least 12 characters long';
  }
  if (!password.contains(RegExp(r'[A-Z]'))) {
    return 'Password must contain at least one uppercase letter';
  }
  // ... additional checks
  return null; // Password is valid
}
```

**Impact**: Significantly reduces risk of brute force attacks and unauthorized account access.

---

### 5. FCM Notification Payload Validation

**Issue**: Unvalidated notification payloads could cause crashes or unexpected behavior from malicious notifications.

**Risk Level**: 🟡 MEDIUM

**Solution Implemented**:

Created `_validateNotificationPayload()` method with checks:
- Validates presence of required `scanId` field
- Type checking (ensures scanId is String)
- Length validation (max 100 chars)
- Validates before processing foreground and background notifications
- Validates local notification responses

**File Modified**: `lib/services/fcm_service.dart`

**Code Example**:
```dart
bool _validateNotificationPayload(Map<String, dynamic> data) {
  if (!data.containsKey('scanId')) {
    return false;
  }
  final scanId = data['scanId'];
  if (scanId is! String || scanId.isEmpty || scanId.length > 100) {
    return false;
  }
  return true;
}
```

**Impact**: Prevents crashes and unexpected behavior from malicious or malformed notifications.

---

## ✅ Server-Side Tasks Completed

The following critical security tasks have been implemented on the server-side:

> **Deployment Required**: These changes require deployment. See [/DEPLOYMENT_SECURITY.md](/DEPLOYMENT_SECURITY.md) for detailed deployment guide.

### 1. Admin Authorization via Custom Claims ✅ IMPLEMENTED

**Previous Issue**: Admin check performed client-side (could be bypassed)

**Solution Implemented**:
- ✅ Created `setAdminClaim` Cloud Function (admin-only)
- ✅ Created `getUserClaims` Cloud Function
- ✅ Updated `isAdmin()` helper to check Custom Claims first
- ✅ Updated Firestore security rules to use `request.auth.token.admin`
- ✅ Created deployment script (`functions/set-admin-claim.js`)

**Files Modified**:
- `functions/index.js` - Added Custom Claims functions
- `firestore.rules` - Updated to use Custom Claims
- `apple/lib/models/user_model.dart` - Added security warning comments

**Implementation Example**:
```javascript
// functions/index.js - setAdminClaim (Lines 6881-6938)
export const setAdminClaim = onCall({
  region: REGION,
  enforceAppCheck: false
}, async (request) => {
  const callerUid = request.auth?.uid;

  // Verify caller is super admin
  const callerDoc = await db.collection('users').doc(callerUid).get();
  if (!callerDoc.exists || callerDoc.data().email !== 'sinaptick@gmail.com') {
    throw new HttpsError('permission-denied', 'Only super admin can grant admin privileges');
  }

  const { uid, admin } = request.data;

  // Set or remove custom claim
  await getAuth().setCustomUserClaims(uid, { admin });

  // Update Firestore for record-keeping
  await db.collection('users').doc(uid).update({
    isAdmin: admin,
    adminClaimSetAt: FieldValue.serverTimestamp(),
    adminClaimSetBy: callerUid
  });

  return { success: true };
});
```

**Firestore Security Rules** (`firestore.rules` Lines 4-7):
```javascript
// Helper function using Custom Claims (secure, server-side only)
function isAdmin() {
  return request.auth != null && request.auth.token.admin == true;
}

// Used throughout rules instead of email checks
allow read: if isAdmin();
```

**Status**: ✅ **COMPLETED** - Ready for deployment

---

### 2. Auto-Ignore Logic Migration ✅ IMPLEMENTED

**Previous Issue**: Client-side auto-ignore logic could be manipulated by users

**Solution Implemented**:
- ✅ Created `autoIgnoreOldScans` scheduled function (runs every 5 minutes)
- ✅ Created `manualAutoIgnore` Cloud Function for manual triggering (admin-only)
- ✅ Removed client-side auto-ignore Firestore writes from iOS app
- ✅ Updated iOS app to filter `auto_ignored` status scans from UI

**Files Modified**:
- `functions/index.js` - Added scheduled auto-ignore functions
- `apple/lib/services/firestore_service.dart` - Removed client-side writes

**Implementation**:
```javascript
// functions/index.js - autoIgnoreOldScans (Lines 6979-7049)
export const autoIgnoreOldScans = onSchedule({
  schedule: 'every 5 minutes',
  region: REGION,
  timeoutSeconds: 300,
  retryCount: 3
}, async (context) => {
  const tenMinutesAgo = Timestamp.fromDate(
    new Date(Date.now() - 10 * 60 * 1000)
  );

  const oldScansSnapshot = await db.collection('scans')
    .where('status', '==', 'pending')
    .where('timestamp', '<=', tenMinutesAgo)
    .get();

  if (oldScansSnapshot.empty) {
    logger.info('No old scans to auto-ignore');
    return null;
  }

  // Batch update with proper batching (500 ops limit)
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of oldScansSnapshot.docs) {
    batch.update(doc.ref, {
      status: 'auto_ignored',
      autoIgnoredAt: FieldValue.serverTimestamp(),
      autoIgnoredReason: 'timeout_10min'
    });

    batchCount++;
    if (batchCount >= 500) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  return { success: true, scansIgnored: oldScansSnapshot.size };
});
```

**iOS App Update** (`apple/lib/services/firestore_service.dart` Lines 41-50):
```dart
// Before: Client wrote to Firestore (insecure)
// After: Client just filters, server handles writes
if (scan.status == 'pending' && scanAge.inMinutes >= 10) {
  continue; // Don't show - will be auto-ignored by server
}

if (scan.status == 'auto_ignored') {
  continue; // Skip server-ignored scans
}
```

**Status**: ✅ **COMPLETED** - Ready for deployment

---

### 3. Firebase App Check Implementation (HIGH)

**Current Issue**: Firebase API keys exposed in app bundle, though restricted by bundle ID.

**Required Solution**:
- Enable Firebase App Check for iOS
- Configure App Attest provider
- Update Cloud Functions to require App Check tokens

**Implementation Steps**:
1. Enable App Check in Firebase Console
2. Add App Check SDK to Flutter app
3. Configure App Attest provider (iOS)
4. Update all Cloud Functions to enforce App Check

**Firebase Console Configuration**:
```
Project Settings → App Check → iOS Apps → QRCallBox
Provider: App Attest (recommended for production)
```

**Flutter Implementation**:
```dart
// lib/main.dart
import 'package:firebase_app_check/firebase_app_check.dart';

await Firebase.initializeApp();
await FirebaseAppCheck.instance.activate(
  appleProvider: AppleProvider.appAttest,
);
```

**Cloud Function Enforcement**:
```javascript
// functions/index.js
exports.protectedFunction = functions
  .runWith({ enforceAppCheck: true })
  .https.onCall(async (data, context) => {
    // Only requests with valid App Check tokens reach here
  });
```

**Priority**: 🟠 **HIGH**

---

## 📋 Recommended Enhancements

These improvements are not critical but would further strengthen security:

### 1. Code Obfuscation

**Status**: Not implemented

**Recommendation**: Build release IPA with obfuscation enabled:
```bash
flutter build ipa --release --obfuscate --split-debug-info=build/app/outputs/symbols
```

**Priority**: 🟡 MEDIUM

---

### 2. SSL Certificate Pinning

**Status**: Not implemented

**Recommendation**: Add certificate pinning for Firebase endpoints to prevent MITM attacks.

**Implementation**:
```yaml
# pubspec.yaml
dependencies:
  http_certificate_pinning: ^latest
```

**Priority**: 🟡 MEDIUM

---

### 3. Jailbreak Detection

**Status**: Not implemented

**Recommendation**: Add runtime integrity checks to detect compromised devices.

**Implementation**:
```yaml
dependencies:
  flutter_jailbreak_detection: ^latest
```

```dart
bool isJailbroken = await FlutterJailbreakDetection.jailbroken;
if (isJailbroken) {
  // Show warning or restrict functionality
}
```

**Priority**: 🟢 LOW

---

### 4. Session Timeout

**Status**: Not implemented

**Recommendation**: Implement automatic logout after 30 minutes of inactivity.

**Priority**: 🟡 MEDIUM

---

### 5. Biometric Authentication

**Status**: Not implemented

**Recommendation**: Add Face ID/Touch ID for app access.

**Priority**: 🟢 LOW

---

### 6. Crashlytics Integration

**Status**: Not implemented

**Recommendation**: Add Firebase Crashlytics for production error tracking.

**Implementation**:
```yaml
dependencies:
  firebase_crashlytics: ^latest
```

**Priority**: 🟡 MEDIUM

---

### 7. Encrypted Local Storage

**Status**: Not implemented

**Current**: SharedPreferences (unencrypted)

**Recommendation**: Use `flutter_secure_storage` for sensitive data.

**Priority**: 🟡 MEDIUM

---

## 🎯 Pre-Production Checklist

Before releasing to TestFlight or App Store:

### Critical (Must Complete)
- [x] Remove/wrap all sensitive print statements
- [x] Add iOS privacy permission descriptions
- [x] Implement input validation/sanitization
- [x] Enforce strong password requirements
- [x] Validate FCM notification payloads
- [x] **Move admin checks to Cloud Functions with Custom Claims** ✅
- [x] **Migrate auto-ignore logic to Cloud Functions** ✅
- [ ] **Deploy backend security updates** (see [DEPLOYMENT_SECURITY.md](/DEPLOYMENT_SECURITY.md))
  - [ ] Deploy Firestore security rules
  - [ ] Deploy Cloud Functions
  - [ ] Set admin Custom Claim for super admin
  - [ ] Verify scheduled function running
- [ ] **Implement Firebase App Check** (recommended but not blocking)
- [ ] Verify Firestore security rules are strict
- [ ] Test all security validations
- [ ] Review error messages (no implementation details exposed)

### Recommended (Should Complete)
- [ ] Enable Flutter code obfuscation in build
- [ ] Implement SSL certificate pinning
- [ ] Add session timeout
- [ ] Enable Firebase Crashlytics
- [ ] Implement rate limiting for sensitive operations
- [ ] Add jailbreak detection

### Optional (Nice to Have)
- [ ] Add biometric authentication
- [ ] Implement encrypted local storage
- [ ] Create security monitoring dashboard
- [ ] Set up automated security testing

---

## 📊 Security Testing

### Manual Testing Completed
- ✅ Password validation with various weak passwords
- ✅ Input validation with malformed data
- ✅ FCM payload validation with invalid data
- ✅ Production build log verification (no sensitive data)

### Recommended Automated Testing
- Unit tests for all validation functions
- Integration tests for auth flows
- Security penetration testing (OWASP Mobile)
- Automated dependency vulnerability scanning

---

## 📚 Security Best Practices

### For Future Development

1. **Never Trust Client Input**: Always validate and sanitize on both client and server
2. **Defense in Depth**: Multiple layers of security (client validation + server validation + Firestore rules)
3. **Principle of Least Privilege**: Users only access data for their assigned store
4. **Secure Defaults**: Fail closed (deny access) rather than fail open
5. **Regular Audits**: Review security posture quarterly
6. **Dependency Updates**: Keep Firebase SDK and dependencies updated
7. **Secret Management**: Never commit secrets to source control

---

## 🔗 Related Documentation

- **Main Development Guide**: `/apple/APPLECLAUDE.md`
- **Flutter README**: `/apple/README_FLUTTER.md`
- **TestFlight Setup**: `/apple/TESTFLIGHT_SETUP.md`
- **Firebase Security Rules**: `/firestore.rules` (project root)
- **Cloud Functions**: `/functions/index.js`

---

## 📝 Change Log

### 2025-01-XX - Initial Security Hardening
- Implemented kDebugMode logging protection
- Added iOS privacy permissions
- Created comprehensive input validation
- Enforced strong password requirements
- Added FCM payload validation
- Documented remaining server-side tasks

---

## 🆘 Security Incident Response

If a security vulnerability is discovered:

1. **Do Not** publish details publicly
2. Contact: sinaptick@gmail.com
3. Document the vulnerability privately
4. Assess impact and severity
5. Develop and test fix
6. Deploy fix to production
7. Force update if critical
8. Notify affected users if data breach

---

## 📞 Security Contact

**Primary Contact**: sinaptick@gmail.com
**Project**: QRCallBox iOS/Flutter App
**Repository**: (Private)

---

---

## 📝 Summary

### Completed (Client-Side)
- ✅ Sensitive logging protection
- ✅ iOS privacy permissions
- ✅ Input validation & sanitization
- ✅ Strong password enforcement
- ✅ FCM payload validation

### Completed (Server-Side - Awaiting Deployment)
- ✅ Custom Claims for admin authorization
- ✅ Scheduled auto-ignore function
- ✅ Updated Firestore security rules
- ✅ Manual auto-ignore trigger
- ✅ Custom Claims management functions

### Pending
- ⏳ Backend deployment (see [DEPLOYMENT_SECURITY.md](/DEPLOYMENT_SECURITY.md))
- ⏳ Firebase App Check enablement
- ⏳ Production testing & verification

### Recommended Future Enhancements
- 🔄 Code obfuscation
- 🔄 SSL certificate pinning
- 🔄 Session timeout
- 🔄 Jailbreak detection
- 🔄 Firebase Crashlytics
- 🔄 Biometric authentication

---

**Last Updated**: January 2025 (Server-side implementation complete)
**Next Review**: After production deployment
**Version**: 2.0 (includes server-side security tasks)
