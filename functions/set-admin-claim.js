/**
 * One-time setup script to set admin Custom Claim for super admin
 *
 * This script sets the admin custom claim for sinaptick@gmail.com
 * and updates the Firestore document accordingly.
 *
 * Usage:
 *   node set-admin-claim.js
 *
 * Requirements:
 *   - Firebase Admin SDK initialized
 *   - Service account credentials configured
 *   - Run from functions directory
 */

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// Initialize Firebase Admin
initializeApp();

const ADMIN_EMAIL = 'sinaptick@gmail.com';

async function setAdminClaim() {
  console.log('🔧 Setting admin custom claim...\n');

  try {
    // Step 1: Find user by email
    console.log(`📧 Looking up user: ${ADMIN_EMAIL}`);
    const user = await getAuth().getUserByEmail(ADMIN_EMAIL);

    console.log(`✅ Found user:`);
    console.log(`   UID: ${user.uid}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Display Name: ${user.displayName || 'N/A'}`);
    console.log();

    // Step 2: Check current custom claims
    console.log('🔍 Current custom claims:', user.customClaims || 'None');
    console.log();

    // Step 3: Set admin custom claim
    console.log('⚙️  Setting admin custom claim...');
    await getAuth().setCustomUserClaims(user.uid, { admin: true });
    console.log('✅ Custom claim set successfully');
    console.log();

    // Step 4: Update Firestore document for record-keeping
    console.log('📝 Updating Firestore document...');
    await getFirestore().collection('users').doc(user.uid).update({
      isAdmin: true,
      adminClaimSetAt: FieldValue.serverTimestamp(),
      adminClaimSetBy: 'deployment-script',
      adminClaimSetScript: 'set-admin-claim.js'
    });
    console.log('✅ Firestore document updated');
    console.log();

    // Step 5: Verify the update
    console.log('🔍 Verifying custom claim...');
    const updatedUser = await getAuth().getUser(user.uid);
    console.log('✅ Verification successful:');
    console.log('   Custom Claims:', JSON.stringify(updatedUser.customClaims, null, 2));
    console.log();

    // Step 6: Success summary
    console.log('✅ ✅ ✅ ADMIN CLAIM SETUP COMPLETE ✅ ✅ ✅');
    console.log();
    console.log('Next steps:');
    console.log('1. Deploy Firestore security rules');
    console.log('2. User must sign out and sign in again (or force token refresh)');
    console.log('3. Verify admin access in the application');
    console.log();
    console.log('To force token refresh on client:');
    console.log('  Web: firebase.auth().currentUser.getIdToken(true)');
    console.log('  iOS: await FirebaseAuth.instance.currentUser?.getIdToken(true)');
    console.log();

  } catch (error) {
    console.error('❌ ERROR setting admin claim:');
    console.error();

    if (error.code === 'auth/user-not-found') {
      console.error(`User with email ${ADMIN_EMAIL} not found.`);
      console.error('Please ensure the user account exists in Firebase Authentication.');
    } else if (error.code === 'auth/invalid-email') {
      console.error('Invalid email address format.');
    } else {
      console.error(`Error code: ${error.code}`);
      console.error(`Error message: ${error.message}`);
    }

    console.error();
    console.error('Stack trace:');
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the setup
console.log('═══════════════════════════════════════════');
console.log('    ADMIN CUSTOM CLAIM SETUP SCRIPT        ');
console.log('═══════════════════════════════════════════');
console.log();

setAdminClaim();
