import React, { useState, useCallback } from "react";
import { useFirebase } from "../../hooks/useFirebase.js";
import Button from "../../Button.jsx";

/**
 * GroupMeAdminPanel Component
 * Admin-specific GroupMe bot management by store number
 * Lookup store and show all users with their GroupMe bot status
 */
const GroupMeAdminPanel = React.memo(function GroupMeAdminPanel() {
  const { auth } = useFirebase();
  const user = auth?.currentUser;
  
  const [storeNumber, setStoreNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState([]);
  const [storeUsers, setStoreUsers] = useState([]);

  // Debug logging function
  const addDebug = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, `${timestamp}: ${message}`]);
    console.log(`[Admin GroupMe Debug] ${message}`);
  }, []);

  // Clear debug info
  const clearDebug = useCallback(() => {
    setDebugInfo([]);
  }, []);

  // Error handling
  const handleError = useCallback((errorMessage) => {
    setError(errorMessage);
    addDebug(`ERROR: ${errorMessage}`);
  }, [addDebug]);

  // Look up store users
  const lookupStore = useCallback(async () => {
    if (!storeNumber.trim()) {
      handleError("Please enter a store number");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setStoreUsers([]);
      addDebug(`Looking up store: ${storeNumber}`);
      
      const token = await user.getIdToken();
      addDebug(`Got auth token: ${token.substring(0, 20)}...`);
      
      const url = `/api/groupme/admin-lookup-store`;
      const fullUrl = `${window.location.origin}${url}`;
      addDebug(`Calling API URL: ${url}`);
      addDebug(`Full URL: ${fullUrl}`);
      console.log('Admin GroupMe lookup - Full URL:', fullUrl);
      
      const requestBody = JSON.stringify({
        store_number: parseInt(storeNumber.trim())
      });
      addDebug(`Request body: ${requestBody}`);
      console.log('Admin GroupMe lookup - Request body:', requestBody);
      
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: requestBody
      });
      
      addDebug(`Response status: ${res.status} ${res.statusText}`);
      console.log('Admin GroupMe lookup - Response:', res.status, res.statusText);
      
      // Log response headers
      const headers = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });
      addDebug(`Response headers: ${JSON.stringify(headers)}`);
      console.log('Admin GroupMe lookup - Headers:', headers);
      
      const responseText = await res.text();
      addDebug(`Raw response (first 500 chars): ${responseText.substring(0, 500)}`);
      console.log('Admin GroupMe lookup - Response text:', responseText);
      
      if (!res.ok) {
        console.error('Admin GroupMe lookup - Error response:', responseText);
        throw new Error(`HTTP ${res.status}: ${responseText}`);
      }

      let data;
      try {
        data = JSON.parse(responseText);
        addDebug(`Successfully parsed JSON response`);
      } catch (parseError) {
        addDebug(`Failed to parse JSON: ${parseError.message}`);
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}`);
      }
      
      if (data.users && data.users.length > 0) {
        setStoreUsers(data.users);
        addDebug(`Found ${data.users.length} users for store ${storeNumber}`);
        
        // Load GroupMe data for each user
        for (const user of data.users) {
          if (user.groupme_user_id) {
            await loadUserBots(user.id, user.groupme_user_id);
          }
        }
      } else {
        addDebug(`No users found for store ${storeNumber}`);
        setStoreUsers([]);
      }
      
    } catch (err) {
      handleError(`Store lookup failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [storeNumber, user, addDebug, handleError]);

  // Load user's GroupMe bots
  const loadUserBots = useCallback(async (userId, groupmeUserId) => {
    try {
      addDebug(`Loading bots for user ${userId} (GroupMe: ${groupmeUserId})`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/admin-user-bots?user_id=${groupmeUserId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        addDebug(`Failed to load bots for user ${userId}: ${errorText}`);
        return;
      }

      const data = await res.json();
      addDebug(`User ${userId}: Found ${data.bots?.length || 0} bots`);
      
      // Update the user in storeUsers with bot data
      setStoreUsers(prevUsers => 
        prevUsers.map(u => 
          u.id === userId 
            ? { ...u, botData: data }
            : u
        )
      );
      
    } catch (err) {
      addDebug(`Failed to load bots for user ${userId}: ${err.message}`);
    }
  }, [user, addDebug]);

  // Debug specific bot
  const debugBot = useCallback(async (botId, groupmeUserId) => {
    try {
      setLoading(true);
      addDebug(`Debugging bot: ${botId}`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/groupme/debug-bot`, {
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

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const result = await res.json();
      addDebug(`Bot debug result: ${JSON.stringify(result, null, 2)}`);
      
    } catch (err) {
      addDebug(`Bot debug failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user, addDebug]);

  // Delete bot for user
  const deleteBot = useCallback(async (botId, userId, groupmeUserId) => {
    if (!confirm(`Are you sure you want to delete bot ${botId}? This cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      addDebug(`Admin deleting bot: ${botId} for user ${userId}`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/groupme/delete-bot`, {
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

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      addDebug(`Bot ${botId} deleted successfully`);
      
      // Reload bot data for this user
      await loadUserBots(userId, groupmeUserId);
      
    } catch (err) {
      addDebug(`Delete failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user, addDebug, loadUserBots]);

  return (
    <div className="space-y-4">
      {/* Store Lookup Section */}
      <div className="bg-tertiary rounded-xl p-4 border border-themed">
        <h4 className="text-md font-semibold mb-3 text-primary">Store Lookup</h4>
        
        <div className="flex gap-2 mb-3">
          <input
            type="number"
            placeholder="Enter store number (e.g. 1234)"
            value={storeNumber}
            onChange={(e) => setStoreNumber(e.target.value)}
            className="flex-1 rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
            onKeyPress={(e) => e.key === 'Enter' && lookupStore()}
          />
          <Button
            onClick={lookupStore}
            disabled={loading || !storeNumber.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
          >
            {loading ? "Looking up..." : "Lookup Store"}
          </Button>
        </div>
      </div>

      {/* Store Users Section */}
      {storeUsers.length > 0 && (
        <div className="bg-tertiary rounded-xl p-4 border border-themed">
          <h4 className="text-md font-semibold mb-3 text-primary">
            Store {storeNumber} Users ({storeUsers.length})
          </h4>
          
          <div className="space-y-4">
            {storeUsers.map((storeUser) => (
              <div key={storeUser.id} className="border border-themed rounded-lg p-4 bg-secondary">
                {/* User Info Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1">
                    <div className="font-medium text-primary">
                      {storeUser.firstName} {storeUser.lastName}
                    </div>
                    <div className="text-sm text-secondary">{storeUser.email}</div>
                    <div className="text-xs text-muted">
                      {storeUser.jobTitle} | User ID: {storeUser.id}
                    </div>
                  </div>
                  <div className="text-sm">
                    {storeUser.groupme_user_id ? (
                      <span className="text-green-400">✓ GroupMe Connected</span>
                    ) : (
                      <span className="text-muted">No GroupMe</span>
                    )}
                  </div>
                </div>

                {/* GroupMe Bots for this user */}
                {storeUser.groupme_user_id && storeUser.botData && (
                  <div className="mt-3 pt-3 border-t border-themed">
                    <div className="text-sm font-medium text-primary mb-2">
                      GroupMe Bots ({storeUser.botData.bots?.length || 0})
                    </div>
                    
                    {storeUser.botData.bots && storeUser.botData.bots.length > 0 ? (
                      <div className="space-y-2">
                        {storeUser.botData.bots.map((bot) => (
                          <div key={bot.bot_id} className="flex items-center justify-between p-2 bg-tertiary rounded border border-themed">
                            <div className="flex-1">
                              <div className="text-sm font-medium text-primary">{bot.name}</div>
                              <div className="text-xs text-secondary">
                                Bot ID: {bot.bot_id} | Group: {bot.group_name || bot.group_id}
                              </div>
                              {bot.callback_url && (
                                <div className="text-xs text-muted">
                                  Callback: {bot.callback_url}
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 ml-4">
                              <Button
                                onClick={() => debugBot(bot.bot_id, storeUser.groupme_user_id)}
                                disabled={loading}
                                className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs px-2 py-1"
                              >
                                Debug
                              </Button>
                              <Button
                                onClick={() => deleteBot(bot.bot_id, storeUser.id, storeUser.groupme_user_id)}
                                disabled={loading}
                                className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1"
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted py-2">
                        No GroupMe bots found for this user
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Debug Information */}
      {debugInfo.length > 0 && (
        <div className="bg-tertiary rounded-xl p-4 border border-themed">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-primary">Debug Information</h4>
            <Button
              onClick={clearDebug}
              className="bg-gray-600 hover:bg-gray-700 text-white text-xs px-2 py-1"
            >
              Clear
            </Button>
          </div>
          <div className="bg-black rounded p-3 max-h-48 overflow-y-auto">
            {debugInfo.map((info, index) => (
              <div key={index} className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                {info}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default GroupMeAdminPanel;