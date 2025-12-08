const admin = require('firebase-admin');
const serviceAccount = require('./qrwebaccdb-firebase-adminsdk-qd32o-1c4c07fd94.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkUserNotifications() {
  const email = 'summervillemadeison6@gmail.com';

  console.log(`\n🔍 Checking notification status for: ${email}\n`);
  console.log('='.repeat(80));

  try {
    // Find user by email
    const usersSnapshot = await db.collection('users')
      .where('email', '==', email)
      .get();

    if (usersSnapshot.empty) {
      console.log(`❌ No user found with email: ${email}`);
      process.exit(1);
    }

    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    const userId = userDoc.id;

    console.log(`✅ User found: ${userData.firstName} ${userData.lastName}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Store Number: ${userData.storeNumber}`);
    console.log('');

    // Check FCM Token
    console.log('📱 FCM TOKEN STATUS:');
    if (userData.fcmToken && userData.fcmToken.length > 10) {
      console.log(`   ✅ FCM Token Present: ${userData.fcmToken.substring(0, 30)}...`);
      console.log(`   Token Length: ${userData.fcmToken.length} characters`);
      if (userData.fcmTokenUpdatedAt) {
        console.log(`   Last Updated: ${userData.fcmTokenUpdatedAt.toDate()}`);
      }
    } else {
      console.log(`   ❌ NO VALID FCM TOKEN`);
      console.log(`   Current value: ${userData.fcmToken || 'null/undefined'}`);
    }
    console.log('');

    // Check Notification Settings
    console.log('🔔 NOTIFICATION SETTINGS:');
    console.log(`   notificationsEnabled: ${userData.notificationsEnabled !== false ? '✅ true' : '❌ false'}`);
    console.log(`   respectDoNotDisturb: ${userData.respectDoNotDisturb !== false ? '✅ true' : '❌ false'}`);
    console.log(`   approved: ${userData.approved !== false ? '✅ true' : '❌ false'}`);
    console.log('');

    // Check Work Schedule
    console.log('📅 WORK SCHEDULE:');
    if (userData.workSchedule) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];
      const hour = now.getHours();
      const minute = now.getMinutes();

      console.log(`   Today is ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} at ${hour}:${String(minute).padStart(2, '0')}`);
      console.log('');

      const daySchedule = userData.workSchedule[dayName];
      if (daySchedule && daySchedule.isWorkingDay) {
        console.log(`   ✅ ${dayName}: Working Day`);
        console.log(`      Start: ${daySchedule.startHour}:${String(daySchedule.startMinute || 0).padStart(2, '0')}`);
        console.log(`      End: ${daySchedule.endHour}:${String(daySchedule.endMinute || 0).padStart(2, '0')}`);

        // Check if currently on shift
        const currentMinutes = hour * 60 + minute;
        const startMinutes = daySchedule.startHour * 60 + (daySchedule.startMinute || 0);
        const endMinutes = daySchedule.endHour * 60 + (daySchedule.endMinute || 0);

        if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) {
          console.log(`      ✅ CURRENTLY ON SHIFT`);
        } else {
          console.log(`      ❌ NOT ON SHIFT (outside scheduled hours)`);
        }
      } else {
        console.log(`   ❌ ${dayName}: Not a working day`);
      }
      console.log('');
      console.log('   Full Schedule:');
      Object.keys(userData.workSchedule).forEach(day => {
        const sched = userData.workSchedule[day];
        if (sched && sched.isWorkingDay) {
          console.log(`      ${day}: ${sched.startHour}:${String(sched.startMinute || 0).padStart(2, '0')} - ${sched.endHour}:${String(sched.endMinute || 0).padStart(2, '0')}`);
        } else {
          console.log(`      ${day}: Off`);
        }
      });
    } else {
      console.log(`   ⚠️  No work schedule configured (will receive ALL notifications)`);
    }
    console.log('');

    // Summary
    console.log('='.repeat(80));
    console.log('📊 NOTIFICATION ELIGIBILITY SUMMARY:');
    console.log('');

    const hasToken = userData.fcmToken && userData.fcmToken.length > 10;
    const notifEnabled = userData.notificationsEnabled !== false;
    const isApproved = userData.approved !== false;

    let onShift = false;
    if (userData.workSchedule) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];
      const hour = now.getHours();
      const minute = now.getMinutes();
      const daySchedule = userData.workSchedule[dayName];

      if (daySchedule && daySchedule.isWorkingDay) {
        const currentMinutes = hour * 60 + minute;
        const startMinutes = daySchedule.startHour * 60 + (daySchedule.startMinute || 0);
        const endMinutes = daySchedule.endHour * 60 + (daySchedule.endMinute || 0);
        onShift = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      }
    } else {
      onShift = true; // No schedule = always on
    }

    console.log(`   ${hasToken ? '✅' : '❌'} Has Valid FCM Token: ${hasToken}`);
    console.log(`   ${notifEnabled ? '✅' : '❌'} Notifications Enabled: ${notifEnabled}`);
    console.log(`   ${isApproved ? '✅' : '❌'} Account Approved: ${isApproved}`);
    console.log(`   ${onShift ? '✅' : '❌'} Currently On Shift: ${onShift}`);
    console.log('');

    const canReceive = hasToken && notifEnabled && isApproved && onShift;

    if (canReceive) {
      console.log('   ✅✅✅ USER CAN RECEIVE NOTIFICATIONS ✅✅✅');
    } else {
      console.log('   ❌❌❌ USER CANNOT RECEIVE NOTIFICATIONS ❌❌❌');
      console.log('');
      console.log('   Blocking Reasons:');
      if (!hasToken) console.log('      - Missing or invalid FCM token');
      if (!notifEnabled) console.log('      - Notifications disabled in settings');
      if (!isApproved) console.log('      - Account not approved');
      if (!onShift) console.log('      - Not currently on shift');
    }
    console.log('');

  } catch (error) {
    console.error('Error checking user:', error);
  }

  process.exit(0);
}

checkUserNotifications().catch(console.error);
