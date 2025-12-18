# iOS Firebase Setup

## Required: GoogleService-Info.plist

To run this app on iOS, you need to add the iOS Firebase configuration file.

### Steps:

1. Go to [Firebase Console](https://console.firebase.google.com/project/qrwebaccdb/settings/general)
2. Click "Add app" → Select iOS
3. Enter iOS bundle ID: `com.stable.qrcallbox`
4. Download the `GoogleService-Info.plist` file
5. Place it in this directory: `ios/Runner/GoogleService-Info.plist`
6. The file should be in the same directory as this README

### Note:
The Android Firebase configuration (`google-services.json`) is already configured.
You only need to add the iOS config file to build for iOS devices.
