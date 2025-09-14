// Content script with WebSocket support - Memory optimized version
console.log('QRCall Workvivo Bot (Optimized) loaded');

// Configuration
const CONFIG = {
  SERVER_URL: 'http://34.45.52.250:5002',
  MAX_RECONNECT_ATTEMPTS: 10,
  RECONNECT_DELAY_BASE: 1000,
  RECONNECT_DELAY_MAX: 30000,
  MESSAGE_TIMEOUT: 10000,
  HEALTH_CHECK_INTERVAL: 300000, // 5 minutes
  MAX_NOTIFICATIONS: 5,
  CLEANUP_INTERVAL: 60000 // 1 minute
};

// Global state
let socket = null;
let reconnectAttempts = 0;
let reconnectTimeout = null;
let healthCheckInterval = null;
let notifications = [];
let indicator = null;
let socketIOLoaded = false;
let isCleaningUp = false;

// Check if we're on the right page
if (!window.location.href.includes('1458-customer-calls')) {
  console.log('Not on Store 1458 page - Bot inactive');
} else {
  console.log('✅ On Store 1458 chat page - Initializing...');
  initialize();
}

function initialize() {
  // Clean up any existing instance
  cleanup();
  
  // Load Socket.IO and connect
  loadSocketIO().then(() => {
    connectWebSocket();
    setupHealthCheck();
    setupCleanupInterval();
    createIndicator();
  }).catch(err => {
    console.error('Failed to initialize:', err);
    showNotification('Failed to initialize bot', 'error');
  });
}

function loadSocketIO() {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof io !== 'undefined') {
      socketIOLoaded = true;
      resolve();
      return;
    }
    
    // Clean up any existing script tags
    const existingScripts = document.querySelectorAll('script[src*="socket.io"]');
    existingScripts.forEach(script => script.remove());
    
    // Inject Socket.IO client library
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.5.4/socket.io.min.js';
    script.onload = () => {
      socketIOLoaded = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function connectWebSocket() {
  try {
    // Clean up existing connection
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    
    // Create new connection with optimized settings
    socket = io(CONFIG.SERVER_URL, {
      transports: ['websocket'],  // Prefer websocket over polling
      reconnection: false,  // We'll handle reconnection manually
      timeout: 20000,
      forceNew: true
    });
    
    // Connection established
    socket.on('connect', () => {
      console.log('🔌 Connected to WebSocket server');
      reconnectAttempts = 0;
      clearTimeout(reconnectTimeout);
      updateIndicator('connected');
      showNotification('Connected to QRCall Bot Server', 'success');
    });
    
    // Receive new message from server
    socket.on('new_message', async (message) => {
      console.log('📩 New message received:', message.text?.substring(0, 50));
      
      // Prevent duplicate processing
      if (message.processed) return;
      message.processed = true;
      
      showNotification(`New: ${message.text?.substring(0, 50)}...`, 'info');
      
      // Post with timeout
      const success = await postMessageWithTimeout(message.text, CONFIG.MESSAGE_TIMEOUT);
      
      if (success) {
        socket.emit('message_posted', { id: message.id });
        showNotification('Message posted', 'success');
      } else {
        showNotification('Failed to post message', 'error');
      }
    });
    
    // Connection lost
    socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected:', reason);
      updateIndicator('disconnected');
      
      // Handle reconnection based on reason
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - reconnect
        handleReconnect();
      } else if (reason === 'io client disconnect') {
        // Client initiated - don't reconnect
        console.log('Client initiated disconnect');
      } else {
        // Network issue - attempt reconnect
        handleReconnect();
      }
    });
    
    // Error handling
    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      updateIndicator('error');
    });
    
    // Connection error
    socket.on('connect_error', (error) => {
      console.error('Connection error:', error.message);
      updateIndicator('error');
      handleReconnect();
    });
    
  } catch (error) {
    console.error('Failed to connect:', error);
    handleReconnect();
  }
}

function handleReconnect() {
  // Clear any existing timeout
  clearTimeout(reconnectTimeout);
  
  // Check if we should reconnect
  if (reconnectAttempts >= CONFIG.MAX_RECONNECT_ATTEMPTS) {
    console.error('Max reconnection attempts reached');
    showNotification('Connection failed - please refresh page', 'error');
    updateIndicator('failed');
    return;
  }
  
  // Calculate delay with exponential backoff
  const delay = Math.min(
    CONFIG.RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts),
    CONFIG.RECONNECT_DELAY_MAX
  );
  
  reconnectAttempts++;
  console.log(`Reconnecting in ${delay/1000}s (attempt ${reconnectAttempts}/${CONFIG.MAX_RECONNECT_ATTEMPTS})`);
  
  reconnectTimeout = setTimeout(() => {
    if (!isCleaningUp) {
      connectWebSocket();
    }
  }, delay);
}

async function postMessageWithTimeout(text, timeout) {
  return Promise.race([
    postMessage(text),
    new Promise((resolve) => setTimeout(() => resolve(false), timeout))
  ]);
}

async function postMessage(text) {
  try {
    // Validate input
    if (!text || typeof text !== 'string') {
      console.error('Invalid message text');
      return false;
    }
    
    // Find message input
    const selectors = [
      'div[contenteditable="true"]',
      '#chat-markdown-editor div[contenteditable="true"]',
      '[role="textbox"]'
    ];
    
    let messageInput = null;
    for (const selector of selectors) {
      const elem = document.querySelector(selector);
      if (elem && elem.offsetParent !== null && !elem.disabled) {
        messageInput = elem;
        break;
      }
    }
    
    if (!messageInput) {
      console.error('Could not find message input');
      return false;
    }
    
    // Focus and set text
    messageInput.focus();
    messageInput.click();
    await sleep(200);
    
    // Clear and set content
    if (messageInput.tagName === 'DIV') {
      messageInput.textContent = '';
      await sleep(100);
      messageInput.textContent = text;
      messageInput.dispatchEvent(new Event('input', {bubbles: true}));
    } else {
      messageInput.value = '';
      await sleep(100);
      messageInput.value = text;
      messageInput.dispatchEvent(new Event('input', {bubbles: true}));
    }
    
    await sleep(300);
    
    // Find and click send button
    const sendButton = document.querySelector('button[type="submit"], button[aria-label*="Send"]');
    if (sendButton && !sendButton.disabled) {
      sendButton.click();
      console.log('✅ Message posted');
      return true;
    }
    
    // Fallback: try Enter key
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      bubbles: true
    });
    messageInput.dispatchEvent(enterEvent);
    console.log('✅ Message posted (Enter key)');
    return true;
    
  } catch (error) {
    console.error('Error posting message:', error);
    return false;
  }
}

function showNotification(message, type = 'info') {
  // Clean up old notifications
  if (notifications.length >= CONFIG.MAX_NOTIFICATIONS) {
    const oldest = notifications.shift();
    if (oldest && oldest.element) {
      oldest.element.remove();
    }
  }
  
  // Create notification
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: ${20 + (notifications.length * 60)}px;
    right: 20px;
    padding: 10px 15px;
    border-radius: 5px;
    font-family: Arial, sans-serif;
    font-size: 13px;
    z-index: 10000;
    transition: opacity 0.3s;
    max-width: 250px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;
  
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
  
  // Track notification
  const notificationObj = {
    element: notification,
    timeout: setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        notification.remove();
        const index = notifications.indexOf(notificationObj);
        if (index > -1) {
          notifications.splice(index, 1);
        }
      }, 300);
    }, 3000)
  };
  
  notifications.push(notificationObj);
}

function createIndicator() {
  // Remove existing indicator
  if (indicator) {
    indicator.remove();
  }
  
  indicator = document.createElement('div');
  indicator.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #4caf50;
    color: white;
    padding: 8px 12px;
    border-radius: 20px;
    font-size: 12px;
    z-index: 9999;
    font-family: Arial, sans-serif;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  `;
  
  const status = document.createElement('span');
  status.className = 'bot-status';
  status.style.cssText = `
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: white;
  `;
  
  const text = document.createElement('span');
  text.textContent = 'QRCall Bot';
  
  indicator.appendChild(status);
  indicator.appendChild(text);
  document.body.appendChild(indicator);
}

function updateIndicator(state) {
  if (!indicator) return;
  
  const status = indicator.querySelector('.bot-status');
  const states = {
    connected: { bg: '#4caf50', dot: 'white', text: 'Connected' },
    disconnected: { bg: '#ff9800', dot: 'white', text: 'Reconnecting...' },
    error: { bg: '#f44336', dot: 'white', text: 'Error' },
    failed: { bg: '#9e9e9e', dot: 'white', text: 'Offline' }
  };
  
  const config = states[state] || states.disconnected;
  indicator.style.backgroundColor = config.bg;
  if (status) status.style.backgroundColor = config.dot;
  
  const text = indicator.querySelector('span:last-child');
  if (text) text.textContent = `QRCall Bot - ${config.text}`;
}

function setupHealthCheck() {
  // Clear existing interval
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }
  
  healthCheckInterval = setInterval(() => {
    if (socket && socket.connected) {
      console.log('Health check: Connected');
    } else {
      console.log('Health check: Not connected, attempting reconnect');
      connectWebSocket();
    }
    
    // Check memory usage (Chrome-specific)
    if (performance.memory) {
      const usedMB = performance.memory.usedJSHeapSize / 1024 / 1024;
      const limitMB = performance.memory.jsHeapSizeLimit / 1024 / 1024;
      console.log(`Memory: ${usedMB.toFixed(1)}MB / ${limitMB.toFixed(1)}MB`);
      
      // Reload if using too much memory (>100MB)
      if (usedMB > 100) {
        console.warn('High memory usage detected, considering reload');
      }
    }
  }, CONFIG.HEALTH_CHECK_INTERVAL);
}

function setupCleanupInterval() {
  setInterval(() => {
    // Clean up old notifications
    notifications = notifications.filter(n => {
      if (n.element && !document.body.contains(n.element)) {
        clearTimeout(n.timeout);
        return false;
      }
      return true;
    });
    
    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }
  }, CONFIG.CLEANUP_INTERVAL);
}

function cleanup() {
  console.log('Cleaning up bot resources...');
  isCleaningUp = true;
  
  // Clear timeouts and intervals
  clearTimeout(reconnectTimeout);
  clearInterval(healthCheckInterval);
  
  // Disconnect socket
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  
  // Remove notifications
  notifications.forEach(n => {
    if (n.element) n.element.remove();
    clearTimeout(n.timeout);
  });
  notifications = [];
  
  // Remove indicator
  if (indicator) {
    indicator.remove();
    indicator = null;
  }
  
  isCleaningUp = false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);
window.addEventListener('unload', cleanup);

// Handle visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('Page hidden, reducing activity');
  } else {
    console.log('Page visible, checking connection');
    if (socket && !socket.connected) {
      connectWebSocket();
    }
  }
});