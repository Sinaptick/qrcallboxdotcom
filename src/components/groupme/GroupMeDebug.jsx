import React, { useCallback } from "react";

/**
 * GroupMeDebug Component
 * Handles debug information display and admin tools
 * Extracted from GroupMeSetup for better separation of concerns
 */
const GroupMeDebug = React.memo(function GroupMeDebug({
  user,
  debugInfo,
  isAdmin = false
}) {
  
  const clearDebugLog = useCallback(() => {
    // This would typically be handled by parent component
    // Just demonstrate the functionality structure
  }, []);

  if (!debugInfo || debugInfo.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 pt-4 border-t border-themed">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-primary">Debug Log:</h4>
        <button 
          onClick={clearDebugLog}
          className="text-xs text-muted hover:text-red-400"
        >
          Clear Log
        </button>
      </div>
      
      <div className="bg-black/40 rounded-lg p-3 max-h-60 overflow-y-auto">
        <div className="font-mono text-xs space-y-1">
          {debugInfo.map((msg, idx) => (
            <div 
              key={idx} 
              className={`${
                msg.includes('ERROR') || msg.includes('Failed') 
                  ? 'text-red-400' 
                  : msg.includes('SUCCESS') || msg.includes('✓') 
                  ? 'text-green-400'
                  : msg.includes('DEBUG') || msg.includes('🔍')
                  ? 'text-yellow-400'
                  : 'text-gray-300'
              }`}
            >
              {msg}
            </div>
          ))}
        </div>
      </div>
      
      {/* Admin Status Display */}
      {user && (
        <div className="mt-2 p-2 bg-gray-900/20 border border-gray-500/50 rounded text-xs text-gray-400">
          User: {user.email} | Admin: {isAdmin ? '✅ YES' : '❌ NO'}
        </div>
      )}
    </div>
  );
});

export default GroupMeDebug;