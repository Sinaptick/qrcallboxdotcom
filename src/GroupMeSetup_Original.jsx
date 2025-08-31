import React, { useState, useEffect, useRef, useCallback } from "react";
import Button from "./Button.jsx";
import { useFirebase } from "./hooks/useFirebase.js";

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
  
  // Refs to track event listeners and timeouts
  const messageHandlerRef = useRef(null);
  const cleanupTimeoutRef = useRef(null);

  // Check connection status on load
  useEffect(() => {
    checkConnectionStatus();
    
    // Cleanup on unmount
    return () => {
      if (messageHandlerRef.current) {
        window.removeEventListener('message', messageHandlerRef.current);
      }
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
    };
  }, [user]);

  const addDebug = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, `${timestamp}: ${message}`]);
    console.log(`[GroupMe Debug] ${message}`);
  }, []);

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
        // Load groups and bots concurrently
        await loadUserData(storedUserId);
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
    
    // Clean up any existing listener before adding new one
    if (messageHandlerRef.current) {
      window.removeEventListener('message', messageHandlerRef.current);
    }
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
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
          
          // Load groups and bots concurrently
          loadUserData(userId);
          
          // Clean up the event listener
          window.removeEventListener('message', handleMessage);
          messageHandlerRef.current = null;
          
          // Clear the timeout
          if (cleanupTimeoutRef.current) {
            clearTimeout(cleanupTimeoutRef.current);
            cleanupTimeoutRef.current = null;
          }
        }
      }
    };
    
    // Store reference to handler for cleanup
    messageHandlerRef.current = handleMessage;
    window.addEventListener('message', handleMessage);
    
    // Clean up listener after 5 minutes
    cleanupTimeoutRef.current = setTimeout(() => {
      if (messageHandlerRef.current) {
        window.removeEventListener('message', messageHandlerRef.current);
        messageHandlerRef.current = null;
      }
    }, 300000);
  };

  // Concurrent data loading for better performance
  const loadUserData = async (userId) => {
    setLoading(true);
    try {
      // Load groups and bots concurrently instead of sequentially
      const [groupsResult, botsResult] = await Promise.allSettled([
        fetchGroups(userId),
        fetchExistingBots(userId)
      ]);
      
      // Log results
      if (groupsResult.status === 'rejected') {
        addDebug(`Failed to load groups: ${groupsResult.reason}`);
        setError(`Failed to load groups: ${groupsResult.reason}`);
      }
      if (botsResult.status === 'rejected') {
        addDebug(`Failed to load bots: ${botsResult.reason}`);
      }
    } finally {
      setLoading(false);
    }
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
      
      // Note: fetchExistingBots is now called concurrently in loadUserData()
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
        name: "CallBot",
        ...(isAdmin && adminStoreOverride && { admin_store_override: adminStoreOverride })
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

  // Enhanced bot debugging with GroupMe API direct call
  const debugGroupMeBots = async () => {
    if (!groupmeUserId) {
      setError("No GroupMe user ID found. Please reconnect.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      addDebug("Starting enhanced GroupMe bot debugging...");

      const token = await user.getIdToken();
      
      // Call the sync endpoint with debug=true to get detailed info
      const res = await fetch(`/api/groupme/sync-bots?debug=true`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: groupmeUserId,
          debug: true
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const result = await res.json();
      
      // Enhanced debug logging
      if (result.debug_info) {
        addDebug(`🔍 DETAILED DEBUG RESULTS:`);
        addDebug(`GroupMe API bots: ${result.debug_info.total_groupme_bots}`);
        addDebug(`Database bots: ${result.debug_info.total_database_bots}`);
        addDebug(`Groups available: ${result.debug_info.groups_count}`);
        
        if (result.debug_info.groupme_bots && result.debug_info.groupme_bots.length > 0) {
          addDebug(`⚠️ GROUPME BOTS FOUND:`);
          result.debug_info.groupme_bots.forEach((bot, idx) => {
            const groupName = result.debug_info.groups?.find(g => g.id === bot.group_id)?.name || 'Unknown Group';
            addDebug(`  ${idx + 1}. "${bot.name}" in "${groupName}" (ID: ${bot.bot_id})`);
            addDebug(`     Callback: ${bot.callback_url || 'No callback'}`);
          });
        } else {
          addDebug("✅ No bots found in GroupMe API");
        }
        
        if (result.debug_info.database_bots && result.debug_info.database_bots.length > 0) {
          addDebug(`💾 DATABASE BOTS FOUND:`);
          result.debug_info.database_bots.forEach((bot, idx) => {
            addDebug(`  ${idx + 1}. "${bot.name}" (Bot ID: ${bot.bot_id}, Group: ${bot.group_id})`);
          });
        } else {
          addDebug("📭 No bots found in database");
        }
      } else {
        // Fallback to regular sync result
        addDebug(`Sync result: ${JSON.stringify(result)}`);
      }
      
      // Refresh existing bots list
      await fetchExistingBots(groupmeUserId);
      
    } catch (err) {
      const errorMsg = `Debug failed: ${err.message}`;
      addDebug(errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Sync missing bots from GroupMe to database
  const syncMissingBots = async () => {
    if (!groupmeUserId) {
      setError("No GroupMe user ID found. Please reconnect.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      addDebug("Starting bot sync process...");

      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/sync-bots`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: groupmeUserId
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const result = await res.json();
      addDebug(`Sync result: ${JSON.stringify(result)}`);
      
      // Refresh existing bots list
      await fetchExistingBots(groupmeUserId);
      
      addDebug(`Bot sync completed. Found ${result.synced || 0} bots to sync.`);
      
    } catch (err) {
      const errorMsg = `Bot sync failed: ${err.message}`;
      addDebug(errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Force refresh profile and connection
  const refreshProfile = async () => {
    if (!groupmeUserId) {
      setError("No GroupMe user ID found. Please reconnect.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      addDebug("Refreshing GroupMe profile...");

      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/profile?user_id=${groupmeUserId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        addDebug(`Profile fetch failed: HTTP ${res.status} - ${errorText}`);
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const profile = await res.json();
      addDebug(`Profile refreshed: ${JSON.stringify(profile)}`);
      
    } catch (err) {
      const errorMsg = `Profile refresh failed: ${err.message}`;
      addDebug(errorMsg);
      setError(errorMsg);
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

  // Admin: Create bot for any store
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminBotStore, setAdminBotStore] = useState("");
  const [adminBotOwner, setAdminBotOwner] = useState("");
  const [adminBotName, setAdminBotName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminStoreOverride, setAdminStoreOverride] = useState("");

  // Check if current user is admin
  useEffect(() => {
    const checkAdminStatus = () => {
      addDebug(`Admin check starting - User: ${user ? user.uid : 'none'}`);
      if (!user) {
        addDebug('No user found, skipping admin check');
        setIsAdmin(false);
        return;
      }
      
      // Simple hardcoded admin check using Firebase email
      const adminStatus = user.email === 'sinaptick@gmail.com';
      console.log(`Admin check - User email: ${user.email}, Is admin: ${adminStatus}`);
      addDebug(`Admin check: "${user.email}" === "sinaptick@gmail.com" -> ${adminStatus ? 'ADMIN' : 'NOT ADMIN'}`);
      setIsAdmin(adminStatus);
    };
    checkAdminStatus();
  }, [user]);

  const createAdminBot = async () => {
    if (!adminBotStore || !adminBotOwner || !selectedGroup) {
      setError("Please fill all admin bot fields");
      return;
    }

    try {
      setLoading(true);
      setError("");
      addDebug(`Creating admin bot for store ${adminBotStore}, owner ${adminBotOwner}`);

      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/admin-create-bot`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          owner_user_id: adminBotOwner,
          group_id: selectedGroup,
          store_number: adminBotStore,
          bot_name: adminBotName || `Store ${adminBotStore} Bot`
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const result = await res.json();
      addDebug(`Admin bot created successfully: ${JSON.stringify(result)}`);
      
      // Refresh existing bots list
      await fetchExistingBots(groupmeUserId);
      
      // Clear form
      setAdminBotStore("");
      setAdminBotOwner("");
      setAdminBotName("");

    } catch (err) {
      const errorMsg = `Admin bot creation failed: ${err.message}`;
      addDebug(errorMsg);
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
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

        {/* Admin Status Debug */}
        {user && (
          <div className="mb-3 p-2 bg-gray-900/20 border border-gray-500/50 rounded text-xs text-gray-400">
            User: {user.email} | Admin: {isAdmin ? '✅ YES' : '❌ NO'} | Connected: {connected ? '✅' : '❌'}
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

                {/* Admin store override for regular bot creation */}
                {isAdmin && (
                  <div className="p-3 bg-orange-900/20 border border-orange-500/50 rounded-xl">
                    <label className="block text-sm font-medium text-orange-400 mb-1">
                      🛡️ Admin: Override Store Number (Optional):
                    </label>
                    <input
                      type="text"
                      value={adminStoreOverride}
                      onChange={(e) => setAdminStoreOverride(e.target.value)}
                      placeholder="e.g., 2988 (leave blank to auto-detect from group name)"
                      className="w-full rounded-lg border border-orange-500/50 bg-orange-900/30 text-orange-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <p className="text-xs text-orange-300 mt-1">
                      As admin, you can specify which store this bot serves instead of using your home store (1458).
                    </p>
                  </div>
                )}
                
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

                {/* Bot sync and troubleshooting tools */}
                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-500/50 rounded-xl">
                  <p className="text-sm font-medium text-blue-400 mb-2">🔧 Troubleshooting Tools:</p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={debugGroupMeBots}
                      disabled={loading}
                      className="text-xs px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
                    >
                      {loading ? "Debugging..." : "🔍 Debug Bots"}
                    </button>
                    <button
                      onClick={syncMissingBots}
                      disabled={loading}
                      className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
                    >
                      {loading ? "Syncing..." : "Sync Missing Bots"}
                    </button>
                    <button
                      onClick={refreshProfile}
                      disabled={loading}
                      className="text-xs px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
                    >
                      {loading ? "Refreshing..." : "Refresh Profile"}
                    </button>
                    <button
                      onClick={() => fetchExistingBots(groupmeUserId)}
                      disabled={loading}
                      className="text-xs px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50"
                    >
                      {loading ? "Loading..." : "Reload Bots"}
                    </button>
                  </div>
                  <p className="text-xs text-blue-300 mt-2">
                    • <strong>🔍 Debug Bots:</strong> Deep scan of GroupMe API vs database<br/>
                    • <strong>Sync Missing Bots:</strong> Find bots in GroupMe that aren't in database<br/>
                    • <strong>Refresh Profile:</strong> Fix "pattern not match" errors<br/>
                    • <strong>Reload Bots:</strong> Refresh the bot list from database
                  </p>
                </div>

                {/* Admin Panel for Multi-Store Bot Creation */}
                {isAdmin && (
                  <div className="mt-4 p-3 bg-purple-900/20 border border-purple-500/50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-purple-400">🛡️ Admin: Multi-Store Bot Creation</p>
                      <button
                        onClick={() => setShowAdminPanel(!showAdminPanel)}
                        className="text-xs text-purple-300 hover:text-purple-200"
                      >
                        {showAdminPanel ? "Hide" : "Show"}
                      </button>
                    </div>
                    
                    {showAdminPanel && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-purple-300 mb-1">
                              Store Number:
                            </label>
                            <input
                              type="text"
                              value={adminBotStore}
                              onChange={(e) => setAdminBotStore(e.target.value)}
                              placeholder="e.g., 2988"
                              className="w-full rounded-lg border border-purple-500/50 bg-purple-900/30 text-purple-100 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-purple-300 mb-1">
                              Owner GroupMe ID:
                            </label>
                            <input
                              type="text"
                              value={adminBotOwner}
                              onChange={(e) => setAdminBotOwner(e.target.value)}
                              placeholder="e.g., 97510571"
                              className="w-full rounded-lg border border-purple-500/50 bg-purple-900/30 text-purple-100 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-purple-300 mb-1">
                            Bot Name (Optional):
                          </label>
                          <input
                            type="text"
                            value={adminBotName}
                            onChange={(e) => setAdminBotName(e.target.value)}
                            placeholder="e.g., Store 2988 CallBot"
                            className="w-full rounded-lg border border-purple-500/50 bg-purple-900/30 text-purple-100 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
                          />
                        </div>
                        <button
                          onClick={createAdminBot}
                          disabled={loading || !selectedGroup || !adminBotStore || !adminBotOwner}
                          className="w-full text-xs px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50"
                        >
                          {loading ? "Creating Admin Bot..." : "Create Bot for Store"}
                        </button>
                        <p className="text-xs text-purple-300">
                          Creates a bot for any store using an existing GroupMe user's token. 
                          The owner must have connected their GroupMe account first.
                        </p>
                      </div>
                    )}
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

        {/* Admin: Fix Existing Bot Store Numbers */}
        {isAdmin && existingBots.length > 0 && (
          <div className="mt-4 p-4 bg-orange-900/20 border border-orange-500/50 rounded-xl">
            <h3 className="text-lg font-semibold text-orange-400 mb-2">
              🛡️ Admin: Fix Bot Store Numbers
            </h3>
            <p className="text-sm text-gray-300 mb-3">
              Update existing bots with correct store numbers based on their group names.
            </p>
            <Button 
              onClick={async () => {
                setLoading(true);
                try {
                  const res = await fetch('/api/groupme/sync-bots', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${await user.getIdToken()}`
                    },
                    body: JSON.stringify({
                      user_id: groupmeUserId
                    })
                  });
                  const result = await res.json();
                  if (result.success) {
                    addDebug(`Bot store numbers updated successfully - Fixed: ${result.fixed || 0} bots`);
                    await fetchExistingBots(groupmeUserId); // Refresh the list
                  } else {
                    throw new Error(result.error);
                  }
                } catch (err) {
                  addDebug(`Failed to fix bot store numbers: ${err.message}`);
                  setError(err.message);
                }
                setLoading(false);
              }}
              disabled={loading}
            >
              {loading ? "Fixing Store Numbers..." : "Fix Bot Store Numbers"}
            </Button>
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