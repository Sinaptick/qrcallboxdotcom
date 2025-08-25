import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "firebase-admin/auth";
import sgMail from "@sendgrid/mail";

// ===== Submit Support Ticket =====
export const submitTicket = onRequest({
  region: "us-central1",
  cors: { origin: true }
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
    const userId = decodedToken.uid;

    const { subject, title, description } = req.body;
    
    if (!subject || !title || !description) {
      return res.status(400).send("All fields are required");
    }

    // Generate ticket ID
    const ticketId = `TICKET-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Get user info for the ticket
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Create ticket document
    const ticketData = {
      ticketId,
      userId,
      userEmail: userData.email || decodedToken.email || 'No email available',
      userName: userData.name || decodedToken.name || 'Unknown User',
      subject,
      title,
      description,
      status: 'open',
      priority: subject === 'Bugs' ? 'high' : subject === 'Setup Help' ? 'medium' : 'normal',
      submittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      responses: [],
      tags: [subject.toLowerCase()]
    };

    // Save to Firestore
    await db.collection('support_tickets').doc(ticketId).set(ticketData);

    logger.info("Support ticket submitted", { 
      ticketId, 
      userId, 
      subject, 
      title: title.substring(0, 50) + "..." 
    });

    res.status(200).json({
      success: true,
      ticketId,
      message: "Ticket submitted successfully"
    });

  } catch (error) {
    logger.error("Error submitting ticket:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Get All Tickets (Admin Only) =====
export const getTickets = onRequest({
  region: "us-central1",
  cors: { origin: true }
}, async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).send("Use GET");
    }

    // Verify Firebase authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send("Missing authorization header");
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Check if user is admin
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data().email !== 'sinaptick@gmail.com') {
      return res.status(403).send("Admin access required");
    }

    // Get query parameters
    const status = req.query.status || 'all';
    const limit = parseInt(req.query.limit) || 50;

    // Build query (fetch more to allow for proper sorting, then limit)
    let query = db.collection('support_tickets').orderBy('submittedAt', 'desc');
    
    if (status !== 'all') {
      query = query.where('status', '==', status);
    }
    
    // Fetch more tickets to ensure proper sorting, then limit after sorting
    query = query.limit(limit * 2);

    const ticketsSnapshot = await query.get();
    const tickets = [];

    ticketsSnapshot.forEach(doc => {
      const ticket = { id: doc.id, ...doc.data() };
      
      // Convert Firestore timestamps to ISO strings and store original for sorting
      if (ticket.submittedAt) {
        ticket.submittedAtTimestamp = ticket.submittedAt.toMillis();
        ticket.submittedAt = ticket.submittedAt.toDate().toISOString();
      }
      if (ticket.updatedAt) {
        ticket.updatedAt = ticket.updatedAt.toDate().toISOString();
      }
      
      tickets.push(ticket);
    });

    // Sort by priority (high > medium > normal) then by submitted date (newest first)
    const priorityOrder = { 'high': 3, 'medium': 2, 'normal': 1 };
    tickets.sort((a, b) => {
      const priorityA = priorityOrder[a.priority] || 1;
      const priorityB = priorityOrder[b.priority] || 1;
      
      // First sort by priority (descending - high to low)
      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }
      
      // Then sort by submitted date (descending - newest first)
      return (b.submittedAtTimestamp || 0) - (a.submittedAtTimestamp || 0);
    });

    // Apply limit after sorting
    const sortedTickets = tickets.slice(0, limit);
    
    // Remove the temporary timestamp field
    sortedTickets.forEach(ticket => {
      delete ticket.submittedAtTimestamp;
    });

    logger.info("Retrieved and sorted tickets", { count: sortedTickets.length, requestedBy: userId });

    res.status(200).json({ tickets: sortedTickets });

  } catch (error) {
    logger.error("Error retrieving tickets:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Get User's Own Tickets =====
export const getMyTickets = onRequest({
  region: "us-central1",
  cors: { origin: true }
}, async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).send("Use GET");
    }

    // Verify Firebase authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send("Missing authorization header");
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Get user's tickets
    const db = getFirestore();
    const ticketsSnapshot = await db.collection('support_tickets')
      .where('userId', '==', userId)
      .orderBy('submittedAt', 'desc')
      .get();

    const tickets = [];
    ticketsSnapshot.forEach(doc => {
      const ticket = { id: doc.id, ...doc.data() };
      
      // Convert Firestore timestamps to ISO strings
      if (ticket.submittedAt) {
        ticket.submittedAt = ticket.submittedAt.toDate().toISOString();
      }
      if (ticket.updatedAt) {
        ticket.updatedAt = ticket.updatedAt.toDate().toISOString();
      }
      
      // Convert response timestamps
      if (ticket.responses) {
        ticket.responses = ticket.responses.map(response => ({
          ...response,
          timestamp: response.timestamp ? response.timestamp.toDate().toISOString() : new Date().toISOString()
        }));
      }
      
      tickets.push(ticket);
    });

    logger.info("Retrieved user tickets", { userId, count: tickets.length });

    res.status(200).json({ tickets });

  } catch (error) {
    logger.error("Error retrieving user tickets:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Get Single Ticket Details (Admin Only) =====
export const getTicketDetails = onRequest({
  region: "us-central1",
  cors: { origin: true }
}, async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).send("Use GET");
    }

    // Verify Firebase authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send("Missing authorization header");
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Check if user is admin
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data().email !== 'sinaptick@gmail.com') {
      return res.status(403).send("Admin access required");
    }

    const ticketId = req.query.ticketId;
    if (!ticketId) {
      return res.status(400).send("Ticket ID required");
    }

    const ticketDoc = await db.collection('support_tickets').doc(ticketId).get();
    if (!ticketDoc.exists) {
      return res.status(404).send("Ticket not found");
    }

    const ticket = { id: ticketDoc.id, ...ticketDoc.data() };
    
    // Convert timestamps
    if (ticket.submittedAt) {
      ticket.submittedAt = ticket.submittedAt.toDate().toISOString();
    }
    if (ticket.updatedAt) {
      ticket.updatedAt = ticket.updatedAt.toDate().toISOString();
    }
    
    // Convert response timestamps
    if (ticket.responses) {
      ticket.responses = ticket.responses.map(response => ({
        ...response,
        timestamp: response.timestamp ? response.timestamp.toDate().toISOString() : new Date().toISOString()
      }));
    }

    res.status(200).json({ ticket });

  } catch (error) {
    logger.error("Error retrieving ticket details:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Respond to Ticket (Admin Only) =====
export const respondToTicket = onRequest({
  region: "us-central1",
  cors: { origin: true }
}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Use POST");
    }

    // Verify Firebase authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send("Missing authorization header");
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Check if user is admin
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data().email !== 'sinaptick@gmail.com') {
      return res.status(403).send("Admin access required");
    }

    const { ticketId, response, status, closeTicket } = req.body;
    
    if (!ticketId || !response) {
      return res.status(400).send("Ticket ID and response required");
    }

    // Get ticket
    const ticketRef = db.collection('support_tickets').doc(ticketId);
    const ticketDoc = await ticketRef.get();
    
    if (!ticketDoc.exists) {
      return res.status(404).send("Ticket not found");
    }

    const ticket = ticketDoc.data();

    // Prepare response object (use regular Date instead of FieldValue.serverTimestamp() in arrays)
    const responseObj = {
      id: `response-${Date.now()}`,
      text: response,
      author: 'Admin',
      authorId: userId,
      timestamp: new Date(),
      isAdmin: true
    };

    // Update ticket
    const updates = {
      responses: [...(ticket.responses || []), responseObj],
      updatedAt: FieldValue.serverTimestamp(),
      status: closeTicket ? 'closed' : (status || ticket.status)
    };

    await ticketRef.update(updates);

    // Send email to user
    await sendTicketResponseEmail(ticket, response, closeTicket);

    logger.info("Ticket response added", { ticketId, responseLength: response.length });

    res.status(200).json({
      success: true,
      message: "Response added successfully"
    });

  } catch (error) {
    logger.error("Error responding to ticket:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Send Email Response to User =====
async function sendTicketResponseEmail(ticket, response, isClosing) {
  try {
    // Initialize SendGrid with API key from environment
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      logger.warn("SENDGRID_API_KEY not configured, skipping email send");
      return false;
    }
    
    sgMail.setApiKey(apiKey);

    // Create unique reply-to address for email parsing
    const replyToEmail = `ticket-${ticket.ticketId}@qrcallbox.com`;
    
    const emailContent = {
      to: ticket.userEmail,
      from: {
        email: 'support@qrcallbox.com',
        name: 'QRcallbox Support'
      },
      replyTo: replyToEmail, // This allows reply parsing
      subject: `Re: ${ticket.title} [Ticket: ${ticket.ticketId}]`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h2 style="color: #333; margin-top: 0;">QRcallbox Support Response</h2>
            <p>Hi ${ticket.userName || 'there'},</p>
            <p>Thank you for contacting QRcallbox support. Here's our response to your ticket:</p>
          </div>

          <div style="background: #e9ecef; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #495057; margin-top: 0;">ORIGINAL REQUEST:</h3>
            <p><strong>Subject:</strong> ${ticket.subject}</p>
            <p><strong>Title:</strong> ${ticket.title}</p>
            <p><strong>Your Message:</strong></p>
            <div style="background: white; padding: 10px; border-radius: 4px; white-space: pre-wrap;">${ticket.description}</div>
          </div>

          <div style="background: #d4edda; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #155724; margin-top: 0;">OUR RESPONSE:</h3>
            <div style="white-space: pre-wrap;">${response}</div>
          </div>

          <div style="border-top: 2px solid #dee2e6; padding-top: 20px; margin-top: 30px;">
            ${isClosing ? 
              '<p><strong>This ticket has been closed.</strong> If you need further assistance, please submit a new support ticket.</p>' : 
              '<p><strong>Need to follow up?</strong> Simply reply to this email and we\'ll reopen your ticket automatically.</p>'
            }
            
            <p style="margin-top: 20px;">
              <strong>Ticket ID:</strong> ${ticket.ticketId}<br>
              <strong>Status:</strong> ${isClosing ? 'Closed' : 'Open'}
            </p>
            
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              Best regards,<br>
              QRcallbox Support Team
            </p>
          </div>
        </div>
      `
    };

    await sgMail.send(emailContent);
    
    logger.info("Email sent successfully for ticket", { 
      ticketId: ticket.ticketId,
      to: ticket.userEmail,
      subject: emailContent.subject
    });
    
    return true;
    
  } catch (error) {
    logger.error("Failed to send ticket response email:", error);
    return false;
  }
}

// ===== Handle Email Replies (Webhook from SendGrid) =====
export const handleEmailReply = onRequest({
  region: "us-central1",
  cors: { origin: true }
}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Use POST");
    }

    // SendGrid sends webhook data in the body
    const events = req.body;
    
    if (!Array.isArray(events)) {
      logger.warn("Invalid webhook payload from SendGrid");
      return res.status(400).send("Invalid payload");
    }

    for (const event of events) {
      if (event.event === 'inbound_parse') {
        await processInboundEmail(event);
      }
    }

    res.status(200).send("OK");

  } catch (error) {
    logger.error("Error handling email reply:", error);
    res.status(500).json({ error: error.message });
  }
});

async function processInboundEmail(emailData) {
  try {
    const to = emailData.to || '';
    const from = emailData.from || '';
    const subject = emailData.subject || '';
    const text = emailData.text || '';

    // Extract ticket ID from the 'to' address (ticket-TICKET-123@qrcallbox.com)
    const ticketMatch = to.match(/ticket-(TICKET-[^@]+)@/);
    if (!ticketMatch) {
      logger.warn("Could not extract ticket ID from email", { to });
      return;
    }

    const ticketId = ticketMatch[1];
    
    // Find the ticket in Firestore
    const db = getFirestore();
    const ticketRef = db.collection('support_tickets').doc(ticketId);
    const ticketDoc = await ticketRef.get();

    if (!ticketDoc.exists) {
      logger.warn("Ticket not found for email reply", { ticketId });
      return;
    }

    const ticket = ticketDoc.data();

    // Verify the email is from the original ticket submitter
    if (ticket.userEmail.toLowerCase() !== from.toLowerCase()) {
      logger.warn("Email reply from unauthorized sender", { 
        ticketId, 
        expected: ticket.userEmail, 
        actual: from 
      });
      return;
    }

    // Create user response object (use regular Date instead of FieldValue.serverTimestamp() in arrays)
    const userResponse = {
      id: `response-${Date.now()}`,
      text: text.trim(),
      author: ticket.userName || 'User',
      authorId: ticket.userId,
      timestamp: new Date(),
      isAdmin: false,
      source: 'email'
    };

    // Reopen ticket if it was closed and add the response
    const updates = {
      responses: [...(ticket.responses || []), userResponse],
      updatedAt: FieldValue.serverTimestamp(),
      status: 'open' // Always reopen when user replies
    };

    await ticketRef.update(updates);

    logger.info("User reply added via email", { 
      ticketId, 
      from, 
      messageLength: text.length 
    });

  } catch (error) {
    logger.error("Failed to process inbound email:", error);
  }
}

// ===== Lookup Ticket by Ticket ID (Admin Only) =====
export const lookupTicket = onRequest({
  region: "us-central1",
  cors: { origin: true }
}, async (req, res) => {
  try {
    if (req.method !== "GET") {
      return res.status(405).send("Use GET");
    }

    // Verify Firebase authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send("Missing authorization header");
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Check if user is admin
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data().email !== 'sinaptick@gmail.com') {
      return res.status(403).send("Admin access required");
    }

    const ticketId = req.query.ticketId;
    if (!ticketId) {
      return res.status(400).send("Ticket ID required");
    }

    // Search for ticket by ticketId field (not document ID)
    const ticketsSnapshot = await db.collection('support_tickets')
      .where('ticketId', '==', ticketId)
      .limit(1)
      .get();

    if (ticketsSnapshot.empty) {
      return res.status(404).send("Ticket not found");
    }

    const ticketDoc = ticketsSnapshot.docs[0];
    const ticket = { id: ticketDoc.id, ...ticketDoc.data() };
    
    // Convert timestamps
    if (ticket.submittedAt) {
      ticket.submittedAt = ticket.submittedAt.toDate().toISOString();
    }
    if (ticket.updatedAt) {
      ticket.updatedAt = ticket.updatedAt.toDate().toISOString();
    }
    
    // Convert response timestamps
    if (ticket.responses) {
      ticket.responses = ticket.responses.map(response => ({
        ...response,
        timestamp: response.timestamp ? response.timestamp.toDate().toISOString() : new Date().toISOString()
      }));
    }

    logger.info("Ticket looked up", { ticketId, foundId: ticket.id });

    res.status(200).json({ ticket });

  } catch (error) {
    logger.error("Error looking up ticket:", error);
    res.status(500).json({ error: error.message });
  }
});

// ===== Update Ticket Priority (Admin Only) =====
export const updateTicketPriority = onRequest({
  region: "us-central1",
  cors: { origin: true }
}, async (req, res) => {
  try {
    if (req.method !== "POST") {
      return res.status(405).send("Use POST");
    }

    // Verify Firebase authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).send("Missing authorization header");
    }

    const idToken = authHeader.split('Bearer ')[1];
    const decodedToken = await getAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Check if user is admin
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists || userDoc.data().email !== 'sinaptick@gmail.com') {
      return res.status(403).send("Admin access required");
    }

    const { ticketId, priority } = req.body;
    
    if (!ticketId || !priority) {
      return res.status(400).send("Ticket ID and priority required");
    }

    // Validate priority
    if (!['normal', 'medium', 'high'].includes(priority)) {
      return res.status(400).send("Priority must be normal, medium, or high");
    }

    // Update ticket priority
    const ticketRef = db.collection('support_tickets').doc(ticketId);
    const ticketDoc = await ticketRef.get();
    
    if (!ticketDoc.exists) {
      return res.status(404).send("Ticket not found");
    }

    await ticketRef.update({
      priority: priority,
      updatedAt: FieldValue.serverTimestamp()
    });

    logger.info("Ticket priority updated", { ticketId, priority, userId });

    res.status(200).json({ success: true, priority });

  } catch (error) {
    logger.error("Error updating ticket priority:", error);
    res.status(500).json({ error: error.message });
  }
});