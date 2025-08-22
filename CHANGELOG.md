# Changelog

All notable changes to QRcallbox will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project structure and documentation
- Comprehensive README with installation and usage instructions
- GroupMe integration setup guide and documentation

### Changed
- N/A

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- N/A

## [0.0.1] - 2025-01-22

### Added
- **Core QR Code System**
  - QR code generation for store locations and areas
  - Token-based tracking system for assistance requests
  - High-resolution poster template for printing QR codes
  - Short URL handling for QR code redirects (`/s` endpoint)

- **User Authentication & Management**
  - Firebase Authentication with email/password
  - User registration with store information and job details
  - Admin approval system for new user accounts
  - Email verification requirement for new registrations
  - Role-based access control (admin vs regular users)

- **Real-time Dashboard**
  - Live assistance request monitoring
  - Multi-tab interface (Dashboard, Insights, Generate QR, Settings, Admin)
  - User status and activity tracking
  - Admin tools for user management

- **Analytics & Insights**
  - Interactive heatmap visualization of assistance requests
  - AI-powered insights for customer assistance patterns
  - Time-based filtering (weekly analysis)
  - Store and area-based filtering capabilities
  - Data export and trend analysis

- **GroupMe Integration**
  - OAuth 2.0 flow for GroupMe account connection
  - Automated bot creation in selected GroupMe groups
  - Real-time notifications when QR codes are scanned
  - Multi-group support for different store teams
  - Secure token storage and management

- **Firebase Infrastructure**
  - Firestore database for real-time data storage
  - Firebase Functions for serverless backend operations
  - Firebase Hosting for web application deployment
  - Cloud Functions for API endpoints and webhook handling

- **Frontend Features**
  - React 18 with modern hooks and state management
  - Responsive design with Tailwind CSS
  - Error boundary for graceful error handling
  - Loading states and user feedback
  - Print-friendly QR poster generation

- **Security Features**
  - Input validation and sanitization
  - CORS configuration for API security
  - Secure API key management
  - Protected routes and authentication guards
  - Rate limiting and abuse prevention

### Technical Stack
- **Frontend**: React 18, Vite, Tailwind CSS
- **Backend**: Firebase Functions (Node.js 20)
- **Database**: Firestore (NoSQL)
- **Authentication**: Firebase Auth
- **Hosting**: Firebase Hosting
- **Integration**: GroupMe API
- **Build Tools**: Vite, PostCSS, Autoprefixer

### Development Setup
- Vite development server with hot reload
- Firebase emulator support for local development
- ESLint configuration for code quality
- Environment variable management
- Git repository with proper .gitignore

---

## How to Update This Changelog

When adding new features or making changes:

1. **Add entries under [Unreleased]** section first
2. **Use these categories**:
   - `Added` for new features
   - `Changed` for changes in existing functionality  
   - `Deprecated` for soon-to-be removed features
   - `Removed` for now removed features
   - `Fixed` for any bug fixes
   - `Security` for vulnerability fixes

3. **When releasing a version**:
   - Move items from [Unreleased] to a new version section
   - Add release date in YYYY-MM-DD format
   - Create new empty [Unreleased] section

### Example Entry Format:
```markdown
### Added
- **Feature Category**: Brief description of what was added
- **Component Name**: Specific functionality or improvement
```

### Commit Message Convention:
- `feat:` for new features → goes in `Added`
- `fix:` for bug fixes → goes in `Fixed`  
- `docs:` for documentation → goes in `Changed`
- `refactor:` for code refactoring → goes in `Changed`
- `security:` for security improvements → goes in `Security`