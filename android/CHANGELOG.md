# QRCallBox Android App - Changelog

All notable changes to the QRCallBox Android application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.2] - 2025-01-11

### Added
- Enhanced debug logging for auto-update system troubleshooting
- Comprehensive version check logging with detailed comparison output
- Debug traces for update API responses and version comparison logic

### Improved
- Auto-update system reliability with better error reporting
- Version comparison algorithm with detailed step-by-step logging

### Technical
- Added detailed logs for version check API calls and responses
- Enhanced error handling in update download and installation process

## [1.7.1] - 2025-01-11

### Added
- Semantic versioning system (1.7.x) instead of major version increments
- Auto-update system with version checking and APK download
- Automatic update prompts when new versions are available

### Improved
- Backend `getAppVersion` endpoint updated for semantic versioning support
- Enhanced update notification flow with proper version comparison

### Technical
- Updated versionCode to 18 for proper version tracking
- Implemented semantic version comparison algorithm

## [1.7.0] - 2025-01-11

### Added
- **Assist Buttons**: Interactive buttons on scan items to claim customer requests
- **Elapsed Timer Display**: Shows how long customers have been waiting for assistance
- **Real-time Updates**: Live Firestore listeners for instant scan list updates
- **Race Condition Protection**: Firestore transactions prevent multiple associates claiming same request
- **Enhanced UI Layout**: Improved scan item layout with assist functionality

### Fixed
- Recent Customer Requests now loads instantly instead of slowly
- Fixed timing issue where `loadRecentScans()` was called before user data loaded
- Added proper Firestore security rules for scans collection
- Resolved PERMISSION_DENIED errors when accessing scans
- Fixed UI positioning issues with settings screen toolbar

### Improved
- Real-time scan updates using Firestore snapshot listeners
- Atomic claim operations using Firestore transactions
- Better error handling and user feedback for assist operations
- Enhanced debug logging for scan loading and claiming

### Technical
- Migrated from one-time Firestore queries to real-time listeners
- Implemented Firestore transactions for race-condition-safe claiming
- Added comprehensive debug logging throughout the application
- Updated Firestore security rules to support scan read/update operations

## [1.6.0] - 2025-01-10

### Added
- **Work Schedule Auto-Save**: Automatic saving when schedule changes are made
- **Streamlined Schedule UI**: Improved layout showing checkbox and time controls on same line
- **Enhanced Settings Layout**: Fixed toolbar positioning to match main screen

### Removed
- Manual save button from work schedule settings
- Duplicate time displays in schedule configuration
- Bottom settings and logout buttons (moved to overflow menu)

### Fixed
- Settings screen toolbar positioning now matches main screen (52dp margin)
- Eliminated redundant time information display in work schedule
- Improved overall settings screen user experience

### Technical
- Implemented auto-save functionality for all settings changes
- Removed unnecessary UI elements and streamlined layout structure

## [1.5.0] - 2025-01-09

### Added
- Recent Customer Requests section with real-time scan display
- Enhanced notification system with better error handling
- Debug information panels for troubleshooting

### Fixed
- FCM token update reliability
- Notification delivery consistency
- User data loading timing issues

### Technical
- Improved Firestore integration
- Enhanced error logging and debugging capabilities

## [1.4.0] - 2025-01-08

### Added
- Test notification functionality for development and training
- Enhanced debug logging throughout the application
- Improved notification action handling

### Fixed
- Notification action button responsiveness
- Background notification processing
- User authentication flow

## [1.3.0] - 2025-01-07

### Added
- Material Design 3 theming and components
- Enhanced user interface with improved navigation
- Better error handling and user feedback

### Fixed
- Login flow stability
- Settings persistence
- Memory leak prevention

## [1.2.0] - 2025-01-06

### Added
- Work schedule management with weekly configuration
- Automatic shift detection and validation
- Settings screen with comprehensive configuration options

### Technical
- Implemented efficient schedule storage and retrieval
- Added local schedule validation for battery optimization

## [1.1.0] - 2025-01-05

### Added
- Firebase Cloud Messaging (FCM) integration
- Push notification support with action buttons
- Store-specific notification filtering

### Technical
- FCM token management and synchronization
- High-priority notification channel creation

## [1.0.0] - 2025-01-04

### Added
- Initial release of QRCallBox Android application
- Firebase Authentication integration
- Basic user registration and login
- Store number assignment and management

### Technical
- Android 7.0+ support (API level 24)
- Firebase Firestore integration
- ViewBinding implementation
- Kotlin coroutines for asynchronous operations

---

## Version History Summary

- **1.7.x**: Enhanced functionality with assist buttons, real-time updates, auto-update system
- **1.6.x**: UI improvements and auto-save functionality  
- **1.5.x**: Recent requests feature and notification reliability
- **1.4.x**: Testing and debugging enhancements
- **1.3.x**: Material Design and UI polish
- **1.2.x**: Schedule management system
- **1.1.x**: Push notification system
- **1.0.x**: Core application foundation

## Development Notes

### Deployment Process
1. Update `versionCode` and `versionName` in `build.gradle.kts`
2. Build APK: `./gradlew assembleDebug`
3. Copy APK to web hosting: `dist/app/QRCallBox-debug-v{version}.apk`
4. Update backend `getAppVersion` endpoint with new version info
5. Deploy backend and hosting: `firebase deploy`
6. Test auto-update functionality

### Testing Checklist
- [ ] Auto-update prompts appear for older versions
- [ ] Assist buttons function correctly with race condition protection
- [ ] Real-time scan updates work instantly
- [ ] Work schedule auto-save operates correctly
- [ ] Notification actions (assist/ignore) work properly
- [ ] Settings screen layout and functionality
- [ ] User authentication and token management

### Known Issues
- None currently reported

### Future Enhancements
- Enhanced analytics and usage tracking
- Offline mode support for basic functionality
- Dark mode theme support
- Multiple language localization
- Advanced notification customization options