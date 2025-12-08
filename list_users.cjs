#!/usr/bin/env node

/**
 * List all Firebase Auth users
 */

const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'qrwebaccdb'
});

const auth = admin.auth();

async function listUsers() {
  console.log('📋 Listing all Firebase Auth users...\n');

  try {
    let allUsers = [];
    let nextPageToken;

    do {
      const result = await auth.listUsers(1000, nextPageToken);
      allUsers = allUsers.concat(result.users);
      nextPageToken = result.pageToken;
    } while (nextPageToken);

    console.log(`Found ${allUsers.length} total users\n`);

    // Filter and sort
    const searchTerm = process.argv[2]?.toLowerCase();
    let filteredUsers = allUsers;

    if (searchTerm) {
      filteredUsers = allUsers.filter(user =>
        user.email?.toLowerCase().includes(searchTerm) ||
        user.displayName?.toLowerCase().includes(searchTerm)
      );
      console.log(`Showing ${filteredUsers.length} users matching "${searchTerm}":\n`);
    }

    filteredUsers
      .sort((a, b) => a.email?.localeCompare(b.email || '') || 0)
      .forEach((user, i) => {
        console.log(`${i + 1}. ${user.email || 'No email'}`);
        console.log(`   UID: ${user.uid}`);
        console.log(`   Display Name: ${user.displayName || 'N/A'}`);
        console.log(`   Last Sign In: ${user.metadata.lastSignInTime || 'Never'}\n`);
      });

  } catch (error) {
    console.error('Error:', error.message);
  }

  process.exit(0);
}

listUsers();
