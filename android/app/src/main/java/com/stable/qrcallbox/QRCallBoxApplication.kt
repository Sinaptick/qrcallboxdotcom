package com.stable.qrcallbox

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.messaging.FirebaseMessaging

class QRCallBoxApplication : Application() {
    
    companion object {
        const val CHANNEL_ID = "customer_assistance"
        const val CHANNEL_NAME = "Customer Assistance"
        const val CHANNEL_DESCRIPTION = "Urgent customer assistance requests"
    }
    
    override fun onCreate() {
        super.onCreate()
        
        // Initialize Firebase
        initializeFirebase()
        
        // Create notification channel
        createNotificationChannel()
        
        // Get FCM token
        getFCMToken()
    }
    
    private fun initializeFirebase() {
        if (FirebaseApp.getApps(this).isEmpty()) {
            val options = FirebaseOptions.Builder()
                .setProjectId("qrwebaccdb")
                .setApplicationId("1:611687644130:android:qrcallbox")
                .setApiKey("AIzaSyCbpXuSt3UHAWtAfiKbVx621vwpL5cKnkA")
                .setDatabaseUrl("https://qrwebaccdb.firebaseapp.com")
                .setStorageBucket("qrwebaccdb.firebasestorage.app")
                .setGcmSenderId("611687644130")
                .build()
            FirebaseApp.initializeApp(this, options)
        }
    }
    
    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = CHANNEL_DESCRIPTION
                enableLights(true)
                enableVibration(true)
                setShowBadge(true)
                setBypassDnd(true)
                lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
            }
            
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    private fun getFCMToken() {
        FirebaseMessaging.getInstance().token.addOnSuccessListener { token ->
            android.util.Log.d("FCM", "FCM Token: $token")
            
            // If user is already logged in, update their FCM token immediately
            // This handles cases where login completed but token update failed
            val auth = com.google.firebase.auth.FirebaseAuth.getInstance()
            val currentUser = auth.currentUser
            
            if (currentUser != null && token.isNotBlank()) {
                val firestore = com.google.firebase.firestore.FirebaseFirestore.getInstance()
                firestore.collection("users")
                    .document(currentUser.uid)
                    .update("fcmToken", token)
                    .addOnSuccessListener {
                        android.util.Log.d("FCM", "FCM token updated in Application for user: ${currentUser.uid}")
                    }
                    .addOnFailureListener { e ->
                        android.util.Log.e("FCM", "Failed to update FCM token in Application", e)
                    }
            }
        }.addOnFailureListener { e ->
            android.util.Log.e("FCM", "Failed to get FCM token in Application", e)
        }
    }
}