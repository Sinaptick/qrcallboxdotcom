const admin = require('firebase-admin');
const serviceAccount = require('./functions/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkUser() {
  try {
    const usersSnapshot = await db.collection('users')
      .where('firstName', '==', 'Cody')
      .where('lastName', '==', 'Howard')
      .get();

    if (usersSnapshot.empty) {
      console.log('No user found with name Cody Howard');
      return;
    }

    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      console.log('\n=== Cody Howard Account ===');
      console.log('UID:', doc.id);
      console.log('Email:', userData.email);
      console.log('Store Number:', userData.storeNumber);
      console.log('Job Title:', userData.jobTitle);
      console.log('\n=== Work Schedule ===');
      console.log(JSON.stringify(userData.workSchedule, null, 2));
      console.log('\n=== Current Time Check ===');
      const now = new Date();
      const day = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
      console.log('Current day:', day);
      console.log('Current time:', now.toLocaleTimeString());
      
      if (userData.workSchedule && userData.workSchedule[day]) {
        const schedule = userData.workSchedule[day];
        console.log(`\n${day} schedule:`, schedule);
      } else {
        console.log(`\nNo schedule for ${day}`);
      }
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUser();
