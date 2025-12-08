# Store Switching Feature - Implementation Guide

## Overview
Add store selection capability to the QRCall Android app, allowing market managers and regional users to switch between their allowed stores and receive notifications only from their actively selected store.

## Problem Statement
**Current Issue**: Users with multiple stores in `allowedStores` array cannot:
- Choose which store they're currently monitoring
- See scans from non-primary stores
- Receive targeted notifications based on their current location

**Impact**: Market/regional managers must use multiple devices or accounts to monitor different stores.

## Solution Architecture

### Database Schema Changes

#### Firestore `users` Collection
```javascript
{
  // Existing fields
  storeNumber: 1234,              // Primary/default store (required)
  allowedStores: [1234, 5678, 9012],  // Accessible stores
  homeStore: 1234,                // Legacy field

  // NEW FIELDS
  activeStore: 5678,              // Currently monitoring store (Android)
  activeStoreUpdatedAt: Timestamp, // Last time activeStore was changed
  storePreferences: {             // Per-store notification settings
    "1234": {
      notifications: true,
      lastVisited: Timestamp
    },
    "5678": {
      notifications: true,
      lastVisited: Timestamp
    },
    "9012": {
      notifications: false,
      lastVisited: Timestamp
    }
  }
}
```

**Migration Strategy**:
- `activeStore` defaults to `storeNumber` for existing users
- `allowedStores` is created from `storeNumber` if missing
- Backend handles missing `activeStore` gracefully (fallback to `storeNumber`)

### Android App Components

#### 1. User Model Extension (`models/User.kt`)
```kotlin
data class User(
    val uid: String = "",
    val firstName: String = "",
    val lastName: String = "",
    val email: String = "",
    val storeNumber: String = "",
    val homeStore: String? = null,
    val allowedStores: List<String> = emptyList(),  // NEW
    val activeStore: String? = null,                 // NEW
    val jobTitle: String = "",
    val phone: String = "",
    val fcmToken: String? = null,
    val workSchedule: Map<String, WorkDay>? = null,
    val notificationsEnabled: Boolean = true,
    val respectDoNotDisturb: Boolean = true
) {
    // Helper function to get current monitoring store
    fun getActiveStoreNumber(): String {
        return activeStore ?: storeNumber
    }

    // Check if user has multi-store access
    fun hasMultipleStores(): Boolean {
        return allowedStores.isNotEmpty() && allowedStores.size > 1
    }

    // Validate if store is accessible
    fun canAccessStore(store: String): Boolean {
        return allowedStores.contains(store) || storeNumber == store
    }
}
```

#### 2. Store Selector UI Component (`ui/StoreSelector.kt`)
```kotlin
@Composable
fun StoreSelectorDropdown(
    currentStore: String,
    allowedStores: List<String>,
    onStoreSelected: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }

    Box(modifier = modifier) {
        OutlinedButton(
            onClick = { expanded = true },
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = Color.White
            )
        ) {
            Icon(
                imageVector = Icons.Default.Store,
                contentDescription = "Select Store"
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Store: $currentStore")
            Icon(
                imageVector = Icons.Default.ArrowDropDown,
                contentDescription = "Expand"
            )
        }

        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            allowedStores.forEach { store ->
                DropdownMenuItem(
                    text = {
                        Row(
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            if (store == currentStore) {
                                Icon(
                                    imageVector = Icons.Default.CheckCircle,
                                    contentDescription = "Selected",
                                    tint = Color(0xFF4CAF50),
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                            }
                            Text("Store $store")
                        }
                    },
                    onClick = {
                        onStoreSelected(store)
                        expanded = false
                    }
                )
            }
        }
    }
}
```

#### 3. MainActivity Integration

**App Bar Addition**:
```kotlin
TopAppBar(
    title = { Text("QRCall Box") },
    actions = {
        // Only show if user has multiple stores
        if (currentUser?.hasMultipleStores() == true) {
            StoreSelectorDropdown(
                currentStore = currentUser.getActiveStoreNumber(),
                allowedStores = currentUser.allowedStores,
                onStoreSelected = { newStore ->
                    switchActiveStore(newStore)
                }
            )
        }
    }
)
```

**Store Switching Logic**:
```kotlin
private fun switchActiveStore(newStore: String) {
    val currentUser = currentUser ?: return

    if (!currentUser.canAccessStore(newStore)) {
        Toast.makeText(
            this,
            "You don't have access to store $newStore",
            Toast.LENGTH_SHORT
        ).show()
        return
    }

    Log.d(TAG, "Switching active store from ${currentUser.getActiveStoreNumber()} to $newStore")

    // Update Firestore
    val userId = auth.currentUser?.uid ?: return
    firestore.collection("users").document(userId)
        .update(
            mapOf(
                "activeStore" to newStore,
                "activeStoreUpdatedAt" to FieldValue.serverTimestamp(),
                "storePreferences.$newStore.lastVisited" to FieldValue.serverTimestamp()
            )
        )
        .addOnSuccessListener {
            Log.d(TAG, "✅ Active store updated to $newStore")

            // Update local user object
            loadUserData()

            // Refresh scan listener with new store
            setupRealtimeScanListener()

            // Show confirmation
            Toast.makeText(
                this,
                "Now monitoring Store $newStore",
                Toast.LENGTH_SHORT
            ).show()
        }
        .addOnFailureListener { e ->
            Log.e(TAG, "❌ Failed to update active store", e)
            Toast.makeText(
                this,
                "Failed to switch store: ${e.message}",
                Toast.LENGTH_SHORT
            ).show()
        }
}
```

**Firestore Query Update**:
```kotlin
private fun setupRealtimeScanListener() {
    scanListenerRegistration?.remove()

    val currentUser = currentUser ?: return
    val activeStore = currentUser.getActiveStoreNumber()

    Log.d(TAG, "Setting up real-time listener for active store: $activeStore")

    scanListenerRegistration = firestore.collection("scans")
        .whereEqualTo("storeNumber", activeStore)  // Use activeStore instead of storeNumber
        .whereEqualTo("status", "pending")
        .orderBy("timestamp", Query.Direction.DESCENDING)
        .limit(50)
        .addSnapshotListener { snapshots, error ->
            if (error != null) {
                Log.e(TAG, "Listen failed.", error)
                return@addSnapshotListener
            }

            val scans = snapshots?.documents?.mapNotNull { doc ->
                doc.toObject(Scan::class.java)?.copy(id = doc.id)
            } ?: emptyList()

            updateScansList(scans)
        }
}
```

#### 4. Settings Screen Enhancement (`ui/SettingsActivity.kt`)

**New Section: Store Management**:
```kotlin
// Add to settings layout
Card(
    modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp)
) {
    Column(modifier = Modifier.padding(16.dp)) {
        Text(
            "Store Access",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            "Primary Store: ${currentUser?.storeNumber}",
            style = MaterialTheme.typography.bodyMedium
        )

        if (currentUser?.hasMultipleStores() == true) {
            Spacer(modifier = Modifier.height(8.dp))

            Text(
                "Allowed Stores:",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold
            )

            currentUser.allowedStores.forEach { store ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Store $store")

                    Switch(
                        checked = getStoreNotificationPreference(store),
                        onCheckedChange = { enabled ->
                            updateStoreNotificationPreference(store, enabled)
                        }
                    )
                }
            }

            Text(
                "Enable/disable notifications for each store",
                style = MaterialTheme.typography.bodySmall,
                color = Color.Gray
            )
        }
    }
}
```

### Backend Modifications

#### 1. Update Notification Targeting (`functions/index.js`)

```javascript
async function sendAndroidNotification(store, area, scanId = null) {
  try {
    logger.info(`Starting Android notification for store ${store}, area ${area}`);

    // Query users who have this store as their ACTIVE monitoring store
    // This respects the user's current store selection in the app
    let usersSnapshot = await db.collection("users")
      .where("activeStore", "==", parseInt(store))
      .get();

    if (usersSnapshot.empty) {
      logger.info(`No users with activeStore=${store} (number). Trying string...`);
      usersSnapshot = await db.collection("users")
        .where("activeStore", "==", String(store))
        .get();
    }

    // Fallback: If no users have activeStore set, use primary storeNumber
    // This ensures backwards compatibility with existing users
    if (usersSnapshot.empty) {
      logger.info(`No users with activeStore=${store}. Falling back to storeNumber...`);
      usersSnapshot = await db.collection("users")
        .where("storeNumber", "==", parseInt(store))
        .get();

      if (usersSnapshot.empty) {
        usersSnapshot = await db.collection("users")
          .where("storeNumber", "==", String(store))
          .get();
      }
    }

    if (usersSnapshot.empty) {
      logger.info(`No users found monitoring store ${store}`);
      return;
    }

    logger.info(`Found ${usersSnapshot.docs.length} users actively monitoring store ${store}`);

    // Continue with existing notification logic...
    // Check shift status, FCM tokens, etc.
  }
}
```

#### 2. New Admin Endpoint: Set User Active Store

```javascript
export const adminSetUserActiveStore = onRequest({
  region: REGION,
  cors: { origin: ALLOWED_ORIGINS },
  invoker: "public"
}, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");

    const decodedToken = await authenticateUser(req);
    if (!(await isAdmin(decodedToken.uid))) {
      return res.status(403).send("Admin access required");
    }

    const { user_id, active_store } = req.body;
    if (!user_id || !active_store) {
      return res.status(400).send("Missing user_id or active_store");
    }

    // Get user to validate they have access to this store
    const userDoc = await db.collection("users").doc(user_id).get();
    if (!userDoc.exists) {
      return res.status(404).send("User not found");
    }

    const userData = userDoc.data();
    const allowedStores = userData.allowedStores || [userData.storeNumber];

    if (!allowedStores.includes(parseInt(active_store)) &&
        !allowedStores.includes(String(active_store))) {
      return res.status(403).send("User does not have access to this store");
    }

    await db.collection("users").doc(user_id).update({
      activeStore: active_store,
      activeStoreUpdatedAt: FieldValue.serverTimestamp()
    });

    res.json({ success: true, message: `Active store set to ${active_store}` });

  } catch (error) {
    logger.error("Admin set active store error:", error);
    res.status(500).send("Internal server error: " + error.message);
  }
});
```

### Migration Plan

#### Phase 1: Backend Preparation (Deploy First)
1. Deploy updated `sendAndroidNotification` with activeStore support
2. Add backward compatibility fallbacks
3. Deploy admin endpoint for testing

#### Phase 2: Android App Update (v1.8.0)
1. Update User model with new fields
2. Add store selector UI component
3. Implement store switching logic
4. Update Firestore queries
5. Add settings screen enhancements
6. Test thoroughly with multi-store accounts

#### Phase 3: Data Migration
```javascript
// One-time migration script
async function migrateUsersToActiveStore() {
  const usersSnapshot = await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();

    // Set activeStore to storeNumber if not already set
    if (!userData.activeStore) {
      const updates = {
        activeStore: userData.storeNumber,
        activeStoreUpdatedAt: FieldValue.serverTimestamp()
      };

      // Initialize allowedStores if missing
      if (!userData.allowedStores || userData.allowedStores.length === 0) {
        updates.allowedStores = [userData.storeNumber];
      }

      await db.collection("users").doc(userDoc.id).update(updates);
    }
  }
}
```

### Testing Checklist

#### Backend Tests
- [ ] Users with activeStore get notifications for correct store
- [ ] Users without activeStore fall back to storeNumber
- [ ] Multiple users can monitor same store
- [ ] No ghost notifications (users only notified for accessible stores)

#### Android App Tests
- [ ] Store selector only appears for multi-store users
- [ ] Store switching updates Firestore correctly
- [ ] Scan list refreshes after store switch
- [ ] Notifications received only for active store
- [ ] Settings show all allowed stores
- [ ] Per-store notification preferences work
- [ ] App handles missing activeStore field gracefully

#### Admin Panel Tests
- [ ] allowedStores editable in UserManagement
- [ ] Admin can set user's activeStore
- [ ] Validation prevents setting unauthorized stores

### UI/UX Considerations

**Store Selector Placement**:
- Top app bar (always visible)
- Material Design 3 styling
- Dropdown with checkmark on selected store
- Smooth transition animation

**User Education**:
- First-time tooltip: "You have access to multiple stores. Select which one you're monitoring."
- Settings explanation: "You'll only receive notifications from your selected store."
- Toast confirmation: "Now monitoring Store 1234"

**Error Handling**:
- Network failures: Retry with exponential backoff
- Permission denied: Clear error message
- Invalid store selection: Validation with user feedback

### Performance Considerations

**Firestore Query Optimization**:
- Index on `activeStore` field (composite with `fcmToken`)
- Limit scan queries to 50 most recent
- Cache user's store list locally

**Battery Impact**:
- Store switching doesn't increase battery usage
- Same single-listener pattern maintained
- No background polling required

### Future Enhancements

**Phase 4: Advanced Features**
- Store groups (e.g., "My East Region Stores")
- Quick store switching widget
- Store-specific shift schedules
- Notification sound per store
- Analytics: Time spent monitoring each store
- Multi-store dashboard view (see all stores at once)

## Implementation Timeline

**Week 1**:
- Backend updates and deployment
- Android model changes
- Basic store selector UI

**Week 2**:
- Complete Android implementation
- Testing and bug fixes
- Admin panel updates

**Week 3**:
- User testing with market managers
- Performance optimization
- Documentation updates

**Week 4**:
- Production deployment
- User training materials
- Monitor feedback

## Success Metrics

- Zero ghost notifications reported
- Market managers actively using store switching
- Reduced support tickets about multi-store access
- Improved response times across all stores
- Positive user feedback on feature usability

---

**Created**: 2025-01-11
**Version**: 1.0
**Author**: QRCall Development Team
**Status**: Ready for Implementation
