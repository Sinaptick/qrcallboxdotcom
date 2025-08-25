import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import puppeteer from "puppeteer";
import { createDecipheriv, createHash } from "crypto";
import { defineSecret } from "firebase-functions/params";

const ENCRYPTION_KEY_SECRET = defineSecret("ENCRYPTION_KEY");

// Generate a key from the secret
function getEncryptionKey() {
  const key = ENCRYPTION_KEY_SECRET.value();
  return createHash('sha256').update(key).digest();
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

// ===== Workvivo Response Monitor (runs every 2 minutes) =====
export const workvivoMonitor = onSchedule({
  schedule: "*/2 * * * *", // Every 2 minutes
  region: "us-central1",
  timeoutSeconds: 540,
  secrets: [ENCRYPTION_KEY_SECRET]
}, async (event) => {
  try {
    logger.info("Starting Workvivo response monitoring");
    
    const db = getFirestore();
    
    // Get all connected Workvivo users
    const workvivo = await db.collection("workvivo_config")
      .where("connected", "==", true)
      .get();
    
    if (workvivo.empty) {
      logger.info("No connected Workvivo users found");
      return;
    }
    
    logger.info(`Monitoring responses for ${workvivo.docs.length} Workvivo users`);
    
    // Process each user's configuration
    for (const userDoc of workvivo.docs) {
      const userId = userDoc.id;
      const config = userDoc.data();
      
      try {
        await monitorUserResponses(userId, config);
      } catch (error) {
        logger.error(`Failed to monitor responses for user ${userId}:`, error);
      }
    }
    
    logger.info("Workvivo response monitoring completed");
    
  } catch (error) {
    logger.error("Workvivo monitor error:", error);
  }
});

// ===== Monitor Responses for a Specific User =====
async function monitorUserResponses(userId, config) {
  if (!config.selectedChannel) {
    logger.warn(`No channel configured for user ${userId}`);
    return;
  }
  
  const db = getFirestore();
  
  // Find recent unresponded assistance requests for this user
  const recentTime = new Date(Date.now() - 6 * 60 * 60 * 1000); // 6 hours ago
  
  const recentLogs = await db.collection("logs")
    .where("ts", ">=", recentTime)
    .where("respondedAt", "==", null)
    .orderBy("ts", "desc")
    .limit(10)
    .get();
    
  if (recentLogs.empty) {
    logger.debug(`No unresponded requests found for user ${userId}`);
    return;
  }
  
  logger.info(`Checking for responses to ${recentLogs.docs.length} requests for user ${userId}`);
  
  // Launch browser to check for new messages
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Login to Workvivo based on auth type
    const password = decrypt(config.password);
    const authType = config.authType || "email";
    
    if (authType === "walmart-saml") {
      const walmartUserId = decrypt(config.walmartUserId);
      const storeNumber = decrypt(config.storeNumber);
      await performWalmartSAMLLogin(page, walmartUserId, storeNumber, password);
    } else {
      // Legacy email/password login
      const email = decrypt(config.email);
      await page.goto('https://app.workvivo.com/login', { waitUntil: 'networkidle0' });
      await page.type('input[type="email"], input[name="email"]', email);
      await page.type('input[type="password"], input[name="password"]', password);
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        page.click('button[type="submit"], input[type="submit"], .login-button')
      ]);
    }
    
    // Navigate to the configured channel
    await navigateToChannel(page, config.selectedChannel);
    
    // Get recent messages from the channel
    const messages = await extractRecentMessages(page);
    
    logger.info(`Found ${messages.length} recent messages in channel for user ${userId}`);
    
    // Check if any messages are responses to our assistance requests
    await checkForResponses(recentLogs.docs, messages, userId);
    
    // Update last monitoring time
    await db.collection("workvivo_config").doc(userId).update({
      lastMonitored: FieldValue.serverTimestamp()
    });
    
  } finally {
    await browser.close();
  }
}

// ===== Navigate to Channel =====
async function navigateToChannel(page, channelId) {
  try {
    await page.waitForSelector('.channel-list, .chat-list, .groups-list', { timeout: 10000 });
    
    const channelClicked = await page.evaluate((id) => {
      const selectors = [
        `[data-id="${id}"]`,
        `[data-channel-id="${id}"]`,
        `a[href*="${id}"]`
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          element.click();
          return true;
        }
      }
      
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
      await page.waitForTimeout(3000);
    }
    
  } catch (error) {
    logger.warn("Failed to navigate to channel:", error);
  }
}

// ===== Extract Recent Messages =====
async function extractRecentMessages(page) {
  try {
    // Wait for messages to load
    await page.waitForSelector([
      '.message',
      '.chat-message', 
      '.message-item',
      '[data-testid*="message"]'
    ].join(', '), { timeout: 10000 });
    
    // Extract message data
    const messages = await page.evaluate(() => {
      const messageElements = document.querySelectorAll([
        '.message',
        '.chat-message',
        '.message-item',
        '[data-testid*="message"]'
      ].join(', '));
      
      const currentTime = Date.now();
      const twoHoursAgo = currentTime - (2 * 60 * 60 * 1000);
      
      return Array.from(messageElements).map((element, index) => {
        // Extract author name
        const authorElement = element.querySelector([
          '.author',
          '.sender',
          '.username',
          '.message-author',
          '[data-testid*="author"]'
        ].join(', '));
        const author = authorElement ? authorElement.textContent.trim() : 'Unknown';
        
        // Extract message text
        const textElement = element.querySelector([
          '.message-text',
          '.message-content',
          '.text',
          '.content'
        ].join(', '));
        const text = textElement ? textElement.textContent.trim() : '';
        
        // Try to extract timestamp
        const timeElement = element.querySelector([
          '.timestamp',
          '.time',
          '.message-time',
          '[data-testid*="time"]'
        ].join(', '));
        
        let timestamp = currentTime - (index * 60000); // Fallback: assume 1 minute intervals
        
        if (timeElement) {
          const timeText = timeElement.textContent.trim();
          // Try to parse relative times like "2 minutes ago"
          const minutesMatch = timeText.match(/(\d+)\s*minutes?\s*ago/i);
          const hoursMatch = timeText.match(/(\d+)\s*hours?\s*ago/i);
          
          if (minutesMatch) {
            timestamp = currentTime - (parseInt(minutesMatch[1]) * 60000);
          } else if (hoursMatch) {
            timestamp = currentTime - (parseInt(hoursMatch[1]) * 60 * 60000);
          }
        }
        
        // Only include messages from the last 2 hours
        if (timestamp < twoHoursAgo) {
          return null;
        }
        
        return {
          author,
          text,
          timestamp: new Date(timestamp),
          element_index: index
        };
      }).filter(msg => msg !== null);
    });
    
    return messages;
    
  } catch (error) {
    logger.error("Failed to extract messages:", error);
    return [];
  }
}

// ===== Check for Responses =====
async function checkForResponses(logDocs, messages, userId) {
  const db = getFirestore();
  
  for (const logDoc of logDocs) {
    const logData = logDoc.data();
    const requestTime = logData.ts.toDate ? logData.ts.toDate() : new Date(logData.ts);
    
    // Look for messages after the request time
    const potentialResponses = messages.filter(msg => 
      msg.timestamp > requestTime &&
      msg.author !== 'QR Assistant' && // Ignore our own bot messages
      msg.text && msg.text.length > 0
    );
    
    if (potentialResponses.length > 0) {
      // Take the first response chronologically
      potentialResponses.sort((a, b) => a.timestamp - b.timestamp);
      const firstResponse = potentialResponses[0];
      
      // Calculate response time
      const responseTimeSeconds = Math.round((firstResponse.timestamp - requestTime) / 1000);
      
      // Update the log with response information
      await logDoc.ref.update({
        respondedAt: FieldValue.serverTimestamp(),
        responderName: firstResponse.author,
        responseText: firstResponse.text,
        responseTime: firstResponse.timestamp,
        responseTimeSeconds: responseTimeSeconds,
        responseSource: "workvivo",
        workvivoUserId: userId
      });
      
      logger.info("Logged Workvivo response", {
        logId: logDoc.id,
        responder: firstResponse.author,
        responseTimeSeconds: responseTimeSeconds,
        store: logData.store,
        area: logData.area
      });
    }
  }
}

// ===== Manual Response Check (for immediate checking) =====
export async function checkWorkvivoResponses(userId) {
  try {
    const db = getFirestore();
    const configDoc = await db.collection("workvivo_config").doc(userId).get();
    
    if (!configDoc.exists()) {
      return { success: false, error: "No Workvivo configuration found" };
    }
    
    await monitorUserResponses(userId, configDoc.data());
    
    return { success: true };
    
  } catch (error) {
    logger.error("Manual response check failed:", error);
    return { success: false, error: error.message };
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
    
    // Step 6: Wait for MFA push notification
    logger.info("Waiting for MFA push notification approval...");
    await page.waitForSelector([
      'input[type="password"]',
      'input[name="password"]', 
      '.password-field',
      '.mfa-approved',
      '.authentication-success'
    ].join(', '), { timeout: 120000 }); // Wait up to 2 minutes for push approval
    
    // Step 7: Check if we need to enter password or if MFA was approved
    const passwordField = await page.$('input[type="password"], input[name="password"]');
    if (passwordField) {
      logger.info("Password field found, entering password");
      await page.type('input[type="password"], input[name="password"]', password);
      
      // Submit password
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
        page.click('button[type="submit"], input[type="submit"], .submit-button')
      ]);
      logger.info("Submitted password");
    }
    
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