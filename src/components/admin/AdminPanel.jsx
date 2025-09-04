import React from "react";
import UnapprovedUsersList from "../../UnapprovedUsersList.jsx";
import PendingChangesList from "./PendingChangesList.jsx";
import TicketQueue from "../../TicketQueue.jsx";
import BlockedIPsManager from "../../BlockedIPsManager.jsx";
import GroupMeAdminPanel from "./GroupMeAdminPanel.jsx";

/**
 * AdminPanel Component
 * Handles all admin-specific functionality and navigation
 * Extracted from TabContent to reduce complexity and improve organization
 */
const AdminPanel = React.memo(function AdminPanel({
  currentAdminView,
  setCurrentAdminView,
  db
}) {
  return (
    <div>
      <div className="text-sm text-secondary mb-4">
        Welcome, admin user <span className="font-mono">sinaptick@gmail.com</span>.
      </div>
      
      {/* Admin Navigation */}
      <div className="mb-6">
        <div className="flex gap-2 border-b border-themed">
          {["Overview", "Support Tickets", "User Management", "GroupMe Bots", "Spam Protection", "Data Cleanup"].map((view) => (
            <button
              key={view}
              onClick={() => setCurrentAdminView(view.toLowerCase().replace(" ", "_"))}
              className={`px-4 py-2 text-sm transition-colors border-b-2 ${
                currentAdminView === view.toLowerCase().replace(" ", "_")
                  ? "border-indigo-500 text-primary"
                  : "border-transparent text-secondary hover:text-primary"
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* Admin Content */}
      {currentAdminView === "overview" && (
        <div className="space-y-6">
          <div className="text-sm text-secondary mb-4">
            Quick overview of system status and recent activity.
          </div>
          <UnapprovedUsersList db={db} />
          <PendingChangesList db={db} />
        </div>
      )}

      {currentAdminView === "support_tickets" && (
        <TicketQueue />
      )}

      {currentAdminView === "user_management" && (
        <div className="space-y-6">
          <div className="bg-secondary rounded-xl p-4 border border-themed">
            <h4 className="text-md font-semibold mb-3 text-primary">User Management</h4>
            <div className="text-sm text-muted">
              User management functionality is temporarily unavailable to prevent circular dependencies. 
              This will be restored in a future update.
            </div>
          </div>
          <UnapprovedUsersList db={db} />
        </div>
      )}

      {currentAdminView === "groupme_bots" && (
        <div className="space-y-6">
          <div className="text-sm text-secondary mb-4">
            Manage GroupMe bot integrations for all users. Look up any user by email or ID to view, debug, or delete their GroupMe bots.
          </div>
          <GroupMeAdminPanel />
        </div>
      )}

      {currentAdminView === "spam_protection" && (
        <BlockedIPsManager />
      )}

      {currentAdminView === "data_cleanup" && (
        <div className="bg-secondary rounded-xl p-4 border border-themed">
          <h4 className="text-md font-semibold mb-3 text-primary">Data Cleanup Tool</h4>
          <div className="text-sm text-muted">
            Data cleanup functionality is temporarily unavailable to prevent circular dependencies. 
            This will be restored in a future update.
          </div>
        </div>
      )}
    </div>
  );
});

export default AdminPanel;