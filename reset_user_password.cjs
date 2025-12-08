#!/usr/bin/env node

/**
 * Manual Password Reset Script
 *
 * Allows admin to directly set a new password for any user account.
 *
 * Usage:
 *   node reset_user_password.cjs <email> <new_password>
 *   node reset_user_password.cjs user@example.com NewSecurePass123!
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin
try {
  admin.initializeApp({
    projectId: 'qrwebaccdb'
  });
  console.log('✅ Firebase Admin initialized\n');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK');
  console.error('Please run: firebase login');
  process.exit(1);
}

const auth = admin.auth();

// Create readline interface for interactive mode
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function resetPassword(email, newPassword, skipConfirmation = false) {
  console.log('🔍 Looking up user...\n');

  try {
    // Get user by email
    const user = await auth.getUserByEmail(email);

    console.log('📋 User Found:');
    console.log(`   UID: ${user.uid}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Display Name: ${user.displayName || 'N/A'}`);
    console.log(`   Created: ${new Date(user.metadata.creationTime).toLocaleString()}`);
    console.log(`   Last Sign In: ${user.metadata.lastSignInTime ? new Date(user.metadata.lastSignInTime).toLocaleString() : 'Never'}\n`);

    // Confirm password change (skip in non-interactive mode)
    if (!skipConfirmation) {
      const confirm = await question(`⚠️  Are you sure you want to change the password for ${email}? (yes/no): `);

      if (confirm.toLowerCase() !== 'yes') {
        console.log('❌ Password reset cancelled.');
        rl.close();
        process.exit(0);
      }
    }

    // Update the password
    await auth.updateUser(user.uid, {
      password: newPassword
    });

    console.log('\n✅ Password successfully updated!');
    console.log(`📧 User: ${email}`);
    console.log(`🔑 New password: ${newPassword}`);
    console.log('\n⚠️  IMPORTANT: Securely communicate this password to the user.');
    console.log('   They can change it after logging in via Settings.');

  } catch (error) {
    console.error('\n❌ Error resetting password:');

    if (error.code === 'auth/user-not-found') {
      console.error(`   User with email "${email}" not found.`);
    } else if (error.code === 'auth/invalid-password') {
      console.error('   Password must be at least 6 characters.');
    } else {
      console.error(`   ${error.message}`);
    }

    rl.close();
    process.exit(1);
  }

  rl.close();
  process.exit(0);
}

async function interactiveMode() {
  console.log('═'.repeat(60));
  console.log('🔐 QRCall Manual Password Reset Tool');
  console.log('═'.repeat(60));
  console.log('\nThis tool allows you to directly set a new password for any user.\n');

  const email = await question('📧 Enter user email: ');

  if (!email || !email.includes('@')) {
    console.error('❌ Invalid email address.');
    rl.close();
    process.exit(1);
  }

  const newPassword = await question('🔑 Enter new password (min 6 characters): ');

  if (!newPassword || newPassword.length < 6) {
    console.error('❌ Password must be at least 6 characters.');
    rl.close();
    process.exit(1);
  }

  await resetPassword(email, newPassword);
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 2) {
  // Command-line mode: node reset_user_password.cjs <email> <password>
  const [email, newPassword] = args;

  if (!email.includes('@')) {
    console.error('❌ Invalid email address.');
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error('❌ Password must be at least 6 characters.');
    process.exit(1);
  }

  resetPassword(email, newPassword, true); // Skip confirmation in CLI mode
} else if (args.length === 0) {
  // Interactive mode
  interactiveMode();
} else {
  console.error('Usage: node reset_user_password.cjs [email] [new_password]');
  console.error('\nExamples:');
  console.error('  Interactive mode:  node reset_user_password.cjs');
  console.error('  Direct mode:       node reset_user_password.cjs user@example.com NewPass123!');
  process.exit(1);
}
