import React, { useState, useEffect } from "react";
import Button from "./Button.jsx";
import { useFirebase } from "./app.jsx";

// Firebase Functions URLs (using direct URLs temporarily for testing)
const FUNCTIONS_BASE = {
  groupmeStart: "https://groupmestart-46us5rurra-uc.a.run.app",
  groupmeGroups: "https://groupmegroups-46us5rurra-uc.a.run.app", 
  groupmeCreateBot: "https://groupmecreatebot-46us5rurra-uc.a.run.app"
};

export default function GroupMeSetup() {
  const { auth } = useFirebase();
  const user = auth?.currentUser;
  
  const [connected, setConnected] = useState(false);
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [botCreated, setBotCreated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [groupmeUserId, setGroupmeUserId] = useState("");

  // Check connection status on load
  useEffect(() => {
    checkConnectionStatus();
  }, [user]);

  const checkConnectionStatus = async () => {
    if (!user) return;
    
    try {
      // Check if we have stored GroupMe user ID for this Firebase user
      const storedUserId = localStorage.getItem(`groupme_user_id_${user.uid}`);
      if (storedUserId) {
        setGroupmeUserId(storedUserId);
        setConnected(true);
        await fetchGroups(storedUserId);
      }
    } catch (err) {
      console.error("Error checking connection:", err);
    }
  };

  // Step 1: Start OAuth flow
  const handleConnect = () => {
    if (!user) {
      setError("Please sign in first");
      return;
    }
    
    // Temporary workaround for GroupMe OAuth issues
    const useTemporaryWorkaround = window.confirm(
      "GroupMe is currently experiencing OAuth server issues (500 errors).\n\n" +
      "Would you like to use a temporary mock integration to test the QR code functionality?\n\n" +
      "Click OK for mock integration, or Cancel to try real GroupMe OAuth."
    );
    
    if (useTemporaryWorkaround) {
      // Mock successful connection
      const mockUserId = "mock_user_" + Date.now();
      localStorage.setItem(`groupme_user_id_${user.uid}`, mockUserId);
      setGroupmeUserId(mockUserId);
      setConnected(true);
      
      // Mock groups
      setGroups([
        { id: "mock_group_1", name: "QR Test Group", members: [{ name: "You" }] },
        { id: "mock_group_2", name: "Store Team", members: [{ name: "You" }, { name: "Manager" }] }
      ]);
      return;
    }
    
    setError("");
    // Pass Firebase UID as state to link accounts later
    const oauthUrl = `${FUNCTIONS_BASE.groupmeStart}?state=${user.uid}`;
    console.log("Opening GroupMe OAuth with URL:", oauthUrl);
    window.open(oauthUrl, 'groupme-oauth', 'width=600,height=600');
    
    // Listen for OAuth completion
    const checkForCompletion = setInterval(() => {
      const storedUserId = localStorage.getItem(`groupme_user_id_${user.uid}`);
      console.log("Checking for OAuth completion, stored user ID:", storedUserId);
      if (storedUserId) {
        console.log("OAuth completed successfully! GroupMe user ID:", storedUserId);
        clearInterval(checkForCompletion);
        setGroupmeUserId(storedUserId);
        setConnected(true);
        fetchGroups(storedUserId);
      }
    }, 1000);
    
    // Stop checking after 5 minutes
    setTimeout(() => clearInterval(checkForCompletion), 300000);
  };

  // Step 2: Load groups
  const fetchGroups = async (userId) => {
    try {
      setLoading(true);
      const url = `${FUNCTIONS_BASE.groupmeGroups}?user_id=${userId}`;
      const res = await fetch(url);
      
      if (!res.ok) {
        throw new Error(`Failed to fetch groups: ${res.status}`);
      }
      
      const data = await res.json();
      setGroups(data.response?.groups || []);
    } catch (err) {
      setError("Failed to load groups: " + err.message);
      console.error("Failed to fetch groups:", err);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Create bot
  const handleCreateBot = async () => {
    if (!selectedGroup || !groupmeUserId) return;
    
    try {
      setLoading(true);
      setError("");
      
      // Handle mock integration
      if (groupmeUserId.startsWith("mock_user_")) {
        // Simulate bot creation delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        setBotCreated(true);
        
        // Store mock bot info
        localStorage.setItem(`groupme_bot_${user.uid}`, JSON.stringify({
          bot_id: "mock_bot_" + Date.now(),
          group_id: selectedGroup,
          mock: true
        }));
        
        setLoading(false);
        return;
      }
      
      const url = FUNCTIONS_BASE.groupmeCreateBot;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: groupmeUserId,
          group_id: selectedGroup,
          name: "QRcallbox Assistant"
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to create bot: ${errorText}`);
      }
      
      const result = await res.json();
      setBotCreated(true);
      
      // Store bot info for later use
      localStorage.setItem(`groupme_bot_${user.uid}`, JSON.stringify({
        bot_id: result.response?.bot?.bot_id,
        group_id: selectedGroup
      }));
      
    } catch (err) {
      setError("Failed to create bot: " + err.message);
      console.error("Bot creation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    localStorage.removeItem(`groupme_user_id_${user?.uid}`);
    localStorage.removeItem(`groupme_bot_${user?.uid}`);
    setConnected(false);
    setGroups([]);
    setSelectedGroup("");
    setBotCreated(false);
    setGroupmeUserId("");
  };

  return (
    <div className="space-y-4">
      <div className="bg-secondary rounded-xl p-4 border border-themed">
        <h3 className="text-lg font-semibold mb-3 text-primary">GroupMe Integration</h3>
        <p className="text-sm text-secondary mb-4">
          Connect your GroupMe account to receive real-time notifications when customers scan QR codes.
        </p>
        
        {error && (
          <div className="mb-3 p-3 bg-red-900/20 border border-red-500/50 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}
        
        {!connected ? (
          <div>
            <p className="text-sm text-secondary mb-3">
              Click below to connect your GroupMe account and set up notifications.
            </p>
            <Button onClick={handleConnect} disabled={loading || !user}>
              {loading ? "Connecting..." : "Connect GroupMe Account"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-400 font-medium">✓ Connected to GroupMe</span>
              <button 
                onClick={disconnect}
                className="text-sm text-muted hover:text-red-400"
              >
                Disconnect
              </button>
            </div>
            
            {loading ? (
              <div className="text-center py-4">
                <div className="text-sm text-muted">Loading groups...</div>
              </div>
            ) : groups.length > 0 ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">
                    Select Group for Notifications:
                  </label>
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="w-full rounded-xl border border-themed bg-primary text-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Choose a group --</option>
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.members?.length || 0} members)
                      </option>
                    ))}
                  </select>
                </div>
                
                <Button 
                  onClick={handleCreateBot} 
                  disabled={!selectedGroup || loading || botCreated}
                >
                  {loading ? "Creating Bot..." : botCreated ? "✓ Bot Created" : "Create Notification Bot"}
                </Button>
                
                {botCreated && (
                  <div className="p-3 bg-green-900/20 border border-green-500/50 rounded-xl text-green-400 text-sm">
                    ✅ Bot created successfully! You'll now receive notifications in your selected GroupMe group when customers scan QR codes.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted">
                No groups found. Make sure you're a member of at least one GroupMe group.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}