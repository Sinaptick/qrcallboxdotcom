# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

QRCallBox is an Android companion app for a customer assistance notification system. When customers scan QR codes in retail stores, this app receives push notifications and allows employees to respond with "Assist" or "Ignore" actions.

## Build Commands

```bash
# Build the project
./gradlew build

# Build debug APK
./gradlew assembleDebug

# Build release APK
./gradlew assembleRelease

# Run unit tests
./gradlew test

# Run instrumented tests (requires device/emulator)
./gradlew connectedAndroidTest

# Clean build artifacts
./gradlew clean
```

## Project Architecture

### Core Components

- **QRCallBoxApplication**: Application class that initializes Firebase and creates notification channels
- **LoginActivity**: Handles both user login and registration with Firebase Auth
- **MainActivity**: Main dashboard showing user info, shift status, and recent customer requests
- **SettingsActivity**: Allows users to configure work schedules and notification preferences
- **QRCallMessagingService**: Firebase messaging service that handles push notifications and checks user schedules

### Data Models

- **User**: Contains user info, shift status, work schedule, and notification preferences
- **ScanNotification**: Represents a customer assistance request with responses
- **Response**: User response to a customer request (assist/ignore)
- **WorkSchedule**: Weekly schedule with DaySchedule objects for each day
- **DaySchedule**: Working hours for a specific day

### Key Features

1. **Smart Notifications**: Only shows notifications during scheduled work hours when user is on shift
2. **Schedule Management**: Users can set different working hours for each day of the week
3. **Response Tracking**: Records who responded to customer requests and when
4. **Firebase Integration**: Uses existing web app's Firestore database and authentication

## Firebase Configuration

The app connects to Firebase project ID: `qrwebaccdb`

### Required Setup
1. Download `google-services.json` from Firebase Console
2. Place in `app/` directory
3. Users must be added to the `users` collection in Firestore with their store number

### Firestore Collections

- `users/`: User profiles with store assignments and FCM tokens
- `scans/`: Customer assistance requests with response tracking
- `groupme_bots/`: GroupMe integration data (read-only for Android app)

## Notification Flow

1. Customer scans QR code → Cloud Function triggers
2. Cloud Function sends FCM message to relevant store employees
3. QRCallMessagingService receives message
4. Checks user schedule/shift status/preferences
5. Shows notification with Assist/Ignore buttons if criteria met
6. User response updates Firestore and triggers GroupMe notification

## Testing

To test notifications:
1. Use the floating action button in MainActivity for test notifications
2. Or trigger from the web interface with a test QR code
3. Verify notifications appear only during scheduled hours when on shift

## Important Files

- `app/installation/ANDROID_FIREBASE_CONFIG.md`: Firebase configuration details
- `app/installation/ANDROID_CLAUDE_CONTEXT.md`: System architecture documentation
- `app/build.gradle.kts`: Dependencies and build configuration
- `app/src/main/AndroidManifest.xml`: App permissions and component declarations

## Development Notes

- Package name: `com.stable.qrcallbox`
- Min SDK: 24, Target SDK: 36
- Uses Material Design 3 components
- Kotlin with coroutines for async operations
- ViewBinding enabled for layouts
- ProGuard disabled for easier debugging