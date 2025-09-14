const admin = require('firebase-admin');

// Initialize Firebase Admin with service account
if (!admin.apps.length) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function createTestToken() {
  const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const store = "1458";
  const area = "Electronics Test Area";
  
  console.log(`Creating test token: ${token}`);
  console.log(`Store: ${store}, Area: ${area}`);
  
  try {
    // Create the token document
    await db.collection("qr_tokens").doc(token).set({
      store: store,
      area: area,
      token: token,
      createdBy: 'test-user',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      scanned: false,
      scanCount: 0
    });
    
    console.log('✅ Test token created successfully!');
    console.log(`Test QR Scan URL: https://us-central1-qrwebaccdb.cloudfunctions.net/s?t=${token}`);
    
    return token;
  } catch (error) {
    console.error('❌ Error creating test token:', error);
    throw error;
  }
}

// Run the function
createTestToken()
  .then(token => {
    console.log('\n🎯 Ready for testing!');
    console.log('You can now test the QR scan by visiting:');
    console.log(`https://us-central1-qrwebaccdb.cloudfunctions.net/s?t=${token}`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Test setup failed:', error);
    process.exit(1);
  });