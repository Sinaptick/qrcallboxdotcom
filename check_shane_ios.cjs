// Quick check for Shane's iOS FCM token
// Run: node check_shane_ios.js

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize with application default credentials
initializeApp();
const db = getFirestore();

async function checkShane() {
  try {
    console.log('\n🔍 Checking Shane Smith iOS status...\n');

    // Query for Shane Smith
    const snapshot = await db.collection('users')
      .where('email', '==', 'sinaptick@gmail.com')
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log('❌ User not found with email sinaptick@gmail.com');
      return;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    console.log('✅ User Found!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Name: ${data.firstName} ${data.lastName}`);
    console.log(`Store: ${data.storeNumber || 'NOT SET'}`);
    console.log(`Active Store: ${data.activeStore || 'NOT SET'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📱 FCM TOKEN STATUS:');
    if (data.fcmToken && data.fcmToken.length > 50) {
      console.log(`✅ Token exists: ${data.fcmToken.substring(0, 60)}...`);
      console.log(`   Length: ${data.fcmToken.length} chars`);

      // iOS tokens typically 160+ chars and contain colons
      const isIOS = data.fcmToken.includes(':') || data.fcmToken.length > 160;
      console.log(`   Platform: ${isIOS ? '🍎 iOS/iPadOS' : '🤖 Android'}`);

      if (data.fcmTokenUpdatedAt) {
        console.log(`   Updated: ${data.fcmTokenUpdatedAt.toDate().toLocaleString()}`);
      }
    } else {
      console.log('❌ NO FCM TOKEN!');
      console.log('   iPad has NOT registered for notifications');
      console.log('\n💡 FIXES:');
      console.log('   1. Open QRCallBox app on iPad');
      console.log('   2. Log in (if not already)');
      console.log('   3. Allow notifications when prompted');
      console.log('   4. Check console logs for:');
      console.log('      - "🔔 FCM Permission status: authorized"');
      console.log('      - "✅ FCM Token obtained"');
      console.log('\n⚠️  If still no token:');
      console.log('   → APNS keys NOT configured in Firebase Console');
      console.log('   → See: apple/IOS_PUSH_TROUBLESHOOTING.md');
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  process.exit(0);
}

checkShane();
