package com.stable.qrcallbox.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.Timestamp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessaging
import com.stable.qrcallbox.R
import com.stable.qrcallbox.databinding.ActivityLoginBinding
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

class LoginActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityLoginBinding
    private lateinit var auth: FirebaseAuth
    private lateinit var firestore: FirebaseFirestore
    private lateinit var googleSignInClient: GoogleSignInClient
    
    private var isRegistrationMode = false
    
    companion object {
        private const val TAG = "LoginActivity"
        private const val RC_SIGN_IN = 9001
    }
    
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            Log.d(TAG, "Notification permission granted")
        } else {
            Toast.makeText(
                this,
                "Notifications are required for customer assistance alerts",
                Toast.LENGTH_LONG
            ).show()
        }
    }
    
    private val googleSignInLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            firebaseAuthWithGoogle(account.idToken!!)
        } catch (e: ApiException) {
            Log.w(TAG, "Google sign in failed", e)
            Toast.makeText(this, "Google sign-in failed", Toast.LENGTH_SHORT).show()
        }
    }
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        auth = FirebaseAuth.getInstance()
        firestore = FirebaseFirestore.getInstance()
        
        // Configure Google Sign-In
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(getString(R.string.default_web_client_id))
            .requestEmail()
            .build()
        
        googleSignInClient = GoogleSignIn.getClient(this, gso)
        
        // Check if user is already logged in
        if (auth.currentUser != null) {
            // Update FCM token for this device even if already logged in
            lifecycleScope.launch(Dispatchers.IO) {
                updateFCMToken(auth.currentUser!!.uid)
                withContext(Dispatchers.Main) {
                    navigateToMain()
                }
            }
            return
        }
        
        setupClickListeners()
        requestNotificationPermission()
    }
    
    private fun setupClickListeners() {
        binding.loginButton.setOnClickListener {
            Log.d(TAG, "🔘 Login button clicked! isRegistrationMode: $isRegistrationMode")
            if (validateInput()) {
                Log.d(TAG, "🔘 Input validation passed")
                if (isRegistrationMode) {
                    Log.d(TAG, "🔘 Starting registration process")
                    registerUser()
                } else {
                    Log.d(TAG, "🔘 Starting login process")
                    loginUser()
                }
            } else {
                Log.d(TAG, "🔘 Input validation failed")
            }
        }
        
        binding.toggleModeTextView.setOnClickListener {
            toggleMode()
        }
        
        binding.googleSignInButton.setOnClickListener {
            Log.d(TAG, "🔘 Google Sign-In button clicked!")
            signInWithGoogle()
        }
    }
    
    private fun toggleMode() {
        isRegistrationMode = !isRegistrationMode
        
        if (isRegistrationMode) {
            binding.loginButton.text = "Register"
            binding.toggleModeTextView.text = "Already have an account? Login"
            binding.registrationFieldsLayout.visibility = View.VISIBLE
            binding.confirmPasswordLayout.visibility = View.VISIBLE
        } else {
            binding.loginButton.text = "Login"
            binding.toggleModeTextView.text = "Don't have an account? Register"
            binding.registrationFieldsLayout.visibility = View.GONE
            binding.confirmPasswordLayout.visibility = View.GONE
        }
    }
    
    private fun validateInput(): Boolean {
        val email = binding.emailEditText.text.toString().trim()
        val password = binding.passwordEditText.text.toString()
        
        if (email.isEmpty()) {
            binding.emailEditText.error = "Email is required"
            return false
        }
        
        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            binding.emailEditText.error = "Please enter a valid email"
            return false
        }
        
        if (password.isEmpty()) {
            binding.passwordEditText.error = "Password is required"
            return false
        }
        
        if (password.length < 6) {
            binding.passwordEditText.error = "Password must be at least 6 characters"
            return false
        }
        
        if (isRegistrationMode) {
            val confirmPassword = binding.confirmPasswordEditText.text.toString()
            
            if (password != confirmPassword) {
                binding.confirmPasswordEditText.error = "Passwords do not match"
                return false
            }
            
            val firstName = binding.firstNameEditText.text.toString().trim()
            val lastName = binding.lastNameEditText.text.toString().trim()
            val storeNumber = binding.storeNumberEditText.text.toString().trim()
            
            if (firstName.isEmpty()) {
                binding.firstNameEditText.error = "First name is required"
                return false
            }
            
            if (lastName.isEmpty()) {
                binding.lastNameEditText.error = "Last name is required"
                return false
            }
            
            if (storeNumber.isEmpty()) {
                binding.storeNumberEditText.error = "Store number is required"
                return false
            }
            
            val normalizedStoreNumber = normalizeStoreNumber(storeNumber)
            if (normalizedStoreNumber.isEmpty()) {
                binding.storeNumberEditText.error = "Please enter a valid store number"
                return false
            }
        }
        
        return true
    }
    
    private fun loginUser() {
        val email = binding.emailEditText.text.toString().trim()
        val password = binding.passwordEditText.text.toString()
        
        Log.d(TAG, "🚀 loginUser() called with email: ${email.take(5)}...")
        showLoading(true)
        
        lifecycleScope.launch(Dispatchers.IO) {
            Log.d(TAG, "🚀 Inside loginUser coroutine")
            try {
                val authResult = auth.signInWithEmailAndPassword(email, password).await()
                val user = authResult.user
                
                if (user != null) {
                    // Update FCM token
                    updateFCMToken(user.uid)
                    
                    withContext(Dispatchers.Main) {
                        showLoading(false)
                        navigateToMain()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showLoading(false)
                    Toast.makeText(
                        this@LoginActivity,
                        "Login failed: ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
                Log.e(TAG, "Login error", e)
            }
        }
    }
    
    private fun registerUser() {
        val email = binding.emailEditText.text.toString().trim()
        val password = binding.passwordEditText.text.toString()
        val firstName = capitalizeFirstLetter(binding.firstNameEditText.text.toString().trim())
        val lastName = capitalizeFirstLetter(binding.lastNameEditText.text.toString().trim())
        val fullName = "$firstName $lastName"
        val storeNumber = normalizeStoreNumber(binding.storeNumberEditText.text.toString().trim())
        
        showLoading(true)
        
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                // Create auth account
                val authResult = auth.createUserWithEmailAndPassword(email, password).await()
                val userId = authResult.user?.uid ?: throw Exception("User ID is null")
                
                // Get FCM token
                val fcmToken = try {
                    FirebaseMessaging.getInstance().token.await()
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to get FCM token", e)
                    ""
                }
                
                // Create user document in Firestore
                val userDoc = hashMapOf(
                    "userId" to userId,
                    "email" to email,
                    "firstName" to firstName,
                    "lastName" to lastName,
                    "fullName" to fullName,
                    "storeNumber" to storeNumber,
                    "role" to "user",
                    "fcmToken" to fcmToken,
                    "isOnShift" to false,
                    "createdAt" to Timestamp.now(),
                    "groupMeId" to "",
                    "notificationsEnabled" to true,
                    "respectDoNotDisturb" to true
                )
                
                firestore.collection("users")
                    .document(userId)
                    .set(userDoc)
                    .await()
                
                withContext(Dispatchers.Main) {
                    showLoading(false)
                    Toast.makeText(
                        this@LoginActivity,
                        "Registration successful!",
                        Toast.LENGTH_SHORT
                    ).show()
                    navigateToMain()
                }
                
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showLoading(false)
                    Toast.makeText(
                        this@LoginActivity,
                        "Registration failed: ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
                Log.e(TAG, "Registration error", e)
            }
        }
    }
    
    private suspend fun updateFCMToken(userId: String) {
        var retryCount = 0
        val maxRetries = 3
        
        while (retryCount < maxRetries) {
            try {
                val token = FirebaseMessaging.getInstance().token.await()
                if (token.isNotBlank()) {
                    firestore.collection("users")
                        .document(userId)
                        .update("fcmToken", token)
                        .await()
                    Log.d(TAG, "FCM token updated for user: $userId")
                    return
                } else {
                    Log.w(TAG, "FCM token is blank, retry attempt ${retryCount + 1}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to update FCM token (attempt ${retryCount + 1})", e)
            }
            
            retryCount++
            if (retryCount < maxRetries) {
                kotlinx.coroutines.delay(1000L * retryCount) // Exponential backoff
            }
        }
        
        Log.e(TAG, "Failed to update FCM token after $maxRetries attempts for user: $userId")
    }
    
    private fun showLoading(show: Boolean) {
        binding.progressBar.visibility = if (show) View.VISIBLE else View.GONE
        binding.loginButton.isEnabled = !show
        binding.toggleModeTextView.isEnabled = !show
    }
    
    private fun navigateToMain() {
        val intent = Intent(this, MainActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
    
    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
    
    private fun signInWithGoogle() {
        Log.d(TAG, "🚀 signInWithGoogle() called")
        val signInIntent = googleSignInClient.signInIntent
        Log.d(TAG, "🚀 Launching Google Sign-In intent")
        googleSignInLauncher.launch(signInIntent)
    }
    
    private fun firebaseAuthWithGoogle(idToken: String) {
        showLoading(true)
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val authResult = auth.signInWithCredential(credential).await()
                val user = authResult.user ?: throw Exception("User is null")
                
                // Check if user exists in Firestore
                val userDoc = firestore.collection("users")
                    .document(user.uid)
                    .get()
                    .await()
                
                if (!userDoc.exists()) {
                    // New Google user - need to complete registration
                    withContext(Dispatchers.Main) {
                        showLoading(false)
                        showGoogleUserRegistration(user.displayName, user.email)
                    }
                } else {
                    // Existing user - update FCM token and login
                    updateFCMToken(user.uid)
                    withContext(Dispatchers.Main) {
                        showLoading(false)
                        navigateToMain()
                    }
                }
                
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    showLoading(false)
                    Toast.makeText(
                        this@LoginActivity,
                        "Google sign-in failed: ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                }
                Log.e(TAG, "Google auth error", e)
            }
        }
    }
    
    private fun showGoogleUserRegistration(displayName: String?, email: String?) {
        // Pre-fill registration form with Google data
        val nameParts = displayName?.split(" ") ?: listOf()
        binding.firstNameEditText.setText(nameParts.firstOrNull() ?: "")
        binding.lastNameEditText.setText(nameParts.drop(1).joinToString(" "))
        binding.emailEditText.setText(email ?: "")
        binding.emailEditText.isEnabled = false // Don't allow changing Google email
        
        // Switch to registration mode
        if (!isRegistrationMode) {
            toggleMode()
        }
        
        Toast.makeText(
            this,
            "Please complete your registration with store information",
            Toast.LENGTH_LONG
        ).show()
    }
    
    private fun capitalizeFirstLetter(text: String): String {
        return text.lowercase().replaceFirstChar { 
            if (it.isLowerCase()) it.titlecase() else it.toString() 
        }
    }
    
    private fun normalizeStoreNumber(storeNumber: String): String {
        // Remove leading zeros and validate
        val normalized = storeNumber.toIntOrNull()?.toString() ?: ""
        return if (normalized.isNotEmpty() && normalized.length <= 4) {
            normalized
        } else {
            ""
        }
    }
}