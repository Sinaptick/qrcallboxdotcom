import React, { useCallback } from "react";
import Button from "../../Button.jsx";

/**
 * GroupMeGroups Component
 * Handles GroupMe group fetching and selection
 * Extracted from GroupMeSetup for better separation of concerns
 */
const GroupMeGroups = React.memo(function GroupMeGroups({
  user,
  groups,
  setGroups,
  selectedGroup,
  setSelectedGroup,
  loading,
  setLoading,
  addDebug,
  onError,
  onGroupSelected
}) {
  
  const fetchGroups = useCallback(async (userId) => {
    if (!userId) {
      onError("No GroupMe user ID available");
      return;
    }

    try {
      const url = `/api/groupme/groups?user_id=${userId}`;
      addDebug(`Fetching groups from: ${url}`);
      
      const token = await user.getIdToken();
      addDebug("Got auth token, making request...");

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      addDebug(`Groups response status: ${res.status}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        addDebug(`Groups error response: ${errorText}`);
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      const data = await res.json();
      addDebug(`Groups data received: ${JSON.stringify(data, null, 2)}`);

      const groupsArray = data.response || [];
      addDebug(`Found ${groupsArray.length} groups`);

      const processedGroups = groupsArray.map(group => ({
        id: group.id,
        name: group.name,
        member_count: group.members?.length || 0,
        image_url: group.image_url
      }));

      setGroups(processedGroups);
      addDebug(`Processed ${processedGroups.length} groups successfully`);
      
    } catch (err) {
      const errorMsg = "Failed to load groups: " + err.message;
      addDebug(errorMsg);
      onError(errorMsg);
      setGroups([]);
    }
  }, [user, addDebug, onError, setGroups]);

  const handleGroupSelection = useCallback((groupId) => {
    setSelectedGroup(groupId);
    const selectedGroupData = groups.find(g => g.id === groupId);
    addDebug(`Selected group: ${selectedGroupData?.name} (${groupId})`);
    if (onGroupSelected) {
      onGroupSelected(groupId, selectedGroupData);
    }
  }, [groups, setSelectedGroup, addDebug, onGroupSelected]);

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="text-sm text-muted">Loading groups...</div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted">
        No groups found. You need to be a member of at least one GroupMe group to create bots.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-primary mb-1">
          Select Group for Notifications:
        </label>
        <select 
          value={selectedGroup} 
          onChange={(e) => handleGroupSelection(e.target.value)}
          className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm"
        >
          <option value="">Choose a group...</option>
          {groups.map(group => (
            <option key={group.id} value={group.id}>
              {group.name} ({group.member_count} members)
            </option>
          ))}
        </select>
      </div>
      
      {selectedGroup && (
        <div className="text-sm text-secondary">
          Selected: <strong>{groups.find(g => g.id === selectedGroup)?.name}</strong>
        </div>
      )}
    </div>
  );
});

export default GroupMeGroups;