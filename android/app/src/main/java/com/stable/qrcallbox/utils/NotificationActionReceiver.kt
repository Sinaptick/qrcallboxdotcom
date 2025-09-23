package com.stable.qrcallbox.utils

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.Toast
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.stable.qrcallbox.models.Response
import com.stable.qrcallbox.services.NotificationCoordinator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class NotificationActionReceiver : BroadcastReceiver() {
    
    companion object {
        const val ACTION_ASSIST = "com.stable.qrcallbox.ACTION_ASSIST"
        const val ACTION_IGNORE = "com.stable.qrcallbox.ACTION_IGNORE"
        private const val TAG = "NotificationAction"
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        val scanId = intent.getStringExtra("scanId") ?: return
        val notificationId = intent.getIntExtra("notificationId", -1)
        
        // Cancel notification
        if (notificationId != -1) {
            val notificationManager = context.getSystemService(NotificationManager::class.java)
            notificationManager.cancel(notificationId)
        }
        
        when (intent.action) {
            ACTION_ASSIST -> {
                val storeNumber = intent.getStringExtra("storeNumber") ?: ""
                val areaDescription = intent.getStringExtra("areaDescription") ?: ""
                handleAssist(context, scanId, storeNumber, areaDescription)
            }
            ACTION_IGNORE -> {
                handleIgnore(context, scanId)
            }
        }
    }
    
    private fun handleAssist(context: Context, scanId: String, storeNumber: String, areaDescription: String) {
        val auth = FirebaseAuth.getInstance()
        val firestore = FirebaseFirestore.getInstance()
        val coordinator = NotificationCoordinator.getInstance()
        
        val currentUser = auth.currentUser
        if (currentUser == null) {
            Toast.makeText(context, "Please log in to respond", Toast.LENGTH_SHORT).show()
            return
        }
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Get user details for leaderboard compatibility
                val userDoc = firestore.collection("users")
                    .document(currentUser.uid)
                    .get()
                    .await()
                
                val firstName = userDoc.getString("firstName") ?: ""
                val lastName = userDoc.getString("lastName") ?: ""
                val fullName = userDoc.getString("fullName") ?: "Unknown User"
                val userStoreNumber = when (val storeValue = userDoc.get("storeNumber")) {
                    is String -> storeValue
                    is Number -> storeValue.toString()
                    else -> ""
                }
                
                // Validate store number matches scan before attempting claim
                if (userStoreNumber != storeNumber) {
                    Log.e(TAG, "Store number mismatch: user=$userStoreNumber, scan=$storeNumber")
                    CoroutineScope(Dispatchers.Main).launch {
                        Toast.makeText(context, "Permission denied: This request is for store $storeNumber, you're assigned to store $userStoreNumber", Toast.LENGTH_LONG).show()
                    }
                    return@launch
                }
                
                // Use proper name format for display and leaderboard
                val displayName = if (firstName.isNotBlank() && lastName.isNotBlank()) {
                    "$firstName $lastName"
                } else {
                    fullName.ifEmpty { "Unknown User" }
                }
                
                // Record start time for response time calculation
                val responseStartTime = System.currentTimeMillis()
                
                // Skip coordination for test notifications
                if (!scanId.startsWith("test-")) {
                    // Try to claim the scan first (atomic operation)
                    try {
                        val claimResult = coordinator.claimScanWithDetails(currentUser.uid, displayName, scanId)
                        
                        if (!claimResult.success) {
                            // Handle specific failure reasons
                            CoroutineScope(Dispatchers.Main).launch {
                                val errorMessage = when {
                                    claimResult.errorMessage?.contains("PERMISSION_DENIED") == true -> 
                                        "Permission denied: Please check your store assignment"
                                    claimResult.errorMessage?.contains("already claimed") == true ||
                                    claimResult.errorMessage?.contains("STATUS_CLAIMED") == true -> 
                                        "Another associate is already helping this customer"
                                    claimResult.errorMessage?.contains("does not exist") == true ->
                                        "This request no longer exists"
                                    else -> 
                                        claimResult.errorMessage ?: "Unable to claim this request"
                                }
                                
                                Toast.makeText(context, errorMessage, Toast.LENGTH_LONG).show()
                            }
                            return@launch
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Exception during claim attempt", e)
                        CoroutineScope(Dispatchers.Main).launch {
                            val errorMessage = when {
                                e.message?.contains("PERMISSION_DENIED") == true -> 
                                    "Permission denied: Please check your store assignment"
                                else -> 
                                    "Error claiming request: ${e.message}"
                            }
                            Toast.makeText(context, errorMessage, Toast.LENGTH_LONG).show()
                        }
                        return@launch
                    }
                }
                
                // Create comprehensive response record for leaderboard integration
                val response = hashMapOf(
                    "userId" to currentUser.uid,
                    "userName" to displayName,
                    "firstName" to firstName,
                    "lastName" to lastName,
                    "storeNumber" to userStoreNumber,
                    "areaDescription" to areaDescription,
                    "action" to Response.ACTION_ASSIST,
                    "timestamp" to Timestamp.now(),
                    "responseTime" to (System.currentTimeMillis() - responseStartTime),
                    "deviceType" to "android_app",
                    "notificationReceived" to responseStartTime // When notification was originally received
                )
                
                // Skip database updates for real notifications since MainActivity already handles the claim
                // Only update for test notifications to maintain test functionality
                if (scanId.startsWith("test-")) {
                    try {
                        firestore.collection("scans")
                            .document(scanId)
                            .update(mapOf(
                                "responses" to FieldValue.arrayUnion(response),
                                "status" to "assisted"
                            ))
                            .await()
                        
                        Log.d(TAG, "Updated test scan document with response: $scanId")
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to update test scan document: ${e.message}")
                    }
                } else {
                    Log.d(TAG, "Skipping database update for real notification - MainActivity handles the claim: $scanId")
                }
                
                // Send notification to GroupMe via Cloud Function
                sendGroupMeNotification(displayName, storeNumber, areaDescription)
                
                CoroutineScope(Dispatchers.Main).launch {
                    Toast.makeText(
                        context,
                        "You are now assisting the customer in $areaDescription",
                        Toast.LENGTH_LONG
                    ).show()
                }
                
                Log.d(TAG, "Assist response recorded for scan: $scanId")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error handling assist action", e)
                CoroutineScope(Dispatchers.Main).launch {
                    Toast.makeText(context, "Error responding to request", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
    
    private fun handleIgnore(context: Context, scanId: String) {
        val auth = FirebaseAuth.getInstance()
        val firestore = FirebaseFirestore.getInstance()
        
        val currentUser = auth.currentUser
        if (currentUser == null) {
            return
        }
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Get user details for leaderboard compatibility
                val userDoc = firestore.collection("users")
                    .document(currentUser.uid)
                    .get()
                    .await()
                
                val firstName = userDoc.getString("firstName") ?: ""
                val lastName = userDoc.getString("lastName") ?: ""
                val fullName = userDoc.getString("fullName") ?: "Unknown User"
                val userStoreNumber = when (val storeValue = userDoc.get("storeNumber")) {
                    is String -> storeValue
                    is Number -> storeValue.toString()
                    else -> ""
                }
                
                // Use proper name format for display and leaderboard
                val displayName = if (firstName.isNotBlank() && lastName.isNotBlank()) {
                    "$firstName $lastName"
                } else {
                    fullName.ifEmpty { "Unknown User" }
                }
                
                // Create comprehensive ignore response record
                val response = hashMapOf(
                    "userId" to currentUser.uid,
                    "userName" to displayName,
                    "firstName" to firstName,
                    "lastName" to lastName,
                    "storeNumber" to userStoreNumber,
                    "action" to Response.ACTION_IGNORE,
                    "timestamp" to Timestamp.now(),
                    "deviceType" to "android_app"
                )
                
                // Update scan document (skip for test notifications)
                if (!scanId.startsWith("test-")) {
                    firestore.collection("scans")
                        .document(scanId)
                        .update("responses", FieldValue.arrayUnion(response))
                        .await()
                    
                    Log.d(TAG, "Updated ignore response for scan: $scanId")
                } else {
                    Log.d(TAG, "Skipping database update for test ignore: $scanId")
                }
                
                Log.d(TAG, "Ignore response recorded for scan: $scanId")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error handling ignore action", e)
            }
        }
    }
    
    private suspend fun sendGroupMeNotification(userName: String, storeNumber: String, areaDescription: String) {
        // This would typically call a Cloud Function to send the GroupMe message
        // For now, just log it
        Log.d(TAG, "Would send to GroupMe: $userName is assisting customer in $areaDescription at Store $storeNumber")
    }
}