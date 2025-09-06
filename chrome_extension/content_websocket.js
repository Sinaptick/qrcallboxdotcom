// Content script with WebSocket support - no more polling!
console.log('QRCall Workvivo Bot (WebSocket Version) loaded');

// Check if we're on the right page
if (window.location.href.includes('1458-customer-calls')) {
  console.log('✅ On Store 1458 chat page - Connecting to WebSocket...');
  
  // Load Socket.IO library
  loadSocketIO().then(() => {
    connectWebSocket();
  });
} else {
  console.log('❌ Not on Store 1458 page - Bot inactive');
}

function loadSocketIO() {
  return new Promise((resolve) => {
    // Check if already loaded
    if (typeof io !== 'undefined') {
      resolve();
      return;
    }
    
    // Inject Socket.IO client library
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

function connectWebSocket() {
  // Connect to Flask WebSocket server
  const socket = io('http://34.45.52.250:5002', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000
  });
  
  // Connection established
  socket.on('connect', () => {
    console.log('🔌 Connected to WebSocket server');
    showNotification('Connected to QRCall Bot Server', 'success');
  });
  
  // Receive new message from server (instant push!)
  socket.on('new_message', async (message) => {
    console.log('📩 New message received:', message.text);
    showNotification(`New message: ${message.text.substring(0, 50)}...`, 'info');
    
    // Post the message to Workvivo
    const success = await postMessage(message.text);
    
    if (success) {
      // Confirm to server that message was posted
      socket.emit('message_posted', { id: message.id });
      showNotification('Message posted successfully', 'success');
    } else {
      showNotification('Failed to post message', 'error');
    }
  });
  
  // Connection lost
  socket.on('disconnect', () => {
    console.log('❌ Disconnected from WebSocket server');
    showNotification('Disconnected from server - will reconnect...', 'warning');
  });
  
  // Reconnection attempt
  socket.on('reconnect_attempt', (attempt) => {
    console.log(`🔄 Reconnection attempt ${attempt}`);
  });
  
  // Reconnected
  socket.on('reconnect', () => {
    console.log('✅ Reconnected to WebSocket server');
    showNotification('Reconnected to server', 'success');
  });
  
  // Error handling
  socket.on('error', (error) => {
    console.error('WebSocket error:', error);
    showNotification('Connection error', 'error');
  });
}

async function postMessage(text) {
  try {
    // Find message input (try multiple selectors)
    const selectors = [
      'div[contenteditable="true"]',
      '#chat-markdown-editor div[contenteditable="true"]',
      '[role="textbox"]',
      'textarea',
      '.message-input',
      '.chat-input'
    ];
    
    let messageInput = null;
    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const elem of elements) {
        if (elem.offsetParent !== null && !elem.disabled) {
          messageInput = elem;
          break;
        }
      }
      if (messageInput) break;
    }
    
    if (!messageInput) {
      console.error('Could not find message input');
      showNotification('Could not find message input box', 'error');
      return false;
    }
    
    console.log('Found input element:', messageInput);
    
    // Click to focus
    messageInput.click();
    await sleep(300);
    
    // Clear and type message
    messageInput.focus();
    
    // Try different methods to set text
    if (messageInput.tagName === 'DIV') {
      // Contenteditable div
      messageInput.innerHTML = '';
      await sleep(100);
      messageInput.textContent = text;
      
      // Trigger input events
      messageInput.dispatchEvent(new Event('input', {bubbles: true}));
      messageInput.dispatchEvent(new InputEvent('input', {
        data: text,
        bubbles: true,
        cancelable: true
      }));
    } else {
      // Textarea or input
      messageInput.value = '';
      await sleep(100);
      messageInput.value = text;
      
      // Trigger events
      messageInput.dispatchEvent(new Event('input', {bubbles: true}));
      messageInput.dispatchEvent(new Event('change', {bubbles: true}));
    }
    
    await sleep(500);
    
    // Find and click send button
    const sendSelectors = [
      'button[type="submit"]',
      '.send-button',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button:has(svg)',  // Button with icon
      '[data-testid="send-button"]'
    ];
    
    let sendButton = null;
    for (const selector of sendSelectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
          if (btn.offsetParent !== null && !btn.disabled) {
            // Check if it's likely a send button
            const text = btn.textContent.toLowerCase();
            const aria = btn.getAttribute('aria-label')?.toLowerCase() || '';
            if (text.includes('send') || aria.includes('send') || btn.querySelector('svg')) {
              sendButton = btn;
              break;
            }
          }
        }
      } catch (e) {
        // Ignore selector errors
      }
      if (sendButton) break;
    }
    
    if (sendButton) {
      console.log('Found send button, clicking...');
      sendButton.click();
    } else {
      // Try pressing Enter as fallback
      console.log('No send button found, trying Enter key...');
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      });
      messageInput.dispatchEvent(enterEvent);
    }
    
    console.log('✅ Posted message:', text);
    await sleep(1000);
    return true;
    
  } catch (error) {
    console.error('Error posting message:', error);
    showNotification(`Error: ${error.message}`, 'error');
    return false;
  }
}

function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    border-radius: 5px;
    font-family: Arial, sans-serif;
    font-size: 14px;
    z-index: 10000;
    transition: opacity 0.3s;
    max-width: 300px;
  `;
  
  // Style based on type
  const colors = {
    success: '#4caf50',
    error: '#f44336',
    warning: '#ff9800',
    info: '#2196f3'
  };
  
  notification.style.backgroundColor = colors[type] || colors.info;
  notification.style.color = 'white';
  notification.textContent = message;
  
  document.body.appendChild(notification);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Add visual indicator that bot is active
const indicator = document.createElement('div');
indicator.style.cssText = `
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: #4caf50;
  color: white;
  padding: 8px 15px;
  border-radius: 20px;
  font-size: 12px;
  z-index: 9999;
  font-family: Arial, sans-serif;
`;
indicator.textContent = '🤖 QRCall Bot Active (WebSocket)';
document.body.appendChild(indicator);