import React, { useEffect, useState } from "react";
import Button from "./Button.jsx";
import { auth } from "./firebaseClient.js"; // 👈 use the shared instance

// ===== GroupMe envs =====
const START_URL   = import.meta.env.VITE_GROUPME_START_URL;
const GROUPS_URL  = import.meta.env.VITE_GROUPME_GROUPS_URL;
const CREATE_URL  = import.meta.env.VITE_GROUPME_CREATE_URL;
const WEBHOOK_URL = import.meta.env.VITE_GROUPME_WEBHOOK_URL;

export default function GroupMeSetup() {
  const user = auth?.currentUser;

  const [connected, setConnected] = useState(false);
  import React, { useState, useEffect } from "react";
  import Button from "./Button.jsx";

  const START_URL = import.meta.env.VITE_GROUPME_START_URL;
  const GROUPS_URL = import.meta.env.VITE_GROUPME_GROUPS_URL;
  const CREATE_BOT_URL = import.meta.env.VITE_GROUPME_CREATEBOT_URL;

  export default function GroupMeSetup() {
    const [connected, setConnected] = useState(false);
    const [groups, setGroups] = useState([]);
    const [selectedGroup, setSelectedGroup] = useState("");
    const [botCreated, setBotCreated] = useState(false);

    // Step 1: Connect to GroupMe
    const handleConnect = () => {
      window.location.href = START_URL; // your Cloud Function handles OAuth redirect
    };

    // Step 2: After redirect, check if we already have a token/session
    useEffect(() => {
      const token = localStorage.getItem("groupme_token");
      if (token) {
        setConnected(true);
        fetchGroups(token);
      }
    }, []);

    // Step 3: Load groups
    const fetchGroups = async (token) => {
      try {
        const res = await fetch(`${GROUPS_URL}?token=${token}`);
        const data = await res.json();
        setGroups(data.groups || []);
      } catch (err) {
        console.error("Failed to fetch groups:", err);
      }
    };

    // Step 4: Create bot
    const handleCreateBot = async () => {
      try {
        const token = localStorage.getItem("groupme_token");
        const res = await fetch(CREATE_BOT_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            group_id: selectedGroup,
            name: "QR Call Bot",
            callback_url: "https://yourdomain.com/groupme/callback"
          })
        });
        if (res.ok) {
          setBotCreated(true);
        }
      } catch (err) {
        console.error("Bot creation failed:", err);
      }
    };

    return (
      <div className="settings-card">
        <h3>GroupMe Bot</h3>
        {!connected ? (
          <Button onClick={handleConnect}>Connect GroupMe</Button>
        ) : (
          <>
            <p>Connected to GroupMe</p>
            {groups.length > 0 ? (
              <>
                <label htmlFor="group-select">Choose a group:</label>
                <select
                  id="group-select"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                >
                  <option value="">-- Select group --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <Button onClick={handleCreateBot} disabled={!selectedGroup}>
                  Create Bot
                </Button>
                {botCreated && <p>✅ Bot created successfully!</p>}
              </>
            ) : (
              <p>No groups found.</p>
            )}
          </>
        )}
      </div>
    );