package com.stable.qrcallbox.models

import com.google.firebase.Timestamp
import java.util.*

data class User(
    val userId: String = "",
    val email: String = "",
    val firstName: String = "",
    val lastName: String = "",
    val fullName: String = "",
    val storeNumber: String = "",
    val groupMeId: String = "",
    val role: String = "user",
    val fcmToken: String = "",
    val isOnShift: Boolean = false,
    val createdAt: Timestamp? = null,
    val workSchedule: WorkSchedule = WorkSchedule(),
    val notificationsEnabled: Boolean = true,
    val respectDoNotDisturb: Boolean = true
) {
    fun isAdmin(): Boolean = role == "admin"
    
    fun isCurrentlyInWorkingHours(): Boolean {
        if (!notificationsEnabled) {
            android.util.Log.d("ShiftDebug", "❌ Notifications disabled")
            return false
        }
        
        val calendar = Calendar.getInstance()
        val dayOfWeek = calendar.get(Calendar.DAY_OF_WEEK)
        val hour = calendar.get(Calendar.HOUR_OF_DAY)
        val minute = calendar.get(Calendar.MINUTE)
        
        val dayName = when (dayOfWeek) {
            Calendar.SUNDAY -> "Sunday"
            Calendar.MONDAY -> "Monday"
            Calendar.TUESDAY -> "Tuesday"
            Calendar.WEDNESDAY -> "Wednesday"
            Calendar.THURSDAY -> "Thursday"
            Calendar.FRIDAY -> "Friday"
            Calendar.SATURDAY -> "Saturday"
            else -> "Unknown"
        }
        
        android.util.Log.d("ShiftDebug", "🕒 Current time: $dayName $hour:$minute (dayOfWeek=$dayOfWeek)")
        
        val daySchedule = workSchedule.getDaySchedule(dayOfWeek)
        if (daySchedule == null) {
            android.util.Log.d("ShiftDebug", "❌ No schedule found for $dayName")
            return false
        }
        
        android.util.Log.d("ShiftDebug", "📅 $dayName schedule: isWorkingDay=${daySchedule.isWorkingDay}, ${daySchedule.startHour}:${daySchedule.startMinute}-${daySchedule.endHour}:${daySchedule.endMinute}")
        
        val isInHours = daySchedule.isWithinWorkingHours(hour, minute)
        android.util.Log.d("ShiftDebug", "✅ Is within working hours: $isInHours")
        
        return isInHours
    }
    
    fun getNextShiftInfo(): String {
        val calendar = Calendar.getInstance()
        val currentDayOfWeek = calendar.get(Calendar.DAY_OF_WEEK)
        val currentHour = calendar.get(Calendar.HOUR_OF_DAY)
        val currentMinute = calendar.get(Calendar.MINUTE)
        
        // Check if currently in shift
        if (isCurrentlyInWorkingHours()) {
            val todaySchedule = workSchedule.getDaySchedule(currentDayOfWeek)
            if (todaySchedule != null && todaySchedule.isWorkingDay) {
                return "Ends today at ${todaySchedule.getEndTimeString()}"
            }
        }
        
        // Find next shift
        for (i in 1..7) {
            val checkDay = ((currentDayOfWeek - 1 + i) % 7) + 1
            val daySchedule = workSchedule.getDaySchedule(checkDay)
            
            if (daySchedule?.isWorkingDay == true) {
                val dayName = when (checkDay) {
                    Calendar.SUNDAY -> "Sunday"
                    Calendar.MONDAY -> "Monday"
                    Calendar.TUESDAY -> "Tuesday"
                    Calendar.WEDNESDAY -> "Wednesday"
                    Calendar.THURSDAY -> "Thursday"
                    Calendar.FRIDAY -> "Friday"
                    Calendar.SATURDAY -> "Saturday"
                    else -> "Unknown"
                }
                
                val prefix = if (i == 1) "Tomorrow" else dayName
                return "$prefix at ${daySchedule.getStartTimeString()}"
            }
        }
        
        return "No shifts scheduled"
    }
    
    fun getCurrentShiftStatus(): String {
        return if (isCurrentlyInWorkingHours()) {
            "🟢 Currently On Shift"
        } else {
            "🔴 Currently Off Shift"
        }
    }
}