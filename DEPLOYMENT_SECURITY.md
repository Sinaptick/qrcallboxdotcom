# Security Updates Deployment Guide

**Project**: QRCallBox
**Date**: January 2025
**Priority**: 🔴 CRITICAL

This guide covers the deployment of critical security improvements including Firebase Custom Claims for admin authorization and server-side auto-ignore logic.

---

## 📋 Overview of Changes

### 1. **Custom Claims for Admin Authorization**
- ✅ Updated `isAdmin()` function to check Custom Claims
- ✅ Added `setAdminClaim` Cloud Function
- ✅ Added `getUserClaims` Cloud Function
- ✅ Updated Firestore security rules to use `request.auth.token.admin`

### 2. **Server-Side Auto-Ignore**
- ✅ Created `autoIgnoreOldScans` scheduled function (runs every 5 minutes)
- ✅ Created `manualAutoIgnore` Cloud Function for manual triggering
- ✅ Removed client-side auto-ignore logic from iOS app

### 3. **Firestore Security Rules**
- ✅ Created `isAdmin()` helper function using Custom Claims
- ✅ Replaced all email-based admin checks with Custom Claims
- ✅ Improved performance (no more database lookups for admin checks)

---

## 🚀 Deployment Steps

### **Step 1: Deploy Firestore Security Rules**

```bash
# From project root (/Users/shanesmith/Documents/qrcall/)
cd /Users/shanesmith/Documents/qrcall

# Deploy updated security rules
firebase deploy --only firestore:rules

# Verify deployment
firebase firestore:rules:get
```

**Expected Output**: Rules should show the new `isAdmin()` function.

**⚠️ Important**: This may temporarily affect admin access until Custom Claims are set in Step 3.

---

### **Step 2: Deploy Cloud Functions**

```bash
# From project root
cd /Users/shanesmith/Documents/qrcall

# Deploy all functions (includes new security functions)
firebase deploy --only functions

# Or deploy specific functions only:
firebase deploy --only functions:setAdminClaim,functions:getUserClaims,functions:autoIgnoreOldScans,functions:manualAutoIgnore
```

**New Functions Deployed**:
- `setAdminClaim` - Set/revoke admin Custom Claims (admin only)
- `getUserClaims` - Get current user's Custom Claims
- `autoIgnoreOldScans` - Scheduled function (every 5 minutes)
- `manualAutoIgnore` - Manual trigger for auto-ignore (admin only)

**Expected Deployment Time**: 3-5 minutes

---

### **Step 3: Set Admin Custom Claim for Super Admin** 🔴 CRITICAL

**This step is REQUIRED immediately after deploying functions**

#### Option A: Using Firebase Console (Recommended for first-time setup)

1. Go to Firebase Console → Authentication → Users
2. Find user with email `sinaptick@gmail.com`
3. Copy the UID
4. Go to Firebase Console → Firestore → Database
5. Open Firebase CLI or use Firestore emulator to run:

```javascript
// In Firebase Console's Firestore > Cloud Firestore > Query
// Or use Firebase Functions test console

// Get the admin user's UID first
// Then run this in Functions test console for setAdminClaim:
{
  "uid": "PASTE_ADMIN_UID_HERE",
  "admin": true
}
```

#### Option B: Using Firebase CLI (Recommended)

```bash
# Install Firebase CLI globally if not installed
npm install -g firebase-tools

# Login to Firebase
firebase login

# Use Firebase CLI to call the function
firebase functions:config:get

# Get the admin UID first
firebase auth:export users.json --format=JSON
# Find sinaptick@gmail.com in the file and copy the UID

# Then use curl to call the function (replace with actual ID token)
# First, get an ID token by logging into the web app as sinaptick@gmail.com
# Open browser console and run: firebase.auth().currentUser.getIdToken().then(console.log)

curl -X POST \
  https://us-central1-qrwebaccdb.cloudfunctions.net/setAdminClaim \
  -H "Authorization: Bearer YOUR_ID_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "uid": "ADMIN_UID_HERE",
      "admin": true
    }
  }'
```

#### Option C: Using Firebase Admin SDK Script (Most Reliable)

Create a temporary script `/Users/shanesmith/Documents/qrcall/functions/set-admin-claim.js`:

```javascript
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

initializeApp();

async function setAdminClaim() {
  try {
    // Find user by email
    const user = await getAuth().getUserByEmail('sinaptick@gmail.com');

    console.log('Found user:', user.uid, user.email);

    // Set custom claim
    await getAuth().setCustomUserClaims(user.uid, { admin: true });

    // Update Firestore
    await getFirestore().collection('users').doc(user.uid).update({
      isAdmin: true,
      adminClaimSetAt: new Date(),
      adminClaimSetBy: 'deployment-script'
    });

    console.log('✅ Admin claim set successfully for', user.email);

    // Verify
    const updatedUser = await getAuth().getUser(user.uid);
    console.log('Custom claims:', updatedUser.customClaims);

  } catch (error) {
    console.error('❌ Error setting admin claim:', error);
  }

  process.exit(0);
}

setAdminClaim();
```

Run the script:
```bash
cd /Users/shanesmith/Documents/qrcall/functions
node set-admin-claim.js
```

**Expected Output**:
```
Found user: [UID] sinaptick@gmail.com
✅ Admin claim set successfully for sinaptick@gmail.com
Custom claims: { admin: true }
```

---

### **Step 4: Verify Custom Claims**

```bash
# Test the getUserClaims function
# Login to web app as sinaptick@gmail.com
# Open browser console and run:

const idToken = await firebase.auth().currentUser.getIdToken();
const response = await fetch('https://us-central1-qrwebaccdb.cloudfunctions.net/getUserClaims', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ data: {} })
});
const result = await response.json();
console.log('User claims:', result);
```

**Expected Result**:
```json
{
  "result": {
    "uid": "[ADMIN_UID]",
    "email": "sinaptick@gmail.com",
    "customClaims": {
      "admin": true
    },
    "isAdmin": true,
    "userData": { ... }
  }
}
```

---

### **Step 5: Deploy iOS App Updates**

```bash
# Navigate to iOS app directory
cd /Users/shanesmith/Documents/qrcall/apple

# Get dependencies
flutter pub get

# Build for TestFlight
flutter clean
flutter build ipa --release

# The updated app will:
# - No longer perform client-side auto-ignore (uses server scheduled function)
# - Show warning comments about admin check being client-side hint only
```

---

### **Step 6: Enable Scheduled Function**

The `autoIgnoreOldScans` function is automatically scheduled and will start running every 5 minutes after deployment.

**Verify it's running**:
```bash
# Check Cloud Scheduler in Firebase Console
# Go to: Firebase Console → Functions → autoIgnoreOldScans
# Should show: "Next run: [timestamp]"

# Or check logs:
firebase functions:log --only autoIgnoreOldScans
```

**Manual trigger for testing**:
```bash
# Using the web app as admin:
# Call manualAutoIgnore Cloud Function

const idToken = await firebase.auth().currentUser.getIdToken();
const response = await fetch('https://us-central1-qrwebaccdb.cloudfunctions.net/manualAutoIgnore', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ data: {} })
});
const result = await response.json();
console.log(result); // Shows number of scans auto-ignored
```

---

## ✅ Verification Checklist

After deployment, verify each component:

### **Firestore Rules**
- [ ] Admin can read all users (using Custom Claims)
- [ ] Non-admin cannot read other users
- [ ] Admin can update any user document
- [ ] Admin can read blocked_ips and spam_logs

### **Custom Claims**
- [ ] Super admin (sinaptick@gmail.com) has `admin: true` claim
- [ ] `getUserClaims` function returns correct claims
- [ ] `setAdminClaim` function works (only callable by super admin)

### **Auto-Ignore**
- [ ] Scheduled function runs every 5 minutes
- [ ] Old pending scans (>10 min) are marked as `auto_ignored`
- [ ] iOS app no longer performs client-side auto-ignore
- [ ] Manual trigger works for testing

### **iOS App**
- [ ] App shows warning about client-side admin check
- [ ] No longer attempts Firestore updates for auto-ignore
- [ ] Filters out `auto_ignored` scans from UI

---

## 🧪 Testing Procedures

### **Test 1: Admin Authorization**

```bash
# As admin (sinaptick@gmail.com):
1. Login to web app
2. Navigate to Admin Panel
3. Should have full access to all admin features
4. Try to read other users' data → Should succeed

# As regular user:
1. Login to web app
2. Try to access Admin Panel → Should be denied
3. Try to read other users' data in Firestore → Should fail
```

### **Test 2: Auto-Ignore Scheduled Function**

```bash
1. Create a test scan with timestamp > 10 minutes old:
   - Manually add to Firestore with past timestamp
   - Set status: 'pending'

2. Wait 5 minutes for scheduled function to run

3. Check scan status:
   - Should be updated to 'auto_ignored'
   - Should have 'autoIgnoredAt' timestamp
   - Should have 'autoIgnoredReason': 'timeout_10min'

4. Or trigger manually:
   - Call manualAutoIgnore function
   - Should immediately update old scans
```

### **Test 3: Custom Claims in Security Rules**

```bash
# Test scans collection access
1. As admin:
   - Query scans for any store → Should succeed
   - Security rule checks request.auth.token.admin == true

2. As regular user:
   - Query scans for own store → Should succeed
   - Query scans for other store → Should fail
```

---

## 🔧 Troubleshooting

### **Issue: Admin loses access after deployment**

**Cause**: Custom Claim not set properly
**Solution**:
```bash
# Re-run the admin claim script
cd /Users/shanesmith/Documents/qrcall/functions
node set-admin-claim.js

# Or manually set via Firebase Auth REST API
```

### **Issue: Scheduled function not running**

**Cause**: Cloud Scheduler may need manual enablement
**Solution**:
```bash
# Check if enabled in Firebase Console
# Go to: Cloud Scheduler → Jobs
# If not listed, redeploy:
firebase deploy --only functions:autoIgnoreOldScans
```

### **Issue: Firestore security rules denying access**

**Cause**: Custom Claims not refreshed on client
**Solution**:
```bash
# Force token refresh in app:
firebase.auth().currentUser.getIdToken(true) // true = force refresh
```

**Client-side token refresh needed after claim updates**:
```dart
// In iOS app, force token refresh:
await FirebaseAuth.instance.currentUser?.getIdToken(true);
```

---

## 📊 Monitoring & Logs

### **Cloud Functions Logs**

```bash
# View all function logs
firebase functions:log

# View specific function
firebase functions:log --only autoIgnoreOldScans

# View errors only
firebase functions:log --only autoIgnoreOldScans --level error

# Real-time logs
firebase functions:log --follow
```

### **Scheduled Function Metrics**

Check in Firebase Console:
- Functions → autoIgnoreOldScans → Metrics
- Look for:
  - Execution count (should run 12 times/hour = every 5 min)
  - Success rate (should be 100%)
  - Execution time
  - Memory usage

### **Custom Claims Audit**

```bash
# Check Firestore for admin claim history
# users/{uid} should have:
# - isAdmin: true
# - adminClaimSetAt: timestamp
# - adminClaimSetBy: uid or 'deployment-script'
```

---

## 🔄 Rollback Procedures

If issues arise, rollback in reverse order:

### **1. Rollback Cloud Functions**

```bash
# List function versions
firebase functions:config:get

# Rollback to previous version
firebase functions:rollback autoIgnoreOldScans
firebase functions:rollback setAdminClaim
```

### **2. Rollback Firestore Rules**

```bash
# Restore previous rules from git
git checkout HEAD~1 firestore.rules

# Deploy old rules
firebase deploy --only firestore:rules
```

### **3. Emergency Admin Access**

If admin loses access completely:

```bash
# Temporarily update rules to allow email-based admin check
# In firestore.rules, add fallback:
function isAdmin() {
  return request.auth != null &&
    (request.auth.token.admin == true ||
     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.email == 'sinaptick@gmail.com');
}

# Deploy
firebase deploy --only firestore:rules
```

---

## 📝 Post-Deployment Tasks

After successful deployment:

1. **Update Documentation**
   - [x] SECURITY_UPDATES.md - mark server-side tasks complete
   - [x] DEPLOYMENT_SECURITY.md - this guide
   - [ ] Update CLAUDE.md to reflect completed security tasks

2. **Monitor for 24 hours**
   - [ ] Check function execution counts
   - [ ] Monitor error rates
   - [ ] Verify auto-ignore working correctly

3. **Clean up**
   - [ ] Remove temporary admin claim script
   - [ ] Archive old security rules if needed

4. **User Communication**
   - [ ] Notify team about admin claim changes
   - [ ] Update any admin onboarding docs

---

## 🆘 Support

If deployment issues occur:

**Primary Contact**: sinaptick@gmail.com
**Project**: QRCallBox
**Firebase Project**: qrwebaccdb

**Quick Debug Commands**:
```bash
# Check deployed functions
firebase functions:list

# Check security rules
firebase firestore:rules:get

# Check scheduled jobs
gcloud scheduler jobs list --project=qrwebaccdb

# View recent errors
firebase functions:log --only autoIgnoreOldScans --level error --limit 50
```

---

## 📋 Deployment Checklist

Print and check off during deployment:

- [ ] **Pre-Deployment**
  - [ ] Backup current Firestore rules: `firebase firestore:rules:get > rules-backup.txt`
  - [ ] Backup current functions (git commit)
  - [ ] Test locally if possible
  - [ ] Review all changes

- [ ] **Deployment**
  - [ ] Deploy Firestore rules
  - [ ] Deploy Cloud Functions
  - [ ] Set admin Custom Claim
  - [ ] Verify admin access still works
  - [ ] Verify scheduled function enabled
  - [ ] Deploy iOS app updates

- [ ] **Post-Deployment**
  - [ ] Run verification checklist
  - [ ] Run testing procedures
  - [ ] Monitor logs for 1 hour
  - [ ] Monitor scheduled function for 24 hours
  - [ ] Update documentation

- [ ] **Communication**
  - [ ] Notify team of deployment
  - [ ] Document any issues encountered
  - [ ] Update SECURITY_UPDATES.md with deployment date

---

**Deployment completed on**: __________________
**Deployed by**: __________________
**Issues encountered**: __________________

---

**Last Updated**: January 2025
**Version**: 1.0
**Next Review**: After first successful deployment
