import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import puppeteer from "puppeteer";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { defineSecret } from "firebase-functions/params";

const ENCRYPTION_KEY_SECRET = defineSecret("ENCRYPTION_KEY");

// Generate a key from the secret
function getEncryptionKey() {
  const key = ENCRYPTION_KEY_SECRET.value();
  return createHash('sha256').update(key).digest();
}

// Encrypt sensitive data
function encrypt(text) {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt sensitive data
function decrypt(text) {
  const key = getEncryptionKey();
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ===== Workvivo Connection Handler =====
export const workvivoConnect = onRequest({
  region: "us-central1",
  cors: { origin: true },
  timeoutSeconds: 120,
  secrets: [ENCRYPTION_KEY_SECRET]
}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Use POST");
    }

    // Verify Firebase authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send("Missing or invalid authorization header");
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const firebaseUserId = decodedToken.uid;

    const { userId: walmartUserId, storeNumber, password, authType, email, notificationMethod } = req.body;
    
    if (notificationMethod === "email") {
      // Email notification setup
      if (!email) {
        return res.status(400).send("Email address required");
      }
      
      // Store email configuration
      const db = getFirestore();
      await db.collection("workvivo_config").doc(firebaseUserId).set({
        connected: true,
        notificationMethod: "email",
        email: encrypt(email),
        connectedAt: FieldValue.serverTimestamp(),
        lastActive: FieldValue.serverTimestamp()
      });
      
      logger.info("Email notifications configured", { firebaseUserId, email });
      
      return res.status(200).json({
        success: true,
        notificationMethod: "email",
        channels: [{ id: "email", name: "Email Notifications" }]
      });
      
    } else if (authType === "walmart-saml") {
      if (!walmartUserId || !storeNumber || !password) {
        return res.status(400).send("User ID, store number, and password required");
      }
    } else {
      // Legacy email/password support
      if (!email || !password) {
        return res.status(400).send("Email and password required");
      }
    }

    logger.info("Attempting Workvivo connection", { 
      firebaseUserId, 
      walmartUserId: walmartUserId || "legacy", 
      authType: authType || "email" 
    });

    // For Walmart SAML, we'll store the credentials and provide a manual connection URL
    // The user will complete the authentication in their browser
    if (authType === "walmart-saml") {
      // Store the credentials for later use
      const db = getFirestore();
      const configData = {
        connected: false, // Not fully connected yet - user needs to complete auth
        pendingConnection: true,
        authType: "walmart-saml",
        walmartUserId: encrypt(walmartUserId),
        storeNumber: encrypt(storeNumber), 
        password: encrypt(password),
        connectedAt: FieldValue.serverTimestamp()
      };
      
      await db.collection("workvivo_config").doc(firebaseUserId).set(configData);
      
      logger.info("Stored Walmart SAML credentials for manual completion", { firebaseUserId });
      
      // Return special response for manual authentication
      return res.status(200).json({
        success: true,
        requiresManualAuth: true,
        authUrl: 'https://mtls.pfedprod.wal-mart.com/idp/yBBwtWZsdb/resumeSAML20/idp/SSO.ping',
        message: 'Please complete authentication manually in the popup window'
      });
    }

    // For non-SAML (legacy) authentication, use browser automation
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // Legacy Workvivo direct login
      await page.goto('https://app.workvivo.com/login', { waitUntil: 'networkidle0' });
      await page.type('input[type="email"], input[name="email"]', email);
      await page.type('input[type="password"], input[name="password"]', password);
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        page.click('button[type="submit"], input[type="submit"], .login-button')
      ]);
      
      // Check if login was successful by looking for dashboard elements
      const isLoggedIn = await page.evaluate(() => {
        return !document.querySelector('.error-message, .login-error') && 
               (document.querySelector('.dashboard, .main-content, .chat-list') !== null);
      });

      if (!isLoggedIn) {
        throw new Error("Login failed - invalid credentials");
      }

      // Extract available channels/groups
      const channels = await extractChannels(page);
      
      // Store encrypted credentials and connection status
      const db = getFirestore();
      const configData = {
        connected: true,
        channels: channels,
        connectedAt: FieldValue.serverTimestamp(),
        lastActive: FieldValue.serverTimestamp(),
        authType: authType || "email",
        password: encrypt(password)
      };
      
      if (authType === "walmart-saml") {
        configData.walmartUserId = encrypt(walmartUserId);
        configData.storeNumber = encrypt(storeNumber);
      } else {
        configData.email = encrypt(email);
      }
      
      await db.collection("workvivo_config").doc(firebaseUserId).set(configData);

      logger.info("Workvivo connection successful", { firebaseUserId, channelCount: channels.length });

      res.status(200).json({
        success: true,
        channels: channels
      });

    } finally {
      await browser.close();
    }

  } catch (error) {
    logger.error("Workvivo connection error:", error);
    res.status(500).json({
      error: "Connection failed: " + error.message
    });
  }
});

// ===== Extract Channels from Workvivo =====
async function extractChannels(page) {
  try {
    // Wait for chat/channel list to load
    await page.waitForSelector('.channel-list, .chat-list, .groups-list', { timeout: 10000 });
    
    // Extract channel information
    const channels = await page.evaluate(() => {
      const channelElements = document.querySelectorAll([
        '.channel-item',
        '.chat-item', 
        '.group-item',
        '[data-testid*="channel"]',
        '[data-testid*="chat"]',
        '.chat-list-item'
      ].join(', '));
      
      return Array.from(channelElements).map((element, index) => {
        const nameElement = element.querySelector('.name, .title, .channel-name, .chat-name');
        const name = nameElement ? nameElement.textContent.trim() : `Channel ${index + 1}`;
        
        // Try to extract ID from data attributes or href
        let id = element.getAttribute('data-id') || 
                 element.getAttribute('data-channel-id') ||
                 element.getAttribute('data-chat-id');
                 
        if (!id) {
          const link = element.querySelector('a[href*="/chat/"], a[href*="/channel/"]');
          if (link) {
            const href = link.getAttribute('href');
            const match = href.match(/\/(?:chat|channel)\/([^\/\?]+)/);
            id = match ? match[1] : `channel-${index}`;
          } else {
            id = `channel-${index}`;
          }
        }
        
        return { id, name };
      });
    });
    
    return channels.length > 0 ? channels : [{ id: 'general', name: 'General' }];
    
  } catch (error) {
    logger.error("Failed to extract channels:", error);
    return [{ id: 'general', name: 'General' }];
  }
}

// ===== Workvivo Configuration Handler =====
export const workvivoConfig = onRequest({
  region: "us-central1",
  cors: { origin: true },
  secrets: [ENCRYPTION_KEY_SECRET]
}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Use POST");
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send("Missing authorization header");
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const { channel } = req.body;
    if (!channel) {
      return res.status(400).send("Channel required");
    }

    // Update configuration
    const db = getFirestore();
    await db.collection("workvivo_config").doc(userId).update({
      selectedChannel: channel,
      configuredAt: FieldValue.serverTimestamp()
    });

    logger.info("Workvivo configuration saved", { userId, channel });

    res.status(200).json({ success: true });

  } catch (error) {
    logger.error("Workvivo configuration error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Workvivo Disconnect Handler =====
export const workvivoDisconnect = onRequest({
  region: "us-central1",
  cors: { origin: true },
  secrets: [ENCRYPTION_KEY_SECRET]
}, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send("Missing authorization header");
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Remove configuration
    const db = getFirestore();
    await db.collection("workvivo_config").doc(userId).delete();

    logger.info("Workvivo disconnected", { userId });

    res.status(200).json({ success: true });

  } catch (error) {
    logger.error("Workvivo disconnect error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Check Manual Authentication Completion =====
export const workvivoCheckCompletion = onRequest({
  region: "us-central1",
  cors: { origin: true },
  secrets: [ENCRYPTION_KEY_SECRET]
}, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send("Missing authorization header");
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const db = getFirestore();
    const configDoc = await db.collection("workvivo_config").doc(userId).get();

    if (!configDoc.exists()) {
      return res.status(404).json({ completed: false, error: "No configuration found" });
    }

    const config = configDoc.data();
    
    if (config.connected) {
      // Already completed
      return res.status(200).json({ 
        completed: true, 
        channels: config.channels || [] 
      });
    }

    if (config.pendingConnection && config.authType === "walmart-saml") {
      // Try to complete the connection by extracting channels from Workvivo
      // For now, we'll use a simplified approach - ask user to manually verify
      // In a real implementation, you might have a callback URL or polling mechanism
      
      // Return default channels for now - user can select their channel manually
      const defaultChannels = [
        { id: 'general', name: 'General' },
        { id: 'store-ops', name: 'Store Operations' },
        { id: 'team-updates', name: 'Team Updates' }
      ];

      // Update to connected status
      await db.collection("workvivo_config").doc(userId).update({
        connected: true,
        pendingConnection: false,
        channels: defaultChannels,
        lastActive: FieldValue.serverTimestamp()
      });

      logger.info("Workvivo manual connection completed", { userId });

      return res.status(200).json({ 
        completed: true, 
        channels: defaultChannels 
      });
    }

    return res.status(200).json({ completed: false });

  } catch (error) {
    logger.error("Check completion error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Post Message to Workvivo =====
export async function postToWorkvivo(message, userId) {
  try {
    const db = getFirestore();
    const configDoc = await db.collection("workvivo_config").doc(userId).get();
    
    if (!configDoc.exists() || !configDoc.data().connected) {
      logger.warn("No Workvivo connection found for user", { userId });
      return { success: false, error: "Not connected to Workvivo" };
    }

    const config = configDoc.data();
    const channelId = config.selectedChannel;
    const authType = config.authType || "email";

    if (!channelId) {
      logger.warn("No channel configured for Workvivo", { userId });
      return { success: false, error: "No channel configured" };
    }

    // Handle email notifications
    if (config.notificationMethod === "email") {
      logger.info("Sending email notification", { userId });
      
      const emailAddress = decrypt(config.email);
      const success = await sendEmailNotification(emailAddress, message, config);
      
      await db.collection("workvivo_config").doc(userId).update({
        lastActive: FieldValue.serverTimestamp(),
        lastNotificationAttempt: FieldValue.serverTimestamp(),
        lastNotificationMethod: "email"
      });
      
      return { success, method: "email" };
    }

    // For Walmart SAML users with chat integration
    if (authType === "walmart-saml") {
      logger.info("Walmart SAML user - chat integration not supported due to MFA", { userId });
      
      await db.collection("workvivo_config").doc(userId).update({
        lastActive: FieldValue.serverTimestamp(),
        lastNotificationAttempt: FieldValue.serverTimestamp(),
        lastNotificationMethod: "unsupported"
      });

      return { success: false, method: "unsupported", error: "Chat integration requires manual MFA which is not automated" };
    }

    // For legacy users, use browser automation
    const password = decrypt(config.password);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      
      // Legacy email/password login
      const email = decrypt(config.email);
      await page.goto('https://app.workvivo.com/login', { waitUntil: 'networkidle0' });
      await page.type('input[type="email"], input[name="email"]', email);
      await page.type('input[type="password"], input[name="password"]', password);
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        page.click('button[type="submit"], input[type="submit"], .login-button')
      ]);

      // Navigate to the specific channel
      await navigateToChannel(page, channelId);
      
      // Post the message
      await postMessage(page, message);
      
      // Update last active timestamp
      await db.collection("workvivo_config").doc(userId).update({
        lastActive: FieldValue.serverTimestamp()
      });

      logger.info("Message posted to Workvivo", { userId, channelId });
      
      return { success: true, method: "browser" };

    } finally {
      await browser.close();
    }

  } catch (error) {
    logger.error("Failed to post to Workvivo:", error);
    return { success: false, error: error.message };
  }
}

// ===== Navigate to Specific Channel =====
async function navigateToChannel(page, channelId) {
  try {
    // Look for the channel in the sidebar
    await page.waitForSelector('.channel-list, .chat-list, .groups-list', { timeout: 10000 });
    
    // Try different selectors to find and click the channel
    const channelClicked = await page.evaluate((id) => {
      const selectors = [
        `[data-id="${id}"]`,
        `[data-channel-id="${id}"]`,
        `a[href*="${id}"]`,
        `.channel-item:contains("${id}")`,
        `.chat-item:contains("${id}")`
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          element.click();
          return true;
        }
      }
      
      // Fallback: try to find by text content
      const items = document.querySelectorAll('.channel-item, .chat-item, .group-item');
      for (const item of items) {
        if (item.textContent.includes(id) || item.getAttribute('data-id') === id) {
          item.click();
          return true;
        }
      }
      
      return false;
    }, channelId);

    if (channelClicked) {
      await page.waitForTimeout(2000); // Wait for channel to load
    } else {
      logger.warn("Could not find channel, posting to current channel", { channelId });
    }
    
  } catch (error) {
    logger.warn("Failed to navigate to specific channel:", error);
  }
}

// ===== Post Message =====
async function postMessage(page, message) {
  try {
    // Wait for message input to be available
    await page.waitForSelector([
      'textarea[placeholder*="message"]',
      'textarea[placeholder*="Message"]', 
      '.message-input textarea',
      '[contenteditable="true"]',
      'input[type="text"]'
    ].join(', '), { timeout: 10000 });

    // Type the message
    const messagePosted = await page.evaluate((msg) => {
      const selectors = [
        'textarea[placeholder*="message"]',
        'textarea[placeholder*="Message"]',
        '.message-input textarea', 
        '[contenteditable="true"]',
        'input[type="text"]'
      ];
      
      for (const selector of selectors) {
        const input = document.querySelector(selector);
        if (input) {
          if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
            input.value = msg;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          } else {
            input.textContent = msg;
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          
          // Try to find and click send button
          const sendButton = document.querySelector([
            'button[type="submit"]',
            '.send-button',
            '[data-testid="send"]',
            'button:contains("Send")',
            '.message-send-button'
          ].join(', '));
          
          if (sendButton) {
            sendButton.click();
          } else {
            // Try pressing Enter
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          }
          
          return true;
        }
      }
      return false;
    }, message);

    if (!messagePosted) {
      throw new Error("Could not find message input field");
    }

    // Wait a moment for the message to be sent
    await page.waitForTimeout(2000);
    
  } catch (error) {
    throw new Error("Failed to post message: " + error.message);
  }
}

// ===== Handle Walmart SAML Authentication =====
async function performWalmartSAMLLogin(page, walmartUserId, storeNumber, password) {
  try {
    logger.info("Starting Walmart SAML authentication flow");
    
    // Step 1: Navigate to Walmart SSO page
    await page.goto('https://mtls.pfedprod.wal-mart.com/idp/yBBwtWZsdb/resumeSAML20/idp/SSO.ping', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Step 2: Enter User ID
    await page.waitForSelector('input[name="pf.username"], input[id="username"], input[type="text"]', { timeout: 10000 });
    await page.type('input[name="pf.username"], input[id="username"], input[type="text"]', walmartUserId);
    logger.info("Entered Walmart User ID");
    
    // Step 3: Change location to "Store"
    const locationSelector = 'select[name="pf.adapterId"], select[name="location"], .location-dropdown';
    try {
      await page.waitForSelector(locationSelector, { timeout: 5000 });
      await page.select(locationSelector, 'store');
      logger.info("Selected 'Store' location");
    } catch (e) {
      logger.warn("Could not find location dropdown, continuing...");
    }
    
    // Step 4: Enter Store Number
    const storeInputSelector = 'input[name="pf.storeNumber"], input[name="store"], input[placeholder*="store"]';
    try {
      await page.waitForSelector(storeInputSelector, { timeout: 5000 });
      await page.type(storeInputSelector, storeNumber);
      logger.info("Entered store number");
    } catch (e) {
      logger.warn("Could not find store number field, may not be required");
    }
    
    // Step 5: Submit initial form
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
      page.click('button[type="submit"], input[type="submit"], .submit-button, .login-button')
    ]);
    logger.info("Submitted initial authentication form");
    
    // Step 6: Wait for MFA code input field
    logger.info("Waiting for MFA code input field...");
    await page.waitForSelector([
      'input[name="otp"]',
      'input[name="mfaCode"]',
      'input[placeholder*="code"]',
      'input[placeholder*="Code"]',
      'input[type="tel"]',
      '.mfa-code-input'
    ].join(', '), { timeout: 120000 }); // Wait up to 2 minutes for MFA code field
    
    // Step 7: Wait for user to manually enter the MFA code
    // The user will need to check their phone and enter the 6-digit code
    logger.info("MFA code field found. Waiting for user to enter the 6-digit code...");
    
    // Wait for the code to be entered and form to be submitted
    // We'll wait for either a password field or successful navigation
    await page.waitForSelector([
      'input[type="password"]',
      'input[name="password"]', 
      '.password-field'
    ].join(', '), { timeout: 300000 }); // Wait up to 5 minutes for user to enter code
    
    // Step 8: Enter password after MFA code is accepted
    logger.info("Password field found, entering password");
    await page.type('input[type="password"], input[name="password"]', password);
    
    // Submit password
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
      page.click('button[type="submit"], input[type="submit"], .submit-button')
    ]);
    logger.info("Submitted password");
    
    // Step 8: Wait for final redirect to Workvivo
    await page.waitForFunction(
      () => window.location.href.includes('workvivo.com') || 
            document.querySelector('.dashboard, .main-content, .chat-list'),
      { timeout: 60000 }
    );
    
    logger.info("Successfully completed Walmart SAML authentication");
    
  } catch (error) {
    logger.error("Walmart SAML authentication failed:", error);
    throw new Error(`Walmart SAML login failed: ${error.message}`);
  }
}

// ===== Send Email Notification =====
async function sendEmailNotification(emailAddress, message, config) {
  try {
    // For now, we'll log the email instead of actually sending it
    // In production, you'd integrate with SendGrid, AWS SES, etc.
    
    const emailContent = {
      to: emailAddress,
      subject: "🚨 Customer Assistance Required",
      body: `
        ${message}
        
        Time: ${new Date().toLocaleString()}
        
        Please check your store for a customer who needs assistance.
        
        ---
        QRcallbox Notification System
      `
    };
    
    logger.info("Email notification prepared", { 
      to: emailAddress, 
      subject: emailContent.subject,
      messagePreview: message.substring(0, 50) + "..."
    });
    
    // TODO: Implement actual email sending
    // Example with SendGrid:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // await sgMail.send(emailContent);
    
    return true;
    
  } catch (error) {
    logger.error("Failed to send email notification:", error);
    return false;
  }
}