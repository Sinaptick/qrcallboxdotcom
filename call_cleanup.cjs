const { initializeApp } = require('firebase/app');
const { getFunctions, httpsCallable, connectFunctionsEmulator } = require('firebase/functions');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBKCIjwOzWpx_Xt2PHwDxm7Q8j7dFmCdME",
  authDomain: "qrwebaccdb.firebaseapp.com",
  projectId: "qrwebaccdb",
  storageBucket: "qrwebaccdb.appspot.com",
  messagingSenderId: "1050635398596",
  appId: "1:1050635398596:web:7c0e9f8e4df26d4c1c02dd"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'us-central1');
const auth = getAuth(app);

async function runCleanup() {
  try {
    console.log('Logging in as admin...');

    // Login as admin - you need to enter the password
    const email = 'sinaptick@gmail.com';
    console.log('\nPlease authenticate as admin user.');
    console.log('If you see an error, make sure you are logged in with admin credentials.\n');

    // For security, we won't hardcode the password
    // You can either pass it as an environment variable or run this interactively
    const password = process.env.ADMIN_PASSWORD;

    if (!password) {
      console.error('ERROR: Please set ADMIN_PASSWORD environment variable');
      console.error('Usage: ADMIN_PASSWORD=your_password node call_cleanup.cjs');
      process.exit(1);
    }

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('Logged in successfully as:', userCredential.user.email);

    console.log('\nCalling cleanupTestScans function...');
    const cleanupTestScans = httpsCallable(functions, 'cleanupTestScans');
    const result = await cleanupTestScans();

    console.log('\n✓ Cleanup Complete!');
    console.log('==================');
    console.log('Total scans checked:', result.data.totalScans);
    console.log('Scans deleted:', result.data.deletedCount);
    console.log('Remaining scans:', result.data.remainingScans);

    if (result.data.deletedScans && result.data.deletedScans.length > 0) {
      console.log('\nSample deleted scans:');
      result.data.deletedScans.forEach(scan => {
        console.log(`  - Store ${scan.store}: ${scan.area}`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
  } finally {
    process.exit(0);
  }
}

runCleanup();
