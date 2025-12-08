#!/usr/bin/env node

/**
 * Diagnostic script to check iOS user's FCM token and notification readiness
 * Run: node check_ios_user.cjs
 */

const admin = require('firebase-admin');
const serviceAccount = require('./qrwebaccdb-firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkUser() {
  try {
    console.log('\n🔍 Checking Shane Smith\'s iOS notification status...\n');

    // Find Shane Smith's user document
    const usersSnapshot = await db.collection('users')
      .where('firstName', '==', 'Shane')
      .where('lastName', '==', 'Smith')
      .get();

    if (usersSnapshot.empty) {
      console.log('❌ User "Shane Smith" not found in Firestore');
      console.log('Trying by email "sinaptick@gmail.com"...\n');

      const emailSnapshot = await db.collection('users')
        .where('email', '==', 'sinaptick@gmail.com')
        .get();

      if (emailSnapshot.empty) {
        console.log('❌ User not found by email either');
        console.log('\nTry searching manually in Firestore Console:');
        console.log('https://console.firebase.google.com/project/qrwebaccdb/firestore\n');
        return;
      }

      // Use email result
      const userDoc = emailSnapshot.docs[0];
      await displayUserInfo(userDoc);
    } else {
      const userDoc = usersSnapshot.docs[0];
      await displayUserInfo(userDoc);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function displayUserInfo(userDoc) {
  const userData = userDoc.data();
  const userId = userDoc.id;

  console.log('✅ User Found!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📧 Email: ${userData.email}`);
  console.log(`👤 Name: ${userData.firstName} ${userData.lastName}`);
  console.log(`🔑 UID: ${userId}`);
  console.log(`🏪 Store: ${userData.storeNumber || 'NOT SET'}`);
  console.log(`🏪 Active Store: ${userData.activeStore || 'NOT SET (falls back to storeNumber)'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Check FCM Token
  console.log('📱 FCM Token Status:');
  if (userData.fcmToken && userData.fcmToken.length > 50) {
    console.log(`   ✅ Token exists: ${userData.fcmToken.substring(0, 60)}...`);
    console.log(`   📏 Length: ${userData.fcmToken.length} characters`);

    // Determine platform based on token format
    // iOS tokens are typically longer (160+ chars) and contain colons
    // Android tokens are typically 150+ chars
    const isLikelyIOS = userData.fcmToken.includes(':') || userData.fcmToken.length > 160;
    const platform = isLikelyIOS ? '🍎 iOS/iPadOS' : '🤖 Android';
    console.log(`   🎯 Platform: ${platform}`);

    if (userData.fcmTokenUpdatedAt) {
      const timestamp = userData.fcmTokenUpdatedAt.toDate();
      console.log(`   ⏰ Last Updated: ${timestamp.toLocaleString()}`);

      const hoursSince = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60);
      if (hoursSince > 24) {
        console.log(`   ⚠️  Token is ${Math.round(hoursSince)} hours old - may need refresh`);
      }
    }
  } else {
    console.log('   ❌ NO FCM TOKEN - iPad has not registered!');
    console.log('   📋 This means:');
    console.log('      - User hasn\'t logged in on iOS/iPad yet, OR');
    console.log('      - APNS keys not configured in Firebase Console, OR');
    console.log('      - App doesn\'t have notification permissions');
  }
  console.log();

  // Check notification settings
  console.log('🔔 Notification Settings:');
  console.log(`   Enabled: ${userData.notificationsEnabled !== false ? '✅ YES' : '❌ NO'}`);
  if (userData.notificationAreas && userData.notificationAreas.length > 0) {
    console.log(`   Area Filters: ${userData.notificationAreas.join(', ')}`);
  } else {
    console.log(`   Area Filters: ALL AREAS (no filters)`);
  }
  console.log();

  // Check shift status
  console.log('⏰ Work Schedule:');
  if (userData.workSchedule) {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    const todaySchedule = userData.workSchedule[today];
    if (todaySchedule) {
      console.log(`   ${today}: ${todaySchedule.start} - ${todaySchedule.end}`);
    } else {
      console.log(`   ${today}: OFF`);
    }
  } else {
    console.log('   ⚠️  No work schedule set');
  }
  console.log();

  // Final diagnosis
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 DIAGNOSIS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (!userData.fcmToken || userData.fcmToken.length < 50) {
    console.log('❌ iPad NOT ready for notifications!');
    console.log('\n🔧 To Fix:');
    console.log('1. Open QRCallBox app on iPad');
    console.log('2. Log in with Shane Smith account');
    console.log('3. Allow notification permissions when prompted');
    console.log('4. Run this script again to verify token appears');
    console.log('\n⚠️  If token still doesn\'t appear:');
    console.log('   → APNS keys not configured in Firebase Console');
    console.log('   → See: apple/IOS_PUSH_TROUBLESHOOTING.md (Section 1)');
  } else {
    console.log('✅ iPad has valid FCM token!');
    console.log('\n🧪 Next Test:');
    console.log('1. Make sure you\'re "on shift" in the app');
    console.log('2. Trigger a test notification:');
    console.log(`   node -e "const admin = require('firebase-admin'); const serviceAccount = require('./qrwebaccdb-firebase-adminsdk.json'); admin.initializeApp({credential: admin.credential.cert(serviceAccount)}); const msg = admin.messaging(); msg.send({notification: {title: 'Test', body: 'iOS Test'}, apns: {payload: {aps: {alert: {title: 'Test', body: 'iOS Test'}, sound: 'default', badge: 1}}}, token: '${userData.fcmToken.substring(0, 60)}...'}).then(() => console.log('Sent!')).catch(e => console.error('Error:', e.message));"`);
    console.log('\n❓ If notification doesn\'t arrive:');
    console.log('   → Check APNS configuration in Firebase Console');
    console.log('   → Look for error in console above');
    console.log('   → See: apple/IOS_PUSH_TROUBLESHOOTING.md');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

checkUser();
