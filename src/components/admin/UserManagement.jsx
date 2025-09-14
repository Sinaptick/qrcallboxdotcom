import React, { useState, useCallback } from "react";
import { useFirebase } from "../../hooks/useFirebase.js";
import Button from "../../Button.jsx";

/**
 * UserManagement Component
 * Admin-specific user management with store lookup and user editing capabilities
 */
const UserManagement = React.memo(function UserManagement() {
  const { auth } = useFirebase();
  const user = auth?.currentUser;
  
  const [storeNumber, setStoreNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState([]);
  const [storeUsers, setStoreUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [userEdits, setUserEdits] = useState({});

  // Debug logging function
  const addDebug = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, `${timestamp}: ${message}`]);
    console.log(`[User Management Debug] ${message}`);
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
      addDebug(`Looking up users for store: ${storeNumber}`);
      
      const token = await user.getIdToken();
      
      const res = await fetch(`/api/groupme/admin-lookup-store`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          store_number: parseInt(storeNumber.trim())
        })
      });
      
      addDebug(`Response status: ${res.status} ${res.statusText}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      
      if (data.users && data.users.length > 0) {
        setStoreUsers(data.users);
        addDebug(`Found ${data.users.length} users for store ${storeNumber}`);
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

  // Load detailed user data including work schedule
  const loadUserDetails = useCallback(async (userId) => {
    try {
      addDebug(`Loading detailed user data for ${userId}`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/get-user-details?user_id=${userId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        const errorText = await res.text();
        addDebug(`Failed to load user details: ${errorText}`);
        return null;
      }

      const userDetails = await res.json();
      addDebug(`Loaded detailed data for user ${userId}`);
      return userDetails;
      
    } catch (err) {
      addDebug(`Failed to load user details: ${err.message}`);
      return null;
    }
  }, [user, addDebug]);

  // Start editing a user
  const startEditingUser = useCallback(async (storeUser) => {
    setEditingUser(storeUser);
    setSelectedUser(storeUser);
    
    // Load detailed user data from Firestore
    const userDetails = await loadUserDetails(storeUser.id);
    
    if (userDetails) {
      // Initialize edit form with current user data
      setUserEdits({
        firstName: userDetails.firstName || storeUser.firstName,
        lastName: userDetails.lastName || storeUser.lastName,
        email: userDetails.email || storeUser.email,
        storeNumber: userDetails.storeNumber || storeUser.storeNumber,
        jobTitle: userDetails.jobTitle || storeUser.jobTitle,
        role: userDetails.role || 'user',
        notificationsEnabled: userDetails.notificationsEnabled !== false,
        respectDoNotDisturb: userDetails.respectDoNotDisturb !== false,
        workSchedule: userDetails.workSchedule || {
          monday: { isWorkingDay: false, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 },
          tuesday: { isWorkingDay: false, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 },
          wednesday: { isWorkingDay: false, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 },
          thursday: { isWorkingDay: false, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 },
          friday: { isWorkingDay: false, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 },
          saturday: { isWorkingDay: false, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 },
          sunday: { isWorkingDay: false, startHour: 9, startMinute: 0, endHour: 17, endMinute: 0 }
        }
      });
      
      addDebug(`Started editing user: ${storeUser.firstName} ${storeUser.lastName}`);
    }
  }, [loadUserDetails, addDebug]);

  // Cancel editing
  const cancelEditing = useCallback(() => {
    setEditingUser(null);
    setSelectedUser(null);
    setUserEdits({});
  }, []);

  // Update user data
  const saveUserChanges = useCallback(async () => {
    if (!editingUser) return;

    try {
      setLoading(true);
      addDebug(`Saving changes for user: ${editingUser.firstName} ${editingUser.lastName}`);
      
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/update-user`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: editingUser.id,
          updates: userEdits
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const result = await res.json();
      addDebug(`User updated successfully: ${JSON.stringify(result)}`);
      
      // Refresh the user list
      await lookupStore();
      
      // Clear editing state
      cancelEditing();
      
    } catch (err) {
      addDebug(`Save failed: ${err.message}`);
      handleError(`Failed to save user changes: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [editingUser, userEdits, user, addDebug, handleError, lookupStore, cancelEditing]);

  // Update work schedule for a specific day
  const updateWorkSchedule = useCallback((day, field, value) => {
    setUserEdits(prev => ({
      ...prev,
      workSchedule: {
        ...prev.workSchedule,
        [day]: {
          ...prev.workSchedule[day],
          [field]: field === 'isWorkingDay' ? value : parseInt(value)
        }
      }
    }));
  }, []);

  // Format time for display
  const formatTime = (hour, minute) => {
    const period = hour < 12 ? 'AM' : 'PM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
  };

  return (
    <div className="space-y-4">
      {/* Store Lookup Section */}
      <div className="bg-tertiary rounded-xl p-4 border border-themed">
        <h4 className="text-md font-semibold mb-3 text-primary">User Management - Store Lookup</h4>
        <div className="text-sm text-secondary mb-4">
          Search for users by store number to view and edit their profiles, work schedules, and settings.
        </div>
        
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
            {loading ? "Looking up..." : "Search Store"}
          </Button>
        </div>
      </div>

      {/* Store Users Section */}
      {storeUsers.length > 0 && !editingUser && (
        <div className="bg-tertiary rounded-xl p-4 border border-themed">
          <h4 className="text-md font-semibold mb-3 text-primary">
            Store {storeNumber} Users ({storeUsers.length})
          </h4>
          
          <div className="space-y-3">
            {storeUsers.map((storeUser) => (
              <div key={storeUser.id} className="border border-themed rounded-lg p-4 bg-secondary">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="font-medium text-primary">
                      {storeUser.firstName} {storeUser.lastName}
                    </div>
                    <div className="text-sm text-secondary">{storeUser.email}</div>
                    <div className="text-xs text-muted mt-1">
                      {storeUser.jobTitle && `${storeUser.jobTitle} | `}
                      Store: {storeUser.storeNumber || storeUser.homeStore || 'Unknown'} | 
                      ID: {storeUser.id}
                    </div>
                    {storeUser.allowedStores && storeUser.allowedStores.length > 0 && (
                      <div className="text-xs text-muted">
                        Allowed Stores: {storeUser.allowedStores.join(', ')}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3 ml-4">
                    <div className="text-sm text-right">
                      {storeUser.groupme_user_id ? (
                        <span className="text-green-400">✓ GroupMe</span>
                      ) : (
                        <span className="text-muted">No GroupMe</span>
                      )}
                    </div>
                    <Button
                      onClick={() => startEditingUser(storeUser)}
                      disabled={loading}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-3 py-2"
                    >
                      Edit User
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Editor Section */}
      {editingUser && (
        <div className="bg-tertiary rounded-xl p-4 border border-themed">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-md font-semibold text-primary">
              Edit User: {editingUser.firstName} {editingUser.lastName}
            </h4>
            <div className="flex gap-2">
              <Button
                onClick={saveUserChanges}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2"
              >
                {loading ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                onClick={cancelEditing}
                disabled={loading}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2"
              >
                Cancel
              </Button>
            </div>
          </div>
          
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-primary mb-2">
                  First Name:
                </label>
                <input
                  type="text"
                  value={userEdits.firstName || ''}
                  onChange={(e) => setUserEdits(prev => ({ ...prev, firstName: e.target.value }))}
                  className="w-full rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-primary mb-2">
                  Last Name:
                </label>
                <input
                  type="text"
                  value={userEdits.lastName || ''}
                  onChange={(e) => setUserEdits(prev => ({ ...prev, lastName: e.target.value }))}
                  className="w-full rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-primary mb-2">
                  Email:
                </label>
                <input
                  type="email"
                  value={userEdits.email || ''}
                  onChange={(e) => setUserEdits(prev => ({ ...prev, email: e.target.value }))}
                  className="w-full rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-primary mb-2">
                  Store Number:
                </label>
                <input
                  type="number"
                  value={userEdits.storeNumber || ''}
                  onChange={(e) => setUserEdits(prev => ({ ...prev, storeNumber: e.target.value }))}
                  className="w-full rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-primary mb-2">
                  Job Title:
                </label>
                <input
                  type="text"
                  value={userEdits.jobTitle || ''}
                  onChange={(e) => setUserEdits(prev => ({ ...prev, jobTitle: e.target.value }))}
                  className="w-full rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-primary mb-2">
                  Role:
                </label>
                <select
                  value={userEdits.role || 'user'}
                  onChange={(e) => setUserEdits(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>

            {/* Notification Settings */}
            <div className="space-y-3">
              <h5 className="text-sm font-semibold text-primary">Notification Settings</h5>
              
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={userEdits.notificationsEnabled}
                  onChange={(e) => setUserEdits(prev => ({ ...prev, notificationsEnabled: e.target.checked }))}
                  className="rounded border-themed"
                />
                <label className="text-sm text-primary">Notifications Enabled</label>
              </div>
              
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={userEdits.respectDoNotDisturb}
                  onChange={(e) => setUserEdits(prev => ({ ...prev, respectDoNotDisturb: e.target.checked }))}
                  className="rounded border-themed"
                />
                <label className="text-sm text-primary">Respect Do Not Disturb Hours</label>
              </div>
            </div>

            {/* Work Schedule */}
            <div className="space-y-4">
              <h5 className="text-sm font-semibold text-primary">Work Schedule</h5>
              
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                <div key={day} className="border border-themed rounded p-3 bg-secondary">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={userEdits.workSchedule?.[day]?.isWorkingDay || false}
                        onChange={(e) => updateWorkSchedule(day, 'isWorkingDay', e.target.checked)}
                        className="rounded border-themed"
                      />
                      <label className="text-sm font-medium text-primary capitalize">
                        {day}
                      </label>
                    </div>
                    
                    {userEdits.workSchedule?.[day]?.isWorkingDay && (
                      <div className="text-xs text-secondary">
                        {formatTime(userEdits.workSchedule[day].startHour, userEdits.workSchedule[day].startMinute)} - 
                        {formatTime(userEdits.workSchedule[day].endHour, userEdits.workSchedule[day].endMinute)}
                      </div>
                    )}
                  </div>
                  
                  {userEdits.workSchedule?.[day]?.isWorkingDay && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-primary mb-1">Start Time:</label>
                        <div className="flex gap-2">
                          <select
                            value={userEdits.workSchedule[day].startHour}
                            onChange={(e) => updateWorkSchedule(day, 'startHour', e.target.value)}
                            className="flex-1 rounded border border-themed bg-primary text-primary px-2 py-1 text-xs"
                          >
                            {Array.from({length: 24}, (_, i) => (
                              <option key={i} value={i}>
                                {formatTime(i, 0).split(':')[0]} {formatTime(i, 0).split(' ')[1]}
                              </option>
                            ))}
                          </select>
                          <select
                            value={userEdits.workSchedule[day].startMinute}
                            onChange={(e) => updateWorkSchedule(day, 'startMinute', e.target.value)}
                            className="w-16 rounded border border-themed bg-primary text-primary px-2 py-1 text-xs"
                          >
                            <option value="0">00</option>
                            <option value="15">15</option>
                            <option value="30">30</option>
                            <option value="45">45</option>
                          </select>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-xs text-primary mb-1">End Time:</label>
                        <div className="flex gap-2">
                          <select
                            value={userEdits.workSchedule[day].endHour}
                            onChange={(e) => updateWorkSchedule(day, 'endHour', e.target.value)}
                            className="flex-1 rounded border border-themed bg-primary text-primary px-2 py-1 text-xs"
                          >
                            {Array.from({length: 24}, (_, i) => (
                              <option key={i} value={i}>
                                {formatTime(i, 0).split(':')[0]} {formatTime(i, 0).split(' ')[1]}
                              </option>
                            ))}
                          </select>
                          <select
                            value={userEdits.workSchedule[day].endMinute}
                            onChange={(e) => updateWorkSchedule(day, 'endMinute', e.target.value)}
                            className="w-16 rounded border border-themed bg-primary text-primary px-2 py-1 text-xs"
                          >
                            <option value="0">00</option>
                            <option value="15">15</option>
                            <option value="30">30</option>
                            <option value="45">45</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
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

export default UserManagement;