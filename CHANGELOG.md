# QRcallbox Changelog

## Version 2.2.0 - Terms of Service & Privacy Policy Integration (2025-01-25)

### **NEW FEATURES**

#### **Terms of Service System**
- **Mandatory User Acceptance** - Users must accept Terms of Service before accessing application
- **Version Tracking** - Terms acceptance tracked with version 2.1.0 timestamp and IP address logging
- **Modal Overlay System** - Non-dismissible terms display until acceptance or account sign-out
- **Database Integration** - User agreement status stored in Firestore with legal compliance data
- **Automatic Updates** - System checks terms version on login and prompts for new versions

#### **Interactive Privacy Policy**
- **Sectioned Navigation** - Interactive privacy policy with 8 major sections for easy reading
- **Modal Access** - Users can view full privacy policy from Terms of Service
- **Responsive Design** - Mobile-optimized legal document display
- **Easy Navigation** - Jump to specific sections or view full policy

#### **Contact and Support System**
- **Support Ticket System** (`src/ContactUs.jsx`, `src/TicketQueue.jsx`, `src/MyTickets.jsx`)
- **User Ticket Management** - Users can create, track, and view their support requests
- **Admin Ticket Queue** - Administrative interface for managing and responding to tickets
- **Contact Modal** - Easy access to support from footer link throughout application

### **TECHNICAL IMPROVEMENTS**

#### **Frontend Components**
- **TermsOfService Component** - Full legal document display with acceptance tracking
- **PrivacyPolicy Component** - Interactive sectioned privacy policy viewer
- **Enhanced App Integration** - Terms checking logic integrated into main application flow
- **State Management** - Proper handling of terms acceptance status across sessions

#### **Database Schema Enhancements**
- **User Terms Tracking** - `termsAccepted`, `termsVersion`, `termsAcceptedAt`, `ipAddress` fields
- **Legal Compliance Data** - IP address logging for terms acceptance verification
- **Support Ticket Storage** - Complete ticket management system schema

#### **Administrative Tools**
- **Setup Guide Integration** (`src/Setup.jsx`) - Comprehensive implementation guide
- **User Management Enhancements** - Extended admin tools for user oversight
- **Settings Navigation** - Improved settings tab with sub-sections for better organization

#### **Icon and Branding Updates**
- **QRLockIcon Component** - Custom branded icon for application header
- **Favicon Integration** - Updated SVG favicon (20% larger) for better visibility
- **Visual Identity** - Enhanced branding throughout application interface

### **SECURITY ENHANCEMENTS**

#### **Legal Compliance**
- **IP Address Capture** - Secure logging for legal compliance without privacy violation
- **Terms Version Control** - Systematic versioning for legal document updates
- **Audit Trail** - Complete tracking of user agreement events
- **Anti-tampering** - Terms acceptance cannot be bypassed or modified by users

---

## Version 2.1.0 - Analytics & Response Tracking Release (2025-08-22)

### **NEW FEATURES**

#### **Top Responders Leaderboard** 
- **Live Leaderboard Dashboard** showing top 5 fastest and most active associates
- **Time Period Selector** - Daily (default), Weekly, Monthly, and All-Time views
- **Business Hours Filtering** - Only counts responses during 6:00 AM - 10:59 PM
- **Comprehensive Statistics** per responder:
  - Total response count with ranking badges (🥇🥈🥉)
  - Average response time in minutes
  - Fastest to slowest response time range
- **Real-time Updates** - Refreshes automatically when new responses are logged

#### **Enhanced Response Logging**
- **Any Message Logging** - Records ANY first message after QR assistance request (no longer requires specific keywords)
- **Business Hours Dashboard Filter** - Average response time now filtered to 6:00 AM - 10:59 PM business hours
- **Timezone Corrections** - Fixed bot message timestamps to show correct local time
- **Like Detection Ready** - Infrastructure for logging GroupMe message likes as responses

#### **Improved Webhook System**
- **Extended Time Window** - Webhook now looks back 6 hours instead of 30 minutes to handle timezone differences
- **Database Index Optimization** - Created composite Firestore indexes for efficient responder queries
- **Enhanced Error Handling** - Better debugging and error recovery for webhook processing

### **TECHNICAL IMPROVEMENTS**

#### **Frontend** (`src/app.jsx`)
- Added `TopResponders` component with time period filtering
- Enhanced `Dashboard` component with business hours response time calculation
- Improved Firestore querying with proper indexing for performance
- Added comprehensive error handling and loading states

#### **Backend** (`functions/index.js`, `functions/groupme-webhook.js`)  
- Updated `sendGroupMeNotification()` with timezone-aware timestamp formatting
- Enhanced webhook response detection logic to capture any first message
- Added response type tracking ("message" vs "like")
- Implemented like count and user tracking for future GroupMe like detection

#### **Database Schema Enhancements**
- Added fields to `logs` collection:
  - `responseType`: "message" or "like" 
  - `likeCount`: Number of likes on response
  - `likedByUsers`: Array of user IDs who liked
  - `hasLikes`: Boolean flag for like detection
  - `lastLikeUpdate`: Timestamp of last like update

### **DEPLOYMENT IMPROVEMENTS**
- Fixed build process issues with proper Vite configuration
- Enhanced deployment workflow with proper root directory building
- Added debug logging for troubleshooting leaderboard functionality

---

## Version 2.0.0 - Security Hardening Release (2025-01-22)

###  **MAJOR SECURITY IMPROVEMENTS**

#### **Database Security**
-  **Added Firestore Security Rules** (`firestore.rules`)
  - Users can only access their own data
  - Admin role validation moved to server-side
  - Logs and QR tokens are read-only from client (Functions-only write access)
  - Proper user ownership verification for GroupMe accounts and bots

#### **Authentication & Authorization** 
-  **Firebase Authentication Middleware** added to sensitive endpoints
-  **Server-side Admin Role Checking** - no longer bypassable from client
-  **User Ownership Verification** for GroupMe accounts and bot operations
-  **JWT Token Validation** on protected endpoints

#### **Input Validation & Sanitization**
-  **Universal Input Sanitization** - all user inputs sanitized to prevent XSS
-  **Server-side Validation** for store numbers and area names
-  **Input Length Limits** enforced across all endpoints
-  **HTML Output Escaping** to prevent injection attacks

#### **API Security**
-  **Environment Variable Migration** - API key moved from hardcoded to `.env`
-  **API Key Validation** on mint endpoint using Firebase Secrets
-  **Secrets Management** via Firebase Secret Manager
-  **Rate Limiting** implemented on all public endpoints

#### **CORS & Network Security**
-  **Specific CORS Origins** - replaced wildcard with explicit allowed domains
-  **Security Headers** added:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` 
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`

#### **Error Handling & Logging**
-  **Reduced Information Disclosure** in error messages
-  **Sanitized Error Responses** 
-  **Secure Logging** - sensitive data no longer logged

###  **TECHNICAL CHANGES**

#### **Firebase Functions** (`functions/index.js`)
- Added authentication middleware to `groupmeGroups`, `groupmeCreateBot` endpoints
- Implemented rate limiting (10 req/min default, 20 req/min for QR scans)
- Added input sanitization helpers
- Enhanced error handling with security-focused responses
- Removed sensitive token logging

#### **Frontend Security** (`src/`)
- Updated API client (`src/lib/api.js`) with input validation
- Removed hardcoded API key fallback
- Added client-side input sanitization
- Environment variable configuration

#### **Configuration Files**
- **`firebase.json`**: Added Firestore rules, enhanced security headers
- **`firestore.rules`**: Comprehensive database security rules
- **`firestore.indexes.json`**: Optimized database indexes for security queries
- **`.env.example`**: Template for environment variables

###  **BREAKING CHANGES**

1. **API Authentication Required**: 
   - `groupmeGroups` and `groupmeCreateBot` now require Firebase Auth token
   - `mint` endpoint now requires API key in headers

2. **CORS Restrictions**: 
   - Only specific domains allowed (no more wildcard `*`)
   - Development URLs: `localhost:5173`, `localhost:4173`
   - Production URLs: `qrwebaccdb.web.app`, `qrwebaccdb.firebaseapp.com`

3. **Environment Variables**:
   - `VITE_API_KEY` must be set in `.env` file
   - Firebase Secrets must be configured: `API_KEY`, `GROUPME_CLIENT_ID`

###  **VULNERABILITY FIXES**

| **Severity** | **Issue** | **Fix** |
|--------------|-----------|---------|
| **Critical** | No Firestore security rules |  Comprehensive rules implemented |
| **Critical** | Public function access |  Authentication middleware added |
| **High** | Hardcoded API key exposure |  Moved to environment variables |
| **High** | Client-side admin bypass |  Server-side validation added |
| **High** | No rate limiting |  Rate limiting on all endpoints |
| **Medium** | Wildcard CORS |  Specific origins only |
| **Medium** | XSS vulnerabilities |  Input sanitization added |
| **Medium** | Information disclosure |  Error messages sanitized |

###  **DEPLOYMENT REQUIREMENTS**

#### **Required Secrets** (set with `firebase functions:secrets:set`)
```bash
firebase functions:secrets:set API_KEY
firebase functions:secrets:set GROUPME_CLIENT_ID
```

#### **Environment Variables** (`.env`)
```bash
VITE_API_KEY=your_secure_api_key_here
```

#### **Deploy Commands**
```bash
firebase deploy --only firestore:rules
firebase deploy --only functions  
firebase deploy --only hosting
```

###  **SECURITY TESTING**

-  Database access controls verified
-  API authentication tested
-  Rate limiting functionality confirmed
-  Input validation edge cases tested
-  CORS restrictions validated
-  Error handling security verified

###  **SECURITY BEST PRACTICES IMPLEMENTED**

1. **Defense in Depth**: Multiple layers of security controls
2. **Principle of Least Privilege**: Users can only access their own data
3. **Input Validation**: All inputs validated both client and server side
4. **Secure Error Handling**: No sensitive information in error messages
5. **Rate Limiting**: Protection against abuse and DoS attacks
6. **Content Security**: XSS and injection attack prevention

###  **PERFORMANCE IMPACT**

- Minimal performance impact from security additions
- Rate limiting may affect high-frequency API usage
- Database queries optimized with proper indexes

---

## Version 2.1.0 - User Experience & Management Improvements (2025-08-22)

###  **USER INTERFACE ENHANCEMENTS**

#### **Header & Navigation**
-  **Relocated Sign Out Button** - Moved from Settings tab to header next to username
-  **Improved Header Layout** - Better spacing and accessibility for sign out action
-  **Consistent Theming** - Sign out button follows app theme styling

#### **Settings Tab Redesign**
-  **Account Information Display** - Clean, read-only view of current user profile
-  **Hidden Change Forms** - Profile modification forms hidden behind "Request Account Changes" button
-  **Streamlined Interface** - Cleaner default view showing only essential information
-  **Smart Form Management** - Forms auto-hide after successful submission

###  **ACCOUNT MANAGEMENT SYSTEM**

#### **User Profile Change Requests**
-  **Pending Changes System** - Users can request profile modifications requiring admin approval
-  **Change Validation** - Only modified fields are submitted for approval
-  **Status Tracking** - Visual indicators for pending, approved, and rejected changes
-  **Prevention of Duplicate Requests** - Users cannot submit new changes while others are pending

#### **Admin Approval Workflow**
-  **Pending Changes Dashboard** - Admin interface showing all requested profile changes
-  **Side-by-side Comparison** - Current vs. requested values for easy review
-  **One-click Actions** - Approve or reject changes with immediate effect
-  **Real-time Updates** - Admin interface updates instantly after actions

#### **Security & Data Integrity**
-  **Firestore Security Rules** - Updated to support pending changes workflow
-  **User-scoped Modifications** - Users can only request changes to their own profiles
-  **Admin-only Approval** - Only administrators can approve/reject change requests
-  **Audit Trail** - Timestamps and change history maintained

###  **TECHNICAL IMPROVEMENTS**

#### **Database Schema** (`firestore.rules`)
- Added `pendingChanges` field support with proper access controls
- Enhanced user document security with granular permissions
- Admin approval workflow permissions implemented

#### **Frontend Components** (`src/app.jsx`)
- **Settings Component**: Complete redesign with conditional form display
- **PendingChangesList Component**: New admin interface for change management
- **Header Component**: Relocated sign out functionality

###  **FUNCTIONALITY DETAILS**

#### **User Experience Flow**
1. **View Current Info** - Users see their profile in read-only format
2. **Request Changes** - Click button to reveal modification form
3. **Submit for Approval** - Changes saved as pending, form auto-hides
4. **Track Status** - Visual feedback on approval status
5. **Apply Changes** - Admin approves and changes take effect immediately

#### **Admin Management Flow**
1. **Review Requests** - See all pending changes in Admin tab
2. **Compare Values** - Current vs. requested side-by-side
3. **Make Decision** - Approve to apply changes, reject to discard
4. **Instant Update** - Changes apply immediately to user profiles

###  **SECURITY ENHANCEMENTS**

| **Feature** | **Security Measure** |
|-------------|---------------------|
| **Profile Changes** | Admin approval required for all modifications |
| **Data Access** | Users can only modify their own pending changes |
| **Approval Authority** | Only designated admins can approve/reject |
| **Change Tracking** | Full audit trail with timestamps |

###  **USER IMPACT**

#### **Positive Changes**
- **Cleaner Interface** - Less cluttered Settings tab
- **Intuitive Navigation** - Sign out button in expected location
- **Controlled Changes** - Prevents unauthorized profile modifications
- **Admin Oversight** - Full control over user profile accuracy

#### **No Breaking Changes**
- All existing functionality preserved
- Backward compatible with current user data
- No impact on QR code generation or scanning features

---

## Previous Versions

### Version 1.x - Initial Implementation
- Basic QR code generation and scanning functionality
- GroupMe integration for notifications
- Firebase hosting and Firestore database
- User authentication and admin panel

---

*This changelog documents the comprehensive security hardening of QRcallbox, transforming it from a functional prototype to a production-ready, secure application.*