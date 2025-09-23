package com.stable.qrcallbox.ui

import android.os.Bundle
import android.util.Log
import android.view.MenuItem
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.stable.qrcallbox.R
import com.stable.qrcallbox.models.ActiveAssociate
import com.stable.qrcallbox.models.User
import com.stable.qrcallbox.utils.ActiveAssociatesAdapter
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.Date
import java.util.concurrent.TimeUnit

class UsersActivity : AppCompatActivity() {
    
    private lateinit var auth: FirebaseAuth
    private lateinit var db: FirebaseFirestore
    private lateinit var adapter: ActiveAssociatesAdapter
    private lateinit var recyclerView: RecyclerView
    private lateinit var progressBar: ProgressBar
    private lateinit var btnRefresh: Button
    private lateinit var tvStoreNumber: TextView
    private lateinit var tvActiveCount: TextView
    private lateinit var layoutEmptyState: View
    
    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    
    private var currentUser: User? = null
    private var userStoreNumber: String = ""
    
    companion object {
        private const val TAG = "UsersActivity"
        private const val API_BASE_URL = "https://us-central1-qrwebaccdb.cloudfunctions.net"
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_users)
        
        // Enable back button
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = "Active Associates"
        
        initializeViews()
        initializeFirebase()
        setupRecyclerView()
        loadCurrentUser()
    }
    
    private fun initializeViews() {
        recyclerView = findViewById(R.id.recyclerViewUsers)
        progressBar = findViewById(R.id.progressBar)
        btnRefresh = findViewById(R.id.btnRefresh)
        tvStoreNumber = findViewById(R.id.tvStoreNumber)
        tvActiveCount = findViewById(R.id.tvActiveCount)
        layoutEmptyState = findViewById(R.id.layoutEmptyState)
        
        btnRefresh.setOnClickListener {
            loadActiveAssociates()
        }
    }
    
    private fun initializeFirebase() {
        auth = FirebaseAuth.getInstance()
        db = FirebaseFirestore.getInstance()
    }
    
    private fun setupRecyclerView() {
        adapter = ActiveAssociatesAdapter()
        recyclerView.layoutManager = LinearLayoutManager(this)
        recyclerView.adapter = adapter
    }
    
    private fun loadCurrentUser() {
        val currentUserId = auth.currentUser?.uid
        if (currentUserId == null) {
            Toast.makeText(this, "Please sign in first", Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        
        showLoading(true)
        
        db.collection("users").document(currentUserId)
            .get()
            .addOnSuccessListener { document ->
                if (document.exists()) {
                    currentUser = document.toObject(User::class.java)
                    userStoreNumber = currentUser?.storeNumber?.toString() ?: ""
                    
                    tvStoreNumber.text = if (userStoreNumber.isNotBlank()) {
                        "Store $userStoreNumber"
                    } else {
                        "Store not set"
                    }
                    
                    if (userStoreNumber.isNotBlank()) {
                        loadActiveAssociates()
                    } else {
                        showLoading(false)
                        Toast.makeText(this, "Store number not configured", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    showLoading(false)
                    Toast.makeText(this, "User profile not found", Toast.LENGTH_SHORT).show()
                }
            }
            .addOnFailureListener { exception ->
                showLoading(false)
                Log.e(TAG, "Error loading user profile", exception)
                Toast.makeText(this, "Error loading user profile", Toast.LENGTH_SHORT).show()
            }
    }
    
    private fun loadActiveAssociates() {
        if (userStoreNumber.isBlank()) {
            Toast.makeText(this, "Store number not available", Toast.LENGTH_SHORT).show()
            return
        }
        
        showLoading(true)
        
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Get auth token
                val currentUser = auth.currentUser
                val token = currentUser?.getIdToken(false)?.result?.token
                
                if (token == null) {
                    withContext(Dispatchers.Main) {
                        showLoading(false)
                        Toast.makeText(this@UsersActivity, "Authentication failed", Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }
                
                // Call API to get active associates count
                val jsonBody = JSONObject().apply {
                    put("storeNumber", userStoreNumber)
                }
                
                val requestBody = jsonBody.toString().toRequestBody("application/json".toMediaType())
                val request = Request.Builder()
                    .url("$API_BASE_URL/getActiveAssociatesCount")
                    .post(requestBody)
                    .addHeader("Authorization", "Bearer $token")
                    .addHeader("Content-Type", "application/json")
                    .build()
                
                val response = httpClient.newCall(request).execute()
                val responseBody = response.body?.string()
                
                if (response.isSuccessful && responseBody != null) {
                    val jsonResponse = JSONObject(responseBody)
                    val activeCount = jsonResponse.getInt("activeCount")
                    val totalUsers = jsonResponse.getInt("totalUsers")
                    
                    // Now get detailed user list from Firestore
                    withContext(Dispatchers.Main) {
                        tvActiveCount.text = activeCount.toString()
                        loadDetailedUserList()
                    }
                    
                } else {
                    withContext(Dispatchers.Main) {
                        showLoading(false)
                        Log.e(TAG, "API call failed: ${response.code} - $responseBody")
                        Toast.makeText(this@UsersActivity, "Failed to load active associates", Toast.LENGTH_SHORT).show()
                    }
                }
                
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showLoading(false)
                    Log.e(TAG, "Error loading active associates", e)
                    Toast.makeText(this@UsersActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
    
    private fun loadDetailedUserList() {
        // Query Firestore for users in the same store
        db.collection("users")
            .whereEqualTo("storeNumber", userStoreNumber.toIntOrNull() ?: userStoreNumber)
            .get()
            .addOnSuccessListener { documents ->
                val associates = mutableListOf<ActiveAssociate>()
                val cutoffTime = Date(System.currentTimeMillis() - (96 * 60 * 60 * 1000)) // 96 hours ago
                
                for (document in documents) {
                    try {
                        val userData = document.data
                        val userId = document.id
                        
                        // Check if user has recent activity
                        val hasRecentActivity = checkRecentActivity(userData, cutoffTime)
                        
                        // Check if user is on shift
                        val isOnShift = checkUserOnShift(userData)
                        
                        // Only include users who are either on shift or have recent activity
                        if (isOnShift || hasRecentActivity) {
                            val associate = ActiveAssociate(
                                userId = userId,
                                userName = userData["firstName"] as? String ?: "",
                                firstName = userData["firstName"] as? String ?: "",
                                lastName = userData["lastName"] as? String ?: "",
                                email = userData["email"] as? String ?: "",
                                storeNumber = userData["storeNumber"]?.toString() ?: "",
                                isOnShift = isOnShift,
                                lastActiveAt = getLastActiveTime(userData),
                                hasRecentActivity = hasRecentActivity,
                                workSchedule = userData["workSchedule"] as? Map<String, Any>
                            )
                            associates.add(associate)
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error processing user document", e)
                    }
                }
                
                // Sort by on shift first, then by last active time
                associates.sortWith(compareByDescending<ActiveAssociate> { it.isOnShift }
                    .thenByDescending { it.lastActiveAt })
                
                adapter.updateAssociates(associates)
                
                showLoading(false)
                showEmptyState(associates.isEmpty())
                
            }
            .addOnFailureListener { exception ->
                showLoading(false)
                Log.e(TAG, "Error loading user details", exception)
                Toast.makeText(this, "Error loading user details", Toast.LENGTH_SHORT).show()
            }
    }
    
    private fun checkRecentActivity(userData: Map<String, Any>, cutoffTime: Date): Boolean {
        val activityFields = listOf("lastLoginAt", "fcmTokenUpdatedAt", "updatedAt", "lastActiveAt")
        
        for (field in activityFields) {
            val timestamp = userData[field] as? com.google.firebase.Timestamp
            if (timestamp != null && timestamp.toDate().after(cutoffTime)) {
                return true
            }
        }
        return false
    }
    
    private fun getLastActiveTime(userData: Map<String, Any>): Date? {
        val activityFields = listOf("lastLoginAt", "fcmTokenUpdatedAt", "updatedAt", "lastActiveAt")
        var latestTime: Date? = null
        
        for (field in activityFields) {
            val timestamp = userData[field] as? com.google.firebase.Timestamp
            if (timestamp != null) {
                val date = timestamp.toDate()
                if (latestTime == null || date.after(latestTime)) {
                    latestTime = date
                }
            }
        }
        return latestTime
    }
    
    private fun checkUserOnShift(userData: Map<String, Any>): Boolean {
        // This is a simplified version - you might want to implement the full shift logic
        // For now, just return true if user has a work schedule
        val workSchedule = userData["workSchedule"] as? Map<String, Any>
        return workSchedule != null && workSchedule.isNotEmpty()
    }
    
    private fun showLoading(show: Boolean) {
        progressBar.visibility = if (show) View.VISIBLE else View.GONE
        btnRefresh.isEnabled = !show
    }
    
    private fun showEmptyState(show: Boolean) {
        layoutEmptyState.visibility = if (show) View.VISIBLE else View.GONE
        recyclerView.visibility = if (show) View.GONE else View.VISIBLE
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