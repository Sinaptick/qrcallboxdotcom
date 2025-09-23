# QRCall System Context for Android App Development

## System Overview
QRCall is a QR code-based customer callback system for retail stores. When customers scan QR codes placed around the store, it triggers notifications to store employees through multiple channels (GroupMe, Workvivo). You're building an Android companion app to add lock screen notifications.

## Current Architecture

### Data Flow
```
Customer scans QR code → Firebase Function (handleQRScan) → 
  ├── GroupMe Bot API (existing)
  ├── Workvivo WebSocket Bot (existing)
  └── FCM Push Notifications (NEW - what you're building)
```

### Firebase Structure
```javascript
// Firestore Collections
users/
  └── {userId}
      ├── email: string
      ├── fullName: string
      ├── storeNumber: string
      ├── groupMeId: string
      ├── role: "admin" | "user"
      ├── createdAt: timestamp
      └── fcmToken: string (ADD THIS)

scans/
  └── {scanId}
      ├── timestamp: timestamp
      ├── qrCode: string
      ├── storeNumber: string
      ├── areaDescription: string
      ├── ipAddress: string
      ├── userAgent: string
      └── responses: [] (ADD THIS)

groupme_bots/
  └── {botId}
      ├── bot_id: string
      ├── group_id: string
      ├── name: string
      ├── storeNumber: string
      └── created_by: string
```

### Current Cloud Function (Needs Modification)
```javascript
// In functions/index.js
exports.handleQRScan = functions.https.onRequest(async (req, res) => {
    const { qrCode } = req.body;
    
    // Parse QR code format: "qr-[storeNumber]-[areaDescription]"
    const parts = qrCode.split('-');
    const storeNumber = parts[1];
    const areaDescription = parts.slice(2).join(' ');
    
    // Current: Send to GroupMe
    const groupmeBots = await db.collection('groupme_bots')
        .where('storeNumber', '==', storeNumber)
        .get();
        
    for (const bot of groupmeBots.docs) {
        await sendGroupMeMessage(bot.data().bot_id, 
            `🔔 Customer needs assistance in ${areaDescription}`);
    }
    
    // Current: Send to Workvivo
    await fetch('http://34.45.52.250:5002/webhook', {
        method: 'POST',
        body: JSON.stringify({ 
            text: `Store ${storeNumber}: Customer in ${areaDescription}` 
        })
    });
    
    // NEW: Add FCM notification sending here
    // TODO: Query users by storeNumber, get FCM tokens, send notifications
});
```

## Android App Requirements

### Core Features
1. **Lock Screen Notifications**
   - Show customer location/area
   - Display on lock screen with high priority
   - Custom sound/vibration
   - Action buttons: "Assist" / "Ignore"

2. **Response Tracking**
   - Log who clicked "Assist" 
   - Update Firestore with response
   - Post to GroupMe: "[Name] is assisting customer in [area]"
   - Prevent duplicate responses

3. **User Management**
   - Login with same credentials as web app
   - Store assignment (only get notifications for your store)
   - Shift management (only notify when on duty)
   - FCM token registration

4. **Settings**
   - Enable/disable notifications
   - Set active hours
   - Notification preferences (sound, vibration)
   - Override Do Not Disturb

### Authentication
- Uses Firebase Authentication (same as web app)
- Users must be in 'users' collection with valid storeNumber
- Admin users can see all stores

### Modified Cloud Function for FCM
```javascript
// Add this to existing handleQRScan function
const sendAndroidNotifications = async (storeNumber, areaDescription, scanId) => {
    // Get all users for this store with FCM tokens
    const users = await db.collection('users')
        .where('storeNumber', '==', storeNumber)
        .where('fcmToken', '!=', null)
        .get();
    
    const tokens = users.docs.map(doc => doc.data().fcmToken);
    
    if (tokens.length > 0) {
        const message = {
            tokens,
            notification: {
                title: 'Customer Needs Assistance',
                body: areaDescription
            },
            data: {
                scanId,
                storeNumber,
                areaDescription,
                timestamp: Date.now().toString()
            },
            android: {
                priority: 'high',
                notification: {
                    channelId: 'customer_assistance',
                    sound: 'default',
                    clickAction: 'CUSTOMER_ASSIST_ACTION',
                    visibility: 'public',
                    notificationPriority: 'PRIORITY_HIGH'
                }
            }
        };
        
        await admin.messaging().sendMulticast(message);
    }
};
```

### Android Implementation Needs

#### 1. Firebase Setup
```kotlin
// app/build.gradle dependencies
implementation 'com.google.firebase:firebase-auth-ktx'
implementation 'com.google.firebase:firebase-firestore-ktx'
implementation 'com.google.firebase:firebase-messaging-ktx'
```

#### 2. Notification Channel (Android O+)
```kotlin
private fun createNotificationChannel() {
    val channel = NotificationChannel(
        "customer_assistance",
        "Customer Assistance",
        NotificationManager.IMPORTANCE_HIGH
    ).apply {
        description = "Urgent customer assistance requests"
        enableLights(true)
        enableVibration(true)
        setShowBadge(true)
        setBypassDnd(true) // If user permits
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    notificationManager.createNotificationChannel(channel)
}
```

#### 3. Response Actions
When user taps "Assist":
1. Update Firestore scan document with response
2. Post to GroupMe via Cloud Function
3. Clear notification
4. Show in-app confirmation

#### 4. Data Models
```kotlin
data class User(
    val userId: String = "",
    val fullName: String = "",
    val storeNumber: String = "",
    val fcmToken: String = "",
    val isOnShift: Boolean = false
)

data class ScanNotification(
    val scanId: String = "",
    val storeNumber: String = "",
    val areaDescription: String = "",
    val timestamp: Long = 0,
    val responses: List<Response> = listOf()
)

data class Response(
    val userId: String = "",
    val userName: String = "",
    val action: String = "", // "assist" or "ignore"
    val timestamp: Long = 0
)
```

## Environment Configuration

### Firebase Project
- Project ID: qrwebaccdb
- Web API Key: AIzaSyCbpXuSt3UHAWtAfiKbVx621vwpL5cKnkA
- Auth Domain: qrwebaccdb.firebaseapp.com
- Storage Bucket: qrwebaccdb.firebasestorage.app
- Messaging Sender ID: 611687644130
- App ID: 1:611687644130:web:3f4011c00e1baae1e397bb

### API Endpoints
- Cloud Functions Base: https://us-central1-qrwebaccdb.cloudfunctions.net
- GroupMe webhook: Handled via Cloud Functions
- Workvivo bot: http://34.45.52.250:5002 (VM-based)

### Store Numbers
- Format: 4-digit strings (e.g., "1458")
- QR codes: "qr-[store]-[area]" (e.g., "qr-1458-electronics")

## Testing Approach
1. Create test QR code: "qr-1458-test-area"
2. Register test device FCM token
3. Trigger scan via web interface
4. Verify notification appears on lock screen
5. Test action buttons
6. Check Firestore updates
7. Verify GroupMe message sent

## Security Notes
- Validate store number matches user's assigned store
- Require authentication for all operations
- FCM tokens expire - handle token refresh
- Rate limit notifications (prevent spam)

## Integration Points
The Android app needs to:
1. Share user authentication with web app
2. Update same Firestore collections
3. Trigger same GroupMe bot messages
4. Respect existing permission model

## Questions for Implementation
1. Should notifications auto-dismiss after someone responds?
2. Show all notifications or just unhandled ones?
3. How long before a notification "expires"?
4. Should we track response times for analytics?
5. Custom sounds for different areas?

---
Copy this entire document to Claude in Android Studio to provide full context for building the Android companion app.