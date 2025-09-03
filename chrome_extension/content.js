// Content script that runs on Workvivo pages
console.log('QRCall Workvivo Bot loaded');

// Check if we're on the right page
if (window.location.href.includes('1458-customer-calls')) {
  console.log('On Store 1458 chat page');
  
  // Poll server for new messages
  setInterval(checkForMessages, 5000);
}

async function checkForMessages() {
  try {
    const response = await fetch('http://34.45.52.250:5002/get_pending');
    const data = await response.json();
    
    if (data.messages && data.messages.length > 0) {
      for (const message of data.messages) {
        await postMessage(message.text);
        // Mark as posted
        await fetch('http://34.45.52.250:5002/mark_posted', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({id: message.id})
        });
      }
    }
  } catch (error) {
    console.error('Error checking messages:', error);
  }
}

async function postMessage(text) {
  // Find message input (try multiple selectors)
  const selectors = [
    'div[contenteditable="true"]',
    '#chat-markdown-editor div',
    '[role="textbox"]',
    'textarea'
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
    return false;
  }
  
  // Click to focus
  messageInput.click();
  await sleep(500);
  
  // Clear and type message
  messageInput.focus();
  
  // Try different methods to set text
  if (messageInput.tagName === 'DIV') {
    // Contenteditable div
    messageInput.innerHTML = '';
    messageInput.textContent = text;
    
    // Trigger input event
    messageInput.dispatchEvent(new Event('input', {bubbles: true}));
  } else {
    // Textarea or input
    messageInput.value = '';
    messageInput.value = text;
    
    // Trigger events
    messageInput.dispatchEvent(new Event('input', {bubbles: true}));
    messageInput.dispatchEvent(new Event('change', {bubbles: true}));
  }
  
  await sleep(1000);
  
  // Find and click send button
  const sendSelectors = [
    'button[type="submit"]',
    '.send-button',
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]'
  ];
  
  let sendButton = null;
  for (const selector of sendSelectors) {
    sendButton = document.querySelector(selector);
    if (sendButton && sendButton.offsetParent !== null) {
      break;
    }
  }
  
  if (sendButton) {
    sendButton.click();
  } else {
    // Try pressing Enter
    messageInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true
    }));
  }
  
  console.log('Posted message:', text);
  await sleep(2000);
  return true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}