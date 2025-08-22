import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";

// Import webhook handler
export { groupmeWebhook } from './groupme-webhook.js';

// ===== Secrets (set with `firebase functions:secrets:set ...`) =====
const GROUPME_CLIENT_ID = defineSecret("GROUPME_CLIENT_ID");
// GroupMe does not use client_secret for personal apps; omit if you don’t have one.
// const GROUPME_CLIENT_SECRET = defineSecret("GROUPME_CLIENT_SECRET");

// ===== Admin SDK =====
initializeApp();
const db = getFirestore();

// Your deployed base URL/route you registered in GroupMe app settings
const REGION = "us-central1";
const BASE_CALLBACK = "https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeCallback";

// Helpers
function requiredQuery(req, key) {
  const v = req.query[key];
  if (!v) throw new Error(`Missing query param: ${key}`);
  return String(v);
}

// ===== 1) Start OAuth: redirect user to GroupMe authorize =====
export const groupmeStart = onRequest(
  { 
    region: REGION, 
    secrets: [GROUPME_CLIENT_ID],
    cors: { origin: true },
    invoker: "public"
  },
  async (req, res) => {
    try {
      // Optional: accept a `state` param you pass through (e.g., your userId)
      const state = req.query.state ? String(req.query.state) : "";
      const clientId = GROUPME_CLIENT_ID.value().trim();

      const authorizeUrl =
        "https://oauth.groupme.com/oauth/authorize" +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(BASE_CALLBACK)}` +
        (state ? `&state=${encodeURIComponent(state)}` : "");

      res.redirect(authorizeUrl);
    } catch (e) {
      logger.error(e);
      res.status(400).send("Failed to start OAuth");
    }
  }
);

// ===== 2) OAuth callback: exchange code for access_token =====
export const groupmeCallback = onRequest(
  { 
    region: REGION, 
    secrets: [GROUPME_CLIENT_ID],
    cors: { origin: true },
    invoker: "public"
  },
  async (req, res) => {
    try {
      logger.info("GroupMe callback received", { query: req.query });
      
      const code = requiredQuery(req, "code");
      const state = req.query.state ? String(req.query.state) : "";
      const clientId = GROUPME_CLIENT_ID.value().trim();

      logger.info("Starting OAuth token exchange", { code: code.substring(0, 10) + "...", state });

      // GroupMe token exchange (no client_secret for personal apps)
      const tokenRequest = {
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: BASE_CALLBACK
      };

      logger.info("Token request", { 
        ...tokenRequest, 
        code: code.substring(0, 10) + "...",
        redirect_uri: tokenRequest.redirect_uri 
      });

      // Try direct GET request as per GroupMe docs (some OAuth providers use GET)
      const tokenUrl = `https://api.groupme.com/oauth/token?` +
        `client_id=${encodeURIComponent(tokenRequest.client_id)}&` +
        `redirect_uri=${encodeURIComponent(tokenRequest.redirect_uri)}&` +
        `code=${encodeURIComponent(tokenRequest.code)}`;

      logger.info("Sending GET request to GroupMe", { 
        url: tokenUrl.replace(tokenRequest.code, tokenRequest.code.substring(0, 10) + "...")
      });

      const resp = await fetch(tokenUrl, {
        method: "GET",
        headers: { 
          "Accept": "application/json",
          "User-Agent": "QRcallbox/1.0"
        }
      });

      const responseText = await resp.text();
      
      // Log all response headers
      const responseHeaders = {};
      resp.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      logger.info("GroupMe API complete response", { 
        status: resp.status,
        statusText: resp.statusText,
        headers: responseHeaders,
        responseLength: responseText.length,
        fullResponse: responseText.length < 1000 ? responseText : responseText.substring(0, 1000) + "... (truncated)"
      });

      let data;
      try {
        data = JSON.parse(responseText);
        logger.info("Successfully parsed JSON response", { hasAccessToken: !!data?.access_token });
      } catch (parseError) {
        logger.error("Failed to parse GroupMe response as JSON", { 
          parseError: parseError.message, 
          responseText: responseText.length < 2000 ? responseText : responseText.substring(0, 2000) + "... (truncated)",
          responseLength: responseText.length
        });
        return res.status(400).send(`Invalid response from GroupMe API. Status: ${resp.status}, Content-Type: ${resp.headers.get('content-type')}, Response: ${responseText.substring(0, 200)}`);
      }

      logger.info("GroupMe API response", { status: resp.status, hasAccessToken: !!data?.access_token });

      if (!resp.ok || !data?.access_token) {
        logger.error("OAuth exchange failed", { 
          status: resp.status, 
          data, 
          headers: Object.fromEntries(resp.headers.entries())
        });
        return res.status(400).send("OAuth exchange failed: " + (data?.error || "Unknown error"));
      }

      const { access_token, user_id } = data;

      // Save per-user token (key how you like; here by GroupMe user_id)
      await db.collection("groupme_tokens").doc(String(user_id)).set(
        {
          access_token,
          user_id: String(user_id),
          firebase_uid: state || null, // Link to Firebase user
          state: state || null,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      // Send the user back to your app with success notification
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>GroupMe Connected</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <style>
              body { 
                font-family: system-ui, sans-serif; 
                text-align: center; 
                padding: 2rem; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                min-height: 100vh;
                margin: 0;
                display: flex;
                align-items: center;
                justify-content: center;
              }
              .container {
                background: rgba(255,255,255,0.95);
                color: #333;
                padding: 2rem;
                border-radius: 1rem;
                box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                max-width: 400px;
              }
              h1 { color: #2563eb; margin-bottom: 1rem; }
              p { margin-bottom: 1rem; line-height: 1.6; }
              .success { color: #059669; font-weight: 600; }
            </style>
            <script>
              // Store the GroupMe user ID for the frontend to use
              if (window.opener && "${state}") {
                window.opener.localStorage.setItem("groupme_user_id_${state}", "${user_id}");
                setTimeout(() => window.close(), 2000);
              }
            </script>
          </head>
          <body>
            <div class="container">
              <h1>✅ GroupMe Connected!</h1>
              <p class="success">Your GroupMe account has been successfully connected.</p>
              <p>You can now close this window and return to the app to complete your bot setup.</p>
              <p><small>This window will close automatically in 2 seconds.</small></p>
            </div>
          </body>
        </html>
      `);
    } catch (e) {
      logger.error("Callback error:", e);
      res.status(500).send("Error handling OAuth callback: " + e.message);
    }
  }
);

// ===== 3) List groups using stored token =====
// Call like: GET /groupmeGroups?user_id=<groupme_user_id>
export const groupmeGroups = onRequest({ 
  region: REGION,
  cors: { origin: true },
  invoker: "public"
}, async (req, res) => {
  try {
    const groupmeUserId = requiredQuery(req, "user_id");
    const doc = await db.collection("groupme_tokens").doc(groupmeUserId).get();
    if (!doc.exists) return res.status(404).send("No token on file");

    const { access_token } = doc.data();

    const resp = await fetch(
      "https://api.groupme.com/v3/groups?per_page=100&page=1",
      { headers: { "X-Access-Token": access_token } }
    );
    const json = await resp.json();

    if (!resp.ok) {
      logger.error("Group list failed", { status: resp.status, json });
      return res.status(400).send("Failed to fetch groups");
    }

    res.json(json);
  } catch (e) {
    logger.error(e);
    res.status(500).send("Error listing groups");
  }
});

// ===== 4) Create a bot in a group =====
// POST body: { user_id: "12345", group_id: "67890", name?: "QR Bot" }
export const groupmeCreateBot = onRequest({ 
  region: REGION,
  cors: { origin: true },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    const { user_id, group_id, name } = await req.json().catch(() => req.body || {});
    if (!user_id || !group_id) return res.status(400).send("Missing user_id or group_id");

    const doc = await db.collection("groupme_tokens").doc(String(user_id)).get();
    if (!doc.exists) return res.status(404).send("No token on file");
    const { access_token } = doc.data();

    const callbackUrl = "https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeWebhook";

    const resp = await fetch("https://api.groupme.com/v3/bots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": access_token
      },
      body: JSON.stringify({
        bot: {
          name: name || "QRcallbox Bot",
          group_id: String(group_id),
          callback_url: callbackUrl
        }
      })
    });

    const json = await resp.json();
    if (!resp.ok) {
      logger.error("Create bot failed", { status: resp.status, json });
      return res.status(400).send("Failed to create bot");
    }

    // Store bot information for later use
    if (json.response?.bot) {
      await db.collection("groupme_bots").doc(json.response.bot.bot_id).set({
        bot_id: json.response.bot.bot_id,
        group_id: String(group_id),
        user_id: String(user_id),
        name: json.response.bot.name,
        createdAt: FieldValue.serverTimestamp()
      });
    }

    res.json(json);
  } catch (e) {
    logger.error(e);
    res.status(500).send("Error creating bot");
  }
});

// ===== 5) Generate QR token (mint function) =====
export const mint = onRequest({ 
  region: REGION,
  cors: { origin: true },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    const { store, area } = req.body || {};
    if (!store || !area) {
      return res.status(400).json({ error: "Missing store or area" });
    }

    // Validate store number
    if (!/^\d{3,6}$/.test(String(store).trim())) {
      return res.status(400).json({ error: "Store number must be 3-6 digits" });
    }

    // Validate area
    if (!/^[a-zA-Z0-9\s._-]{1,50}$/.test(String(area).trim())) {
      return res.status(400).json({ error: "Invalid area name" });
    }

    // Generate unique token
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    // Store token info
    await db.collection("qr_tokens").doc(token).set({
      store: String(store).trim(),
      area: String(area).trim(),
      token,
      createdAt: FieldValue.serverTimestamp(),
      scanned: false,
      scanCount: 0
    });

    res.json({ token });
  } catch (e) {
    logger.error("Mint error:", e);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// ===== 6) Handle QR scans (short URL redirect) =====
export const s = onRequest({ 
  region: REGION,
  cors: { origin: true },
  invoker: "public"
}, async (req, res) => {
  try {
    const token = req.query.t;
    if (!token) {
      return res.status(400).send("Missing token");
    }

    // Get token info
    const tokenDoc = await db.collection("qr_tokens").doc(token).get();
    if (!tokenDoc.exists) {
      return res.status(404).send("Invalid or expired QR code");
    }

    const tokenData = tokenDoc.data();
    
    // Update scan count
    await db.collection("qr_tokens").doc(token).update({
      scanned: true,
      scanCount: FieldValue.increment(1),
      lastScannedAt: FieldValue.serverTimestamp()
    });

    // Log the assistance request
    await db.collection("logs").add({
      store: tokenData.store,
      area: tokenData.area,
      token: token,
      ts: FieldValue.serverTimestamp(),
      userAgent: req.get('User-Agent') || '',
      ip: req.ip || req.connection.remoteAddress,
      // Response tracking fields
      respondedAt: null,
      responderName: null,
      responderUserId: null,
      responseText: null,
      responseTime: null,
      groupId: null
    });

    // Send GroupMe notification
    await sendGroupMeNotification(tokenData.store, tokenData.area);

    // Redirect to assistance page or show success message
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Assistance Requested</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { 
              font-family: system-ui, sans-serif; 
              text-align: center; 
              padding: 2rem; 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              min-height: 100vh;
              margin: 0;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            .container {
              background: rgba(255,255,255,0.95);
              color: #333;
              padding: 2rem;
              border-radius: 1rem;
              box-shadow: 0 8px 32px rgba(0,0,0,0.1);
              max-width: 400px;
            }
            h1 { color: #2563eb; margin-bottom: 1rem; }
            p { margin-bottom: 1rem; line-height: 1.6; }
            .success { color: #059669; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🛎️ Help is on the way!</h1>
            <p class="success">Your assistance request has been sent to store staff.</p>
            <p><strong>Store:</strong> ${tokenData.store}</p>
            <p><strong>Area:</strong> ${tokenData.area}</p>
            <p>A team member will be with you shortly. Thank you for your patience!</p>
          </div>
        </body>
      </html>
    `);
  } catch (e) {
    logger.error("QR scan error:", e);
    res.status(500).send("Error processing request");
  }
});

// ===== Helper: Send GroupMe notification =====
async function sendGroupMeNotification(store, area) {
  try {
    // Get all bots to find ones that should receive this notification
    const botsSnapshot = await db.collection("groupme_bots").get();
    
    for (const botDoc of botsSnapshot.docs) {
      const botData = botDoc.data();
      
      // Get the user's token to send message
      const tokenDoc = await db.collection("groupme_tokens").doc(botData.user_id).get();
      if (!tokenDoc.exists) continue;
      
      const { access_token } = tokenDoc.data();
      
      const message = `🛎️ Customer assistance needed!\n📍 Store: ${store}\n🏪 Area: ${area}\n⏰ Time: ${new Date().toLocaleTimeString()}`;
      
      // Send message via bot
      await fetch("https://api.groupme.com/v3/bots/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_id: botData.bot_id,
          text: message
        })
      });
    }
  } catch (e) {
    logger.error("GroupMe notification error:", e);
  }
}