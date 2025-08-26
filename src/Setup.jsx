import React from "react";

export default function Setup({ onNavigate }) {
  const steps = [
    {
      number: 1,
      title: "Create a GroupMe Channel",
      description: "Create a dedicated GroupMe channel for your store using the format: \"Store [number] CallBox\"",
      example: "Example: \"Store 123 CallBox\"",
      icon: "💬",
      details: [
        "Open the GroupMe app or website",
        "Create a new group",
        "Use the naming format: Store [your store number] CallBox",
        "This will be your dedicated assistance notification channel"
      ]
    },
    {
      number: 2,
      title: "Add Associates to the Channel",
      description: "Get all your store associates signed up and added to the GroupMe channel",
      example: "GroupMe provides a downloadable, printable QR code that automatically adds users to the proper group",
      icon: "👥",
      details: [
        "In your GroupMe channel, tap the group name at the top",
        "Select 'Share Group' or 'Add Members'",
        "Choose 'QR Code' option",
        "Download and print the QR code for easy team member additions",
        "Post the QR code in your break room or staff area"
      ]
    },
    {
      number: 3,
      title: "Complete GroupMe Integration",
      description: "Connect your GroupMe channel to QRcallbox for automatic notifications",
      example: "Use our integration tool to link your channel",
      icon: "🔗",
      details: [
        "Navigate to the GroupMe Setup section",
        "Follow the OAuth process to authorize QRcallbox",
        "Select your store's CallBox channel",
        "Test the integration to ensure notifications work properly"
      ],
      action: {
        text: "Go to GroupMe Setup",
        onClick: () => onNavigate("Settings", "groupme")
      }
    },
    {
      number: 4,
      title: "Generate QR Codes",
      description: "Create QR codes for all necessary store areas where customers might need assistance",
      example: "Generate codes for Electronics, Customer Service, Pharmacy, etc.",
      icon: "📱",
      details: [
        "Use the QR Generator tool to create location-specific codes",
        "Enter your store number (3-6 digits)",
        "Add descriptive area names (Electronics, Customer Service, etc.)",
        "Download high-resolution posters for printing",
        "Place QR codes in visible, accessible locations"
      ],
      action: {
        text: "Generate QR Codes",
        onClick: () => onNavigate("Generate QR")
      }
    }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Store Implementation Setup</h2>
        <p className="text-lg text-gray-700 dark:text-gray-300 max-w-2xl mx-auto">
          Follow these four simple steps to implement QRcallbox in your store and start providing 
          instant customer assistance.
        </p>
      </div>

      {/* Steps */}
      <div className="space-y-6">
        {steps.map((step, index) => (
          <div key={step.number} className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm ring-1 ring-black/5 dark:ring-white/10 border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="p-6">
              {/* Step Header */}
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-lg">
                  {step.number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl" role="img" aria-label="step icon">{step.icon}</span>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{step.title}</h3>
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-base mb-3">{step.description}</p>
                  {step.example && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                      <p className="text-blue-800 text-sm font-medium">{step.example}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Step Details */}
              <div className="ml-16">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">Implementation Steps:</h4>
                  <ul className="space-y-2">
                    {step.details.map((detail, detailIndex) => (
                      <li key={detailIndex} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <span className="text-blue-500 font-bold mt-1">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action Button */}
                {step.action && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={step.action.onClick}
                      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      {step.action.text} →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mt-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-2xl" role="img" aria-label="success">✅</span>
          <h3 className="text-lg font-semibold text-green-800">You're All Set!</h3>
        </div>
        <p className="text-green-700">
          Once you've completed all four steps, your store will be ready to provide instant customer assistance. 
          Customers can scan QR codes to request help, and your team will receive immediate notifications in GroupMe.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => onNavigate("Dashboard")}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            View Dashboard
          </button>
          <button
            onClick={() => onNavigate("Insights")}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            View Analytics
          </button>
        </div>
      </div>
    </div>
  );
}