package com.stable.qrcallbox.models

data class WorkSchedule(
    val monday: DaySchedule? = null,
    val tuesday: DaySchedule? = null,
    val wednesday: DaySchedule? = null,
    val thursday: DaySchedule? = null,
    val friday: DaySchedule? = null,
    val saturday: DaySchedule? = null,
    val sunday: DaySchedule? = null
) {
    fun getDaySchedule(dayOfWeek: Int): DaySchedule? {
        return when (dayOfWeek) {
            1 -> sunday    // Calendar.SUNDAY
            2 -> monday    // Calendar.MONDAY
            3 -> tuesday   // Calendar.TUESDAY
            4 -> wednesday // Calendar.WEDNESDAY
            5 -> thursday  // Calendar.THURSDAY
            6 -> friday    // Calendar.FRIDAY
            7 -> saturday  // Calendar.SATURDAY
            else -> null
        }
    }
}

data class DaySchedule(
    val isWorkingDay: Boolean = false,
    val startHour: Int = 9,
    val startMinute: Int = 0,
    val endHour: Int = 17,
    val endMinute: Int = 0
) {
    fun isWithinWorkingHours(hour: Int, minute: Int): Boolean {
        if (!isWorkingDay) {
            android.util.Log.d("ShiftDebug", "❌ Not a working day")
            return false
        }
        
        val currentMinutes = hour * 60 + minute
        val startMinutes = startHour * 60 + startMinute
        val endMinutes = endHour * 60 + endMinute
        
        android.util.Log.d("ShiftDebug", "⏰ Time check: current=$currentMinutes min (${hour}:${minute}), start=$startMinutes min (${startHour}:${startMinute}), end=$endMinutes min (${endHour}:${endMinute})")
        
        val isInRange = currentMinutes in startMinutes until endMinutes
        android.util.Log.d("ShiftDebug", "📊 Is in range [$startMinutes, $endMinutes): $isInRange")
        
        return isInRange
    }
    
    fun getStartTimeString(): String {
        val period = if (startHour < 12) "AM" else "PM"
        val displayHour = if (startHour == 0) 12 else if (startHour > 12) startHour - 12 else startHour
        return String.format("%d:%02d %s", displayHour, startMinute, period)
    }
    
    fun getEndTimeString(): String {
        val period = if (endHour < 12) "AM" else "PM"
        val displayHour = if (endHour == 0) 12 else if (endHour > 12) endHour - 12 else endHour
        return String.format("%d:%02d %s", displayHour, endMinute, period)
    }
}