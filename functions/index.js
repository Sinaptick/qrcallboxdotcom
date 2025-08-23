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
      const clientIp = req.ip || req.socket.remoteAddress;
      if (!checkRateLimit(clientIp, 5, 60000)) {
        return res.status(429).send("Too many requests. Please try again later.");
      }

      // Optional: accept a `state` param you pass through (e.g., your userId)
      const state = req.query.state ? sanitizeInput(String(req.query.state), 50) : "";
      const clientId = GROUPME_CLIENT_ID.value().trim();

      // GroupMe OAuth - Use Authorization Code flow since that's what GroupMe actually sends
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2);
      // Note: GroupMe will use the current logged-in user. Users should log out of GroupMe first if they want to switch accounts
      const authorizeUrl = `https://oauth.groupme.com/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(BASE_CALLBACK)}${state ? `&state=${encodeURIComponent(state)}` : ''}&_t=${timestamp}&_r=${randomId}`;

      logger.info("Redirecting to GroupMe OAuth", { authorizeUrl: authorizeUrl.substring(0, 100) + "...", timestamp });
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

    const callbackUrl = "https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeWebhook";
    const botRequest = {
      bot: {
        name: sanitizedName,
        group_id: sanitizedGroupId,
        callback_url: callbackUrl
      }
    };
    
    logger.info("Calling GroupMe API", { botRequest });

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
      return res.status(400).send(`Failed to create bot: ${JSON.stringify(json)}`);
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
    logger.error("Create bot error:", e.message, e.stack);
    if (e.message.includes('Invalid authentication')) {
      return res.status(401).send("Authentication required");
    }
    // More specific error message for debugging
    res.status(500).send(`Error creating bot: ${e.message}`);
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
  // Note: store parameter is kept for backwards compatibility but not used in message
  try {
    // Get all bots to find ones that should receive this notification
    const botsSnapshot = await db.collection("groupme_bots").get();
    
    for (const botDoc of botsSnapshot.docs) {
      const botData = botDoc.data();
      
      // Get the user's token to send message
      const tokenDoc = await db.collection("groupme_tokens").doc(botData.user_id).get();
      if (!tokenDoc.exists) continue;
      
      // Use local time zone (assuming PST/PDT for your location)
      const now = new Date();
      const localTime = new Date(now.getTime() - (4 * 60 * 60 * 1000)); // Subtract 4 hours to convert from UTC to PDT
      const message = `Customer assistance needed in ${sanitizeInput(area, 50)} at ${localTime.toLocaleTimeString()}`;
      
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