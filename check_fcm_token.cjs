const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  projectId: 'qrwebaccdb'
});

const db = admin.firestore();

async function checkFCMToken() {
  try {
    // Get user with email sinaptick@gmail.com
    const snapshot = await db.collection('users')
      .where('email', '==', 'sinaptick@gmail.com')
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log('❌ No user found with email sinaptick@gmail.com');
      process.exit(1);
    }

    snapshot.forEach(doc => {
      const data = doc.data();
      console.log('\n========================================');
      console.log('📱 iOS FCM Token Check');
      console.log('========================================');
      console.log('User ID:', doc.id);
      console.log('Email:', data.email);
      console.log('Name:', data.firstName, data.lastName);
      console.log('Store Number:', data.storeNumber);
      console.log('\n--- FCM Token Status ---');

      if (data.fcmToken) {
        console.log('✅ FCM Token EXISTS');
        console.log('Token (first 60 chars):', data.fcmToken.substring(0, 60) + '...');
        console.log('Token length:', data.fcmToken.length, 'characters');

        if (data.fcmTokenUpdatedAt) {
          const updatedDate = data.fcmTokenUpdatedAt.toDate();
          const now = new Date();
          const ageMinutes = Math.floor((now - updatedDate) / 1000 / 60);
          console.log('Token Updated:', updatedDate.toISOString());
          console.log('Token Age:', ageMinutes, 'minutes ago');

          if (ageMinutes < 5) {
            console.log('✅ Token is FRESH (updated within last 5 minutes)');
          } else {
            console.log('⚠️  Token is older than 5 minutes');
          }
        } else {
          console.log('⚠️  No token update timestamp');
        }
      } else {
        console.log('❌ FCM Token is MISSING');
        console.log('⚠️  The iOS app may not have registered the token yet');
      }

      console.log('\n--- Profile Info ---');
      if (data.updatedAt) {
        console.log('Profile Updated:', data.updatedAt.toDate().toISOString());
      }
      console.log('========================================\n');
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkFCMToken();
