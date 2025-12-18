# QRCallBox iOS App - Developer Guide for Claude

## Project Overview
This is the **iOS/iPadOS companion app** for the QRCallBox system, built with **Flutter**. It provides retail store employees with real-time customer assistance notifications and request management on Apple devices.

**Current Version**: 1.0.0 (Development)
**Flutter SDK**: Latest stable
**Target**: iOS 13.0+ / iPadOS 13.0+
**Platform**: Universal (iPhone & iPad)

## Quick Start

### Prerequisites
- Xcode 14+ installed
- Flutter SDK configured
- CocoaPods installed
- iOS Simulator or physical device

### Running the App
```bash
# Navigate to project directory
cd /Users/shanesmith/Documents/qrcall/apple

# Get Flutter dependencies
flutter pub get

# Run on connected device or simulator
flutter run

# Run on specific device (get ID from flutter devices)
flutter run -d [DEVICE_ID]

# Hot reload (while app is running)
# Press 'r' in terminal

# Hot restart (while app is running)
# Press 'R' in terminal
```

## Project Structure

```
apple/
├── lib/
│   ├── main.dart                    # App entry point, Firebase init
│   ├── models/                      # Data models
│   │   ├── scan_model.dart         # Customer assistance request model
│   │   └── user_model.dart         # User profile model
│   ├── screens/                     # App screens
│   │   ├── home_screen.dart        # Main dashboard with request list
│   │   ├── login_screen.dart       # Authentication screen
│   │   ├── settings_screen.dart    # Work schedule & preferences
│   │   ├── profile_screen.dart     # User profile display
│   │   └── admin_panel_screen.dart # Admin user management
│   ├── services/                    # Backend services
│   │   ├── auth_service.dart       # Firebase Authentication
│   │   ├── firestore_service.dart  # Database operations
│   │   └── fcm_service.dart        # Push notification handling
│   ├── providers/                   # State management
│   │   └── theme_provider.dart     # Dark mode & theme management
│   └── widgets/                     # Reusable components
│       └── scan_list_item.dart     # Request card with actions
├── ios/                             # iOS-specific configuration
│   ├── Runner/
│   │   ├── GoogleService-Info.plist # Firebase iOS configuration
│   │   └── Info.plist              # App metadata & permissions
│   └── Podfile                     # CocoaPods dependencies
├── android/                         # Android build files (unused)
├── pubspec.yaml                     # Flutter dependencies
└── firebase_options.dart            # Generated Firebase config
```

## Key Features Implemented

### Authentication
- **Google Sign-In**: Primary authentication method
- **Email/Password**: Alternative login option
- **Auto-Login**: Persistent sessions with Firebase Auth
- **Profile Management**: User data stored in Firestore

### Dashboard (Home Screen)
- **Real-Time Request List**: StreamBuilder with Firestore snapshots
- **Shift Status Badge**: Shows "On Shift until HH:MM" or "Off Shift"
- **Store & Job Title Display**: Highlighted with icons and badges
- **Remaining Shift Time**: Dynamic countdown (e.g., "2h 30m left")
- **Claimed Request Display**: Shows assistance requests for 15 minutes after claiming
- **Request Filtering**: User-specific ignore list

### Request Management
- **Assist Button**: Claim customer requests with race condition protection
- **Ignore Button**: Hide requests from personal view (per-user)
- **Timestamp Display**: Shows when request was sent (e.g., "3:45 PM")
- **Elapsed Timer**: Color-coded urgency (green < 2m, orange < 5m, red 5m+)
- **Status Indicators**: Blue badge for claimed requests showing helper name

### Settings
- **Dark Mode**: System default, light, or dark theme options
- **Work Schedule**: Set hours for each day of the week
- **Notification Preferences**: Sound, vibration toggles
- **Theme Persistence**: Saved via SharedPreferences

### Admin Panel
- **Active Associates Tab**: Real-time view of on-shift users
- **All Users Tab**: Complete user directory with shift status
- **Store Grouping**: Users organized by store number
- **Permission-Based Access**:
  - Admins (email: sinaptick@gmail.com) see all users
  - Regular users see only their store's associates

### Profile Screen
- **User Information**: Name, email, job title, store assignment
- **System Details**: User ID, FCM token, app version
- **Admin Badge**: Visual indicator for administrator accounts
- **Debug Information**: Raw user data for troubleshooting

## Firebase Integration

### Authentication
```dart
// lib/services/auth_service.dart
- signInWithGoogle() - Google Sign-In flow
- signInWithEmailAndPassword() - Email/password auth
- signOut() - Logout functionality
- getUserProfile() - Fetch user document from Firestore
- updateFCMToken() - Sync push notification token
```

### Firestore Database

**Collections Used:**
```
users/               # User profiles, store assignments, FCM tokens
  ├── uid (doc ID)
  └── Fields:
      ├── email: string
      ├── firstName: string
      ├── lastName: string
      ├── jobTitle: string
      ├── storeNumber: string | number (handled as string)
      ├── isOnShift: boolean
      ├── shiftEndTime: string (format: "HH:mm")
      ├── fcmToken: string
      ├── fcmTokenUpdatedAt: Timestamp
      ├── isAdmin: computed from email
      └── homeStore: number (for market/region users)

scans/               # Customer assistance requests
  ├── scanId (doc ID)
  └── Fields:
      ├── storeNumber: string
      ├── timestamp: Timestamp
      ├── areaDescription: string
      ├── status: "pending" | "claimed" | "resolved"
      ├── claimedBy: string (user ID)
      ├── claimedByName: string
      ├── claimedAt: Timestamp
      ├── ignoredBy: array<string> (user IDs who ignored this)
      └── responses: array (activity history)
```

**Security Rules:**
- Users can only read/write their own profile
- Users can only see scans for their assigned store
- Admin (sinaptick@gmail.com) has global read access
- Atomic updates prevent race conditions on scan claiming

### Firebase Cloud Messaging (FCM)

**Push Notifications:**
- **iOS Limitation**: Simulators don't support APNS (Apple Push Notification Service)
- **Real Devices**: Full push notification support on physical iPhones/iPads
- **Token Management**: Automatic registration and refresh handling
- **Token Storage**: Synced to Firestore `users/{uid}/fcmToken` field
- **Background Handling**: FirebaseMessaging.onBackgroundMessage configured
- **Action Buttons**: Future enhancement (iOS notification actions)

**FCM Service (`lib/services/fcm_service.dart`):**
```dart
- initialize() - Request permissions, get initial token
- getToken() - Retrieve current FCM registration token
- onTokenRefresh() - Handle token updates
- onNotificationAction - Callback for notification interactions (future)
```

**Permission Handling:**
```dart
NotificationSettings settings = await messaging.requestPermission(
  alert: true,
  badge: true,
  sound: true,
);
```

**Known Issues:**
- iOS simulators show error: `[firebase_messaging/apns-token-not-set]`
- This is expected behavior - APNS requires physical device
- In-app notifications (Firestore real-time) work perfectly on simulator

## State Management

### Provider Pattern
```dart
MultiProvider(
  providers: [
    ChangeNotifierProvider(create: (_) => ThemeProvider()),
    Provider<AuthService>(create: (_) => AuthService()),
    Provider<FirestoreService>(create: (_) => FirestoreService()),
    Provider<FCMService>(create: (_) => FCMService()),
  ],
  child: MaterialApp(...),
)
```

### Theme Management
```dart
// lib/providers/theme_provider.dart
- themeMode: ThemeMode (system/light/dark)
- isDarkMode: boolean computed property
- toggleTheme() - Switch between light/dark
- setThemeMode() - Set specific theme mode
- Persistence via SharedPreferences
```

## UI Design Patterns

### Material Design 3
- **Color Scheme**: `ColorScheme.fromSeed(seedColor: Colors.blue)`
- **Card Elevation**: 2px with 12px border radius
- **Navigation Bar**: Bottom navigation with 3 tabs
- **Theme-Aware Colors**: `Theme.of(context).brightness` checks

### Responsive Layouts
- Universal support for iPhone and iPad
- Portrait and landscape orientations
- Safe area handling for notches and home indicators
- Dynamic text sizing respects system preferences

### Custom Widgets
```dart
// lib/widgets/scan_list_item.dart
- Displays customer assistance requests
- Action buttons (Assist/Ignore)
- Timer with color-coded urgency
- Status badges for claimed requests
- Timestamp formatting
```

## Data Flow

### Request Lifecycle
```
1. Customer scans QR code → Firestore scan document created
2. Real-time Firestore stream notifies iOS app
3. StreamBuilder updates UI with new request
4. User taps "Assist" → Transaction updates scan status
5. Request shows as "claimed" with helper name
6. After 15 minutes, claimed request auto-filters out
7. User can "Ignore" to hide from personal view
```

### User Filtering Logic
```dart
// lib/services/firestore_service.dart - getScansForStore()
- Fetch scans for user's store from last 24 hours
- Filter: Exclude if userId in scan.ignoredBy array
- Filter: Include all "pending" scans
- Filter: Include "claimed" scans from last 15 minutes
- Filter: Exclude "resolved" scans
```

### Race Condition Prevention
```dart
// Firestore transaction for claiming
final success = await _firestore.runTransaction<bool>((transaction) async {
  final scanDoc = await transaction.get(scanRef);
  if (scanDoc.data()!['status'] != 'pending') {
    return false; // Already claimed by someone else
  }
  transaction.update(scanRef, {
    'status': 'claimed',
    'claimedBy': userId,
    'claimedByName': userName,
    'claimedAt': FieldValue.serverTimestamp(),
  });
  return true;
});
```

## Common Issues & Solutions

### Issue: "APNS token has not been set yet"
**Cause**: iOS simulators don't support push notifications
**Solution**: Normal behavior - test on physical device for full FCM

### Issue: No requests showing in app
**Troubleshooting**:
1. Check user's `storeNumber` field in Firestore matches scan documents
2. Verify user is authenticated (check profile screen)
3. Confirm scans exist with status "pending" in Firestore
4. Check Firestore security rules allow user to read scans

### Issue: Google Sign-In crashes
**Cause**: Missing URL schemes or Firebase configuration
**Solution**: Verify `Info.plist` has:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>com.googleusercontent.apps.[YOUR_REVERSED_CLIENT_ID]</string>
    </array>
  </dict>
</array>
```

### Issue: Admin panel shows no users
**Troubleshooting**:
1. Verify `isAdmin` getter checks email == "sinaptick@gmail.com"
2. Confirm users exist in Firestore `users` collection
3. Check console for errors in admin panel data fetching

### Issue: Dark mode text unreadable
**Solution**: Use theme-aware colors:
```dart
color: Theme.of(context).brightness == Brightness.dark
    ? Colors.white.withOpacity(0.9)
    : Colors.black87
```

### Issue: Ignore button not hiding requests
**Troubleshooting**:
1. Verify `ignoredBy` field exists in scan document
2. Check `getScansForStore()` filters by userId
3. Ensure userId is passed correctly from home_screen.dart

## Android Push Notification Troubleshooting

**User reported not receiving Android push notifications:**

Common causes:
1. **Not On Shift**: Check `users/{uid}/isOnShift` field is `true`
2. **Store Mismatch**: Verify `users/{uid}/storeNumber` matches scan document
3. **FCM Token**: Confirm `users/{uid}/fcmToken` is populated and recent
4. **Backend Function**: Check Firebase Cloud Functions logs for FCM send attempts
5. **Battery Optimization**: Android may restrict background app activity
6. **Notification Permissions**: Ensure app has notification permission enabled

Debug steps:
```bash
# Check backend logs
firebase functions:log --only s

# Verify FCM token in Firestore
# Go to Firebase Console → Firestore → users → [user_id] → fcmToken

# Test FCM directly
# Use Firebase Console → Cloud Messaging → Send test message
```

## Testing Workflow

### iOS Simulator Testing
1. ✅ Authentication flows (Google Sign-In, email/password)
2. ✅ Real-time request list updates (Firestore streams)
3. ✅ Assist/Ignore button functionality
4. ✅ Dark mode theme switching
5. ✅ Admin panel (if using admin account)
6. ✅ Profile screen data display
7. ❌ Push notifications (requires physical device)

### Physical Device Testing
1. Connect iPhone/iPad via cable or WiFi
2. Get device ID: `flutter devices`
3. Run: `flutter run -d [DEVICE_ID]`
4. Test all simulator features PLUS:
   - Push notification delivery
   - Background notification handling
   - Notification action buttons (future)
   - APNS token registration

### TestFlight Distribution
See `TESTFLIGHT_SETUP.md` for complete guide.

Quick steps:
1. Configure Xcode signing (Apple Developer account required)
2. Archive app: `Product → Archive` in Xcode
3. Upload to App Store Connect
4. Create TestFlight internal testing group
5. Invite testers via email
6. Testers install TestFlight app and accept invitation

## Deployment Checklist

### Pre-Release
- [ ] Update version in `pubspec.yaml`
- [ ] Update build number in `ios/Runner/Info.plist`
- [ ] Test on multiple iOS versions (13, 14, 15, 16, 17+)
- [ ] Test on iPhone and iPad screen sizes
- [ ] Verify Firebase configuration files present
- [ ] Test dark mode on both light/dark wallpapers
- [ ] Confirm admin panel permissions working
- [ ] Test push notifications on physical device

### Build Release
```bash
# Clean build
flutter clean
flutter pub get

# Build iOS release (via Xcode)
# 1. Open ios/Runner.xcworkspace in Xcode
# 2. Select "Any iOS Device (arm64)"
# 3. Product → Archive
# 4. Distribute to App Store Connect
```

### Post-Release
- Monitor crash reports in App Store Connect
- Check FCM delivery success rates in Firebase Console
- Gather user feedback via TestFlight
- Update documentation with any discovered issues

## Integration with Main System

### Shared Firebase Project
- **Project**: qrwebaccdb
- **Region**: us-central1
- **Web App**: https://qrwebaccdb.web.app
- **Android App**: Native Kotlin app (separate codebase)
- **Backend**: Firebase Cloud Functions (Node.js)

### Cross-Platform Compatibility
- iOS, Android, and web apps share same Firestore database
- Authentication tokens work across all platforms
- FCM tokens platform-specific but managed by same backend
- Real-time updates synchronized via Firestore listeners

### Backend API (Firebase Cloud Functions)
The iOS app doesn't directly call Cloud Functions - it uses Firestore for data:
- `scans` collection monitored for new customer requests
- `users` collection provides profile and shift status
- Backend handles FCM sends to all platforms
- GroupMe and Workvivo integrations server-side only

## Performance Optimizations

### Firestore Queries
```dart
// Limited query scope
.where('storeNumber', isEqualTo: storeNumber)
.where('timestamp', isGreaterThan: twentyFourHoursAgo)
.limit(50)

// Client-side filtering for complex logic
.where((scan) => !scan.ignoredBy.contains(userId))
```

### StreamBuilder Efficiency
- `listen: false` when accessing providers in build methods
- Snapshot caching enabled by default
- Real-time updates only for active screen (home dashboard)

### Image & Asset Loading
- No large images in current version
- Icon fonts (Material Icons) load instantly
- Firebase SDK lazy-loads features

## Future Enhancements

### Planned Features
- [ ] iOS notification action buttons (Assist/Ignore from notification)
- [ ] Offline mode with request queueing
- [ ] Shift start/end from within app
- [ ] In-app chat between store associates
- [ ] Request filtering by department/area
- [ ] Analytics dashboard (for admins)
- [ ] Face ID / Touch ID authentication
- [ ] Apple Watch companion app
- [ ] iPad multi-window support (Stage Manager)
- [ ] Widgets for iOS 14+ home screen

### Known Limitations
- No offline support (requires network connectivity)
- Claimed requests disappear after 15 minutes (consider longer retention)
- No request history view (only current active requests)
- Admin panel requires manual refresh (consider real-time updates)
- No user search in admin panel (sorted alphabetically only)

## Architecture Decisions

### Why Flutter?
- Cross-platform code sharing (iOS/Android/Web)
- Hot reload for rapid development
- Strong Firebase integration
- Material Design 3 built-in
- Large community and package ecosystem

### Why Provider for State?
- Simple and lightweight
- Built-in to Flutter (no external dependencies for Provider itself)
- Good for small-medium apps
- Easy to understand for maintenance

### Why Firestore over REST?
- Real-time updates out of the box
- Offline persistence handled automatically
- Security rules at database level
- Scalable without backend changes
- Free tier generous for this use case

## Security Considerations

> **📋 IMPORTANT**: For comprehensive security audit results, implemented fixes, and remaining tasks, see **[SECURITY_UPDATES.md](./SECURITY_UPDATES.md)**

### Recent Security Hardening (January 2025)

**Completed Improvements**:
- ✅ Sensitive data logging protection (kDebugMode checks)
- ✅ iOS privacy permission descriptions added
- ✅ Comprehensive input validation & sanitization
- ✅ Strong password enforcement (12+ chars, complexity requirements)
- ✅ FCM notification payload validation

**Remaining Critical Tasks** (require backend implementation):
- ⚠️ Admin authorization via Firebase Custom Claims (currently client-side)
- ⚠️ Auto-ignore logic migration to Cloud Functions
- ⚠️ Firebase App Check implementation

**See [SECURITY_UPDATES.md](./SECURITY_UPDATES.md) for complete details and implementation guide.**

---

### Authentication
- Firebase Auth handles token management
- Google Sign-In uses OAuth 2.0
- No passwords stored locally
- Sessions auto-expire per Firebase settings
- **Password Requirements**: 12+ chars, uppercase, lowercase, number, special character

### Data Access
- Firestore security rules enforce access control
- Users can only see data for their assigned store
- Admin detection server-side (can't be spoofed) - **TODO: Implement Custom Claims**
- FCM tokens tied to specific device/app instance

### Code Security
- No API keys hardcoded (managed by Firebase SDK)
- GoogleService-Info.plist not committed to public repos
- User input sanitized and validated before Firestore writes
- XSS not applicable (native app, not WebView)
- Debug logging disabled in production builds

## Debugging Tips

### Enable Verbose Logging
```dart
// main.dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Enable Firebase debug logging
  await Firebase.initializeApp();
  FirebaseFirestore.instance.settings = const Settings(
    persistenceEnabled: true,
    cacheSizeBytes: Settings.CACHE_SIZE_UNLIMITED,
  );

  runApp(const QRCallBoxApp());
}
```

### Xcode Console Filtering
```
# Show only Firebase logs
product:firebase

# Show only Flutter logs
subsystem:com.example.qrcallbox

# Show only errors
process:Runner error
```

### Flutter DevTools
```bash
# Launch DevTools for running app
flutter run -d [DEVICE_ID]
# Then press 'v' in terminal to open DevTools in browser
```

## Contact & Support

- **Project**: QRCallBox iOS App
- **Developer**: Claude (with human oversight)
- **Documentation**: /Users/shanesmith/Documents/qrcall/apple/APPLECLAUDE.md
- **Main Project Docs**: /Users/shanesmith/Documents/qrcall/CLAUDE.md
- **Issues**: Report via project repository or direct communication

## Version History

### v1.0.0 (Current - October 2025)
- Initial iOS app implementation
- Google Sign-In & email/password authentication
- Real-time customer assistance request dashboard
- Dark mode support with persistence
- Admin panel for user management
- Work schedule settings
- Per-user request ignore functionality
- 15-minute claimed request display
- Highlighted store number and job title
- Elapsed timer with color coding
- Request timestamp display
- FCM integration (physical devices only)

---

**Last Updated**: October 16, 2025
**Document Version**: 1.0
**For**: Claude AI Assistant development context
