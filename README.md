# QRcallbox

A real-time assistance system that enables customers to scan QR codes and instantly notify staff for help in specific store areas. Built with React, Firebase, and includes AI-powered insights for analyzing customer assistance patterns.

##  Features

### Core Functionality
- **QR Code Generation**: Create location-specific QR codes for different store areas
- **Real-time Notifications**: Instant alerts to staff when customers need assistance
- **User Authentication**: Secure login system with email verification and admin approval
- **Multi-store Support**: Manage multiple store locations from a single dashboard

### Analytics & Insights
- **Heatmap Visualization**: Visual representation of assistance requests by store area
- **AI-Powered Insights**: Natural language analysis of customer assistance patterns
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
   - Register with your store information
   - Wait for admin approval
   - Verify your email address

2. **Generate QR Codes**
   - Navigate to "Generate QR" tab
   - Enter store number (3-6 digits)
   - Enter area name (e.g., "Electronics", "Customer Service")
   - Generate and download/print the QR code poster

3. **Monitor Assistance Requests**
   - View real-time dashboard for active requests
   - Analyze patterns using the Insights tab
   - Configure GroupMe notifications in Settings

### For Customers

1. **Scan QR Code** placed in store areas
2. **Get Connected** to store staff instantly
3. **Receive Assistance** from available team members

### For Administrators

- **User Management**: Approve new user registrations
- **User Search**: Look up user information by email
- **System Overview**: Monitor all stores and areas

##  Security Features

- Email verification required for new accounts
- Admin approval process for new users
- Secure Firebase authentication
- Input validation and sanitization
- CORS configuration for API endpoints

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

##  Support

For support and questions:
- Create an issue in this repository
- Contact the development team
- Check the Firebase console for backend logs

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

- **v0.0.1** - Initial release with core QR generation and assistance features

---

**QRcallbox** - Transforming retail customer service through innovative QR code technology.