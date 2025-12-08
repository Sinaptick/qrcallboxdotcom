const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  projectId: 'qrwebaccdb'
});

const db = admin.firestore();

async function updateFCMToken(newToken) {
  try {
    if (!newToken) {
      console.log('❌ Please provide an FCM token as argument');
      console.log('Usage: node update_fcm_token.cjs "YOUR_FCM_TOKEN_HERE"');
      process.exit(1);
    }

    console.log('\n🔧 Updating FCM token for sinaptick@gmail.com...\n');
    console.log('New token (first 60 chars):', newToken.substring(0, 60) + '...');
    console.log('Token length:', newToken.length);

    // Get user document
    const snapshot = await db.collection('users')
      .where('email', '==', 'sinaptick@gmail.com')
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log('❌ User not found');
      process.exit(1);
    }

    // Update token
    const userDoc = snapshot.docs[0];
    await userDoc.ref.update({
      fcmToken: newToken,
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('\n✅ FCM token updated successfully!');
    console.log('📋 User ID:', userDoc.id);
    console.log('📧 Email:', userDoc.data().email);
    console.log('🏪 Store:', userDoc.data().storeNumber);
    console.log('\n✨ Ready to test iOS notifications!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Get token from command line argument
const token = process.argv[2];
updateFCMToken(token);
