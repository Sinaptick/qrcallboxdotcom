#!/usr/bin/env node

/**
 * Backfill missing timestampMs fields in scans collection
 *
 * This script finds all scans that are missing the timestampMs field
 * and adds it based on the existing timestamp field.
 *
 * This fixes the notification spam issue where old scans without timestampMs
 * were being treated as new scans.
 */

const admin = require('firebase-admin');

// Initialize using application default credentials or service account
try {
  // Try to use application default credentials (if gcloud is set up)
  admin.initializeApp({
    projectId: 'qrwebaccdb'
  });
  console.log('✅ Using Firebase application default credentials\n');
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin SDK');
  console.error('Please run: firebase login');
  process.exit(1);
}

const db = admin.firestore();

async function backfillTimestamps() {
  console.log('🔍 Starting scan timestamp backfill...\n');

  try {
    // Get all scans
    const scansSnapshot = await db.collection('scans').get();

    console.log(`📊 Found ${scansSnapshot.size} total scans\n`);

    let needsUpdate = 0;
    let alreadyHasTimestamp = 0;
    let noTimestampField = 0;
    let updatedCount = 0;
    let errorCount = 0;

    // Batch writes for efficiency
    let batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500; // Firestore limit is 500 operations per batch

    for (const doc of scansSnapshot.docs) {
      const data = doc.data();

      // Check if timestampMs already exists
      if (data.timestampMs != null) {
        alreadyHasTimestamp++;
        continue;
      }

      // Check if timestamp field exists
      if (!data.timestamp) {
        noTimestampField++;
        console.log(`⚠️  Scan ${doc.id} has no timestamp field at all - skipping`);
        continue;
      }

      // Convert Firestore Timestamp to milliseconds
      const timestampMs = data.timestamp.toMillis();

      needsUpdate++;

      // Add to batch
      batch.update(doc.ref, { timestampMs });
      batchCount++;

      console.log(`✅ Queued: ${doc.id} - adding timestampMs: ${timestampMs} (${new Date(timestampMs).toISOString()})`);

      // Commit batch if we've reached the limit
      if (batchCount >= BATCH_SIZE) {
        try {
          await batch.commit();
          updatedCount += batchCount;
          console.log(`\n💾 Committed batch of ${batchCount} updates\n`);
          batch = db.batch();
          batchCount = 0;
        } catch (error) {
          console.error(`❌ Error committing batch:`, error);
          errorCount += batchCount;
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    // Commit any remaining updates
    if (batchCount > 0) {
      try {
        await batch.commit();
        updatedCount += batchCount;
        console.log(`\n💾 Committed final batch of ${batchCount} updates\n`);
      } catch (error) {
        console.error(`❌ Error committing final batch:`, error);
        errorCount += batchCount;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 BACKFILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total scans:                 ${scansSnapshot.size}`);
    console.log(`Already had timestampMs:     ${alreadyHasTimestamp}`);
    console.log(`No timestamp field:          ${noTimestampField}`);
    console.log(`Needed update:               ${needsUpdate}`);
    console.log(`Successfully updated:        ${updatedCount}`);
    console.log(`Errors:                      ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    if (errorCount > 0) {
      console.log('⚠️  Some updates failed. You may want to re-run this script.');
    } else if (updatedCount > 0) {
      console.log('✅ Backfill completed successfully!');
      console.log('🎉 All scans now have timestampMs field.');
      console.log('📱 The notification service will now correctly filter old scans.');
    } else {
      console.log('✅ No updates needed - all scans already have timestampMs!');
    }

  } catch (error) {
    console.error('❌ Fatal error during backfill:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the backfill
backfillTimestamps();
