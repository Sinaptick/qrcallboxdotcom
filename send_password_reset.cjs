const admin = require('firebase-admin');
const serviceAccount = require('./functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

/**
 * Send a password reset email to a user
 * Usage: node send_password_reset.cjs user@example.com
 */
async function sendPasswordResetEmail(email) {
  if (!email) {
    console.error('❌ Error: Email address is required');
    console.log('\nUsage: node send_password_reset.cjs user@example.com');
    process.exit(1);
  }

  try {
    console.log(`\n📧 Looking up user: ${email}`);

    // Verify user exists
    const user = await admin.auth().getUserByEmail(email);
    console.log(`✅ User found: ${user.displayName || 'No display name'}`);
    console.log(`   UID: ${user.uid}`);
    console.log(`   Created: ${new Date(user.metadata.creationTime).toLocaleDateString()}`);

    // Generate password reset link
    console.log('\n📤 Generating password reset link...');
    const resetLink = await admin.auth().generatePasswordResetLink(email);

    console.log('\n✅ Password reset link generated successfully!');
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔗 PASSWORD RESET LINK:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(resetLink);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📋 INSTRUCTIONS:');
    console.log('1. Copy the link above');
    console.log('2. Send it securely to the user (email, Slack, etc.)');
    console.log('3. Link expires in 1 hour');
    console.log('4. User clicks link → sets new password\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);

    if (error.code === 'auth/user-not-found') {
      console.log('\n💡 Tip: Check that the email address is correct');
    } else if (error.code === 'auth/invalid-email') {
      console.log('\n💡 Tip: Please provide a valid email address');
    }

    process.exit(1);
  }

  process.exit(0);
}

// Get email from command line argument
const email = process.argv[2];
sendPasswordResetEmail(email);
