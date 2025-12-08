
# QRCall System - Claude Development Guide

## ⚠️ CRITICAL: Data Schema Consistency

**BEFORE modifying any data structures, READ THIS:**

📋 **[DATA_SCHEMA.md](/docs/DATA_SCHEMA.md)** - Canonical reference for ALL field names and types

This project has **THREE platforms** (Web, Android, Backend) that MUST use identical field names. Always:
1. ✅ Check DATA_SCHEMA.md before adding/changing fields
2. ✅ Update ALL platforms simultaneously
3. ✅ Update DATA_SCHEMA.md with changes
4. ✅ Test cross-platform data flow

**Recent Bug Example (Fixed Dec 2025)**: TopResponders and Dashboard now query `scans` collection (not `logs`) using `claimedByName`, `claimedAt`, and `timestamp` fields. The `logs` collection is for activity tracking, NOT response analytics.

---

## Project Overview
QRCall is a comprehensive QR code management system for retail stores with multi-platform real-time notifications. The system allows stores to generate QR codes for customer callbacks and automatically notifies store employees via GroupMe, Workvivo, and native Android app notifications when customers scan the codes.

## Tech Stack
- **Frontend**: React 18 with Vite build system
- **Backend**: Firebase Cloud Functions (Node.js 22)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Hosting**: Firebase Hosting
- **Mobile**: Native Android app (Kotlin)
- **Notifications**: Firebase Cloud Messaging (FCM)
- **Integrations**: GroupMe API, Workvivo API
- **Styling**: Tailwind CSS with custom theming

## Key Architecture Components

### Frontend Structure (`/src/`)
- `app.jsx` - Main application component with tab navigation
- `components/admin/` - Admin panel components
  - `AdminPanel.jsx` - Main admin interface with sub-navigation
  - `GroupMeAdminPanel.jsx` - GroupMe bot management (store lookup, bot creation, overview)
  - `PendingChangesList.jsx` - Profile change approvals
- `hooks/` - Custom React hooks
- `config/` - Firebase and app configuration

### Backend Structure (`/functions/`)
- `index.js` - All Firebase Cloud Functions
- Key function groups:
  - **GroupMe Functions**: Bot management, webhooks, admin operations
  - **User Functions**: Authentication, profile management
  - **Ticket Functions**: Support ticket system
  - **Workvivo Functions**: Enterprise integration

### Android App Structure (`/Users/shanesmith/AndroidStudioProjects/QRCallBox/`)
- **Version: 1.8.11 (Latest production version)
- **Target SDK**: Android 14 (API 36), Min SDK: Android 7.0 (API 24)
- **Architecture**: MVVM with Firebase integration

#### Key Directories:
- `app/src/main/java/com/stable/qrcallbox/ui/` - UI Activities and Fragments  
- `app/src/main/java/com/stable/qrcallbox/services/` - FCM Messaging Service
- `app/src/main/java/com/stable/qrcallbox/utils/` - Notification handling utilities
- `app/src/main/java/com/stable/qrcallbox/models/` - Data models

#### Core Files:
- `MainActivity.kt` - Main interface with recent requests, assist buttons, real-time updates
- `LoginActivity.kt` - Firebase Auth integration with Google Sign-In
- `SettingsActivity.kt` - Auto-save work schedules and user preferences
- `QRCallMessagingService.kt` - FCM notification handler with action buttons
- `NotificationActionReceiver.kt` - Notification button actions (assist/ignore)
- `ScanAdapter.kt` - RecyclerView adapter with assist buttons and elapsed timers

#### Documentation:
- `README.md` - Comprehensive feature overview and technical architecture
- `CHANGELOG.md` - Detailed version history and release notes
- `DEV_TIME_LOG.md` - Development timeline and resource tracking

### Database Collections (Firestore)

#### Core Collections

**`users` Collection**
- **Purpose**: User profiles, store assignments, FCM tokens, work schedules
- **Key Fields**:
  - `storeNumber` (string|number) - Store assignment; code handles both types for compatibility
  - `homeStore` (string|number) - Home store for market/region users
  - `allowedStores` (array) - List of stores user can access
  - `fcmToken` (string) - Firebase Cloud Messaging token for push notifications
  - `fcmTokenUpdatedAt` (Firestore Timestamp) - Token refresh tracking
  - `updatedAt` (Firestore Timestamp) - Profile update timestamp
  - `pendingChanges` (object) - Profile change requests awaiting approval
  - `email` (string) - User email (admin identification via `sinaptick@gmail.com`)
  - `firstName`, `lastName`, `jobTitle` (string) - User profile data
  - `access` (string) - Access level: 'store', 'market', 'region', 'business_unit'
- **Indexes**: `storeNumber + fcmToken` (for efficient store-based FCM targeting)
- **Security**: Users read/write own profile; admin reads all profiles

**`scans` Collection**
- **Purpose**: QR code scan events, customer assistance tracking, analytics
- **Key Fields**:
  - `scanId` (string) - Unique scan identifier
  - `storeNumber` (string) - Store where QR code was scanned (converted to string)
  - `timestamp` (Firestore Timestamp) - When customer scanned QR code
  - `timestampMs` (number) - Millisecond timestamp for client-side operations
  - `qrCode` (string) - QR token that was scanned
  - `areaDescription` (string) - Store area/location description
  - `ipAddress` (string) - IP address of scanner for security
  - `claimedBy` (string) - Firebase UID who claimed assistance request
  - `claimedByName` (string) - Display name of assisting employee
  - `claimedAt` (Firestore Timestamp) - When assistance was claimed
  - `status` (string) - `pending`, `claimed`, or `resolved`
  - `responses` (array) - Interaction tracking and response history
- **Indexes**: `storeNumber + timestamp DESC` (for recent scans by store)
- **Security**: Users read/update scans for their assigned store only

**`logs` Collection**
- **Purpose**: System activity logs, analytics, debugging information
- **Key Fields**:
  - `ts` (Firestore Timestamp) - Log entry timestamp
  - `timestamp` (Firestore Timestamp) - Activity timestamp
  - `respondedAt` (Firestore Timestamp) - Response time tracking
  - `store` (string|number) - Store-specific log filtering
  - `action` (string) - Action type: 'auto_blocked', 'manual_block', 'manual_unblock'
  - `ip` (string) - IP address for security logs
  - `userAgent` (string) - Browser/client information
  - `token` (string) - QR token involved in activity
  - Activity and event data for system monitoring
- **Indexes**: 
  - `ts DESC + respondedAt ASC` (chronological with response tracking)
  - `store + ts DESC` (store-specific recent activity)
- **Security**: Functions write-only; authenticated users read; admin delete

**`support_tickets` Collection**
- **Purpose**: User support ticket system and issue tracking
- **Key Fields**:
  - `userId` (string) - Ticket creator Firebase UID
  - `submittedAt` (Firestore Timestamp) - Ticket creation time
  - `email` (string) - User email for correspondence
  - `subject` (string) - Ticket subject line
  - `description` (string) - Detailed issue description
  - `status` (string) - Ticket status: 'open', 'in_progress', 'resolved', 'closed'
  - `priority` (string) - Priority level: 'low', 'medium', 'high', 'urgent'
  - `responses` (array) - Admin responses and ticket updates
- **Indexes**: `userId + submittedAt DESC` (user's recent tickets)
- **Security**: Users create/read own tickets; admin reads/updates all

#### Integration Collections

**`groupme_tokens` Collection**
- **Purpose**: GroupMe OAuth tokens for bot management
- **Document ID**: Firebase UID (user-specific storage)
- **Key Fields**: OAuth tokens, refresh tokens, expiration data
- **Security**: Users access only their own tokens

**`groupme_bots` Collection**
- **Purpose**: GroupMe bot registry with store associations
- **Key Fields**:
  - `firebase_uid` (string) - Bot owner Firebase UID
  - `bot_id` (string) - GroupMe bot ID
  - `user_id` (string) - GroupMe user ID  
  - `name` (string) - Bot display name (format: "CallBot Store {number}")
  - `store` (string|number) - Associated store number
  - `createdAt` (Firestore Timestamp) - Bot creation time
  - `updatedAt` (Firestore Timestamp) - Last update time
  - `synced` (boolean) - Sync status with GroupMe API
  - `group_id` (string) - GroupMe group ID where bot is active
- **Security**: Users read/write only their own bots

**`workvivo_config` Collection**
- **Purpose**: Workvivo enterprise integration settings
- **Document ID**: Firebase UID (user-specific configuration)
- **Security**: User-specific read/write access

#### System Collections

**`qr_tokens` Collection**
- **Purpose**: QR code token management and validation
- **Security**: Functions-only write access; authenticated users read

**`blocked_ips` Collection**
- **Purpose**: IP blocking for security and spam prevention
- **Document ID**: IP address (string)
- **Key Fields**:
  - `blockedAt` (Firestore Timestamp) - When IP was blocked
  - `blockedBy` (string) - Admin email who blocked (manual blocks)
  - `reason` (string) - Block reason: 'Auto-blocked: Multiple spam attempts'
  - `expiresAt` (Firestore Timestamp) - Optional expiration time
- **Security**: Admin read access; Functions write-only

**`spam_logs` Collection**
- **Purpose**: Spam detection and abuse monitoring
- **Key Fields**:
  - `ip` (string) - IP address of suspicious activity
  - `timestamp` (Firestore Timestamp) - Activity timestamp
  - `action` (string) - Action taken: 'auto_blocked', 'manual_block', 'manual_unblock'
  - `userAgent` (string) - Browser/client information
  - `attempts` (number) - Number of spam attempts
- **Security**: Admin read access; Functions write-only

#### Data Relationships & Architecture

```
Customer QR Scan → scans collection
     ↓
Store-based notification targeting via users.storeNumber
     ↓
Multi-platform delivery:
- GroupMe bots (groupme_bots + groupme_tokens)
- Workvivo posts (workvivo_config)
- Android FCM (users.fcmToken)
     ↓
Assistance claiming updates scans document
     ↓
Activity logged in logs collection
```

#### Firestore Security Model

**User Isolation Pattern:**
```javascript
// Users can only access data for their assigned store
allow read: if request.auth != null && 
  exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
  resource.data.storeNumber == get(/databases/$(database)/documents/users/$(request.auth.uid)).data.storeNumber;
```

**Admin Override Pattern:**
```javascript
// Admin (sinaptick@gmail.com) has global access
allow read: if request.auth != null && 
  exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
  get(/databases/$(database)/documents/users/$(request.auth.uid)).data.email == 'sinaptick@gmail.com';
```

**Atomic Update Pattern:**
```javascript
// Restrict updates to specific fields to prevent race conditions
allow update: if request.auth != null && 
  resource.data.storeNumber == getUserStore() &&
  request.resource.data.diff(resource.data).affectedKeys().hasOnly(['claimedBy', 'claimedByName', 'claimedAt', 'status', 'responses']);
```

#### Performance Considerations

- **Composite Indexes**: Optimized for store-based queries with timestamp ordering
- **Security Rule Caching**: User store lookups cached for performance
- **Sparse Indexing**: `SPARSE_ALL` density for optional fields
- **Query Patterns**: Designed for real-time updates and efficient pagination

## Development Workflow

### Key Commands

#### Web Development
```bash
# Development
npm run dev                    # Start local development server
npm run build                 # Build for production
npm run lint                  # Run linting (currently placeholder)

# Deployment
firebase deploy --only hosting           # Deploy frontend only
firebase deploy --only functions        # Deploy backend only
firebase deploy                         # Deploy everything

# Function-specific deployment
firebase deploy --only functions:groupmeAdminAllBots
```

#### Android Development
```bash
# Navigate to Android project
cd /Users/shanesmith/AndroidStudioProjects/QRCallBox

# Build debug APK
./gradlew assembleDebug

# Build release APK  
./gradlew assembleRelease

# Install debug APK to connected device
./gradlew installDebug

# APK Locations
app/build/outputs/apk/debug/app-debug.apk

# APK Deployment Pipeline
1. Build: ./gradlew assembleDebug  
2. Copy to web hosting: cp app/build/outputs/apk/debug/app-debug.apk /Users/shanesmith/Documents/qrcall/dist/app/QRCallBox-debug-v{version}.apk
3. Update download page: /Users/shanesmith/Documents/qrcall/dist/app/index.html
4. Update backend version API: functions/index.js (getAppVersion)
5. Deploy: firebase deploy --only functions:getAppVersion,hosting
```

#### Android Version Management
- **Semantic Versioning**: 1.7.x format (major.minor.patch)
- **Version Code: Integer increment for each build (currently 63)
- **Auto-Update System**: Checks `https://us-central1-qrwebaccdb.cloudfunctions.net/getAppVersion`
- **Distribution**: APKs hosted at `https://qrwebaccdb.web.app/app/`

#### MCP Tools for Android Development & Debugging
QRCall development includes advanced Android debugging capabilities via MCP (Model Context Protocol) integration with ADB tools.

##### Available MCP Tools
```python
# Screenshot and Visual Inspection
get_screenshot() -> Image              # Capture device screen for visual debugging
get_uilayout() -> str                 # Analyze clickable UI elements and layout

# Device Management  
execute_adb_command(command: str) -> str    # Execute any ADB command
get_packages() -> str                       # List all installed packages
get_package_action_intents(package: str) -> list[str]  # Get app action intents
```

##### MCP Server Configuration
**Location**: `~/Library/Application Support/Claude/claude_desktop_config.json`
```json
{
  "mcpServers": {
    "android-adb": {
      "command": "/Users/shanesmith/.local/bin/uv",
      "args": ["--directory", "/Users/shanesmith/Documents/qrcall/android-mcp-server", "run", "server.py"]
    }
  }
}
```

##### Visual Debugging Workflows

**1. UI State Verification**
```bash
# Take screenshot to verify current app state
get_screenshot()

# Analyze UI elements for testing interactions
get_uilayout()
```

**2. Bug Reproduction & Documentation**
```bash
# Step-by-step visual bug tracking:
1. get_screenshot()  # Before reproducing bug
2. [Perform bug reproduction steps via app interaction]
3. get_screenshot()  # After bug manifestation  
4. get_uilayout()    # Analyze problematic UI elements
```

**3. Feature Testing & Validation**
```bash
# Comprehensive feature testing workflow:
1. get_screenshot()  # Initial state
2. execute_adb_command("am start -n com.stable.qrcallbox/.MainActivity")  # Launch app
3. get_screenshot()  # Verify app launched correctly
4. get_uilayout()    # Identify interactive elements for testing
5. [Test feature interactions]
6. get_screenshot()  # Final state verification
```

**4. Cross-Version Comparison**
```bash
# Compare app versions visually:
1. Install older APK: execute_adb_command("pm install -r /path/to/old.apk")
2. get_screenshot()  # Capture old version UI
3. Install new APK: execute_adb_command("pm install -r /path/to/new.apk") 
4. get_screenshot()  # Capture new version UI
5. [Compare screenshots for UI changes]
```

##### Advanced ADB Commands for QRCall Testing
```bash
# App Management
execute_adb_command("pm list packages | grep qrcallbox")  # Verify app installation
execute_adb_command("am start -n com.stable.qrcallbox/.MainActivity")  # Launch app
execute_adb_command("am force-stop com.stable.qrcallbox")  # Stop app

# FCM Testing  
execute_adb_command("am broadcast -a com.google.android.c2dm.intent.RECEIVE")  # Trigger FCM

# Debugging & Logs
execute_adb_command("logcat -s QRCallBox")  # View app-specific logs
execute_adb_command("dumpsys package com.stable.qrcallbox")  # Package info

# UI Automation Testing
execute_adb_command("input tap 500 800")     # Simulate screen tap
execute_adb_command("input text 'Store123'") # Input text
execute_adb_command("input keyevent 4")      # Back button
```

##### Device Requirements for MCP
- **Android Device**: Connected via USB with USB debugging enabled
- **ADB Access**: Device must be authorized for debugging
- **Package**: QRCall app (`com.stable.qrcallbox`) must be installed
- **Permissions**: Device should have notification access enabled for full testing

##### Troubleshooting MCP Connection
```bash
# Verify device connectivity
execute_adb_command("devices")

# Check app installation
execute_adb_command("pm list packages | grep qrcallbox")

# Restart ADB if connection issues
execute_adb_command("kill-server")
execute_adb_command("start-server")
```

##### MCP Integration Benefits
1. **Real-time Visual Feedback**: Immediate screenshot capabilities for debugging
2. **UI Element Analysis**: Precise identification of clickable elements and layouts  
3. **Automated Testing**: Programmatic app interaction via ADB commands
4. **Bug Documentation**: Visual evidence capture for issue reporting
5. **Cross-version Comparison**: Side-by-side UI comparison capabilities
6. **Live Debugging**: Interactive debugging without leaving Claude development environment

### Branch Strategy
- `main` - Production branch
- `performance-improvements` - Current development branch
- Always commit and push changes before deploying

## Multi-Platform Notification System

### Notification Flow
1. **QR Code Scan**: Customer scans QR code at store location
2. **Backend Processing**: Firebase Function `s()` processes scan event
3. **Multi-Platform Dispatch**: Simultaneously sends notifications via:
   - **GroupMe**: Message to store-specific GroupMe groups
   - **Workvivo**: Post to store collaboration platform (Store 1458)
   - **Android FCM**: Push notification to Android app users
4. **Response Coordination**: Notifications are dismissed across platforms when any employee responds

### Android FCM Integration

#### FCM Token Management
- **Registration**: Automatic FCM token retrieval and Firestore storage
- **Updates**: Token refresh handled via `onNewToken()` callback  
- **Storage**: Tokens stored in `users` collection under `fcmToken` field
- **Multi-Device**: Support for users signed in on multiple devices
- **Debug Display**: FCM token visible in app for troubleshooting

#### Advanced Notification Features (v1.7.x)
- **Smart Filtering**: Only shows notifications during work hours/on shift
- **Action Buttons**: Direct "Assist"/"Ignore" responses from notification
- **Store Targeting**: Only employees assigned to scanned store receive notifications
- **Background Delivery**: Data-only FCM payloads ensure background receipt
- **Real-time Coordination**: Live dismissal when other employees respond
- **In-App Assist Buttons**: Interactive buttons in Recent Customer Requests
- **Race Condition Protection**: Firestore transactions prevent double-claiming
- **Elapsed Timer Display**: Shows how long customers have been waiting
- **Real-time Updates**: Firestore snapshot listeners for instant scan list updates

#### Android App Features (Current: v1.8.8)

##### Core Functionality:
- **Recent Customer Requests**: Real-time display of pending assistance requests
- **Interactive Assist**: Click assist buttons to claim requests (prevents conflicts)
- **Elapsed Timing**: Visual countdown showing customer wait time
- **Auto-Save Settings**: Work schedule changes saved automatically
- **Shift Management**: Automatic on/off shift detection based on schedule

##### Auto-Update System:
- **Version Checking**: Automatic check for new versions on app launch
- **Semantic Versioning**: 1.7.x incremental updates
- **One-Tap Updates**: Download and install updates with user consent  
- **Release Notes**: Detailed changelog for each update
- **Debug Logging**: Enhanced troubleshooting for update system

##### User Experience:
- **Material Design 3**: Modern Android UI components
- **Battery Optimized**: No background services, event-driven architecture
- **Streamlined UI**: Auto-save eliminates manual save buttons
- **Debug Information**: FCM token, user status, and system health display

## GroupMe Integration

### Bot Management Flow
1. **User Setup**: Users connect GroupMe via OAuth
2. **Store Assignment**: Users are assigned to store numbers
3. **Bot Creation**: Admin can create bots for users or themselves
4. **QR Notifications**: Bots send messages when QR codes are scanned

### Admin Panel Tabs
The Admin panel includes the following sections:
- **Overview**: Quick system status, unapproved users, pending profile changes
- **Support Tickets**: View and respond to user support tickets
- **User Management**: Search, edit, and manage all users across stores
- **GroupMe Bots**: Manage GroupMe bot integrations, store lookup, bot creation
- **QR Locations**: View all QR areas per store, delete test/erroneous data
- **Spam Protection**: Manage blocked IPs
- **Data Cleanup**: Response tracking diagnostic, GroupMe backfill tools

### GroupMe Admin Capabilities
- **Store Lookup**: Find all users by store number
- **Bot Creation**: Create bots for other users or multiple bots for admin
- **Bot Overview**: View all bots with expandable details (group info, members, recent messages)
- **Bot Management**: Delete any bot system-wide

### API Endpoints Pattern
All GroupMe admin endpoints follow: `/api/groupme/admin-[action]`
- `admin-lookup-store` - Find users by store number
- `admin-all-bots` - Get comprehensive bot overview
- `admin-bot-details` - Get detailed bot/group information (smart loading)
- `admin-create-bot-for-user` - Create bot for another user
- `admin-create-bot-for-self` - Create bot under admin account

### Android App Distribution & Updates
- **Current Version: 1.8.11 (Latest production version)
- **Download Page**: `https://qrwebaccdb.web.app/app/`
- **Latest APK**: `https://qrwebaccdb.web.app/app/QRCallBox-debug-v1.8.11.apk`
- **Local Build Path**: `/Users/shanesmith/AndroidStudioProjects/QRCallBox/app/build/outputs/apk/debug/app-debug.apk`
- **Version API**: `https://us-central1-qrwebaccdb.cloudfunctions.net/getAppVersion`

#### Release History:
- **v1.8.11**: Latest production version
- **v1.7.2**: Enhanced auto-update debug logging
- **v1.7.1**: Auto-update system implementation
- **v1.7.0**: Assist buttons, real-time updates, race condition protection
- **v1.6.0**: Auto-save settings, UI improvements
- **v1.5.0**: Recent Customer Requests feature
- **Earlier**: Authentication, notifications, schedule management

#### Debug & Troubleshooting Features:
- **FCM Token Display**: Visible in app for notification troubleshooting
- **User Status**: Current shift status and schedule information
- **Version Info**: Current version and update check status
- **Detailed Logging**: Comprehensive debug logs for all major operations
- **Test Notifications**: Built-in test system for development

## Multi-Device Notifications

### System Overview (As of October 2025)

**✅ IMPLEMENTED**: Users can now receive notifications on **multiple devices simultaneously**!

**How It Works**:
- Each user's Firestore document now has a `fcmTokens` array (replaces single `fcmToken`)
- Array stores multiple device tokens with metadata:
  ```javascript
  fcmTokens: [
    {
      token: "eXJPYP...",  // FCM registration token
      platform: "android",  // or "ios"
      deviceName: "Pixel 7", // Device model
      deviceInfo: "Google Pixel 7 (Android 14)",
      addedAt: Timestamp,
      lastSeen: Timestamp,
      appVersion: "1.8.11",
      appVersionCode: 19
    },
    {
      token: "eWDsw8...",
      platform: "ios",
      deviceName: "iPad",
      // ... etc
    }
  ]
  ```
- Backend sends notifications to **ALL devices** in the array
- Old `fcmToken` field maintained for backward compatibility

**User Experience**:
- Log in on Android → device registered in array
- Log in on iPad → second device added to array (doesn't overwrite!)
- QR scan occurs → **BOTH devices receive notification simultaneously**

**Files Modified**:
- `apple/lib/services/auth_service.dart` - iOS multi-device token storage
- `app/src/main/java/.../ui/MainActivity.kt` - Android multi-device token storage
- `functions/index.js` - Backend sends to all user devices

**Verification Script**:
```bash
node verify_multi_device.cjs  # Check user's registered devices
```

## Multi-Store Access & Notifications

### Current Limitation (As of 2025-01-11)

**Backend Notification Targeting**:
- Currently ONLY notifies users whose `storeNumber` matches the scan's store
- `allowedStores` array is managed in admin panel but NOT used for notifications
- This prevents "ghost notifications" where users receive alerts but can't see scans

**Why This Limitation Exists**:
```
Backend checks: activeStore or storeNumber
Android app shows: scans from storeNumber only

Problem: If we notify based on allowedStores, users get notifications
for scans they can't see in the app → "ghost notifications"
```

**Current Behavior for Multi-Store Users**:
- Market managers with `allowedStores: [1234, 5678, 9012]` only receive notifications when `storeNumber` matches
- They can view/edit their allowed stores in admin panel
- They CANNOT switch stores or receive notifications from non-primary stores

### Planned Solution: Store Switching Feature

**See**: `/docs/STORE_SWITCHING_IMPLEMENTATION.md` for full design

**Overview**:
1. Add `activeStore` field to user profile (Firestore)
2. Android app gets store selector dropdown in app bar
3. Users select which store they're currently monitoring
4. Backend sends notifications based on `activeStore` instead of `storeNumber`
5. App queries scans for `activeStore` instead of `storeNumber`

**Benefits**:
- Market managers can monitor any allowed store
- No ghost notifications
- Single app instance for all stores
- Per-store notification preferences
- Clear store switching UI

**Implementation Status**: Designed, ready for development

### Managing Multi-Store Users (Admin)

**Web Admin Panel** (`/admin/user-management`):
1. Search for user by name, email, or store number
2. Click "Edit User" on user profile
3. Fields available:
   - **Store Number**: Primary store (always required)
   - **Allowed Stores**: Comma-separated list (e.g., "1234, 5678, 9012")
   - **Home Store**: Legacy field for backward compatibility
   - **Approved**: Must be "Yes" for user to access system
4. Save changes

**Database Fields**:
```javascript
users: {
  storeNumber: 1234,              // Primary store (notifications sent here)
  allowedStores: [1234, 5678, 9012],  // Stores user can access (web panel only)
  homeStore: 1234,                // Legacy field
  activeStore: null,              // Future: Selected monitoring store
}
```

**Important Notes**:
- Changing `allowedStores` in admin panel does NOT change notification behavior yet
- Users will only receive Android notifications for their `storeNumber` until store switching is implemented
- Web panel GroupMe/Workvivo notifications still use `allowedStores` for targeting

## Important Patterns & Conventions

### Code Style
- React functional components with hooks
- useCallback for event handlers and API calls
- Custom debug logging with timestamps
- Comprehensive error handling with user feedback

### Firebase Functions
- Rate limiting on all endpoints
- Admin authentication verification
- Detailed logging for debugging
- CORS enabled for allowed origins

### UI/UX Patterns
- Loading states for all async operations
- Debug information panels for troubleshooting
- Expandable details with smart loading
- Consistent button styling and interactions

## Common Issues & Solutions

### Deployment Issues
- Always run `npm run build` before `firebase deploy --only hosting`
- URL rewrites in `firebase.json` must match function names exactly
- Functions need explicit deployment after code changes

### GroupMe Integration
- Bot names follow pattern: "CallBot Store [number]"
- Callback URLs point to `/api/groupme/webhook`
- Token storage uses string user IDs for consistency
- Group information cached to reduce API calls

### Android App Issues
- **Auto-Update Not Prompting**: Check debug logs for version comparison, ensure API returns correct data
- **Recent Requests Empty**: Verify Firestore security rules, check user store number assignment
- **Notification Actions Failing**: Check FCM token sync, verify backend notification assist logic
- **Race Conditions**: Use Firestore transactions for atomic operations (claim/release)
- **Timing Issues**: Ensure user data loads before calling dependent functions

### Admin Panel
- Circular dependency issues resolved by extracting components
- Store-based lookup more practical than individual user lookup
- Smart loading prevents unnecessary API calls

### Firestore Security
- Scans collection requires read/update rules for store-specific access
- Users collection needs proper authentication and role-based access
- Test security rules thoroughly before production deployment

## Security Notes

### Web & Backend Security
- Admin-only endpoints verify user permissions
- Rate limiting prevents abuse
- GroupMe tokens stored securely in Firestore
- CORS restricted to allowed origins only

### iOS/Flutter App

#### Overview
- **Current Version**: v1.8.1+2
- **Platform**: Flutter (iOS 13.0+ / iPadOS 13.0+)
- **Project Location**: `/Users/shanesmith/Documents/qrcall/apple/`
- **Status**: Development - Security hardening complete, deployment pending

#### Key Features
- **Authentication**: Google Sign-In, Apple Sign-In, email/password
- **Real-Time Dashboard**: StreamBuilder with Firestore snapshots for live request updates
- **Request Management**: Assist/Ignore buttons with race condition protection
- **Dark Mode**: System default, light, or dark theme with persistence
- **Admin Panel**: Active Associates view, all users directory (permission-based)
- **Work Schedule**: Set hours for each day with automatic shift detection
- **Push Notifications**: FCM integration (physical devices only, not simulators)
- **Profile Management**: User data display with debug information

#### Tech Stack
- **Framework**: Flutter 3.35.5+ (stable channel)
- **State Management**: Provider pattern
- **UI**: Material Design 3 with Cupertino widgets
- **Backend**: Firebase (Auth, Firestore, FCM, Analytics)
- **Authentication**: firebase_auth, google_sign_in, sign_in_with_apple
- **Local Storage**: shared_preferences

#### Development Commands
```bash
# Navigate to iOS project
cd /Users/shanesmith/Documents/qrcall/apple

# Get dependencies
flutter pub get

# Run on simulator or device
flutter run
flutter run -d [DEVICE_ID]

# List available devices
flutter devices

# Hot reload (while running): press 'r'
# Hot restart (while running): press 'R'

# Build release (via Xcode)
# 1. Open ios/Runner.xcworkspace in Xcode
# 2. Product → Archive
# 3. Distribute to App Store Connect

# Clean build
flutter clean && flutter pub get
```

#### Project Structure
```
apple/
├── lib/
│   ├── main.dart                    # App entry point
│   ├── models/                      # Data models (scan_model, user_model)
│   ├── screens/                     # UI screens (home, login, settings, profile, admin)
│   ├── services/                    # Backend services (auth, firestore, fcm)
│   ├── providers/                   # State management (theme_provider)
│   └── widgets/                     # Reusable components (scan_list_item)
├── ios/
│   ├── Runner/
│   │   ├── GoogleService-Info.plist # Firebase iOS config
│   │   └── Info.plist              # App metadata & permissions
│   └── Podfile                     # CocoaPods dependencies
└── pubspec.yaml                     # Flutter dependencies
```

#### Security Status (January 2025)
> **📋 IMPORTANT**: iOS app has undergone comprehensive security hardening
>
> **See detailed audit**: [`apple/SECURITY_UPDATES.md`](apple/SECURITY_UPDATES.md)

**✅ Completed Client-Side Improvements**:
- Sensitive logging protection (kDebugMode checks)
- iOS privacy permissions compliance
- Input validation & sanitization (all Firestore writes)
- Strong password enforcement (12+ chars, complexity requirements)
- FCM notification payload validation

**✅ Completed Server-Side Implementations** (awaiting deployment):
- Firebase Custom Claims for admin authorization (`setAdminClaim` function)
- Scheduled auto-ignore function (runs every 5 minutes)
- Updated Firestore security rules to use Custom Claims
- Manual auto-ignore trigger for admin testing

**⏳ Pending Tasks**:
- Deploy backend security updates (see `DEPLOYMENT_SECURITY.md`)
- Enable Firebase App Check (recommended for production)
- Test security updates in production environment

#### Known Limitations
- **APNS Simulators**: iOS simulators don't support push notifications (physical device required)
- **No Offline Mode**: Requires network connectivity for all operations
- **15-Minute Claimed Display**: Claimed requests auto-filter after 15 minutes
- **No Request History**: Only shows current active requests (last 24 hours)

#### Testing Workflow
**iOS Simulator** (✅ Most features work):
- Authentication flows (Google, Apple, email/password)
- Real-time request list updates
- Assist/Ignore functionality
- Dark mode switching
- Admin panel (with admin account)
- Profile screen

**Physical Device Required For**:
- Push notification delivery
- Background notification handling
- APNS token registration
- Notification action buttons (future)

#### Distribution
- **TestFlight**: See `apple/TESTFLIGHT_SETUP.md` for guide
- **App Store**: Not yet submitted
- **Internal Testing**: Use `flutter run -d [DEVICE_ID]` for direct installation

#### Documentation
- iOS development guide: `apple/APPLECLAUDE.md`
- Security audit: `apple/SECURITY_UPDATES.md`
- TestFlight setup: `apple/TESTFLIGHT_SETUP.md`
- Flutter README: `apple/README_FLUTTER.md`

## Performance Optimizations
- Component memoization with React.memo
- Smart loading for detailed information
- Cached group data to reduce API calls
- Efficient Firestore queries with proper indexing

## Testing & Debugging
- Debug panels show API calls and responses
- Console logging for development
- Error boundaries for graceful failure handling
- Admin tools for system oversight

## Future Considerations
- Consider implementing proper test framework
- Code splitting for large bundle sizes
- Enhanced caching strategies
- Monitoring and alerting integration
- Android release to Google Play Store
- iOS companion app development
- Dark mode support for Android app
- Enhanced analytics and usage tracking
- Offline mode support for basic Android functionality

## Development Timeline

### Phase 1 (Jan 4-10, 2025): Foundation & Core Features
- **46 total development hours** across 8 days
- Web app functionality with GroupMe and Workvivo integration
- Android app v1.0-1.6: Authentication, notifications, scheduling, UI polish

### Phase 2 (Jan 11, 2025): Advanced Features
- **14 development hours** in single day intensive session
- Android app v1.7.0-1.8.8: Assist buttons, real-time updates, auto-update system, production release
- Race condition protection, enhanced debugging, comprehensive documentation

### Current Status (Jan 11, 2025)
- **Total Investment**: 60+ development hours
- **Android App**: v1.8.8 production release
- **Web Platform**: Full GroupMe/Workvivo integration with admin tools
- **Documentation**: Comprehensive developer guides and user documentation
- **Deployment**: Automated CI/CD pipeline with auto-update system

## System Architecture Overview

```
Customer QR Scan
       ↓
Web App (React + Vite)
       ↓
Firebase Cloud Function
       ↓
┌─────────────────────────────────────────┐
│            Notification Hub             │
├─────────────┬─────────────┬─────────────┤
│   GroupMe   │  Workvivo   │  Android    │
│     Bot     │    Post     │     FCM     │
└─────────────┴─────────────┴─────────────┘
       ↓             ↓             ↓
  Store Group   Enterprise     Mobile App
  Notifications Platform      Push + UI
                Notifications
```

### Key Integration Points:
1. **Unified User Management**: Firebase Auth shared across web/mobile
2. **Cross-Platform Notifications**: Single trigger, multiple delivery channels  
3. **Real-time Coordination**: Response from any platform dismisses others
4. **Admin Controls**: Web-based management for all notification channels
5. **Mobile-First Features**: Assist buttons, real-time updates, auto-updates

---

This comprehensive guide documents the complete QRCall ecosystem including web application, Android mobile app, multi-platform integrations, and development workflows. It should help Claude understand the full project context and make informed decisions about code changes, deployments, and architectural improvements.