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
  const [existingBots, setExistingBots] = useState([]);

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
      
      // If no stored user ID, user needs to connect GroupMe
      if (!storedUserId) {
        addDebug("No localStorage found - user needs to connect GroupMe");
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
    
    setError("");
    // Pass Firebase UID as state to link accounts later
    const oauthUrl = `${FUNCTIONS_BASE.groupmeStart}?state=${user.uid}`;
    console.log("Opening GroupMe OAuth with URL:", oauthUrl);
    window.open(oauthUrl, 'groupme-oauth', 'width=600,height=600');
    
    // Listen for OAuth completion via postMessage
    const handleMessage = (event) => {
      console.log("Received message:", event);
      
      // Verify the message is from our callback
      if (event.origin !== "https://groupmecallback-46us5rurra-uc.a.run.app") {
        console.log("Ignoring message from unknown origin:", event.origin);
        return;
      }
      
      if (event.data && event.data.type === 'groupme_connected') {
        const { userId, state } = event.data;
        console.log("OAuth completed successfully! GroupMe user ID:", userId);
        
        // Verify the state matches our user
        if (state === user.uid) {
          localStorage.setItem(`groupme_user_id_${user.uid}`, userId);
          setGroupmeUserId(userId);
          setConnected(true);
          fetchGroups(userId);
          
          // Remove the event listener
          window.removeEventListener('message', handleMessage);
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    // Clean up listener after 5 minutes
    setTimeout(() => {
      window.removeEventListener('message', handleMessage);
    }, 300000);
  };

  // Step 1b: Load existing bots
  const fetchExistingBots = async (userId) => {
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/list-bots?user_id=${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setExistingBots(data.bots || []);
        addDebug(`Found ${data.bots?.length || 0} existing bots`);
      }
    } catch (err) {
      addDebug(`Error fetching bots: ${err.message}`);
    }
  };

  // Step 1c: Delete a bot
  const deleteBot = async (botId) => {
    try {
      setLoading(true);
      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/delete-bot`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: groupmeUserId,
          bot_id: botId
        })
      });
      
      if (res.ok) {
        addDebug(`Bot ${botId} deleted successfully`);
        setError("");
        // Refresh bot list
        await fetchExistingBots(groupmeUserId);
      } else {
        const text = await res.text();
        setError(`Failed to delete bot: ${text}`);
      }
    } catch (err) {
      setError(`Error deleting bot: ${err.message}`);
    } finally {
      setLoading(false);
    }
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
      
      // Also fetch existing bots when groups are loaded
      await fetchExistingBots(userId);
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
      
      // Remove mock integration - all users should use real GroupMe
      
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
            <div className="p-3 bg-blue-900/20 border border-blue-500/50 rounded-xl text-blue-400 text-sm mb-3">
              <strong>Note:</strong> GroupMe will use your currently logged-in account. To connect a different GroupMe account:
              <ol className="mt-2 ml-4 list-decimal">
                <li>Open <a href="https://web.groupme.com" target="_blank" className="underline">GroupMe Web</a> in a new tab</li>
                <li>Log out if needed and sign in with the desired account</li>
                <li>Return here and click "Connect GroupMe Account"</li>
              </ol>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleConnect} disabled={loading || !user}>
                {loading ? "Connecting..." : "Connect GroupMe Account"}
              </Button>
              {/* Debug button for clearing connection - only show in development */}
              {window.location.hostname === 'localhost' && (
                <Button 
                  onClick={() => {
                    localStorage.removeItem(`groupme_user_id_${user.uid}`);
                    setGroupmeUserId('');
                    setConnected(false);
                    setGroups([]);
                    setSelectedGroup('');
                    setBotCreated(false);
                    addDebug('Cleared all connection data - ready for fresh connection');
                    checkConnectionStatus();
                  }}
                  disabled={loading || !user}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Clear Connection (Debug)
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-400 font-medium">✓ Connected to GroupMe</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    // Open GroupMe logout in new tab
                    window.open('https://web.groupme.com/signout', '_blank');
                    setTimeout(() => {
                      alert('After logging out of GroupMe and signing in with a different account, click "Switch Account" to reconnect.');
                    }, 500);
                  }}
                  className="text-sm text-blue-400 hover:text-blue-300"
                >
                  Change GroupMe User
                </button>
                <button 
                  onClick={disconnect}
                  className="text-sm text-muted hover:text-red-400"
                >
                  Disconnect
                </button>
              </div>
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
                
                {/* Show existing bots */}
                {existingBots.length > 0 && (
                  <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-500/50 rounded-xl">
                    <p className="text-sm font-medium text-yellow-400 mb-2">
                      ⚠️ Existing Bots ({existingBots.length}):
                    </p>
                    <div className="space-y-2">
                      {existingBots.map(bot => (
                        <div key={bot.id} className="flex items-center justify-between text-xs">
                          <span className="text-yellow-300">
                            {bot.name} in {groups.find(g => g.id === bot.group_id)?.name || 'Unknown Group'} 
                            {bot.store && ` - Store: ${bot.store}`}
                          </span>
                          <button
                            onClick={() => deleteBot(bot.bot_id)}
                            disabled={loading}
                            className="text-red-400 hover:text-red-300 underline"
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-yellow-500 mt-2">
                      If you're getting a "callback URL already registered" error, delete the existing bot first.
                    </p>
                  </div>
                )}
                
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