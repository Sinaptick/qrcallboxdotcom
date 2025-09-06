# QRCall System - Claude Development Guide

## Project Overview
QRCall is a comprehensive QR code management system for retail stores with GroupMe integration for real-time notifications. The system allows stores to generate QR codes for customer callbacks and automatically notifies store groups via GroupMe bots when customers scan the codes.

## Tech Stack
- **Frontend**: React 18 with Vite build system
- **Backend**: Firebase Cloud Functions (Node.js 22)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Hosting**: Firebase Hosting
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

### Database Collections (Firestore)
- `users` - User profiles and store assignments
- `groupme_bots` - Bot registry with store associations
- `groupme_tokens` - GroupMe OAuth tokens
- `scans` - QR code scan events and analytics
- `tickets` - Support ticket system
- `pending_changes` - Profile change requests

## Development Workflow

### Key Commands
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

### Branch Strategy
- `main` - Production branch
- `performance-improvements` - Current development branch
- Always commit and push changes before deploying

## GroupMe Integration

### Bot Management Flow
1. **User Setup**: Users connect GroupMe via OAuth
2. **Store Assignment**: Users are assigned to store numbers
3. **Bot Creation**: Admin can create bots for users or themselves
4. **QR Notifications**: Bots send messages when QR codes are scanned

### Admin Capabilities
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

### Admin Panel
- Circular dependency issues resolved by extracting components
- Store-based lookup more practical than individual user lookup
- Smart loading prevents unnecessary API calls

## Security Notes
- Admin-only endpoints verify user permissions
- Rate limiting prevents abuse
- GroupMe tokens stored securely in Firestore
- CORS restricted to allowed origins only

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

---

This guide should help Claude understand the project context and make informed decisions about code changes, deployments, and architectural improvements.