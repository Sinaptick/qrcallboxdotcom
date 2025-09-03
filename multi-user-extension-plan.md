# Multi-User Chrome Extension Plan

## Current Status
- Single-user Chrome extension working for store 1458
- Extension successfully posts QR messages to Workvivo chat
- Uses VM server at 34.45.52.250:5002 for message queuing

## Multi-User Architecture Plan

### 1. Hosting Changes
**Move from VM to Cloud Run:**
- Host webhook service on Google Cloud Run instead of VM
- Use Firestore for persistent message storage (instead of Python list)
- Benefits: Auto-scaling, global availability, no VM maintenance
- Cost: ~$0.02/hour when active vs 24/7 VM costs

### 2. User Identification Strategy
**Option 1: Store-Based Assignment (Recommended)**
```javascript
// Extension setup - one time per computer
const STORE_ID = '1458'; // User enters once
const USER_ROLE = 'manager'; // or 'associate' 
const USER_ID = `${STORE_ID}_${USER_ROLE}`;
chrome.storage.local.set({userId: USER_ID});
```

**Option 2: Simple Extension Login**
- Extension popup with store number + name/role form
- Store credentials in Chrome storage

**Option 3: Auto-detect from Workvivo**
```javascript
function detectUser() {
  const userElement = document.querySelector('[data-testid="user-name"]');
  const userName = userElement?.textContent;
  const storeMatch = window.location.href.match(/groups\/(\d+)/);
  return `${storeMatch[1]}_${userName}`.replace(/\s+/g, '_');
}
```

### 3. Code Changes Required

**Firebase Function Update:**
```javascript
// Instead of single endpoint
await fetch(`https://webhook-service.run.app/webhook/${storeId}_${userId}`, {
  method: 'POST', 
  body: JSON.stringify({text: message, store: storeId, user: userId})
});
```

**Webhook Service (Cloud Run):**
```python
@app.route('/webhook/<user_id>', methods=['POST'])
def webhook(user_id):
    # Store message for specific user in Firestore
    message = {
        'id': str(uuid.uuid4()),
        'text': data.get('text'),
        'user_id': user_id,
        'timestamp': datetime.now().isoformat(), 
        'posted': False
    }
    firestore_client.collection('pending_messages').add(message)

@app.route('/get_pending/<user_id>')
def get_pending(user_id):
    # Return messages only for this user
    messages = firestore_client.collection('pending_messages')\
        .where('user_id', '==', user_id)\
        .where('posted', '==', False).get()
    return jsonify({'messages': [msg.to_dict() for msg in messages]})
```

**Extension Changes:**
```javascript
// Background script gets user-specific messages
const userId = await chrome.storage.local.get(['userId']);
const response = await fetch(`https://webhook-service.run.app/get_pending/${userId}`);
```

### 4. Implementation Effort
**Estimated: 4-6 hours**
- Extension user ID setup: 1-2 hours
- Cloud Run deployment: 1-2 hours  
- Firestore integration: 2 hours
- Testing: 1 hour

### 5. Deployment Strategy
1. Deploy webhook service to Cloud Run
2. Update Firebase function to use new endpoints
3. Add user setup to Chrome extension
4. Distribute configured extensions to each store
5. Each store does one-time setup (enter store ID)

### 6. Benefits vs Current Single-User
- ✅ Scales to unlimited users/stores
- ✅ No VM maintenance or resource constraints
- ✅ Global availability and auto-scaling
- ✅ Persistent message storage
- ✅ Each user runs extension on their own machine
- ✅ Much cheaper than running multiple VMs

### 7. Current Working Files
- Extension: `/Users/shanesmith/Desktop/bot/`
- Flask server: `/Users/shanesmith/Documents/qrcall/vivopost_extension.py`
- Firebase function: `/Users/shanesmith/Documents/qrcall/functions/index.js` (lines 2290-2335)

**Next Steps When Ready:**
1. Choose user identification strategy (recommend Option 1)
2. Set up Cloud Run project
3. Modify extension for multi-user support
4. Deploy and test with multiple stores