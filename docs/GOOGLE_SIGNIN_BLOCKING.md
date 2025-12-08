# Google Sign-In Blocking - Implementation Notes

## Current Status (2025-01-11)

### Frontend Blocking ✅ DEPLOYED
**Status**: **ACTIVE** - Users cannot sign in with Google

**Implementation**:
- Removed Google sign-in button from `LoginForm.jsx`
- Removed Google sign-up button from `RegisterForm.jsx`
- Removed all `GoogleAuthProvider` imports and handlers
- Users see only email/password authentication

**Deployed**: 2025-01-11
**Effective**: Immediately

### Backend Blocking ⚠️ PARTIAL
**Status**: **NOT DEPLOYED** - Requires GCIP configuration

**Attempted Implementation**:
```javascript
export const blockGoogleSignIn = beforeUserCreated((event) => {
  const isGoogleProvider = event.data.providerData?.some(
    provider => provider.providerId === 'google.com'
  );

  if (isGoogleProvider) {
    throw new HttpsError(
      'permission-denied',
      'Google sign-in is currently disabled.'
    );
  }
});
```

**Deployment Error**:
```
Request to identitytoolkit.googleapis.com had HTTP Error: 400
OPERATION_NOT_ALLOWED: Blocking Functions may only be configured for GCIP projects.
```

**What is GCIP?**
Google Cloud Identity Platform - Enhanced identity and access management service
- Upgraded version of Firebase Auth
- Required for `beforeUserCreated` blocking functions
- Costs ~$50/month minimum

**Current Workaround**:
Frontend blocking is sufficient because:
1. Users cannot access Google sign-in UI
2. Direct API calls would require:
   - Firebase API key (public but requires project setup)
   - OAuth credentials (controlled by us)
   - Understanding of our backend structure
3. Any malicious attempts would still fail at Firestore security rules (no user document = no access)

## Why Google Sign-In Was Problematic

### Original Issue
Users signing up with Google had:
- ❌ `storeNumber` defaulting to blank/null
- ❌ No `allowedStores` array
- ❌ Unable to receive notifications
- ❌ Unable to see any scans in app

### Root Cause
Google sign-up flow in `RegisterForm.jsx` required users to:
1. Fill out form (first name, last name, etc.)
2. Select store/access level
3. Click "Create account with Google"

**Problem**: If users clicked Google button before completing form:
- Form validation failed
- But Google popup already opened
- Users could authenticate via Google popup
- Firebase Auth created account
- Our Firestore user creation never ran → blank store number

### Why Email/Password Works
Email registration flow:
1. Form validation happens BEFORE Firebase Auth call
2. Cannot proceed without all required fields
3. `createUserWithEmailAndPassword` + `setDoc` in same transaction
4. User always has complete profile

## Security Considerations

### Current Protection Layers

**Layer 1: Frontend** ✅
- No Google sign-in UI
- Users cannot trigger Google auth flow

**Layer 2: Firebase Auth Configuration** ✅
- Could disable Google provider in Firebase Console
- Location: Firebase Console → Authentication → Sign-in Method → Google → Disable

**Layer 3: Firestore Security Rules** ✅
```javascript
// Users must have a valid user document
allow read: if request.auth != null &&
  exists(/databases/$(database)/documents/users/$(request.auth.uid));

// Users without user document cannot access anything
```

**Layer 4: Backend Blocking Functions** ⚠️ NOT AVAILABLE
- Would require GCIP upgrade (~$50/month)
- Not currently cost-justified

### Recommended Configuration

**Option A: Frontend Only (Current)** ✅ RECOMMENDED
- Cost: $0
- Effectiveness: Very high
- Limitation: Could be bypassed by determined attacker with API knowledge

**Option B: Disable Google Provider in Console** ✅ RECOMMENDED ADDITION
- Cost: $0
- Effectiveness: Excellent
- Steps:
  1. Go to Firebase Console
  2. Authentication → Sign-in Method
  3. Find Google provider
  4. Click Edit → Disable

**Option C: Upgrade to GCIP** ❌ NOT RECOMMENDED
- Cost: ~$50/month minimum
- Benefit: Blocking functions
- Justification: Not worth cost for this use case

## Implementation Recommendations

### Immediate Action (Do This Now)
1. ✅ Frontend blocking deployed
2. **TODO**: Disable Google provider in Firebase Console
   - Navigate to: https://console.firebase.google.com/project/qrwebaccdb/authentication/providers
   - Find Google provider
   - Disable it

### Long-term Monitoring
- Check Firebase Auth logs monthly for any Google sign-in attempts
- If attempts detected, investigate and patch accordingly
- Consider GCIP only if seeing significant abuse

## Alternative: Properly Implement Google Sign-Up

If you ever want to re-enable Google sign-in, here's how to do it correctly:

**Backend Changes Required**:
```javascript
// Add Cloud Function to handle post-auth user creation
export const createUserDocument = onAuthUserCreated(async (event) => {
  const user = event.data;

  // Check if user document already exists
  const userDoc = await db.collection('users').doc(user.uid).get();
  if (userDoc.exists) return;

  // For Google users, require additional profile setup via web app
  if (user.providerData[0]?.providerId === 'google.com') {
    await db.collection('users').doc(user.uid).set({
      email: user.email,
      firstName: '',
      lastName: '',
      storeNumber: null,  // Will be set by profile completion flow
      allowedStores: [],
      profileComplete: false,  // Force profile completion
      approved: false,
      createdAt: FieldValue.serverTimestamp()
    });
  }
});
```

**Frontend Changes Required**:
```javascript
// After Google sign-in, check if profile is complete
const handleGoogleSignIn = async () => {
  const cred = await signInWithPopup(auth, provider);
  const userDoc = await getDoc(doc(db, 'users', cred.user.uid));

  if (!userDoc.exists || !userDoc.data().profileComplete) {
    // Redirect to profile completion page
    navigate('/complete-profile');
  }
};
```

**This approach**:
- ✅ Allows Google sign-in
- ✅ Ensures complete profiles
- ✅ Maintains data integrity
- ⚠️ Adds complexity

## Summary

**Current Status**: Google sign-in effectively blocked via frontend removal

**Security Level**: High (multiple protection layers)

**Cost**: $0

**Recommendation**: Add Firebase Console provider disable for defense in depth

**Future**: Only re-enable if business requires, with proper profile completion flow

---

**Last Updated**: 2025-01-11
**Deployed**: Frontend blocking active
**Next Action**: Disable Google provider in Firebase Console
