import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";

// Import webhook handler
export { groupmeWebhook } from './groupme-webhook.js';

// ===== Secrets (set with `firebase functions:secrets:set ...`) =====
const GROUPME_CLIENT_ID = defineSecret("GROUPME_CLIENT_ID");
const API_KEY = defineSecret("API_KEY");
// GroupMe does not use client_secret for personal apps; omit if you don't have one.
// const GROUPME_CLIENT_SECRET = defineSecret("GROUPME_CLIENT_SECRET");

// ===== Admin SDK =====
initializeApp();
const db = getFirestore();

// Your deployed base URL/route you registered in GroupMe app settings
const REGION = "us-central1";
const BASE_CALLBACK = "https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeCallback";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://qrwebaccdb.web.app", 
  "https://qrwebaccdb.firebaseapp.com",
  "http://localhost:5173", // for development
  "http://localhost:4173"  // for preview
];

// Security helpers
function requiredQuery(req, key) {
  const v = req.query[key];
  if (!v) throw new Error(`Missing query param: ${key}`);
  return String(v);
}

// Validate API key
function validateApiKey(req) {
  const providedKey = req.headers['x-api-key'];
  const validKey = API_KEY.value().trim();
  return providedKey === validKey;
}

// Authenticate Firebase user
async function authenticateUser(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }
  
  const token = authHeader.substring(7);
  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    throw new Error('Invalid authentication token');
  }
}

// Check if user is admin
async function isAdmin(uid) {
  try {
    const userDoc = await db.collection('users').doc(uid).get();
    return userDoc.exists && userDoc.data().email === 'sinaptick@gmail.com';
  } catch (error) {
    return false;
  }
}

// Input sanitization
function sanitizeInput(input, maxLength = 100) {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, maxLength).replace(/[<>\"'&]/g, '');
}

// Rate limiting (simple in-memory store for demo - use Redis in production)
const rateLimitStore = new Map();
function checkRateLimit(ip, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }
  
  const requests = rateLimitStore.get(ip);
  // Remove old requests outside the window
  const validRequests = requests.filter(time => time > windowStart);
  
  if (validRequests.length >= maxRequests) {
    return false; // Rate limit exceeded
  }
  
  validRequests.push(now);
  rateLimitStore.set(ip, validRequests);
  return true;
}

// ===== 1) Start OAuth: redirect user to GroupMe authorize =====
export const groupmeStart = onRequest(
  { 
    region: REGION, 
    secrets: [GROUPME_CLIENT_ID],
    cors: { origin: ALLOWED_ORIGINS },
    invoker: "public"
  },
  async (req, res) => {
    try {
      // Rate limiting
      const clientIp = req.ip || req.connection.remoteAddress;
      if (!checkRateLimit(clientIp, 5, 60000)) {
        return res.status(429).send("Too many requests. Please try again later.");
      }

      // Optional: accept a `state` param you pass through (e.g., your userId)
      const state = req.query.state ? sanitizeInput(String(req.query.state), 50) : "";
      const clientId = GROUPME_CLIENT_ID.value().trim();

      const authorizeUrl =
        "https://oauth.groupme.com/oauth/authorize" +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(BASE_CALLBACK)}` +
        (state ? `&state=${encodeURIComponent(state)}` : "");

      res.redirect(authorizeUrl);
    } catch (e) {
      logger.error("OAuth start error:", e.message);
      res.status(400).send("Failed to start OAuth");
    }
  }
);

// ===== 2) OAuth callback: exchange code for access_token =====
export const groupmeCallback = onRequest(
  { 
    region: REGION, 
    secrets: [GROUPME_CLIENT_ID],
    cors: { origin: ALLOWED_ORIGINS },
    invoker: "public"
  },
  async (req, res) => {
    try {
      logger.info("GroupMe callback received");
      
      const code = requiredQuery(req, "code");
      const state = req.query.state ? sanitizeInput(String(req.query.state), 50) : "";
      const clientId = GROUPME_CLIENT_ID.value().trim();

      logger.info("Starting OAuth token exchange");

      // GroupMe token exchange - try both POST and GET methods
      const tokenParams = {
        client_id: clientId,
        redirect_uri: BASE_CALLBACK,
        code
      };

      // First try POST with form data
      let resp = await fetch("https://api.groupme.com/oauth/token", {
        method: "POST",
        headers: { 
          "Content-Type": "application/x-www-form-urlencoded",
          "Accept": "application/json",
          "User-Agent": "QRcallbox/1.0"
        },
        body: new URLSearchParams(tokenParams).toString()
      });

      // If POST fails with 500, try GET method (some OAuth providers prefer GET)
      if (!resp.ok && resp.status === 500) {
        logger.info("POST failed, trying GET method");
        const tokenUrl = `https://api.groupme.com/oauth/token?${new URLSearchParams(tokenParams).toString()}`;
        resp = await fetch(tokenUrl, {
          method: "GET",
          headers: { 
            "Accept": "application/json",
            "User-Agent": "QRcallbox/1.0"
          }
        });
      }

      const responseText = await resp.text();
      
      logger.info("GroupMe API response status:", resp.status);

      let data;
      try {
        data = JSON.parse(responseText);
        logger.info("Successfully parsed JSON response");
      } catch (parseError) {
        logger.error("Failed to parse GroupMe response as JSON");
        return res.status(400).send("Invalid response from GroupMe API");
      }

      if (!resp.ok || !data?.access_token) {
        logger.error("OAuth exchange failed");
        return res.status(400).send("OAuth exchange failed");
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
              if (window.opener && "${sanitizeInput(state, 50)}") {
                window.opener.localStorage.setItem("groupme_user_id_${sanitizeInput(state, 50)}", "${sanitizeInput(String(user_id), 20)}");
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
      logger.error("Callback error:", e.message);
      res.status(500).send("Error handling OAuth callback");
    }
  }
);

// ===== 3) List groups using stored token =====
export const groupmeGroups = onRequest({ 
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(clientIp)) {
      return res.status(429).send("Too many requests. Please try again later.");
    }

    // Authenticate user
    const decodedToken = await authenticateUser(req);
    
    const groupmeUserId = requiredQuery(req, "user_id");
    
    // Verify user owns this GroupMe account or is admin
    const userTokenDoc = await db.collection("groupme_tokens").doc(groupmeUserId).get();
    if (!userTokenDoc.exists) {
      return res.status(404).send("No token on file");
    }
    
    const tokenData = userTokenDoc.data();
    if (tokenData.firebase_uid !== decodedToken.uid && !(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Access denied");
    }

    const { access_token } = tokenData;

    const resp = await fetch(
      "https://api.groupme.com/v3/groups?per_page=100&page=1",
      { headers: { "X-Access-Token": access_token } }
    );
    const json = await resp.json();

    if (!resp.ok) {
      logger.error("Group list failed");
      return res.status(400).send("Failed to fetch groups");
    }

    res.json(json);
  } catch (e) {
    logger.error("Groups error:", e.message);
    if (e.message.includes('Invalid authentication')) {
      return res.status(401).send("Authentication required");
    }
    res.status(500).send("Error listing groups");
  }
});

// ===== 4) Create a bot in a group =====
export const groupmeCreateBot = onRequest({ 
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(clientIp)) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user
    const decodedToken = await authenticateUser(req);
    
    const { user_id, group_id, name } = await req.json().catch(() => req.body || {});
    if (!user_id || !group_id) return res.status(400).send("Missing user_id or group_id");
    
    // Sanitize inputs
    const sanitizedName = sanitizeInput(name || "QRcallbox Bot", 50);
    const sanitizedGroupId = sanitizeInput(String(group_id), 20);
    
    // Verify user owns this GroupMe account
    const userTokenDoc = await db.collection("groupme_tokens").doc(String(user_id)).get();
    if (!userTokenDoc.exists) {
      return res.status(404).send("No token on file");
    }
    
    const tokenData = userTokenDoc.data();
    if (tokenData.firebase_uid !== decodedToken.uid && !(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Access denied");
    }

    const { access_token } = tokenData;

    const callbackUrl = "https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeWebhook";

    const resp = await fetch("https://api.groupme.com/v3/bots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": access_token
      },
      body: JSON.stringify({
        bot: {
          name: sanitizedName,
          group_id: sanitizedGroupId,
          callback_url: callbackUrl
        }
      })
    });

    const json = await resp.json();
    if (!resp.ok) {
      logger.error("Create bot failed");
      return res.status(400).send("Failed to create bot");
    }

    // Store bot information for later use
    if (json.response?.bot) {
      await db.collection("groupme_bots").doc(json.response.bot.bot_id).set({
        bot_id: json.response.bot.bot_id,
        group_id: sanitizedGroupId,
        user_id: String(user_id),
        name: json.response.bot.name,
        createdAt: FieldValue.serverTimestamp()
      });
    }

    res.json(json);
  } catch (e) {
    logger.error("Create bot error:", e.message);
    if (e.message.includes('Invalid authentication')) {
      return res.status(401).send("Authentication required");
    }
    res.status(500).send("Error creating bot");
  }
});

// ===== 5) Generate QR token (mint function) =====
export const mint = onRequest({ 
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public",
  secrets: [API_KEY]
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(clientIp)) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    
    // Validate API key
    if (!validateApiKey(req)) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    
    const { store, area } = req.body || {};
    if (!store || !area) {
      return res.status(400).json({ error: "Missing store or area" });
    }

    // Sanitize and validate inputs
    const sanitizedStore = sanitizeInput(String(store), 10);
    const sanitizedArea = sanitizeInput(String(area), 50);
    
    if (!/^\d{3,6}$/.test(sanitizedStore)) {
      return res.status(400).json({ error: "Store number must be 3-6 digits" });
    }

    if (!/^[a-zA-Z0-9\s._-]{1,50}$/.test(sanitizedArea)) {
      return res.status(400).json({ error: "Invalid area name" });
    }

    // Generate unique token
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    // Store token info
    await db.collection("qr_tokens").doc(token).set({
      store: sanitizedStore,
      area: sanitizedArea,
      token,
      createdAt: FieldValue.serverTimestamp(),
      scanned: false,
      scanCount: 0
    });

    res.json({ token });
  } catch (e) {
    logger.error("Mint error:", e.message);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// ===== 6) Handle QR scans (short URL redirect) =====
export const s = onRequest({ 
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(clientIp, 20, 60000)) { // Higher limit for QR scans
      return res.status(429).send("Too many requests. Please try again later.");
    }

    const token = sanitizeInput(req.query.t || '', 50);
    if (!token) {
      return res.status(400).send("Missing or invalid token");
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
      ip: req.ip || req.socket.remoteAddress,
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
            <p><strong>Store:</strong> ${sanitizeInput(tokenData.store, 10)}</p>
            <p><strong>Area:</strong> ${sanitizeInput(tokenData.area, 50)}</p>
            <p>A team member will be with you shortly. Thank you for your patience!</p>
          </div>
        </body>
      </html>
    `);
  } catch (e) {
    logger.error("QR scan error:", e.message);
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
      
      const message = `🛎️ Customer assistance needed!\\n📍 Store: ${sanitizeInput(store, 10)}\\n🏪 Area: ${sanitizeInput(area, 50)}\\n⏰ Time: ${new Date().toLocaleTimeString()}`;
      
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
    logger.error("GroupMe notification error:", e.message);
  }
}