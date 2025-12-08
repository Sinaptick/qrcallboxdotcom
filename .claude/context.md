# QRCall Project Context

When starting a new conversation about this project, please read these files in order:

## Critical Documentation (MUST READ)

1. **CLAUDE.md** - Main development guide with architecture, conventions, and patterns
2. **docs/DATA_SCHEMA.md** - **CRITICAL**: Cross-platform data consistency reference
3. **README.md** - Project overview and feature summary

## Implementation Status

4. **docs/IMPLEMENTATION_STATUS_2025-01-11.md** - Recent work (Gmail blocking, multi-store, store switching)
5. **docs/STORE_SWITCHING_IMPLEMENTATION.md** - Multi-store feature design

## Platform-Specific

6. **Android**: `/Users/shanesmith/AndroidStudioProjects/QRCallBox/README.md`
7. **iOS/Flutter**: `apple/APPLECLAUDE.md` (if working on iOS)

## Security & Operations

8. **docs/GOOGLE_SIGNIN_BLOCKING.md** - Authentication security notes
9. **SECURITY_IMPLEMENTATION_SUMMARY.md** - Security audit summary

## Current Working Directory

```
/Users/shanesmith/Documents/qrcall
```

## Key Principles

⚠️ **DATA CONSISTENCY**: Always check DATA_SCHEMA.md before modifying data structures
⚠️ **THREE PLATFORMS**: Web (React) + Android (Kotlin) + Backend (Node.js)
⚠️ **FIELD NAMES**: Must match exactly across all platforms

## Quick Start Command

After reading these files, you should understand:
- System architecture (Web + Android + Backend + GroupMe + Workvivo)
- Data schema and field naming conventions
- Recent implementation work
- Current development status
