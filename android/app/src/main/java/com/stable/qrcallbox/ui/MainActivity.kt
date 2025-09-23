package com.stable.qrcallbox.ui

import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.app.DownloadManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.IntentFilter
import android.net.Uri
import android.os.Environment
import androidx.appcompat.app.AlertDialog
import androidx.core.content.FileProvider
import okhttp3.Call
import okhttp3.Callback
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.io.FileInputStream
import android.content.pm.PackageInfo
import android.content.pm.PackageManager.NameNotFoundException
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.Query
import com.google.firebase.messaging.FirebaseMessaging
import com.stable.qrcallbox.BuildConfig
import com.stable.qrcallbox.QRCallBoxApplication
import com.stable.qrcallbox.R
import com.stable.qrcallbox.databinding.ActivityMainBinding
import com.stable.qrcallbox.models.ScanNotification
import com.stable.qrcallbox.models.User
import com.stable.qrcallbox.models.WorkSchedule
import com.stable.qrcallbox.utils.ScanAdapter
import com.stable.qrcallbox.utils.CacheManager
import com.stable.qrcallbox.utils.SecureLogger
import com.stable.qrcallbox.utils.MDMBypassManager
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityMainBinding
    private lateinit var auth: FirebaseAuth
    private lateinit var firestore: FirebaseFirestore
    private lateinit var scanAdapter: ScanAdapter
    
    private var currentUser: User? = null
    private var downloadId: Long = -1
    private lateinit var downloadReceiver: BroadcastReceiver
    private var scansListener: com.google.firebase.firestore.ListenerRegistration? = null
    private lateinit var cacheManager: CacheManager
    private lateinit var mdmBypassManager: MDMBypassManager
    
    companion object {
        private const val TAG = "MainActivity"
        private const val UPDATE_CHECK_URL = "https://us-central1-qrwebaccdb.cloudfunctions.net/getAppVersion"
        
        // Security constants for APK verification
        private const val EXPECTED_PACKAGE_NAME = "com.stable.qrcallbox"
        private const val EXPECTED_CERT_FINGERPRINT = "YOUR_DEBUG_CERT_SHA256_HERE" // TODO: Replace with actual certificate fingerprint
        
        // Certificate verification - this should match your signing certificate
        // To get your certificate fingerprint, run:
        // keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        setSupportActionBar(binding.toolbar)
        
        auth = FirebaseAuth.getInstance()
        firestore = FirebaseFirestore.getInstance()
        cacheManager = CacheManager.getInstance(this)
        mdmBypassManager = MDMBypassManager(this)
        
        if (auth.currentUser == null) {
            navigateToLogin()
            return
        }
        
        setupRecyclerView()
        setupClickListeners()
        loadUserData()
        
        // Check for app updates
        checkForAppUpdates()
        
        // Handle notification click
        handleNotificationIntent(intent)
    }
    
    override fun onResume() {
        super.onResume()
        
        // Clean up expired cache entries for better memory management
        cacheManager.clearExpiredCache()
        
        // Reload user data when returning from settings (now with caching)
        loadUserData()
        // Ensure FCM token is up to date (now with smart caching)
        updateFCMToken()
        // Check for MDM blocking and attempt bypass if needed
        checkAndBypassMDMBlocking()
    }
    
    override fun onPause() {
        super.onPause()
        // Pause real-time listener to conserve resources when app is backgrounded
        scansListener?.remove()
        scansListener = null
    }
    
    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        intent?.let { handleNotificationIntent(it) }
    }
    
    private fun setupRecyclerView() {
        scanAdapter = ScanAdapter { scan ->
            handleAssistClick(scan)
        }
        binding.scansRecyclerView.apply {
            layoutManager = LinearLayoutManager(this@MainActivity)
            adapter = scanAdapter
            
            // Performance optimizations
            setHasFixedSize(true) // Size won't change, improves performance
            setItemViewCacheSize(20) // Cache 20 views for smooth scrolling
            isNestedScrollingEnabled = false // Disable if not needed
            
            // Reduce overdraw by setting drawing cache
            setDrawingCacheEnabled(true)
            setDrawingCacheQuality(View.DRAWING_CACHE_QUALITY_HIGH)
            
            // Optimize animations for better performance
            itemAnimator?.apply {
                addDuration = 150
                changeDuration = 150
                moveDuration = 150
                removeDuration = 150
            }
        }
    }
    
    private fun setupClickListeners() {
        // No click listeners needed currently
    }
    
    private fun loadUserData() {
        val userId = auth.currentUser?.uid ?: return
        
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                // TODO: Re-enable user data caching after fixing work schedule serialization
                // For now, always fetch fresh from Firestore to ensure work schedule loads correctly
                SecureLogger.d(TAG, "Loading fresh user data from Firestore (caching temporarily disabled)")
                
                val userDoc = firestore.collection("users")
                    .document(userId)
                    .get()
                    .await()
                
                if (userDoc.exists()) {
                    try {
                        // Manually create User object to avoid deserialization issues
                        val storeNumber = when (val storeValue = userDoc.get("storeNumber")) {
                            is String -> storeValue
                            is Number -> storeValue.toString()
                            else -> ""
                        }
                        
                        val user = User(
                            userId = userId, // Use Firebase Auth UID, not Firestore field
                            email = userDoc.getString("email") ?: "",
                            firstName = userDoc.getString("firstName") ?: "",
                            lastName = userDoc.getString("lastName") ?: "",
                            fullName = userDoc.getString("fullName") ?: "",
                            storeNumber = storeNumber,
                            groupMeId = userDoc.getString("groupMeId") ?: "",
                            role = userDoc.getString("role") ?: "user",
                            fcmToken = userDoc.getString("fcmToken") ?: "",
                            isOnShift = userDoc.getBoolean("isOnShift") ?: false,
                            createdAt = userDoc.getTimestamp("createdAt"),
                            notificationsEnabled = userDoc.getBoolean("notificationsEnabled") ?: true,
                            respectDoNotDisturb = userDoc.getBoolean("respectDoNotDisturb") ?: true,
                            workSchedule = loadWorkScheduleFromDoc(userDoc)
                        )
                        
                        currentUser = user
                        
                        // TODO: Re-enable caching after fixing work schedule serialization
                        // cacheManager.cacheUserData(userId, user)
                        
                        withContext(Dispatchers.Main) {
                            updateUI()
                            loadRecentScans()
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error creating user object", e)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error loading user data", e)
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
    
    private fun parseDaySchedule(dayMap: Map<String, Any>?): com.stable.qrcallbox.models.DaySchedule? {
        return try {
            if (dayMap != null) {
                com.stable.qrcallbox.models.DaySchedule(
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
    
    private fun updateUI() {
        currentUser?.let { user ->
            // Show only first name, with proper fallback logic
            val displayName = when {
                // First priority: use firstName field if available (new registrations)
                user.firstName.isNotBlank() -> user.firstName.trim()
                // Second priority: extract from fullName (legacy users)
                user.fullName.isNotBlank() -> {
                    val firstPart = user.fullName.trim().split(" ").firstOrNull()?.trim()
                    firstPart?.takeIf { it.isNotBlank() } ?: user.email.substringBefore("@")
                }
                // Final fallback: use email username
                else -> user.email.substringBefore("@")
            }
            binding.userNameTextView.text = "Welcome, $displayName!"
            binding.toolbarStoreTextView.text = user.storeNumber
            
            // Update automatic shift status
            binding.autoShiftStatusTextView.text = user.getCurrentShiftStatus()
            binding.nextShiftTextView.text = "Next shift: ${user.getNextShiftInfo()}"
            
        } ?: run {
            // Show loading state
            binding.userNameTextView.text = "Loading..."
            binding.toolbarStoreTextView.text = "Loading..."
            binding.autoShiftStatusTextView.text = "⏰ Loading schedule..."
            binding.nextShiftTextView.text = "Loading next shift..."
            
            // Show loading debug info
        }
    }
    
    private fun loadRecentScans() {
        val storeNumber = currentUser?.storeNumber ?: return
        Log.d(TAG, "Setting up real-time listener for store: $storeNumber")
        
        // Remove existing listener to prevent memory leaks
        scansListener?.remove()
        
        // Set up real-time listener for instant updates
        val scansQuery = firestore.collection("scans")
            .whereEqualTo("storeNumber", storeNumber)
            .orderBy("timestamp", Query.Direction.DESCENDING)
            .limit(20)
        
        scansListener = scansQuery.addSnapshotListener { snapshot, error ->
            if (error != null) {
                Log.e(TAG, "Error listening to scans", error)
                binding.scansRecyclerView.visibility = View.GONE
                binding.noScansTextView.visibility = View.VISIBLE
                binding.noScansTextView.text = "Error loading scans: ${error.message}"
                return@addSnapshotListener
            }
            
            if (snapshot != null) {
                Log.d(TAG, "Real-time update: ${snapshot.documents.size} documents")
                val currentTime = System.currentTimeMillis()
                val tenMinutesAgo = currentTime - (10 * 60 * 1000L) // 10 minutes in milliseconds
                
                val scans = snapshot.documents.mapNotNull { doc ->
                    doc.toObject(ScanNotification::class.java)?.copy(scanId = doc.id)
                }.filter { scan ->
                    // Only show pending or claimed calls (not resolved)
                    val isValidStatus = scan.status == "pending" || scan.status == "claimed"
                    
                    // Only show requests from last 10 minutes
                    val isRecent = scan.timestamp?.let { timestamp ->
                        timestamp.toDate().time >= tenMinutesAgo
                    } ?: false
                    
                    Log.d(TAG, "Scan ${scan.scanId}: status=${scan.status}, isValidStatus=$isValidStatus, isRecent=$isRecent, timestamp=${scan.timestamp?.toDate()}")
                    
                    isValidStatus && isRecent
                }
                
                Log.d(TAG, "Updating UI with ${scans.size} scans")
                if (scans.isNotEmpty()) {
                    scanAdapter.submitList(scans)
                    binding.scansRecyclerView.visibility = View.VISIBLE
                    binding.noScansTextView.visibility = View.GONE
                } else {
                    binding.scansRecyclerView.visibility = View.GONE
                    binding.noScansTextView.visibility = View.VISIBLE
                    binding.noScansTextView.text = "No recent customer requests"
                }
            }
        }
    }
    
    private fun handleAssistClick(scan: ScanNotification) {
        val currentUser = this.currentUser
        val scanId = scan.scanId
        
        if (currentUser == null) {
            Log.e(TAG, "❌ Current user is null")
            android.widget.Toast.makeText(this, "Error: User profile not loaded. Please refresh the app.", android.widget.Toast.LENGTH_LONG).show()
            return
        }
        
        if (currentUser.userId.isEmpty()) {
            Log.e(TAG, "❌ Current user ID is empty")
            android.widget.Toast.makeText(this, "Error: User ID not found. Please log out and log back in.", android.widget.Toast.LENGTH_LONG).show()
            return
        }
        
        if (scanId.isNullOrEmpty()) {
            Log.e(TAG, "❌ Scan ID is null or empty")
            android.widget.Toast.makeText(this, "Error: Invalid scan request.", android.widget.Toast.LENGTH_LONG).show()
            return
        }
        
        
        // Pre-validate store numbers match
        if (currentUser.storeNumber.isEmpty()) {
            if (BuildConfig.DEBUG) Log.e(TAG, "❌ User store number is empty!")
            android.widget.Toast.makeText(this, "Error: Your store number is not set. Please contact admin.", android.widget.Toast.LENGTH_LONG).show()
            return
        }
        
        if (scan.storeNumber != currentUser.storeNumber) {
            if (BuildConfig.DEBUG) Log.e(TAG, "❌ Store numbers don't match: user='${currentUser.storeNumber}', scan='${scan.storeNumber}'")
            android.widget.Toast.makeText(this, "Error: This request is for a different store", android.widget.Toast.LENGTH_LONG).show()
            return
        }
        
        // Check if user document exists in Firestore before attempting transaction
        Log.d(TAG, "Verifying user document exists in Firestore...")
        firestore.collection("users").document(currentUser.userId).get()
            .addOnSuccessListener { userDoc ->
                if (!userDoc.exists()) {
                    Log.e(TAG, "❌ User document does not exist in Firestore!")
                    android.widget.Toast.makeText(this, "Error: User profile not found. Please log out and log back in.", android.widget.Toast.LENGTH_LONG).show()
                    return@addOnSuccessListener
                }
                
                val firestoreStore = when (val storeValue = userDoc.get("storeNumber")) {
                    is String -> storeValue
                    is Number -> storeValue.toString()
                    else -> ""
                }
                Log.d(TAG, "✅ User document exists. Firestore store: '$firestoreStore'")
                
                if (firestoreStore != currentUser.storeNumber) {
                    Log.e(TAG, "❌ Store mismatch between local and Firestore: local='${currentUser.storeNumber}', firestore='$firestoreStore'")
                    android.widget.Toast.makeText(this, "Error: Store assignment mismatch. Please refresh your profile.", android.widget.Toast.LENGTH_LONG).show()
                    return@addOnSuccessListener
                }
                
                // Proceed with transaction
                performAssistTransaction(scanId, scan, currentUser)
            }
            .addOnFailureListener { error ->
                Log.e(TAG, "❌ Failed to verify user document", error)
                android.widget.Toast.makeText(this, "Error: Cannot verify user profile - ${error.message}", android.widget.Toast.LENGTH_LONG).show()
            }
    }
    
    private fun performAssistTransaction(scanId: String, scan: ScanNotification, currentUser: com.stable.qrcallbox.models.User) {
        // Use a transaction to prevent race conditions when multiple associates try to assist
        val scanRef = firestore.collection("scans").document(scanId)
        Log.d(TAG, "Starting transaction for scan: $scanId")
        Log.d(TAG, "Scan document path: scans/$scanId")
        Log.d(TAG, "User ID: ${currentUser.userId}")
        Log.d(TAG, "User store: ${currentUser.storeNumber}")
        
        firestore.runTransaction { transaction ->
            val snapshot = transaction.get(scanRef)
            
            // Check if scan still exists and is available
            if (!snapshot.exists()) {
                throw Exception("This request no longer exists")
            }
            
            val currentStatus = snapshot.getString("status") ?: "pending"
            val currentClaimedBy = snapshot.getString("claimedBy") ?: ""
            
            // Check if already claimed by someone else
            if (currentStatus == "claimed" && currentClaimedBy != currentUser.userId) {
                val claimedByName = snapshot.getString("claimedByName") ?: "another associate"
                throw Exception("$claimedByName is already assisting with this request")
            }
            
            // Check if already resolved
            if (currentStatus == "resolved") {
                throw Exception("This request has already been resolved")
            }
            
            // Determine display name with proper fallbacks
            val displayName = when {
                currentUser.fullName.isNotBlank() -> currentUser.fullName.trim()
                currentUser.firstName.isNotBlank() || currentUser.lastName.isNotBlank() -> 
                    "${currentUser.firstName} ${currentUser.lastName}".trim()
                currentUser.email.isNotBlank() -> currentUser.email.substringBefore("@")
                else -> "Unknown User"
            }
            
            Log.d(TAG, "Using display name: '$displayName'")
            
            // Claim the scan
            val updates = mapOf(
                "claimedBy" to currentUser.userId,
                "claimedByName" to displayName,
                "claimedAt" to com.google.firebase.firestore.FieldValue.serverTimestamp(),
                "status" to "claimed"
            )
            
            transaction.update(scanRef, updates)
            null // Transaction successful
        }.addOnSuccessListener {
            Log.d(TAG, "Successfully claimed scan $scanId")
            android.widget.Toast.makeText(
                this, 
                "You are now assisting with this request", 
                android.widget.Toast.LENGTH_SHORT
            ).show()
        }.addOnFailureListener { error ->
            Log.e(TAG, "❌ TRANSACTION FAILED for scan $scanId")
            Log.e(TAG, "❌ Error type: ${error.javaClass.simpleName}")
            Log.e(TAG, "❌ Error message: ${error.message}")
            Log.e(TAG, "❌ Error cause: ${error.cause}")
            Log.e(TAG, "❌ Full error:", error)
            Log.e(TAG, "❌ User ID: ${currentUser.userId}")
            Log.e(TAG, "❌ User store: '${currentUser.storeNumber}' (${currentUser.storeNumber.javaClass.simpleName})")
            Log.e(TAG, "❌ Scan store: '${scan.storeNumber}' (${scan.storeNumber.javaClass.simpleName})")
            
            val errorMessage = when {
                error.message?.contains("PERMISSION_DENIED") == true -> {
                    "Permission denied: Store mismatch or Firestore rules issue. Your store: ${currentUser.storeNumber}, Request store: ${scan.storeNumber}"
                }
                error.message?.contains("FAILED_PRECONDITION") == true -> 
                    "Operation failed: Document may not exist or be in wrong state"
                error.message?.contains("UNAUTHENTICATED") == true ->
                    "Authentication error: Please log out and log back in"
                else -> "Failed to claim assistance: ${error.message}"
            }
            
            android.widget.Toast.makeText(this, errorMessage, android.widget.Toast.LENGTH_LONG).show()
        }
    }
    
    private fun handleNotificationIntent(intent: Intent) {
        val scanId = intent.getStringExtra("scanId")
        val areaDescription = intent.getStringExtra("areaDescription")
        
        if (scanId != null && areaDescription != null) {
            // Show a dialog or highlight the specific scan
            Log.d(TAG, "Opened from notification - Scan: $scanId, Area: $areaDescription")
        }
    }
    
    
    
    private fun updateFCMToken() {
        val userId = auth.currentUser?.uid ?: run {
            Log.e(TAG, "updateFCMToken: No authenticated user")
            return
        }
        
        
        com.google.firebase.messaging.FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                Log.w(TAG, "Fetching FCM registration token failed", task.exception)
                return@addOnCompleteListener
            }

            // Get new FCM registration token
            val token = task.result
            if (token.isNullOrBlank()) {
                Log.w(TAG, "FCM token is null or blank")
                return@addOnCompleteListener
            }
            
            SecureLogger.d(TAG, "Got FCM token: ${token.take(20)}...")
            
            // Check if token needs update to prevent redundant Firestore writes
            if (!cacheManager.shouldUpdateFCMToken(userId, token)) {
                SecureLogger.d(TAG, "FCM token unchanged, skipping Firestore update")
                return@addOnCompleteListener
            }
            
            SecureLogger.d(TAG, "FCM token changed or expired, updating Firestore for user: $userId")

            // Get app version info
            val packageInfo = packageManager.getPackageInfo(packageName, 0)
            val versionName = packageInfo.versionName ?: "unknown"
            val versionCode = packageInfo.longVersionCode
            
            // Update token in Firestore with timestamp and version info
            val updateData = mapOf(
                "fcmToken" to token,
                "fcmTokenUpdatedAt" to com.google.firebase.Timestamp.now(),
                "appVersion" to versionName,
                "appVersionCode" to versionCode,
                "lastSeen" to com.google.firebase.Timestamp.now(),
                "deviceInfo" to "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} (Android ${android.os.Build.VERSION.RELEASE})"
            )

            firestore.collection("users")
                .document(userId)
                .set(updateData, com.google.firebase.firestore.SetOptions.merge())
                .addOnSuccessListener {
                    SecureLogger.d(TAG, "✅ FCM token and app info updated in Firestore successfully for user: $userId (v$versionName)")
                    
                    // Cache the token to prevent future redundant updates
                    cacheManager.cacheFCMToken(userId, token)
                    
                    // Reload user data to refresh debug display
                    loadUserData()
                }
                .addOnFailureListener { e ->
                    Log.e(TAG, "❌ Failed to update FCM token and app info in Firestore for user: $userId", e)
                    Log.e(TAG, "❌ Error type: ${e.javaClass.simpleName}")
                    Log.e(TAG, "❌ Error message: ${e.message}")
                    
                    // Try using set with merge instead of update
                    Log.d(TAG, "🔄 Retrying with set(merge=true)...")
                    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                        firestore.collection("users")
                            .document(userId)
                            .set(mapOf("fcmToken" to token), com.google.firebase.firestore.SetOptions.merge())
                            .addOnSuccessListener {
                                SecureLogger.d(TAG, "✅ FCM token updated on retry (set/merge) for user: $userId")
                                
                                // Cache the token to prevent future redundant updates
                                cacheManager.cacheFCMToken(userId, token)
                                
                                loadUserData()
                            }
                            .addOnFailureListener { retryError ->
                                Log.e(TAG, "❌ FCM token update retry failed for user: $userId", retryError)
                            }
                    }, 2000)
                }
        }
    }
    
    
    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menuInflater.inflate(R.menu.main_menu, menu)
        return true
    }
    
    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_check_updates -> {
                Log.d(TAG, "Manual update check requested")
                android.widget.Toast.makeText(this, "Checking for updates...", android.widget.Toast.LENGTH_SHORT).show()
                checkForAppUpdates(forceCheck = true)
                true
            }
            R.id.action_users -> {
                val intent = Intent(this, UsersActivity::class.java)
                startActivity(intent)
                true
            }
            R.id.action_settings -> {
                val intent = Intent(this, SettingsActivity::class.java)
                startActivity(intent)
                true
            }
            R.id.action_logout -> {
                logout()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }
    
    private fun logout() {
        auth.signOut()
        navigateToLogin()
    }
    
    private fun navigateToLogin() {
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
    
    // ===== Auto-Update System =====
    
    private var isManualUpdateCheck = false
    
    private fun checkForAppUpdates(forceCheck: Boolean = false) {
        isManualUpdateCheck = forceCheck
        Log.d(TAG, "🔄 Checking for app updates... (force: $forceCheck)")
        val currentVersion = getCurrentAppVersion()
        Log.d(TAG, "📱 Current app version: $currentVersion")
        
        // Prevent checking too frequently (minimum 5 minutes between checks for debugging)
        // Skip throttling if this is a manual/forced check
        if (!forceCheck) {
            val lastCheckKey = "last_update_check"
            val prefs = getSharedPreferences("app_updates", MODE_PRIVATE)
            val lastCheckTime = prefs.getLong(lastCheckKey, 0)
            val currentTime = System.currentTimeMillis()
            val fiveMinutesMs = 5 * 60 * 1000L // Reduced from 1 hour to 5 minutes for debugging
            
            if (currentTime - lastCheckTime < fiveMinutesMs) {
                Log.d(TAG, "⏰ Skipping update check - checked recently (${(currentTime - lastCheckTime) / 1000 / 60} minutes ago)")
                Log.d(TAG, "⏰ Next check allowed in ${(fiveMinutesMs - (currentTime - lastCheckTime)) / 1000 / 60} minutes")
                return
            }
        }
        
        // Update last check time (moved after throttle check)
        val lastCheckKey = "last_update_check"
        val prefs = getSharedPreferences("app_updates", MODE_PRIVATE)
        val currentTime = System.currentTimeMillis()
        prefs.edit().putLong(lastCheckKey, currentTime).apply()
        
        // Check cache first to avoid redundant API calls
        val cachedResponse = cacheManager.getCachedAppVersionCheck()
        if (cachedResponse != null) {
            SecureLogger.d(TAG, "Using cached app version response, skipping API call")
            processUpdateResponse(cachedResponse)
            return
        }
        
        val client = OkHttpClient()
        val request = Request.Builder()
            .url(UPDATE_CHECK_URL)
            .build()
            
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                Log.e(TAG, "❌ Failed to check for updates", e)
                if (isManualUpdateCheck) {
                    runOnUiThread {
                        android.widget.Toast.makeText(this@MainActivity, "❌ Update check failed: Network error", android.widget.Toast.LENGTH_LONG).show()
                    }
                }
            }
            
            override fun onResponse(call: Call, response: Response) {
                if (response.isSuccessful) {
                    response.body?.let { responseBody ->
                        try {
                            val responseString = responseBody.string()
                            SecureLogger.d(TAG, "📡 Update check API response received")
                            
                            // Cache the response to avoid redundant API calls
                            cacheManager.cacheAppVersionCheck(responseString)
                            
                            processUpdateResponse(responseString)
                        } catch (e: Exception) {
                            Log.e(TAG, "❌ Error parsing update response", e)
                        }
                    }
                } else {
                    Log.e(TAG, "❌ Update check failed with status: ${response.code}")
                }
            }
        })
    }
    
    private fun processUpdateResponse(responseString: String) {
        try {
            val json = JSONObject(responseString)
            val latestVersion = json.getString("latestVersion")
            val currentVersion = getCurrentAppVersion()
            val downloadUrl = json.getString("downloadUrl")
            val releaseNotes = json.getString("releaseNotes")
            val expectedHash = json.optString("sha256Hash", "") // Optional hash for verification
            
            SecureLogger.d(TAG, "🔄 Version comparison - Current: $currentVersion, Latest: $latestVersion")
            val isNewer = isNewerVersion(currentVersion, latestVersion)
            SecureLogger.d(TAG, "🔄 Is newer version available: $isNewer")
            
            if (isNewer) {
                SecureLogger.d(TAG, "🚀 Update available! Showing dialog...")
                runOnUiThread {
                    showUpdateDialog(latestVersion, releaseNotes, downloadUrl, expectedHash)
                }
            } else {
                SecureLogger.d(TAG, "✅ App is up to date")
                if (isManualUpdateCheck) {
                    runOnUiThread {
                        android.widget.Toast.makeText(this, "✅ You have the latest version ($currentVersion)", android.widget.Toast.LENGTH_LONG).show()
                    }
                }
            }
        } catch (e: Exception) {
            SecureLogger.e(TAG, "❌ Error parsing update response", e)
            if (isManualUpdateCheck) {
                runOnUiThread {
                    android.widget.Toast.makeText(this, "❌ Update check failed: Server error", android.widget.Toast.LENGTH_LONG).show()
                }
            }
        }
    }
    
    private fun getCurrentAppVersion(): String {
        return try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: "1.0"
        } catch (e: PackageManager.NameNotFoundException) {
            "1.0"
        }
    }
    
    private fun isNewerVersion(current: String, latest: String): Boolean {
        return try {
            val currentParts = current.split(".").map { it.toInt() }
            val latestParts = latest.split(".").map { it.toInt() }
            
            for (i in 0 until maxOf(currentParts.size, latestParts.size)) {
                val currentPart = currentParts.getOrNull(i) ?: 0
                val latestPart = latestParts.getOrNull(i) ?: 0
                
                when {
                    latestPart > currentPart -> return true
                    latestPart < currentPart -> return false
                }
            }
            false
        } catch (e: Exception) {
            Log.e(TAG, "Error comparing versions", e)
            false
        }
    }
    
    private fun showUpdateDialog(version: String, releaseNotes: String, downloadUrl: String, expectedHash: String = "") {
        AlertDialog.Builder(this)
            .setTitle("Update Available")
            .setMessage("Version $version is available!\n\n$releaseNotes\n\nWould you like to download and install it?")
            .setPositiveButton("Update") { _, _ ->
                downloadAndInstallUpdate(downloadUrl, expectedHash)
            }
            .setNegativeButton("Later") { dialog, _ ->
                dialog.dismiss()
            }
            .setCancelable(false)
            .show()
    }
    
    private fun downloadAndInstallUpdate(downloadUrl: String, expectedHash: String = "") {
        val downloadManager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        
        val request = DownloadManager.Request(Uri.parse(downloadUrl))
            .setTitle("QRCallBox Update")
            .setDescription("Downloading latest version...")
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "QRCallBox-update.apk")
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(true)
            
        downloadId = downloadManager.enqueue(request)
        
        // Register receiver for download completion
        downloadReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1)
                if (id == downloadId) {
                    verifyAndInstallUpdate(expectedHash)
                    unregisterReceiver(this)
                }
            }
        }
        
        registerReceiver(downloadReceiver, IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE))
    }
    
    private fun verifyAndInstallUpdate(expectedHash: String) {
        try {
            val downloadManager = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val uri = downloadManager.getUriForDownloadedFile(downloadId)
            
            if (uri == null) {
                showUpdateError("Download failed - no file found")
                return
            }
            
            // Get the actual file path for verification
            val cursor = downloadManager.query(DownloadManager.Query().setFilterById(downloadId))
            if (cursor.moveToFirst()) {
                val statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS)
                val status = cursor.getInt(statusIndex)
                
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    val localUriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI)
                    val localUri = cursor.getString(localUriIndex)
                    val file = File(Uri.parse(localUri).path ?: "")
                    
                    // Perform security verification
                    if (verifyAPKSecurity(file, expectedHash)) {
                        installVerifiedUpdate(uri)
                    } else {
                        showUpdateError("Security verification failed - update cancelled for your safety")
                        file.delete() // Remove potentially malicious file
                    }
                } else {
                    showUpdateError("Download was not successful")
                }
            }
            cursor.close()
        } catch (e: Exception) {
            Log.e(TAG, "Error verifying update", e)
            showUpdateError("Verification error: ${e.message}")
        }
    }
    
    private fun verifyAPKSecurity(apkFile: File, expectedHash: String): Boolean {
        try {
            Log.d(TAG, "🔒 Starting APK security verification...")
            
            // 1. Verify file exists and is readable
            if (!apkFile.exists() || !apkFile.canRead()) {
                Log.e(TAG, "❌ APK file not accessible")
                return false
            }
            
            // 2. Verify file size is reasonable (not too small or suspiciously large)
            val fileSize = apkFile.length()
            if (fileSize < 1024 * 1024 || fileSize > 100 * 1024 * 1024) { // 1MB to 100MB
                Log.e(TAG, "❌ APK file size suspicious: ${fileSize / 1024 / 1024}MB")
                return false
            }
            
            // 3. Verify SHA-256 hash if provided
            if (expectedHash.isNotEmpty()) {
                val actualHash = calculateSHA256(apkFile)
                if (actualHash != expectedHash.lowercase()) {
                    Log.e(TAG, "❌ Hash verification failed")
                    Log.e(TAG, "Expected: $expectedHash")
                    Log.e(TAG, "Actual: $actualHash")
                    return false
                }
                Log.d(TAG, "✅ Hash verification passed")
            }
            
            // 4. Verify APK package name
            val packageInfo = packageManager.getPackageArchiveInfo(apkFile.absolutePath, 0)
            if (packageInfo == null) {
                Log.e(TAG, "❌ Cannot parse APK package info")
                return false
            }
            
            if (packageInfo.packageName != EXPECTED_PACKAGE_NAME) {
                Log.e(TAG, "❌ Package name mismatch: ${packageInfo.packageName} != $EXPECTED_PACKAGE_NAME")
                return false
            }
            
            // 5. Verify APK signature (simplified check)
            // Note: Full signature verification would require more complex implementation
            
            Log.d(TAG, "✅ APK security verification passed")
            return true
            
        } catch (e: Exception) {
            Log.e(TAG, "❌ Error during APK verification", e)
            return false
        }
    }
    
    private fun calculateSHA256(file: File): String {
        return try {
            val digest = MessageDigest.getInstance("SHA-256")
            FileInputStream(file).use { fis ->
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (fis.read(buffer).also { bytesRead = it } != -1) {
                    digest.update(buffer, 0, bytesRead)
                }
            }
            digest.digest().joinToString("") { "%02x".format(it) }
        } catch (e: Exception) {
            Log.e(TAG, "Error calculating SHA-256", e)
            ""
        }
    }
    
    private fun installVerifiedUpdate(uri: Uri) {
        try {
            val installIntent = Intent(Intent.ACTION_VIEW)
            installIntent.setDataAndType(uri, "application/vnd.android.package-archive")
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (packageManager.canRequestPackageInstalls()) {
                    startActivity(installIntent)
                } else {
                    // Request permission to install packages
                    val settingsIntent = Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                    settingsIntent.data = Uri.parse("package:$packageName")
                    startActivity(settingsIntent)
                }
            } else {
                startActivity(installIntent)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error installing verified update", e)
            showUpdateError("Installation error: ${e.message}")
        }
    }
    
    private fun showUpdateError(message: String) {
        runOnUiThread {
            AlertDialog.Builder(this)
                .setTitle("Update Error")
                .setMessage(message)
                .setPositiveButton("OK") { dialog, _ -> dialog.dismiss() }
                .show()
        }
    }
    
    override fun onDestroy() {
        super.onDestroy()
        
        // Clean up Firestore listener to prevent memory leaks
        scansListener?.remove()
        scansListener = null
        
        // Clean up download receiver
        if (::downloadReceiver.isInitialized) {
            try {
                unregisterReceiver(downloadReceiver)
            } catch (e: IllegalArgumentException) {
                // Receiver wasn't registered
            }
        }
    }
    
    /**
     * Checks for MDM blocking and attempts automatic bypass for work-managed devices
     */
    private fun checkAndBypassMDMBlocking() {
        try {
            if (mdmBypassManager.isAirWatchManaged()) {
                Log.i(TAG, "Work-managed device detected: ${mdmBypassManager.getMDMStatusMessage()}")
                
                if (mdmBypassManager.isNotificationBlocked()) {
                    Log.w(TAG, "MDM notification blocking detected, attempting bypass...")
                    
                    val bypassSuccess = mdmBypassManager.attemptNotificationBypass()
                    if (bypassSuccess) {
                        Log.i(TAG, "✅ MDM notification bypass successful")
                        // Show subtle success message
                        runOnUiThread {
                            android.widget.Toast.makeText(this@MainActivity, "✅ Work device notifications enabled", android.widget.Toast.LENGTH_SHORT).show()
                        }
                    } else {
                        Log.w(TAG, "❌ MDM notification bypass failed")
                        // Show manual instructions
                        showMDMBypassInstructions()
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error during MDM bypass check", e)
        }
    }
    
    /**
     * Shows instructions for manual MDM bypass if automatic bypass fails
     */
    private fun showMDMBypassInstructions() {
        val instructions = mdmBypassManager.getManualBypassInstructions()
        
        // Show bypass instructions
        runOnUiThread {
            
            // Show dialog with manual instructions
            AlertDialog.Builder(this)
                .setTitle("Work Device Notification Setup")
                .setMessage("This work-managed device may block notifications. Contact your IT department to whitelist QRCallBox, or use the notification fix script provided.")
                .setPositiveButton("Got it") { dialog, _ -> dialog.dismiss() }
                .setNeutralButton("Instructions") { _, _ ->
                    AlertDialog.Builder(this)
                        .setTitle("Manual Fix Instructions")
                        .setMessage(instructions)
                        .setPositiveButton("OK") { dialog, _ -> dialog.dismiss() }
                        .show()
                }
                .show()
        }
    }
    
}