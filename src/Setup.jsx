import React, { useState } from "react";

export default function Setup({ onNavigate }) {
  const [expandedSection, setExpandedSection] = useState(null);

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const steps = [
    {
      id: "associates",
      number: 1,
      title: "Get Associates Signed Up",
      description: "Register your store team members on the QRcallbox platform",
      icon: "👥",
      details: [
        {
          subtitle: "Web Registration",
          items: [
            "Have associates visit qrwebaccdb.web.app on any device",
            "Click 'Register' and fill in their information",
            "Enter your store number (this is critical for receiving the right notifications)",
            "An admin will approve their account within 24 hours"
          ]
        },
        {
          subtitle: "What Associates Need",
          items: [
            "Valid email address",
            "Store number (ask your manager if unsure)",
            "First and last name",
            "Job title (helps with scheduling features)"
          ]
        }
      ]
    },
    {
      id: "android",
      number: 2,
      title: "Install the Android App",
      description: "Get push notifications directly on your phone - no GroupMe required",
      icon: "📱",
      details: [
        {
          subtitle: "Download & Install",
          items: [
            "Visit qrwebaccdb.web.app/app on your Android device",
            "Tap 'Download Latest Version' to get the APK",
            "Open the downloaded file and allow installation from unknown sources if prompted",
            "The app will auto-update when new versions are available"
          ]
        },
        {
          subtitle: "App Features",
          items: [
            "Real-time push notifications when customers need help",
            "See all active customer requests for your store",
            "'Assist' button to claim requests and let others know you're helping",
            "Work schedule settings - only get notifications when you're on shift",
            "Elapsed timer shows how long customers have been waiting"
          ]
        },
        {
          subtitle: "Setting Up Work Schedule",
          items: [
            "Open the app and go to Settings (gear icon)",
            "Set your work hours for each day of the week",
            "Toggle days on/off based on your schedule",
            "You'll only receive notifications during your set work hours"
          ]
        }
      ],
      action: {
        text: "Go to App Download Page",
        href: "https://qrwebaccdb.web.app/app"
      }
    },
    {
      id: "groupme",
      number: 3,
      title: "GroupMe Integration (Optional)",
      description: "Set up GroupMe as an additional notification channel for your team",
      icon: "💬",
      details: [
        {
          subtitle: "Create a GroupMe Channel",
          items: [
            "Open the GroupMe app or website",
            "Create a new group named: 'Store [your number] CallBox'",
            "Example: 'Store 1458 CallBox'"
          ]
        },
        {
          subtitle: "Add Associates to the Channel",
          items: [
            "In GroupMe, tap the group name at the top",
            "Select 'Share Group' or 'Add Members'",
            "Choose 'QR Code' option to download a printable code",
            "Post the QR code in your break room for easy team additions"
          ]
        },
        {
          subtitle: "Connect to QRcallbox",
          items: [
            "Go to Settings > GroupMe Setup in the web app",
            "Authorize QRcallbox to access your GroupMe",
            "Select your store's CallBox channel",
            "Test to ensure notifications work"
          ]
        }
      ],
      action: {
        text: "Go to GroupMe Setup",
        onClick: () => onNavigate("Settings", "groupme")
      }
    },
    {
      id: "qrcodes",
      number: 4,
      title: "Print QR Codes for Your Store",
      description: "Generate and print QR codes for areas where customers might need help",
      icon: "🖨️",
      details: [
        {
          subtitle: "Generate QR Codes",
          items: [
            "Go to the 'Generate QR' tab in the web app",
            "Enter your store number",
            "Add a descriptive area name (Electronics, Pharmacy, Customer Service, etc.)",
            "Click 'Generate QR Code' to create the poster"
          ]
        },
        {
          subtitle: "Printing Tips",
          items: [
            "Use color printing for best visibility",
            "Print on card stock or laminate for durability",
            "Standard letter size (8.5x11) works well",
            "The poster includes instructions for customers"
          ]
        },
        {
          subtitle: "Placement Recommendations",
          items: [
            "High-traffic areas where customers commonly need assistance",
            "Near product displays that require employee expertise",
            "At eye level (4-5 feet from the ground)",
            "Well-lit areas where phones can easily scan",
            "Consider multiple codes in large departments"
          ]
        }
      ],
      action: {
        text: "Generate QR Codes",
        onClick: () => onNavigate("Generate QR")
      }
    }
  ];

  const tabGuide = [
    {
      name: "Dashboard",
      icon: "📊",
      description: "Your store's real-time activity hub",
      features: [
        "Live feed of recent customer assistance requests",
        "See who responded to each request and how quickly",
        "Monitor current store activity at a glance",
        "Quick access to store performance metrics"
      ]
    },
    {
      name: "Insights",
      icon: "📈",
      description: "Analytics and performance data for your store",
      features: [
        "Filter data by store, week, and area",
        "See busiest days and peak hours",
        "Track response rates and average response times",
        "Identify which areas need the most attention",
        "AI-generated activity insights and summaries"
      ]
    },
    {
      name: "Generate QR",
      icon: "📱",
      description: "Create QR code posters for your store",
      features: [
        "Generate unique QR codes for each store area",
        "Download print-ready posters with instructions",
        "Customize area descriptions",
        "Track which QR codes have been created"
      ]
    },
    {
      name: "Settings",
      icon: "⚙️",
      description: "Configure your notifications and integrations",
      features: [
        "GroupMe Setup: Connect your GroupMe channel",
        "Workvivo Setup: Enterprise integration (Store 1458)",
        "Manage notification preferences",
        "Update your profile information"
      ]
    },
    {
      name: "Admin",
      icon: "🔐",
      description: "Administrative tools (admin users only)",
      features: [
        "Approve new user registrations",
        "Manage all users across stores",
        "View and respond to support tickets",
        "QR Locations: View/delete test data by area",
        "Spam Protection: Manage blocked IPs",
        "Data Cleanup: Diagnostic and backfill tools"
      ]
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Getting Started with QRcallbox</h2>
        <p className="text-lg text-gray-700 dark:text-gray-300 max-w-2xl mx-auto">
          Complete guide to setting up QRcallbox for your store - from associate registration to printing QR codes.
        </p>
      </div>

      {/* Quick Start Summary */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 mb-3">Quick Start Checklist</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-3 text-blue-700 dark:text-blue-300">
            <input type="checkbox" className="w-4 h-4 rounded" />
            <span>Associates registered on web portal</span>
          </label>
          <label className="flex items-center gap-3 text-blue-700 dark:text-blue-300">
            <input type="checkbox" className="w-4 h-4 rounded" />
            <span>Android app installed on devices</span>
          </label>
          <label className="flex items-center gap-3 text-blue-700 dark:text-blue-300">
            <input type="checkbox" className="w-4 h-4 rounded" />
            <span>Work schedules configured in app</span>
          </label>
          <label className="flex items-center gap-3 text-blue-700 dark:text-blue-300">
            <input type="checkbox" className="w-4 h-4 rounded" />
            <span>QR codes printed and posted</span>
          </label>
        </div>
      </div>

      {/* Implementation Steps */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Implementation Steps</h3>

        {steps.map((step) => (
          <div
            key={step.id}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            {/* Step Header - Clickable */}
            <button
              onClick={() => toggleSection(step.id)}
              className="w-full p-6 text-left flex items-start gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center text-blue-700 dark:text-blue-300 font-bold text-lg">
                {step.number}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-1">
                  <span className="text-2xl" role="img" aria-label="step icon">{step.icon}</span>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{step.title}</h3>
                </div>
                <p className="text-gray-600 dark:text-gray-400">{step.description}</p>
              </div>
              <div className="flex-shrink-0 text-gray-400">
                <svg
                  className={`w-6 h-6 transition-transform ${expandedSection === step.id ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Step Details - Expandable */}
            {expandedSection === step.id && (
              <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-700">
                <div className="pt-4 space-y-4 ml-16">
                  {step.details.map((section, idx) => (
                    <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                      <h4 className="font-semibold text-gray-900 dark:text-white mb-3">{section.subtitle}</h4>
                      <ul className="space-y-2">
                        {section.items.map((item, itemIdx) => (
                          <li key={itemIdx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-blue-500 font-bold mt-0.5">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {/* Action Button */}
                  {step.action && (
                    <div className="flex justify-end pt-2">
                      {step.action.href ? (
                        <a
                          href={step.action.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          {step.action.text} →
                        </a>
                      ) : (
                        <button
                          onClick={step.action.onClick}
                          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          {step.action.text} →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tab Guide Section */}
      <div className="space-y-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Understanding the Tabs</h3>
        <p className="text-gray-600 dark:text-gray-400">
          Here's what each section of QRcallbox does and how to use it effectively.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tabGuide.map((tab) => (
            <div
              key={tab.name}
              className="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{tab.icon}</span>
                <h4 className="font-semibold text-gray-900 dark:text-white">{tab.name}</h4>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{tab.description}</p>
              <ul className="space-y-1">
                {tab.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-500">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Tips Section */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">💡</span>
          <h3 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200">Pro Tips</h3>
        </div>
        <ul className="space-y-2 text-yellow-700 dark:text-yellow-300 text-sm">
          <li className="flex items-start gap-2">
            <span className="font-bold">•</span>
            <span><strong>Test first:</strong> Have a team member scan a QR code before going live to ensure notifications work.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">•</span>
            <span><strong>Update schedules:</strong> Remind associates to keep their work schedules current in the app for accurate notifications.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">•</span>
            <span><strong>Monitor response times:</strong> Use the Insights tab to track how quickly your team responds and identify peak hours.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="font-bold">•</span>
            <span><strong>Multiple notification channels:</strong> Use both the Android app AND GroupMe for redundancy.</span>
          </li>
        </ul>
      </div>

      {/* Footer */}
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl">✅</span>
          <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">Ready to Go!</h3>
        </div>
        <p className="text-green-700 dark:text-green-300 mb-4">
          Once setup is complete, customers can scan QR codes to request assistance, and your team will receive
          instant notifications on their phones. Track everything from the Dashboard and Insights tabs.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate("Dashboard")}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            View Dashboard
          </button>
          <button
            onClick={() => onNavigate("Generate QR")}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Generate QR Codes
          </button>
          <a
            href="https://qrwebaccdb.web.app/app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            Download Android App
          </a>
        </div>
      </div>

      {/* Need Help */}
      <div className="text-center text-sm text-gray-500 dark:text-gray-400 pb-4">
        Need help? <button onClick={() => onNavigate("Contact Us")} className="text-blue-600 hover:underline">Contact Support</button>
      </div>
    </div>
  );
}
