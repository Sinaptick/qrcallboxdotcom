# Workvivo Integration Setup Guide

## Overview

This integration uses browser automation to connect with Workvivo's web interface, allowing QRcallbox to post messages to Workvivo channels when customers scan QR codes, and track response times just like the existing GroupMe integration.

## Prerequisites

- Workvivo account with access to chat channels
- Firebase project with Functions and Firestore enabled
- Node.js 20+ for Firebase Functions

## Quick Setup Steps

### 1. Configure Environment Variables

Set up the encryption key for secure credential storage:

```bash
firebase functions:secrets:set ENCRYPTION_KEY="your-secure-32-character-key-here"
```

**Important**: Use a strong, unique encryption key in production. This key encrypts Workvivo credentials in the database.

### 2. Install Dependencies

Navigate to your functions directory and install dependencies:

```bash
cd functions
npm install
```

The `package.json` has been updated to include Puppeteer for browser automation.

### 3. Deploy Firebase Functions

Deploy the new Workvivo functions:

```bash
firebase deploy --only functions
```

This will deploy:
- `workvivoConnect` - Handles Workvivo login and connection
- `workvivoConfig` - Configures channel settings
- `workvivoDisconnect` - Disconnects Workvivo integration  
- `workvivoMonitor` - Monitors for responses (scheduled function)

### 4. Update Firestore Security Rules

Add these rules to your `firestore.rules` to secure Workvivo configuration:

```javascript
// Add to your existing rules
match /workvivo_config/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

### 5. Configure Scheduled Response Monitoring

The `workvivoMonitor` function runs every 2 minutes to check for responses. Make sure your Firebase plan supports scheduled functions:

- **Spark Plan**: Limited scheduled functions
- **Blaze Plan**: Unlimited scheduled functions (recommended)

## How to Use

### For End Users

1. **Connect Workvivo Account**:
   - Go to Settings tab in QRcallbox
   - Scroll to "Workvivo Integration" section
   - Click "Connect Workvivo Account"
   - Enter your Workvivo email and password
   - The system will test the connection and retrieve available channels

2. **Configure Notifications**:
   - Select the Workvivo channel where you want to receive notifications
   - Click "Save Configuration"
   - The system is now ready to send notifications to Workvivo

3. **Test the Integration**:
   - Generate a QR code
   - Scan it with your phone
   - You should receive a notification in both GroupMe (if configured) and Workvivo

### Response Tracking

The system automatically monitors Workvivo channels for responses:

- **Real-time Detection**: Checks every 2 minutes for new messages
- **Response Attribution**: Links responses to original assistance requests
- **Performance Metrics**: Tracks response times and displays in analytics
- **Multi-Channel Support**: Each user can configure their own channel

## Technical Details

### Browser Automation

The integration uses Puppeteer to:
- Log into Workvivo with user credentials
- Navigate to specified channels
- Post notification messages
- Extract recent messages for response tracking

### Security Features

- **Credential Encryption**: All passwords encrypted with AES-256
- **Session Management**: Browser sessions are temporary and ephemeral
- **User Isolation**: Each user manages their own Workvivo connection
- **Rate Limiting**: Built-in protection against excessive requests

### Data Storage

Workvivo configuration is stored in Firestore:

```javascript
// Collection: workvivo_config
// Document ID: Firebase user UID
{
  connected: true,
  email: "encrypted_email",
  password: "encrypted_password", 
  channels: [
    { id: "channel1", name: "General" },
    { id: "channel2", name: "Store Operations" }
  ],
  selectedChannel: "channel1",
  connectedAt: timestamp,
  lastActive: timestamp,
  lastMonitored: timestamp
}
```

## Troubleshooting

### Common Issues

**"Login failed - invalid credentials or MFA required"**
- Verify Workvivo email/password are correct
- Check if MFA is enabled (not currently supported)
- Ensure Workvivo account has access to chat features

**"Could not find channel"**
- Channel may have been deleted or access revoked
- Try disconnecting and reconnecting to refresh channel list
- Verify user has access to the selected channel

**"No channels found"**
- User may not have access to any Workvivo channels
- Contact Workvivo administrator to verify permissions
- Try logging into Workvivo web interface manually first

**Browser automation fails**
- Cloud Functions environment may have restrictions
- Check Firebase Functions logs for detailed errors
- Consider increasing function timeout if needed

### Debug Mode

Enable debug logging in your functions:

```bash
# View function logs
firebase functions:log --only workvivoConnect,workvivoMonitor
```

The Workvivo setup component includes a debug log section showing:
- Connection attempts
- Channel discovery
- API responses
- Error messages

### Performance Considerations

- **Function Timeouts**: Workvivo functions may take 30-60 seconds due to browser automation
- **Memory Usage**: Puppeteer requires additional memory allocation
- **Monitoring Frequency**: Response monitoring runs every 2 minutes (configurable)
- **Concurrent Users**: Each user connection is independent

## Architecture

```
QR Scan → Firebase Function → {
                               GroupMe Notification +
                               Workvivo Notification
                              }
                              
Response Monitor (every 2 min) → Check Workvivo → Update Database
```

### Integration Flow

1. **QR Scan**: Customer scans QR code
2. **Dual Notifications**: System sends to both GroupMe and Workvivo
3. **Response Monitoring**: Scheduled function checks for responses
4. **Analytics Update**: Response data feeds into existing analytics

## Advanced Configuration

### Custom Message Format

Modify the message format in `functions/index.js`:

```javascript
const message = `🔔 Customer assistance needed in ${area} at ${time}`;
```

### Monitoring Frequency

Adjust the monitoring schedule in `functions/workvivo-monitor.js`:

```javascript
export const workvivoMonitor = onSchedule({
  schedule: "*/5 * * * *", // Every 5 minutes instead of 2
  // ... rest of configuration
});
```

### Channel Selector Customization

Modify channel detection logic in `functions/workvivo-automation.js` to match your Workvivo instance's HTML structure.

## Security Best Practices

1. **Strong Encryption Key**: Use a cryptographically secure 32-character key
2. **Firestore Rules**: Restrict access to user's own configuration only  
3. **Function Permissions**: Ensure functions have minimal required permissions
4. **Credential Rotation**: Regularly update Workvivo passwords
5. **Monitoring**: Set up alerts for function failures

## Support

If you encounter issues:

1. Check Firebase Functions logs: `firebase functions:log`
2. Verify Workvivo credentials by logging in manually
3. Test browser automation locally if needed
4. Review debug logs in the UI

---

**Next Steps**: After deployment, test the integration with both GroupMe and Workvivo to ensure notifications are sent to both platforms and responses are tracked from both sources!