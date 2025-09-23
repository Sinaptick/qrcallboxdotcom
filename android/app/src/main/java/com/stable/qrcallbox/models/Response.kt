package com.stable.qrcallbox.models

import com.google.firebase.Timestamp

data class Response(
    val userId: String = "",
    val userName: String = "",
    val firstName: String = "",
    val lastName: String = "",
    val storeNumber: String = "",
    val areaDescription: String = "",
    val action: String = "", // "assist" or "ignore"
    val timestamp: Timestamp? = null,
    val responseTime: Long = 0, // milliseconds from notification to action
    val deviceType: String = "android_app", // "android_app", "groupme", "workvivo"
    val notificationReceived: Long = 0 // timestamp when notification was first received
) {
    companion object {
        const val ACTION_ASSIST = "assist"
        const val ACTION_IGNORE = "ignore"
    }
}