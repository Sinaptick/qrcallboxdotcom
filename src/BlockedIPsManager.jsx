import React, { useState, useEffect } from "react";
import { getAuth } from "firebase/auth";

export default function BlockedIPsManager() {
  const [blockedIPs, setBlockedIPs] = useState([]);
  const [spamLogs, setSpamLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("blocked");
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [newBlockIP, setNewBlockIP] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockDuration, setBlockDuration] = useState(24);

  // Fetch blocked IPs
  const fetchBlockedIPs = async () => {
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch("https://getblockedips-46us5rurra-uc.a.run.app", {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setBlockedIPs(data.blockedIPs || []);
      }
    } catch (error) {
      console.error("Error fetching blocked IPs:", error);
    }
  };

  // Fetch spam logs
  const fetchSpamLogs = async () => {
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch("https://getspamlogs-46us5rurra-uc.a.run.app", {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setSpamLogs(data.logs || []);
      }
    } catch (error) {
      console.error("Error fetching spam logs:", error);
    }
  };

  // Block an IP
  const blockIP = async () => {
    if (!newBlockIP) return;
    
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch("https://manageblockedip-46us5rurra-uc.a.run.app", {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'block',
          ip: newBlockIP,
          reason: blockReason || 'Manual block by admin',
          duration: blockDuration
        })
      });
      
      if (response.ok) {
        await fetchBlockedIPs();
        setShowBlockModal(false);
        setNewBlockIP("");
        setBlockReason("");
        setBlockDuration(24);
      }
    } catch (error) {
      console.error("Error blocking IP:", error);
    }
  };

  // Unblock an IP
  const unblockIP = async (ip) => {
    if (!confirm(`Are you sure you want to unblock ${ip}?`)) return;
    
    try {
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch("https://manageblockedip-46us5rurra-uc.a.run.app", {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'unblock',
          ip
        })
      });
      
      if (response.ok) {
        await fetchBlockedIPs();
      }
    } catch (error) {
      console.error("Error unblocking IP:", error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchBlockedIPs(), fetchSpamLogs()]);
      setLoading(false);
    };
    loadData();
  }, []);

  const formatDate = (timestamp) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleString();
  };

  const getTimeRemaining = (expiresAt) => {
    if (!expiresAt) return "Permanent";
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return "Expired";
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading spam protection data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Spam Protection Manager</h3>
        <button
          onClick={() => setShowBlockModal(true)}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Block IP Address
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("blocked")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "blocked"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Blocked IPs ({blockedIPs.length})
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "logs"
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Spam Logs ({spamLogs.length})
        </button>
      </div>

      {/* Blocked IPs Tab */}
      {activeTab === "blocked" && (
        <div className="space-y-4">
          {blockedIPs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No blocked IPs</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">IP Address</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Reason</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Blocked At</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Expires</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {blockedIPs.map((ip) => (
                    <tr key={ip.ip}>
                      <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">{ip.ip}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{ip.reason}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatDate(ip.blockedAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{getTimeRemaining(ip.expiresAt)}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          ip.autoBlocked
                            ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                            : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                        }`}>
                          {ip.autoBlocked ? "Auto" : "Manual"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => unblockIP(ip.ip)}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          Unblock
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Spam Logs Tab */}
      {activeTab === "logs" && (
        <div className="space-y-4">
          {spamLogs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No spam logs in the last 7 days</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">IP Address</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Action</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Details</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {spamLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{formatDate(log.timestamp)}</td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">{log.ip}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          log.action === 'auto_blocked' 
                            ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                            : log.action === 'manual_block'
                            ? "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200"
                            : log.action === 'manual_unblock'
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                        }`}>
                          {log.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {log.violations && `${log.violations} violations`}
                        {log.admin && `by ${log.admin}`}
                        {log.reason && `: ${log.reason}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Block IP Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Block IP Address</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  IP Address
                </label>
                <input
                  type="text"
                  value={newBlockIP}
                  onChange={(e) => setNewBlockIP(e.target.value)}
                  placeholder="192.168.1.1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Spam attempts"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Duration (hours)
                </label>
                <select
                  value={blockDuration}
                  onChange={(e) => setBlockDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value={1}>1 hour</option>
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>1 week</option>
                  <option value={0}>Permanent</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowBlockModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={blockIP}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Block IP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}