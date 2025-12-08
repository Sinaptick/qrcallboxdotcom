import React, { useState } from "react";
import UnapprovedUsersList from "../../UnapprovedUsersList.jsx";
import PendingChangesList from "./PendingChangesList.jsx";
import TicketQueue from "../../TicketQueue.jsx";
import BlockedIPsManager from "../../BlockedIPsManager.jsx";
import GroupMeAdminPanel from "./GroupMeAdminPanel.jsx";
import UserManagement from "./UserManagement.jsx";
import QRLocations from "./QRLocations.jsx";
import { auth } from "../../config/firebase.config.js";

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
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const [diagnosticStore, setDiagnosticStore] = useState('');

  const handleBackfill = async () => {
    if (!confirm('Run GroupMe response backfill? This will update all historical scan records with GroupMe responses.')) {
      return;
    }

    setBackfillLoading(true);
    setBackfillResult(null);

    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('https://us-central1-qrwebaccdb.cloudfunctions.net/backfillGroupMeResponses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      setBackfillResult(result);
    } catch (error) {
      setBackfillResult({ error: error.message });
    } finally {
      setBackfillLoading(false);
    }
  };

  const handleDiagnostic = async () => {
    setDiagnosticLoading(true);
    setDiagnosticResult(null);

    try {
      const token = await auth.currentUser.getIdToken();
      const url = new URL('https://us-central1-qrwebaccdb.cloudfunctions.net/diagnosticScanResponses');
      if (diagnosticStore) {
        url.searchParams.append('storeNumber', diagnosticStore);
      }
      url.searchParams.append('limit', '20');

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const result = await response.json();
      setDiagnosticResult(result);
    } catch (error) {
      setDiagnosticResult({ error: error.message });
    } finally {
      setDiagnosticLoading(false);
    }
  };

  return (
    <div>
      <div className="text-sm text-secondary mb-4">
        Welcome, admin user <span className="font-mono">sinaptick@gmail.com</span>.
      </div>
      
      {/* Admin Navigation */}
      <div className="mb-6">
        <div className="flex gap-2 border-b border-themed">
          {["Overview", "Support Tickets", "User Management", "GroupMe Bots", "QR Locations", "Spam Protection", "Data Cleanup"].map((view) => (
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
          <UserManagement />
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

      {currentAdminView === "qr_locations" && (
        <QRLocations />
      )}

      {currentAdminView === "spam_protection" && (
        <BlockedIPsManager />
      )}

      {currentAdminView === "data_cleanup" && (
        <div className="space-y-4">
          {/* Diagnostic Tool */}
          <div className="bg-secondary rounded-xl p-4 border border-themed">
            <h4 className="text-md font-semibold mb-3 text-primary">Response Tracking Diagnostic</h4>
            <div className="text-sm text-muted mb-4">
              View recent scans and their responses (assists, ignores, timeouts) to verify tracking is working.
            </div>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Store Number (optional)"
                value={diagnosticStore}
                onChange={(e) => setDiagnosticStore(e.target.value)}
                className="px-3 py-2 border border-themed rounded-lg bg-primary text-primary flex-1"
              />
              <button
                onClick={handleDiagnostic}
                disabled={diagnosticLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {diagnosticLoading ? 'Loading...' : 'Run Diagnostic'}
              </button>
            </div>

            {diagnosticResult && (
              <div className="mt-4 p-4 rounded-lg bg-primary border border-themed max-h-[600px] overflow-y-auto">
                {diagnosticResult.error ? (
                  <div className="text-red-600">
                    <strong>Error:</strong> {diagnosticResult.error}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="font-semibold text-primary">
                      Showing {diagnosticResult.scans.length} of {diagnosticResult.totalScans} recent scans
                      {diagnosticResult.query.storeNumber && ` for store ${diagnosticResult.query.storeNumber}`}
                    </div>

                    {diagnosticResult.scans.map((scan, i) => (
                      <details key={i} className="border border-themed rounded-lg p-3 bg-secondary">
                        <summary className="cursor-pointer font-semibold text-primary">
                          {scan.storeNumber} - {scan.areaDescription} - {scan.status}
                          <span className="ml-2 text-xs font-normal text-muted">
                            ({scan.responseBreakdown.assists} assists, {scan.responseBreakdown.ignores} ignores, {scan.responseBreakdown.timeouts} timeouts)
                          </span>
                        </summary>
                        <div className="mt-3 space-y-2 text-sm">
                          <div><strong>Scan ID:</strong> {scan.scanId}</div>
                          <div><strong>Timestamp:</strong> {new Date(scan.timestamp).toLocaleString()}</div>
                          <div><strong>Status:</strong> {scan.status}</div>
                          {scan.claimedByName && <div><strong>Claimed By:</strong> {scan.claimedByName}</div>}
                          <div><strong>Eligible Users:</strong> {scan.eligibleUserCount} ({scan.eligibleUsers.map(u => u.name).join(', ')})</div>
                          <div><strong>Timeout Processed:</strong> {scan.timeoutProcessed ? 'Yes' : 'No'}</div>

                          <div className="mt-2">
                            <strong>Response Breakdown:</strong>
                            <ul className="ml-4 mt-1">
                              <li>Total: {scan.responseBreakdown.total}</li>
                              <li>Assists: {scan.responseBreakdown.assists}</li>
                              <li>Ignores: {scan.responseBreakdown.ignores}</li>
                              <li>Timeout Ignores: {scan.responseBreakdown.timeouts}</li>
                              <li>Button Ignores: {scan.responseBreakdown.buttonIgnores}</li>
                            </ul>
                          </div>

                          {scan.responses.length > 0 && (
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs font-semibold">Raw Responses ({scan.responses.length})</summary>
                              <pre className="mt-2 text-xs bg-primary p-2 rounded overflow-x-auto">
                                {JSON.stringify(scan.responses, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Backfill Tool */}
          <div className="bg-secondary rounded-xl p-4 border border-themed">
            <h4 className="text-md font-semibold mb-3 text-primary">GroupMe Response Backfill</h4>
            <div className="text-sm text-muted mb-4">
              Backfill historical GroupMe responses into the scans collection for Android app integration.
            </div>
            <button
              onClick={handleBackfill}
              disabled={backfillLoading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {backfillLoading ? 'Running Backfill...' : 'Run Backfill'}
            </button>

            {backfillResult && (
              <div className={`mt-4 p-4 rounded-lg ${backfillResult.error ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                {backfillResult.error ? (
                  <div>
                    <strong>Error:</strong> {backfillResult.error}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div><strong>Backfill Complete!</strong></div>
                    <div>Total GroupMe messages processed: {backfillResult.totalMessagesProcessed}</div>
                    <div>GroupMe groups mapped to stores: {backfillResult.groupsMapped}</div>
                    <div>Scans updated: {backfillResult.scansUpdated}</div>
                    <div>Scans skipped (already had responses): {backfillResult.scansSkipped}</div>
                    <div>Scans not found: {backfillResult.scansNotFound}</div>
                    <div>Messages without store mapping: {backfillResult.messagesWithoutStore}</div>
                    {backfillResult.sampleResults && backfillResult.sampleResults.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer font-semibold">Sample Results ({backfillResult.sampleResults.length})</summary>
                        <ul className="mt-2 text-xs space-y-1">
                          {backfillResult.sampleResults.map((r, i) => (
                            <li key={i}>Store {r.store} - {r.responder}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default AdminPanel;