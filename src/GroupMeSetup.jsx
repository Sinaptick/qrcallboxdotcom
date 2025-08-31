import React, { useState, useEffect, useCallback } from "react";
import { useFirebase } from "./hooks/useFirebase.js";
import GroupMeAuth from "./components/groupme/GroupMeAuth.jsx";
import GroupMeGroups from "./components/groupme/GroupMeGroups.jsx";
import GroupMeBots from "./components/groupme/GroupMeBots.jsx";
import GroupMeDebug from "./components/groupme/GroupMeDebug.jsx";

/**
 * Refactored GroupMeSetup Component
 * Now uses extracted components for better separation of concerns
 * Reduced from 957 lines to ~200 lines
 */
export default function GroupMeSetup() {
  const { auth } = useFirebase();
  const user = auth?.currentUser;
  
  // State management
  const [connected, setConnected] = useState(false);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [botCreated, setBotCreated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groupmeUserId, setGroupmeUserId] = useState("");
  const [debugInfo, setDebugInfo] = useState([]);
  const [existingBots, setExistingBots] = useState([]);

  // Admin functionality
  const isAdmin = user?.email === 'sinaptick@gmail.com';
  const [adminStoreOverride, setAdminStoreOverride] = useState("");

  // Debug logging function
  const addDebug = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, `${timestamp}: ${message}`]);
    console.log(`[GroupMe Debug] ${message}`);
  }, []);

  // Error handling
  const handleError = useCallback((errorMessage) => {
    setError(errorMessage);
    addDebug(`ERROR: ${errorMessage}`);
  }, [addDebug]);

  // Check connection status on load
  const checkConnectionStatus = useCallback(async () => {
    if (!user?.uid) return;

    try {
      const storedUserId = localStorage.getItem(`groupme_user_id_${user.uid}`);
      if (storedUserId) {
        setGroupmeUserId(storedUserId);
        setConnected(true);
        addDebug(`Found stored GroupMe user ID: ${storedUserId}`);
        
        // Load user data concurrently
        await loadUserData(storedUserId);
      } else {
        addDebug("No stored GroupMe connection found");
      }
    } catch (err) {
      addDebug(`Connection check error: ${err.message}`);
    }
  }, [user, addDebug]);

  // Load groups and existing bots concurrently
  const loadUserData = useCallback(async (userId) => {
    try {
      setLoading(true);
      addDebug("Loading groups and existing bots...");
      
      const [groupsResult, botsResult] = await Promise.allSettled([
        fetchGroups(userId),
        fetchExistingBots(userId)
      ]);
      
      if (groupsResult.status === 'rejected') {
        addDebug(`Groups fetch failed: ${groupsResult.reason}`);
      }
      
      if (botsResult.status === 'rejected') {
        addDebug(`Bots fetch failed: ${botsResult.reason}`);
      }
      
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch groups function
  const fetchGroups = useCallback(async (userId) => {
    if (!userId) return;

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/groupme/groups?user_id=${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const groupsArray = data.response || [];

      const processedGroups = groupsArray.map(group => ({
        id: group.id,
        name: group.name,
        member_count: group.members?.length || 0,
        image_url: group.image_url
      }));

      setGroups(processedGroups);
      addDebug(`Loaded ${processedGroups.length} groups successfully`);
      
    } catch (err) {
      handleError("Failed to load groups: " + err.message);
      setGroups([]);
    }
  }, [user, addDebug, handleError]);

  // Fetch existing bots function
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
  }, [user, addDebug]);

  // Connection success handler
  const handleConnectionSuccess = useCallback(async (userId) => {
    addDebug(`Connection successful with user ID: ${userId}`);
    setError("");
    await loadUserData(userId);
  }, [addDebug, loadUserData]);

  // Disconnect handler
  const handleDisconnect = useCallback(() => {
    setError("");
    addDebug("GroupMe disconnected successfully");
  }, [addDebug]);

  // Group selection handler
  const handleGroupSelected = useCallback((groupId, groupData) => {
    setError("");
    addDebug(`Group selected: ${groupData?.name} (${groupId})`);
  }, [addDebug]);

  // Initialize on mount
  useEffect(() => {
    checkConnectionStatus();
  }, [user, checkConnectionStatus]);

  return (
    <div className="space-y-4">
      <div className="bg-secondary rounded-xl p-4 border border-themed">
        <h3 className="text-lg font-semibold mb-3 text-primary">GroupMe Integration</h3>
        <p className="text-sm text-secondary mb-4">
          Connect your GroupMe account to receive real-time notifications when customers scan QR codes.
        </p>
        
        {/* Error Display */}
        {error && (
          <div className="mb-3 p-3 bg-red-900/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Admin Store Override */}
        {isAdmin && (
          <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-500/50 rounded-xl">
            <h4 className="text-sm font-medium text-yellow-400 mb-2">Admin: Store Override</h4>
            <input
              type="text"
              placeholder="Store number to override (optional)"
              value={adminStoreOverride}
              onChange={(e) => setAdminStoreOverride(e.target.value)}
              className="w-full rounded border border-themed bg-primary text-primary px-2 py-1 text-sm"
            />
            <div className="text-xs text-yellow-300 mt-1">
              Leave empty to use default store detection. Enter a store number to override for testing.
            </div>
          </div>
        )}

        {/* Authentication Component */}
        <GroupMeAuth
          user={user}
          loading={loading}
          connected={connected}
          addDebug={addDebug}
          onConnectionSuccess={handleConnectionSuccess}
          onDisconnect={handleDisconnect}
          onError={handleError}
          groupmeUserId={groupmeUserId}
          setGroupmeUserId={setGroupmeUserId}
          setConnected={setConnected}
          setGroups={setGroups}
          setSelectedGroup={setSelectedGroup}
          setBotCreated={setBotCreated}
        />

        {/* Groups and Bots Components - only show when connected */}
        {connected && (
          <div className="space-y-4 mt-4">
            <GroupMeGroups
              user={user}
              groups={groups}
              setGroups={setGroups}
              selectedGroup={selectedGroup}
              setSelectedGroup={setSelectedGroup}
              loading={loading}
              setLoading={setLoading}
              addDebug={addDebug}
              onError={handleError}
              onGroupSelected={handleGroupSelected}
            />

            <GroupMeBots
              user={user}
              selectedGroup={selectedGroup}
              groupmeUserId={groupmeUserId}
              loading={loading}
              setLoading={setLoading}
              botCreated={botCreated}
              setBotCreated={setBotCreated}
              existingBots={existingBots}
              setExistingBots={setExistingBots}
              addDebug={addDebug}
              onError={handleError}
              isAdmin={isAdmin}
              adminStoreOverride={adminStoreOverride}
            />
          </div>
        )}

        {/* Debug Information */}
        <GroupMeDebug
          user={user}
          debugInfo={debugInfo}
          isAdmin={isAdmin}
        />
      </div>
    </div>
  );
}