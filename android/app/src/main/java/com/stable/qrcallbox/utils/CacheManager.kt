package com.stable.qrcallbox.utils

import android.content.Context
import android.content.SharedPreferences
import com.stable.qrcallbox.models.User
import com.stable.qrcallbox.models.WorkSchedule
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Cache manager for reducing network requests and improving performance
 */
class CacheManager private constructor(context: Context) {
    
    private val prefs: SharedPreferences = context.getSharedPreferences("qrcall_cache", Context.MODE_PRIVATE)
    private val memoryCache = ConcurrentHashMap<String, CacheEntry>()
    
    companion object {
        @Volatile
        private var INSTANCE: CacheManager? = null
        
        fun getInstance(context: Context): CacheManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: CacheManager(context.applicationContext).also { INSTANCE = it }
            }
        }
        
        private const val USER_DATA_KEY = "user_data_"
        private const val FCM_TOKEN_KEY = "fcm_token_"
        private const val LAST_UPDATE_KEY = "last_update_"
        private const val CACHE_DURATION_MS = 5 * 60 * 1000L // 5 minutes
    }
    
    data class CacheEntry(
        val data: String,
        val timestamp: Long,
        val ttl: Long = CACHE_DURATION_MS
    ) {
        fun isExpired(): Boolean = System.currentTimeMillis() - timestamp > ttl
    }
    
    /**
     * Cache user data to reduce Firestore reads
     */
    fun cacheUserData(userId: String, user: User) {
        try {
            val userData = JSONObject().apply {
                put("userId", user.userId)
                put("email", user.email)
                put("firstName", user.firstName)
                put("lastName", user.lastName)
                put("fullName", user.fullName)
                put("storeNumber", user.storeNumber)
                put("role", user.role)
                put("notificationsEnabled", user.notificationsEnabled)
                put("respectDoNotDisturb", user.respectDoNotDisturb)
                put("cached_at", System.currentTimeMillis())
            }
            
            // Store in memory cache for immediate access
            memoryCache[USER_DATA_KEY + userId] = CacheEntry(
                userData.toString(),
                System.currentTimeMillis()
            )
            
            // Store in SharedPreferences for persistence
            prefs.edit()
                .putString(USER_DATA_KEY + userId, userData.toString())
                .putLong(LAST_UPDATE_KEY + userId, System.currentTimeMillis())
                .apply()
                
        } catch (e: Exception) {
            SecureLogger.e("CacheManager", "Error caching user data", e)
        }
    }
    
    /**
     * Get cached user data if available and not expired
     */
    fun getCachedUserData(userId: String): User? {
        return try {
            // Check memory cache first
            val memoryCacheEntry = memoryCache[USER_DATA_KEY + userId]
            if (memoryCacheEntry != null && !memoryCacheEntry.isExpired()) {
                return parseUserData(memoryCacheEntry.data)
            }
            
            // Check SharedPreferences cache
            val cachedData = prefs.getString(USER_DATA_KEY + userId, null)
            val lastUpdate = prefs.getLong(LAST_UPDATE_KEY + userId, 0)
            
            if (cachedData != null && 
                System.currentTimeMillis() - lastUpdate < CACHE_DURATION_MS) {
                
                // Update memory cache
                memoryCache[USER_DATA_KEY + userId] = CacheEntry(cachedData, lastUpdate)
                return parseUserData(cachedData)
            }
            
            null
        } catch (e: Exception) {
            SecureLogger.e("CacheManager", "Error retrieving cached user data", e)
            null
        }
    }
    
    /**
     * Cache FCM token to avoid redundant updates
     */
    fun cacheFCMToken(userId: String, token: String) {
        prefs.edit()
            .putString(FCM_TOKEN_KEY + userId, token)
            .putLong(LAST_UPDATE_KEY + "fcm_" + userId, System.currentTimeMillis())
            .apply()
    }
    
    /**
     * Check if FCM token needs update
     */
    fun shouldUpdateFCMToken(userId: String, newToken: String): Boolean {
        val cachedToken = prefs.getString(FCM_TOKEN_KEY + userId, null)
        val lastUpdate = prefs.getLong(LAST_UPDATE_KEY + "fcm_" + userId, 0)
        
        // Update if token changed or it's been more than 1 hour
        return cachedToken != newToken || 
               System.currentTimeMillis() - lastUpdate > 60 * 60 * 1000L
    }
    
    /**
     * Cache app version check to prevent excessive requests
     */
    fun cacheAppVersionCheck(response: String) {
        prefs.edit()
            .putString("app_version_response", response)
            .putLong("app_version_check_time", System.currentTimeMillis())
            .apply()
    }
    
    /**
     * Get cached app version check result
     */
    fun getCachedAppVersionCheck(): String? {
        val lastCheck = prefs.getLong("app_version_check_time", 0)
        val fiveMinutesAgo = System.currentTimeMillis() - (5 * 60 * 1000L)
        
        return if (lastCheck > fiveMinutesAgo) {
            prefs.getString("app_version_response", null)
        } else {
            null
        }
    }
    
    /**
     * Clear expired cache entries
     */
    fun clearExpiredCache() {
        try {
            val currentTime = System.currentTimeMillis()
            val expiredKeys = memoryCache.filter { (_, entry) -> 
                entry.isExpired() 
            }.keys
            
            expiredKeys.forEach { key ->
                memoryCache.remove(key)
            }
            
            SecureLogger.d("CacheManager", "Cleared ${expiredKeys.size} expired cache entries")
        } catch (e: Exception) {
            SecureLogger.e("CacheManager", "Error clearing expired cache", e)
        }
    }
    
    /**
     * Clear all cache data
     */
    fun clearAllCache() {
        memoryCache.clear()
        prefs.edit().clear().apply()
        SecureLogger.d("CacheManager", "All cache cleared")
    }
    
    private fun parseUserData(jsonString: String): User? {
        return try {
            val json = JSONObject(jsonString)
            User(
                userId = json.getString("userId"),
                email = json.getString("email"),
                firstName = json.optString("firstName", ""),
                lastName = json.optString("lastName", ""),
                fullName = json.optString("fullName", ""),
                storeNumber = json.optString("storeNumber", ""),
                groupMeId = "",
                role = json.optString("role", "user"),
                fcmToken = "",
                isOnShift = false,
                createdAt = null,
                notificationsEnabled = json.optBoolean("notificationsEnabled", true),
                respectDoNotDisturb = json.optBoolean("respectDoNotDisturb", true),
                workSchedule = WorkSchedule()
            )
        } catch (e: Exception) {
            SecureLogger.e("CacheManager", "Error parsing cached user data", e)
            null
        }
    }
}