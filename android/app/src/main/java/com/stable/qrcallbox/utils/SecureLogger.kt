package com.stable.qrcallbox.utils

import android.util.Log
import com.stable.qrcallbox.BuildConfig

/**
 * Secure logging utility that automatically removes sensitive logs in production builds
 * This helps prevent information disclosure through logs
 */
object SecureLogger {
    
    fun d(tag: String, message: String) {
        if (BuildConfig.DEBUG) {
            Log.d(tag, message)
        }
    }
    
    fun i(tag: String, message: String) {
        if (BuildConfig.DEBUG) {
            Log.i(tag, message)
        }
    }
    
    fun w(tag: String, message: String) {
        if (BuildConfig.DEBUG) {
            Log.w(tag, message)
        }
    }
    
    fun e(tag: String, message: String) {
        // Always log errors, but sanitize sensitive data in production
        if (BuildConfig.DEBUG) {
            Log.e(tag, message)
        } else {
            // Log sanitized version for production
            Log.e(tag, sanitizeForProduction(message))
        }
    }
    
    fun e(tag: String, message: String, throwable: Throwable) {
        if (BuildConfig.DEBUG) {
            Log.e(tag, message, throwable)
        } else {
            Log.e(tag, sanitizeForProduction(message), throwable)
        }
    }
    
    /**
     * Sanitize sensitive information for production logs
     */
    private fun sanitizeForProduction(message: String): String {
        return message
            .replace(Regex("store='[^']*'"), "store='***'")
            .replace(Regex("user='[^']*'"), "user='***'") 
            .replace(Regex("token='[^']*'"), "token='***'")
            .replace(Regex("uid='[^']*'"), "uid='***'")
            .replace(Regex("email='[^']*'"), "email='***'")
            .replace(Regex("User ID: [^\\s]*"), "User ID: ***")
            .replace(Regex("store: '[^']*'"), "store: '***'")
            .replace(Regex("Token: [^\\s]*"), "Token: ***")
    }
    
    /**
     * Log FCM token updates (always log but sanitize in production)
     */
    fun logFCMTokenUpdate(tag: String, userId: String, tokenPreview: String) {
        if (BuildConfig.DEBUG) {
            Log.d(tag, "✅ FCM token updated for user: $userId, token: $tokenPreview")
        } else {
            Log.d(tag, "✅ FCM token updated successfully")
        }
    }
    
    /**
     * Log user operations (sanitized for production)
     */
    fun logUserOperation(tag: String, operation: String, userId: String) {
        if (BuildConfig.DEBUG) {
            Log.d(tag, "$operation for user: $userId")
        } else {
            Log.d(tag, operation)
        }
    }
}