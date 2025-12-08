const admin = require('firebase-admin');
const serviceAccount = require('./functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkShiftStatus() {
  const userDoc = await db.collection('users').doc('Zp2HKoHQVlR7eNA6hhDPjkIJApB2').get();
  const userData = userDoc.data();

  console.log('📋 User Status Check:');
  console.log('  Email:', userData.email);
  console.log('  Store Number:', userData.storeNumber);
  console.log('  Is On Shift:', userData.isOnShift);
  console.log('  Notifications Enabled:', userData.notificationsEnabled);
  console.log('\n📅 Work Schedule:');

  if (userData.workSchedule) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const now = new Date();
    const today = days[now.getDay()];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    console.log('  Today is:', today);
    console.log('  Current time:', currentHour + ':' + (currentMinute < 10 ? '0' : '') + currentMinute);

    if (userData.workSchedule[today]) {
      console.log('  ' + today + ' schedule:', userData.workSchedule[today]);
    } else {
      console.log('  ' + today + ': No schedule');
    }
  } else {
    console.log('  No work schedule set');
  }

  console.log('\n📱 FCM Token:');
  if (userData.fcmTokens && userData.fcmTokens.length > 0) {
    console.log('  Platform:', userData.fcmTokens[0].platform);
    console.log('  Device:', userData.fcmTokens[0].deviceName);
    console.log('  Token:', userData.fcmTokens[0].token.substring(0, 50) + '...');
  }

  process.exit(0);
}

checkShiftStatus().catch(console.error);
