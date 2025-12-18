import React from "react";
import { useTheme, ThemeProvider } from "./ThemeContext.jsx";

function DocumentationContent() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className={`min-h-screen ${isDark ? 'dark' : ''}`}>
      <div className="min-h-screen bg-primary text-primary">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-secondary border-b border-themed">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-primary">QRCallBox</span>
            </a>
            <div className="flex items-center gap-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-tertiary hover:bg-secondary border border-themed transition-colors"
                title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {isDark ? (
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              <a href="/" className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-colors text-sm font-medium">
                Back to App
              </a>
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 text-white py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">QRCallBox Documentation</h1>
            <p className="text-xl md:text-2xl text-indigo-100 max-w-3xl mx-auto">
              Real-time customer assistance system for retail stores with multi-platform notifications
            </p>
          </div>
        </section>

        {/* Quick Links */}
        <section className="py-8 bg-secondary border-b border-themed">
          <div className="max-w-6xl mx-auto px-4">
            <div className="flex flex-wrap justify-center gap-3">
              <a href="#overview" className="px-4 py-2 rounded-lg bg-tertiary hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-themed transition-colors text-sm font-medium">Overview</a>
              <a href="#architecture" className="px-4 py-2 rounded-lg bg-tertiary hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-themed transition-colors text-sm font-medium">Architecture</a>
              <a href="#security" className="px-4 py-2 rounded-lg bg-tertiary hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-themed transition-colors text-sm font-medium">Security</a>
              <a href="#platforms" className="px-4 py-2 rounded-lg bg-tertiary hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-themed transition-colors text-sm font-medium">Platforms</a>
              <a href="#integrations" className="px-4 py-2 rounded-lg bg-tertiary hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-themed transition-colors text-sm font-medium">Integrations</a>
              <a href="#cost" className="px-4 py-2 rounded-lg bg-tertiary hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-themed transition-colors text-sm font-medium">Cost Analysis</a>
              <a href="#performance" className="px-4 py-2 rounded-lg bg-tertiary hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-themed transition-colors text-sm font-medium">Performance</a>
              <a href="#api" className="px-4 py-2 rounded-lg bg-tertiary hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-themed transition-colors text-sm font-medium">API Reference</a>
              <a href="#future" className="px-4 py-2 rounded-lg bg-tertiary hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border border-themed transition-colors text-sm font-medium">Future</a>
            </div>
          </div>
        </section>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-4 py-12">

          {/* Overview Section */}
          <section id="overview" className="mb-16">
            <h2 className="text-3xl font-bold text-primary mb-6">System Overview</h2>
            <div className="bg-secondary rounded-2xl border border-themed p-6 md:p-8">
              <p className="text-lg text-muted mb-6">
                QRCallBox is a comprehensive QR code management system designed for retail stores, enabling real-time customer assistance through multi-platform notifications.
              </p>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <h3 className="font-semibold text-primary mb-3">How It Works</h3>
                  <ol className="space-y-2 text-sm text-muted">
                    <li>1. Stores generate QR codes for specific areas</li>
                    <li>2. Customers scan QR codes when they need assistance</li>
                    <li>3. Store employees receive instant notifications</li>
                    <li>4. Employees respond and provide assistance</li>
                    <li>5. Analytics track response times and patterns</li>
                  </ol>
                </div>
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <h3 className="font-semibold text-primary mb-3">Key Features</h3>
                  <ul className="space-y-2 text-sm text-muted">
                    <li>• Multi-platform notifications (Android, iOS, GroupMe, Workvivo)</li>
                    <li>• Real-time response coordination</li>
                    <li>• Analytics dashboard with heatmaps</li>
                    <li>• Work schedule-based notification filtering</li>
                    <li>• Multi-store support for regional managers</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Architecture Section */}
          <section id="architecture" className="mb-16">
            <h2 className="text-3xl font-bold text-primary mb-6">System Architecture</h2>
            <div className="bg-secondary rounded-2xl border border-themed p-6 md:p-8">
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-primary mb-4">Technology Stack</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-tertiary rounded-xl p-4 border border-themed text-center">
                    <div className="font-medium text-primary">Frontend</div>
                    <div className="text-sm text-muted">React 18 + Vite</div>
                  </div>
                  <div className="bg-tertiary rounded-xl p-4 border border-themed text-center">
                    <div className="font-medium text-primary">Backend</div>
                    <div className="text-sm text-muted">Firebase Cloud Functions</div>
                  </div>
                  <div className="bg-tertiary rounded-xl p-4 border border-themed text-center">
                    <div className="font-medium text-primary">Database</div>
                    <div className="text-sm text-muted">Firestore</div>
                  </div>
                  <div className="bg-tertiary rounded-xl p-4 border border-themed text-center">
                    <div className="font-medium text-primary">Mobile</div>
                    <div className="text-sm text-muted">Android (Kotlin) / iOS (Flutter)</div>
                  </div>
                </div>
              </div>
              <div className="bg-tertiary rounded-xl p-6 border border-themed">
                <h3 className="text-lg font-semibold text-primary mb-4">Notification Flow</h3>
                <pre className="text-xs sm:text-sm text-muted overflow-x-auto font-mono">
{`Customer QR Scan -> Firebase Function -> Notification Hub
                                              |
                   +--------------+-----------+-----------+
                   |              |                       |
                GroupMe       Workvivo              FCM Push
                  Bot           Post              Android/iOS`}
                </pre>
              </div>
            </div>
          </section>

          {/* Security Section */}
          <section id="security" className="mb-16">
            <h2 className="text-3xl font-bold text-primary mb-6">Security</h2>
            <div className="bg-secondary rounded-2xl border border-themed p-6 md:p-8">
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div>
                  <h3 className="text-lg font-semibold text-primary mb-4">Authentication & Authorization</h3>
                  <ul className="space-y-2 text-sm text-muted">
                    <li>✓ Firebase Authentication for user management</li>
                    <li>✓ Server-side admin role validation</li>
                    <li>✓ JWT token verification on protected endpoints</li>
                    <li>✓ User ownership verification for resources</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-primary mb-4">Database Security</h3>
                  <ul className="space-y-2 text-sm text-muted">
                    <li>✓ Firestore Security Rules enforcing data access</li>
                    <li>✓ Users can only access their own store data</li>
                    <li>✓ Admin-only access to sensitive operations</li>
                    <li>✓ Atomic updates prevent race conditions</li>
                  </ul>
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-primary mb-4">API Security</h3>
                  <ul className="space-y-2 text-sm text-muted">
                    <li>✓ Environment variable-based secret management</li>
                    <li>✓ API key validation on sensitive endpoints</li>
                    <li>✓ Rate limiting protection (10-20 req/min)</li>
                    <li>✓ Specific CORS origins (no wildcards)</li>
                  </ul>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-primary mb-4">Network Security</h3>
                  <ul className="space-y-2 text-sm text-muted">
                    <li>✓ X-Content-Type-Options: nosniff</li>
                    <li>✓ X-Frame-Options: DENY</li>
                    <li>✓ X-XSS-Protection: 1; mode=block</li>
                    <li>✓ Referrer-Policy: strict-origin-when-cross-origin</li>
                  </ul>
                </div>
              </div>
              <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-700">
                <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">Reporting Security Issues</h4>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  For security vulnerabilities, please contact the development team directly at sinaptick@gmail.com rather than creating public issues.
                </p>
              </div>
            </div>
          </section>

          {/* Platforms Section */}
          <section id="platforms" className="mb-16">
            <h2 className="text-3xl font-bold text-primary mb-6">Supported Platforms</h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="bg-secondary rounded-2xl border border-themed p-6">
                <h3 className="text-xl font-semibold text-primary mb-2">Web Application</h3>
                <p className="text-sm text-muted mb-4">Full-featured admin dashboard and QR code management</p>
                <ul className="space-y-1 text-xs text-muted">
                  <li>• Dashboard with analytics</li>
                  <li>• QR code generation</li>
                  <li>• User management</li>
                  <li>• GroupMe integration</li>
                </ul>
                <a href="/" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">Access Web App</a>
              </div>
              <div className="bg-secondary rounded-2xl border border-themed p-6">
                <h3 className="text-xl font-semibold text-primary mb-2">Android App</h3>
                <p className="text-sm text-muted mb-4">Native Kotlin app with push notifications</p>
                <ul className="space-y-1 text-xs text-muted">
                  <li>• Real-time push notifications</li>
                  <li>• Assist/Ignore actions</li>
                  <li>• Work schedule filtering</li>
                  <li>• Auto-update system</li>
                </ul>
                <div className="mt-4 text-sm text-muted">Version: 1.8.11</div>
                <a href="/app" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">Download APK</a>
              </div>
              <div className="bg-secondary rounded-2xl border border-themed p-6">
                <h3 className="text-xl font-semibold text-primary mb-2">iOS App</h3>
                <p className="text-sm text-muted mb-4">Flutter-based iOS and iPadOS app</p>
                <ul className="space-y-1 text-xs text-muted">
                  <li>• Apple Sign-In support</li>
                  <li>• Dark mode</li>
                  <li>• Push notifications</li>
                  <li>• Admin panel access</li>
                </ul>
                <div className="mt-4 text-sm text-muted">Version: 1.8.1+2</div>
                <span className="mt-2 inline-block text-sm text-gray-400">TestFlight (Coming Soon)</span>
              </div>
            </div>
          </section>

          {/* Integrations Section */}
          <section id="integrations" className="mb-16">
            <h2 className="text-3xl font-bold text-primary mb-6">Integrations</h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-secondary rounded-2xl border border-themed p-6">
                <h3 className="text-xl font-semibold text-primary mb-2">GroupMe</h3>
                <p className="text-sm text-muted mb-4">Team messaging integration for store groups. Bots automatically post customer assistance requests.</p>
                <ul className="space-y-1 text-xs text-muted">
                  <li>• OAuth-based authentication</li>
                  <li>• Automatic bot creation</li>
                  <li>• Store-specific group targeting</li>
                  <li>• Admin bot management</li>
                </ul>
              </div>
              <div className="bg-secondary rounded-2xl border border-themed p-6">
                <h3 className="text-xl font-semibold text-primary mb-2">Workvivo</h3>
                <p className="text-sm text-muted mb-4">Enterprise collaboration platform integration for company-wide feeds.</p>
                <ul className="space-y-1 text-xs text-muted">
                  <li>• Enterprise SSO support</li>
                  <li>• Configurable post targeting</li>
                  <li>• Activity feed integration</li>
                  <li>• Store-specific channels</li>
                </ul>
              </div>
              <div className="bg-secondary rounded-2xl border border-themed p-6">
                <h3 className="text-xl font-semibold text-primary mb-2">Firebase Cloud Messaging</h3>
                <p className="text-sm text-muted mb-4">Push notification delivery to Android and iOS devices.</p>
                <ul className="space-y-1 text-xs text-muted">
                  <li>• Multi-device support</li>
                  <li>• Background notification handling</li>
                  <li>• Action button support</li>
                  <li>• Topic-based targeting</li>
                </ul>
              </div>
              <div className="bg-secondary rounded-2xl border border-themed p-6">
                <h3 className="text-xl font-semibold text-primary mb-2">Firebase Authentication</h3>
                <p className="text-sm text-muted mb-4">Secure user authentication across all platforms.</p>
                <ul className="space-y-1 text-xs text-muted">
                  <li>• Email/password authentication</li>
                  <li>• Google Sign-In</li>
                  <li>• Apple Sign-In (iOS)</li>
                  <li>• Email verification</li>
                </ul>
              </div>
            </div>
          </section>


          {/* Cost Analysis Section */}
          <section id="cost" className="mb-16">
            <h2 className="text-3xl font-bold text-primary mb-6">Cost Analysis</h2>
            <div className="bg-secondary rounded-2xl border border-themed p-6 md:p-8">
              <p className="text-lg text-muted mb-6">
                QRCallBox provides massive cost savings compared to traditional hardware solutions like Motorola radio call boxes.
              </p>
              
              {/* Traditional Hardware Costs */}
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-primary mb-4">Traditional Hardware: Motorola Radio Call Boxes</h3>
                <div className="bg-tertiary rounded-xl p-5 border border-themed mb-4">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-primary mb-3">Unit Costs</h4>
                      <ul className="space-y-2 text-sm text-muted">
                        <li>• Cost per call box: <span className="font-semibold text-primary">~$400</span></li>
                        <li>• Standard stores (75%): 5 units minimum</li>
                        <li>• Large stores (25%): 12-15 units needed</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium text-primary mb-3">Scale: 4,500 Stores</h4>
                      <ul className="space-y-2 text-sm text-muted">
                        <li>• 3,375 stores × 5 units = 16,875 units</li>
                        <li>• 1,125 stores × 13.5 avg = 15,188 units</li>
                        <li>• <span className="font-semibold text-primary">Total: ~32,000 units</span></li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-5 border border-red-200 dark:border-red-700">
                  <div className="text-center">
                    <div className="text-sm text-red-600 dark:text-red-400 mb-1">Traditional Hardware Total Cost</div>
                    <div className="text-4xl font-bold text-red-700 dark:text-red-300">$12,800,000</div>
                    <div className="text-xs text-red-500 dark:text-red-400 mt-1">One-time hardware purchase (excludes maintenance, replacement, installation)</div>
                  </div>
                </div>
              </div>

              {/* QRCallBox Firebase Costs */}
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-primary mb-4">QRCallBox: Cloud-Based Solution</h3>
                <div className="bg-tertiary rounded-xl p-5 border border-themed mb-4">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-primary mb-3">Usage Estimates (4,500 stores)</h4>
                      <ul className="space-y-2 text-sm text-muted">
                        <li>• ~100 scans/store/day</li>
                        <li>• <span className="font-semibold">164.25 million scans/year</span></li>
                        <li>• ~1.64 billion Firestore reads/year</li>
                        <li>• ~328 million Firestore writes/year</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium text-primary mb-3">Firebase Pricing</h4>
                      <ul className="space-y-2 text-sm text-muted">
                        <li>• Firestore reads: $0.06/100K</li>
                        <li>• Firestore writes: $0.18/100K</li>
                        <li>• Cloud Functions: $0.40/million</li>
                        <li>• FCM Push Notifications: <span className="text-green-600 font-medium">FREE</span></li>
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="bg-tertiary rounded-xl p-5 border border-themed mb-4">
                  <h4 className="font-medium text-primary mb-3">Annual Cost Breakdown (100 scans/store/day)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-themed">
                          <th className="text-left py-2 text-muted">Service</th>
                          <th className="text-right py-2 text-muted">Usage</th>
                          <th className="text-right py-2 text-muted">Annual Cost</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted">
                        <tr className="border-b border-themed/50">
                          <td className="py-2">Firestore Reads</td>
                          <td className="text-right">1.64B reads</td>
                          <td className="text-right">~$986</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2">Firestore Writes</td>
                          <td className="text-right">328M writes</td>
                          <td className="text-right">~$590</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2">Cloud Functions</td>
                          <td className="text-right">164M invocations</td>
                          <td className="text-right">~$66</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2">Hosting & Storage</td>
                          <td className="text-right">—</td>
                          <td className="text-right">~$360</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2">FCM Notifications</td>
                          <td className="text-right">Unlimited</td>
                          <td className="text-right text-green-600">$0</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2 font-medium">Subtotal</td>
                          <td className="text-right">—</td>
                          <td className="text-right font-medium">~$2,002</td>
                        </tr>
                        <tr>
                          <td className="py-2">Buffer (2x for spikes)</td>
                          <td className="text-right">—</td>
                          <td className="text-right">~$2,002</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-5 border border-green-200 dark:border-green-700">
                  <div className="text-center">
                    <div className="text-sm text-green-600 dark:text-green-400 mb-1">QRCallBox Annual Operating Cost</div>
                    <div className="text-4xl font-bold text-green-700 dark:text-green-300">~$4,000/year</div>
                    <div className="text-xs text-green-500 dark:text-green-400 mt-1">Includes 2x buffer for usage spikes and growth</div>
                  </div>
                </div>
              </div>

              {/* Savings Summary */}
              <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
                <h3 className="text-xl font-semibold mb-4 text-center">Total Savings Summary</h3>
                <div className="grid md:grid-cols-3 gap-6 text-center">
                  <div>
                    <div className="text-3xl font-bold">$12.8M</div>
                    <div className="text-sm text-indigo-200">Hardware Cost Avoided</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">99.97%</div>
                    <div className="text-sm text-indigo-200">Cost Reduction</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold">3,200 yrs</div>
                    <div className="text-sm text-indigo-200">To Break Even on Hardware</div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-white/20 text-center text-sm text-indigo-100">
                  At $4,000/year operating cost vs $12.8M hardware, QRCallBox pays for itself instantly
                </div>
              </div>


              {/* Conservative Estimate */}
              <div className="mt-8 mb-8">
                <h3 className="text-xl font-semibold text-primary mb-4">Conservative Estimate: 30 Scans/Store/Day</h3>
                <div className="bg-tertiary rounded-xl p-5 border border-themed mb-4">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-primary mb-3">Reduced Usage Scenario</h4>
                      <ul className="space-y-2 text-sm text-muted">
                        <li>• 30 scans/store/day (vs 100)</li>
                        <li>• <span className="font-semibold">49.3 million scans/year</span></li>
                        <li>• ~493 million Firestore reads/year</li>
                        <li>• ~99 million Firestore writes/year</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium text-primary mb-3">Annual Cost at 30 Scans/Day</h4>
                      <ul className="space-y-2 text-sm text-muted">
                        <li>• Firestore reads: ~$296</li>
                        <li>• Firestore writes: ~$178</li>
                        <li>• Cloud Functions: ~$20</li>
                        <li>• Hosting & Storage: ~$360</li>
                        <li className="pt-2 border-t border-themed">
                          <span className="font-semibold text-green-600">Total (with 2x buffer): ~$1,700/year</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Revenue Impact */}
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-primary mb-4">Revenue Impact: Sales from Assisted Customers</h3>
                <p className="text-sm text-muted mb-4">
                  Each QR scan represents a customer who needs help—and help converts to sales. Conservative estimate: $5.58 average purchase per assisted customer (Average Unit Retail).
                </p>
                <div className="bg-tertiary rounded-xl p-5 border border-themed mb-4">
                  <h4 className="font-medium text-primary mb-4">Annual Sales Impact (Conservative: 30 scans/store/day)</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-themed">
                          <th className="text-left py-2 text-muted">Metric</th>
                          <th className="text-right py-2 text-muted">Value</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted">
                        <tr className="border-b border-themed/50">
                          <td className="py-2">Scans per store per day</td>
                          <td className="text-right">30</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2">Total stores</td>
                          <td className="text-right">4,500</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2">Daily scans (all stores)</td>
                          <td className="text-right font-medium">135,000</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2">Annual scans</td>
                          <td className="text-right font-medium">49,275,000</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2">Average purchase per assist (Average Unit Retail)</td>
                          <td className="text-right">$5.58</td>
                        </tr>
                        <tr className="bg-green-50 dark:bg-green-900/20">
                          <td className="py-3 font-semibold text-green-700 dark:text-green-300">Annual Sales Impact</td>
                          <td className="text-right text-xl font-bold text-green-700 dark:text-green-300">$274,954,500</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ROI Summary */}
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white">
                  <h3 className="text-xl font-semibold mb-4 text-center">Return on Investment</h3>
                  <div className="grid md:grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">$1,700</div>
                      <div className="text-xs text-green-100">Annual Cost</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">$275.0M</div>
                      <div className="text-xs text-green-100">Annual Sales Impact</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">16,173,794%</div>
                      <div className="text-xs text-green-100">ROI</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold">$61K/store</div>
                      <div className="text-xs text-green-100">Sales per Store/Year</div>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/20 text-center text-sm text-green-100">
                    Even at just 10% conversion rate, that's <span className="font-bold">$27.5M</span> in additional annual sales
                  </div>
                </div>

                {/* Comparison Table */}
                <div className="mt-6 bg-tertiary rounded-xl p-5 border border-themed">
                  <h4 className="font-medium text-primary mb-4">Sales Impact at Different Scan Rates</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-themed">
                          <th className="text-left py-2 text-muted">Scans/Store/Day</th>
                          <th className="text-right py-2 text-muted">Annual Scans</th>
                          <th className="text-right py-2 text-muted">Operating Cost</th>
                          <th className="text-right py-2 text-muted">Sales @ $5.58</th>
                          <th className="text-right py-2 text-muted">Per Store</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted">
                        <tr className="border-b border-themed/50">
                          <td className="py-2">10 (minimal)</td>
                          <td className="text-right">16.4M</td>
                          <td className="text-right">~$600</td>
                          <td className="text-right text-green-600 font-medium">$91.5M</td>
                          <td className="text-right">$20K</td>
                        </tr>
                        <tr className="border-b border-themed/50 bg-blue-50 dark:bg-blue-900/10">
                          <td className="py-2 font-medium">30 (conservative)</td>
                          <td className="text-right">49.3M</td>
                          <td className="text-right">~$1,700</td>
                          <td className="text-right text-green-600 font-medium">$275.1M</td>
                          <td className="text-right">$61K</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2">50 (moderate)</td>
                          <td className="text-right">82.1M</td>
                          <td className="text-right">~$2,500</td>
                          <td className="text-right text-green-600 font-medium">$458.1M</td>
                          <td className="text-right">$102K</td>
                        </tr>
                        <tr>
                          <td className="py-2">100 (high usage)</td>
                          <td className="text-right">164.3M</td>
                          <td className="text-right">~$4,000</td>
                          <td className="text-right text-green-600 font-medium">$916.8M</td>
                          <td className="text-right">$204K</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted mt-3">
                    * Sales figures assume 100% of scans result in a purchase. Actual conversion rates vary, but even 10-25% conversion delivers massive ROI.
                  </p>
                </div>
              </div>

              {/* Additional Benefits */}
              <div className="mt-6 grid md:grid-cols-2 gap-4">
                <div className="bg-tertiary rounded-xl p-4 border border-themed">
                  <h4 className="font-medium text-primary mb-2">Hardware Hidden Costs (Avoided)</h4>
                  <ul className="space-y-1 text-xs text-muted">
                    <li>• Installation labor per store</li>
                    <li>• Battery replacements</li>
                    <li>• Device repairs/replacements</li>
                    <li>• IT support and maintenance</li>
                    <li>• Inventory management</li>
                  </ul>
                </div>
                <div className="bg-tertiary rounded-xl p-4 border border-themed">
                  <h4 className="font-medium text-primary mb-2">QRCallBox Advantages</h4>
                  <ul className="space-y-1 text-xs text-muted">
                    <li>• Zero hardware to purchase or maintain</li>
                    <li>• Uses employees' existing smartphones</li>
                    <li>• Automatic updates, no manual upgrades</li>
                    <li>• Analytics included at no extra cost</li>
                    <li>• Scales instantly with demand</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* Performance Metrics Section */}
          <section id="performance" className="mb-16">
            <h2 className="text-3xl font-bold text-primary mb-6">Performance at Scale</h2>
            <div className="bg-secondary rounded-2xl border border-themed p-6 md:p-8">
              <p className="text-lg text-muted mb-6">
                QRCallBox is designed to handle enterprise-scale deployments with consistent, fast performance.
              </p>

              {/* Scale Overview */}
              <div className="bg-tertiary rounded-xl p-5 border border-themed mb-6">
                <h3 className="text-lg font-semibold text-primary mb-4">Enterprise Scale Scenario</h3>
                <div className="grid sm:grid-cols-4 gap-4 text-center">
                  <div className="bg-secondary rounded-lg p-4 border border-themed">
                    <div className="text-3xl font-bold text-indigo-600">4,500</div>
                    <div className="text-xs text-muted">Stores</div>
                  </div>
                  <div className="bg-secondary rounded-lg p-4 border border-themed">
                    <div className="text-3xl font-bold text-indigo-600">450K</div>
                    <div className="text-xs text-muted">Active Users</div>
                  </div>
                  <div className="bg-secondary rounded-lg p-4 border border-themed">
                    <div className="text-3xl font-bold text-indigo-600">450K</div>
                    <div className="text-xs text-muted">Scans/Day</div>
                  </div>
                  <div className="bg-secondary rounded-lg p-4 border border-themed">
                    <div className="text-3xl font-bold text-indigo-600">164M</div>
                    <div className="text-xs text-muted">Scans/Year</div>
                  </div>
                </div>
              </div>

              {/* Speed Metrics */}
              <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <h3 className="text-lg font-semibold text-primary mb-4">Response Time Breakdown</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted">QR Scan to Cloud Function</span>
                        <span className="font-medium text-primary">50-100ms</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{width: '15%'}}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted">Firestore Write</span>
                        <span className="font-medium text-primary">20-50ms</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{width: '8%'}}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted">FCM Notification Delivery</span>
                        <span className="font-medium text-primary">100-300ms</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{width: '25%'}}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted">Real-time UI Update</span>
                        <span className="font-medium text-primary">50-150ms</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{width: '12%'}}></div>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-themed">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-primary">Total End-to-End</span>
                        <span className="font-bold text-green-600">200-500ms</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <h3 className="text-lg font-semibold text-primary mb-4">Concurrent Capacity</h3>
                  <div className="space-y-4">
                    <div className="bg-secondary rounded-lg p-4 border border-themed">
                      <div className="text-2xl font-bold text-primary">1,000,000+</div>
                      <div className="text-sm text-muted">Simultaneous WebSocket connections (Firestore)</div>
                    </div>
                    <div className="bg-secondary rounded-lg p-4 border border-themed">
                      <div className="text-2xl font-bold text-primary">10,000+</div>
                      <div className="text-sm text-muted">Concurrent Cloud Function executions</div>
                    </div>
                    <div className="bg-secondary rounded-lg p-4 border border-themed">
                      <div className="text-2xl font-bold text-primary">Unlimited</div>
                      <div className="text-sm text-muted">FCM notifications per second</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Database Performance */}
              <div className="bg-tertiary rounded-xl p-5 border border-themed mb-6">
                <h3 className="text-lg font-semibold text-primary mb-4">Firestore Database Performance</h3>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-secondary rounded-lg border border-themed">
                    <div className="text-2xl font-bold text-indigo-600">&lt;10ms</div>
                    <div className="text-sm text-muted">Document read latency</div>
                  </div>
                  <div className="text-center p-4 bg-secondary rounded-lg border border-themed">
                    <div className="text-2xl font-bold text-indigo-600">&lt;20ms</div>
                    <div className="text-sm text-muted">Document write latency</div>
                  </div>
                  <div className="text-center p-4 bg-secondary rounded-lg border border-themed">
                    <div className="text-2xl font-bold text-indigo-600">&lt;50ms</div>
                    <div className="text-sm text-muted">Complex query latency</div>
                  </div>
                </div>
                <div className="mt-4 text-sm text-muted">
                  <p>Firestore automatically scales horizontally. Whether you have 100 users or 1 million users, query performance remains consistent because each query only scans documents it returns—not the entire collection.</p>
                </div>
              </div>

              {/* App Performance */}
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <h3 className="text-lg font-semibold text-primary mb-4">Mobile App Performance</h3>
                  <ul className="space-y-3 text-sm text-muted">
                    <li className="flex justify-between">
                      <span>Android app cold start</span>
                      <span className="font-medium text-primary">&lt;2 seconds</span>
                    </li>
                    <li className="flex justify-between">
                      <span>iOS app cold start</span>
                      <span className="font-medium text-primary">&lt;2 seconds</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Notification to display</span>
                      <span className="font-medium text-primary">&lt;500ms</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Assist button response</span>
                      <span className="font-medium text-primary">&lt;300ms</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Real-time list refresh</span>
                      <span className="font-medium text-primary">Instant</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <h3 className="text-lg font-semibold text-primary mb-4">Web Dashboard Performance</h3>
                  <ul className="space-y-3 text-sm text-muted">
                    <li className="flex justify-between">
                      <span>Initial page load</span>
                      <span className="font-medium text-primary">&lt;3 seconds</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Dashboard data load</span>
                      <span className="font-medium text-primary">&lt;1 second</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Real-time updates</span>
                      <span className="font-medium text-primary">&lt;200ms</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Heatmap generation</span>
                      <span className="font-medium text-primary">&lt;2 seconds</span>
                    </li>
                    <li className="flex justify-between">
                      <span>User search</span>
                      <span className="font-medium text-primary">&lt;500ms</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Why It Scales */}
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-700">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Why QRCallBox Scales Effortlessly</h4>
                <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <li>• <span className="font-medium">Serverless Architecture</span>: Cloud Functions auto-scale from 0 to thousands of instances</li>
                  <li>• <span className="font-medium">Store-Based Sharding</span>: Data naturally partitioned by store number for efficient queries</li>
                  <li>• <span className="font-medium">Push vs Poll</span>: Real-time listeners eliminate constant server requests</li>
                  <li>• <span className="font-medium">CDN-Hosted Frontend</span>: Static assets served from Firebase's global edge network</li>
                </ul>
              </div>
            </div>
          </section>

          {/* API Reference Section */}
          <section id="api" className="mb-16">
            <h2 className="text-3xl font-bold text-primary mb-6">API Reference</h2>
            <div className="bg-secondary rounded-2xl border border-themed p-6 md:p-8">
              <p className="text-muted mb-6">QRCallBox exposes a RESTful API for all major operations. All endpoints require authentication unless otherwise noted.</p>
              <div className="space-y-4">
                <div className="bg-tertiary rounded-xl p-4 border border-themed">
                  <h3 className="font-semibold text-primary mb-3">Core Endpoints</h3>
                  <div className="space-y-2 font-mono text-sm">
                    <div><span className="text-green-600">POST</span> /api/mint - Generate QR token</div>
                    <div><span className="text-blue-600">GET</span> /s?t=token - Handle QR scan</div>
                    <div><span className="text-green-600">POST</span> /api/notification-response - Handle assist/ignore</div>
                  </div>
                </div>
                <div className="bg-tertiary rounded-xl p-4 border border-themed">
                  <h3 className="font-semibold text-primary mb-3">GroupMe Integration</h3>
                  <div className="space-y-2 font-mono text-sm">
                    <div><span className="text-blue-600">GET</span> /api/groupme/start - Start OAuth flow</div>
                    <div><span className="text-blue-600">GET</span> /api/groupme/groups - List user groups</div>
                    <div><span className="text-green-600">POST</span> /api/groupme/createbot - Create bot for group</div>
                  </div>
                </div>
                <div className="bg-tertiary rounded-xl p-4 border border-themed">
                  <h3 className="font-semibold text-primary mb-3">User Management</h3>
                  <div className="space-y-2 font-mono text-sm">
                    <div><span className="text-blue-600">GET</span> /api/users/:uid - Get user profile</div>
                    <div><span className="text-blue-600">GET</span> /api/getActiveAssociates - List on-shift associates</div>
                    <div><span className="text-green-600">POST</span> /api/admin/update-user - Update user (admin)</div>
                  </div>
                </div>
              </div>
              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-700">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">Authentication</h4>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  Most endpoints require a Firebase ID token in the Authorization header.
                </p>
              </div>
            </div>
          </section>


          {/* Future Implementation Section */}
          <section id="future" className="mb-16">
            <h2 className="text-3xl font-bold text-primary mb-6">Future Implementation</h2>
            <div className="bg-secondary rounded-2xl border border-themed p-6 md:p-8">
              <p className="text-lg text-muted mb-8">
                QRCallBox has a comprehensive roadmap for enterprise-scale deployment, including advanced targeting, operational tools, and full Walmart integration.
              </p>

              {/* Targeted Notifications */}
              <div className="mb-10">
                <h3 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">1</span>
                  Area & Job Code Targeted Notifications
                </h3>
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <p className="text-sm text-muted mb-4">
                    Instead of notifying all associates, target specific job codes or area assignments for more efficient response routing.
                  </p>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-primary mb-2">Job Code Targeting</h4>
                      <ul className="space-y-1 text-sm text-muted">
                        <li>• Electronics scan → Notify Electronics associates only</li>
                        <li>• Pharmacy scan → Notify Pharmacy technicians</li>
                        <li>• Sporting Goods → Notify licensed associates (firearms)</li>
                        <li>• Configure job code mappings per QR location</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium text-primary mb-2">Area Assignment</h4>
                      <ul className="space-y-1 text-sm text-muted">
                        <li>• Associates assigned to zones receive priority</li>
                        <li>• Fallback to adjacent zones if no response</li>
                        <li>• Shift-based zone assignments</li>
                        <li>• Real-time zone hand-offs between shifts</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Management Escalation */}
              <div className="mb-10">
                <h3 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">2</span>
                  Management Escalation System
                </h3>
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <p className="text-sm text-muted mb-4">
                    Automatic escalation chain when customer requests go unanswered, ensuring no customer is left waiting.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-themed">
                          <th className="text-left py-2 text-muted">Time Elapsed</th>
                          <th className="text-left py-2 text-muted">Escalation Level</th>
                          <th className="text-left py-2 text-muted">Notification Target</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted">
                        <tr className="border-b border-themed/50">
                          <td className="py-2">0 - 2 min</td>
                          <td className="py-2">Level 1</td>
                          <td className="py-2">Area associates (job code targeted)</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2">2 - 5 min</td>
                          <td className="py-2">Level 2</td>
                          <td className="py-2">All floor associates + Team Lead</td>
                        </tr>
                        <tr className="border-b border-themed/50">
                          <td className="py-2">5 - 8 min</td>
                          <td className="py-2">Level 3</td>
                          <td className="py-2">Department Manager + Coach</td>
                        </tr>
                        <tr>
                          <td className="py-2">8+ min</td>
                          <td className="py-2">Level 4</td>
                          <td className="py-2">Store Manager + Operations ASM</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      <strong>Accountability:</strong> Escalation history is logged and included in management reports. Chronic escalations trigger automated alerts to market leadership.
                    </p>
                  </div>
                </div>
              </div>

              {/* Live Admin Metrics */}
              <div className="mb-10">
                <h3 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">3</span>
                  Live Metrics Dashboard (Mobile)
                </h3>
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <div className="flex items-start gap-3 mb-4">
                    <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">Mostly Complete</span>
                    <span className="text-sm text-muted">iOS app already has admin dashboard foundations</span>
                  </div>
                  <p className="text-sm text-muted mb-4">
                    Real-time metrics accessible directly in the mobile app for managers and admins on the floor.
                  </p>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div className="bg-secondary rounded-lg p-3 border border-themed">
                      <div className="text-2xl font-bold text-indigo-600">Live</div>
                      <div className="text-xs text-muted">Pending Requests</div>
                    </div>
                    <div className="bg-secondary rounded-lg p-3 border border-themed">
                      <div className="text-2xl font-bold text-green-600">4.2m</div>
                      <div className="text-xs text-muted">Avg Response Today</div>
                    </div>
                    <div className="bg-secondary rounded-lg p-3 border border-themed">
                      <div className="text-2xl font-bold text-purple-600">23</div>
                      <div className="text-xs text-muted">Associates On Shift</div>
                    </div>
                  </div>
                  <ul className="mt-4 space-y-1 text-sm text-muted">
                    <li>• Real-time store heatmap showing active areas</li>
                    <li>• Associate leaderboard with response metrics</li>
                    <li>• Push alerts for escalated requests</li>
                    <li>• Historical comparison (vs yesterday, last week)</li>
                  </ul>
                </div>
              </div>

              {/* Non-Customer Locations */}
              <div className="mb-10">
                <h3 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">4</span>
                  Non-Customer Operational Locations
                </h3>
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <p className="text-sm text-muted mb-4">
                    Extend QRCallBox beyond customer assistance to operational logging and access tracking.
                  </p>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-secondary rounded-lg p-4 border border-themed">
                      <h4 className="font-semibold text-primary mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Trash Compactor Logging
                      </h4>
                      <p className="text-sm text-muted mb-3">
                        Track compactor access for compliance, safety, and operational efficiency.
                      </p>
                      <ul className="space-y-1 text-xs text-muted">
                        <li>• QR scan required to access compactor area</li>
                        <li>• Automatic timestamp logging</li>
                        <li>• Easy-to-view access history</li>
                        <li>• Alerts for unusual access patterns</li>
                        <li>• Compliance reporting for safety audits</li>
                        <li>• Track maintenance schedules</li>
                      </ul>
                    </div>
                    <div className="bg-secondary rounded-lg p-4 border border-themed">
                      <h4 className="font-semibold text-primary mb-3 flex items-center gap-2">
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        DSD Door Access
                      </h4>
                      <p className="text-sm text-muted mb-3">
                        Streamline Direct Store Delivery vendor check-ins and door access.
                      </p>
                      <ul className="space-y-1 text-xs text-muted">
                        <li>• Drivers scan QR at delivery door</li>
                        <li>• Instant notification to receiving associates</li>
                        <li>• Log vendor arrival times</li>
                        <li>• Track wait times for vendors</li>
                        <li>• Integrate with appointment scheduling</li>
                        <li>• Reduce driver wait time complaints</li>
                      </ul>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Expandable:</strong> The same pattern can extend to pharmacy receiving, grocery cooler access, high-value cage access, and any location requiring activity logging.
                    </p>
                  </div>
                </div>
              </div>

              {/* Walmart Integration */}
              <div className="mb-10">
                <h3 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">5</span>
                  Walmart Enterprise Integration
                </h3>
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <p className="text-sm text-muted mb-6">
                    Full migration path to Walmart's internal infrastructure for enterprise-wide deployment.
                  </p>
                  
                  {/* Internal Server Migration */}
                  <div className="mb-6">
                    <h4 className="font-semibold text-primary mb-3">Internal Server Migration</h4>
                    <div className="bg-secondary rounded-lg p-4 border border-themed">
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h5 className="text-sm font-medium text-primary mb-2">Current Architecture</h5>
                          <ul className="space-y-1 text-xs text-muted">
                            <li>• Firebase Hosting (Google Cloud)</li>
                            <li>• Cloud Functions (Node.js)</li>
                            <li>• Firestore Database</li>
                            <li>• Firebase Authentication</li>
                            <li>• Firebase Cloud Messaging</li>
                          </ul>
                        </div>
                        <div>
                          <h5 className="text-sm font-medium text-primary mb-2">Walmart Migration Target</h5>
                          <ul className="space-y-1 text-xs text-muted">
                            <li>• Walmart Cloud (WMT Azure/GCP)</li>
                            <li>• Kubernetes containerized services</li>
                            <li>• Walmart Data Platform (Cosmos/Hive)</li>
                            <li>• Walmart OneLogin SSO</li>
                            <li>• Internal push notification service</li>
                          </ul>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-themed">
                        <h5 className="text-sm font-medium text-primary mb-2">Migration Benefits</h5>
                        <ul className="space-y-1 text-xs text-muted">
                          <li>• Compliance with Walmart data residency requirements</li>
                          <li>• Integration with existing HR/scheduling systems</li>
                          <li>• Leverage Walmart's global CDN for faster performance</li>
                          <li>• Unified monitoring through Walmart's observability platform</li>
                          <li>• Cost absorption into existing infrastructure spend</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Me@Walmart Integration */}
                  <div>
                    <h4 className="font-semibold text-primary mb-3">Me@Walmart App Integration</h4>
                    <div className="bg-secondary rounded-lg p-4 border border-themed">
                      <p className="text-sm text-muted mb-4">
                        Native integration into Walmart's employee app eliminates the need for a separate download and leverages existing SSO.
                      </p>
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h5 className="text-sm font-medium text-primary mb-2">SSO Integration</h5>
                          <ul className="space-y-1 text-xs text-muted">
                            <li>• Authenticate via Walmart OneLogin</li>
                            <li>• Automatic store assignment from HR data</li>
                            <li>• Job code pulled from Workday</li>
                            <li>• Schedule sync with GTA (scheduling system)</li>
                            <li>• No separate account creation needed</li>
                          </ul>
                        </div>
                        <div>
                          <h5 className="text-sm font-medium text-primary mb-2">App Integration Options</h5>
                          <ul className="space-y-1 text-xs text-muted">
                            <li>• <strong>Option A:</strong> Embedded WebView in Me@Walmart</li>
                            <li>• <strong>Option B:</strong> Native module in Me@Walmart</li>
                            <li>• <strong>Option C:</strong> Deep link to standalone app</li>
                            <li>• Push notifications via existing Me@Walmart channel</li>
                            <li>• Unified notification center</li>
                          </ul>
                        </div>
                      </div>
                      <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                        <p className="text-sm text-green-700 dark:text-green-300">
                          <strong>Adoption Advantage:</strong> Integration with Me@Walmart means instant access for 1.6M+ associates without app store downloads or separate logins.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Uniform Area Titles */}
              <div className="mb-10">
                <h3 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">6</span>
                  Uniform Area Titles for Enterprise Visibility
                </h3>
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <p className="text-sm text-muted mb-4">
                    Standardized area naming enables market, regional, and business unit analysis while allowing stores to specify precise locations.
                  </p>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-primary mb-3">Hierarchical Naming Structure</h4>
                      <div className="bg-secondary rounded-lg p-4 border border-themed">
                        <p className="text-xs text-muted mb-3">Example: Cologne Case location</p>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">Store 1458</span>
                            <span className="text-sm text-primary">"Cologne Case G3-1"</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">Store 2891</span>
                            <span className="text-sm text-primary">"Cologne Case H2-2"</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">Store 3042</span>
                            <span className="text-sm text-primary">"Cologne Case A1-5"</span>
                          </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-themed">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">Market View</span>
                            <span className="text-sm font-medium text-primary">All report as "Cologne Case"</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-primary mb-3">Benefits by Level</h4>
                      <ul className="space-y-3">
                        <li className="flex gap-2">
                          <span className="w-16 text-xs font-medium text-muted">Store</span>
                          <span className="text-sm text-muted">Precise aisle/section for quick customer location</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="w-16 text-xs font-medium text-muted">Market</span>
                          <span className="text-sm text-muted">Compare same areas across stores for pain point identification</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="w-16 text-xs font-medium text-muted">Region</span>
                          <span className="text-sm text-muted">Aggregate data reveals systemic issues (e.g., all Electronics slow)</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="w-16 text-xs font-medium text-muted">BU</span>
                          <span className="text-sm text-muted">Strategic resource allocation based on enterprise-wide patterns</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      <strong>Implementation:</strong> Area names use format "[Category] [Location]" where Category is standardized across all stores and Location is store-specific (optional aisle/section codes).
                    </p>
                  </div>
                </div>
              </div>

              {/* Standard QR Card Template */}
              <div className="mb-10">
                <h3 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">7</span>
                  Standard Walmart Wax Card QR Template
                </h3>
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <p className="text-sm text-muted mb-4">
                    Leverage existing Walmart was card infrastructure for rapid deployment and consistent branding.
                  </p>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium text-primary mb-3">Current vs. Proposed</h4>
                      <div className="space-y-3">
                        <div className="bg-secondary rounded-lg p-3 border border-themed">
                          <div className="text-xs text-muted mb-1">Current Format</div>
                          <div className="text-sm text-primary">Custom 3.5" x 5" poster print</div>
                          <div className="text-xs text-red-600 mt-1">Requires custom printing, lamination, mounting</div>
                        </div>
                        <div className="bg-secondary rounded-lg p-3 border border-themed border-green-300 dark:border-green-700">
                          <div className="text-xs text-muted mb-1">Proposed Format</div>
                          <div className="text-sm text-primary">Standard Walmart Wax Card (3" x 4")</div>
                          <div className="text-xs text-green-600 mt-1">Uses existing print infrastructure, durable, replaceable</div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium text-primary mb-3">Rollout Benefits</h4>
                      <ul className="space-y-2 text-sm text-muted">
                        <li className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span>No new equipment or processes required</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span>Wax cards already stocked at all stores</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span>Familiar format for associates and customers</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span>Consistent branding with existing signage</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          <span>Easy replacement if damaged or moved</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                    <p className="text-sm text-green-700 dark:text-green-300">
                      <strong>Speed to Deploy:</strong> Using standard was card template could reduce rollout time from weeks to days per store, enabling rapid market-wide deployment.
                    </p>
                  </div>
                </div>
              </div>

                            {/* Implementation Timeline */}
              <div>
                <h3 className="text-xl font-semibold text-primary mb-4">Phased Implementation</h3>
                <div className="bg-tertiary rounded-xl p-5 border border-themed">
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="w-24 flex-shrink-0">
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">Phase 1</span>
                      </div>
                      <div>
                        <div className="font-medium text-primary">Current State + Refinement</div>
                        <div className="text-sm text-muted">Complete mobile apps, stabilize caching, optimize performance</div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-24 flex-shrink-0">
                        <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">Phase 2</span>
                      </div>
                      <div>
                        <div className="font-medium text-primary">Job Code Targeting + Escalation</div>
                        <div className="text-sm text-muted">Implement smart routing and automatic escalation chains</div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-24 flex-shrink-0">
                        <span className="px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">Phase 3</span>
                      </div>
                      <div>
                        <div className="font-medium text-primary">Operational Locations</div>
                        <div className="text-sm text-muted">Expand to compactor, DSD doors, and other non-customer use cases</div>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <div className="w-24 flex-shrink-0">
                        <span className="px-2 py-1 text-xs font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">Phase 4</span>
                      </div>
                      <div>
                        <div className="font-medium text-primary">Enterprise Migration</div>
                        <div className="text-sm text-muted">Migrate to Walmart infrastructure, SSO integration, Me@Walmart embed</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Documentation Links */}
          <section id="docs" className="mb-16">
            <h2 className="text-3xl font-bold text-primary mb-6">Additional Documentation</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <a href="/privacy" className="bg-secondary rounded-xl border border-themed p-4 hover:bg-tertiary transition-colors">
                <h3 className="font-medium text-primary mb-1">Privacy Policy</h3>
                <p className="text-sm text-muted">Data handling and user privacy practices</p>
              </a>
              <a href="/terms" className="bg-secondary rounded-xl border border-themed p-4 hover:bg-tertiary transition-colors">
                <h3 className="font-medium text-primary mb-1">Terms of Service</h3>
                <p className="text-sm text-muted">Usage terms and conditions</p>
              </a>
              <a href="/app" className="bg-secondary rounded-xl border border-themed p-4 hover:bg-tertiary transition-colors">
                <h3 className="font-medium text-primary mb-1">Android App</h3>
                <p className="text-sm text-muted">Download and changelog</p>
              </a>
            </div>
          </section>

        </main>

        {/* Footer */}
        <footer className="bg-secondary border-t border-themed py-8">
          <div className="max-w-6xl mx-auto px-4 text-center">
            <p className="text-sm text-muted">© 2024-2025 Shane Smith. All Rights Reserved.</p>
            <p className="text-xs text-muted mt-2">QRCallBox™ is a trademark of Shane Smith.</p>
            <div className="mt-4 flex justify-center gap-4 text-sm">
              <a href="mailto:sinaptick@gmail.com" className="text-indigo-600 hover:underline">Contact</a>
              <a href="/privacy" className="text-indigo-600 hover:underline">Privacy</a>
              <a href="/terms" className="text-indigo-600 hover:underline">Terms</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function Documentation() {
  return (
    <ThemeProvider>
      <DocumentationContent />
    </ThemeProvider>
  );
}
