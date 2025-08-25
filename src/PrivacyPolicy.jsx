import { useState } from "react";

export default function PrivacyPolicy({ onClose }) {
  const [showSection, setShowSection] = useState("all");

  const sections = {
    "information": "Information We Collect",
    "usage": "How We Use Your Information", 
    "sharing": "Data Sharing and Disclosure",
    "security": "Data Security",
    "retention": "Data Retention",
    "rights": "Your Privacy Rights",
    "cookies": "Cookies and Tracking",
    "contact": "Contact Information"
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Privacy Policy
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Effective Date: January 2025 | Version: 2.1.0
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex">
          {/* Navigation Sidebar */}
          <div className="w-64 border-r border-gray-200 dark:border-gray-700 p-4 max-h-[calc(90vh-120px)] overflow-y-auto">
            <button
              onClick={() => setShowSection("all")}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-2 ${
                showSection === "all" 
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" 
                  : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              }`}
            >
              📋 Full Policy
            </button>
            {Object.entries(sections).map(([key, title]) => (
              <button
                key={key}
                onClick={() => setShowSection(key)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm mb-1 ${
                  showSection === key 
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" 
                    : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                }`}
              >
                {title}
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 p-6 max-h-[calc(90vh-120px)] overflow-y-auto">
            <div className="prose dark:prose-invert max-w-none">
              
              {/* Introduction */}
              {(showSection === "all" || showSection === "intro") && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Introduction</h3>
                  <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                    This Privacy Policy describes how QRcallbox ("we," "our," or "us") collects, uses, and protects 
                    your personal information when you use our service. By using QRcallbox, you consent to the data 
                    practices described in this policy.
                  </p>
                </section>
              )}

              {/* Information We Collect */}
              {(showSection === "all" || showSection === "information") && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Information We Collect</h3>
                  
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Personal Information</h4>
                  <ul className="list-disc pl-5 mb-4 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>Account Information:</strong> Name, email, phone, store number, job title</li>
                    <li><strong>Authentication Data:</strong> Encrypted passwords, email verification status</li>
                    <li><strong>Profile Changes:</strong> Requested account modifications pending approval</li>
                  </ul>

                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Usage Data</h4>
                  <ul className="list-disc pl-5 mb-4 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>QR Interactions:</strong> Store locations, areas, assistance request timestamps</li>
                    <li><strong>Response Tracking:</strong> Associate response times, names, message content</li>
                    <li><strong>Analytics:</strong> Usage patterns, feature interactions, performance metrics</li>
                  </ul>

                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Technical Data</h4>
                  <ul className="list-disc pl-5 mb-4 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>IP Addresses:</strong> For security, fraud prevention, terms acceptance tracking</li>
                    <li><strong>Device Info:</strong> Browser type, OS, screen resolution</li>
                    <li><strong>Cookies:</strong> Session cookies for authentication and preferences</li>
                    <li><strong>Server Logs:</strong> Access logs, error logs, performance monitoring</li>
                  </ul>
                </section>
              )}

              {/* How We Use Your Information */}
              {(showSection === "all" || showSection === "usage") && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">How We Use Your Information</h3>
                  
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Primary Purposes</h4>
                  <ul className="list-disc pl-5 mb-4 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>Service Operation:</strong> QR generation, assistance notifications, response tracking</li>
                    <li><strong>User Management:</strong> Account creation, authentication, approval workflows</li>
                    <li><strong>Analytics:</strong> Response time insights, area popularity, system performance</li>
                    <li><strong>Communication:</strong> Assistance notifications, updates, support responses</li>
                  </ul>

                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Business Operations</h4>
                  <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>Legal Compliance:</strong> Terms acceptance records, audit trails</li>
                    <li><strong>Security:</strong> Fraud prevention, abuse detection, system monitoring</li>
                    <li><strong>Improvement:</strong> Feature enhancement, performance optimization</li>
                    <li><strong>Support:</strong> Customer service, troubleshooting, issue response</li>
                  </ul>
                </section>
              )}

              {/* Data Sharing */}
              {(showSection === "all" || showSection === "sharing") && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Data Sharing and Disclosure</h3>
                  
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Internal Sharing</h4>
                  <ul className="list-disc pl-5 mb-4 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>Administrators:</strong> User management and system analytics access</li>
                    <li><strong>Associates:</strong> Response data for assistance and performance tracking</li>
                    <li><strong>Support Team:</strong> Necessary data for troubleshooting and assistance</li>
                  </ul>

                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Third-Party Services</h4>
                  <ul className="list-disc pl-5 mb-4 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>Firebase/Google Cloud:</strong> Hosting, database, authentication services</li>
                    <li><strong>GroupMe API:</strong> Message delivery and webhook processing</li>
                    <li><strong>Analytics Providers:</strong> Anonymized usage data for improvements</li>
                  </ul>

                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Legal Disclosure</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    We may disclose information when required by legal process, law enforcement, 
                    protection of rights and safety, or business transfers.
                  </p>
                </section>
              )}

              {/* Data Security */}
              {(showSection === "all" || showSection === "security") && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Data Security</h3>
                  
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Protection Measures</h4>
                  <ul className="list-disc pl-5 mb-4 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>Encryption:</strong> Data encrypted in transit and at rest</li>
                    <li><strong>Access Controls:</strong> Role-based access with multi-factor authentication</li>
                    <li><strong>Regular Audits:</strong> Security assessments and vulnerability scanning</li>
                    <li><strong>Secure Infrastructure:</strong> Firebase and Google Cloud Platform protections</li>
                  </ul>

                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Your Responsibilities</h4>
                  <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
                    <li>Maintain secure passwords and account credentials</li>
                    <li>Report suspected security breaches immediately</li>
                    <li>Keep contact information current for security notifications</li>
                    <li>Use official QRcallbox domains and applications only</li>
                  </ul>
                </section>
              )}

              {/* Data Retention */}
              {(showSection === "all" || showSection === "retention") && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Data Retention</h3>
                  
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Retention Periods</h4>
                  <ul className="list-disc pl-5 mb-4 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>Account Data:</strong> While active, plus 7 years after deletion</li>
                    <li><strong>Usage Logs:</strong> 3 years for analytics, 1 year for detailed logs</li>
                    <li><strong>Response Data:</strong> 5 years for performance analytics and compliance</li>
                    <li><strong>Support Tickets:</strong> 3 years after resolution</li>
                    <li><strong>Terms Acceptance:</strong> Permanent retention for legal compliance</li>
                  </ul>

                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Data Deletion</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Account deletion removes personal identifiers but preserves anonymized analytics. 
                    Users can request specific data deletion subject to legal retention requirements.
                  </p>
                </section>
              )}

              {/* Your Privacy Rights */}
              {(showSection === "all" || showSection === "rights") && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Your Privacy Rights</h3>
                  
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Access and Control</h4>
                  <ul className="list-disc pl-5 mb-4 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>View:</strong> Access personal information through account settings</li>
                    <li><strong>Correct:</strong> Update account information (subject to admin approval)</li>
                    <li><strong>Export:</strong> Request a copy of personal data in portable format</li>
                    <li><strong>Delete:</strong> Request account deletion (subject to legal retention)</li>
                  </ul>

                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Preferences</h4>
                  <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>Communications:</strong> Opt out of non-essential notifications</li>
                    <li><strong>Analytics:</strong> Request exclusion from certain analytics</li>
                    <li><strong>Integrations:</strong> Control third-party service connections</li>
                  </ul>
                </section>
              )}

              {/* Cookies and Tracking */}
              {(showSection === "all" || showSection === "cookies") && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Cookies and Tracking</h3>
                  
                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Cookie Types</h4>
                  <ul className="list-disc pl-5 mb-4 text-sm text-gray-700 dark:text-gray-300">
                    <li><strong>Essential:</strong> Required for login, security, basic functionality</li>
                    <li><strong>Functional:</strong> User preferences, language settings, theme choices</li>
                    <li><strong>Analytics:</strong> Usage patterns, performance monitoring (anonymized)</li>
                    <li><strong>Security:</strong> Fraud detection, abuse prevention, session protection</li>
                  </ul>

                  <h4 className="font-medium text-gray-900 dark:text-white mb-2">Your Choices</h4>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Browser settings control cookie acceptance. Essential cookies cannot be disabled without 
                    losing functionality. Control third-party cookies through browser or platform settings.
                  </p>
                </section>
              )}

              {/* Contact Information */}
              {(showSection === "all" || showSection === "contact") && (
                <section className="mb-8">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Contact Information</h3>
                  
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">Privacy Questions</h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                      <strong>Email:</strong> sinaptick@gmail.com
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                      <strong>Subject Line:</strong> QRcallbox Privacy Inquiry
                    </p>

                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">Response Times</h4>
                    <ul className="list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
                      <li>General inquiries: 5 business days</li>
                      <li>Data requests: 30 days maximum</li>
                      <li>Security concerns: 24 hours</li>
                      <li>Legal compliance: As required by law</li>
                    </ul>
                  </div>
                </section>
              )}

              {/* Legal Footer */}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <p className="mb-2"><strong>Last Updated:</strong> January 2025</p>
                  <p className="mb-2"><strong>Document Version:</strong> 2.1.0</p>
                  <p>© 2024-2025 Shane Smith. All Rights Reserved.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Close Button */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}