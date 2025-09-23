package com.stable.qrcallbox.services

import android.app.NotificationManager
import android.content.Context
import android.util.Log
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.stable.qrcallbox.models.ScanNotification
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class NotificationCoordinator private constructor() {
    
    companion object {
        private const val TAG = "NotificationCoordinator"
        private var instance: NotificationCoordinator? = null
        
        fun getInstance(): NotificationCoordinator {
            return instance ?: synchronized(this) {
                instance ?: NotificationCoordinator().also { instance = it }
            }
        }
    }
    
    private val firestore = FirebaseFirestore.getInstance()
    private val activeListeners = mutableMapOf<String, ListenerRegistration>()
    
    fun startListening(context: Context, scanId: String, notificationId: Int) {
        Log.d(TAG, "Starting to listen for coordination on scan: $scanId")
        
        val listener = firestore.collection("scans")
            .document(scanId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Log.e(TAG, "Error listening to scan updates", error)
                    return@addSnapshotListener
                }
                
                if (snapshot != null && snapshot.exists()) {
                    try {
                        val scan = snapshot.toObject(ScanNotification::class.java)?.copy(scanId = snapshot.id)
                        
                        if (scan != null && scan.hasBeenHandled()) {
                            Log.d(TAG, "Scan $scanId has been claimed by ${scan.getFirstResponder()}, dismissing notification")
                            dismissNotification(context, notificationId)
                            stopListening(scanId)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error processing scan update", e)
                    }
                }
            }
        
        activeListeners[scanId] = listener
    }
    
    fun stopListening(scanId: String) {
        activeListeners[scanId]?.remove()
        activeListeners.remove(scanId)
        Log.d(TAG, "Stopped listening for scan: $scanId")
    }
    
    data class ClaimResult(val success: Boolean, val errorMessage: String? = null)
    
    suspend fun claimScan(userId: String, userName: String, scanId: String): Boolean {
        return claimScanWithDetails(userId, userName, scanId).success
    }
    
    suspend fun claimScanWithDetails(userId: String, userName: String, scanId: String): ClaimResult {
        return try {
            val scanRef = firestore.collection("scans").document(scanId)
            
            // Use transaction to prevent race conditions
            firestore.runTransaction { transaction ->
                val snapshot = transaction.get(scanRef)
                
                if (!snapshot.exists()) {
                    throw Exception("Scan document does not exist")
                }
                
                val currentStatus = snapshot.getString("status") ?: ScanNotification.STATUS_PENDING
                val currentClaimedBy = snapshot.getString("claimedBy") ?: ""
                
                if (currentStatus == ScanNotification.STATUS_CLAIMED && currentClaimedBy != userId) {
                    val claimedByName = snapshot.getString("claimedByName") ?: "another associate"
                    throw Exception("Scan already claimed by $claimedByName")
                }
                
                if (currentStatus == ScanNotification.STATUS_RESOLVED) {
                    throw Exception("Scan has already been resolved")
                }
                
                // Claim the scan atomically
                transaction.update(scanRef, mapOf(
                    "status" to ScanNotification.STATUS_CLAIMED,
                    "claimedBy" to userId,
                    "claimedByName" to userName,
                    "claimedAt" to Timestamp.now()
                ))
                
                Log.d(TAG, "Successfully claimed scan $scanId for user $userName")
                ClaimResult(success = true)
            }.await()
            
        } catch (e: Exception) {
            Log.e(TAG, "Failed to claim scan $scanId: ${e.message}", e)
            ClaimResult(success = false, errorMessage = e.message)
        }
    }
    
    suspend fun markAsAssisted(scanId: String): Boolean {
        return try {
            firestore.collection("scans")
                .document(scanId)
                .update("status", ScanNotification.STATUS_ASSISTED)
                .await()
            
            Log.d(TAG, "Marked scan $scanId as assisted")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to mark scan as assisted", e)
            false
        }
    }
    
    private fun dismissNotification(context: Context, notificationId: Int) {
        try {
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(notificationId)
            Log.d(TAG, "Dismissed notification $notificationId")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to dismiss notification", e)
        }
    }
    
    fun stopAllListeners() {
        activeListeners.values.forEach { it.remove() }
        activeListeners.clear()
        Log.d(TAG, "Stopped all listeners")
    }
}