# QRCall Android App - Firebase Configuration Template

## Firebase Project Details
```
Project ID: YOUR_PROJECT_ID
Project Name: Your Project Name
Firebase URL: https://YOUR_PROJECT_ID.firebaseapp.com
```

## Configuration Values
```kotlin
// Add these to your Android app's local.properties or BuildConfig
const val FIREBASE_API_KEY = "YOUR_API_KEY_HERE"
const val FIREBASE_AUTH_DOMAIN = "YOUR_PROJECT_ID.firebaseapp.com"
const val FIREBASE_PROJECT_ID = "YOUR_PROJECT_ID"
const val FIREBASE_STORAGE_BUCKET = "YOUR_PROJECT_ID.firebasestorage.app"
const val FIREBASE_MESSAGING_SENDER_ID = "YOUR_SENDER_ID"
const val FIREBASE_APP_ID = "YOUR_APP_ID"
const val FIREBASE_MEASUREMENT_ID = "YOUR_MEASUREMENT_ID"
```

## ⚠️ SECURITY NOTICE ⚠️

**NEVER commit actual Firebase credentials to Git!**

1. Copy this template to `ANDROID_FIREBASE_CONFIG.md`
2. Replace template values with your actual Firebase config
3. The real config file is ignored by .gitignore
4. Share credentials securely through other means (env vars, secure notes, etc.)

## Setup Instructions

### 1. Download google-services.json
1. Go to https://console.firebase.google.com/project/YOUR_PROJECT_ID/settings/general
2. Click "Add app" → Choose Android
3. Enter package name: `com.stable.qrcallbox`
4. Download `google-services.json`
5. Place in `app/` folder (this file is also ignored by git)

### 2. Google Sign-In Setup
1. In Firebase Console → Authentication → Sign-in method
2. Enable Google provider
3. Add your app's SHA-1 fingerprint
4. Download updated `google-services.json`

### 3. Cloud Messaging Setup
1. In Firebase Console → Cloud Messaging
2. Generate new key pair if needed
3. Note the Server Key for backend integration

## Environment Configuration Template

Replace these values with your actual configuration:

```bash
# Environment variables for secure deployment
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
```

---
**Remember: Keep your actual credentials secure and never commit them to version control!**