dont you hv# QRCall Android App - Firebase Configuration

## Firebase Project Details
```
Project ID: qrwebaccdb
Project Name: QRCall Web Account DB
Firebase URL: https://qrwebaccdb.firebaseapp.com
```

## Configuration Values
```kotlin
// Add these to your Android app's local.properties or BuildConfig
const val FIREBASE_API_KEY = "AIzaSyCbpXuSt3UHAWtAfiKbVx621vwpL5cKnkA"
const val FIREBASE_AUTH_DOMAIN = "qrwebaccdb.firebaseapp.com"
const val FIREBASE_PROJECT_ID = "qrwebaccdb"
const val FIREBASE_STORAGE_BUCKET = "qrwebaccdb.firebasestorage.app"
const val FIREBASE_MESSAGING_SENDER_ID = "611687644130"
const val FIREBASE_APP_ID = "1:611687644130:web:3f4011c00e1baae1e397bb"
const val FIREBASE_MEASUREMENT_ID = "G-JXF9XEFCD4"
```

## Cloud Functions Base URL
```kotlin
const val CLOUD_FUNCTIONS_BASE = "https://us-central1-qrwebaccdb.cloudfunctions.net"
```

## Workvivo Bot Endpoint
```kotlin
const val WORKVIVO_BOT_URL = "http://34.45.52.250:5002"
```

## Android App Setup Steps

### 1. Add Android App to Firebase
1. Go to https://console.firebase.google.com/project/qrwebaccdb/settings/general
2. Click "Add app" → Choose Android
3. Enter package name: `com.qrcall.android` (or your choice)
4. Download `google-services.json`
5. Place in `app/` folder

### 2. In app/build.gradle
```gradle
plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
    id 'com.google.gms.google-services'
}

dependencies {
    // Firebase
    implementation platform('com.google.firebase:firebase-bom:32.7.0')
    implementation 'com.google.firebase:firebase-auth-ktx'
    implementation 'com.google.firebase:firebase-firestore-ktx'
    implementation 'com.google.firebase:firebase-messaging-ktx'
    implementation 'com.google.firebase:firebase-analytics-ktx'
}
```

### 3. In project/build.gradle
```gradle
plugins {
    id 'com.google.gms.google-services' version '4.4.0' apply false
}
```

### 4. Initialize Firebase in Application class
```kotlin
class QRCallApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Firebase auto-initializes with google-services.json
        // But you can verify:
        if (FirebaseApp.getApps(this).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setProjectId("qrwebaccdb")
                .setApplicationId(FIREBASE_APP_ID)
                .setApiKey("AIzaSyCbpXuSt3UHAWtAfiKbVx621vwpL5cKnkA")
                .setDatabaseUrl("https://qrwebaccdb.firebaseapp.com")
                .setStorageBucket("qrwebaccdb.firebasestorage.app")
                .setGcmSenderId("611687644130")
                .build()
            FirebaseApp.initializeApp(this, options)
        }
    }
}
```

## Firestore Collections to Access
```kotlin
// Users collection
db.collection("users")
    .whereEqualTo("storeNumber", "1458")
    
// Scans collection  
db.collection("scans")
    .orderBy("timestamp", Query.Direction.DESCENDING)
    
// GroupMe bots collection
db.collection("groupme_bots")
    .whereEqualTo("storeNumber", "1458")
```

## Authentication
```kotlin
// Login with existing web app credentials
FirebaseAuth.getInstance().signInWithEmailAndPassword(email, password)
    .addOnSuccessListener { authResult ->
        // Get user details from Firestore
        val userId = authResult.user?.uid
        db.collection("users").document(userId).get()
    }
```

## FCM Token Registration
```kotlin
// Register device for push notifications
FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
    // Save to Firestore
    val userId = FirebaseAuth.getInstance().currentUser?.uid ?: return@addOnSuccessListener
    db.collection("users").document(userId)
        .update("fcmToken", token)
}
```

## Cloud Function to Call (Already Exists)
```
POST https://us-central1-qrwebaccdb.cloudfunctions.net/handleQRScan
Body: {
    "qrCode": "qr-1458-electronics",
    "timestamp": "2024-01-15T10:30:00Z"
}
```

## Test Store Numbers
- Store 1458 (main test store)
- Store 1234 (if you need another test store)

## Important Security Note
Since these are your actual production credentials:
1. Never commit them directly to GitHub
2. Use BuildConfig or local.properties
3. Add proper authentication before deploying
4. Enable App Check for production

## Next Steps for Claude in Android Studio:
1. Create new Android project
2. Add this Firebase configuration
3. Download and add google-services.json
4. Implement FCM message receiving
5. Create lock screen notifications
6. Add action buttons for Assist/Ignore
7. Update Firestore when user responds

---
Share this file with Claude in Android Studio along with the ANDROID_CLAUDE_CONTEXT.md file to get started immediately!