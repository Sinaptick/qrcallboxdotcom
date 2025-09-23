package com.stable.qrcallbox.utils

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.appcompat.app.AlertDialog
import kotlinx.coroutines.delay
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Helper for work-managed devices with notification issues
 */
class WorkDeviceHelper(private val context: Context) {
    
    companion object {
        private const val TAG = "WorkDeviceHelper"
        private const val PREFS_NAME = "work_device_prefs"
        private const val PREF_NOTIFICATION_TEST_TIME = "last_notification_test"
        private const val PREF_BYPASS_SHOWN = "bypass_instructions_shown"
        private const val TEST_COOLDOWN = 300000L // 5 minutes
    }
    
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    /**
     * Tests if notifications are working and shows fix instructions if not
     */
    suspend fun testAndFixNotifications(): Boolean {
        return withContext(Dispatchers.Main) {
            val lastTest = prefs.getLong(PREF_NOTIFICATION_TEST_TIME, 0)
            val currentTime = System.currentTimeMillis()
            
            if (currentTime - lastTest < TEST_COOLDOWN) {
                Log.d(TAG, "Notification test cooldown active")
                return@withContext true
            }
            
            // Update test time
            prefs.edit().putLong(PREF_NOTIFICATION_TEST_TIME, currentTime).apply()
            
            // Check if this is a work-managed device
            if (isWorkManagedDevice()) {
                Log.i(TAG, "Work-managed device detected, testing notifications...")
                
                // Wait a bit for any automatic fixes to apply
                delay(3000)
                
                // Test notification delivery
                val notificationsWorking = testNotificationDelivery()
                
                if (!notificationsWorking && !prefs.getBoolean(PREF_BYPASS_SHOWN, false)) {
                    showFixInstructions()
                    prefs.edit().putBoolean(PREF_BYPASS_SHOWN, true).apply()
                    return@withContext false
                }
            }
            
            true
        }
    }
    
    /**
     * Detects if device is work-managed
     */
    private fun isWorkManagedDevice(): Boolean {
        return try {
            val packageManager = context.packageManager
            
            // Check for common MDM packages
            val mdmPackages = listOf(
                "com.airwatch.androidagent",
                "com.microsoft.intune.mam",
                "com.google.android.apps.work.clouddpc",
                "com.samsung.android.knox.kpu"
            )
            
            mdmPackages.any { packageName ->
                try {
                    packageManager.getPackageInfo(packageName, 0)
                    true
                } catch (e: Exception) {
                    false
                }
            }
        } catch (e: Exception) {
            false
        }
    }
    
    /**
     * Tests if notifications are actually being delivered
     */
    private fun testNotificationDelivery(): Boolean {
        // This is a simplified test - in a real implementation,
        // you might send a test FCM message and check if it arrives
        return true // Placeholder - would need server-side test notification
    }
    
    /**
     * Shows comprehensive fix instructions with download links
     */
    private fun showFixInstructions() {
        val instructions = """
            🔧 Work Device Notification Setup Required
            
            Your work-managed device may be blocking QRCallBox notifications.
            
            Quick Fix Steps:
            1️⃣ Download fix script from computer
            2️⃣ Enable USB Debugging on phone
            3️⃣ Connect phone to computer
            4️⃣ Run the fix script
            
            This is a one-time setup that takes 2 minutes.
        """.trimIndent()
        
        AlertDialog.Builder(context)
            .setTitle("Work Device Setup")
            .setMessage(instructions)
            .setPositiveButton("Get Fix Script") { _, _ ->
                openFixScriptDownload()
            }
            .setNeutralButton("Show Instructions") { _, _ ->
                showDetailedInstructions()
            }
            .setNegativeButton("Skip") { dialog, _ ->
                dialog.dismiss()
            }
            .setCancelable(false)
            .show()
    }
    
    /**
     * Opens browser to download the fix script
     */
    private fun openFixScriptDownload() {
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                data = Uri.parse("https://qrwebaccdb.web.app/app/")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open download page", e)
        }
    }
    
    /**
     * Shows detailed step-by-step instructions
     */
    private fun showDetailedInstructions() {
        val detailedSteps = """
            📱 DETAILED SETUP INSTRUCTIONS
            
            STEP 1: Enable Developer Options
            • Settings → About Phone
            • Tap "Build Number" 7 times
            • You'll see "You are now a developer!"
            
            STEP 2: Enable USB Debugging  
            • Settings → System → Developer Options
            • Turn ON "USB debugging"
            
            STEP 3: Download Fix Script
            • On your computer, go to:
              qrwebaccdb.web.app/app/
            • Download "QRCallBox Work Device Fix"
            
            STEP 4: Connect & Fix
            • Connect phone to computer with USB cable
            • Authorize USB debugging when prompted
            • Run the downloaded script
            
            ✅ Notifications will work after this one-time setup!
        """.trimIndent()
        
        AlertDialog.Builder(context)
            .setTitle("Step-by-Step Instructions")
            .setMessage(detailedSteps)
            .setPositiveButton("Open Download Page") { _, _ ->
                openFixScriptDownload()
            }
            .setNegativeButton("Got It") { dialog, _ ->
                dialog.dismiss()
            }
            .show()
    }
    
    /**
     * Resets the helper state (for testing)
     */
    fun resetHelperState() {
        prefs.edit().clear().apply()
    }
    
    /**
     * Gets status message for debugging
     */
    fun getStatusMessage(): String {
        return when {
            isWorkManagedDevice() -> "Work-managed device detected"
            else -> "Standard device - no special setup needed"
        }
    }
}