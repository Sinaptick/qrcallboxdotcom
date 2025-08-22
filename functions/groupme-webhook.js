import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

// Initialize if not already done
if (!getApps().length) {
  initializeApp();
}
const db = getFirestore();

// ===== GroupMe Webhook Handler =====
export const groupmeWebhook = onRequest({
  region: "us-central1",
  cors: { origin: true },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Use POST");
    }

    const payload = req.body;
    logger.info("GroupMe webhook received", { payload });

    // Ignore bot messages (only track human responses)
    if (payload.sender_type === "bot") {
      return res.status(200).send("OK - Bot message ignored");
    }

    // Check if this is a response to a QR assistance request
    if (await isAssistanceResponse(payload)) {
      await logAssistanceResponse(payload);
    }

    res.status(200).send("OK");
  } catch (e) {
    logger.error("Webhook error:", e);
    res.status(500).send("Error processing webhook");
  }
});

// ===== Helper Functions =====

/**
 * Determine if a GroupMe message is a response to an assistance request
 */
async function isAssistanceResponse(payload) {
  const { text, group_id, created_at } = payload;
  
  // Look for response keywords
  const responseKeywords = [
    "on my way", "heading over", "be right there", "coming", "responding",
    "i'll help", "i got it", "got this", "handling", "taking care",
    "on it", "be there", "helping", "assist"
  ];
  
  const messageText = text?.toLowerCase() || "";
  const hasResponseKeyword = responseKeywords.some(keyword => 
    messageText.includes(keyword)
  );

  if (!hasResponseKeyword) return false;

  // Check if there was a recent assistance request in this group
  const recentRequestTime = new Date(created_at * 1000 - 30 * 60 * 1000); // 30 minutes ago
  
  const recentLogs = await db.collection("logs")
    .where("ts", ">=", recentRequestTime)
    .orderBy("ts", "desc")
    .limit(10)
    .get();

  // If we have recent assistance requests, this is likely a response
  return !recentLogs.empty;
}

/**
 * Log an assistance response
 */
async function logAssistanceResponse(payload) {
  const { name, user_id, text, group_id, created_at } = payload;
  
  try {
    // Find the most recent unresponded assistance request
    const recentLogs = await db.collection("logs")
      .where("ts", ">=", new Date(created_at * 1000 - 30 * 60 * 1000))
      .where("respondedAt", "==", null)
      .orderBy("ts", "desc")
      .limit(1)
      .get();

    if (!recentLogs.empty) {
      const logDoc = recentLogs.docs[0];
      
      // Update the log with response info
      await logDoc.ref.update({
        respondedAt: FieldValue.serverTimestamp(),
        responderName: name,
        responderUserId: user_id,
        responseText: text,
        responseTime: new Date(created_at * 1000),
        groupId: group_id
      });

      logger.info("Logged assistance response", {
        logId: logDoc.id,
        responder: name,
        responseText: text
      });
    }
  } catch (e) {
    logger.error("Error logging response:", e);
  }
}