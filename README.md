# QRcallbox

A real-time assistance system that enables customers to scan QR codes and instantly notify staff for help in specific store areas. Built with React, Firebase, and includes AI-powered insights for analyzing customer assistance patterns.

## 📁 Project Structure

```
qrcall/
├── docs/                               # 📁 Project Documentation
│   ├── README.md                       # Documentation index
│   ├── CHANGELOG.md                    # Version history
│   ├── SECURITY.md                     # Security policies
│   ├── legal/                          # Legal documentation
│   ├── setup/                          # Integration guides
│   └── project/                        # Project management
├── functions/                          # Firebase Cloud Functions
│   ├── index.js                        # Main functions entry point
│   ├── groupme-webhook.js              # GroupMe webhook handler
│   ├── tickets.js                      # Ticket management functions
│   ├── workvivo-automation.js          # Workvivo integration
│   └── workvivo-monitor.js             # Workvivo monitoring
├── public/                             # Static assets
│   └── poster-template.png             # QR poster template image
├── src/                                # React application source
│   ├── components/                     # 📁 Organized React components
│   │   ├── auth/                       # Authentication components
│   │   │   ├── LoginForm.jsx           # Email/password sign-in form
│   │   │   ├── RegisterForm.jsx        # User registration with store hierarchy
│   │   │   └── AuthWrapper.jsx         # Authentication state wrapper
│   │   ├── layout/                     # Layout and navigation
│   │   │   ├── LandingPage.jsx         # Welcome page for unauthenticated users
│   │   │   ├── MainShell.jsx           # Primary application shell
│   │   │   └── PageHeader.jsx          # Consistent page headers
│   │   └── shared/                     # Reusable UI components
│   │       ├── FormField.jsx           # Standardized form inputs
│   │       ├── LoadingSpinner.jsx      # Loading state indicators
│   │       └── ErrorBoundary.jsx       # Error handling wrapper
│   ├── hooks/                          # 📁 Custom React hooks
│   │   ├── useAuth.js                  # Authentication operations
│   │   ├── useFirebase.js              # Firebase service connections
│   │   └── useUserProfile.js           # User data management
│   ├── config/                         # 📁 Configuration files
│   │   ├── firebase.config.js          # Firebase initialization
│   │   └── constants.js                # Application constants
│   ├── lib/
│   │   └── api.js                      # API utility functions
│   ├── app.jsx                         # Main application component
│   ├── main.jsx                        # React entry point
│   ├── storeHierarchy.js               # Store hierarchy management
│   ├── ThemeContext.jsx                # Theme management
│   ├── Button.jsx                      # Reusable button component
│   ├── PosterWithQR.jsx                # QR code poster generator
│   ├── Heatmap.jsx                     # Analytics heatmap visualization
│   ├── InsightsAI.jsx                  # AI-powered analytics insights
│   ├── GroupMeSetup.jsx                # GroupMe integration setup
│   ├── WorkvivoSetup.jsx               # Workvivo integration setup
│   ├── TicketQueue.jsx                 # Support ticket management
│   ├── MyTickets.jsx                   # User ticket dashboard
│   ├── ContactUs.jsx                   # Contact form component
│   ├── UnapprovedUsersList.jsx         # Admin user approval interface
│   └── index.css                       # Global styles
├── firebase.json                       # Firebase project configuration
├── firestore.rules                    # Firestore security rules
├── firestore.indexes.json             # Database indexes
├── package.json                       # Dependencies and scripts
└── vite.config.js                     # Vite build configuration
```

## 🔐 Hierarchical Access Control

QRcallbox supports sophisticated access control with four levels of permissions:

### Access Levels
- **🏪 Store Level**: Access to individual stores (traditional single-store access)
- **🏬 Market Level**: Access to all stores within a market (e.g., Market 120 includes 10 specific stores)
- **🌆 Region Level**: Access to all markets and stores within a region
- **🏢 BU Level**: Access to all stores across multiple regions within a business unit

### How It Works
1. **Registration**: Users select their access level during account creation
2. **Dynamic Interface**: UI adapts based on access level (single vs. multi-store)
3. **Smart Analytics**: Users see data from all their accessible stores
4. **Conditional Features**: QR generation only available for single-store users

### Example: Market 120
When a user selects "Market 120" during registration, they automatically gain access to these stores:
- 658, 756, 1215, 669, 2988, 5151, 5173, 1458, 1089, 3660

### Benefits
- **Simplified Management**: Assign users to markets or regions instead of individual stores
- **Scalable Access Control**: Easy to grant broad or narrow access as needed
- **Comprehensive Analytics**: Multi-store managers see aggregated performance data
- **Security**: Users only access stores they need, with server-side validation

##  Features

### Core Functionality
- **QR Code Generation**: Create location-specific QR codes for different store areas
- **Real-time Notifications**: Instant alerts to staff when customers need assistance
- **User Authentication**: Secure login system with email verification and admin approval
- **Hierarchical Store Management**: Multi-level access control (Store/Market/Region/BU)
- **Multi-store Support**: Comprehensive analytics across multiple store locations

### Analytics & Insights
- **Heatmap Visualization**: Visual representation of assistance requests by store area
- **AI-Powered Insights**: Natural language analysis of customer assistance patterns
- **📄 PDF Export Reports**: Print-ready professional reports for sharing data with stores
- **Top Responders Leaderboard**: Live ranking of fastest and most active associates with response time analytics
- **Business Hours Analytics**: Response time calculations filtered to business hours (6:00 AM - 10:59 PM)
- **Time-based Filtering**: Analyze data by specific weeks and time periods
- **Store/Area Filtering**: Filter insights by specific stores and departments

### Integration
- **GroupMe Integration**: Connect with GroupMe for team notifications
- **Firebase Backend**: Scalable cloud infrastructure with Firestore database
- **Print-Ready Posters**: Generate high-resolution QR code posters for printing

## 📊 Top Responders Leaderboard

The Top Responders feature provides gamification and performance tracking for your team by ranking associates based on their response activity and speed.

### Features
- **🥇 Live Rankings**: Real-time leaderboard showing top 5 most active responders
- **⏱️ Response Time Tracking**: Average, fastest, and slowest response times per associate
- **📅 Time Period Selection**: View performance for Daily, Weekly, Monthly, or All-Time periods
- **🕐 Business Hours Focus**: Analytics filtered to business hours (6:00 AM - 10:59 PM)
- **📱 Real-time Updates**: Leaderboard refreshes automatically as new responses are logged

### How It Works
1. **Customer requests assistance** by scanning a QR code
2. **Bot notifies the team** in GroupMe with location and timestamp
3. **Associate responds** with any message in the GroupMe chat
4. **Response is logged** with timing, responder name, and response details
5. **Leaderboard updates** showing updated rankings and statistics

### Displayed Information
- **Ranking badges** (🥇🥈🥉) for top performers
- **Total response count** for the selected time period
- **Average response time** in minutes
- **Response time range** (fastest to slowest) for each associate
- **Empty state message** when no responses exist for the selected period

### Data Privacy
- Only displays first names from GroupMe profiles
- Response times calculated from QR scan to first message
- All data filtered to business hours for relevant performance metrics

## 📄 PDF Export Reports

Generate professional, print-ready reports to share analytics data with store management, regional directors, or team members.

### Features
- **📊 Complete Heatmap Export**: Full-size heatmap visualization with optimal readability
- **🎯 AI-Powered Insights**: Comprehensive analytics with top areas, peak times, and trends
- **🏆 Top Performance Metrics**: #1 response associate stats with response times and call volume
- **📍 Store & Location Details**: Header includes selected stores, areas, and time periods
- **🖨️ Print-Optimized Format**: A4 landscape layout designed for standard office printers

### What's Included in PDF Reports
1. **Professional Header**
   - QRCallBox Report title
   - Selected stores (format: "Stores: 1458 - 1215 - 669")
   - Week numbers, areas, and time period filters

2. **AI-Generated Activity Insights**
   - Top performing areas with call volumes
   - Close second rankings for comparison
   - Busiest days and peak hours analysis
   - Professional formatting with indented secondary insights

3. **#1 Response Associate Highlight**
   - Top performer name and statistics
   - Total response count and average response time
   - Single-line format for easy reading

4. **Full-Size Heatmap Visualization**
   - Days of week header (Sat-Sun-Mon-Tue-Wed-Thu-Fri)
   - Time labels along the left side (6:00 AM - 11:00 PM)
   - High-contrast black numbers on colored backgrounds
   - Maximized size for detailed analysis while maintaining print safety

5. **Report Metadata**
   - Generation timestamp for record keeping
   - Automatic filename with store numbers and date

### How to Export
1. Navigate to the **Insights** tab
2. Apply desired filters (stores, areas, weeks)
3. Review the heatmap and insights
4. Click the **📄 Export to PDF** button
5. PDF automatically downloads with descriptive filename

### Technical Specifications
- **Format**: A4 Landscape (11.69" × 8.27")
- **Margins**: Print-safe 20pt margins (0.28")
- **Fonts**: Professional 8pt-16pt sizing for clarity
- **File Size**: Optimized for email sharing and printing
- **Compatibility**: Works with all standard office printers

### Use Cases
- **Store Management Reports**: Share weekly performance data with managers
- **Regional Analysis**: Distribute insights across multiple locations
- **Team Performance Reviews**: Highlight top responders and trends
- **Executive Summaries**: Professional format for leadership presentations
- **Historical Documentation**: Archive performance data for compliance

##  Tech Stack

### Frontend
- **React 18** - Modern UI framework
- **Vite** - Fast build tool and development server
- **Tailwind CSS** - Utility-first CSS framework
- **QRCode.js** - QR code generation library

### Backend & Services
- **Firebase Authentication** - User management and authentication
- **Firestore** - NoSQL database for real-time data
- **Firebase Functions** - Serverless backend functions
- **Firebase Hosting** - Static site hosting

### Development Tools
- **PostCSS** - CSS processing
- **Autoprefixer** - CSS vendor prefixing
- **ESLint** - Code linting (configured for functions)

##  Prerequisites

- Node.js 20 or higher
- Firebase CLI
- Firebase project with the following services enabled:
  - Authentication
  - Firestore Database
  - Functions
  - Hosting

##  Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Sinaptick/qrcallboxdotcom.git
   cd qrcallboxdotcom
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```

3. **Firebase Configuration**
   - Update the Firebase config in `src/app.jsx` with your project credentials
   - Ensure your Firebase project has the required services enabled

4. **Environment Variables**
   Set up the following Firebase Functions secrets:
   ```bash
   firebase functions:secrets:set GROUPME_CLIENT_ID
   ```

##  Development

### Start Development Server
```bash
npm run dev
```
This starts the Vite development server at `http://localhost:5173`

### Build for Production
```bash
npm run build
```
This builds the app and copies the poster template to the dist folder.

### Deploy to Firebase
```bash
firebase deploy
```

##  Usage

### For Store Staff

1. **Account Setup**
   - Register with hierarchical access level (Store/Market/Region/BU)
   - Choose your access scope during registration
   - Wait for admin approval and verify your email address

2. **Generate QR Codes** (Single-store users only)
   - Navigate to "Generate QR" tab (available for single-store access only)
   - Store number is pre-filled based on your access level
   - Enter area name (e.g., "Electronics", "Customer Service")
   - Generate and download/print the QR code poster

3. **Monitor Assistance Requests**
   - View real-time dashboard for active requests
   - Analyze patterns across all accessible stores using the Insights tab
   - Configure GroupMe notifications in Settings
   - Multi-store users see comprehensive analytics across their assigned locations

### For Customers

1. **Scan QR Code** placed in store areas
2. **Get Connected** to store staff instantly
3. **Receive Assistance** from available team members

### For Administrators

- **User Management**: Approve new user registrations
- **User Search**: Look up user information by email
- **System Overview**: Monitor all stores and areas

##  Security Features

### Account Security
- Email verification required for new accounts
- Admin approval process for new users
- Secure Firebase authentication
- Input validation and sanitization
- CORS configuration for API endpoints

### Spam & Abuse Protection
- **IP-based Rate Limiting**: 20 requests per minute per IP for QR scans, 10 requests per minute for other endpoints
- **Duplicate Scan Prevention**: 60-second cooldown per QR code to prevent spam notifications
- **Auto-blocking**: Automatic 24-hour IP blocks after 5 violations within an hour
- **Manual IP Management**: Admin interface for blocking/unblocking specific IP addresses
- **Comprehensive Logging**: All spam attempts and admin actions are logged for review
- **Temporary vs Permanent Blocks**: Configurable block duration (1 hour to permanent)

### Advanced Features
- **Suspicious Activity Tracking**: System monitors patterns and escalates repeat offenders
- **Admin Dashboard**: Real-time view of blocked IPs and spam logs
- **Firestore Security Rules**: Database-level access controls for spam protection data
- **Graceful Degradation**: Clear user feedback when rate limits are exceeded

##  Analytics Features

### Heatmap Visualization
- Visual representation of assistance request frequency
- Filter by store, area, and time period
- Interactive tooltips with detailed information

### AI Insights
- Natural language analysis of customer patterns
- Trend identification and recommendations
- Automated report generation based on filtered data

### Data Filtering
- **Store Filter**: Select one or multiple stores
- **Area Filter**: Choose specific departments or areas
- **Time Filter**: Analyze data by week ranges
- **Combined Filters**: Mix and match for detailed analysis

##  Configuration

### Firebase Functions Configuration
The app uses Firebase Functions for:
- QR token generation (`/api/mint`)
- Short URL handling (`/s`)
- GroupMe OAuth integration
- Bot creation and management

### GroupMe Integration
1. Create a GroupMe application
2. Set the callback URL to your Firebase Functions endpoint
3. Configure the client ID in Firebase Functions secrets
4. Use the OAuth flow to connect groups

#### Bot Storage Strategy
For optimal performance and reliability, GroupMe bots are stored in Firebase Firestore to enable:

- **🚀 Fast notification routing**: Instant store-to-bot mapping without API calls during QR scans
- **📊 Store-specific targeting**: Only relevant GroupMe chats receive notifications (e.g., store 2988 → "2988 Call Box Chat")
- **⚡ Rate limit management**: Avoids hitting GroupMe API limits during high-traffic periods
- **🔄 Offline resilience**: Cached bot data ensures notifications work even if GroupMe API is temporarily unavailable

**Database Structure:**
```javascript
// Collection: groupme_bots
{
  bot_id: "abc123...",           // GroupMe bot ID
  group_id: "109688330",         // GroupMe group ID  
  user_id: "97510571",          // GroupMe user ID
  firebase_uid: "Zp2HKo...",    // Firebase user ID
  name: "CallBot",               // Bot display name
  store: "2988",                 // Extracted from group name for routing
  createdAt: timestamp,
  synced: true                   // Synced from GroupMe API
}
```

When QR codes are scanned, the system queries `groupme_bots` where `store == "2988"` to instantly find the correct bot(s) to notify, ensuring sub-second response times even with hundreds of stores and groups.

## Project Structure

```
├── functions/              # Firebase Functions
│   ├── index.js           # Main functions file
│   └── package.json       # Functions dependencies
├── public/                # Static assets
│   └── poster-template.png # QR poster template
├── src/                   # React application
│   ├── components/        # React components
│   ├── lib/              # Utility libraries
│   ├── app.jsx           # Main application component
│   └── main.jsx          # Application entry point
├── firebase.json         # Firebase configuration
├── package.json          # Project dependencies
└── vite.config.js        # Vite configuration
```

##  Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

##  License

This project is proprietary software. All rights reserved.

##  Documentation

📁 **[Complete Documentation](./docs/)** - All project documentation organized by category

### Quick Links
- **[📋 Changelog](./docs/CHANGELOG.md)** - Version history and release notes
- **[🔒 Security](./docs/SECURITY.md)** - Security policies and vulnerability reporting
- **[⚙️ Setup Guides](./docs/setup/)** - Integration configuration (GroupMe, Workvivo)
- **[⚖️ Legal Documentation](./docs/legal/)** - Privacy, copyright, and trademark materials
- **[📊 Project Management](./docs/project/)** - Time logs and development tracking

##  Support

For support and questions:
- Create an issue in this repository  
- Contact the development team
- Check the Firebase console for backend logs
- Review documentation in the [docs folder](./docs/)

##  Scalability & Performance

### Scale Assessment
QRcallbox is designed to handle enterprise-level usage patterns:

#### **Supported Scale:**
- **Users**: 4,000+ concurrent users
- **Monthly Scans**: 100,000+ QR code scans
- **Real-time Operations**: Thousands of simultaneous assistance requests

#### **Architecture Strengths:**
- **Firebase Firestore**: Handles millions of operations per day with auto-scaling
- **Firebase Functions**: Serverless architecture with automatic scaling for traffic spikes
- **Static Frontend**: React build hosted on Firebase Hosting for unlimited scalability
- **Efficient Data Structure**: Optimized document design for fast queries and minimal costs

#### **Performance Optimizations:**
- **Cost-Effective**: ~$0.36 per 100K Firestore reads at scale
- **Lightweight Functions**: Stateless operations with minimal latency
- **Client-Side Rendering**: Reduces server load and improves response times

#### **Potential Considerations at Scale:**

**GroupMe API Integration:**
- Monitor rate limits with high message volume
- Implement exponential backoff for API reliability
- Consider message batching during peak periods

**Dashboard Performance:**
- Large datasets may slow real-time statistics
- Implement pagination for logs with 100K+ entries
- Consider aggregated statistics collection for faster loading

**Recommended Monitoring:**
- Firebase quota utilization
- GroupMe API response times
- Dashboard load performance with large datasets

#### **Growth Recommendations:**
1. **Add database indexes** for common query patterns (date ranges, store filters)
2. **Implement caching** for frequently accessed data
3. **Set up monitoring** for Firebase quotas and API performance
4. **Consider API request batching** for GroupMe during high-traffic periods

The current architecture is well-suited for significant growth and can handle enterprise-scale deployments with minimal modifications.

##  Version History

### v2.4.0 - Hierarchical Store Management System (Latest)
**New Features:**
- 🏢 **Multi-Level Access Control**: Users can be assigned Store, Market, Region, or BU level access
- 🔄 **Cascading Permissions**: Higher-level selections automatically include all subordinate stores
- 📊 **Intelligent UI Adaptation**: Interface adapts based on user access level
- 🎯 **Conditional QR Generation**: QR tab only appears for single-store users
- 📈 **Multi-Store Analytics**: Comprehensive insights across all accessible stores

**Technical Improvements:**
- New hierarchical data structure with Market 120 including 10 specific stores
- Enhanced registration flow with dynamic access level selection
- Server-side store access validation for QR generation
- Authentication requirements for all QR code generation
- Extended user database schema with allowedStores array

**Security Enhancements:**
- Server-side validation of store access permissions
- Token-based authentication for QR generation
- Scope-limited analytics based on user permissions
- Complete audit trail of store access

### v2.3.0 - Enhanced PDF Export & Analytics Improvements
**New Features:**
- 📄 **Professional PDF Export System**: Print-ready reports with comprehensive analytics and heatmap visualization
- 🎯 **Optimized Print Layout**: A4 landscape format with print-safe margins and high-contrast text
- 🏆 **Top Responder Integration**: #1 response associate stats included in PDF reports
- 🔍 **Enhanced User Access Control**: Market users see all stores in their market
- 📊 **Complete Activity Insights**: AI-generated insights with professional formatting

**PDF Export Features:**
- Full-size heatmap with black text for maximum readability
- Professional header with stores, weeks, and areas information
- AI-powered insights with indented secondary rankings
- Print-optimized margins and fonts for standard office printers
- Automatic filename generation with store numbers and dates

### v0.1.0 - Enhanced Security & Setup
**New Features:**
- 🛡️ **Advanced Spam Protection**: IP-based rate limiting, auto-blocking, and admin management
- 🚀 **Store Setup Guide**: Comprehensive 4-step implementation wizard
- 📊 **Admin Dashboard**: New "Spam Protection" tab with blocked IPs and activity logs
- 🔧 **Enhanced Print Support**: Fixed QR code poster printing issues

### v0.0.1 - Initial Release
- Initial release with core QR generation and assistance features

---

**QRcallbox** - Transforming retail customer service through innovative QR code technology.