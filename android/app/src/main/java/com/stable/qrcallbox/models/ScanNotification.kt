package com.stable.qrcallbox.models

import com.google.firebase.Timestamp

data class ScanNotification(
    val scanId: String = "",
    val timestamp: Timestamp? = null,
    val qrCode: String = "",
    val storeNumber: String = "",
    val areaDescription: String = "",
    val ipAddress: String = "",
    val userAgent: String = "",
    val responses: List<Response> = listOf(),
    val status: String = "pending", // pending, claimed, assisted, resolved
    val claimedBy: String = "", // userId of first responder
    val claimedByName: String = "", // name of first responder
    val claimedAt: Timestamp? = null, // when it was claimed
    val resolvedAt: Timestamp? = null // when marked as resolved
) {
    companion object {
        const val STATUS_PENDING = "pending"
        const val STATUS_CLAIMED = "claimed" 
        const val STATUS_ASSISTED = "assisted"
        const val STATUS_RESOLVED = "resolved"
    }
    
    fun hasBeenHandled(): Boolean = status != STATUS_PENDING
    
    fun isAvailableForClaim(): Boolean = status == STATUS_PENDING
    
    fun getFirstResponder(): String = claimedByName.ifEmpty { 
        responses.firstOrNull { it.action == "assist" }?.userName ?: ""
    }
    
    fun getRespondedUserNames(): List<String> = 
        responses.filter { it.action == "assist" }.map { it.userName }
}