# Android App Configuration - FILL IN YOUR VALUES

## Firebase Configuration
Get these from Firebase Console → Project Settings → General → Your apps → Add app → Android

```kotlin
// In local.properties (git-ignored)
FIREBASE_PROJECT_ID=your-project-id-here
FIREBASE_APP_ID=your-app-id-here
FIREBASE_API_KEY=your-web-api-key-here
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
FIREBASE_STORAGE_BUCKET=your-project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
```

## google-services.json
1. Go to Firebase Console
2. Project Settings → Your apps → Android app
3. Download `google-services.json`
4. Place in `app/` directory

## Server Endpoints
```kotlin
// In BuildConfig or Constants.kt
const val WORKVIVO_BOT_URL = "http://34.45.52.250:5002"
const val FIREBASE_FUNCTIONS_BASE = "https://us-central1-YOUR-PROJECT-ID.cloudfunctions.net"
```

## Test Credentials (Development Only)
```kotlin
// NEVER commit these - use Firebase Auth in production
const val TEST_EMAIL = "your-test@email.com"
const val TEST_PASSWORD = "your-test-password"
const val TEST_STORE_NUMBER = "1458"
```

## GroupMe Configuration
```kotlin
// These are handled server-side, Android doesn't need them directly
// But for reference:
// GROUP_ID and BOT_ID are in Firestore groupme_bots collection
```

## How to Add to Android Studio:

### Option 1: Environment Variables (Recommended)
```kotlin
// In app/build.gradle
android {
    defaultConfig {
        buildConfigField "String", "FIREBASE_API_KEY", "\"${System.getenv('FIREBASE_API_KEY')}\""
        buildConfigField "String", "FIREBASE_PROJECT_ID", "\"${System.getenv('FIREBASE_PROJECT_ID')}\""
    }
}
```

### Option 2: local.properties (Git-ignored)
```kotlin
// In local.properties
firebase.apiKey=your-actual-api-key
firebase.projectId=your-actual-project-id

// In app/build.gradle
def localProperties = new Properties()
localProperties.load(new FileInputStream(rootProject.file("local.properties")))

android {
    defaultConfig {
        buildConfigField "String", "FIREBASE_API_KEY", "\"${localProperties['firebase.apiKey']}\""
    }
}
```

### Option 3: Direct in Code (Development Only!)
```kotlin
// FirebaseConfig.kt - ADD TO .gitignore!
object FirebaseConfig {
    const val API_KEY = "your-actual-api-key"
    const val PROJECT_ID = "your-actual-project-id"
    const val APP_ID = "your-actual-app-id"
}
```

## To Get Your Firebase Credentials:

1. **Open Firebase Console**: https://console.firebase.google.com
2. **Select your QRCall project**
3. **Go to Project Settings** (gear icon)
4. **General tab** → Your apps
5. **Add Android app** if not already added:
   - Package name: `com.yourcompany.qrcall`
   - App nickname: QRCall Android
   - SHA-1: (get from Android Studio: gradle → app → Tasks → android → signingReport)
6. **Download google-services.json**
7. **Copy the configuration values**

## Security Checklist:
- [ ] Add `local.properties` to `.gitignore`
- [ ] Add `google-services.json` to `.gitignore` (optional, it's less sensitive)
- [ ] Never commit API keys to repository
- [ ] Use environment variables in CI/CD
- [ ] Enable App Check in Firebase for production
- [ ] Restrict API key in Google Cloud Console

## Example Firebase Init in Android:
```kotlin
class QRCallApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        
        // Firebase is auto-initialized with google-services.json
        // But you can also manually initialize:
        if (FirebaseApp.getApps(this).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                .setApiKey(BuildConfig.FIREBASE_API_KEY)
                .setDatabaseUrl(BuildConfig.FIREBASE_DATABASE_URL)
                .setStorageBucket(BuildConfig.FIREBASE_STORAGE_BUCKET)
                .setGcmSenderId(BuildConfig.FIREBASE_MESSAGING_SENDER_ID)
                .build()
            FirebaseApp.initializeApp(this, options)
        }
    }
}
```

---
IMPORTANT: Fill in the actual values from your Firebase Console before sharing with Claude in Android Studio!