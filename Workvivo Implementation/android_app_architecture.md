# QRCall Android Companion App - Architecture

## Overview
Android app that receives QR scan notifications in parallel with GroupMe, displays them as lock screen notifications with action buttons.

## Data Flow
```
QR Scan → Firebase Cloud Function → 
  ├── GroupMe Bot (existing)
  ├── Workvivo Bot (existing)  
  └── FCM Push → Android App (new)
```

## Key Features
1. **Lock Screen Notifications** - High priority notifications that show on lock screen
2. **Action Buttons** - "Assist Customer" / "Ignore" directly from notification
3. **Response Tracking** - Log who responded in Firestore
4. **Store-based Filtering** - Only receive notifications for your store
5. **Shift Management** - Only notify when user is on shift

## Firebase Integration

### 1. Cloud Messaging (FCM)
```kotlin
// In Android app
class QRCallMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        // Show lock screen notification
        showLockScreenNotification(message.data)
    }
}
```

### 2. Firestore Structure
```
notifications/
  └── {notificationId}
      ├── timestamp
      ├── storeNumber
      ├── areaDescription
      ├── qrCode
      ├── status: "pending" | "handled" | "ignored"
      └── responses/
          └── {userId}
              ├── action: "assist" | "ignore"
              ├── timestamp
              └── userName

users/
  └── {userId}
      ├── storeNumber
      ├── fcmToken
      ├── onShift: boolean
      └── notificationsEnabled: boolean
```

### 3. Modified Cloud Function
```javascript
// In functions/index.js - add FCM sending
exports.handleQRScan = functions.https.onRequest(async (req, res) => {
    const { qrCode, areaDescription, storeNumber } = req.body;
    
    // Existing: Send to GroupMe
    await sendToGroupMe(message);
    
    // Existing: Send to Workvivo
    await sendToWorkvivo(message);
    
    // NEW: Send push notifications to Android users
    const users = await getOnShiftUsers(storeNumber);
    const tokens = users.map(u => u.fcmToken);
    
    await admin.messaging().sendMulticast({
        tokens,
        notification: {
            title: `Customer needs assistance`,
            body: areaDescription
        },
        data: {
            qrCode,
            areaDescription,
            storeNumber,
            notificationId: docId
        },
        android: {
            priority: 'high',
            notification: {
                channelId: 'urgent_customer',
                sound: 'default',
                clickAction: 'ASSIST_CUSTOMER',
                visibility: 'public' // Show on lock screen
            }
        }
    });
});
```

## Android App Components

### 1. MainActivity.kt
```kotlin
class MainActivity : AppCompatActivity() {
    private lateinit var auth: FirebaseAuth
    private lateinit var db: FirebaseFirestore
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Setup Firebase
        auth = FirebaseAuth.getInstance()
        db = FirebaseFirestore.getInstance()
        
        // Register for FCM token
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            saveTokenToFirestore(token)
        }
        
        // Check if launched from notification
        handleNotificationIntent(intent)
    }
}
```

### 2. NotificationHelper.kt
```kotlin
class NotificationHelper(private val context: Context) {
    
    fun showLockScreenNotification(data: Map<String, String>) {
        val notificationId = System.currentTimeMillis().toInt()
        
        // Create action intents
        val assistIntent = createActionIntent("ASSIST", data)
        val ignoreIntent = createActionIntent("IGNORE", data)
        
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Customer Needs Assistance")
            .setContentText(data["areaDescription"])
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .addAction(R.drawable.ic_assist, "Assist", assistIntent)
            .addAction(R.drawable.ic_ignore, "Ignore", ignoreIntent)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            .build()
            
        notificationManager.notify(notificationId, notification)
    }
}
```

### 3. NotificationActionReceiver.kt
```kotlin
class NotificationActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.getStringExtra("action")
        val notificationId = intent.getStringExtra("notificationId")
        
        when (action) {
            "ASSIST" -> {
                // Log response to Firestore
                logResponse(notificationId, "assist")
                
                // Post to GroupMe
                postToGroupMe("${userName} is assisting customer")
                
                // Clear notification
                cancelNotification(context, notificationId)
            }
            "IGNORE" -> {
                logResponse(notificationId, "ignore")
                cancelNotification(context, notificationId)
            }
        }
    }
}
```

## Lock Screen Configuration

### AndroidManifest.xml
```xml
<!-- Permissions -->
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<!-- Service declarations -->
<service
    android:name=".QRCallMessagingService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>

<receiver 
    android:name=".NotificationActionReceiver"
    android:enabled="true"
    android:exported="false" />
```

## User Settings Screen

```kotlin
class SettingsFragment : Fragment() {
    // Settings:
    // - Enable/Disable notifications
    // - Set shift hours
    // - Store number
    // - Notification sound
    // - Vibration pattern
    // - Do Not Disturb override
}
```

## Benefits
1. **Instant alerts** - No need to check GroupMe constantly
2. **Quick actions** - Respond without opening apps
3. **Track responses** - Know who's handling what
4. **Reduce duplicates** - See if someone already responded
5. **Shift-aware** - Only notify when working

## Next Steps
1. Create new Android project in Android Studio
2. Add Firebase to Android app
3. Implement notification service
4. Test lock screen notifications
5. Deploy updated Cloud Functions