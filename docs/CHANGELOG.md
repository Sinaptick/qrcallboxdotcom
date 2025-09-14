
# QRcallbox Changelog

## Version 2.5.0 - Code Architecture Refactoring (2025-08-26)

### **ARCHITECTURE IMPROVEMENTS**

#### **Component Modularization**
- **Separated Monolithic App Component** - Split 3,257-line app.jsx into focused, maintainable components
- **Reduced Nested Div Elements** - Replaced excessive div nesting with semantic HTML elements
- **Improved Code Organization** - Created logical folder structure for components, hooks, and utilities

#### **New Component Structure**
- **`src/components/auth/`** - Authentication-related components
  - `LoginForm.jsx` - Clean email/password sign-in form
  - `RegisterForm.jsx` - User registration with store hierarchy selection
  - `AuthWrapper.jsx` - Authentication state management wrapper
- **`src/components/layout/`** - Layout and navigation components
  - `LandingPage.jsx` - Welcome page for unauthenticated users
  - `MainShell.jsx` - Primary application shell with navigation
  - `PageHeader.jsx` - Consistent page headers across application
- **`src/components/shared/`** - Reusable UI components
  - `FormField.jsx` - Standardized form input component
  - `LoadingSpinner.jsx` - Consistent loading indicators
  - `ErrorBoundary.jsx` - Application error handling
- **`src/hooks/`** - Custom React hooks for business logic
  - `useAuth.js` - Authentication state and operations
  - `useFirebase.js` - Firebase service connections
  - `useUserProfile.js` - User data management
- **`src/config/`** - Configuration files
  - `firebase.config.js` - Firebase configuration and initialization
  - `constants.js` - Application-wide constants

#### **Code Quality Improvements**
- **Eliminated Code Duplication** - Extracted repeated patterns into reusable components
- **Enhanced Type Safety** - Added PropTypes validation where applicable
- **Improved Error Handling** - Centralized error boundaries and consistent error states
- **Better Performance** - Reduced bundle size through component splitting and lazy loading
- **Semantic HTML** - Replaced generic divs with appropriate semantic elements

#### **Maintainability Enhancements**
- **Single Responsibility Principle** - Each component has a clear, focused purpose
- **Consistent Naming Conventions** - Clear, descriptive component and file names
- **Standardized Code Patterns** - Consistent approaches to state management and side effects
- **Documentation Ready** - Well-structured code for easy documentation and onboarding

### **TECHNICAL BENEFITS**

#### **Developer Experience**
- **Faster Development** - Smaller, focused files are easier to work with
- **Better IDE Performance** - Reduced file size improves editor responsiveness  
- **Easier Testing** - Isolated components enable targeted unit testing
- **Simplified Debugging** - Clear component boundaries improve error tracking

#### **Application Performance**
- **Reduced Bundle Size** - Component splitting enables better code splitting
- **Improved Loading** - Lazy loading opportunities for non-critical components
- **Better React DevTools** - Cleaner component tree for debugging
- **Optimized Re-renders** - Isolated components reduce unnecessary updates

#### **Code Maintainability**
- **Easier Refactoring** - Changes isolated to relevant components
- **Reduced Merge Conflicts** - Multiple developers can work on different files
- **Clear Component Contracts** - Well-defined props and interfaces
- **Scalable Architecture** - Structure supports future feature additions

### **MIGRATION IMPACT**

#### **No Breaking Changes**
- All existing functionality preserved during refactoring
- User experience remains identical
- API endpoints and database schema unchanged
- Deployment process unaffected

#### **Future Development Benefits**
- New features easier to implement with modular structure
- Bug fixes more targeted and less risky
- Code reviews more focused and effective
- Onboarding new developers simplified

---

## Version 2.4.0 - Hierarchical Store Management System (2025-01-26)

### **NEW FEATURES**

#### **Hierarchical Store Selection System**
- **Multi-level Access Control** - Users can now be assigned access at Store, Market, Region, or Business Unit (BU) levels
- **Cascading Permissions** - Higher-level selections grant access to all subordinate stores:
  - **BU Level**: Access to all stores across multiple regions
  - **Region Level**: Access to all markets and stores within a region
  - **Market Level**: Access to all stores within a market (e.g., Market 120 includes 10 specific stores)
  - **Store Level**: Access to individual stores (traditional single-store access)

#### **Enhanced User Registration**
- **Dynamic Selection Interface** - Registration form adapts based on chosen access level
- **Smart Store Calculation** - System automatically calculates accessible stores based on hierarchy
- **Access Preview** - Shows users how many stores they'll have access to before registration
- **Hierarchical Data Structure** - Comprehensive mapping of BU→Region→Market→Store relationships

#### **Intelligent UI Adaptation**
- **Conditional QR Generation** - "Generate QR" tab only appears for single-store users
- **Multi-Store Analytics** - Users with multi-store access see comprehensive insights across all accessible locations
- **Context-Aware Display** - Store selection fields adapt to show single store, dropdown, or summary based on user permissions

### **TECHNICAL IMPROVEMENTS**

#### **Store Hierarchy Management** (`src/storeHierarchy.js`)
- **Structured Data Model** - Complete hierarchical mapping with helper functions
- **Access Calculation Functions** - Utilities to determine store access based on selection type
- **Validation Helpers** - Functions to verify user permissions and store access rights
- **Display Name Generation** - Automatic formatting of selection descriptions

#### **Database Schema Enhancements**
- **Extended User Profile** - New fields for hierarchical access:
  - `allowedStores`: Array of accessible store numbers
  - `selectionType`: Level of access (store/market/region/bu)
  - `selectionValue`: Specific identifier for the selection
  - `selectionDisplay`: Human-readable description of access level
- **QR Token Tracking** - Added `createdBy` field to track QR code generation

#### **Backend Security** (`functions/index.js`)
- **Enhanced Authentication** - QR generation now requires user authentication
- **Store Access Validation** - Server-side verification that users can only generate QR codes for authorized stores
- **Multi-Store Support** - Backend logic updated to handle users with multiple store access

#### **Frontend Enhancements** (`src/app.jsx`)
- **Dynamic Tab Management** - Tabs automatically adjust based on user permissions
- **Multi-Store Insights** - Analytics view shows data from all accessible stores
- **Intelligent Store Selection** - Auto-selection of user's accessible stores in filters
- **Permission-Based UI** - Interface elements show/hide based on access level

### **SECURITY ENHANCEMENTS**

#### **Access Control Improvements**
- **Server-Side Validation** - All store access validated on backend before QR generation
- **Token-Based Authentication** - QR generation requires valid Firebase authentication token
- **Permission Inheritance** - Higher-level access automatically includes lower-level permissions
- **Audit Trail** - Complete tracking of who can access which stores and when

#### **Data Isolation**
- **Scope-Limited Analytics** - Users can only view data from their accessible stores
- **Filtered Insights** - All analytics automatically filter to user's permitted stores
- **Secure Store Listing** - Store dropdowns only show accessible locations

### **USER EXPERIENCE IMPROVEMENTS**

#### **Registration Flow**
1. **Access Level Selection** - Choose from Store, Market, Region, or BU
2. **Dynamic Input** - Form fields adapt to show appropriate selection method
3. **Immediate Feedback** - Real-time display of how many stores will be accessible
4. **Validation** - Clear error messages for invalid selections

#### **Application Usage**
- **Single-Store Users** - Traditional experience with QR generation capability
- **Multi-Store Users** - Analytics-focused interface without QR generation
- **Comprehensive Insights** - View performance data across all accessible locations
- **Contextual Information** - Clear display of access level and scope

### **DEPLOYMENT NOTES**

#### **Database Migration**
- Existing users maintain current functionality with backward compatibility
- New `allowedStores` field automatically populated from existing `storeNumber`
- Admin users retain full system access

#### **Configuration Updates**
- Store hierarchy defined in `src/storeHierarchy.js` - update as needed for your organization
- Market 120 configuration includes: 658, 756, 1215, 669, 2988, 5151, 5173, 1458, 1089, 3660
- Additional markets, regions, and BUs can be easily added to the hierarchy

### **BUSINESS IMPACT**

#### **Operational Benefits**
- **Simplified Management** - Assign users to markets or regions instead of individual stores
- **Scalable Access Control** - Easy to grant broad or narrow access as needed
- **Comprehensive Analytics** - Multi-store managers see aggregated performance data
- **Reduced Administration** - Fewer individual store assignments needed

#### **Security Benefits**
- **Principle of Least Privilege** - Users only access stores they need
- **Centralized Control** - Admins manage access at appropriate organizational levels
- **Audit Compliance** - Complete tracking of who can access what and when

---

## Version 2.3.0 - Enhanced PDF Export & Analytics Improvements (2025-08-26)

### **NEW FEATURES**

#### **PDF Export System for Heatmaps**
- **Comprehensive PDF Reports** - Export heatmap data with complete analytics
- **Header Information** - Includes selected weeks, areas, and stores without truncation
- **Activity Insights Integration** - Full AI-generated insights included in PDF
- **#1 Response Associate Stats** - Top performer metrics between insights and heatmap
- **Professional Layout** - Clean formatting with bold labels and optimized spacing
- **Generation Timestamp** - Date/time stamp at bottom for record keeping

#### **User Access Control Improvements**
- **Market-Level Access** - Market users now see all stores in their market instead of defaulting to single store
- **Non-Admin Store Restrictions** - QR code generation automatically uses user's assigned store
- **Read-Only Store Display** - Non-admins see their store number in read-only format
- **Insights Page Filtering** - Non-admins only see metrics for their accessible stores

### **TECHNICAL IMPROVEMENTS**

#### **PDF Generation** (`src/Heatmap.jsx`)
- **jsPDF Integration** - Professional PDF generation with proper formatting
- **html2canvas Support** - High-quality heatmap image capture for PDF
- **Smart Font Sizing** - Reduced font sizes (9pt) to maximize heatmap visibility
- **Bold Emphasis** - Bold formatting for "Weeks:", "Areas:", "Stores:" labels
- **Complete Data Display** - Shows all selected items without truncation
- **Optimized Layout** - Tighter spacing and improved readability

#### **User Access Logic** (`src/app.jsx`)
- **Enhanced Store Filtering** - Uses `allowedStores` array instead of single `storeNumber`
- **Market User Support** - Proper handling for market-level users with multiple store access
- **QR Generation Controls** - Conditional input display based on admin status
- **Data Filtering Updates** - Consistent access control across all features

#### **Response Analytics Integration**
- **Top Responder Analysis** - Calculates #1 response associate from filtered data
- **Response Time Metrics** - Average, fastest, and slowest response times
- **Response Count Tracking** - Total responses for performance ranking
- **Time Period Accuracy** - Stats match selected timeframe and stores

### **USER EXPERIENCE IMPROVEMENTS**

#### **PDF Export Workflow**
1. **Export Button** - Easy one-click PDF generation from heatmap
2. **Loading States** - Visual feedback during PDF generation process
3. **Error Handling** - User-friendly error messages for failed exports
4. **Filename Generation** - Automatic naming with store numbers and date

#### **Access Control UX**
- **Automatic Store Selection** - Non-admins don't need to input store numbers
- **Clear Visual Indicators** - Read-only displays show user's store assignment
- **Consistent Filtering** - All features respect user's store access permissions

### **DEPLOYMENT & PERFORMANCE**
- **Build Optimization** - Successful production build with optimized bundles
- **Firebase Hosting** - Updated static assets and function deployments
- **Index Management** - Skipped conflicting Firestore index updates
- **Error Recovery** - Graceful handling of deployment conflicts

---

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