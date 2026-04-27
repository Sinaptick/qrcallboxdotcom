/**
 * workvivo-automation.js
 *
 * Multi-tenant Workvivo / Sendbird integration for QRCallBox.
 *
 * How it works:
 *  - Each user stores their own Workvivo credentials in workvivo_config/{uid}
 *  - On QR scan: postToWorkvivo() finds any active config for that store and posts
 *  - Users self-enroll via workvivoConnect → workvivoConfig in the app settings
 *  - Passwords are encrypted at rest with AES-256-GCM (key in Secret Manager)
 *
 * Firestore schema (workvivo_config/{uid}):
 *  {
 *    storeNumber:      string,   // e.g. "1458"
 *    workvivoEmail:    string,   // their Workvivo login
 *    encryptedPass:    string,   // "iv:tag:ciphertext" (AES-256-GCM)
 *    channelUrl:       string,   // Sendbird channel URL
 *    channelName:      string,   // e.g. "1458 QRCallBox"
 *    accessToken:      string,   // cached Sendbird token
 *    workvivoUserId:   string,   // numeric Workvivo user ID
 *    appId:            string,   // Sendbird app ID (static)
 *    connectedAt:      Timestamp,
 *    tokenUpdatedAt:   Timestamp,
 *    status:           "active" | "error" | "needs_reauth"
 *  }
 */

import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { getFunctions } from 'firebase-admin/functions';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Resend } from 'resend';
import WebSocket from 'ws';
import * as logger from 'firebase-functions/logger';

if (!getApps().length) initializeApp();

const db = getFirestore();
const REGION = 'us-central1';

// Exported so any calling Cloud Function can declare it as a secret dependency
export const ENCRYPT_KEY = defineSecret('WORKVIVO_ENCRYPT_KEY');
export const RESEND_KEY  = defineSecret('RESEND_API_KEY');

const WORKVIVO_URL  = 'https://workvivo.walmart.com';
const SENDBIRD_APP_ID = '0AA8791B-F241-40B8-94A5-E3D0759A28F2';
const SENDBIRD_BASE   = `https://api-${SENDBIRD_APP_ID}.sendbird.com/v3`;
const CSRF_RE = /<meta\s+name="csrf_token"\s+content="([^"]+)"/;

// ── Crypto helpers ────────────────────────────────────────────────────────────

function encrypt(plaintext, keyHex) {
  const key = Buffer.from(keyHex, 'hex');
  const iv  = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(stored, keyHex) {
  const [ivHex, tagHex, encHex] = stored.split(':');
  const key = Buffer.from(keyHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]).toString('utf8');
}

// ── Cookie jar (minimal, for Node 22 native fetch) ───────────────────────────

function parseCookies(setCookieHeaders = []) {
  const jar = {};
  for (const h of setCookieHeaders) {
    const [pair] = h.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) jar[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return jar;
}

function mergeCookies(...jars) {
  return Object.assign({}, ...jars);
}

function cookieHeader(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── Workvivo headless login ───────────────────────────────────────────────────

/**
 * Log into Workvivo with email + password (password auth mode — no SSO).
 * Returns { accessToken, appId, workvivoUserId, cookies }.
 */
async function workvivoLogin(email, password) {
  // 1. GET login page → grab CSRF token + initial cookies
  const loginPage = await fetch(`${WORKVIVO_URL}/login`);
  const loginHtml = await loginPage.text();
  const csrf1     = loginHtml.match(CSRF_RE)?.[1];
  if (!csrf1) throw new Error('CSRF token not found on /login page.');

  const jar1 = parseCookies(loginPage.headers.getSetCookie?.() ?? []);

  // 2. POST credentials
  const loginRes = await fetch(`${WORKVIVO_URL}/login`, {
    method:  'POST',
    headers: {
      'X-CSRF-Token':     csrf1,
      'Content-Type':     'application/json',
      'Accept':           'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie':           cookieHeader(jar1),
    },
    body:     JSON.stringify({ email, password }),
    redirect: 'follow',
  });

  const loginBody = await loginRes.text();
  const jar2 = mergeCookies(jar1, parseCookies(loginRes.headers.getSetCookie?.() ?? []));
  const csrf2 = loginBody.match(CSRF_RE)?.[1];

  if (!csrf2) {
    // Try fetching the chat page for a fresh CSRF if login response was JSON
    const chatPage = await fetch(`${WORKVIVO_URL}/chat`, {
      headers: { 'Cookie': cookieHeader(jar2) },
    });
    const chatHtml = await chatPage.text();
    const csrf3 = chatHtml.match(CSRF_RE)?.[1];
    const jar3  = mergeCookies(jar2, parseCookies(chatPage.headers.getSetCookie?.() ?? []));
    return await fetchSendbirdConfig(csrf3, jar3);
  }

  return await fetchSendbirdConfig(csrf2, jar2);
}

async function fetchSendbirdConfig(csrf, jar) {
  const cfgRes = await fetch(`${WORKVIVO_URL}/api/chat/config`, {
    headers: {
      'X-CSRF-Token': csrf,
      'Cookie':       cookieHeader(jar),
      'Accept':       'application/json',
    },
  });

  if (!cfgRes.ok) {
    throw new Error(`/api/chat/config returned ${cfgRes.status} — credentials may be wrong.`);
  }

  const cfg = await cfgRes.json();
  const accessToken = cfg.access_token ?? cfg.token;
  if (!accessToken) throw new Error('No access_token in /api/chat/config response.');

  // Pull workvivoUserId from window.v2.id — scrape the chat page if needed
  const workvivoUserId = await scrapeUserId(jar);

  return { accessToken, appId: cfg.app_id ?? SENDBIRD_APP_ID, workvivoUserId };
}

async function scrapeUserId(jar) {
  try {
    const r    = await fetch(`${WORKVIVO_URL}/chat`, { headers: { 'Cookie': cookieHeader(jar) } });
    const html = await r.text();
    return html.match(/"id"\s*:\s*(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
}

// ── Sendbird REST helpers ─────────────────────────────────────────────────────

function sendbirdHeaders(accessToken, sessionKey = null) {
  const h = {
    'App-Id':        SENDBIRD_APP_ID,
    'Access-Token':  accessToken,
    'Content-Type':  'application/json; charset=utf-8',
    'SendBird':      `JS,QRCallBox/1.0,4.17.4,${SENDBIRD_APP_ID}`,
    'SB-User-Agent': 'JS/c4.17.4///oweb',
  };
  if (sessionKey) h['Session-Key'] = sessionKey;
  return h;
}


/**
 * Sendbird WebSocket handshake to obtain a fresh Session-Key.
 *
 * Workvivo's Sendbird tenant rejects REST calls that lack `Session-Key`
 * (returns 400 "Api-Token is missing" with just Access-Token). The Session-Key
 * is normally minted on a WebSocket Connect handshake — that's what the
 * browser does. We replicate the handshake server-side: open WSS, the LOGI
 * response from Sendbird carries a `key` field, close the socket.
 *
 * @returns {Promise<{ sessionKey: string, expiresIn: number, userId: string }>}
 */
function fetchSendbirdSessionKey(accessToken, userId, appId = SENDBIRD_APP_ID) {
  const params = new URLSearchParams({
    p: 'JS', pv: '4.17.4', sv: 'c4.17.4',
    ai:           appId,
    user_id:      String(userId),
    access_token: accessToken,
    ua:           'JS/c4.17.4///oweb',
    active:       '1',
  });
  // Sendbird's WS endpoint requires the app_id in the hostname EXACTLY as the
  // app was registered (uppercase + dashes for this tenant). Lowercase fails
  // with "Application is not found" 400304.
  const url = `wss://ws-${appId}.sendbird.com/?${params.toString()}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { origin: WORKVIVO_URL });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch (_) {}
      reject(new Error('Sendbird WS handshake timed out after 10s'));
    }, 10_000);

    ws.on('message', (raw) => {
      const text = raw.toString();
      if (!text.startsWith('LOGI')) return; // ignore other commands
      let body;
      try { body = JSON.parse(text.slice(4).replace(/\n$/, '')); }
      catch (e) { return reject(new Error('Bad LOGI body: ' + e.message)); }

      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch (_) {}

      if (body.error) {
        return reject(new Error(`Sendbird LOGI rejected: code=${body.code} ${body.message}`));
      }
      if (!body.key) {
        return reject(new Error('Sendbird LOGI returned no Session-Key'));
      }
      resolve({
        sessionKey: body.key,
        expiresIn:  body.expires_in,                  // ms (typically ~3600000)
        userId:     body.user_id || String(userId),
      });
    });

    ws.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('Sendbird WS error: ' + err.message));
    });
  });
}


/**
 * Read or refresh the Session-Key for a stored Workvivo config.
 * Caches in Firestore on the same doc; refreshes 5 min before expiry.
 */
async function ensureSessionKey(uid, config) {
  const now = Date.now();
  const cachedKey = config.sessionKey;
  const cachedExpiresAt = config.sessionKeyExpiresAt?.toMillis?.() ?? 0;
  // Refresh 5 min before actual expiry to avoid races
  if (cachedKey && cachedExpiresAt - 5 * 60 * 1000 > now) {
    return cachedKey;
  }
  logger.info(`ensureSessionKey: refreshing Session-Key for uid=${uid}`);
  const { sessionKey, expiresIn } = await fetchSendbirdSessionKey(
    config.accessToken,
    config.workvivoUserId,
    config.appId || SENDBIRD_APP_ID,
  );
  // Sendbird typically returns expires_in in MS; default to 50 min if missing
  const ttlMs = (typeof expiresIn === 'number' && expiresIn > 0) ? expiresIn : 50 * 60 * 1000;
  await configRef(uid).update({
    sessionKey,
    sessionKeyExpiresAt: new Date(now + ttlMs),
    sessionKeyRefreshedAt: FieldValue.serverTimestamp(),
  });
  return sessionKey;
}

async function sendbirdListChannels(userId, accessToken, sessionKey = null) {
  const r = await fetch(
    `${SENDBIRD_BASE}/users/${userId}/my_group_channels?limit=100&order=latest_last_message`,
    { headers: sendbirdHeaders(accessToken, sessionKey) },
  );
  const data = await r.json();
  return { status: r.status, channels: data.channels ?? [] };
}

async function sendbirdPost(channelUrl, userId, accessToken, text, sessionKey = null) {
  const r = await fetch(`${SENDBIRD_BASE}/group_channels/${channelUrl}/messages`, {
    method:  'POST',
    headers: sendbirdHeaders(accessToken, sessionKey),
    body:    JSON.stringify({ message_type: 'MESG', message: text, user_id: userId }),
  });
  return { status: r.status, data: await r.json() };
}

// ── Firestore helpers ─────────────────────────────────────────────────────────

function configRef(uid) {
  return db.collection('workvivo_config').doc(uid);
}

async function getActiveConfigForStore(storeNumber) {
  const snap = await db.collection('workvivo_config')
    .where('storeNumber', '==', String(storeNumber))
    .where('status', '==', 'active')
    .limit(1)
    .get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ── Auth middleware ───────────────────────────────────────────────────────────

async function verifyFirebaseUser(req) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw new Error('Missing Authorization header.');
  return getAuth().verifyIdToken(header.slice(7));
}

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── HTTP Endpoints ────────────────────────────────────────────────────────────

/**
 * POST /api/workvivo/connect
 * Body: { workvivoEmail, workvivoPassword }
 * Auth: Firebase ID token in Authorization header
 *
 * Validates Workvivo credentials, stores them encrypted, lists channels
 * so the user can pick their store's QRCallBox channel.
 */
export const workvivoConnect = onRequest(
  { region: REGION, secrets: [ENCRYPT_KEY] },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
      const user = await verifyFirebaseUser(req);
      const { workvivoEmail, workvivoPassword } = req.body;

      if (!workvivoEmail || !workvivoPassword) {
        return res.status(400).json({ error: 'workvivoEmail and workvivoPassword required.' });
      }

      // Get storeNumber from the user's QRCallBox profile
      const userDoc = await db.collection('users').doc(user.uid).get();
      const storeNumber = String(userDoc.data()?.storeNumber ?? '');
      if (!storeNumber) {
        return res.status(400).json({ error: 'No storeNumber on your account. Set your store first.' });
      }

      // Headless login to Workvivo
      const { accessToken, appId, workvivoUserId } = await workvivoLogin(workvivoEmail, workvivoPassword);

      // List Sendbird channels to find the store's QRCallBox channel
      const { status: sbStatus, channels } = await sendbirdListChannels(workvivoUserId, accessToken);
      if (sbStatus === 401) {
        return res.status(401).json({ error: 'Workvivo login succeeded but Sendbird auth failed. Check credentials.' });
      }

      // Auto-detect "{storeNumber} QRCallBox" channel
      const pattern = new RegExp(`${storeNumber}.*qrcallbox`, 'i');
      const detected = channels.find(ch => pattern.test(ch.name ?? ''));

      // Store encrypted credentials in Firestore
      const encryptedPass = encrypt(workvivoPassword, ENCRYPT_KEY.value());
      await configRef(user.uid).set({
        storeNumber,
        workvivoEmail,
        encryptedPass,
        channelUrl:     detected?.channel_url ?? null,
        channelName:    detected?.name ?? null,
        accessToken,
        appId:          appId ?? SENDBIRD_APP_ID,
        workvivoUserId: String(workvivoUserId ?? ''),
        connectedAt:    FieldValue.serverTimestamp(),
        tokenUpdatedAt: FieldValue.serverTimestamp(),
        status:         detected ? 'active' : 'needs_channel',
      }, { merge: false });

      logger.info(`Workvivo connected for user ${user.uid} at store ${storeNumber}`);

      return res.json({
        success:    true,
        detected:   detected ? { name: detected.name, url: detected.channel_url } : null,
        channels:   channels.map(ch => ({ name: ch.name, url: ch.channel_url, members: ch.member_count })),
        storeNumber,
        instruction: detected
          ? `Auto-connected to "${detected.name}".`
          : `No "${storeNumber} QRCallBox" channel found. Create it in Workvivo chat, then call /configure with the channel URL.`,
      });

    } catch (err) {
      logger.error('workvivoConnect error:', err.message);
      const isAuthErr = /credentials|password|401|auth/i.test(err.message);
      return res.status(isAuthErr ? 401 : 500).json({ error: err.message });
    }
  },
);

/**
 * POST /api/workvivo/connect-with-token
 * Body: { accessToken, workvivoUserId, appId? }
 * Auth: Firebase ID token
 *
 * SSO-friendly alternative to /connect. The user has signed into Workvivo in
 * a browser and pasted their Sendbird access_token + numeric user id (from
 * window.v2). We skip the headless login and store the token directly. No
 * password is ever stored — when this token expires, the user must repeat the
 * paste flow and we fire a re-auth email (see postToWorkvivo).
 */
export const connectWithToken = onRequest(
  { region: REGION, secrets: [ENCRYPT_KEY] },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
      const user = await verifyFirebaseUser(req);
      const { accessToken, workvivoUserId, appId } = req.body;

      if (!accessToken || !workvivoUserId) {
        return res.status(400).json({ error: 'accessToken and workvivoUserId required.' });
      }

      const userDoc = await db.collection('users').doc(user.uid).get();
      const storeNumber = String(userDoc.data()?.storeNumber ?? '');
      if (!storeNumber) {
        return res.status(400).json({ error: 'No storeNumber on your account. Set your store first.' });
      }

      // Workvivo's Sendbird tenant requires Session-Key, so we open a WS to
      // mint one. This both VALIDATES the access_token (failure → reject)
      // and lets us list channels successfully on the very next REST call.
      let sessionKey, sessionExpiresIn;
      try {
        const r = await fetchSendbirdSessionKey(accessToken, workvivoUserId, appId || SENDBIRD_APP_ID);
        sessionKey = r.sessionKey;
        sessionExpiresIn = r.expiresIn;
      } catch (err) {
        logger.warn(`connectWithToken: WS handshake failed: ${err.message}`);
        return res.status(401).json({ error: `Could not validate token via Sendbird: ${err.message}` });
      }

      // Now list channels with the fresh Session-Key
      const { status: sbStatus, channels } = await sendbirdListChannels(workvivoUserId, accessToken, sessionKey);
      if (sbStatus === 401) {
        return res.status(401).json({ error: 'Sendbird rejected this access token. It may already be expired — paste a fresh one.' });
      }
      if (sbStatus >= 400) {
        return res.status(502).json({ error: `Sendbird returned ${sbStatus} listing channels.` });
      }

      // Auto-detect "{storeNumber} QRCallBox" channel
      const pattern = new RegExp(`${storeNumber}.*qrcallbox`, 'i');
      const detected = channels.find(ch => pattern.test(ch.name ?? ''));

      // Store WITHOUT encryptedPass — postToWorkvivo will know this is SSO-token-only
      // and won't try to re-auth on 401 (just flips to needs_reauth + emails the user).
      // Cache the just-minted Session-Key too, so the first scan post can skip a WS.
      const sessionTtlMs = (typeof sessionExpiresIn === 'number' && sessionExpiresIn > 0)
        ? sessionExpiresIn : 50 * 60 * 1000;
      await configRef(user.uid).set({
        storeNumber,
        workvivoEmail:  user.email ?? null,
        encryptedPass:  null,
        channelUrl:     detected?.channel_url ?? null,
        channelName:    detected?.name ?? null,
        accessToken,
        appId:          appId ?? SENDBIRD_APP_ID,
        workvivoUserId: String(workvivoUserId),
        connectedAt:    FieldValue.serverTimestamp(),
        tokenUpdatedAt: FieldValue.serverTimestamp(),
        sessionKey,
        sessionKeyExpiresAt:    new Date(Date.now() + sessionTtlMs),
        sessionKeyRefreshedAt:  FieldValue.serverTimestamp(),
        status:         detected ? 'active' : 'needs_channel',
        authMode:       'sso-token',
      }, { merge: false });

      logger.info(`Workvivo connected (sso-token) for user ${user.uid} at store ${storeNumber}`);

      return res.json({
        success:    true,
        detected:   detected ? { name: detected.name, url: detected.channel_url } : null,
        channels:   channels.map(ch => ({ name: ch.name, url: ch.channel_url, members: ch.member_count })),
        storeNumber,
        instruction: detected
          ? `Auto-connected to "${detected.name}".`
          : `No "${storeNumber} QRCallBox" channel found. Pick a channel below.`,
      });

    } catch (err) {
      logger.error('connectWithToken error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  },
);


/**
 * POST /api/workvivo/configure
 * Body: { channelUrl, channelName }
 * Auth: Firebase ID token
 *
 * Sets or updates which Sendbird channel to post QR scan notifications into.
 */
export const workvivoConfig = onRequest(
  { region: REGION, secrets: [ENCRYPT_KEY] },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
      const user = await verifyFirebaseUser(req);
      const { channelUrl, channelName } = req.body;

      if (!channelUrl) return res.status(400).json({ error: 'channelUrl required.' });

      const doc = await configRef(user.uid).get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'No Workvivo connection found. Call /connect first.' });
      }

      await configRef(user.uid).update({
        channelUrl,
        channelName: channelName ?? channelUrl,
        status:      'active',
        updatedAt:   FieldValue.serverTimestamp(),
      });

      return res.json({ success: true, channelUrl, channelName });

    } catch (err) {
      logger.error('workvivoConfig error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  },
);

/**
 * POST /api/workvivo/disconnect
 * Auth: Firebase ID token
 *
 * Removes Workvivo config for the calling user.
 */
export const workvivoDisconnect = onRequest(
  { region: REGION },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    try {
      const user = await verifyFirebaseUser(req);
      await configRef(user.uid).delete();
      logger.info(`Workvivo disconnected for user ${user.uid}`);
      return res.json({ success: true });
    } catch (err) {
      logger.error('workvivoDisconnect error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  },
);

/**
 * GET /api/workvivo/check-completion
 * Auth: Firebase ID token
 *
 * Returns the user's current Workvivo connection status.
 */
export const workvivoCheckCompletion = onRequest(
  { region: REGION },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);

    try {
      const user = await verifyFirebaseUser(req);
      const doc  = await configRef(user.uid).get();

      if (!doc.exists) {
        return res.json({ connected: false });
      }

      const { status, channelName, channelUrl, storeNumber, workvivoEmail } = doc.data();
      return res.json({
        connected:   true,
        status,
        channelName,
        channelUrl,
        storeNumber,
        workvivoEmail,
        ready:       status === 'active' && !!channelUrl,
      });

    } catch (err) {
      logger.error('workvivoCheckCompletion error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  },
);

// ── Internal: called from scan handler in index.js ────────────────────────────

/**
 * Post a QR scan notification to the Workvivo / Sendbird channel for a store.
 * Finds any active Workvivo config for the store, refreshes credentials on 401.
 *
 * IMPORTANT: The calling Cloud Function MUST declare ENCRYPT_KEY in its secrets
 * option and pass ENCRYPT_KEY.value() as encryptKey.
 *
 * Example in index.js scan handler:
 *   import { postToWorkvivo, ENCRYPT_KEY as WV_KEY } from './workvivo-automation.js';
 *   export const s = onRequest({ secrets: [API_KEY, WV_KEY] }, async (req, res) => {
 *     // ... scan logic ...
 *     await postToWorkvivo(store, area, WV_KEY.value());
 *   });
 *
 * @param {string} storeNumber  - e.g. "1458"
 * @param {string} message      - Human-readable notification text
 * @param {string} encryptKey   - WORKVIVO_ENCRYPT_KEY.value() from calling function
 * @returns {Promise<boolean>}  - true if posted, false if no config / failed
 */
export async function postToWorkvivo(storeNumber, message, encryptKey, scanId = null) {
  const config = await getActiveConfigForStore(storeNumber);
  if (!config) {
    logger.info(`postToWorkvivo: no active Workvivo config for store ${storeNumber}`);
    return false;
  }

  const {
    id: uid,
    accessToken,
    channelUrl,
    workvivoUserId,
    encryptedPass,
    workvivoEmail,
    authMode,
  } = config;

  if (!channelUrl || !workvivoUserId) {
    logger.warn(`postToWorkvivo: config for store ${storeNumber} missing channelUrl or userId`);
    return false;
  }

  // Workvivo's Sendbird tenant rejects REST without a Session-Key. Get/refresh one.
  let sessionKey;
  try {
    sessionKey = await ensureSessionKey(uid, config);
  } catch (err) {
    logger.warn(`postToWorkvivo: WS handshake failed for store ${storeNumber}: ${err.message}`);
    await markNeedsReauthAndNotify(uid, storeNumber, config);
    return false;
  }

  // Post with both Access-Token and the fresh Session-Key
  let { status, data } = await sendbirdPost(channelUrl, workvivoUserId, accessToken, message, sessionKey);

  if (status === 401) {
    const isSsoTokenOnly = authMode === 'sso-token' || !encryptedPass;

    if (isSsoTokenOnly) {
      // SSO-only flow: we don't have the password, can't headless-login. Mark
      // for re-auth and notify the user once.
      logger.info(`postToWorkvivo: SSO token expired for store ${storeNumber}; flipping to needs_reauth`);
      await markNeedsReauthAndNotify(uid, storeNumber, config);
      return false;
    }

    logger.info(`postToWorkvivo: token expired for store ${storeNumber}, re-authenticating...`);
    try {
      if (!encryptKey) {
        logger.error('postToWorkvivo: encryptKey required to refresh token but was not provided');
        await markNeedsReauthAndNotify(uid, storeNumber, config);
        return false;
      }
      const password = decrypt(encryptedPass, encryptKey);
      const fresh = await workvivoLogin(workvivoEmail, password);

      await configRef(uid).update({
        accessToken:    fresh.accessToken,
        tokenUpdatedAt: FieldValue.serverTimestamp(),
        status:         'active',
      });

      // Retry post with fresh access token + freshly-minted Session-Key
      let freshSessionKey;
      try {
        const r = await fetchSendbirdSessionKey(fresh.accessToken, workvivoUserId, config.appId || SENDBIRD_APP_ID);
        freshSessionKey = r.sessionKey;
        const ttlMs = (typeof r.expiresIn === 'number' && r.expiresIn > 0) ? r.expiresIn : 50 * 60 * 1000;
        await configRef(uid).update({
          sessionKey: freshSessionKey,
          sessionKeyExpiresAt: new Date(Date.now() + ttlMs),
          sessionKeyRefreshedAt: FieldValue.serverTimestamp(),
        });
      } catch (e) {
        logger.warn(`postToWorkvivo: post-refresh WS handshake failed: ${e.message}`);
        await markNeedsReauthAndNotify(uid, storeNumber, config);
        return false;
      }
      ({ status, data } = await sendbirdPost(channelUrl, workvivoUserId, fresh.accessToken, message, freshSessionKey));
    } catch (refreshErr) {
      logger.error(`postToWorkvivo: re-auth failed for store ${storeNumber}:`, refreshErr.message);
      await markNeedsReauthAndNotify(uid, storeNumber, config);
      return false;
    }
  }

  if (status >= 200 && status < 300) {
    logger.info(`postToWorkvivo: posted to store ${storeNumber} channel, msg id: ${data?.message_id}`);
    // Schedule two reply-poll tasks: at +60s and +180s. The handler is
    // idempotent — once a claim is written, the second task no-ops.
    if (scanId && data?.message_id) {
      try {
        const queue   = getFunctions().taskQueue('pollWorkvivoReply');
        const payload = {
          scanId:     String(scanId),
          uid,
          channelUrl,
          messageId:  String(data.message_id),
          postedAt:   data.created_at || Date.now(),
        };
        await Promise.all([
          queue.enqueue(payload, { scheduleDelaySeconds: 60 }),
          queue.enqueue(payload, { scheduleDelaySeconds: 180 }),
        ]);
      } catch (e) {
        logger.warn(`postToWorkvivo: could not enqueue reply-poll tasks for scan ${scanId}: ${e.message}`);
      }
    }
    return true;
  }

  logger.error(`postToWorkvivo: Sendbird returned ${status}`, data);
  return false;
}


/**
 * Flip a store's config to `needs_reauth` and email the user — but only once
 * per re-auth cycle, so we don't spam them on every subsequent failed scan.
 */
async function markNeedsReauthAndNotify(uid, storeNumber, config) {
  // If already needs_reauth and a recent email was sent, skip.
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const lastSentMs = config.reauthEmailSentAt?.toMillis?.() ?? 0;
  const alreadyMarked = config.status === 'needs_reauth';
  const recentlyEmailed = lastSentMs && (Date.now() - lastSentMs < ONE_DAY_MS);

  await configRef(uid).update({
    status: 'needs_reauth',
    needsReauthAt: FieldValue.serverTimestamp(),
  });

  if (alreadyMarked && recentlyEmailed) {
    logger.info(`markNeedsReauthAndNotify: store ${storeNumber} already in needs_reauth + emailed within 24h, skipping`);
    return;
  }

  try {
    await sendReauthEmail({
      uid,
      storeNumber,
      toEmail:       config.workvivoEmail,
      channelName:   config.channelName,
    });
    await configRef(uid).update({
      reauthEmailSentAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.warn(`markNeedsReauthAndNotify: failed to send re-auth email for store ${storeNumber}: ${err.message}`);
  }
}


async function sendReauthEmail({ uid, storeNumber, toEmail, channelName }) {
  // Resolve a recipient address — workvivoEmail first, then the Firebase auth email.
  let recipient = toEmail;
  if (!recipient) {
    try {
      const u = await getAuth().getUser(uid);
      recipient = u.email;
    } catch (_) { /* ignore */ }
  }
  if (!recipient) {
    logger.warn(`sendReauthEmail: no recipient email for uid ${uid}; cannot notify`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    logger.warn('sendReauthEmail: RESEND_API_KEY not configured; skipping email');
    return;
  }
  const resend = new Resend(apiKey);

  // Sender uses the Resend-verified `qrcallbox.com` domain.
  const fromAddress = 'QRcallbox <noreply@qrcallbox.com>';

  const { data, error } = await resend.emails.send({
    from:    fromAddress,
    to:      recipient,
    subject: `Workvivo connection expired for store ${storeNumber}`,
    text:
      `Your Workvivo authentication token has expired, please re-enable:\n\n` +
      `Store ${storeNumber}` +
      (channelName ? `\nChannel: ${channelName}` : '') + `\n\n` +
      `To restore it:\n` +
      `  1. Open https://workvivo.walmart.com/chat in your browser and sign in.\n` +
      `  2. Go to https://qrcallbox.com -> Admin -> Workvivo.\n` +
      `  3. Click the "Sync Workvivo -> QRCallBox" bookmarklet (or use the paste-token form).\n\n` +
      `This usually happens every few weeks. We won't email you again about this until ` +
      `the connection is restored and breaks again.\n\n-- QRcallbox`,
    html:
      `<p><strong>Your Workvivo authentication token has expired, please re-enable:</strong></p>` +
      `<p>Store <strong>${storeNumber}</strong>` +
      (channelName ? `<br/>Channel: <code>${channelName}</code>` : '') +
      `</p>` +
      `<p><strong>To restore it:</strong></p>` +
      `<ol>` +
      `<li>Open <a href="https://workvivo.walmart.com/chat">workvivo.walmart.com/chat</a> in your browser and sign in.</li>` +
      `<li>Go to <a href="https://qrcallbox.com">qrcallbox.com</a> &rarr; Admin &rarr; Workvivo.</li>` +
      `<li>Click the <em>Sync Workvivo &rarr; QRCallBox</em> bookmarklet (or use the paste-token form).</li>` +
      `</ol>` +
      `<p>This usually happens every few weeks. We won't email you again about this until ` +
      `the connection is restored and breaks again.</p>` +
      `<p>&mdash; QRcallbox</p>`,
  });

  if (error) {
    logger.error(
      `sendReauthEmail: Resend rejected — name=${error.name} message=${error.message} statusCode=${error.statusCode}`,
    );
    throw new Error(`Resend: ${error.message || error.name || 'unknown error'}`);
  }
  logger.info(`sendReauthEmail: sent to ${recipient} for uid ${uid}, store ${storeNumber}, id=${data?.id}`);
}


/**
 * POST /api/workvivo/test-reauth-email
 * Body: { storeNumber, recipient? }
 * Auth: Firebase ID token (admin only — sinaptick@gmail.com)
 *
 * Force-sends the re-auth email so we can verify the SendGrid pipeline
 * end-to-end without waiting for a real token expiry.
 *   - storeNumber: required; used in the email body
 *   - recipient:   optional; overrides the stored workvivoEmail for the test.
 *                  If omitted, falls back to the store's stored workvivoEmail,
 *                  then to the caller's Firebase auth email.
 */
export const testReauthEmail = onRequest(
  { region: REGION, secrets: [RESEND_KEY] },
  async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    if (req.method !== 'POST')    return res.status(405).json({ error: 'POST only' });

    try {
      const user = await verifyFirebaseUser(req);
      if (user.email !== 'sinaptick@gmail.com') {
        return res.status(403).json({ error: 'Admin only' });
      }

      const { storeNumber, recipient } = req.body || {};
      if (!storeNumber) return res.status(400).json({ error: 'storeNumber required' });

      // Try to find a real config for this store (for channelName context)
      const snap = await db.collection('workvivo_config')
        .where('storeNumber', '==', String(storeNumber))
        .limit(1).get();
      const config = snap.empty ? null : snap.docs[0].data();
      const uid    = snap.empty ? user.uid : snap.docs[0].id;
      const toEmail = recipient || config?.workvivoEmail || user.email;

      logger.info(`testReauthEmail: store=${storeNumber} → ${toEmail}`);
      await sendReauthEmail({
        uid,
        storeNumber: String(storeNumber),
        toEmail,
        channelName: config?.channelName ?? `[test for store ${storeNumber}]`,
      });

      return res.json({
        success:    true,
        sentTo:     toEmail,
        storeNumber: String(storeNumber),
        configFound: !snap.empty,
        channelName: config?.channelName ?? null,
      });
    } catch (err) {
      logger.error('testReauthEmail error:', err);
      return res.status(500).json({ error: err.message });
    }
  },
);


/**
 * Task-dispatched reply poller. Enqueued by postToWorkvivo at +60s and +180s
 * after a successful post. Each task fires once for one scan:
 *
 *   - Reads the scan doc; if `workvivoClaim` already set → no-op (idempotent)
 *   - Otherwise polls Sendbird once for replies + reactions newer than postedAt
 *   - First interaction (sorted by ts) wins → writes `workvivoClaim` to the scan
 */
export const pollWorkvivoReply = onTaskDispatched(
  { region: REGION, retryConfig: { maxAttempts: 1 }, rateLimits: { maxConcurrentDispatches: 20 } },
  async (req) => {
    const { scanId, uid, channelUrl, messageId, postedAt } = req.data || {};
    if (!scanId || !uid || !channelUrl || !messageId) {
      logger.warn('pollWorkvivoReply: missing fields', { scanId, uid, channelUrl, messageId });
      return;
    }

    // Idempotency: if a claim is already recorded, skip.
    const scanRef = db.collection('scans').doc(scanId);
    const scanSnap = await scanRef.get();
    if (scanSnap.exists && scanSnap.data().workvivoClaim) {
      logger.info(`pollWorkvivoReply: scan ${scanId} already has workvivoClaim; skipping`);
      return;
    }

    const configSnap = await configRef(uid).get();
    if (!configSnap.exists) {
      logger.warn(`pollWorkvivoReply: config missing for uid ${uid}; dropping scan ${scanId}`);
      return;
    }
    const config = configSnap.data();
    const sessionKey = await ensureSessionKey(uid, config);

    const claim = await findFirstWorkvivoClaim({
      channelUrl,
      messageId,
      postedAt:   Number(postedAt) || 0,
      accessToken: config.accessToken,
      sessionKey,
    });

    if (!claim) {
      logger.info(`pollWorkvivoReply: no claim yet for scan ${scanId}`);
      return;
    }

    await scanRef.set({
      workvivoClaim: {
        type:     claim.type,
        nickname: claim.nickname || null,
        at:       new Date(claim.timestamp),
        text:     claim.text || null,
        emoji:    claim.emoji || null,
      },
    }, { merge: true });
    logger.info(`pollWorkvivoReply: scan ${scanId} claimed by ${claim.nickname || claim.senderId} (${claim.type})`);
  },
);


/**
 * Helper used by the poller. Returns the earliest reply/reaction (or null).
 * Replies come with sender nickname inline; reactions need a per-user lookup.
 */
async function findFirstWorkvivoClaim({ channelUrl, messageId, postedAt, accessToken, sessionKey }) {
  // 1. Channel messages newer than our post (next-direction relative to our message_ts)
  const msgsUrl = `${SENDBIRD_BASE}/group_channels/${channelUrl}/messages` +
    `?message_ts=${postedAt}&prev_limit=0&next_limit=20&include_reactions=true`;
  const msgsRes = await fetch(msgsUrl, { headers: sendbirdHeaders(accessToken, sessionKey) });
  const msgsData = await msgsRes.json();
  if (msgsRes.status >= 400) {
    throw new Error(`Sendbird ${msgsRes.status} fetching messages: ${msgsData?.message || ''}`);
  }

  const candidates = [];
  for (const m of (msgsData.messages || [])) {
    if (String(m.message_id) === String(messageId)) continue; // skip our own bot post
    if ((m.created_at || 0) <= postedAt) continue;
    candidates.push({
      type:      'reply',
      timestamp: m.created_at,
      senderId:  String(m.user?.user_id ?? ''),
      nickname:  m.user?.nickname ?? null,
      text:      typeof m.message === 'string' ? m.message.slice(0, 500) : null,
    });
  }

  // 2. Reactions on our specific message
  const ourMsgUrl = `${SENDBIRD_BASE}/group_channels/${channelUrl}/messages/${messageId}` +
    `?include_reactions=true`;
  const ourMsgRes = await fetch(ourMsgUrl, { headers: sendbirdHeaders(accessToken, sessionKey) });
  if (ourMsgRes.status < 400) {
    const ourMsgData = await ourMsgRes.json();
    for (const r of (ourMsgData.reactions || [])) {
      // Sendbird returns parallel arrays user_ids[] and updated_at[] in some shapes
      const userIds = r.user_ids || [];
      const updates = r.updated_at;
      const single  = (typeof updates === 'number') ? updates : null;
      userIds.forEach((uid, i) => {
        const ts = Array.isArray(updates) ? updates[i] : (single ?? r.created_at ?? 0);
        if (!ts || ts <= postedAt) return;
        candidates.push({
          type:      'reaction',
          timestamp: ts,
          senderId:  String(uid),
          nickname:  null,             // resolved below if it's the winner
          emoji:     r.key || '👍',
        });
      });
    }
  }

  if (candidates.length === 0) return null;

  // Earliest wins
  candidates.sort((a, b) => a.timestamp - b.timestamp);
  const winner = candidates[0];

  // If the winner is a reaction, look up nickname via the channel members
  if (winner.type === 'reaction' && !winner.nickname && winner.senderId) {
    try {
      const membersUrl = `${SENDBIRD_BASE}/group_channels/${channelUrl}/members?user_ids=${winner.senderId}`;
      const r = await fetch(membersUrl, { headers: sendbirdHeaders(accessToken, sessionKey) });
      if (r.status < 400) {
        const data = await r.json();
        winner.nickname = data?.members?.[0]?.nickname || null;
      }
    } catch (_) { /* nickname is best-effort */ }
  }
  return winner;
}


/**
 * Scheduled health check — runs every 6h.
 *
 * For every workvivo_config doc in `active` status, attempt the Sendbird WS
 * handshake. If it fails (typically because the access_token expired), flip
 * status to needs_reauth and email the user proactively — so they're warned
 * before the next QR scan would have failed silently.
 *
 * Updates the cached sessionKey + sessionKeyExpiresAt opportunistically when
 * the handshake succeeds, keeping the post path warm.
 */
export const checkWorkvivoTokens = onSchedule(
  { schedule: 'every 6 hours', region: REGION, timeoutSeconds: 540, secrets: [RESEND_KEY] },
  async () => {
    const snap = await db.collection('workvivo_config')
      .where('status', '==', 'active')
      .get();

    logger.info(`checkWorkvivoTokens: ${snap.size} active config(s) to verify`);

    const results = { ok: 0, expired: 0, errored: 0 };
    for (const doc of snap.docs) {
      const uid = doc.id;
      const config = doc.data();
      const { accessToken, workvivoUserId, appId, storeNumber } = config;

      if (!accessToken || !workvivoUserId) {
        logger.warn(`checkWorkvivoTokens: skipping uid=${uid} — missing token or userId`);
        continue;
      }

      try {
        const r = await fetchSendbirdSessionKey(
          accessToken,
          workvivoUserId,
          appId || SENDBIRD_APP_ID,
        );
        // Refresh the cached Session-Key while we're here
        const ttlMs = (typeof r.expiresIn === 'number' && r.expiresIn > 0) ? r.expiresIn : 50 * 60 * 1000;
        await configRef(uid).update({
          sessionKey:            r.sessionKey,
          sessionKeyExpiresAt:   new Date(Date.now() + ttlMs),
          sessionKeyRefreshedAt: FieldValue.serverTimestamp(),
          lastHealthCheckAt:     FieldValue.serverTimestamp(),
          lastHealthCheckResult: 'ok',
        });
        results.ok++;
      } catch (err) {
        logger.warn(`checkWorkvivoTokens: handshake failed for store ${storeNumber} (uid=${uid}): ${err.message}`);
        const isAuthError = /Invalid|expired|access[_ -]?token|user is not found|400201|400304|400111/i.test(err.message);
        if (isAuthError) {
          await markNeedsReauthAndNotify(uid, storeNumber, config);
          results.expired++;
        } else {
          await configRef(uid).update({
            lastHealthCheckAt:     FieldValue.serverTimestamp(),
            lastHealthCheckResult: `error: ${err.message.slice(0, 140)}`,
          });
          results.errored++;
        }
      }
    }

    logger.info(`checkWorkvivoTokens complete: ok=${results.ok} expired=${results.expired} errored=${results.errored}`);
  },
);
