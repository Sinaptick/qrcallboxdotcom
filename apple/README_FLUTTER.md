# QRCallBox Flutter App

iOS/Android cross-platform app built with Flutter, sharing the same Firebase backend as the web app and native Android app.

## ✅ Completed Setup

### Core Infrastructure
- ✅ Flutter SDK installed (v3.35.5)
- ✅ Project created with proper package structure
- ✅ Firebase configured for Android
- ✅ All dependencies installed

### Services Implemented
- ✅ **AuthService** - Firebase Auth + Google Sign-In
- ✅ **FirestoreService** - Real-time scans, user management, claim/release logic
- ✅ **FCMService** - Push notifications with action buttons (Assist/Ignore)

### Data Models
- ✅ **UserModel** - Matches Firestore `users` collection schema
- ✅ **ScanModel** - Matches Firestore `scans` collection schema

### Features
- ✅ Google Sign-In authentication
- ✅ Real-time Firestore sync for scans
- ✅ Transaction-based claim system (prevents race conditions)
- ✅ FCM push notifications with iOS/Android support
- ✅ Notification action buttons
- ✅ Basic app scaffolding with splash screen

## 🚧 Next Steps

### 1. Add iOS Firebase Config
**Required before running on iOS:**
1. Go to [Firebase Console](https://console.firebase.google.com/project/qrwebaccdb/settings/general)
2. Add iOS app with bundle ID: `com.stable.qrcallbox`
3. Download `GoogleService-Info.plist`
4. Place in: `ios/Runner/GoogleService-Info.plist`

### 2. Build Full UI Screens
- Login screen (enhanced from placeholder)
- Dashboard with recent requests
- Settings screen (work schedule, notifications)
- Scan detail screen
- User profile screen

### 3. iOS-Specific Configuration
- Configure notification categories for action buttons
- Set up APNs certificates in Firebase
- Test notification delivery on physical device
- Handle iOS permission flows

### 4. Testing & Refinement
- Test Google Sign-In on both platforms
- Test FCM notifications (foreground/background/terminated)
- Test claim/release race conditions
- Test real-time Firestore updates

## 📱 Running the App

### Android
```bash
cd /Users/shanesmith/Documents/qrcall/apple
flutter run
```

### iOS (after adding GoogleService-Info.plist)
```bash
cd /Users/shanesmith/Documents/qrcall/apple
flutter run
```

## 🔑 Key Files

### Services
- `lib/services/auth_service.dart` - Authentication logic
- `lib/services/firestore_service.dart` - Database operations
- `lib/services/fcm_service.dart` - Push notifications

### Models
- `lib/models/user_model.dart` - User data structure
- `lib/models/scan_model.dart` - Scan data structure

### Configuration
- `android/app/google-services.json` - Android Firebase config ✅
- `ios/Runner/GoogleService-Info.plist` - iOS Firebase config ⚠️ (needs to be added)

## 🎯 Architecture

```
Flutter App (apple/)
├── Models (UserModel, ScanModel)
├── Services
│   ├── AuthService (Firebase Auth + Google Sign-In)
│   ├── FirestoreService (Database operations)
│   └── FCMService (Push notifications)
├── Screens (To be built)
│   ├── Login
│   ├── Dashboard
│   └── Settings
└── Shared Firebase Backend
    ├── Firestore (users, scans collections)
    ├── Cloud Functions
    └── FCM (cross-platform notifications)
```

## 🔗 Integration with Existing System

This Flutter app:
- **Shares** the same Firestore database as web and Android apps
- **Uses** identical data structures and security rules
- **Receives** notifications from the same Cloud Functions
- **Does not interfere** with existing React web app or Kotlin Android app

## 📦 Dependencies

All packages installed and configured:
- `firebase_core`, `firebase_auth`, `cloud_firestore`, `firebase_messaging`, `firebase_analytics`
- `google_sign_in`, `flutter_local_notifications`, `provider`
- `intl`, `http`, `shared_preferences`, `url_launcher`

## 🚀 Version
- **Version:** 1.7.28+43 (matching Android app version)
- **Bundle ID:** com.stable.qrcallbox
- **Platforms:** iOS + Android

---

**Status:** Core infrastructure complete. Ready for UI development and iOS Firebase configuration.
