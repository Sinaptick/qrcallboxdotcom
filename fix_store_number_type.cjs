const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./qrwebaccdb-firebase-adminsdk-70j0x-0cc2b87d34.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixStoreNumberTypes() {
  console.log('🔍 Finding users with numeric storeNumber...');

  const usersSnapshot = await db.collection('users').get();
  let fixedCount = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const { storeNumber, activeStore } = userData;

    let needsUpdate = false;
    const updates = {};

    // Check storeNumber
    if (typeof storeNumber === 'number') {
      console.log(`  📝 ${userData.email || userDoc.id}: storeNumber is number (${storeNumber}) -> converting to string`);
      updates.storeNumber = String(storeNumber);
      needsUpdate = true;
    }

    // Check activeStore
    if (typeof activeStore === 'number') {
      console.log(`  📝 ${userData.email || userDoc.id}: activeStore is number (${activeStore}) -> converting to string`);
      updates.activeStore = String(activeStore);
      needsUpdate = true;
    }

    if (needsUpdate) {
      await userDoc.ref.update(updates);
      fixedCount++;
      console.log(`  ✅ Fixed user ${userData.email || userDoc.id}`);
    }
  }

  console.log(`\n✅ Fixed ${fixedCount} users`);
  process.exit(0);
}

fixStoreNumberTypes().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
