// Verify multi-device tokens are stored correctly
// Run: node verify_multi_device.cjs

const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

async function verifyTokens() {
  try {
    console.log('\n🔍 Checking Shane\'s multi-device token setup...\n');

    const snapshot = await db.collection('users')
      .where('email', '==', 'sinaptick@gmail.com')
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log('❌ User not found');
      return;
    }

    const userData = snapshot.docs[0].data();

    console.log('👤 User: Shane Smith');
    console.log('🏪 Store: ' + userData.storeNumber);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Check new fcmTokens array
    if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
      console.log(`✅ fcmTokens Array: ${userData.fcmTokens.length} device(s)\n`);

      userData.fcmTokens.forEach((tokenEntry, index) => {
        console.log(`Device ${index + 1}:`);
        console.log(`  Platform: ${tokenEntry.platform}`);
        console.log(`  Device: ${tokenEntry.deviceName}`);
        console.log(`  Token: ${tokenEntry.token.substring(0, 60)}...`);
        if (tokenEntry.lastSeen) {
          console.log(`  Last Seen: ${tokenEntry.lastSeen.toDate().toLocaleString()}`);
        }
        if (tokenEntry.appVersion) {
          console.log(`  App Version: ${tokenEntry.appVersion}`);
        }
        console.log();
      });

      // Check for both platforms
      const hasAndroid = userData.fcmTokens.some(t => t.platform === 'android');
      const hasIOS = userData.fcmTokens.some(t => t.platform === 'ios');

      console.log('📊 Platform Coverage:');
      console.log(`  Android: ${hasAndroid ? '✅ YES' : '❌ NO'}`);
      console.log(`  iOS: ${hasIOS ? '✅ YES' : '❌ NO'}`);
      console.log();

      if (hasAndroid && hasIOS) {
        console.log('✅ PERFECT! Both devices are registered!');
        console.log('   Notifications will go to BOTH devices.\n');
      } else if (hasAndroid || hasIOS) {
        console.log('⚠️  Only ONE platform registered.');
        console.log('   Log in on the other device to complete setup.\n');
      }
    } else {
      console.log('⚠️  No fcmTokens array found (using legacy single token)');
      console.log('   Log in on both devices to create the array.\n');
    }

    // Show legacy token for comparison
    if (userData.fcmToken) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📱 Legacy fcmToken (backward compatibility):');
      console.log(`   ${userData.fcmToken.substring(0, 60)}...`);
      console.log('   (This is for backward compatibility only)\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  process.exit(0);
}

verifyTokens();
