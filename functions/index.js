import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";

import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { beforeUserCreated } from "firebase-functions/v2/identity";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";
import sgMail from "@sendgrid/mail";

// Import webhook handler and automation functions
export { groupmeWebhook } from './groupme-webhook.js';
export { workvivoConnect, workvivoConfig, workvivoDisconnect, workvivoCheckCompletion, connectWithToken, checkWorkvivoTokens, testReauthEmail, pollWorkvivoReply } from './workvivo-automation.js';
// workvivo-monitor.js does not exist in this tree — leave disabled.
// export { workvivoMonitor } from './workvivo-monitor.js';
export { submitTicket, getTickets, getMyTickets, getTicketDetails, respondToTicket, handleEmailReply, lookupTicket, updateTicketPriority } from './tickets.js';
export { monitorStoresWithoutBots, monitorBotDeletions, checkBotsManually } from './bot-monitor.js';
export { logScanMetrics } from './metrics-logger.js';
import { postToWorkvivo, ENCRYPT_KEY as WORKVIVO_ENCRYPT_KEY, RESEND_KEY as WORKVIVO_RESEND_KEY } from './workvivo-automation.js';

// ===== Secrets (set with `firebase functions:secrets:set ...`) =====
const GROUPME_CLIENT_ID = defineSecret("GROUPME_CLIENT_ID");
const API_KEY = defineSecret("API_KEY");
// GroupMe doesn't use client_secret for user applications

// ===== Admin SDK =====
// Guard against double-init: workvivo-automation.js (imported above) may have
// already called initializeApp() during its module load.
if (!getApps().length) initializeApp();
const db = getFirestore();
const storage = getStorage();

// Your deployed base URL/route you registered in GroupMe app settings
const REGION = "us-central1";
// Use direct Cloud Function URL to avoid SSL issues with custom domain
const BASE_CALLBACK = "https://groupmecallback-46us5rurra-uc.a.run.app";

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  "https://qrcallbox.com",
  "https://www.qrcallbox.com",
  "https://qrwebaccdb.web.app",
  "https://qrwebaccdb.firebaseapp.com",
  "https://managerchecklist.web.app", // checklist app
  "https://managerchecklist.firebaseapp.com",
  "http://localhost:5173", // for development
  "http://localhost:4173"  // for preview
];

// Location map cache - fetches from Firestore qr_locations collection
let locationMapCache = null;
let locationMapLastFetch = 0;
const LOCATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getLocationMap() {
  const now = Date.now();
  if (locationMapCache && (now - locationMapLastFetch) < LOCATION_CACHE_TTL) {
    return locationMapCache;
  }
  
  try {
    const snapshot = await db.collection("qr_locations").get();
    const map = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.active !== false) {
        map[doc.id] = data.name;
      }
    });
    locationMapCache = map;
    locationMapLastFetch = now;
    logger.info("Refreshed location map cache", { count: Object.keys(map).length });
    return map;
  } catch (error) {
    logger.error("Failed to fetch location map", { error: error.message });
    // Return cached version if available, otherwise empty
    return locationMapCache || {};
  }
}

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

// Check if user is admin (using Custom Claims ONLY for security)
// SECURITY: No email fallback - requires admin claim to be set via set-admin-claim.js
async function isAdmin(uid) {
  try {
    const user = await getAuth().getUser(uid);
    return user.customClaims?.admin === true;
  } catch (error) {
    logger.error('Error checking admin status:', error);
    return false;
  }
}

// Input sanitization
function sanitizeInput(input, maxLength = 100) {
  if (typeof input !== 'string') return '';
  return input.trim().substring(0, maxLength).replace(/[<>\"'&]/g, '');
}

// Enhanced spam protection with IP blocking
// Rate limiting now uses Firestore - see checkRateLimit function
// Suspicious activity tracking now uses Firestore

// Check if IP is blocked in Firestore
async function isIPBlocked(ip) {
  try {
    const blockedDoc = await db.collection('blocked_ips').doc(ip).get();
    if (blockedDoc.exists) {
      const data = blockedDoc.data();
      // Check if block has expired
      if (data.expiresAt && data.expiresAt.toMillis() < Date.now()) {
        await db.collection('blocked_ips').doc(ip).delete();
        return false;
      }
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error checking blocked IP:', error);
    return false;
  }
}

// Track suspicious activity in Firestore and auto-block repeat offenders
async function trackSuspiciousActivity(ip, reason) {
  const now = Date.now();
  const oneHourAgo = new Date(now - 3600000);
  
  try {
    // Get recent violations from Firestore
    const recentViolations = await db.collection("rate_limit_violations")
      .where("ip", "==", ip)
      .where("timestamp", ">=", oneHourAgo)
      .get();
    
    // Add new violation
    await db.collection("rate_limit_violations").add({
      ip,
      reason,
      timestamp: FieldValue.serverTimestamp()
    });
    
    const violationCount = recentViolations.size + 1;
    
    // Auto-block after 5 violations in an hour
    if (violationCount >= 5) {
      await db.collection("blocked_ips").doc(ip).set({
        ip,
        blockedAt: FieldValue.serverTimestamp(),
        reason: "Auto-blocked: Multiple rate limit violations",
        violations: violationCount,
        expiresAt: new Date(now + 24 * 60 * 60 * 1000),
        autoBlocked: true
      });
      
      await db.collection("spam_logs").add({
        ip,
        timestamp: FieldValue.serverTimestamp(),
        action: "auto_blocked",
        violations: violationCount,
        reason: reason
      });
      
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error("Error tracking suspicious activity:", error);
    return false;
  }
}

// Firestore-based rate limiting with persistence across cold starts
async function checkRateLimit(ip, maxRequests = 10, windowMs = 60000) {
  // First check if IP is blocked
  if (await isIPBlocked(ip)) {
    return { allowed: false, reason: "blocked" };
  }
  
  const now = Date.now();
  const windowStart = new Date(now - windowMs);
  const rateLimitDocId = ip.replace(/\./g, "_"); // Firestore doc IDs cant have dots
  
  try {
    const rateLimitRef = db.collection("rate_limits").doc(rateLimitDocId);
    
    // Use transaction for atomic read-modify-write
    const result = await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(rateLimitRef);
      
      let requests = [];
      if (doc.exists) {
        const data = doc.data();
        requests = (data.requests || []).filter(t => t > windowStart.getTime());
      }
      
      if (requests.length >= maxRequests) {
        return { allowed: false, reason: "rate_limit", count: requests.length };
      }
      
      requests.push(now);
      
      transaction.set(rateLimitRef, {
        ip,
        requests,
        updatedAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(now + windowMs * 2)
      });
      
      return { allowed: true, count: requests.length };
    });
    
    if (!result.allowed && result.reason === "rate_limit") {
      await trackSuspiciousActivity(ip, "Rate limit exceeded: " + result.count + " requests");
    }
    
    return result;
  } catch (error) {
    logger.error("Error checking rate limit:", error);
    return { allowed: true }; // Fail open
  }
}

// ===== Block Google Sign-In =====
// This blocking function prevents users from creating accounts with Google
export const blockGoogleSignIn = beforeUserCreated((event) => {
  const user = event.data;

  // Check if user is signing in with Google
  const isGoogleProvider = user.providerData?.some(
    provider => provider.providerId === 'google.com'
  );

  if (isGoogleProvider) {
    logger.warn('Blocked Google sign-in attempt', {
      email: user.email,
      uid: user.uid
    });

    throw new HttpsError(
      'permission-denied',
      'Google sign-in is currently disabled. Please create an account using email and password.'
    );
  }

  // Allow non-Google sign-ins to proceed
  return;
});

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
      const clientIp = req.ip || req.socket.remoteAddress;
      if (!checkRateLimit(clientIp, 5, 60000)) {
        return res.status(429).send("Too many requests. Please try again later.");
      }

      // Optional: accept a `state` param you pass through (e.g., your userId)
      const state = req.query.state ? sanitizeInput(String(req.query.state), 50) : "";
      const clientId = GROUPME_CLIENT_ID.value().trim();
      
      // Check if force_login is requested for fresh authentication
      const forceLogin = req.query.force_login === 'true';

      // GroupMe OAuth - Use Authorization Code flow with cache busting
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2);
      const clientTimestamp = req.query.t || timestamp;
      const clientRandom = req.query.r || randomId;
      
      // Build authorize URL with aggressive cache-busting parameters
      let authorizeUrl = `https://oauth.groupme.com/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(BASE_CALLBACK)}`;
      
      if (state) {
        authorizeUrl += `&state=${encodeURIComponent(state)}`;
      }
      
      // Add cache busting and fresh login parameters
      authorizeUrl += `&_t=${timestamp}&_r=${randomId}&ct=${clientTimestamp}&cr=${clientRandom}`;
      
      if (forceLogin) {
        authorizeUrl += `&force_login=1&fresh=1`;
      }

      // Set headers to prevent caching of the OAuth redirect
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      logger.info("Redirecting to GroupMe OAuth", { 
        authorizeUrl: authorizeUrl.substring(0, 100) + "...", 
        timestamp, 
        forceLogin,
        state: state.substring(0, 10) + "..."
      });
      res.redirect(authorizeUrl);
    } catch (e) {
      logger.error("OAuth start error:", e.message);
      res.status(400).send("Failed to start OAuth");
    }
  }
);

// ===== 2) OAuth callback: handle GroupMe Implicit Grant Flow =====
export const groupmeCallback = onRequest(
  { 
    region: REGION, 
    cors: { origin: ALLOWED_ORIGINS },
    invoker: "public"
  },
  async (req, res) => {
    try {
      logger.info("GroupMe callback received", { query: req.query });
      
      // GroupMe Implicit Grant Flow returns access_token in URL fragment, handle with client-side JS
      const state = req.query.state ? sanitizeInput(String(req.query.state), 50) : "";
      
      logger.info("Rendering callback page to handle GroupMe Implicit Grant Flow");

      // Send HTML page that handles implicit flow client-side
      res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>GroupMe OAuth</title>
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
              .error { color: #dc2626; font-weight: 600; }
              .loading { color: #f59e0b; font-weight: 600; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1 id="title">Processing...</h1>
              <p id="message" class="loading">Connecting your GroupMe account...</p>
            </div>
            
            <script>
              async function handleOAuth() {
                try {
                  // GroupMe OAuth - handle both Implicit Grant (token) and Authorization Code flows
                  const fragment = window.location.hash.substring(1);
                  const query = window.location.search.substring(1);
                  const fragmentParams = new URLSearchParams(fragment);
                  const queryParams = new URLSearchParams(query);

                  // Check for access token first (Implicit Grant Flow)
                  let accessToken = fragmentParams.get('access_token') || fragmentParams.get('token');
                  if (!accessToken) {
                    // Fallback to query parameters
                    accessToken = queryParams.get('access_token') || queryParams.get('token');
                  }

                  // Check for authorization code (Authorization Code Flow)
                  const authCode = queryParams.get('code') || fragmentParams.get('code');

                  const error = fragmentParams.get('error') || queryParams.get('error');
                  const errorDescription = fragmentParams.get('error_description') || queryParams.get('error_description');
                  const state = "${sanitizeInput(state, 50)}";

                  // Check for OAuth error first
                  if (error) {
                    throw new Error(errorDescription || 'Authorization was denied');
                  }

                  // If we have an authorization code but no access token, handle it server-side
                  if (authCode && !accessToken) {
                    // Send auth code to our backend for processing (avoids CORS issues)
                    const exchangeResponse = await fetch('https://groupmeexchangecode-46us5rurra-uc.a.run.app', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                      },
                      body: JSON.stringify({ code: authCode, state: state }),
                      mode: 'cors'
                    });

                    if (exchangeResponse.ok) {
                      const tokenData = await exchangeResponse.json();
                      accessToken = tokenData.access_token;
                    } else {
                      throw new Error('Failed to process authorization. Please try again.');
                    }
                  }

                  if (!accessToken) {
                    throw new Error('No authorization received from GroupMe. Please try again.');
                  }

                  // Validate token and get user info
                  const response = await fetch(\`https://api.groupme.com/v3/users/me?token=\${encodeURIComponent(accessToken)}\`);

                  if (!response.ok) {
                    throw new Error('Failed to validate authorization. Please try again.');
                  }

                  const userData = await response.json();
                  const userId = userData.response?.id;

                  if (!userId) {
                    throw new Error('Failed to get user information from GroupMe');
                  }

                  // Store token in Firestore via our backend
                  const storeResponse = await fetch('https://groupmestoretoken-46us5rurra-uc.a.run.app', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      access_token: accessToken,
                      user_id: userId,
                      state: state
                    })
                  });

                  if (!storeResponse.ok) {
                    throw new Error('Failed to save connection. Please try again.');
                  }

                  await storeResponse.json();
                  
                  // Success!
                  document.getElementById('title').textContent = 'GroupMe Connected!';
                  document.getElementById('message').innerHTML = '<span class="success">Your GroupMe account has been successfully connected.</span><br>You can now close this window and return to the app.';
                  
                  // Store in local storage (this window's storage)
                  if (state && userId) {
                    localStorage.setItem(\`groupme_user_id_\${state}\`, userId);
                    localStorage.setItem('groupme_last_connection', JSON.stringify({
                      userId: userId,
                      state: state,
                      timestamp: Date.now()
                    }));
                  }
                  
                  // Notify parent window using postMessage (works cross-origin)
                  if (window.opener) {
                    window.opener.postMessage({ 
                      type: 'groupme_connected', 
                      userId: userId, 
                      state: state 
                    }, 'https://qrcallbox.com');
                    document.getElementById('message').innerHTML += '<br><br><em>Connection successful! You can close this window and return to the app.</em>';
                    
                    // Auto-close after 3 seconds on success
                    setTimeout(() => {
                      window.close();
                    }, 3000);
                  }
                  
                } catch (error) {
                  document.getElementById('title').textContent = 'Connection Failed';
                  document.getElementById('message').innerHTML = \`<span class="error">\${error.message}</span><br><br>Please close this window and try again.\`;
                }
              }
              
              // Start OAuth handling
              handleOAuth();
            </script>
          </body>
        </html>
      `);
    } catch (e) {
      logger.error("Callback error:", e.message);
      res.status(500).send("Error handling OAuth callback");
    }
  }
);

// ===== 3) Authorization code exchange for GroupMe OAuth =====
export const groupmeExchangeCode = onRequest({ 
  region: REGION,
  secrets: [GROUPME_CLIENT_ID],
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    const { code, state } = req.body;
    if (!code) return res.status(400).send("Missing authorization code");
    
    logger.info("Processing GroupMe authorization code", { 
      codeStart: code.substring(0, 10) + "...", 
      state 
    });
    
    // Exchange authorization code for access token
    const clientId = GROUPME_CLIENT_ID.value().trim();
    
    try {
      // GroupMe token exchange endpoint (without client_secret for user apps)
      const tokenResponse = await fetch('https://oauth.groupme.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          client_id: clientId,
          redirect_uri: BASE_CALLBACK
        }).toString()
      });
      
      logger.info("Token exchange response", { status: tokenResponse.status });
      
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        logger.info("Token exchange successful", { hasAccessToken: !!tokenData.access_token });
        
        // Get user info with the new token
        const userResponse = await fetch(`https://api.groupme.com/v3/users/me?token=${tokenData.access_token}`);
        const userData = await userResponse.json();
        
        return res.json({ 
          access_token: tokenData.access_token,
          user_id: userData.response?.id,
          expires_in: tokenData.expires_in
        });
      } else {
        const errorText = await tokenResponse.text();
        logger.error("Token exchange failed", { status: tokenResponse.status, error: errorText });
        
        // Fallback: Try using the code directly (some GroupMe apps allow this)
        const directResponse = await fetch(`https://api.groupme.com/v3/users/me?token=${code}`);
        if (directResponse.ok) {
          const userData = await directResponse.json();
          logger.info("Fallback: Code works as token directly");
          return res.json({ 
            access_token: code,
            user_id: userData.response?.id 
          });
        }
        
        return res.status(400).json({ 
          error: "Token exchange failed",
          message: errorText,
          status: tokenResponse.status
        });
      }
    } catch (error) {
      logger.error("Token exchange error", { error: error.message });
      return res.status(500).json({ 
        error: "Token exchange failed",
        message: error.message
      });
    }
    
  } catch (e) {
    logger.error("Code exchange error:", e.message, e.stack);
    res.status(500).json({ error: "Failed to process authorization. Please try again." });
  }
});

// ===== 4) Store token endpoint for implicit flow =====
export const groupmeStoreToken = onRequest({ 
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    logger.info("Store token request received", { 
      method: req.method, 
      hasBody: !!req.body,
      headers: Object.keys(req.headers)
    });
    
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    const { access_token, user_id, state } = req.body;
    logger.info("Store token request data", { 
      hasAccessToken: !!access_token,
      user_id: user_id,
      state: state
    });
    
    if (!access_token || !user_id) {
      logger.error("Missing required fields", { hasAccessToken: !!access_token, hasUserId: !!user_id });
      return res.status(400).send("Missing access_token or user_id");
    }
    
    // Sanitize inputs
    const sanitizedUserId = sanitizeInput(String(user_id), 20);
    const sanitizedState = state ? sanitizeInput(String(state), 50) : null;
    logger.info("Sanitized data", { sanitizedUserId, sanitizedState });
    
    // Store the token
    logger.info("Attempting to store token in Firestore");
    await db.collection("groupme_tokens").doc(sanitizedUserId).set(
      {
        access_token,
        user_id: sanitizedUserId,
        firebase_uid: sanitizedState || null,
        state: sanitizedState || null,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    
    logger.info("GroupMe token stored successfully", { userId: sanitizedUserId });
    res.json({ success: true });
    
  } catch (e) {
    logger.error("Store token error:", e.message, e.stack);
    res.status(500).send("Failed to save connection. Please try again.");
  }
});

// ===== 4) List groups using stored token =====
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
    logger.info("Authenticating user...");
    const decodedToken = await authenticateUser(req);
    logger.info("User authenticated", { uid: decodedToken.uid });
    
    const { user_id, group_id, name } = req.body || {};
    logger.info("Bot creation request", { user_id, group_id, name });
    if (!user_id || !group_id) return res.status(400).send("Missing user_id or group_id");
    
    // Sanitize inputs
    const sanitizedName = sanitizeInput(name || "CallBot", 50);
    const sanitizedGroupId = sanitizeInput(String(group_id), 20);
    logger.info("Sanitized inputs", { sanitizedName, sanitizedGroupId });
    
    // Verify user owns this GroupMe account
    logger.info("Looking up GroupMe token", { user_id });
    const userTokenDoc = await db.collection("groupme_tokens").doc(String(user_id)).get();
    if (!userTokenDoc.exists) {
      logger.error("No GroupMe token found", { user_id });
      return res.status(404).send("No token on file");
    }
    
    const tokenData = userTokenDoc.data();
    logger.info("Token data found", { 
      firebase_uid: tokenData.firebase_uid,
      decodedUid: decodedToken.uid,
      hasAccessToken: !!tokenData.access_token
    });
    
    if (tokenData.firebase_uid !== decodedToken.uid && !(await isAdmin(decodedToken.uid))) {
      logger.error("Access denied", { 
        tokenFirebaseUid: tokenData.firebase_uid,
        decodedUid: decodedToken.uid
      });
      return res.status(403).send("Access denied");
    }

    const { access_token } = tokenData;
    logger.info("Using access token", { hasToken: !!access_token });

    // Get user's store number for unique callback URL
    const userDoc = await db.collection("users").doc(decodedToken.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const defaultStoreNumber = userData.storeNumber || userData.homeStore || "default";
    
    // Check if admin is overriding the store number
    const { admin_store_override } = req.body || {};
    let finalStoreNumber = defaultStoreNumber;
    
    if (admin_store_override && await isAdmin(decodedToken.uid)) {
      const sanitizedOverride = sanitizeInput(String(admin_store_override), 10);
      if (/^\d{3,6}$/.test(sanitizedOverride)) {
        finalStoreNumber = sanitizedOverride;
        logger.info("Admin override detected", { 
          admin_uid: decodedToken.uid,
          original_store: defaultStoreNumber,
          override_store: finalStoreNumber
        });
      }
    }
    
    // Create unique callback URL using final store number, group ID, and timestamp to avoid conflicts
    const uniqueId = `${finalStoreNumber}_${Date.now().toString(36)}`;
    const callbackUrl = `https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeWebhook?group_id=${sanitizedGroupId}&uid=${uniqueId}`;
    logger.info("Using unique callback URL to avoid conflicts", { callbackUrl, uniqueId, storeNumber: finalStoreNumber });
    
    // Check for existing bots in this group for this user and delete them to prevent callback URL conflicts
    logger.info("Checking for existing bots in group", { group_id: sanitizedGroupId, user_id });
    try {
      const existingBotsSnapshot = await db.collection("groupme_bots")
        .where("user_id", "==", String(user_id))
        .where("group_id", "==", sanitizedGroupId)
        .get();
      
      if (!existingBotsSnapshot.empty) {
        logger.info(`Found ${existingBotsSnapshot.size} existing bots in group, deleting them first`);
        
        for (const botDoc of existingBotsSnapshot.docs) {
          const botData = botDoc.data();
          logger.info("Deleting existing bot", { bot_id: botData.bot_id, name: botData.name });
          
          try {
            // Delete from GroupMe API
            const deleteResp = await fetch(`https://api.groupme.com/v3/bots/destroy`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Access-Token": access_token
              },
              body: JSON.stringify({ bot_id: botData.bot_id })
            });
            
            if (deleteResp.ok) {
              logger.info("Bot deleted from GroupMe API", { bot_id: botData.bot_id });
            } else {
              logger.warn("Failed to delete bot from GroupMe API", { 
                bot_id: botData.bot_id, 
                status: deleteResp.status 
              });
            }
            
            // Delete from our database regardless of API response
            await db.collection("groupme_bots").doc(botData.bot_id).delete();
            logger.info("Bot deleted from database", { bot_id: botData.bot_id });
            
          } catch (deleteError) {
            logger.error("Error deleting existing bot", { 
              bot_id: botData.bot_id, 
              error: deleteError.message 
            });
            // Continue with creation even if deletion fails
          }
        }
      }
    } catch (checkError) {
      logger.warn("Error checking for existing bots", { error: checkError.message });
      // Continue with creation even if check fails
    }
    
    const botRequest = {
      bot: {
        name: sanitizedName,
        group_id: sanitizedGroupId,
        callback_url: callbackUrl
      }
    };
    
    logger.info("Calling GroupMe API to create bot", { botRequest });

    const resp = await fetch("https://api.groupme.com/v3/bots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": access_token
      },
      body: JSON.stringify(botRequest)
    });

    logger.info("GroupMe API response", { status: resp.status, statusText: resp.statusText });
    const json = await resp.json();
    logger.info("GroupMe API response body", { json });
    
    if (!resp.ok) {
      logger.error("Create bot failed", { status: resp.status, json });
      // If we still get a callback URL conflict, provide a helpful error message
      if (json?.meta?.errors?.some(error => error.includes("already registered"))) {
        return res.status(400).send(`Failed to create bot: A bot with this callback URL already exists in the group. Please try refreshing the page and try again, or contact support if the issue persists.`);
      }
      return res.status(400).send(`Failed to create bot: ${JSON.stringify(json)}`);
    }

    // Store bot information for later use
    if (json.response?.bot) {
      // Get user's store number from their profile
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      const userData = userDoc.exists ? userDoc.data() : {};
      
      // Determine store based on user's access level
      let userStore = null;
      if (userData.access === 'store' && userData.storeNumber) {
        // Store-level users use their assigned store number
        userStore = userData.storeNumber;
      } else if (['market', 'region', 'business_unit'].includes(userData.access) && userData.homeStore) {
        // Market/Region/BU users use their selected home store
        userStore = userData.homeStore;
      }
      
      const groupName = json.response.bot.group_name || "";
      
      // Extract store number from group name for better accuracy
      const storeMatch = groupName.match(/^(\d{3,4})\s/);
      const groupStore = storeMatch ? storeMatch[1] : null;
      
      // Priority: admin override > group name extraction > user's default store
      const botStoreNumber = finalStoreNumber !== defaultStoreNumber ? finalStoreNumber : (groupStore || defaultStoreNumber);
      
      await db.collection("groupme_bots").doc(json.response.bot.bot_id).set({
        bot_id: json.response.bot.bot_id,
        group_id: sanitizedGroupId,
        user_id: String(user_id),
        name: json.response.bot.name,
        store: botStoreNumber,
        group_name: groupName, // Store group name for reference
        firebase_uid: decodedToken.uid,
        createdAt: FieldValue.serverTimestamp(),
        // Track admin overrides
        ...(finalStoreNumber !== defaultStoreNumber && {
          admin_store_override: true,
          original_user_store: defaultStoreNumber
        })
      });
    }

    res.json(json);
  } catch (e) {
    logger.error("Create bot error:", e.message, e.stack);
    if (e.message.includes('Invalid authentication')) {
      return res.status(401).send("Authentication required");
    }
    // More specific error message for debugging
    res.status(500).send("Failed to create bot. Please try again.");
  }
});

// ===== 3c) Sync missing bots from GroupMe API to database =====
export const groupmeSyncBots = onRequest({ 
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
    
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).send("Missing user_id");
    
    // Verify user owns this GroupMe account
    const userTokenDoc = await db.collection("groupme_tokens").doc(String(user_id)).get();
    if (!userTokenDoc.exists) {
      return res.status(404).send("No token on file");
    }
    
    const tokenData = userTokenDoc.data();
    if (tokenData.firebase_uid !== decodedToken.uid && !(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Access denied");
    }
    
    const isDebugMode = req.body?.debug === true || req.query?.debug === "true";
    logger.info("Starting bot sync with detailed debugging", { user_id, firebase_uid: decodedToken.uid, debug_mode: isDebugMode });
    
    // Get bots from GroupMe API
    const groupmeResponse = await fetch(`https://api.groupme.com/v3/bots?token=${tokenData.access_token}`);
    if (!groupmeResponse.ok) {
      logger.error("Failed to fetch bots from GroupMe API", { status: groupmeResponse.status });
      return res.status(500).send("Failed to fetch bots from GroupMe");
    }
    
    const groupmeData = await groupmeResponse.json();
    const groupmeBots = groupmeData.response || [];

    // Get groups for debug info if in debug mode
    let groups = [];
    if (isDebugMode) {
      try {
        const groupsResponse = await fetch(`https://api.groupme.com/v3/groups?token=${tokenData.access_token}`);
        if (groupsResponse.ok) {
          const groupsData = await groupsResponse.json();
          groups = (groupsData.response || []).map(g => ({
            id: g.id,
            name: g.name,
            members_count: g.members ? g.members.length : 0
          }));
        }
      } catch (e) {
        logger.warn("Failed to fetch groups for debug", { error: e.message });
      }
    }
    
    // Get existing bots from our database
    const botsSnapshot = await db.collection("groupme_bots")
      .where("user_id", "==", String(user_id))
      .get();
    
    const existingBotIds = new Set();
    botsSnapshot.forEach(doc => {
      const data = doc.data();
      existingBotIds.add(data.bot_id);
    });
    
    // Find missing bots and sync them
    let syncedCount = 0;
    for (const groupmeBot of groupmeBots) {
      if (!existingBotIds.has(groupmeBot.bot_id)) {
        // This bot exists in GroupMe but not in our database - add it
        logger.info("Syncing missing bot to database", { 
          bot_id: groupmeBot.bot_id, 
          name: groupmeBot.name,
          group_id: groupmeBot.group_id,
          group_name: groupmeBot.group_name,
          callback_url: groupmeBot.callback_url
        });
        
        // Get user's store number from their profile
        const userDoc = await db.collection("users").doc(decodedToken.uid).get();
        const userData = userDoc.exists ? userDoc.data() : {};
        
        // Extract store number from group name (e.g., "2988 Call Box Chat" -> "2988")
        const groupName = groupmeBot.group_name || "";
        const storeMatch = groupName.match(/^(\d{3,4})\s/);
        const groupStore = storeMatch ? storeMatch[1] : null;
        
        logger.info("Extracted store info", {
          groupName,
          storeMatch: storeMatch ? storeMatch[0] : null,
          groupStore,
          userStoreNumber: userData.storeNumber
        });
        
        // Sanitize bot_id for Firestore document ID (remove invalid characters)
        const sanitizedBotId = groupmeBot.bot_id.replace(/[^a-zA-Z0-9_-]/g, '_');
        
        logger.info("About to write bot to database", {
          sanitizedBotId,
          originalBotId: groupmeBot.bot_id,
          store: groupStore || userData.storeNumber || null,
          firebase_uid: decodedToken.uid
        });
        
        try {
          await db.collection("groupme_bots").doc(sanitizedBotId).set({
            bot_id: groupmeBot.bot_id,
            group_id: groupmeBot.group_id,
            user_id: String(user_id),
            name: groupmeBot.name,
            store: groupStore || userData.storeNumber || null, // Use group's store number for notifications
            firebase_uid: decodedToken.uid,
            createdAt: FieldValue.serverTimestamp(),
            synced: true // Mark as synced from GroupMe API
          });
          
          logger.info("Successfully wrote bot to database", { sanitizedBotId });
          syncedCount++;
        } catch (writeError) {
          logger.error("Failed to write bot to database", {
            error: writeError.message,
            sanitizedBotId,
            originalBotId: groupmeBot.bot_id,
            writeError
          });
          throw writeError;
        }
      }
    }
    
    // Also fix store numbers for existing bots based on group names
    let fixedCount = 0;
    for (const groupmeBot of groupmeBots) {
      // Extract store number from group name (e.g., "2988 Call Box Chat" -> "2988")
      const groupName = groupmeBot.group_name || "";
      const storeMatch = groupName.match(/^(\d{3,4})\s/);
      const groupStore = storeMatch ? storeMatch[1] : null;
      
      if (groupStore) {
        // Find existing bot document
        const existingBotQuery = await db.collection("groupme_bots")
          .where("bot_id", "==", groupmeBot.bot_id)
          .where("firebase_uid", "==", decodedToken.uid)
          .get();
          
        existingBotQuery.forEach(async (doc) => {
          const botData = doc.data();
          if (botData.store !== groupStore) {
            logger.info("Fixing store number for bot", {
              bot_id: groupmeBot.bot_id,
              group_name: groupName,
              old_store: botData.store,
              new_store: groupStore
            });
            
            try {
              await doc.ref.update({
                store: groupStore,
                updatedAt: FieldValue.serverTimestamp()
              });
              fixedCount++;
            } catch (updateError) {
              logger.error("Failed to update bot store number", {
                error: updateError.message,
                bot_id: groupmeBot.bot_id
              });
            }
          }
        });
      }
    }
    
    logger.info("Bot sync completed", { synced_count: syncedCount, fixed_count: fixedCount });
    
    const response = { 
      success: true, 
      synced: syncedCount,
      fixed: fixedCount,
      total_groupme_bots: groupmeBots.length,
      total_database_bots: botsSnapshot.size
    };

    // Add debug info if requested
    if (isDebugMode) {
      const databaseBots = [];
      botsSnapshot.forEach(doc => {
        const data = doc.data();
        databaseBots.push({
          id: doc.id,
          bot_id: data.bot_id,
          group_id: data.group_id,
          name: data.name,
          store: data.store
        });
      });

      response.debug_info = {
        total_groupme_bots: groupmeBots.length,
        total_database_bots: botsSnapshot.size,
        groups_count: groups.length,
        groupme_bots: groupmeBots.map(bot => ({
          bot_id: bot.bot_id,
          group_id: bot.group_id,
          name: bot.name,
          callback_url: bot.callback_url
        })),
        database_bots: databaseBots,
        groups: groups
      };
    }
    
    res.json(response);
  } catch (e) {
    logger.error("Sync bots error:", e.message, e.stack);
    res.status(500).send("Failed to sync bots. Please try again.");
  }
});

// ===== Fix existing bot store numbers =====
export const groupmeFixBotStores = onRequest({ 
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
    
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).send("Missing user_id");
    
    // Verify user owns this GroupMe account
    const userTokenDoc = await db.collection("groupme_tokens").doc(String(user_id)).get();
    if (!userTokenDoc.exists) {
      return res.status(404).send("No token on file");
    }
    
    const tokenData = userTokenDoc.data();
    if (tokenData.firebase_uid !== decodedToken.uid && !(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Access denied");
    }
    
    logger.info("Starting bot store number fix", { user_id, firebase_uid: decodedToken.uid });
    
    // Get bots from GroupMe API to get group names
    const groupmeResponse = await fetch(`https://api.groupme.com/v3/bots?token=${tokenData.access_token}`);
    if (!groupmeResponse.ok) {
      logger.error("Failed to fetch bots from GroupMe API", { status: groupmeResponse.status });
      return res.status(500).send("Failed to fetch bots from GroupMe");
    }
    
    const groupmeData = await groupmeResponse.json();
    const groupmeBots = groupmeData.response || [];
    
    let fixedCount = 0;
    for (const groupmeBot of groupmeBots) {
      // Extract store number from group name
      const groupName = groupmeBot.group_name || "";
      const storeMatch = groupName.match(/^(\d{3,4})\s/);
      const groupStore = storeMatch ? storeMatch[1] : null;
      
      if (groupStore) {
        // Update the bot record in our database
        const botRef = db.collection("groupme_bots").doc(groupmeBot.bot_id);
        const botDoc = await botRef.get();
        
        if (botDoc.exists) {
          const currentData = botDoc.data();
          if (currentData.store !== groupStore) {
            await botRef.update({
              store: groupStore,
              group_name: groupName,
              fixedAt: FieldValue.serverTimestamp()
            });
            
            logger.info("Fixed bot store number", { 
              bot_id: groupmeBot.bot_id, 
              old_store: currentData.store,
              new_store: groupStore,
              group_name: groupName
            });
            
            fixedCount++;
          }
        }
      }
    }
    
    logger.info("Bot store number fix completed", { fixed_count: fixedCount });
    
    res.json({ 
      success: true, 
      fixed: fixedCount,
      message: `Fixed ${fixedCount} bot store numbers`
    });
  } catch (e) {
    logger.error("Fix bot stores error:", e.message, e.stack);
    res.status(500).send("Failed to update bot stores. Please try again.");
  }
});

// ===== 3b2) Debug GroupMe bots - Enhanced debugging =====
export const groupmeDebugBots = onRequest({ 
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
    
    const { user_id } = req.body || {};
    if (!user_id) return res.status(400).send("Missing user_id");
    
    // Verify user owns this GroupMe account
    const userTokenDoc = await db.collection("groupme_tokens").doc(String(user_id)).get();
    if (!userTokenDoc.exists) {
      return res.status(404).send("No token on file");
    }
    
    const tokenData = userTokenDoc.data();
    if (tokenData.firebase_uid !== decodedToken.uid && !(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Access denied");
    }
    
    logger.info("Starting enhanced bot debugging", { user_id, firebase_uid: decodedToken.uid });
    
    // Get bots from GroupMe API
    const groupmeResponse = await fetch(`https://api.groupme.com/v3/bots?token=${tokenData.access_token}`);
    let groupmeBots = [];
    if (groupmeResponse.ok) {
      const data = await groupmeResponse.json();
      groupmeBots = data.response || [];
      logger.info("GroupMe bots found", { count: groupmeBots.length });
    } else {
      logger.error("Failed to fetch GroupMe bots", { status: groupmeResponse.status });
    }
    
    // Get bots from our database
    const dbBotsSnapshot = await db.collection("groupme_bots")
      .where("user_id", "==", user_id)
      .get();
    
    const databaseBots = [];
    dbBotsSnapshot.forEach(doc => {
      const data = doc.data();
      databaseBots.push({
        id: doc.id,
        bot_id: data.bot_id,
        group_id: data.group_id,
        name: data.name,
        store: data.store
      });
    });
    
    // Get groups for context
    const groupsResponse = await fetch(`https://api.groupme.com/v3/groups?token=${tokenData.access_token}`);
    let groups = [];
    if (groupsResponse.ok) {
      const data = await groupsResponse.json();
      groups = (data.response || []).map(g => ({
        id: g.id,
        name: g.name,
        members_count: g.members ? g.members.length : 0
      }));
    }
    
    logger.info("Debug results", { 
      groupme_bots: groupmeBots.length,
      database_bots: databaseBots.length,
      groups: groups.length
    });
    
    res.json({
      success: true,
      groupme_bots: groupmeBots.map(bot => ({
        bot_id: bot.bot_id,
        group_id: bot.group_id,
        name: bot.name,
        callback_url: bot.callback_url
      })),
      database_bots: databaseBots,
      groups: groups,
      summary: {
        total_groupme_bots: groupmeBots.length,
        total_database_bots: databaseBots.length,
        groups_checked: groups.length
      }
    });
    
  } catch (e) {
    logger.error("Bot debugging error:", e.message);
    res.status(500).send("Failed to retrieve bot information. Please try again.");
  }
});

// ===== 3c) Admin Create Bot for Any Store =====
export const groupmeAdminCreateBot = onRequest({ 
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin status
    const decodedToken = await authenticateUser(req);
    const userIsAdmin = await isAdmin(decodedToken.uid);
    
    if (!userIsAdmin) {
      return res.status(403).send("Admin access required");
    }
    
    const { owner_user_id, group_id, store_number, bot_name } = req.body || {};
    
    // Validate required fields
    if (!owner_user_id || !group_id || !store_number) {
      return res.status(400).send("Missing required fields: owner_user_id, group_id, store_number");
    }
    
    // Sanitize inputs
    const sanitizedGroupId = sanitizeInput(String(group_id), 20);
    const sanitizedStoreNumber = sanitizeInput(String(store_number), 10);
    const sanitizedBotName = sanitizeInput(String(bot_name || `Store ${store_number} Bot`), 50);
    
    logger.info("Admin creating bot for store", { 
      admin_uid: decodedToken.uid,
      owner_user_id,
      group_id: sanitizedGroupId, 
      store_number: sanitizedStoreNumber,
      bot_name: sanitizedBotName
    });
    
    // Verify the owner has a GroupMe token
    const ownerTokenDoc = await db.collection("groupme_tokens").doc(String(owner_user_id)).get();
    if (!ownerTokenDoc.exists) {
      return res.status(404).send("Owner user does not have GroupMe token");
    }
    
    const tokenData = ownerTokenDoc.data();
    const { access_token } = tokenData;
    
    // Create unique callback URL using store number and timestamp
    const uniqueId = `${sanitizedStoreNumber}_${Date.now().toString(36)}`;
    const callbackUrl = `https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeWebhook?group_id=${sanitizedGroupId}&store=${sanitizedStoreNumber}&uid=${uniqueId}`;
    
    // Check for existing bots in this group with the same store number
    const existingBotsSnapshot = await db.collection("groupme_bots")
      .where("group_id", "==", sanitizedGroupId)
      .where("store", "==", sanitizedStoreNumber)
      .get();
    
    if (!existingBotsSnapshot.empty) {
      return res.status(400).send(`Bot for store ${sanitizedStoreNumber} already exists in this group`);
    }
    
    // Create bot via GroupMe API using owner's token
    const botRequest = {
      bot: {
        group_id: sanitizedGroupId,
        callback_url: callbackUrl,
        name: sanitizedBotName
      }
    };
    
    logger.info("Creating bot via GroupMe API", { botRequest });
    
    const response = await fetch("https://api.groupme.com/v3/bots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...botRequest,
        token: access_token
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error("GroupMe bot creation failed", { 
        status: response.status, 
        error: errorText 
      });
      return res.status(response.status).send(`Failed to create bot: ${errorText}`);
    }
    
    const json = await response.json();
    const botData = json.response?.bot;
    
    if (!botData || !botData.bot_id) {
      logger.error("Invalid bot creation response", { json });
      return res.status(500).send("Invalid response from GroupMe API");
    }
    
    // Store bot info in database with admin and owner info
    const sanitizedBotId = botData.bot_id.replace(/[^a-zA-Z0-9_-]/g, '_');
    
    await db.collection("groupme_bots").doc(sanitizedBotId).set({
      bot_id: botData.bot_id,
      group_id: sanitizedGroupId,
      user_id: String(owner_user_id), // Original owner
      firebase_uid: tokenData.firebase_uid, // Original owner's Firebase UID
      name: botData.name,
      store: sanitizedStoreNumber,
      createdAt: FieldValue.serverTimestamp(),
      // Admin creation tracking
      created_by_admin: true,
      admin_uid: decodedToken.uid,
      callback_url: callbackUrl
    });
    
    logger.info("Admin bot creation successful", {
      bot_id: botData.bot_id,
      store: sanitizedStoreNumber,
      group_id: sanitizedGroupId,
      admin: decodedToken.uid,
      owner: owner_user_id
    });
    
    res.json({
      success: true,
      bot_id: botData.bot_id,
      name: botData.name,
      store: sanitizedStoreNumber,
      group_id: sanitizedGroupId,
      message: `Bot created for store ${sanitizedStoreNumber}`
    });
    
  } catch (e) {
    logger.error("Admin bot creation error:", e.message, e.stack);
    res.status(500).send("Failed to create bot. Please try again.");
  }
});

// ===== 3d) Get GroupMe user profile =====
export const groupmeUserProfile = onRequest({ 
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "GET") return res.status(405).send("Use GET");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!checkRateLimit(clientIp, 10, 60000)) {
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
    
    // Get user profile from GroupMe API
    const profileResponse = await fetch(`https://api.groupme.com/v3/users/me?token=${tokenData.access_token}`);
    
    if (!profileResponse.ok) {
      logger.error("Failed to fetch GroupMe user profile", { status: profileResponse.status });
      return res.status(500).send("Failed to fetch user profile");
    }
    
    const profileData = await profileResponse.json();
    
    // Return relevant user profile information
    res.json({
      user: {
        id: profileData.response.user_id,
        name: profileData.response.name,
        nickname: profileData.response.nickname,
        email: profileData.response.email,
        image_url: profileData.response.image_url
      }
    });
    
  } catch (e) {
    logger.error("User profile error:", e.message);
    res.status(500).send("Error fetching user profile");
  }
});

// ===== 4a) List user's bots =====
export const groupmeListBots = onRequest({ 
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
    
    // Get all bots for this user from our database
    const botsSnapshot = await db.collection("groupme_bots")
      .where("user_id", "==", groupmeUserId)
      .get();
    
    const databaseBots = [];
    botsSnapshot.forEach(doc => {
      databaseBots.push({ id: doc.id, ...doc.data() });
    });
    
    // Also fetch bots directly from GroupMe API to detect discrepancies
    let groupmeBots = [];
    try {
      const groupmeResponse = await fetch(`https://api.groupme.com/v3/bots?token=${tokenData.access_token}`);
      if (groupmeResponse.ok) {
        const groupmeData = await groupmeResponse.json();
        groupmeBots = groupmeData.response || [];
        logger.info("Fetched bots from GroupMe API", { count: groupmeBots.length });
      } else {
        logger.warn("Failed to fetch bots from GroupMe API", { status: groupmeResponse.status });
      }
    } catch (apiError) {
      logger.error("Error fetching bots from GroupMe API", { error: apiError.message });
    }
    
    // Compare and identify missing bots
    const missingFromDatabase = [];
    for (const groupmeBot of groupmeBots) {
      const foundInDb = databaseBots.find(dbBot => dbBot.bot_id === groupmeBot.bot_id);
      if (!foundInDb) {
        missingFromDatabase.push({
          bot_id: groupmeBot.bot_id,
          name: groupmeBot.name,
          group_id: groupmeBot.group_id,
          user_id: groupmeUserId,
          source: 'groupme_api_only'
        });
      }
    }
    
    if (missingFromDatabase.length > 0) {
      logger.warn("Found bots in GroupMe API that are missing from database", { 
        missing: missingFromDatabase 
      });
    }
    
    // Return both database bots and any missing bots found in GroupMe
    const allBots = [...databaseBots, ...missingFromDatabase];
    
    res.json({ 
      bots: allBots,
      debug: {
        database_count: databaseBots.length,
        groupme_count: groupmeBots.length,
        missing_from_db: missingFromDatabase.length
      }
    });
  } catch (e) {
    logger.error("List bots error:", e.message);
    res.status(500).send("Error listing bots");
  }
});

// ===== 4b) Delete a bot from a group =====
export const groupmeDeleteBot = onRequest({ 
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
    logger.info("Authenticating user for bot deletion...");
    const decodedToken = await authenticateUser(req);
    logger.info("User authenticated", { uid: decodedToken.uid });
    
    const { user_id, bot_id } = req.body || {};
    logger.info("Bot deletion request", { user_id, bot_id });
    if (!user_id || !bot_id) return res.status(400).send("Missing user_id or bot_id");
    
    // Verify user owns this GroupMe account or is admin
    const userTokenDoc = await db.collection("groupme_tokens").doc(String(user_id)).get();
    if (!userTokenDoc.exists) {
      logger.error("No GroupMe token found", { user_id });
      return res.status(404).send("No token on file");
    }
    
    const tokenData = userTokenDoc.data();
    if (tokenData.firebase_uid !== decodedToken.uid && !(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Access denied");
    }
    
    const { access_token } = tokenData;
    
    // Delete bot from GroupMe
    logger.info("Deleting bot from GroupMe", { bot_id });
    const resp = await fetch(`https://api.groupme.com/v3/bots/destroy`, {
      method: "POST",
      headers: { 
        "X-Access-Token": access_token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ bot_id })
    });
    
    const text = await resp.text();
    logger.info("GroupMe delete response", { status: resp.status, text });
    
    // Delete bot from our database
    await db.collection("groupme_bots").doc(bot_id).delete();
    logger.info("Bot deleted from database", { bot_id });
    
    res.json({ success: true, message: "Bot deleted successfully" });
  } catch (e) {
    logger.error("Delete bot error:", e.message, e.stack);
    res.status(500).send("Failed to delete bot. Please try again.");
  }
});

// ===== 4c) Admin: Get all GroupMe data for a user =====
export const groupmeAdminUserData = onRequest({ 
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "GET") return res.status(405).send("Use GET");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }
    
    const { firebase_uid } = req.query;
    if (!firebase_uid) return res.status(400).send("Missing firebase_uid");
    
    logger.info("Admin fetching GroupMe data for user", { firebase_uid, admin: decodedToken.uid });
    
    // Get user's GroupMe tokens
    const tokensSnapshot = await db.collection("groupme_tokens")
      .where("firebase_uid", "==", firebase_uid)
      .get();
    
    const tokens = [];
    tokensSnapshot.forEach(doc => {
      const data = doc.data();
      tokens.push({
        groupme_user_id: doc.id,
        firebase_uid: data.firebase_uid,
        created_at: data.created_at,
        updated_at: data.updatedAt,
        user_name: data.user_name || null,
        // Don't expose access_token for security
        has_token: !!data.access_token
      });
    });
    
    // Get user's bots from database
    const botsSnapshot = await db.collection("groupme_bots")
      .where("firebase_uid", "==", firebase_uid)
      .get();
    
    const bots = [];
    botsSnapshot.forEach(doc => {
      const data = doc.data();
      bots.push({
        bot_id: data.bot_id,
        name: data.name,
        group_id: data.group_id,
        store: data.store,
        user_id: data.user_id,
        created_at: data.createdAt,
        synced: data.synced || false
      });
    });
    
    // Get webhook activity logs for this user's groups (broader search)
    let webhookLogs = [];
    const groupIds = bots.map(bot => bot.group_id);
    
    try {
      // Get recent webhook activity (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      if (groupIds.length > 0) {
        // Search by group IDs to catch all activity in groups where user has bots
        const webhookSnapshot = await db.collection("groupme_webhook_logs")
          .where("group_id", "in", groupIds.slice(0, 10)) // Firestore limit
          .where("timestamp", ">=", thirtyDaysAgo)
          .orderBy("timestamp", "desc")
          .limit(100)
          .get();
        
        webhookSnapshot.forEach(doc => {
          const data = doc.data();
          webhookLogs.push({
            id: doc.id,
            timestamp: data.timestamp,
            group_id: data.group_id,
            sender_type: data.sender_type,
            sender_name: data.sender_name,
            message_type: data.message_type,
            user_id: data.user_id,
            text_preview: data.text_preview,
            attachments_count: data.attachments_count || 0,
            system_message: data.system_message || false
          });
        });
      }
    } catch (webhookError) {
      logger.error("Error fetching webhook logs", { error: webhookError.message });
      // Continue without webhook logs if there's an error
    }
    
    // Get bot post activity (outbound notifications)
    let botPosts = [];
    try {
      if (firebase_uid) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const postsSnapshot = await db.collection("groupme_bot_posts")
          .where("firebase_uid", "==", firebase_uid)
          .where("timestamp", ">=", thirtyDaysAgo)
          .orderBy("timestamp", "desc")
          .limit(50)
          .get();
        
        postsSnapshot.forEach(doc => {
          const data = doc.data();
          botPosts.push({
            id: doc.id,
            timestamp: data.timestamp,
            bot_id: data.bot_id,
            group_id: data.group_id,
            store: data.store,
            area: data.area,
            message: data.message,
            success: data.success,
            response_status: data.response_status
          });
        });
      }
    } catch (postsError) {
      logger.error("Error fetching bot posts", { error: postsError.message });
    }
    
    // Get user's profile from users collection for additional context
    const userDoc = await db.collection("users").doc(firebase_uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    
    res.json({
      firebase_uid,
      user_profile: userData ? {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        storeNumber: userData.storeNumber,
        homeStore: userData.homeStore,
        allowedStores: userData.allowedStores
      } : null,
      groupme_data: {
        tokens,
        bots,
        recent_webhook_activity: webhookLogs,
        recent_bot_posts: botPosts,
        summary: {
          total_tokens: tokens.length,
          total_bots: bots.length,
          stores_with_bots: [...new Set(bots.filter(b => b.store).map(b => b.store))],
          recent_activity_count: webhookLogs.length,
          recent_posts_count: botPosts.length,
          successful_posts: botPosts.filter(p => p.success).length,
          failed_posts: botPosts.filter(p => !p.success).length
        }
      }
    });
    
  } catch (e) {
    logger.error("Admin GroupMe data fetch error:", e.message);
    res.status(500).send("Failed to retrieve data. Please try again.");
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
    
    // Enhanced rate limiting with IP blocking
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      if (rateLimitResult.reason === 'blocked') {
        return res.status(403).json({ error: "Your IP has been blocked due to suspicious activity. Please contact support." });
      }
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    
    // Validate API key
    if (!validateApiKey(req)) {
      return res.status(401).json({ error: "Invalid API key" });
    }
    
    // Authenticate user
    let decodedToken;
    try {
      decodedToken = await authenticateUser(req);
    } catch (error) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const { store, area, areaDescription } = req.body || {};
    if (!store || !area) {
      return res.status(400).json({ error: "Missing store or area" });
    }

    // Sanitize and validate inputs
    const sanitizedStore = sanitizeInput(String(store), 10);
    const sanitizedArea = sanitizeInput(String(area), 50);
    // areaDescription is the full display name (e.g., "Electronics A-14")
    // area is the base location for analytics grouping (e.g., "Electronics")
    const sanitizedAreaDescription = areaDescription ? sanitizeInput(String(areaDescription), 100) : null;

    if (!/^\d{3,6}$/.test(sanitizedStore)) {
      return res.status(400).json({ error: "Store number must be 3-6 digits" });
    }

    // Allow most characters in area names (length check only, sanitizeInput removes dangerous chars)
    if (!sanitizedArea || sanitizedArea.length < 1 || sanitizedArea.length > 50) {
      return res.status(400).json({ error: "Invalid area name" });
    }
    
    // Validate store access for non-admin users
    const userIsAdmin = await isAdmin(decodedToken.uid);
    if (!userIsAdmin) {
      const userDoc = await db.collection('users').doc(decodedToken.uid).get();
      if (!userDoc.exists) {
        return res.status(403).json({ error: "User not found" });
      }
      
      const userData = userDoc.data();
      if (userData.approved !== true) {
        return res.status(403).json({ error: "Account not approved" });
      }
      
      // Check if user has access to this store
      const allowedStores = userData.allowedStores || (userData.storeNumber ? [userData.storeNumber] : []);
      const hasGeneralAccess = allowedStores.includes(sanitizedStore);
      const hasHomeStoreAccess = userData.homeStore && userData.homeStore === sanitizedStore;
      
      if (!hasGeneralAccess && !hasHomeStoreAccess) {
        return res.status(403).json({ error: "Access denied for this store" });
      }
    }

    // Generate unique token
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);

    // Store token info
    const tokenData = {
      store: sanitizedStore,
      area: sanitizedArea,
      token,
      createdBy: decodedToken.uid,
      createdAt: FieldValue.serverTimestamp(),
      scanned: false,
      scanCount: 0
    };
    // Include areaDescription if provided (for display, e.g., "Electronics A-14")
    if (sanitizedAreaDescription) {
      tokenData.areaDescription = sanitizedAreaDescription;
    }
    await db.collection("qr_tokens").doc(token).set(tokenData);

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
  invoker: "public",
  secrets: [WORKVIVO_ENCRYPT_KEY, WORKVIVO_RESEND_KEY]
}, async (req, res) => {
  try {
    // Enhanced rate limiting with IP blocking for QR scans
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp, 20, 60000); // Higher limit for QR scans
    if (!rateLimitResult.allowed) {
      if (rateLimitResult.reason === 'blocked') {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Access Blocked</title>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body { 
                  font-family: system-ui, sans-serif; 
                  text-align: center; 
                  padding: 2rem; 
                  background: #ef4444;
                  color: white;
                  min-height: 100vh;
                  margin: 0;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .container {
                  background: white;
                  color: #333;
                  padding: 2rem;
                  border-radius: 1rem;
                  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
                  max-width: 400px;
                }
                h1 { color: #dc2626; margin-bottom: 1rem; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Access Blocked</h1>
                <p>Your IP address has been temporarily blocked due to suspicious activity.</p>
                <p>If you believe this is an error, please contact store management.</p>
              </div>
            </body>
          </html>
        `);
      }
      return res.status(429).send("Too many requests. Please try again later.");
    }

    // Handle both old token format (?t=TOKEN) and new location data format (?d=BASE64_DATA)
    let tokenData = null;
    let token = null;
    let isNewFormat = false;
    
    const encodedData = req.query.d;
    if (encodedData) {
      // New format: base64 encoded "store:locationId:marker"
      try {
        const decoded = Buffer.from(encodedData, 'base64').toString('utf-8');
        const parts = decoded.split(':');
        
        if (parts.length < 2) {
          return res.status(400).send("Invalid QR code data format");
        }
        
        const [store, locationId, marker] = parts;
        
        // Validate location against Firestore list
        const locationMap = await getLocationMap();
        if (!locationMap[locationId]) {
          logger.warn("Invalid location ID in QR scan", { locationId, decoded });
          return res.status(400).send("Invalid location");
        }
        
        // Build area description: "Department" or "Department A1-2"
        const locationName = locationMap[locationId];
        const areaDescription = marker ? `${locationName} ${marker}` : locationName;
        
        // Create tokenData from decoded info (new format doesn't use qr_tokens collection)
        tokenData = {
          store: store,
          area: areaDescription,
          locationId: locationId,
          marker: marker || null
        };
        token = `loc_${store}_${locationId}_${marker || 'none'}_${Date.now()}`;
        isNewFormat = true;
        
        logger.info("New format QR scan", { store, locationId, marker, areaDescription });
      } catch (err) {
        logger.error("Failed to decode QR data", { error: err.message, encodedData });
        return res.status(400).send("Invalid QR code");
      }
    } else {
      // Old format: token lookup
      token = sanitizeInput(req.query.t || '', 50);
      if (!token) {
        return res.status(400).send("Missing or invalid token");
      }

      // Get token info from qr_tokens collection
      const tokenDoc = await db.collection("qr_tokens").doc(token).get();
      if (!tokenDoc.exists) {
        return res.status(404).send("Invalid or expired QR code");
      }

      tokenData = tokenDoc.data();
    }
    
    // Check for duplicate scan within last 60 seconds using token's lastScannedAt
    if (tokenData.lastScannedAt) {
      const lastScanTime = tokenData.lastScannedAt.toMillis ? tokenData.lastScannedAt.toMillis() : tokenData.lastScannedAt.getTime();
      const sixtySecondsAgo = Date.now() - 60000;
      
      if (lastScanTime > sixtySecondsAgo) {
        logger.info("Duplicate scan detected within 60 seconds", { token, store: tokenData.store, area: tokenData.area });
        // Still show success page but don't send duplicate notification
        res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Assistance Already Requested</title>
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
                <h1>Help is already on the way!</h1>
                <p class="success">Your assistance request was already sent to store staff.</p>
                <p><strong>Store:</strong> ${sanitizeInput(tokenData.store, 10)}</p>
                <p><strong>Area:</strong> ${sanitizeInput(tokenData.area, 50)}</p>
                <p>A team member will be with you shortly. Thank you for your patience!</p>
                <p style="font-size: 0.9em; color: #666; margin-top: 1rem;">To avoid duplicate alerts, requests can only be sent once per minute.</p>
              </div>
            </body>
          </html>
        `);
        return;
      }
    }
    
    // Update scan count (only for old token format)
    if (!isNewFormat) {
      await db.collection("qr_tokens").doc(token).update({
        scanned: true,
        scanCount: FieldValue.increment(1),
        lastScannedAt: FieldValue.serverTimestamp()
      });
    }

    // Log the assistance request in logs collection (for admin/analytics)
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

    // Also create scan record for Android app Recent Customer Requests
    const scanRecord = {
      timestamp: FieldValue.serverTimestamp(),
      qrCode: token,
      storeNumber: String(tokenData.store), // Ensure it's always a string
      // area is base location for analytics grouping (e.g., "Electronics")
      area: tokenData.area,
      // areaDescription is full display name (e.g., "Electronics A-14") - falls back to area
      areaDescription: tokenData.areaDescription || tokenData.area,
      // New location fields for reporting/insights (null for old format QRs)
      locationId: tokenData.locationId || null,      // e.g., "electronics", "beauty"
      locationMarker: tokenData.marker || null,      // e.g., "A1-2"
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('User-Agent') || '',
      responses: [],
      status: "pending",
      claimedBy: "",
      claimedByName: "",
      claimedAt: null,
      resolvedAt: null,
      notificationsSentAt: FieldValue.serverTimestamp(),
      eligibleUsers: [], // Will be populated by sendAndroidNotification
      timeoutProcessed: false,
      secondaryAlertSent: false
    };
    
    const scanDoc = await db.collection("scans").add(scanRecord);

    // Send notifications to all platforms
    // GroupMe disabled - migrating to mobile app
    // await sendGroupMeNotification(tokenData.store, tokenData.area);
    await sendAndroidNotification(tokenData.store, tokenData.area, scanDoc.id);

    // Workvivo: postToWorkvivo handles Session-Key minting via Sendbird WS handshake
    // (Workvivo's tenant rejects Access-Token-only REST). Fire-and-forget so a
    // Workvivo failure never blocks the scan response.
    const localTime = new Date().toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric", minute: "2-digit", hour12: true,
    }).toLowerCase().replace(/\s+/g, "");  // -> "2:44pm"
    const workvivoMessage =
      `Customer assistance needed at ${tokenData.areaDescription || tokenData.area} ${localTime}`;
    postToWorkvivo(tokenData.store, workvivoMessage, WORKVIVO_ENCRYPT_KEY.value(), scanDoc.id)
      .catch(err => logger.error("postToWorkvivo failed", { store: tokenData.store, scanId: scanDoc.id, error: err.message }));

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
            <h1>Help is on the way!</h1>
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

// ===== Helper: Check if user is currently on shift =====
function isUserOnShift(userData) {
  const userName = userData.firstName || userData.email || "Unknown";
  
  if (!userData.notificationsEnabled) {
    logger.info(`User ${userName}: notifications disabled`);
    return false;
  }

  const workSchedule = userData.workSchedule;
  if (!workSchedule) {
    // If no schedule is set, assume user wants all notifications
    logger.info(`User ${userName}: no work schedule set, allowing notification`);
    return true;
  }

  // Get user's timezone (default to America/New_York for now, but can be stored per user)
  const userTimezone = userData.timezone || "America/New_York";
  
  // Convert UTC time to user's local time
  const now = new Date();
  const userLocalTime = new Date(now.toLocaleString("en-US", {timeZone: userTimezone}));
  const dayOfWeek = userLocalTime.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const hour = userLocalTime.getHours();
  const minute = userLocalTime.getMinutes();

  // Map JavaScript day (0=Sunday) to our schedule format (lowercase to match frontend)
  const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];
  const daySchedule = workSchedule[dayName];

  logger.info(`User ${userName}: checking ${dayName} schedule at ${hour}:${String(minute).padStart(2, '0')} (${userTimezone}) - UTC: ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`);

  if (!daySchedule || !daySchedule.isWorkingDay) {
    logger.info(`User ${userName}: not working on ${dayName}`);
    return false;
  }

  // Check if current time is within working hours
  const startHour = parseInt(daySchedule.startHour) || 0;
  const startMinute = parseInt(daySchedule.startMinute) || 0;
  const endHour = parseInt(daySchedule.endHour) || 23;
  const endMinute = parseInt(daySchedule.endMinute) || 59;

  const currentMinutes = hour * 60 + minute;
  const startMinutes = startHour * 60 + startMinute;
  const endMinutes = endHour * 60 + endMinute;

  const isOnShift = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  const startTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
  const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
  
  logger.info(`User ${userName}: ${dayName} shift ${startTime}-${endTime} (${userTimezone}), currently ${isOnShift ? 'ON' : 'OFF'} shift`);
  
  return isOnShift;
}

// ===== Helper: Send GroupMe notification =====
async function sendGroupMeNotification(store, area) {
  try {
    // Get only bots for the specific store
    const botsSnapshot = await db.collection("groupme_bots")
      .where("store", "==", store)
      .get();
    
    if (botsSnapshot.empty) {
      logger.info(`No GroupMe bots found for store ${store}`);
      return;
    }
    
    for (const botDoc of botsSnapshot.docs) {
      const botData = botDoc.data();

      // Check if bot owner wants notifications for this area
      // DEFAULT BEHAVIOR: Empty/missing notificationAreas = receive ALL areas
      // FILTERED BEHAVIOR: If notificationAreas has values, only send for matching areas
      const botOwnerDoc = await db.collection("users").doc(botData.firebase_uid).get();
      if (botOwnerDoc.exists) {
        const botOwnerData = botOwnerDoc.data();
        const notificationAreas = botOwnerData.notificationAreas || [];

        // If bot owner has area preferences, respect them
        if (notificationAreas.length > 0 && !notificationAreas.includes(area)) {
          logger.info(`Skipping GroupMe bot ${botData.bot_id}: owner filtered out area '${area}' (preferences: [${notificationAreas.join(', ')}])`);
          continue;
        }
      }

      // Get the user's token to send message
      const tokenDoc = await db.collection("groupme_tokens").doc(botData.user_id).get();
      if (!tokenDoc.exists) continue;

      // Use local time zone (assuming PST/PDT for your location)
      const now = new Date();
      const localTime = new Date(now.getTime() - (4 * 60 * 60 * 1000)); // Subtract 4 hours to convert from UTC to PDT
      const message = `Store ${sanitizeInput(store, 10)}: Customer assistance needed in ${sanitizeInput(area, 50)} at ${localTime.toLocaleTimeString()}`;

      // Send message via bot
      const postResponse = await fetch("https://api.groupme.com/v3/bots/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_id: botData.bot_id,
          text: message
        })
      });

      // Log bot post activity for admin tracking
      // Skip logging for store 1458 to avoid affecting leaderboard tracking
      if (store !== "1458") {
        try {
          await db.collection("groupme_bot_posts").add({
            timestamp: FieldValue.serverTimestamp(),
            bot_id: botData.bot_id,
            group_id: botData.group_id,
            store: store,
            area: area,
            message: message,
            success: postResponse.ok,
            response_status: postResponse.status,
            firebase_uid: botData.firebase_uid
          });
        } catch (logError) {
          logger.error("Failed to log bot post activity", { error: logError.message });
        }
      } else {
        logger.info("Skipping leaderboard logging for store 1458 (testing purposes)");
      }
    }
  } catch (e) {
    logger.error("GroupMe notification error:", e.message);
  }
}

// ===== Helper: Send Workvivo notification =====
async function sendWorkvivoNotification(store, area) {
  try {
    // Only store 1458 uses Workvivo via the simple bot
    if (store === "1458") {
      const now = new Date();
      const localTime = new Date(now.getTime() - (4 * 60 * 60 * 1000)); // Subtract 4 hours to convert from UTC to PDT
      const message = `🔔 Customer assistance needed in ${sanitizeInput(area, 50)} at ${localTime.toLocaleTimeString()}`;
      
      try {
        logger.info("Attempting to send to Store 1458 Workvivo bot", { 
          url: "http://34.45.52.250:5002/webhook",
          message,
          store,
          area
        });
        
        const response = await fetch("http://34.45.52.250:5002/webhook", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "User-Agent": "QRCallBox-Firebase-Function"
          },
          body: JSON.stringify({ text: message })
        });
        
        const responseText = await response.text();
        logger.info("Store 1458 Workvivo bot response", { 
          store, 
          area, 
          status: response.status, 
          statusText: response.statusText,
          response: responseText,
          success: response.ok
        });
        
        if (!response.ok) {
          logger.error("Store 1458 Workvivo bot returned non-OK status", {
            status: response.status,
            statusText: response.statusText,
            response: responseText
          });
        }
        
        return;
      } catch (error) {
        logger.error("Store 1458 Workvivo notification failed", { 
          store, 
          area, 
          error: error.message,
          errorCode: error.code,
          errorStack: error.stack
        });
        return;
      }
    }
    
    // Other stores don't use Workvivo
    logger.info("Workvivo not configured for store", { store });
    return;
  } catch (e) {
    logger.error("Workvivo notification error:", e.message);
  }
}


// ===== Debug data types endpoint =====
export const debugDataTypes = onRequest(
  { 
    region: REGION, 
    cors: { origin: ALLOWED_ORIGINS } 
  },
  async (req, res) => {
    try {
      // Get sample user document
      const usersSnapshot = await db.collection('users').limit(3).get();
      const userSamples = [];
      
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        userSamples.push({
          id: doc.id,
          storeNumber: {
            value: data.storeNumber,
            type: typeof data.storeNumber,
            isNumber: typeof data.storeNumber === 'number',
            isString: typeof data.storeNumber === 'string'
          },
          userId: {
            value: data.userId,
            type: typeof data.userId,
            exists: data.userId !== undefined
          }
        });
      });
      
      // Get sample scan document  
      const scansSnapshot = await db.collection('scans').limit(3).get();
      const scanSamples = [];
      
      scansSnapshot.forEach(doc => {
        const data = doc.data();
        scanSamples.push({
          id: doc.id,
          storeNumber: {
            value: data.storeNumber,
            type: typeof data.storeNumber,
            isNumber: typeof data.storeNumber === 'number',
            isString: typeof data.storeNumber === 'string'
          },
          status: data.status,
          claimedBy: data.claimedBy
        });
      });

      res.json({
        userSamples,
        scanSamples,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error("Error in debugDataTypes:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ===== Work Device Auto-Fix endpoint =====
export const autoFixWorkDevice = onRequest(
  { 
    region: REGION,
    cors: { origin: ALLOWED_ORIGINS },
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
      
      // Detect work-managed device
      const workIndicators = ["airwatch", "vmware", "workspace", "intune", "knox", "managed", "enterprise"];
      const isWorkDevice = deviceInfo && workIndicators.some(indicator => 
        deviceInfo.toLowerCase().includes(indicator)
      );
      
      if (!isWorkDevice) {
        return res.json({
          success: true,
          message: "Standard device - no fix needed",
          fixApplied: false
        });
      }
      
      // Apply server-side fixes
      await firestore.collection('users').doc(userId).update({
        fcmToken: fcmToken,
        fcmTokenUpdatedAt: FieldValue.serverTimestamp(),
        deviceType: 'work-managed',
        deviceInfo: deviceInfo,
        notificationFixApplied: true,
        workDeviceMetadata: {
          bypassAttempted: true,
          bypassTimestamp: FieldValue.serverTimestamp(),
          method: 'server-side-auto-fix'
        }
      });
      
      // Add to work device whitelist for enhanced notifications
      await firestore.collection('work_device_whitelist').doc(userId).set({
        fcmToken: fcmToken,
        deviceInfo: deviceInfo,
        whitelistedAt: FieldValue.serverTimestamp(),
        status: 'active'
      });
      
      // Send test notification with max priority
      const testMessage = {
        token: fcmToken,
        notification: {
          title: "🔧 QRCallBox Work Device Fix",
          body: "✅ Notifications are now working! Auto-fix successful."
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
            priority: "max",
            defaultSound: true,
            defaultVibrateTimings: true
          }
        }
      };
      
      const testResult = await messaging.send(testMessage);
      
      logger.info("✅ Work device auto-fix completed", {
        userId,
        testMessageId: testResult
      });
      
      res.json({
        success: true,
        message: "Work device auto-fix completed successfully",
        fixApplied: true,
        testNotificationSent: true,
        details: {
          whitelisted: true,
          enhancedPriority: true,
          testMessageId: testResult
        }
      });
      
    } catch (error) {
      logger.error("❌ Work device auto-fix failed", error);
      res.status(500).json({ 
        error: "Auto-fix failed",
        message: "Server-side fix encountered an error"
      });
    }
  }
);

// ===== App version check endpoint =====
export const getAppVersion = onRequest(
  { 
    region: REGION, 
    cors: { origin: ALLOWED_ORIGINS } 
  },
  async (req, res) => {
    try {
      const versionInfo = {
        latestVersion: "1.8.1",
        versionCode: 51,
        downloadUrl: "https://qrwebaccdb.web.app/app/QRCallBox-debug-v1.8.1.apk",
        releaseNotes: "🐛 BUG FIX: Fixed leaderboard crash caused by theme compatibility issue. The leaderboard now displays properly without crashing the app.",
        isForceUpdate: false,
        minimumSupportedVersion: "1.0"
      };

      res.json(versionInfo);
    } catch (error) {
      logger.error("Error in getAppVersion:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ===== Send urgent update notification to all users =====
export const sendUpdateNotification = onRequest(
  { 
    region: REGION,
    cors: { origin: ALLOWED_ORIGINS }
  },
  async (req, res) => {
    try {
      logger.info("🚨 Sending urgent update notification to all users");
      
      // Get all users with FCM tokens
      const usersSnapshot = await db.collection("users")
        .where("fcmToken", "!=", "")
        .get();
      
      if (usersSnapshot.empty) {
        logger.warn("No users found with FCM tokens");
        return res.json({ success: false, message: "No users with FCM tokens found" });
      }
      
      const tokens = [];
      const userCount = usersSnapshot.size;
      
      usersSnapshot.forEach(doc => {
        const user = doc.data();
        if (user.fcmToken && user.fcmToken.trim() !== "") {
          tokens.push(user.fcmToken);
        }
      });
      
      if (tokens.length === 0) {
        logger.warn("No valid FCM tokens found");
        return res.json({ success: false, message: "No valid FCM tokens found" });
      }
      
      logger.info(`Found ${tokens.length} FCM tokens for ${userCount} users`);
      
      // Create the urgent update notification
      const message = {
        notification: {
          title: "🚨 CRITICAL APP UPDATE REQUIRED",
          body: "Push notifications are broken in your current version. Update immediately to receive customer assistance alerts."
        },
        data: {
          type: "urgent_update",
          version: "1.7.25",
          downloadUrl: "https://qrwebaccdb.web.app/app/QRCallBox-debug-v1.7.25.apk",
          isForceUpdate: "true"
        },
        android: {
          priority: "high",
          notification: {
            priority: "max",
            visibility: "public",
            channel_id: "customer_assistance",
            color: "#FF0000",
            icon: "ic_launcher_foreground",
            sound: "default",
            clickAction: "OPEN_UPDATE_DIALOG"
          }
        }
      };
      
      // Send to all tokens in batches (FCM limit is 500 per batch)
      const batchSize = 500;
      let successCount = 0;
      let failureCount = 0;
      
      for (let i = 0; i < tokens.length; i += batchSize) {
        const batch = tokens.slice(i, i + batchSize);
        
        try {
          logger.info(`Sending batch ${Math.floor(i/batchSize) + 1} with ${batch.length} tokens`);
          
          const response = await getMessaging().sendMulticast({
            ...message,
            tokens: batch
          });
          
          successCount += response.successCount;
          failureCount += response.failureCount;
          
          if (response.failureCount > 0) {
            logger.warn(`Batch had ${response.failureCount} failures`);
            response.responses.forEach((resp, idx) => {
              if (!resp.success) {
                logger.warn(`Token ${batch[idx]} failed: ${resp.error?.message}`);
              }
            });
          }
          
        } catch (error) {
          logger.error(`Error sending batch ${Math.floor(i/batchSize) + 1}:`, error);
          failureCount += batch.length;
        }
      }
      
      logger.info(`Update notification sent: ${successCount} successes, ${failureCount} failures`);
      
      res.json({
        success: true,
        message: "Urgent update notification sent to all users",
        stats: {
          totalUsers: userCount,
          validTokens: tokens.length,
          successCount,
          failureCount
        }
      });
      
    } catch (error) {
      logger.error("Error sending update notification:", error);
      res.status(500).json({ error: "Failed to send update notification" });
    }
  }
);

// ===== Helper: Send Android FCM notification =====
// This function sends notifications to users who are actively monitoring a store.
// It checks activeStore first (for users with store switching), then falls back
// to storeNumber for backward compatibility with older app versions.
async function sendAndroidNotification(store, area, scanId = null) {
  try {
    logger.info(`Starting Android notification for store ${store}, area ${area}`);

    // Query users who have this store as their ACTIVE monitoring store
    // This respects the user's current store selection in the app
    logger.info(`Querying for users with activeStore=${store}...`);

    let usersSnapshot = await db.collection("users")
      .where("activeStore", "==", parseInt(store))
      .get();

    if (usersSnapshot.empty) {
      logger.info(`No users with activeStore=${store} (number). Trying string...`);
      usersSnapshot = await db.collection("users")
        .where("activeStore", "==", String(store))
        .get();
    }

    // Fallback: If no users have activeStore set, use primary storeNumber
    // This ensures backwards compatibility with existing users and app versions
    if (usersSnapshot.empty) {
      logger.info(`No users with activeStore=${store}. Falling back to storeNumber for backward compatibility...`);
      usersSnapshot = await db.collection("users")
        .where("storeNumber", "==", parseInt(store))
        .get();

      if (usersSnapshot.empty) {
        logger.info(`No users with storeNumber=${store} (number). Trying string...`);
        usersSnapshot = await db.collection("users")
          .where("storeNumber", "==", String(store))
          .get();
      }
    }

    if (usersSnapshot.empty) {
      logger.info(`No users found actively monitoring store ${store}`);
      return;
    }
    
    logger.info(`Found ${usersSnapshot.docs.length} users for store ${store}, checking FCM tokens and shift status...`);
    
    // Create notification payload
    const actualScanId = scanId || `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = Date.now();
    
    const notificationData = {
      scanId: actualScanId,
      storeNumber: store,
      areaDescription: area,
      timestamp: timestamp.toString(),
      title: "🚨 Customer Needs Assistance",
      body: `Store ${store}: Customer needs help in ${area}`
    };
    
    // Skip scan document creation if scanId was provided (already created in main function)
    if (!scanId) {
      await db.collection("scans").doc(actualScanId).set({
        scanId: actualScanId,
        storeNumber: store,
        areaDescription: area,
        timestamp: FieldValue.serverTimestamp(),
        timestampMs: timestamp,
        status: "pending",
        responses: [],
        claimedBy: null,
        claimedByName: null,
        claimedAt: null,
        notificationsSentAt: FieldValue.serverTimestamp(),
        eligibleUsers: [], // Will be populated with users who received notifications
        timeoutProcessed: false,
        secondaryAlertSent: false
      });
    }
    
    // Send notification to each user with FCM token who is currently on shift
    const tokens = [];
    const validUsers = [];

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userName = userData.firstName || userData.email || userDoc.id;

      // Enhanced debugging for store 2988
      if (store == "2988") {
        logger.info(`🔍 STORE 2988 DEBUG - User: ${userName}, Email: ${userData.email}`);
        logger.info(`🔍 FCM Tokens: ${userData.fcmTokens ? JSON.stringify(userData.fcmTokens.map(t => ({platform: t.platform, device: t.deviceName}))) : 'None'}`);
        logger.info(`🔍 Legacy Token: ${userData.fcmToken ? 'Present (' + userData.fcmToken.length + ' chars)' : 'Missing'}`);
        logger.info(`🔍 Notifications Enabled: ${userData.notificationsEnabled}`);
        logger.info(`🔍 Work Schedule: ${JSON.stringify(userData.workSchedule)}`);
      }

      // Check if user is currently on shift before processing tokens
      const onShift = isUserOnShift(userData);
      if (!onShift) {
        logger.info(`❌ User ${userName} not on shift, skipping notification`);
        continue;
      }

      // Check area preferences
      const notificationAreas = userData.notificationAreas || [];
      const wantsNotificationForArea = notificationAreas.length === 0 || notificationAreas.includes(area);
      if (!wantsNotificationForArea) {
        logger.info(`❌ User ${userName} filtered out: area '${area}' not in their notification preferences [${notificationAreas.join(', ')}]`);
        continue;
      }

      // NEW: Multi-device token support - send to ALL user's devices
      const userTokens = [];

      // First, check for new fcmTokens array (multi-device)
      if (userData.fcmTokens && Array.isArray(userData.fcmTokens) && userData.fcmTokens.length > 0) {
        for (const tokenEntry of userData.fcmTokens) {
          if (tokenEntry.token && tokenEntry.token.length > 10) {
            userTokens.push({
              token: tokenEntry.token,
              platform: tokenEntry.platform || 'unknown',
              deviceName: tokenEntry.deviceName || 'Unknown Device'
            });
          }
        }
        logger.info(`✅ User ${userName} has ${userTokens.length} device(s): ${userTokens.map(t => `${t.platform} (${t.deviceName})`).join(', ')}`);
      }
      // Fallback to legacy single fcmToken for backward compatibility
      else if (userData.fcmToken && userData.fcmToken.length > 10) {
        userTokens.push({
          token: userData.fcmToken,
          platform: 'unknown',
          deviceName: 'Legacy Device'
        });
        logger.info(`✅ User ${userName} using legacy single token (1 device)`);
      }

      // Add all user tokens to notification list
      if (userTokens.length > 0) {
        for (const userToken of userTokens) {
          tokens.push(userToken.token);
          validUsers.push({
            uid: userDoc.id,
            name: userData.firstName || userData.fullName || "Unknown",
            token: userToken.token,
            platform: userToken.platform,
            device: userToken.deviceName
          });
        }
        logger.info(`✅ User ${userName} added to notification list (on shift, area match, ${userTokens.length} device(s))`);
      } else {
        logger.info(`❌ User ${userName} has no valid FCM tokens`);
      }
    }
    
    if (tokens.length === 0) {
      logger.info(`No on-shift users with valid FCM tokens found for store ${store}`);
      return;
    }
    
    logger.info(`Found ${tokens.length} on-shift users with FCM tokens for store ${store}`);
    
    // Send to each token individually (more reliable than multicast)
    let successCount = 0;
    
    for (const token of tokens) {
      try {
        // DATA-ONLY message - Forces onMessageReceived() to be called even when app is closed
        // This bypasses Android's auto-display mechanism which was failing on some Samsung devices
        const message = {
          data: notificationData,
          android: {
            priority: "high",
            ttl: 3600 // Keep message alive for 1 hour if device offline
          },
          apns: {
            payload: {
              aps: {
                alert: {
                  title: notificationData.title,
                  body: notificationData.body
                },
                sound: "default",
                badge: 1,
                category: "ASSISTANCE_REQUEST"
              }
            }
          },
          token: token
        };

        await getMessaging().send(message);
        successCount++;
        logger.info(`FCM sent successfully to token ${token.substring(0, 20)}...`);
      } catch (error) {
        logger.error(`Failed to send FCM to token ${token.substring(0, 20)}...`, error);
      }
    }
    
    // Send to FCM topic for better corporate firewall penetration
    // This complements individual token delivery
    // DATA-ONLY message - Forces onMessageReceived() to be called even when app is closed
    try {
      const topicMessage = {
        data: notificationData,
        android: {
          priority: "high",
          ttl: 3600
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: notificationData.title,
                body: notificationData.body
              },
              sound: "default",
              badge: 1,
              category: "ASSISTANCE_REQUEST"
            }
          }
        },
        topic: `store-${store}` // All users subscribed to this store receive it
      };

      await getMessaging().send(topicMessage);
      logger.info(`📢 DATA-ONLY topic notification sent to store-${store} (app handles display)`);
    } catch (error) {
      logger.error(`Failed to send topic notification to store-${store}:`, error);
    }

    // Update scan document with eligible users for timeout tracking
    if (validUsers.length > 0) {
      try {
        await db.collection("scans").doc(actualScanId).update({
          eligibleUsers: validUsers.map(user => ({
            uid: user.uid,
            name: user.name,
            notifiedAt: FieldValue.serverTimestamp(),
            responded: false,
            responseType: null // Will be 'assist', 'ignore', or 'timeout'
          }))
        });
        logger.info(`✅ Updated scan ${actualScanId} with ${validUsers.length} eligible users for timeout tracking`);
      } catch (error) {
        logger.error(`❌ CRITICAL: Failed to update scan ${actualScanId} with eligible users:`, {
          error: error.message,
          code: error.code,
          scanId: actualScanId,
          validUsersCount: validUsers.length,
          validUsers: validUsers.map(u => ({ uid: u.uid, name: u.name }))
        });
      }
    } else {
      logger.warn(`⚠️ No eligible users found for scan ${actualScanId} at store ${store}`, {
        totalUsersFound: usersSnapshot.docs.length,
        usersWithTokens: usersSnapshot.docs.filter(doc => doc.data().fcmToken).length,
        usersOnShift: 0
      });
    }

    logger.info("Android FCM notification completed", {
      store,
      area,
      scanId: actualScanId,
      totalTokens: tokens.length,
      successCount: successCount,
      failureCount: tokens.length - successCount,
      eligibleUsers: validUsers.length
    });
    
  } catch (e) {
    logger.error("Android FCM notification error:", e.message);
  }
}

// ===== Debug: Update user FCM token =====
export const updateUserToken = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    const userId = req.query.userId;
    const newToken = req.query.token;
    
    if (!userId || !newToken) {
      return res.status(400).json({ error: "userId and token parameters required" });
    }

    // Get current user document
    const userDoc = await db.collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    const oldToken = userData.fcmToken;
    
    // Update FCM token
    await db.collection("users").doc(userId).update({
      fcmToken: newToken,
      updatedAt: FieldValue.serverTimestamp()
    });

    logger.info("FCM token updated", {
      userId,
      oldToken: oldToken ? oldToken.substring(0, 20) + "..." : "none",
      newToken: newToken.substring(0, 20) + "...",
      email: userData.email
    });
    
    return res.json({
      success: true,
      userId: userId,
      email: userData.email,
      storeNumber: userData.storeNumber,
      oldToken: oldToken ? oldToken.substring(0, 20) + "..." : "none",
      newToken: newToken.substring(0, 20) + "...",
      message: "FCM token updated successfully"
    });

  } catch (error) {
    logger.error("Error updating user token:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ===== Admin: Get blocked IPs list =====
export const getBlockedIPs = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    // Authenticate user
    const user = await authenticateUser(req);
    
    // Check if user is admin
    if (!await isAdmin(user.uid)) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    // Get blocked IPs
    const snapshot = await db.collection('blocked_ips').orderBy('blockedAt', 'desc').limit(100).get();
    const blockedIPs = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      blockedIPs.push({
        ip: doc.id,
        ...data,
        blockedAt: data.blockedAt?.toMillis(),
        expiresAt: data.expiresAt?.toMillis()
      });
    });
    
    res.json({ blockedIPs });
  } catch (error) {
    logger.error('Error fetching blocked IPs:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Admin: Block/Unblock IP =====
export const manageBlockedIP = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    // Authenticate user
    const user = await authenticateUser(req);
    
    // Check if user is admin
    if (!await isAdmin(user.uid)) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { action, ip, reason, duration } = req.body;
    
    if (!action || !ip) {
      return res.status(400).json({ error: "Missing action or IP" });
    }
    
    if (action === 'block') {
      // Calculate expiration based on duration (hours)
      const expiresAt = duration ? new Date(Date.now() + duration * 60 * 60 * 1000) : null;
      
      await db.collection('blocked_ips').doc(ip).set({
        ip,
        blockedAt: FieldValue.serverTimestamp(),
        blockedBy: user.email,
        reason: sanitizeInput(reason || 'Manual block by admin', 200),
        expiresAt,
        autoBlocked: false
      });
      
      // Log the action
      await db.collection('spam_logs').add({
        ip,
        timestamp: FieldValue.serverTimestamp(),
        action: 'manual_block',
        admin: user.email,
        reason
      });
      
      res.json({ success: true, message: `IP ${ip} has been blocked` });
    } else if (action === 'unblock') {
      await db.collection('blocked_ips').doc(ip).delete();
      
      // Log the action
      await db.collection('spam_logs').add({
        ip,
        timestamp: FieldValue.serverTimestamp(),
        action: 'manual_unblock',
        admin: user.email
      });
      
      res.json({ success: true, message: `IP ${ip} has been unblocked` });
    } else {
      res.status(400).json({ error: "Invalid action. Use 'block' or 'unblock'" });
    }
  } catch (error) {
    logger.error('Error managing blocked IP:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Admin: Get spam logs =====
export const getSpamLogs = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    // Authenticate user
    const user = await authenticateUser(req);
    
    // Check if user is admin
    if (!await isAdmin(user.uid)) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    // Get spam logs from last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const snapshot = await db.collection('spam_logs')
      .where('timestamp', '>=', sevenDaysAgo)
      .orderBy('timestamp', 'desc')
      .limit(500)
      .get();
    
    const logs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      logs.push({
        id: doc.id,
        ...data,
        timestamp: data.timestamp?.toMillis()
      });
    });
    
    res.json({ logs });
  } catch (error) {
    logger.error('Error fetching spam logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user data for admin check
export const getUser = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Extract user ID from path
    const pathParts = req.path.split('/');
    const uid = pathParts[pathParts.length - 1];
    
    if (!uid) {
      return res.status(400).json({ error: "User ID required" });
    }

    // Authenticate user using existing helper
    const decodedToken = await authenticateUser(req);
    
    if (decodedToken.uid !== uid) {
      return res.status(403).json({ error: 'Forbidden - can only access your own user data' });
    }

    // Get user document using Admin SDK (bypasses Firestore rules)
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    
    // Return user data including email for admin check
    res.json({
      uid: userDoc.id,
      email: userData.email || '',
      name: userData.name || '',
      store: userData.store || '',
    });
  } catch (error) {
    logger.error('Error getting user:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Admin GroupMe Store Lookup =====
export const groupmeAdminLookupStore = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }
    
    const { store_number } = req.body;
    if (!store_number) return res.status(400).send("Missing store_number");
    
    // Convert to both string and number to handle inconsistent data types
    const storeNum = parseInt(store_number);
    const storeStr = String(store_number);
    
    logger.info("Admin looking up store", { 
      store_number, 
      storeNum,
      storeStr,
      admin: decodedToken.uid 
    });
    
    // Find all users for this store - check both string and number formats
    const queries = [
      // Check storeNumber field
      db.collection("users").where("storeNumber", "==", storeNum).get(),
      db.collection("users").where("storeNumber", "==", storeStr).get(),
      // Check homeStore field  
      db.collection("users").where("homeStore", "==", storeNum).get(),
      db.collection("users").where("homeStore", "==", storeStr).get(),
      // Check allowedStores array
      db.collection("users").where("allowedStores", "array-contains", storeNum).get(),
      db.collection("users").where("allowedStores", "array-contains", storeStr).get()
    ];
    
    const snapshots = await Promise.all(queries);
    
    // Combine all users and deduplicate
    const allUsers = new Map();
    
    snapshots.forEach(snapshot => {
      snapshot.docs.forEach(doc => {
        const userData = doc.data();
        allUsers.set(doc.id, {
          id: doc.id,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          email: userData.email || '',
          jobTitle: userData.jobTitle || '',
          storeNumber: userData.storeNumber || '',
          homeStore: userData.homeStore || '',
          allowedStores: userData.allowedStores || [],
          groupme_user_id: null // Will be populated below
        });
      });
    });
    
    // Get GroupMe user IDs for each user
    for (const [userId, userData] of allUsers.entries()) {
      try {
        const tokenSnapshot = await db.collection("groupme_tokens")
          .where("firebase_uid", "==", userId)
          .get();
        
        if (!tokenSnapshot.empty) {
          const tokenDoc = tokenSnapshot.docs[0];
          const tokenData = tokenDoc.data();
          userData.groupme_user_id = tokenData.user_id;
        }
      } catch (error) {
        logger.warn(`Failed to get GroupMe token for user ${userId}`, { error: error.message });
      }
    }
    
    const users = Array.from(allUsers.values());
    
    logger.info("Store lookup completed", { 
      store_number, 
      users_found: users.length,
      users_with_groupme: users.filter(u => u.groupme_user_id).length
    });
    
    res.json({ users });
    
  } catch (error) {
    logger.error("Admin store lookup error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin GroupMe Email Lookup =====
export const groupmeAdminLookupEmail = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");

    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }

    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }

    const { email } = req.body;
    if (!email) return res.status(400).send("Missing email");

    // Normalize email to lowercase for case-insensitive search
    const emailLower = email.toLowerCase().trim();

    // Require at least 3 characters for partial search to avoid fetching too many users
    if (emailLower.length < 3) {
      return res.status(400).send("Email search requires at least 3 characters");
    }

    logger.info("Admin looking up user by email (partial match)", {
      email: emailLower,
      admin: decodedToken.uid
    });

    // For partial email matching, we need to fetch all users and filter server-side
    // This is necessary because Firestore doesn't support LIKE queries
    // Always do a full scan with substring matching for reliability (handles case issues)
    logger.info("Fetching all users for substring email match");
    const allSnapshot = await db.collection("users").limit(1000).get();

    const allUsers = new Map();

    allSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      const userEmail = (userData.email || '').toLowerCase();

      // Check if email contains the search term (case-insensitive)
      if (userEmail.includes(emailLower)) {
        allUsers.set(doc.id, {
          id: doc.id,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          email: userData.email || '',
          jobTitle: userData.jobTitle || '',
          storeNumber: userData.storeNumber || '',
          homeStore: userData.homeStore || '',
          allowedStores: userData.allowedStores || [],
          groupme_user_id: null // Will be populated below
        });
      }
    });

    // Get GroupMe user IDs for each user
    for (const [userId, userData] of allUsers.entries()) {
      try {
        const tokenSnapshot = await db.collection("groupme_tokens")
          .where("firebase_uid", "==", userId)
          .get();

        if (!tokenSnapshot.empty) {
          const tokenDoc = tokenSnapshot.docs[0];
          const tokenData = tokenDoc.data();
          userData.groupme_user_id = tokenData.user_id;
        }
      } catch (error) {
        logger.warn(`Failed to get GroupMe token for user ${userId}`, { error: error.message });
      }
    }

    const users = Array.from(allUsers.values());

    logger.info("Email lookup completed", {
      email: emailLower,
      users_found: users.length,
      users_with_groupme: users.filter(u => u.groupme_user_id).length
    });

    res.json({ users });

  } catch (error) {
    logger.error("Admin email lookup error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin GroupMe Name Lookup =====
export const groupmeAdminLookupName = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");

    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }

    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }

    const { name } = req.body;
    if (!name) return res.status(400).send("Missing name");

    // Normalize name to lowercase for case-insensitive search
    const nameLower = name.toLowerCase().trim();

    if (nameLower.length < 2) {
      return res.status(400).send("Name search must be at least 2 characters");
    }

    logger.info("Admin looking up user by name", {
      name: nameLower,
      admin: decodedToken.uid
    });

    // Get all users to search through
    const allSnapshot = await db.collection("users").get();
    const allUsers = new Map();

    allSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      const firstName = (userData.firstName || '').toLowerCase();
      const lastName = (userData.lastName || '').toLowerCase();
      const fullName = `${firstName} ${lastName}`.trim();

      // Check if first name, last name, or full name contains the search term (case-insensitive)
      if (firstName.includes(nameLower) || lastName.includes(nameLower) || fullName.includes(nameLower)) {
        allUsers.set(doc.id, {
          id: doc.id,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          email: userData.email || '',
          jobTitle: userData.jobTitle || '',
          storeNumber: userData.storeNumber || '',
          homeStore: userData.homeStore || '',
          allowedStores: userData.allowedStores || [],
          groupme_user_id: null // Will be populated below
        });
      }
    });

    // Get GroupMe user IDs for each user
    for (const [userId, userData] of allUsers.entries()) {
      try {
        const tokenSnapshot = await db.collection("groupme_tokens")
          .where("firebase_uid", "==", userId)
          .get();

        if (!tokenSnapshot.empty) {
          const tokenDoc = tokenSnapshot.docs[0];
          const tokenData = tokenDoc.data();
          userData.groupme_user_id = tokenData.user_id;
        }
      } catch (error) {
        logger.warn(`Failed to get GroupMe token for user ${userId}`, { error: error.message });
      }
    }

    const users = Array.from(allUsers.values());

    logger.info("Name lookup completed", {
      name: nameLower,
      users_found: users.length,
      users_with_groupme: users.filter(u => u.groupme_user_id).length
    });

    res.json({ users });

  } catch (error) {
    logger.error("Admin name lookup error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin GroupMe User Bots =====
export const groupmeAdminUserBots = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "GET") return res.status(405).send("Use GET");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }
    
    const { user_id } = req.query;
    if (!user_id) return res.status(400).send("Missing user_id (GroupMe user ID)");
    
    logger.info("Admin fetching bots for GroupMe user", { user_id, admin: decodedToken.uid });
    
    // Get user's GroupMe access token
    const tokensSnapshot = await db.collection("groupme_tokens")
      .where("user_id", "==", String(user_id))
      .get();
    
    if (tokensSnapshot.empty) {
      return res.json({ bots: [], groups: [], error: "No GroupMe tokens found for user" });
    }
    
    const tokenDoc = tokensSnapshot.docs[0];
    const tokenData = tokenDoc.data();
    const { access_token } = tokenData;
    
    // Fetch bots from GroupMe API
    const botsResponse = await fetch(`https://api.groupme.com/v3/bots?token=${access_token}`);
    const botsData = await botsResponse.json();
    
    // Fetch groups from GroupMe API
    const groupsResponse = await fetch(`https://api.groupme.com/v3/groups?token=${access_token}`);
    const groupsData = await groupsResponse.json();
    
    // Add group names to bots
    const bots = (botsData.response || []).map(bot => {
      const group = groupsData.response?.find(g => g.id === bot.group_id);
      return {
        ...bot,
        group_name: group?.name || 'Unknown Group'
      };
    });
    
    logger.info("Admin bot fetch completed", { 
      user_id, 
      bots_found: bots.length,
      groups_found: groupsData.response?.length || 0
    });
    
    res.json({ 
      bots,
      groups: groupsData.response || []
    });
    
  } catch (error) {
    logger.error("Admin user bots fetch error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin Create Bot For User =====
export const groupmeAdminCreateBotForUser = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }
    
    const { target_user_id, groupme_user_id, group_id, store_number } = req.body;
    if (!target_user_id || !groupme_user_id || !group_id || !store_number) {
      return res.status(400).send("Missing required fields: target_user_id, groupme_user_id, group_id, store_number");
    }
    
    logger.info("Admin creating bot for user", { 
      target_user_id, 
      groupme_user_id, 
      group_id, 
      store_number,
      admin: decodedToken.uid 
    });
    
    // Get target user's GroupMe access token
    const tokensSnapshot = await db.collection("groupme_tokens")
      .where("firebase_uid", "==", target_user_id)
      .where("user_id", "==", String(groupme_user_id))
      .get();
    
    if (tokensSnapshot.empty) {
      return res.status(404).send("No GroupMe tokens found for target user");
    }
    
    const tokenDoc = tokensSnapshot.docs[0];
    const tokenData = tokenDoc.data();
    const { access_token } = tokenData;
    
    // Create unique callback URL using store number, group ID, and timestamp
    const uniqueId = `${store_number}_${Date.now().toString(36)}`;
    const callbackUrl = `https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeWebhook?group_id=${group_id}&uid=${uniqueId}`;
    
    logger.info("Admin bot creation - Using callback URL", { callbackUrl, uniqueId, store_number });
    
    // Check for existing bots in this group and delete them to prevent conflicts
    try {
      const existingBotsSnapshot = await db.collection("groupme_bots")
        .where("user_id", "==", String(groupme_user_id))
        .where("group_id", "==", group_id)
        .get();
      
      for (const botDoc of existingBotsSnapshot.docs) {
        const botData = botDoc.data();
        logger.info("Admin bot creation - Deleting existing bot", { bot_id: botData.bot_id });
        
        try {
          // Delete from GroupMe API
          const deleteResp = await fetch(`https://api.groupme.com/v3/bots/destroy`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Access-Token": access_token
            },
            body: JSON.stringify({ bot_id: botData.bot_id })
          });
          
          if (deleteResp.ok) {
            logger.info("Admin bot creation - Existing bot deleted from GroupMe API", { bot_id: botData.bot_id });
          }
          
          // Delete from our database
          await db.collection("groupme_bots").doc(botData.bot_id).delete();
          
        } catch (deleteError) {
          logger.warn("Admin bot creation - Error deleting existing bot", { 
            bot_id: botData.bot_id, 
            error: deleteError.message 
          });
        }
      }
    } catch (checkError) {
      logger.warn("Admin bot creation - Error checking for existing bots", { error: checkError.message });
    }
    
    // Create the new bot
    const botRequest = {
      bot: {
        name: "CallBot",
        group_id: group_id,
        callback_url: callbackUrl
      }
    };
    
    logger.info("Admin bot creation - Calling GroupMe API", { botRequest });

    const resp = await fetch("https://api.groupme.com/v3/bots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": access_token
      },
      body: JSON.stringify(botRequest)
    });

    const responseText = await resp.text();
    logger.info("Admin bot creation - GroupMe API response", { 
      status: resp.status, 
      statusText: resp.statusText,
      response: responseText.substring(0, 300) 
    });

    if (!resp.ok) {
      throw new Error(`GroupMe API error: ${resp.status} ${responseText}`);
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Invalid JSON response: ${responseText}`);
    }

    const botInfo = result.response?.bot;
    if (!botInfo || !botInfo.bot_id) {
      throw new Error("Invalid bot response from GroupMe API");
    }

    // Store bot info in database with proper user association
    const botData = {
      bot_id: botInfo.bot_id,
      name: botInfo.name,
      group_id: group_id,
      user_id: String(groupme_user_id),
      firebase_uid: target_user_id,
      callback_url: callbackUrl,
      store: String(store_number),
      created_by_admin: decodedToken.uid,
      created_at: new Date(),
      avatar_url: botInfo.avatar_url || null
    };

    await db.collection("groupme_bots").doc(botInfo.bot_id).set(botData);
    logger.info("Admin bot creation - Bot stored in database", { bot_id: botInfo.bot_id, botData });

    res.json({ 
      success: true, 
      bot: botData,
      message: "Bot created successfully for user"
    });
    
  } catch (error) {
    logger.error("Admin bot creation error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin Create Bot For Self =====
export const groupmeAdminCreateBotForSelf = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }
    
    const { group_id, store_number } = req.body;
    if (!group_id || !store_number) {
      return res.status(400).send("Missing required fields: group_id, store_number");
    }
    
    logger.info("Admin creating bot for self", { 
      group_id, 
      store_number,
      admin: decodedToken.uid 
    });
    
    // Get admin's GroupMe access token
    const tokensSnapshot = await db.collection("groupme_tokens")
      .where("firebase_uid", "==", decodedToken.uid)
      .get();
    
    if (tokensSnapshot.empty) {
      return res.status(404).send("Admin doesn't have GroupMe connected");
    }
    
    const tokenDoc = tokensSnapshot.docs[0];
    const tokenData = tokenDoc.data();
    const { access_token, user_id: admin_groupme_user_id } = tokenData;
    
    // Create unique callback URL using store number, group ID, and timestamp
    const uniqueId = `${store_number}_${Date.now().toString(36)}`;
    const callbackUrl = `https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeWebhook?group_id=${group_id}&uid=${uniqueId}`;
    
    logger.info("Admin self bot creation - Using callback URL", { callbackUrl, uniqueId, store_number });
    
    // Check for existing admin bots in this group and delete them to prevent conflicts
    try {
      const existingBotsSnapshot = await db.collection("groupme_bots")
        .where("user_id", "==", String(admin_groupme_user_id))
        .where("group_id", "==", group_id)
        .get();
      
      for (const botDoc of existingBotsSnapshot.docs) {
        const botData = botDoc.data();
        logger.info("Admin self bot creation - Deleting existing bot", { bot_id: botData.bot_id });
        
        try {
          // Delete from GroupMe API
          const deleteResp = await fetch(`https://api.groupme.com/v3/bots/destroy`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Access-Token": access_token
            },
            body: JSON.stringify({ bot_id: botData.bot_id })
          });
          
          if (deleteResp.ok) {
            logger.info("Admin self bot creation - Existing bot deleted from GroupMe API", { bot_id: botData.bot_id });
          }
          
          // Delete from our database
          await db.collection("groupme_bots").doc(botData.bot_id).delete();
          
        } catch (deleteError) {
          logger.warn("Admin self bot creation - Error deleting existing bot", { 
            bot_id: botData.bot_id, 
            error: deleteError.message 
          });
        }
      }
    } catch (checkError) {
      logger.warn("Admin self bot creation - Error checking for existing bots", { error: checkError.message });
    }
    
    // Create the new bot with store-specific name
    const botRequest = {
      bot: {
        name: `CallBot Store ${store_number}`,
        group_id: group_id,
        callback_url: callbackUrl
      }
    };
    
    logger.info("Admin self bot creation - Calling GroupMe API", { botRequest });

    const resp = await fetch("https://api.groupme.com/v3/bots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": access_token
      },
      body: JSON.stringify(botRequest)
    });

    const responseText = await resp.text();
    logger.info("Admin self bot creation - GroupMe API response", { 
      status: resp.status, 
      statusText: resp.statusText,
      response: responseText.substring(0, 300) 
    });

    if (!resp.ok) {
      throw new Error(`GroupMe API error: ${resp.status} ${responseText}`);
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`Invalid JSON response: ${responseText}`);
    }

    const botInfo = result.response?.bot;
    if (!botInfo || !botInfo.bot_id) {
      throw new Error("Invalid bot response from GroupMe API");
    }

    // Store bot info in database with admin ownership
    const botData = {
      bot_id: botInfo.bot_id,
      name: botInfo.name,
      group_id: group_id,
      user_id: String(admin_groupme_user_id),
      firebase_uid: decodedToken.uid,
      callback_url: callbackUrl,
      store: String(store_number),
      admin_self_created: true,
      created_at: new Date(),
      avatar_url: botInfo.avatar_url || null
    };

    await db.collection("groupme_bots").doc(botInfo.bot_id).set(botData);
    logger.info("Admin self bot creation - Bot stored in database", { bot_id: botInfo.bot_id, botData });

    res.json({ 
      success: true, 
      bot: botData,
      message: `Admin bot created successfully for store ${store_number}`
    });
    
  } catch (error) {
    logger.error("Admin self bot creation error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin Get All Bots =====
export const groupmeAdminAllBots = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "GET") return res.status(405).send("Use GET");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }
    
    logger.info("Admin fetching all bots", { admin: decodedToken.uid });
    
    // Get all bots from the database
    const botsSnapshot = await db.collection("groupme_bots").get();
    
    const bots = [];
    const groupsCache = new Map(); // Cache groups by owner
    
    for (const doc of botsSnapshot.docs) {
      const botData = doc.data();
      
      // Get group info for this bot
      let groupName = 'Unknown Group';
      let memberCount = 0;
      
      try {
        // Check if we have this user's groups cached
        const cacheKey = botData.user_id;
        if (!groupsCache.has(cacheKey)) {
          // Fetch user's groups from GroupMe API
          const tokensSnapshot = await db.collection("groupme_tokens")
            .where("user_id", "==", String(botData.user_id))
            .limit(1)
            .get();
          
          if (!tokensSnapshot.empty) {
            const tokenData = tokensSnapshot.docs[0].data();
            const groupsResponse = await fetch(`https://api.groupme.com/v3/groups?token=${tokenData.access_token}`);
            
            if (groupsResponse.ok) {
              const groupsData = await groupsResponse.json();
              const groups = (groupsData.response || []).reduce((acc, g) => {
                acc[g.id] = {
                  name: g.name,
                  member_count: g.members ? g.members.length : 0
                };
                return acc;
              }, {});
              groupsCache.set(cacheKey, groups);
            }
          }
        }
        
        // Get group info from cache
        const userGroups = groupsCache.get(cacheKey) || {};
        const groupInfo = userGroups[botData.group_id];
        if (groupInfo) {
          groupName = groupInfo.name;
          memberCount = groupInfo.member_count;
        }
        
      } catch (error) {
        logger.warn("Failed to fetch group info for bot", { 
          bot_id: botData.bot_id, 
          group_id: botData.group_id, 
          error: error.message 
        });
      }
      
      bots.push({
        bot_id: botData.bot_id,
        name: botData.name || 'Unnamed Bot',
        group_id: botData.group_id,
        group_name: groupName,
        member_count: memberCount,
        user_id: botData.user_id,
        firebase_uid: botData.firebase_uid,
        store: botData.store || 'Unknown',
        callback_url: botData.callback_url,
        created_at: botData.created_at,
        created_by_admin: botData.created_by_admin,
        admin_self_created: botData.admin_self_created || false,
        avatar_url: botData.avatar_url
      });
    }
    
    // Sort by store number and creation date
    bots.sort((a, b) => {
      const storeA = parseInt(a.store) || 0;
      const storeB = parseInt(b.store) || 0;
      if (storeA !== storeB) {
        return storeA - storeB;
      }
      // If same store, sort by creation date (newest first)
      const dateA = a.created_at?.seconds || 0;
      const dateB = b.created_at?.seconds || 0;
      return dateB - dateA;
    });
    
    logger.info("Admin all bots fetch completed", { 
      total_bots: bots.length,
      admin_bots: bots.filter(b => b.admin_self_created).length,
      user_bots: bots.filter(b => !b.admin_self_created).length
    });
    
    res.json({ bots });
    
  } catch (error) {
    logger.error("Admin all bots fetch error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin Get Bot Details =====
export const groupmeAdminBotDetails = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "GET") return res.status(405).send("Use GET");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }
    
    const { bot_id } = req.query;
    if (!bot_id) {
      return res.status(400).send("Missing bot_id parameter");
    }
    
    logger.info("Admin fetching bot details", { admin: decodedToken.uid, bot_id });
    
    // Get bot from database
    const botDoc = await db.collection("groupme_bots").doc(bot_id).get();
    if (!botDoc.exists) {
      return res.status(404).send("Bot not found");
    }
    
    const botData = botDoc.data();
    
    try {
      // Get the bot owner's GroupMe access token
      const tokensSnapshot = await db.collection("groupme_tokens")
        .where("user_id", "==", String(botData.user_id))
        .limit(1)
        .get();
      
      if (tokensSnapshot.empty) {
        return res.json({
          bot: botData,
          groupDetails: null,
          members: [],
          recentMessages: [],
          error: "No GroupMe token found for bot owner"
        });
      }
      
      const tokenData = tokensSnapshot.docs[0].data();
      const { access_token } = tokenData;
      
      // Fetch detailed group information
      const groupResponse = await fetch(`https://api.groupme.com/v3/groups/${botData.group_id}?token=${access_token}`);
      let groupDetails = null;
      let members = [];
      
      if (groupResponse.ok) {
        const groupData = await groupResponse.json();
        const group = groupData.response;
        
        groupDetails = {
          id: group.id,
          name: group.name,
          description: group.description,
          image_url: group.image_url,
          creator_user_id: group.creator_user_id,
          created_at: group.created_at,
          updated_at: group.updated_at,
          member_count: group.members ? group.members.length : 0
        };
        
        // Get member details
        if (group.members) {
          members = group.members.map(member => ({
            user_id: member.user_id,
            nickname: member.nickname,
            image_url: member.image_url,
            roles: member.roles || [],
            muted: member.muted || false
          }));
        }
      }
      
      // Fetch recent messages (last 10)
      const messagesResponse = await fetch(`https://api.groupme.com/v3/groups/${botData.group_id}/messages?limit=10&token=${access_token}`);
      let recentMessages = [];
      
      if (messagesResponse.ok) {
        const messagesData = await messagesResponse.json();
        if (messagesData.response && messagesData.response.messages) {
          recentMessages = messagesData.response.messages.map(msg => ({
            id: msg.id,
            text: msg.text,
            name: msg.name,
            user_id: msg.user_id,
            created_at: msg.created_at,
            system: msg.system || false,
            favorited_by: msg.favorited_by ? msg.favorited_by.length : 0
          }));
        }
      }
      
      // Fetch bot details from GroupMe API
      const botsResponse = await fetch(`https://api.groupme.com/v3/bots?token=${access_token}`);
      let liveBotData = null;
      
      if (botsResponse.ok) {
        const botsData = await botsResponse.json();
        const bots = botsData.response || [];
        liveBotData = bots.find(b => b.bot_id === bot_id);
      }
      
      res.json({
        bot: {
          ...botData,
          live_data: liveBotData
        },
        groupDetails,
        members,
        recentMessages,
        timestamp: new Date()
      });
      
    } catch (error) {
      logger.error("Error fetching bot details from GroupMe API", { 
        bot_id, 
        error: error.message 
      });
      
      res.json({
        bot: botData,
        groupDetails: null,
        members: [],
        recentMessages: [],
        error: error.message
      });
    }
    
  } catch (error) {
    logger.error("Admin bot details error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin Delete Any Bot =====
export const groupmeAdminDeleteAnyBot = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }
    
    const { bot_id, user_id } = req.body;
    if (!bot_id || !user_id) {
      return res.status(400).send("Missing required fields: bot_id, user_id");
    }
    
    logger.info("Admin deleting any bot", { bot_id, user_id, admin: decodedToken.uid });
    
    // Get the GroupMe access token for the bot owner
    const tokensSnapshot = await db.collection("groupme_tokens")
      .where("user_id", "==", String(user_id))
      .get();
    
    if (tokensSnapshot.empty) {
      logger.warn("No GroupMe tokens found for bot owner", { user_id, bot_id });
      // Still try to delete from our database
    } else {
      // Delete from GroupMe API using bot owner's token
      const tokenDoc = tokensSnapshot.docs[0];
      const tokenData = tokenDoc.data();
      const { access_token } = tokenData;
      
      try {
        const deleteResp = await fetch(`https://api.groupme.com/v3/bots/destroy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Token": access_token
          },
          body: JSON.stringify({ bot_id })
        });
        
        if (deleteResp.ok) {
          logger.info("Admin delete - Bot deleted from GroupMe API", { bot_id });
        } else {
          logger.warn("Admin delete - Failed to delete bot from GroupMe API", { 
            bot_id, 
            status: deleteResp.status 
          });
        }
      } catch (apiError) {
        logger.warn("Admin delete - Error calling GroupMe API", { 
          bot_id, 
          error: apiError.message 
        });
      }
    }
    
    // Delete from our database regardless of API response
    await db.collection("groupme_bots").doc(bot_id).delete();
    logger.info("Admin delete - Bot deleted from database", { bot_id });
    
    res.json({ 
      success: true, 
      message: "Bot deleted successfully"
    });
    
  } catch (error) {
    logger.error("Admin delete any bot error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin User Management Functions =====

// Get detailed user data including work schedule
export const adminGetUserDetails = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "GET") return res.status(405).send("Use GET");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }
    
    const { user_id } = req.query;
    if (!user_id) return res.status(400).send("Missing user_id");
    
    logger.info("Admin getting user details", { user_id, admin: decodedToken.uid });
    
    // Get user document from Firestore
    const userDoc = await db.collection("users").doc(user_id).get();
    
    if (!userDoc.exists) {
      return res.status(404).send("User not found");
    }
    
    const userData = userDoc.data();
    
    // Return sanitized user data
    const userDetails = {
      id: user_id,
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      email: userData.email || '',
      storeNumber: userData.storeNumber || '',
      jobTitle: userData.jobTitle || '',
      role: userData.role || 'user',
      notificationsEnabled: userData.notificationsEnabled !== false,
      respectDoNotDisturb: userData.respectDoNotDisturb !== false,
      workSchedule: userData.workSchedule || null,
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt
    };
    
    logger.info("User details retrieved", { user_id, has_schedule: !!userData.workSchedule });
    
    res.json(userDetails);
    
  } catch (error) {
    logger.error("Admin get user details error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// Update user data
export const adminUpdateUser = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }
    
    const { user_id, updates } = req.body;
    if (!user_id || !updates) return res.status(400).send("Missing user_id or updates");
    
    logger.info("Admin updating user", { 
      user_id, 
      admin: decodedToken.uid,
      update_fields: Object.keys(updates)
    });
    
    // Validate update fields
    const allowedFields = [
      'firstName', 'lastName', 'email', 'storeNumber', 'homeStore', 'allowedStores',
      'activeStore', 'jobTitle', 'phone', 'role', 'approved',
      'notificationsEnabled', 'respectDoNotDisturb', 'workSchedule'
    ];
    
    const updateData = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateData[key] = value;
      }
    }
    
    // Add admin update metadata
    updateData.updatedAt = FieldValue.serverTimestamp();
    updateData.updatedBy = decodedToken.uid;
    
    // Get user document reference
    const userRef = db.collection("users").doc(user_id);
    
    // Check if user exists
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).send("User not found");
    }
    
    // Update user document
    await userRef.update(updateData);
    
    logger.info("User updated successfully", { 
      user_id, 
      admin: decodedToken.uid,
      updated_fields: Object.keys(updateData)
    });
    
    res.json({ 
      success: true, 
      message: "User updated successfully",
      updated_fields: Object.keys(updateData)
    });
    
  } catch (error) {
    logger.error("Admin update user error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin Set User Active Store =====
export const adminSetUserActiveStore = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");

    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }

    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }

    const { user_id, active_store } = req.body;
    if (!user_id || !active_store) {
      return res.status(400).send("Missing user_id or active_store");
    }

    logger.info("Admin setting user active store", {
      user_id,
      active_store,
      admin: decodedToken.uid
    });

    // Get user to validate they have access to this store
    const userDoc = await db.collection("users").doc(user_id).get();
    if (!userDoc.exists) {
      return res.status(404).send("User not found");
    }

    const userData = userDoc.data();
    const storeNumber = userData.storeNumber;
    const allowedStores = userData.allowedStores || [storeNumber];

    // Validate user has access to the requested store
    const hasAccess = allowedStores.includes(parseInt(active_store)) ||
                     allowedStores.includes(String(active_store)) ||
                     storeNumber === parseInt(active_store) ||
                     storeNumber === String(active_store);

    if (!hasAccess) {
      return res.status(403).send(`User does not have access to store ${active_store}. Allowed stores: ${allowedStores.join(', ')}`);
    }

    // Update active store
    await db.collection("users").doc(user_id).update({
      activeStore: active_store,
      activeStoreUpdatedAt: FieldValue.serverTimestamp()
    });

    logger.info("User active store updated successfully", {
      user_id,
      active_store,
      admin: decodedToken.uid
    });

    res.json({
      success: true,
      message: `Active store set to ${active_store}`,
      user_id,
      active_store
    });

  } catch (error) {
    logger.error("Admin set active store error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin Find Users with Blank Store Numbers =====
export const adminFindBlankStoreUsers = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).send("Use GET or POST");

    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }

    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }

    logger.info("Admin searching for users with blank store numbers", {
      admin: decodedToken.uid
    });

    // Get all users
    const allUsersSnapshot = await db.collection("users").get();

    const usersWithBlankStores = [];

    // Check each user for missing or blank store numbers
    allUsersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      const storeNumber = userData.storeNumber;
      const allowedStores = userData.allowedStores;

      // Check if storeNumber is missing, null, empty string, or undefined
      const hasBlankStore = !storeNumber ||
                           storeNumber === '' ||
                           storeNumber === null ||
                           storeNumber === undefined;

      // Also check if allowedStores is missing or empty
      const hasNoAllowedStores = !allowedStores ||
                                 !Array.isArray(allowedStores) ||
                                 allowedStores.length === 0;

      if (hasBlankStore || hasNoAllowedStores) {
        usersWithBlankStores.push({
          id: doc.id,
          firstName: userData.firstName || '',
          lastName: userData.lastName || '',
          email: userData.email || '',
          jobTitle: userData.jobTitle || '',
          storeNumber: storeNumber || null,
          homeStore: userData.homeStore || null,
          allowedStores: allowedStores || [],
          createdAt: userData.createdAt,
          provider: userData.provider || 'email',
          approved: userData.approved
        });
      }
    });

    logger.info("Blank store users search completed", {
      total_users: allUsersSnapshot.docs.length,
      blank_store_users: usersWithBlankStores.length
    });

    res.json({
      users: usersWithBlankStores,
      total_users: allUsersSnapshot.docs.length,
      blank_store_users: usersWithBlankStores.length
    });

  } catch (error) {
    logger.error("Admin find blank store users error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Admin Get User Details =====
export const adminUserDetails = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "GET") return res.status(405).send("Use GET");

    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }

    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }

    const user_id = req.query.user_id;
    if (!user_id) return res.status(400).send("Missing user_id");

    logger.info("Admin getting user details", {
      user_id,
      admin: decodedToken.uid
    });

    const userDoc = await db.collection("users").doc(user_id).get();

    if (!userDoc.exists) {
      return res.status(404).send("User not found");
    }

    const userData = userDoc.data();

    res.json({
      id: userDoc.id,
      ...userData
    });

  } catch (error) {
    logger.error("Admin user details error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== USER ACCOUNT DELETION =====
export const deleteUserAccount = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }

  try {
    // Authenticate user
    const decodedToken = await authenticateUser(req);
    const userId = decodedToken.uid;
    
    logger.info("Account deletion request received", { userId });

    // Get user data before deletion for cleanup
    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }

    const userData = userDoc.data();
    const userEmail = userData.email;
    const storeNumber = userData.storeNumber;

    // Start batch operations for atomic deletion
    const batch = db.batch();

    // 1. Delete user profile
    const userRef = db.collection("users").doc(userId);
    batch.delete(userRef);

    // 2. Delete user's QR scan history (anonymize scans they were involved in)
    const scansQuery = await db.collection("scans")
      .where("claimedBy", "==", userId)
      .get();
    
    scansQuery.forEach(doc => {
      const scanRef = db.collection("scans").doc(doc.id);
      batch.update(scanRef, {
        claimedBy: null,
        claimedByName: "Deleted User",
        claimedAt: null
      });
    });

    // 3. Delete user's GroupMe tokens and bots
    const tokensQuery = await db.collection("groupme_tokens")
      .where("firebase_uid", "==", userId)
      .get();
    
    tokensQuery.forEach(doc => {
      batch.delete(doc.ref);
    });

    const botsQuery = await db.collection("groupme_bots")
      .where("firebase_uid", "==", userId)
      .get();

    // Store bot deletion tasks for after batch commit
    const botDeletionTasks = [];
    botsQuery.forEach(doc => {
      const botData = doc.data();
      // Get access token from tokens query for bot deletion
      const tokenDoc = tokensQuery.docs.find(t => t.data().user_id === botData.user_id);
      if (tokenDoc) {
        botDeletionTasks.push({
          bot_id: botData.bot_id,
          access_token: tokenDoc.data().access_token
        });
      }
      batch.delete(doc.ref);
    });

    // 4. Delete user's support tickets
    const ticketsQuery = await db.collection("tickets")
      .where("userId", "==", userId)
      .get();
    
    ticketsQuery.forEach(doc => {
      batch.delete(doc.ref);
    });

    // 5. Delete pending profile changes
    const pendingChangesQuery = await db.collection("pending_changes")
      .where("userId", "==", userId)
      .get();
    
    pendingChangesQuery.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Commit all Firestore deletions
    await batch.commit();

    // Delete GroupMe bots from API (after Firestore batch)
    for (const bot of botDeletionTasks) {
      try {
        const deleteResp = await fetch(`https://api.groupme.com/v3/bots/destroy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Access-Token": bot.access_token
          },
          body: JSON.stringify({ bot_id: bot.bot_id })
        });
        
        if (deleteResp.ok) {
          logger.info("GroupMe bot deleted during account deletion", { bot_id: bot.bot_id, userId });
        } else {
          logger.warn("Failed to delete GroupMe bot during account deletion", { 
            bot_id: bot.bot_id, 
            status: deleteResp.status,
            userId 
          });
        }
      } catch (botError) {
        logger.error("Error deleting GroupMe bot during account deletion", { 
          bot_id: bot.bot_id, 
          error: botError.message,
          userId 
        });
      }
    }

    // Delete Firebase Auth account (this will invalidate all tokens)
    try {
      await getAuth().deleteUser(userId);
      logger.info("Firebase Auth account deleted", { userId, userEmail });
    } catch (authError) {
      logger.error("Failed to delete Firebase Auth account", { 
        userId, 
        userEmail, 
        error: authError.message 
      });
      // Continue even if auth deletion fails
    }

    // Log successful account deletion
    logger.info("Account deletion completed", { 
      userId, 
      userEmail, 
      storeNumber,
      scansAnonymized: scansQuery.size,
      botsDeleted: botDeletionTasks.length,
      ticketsDeleted: ticketsQuery.size
    });

    // Create deletion record for compliance
    await db.collection("account_deletions").add({
      deletedUserId: userId,
      deletedUserEmail: userEmail,
      storeNumber: storeNumber,
      deletionDate: FieldValue.serverTimestamp(),
      dataDeleted: {
        userProfile: true,
        scansAnonymized: scansQuery.size,
        groupmeTokens: tokensQuery.size,
        groupmeBots: botDeletionTasks.length,
        supportTickets: ticketsQuery.size,
        pendingChanges: pendingChangesQuery.size,
        firebaseAuth: true
      }
    });

    res.json({ 
      success: true, 
      message: "Account and all associated data have been permanently deleted.",
      deletionId: userId,
      dataRemoved: {
        userProfile: true,
        scansAnonymized: scansQuery.size,
        groupmeData: tokensQuery.size + botDeletionTasks.length,
        supportTickets: ticketsQuery.size,
        pendingChanges: pendingChangesQuery.size
      }
    });

  } catch (error) {
    logger.error("Account deletion error:", error);
    res.status(500).json({ 
      error: "Failed to delete account", 
      message: error.message 
    });
  }
});

// ===== Debug: Get user version statistics =====
export const getUserVersionStats = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    // Authenticate user
    const decodedToken = await authenticateUser(req);
    
    // Check if user is admin
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Get all users with version info
    const usersSnapshot = await db.collection("users").get();
    const versionStats = {};
    const outdatedUsers = [];
    const currentLatestVersion = "1.7.26"; // Update this when releasing new versions

    let totalUsers = 0;
    let usersWithVersionInfo = 0;

    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      totalUsers++;

      if (userData.appVersion) {
        usersWithVersionInfo++;
        const version = userData.appVersion;
        
        if (!versionStats[version]) {
          versionStats[version] = {
            count: 0,
            users: []
          };
        }
        
        versionStats[version].count++;
        versionStats[version].users.push({
          uid: doc.id,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          storeNumber: userData.storeNumber,
          lastSeen: userData.lastSeen,
          deviceInfo: userData.deviceInfo,
          appVersionCode: userData.appVersionCode
        });

        // Check if user is running outdated version
        if (version !== currentLatestVersion) {
          outdatedUsers.push({
            uid: doc.id,
            email: userData.email,
            firstName: userData.firstName,
            lastName: userData.lastName,
            storeNumber: userData.storeNumber,
            currentVersion: version,
            lastSeen: userData.lastSeen,
            deviceInfo: userData.deviceInfo
          });
        }
      }
    });

    // Sort versions by count
    const sortedVersions = Object.entries(versionStats)
      .sort(([,a], [,b]) => b.count - a.count)
      .map(([version, data]) => ({ version, ...data }));

    res.json({
      totalUsers,
      usersWithVersionInfo,
      usersWithoutVersionInfo: totalUsers - usersWithVersionInfo,
      currentLatestVersion,
      versionStats: sortedVersions,
      outdatedUsers: outdatedUsers.length,
      outdatedUsersList: outdatedUsers.slice(0, 20) // Limit to first 20 for performance
    });

  } catch (error) {
    logger.error("Error getting user version stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== Debug: Check specific user's shift status (no auth for testing) =====
export const debugUserShiftStatus = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    // Temporary: Skip authentication for debugging
    // TODO: Re-enable authentication after debugging

    const { storeNumber, userEmail } = req.query;
    
    if (!storeNumber) {
      return res.status(400).json({ error: "storeNumber parameter required" });
    }

    // Get users for the store
    let usersSnapshot = await db.collection("users")
      .where("storeNumber", "==", parseInt(storeNumber))
      .get();
    
    if (usersSnapshot.empty) {
      usersSnapshot = await db.collection("users")
        .where("storeNumber", "==", String(storeNumber))
        .get();
    }

    const debugInfo = {
      storeNumber,
      currentTime: new Date().toISOString(),
      usersFound: usersSnapshot.docs.length,
      users: []
    };

    usersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      const userName = userData.firstName || userData.email || "Unknown";
      
      // Skip if filtering by email and this isn't the user
      if (userEmail && userData.email !== userEmail) {
        return;
      }

      const shiftStatus = isUserOnShift(userData);
      const hasValidFCM = userData.fcmToken && userData.fcmToken.length > 10;

      debugInfo.users.push({
        uid: doc.id,
        email: userData.email,
        firstName: userData.firstName,
        storeNumber: userData.storeNumber,
        notificationsEnabled: userData.notificationsEnabled,
        hasValidFCMToken: hasValidFCM,
        fcmTokenLength: userData.fcmToken ? userData.fcmToken.length : 0,
        workSchedule: userData.workSchedule,
        isOnShift: shiftStatus,
        wouldReceiveNotification: hasValidFCM && shiftStatus,
        lastSeen: userData.lastSeen,
        appVersion: userData.appVersion
      });
    });

    res.json(debugInfo);

  } catch (error) {
    logger.error("Error debugging user shift status:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== Debug: Send update notification to outdated users =====
export const notifyOutdatedUsers = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    // Authenticate user
    const decodedToken = await authenticateUser(req);
    
    // Check if user is admin
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const { targetVersion, message, forceUpdate } = req.body;
    const currentLatestVersion = "1.7.26";

    // Get users running outdated versions
    const usersSnapshot = await db.collection("users")
      .where("appVersion", "!=", currentLatestVersion)
      .get();

    if (usersSnapshot.empty) {
      return res.json({ 
        message: "No outdated users found",
        notificationsSent: 0 
      });
    }

    let notificationsSent = 0;
    const failedNotifications = [];

    // Send notification to each outdated user
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      
      if (userData.fcmToken && userData.fcmToken.length > 10) {
        try {
          const notificationMessage = {
            data: {
              type: "app_update",
              title: "App Update Available",
              body: message || `Please update to the latest version (${currentLatestVersion})`,
              currentVersion: userData.appVersion || "unknown",
              latestVersion: currentLatestVersion,
              forceUpdate: forceUpdate ? "true" : "false"
            },
            android: {
              priority: "high"
            },
            token: userData.fcmToken
          };

          await getMessaging().send(notificationMessage);
          notificationsSent++;
          
          logger.info(`Update notification sent to user ${userData.email} (v${userData.appVersion})`);
          
        } catch (error) {
          logger.error(`Failed to send update notification to ${userData.email}:`, error);
          failedNotifications.push({
            email: userData.email,
            error: error.message
          });
        }
      }
    }

    res.json({
      message: `Update notifications sent successfully`,
      notificationsSent,
      totalOutdatedUsers: usersSnapshot.docs.length,
      failedNotifications
    });

  } catch (error) {
    logger.error("Error sending update notifications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ===== Get user response statistics =====
export const getUserResponseStatsAPI = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).json({ error: "Too many requests. Please try again later." });
    }
    
    // Authenticate user and verify admin using same pattern as other admin functions
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    logger.info("Analytics request from admin user:", decodedToken.uid);

    // Parse request data
    const { userId, storeNumber, days = 30 } = req.method === 'POST' ? req.body : req.query;
    logger.info("Request params:", { userId, storeNumber, days, method: req.method });
    
    if (!userId && !storeNumber) {
      logger.warn("Missing required parameters");
      return res.status(400).json({ error: 'Either userId or storeNumber is required' });
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    logger.info("Date range:", { startDate: startDate.toISOString(), endDate: endDate.toISOString() });

    // Query scans collection for responses
    logger.info("Building query for scans collection...");
    
    // Start with store filter first, then add timestamp filter
    let query;
    if (storeNumber) {
      logger.info("Starting with store filter:", storeNumber);
      query = db.collection('scans')
        .where('storeNumber', '==', storeNumber.toString())
        .where('timestamp', '>=', Timestamp.fromDate(startDate))
        .where('timestamp', '<=', Timestamp.fromDate(endDate));
    } else {
      // If no store filter, just use timestamp range
      query = db.collection('scans')
        .where('timestamp', '>=', Timestamp.fromDate(startDate))
        .where('timestamp', '<=', Timestamp.fromDate(endDate));
    }

    logger.info("Executing query...");
    const scansSnapshot = await query.get();
    logger.info("Query completed, found documents:", scansSnapshot.size);
    
    // Process response statistics
    logger.info("Starting data processing...");
    const userStats = {};
    let totalAssists = 0;
    let totalIgnores = 0;
    let totalClaims = 0;
    let totalTimeouts = 0;

    scansSnapshot.docs.forEach((doc, index) => {
      try {
        const scanData = doc.data();
        if (index < 3) {
          logger.info(`Sample scan ${index}:`, {
            id: doc.id,
            storeNumber: scanData.storeNumber,
            claimedBy: scanData.claimedBy,
            responsesCount: scanData.responses ? scanData.responses.length : 0
          });
        }

        // Count claim-based assists (in-app assists)
      if (scanData.claimedBy && (!userId || scanData.claimedBy === userId)) {
        const userKey = scanData.claimedBy;
        if (!userStats[userKey]) {
          userStats[userKey] = {
            userId: userKey,
            userName: scanData.claimedByName || 'Unknown',
            assists: 0,
            ignores: 0,
            claims: 0,
            timeouts: 0,
            responseTimes: [], // Track individual response times for speed bonus
            lastActivity: null
          };
        }
        userStats[userKey].claims++;
        totalClaims++;

        // Calculate response time for speed bonus
        if (scanData.claimedAt && scanData.timestamp) {
          const responseTimeMs = scanData.claimedAt.toMillis() - scanData.timestamp.toMillis();
          userStats[userKey].responseTimes.push(responseTimeMs);
        }

        if (scanData.claimedAt && (!userStats[userKey].lastActivity || scanData.claimedAt.toDate() > userStats[userKey].lastActivity)) {
          userStats[userKey].lastActivity = scanData.claimedAt.toDate();
        }
      }

      // Count response array entries (notification button assists/ignores/timeouts)
      if (scanData.responses && Array.isArray(scanData.responses)) {
        scanData.responses.forEach(response => {
          if (!userId || response.userId === userId) {
            const userKey = response.userId;
            if (!userStats[userKey]) {
              userStats[userKey] = {
                userId: userKey,
                userName: response.userName || (response.firstName && response.lastName ? `${response.firstName} ${response.lastName}` : 'Unknown'),
                assists: 0,
                ignores: 0,
                claims: 0,
                timeouts: 0,
                responseTimes: [],
                lastActivity: null
              };
            }

            if (response.action === 'assist') {
              userStats[userKey].assists++;
              totalAssists++;

              // Track response time for assists from notification buttons
              if (response.responseTime) {
                userStats[userKey].responseTimes.push(response.responseTime);
              } else if (response.timestamp && scanData.timestamp) {
                const responseTimeMs = response.timestamp.toMillis() - scanData.timestamp.toMillis();
                userStats[userKey].responseTimes.push(responseTimeMs);
              }
            } else if (response.action === 'ignore') {
              // Separate manual ignores from timeouts
              if (response.source === 'timeout') {
                userStats[userKey].timeouts++;
                totalTimeouts++;
              } else {
                userStats[userKey].ignores++;
                totalIgnores++;
              }
            }

            if (response.timestamp && (!userStats[userKey].lastActivity || response.timestamp.toDate() > userStats[userKey].lastActivity)) {
              userStats[userKey].lastActivity = response.timestamp.toDate();
            }
          }
        });
      }
      } catch (docError) {
        logger.error(`Error processing document ${doc.id}:`, docError);
      }
    });

    logger.info("Data processing completed", {
      totalScans: scansSnapshot.size,
      uniqueUsers: Object.keys(userStats).length,
      totalAssists,
      totalIgnores,
      totalClaims,
      totalTimeouts
    });

    // Calculate weighted score based on formula:
    // Score = (Assists × 100) + Speed Bonus - (Manual Ignores × 5) - (Timeouts × 50)
    const calculateWeightedScore = (user) => {
      let score = 0;

      // Base assist points (includes both claims and notification assists)
      const totalAssistsForUser = user.assists + user.claims;
      score += totalAssistsForUser * 100;

      // Speed bonus calculation
      user.responseTimes.forEach(responseTimeMs => {
        const responseTimeSeconds = responseTimeMs / 1000;
        if (responseTimeSeconds < 30) {
          score += 25; // <30s: +25 pts
        } else if (responseTimeSeconds < 60) {
          score += 15; // 30-60s: +15 pts
        } else if (responseTimeSeconds < 120) {
          score += 10; // 1-2min: +10 pts
        } else if (responseTimeSeconds < 180) {
          score += 5;  // 2-3min: +5 pts
        } else if (responseTimeSeconds < 300) {
          score += 0;  // 3-5min: 0 pts
        } else {
          score -= 10; // >5min: -10 pts
        }
      });

      // Penalties
      score -= user.ignores * 5;    // Manual ignore: -5 pts
      score -= user.timeouts * 50;  // Timeout: -50 pts

      return Math.round(score);
    };

    // Convert to array and calculate weighted scores
    const userArray = Object.values(userStats).map(user => {
      const weightedScore = calculateWeightedScore(user);
      return {
        ...user,
        totalResponses: user.assists + user.ignores + user.claims + user.timeouts,
        responseRate: user.assists + user.claims > 0 ?
          ((user.assists + user.claims) / (user.assists + user.ignores + user.claims + user.timeouts) * 100).toFixed(1) : '0.0',
        weightedScore,
        // Don't send responseTimes array to client (just used for calculation)
        responseTimes: undefined
      };
    }).sort((a, b) => b.weightedScore - a.weightedScore); // Sort by weighted score

    const result = {
      users: userArray,
      summary: {
        totalAssists,
        totalIgnores,
        totalClaims,
        totalTimeouts,
        totalResponses: totalAssists + totalIgnores + totalClaims + totalTimeouts,
        totalScans: scansSnapshot.docs.length,
        responseRate: scansSnapshot.docs.length > 0 ?
          ((totalAssists + totalClaims) / scansSnapshot.docs.length * 100).toFixed(1) : '0.0',
        dateRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: parseInt(days)
        }
      }
    };

    res.json(result);

  } catch (error) {
    logger.error("Error getting user response stats:", {
      message: error.message,
      stack: error.stack,
      code: error.code
    });
    
    // Return more specific error information
    res.status(500).json({ 
      error: 'Failed to get response statistics',
      details: error.message,
      code: error.code
    });
  }
});

// ===== Scheduled Function: Process Notification Timeouts =====
export const processNotificationTimeouts = onSchedule({
  schedule: "* * * * *", // Every minute (cron format: min hour day month dayofweek)
  timeZone: "America/Chicago",
  region: REGION,
  retryConfig: {
    retryCount: 3,
    maxRetryDuration: "60s"
  }
}, async (event) => {
  try {
    logger.info("Starting notification timeout processing...");
    
    // Get scans that need timeout processing (created more than 60 seconds ago)
    const cutoffTime = new Date(Date.now() - 60 * 1000); // 60 seconds ago
    const scansQuery = await db.collection("scans")
      .where("timeoutProcessed", "==", false)
      .where("status", "==", "pending")
      .where("timestamp", "<", Timestamp.fromDate(cutoffTime))
      .limit(50) // Process in batches
      .get();
    
    if (scansQuery.empty) {
      logger.info("No scans requiring timeout processing found");
      return;
    }
    
    logger.info(`Processing timeouts for ${scansQuery.size} scans`);
    
    for (const scanDoc of scansQuery.docs) {
      const scanData = scanDoc.data();
      const scanId = scanDoc.id;
      
      try {
        await processIndividualScanTimeout(scanId, scanData);
      } catch (error) {
        logger.error(`Error processing timeout for scan ${scanId}:`, error);
      }
    }
    
    logger.info("Notification timeout processing completed");
  } catch (error) {
    logger.error("Error in processNotificationTimeouts:", error);
  }
});

// ===== Helper: Process Individual Scan Timeout =====
async function processIndividualScanTimeout(scanId, scanData) {
  logger.info(`Processing timeout for scan ${scanId}`);
  
  // Check if already claimed or resolved
  if (scanData.status !== "pending" || scanData.claimedBy) {
    logger.info(`Scan ${scanId} already resolved, marking timeout as processed`);
    await db.collection("scans").doc(scanId).update({
      timeoutProcessed: true
    });
    return;
  }
  
  const eligibleUsers = scanData.eligibleUsers || [];
  const responses = scanData.responses || [];
  
  // Create a map of user responses for quick lookup
  const userResponses = new Map();
  responses.forEach(response => {
    userResponses.set(response.userId, response.action);
  });
  
  // Track timeout ignores and update eligible users
  const updatedEligibleUsers = [];
  const timeoutIgnores = [];
  let allUsersIgnored = true;
  
  for (const user of eligibleUsers) {
    const userResponse = userResponses.get(user.uid);
    
    if (userResponse) {
      // User already responded explicitly
      updatedEligibleUsers.push({
        ...user,
        responded: true,
        responseType: userResponse
      });
      if (userResponse === 'assist') {
        allUsersIgnored = false;
      }
    } else {
      // User didn't respond - mark as timeout ignore
      updatedEligibleUsers.push({
        ...user,
        responded: true,
        responseType: 'timeout'
      });
      
      // Add timeout ignore to responses array
      timeoutIgnores.push({
        userId: user.uid,
        userName: user.name,
        action: 'ignore',
        timestamp: FieldValue.serverTimestamp(),
        source: 'timeout',
        responseTime: 60000 // 60 seconds
      });
    }
  }
  
  // Update scan document with timeout processing
  const updateData = {
    timeoutProcessed: true,
    eligibleUsers: updatedEligibleUsers
  };
  
  // Add timeout ignores to responses array
  if (timeoutIgnores.length > 0) {
    updateData.responses = FieldValue.arrayUnion(...timeoutIgnores);
    logger.info(`Adding ${timeoutIgnores.length} timeout ignores for scan ${scanId}`);
  }
  
  await db.collection("scans").doc(scanId).update(updateData);
  
  // Check if all users ignored and send secondary alert
  if (allUsersIgnored && !scanData.secondaryAlertSent) {
    await sendSecondaryAlert(scanId, scanData);
  }
  
  logger.info(`Timeout processing completed for scan ${scanId}`, {
    eligibleUsers: eligibleUsers.length,
    timeoutIgnores: timeoutIgnores.length,
    allUsersIgnored
  });
}

// ===== Helper: Send Secondary Alert =====
async function sendSecondaryAlert(scanId, scanData) {
  try {
    logger.info(`All users ignored scan ${scanId}, sending secondary alert`);
    
    // Mark secondary alert as sent to prevent duplicates
    await db.collection("scans").doc(scanId).update({
      secondaryAlertSent: true,
      secondaryAlertSentAt: FieldValue.serverTimestamp()
    });
    
    // Send escalated notification only to managers or designated escalation contacts
    // LEGAL COMPLIANCE: Do not notify off-shift employees to avoid unpaid work issues
    const store = scanData.storeNumber;
    const area = scanData.areaDescription || "Unknown Area";
    
    // Get users with manager role or escalation permissions for the store
    let managersSnapshot = await db.collection("users")
      .where("storeNumber", "==", parseInt(store))
      .where("role", "==", "manager")
      .get();
    
    if (managersSnapshot.empty) {
      managersSnapshot = await db.collection("users")
        .where("storeNumber", "==", String(store))
        .where("role", "==", "manager")
        .get();
    }
    
    // If no managers found, try escalation contacts (admin email for now)
    if (managersSnapshot.empty) {
      logger.info(`No managers found for store ${store}, secondary alert logged only`);
      
      // Log escalation for admin review instead of sending notifications
      await db.collection("escalation_logs").add({
        scanId: scanId,
        storeNumber: store,
        areaDescription: area,
        timestamp: FieldValue.serverTimestamp(),
        reason: "All on-shift users ignored - no managers available",
        requiresAdminAttention: true
      });
      
      logger.warn(`ESCALATION REQUIRED: Store ${store} - No response to customer request in ${area}. No managers available for notification.`);
      return;
    }
    
    const escalatedNotificationData = {
      scanId: scanId,
      storeNumber: store,
      areaDescription: area,
      timestamp: Date.now().toString(),
      title: "🔴 MANAGER ALERT: Customer Assistance Required",
      body: `Store ${store}: All on-shift staff ignored customer request in ${area}. Manager intervention needed.`,
      isEscalated: "true",
      managerAlert: "true"
    };
    
    let escalationCount = 0;
    
    // Only send to managers who are currently on shift to avoid legal issues
    for (const managerDoc of managersSnapshot.docs) {
      const managerData = managerDoc.data();
      
      // Check if manager is currently on shift
      const managerOnShift = isUserOnShift(managerData);
      
      if (managerData.fcmToken && managerData.fcmToken.length > 10 && managerOnShift) {
        try {
          const message = {
            data: escalatedNotificationData,
            android: {
              priority: "high",
              ttl: 3600,
              notification: {
                channelId: "customer_assistance",
                sound: "default",
                priority: "high", // Use high instead of max to avoid Google policy issues
                visibility: "public",
                defaultSound: true,
                defaultVibrateTimings: true,
                notificationCount: 1
              }
            },
            token: managerData.fcmToken
          };
          
          await getMessaging().send(message);
          escalationCount++;
          logger.info(`Escalation sent to on-shift manager: ${managerData.firstName || 'unknown'}`);
        } catch (error) {
          logger.error(`Failed to send escalated notification to manager ${managerData.firstName || 'unknown'}:`, error);
        }
      } else if (!managerOnShift) {
        logger.info(`Manager ${managerData.firstName || 'unknown'} is off-shift, skipping escalation notification`);
      }
    }
    
    // If no on-shift managers available, log for admin review
    if (escalationCount === 0) {
      await db.collection("escalation_logs").add({
        scanId: scanId,
        storeNumber: store,
        areaDescription: area,
        timestamp: FieldValue.serverTimestamp(),
        reason: "All on-shift users ignored - managers exist but are off-shift",
        requiresAdminAttention: true,
        managersFound: managersSnapshot.size
      });
      
      logger.warn(`ESCALATION LOGGED: Store ${store} - No on-shift managers available for escalation. Admin review required.`);
    }
    
    logger.info(`Secondary alert sent for scan ${scanId}`, {
      store,
      area,
      escalationsSent: escalationCount,
      totalUsers: usersSnapshot.size
    });
    
  } catch (error) {
    logger.error(`Error sending secondary alert for scan ${scanId}:`, error);
  }
}

// ===== Handle Notification Response (Assist/Ignore) =====
export const notificationResponse = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Authenticate user
    const user = await authenticateUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { scanId, action } = req.body;
    
    if (!scanId || !action || !['assist', 'ignore'].includes(action)) {
      return res.status(400).json({ error: "Invalid scanId or action" });
    }

    // Get user details
    const userDoc = await db.collection("users").doc(user.uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const userData = userDoc.data();
    const userName = userData.firstName || userData.fullName || 'Unknown';

    // Get scan document
    const scanDoc = await db.collection("scans").doc(scanId).get();
    if (!scanDoc.exists) {
      return res.status(404).json({ error: "Scan not found" });
    }

    const scanData = scanDoc.data();
    
    // Check if scan is still pending
    if (scanData.status !== "pending") {
      return res.status(400).json({ error: "Scan is no longer pending" });
    }

    // Check if user already responded
    const existingResponse = scanData.responses?.find(r => r.userId === user.uid);
    if (existingResponse) {
      return res.status(400).json({ error: "User already responded to this scan" });
    }

    // Create response record
    const responseRecord = {
      userId: user.uid,
      userName: userName,
      action: action,
      timestamp: FieldValue.serverTimestamp(),
      source: 'notification',
      responseTime: Date.now() - (scanData.timestampMs || Date.now())
    };

    // Update scan document with response
    const updateData = {
      responses: FieldValue.arrayUnion(responseRecord)
    };

    // If assist, claim the scan
    if (action === 'assist') {
      updateData.claimedBy = user.uid;
      updateData.claimedByName = userName;
      updateData.claimedAt = FieldValue.serverTimestamp();
      updateData.status = "claimed";
    }

    // Update eligible users array to mark user as responded
    const eligibleUsers = scanData.eligibleUsers || [];
    const updatedEligibleUsers = eligibleUsers.map(eligibleUser => 
      eligibleUser.uid === user.uid ? { ...eligibleUser, responded: true, responseType: action } : eligibleUser
    );
    if (updatedEligibleUsers.length > 0) {
      updateData.eligibleUsers = updatedEligibleUsers;
    }

    await db.collection("scans").doc(scanId).update(updateData);

    logger.info(`Notification response recorded`, {
      scanId,
      userId: user.uid,
      userName,
      action,
      responseTime: responseRecord.responseTime
    });

    res.json({ 
      success: true, 
      action,
      scanId,
      userName,
      claimed: action === 'assist'
    });

  } catch (error) {
    logger.error("Error handling notification response:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Get Active Associates Count =====
export const getActiveAssociatesCount = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Authenticate user
    const user = await authenticateUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { storeNumber } = req.body;
    
    if (!storeNumber) {
      return res.status(400).json({ error: "Store number is required" });
    }

    // Get all users for the store
    let usersSnapshot = await db.collection("users")
      .where("storeNumber", "==", parseInt(storeNumber))
      .get();
    
    if (usersSnapshot.empty) {
      usersSnapshot = await db.collection("users")
        .where("storeNumber", "==", String(storeNumber))
        .get();
    }

    if (usersSnapshot.empty) {
      return res.json({ activeCount: 0, totalUsers: 0 });
    }

    // Calculate 96 hours ago
    const cutoffTime = new Date(Date.now() - (96 * 60 * 60 * 1000));
    
    let activeCount = 0;
    const totalUsers = usersSnapshot.size;

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      
      // Check if user has recent activity (last login, FCM token update, etc.)
      let hasRecentActivity = false;
      
      // Check various activity timestamps
      const activityTimestamps = [
        userData.lastLoginAt,
        userData.fcmTokenUpdatedAt,
        userData.updatedAt,
        userData.lastActiveAt
      ].filter(Boolean);

      for (const timestamp of activityTimestamps) {
        const activityTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        if (activityTime > cutoffTime) {
          hasRecentActivity = true;
          break;
        }
      }

      // Check if user is currently on shift
      const isOnShift = isUserOnShift(userData);

      // Count if both conditions are met
      if (hasRecentActivity && isOnShift) {
        activeCount++;
      }
    }

    logger.info(`Active associates count for store ${storeNumber}`, {
      activeCount,
      totalUsers,
      cutoffTime: cutoffTime.toISOString()
    });

    res.json({ 
      activeCount, 
      totalUsers,
      storeNumber: String(storeNumber)
    });

  } catch (error) {
    logger.error("Error getting active associates count:", error);
    res.status(500).json({ error: error.message });
  }
});
// ===== Get Active Associates Details =====
export const getActiveAssociates = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }
    
    // Authenticate user
    const user = await authenticateUser(req);
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    const { storeNumber } = req.body;
    
    // Query for users with BOTH string and integer store numbers (since data is inconsistent)
    let allUserDocs = [];

    if (storeNumber) {
      // Query for string store number
      const usersQueryString = db.collection("users")
        .where("notificationsEnabled", "==", true)
        .where("storeNumber", "==", String(storeNumber));

      // Query for integer store number
      const usersQueryInt = db.collection("users")
        .where("notificationsEnabled", "==", true)
        .where("storeNumber", "==", parseInt(storeNumber));

      const [stringSnapshot, intSnapshot] = await Promise.all([
        usersQueryString.get(),
        usersQueryInt.get()
      ]);

      // Merge results, avoiding duplicates
      const seenIds = new Set();
      stringSnapshot.docs.forEach(doc => {
        allUserDocs.push(doc);
        seenIds.add(doc.id);
      });
      intSnapshot.docs.forEach(doc => {
        if (!seenIds.has(doc.id)) {
          allUserDocs.push(doc);
        }
      });
    } else {
      // No store filter - get all users with notifications enabled
      const usersQuery = db.collection("users")
        .where("notificationsEnabled", "==", true);
      const usersSnapshot = await usersQuery.get();
      allUserDocs = usersSnapshot.docs;
    }

    if (allUserDocs.length === 0) {
      return res.json({
        activeAssociates: [],
        storeNumber: storeNumber ? String(storeNumber) : 'all',
        retrievedAt: new Date().toISOString()
      });
    }
    
    // Calculate cutoff times
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - (96 * 60 * 60 * 1000)); // 96 hours ago (for display only)

    const activeAssociates = [];

    // Process users in batches for better performance
    const users = allUserDocs;

    for (const userDoc of users) {
      const userData = userDoc.data();

      // Check if user is currently on shift (no activity requirement - show anyone on shift)
      const shiftInfo = getUserShiftInfo(userData, now);

      if (!shiftInfo.isOnShift) continue; // Skip if not on shift

      // Track activity for display purposes (but don't filter by it)
      const activityTimestamps = [
        userData.lastLoginAt,
        userData.fcmTokenUpdatedAt,
        userData.updatedAt,
        userData.lastActiveAt
      ].filter(Boolean);

      let mostRecentActivity = null;
      let hasRecentActivity = false;

      for (const timestamp of activityTimestamps) {
        const activityTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        if (!mostRecentActivity || activityTime > mostRecentActivity) {
          mostRecentActivity = activityTime;
        }
        if (activityTime > cutoffTime) {
          hasRecentActivity = true;
        }
      }

      // Calculate accurate shift end time in user's timezone
      const shiftEndTime = calculateShiftEndTime(userData, shiftInfo, now);
      
      activeAssociates.push({
        id: userDoc.id,
        firstName: userData.firstName || 'Unknown',
        lastName: userData.lastName || 'User',
        storeNumber: userData.storeNumber,
        jobTitle: userData.jobTitle || 'Associate',
        shiftStart: shiftInfo.startTime,  // Changed from currentShiftStart to match Android app
        shiftEnd: shiftInfo.endTime,      // Changed from currentShiftEnd to match Android app
        shiftEndTime: shiftEndTime,
        timezone: shiftInfo.timezone,
        lastActivity: mostRecentActivity || new Date(0),
        isOnShift: true,
        hasRecentActivity: hasRecentActivity
      });
    }
    
    // Sort by store number, then by name
    activeAssociates.sort((a, b) => {
      if (a.storeNumber !== b.storeNumber) {
        return (a.storeNumber || 0) - (b.storeNumber || 0);
      }
      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });

    logger.info(`Active associates retrieved efficiently`, {
      count: activeAssociates.length,
      totalChecked: users.length,
      storeFilter: storeNumber || 'all',
      requestedBy: user.uid,
      sampleData: activeAssociates.length > 0 ? {
        firstName: activeAssociates[0].firstName,
        shiftStart: activeAssociates[0].shiftStart,
        shiftEnd: activeAssociates[0].shiftEnd
      } : null
    });

    res.json({
      activeAssociates,
      count: activeAssociates.length,
      storeNumber: storeNumber ? String(storeNumber) : 'all',
      retrievedAt: now.toISOString()
    });

  } catch (error) {
    logger.error("Error getting active associates details:", error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to format time in 12-hour format with AM/PM
function formatTime12Hour(hour, minute) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const displayMinute = String(minute).padStart(2, '0');
  return `${displayHour}:${displayMinute} ${period}`;
}

// Helper function to get user shift info efficiently
function getUserShiftInfo(userData, now) {
  const userTimezone = userData.timezone || "America/New_York";

  try {
    // Convert to user's local time
    const userLocalTime = new Date(now.toLocaleString("en-US", { timeZone: userTimezone }));
    const dayOfWeek = userLocalTime.getDay();
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];

    const workSchedule = userData.workSchedule;
    if (!workSchedule) {
      return { isOnShift: false, timezone: userTimezone, startTime: null, endTime: null }; // Users without schedules aren't on shift
    }

    const daySchedule = workSchedule[dayName];
    if (!daySchedule || !daySchedule.isWorkingDay) {
      return { isOnShift: false, timezone: userTimezone, startTime: null, endTime: null };
    }

    const hour = userLocalTime.getHours();
    const minute = userLocalTime.getMinutes();
    const currentMinutes = hour * 60 + minute;

    const startHour = daySchedule.startHour != null ? parseInt(daySchedule.startHour) : 0;
    const startMinute = daySchedule.startMinute != null ? parseInt(daySchedule.startMinute) : 0;
    const endHour = daySchedule.endHour != null ? parseInt(daySchedule.endHour) : 23;
    const endMinute = daySchedule.endMinute != null ? parseInt(daySchedule.endMinute) : 59;

    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    const isOnShift = currentMinutes >= startMinutes && currentMinutes <= endMinutes;

    return {
      isOnShift,
      timezone: userTimezone,
      startTime: formatTime12Hour(startHour, startMinute),
      endTime: formatTime12Hour(endHour, endMinute),
      startHour,
      startMinute,
      endHour,
      endMinute
    };
  } catch (error) {
    logger.error(`Error calculating shift info for user ${userData.firstName}:`, error);
    return { isOnShift: false, timezone: userTimezone, startTime: null, endTime: null };
  }
}

// Helper function to calculate accurate shift end time
function calculateShiftEndTime(userData, shiftInfo, now) {
  if (!shiftInfo.isOnShift || !shiftInfo.endHour) return null;
  
  try {
    const userTimezone = shiftInfo.timezone;
    
    // Get current date in user's timezone to build proper shift end time
    const nowInUserTZ = new Date(now.toLocaleString("en-US", { timeZone: userTimezone }));
    const todayInUserTZ = new Date(nowInUserTZ.getFullYear(), nowInUserTZ.getMonth(), nowInUserTZ.getDate());
    
    // Create shift end time in user's timezone
    const shiftEndInUserTZ = new Date(todayInUserTZ);
    shiftEndInUserTZ.setHours(shiftInfo.endHour, shiftInfo.endMinute, 0, 0);
    
    // If shift end is before current time, it's tomorrow (overnight shift)
    if (shiftEndInUserTZ <= nowInUserTZ) {
      shiftEndInUserTZ.setDate(shiftEndInUserTZ.getDate() + 1);
    }
    
    // Calculate timezone offset and convert to UTC properly
    const utcTime = new Date(now.getTime());
    const userTimeOffset = nowInUserTZ.getTime() - utcTime.getTime();
    const shiftEndUTC = new Date(shiftEndInUserTZ.getTime() - userTimeOffset);
    
    logger.info(`Shift end calculation for ${userData.firstName}:`, {
      userTimezone,
      currentUTC: now.toISOString(),
      currentUserTZ: nowInUserTZ.toISOString(),
      shiftEndUserTZ: shiftEndInUserTZ.toISOString(), 
      shiftEndUTC: shiftEndUTC.toISOString(),
      endHour: shiftInfo.endHour,
      endMinute: shiftInfo.endMinute
    });
    
    return shiftEndUTC;
  } catch (error) {
    logger.error(`Error calculating shift end time for user ${userData.firstName}:`, error);
    return null;
  }
}

// ===== SHARED AUTHENTICATION API FOR CHECKLIST APP =====

// Helper function for CORS
function setCorsHeaders(res, origin) {
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');
}

// User login API for checklist app
export const authLogin = onRequest({ region: REGION }, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Use Firebase Auth Admin SDK to verify credentials
    const auth = getAuth();

    // Get user by email
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (error) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Check if user exists in Firestore
    const userDoc = await db.collection('users').doc(userRecord.uid).get();
    if (!userDoc.exists) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const userData = userDoc.data();

    // Create custom token for the user
    const customToken = await auth.createCustomToken(userRecord.uid);

    res.status(200).json({
      success: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        name: userData.name || userRecord.displayName || '',
        isAdmin: userData.isAdmin || false
      },
      token: customToken
    });

  } catch (error) {
    logger.error('Error in authLogin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User registration API for checklist app
export const authRegister = onRequest({ region: REGION }, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'Email, password, and name are required' });
      return;
    }

    const auth = getAuth();

    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email: email,
      password: password,
      displayName: name
    });

    // Save user data to Firestore
    await db.collection('users').doc(userRecord.uid).set({
      email: email,
      name: name,
      isAdmin: false,
      createdAt: new Date(),
      source: 'checklist-app'
    });

    // Create custom token for immediate login
    const customToken = await auth.createCustomToken(userRecord.uid);

    res.status(201).json({
      success: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        name: name,
        isAdmin: false
      },
      token: customToken
    });

  } catch (error) {
    logger.error('Error in authRegister:', error);

    if (error.code === 'auth/email-already-exists') {
      res.status(400).json({ error: 'Email already exists' });
    } else if (error.code === 'auth/weak-password') {
      res.status(400).json({ error: 'Password is too weak' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Verify token API for checklist app
export const authVerify = onRequest({ region: REGION }, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Token is required' });
      return;
    }

    const auth = getAuth();

    // Verify the token
    const decodedToken = await auth.verifyIdToken(token);

    // Get user data from Firestore
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const userData = userDoc.data();

    res.status(200).json({
      success: true,
      user: {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: userData.name || decodedToken.name || '',
        isAdmin: userData.isAdmin || false
      }
    });

  } catch (error) {
    logger.error('Error in authVerify:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ===== CHECKLIST MANAGEMENT API =====

// Get all checklist templates
export const getChecklistTemplates = onRequest({ region: REGION }, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const templatesSnapshot = await db.collection('checklist_templates').get();
    const templates = [];

    for (const templateDoc of templatesSnapshot.docs) {
      const templateData = templateDoc.data();

      // Get questions for this template
      const questionsSnapshot = await db.collection('checklist_questions')
        .where('templateId', '==', templateDoc.id)
        .orderBy('order', 'asc')
        .get();

      const questions = questionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      templates.push({
        id: templateDoc.id,
        ...templateData,
        questions
      });
    }

    res.status(200).json({ templates });

  } catch (error) {
    logger.error('Error getting templates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new checklist template (admin only)
export const createChecklistTemplate = onRequest({ region: REGION }, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { token, template } = req.body;

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Verify user is admin
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();

    if (!userDoc.exists || !userDoc.data().isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // Create template
    const templateData = {
      name: template.name,
      description: template.description,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: decodedToken.uid
    };

    const templateRef = await db.collection('checklist_templates').add(templateData);

    // Create questions
    const questionPromises = template.questions.map((question, index) => {
      return db.collection('checklist_questions').add({
        templateId: templateRef.id,
        text: question.text,
        type: question.type,
        required: question.required,
        allowNotes: question.allowNotes,
        order: index,
        createdAt: new Date()
      });
    });

    await Promise.all(questionPromises);

    res.status(201).json({
      success: true,
      templateId: templateRef.id
    });

  } catch (error) {
    logger.error('Error creating template:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new checklist instance
export const createChecklistInstance = onRequest({ region: REGION }, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { token, templateId } = req.body;

    if (!token || !templateId) {
      res.status(400).json({ error: 'Token and templateId are required' });
      return;
    }

    // Verify user
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);

    // Get template
    const templateDoc = await db.collection('checklist_templates').doc(templateId).get();
    if (!templateDoc.exists) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }

    const templateData = templateDoc.data();

    // Create instance
    const instanceData = {
      templateId,
      templateName: templateData.name,
      userId: decodedToken.uid,
      status: 'draft',
      responses: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const instanceRef = await db.collection('checklist_instances').add(instanceData);

    res.status(201).json({
      success: true,
      instanceId: instanceRef.id
    });

  } catch (error) {
    logger.error('Error creating instance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get checklist instance with questions
export const getChecklistInstance = onRequest({ region: REGION }, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { token, instanceId } = req.body;

    if (!token || !instanceId) {
      res.status(400).json({ error: 'Token and instanceId are required' });
      return;
    }

    // Verify user
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);

    // Get instance
    const instanceDoc = await db.collection('checklist_instances').doc(instanceId).get();
    if (!instanceDoc.exists) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    const instanceData = instanceDoc.data();

    // Verify user owns this instance or is admin
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const isAdmin = userDoc.exists && userDoc.data().isAdmin;

    if (instanceData.userId !== decodedToken.uid && !isAdmin) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Get questions for this template
    const questionsSnapshot = await db.collection('checklist_questions')
      .where('templateId', '==', instanceData.templateId)
      .orderBy('order', 'asc')
      .get();

    const questions = questionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({
      instance: {
        id: instanceDoc.id,
        ...instanceData
      },
      questions
    });

  } catch (error) {
    logger.error('Error getting instance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update checklist instance (save progress)
export const updateChecklistInstance = onRequest({ region: REGION }, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { token, instanceId, responses, status } = req.body;

    if (!token || !instanceId) {
      res.status(400).json({ error: 'Token and instanceId are required' });
      return;
    }

    // Verify user
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);

    // Get instance
    const instanceDoc = await db.collection('checklist_instances').doc(instanceId).get();
    if (!instanceDoc.exists) {
      res.status(404).json({ error: 'Instance not found' });
      return;
    }

    const instanceData = instanceDoc.data();

    // Verify user owns this instance
    if (instanceData.userId !== decodedToken.uid) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Update instance
    const updateData = {
      updatedAt: new Date()
    };

    if (responses) {
      updateData.responses = responses;
    }

    if (status) {
      updateData.status = status;
      if (status === 'completed') {
        updateData.completedAt = new Date();
      }
    }

    await db.collection('checklist_instances').doc(instanceId).update(updateData);

    res.status(200).json({ success: true });

  } catch (error) {
    logger.error('Error updating instance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload image for checklist response
export const uploadChecklistImage = onRequest({ region: REGION }, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { token, instanceId, questionId, imageData } = req.body;

    if (!token || !instanceId || !questionId || !imageData) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // Verify user
    const auth = getAuth();
    const decodedToken = await auth.verifyIdToken(token);

    // Verify instance ownership
    const instanceDoc = await db.collection('checklist_instances').doc(instanceId).get();
    if (!instanceDoc.exists || instanceDoc.data().userId !== decodedToken.uid) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // For now, return a placeholder URL - in production this would upload to Firebase Storage
    const imageUrl = `https://placeholder.com/400x300?text=Image+${questionId}`;

    res.status(200).json({
      success: true,
      imageUrl
    });

  } catch (error) {
    logger.error('Error uploading image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== NEW TAB-BASED CHECKLIST SYSTEM =====

// Submit tab-based turnover checklist
export const submitTurnoverChecklist = onRequest({
  region: REGION,
  memory: "1GiB"
}, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    logger.info('Received checklist submission request');
    const { userInfo, checklistData, date } = req.body;

    logger.info('Request data:', {
      hasUserInfo: !!userInfo,
      hasChecklistData: !!checklistData,
      date: date
    });

    if (!userInfo || !userInfo.name || !userInfo.storeNumber || !checklistData) {
      logger.error('Missing required data in request');
      res.status(400).json({ error: 'Missing required data' });
      return;
    }

    // Generate checklist ID
    const checklistId = `${userInfo.storeNumber}_${date}_${userInfo.name}_${Date.now()}`;
    logger.info('Generated checklist ID:', checklistId);

    // Store in Firestore
    const checklistDoc = {
      id: checklistId,
      userInfo,
      checklistData,
      date,
      submittedAt: new Date(),
      status: 'submitted'
    };

    logger.info('Saving checklist to Firestore...');
    await db.collection('turnover_checklists').doc(checklistId).set(checklistDoc);
    logger.info('Checklist saved to Firestore successfully');

    // Generate and send PDF report
    let pdfResult = null;
    try {
      pdfResult = await generateAndEmailPDF(checklistDoc);
    } catch (pdfError) {
      logger.error('PDF generation failed:', pdfError);
      // Continue even if PDF fails - data is saved
    }

    res.status(200).json({
      success: true,
      checklistId,
      message: 'Checklist submitted successfully',
      pdfUrl: pdfResult?.pdfUrl || null,
      fileName: pdfResult?.fileName || null
    });

  } catch (error) {
    logger.error('Error submitting checklist:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code,
      requestBody: req.body ? 'present' : 'missing'
    });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to generate and email PDF
async function generateAndEmailPDF(checklistDoc) {
  try {
    const { userInfo, checklistData, date } = checklistDoc;

    // Create professional HTML content for PDF
    let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            @page {
                margin: 0.75in;
                size: letter;
            }

            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 11pt;
                line-height: 1.4;
                color: #333;
                margin: 0;
            }

            .header {
                background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
                color: white;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 30px;
                text-align: center;
            }

            .header h1 {
                margin: 0 0 15px 0;
                font-size: 24pt;
                font-weight: 600;
            }

            .header-info {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
                margin-top: 15px;
                text-align: left;
            }

            .header-info div {
                background: rgba(255,255,255,0.1);
                padding: 10px;
                border-radius: 5px;
            }

            h2 {
                color: #1f2937;
                font-size: 16pt;
                margin: 25px 0 15px 0;
                border-bottom: 2px solid #e5e7eb;
                padding-bottom: 8px;
            }

            .section {
                margin-bottom: 25px;
                break-inside: avoid;
            }

            .associate {
                background-color: #f8fafc;
                border-left: 4px solid #3b82f6;
                padding: 15px;
                margin-bottom: 12px;
                border-radius: 0 5px 5px 0;
            }

            .associate-name {
                font-weight: 600;
                color: #1f2937;
                font-size: 12pt;
            }

            .associate-shift {
                color: #2563eb;
                font-weight: 500;
                margin-left: 10px;
            }

            .associate-notes {
                margin-top: 8px;
                font-style: italic;
                color: #6b7280;
            }

            .department-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin: 15px 0;
            }

            .metric-item, .photo-item {
                background: #f9fafb;
                padding: 10px;
                border-radius: 5px;
                border-left: 3px solid #10b981;
            }

            .metric-label {
                font-weight: 600;
                color: #374151;
                font-size: 10pt;
            }

            .metric-value {
                font-size: 14pt;
                color: #1f2937;
                font-weight: 600;
            }

            .photo-summary {
                color: #6b7280;
                font-size: 10pt;
                margin: 8px 0;
            }

            .notes-section {
                background: #fef3c7;
                border-left: 4px solid #f59e0b;
                padding: 15px;
                border-radius: 0 5px 5px 0;
                margin: 10px 0;
            }

            .footer {
                margin-top: 40px;
                text-align: center;
                color: #9ca3af;
                font-size: 9pt;
                border-top: 1px solid #e5e7eb;
                padding-top: 15px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>TURNOVER CHECKLIST REPORT</h1>
            <div class="header-info">
                <div>
                    <strong>Date:</strong><br>
                    ${new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
                <div>
                    <strong>Manager:</strong> ${userInfo.name}<br>
                    <strong>Store:</strong> #${userInfo.storeNumber}
                </div>
            </div>
        </div>
    `;

    // Create text version for logging
    let pdfContent = `TURNOVER CHECKLIST REPORT\n\n`;
    pdfContent += `Date: ${new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n`;
    pdfContent += `Manager: ${userInfo.name}\n`;
    pdfContent += `Store: #${userInfo.storeNumber}\n`;
    pdfContent += `Submitted: ${new Date(checklistDoc.submittedAt).toLocaleString()}\n\n`;

    // Associates Section
    htmlContent += `<div class="section"><h2>📋 ASSOCIATES</h2>`;
    pdfContent += `ASSOCIATES:\n`;
    if (checklistData.associates && checklistData.associates.length > 0) {
      checklistData.associates.forEach(associate => {
        htmlContent += `<div class="associate">
          <div>
            <span class="associate-name">${associate.name}</span>
            <span class="associate-shift">${associate.shift}</span>
          </div>`;
        if (associate.accomplishments) {
          htmlContent += `<div class="associate-notes">Accomplishments: ${associate.accomplishments}</div>`;
        }
        htmlContent += `</div>`;

        pdfContent += `Associate "${associate.name}" was scheduled ${associate.shift}`;
        if (associate.accomplishments) {
          pdfContent += ` and accomplished the following: ${associate.accomplishments}`;
        }
        pdfContent += `\n\n`;
      });
    } else {
      htmlContent += `<p style="color: #6b7280; font-style: italic;">No associates recorded for this shift.</p>`;
      pdfContent += `No associates recorded.\n\n`;
    }
    htmlContent += `</div>`;

    // Fresh Department Section
    htmlContent += `<div class="section"><h2>FRESH DEPARTMENT</h2>
      <p>The fresh department was left in the following condition:</p>`;
    pdfContent += `FRESH DEPARTMENT:\n`;
    pdfContent += `The fresh department was left in the following condition:\n`;

    if (checklistData.fresh?.photos) {
      Object.entries(checklistData.fresh.photos).forEach(([category, photos]) => {
        if (photos.length > 0) {
          htmlContent += `<p class="photo-summary">${category}: ${photos.length} photos attached</p>`;
          pdfContent += `${category}: ${photos.length} photos attached\n`;
        }
      });
    }
    if (checklistData.fresh?.notes) {
      htmlContent += `<p><strong>Notes:</strong> ${checklistData.fresh.notes}</p>`;
      pdfContent += `Notes: ${checklistData.fresh.notes}\n`;
    }
    htmlContent += `</div>`;
    pdfContent += `\n`;

    // Digital Department Section
    pdfContent += `DIGITAL DEPARTMENT:\n`;
    if (checklistData.digital?.totalPicks) {
      pdfContent += `Total Picks: ${checklistData.digital.totalPicks}\n`;
    }
    if (checklistData.digital?.onTimePickPercentage) {
      pdfContent += `On Time Pick Percentage: ${checklistData.digital.onTimePickPercentage}%\n`;
    }
    if (checklistData.digital?.presubCount) {
      pdfContent += `Presub Count: ${checklistData.digital.presubCount}\n`;
    }
    if (checklistData.digital?.photos) {
      Object.entries(checklistData.digital.photos).forEach(([category, photos]) => {
        if (photos.length > 0) {
          pdfContent += `${category}: ${photos.length} photos attached\n`;
        }
      });
    }
    if (checklistData.digital?.notes) {
      pdfContent += `Notes: ${checklistData.digital.notes}\n`;
    }
    pdfContent += `\n`;

    // Food Department Section
    pdfContent += `FOOD DEPARTMENT:\n`;
    if (checklistData.food?.returnsCompleted !== undefined) {
      pdfContent += `Returns Completed: ${checklistData.food.returnsCompleted ? 'Yes' : 'No'}\n`;
    }
    if (checklistData.food?.photos) {
      Object.entries(checklistData.food.photos).forEach(([category, photos]) => {
        if (photos.length > 0) {
          pdfContent += `${category}: ${photos.length} photos attached\n`;
        }
      });
    }
    if (checklistData.food?.notes) {
      pdfContent += `Notes: ${checklistData.food.notes}\n`;
    }
    pdfContent += `\n`;

    // GM Department Section
    pdfContent += `GM DEPARTMENT:\n`;
    if (checklistData.gm?.photos) {
      Object.entries(checklistData.gm.photos).forEach(([category, photos]) => {
        if (photos.length > 0) {
          pdfContent += `${category}: ${photos.length} photos attached\n`;
        }
      });
    }
    if (checklistData.gm?.notes) {
      pdfContent += `Notes: ${checklistData.gm.notes}\n`;
    }
    pdfContent += `\n`;

    // Apparel Department Section
    pdfContent += `APPAREL DEPARTMENT:\n`;
    if (checklistData.apparel?.photos) {
      Object.entries(checklistData.apparel.photos).forEach(([category, photos]) => {
        if (photos.length > 0) {
          pdfContent += `${category}: ${photos.length} photos attached\n`;
        }
      });
    }
    if (checklistData.apparel?.notes) {
      pdfContent += `Notes: ${checklistData.apparel.notes}\n`;
    }
    pdfContent += `\n`;

    // Front End Section
    pdfContent += `FRONT END:\n`;
    if (checklistData.frontEnd?.photos) {
      Object.entries(checklistData.frontEnd.photos).forEach(([category, photos]) => {
        if (photos.length > 0) {
          pdfContent += `${category}: ${photos.length} photos attached\n`;
        }
      });
    }
    if (checklistData.frontEnd?.notes) {
      pdfContent += `Notes: ${checklistData.frontEnd.notes}\n`;
    }

    // Add footer and close HTML content
    htmlContent += `
        <div class="footer">
            <p>Generated by Manager Checklist System - ${new Date().toLocaleString()}</p>
            <p>Store #${userInfo.storeNumber} | Manager: ${userInfo.name}</p>
        </div>
    </body></html>`;

    // Generate professional PDF using serverless Chromium with corrected approach
    logger.info('Starting PDF generation with @sparticuz/chromium');

    let pdfBuffer;
    try {
      const chromium = await import('@sparticuz/chromium');
      const puppeteer = await import('puppeteer-core');

      logger.info('Launching browser with @sparticuz/chromium configuration');

      const browser = await puppeteer.default.launch({
        args: chromium.default.args,
        defaultViewport: chromium.default.defaultViewport,
        executablePath: await chromium.default.executablePath(),
        headless: chromium.default.headless,
        ignoreHTTPSErrors: true,
      });

      logger.info('Browser launched successfully');

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

      pdfBuffer = await page.pdf({
        format: 'A4',
        margin: { top: '0.75in', right: '0.75in', bottom: '0.75in', left: '0.75in' },
        printBackground: true,
        preferCSSPageSize: true
      });

      await browser.close();
      logger.info('PDF generated successfully, size:', pdfBuffer.length);

    } catch (chromiumError) {
      logger.error('Chromium error:', chromiumError);
      throw chromiumError;
    }

    // Return PDF as base64 data URL for direct download (avoid storage issues)
    const base64Pdf = pdfBuffer.toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64Pdf}`;

    const dateObj = new Date(date);
    const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = dateObj.toLocaleDateString('en-US');
    const emailSubject = `Turnover ${weekday} ${dateStr}`;
    const fileName = `Turnover-${userInfo.storeNumber}-${date}-${userInfo.name}.pdf`;

    logger.info('PDF generated successfully, returning as base64 data URL');
    logger.info('Email Subject:', emailSubject);
    logger.info('File name:', fileName);

    return { pdfUrl: dataUrl, emailSubject, fileName };

  } catch (error) {
    logger.error('Error in PDF generation:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    throw error;
  }
}

// Download PDF endpoint
export const downloadPDF = onRequest({ region: REGION }, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { fileName } = req.query;

    if (!fileName) {
      res.status(400).json({ error: 'fileName parameter required' });
      return;
    }

    const bucket = storage.bucket('managerchecklist.appspot.com');
    const file = bucket.file(fileName);

    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).json({ error: 'PDF not found' });
      return;
    }

    // Get file metadata
    const [metadata] = await file.getMetadata();

    // Set headers for download
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName.split('/').pop()}"`,
      'Content-Length': metadata.size
    });

    // Stream the file
    const stream = file.createReadStream();
    stream.pipe(res);

  } catch (error) {
    logger.error('Error downloading PDF:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===== Diagnostic: Check Recent Scan Responses =====
export const diagnosticScanResponses = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Verify admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Verify user is admin
    const userDoc = await db.collection('users').doc(uid).get();
    if (!await isAdmin(uid)) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    const { storeNumber, limit = 20 } = req.query;

    let query = db.collection('scans')
      .orderBy('timestamp', 'desc')
      .limit(parseInt(limit));

    if (storeNumber) {
      query = db.collection('scans')
        .where('storeNumber', '==', String(storeNumber))
        .orderBy('timestamp', 'desc')
        .limit(parseInt(limit));
    }

    const scansSnapshot = await query.get();

    const diagnostics = scansSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        scanId: doc.id,
        storeNumber: data.storeNumber,
        areaDescription: data.areaDescription,
        status: data.status,
        timestamp: data.timestamp?.toDate?.() || data.timestamp,
        claimedBy: data.claimedBy || null,
        claimedByName: data.claimedByName || null,
        eligibleUsers: data.eligibleUsers || [],
        eligibleUserCount: (data.eligibleUsers || []).length,
        responses: data.responses || [],
        responseBreakdown: {
          total: (data.responses || []).length,
          assists: (data.responses || []).filter(r => r.action === 'assist').length,
          ignores: (data.responses || []).filter(r => r.action === 'ignore').length,
          timeouts: (data.responses || []).filter(r => r.source === 'timeout').length,
          buttonIgnores: (data.responses || []).filter(r => r.action === 'ignore' && r.source !== 'timeout').length
        },
        timeoutProcessed: data.timeoutProcessed || false,
        secondaryAlertSent: data.secondaryAlertSent || false
      };
    });

    res.json({
      totalScans: scansSnapshot.size,
      scans: diagnostics,
      query: { storeNumber, limit }
    });

  } catch (error) {
    logger.error('Error in diagnosticScanResponses:', error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Backfill GroupMe Responses =====
export const backfillGroupMeResponses = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public",
  timeoutSeconds: 540
}, async (req, res) => {
  const origin = req.headers.origin;
  setCorsHeaders(res, origin);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    // Verify admin authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // Verify user is admin
    const userDoc = await db.collection('users').doc(uid).get();
    if (!await isAdmin(uid)) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    logger.info('Starting GroupMe responses backfill...');

    // Find all user messages from GroupMe webhook logs (not bot messages)
    const webhookLogs = await db.collection('groupme_webhook_logs')
      .where('message_type', '==', 'user_message')
      .orderBy('timestamp', 'desc')
      .limit(500) // Process last 500 user messages
      .get();

    logger.info(`Found ${webhookLogs.size} GroupMe user messages to process`);

    let updatedCount = 0;
    let skippedCount = 0;
    let notFoundCount = 0;
    let noStoreCount = 0;
    const results = [];

    // Build a map of group_id -> store number from groupme_bots
    const botsSnapshot = await db.collection('groupme_bots').get();
    const groupIdToStore = {};
    botsSnapshot.forEach(botDoc => {
      const botData = botDoc.data();
      if (botData.group_id && botData.store) {
        groupIdToStore[botData.group_id] = String(botData.store);
      }
    });

    logger.info(`Mapped ${Object.keys(groupIdToStore).length} GroupMe groups to stores`);

    for (const webhookDoc of webhookLogs.docs) {
      const webhookData = webhookDoc.data();
      const webhookId = webhookDoc.id;

      // Extract response info from webhook log
      const {
        group_id,
        sender_name,
        user_id,
        text_preview,
        timestamp
      } = webhookData;

      // Map group_id to store number
      const storeNumber = groupIdToStore[group_id];
      if (!storeNumber) {
        noStoreCount++;
        continue;
      }

      try {
        // Find corresponding scan - look for scans within 10 minutes before this message
        const messageTimestamp = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const beforeTime = new Date(messageTimestamp.getTime() - 10 * 60 * 1000); // 10 minutes before

        const scansQuery = await db.collection('scans')
          .where('storeNumber', '==', storeNumber)
          .where('timestamp', '>=', beforeTime)
          .where('timestamp', '<=', messageTimestamp)
          .where('status', '==', 'pending')
          .orderBy('timestamp', 'desc')
          .limit(1)
          .get();

        if (scansQuery.empty) {
          notFoundCount++;
          continue;
        }

        const scanDoc = scansQuery.docs[0];
        const scanData = scanDoc.data();

        // Check if already updated (has claimedBy set)
        if (scanData.claimedBy && scanData.claimedBy !== '') {
          skippedCount++;
          continue;
        }

        // Update the scan with response info
        const responseEntry = {
          respondedAt: messageTimestamp,
          responderName: sender_name || 'Unknown',
          responderUserId: user_id || '',
          responseText: text_preview || '',
          responseSource: 'groupme'
        };

        await scanDoc.ref.update({
          status: 'claimed',
          claimedBy: user_id || '',
          claimedByName: sender_name || 'Unknown',
          claimedAt: FieldValue.serverTimestamp(),
          responses: FieldValue.arrayUnion(responseEntry)
        });

        logger.info(`Updated scan ${scanDoc.id} with response from ${sender_name} at store ${storeNumber}`);
        updatedCount++;
        results.push({
          scanId: scanDoc.id,
          store: storeNumber,
          responder: sender_name
        });

      } catch (scanError) {
        logger.error(`Error processing webhook ${webhookId}:`, scanError.message);
      }
    }

    const summary = {
      totalMessagesProcessed: webhookLogs.size,
      groupsMapped: Object.keys(groupIdToStore).length,
      scansUpdated: updatedCount,
      scansSkipped: skippedCount,
      scansNotFound: notFoundCount,
      messagesWithoutStore: noStoreCount,
      sampleResults: results.slice(0, 10)
    };

    logger.info('Backfill complete', summary);
    res.status(200).json(summary);

  } catch (error) {
    logger.error('Error in backfillGroupMeResponses:', error);
    res.status(500).json({ error: error.message });
  }
});


// ===== CLEANUP: Delete test/demo scans (HTTP endpoint) =====
export const cleanupTestScans = onRequest({ 
  region: REGION,
  cors: ALLOWED_ORIGINS 
}, async (req, res) => {
  try {
    // Authenticate user
    const decodedToken = await authenticateUser(req);
    
    // Verify admin access
    const adminCheck = await isAdmin(decodedToken.uid);
    if (!adminCheck) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    logger.info('Starting cleanup of test/demo scans by admin:', decodedToken.email);

    // Get all scans
    const scansSnapshot = await db.collection('scans').get();
    logger.info(`Total scans found: ${scansSnapshot.size}`);

    let deletedCount = 0;
    const deletedScans = [];

    // Use batched writes (max 500 per batch)
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of scansSnapshot.docs) {
      const data = doc.data();
      const areaDescription = (data.areaDescription || '').toLowerCase();

      // Check if area description contains "test" or "demo"
      if (areaDescription.includes('test') || areaDescription.includes('demo')) {
        logger.info(`Deleting scan: ${doc.id} - Store: ${data.storeNumber} - Area: ${data.areaDescription}`);

        deletedScans.push({
          id: doc.id,
          store: data.storeNumber,
          area: data.areaDescription,
          timestamp: data.timestamp
        });

        batch.delete(doc.ref);
        deletedCount++;
        batchCount++;

        // Commit batch if we hit the 500 limit
        if (batchCount >= 500) {
          await batch.commit();
          logger.info(`Committed batch of ${batchCount} deletions`);
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    // Commit any remaining deletions
    if (batchCount > 0) {
      await batch.commit();
      logger.info(`Committed final batch of ${batchCount} deletions`);
    }

    const summary = {
      totalScans: scansSnapshot.size,
      deletedCount,
      remainingScans: scansSnapshot.size - deletedCount,
      deletedScans: deletedScans.slice(0, 20) // Return first 20 for verification
    };

    logger.info('Cleanup complete', summary);
    return res.status(200).json(summary);

  } catch (error) {
    logger.error('Error during cleanup:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ===== SECURITY: Custom Claims Management =====

/**
 * Set admin custom claim for a user
 * CRITICAL SECURITY: Only allows admins (via custom claims) to grant admin privileges
 */
export const setAdminClaim = onCall({
  region: REGION,
  enforceAppCheck: false // TODO: Enable after App Check is configured
}, async (request) => {
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Verify caller is an admin (via custom claims)
  const callerUser = await getAuth().getUser(callerUid);
  if (!callerUser.customClaims?.admin) {
    logger.warn('Unauthorized admin claim attempt', {
      callerUid
    });
    throw new HttpsError('permission-denied', 'Only admins can grant admin privileges');
  }

  const { uid, admin } = request.data;

  if (!uid || typeof uid !== 'string') {
    throw new HttpsError('invalid-argument', 'Valid user UID required');
  }

  if (typeof admin !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Admin must be a boolean');
  }

  try {
    // Set or remove custom claim
    const customClaims = admin ? { admin: true } : { admin: false };
    await getAuth().setCustomUserClaims(uid, customClaims);

    // Also update Firestore for record-keeping
    await db.collection('users').doc(uid).update({
      isAdmin: admin,
      adminClaimSetAt: FieldValue.serverTimestamp(),
      adminClaimSetBy: callerUid
    });

    logger.info('Admin custom claim updated', {
      targetUid: uid,
      admin,
      setBy: callerUid
    });

    return {
      success: true,
      message: `Admin claim ${admin ? 'granted to' : 'revoked from'} user ${uid}`
    };

  } catch (error) {
    logger.error('Error setting admin claim:', error);
    throw new HttpsError('internal', `Failed to set admin claim: ${error.message}`);
  }
});

/**
 * Check current user's roles and custom claims
 * Returns user's custom claims for client-side UI adjustments
 * NOTE: Never trust client-side for authorization - always verify server-side
 */
export const getUserClaims = onCall({
  region: REGION,
  enforceAppCheck: false // TODO: Enable after App Check is configured
}, async (request) => {
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  try {
    const user = await getAuth().getUser(uid);
    const userDoc = await db.collection('users').doc(uid).get();

    return {
      uid,
      email: user.email,
      customClaims: user.customClaims || {},
      isAdmin: user.customClaims?.admin === true,
      userData: userDoc.exists ? userDoc.data() : null
    };
  } catch (error) {
    logger.error('Error getting user claims:', error);
    throw new HttpsError('internal', 'Failed to get user claims');
  }
});

// ===== SECURITY: Auto-Ignore Old Scans =====

/**
 * Scheduled function to automatically mark old pending scans as ignored
 * Runs every 5 minutes to clean up scans older than 10 minutes
 * This prevents client-side manipulation of auto-ignore logic
 */
export const autoIgnoreOldScans = onSchedule({
  schedule: 'every 5 minutes',
  region: REGION,
  timeoutSeconds: 300,
  retryCount: 3
}, async (context) => {
  try {
    logger.info('Starting auto-ignore old scans job');

    // Calculate 10 minutes ago
    const tenMinutesAgo = Timestamp.fromDate(
      new Date(Date.now() - 10 * 60 * 1000)
    );

    // Find pending scans older than 10 minutes
    const oldScansQuery = db.collection('scans')
      .where('status', '==', 'pending')
      .where('timestamp', '<=', tenMinutesAgo);

    const oldScansSnapshot = await oldScansQuery.get();

    if (oldScansSnapshot.empty) {
      logger.info('No old scans to auto-ignore');
      return null;
    }

    logger.info(`Found ${oldScansSnapshot.size} scans to auto-ignore`);

    // Batch update scans
    let batch = db.batch();
    let batchCount = 0;
    let totalUpdated = 0;

    for (const doc of oldScansSnapshot.docs) {
      batch.update(doc.ref, {
        status: 'auto_ignored',
        autoIgnoredAt: FieldValue.serverTimestamp(),
        autoIgnoredReason: 'timeout_10min',
        updatedAt: FieldValue.serverTimestamp()
      });

      batchCount++;
      totalUpdated++;

      // Commit batch every 500 operations (Firestore limit)
      if (batchCount >= 500) {
        await batch.commit();
        logger.info(`Committed batch of ${batchCount} auto-ignores`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    // Commit remaining operations
    if (batchCount > 0) {
      await batch.commit();
      logger.info(`Committed final batch of ${batchCount} auto-ignores`);
    }

    logger.info('Auto-ignore job completed', {
      totalProcessed: oldScansSnapshot.size,
      totalUpdated
    });

    return { success: true, scansIgnored: totalUpdated };

  } catch (error) {
    logger.error('Error in auto-ignore job:', error);
    throw error; // Will trigger retry
  }
});

/**
 * Manual trigger for auto-ignore logic (admin only)
 * Useful for testing and manual cleanup
 */
export const manualAutoIgnore = onCall({
  region: REGION,
  enforceAppCheck: false // TODO: Enable after App Check is configured
}, async (request) => {
  const callerUid = request.auth?.uid;

  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  // Verify caller is admin
  if (!(await isAdmin(callerUid))) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  try {
    logger.info('Manual auto-ignore triggered', { by: callerUid });

    const tenMinutesAgo = Timestamp.fromDate(
      new Date(Date.now() - 10 * 60 * 1000)
    );

    const oldScansSnapshot = await db.collection('scans')
      .where('status', '==', 'pending')
      .where('timestamp', '<=', tenMinutesAgo)
      .get();

    if (oldScansSnapshot.empty) {
      return { success: true, scansIgnored: 0, message: 'No old scans found' };
    }

    let batch = db.batch();
    let batchCount = 0;

    for (const doc of oldScansSnapshot.docs) {
      batch.update(doc.ref, {
        status: 'auto_ignored',
        autoIgnoredAt: FieldValue.serverTimestamp(),
        autoIgnoredReason: 'manual_trigger',
        autoIgnoredBy: callerUid,
        updatedAt: FieldValue.serverTimestamp()
      });

      batchCount++;

      if (batchCount >= 500) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    logger.info('Manual auto-ignore completed', {
      scansIgnored: oldScansSnapshot.size,
      by: callerUid
    });

    return {
      success: true,
      scansIgnored: oldScansSnapshot.size,
      message: `Auto-ignored ${oldScansSnapshot.size} old scans`
    };

  } catch (error) {
    logger.error('Error in manual auto-ignore:', error);
    throw new HttpsError('internal', `Failed to auto-ignore scans: ${error.message}`);
  }
});

// ===== Admin Send Password Reset Email =====
export const adminSendPasswordReset = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    
    // Rate limiting
    const clientIp = req.ip || req.connection.remoteAddress;
    const rateLimitResult = await checkRateLimit(clientIp);
    if (!rateLimitResult.allowed) {
      return res.status(429).send("Too many requests. Please try again later.");
    }
    
    // Authenticate user and verify admin
    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }
    
    const { email } = req.body;
    if (!email) return res.status(400).send("Missing email");
    
    logger.info("Admin sending password reset email", { 
      email, 
      admin: decodedToken.uid
    });
    
    // Verify user exists
    const auth = getAuth();
    let user;
    try {
      user = await auth.getUserByEmail(email);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        return res.status(404).send("User not found");
      }
      throw error;
    }
    
    // Generate password reset link (Firebase default: 1 hour expiration)
    const resetLink = await auth.generatePasswordResetLink(email);

    logger.info("Password reset link generated", {
      email,
      admin: decodedToken.uid,
      userId: user.uid
    });

    // Send email using SendGrid
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      logger.warn("SENDGRID_API_KEY not configured, returning link without sending email");
      return res.json({
        success: true,
        message: "Password reset link generated (email not sent - SendGrid not configured)",
        resetLink,
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || null
        }
      });
    }

    sgMail.setApiKey(apiKey);

    const emailContent = {
      to: email,
      from: {
        email: 'support@qrcallbox.com',
        name: 'QRCallBox Support'
      },
      subject: 'Password Reset Request - QRCallBox',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #333; margin-top: 0;">Password Reset Request</h2>
            <p>Hi ${user.displayName || 'there'},</p>
            <p>We received a request to reset your password for your QRCallBox account.</p>
          </div>

          <div style="background: #e7f3ff; padding: 20px; border-radius: 6px; margin: 20px 0; text-align: center;">
            <p style="margin-bottom: 15px;">Click the button below to reset your password:</p>
            <a href="${resetLink}" style="display: inline-block; background: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Reset Password
            </a>
          </div>

          <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; color: #856404;">
              <strong>⚠️ Important:</strong> This link will expire in <strong>1 hour</strong> for security reasons.
            </p>
          </div>

          <div style="border-top: 2px solid #dee2e6; padding-top: 20px; margin-top: 30px;">
            <p><strong>If you didn't request this password reset:</strong></p>
            <p>You can safely ignore this email. Your password will not be changed unless you click the link above and create a new password.</p>

            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Best regards,<br>
              QRCallBox Support Team
            </p>

            <p style="color: #999; font-size: 11px; margin-top: 20px;">
              If the button above doesn't work, copy and paste this link into your browser:<br>
              <span style="word-break: break-all;">${resetLink}</span>
            </p>
          </div>
        </div>
      `
    };

    await sgMail.send(emailContent);

    logger.info("Password reset email sent successfully", {
      email,
      admin: decodedToken.uid,
      userId: user.uid
    });

    res.json({
      success: true,
      message: "Password reset email sent successfully",
      user: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null
      }
    });

  } catch (error) {
    logger.error("Admin send password reset error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});

// ===== Broadcast message to all GroupMe bots =====
// One-time use function to announce app migration
export const broadcastToGroupMe = onRequest(
  {
    region: REGION,
    cors: { origin: ALLOWED_ORIGINS },
    secrets: [API_KEY]
  },
  async (req, res) => {
    try {
      // Require API key for security
      if (!validateApiKey(req)) {
        logger.warn("Unauthorized broadcast attempt");
        return res.status(401).send("Unauthorized");
      }

      const { message, dryRun } = req.body || {};

      if (!message) {
        return res.status(400).json({
          success: false,
          error: "Message is required. Send JSON body with 'message' field."
        });
      }

      logger.info("Broadcasting message to all GroupMe bots", { message, dryRun });

      // Get all GroupMe bots
      const botsSnapshot = await db.collection("groupme_bots").get();

      if (botsSnapshot.empty) {
        return res.json({ success: false, message: "No GroupMe bots found" });
      }

      const results = {
        total: botsSnapshot.size,
        sent: 0,
        failed: 0,
        skipped: 0,
        errors: []
      };

      for (const botDoc of botsSnapshot.docs) {
        const botData = botDoc.data();

        if (!botData.bot_id) {
          results.skipped++;
          continue;
        }

        try {
          if (dryRun) {
            logger.info(`[DRY RUN] Would send to bot ${botData.bot_id} (Store ${botData.store})`);
            results.sent++;
            continue;
          }

          const postResponse = await fetch("https://api.groupme.com/v3/bots/post", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bot_id: botData.bot_id,
              text: message
            })
          });

          if (postResponse.ok) {
            results.sent++;
            logger.info(`Sent to bot ${botData.bot_id} (Store ${botData.store})`);
          } else {
            results.failed++;
            const errorText = await postResponse.text();
            results.errors.push({
              bot_id: botData.bot_id,
              store: botData.store,
              status: postResponse.status,
              error: errorText
            });
          }

          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));

        } catch (error) {
          results.failed++;
          results.errors.push({
            bot_id: botData.bot_id,
            store: botData.store,
            error: error.message
          });
        }
      }

      logger.info("Broadcast complete", results);
      res.json({
        success: true,
        message: dryRun ? "Dry run complete" : "Broadcast complete",
        results
      });

    } catch (error) {
      logger.error("Broadcast error:", error);
      res.status(500).send("Internal server error: " + error.message);
    }
  }
);

// ===== STORE STATS AGGREGATION =====
// Pre-aggregates store statistics hourly to avoid expensive queries in Market Overview
// Results stored in store_stats collection, refreshed every hour

/**
 * Scheduled function to aggregate store stats every hour
 * Processes scans from multiple time periods and stores results
 */
export const aggregateStoreStats = onSchedule(
  {
    schedule: "every 1 hours",
    region: REGION,
    timeoutSeconds: 540, // 9 minutes max
    memory: "1GiB",
  },
  async (event) => {
    logger.info("Starting store stats aggregation");

    try {
      const now = new Date();

      // Define time periods to aggregate
      const periods = [
        { name: 'today', start: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        { name: 'week', start: (() => { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d; })() },
        { name: 'month', start: new Date(now.getFullYear(), now.getMonth(), 1) },
        { name: 'last30days', start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
      ];

      // Fetch scans from the last 30 days (covers all periods)
      const cutoffDate = periods.find(p => p.name === 'last30days').start;
      const scansSnap = await db.collection("scans")
        .where("timestamp", ">=", Timestamp.fromDate(cutoffDate))
        .orderBy("timestamp", "desc")
        .get();

      logger.info(`Processing ${scansSnap.size} scans for aggregation`);

      // Aggregate by store and period
      const storeStats = {};

      scansSnap.forEach(doc => {
        const scan = doc.data();
        const storeNum = String(scan.storeNumber || 'unknown').replace(/^0+/, '') || '0';
        const scanTime = scan.timestamp?.toDate ? scan.timestamp.toDate() : new Date(scan.timestamp);
        const area = (scan.areaDescription || scan.area || '').toLowerCase().trim();

        if (!storeStats[storeNum]) {
          storeStats[storeNum] = {};
          periods.forEach(p => {
            storeStats[storeNum][p.name] = {
              totalScans: 0,
              claimedScans: 0,
              areas: new Set(),
              responseTimes: []
            };
          });
        }

        // Add to relevant periods
        periods.forEach(period => {
          if (scanTime >= period.start) {
            const stats = storeStats[storeNum][period.name];
            stats.totalScans++;
            if (area) stats.areas.add(area);

            if (scan.claimedBy || scan.claimedByName) {
              stats.claimedScans++;

              // Calculate response time if available
              if (scan.timestamp && scan.claimedAt) {
                const requestTime = scan.timestamp.toDate ? scan.timestamp.toDate() : new Date(scan.timestamp);
                const claimTime = scan.claimedAt.toDate ? scan.claimedAt.toDate() : new Date(scan.claimedAt);
                const responseMin = (claimTime - requestTime) / 60000;
                if (responseMin > 0 && responseMin < 120) {
                  stats.responseTimes.push(responseMin);
                }
              }
            }
          }
        });
      });

      // Convert to storable format and write to Firestore
      const batch = db.batch();
      const statsCollection = db.collection("store_stats");

      for (const [storeNum, periodStats] of Object.entries(storeStats)) {
        const docData = {
          storeNumber: storeNum,
          lastUpdated: FieldValue.serverTimestamp(),
        };

        // Flatten period data
        for (const [period, stats] of Object.entries(periodStats)) {
          docData[period] = {
            totalScans: stats.totalScans,
            claimedScans: stats.claimedScans,
            areaCount: stats.areas.size,
            claimRate: stats.totalScans > 0 ? Math.round((stats.claimedScans / stats.totalScans) * 100) : 0,
            avgResponseTime: stats.responseTimes.length > 0
              ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
              : null
          };
        }

        batch.set(statsCollection.doc(storeNum), docData, { merge: true });
      }

      // Also store metadata about the aggregation
      batch.set(statsCollection.doc('_metadata'), {
        lastRun: FieldValue.serverTimestamp(),
        storeCount: Object.keys(storeStats).length,
        scansProcessed: scansSnap.size,
      });

      await batch.commit();
      logger.info(`Store stats aggregation complete: ${Object.keys(storeStats).length} stores updated`);

    } catch (error) {
      logger.error("Store stats aggregation failed:", error);
      throw error;
    }
  }
);

/**
 * HTTP endpoint to get pre-aggregated store stats for Market Overview
 * Much faster than querying all scans on every page load
 */
export const getStoreStats = onRequest(
  {
    region: REGION,
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    // Only allow GET
    if (req.method !== "GET") {
      res.status(405).send("Method not allowed");
      return;
    }

    try {
      // Optional: verify user is admin
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const token = authHeader.substring(7);
          const decodedToken = await getAuth().verifyIdToken(token);
          // Could add admin check here if needed
        } catch (authError) {
          // Continue without auth - stats are not sensitive
        }
      }

      const period = req.query.period || 'week'; // today, week, month, last30days
      const topN = parseInt(req.query.top) || 10;

      // Fetch pre-aggregated stats
      const statsSnap = await db.collection("store_stats").get();

      if (statsSnap.empty) {
        res.json({
          success: true,
          message: "No aggregated stats yet. Run aggregateStoreStats first.",
          stores: [],
          totals: { totalScans: 0, totalAreas: 0, storesActive: 0 }
        });
        return;
      }

      const stores = [];
      let totalScans = 0;
      let totalAreas = 0;
      let metadata = null;

      statsSnap.forEach(doc => {
        if (doc.id === '_metadata') {
          metadata = doc.data();
          return;
        }

        const data = doc.data();
        const periodData = data[period];

        if (periodData && periodData.totalScans > 0) {
          stores.push({
            storeNumber: data.storeNumber,
            totalScans: periodData.totalScans,
            claimedScans: periodData.claimedScans,
            areaCount: periodData.areaCount,
            claimRate: periodData.claimRate,
            avgResponseTime: periodData.avgResponseTime
          });
          totalScans += periodData.totalScans;
          totalAreas += periodData.areaCount;
        }
      });

      // Sort by total scans and take top N
      stores.sort((a, b) => b.totalScans - a.totalScans);
      const topStores = stores.slice(0, topN);

      res.json({
        success: true,
        period,
        lastUpdated: metadata?.lastRun || null,
        stores: topStores,
        totals: {
          totalScans,
          totalAreas,
          storesActive: stores.length
        }
      });

    } catch (error) {
      logger.error("getStoreStats error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
);
