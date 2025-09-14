const admin = require('firebase-admin');

// Initialize Firebase Admin with service account
if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function createTestUser() {
  const userData = {
    email: 'sinaptick@gmail.com',
    firstName: 'Test',
    lastName: 'User',
    fullName: 'Test User',
    storeNumber: '1458',
    homeStore: '1458',
    allowedStores: ['1458'],
    fcmToken: 'damQr521SwGUvcI2Plyj9V:APA91bH8EFfFp-97AW7jTe23AbT-SSI_-dYNfOt4IIXjHTWMIbI58rpYz8ZTQ4YXGQK1OIvnsBgCd-s1p5fCJdeetIjnEtVS6f5IZ3dxdqihyW9gQcSp9wE',
    approved: true,
    schedule: ['Monday', 'Tuesday', 'Wednesday'],
    role: 'employee',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastActive: admin.firestore.FieldValue.serverTimestamp()
  };
  
  console.log('Creating/updating test user for testing...');
  console.log('Email:', userData.email);
  console.log('Store:', userData.storeNumber);
  console.log('FCM Token:', userData.fcmToken.substring(0, 30) + '...');
  
  try {
    // Use email as document ID for easy lookup
    const userDocId = userData.email.replace('@', '_').replace('.', '_');
    
    await db.collection("users").doc(userDocId).set(userData, { merge: true });
    
    console.log('✅ Test user created/updated successfully!');
    console.log(`Document ID: ${userDocId}`);
    
    return userDocId;
  } catch (error) {
    console.error('❌ Error creating test user:', error);
    throw error;
  }
}

// Run the function
createTestUser()
  .then(docId => {
    console.log('\n🎯 Test user ready!');
    console.log('The sendAndroidNotification function should now find this user when scanning QR codes for store 1458.');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test user creation failed:', error);
    process.exit(1);
  });