# Quick Setup: Apple Watch App (5 Minutes)

## Current Status
✅ All watch app code is written and ready in `ios/QRCallWatch/`
⚠️ Need to recreate the watchOS target in Xcode GUI (fixes build bug)

---

## Follow These Steps in Xcode:

### Step 1: Delete Current Target (30 seconds)
1. In the left sidebar, click the **Runner** project (blue icon at top)
2. In the main area, you'll see **TARGETS** list
3. Click **QRCallWatch** in the targets list
4. Press **Delete** key on keyboard
5. Click **Move to Trash**

### Step 2: Create New watchOS Target (1 minute)
1. Click **File** menu → **New** → **Target**
2. In the dialog, click **watchOS** tab at the top
3. Scroll down and select **Watch App**
4. Click **Next** button

### Step 3: Configure Target (30 seconds)
**Fill in these fields:**
- Product Name: `QRCallWatch`
- Team: (Select your team or leave as-is)
- Organization Identifier: `com.stable.qrcallbox`
- Bundle Identifier: Should auto-fill as `com.stable.qrcallbox.QRCallWatch`
- Interface: **SwiftUI** (should be selected)
- Language: **Swift** (should be selected)

**IMPORTANT:** Uncheck these two boxes:
- ❌ **Include Notification Scene**
- ❌ **Include Complication**

Click **Finish**

When asked "Activate QRCallWatch scheme?" → Click **Activate**

### Step 4: Delete Generated Files (30 seconds)
Xcode created template files we don't need.

1. In left sidebar, find the **QRCallWatch** folder (yellow folder icon)
2. **Right-click** on it
3. Select **Delete**
4. Choose **Move to Trash** (NOT "Remove Reference")

### Step 5: Add Our Prepared Files (1 minute)
1. **Right-click** on the **Runner** project (blue icon at top of sidebar)
2. Select **Add Files to "Runner"...**
3. Navigate to: `ios/QRCallWatch` folder
4. **Click** the `QRCallWatch` **folder** to select it
5. In the dialog, make sure:
   - ✅ **Copy items if needed** is CHECKED
   - ✅ **Create groups** is selected (not "Create folder references")
   - ✅ Under "Add to targets": Check **only QRCallWatch** box
6. Click **Add**

You should now see all our files in the sidebar:
- QRCallWatchApp.swift
- ContentView.swift
- WatchConnectivityManager.swift
- WatchDataManager.swift
- ScanRequest.swift
- Info.plist
- Assets.xcassets

### Step 6: Configure Info.plist (30 seconds)
1. In the sidebar, click **QRCallWatch** target (under TARGETS)
2. Click **Build Settings** tab at the top
3. In the search box, type: `Info.plist`
4. Find **"Packaging"** section → **"Info.plist File"**
5. Double-click the value and change it to: `QRCallWatch/Info.plist`

### Step 7: Remove Info.plist from Resources (30 seconds)
1. Make sure **QRCallWatch** target is still selected
2. Click **Build Phases** tab
3. Expand **"Copy Bundle Resources"** section
4. Look for `Info.plist` in the list
5. If you see it, **select it** and press **Delete** key
6. Confirm removal

### Step 8: Install Pods (30 seconds)
1. In Xcode menu: **Xcode** → **Quit Xcode** (or press Cmd+Q)
2. In Terminal, run:
```bash
cd /Users/shanesmith/Documents/qrcall/apple/ios
pod install
```
3. Wait for it to complete
4. Open the workspace:
```bash
open Runner.xcworkspace
```

### Step 9: Build & Run! (30 seconds)
1. At the top-left of Xcode, click the **scheme dropdown** (should say "Runner")
2. Select **QRCallWatch**
3. Click the **device dropdown** next to it
4. Select **Apple Watch Series 10 (46mm)**
5. Click the **Play button** (▶) or press **Cmd+R**

The watch simulator should launch and show your QRCall Watch app!

---

## 🎉 What You'll See

The watch app will show:
- **Requests tab**: List of pending customer assistance requests
- **Settings tab**: Connection status and user info
- **Interactive UI**: Tap requests to see details and assist

Since it's not connected to Firebase yet, it will show "Not Signed In" - but the UI and navigation will work perfectly!

---

## ⏱️ Total Time: ~5 minutes

Most of the time is just clicking through dialogs. The app is fully written and ready to go!

---

**Need help?** The detailed guide is in `WATCH_INTEGRATION_COMPLETE.md`
