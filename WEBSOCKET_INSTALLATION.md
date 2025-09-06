# Workvivo WebSocket Bot Installation Guide

## Overview
This guide will help you upgrade from the polling-based bot to the new WebSocket-based bot that eliminates VM lag by using instant push notifications instead of constant polling.

## Benefits of WebSocket Version
- ✅ **No more polling** - Eliminates GET requests every 5 seconds
- ✅ **Instant message delivery** - Messages pushed immediately when received
- ✅ **Reduced VM load** - No constant checking, VM stays idle
- ✅ **Better reliability** - Automatic reconnection if connection drops
- ✅ **Visual feedback** - Shows connection status in browser

## Installation Steps

### Part 1: Install Python Dependencies on VM

1. **Connect to your Windows VM**

2. **Navigate to bot directory:**
```bash
cd /path/to/workvivo/bot
```

3. **Activate virtual environment:**
```bash
source venv/bin/activate
```

4. **Install new dependencies:**
```bash
pip install flask-socketio python-socketio eventlet
```

5. **Copy new server file:**
   - Transfer `vivopost_websocket.py` to your VM
   - Place it in the same directory as the old `vivopost_extension.py`

### Part 2: Update Chrome Extension

1. **On your local machine (where Chrome is installed):**

2. **Remove old extension:**
   - Open Chrome
   - Go to `chrome://extensions/`
   - Find "QRCall Workvivo Bot" (old version)
   - Click "Remove"

3. **Load new WebSocket version:**
   - Make sure Developer Mode is ON (toggle in top right)
   - Click "Load unpacked"
   - Navigate to the `chrome_extension` folder with updated files
   - Select the folder and click "Select"

4. **Verify installation:**
   - You should see "QRCall Workvivo Bot (WebSocket) v2.0"
   - Make sure it's enabled

### Part 3: Start the New Server

1. **Stop the old bot (if running):**
   - Press Ctrl+C in the terminal running `vivopost_extension.py`

2. **Start the new WebSocket server:**
```bash
source venv/bin/activate
python3 vivopost_websocket.py
```

3. **You should see:**
```
============================================================
🔔 QRCall Workvivo Bot Server (WebSocket Version)
============================================================
✨ NEW: Using WebSockets - No more polling!
📊 Dashboard: http://34.45.52.250:5002
🔌 WebSocket: ws://34.45.52.250:5002
🔗 Install updated Chrome extension from chrome_extension/ folder
============================================================
📝 Logs:
------------------------------------------------------------
```

### Part 4: Test the Connection

1. **Open Workvivo in Chrome:**
   - Navigate to: https://walmart.workvivo.com/
   - Go to the Store 1458 customer calls chat

2. **Look for indicators:**
   - Green indicator in bottom right: "🤖 QRCall Bot Active (WebSocket)"
   - Notification popup: "Connected to QRCall Bot Server"
   - Check server logs for: "✅ Chrome extension connected"

3. **Test a message:**
   - Open dashboard: http://34.45.52.250:5002
   - Click "Test Webhook" or send a real QR scan
   - Message should appear instantly in Workvivo chat

## Troubleshooting

### Extension Not Connecting
- **Check firewall:** Port 5002 must be open on VM
- **Verify URL:** Extension uses `http://34.45.52.250:5002`
- **Check console:** Right-click page → Inspect → Console tab for errors

### Messages Not Posting
- **Verify selectors:** Workvivo may have changed their HTML
- **Check permissions:** Extension needs access to walmart.workvivo.com
- **Manual test:** Try posting a message manually first

### Server Crashes
- **Check logs:** Look for Python errors in terminal
- **Memory issues:** Restart VM if needed
- **Dependencies:** Ensure all pip packages installed correctly

## Monitoring

### Server Dashboard
Visit: http://34.45.52.250:5002
- Shows connected clients count
- Lists pending/posted messages
- Auto-refreshes every 5 seconds

### Server Logs
The terminal shows:
- 📩 New messages received
- ✅ Client connections
- 🚀 Messages pushed to clients
- ❌ Disconnections

### Chrome Console
Press F12 in Chrome to see:
- 🔌 WebSocket connection status
- 📩 Messages received
- ✅ Messages posted

## Rollback (if needed)

If you need to go back to the old version:

1. **Stop WebSocket server:**
   - Press Ctrl+C

2. **Start old server:**
```bash
source venv/bin/activate
python3 vivopost_extension.py
```

3. **Revert Chrome extension:**
   - In manifest.json, change:
     - `"js": ["content_websocket.js"]` back to `"js": ["content.js"]`
   - Reload extension in Chrome

## Performance Comparison

| Metric | Old (Polling) | New (WebSocket) |
|--------|--------------|-----------------|
| GET requests/hour | 720 | 0 |
| Message delay | 0-5 seconds | Instant |
| CPU usage | Constant | Minimal |
| Network traffic | High | Low |
| VM performance | Laggy | Smooth |

## Support

If you encounter issues:
1. Check server logs for errors
2. Check Chrome console (F12) for JavaScript errors
3. Verify network connectivity between Chrome and VM
4. Ensure all dependencies are installed

---

Last Updated: September 2025
Version: 2.0 (WebSocket)