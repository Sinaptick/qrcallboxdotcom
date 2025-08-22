import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { defineSecret } from "firebase-functions/params";

// ===== Secrets (set with `firebase functions:secrets:set ...`) =====
const GROUPME_CLIENT_ID = defineSecret("GROUPME_CLIENT_ID");
// GroupMe does not use client_secret for personal apps; omit if you don’t have one.
// const GROUPME_CLIENT_SECRET = defineSecret("GROUPME_CLIENT_SECRET");

// ===== Admin SDK =====
initializeApp();
const db = getFirestore();

// Your deployed base URL/route you registered in GroupMe app settings
const REGION = "us-central1";
const BASE_CALLBACK = "https://groupmewebhook-46us5rurra-uc.a.run.app/oauth/callback";

// Helpers
function requiredQuery(req, key) {
  const v = req.query[key];
  if (!v) throw new Error(`Missing query param: ${key}`);
  return String(v);
}

// ===== 1) Start OAuth: redirect user to GroupMe authorize =====
export const groupmeStart = onRequest(
  { region: REGION, secrets: [GROUPME_CLIENT_ID] },
  async (req, res) => {
    try {
      // Optional: accept a `state` param you pass through (e.g., your userId)
      const state = req.query.state ? String(req.query.state) : "";
      const clientId = GROUPME_CLIENT_ID.value();

      const authorizeUrl =
        "https://oauth.groupme.com/oauth/authorize" +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(BASE_CALLBACK)}` +
        (state ? `&state=${encodeURIComponent(state)}` : "");

      res.redirect(authorizeUrl);
    } catch (e) {
      logger.error(e);
      res.status(400).send("Failed to start OAuth");
    }
  }
);

// ===== 2) OAuth callback: exchange code for access_token =====
export const groupmeCallback = onRequest(
  { region: REGION, secrets: [GROUPME_CLIENT_ID] },
  async (req, res) => {
    try {
      const code = requiredQuery(req, "code");
      const state = req.query.state ? String(req.query.state) : "";
      const clientId = GROUPME_CLIENT_ID.value();

      // GroupMe token exchange (no client_secret for personal apps)
      const resp = await fetch("https://api.groupme.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          grant_type: "authorization_code",
          code,
          redirect_uri: BASE_CALLBACK
        })
      });

      const data = await resp.json();
      if (!resp.ok || !data?.access_token) {
        logger.error("OAuth exchange failed", { status: resp.status, data });
        return res.status(400).send("OAuth exchange failed.");
      }

      const { access_token, user_id } = data;

      // Save per-user token (key how you like; here by GroupMe user_id)
      await db.collection("groupme_tokens").doc(String(user_id)).set(
        {
          access_token,
          user_id: String(user_id),
          state: state || null,
          updatedAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      // Send the user back to your app
      res
        .status(200)
        .send(
          "Authorization complete. You may close this tab and return to the app."
        );
    } catch (e) {
      logger.error(e);
      res.status(500).send("Error handling OAuth callback");
    }
  }
);

// ===== 3) List groups using stored token =====
// Call like: GET /groupmeGroups?user_id=<groupme_user_id>
export const groupmeGroups = onRequest({ region: REGION }, async (req, res) => {
  try {
    const groupmeUserId = requiredQuery(req, "user_id");
    const doc = await db.collection("groupme_tokens").doc(groupmeUserId).get();
    if (!doc.exists) return res.status(404).send("No token on file");

    const { access_token } = doc.data();

    const resp = await fetch(
      "https://api.groupme.com/v3/groups?per_page=100&page=1",
      { headers: { "X-Access-Token": access_token } }
    );
    const json = await resp.json();

    if (!resp.ok) {
      logger.error("Group list failed", { status: resp.status, json });
      return res.status(400).send("Failed to fetch groups");
    }

    res.json(json);
  } catch (e) {
    logger.error(e);
    res.status(500).send("Error listing groups");
  }
});

// ===== 4) Create a bot in a group =====
// POST body: { user_id: "12345", group_id: "67890", name?: "QR Bot" }
export const groupmeCreateBot = onRequest({ region: REGION }, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).send("Use POST");
    const { user_id, group_id, name } = await req.json().catch(() => req.body || {});
    if (!user_id || !group_id) return res.status(400).send("Missing user_id or group_id");

    const doc = await db.collection("groupme_tokens").doc(String(user_id)).get();
    if (!doc.exists) return res.status(404).send("No token on file");
    const { access_token } = doc.data();

    const callbackUrl = "https://groupmewebhook-46us5rurra-uc.a.run.app/groupme/events";

    const resp = await fetch("https://api.groupme.com/v3/bots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Token": access_token
      },
      body: JSON.stringify({
        bot: {
          name: name || "QRcallbox Bot",
          group_id: String(group_id),
          callback_url: callbackUrl
        }
      })
    });

    const json = await resp.json();
    if (!resp.ok) {
      logger.error("Create bot failed", { status: resp.status, json });
      return res.status(400).send("Failed to create bot");
    }

    res.json(json);
  } catch (e) {
    logger.error(e);
    res.status(500).send("Error creating bot");
  }
});