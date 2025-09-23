package com.stable.qrcallbox.ui

import android.app.TimePickerDialog
import android.os.Bundle
import android.util.Log
import android.view.MenuItem
import android.view.View
import android.widget.CheckBox
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.button.MaterialButton
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.stable.qrcallbox.R
import com.stable.qrcallbox.databinding.ActivitySettingsBinding
import com.stable.qrcallbox.models.DaySchedule
import com.stable.qrcallbox.models.User
import com.stable.qrcallbox.models.WorkSchedule
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

class SettingsActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivitySettingsBinding
    private lateinit var auth: FirebaseAuth
    private lateinit var firestore: FirebaseFirestore
    
    private var currentUser: User? = null
    private val dayViews = mutableMapOf<String, DayScheduleView>()
    
    companion object {
        private const val TAG = "SettingsActivity"
        private val DAYS = listOf("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
        private val DAY_NAMES = listOf("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
    }
    
    data class DayScheduleView(
        val checkBox: CheckBox,
        val timePickerContainer: View,
        val startTimeButton: MaterialButton,
        val endTimeButton: MaterialButton,
        var schedule: DaySchedule = DaySchedule()
    )
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        
        auth = FirebaseAuth.getInstance()
        firestore = FirebaseFirestore.getInstance()
        
        setupDayViews()
        setupClickListeners()
        loadUserSettings()
    }
    
    private fun setupDayViews() {
        val dayIds = listOf(
            R.id.mondaySchedule,
            R.id.tuesdaySchedule,
            R.id.wednesdaySchedule,
            R.id.thursdaySchedule,
            R.id.fridaySchedule,
            R.id.saturdaySchedule,
            R.id.sundaySchedule
        )
        
        DAYS.forEachIndexed { index, day ->
            val dayView = findViewById<View>(dayIds[index])
            val checkBox = dayView.findViewById<CheckBox>(R.id.dayCheckBox)
            val timePickerContainer = dayView.findViewById<View>(R.id.timePickerContainer)
            val startTimeButton = dayView.findViewById<MaterialButton>(R.id.startTimeButton)
            val endTimeButton = dayView.findViewById<MaterialButton>(R.id.endTimeButton)
            
            checkBox.text = DAY_NAMES[index]
            
            val dayScheduleView = DayScheduleView(
                checkBox = checkBox,
                timePickerContainer = timePickerContainer,
                startTimeButton = startTimeButton,
                endTimeButton = endTimeButton
            )
            
            dayViews[day] = dayScheduleView
            
            setupDayClickListeners(day, dayScheduleView)
        }
    }
    
    private fun setupDayClickListeners(day: String, dayView: DayScheduleView) {
        dayView.checkBox.setOnCheckedChangeListener { _, isChecked ->
            dayView.schedule = dayView.schedule.copy(isWorkingDay = isChecked)
            updateDayViewVisibility(dayView)
            autoSaveSettings()
        }
        
        dayView.startTimeButton.setOnClickListener {
            showTimePicker(dayView.schedule.startHour, dayView.schedule.startMinute) { hour, minute ->
                dayView.schedule = dayView.schedule.copy(startHour = hour, startMinute = minute)
                updateDayViewTime(dayView)
                autoSaveSettings()
            }
        }
        
        dayView.endTimeButton.setOnClickListener {
            showTimePicker(dayView.schedule.endHour, dayView.schedule.endMinute) { hour, minute ->
                dayView.schedule = dayView.schedule.copy(endHour = hour, endMinute = minute)
                updateDayViewTime(dayView)
                autoSaveSettings()
            }
        }
    }
    
    private fun setupClickListeners() {
        // Auto-save on notification setting changes
        binding.notificationsEnabledSwitch.setOnCheckedChangeListener { _, _ ->
            autoSaveSettings()
        }
        
        binding.respectDoNotDisturbSwitch.setOnCheckedChangeListener { _, _ ->
            autoSaveSettings()
        }
    }
    
    private fun loadUserSettings() {
        val userId = auth.currentUser?.uid ?: return
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val userDoc = firestore.collection("users")
                    .document(userId)
                    .get()
                    .await()
                
                if (userDoc.exists()) {
                    // Load user with basic data, handle schedule separately
                    currentUser = User(
                        userId = userDoc.getString("userId") ?: "",
                        email = userDoc.getString("email") ?: "",
                        firstName = userDoc.getString("firstName") ?: "",
                        lastName = userDoc.getString("lastName") ?: "",
                        fullName = userDoc.getString("fullName") ?: "",
                        storeNumber = when (val storeValue = userDoc.get("storeNumber")) {
                            is String -> storeValue
                            is Number -> storeValue.toString()
                            else -> ""
                        },
                        groupMeId = userDoc.getString("groupMeId") ?: "",
                        role = userDoc.getString("role") ?: "user",
                        fcmToken = userDoc.getString("fcmToken") ?: "",
                        isOnShift = userDoc.getBoolean("isOnShift") ?: false,
                        createdAt = userDoc.getTimestamp("createdAt"),
                        notificationsEnabled = userDoc.getBoolean("notificationsEnabled") ?: true,
                        respectDoNotDisturb = userDoc.getBoolean("respectDoNotDisturb") ?: true,
                        workSchedule = loadWorkScheduleFromDoc(userDoc)
                    )
                    
                    withContext(Dispatchers.Main) {
                        populateSettings()
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error loading user settings", e)
            }
        }
    }
    
    private fun loadWorkScheduleFromDoc(userDoc: com.google.firebase.firestore.DocumentSnapshot): WorkSchedule {
        return try {
            val scheduleMap = userDoc.get("workSchedule") as? Map<String, Any>
            if (scheduleMap != null) {
                WorkSchedule(
                    monday = parseDaySchedule(scheduleMap["monday"] as? Map<String, Any>),
                    tuesday = parseDaySchedule(scheduleMap["tuesday"] as? Map<String, Any>),
                    wednesday = parseDaySchedule(scheduleMap["wednesday"] as? Map<String, Any>),
                    thursday = parseDaySchedule(scheduleMap["thursday"] as? Map<String, Any>),
                    friday = parseDaySchedule(scheduleMap["friday"] as? Map<String, Any>),
                    saturday = parseDaySchedule(scheduleMap["saturday"] as? Map<String, Any>),
                    sunday = parseDaySchedule(scheduleMap["sunday"] as? Map<String, Any>)
                )
            } else {
                WorkSchedule()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing work schedule", e)
            WorkSchedule()
        }
    }
    
    private fun parseDaySchedule(dayMap: Map<String, Any>?): DaySchedule? {
        return try {
            if (dayMap != null) {
                DaySchedule(
                    isWorkingDay = dayMap["isWorkingDay"] as? Boolean ?: false,
                    startHour = (dayMap["startHour"] as? Number)?.toInt() ?: 9,
                    startMinute = (dayMap["startMinute"] as? Number)?.toInt() ?: 0,
                    endHour = (dayMap["endHour"] as? Number)?.toInt() ?: 17,
                    endMinute = (dayMap["endMinute"] as? Number)?.toInt() ?: 0
                )
            } else {
                null
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error parsing day schedule", e)
            null
        }
    }
    
    private fun populateSettings() {
        currentUser?.let { user ->
            binding.notificationsEnabledSwitch.isChecked = user.notificationsEnabled
            binding.respectDoNotDisturbSwitch.isChecked = user.respectDoNotDisturb
            
            // Populate day schedules
            val schedule = user.workSchedule
            dayViews["monday"]?.let { populateDayView(it, schedule.monday) }
            dayViews["tuesday"]?.let { populateDayView(it, schedule.tuesday) }
            dayViews["wednesday"]?.let { populateDayView(it, schedule.wednesday) }
            dayViews["thursday"]?.let { populateDayView(it, schedule.thursday) }
            dayViews["friday"]?.let { populateDayView(it, schedule.friday) }
            dayViews["saturday"]?.let { populateDayView(it, schedule.saturday) }
            dayViews["sunday"]?.let { populateDayView(it, schedule.sunday) }
        }
    }
    
    private fun populateDayView(dayView: DayScheduleView, daySchedule: DaySchedule?) {
        val schedule = daySchedule ?: DaySchedule()
        dayView.schedule = schedule
        dayView.checkBox.isChecked = schedule.isWorkingDay
        updateDayViewVisibility(dayView)
        updateDayViewTime(dayView)
    }
    
    private fun updateDayViewVisibility(dayView: DayScheduleView) {
        if (dayView.schedule.isWorkingDay) {
            dayView.timePickerContainer.visibility = View.VISIBLE
        } else {
            dayView.timePickerContainer.visibility = View.GONE
        }
        updateDayViewTime(dayView)
    }
    
    private fun updateDayViewTime(dayView: DayScheduleView) {
        val startTime = dayView.schedule.getStartTimeString()
        val endTime = dayView.schedule.getEndTimeString()
        
        dayView.startTimeButton.text = startTime
        dayView.endTimeButton.text = endTime
    }
    
    private fun showTimePicker(hour: Int, minute: Int, onTimeSet: (Int, Int) -> Unit) {
        val timePicker = TimePickerDialog(
            this,
            { _, selectedHour, selectedMinute ->
                onTimeSet(selectedHour, selectedMinute)
            },
            hour,
            minute,
            false
        )
        timePicker.show()
    }
    
    private fun autoSaveSettings() {
        val userId = auth.currentUser?.uid ?: return
        
        val workSchedule = WorkSchedule(
            monday = dayViews["monday"]?.schedule,
            tuesday = dayViews["tuesday"]?.schedule,
            wednesday = dayViews["wednesday"]?.schedule,
            thursday = dayViews["thursday"]?.schedule,
            friday = dayViews["friday"]?.schedule,
            saturday = dayViews["saturday"]?.schedule,
            sunday = dayViews["sunday"]?.schedule
        )
        
        // Convert WorkSchedule to Firestore-friendly format
        val scheduleMap = hashMapOf<String, Any?>()
        scheduleMap["monday"] = dayViews["monday"]?.schedule?.let { convertDayScheduleToMap(it) }
        scheduleMap["tuesday"] = dayViews["tuesday"]?.schedule?.let { convertDayScheduleToMap(it) }
        scheduleMap["wednesday"] = dayViews["wednesday"]?.schedule?.let { convertDayScheduleToMap(it) }
        scheduleMap["thursday"] = dayViews["thursday"]?.schedule?.let { convertDayScheduleToMap(it) }
        scheduleMap["friday"] = dayViews["friday"]?.schedule?.let { convertDayScheduleToMap(it) }
        scheduleMap["saturday"] = dayViews["saturday"]?.schedule?.let { convertDayScheduleToMap(it) }
        scheduleMap["sunday"] = dayViews["sunday"]?.schedule?.let { convertDayScheduleToMap(it) }
        
        val updates = hashMapOf<String, Any>(
            "notificationsEnabled" to binding.notificationsEnabledSwitch.isChecked,
            "respectDoNotDisturb" to binding.respectDoNotDisturbSwitch.isChecked,
            "workSchedule" to scheduleMap
        )
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                firestore.collection("users")
                    .document(userId)
                    .update(updates)
                    .await()
                
                Log.d(TAG, "Settings auto-saved successfully")
                
            } catch (e: Exception) {
                Log.e(TAG, "Error auto-saving settings", e)
            }
        }
    }
    
    private fun convertDayScheduleToMap(daySchedule: DaySchedule): Map<String, Any> {
        return hashMapOf(
            "isWorkingDay" to daySchedule.isWorkingDay,
            "startHour" to daySchedule.startHour,
            "startMinute" to daySchedule.startMinute,
            "endHour" to daySchedule.endHour,
            "endMinute" to daySchedule.endMinute
        )
    }
    
    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            android.R.id.home -> {
                finish()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
}