import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// ===== GroupMe Webhook Handler =====
export const groupmeWebhook = onRequest({
  region: "us-central1",
  cors: { origin: true },
  invoker: "public"
}, async (req, res) => {
  try {
    // Get Firestore instance
    const db = getFirestore();
    if (req.method !== "POST") {
      return res.status(405).send("Use POST");
    }

    const payload = req.body;
    logger.info("GroupMe webhook received", { payload });

    // Ignore bot messages (only track human responses)
    if (payload.sender_type === "bot") {
      return res.status(200).send("OK - Bot message ignored");
    }

    // Check if this is a response to a QR assistance request (typed message)
    if (await isAssistanceResponse(payload)) {
      await logAssistanceResponse(payload);
    }
    
    // Check if this is a like on the QR assistance message (treat as response)
    await checkForQRMessageLikes(payload);
    
    // Additionally, check if this is a like update for an existing logged message
    await updateMessageLikes(payload);

    res.status(200).send("OK");
  } catch (e) {
    logger.error("Webhook error:", e);
    res.status(500).send("Error processing webhook");
  }
});

// ===== Helper Functions =====

/**
 * Determine if a GroupMe message is a response to an assistance request
 * Now records ANY first message after a QR assistance request
 */
async function isAssistanceResponse(payload) {
  const { group_id, created_at } = payload;
  
  // Check if there was a recent assistance request in this group
  // Use a wider time window to account for timezone differences between GroupMe and local logs
  const recentRequestTime = new Date(created_at * 1000 - 6 * 60 * 60 * 1000); // 6 hours ago to handle timezone differences
  
  const db = getFirestore();
  
  // Find recent unresponded assistance requests
  const recentLogs = await db.collection("logs")
    .where("ts", ">=", recentRequestTime)
    .where("respondedAt", "==", null)
    .orderBy("ts", "desc")
    .limit(10)
    .get();

  // If we have unresponded assistance requests, this message could be a response
  return !recentLogs.empty;
}

/**
 * Log an assistance response (now records ANY first message after QR request)
 */
async function logAssistanceResponse(payload) {
  const { name, user_id, text, group_id, created_at, favorited_by, id: message_id } = payload;
  
  try {
    const db = getFirestore();
    
    // Find the most recent unresponded assistance request
    // Use wider time window to handle timezone differences
    const recentLogs = await db.collection("logs")
      .where("ts", ">=", new Date(created_at * 1000 - 6 * 60 * 60 * 1000))
      .where("respondedAt", "==", null)
      .orderBy("ts", "desc")
      .limit(1)
      .get();

    if (!recentLogs.empty) {
      const logDoc = recentLogs.docs[0];
      const logData = logDoc.data();
      
      // Calculate response time in seconds
      const requestTime = logData.ts.toDate ? logData.ts.toDate() : new Date(logData.ts);
      const responseTime = new Date(created_at * 1000);
      const responseTimeSeconds = Math.round((responseTime - requestTime) / 1000);
      
      // Check for likes on this message
      const likeCount = favorited_by ? favorited_by.length : 0;
      const likedByUsers = favorited_by || [];
      
      // Update the log with response info
      await logDoc.ref.update({
        respondedAt: FieldValue.serverTimestamp(),
        responderName: name,
        responderUserId: user_id,
        responseText: text,
        responseTime: responseTime,
        responseTimeSeconds: responseTimeSeconds,
        groupId: group_id,
        messageId: message_id,
        likeCount: likeCount,
        likedByUsers: likedByUsers,
        hasLikes: likeCount > 0,
        responseType: "message"
      });

      logger.info("Logged assistance response", {
        logId: logDoc.id,
        responder: name,
        responseText: text,
        responseTimeSeconds: responseTimeSeconds,
        likeCount: likeCount,
        store: logData.store,
        area: logData.area
      });
      
      // If the message was liked, log additional details
      if (likeCount > 0) {
        logger.info("Response message was liked", {
          logId: logDoc.id,
          messageId: message_id,
          likeCount: likeCount,
          likedByUsers: likedByUsers
        });
      }
    }
  } catch (e) {
    logger.error("Error logging response:", e);
  }
}

/**
 * Update like information for messages that are already logged
 */
async function updateMessageLikes(payload) {
  const { id: message_id, favorited_by } = payload;
  
  if (!message_id) return;
  
  try {
    const db = getFirestore();
    
    // Find if this message is already logged in our system
    const existingLogs = await db.collection("logs")
      .where("messageId", "==", message_id)
      .limit(1)
      .get();
    
    if (!existingLogs.empty) {
      const logDoc = existingLogs.docs[0];
      const currentData = logDoc.data();
      
      const likeCount = favorited_by ? favorited_by.length : 0;
      const likedByUsers = favorited_by || [];
      
      // Only update if like count has changed
      if (currentData.likeCount !== likeCount) {
        await logDoc.ref.update({
          likeCount: likeCount,
          likedByUsers: likedByUsers,
          hasLikes: likeCount > 0,
          lastLikeUpdate: FieldValue.serverTimestamp()
        });
        
        logger.info("Updated message likes", {
          logId: logDoc.id,
          messageId: message_id,
          oldLikeCount: currentData.likeCount || 0,
          newLikeCount: likeCount,
          store: currentData.store,
          area: currentData.area
        });
      }
    }
  } catch (e) {
    logger.error("Error updating message likes:", e);
  }
}

/**
 * Check if this message has likes from users who haven't responded yet
 * Treat first like as equivalent to first typed response
 */
async function checkForQRMessageLikes(payload) {
  const { favorited_by, sender_type, text, created_at } = payload;
  
  // Only check messages that have likes and are from our bot (QR assistance messages)
  if (sender_type !== "bot" || !favorited_by || favorited_by.length === 0) {
    return;
  }
  
  // Check if this is a QR assistance message (contains our assistance text pattern)
  const messageText = text?.toLowerCase() || "";
  if (!messageText.includes("customer assistance needed")) {
    return;
  }
  
  try {
    const db = getFirestore();
    
    // Find the corresponding log entry for this assistance request
    // Expand time window to handle timezone differences
    const messageTime = new Date(created_at * 1000);
    const sixHoursBefore = new Date(messageTime.getTime() - 6 * 60 * 60 * 1000);
    const oneHourAfter = new Date(messageTime.getTime() + 1 * 60 * 60 * 1000);
    
    const matchingLogs = await db.collection("logs")
      .where("ts", ">=", sixHoursBefore)
      .where("ts", "<=", oneHourAfter)
      .where("respondedAt", "==", null)
      .orderBy("ts", "desc")
      .limit(1)
      .get();
    
    if (!matchingLogs.empty) {
      const logDoc = matchingLogs.docs[0];
      const logData = logDoc.data();
      
      // Get the first user who liked (chronologically first responder)
      const firstLiker = favorited_by[0]; // GroupMe typically orders by like time
      
      // Calculate response time (like time = message created time for this approach)
      const requestTime = logData.ts.toDate ? logData.ts.toDate() : new Date(logData.ts);
      const responseTime = messageTime;
      const responseTimeSeconds = Math.round((responseTime - requestTime) / 1000);
      
      // Update the log to mark it as responded to via like
      await logDoc.ref.update({
        respondedAt: FieldValue.serverTimestamp(),
        responderName: "Like Response",
        responderUserId: firstLiker,
        responseText: "[LIKED MESSAGE]",
        responseTime: responseTime,
        responseTimeSeconds: responseTimeSeconds,
        groupId: payload.group_id,
        messageId: payload.id,
        likeCount: favorited_by.length,
        likedByUsers: favorited_by,
        hasLikes: true,
        responseType: "like"
      });
      
      logger.info("Logged assistance response via like", {
        logId: logDoc.id,
        firstLiker: firstLiker,
        totalLikes: favorited_by.length,
        responseTimeSeconds: responseTimeSeconds,
        store: logData.store,
        area: logData.area
      });
    }
  } catch (e) {
    logger.error("Error checking QR message likes:", e);
  }
}