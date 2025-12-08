import React, { useState, useCallback } from "react";
import { useFirebase } from "../../hooks/useFirebase.js";
import Button from "../../Button.jsx";

/**
 * Analytics Component
 * Comprehensive response analytics and performance tracking
 */
const Analytics = React.memo(function Analytics() {
  const { auth, db } = useFirebase();
  const user = auth?.currentUser;

  const [storeNumber, setStoreNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [debugInfo, setDebugInfo] = useState([]);
  const [responseStats, setResponseStats] = useState(null);
  const [selectedDays, setSelectedDays] = useState(30);
  const [activeAssociates, setActiveAssociates] = useState(null);
  const [autoLoaded, setAutoLoaded] = useState(false);

  // Debug logging function
  const addDebug = useCallback((message) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugInfo(prev => [...prev, `${timestamp}: ${message}`]);
    console.log(`[Analytics Debug] ${message}`);
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

  // Fetch response statistics
  const fetchResponseStats = useCallback(async () => {
    if (!storeNumber.trim()) {
      handleError("Please enter a store number first");
      return;
    }

    if (!user) {
      handleError("Please sign in to access analytics");
      return;
    }

    try {
      setLoading(true);
      setError("");
      addDebug(`Fetching response stats for store ${storeNumber} (last ${selectedDays} days)`);
      addDebug(`Current user: ${user.email || user.uid}`);

      // Ensure user is authenticated and get a fresh token
      const token = await user.getIdToken(true);
      addDebug(`Got auth token: ${token.substring(0, 20)}...`);

      addDebug(`Calling API with params: store=${storeNumber}, days=${selectedDays}`);

      const response = await fetch('/api/getUserResponseStats', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          storeNumber: storeNumber.trim(),
          days: selectedDays
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();

      setResponseStats(result);
      addDebug(`Success! Found ${result.users.length} users with response data`);
      addDebug(`Store summary: ${result.summary.totalResponses} total responses`);

    } catch (err) {
      addDebug(`Stats fetch failed: ${err.message}`);
      addDebug(`Error code: ${err.code || 'N/A'}`);
      addDebug(`Error details: ${err.details || 'N/A'}`);
      handleError(`Failed to fetch response statistics: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [storeNumber, selectedDays, addDebug, handleError, user]);

  // Fetch active associates count
  const fetchActiveAssociatesCount = useCallback(async () => {
    if (!storeNumber.trim()) {
      return;
    }

    if (!user) {
      return;
    }

    try {
      addDebug(`Fetching active associates count for store ${storeNumber}`);

      const token = await user.getIdToken(true);
      const response = await fetch('/api/getActiveAssociatesCount', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          storeNumber: storeNumber.trim()
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      setActiveAssociates(result);
      addDebug(`Active associates: ${result.activeCount} on-shift with 96h activity (${result.totalUsers} total)`);

    } catch (err) {
      addDebug(`Active associates fetch failed: ${err.message}`);
      setActiveAssociates(null);
    }
  }, [storeNumber, addDebug, user]);

  // Fetch both stats when store number changes
  const fetchAllStats = useCallback(async () => {
    await Promise.all([
      fetchResponseStats(),
      fetchActiveAssociatesCount()
    ]);
  }, [fetchResponseStats, fetchActiveAssociatesCount]);

  // Auto-load user's store and fetch analytics on mount
  React.useEffect(() => {
    const loadUserStoreAndAnalytics = async () => {
      if (!user || !db || autoLoaded) return;

      try {
        const { getDoc, doc } = await import("firebase/firestore");
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const store = userData.storeNumber;

          if (store) {
            const storeStr = String(store);
            setStoreNumber(storeStr);
            setAutoLoaded(true);

            addDebug(`Auto-loaded user store: ${storeStr}`);

            // Small delay to ensure state is updated
            setTimeout(() => {
              fetchAllStats();
            }, 100);
          }
        }
      } catch (err) {
        addDebug(`Failed to auto-load user store: ${err.message}`);
      }
    };

    loadUserStoreAndAnalytics();
  }, [user, db, autoLoaded, addDebug, fetchAllStats]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-primary mb-2">Response Analytics</h2>
        <p className="text-secondary">
          Track notification response performance and user engagement metrics across stores.
        </p>
      </div>

      {/* Store Lookup Section */}
      <div className="bg-tertiary rounded-xl p-6 border border-themed">
        <h4 className="text-lg font-semibold mb-4 text-primary">Store Performance Analytics</h4>
        <div className="text-sm text-secondary mb-4">
          Analyze how associates respond to customer assistance notifications including assists, ignores, and response rates.
        </div>
        
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="number"
            placeholder="Enter store number (e.g. 1234)"
            value={storeNumber}
            onChange={(e) => setStoreNumber(e.target.value)}
            className="flex-1 min-w-48 rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
            onKeyPress={(e) => e.key === 'Enter' && fetchResponseStats()}
          />
          <select
            value={selectedDays}
            onChange={(e) => setSelectedDays(parseInt(e.target.value))}
            className="rounded border border-themed bg-primary text-primary px-3 py-2 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <Button
            onClick={fetchAllStats}
            disabled={loading || !storeNumber.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2"
          >
            {loading ? "Analyzing..." : "Get Analytics"}
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-3 mb-4">
            <div className="text-red-400 text-sm font-medium">Error</div>
            <div className="text-red-300 text-sm">{error}</div>
          </div>
        )}

        {/* Response Statistics */}
        {responseStats && (
          <div className="space-y-6">
            {/* Summary Statistics */}
            <div>
              <h5 className="font-semibold text-primary mb-4">Store {storeNumber} Summary ({selectedDays} days)</h5>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-secondary rounded-lg p-4 text-center border border-themed">
                  <div className="text-2xl font-bold text-primary">{responseStats.summary.totalScans}</div>
                  <div className="text-xs text-secondary">Total Requests</div>
                  <div className="text-xs text-muted">Customer assistance calls</div>
                </div>
                <div className="bg-secondary rounded-lg p-4 text-center border border-themed">
                  <div className="text-2xl font-bold text-green-600">{responseStats.summary.totalAssists + responseStats.summary.totalClaims}</div>
                  <div className="text-xs text-secondary">Total Assists</div>
                  <div className="text-xs text-muted">Customers helped</div>
                </div>
                <div className="bg-secondary rounded-lg p-4 text-center border border-themed">
                  <div className="text-2xl font-bold text-orange-600">{responseStats.summary.totalIgnores}</div>
                  <div className="text-xs text-secondary">Manual Ignores</div>
                  <div className="text-xs text-muted">Clicked "ignore"</div>
                </div>
                <div className="bg-secondary rounded-lg p-4 text-center border border-themed">
                  <div className="text-2xl font-bold text-red-600">{responseStats.summary.totalTimeouts || 0}</div>
                  <div className="text-xs text-secondary">Timeouts</div>
                  <div className="text-xs text-muted">No response (15 min)</div>
                </div>
                <div className="bg-secondary rounded-lg p-4 text-center border border-themed">
                  <div className="text-2xl font-bold text-blue-600">{responseStats.summary.responseRate}%</div>
                  <div className="text-xs text-secondary">Response Rate</div>
                  <div className="text-xs text-muted">Assists / Total requests</div>
                </div>
              </div>
            </div>

            {/* Performance Insights */}
            <div className="bg-secondary rounded-lg p-4 border border-themed">
              <h6 className="font-medium text-primary mb-3">Performance Insights</h6>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-secondary mb-1">Total Responses</div>
                  <div className="text-lg font-semibold text-primary">
                    {responseStats.summary.totalResponses}
                  </div>
                  <div className="text-xs text-muted">
                    All user interactions
                  </div>
                </div>
                <div>
                  <div className="text-secondary mb-1">Active Associates</div>
                  <div className="text-lg font-semibold text-primary">
                    {activeAssociates ? activeAssociates.activeCount : '0'}
                  </div>
                  <div className="text-xs text-muted">
                    On-shift with 96h activity
                  </div>
                </div>
                <div>
                  <div className="text-secondary mb-1">Avg Response Rate</div>
                  <div className="text-lg font-semibold text-primary">
                    {responseStats.users.length > 0 
                      ? (responseStats.users.reduce((sum, user) => sum + parseFloat(user.responseRate), 0) / responseStats.users.length).toFixed(1)
                      : '0.0'
                    }%
                  </div>
                  <div className="text-xs text-muted">
                    Per associate average
                  </div>
                </div>
              </div>
            </div>

            {/* Individual User Performance */}
            {responseStats.users.length > 0 && (
              <div>
                <h5 className="font-semibold text-primary mb-4">Individual Associate Performance (Ranked by Score)</h5>
                <div className="space-y-3">
                  {responseStats.users.map((user, index) => (
                    <div key={user.userId} className="bg-secondary rounded-lg p-4 border border-themed">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium text-primary">{user.userName}</div>
                            {index < 3 && (
                              <span className={`text-xs px-2 py-1 rounded ${
                                index === 0 ? 'bg-yellow-600 text-white' :
                                index === 1 ? 'bg-gray-500 text-white' :
                                'bg-amber-600 text-white'
                              }`}>
                                #{index + 1}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-secondary">ID: {user.userId}</div>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <div className="text-center">
                            <div className={`font-bold text-lg ${user.weightedScore >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {user.weightedScore || 0}
                            </div>
                            <div className="text-xs text-secondary">Score</div>
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-green-600">{user.assists + user.claims}</div>
                            <div className="text-xs text-secondary">Assists</div>
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-orange-600">{user.ignores || 0}</div>
                            <div className="text-xs text-secondary">Ignores</div>
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-red-600">{user.timeouts || 0}</div>
                            <div className="text-xs text-secondary">Timeouts</div>
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-blue-600">{user.responseRate}%</div>
                            <div className="text-xs text-secondary">Rate</div>
                          </div>
                          {user.lastActivity && (
                            <div className="text-center">
                              <div className="font-medium text-teal-600">{new Date(user.lastActivity).toLocaleDateString()}</div>
                              <div className="text-xs text-secondary">Last Active</div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {responseStats.users.length === 0 && (
              <div className="text-center py-8 text-secondary bg-secondary rounded-lg border border-themed">
                <div className="text-lg mb-2">No Response Data Found</div>
                <div className="text-sm">
                  No response activity found for store {storeNumber} in the last {selectedDays} days.
                </div>
                <div className="text-xs text-muted mt-2">
                  Try extending the date range or check if there were any customer assistance requests.
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Debug Information */}
      {debugInfo.length > 0 && (
        <div className="bg-tertiary rounded-xl p-4 border border-themed">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-primary">Debug Information</h4>
            <Button
              onClick={clearDebug}
              className="text-xs bg-gray-600 hover:bg-gray-700 text-white px-2 py-1"
            >
              Clear
            </Button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {debugInfo.map((info, index) => (
              <div key={index} className="text-xs text-secondary font-mono bg-secondary rounded px-2 py-1">
                {info}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

export default Analytics;