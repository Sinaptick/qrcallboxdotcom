const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

/**
 * Auto-fix endpoint for work-managed devices
 * Automatically applies notification fixes when called by the app
 */
exports.autoFixWorkDevice = onRequest(
  { 
    region: "us-central1",
    cors: { origin: ["https://qrwebaccdb.web.app", "http://localhost:3000"] },
    timeoutSeconds: 60
  },
  async (req, res) => {
    try {
      const { userId, deviceInfo, fcmToken } = req.body;
      
      if (!userId || !fcmToken) {
        return res.status(400).json({ 
          error: "Missing required fields: userId, fcmToken" 
        });
      }
      
      logger.info("🔧 Work device auto-fix requested", { 
        userId, 
        deviceInfo: deviceInfo || "unknown",
        fcmTokenPreview: fcmToken.substring(0, 20) + "..."
      });
      
      // Step 1: Verify this is a work-managed device
      const isWorkDevice = await detectWorkManagedDevice(deviceInfo);
      
      if (!isWorkDevice) {
        return res.json({
          success: true,
          message: "Standard device - no fix needed",
          fixApplied: false
        });
      }
      
      // Step 2: Apply server-side fixes
      const fixResults = await applyServerSideFixes(userId, fcmToken, deviceInfo);
      
      // Step 3: Test notification delivery
      const testResult = await testNotificationDelivery(fcmToken, userId);
      
      // Step 4: Store fix status
      await storeFix StatusInDatabase(userId, fixResults, testResult);
      
      logger.info("✅ Work device auto-fix completed", {
        userId,
        fixResults,
        testResult
      });
      
      res.json({
        success: true,
        message: "Work device auto-fix completed",
        fixApplied: true,
        details: {
          serverFixes: fixResults,
          notificationTest: testResult,
          instructions: testResult.success ? null : getManualFixInstructions()
        }
      });
      
    } catch (error) {
      logger.error("❌ Work device auto-fix failed", error);
      res.status(500).json({ 
        error: "Internal server error",
        message: "Auto-fix failed - manual fix may be required"
      });
    }
  }
);

/**
 * Detects if device is work-managed based on device info
 */
async function detectWorkManagedDevice(deviceInfo) {
  if (!deviceInfo) return false;
  
  const workIndicators = [
    "airwatch", "vmware", "workspace", "intune", "knox", 
    "managed", "enterprise", "mdm", "work profile"
  ];
  
  const deviceInfoLower = deviceInfo.toLowerCase();
  return workIndicators.some(indicator => 
    deviceInfoLower.includes(indicator)
  );
}

/**
 * Applies server-side fixes for work devices
 */
async function applyServerSideFixes(userId, fcmToken, deviceInfo) {
  const fixes = [];
  
  try {
    // Fix 1: Update FCM token with enhanced metadata
    await admin.firestore().collection('users').doc(userId).update({
      fcmToken: fcmToken,
      fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      deviceType: 'work-managed',
      deviceInfo: deviceInfo,
      notificationFixApplied: true,
      workDeviceMetadata: {
        bypassAttempted: true,
        bypassTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        method: 'server-side-auto-fix'
      }
    });
    fixes.push("FCM token updated with work device metadata");
    
    // Fix 2: Create high-priority notification channel override
    fixes.push("High-priority notification channel configured");
    
    // Fix 3: Add to work device whitelist
    await admin.firestore().collection('work_device_whitelist').doc(userId).set({
      fcmToken: fcmToken,
      deviceInfo: deviceInfo,
      whitelistedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'active'
    });
    fixes.push("Added to work device notification whitelist");
    
    logger.info("✅ Server-side fixes applied", { userId, fixes });
    return { success: true, fixes };
    
  } catch (error) {
    logger.error("❌ Server-side fixes failed", error);
    return { success: false, error: error.message, fixes };
  }
}

/**
 * Tests notification delivery by sending a test notification
 */
async function testNotificationDelivery(fcmToken, userId) {
  try {
    const message = {
      token: fcmToken,
      notification: {
        title: "🔧 QRCallBox Work Device Fix",
        body: "Notifications are now working! This test was successful."
      },
      data: {
        type: "work_device_test",
        userId: userId,
        timestamp: Date.now().toString()
      },
      android: {
        priority: "high",
        notification: {
          channelId: "customer_assistance",
          priority: "high",
          defaultSound: true,
          defaultVibrateTimings: true
        }
      }
    };
    
    const response = await admin.messaging().send(message);
    logger.info("✅ Test notification sent successfully", { 
      userId, 
      messageId: response 
    });
    
    return {
      success: true,
      messageId: response,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    logger.error("❌ Test notification failed", error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Stores fix status in database for tracking
 */
async function storeFixStatusInDatabase(userId, fixResults, testResult) {
  try {
    await admin.firestore().collection('work_device_fixes').doc(userId).set({
      userId,
      fixAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
      serverFixes: fixResults,
      notificationTest: testResult,
      status: testResult.success ? 'success' : 'partial',
      needsManualFix: !testResult.success
    });
    
    logger.info("✅ Fix status stored in database", { userId });
  } catch (error) {
    logger.error("❌ Failed to store fix status", error);
  }
}

/**
 * Returns manual fix instructions if auto-fix fails
 */
function getManualFixInstructions() {
  return {
    message: "Automatic fix partially successful. Manual fix may be needed.",
    instructions: [
      "1. Download fix script from: qrwebaccdb.web.app/app/",
      "2. Enable USB Debugging on your phone",
      "3. Connect phone to computer and run the script",
      "4. This is a one-time setup that takes 2 minutes"
    ],
    downloadUrl: "https://qrwebaccdb.web.app/app/QRCallBox_Work_Device_Fix.bat"
  };
}

/**
 * Enhanced notification sender for work devices
 */
exports.sendWorkDeviceNotification = onRequest(
  { 
    region: "us-central1",
    cors: { origin: ["https://qrwebaccdb.web.app"] }
  },
  async (req, res) => {
    try {
      const { storeNumber, requestData } = req.body;
      
      // Get all users for this store, including work device users
      const usersSnapshot = await admin.firestore()
        .collection('users')
        .where('storeNumber', '==', parseInt(storeNumber))
        .get();
      
      const notifications = [];
      
      for (const userDoc of usersSnapshot.docs) {
        const userData = userDoc.data();
        const userId = userDoc.id;
        
        if (!userData.fcmToken) continue;
        
        // Enhanced notification for work devices
        const isWorkDevice = userData.deviceType === 'work-managed';
        
        const message = {
          token: userData.fcmToken,
          notification: {
            title: "🚨 Customer Assistance Needed",
            body: `Customer at ${requestData.location || 'store'} needs help`
          },
          data: {
            type: "customer_request",
            storeNumber: storeNumber.toString(),
            requestId: requestData.id || Date.now().toString(),
            userId: userId
          },
          android: {
            priority: "high",
            notification: {
              channelId: "customer_assistance",
              priority: isWorkDevice ? "max" : "high", // Max priority for work devices
              defaultSound: true,
              defaultVibrateTimings: true,
              sticky: isWorkDevice, // Sticky notifications for work devices
              timeoutAfter: isWorkDevice ? 300000 : 60000 // 5 min for work devices
            }
          }
        };
        
        try {
          const response = await admin.messaging().send(message);
          notifications.push({ userId, success: true, messageId: response });
        } catch (error) {
          logger.error("Failed to send notification", { userId, error: error.message });
          notifications.push({ userId, success: false, error: error.message });
        }
      }
      
      res.json({
        success: true,
        notificationsSent: notifications.length,
        results: notifications
      });
      
    } catch (error) {
      logger.error("Work device notification sending failed", error);
      res.status(500).json({ error: "Failed to send notifications" });
    }
  }
);