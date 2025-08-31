import React from "react";
import { Card, CardHeader, CardBody } from "../shared/Card.jsx";
import Dashboard from "../../app.jsx"; // Will need to verify these imports
import TopResponders from "../../app.jsx";
import GenerateQR from "../../app.jsx";
import Settings from "../../app.jsx";
import FilterControls from "./FilterControls.jsx";
import InsightsAI from "../../InsightsAI.jsx";
import Heatmap from "../../Heatmap.jsx";
import GroupMeSetup from "../../GroupMeSetup.jsx";
import MyTickets from "../../MyTickets.jsx";
import Setup from "../../Setup.jsx";
import AdminPanel from "../admin/AdminPanel.jsx";

/**
 * TabContent Component
 * Handles all tab-specific content rendering
 * Extracted from Shell component to reduce complexity
 */
const TabContent = React.memo(function TabContent({
  active,
  user,
  isAdmin,
  userDoc,
  db,
  showContactUs,
  setShowContactUs,
  currentSettingsView,
  setCurrentSettingsView,
  currentAdminView,
  setCurrentAdminView,
  insightsData,
  filteredLogs,
  setActive
}) {
  const { 
    logsLoading, 
    selectedStores, 
    selectedWeek, 
    weeks, 
    selectedAreas 
  } = insightsData;

  // Dashboard Tab
  if (active === "Dashboard") {
    return (
      <>
        <Card>
          <CardHeader title="Dashboard" subtitle="Overview of live assistance activity" />
          <CardBody>
            <Dashboard />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Top Responders" subtitle="Leaderboard of fastest and most active associates" />
          <CardBody>
            <TopResponders db={db} />
          </CardBody>
        </Card>
      </>
    );
  }

  // Insights Tab
  if (active === "Insights") {
    return (
      <Card>
        <CardHeader title="Insights" subtitle={null} />
        <CardBody>
          <FilterControls
            {...insightsData}
            isAdmin={isAdmin}
            userDoc={userDoc}
          />

          <InsightsAI logs={filteredLogs} />

          <div className="mt-6">
            {logsLoading ? (
              <div className="flex items-center justify-center py-12 text-muted">Loading data…</div>
            ) : (
              <Heatmap
                logs={filteredLogs}
                selectedStores={selectedStores}
                selectedWeek={selectedWeek}
                weeks={weeks}
                selectedAreas={selectedAreas}
              />
            )}
          </div>
        </CardBody>
      </Card>
    );
  }

  // Generate QR Tab
  if (active === "Generate QR") {
    return (
      <Card>
        <CardHeader title="Generate QR" subtitle="Create a new QR poster" />
        <CardBody>
          <GenerateQR userDoc={userDoc} isAdmin={isAdmin} />
        </CardBody>
      </Card>
    );
  }

  // Settings Tab
  if (active === "Settings") {
    return (
      <Card>
        <CardHeader title="Settings" subtitle="Manage your account and support tickets" />
        <CardBody>
          {/* Settings Navigation */}
          <div className="mb-6">
            <div className="flex gap-2 border-b border-themed">
              {["Account", "My Tickets", "Integrations"].map((view) => (
                <button
                  key={view}
                  onClick={() => setCurrentSettingsView(view.toLowerCase().replace(" ", "_"))}
                  className={`px-4 py-2 text-sm transition-colors border-b-2 ${
                    currentSettingsView === view.toLowerCase().replace(" ", "_")
                      ? "border-indigo-500 text-primary"
                      : "border-transparent text-secondary hover:text-primary"
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
          </div>

          {/* Settings Content */}
          {currentSettingsView === "account" && (
            <Settings user={user} />
          )}

          {currentSettingsView === "my_tickets" && (
            <MyTickets onCreateTicket={() => setShowContactUs(true)} />
          )}

          {currentSettingsView === "integrations" && (
            <div className="space-y-8">
              <GroupMeSetup />
              {/* Workvivo setup - temporarily disabled */}
              {/* <WorkvivoSetup /> */}
            </div>
          )}
        </CardBody>
      </Card>
    );
  }

  // Admin Tab
  if (active === "Admin" && isAdmin) {
    return (
      <Card>
        <CardHeader title="Admin" subtitle="Admin tools and controls" />
        <CardBody>
          <AdminPanel
            currentAdminView={currentAdminView}
            setCurrentAdminView={setCurrentAdminView}
            db={db}
          />
        </CardBody>
      </Card>
    );
  }

  // Setup Tab
  if (active === "Setup") {
    return (
      <Card>
        <CardHeader title="Store Implementation Setup" subtitle="Follow these steps to implement QRcallbox in your store" />
        <CardBody>
          <Setup onNavigate={(tab, subView) => {
            setActive(tab);
            if (tab === "Settings" && subView) {
              setCurrentSettingsView(subView);
            }
          }} />
        </CardBody>
      </Card>
    );
  }

  return null;
});

export default TabContent;