package com.stable.qrcallbox.models

import java.util.Date

data class ActiveAssociate(
    val userId: String = "",
    val userName: String = "",
    val firstName: String = "",
    val lastName: String = "",
    val email: String = "",
    val storeNumber: String = "",
    val isOnShift: Boolean = false,
    val lastActiveAt: Date? = null,
    val currentShiftStart: String = "",
    val currentShiftEnd: String = "",
    val workSchedule: Map<String, Any>? = null,
    val fcmToken: String? = null,
    val hasRecentActivity: Boolean = false
) {
    fun getDisplayName(): String {
        return when {
            firstName.isNotBlank() && lastName.isNotBlank() -> "$firstName $lastName"
            firstName.isNotBlank() -> firstName
            userName.isNotBlank() -> userName
            email.isNotBlank() -> email.substringBefore("@")
            else -> "Unknown Associate"
        }
    }
    
    fun getLastActiveText(): String {
        return lastActiveAt?.let { date ->
            val now = Date()
            val diffInMillis = now.time - date.time
            val diffInHours = diffInMillis / (1000 * 60 * 60)
            val diffInMinutes = diffInMillis / (1000 * 60)
            
            when {
                diffInMinutes < 60 -> "${diffInMinutes}m ago"
                diffInHours < 24 -> "${diffInHours}h ago"
                else -> {
                    val diffInDays = diffInHours / 24
                    "${diffInDays}d ago"
                }
            }
        } ?: "Unknown"
    }
    
    fun getShiftTimeText(): String {
        return if (currentShiftStart.isNotBlank() && currentShiftEnd.isNotBlank()) {
            "$currentShiftStart - $currentShiftEnd"
        } else {
            "No shift scheduled"
        }
    }
}