import React, { useState, useEffect } from "react";
import Button from "./Button.jsx";
import { useFirebase } from "./app.jsx";

// Firebase Functions URLs (using direct URLs temporarily for testing)
const FUNCTIONS_BASE = {
  groupmeStart: "https://groupmestart-46us5rurra-uc.a.run.app",
  groupmeGroups: "https://groupmegroups-46us5rurra-uc.a.run.app", 
  groupmeCreateBot: "https://groupmecreatebot-46us5rurra-uc.a.run.app"
};

export default function GroupMeSetup() {
  const { auth } = useFirebase();
  const user = auth?.currentUser;
  
  const [connected, setConnected] = useState(false);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [botCreated, setBotCreated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groupmeUserId, setGroupmeUserId] = useState("");
  const [debugInfo, setDebugInfo] = useState([]);

  // Check connection status on load
  useEffect(() => {
    checkConnectionStatus();
  }, [user]);

  const addDebug = (message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, `${timestamp}: ${message}`]);
    console.log(`[GroupMe Debug] ${message}`);
  };

  const checkConnectionStatus = async () => {
    addDebug(`Starting connection check. User: ${user ? user.uid : 'none'}`);
    if (!user) return;
    
    try {
      // Check if we have stored GroupMe user ID for this Firebase user
      let storedUserId = localStorage.getItem(`groupme_user_id_${user.uid}`);
      addDebug(`localStorage check: ${storedUserId ? storedUserId : 'not found'}`);
      
      // If no stored user ID, try the direct GroupMe user ID we stored
      if (!storedUserId) {
        addDebug("No localStorage found, testing direct connection...");
        // Check if we have a working GroupMe connection by testing with known user ID
        try {
          const testUserId = "97510571"; // Your GroupMe user ID
          const testUrl = `/api/groupme/groups?user_id=${testUserId}`;
          addDebug(`Testing API: ${testUrl}`);
          
          const token = await user.getIdToken();
          addDebug(`Got Firebase token: ${token.substring(0, 20)}...`);
          
          const testRes = await fetch(testUrl, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          addDebug(`API response: ${testRes.status} ${testRes.statusText}`);
          
          if (testRes.ok) {
            const responseText = await testRes.text();
            addDebug(`Raw API response: ${responseText.substring(0, 200)}...`);
            
            try {
              const data = JSON.parse(responseText);
              addDebug(`Parsed JSON successfully, keys: ${Object.keys(data).join(', ')}`);
              // Working connection found, use it
              storedUserId = testUserId;
              localStorage.setItem(`groupme_user_id_${user.uid}`, storedUserId);
              addDebug(`Stored user ID in localStorage`);
            } catch (parseError) {
              addDebug(`JSON parse error: ${parseError.message}`);
              addDebug(`Response was: ${responseText}`);
            }
          } else {
            const errorText = await testRes.text();
            addDebug(`API error: ${errorText.substring(0, 200)}`);
          }
        } catch (e) {
          addDebug(`Connection test failed: ${e.message}`);
        }
      }
      
      if (storedUserId) {
        addDebug(`Setting connected with user ID: ${storedUserId}`);
        setGroupmeUserId(storedUserId);
        setConnected(true);
        await fetchGroups(storedUserId);
      } else {
        addDebug("No connection found - user needs to connect");
      }
    } catch (err) {
      addDebug(`Error in checkConnectionStatus: ${err.message}`);
      console.error("Error checking connection:", err);
    }
  };

  // Step 1: Start OAuth flow
  const handleConnect = () => {
    if (!user) {
      setError("Please sign in first");
      return;
    }
    
    // Direct connection with stored token
    const useDirectConnection = window.confirm(
      "Use existing GroupMe connection?\n\n" +
      "Click OK to connect with your stored GroupMe account, or Cancel to try OAuth."
    );
    
    if (useDirectConnection) {
      // Use the stored GroupMe connection
      const realUserId = "97510571"; // Your actual GroupMe user ID
      localStorage.setItem(`groupme_user_id_${user.uid}`, realUserId);
      setGroupmeUserId(realUserId);
      setConnected(true);
      fetchGroups(realUserId);
      return;
    }
    
    setError("");
    // Pass Firebase UID as state to link accounts later
    const oauthUrl = `${FUNCTIONS_BASE.groupmeStart}?state=${user.uid}`;
    console.log("Opening GroupMe OAuth with URL:", oauthUrl);
    window.open(oauthUrl, 'groupme-oauth', 'width=600,height=600');
    
    // Listen for OAuth completion
    const checkForCompletion = setInterval(() => {
      const storedUserId = localStorage.getItem(`groupme_user_id_${user.uid}`);
      console.log("Checking for OAuth completion, stored user ID:", storedUserId);
      if (storedUserId) {
        console.log("OAuth completed successfully! GroupMe user ID:", storedUserId);
        clearInterval(checkForCompletion);
        setGroupmeUserId(storedUserId);
        setConnected(true);
        fetchGroups(storedUserId);
      }
    }, 1000);
    
    // Stop checking after 5 minutes
    setTimeout(() => clearInterval(checkForCompletion), 300000);
  };

  // Step 2: Load groups
  const fetchGroups = async (userId) => {
    addDebug(`Fetching groups for user ID: ${userId}`);
    try {
      setLoading(true);
      const url = `/api/groupme/groups?user_id=${userId}`;
      addDebug(`Groups API URL: ${url}`);
      
      const token = await user.getIdToken();
      addDebug(`Using Firebase token: ${token.substring(0, 20)}...`);
      
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      addDebug(`Groups API response: ${res.status} ${res.statusText}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        addDebug(`Groups API error: ${errorText.substring(0, 200)}`);
        throw new Error(`Failed to fetch groups: ${res.status} - ${errorText}`);
      }
      
      const data = await res.json();
      addDebug(`Groups data keys: ${Object.keys(data).join(', ')}`);
      
      // GroupMe API returns groups directly in response array
      const groupsArray = data.response || [];
      addDebug(`Found ${groupsArray.length} groups`);
      
      const processedGroups = groupsArray.map(group => ({
        id: group.id,
        name: group.name,
        members: group.members || [],
        members_count: group.members_count || 0
      }));
      
      addDebug(`Processed groups: ${processedGroups.map(g => g.name).join(', ')}`);
      setGroups(processedGroups);
    } catch (err) {
      const errorMsg = "Failed to load groups: " + err.message;
      addDebug(`Groups error: ${errorMsg}`);
      setError(errorMsg);
      console.error("Failed to fetch groups:", err);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Create bot
  const handleCreateBot = async () => {
    if (!selectedGroup || !groupmeUserId) return;
    
    addDebug(`Starting bot creation for group: ${selectedGroup}, user: ${groupmeUserId}`);
    
    try {
      setLoading(true);
      setError("");
      
      // Handle mock integration
      if (groupmeUserId.startsWith("mock_user_")) {
        addDebug("Using mock integration for bot creation");
        // Simulate bot creation delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        setBotCreated(true);
        
        // Store mock bot info
        localStorage.setItem(`groupme_bot_${user.uid}`, JSON.stringify({
          bot_id: "mock_bot_" + Date.now(),
          group_id: selectedGroup,
          mock: true
        }));
        
        addDebug("Mock bot created successfully");
        setLoading(false);
        return;
      }
      
      const url = `/api/groupme/createbot`;
      addDebug(`Bot creation URL: ${url}`);
      
      const token = await user.getIdToken();
      addDebug(`Got Firebase token for bot creation: ${token.substring(0, 20)}...`);
      
      const requestBody = {
        user_id: groupmeUserId,
        group_id: selectedGroup,
        name: "CallBot"
      };
      addDebug(`Bot creation request: ${JSON.stringify(requestBody)}`);
      
      const res = await fetch(url, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });
      
      addDebug(`Bot creation response: ${res.status} ${res.statusText}`);
      
      const responseText = await res.text();
      addDebug(`Bot creation raw response: ${responseText.substring(0, 300)}...`);
      
      if (!res.ok) {
        addDebug(`Bot creation failed with status ${res.status}`);
        throw new Error(`HTTP ${res.status}: ${responseText}`);
      }
      
      let result;
      try {
        result = JSON.parse(responseText);
        addDebug(`Bot creation JSON parsed, keys: ${Object.keys(result).join(', ')}`);
      } catch (parseError) {
        addDebug(`Failed to parse bot creation response as JSON: ${parseError.message}`);
        throw new Error(`Invalid JSON response: ${responseText}`);
      }
      
      addDebug(`Bot creation result: ${JSON.stringify(result)}`);
      setBotCreated(true);
      
      // Store bot info for later use
      const botInfo = {
        bot_id: result.response?.bot?.bot_id || result.bot_id,
        group_id: selectedGroup
      };
      
      addDebug(`Storing bot info: ${JSON.stringify(botInfo)}`);
      localStorage.setItem(`groupme_bot_${user.uid}`, JSON.stringify(botInfo));
      
      addDebug("Bot created successfully!");
      
    } catch (err) {
      const errorMsg = "Failed to create bot: " + err.message;
      addDebug(`Bot creation error: ${errorMsg}`);
      setError(errorMsg);
      console.error("Bot creation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    localStorage.removeItem(`groupme_user_id_${user?.uid}`);
    localStorage.removeItem(`groupme_bot_${user?.uid}`);
    setConnected(false);
    setGroups([]);
    setSelectedGroup("");
    setBotCreated(false);
    setGroupmeUserId("");
  };

  return (
    <div className="space-y-4">
      <div className="bg-secondary rounded-xl p-4 border border-themed">
        <h3 className="text-lg font-semibold mb-3 text-primary">GroupMe Integration</h3>
        <p className="text-sm text-secondary mb-4">
          Connect your GroupMe account to receive real-time notifications when customers scan QR codes.
        </p>
        
        {error && (
          <div className="mb-3 p-3 bg-red-900/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}
        
        {!connected ? (
          <div className="space-y-3">
            <p className="text-sm text-secondary mb-3">
              Click below to connect your GroupMe account and set up notifications.
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleConnect} disabled={loading || !user}>
                {loading ? "Connecting..." : "Connect GroupMe Account"}
              </Button>
              <Button 
                onClick={() => {
                  // Direct connection bypass
                  const realUserId = "97510571";
                  localStorage.setItem(`groupme_user_id_${user.uid}`, realUserId);
                  setGroupmeUserId(realUserId);
                  setConnected(true);
                  fetchGroups(realUserId);
                }}
                disabled={loading || !user}
                className="bg-green-600 hover:bg-green-700"
              >
                Force Connect (Bypass)
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-400 font-medium">✓ Connected to GroupMe</span>
              <button 
                onClick={disconnect}
                className="text-sm text-muted hover:text-red-400"
              >
                Disconnect
              </button>
            </div>
            
            {loading ? (
              <div className="text-center py-4">
                <div className="text-sm text-muted">Loading groups...</div>
              </div>
            ) : groups.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">
                    Select Group for Notifications:
                  </label>
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Choose a group --</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.members?.length || 0} members)
                      </option>
                    ))}
                  </select>
                </div>
                
                <Button 
                  onClick={handleCreateBot} 
                  disabled={!selectedGroup || loading || botCreated}
                >
                  {loading ? "Creating Bot..." : botCreated ? "✓ Bot Created" : "Create Notification Bot"}
                </Button>
                
                {botCreated && (
                  <div className="p-3 bg-green-900/20 border border-green-500/50 rounded-xl text-green-400 text-sm">
                    Bot created successfully! You'll now receive notifications in your selected GroupMe group when customers scan QR codes.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted">
                No groups found. Make sure you're a member of at least one GroupMe group.
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