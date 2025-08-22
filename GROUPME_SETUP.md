# GroupMe Integration Setup Guide

##  Quick Setup Steps

### 1. Create GroupMe Application

1. Go to [GroupMe Developers](https://dev.groupme.com/applications)
2. Sign in with your GroupMe account
3. Click "Create Application"
4. Fill out the form:
   - **Name**: `QRcallbox`
   - **Description**: `Real-time customer assistance notifications`
   - **Callback URL**: `https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeCallback`

### 2. Configure Firebase Functions Secrets

```bash
# Set your GroupMe Client ID (from the app you just created)
firebase functions:secrets:set GROUPME_CLIENT_ID="your_client_id_here"
```

### 3. Update Firebase Functions URLs

In `/functions/index.js`, update these URLs to match your project:

```javascript
// Line 19: Update this URL to your actual Firebase Functions URL
const BASE_CALLBACK = "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/groupmeCallback";

// Line 144: Update this URL to your actual webhook endpoint  
const callbackUrl = "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/groupmeWebhook";
```

### 4. Deploy Firebase Functions

```bash
firebase deploy --only functions
```

### 5. Test the Integration

1. Open your app and go to Settings
2. Click "Connect GroupMe Account" 
3. Authorize the application
4. Select a group and create a bot
5. Generate a QR code and test scanning it

##  Configuration Details

### Frontend Environment Variables (Optional)

If you want to use environment variables instead of hardcoded URLs, create a `.env` file:

```env
VITE_FIREBASE_PROJECT_ID=qrwebaccdb
```

### Firebase Functions Structure

Your functions will be available at:
- `https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeStart` - OAuth start
- `https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeCallback` - OAuth callback  
- `https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeGroups` - List groups
- `https://us-central1-qrwebaccdb.cloudfunctions.net/groupmeCreateBot` - Create bot
- `https://us-central1-qrwebaccdb.cloudfunctions.net/mint` - Generate QR tokens
- `https://us-central1-qrwebaccdb.cloudfunctions.net/s` - Handle QR scans

## 🐛 Troubleshooting

### Common Issues

**"No token on file" error:**
- Make sure the OAuth flow completed successfully
- Check that the GroupMe user ID is stored correctly
- Verify the Firebase Functions secrets are set

**"Failed to fetch groups" error:**
- Ensure your GroupMe token has the correct permissions
- Check that you're a member of at least one GroupMe group
- Verify the API endpoints are correct

**Bot creation fails:**
- Make sure you selected a group you're an admin of
- Check that the callback URL is accessible
- Verify your GroupMe application settings

### Debug Mode

Enable debug logging in Firebase Functions:

```javascript
// Add to functions/index.js
import { setGlobalOptions } from "firebase-functions/v2";
setGlobalOptions({ maxInstances: 10, timeoutSeconds: 60 });
```

### Testing Locally

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Start local emulators
firebase emulators:start

# Functions will be available at:
# http://localhost:5001/qrwebaccdb/us-central1/groupmeStart
```

##  How It Works

1. **OAuth Flow**: User clicks "Connect GroupMe" → redirected to GroupMe OAuth → callback stores token
2. **Group Selection**: App fetches user's groups using stored token
3. **Bot Creation**: Creates a bot in selected group with webhook URL
4. **QR Generation**: Creates unique tokens linked to store/area
5. **Notification**: When QR is scanned → message sent to GroupMe group

##  Security Notes

- GroupMe tokens are stored securely in Firestore
- Each QR token is unique and tracked
- Bot permissions are limited to posting messages
- All API calls are authenticated and validated

## 📞 Support

If you encounter issues:
1. Check Firebase Functions logs: `firebase functions:log`
2. Verify GroupMe app settings match your callback URLs
3. Test OAuth flow step by step
4. Check browser console for frontend errors

---

**Next Steps**: After setup is complete, test the full flow by generating a QR code and scanning it with your phone!