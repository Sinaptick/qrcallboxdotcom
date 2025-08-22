# QRcallbox Security Changelog

## Version 2.0.0 - Security Hardening Release (2025-01-22)

### 🔒 **MAJOR SECURITY IMPROVEMENTS**

#### **Database Security**
- ✅ **Added Firestore Security Rules** (`firestore.rules`)
  - Users can only access their own data
  - Admin role validation moved to server-side
  - Logs and QR tokens are read-only from client (Functions-only write access)
  - Proper user ownership verification for GroupMe accounts and bots

#### **Authentication & Authorization** 
- ✅ **Firebase Authentication Middleware** added to sensitive endpoints
- ✅ **Server-side Admin Role Checking** - no longer bypassable from client
- ✅ **User Ownership Verification** for GroupMe accounts and bot operations
- ✅ **JWT Token Validation** on protected endpoints

#### **Input Validation & Sanitization**
- ✅ **Universal Input Sanitization** - all user inputs sanitized to prevent XSS
- ✅ **Server-side Validation** for store numbers and area names
- ✅ **Input Length Limits** enforced across all endpoints
- ✅ **HTML Output Escaping** to prevent injection attacks

#### **API Security**
- ✅ **Environment Variable Migration** - API key moved from hardcoded to `.env`
- ✅ **API Key Validation** on mint endpoint using Firebase Secrets
- ✅ **Secrets Management** via Firebase Secret Manager
- ✅ **Rate Limiting** implemented on all public endpoints

#### **CORS & Network Security**
- ✅ **Specific CORS Origins** - replaced wildcard with explicit allowed domains
- ✅ **Security Headers** added:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY` 
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`

#### **Error Handling & Logging**
- ✅ **Reduced Information Disclosure** in error messages
- ✅ **Sanitized Error Responses** 
- ✅ **Secure Logging** - sensitive data no longer logged

### 🔧 **TECHNICAL CHANGES**

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

### ⚠️ **BREAKING CHANGES**

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

### 🛡️ **VULNERABILITY FIXES**

| **Severity** | **Issue** | **Fix** |
|--------------|-----------|---------|
| **Critical** | No Firestore security rules | ✅ Comprehensive rules implemented |
| **Critical** | Public function access | ✅ Authentication middleware added |
| **High** | Hardcoded API key exposure | ✅ Moved to environment variables |
| **High** | Client-side admin bypass | ✅ Server-side validation added |
| **High** | No rate limiting | ✅ Rate limiting on all endpoints |
| **Medium** | Wildcard CORS | ✅ Specific origins only |
| **Medium** | XSS vulnerabilities | ✅ Input sanitization added |
| **Medium** | Information disclosure | ✅ Error messages sanitized |

### 📋 **DEPLOYMENT REQUIREMENTS**

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

### 🔍 **SECURITY TESTING**

- ✅ Database access controls verified
- ✅ API authentication tested
- ✅ Rate limiting functionality confirmed
- ✅ Input validation edge cases tested
- ✅ CORS restrictions validated
- ✅ Error handling security verified

### 📚 **SECURITY BEST PRACTICES IMPLEMENTED**

1. **Defense in Depth**: Multiple layers of security controls
2. **Principle of Least Privilege**: Users can only access their own data
3. **Input Validation**: All inputs validated both client and server side
4. **Secure Error Handling**: No sensitive information in error messages
5. **Rate Limiting**: Protection against abuse and DoS attacks
6. **Content Security**: XSS and injection attack prevention

### 🚀 **PERFORMANCE IMPACT**

- Minimal performance impact from security additions
- Rate limiting may affect high-frequency API usage
- Database queries optimized with proper indexes

---

## Previous Versions

### Version 1.x - Initial Implementation
- Basic QR code generation and scanning functionality
- GroupMe integration for notifications
- Firebase hosting and Firestore database
- User authentication and admin panel

---

*This changelog documents the comprehensive security hardening of QRcallbox, transforming it from a functional prototype to a production-ready, secure application.*