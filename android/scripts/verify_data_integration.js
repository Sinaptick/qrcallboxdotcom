#!/usr/bin/env node

/**
 * QRCallBox Data Integration Verification Script
 * 
 * This script connects to your Firebase database and verifies:
 * 1. User data structure compatibility
 * 2. Existing response format in scans
 * 3. Leaderboard data requirements
 * 
 * Run: node verify_data_integration.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// You'll need to provide your service account key
const serviceAccount = require('./qrwebaccdb-service-account.json'); // You'll need to download this

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://qrwebaccdb.firebaseapp.com'
});

const db = admin.firestore();

async function verifyDataIntegration() {
  console.log('🔍 QRCallBox Data Integration Verification\n');

  try {
    // 1. Check Users Collection Structure
    console.log('1. Analyzing Users Collection...');
    const usersSnapshot = await db.collection('users').limit(5).get();
    
    if (usersSnapshot.empty) {
      console.log('⚠️  No users found in database');
      return;
    }

    console.log(`   Found ${usersSnapshot.size} users (showing first 5)`);
    
    const userStructures = new Set();
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      const fields = Object.keys(data).sort().join(', ');
      userStructures.add(fields);
      
      console.log(`   User ${doc.id}:`);
      console.log(`     Fields: ${fields}`);
      console.log(`     Store: ${data.storeNumber}`);
      console.log(`     Name format: ${data.firstName ? 'firstName/lastName' : 'fullName only'}`);
      console.log('');
    });

    console.log('   User data structures found:');
    userStructures.forEach(structure => {
      console.log(`     - ${structure}`);
    });

    // 2. Check Scans Collection Structure
    console.log('\n2. Analyzing Scans Collection...');
    const scansSnapshot = await db.collection('scans')
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    if (scansSnapshot.empty) {
      console.log('⚠️  No scans found in database');
    } else {
      console.log(`   Found recent scans (showing last 10)`);
      
      const scanStructures = new Set();
      let responsesFound = 0;
      let responseStructures = new Set();

      scansSnapshot.forEach(doc => {
        const data = doc.data();
        const fields = Object.keys(data).sort().join(', ');
        scanStructures.add(fields);

        if (data.responses && data.responses.length > 0) {
          responsesFound += data.responses.length;
          data.responses.forEach(response => {
            const responseFields = Object.keys(response).sort().join(', ');
            responseStructures.add(responseFields);
          });
        }

        console.log(`   Scan ${doc.id}:`);
        console.log(`     Store: ${data.storeNumber}`);
        console.log(`     Area: ${data.areaDescription}`);
        console.log(`     Responses: ${data.responses ? data.responses.length : 0}`);
        console.log(`     Status: ${data.status || 'no status field'}`);
      });

      console.log('\n   Scan data structures found:');
      scanStructures.forEach(structure => {
        console.log(`     - ${structure}`);
      });

      console.log('\n   Response data structures found:');
      if (responseStructures.size === 0) {
        console.log('     ⚠️  No responses found in recent scans');
      } else {
        responseStructures.forEach(structure => {
          console.log(`     - ${structure}`);
        });
      }
    }

    // 3. Check for Leaderboard Compatibility
    console.log('\n3. Leaderboard Compatibility Check...');
    
    const requiredUserFields = ['firstName', 'lastName', 'storeNumber', 'fullName'];
    const requiredResponseFields = ['userId', 'userName', 'firstName', 'lastName', 'storeNumber', 'action', 'timestamp', 'responseTime'];
    
    // Check a real user to see what fields exist
    const sampleUser = usersSnapshot.docs[0];
    if (sampleUser) {
      const userData = sampleUser.data();
      console.log('   Required user fields for leaderboard:');
      requiredUserFields.forEach(field => {
        const exists = userData.hasOwnProperty(field);
        console.log(`     ${exists ? '✅' : '❌'} ${field}: ${exists ? typeof userData[field] : 'missing'}`);
      });
    }

    // Check response format
    if (scansSnapshot.docs.length > 0) {
      const scanWithResponses = scansSnapshot.docs.find(doc => doc.data().responses && doc.data().responses.length > 0);
      if (scanWithResponses) {
        const response = scanWithResponses.data().responses[0];
        console.log('\n   Required response fields for leaderboard:');
        requiredResponseFields.forEach(field => {
          const exists = response.hasOwnProperty(field);
          console.log(`     ${exists ? '✅' : '❌'} ${field}: ${exists ? typeof response[field] : 'missing'}`);
        });
      } else {
        console.log('\n   ⚠️  No responses found to verify format');
      }
    }

    // 4. Recommendations
    console.log('\n4. Integration Recommendations:');
    
    // Check if users have both name formats
    const hasFirstLastName = usersSnapshot.docs.some(doc => doc.data().firstName && doc.data().lastName);
    const hasFullNameOnly = usersSnapshot.docs.some(doc => doc.data().fullName && !doc.data().firstName);
    
    if (hasFullNameOnly && !hasFirstLastName) {
      console.log('   ⚠️  Users only have fullName field - Android app should split names on registration');
    } else if (hasFirstLastName && hasFullNameOnly) {
      console.log('   ✅ Mixed name formats detected - Android app properly handles both');
    } else if (hasFirstLastName) {
      console.log('   ✅ Users have firstName/lastName - Android app compatible');
    }

    console.log('\n📊 Verification Complete!');
    
  } catch (error) {
    console.error('❌ Error during verification:', error.message);
  }
}

verifyDataIntegration();