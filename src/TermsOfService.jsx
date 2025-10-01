import { useState, useEffect } from "react";
import { getFirestore, doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebaseClient";
import PrivacyPolicy from "./PrivacyPolicy";

export default function TermsOfService({ user, onAccept, onDecline }) {
  const [hasAgreed, setHasAgreed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showFullTerms, setShowFullTerms] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    checkUserAgreement();
  }, [user]);

  const checkUserAgreement = async () => {
    if (!user?.uid) return;
    
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setHasAgreed(data.termsAccepted === true && data.termsVersion === "2.1.0");
      }
    } catch (error) {
      console.error("Error checking ToS agreement:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (accepting) return; // Prevent double-clicks

    setAccepting(true);
    setError(null);

    try {
      console.log("Accepting terms for user:", user.uid);
      const userRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userRef);

      if (userDoc.exists()) {
        console.log("Updating existing user document");
        await updateDoc(userRef, {
          termsAccepted: true,
          termsAcceptedAt: new Date(),
          termsVersion: "2.1.0",
          ipAddress: await fetchUserIP()
        });
      } else {
        console.log("Creating new user document");
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          termsAccepted: true,
          termsAcceptedAt: new Date(),
          termsVersion: "2.1.0",
          ipAddress: await fetchUserIP(),
          createdAt: new Date()
        });
      }

      console.log("Terms accepted successfully");
      setHasAgreed(true);

      if (onAccept) {
        console.log("Calling onAccept callback");
        onAccept();
      } else {
        console.warn("No onAccept callback provided");
      }
    } catch (error) {
      console.error("Error accepting ToS:", error);
      setError(error.message || "Failed to accept terms. Please try again.");
      setAccepting(false);
    }
  };

  const fetchUserIP = async () => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch {
      return "unknown";
    }
  };

  if (loading) {
    return <div className="text-center p-4">Loading...</div>;
  }

  if (hasAgreed) {
    return null; // User has already agreed
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Terms of Service & License Agreement
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            Please read and accept these terms to continue using QRcallbox
          </p>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="prose dark:prose-invert max-w-none">
            <h3 className="text-lg font-semibold mb-3">QRcallbox Terms of Service</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Effective Date: January 2025 | Version: 2.1.0
            </p>

            <div className="space-y-4 text-sm">
              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">1. Acceptance of Terms</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  By accessing or using QRcallbox ("the Service"), you agree to be bound by these Terms of Service 
                  and all applicable laws and regulations. If you do not agree with any of these terms, you are 
                  prohibited from using or accessing this Service.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">2. Intellectual Property Rights</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  © 2024-2025 Shane Smith. All Rights Reserved. The Service and its original content, features, 
                  and functionality are and will remain the exclusive property of Shane Smith. The Service is 
                  protected by copyright, trademark, and other laws. Our trademarks and trade dress may not be 
                  used in connection with any product or service without our prior written consent.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">3. License to Use</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  Subject to these Terms, you are granted a limited, non-exclusive, non-transferable, 
                  revocable license to use the Service for your internal business purposes only. You may not:
                </p>
                <ul className="list-disc pl-5 mt-2 text-gray-700 dark:text-gray-300">
                  <li>Copy, modify, or create derivative works of the Service</li>
                  <li>Reverse engineer, decompile, or disassemble the Service</li>
                  <li>Sell, rent, lease, or sublicense the Service</li>
                  <li>Use the Service to compete with us or build a similar service</li>
                  <li>Remove any proprietary notices or labels</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">4. User Responsibilities</h4>
                <p className="text-gray-700 dark:text-gray-300">You agree to:</p>
                <ul className="list-disc pl-5 mt-2 text-gray-700 dark:text-gray-300">
                  <li>Provide accurate and complete registration information</li>
                  <li>Maintain the security of your account credentials</li>
                  <li>Use the Service only for lawful purposes</li>
                  <li>Not interfere with or disrupt the Service</li>
                  <li>Not attempt to gain unauthorized access to any portion of the Service</li>
                  <li>Comply with all applicable laws and regulations</li>
                </ul>
              </section>

              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">5. Privacy & Data Protection</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  Your use of the Service is also governed by our{" "}
                  <button 
                    onClick={() => setShowPrivacyPolicy(true)}
                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
                  >
                    Privacy Policy
                  </button>
                  . By using the Service, you consent to the collection and use of information as described. 
                  We implement appropriate technical and organizational measures to protect your data.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">6. Service Modifications</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  We reserve the right to modify or discontinue the Service at any time without notice. 
                  We shall not be liable to you or any third party for any modification, suspension, or 
                  discontinuance of the Service.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">7. Limitation of Liability</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. IN NO EVENT SHALL 
                  SHANE SMITH BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE 
                  DAMAGES ARISING OUT OF YOUR USE OF THE SERVICE.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">8. Indemnification</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  You agree to indemnify and hold harmless Shane Smith from any claims, damages, losses, 
                  or expenses arising from your violation of these Terms or your use of the Service.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">9. Termination</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  We may terminate or suspend your account and access to the Service immediately, without 
                  prior notice or liability, for any reason, including breach of these Terms.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">10. Governing Law</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  These Terms shall be governed by and construed in accordance with the laws of the United States 
                  and the State of California, without regard to its conflict of law provisions.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">11. Patent Notice</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  Certain features and methods implemented in this Service may be subject to pending patent 
                  applications. Unauthorized use may constitute patent infringement.
                </p>
              </section>

              <section>
                <h4 className="font-semibold text-gray-900 dark:text-white">12. Contact Information</h4>
                <p className="text-gray-700 dark:text-gray-300">
                  For questions about these Terms, please contact:<br />
                  Email: sinaptick@gmail.com
                </p>
              </section>
            </div>

            {showFullTerms && (
              <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Additional Legal Terms</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  By accepting these terms, you acknowledge that you have read, understood, and agree to be 
                  bound by all provisions. This agreement constitutes the entire agreement between you and 
                  Shane Smith regarding the use of the Service and supersedes all prior agreements.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          {error && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex gap-4">
              <button
                onClick={() => setShowFullTerms(!showFullTerms)}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                disabled={accepting}
              >
                {showFullTerms ? "Hide" : "Show"} additional terms
              </button>
              <button
                onClick={() => setShowPrivacyPolicy(true)}
                className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                disabled={accepting}
              >
                📋 View Privacy Policy
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onDecline}
                disabled={accepting}
                className="px-6 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Decline
              </button>
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {accepting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Accepting...
                  </>
                ) : (
                  "I Accept the Terms"
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Privacy Policy Modal */}
      {showPrivacyPolicy && (
        <PrivacyPolicy onClose={() => setShowPrivacyPolicy(false)} />
      )}
    </div>
  );
}