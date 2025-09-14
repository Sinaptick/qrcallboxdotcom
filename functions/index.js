import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getMessaging } from "firebase-admin/messaging";

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";

// Import webhook handler and automation functions
export { groupmeWebhook } from './groupme-webhook.js';
// Workvivo functions temporarily disabled
// export { workvivoConnect, workvivoConfig, workvivoDisconnect, workvivoCheckCompletion } from './workvivo-automation.js';
// export { workvivoMonitor } from './workvivo-monitor.js';
export { submitTicket, getTickets, getMyTickets, getTicketDetails, respondToTicket, handleEmailReply, lookupTicket, updateTicketPriority } from './tickets.js';
export { monitorStoresWithoutBots, monitorBotDeletions, checkBotsManually } from './bot-monitor.js';
// import { postToWorkvivo } from './workvivo-automation.js';

// ===== Secrets (set with `firebase functions:secrets:set ...`) =====
const GROUPME_CLIENT_ID = defineSecret("GROUPME_CLIENT_ID");
const API_KEY = defineSecret("API_KEY");
// GroupMe doesn't use client_secret for user applications

// ===== Admin SDK =====
initializeApp();
const db = getFirestore();

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

// Enhanced spam protection with IP blocking
const rateLimitStore = new Map();
const suspiciousActivity = new Map(); // Track suspicious IPs

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

// Track suspicious activity and auto-block repeat offenders
async function trackSuspiciousActivity(ip, reason) {
  const now = Date.now();
  
  if (!suspiciousActivity.has(ip)) {
    suspiciousActivity.set(ip, []);
  }
  
  const activities = suspiciousActivity.get(ip);
  const recentActivities = activities.filter(a => a.time > now - 3600000); // Last hour
  recentActivities.push({ time: now, reason });
  
  // Auto-block after 5 violations in an hour
  if (recentActivities.length >= 5) {
    await db.collection('blocked_ips').doc(ip).set({
      ip,
      blockedAt: FieldValue.serverTimestamp(),
      reason: 'Auto-blocked: Multiple spam attempts',
      violations: recentActivities.map(a => a.reason),
      expiresAt: new Date(now + 24 * 60 * 60 * 1000), // 24 hour block
      autoBlocked: true
    });
    
    // Log to spam_logs for admin review
    await db.collection('spam_logs').add({
      ip,
      timestamp: FieldValue.serverTimestamp(),
      action: 'auto_blocked',
      violations: recentActivities.length,
      details: recentActivities
    });
    
    suspiciousActivity.delete(ip); // Clear after blocking
    return true;
  }
  
  suspiciousActivity.set(ip, recentActivities);
  return false;
}

// Enhanced rate limiting with violation tracking
async function checkRateLimit(ip, maxRequests = 10, windowMs = 60000) {
  // First check if IP is blocked
  if (await isIPBlocked(ip)) {
    return { allowed: false, reason: 'blocked' };
  }
  
  const now = Date.now();
  const windowStart = now - windowMs;
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }
  
  const requests = rateLimitStore.get(ip);
  const validRequests = requests.filter(time => time > windowStart);
  
  if (validRequests.length >= maxRequests) {
    // Track this as suspicious activity
    await trackSuspiciousActivity(ip, `Rate limit exceeded: ${validRequests.length} requests in ${windowMs/1000}s`);
    return { allowed: false, reason: 'rate_limit' };
  }
  
  validRequests.push(now);
  rateLimitStore.set(ip, validRequests);
  return { allowed: true };
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
                  // Debug: Log what we received
                  console.log('Full URL:', window.location.href);
                  console.log('Hash fragment:', window.location.hash);
                  console.log('Query string:', window.location.search);
                  
                  // Log all URL parameters for debugging
                  const allParams = {};
                  if (window.location.search) {
                    const urlParams = new URLSearchParams(window.location.search);
                    for (const [key, value] of urlParams) {
                      allParams['query_' + key] = value;
                    }
                  }
                  if (window.location.hash) {
                    const hashParams = new URLSearchParams(window.location.hash.substring(1));
                    for (const [key, value] of hashParams) {
                      allParams['hash_' + key] = value;
                    }
                  }
                  console.log('All parameters:', allParams);
                  
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
                  
                  // Debug output - show what GroupMe actually sent
                  document.getElementById('message').innerHTML = \`
                    <div style="text-align: left; font-size: 14px; background: #333; color: #fff; padding: 2rem; border-radius: 0.5rem; margin: 1rem 0; font-family: monospace;">
                      <h3 style="color: #ff6b6b; margin-bottom: 1rem;">🔍 GROUPME OAUTH DEBUG - COPY THIS:</h3>
                      <div style="background: #000; padding: 1rem; border-radius: 0.25rem; margin: 0.5rem 0;">
                        <strong>Full URL:</strong><br>\${window.location.href}<br><br>
                        <strong>Fragment:</strong><br>\${fragment}<br><br>
                        <strong>Query:</strong><br>\${query}<br><br>
                        <strong>All Parameters:</strong><br>\${JSON.stringify(allParams, null, 2)}<br><br>
                        <strong>Access Token (Implicit):</strong><br>\${accessToken || 'NOT FOUND'}<br><br>
                        <strong>Auth Code (Code Flow):</strong><br>\${authCode || 'NOT FOUND'}<br><br>
                        <strong>Error:</strong><br>\${error || 'NONE'}<br><br>
                        <strong>Error Description:</strong><br>\${errorDescription || 'NONE'}<br>
                      </div>
                      <div id="step-log" style="margin-top: 1rem; color: #4ecdc4;">Step 1: Checking what GroupMe sent...</div>
                    </div>
                  \`;
                  
                  // Check for OAuth error first
                  if (error) {
                    throw new Error(\`OAuth error: \${error}\${errorDescription ? ' - ' + errorDescription : ''}\`);
                  }
                  
                  // If we have an authorization code but no access token, handle it server-side
                  if (authCode && !accessToken) {
                    document.getElementById('step-log').innerHTML += '<br>Step 1.5: Found auth code, processing server-side to avoid CORS...';
                    
                    // Send auth code to our backend for processing (avoids CORS issues)
                    try {
                      document.getElementById('step-log').innerHTML += '<br>Step 1.5a: Calling exchange-code Cloud Function directly...';
                      
                      const exchangeResponse = await fetch('https://groupmeexchangecode-46us5rurra-uc.a.run.app', {
                        method: 'POST',
                        headers: { 
                          'Content-Type': 'application/json',
                          'Accept': 'application/json'
                        },
                        body: JSON.stringify({ code: authCode, state: state }),
                        mode: 'cors'
                      });
                      
                      document.getElementById('step-log').innerHTML += \`<br>Step 1.5b: Exchange response status: \${exchangeResponse.status}\`;
                      
                      if (exchangeResponse.ok) {
                        const tokenData = await exchangeResponse.json();
                        accessToken = tokenData.access_token;
                        document.getElementById('step-log').innerHTML += '<br>Step 1.6: Success! Got access token from server-side processing.';
                      } else {
                        const errorText = await exchangeResponse.text();
                        document.getElementById('step-log').innerHTML += \`<br>Step 1.6: Server-side processing failed (HTTP \${exchangeResponse.status}): \${errorText}\`;
                        throw new Error(\`Failed to process authorization code: HTTP \${exchangeResponse.status} - \${errorText}\`);
                      }
                    } catch (exchangeError) {
                      document.getElementById('step-log').innerHTML += \`<br>Step 1.6: Exchange failed: \${exchangeError.message}\`;
                      
                      // If fetch fails completely (CORS/network), fall back to direct Cloud Function URL
                      if (exchangeError.message.includes('Failed to fetch')) {
                        document.getElementById('step-log').innerHTML += '<br>Step 1.7: Trying direct Cloud Function URL as fallback...';
                        try {
                          const directResponse = await fetch('https://groupmeexchangecode-46us5rurra-uc.a.run.app', {
                            method: 'POST',
                            headers: { 
                              'Content-Type': 'application/json',
                              'Accept': 'application/json'
                            },
                            body: JSON.stringify({ code: authCode, state: state }),
                            mode: 'cors'
                          });
                          
                          if (directResponse.ok) {
                            const tokenData = await directResponse.json();
                            accessToken = tokenData.access_token;
                            document.getElementById('step-log').innerHTML += '<br>Step 1.8: Success! Got access token from direct Cloud Function.';
                          } else {
                            const errorText = await directResponse.text();
                            document.getElementById('step-log').innerHTML += \`<br>Step 1.8: Direct Cloud Function failed: \${errorText}\`;
                            throw new Error(\`Direct exchange failed: \${errorText}\`);
                          }
                        } catch (directError) {
                          document.getElementById('step-log').innerHTML += \`<br>Step 1.8: Direct exchange failed: \${directError.message}\`;
                          throw new Error(\`Both hosting and direct Cloud Function failed: \${directError.message}\`);
                        }
                      } else {
                        throw new Error(\`GroupMe authorization code exchange failed: \${exchangeError.message}\`);
                      }
                    }
                  }
                  
                  if (!accessToken) {
                    throw new Error('No access token or usable authorization code received from GroupMe. Check debug info above.');
                  }
                  
                  // Step 2: Validate token and get user info
                  document.getElementById('step-log').innerHTML += '<br>Step 2: Validating token with GroupMe API...';
                  const response = await fetch(\`https://api.groupme.com/v3/users/me?token=\${encodeURIComponent(accessToken)}\`);
                  
                  document.getElementById('step-log').innerHTML += \`<br>Step 2.1: GroupMe API response status: \${response.status}\`;
                  
                  if (!response.ok) {
                    const errorText = await response.text();
                    document.getElementById('step-log').innerHTML += \`<br>Step 2.2: GroupMe API error: \${errorText}\`;
                    throw new Error(\`Failed to validate token: HTTP \${response.status} - \${errorText}\`);
                  }
                  
                  const userData = await response.json();
                  document.getElementById('step-log').innerHTML += \`<br>Step 2.3: GroupMe API response received\`;
                  document.getElementById('step-log').innerHTML += \`<br>Step 2.4: User data: \${JSON.stringify(userData).substring(0, 200)}...\`;
                  
                  const userId = userData.response?.id;
                  
                  if (!userId) {
                    document.getElementById('step-log').innerHTML += \`<br>Step 2.5: No user ID found in response\`;
                    throw new Error('Failed to get user information from GroupMe response');
                  }
                  
                  document.getElementById('step-log').innerHTML += \`<br>Step 3: Got user ID: \${userId}\`;
                  
                  // Store token in Firestore via our backend
                  document.getElementById('step-log').innerHTML += '<br>Step 4: Storing token in backend...';
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
                  
                  document.getElementById('step-log').innerHTML += \`<br>Step 4.1: Store API response status: \${storeResponse.status}\`;
                  
                  if (!storeResponse.ok) {
                    const storeErrorText = await storeResponse.text();
                    document.getElementById('step-log').innerHTML += \`<br>Step 4.2: Store API error: \${storeErrorText}\`;
                    throw new Error(\`Failed to store token: HTTP \${storeResponse.status} - \${storeErrorText}\`);
                  }
                  
                  const storeResult = await storeResponse.json();
                  document.getElementById('step-log').innerHTML += \`<br>Step 4.3: Store API success: \${JSON.stringify(storeResult)}\`;
                  
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
                    }, '*');
                    document.getElementById('message').innerHTML += '<br><br><em>Connection successful! You can close this window and return to the app.</em>';
                    
                    // Auto-close after 3 seconds on success
                    setTimeout(() => {
                      window.close();
                    }, 3000);
                  }
                  
                } catch (error) {
                  console.error('OAuth error:', error);
                  document.getElementById('title').textContent = '❌ Connection Failed';
                  document.getElementById('message').innerHTML = \`
                    <div style="background: #ff4444; color: white; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0;">
                      <h3>❌ Connection Failed</h3>
                      <p><strong>Error:</strong> \${error.message}</p>
                      <p><strong>DO NOT CLOSE THIS WINDOW - COPY THE DEBUG INFO ABOVE!</strong></p>
                    </div>
                    <div style="text-align: left; font-size: 14px; background: #333; color: #fff; padding: 2rem; border-radius: 0.5rem; margin: 1rem 0; font-family: monospace;">
                      <h3 style="color: #ff6b6b; margin-bottom: 1rem;">🔍 OAUTH DEBUG INFO - COPY THIS:</h3>
                      <div style="background: #000; padding: 1rem; border-radius: 0.25rem; margin: 0.5rem 0;">
                        <strong>Full URL:</strong><br>\${window.location.href}<br><br>
                        <strong>Fragment:</strong><br>\${window.location.hash}<br><br>
                        <strong>Query:</strong><br>\${window.location.search}<br><br>
                        <strong>Error Message:</strong><br>\${error.message}<br><br>
                        <strong>Error Stack:</strong><br>\${error.stack || 'No stack trace'}<br>
                      </div>
                    </div>
                  \`;
                  
                  // Log to console as well
                  console.log('OAUTH DEBUG INFO:');
                  console.log('Full URL:', window.location.href);
                  console.log('Fragment:', window.location.hash);
                  console.log('Query:', window.location.search);
                  console.log('Error:', error);
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
    res.status(500).json({ error: `Internal server error: ${e.message}` });
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
    res.status(500).send(`Error storing token: ${e.message}`);
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
    res.status(500).send(`Error creating bot: ${e.message}`);
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
    res.status(500).send(`Error syncing bots: ${e.message}`);
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
    res.status(500).send(`Error fixing bot stores: ${e.message}`);
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
    res.status(500).send(`Error debugging bots: ${e.message}`);
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
    res.status(500).send(`Error creating admin bot: ${e.message}`);
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
    res.status(500).send(`Error deleting bot: ${e.message}`);
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
    res.status(500).send(`Error fetching GroupMe data: ${e.message}`);
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
    await db.collection("qr_tokens").doc(token).set({
      store: sanitizedStore,
      area: sanitizedArea,
      token,
      createdBy: decodedToken.uid,
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
    
    // Update scan count
    await db.collection("qr_tokens").doc(token).update({
      scanned: true,
      scanCount: FieldValue.increment(1),
      lastScannedAt: FieldValue.serverTimestamp()
    });

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
      areaDescription: tokenData.area,
      ipAddress: req.ip || req.socket.remoteAddress,
      userAgent: req.get('User-Agent') || '',
      responses: [],
      status: "pending",
      claimedBy: "",
      claimedByName: "",
      claimedAt: null,
      resolvedAt: null
    };
    
    const scanDoc = await db.collection("scans").add(scanRecord);

    // Send notifications to all platforms
    await sendGroupMeNotification(tokenData.store, tokenData.area);
    await sendWorkvivoNotification(tokenData.store, tokenData.area);
    await sendAndroidNotification(tokenData.store, tokenData.area, scanDoc.id);

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

// ===== App version check endpoint =====
export const getAppVersion = onRequest(
  { 
    region: REGION, 
    cors: { origin: ALLOWED_ORIGINS } 
  },
  async (req, res) => {
    try {
      const versionInfo = {
        latestVersion: "1.7.22",
        versionCode: 36,
        downloadUrl: "https://qrwebaccdb.web.app/app/QRCallBox-debug-v1.7.22.apk",
        releaseNotes: "✨ Complete UI Polish: Perfect header alignment with QRCallBox title, welcome message, and menu. Condensed Settings layout fits everything on one screen. Fixed Wednesday text wrapping. Professional design with optimal spacing throughout.",
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

// ===== Helper: Send Android FCM notification =====
async function sendAndroidNotification(store, area, scanId = null) {
  try {
    logger.info(`Starting Android notification for store ${store}, area ${area}`);
    
    // Get all users for the specific store who have FCM tokens
    // Try multiple possible field names for store assignment
    logger.info(`Querying for users with store ${store}...`);
    
    let usersSnapshot = await db.collection("users")
      .where("storeNumber", "==", parseInt(store))
      .get();
    
    if (usersSnapshot.empty) {
      logger.info(`No users found with storeNumber=${store} (number). Trying string...`);
      usersSnapshot = await db.collection("users")
        .where("storeNumber", "==", String(store))
        .get();
    }
    
    if (usersSnapshot.empty) {
      logger.info(`No users found with storeNumber=${store} (string). Trying homeStore...`);
      usersSnapshot = await db.collection("users")
        .where("homeStore", "==", String(store))
        .get();
    }
    
    if (usersSnapshot.empty) {
      logger.info(`No users found with homeStore=${store}. Trying allowedStores array...`);
      usersSnapshot = await db.collection("users")
        .where("allowedStores", "array-contains", parseInt(store))
        .get();
    }
    
    if (usersSnapshot.empty) {
      logger.info(`No users found with allowedStores containing ${store} (number). Trying string...`);
      usersSnapshot = await db.collection("users")
        .where("allowedStores", "array-contains", String(store))
        .get();
    }
    
    if (usersSnapshot.empty) {
      logger.info(`No users found for store ${store}`);
      return;
    }
    
    logger.info(`Found ${usersSnapshot.docs.length} users for store ${store}, checking for FCM tokens...`);
    
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
        claimedAt: null
      });
    }
    
    // Send notification to each user with FCM token
    const tokens = [];
    const validUsers = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      if (userData.fcmToken && userData.fcmToken.length > 10) {
        tokens.push(userData.fcmToken);
        validUsers.push({
          uid: userDoc.id,
          name: userData.firstName || userData.fullName || "Unknown",
          token: userData.fcmToken
        });
      }
    }
    
    if (tokens.length === 0) {
      logger.info(`No valid FCM tokens found for store ${store}`);
      return;
    }
    
    logger.info(`Found ${tokens.length} FCM tokens for store ${store}`);
    
    // Send to each token individually (more reliable than multicast)
    let successCount = 0;
    
    for (const token of tokens) {
      try {
        const message = {
          data: notificationData,
          android: {
            priority: "high"
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
    
    logger.info("Android FCM notification completed", {
      store,
      area,
      scanId,
      totalTokens: tokens.length,
      successCount: successCount,
      failureCount: tokens.length - successCount
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
      'firstName', 'lastName', 'email', 'storeNumber', 'jobTitle', 
      'role', 'notificationsEnabled', 'respectDoNotDisturb', 'workSchedule'
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