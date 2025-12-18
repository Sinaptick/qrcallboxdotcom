# Android Bug Fixes - iOS Application Notes

This document outlines the bugs we fixed in the Android app and whether they apply to the Flutter iOS app.

## Recent Android Bugs Fixed (v1.7.31-1.7.32)

### ✅ Bug 1: Active Associates Tab Crash
**Android Issue**: Using Firebase v8 API (`db.collection().doc().get()`) with Firebase v9 SDK
**Status in iOS**: **NOT APPLICABLE** ✅
**Reason**: Flutter uses modern Firebase SDK correctly. The AuthService (line 78) and FirestoreService already use proper API patterns:
```dart
final doc = await _firestore.collection('users').doc(uid).get();
if (doc.exists) {
  return UserModel.fromFirestore(doc);
}
```

**iOS App Status**: No Active Associates feature implemented yet, but when you build it, the Firebase code is already correct.

---

### ⚠️ Bug 2: Shift Display Showing "No Shift Scheduled"
**Android Issue**: App was calling `/getActiveAssociatesCount` API instead of `/getActiveAssociates`, and manually querying Firestore without populating shift times.
**Status in iOS**: **NEEDS ATTENTION** ⚠️

**What to do**: When you implement Active Associates in iOS, make sure to:
1. Call `/api/getActiveAssociates` endpoint (NOT `/getActiveAssociatesCount`)
2. The API returns properly formatted shift times:
   ```json
   {
     "activeAssociates": [
       {
         "id": "user123",
         "firstName": "John",
         "lastName": "Doe",
         "shiftStart": "08:00",
         "shiftEnd": "17:00",
         "storeNumber": "1458"
       }
     ]
   }
   ```

**iOS Implementation Guide**:
Create an API service file (`lib/services/api_service.dart`):

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:firebase_auth/firebase_auth.dart';

class ApiService {
  static const String baseUrl = 'https://us-central1-qrwebaccdb.cloudfunctions.net';

  Future<List<ActiveAssociate>> getActiveAssociates(String storeNumber) async {
    try {
      // Get Firebase auth token
      final user = FirebaseAuth.instance.currentUser;
      final token = await user?.getIdToken();

      if (token == null) throw Exception('Not authenticated');

      // Call API
      final response = await http.post(
        Uri.parse('$baseUrl/getActiveAssociates'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({'storeNumber': storeNumber}),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final associates = (data['activeAssociates'] as List)
            .map((json) => ActiveAssociate.fromJson(json))
            .toList();
        return associates;
      } else {
        throw Exception('Failed to load active associates');
      }
    } catch (e) {
      print('Error loading active associates: $e');
      rethrow;
    }
  }
}

class ActiveAssociate {
  final String id;
  final String firstName;
  final String lastName;
  final String storeNumber;
  final String shiftStart;  // e.g., "08:00"
  final String shiftEnd;    // e.g., "17:00"

  ActiveAssociate({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.storeNumber,
    required this.shiftStart,
    required this.shiftEnd,
  });

  factory ActiveAssociate.fromJson(Map<String, dynamic> json) {
    return ActiveAssociate(
      id: json['id'] ?? '',
      firstName: json['firstName'] ?? '',
      lastName: json['lastName'] ?? '',
      storeNumber: json['storeNumber']?.toString() ?? '',
      shiftStart: json['shiftStart'] ?? '',
      shiftEnd: json['shiftEnd'] ?? '',
    );
  }

  String get fullName => '$firstName $lastName'.trim();
  String get shiftTime => '$shiftStart - $shiftEnd';
}
```

**Add dependency to pubspec.yaml**:
```yaml
dependencies:
  http: ^1.2.0  # Add this line
```

---

### ✅ Bug 3: Google Sign-In Configuration
**Android Issue**: Missing OAuth client configuration in `google-services.json`
**Status in iOS**: **NEEDS FIREBASE SETUP** ⚠️

**What to do**:
1. Download `GoogleService-Info.plist` from Firebase Console (iOS configuration)
2. Place at: `apple/ios/Runner/GoogleService-Info.plist`
3. Add to Xcode project (drag & drop into Runner folder)

**iOS-Specific Google Sign-In Setup**:

The code in `auth_service.dart` is correct, but you need to configure URL schemes:

**In `ios/Runner/Info.plist`**, add:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleTypeRole</key>
    <string>Editor</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <!-- Replace with REVERSED_CLIENT_ID from GoogleService-Info.plist -->
      <string>com.googleusercontent.apps.YOUR-CLIENT-ID</string>
    </array>
  </dict>
</array>
```

**Steps**:
1. Open `GoogleService-Info.plist` after downloading
2. Find `REVERSED_CLIENT_ID` value
3. Add it to the URL scheme in Info.plist above
4. Rebuild app

---

## New Features iOS Currently Lacks

### 1. Active Associates Feature
**What it is**: Shows all employees currently on shift at the store with their names and shift times.

**Android Implementation**:
- Screen: `UsersActivity.kt`
- Adapter: `ActiveAssociatesAdapter.kt`
- Model: `ActiveAssociate.kt`

**iOS Recommendation**: Create a new screen:
- `lib/screens/active_associates_screen.dart`
- `lib/models/active_associate_model.dart`
- Add to navigation in `home_screen.dart`

---

### 2. Work Schedule Management
**What it is**: Users can set their work schedules (days/hours) in Settings.

**iOS Status**: Settings screen exists but work schedule UI not implemented yet.

**Check**: `lib/screens/settings_screen.dart` - add schedule management UI similar to Android's `SettingsActivity.kt`

---

## Summary Checklist for iOS

### Before TestFlight Release:
- [x] ~~Firebase v8/v9 API issue~~ - Not applicable, already using correct SDK
- [ ] **Download and add `GoogleService-Info.plist`**
- [ ] **Configure Google Sign-In URL schemes in Info.plist**
- [ ] Test Google Sign-In on iOS device
- [ ] If implementing Active Associates: Use `/api/getActiveAssociates` endpoint
- [ ] If implementing Work Schedule: Store schedule in Firestore `users` collection

### Nice to Have (Future):
- [ ] Implement Active Associates screen
- [ ] Implement Work Schedule UI in Settings
- [ ] Add admin panel functionality
- [ ] Implement notification action buttons (Assist/Ignore)

---

## API Endpoints Reference

### Correct Endpoints to Use:
```
POST /api/getActiveAssociates
Body: { "storeNumber": "1458" }
Returns: Full associate list with shift times

POST /api/auth/login
POST /api/auth/register
POST /api/notification-response
```

### Wrong Endpoints (Don't Use):
```
/getActiveAssociatesCount - Only returns count, no shift data
```

---

## Version Alignment

| Platform | Version | Build | Status |
|----------|---------|-------|--------|
| Android | 1.7.32 | 47 | ✅ Deployed |
| iOS (Flutter) | 1.7.32 | 47 | ⚠️ Needs Firebase setup |
| Web App | - | - | ✅ Running |

---

## Next Steps

1. **Complete Firebase Setup**:
   ```bash
   # Download GoogleService-Info.plist from:
   https://console.firebase.google.com/project/qrwebaccdb/settings/general/ios:com.stable.qrcallbox

   # Place at:
   /Users/shanesmith/Documents/qrcall/apple/ios/Runner/GoogleService-Info.plist
   ```

2. **Configure Google Sign-In URL Scheme**:
   - Open `GoogleService-Info.plist`
   - Copy `REVERSED_CLIENT_ID` value
   - Add to `ios/Runner/Info.plist` (see above)

3. **Test Build**:
   ```bash
   cd /Users/shanesmith/Documents/qrcall/apple
   flutter clean
   flutter pub get
   flutter run  # Test on simulator first
   ```

4. **Build for TestFlight**:
   ```bash
   flutter build ipa --release
   # Then upload via Xcode or Transporter
   ```

---

## Questions?

If you encounter any issues specific to iOS that weren't in the Android app, document them here for future reference.

**Common iOS-Only Issues**:
- **CocoaPods**: If Firebase dependencies fail, run: `cd ios && pod install --repo-update`
- **Signing**: Use Xcode's automatic signing for simplicity
- **Provisioning**: Xcode will create profiles automatically if signed in with Apple Developer account

---

**Last Updated**: October 15, 2025
**Android Version**: 1.7.32 (Build 47)
**iOS Version**: 1.7.32 (Build 47) - Pending Firebase setup
