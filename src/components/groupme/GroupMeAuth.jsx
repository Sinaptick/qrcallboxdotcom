import React, { useRef, useCallback } from "react";
import Button from "../../Button.jsx";

// Firebase Functions URLs  
const FUNCTIONS_BASE = {
  groupmeStart: "https://groupmestart-46us5rurra-uc.a.run.app"
};

/**
 * GroupMeAuth Component
 * Handles GroupMe OAuth authentication flow
 * Extracted from GroupMeSetup for better separation of concerns
 */
const GroupMeAuth = React.memo(function GroupMeAuth({
  user,
  loading,
  connected,
  addDebug,
  onConnectionSuccess,
  onDisconnect,
  onError,
  groupmeUserId,
  setGroupmeUserId,
  setConnected,
  setGroups,
  setSelectedGroup,
  setBotCreated
}) {
  const messageHandlerRef = useRef(null);
  const cleanupTimeoutRef = useRef(null);

  const handleConnect = useCallback(() => {
    if (!user) {
      onError("Please sign in first");
      return;
    }

    // Clean up any existing event listener
    if (messageHandlerRef.current) {
      window.removeEventListener('message', messageHandlerRef.current);
      messageHandlerRef.current = null;
    }

    // Clear any existing timeout
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }

    addDebug("Starting GroupMe OAuth flow...");

    const oauthUrl = `${FUNCTIONS_BASE.groupmeStart}?state=${user.uid}`;
    addDebug(`Opening OAuth URL: ${oauthUrl}`);

    const handleMessage = (event) => {
      addDebug(`Received message from ${event.origin}: ${JSON.stringify(event.data)}`);
      
      if (event.origin !== window.location.origin) {
        addDebug(`Ignored message from different origin: ${event.origin}`);
        return;
      }
      
      if (event.data.type === 'GROUPME_SUCCESS') {
        addDebug("OAuth success received!");
        const { user_id } = event.data;
        
        if (user_id) {
          localStorage.setItem(`groupme_user_id_${user.uid}`, user_id);
          setGroupmeUserId(user_id);
          setConnected(true);
          addDebug(`Stored user ID: ${user_id}`);
          onConnectionSuccess(user_id);
        } else {
          addDebug("No user_id in success message");
          onError("Connection succeeded but no user ID received");
        }
        
        // Clean up
        window.removeEventListener('message', messageHandlerRef.current);
        messageHandlerRef.current = null;
        if (cleanupTimeoutRef.current) {
          clearTimeout(cleanupTimeoutRef.current);
          cleanupTimeoutRef.current = null;
        }
      } else if (event.data.type === 'GROUPME_ERROR') {
        const errorMsg = event.data.message || 'OAuth failed';
        addDebug(`OAuth error: ${errorMsg}`);
        onError(errorMsg);
        
        // Clean up
        window.removeEventListener('message', messageHandlerRef.current);
        messageHandlerRef.current = null;
        if (cleanupTimeoutRef.current) {
          clearTimeout(cleanupTimeoutRef.current);
          cleanupTimeoutRef.current = null;
        }
      }
    };

    messageHandlerRef.current = handleMessage;
    window.addEventListener('message', handleMessage);
    
    // Set timeout to clean up listener after 5 minutes
    cleanupTimeoutRef.current = setTimeout(() => {
      if (messageHandlerRef.current) {
        window.removeEventListener('message', messageHandlerRef.current);
        messageHandlerRef.current = null;
        addDebug("OAuth listener timed out after 5 minutes");
      }
    }, 5 * 60 * 1000);

    // Open OAuth window
    window.open(oauthUrl, 'groupme-oauth', 'width=600,height=600,scrollbars=yes,resizable=yes');
    addDebug("OAuth popup opened");
  }, [user, addDebug, onConnectionSuccess, onError, setConnected, setGroupmeUserId]);

  const handleDisconnect = useCallback(() => {
    if (user) {
      localStorage.removeItem(`groupme_user_id_${user.uid}`);
    }
    setGroupmeUserId('');
    setConnected(false);
    setGroups([]);
    setSelectedGroup('');
    setBotCreated(false);
    addDebug("Disconnected from GroupMe");
    onDisconnect();
  }, [user, setGroupmeUserId, setConnected, setGroups, setSelectedGroup, setBotCreated, addDebug, onDisconnect]);

  const handleClearConnection = useCallback(() => {
    if (user) {
      localStorage.removeItem(`groupme_user_id_${user.uid}`);
    }
    setGroupmeUserId('');
    setConnected(false);
    setGroups([]);
    setSelectedGroup('');
    setBotCreated(false);
    addDebug('Cleared all connection data - ready for fresh connection');
  }, [user, setGroupmeUserId, setConnected, setGroups, setSelectedGroup, setBotCreated, addDebug]);

  if (connected) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-green-400 font-medium">✓ Connected to GroupMe</span>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              window.open('https://web.groupme.com/signout', '_blank');
              setTimeout(() => {
                alert('After logging out of GroupMe and signing in with a different account, click "Switch Account" to reconnect.');
              }, 500);
            }}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Change GroupMe User
          </button>
          <button 
            onClick={handleDisconnect}
            className="text-sm text-muted hover:text-red-400"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-secondary mb-3">
        Click below to connect your GroupMe account and set up notifications.
      </p>
      <div className="p-3 bg-blue-900/20 border border-blue-500/50 rounded-xl text-blue-400 text-sm mb-3">
        <strong>Note:</strong> GroupMe will use your currently logged-in account. To connect a different GroupMe account:
        <ol className="mt-2 ml-4 list-decimal">
          <li>Open <a href="https://web.groupme.com" target="_blank" className="underline">GroupMe Web</a> in a new tab</li>
          <li>Log out if needed and sign in with the desired account</li>
          <li>Return here and click "Connect GroupMe Account"</li>
        </ol>
      </div>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={handleConnect} disabled={loading || !user}>
          {loading ? "Connecting..." : "Connect GroupMe Account"}
        </Button>
        {/* Debug button for clearing connection - only show in development */}
        {window.location.hostname === 'localhost' && (
          <Button 
            onClick={handleClearConnection}
            disabled={loading || !user}
            className="bg-red-600 hover:bg-red-700"
          >
            Clear Connection (Debug)
          </Button>
        )}
      </div>
    </div>
  );
});

export default GroupMeAuth;