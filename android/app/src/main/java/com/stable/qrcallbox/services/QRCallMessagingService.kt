package com.stable.qrcallbox.services

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.stable.qrcallbox.QRCallBoxApplication
import com.stable.qrcallbox.R
import com.stable.qrcallbox.ui.MainActivity
import com.stable.qrcallbox.utils.NotificationActionReceiver

class QRCallMessagingService : FirebaseMessagingService() {
    
    companion object {
        private const val TAG = "QRCallMessaging"
        private const val NOTIFICATION_ID = 1001
    }
    
    private val firestore = FirebaseFirestore.getInstance()
    private val auth = FirebaseAuth.getInstance()
    
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token: $token")
        
        // Update token in Firestore if user is logged in
        auth.currentUser?.let { user ->
            if (token.isNotBlank()) {
                // Get app version info
                val packageInfo = packageManager.getPackageInfo(packageName, 0)
                val versionName = packageInfo.versionName ?: "unknown"
                val versionCode = packageInfo.longVersionCode
                
                val updates = hashMapOf<String, Any>(
                    "fcmToken" to token,
                    "appVersion" to versionName,
                    "appVersionCode" to versionCode,
                    "lastSeen" to com.google.firebase.firestore.FieldValue.serverTimestamp(),
                    "deviceInfo" to "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} (Android ${android.os.Build.VERSION.RELEASE})"
                )
                
                firestore.collection("users")
                    .document(user.uid)
                    .set(updates, com.google.firebase.firestore.SetOptions.merge())
                    .addOnSuccessListener {
                        Log.d(TAG, "FCM token and app info updated for user: ${user.uid} (v$versionName)")
                    }
                    .addOnFailureListener { e ->
                        Log.e(TAG, "Failed to update FCM token and app info for user: ${user.uid}", e)
                        // Retry once after a delay
                        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                            firestore.collection("users")
                                .document(user.uid)
                                .set(updates, com.google.firebase.firestore.SetOptions.merge())
                                .addOnSuccessListener {
                                    Log.d(TAG, "FCM token and app info updated on retry for user: ${user.uid} (v$versionName)")
                                }
                                .addOnFailureListener { retryError ->
                                    Log.e(TAG, "FCM token update retry failed for user: ${user.uid}", retryError)
                                }
                        }, 2000)
                    }
            } else {
                Log.w(TAG, "Received blank FCM token, not updating Firestore")
            }
        } ?: run {
            Log.w(TAG, "No authenticated user found, FCM token not saved")
        }
    }
    
    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.d(TAG, "Message received from: ${message.from}")
        
        // Extract data from message
        val scanId = message.data["scanId"] ?: return
        val storeNumber = message.data["storeNumber"] ?: return
        val areaDescription = message.data["areaDescription"] ?: "Unknown Area"
        val timestamp = message.data["timestamp"]?.toLongOrNull() ?: System.currentTimeMillis()
        
        // Check if user should receive notifications
        checkUserScheduleAndShowNotification(scanId, storeNumber, areaDescription, timestamp)
    }
    
    private fun checkUserScheduleAndShowNotification(
        scanId: String,
        storeNumber: String,
        areaDescription: String,
        timestamp: Long
    ) {
        val currentUser = auth.currentUser
        if (currentUser == null) {
            Log.w(TAG, "User not authenticated, ignoring notification")
            return
        }
        
        // Get user data to check schedule
        firestore.collection("users")
            .document(currentUser.uid)
            .get()
            .addOnSuccessListener { userDoc ->
                if (userDoc.exists()) {
                    try {
                        val user = userDoc.toObject(com.stable.qrcallbox.models.User::class.java)
                        
                        if (user != null && shouldShowNotification(user, storeNumber)) {
                            showNotification(scanId, storeNumber, areaDescription, timestamp)
                        } else {
                            Log.d(TAG, "Notification suppressed due to user schedule/settings")
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error parsing user data", e)
                        // Show notification anyway if we can't parse user data
                        showNotification(scanId, storeNumber, areaDescription, timestamp)
                    }
                } else {
                    Log.w(TAG, "User document not found, showing notification anyway")
                    showNotification(scanId, storeNumber, areaDescription, timestamp)
                }
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Error fetching user data", e)
                // Show notification anyway if we can't fetch user data
                showNotification(scanId, storeNumber, areaDescription, timestamp)
            }
    }
    
    private fun shouldShowNotification(user: com.stable.qrcallbox.models.User, notificationStoreNumber: String): Boolean {
        // Check if notifications are enabled
        if (!user.notificationsEnabled) {
            Log.d(TAG, "Notifications disabled for user")
            return false
        }
        
        // Check if user is currently in working hours (replaces manual shift toggle)
        if (!user.isCurrentlyInWorkingHours()) {
            Log.d(TAG, "User is not in working hours")
            return false
        }
        
        // Check if store number matches (admin users get all notifications)
        if (!user.isAdmin() && user.storeNumber != notificationStoreNumber) {
            Log.d(TAG, "Store number mismatch: user=${user.storeNumber}, notification=$notificationStoreNumber")
            return false
        }
        
        
        // Check Do Not Disturb mode if user has it enabled
        if (user.respectDoNotDisturb) {
            val notificationManager = getSystemService(android.app.NotificationManager::class.java)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                val filter = notificationManager.currentInterruptionFilter
                if (filter != android.app.NotificationManager.INTERRUPTION_FILTER_ALL) {
                    Log.d(TAG, "Do Not Disturb is active and user respects it")
                    return false
                }
            }
        }
        
        return true
    }
    
    private fun showNotification(
        scanId: String,
        storeNumber: String,
        areaDescription: String,
        timestamp: Long
    ) {
        val notificationManager = getSystemService(NotificationManager::class.java)
        
        // Create intent for opening the app
        val mainIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("scanId", scanId)
            putExtra("storeNumber", storeNumber)
            putExtra("areaDescription", areaDescription)
        }
        
        val mainPendingIntent = PendingIntent.getActivity(
            this,
            0,
            mainIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Create intent for "Assist" action
        val assistIntent = Intent(this, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_ASSIST
            putExtra("scanId", scanId)
            putExtra("storeNumber", storeNumber)
            putExtra("areaDescription", areaDescription)
            putExtra("notificationId", NOTIFICATION_ID)
        }
        
        val assistPendingIntent = PendingIntent.getBroadcast(
            this,
            1,
            assistIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Create intent for "Ignore" action
        val ignoreIntent = Intent(this, NotificationActionReceiver::class.java).apply {
            action = NotificationActionReceiver.ACTION_IGNORE
            putExtra("scanId", scanId)
            putExtra("notificationId", NOTIFICATION_ID)
        }
        
        val ignorePendingIntent = PendingIntent.getBroadcast(
            this,
            2,
            ignoreIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Build notification
        val notification = NotificationCompat.Builder(this, QRCallBoxApplication.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Customer Needs Assistance")
            .setContentText("Store $storeNumber: $areaDescription")
            .setStyle(NotificationCompat.BigTextStyle()
                .bigText("A customer needs assistance in $areaDescription at Store $storeNumber"))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(false)
            .setOngoing(true)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            .setVibrate(longArrayOf(0, 500, 250, 500))
            .setContentIntent(mainPendingIntent)
            .addAction(
                R.drawable.ic_launcher_foreground,
                "ASSIST",
                assistPendingIntent
            )
            .addAction(
                R.drawable.ic_launcher_foreground,
                "IGNORE",
                ignorePendingIntent
            )
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(mainPendingIntent, true)
            .build()
        
        notification.flags = notification.flags or Notification.FLAG_INSISTENT
        
        notificationManager.notify(NOTIFICATION_ID, notification)
        
        // Start listening for coordination updates (dismiss if someone else responds)
        if (!scanId.startsWith("test-")) {
            NotificationCoordinator.getInstance().startListening(this, scanId, NOTIFICATION_ID)
        }
    }
}