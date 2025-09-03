import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import * as logger from "firebase-functions/logger";

/**
 * Normalize store numbers by removing leading zeros
 * Handles cases like 00669 -> 669, 05173 -> 5173
 */
function normalizeStore(store) {
  if (store === null || store === undefined || store === '') {
    return '';
  }
  
  const storeStr = String(store);
  const normalized = storeStr.replace(/^0+/, '') || '0';
  return normalized;
}

/**
 * Scheduled function to monitor stores without active bots
 * Runs daily at 2 AM to check for stores with users but no bots
 * Creates system tickets for stores that need bot setup
 */
export const monitorStoresWithoutBots = onSchedule({
  schedule: "0 2 * * *", // Run daily at 2 AM
  timeZone: "America/New_York",
  region: "us-central1",
  memory: "256MB",
  maxInstances: 1,
}, async (event) => {
  const db = getFirestore();
  
  try {
    logger.info("Starting bot monitoring check");
    
    // Get all active users with store assignments
    const usersSnapshot = await db.collection('users')
      .where('approved', '==', true)
      .get();
    
    // Build a map of stores and their users
    const storeUsersMap = new Map();
    
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const stores = userData.allowedStores || 
                    (userData.storeNumber ? [userData.storeNumber] : []);
      
      stores.forEach(store => {
        const normalizedStore = normalizeStore(store);
        if (!storeUsersMap.has(normalizedStore)) {
          storeUsersMap.set(normalizedStore, []);
        }
        storeUsersMap.get(normalizedStore).push({
          id: doc.id,
          name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email,
          email: userData.email
        });
      });
    });
    
    logger.info(`Found ${storeUsersMap.size} stores with users`);
    
    // Get all active GroupMe bots
    const botsSnapshot = await db.collection('groupme_bots')
      .where('active', '==', true)
      .get();
    
    // Build a set of stores with active bots
    const storesWithBots = new Set();
    botsSnapshot.forEach(doc => {
      const botData = doc.data();
      if (botData.store) {
        storesWithBots.add(normalizeStore(botData.store));
      }
    });
    
    logger.info(`Found ${storesWithBots.size} stores with active bots`);
    
    // Find stores with users but no bots
    const storesNeedingBots = [];
    for (const [store, users] of storeUsersMap.entries()) {
      if (!storesWithBots.has(store)) {
        storesNeedingBots.push({ store, users });
      }
    }
    
    logger.info(`Found ${storesNeedingBots.length} stores needing bots`);
    
    // Check for existing open tickets to avoid duplicates
    const existingTicketsSnapshot = await db.collection('support_tickets')
      .where('status', '==', 'open')
      .where('isSystemGenerated', '==', true)
      .where('category', '==', 'bot_setup_needed')
      .get();
    
    const existingTicketStores = new Set();
    existingTicketsSnapshot.forEach(doc => {
      const ticket = doc.data();
      if (ticket.metadata && ticket.metadata.store) {
        existingTicketStores.add(normalizeStore(ticket.metadata.store));
      }
    });
    
    // Create tickets for stores without bots (and without existing tickets)
    const ticketsCreated = [];
    for (const { store, users } of storesNeedingBots) {
      if (existingTicketStores.has(store)) {
        logger.info(`Skipping store ${store} - ticket already exists`);
        continue;
      }
      
      const ticketId = `SYSTEM-${Date.now()}-${store}`;
      const userList = users.slice(0, 3).map(u => u.name).join(', ');
      const additionalUsers = users.length > 3 ? ` and ${users.length - 3} more` : '';
      
      const ticketData = {
        ticketId,
        userId: 'system',
        userEmail: 'system@qrcallbox.com',
        userName: 'System Monitor',
        subject: 'Bot Setup Required',
        title: `Store ${store} - No Active Bot Connected`,
        description: `This store has ${users.length} active user(s) but no GroupMe bot configured.\n\nUsers: ${userList}${additionalUsers}\n\nAction Required: Create and configure a GroupMe bot for this store to enable live assistance notifications.`,
        status: 'open',
        priority: 'medium',
        category: 'bot_setup_needed',
        isSystemGenerated: true,
        metadata: {
          store,
          userCount: users.length,
          users: users.map(u => ({ name: u.name, email: u.email }))
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        responses: []
      };
      
      await db.collection('support_tickets').doc(ticketId).set(ticketData);
      ticketsCreated.push(store);
      
      logger.info(`Created ticket for store ${store} with ${users.length} users`);
    }
    
    // Log summary
    const summary = {
      totalStoresWithUsers: storeUsersMap.size,
      storesWithBots: storesWithBots.size,
      storesNeedingBots: storesNeedingBots.length,
      ticketsCreated: ticketsCreated.length,
      stores: ticketsCreated
    };
    
    logger.info("Bot monitoring complete", summary);
    
    // Store monitoring log for dashboard/analytics
    await db.collection('system_logs').add({
      type: 'bot_monitoring',
      timestamp: new Date().toISOString(),
      summary
    });
    
  } catch (error) {
    logger.error("Error in bot monitoring:", error);
    
    // Create an error ticket for admins
    const errorTicket = {
      ticketId: `ERROR-${Date.now()}`,
      userId: 'system',
      userEmail: 'system@qrcallbox.com',
      userName: 'System Monitor',
      subject: 'System Error',
      title: 'Bot Monitoring Function Error',
      description: `The automated bot monitoring function encountered an error:\n\n${error.message}\n\nPlease check the logs for more details.`,
      status: 'open',
      priority: 'high',
      category: 'system_error',
      isSystemGenerated: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      responses: []
    };
    
    await db.collection('support_tickets').doc(errorTicket.ticketId).set(errorTicket);
  }
});

/**
 * Monitor for bot deletions - checks if any bots have been removed from groups
 * Runs every 6 hours to detect deleted bots quickly
 */
export const monitorBotDeletions = onSchedule({
  schedule: "0 */6 * * *", // Run every 6 hours
  timeZone: "America/New_York",
  region: "us-central1",
  memory: "256MB",
  maxInstances: 1,
}, async (event) => {
  const db = getFirestore();
  
  try {
    logger.info("Starting bot deletion monitoring");
    
    // Get all bots that were previously active
    const botsSnapshot = await db.collection('groupme_bots')
      .where('active', '==', true)
      .get();
    
    const deletionsDetected = [];
    
    for (const doc of botsSnapshot.docs) {
      const botData = doc.data();
      const botId = doc.id;
      
      // Skip if no GroupMe user ID is associated
      if (!botData.groupme_user_id) continue;
      
      try {
        // Get the user's GroupMe token
        const userDoc = await db.collection('users').doc(botData.owner_user_id || botData.user_id).get();
        const userData = userDoc.data();
        
        if (!userData || !userData.groupme_access_token) {
          logger.warn(`No GroupMe token for user ${botData.owner_user_id || botData.user_id}`);
          continue;
        }
        
        // Check if bot still exists in GroupMe
        const botsResponse = await fetch('https://api.groupme.com/v3/bots', {
          headers: {
            'X-Access-Token': userData.groupme_access_token
          }
        });
        
        if (!botsResponse.ok) {
          logger.error(`Failed to fetch bots for user ${userData.email}`);
          continue;
        }
        
        const botsData = await botsResponse.json();
        const activeBots = botsData.response || [];
        
        // Check if this bot still exists
        const botStillExists = activeBots.some(b => b.bot_id === botData.bot_id);
        
        if (!botStillExists) {
          // Bot has been deleted!
          deletionsDetected.push({
            botId,
            botData,
            store: botData.store,
            groupName: botData.group_name,
            ownerEmail: userData.email
          });
          
          // Mark bot as inactive in our database
          await doc.ref.update({
            active: false,
            deletedDetectedAt: new Date().toISOString(),
            lastStatus: 'deleted_from_group'
          });
          
          logger.info(`Bot deletion detected: ${botData.name} from store ${botData.store}`);
        }
      } catch (error) {
        logger.error(`Error checking bot ${botId}:`, error);
      }
    }
    
    // Create tickets for deleted bots
    for (const deletion of deletionsDetected) {
      // Check if there's already an open ticket for this bot deletion
      const existingTickets = await db.collection('support_tickets')
        .where('status', '==', 'open')
        .where('category', '==', 'bot_deleted')
        .where('metadata.botId', '==', deletion.botId)
        .get();
      
      if (!existingTickets.empty) {
        logger.info(`Ticket already exists for deleted bot ${deletion.botId}`);
        continue;
      }
      
      const ticketId = `DELETION-${Date.now()}-${deletion.store}`;
      
      const ticketData = {
        ticketId,
        userId: 'system',
        userEmail: 'system@qrcallbox.com',
        userName: 'System Monitor',
        subject: 'Bot Deletion Alert',
        title: `Store ${deletion.store} - Bot Removed from GroupMe`,
        description: `A bot has been deleted or removed from a GroupMe group.\n\nBot Details:\n- Store: ${deletion.store}\n- Group: ${deletion.groupName || 'Unknown'}\n- Bot Name: ${deletion.botData.name}\n- Owner: ${deletion.ownerEmail}\n- Detected: ${new Date().toLocaleString()}\n\nAction Required: Verify if this deletion was intentional. If not, recreate the bot for the store.`,
        status: 'open',
        priority: 'high',
        category: 'bot_deleted',
        isSystemGenerated: true,
        metadata: {
          botId: deletion.botId,
          store: deletion.store,
          groupName: deletion.groupName,
          botData: deletion.botData,
          ownerEmail: deletion.ownerEmail
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        responses: []
      };
      
      await db.collection('support_tickets').doc(ticketId).set(ticketData);
      logger.info(`Created deletion alert ticket for store ${deletion.store}`);
    }
    
    // Log summary
    const summary = {
      botsChecked: botsSnapshot.size,
      deletionsDetected: deletionsDetected.length,
      ticketsCreated: deletionsDetected.length,
      deletedBots: deletionsDetected.map(d => ({
        store: d.store,
        group: d.groupName,
        owner: d.ownerEmail
      }))
    };
    
    logger.info("Bot deletion monitoring complete", summary);
    
    // Store monitoring log
    await db.collection('system_logs').add({
      type: 'bot_deletion_monitoring',
      timestamp: new Date().toISOString(),
      summary
    });
    
  } catch (error) {
    logger.error("Error in bot deletion monitoring:", error);
  }
});

/**
 * Manual trigger for bot monitoring (for testing or on-demand checks)
 * Can be called via HTTP request by admins
 */
export const checkBotsManually = onRequest({
  region: "us-central1",
  cors: { origin: true }
}, async (req, res) => {
  try {
    // Verify admin access
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send("Unauthorized");
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;
    
    // Check if user is admin
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();
    
    if (!userData || userData.email !== 'qrcallbox@gmail.com') {
      return res.status(403).send("Admin access required");
    }
    
    // Run the monitoring function logic
    logger.info("Manual bot check triggered by admin");
    
    // Call the monitoring logic (you could extract the logic into a shared function)
    // For now, we'll just trigger it
    await monitorStoresWithoutBots({ data: {} });
    
    res.status(200).json({ 
      success: true, 
      message: "Bot monitoring check completed. Check support tickets for results." 
    });
    
  } catch (error) {
    logger.error("Error in manual bot check:", error);
    res.status(500).send(`Error: ${error.message}`);
  }
});