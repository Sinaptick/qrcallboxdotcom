// Background script for the extension
console.log('QRCall Workvivo Bot background script loaded');

// Keep track of message posting
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'postMessage') {
    console.log('Background received message to post:', message.text);
    // Forward to content script
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'postMessage',
        text: message.text
      });
    });
  }
});