import React, { useCallback } from "react";
import Button from "../../Button.jsx";

/**
 * GroupMeBots Component
 * Handles bot creation, deletion, syncing, and debugging
 * Extracted from GroupMeSetup for better separation of concerns
 */
const GroupMeBots = React.memo(function GroupMeBots({
  user,
  selectedGroup,
  groupmeUserId,
  loading,
  setLoading,
  botCreated,
  setBotCreated,
  existingBots,
  setExistingBots,
  addDebug,
  onError,
  isAdmin = false,
  adminStoreOverride = null
}) {

  const fetchExistingBots = useCallback(async (userId) => {
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
  }, [user, setExistingBots, addDebug]);

  const deleteBot = useCallback(async (botId) => {
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
        await fetchExistingBots(groupmeUserId);
      } else {
        const text = await res.text();
        onError(`Failed to delete bot: ${text}`);
      }
    } catch (err) {
      addDebug(`Delete bot error: ${err.message}`);
      onError("Failed to delete bot: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [user, groupmeUserId, setLoading, addDebug, fetchExistingBots, onError]);

  const handleCreateBot = useCallback(async () => {
    if (!selectedGroup || !groupmeUserId) return;
    
    addDebug(`Starting bot creation for group: ${selectedGroup}, user: ${groupmeUserId}`);
    
    try {
      setLoading(true);
      onError("");
      
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
      
      // Refresh existing bots
      await fetchExistingBots(groupmeUserId);
      
    } catch (err) {
      const errorMsg = "Failed to create bot: " + err.message;
      addDebug(`Bot creation error: ${errorMsg}`);
      onError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [selectedGroup, groupmeUserId, user, setLoading, setBotCreated, addDebug, onError, isAdmin, adminStoreOverride, fetchExistingBots]);

  const debugGroupMeBots = useCallback(async () => {
    if (!groupmeUserId) {
      onError("No GroupMe user ID found. Please reconnect.");
      return;
    }

    try {
      setLoading(true);
      onError("");
      addDebug("Starting enhanced GroupMe bot debugging...");

      const token = await user.getIdToken();
      
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
        addDebug(`Sync result: ${JSON.stringify(result)}`);
      }
      
      await fetchExistingBots(groupmeUserId);
      
    } catch (err) {
      const errorMsg = `Debug failed: ${err.message}`;
      addDebug(errorMsg);
      onError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [groupmeUserId, user, setLoading, addDebug, onError, fetchExistingBots]);

  const syncMissingBots = useCallback(async () => {
    if (!groupmeUserId) {
      onError("No GroupMe user ID found. Please reconnect.");
      return;
    }

    try {
      setLoading(true);
      onError("");
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
      
      await fetchExistingBots(groupmeUserId);
      
      addDebug(`Bot sync completed. Found ${result.synced || 0} bots to sync.`);
      
    } catch (err) {
      const errorMsg = `Bot sync failed: ${err.message}`;
      addDebug(errorMsg);
      onError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [groupmeUserId, user, setLoading, addDebug, onError, fetchExistingBots]);

  if (!selectedGroup) {
    return (
      <div className="text-sm text-muted text-center py-4">
        Please select a group first to manage bots.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Existing Bots Display */}
      {existingBots.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-primary">Existing Bots:</h4>
          {existingBots.map((bot) => (
            <div key={bot.bot_id} className="flex items-center justify-between p-2 bg-tertiary rounded-lg">
              <div>
                <div className="text-sm font-medium text-primary">{bot.name}</div>
                <div className="text-xs text-secondary">
                  Group: {bot.group_name || bot.group_id} | Bot ID: {bot.bot_id}
                </div>
              </div>
              <Button
                onClick={() => deleteBot(bot.bot_id)}
                disabled={loading}
                className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1"
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Bot Creation */}
      {!botCreated ? (
        <div className="space-y-3">
          <p className="text-sm text-secondary">
            Create a bot in the selected group to receive notifications.
          </p>
          <Button
            onClick={handleCreateBot}
            disabled={loading || !selectedGroup}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? "Creating Bot..." : "Create CallBot"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm text-green-400 font-medium">
            ✓ Bot created successfully! You'll now receive notifications when customers scan QR codes.
          </div>
          <Button
            onClick={() => setBotCreated(false)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
          >
            Create Another Bot
          </Button>
        </div>
      )}

      {/* Debug and Sync Tools */}
      <div className="pt-4 border-t border-themed space-y-2">
        <h4 className="text-sm font-medium text-primary">Bot Management Tools:</h4>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={debugGroupMeBots}
            disabled={loading}
            className="bg-yellow-600 hover:bg-yellow-700 text-white text-xs"
          >
            Debug Bots
          </Button>
          <Button
            onClick={syncMissingBots}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 text-white text-xs"
          >
            Sync Bots
          </Button>
          <Button
            onClick={() => fetchExistingBots(groupmeUserId)}
            disabled={loading}
            className="bg-gray-600 hover:bg-gray-700 text-white text-xs"
          >
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
});

export default GroupMeBots;