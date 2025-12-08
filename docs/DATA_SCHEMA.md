# QRCall Data Schema Reference

**Last Updated**: October 28, 2025

This document defines the canonical data schema for all QRCall platforms. **ALL field names, types, and structures must match across Web, Android, and Backend**.

---

## Critical Rule: Cross-Platform Consistency

Before modifying ANY data structure:
1. ✅ Check this document for existing field names
2. ✅ Update ALL platforms simultaneously (Web + Android + Backend)
3. ✅ Update this document with changes
4. ✅ Test data flow across all platforms

---

## Collections Overview

| Collection | Purpose | Used By |
|------------|---------|---------|
| `scans` | Customer QR scan events | Web, Android, Backend |
| `users` | User profiles and settings | Web, Android, Backend |
| `logs` | System activity logs | Web, Backend |
| `support_tickets` | User support requests | Web, Backend |
| `groupme_bots` | GroupMe bot registry | Web, Backend |
| `groupme_tokens` | OAuth tokens | Web, Backend |
| `blocked_ips` | IP blocking | Web, Backend |
| `qr_tokens` | QR code tokens | Backend |

---

## Collection: `scans`

**Purpose**: QR code scan events and assistance tracking

### Core Fields

| Field | Type | Required | Used By | Description |
|-------|------|----------|---------|-------------|
| `scanId` | string | Yes | All | Unique scan identifier |
| `storeNumber` | string | Yes | All | Store where scan occurred (always string) |
| `timestamp` | Timestamp | Yes | All | When customer scanned QR |
| `timestampMs` | number | No | Android | Millisecond timestamp for sorting |
| `qrCode` | string | Yes | All | QR token that was scanned |
| `areaDescription` | string | Yes | All | Store area/location |
| `ipAddress` | string | No | Backend | Scanner IP (security) |
| `status` | string | Yes | All | "pending", "claimed", "resolved" |

### Response Tracking Fields

| Field | Type | Required | Used By | Description |
|-------|------|----------|---------|-------------|
| `claimedBy` | string | No | All | **User ID who claimed (Firebase UID)** |
| `claimedByName` | string | No | All | **Display name of responder** ⚠️ CRITICAL |
| `claimedAt` | Timestamp | No | All | **When assistance was claimed** |
| `responses` | array | No | All | Array of response entries (see below) |

⚠️ **CRITICAL FIELDS**: `claimedBy`, `claimedByName`, `claimedAt` are used by:
- **Web**: Dashboard, TopResponders component
- **Android**: Recent Customer Requests, Assist buttons
- **Backend**: Notification coordination, analytics

### Response Entry Structure

```javascript
{
  respondedAt: Timestamp,        // When response occurred
  responderName: string,          // Who responded
  responderUserId: string,        // Firebase UID
  responseText: string,           // Response message
  responseSource: string          // "groupme", "android", "web"
}
```

### Android Model Reference
**File**: `app/src/main/java/com/stable/qrcallbox/models/ScanNotification.kt`

```kotlin
data class ScanNotification(
    val scanId: String = "",
    val storeNumber: String = "",
    val timestamp: Timestamp? = null,
    val timestampMs: Long = 0L,
    val areaDescription: String = "",
    val status: String = "pending",
    val claimedBy: String = "",           // ✅ Matches backend
    val claimedByName: String = "",       // ✅ Matches backend
    val claimedAt: Timestamp? = null,     // ✅ Matches backend
    val responses: List<Map<String, Any>> = emptyList()
)
```

### Backend Write Locations
- `functions/index.js` line 5571: `claimedByName` set during assist
- `functions/index.js` line 7229: `claimedByName` set during GroupMe backfill

### Web Read Locations
- `src/app.jsx` line ~891: TopResponders reads `claimedByName`
- `src/app.jsx` line ~758: Dashboard reads `scans` collection for daily stats
- `src/Heatmap.jsx`: Reads scan data for analytics

---

## Collection: `users`

**Purpose**: User profiles, store assignments, work schedules

### Core Fields

| Field | Type | Required | Used By | Description |
|-------|------|----------|---------|-------------|
| `userId` | string | Yes | All | Firebase UID |
| `email` | string | Yes | All | User email |
| `firstName` | string | Yes | All | First name |
| `lastName` | string | Yes | All | Last name |
| `fullName` | string | No | Backend | Computed full name |
| `jobTitle` | string | No | All | Job title/position |
| `phone` | string | No | All | Contact phone |
| `role` | string | Yes | All | "user", "admin", "manager" |
| `approved` | boolean | Yes | All | Account approval status |

### Store Assignment Fields

| Field | Type | Required | Used By | Description |
|-------|------|----------|---------|-------------|
| `storeNumber` | string/number | Yes | All | **Primary store** ⚠️ CRITICAL |
| `homeStore` | string/number | No | All | Legacy home store (deprecated) |
| `allowedStores` | array | No | All | Stores user can access |
| `activeStore` | string/number | No | Android | Currently monitoring store |
| `activeStoreUpdatedAt` | Timestamp | No | Backend | Last store switch time |

⚠️ **TYPE WARNING**: `storeNumber` can be String OR Number in Firestore. Always handle both types:

**Android Handling**:
```kotlin
private val storeNumber: Any? = null

fun getStoreNumber(): String {
    return when (storeNumber) {
        is String -> storeNumber
        is Number -> storeNumber.toString()
        else -> ""
    }
}
```

**Web Handling**:
```javascript
const store = typeof storeNumber === 'string' ? storeNumber : String(storeNumber);
```

### Notification Fields

| Field | Type | Required | Used By | Description |
|-------|------|----------|---------|-------------|
| `fcmToken` | string | No | Android, Backend | Firebase Cloud Messaging token |
| `fcmTokenUpdatedAt` | Timestamp | No | Backend | Token refresh tracking |
| `notificationsEnabled` | boolean | Yes | Android | Master notification toggle |
| `respectDoNotDisturb` | boolean | Yes | Android | Honor DND settings |
| `notificationAreas` | array | No | iOS, Backend | Areas user wants notifications for (empty = all areas) |

⚠️ **Area Notification Filtering**:
- If `notificationAreas` is empty or doesn't exist, user receives notifications for ALL areas
- If `notificationAreas` has values, user only receives notifications for scans in those specific areas
- This field is case-sensitive and must match `areaDescription` exactly
- iOS app provides UI for users to select their preferred areas
- Admin panel displays and allows editing of area preferences

### Work Schedule Structure

```javascript
workSchedule: {
  monday: {
    isWorkingDay: boolean,
    startHour: number (0-23),
    startMinute: number (0, 15, 30, 45),
    endHour: number (0-23),
    endMinute: number (0, 15, 30, 45)
  },
  // ... tuesday through sunday
}
```

### Android Model Reference
**File**: `app/src/main/java/com/stable/qrcallbox/models/User.kt`

```kotlin
data class User(
    val userId: String = "",
    val email: String = "",
    val firstName: String = "",
    val lastName: String = "",
    private val storeNumber: Any? = null,      // ✅ Handles String/Number
    private val activeStore: Any? = null,       // ✅ Multi-store support
    val allowedStores: List<Any> = emptyList(), // ✅ Multi-store support
    val role: String = "user",
    val fcmToken: String = "",
    val notificationsEnabled: Boolean = true,
    val workSchedule: WorkSchedule = WorkSchedule()
)
```

---

## Collection: `logs`

**Purpose**: System activity logging and analytics

### Core Fields

| Field | Type | Required | Used By | Description |
|-------|------|----------|---------|-------------|
| `ts` | Timestamp | Yes | Web, Backend | Log entry timestamp |
| `timestamp` | Timestamp | No | Web | Activity timestamp |
| `store` | string/number | No | Web | Store-specific filtering |
| `action` | string | No | Web | "auto_blocked", "manual_block", etc |
| `ip` | string | No | Backend | IP address |
| `userAgent` | string | No | Backend | Browser/client info |
| `token` | string | No | Backend | QR token involved |

⚠️ **DEPRECATED FIELDS**: The following fields in `logs` are NO LONGER USED:
- `respondedAt` - Now only in `scans` collection
- `responderName` - Now only in `scans.claimedByName`
- `responseTimeSeconds` - Calculated from `scans.timestamp` and `scans.claimedAt`

### Historical Context
Prior to October 2025, response tracking was split between `logs` and `scans`. This caused the TopResponders bug. All response data is now exclusively in `scans`.

---

## Collection: `support_tickets`

**Purpose**: User support ticket system

### Fields

| Field | Type | Required | Used By | Description |
|-------|------|----------|---------|-------------|
| `userId` | string | Yes | Web | Ticket creator UID |
| `email` | string | Yes | Web | User email |
| `submittedAt` | Timestamp | Yes | Web | Creation time |
| `subject` | string | Yes | Web | Ticket subject |
| `description` | string | Yes | Web | Issue description |
| `status` | string | Yes | Web | "open", "in_progress", "resolved", "closed" |
| `priority` | string | Yes | Web | "low", "medium", "high", "urgent" |
| `responses` | array | No | Web | Admin responses |

---

## Collection: `groupme_bots`

**Purpose**: GroupMe bot registry

### Fields

| Field | Type | Required | Used By | Description |
|-------|------|----------|---------|-------------|
| `firebase_uid` | string | Yes | Web, Backend | Bot owner UID |
| `bot_id` | string | Yes | Backend | GroupMe bot ID |
| `user_id` | string | Yes | Backend | GroupMe user ID |
| `name` | string | Yes | Web, Backend | Bot name (e.g., "CallBot Store 1458") |
| `store` | string/number | Yes | Backend | Associated store |
| `group_id` | string | Yes | Backend | GroupMe group ID |
| `createdAt` | Timestamp | Yes | Web | Creation time |
| `updatedAt` | Timestamp | Yes | Backend | Last update |
| `synced` | boolean | Yes | Backend | Sync status with GroupMe |

---

## Common Patterns & Best Practices

### 1. Store Number Handling

**ALWAYS handle both String and Number types**:

```javascript
// Backend (Node.js)
const storeNum = parseInt(store) || String(store);

// Web (JavaScript)
const storeNum = typeof store === 'string' ? store : String(store);

// Android (Kotlin)
fun getStoreNumber(): String {
    return when (storeNumber) {
        is String -> storeNumber
        is Number -> storeNumber.toString()
        else -> ""
    }
}
```

### 2. Timestamp Handling

**Firestore Timestamps across platforms**:

```javascript
// Backend write
timestamp: FieldValue.serverTimestamp()

// Web read
const date = timestamp.toDate();

// Android read
val date = timestamp?.toDate()
```

### 3. Response Time Calculation

**ALWAYS calculate from scan timestamp to claimed timestamp**:

```javascript
// Web
const responseTimeSeconds = Math.floor((claimedAt - timestamp) / 1000);

// Android
val responseTimeSeconds = ((claimedAt - timestamp) / 1000).toLong()
```

### 4. Field Naming Conventions

- **camelCase** for all field names
- **Timestamps** always named with `At` suffix: `createdAt`, `claimedAt`, `respondedAt`
- **IDs** always named with `Id` suffix: `scanId`, `userId`, `botId`
- **Boolean flags** named with `is` prefix: `isWorkingDay`, `isAdmin`

---

## Validation Checklist

Before pushing ANY data structure changes:

- [ ] Updated all 3 platforms (Web + Android + Backend)
- [ ] Tested data writes from each platform
- [ ] Tested data reads on each platform
- [ ] Verified type handling (String/Number conversion)
- [ ] Updated this DATA_SCHEMA.md document
- [ ] Added migration code if field renamed/removed
- [ ] Updated Firestore security rules if needed
- [ ] Updated Firestore indexes if needed

---

## User-Initiated Store Changes

**Added**: October 28, 2025

Users can now change their primary store number directly from the Settings screen in both Android and iOS apps.

### Implementation:
- **Android**: Settings → Store Assignment section
- **iOS/Flutter**: Settings → Store Assignment section
- **Method**: Free-form input (Option 1) - users can enter any store number
- **Validation**: Must be a positive integer
- **Effect**: Updates `storeNumber` field in Firestore

### Security Considerations:
- Currently unrestricted (users can change to any store)
- Monitor usage for abuse
- Future enhancement: Restrict to `allowedStores` array if needed
- Admin can override/correct via web admin panel

### Files Modified:
- **Android**: `activity_settings.xml`, `SettingsActivity.kt`
- **iOS/Flutter**: `settings_screen.dart`
- **Documentation**: `DATA_SCHEMA.md`

## Migration Notes

### October 2025: TopResponders Fix
- **Issue**: TopResponders queried `logs` collection for `responderName`
- **Fix**: Changed to query `scans` collection for `claimedByName`
- **Impact**: Web app only
- **Backward Compatible**: Yes

### January 2025: Multi-Store Support
- **Added Fields**: `activeStore`, `allowedStores`, `activeStoreUpdatedAt`
- **Impact**: Android app + Backend
- **Backward Compatible**: Yes (fallback to `storeNumber`)

---

## Quick Reference: Field Names by Platform

### Responder Tracking
| Concept | Web | Android | Backend |
|---------|-----|---------|---------|
| Who claimed | `claimedBy` | `claimedBy` | `claimedBy` |
| Responder name | `claimedByName` | `claimedByName` | `claimedByName` |
| When claimed | `claimedAt` | `claimedAt` | `claimedAt` |

### Store Assignment
| Concept | Web | Android | Backend |
|---------|-----|---------|---------|
| Primary store | `storeNumber` | `getStoreNumber()` | `storeNumber` |
| Active monitoring | `activeStore` | `getActiveStoreNumber()` | `activeStore` |
| Allowed access | `allowedStores` | `getAllowedStoresAsStrings()` | `allowedStores` |

### Timestamps
| Concept | Web | Android | Backend |
|---------|-----|---------|---------|
| Scan time | `timestamp` | `timestamp` | `timestamp` |
| Claim time | `claimedAt` | `claimedAt` | `claimedAt` |
| Creation time | `createdAt` | `createdAt` | `createdAt` |

---

## Contact

If you discover any data inconsistencies:
1. Document the issue
2. Update this schema document
3. Create PRs for all affected platforms
4. Deploy changes atomically (backend first, then web/Android)

**Maintainer**: Shane Smith (sinaptick@gmail.com)
**Last Schema Audit**: October 28, 2025
