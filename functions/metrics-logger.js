// ===== Metrics Logging =====
// Automatically log assist/ignore metrics when scans are updated
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

export const logScanMetrics = onDocumentUpdated("scans/{scanId}", async (event) => {
  const db = getFirestore();
  try {
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();
    const scanId = event.params.scanId;

    // Check if status changed to 'claimed' (assisted)
    if (beforeData.status === 'pending' && afterData.status === 'claimed') {
      const responseTime = afterData.claimedAt ?
        afterData.claimedAt.toMillis() - afterData.timestamp.toMillis() : null;

      await db.collection('metrics').add({
        type: 'assist',
        scanId: scanId,
        storeNumber: afterData.storeNumber,
        areaDescription: afterData.areaDescription,
        timestamp: FieldValue.serverTimestamp(),
        userId: afterData.claimedBy,
        userName: afterData.claimedByName,
        responseTimeMs: responseTime,
        responseTimeMinutes: responseTime ? Math.round(responseTime / 60000) : null,
        scanTimestamp: afterData.timestamp
      });

      logger.info(`Logged assist metric for scan ${scanId} in store ${afterData.storeNumber}`);
    }

    // Check if ignoredBy array was updated (manual or auto-ignore)
    const beforeIgnored = beforeData.ignoredBy || [];
    const afterIgnored = afterData.ignoredBy || [];

    if (afterIgnored.length > beforeIgnored.length) {
      // New user(s) ignored this scan
      const newIgnores = afterIgnored.filter(id => !beforeIgnored.includes(id));

      for (const userId of newIgnores) {
        const isAutoIgnore = afterData.autoIgnoredReason === 'timeout_10min';
        const ignoreTime = afterData.autoIgnoredAt || FieldValue.serverTimestamp();

        await db.collection('metrics').add({
          type: 'ignore',
          scanId: scanId,
          storeNumber: afterData.storeNumber,
          areaDescription: afterData.areaDescription,
          timestamp: FieldValue.serverTimestamp(),
          userId: userId,
          isAutoIgnore: isAutoIgnore,
          reason: isAutoIgnore ? 'timeout_10min' : 'manual',
          scanTimestamp: afterData.timestamp,
          ignoredAt: ignoreTime
        });

        logger.info(`Logged ignore metric for scan ${scanId} in store ${afterData.storeNumber} (${isAutoIgnore ? 'auto' : 'manual'})`);
      }
    }

  } catch (error) {
    logger.error(`Error logging scan metrics for ${event.params.scanId}:`, error);
  }
});
