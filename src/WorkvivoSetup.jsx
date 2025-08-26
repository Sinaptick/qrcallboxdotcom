import React, { useState, useEffect } from "react";
import Button from "./Button.jsx";
import { useFirebase } from "./hooks/useFirebase.js";

export default function WorkvivoSetup() {
  const { auth, db } = useFirebase();
  const user = auth?.currentUser;
  
  const [connected, setConnected] = useState(false);
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState({
    userId: "",
    storeNumber: "",
    password: "",
    email: ""
  });
  const [notificationMethod, setNotificationMethod] = useState("email");
  const [showCredentials, setShowCredentials] = useState(false);
  const [debugInfo, setDebugInfo] = useState([]);

  // Check connection status on load
  useEffect(() => {
    checkConnectionStatus();
  }, [user]);

  const addDebug = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, `${timestamp}: ${message}`]);
    console.log(`[Workvivo Debug] ${message}`);
  };

  const checkConnectionStatus = async () => {
    addDebug(`Starting connection check. User: ${user ? user.uid : 'none'}`);
    if (!user) return;
    
    try {
      // Check if we have stored Workvivo credentials for this Firebase user
      const { getDoc, doc } = await import("firebase/firestore");
      const workvivo = await getDoc(doc(db, "workvivo_config", user.uid));
      
      if (workvivo.exists() && workvivo.data().connected) {
        addDebug("Found existing Workvivo connection");
        setConnected(true);
        setChannels(workvivo.data().channels || []);
        setSelectedChannel(workvivo.data().selectedChannel || "");
      } else {
        addDebug("No Workvivo connection found");
      }
    } catch (err) {
      addDebug(`Error in checkConnectionStatus: ${err.message}`);
      console.error("Error checking connection:", err);
    }
  };

  // Step 1: Store credentials and test connection
  const handleConnect = async () => {
    if (!user || !credentials.userId || !credentials.storeNumber || !credentials.password) {
      setError("Please enter your User ID, Store Number, and Password");
      return;
    }
    
    setError("");
    setLoading(true);
    addDebug(`Attempting to connect to Workvivo with User ID: ${credentials.userId}, Store: ${credentials.storeNumber}`);
    
    try {
      // Call the Workvivo connection function with Walmart SAML auth
      const token = await user.getIdToken();
      const res = await fetch(`/api/workvivo/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: credentials.userId,
          storeNumber: credentials.storeNumber,
          password: credentials.password,
          email: credentials.email,
          authType: notificationMethod === "email" ? "email" : "walmart-saml",
          notificationMethod: notificationMethod
        })
      });
      
      addDebug(`Connection response: ${res.status} ${res.statusText}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        addDebug(`Connection error: ${errorText}`);
        throw new Error(`Failed to connect: ${res.status} - ${errorText}`);
      }
      
      const data = await res.json();
      addDebug(`Connection response: ${JSON.stringify(data)}`);
      
      if (data.requiresManualAuth) {
        // Handle manual authentication flow for Walmart SAML
        addDebug("Starting manual authentication flow");
        setError(""); // Clear any previous errors
        
        // Open popup window for manual authentication
        const popup = window.open(
          data.authUrl, 
          'walmart-auth', 
          'width=800,height=600,scrollbars=yes,resizable=yes'
        );
        
        setLoading(true);
        addDebug("Opened authentication popup window");
        
        // Poll for completion
        const pollForCompletion = setInterval(async () => {
          try {
            // Check if user completed authentication by calling a completion check endpoint
            const token = await user.getIdToken();
            const checkRes = await fetch(`/api/workvivo/check-completion`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              }
            });
            
            if (checkRes.ok) {
              const result = await checkRes.json();
              if (result.completed) {
                clearInterval(pollForCompletion);
                popup.close();
                setConnected(true);
                setChannels(result.channels || []);
                setShowCredentials(false);
                setLoading(false);
                addDebug("Manual authentication completed successfully!");
                // Clear password from state for security
                setCredentials(prev => ({ ...prev, password: "" }));
              }
            }
          } catch (err) {
            addDebug(`Polling error: ${err.message}`);
          }
        }, 3000); // Check every 3 seconds
        
        // Stop polling after 10 minutes
        setTimeout(() => {
          clearInterval(pollForCompletion);
          if (!popup.closed) {
            popup.close();
          }
          setLoading(false);
          setError("Authentication timed out. Please try again.");
        }, 600000); // 10 minutes
        
        // Also listen for popup being closed manually
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            clearInterval(pollForCompletion);
            setLoading(false);
            setError("Authentication window was closed. Please try again if not completed.");
          }
        }, 1000);
        
      } else {
        // Standard connection flow
        setConnected(true);
        setChannels(data.channels || []);
        setShowCredentials(false);
        
        // Clear password from state for security
        setCredentials(prev => ({ ...prev, password: "" }));
      }
      
    } catch (err) {
      const errorMsg = "Failed to connect to Workvivo: " + err.message;
      addDebug(errorMsg);
      setError(errorMsg);
      console.error("Workvivo connection failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Configure channel for notifications
  const handleSaveChannel = async () => {
    if (!selectedChannel || !user) return;
    
    addDebug(`Saving channel configuration: ${selectedChannel}`);
    
    try {
      setLoading(true);
      const token = await user.getIdToken();
      
      const res = await fetch(`/api/workvivo/configure`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          channel: selectedChannel
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Configuration failed: ${res.status} - ${errorText}`);
      }
      
      addDebug("Channel configuration saved successfully");
      
    } catch (err) {
      const errorMsg = "Failed to save configuration: " + err.message;
      addDebug(errorMsg);
      setError(errorMsg);
      console.error("Configuration failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    try {
      if (user) {
        const token = await user.getIdToken();
        await fetch(`/api/workvivo/disconnect`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
      }
    } catch (err) {
      console.error("Error disconnecting:", err);
    }
    
    setConnected(false);
    setChannels([]);
    setSelectedChannel("");
    setCredentials({ userId: "", storeNumber: "", password: "" });
    setShowCredentials(false);
    addDebug("Disconnected from Workvivo");
  };

  return (
    <div className="space-y-4">
      <div className="bg-secondary rounded-xl p-4 border border-themed">
        <h3 className="text-lg font-semibold mb-3 text-primary">Workvivo Integration</h3>
        <p className="text-sm text-secondary mb-4">
          Connect your Workvivo account to receive real-time notifications when customers scan QR codes.
        </p>
        
        {error && (
          <div className="mb-3 p-3 bg-red-900/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}
        
        {!connected ? (
          <div className="space-y-3">
            <div className="p-3 bg-blue-900/20 border border-blue-500/50 rounded-xl text-blue-400 text-sm">
              <strong>Workvivo Integration Options:</strong>
              <div className="mt-2 space-y-2">
                <div className="p-2 bg-blue-800/30 rounded">
                  <strong>📧 Email Notifications (Recommended)</strong>
                  <p className="text-xs mt-1">Get QR assistance alerts sent to your work email - reliable and instant</p>
                </div>
                <div className="p-2 bg-gray-800/30 rounded">
                  <strong>🤖 Chat Integration (Limited)</strong>
                  <p className="text-xs mt-1">Direct Workvivo posting - requires manual setup due to Walmart MFA</p>
                </div>
              </div>
            </div>
            
            {!showCredentials ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">
                    Choose Notification Method:
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="method"
                        value="email"
                        checked={notificationMethod === "email"}
                        onChange={(e) => setNotificationMethod(e.target.value)}
                        className="text-indigo-600"
                      />
                      <span className="text-sm">📧 Email Notifications (Recommended)</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="radio"
                        name="method"
                        value="chat"
                        checked={notificationMethod === "chat"}
                        onChange={(e) => setNotificationMethod(e.target.value)}
                        className="text-indigo-600"
                      />
                      <span className="text-sm">🤖 Direct Chat Integration</span>
                    </label>
                  </div>
                </div>
                <Button onClick={() => setShowCredentials(true)} disabled={loading}>
                  Set Up {notificationMethod === "email" ? "Email" : "Chat"} Notifications
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {notificationMethod === "email" ? (
                  // Email setup form
                  <div>
                    <label className="block text-sm font-medium text-primary mb-1">
                      Work Email Address:
                    </label>
                    <input
                      type="email"
                      value={credentials.email}
                      onChange={(e) => setCredentials(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="your.email@walmart.com"
                    />
                    <p className="text-xs text-secondary mt-1">
                      QR assistance alerts will be sent to this email address
                    </p>
                  </div>
                ) : (
                  // Chat integration form
                  <>
                    <div>
                      <label className="block text-sm font-medium text-primary mb-1">
                        Walmart User ID:
                      </label>
                      <input
                        type="text"
                        value={credentials.userId}
                        onChange={(e) => setCredentials(prev => ({ ...prev, userId: e.target.value }))}
                        className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Your Walmart User ID"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-primary mb-1">
                        Store Number:
                      </label>
                      <input
                        type="text"
                        value={credentials.storeNumber}
                        onChange={(e) => setCredentials(prev => ({ ...prev, storeNumber: e.target.value }))}
                        className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Your store number"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-primary mb-1">
                        Password:
                      </label>
                      <input
                        type="password"
                        value={credentials.password}
                        onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Your Walmart password"
                      />
                    </div>
                  </>
                )}
                
                <div className="flex gap-2">
                  <Button 
                    onClick={handleConnect} 
                    disabled={loading || (notificationMethod === "email" ? !credentials.email : (!credentials.userId || !credentials.storeNumber || !credentials.password))}
                  >
                    {loading ? "Setting up..." : "Set Up Notifications"}
                  </Button>
                  <Button 
                    onClick={() => setShowCredentials(false)}
                    className="bg-tertiary text-primary hover:bg-secondary"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-400 font-medium">✓ Connected to Workvivo</span>
              <button 
                onClick={disconnect}
                className="text-sm text-muted hover:text-red-400"
              >
                Disconnect
              </button>
            </div>
            
            {loading ? (
              <div className="text-center py-4">
                <div className="text-sm text-muted">Loading channels...</div>
              </div>
            ) : channels.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">
                    Select Channel for Notifications:
                  </label>
                  <select
                    value={selectedChannel}
                    onChange={(e) => setSelectedChannel(e.target.value)}
                    className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Choose a channel --</option>
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>
                        {channel.name}
                      </option>
                    ))}
                  </select>
                </div>
                
                <Button 
                  onClick={handleSaveChannel} 
                  disabled={!selectedChannel || loading}
                >
                  {loading ? "Saving..." : "Save Configuration"}
                </Button>
                
                {selectedChannel && (
                  <div className="p-3 bg-green-900/20 border border-green-500/50 rounded-xl text-green-400 text-sm">
                    Configuration saved! You'll now receive notifications in your selected Workvivo channel when customers scan QR codes.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted">
                No channels found. Make sure you have access to Workvivo channels.
              </div>
            )}
          </div>
        )}
        
        {/* Debug Section */}
        {debugInfo.length > 0 && (
          <div className="mt-4 p-3 bg-gray-900/50 border border-gray-600 rounded-xl">
            <h4 className="text-sm font-medium text-primary mb-2">Debug Log:</h4>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {debugInfo.map((info, idx) => (
                <div key={idx} className="text-xs text-muted font-mono">
                  {info}
                </div>
              ))}
            </div>
            <button 
              onClick={() => setDebugInfo([])}
              className="mt-2 text-xs text-indigo-400 hover:text-indigo-300"
            >
              Clear Debug Log
            </button>
          </div>
        )}
      </div>
    </div>
  );
}