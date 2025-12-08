import React, { useState, useCallback, useEffect } from "react";
import { useFirebase } from "../hooks/useFirebase.js";
import { getDoc, doc } from "firebase/firestore";
import Button from "../Button.jsx";

/**
 * ActiveAssociates Component
 * Shows users currently on shift with recent activity
 */
const ActiveAssociates = React.memo(function ActiveAssociates() {
  const { auth, db } = useFirebase();
  const user = auth?.currentUser;
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeAssociates, setActiveAssociates] = useState([]);
  const [storeFilter, setStoreFilter] = useState("");
  const [lastUpdated, setLastUpdated] = useState(null);
  const [userStore, setUserStore] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(false);

  // Debug user schedule
  const debugMySchedule = useCallback(async () => {
    if (!user || !db) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        setDebugInfo({ error: 'User document not found' });
        return;
      }

      const userData = userDoc.data();
      const schedule = userData.workSchedule;
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const today = days[new Date().getDay()];
      const todaySchedule = schedule?.[today];

      // Calculate if on shift
      let isOnShift = false;
      if (todaySchedule?.isWorkingDay) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const startMinutes = todaySchedule.startHour * 60 + todaySchedule.startMinute;
        const endMinutes = todaySchedule.endHour * 60 + todaySchedule.endMinute;
        isOnShift = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
      }

      setDebugInfo({
        email: user.email,
        uid: user.uid,
        storeNumber: userData.storeNumber,
        timezone: userData.timezone || 'Not set',
        approved: userData.approved,
        notificationsEnabled: userData.notificationsEnabled,
        hasSchedule: !!schedule,
        today: today,
        todaySchedule: todaySchedule || null,
        isOnShift: isOnShift,
        currentTime: new Date().toLocaleString()
      });
      setShowDebug(true);
    } catch (err) {
      setDebugInfo({ error: err.message });
      setShowDebug(true);
    }
  }, [user, db]);

  // Load active associates data
  const loadActiveAssociates = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    setError("");

    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/getActiveAssociates`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          storeNumber: storeFilter || undefined
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const data = await res.json();
      setActiveAssociates(data.activeAssociates || []);
      setLastUpdated(new Date(data.retrievedAt));

    } catch (err) {
      setError(`Failed to load active associates: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [user, storeFilter]);

  // Get user's store and auto-load on mount
  useEffect(() => {
    const getUserStore = async () => {
      if (user && db) {
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const store = userData.storeNumber;
            setUserStore(store);
            // Set default filter to user's store
            if (store && !storeFilter) {
              setStoreFilter(String(store));
            }
          }
        } catch (error) {
          console.error('Error getting user store:', error);
        }
      }
    };

    getUserStore();
  }, [user, db, storeFilter]);

  // Auto-load when user or store filter changes
  useEffect(() => {
    if (user && storeFilter) {
      loadActiveAssociates();
    }
  }, [user, storeFilter, loadActiveAssociates]);

  // Also auto-load immediately when component mounts with user
  useEffect(() => {
    if (user) {
      // Small delay to allow user store to be set first
      setTimeout(() => {
        if (!storeFilter) {
          loadActiveAssociates();
        }
      }, 100);
    }
  }, [user, loadActiveAssociates]);

  // Real-time timer for updating remaining shift times
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000); // Update every 30 seconds

    return () => clearInterval(timer);
  }, []);

  // Auto-refresh data every 5 minutes
  useEffect(() => {
    if (!user) return;
    
    const autoRefresh = setInterval(() => {
      loadActiveAssociates();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(autoRefresh);
  }, [user, loadActiveAssociates]);

  // Format time for display
  const formatTime = (timeStr) => {
    if (!timeStr) return "Unknown";
    const [hour, minute] = timeStr.split(':');
    const h = parseInt(hour);
    const period = h < 12 ? 'AM' : 'PM';
    const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${displayHour}:${minute} ${period}`;
  };


  // Get unique store numbers for filter
  const availableStores = [...new Set(activeAssociates.map(a => a.storeNumber))].sort((a, b) => (a || 0) - (b || 0));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-secondary rounded-xl p-6 border border-themed">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-primary">Active Associates</h3>
            <div className="text-sm text-secondary">
              Associates currently on shift with recent activity
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <div className="text-xs text-muted">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </div>
            )}
            <Button
              onClick={debugMySchedule}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2"
            >
              🔍 Debug My Schedule
            </Button>
            <Button
              onClick={loadActiveAssociates}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2"
            >
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
        
        {/* Store Filter */}
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-primary">Filter by Store:</label>
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
          >
            <option value="">All Stores</option>
            {availableStores.map(store => (
              <option key={store} value={store}>Store {store}</option>
            ))}
          </select>
          <div className="text-sm text-secondary">
            Showing {activeAssociates.length} active associate{activeAssociates.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Debug Display */}
      {showDebug && debugInfo && (
        <div className="bg-secondary rounded-xl p-6 border border-themed">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-semibold text-primary">🔍 Debug Information</h4>
            <button
              onClick={() => setShowDebug(false)}
              className="text-muted hover:text-primary"
            >
              ✕ Close
            </button>
          </div>

          {debugInfo.error ? (
            <div className="text-red-400 text-sm">{debugInfo.error}</div>
          ) : (
            <div className="space-y-3 text-sm font-mono">
              <div><span className="text-muted">Email:</span> <span className="text-primary">{debugInfo.email}</span></div>
              <div><span className="text-muted">Store:</span> <span className="text-primary">{debugInfo.storeNumber}</span></div>
              <div><span className="text-muted">Timezone:</span> <span className="text-primary">{debugInfo.timezone}</span></div>
              <div><span className="text-muted">Approved:</span> <span className={debugInfo.approved ? "text-green-400" : "text-red-400"}>{debugInfo.approved ? '✅ Yes' : '❌ No'}</span></div>
              <div><span className="text-muted">Notifications:</span> <span className={debugInfo.notificationsEnabled ? "text-green-400" : "text-red-400"}>{debugInfo.notificationsEnabled ? '✅ Enabled' : '❌ Disabled'}</span></div>
              <div><span className="text-muted">Has Schedule:</span> <span className={debugInfo.hasSchedule ? "text-green-400" : "text-red-400"}>{debugInfo.hasSchedule ? '✅ Yes' : '❌ No'}</span></div>
              <div className="pt-2 border-t border-themed">
                <div><span className="text-muted">Today:</span> <span className="text-primary uppercase">{debugInfo.today}</span></div>
                <div><span className="text-muted">Current Time:</span> <span className="text-primary">{debugInfo.currentTime}</span></div>
              </div>
              {debugInfo.todaySchedule ? (
                <div className="pt-2 border-t border-themed">
                  <div><span className="text-muted">Working Today:</span> <span className={debugInfo.todaySchedule.isWorkingDay ? "text-green-400" : "text-red-400"}>{debugInfo.todaySchedule.isWorkingDay ? '✅ Yes' : '❌ No'}</span></div>
                  {debugInfo.todaySchedule.isWorkingDay && (
                    <>
                      <div><span className="text-muted">Shift Hours:</span> <span className="text-primary">{debugInfo.todaySchedule.startHour}:{String(debugInfo.todaySchedule.startMinute).padStart(2, '0')} - {debugInfo.todaySchedule.endHour}:{String(debugInfo.todaySchedule.endMinute).padStart(2, '0')}</span></div>
                      <div><span className="text-muted">Currently On Shift:</span> <span className={debugInfo.isOnShift ? "text-green-400" : "text-red-400"}>{debugInfo.isOnShift ? '✅ YES' : '❌ NO'}</span></div>
                    </>
                  )}
                </div>
              ) : (
                <div className="pt-2 border-t border-themed">
                  <div className="text-red-400">❌ No schedule configured for {debugInfo.today}</div>
                </div>
              )}
              <div className="pt-3 text-xs text-muted">
                💡 If you see issues above, update your schedule in Settings (Android app) or contact support.
              </div>
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

      {/* Associates List */}
      {!loading && activeAssociates.length === 0 && !error && (
        <div className="bg-secondary rounded-xl p-8 border border-themed text-center">
          <div className="text-muted mb-2">No active associates found</div>
          <div className="text-sm text-secondary">
            {storeFilter 
              ? `No associates are currently on shift at Store ${storeFilter}`
              : "No associates are currently on shift across all stores"
            }
          </div>
        </div>
      )}

      {activeAssociates.length > 0 && (
        <div className="grid gap-4">
          {activeAssociates.map((associate) => (
            <div key={associate.id} className="bg-secondary rounded-xl p-4 border border-themed">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="font-medium text-primary text-lg">
                      {associate.firstName} {associate.lastName}
                    </div>
                    <div className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full">
                      Store {associate.storeNumber}
                    </div>
                  </div>
                  
                  <div className="text-sm text-secondary mb-2">
                    {associate.jobTitle}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted">Shift:</span>
                      <span className="text-primary">
                        {formatTime(associate.shiftStart)} - {formatTime(associate.shiftEnd)}
                      </span>
                    </div>
                    
                    {associate.shiftEndTime && (
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        <span className="text-green-400 font-medium">
                          {(() => {
                            // Use currentTime state for real-time updates
                            const now = currentTime;
                            const end = new Date(associate.shiftEndTime);
                            const diffMs = end.getTime() - now.getTime();
                            
                            if (diffMs <= 0) return "Shift ended";
                            
                            const hours = Math.floor(diffMs / (1000 * 60 * 60));
                            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                            
                            if (hours > 0) {
                              return `${hours}h ${minutes}m remaining`;
                            } else if (minutes > 0) {
                              return `${minutes}m remaining`;
                            } else {
                              return "< 1m remaining";
                            }
                          })()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-right text-xs text-muted">
                  <div>Last activity:</div>
                  <div>
                    {new Date(associate.lastActivity).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-secondary rounded-xl p-4 border border-themed animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="h-4 bg-themed rounded w-48 mb-2"></div>
                  <div className="h-3 bg-themed rounded w-32 mb-2"></div>
                  <div className="h-3 bg-themed rounded w-64"></div>
                </div>
                <div className="h-8 bg-themed rounded w-24"></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default ActiveAssociates;