/**
 * One-time script to backfill historical GroupMe responses into scans collection
 *
 * This script finds all logs with GroupMe responses and updates the corresponding
 * scans in the scans collection for Android app integration.
 *
 * Usage: node backfill_groupme_responses.js
 */

import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin
initializeApp();
const db = getFirestore();

async function backfillGroupMeResponses() {
  console.log('Starting GroupMe responses backfill...\n');

  try {
    // Find all logs that have a GroupMe response (respondedAt is not null)
    console.log('Fetching logs with GroupMe responses...');
    const logsWithResponses = await db.collection('logs')
      .where('respondedAt', '!=', null)
      .orderBy('respondedAt', 'desc')
      .get();

    console.log(`Found ${logsWithResponses.size} logs with responses\n`);

    let updatedCount = 0;
    let skippedCount = 0;
    let notFoundCount = 0;

    for (const logDoc of logsWithResponses.docs) {
      const logData = logDoc.data();
      const logId = logDoc.id;

      // Extract response info
      const {
        store,
        area,
        token,
        ts,
        respondedAt,
        responderName,
        responderUserId,
        responseText,
        responseTime,
        responseType
      } = logData;

      console.log(`Processing log ${logId}: Store ${store}, ${area}`);

      try {
        // Find corresponding scan
        // Use the log timestamp to find scans within a reasonable time window
        const logTimestamp = ts.toDate ? ts.toDate() : new Date(ts);
        const beforeTime = new Date(logTimestamp.getTime() - 5 * 60 * 1000); // 5 minutes before
        const afterTime = new Date(logTimestamp.getTime() + 5 * 60 * 1000); // 5 minutes after

        const scansQuery = await db.collection('scans')
          .where('storeNumber', '==', String(store))
          .where('timestamp', '>=', beforeTime)
          .where('timestamp', '<=', afterTime)
          .get();

        if (scansQuery.empty) {
          console.log(`  ⚠️  No matching scan found for log ${logId}`);
          notFoundCount++;
          continue;
        }

        // Find the scan that matches the QR token if possible
        let matchingScan = null;
        for (const scanDoc of scansQuery.docs) {
          const scanData = scanDoc.data();
          if (scanData.qrCode === token || scanData.areaDescription === area) {
            matchingScan = scanDoc;
            break;
          }
        }

        // If no exact match, use the first scan
        if (!matchingScan) {
          matchingScan = scansQuery.docs[0];
        }

        const scanData = matchingScan.data();

        // Check if already updated (has claimedBy set)
        if (scanData.claimedBy && scanData.claimedBy !== '') {
          console.log(`  ⏭️  Scan ${matchingScan.id} already has a response, skipping`);
          skippedCount++;
          continue;
        }

        // Update the scan with response info
        const responseEntry = {
          respondedAt: responseTime || respondedAt,
          responderName: responderName || 'Unknown',
          responderUserId: responderUserId || '',
          responseText: responseText || '',
          responseSource: responseType === 'like' ? 'groupme_like' : 'groupme'
        };

        await matchingScan.ref.update({
          status: 'claimed',
          claimedBy: responderUserId || '',
          claimedByName: responderName || 'Unknown',
          claimedAt: respondedAt,
          responses: FieldValue.arrayUnion(responseEntry)
        });

        console.log(`  ✅ Updated scan ${matchingScan.id} with response from ${responderName}`);
        updatedCount++;

      } catch (scanError) {
        console.error(`  ❌ Error processing scan for log ${logId}:`, scanError.message);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('BACKFILL COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total logs processed: ${logsWithResponses.size}`);
    console.log(`Scans updated: ${updatedCount}`);
    console.log(`Scans skipped (already updated): ${skippedCount}`);
    console.log(`Scans not found: ${notFoundCount}`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('Fatal error during backfill:', error);
    process.exit(1);
  }

  process.exit(0);
}

// Run the backfill
backfillGroupMeResponses();
