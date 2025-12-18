# Fix: iOS Google Sign-In Authentication Error

## Error Message
```
The supplied auth credential is malformed or expired
```

## Root Cause
The iOS OAuth 2.0 client is not properly configured in Google Cloud Console for your Firebase project.

---

## Solution: Add iOS OAuth Client

### Step 1: Go to Google Cloud Console

1. Open: https://console.cloud.google.com/apis/credentials?project=qrwebaccdb
2. Sign in with the account that owns the Firebase project
3. Make sure **qrwebaccdb** is selected in the project dropdown

### Step 2: Create iOS OAuth Client ID

1. Click **+ CREATE CREDENTIALS**
2. Select **OAuth client ID**
3. If prompted to configure OAuth consent screen:
   - Click **CONFIGURE CONSENT SCREEN**
   - Select **External** (or Internal if workspace)
   - Fill in:
     - **App name**: QRCallBox
     - **User support email**: sinaptick@gmail.com
     - **Developer contact**: sinaptick@gmail.com
   - Click **Save and Continue**
   - Skip Scopes (click **Save and Continue**)
   - Add test users if needed (click **Save and Continue**)
   - Click **Back to Dashboard**

4. **Create iOS client**:
   - Click **+ CREATE CREDENTIALS** again
   - Select **OAuth client ID**
   - **Application type**: iOS
   - **Name**: QRCallBox iOS
   - **Bundle ID**: `com.stable.qrcallbox`
   - **App Store ID**: (leave empty for now)
   - Click **CREATE**

5. **Copy the Client ID** (format: `xxx-yyy.apps.googleusercontent.com`)

### Step 3: Update Firebase Configuration (if needed)

The app already has the correct client ID configured, so you just need to ensure it matches:

**Current client ID in app**: `611687644130-rblcqohnsalv5sf7950mndtn6fm01cu7.apps.googleusercontent.com`

**Verify this matches in**:
- GoogleService-Info.plist → CLIENT_ID
- auth_service.dart → clientId parameter

### Step 4: Enable Google Sign-In in Firebase

1. Go to Firebase Console: https://console.firebase.google.com/project/qrwebaccdb/authentication/providers
2. Click **Google** provider
3. Click **Edit** (pencil icon)
4. Ensure **Enable** toggle is ON
5. Under **Web SDK configuration**:
   - **Web client ID** should be: `611687644130-mvekekolkuolg1midiv6chn93jrc6j9t.apps.googleusercontent.com`
6. Under **iOS**:
   - Verify iOS client ID is listed: `611687644130-rblcqohnsalv5sf7950mndtn6fm01cu7.apps.googleusercontent.com`
7. Click **Save**

---

## Alternative: Use Email/Password Registration

If you want users to register without Google Sign-In:

1. In the iOS app, use **email/password registration** instead
2. This is already implemented in `auth_service.dart` → `registerUser()`
3. The registration form should collect:
   - Email
   - Password (minimum 12 characters with complexity requirements)
   - First Name
   - Last Name
   - Store Number

### Password Requirements
- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (!@#$%^&*(),.?":{}|<>)

---

## Testing the Fix

### Test Google Sign-In
1. Build and run the iOS app
2. Click **Sign in with Google**
3. Select Google account
4. Should successfully authenticate

### Test Email Registration
1. Open registration screen
2. Fill in all required fields
3. Click **Register**
4. Should create account successfully
5. Account will be pending admin approval

---

## Troubleshooting

### "No iOS OAuth client found"
- Create one following Step 2 above
- Use Bundle ID: `com.stable.qrcallbox`

### "OAuth consent screen not configured"
- Follow the consent screen setup in Step 2
- Add your email as a test user if using External type

### "The app is not authorized"
- Ensure Bundle ID matches exactly: `com.stable.qrcallbox`
- Check that the OAuth client is enabled
- Try cleaning and rebuilding:
  ```bash
  cd /Users/shanesmith/Documents/qrcall/apple
  flutter clean
  flutter pub get
  flutter run
  ```

### Still getting credential errors
- Verify the CLIENT_ID in GoogleService-Info.plist matches the iOS OAuth client
- Check that Info.plist has the correct URL scheme:
  ```xml
  <string>com.googleusercontent.apps.611687644130-rblcqohnsalv5sf7950mndtn6fm01cu7</string>
  ```
- Ensure Firebase project ID is correct: `qrwebaccdb`

---

## Quick Check Commands

```bash
# Navigate to iOS project
cd /Users/shanesmith/Documents/qrcall/apple

# Check GoogleService-Info.plist
cat ios/Runner/GoogleService-Info.plist | grep CLIENT_ID

# Check Info.plist URL schemes
cat ios/Runner/Info.plist | grep -A 2 CFBundleURLSchemes

# Clean and rebuild
flutter clean
flutter pub get
pod repo update
cd ios && pod install && cd ..
flutter run
```

---

## Summary

The most common fix is to ensure an **iOS OAuth 2.0 Client ID** exists in Google Cloud Console with the Bundle ID `com.stable.qrcallbox`. Once created, the existing app configuration should work properly.

**Project**: QRCallBox iOS
**Bundle ID**: com.stable.qrcallbox
**Firebase Project**: qrwebaccdb
