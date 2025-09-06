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
  const [selectedUserForBot, setSelectedUserForBot] = useState(null);
  const [userGroups, setUserGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [adminBotMode, setAdminBotMode] = useState(false);
  const [adminGroups, setAdminGroups] = useState([]);
  const [adminSelectedGroup, setAdminSelectedGroup] = useState("");
  const [adminBotStoreNumber, setAdminBotStoreNumber] = useState("");
  const [allBots, setAllBots] = useState([]);
  const [showBotOverview, setShowBotOverview] = useState(false);
  const [expandedBot, setExpandedBot] = useState(null);
  const [botDetails, setBotDetails] = useState({});

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

  // Load user's GroupMe groups for bot creation
  const loadUserGroups = useCallback(async (userId, groupmeUserId) => {
    try {
      addDebug(`Loading groups for user ${userId} (GroupMe: ${groupmeUserId})`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/groups?user_id=${groupmeUserId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        addDebug(`Failed to load groups for user ${userId}: ${errorText}`);
        return;
      }

      const data = await res.json();
      const groups = data.response || [];
      setUserGroups(groups);
      addDebug(`User ${userId}: Found ${groups.length} groups`);
      
    } catch (err) {
      addDebug(`Failed to load groups for user ${userId}: ${err.message}`);
    }
  }, [user, addDebug]);

  // Select user for bot creation
  const selectUserForBot = useCallback(async (storeUser) => {
    if (!storeUser.groupme_user_id) {
      handleError("This user doesn't have GroupMe connected");
      return;
    }
    
    setSelectedUserForBot(storeUser);
    setUserGroups([]);
    setSelectedGroup("");
    addDebug(`Selected user for bot creation: ${storeUser.firstName} ${storeUser.lastName}`);
    
    // Load their groups
    await loadUserGroups(storeUser.id, storeUser.groupme_user_id);
  }, [handleError, addDebug, loadUserGroups]);

  // Create bot for selected user
  const createBotForUser = useCallback(async () => {
    if (!selectedUserForBot || !selectedGroup) {
      handleError("Please select a user and group");
      return;
    }

    try {
      setLoading(true);
      addDebug(`Creating bot for ${selectedUserForBot.firstName} ${selectedUserForBot.lastName} in group ${selectedGroup}`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/admin-create-bot-for-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          target_user_id: selectedUserForBot.id,
          groupme_user_id: selectedUserForBot.groupme_user_id,
          group_id: selectedGroup,
          store_number: parseInt(storeNumber.trim())
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const result = await res.json();
      addDebug(`Bot created successfully: ${JSON.stringify(result)}`);
      
      // Refresh the user's bot data
      await loadUserBots(selectedUserForBot.id, selectedUserForBot.groupme_user_id);
      
      // Clear selection
      setSelectedUserForBot(null);
      setUserGroups([]);
      setSelectedGroup("");
      
    } catch (err) {
      addDebug(`Bot creation failed: ${err.message}`);
      handleError(`Failed to create bot: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [selectedUserForBot, selectedGroup, storeNumber, user, addDebug, handleError, loadUserBots]);

  // Load admin's own GroupMe groups
  const loadAdminGroups = useCallback(async () => {
    try {
      addDebug("Loading admin's GroupMe groups");
      
      const token = await user.getIdToken();
      // First get admin's GroupMe user ID
      const userDataRes = await fetch(`/api/groupme/admin-user-data?firebase_uid=${user.uid}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!userDataRes.ok) {
        addDebug("Admin doesn't have GroupMe connected");
        return;
      }
      
      const userData = await userDataRes.json();
      const adminGroupmeUserId = userData.groupme_user_id;
      
      if (!adminGroupmeUserId) {
        addDebug("Admin GroupMe user ID not found");
        return;
      }
      
      // Load admin's groups
      const groupsRes = await fetch(`/api/groupme/groups?user_id=${adminGroupmeUserId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!groupsRes.ok) {
        const errorText = await groupsRes.text();
        addDebug(`Failed to load admin groups: ${errorText}`);
        return;
      }

      const groupsData = await groupsRes.json();
      const groups = groupsData.response || [];
      setAdminGroups(groups);
      addDebug(`Admin: Found ${groups.length} GroupMe groups`);
      
    } catch (err) {
      addDebug(`Failed to load admin groups: ${err.message}`);
    }
  }, [user, addDebug]);

  // Start admin bot creation mode
  const startAdminBotMode = useCallback(async () => {
    setAdminBotMode(true);
    setAdminGroups([]);
    setAdminSelectedGroup("");
    setAdminBotStoreNumber("");
    addDebug("Starting admin bot creation mode");
    await loadAdminGroups();
  }, [loadAdminGroups, addDebug]);

  // Create bot for admin's own account
  const createAdminBot = useCallback(async () => {
    if (!adminSelectedGroup || !adminBotStoreNumber.trim()) {
      handleError("Please select a group and enter a store number");
      return;
    }

    try {
      setLoading(true);
      addDebug(`Creating admin bot for store ${adminBotStoreNumber} in group ${adminSelectedGroup}`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/admin-create-bot-for-self`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          group_id: adminSelectedGroup,
          store_number: parseInt(adminBotStoreNumber.trim())
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const result = await res.json();
      addDebug(`Admin bot created successfully: ${JSON.stringify(result)}`);
      
      // Clear admin bot mode
      setAdminBotMode(false);
      setAdminGroups([]);
      setAdminSelectedGroup("");
      setAdminBotStoreNumber("");
      
    } catch (err) {
      addDebug(`Admin bot creation failed: ${err.message}`);
      handleError(`Failed to create admin bot: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [adminSelectedGroup, adminBotStoreNumber, user, addDebug, handleError]);

  // Load all bots overview
  const loadAllBots = useCallback(async () => {
    try {
      setLoading(true);
      addDebug("Loading all GroupMe bots overview");
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/admin-all-bots`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        addDebug(`Failed to load all bots: ${errorText}`);
        handleError(`Failed to load bots: ${errorText}`);
        return;
      }

      const data = await res.json();
      setAllBots(data.bots || []);
      addDebug(`Loaded ${data.bots?.length || 0} total bots`);
      
    } catch (err) {
      addDebug(`Failed to load all bots: ${err.message}`);
      handleError(`Failed to load bots: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user, addDebug, handleError]);

  // Show bot overview
  const showBotOverviewPanel = useCallback(async () => {
    setShowBotOverview(true);
    await loadAllBots();
  }, [loadAllBots]);

  // Delete any bot (admin power)
  const deleteAnyBot = useCallback(async (bot) => {
    if (!confirm(`Are you sure you want to delete bot "${bot.name}" for store ${bot.store}? This cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      addDebug(`Admin deleting bot: ${bot.bot_id} (${bot.name})`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/admin-delete-any-bot`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bot_id: bot.bot_id,
          user_id: bot.user_id
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      addDebug(`Bot ${bot.bot_id} deleted successfully`);
      
      // Reload all bots
      await loadAllBots();
      
    } catch (err) {
      addDebug(`Delete failed: ${err.message}`);
      handleError(`Failed to delete bot: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user, addDebug, handleError, loadAllBots]);

  // Load detailed bot information
  const loadBotDetails = useCallback(async (botId) => {
    try {
      setLoading(true);
      addDebug(`Loading detailed information for bot ${botId}`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/admin-bot-details?bot_id=${botId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        addDebug(`Failed to load bot details: ${errorText}`);
        handleError(`Failed to load bot details: ${errorText}`);
        return;
      }

      const details = await res.json();
      setBotDetails(prev => ({
        ...prev,
        [botId]: details
      }));
      addDebug(`Loaded details for bot ${botId}: ${details.members?.length || 0} members, ${details.recentMessages?.length || 0} recent messages`);
      
    } catch (err) {
      addDebug(`Failed to load bot details: ${err.message}`);
      handleError(`Failed to load bot details: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user, addDebug, handleError]);

  // Toggle bot expansion
  const toggleBotExpansion = useCallback(async (bot) => {
    if (expandedBot?.bot_id === bot.bot_id) {
      // Collapse if already expanded
      setExpandedBot(null);
    } else {
      // Expand and load details if not already loaded
      setExpandedBot(bot);
      if (!botDetails[bot.bot_id]) {
        await loadBotDetails(bot.bot_id);
      }
    }
  }, [expandedBot, botDetails, loadBotDetails]);

  return (
    <div className="space-y-4">
      {/* Admin Bot Creation Section */}
      <div className="bg-tertiary rounded-xl p-4 border border-themed">
        <h4 className="text-md font-semibold mb-3 text-primary">Create Bot for My Admin Account</h4>
        <div className="text-sm text-secondary mb-4">
          Create multiple GroupMe bots under your admin account for different stores. Perfect for managing multiple locations.
        </div>
        
        {!adminBotMode ? (
          <Button
            onClick={startAdminBotMode}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            Create Bot for Myself
          </Button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Store Number:
              </label>
              <input
                type="number"
                placeholder="Enter store number (e.g., 3660)"
                value={adminBotStoreNumber}
                onChange={(e) => setAdminBotStoreNumber(e.target.value)}
                className="w-full rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
              />
            </div>
            
            {adminGroups.length > 0 ? (
              <div>
                <label className="block text-sm font-medium text-primary mb-2">
                  Select Your GroupMe Group:
                </label>
                <select
                  value={adminSelectedGroup}
                  onChange={(e) => setAdminSelectedGroup(e.target.value)}
                  className="w-full rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
                >
                  <option value="">Choose a group...</option>
                  {adminGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name} ({group.members?.length || 0} members)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="text-sm text-muted">
                {loading ? "Loading your GroupMe groups..." : "No GroupMe groups found. Make sure you have GroupMe connected."}
              </div>
            )}
            
            <div className="flex gap-2">
              <Button
                onClick={createAdminBot}
                disabled={loading || !adminSelectedGroup || !adminBotStoreNumber.trim()}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {loading ? "Creating Bot..." : "Create CallBot"}
              </Button>
              <Button
                onClick={() => {
                  setAdminBotMode(false);
                  setAdminGroups([]);
                  setAdminSelectedGroup("");
                  setAdminBotStoreNumber("");
                }}
                disabled={loading}
                className="bg-gray-600 hover:bg-gray-700 text-white"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Bot Overview Section */}
      <div className="bg-tertiary rounded-xl p-4 border border-themed">
        <h4 className="text-md font-semibold mb-3 text-primary">Bot Overview</h4>
        <div className="text-sm text-secondary mb-4">
          View all GroupMe bots in the system with their store assignments and owners.
        </div>
        
        {!showBotOverview ? (
          <Button
            onClick={showBotOverviewPanel}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {loading ? "Loading..." : "View All Bots"}
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm font-medium text-primary">
                Total Bots: {allBots.length}
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={loadAllBots}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1"
                >
                  {loading ? "Refreshing..." : "Refresh"}
                </Button>
                <Button
                  onClick={() => {
                    setShowBotOverview(false);
                    setAllBots([]);
                  }}
                  disabled={loading}
                  className="bg-gray-600 hover:bg-gray-700 text-white text-xs px-3 py-1"
                >
                  Hide
                </Button>
              </div>
            </div>
            
            {allBots.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {allBots.map((bot) => (
                  <div key={bot.bot_id} className="border border-themed rounded-lg bg-secondary">
                    <div className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <button
                              onClick={() => toggleBotExpansion(bot)}
                              className="text-sm font-medium text-primary hover:text-indigo-400 transition-colors flex items-center gap-2"
                            >
                              {bot.name}
                              <span className="text-xs">
                                {expandedBot?.bot_id === bot.bot_id ? '▼' : '▶'}
                              </span>
                            </button>
                            <div className="bg-blue-600 text-white text-xs px-2 py-1 rounded">
                              Store {bot.store}
                            </div>
                            {bot.admin_self_created && (
                              <div className="bg-purple-600 text-white text-xs px-2 py-1 rounded">
                                Admin Bot
                              </div>
                            )}
                          </div>
                          
                          <div className="text-xs text-secondary space-y-1">
                            <div>Bot ID: {bot.bot_id}</div>
                            <div>Group: {bot.group_name || 'Unknown Group'} ({bot.member_count || 0} members)</div>
                            <div>Group ID: {bot.group_id}</div>
                            <div>Owner: {bot.firebase_uid} ({bot.user_id})</div>
                            {bot.created_at && (
                              <div>Created: {new Date(bot.created_at.seconds * 1000).toLocaleString()}</div>
                            )}
                            {bot.created_by_admin && (
                              <div>Created by admin: {bot.created_by_admin}</div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex gap-2 ml-4">
                          <Button
                            onClick={() => deleteAnyBot(bot)}
                            disabled={loading}
                            className="bg-red-600 hover:bg-red-700 text-white text-xs px-2 py-1"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Expanded Details */}
                    {expandedBot?.bot_id === bot.bot_id && (
                      <div className="border-t border-themed p-3 bg-tertiary">
                        {botDetails[bot.bot_id] ? (
                          <div className="space-y-4">
                            {/* Group Details */}
                            {botDetails[bot.bot_id].groupDetails && (
                              <div>
                                <h5 className="text-sm font-medium text-primary mb-2">Group Information</h5>
                                <div className="text-xs text-secondary space-y-1 bg-secondary p-2 rounded">
                                  <div><strong>Name:</strong> {botDetails[bot.bot_id].groupDetails.name}</div>
                                  <div><strong>Description:</strong> {botDetails[bot.bot_id].groupDetails.description || 'None'}</div>
                                  <div><strong>Members:</strong> {botDetails[bot.bot_id].groupDetails.member_count}</div>
                                  <div><strong>Created:</strong> {new Date(botDetails[bot.bot_id].groupDetails.created_at * 1000).toLocaleString()}</div>
                                  <div><strong>Updated:</strong> {new Date(botDetails[bot.bot_id].groupDetails.updated_at * 1000).toLocaleString()}</div>
                                </div>
                              </div>
                            )}
                            
                            {/* Members */}
                            {botDetails[bot.bot_id].members && botDetails[bot.bot_id].members.length > 0 && (
                              <div>
                                <h5 className="text-sm font-medium text-primary mb-2">
                                  Group Members ({botDetails[bot.bot_id].members.length})
                                </h5>
                                <div className="max-h-32 overflow-y-auto bg-secondary p-2 rounded">
                                  <div className="grid grid-cols-2 gap-2">
                                    {botDetails[bot.bot_id].members.map((member, idx) => (
                                      <div key={idx} className="text-xs text-secondary flex items-center gap-2">
                                        {member.image_url && (
                                          <img 
                                            src={member.image_url} 
                                            alt={member.nickname} 
                                            className="w-4 h-4 rounded-full"
                                          />
                                        )}
                                        <span className={`${member.muted ? 'text-muted line-through' : ''}`}>
                                          {member.nickname}
                                          {member.roles && member.roles.includes('admin') && (
                                            <span className="text-yellow-400 ml-1">👑</span>
                                          )}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Recent Messages */}
                            {botDetails[bot.bot_id].recentMessages && botDetails[bot.bot_id].recentMessages.length > 0 && (
                              <div>
                                <h5 className="text-sm font-medium text-primary mb-2">
                                  Recent Messages ({botDetails[bot.bot_id].recentMessages.length})
                                </h5>
                                <div className="max-h-40 overflow-y-auto bg-secondary p-2 rounded space-y-2">
                                  {botDetails[bot.bot_id].recentMessages.map((msg, idx) => (
                                    <div key={idx} className="text-xs border-b border-themed pb-1">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-primary font-medium">{msg.name || 'System'}</span>
                                        <span className="text-muted">
                                          {new Date(msg.created_at * 1000).toLocaleString()}
                                        </span>
                                      </div>
                                      <div className="text-secondary">
                                        {msg.text || '(No text)'}
                                        {msg.favorited_by > 0 && (
                                          <span className="text-yellow-400 ml-2">❤️ {msg.favorited_by}</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            
                            {/* Bot Live Data */}
                            {botDetails[bot.bot_id].bot?.live_data && (
                              <div>
                                <h5 className="text-sm font-medium text-primary mb-2">Live Bot Status</h5>
                                <div className="text-xs text-secondary bg-secondary p-2 rounded space-y-1">
                                  <div><strong>Status:</strong> <span className="text-green-400">Active</span></div>
                                  <div><strong>Callback URL:</strong> {botDetails[bot.bot_id].bot.live_data.callback_url}</div>
                                  {botDetails[bot.bot_id].bot.live_data.avatar_url && (
                                    <div className="flex items-center gap-2">
                                      <strong>Avatar:</strong> 
                                      <img 
                                        src={botDetails[bot.bot_id].bot.live_data.avatar_url} 
                                        alt="Bot avatar" 
                                        className="w-6 h-6 rounded"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {botDetails[bot.bot_id].error && (
                              <div className="text-xs text-red-400 bg-red-900/20 p-2 rounded">
                                Error: {botDetails[bot.bot_id].error}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-muted text-center py-4">
                            {loading ? "Loading detailed information..." : "Click to load details"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted py-4 text-center">
                {loading ? "Loading bots..." : "No bots found in the system"}
              </div>
            )}
          </div>
        )}
      </div>

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
                  <div className="flex items-center gap-3">
                    <div className="text-sm">
                      {storeUser.groupme_user_id ? (
                        <span className="text-green-400">✓ GroupMe Connected</span>
                      ) : (
                        <span className="text-muted">No GroupMe</span>
                      )}
                    </div>
                    {storeUser.groupme_user_id && (
                      <Button
                        onClick={() => selectUserForBot(storeUser)}
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1"
                      >
                        Create Bot
                      </Button>
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

      {/* Admin Bot Creation Panel */}
      {selectedUserForBot && (
        <div className="bg-tertiary rounded-xl p-4 border border-themed">
          <h4 className="text-md font-semibold mb-3 text-primary">
            Create Bot for {selectedUserForBot.firstName} {selectedUserForBot.lastName}
          </h4>
          
          <div className="space-y-4">
            <div className="text-sm text-secondary">
              Creating a bot in this user's GroupMe group will allow them to receive QR code notifications 
              for store {storeNumber}.
            </div>
            
            {userGroups.length > 0 ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-primary mb-2">
                    Select GroupMe Group:
                  </label>
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="w-full rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
                  >
                    <option value="">Choose a group...</option>
                    {userGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.members?.length || 0} members)
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    onClick={createBotForUser}
                    disabled={loading || !selectedGroup}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {loading ? "Creating Bot..." : "Create CallBot"}
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedUserForBot(null);
                      setUserGroups([]);
                      setSelectedGroup("");
                    }}
                    disabled={loading}
                    className="bg-gray-600 hover:bg-gray-700 text-white"
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted">
                {loading ? "Loading user's GroupMe groups..." : "No GroupMe groups found for this user"}
              </div>
            )}
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