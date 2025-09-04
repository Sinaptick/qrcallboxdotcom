import React, { useState, useCallback } from "react";
import { useFirebase } from "../../hooks/useFirebase.js";
import Button from "../../Button.jsx";

/**
 * GroupMeAdminPanel Component
 * Admin-specific GroupMe bot management for helping other users
 * Does not load admin's own GroupMe data, focuses on tools for managing other users' bots
 */
const GroupMeAdminPanel = React.memo(function GroupMeAdminPanel() {
  const { auth } = useFirebase();
  const user = auth?.currentUser;
  
  const [targetUserId, setTargetUserId] = useState("");
  const [groupmeUserId, setGroupmeUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState([]);
  const [botData, setBotData] = useState(null);

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

  // Look up user's GroupMe connection
  const lookupUser = useCallback(async () => {
    if (!targetUserId.trim()) {
      handleError("Please enter a user email or ID");
      return;
    }

    try {
      setLoading(true);
      setError("");
      addDebug(`Looking up user: ${targetUserId}`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/groupme/lookup-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_identifier: targetUserId.trim()
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      
      if (data.groupme_user_id) {
        setGroupmeUserId(data.groupme_user_id);
        addDebug(`Found GroupMe user ID: ${data.groupme_user_id}`);
        
        // Auto-load bot data
        await loadUserBots(data.groupme_user_id);
      } else {
        addDebug("User has no GroupMe connection");
        setGroupmeUserId("");
        setBotData(null);
      }
      
    } catch (err) {
      handleError(`Lookup failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [targetUserId, user, addDebug, handleError]);

  // Load user's GroupMe bots
  const loadUserBots = useCallback(async (userId) => {
    try {
      addDebug(`Loading bots for GroupMe user: ${userId}`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/groupme/user-bots?user_id=${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      setBotData(data);
      addDebug(`Found ${data.bots?.length || 0} bots and ${data.groups?.length || 0} groups`);
      
    } catch (err) {
      addDebug(`Failed to load bots: ${err.message}`);
    }
  }, [user, addDebug]);

  // Debug specific bot
  const debugBot = useCallback(async (botId) => {
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
  }, [user, groupmeUserId, addDebug]);

  // Delete bot for user
  const deleteBot = useCallback(async (botId) => {
    if (!confirm(`Are you sure you want to delete bot ${botId}? This cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      addDebug(`Admin deleting bot: ${botId}`);
      
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
      
      // Reload bot data
      await loadUserBots(groupmeUserId);
      
    } catch (err) {
      addDebug(`Delete failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user, groupmeUserId, addDebug, loadUserBots]);

  return (
    <div className="space-y-4">
      {/* User Lookup Section */}
      <div className="bg-tertiary rounded-xl p-4 border border-themed">
        <h4 className="text-md font-semibold mb-3 text-primary">User Lookup</h4>
        
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Enter user email or Firebase UID"
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value)}
            className="flex-1 rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
            onKeyPress={(e) => e.key === 'Enter' && lookupUser()}
          />
          <Button
            onClick={lookupUser}
            disabled={loading || !targetUserId.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2"
          >
            {loading ? "Looking up..." : "Lookup"}
          </Button>
        </div>

        {groupmeUserId && (
          <div className="text-sm text-green-400">
            ✓ Found GroupMe connection: {groupmeUserId}
          </div>
        )}
      </div>

      {/* Bot Management Section */}
      {botData && (
        <div className="bg-tertiary rounded-xl p-4 border border-themed">
          <h4 className="text-md font-semibold mb-3 text-primary">
            User's GroupMe Bots ({botData.bots?.length || 0})
          </h4>
          
          {botData.bots && botData.bots.length > 0 ? (
            <div className="space-y-3">
              {botData.bots.map((bot) => (
                <div key={bot.bot_id} className="flex items-center justify-between p-3 bg-secondary rounded-lg border border-themed">
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
                      onClick={() => debugBot(bot.bot_id)}
                      disabled={loading}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs px-2 py-1"
                    >
                      Debug
                    </Button>
                    <Button
                      onClick={() => deleteBot(bot.bot_id)}
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
            <div className="text-sm text-muted py-4 text-center">
              No bots found for this user
            </div>
          )}
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